/**
 * Webhook de ENTRADA do WhatsApp.
 *
 * Provedor padrão: **Evolution API** (`WHATSAPP_PROVIDER` ausente ou `evolution`).
 *   URL a cadastrar no manager: https://<host>/api/whatsapp?token=<WHATSAPP_WEBHOOK_TOKEN>
 *   Eventos: MESSAGES_UPSERT e MESSAGES_UPDATE · webhook_by_events=false · webhook_base64=false
 *
 * Alternativa: **Meta Cloud API** (`WHATSAPP_PROVIDER=meta`).
 *   GET  → verificação (hub.verify_token vs WHATSAPP_VERIFY_TOKEN)
 *   POST → X-Hub-Signature-256 (HMAC-SHA256 do corpo CRU com WHATSAPP_APP_SECRET)
 *
 * Responde 200 sempre que o payload for autêntico — inclusive em erro de
 * processamento — para o provedor não ficar reenviando.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import { whatsappProvider } from "@/lib/whatsapp/cliente";
import {
  parseEvolution,
  parseEvolutionStatus,
  parseMeta,
  parseMetaStatus,
  type EvolutionBody,
  type MetaBody,
} from "@/lib/whatsapp/normalizar";
import {
  mensagemJaProcessada,
  processarMensagemRecebida,
  registrarStatusMensagem,
} from "@/lib/whatsapp/fluxo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Comparação em tempo constante (hash antes: timingSafeEqual exige mesmo tamanho). */
function igualSeguro(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a ?? "", "utf8").digest();
  const hb = createHash("sha256").update(b ?? "", "utf8").digest();
  return timingSafeEqual(ha, hb);
}

function ok(extra: Record<string, unknown> = {}) {
  return Response.json({ ok: true, ...extra }, { status: 200 });
}

function naoAutorizado() {
  return Response.json({ ok: false, erro: "nao_autorizado" }, { status: 401 });
}

// ---------------------------------------------------------------------------
// GET — verificação de webhook da Meta
// ---------------------------------------------------------------------------

export async function GET(req: Request) {
  if (whatsappProvider() !== "meta") return ok({ provedor: "evolution" });

  const url = new URL(req.url);
  const modo = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token") ?? "";
  const challenge = url.searchParams.get("hub.challenge") ?? "";
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN ?? "";

  if (modo === "subscribe" && esperado !== "" && igualSeguro(token, esperado)) {
    return new Response(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return naoAutorizado();
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

export async function POST(req: Request) {
  const provedor = whatsappProvider();
  // O corpo tem de ser lido CRU: reserializar JSON quebra a assinatura da Meta.
  const bruto = await req.text();

  if (provedor === "meta") {
    const segredo = process.env.WHATSAPP_APP_SECRET ?? "";
    const assinatura = req.headers.get("x-hub-signature-256") ?? "";
    if (!segredo || !assinatura.startsWith("sha256=")) return naoAutorizado();
    const esperada = `sha256=${createHmac("sha256", segredo).update(bruto, "utf8").digest("hex")}`;
    if (!igualSeguro(assinatura, esperada)) return naoAutorizado();
  } else {
    const esperado = process.env.WHATSAPP_WEBHOOK_TOKEN ?? "";
    const recebido = new URL(req.url).searchParams.get("token") ?? "";
    if (!esperado || !igualSeguro(recebido, esperado)) return naoAutorizado();
  }

  let corpo: unknown;
  try {
    corpo = bruto ? JSON.parse(bruto) : {};
  } catch {
    return ok({ ignorado: "json_invalido" });
  }

  try {
    if (provedor === "meta") return await tratarMeta(corpo as MetaBody);
    return await tratarEvolution(corpo as EvolutionBody);
  } catch (e) {
    console.error("[whatsapp] webhook falhou:", e);
    return ok({ erro: "processamento" });
  }
}

async function tratarEvolution(corpo: EvolutionBody) {
  const evento = (corpo?.event ?? "").toLowerCase().replace(/_/g, ".");

  if (evento === "messages.update") {
    const s = parseEvolutionStatus(corpo);
    if (s) await registrarStatusMensagem(s.wa_message_id, s.status);
    return ok({ evento: "messages.update" });
  }

  if (evento !== "messages.upsert") return ok({ ignorado: "evento_desconhecido", evento });

  const msg = parseEvolution(corpo);
  // fromMe, grupo (@g.us), sem texto ou número inválido → ignora com 200.
  if (!msg) return ok({ ignorado: "sem_mensagem" });

  if (await mensagemJaProcessada(msg.wa_message_id)) return ok({ ignorado: "duplicada" });

  const r = await processarMensagemRecebida(msg);
  return ok({ processado: r.ok, estado: r.estado, ignorado: r.ignorado });
}

async function tratarMeta(corpo: MetaBody) {
  const status = parseMetaStatus(corpo);
  if (status) {
    await registrarStatusMensagem(status.wa_message_id, status.status);
    return ok({ evento: "status" });
  }

  const msg = parseMeta(corpo);
  if (!msg) return ok({ ignorado: "sem_mensagem" });

  if (await mensagemJaProcessada(msg.wa_message_id)) return ok({ ignorado: "duplicada" });

  const r = await processarMensagemRecebida(msg);
  return ok({ processado: r.ok, estado: r.estado, ignorado: r.ignorado });
}
