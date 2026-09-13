import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/auth/session';
import { useUrlState } from '@/lib/url-state';
import { comparablePeriod, formatDate, periodPreset } from '@/lib/dates';
import { formatPHP } from '@/lib/money';
import { PageHeader, Section } from '@/components/data/page-header';
import { CardSkeleton, PartialBanner, QueryState } from '@/components/data/query-state';
import { KpiCard, formatMetricValue } from '@/components/data/kpi-card';
import { Freshness } from '@/components/data/freshness';
import { DetailSheet } from '@/components/data/detail-sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { MetricResult } from '@/types/contracts';
import { fetchDrilldown, fetchMetrics } from './api';

// INS01/INS03/INS05: server-calculated hospitality metrics with an
// equivalent-elapsed comparison period and deterministic plain-language
// explanations built only from returned values and warnings.

const DEFS: Record<string, [string, string]> = {
  occupancy: ['Occupancy', 'Sold nights ÷ sellable nights, through the last completed night.'],
  adr: ['Accommodation ADR', 'Accommodation revenue ÷ sold nights with revenue coverage. Excludes cleaning fees and guest-paid platform fees.'],
  revpar: ['RevPAR', 'Accommodation revenue ÷ sellable nights. Withheld when revenue coverage is partial.'],
  accommodation_revenue: ['Accommodation revenue', 'Earned accommodation charges allocated evenly per stay night (stay basis).'],
  cash_received: ['Cash received', 'Confirmed income rows by transaction date (cash basis). Not revenue.'],
  expected_payout: ['Expected payout', 'Airbnb host payout for stays checked out in the period with no recorded payout date.'],
  sold_nights: ['Sold nights', 'Distinct nights covered by a confirmed or completed stay.'],
  future_booked_nights: ['Future booked nights', 'Confirmed nights from today onward. Never mixed into historical metrics.'],
  average_length_of_stay: ['Average length of stay', 'Nights across completed stays checking out in the period ÷ those stays.'],
  returning_guest_rate: ['Returning-guest rate', 'Guests completing a stay who had an earlier completed stay ÷ guests completing a stay, by guest id.'],
  cancellation_rate: ['Cancellation rate', 'Cancelled bookings in the scheduled-arrival cohort ÷ eligible bookings.'],
  booking_lead_time: ['Booking lead time', 'Check-in date minus reliable booking date, one value per booking; missing dates excluded.'],
};
const ORDER = ['occupancy', 'adr', 'revpar', 'accommodation_revenue', 'cash_received', 'expected_payout', 'sold_nights', 'future_booked_nights', 'average_length_of_stay', 'returning_guest_rate', 'cancellation_rate', 'booking_lead_time'];

function explain(m: Record<string, MetricResult>, blocked: number): string[] {
  const out: string[] = [];
  const rev = m.accommodation_revenue;
  if (rev?.coverage === 'partial') out.push(`${rev.excludedCount} sold nights have no accommodation amount, so revenue, ADR and RevPAR are computed only over the ${rev.includedCount} covered nights.`);
  if (rev?.coverage === 'missing' && !rev.value) out.push('Financial metrics are hidden for this session; operational metrics are complete.');
  if (blocked > 0) out.push(`${blocked} calendar-blocked nights in this period are unexplained and still count as sellable, so occupancy may be understated.`);
  if (m.occupancy?.value === null) out.push('Occupancy is not available because the period has no sellable nights (before the operating start).');
  const lead = m.booking_lead_time;
  if (lead && lead.excludedCount > 0) out.push(`${lead.excludedCount} bookings have no reliable booking date and are excluded from lead time.`);
  const exp = m.expected_payout;
  if (exp && Number(exp.value) > 0) out.push(`${formatPHP(exp.value)} of Airbnb payout for ${exp.includedCount} stays is expected but not yet recorded as received.`);
  return out;
}

