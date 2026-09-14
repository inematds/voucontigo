/**
 * Lembretes automáticos ao CLIENTE (PLANO §7.2): D-1, 2h antes e confirmação
 * de agendamento. Texto sempre vem de `configuracao` (template_lembrete_d1,
 * template_lembrete_2h, template_confirmacao) renderizado com `renderTemplate`.
 *
 * Idempotência por evento: um atendimento nunca recebe dois `lembrete_d1`
 * nem dois `lembrete_2h`. O evento só é gravado quando a mensagem SAIU para
 * o cliente (WhatsApp ou e-mail) — falhou, o próximo cron retenta.
 */

import { renderTemplate } from "@/lib/domain/templates";
import { instante } from "@/lib/telegram/_local";
import { criarRepoSupabase, type AtendimentoCompleto, type RepoAutomacao } from "./repo";
import { avisarGestao, enviarAoCliente, escapeHtml, type DepsEnvio } from "./envio";
import { montarMensagemHorariosLivres, rotuloTipo, type SlotLivre } from "./_compat";

export interface DepsLembretes extends DepsEnvio {
  repo?: RepoAutomacao;
}

export const TEMPLATE_D1_PADRAO =
  "Oi, {nome}! Lembrando que amanhã ({dia}) às {hora} eu acompanho {acompanhado} para {tipo}. Está tudo certo?";
export const TEMPLATE_2H_PADRAO =
  "Oi, {nome}! Daqui a pouco ({hora}) eu encontro {acompanhado} para {tipo} em {destino}. Já estou me organizando. 💚";
export const TEMPLATE_CONFIRMACAO_PADRAO =
  "Oi, {nome}! Está confirmado: {dia} às {hora}, {tipo} com {acompanhado} em {destino}. Qualquer mudança é só me avisar. 💚";

const PLACEHOLDER = /\{[a-zA-Z0-9_]+\}/;

/** Status que o cliente pode receber lembrete: `solicitado` ainda não foi aprovado. */
export const STATUS_LEMBRETE = ["agendado", "confirmado"];

export interface ItemLembrete {
  atendimento_id: string;
  ok: boolean;
  canais: ("whatsapp" | "email")[];
  texto: string;
  erro?: string;
}

export interface ResultadoLembretes {
  enviados: number;
  pulados: number;
  falhas: number;
  itens: ItemLembrete[];
  /** Resumo em HTML para o Telegram da gestão (mantém o que já existia). */
  resumoTelegram: string;
}

function variaveis(a: AtendimentoCompleto): Record<string, string> {
  const [ano, mes, dia] = a.data.split("-");
  void ano;
  return {
    nome: a.cliente?.nome ?? "",
    dia: `${dia}/${mes}`,
    data: `${dia}/${mes}/${ano}`,
    hora: (a.hora_prevista_inicio ?? "").slice(0, 5),
    acompanhado: a.acompanhado?.apelido || a.acompanhado?.nome || "",
    tipo: rotuloTipo(a.tipo),
    destino: a.endereco_destino,
    saida: a.endereco_saida,
  };
}

async function dispararLembrete(
  a: AtendimentoCompleto,
  template: string,
  tipoEvento: string,
  assunto: string,
  deps: DepsLembretes,
  repo: RepoAutomacao,
): Promise<ItemLembrete> {
  const texto = renderTemplate(template, variaveis(a));

  // Placeholder sobrando = dado faltando. Não mandamos "{acompanhado}" à família.
  if (PLACEHOLDER.test(texto)) {
    return { atendimento_id: a.id, ok: false, canais: [], texto, erro: "placeholder" };
  }

  const envio = await enviarAoCliente(a.cliente, texto, assunto, deps);

  if (!envio.ok) {
    return {
      atendimento_id: a.id,
      ok: false,
      canais: [],
      texto,
      erro: envio.erros.join(" · "),
    };
  }

  await repo.registrarEvento({
    tipo: tipoEvento,
    canal: envio.canais.includes("whatsapp") ? "whatsapp" : "email",
    atendimento_id: a.id,
    cliente_id: a.cliente_id,
    payload: { data: a.data, hora: a.hora_prevista_inicio, canais: envio.canais },
  });

  return { atendimento_id: a.id, ok: true, canais: envio.canais, texto };
}

