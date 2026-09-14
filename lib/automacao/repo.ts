/**
 * Porta de dados de `lib/automacao`. Interface estreita para que os testes
 * usem um repositório em memória (sem simular a cadeia do PostgREST) e a
 * produção use o client admin do Supabase.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import type { Atendimento, CanalEvento } from "@/lib/domain/types";

export type CanalAutomacao = CanalEvento | "email";

export interface ClienteMin {
  id: string;
  nome: string;
  whatsapp: string;
  email: string | null;
}

export interface AcompanhadoMin {
  id: string;
  nome: string;
  apelido: string | null;
}

export interface PacoteMin {
  id: string;
  horas_contratadas: number;
  horas_usadas: number;
}

export interface AtendimentoCompleto extends Atendimento {
  cliente: ClienteMin | null;
  acompanhado: AcompanhadoMin | null;
  pacote: PacoteMin | null;
}

export interface EventoNovo {
  tipo: string;
  canal?: CanalAutomacao;
  atendimento_id?: string | null;
  cliente_id?: string | null;
  payload?: Record<string, unknown>;
}

export interface PacoteComSaldo {
  id: string;
  cliente_id: string;
  horas_contratadas: number;
  horas_usadas: number;
  restante: number;
  valido_ate: string;
  cliente: ClienteMin | null;
}

export interface RepoAutomacao {
  lerConfig(): Promise<Record<string, string>>;
  carregarAtendimento(id: string): Promise<AtendimentoCompleto | null>;
  atualizarAtendimento(id: string, patch: Record<string, unknown>): Promise<void>;
  atendimentosEntre(de: string, ate: string): Promise<AtendimentoCompleto[]>;
  /** Ids (de `atendimento_id`) que já têm um evento desse tipo. */
  eventosExistentes(tipo: string, atendimentoIds: string[]): Promise<Set<string>>;
  /** Clientes que já receberam um evento desse tipo (idempotência sem atendimento). */
  eventosDeClientes(tipo: string, desde: string): Promise<Set<string>>;
  registrarEvento(evento: EventoNovo): Promise<void>;
  pacotesAtivosComSaldo(hoje: string): Promise<PacoteComSaldo[]>;
}

// ---------------------------------------------------------------------------
// Implementação Supabase (service role)
// ---------------------------------------------------------------------------

type Db = ReturnType<typeof createAdminClient>;

const SELECT_ATENDIMENTO = `
  *,
  cliente:cliente_id ( id, nome, whatsapp, email ),
  acompanhado:acompanhado_id ( id, nome, apelido ),
  pacote:pacote_id ( id, horas_contratadas, horas_usadas )
`;

