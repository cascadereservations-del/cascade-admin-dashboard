import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { foldedAuthStorage, isFolded } from './fold';
import { allowed, isStaffRole, type Action, type StaffRole } from '@/auth/capabilities';

function mem() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), length: 0, key: () => null, m };
}
const K = 'sb-qkgfhsdppslwunarczeq-auth-token';

describe('isFolded', () => {
  it('detects the shell path and ?shell=1 only', () => {
    expect(isFolded({ pathname: '/Cascade-Staff/admin/', search: '' })).toBe(true);
    expect(isFolded({ pathname: '/cascade-admin-dashboard/', search: '?shell=1' })).toBe(import.meta.env.DEV); // dev-only flag
    expect(isFolded({ pathname: '/cascade-admin-dashboard/', search: '' })).toBe(false);
  });
});

describe('foldedAuthStorage', () => {
  it('reads a sessionStorage (untrusted) session and refreshes it in place, never into localStorage', () => {
    const l = mem(), s = mem(); s.setItem(K, 'a');
    const st = foldedAuthStorage(l, s);
    expect(st.getItem(K)).toBe('a');
    st.setItem(K, 'b');
    expect(s.getItem(K)).toBe('b');
    expect(l.getItem(K)).toBeNull();
  });
  it('keeps a trusted session in localStorage', () => {
    const l = mem(), s = mem(); l.setItem(K, 'a');
    const st = foldedAuthStorage(l, s);
    st.setItem(K, 'b');
    expect(l.getItem(K)).toBe('b');
    expect(s.getItem(K)).toBeNull();
  });
  it('removeItem clears both; throwing storage is tolerated', () => {
    const l = mem(), s = mem(); l.setItem(K, 'a'); s.setItem(K, 'a');
    const st = foldedAuthStorage(l, s);
    st.removeItem(K);
    expect(l.getItem(K) ?? s.getItem(K)).toBeNull();
    const bad = { ...mem(), getItem: () => { throw new Error('x'); } };
    expect(foldedAuthStorage(bad, null).getItem(K)).toBeNull();
  });
});

// Parses one-line `path: 'x', element: guard('action', ...)` entries from routes.tsx source and checks
// that every non-public route (all but /sign-in, / and *) was parsed, so an unguarded or multi-line
// route fails the count. It then checks the parsed actions against ROLE_ACTIONS for field roles.
describe('route gates for field roles', () => {
  const src = readFileSync('app/src/routes.tsx', 'utf8');
  const routes = [...src.matchAll(/path: '([^']+)', element: guard\('(\w+)'/g)].map((m) => ({ path: m[1] ?? '', action: m[2] as Action }));
  const reach = (role: StaffRole) => routes.filter((r) => allowed(role, r.action, false, 'aal1')).map((r) => r.path);
  it('finds the guarded routes', () => {
    const pathCount = [...src.matchAll(/path: '/g)].length;
    expect(routes.length).toBe(pathCount - 3);
    expect(isStaffRole('cleaner')).toBe(true);
  });
  it.each(['cleaner', 'inspector', 'maintenance'] as StaffRole[])('%s gets no finance, guests, pricing, insights or settings admin route', (role) => {
    const open = reach(role);
    for (const p of open) {
      expect(p).not.toMatch(/^(finance|guests|pricing|insights)/);
      expect(p === 'settings' || /^settings\/(audit|guest-contact|pay-rates)/.test(p)).toBe(false);
    }
  });
  it('cleaner reaches only read_operations and submit_cleaning routes', () => {
    for (const r of routes) if (allowed('cleaner', r.action, false, 'aal1')) expect(['read_operations', 'submit_cleaning']).toContain(r.action);
  });
});
