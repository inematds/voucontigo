/**
 * Cron diário (07:00 America/Sao_Paulo). Manda ao Telegram da gestão:
 *  1. agenda de amanhã + texto de WhatsApp pronto (template_lembrete_d1);
 *  2. relatórios pendentes (concluído há > 2h sem relatorio_enviado_em);
 *  3. pacotes com saldo <= saldo_baixo_horas;
 *  4. leads novos sem contato há > 24h.
 * Nada é enviado ao cliente — é lembrete interno.
 */
import {
  admin,
  atendimentosEntre,
  lerConfig,
  lerConfigNum,
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
  renderTemplate,
  somarDias,
} from "@/lib/telegram/_local";
import { TIPO_ATENDIMENTO_LABEL, type TipoAtendimento } from "@/lib/domain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEMPLATE_D1_PADRAO =
  "Oi, {nome}! Lembrando que amanhã ({dia}) às {hora} eu acompanho {acompanhado} para {tipo}. Está tudo certo?";
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

  const cfg = await lerConfig(
    ["template_lembrete_d1", "template_saldo_baixo"],
    db,
  );
  const templateD1 = cfg.template_lembrete_d1 || TEMPLATE_D1_PADRAO;
  const templateSaldo = cfg.template_saldo_baixo || TEMPLATE_SALDO_PADRAO;

  // 1. agenda de amanhã ------------------------------------------------------
  const deAmanha = (await atendimentosEntre(amanha, amanha, db)).filter(
    (a) => !["cancelado_cliente", "cancelado_operacao"].includes(a.status),
  );
  if (deAmanha.length === 0) {
    blocos.push(`📅 <b>Amanhã (${ddmm(amanha)})</b>\nNenhum atendimento.`);
  } else {
    const linhas = deAmanha.map((a) => {
      const texto = renderTemplate(templateD1, {
        nome: a.cliente?.nome ?? "",
        dia: `${diaSemana(a.data)} ${ddmm(a.data)}`,
        hora: a.hora_prevista_inicio.slice(0, 5),
        acompanhado: a.acompanhado?.apelido || a.acompanhado?.nome || "",
        tipo: TIPO_ATENDIMENTO_LABEL[a.tipo as TipoAtendimento] ?? a.tipo,
        destino: a.endereco_destino,
        saida: a.endereco_saida,
      });
      return [
        `🕐 <b>${escapeHtml(a.hora_prevista_inicio.slice(0, 5))}</b> — ${escapeHtml(
          a.acompanhado?.nome ?? "",
        )} · <code>${idCurto(a.id)}</code>`,
        `<pre>${escapeHtml(texto)}</pre>`,
      ].join("\n");
    });
    blocos.push(
      [
        `📅 <b>Amanhã — ${ddmm(amanha)} (${diaSemana(amanha)})</b>`,
        "Textos prontos para o WhatsApp:",
        ...linhas,
      ].join("\n"),
    );
  }

  // 2. relatórios pendentes --------------------------------------------------
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

  // 3. saldo baixo -----------------------------------------------------------
  const saldoBaixo = await lerConfigNum("saldo_baixo_horas", 2, db);
  const { data: pacotesRaw } = await db
    .from("pacote")
    .select(
      "id, horas_contratadas, horas_usadas, valido_ate, cliente:cliente_id ( nome )",
    )
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
    .map((p) => ({
      ...p,
      restante: Number(p.horas_contratadas) - Number(p.horas_usadas),
    }))
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

  // 4. leads novos sem contato há > 24h --------------------------------------
  const ontem = new Date(agora.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const { data: leadsRaw } = await db
    .from("lead")
    .select("id, nome, whatsapp, criado_em")
    .eq("status", "novo")
    .lt("criado_em", ontem)
    .order("criado_em", { ascending: true })
    .limit(20);
  const leads = (leadsRaw ?? []) as {
    id: string;
    nome: string;
    whatsapp: string;
  }[];
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

  const enviado = await notificarGestao(
    [`<b>Bom dia! Resumo de ${ddmm(hoje)}</b>`, ...blocos].join("\n\n"),
  );

  const resumoContagem = {
    amanha: deAmanha.length,
    relatorios_pendentes: pendentes.length,
    saldo_baixo: baixos.length,
    leads_parados: leads.length,
    enviado,
  };

  await registrarEvento(db, {
    tipo: "cron.lembretes",
    canal: "sistema",
    payload: resumoContagem,
  });

  return respostaJson({ ok: true, ...resumoContagem });
}
