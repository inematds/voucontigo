/**
 * Máquina de estados do bot de WhatsApp (PLANO §7.2).
 *
 * Estado vive em `conversa_whatsapp.estado` (enum do banco) + `conversa.dados`
 * (rascunho jsonb). Toda mensagem — de entrada e de saída — é gravada em
 * `mensagem_whatsapp`; `wa_message_id` é a chave de idempotência.
 *
 * Regras duras:
 *  - `estado = humano` silencia o bot por completo (nem "menu" reativa) até a
 *    gestão chamar `liberarConversa`.
 *  - Nada aqui lança: falha vira log + resposta genérica, o webhook responde 200.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createAdminClient } from "@/lib/supabase/admin";
import { criarWhatsAppClient } from "./cliente";
import {
  TIPO_ATENDIMENTO_LABEL,
  type EstadoConversa,
  type TipoAtendimento,
  type SlotDisponivel,
  type StatusMensagem,
} from "@/lib/domain/types";
import { parseConfiguracao, parseTemplates } from "@/lib/domain/config";
import { calcularTaxaCancelamento, calcularValorAvulso, horasRestantes } from "@/lib/domain/horas";
import { formatarData, formatarDiaExtenso, formatarHoras, formatarReais } from "@/lib/domain/templates";
import { notificarGestao } from "@/lib/telegram/notificacoes";
import { escapeHtml } from "@/lib/telegram/_local";
import {
  calcularSlotsLivres,
  dataLocal,
  duracaoPadrao,
  formatarSlots,
  interpretarData,
  parseConfigAgenda,
  somarDias,
  type ConfigAgenda,
  type Ocupado,
} from "./_compat";
import { montarMensagemHorariosLivres } from "./horarios";
import {
  TEXTO_HUMANO,
  TEXTO_NAO_ENTENDI,
  TEXTO_SEM_HORARIOS,
  escolhaNumerica,
  listaNumerada,
  montarMenu,
  pediuMenu,
  renderizar,
} from "./textos";
import type { MensagemNormalizada } from "./normalizar";

/** As RPCs `solicitar_atendimento` e `cancelar_atendimento_familiar` (0005) já
 *  gravam `evento` com o `p_canal` recebido — o fluxo NÃO grava de novo, senão a
 *  timeline do painel mostra cada ação do WhatsApp duas vezes. */
const REGISTRAR_EVENTO_NO_FLUXO = false;

const STATUS_ABERTOS = ["solicitado", "agendado", "confirmado"] as const;
const TIPOS: TipoAtendimento[] = [
  "consulta",
  "exame",
  "fisioterapia",
  "mercado",
  "farmacia",
  "banco",
  "passeio",
  "outro",
];

type SB = SupabaseClient;

interface ConversaRow {
  id: string;
  whatsapp: string;
  cliente_id: string | null;
  estado: EstadoConversa;
  dados: Record<string, unknown>;
}

interface ClienteRow {
  id: string;
  nome: string;
  whatsapp: string;
}

interface AcompanhadoRow {
  id: string;
  nome: string;
  apelido: string | null;
  endereco: string;
}

interface AtendimentoRow {
  id: string;
  tipo: TipoAtendimento;
  data: string;
  hora_prevista_inicio: string;
  duracao_prevista_min: number;
  endereco_destino: string;
  status: string;
  acompanhado_id: string;
}

interface Rascunho {
  acompanhado_id?: string;
  acompanhado_nome?: string;
  acompanhado_endereco?: string;
  tipo?: TipoAtendimento;
  duracao_min?: number;
  data?: string;
  hora?: string;
  destino?: string;
  origem?: "menu" | "horarios";
}

interface Dados {
  rascunho?: Rascunho;
  opcoes?: string[]; // ids na ordem exibida
  slots?: SlotDisponivel[];
  passo?: string;
  [k: string]: unknown;
}

export interface ResultadoProcessamento {
  ok: boolean;
  ignorado?: "duplicada" | "sem_texto";
  estado?: EstadoConversa;
  respostas: string[];
  erro?: string;
}

// ===========================================================================
// Persistência básica
// ===========================================================================

async function carregarConfig(sb: SB) {
  const { data } = await sb.from("configuracao").select("chave, valor");
  const linhas = (data ?? []) as { chave: string; valor: string }[];
  return {
    negocio: parseConfiguracao(linhas),
    agenda: parseConfigAgenda(linhas),
    templates: parseTemplates(linhas),
  };
}

async function carregarConversa(sb: SB, whatsapp: string): Promise<ConversaRow | null> {
  const { data } = await sb
    .from("conversa_whatsapp")
    .select("id, whatsapp, cliente_id, estado, dados")
    .eq("whatsapp", whatsapp)
    .maybeSingle();
  if (data) return data as ConversaRow;

  const { data: nova, error } = await sb
    .from("conversa_whatsapp")
    .insert({ whatsapp, estado: "menu", dados: {} })
    .select("id, whatsapp, cliente_id, estado, dados")
    .single();
  if (error) {
    // corrida: outra requisição criou primeiro
    const { data: existente } = await sb
      .from("conversa_whatsapp")
      .select("id, whatsapp, cliente_id, estado, dados")
      .eq("whatsapp", whatsapp)
      .maybeSingle();
    return (existente as ConversaRow) ?? null;
  }
  return nova as ConversaRow;
}

