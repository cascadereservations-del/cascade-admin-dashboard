import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueries, useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useSession } from '@/auth/session';
import { useUrlState } from '@/lib/url-state';
import { addIsoDays, comparablePeriod, formatDate, nightsInPeriod, periodPreset, todayManila, type Period } from '@/lib/dates';
import { fetchMonthlyTotals } from '@/features/finance/api';
import { decimalToNumber, formatPHP } from '@/lib/money';
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
import { fetchDrilldown, fetchFutureStays, fetchMetrics, fetchUtilityMonths, isConsumptionReading } from './api';
import { fetchCard } from '@/features/pricing/api';

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

// A metric's `value` is `null` for "not available" (never 0 - see formatMetricValue).
const numOrNaN = decimalToNumber;
function shiftMonthKey(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const total = y! * 12 + (m! - 1) + delta;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}
function monthBounds(month: string): { start: string; endExclusive: string } {
  return { start: `${month}-01`, endExclusive: `${shiftMonthKey(month, 1)}-01` };
}
function monthLabel(month: string): string {
  return formatDate(`${month}-01`, 'long').replace(/^\d+ /, '');
}
function pctDelta(cur: number, prior: number): number | null {
  return Number.isFinite(cur) && Number.isFinite(prior) && prior !== 0 ? ((cur - prior) / Math.abs(prior)) * 100 : null;
}
function fmtDeltaPct(v: number | null): string {
  return v === null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;
}
// Charts widen a too-narrow slicer selection to a trailing 12 months so a
// bar chart still reads as a trend (see chartPeriod below); this makes that
// substitution visible in the section title instead of silently showing a
// different window than the one the user picked.
function periodSuffix(period: Period): string {
  return period.label === 'Last twelve months' ? ' · last 12 months' : '';
}

