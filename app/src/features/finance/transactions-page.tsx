import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useSession } from '@/auth/session';
import { useUrlState } from '@/lib/url-state';
import { formatDate } from '@/lib/dates';
import { formatPHP } from '@/lib/money';
import { exportCsv } from '@/lib/export';
import { PageHeader } from '@/components/data/page-header';
import { FilterBar, FilterSelect } from '@/components/data/filter-bar';
import { DataTable } from '@/components/data/data-table';
import { EmptyState, QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { fetchTransactions, type Txn } from './api';

// Historical operational ledger (transactions table). Labelled as such: rows
// before the accounting start are historical data, not posted journals.

const DEFAULTS = { q: '', type: '', status: '', source: '', from: '', to: '', page: '1', density: 'comfortable' };
const SOURCES = ['airbnb', 'airbnb_email', 'airbnb_payout_email', 'direct_booking', 'manual', 'ocr', 'telegram', 'refund', 'cleaner_fee'];

export default function TransactionsPage() {
  const s = useSession();
  const { state, set, reset, activeFilterCount } = useUrlState(DEFAULTS);
  const query = useQuery({ queryKey: ['transactions', s.propertyId, state], queryFn: () => fetchTransactions(s.propertyId, state) });
  const density = state.density === 'compact' ? 'compact' : 'comfortable';
  const columns = useMemo<ColumnDef<Txn, unknown>[]>(() => [
    { id: 'date', header: 'Date', accessorFn: (r) => r.transaction_date, cell: ({ row }) => <span className="tabular">{formatDate(row.original.transaction_date, 'long')}</span> },
    { id: 'type', header: 'Type', accessorFn: (r) => r.txn_type, cell: ({ row }) => <span className="capitalize">{row.original.txn_type}</span> },
    { id: 'category', header: 'Category', accessorFn: (r) => r.category },
    { id: 'source', header: 'Source', accessorFn: (r) => r.source, cell: ({ row }) => <span className="text-xs">{row.original.source}{row.original.income_stage ? ` · ${row.original.income_stage}` : ''}</span> },
    { id: 'payee', header: 'Payee / ref', accessorFn: (r) => r.payee_name ?? r.external_ref ?? '', cell: ({ row }) => <span className="text-xs">{row.original.payee_name ?? ''}{row.original.external_ref ? ` ${row.original.external_ref}` : ''}</span> },
    { id: 'status', header: 'Status', accessorFn: (r) => r.status, cell: ({ row }) => <StatusBadge tone={row.original.status === 'confirmed' ? 'good' : row.original.status === 'void' ? 'neutral' : 'warn'}>{row.original.status.replace('_', ' ')}</StatusBadge> },
    { id: 'amount', header: 'Amount', accessorFn: (r) => Number(r.gross_amount), cell: ({ row }) => <span className={`tabular ${row.original.txn_type === 'expense' ? '' : 'font-medium'}`}>{formatPHP(row.original.gross_amount)}</span> },
  ], []);
  const doExport = async () => {
    const all = await fetchTransactions(s.propertyId, { ...state, page: '1' });
    exportCsv(`transactions-${state.from || 'all'}-${state.to || 'all'}.csv`, all.rows as unknown as Record<string, unknown>[], {
      property: s.propertyId, period: `${state.from || 'start'}..${state.to || 'now'}`, basis: 'operational ledger (not accrual)', generated: new Date().toISOString(), completeness: `first page of ${all.total} rows`,
    });
  };
  return (
    <div>
      <PageHeader title="Transactions" description="Historical operational ledger from e-mail ingestion, OCR receipts, Telegram and manual entry. Void rows are kept for audit." actions={<Button variant="outline" onClick={() => void doExport()}>Export CSV</Button>} />
      <FilterBar search={state.q} onSearch={(q) => set({ q })} searchPlaceholder="Payee, reference, category" activeCount={activeFilterCount} onClear={reset} density={density} onDensity={(d) => set({ density: d })}>
        <FilterSelect label="Type" value={state.type || undefined} onChange={(v) => set({ type: v ?? '' })} options={[{ value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' }]} />
        <FilterSelect label="Status" value={state.status || undefined} onChange={(v) => set({ status: v ?? '' })} options={['confirmed', 'pending_review', 'void'].map((v) => ({ value: v, label: v.replace('_', ' ') }))} />
        <FilterSelect label="Source" value={state.source || undefined} onChange={(v) => set({ source: v ?? '' })} options={SOURCES.map((v) => ({ value: v, label: v }))} />
        <Input type="date" aria-label="From" className="w-40 text-base sm:text-sm" value={state.from} onChange={(e) => set({ from: e.target.value })} />
        <Input type="date" aria-label="To (exclusive)" className="w-40 text-base sm:text-sm" value={state.to} onChange={(e) => set({ to: e.target.value })} />
      </FilterBar>
      <QueryState query={query}>
        {(d) => d.rows.length === 0 ? <EmptyState title="No transactions match" action={<Button size="sm" variant="outline" onClick={reset}>Clear filters</Button>} /> : (
          <DataTable columns={columns} rows={d.rows} total={d.total} page={d.page} onPageChange={(p) => set({ page: String(p) })} density={density} caption="Transactions" getRowId={(r) => r.id} />
        )}
      </QueryState>
    </div>
  );
}
