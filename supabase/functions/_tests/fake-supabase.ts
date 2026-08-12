// A tiny in-memory Supabase client stand-in for edge-fn unit tests (grown
// beyond its original Field Coordination scope — now shared across suites).
// It models tables as arrays and supports the exact query surface callers
// use: select/eq/neq/in/lt/gt/gte/lte/is/order/limit + maybeSingle/single,
// insert/update/upsert(onConflict,ignoreDuplicates), rpc, storage.from().upload(),
// and functions.invoke(). Not a Postgres — just enough to exercise
// send/parse/dispatch logic deterministically and offline.

type Row = Record<string, unknown>;
type Predicate = (r: Row) => boolean;

function clone<T>(o: T): T {
  return o == null ? o : (JSON.parse(JSON.stringify(o)) as T);
}

class Builder {
  private filters: Predicate[] = [];
  private _order?: { col: string; asc: boolean };
  private _limit?: number;
  private _op: "select" | "insert" | "update" | "upsert" = "select";
  private _payload: unknown;
  private _onConflict?: string;
  private _ignoreDup = false;
  private _single: "none" | "maybe" | "one" = "none";

  constructor(private store: Record<string, Row[]>, private table: string) {}

  select(_cols?: string): this { return this; }
  eq(col: string, val: unknown): this { this.filters.push((r) => r[col] === val); return this; }
  neq(col: string, val: unknown): this { this.filters.push((r) => r[col] !== val); return this; }
  in(col: string, arr: unknown[]): this { this.filters.push((r) => arr.includes(r[col])); return this; }
  lt(col: string, val: unknown): this { this.filters.push((r) => r[col] != null && (r[col] as never) < (val as never)); return this; }
  gt(col: string, val: unknown): this { this.filters.push((r) => r[col] != null && (r[col] as never) > (val as never)); return this; }
  gte(col: string, val: unknown): this { this.filters.push((r) => r[col] != null && (r[col] as never) >= (val as never)); return this; }
  lte(col: string, val: unknown): this { this.filters.push((r) => r[col] != null && (r[col] as never) <= (val as never)); return this; }
  is(col: string, val: unknown): this {
    this.filters.push((r) => (val === null ? r[col] == null : r[col] === val));
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this._order = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number): this { this._limit = n; return this; }
  insert(payload: unknown): this { this._op = "insert"; this._payload = payload; return this; }
  update(payload: unknown): this { this._op = "update"; this._payload = payload; return this; }
  upsert(payload: unknown, opts?: { onConflict?: string; ignoreDuplicates?: boolean }): this {
    this._op = "upsert";
    this._payload = payload;
    this._onConflict = opts?.onConflict;
    this._ignoreDup = !!opts?.ignoreDuplicates;
    return this;
  }