// Ordinary least squares over index 0..n-1, ignoring null/NaN points (a
// reading-count anomaly shouldn't distort the fitted line). Returns null for
// every point when fewer than 2 usable points exist.
function linearTrend(ys: Array<number | null>): Array<number | null> {
  const pts = ys.map((y, x) => ({ x, y })).filter((p): p is { x: number; y: number } => p.y !== null && Number.isFinite(p.y));
  if (pts.length < 2) return ys.map(() => null);
  const n = pts.length;
  const sumX = pts.reduce((a, p) => a + p.x, 0);
  const sumY = pts.reduce((a, p) => a + p.y, 0);
  const sumXY = pts.reduce((a, p) => a + p.x * p.y, 0);
  const sumXX = pts.reduce((a, p) => a + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return ys.map(() => sumY / n);
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return ys.map((_, x) => Math.round((intercept + slope * x) * 100) / 100);
}

function StatDelta({ label, value, deltaLabel, bad }: { label: string; value: string; deltaLabel: string; bad?: boolean }) {
  return (
    <div className="rounded-lg border bg-card px-4 py-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="tabular text-xl font-semibold">{value}</p>
      <p className={`text-xs ${bad ? 'text-destructive' : 'text-muted-foreground'}`}>{deltaLabel}</p>
    </div>
  );
}

// Fixed operator check, independent of the period slicer above: this real
// calendar month against the same month last year, plus a short plain-language
// "what changed" list. The trend charts below stay slicer-driven; this answers
// "are we up or down year over year" regardless of what the slicer is set to.
function MonthSnapshot() {
  const s = useSession();
  const thisMonth = todayManila().slice(0, 7);
  const lastMonth = shiftMonthKey(thisMonth, -1);
  const lastYear = shiftMonthKey(thisMonth, -12);
  const tb = monthBounds(thisMonth);
  const yb = monthBounds(lastYear);
  const totalsQ = useQuery({ queryKey: ['month-snapshot-totals', s.propertyId, lastYear], queryFn: () => fetchMonthlyTotals(s.propertyId, yb.start, tb.endExclusive), staleTime: 300_000 });
  const [curM, yearM] = useQueries({ queries: [
    { queryKey: ['metrics', s.propertyId, tb.start, tb.endExclusive], queryFn: () => fetchMetrics(s.propertyId, tb.start, tb.endExclusive), staleTime: 300_000 },
    { queryKey: ['metrics', s.propertyId, yb.start, yb.endExclusive], queryFn: () => fetchMetrics(s.propertyId, yb.start, yb.endExclusive), staleTime: 300_000 },
  ] });
  if (totalsQ.isPending || curM?.isPending || yearM?.isPending) return <CardSkeleton />;
  if (totalsQ.isError) return null; // a nicety on top of the slicer-driven charts; don't block the page on it

  const byMonth = new Map((totalsQ.data ?? []).map((m) => [m.month, m]));
  const curIncome = (byMonth.get(thisMonth)?.incomeCents ?? 0) / 100;
  const priorIncome = (byMonth.get(lastMonth)?.incomeCents ?? 0) / 100;
  const yearIncome = (byMonth.get(lastYear)?.incomeCents ?? 0) / 100;
  const hasYearData = byMonth.has(lastYear);
  const occCur = numOrNaN(curM?.data?.metrics.occupancy?.value);
  const occYear = numOrNaN(yearM?.data?.metrics.occupancy?.value);
  const adrCur = numOrNaN(curM?.data?.metrics.adr?.value);
  const adrYear = numOrNaN(yearM?.data?.metrics.adr?.value);
  const incYoY = hasYearData ? pctDelta(curIncome, yearIncome) : null;
  const occYoY = Number.isFinite(occCur) && Number.isFinite(occYear) ? occCur - occYear : null;
  const adrYoY = Number.isFinite(adrCur) && Number.isFinite(adrYear) ? pctDelta(adrCur, adrYear) : null;

  const changes: string[] = [];
  const incMoM = pctDelta(curIncome, priorIncome);
  if (incMoM !== null) changes.push(`Income ${fmtDeltaPct(incMoM)} vs ${monthLabel(lastMonth)} (${formatPHP(priorIncome)} → ${formatPHP(curIncome)}).`);
  if (incYoY !== null) changes.push(`Income ${fmtDeltaPct(incYoY)} vs ${monthLabel(lastYear)}.`);
  if (occYoY !== null) changes.push(`Occupancy ${occYoY >= 0 ? '+' : ''}${occYoY.toFixed(0)} pts vs last year (${occYear.toFixed(0)}% → ${occCur.toFixed(0)}%).`);
  if (adrYoY !== null) changes.push(`ADR ${fmtDeltaPct(adrYoY)} vs last year.`);

  return (
    <Section title={`${monthLabel(thisMonth)} vs ${monthLabel(lastYear)}`}>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatDelta label="Income" value={formatPHP(curIncome)} deltaLabel={incYoY !== null ? `${fmtDeltaPct(incYoY)} vs last year` : 'no data last year'} bad={incYoY !== null && incYoY < 0} />
        <StatDelta label="Occupancy" value={Number.isFinite(occCur) ? `${occCur.toFixed(0)}%` : 'Not available'} deltaLabel={occYoY !== null ? `${occYoY >= 0 ? '+' : ''}${occYoY.toFixed(0)} pts vs last year` : 'no data last year'} bad={occYoY !== null && occYoY < 0} />
        <StatDelta label="ADR" value={Number.isFinite(adrCur) ? formatPHP(adrCur) : 'Not available'} deltaLabel={adrYoY !== null ? `${fmtDeltaPct(adrYoY)} vs last year` : 'no data last year'} bad={adrYoY !== null && adrYoY < 0} />
      </div>
      {changes.length > 0 && (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          {changes.slice(0, 4).map((c) => <li key={c}>{c}</li>)}
        </ul>
      )}
    </Section>
  );
}

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

// Money (D-095, redesigned session 17 per D-120's "wall of bars" critique):
// income vs expenses as the primary comparison, net as a line on the SAME
// axis (all three are PHP, so this is not the dual-axis mistake), drawings
// split into their own small chart below (D-yet, see 04-HANDOFF) so an owner
// transfer never reads as a cost sitting next to real operating expenses.
function useMonthlyTotals(period: Period) {
  const s = useSession();
  return useQuery({ queryKey: ['monthly-totals', s.propertyId, period.start, period.endExclusive], queryFn: () => fetchMonthlyTotals(s.propertyId, period.start.slice(0, 7) + '-01', period.endExclusive), staleTime: 300_000 });
}
function monthlyRows(q: ReturnType<typeof useMonthlyTotals>) {
  // Net matches the Expense bar's own exclusion of one-time catch-up entries
  // (unaccountedCents) - otherwise a big catch-up month draws a line drop with
  // no corresponding bar spike next to it. The stat cards use `totals` below,
  // which adds unaccounted back in separately and stay ledger-exact.
  return (q.data ?? []).map((m) => ({ month: m.month, label: formatDate(m.month + '-01', 'short').replace(/^\d+ /, ''), income: m.incomeCents / 100, expense: (m.expenseCents - m.unaccountedCents) / 100, drawing: m.drawingCents / 100, unaccounted: m.unaccountedCents / 100, net: (m.incomeCents - (m.expenseCents - m.unaccountedCents) - m.drawingCents) / 100, count: m.count }));
}

function MoneyTrend({ period, toggles }: { period: Period; toggles: Toggles }) {
  const nav = useNavigate();
  const q = useMonthlyTotals(period);
  const data = monthlyRows(q);
  // Stat cards stay ledger-accurate (unaccounted added back); only the bars exclude it.
  const totals = data.reduce((a, m) => ({ income: a.income + m.income, expense: a.expense + m.expense + m.unaccounted, drawing: a.drawing + m.drawing }), { income: 0, expense: 0, drawing: 0 });
  const totalUnaccounted = data.reduce((a, m) => a + m.unaccounted, 0);
  const position = totals.income - totals.expense - totals.drawing;
  const openMonth = (month: string) => nav(`/finance/book?from=${month}-01&to=${nextMonthStart(month)}${toggles.pending ? '&pending=1' : ''}`);
  return (
    <Section title={`Income vs expenses${periodSuffix(period)}`} aside={<Link to="/finance/book" className="text-xs text-primary hover:underline">Open the account book</Link>}>
      {q.isPending ? <CardSkeleton /> : q.isError ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No confirmed transactions in this period.</p>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-lg border bg-card p-3">
            <p className="mb-2 text-xs text-muted-foreground">Income and expenses side by side each month, net position as the line. Confirmed rows, cash basis. Click a month to open its records.{totalUnaccounted > 0 ? ` One-time catch-up entries (${formatPHP(totalUnaccounted)} total) are excluded from the bars and the net line so they don't flatten real monthly activity; they're still counted in Expenses and Position at right.` : ''}</p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} onClick={(e) => { const p = (e as { activePayload?: Array<{ payload: { month: string } }> }).activePayload?.[0]?.payload; if (p) openMonth(p.month); }} style={{ cursor: 'pointer' }}>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} width={56} tickFormatter={(v: number) => formatPHP(v, { whole: true }).replace('PHP', '₱')} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} formatter={(v, name) => [formatPHP(Number(v)), String(name)]} labelFormatter={(l, payload) => { const p = payload?.[0]?.payload as { count?: number; net?: number; unaccounted?: number } | undefined; return `${l} · ${p?.count ?? 0} rows${p?.unaccounted ? ` (excl. ${formatPHP(p.unaccounted)} catch-up)` : ''}`; }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="income" name="Income" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Expenses" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="net" name="Net" stroke="var(--chart-3)" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="space-y-2">
            <div className="rounded-lg border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Income</p><p className="tabular text-xl font-semibold">{formatPHP(totals.income)}</p></div>
            <div className="rounded-lg border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Expenses</p><p className="tabular text-xl font-semibold">{formatPHP(totals.expense)}</p></div>
            <div className="rounded-lg border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Drawings</p><p className="tabular text-xl font-semibold">{formatPHP(totals.drawing)}</p></div>
            <div className="rounded-lg border bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Position (income − expenses − drawings)</p><p className={`tabular text-xl font-semibold ${position < 0 ? 'text-destructive' : ''}`}>{formatPHP(position)}</p></div>
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

// Drawings, deliberately on their own axis and scale so an owner's personal
// draw never gets read as an operating cost sitting next to real expenses.
function DrawingsTrend({ period }: { period: Period }) {
  const q = useMonthlyTotals(period);
  const data = monthlyRows(q);
  const total = data.reduce((a, m) => a + m.drawing, 0);
  if (q.isPending || q.isError) return null;
  return (
    <Section title={`Owner drawings${periodSuffix(period)}`}>
      <div className="rounded-lg border bg-card p-3">
        <p className="mb-2 text-xs text-muted-foreground">Money drawn out by the owner each month, kept off the income/expenses chart so it never reads as a business cost.</p>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">No owner drawings in this period.</p>
        ) : (
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={56} tickFormatter={(v: number) => formatPHP(v, { whole: true }).replace('PHP', '₱')} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} formatter={(v) => formatPHP(Number(v))} />
                <Bar dataKey="drawing" name="Drawings" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Section>
  );
}

// Forward projection (session 17): confirmed nights already on the calendar
// for the next 3 months, priced at the current period's ADR (falling back to
// the standard nightly rate from app_settings, 01-FACTS, when no ADR is
// computable yet). Explicitly labeled as a projection, never mixed into the
// actuals charts above - dashed/translucent styling marks it as not-yet-real.
function ForwardProjection({ fallbackAdr }: { fallbackAdr: number }) {
  const s = useSession();
  const thisMonth = todayManila().slice(0, 7);
  const months = [1, 2, 3].map((n) => {
    const month = shiftMonthKey(thisMonth, n);
    const b = monthBounds(month);
    return { month, ...b, label: monthLabel(month) };
  });
  const windowStart = monthBounds(shiftMonthKey(thisMonth, 1)).start;
  const windowEnd = monthBounds(shiftMonthKey(thisMonth, 3)).endExclusive;
  const q = useQuery({ queryKey: ['future-stays', s.propertyId, windowStart, windowEnd], queryFn: () => fetchFutureStays(s.propertyId, windowStart, windowEnd), staleTime: 300_000 });
  // SPEC-34: the fallback is the stored rate card's standard rate, not a copy of it.
  const card = useQuery({ queryKey: ['rate-card'], queryFn: fetchCard, staleTime: 300_000 });
  const adr = Number.isFinite(fallbackAdr) && fallbackAdr > 0 ? fallbackAdr : (card.data?.base ?? 0);
  const data = months.map((m) => {
    const nights = (q.data ?? []).reduce((a, r) => a + nightsInPeriod(r.checkin_date, r.checkout_date, m.start, m.endExclusive), 0);
    return { label: m.label, nights, projected: Math.round(nights * adr) };
  });
  const totalNights = data.reduce((a, d) => a + d.nights, 0);
  const pending = q.isPending || (adr === 0 && card.isPending);
  return (
    <Section title="Forward projection">
      {pending ? <CardSkeleton /> : !(adr > 0) ? (
        <p className="text-sm text-muted-foreground">No ADR for this period yet and the standard rate could not be read, so no projection is drawn. Reload to try again.</p>
      ) : totalNights === 0 ? (
        <p className="text-sm text-muted-foreground">No confirmed bookings on the calendar past this month yet.</p>
      ) : (
        <div className="rounded-lg border bg-card p-3">
          <p className="mb-2 text-xs text-muted-foreground">Projection, not a forecast: confirmed nights already on the calendar for the next 3 months, at {formatPHP(adr, { whole: true })}/night ({Number.isFinite(fallbackAdr) && fallbackAdr > 0 ? "this period's ADR" : 'the standard rate — no ADR computed yet'}). New bookings and cancellations will move these bars.</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--border)" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                <YAxis tickLine={false} axisLine={false} fontSize={11} width={56} tickFormatter={(v: number) => formatPHP(v, { whole: true }).replace('PHP', '₱')} />
                <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} formatter={(v) => formatPHP(Number(v))} labelFormatter={(l, payload) => { const p = payload?.[0]?.payload as { nights?: number } | undefined; return `${l} · ${p?.nights ?? 0} nights booked so far`; }} />
                <Bar dataKey="projected" name="Projected revenue" fill="var(--chart-1)" fillOpacity={0.35} stroke="var(--chart-1)" strokeDasharray="4 3" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
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
    <Section title={`Monthly performance${periodSuffix(period)}`}>
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
// month. A spike is a misread meter first and a leak second. Both series are
// bars (actual) with a fitted trend line (session 17b, per Lloyd) so a slow
// creep reads clearly against month-to-month noise.
function useUtilityMonths(period: Period, toggles: Toggles) {
  const s = useSession();
  const from = period.start.slice(0, 7) + '-01';
  return useQuery({ queryKey: ['utility-months', s.propertyId, from, period.endExclusive, toggles.allReadings], queryFn: () => fetchUtilityMonths(s.propertyId, from, period.endExclusive, toggles.allReadings ? () => true : isConsumptionReading), staleTime: 300_000 });
}
function UtilitiesChart({ period, toggles }: { period: Period; toggles: Toggles }) {
  const nav = useNavigate();
  const q = useUtilityMonths(period, toggles);
  const rows = (q.data ?? []).map((m) => ({ ...m, label: formatDate(m.month + '-01', 'short').replace(/^\d+ /, ''), kwh: Math.round(m.kwh), m3: Math.round(m.m3 * 10) / 10 }));
  const kwhTrend = linearTrend(rows.map((r) => r.kwh));
  const m3Trend = linearTrend(rows.map((r) => r.m3));
  const data = rows.map((r, i) => ({ ...r, kwhTrend: kwhTrend[i], m3Trend: m3Trend[i] }));
  const excluded = data.reduce((a, m) => a + m.excluded, 0);
  const click = (e: unknown) => { const p = (e as { activePayload?: Array<{ payload: { month: string } }> }).activePayload?.[0]?.payload; if (p) nav(`/operations?from=${p.month}-01&to=${nextMonthStart(p.month)}`); };
  return (
    <Section title={`Utilities${periodSuffix(period)}`} aside={<Link to="/operations" className="text-xs text-primary hover:underline">Open the cleaning log</Link>}>
      {q.isPending ? <CardSkeleton /> : q.isError ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No meter readings in this period.</p>
      ) : (
        <div className="rounded-lg border bg-card p-3">
          <p className="mb-2 text-xs text-muted-foreground">Electricity (kWh) and water (m³) consumed per month, bars against a fitted trend line. {toggles.allReadings ? 'Every reading is summed, including first entries, negative re-entries and flagged rows.' : `First readings, negative re-entries and flagged rows are left out${excluded ? ` (${excluded} in this period)` : ''}.`} Click a month to open its cleanings.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Electricity (kWh)</p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} onClick={click} style={{ cursor: 'pointer' }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} width={40} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} formatter={(v, name) => [`${v} kWh`, name]} labelFormatter={(l, payload) => { const p = payload?.[0]?.payload as { readings?: number; excluded?: number } | undefined; return `${l} · ${p?.readings ?? 0} readings, ${p?.excluded ?? 0} left out`; }} />
                    <Bar dataKey="kwh" name="Electricity (kWh)" fill="var(--chart-5)" radius={[4, 4, 0, 0]} />
                    <Line type="linear" dataKey="kwhTrend" name="Trend" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} legendType="none" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Water (m³)</p>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }} onClick={click} style={{ cursor: 'pointer' }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} width={36} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--muted)' }} formatter={(v, name) => [`${v} m³`, name]} labelFormatter={(l, payload) => { const p = payload?.[0]?.payload as { readings?: number; excluded?: number } | undefined; return `${l} · ${p?.readings ?? 0} readings, ${p?.excluded ?? 0} left out`; }} />
                    <Bar dataKey="m3" name="Water (m³)" fill="var(--chart-3)" radius={[4, 4, 0, 0]} />
                    <Line type="linear" dataKey="m3Trend" name="Trend" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} legendType="none" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

