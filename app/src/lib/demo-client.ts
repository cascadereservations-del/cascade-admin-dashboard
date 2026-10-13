import type { SupabaseClient } from '@supabase/supabase-js';
import { buildDemoData, DEMO_USER_ID, type Rows } from './demo-data';

// D_ demo mode: a stand-in for the Supabase client that answers from synthetic fixtures. No network, no storage.
// Reads return fixture rows (`eq` narrows when the row has that column; every other filter is ignored). Unknown tables are
// empty; an unknown RPC succeeds with { ok: true } so a demo Save works and changes nothing.

type Result = { data: unknown; error: null; count?: number | null };

class DemoQuery implements PromiseLike<Result> {
  private rows: Rows;
  private mode: 'list' | 'single' | 'maybe' = 'list';
  private lo = 0;
  private hi = Infinity;
  private wrote = false;
  constructor(rows: Rows) { this.rows = rows; }
  private keep(fn: (r: Record<string, unknown>) => boolean) { this.rows = this.rows.filter(fn); return this; }
  select() { return this; }
  insert() { this.wrote = true; return this; }
  update() { this.wrote = true; return this; }
  upsert() { this.wrote = true; return this; }
  delete() { this.wrote = true; return this; }
  eq(col: string, val: unknown) { return this.keep((r) => !(col in r) || r[col] === val); }
  in(col: string, vals: unknown[]) { return this.keep((r) => !(col in r) || vals.includes(r[col])); }
  order() { return this; }
  limit(n: number) { this.hi = Math.min(this.hi, n - 1 + this.lo); return this; }
  range(a: number, b: number) { this.lo = a; this.hi = b; return this; }
  single() { this.mode = 'single'; return this; }
  maybeSingle() { this.mode = 'maybe'; return this; }
  csv() { return this; }
  // Filters the demo does not need to apply.
  neq() { return this; } gt() { return this; } gte() { return this; } lt() { return this; } lte() { return this; } is() { return this; }
  not() { return this; } or() { return this; } like() { return this; } ilike() { return this; } contains() { return this; } filter() { return this; } match() { return this; } textSearch() { return this; } overlaps() { return this; }
  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    const total = this.rows.length;
    const page = this.rows.slice(this.lo, this.hi + 1);
    let data: unknown = this.wrote ? [] : page;
    if (this.mode !== 'list') data = this.wrote ? (this.rows[0] ?? { id: 'demo' }) : (page[0] ?? null);
    const res: Result = { data, error: null, count: total };
    // A single() with no row is an error, like PostgREST (PGRST116); maybeSingle() is null.
    if (this.mode === 'single' && !this.wrote && page.length === 0) return Promise.resolve({ data: null, error: { code: 'PGRST116', message: 'No rows' } } as never).then(ok as never, bad as never);
    return Promise.resolve(res).then(ok, bad);
  }
}

export function createDemoClient(now: Date = new Date()): SupabaseClient {
  const d = buildDemoData(now);
  const session = {
    access_token: 'demo', refresh_token: 'demo', expires_in: 3600, token_type: 'bearer',
    user: { id: DEMO_USER_ID, email: 'demo.owner@example.invalid', user_metadata: { name: 'Demo Owner' }, app_metadata: { role: 'owner' } },
  };
  const client = {
    from: (table: string) => new DemoQuery([...(d.tables[table] ?? [])]),
    rpc: (fn: string, args: Record<string, unknown> = {}) => {
      const f = d.rpcs[fn];
      return Promise.resolve({ data: f ? f(args) : { ok: true }, error: null });
    },
    functions: { invoke: () => Promise.resolve({ data: { ok: true }, error: null }) },
    storage: {
      from: () => ({
        list: () => Promise.resolve({ data: [], error: null }),
        upload: () => Promise.resolve({ data: { path: 'demo' }, error: null }),
        createSignedUrl: () => Promise.resolve({ data: { signedUrl: '' }, error: null }),
        createSignedUrls: () => Promise.resolve({ data: [], error: null }),
      }),
    },
    auth: {
      getSession: () => Promise.resolve({ data: { session }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => undefined } } }),
      signOut: () => Promise.resolve({ error: null }),
      mfa: { getAuthenticatorAssuranceLevel: () => Promise.resolve({ data: { currentLevel: 'aal1', nextLevel: 'aal1' }, error: null }) },
    },
  };
  return client as unknown as SupabaseClient;
}
