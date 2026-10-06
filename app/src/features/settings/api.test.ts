import { describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ log: [] as string[] }));
vi.mock('@/lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'gte', 'order']) chain[m] = (...a: unknown[]) => { calls.log.push(`${m}(${a.map((x) => (typeof x === 'object' ? 'obj' : String(x))).join(',')})`); return chain; };
  chain.limit = (n: number) => { calls.log.push(`limit(${n})`); return Promise.resolve({ data: [], error: null }); };
  return { supabase: { from: (t: string) => { calls.log.push(`from(${t})`); return chain; } } };
});

import { fetchClientErrors } from './api';

describe('fetchClientErrors', () => {
  it('reads client_errors from the last 30 days by last_seen, newest first, at most 50 rows', async () => {
    await fetchClientErrors();
    expect(calls.log).toContain('from(client_errors)');
    expect(calls.log.some((x) => /^gte\(last_seen,\d{4}-\d\d-\d\dT/.test(x))).toBe(true);
    expect(calls.log).toContain('order(last_seen,obj)');
    expect(calls.log).toContain('limit(50)');
  });
});
