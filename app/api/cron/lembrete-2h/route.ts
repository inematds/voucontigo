/**
 * Cron horário. Atendimentos que começam nas próximas 2h e ainda não têm
 * evento 'lembrete_2h' → a mensagem vai DIRETO ao cliente (WhatsApp/e-mail)
 * via lib/automacao, e a gestão recebe o resumo no Telegram.
 *
 * Fuso: `data` + `hora_prevista_inicio` são horário de parede de São Paulo
 * (-03:00, sem horário de verão); a Vercel roda em UTC.
 */
import { admin, registrarEvento } from "@/lib/telegram/dados";
import { notificarGestao } from "@/lib/telegram/notificacoes";
import { cronAutorizado, respostaJson } from "@/lib/telegram/cron";
import { enviarLembretes2h } from "@/lib/automacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  if (!cronAutorizado(request)) {
    return respostaJson({ erro: "não autorizado" }, 401);
  }

  const agora = new Date();
  const r = await enviarLembretes2h(agora);

  if (r.itens.length > 0) {
    await notificarGestao(r.resumoTelegram);
    await registrarEvento(admin(), {
      tipo: "cron.lembrete_2h",
      canal: "sistema",
      payload: { enviados: r.enviados, falhas: r.falhas, pulados: r.pulados },
    });
  }

  return respostaJson({
    ok: true,
    avisados: r.enviados,
    falhas: r.falhas,
    pulados: r.pulados,
  });
}