async function salvarConversa(
  sb: SB,
  conversa: ConversaRow,
  patch: { estado?: EstadoConversa; dados?: Dados; cliente_id?: string | null },
) {
  if (patch.estado !== undefined) conversa.estado = patch.estado;
  if (patch.dados !== undefined) conversa.dados = patch.dados as Record<string, unknown>;
  if (patch.cliente_id !== undefined) conversa.cliente_id = patch.cliente_id;
  await sb
    .from("conversa_whatsapp")
    .update({
      ...patch,
      ultima_mensagem_em: new Date().toISOString(),
    })
    .eq("id", conversa.id);
}

function ehDuplicada(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "23505" || /duplicate key|unique constraint/i.test(error.message ?? "");
}

/** Grava a mensagem de entrada. `false` = já processada antes (idempotência). */
async function gravarEntrada(
  sb: SB,
  conversa_id: string,
  msg: MensagemNormalizada,
): Promise<boolean> {
  const { error } = await sb.from("mensagem_whatsapp").insert({
    conversa_id,
    direcao: "entrada",
    wa_message_id: msg.wa_message_id,
    corpo: msg.texto,
    status: "recebida",
  });
  if (ehDuplicada(error as { code?: string; message?: string } | null)) return false;
  if (error) console.error("[whatsapp] falha ao gravar entrada:", error);
  return true;
}

/** Já existe mensagem com este wa_message_id? (pré-checagem barata do webhook) */
export async function mensagemJaProcessada(wa_message_id: string, sb?: SB): Promise<boolean> {
  if (!wa_message_id) return false;
  const cliente = sb ?? createAdminClient();
  const { data } = await cliente
    .from("mensagem_whatsapp")
    .select("id")
    .eq("wa_message_id", wa_message_id)
    .maybeSingle();
  return Boolean(data);
}

/** Atualiza o status de uma mensagem enviada (evento `messages.update`). */
export async function registrarStatusMensagem(
  wa_message_id: string,
  status: StatusMensagem,
  sb?: SB,
): Promise<void> {
  if (!wa_message_id) return;
  const cliente = sb ?? createAdminClient();
  await cliente.from("mensagem_whatsapp").update({ status }).eq("wa_message_id", wa_message_id);
}

async function enviar(sb: SB, conversa: ConversaRow, texto: string): Promise<void> {
  if (!texto || texto.trim() === "") return;
  const client = criarWhatsAppClient();
  const r = await client.enviarTexto(conversa.whatsapp, texto);
  await sb.from("mensagem_whatsapp").insert({
    conversa_id: conversa.id,
    direcao: "saida",
    wa_message_id: r.wa_message_id,
    corpo: texto,
    status: r.ok ? "enviada" : "falhou",
  });
  if (!r.ok) console.error("[whatsapp] falha ao enviar:", r.erro);
}

async function registrarEvento(
  sb: SB,
  tipo: string,
  cliente_id: string | null,
  atendimento_id: string | null,
  payload: Record<string, unknown>,
) {
  if (!REGISTRAR_EVENTO_NO_FLUXO) return;
  await sb.from("evento").insert({
    tipo,
    cliente_id,
    atendimento_id,
    payload,
    canal: "whatsapp",
  });
}

async function avisarGestao(linhas: string[]) {
  try {
    await notificarGestao(linhas.filter(Boolean).join("\n"));
  } catch (e) {
    console.error("[whatsapp] falha ao notificar gestão:", e);
  }
}

// ===========================================================================
// Consultas auxiliares
// ===========================================================================

async function buscarCliente(sb: SB, id: string): Promise<ClienteRow | null> {
  const { data } = await sb.from("cliente").select("id, nome, whatsapp").eq("id", id).maybeSingle();
  return (data as ClienteRow) ?? null;
}

async function clientePorWhatsApp(sb: SB, whatsapp: string): Promise<ClienteRow | null> {
  const { data } = await sb
    .from("cliente")
    .select("id, nome, whatsapp")
    .eq("whatsapp", whatsapp)
    .maybeSingle();
  return (data as ClienteRow) ?? null;
}

async function listarAcompanhados(sb: SB, cliente_id: string): Promise<AcompanhadoRow[]> {
  const { data } = await sb
    .from("acompanhado")
    .select("id, nome, apelido, endereco")
    .eq("cliente_id", cliente_id)
    .order("nome");
  return (data ?? []) as AcompanhadoRow[];
}

async function listarProximos(sb: SB, cliente_id: string, hoje: string): Promise<AtendimentoRow[]> {
  const { data } = await sb
    .from("atendimento")
    .select(
      "id, tipo, data, hora_prevista_inicio, duracao_prevista_min, endereco_destino, status, acompanhado_id",
    )
    .eq("cliente_id", cliente_id)
    .in("status", STATUS_ABERTOS as unknown as string[])
    .gte("data", hoje)
    .order("data")
    .limit(10);
  return (data ?? []) as AtendimentoRow[];
}

async function ocupados(sb: SB, de: string, ate: string): Promise<Ocupado[]> {
  const { data, error } = await sb.rpc("horarios_ocupados", { p_de: de, p_ate: ate });
  if (error) {
    console.error("[whatsapp] horarios_ocupados falhou:", error);
    return [];
  }
  return (data ?? []) as Ocupado[];
}

