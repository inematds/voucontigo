/**
 * Resumos enviados ao grupo de gestão no Telegram (v2).
 *
 *  - `resumoDiario()`            — panorama operacional do dia (cron 07h).
 *  - `resumoFinanceiroSemanal()` — dinheiro da semana (cron de segunda-feira).
 *
 * As funções só MONTAM o texto (HTML do Telegram) e nunca lançam: com listas
 * vazias devolvem um texto completo dizendo que não há nada. Quem envia é
 * `enviarResumoDiario` / `enviarResumoFinanceiroSemanal`.
 */
import type { MeioPagamento } from "@/lib/domain/types";
import { TIPO_ATENDIMENTO_LABEL, type TipoAtendimento } from "@/lib/domain/types";
import { admin, atendimentosEntre, type Admin } from "./dados";
import { notificarGestao } from "./notificacoes";
import {
  dataSP,
  ddmm,
  diaSemana,
  escapeHtml,
  idCurto,
  reais,
  somarDias,
} from "./_local";

const CANCELADOS = ["cancelado_cliente", "cancelado_operacao"];

const MEIO_LABEL: Record<MeioPagamento, string> = {
  pix: "PIX",
  dinheiro: "Dinheiro",
  cartao: "Cartão",
  transferencia: "Transferência",
};

