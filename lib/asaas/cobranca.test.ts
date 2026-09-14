import { beforeEach, describe, expect, it } from "vitest";
import { criarFakeSupabase, resetIds, type Store } from "./_fake-supabase";
import { FakeAsaasClient } from "./cliente";
import { enviarCobranca, gerarCobrancaPix, type PagamentoCobranca } from "./cobranca";
import { obterFakeWhatsApp } from "@/lib/whatsapp/cliente";
import { obterFakeEmail } from "@/lib/email/cliente";

type Db = Parameters<typeof gerarCobrancaPix>[0]["db"];

const CLIENTE = {
  id: "cli-1",
  nome: "Marta",
  whatsapp: "5551999998888",
  email: "marta@exemplo.com",
  cpf: null,
};

function ambiente() {
  const store: Store = {
    cliente: [{ ...CLIENTE }],
    pagamento: [],
    evento: [],
    configuracao: [],
  };
  const db = criarFakeSupabase(store) as unknown as Db;
  return { store, db, asaas: new FakeAsaasClient() };
}

beforeEach(() => {
  resetIds();
  delete process.env.ASAAS_API_KEY;
  obterFakeWhatsApp().envios.length = 0;
  obterFakeEmail().envios.length = 0;
});

describe("gerarCobrancaPix", () => {
  it("grava asaas_id, QR, copia-e-cola e link no pagamento", async () => {
    const { store, db, asaas } = ambiente();

    const r = await gerarCobrancaPix({
      cliente: CLIENTE,
      valorCentavos: 15000,
      vencimento: "2026-10-01",
      descricao: "Pacote Frequente",
      db,
      asaas,
    });

    expect(r.ok).toBe(true);
    const p = r.pagamento!;
    expect(p.asaas_id).toBe("pay_fake_1");
    expect(p.pix_copia_cola).toContain("FAKEPIX");
    expect(p.pix_qrcode_base64).toContain("iVBORw0KGgo");
    expect(p.link_pagamento).toBe("https://fake.asaas.com/i/pay_fake_1");
    expect(p.status).toBe("pendente");
    expect(p.meio).toBe("pix");

    const linha = store.pagamento[0];
    expect(linha.referencia_externa).toBe("pay_fake_1");
    expect(linha.valor_centavos).toBe(15000);
    expect(store.evento.some((e) => e.tipo === "cobranca.asaas.gerada")).toBe(true);
  });

  it("vincula o pacote quando informado", async () => {
    const { db, asaas } = ambiente();
    const r = await gerarCobrancaPix({
      cliente: CLIENTE,
      pacote: { id: "pac-1" },
      valorCentavos: 9000,
      vencimento: "2026-10-01",
      db,
      asaas,
    });
    expect(r.pagamento?.pacote_id).toBe("pac-1");
  });

  it("não cria segunda cobrança Asaas para um pagamento já pendente", async () => {
    const { db, asaas } = ambiente();
    const primeira = await gerarCobrancaPix({
      cliente: CLIENTE,
      valorCentavos: 9000,
      vencimento: "2026-10-01",
      db,
      asaas,
    });

    const segunda = await gerarCobrancaPix({
      cliente: CLIENTE,
      valorCentavos: 9000,
      vencimento: "2026-10-01",
      pagamentoId: primeira.pagamento!.id,
      db,
      asaas,
    });

    expect(segunda.ok).toBe(true);
    expect(segunda.reaproveitado).toBe(true);
    expect(segunda.pagamento?.asaas_id).toBe("pay_fake_1");
    expect(asaas.cobrancas).toHaveLength(1);
  });

  it("atualiza um pagamento manual existente que ainda não tem asaas_id", async () => {
    const { store, db, asaas } = ambiente();
    store.pagamento.push({
      id: "pag-manual",
      cliente_id: CLIENTE.id,
      pacote_id: null,
      atendimento_id: null,
      valor_centavos: 12000,
      meio: "pix",
      status: "pendente",
      vencimento: "2026-10-05",
      descricao: "Consulta",
      asaas_id: null,
      pix_qrcode_base64: null,
      pix_copia_cola: null,
      link_pagamento: null,
    });

    const r = await gerarCobrancaPix({
      cliente: CLIENTE,
      valorCentavos: 12000,
      vencimento: "2026-10-05",
      pagamentoId: "pag-manual",
      db,
      asaas,
    });

    expect(r.ok).toBe(true);
    expect(store.pagamento).toHaveLength(1);
    expect(store.pagamento[0].asaas_id).toBe("pay_fake_1");
    expect(store.pagamento[0].descricao).toBe("Consulta");
  });

  it("recusa reabrir uma cobrança já paga", async () => {
    const { store, db, asaas } = ambiente();
    store.pagamento.push({
      id: "pag-pago",
      cliente_id: CLIENTE.id,
      pacote_id: null,
      atendimento_id: null,
      valor_centavos: 12000,
      meio: "pix",
      status: "pago",
      vencimento: "2026-10-05",
      descricao: "Consulta",
      asaas_id: "pay_antigo",
      pix_qrcode_base64: null,
      pix_copia_cola: null,
      link_pagamento: null,
    });

    const r = await gerarCobrancaPix({
      cliente: CLIENTE,
      valorCentavos: 12000,
      vencimento: "2026-10-05",
      pagamentoId: "pag-pago",
      db,
      asaas,
    });

    expect(r.ok).toBe(false);
    expect(store.pagamento[0].status).toBe("pago");
    expect(asaas.cobrancas).toHaveLength(0);
  });

  it("devolve erro quando o pagamento informado não existe", async () => {
    const { db, asaas } = ambiente();
    const r = await gerarCobrancaPix({
      cliente: CLIENTE,
      valorCentavos: 100,
      vencimento: "2026-10-05",
      pagamentoId: "nao-existe",
      db,
      asaas,
    });
    expect(r.ok).toBe(false);
  });
});