export function criarRepoSupabase(db: Db = createAdminClient()): RepoAutomacao {
  return {
    async lerConfig() {
      const { data } = await db.from("configuracao").select("chave, valor");
      const mapa: Record<string, string> = {};
      for (const l of (data ?? []) as { chave: string; valor: string }[]) {
        mapa[l.chave] = l.valor;
      }
      return mapa;
    },

    async carregarAtendimento(id) {
      const { data } = await db
        .from("atendimento")
        .select(SELECT_ATENDIMENTO)
        .eq("id", id)
        .maybeSingle();
      return (data ?? null) as unknown as AtendimentoCompleto | null;
    },

    async atualizarAtendimento(id, patch) {
      await db.from("atendimento").update(patch).eq("id", id);
    },

    async atendimentosEntre(de, ate) {
      const { data } = await db
        .from("atendimento")
        .select(SELECT_ATENDIMENTO)
        .gte("data", de)
        .lte("data", ate)
        .order("data", { ascending: true })
        .order("hora_prevista_inicio", { ascending: true });
      return (data ?? []) as unknown as AtendimentoCompleto[];
    },

    async eventosExistentes(tipo, atendimentoIds) {
      if (atendimentoIds.length === 0) return new Set();
      const { data } = await db
        .from("evento")
        .select("atendimento_id")
        .eq("tipo", tipo)
        .in("atendimento_id", atendimentoIds);
      const ids = ((data ?? []) as { atendimento_id: string | null }[])
        .map((e) => e.atendimento_id)
        .filter((v): v is string => Boolean(v));
      return new Set(ids);
    },

    async eventosDeClientes(tipo, desde) {
      const { data } = await db
        .from("evento")
        .select("cliente_id")
        .eq("tipo", tipo)
        .gte("criado_em", desde);
      const ids = ((data ?? []) as { cliente_id: string | null }[])
        .map((e) => e.cliente_id)
        .filter((v): v is string => Boolean(v));
      return new Set(ids);
    },

    async registrarEvento(evento) {
      try {
        await db.from("evento").insert({
          tipo: evento.tipo,
          canal: evento.canal ?? "sistema",
          atendimento_id: evento.atendimento_id ?? null,
          cliente_id: evento.cliente_id ?? null,
          payload: evento.payload ?? {},
        });
      } catch {
        // auditoria é best-effort e nunca derruba o envio
      }
    },

    async pacotesAtivosComSaldo(hoje) {
      const { data } = await db
        .from("pacote")
        .select(
          "id, cliente_id, horas_contratadas, horas_usadas, valido_ate, cliente:cliente_id ( id, nome, whatsapp, email )",
        )
        .eq("status", "ativo")
        .gte("valido_ate", hoje);
      return ((data ?? []) as unknown as Omit<PacoteComSaldo, "restante">[])
        .map((p) => ({
          ...p,
          restante: Number(
            (Number(p.horas_contratadas) - Number(p.horas_usadas)).toFixed(2),
          ),
        }))
        .filter((p) => p.restante > 0);
    },
  };
}

// ---------------------------------------------------------------------------
// Implementação em memória (testes)
// ---------------------------------------------------------------------------

export interface SementeMemoria {
  configuracao?: Record<string, string>;
  atendimentos?: AtendimentoCompleto[];
  eventos?: (EventoNovo & { criado_em?: string })[];
  pacotes?: PacoteComSaldo[];
}

export interface RepoMemoria extends RepoAutomacao {
  eventos: (EventoNovo & { criado_em: string })[];
  atendimentos: AtendimentoCompleto[];
  config: Record<string, string>;
}

export function criarRepoMemoria(seed: SementeMemoria = {}): RepoMemoria {
  const config = { ...(seed.configuracao ?? {}) };
  const atendimentos = (seed.atendimentos ?? []).map((a) => ({ ...a }));
  const eventos = (seed.eventos ?? []).map((e) => ({
    ...e,
    criado_em: e.criado_em ?? new Date().toISOString(),
  }));
  const pacotes = (seed.pacotes ?? []).map((p) => ({ ...p }));

  const repo: RepoMemoria = {
    eventos,
    atendimentos,
    config,

    async lerConfig() {
      return { ...config };
    },
    async carregarAtendimento(id) {
      return atendimentos.find((a) => a.id === id) ?? null;
    },
    async atualizarAtendimento(id, patch) {
      const i = atendimentos.findIndex((a) => a.id === id);
      if (i >= 0) atendimentos[i] = { ...atendimentos[i], ...patch } as AtendimentoCompleto;
    },
    async atendimentosEntre(de, ate) {
      return atendimentos
        .filter((a) => a.data >= de && a.data <= ate)
        .sort((x, y) =>
          `${x.data}${x.hora_prevista_inicio}`.localeCompare(
            `${y.data}${y.hora_prevista_inicio}`,
          ),
        );
    },
    async eventosExistentes(tipo, ids) {
      return new Set(
        eventos
          .filter((e) => e.tipo === tipo && e.atendimento_id && ids.includes(e.atendimento_id))
          .map((e) => e.atendimento_id as string),
      );
    },
    async eventosDeClientes(tipo, desde) {
      return new Set(
        eventos
          .filter((e) => e.tipo === tipo && e.cliente_id && e.criado_em >= desde)
          .map((e) => e.cliente_id as string),
      );
    },
    async registrarEvento(evento) {
      eventos.push({ ...evento, criado_em: new Date().toISOString() });
    },
    async pacotesAtivosComSaldo(hoje) {
      return pacotes.filter((p) => p.valido_ate >= hoje && p.restante > 0);
    },
  };
  return repo;
}