/** 1 = segunda-feira, no fuso de São Paulo. */
export function diaDaSemanaSP(quando: Date = new Date()): number {
  const iso = dataSP(quando);
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

export function ehSegunda(quando: Date = new Date()): boolean {
  return diaDaSemanaSP(quando) === 1;
}

/** Segunda-feira da semana de `iso` (aritmética de calendário, sem fuso). */
export function inicioSemana(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dia = new Date(Date.UTC(a, m - 1, d)).getUTCDay();
  return somarDias(iso, dia === 0 ? -6 : 1 - dia);
}

// ---------------------------------------------------------------------------
// Resumo diário
// ---------------------------------------------------------------------------

export interface ContagemResumoDiario {
  agenda: number;
  solicitacoes: number;
  conversas_humano: number;
  relatorios_pendentes: number;
  cobrancas_vencendo: number;
}

export async function resumoDiario(
  db: Admin = admin(),
  agora: Date = new Date(),
): Promise<{ texto: string; contagem: ContagemResumoDiario }> {
  const hoje = dataSP(agora);
  const blocos: string[] = [];

  // 1. agenda de hoje --------------------------------------------------------
  let agenda: Awaited<ReturnType<typeof atendimentosEntre>> = [];
  try {
    agenda = (await atendimentosEntre(hoje, hoje, db)).filter(
      (a) => !CANCELADOS.includes(a.status),
    );
  } catch {
    agenda = [];
  }
  blocos.push(
    agenda.length === 0
      ? "📅 <b>Agenda de hoje</b>\nNenhum atendimento."
      : [
          `📅 <b>Agenda de hoje (${agenda.length})</b>`,
          ...agenda.map(
            (a) =>
              `• <b>${escapeHtml(a.hora_prevista_inicio.slice(0, 5))}</b> ${escapeHtml(
                a.acompanhado?.apelido || a.acompanhado?.nome || "—",
              )} · ${escapeHtml(
                TIPO_ATENDIMENTO_LABEL[a.tipo as TipoAtendimento] ?? a.tipo,
              )} · <code>${idCurto(a.id)}</code>`,
          ),
        ].join("\n"),
  );

  // 2. solicitações pendentes ------------------------------------------------
  const { data: solRaw } = await db
    .from("atendimento")
    .select("id, data, hora_prevista_inicio, cliente:cliente_id ( nome )")
    .eq("status", "solicitado")
    .order("data", { ascending: true })
    .limit(20);
  const solicitacoes = (solRaw ?? []) as unknown as {
    id: string;
    data: string;
    hora_prevista_inicio: string;
    cliente: { nome: string } | null;
  }[];
  blocos.push(
    solicitacoes.length === 0
      ? "🙋 <b>Solicitações</b>\nNenhuma aguardando aprovação."
      : [
          `🙋 <b>Solicitações aguardando aprovação (${solicitacoes.length})</b>`,
          ...solicitacoes.map(
            (s) =>
              `• ${escapeHtml(s.cliente?.nome ?? "Cliente")} — ${ddmm(s.data)} ${escapeHtml(
                s.hora_prevista_inicio.slice(0, 5),
              )} · <code>${idCurto(s.id)}</code>`,
          ),
          "Use /solicitacoes para aprovar com um toque.",
        ].join("\n"),
  );

  // 3. conversas aguardando humano ------------------------------------------
  const { data: convRaw } = await db
    .from("conversa_whatsapp")
    .select("id, whatsapp, ultima_mensagem_em, cliente:cliente_id ( nome )")
    .eq("estado", "humano")
    .order("ultima_mensagem_em", { ascending: true })
    .limit(20);
  const conversas = (convRaw ?? []) as unknown as {
    id: string;
    whatsapp: string;
    cliente: { nome: string } | null;
  }[];
  blocos.push(
    conversas.length === 0
      ? "💬 <b>Conversas</b>\nNinguém esperando atendimento humano."
      : [
          `💬 <b>Aguardando humano (${conversas.length})</b>`,
          ...conversas.map(
            (c) =>
              `• ${escapeHtml(c.cliente?.nome ?? `+${c.whatsapp}`)} · <code>${escapeHtml(
                c.whatsapp,
              )}</code>`,
          ),
        ].join("\n"),
  );

  // 4. relatórios pendentes --------------------------------------------------
  const { data: relRaw } = await db
    .from("atendimento")
    .select("id, data, acompanhado:acompanhado_id ( nome )")
    .eq("status", "concluido")
    .is("relatorio_enviado_em", null)
    .order("data", { ascending: true })
    .limit(20);
  const relatorios = (relRaw ?? []) as unknown as {
    id: string;
    data: string;
    acompanhado: { nome: string } | null;
  }[];
  if (relatorios.length > 0) {
    blocos.push(
      [
        `⏳ <b>Relatórios pendentes (${relatorios.length})</b>`,
        ...relatorios.map(
          (r) =>
            `• ${escapeHtml(r.acompanhado?.nome ?? "")} · ${ddmm(r.data)} · <code>/relatorio ${idCurto(r.id)}</code>`,
        ),
      ].join("\n"),
    );
  }

  // 5. cobranças vencendo nos próximos 3 dias --------------------------------
  const limite = somarDias(hoje, 3);
  const { data: cobRaw } = await db
    .from("pagamento")
    .select("id, valor_centavos, vencimento, cliente:cliente_id ( nome )")
    .eq("status", "pendente")
    .not("vencimento", "is", null)
    .lte("vencimento", limite)
    .order("vencimento", { ascending: true })
    .limit(20);
  const cobrancas = (cobRaw ?? []) as unknown as {
    id: string;
    valor_centavos: number;
    vencimento: string;
    cliente: { nome: string } | null;
  }[];
  if (cobrancas.length > 0) {
    blocos.push(
      [
        `💸 <b>Cobranças vencendo (${cobrancas.length})</b>`,
        ...cobrancas.map(
          (c) =>
            `• ${escapeHtml(c.cliente?.nome ?? "")} — ${reais(
              Number(c.valor_centavos),
            )} até ${ddmm(c.vencimento)}${c.vencimento < hoje ? " ⚠️ vencida" : ""}`,
        ),
      ].join("\n"),
    );
  }

  const texto = [
    `<b>☀️ Resumo de ${ddmm(hoje)} (${diaSemana(hoje)})</b>`,
    ...blocos,
  ].join("\n\n");

  return {
    texto,
    contagem: {
      agenda: agenda.length,
      solicitacoes: solicitacoes.length,
      conversas_humano: conversas.length,
      relatorios_pendentes: relatorios.length,
      cobrancas_vencendo: cobrancas.length,
    },
  };
}

export async function enviarResumoDiario(
  db: Admin = admin(),
  agora: Date = new Date(),
): Promise<{ enviado: boolean; contagem: ContagemResumoDiario }> {
  const { texto, contagem } = await resumoDiario(db, agora);
  return { enviado: await notificarGestao(texto), contagem };
}

// ---------------------------------------------------------------------------
// Resumo financeiro semanal
// ---------------------------------------------------------------------------

export interface ContagemFinanceira {
  de: string;
  ate: string;
  recebido_centavos: number;
  pendente_centavos: number;
  pacotes_vendidos: number;
  horas_atendidas: number;
  receita_por_hora_centavos: number;
}

export async function resumoFinanceiroSemanal(
  db: Admin = admin(),
  agora: Date = new Date(),
): Promise<{ texto: string; contagem: ContagemFinanceira }> {
  const hoje = dataSP(agora);
  // Semana fechada: segunda a domingo anteriores à segunda de hoje.
  const segundaAtual = inicioSemana(hoje);
  const de = somarDias(segundaAtual, -7);
  const ate = somarDias(segundaAtual, -1);
  const deTs = `${de}T00:00:00-03:00`;
  const ateTs = `${somarDias(ate, 1)}T00:00:00-03:00`;

  // 1. recebido por meio -----------------------------------------------------
  const { data: pagosRaw } = await db
    .from("pagamento")
    .select("id, valor_centavos, meio")
    .eq("status", "pago")
    .gte("pago_em", deTs)
    .lt("pago_em", ateTs);
  const pagos = (pagosRaw ?? []) as {
    valor_centavos: number;
    meio: MeioPagamento;
  }[];

  const porMeio = new Map<string, number>();
  let recebido = 0;
  for (const p of pagos) {
    const v = Number(p.valor_centavos) || 0;
    recebido += v;
    porMeio.set(p.meio, (porMeio.get(p.meio) ?? 0) + v);
  }

  // 2. pendente (tudo que ainda não foi pago) --------------------------------
  const { data: pendRaw } = await db
    .from("pagamento")
    .select("valor_centavos")
    .eq("status", "pendente");
  const pendente = ((pendRaw ?? []) as { valor_centavos: number }[]).reduce(
    (s, p) => s + (Number(p.valor_centavos) || 0),
    0,
  );

  // 3. pacotes vendidos na semana -------------------------------------------
  const { data: pacRaw } = await db
    .from("pacote")
    .select("id, horas_contratadas, criado_em, plano:plano_id ( nome )")
    .gte("criado_em", deTs)
    .lt("criado_em", ateTs);
  const pacotes = (pacRaw ?? []) as unknown as {
    id: string;
    horas_contratadas: number;
    plano: { nome: string } | null;
  }[];

  // 4. horas atendidas -------------------------------------------------------
  const { data: atdRaw } = await db
    .from("atendimento")
    .select("id, horas_debitadas, status")
    .in("status", ["concluido", "relatado"])
    .gte("data", de)
    .lte("data", ate);
  const horas = ((atdRaw ?? []) as { horas_debitadas: number | null }[]).reduce(
    (s, a) => s + (Number(a.horas_debitadas) || 0),
    0,
  );

  const receitaHora = horas > 0 ? Math.round(recebido / horas) : 0;

  const linhasMeio =
    porMeio.size === 0
      ? ["• Nada recebido nesta semana."]
      : [...porMeio.entries()].map(
          ([meio, valor]) =>
            `• ${escapeHtml(MEIO_LABEL[meio as MeioPagamento] ?? meio)}: <b>${reais(valor)}</b>`,
        );

  const texto = [
    `<b>💰 Financeiro — semana de ${ddmm(de)} a ${ddmm(ate)}</b>`,
    "",
    `<b>Recebido:</b> ${reais(recebido)} (${pagos.length} pagamento${pagos.length === 1 ? "" : "s"})`,
    ...linhasMeio,
    "",
    `<b>Pendente em aberto:</b> ${reais(pendente)}`,
    `<b>Pacotes vendidos:</b> ${pacotes.length}${
      pacotes.length
        ? ` — ${escapeHtml(
            pacotes
              .map((p) => `${p.plano?.nome ?? "Pacote"} (${p.horas_contratadas}h)`)
              .join(", "),
          )}`
        : ""
    }`,
    `<b>Horas atendidas:</b> ${horas}h`,
    `<b>Receita por hora:</b> ${horas > 0 ? reais(receitaHora) : "—"}`,
  ].join("\n");

  return {
    texto,
    contagem: {
      de,
      ate,
      recebido_centavos: recebido,
      pendente_centavos: pendente,
      pacotes_vendidos: pacotes.length,
      horas_atendidas: horas,
      receita_por_hora_centavos: receitaHora,
    },
  };
}

export async function enviarResumoFinanceiroSemanal(
  db: Admin = admin(),
  agora: Date = new Date(),
): Promise<{ enviado: boolean; contagem: ContagemFinanceira }> {
  const { texto, contagem } = await resumoFinanceiroSemanal(db, agora);
  return { enviado: await notificarGestao(texto), contagem };
}

/**
 * Chamado pelo cron diário: só envia o financeiro às segundas-feiras.
 * Devolve null nos outros dias.
 */
export async function enviarResumoFinanceiroSeSegunda(
  db: Admin = admin(),
  agora: Date = new Date(),
): Promise<{ enviado: boolean; contagem: ContagemFinanceira } | null> {
  if (!ehSegunda(agora)) return null;
  return enviarResumoFinanceiroSemanal(db, agora);
}
