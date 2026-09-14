/**
 * Notificações enviadas PARA o grupo de gestão no Telegram.
 * Todas são silenciosas: sem TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_GESTAO ou com
 * erro da API, retornam false e nunca derrubam o fluxo do chamador.
 */
import type { Atendimento, Lead } from "@/lib/domain/types";
import { getBot } from "./bot";
import { ddmm, escapeHtml, idCurto } from "./_local";
import { TIPO_ATENDIMENTO_LABEL, type TipoAtendimento } from "@/lib/domain/types";
import { buscarAtendimento } from "./solicitacoes";
import { admin, type Admin } from "./dados";
import {
  tecladoConversa,
  tecladoSolicitacao,
  textoSolicitacao,
} from "./formatos";

export { tecladoConversa, tecladoSolicitacao, textoSolicitacao };

import type { TecladoInline } from "./formatos";
export type { BotaoInline, TecladoInline } from "./formatos";

export async function notificarGestao(
  texto: string,
  extra?: { reply_markup?: TecladoInline },
): Promise<boolean> {
  const chatId = process.env.TELEGRAM_CHAT_GESTAO;
  const bot = getBot();
  if (!bot || !chatId) return false;
  try {
    await bot.api.sendMessage(chatId, texto, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...(extra?.reply_markup ? { reply_markup: extra.reply_markup } : {}),
    });
    return true;
  } catch (e) {
    console.error("[telegram] falha ao notificar gestão:", e);
    return false;
  }
}

export async function notificarNovoLead(
  lead: Pick<Lead, "nome" | "whatsapp" | "mensagem" | "origem">,
): Promise<boolean> {
  return notificarGestao(
    [
      "🌱 <b>Novo lead</b>",
      `${escapeHtml(lead.nome)} · ${escapeHtml(lead.origem)}`,
      lead.mensagem ? `“${escapeHtml(lead.mensagem)}”` : "",
      `<a href="https://wa.me/${encodeURIComponent(lead.whatsapp)}">Abrir WhatsApp</a>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

type AtendimentoResumo = Pick<
  Atendimento,
  "id" | "tipo" | "data" | "hora_prevista_inicio" | "endereco_destino"
> & { acompanhado_nome?: string | null; motivo_cancelamento?: string | null };

function resumo(a: AtendimentoResumo): string[] {
  return [
    `${escapeHtml(a.acompanhado_nome ?? "Acompanhado")} · ${escapeHtml(
      TIPO_ATENDIMENTO_LABEL[a.tipo as TipoAtendimento] ?? a.tipo,
    )}`,
    `${ddmm(a.data)} às ${escapeHtml(a.hora_prevista_inicio.slice(0, 5))}`,
    `Destino: ${escapeHtml(a.endereco_destino)}`,
    `Id: <code>${idCurto(a.id)}</code>`,
  ];
}

export async function notificarAtendimentoCriado(
  a: AtendimentoResumo,
): Promise<boolean> {
  return notificarGestao(["📅 <b>Atendimento agendado</b>", ...resumo(a)].join("\n"));
}

export async function notificarAtendimentoCancelado(
  a: AtendimentoResumo,
): Promise<boolean> {
  return notificarGestao(
    [
      "🚫 <b>Atendimento cancelado</b>",
      ...resumo(a),
      a.motivo_cancelamento
        ? `Motivo: ${escapeHtml(a.motivo_cancelamento)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

// ---------------------------------------------------------------------------
// v2 — solicitações com botões inline
// ---------------------------------------------------------------------------

/**
 * Avisa a gestão de um atendimento `solicitado` com os botões inline.
 * Chamada por B (WhatsApp) e D (portal) logo após criar a solicitação.
 */
export async function notificarSolicitacao(
  atendimentoId: string,
  db: Admin = admin(),
): Promise<boolean> {
  const a = await buscarAtendimento(atendimentoId, db);
  if (!a) return false;
  return notificarGestao(textoSolicitacao(a), {
    reply_markup: tecladoSolicitacao(a.id),
  });
}

// ---------------------------------------------------------------------------
// v2 — conversas que precisam de humano
// ---------------------------------------------------------------------------

/** Avisa a gestão que uma conversa entrou em atendimento humano. */
export async function notificarConversaHumana(
  conversa: {
    id: string;
    whatsapp: string;
    cliente?: { nome: string } | null;
    cliente_nome?: string | null;
  },
  texto: string,
): Promise<boolean> {
  const quem =
    conversa.cliente?.nome ?? conversa.cliente_nome ?? `+${conversa.whatsapp}`;
  return notificarGestao(
    [
      "💬 <b>Conversa aguardando humano</b>",
      `${escapeHtml(quem)} · <code>${escapeHtml(conversa.whatsapp)}</code>`,
      `“${escapeHtml(texto)}”`,
      `Responder por aqui: <code>/responder ${escapeHtml(conversa.whatsapp)} sua mensagem</code>`,
    ].join("\n"),
    { reply_markup: tecladoConversa(conversa) },
  );
}
