/**
 * Handlers dos comandos do bot (PT-BR). Cada handler recebe um contexto
 * mínimo (`CtxLike`) — não depende do tipo concreto do grammy, o que deixa
 * tudo testável com um contexto mockado.
 *
 * Toda ação que muda dados grava um `evento` com canal 'telegram'.
 */
import type { Admin, AtendimentoJoin } from "./dados";
import {
  acharPorIdCurto,
  acharUnicoPorNome,
  admin,
  chatAutorizado,
  atendimentosEntre,
  lerConfigNum,
  registrarEvento,
} from "./dados";
import {
  calcularHoras,
  dataSP,
  ddmm,
  diaSemana,
  escapeHtml,
  horaSP,
  idCurto,
  instante,
  montarRelatorio,
  reais,
  somarDias,
  TOLERANCIA_ESPERA_PADRAO_MIN,
} from "./_local";
import { parseAgendar, parseFinalizar, parseIdEResto } from "./parsers";
import {
  STATUS_ATENDIMENTO_LABEL,
  TIPO_ATENDIMENTO_LABEL,
  type StatusAtendimento,
  type TipoAtendimento,
} from "@/lib/domain/types";

/** Superfície mínima do contexto grammy que os handlers usam. */
export interface CtxLike {
  chat?: { id: number | string } | undefined;
  message?: { text?: string } | undefined;
  reply: (texto: string, opcoes?: Record<string, unknown>) => Promise<unknown>;
}

const HTML = {
  parse_mode: "HTML",
  link_preview_options: { is_disabled: true },
} as const;

export async function responder(ctx: CtxLike, texto: string) {
  await ctx.reply(texto, HTML);
}

/**
 * Porteiro: responde "não autorizado" (com o chat id, para a gestora poder
 * cadastrar) e devolve false quando o chat não pode usar o bot.
 */
export async function guardaAutorizacao(
  ctx: CtxLike,
  autorizado: (chatId: string | number) => Promise<boolean> = (id) =>
    chatAutorizado(id),
): Promise<boolean> {
  const chatId = ctx.chat?.id;
  if (chatId === undefined) return false;
  if (await autorizado(chatId)) return true;
  await ctx.reply(
    [
      "Este bot é privado do Vou Contigo e este chat não está autorizado.",
      `Se você é da equipe, peça para cadastrar este chat id: ${chatId}`,
    ].join("\n"),
  );
  return false;
}

/** Transições permitidas pelo ciclo de estados do §1 do PLANO. */
const INICIAVEIS: string[] = ["solicitado", "agendado", "confirmado"];
const FINALIZAVEIS: string[] = [
  "solicitado",
  "agendado",
  "confirmado",
  "em_andamento",
];
const TERMINAIS_FATURADOS: string[] = ["concluido", "relatado"];

/** Bloco de texto para copiar/colar no WhatsApp. */
function bloco(texto: string): string {
  return `<pre>${escapeHtml(texto)}</pre>`;
}

function textoDe(ctx: CtxLike): string {
  return ctx.message?.text ?? "";
}

// ---------------------------------------------------------------------------
// /ajuda
// ---------------------------------------------------------------------------

export const AJUDA = [
  "<b>Vou Contigo — bot da gestão</b>",
  "",
  "<b>Agenda</b>",
  "/hoje · /amanha · /semana — atendimentos do período",
  "",
  "<b>Agendar</b> (linha única, campos separados por <code>|</code>)",
  "<code>/agendar cliente | acompanhado | tipo | dd/mm hh:mm | duração min | destino</code>",
  "Ex.: <code>/agendar Maria Silva | Dona Ana | consulta | 12/03 14:30 | 120 | Hospital Moinhos</code>",
  "Tipos: consulta, exame, fisioterapia, mercado, farmacia, banco, passeio, outro.",
  "O cliente e o acompanhado são buscados por parte do nome.",
  "",
  "<b>Execução</b> (id = os 8 primeiros caracteres mostrados na agenda)",
  "/iniciar &lt;id&gt; — marca início real",
  "/finalizar &lt;id&gt; espera=&lt;min&gt; km=&lt;n&gt; estac=&lt;R$&gt; pedagio=&lt;R$&gt; outros=&lt;R$&gt; esforco=&lt;1-5&gt; [obs]",
  "/cancelar &lt;id&gt; [motivo]",
  "",
  "<b>Relatório e comercial</b>",
  "/relatorio &lt;id&gt; — reenvia o texto pronto",
  "/relatorio &lt;id&gt; enviado — marca como enviado à família",
  "/saldo &lt;nome do cliente&gt; — pacotes ativos e horas restantes",
  "/lead — leads novos sem contato",
  "",
  "<b>Solicitações e conversas</b>",
  "/solicitacoes — pendentes, com botões ✅ Aprovar / ✏️ Ajustar / ❌ Recusar",
  "/conversas — quem está aguardando atendimento humano",
  "/responder &lt;whatsapp&gt; &lt;texto&gt; — responde pelo WhatsApp",
  "/liberar &lt;whatsapp&gt; — devolve a conversa para o bot",
  "",
  "<b>Resumos</b>",
  "/resumo — panorama de hoje",
  "/financeiro — dinheiro da última semana",
].join("\n");

