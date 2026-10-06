import { describe, expect, it } from 'vitest';
import {
  addMonths, baseInForce, calculate, defaultExpenseLines, defaultFeeRate, defaultPeriod, guard, monthFacts, monthSpan, numOrNull, parseInputs, parsePrefill,
  prefillPath, promosInMonth, staysUsed, sumExpenseLines, type AdvisorMonth, type AdvisorSettings,
} from './advisor';

// SPEC-35: every expected number below is worked by hand in the comment beside it, not copied from the code's output.

const month = (m: string, days: number, held = 0, over: Partial<AdvisorMonth> = {}): AdvisorMonth => ({
  month: m, days, heldNights: held, lyMonth: `2025${m.slice(4)}`, lyDaysCovered: days, lyAirbnbNights: 0, lyDirectNights: 0, lyHeldNights: 0,
  lyStays: 0, lyPayoutTotal: null, lyPaidNights: 0, ...over,
});
const settings = (over: Partial<AdvisorSettings> = {}): AdvisorSettings => ({
  targetNet: 30000, expensesPerMonth: 10000, overheadPerMonth: 2000, feeRate: 0.15, occupancy: [0.8, 0.5], minPrice: null, maxPrice: null, ...over,
});
// The worked period: A = 30 days, nothing held, 80% occupied = 24 nights. B = 31 days with 3 held = 28 sellable, 50% = 14 nights.
const A = month('2026-11-01', 30);
const B = month('2026-12-01', 31, 3);

describe('reading the server answer: unknown stays null, never 0', () => {
  it('numOrNull', () => {
    expect(numOrNull(null)).toBeNull();
    expect(numOrNull(undefined)).toBeNull();
    expect(numOrNull('')).toBeNull();
    expect(numOrNull('abc')).toBeNull();
    expect(numOrNull('7000.50')).toBe(7000.5);
    expect(numOrNull(0)).toBe(0);
    expect(numOrNull(Number.NaN)).toBeNull();
  });
  it('parseInputs keeps nulls and survives junk', () => {
    expect(parseInputs(null).months).toEqual([]);
    const i = parseInputs({
      from: '2026-02-01', to: '2026-03-01', today: '2026-10-06', history_start: null, accounting_start: '2025-06-01',
      months: [{ month: '2026-02-01', days: 28, held_nights: 2, ly_month: '2025-02-01', ly_days_covered: 26, ly_airbnb_nights: null, ly_direct_nights: '2', ly_held_nights: null, ly_stays: '3', ly_payout_total: '7000.50', ly_paid_nights: 5 }],
      expenses: { window_start: '2025-02-01', window_end: '2026-02-01', months_covered: null, categories: [{ category: 'supplies', total: '1000', rows: 2, estimate_total: '400' }] },
      airbnb_fee: { rate: null, stays: 0 },
    });
    const m = i.months[0]!;
    expect(m.lyAirbnbNights).toBeNull(); // unknown, not 0
    expect(m.lyDirectNights).toBe(2);
    expect(m.lyHeldNights).toBeNull();
    expect(m.lyPayoutTotal).toBe(7000.5);
    expect(m.lyStays).toBe(3);
    expect(i.historyStart).toBeNull();
    expect(i.expenses.monthsCovered).toBeNull();
    expect(i.expenses.categories[0]).toEqual({ category: 'supplies', total: 1000, rows: 2, estimateTotal: 400 });
    expect(i.airbnbFee.rate).toBeNull();
  });
});

