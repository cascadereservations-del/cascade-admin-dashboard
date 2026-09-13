import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/dates';
import { toAppError } from '@/lib/errors';
import { PageHeader } from '@/components/data/page-header';
import { EmptyState, QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { listStaff, staffAction } from './api';

// OPS03: named staff, disablement, session revocation and operational notes
// through the deployed staff-users function. Notes must never hold credentials.

export default function StaffPage() {
  const qc = useQueryClient();
  const staff = useQuery({ queryKey: ['staff'], queryFn: listStaff });
  const [note, setNote] = useState<Record<string, string>>({});
  const act = useMutation({
    mutationFn: (p: { action: 'disable' | 'enable' | 'revoke_sessions' | 'set_note'; userId: string; extra?: Record<string, unknown> }) => staffAction(p.action, p.userId, p.extra),
    onSuccess: (_r, p) => { toast.success(`Staff ${p.action.replace('_', ' ')} applied`, { description: formatDateTime(new Date().toISOString()) }); void qc.invalidateQueries({ queryKey: ['staff'] }); },
    onError: (e) => toast.error(toAppError(e).message),
  });
  return (
    <div>
      <PageHeader title="Staff" description="Server-owned staff profiles. Disabling or revoking takes effect on the next request; notes are operational only, never PINs or passwords." />
      <QueryState query={staff} isEmpty={(d) => d.length === 0} empty={<EmptyState title="No staff returned" hint="The staff-users function answers only owner and admin sessions." />}>
        {(rows) => (
          <ul className="divide-y rounded-lg border text-sm">
            {rows.map((u) => (
              <li key={u.user_id} className="space-y-2 px-3 py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{u.name ?? u.email ?? u.user_id}</span>
                  <StatusBadge tone="info">{u.role}</StatusBadge>
                  <StatusBadge tone={u.disabled_at ? 'bad' : 'good'}>{u.disabled_at ? 'disabled' : 'active'}</StatusBadge>
                  {u.sessions_revoked_after && <span className="text-xs text-muted-foreground">sessions revoked {formatDateTime(u.sessions_revoked_after)}</span>}
                  <div className="ml-auto flex gap-1">
                    {u.disabled_at ? <Button size="sm" variant="outline" onClick={() => act.mutate({ action: 'enable', userId: u.user_id })}>Enable</Button> : <Button size="sm" variant="outline" onClick={() => act.mutate({ action: 'disable', userId: u.user_id })}>Disable</Button>}
                    <Button size="sm" variant="outline" onClick={() => act.mutate({ action: 'revoke_sessions', userId: u.user_id })}>Sign out everywhere</Button>
                  </div>
                </div>
                <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); act.mutate({ action: 'set_note', userId: u.user_id, extra: { note: note[u.user_id] ?? '' } }); }}>
                  <Input aria-label="Operational note" placeholder={u.note ?? 'Operational note (no credentials)'} className="h-8 text-sm" value={note[u.user_id] ?? ''} onChange={(e) => setNote({ ...note, [u.user_id]: e.target.value })} />
                  <Button size="sm" type="submit" variant="ghost" disabled={!note[u.user_id]}>Save note</Button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  );
}
