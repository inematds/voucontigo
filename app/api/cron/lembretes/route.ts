/**
 * Cron diário (Vercel Hobby: só diário). Faz, nesta ordem:
 *  1. lembrete D-1 AO CLIENTE (WhatsApp/e-mail) via lib/automacao;
 *  2. resumo interno no Telegram (agenda de amanhã + o que saiu);
 *  3. relatórios pendentes (concluído há > 2h sem relatorio_enviado_em);
 *  4. pacotes com saldo <= saldo_baixo_horas;
 *  5. leads novos sem contato há > 24h;
 *  6. horários livres da semana — só às segundas e só se
 *     `configuracao.enviar_horarios_semanal === "1"`.
 */
import { admin, atendimentosEntre, lerConfig, lerConfigNum, registrarEvento } from "@/lib/telegram/dados";
import { notificarGestao } from "@/lib/telegram/notificacoes";
import { enviarResumoDiario, enviarResumoFinanceiroSeSegunda } from "@/lib/telegram/resumos";
import { cronAutorizado, respostaJson } from "@/lib/telegram/cron";
import { dataSP, ddmm, diaSemana, escapeHtml, idCurto, renderTemplate, somarDias } from "@/lib/telegram/_local";
import { enviarHorariosLivresSemanal, enviarLembretesD1 } from "@/lib/automacao";
import { calcularSlotsLivres } from "@/lib/domain/agendamento";
import { parseConfigAgenda } from "@/lib/whatsapp/_compat";
import { TIPO_ATENDIMENTO_LABEL, type TipoAtendimento } from "@/lib/domain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEMPLATE_SALDO_PADRAO =
  "Oi, {nome}! Passando para avisar que restam {horas}h no pacote de {acompanhado}. Quer renovar?";

