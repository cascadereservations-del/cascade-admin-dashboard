// SPEC-35 / SPEC-42 item 1: the price advisor's arithmetic. Pure functions, no network, no clock, no storage.
// The advisor SUGGESTS a nightly price from a target net earning; it never writes one (the host applies a number by
// publishing it in Rate settings). Unknown is null, never 0: a month with no history has no expected occupancy until the
// host types one, and a night count of 0 is a real answer ("none sold"), kept apart from "we do not know".
//
//   need                = target net + expenses + overheads            (expenses and overheads: per month, summed over the months used)
//   expected nights     = expected occupancy x sellable nights         (sellable = days - nights held for brownout, maintenance, owner use)
//   flat price          = need / expected nights / (1 - fee)
//   seasonal price(m)   = flat-price money spread by occupancy: price(m) = need / (1 - fee) x occupancy(m) / sum(occupancy x nights)
//                         (a month that sells half as often as another is priced half as high, and the period still earns the need)
// Prices are rounded to the peso; guard rails (minimum, maximum) clamp the rounded result and say so.

export type IsoDate = string;

export type AdvisorMonth = {
  month: IsoDate; // first of the month
  days: number;
  heldNights: number; // this year: nights held for brownout / maintenance / owner use (not sellable)
  lyMonth: IsoDate;
  lyDaysCovered: number; // days of last year's month that are on record (history may start mid-month)
  lyAirbnbNights: number | null;
  lyDirectNights: number | null;
  lyHeldNights: number | null;
  lyStays: number;
  lyPayoutTotal: number | null; // money paid out for last year's nights that carry a payout figure
  lyPaidNights: number;
};
export type ExpenseCategory = { category: string; total: number; rows: number; estimateTotal: number };
export type AdvisorInputs = {
  from: IsoDate; to: IsoDate; today: IsoDate;
  historyStart: IsoDate | null; accountingStart: IsoDate | null;
  months: AdvisorMonth[];
  expenses: { windowStart: IsoDate | null; windowEnd: IsoDate | null; monthsCovered: number | null; categories: ExpenseCategory[] };
  airbnbFee: { rate: number | null; stays: number };
};

// ---------- reading the server's answer ----------

/** A finite number, or null. Number(null) is 0, so null, undefined, '' and junk are handled before Number(). */
export function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
}
const int0 = (v: unknown) => numOrNull(v) ?? 0; // counts that are genuinely "none" when absent (stays, paid nights)
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function parseInputs(raw: unknown): AdvisorInputs {
  const r = rec(raw);
  const ex = rec(r.expenses);
  const fee = rec(r.airbnb_fee);
  const months = (Array.isArray(r.months) ? r.months : []).map((m): AdvisorMonth => {
    const o = rec(m);
    return {
      month: str(o.month) ?? '', days: int0(o.days), heldNights: int0(o.held_nights), lyMonth: str(o.ly_month) ?? '',
      lyDaysCovered: int0(o.ly_days_covered), lyAirbnbNights: numOrNull(o.ly_airbnb_nights), lyDirectNights: numOrNull(o.ly_direct_nights),
      lyHeldNights: numOrNull(o.ly_held_nights), lyStays: int0(o.ly_stays), lyPayoutTotal: numOrNull(o.ly_payout_total), lyPaidNights: int0(o.ly_paid_nights),
    };
  });
  const categories = (Array.isArray(ex.categories) ? ex.categories : []).map((c): ExpenseCategory => {
    const o = rec(c);
    return { category: str(o.category) ?? 'other', total: numOrNull(o.total) ?? 0, rows: int0(o.rows), estimateTotal: numOrNull(o.estimate_total) ?? 0 };
  });
  return {
    from: str(r.from) ?? '', to: str(r.to) ?? '', today: str(r.today) ?? '', historyStart: str(r.history_start), accountingStart: str(r.accounting_start),
    months,
    expenses: { windowStart: str(ex.window_start), windowEnd: str(ex.window_end), monthsCovered: numOrNull(ex.months_covered), categories },
    airbnbFee: { rate: numOrNull(fee.rate), stays: int0(fee.stays) },
  };
}

// ---------- what last year says ----------