function nomeAcompanhado(a: AcompanhadoRow): string {
  return a.apelido || a.nome;
}

function rotuloAtendimento(a: AtendimentoRow, nomes: Map<string, string>): string {
  return `${nomes.get(a.acompanhado_id) ?? "Acompanhado"} · ${
    TIPO_ATENDIMENTO_LABEL[a.tipo] ?? a.tipo
  } — ${formatarData(a.data)} às ${a.hora_prevista_inicio.slice(0, 5)}`;
}

// ===========================================================================
// Entrada principal
// ===========================================================================

export async function processarMensagemRecebida(
  msg: MensagemNormalizada,
  sbInjetado?: SB,
): Promise<ResultadoProcessamento> {
  const sb = sbInjetado ?? (createAdminClient() as SB);
  const respostas: string[] = [];

  const conversa = await carregarConversa(sb, msg.whatsapp);
  if (!conversa) return { ok: false, respostas, erro: "conversa_indisponivel" };

  const nova = await gravarEntrada(sb, conversa.id, msg);
  if (!nova) return { ok: true, ignorado: "duplicada", estado: conversa.estado, respostas };

  const responder = async (texto: string) => {
    respostas.push(texto);
    await enviar(sb, conversa, texto);
  };

  try {
    // vínculo com cliente
    if (!conversa.cliente_id) {
      const cliente = await clientePorWhatsApp(sb, msg.whatsapp);
      if (cliente) await salvarConversa(sb, conversa, { cliente_id: cliente.id });
    }

    // número desconhecido → lead + humano
    if (!conversa.cliente_id) {
      await tratarDesconhecido(sb, conversa, msg, responder);
      return { ok: true, estado: conversa.estado, respostas };
    }

    // bot silenciado
    if (conversa.estado === "humano") {
      await avisarGestao([
        "💬 <b>WhatsApp (atendimento humano)</b>",
        `${escapeHtml(msg.nome ?? msg.whatsapp)} · <code>${escapeHtml(msg.whatsapp)}</code>`,
        `“${escapeHtml(msg.texto)}”`,
      ]);
      return { ok: true, estado: "humano", respostas };
    }

    await rotear(sb, conversa, msg, responder);
    return { ok: true, estado: conversa.estado, respostas };
  } catch (e) {
    console.error("[whatsapp] erro no fluxo:", e);
    await avisarGestao([
      "⚠️ <b>Erro no bot de WhatsApp</b>",
      `<code>${escapeHtml(msg.whatsapp)}</code>`,
      escapeHtml(e instanceof Error ? e.message : String(e)),
    ]);
    return {
      ok: false,
      estado: conversa.estado,
      respostas,
      erro: e instanceof Error ? e.message : String(e),
    };
  }
}

async function tratarDesconhecido(
  sb: SB,
  conversa: ConversaRow,
  msg: MensagemNormalizada,
  responder: (t: string) => Promise<void>,
) {
  const jaAvisado = conversa.estado === "humano";
  if (!jaAvisado) {
    const { templates } = await carregarConfig(sb);
    await responder(renderizar(templates, "template_boas_vindas", { nome: msg.nome ?? "" }));

    const { data: lead } = await sb
      .from("lead")
      .select("id")
      .eq("whatsapp", msg.whatsapp)
      .maybeSingle();
    if (!lead) {
      await sb.from("lead").insert({
        nome: msg.nome || `WhatsApp ${msg.whatsapp}`,
        whatsapp: msg.whatsapp,
        mensagem: msg.texto,
        origem: "whatsapp",
        status: "novo",
      });
    }
    await salvarConversa(sb, conversa, { estado: "humano" });
  }

  await avisarGestao([
    "🌱 <b>WhatsApp de número desconhecido</b>",
    `${escapeHtml(msg.nome ?? "sem nome")} · <code>${escapeHtml(msg.whatsapp)}</code>`,
    `“${escapeHtml(msg.texto)}”`,
    `<a href="https://wa.me/${encodeURIComponent(msg.whatsapp)}">Abrir WhatsApp</a>`,
  ]);
}

// ===========================================================================
// Roteador de estados
// ===========================================================================

async function rotear(
  sb: SB,
  conversa: ConversaRow,
  msg: MensagemNormalizada,
  responder: (t: string) => Promise<void>,
) {
  const texto = msg.texto.trim();

  // "menu" / "0" / "voltar" volta ao início de QUALQUER estado (menos `humano`,
  // tratado antes — o cliente não pode se desilenciar sozinho).
  if (pediuMenu(texto)) {
    await mostrarMenu(sb, conversa, msg, responder);
    return;
  }

  switch (conversa.estado) {
    case "menu":
      return menuPrincipal(sb, conversa, msg, texto, responder);
    case "agendar_acompanhado":
      return passoAcompanhado(sb, conversa, texto, responder);
    case "agendar_tipo":
      return passoTipo(sb, conversa, texto, responder);
    case "agendar_data":
      return passoData(sb, conversa, texto, responder);
    case "agendar_hora":
      return passoHora(sb, conversa, texto, responder);
    case "agendar_destino":
      return passoDestino(sb, conversa, texto, responder);
    case "agendar_confirmar":
      return passoConfirmar(sb, conversa, texto, responder);
    case "cancelar_escolher":
      return passoCancelarEscolher(sb, conversa, texto, responder);
    case "cancelar_confirmar":
      return passoCancelarConfirmar(sb, conversa, texto, responder);
    default:
      return mostrarMenu(sb, conversa, msg, responder);
  }
}

