import { beforeEach, describe, expect, it } from "vitest";
import {
  AsaasHttpClient,
  FakeAsaasClient,
  asaasConfigurado,
  criarAsaasClient,
  obterFakeAsaas,
} from "./cliente";

beforeEach(() => {
  delete process.env.ASAAS_API_KEY;
  delete process.env.ASAAS_BASE_URL;
});

describe("FakeAsaasClient", () => {
  it("gera ids previsíveis e reaproveita o cliente pela referência externa", async () => {
    const f = new FakeAsaasClient();
    const a = await f.criarOuBuscarCliente({ nome: "Marta", mobilePhone: "5551999998888", externalReference: "cli-1" });
    const b = await f.criarOuBuscarCliente({ nome: "Marta X", mobilePhone: "5551000000000", externalReference: "cli-1" });
    expect(a.id).toBe("cus_fake_1");
    expect(b.id).toBe("cus_fake_1");
    expect(f.clientes).toHaveLength(1);
  });

  it("cria cobrança PIX com invoiceUrl e devolve QR consultável", async () => {
    const f = new FakeAsaasClient();
    const { id } = await f.criarOuBuscarCliente({ nome: "Marta", mobilePhone: "5551999998888" });
    const cob = await f.criarCobrancaPix({
      customerId: id,
      valorCentavos: 15000,
      vencimento: "2026-10-01",
      descricao: "Pacote",
    });
    expect(cob.id).toBe("pay_fake_1");
    expect(cob.status).toBe("PENDING");
    expect(cob.value).toBe(150);
    expect(cob.invoiceUrl).toContain("pay_fake_1");

    const qr = await f.obterQrCodePix(cob.id);
    expect(qr.payload).toContain("pay_fake_1");
    expect(qr.encodedImage.length).toBeGreaterThan(0);

    expect((await f.consultarCobranca(cob.id))?.id).toBe("pay_fake_1");
    expect(await f.consultarCobranca("nao-existe")).toBeNull();
  });
});

describe("criarAsaasClient", () => {
  it("sem ASAAS_API_KEY devolve o Fake compartilhado", () => {
    const c = criarAsaasClient();
    expect(c).toBeInstanceOf(FakeAsaasClient);
    expect(c).toBe(obterFakeAsaas());
    expect(asaasConfigurado()).toBe(false);
  });

  it("com ASAAS_API_KEY devolve o cliente HTTP", () => {
    process.env.ASAAS_API_KEY = "chave-de-teste";
    expect(criarAsaasClient()).toBeInstanceOf(AsaasHttpClient);
    expect(asaasConfigurado()).toBe(true);
  });
});

describe("AsaasHttpClient", () => {
  it("manda o header access_token e o corpo PIX correto", async () => {
    const chamadas: { url: string; init: RequestInit }[] = [];
    const original = globalThis.fetch;
    globalThis.fetch = (async (url: string, init: RequestInit) => {
      chamadas.push({ url: String(url), init });
      return new Response(JSON.stringify({ id: "pay_1", status: "PENDING", invoiceUrl: "u", value: 150 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    try {
      const c = new AsaasHttpClient("k123", "https://sandbox.asaas.com/api/v3");
      const r = await c.criarCobrancaPix({
        customerId: "cus_1",
        valorCentavos: 15000,
        vencimento: "2026-10-01",
        descricao: "Pacote",
        referenciaExterna: "pag-1",
      });
      expect(r.id).toBe("pay_1");
      const [{ url, init }] = chamadas;
      expect(url).toBe("https://sandbox.asaas.com/api/v3/payments");
      expect((init.headers as Record<string, string>).access_token).toBe("k123");
      const body = JSON.parse(String(init.body));
      expect(body).toMatchObject({ billingType: "PIX", value: 150, dueDate: "2026-10-01", customer: "cus_1" });
    } finally {
      globalThis.fetch = original;
    }
  });
});
