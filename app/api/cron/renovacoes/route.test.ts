import { beforeEach, describe, expect, it, vi } from "vitest";
import { resetIds, type Store } from "@/lib/asaas/_fake-supabase";
import { DESCRICAO_RENOVACAO_PREFIXO } from "@/lib/asaas/cobranca";
import { dataSP, somarDias } from "@/lib/telegram/_local";
import { obterFakeWhatsApp } from "@/lib/whatsapp/cliente";

const ctx = vi.hoisted(() => ({ store: {} as Record<string, Record<string, unknown>[]> }));

vi.mock("@/lib/supabase/admin", async () => {
  const { criarFakeSupabase } = await import("@/lib/asaas/_fake-supabase");
  return { createAdminClient: () => criarFakeSupabase(ctx.store) };
});

import { GET } from "./route";

const SEGREDO = "cron-secreto";

function req(token: string | null = SEGREDO): Request {
  const headers: Record<string, string> = {};
  if (token !== null) headers.authorization = `Bearer ${token}`;
  return new Request("https://exemplo.test/api/cron/renovacoes", { headers });
}

function novoStore(validoAte: string): Store {
  return {
    cliente: [
      { id: "cli-1", nome: "Marta", whatsapp: "5551999998888", email: null, cpf: null },
    ],
    plano: [
      { id: "pln-1", nome: "Frequente 8h", horas: 8, valor_centavos: 90000, tipo: "pacote_mensal" },
      { id: "pln-2", nome: "Avulso", horas: 2, valor_centavos: 30000, tipo: "avulso" },
    ],
    pacote: [
      {
        id: "pac-1",
        cliente_id: "cli-1",
        plano_id: "pln-1",
        horas_contratadas: 8,
        horas_usadas: 2,
        valido_de: somarDias(validoAte, -29),
        valido_ate: validoAte,
        status: "ativo",
      },
    ],
    pagamento: [],
    evento: [],
    configuracao: [],
  };
}

beforeEach(() => {
  resetIds();
  delete process.env.ASAAS_API_KEY;
  process.env.CRON_SECRET = SEGREDO;
  obterFakeWhatsApp().envios.length = 0;
});

describe("GET /api/cron/renovacoes", () => {
  it("401 sem o Bearer CRON_SECRET", async () => {
    ctx.store = novoStore(somarDias(dataSP(), 2));
    expect((await GET(req(null))).status).toBe(401);
    expect((await GET(req("errado"))).status).toBe(401);
  });

  it("gera a cobrança de renovação e avisa o cliente", async () => {
    ctx.store = novoStore(somarDias(dataSP(), 2));

    const r = await GET(req());
    expect(await r.json()).toMatchObject({ ok: true, cobrancas: 1, expirados: 0 });

    const pag = ctx.store.pagamento[0];
    expect(String(pag.descricao)).toBe(`${DESCRICAO_RENOVACAO_PREFIXO}Frequente 8h`);
    expect(pag.pacote_id).toBe("pac-1");
    expect(pag.status).toBe("pendente");
    expect(pag.valor_centavos).toBe(90000);
    expect(pag.asaas_id).toBeTruthy();
    expect(pag.pix_copia_cola).toBeTruthy();

    expect(obterFakeWhatsApp().envios.at(-1)?.para).toBe("5551999998888");
    expect(ctx.store.evento.some((e) => e.tipo === "renovacao.cobranca_gerada")).toBe(true);
  });

  it("é idempotente: a segunda rodada não gera outra cobrança", async () => {
    ctx.store = novoStore(somarDias(dataSP(), 2));
    await GET(req());
    const r = await GET(req());
    expect(await r.json()).toMatchObject({ cobrancas: 0 });
    expect(ctx.store.pagamento).toHaveLength(1);
  });

  it("ignora pacotes que ainda estão longe do vencimento", async () => {
    ctx.store = novoStore(somarDias(dataSP(), 20));
    const r = await GET(req());
    expect(await r.json()).toMatchObject({ cobrancas: 0 });
    expect(ctx.store.pagamento).toHaveLength(0);
  });

  it("respeita renovacao_aviso_dias da configuração", async () => {
    ctx.store = novoStore(somarDias(dataSP(), 8));
    ctx.store.configuracao.push({ chave: "renovacao_aviso_dias", valor: "10" });
    const r = await GET(req());
    expect(await r.json()).toMatchObject({ aviso_dias: 10, cobrancas: 1 });
  });

  it("expira pacote vencido sem pagamento", async () => {
    ctx.store = novoStore(somarDias(dataSP(), -1));
    const r = await GET(req());
    expect(await r.json()).toMatchObject({
      cobrancas: 0,
      expirados: 1,
      expirados_sem_renovacao: 1,
    });
    expect(ctx.store.pacote[0].status).toBe("expirado");
    const ev = ctx.store.evento.find((e) => e.tipo === "pacote.expirado")!;
    expect((ev.payload as { renovado: boolean }).renovado).toBe(false);
  });

  it("pacote vencido com renovação paga expira sem contar como abandono", async () => {
    ctx.store = novoStore(somarDias(dataSP(), -1));
    ctx.store.pagamento.push({
      id: "pag-ren",
      cliente_id: "cli-1",
      pacote_id: "pac-1",
      valor_centavos: 90000,
      status: "pago",
      pago_em: new Date().toISOString(),
      descricao: `${DESCRICAO_RENOVACAO_PREFIXO}Frequente 8h`,
      asaas_id: "pay_x",
    });

    const r = await GET(req());
    expect(await r.json()).toMatchObject({ expirados: 1, expirados_sem_renovacao: 0 });
    expect(ctx.store.pacote[0].status).toBe("expirado");
  });

  it("não mexe em pacote de plano avulso", async () => {
    ctx.store = novoStore(somarDias(dataSP(), 2));
    ctx.store.pacote[0].plano_id = "pln-2";
    const r = await GET(req());
    expect(await r.json()).toMatchObject({ cobrancas: 0, expirados: 0 });
    expect(ctx.store.pagamento).toHaveLength(0);
  });
});
