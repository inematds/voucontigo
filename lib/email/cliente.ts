/**
 * Contrato de envio de e-mail transacional (horários livres, relatórios, cobranças).
 * Implementação real: Resend via REST (sem SDK). Sem RESEND_API_KEY → Fake compartilhado.
 */

export interface ResultadoEmail {
  ok: boolean;
  id: string | null;
  erro?: string;
}

export interface EmailClient {
  enviar(para: string, assunto: string, html: string, texto?: string): Promise<ResultadoEmail>;
}

export interface EmailRegistrado {
  para: string;
  assunto: string;
  html: string;
  texto?: string;
}

export class FakeEmailClient implements EmailClient {
  envios: EmailRegistrado[] = [];
  private seq = 0;
  async enviar(para: string, assunto: string, html: string, texto?: string) {
    this.envios.push({ para, assunto, html, texto });
    this.seq += 1;
    return { ok: true, id: `email.fake.${this.seq}` };
  }
}

export class ResendEmailClient implements EmailClient {
  constructor(private apiKey: string, private from: string) {}
  async enviar(para: string, assunto: string, html: string, texto?: string) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: this.from, to: [para], subject: assunto, html, text: texto }),
      });
      const json = (await r.json().catch(() => ({}))) as { id?: string; message?: string };
      if (!r.ok) return { ok: false, id: null, erro: json.message ?? `HTTP ${r.status}` };
      return { ok: true, id: json.id ?? null };
    } catch (e) {
      return { ok: false, id: null, erro: e instanceof Error ? e.message : String(e) };
    }
  }
}

let fakeSingleton: FakeEmailClient | null = null;

export function criarEmailClient(): EmailClient {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Vou Contigo <onboarding@resend.dev>";
  if (key) return new ResendEmailClient(key, from);
  if (!fakeSingleton) fakeSingleton = new FakeEmailClient();
  return fakeSingleton;
}

export function obterFakeEmail(): FakeEmailClient {
  if (!fakeSingleton) fakeSingleton = new FakeEmailClient();
  return fakeSingleton;
}
