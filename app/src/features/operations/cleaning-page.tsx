import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, Circle } from 'lucide-react';
import { useSession } from '@/auth/session';
import { useUrlState } from '@/lib/url-state';
import { formatDate, formatDateTime } from '@/lib/dates';
import { formatPHP } from '@/lib/money';
import { PageHeader } from '@/components/data/page-header';
import { FilterBar, FilterSelect } from '@/components/data/filter-bar';
import { DataTable } from '@/components/data/data-table';
import { EmptyState, QueryState } from '@/components/data/query-state';
import { Freshness } from '@/components/data/freshness';
import { StatusBadge } from '@/components/data/status-badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fetchCleanings, type CleaningRow } from './api';

// CLN01/CLN03: the register shows submission completeness, evidence, review
// and payment states separately. Fee columns render only for finance roles.

const DEFAULTS = { q: '', state: '', fees: '', from: '', to: '', page: '1', density: 'comfortable' };

export default function CleaningPage() {
  const s = useSession();
  const nav = useNavigate();
  const { state, set, reset, activeFilterCount } = useUrlState(DEFAULTS);
  const canFees = s.caps.can('read_finance');
  const query = useQuery({ queryKey: ['cleanings', s.propertyId, state, canFees], queryFn: () => fetchCleanings(s.propertyId, state, canFees) });
  const density = state.density === 'compact' ? 'compact' : 'comfortable';

  const columns = useMemo<ColumnDef<CleaningRow, unknown>[]>(() => {
    const cols: ColumnDef<CleaningRow, unknown>[] = [
      { id: 'when', header: 'Cleaned', accessorFn: (r) => r.cleaned_at, cell: ({ row }) => <Link to={`/operations/cleaning/${row.original.id}`} className="tabular font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{formatDateTime(row.original.cleaned_at)}</Link> },
      { id: 'stay', header: 'Stay', accessorFn: (r) => r.last_guest_name ?? '', cell: ({ row }) => <div>{row.original.last_guest_name ?? 'Unknown guest'}<div className="text-xs text-muted-foreground">{row.original.checkin_date ? `${formatDate(row.original.checkin_date)} → ${formatDate(row.original.checkout_date)}` : 'dates not recorded'}</div></div> },
      { id: 'cleaner', header: 'Cleaner', accessorFn: (r) => r.cleaner_name },
      { id: 'type', header: 'Type', accessorFn: (r) => r.cleaning_type ?? '', cell: ({ row }) => row.original.cleaning_type ?? '—' },
      { id: 'submission', header: 'Submission', accessorFn: (r) => r.is_complete, cell: ({ row }) => <StatusBadge tone={row.original.is_complete ? 'good' : row.original.is_complete === false ? 'warn' : 'neutral'}>{row.original.is_complete === null ? 'unknown' : row.original.is_complete ? 'complete' : 'incomplete'}</StatusBadge> },
      { id: 'checklist', header: 'Checklist', accessorFn: (r) => r.completion_pct, cell: ({ row }) => <span className="tabular">{row.original.completion_pct !== null ? `${Number(row.original.completion_pct).toFixed(0)}%` : '—'}</span> },
      { id: 'evidence', header: 'Evidence', accessorFn: (r) => r.total_photo_count, cell: ({ row }) => <span className="tabular text-xs">{row.original.total_photo_count ?? 0} photos · {row.original.meter_photo_count ?? 0} meter</span> },
      { id: 'issues', header: 'Issues', accessorFn: (r) => r.issue_count, cell: ({ row }) => (row.original.issue_count ? <StatusBadge tone="warn">{row.original.issue_count} issue{row.original.issue_count > 1 ? 's' : ''}</StatusBadge> : <span className="text-xs text-muted-foreground">none</span>) },
    ];
    if (canFees) {
      cols.push({ id: 'fee', header: 'Fee', accessorFn: (r) => r.fee_amount ?? '', cell: ({ row }) => <span className="tabular">{formatPHP(row.original.fee_amount)}</span> });
      cols.push({ id: 'paid', header: 'Paid', accessorFn: (r) => r.fee_paid_at ?? '', cell: ({ row }) => (row.original.fee_amount ? (
        row.original.fee_paid_at
          ? <span className="inline-flex items-center gap-1 text-sm text-chart-4"><CheckCircle2 className="size-4" aria-hidden /> Paid <span className="text-xs text-muted-foreground">{formatDate(row.original.fee_paid_at.slice(0, 10))}</span></span>
          : <span className="inline-flex items-center gap-1 text-sm"><Circle className="size-4 text-champagne" aria-hidden /> Unpaid</span>
      ) : <span className="text-xs text-muted-foreground">no fee</span>) });
    }
    return cols;
  }, [canFees]);

  return (
    <div>
      <PageHeader title="Cleaning log" description="Every submission with its checklist, evidence, review and payment states shown separately." actions={<Button variant="outline" asChild><Link to="/operations/work-orders">Work orders</Link></Button>} />
      <FilterBar search={state.q} onSearch={(q) => set({ q })} searchPlaceholder="Guest, cleaner or submission" activeCount={activeFilterCount} onClear={reset} density={density} onDensity={(d) => set({ density: d })}>
        <FilterSelect label="Submission" value={state.state || undefined} onChange={(v) => set({ state: v ?? '' })} options={[{ value: 'complete', label: 'Complete' }, { value: 'incomplete', label: 'Incomplete' }, { value: 'issues', label: 'With issues' }]} />
        {canFees && <FilterSelect label="Fees" value={state.fees || undefined} onChange={(v) => set({ fees: v ?? '' })} options={[{ value: 'unpaid', label: 'Unpaid' }]} />}
        <Input type="date" aria-label="From" className="w-40 text-base sm:text-sm" value={state.from} onChange={(e) => set({ from: e.target.value })} />
        <Input type="date" aria-label="To" className="w-40 text-base sm:text-sm" value={state.to} onChange={(e) => set({ to: e.target.value })} />
      </FilterBar>
      <QueryState query={query}>
        {(data) =>
          data.rows.length === 0 ? (
            <EmptyState title={activeFilterCount ? 'No cleaning reports match' : 'No cleaning reports yet'} action={activeFilterCount ? <Button size="sm" variant="outline" onClick={reset}>Clear filters</Button> : undefined} />
          ) : (
            <div className="space-y-2">
              <DataTable columns={columns} rows={data.rows} total={data.total} page={data.page} onPageChange={(p) => set({ page: String(p) })} density={density} onRowClick={(r) => nav(`/operations/cleaning/${r.id}`)} caption="Cleaning register" getRowId={(r) => r.id} />
              <Freshness sourceAsOf={data.sourceAsOf} label="Latest submission" />
            </div>
          )
        }
      </QueryState>
    </div>
  );
}
