import { describe, expect, it } from 'vitest';
import { guestShade } from './calendar-page';

describe('D_calendar guest shade', () => {
  it('is one of five blues and the same for the same guest, by id or by name', () => {
    const a = { guestId: 'g-1', guestName: 'Demo Guest One' };
    expect(guestShade(a)).toBe(guestShade({ ...a }));
    expect(guestShade({ guestId: null, guestName: ' Demo Guest One ' })).toBe(guestShade({ guestId: null, guestName: 'demo guest one' }));
    for (const n of ['A', 'B', 'Demo Guest Two', 'Demo Guest Three', 'x'.repeat(40)]) expect([1, 2, 3, 4, 5]).toContain(guestShade({ guestId: null, guestName: n }));
  });
  it('spreads different guests over more than one shade', () => {
    const shades = new Set(['Demo Guest One', 'Demo Guest Two', 'Demo Guest Three', 'Demo Guest Four', 'Demo Guest Five', 'Demo Guest Six'].map((n) => guestShade({ guestId: null, guestName: n })));
    expect(shades.size).toBeGreaterThan(2);
  });
});