async function mostrarMenu(
  sb: SB,
  conversa: ConversaRow,
  msg: MensagemNormalizada,
  responder: (t: string) => Promise<void>,
) {
  const { templates } = await carregarConfig(sb);
  const cliente = conversa.cliente_id ? await buscarCliente(sb, conversa.cliente_id) : null;
  const nome = (cliente?.nome ?? msg.nome ?? "").split(" ")[0] || "tudo bem";
  await salvarConversa(sb, conversa, { estado: "menu", dados: {} });
  await responder(montarMenu(templates, nome));
}

async function encaminharHumano(
  sb: SB,
  conversa: ConversaRow,
  motivo: string,
  texto: string,
  responder: (t: string) => Promise<void>,
) {
  await salvarConversa(sb, conversa, { estado: "humano" });
  await responder(TEXTO_HUMANO);
  const cliente = conversa.cliente_id ? await buscarCliente(sb, conversa.cliente_id) : null;
  await avisarGestao([
    "🙋 <b>Cliente quer falar com uma pessoa</b>",
    `${escapeHtml(cliente?.nome ?? "—")} · <code>${escapeHtml(conversa.whatsapp)}</code>`,
    `Motivo: ${escapeHtml(motivo)}`,
    `“${escapeHtml(texto)}”`,
    `<a href="https://wa.me/${encodeURIComponent(conversa.whatsapp)}">Abrir WhatsApp</a>`,
  ]);
}

async function menuPrincipal(
  sb: SB,
  conversa: ConversaRow,
  msg: MensagemNormalizada,
  texto: string,
  responder: (t: string) => Promise<void>,
) {
  switch (texto.replace(/[).\s]/g, "")) {
    case "1":
      return iniciarAgendamento(sb, conversa, responder);
    case "2":
      return iniciarCancelamento(sb, conversa, responder);
    case "3":
      return perguntarDuracao(sb, conversa, responder);
    case "4":
      return mostrarSaldo(sb, conversa, msg, responder);
    case "5":
      return encaminharHumano(sb, conversa, "opção 5 do menu", texto, responder);
    default:
      // texto livre não reconhecido no menu → humano (PLANO §7.2)
      return encaminharHumano(sb, conversa, "texto livre fora do menu", texto, responder);
  }
}

// ===========================================================================
// Fluxo 1 — agendar
// ===========================================================================

async function iniciarAgendamento(
  sb: SB,
  conversa: ConversaRow,
  responder: (t: string) => Promise<void>,
  rascunhoInicial: Rascunho = {},
) {
  const acompanhados = await listarAcompanhados(sb, conversa.cliente_id!);
  if (acompanhados.length === 0) {
    return encaminharHumano(sb, conversa, "cliente sem acompanhado cadastrado", "", responder);
  }
  if (acompanhados.length === 1) {
    const a = acompanhados[0];
    const rascunho: Rascunho = {
      ...rascunhoInicial,
      acompanhado_id: a.id,
      acompanhado_nome: nomeAcompanhado(a),
      acompanhado_endereco: a.endereco,
    };
    return perguntarTipo(sb, conversa, rascunho, responder);
  }

  await salvarConversa(sb, conversa, {
    estado: "agendar_acompanhado",
    dados: { rascunho: rascunhoInicial, opcoes: acompanhados.map((a) => a.id) },
  });
  await responder(
    `Para quem é o acompanhamento?\n${listaNumerada(acompanhados.map(nomeAcompanhado))}`,
  );
}

async function passoAcompanhado(
  sb: SB,
  conversa: ConversaRow,
  texto: string,
  responder: (t: string) => Promise<void>,
) {
  const dados = conversa.dados as Dados;
  const opcoes = dados.opcoes ?? [];
  const n = escolhaNumerica(texto, opcoes.length);
  if (!n) return responder(TEXTO_NAO_ENTENDI);

  const acompanhados = await listarAcompanhados(sb, conversa.cliente_id!);
  const escolhido = acompanhados.find((a) => a.id === opcoes[n - 1]);
  if (!escolhido) return responder(TEXTO_NAO_ENTENDI);

  const rascunho: Rascunho = {
    ...(dados.rascunho ?? {}),
    acompanhado_id: escolhido.id,
    acompanhado_nome: nomeAcompanhado(escolhido),
    acompanhado_endereco: escolhido.endereco,
  };
  return perguntarTipo(sb, conversa, rascunho, responder);
}

async function perguntarTipo(
  sb: SB,
  conversa: ConversaRow,
  rascunho: Rascunho,
  responder: (t: string) => Promise<void>,
) {
  await salvarConversa(sb, conversa, {
    estado: "agendar_tipo",
    dados: { rascunho, opcoes: TIPOS },
  });
  await responder(
    `Qual é o compromisso?\n${listaNumerada(TIPOS.map((t) => TIPO_ATENDIMENTO_LABEL[t]))}`,
  );
}

