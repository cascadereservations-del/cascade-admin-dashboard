import { describe, expect, it } from 'vitest';
import { dedupeOverlapping, sameGuest } from './same-guest';

type R = Parameters<typeof dedupeOverlapping>[0][number];
const row = (o: Partial<R>): R => ({ kind: 'airbnb', guest: 'Ana Cruz', guestId: null, checkin: '2026-10-08', checkout: '2026-10-10', ...o });
const g = (name: string, id: string | null, checkin = '2026-10-08', checkout = '2026-10-10') => ({ name, id, checkin, checkout });

describe('dedupeOverlapping', () => {
  it('merges the same guest id across sources, preferring direct', () => {
    const out = dedupeOverlapping([row({ guestId: 'g1' }), row({ kind: 'direct', guestId: 'g1', checkout: '2026-10-11' })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('direct');
    expect(out[0]!.alsoOn).toBe('Airbnb');
  });
  it('a direct booking and its own mirror row (same id, same dates) merge with no "also on" note', () => {
    const out = dedupeOverlapping([row({ guestId: 'g1', checkout: '2026-10-11' }), row({ kind: 'direct', guestId: 'g1', checkout: '2026-10-11' })]);
    expect(out).toHaveLength(1);
    expect(out[0]!.kind).toBe('direct');
    expect(out[0]!.alsoOn).toBeUndefined();
  });
  it('merges same name with no ids only when the dates are identical', () => {
    expect(dedupeOverlapping([row({}), row({ kind: 'direct', guest: 'ana cruz' })])).toHaveLength(1);
    expect(dedupeOverlapping([row({}), row({ kind: 'direct', checkout: '2026-10-11' })])).toHaveLength(2);
  });
  it('keeps different guests and non-overlapping stays apart', () => {
    expect(dedupeOverlapping([row({}), row({ guest: 'Ben Lim' })])).toHaveLength(2);
    expect(dedupeOverlapping([row({}), row({ checkin: '2026-10-10', checkout: '2026-10-12' })])).toHaveLength(2);
  });
  it('never merges placeholder names (a calendar conflict between different guests stays visible)', () => {
    expect(dedupeOverlapping([row({ guest: 'Reserved' }), row({ kind: 'direct', guest: 'Reserved' })])).toHaveLength(2);
    expect(dedupeOverlapping([row({ guest: 'Unknown guest' }), row({ guest: 'Unknown guest' })])).toHaveLength(2);
  });
});

describe('sameGuest', () => {
  it('requires equal ids when either side has one', () => {
    expect(sameGuest(g('A', '1'), g('A', '2'))).toBe(false);
    expect(sameGuest(g('Ana', null), g('Ana', '2'))).toBe(false);
    expect(sameGuest(g('Ana', '1'), g('Bob', '1'))).toBe(true);
  });
  it('same name, both ids null, different dates is not the same guest', () => {
    expect(sameGuest(g('Ana', null), g('Ana', null, '2026-10-08', '2026-10-11'))).toBe(false);
    expect(sameGuest(g('Ana', null), g(' ana ', null))).toBe(true);
    expect(sameGuest(g('Calendar reservation', null), g('Calendar reservation', null))).toBe(false);
  });
});