export default function InsightsPage() {
  const s = useSession();
  const { state, set } = useUrlState({ period: 'mtd', from: '', to: '' });
  const preset = periodPreset(state.period);
  const cur = state.period === 'custom' && state.from && state.to ? { ...preset, key: 'custom', start: state.from, endExclusive: state.to, label: 'Custom' } : preset;
  const cmp = comparablePeriod(cur, state.period === 'ytd' ? 'year' : 'month');
  const now = useQuery({ queryKey: ['metrics', s.propertyId, cur.start, cur.endExclusive], queryFn: () => fetchMetrics(s.propertyId, cur.start, cur.endExclusive) });
  const prev = useQuery({ queryKey: ['metrics', s.propertyId, cmp.start, cmp.endExclusive], queryFn: () => fetchMetrics(s.propertyId, cmp.start, cmp.endExclusive) });
  const [token, setToken] = useState<string | null>(null);
  const drill = useQuery({ queryKey: ['drilldown', s.propertyId, token], queryFn: () => fetchDrilldown(s.propertyId, token!), enabled: !!token });

  return (
    <div>
      <PageHeader
        title="Insights"
        description="Hospitality performance through the last completed night. Every figure is computed on the server with its definition and coverage."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={state.period} onValueChange={(v) => set({ period: v })}><TabsList>{['mtd', 'ytd', 'last30', 'last90', 'prev-month', 'custom'].map((p) => <TabsTrigger key={p} value={p}>{p === 'prev-month' ? 'Prev month' : p.toUpperCase()}</TabsTrigger>)}</TabsList></Tabs>
            {state.period === 'custom' && <><Input type="date" aria-label="From" className="w-36" value={state.from} onChange={(e) => set({ from: e.target.value, period: 'custom' })} /><Input type="date" aria-label="To (exclusive)" className="w-36" value={state.to} onChange={(e) => set({ to: e.target.value, period: 'custom' })} /></>}
          </div>
        }
      />
      <p className="mb-3 text-sm text-muted-foreground">{cur.label}: {formatDate(cur.start, 'long')} to {formatDate(cur.endExclusive, 'long')} (exclusive). Comparison: {cmp.label.toLowerCase()}, {formatDate(cmp.start, 'long')} to {formatDate(cmp.endExclusive, 'long')}.</p>
      <QueryState query={now} skeleton={<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>}>
        {(d) => (
          <div className="space-y-6">
            <PartialBanner warnings={explain(d.metrics, d.blockedNights)} />
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {ORDER.filter((k) => d.metrics[k]).map((k) => {
                const m = d.metrics[k]!;
                const p = prev.data?.metrics[k];
                const [title, def] = DEFS[k] ?? [k, ''];
                return (
                  <div key={k} className="space-y-1">
                    <KpiCard metric={m} title={title} definition={def} />
                    <div className="flex items-center justify-between px-1 text-xs text-muted-foreground">
                      <span>{p ? `Comparison: ${formatMetricValue(p)}` : prev.isError ? 'comparison unavailable' : '…'}</span>
                      <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setToken(m.drilldownToken)}>Records</Button>
                    </div>
                  </div>
                );
              })}
            </div>
            <Section title="Definitions">
              <p className="text-sm text-muted-foreground">Definitions version {Object.values(d.metrics)[0]?.definitionVersion}. Nights use [check-in, checkout). Calendar blocks are never sold nights. Forecasts are not mixed into actuals. Full formulas are in docs/METRICS.md.</p>
            </Section>
            <Freshness sourceAsOf={d.sourceAsOf} />
          </div>
        )}
      </QueryState>
      <DetailSheet open={!!token} onOpenChange={(o) => !o && setToken(null)} title="Supporting records" description={token ? `Metric ${token.split('|')[0]} · re-authorised on the server` : undefined}>
        {drill.isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : drill.isError ? <p className="text-sm text-destructive">{(drill.error as Error).message}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground">{Object.keys(drill.data.rows[0] ?? {}).map((k) => <th key={k} className="pr-2">{k}</th>)}</tr></thead><tbody>{drill.data.rows.map((r, i) => <tr key={i} className="border-t">{Object.values(r).map((v, j) => <td key={j} className="tabular py-1 pr-2">{String(v ?? '')}</td>)}</tr>)}</tbody></table>
            {drill.data.rows.length === 0 && <p className="text-sm text-muted-foreground">No supporting records.</p>}
          </div>
        )}
      </DetailSheet>
    </div>
  );
}
