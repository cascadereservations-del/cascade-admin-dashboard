import { describe, expect, it } from 'vitest';
import { guestColours, guestKey } from './calendar-shade';

const st = (guestName: string, checkin: string, checkout: string, guestId: string | null = null) => ({ guestId, guestName, checkin, checkout });

describe('D_calendar guest colour (the Staff K_colours rule)', () => {
  it('is one of eight and the same for the same guest, by id or by normalised name', () => {
    const a = st('Demo Guest One', '2026-11-01', '2026-11-03', 'g-1');
    const mirror = st('Someone Else', '2026-11-01', '2026-11-03', 'g-1');
    const b = st(' Demo  Guest Two ', '2026-12-01', '2026-12-03');
    const b2 = st('demo guest two', '2027-02-01', '2027-02-03');
    const c = guestColours([a, mirror, b, b2]);
    expect(c(a)).toBe(c(mirror));
    expect(c(b)).toBe(c(b2));
    for (const x of [a, b]) expect([1, 2, 3, 4, 5, 6, 7, 8]).toContain(c(x));
  });
  it('keys by id first, else lower-cased name with spaces collapsed', () => {
    expect(guestKey(st(' Ann  Lee ', 'x', 'y'))).toBe('ann lee');
    expect(guestKey(st('Ann Lee', 'x', 'y', 'g9'))).toBe('id:g9');
  });
  it('gives guests within 14 days different colours, and never merges empty or "Guest" names', () => {
    const list = [st('A', '2026-11-01', '2026-11-04'), st('B', '2026-11-04', '2026-11-06'), st('Guest', '2026-11-06', '2026-11-08'), st('Guest', '2026-11-08', '2026-11-09'), st('', '2026-11-09', '2026-11-10')];
    const c = guestColours(list);
    expect(new Set(list.map(c)).size).toBe(list.length);
  });
});