  maybeSingle() { this._single = "maybe"; return this.run(); }
  single() { this._single = "one"; return this.run(); }
  then<R1 = { data: unknown; error: unknown }, R2 = never>(
    onfulfilled?: ((v: { data: unknown; error: unknown }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private rows(): Row[] {
    this.store[this.table] ??= [];
    return this.store[this.table];
  }

  private applyFilters(list: Row[]): Row[] {
    let out = list;
    for (const f of this.filters) out = out.filter(f);
    if (this._order) {
      const { col, asc } = this._order;
      out = [...out].sort((a, b) => {
        const av = a[col] as never, bv = b[col] as never;
        if (av < bv) return asc ? -1 : 1;
        if (av > bv) return asc ? 1 : -1;
        return 0;
      });
    }
    if (this._limit != null) out = out.slice(0, this._limit);
    return out;
  }

  private shape(out: Row[]): { data: unknown; error: unknown } {
    if (this._single === "maybe") return { data: out[0] ?? null, error: null };
    if (this._single === "one") return { data: out[0] ?? null, error: out.length ? null : { message: "no rows" } };
    return { data: out, error: null };
  }

  // deno-lint-ignore require-await
  private async run(): Promise<{ data: unknown; error: unknown }> {
    const rows = this.rows();
    if (this._op === "select") return this.shape(this.applyFilters(rows).map(clone));

    if (this._op === "insert") {
      const items = (Array.isArray(this._payload) ? this._payload : [this._payload]) as Row[];
      const recs = items.map((x) => ({ id: x.id ?? crypto.randomUUID(), ...x }));
      rows.push(...recs.map(clone));
      return this.shape(recs.map(clone));
    }

    if (this._op === "upsert") {
      const items = (Array.isArray(this._payload) ? this._payload : [this._payload]) as Row[];
      const affected: Row[] = [];
      for (const x of items) {
        const cc = this._onConflict;
        const dup = cc ? rows.find((r) => x[cc] != null && r[cc] === x[cc]) : undefined;
        if (dup) {
          if (this._ignoreDup) continue; // conflict ignored → not returned
          Object.assign(dup, x);
          affected.push(dup);
        } else {
          const rec = { id: x.id ?? crypto.randomUUID(), ...x };
          rows.push(rec);
          affected.push(rec);
        }
      }
      return this.shape(affected.map(clone));
    }

    // update
    const matched = this.applyFilters(rows);
    for (const m of matched) Object.assign(m, this._payload as Row);
    return this.shape(matched.map(clone));
  }
}

export interface FakeSupabase {
  from(table: string): Builder;
  rpc(name: string, args?: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
  storage: {
    from(bucket: string): {
      upload(path: string, bytes: unknown, opts?: unknown): Promise<{ data: unknown; error: unknown }>;
      move(fromPath: string, toPath: string): Promise<{ data: unknown; error: unknown }>;
    };
  };
  functions: {
    invoke(name: string, opts?: { body?: unknown }): Promise<{ data: unknown; error: unknown }>;
  };
  _data: Record<string, Row[]>;
  _uploads: Array<{ bucket: string; path: string }>;
  _moves: Array<{ bucket: string; from: string; to: string }>;
  _invocations: Array<{ name: string; body: unknown }>;
  /** Test hook: paths that should fail on the next .move() call. */
  _failMovesFor?: Set<string>;
}

export function createFakeSupabase(
  initial: Record<string, Row[]> = {},
  rpcHandlers: Record<string, (args: Record<string, unknown>) => { data: unknown; error: unknown }> = {},
): FakeSupabase {
  const store: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(initial)) store[k] = v.map(clone);
  const uploads: Array<{ bucket: string; path: string }> = [];
  const moves: Array<{ bucket: string; from: string; to: string }> = [];
  const invocations: Array<{ name: string; body: unknown }> = [];
  const failMovesFor = new Set<string>();

  return {
    from: (table: string) => new Builder(store, table),
    // deno-lint-ignore require-await
    rpc: async (name: string, args: Record<string, unknown> = {}) =>
      rpcHandlers[name] ? rpcHandlers[name](args) : { data: null, error: null },
    storage: {
      from: (bucket: string) => ({
        // deno-lint-ignore require-await
        upload: async (path: string) => {
          uploads.push({ bucket, path });
          return { data: { path }, error: null };
        },
        // deno-lint-ignore require-await
        move: async (fromPath: string, toPath: string) => {
          if (failMovesFor.has(fromPath)) {
            return { data: null, error: { message: "move failed" } };
          }
          moves.push({ bucket, from: fromPath, to: toPath });
          return { data: { message: "moved" }, error: null };
        },
      }),
    },
    functions: {
      // deno-lint-ignore require-await
      invoke: async (name: string, opts?: { body?: unknown }) => {
        invocations.push({ name, body: opts?.body });
        return { data: null, error: null };
      },
    },
    _data: store,
    _uploads: uploads,
    _moves: moves,
    _invocations: invocations,
    _failMovesFor: failMovesFor,
  };
}