function montarResumo(titulo: string, itens: ItemLembrete[]): string {
  if (itens.length === 0) return `${titulo}\nNenhum lembrete a enviar.`;
  return [
    titulo,
    ...itens.map(
      (i) =>
        `${i.ok ? "✅" : "⚠️"} <code>${escapeHtml(i.atendimento_id.slice(0, 8))}</code>` +
        (i.ok ? ` · ${i.canais.join(", ")}` : ` · falhou: ${escapeHtml(i.erro ?? "")}`) +
        `\n<pre>${escapeHtml(i.texto)}</pre>`,
    ),
  ].join("\n");
}

async function processar(
  candidatos: AtendimentoCompleto[],
  tipoEvento: string,
  template: string,
  assunto: string,
  titulo: string,
  repo: RepoAutomacao,
  deps: DepsLembretes,
): Promise<ResultadoLembretes> {
  const jaAvisados = await repo.eventosExistentes(
    tipoEvento,
    candidatos.map((a) => a.id),
  );
  const pendentes = candidatos.filter((a) => !jaAvisados.has(a.id));

  const itens: ItemLembrete[] = [];
  for (const a of pendentes) {
    itens.push(await dispararLembrete(a, template, tipoEvento, assunto, deps, repo));
  }

  const enviados = itens.filter((i) => i.ok).length;
  return {
    enviados,
    pulados: jaAvisados.size,
    falhas: itens.length - enviados,
    itens,
    resumoTelegram: montarResumo(titulo, itens),
  };
}

/** D-1: todos os atendimentos de `dataAlvo` (normalmente amanhã). */
export async function enviarLembretesD1(
  dataAlvo: string,
  deps: DepsLembretes = {},
): Promise<ResultadoLembretes> {
  const repo = deps.repo ?? criarRepoSupabase();
  const cfg = await repo.lerConfig();
  const template = cfg.template_lembrete_d1?.trim() || TEMPLATE_D1_PADRAO;

  const candidatos = (await repo.atendimentosEntre(dataAlvo, dataAlvo)).filter((a) =>
    STATUS_LEMBRETE.includes(a.status),
  );

  return processar(
    candidatos,
    "lembrete_d1",
    template,
    "Lembrete da visita de amanhã",
    "📨 <b>Lembretes D-1 enviados ao cliente</b>",
    repo,
    deps,
  );
}

