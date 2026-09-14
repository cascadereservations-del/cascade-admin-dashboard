import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { useUrlState } from '@/lib/url-state';
import { formatDate, todayManila } from '@/lib/dates';
import { formatPHP } from '@/lib/money';
import { exportCsv } from '@/lib/export';
import { toAppError } from '@/lib/errors';
import { newIdempotencyKey } from '@/lib/idempotency';
import { softDelete, useUndoToast } from '@/lib/undo';
import { PageHeader } from '@/components/data/page-header';
import { FilterBar, FilterSelect } from '@/components/data/filter-bar';
import { DataTable } from '@/components/data/data-table';
import { EmptyState, QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { DetailSheet } from '@/components/data/detail-sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchTransactions, saveTransaction, type Txn, type TxnDraft } from './api';

// Historical operational ledger (transactions table). Rows before the
// accounting start are historical data, not posted journals. Manual rows are
// created, edited and voided through admin_save_transaction_v1 /
// admin_soft_delete_v1; every write lands in Settings → Audit history with undo.

const DEFAULTS = { q: '', type: '', status: '', source: '', from: '', to: '', page: '1', density: 'comfortable', mirror: '', edit: '' };
const SOURCES = ['airbnb', 'airbnb_email', 'airbnb_payout_email', 'direct_booking', 'manual', 'ocr', 'telegram', 'refund', 'cleaner_fee'];
const CATEGORIES: Record<string, string[]> = {
  expense: ['cleaning', 'supplies', 'utilities', 'internet', 'subscription', 'maintenance', 'furnishing', 'cohost_fee', 'guest_refund', 'airbnb_adjustment', 'loan', 'other'],
  income: ['airbnb_income', 'direct_income', 'other'],
  drawing: ['owner_drawing', 'transfer_to_owner', 'other'],
};

type Draft = TxnDraft & { gross_amount: string };
const blank = (): Draft => ({ txn_type: 'expense', category: 'other', transaction_date: todayManila(), gross_amount: '', payee_name: '', notes: '', or_number: '', reason: '' });

export default function TransactionsPage() {
  const s = useSession();
  const qc = useQueryClient();
  const undoToast = useUndoToast();
  const { state, set, reset, activeFilterCount } = useUrlState(DEFAULTS);
  const canWrite = s.caps.can('approve_payment');
  const query = useQuery({ queryKey: ['transactions', s.propertyId, state], queryFn: () => fetchTransactions(s.propertyId, state) });
  const density = state.density === 'compact' ? 'compact' : 'comfortable';
  const [draft, setDraft] = useState<Draft | null>(null);
  const [key, setKey] = useState(() => newIdempotencyKey('txn'));
  const [voidReason, setVoidReason] = useState('');

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['transactions'] });
    void qc.invalidateQueries({ queryKey: ['ledger-book'] });
    void qc.invalidateQueries({ queryKey: ['monthly-totals'] });
    void qc.invalidateQueries({ queryKey: ['overview'] });
    void qc.invalidateQueries({ queryKey: ['audit-feed'] });
  };
  const save = useMutation({
    mutationFn: (d: Draft) => saveTransaction(s.propertyId, d, key),
    onSuccess: (r, d) => {
      undoToast(d.id ? 'Transaction updated' : 'Transaction recorded', r.auditId, `${formatPHP(d.gross_amount)} · ${d.txn_type} · ${formatDate(d.transaction_date, 'long')}`);
      setDraft(null); setKey(newIdempotencyKey('txn')); invalidate();
    },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const doVoid = useMutation({
    mutationFn: (id: string) => softDelete('transactions', id, voidReason),
    onSuccess: (r) => { undoToast('Transaction voided', r.auditId); setDraft(null); setVoidReason(''); invalidate(); },
    onError: (e) => toast.error(toAppError(e).message),
  });

  const open = (t?: Txn) => {
    setKey(newIdempotencyKey('txn'));
    setVoidReason('');
    setDraft(t ? { id: t.id, txn_type: t.txn_type, category: t.category, transaction_date: t.transaction_date, gross_amount: t.gross_amount, payee_name: t.payee_name ?? '', notes: t.notes ?? '', or_number: t.or_number ?? '', reservation_id: t.reservation_id, reason: '' } : blank());
  };

  const columns = useMemo<ColumnDef<Txn, unknown>[]>(() => [
    { id: 'date', header: 'Date', accessorFn: (r) => r.transaction_date, cell: ({ row }) => <span className="tabular">{formatDate(row.original.transaction_date, 'long')}</span> },
    { id: 'type', header: 'Type', accessorFn: (r) => r.txn_type, cell: ({ row }) => <span className="capitalize">{row.original.txn_type}</span> },
    { id: 'category', header: 'Category', accessorFn: (r) => r.category },
    { id: 'source', header: 'Source', accessorFn: (r) => r.source, cell: ({ row }) => <span className="text-xs">{row.original.source}{row.original.income_stage ? ` · ${row.original.income_stage}` : ''}</span> },
    { id: 'payee', header: 'Payee / ref', accessorFn: (r) => r.payee_name ?? r.external_ref ?? '', cell: ({ row }) => <span className="text-xs">{row.original.payee_name ?? ''}{row.original.external_ref ? ` ${row.original.external_ref}` : ''}</span> },
    { id: 'status', header: 'Status', accessorFn: (r) => r.status, cell: ({ row }) => <StatusBadge tone={row.original.status === 'confirmed' ? 'good' : row.original.status === 'void' ? 'neutral' : 'warn'}>{row.original.status.replace('_', ' ')}</StatusBadge> },
    { id: 'amount', header: 'Amount', accessorFn: (r) => Number(r.gross_amount), cell: ({ row }) => <span className={`tabular ${row.original.txn_type === 'income' ? 'font-medium' : ''}`}>{formatPHP(row.original.gross_amount)}</span> },
  ], []);
  const doExport = async () => {
    const all = await fetchTransactions(s.propertyId, { ...state, page: '1' });
    exportCsv(`transactions-${state.from || 'all'}-${state.to || 'all'}.csv`, all.rows as unknown as Record<string, unknown>[], {
      property: s.propertyId, period: `${state.from || 'start'}..${state.to || 'now'}`, basis: 'operational ledger (not accrual)', generated: new Date().toISOString(), completeness: `first page of ${all.total} rows`,
    });
  };
  const isVoid = draft?.id ? query.data?.rows.find((r) => r.id === draft.id)?.status === 'void' : false;
  return (
    <div>
      <PageHeader title="Transactions" description="Historical operational ledger from e-mail ingestion, OCR receipts, Telegram and manual entry. Void rows are kept for audit; every change here is undoable from Settings → Audit history." actions={<><Button variant="outline" onClick={() => void doExport()}>Export CSV</Button>{canWrite && <Button onClick={() => open()}>New transaction</Button>}</>} />
      <FilterBar search={state.q} onSearch={(q) => set({ q })} searchPlaceholder="Payee, reference, category" activeCount={activeFilterCount} onClear={reset} density={density} onDensity={(d) => set({ density: d })}>
        <FilterSelect label="Type" value={state.type || undefined} onChange={(v) => set({ type: v ?? '' })} options={[{ value: 'income', label: 'Income' }, { value: 'expense', label: 'Expense' }, { value: 'drawing', label: 'Drawing' }]} />
        <FilterSelect label="Status" value={state.status || undefined} onChange={(v) => set({ status: v ?? '' })} options={['confirmed', 'pending_review', 'void'].map((v) => ({ value: v, label: v.replace('_', ' ') }))} />
        <FilterSelect label="Source" value={state.source || undefined} onChange={(v) => set({ source: v ?? '' })} options={SOURCES.map((v) => ({ value: v, label: v }))} />
        <FilterSelect label="Archived mirrors" value={state.mirror || undefined} onChange={(v) => set({ mirror: v ?? '' })} options={[{ value: 'show', label: 'Show estimates and CSV mirrors' }]} />
        <Input type="date" aria-label="From" className="w-40 text-base sm:text-sm" value={state.from} onChange={(e) => set({ from: e.target.value })} />
        <Input type="date" aria-label="To (exclusive)" className="w-40 text-base sm:text-sm" value={state.to} onChange={(e) => set({ to: e.target.value })} />
      </FilterBar>
      <QueryState query={query}>
        {(d) => d.rows.length === 0 ? <EmptyState title="No transactions match" action={<Button size="sm" variant="outline" onClick={reset}>Clear filters</Button>} /> : (
          <DataTable columns={columns} rows={d.rows} total={d.total} page={d.page} onPageChange={(p) => set({ page: String(p) })} density={density} caption="Transactions" getRowId={(r) => r.id} onRowClick={canWrite ? (r) => open(r) : undefined} />
        )}
      </QueryState>
      <DetailSheet open={!!draft} onOpenChange={(o) => !o && setDraft(null)} title={draft?.id ? 'Edit transaction' : 'New transaction'} description={draft?.id ? 'Edits need a reason and are recorded with before and after values.' : 'Manual rows are confirmed immediately and can be undone from the toast or the audit history.'}>
        {draft && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(draft); }}>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type</Label><Select value={draft.txn_type} onValueChange={(v) => setDraft({ ...draft, txn_type: v, category: CATEGORIES[v]?.[0] ?? 'other' })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['expense', 'income', 'drawing'].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Category</Label><Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[...new Set([...(CATEGORIES[draft.txn_type] ?? []), draft.category].filter(Boolean))].map((v) => <SelectItem key={v} value={v}>{v.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select></div>
              <div><Label htmlFor="tx-date">Date</Label><Input id="tx-date" type="date" required value={draft.transaction_date} onChange={(e) => setDraft({ ...draft, transaction_date: e.target.value })} className="text-base" /></div>
              <div><Label htmlFor="tx-amt">Amount (PHP)</Label><Input id="tx-amt" inputMode="decimal" required value={draft.gross_amount} onChange={(e) => setDraft({ ...draft, gross_amount: e.target.value })} className="text-base" /></div>
            </div>
            <div><Label htmlFor="tx-payee">Payee</Label><Input id="tx-payee" value={draft.payee_name ?? ''} onChange={(e) => setDraft({ ...draft, payee_name: e.target.value })} className="text-base" /></div>
            <div><Label htmlFor="tx-or">OR / reference</Label><Input id="tx-or" value={draft.or_number ?? ''} onChange={(e) => setDraft({ ...draft, or_number: e.target.value })} className="text-base" /></div>
            <div><Label htmlFor="tx-notes">Notes</Label><Textarea id="tx-notes" value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className="text-base" /></div>
            {draft.id && <div><Label htmlFor="tx-reason">Reason for change (required)</Label><Input id="tx-reason" required minLength={3} value={draft.reason ?? ''} onChange={(e) => setDraft({ ...draft, reason: e.target.value })} className="text-base" /></div>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDraft(null)}>Cancel</Button>
              {!isVoid && <Button type="submit" disabled={save.isPending || !draft.gross_amount}>{save.isPending ? 'Saving…' : 'Save'}</Button>}
            </div>
            {draft.id && !isVoid && (
              <div className="mt-4 space-y-2 rounded-lg border border-destructive/40 p-3">
                <p className="text-sm font-medium">Void this transaction</p>
                <Input aria-label="Void reason" placeholder="Reason (required)" value={voidReason} onChange={(e) => setVoidReason(e.target.value)} className="text-base" />
                <Button type="button" variant="destructive" size="sm" disabled={voidReason.trim().length < 3 || doVoid.isPending} onClick={() => doVoid.mutate(draft.id!)}>Void</Button>
              </div>
            )}
            {isVoid && <p className="text-sm text-muted-foreground">This row is void. Undo the void from Settings → Audit history to bring it back.</p>}
          </form>
        )}
      </DetailSheet>
    </div>
  );
}