export async function GET(request: Request): Promise<Response> {
  if (!cronAutorizado(request)) {
    return respostaJson({ erro: "não autorizado" }, 401);
  }

  const db = admin();
  const agora = new Date();
  const hoje = dataSP(agora);
  const amanha = somarDias(hoje, 1);
  const blocos: string[] = [];

  // 1. lembretes D-1 direto ao cliente ---------------------------------------
  const d1 = await enviarLembretesD1(amanha);
  blocos.push(d1.resumoTelegram);

  // 2. agenda de amanhã (visão da gestão) ------------------------------------
  const deAmanha = (await atendimentosEntre(amanha, amanha, db)).filter(
    (a) => !["cancelado_cliente", "cancelado_operacao"].includes(a.status),
  );
  blocos.push(
    deAmanha.length === 0
      ? `📅 <b>Amanhã (${ddmm(amanha)})</b>\nNenhum atendimento.`
      : [
          `📅 <b>Amanhã — ${ddmm(amanha)} (${diaSemana(amanha)})</b>`,
          ...deAmanha.map(
            (a) =>
              `🕐 <b>${escapeHtml(a.hora_prevista_inicio.slice(0, 5))}</b> — ${escapeHtml(
                a.acompanhado?.nome ?? "",
              )} · ${escapeHtml(
                TIPO_ATENDIMENTO_LABEL[a.tipo as TipoAtendimento] ?? a.tipo,
              )} · <code>${idCurto(a.id)}</code>`,
          ),
        ].join("\n"),
  );

  // 3. relatórios pendentes --------------------------------------------------
  const limite = new Date(agora.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const { data: pendentesRaw } = await db
    .from("atendimento")
    .select("id, data, fim_real, acompanhado:acompanhado_id ( nome )")
    .eq("status", "concluido")
    .is("relatorio_enviado_em", null)
    .lt("fim_real", limite)
    .order("fim_real", { ascending: true })
    .limit(20);
  const pendentes = (pendentesRaw ?? []) as unknown as {
    id: string;
    data: string;
    acompanhado: { nome: string } | null;
  }[];
  if (pendentes.length > 0) {
    blocos.push(
      [
        `⏳ <b>Relatórios pendentes (${pendentes.length})</b>`,
        ...pendentes.map(
          (p) =>
            `• ${escapeHtml(p.acompanhado?.nome ?? "")} · ${ddmm(p.data)} · <code>/relatorio ${idCurto(p.id)}</code>`,
        ),
      ].join("\n"),
    );
  }

  // 4. saldo baixo -----------------------------------------------------------
  const cfg = await lerConfig(["template_saldo_baixo"], db);
  const templateSaldo = cfg.template_saldo_baixo || TEMPLATE_SALDO_PADRAO;
  const saldoBaixo = await lerConfigNum("saldo_baixo_horas", 2, db);
  const { data: pacotesRaw } = await db
    .from("pacote")
    .select("id, horas_contratadas, horas_usadas, valido_ate, cliente:cliente_id ( nome )")
    .eq("status", "ativo")
    .gte("valido_ate", hoje);
  const baixos = (
    (pacotesRaw ?? []) as unknown as {
      id: string;
      horas_contratadas: number;
      horas_usadas: number;
      valido_ate: string;
      cliente: { nome: string } | null;
    }[]
  )
    .map((p) => ({ ...p, restante: Number(p.horas_contratadas) - Number(p.horas_usadas) }))
    .filter((p) => p.restante <= saldoBaixo);
  if (baixos.length > 0) {
    blocos.push(
      [
        `🔔 <b>Saldo baixo (≤ ${saldoBaixo}h)</b>`,
        ...baixos.map((p) =>
          [
            `• ${escapeHtml(p.cliente?.nome ?? "")} — <b>${p.restante}h</b> até ${ddmm(p.valido_ate)}`,
            `<pre>${escapeHtml(
              renderTemplate(templateSaldo, {
                nome: p.cliente?.nome ?? "",
                horas: p.restante,
                acompanhado: "",
              }),
            )}</pre>`,
          ].join("\n"),
        ),
      ].join("\n"),
    );
  }

  // 5. leads novos sem contato há > 24h --------------------------------------
  const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data: leadsRaw } = await db
    .from("lead")
    .select("id, nome, whatsapp, criado_em")
    .eq("status", "novo")
    .lt("criado_em", ontem)
    .order("criado_em", { ascending: true })
    .limit(20);
  const leads = (leadsRaw ?? []) as { id: string; nome: string; whatsapp: string }[];
  if (leads.length > 0) {
    blocos.push(
      [
        `🌱 <b>Leads sem contato há mais de 24h (${leads.length})</b>`,
        ...leads.map(
          (l) =>
            `• ${escapeHtml(l.nome)} — <a href="https://wa.me/${encodeURIComponent(l.whatsapp)}">WhatsApp</a>`,
        ),
      ].join("\n"),
    );
  }

  // 6. horários livres da semana (só segunda) --------------------------------
  let semanal: Awaited<ReturnType<typeof enviarHorariosLivresSemanal>> = {
    ativo: false,
    enviados: 0,
    pulados: 0,
    falhas: 0,
  };
  if (diaSemana(hoje) === "segunda") {
    // slots livres dos próximos 7 dias, com a agenda real e a config do painel
    const ate = somarDias(hoje, 7);
    const { data: ocupadosRaw } = await db.rpc("horarios_ocupados", { p_de: hoje, p_ate: ate });
    const ocupados = ((ocupadosRaw ?? []) as { data: string; hora_inicio: string; duracao_min: number }[]).map(
      (o) => ({ data: o.data, hora: String(o.hora_inicio).slice(0, 5), duracao_min: o.duracao_min }),
    );
    const { data: cfgRows } = await db.from("configuracao").select("chave, valor");
    const slots = calcularSlotsLivres({
      de: hoje,
      ate,
      duracao_min: 120,
      ocupados,
      config: parseConfigAgenda(cfgRows ?? []),
      limite: 8,
    });
    semanal = await enviarHorariosLivresSemanal(hoje, slots);
  }
  if (semanal.ativo) {
    blocos.push(
      `🗓️ <b>Horários livres da semana</b>\nEnviados: ${semanal.enviados} · pulados: ${semanal.pulados} · falhas: ${semanal.falhas}`,
    );
  }

  const enviado = await notificarGestao(
    [`<b>Bom dia! Resumo de ${ddmm(hoje)}</b>`, ...blocos].join("\n\n"),
  );

  // v2: resumo operacional do dia (solicitações, conversas humanas, cobranças) e financeiro às segundas
  let resumoDiario: { enviado: boolean } | null = null;
  let resumoFinanceiro: { enviado: boolean } | null = null;
  try {
    resumoDiario = await enviarResumoDiario(db);
    resumoFinanceiro = await enviarResumoFinanceiroSeSegunda(db);
  } catch (e) {
    console.error("[cron.lembretes] resumos v2 falharam", e);
  }

  const resumoContagem = {
    resumo_diario: resumoDiario?.enviado ?? false,
    resumo_financeiro: resumoFinanceiro?.enviado ?? null,
    lembretes_d1_enviados: d1.enviados,
    lembretes_d1_pulados: d1.pulados,
    lembretes_d1_falhas: d1.falhas,
    amanha: deAmanha.length,
    relatorios_pendentes: pendentes.length,
    saldo_baixo: baixos.length,
    leads_parados: leads.length,
    horarios_semanal: semanal,
    enviado,
  };

  await registrarEvento(db, {
    tipo: "cron.lembretes",
    canal: "sistema",
    payload: resumoContagem,
  });

  return respostaJson({ ok: true, ...resumoContagem });
}