/** 2h antes: janela `agora` → `agora + 2h` (hora de parede de São Paulo). */
export async function enviarLembretes2h(
  agora: Date = new Date(),
  deps: DepsLembretes = {},
): Promise<ResultadoLembretes> {
  const repo = deps.repo ?? criarRepoSupabase();
  const cfg = await repo.lerConfig();
  const template = cfg.template_lembrete_2h?.trim() || TEMPLATE_2H_PADRAO;

  const limite = new Date(agora.getTime() + 2 * 60 * 60 * 1000);
  const de = new Date(agora.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const ate = new Date(agora.getTime() + 48 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const candidatos = (await repo.atendimentosEntre(de, ate))
    .filter((a) => STATUS_LEMBRETE.includes(a.status))
    .filter((a) => {
      const inicio = instante(a.data, a.hora_prevista_inicio);
      return inicio >= agora && inicio <= limite;
    });

  return processar(
    candidatos,
    "lembrete_2h",
    template,
    "Sua visita é daqui a pouco",
    "⏰ <b>Lembretes 2h enviados ao cliente</b>",
    repo,
    deps,
  );
}

/** Confirmação: chamada quando o atendimento vira `agendado`/`confirmado`. */
export async function enviarConfirmacaoAgendamento(
  atendimentoId: string,
  deps: DepsLembretes = {},
): Promise<ItemLembrete | null> {
  const repo = deps.repo ?? criarRepoSupabase();
  const a = await repo.carregarAtendimento(atendimentoId);
  if (!a || !a.cliente) return null;
  if (!STATUS_LEMBRETE.includes(a.status)) return null;

  const ja = await repo.eventosExistentes("confirmacao_agendamento", [a.id]);
  if (ja.has(a.id)) return null;

  const cfg = await repo.lerConfig();
  const template = cfg.template_confirmacao?.trim() || TEMPLATE_CONFIRMACAO_PADRAO;

  const item = await dispararLembrete(
    a,
    template,
    "confirmacao_agendamento",
    "Agendamento confirmado",
    deps,
    repo,
  );

  if (!item.ok) {
    await avisarGestao(
      [
        "⚠️ <b>Confirmação não enviada ao cliente</b>",
        `<code>${escapeHtml(a.id.slice(0, 8))}</code> · ${escapeHtml(item.erro ?? "")}`,
        `<pre>${escapeHtml(item.texto)}</pre>`,
      ].join("\n"),
      deps,
    );
  }
  return item;
}

// ---------------------------------------------------------------------------
// Horários livres da semana (opcional, só às segundas)
// ---------------------------------------------------------------------------

export interface ResultadoHorariosSemanal {
  ativo: boolean;
  enviados: number;
  pulados: number;
  falhas: number;
  motivo?: "desligado" | "sem_slots";
}

/**
 * Para cada cliente com pacote ativo e saldo, manda os horários livres da
 * semana. Só roda quando `configuracao.enviar_horarios_semanal === "1"`.
 * `slots` vem de `montarSlotsLivres` do agente A/B; sem eles a mensagem
 * ainda sai avisando que a agenda está cheia.
 */
export async function enviarHorariosLivresSemanal(
  hoje: string,
  slots: SlotLivre[] = [],
  deps: DepsLembretes = {},
): Promise<ResultadoHorariosSemanal> {
  const repo = deps.repo ?? criarRepoSupabase();
  const cfg = await repo.lerConfig();
  if ((cfg.enviar_horarios_semanal ?? "").trim() !== "1") {
    return { ativo: false, enviados: 0, pulados: 0, falhas: 0, motivo: "desligado" };
  }

  // Sem slots calculados (agente A ainda não entregou `montarSlotsLivres`) não
  // mandamos nada: melhor silêncio do que avisar "agenda cheia" sem ser verdade.
  if (slots.length === 0) {
    return { ativo: true, enviados: 0, pulados: 0, falhas: 0, motivo: "sem_slots" };
  }

  const pacotes = await repo.pacotesAtivosComSaldo(hoje);

  // Um cliente pode ter vários pacotes: manda uma vez só.
  const porCliente = new Map<string, (typeof pacotes)[number]>();
  for (const p of pacotes) if (!porCliente.has(p.cliente_id)) porCliente.set(p.cliente_id, p);

  const desde = new Date(new Date(`${hoje}T00:00:00-03:00`).getTime() - 6 * 86400000).toISOString();
  const jaMandados = await repo.eventosDeClientes("horarios_semanal", desde);

  let enviados = 0;
  let falhas = 0;
  let pulados = 0;

  for (const [clienteId, p] of porCliente) {
    if (jaMandados.has(clienteId)) {
      pulados += 1;
      continue;
    }
    const texto = montarMensagemHorariosLivres(p.cliente?.nome ?? "tudo bem", slots);
    const envio = await enviarAoCliente(p.cliente, texto, "Horários livres da semana", deps);
    if (!envio.ok) {
      falhas += 1;
      continue;
    }
    enviados += 1;
    await repo.registrarEvento({
      tipo: "horarios_semanal",
      canal: envio.canais.includes("whatsapp") ? "whatsapp" : "email",
      cliente_id: clienteId,
      payload: { semana: hoje, slots: slots.length, canais: envio.canais },
    });
  }

  return { ativo: true, enviados, pulados, falhas };
}
