/**
 * Ponte v2 entre o módulo Telegram/painel e os módulos escritos em paralelo
 * por outros agentes:
 *
 *   - `lib/whatsapp/fluxo.ts`   → enviarMensagemGestao, liberarConversa   (agente B)
 *   - `lib/automacao`           → enviarConfirmacaoAgendamento            (agente E)
 *
 * Ambos já existem; este arquivo normaliza as assinaturas para booleanos e
 * garante que nada lance (o bot e as Server Actions não podem cair por causa
 * de uma integração externa). Todos os consumidores importam SOMENTE daqui.
 */
import { enviarConfirmacaoAgendamento as confirmarAgendamento } from "@/lib/automacao";
import {
  enviarMensagemGestao as enviarMensagemGestaoReal,
  liberarConversa as liberarConversaReal,
} from "@/lib/whatsapp/fluxo";

// ---------------------------------------------------------------------------
// Conversas
// ---------------------------------------------------------------------------

/** Normaliza para o formato aceito pelo banco (`^[0-9]{10,15}$`). */
export function normalizarWhatsApp(bruto: string): string | null {
  const so = (bruto ?? "").replace(/\D/g, "");
  return /^[0-9]{10,15}$/.test(so) ? so : null;
}

/**
 * Envia uma mensagem da gestão para um número de WhatsApp e grava no
 * histórico da conversa. Nunca lança.
 */
export async function enviarMensagemGestao(
  whatsapp: string,
  texto: string,
): Promise<boolean> {
  const numero = normalizarWhatsApp(whatsapp);
  if (!numero || !texto.trim()) return false;
  try {
    const r = await enviarMensagemGestaoReal(numero, texto);
    if (!r.ok) console.error("[compat_v2] enviarMensagemGestao:", r.erro);
    return r.ok;
  } catch (e) {
    console.error("[compat_v2] enviarMensagemGestao falhou:", e);
    return false;
  }
}

/** Devolve a conversa ao bot (estado `menu`). Nunca lança. */
export async function liberarConversa(whatsapp: string): Promise<boolean> {
  const numero = normalizarWhatsApp(whatsapp);
  if (!numero) return false;
  try {
    const r = await liberarConversaReal(numero);
    return r.ok;
  } catch (e) {
    console.error("[compat_v2] liberarConversa falhou:", e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Automação
// ---------------------------------------------------------------------------

/**
 * Confirmação de agendamento para o cliente (template Meta).
 * `true` quando a automação de fato disparou algo.
 */
export async function enviarConfirmacaoAgendamento(
  atendimentoId: string,
): Promise<boolean> {
  try {
    const item = await confirmarAgendamento(atendimentoId);
    return Boolean(item);
  } catch (e) {
    console.error("[compat_v2] enviarConfirmacaoAgendamento falhou:", e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// URLs do painel
// ---------------------------------------------------------------------------

export function baseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://voucontigo.vercel.app"
  ).replace(/\/+$/, "");
}

export function urlPainel(caminho: string): string {
  return `${baseUrl()}${caminho.startsWith("/") ? caminho : `/${caminho}`}`;
}