async function passoTipo(
  sb: SB,
  conversa: ConversaRow,
  texto: string,
  responder: (t: string) => Promise<void>,
) {
  const dados = conversa.dados as Dados;
  const n = escolhaNumerica(texto, TIPOS.length);
  if (!n) return responder(TEXTO_NAO_ENTENDI);

  const tipo = TIPOS[n - 1];
  const rascunho: Rascunho = { ...(dados.rascunho ?? {}), tipo };
  // Quando o cliente já escolheu o horário no fluxo 3, pula data/hora.
  if (rascunho.data && rascunho.hora) {
    rascunho.duracao_min = rascunho.duracao_min ?? duracaoPadrao(tipo);
    return perguntarDestino(sb, conversa, rascunho, responder);
  }
  rascunho.duracao_min = duracaoPadrao(tipo);
  return perguntarData(sb, conversa, rascunho, responder);
}

async function perguntarData(
  sb: SB,
  conversa: ConversaRow,
  rascunho: Rascunho,
  responder: (t: string) => Promise<void>,
) {
  await salvarConversa(sb, conversa, { estado: "agendar_data", dados: { rascunho } });
  await responder("Para que dia? Pode responder *amanhã* ou a data no formato *dd/mm*.");
}

async function passoData(
  sb: SB,
  conversa: ConversaRow,
  texto: string,
  responder: (t: string) => Promise<void>,
) {
  const dados = conversa.dados as Dados;
  // `agendar_data` + dados.passo='duracao' é a pergunta do fluxo 3 (horários livres).
  if (await passoDuracao(sb, conversa, texto, responder)) return;
  const rascunho: Rascunho = dados.rascunho ?? {};
  const agora = new Date();
  const hoje = dataLocal(agora);
  const data = interpretarData(texto, hoje);
  if (!data || data < hoje) {
    return responder("Não consegui entender a data. Tente *amanhã* ou *dd/mm* (ex.: 24/09).");
  }

  const { agenda, templates } = await carregarConfig(sb);
  const duracao = rascunho.duracao_min ?? duracaoPadrao(rascunho.tipo ?? "outro");
  const livres = await slotsDoDia(sb, data, duracao, agenda, agora);

  if (livres.length === 0) {
    return responder(
      `Não tenho horário livre em ${formatarData(data)}. Me diga outro dia, ou mande *3* para ver os próximos horários.`,
    );
  }

  await salvarConversa(sb, conversa, {
    estado: "agendar_hora",
    dados: { rascunho: { ...rascunho, data }, slots: livres },
  });
  await responder(
    renderizar(templates, "template_horarios_livres", {
      nome: "",
      acompanhado: rascunho.acompanhado_nome ?? "",
      duracao: formatarHoras(duracao / 60),
      slots: formatarSlots(livres),
    }),
  );
}

async function slotsDoDia(
  sb: SB,
  data: string,
  duracao: number,
  agenda: ConfigAgenda,
  agora: Date,
): Promise<SlotDisponivel[]> {
  const janela = await ocupados(sb, data, data);
  return calcularSlotsLivres({
    de: data,
    dias: 1,
    duracao_min: duracao,
    config: agenda,
    ocupados: janela,
    agora,
    limite: 8,
  });
}

async function passoHora(
  sb: SB,
  conversa: ConversaRow,
  texto: string,
  responder: (t: string) => Promise<void>,
) {
  const dados = conversa.dados as Dados;
  const slots = dados.slots ?? [];
  const n = escolhaNumerica(texto, slots.length);
  if (!n) return responder(TEXTO_NAO_ENTENDI);
  const slot = slots[n - 1];

  const rascunho: Rascunho = {
    ...(dados.rascunho ?? {}),
    data: slot.data,
    hora: slot.hora,
  };

  // Veio do fluxo 3 (lista de horários) e ainda falta acompanhado/tipo.
  if (!rascunho.acompanhado_id) return iniciarAgendamento(sb, conversa, responder, rascunho);
  if (!rascunho.tipo) return perguntarTipo(sb, conversa, rascunho, responder);

  return perguntarDestino(sb, conversa, rascunho, responder);
}

async function perguntarDestino(
  sb: SB,
  conversa: ConversaRow,
  rascunho: Rascunho,
  responder: (t: string) => Promise<void>,
) {
  await salvarConversa(sb, conversa, { estado: "agendar_destino", dados: { rascunho } });
  await responder("Para onde vamos? Me manda o endereço ou o nome do local.");
}

async function passoDestino(
  sb: SB,
  conversa: ConversaRow,
  texto: string,
  responder: (t: string) => Promise<void>,
) {
  const dados = conversa.dados as Dados;
  const destino = texto.trim();
  if (destino.length < 3) return responder("Preciso do endereço ou do nome do local, por favor.");

  const rascunho: Rascunho = { ...(dados.rascunho ?? {}), destino };
  await salvarConversa(sb, conversa, { estado: "agendar_confirmar", dados: { rascunho } });
  await responder(
    [
      "Confere para mim:",
      `• ${rascunho.acompanhado_nome}`,
      `• ${TIPO_ATENDIMENTO_LABEL[rascunho.tipo as TipoAtendimento] ?? rascunho.tipo}`,
      `• ${formatarDiaExtenso(rascunho.data!)} às ${rascunho.hora}`,
      `• Destino: ${destino}`,
      "",
      "1. Confirmar",
      "2. Corrigir",
    ].join("\n"),
  );
}

