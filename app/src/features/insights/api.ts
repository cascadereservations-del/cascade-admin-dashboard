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
export type UtilityMonth = { month: string; kwh: number; m3: number; readings: number };
export async function fetchUtilityMonths(propertyId: string, from: string): Promise<UtilityMonth[]> {
  const res = unwrapList<{ recorded_at: string; electric_delta: string | null; water_delta: string | null }>(
    await supabase.from('meter_readings').select('recorded_at, electric_delta, water_delta').eq('property_id', propertyId).gte('recorded_at', from).order('recorded_at', { ascending: true }).range(0, 999),
  );
  const byMonth = new Map<string, UtilityMonth>();
  for (const r of res.rows) {
    const month = r.recorded_at.slice(0, 7);
    const t = byMonth.get(month) ?? { month, kwh: 0, m3: 0, readings: 0 };
    t.kwh += Number(r.electric_delta ?? 0);
    t.m3 += Number(r.water_delta ?? 0);
    t.readings += 1;
    byMonth.set(month, t);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

export type Drilldown ={ key: string; periodStart: string; periodEndExclusive: string; rows: Array<Record<string, unknown>> };
export function fetchDrilldown(propertyId: string, token: string) {
  return rpc<Drilldown>('get_report_drilldown_v1', { p_property_id: propertyId, p_token: token });
}
