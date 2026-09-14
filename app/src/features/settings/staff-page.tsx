import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { formatDateTime } from '@/lib/dates';
import { toAppError } from '@/lib/errors';
import { PageHeader } from '@/components/data/page-header';
import { EmptyState, QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { DetailSheet } from '@/components/data/detail-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { STAFF_PIN_PREFIX, STAFF_PIN_RE, STAFF_ROLES, createStaff, listStaff, staffAction, type StaffUser } from './api';

// OPS03: named staff through the deployed staff-users function: create with a
// 4-digit PIN, edit name / role / PIN, disable, delete, operational notes.
// Notes must never hold credentials. Every action is written to
// staff_access_audit by the function and shows in Audit history.

type Draft = { user_id?: string; name: string; role: string; pin: string; note: string };

export default function StaffPage() {
  const s = useSession();
  const qc = useQueryClient();
  const staff = useQuery({ queryKey: ['staff'], queryFn: listStaff });
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const roles = STAFF_ROLES.filter((r) => r !== 'admin' || s.caps.role === 'owner');
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['staff'] }); void qc.invalidateQueries({ queryKey: ['audit-feed'] }); };
  const act = useMutation({
    mutationFn: (p: { action: 'disable' | 'enable' | 'update' | 'delete'; userId: string; extra?: Record<string, unknown> }) => staffAction(p.action, p.userId, p.extra),
    onSuccess: (_r, p) => { toast.success(`Staff ${p.action === 'update' ? 'updated' : p.action + 'd'}`, { description: formatDateTime(new Date().toISOString()) }); setDraft(null); setConfirmDelete(false); refresh(); },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const create = useMutation({
    mutationFn: (d: Draft) => createStaff(s.propertyId, d.name.trim(), d.role, d.pin),
    onSuccess: (r) => { toast.success(`Created. They sign in with the name ${r.sign_in_name ?? ''}`.trim(), { description: 'PIN is the 4 digits you entered.' }); setDraft(null); refresh(); },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const open = (u?: StaffUser) => { setConfirmDelete(false); setDraft(u ? { user_id: u.user_id, name: u.name, role: u.role, pin: '', note: u.note ?? '' } : { name: '', role: 'cleaner', pin: '', note: '' }); };
  const submit = () => {
    if (!draft) return;
    if (draft.name.trim().length < 2) return toast.error('Enter a display name.');
    if (!draft.user_id && !STAFF_PIN_RE.test(draft.pin)) return toast.error('The PIN must be exactly 4 digits.');
    if (draft.pin && !STAFF_PIN_RE.test(draft.pin)) return toast.error('The PIN must be exactly 4 digits.');
    if (draft.user_id) act.mutate({ action: 'update', userId: draft.user_id, extra: { name: draft.name.trim(), role: draft.role, password: draft.pin ? STAFF_PIN_PREFIX + draft.pin : '', note: draft.note } });
    else create.mutate(draft);
  };
  const editing = draft?.user_id ? staff.data?.find((u) => u.user_id === draft.user_id) : undefined;
  return (
    <div>
      <PageHeader title="Staff" description="Server-owned staff logins. Staff sign in with their name and a 4-digit PIN; disabling or deleting takes effect on the next request. Notes are operational only, never PINs or passwords." actions={<Button onClick={() => open()}>Add staff</Button>} />
      <QueryState query={staff} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No staff returned" hint="The staff-users function answers only owner and admin sessions." />}>
        {(rows) => (
          <ul className="divide-y rounded-lg border text-sm">
            {rows.map((u) => (
              <li key={u.user_id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <button type="button" className="text-left font-medium hover:underline" disabled={u.role === 'owner'} onClick={() => open(u)}>{u.name}</button>
                {u.sign_in_name && <span className="text-xs text-muted-foreground">signs in as {u.sign_in_name}</span>}
                <StatusBadge tone="info">{u.role}</StatusBadge>
                <StatusBadge tone={u.disabled ? 'bad' : 'good'}>{u.disabled ? 'disabled' : 'active'}</StatusBadge>
                {u.last_sign_in_at && <span className="text-xs text-muted-foreground">last sign-in {formatDateTime(u.last_sign_in_at)}</span>}
                {u.note && <span className="text-xs text-muted-foreground">· {u.note}</span>}
                <div className="ml-auto flex gap-1">
                  {u.role === 'owner' ? <span className="text-xs text-muted-foreground">owner, protected</span> : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => open(u)}>Edit</Button>
                      {u.disabled ? <Button size="sm" variant="outline" onClick={() => act.mutate({ action: 'enable', userId: u.user_id })}>Enable</Button> : <Button size="sm" variant="outline" onClick={() => act.mutate({ action: 'disable', userId: u.user_id })}>Disable</Button>}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <DetailSheet open={!!draft} onOpenChange={(o) => !o && setDraft(null)} title={draft?.user_id ? 'Edit staff login' : 'Add staff'} description={draft?.user_id ? 'Leave the PIN blank to keep the current one. Changing it signs their phone out.' : 'They sign in with this name and the 4 digits. The 8888 prefix is added automatically; they never need to know it.'}>
        {draft && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <div><Label htmlFor="st-name">Display name</Label><Input id="st-name" required minLength={2} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="text-base" />{editing?.sign_in_name && <p className="mt-1 text-xs text-muted-foreground">Signs in as {editing.sign_in_name}. Renaming changes the display name, not the sign-in name.</p>}</div>
            <div><Label>Role</Label><Select value={draft.role} onValueChange={(v) => setDraft({ ...draft, role: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select></div>
            <div>
              <Label htmlFor="st-pin">4-digit PIN{draft.user_id ? ' (optional)' : ''}</Label>
              <div className="flex items-center gap-2"><span className="tabular text-muted-foreground">{STAFF_PIN_PREFIX}</span><Input id="st-pin" inputMode="numeric" pattern="[0-9]*" maxLength={4} autoComplete="off" placeholder="0000" value={draft.pin} onChange={(e) => setDraft({ ...draft, pin: e.target.value.replace(/\D/g, '').slice(0, 4) })} className="w-32 text-base tracking-widest" /></div>
            </div>
            {draft.user_id && <div><Label htmlFor="st-note">Operational note (no credentials)</Label><Input id="st-note" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} className="text-base" /></div>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDraft(null)}>Cancel</Button><Button type="submit" disabled={act.isPending || create.isPending}>{draft.user_id ? 'Save' : 'Create login'}</Button></div>
            {draft.user_id && (
              <div className="mt-4 space-y-2 rounded-lg border border-destructive/40 p-3">
                <p className="text-sm font-medium">Delete this login</p>
                <p className="text-xs text-muted-foreground">Their past reports stay; the name can be reused. This cannot be undone from the admin.</p>
                {confirmDelete ? <Button type="button" variant="destructive" size="sm" disabled={act.isPending} onClick={() => act.mutate({ action: 'delete', userId: draft.user_id! })}>Yes, delete {draft.name}</Button> : <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(true)}>Delete…</Button>}
              </div>
            )}
          </form>
        )}
      </DetailSheet>
    </div>
  );
}