describe('what last year says', () => {
  it('a known month: occupancy and payout per night', () => {
    // 26 known days, 2 held -> 24 sellable. 7 Airbnb + 2 direct = 9 occupied -> 9 / 24 = 0.375. 7000 paid over 5 nights = 1400.
    const f = monthFacts(month('2026-02-01', 28, 2, { lyMonth: '2025-02-01', lyDaysCovered: 26, lyAirbnbNights: 7, lyDirectNights: 2, lyHeldNights: 2, lyPayoutTotal: 7000, lyPaidNights: 5 }));
    expect(f.lySellable).toBe(24);
    expect(f.lyOccupied).toBe(9);
    expect(f.lyOccupancy).toBe(0.375);
    expect(f.lyAvgPayout).toBe(1400);
    expect(f.sellableNights).toBe(26); // this year: 28 days - 2 held
    expect(f.partial).toBe(true); // last Feb is on record from the 3rd only (26 < 28 days)
  });
  it('sparse history is null, not 0', () => {
    const f = monthFacts(month('2026-02-01', 28, 0, { lyMonth: '2025-02-01', lyDaysCovered: 0, lyAirbnbNights: null, lyDirectNights: null, lyHeldNights: null }));
    expect(f.lySellable).toBeNull();
    expect(f.lyOccupied).toBeNull();
    expect(f.lyOccupancy).toBeNull();
    expect(f.lyAvgPayout).toBeNull(); // no paid nights
    expect(f.partial).toBe(false);
  });
  it('a month that was open and sold nothing is 0, which is an answer', () => {
    expect(monthFacts(month('2026-03-01', 31, 0, { lyMonth: '2025-03-01', lyDaysCovered: 31, lyAirbnbNights: 0, lyDirectNights: 0 })).lyOccupancy).toBe(0);
  });
  it('a month that was entirely held has no sellable nights, so no occupancy', () => {
    const f = monthFacts(month('2026-03-01', 31, 0, { lyMonth: '2025-03-01', lyDaysCovered: 10, lyAirbnbNights: 0, lyDirectNights: 0, lyHeldNights: 10 }));
    expect(f.lySellable).toBe(0);
    expect(f.lyOccupancy).toBeNull();
  });
  it('a payout figure of null with paid nights stays unknown', () => {
    expect(monthFacts(month('2026-03-01', 31, 0, { lyPaidNights: 3, lyPayoutTotal: null })).lyAvgPayout).toBeNull();
  });
  it('stays used by the defaults', () => {
    expect(staysUsed([month('2026-02-01', 28, 0, { lyStays: 3 }), month('2026-03-01', 31, 0, { lyStays: 1 })])).toBe(4);
  });
});

describe('the calculator: a hand-worked period', () => {
  const r = calculate([A, B], settings());
  it('flat price', () => {
    // nights = 0.8 x 30 + 0.5 x (31 - 3) = 24 + 14 = 38. costs = 2 months x (10,000 + 2,000) = 24,000. need = 30,000 + 24,000 = 54,000.
    // guests must pay 54,000 / (1 - 0.15) = 63,529.41. flat = 63,529.41 / 38 = 1,671.83 -> 1,672.
    expect(r.ok).toBe(true);
    expect(r.nights).toBe(38);
    expect(r.need).toBe(54000);
    expect(r.rawFlat).toBeCloseTo(1671.83, 2);
    expect(r.flat).toBe(1672);
    expect(r.flatClamped).toBeNull();
    expect(r.lines.map((l) => l.label)).toEqual(expect.arrayContaining(['Target net earning for the period', 'Needed after fees', 'Flat price per night']));
  });
  it('held nights are not sellable: B has 28 sellable nights, so 14 expected, not 15.5', () => {
    expect(r.months[1]!.sellable).toBe(28);
    expect(r.months[1]!.nights).toBe(14);
    expect(calculate([A, month('2026-12-01', 31, 0)], settings()).months[1]!.nights).toBe(15.5); // 0.5 x 31 with nothing held
  });
  it('seasonal price per month follows occupancy', () => {
    // sum(occupancy x nights) = 0.8 x 24 + 0.5 x 14 = 19.2 + 7 = 26.2. A = 63,529.41 x 0.8 / 26.2 = 1,939.83 -> 1,940. B = 63,529.41 x 0.5 / 26.2 = 1,212.39 -> 1,212.
    expect(r.months[0]!.price).toBe(1940);
    expect(r.months[1]!.price).toBe(1212);
    // average occupancy = 38 / (30 + 28) = 0.6552; index A = 0.8 / 0.6552 = 1.2211, B = 0.5 / 0.6552 = 0.7632
    expect(r.months[0]!.seasonalIndex).toBeCloseTo(1.2211, 3);
    expect(r.months[1]!.seasonalIndex).toBeCloseTo(0.7632, 3);
  });
  it('what the period keeps at the rounded prices', () => {
    // flat: 1,672 x 38 = 63,536; x 0.85 = 54,005.60; minus 24,000 = 30,005.60
    expect(r.projectedNetFlat).toBeCloseTo(30005.6, 1);
    // seasonal: 1,940 x 24 + 1,212 x 14 = 46,560 + 16,968 = 63,528; x 0.85 = 53,998.80; minus 24,000 = 29,998.80
    expect(r.projectedNetSeasonal).toBeCloseTo(29998.8, 1);
  });
});

