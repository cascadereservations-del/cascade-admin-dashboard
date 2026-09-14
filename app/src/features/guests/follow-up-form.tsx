import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { formatDateTime } from '@/lib/dates';
import { toAppError } from '@/lib/errors';
import { newIdempotencyKey } from '@/lib/idempotency';
import { softDelete, useUndoToast } from '@/lib/undo';
import { latestAuditId } from '@/features/operations/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { saveFollowUp, type FollowUp } from './api';

// CRM04 follow-up form. Preset purposes; completion needs a note and produces
// a timestamped completion event (server-set completed_at).

export const PURPOSES = [
  ['pre_arrival_question', 'Pre-arrival question'],
  ['service_recovery', 'Service recovery'],
  ['promised_item', 'Promised item'],
  ['post_stay_follow_up', 'Post-stay follow-up'],
  ['returning_guest_enquiry', 'Returning-guest enquiry'],
  ['other', 'Other'],
] as const;

export function FollowUpForm({ guestId, existing, onDone }: { guestId: string | null; existing?: FollowUp | null; onDone: () => void }) {
  const s = useSession();
  const qc = useQueryClient();
  const [d, setD] = useState({
    title: existing?.title ?? '',
    detail: existing?.detail ?? '',
    purpose: existing?.purpose ?? 'pre_arrival_question',
    priority: existing?.priority ?? 'normal',
    due_at: existing?.due_at ? existing.due_at.slice(0, 16) : '',
    status: existing?.status ?? 'open',
    completion_note: existing?.completion_note ?? '',
  });
  const [key] = useState(() => newIdempotencyKey('task'));
  const [deleteReason, setDeleteReason] = useState('');
  const undoToast = useUndoToast();
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['follow-ups'] });
    void qc.invalidateQueries({ queryKey: ['timeline'] });
    void qc.invalidateQueries({ queryKey: ['overview'] });
    void qc.invalidateQueries({ queryKey: ['audit-feed'] });
  };
  const save = useMutation({
    mutationFn: async () => {
      const r = await saveFollowUp(s.propertyId, { ...(existing ? { id: existing.id, expected_version: existing.version } : { guest_id: guestId }), ...d, due_at: d.due_at ? new Date(d.due_at).toISOString() : null }, key);
      return { ...r, auditId: await latestAuditId('follow_up_tasks', r.id) };
    },
    onSuccess: (r) => {
      undoToast(r.status === 'done' ? 'Follow-up completed' : 'Follow-up saved', r.auditId, `${r.status} · ${formatDateTime(r.completedAt ?? new Date().toISOString())}`);
      invalidate();
      onDone();
    },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const remove = useMutation({
    mutationFn: () => softDelete('follow_up_tasks', existing!.id, deleteReason),
    onSuccess: (r) => { undoToast('Follow-up cancelled', r.auditId); invalidate(); onDone(); },
    onError: (e) => toast.error(toAppError(e).message),
  });
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <div><Label htmlFor="fu-title">Title</Label><Input id="fu-title" required minLength={3} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} className="text-base" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Purpose</Label><Select value={d.purpose} onValueChange={(v) => setD({ ...d, purpose: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{PURPOSES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Priority</Label><Select value={d.priority} onValueChange={(v) => setD({ ...d, priority: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['low', 'normal', 'high', 'urgent'].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
        <div><Label htmlFor="fu-due">Due</Label><Input id="fu-due" type="datetime-local" value={d.due_at} onChange={(e) => setD({ ...d, due_at: e.target.value })} className="text-base" /></div>
        {existing && <div><Label>Status</Label><Select value={d.status} onValueChange={(v) => setD({ ...d, status: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['open', 'in_progress', 'done', 'cancelled'].map((v) => <SelectItem key={v} value={v}>{v.replace('_', ' ')}</SelectItem>)}</SelectContent></Select></div>}
      </div>
      <div><Label htmlFor="fu-detail">Detail</Label><Textarea id="fu-detail" value={d.detail} onChange={(e) => setD({ ...d, detail: e.target.value })} className="text-base" /></div>
      {d.status === 'done' && <div><Label htmlFor="fu-note">Completion note (required)</Label><Textarea id="fu-note" required minLength={3} value={d.completion_note} onChange={(e) => setD({ ...d, completion_note: e.target.value })} className="text-base" /></div>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={onDone}>Cancel</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button></div>
      {existing && existing.status !== 'cancelled' && (
        <div className="mt-4 space-y-2 rounded-lg border border-destructive/40 p-3">
          <p className="text-sm font-medium">Delete (cancel) this follow-up</p>
          <Input aria-label="Delete reason" placeholder="Reason (required)" value={deleteReason} onChange={(e) => setDeleteReason(e.target.value)} className="text-base" />
          <Button type="button" variant="destructive" size="sm" disabled={deleteReason.trim().length < 3 || remove.isPending} onClick={() => remove.mutate()}>Delete</Button>
        </div>
      )}
    </form>
  );
}
