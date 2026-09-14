/**
 * Registra o webhook do bot do Vou Contigo no Telegram.
 *
 * ⚠️ NÃO RODAR antes de criar o bot no @BotFather e ter um token EXCLUSIVO do
 * Vou Contigo. Rodar com o token de outro bot reaponta o webhook desse bot.
 *
 * Como rodar (depois de criar o bot e preencher o .env):
 *
 *   1. @BotFather → /newbot → copie o token para TELEGRAM_BOT_TOKEN no .env
 *   2. gere um segredo:  openssl rand -hex 32   → TELEGRAM_WEBHOOK_SECRET
 *   3. descubra o chat id do grupo de gestão (adicione o bot ao grupo e
 *      abra https://api.telegram.org/bot<TOKEN>/getUpdates) → TELEGRAM_CHAT_GESTAO
 *   4. publique o site (git push → Vercel) e configure as mesmas envs lá
 *   5. rode:
 *
 *      npx tsx scripts/telegram-set-webhook.ts
 *
 *      # ou apontando para outra URL:
 *      NEXT_PUBLIC_SITE_URL=https://voucontigo.vercel.app npx tsx scripts/telegram-set-webhook.ts
 *
 * Extras:
 *   --info     só mostra o webhook atual (getWebhookInfo), não altera nada
 *   --delete   remove o webhook (deleteWebhook)
 */

const token = process.env.TELEGRAM_BOT_TOKEN;
const segredo = process.env.TELEGRAM_WEBHOOK_SECRET;
const site = process.env.NEXT_PUBLIC_SITE_URL;

function sair(msg: string): never {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

async function api(metodo: string, corpo?: Record<string, unknown>) {
  const r = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: corpo ? "POST" : "GET",
    headers: corpo ? { "Content-Type": "application/json" } : undefined,
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const json = (await r.json()) as { ok: boolean; result?: unknown; description?: string };
  if (!json.ok) sair(`${metodo} falhou: ${json.description}`);
  return json.result;
}

async function main() {
  if (!token) sair("TELEGRAM_BOT_TOKEN não definido.");

  if (process.argv.includes("--info")) {
    console.log(JSON.stringify(await api("getWebhookInfo"), null, 2));
    return;
  }

  if (process.argv.includes("--delete")) {
    await api("deleteWebhook", { drop_pending_updates: false });
    console.log("✔ webhook removido.");
    return;
  }

  if (!segredo) sair("TELEGRAM_WEBHOOK_SECRET não definido.");
  if (!site) sair("NEXT_PUBLIC_SITE_URL não definido.");

  const url = `${site.replace(/\/$/, "")}/api/telegram`;

  await api("setWebhook", {
    url,
    secret_token: segredo,
    allowed_updates: ["message", "edited_message", "callback_query"],
    drop_pending_updates: true,
  });

  await api("setMyCommands", {
    commands: [
      { command: "ajuda", description: "Lista de comandos" },
      { command: "hoje", description: "Atendimentos de hoje" },
      { command: "amanha", description: "Atendimentos de amanhã" },
      { command: "semana", description: "Próximos 7 dias" },
      { command: "agendar", description: "Agendar (linha única com |)" },
      { command: "iniciar", description: "Marcar início do atendimento" },
      { command: "finalizar", description: "Finalizar e gerar relatório" },
      { command: "cancelar", description: "Cancelar atendimento" },
      { command: "relatorio", description: "Ver/marcar relatório enviado" },
      { command: "saldo", description: "Saldo de horas do cliente" },
      { command: "lead", description: "Leads novos" },
    ],
  });

  console.log(`✔ webhook registrado em ${url}`);
  console.log(JSON.stringify(await api("getWebhookInfo"), null, 2));
}

main().catch((e) => sair(String(e)));
