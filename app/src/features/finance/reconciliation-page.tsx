import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/auth/session';
import { useUrlState } from '@/lib/url-state';
import { addDecimal, formatPHP } from '@/lib/money';
import { formatDate, periodPreset, todayManila } from '@/lib/dates';
import { PageHeader, Section } from '@/components/data/page-header';
import { QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { Input } from '@/components/ui/input';
import { fetchReconciliationRows } from './api';
import { fetchMetrics } from '@/features/insights/api';

// P21 source reconciliation workbench for A01/A02/A06. The two legacy bases
// (reservation host_payout by payout/checkout date vs confirmed payout e-mail
// rows by transaction date) are compared row by row so every difference has a
// named cause. Page sums are over the fetched rows; the authoritative period
// figures come from get_hospitality_metrics_v1 and are shown beside them.

function nextMonthStart(today: string): string {
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
}

export default function ReconciliationPage() {
  const s = useSession();
  const ytd = periodPreset('ytd');
  const { state, set } = useUrlState({ from: ytd.start, to: nextMonthStart(todayManila()) });
  const rows = useQuery({ queryKey: ['recon', s.propertyId, state.from, state.to], queryFn: () => fetchReconciliationRows(s.propertyId, state.from, state.to) });
  const metrics = useQuery({ queryKey: ['metrics', s.propertyId, state.from, state.to], queryFn: () => fetchMetrics(s.propertyId, state.from, state.to) });
  return (
    <div>
      <PageHeader title="Source reconciliation" description="Explains why the reservation-based and payout-e-mail-based totals differ. Every row is an exception until matched." actions={<div className="flex gap-2"><Input type="date" aria-label="From" className="w-40" value={state.from} onChange={(e) => set({ from: e.target.value })} /><Input type="date" aria-label="To (exclusive)" className="w-40" value={state.to} onChange={(e) => set({ to: e.target.value })} /></div>} />
      <QueryState query={rows}>
        {(d) => {
          const inWindow = (dt: string | null) => !!dt && dt >= state.from && dt < state.to;
          const legacy = d.reservations.filter((r) => inWindow(r.payout_date ?? r.checkout_date ?? null));
          const legacySum = addDecimal(...legacy.map((r) => r.host_payout ?? null));
          const payouts = d.income.filter((t) => t.source === 'airbnb_payout_email' && t.status === 'confirmed' && t.income_stage === 'confirmed');
          const payoutSum = addDecimal(...payouts.map((t) => t.gross_amount));
          const direct = d.income.filter((t) => t.status === 'confirmed' && !['airbnb', 'airbnb_email', 'airbnb_payout_email'].includes(t.source ?? ''));
          const directSum = addDecimal(...direct.map((t) => t.gross_amount));
          const byCode = new Map(payouts.map((t) => [t.external_ref ?? '', t]));
          const unmatchedRes = legacy.filter((r) => !byCode.has(r.confirmation_code ?? ''));
          const resCodes = new Set(legacy.map((r) => r.confirmation_code));
          const unmatchedPayouts = payouts.filter((t) => !resCodes.has(t.external_ref ?? ''));
          const noPayoutDate = d.reservations.filter((r) => !r.payout_date && inWindow(r.checkout_date ?? null));
          const cash = metrics.data?.metrics.cash_received;
          return (
            <div className="space-y-6">
              <div className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg border p-3"><p className="text-muted-foreground">Legacy overview basis (host payout by payout/checkout date)</p><p className="tabular text-xl font-semibold">{formatPHP(legacySum)}</p><p className="text-xs text-muted-foreground">{legacy.length} reservations · client sum of fetched rows</p></div>
                <div className="rounded-lg border p-3"><p className="text-muted-foreground">Payout e-mail basis (v_canonical_ledger income)</p><p className="tabular text-xl font-semibold">{formatPHP(payoutSum)}</p><p className="text-xs text-muted-foreground">{payouts.length} confirmed payout rows</p></div>
                <div className="rounded-lg border p-3"><p className="text-muted-foreground">Direct income excluded by the ledger view (A02)</p><p className="tabular text-xl font-semibold">{formatPHP(directSum)}</p><p className="text-xs text-muted-foreground">{direct.length} rows</p></div>
                <div className="rounded-lg border p-3"><p className="text-muted-foreground">Authoritative cash received (server)</p><p className="tabular text-xl font-semibold">{cash?.value ? formatPHP(cash.value) : 'Not available'}</p><p className="text-xs text-muted-foreground">{cash ? `${cash.includedCount} rows · ${cash.coverage}` : metrics.isError ? 'metric service unavailable' : 'loading'}</p></div>
              </div>
              <p className="text-sm">Difference between the two legacy bases: <span className="tabular font-medium">{formatPHP(addDecimal(legacySum, `-${payoutSum}`))}</span>. It is explained by the exception lists below, not by a hidden adjustment.</p>
              <Section title={`Reservations with no matching payout e-mail (${unmatchedRes.length})`}>
                {unmatchedRes.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : <ul className="divide-y rounded-lg border text-sm">{unmatchedRes.map((r) => <li key={r.id} className="flex flex-wrap gap-2 px-3 py-1.5"><span className="tabular w-24">{r.confirmation_code}</span><span className="min-w-0 flex-1">{r.guest_name} · {formatDate(r.checkin_date)} → {formatDate(r.checkout_date)}</span><StatusBadge tone={r.payout_date ? 'info' : 'warn'}>{r.payout_date ? 'payout date, no e-mail row' : 'expected payout'}</StatusBadge><span className="tabular">{formatPHP(r.host_payout)}</span></li>)}</ul>}
              </Section>
              <Section title={`Payout e-mail rows with no reservation in the window (${unmatchedPayouts.length})`}>
                {unmatchedPayouts.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : <ul className="divide-y rounded-lg border text-sm">{unmatchedPayouts.map((t) => <li key={t.id} className="flex flex-wrap gap-2 px-3 py-1.5"><span className="tabular w-24">{formatDate(t.transaction_date, 'long')}</span><span className="min-w-0 flex-1">{t.external_ref ?? 'no reference'} · {t.category}</span><span className="tabular">{formatPHP(t.gross_amount)}</span></li>)}</ul>}
              </Section>
              <Section title={`Reservations checked out in window without a payout date (A06: ${noPayoutDate.length})`}>
                {noPayoutDate.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : <ul className="divide-y rounded-lg border text-sm">{noPayoutDate.map((r) => <li key={r.id} className="flex flex-wrap gap-2 px-3 py-1.5"><span className="tabular w-24">{r.confirmation_code}</span><span className="min-w-0 flex-1">{r.guest_name} · checkout {formatDate(r.checkout_date, 'long')}</span><StatusBadge tone="warn">expected, not recorded</StatusBadge><span className="tabular">{formatPHP(r.host_payout)}</span></li>)}</ul>}
              </Section>
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
