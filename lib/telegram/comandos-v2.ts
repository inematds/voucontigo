/**
 * Comandos e callbacks da v2: solicitações com botões inline, conversas
 * humanas e resumos. Mesmo padrão de `comandos.ts` — contexto mínimo
 * mockável, `db` injetável, nenhuma chamada real ao Telegram nos testes.
 */
import { admin, type Admin } from "./dados";
import { responder, type CtxLike } from "./comandos";
import { escapeHtml, idCurto } from "./_local";
import { urlPainel } from "./_compat_v2";
import {
  aprovarSolicitacao,
  listarSolicitacoesPendentes,
  recusarSolicitacao,
} from "./solicitacoes";
import { liberarBot, listarConversas, responderConversa } from "./conversas";
import { resumoDiario, resumoFinanceiroSemanal } from "./resumos";
import { tecladoSolicitacao, textoSolicitacao } from "./formatos";

/** Contexto com o que os callbacks inline usam (tudo opcional). */
export interface CtxCallback extends CtxLike {
  callbackQuery?: { id?: string; data?: string } | undefined;
  answerCallbackQuery?: (
    opcoes?: string | Record<string, unknown>,
  ) => Promise<unknown>;
  editMessageReplyMarkup?: (
    opcoes?: Record<string, unknown>,
  ) => Promise<unknown>;
}

function textoDe(ctx: CtxLike): string {
  return ctx.message?.text ?? "";
}

function argumentos(texto: string, comando: string): string {
  return texto.replace(new RegExp(`^/${comando}(@\\w+)?\\s*`, "i"), "").trim();
}

export const AJUDA_V2 = [
  "<b>Solicitações e conversas (v2)</b>",
  "/solicitacoes — pendentes, com botões ✅ ✏️ ❌",
  "/responder &lt;whatsapp&gt; &lt;texto&gt; — responde a pessoa pelo WhatsApp",
  "/liberar &lt;whatsapp&gt; — devolve a conversa para o bot",
  "/resumo — resumo operacional de hoje",
  "/financeiro — resumo financeiro da última semana",
].join("\n");

// ---------------------------------------------------------------------------
// /solicitacoes
// ---------------------------------------------------------------------------

export async function cmdSolicitacoes(ctx: CtxLike, db: Admin = admin()) {
  const pendentes = await listarSolicitacoesPendentes(db);
  if (pendentes.length === 0) {
    return responder(ctx, "Nenhuma solicitação aguardando aprovação. 👌");
  }
  for (const a of pendentes) {
    await ctx.reply(textoSolicitacao(a), {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: tecladoSolicitacao(a.id),
    });
  }
}

// ---------------------------------------------------------------------------
// Callbacks inline
// ---------------------------------------------------------------------------

export const RE_CALLBACK_SOLICITACAO = /^sol:(aprovar|ajustar|recusar):(.+)$/;
export const RE_CALLBACK_CONVERSA = /^conv:liberar:(.+)$/;

async function fechar(ctx: CtxCallback, aviso: string) {
  try {
    await ctx.answerCallbackQuery?.({ text: aviso.slice(0, 190) });
  } catch {
    /* botão expirado — irrelevante */
  }
}

async function limparBotoes(ctx: CtxCallback) {
  try {
    await ctx.editMessageReplyMarkup?.({
      reply_markup: { inline_keyboard: [] },
    });
  } catch {
    /* mensagem antiga — irrelevante */
  }
}

