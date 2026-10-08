import { describe, expect, it } from 'vitest';
import { dedupeOverlapping, sameGuest } from './same-guest';

const row = (o: Partial<Parameters<typeof dedupeOverlapping>[0][number]>) => ({ kind: 'airbnb', guest: 'Ana Cruz', guestId: null, checkin: '2026-10-08', checkout: '2026-10-10', ...o });

describe('dedupeOverlapping', () => {
  it('shows one entry for a direct stay and its Airbnb mirror, preferring direct', () => {
    const out = dedupeOverlapping([row({}), row({ kind: 'direct', guest: 'ana cruz', checkout: '2026-10-11' })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('direct');
    expect(out[0]!.alsoOn).toBe('Airbnb');
  });
  it('keeps different guests and non-overlapping stays apart', () => {
    expect(dedupeOverlapping([row({}), row({ guest: 'Ben Lim' })])).toHaveLength(2);
    expect(dedupeOverlapping([row({}), row({ checkin: '2026-10-10', checkout: '2026-10-12' })])).toHaveLength(2);
  });
  it('sameGuest prefers ids over names', () => {
    expect(sameGuest({ name: 'A', id: '1' }, { name: 'A', id: '2' })).toBe(false);
    expect(sameGuest({ name: 'A', id: null }, { name: ' a ', id: '2' })).toBe(true);
  });
});