describe('the calculator: edges', () => {
  it('a zero-occupancy month sells nothing but its costs still have to be earned', () => {
    // Add C: 30 days, 0% -> 0 nights, costs 12,000. need = 30,000 + 36,000 = 66,000. flat = 66,000 / 0.85 / 38 = 77,647.06 / 38 = 2,043.34 -> 2,043.
    const C = month('2027-01-01', 30);
    const r = calculate([A, B, C], settings({ occupancy: [0.8, 0.5, 0] }));
    expect(r.ok).toBe(true);
    expect(r.nights).toBe(38);
    expect(r.flat).toBe(2043);
    expect(r.months[2]!.price).toBeNull(); // nothing to price
    expect(r.months[2]!.seasonalIndex).toBe(0);
    // seasonal: 77,647.06 x 0.8 / 26.2 = 2,370.90 -> 2,371; x 0.5 / 26.2 = 1,481.81 -> 1,482
    expect(r.months[0]!.price).toBe(2371);
    expect(r.months[1]!.price).toBe(1482);
  });
  it('every month at 0% occupancy cannot be priced', () => {
    const r = calculate([A, B], settings({ occupancy: [0, 0] }));
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('no_nights');
    expect(r.flat).toBeNull();
  });
  it('a month with unknown occupancy is left out, with its costs, and named', () => {
    const D = month('2027-02-01', 28);
    const r = calculate([A, B, D], settings({ occupancy: [0.8, 0.5, null] }));
    expect(r.flat).toBe(1672); // same as the two-month worked period
    expect(r.excluded).toEqual(['2027-02-01']);
    expect(r.months[2]!.included).toBe(false);
    expect(r.months[2]!.price).toBeNull();
  });
  it('no month with an occupancy at all', () => {
    expect(calculate([A], settings({ occupancy: [null] })).reason).toBe('no_months');
  });
  it('fee 0: need / nights', () => {
    // 54,000 / 38 = 1,421.05 -> 1,421
    expect(calculate([A, B], settings({ feeRate: 0 })).flat).toBe(1421);
  });
  it('fee unknown, 100% or negative is refused rather than divided by', () => {
    expect(calculate([A, B], settings({ feeRate: null })).reason).toBe('no_fee');
    expect(calculate([A, B], settings({ feeRate: 1 })).reason).toBe('bad_fee');
    expect(calculate([A, B], settings({ feeRate: -0.1 })).reason).toBe('bad_fee');
    expect(calculate([A, B], settings({ feeRate: Number.NaN })).reason).toBe('no_fee');
  });
  it('a target is required; 0 is a valid target (cover the costs only)', () => {
    expect(calculate([A, B], settings({ targetNet: null })).reason).toBe('no_target');
    // need 24,000 / 0.85 / 38 = 28,235.29 / 38 = 743.03 -> 743
    expect(calculate([A, B], settings({ targetNet: 0 })).flat).toBe(743);
  });
  it('expenses switched off: only overheads count', () => {
    // costs = 2 x 2,000 = 4,000; need 34,000; 34,000 / 0.85 / 38 = 40,000 / 38 = 1,052.63 -> 1,053
    expect(calculate([A, B], settings({ expensesPerMonth: 0 })).flat).toBe(1053);
  });
  it('occupancy is kept between 0 and 1', () => {
    expect(calculate([A], settings({ occupancy: [1.5] })).months[0]!.occupancy).toBe(1);
    expect(calculate([A], settings({ occupancy: [-0.2] })).months[0]!.occupancy).toBe(0);
  });
  it('weekends: nights are nights, the calculator has no weekday term (SPEC-35 prices by month only)', () => {
    // Nov 2026 starts on a Sunday and Dec 2026 on a Tuesday; swapping the two months changes nothing but the order.
    const forward = calculate([A, B], settings());
    const swapped = calculate([B, A], settings({ occupancy: [0.5, 0.8] }));
    expect(swapped.flat).toBe(forward.flat);
  });
});

