// A direct stay and its Airbnb mirror (or the same guest listed twice) share the guest id or, failing
// that, the name. Used by Today to show one entry and by the calendar to tell "same guest, two
// sources" (not a conflict) from two different guests on one night (a real conflict).

type G = { name: string; id: string | null };

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function sameGuest(a: G, b: G): boolean {
  if (a.id && b.id) return a.id === b.id;
  return norm(a.name) !== '' && norm(a.name) === norm(b.name);
}

type Row = { kind: string; guest: string; guestId: string | null; checkin: string; checkout: string };

// Keeps one row per guest when stays overlap. A direct row wins over an Airbnb/calendar row;
// the survivor gets `alsoOn` naming the sources it absorbed.
export function dedupeOverlapping<T extends Row>(rows: T[]): Array<T & { alsoOn?: string }> {
  const out: Array<T & { alsoOn?: string }> = [];
  for (const r of rows) {
    const i = out.findIndex((o) => sameGuest({ name: o.guest, id: o.guestId }, { name: r.guest, id: r.guestId }) && o.checkin < r.checkout && r.checkin < o.checkout);
    if (i < 0) { out.push({ ...r }); continue; }
    const keep = out[i]!;
    const [win, lose] = r.kind === 'direct' && keep.kind !== 'direct' ? [r, keep] : [keep, r];
    out[i] = { ...win, alsoOn: lose.kind === 'airbnb' ? 'Airbnb' : lose.kind === 'direct' ? 'direct' : 'calendar' };
  }
  return out;
}