describe("enviarCobranca", () => {
  async function cobranca(db: Db, asaas: FakeAsaasClient): Promise<PagamentoCobranca> {
    const r = await gerarCobrancaPix({
      cliente: CLIENTE,
      valorCentavos: 15000,
      vencimento: "2026-10-01",
      descricao: "Pacote Frequente",
      db,
      asaas,
    });
    return r.pagamento!;
  }

  it("manda texto no WhatsApp com valor e copia-e-cola", async () => {
    const { db, asaas, store } = ambiente();
    const p = await cobranca(db, asaas);

    const r = await enviarCobranca(p, "whatsapp", { db });

    expect(r.ok).toBe(true);
    expect(r.whatsapp).toBe(true);
    const envio = obterFakeWhatsApp().envios.at(-1)!;
    expect(envio.para).toBe(CLIENTE.whatsapp);
    expect(envio.texto).toContain("R$");
    expect(envio.texto).toContain(p.pix_copia_cola!);
    expect(envio.texto).toContain("01/10/2026");
    expect(store.evento.some((e) => e.tipo === "cobranca.enviada")).toBe(true);
  });

  it("manda e-mail com o QR embutido em base64", async () => {
    const { db, asaas } = ambiente();
    const p = await cobranca(db, asaas);

    const r = await enviarCobranca(p, "email", { db });

    expect(r.email).toBe(true);
    const mail = obterFakeEmail().envios.at(-1)!;
    expect(mail.para).toBe(CLIENTE.email);
    expect(mail.html).toContain(`data:image/png;base64,${p.pix_qrcode_base64}`);
    expect(mail.html).toContain(p.pix_copia_cola!);
  });

  it("'ambos' usa os dois canais", async () => {
    const { db, asaas } = ambiente();
    const p = await cobranca(db, asaas);
    const r = await enviarCobranca(p, "ambos", { db });
    expect(r.whatsapp).toBe(true);
    expect(r.email).toBe(true);
  });

  it("usa o template configurado quando existe", async () => {
    const { db, asaas, store } = ambiente();
    store.configuracao.push({
      chave: "template_cobranca_pix",
      valor: "Oi {nome}, {valor} — chave {chave_pix} — cola: {pix_copia_cola}",
    });
    store.configuracao.push({ chave: "chave_pix", valor: "voucontigo@pix" });
    const p = await cobranca(db, asaas);

    await enviarCobranca(p, "whatsapp", { db });
    const envio = obterFakeWhatsApp().envios.at(-1)!;
    expect(envio.texto).toContain("Oi Marta");
    expect(envio.texto).toContain("voucontigo@pix");
    expect(envio.texto).not.toContain("{");
  });

  it("não quebra quando o cliente não tem e-mail", async () => {
    const { db, asaas, store } = ambiente();
    store.cliente[0].email = null;
    const p = await cobranca(db, asaas);
    const r = await enviarCobranca(p, "email", { db });
    expect(r.email).toBe(false);
    expect(obterFakeEmail().envios).toHaveLength(0);
  });
});
