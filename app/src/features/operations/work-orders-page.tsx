import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { useUrlState } from '@/lib/url-state';
import { formatDateTime } from '@/lib/dates';
import { toAppError } from '@/lib/errors';
import { newIdempotencyKey } from '@/lib/idempotency';
import { softDelete, useUndoToast } from '@/lib/undo';
import { PageHeader } from '@/components/data/page-header';
import { FilterSelect, FilterBar } from '@/components/data/filter-bar';
import { EmptyState, QueryState } from '@/components/data/query-state';
import { StatusBadge, type Tone } from '@/components/data/status-badge';
import { DetailSheet } from '@/components/data/detail-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchWorkOrders, latestAuditId, saveWorkOrder, type WorkOrder } from './api';

// OPS01 work orders: open → in progress → awaiting external → resolved.
// Blocking work feeds readiness. Resolution requires a note.

const DEFAULTS = { status: 'open', id: '' };
const STATUSES = ['open', 'in_progress', 'awaiting_external', 'resolved', 'cancelled'];
const tone = (st: string): Tone => (st === 'resolved' ? 'good' : st === 'cancelled' ? 'neutral' : st === 'awaiting_external' ? 'info' : 'warn');

type Draft = { id?: string; expected_version?: number; title: string; description: string; priority: string; due_at: string; blocks_arrival: boolean; status: string; resolution: string };
const blank: Draft = { title: '', description: '', priority: 'normal', due_at: '', blocks_arrival: false, status: 'open', resolution: '' };

export default function WorkOrdersPage() {
  const s = useSession();
  const qc = useQueryClient();
  const { state, set, reset, activeFilterCount } = useUrlState(DEFAULTS);
  const canManage = s.caps.can('manage_maintenance');
  const query = useQuery({ queryKey: ['work-orders', s.propertyId, state.status], queryFn: () => fetchWorkOrders(s.propertyId, state.status) });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [key, setKey] = useState(() => newIdempotencyKey('wo'));
  const [deleteReason, setDeleteReason] = useState('');
  const undoToast = useUndoToast();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['work-orders'] });
    void qc.invalidateQueries({ queryKey: ['overview'] });
    void qc.invalidateQueries({ queryKey: ['audit-feed'] });
  };

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const r = await saveWorkOrder(s.propertyId, { ...d, due_at: d.due_at ? new Date(d.due_at).toISOString() : null }, key);
      return { ...r, auditId: await latestAuditId('work_orders', r.id) };
    },
    onSuccess: (r) => {
      undoToast(`Work order ${r.status.replaceAll('_', ' ')}`, r.auditId, `Saved ${formatDateTime(new Date().toISOString())} · version ${r.version}`);
      setDraft(null);
      setKey(newIdempotencyKey('wo'));
      invalidate();
    },
    onError: (e) => {
      const err = toAppError(e);
      toast.error(err.kind === 'conflict' ? 'Someone else changed this work order. Reload and try again.' : err.message);
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => softDelete('work_orders', id, deleteReason),
    onSuccess: (r) => { undoToast('Work order cancelled', r.auditId); setDraft(null); setDeleteReason(''); invalidate(); },
    onError: (e) => toast.error(toAppError(e).message),
  });

  const open = (w?: WorkOrder) => {
    setKey(newIdempotencyKey('wo'));
    setDraft(w ? { id: w.id, expected_version: w.version, title: w.title, description: w.description ?? '', priority: w.priority, due_at: w.due_at ? w.due_at.slice(0, 16) : '', blocks_arrival: w.blocks_arrival, status: w.status, resolution: w.resolution ?? '' } : { ...blank });
  };

  return (
    <div>
      <PageHeader title="Work orders" description="Maintenance work from cleaning issues, inventory condition or manual entry. Blocking work holds readiness." actions={canManage && <Button onClick={() => open()}>New work order</Button>} />
      <FilterBar activeCount={activeFilterCount} onClear={reset}>
        <FilterSelect label="Status" value={state.status || undefined} onChange={(v) => set({ status: v ?? '' })} allLabel="Open" options={[{ value: 'all', label: 'All' }, ...STATUSES.map((v) => ({ value: v, label: v.replaceAll('_', ' ') }))]} />
      </FilterBar>
      <QueryState query={query}>
        {(data) =>
          data.rows.length === 0 ? (
            <EmptyState title="No work orders" hint="Create one from a cleaning issue or manually." action={canManage ? <Button size="sm" onClick={() => open()}>New work order</Button> : undefined} />
          ) : (
            <ul className="divide-y rounded-lg border">
              {data.rows.map((w) => (
                <li key={w.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <button type="button" className="text-left font-medium hover:underline" onClick={() => open(w)} disabled={!canManage}>{w.title}</button>
                    <div className="text-xs text-muted-foreground">{w.priority} · {w.source_kind.replaceAll('_', ' ')}{w.due_at ? ` · due ${formatDateTime(w.due_at)}` : ''} · updated {formatDateTime(w.updated_at)}</div>
                  </div>
                  {w.blocks_arrival && w.status !== 'resolved' && <StatusBadge tone="bad">blocks arrival</StatusBadge>}
                  <StatusBadge tone={tone(w.status)}>{w.status.replaceAll('_', ' ')}</StatusBadge>
                </li>
              ))}
            </ul>
          )
        }
      </QueryState>
      <DetailSheet open={!!draft} onOpenChange={(o) => !o && setDraft(null)} title={draft?.id ? 'Edit work order' : 'New work order'} description="Changes are saved with a version check; a stale edit is rejected.">
        {draft && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(draft); }}>
            <div><Label htmlFor="wo-title">Title</Label><Input id="wo-title" required minLength={3} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="text-base" /></div>
            <div><Label htmlFor="wo-desc">Description</Label><Textarea id="wo-desc" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="text-base" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Priority</Label><Select value={draft.priority} onValueChange={(v) => setDraft({ ...draft, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['low', 'normal', 'high', 'urgent'].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Status</Label><Select value={draft.status} onValueChange={(v) => setDraft({ ...draft, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map((p) => <SelectItem key={p} value={p}>{p.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div><Label htmlFor="wo-due">Due</Label><Input id="wo-due" type="datetime-local" value={draft.due_at} onChange={(e) => setDraft({ ...draft, due_at: e.target.value })} className="text-base" /></div>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={draft.blocks_arrival} onCheckedChange={(v) => setDraft({ ...draft, blocks_arrival: v === true })} /> Blocks the next arrival</label>
            {draft.status === 'resolved' && <div><Label htmlFor="wo-res">Resolution (required)</Label><Textarea id="wo-res" required minLength={3} value={draft.resolution} onChange={(e) => setDraft({ ...draft, resolution: e.target.value })} className="text-base" /></div>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDraft(null)}>Cancel</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button></div>
            {draft.id && draft.status !== 'cancelled' && (
              <div className="mt-4 space-y-2 rounded-lg border border-destructive/40 p-3">
                <p className="text-sm font-medium">Delete (cancel) this work order</p>
                <Input aria-label="Delete reason" placeholder="Reason (required)" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} className="text-base" />
                <Button type="button" variant="destructive" size="sm" disabled={deleteReason.trim().length < 3 || remove.isPending} onClick={() => remove.mutate(draft.id!)}>Delete</Button>
              </div>
            )}
          </form>
        )}
      </DetailSheet>
    </div>
  );
}
