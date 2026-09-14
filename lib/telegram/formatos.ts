/**
 * Formatação de textos e teclados inline do Telegram (v2).
 * Sem dependência de `bot.ts` — evita ciclo de import entre bot/comandos/notificações.
 */
import { ddmm, escapeHtml, idCurto } from "./_local";
import { TIPO_ATENDIMENTO_LABEL, type TipoAtendimento } from "@/lib/domain/types";
import { urlPainel } from "./_compat_v2";
import type { AtendimentoJoin } from "./dados";

/** Botão inline do Telegram: callback (`callback_data`) ou link (`url`). */
export type BotaoInline =
  | { text: string; callback_data: string }
  | { text: string; url: string };

export type TecladoInline = { inline_keyboard: BotaoInline[][] };

/** Teclado ✅ Aprovar / ✏️ Ajustar / ❌ Recusar de uma solicitação. */
export function tecladoSolicitacao(atendimentoId: string): TecladoInline {
  return {
    inline_keyboard: [
      [
        { text: "✅ Aprovar", callback_data: `sol:aprovar:${atendimentoId}` },
        { text: "✏️ Ajustar", callback_data: `sol:ajustar:${atendimentoId}` },
        { text: "❌ Recusar", callback_data: `sol:recusar:${atendimentoId}` },
      ],
    ],
  };
}

export function textoSolicitacao(a: AtendimentoJoin): string {
  return [
    "🙋 <b>Nova solicitação</b>",
    `${escapeHtml(a.cliente?.nome ?? "Cliente")} · ${escapeHtml(
      a.acompanhado?.apelido || a.acompanhado?.nome || "Acompanhado",
    )}`,
    `${escapeHtml(TIPO_ATENDIMENTO_LABEL[a.tipo as TipoAtendimento] ?? a.tipo)} · ${ddmm(
      a.data,
    )} às ${escapeHtml(a.hora_prevista_inicio.slice(0, 5))} (${a.duracao_prevista_min} min)`,
    `Destino: ${escapeHtml(a.endereco_destino)}`,
    `Id: <code>${idCurto(a.id)}</code>`,
  ].join("\n");
}

export function tecladoConversa(conversa: {
  id: string;
  whatsapp: string;
}): TecladoInline {
  return {
    inline_keyboard: [
      [
        {
          text: "💬 Responder no painel",
          url: urlPainel(`/painel/inbox/${conversa.id}`),
        },
      ],
      [
        {
          text: "🔓 Liberar bot",
          callback_data: `conv:liberar:${conversa.whatsapp}`,
        },
      ],
    ],
  };
}

