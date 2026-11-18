// Pure maths for the per-guest electricity and water view. No data access here.
// Every value is per night. Unknown stays null, never 0 (zero use is a real value).

export type Metric = 'kwh' | 'm3';
// estimate: null for a counted stay, else a reason code (a meter_flag value, or 'chain_break').
export type Stay = { sessionId: string; guest: string | null; date: string | null; nights: number | null; kwh: number | null; m3: number | null; estimate: string | null };
export type Average = { avg: number | null; nights: number; stays: number };
export type Ranked = { stay: Stay; value: number; high: boolean };

export const FLAG_RATIO = 1.4;
export const READ_AS_HINT_UNDER = 3;

export const perNight = (total: number | null, nights: number | null): number | null => (total === null || nights === null || !(nights > 0) ? null : total / nights);

// The one flag rule, unrounded; the ranking, the guest card and the badge all call it.
export const isHigh = (v: number | null, avg: number | null): boolean => v !== null && avg !== null && avg > 0 && v / avg >= FLAG_RATIO;

const counted = (s: Stay, m: Metric) => s.estimate === null && s[m] !== null && perNight(s[m], s.nights) !== null;

/** Total over total nights across the counted stays (never an average of averages). */
export function averageOf(stays: Stay[], m: Metric): Average {
  let total = 0, nights = 0, n = 0;
  for (const s of stays) if (counted(s, m)) { total += s[m]!; nights += s.nights!; n += 1; }
  return { avg: nights > 0 ? total / nights : null, nights, stays: n };
}

export function rankStays(stays: Stay[], m: Metric) {
  const avg = averageOf(stays, m);
  const ranked: Ranked[] = stays
    .filter((s) => counted(s, m))
    .map((s) => { const value = perNight(s[m], s.nights)!; return { stay: s, value, high: isHigh(value, avg.avg) }; })
    .sort((a, b) => b.value - a.value || (b.stay.date ?? '').localeCompare(a.stay.date ?? ''));
  return { ranked, estimated: stays.filter((s) => s.estimate !== null), avg };
}

/** m3 to litres, to the nearest 10. */
export const litres = (m3: number): number => Math.round(m3 * 100) * 10;
export const fmtValue = (v: number, m: Metric): string => (m === 'kwh' ? `${v.toFixed(1)} kWh` : `${litres(v)} litres`);

const WORDS: Record<string, string> = {
  typed_accepted: 'Typed in by hand, not read from a photo',
  first_reading: 'First reading, nothing earlier to compare',
  re_entry: 'Re-entered or corrected by the cleaner',
  misread: 'The numbers look wrong',
  duplicate: 'Duplicate of another reading',
  under_review: 'Still under review',
  chain_break: 'Did not follow on from the last photo',
};
export const estimateWords = (code: string): string => WORDS[code] ?? code.replaceAll('_', ' ');

const tokens = (n: string) => n.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);

/**
 * Does the guest name on a cleaning report belong to this guest record? The report often holds a first name only,
 * so a one-word report name is a weaker match ('first'). Surname-only or different names never match.
 */
export function guestMatch(reportName: string | null | undefined, guestName: string): 'exact' | 'first' | null {
  const a = tokens(reportName ?? ''), b = tokens(guestName);
  if (!a.length || !b.length) return null;
  if (a.length === b.length && [...a].sort().join(' ') === [...b].sort().join(' ')) return 'exact';
  if (a.length !== 1) return null;
  // "Surname, Given" puts the given name after the comma; otherwise it is the first word.
  const given = guestName.includes(',') ? tokens(guestName.split(',').slice(1).join(' '))[0] : b[0];
  return given === a[0] ? 'first' : null;
}
