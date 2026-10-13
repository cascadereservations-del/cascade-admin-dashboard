import { describe, expect, it, vi } from 'vitest';

// Lane D fix round: the search term goes into LIKE and into a PostgREST .or() string. Backslash, % and _ are escaped for LIKE;
// , ( ) are removed because they would end or open a filter group.
const calls: string[] = [];
vi.mock('@/lib/supabase', () => {
  const chain: Record<string, unknown> = {};
  const rec = (name: string) => (...a: unknown[]) => { if (name === 'or' || name === 'ilike') calls.push(a.map(String).join('|')); return chain; };
  for (const n of ['select', 'eq', 'or', 'ilike', 'order', 'limit']) chain[n] = rec(n);
  chain.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: [] }).then(ok);
  return { supabase: { from: () => chain } };
});
import { globalSearch } from './api';

describe('globalSearch term handling', () => {
  it('escapes % and _ with a real backslash and strips , ( )', async () => {
    calls.length = 0;
    await globalSearch('p', '50%_a,b(c)', { can: () => true } as never, { kinds: ['guest', 'booking'] });
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) {
      expect(c).toContain('50\\%\\_abc');
      expect(c).not.toContain('a,b');
      expect(c).not.toContain('(c)');
    }
  });
  it('a term that is only , ( ) * is too short after stripping: no query at all', async () => {
    calls.length = 0;
    for (const t of ['((', ',,', '**', ' (* ']) expect(await globalSearch('p', t, { can: () => true } as never)).toEqual([]);
    expect(calls).toHaveLength(0);
  });
});
