/**
 * Notificação simples para o grupo de gestão no Telegram.
 * Sem dependências (não usa grammy). Falha em silêncio se as env não existirem
 * ou se a API do Telegram responder erro — nunca derruba o fluxo do chamador.
 */
export async function notificarGestao(texto: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_GESTAO;

  if (!token || !chatId) return false;

  try {
    const resposta = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: texto,
          parse_mode: "HTML",
          disable_web_page_preview: true,
        }),
        cache: "no-store",
      },
    );
    return resposta.ok;
  } catch {
    return false;
  }
}
