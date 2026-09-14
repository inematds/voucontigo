/**
 * Webhook do bot Telegram.
 * POST — recebe updates. Exige o header X-Telegram-Bot-Api-Secret-Token
 * igual a TELEGRAM_WEBHOOK_SECRET (o Telegram envia em toda chamada).
 * GET  — healthcheck simples ("ok").
 */
import { webhookCallback } from "grammy";
import { getBot } from "@/lib/telegram/bot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const segredo = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!segredo) {
    return new Response("webhook não configurado", { status: 503 });
  }
  if (request.headers.get("x-telegram-bot-api-secret-token") !== segredo) {
    return new Response("não autorizado", { status: 401 });
  }

  const bot = getBot();
  if (!bot) return new Response("bot não configurado", { status: 503 });

  const handle = webhookCallback(bot, "std/http");
  return handle(request);
}