export type MonthFacts = {
  /** Nights we could sell this year: days minus held nights. */
  sellableNights: number;
  /** Last year's nights we could have sold, or null when nothing of that month is on record. */
  lySellable: number | null;
  lyOccupied: number | null;
  /** Last year's occupancy (0..1), or null when unknown. 0 is a real answer: it was open and nothing sold. */
  lyOccupancy: number | null;
  /** Realised payout per Airbnb night last year (money the host received), or null when no night has a payout figure. */
  lyAvgPayout: number | null;
  partial: boolean; // last year's month is only partly on record
};

export function monthFacts(m: AdvisorMonth): MonthFacts {
  const known = m.lyDaysCovered > 0 && m.lyAirbnbNights !== null && m.lyDirectNights !== null;
  const lyHeld = m.lyHeldNights ?? 0;
  const lySellable = known ? Math.max(0, m.lyDaysCovered - lyHeld) : null;
  const lyOccupied = known ? (m.lyAirbnbNights as number) + (m.lyDirectNights as number) : null;
  return {
    sellableNights: Math.max(0, m.days - m.heldNights),
    lySellable, lyOccupied,
    lyOccupancy: lySellable !== null && lySellable > 0 && lyOccupied !== null ? Math.min(1, lyOccupied / lySellable) : null,
    lyAvgPayout: m.lyPaidNights > 0 && m.lyPayoutTotal !== null ? m.lyPayoutTotal / m.lyPaidNights : null,
    partial: m.lyDaysCovered > 0 && m.lyMonth !== '' && m.lyDaysCovered < daysInMonth(m.lyMonth),
  };
}

function daysInMonth(firstOfMonth: IsoDate): number {
  const [y, m] = firstOfMonth.split('-').map(Number);
  return new Date(Date.UTC(y ?? 1970, m ?? 1, 0)).getUTCDate();
}

/** Stays on record behind the defaults, so a thin month is visible ("uses N stays from last year"). */
export const staysUsed = (months: AdvisorMonth[]) => months.reduce((s, m) => s + m.lyStays, 0);

/** Categories that are not a cost of running the house: a balancing entry, money given back to a guest, a platform adjustment. */
export const NOT_OPERATING = ['unaccounted', 'guest_refund', 'airbnb_adjustment'];

export type ExpenseLine = { category: string; monthly: number | null; include: boolean; estimateShare: number; rows: number };
/** One line per category: the trailing monthly average, off for the non-operating ones. Unknown months covered -> null, never 0. */
export function defaultExpenseLines(e: AdvisorInputs['expenses']): ExpenseLine[] {
  const n = e.monthsCovered !== null && e.monthsCovered > 0 ? e.monthsCovered : null;
  return e.categories.map((c) => ({
    category: c.category, rows: c.rows,
    monthly: n === null ? null : c.total / n,
    include: !NOT_OPERATING.includes(c.category),
    estimateShare: c.total > 0 ? c.estimateTotal / c.total : 0,
  }));
}
/** Sum of the included lines' monthly amounts; a line with no amount adds nothing but is reported so the page can say so. */
export function sumExpenseLines(lines: Array<{ include: boolean; monthly: number | null }>): { total: number; missing: number } {
  let total = 0, missing = 0;
  for (const l of lines) {
    if (!l.include) continue;
    if (l.monthly === null || !Number.isFinite(l.monthly)) missing += 1;
    else total += l.monthly;
  }
  return { total, missing };
}

/** The fee Airbnb kept, weighted by how much of last year's occupied nights came through Airbnb (direct bookings pay no platform fee). */
export function defaultFeeRate(i: Pick<AdvisorInputs, 'months' | 'airbnbFee'>): number | null {
  const rate = i.airbnbFee.rate;
  if (rate === null) return null;
  let airbnb = 0, all = 0;
  for (const m of i.months) {
    if (m.lyAirbnbNights === null || m.lyDirectNights === null) continue;
    airbnb += m.lyAirbnbNights;
    all += m.lyAirbnbNights + m.lyDirectNights;
  }
  return all > 0 ? rate * (airbnb / all) : rate;
}

// ---------- the calculator ----------