async function passoConfirmar(
  sb: SB,
  conversa: ConversaRow,
  texto: string,
  responder: (t: string) => Promise<void>,
) {
  const dados = conversa.dados as Dados;
  const rascunho: Rascunho = dados.rascunho ?? {};
  const escolha = texto.replace(/[).\s]/g, "");

  if (escolha === "2") return iniciarAgendamento(sb, conversa, responder);
  if (escolha !== "1") return responder("Responda *1* para confirmar ou *2* para corrigir.");

  const { templates } = await carregarConfig(sb);
  const duracao = rascunho.duracao_min ?? duracaoPadrao(rascunho.tipo ?? "outro");

  const { data, error } = await sb.rpc("solicitar_atendimento", {
    p_cliente_id: conversa.cliente_id,
    p_acompanhado_id: rascunho.acompanhado_id,
    p_tipo: rascunho.tipo,
    p_data: rascunho.data,
    p_hora: rascunho.hora,
    p_duracao_min: duracao,
    p_destino: rascunho.destino,
    p_saida: rascunho.acompanhado_endereco ?? "",
    p_canal: "whatsapp",
  });

  if (error) {
    console.error("[whatsapp] solicitar_atendimento falhou:", error);
    return encaminharHumano(sb, conversa, "falha ao registrar solicitação", texto, responder);
  }

  const atendimento_id = extrairId(data);
  await registrarEvento(sb, "atendimento.solicitado", conversa.cliente_id, atendimento_id, {
    origem: "whatsapp",
    tipo: rascunho.tipo,
    data: rascunho.data,
    hora: rascunho.hora,
    destino: rascunho.destino,
  });

  await salvarConversa(sb, conversa, { estado: "menu", dados: {} });
  await responder(
    renderizar(templates, "template_solicitacao_recebida", {
      nome: rascunho.acompanhado_nome ?? "",
      acompanhado: rascunho.acompanhado_nome ?? "",
      tipo: TIPO_ATENDIMENTO_LABEL[rascunho.tipo as TipoAtendimento] ?? rascunho.tipo,
      dia: formatarDiaExtenso(rascunho.data!),
      data: formatarData(rascunho.data!),
      hora: rascunho.hora ?? "",
      destino: rascunho.destino ?? "",
    }),
  );

  const cliente = conversa.cliente_id ? await buscarCliente(sb, conversa.cliente_id) : null;
  await avisarGestao([
    "🟡 <b>Solicitação pelo WhatsApp — aprovar</b>",
    `${escapeHtml(cliente?.nome ?? "—")} · ${escapeHtml(rascunho.acompanhado_nome ?? "")}`,
    `${escapeHtml(TIPO_ATENDIMENTO_LABEL[rascunho.tipo as TipoAtendimento] ?? String(rascunho.tipo))}`,
    `${escapeHtml(formatarData(rascunho.data!))} às ${escapeHtml(rascunho.hora ?? "")}`,
    `Destino: ${escapeHtml(rascunho.destino ?? "")}`,
    atendimento_id ? `Id: <code>${escapeHtml(atendimento_id.slice(0, 8))}</code>` : "",
  ]);
}

function extrairId(data: unknown): string | null {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return extrairId(data[0]);
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const chave of ["id", "atendimento_id", "solicitar_atendimento"]) {
      if (typeof o[chave] === "string") return o[chave] as string;
    }
  }
  return null;
}

// ===========================================================================
// Fluxo 2 — cancelar / remarcar
// ===========================================================================

async function iniciarCancelamento(
  sb: SB,
  conversa: ConversaRow,
  responder: (t: string) => Promise<void>,
) {
  const hoje = dataLocal(new Date());
  const lista = await listarProximos(sb, conversa.cliente_id!, hoje);
  if (lista.length === 0) {
    await salvarConversa(sb, conversa, { estado: "menu", dados: {} });
    return responder("Não encontrei atendimentos marcados. Mande *1* para agendar um novo.");
  }

  const acompanhados = await listarAcompanhados(sb, conversa.cliente_id!);
  const nomes = new Map(acompanhados.map((a) => [a.id, nomeAcompanhado(a)]));

  await salvarConversa(sb, conversa, {
    estado: "cancelar_escolher",
    dados: { opcoes: lista.map((a) => a.id) },
  });
  await responder(
    `Qual atendimento você quer cancelar ou remarcar?\n${listaNumerada(
      lista.map((a) => rotuloAtendimento(a, nomes)),
    )}`,
  );
}

