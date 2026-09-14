"use server";

/**
 * Server Actions da inbox unificada e das solicitações.
 *
 * As regras de negócio moram em `lib/telegram/*` — as mesmas usadas pelos
 * botões inline do Telegram, para painel e bot nunca divergirem.
 *
 * Escrita usa o cliente service role (`admin()`): a RLS da v2 só deixa a
 * gestora escrever em `conversa_whatsapp` / `mensagem_whatsapp`, mas a
 * acompanhante também precisa responder. O controle de acesso é feito aqui,
 * por `exigirPerfil()`.
 */
import { revalidatePath } from "next/cache";
import { admin } from "@/lib/telegram/dados";
import {
  buscarConversa,
  contarAguardandoHumano,
  liberarBot,
  responderConversa,
} from "@/lib/telegram/conversas";
import {
  aprovarSolicitacao,
  contarSolicitacoesPendentes,
  recusarSolicitacao,
} from "@/lib/telegram/solicitacoes";
import { exigirPerfil } from "./dados";

export type Estado = { erro?: string; ok?: string };

function texto(v: FormDataEntryValue | null): string {
  return typeof v === "string" ? v.trim() : "";
}

function revalidarInbox(conversaId?: string) {
  revalidatePath("/painel/inbox");
  if (conversaId) revalidatePath(`/painel/inbox/${conversaId}`);
}

/* -------------------------------------------------------------------------- */
/* Contadores da navegação                                                     */
/* -------------------------------------------------------------------------- */

/**
 * O try/catch engole também o `redirect()` de `exigirPerfil()` — tudo bem:
 * o layout do painel já barra quem não está autenticado; aqui só não
 * queremos que um contador quebre a navegação.
 */
export async function contarPendencias(): Promise<{
  inbox: number;
  solicitacoes: number;
}> {
  try {
    await exigirPerfil();
    const db = admin();
    const [inbox, solicitacoes] = await Promise.all([
      contarAguardandoHumano(db),
      contarSolicitacoesPendentes(db),
    ]);
    return { inbox, solicitacoes };
  } catch {
    return { inbox: 0, solicitacoes: 0 };
  }
}

/* -------------------------------------------------------------------------- */
/* Solicitações                                                                */
/* -------------------------------------------------------------------------- */

export async function aprovarSolicitacaoAcao(
  _estado: Estado,
  formData: FormData,
): Promise<Estado> {
  const { perfil } = await exigirPerfil();
  const id = texto(formData.get("id"));
  if (!id) return { erro: "Solicitação não identificada." };

  const r = await aprovarSolicitacao(id, {
    canal: "painel",
    db: admin(),
    por: perfil.nome,
  });
  if (!r.ok) return { erro: r.erro };

  revalidatePath("/painel/solicitacoes");
  revalidatePath("/painel/agenda");
  return {
    ok: r.confirmacao_enviada
      ? "Aprovado — confirmação enviada ao cliente."
      : "Aprovado. Atenção: a confirmação automática não saiu; avise o cliente.",
  };
}

export async function recusarSolicitacaoAcao(
  _estado: Estado,
  formData: FormData,
): Promise<Estado> {
  const { perfil } = await exigirPerfil();
  const id = texto(formData.get("id"));
  if (!id) return { erro: "Solicitação não identificada." };

  const r = await recusarSolicitacao(
    id,
    texto(formData.get("motivo")) || "recusado",
    { canal: "painel", db: admin(), por: perfil.nome },
  );
  if (!r.ok) return { erro: r.erro };

  revalidatePath("/painel/solicitacoes");
  revalidatePath("/painel/agenda");
  return {
    ok: r.aviso_enviado
      ? "Solicitação recusada — o cliente foi avisado."
      : "Solicitação recusada. Atenção: o aviso não saiu; fale com o cliente.",
  };
}

/* -------------------------------------------------------------------------- */
/* Conversas                                                                   */
/* -------------------------------------------------------------------------- */

export async function responderConversaAcao(
  _estado: Estado,
  formData: FormData,
): Promise<Estado> {
  await exigirPerfil();
  const whatsapp = texto(formData.get("whatsapp"));
  const corpo = texto(formData.get("texto"));
  const conversaId = texto(formData.get("conversa_id"));

  const r = await responderConversa(whatsapp, corpo, {
    db: admin(),
    canal: "painel",
  });
  if (!r.ok) return { erro: r.erro };

  revalidarInbox(conversaId || undefined);
  return { ok: "Mensagem enviada." };
}

export async function liberarBotAcao(
  _estado: Estado,
  formData: FormData,
): Promise<Estado> {
  await exigirPerfil();
  const whatsapp = texto(formData.get("whatsapp"));
  const conversaId = texto(formData.get("conversa_id"));

  const r = await liberarBot(whatsapp, { db: admin(), canal: "painel" });
  if (!r.ok) return { erro: r.erro };

  revalidarInbox(conversaId || undefined);
  return { ok: "Bot liberado — o menu volta a responder." };
}

/**
 * Cria (ou reaproveita) o cliente a partir do número da conversa e vincula
 * conversa + lead. Nome vem do formulário; na falta, usa o próprio número.
 */
export async function converterConversaEmClienteAcao(
  _estado: Estado,
  formData: FormData,
): Promise<Estado> {
  await exigirPerfil();
  const conversaId = texto(formData.get("conversa_id"));
  if (!conversaId) return { erro: "Conversa não identificada." };

  const db = admin();
  const conversa = await buscarConversa(conversaId, db);
  if (!conversa) return { erro: "Conversa não encontrada." };
  if (conversa.cliente_id) return { erro: "Esta conversa já tem cliente." };

  const whatsapp = conversa.whatsapp;
  const nome = texto(formData.get("nome")) || `WhatsApp ${whatsapp}`;

  const { data: existente } = await db
    .from("cliente")
    .select("id")
    .eq("whatsapp", whatsapp)
    .maybeSingle();

  let clienteId = (existente as { id: string } | null)?.id ?? null;

  if (!clienteId) {
    const { data: novo, error } = await db
      .from("cliente")
      .insert({ nome, whatsapp, origem: "whatsapp" })
      .select("id")
      .single();
    if (error) return { erro: `Não foi possível criar o cliente: ${error.message}` };
    clienteId = (novo as { id: string }).id;
  }

  await db
    .from("conversa_whatsapp")
    .update({ cliente_id: clienteId })
    .eq("id", conversaId);

  // Vincula o lead do mesmo número, se houver.
  await db
    .from("lead")
    .update({ status: "convertido", cliente_id: clienteId })
    .eq("whatsapp", whatsapp)
    .is("cliente_id", null);

  await db.from("evento").insert({
    tipo: "conversa.convertida",
    canal: "painel",
    cliente_id: clienteId,
    payload: { conversa_id: conversaId, whatsapp },
  });

  revalidarInbox(conversaId);
  revalidatePath("/painel/clientes");
  revalidatePath("/painel/leads");
  return { ok: "Cliente criado e vinculado à conversa." };
}
