/**
 * Instância grammy do bot da gestão.
 *
 * - Criada preguiçosamente (`getBot()`): nada é construído em tempo de módulo,
 *   para que `next build` não quebre quando TELEGRAM_BOT_TOKEN não existe.
 * - Sem polling. O único ponto de entrada é o webhook em app/api/telegram.
 * - Só responde a chats autorizados (grupo de gestão + perfis/acompanhantes
 *   com telegram_chat_id cadastrado).
 */
import { Bot } from "grammy";
import {
  cmdAgenda,
  cmdAgendar,
  cmdAjuda,
  cmdCancelar,
  cmdFinalizar,
  cmdIniciar,
  cmdLead,
  cmdRelatorio,
  cmdSaldo,
  guardaAutorizacao,
  responder,
  type CtxLike,
} from "./comandos";

let instancia: Bot | null = null;

export function getBot(): Bot | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;
  if (instancia) return instancia;

  const bot = new Bot(token);

  // Porteiro: nenhum handler roda para chat não autorizado.
  bot.use(async (ctx, next) => {
    if (await guardaAutorizacao(ctx as CtxLike)) return next();
  });

  bot.command(["start", "ajuda", "help"], (ctx) => cmdAjuda(ctx as CtxLike));
  bot.command("hoje", (ctx) => cmdAgenda(ctx as CtxLike, "hoje"));
  bot.command(["amanha", "amanhã"], (ctx) => cmdAgenda(ctx as CtxLike, "amanha"));
  bot.command("semana", (ctx) => cmdAgenda(ctx as CtxLike, "semana"));
  bot.command("agendar", (ctx) => cmdAgendar(ctx as CtxLike));
  bot.command("cancelar", (ctx) => cmdCancelar(ctx as CtxLike));
  bot.command("iniciar", (ctx) => cmdIniciar(ctx as CtxLike));
  bot.command("finalizar", (ctx) => cmdFinalizar(ctx as CtxLike));
  bot.command(["relatorio", "relatório"], (ctx) => cmdRelatorio(ctx as CtxLike));
  bot.command("saldo", (ctx) => cmdSaldo(ctx as CtxLike));
  bot.command(["lead", "leads"], (ctx) => cmdLead(ctx as CtxLike));

  bot.on("message:text", async (ctx) => {
    if (ctx.message.text.startsWith("/")) {
      await responder(
        ctx as CtxLike,
        "Comando desconhecido. Use /ajuda para ver a lista.",
      );
    }
  });

  bot.catch((err) => {
    console.error("[telegram] erro no handler:", err.error);
  });

  instancia = bot;
  return bot;
}

/** Só para testes: descarta a instância em cache. */
export function _resetBot() {
  instancia = null;
}
