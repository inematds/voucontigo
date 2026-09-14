import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetIds, type Store } from "@/lib/asaas/_fake-supabase";
import { DESCRICAO_RENOVACAO_PREFIXO } from "@/lib/asaas/cobranca";

const ctx = vi.hoisted(() => ({ store: {} as Record<string, Record<string, unknown>[]> }));

vi.mock("@/lib/supabase/admin", async () => {
  const { criarFakeSupabase } = await import("@/lib/asaas/_fake-supabase");
  return { createAdminClient: () => criarFakeSupabase(ctx.store) };
});

import { POST } from "./webhook/route";

const TOKEN = "segredo-asaas";

function novoStore(): Store {
  return {
    cliente: [{ id: "cli-1", nome: "Marta", whatsapp: "5551999998888", email: null, cpf: null }],
    plano: [{ id: "pln-1", nome: "Frequente 8h", horas: 8, valor_centavos: 90000, tipo: "pacote_mensal" }],
    pacote: [],
    pagamento: [],
    evento: [],
    webhook_processado: [],
    configuracao: [],
  };
}

function req(corpo: unknown, token: string | null = TOKEN): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token !== null) headers["asaas-access-token"] = token;
  return new Request("https://exemplo.test/api/asaas/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify(corpo),
  });
}

function pagamentoPendente(extra: Record<string, unknown> = {}) {
  return {
    id: "pag-1",
    cliente_id: "cli-1",
    pacote_id: null,
    atendimento_id: null,
    valor_centavos: 15000,
    meio: "pix",
    status: "pendente",
    vencimento: "2026-10-01",
    pago_em: null,
    descricao: "Pacote Frequente",
    asaas_id: "pay_1",
    ...extra,
  };
}

beforeEach(() => {
  resetIds();
  process.env.ASAAS_WEBHOOK_TOKEN = TOKEN;
  ctx.store = novoStore();
});