// Consumption per occupied night (session 17b, per Lloyd): normalizes
// electricity/water by how many nights the unit was actually sold that
// month, so a rise in usage from more guests reads differently from a rise
// per guest (the second is the one worth investigating - a leak or waste,
// not just a busier month).
function ConsumptionEfficiency({ period, toggles }: { period: Period; toggles: Toggles }) {
  const s = useSession();
  const uq = useUtilityMonths(period, toggles);
  const months = monthsIn(period);
  const qs = useQueries({ queries: months.map((m) => ({ queryKey: ['metrics', s.propertyId, m.start, m.endExclusive], queryFn: () => fetchMetrics(s.propertyId, m.start, m.endExclusive), staleTime: 300_000 })) });
  const byMonth = new Map((uq.data ?? []).map((u) => [u.month, u]));
  const today = todayManila();
  const data = months.map((m, i) => {
    const u = byMonth.get(m.month);
    const nights = numOrNaN(qs[i]?.data?.metrics.sold_nights?.value) || 0;
    return { label: m.label, nights, complete: m.endExclusive <= today, kwhPerNight: u && nights > 0 ? Math.round((u.kwh / nights) * 10) / 10 : null, m3PerNight: u && nights > 0 ? Math.round((u.m3 / nights) * 100) / 100 : null };
  });
  const pending = uq.isPending || qs.some((q) => q.isPending);
  const withData = data.filter((d) => d.kwhPerNight !== null);
  // Compare the last COMPLETE month's rate against the average of the rest,
  // never the in-progress month: a partial month divides a real baseline load
  // (fridge, pool pump) by only a few nights so far and reads as a false spike
  // even with nothing wrong. Also skip a single busy/slow month comparing
  // against itself.
  const completeWithData = withData.filter((d) => d.complete);
  const last = completeWithData.at(-1);
  const priorAvg = completeWithData.length > 1 ? completeWithData.slice(0, -1).reduce((a, d) => a + (d.kwhPerNight ?? 0), 0) / (completeWithData.length - 1) : null;
  const flag = last && priorAvg && priorAvg > 0 ? ((last.kwhPerNight! - priorAvg) / priorAvg) * 100 : null;
  return (
    <Section title={`Consumption per occupied night${periodSuffix(period)}`}>
      {pending ? <CardSkeleton /> : withData.length < 2 ? (
        <p className="text-sm text-muted-foreground">Not enough months with both meter readings and sold nights yet.</p>
      ) : (
        <div className="rounded-lg border bg-card p-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Electricity and water divided by that month's sold nights - a rate, not a total, so it separates "more guests" from "each guest using more."
            {flag !== null && Math.abs(flag) >= 15 && (
              <span className={flag > 0 ? ' text-destructive' : ''}> {last!.label} ran {Math.abs(flag).toFixed(0)}% {flag > 0 ? 'more' : 'less'} electricity per occupied night than the months before it{flag > 0 ? ' - worth checking for a leak, AC left running, or a higher-occupancy stay (more people in the same unit also raises this rate)' : ''}.</span>
            )}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">kWh per occupied night</p>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} width={32} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [v === null ? 'no data' : `${v} kWh/night`, name]} labelFormatter={(l, payload) => { const p = payload?.[0]?.payload as { nights?: number } | undefined; return `${l} · ${p?.nights ?? 0} sold nights`; }} />
                    <Line type="monotone" dataKey="kwhPerNight" name="kWh/night" stroke="var(--chart-5)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">Water per occupied night</p>
              <div className="h-32">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="var(--border)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} width={32} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v, name) => [v === null ? 'no data' : `${v} m³/night`, name]} labelFormatter={(l, payload) => { const p = payload?.[0]?.payload as { nights?: number } | undefined; return `${l} · ${p?.nights ?? 0} sold nights`; }} />
                    <Line type="monotone" dataKey="m3PerNight" name="m³/night" stroke="var(--chart-3)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
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
            <MonthSnapshot />
            <PerformanceTrend period={chartPeriod} onDrill={setToken} />
            <MoneyTrend period={chartPeriod} toggles={toggles} />
            <DrawingsTrend period={chartPeriod} />
            <ForwardProjection fallbackAdr={numOrNaN(now.data?.metrics.adr?.value)} />
            <UtilitiesChart period={chartPeriod} toggles={toggles} />
            <ConsumptionEfficiency period={chartPeriod} toggles={toggles} />
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
