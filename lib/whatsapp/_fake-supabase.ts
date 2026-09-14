/**
 * Mini Supabase em memória, só com a superfície que `lib/whatsapp/**` usa:
 *   from(t).select().eq().in().gte().order().limit().maybeSingle()/.single()
 *   from(t).insert(row).select().single()
 *   from(t).update(patch).eq()
 *   rpc(nome, args)
 * Emula a violação de chave única (código 23505) — é assim que a idempotência
 * por `wa_message_id` é testada.
 *
 * Arquivo de TESTE, mas fora de `*.test.ts` para poder ser importado por vários.
 */

export interface ErroPostgrest {
  code: string;
  message: string;
  details?: string;
  hint?: string;
}

export type Linha = Record<string, unknown>;

const UNICOS: Record<string, string[]> = {
  conversa_whatsapp: ["whatsapp"],
  mensagem_whatsapp: ["wa_message_id"],
};

let seq = 0;
function novoId(prefixo = "id"): string {
  seq += 1;
  return `${prefixo}-${String(seq).padStart(4, "0")}`;
}

type Filtro = (linha: Linha) => boolean;

class Consulta implements PromiseLike<{ data: unknown; error: ErroPostgrest | null }> {
  private filtros: Filtro[] = [];
  private ordenacao: { coluna: string; asc: boolean }[] = [];
  private teto: number | null = null;
  private modo: "lista" | "um" | "um_ou_nulo" = "lista";

  constructor(private linhas: Linha[]) {}

  eq(coluna: string, valor: unknown) {
    this.filtros.push((l) => l[coluna] === valor);
    return this;
  }
  neq(coluna: string, valor: unknown) {
    this.filtros.push((l) => l[coluna] !== valor);
    return this;
  }
  in(coluna: string, valores: unknown[]) {
    this.filtros.push((l) => valores.includes(l[coluna]));
    return this;
  }
  gte(coluna: string, valor: unknown) {
    this.filtros.push((l) => String(l[coluna]) >= String(valor));
    return this;
  }
  lte(coluna: string, valor: unknown) {
    this.filtros.push((l) => String(l[coluna]) <= String(valor));
    return this;
  }
  order(coluna: string, opcoes?: { ascending?: boolean }) {
    this.ordenacao.push({ coluna, asc: opcoes?.ascending !== false });
    return this;
  }
  limit(n: number) {
    this.teto = n;
    return this;
  }
  maybeSingle() {
    this.modo = "um_ou_nulo";
    return this;
  }
  single() {
    this.modo = "um";
    return this;
  }

  private resolver() {
    let r = this.linhas.filter((l) => this.filtros.every((f) => f(l)));
    for (const o of [...this.ordenacao].reverse()) {
      r = [...r].sort((a, b) => {
        const va = String(a[o.coluna] ?? "");
        const vb = String(b[o.coluna] ?? "");
        return o.asc ? va.localeCompare(vb) : vb.localeCompare(va);
      });
    }
    if (this.teto !== null) r = r.slice(0, this.teto);

    if (this.modo === "lista") return { data: r.map((l) => ({ ...l })), error: null };
    if (r.length === 0) {
      return this.modo === "um_ou_nulo"
        ? { data: null, error: null }
        : { data: null, error: { code: "PGRST116", message: "no rows" } as ErroPostgrest };
    }
    return { data: { ...r[0] }, error: null };
  }

  then<TR1 = { data: unknown; error: ErroPostgrest | null }, TR2 = never>(
    aoResolver?: ((v: { data: unknown; error: ErroPostgrest | null }) => TR1 | PromiseLike<TR1>) | null,
    aoRejeitar?: ((r: unknown) => TR2 | PromiseLike<TR2>) | null,
  ): PromiseLike<TR1 | TR2> {
    return Promise.resolve(this.resolver()).then(aoResolver, aoRejeitar);
  }
}

class Insercao implements PromiseLike<{ data: unknown; error: ErroPostgrest | null }> {
  private modo: "lista" | "um" = "lista";
  constructor(
    private tabela: string,
    private linhas: Linha[],
    private novas: Linha[],
  ) {}

  select() {
    return this;
  }
  single() {
    this.modo = "um";
    return this;
  }
  maybeSingle() {
    this.modo = "um";
    return this;
  }

