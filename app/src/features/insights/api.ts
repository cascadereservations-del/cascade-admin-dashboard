import { supabase } from '@/lib/supabase';
import { rpc, unwrapList } from '@/lib/rpc';
import type { MetricResult } from '@/types/contracts';

export type MetricsResponse = { propertyId: string; periodStart: string; periodEndExclusive: string; sourceAsOf: string | null; financeVisible: boolean; blockedNights: number; metrics: Record<string, MetricResult> };

// P09 metric service: every number is computed on the server with its
// definition, period, coverage and drill-down token.
export function fetchMetrics(propertyId: string, start: string, endExclusive: string) {
  return rpc<MetricsResponse>('get_hospitality_metrics_v1', { p_property_id: propertyId, p_start: start, p_end_exclusive: endExclusive });
}

// Utilities per month from the cleaners' meter readings (delta between the
// previous and current photo). Sums are per recorded month; a wild month means
// a misread meter, which the readiness review already flags.
export type UtilityMonth = { month: string; kwh: number; m3: number; readings: number; excluded: number };
// A reading is consumption only when it continues the previous photo: a
// previous value of 0 is a first entry, a negative delta is a re-entry of an
// older photo, and a flagged row is under review. Those are counted, not summed,
// so the chart never hides them and never edits them (readiness review does).
export function isConsumptionReading(r: { electric_prev: string | number | null; water_prev: string | number | null; electric_delta: string | number | null; water_delta: string | number | null; meter_flag: string | null }): boolean {
  return Number(r.electric_prev ?? 0) > 0 && Number(r.water_prev ?? 0) > 0 && Number(r.electric_delta ?? 0) >= 0 && Number(r.water_delta ?? 0) >= 0 && !r.meter_flag;
}
type ReadingRow = { recorded_at: string; electric_prev: string | null; water_prev: string | null; electric_delta: string | null; water_delta: string | null; meter_flag: string | null };
export async function fetchUtilityMonths(propertyId: string, from: string, toExclusive?: string, include: (r: ReadingRow) => boolean = isConsumptionReading): Promise<UtilityMonth[]> {
  let q = supabase.from('meter_readings').select('recorded_at, electric_prev, water_prev, electric_delta, water_delta, meter_flag').eq('property_id', propertyId).gte('recorded_at', from).order('recorded_at', { ascending: true });
  if (toExclusive) q = q.lt('recorded_at', toExclusive);
  const res = unwrapList<ReadingRow>(await q.range(0, 999));
  const byMonth = new Map<string, UtilityMonth>();
  for (const r of res.rows) {
    const month = r.recorded_at.slice(0, 7);
    const t = byMonth.get(month) ?? { month, kwh: 0, m3: 0, readings: 0, excluded: 0 };
    if (include(r)) {
      t.kwh += Number(r.electric_delta ?? 0);
      t.m3 += Number(r.water_delta ?? 0);
      t.readings += 1;
    } else {
      t.excluded += 1;
    }
    byMonth.set(month, t);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export type Drilldown ={ key: string; periodStart: string; periodEndExclusive: string; rows: Array<Record<string, unknown>> };
export function fetchDrilldown(propertyId: string, token: string) {
  return rpc<Drilldown>('get_report_drilldown_v1', { p_property_id: propertyId, p_token: token });
}

// Confirmed calendar nights overlapping [from, toExclusive) - for the forward
// projection. NOT the same as get_hospitality_metrics_v1's future_booked_nights,
// which is a global "from today onward" count independent of the period passed
// in (verified live: it returns the same number for both a current and a past
// comparison period), so it cannot be called per-month to bucket a trend.
export type FutureStay = { checkin_date: string; checkout_date: string };
export async function fetchFutureStays(propertyId: string, from: string, toExclusive: string): Promise<FutureStay[]> {
  const res = unwrapList<FutureStay>(await supabase.from('calendar_events').select('checkin_date, checkout_date').eq('property_id', propertyId).eq('status', 'confirmed').lt('checkin_date', toExclusive).gt('checkout_date', from).range(0, 999));
  return res.rows;
}
