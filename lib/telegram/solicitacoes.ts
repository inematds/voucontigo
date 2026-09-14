/**
 * Regras de aprovação/recusa de atendimentos `solicitado`.
 *
 * Uma única implementação usada por dois pontos de entrada:
 *   - botões inline do Telegram (`lib/telegram/bot.ts`);
 *   - Server Actions do painel (`app/(painel)/_lib/acoes-inbox.ts`).
 *
 * Nunca lança: devolve `{ ok, erro }` para o chamador formatar.
 */
import type { CanalEvento } from "@/lib/domain/types";
import { admin, registrarEvento, SELECT_ATENDIMENTO, type Admin, type AtendimentoJoin } from "./dados";
import {
  enviarConfirmacaoAgendamento,
  enviarMensagemGestao,
} from "./_compat_v2";

export type ResultadoSolicitacao =
  | {
      ok: true;
      atendimento: AtendimentoJoin;
      /** aprovar: a confirmação automática saiu para o cliente. */
      confirmacao_enviada?: boolean;
      /** recusar: o aviso de recusa saiu para o cliente. */
      aviso_enviado?: boolean;
    }
  | { ok: false; erro: string };

export async function buscarAtendimento(
  id: string,
  db: Admin = admin(),
): Promise<AtendimentoJoin | null> {
  const { data } = await db
    .from("atendimento")
    .select(SELECT_ATENDIMENTO)
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as AtendimentoJoin | null) ?? null;
}

/** Atendimentos aguardando aprovação da gestão, mais antigos primeiro. */
export async function listarSolicitacoesPendentes(
  db: Admin = admin(),
  limite = 20,
): Promise<AtendimentoJoin[]> {
  const { data } = await db
    .from("atendimento")
    .select(SELECT_ATENDIMENTO)
    .eq("status", "solicitado")
    .order("data", { ascending: true })
    .order("hora_prevista_inicio", { ascending: true })
    .limit(limite);
  return (data ?? []) as unknown as AtendimentoJoin[];
}

export async function contarSolicitacoesPendentes(
  db: Admin = admin(),
): Promise<number> {
  const { count } = await db
    .from("atendimento")
    .select("id", { count: "exact", head: true })
    .eq("status", "solicitado");
  return count ?? 0;
}

/** ✅ Aprovar: `solicitado` → `agendado` + confirmação ao cliente. */
export async function aprovarSolicitacao(
  atendimentoId: string,
  opcoes: { canal?: CanalEvento; db?: Admin; por?: string } = {},
): Promise<ResultadoSolicitacao> {
  const db = opcoes.db ?? admin();
  const a = await buscarAtendimento(atendimentoId, db);
  if (!a) return { ok: false, erro: "Solicitação não encontrada." };
  if (a.status !== "solicitado") {
    return {
      ok: false,
      erro: `Esta solicitação já foi tratada (status ${a.status}).`,
    };
  }

  const { error } = await db
    .from("atendimento")
    .update({ status: "agendado" })
    .eq("id", a.id)
    .eq("status", "solicitado");
  if (error) return { ok: false, erro: error.message };

  await registrarEvento(db, {
    tipo: "solicitacao.aprovada",
    canal: opcoes.canal ?? "telegram",
    atendimento_id: a.id,
    cliente_id: a.cliente_id,
    payload: { status: "agendado", por: opcoes.por ?? null },
  });

  const confirmacao = await enviarConfirmacaoAgendamento(a.id);
  return { ok: true, atendimento: a, confirmacao_enviada: confirmacao };
}

/** ❌ Recusar: `solicitado` → `cancelado_operacao` + aviso ao cliente. */
export async function recusarSolicitacao(
  atendimentoId: string,
  motivo = "recusado",
  opcoes: { canal?: CanalEvento; db?: Admin; por?: string } = {},
): Promise<ResultadoSolicitacao> {
  const db = opcoes.db ?? admin();
  const a = await buscarAtendimento(atendimentoId, db);
  if (!a) return { ok: false, erro: "Solicitação não encontrada." };
  if (a.status !== "solicitado") {
    return {
      ok: false,
      erro: `Esta solicitação já foi tratada (status ${a.status}).`,
    };
  }

  const texto = (motivo || "").trim() || "recusado";
  const { error } = await db
    .from("atendimento")
    .update({
      status: "cancelado_operacao",
      motivo_cancelamento: texto,
    })
    .eq("id", a.id)
    .eq("status", "solicitado");
  if (error) return { ok: false, erro: error.message };

  await registrarEvento(db, {
    tipo: "solicitacao.recusada",
    canal: opcoes.canal ?? "telegram",
    atendimento_id: a.id,
    cliente_id: a.cliente_id,
    payload: { status: "cancelado_operacao", motivo: texto, por: opcoes.por ?? null },
  });

  let avisoEnviado = false;
  if (a.cliente?.whatsapp) {
    avisoEnviado = await enviarMensagemGestao(
      a.cliente.whatsapp,
      [
        `Oi, ${a.cliente.nome ?? ""}! Infelizmente não conseguimos confirmar o acompanhamento de ${a.data.split("-").reverse().join("/")} às ${a.hora_prevista_inicio.slice(0, 5)}.`,
        texto === "recusado" ? "" : `Motivo: ${texto}.`,
        "Quer que a gente procure outro horário? É só responder aqui. 💚",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }

  return { ok: true, atendimento: a, aviso_enviado: avisoEnviado };
}
