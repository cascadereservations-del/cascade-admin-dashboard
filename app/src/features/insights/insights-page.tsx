import { useState } from 'react';
import { Link } from 'react-router';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSession } from '@/auth/session';
import { useUrlState } from '@/lib/url-state';
import { addIsoDays, comparablePeriod, formatDate, periodPreset, todayManila } from '@/lib/dates';
import { fetchMonthlyTotals } from '@/features/finance/api';
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
import { fetchDrilldown, fetchMetrics, fetchUtilityMonths } from './api';

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

// Financial analytics (D-095): twelve months of confirmed money in and out
// from the operational ledger, so the owner sees the trend, not only the KPIs.
function FinancialAnalytics() {
  const s = useSession();
  const from = addIsoDays(todayManila(), -365).slice(0, 7) + '-01';
  const q = useQuery({ queryKey: ['monthly-totals', s.propertyId, from], queryFn: () => fetchMonthlyTotals(s.propertyId, from), staleTime: 300_000 });
  const data = (q.data ?? []).map((m) => ({ month: m.month, label: formatDate(m.month + '-01', 'short').replace(/^\d+ /, ''), income: m.incomeCents / 100, expense: m.expenseCents / 100, net: (m.incomeCents - m.expenseCents) / 100 }));
  const totals = data.reduce((a, m) => ({ income: a.income + m.income, expense: a.expense + m.expense }), { income: 0, expense: 0 });
  return (
    <Section title="Financial analytics" aside={<Link to="/finance/book" className="text-xs text-primary hover:underline">Open the account book</Link>}>
      {q.isPending ? <CardSkeleton /> : q.isError ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No confirmed transactions in the last twelve months.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-lg border bg-card p-3">
            <p className="mb-2 text-xs text-muted-foreground">Money in and out by month, confirmed rows, last twelve months (cash basis)</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} width={56} tickFormatter={(v: number) => formatPHP(v, { whole: true }).replace('PHP', '₱')} />
                  <Tooltip formatter={(v) => formatPHP(Number(v))} contentStyle={{ borderRadius: 8, borderColor: 'var(--border)', background: 'var(--popover)', color: 'var(--popover-foreground)' }} cursor={{ fill: 'var(--muted)' }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="income" name="Money in" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Money out" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="space-y-2">
            <div className="rounded-lg border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Money in, twelve months</p>
              <p className="tabular text-xl font-semibold">{formatPHP(totals.income)}</p>
            </div>
            <div className="rounded-lg border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Money out, twelve months</p>
              <p className="tabular text-xl font-semibold">{formatPHP(totals.expense)}</p>
            </div>
            <div className="rounded-lg border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Net, twelve months</p>
              <p className={`tabular text-xl font-semibold ${totals.income - totals.expense < 0 ? 'text-destructive' : ''}`}>{formatPHP(totals.income - totals.expense)}</p>
            </div>
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-muted-foreground"><th className="px-3 py-1.5">Month</th><th className="px-3 py-1.5 text-right">Net</th></tr></thead>
                <tbody>{data.slice(-6).reverse().map((m) => <tr key={m.month} className="border-t"><td className="px-3 py-1.5">{m.label}</td><td className={`tabular px-3 py-1.5 text-right ${m.net < 0 ? 'text-destructive' : ''}`}>{formatPHP(m.net)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

// Last twelve calendar months, oldest first, as metric periods.
function lastMonths(n: number): Array<{ start: string; endExclusive: string; label: string }> {
  const today = todayManila();
  const y0 = Number(today.slice(0, 4));
  const m0 = Number(today.slice(5, 7));
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const idx = y0 * 12 + (m0 - 1) - i;
    const y = Math.floor(idx / 12);
    const m = (idx % 12) + 1;
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    out.push({ start, endExclusive: `${ny}-${String(nm).padStart(2, '0')}-01`, label: formatDate(start, 'short').replace(/^\d+ /, '') });
  }
  return out;
}

const tooltipStyle = { borderRadius: 8, borderColor: 'var(--border)', background: 'var(--popover)', color: 'var(--popover-foreground)' };

// Monthly hospitality trend: occupancy, ADR and RevPAR are the three numbers
// every short-term-rental benchmark leads with (RevPAR = ADR × occupancy), so
// they are charted side by side from the same server metric service, one call
// per month, never recomputed on the client.
function PerformanceTrend() {
  const s = useSession();
  const months = lastMonths(12);
  const qs = useQueries({ queries: months.map((m) => ({ queryKey: ['metrics', s.propertyId, m.start, m.endExclusive], queryFn: () => fetchMetrics(s.propertyId, m.start, m.endExclusive), staleTime: 300_000 })) });
  const pending = qs.some((q) => q.isPending);
  const num = (r?: MetricResult) => (r?.value == null ? null : Number(r.value));
  const data = months.map((m, i) => {
    const mm = qs[i]?.data?.metrics ?? {};
    return { label: m.label, occupancy: num(mm.occupancy), adr: num(mm.adr), revpar: num(mm.revpar), nights: num(mm.sold_nights), revenue: num(mm.accommodation_revenue) };
  });
  const financeVisible = qs.some((q) => q.data?.financeVisible);
  return (
    <Section title="Twelve-month performance">
      {pending ? <CardSkeleton /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border bg-card p-3">
            <p className="mb-2 text-xs text-muted-foreground">Occupancy and sold nights by month (through the last completed night)</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis yAxisId="n" tickLine={false} axisLine={false} fontSize={11} width={32} />
                  <YAxis yAxisId="p" orientation="right" domain={[0, 100]} tickLine={false} axisLine={false} fontSize={11} width={36} tickFormatter={(v: number) => `${v}%`} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} formatter={(v, name) => (name === 'Occupancy' ? `${Number(v).toFixed(0)}%` : String(v))} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="n" dataKey="nights" name="Sold nights" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="p" type="monotone" dataKey="occupancy" name="Occupancy" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="mb-2 text-xs text-muted-foreground">{financeVisible ? 'Accommodation revenue, ADR and RevPAR by month (stay basis, excludes cleaning and platform fees)' : 'Financial trend is hidden for this session'}</p>
            {financeVisible && (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis yAxisId="rev" tickLine={false} axisLine={false} fontSize={11} width={56} tickFormatter={(v: number) => formatPHP(v, { whole: true }).replace('PHP', '₱')} />
                    <YAxis yAxisId="rate" orientation="right" tickLine={false} axisLine={false} fontSize={11} width={48} tickFormatter={(v: number) => formatPHP(v, { whole: true }).replace('PHP', '₱')} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} formatter={(v) => formatPHP(Number(v))} />
                    <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                    <Bar yAxisId="rev" dataKey="revenue" name="Accommodation revenue" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                    <Line yAxisId="rate" type="monotone" dataKey="adr" name="ADR" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line yAxisId="rate" type="monotone" dataKey="revpar" name="RevPAR" stroke="var(--chart-4)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

// Electricity and water from the meter photos the cleaners submit, summed per
// month. A spike is a misread meter first and a leak second.
function UtilitiesChart() {
  const s = useSession();
  const from = addIsoDays(todayManila(), -365).slice(0, 7) + '-01';
  const q = useQuery({ queryKey: ['utility-months', s.propertyId, from], queryFn: () => fetchUtilityMonths(s.propertyId, from), staleTime: 300_000 });
  const data = (q.data ?? []).map((m) => ({ ...m, label: formatDate(m.month + '-01', 'short').replace(/^\d+ /, ''), kwh: Math.round(m.kwh), m3: Math.round(m.m3 * 10) / 10 }));
  return (
    <Section title="Utilities" aside={<Link to="/operations/cleaning" className="text-xs text-primary hover:underline">Open the cleaning log</Link>}>
      {q.isPending ? <CardSkeleton /> : q.isError ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No meter readings in the last twelve months.</p>
      ) : (
        <div className="rounded-lg border bg-card p-3">
          <p className="mb-2 text-xs text-muted-foreground">Electricity (kWh) and water (m³) consumed per month, from the meter readings in the cleaning log. First readings (previous value 0), negative re-entries and flagged rows are left out of the sums{(() => { const n = data.reduce((a, m) => a + m.excluded, 0); return n ? ` (${n} such reading${n === 1 ? '' : 's'} in this period, see the cleaning log)` : ''; })()}.</p>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis yAxisId="e" tickLine={false} axisLine={false} fontSize={11} width={44} tickFormatter={(v: number) => `${v}`} />
                <YAxis yAxisId="w" orientation="right" tickLine={false} axisLine={false} fontSize={11} width={40} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} formatter={(v, name) => (name === 'Water (m³)' ? `${v} m³` : `${v} kWh`)} />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="e" dataKey="kwh" name="Electricity (kWh)" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
                <Line yAxisId="w" type="monotone" dataKey="m3" name="Water (m³)" stroke="var(--chart-3)" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </Section>
  );
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
        title="KPIs & Analytics"
        description="Hospitality performance through the last completed night, plus money in and out. Every KPI is computed on the server with its definition and coverage."
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
            <PerformanceTrend />
            <FinancialAnalytics />
            <UtilitiesChart />
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
