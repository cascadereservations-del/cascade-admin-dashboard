import type { Stay } from './model';

// One colour per GUEST from the Staff app's eight (--v5-k1..k8), the same rule as staff-app/calendar/K_bookcal.js K_colours, so both calendars agree.
// Key: 'id:<guest id>' when the stay has one, else the lower-cased name with spaces collapsed. An empty name or "guest" never merges: that stay
// keeps its own colour. Guests are placed in first-check-in order, each avoiding the colours of OTHER guests whose stays are within 14 days of
// any of theirs (when eight are not enough: only those that touch or overlap).
const NCOL = 8;
const DAY = 86400000;
const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
const add = (iso: string, n: number) => new Date(utc(iso) + n * DAY).toISOString().slice(0, 10);

type S = Pick<Stay, 'guestId' | 'guestName' | 'checkin' | 'checkout'>;

export const guestKey = (st: Pick<Stay, 'guestId' | 'guestName'>) =>
  st.guestId ? 'id:' + st.guestId : st.guestName.replace(/\s+/g, ' ').trim().toLowerCase();

/** Colour 1..8 for each stay (pass the live stays; blocked and cancelled ones take none). */
export function guestColours<T extends S>(stays: T[]): (st: T) => number {
  const by = new Map<string, { stays: T[]; c: number }>();
  const order: { stays: T[]; c: number }[] = [];
  [...stays]
    .sort((a, b) => (a.checkin < b.checkin ? -1 : a.checkin > b.checkin ? 1 : a.checkout < b.checkout ? -1 : 1))
    .forEach((st, i) => {
      let k = guestKey(st);
      if (!k || k === 'guest') k = '#' + i;
      let g = by.get(k);
      if (!g) { g = { stays: [], c: 0 }; by.set(k, g); order.push(g); }
      g.stays.push(st);
    });
  const done: { stays: T[]; c: number }[] = [];
  for (const g of order) {
    const c0 = Math.floor(utc(g.stays[0]!.checkin) / DAY) % NCOL;
    let pick: number | null = null;
    for (const gap of [14, 0]) {
      const used = new Set<number>();
      for (const o of done) if (o.stays.some((x) => g.stays.some((y) => x.checkin <= add(y.checkout, gap) && y.checkin <= add(x.checkout, gap)))) used.add(o.c);
      for (let i = 0; i < NCOL && pick == null; i++) if (!used.has((c0 + i) % NCOL)) pick = (c0 + i) % NCOL;
      if (pick != null) break;
    }
    g.c = pick ?? c0;
    done.push(g);
  }
  const map = new Map<T, number>();
  for (const g of order) for (const st of g.stays) map.set(st, g.c + 1);
  return (st) => map.get(st) ?? 0;
}
