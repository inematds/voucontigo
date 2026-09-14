/**
 * Leitura e ações sobre conversas de WhatsApp (v2), compartilhadas entre o
 * bot do Telegram e a inbox do painel.
 */
import type { EstadoConversa, MensagemWhatsApp } from "@/lib/domain/types";
import { admin, registrarEvento, type Admin } from "./dados";
import {
  enviarMensagemGestao,
  liberarConversa as liberarConversaCompat,
  normalizarWhatsApp,
} from "./_compat_v2";

export interface ConversaLinha {
  id: string;
  whatsapp: string;
  cliente_id: string | null;
  estado: EstadoConversa;
  ultima_mensagem_em: string | null;
  criado_em: string;
  cliente: { id: string; nome: string } | null;
}

const SELECT_CONVERSA = `
  id, whatsapp, cliente_id, estado, ultima_mensagem_em, criado_em,
  cliente:cliente_id ( id, nome )
`;

export async function listarConversas(
  opcoes: { apenasHumano?: boolean; limite?: number; db?: Admin } = {},
): Promise<ConversaLinha[]> {
  const db = opcoes.db ?? admin();
  let q = db
    .from("conversa_whatsapp")
    .select(SELECT_CONVERSA)
    .order("ultima_mensagem_em", { ascending: false, nullsFirst: false })
    .limit(opcoes.limite ?? 100);
  if (opcoes.apenasHumano) q = q.eq("estado", "humano");
  const { data } = await q;
  return (data ?? []) as unknown as ConversaLinha[];
}

export async function buscarConversa(
  id: string,
  db: Admin = admin(),
): Promise<ConversaLinha | null> {
  const { data } = await db
    .from("conversa_whatsapp")
    .select(SELECT_CONVERSA)
    .eq("id", id)
    .maybeSingle();
  return (data as unknown as ConversaLinha | null) ?? null;
}

export async function mensagensDaConversa(
  conversaId: string,
  db: Admin = admin(),
  limite = 100,
): Promise<MensagemWhatsApp[]> {
  const { data } = await db
    .from("mensagem_whatsapp")
    .select("*")
    .eq("conversa_id", conversaId)
    .order("criado_em", { ascending: true })
    .limit(limite);
  return (data ?? []) as unknown as MensagemWhatsApp[];
}

export async function contarAguardandoHumano(
  db: Admin = admin(),
): Promise<number> {
  const { count } = await db
    .from("conversa_whatsapp")
    .select("id", { count: "exact", head: true })
    .eq("estado", "humano");
  return count ?? 0;
}

/** Responde pela gestão e registra o evento. */
export async function responderConversa(
  whatsapp: string,
  texto: string,
  opcoes: { db?: Admin; canal?: "telegram" | "painel" } = {},
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const db = opcoes.db ?? admin();
  const numero = normalizarWhatsApp(whatsapp);
  if (!numero) return { ok: false, erro: "Número de WhatsApp inválido." };
  if (!texto.trim()) return { ok: false, erro: "Escreva a mensagem." };

  const enviado = await enviarMensagemGestao(numero, texto);
  if (!enviado) return { ok: false, erro: "Não foi possível enviar a mensagem." };

  await registrarEvento(db, {
    tipo: "conversa.respondida",
    canal: opcoes.canal ?? "telegram",
    payload: { whatsapp: numero, tamanho: texto.length },
  });
  return { ok: true };
}

/** Devolve a conversa ao bot. */
export async function liberarBot(
  whatsapp: string,
  opcoes: { db?: Admin; canal?: "telegram" | "painel" } = {},
): Promise<{ ok: true } | { ok: false; erro: string }> {
  const db = opcoes.db ?? admin();
  const numero = normalizarWhatsApp(whatsapp);
  if (!numero) return { ok: false, erro: "Número de WhatsApp inválido." };

  const ok = await liberarConversaCompat(numero);
  if (!ok) return { ok: false, erro: "Não foi possível liberar o bot." };

  await registrarEvento(db, {
    tipo: "conversa.liberada",
    canal: opcoes.canal ?? "telegram",
    payload: { whatsapp: numero },
  });
  return { ok: true };
}

/** Última mensagem de cada conversa (para o preview da inbox). */
export async function ultimaMensagemPorConversa(
  conversaIds: string[],
  db: Admin = admin(),
): Promise<Map<string, { corpo: string; direcao: string }>> {
  const mapa = new Map<string, { corpo: string; direcao: string }>();
  if (conversaIds.length === 0) return mapa;
  const { data } = await db
    .from("mensagem_whatsapp")
    .select("conversa_id, corpo, direcao, criado_em")
    .in("conversa_id", conversaIds)
    .order("criado_em", { ascending: false })
    .limit(conversaIds.length * 10);
  for (const m of (data ?? []) as {
    conversa_id: string;
    corpo: string;
    direcao: string;
  }[]) {
    if (!mapa.has(m.conversa_id)) {
      mapa.set(m.conversa_id, { corpo: m.corpo, direcao: m.direcao });
    }
  }
  return mapa;
}
