/**
 * Notificações enviadas PARA o grupo de gestão no Telegram.
 * Todas são silenciosas: sem TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_GESTAO ou com
 * erro da API, retornam false e nunca derrubam o fluxo do chamador.
 */
import type { Atendimento, Lead } from "@/lib/domain/types";
import { getBot } from "./bot";
import { ddmm, escapeHtml, idCurto } from "./_local";
import { TIPO_ATENDIMENTO_LABEL, type TipoAtendimento } from "@/lib/domain/types";

export async function notificarGestao(texto: string): Promise<boolean> {
  const chatId = process.env.TELEGRAM_CHAT_GESTAO;
  const bot = getBot();
  if (!bot || !chatId) return false;
  try {
    await bot.api.sendMessage(chatId, texto, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
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
