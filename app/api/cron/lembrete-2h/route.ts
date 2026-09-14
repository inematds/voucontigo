/**
 * Cron horário. Atendimentos que começam nas próximas 2h e ainda não têm
 * evento 'lembrete_2h' → avisa a gestão com o texto de WhatsApp pronto
 * (template_lembrete_2h) e grava o evento para não repetir.
 *
 * Fuso: `data` + `hora_prevista_inicio` são horário de parede de São Paulo
 * (-03:00, sem horário de verão); a Vercel roda em UTC.
 */
import {
  admin,
  atendimentosEntre,
  lerConfig,
  registrarEvento,
} from "@/lib/telegram/dados";
import { notificarGestao } from "@/lib/telegram/notificacoes";
import { cronAutorizado, respostaJson } from "@/lib/telegram/cron";
import {
  dataSP,
  ddmm,
  diaSemana,
  escapeHtml,
  idCurto,
  instante,
  renderTemplate,
  somarDias,
} from "@/lib/telegram/_local";
import { TIPO_ATENDIMENTO_LABEL, type TipoAtendimento } from "@/lib/domain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEMPLATE_2H_PADRAO =
  "Oi, {nome}! Daqui a pouco ({hora}) eu encontro {acompanhado} para {tipo} em {destino}. Já estou me organizando. 💚";

const STATUS_VALIDOS = ["agendado", "confirmado", "solicitado"];

export async function GET(request: Request): Promise<Response> {
  if (!cronAutorizado(request)) {
    return respostaJson({ erro: "não autorizado" }, 401);
  }

  const db = admin();
  const agora = new Date();
  const hoje = dataSP(agora);
  const limite = new Date(agora.getTime() + 2 * 60 * 60 * 1000);

  // hoje + amanhã cobre a virada de dia dentro da janela de 2h
  const candidatos = (await atendimentosEntre(hoje, somarDias(hoje, 1), db))
    .filter((a) => STATUS_VALIDOS.includes(a.status))
    .filter((a) => {
      const inicio = instante(a.data, a.hora_prevista_inicio);
      return inicio >= agora && inicio <= limite;
    });

  if (candidatos.length === 0) {
    return respostaJson({ ok: true, avisados: 0 });
  }

  const { data: jaAvisadosRaw } = await db
    .from("evento")
    .select("atendimento_id")
    .eq("tipo", "lembrete_2h")
    .in(
      "atendimento_id",
      candidatos.map((a) => a.id),
    );
  const jaAvisados = new Set(
    ((jaAvisadosRaw ?? []) as { atendimento_id: string | null }[])
      .map((e) => e.atendimento_id)
      .filter(Boolean) as string[],
  );

  const pendentes = candidatos.filter((a) => !jaAvisados.has(a.id));
  if (pendentes.length === 0) {
    return respostaJson({ ok: true, avisados: 0 });
  }

  const cfg = await lerConfig(["template_lembrete_2h"], db);
  const template = cfg.template_lembrete_2h || TEMPLATE_2H_PADRAO;

  for (const a of pendentes) {
    const texto = renderTemplate(template, {
      nome: a.cliente?.nome ?? "",
      dia: `${diaSemana(a.data)} ${ddmm(a.data)}`,
      hora: a.hora_prevista_inicio.slice(0, 5),
      acompanhado: a.acompanhado?.apelido || a.acompanhado?.nome || "",
      tipo: TIPO_ATENDIMENTO_LABEL[a.tipo as TipoAtendimento] ?? a.tipo,
      destino: a.endereco_destino,
      saida: a.endereco_saida,
    });

    const enviado = await notificarGestao(
      [
        "⏰ <b>Daqui a 2h</b>",
        `${escapeHtml(a.acompanhado?.nome ?? "")} · ${escapeHtml(
          TIPO_ATENDIMENTO_LABEL[a.tipo as TipoAtendimento] ?? a.tipo,
        )}`,
        `${escapeHtml(a.hora_prevista_inicio.slice(0, 5))} · ${escapeHtml(a.endereco_destino)}`,
        `Id: <code>${idCurto(a.id)}</code>`,
        "",
        "Texto para o WhatsApp:",
        `<pre>${escapeHtml(texto)}</pre>`,
      ].join("\n"),
    );

    // Só marca como avisado se a mensagem saiu — senão o próximo cron retenta.
    if (!enviado) continue;

    await registrarEvento(db, {
      tipo: "lembrete_2h",
      canal: "sistema",
      atendimento_id: a.id,
      cliente_id: a.cliente_id,
      payload: { hora_prevista_inicio: a.hora_prevista_inicio, data: a.data },
    });
  }

  return respostaJson({ ok: true, avisados: pendentes.length });
}