export async function cmdAjuda(ctx: CtxLike) {
  await responder(ctx, AJUDA);
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

function linhaAgenda(a: AtendimentoJoin): string {
  const nome = a.acompanhado?.apelido || a.acompanhado?.nome || "—";
  const tipo = TIPO_ATENDIMENTO_LABEL[a.tipo as TipoAtendimento] ?? a.tipo;
  const status =
    STATUS_ATENDIMENTO_LABEL[a.status as StatusAtendimento] ?? a.status;
  return [
    `🕐 <b>${escapeHtml(a.hora_prevista_inicio.slice(0, 5))}</b> — ${escapeHtml(nome)}`,
    `   ${escapeHtml(tipo)} · ${escapeHtml(a.endereco_destino)}`,
    `   ${escapeHtml(status)} · <code>${idCurto(a.id)}</code>`,
  ].join("\n");
}

export function formatarAgenda(
  titulo: string,
  lista: AtendimentoJoin[],
  comData = false,
): string {
  if (lista.length === 0) return `<b>${titulo}</b>\nNenhum atendimento.`;
  const partes: string[] = [`<b>${titulo}</b>`];
  let dataAtual = "";
  for (const a of lista) {
    if (comData && a.data !== dataAtual) {
      dataAtual = a.data;
      partes.push(`\n📅 <b>${ddmm(a.data)} (${diaSemana(a.data)})</b>`);
    }
    partes.push(linhaAgenda(a));
  }
  return partes.join("\n");
}

export async function cmdAgenda(
  ctx: CtxLike,
  periodo: "hoje" | "amanha" | "semana",
  db: Admin = admin(),
) {
  const hoje = dataSP();
  const de = periodo === "amanha" ? somarDias(hoje, 1) : hoje;
  const ate =
    periodo === "semana" ? somarDias(hoje, 6) : periodo === "amanha" ? de : hoje;
  const titulo =
    periodo === "hoje"
      ? `Hoje — ${ddmm(hoje)} (${diaSemana(hoje)})`
      : periodo === "amanha"
        ? `Amanhã — ${ddmm(de)} (${diaSemana(de)})`
        : `Próximos 7 dias — ${ddmm(de)} a ${ddmm(ate)}`;
  const lista = await atendimentosEntre(de, ate, db);
  await responder(ctx, formatarAgenda(titulo, lista, periodo === "semana"));
}

// ---------------------------------------------------------------------------
// /agendar
// ---------------------------------------------------------------------------

export async function cmdAgendar(ctx: CtxLike, db: Admin = admin()) {
  const r = parseAgendar(textoDe(ctx));
  if (!r.ok) {
    await responder(ctx, `⚠️ ${escapeHtml(r.erro)}`);
    return;
  }
  const p = r.valor;

  const cli = await acharUnicoPorNome<{ id: string; nome: string }>(
    "cliente",
    p.cliente,
    "id, nome",
    db,
  );
  if (!cli.ok) {
    await responder(ctx, `⚠️ ${escapeHtml(cli.erro)}`);
    return;
  }

  const { data: acomps, error: errAcomp } = await db
    .from("acompanhado")
    .select("id, nome, endereco")
    .eq("cliente_id", cli.registro.id)
    .ilike("nome", `%${p.acompanhado}%`)
    .limit(10);
  if (errAcomp) {
    await responder(ctx, `⚠️ ${escapeHtml(errAcomp.message)}`);
    return;
  }
  const lista = (acomps ?? []) as { id: string; nome: string; endereco: string }[];
  if (lista.length !== 1) {
    await responder(
      ctx,
      lista.length === 0
        ? `⚠️ Nenhum acompanhado de ${escapeHtml(cli.registro.nome)} com nome parecido com "${escapeHtml(p.acompanhado)}".`
        : `⚠️ Acompanhado ambíguo: ${escapeHtml(lista.map((l) => l.nome).join(", "))}.`,
    );
    return;
  }
  const acompanhado = lista[0];

  // acompanhante: atribui automaticamente se houver exatamente uma ativa
  const { data: ativas } = await db
    .from("acompanhante")
    .select("id")
    .eq("ativo", true)
    .limit(2);
  const acompanhante_id =
    ativas && ativas.length === 1 ? (ativas[0] as { id: string }).id : null;

  // pacote: anexa se houver exatamente um ativo com saldo cobrindo a data
  const { data: pacotes } = await db
    .from("pacote")
    .select("id, horas_contratadas, horas_usadas")
    .eq("cliente_id", cli.registro.id)
    .eq("status", "ativo")
    .lte("valido_de", p.data)
    .gte("valido_ate", p.data);
  const comSaldo = (
    (pacotes ?? []) as {
      id: string;
      horas_contratadas: number;
      horas_usadas: number;
    }[]
  ).filter((x) => x.horas_contratadas - x.horas_usadas > 0);
  const pacote_id = comSaldo.length === 1 ? comSaldo[0].id : null;

  const { data: criado, error } = await db
    .from("atendimento")
    .insert({
      cliente_id: cli.registro.id,
      acompanhado_id: acompanhado.id,
      acompanhante_id,
      pacote_id,
      tipo: p.tipo,
      endereco_saida: acompanhado.endereco,
      endereco_destino: p.destino,
      data: p.data,
      hora_prevista_inicio: p.hora,
      duracao_prevista_min: p.duracao_min,
      status: "agendado",
    })
    .select("id")
    .single();

  if (error || !criado) {
    await responder(ctx, `⚠️ Erro ao criar: ${escapeHtml(error?.message)}`);
    return;
  }

  const novoId = (criado as { id: string }).id;
  await registrarEvento(db, {
    tipo: "atendimento.criado",
    canal: "telegram",
    atendimento_id: novoId,
    cliente_id: cli.registro.id,
    payload: { origem: "bot", ...p },
  });

  await responder(
    ctx,
    [
      "✅ <b>Agendado</b>",
      `${escapeHtml(acompanhado.nome)} · ${escapeHtml(TIPO_ATENDIMENTO_LABEL[p.tipo])}`,
      `${ddmm(p.data)} às ${escapeHtml(p.hora)} (${p.duracao_min} min)`,
      `Destino: ${escapeHtml(p.destino)}`,
      pacote_id ? "Debita do pacote ativo." : "Sem pacote — cobrança avulsa.",
      `Id: <code>${idCurto(novoId)}</code>`,
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// /iniciar
// ---------------------------------------------------------------------------

export async function cmdIniciar(ctx: CtxLike, db: Admin = admin()) {
  const r = parseIdEResto(textoDe(ctx), "iniciar");
  if (!r.ok) return responder(ctx, `⚠️ ${escapeHtml(r.erro)}`);

  const achado = await acharPorIdCurto(r.valor.id_curto, db);
  if (!achado.ok) return responder(ctx, `⚠️ ${escapeHtml(achado.erro)}`);
  const a = achado.atendimento;

  if (!INICIAVEIS.includes(a.status)) {
    return responder(
      ctx,
      `⚠️ Não dá para iniciar: o atendimento está como <b>${escapeHtml(
        STATUS_ATENDIMENTO_LABEL[a.status as StatusAtendimento] ?? a.status,
      )}</b>.`,
    );
  }

  const agora = new Date();
  const { error } = await db
    .from("atendimento")
    .update({ inicio_real: agora.toISOString(), status: "em_andamento" })
    .eq("id", a.id);
  if (error) return responder(ctx, `⚠️ ${escapeHtml(error.message)}`);

  await registrarEvento(db, {
    tipo: "atendimento.iniciado",
    canal: "telegram",
    atendimento_id: a.id,
    cliente_id: a.cliente_id,
    payload: { inicio_real: agora.toISOString() },
  });

  return responder(
    ctx,
    `▶️ Em andamento — ${escapeHtml(a.acompanhado?.nome ?? "")} · início ${horaSP(agora)}`,
  );
}

// ---------------------------------------------------------------------------
// /cancelar
// ---------------------------------------------------------------------------

export async function cmdCancelar(ctx: CtxLike, db: Admin = admin()) {
  const r = parseIdEResto(textoDe(ctx), "cancelar");
  if (!r.ok) return responder(ctx, `⚠️ ${escapeHtml(r.erro)}`);

  const achado = await acharPorIdCurto(r.valor.id_curto, db);
  if (!achado.ok) return responder(ctx, `⚠️ ${escapeHtml(achado.erro)}`);
  const a = achado.atendimento;
  if (TERMINAIS_FATURADOS.includes(a.status)) {
    return responder(
      ctx,
      "⚠️ Atendimento já concluído/relatado — não pode ser cancelado pelo bot.",
    );
  }
  const motivo = r.valor.resto;

  const { error } = await db
    .from("atendimento")
    .update({ status: "cancelado_operacao", motivo_cancelamento: motivo })
    .eq("id", a.id);
  if (error) return responder(ctx, `⚠️ ${escapeHtml(error.message)}`);

  await registrarEvento(db, {
    tipo: "atendimento.cancelado",
    canal: "telegram",
    atendimento_id: a.id,
    cliente_id: a.cliente_id,
    payload: { motivo, status: "cancelado_operacao" },
  });

  return responder(
    ctx,
    [
      "🚫 <b>Cancelado</b>",
      `${escapeHtml(a.acompanhado?.nome ?? "")} · ${ddmm(a.data)} ${escapeHtml(a.hora_prevista_inicio.slice(0, 5))}`,
      motivo ? `Motivo: ${escapeHtml(motivo)}` : "Sem motivo informado.",
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// /finalizar
// ---------------------------------------------------------------------------

/** Saldo restante do pacote, já considerando o débito aplicado. */
async function debitarPacote(
  db: Admin,
  atendimentoId: string,
  pacoteId: string,
  horas: number,
): Promise<number | null> {
  const rpc = await db.rpc("debitar_horas_pacote", {
    atendimento_id: atendimentoId,
  });
  const ausente =
    rpc.error &&
    (rpc.error.code === "PGRST202" ||
      rpc.error.code === "42883" ||
      /could not find the function|does not exist/i.test(rpc.error.message));
  if (rpc.error && !ausente) {
    console.error("[telegram] debitar_horas_pacote falhou:", rpc.error);
    return null;
  }
  if (ausente) {
    // Função SQL ainda não existe (outro agente) — débito manual equivalente.
    const { data } = await db
      .from("pacote")
      .select("horas_contratadas, horas_usadas")
      .eq("id", pacoteId)
      .maybeSingle();
    if (!data) return null;
    const p = data as { horas_contratadas: number; horas_usadas: number };
    const usadas = Number(p.horas_usadas) + horas;
    await db
      .from("pacote")
      .update({
        horas_usadas: usadas,
        status: usadas >= Number(p.horas_contratadas) ? "esgotado" : "ativo",
      })
      .eq("id", pacoteId);
    return Math.max(0, Number(p.horas_contratadas) - usadas);
  }
  const { data } = await db
    .from("pacote")
    .select("horas_contratadas, horas_usadas")
    .eq("id", pacoteId)
    .maybeSingle();
  if (!data) return null;
  const p = data as { horas_contratadas: number; horas_usadas: number };
  return Math.max(0, Number(p.horas_contratadas) - Number(p.horas_usadas));
}

export async function cmdFinalizar(ctx: CtxLike, db: Admin = admin()) {
  const r = parseFinalizar(textoDe(ctx));
  if (!r.ok) return responder(ctx, `⚠️ ${escapeHtml(r.erro)}`);
  const p = r.valor;

  const achado = await acharPorIdCurto(p.id_curto, db);
  if (!achado.ok) return responder(ctx, `⚠️ ${escapeHtml(achado.erro)}`);
  const a = achado.atendimento;

  if (!FINALIZAVEIS.includes(a.status)) {
    return responder(
      ctx,
      a.status === "concluido" || a.status === "relatado"
        ? `⚠️ Esse atendimento já foi finalizado. Use <code>/relatorio ${idCurto(a.id)}</code>.`
        : `⚠️ Não dá para finalizar: status atual é <b>${escapeHtml(
            STATUS_ATENDIMENTO_LABEL[a.status as StatusAtendimento] ?? a.status,
          )}</b>.`,
    );
  }

  const fim = new Date();
  let aviso = "";
  let inicio: Date;
  if (a.inicio_real) {
    inicio = new Date(a.inicio_real);
  } else {
    inicio = instante(a.data, a.hora_prevista_inicio);
    aviso = "\n⚠️ Sem /iniciar — usei o horário previsto como início.";
  }

  const tolerancia = await lerConfigNum(
    "tolerancia_espera_min",
    TOLERANCIA_ESPERA_PADRAO_MIN,
    db,
  );
  const calc = calcularHoras(inicio, fim, p.minutos_espera, tolerancia);
  const extras =
    p.custo_estacionamento_centavos +
    p.custo_pedagio_centavos +
    p.custo_outros_centavos;

  const { error } = await db
    .from("atendimento")
    .update({
      inicio_real: inicio.toISOString(),
      fim_real: fim.toISOString(),
      minutos_espera: p.minutos_espera,
      km_rodados: p.km_rodados,
      custo_estacionamento_centavos: p.custo_estacionamento_centavos,
      custo_pedagio_centavos: p.custo_pedagio_centavos,
      custo_outros_centavos: p.custo_outros_centavos,
      nivel_esforco: p.nivel_esforco,
      observacoes_internas: p.observacoes_internas,
      horas_debitadas: calc.horas_debitadas,
      valor_extras_centavos: extras,
      status: "concluido",
    })
    .eq("id", a.id);
  if (error) return responder(ctx, `⚠️ ${escapeHtml(error.message)}`);

  let horasRestantes: number | null = null;
  if (a.pacote_id) {
    horasRestantes = await debitarPacote(
      db,
      a.id,
      a.pacote_id,
      calc.horas_debitadas,
    );
  }

  const relatorio = montarRelatorio({
    acompanhado: a.acompanhado?.apelido || a.acompanhado?.nome || "—",
    data: a.data,
    tipo: TIPO_ATENDIMENTO_LABEL[a.tipo as TipoAtendimento] ?? a.tipo,
    destino: a.endereco_destino,
    inicio_real: inicio,
    fim_real: fim,
    texto: p.observacoes_internas,
    extras_centavos: extras,
    horas_restantes: horasRestantes,
  });

  await db
    .from("atendimento")
    .update({ relatorio_texto: relatorio })
    .eq("id", a.id);

  await registrarEvento(db, {
    tipo: "atendimento.finalizado",
    canal: "telegram",
    atendimento_id: a.id,
    cliente_id: a.cliente_id,
    payload: {
      ...calc,
      km_rodados: p.km_rodados,
      nivel_esforco: p.nivel_esforco,
      valor_extras_centavos: extras,
    },
  });

  return responder(
    ctx,
    [
      "✅ <b>Concluído</b>",
      `Duração: ${calc.minutos_brutos} min · espera ${p.minutos_espera} min · ${calc.horas_debitadas}h debitadas`,
      `Extras: ${reais(extras)} · ${p.km_rodados} km · esforço ${p.nivel_esforco}/5`,
      horasRestantes !== null ? `Saldo do pacote: ${horasRestantes}h` : "",
      aviso,
      "",
      "📋 <b>Relatório para o WhatsApp</b> (toque para copiar):",
      bloco(relatorio),
      `Depois de enviar: <code>/relatorio ${idCurto(a.id)} enviado</code>`,
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

// ---------------------------------------------------------------------------
// /relatorio
// ---------------------------------------------------------------------------

export async function cmdRelatorio(ctx: CtxLike, db: Admin = admin()) {
  const r = parseIdEResto(textoDe(ctx), "relatorio");
  if (!r.ok) return responder(ctx, `⚠️ ${escapeHtml(r.erro)}`);

  const achado = await acharPorIdCurto(r.valor.id_curto, db);
  if (!achado.ok) return responder(ctx, `⚠️ ${escapeHtml(achado.erro)}`);
  const a = achado.atendimento;

  if (!a.relatorio_texto) {
    return responder(
      ctx,
      `⚠️ Esse atendimento ainda não tem relatório. Finalize com <code>/finalizar ${idCurto(a.id)} ...</code>`,
    );
  }

  const marcar = (r.valor.resto ?? "").trim().toLowerCase() === "enviado";
  if (marcar) {
    const agora = new Date().toISOString();
    const { error } = await db
      .from("atendimento")
      .update({ relatorio_enviado_em: agora, status: "relatado" })
      .eq("id", a.id);
    if (error) return responder(ctx, `⚠️ ${escapeHtml(error.message)}`);
    await registrarEvento(db, {
      tipo: "relatorio.enviado",
      canal: "telegram",
      atendimento_id: a.id,
      cliente_id: a.cliente_id,
      payload: { relatorio_enviado_em: agora },
    });
    return responder(ctx, "📨 Relatório marcado como enviado à família.");
  }

  return responder(
    ctx,
    `📋 <b>Relatório — ${escapeHtml(a.acompanhado?.nome ?? "")}</b>\n${bloco(a.relatorio_texto)}`,
  );
}

// ---------------------------------------------------------------------------
// /saldo
// ---------------------------------------------------------------------------

export async function cmdSaldo(ctx: CtxLike, db: Admin = admin()) {
  const nome = textoDe(ctx).replace(/^\/saldo(@\w+)?\s*/i, "").trim();
  if (!nome) return responder(ctx, "⚠️ Informe o cliente. Ex.: /saldo Maria");

  const cli = await acharUnicoPorNome<{ id: string; nome: string }>(
    "cliente",
    nome,
    "id, nome",
    db,
  );
  if (!cli.ok) return responder(ctx, `⚠️ ${escapeHtml(cli.erro)}`);

  const { data, error } = await db
    .from("pacote")
    .select("id, horas_contratadas, horas_usadas, valido_ate, plano:plano_id ( nome )")
    .eq("cliente_id", cli.registro.id)
    .eq("status", "ativo")
    .order("valido_ate", { ascending: true });
  if (error) return responder(ctx, `⚠️ ${escapeHtml(error.message)}`);

  const pacotes = (data ?? []) as unknown as {
    id: string;
    horas_contratadas: number;
    horas_usadas: number;
    valido_ate: string;
    plano: { nome: string } | null;
  }[];

  if (pacotes.length === 0) {
    return responder(
      ctx,
      `<b>${escapeHtml(cli.registro.nome)}</b>\nSem pacote ativo — atendimentos são avulsos.`,
    );
  }

  const linhas = pacotes.map((p) => {
    const restante = Number(p.horas_contratadas) - Number(p.horas_usadas);
    return `• ${escapeHtml(p.plano?.nome ?? "Pacote")} — <b>${restante}h</b> de ${p.horas_contratadas}h · vence ${ddmm(p.valido_ate)}`;
  });

  return responder(
    ctx,
    [`<b>Saldo — ${escapeHtml(cli.registro.nome)}</b>`, ...linhas].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// /lead
// ---------------------------------------------------------------------------

export async function cmdLead(ctx: CtxLike, db: Admin = admin()) {
  const { data, error } = await db
    .from("lead")
    .select("id, nome, whatsapp, mensagem, origem, criado_em")
    .eq("status", "novo")
    .order("criado_em", { ascending: false })
    .limit(20);
  if (error) return responder(ctx, `⚠️ ${escapeHtml(error.message)}`);

  const leads = (data ?? []) as {
    id: string;
    nome: string;
    whatsapp: string;
    mensagem: string | null;
    origem: string;
    criado_em: string;
  }[];
  if (leads.length === 0) return responder(ctx, "Nenhum lead novo. 👌");

  const linhas = leads.map((l) => {
    const quando = new Date(l.criado_em);
    return [
      `• <b>${escapeHtml(l.nome)}</b> — ${escapeHtml(l.origem)} · ${ddmm(dataSP(quando))} ${horaSP(quando)}`,
      `  <a href="https://wa.me/${encodeURIComponent(l.whatsapp)}">Abrir WhatsApp</a>`,
      l.mensagem ? `  “${escapeHtml(l.mensagem)}”` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });

  return responder(
    ctx,
    [`<b>Leads novos (${leads.length})</b>`, ...linhas].join("\n"),
  );
}
