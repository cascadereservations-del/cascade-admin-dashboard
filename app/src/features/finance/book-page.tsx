import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import { useSession } from '@/auth/session';
import { useUrlState } from '@/lib/url-state';
import { formatDate } from '@/lib/dates';
import { formatPHP, fromCentavos } from '@/lib/money';
import { exportCsv } from '@/lib/export';
import { PageHeader } from '@/components/data/page-header';
import { FilterBar } from '@/components/data/filter-bar';
import { EmptyState, QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fetchLedgerBook, type BookRow } from './api';

// Account book (D-095): the operational ledger the way a cash book reads.
// Oldest first, money in and money out in their own columns, running balance.
// Void rows are excluded; pending-review rows are shown only when asked and
// are visibly marked, because the balance is then not yet reviewed.

const DEFAULTS = { from: '', to: '', pending: '0', q: '' };

function particulars(r: BookRow): string {
  const bits = [r.payee_name, r.category, r.source.replaceAll('_', ' ')].filter(Boolean);
  return bits.join(' · ');
}

export default function AccountBookPage() {
  const s = useSession();
  const { state, set, reset, activeFilterCount } = useUrlState(DEFAULTS);
  const includePending = state.pending === '1';
  const query = useQuery({
    queryKey: ['ledger-book', s.propertyId, state.from, state.to, includePending],
    queryFn: () => fetchLedgerBook(s.propertyId, { from: state.from, to: state.to, includePending }),
  });
  const q = state.q.trim().toLowerCase();
  const rows = useMemo(() => {
    const all = query.data?.rows ?? [];
    if (!q) return all;
    return all.filter((r) => particulars(r).toLowerCase().includes(q) || (r.external_ref ?? '').toLowerCase().includes(q) || (r.or_number ?? '').toLowerCase().includes(q));
  }, [query.data, q]);
  const totals = useMemo(() => rows.reduce((a, r) => ({ inC: a.inC + r.inCents, outC: a.outC + r.outCents }), { inC: 0, outC: 0 }), [rows]);

  const doExport = () => {
    exportCsv(`account-book-${state.from || 'start'}-${state.to || 'now'}.csv`, rows.map((r) => ({
      date: r.transaction_date, particulars: particulars(r), reference: r.external_ref ?? r.or_number ?? '', status: r.status,
      money_in: r.inCents ? fromCentavos(r.inCents) : '', money_out: r.outCents ? fromCentavos(r.outCents) : '', balance: fromCentavos(r.balanceCents),
    })), { property: s.propertyId, period: `${state.from || 'start'}..${state.to || 'now'}`, basis: includePending ? 'confirmed and pending rows, operational ledger' : 'confirmed rows, operational ledger', generated: new Date().toISOString() });
  };

  return (
    <div>
      <PageHeader
        title="Account book"
        description="Every confirmed movement of money, oldest first, with a running balance. Cash basis from the operational ledger, not the accrual journals."
        actions={<Button variant="outline" onClick={doExport} disabled={rows.length === 0}>Export CSV</Button>}
      />
      <FilterBar search={state.q} onSearch={(v) => set({ q: v })} searchPlaceholder="Payee, category, reference" activeCount={activeFilterCount} onClear={reset}>
        <Input type="date" aria-label="From" className="w-40 text-base sm:text-sm" value={state.from} onChange={(e) => set({ from: e.target.value })} />
        <Input type="date" aria-label="To (exclusive)" className="w-40 text-base sm:text-sm" value={state.to} onChange={(e) => set({ to: e.target.value })} />
        <div className="flex items-center gap-2">
          <Switch id="pending" checked={includePending} onCheckedChange={(v) => set({ pending: v ? '1' : '0' })} />
          <Label htmlFor="pending" className="text-sm font-normal">Include pending review</Label>
        </div>
      </FilterBar>
      <QueryState query={query}>
        {(d) => rows.length === 0 ? <EmptyState title="No entries in this period" action={<Button size="sm" variant="outline" onClick={reset}>Clear filters</Button>} /> : (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">Money in</p>
                <p className="tabular text-xl font-semibold text-chart-4">{formatPHP(fromCentavos(totals.inC))}</p>
              </div>
              <div className="rounded-lg border bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">Money out</p>
                <p className="tabular text-xl font-semibold">{formatPHP(fromCentavos(totals.outC))}</p>
              </div>
              <div className="rounded-lg border bg-card px-4 py-3">
                <p className="text-xs text-muted-foreground">Net for the period</p>
                <p className={`tabular text-xl font-semibold ${totals.inC - totals.outC < 0 ? 'text-destructive' : ''}`}>{formatPHP(fromCentavos(totals.inC - totals.outC))}</p>
              </div>
            </div>
            {d.truncated && <p className="text-xs text-destructive">Only the first {d.rows.length} of {d.total} rows are shown; narrow the period for an exact balance.</p>}
            <div className="overflow-x-auto rounded-lg border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-28">Date</TableHead>
                    <TableHead>Particulars</TableHead>
                    <TableHead className="w-36">Reference</TableHead>
                    <TableHead className="w-32 text-right">In</TableHead>
                    <TableHead className="w-32 text-right">Out</TableHead>
                    <TableHead className="w-36 text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className={r.status !== 'confirmed' ? 'bg-accent/40' : undefined}>
                      <TableCell className="tabular whitespace-nowrap text-muted-foreground">{formatDate(r.transaction_date)}</TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-1.5">
                          {r.inCents ? <ArrowDownLeft className="size-3.5 text-chart-4" aria-label="money in" /> : <ArrowUpRight className="size-3.5 text-muted-foreground" aria-label="money out" />}
                          <span>{particulars(r)}</span>
                          {r.status !== 'confirmed' && <StatusBadge tone="warn">{r.status.replace('_', ' ')}</StatusBadge>}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.external_ref ?? r.or_number ?? ''}</TableCell>
                      <TableCell className="tabular text-right">{r.inCents ? formatPHP(fromCentavos(r.inCents)) : ''}</TableCell>
                      <TableCell className="tabular text-right">{r.outCents ? formatPHP(fromCentavos(r.outCents)) : ''}</TableCell>
                      <TableCell className={`tabular text-right font-medium ${r.balanceCents < 0 ? 'text-destructive' : ''}`}>{formatPHP(fromCentavos(r.balanceCents))}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">{rows.length} entries. The running balance starts at zero on the first entry shown; set a start date to read from a known opening position.</p>
          </div>
        )}
      </QueryState>
    </div>
  );
}
