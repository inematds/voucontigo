/**
 * Contrato do cliente de envio WhatsApp.
 * Provedor padrão: EVOLUTION API (número comum conectado por QR, self-hosted; texto livre a qualquer hora).
 * Alternativa: Meta Cloud API (fora da janela de 24h exige TEMPLATE aprovado).
 * Seleção por env WHATSAPP_PROVIDER = evolution | meta (default evolution).
 * No Evolution, `enviarTemplate` vira texto livre renderizado pelo chamador (params ignorados) e
 * `enviarBotoes` vira menu numerado em texto — o fluxo do bot deve aceitar resposta por número.
 */

export interface BotaoWhatsApp {
  id: string;
  titulo: string; // máx. 20 caracteres
}

export interface ResultadoEnvio {
  ok: boolean;
  wa_message_id: string | null;
  erro?: string;
}

export interface WhatsAppClient {
  enviarTexto(para: string, texto: string): Promise<ResultadoEnvio>;
  /** `params` na ordem dos {{1}}, {{2}}... do corpo do template. */
  enviarTemplate(para: string, nomeTemplate: string, params: string[], idioma?: string): Promise<ResultadoEnvio>;
  enviarBotoes(para: string, texto: string, botoes: BotaoWhatsApp[]): Promise<ResultadoEnvio>;
}

export interface EnvioRegistrado {
  tipo: "texto" | "template" | "botoes";
  para: string;
  texto?: string;
  template?: string;
  params?: string[];
  botoes?: BotaoWhatsApp[];
}

/** Implementação em memória para testes e para rodar sem credenciais. */
export class FakeWhatsAppClient implements WhatsAppClient {
  envios: EnvioRegistrado[] = [];
  private seq = 0;
  private ok(): ResultadoEnvio {
    this.seq += 1;
    return { ok: true, wa_message_id: `wamid.fake.${this.seq}` };
  }
  async enviarTexto(para: string, texto: string) {
    this.envios.push({ tipo: "texto", para, texto });
    return this.ok();
  }
  async enviarTemplate(para: string, template: string, params: string[]) {
    this.envios.push({ tipo: "template", para, template, params });
    return this.ok();
  }
  async enviarBotoes(para: string, texto: string, botoes: BotaoWhatsApp[]) {
    this.envios.push({ tipo: "botoes", para, texto, botoes });
    return this.ok();
  }
}

export class MetaWhatsAppClient implements WhatsAppClient {
  constructor(
    private token: string,
    private phoneNumberId: string,
    private versao = "v21.0",
  ) {}

  private async post(payload: Record<string, unknown>): Promise<ResultadoEnvio> {
    try {
      const r = await fetch(
        `https://graph.facebook.com/${this.versao}/${this.phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
        },
      );
      const json = (await r.json().catch(() => ({}))) as {
        messages?: { id: string }[];
        error?: { message?: string };
      };
      if (!r.ok) return { ok: false, wa_message_id: null, erro: json.error?.message ?? `HTTP ${r.status}` };
      return { ok: true, wa_message_id: json.messages?.[0]?.id ?? null };
    } catch (e) {
      return { ok: false, wa_message_id: null, erro: e instanceof Error ? e.message : String(e) };
    }
  }

  enviarTexto(para: string, texto: string) {
    return this.post({ to: para, type: "text", text: { body: texto, preview_url: false } });
  }

  enviarTemplate(para: string, nome: string, params: string[], idioma = "pt_BR") {
    return this.post({
      to: para,
      type: "template",
      template: {
        name: nome,
        language: { code: idioma },
        components: params.length
          ? [{ type: "body", parameters: params.map((p) => ({ type: "text", text: p })) }]
          : [],
      },
    });
  }

  enviarBotoes(para: string, texto: string, botoes: BotaoWhatsApp[]) {
    return this.post({
      to: para,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: texto },
        action: {
          buttons: botoes.slice(0, 3).map((b) => ({
            type: "reply",
            reply: { id: b.id, title: b.titulo.slice(0, 20) },
          })),
        },
      },
    });
  }
}

/** Evolution API v2 (https://doc.evolution-api.com). Header `apikey`, rota por instância. */
export class EvolutionWhatsAppClient implements WhatsAppClient {
  constructor(
    private baseUrl: string,
    private apiKey: string,
    private instance: string,
  ) {}

  private async post(rota: string, payload: Record<string, unknown>): Promise<ResultadoEnvio> {
    try {
      const r = await fetch(`${this.baseUrl.replace(/\/$/, "")}/${rota}/${this.instance}`, {
        method: "POST",
        headers: { apikey: this.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await r.json().catch(() => ({}))) as {
        key?: { id?: string };
        message?: string;
        response?: { message?: unknown };
      };
      if (!r.ok) {
        const erro = typeof json.message === "string" ? json.message : `HTTP ${r.status}`;
        return { ok: false, wa_message_id: null, erro };
      }
      return { ok: true, wa_message_id: json.key?.id ?? null };
    } catch (e) {
      return { ok: false, wa_message_id: null, erro: e instanceof Error ? e.message : String(e) };
    }
  }

  enviarTexto(para: string, texto: string) {
    return this.post("message/sendText", { number: para, text: texto });
  }

  /** Evolution não tem templates: o texto já vem renderizado em `nomeTemplate`; params são ignorados. */
  enviarTemplate(para: string, textoRenderizado: string) {
    return this.enviarTexto(para, textoRenderizado);
  }

  /** Botões nativos são instáveis no WhatsApp comum: manda menu numerado em texto. */
  enviarBotoes(para: string, texto: string, botoes: BotaoWhatsApp[]) {
    const menu = botoes.map((b, i) => `${i + 1}. ${b.titulo}`).join("\n");
    return this.enviarTexto(para, `${texto}\n\n${menu}\n\nResponda com o número da opção.`);
  }
}

let fakeSingleton: FakeWhatsAppClient | null = null;

/** Meta se houver credenciais; senão um Fake compartilhado (útil em dev e testes). */
export function criarWhatsAppClient(): WhatsAppClient {
  const provider = (process.env.WHATSAPP_PROVIDER ?? "evolution").toLowerCase();
  if (provider === "meta") {
    const token = process.env.WHATSAPP_TOKEN;
    const phone = process.env.WHATSAPP_PHONE_NUMBER_ID;
    if (token && phone) return new MetaWhatsAppClient(token, phone);
  } else {
    const base = process.env.EVOLUTION_API_URL;
    const key = process.env.EVOLUTION_API_KEY;
    const inst = process.env.EVOLUTION_INSTANCE;
    if (base && key && inst) return new EvolutionWhatsAppClient(base, key, inst);
  }
  if (!fakeSingleton) fakeSingleton = new FakeWhatsAppClient();
  return fakeSingleton;
}

export function whatsappProvider(): "evolution" | "meta" {
  return (process.env.WHATSAPP_PROVIDER ?? "evolution").toLowerCase() === "meta" ? "meta" : "evolution";
}

export function whatsappConfigurado(): boolean {
  return whatsappProvider() === "meta"
    ? Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)
    : Boolean(process.env.EVOLUTION_API_URL && process.env.EVOLUTION_API_KEY && process.env.EVOLUTION_INSTANCE);
}

/** Para uso em testes: obtém o Fake compartilhado (mesma instância que criarWhatsAppClient devolve sem env). */
export function obterFakeWhatsApp(): FakeWhatsAppClient {
  if (!fakeSingleton) fakeSingleton = new FakeWhatsAppClient();
  return fakeSingleton;
}
