// A direct stay and its Airbnb mirror share the guest id. Without ids the name only counts when the
// dates are identical and the name is a real one: a merge must never hide a real conflict between
// two different guests. Used by Today (one entry) and the calendar (mirror vs conflict).

type G = { name: string; id: string | null; checkin: string; checkout: string };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
// Placeholders written by mergeStays / the Airbnb feed when no guest name is known.
const PLACEHOLDER = new Set(['', 'reserved', 'calendar reservation', 'unknown guest', 'blocked (calendar)']);

export function sameGuest(a: G, b: G): boolean {
  if (a.id || b.id) return a.id === b.id;
  const n = norm(a.name);
  return !PLACEHOLDER.has(n) && n === norm(b.name) && a.checkin === b.checkin && a.checkout === b.checkout;
}

type Row = { kind: string; guest: string; guestId: string | null; checkin: string; checkout: string };

// Keeps one row per guest when stays overlap. A direct row wins over an Airbnb/calendar row;
// the survivor gets `alsoOn` naming the source it absorbed.
export function dedupeOverlapping<T extends Row>(rows: T[]): Array<T & { alsoOn?: string }> {
  const g = (r: Row): G => ({ name: r.guest, id: r.guestId, checkin: r.checkin, checkout: r.checkout });
  const out: Array<T & { alsoOn?: string }> = [];
  for (const r of rows) {
    const i = out.findIndex((o) => sameGuest(g(o), g(r)) && o.checkin < r.checkout && r.checkin < o.checkout);
    if (i < 0) { out.push({ ...r }); continue; }
    const keep = out[i]!;
    const [win, lose] = r.kind === 'direct' && keep.kind !== 'direct' ? [r, keep] : [keep, r];
    // A direct booking's own mirror row (same guest id, same dates) is not a second booking: no note.
    const mirror = !!lose.guestId && lose.guestId === win.guestId && lose.checkin === win.checkin && lose.checkout === win.checkout;
    out[i] = mirror ? { ...win } : { ...win, alsoOn: lose.kind === 'airbnb' ? 'Airbnb' : lose.kind === 'direct' ? 'direct' : 'calendar' };
  }
  return out;
}
