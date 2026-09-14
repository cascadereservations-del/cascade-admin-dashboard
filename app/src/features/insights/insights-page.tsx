import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSession } from '@/auth/session';
import { useUrlState } from '@/lib/url-state';
import { addIsoDays, comparablePeriod, formatDate, periodPreset, type Period } from '@/lib/dates';
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
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import type { MetricResult } from '@/types/contracts';
import { fetchDrilldown, fetchMetrics, fetchUtilityMonths, isConsumptionReading } from './api';

// INS01/INS03/INS05: server-calculated hospitality metrics with an
// equivalent-elapsed comparison period and deterministic plain-language
// explanations built only from returned values and warnings. Session 12:
// period slicers (month, quarter, year, custom), coverage toggles, hover
// detail and a drill-down to records on every chart.

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
const PRESETS: Array<[string, string]> = [['mtd', 'Month'], ['qtd', 'Quarter'], ['ytd', 'Year'], ['prev-month', 'Prev month'], ['prev-quarter', 'Prev quarter'], ['prev-year', 'Prev year'], ['last30', 'Last 30'], ['last90', 'Last 90'], ['custom', 'Custom']];
const tooltipStyle = { borderRadius: 8, borderColor: 'var(--border)', background: 'var(--popover)', color: 'var(--popover-foreground)' };

