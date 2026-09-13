import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { formatDate, formatDateTime, todayManila } from '@/lib/dates';
import { toAppError } from '@/lib/errors';
import { PageHeader } from '@/components/data/page-header';
import { EmptyState, QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { DetailSheet } from '@/components/data/detail-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { fetchNotices, saveNotice, type Notice } from './api';

// OPS02 notices with audience and expiry. Expired notices are shown as expired
// here and are excluded from Today by the server.

type Draft = Partial<Notice> & { title: string; notice_type: string; effective_date: string };
const TYPES = ['power', 'water', 'maintenance', 'weather', 'general'];

export default function NoticesPage() {
  const s = useSession();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['notices', s.propertyId], queryFn: () => fetchNotices(s.propertyId) });
  const [draft, setDraft] = useState<Draft | null>(null);
  const canManage = s.caps.can('manage_operations');
  const save = useMutation({
    mutationFn: (d: Draft) => saveNotice(s.propertyId, { ...d, posted_by_name: s.displayName, expires_at: d.expires_at ? new Date(d.expires_at).toISOString() : null }),
    onSuccess: (n) => {
      toast.success(`Notice saved: ${n.title}`, { description: formatDateTime(new Date().toISOString()) });
      setDraft(null);
      void qc.invalidateQueries({ queryKey: ['notices'] });
      void qc.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const now = new Date().toISOString();
  return (
    <div>
      <PageHeader title="Notices" description="Utility interruptions, maintenance windows and general notices with an audience and expiry." actions={canManage && <Button onClick={() => setDraft({ title: '', notice_type: 'general', effective_date: todayManila(), audience: 'staff', is_active: true })}>New notice</Button>} />
      <QueryState query={query}>
        {(data) =>
          data.rows.length === 0 ? <EmptyState title="No notices" /> : (
            <ul className="divide-y rounded-lg border">
              {data.rows.map((n) => {
                const expired = (n.expires_at && n.expires_at < now) || !n.is_active;
                return (
                  <li key={n.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <button type="button" className="text-left font-medium hover:underline" disabled={!canManage} onClick={() => setDraft({ ...n, expires_at: n.expires_at ? n.expires_at.slice(0, 16) : '' })}>{n.title}</button>
                      <div className="text-xs text-muted-foreground">{n.notice_type} · {formatDate(n.effective_date, 'weekday')}{n.effective_time ? ` ${n.effective_time}` : ''}{n.duration_hours ? ` · ${n.duration_hours}h` : ''} · audience {n.audience ?? 'staff'}{n.posted_by_name ? ` · by ${n.posted_by_name}` : ''}</div>
                    </div>
                    <StatusBadge tone={expired ? 'neutral' : 'good'}>{expired ? 'expired' : 'active'}</StatusBadge>
                  </li>
                );
              })}
            </ul>
          )
        }
      </QueryState>
      <DetailSheet open={!!draft} onOpenChange={(o) => !o && setDraft(null)} title={draft?.id ? 'Edit notice' : 'New notice'}>
        {draft && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(draft); }}>
            <div><Label htmlFor="n-title">Title</Label><Input id="n-title" required value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="text-base" /></div>
            <div><Label htmlFor="n-desc">Description</Label><Textarea id="n-desc" value={draft.description ?? ''} onChange={(e) => setDraft({ ...draft, description: e.target.value })} className="text-base" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Type</Label><Select value={draft.notice_type} onValueChange={(v) => setDraft({ ...draft, notice_type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Audience</Label><Select value={draft.audience ?? 'staff'} onValueChange={(v) => setDraft({ ...draft, audience: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['staff', 'cleaners', 'owner', 'all'].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
              <div><Label htmlFor="n-date">Effective date</Label><Input id="n-date" type="date" required value={draft.effective_date} onChange={(e) => setDraft({ ...draft, effective_date: e.target.value })} className="text-base" /></div>
              <div><Label htmlFor="n-exp">Expires</Label><Input id="n-exp" type="datetime-local" value={draft.expires_at ?? ''} onChange={(e) => setDraft({ ...draft, expires_at: e.target.value })} className="text-base" /></div>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.is_active ?? true} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} /> Active</label>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDraft(null)}>Cancel</Button><Button type="submit" disabled={save.isPending}>Save</Button></div>
          </form>
        )}
      </DetailSheet>
    </div>
  );
}