async function passoCancelarEscolher(
  sb: SB,
  conversa: ConversaRow,
  texto: string,
  responder: (t: string) => Promise<void>,
) {
  const dados = conversa.dados as Dados;
  const opcoes = dados.opcoes ?? [];
  const n = escolhaNumerica(texto, opcoes.length);
  if (!n) return responder(TEXTO_NAO_ENTENDI);

  const hoje = dataLocal(new Date());
  const lista = await listarProximos(sb, conversa.cliente_id!, hoje);
  const alvo = lista.find((a) => a.id === opcoes[n - 1]);
  if (!alvo) return responder(TEXTO_NAO_ENTENDI);

  const acompanhados = await listarAcompanhados(sb, conversa.cliente_id!);
  const nomes = new Map(acompanhados.map((a) => [a.id, nomeAcompanhado(a)]));

  const { negocio } = await carregarConfig(sb);
  const quando = `${alvo.data}T${alvo.hora_prevista_inicio.slice(0, 5)}:00-03:00`;
  const referencia = calcularValorAvulso(
    alvo.duracao_prevista_min / 60,
    negocio.valor_hora_centavos,
    negocio.minimo_horas_avulso,
  );
  const taxa = calcularTaxaCancelamento(quando, new Date(), negocio, referencia);

  await salvarConversa(sb, conversa, {
    estado: "cancelar_confirmar",
    dados: {
      opcoes: [alvo.id],
      rascunho: {
        data: alvo.data,
        hora: alvo.hora_prevista_inicio.slice(0, 5),
        tipo: alvo.tipo,
        acompanhado_id: alvo.acompanhado_id,
        acompanhado_nome: nomes.get(alvo.acompanhado_id) ?? "",
      },
    },
  });

  const aviso = taxa.gratuito
    ? "Cancelamento sem custo. ✅"
    : `Como faltam menos de ${negocio.cancelamento_gratis_horas}h, a política prevê taxa de ${taxa.percentual}% — cerca de *${formatarReais(taxa.taxa_centavos)}* (valor estimado).`;

  await responder(
    [
      `${TIPO_ATENDIMENTO_LABEL[alvo.tipo] ?? alvo.tipo} — ${formatarData(alvo.data)} às ${alvo.hora_prevista_inicio.slice(0, 5)}`,
      aviso,
      "",
      "1. Cancelar este atendimento",
      "2. Cancelar e remarcar",
      "3. Deixar como está",
    ].join("\n"),
  );
}

async function passoCancelarConfirmar(
  sb: SB,
  conversa: ConversaRow,
  texto: string,
  responder: (t: string) => Promise<void>,
) {
  const dados = conversa.dados as Dados;
  const atendimento_id = (dados.opcoes ?? [])[0];
  const escolha = texto.replace(/[).\s]/g, "");

  if (escolha === "3") {
    await salvarConversa(sb, conversa, { estado: "menu", dados: {} });
    return responder("Tudo bem, mantive o atendimento. Mande *menu* quando precisar.");
  }
  if (escolha !== "1" && escolha !== "2") {
    return responder("Responda *1* para cancelar, *2* para cancelar e remarcar, ou *3* para manter.");
  }
  if (!atendimento_id) return responder(TEXTO_NAO_ENTENDI);

  const { templates } = await carregarConfig(sb);
  const { data: retorno, error } = await sb.rpc("cancelar_atendimento_familiar", {
    p_atendimento_id: atendimento_id,
    p_motivo: "Cancelado pelo cliente via WhatsApp",
    p_canal: "whatsapp",
  });
  if (error) {
    console.error("[whatsapp] cancelar_atendimento_familiar falhou:", error);
    return encaminharHumano(sb, conversa, "falha ao cancelar", texto, responder);
  }

  await registrarEvento(sb, "atendimento.cancelado", conversa.cliente_id, atendimento_id, {
    origem: "whatsapp",
    motivo: "Cancelado pelo cliente via WhatsApp",
  });

  const rascunho = (dados.rascunho ?? {}) as Rascunho;
  await responder(
    renderizar(templates, "template_cancelamento_confirmado", {
      nome: "",
      acompanhado: rascunho.acompanhado_nome ?? "",
      tipo: TIPO_ATENDIMENTO_LABEL[rascunho.tipo as TipoAtendimento] ?? (rascunho.tipo ?? ""),
      dia: rascunho.data ? formatarDiaExtenso(rascunho.data) : "",
      data: rascunho.data ? formatarData(rascunho.data) : "",
      hora: rascunho.hora ?? "",
      // a RPC já devolve a frase pronta com a taxa aplicada
      aviso_taxa:
        (retorno as { mensagem?: string } | null)?.mensagem ??
        "A política de cancelamento já foi aplicada.",
    }),
  );

  const cliente = conversa.cliente_id ? await buscarCliente(sb, conversa.cliente_id) : null;
  await avisarGestao([
    "🚫 <b>Cancelamento pelo WhatsApp</b>",
    `${escapeHtml(cliente?.nome ?? "—")} · <code>${escapeHtml(conversa.whatsapp)}</code>`,
    `Id: <code>${escapeHtml(atendimento_id.slice(0, 8))}</code>`,
  ]);

  if (escolha === "2") return iniciarAgendamento(sb, conversa, responder);
  await salvarConversa(sb, conversa, { estado: "menu", dados: {} });
}

// ===========================================================================
// Fluxo 3 — horários livres
// ===========================================================================

async function perguntarDuracao(
  sb: SB,
  conversa: ConversaRow,
  responder: (t: string) => Promise<void>,
) {
  await salvarConversa(sb, conversa, {
    estado: "agendar_data",
    dados: { passo: "duracao", rascunho: { origem: "horarios" } },
  });
  await responder(
    ["Quanto tempo você acha que vai levar?", "1. Até 2 horas", "2. Até 4 horas"].join("\n"),
  );
}