// Plain HTML legend for a pair/trio of single-axis charts sharing one card
// (Recharts' <Legend> only composes inside a single chart's own tree).
function MiniLegend({ items }: { items: Array<{ label: string; color: string }> }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((it) => (
        <span key={it.label} className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

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

// Months inside a period, oldest first, as metric periods. A partial first or
// last month is kept whole so a bar always means one calendar month.
function monthsIn(p: Period): Array<{ start: string; endExclusive: string; label: string; month: string }> {
  const out = [];
  let y = Number(p.start.slice(0, 4));
  let m = Number(p.start.slice(5, 7));
  for (let i = 0; i < 36; i++) {
    const start = `${y}-${String(m).padStart(2, '0')}-01`;
    if (start >= p.endExclusive) break;
    const ny = m === 12 ? y + 1 : y;
    const nm = m === 12 ? 1 : m + 1;
    out.push({ start, endExclusive: `${ny}-${String(nm).padStart(2, '0')}-01`, label: formatDate(start, 'short').replace(/^\d+ /, ''), month: start.slice(0, 7) });
    y = ny; m = nm;
  }
  return out;
}
function nextMonthStart(month: string): string {
  const [y, mm] = month.split('-').map(Number);
  return `${mm === 12 ? y! + 1 : y}-${String(mm === 12 ? 1 : mm! + 1).padStart(2, '0')}-01`;
}

type Toggles = { pending: boolean; allReadings: boolean };

// Financial analytics (D-095): confirmed money in, out and drawn per month.
function FinancialAnalytics({ period, toggles }: { period: Period; toggles: Toggles }) {
  const s = useSession();
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['monthly-totals', s.propertyId, period.start, period.endExclusive], queryFn: () => fetchMonthlyTotals(s.propertyId, period.start.slice(0, 7) + '-01', period.endExclusive), staleTime: 300_000 });
  const data = (q.data ?? []).map((m) => ({ month: m.month, label: formatDate(m.month + '-01', 'short').replace(/^\d+ /, ''), income: m.incomeCents / 100, expense: (m.expenseCents - m.unaccountedCents) / 100, drawing: m.drawingCents / 100, unaccounted: m.unaccountedCents / 100, net: (m.incomeCents - m.expenseCents - m.drawingCents) / 100, count: m.count }));
  // Stat cards stay ledger-accurate (unaccounted added back); only the bars below exclude it.
  const totals = data.reduce((a, m) => ({ income: a.income + m.income, expense: a.expense + m.expense + m.unaccounted, drawing: a.drawing + m.drawing }), { income: 0, expense: 0, drawing: 0 });
  const totalUnaccounted = data.reduce((a, m) => a + m.unaccounted, 0);
  const openMonth = (month: string) => nav(`/finance/book?from=${month}-01&to=${nextMonthStart(month)}${toggles.pending ? '&pending=1' : ''}`);
  return (
    <Section title="Financial analytics" aside={<Link to="/finance/book" className="text-xs text-primary hover:underline">Open the account book</Link>}>
      {q.isPending ? <CardSkeleton /> : q.isError ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No confirmed transactions in this period.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-lg border bg-card p-3">
            <p className="mb-2 text-xs text-muted-foreground">Income, expenses and drawings by month, confirmed rows (cash basis). Click a month to open its records.{totalUnaccounted > 0 ? ` One-time catch-up entries (${formatPHP(totalUnaccounted)} total) are excluded from the bars so they don't flatten real monthly activity; they're still counted in Expenses and Position at right.` : ''}</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} onClick={(e) => { const p = (e as { activePayload?: Array<{ payload: { month: string } }> }).activePayload?.[0]?.payload; if (p) openMonth(p.month); }} style={{ cursor: 'pointer' }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} width={56} tickFormatter={(v: number) => formatPHP(v, { whole: true }).replace('PHP', '₱')} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} formatter={(v, name) => [formatPHP(Number(v)), String(name)]} labelFormatter={(l, payload) => { const p = payload?.[0]?.payload as { count?: number; net?: number; unaccounted?: number } | undefined; return `${l} · ${p?.count ?? 0} rows · net ${formatPHP(p?.net ?? 0)}${p?.unaccounted ? ` (excl. ${formatPHP(p.unaccounted)} catch-up)` : ''}`; }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="income" name="Income" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Expenses" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="drawing" name="Drawings" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="space-y-2">
            <div className="rounded-lg border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Income</p><p className="tabular text-xl font-semibold">{formatPHP(totals.income)}</p></div>
            <div className="rounded-lg border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Expenses</p><p className="tabular text-xl font-semibold">{formatPHP(totals.expense)}</p></div>
            <div className="rounded-lg border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Drawings</p><p className="tabular text-xl font-semibold">{formatPHP(totals.drawing)}</p></div>
            <div className="rounded-lg border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Position (income − expenses − drawings)</p><p className={`tabular text-xl font-semibold ${totals.income - totals.expense - totals.drawing < 0 ? 'text-destructive' : ''}`}>{formatPHP(totals.income - totals.expense - totals.drawing)}</p></div>
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-xs">
                <thead><tr className="text-left text-muted-foreground"><th className="px-3 py-1.5">Month</th><th className="px-3 py-1.5 text-right">Net</th></tr></thead>
                <tbody>{data.slice(-6).reverse().map((m) => <tr key={m.month} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => openMonth(m.month)}><td className="px-3 py-1.5">{m.label}</td><td className={`tabular px-3 py-1.5 text-right ${m.net < 0 ? 'text-destructive' : ''}`}>{formatPHP(m.net)}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

// Monthly hospitality trend: occupancy, ADR and RevPAR from the same server
// metric service, one call per month, never recomputed on the client.
function PerformanceTrend({ period, onDrill }: { period: Period; onDrill: (token: string) => void }) {
  const s = useSession();
  const months = monthsIn(period);
  const qs = useQueries({ queries: months.map((m) => ({ queryKey: ['metrics', s.propertyId, m.start, m.endExclusive], queryFn: () => fetchMetrics(s.propertyId, m.start, m.endExclusive), staleTime: 300_000 })) });
  const pending = qs.some((q) => q.isPending);
  const num = (r?: MetricResult) => (r?.value == null ? null : Number(r.value));
  const data = months.map((m, i) => {
    const mm = qs[i]?.data?.metrics ?? {};
    return { label: m.label, occupancy: num(mm.occupancy), adr: num(mm.adr), revpar: num(mm.revpar), nights: num(mm.sold_nights), revenue: num(mm.accommodation_revenue), coverage: mm.accommodation_revenue?.coverage, covered: mm.accommodation_revenue?.includedCount, excluded: mm.accommodation_revenue?.excludedCount, token: mm.sold_nights?.drilldownToken, revToken: mm.accommodation_revenue?.drilldownToken };
  });
  const financeVisible = qs.some((q) => q.data?.financeVisible);
  const click = (tokenKey: 'token' | 'revToken') => (e: unknown) => { const p = (e as { activePayload?: Array<{ payload: Record<string, string | undefined> }> }).activePayload?.[0]?.payload; const t = p?.[tokenKey]; if (t) onDrill(t); };
  // Each measure gets its own single-axis chart (dataviz skill: never a dual-axis
  // chart) instead of forcing two different scales onto one plot.
  return (
    <Section title="Monthly performance">
      {pending ? <CardSkeleton /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border bg-card p-3">
            <p className="mb-2 text-xs text-muted-foreground">Sold nights and occupancy by month (through the last completed night). Click a month for its stays.</p>
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} onClick={click('token')} style={{ cursor: 'pointer' }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} width={28} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} />
                  <Bar dataKey="nights" name="Sold nights" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="h-28">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} onClick={click('token')} style={{ cursor: 'pointer' }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} fontSize={11} width={32} tickFormatter={(v: number) => `${v}%`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${Number(v).toFixed(0)}%`} />
                  <Line type="monotone" dataKey="occupancy" name="Occupancy" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <MiniLegend items={[{ label: 'Sold nights', color: 'var(--chart-3)' }, { label: 'Occupancy', color: 'var(--chart-1)' }]} />
          </div>
          <div className="rounded-lg border bg-card p-3">
            <p className="mb-2 text-xs text-muted-foreground">{financeVisible ? 'Accommodation revenue, then ADR and RevPAR (same per-night scale), by month (stay basis, excludes cleaning and platform fees). Hover for coverage; click for the stays.' : 'Financial trend is hidden for this session'}</p>
            {financeVisible && (
              <>
                <div className="h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} onClick={click('revToken')} style={{ cursor: 'pointer' }}>
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis tickLine={false} axisLine={false} fontSize={11} width={56} tickFormatter={(v: number) => formatPHP(v, { whole: true }).replace('PHP', '₱')} />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} formatter={(v) => formatPHP(Number(v))} labelFormatter={(l, payload) => { const p = payload?.[0]?.payload as { coverage?: string; covered?: number; excluded?: number } | undefined; return `${l} · coverage ${p?.coverage ?? '?'} (${p?.covered ?? 0} nights covered, ${p?.excluded ?? 0} without an amount)`; }} />
                      <Bar dataKey="revenue" name="Accommodation revenue" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="h-28">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} onClick={click('revToken')} style={{ cursor: 'pointer' }}>
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis tickLine={false} axisLine={false} fontSize={11} width={56} tickFormatter={(v: number) => formatPHP(v, { whole: true }).replace('PHP', '₱')} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v) => formatPHP(Number(v))} />
                      <Line type="monotone" dataKey="adr" name="ADR" stroke="var(--chart-2)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                      <Line type="monotone" dataKey="revpar" name="RevPAR" stroke="var(--chart-4)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <MiniLegend items={[{ label: 'Accommodation revenue', color: 'var(--chart-1)' }, { label: 'ADR', color: 'var(--chart-2)' }, { label: 'RevPAR', color: 'var(--chart-4)' }]} />
              </>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

// Electricity and water from the meter photos the cleaners submit, summed per
// month. A spike is a misread meter first and a leak second.
function UtilitiesChart({ period, toggles }: { period: Period; toggles: Toggles }) {
  const s = useSession();
  const nav = useNavigate();
  const from = period.start.slice(0, 7) + '-01';
  const q = useQuery({ queryKey: ['utility-months', s.propertyId, from, period.endExclusive, toggles.allReadings], queryFn: () => fetchUtilityMonths(s.propertyId, from, period.endExclusive, toggles.allReadings ? () => true : isConsumptionReading), staleTime: 300_000 });
  const data = (q.data ?? []).map((m) => ({ ...m, label: formatDate(m.month + '-01', 'short').replace(/^\d+ /, ''), kwh: Math.round(m.kwh), m3: Math.round(m.m3 * 10) / 10 }));
  const excluded = data.reduce((a, m) => a + m.excluded, 0);
  return (
    <Section title="Utilities" aside={<Link to="/operations" className="text-xs text-primary hover:underline">Open the cleaning log</Link>}>
      {q.isPending ? <CardSkeleton /> : q.isError ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No meter readings in this period.</p>
      ) : (
        <div className="rounded-lg border bg-card p-3">
          <p className="mb-2 text-xs text-muted-foreground">Electricity (kWh) and water (m³) consumed per month from the cleaning log. {toggles.allReadings ? 'Every reading is summed, including first entries, negative re-entries and flagged rows.' : `First readings, negative re-entries and flagged rows are left out${excluded ? ` (${excluded} in this period)` : ''}.`} Click a month to open its cleanings.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Electricity (kWh)</p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} onClick={(e) => { const p = (e as { activePayload?: Array<{ payload: { month: string } }> }).activePayload?.[0]?.payload; if (p) nav(`/operations?from=${p.month}-01&to=${nextMonthStart(p.month)}`); }} style={{ cursor: 'pointer' }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} width={40} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} formatter={(v) => `${v} kWh`} labelFormatter={(l, payload) => { const p = payload?.[0]?.payload as { readings?: number; excluded?: number } | undefined; return `${l} · ${p?.readings ?? 0} readings, ${p?.excluded ?? 0} left out`; }} />
                    <Bar dataKey="kwh" name="Electricity (kWh)" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Water (m³)</p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} onClick={(e) => { const p = (e as { activePayload?: Array<{ payload: { month: string } }> }).activePayload?.[0]?.payload; if (p) nav(`/operations?from=${p.month}-01&to=${nextMonthStart(p.month)}`); }} style={{ cursor: 'pointer' }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} width={36} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v) => `${v} m³`} labelFormatter={(l, payload) => { const p = payload?.[0]?.payload as { readings?: number; excluded?: number } | undefined; return `${l} · ${p?.readings ?? 0} readings, ${p?.excluded ?? 0} left out`; }} />
                    <Line type="monotone" dataKey="m3" name="Water (m³)" stroke="var(--chart-3)" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

export default function InsightsPage() {
  const s = useSession();
  const { state, set } = useUrlState({ period: 'mtd', from: '', to: '', pending: '', all: '' });
  const preset = periodPreset(state.period);
  const cur: Period = state.period === 'custom' && state.from && state.to ? { ...preset, key: 'custom', start: state.from, endExclusive: state.to, label: 'Custom' } : preset;
  const cmp = comparablePeriod(cur, ['ytd', 'prev-year', 'qtd', 'prev-quarter'].includes(state.period) ? 'year' : 'month');
  const toggles: Toggles = { pending: state.pending === '1', allReadings: state.all === '1' };
  // Charts need at least a year of months to read as a trend; a month-long slicer still shows the last twelve.
  const chartPeriod: Period = cur.endExclusive > addIsoDays(cur.start, 300) ? cur : { ...cur, start: addIsoDays(cur.endExclusive, -365).slice(0, 7) + '-01', label: 'Last twelve months' };
  const now = useQuery({ queryKey: ['metrics', s.propertyId, cur.start, cur.endExclusive], queryFn: () => fetchMetrics(s.propertyId, cur.start, cur.endExclusive) });
  const prev = useQuery({ queryKey: ['metrics', s.propertyId, cmp.start, cmp.endExclusive], queryFn: () => fetchMetrics(s.propertyId, cmp.start, cmp.endExclusive) });
  const [token, setToken] = useState<string | null>(null);
  const drill = useQuery({ queryKey: ['drilldown', s.propertyId, token], queryFn: () => fetchDrilldown(s.propertyId, token!), enabled: !!token });

  return (
    <div>
      <PageHeader
        title="KPIs & Analytics"
        description="Hospitality performance through the last completed night, plus money in, out and drawn. Every KPI is computed on the server with its definition and coverage; every chart opens its records."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={state.period} onValueChange={(v) => set({ period: v })}><TabsList className="flex-wrap">{PRESETS.map(([p, l]) => <TabsTrigger key={p} value={p}>{l}</TabsTrigger>)}</TabsList></Tabs>
            {state.period === 'custom' && <><Input type="date" aria-label="From" className="w-36" value={state.from} onChange={(e) => set({ from: e.target.value, period: 'custom' })} /><Input type="date" aria-label="To (exclusive)" className="w-36" value={state.to} onChange={(e) => set({ to: e.target.value, period: 'custom' })} /></>}
          </div>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        <span>{cur.label}: {formatDate(cur.start, 'long')} to {formatDate(cur.endExclusive, 'long')} (exclusive). Comparison: {cmp.label.toLowerCase()}, {formatDate(cmp.start, 'long')} to {formatDate(cmp.endExclusive, 'long')}.</span>
        <span className="flex items-center gap-2"><Switch id="ins-pending" checked={toggles.pending} onCheckedChange={(v) => set({ pending: v ? '1' : '' })} /><Label htmlFor="ins-pending" className="font-normal">Include pending-review rows in money drill-downs</Label></span>
        <span className="flex items-center gap-2"><Switch id="ins-all" checked={toggles.allReadings} onCheckedChange={(v) => set({ all: v ? '1' : '' })} /><Label htmlFor="ins-all" className="font-normal">Sum every meter reading</Label></span>
      </div>
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
            <PerformanceTrend period={chartPeriod} onDrill={setToken} />
            <FinancialAnalytics period={chartPeriod} toggles={toggles} />
            <UtilitiesChart period={chartPeriod} toggles={toggles} />
            <Section title="Definitions">
              <p className="text-sm text-muted-foreground">Definitions version {Object.values(d.metrics)[0]?.definitionVersion}. Nights use [check-in, checkout). Calendar blocks are never sold nights. Forecasts are not mixed into actuals. Full formulas are in docs/METRICS.md.</p>
            </Section>
            <Freshness sourceAsOf={d.sourceAsOf} />
          </div>
        )}
      </QueryState>
      <DetailSheet open={!!token} onOpenChange={(o) => !o && setToken(null)} title="Supporting records" description={token ? `Metric ${token.split('|')[0]} · ${formatDate(token.split('|')[3], 'long')} to ${formatDate(token.split('|')[4], 'long')} · re-authorised on the server` : undefined}>
        {drill.isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : drill.isError ? <p className="text-sm text-destructive">{(drill.error as Error).message}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs"><thead><tr className="text-left text-muted-foreground">{Object.keys(drill.data.rows[0] ?? {}).map((k) => <th key={k} className="pr-2">{k}</th>)}</tr></thead><tbody>{drill.data.rows.map((r, i) => <tr key={i} className="border-t">{Object.entries(r).map(([k, v], j) => <td key={j} className="tabular py-1 pr-2">{k === 'id' && typeof v === 'string' && r.kind ? <Link to={`/bookings/${String(r.kind)}/${v}`} className="underline">{v.slice(0, 8)}</Link> : String(v ?? '')}</td>)}</tr>)}</tbody></table>
            {drill.data.rows.length === 0 && <p className="text-sm text-muted-foreground">No supporting records.</p>}
          </div>
        )}
      </DetailSheet>
    </div>
  );
}