describe('rounding and guard rails', () => {
  it('rounds to the whole peso', () => {
    expect(guard(1500.49, null, null).price).toBe(1500);
    expect(guard(1500.5, null, null).price).toBe(1501);
  });
  it('clamps the flat and the seasonal prices and says so', () => {
    const lo = calculate([A, B], settings({ minPrice: 1800 }));
    expect(lo.flat).toBe(1800); // 1,672 is under the minimum
    expect(lo.flatClamped).toBe('min');
    expect(lo.months[1]!.price).toBe(1800); // B 1,212
    expect(lo.months[1]!.clamped).toBe('min');
    expect(lo.months[0]!.price).toBe(1940); // A 1,940 is over the minimum: unchanged
    expect(lo.months[0]!.clamped).toBeNull();
    const hi = calculate([A, B], settings({ maxPrice: 1500 }));
    expect(hi.flat).toBe(1500);
    expect(hi.flatClamped).toBe('max');
    expect(hi.months[0]!.price).toBe(1500); // A 1,940
    expect(hi.months[1]!.price).toBe(1212); // B is under the maximum
  });
  it('a clamped price shows in what the period keeps', () => {
    // flat clamped to 1,800: 1,800 x 38 = 68,400; x 0.85 = 58,140; minus 24,000 = 34,140
    expect(calculate([A, B], settings({ minPrice: 1800 })).projectedNetFlat).toBeCloseTo(34140, 1);
  });
});

