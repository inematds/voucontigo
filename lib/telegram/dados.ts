/**
 * Acesso a dados usado pelo bot e pelos crons. Sempre com service role
 * (`createAdminClient`) — webhook e cron não têm sessão de usuário.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  Atendimento,
  CanalEvento,
  ChaveConfiguracao,
} from "@/lib/domain/types";
import { dataSP, somarDias } from "./_local";

export type Admin = ReturnType<typeof createAdminClient>;

export function admin(): Admin {
  return createAdminClient();
}

// ---------------------------------------------------------------------------
// Autorização de chat
// ---------------------------------------------------------------------------

/**
 * Autorizado = grupo de gestão (env TELEGRAM_CHAT_GESTAO ou configuracao
 * `telegram_chat_gestao`) OU chat cadastrado em `perfil` / `acompanhante`.
 */
export async function chatAutorizado(
  chatId: string | number,
  db: Admin = admin(),
): Promise<boolean> {
  const id = String(chatId);
  if (!id) return false;

  if (process.env.TELEGRAM_CHAT_GESTAO && process.env.TELEGRAM_CHAT_GESTAO === id) {
    return true;
  }

  const { data: perfil } = await db
    .from("perfil")
    .select("id")
    .eq("telegram_chat_id", id)
    .limit(1);
  if (perfil && perfil.length > 0) return true;

  const { data: acomp } = await db
    .from("acompanhante")
    .select("id")
    .eq("telegram_chat_id", id)
    .eq("ativo", true)
    .limit(1);
  if (acomp && acomp.length > 0) return true;

  const { data: cfg } = await db
    .from("configuracao")
    .select("valor")
    .eq("chave", "telegram_chat_gestao")
    .maybeSingle();
  if (cfg?.valor && cfg.valor === id) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Configuração
// ---------------------------------------------------------------------------

export async function lerConfig(
  chaves: (ChaveConfiguracao | string)[],
  db: Admin = admin(),
): Promise<Record<string, string>> {
  const { data } = await db
    .from("configuracao")
    .select("chave, valor")
    .in("chave", chaves);
  const mapa: Record<string, string> = {};
  for (const linha of (data ?? []) as { chave: string; valor: string }[]) {
    mapa[linha.chave] = linha.valor;
  }
  return mapa;
}

export async function lerConfigNum(
  chave: ChaveConfiguracao | string,
  padrao: number,
  db: Admin = admin(),
): Promise<number> {
  const mapa = await lerConfig([chave], db);
  const n = Number(mapa[chave]);
  return Number.isFinite(n) ? n : padrao;
}

// ---------------------------------------------------------------------------
// Eventos
// ---------------------------------------------------------------------------

export async function registrarEvento(
  db: Admin,
  evento: {
    tipo: string;
    canal?: CanalEvento;
    atendimento_id?: string | null;
    cliente_id?: string | null;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await db.from("evento").insert({
    tipo: evento.tipo,
    canal: evento.canal ?? "telegram",
    atendimento_id: evento.atendimento_id ?? null,
    cliente_id: evento.cliente_id ?? null,
    payload: evento.payload ?? {},
  });
}

// ---------------------------------------------------------------------------
// Atendimentos
// ---------------------------------------------------------------------------

export const SELECT_ATENDIMENTO = `
  *,
  cliente:cliente_id ( id, nome, whatsapp ),
  acompanhado:acompanhado_id ( id, nome, apelido, endereco )
`;

export interface AtendimentoJoin extends Atendimento {
  cliente: { id: string; nome: string; whatsapp: string } | null;
  acompanhado: {
    id: string;
    nome: string;
    apelido: string | null;
    endereco: string;
  } | null;
}

export async function atendimentosEntre(
  de: string,
  ate: string,
  db: Admin = admin(),
): Promise<AtendimentoJoin[]> {
  const { data, error } = await db
    .from("atendimento")
    .select(SELECT_ATENDIMENTO)
    .gte("data", de)
    .lte("data", ate)
    .order("data", { ascending: true })
    .order("hora_prevista_inicio", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as AtendimentoJoin[];
}

/**
 * Busca por id curto (8 primeiros chars). PostgREST não aceita `ilike` em
 * coluna uuid, então filtramos em JS sobre uma janela recente e limitada.
 */
export async function acharPorIdCurto(
  idCurto: string,
  db: Admin = admin(),
): Promise<
  | { ok: true; atendimento: AtendimentoJoin }
  | { ok: false; erro: string }
> {
  const alvo = idCurto.toLowerCase();
  const desde = somarDias(dataSP(), -90);
  const { data, error } = await db
    .from("atendimento")
    .select(SELECT_ATENDIMENTO)
    .gte("data", desde)
    .order("data", { ascending: false })
    .limit(500);
  if (error) return { ok: false, erro: error.message };

  const todos = (data ?? []) as unknown as AtendimentoJoin[];
  const achados = todos.filter((a) => a.id.toLowerCase().startsWith(alvo));
  if (achados.length === 0) {
    return {
      ok: false,
      erro: `Nenhum atendimento com id começando em "${idCurto}" nos últimos 90 dias.`,
    };
  }
  if (achados.length > 1) {
    return {
      ok: false,
      erro: `Id "${idCurto}" é ambíguo (${achados.length} atendimentos). Use mais caracteres.`,
    };
  }
  return { ok: true, atendimento: achados[0] };
}

/** Busca por nome (ilike) exigindo resultado único. */
export async function acharUnicoPorNome<T extends { id: string; nome: string }>(
  tabela: string,
  nome: string,
  colunas: string,
  db: Admin = admin(),
): Promise<{ ok: true; registro: T } | { ok: false; erro: string }> {
  const { data, error } = await db
    .from(tabela)
    .select(colunas)
    .ilike("nome", `%${nome}%`)
    .limit(10);
  if (error) return { ok: false, erro: error.message };
  const linhas = (data ?? []) as unknown as T[];
  if (linhas.length === 0) {
    return { ok: false, erro: `Nenhum ${tabela} com nome parecido com "${nome}".` };
  }
  if (linhas.length > 1) {
    const exato = linhas.filter(
      (l) => l.nome.toLowerCase() === nome.toLowerCase(),
    );
    if (exato.length === 1) return { ok: true, registro: exato[0] };
    return {
      ok: false,
      erro: `"${nome}" é ambíguo em ${tabela}: ${linhas.map((l) => l.nome).join(", ")}.`,
    };
  }
  return { ok: true, registro: linhas[0] };
}