export type AdvisorSettings = {
  targetNet: number | null; // PHP the host wants to keep over the whole period
  expensesPerMonth: number; // 0 when expenses are switched off
  overheadPerMonth: number;
  feeRate: number | null; // share of the gross taken by the platform, 0 <= fee < 1
  /** Expected occupancy by month (0..1); null = unknown (the month is left out until the host enters one). */
  occupancy: Array<number | null>;
  minPrice: number | null;
  maxPrice: number | null;
};

export type MonthPlan = {
  month: IsoDate;
  included: boolean; // false: occupancy unknown, so the month is left out of the sums
  sellable: number;
  occupancy: number | null;
  nights: number | null; // expected occupied nights
  seasonalIndex: number | null; // occupancy / period average occupancy
  costs: number | null; // expenses + overheads for this month
  rawPrice: number | null; // seasonal, before rounding and guard rails
  price: number | null; // seasonal, rounded to the peso and clamped
  clamped: 'min' | 'max' | null;
};
export type Line = { label: string; value: number | null; note?: string };
export type AdvisorResult = {
  ok: boolean;
  reason: 'no_target' | 'no_fee' | 'bad_fee' | 'no_months' | 'no_nights' | null;
  lines: Line[]; // the arithmetic, line by line
  need: number | null;
  nights: number | null;
  rawFlat: number | null;
  flat: number | null; // rounded to the peso and clamped
  flatClamped: 'min' | 'max' | null;
  months: MonthPlan[];
  projectedNetFlat: number | null; // what the period keeps if every expected night sells at the flat price
  projectedNetSeasonal: number | null;
  excluded: IsoDate[];
};

const finite = (v: number | null): v is number => v !== null && Number.isFinite(v);

/** Round to the peso, then apply the guard rails (rounded to the peso too). */
export function guard(raw: number, min: number | null, max: number | null): { price: number; clamped: 'min' | 'max' | null } {
  const p = Math.round(raw);
  if (finite(min) && min > 0 && p < Math.round(min)) return { price: Math.round(min), clamped: 'min' };
  if (finite(max) && max > 0 && p > Math.round(max)) return { price: Math.round(max), clamped: 'max' };
  return { price: p, clamped: null };
}

export function calculate(months: AdvisorMonth[], s: AdvisorSettings): AdvisorResult {
  const empty = (reason: NonNullable<AdvisorResult['reason']>, plans: MonthPlan[] = [], excluded: IsoDate[] = []): AdvisorResult => ({
    ok: false, reason, lines: [], need: null, nights: null, rawFlat: null, flat: null, flatClamped: null, months: plans,
    projectedNetFlat: null, projectedNetSeasonal: null, excluded,
  });
  const plans: MonthPlan[] = months.map((m, i) => {
    const occ = finite(s.occupancy[i] ?? null) ? Math.min(1, Math.max(0, s.occupancy[i] as number)) : null;
    const sellable = Math.max(0, m.days - m.heldNights);
    return {
      month: m.month, included: occ !== null, sellable, occupancy: occ,
      nights: occ === null ? null : occ * sellable, seasonalIndex: null,
      costs: occ === null ? null : Math.max(0, s.expensesPerMonth) + Math.max(0, s.overheadPerMonth),
      rawPrice: null, price: null, clamped: null,
    };
  });
  const excluded = plans.filter((p) => !p.included).map((p) => p.month);
  if (!finite(s.targetNet)) return empty('no_target', plans, excluded);
  if (s.feeRate === null || !Number.isFinite(s.feeRate)) return empty('no_fee', plans, excluded);
  if (s.feeRate < 0 || s.feeRate >= 1) return empty('bad_fee', plans, excluded);
  const used = plans.filter((p) => p.included);
  if (used.length === 0) return empty('no_months', plans, excluded);

  const nights = used.reduce((t, p) => t + (p.nights as number), 0);
  const costs = used.reduce((t, p) => t + (p.costs as number), 0);
  const sellable = used.reduce((t, p) => t + p.sellable, 0);
  if (!(nights > 0)) return empty('no_nights', plans, excluded);

  const keep = 1 - s.feeRate;
  const need = s.targetNet + costs;
  const gross = need / keep; // what guests must pay in total for the host to keep `need`
  const rawFlat = gross / nights;
  const flatG = guard(rawFlat, s.minPrice, s.maxPrice);
  // The seasonal index is over the chosen period's average occupancy (this keeps the period total equal to the need),
  // deliberately not the yearly average that the SPEC-35 wording names.
  const avgOcc = nights / sellable;
  const weight = used.reduce((t, p) => t + (p.occupancy as number) * p.sellable * ((p.occupancy as number) / avgOcc), 0); // sum(index x nights)
  for (const p of used) {
    p.seasonalIndex = (p.occupancy as number) / avgOcc;
    if ((p.nights as number) > 0 && weight > 0) {
      p.rawPrice = (gross * p.seasonalIndex) / weight; // = gross x occupancy / sum(occupancy x nights)
      const g = guard(p.rawPrice, s.minPrice, s.maxPrice);
      p.price = g.price;
      p.clamped = g.clamped;
    }
  }
  const net = (rev: number) => rev * keep - costs;
  const revSeasonal = used.reduce((t, p) => t + (p.price === null ? 0 : p.price * (p.nights as number)), 0);
  return {
    ok: true, reason: null,
    lines: [
      { label: 'Target net earning for the period', value: s.targetNet },
      { label: `Expenses and overheads (${used.length} month${used.length === 1 ? '' : 's'})`, value: costs },
      { label: 'Needed after fees', value: need },
      { label: `Needed from guests (after a ${(s.feeRate * 100).toFixed(1)}% fee)`, value: gross },
      { label: 'Expected nights sold', value: nights, note: `${sellable} sellable nights at ${(avgOcc * 100).toFixed(1)}% occupancy` },
      { label: 'Flat price per night', value: rawFlat },
    ],
    need, nights, rawFlat, flat: flatG.price, flatClamped: flatG.clamped, months: plans,
    projectedNetFlat: net(flatG.price * nights),
    projectedNetSeasonal: net(revSeasonal),
    excluded,
  };
}

