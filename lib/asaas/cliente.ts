/**
 * Contrato do cliente Asaas (cobrança PIX).
 * Real: REST v3 (header `access_token`, base em ASAAS_BASE_URL).
 * Sem ASAAS_API_KEY → Fake compartilhado em memória (dev e testes; nunca faz HTTP).
 */

export interface AsaasClienteEntrada {
  nome: string;
  cpfCnpj?: string | null;
  mobilePhone: string;
  email?: string | null;
  /** Id interno do cliente — usado como chave idempotente de busca no Asaas. */
  externalReference?: string | null;
}

export interface AsaasClienteSaida {
  id: string;
}

export interface AsaasCobrancaEntrada {
  customerId: string;
  valorCentavos: number;
  /** ISO 'YYYY-MM-DD'. */
  vencimento: string;
  descricao?: string | null;
  referenciaExterna?: string | null;
}

export interface AsaasCobrancaSaida {
  id: string;
  status: string;
  invoiceUrl: string | null;
  value?: number;
  dueDate?: string | null;
}

export interface AsaasQrCode {
  encodedImage: string;
  payload: string;
  expirationDate: string | null;
}

export interface AsaasClient {
  criarOuBuscarCliente(entrada: AsaasClienteEntrada): Promise<AsaasClienteSaida>;
  criarCobrancaPix(entrada: AsaasCobrancaEntrada): Promise<AsaasCobrancaSaida>;
  obterQrCodePix(paymentId: string): Promise<AsaasQrCode>;
  consultarCobranca(id: string): Promise<AsaasCobrancaSaida | null>;
}

const somenteDigitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "");

/* -------------------------------------------------------------------------- */
/* Fake (memória, ids previsíveis)                                             */
/* -------------------------------------------------------------------------- */

export class FakeAsaasClient implements AsaasClient {
  clientes: (AsaasClienteEntrada & { id: string })[] = [];
  cobrancas: (AsaasCobrancaEntrada & AsaasCobrancaSaida)[] = [];
  private seqCliente = 0;
  private seqCobranca = 0;

  limpar() {
    this.clientes = [];
    this.cobrancas = [];
    this.seqCliente = 0;
    this.seqCobranca = 0;
  }

  async criarOuBuscarCliente(entrada: AsaasClienteEntrada): Promise<AsaasClienteSaida> {
    const ref = entrada.externalReference ?? null;
    const fone = somenteDigitos(entrada.mobilePhone);
    const achado = this.clientes.find(
      (c) =>
        (ref && c.externalReference === ref) ||
        (!ref && somenteDigitos(c.mobilePhone) === fone),
    );
    if (achado) return { id: achado.id };
    this.seqCliente += 1;
    const id = `cus_fake_${this.seqCliente}`;
    this.clientes.push({ ...entrada, id });
    return { id };
  }

  async criarCobrancaPix(entrada: AsaasCobrancaEntrada): Promise<AsaasCobrancaSaida> {
    this.seqCobranca += 1;
    const id = `pay_fake_${this.seqCobranca}`;
    const cob = {
      ...entrada,
      id,
      status: "PENDING",
      invoiceUrl: `https://fake.asaas.com/i/${id}`,
      value: entrada.valorCentavos / 100,
      dueDate: entrada.vencimento,
    };
    this.cobrancas.push(cob);
    return { id, status: cob.status, invoiceUrl: cob.invoiceUrl, value: cob.value, dueDate: cob.dueDate };
  }

  async obterQrCodePix(paymentId: string): Promise<AsaasQrCode> {
    return {
      encodedImage: `iVBORw0KGgoFAKE${paymentId}`,
      payload: `00020126FAKEPIX${paymentId}5204000053039865802BR`,
      expirationDate: null,
    };
  }

  async consultarCobranca(id: string): Promise<AsaasCobrancaSaida | null> {
    const c = this.cobrancas.find((x) => x.id === id);
    return c ? { id: c.id, status: c.status, invoiceUrl: c.invoiceUrl, value: c.value, dueDate: c.dueDate } : null;
  }
}

/* -------------------------------------------------------------------------- */
/* HTTP (Asaas API v3)                                                         */
/* -------------------------------------------------------------------------- */