  private resolver() {
    const inseridas: Linha[] = [];
    for (const bruta of this.novas) {
      const linha: Linha = {
        id: novoId(this.tabela.slice(0, 4)),
        criado_em: new Date().toISOString(),
        ...bruta,
      };
      for (const coluna of UNICOS[this.tabela] ?? []) {
        const valor = linha[coluna];
        if (valor === null || valor === undefined) continue;
        if (this.linhas.some((l) => l[coluna] === valor)) {
          return {
            data: null,
            error: {
              code: "23505",
              message: `duplicate key value violates unique constraint "${this.tabela}_${coluna}_key"`,
            } as ErroPostgrest,
          };
        }
      }
      this.linhas.push(linha);
      inseridas.push(linha);
    }
    return this.modo === "um"
      ? { data: inseridas[0] ? { ...inseridas[0] } : null, error: null }
      : { data: inseridas.map((l) => ({ ...l })), error: null };
  }

  then<TR1 = { data: unknown; error: ErroPostgrest | null }, TR2 = never>(
    aoResolver?: ((v: { data: unknown; error: ErroPostgrest | null }) => TR1 | PromiseLike<TR1>) | null,
    aoRejeitar?: ((r: unknown) => TR2 | PromiseLike<TR2>) | null,
  ): PromiseLike<TR1 | TR2> {
    return Promise.resolve(this.resolver()).then(aoResolver, aoRejeitar);
  }
}

class Atualizacao implements PromiseLike<{ data: unknown; error: ErroPostgrest | null }> {
  private filtros: Filtro[] = [];
  constructor(
    private linhas: Linha[],
    private patch: Linha,
  ) {}

  eq(coluna: string, valor: unknown) {
    this.filtros.push((l) => l[coluna] === valor);
    return this;
  }
  in(coluna: string, valores: unknown[]) {
    this.filtros.push((l) => valores.includes(l[coluna]));
    return this;
  }
  select() {
    return this;
  }

  private resolver() {
    const alvo = this.linhas.filter((l) => this.filtros.every((f) => f(l)));
    for (const l of alvo) Object.assign(l, this.patch);
    return { data: alvo.map((l) => ({ ...l })), error: null };
  }

  then<TR1 = { data: unknown; error: ErroPostgrest | null }, TR2 = never>(
    aoResolver?: ((v: { data: unknown; error: ErroPostgrest | null }) => TR1 | PromiseLike<TR1>) | null,
    aoRejeitar?: ((r: unknown) => TR2 | PromiseLike<TR2>) | null,
  ): PromiseLike<TR1 | TR2> {
    return Promise.resolve(this.resolver()).then(aoResolver, aoRejeitar);
  }
}

export interface ChamadaRpc {
  nome: string;
  args: Record<string, unknown>;
}

export class FakeSupabase {
  tabelas: Record<string, Linha[]> = {};
  rpcs: ChamadaRpc[] = [];
  handlers: Record<string, (args: Record<string, unknown>) => { data: unknown; error: unknown }> = {};

  constructor(sementes: Record<string, Linha[]> = {}) {
    for (const [t, linhas] of Object.entries(sementes)) this.tabelas[t] = linhas.map((l) => ({ ...l }));
  }

  tabela(nome: string): Linha[] {
    if (!this.tabelas[nome]) this.tabelas[nome] = [];
    return this.tabelas[nome];
  }

  from(nome: string) {
    const linhas = this.tabela(nome);
    return {
      select: () => new Consulta(linhas),
      insert: (v: Linha | Linha[]) => new Insercao(nome, linhas, Array.isArray(v) ? v : [v]),
      update: (patch: Linha) => new Atualizacao(linhas, patch),
      delete: () => new Atualizacao(linhas, {}),
    };
  }

  async rpc(nome: string, args: Record<string, unknown> = {}) {
    this.rpcs.push({ nome, args });
    const h = this.handlers[nome];
    if (h) return h(args);
    return { data: null, error: null };
  }

  /** Última chamada de uma RPC (ou null). */
  ultimaRpc(nome: string): ChamadaRpc | null {
    for (let i = this.rpcs.length - 1; i >= 0; i--) if (this.rpcs[i].nome === nome) return this.rpcs[i];
    return null;
  }
}

export function criarFakeSupabase(sementes: Record<string, Linha[]> = {}) {
  return new FakeSupabase(sementes);
}
