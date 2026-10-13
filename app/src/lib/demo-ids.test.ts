import { describe, expect, it } from 'vitest';
import { routeObjects } from '@/routes';
import { buildDemoData } from './demo-data';

// D_ guard: no duplicate route path, and no duplicate row id inside one sample table (a duplicate key would hide a row).
describe('D_duplicate guard', () => {
  it('has no duplicate route path', () => {
    const paths = routeObjects.find((r) => r.path === '/')!.children!.map((c) => c.path ?? 'index');
    expect(paths.filter((p, i) => paths.indexOf(p) !== i)).toEqual([]);
  });
  it('has no duplicate id inside a sample table', () => {
    const d = buildDemoData(new Date('2026-10-13T02:00:00Z'));
    for (const [table, rows] of Object.entries(d.tables)) {
      const ids = rows.map((r) => r.id).filter((x) => x !== undefined);
      expect({ table, dup: ids.filter((x, i) => ids.indexOf(x) !== i) }).toEqual({ table, dup: [] });
    }
  });
  it('uses synthetic names only', () => {
    const text = JSON.stringify(buildDemoData(new Date('2026-10-13T02:00:00Z')).tables);
    expect(text).not.toMatch(/@gmail|@yahoo|\+63 9(?!00 000)/);
  });
});