// ---------- the period, the link to Rate settings, the current card ----------

export const addMonths = (firstOfMonth: IsoDate, n: number): IsoDate => {
  const [y, m] = firstOfMonth.split('-').map(Number);
  const d = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
};
/** The default period: this month and the next two. */
export const defaultPeriod = (today: IsoDate): { from: IsoDate; to: IsoDate } => {
  const from = `${today.slice(0, 7)}-01`;
  return { from, to: addMonths(from, 2) };
};
/** Number of calendar months from..to inclusive (month starts). */
export const monthSpan = (from: IsoDate, to: IsoDate) => {
  const [y1, m1] = from.split('-').map(Number), [y2, m2] = to.split('-').map(Number);
  return ((y2 ?? 0) - (y1 ?? 0)) * 12 + ((m2 ?? 0) - (m1 ?? 0)) + 1;
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
/** The hash route that opens Rate settings with a number typed in. The Pricing page reads it once and never publishes. */
export const prefillPath = (price: number, from: IsoDate): string => `/pricing?prefill=${Math.round(price)}&from=${from}`;
export function parsePrefill(search: URLSearchParams): { price: number; from: IsoDate | null } | null {
  const raw = search.get('prefill');
  if (raw === null || !/^\d{1,6}$/.test(raw)) return null;
  const price = Number(raw);
  if (!(price > 0 && price < 100000)) return null;
  const from = search.get('from');
  return { price, from: from !== null && ISO.test(from) ? from : null };
}

export type PromoLike = { name: string; first_night: string; last_night: string; nightly_rate: number };
/** Promotions that cover any night of the month starting `monthStart`. */
export function promosInMonth(promos: PromoLike[], monthStart: IsoDate): PromoLike[] {
  const next = addMonths(monthStart, 1);
  return promos.filter((p) => p.first_night < next && p.last_night >= monthStart);
}
/** The standard rate in force on the first of the month: the newest card whose start date has come. */
export function baseInForce(card: { base: number; effective_from: string; upcoming?: Array<{ base: number; effective_from: string }> }, monthStart: IsoDate): number {
  let best = { base: card.base, from: card.effective_from };
  for (const u of card.upcoming ?? []) if (u.effective_from <= monthStart && u.effective_from > best.from) best = { base: u.base, from: u.effective_from };
  return best.base;
}
