/**
 * Fake mínimo do cliente Supabase para os testes do módulo Telegram.
 * Encadeia qualquer método de filtro e resolve com a resposta configurada
 * por tabela. Nenhuma rede, nenhum banco.
 */

export interface RespostaFake {
  data?: unknown;
  error?: { message: string; code?: string } | null;
  count?: number;
}

export interface RegistroChamada {
  tabela: string;
  operacao: "select" | "insert" | "update" | "delete" | "rpc";
  valores?: unknown;
}

type Respostas = Record<string, RespostaFake | RespostaFake[]>;

export function criarDbFake(respostas: Respostas = {}) {
  const chamadas: RegistroChamada[] = [];
  const contadores: Record<string, number> = {};

  function proxima(tabela: string): RespostaFake {
    const r = respostas[tabela];
    if (!r) return { data: [], error: null, count: 0 };
    if (Array.isArray(r)) {
      const i = contadores[tabela] ?? 0;
      contadores[tabela] = i + 1;
      return r[Math.min(i, r.length - 1)] ?? { data: [], error: null };
    }
    return r;
  }

  function construtor(tabela: string, operacao: RegistroChamada["operacao"]) {
    const resolver = () => {
      const r = proxima(tabela);
      return {
        data: r.data ?? null,
        error: r.error ?? null,
        count: r.count ?? (Array.isArray(r.data) ? r.data.length : 0),
      };
    };

    const alvo: Record<string, unknown> = {};
    const encadeavel: string[] = [
      "select",
      "eq",
      "neq",
      "in",
      "is",
      "not",
      "gte",
      "lte",
      "gt",
      "lt",
      "ilike",
      "like",
      "order",
      "limit",
      "range",
    ];

    const api = new Proxy(alvo, {
      get(_alvo, prop: string) {
        if (prop === "then") {
          // torna o builder "thenable" (await direto)
          return (aceitar: (v: unknown) => unknown) => aceitar(resolver());
        }
        if (prop === "single" || prop === "maybeSingle") {
          return async () => {
            const r = resolver();
            const d = Array.isArray(r.data) ? (r.data[0] ?? null) : r.data;
            return { data: d, error: r.error };
          };
        }
        if (encadeavel.includes(prop)) return () => api;
        return () => api;
      },
    }) as never;

    void operacao;
    return api;
  }

  const db = {
    from(tabela: string) {
      return {
        select: (...args: unknown[]) => {
          chamadas.push({ tabela, operacao: "select", valores: args });
          return construtor(tabela, "select");
        },
        insert: (valores: unknown) => {
          chamadas.push({ tabela, operacao: "insert", valores });
          return construtor(tabela, "insert");
        },
        update: (valores: unknown) => {
          chamadas.push({ tabela, operacao: "update", valores });
          return construtor(tabela, "update");
        },
        delete: () => {
          chamadas.push({ tabela, operacao: "delete" });
          return construtor(tabela, "delete");
        },
      };
    },
    rpc: async (nome: string) => {
      chamadas.push({ tabela: nome, operacao: "rpc" });
      return { data: null, error: null };
    },
    chamadas,
  };

  return db as unknown as {
    chamadas: RegistroChamada[];
  } & Record<string, never>;
}

/** Contexto grammy mockado (mensagem ou callback). */
export function criarCtxFake(opcoes: {
  texto?: string;
  callbackData?: string;
  chatId?: number;
}) {
  const reply = vitestFn();
  const answerCallbackQuery = vitestFn();
  const editMessageReplyMarkup = vitestFn();
  return {
    ctx: {
      chat: { id: opcoes.chatId ?? -100999 },
      message: opcoes.texto === undefined ? undefined : { text: opcoes.texto },
      callbackQuery:
        opcoes.callbackData === undefined
          ? undefined
          : { id: "cb1", data: opcoes.callbackData },
      reply,
      answerCallbackQuery,
      editMessageReplyMarkup,
    },
    reply,
    answerCallbackQuery,
    editMessageReplyMarkup,
  };
}

/** `vi.fn()` sem importar vitest aqui (mantém o arquivo fora do include de testes). */
function vitestFn() {
  const chamadas: unknown[][] = [];
  const f = (...args: unknown[]) => {
    chamadas.push(args);
    return Promise.resolve(undefined);
  };
  (f as unknown as { mock: { calls: unknown[][] } }).mock = { calls: chamadas };
  return f as ((...args: unknown[]) => Promise<undefined>) & {
    mock: { calls: unknown[][] };
  };
}