describe('defaults the page starts from', () => {
  it('expense lines: trailing monthly average, non-operating categories off', () => {
    // 12 months covered: supplies 1,000 / 12 = 83.33, utilities 2,000 / 12 = 166.67, unaccounted off.
    const lines = defaultExpenseLines({ windowStart: '2025-02-01', windowEnd: '2026-02-01', monthsCovered: 12, categories: [
      { category: 'supplies', total: 1000, rows: 2, estimateTotal: 400 }, { category: 'unaccounted', total: 108526.95, rows: 1, estimateTotal: 0 }, { category: 'utilities', total: 2000, rows: 2, estimateTotal: 500 },
    ] });
    expect(lines.map((l) => l.include)).toEqual([true, false, true]);
    expect(lines[0]!.monthly).toBeCloseTo(83.33, 2);
    expect(lines[0]!.estimateShare).toBe(0.4); // 400 of 1,000 is from before the books were clean
    const s = sumExpenseLines(lines);
    expect(s.total).toBeCloseTo(250, 6); // 83.33 + 166.67
    expect(s.missing).toBe(0);
  });
  it('no months covered: the amount is unknown (null) and reported, not 0', () => {
    const lines = defaultExpenseLines({ windowStart: null, windowEnd: null, monthsCovered: null, categories: [{ category: 'supplies', total: 1000, rows: 2, estimateTotal: 0 }] });
    expect(lines[0]!.monthly).toBeNull();
    expect(sumExpenseLines(lines)).toEqual({ total: 0, missing: 1 });
    expect(defaultExpenseLines({ windowStart: null, windowEnd: null, monthsCovered: null, categories: [] })).toEqual([]);
  });
  it('fee: the platform rate weighted by the share of nights that came through Airbnb', () => {
    // 15% platform fee; last year 30 Airbnb + 10 direct nights -> 75% through Airbnb -> 0.15 x 0.75 = 0.1125
    const months = [month('2026-02-01', 28, 0, { lyAirbnbNights: 20, lyDirectNights: 5 }), month('2026-03-01', 31, 0, { lyAirbnbNights: 10, lyDirectNights: 5 })];
    expect(defaultFeeRate({ months, airbnbFee: { rate: 0.15, stays: 9 } })).toBeCloseTo(0.1125, 6);
    expect(defaultFeeRate({ months: [month('2026-02-01', 28, 0, { lyAirbnbNights: null, lyDirectNights: null })], airbnbFee: { rate: 0.15, stays: 9 } })).toBe(0.15);
    expect(defaultFeeRate({ months, airbnbFee: { rate: null, stays: 0 } })).toBeNull();
  });
  it('period: this month and the next two, at most 12 months', () => {
    expect(defaultPeriod('2026-10-06')).toEqual({ from: '2026-10-01', to: '2026-12-01' });
    expect(addMonths('2026-11-01', 3)).toBe('2027-02-01');
    expect(monthSpan('2026-10-01', '2026-12-01')).toBe(3);
    expect(monthSpan('2026-10-01', '2027-09-01')).toBe(12);
  });
});

describe('the link to Rate settings and the current card', () => {
  it('builds and reads the prefill; nothing else gets through', () => {
    expect(prefillPath(1679.6, '2026-10-01')).toBe('/pricing?prefill=1680&from=2026-10-01');
    expect(parsePrefill(new URLSearchParams('prefill=1680&from=2026-10-11'))).toEqual({ price: 1680, from: '2026-10-11' });
    expect(parsePrefill(new URLSearchParams('prefill=1680&from=tomorrow'))).toEqual({ price: 1680, from: null });
    expect(parsePrefill(new URLSearchParams('prefill=1680.5'))).toBeNull();
    expect(parsePrefill(new URLSearchParams('prefill=0'))).toBeNull();
    expect(parsePrefill(new URLSearchParams('prefill=abc'))).toBeNull();
    expect(parsePrefill(new URLSearchParams('prefill=999999'))).toBeNull();
    expect(parsePrefill(new URLSearchParams(''))).toBeNull();
  });
  it('promotions that touch a month', () => {
    const anniv = { name: 'Anniversary', first_night: '2026-10-11', last_night: '2026-10-17', nightly_rate: 1424 };
    const across = { name: 'Long weekend', first_night: '2026-09-28', last_night: '2026-10-01', nightly_rate: 1500 };
    expect(promosInMonth([anniv, across], '2026-10-01').map((p) => p.name)).toEqual(['Anniversary', 'Long weekend']);
    expect(promosInMonth([anniv, across], '2026-09-01').map((p) => p.name)).toEqual(['Long weekend']);
    expect(promosInMonth([anniv, across], '2026-11-01')).toEqual([]);
  });
  it('the standard rate in force on the first of the month', () => {
    const card = { base: 1780, effective_from: '2026-01-01', upcoming: [{ base: 1900, effective_from: '2026-12-01' }] };
    expect(baseInForce(card, '2026-11-01')).toBe(1780);
    expect(baseInForce(card, '2026-12-01')).toBe(1900);
    expect(baseInForce({ base: 1780, effective_from: '2026-01-01' }, '2026-12-01')).toBe(1780);
  });
});
