/**
 * Parsers de payload de webhook → formato interno único.
 * Funções PURAS (sem banco, sem rede) — todo o resto do webhook é I/O.
 */

export interface MensagemNormalizada {
  /** E.164 só dígitos, ex.: 5551999998888 */
  whatsapp: string;
  wa_message_id: string;
  texto: string;
  nome: string | null;
}

export interface AtualizacaoStatus {
  wa_message_id: string;
  status: "enviada" | "entregue" | "lida" | "falhou";
}

const RE_NUMERO = /^[0-9]{10,15}$/;

/** "5551999998888@s.whatsapp.net" → "5551999998888"; null se não for número válido. */
export function numeroDoJid(jid: unknown): string | null {
  if (typeof jid !== "string" || jid === "") return null;
  if (jid.includes("@g.us")) return null; // grupo
  if (jid.includes("@broadcast")) return null;
  const digitos = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
  return RE_NUMERO.test(digitos) ? digitos : null;
}

export function normalizarNumero(valor: unknown): string | null {
  if (typeof valor !== "string" && typeof valor !== "number") return null;
  const digitos = String(valor).replace(/\D/g, "");
  return RE_NUMERO.test(digitos) ? digitos : null;
}

// ---------------------------------------------------------------------------
// Evolution API v2
// ---------------------------------------------------------------------------

interface EvolutionMessage {
  conversation?: string;
  extendedTextMessage?: { text?: string };
  buttonsResponseMessage?: { selectedButtonId?: string; selectedDisplayText?: string };
  listResponseMessage?: {
    singleSelectReply?: { selectedRowId?: string };
    title?: string;
  };
  templateButtonReplyMessage?: { selectedId?: string };
}

export function textoEvolution(message: EvolutionMessage | undefined | null): string {
  if (!message) return "";
  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.buttonsResponseMessage?.selectedButtonId ??
    message.buttonsResponseMessage?.selectedDisplayText ??
    message.listResponseMessage?.singleSelectReply?.selectedRowId ??
    message.listResponseMessage?.title ??
    message.templateButtonReplyMessage?.selectedId ??
    ""
  ).toString();
}

interface EvolutionData {
  key?: { remoteJid?: string; fromMe?: boolean; id?: string; senderPn?: string; remoteJidAlt?: string };
  pushName?: string;
  message?: EvolutionMessage;
  status?: string;
  update?: { status?: string };
}

export interface EvolutionBody {
  event?: string;
  instance?: string;
  data?: EvolutionData | EvolutionData[];
}

function primeiro<T>(v: T | T[] | undefined | null): T | null {
  if (v === undefined || v === null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

/** `messages.upsert` → mensagem normalizada. null quando deve ser ignorado (fromMe, grupo, sem texto). */
export function parseEvolution(body: EvolutionBody | null | undefined): MensagemNormalizada | null {
  if (!body) return null;
  const evento = (body.event ?? "").toLowerCase().replace(/_/g, ".");
  if (evento !== "messages.upsert") return null;
  const data = primeiro(body.data);
  if (!data?.key) return null;
  if (data.key.fromMe === true) return null;

  // Instâncias que emitem JID @lid trazem o número real em senderPn / remoteJidAlt.
  const whatsapp =
    numeroDoJid(data.key.remoteJid) ??
    numeroDoJid(data.key.senderPn) ??
    numeroDoJid(data.key.remoteJidAlt);
  if (!whatsapp) return null;

  const wa_message_id = typeof data.key.id === "string" ? data.key.id : "";
  if (!wa_message_id) return null;

  const texto = textoEvolution(data.message).trim();
  if (texto === "") return null;

  return { whatsapp, wa_message_id, texto, nome: data.pushName ?? null };
}

const STATUS_EVOLUTION: Record<string, AtualizacaoStatus["status"]> = {
  PENDING: "enviada",
  SERVER_ACK: "enviada",
  DELIVERY_ACK: "entregue",
  DELIVERED: "entregue",
  READ: "lida",
  PLAYED: "lida",
  ERROR: "falhou",
  FAILED: "falhou",
};

/** `messages.update` → atualização de status (tolerante a variações de shape). */
export function parseEvolutionStatus(body: EvolutionBody | null | undefined): AtualizacaoStatus | null {
  if (!body) return null;
  const evento = (body.event ?? "").toLowerCase().replace(/_/g, ".");
  if (evento !== "messages.update") return null;
  const data = primeiro(body.data);
  if (!data) return null;
  const wa_message_id = data.key?.id;
  if (typeof wa_message_id !== "string" || wa_message_id === "") return null;
  const bruto = String(data.status ?? data.update?.status ?? "").toUpperCase();
  const status = STATUS_EVOLUTION[bruto];
  return status ? { wa_message_id, status } : null;
}

// ---------------------------------------------------------------------------
// Meta WhatsApp Cloud API
// ---------------------------------------------------------------------------

interface MetaMessage {
  from?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
  button?: { payload?: string; text?: string };
  interactive?: {
    type?: string;
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
}

export interface MetaBody {
  object?: string;
  entry?: {
    changes?: {
      value?: {
        contacts?: { profile?: { name?: string }; wa_id?: string }[];
        messages?: MetaMessage[];
        statuses?: { id?: string; status?: string }[];
      };
    }[];
  }[];
}

export function textoMeta(msg: MetaMessage | undefined | null): string {
  if (!msg) return "";
  return (
    msg.text?.body ??
    msg.interactive?.button_reply?.id ??
    msg.interactive?.button_reply?.title ??
    msg.interactive?.list_reply?.id ??
    msg.interactive?.list_reply?.title ??
    msg.button?.payload ??
    msg.button?.text ??
    ""
  ).toString();
}

export function parseMeta(body: MetaBody | null | undefined): MensagemNormalizada | null {
  const valor = body?.entry?.[0]?.changes?.[0]?.value;
  const msg = valor?.messages?.[0];
  if (!msg) return null;
  const whatsapp = normalizarNumero(msg.from);
  if (!whatsapp) return null;
  const wa_message_id = typeof msg.id === "string" ? msg.id : "";
  if (!wa_message_id) return null;
  const texto = textoMeta(msg).trim();
  if (texto === "") return null;
  const nome = valor?.contacts?.[0]?.profile?.name ?? null;
  return { whatsapp, wa_message_id, texto, nome };
}

const STATUS_META: Record<string, AtualizacaoStatus["status"]> = {
  sent: "enviada",
  delivered: "entregue",
  read: "lida",
  failed: "falhou",
};

export function parseMetaStatus(body: MetaBody | null | undefined): AtualizacaoStatus | null {
  const s = body?.entry?.[0]?.changes?.[0]?.value?.statuses?.[0];
  if (!s?.id) return null;
  const status = STATUS_META[String(s.status ?? "").toLowerCase()];
  return status ? { wa_message_id: s.id, status } : null;
}
