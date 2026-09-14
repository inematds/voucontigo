/**
 * Supabase admin falso, em memória, para os testes de `lib/asaas` e `app/api/asaas`.
 * Cobre só o que esse código usa: from/select/insert/update/delete + eq/in/lt/lte/gte/neq/
 * order/limit/maybeSingle/single, e o thenable `{ data, error }`.
 * Emula unicidade de `webhook_processado (provedor, evento_id)` e `pagamento.asaas_id`.
 */

export type Linha = Record<string, unknown>;
export type Store = Record<string, Linha[]>;

let contador = 0;
const novoId = () => `id-${++contador}`;

export function resetIds() {
  contador = 0;
}

type Filtro = (l: Linha) => boolean;

const UNICOS: Record<string, string[][]> = {
  webhook_processado: [["provedor", "evento_id"]],
  pagamento: [["asaas_id"]],
};

function viola(store: Store, tabela: string, linha: Linha, ignorar?: Linha): string | null {
  for (const chaves of UNICOS[tabela] ?? []) {
    if (chaves.some((k) => linha[k] === null || linha[k] === undefined)) continue;
    const bate = (store[tabela] ?? []).find(
      (l) => l !== ignorar && chaves.every((k) => l[k] === linha[k]),
    );
    if (bate) return chaves.join(",");
  }
  return null;
}

class Consulta implements PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> {
  private filtros: Filtro[] = [];
  private modo: "select" | "insert" | "update" | "delete" = "select";
  private payload: Linha[] = [];
  private retornar = false;
  private unico: "none" | "maybe" | "single" = "none";
  private _limite: number | null = null;
  private _ordem: { campo: string; asc: boolean } | null = null;

  constructor(private store: Store, private tabela: string) {}

  private get linhas(): Linha[] {
    if (!this.store[this.tabela]) this.store[this.tabela] = [];
    return this.store[this.tabela];
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  select(_cols?: string) {
    this.retornar = true;
    return this;
  }
  insert(v: Linha | Linha[]) {
    this.modo = "insert";
    this.payload = Array.isArray(v) ? v : [v];
    return this;
  }
  update(v: Linha) {
    this.modo = "update";
    this.payload = [v];
    return this;
  }
  upsert(v: Linha | Linha[]) {
    return this.insert(v);
  }
  delete() {
    this.modo = "delete";
    return this;
  }

  eq(c: string, v: unknown) {
    this.filtros.push((l) => l[c] === v);
    return this;
  }
  neq(c: string, v: unknown) {
    this.filtros.push((l) => l[c] !== v);
    return this;
  }
  is(c: string, v: unknown) {
    this.filtros.push((l) => (l[c] ?? null) === v);
    return this;
  }
  in(c: string, vs: unknown[]) {
    this.filtros.push((l) => vs.includes(l[c]));
    return this;
  }
  lt(c: string, v: string | number) {
    this.filtros.push((l) => (l[c] as string) < v);
    return this;
  }
  lte(c: string, v: string | number) {
    this.filtros.push((l) => (l[c] as string) <= v);
    return this;
  }
  gt(c: string, v: string | number) {
    this.filtros.push((l) => (l[c] as string) > v);
    return this;
  }
  gte(c: string, v: string | number) {
    this.filtros.push((l) => (l[c] as string) >= v);
    return this;
  }
  order(campo: string, o?: { ascending?: boolean }) {
    this._ordem = { campo, asc: o?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this._limite = n;
    return this;
  }
  maybeSingle() {
    this.unico = "maybe";
    this.retornar = true;
    return this;
  }
  single() {
    this.unico = "single";
    this.retornar = true;
    return this;
  }

  private casam(): Linha[] {
    return this.linhas.filter((l) => this.filtros.every((f) => f(l)));
  }

  private executar(): { data: unknown; error: { message: string; code?: string } | null } {
    let resultado: Linha[] = [];
    let erro: { message: string; code?: string } | null = null;

    if (this.modo === "insert") {
      for (const p of this.payload) {
        const linha: Linha = { id: novoId(), criado_em: new Date().toISOString(), ...p };
        const conflito = viola(this.store, this.tabela, linha);
        if (conflito) {
          erro = { message: `duplicate key value violates unique constraint (${conflito})`, code: "23505" };
          break;
        }
        this.linhas.push(linha);
        resultado.push(linha);
      }
    } else if (this.modo === "update") {
      for (const l of this.casam()) {
        Object.assign(l, this.payload[0]);
        resultado.push(l);
      }
    } else if (this.modo === "delete") {
      for (const l of this.casam()) {
        const i = this.linhas.indexOf(l);
        if (i >= 0) this.linhas.splice(i, 1);
        resultado.push(l);
      }
    } else {
      resultado = this.casam();
      if (this._ordem) {
        const { campo, asc } = this._ordem;
        resultado = [...resultado].sort((a, b) => {
          const x = String(a[campo] ?? "");
          const y = String(b[campo] ?? "");
          return asc ? x.localeCompare(y) : y.localeCompare(x);
        });
      }
      if (this._limite !== null) resultado = resultado.slice(0, this._limite);
    }

    if (erro) return { data: null, error: erro };

    if (this.unico === "maybe") return { data: resultado[0] ?? null, error: null };
    if (this.unico === "single") {
      return resultado.length === 1
        ? { data: resultado[0], error: null }
        : { data: null, error: { message: "no rows", code: "PGRST116" } };
    }
    return { data: this.retornar || this.modo === "select" ? resultado : null, error: null };
  }

  then<R1 = { data: unknown; error: { message: string; code?: string } | null }, R2 = never>(
    onOk?: ((v: { data: unknown; error: { message: string; code?: string } | null }) => R1 | PromiseLike<R1>) | null,
    onErr?: ((r: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.executar()).then(onOk, onErr);
  }
}

export function criarFakeSupabase(store: Store) {
  return {
    store,
    from(tabela: string) {
      return new Consulta(store, tabela);
    },
  };
}

export type FakeSupabase = ReturnType<typeof criarFakeSupabase>;