export class AsaasHttpClient implements AsaasClient {
  constructor(
    private apiKey: string,
    private baseUrl = "https://sandbox.asaas.com/api/v3",
  ) {}

  private url(rota: string) {
    return `${this.baseUrl.replace(/\/$/, "")}/${rota.replace(/^\//, "")}`;
  }

  private async req<T>(rota: string, init?: RequestInit): Promise<T> {
    const r = await fetch(this.url(rota), {
      ...init,
      headers: {
        access_token: this.apiKey,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
    const json = (await r.json().catch(() => ({}))) as T & {
      errors?: { description?: string }[];
    };
    if (!r.ok) {
      const msg = json?.errors?.[0]?.description ?? `HTTP ${r.status}`;
      throw new Error(`[asaas] ${rota}: ${msg}`);
    }
    return json as T;
  }

  async criarOuBuscarCliente(entrada: AsaasClienteEntrada): Promise<AsaasClienteSaida> {
    const ref = entrada.externalReference ?? null;
    if (ref) {
      const busca = await this.req<{ data?: { id: string }[] }>(
        `customers?externalReference=${encodeURIComponent(ref)}&limit=1`,
      );
      const achado = busca.data?.[0];
      if (achado?.id) return { id: achado.id };
    }
    const criado = await this.req<{ id: string }>("customers", {
      method: "POST",
      body: JSON.stringify({
        name: entrada.nome,
        cpfCnpj: somenteDigitos(entrada.cpfCnpj) || undefined,
        mobilePhone: somenteDigitos(entrada.mobilePhone) || undefined,
        email: entrada.email ?? undefined,
        externalReference: ref ?? undefined,
        notificationDisabled: true,
      }),
    });
    return { id: criado.id };
  }

  async criarCobrancaPix(entrada: AsaasCobrancaEntrada): Promise<AsaasCobrancaSaida> {
    const r = await this.req<{ id: string; status: string; invoiceUrl?: string; value?: number; dueDate?: string }>(
      "payments",
      {
        method: "POST",
        body: JSON.stringify({
          customer: entrada.customerId,
          billingType: "PIX",
          value: Number((entrada.valorCentavos / 100).toFixed(2)),
          dueDate: entrada.vencimento,
          description: entrada.descricao ?? undefined,
          externalReference: entrada.referenciaExterna ?? undefined,
        }),
      },
    );
    return { id: r.id, status: r.status, invoiceUrl: r.invoiceUrl ?? null, value: r.value, dueDate: r.dueDate ?? null };
  }

  async obterQrCodePix(paymentId: string): Promise<AsaasQrCode> {
    const r = await this.req<{ encodedImage?: string; payload?: string; expirationDate?: string }>(
      `payments/${encodeURIComponent(paymentId)}/pixQrCode`,
    );
    return {
      encodedImage: r.encodedImage ?? "",
      payload: r.payload ?? "",
      expirationDate: r.expirationDate ?? null,
    };
  }

  async consultarCobranca(id: string): Promise<AsaasCobrancaSaida | null> {
    try {
      const r = await this.req<{ id: string; status: string; invoiceUrl?: string; value?: number; dueDate?: string }>(
        `payments/${encodeURIComponent(id)}`,
      );
      return { id: r.id, status: r.status, invoiceUrl: r.invoiceUrl ?? null, value: r.value, dueDate: r.dueDate ?? null };
    } catch {
      return null;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Fábrica                                                                     */
/* -------------------------------------------------------------------------- */

let fakeSingleton: FakeAsaasClient | null = null;

export function criarAsaasClient(): AsaasClient {
  const key = process.env.ASAAS_API_KEY;
  if (key) {
    return new AsaasHttpClient(
      key,
      process.env.ASAAS_BASE_URL || "https://sandbox.asaas.com/api/v3",
    );
  }
  if (!fakeSingleton) fakeSingleton = new FakeAsaasClient();
  return fakeSingleton;
}

/** Fake compartilhado (mesma instância que `criarAsaasClient()` devolve sem key). */
export function obterFakeAsaas(): FakeAsaasClient {
  if (!fakeSingleton) fakeSingleton = new FakeAsaasClient();
  return fakeSingleton;
}

export function asaasConfigurado(): boolean {
  return Boolean(process.env.ASAAS_API_KEY);
}
