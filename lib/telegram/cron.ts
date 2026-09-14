/** Helpers compartilhados pelas rotas de cron. */

/** Vercel Cron envia `Authorization: Bearer <CRON_SECRET>`. */
export function cronAutorizado(request: Request): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;
  return request.headers.get("authorization") === `Bearer ${segredo}`;
}

export function respostaJson(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
