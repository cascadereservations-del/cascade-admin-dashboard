import { rpc } from '@/lib/rpc';
import type { MetricResult } from '@/types/contracts';

export type MetricsResponse = { propertyId: string; periodStart: string; periodEndExclusive: string; sourceAsOf: string | null; financeVisible: boolean; blockedNights: number; metrics: Record<string, MetricResult> };

// P09 metric service: every number is computed on the server with its
// definition, period, coverage and drill-down token.
export function fetchMetrics(propertyId: string, start: string, endExclusive: string) {
  return rpc<MetricsResponse>('get_hospitality_metrics_v1', { p_property_id: propertyId, p_start: start, p_end_exclusive: endExclusive });
}

export type Drilldown = { key: string; periodStart: string; periodEndExclusive: string; rows: Array<Record<string, unknown>> };
export function fetchDrilldown(propertyId: string, token: string) {
  return rpc<Drilldown>('get_report_drilldown_v1', { p_property_id: propertyId, p_token: token });
}
