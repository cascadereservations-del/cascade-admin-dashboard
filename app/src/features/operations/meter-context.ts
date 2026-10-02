// Pure helpers for the cleaning-detail Meters card: put one reading in context (the stay it
// covers, usage per night against this property's recent normal, a plain status) so a reviewer
// can judge it at a glance. Advisory only -- nothing here blocks or edits a reading.
// No electricity or water rate is stored anywhere in the data, so no cost is estimated.

type Num = string | number | null | undefined;
export type MeterReading = { electric_prev: Num; electric_curr: Num; electric_delta: Num; water_prev: Num; water_curr: Num; water_delta: Num; kwh_per_night: Num; m3_per_night: Num; meter_flag?: string | null };
export type BaselineRow = MeterReading & { session_id?: string | null };
type Stay = { nights_stayed?: number | null; checkin_date?: string | null; checkout_date?: string | null };

export type Status = 'normal' | 'high' | 'low' | 'check' | 'unknown';
export type Band = { n: number; median: number; low: number; high: number };
export type UsageLine = { kind: 'electric' | 'water'; unit: string; delta: number | null; perNight: number | null; status: Status; why: string; band: Band | null };
export type MeterAssessment = { status: Status; why: string; nights: number | null; electric: UsageLine; water: UsageLine };

export const MIN_BASELINE = 5;
export const BASELINE_STAYS = 20;

const num = (v: Num): number | null => { if (v === null || v === undefined || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null; };

/** Whole nights covered, from the stored count or the check-in/out dates. */
export function stayNights(s: Stay): number | null {
  if (s.nights_stayed && s.nights_stayed > 0) return s.nights_stayed;
  if (!s.checkin_date || !s.checkout_date) return null;
  const n = Math.round((Date.parse(`${s.checkout_date}T00:00:00Z`) - Date.parse(`${s.checkin_date}T00:00:00Z`)) / 86_400_000);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Median and normal band (Tukey fences, floored at a quarter of the median) of per-night usage. */
export function bandOf(values: number[]): Band | null {
  const v = values.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b);
  if (v.length < MIN_BASELINE) return null;
  const median = quantile(v, 0.5), q1 = quantile(v, 0.25), q3 = quantile(v, 0.75);
  const iqr = Math.max(q3 - q1, median * 0.25);
  return { n: v.length, median, low: Math.max(q1 - 1.5 * iqr, median * 0.25), high: q3 + 1.5 * iqr };
}

/** Per-night usage of the latest ordinary stays (rows newest first): unflagged, real previous reading, some use, not this session. */
export function baselineFrom(rows: BaselineRow[], excludeSessionId?: string, take = BASELINE_STAYS) {
  const ok = rows.filter((r) => r.session_id !== excludeSessionId && !r.meter_flag && (num(r.electric_prev) ?? 0) > 0 && (num(r.water_prev) ?? 0) > 0 && (num(r.electric_delta) ?? 0) > 0 && (num(r.water_delta) ?? 0) > 0).slice(0, take);
  return { kwh: ok.map((r) => num(r.kwh_per_night)).filter((x): x is number => x !== null), m3: ok.map((r) => num(r.m3_per_night)).filter((x): x is number => x !== null) };
}

export const fmtUsage = (x: number, kind: 'electric' | 'water') => (Math.round(x * (kind === 'electric' ? 10 : 1000)) / (kind === 'electric' ? 10 : 1000)).toString();

function line(kind: 'electric' | 'water', m: MeterReading, nights: number | null, band: Band | null): UsageLine {
  const e = kind === 'electric';
  const unit = e ? 'kWh' : 'm³';
  const prev = num(e ? m.electric_prev : m.water_prev), curr = num(e ? m.electric_curr : m.water_curr), delta = num(e ? m.electric_delta : m.water_delta);
  const stored = num(e ? m.kwh_per_night : m.m3_per_night);
  const perNight = stored ?? (delta !== null && nights ? delta / nights : null);
  const name = e ? 'Electric' : 'Water';
  const base = { kind, unit, delta, perNight, band } as const;
  if (prev === null || curr === null || delta === null) return { ...base, status: 'check', why: `${name}: a reading is missing.` };
  if (curr < prev) return { ...base, status: 'check', why: `${name}: the new reading is lower than the last one.` };
  if (Math.abs(curr - prev - delta) > 0.0105) return { ...base, status: 'check', why: `${name}: the change does not match new minus last.` };
  if (delta === 0) return { ...base, status: 'check', why: `${name}: no use recorded for the stay, which is unlikely.` };
  if (perNight === null || !band) return { ...base, status: 'unknown', why: `${name}: not enough recent stays to compare.` };
  const range = `${fmtUsage(band.low, kind)}-${fmtUsage(band.high, kind)} ${unit}/night`;
  if (perNight > band.high) return { ...base, status: 'high', why: `${name} ${fmtUsage(perNight, kind)} ${unit}/night is above the usual ${range}.` };
  if (perNight < band.low) return { ...base, status: 'low', why: `${name} ${fmtUsage(perNight, kind)} ${unit}/night is below the usual ${range}.` };
  return { ...base, status: 'normal', why: `${name} ${fmtUsage(perNight, kind)} ${unit}/night is within the usual ${range}.` };
}

const RANK: Record<Status, number> = { check: 4, high: 3, low: 2, unknown: 1, normal: 0 };

export function assessMeter(m: MeterReading, stay: Stay, baseline: { kwh: number[]; m3: number[] }): MeterAssessment {
  const nights = stayNights(stay);
  const electric = line('electric', m, nights, bandOf(baseline.kwh));
  const water = line('water', m, nights, bandOf(baseline.m3));
  const worst = RANK[water.status] > RANK[electric.status] ? water : electric;
  const status = worst.status;
  const why = status === 'normal' ? 'Electric and water are both within the usual range for this property.' : status === 'unknown' ? 'Not enough recent stays to compare against yet.' : worst.why;
  return { status, why, nights, electric, water };
}

export const STATUS_LABEL: Record<Status, string> = { normal: 'Normal', high: 'High', low: 'Low', check: 'Check reading', unknown: 'No baseline yet' };

// Plain-language flag choices; the stored values are unchanged (METER_FLAGS in api.ts).
export const FLAG_LABEL: Record<string, string> = {
  none: 'No flag - the reading looks right',
  first_reading: 'First reading - nothing earlier to compare',
  re_entry: 'Re-entered or corrected by the cleaner',
  misread: 'Misread - the numbers are wrong',
  duplicate: 'Duplicate of another reading',
  under_review: 'Under review - not sure yet',
};
export const flagLabel = (f: string) => FLAG_LABEL[f] ?? f.replaceAll('_', ' ');
