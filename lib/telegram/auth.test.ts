/**
 * Autorização de chat — nenhuma chamada real ao Supabase nem ao Telegram.
 * O client admin é mockado; o "banco" é um objeto em memória.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

/** Linhas fake por tabela, definidas em cada teste. */
const banco: Record<string, Record<string, unknown>[]> = {
  perfil: [],
  acompanhante: [],
  configuracao: [],
};

/** Query builder mínimo, compatível com o uso em dados.ts. */
function criarQuery(tabela: string) {
  const filtros: [string, unknown][] = [];
  const aplicar = () =>
    (banco[tabela] ?? []).filter((linha) =>
      filtros.every(([col, val]) => linha[col] === val),
    );
  const q = {
    select: () => q,
    eq: (col: string, val: unknown) => {
      filtros.push([col, val]);
      return q;
    },
    in: () => q,
    limit: () => Promise.resolve({ data: aplicar(), error: null }),
    maybeSingle: () =>
      Promise.resolve({ data: aplicar()[0] ?? null, error: null }),
    then: (
      resolve: (v: { data: unknown; error: null }) => unknown,
    ) => resolve({ data: aplicar(), error: null }),
  };
  return q;
}

const fromSpy = vi.fn((tabela: string) => criarQuery(tabela));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({ from: fromSpy, rpc: vi.fn() }),
}));

const { chatAutorizado } = await import("./dados");

beforeEach(() => {
  banco.perfil = [];
  banco.acompanhante = [];
  banco.configuracao = [];
  delete process.env.TELEGRAM_CHAT_GESTAO;
  fromSpy.mockClear();
});

describe("chatAutorizado", () => {
  it("autoriza o chat de gestão vindo da env", async () => {
    process.env.TELEGRAM_CHAT_GESTAO = "-100999";
    expect(await chatAutorizado(-100999)).toBe(true);
    // atalho: nem consulta o banco
    expect(fromSpy).not.toHaveBeenCalled();
  });

  it("autoriza perfil cadastrado", async () => {
    banco.perfil = [{ id: "p1", telegram_chat_id: "555" }];
    expect(await chatAutorizado("555")).toBe(true);
  });

  it("autoriza acompanhante ativa", async () => {
    banco.acompanhante = [{ id: "a1", telegram_chat_id: "777", ativo: true }];
    expect(await chatAutorizado(777)).toBe(true);
  });

  it("recusa acompanhante inativa", async () => {
    banco.acompanhante = [{ id: "a1", telegram_chat_id: "777", ativo: false }];
    expect(await chatAutorizado("777")).toBe(false);
  });

  it("autoriza pelo chat de gestão salvo em configuracao", async () => {
    banco.configuracao = [{ chave: "telegram_chat_gestao", valor: "-4242" }];
    expect(await chatAutorizado("-4242")).toBe(true);
  });

  it("recusa chat desconhecido", async () => {
    process.env.TELEGRAM_CHAT_GESTAO = "-100999";
    banco.perfil = [{ id: "p1", telegram_chat_id: "555" }];
    expect(await chatAutorizado("123456")).toBe(false);
  });

  it("recusa chat vazio", async () => {
    expect(await chatAutorizado("")).toBe(false);
  });
});