/** Trata `sol:aprovar|ajustar|recusar:<id>`. */
export async function tratarCallbackSolicitacao(
  ctx: CtxCallback,
  db: Admin = admin(),
): Promise<void> {
  const dados = ctx.callbackQuery?.data ?? "";
  const m = RE_CALLBACK_SOLICITACAO.exec(dados);
  if (!m) return;
  const [, acao, id] = m;

  if (acao === "ajustar") {
    await fechar(ctx, "Abra o painel para ajustar.");
    await responder(
      ctx,
      [
        "✏️ <b>Ajustar solicitação</b>",
        `Id: <code>${idCurto(id)}</code>`,
        `<a href="${escapeHtml(urlPainel(`/painel/agenda/${id}/editar`))}">Abrir no painel</a>`,
      ].join("\n"),
    );
    return;
  }

  if (acao === "aprovar") {
    const r = await aprovarSolicitacao(id, { canal: "telegram", db });
    if (!r.ok) {
      await fechar(ctx, r.erro);
      await responder(ctx, `⚠️ ${escapeHtml(r.erro)}`);
      return;
    }
    await limparBotoes(ctx);
    await fechar(ctx, "Aprovado.");
    const a = r.atendimento;
    await responder(
      ctx,
      [
        "✅ <b>Solicitação aprovada</b>",
        `${escapeHtml(a.acompanhado?.nome ?? "")} · ${escapeHtml(a.data)} ${escapeHtml(a.hora_prevista_inicio.slice(0, 5))}`,
        r.confirmacao_enviada
          ? "Confirmação enviada ao cliente por WhatsApp."
          : "⚠️ Confirmação automática não saiu — avise o cliente manualmente.",
        `Id: <code>${idCurto(a.id)}</code>`,
      ].join("\n"),
    );
    return;
  }

  const r = await recusarSolicitacao(id, "recusado", { canal: "telegram", db });
  if (!r.ok) {
    await fechar(ctx, r.erro);
    await responder(ctx, `⚠️ ${escapeHtml(r.erro)}`);
    return;
  }
  await limparBotoes(ctx);
  await fechar(ctx, "Recusado.");
  await responder(
    ctx,
    [
      "❌ <b>Solicitação recusada</b>",
      `${escapeHtml(r.atendimento.acompanhado?.nome ?? "")} · <code>${idCurto(r.atendimento.id)}</code>`,
      r.aviso_enviado
        ? "O cliente foi avisado pelo WhatsApp."
        : "⚠️ Não consegui avisar o cliente — fale com ele manualmente.",
    ].join("\n"),
  );
}

/** Trata `conv:liberar:<whatsapp>`. */
export async function tratarCallbackConversa(
  ctx: CtxCallback,
  db: Admin = admin(),
): Promise<void> {
  const m = RE_CALLBACK_CONVERSA.exec(ctx.callbackQuery?.data ?? "");
  if (!m) return;
  const r = await liberarBot(m[1], { db, canal: "telegram" });
  await fechar(ctx, r.ok ? "Bot liberado." : r.erro);
  await limparBotoes(ctx);
  await responder(
    ctx,
    r.ok
      ? `🔓 Bot liberado para <code>${escapeHtml(m[1])}</code>.`
      : `⚠️ ${escapeHtml(r.erro)}`,
  );
}

// ---------------------------------------------------------------------------
// /responder e /liberar
// ---------------------------------------------------------------------------

export async function cmdResponder(ctx: CtxLike, db: Admin = admin()) {
  const args = argumentos(textoDe(ctx), "responder");
  const espaco = args.indexOf(" ");
  if (espaco < 0) {
    return responder(
      ctx,
      "⚠️ Use: <code>/responder &lt;whatsapp&gt; &lt;mensagem&gt;</code>",
    );
  }
  const whatsapp = args.slice(0, espaco);
  const texto = args.slice(espaco + 1).trim();

  const r = await responderConversa(whatsapp, texto, { db, canal: "telegram" });
  return responder(
    ctx,
    r.ok
      ? `📤 Mensagem enviada para <code>${escapeHtml(whatsapp)}</code>.`
      : `⚠️ ${escapeHtml(r.erro)}`,
  );
}

export async function cmdLiberar(ctx: CtxLike, db: Admin = admin()) {
  const whatsapp = argumentos(textoDe(ctx), "liberar");
  if (!whatsapp) {
    return responder(ctx, "⚠️ Use: <code>/liberar &lt;whatsapp&gt;</code>");
  }
  const r = await liberarBot(whatsapp, { db, canal: "telegram" });
  return responder(
    ctx,
    r.ok
      ? `🔓 Bot liberado para <code>${escapeHtml(whatsapp)}</code>.`
      : `⚠️ ${escapeHtml(r.erro)}`,
  );
}

/** /conversas — lista quem está aguardando humano. */
export async function cmdConversas(ctx: CtxLike, db: Admin = admin()) {
  const lista = await listarConversas({ apenasHumano: true, db, limite: 20 });
  if (lista.length === 0) {
    return responder(ctx, "Ninguém aguardando atendimento humano. 👌");
  }
  return responder(
    ctx,
    [
      `<b>Aguardando humano (${lista.length})</b>`,
      ...lista.map(
        (c) =>
          `• ${escapeHtml(c.cliente?.nome ?? `+${c.whatsapp}`)} — <code>${escapeHtml(c.whatsapp)}</code>`,
      ),
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// /resumo e /financeiro
// ---------------------------------------------------------------------------

export async function cmdResumo(ctx: CtxLike, db: Admin = admin()) {
  const { texto } = await resumoDiario(db);
  return responder(ctx, texto);
}

export async function cmdFinanceiro(ctx: CtxLike, db: Admin = admin()) {
  const { texto } = await resumoFinanceiroSemanal(db);
  return responder(ctx, texto);
}