/** `agendar_data` com `dados.passo = 'duracao'` = pergunta do fluxo 3. */
async function passoDuracao(
  sb: SB,
  conversa: ConversaRow,
  texto: string,
  responder: (t: string) => Promise<void>,
): Promise<boolean> {
  const dados = conversa.dados as Dados;
  if (dados.passo !== "duracao") return false;

  const escolha = texto.replace(/[).\s]/g, "");
  if (escolha !== "1" && escolha !== "2") {
    await responder("Responda *1* para até 2 horas ou *2* para até 4 horas.");
    return true;
  }
  const duracao = escolha === "1" ? 120 : 240;
  const agora = new Date();
  const { agenda, templates } = await carregarConfig(sb);
  const hoje = dataLocal(agora);
  const janela = await ocupados(sb, hoje, somarDias(hoje, 14));
  const cliente = conversa.cliente_id ? await buscarCliente(sb, conversa.cliente_id) : null;

  const { texto: msg, slots } = montarMensagemHorariosLivres({
    cliente,
    duracao_min: duracao,
    config: agenda,
    ocupados: janela,
    agora,
    templates,
  });

  if (slots.length === 0) {
    await salvarConversa(sb, conversa, { estado: "menu", dados: {} });
    await responder(TEXTO_SEM_HORARIOS);
    return true;
  }

  await salvarConversa(sb, conversa, {
    estado: "agendar_hora",
    dados: { rascunho: { origem: "horarios", duracao_min: duracao }, slots },
  });
  await responder(msg);
  return true;
}

// ===========================================================================
// Fluxo 4 — saldo e próxima visita
// ===========================================================================

async function mostrarSaldo(
  sb: SB,
  conversa: ConversaRow,
  msg: MensagemNormalizada,
  responder: (t: string) => Promise<void>,
) {
  const cliente_id = conversa.cliente_id!;
  const { data: pacotes } = await sb
    .from("pacote")
    .select("id, horas_contratadas, horas_usadas, valido_ate, status")
    .eq("cliente_id", cliente_id)
    .eq("status", "ativo");

  const linhas: string[] = [];
  const ativos = (pacotes ?? []) as {
    horas_contratadas: number;
    horas_usadas: number;
    valido_ate: string;
  }[];

  if (ativos.length === 0) {
    linhas.push("Você não tem pacote ativo no momento — os atendimentos são cobrados avulsos.");
  } else {
    const total = ativos.reduce(
      (acc, p) => acc + horasRestantes(p.horas_contratadas, p.horas_usadas),
      0,
    );
    linhas.push(`⏳ Saldo do pacote: *${formatarHoras(total)}*`);
    const vence = ativos.map((p) => p.valido_ate).sort()[0];
    if (vence) linhas.push(`Válido até ${formatarData(vence)}.`);
  }

  const hoje = dataLocal(new Date());
  const proximos = await listarProximos(sb, cliente_id, hoje);
  if (proximos.length === 0) {
    linhas.push("", "Não há visita marcada. Mande *1* para agendar.");
  } else {
    const acompanhados = await listarAcompanhados(sb, cliente_id);
    const nomes = new Map(acompanhados.map((a) => [a.id, nomeAcompanhado(a)]));
    const p = proximos[0];
    linhas.push(
      "",
      `📅 Próxima visita: ${rotuloAtendimento(p, nomes)}`,
      `Destino: ${p.endereco_destino}`,
    );
  }
  linhas.push("", "Mande *menu* para ver as opções.");

  await salvarConversa(sb, conversa, { estado: "menu", dados: {} });
  await responder(linhas.join("\n"));
  void msg;
}

// ===========================================================================
// API para o painel / inbox
// ===========================================================================

/** Envia uma mensagem escrita manualmente pela gestão e grava como saída. */
export async function enviarMensagemGestao(
  whatsapp: string,
  texto: string,
  sbInjetado?: SB,
): Promise<{ ok: boolean; erro?: string }> {
  const sb = sbInjetado ?? (createAdminClient() as SB);
  const conversa = await carregarConversa(sb, whatsapp);
  if (!conversa) return { ok: false, erro: "conversa_indisponivel" };
  const client = criarWhatsAppClient();
  const r = await client.enviarTexto(whatsapp, texto);
  await sb.from("mensagem_whatsapp").insert({
    conversa_id: conversa.id,
    direcao: "saida",
    wa_message_id: r.wa_message_id,
    corpo: texto,
    status: r.ok ? "enviada" : "falhou",
  });
  await sb
    .from("conversa_whatsapp")
    .update({ ultima_mensagem_em: new Date().toISOString() })
    .eq("id", conversa.id);
  return { ok: r.ok, erro: r.erro };
}

/** Devolve a conversa ao bot (estado → menu). */
export async function liberarConversa(
  whatsapp: string,
  sbInjetado?: SB,
): Promise<{ ok: boolean }> {
  const sb = sbInjetado ?? (createAdminClient() as SB);
  const conversa = await carregarConversa(sb, whatsapp);
  if (!conversa) return { ok: false };
  await salvarConversa(sb, conversa, { estado: "menu", dados: {} });
  return { ok: true };
}