describe("POST /api/asaas/webhook", () => {
  it("401 sem o header asaas-access-token", async () => {
    const r = await POST(req({ id: "evt_1", event: "PAYMENT_RECEIVED" }, null));
    expect(r.status).toBe(401);
  });

  it("401 com token errado", async () => {
    const r = await POST(req({ id: "evt_1", event: "PAYMENT_RECEIVED" }, "errado"));
    expect(r.status).toBe(401);
  });

  it("PAYMENT_RECEIVED marca o pagamento como pago", async () => {
    ctx.store.pagamento.push(pagamentoPendente());

    const r = await POST(
      req({ id: "evt_1", event: "PAYMENT_RECEIVED", payment: { id: "pay_1", paymentDate: "2026-09-20" } }),
    );

    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ ok: true, pago: true });
    const p = ctx.store.pagamento[0];
    expect(p.status).toBe("pago");
    expect(p.pago_em).toBeTruthy();
    expect(ctx.store.evento.some((e) => e.tipo === "pagamento.pago")).toBe(true);
  });

  it("PAYMENT_CONFIRMED também marca pago", async () => {
    ctx.store.pagamento.push(pagamentoPendente());
    await POST(req({ id: "evt_c", event: "PAYMENT_CONFIRMED", payment: { id: "pay_1" } }));
    expect(ctx.store.pagamento[0].status).toBe("pago");
  });

  it("evento duplicado é processado uma vez só", async () => {
    ctx.store.pagamento.push(pagamentoPendente());
    const corpo = { id: "evt_1", event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } };

    const a = await POST(req(corpo));
    const b = await POST(req(corpo));

    expect(await a.json()).toMatchObject({ pago: true });
    expect(await b.json()).toMatchObject({ duplicado: true });
    expect(b.status).toBe(200);
    expect(ctx.store.webhook_processado).toHaveLength(1);
    expect(ctx.store.evento.filter((e) => e.tipo === "pagamento.pago")).toHaveLength(1);
  });

  it("RECEIVED e CONFIRMED (ids diferentes) não duplicam o efeito", async () => {
    ctx.store.pagamento.push(pagamentoPendente());
    await POST(req({ id: "evt_r", event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } }));
    const segundo = await POST(req({ id: "evt_c", event: "PAYMENT_CONFIRMED", payment: { id: "pay_1" } }));

    expect(await segundo.json()).toMatchObject({ jaPago: true });
    expect(ctx.store.evento.filter((e) => e.tipo === "pagamento.pago")).toHaveLength(1);
  });

  it("PAYMENT_OVERDUE grava evento e mantém pendente", async () => {
    ctx.store.pagamento.push(pagamentoPendente());
    const r = await POST(req({ id: "evt_o", event: "PAYMENT_OVERDUE", payment: { id: "pay_1" } }));
    expect(await r.json()).toMatchObject({ vencido: true });
    expect(ctx.store.pagamento[0].status).toBe("pendente");
    expect(ctx.store.evento.some((e) => e.tipo === "pagamento.vencido")).toBe(true);
  });

  it("PAYMENT_DELETED e PAYMENT_REFUNDED cancelam", async () => {
    ctx.store.pagamento.push(pagamentoPendente());
    const r = await POST(req({ id: "evt_d", event: "PAYMENT_DELETED", payment: { id: "pay_1" } }));
    expect(await r.json()).toMatchObject({ cancelado: true });
    expect(ctx.store.pagamento[0].status).toBe("cancelado");
  });

  it("PAYMENT_REFUNDED cancela mesmo uma cobrança já paga", async () => {
    ctx.store.pagamento.push(
      pagamentoPendente({ status: "pago", pago_em: "2026-09-20T12:00:00Z" }),
    );
    const r = await POST(req({ id: "evt_ref", event: "PAYMENT_REFUNDED", payment: { id: "pay_1" } }));
    expect(await r.json()).toMatchObject({ cancelado: true, estorno: true });
    expect(ctx.store.pagamento[0].status).toBe("cancelado");
    expect(ctx.store.evento.some((e) => e.tipo === "pagamento.estornado")).toBe(true);
  });

  it("PAYMENT_DELETED não derruba uma cobrança já paga", async () => {
    ctx.store.pagamento.push(
      pagamentoPendente({ status: "pago", pago_em: "2026-09-20T12:00:00Z" }),
    );
    await POST(req({ id: "evt_del", event: "PAYMENT_DELETED", payment: { id: "pay_1" } }));
    expect(ctx.store.pagamento[0].status).toBe("pago");
  });

  it("renovação paga cria o pacote seguinte (30 dias a partir do fim do atual)", async () => {
    ctx.store.pacote.push({
      id: "pac-1",
      cliente_id: "cli-1",
      plano_id: "pln-1",
      horas_contratadas: 8,
      horas_usadas: 3,
      valido_de: "2026-09-01",
      valido_ate: "2026-09-30",
      status: "ativo",
    });
    ctx.store.pagamento.push(
      pagamentoPendente({
        pacote_id: "pac-1",
        descricao: `${DESCRICAO_RENOVACAO_PREFIXO}Frequente 8h`,
      }),
    );

    const r = await POST(req({ id: "evt_1", event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } }));
    const corpo = (await r.json()) as { pacote_novo: string | null };
    expect(corpo.pacote_novo).toBeTruthy();

    const novo = ctx.store.pacote.find((p) => p.id === corpo.pacote_novo)!;
    expect(novo.valido_de).toBe("2026-10-01");
    expect(novo.valido_ate).toBe("2026-10-30");
    expect(novo.status).toBe("ativo");
    expect(novo.horas_contratadas).toBe(8);
    expect(novo.horas_usadas).toBe(0);
    expect(ctx.store.evento.some((e) => e.tipo === "pacote.renovado")).toBe(true);
  });

  it("pagamento comum ligado a pacote NÃO gera renovação", async () => {
    ctx.store.pacote.push({
      id: "pac-1",
      cliente_id: "cli-1",
      plano_id: "pln-1",
      horas_contratadas: 8,
      horas_usadas: 0,
      valido_de: "2026-09-01",
      valido_ate: "2026-09-30",
      status: "ativo",
    });
    ctx.store.pagamento.push(pagamentoPendente({ pacote_id: "pac-1", descricao: "Pacote Frequente 8h" }));

    await POST(req({ id: "evt_1", event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } }));
    expect(ctx.store.pacote).toHaveLength(1);
  });

  it("pagamento desconhecido responde 200 e registra órfão", async () => {
    const r = await POST(req({ id: "evt_x", event: "PAYMENT_RECEIVED", payment: { id: "pay_nao_existe" } }));
    expect(r.status).toBe(200);
    expect(ctx.store.evento.some((e) => e.tipo === "asaas.webhook.orfao")).toBe(true);
  });

  it("evento desconhecido responde 200 sem efeito", async () => {
    ctx.store.pagamento.push(pagamentoPendente());
    const r = await POST(req({ id: "evt_z", event: "PAYMENT_CREATED", payment: { id: "pay_1" } }));
    expect(await r.json()).toMatchObject({ ignorado: "PAYMENT_CREATED" });
    expect(ctx.store.pagamento[0].status).toBe("pendente");
  });
});
