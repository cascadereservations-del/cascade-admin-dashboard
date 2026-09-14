import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CalendarDays, Mail, MessageCircle, Phone } from 'lucide-react';
import { useSession } from '@/auth/session';
import { useUrlState } from '@/lib/url-state';
import { formatDate, formatDateTime } from '@/lib/dates';
import { formatPHP } from '@/lib/money';
import { toAppError } from '@/lib/errors';
import { Section } from '@/components/data/page-header';
import { EmptyState, ErrorState, QueryState } from '@/components/data/query-state';
import { DetailSheet, Field } from '@/components/data/detail-sheet';
import { CopyButton } from '@/components/data/copy-button';
import { StatusBadge } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FollowUpForm } from './follow-up-form';
import { companionIdPhotoUrl, deleteGuestCompanion, fetchFollowUps, fetchGuest, fetchTimeline, listGuestCompanions, mergeGuests, previewMerge, saveGuestCompanion, saveProfile, uploadCompanionIdPhoto, type Companion } from './api';

// CRM01-CRM06. Profile fields are optional and carry provenance; the timeline
// is server-filtered by permission; merge requires a server preview, a
// verified shared contact and a reason.
//
// Companions (2026-09-14): people on a stay besides the booker. ID photo bytes
// are uploaded straight from the browser to the private guest-id-photos
// bucket -- the agent never fetches, views or stores the image itself.

type CompanionDraft = { id?: string; name: string; contact_number: string; id_type: string; id_number: string; notes: string; version?: number };

function CompanionsSection({ guestId }: { guestId: string }) {
  const qc = useQueryClient();
  const companions = useQuery({ queryKey: ['companions', guestId], queryFn: () => listGuestCompanions(guestId) });
  const [draft, setDraft] = useState<CompanionDraft | null>(null);
  const [reason, setReason] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['companions', guestId] });

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('nothing to save');
      const r = await saveGuestCompanion(guestId, draft.id ?? null, { name: draft.name, contact_number: draft.contact_number, id_type: draft.id_type, id_number: draft.id_number, notes: draft.notes }, draft.version, reason || 'Companion details updated');
      if (file) {
        const path = await uploadCompanionIdPhoto(r.id, file);
        await saveGuestCompanion(guestId, r.id, { id_photo_path: path }, r.version, 'ID photo uploaded');
      }
      return r;
    },
    onSuccess: () => { toast.success('Companion saved'); setDraft(null); setFile(null); setReason(''); refresh(); },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteGuestCompanion(id, reason || 'Removed'),
    onSuccess: () => { toast.success('Companion removed'); setConfirmDelete(null); setReason(''); refresh(); },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const openPhoto = async (path: string) => {
    try { window.open(await companionIdPhotoUrl(path), '_blank', 'noopener'); }
    catch (e) { toast.error(toAppError(e).message); }
  };
  const open = (c?: Companion) => { setFile(null); setReason(''); setDraft(c ? { id: c.id, name: c.name, contact_number: c.contact_number ?? '', id_type: c.id_type ?? '', id_number: c.id_number ?? '', notes: c.notes ?? '', version: c.version } : { name: '', contact_number: '', id_type: '', id_number: '', notes: '' }); };

  return (
    <Section title="Companions" aside={<Button size="sm" variant="outline" onClick={() => open()}>Add companion</Button>}>
      <p className="mb-2 text-xs text-muted-foreground">People staying besides the booking guest. ID number and photo are sensitive; photos are uploaded here directly, not sent anywhere else.</p>
      <QueryState query={companions}>
        {(rows) => rows.length === 0 ? <p className="text-sm text-muted-foreground">No companions recorded.</p> : (
          <ul className="divide-y rounded-lg border text-sm">
            {rows.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                <button type="button" className="text-left font-medium hover:underline" onClick={() => open(c)}>{c.name}</button>
                {c.contact_number && <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">{c.contact_number}<CopyButton value={c.contact_number} /></span>}
                {c.id_type && <StatusBadge tone="info">{c.id_type.replace('_', ' ')}</StatusBadge>}
                {c.id_photo_path && <Button size="sm" variant="link" className="h-auto p-0 text-xs" onClick={() => openPhoto(c.id_photo_path!)}>View ID photo</Button>}
                <div className="ml-auto flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => open(c)}>Edit</Button>
                  {confirmDelete === c.id ? <Button size="sm" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate(c.id)}>Confirm</Button> : <Button size="sm" variant="outline" onClick={() => setConfirmDelete(c.id)}>Remove</Button>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryState>
      <DetailSheet open={!!draft} onOpenChange={(o) => !o && setDraft(null)} title={draft?.id ? 'Edit companion' : 'Add companion'}>
        {draft && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <div><Label htmlFor="cp-name">Name</Label><Input id="cp-name" required minLength={2} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="text-base" /></div>
            <div><Label htmlFor="cp-contact">Contact number</Label><Input id="cp-contact" value={draft.contact_number} onChange={(e) => setDraft({ ...draft, contact_number: e.target.value })} className="text-base" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>ID type</Label><Select value={draft.id_type || 'unset'} onValueChange={(v) => setDraft({ ...draft, id_type: v === 'unset' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unset">—</SelectItem><SelectItem value="passport">Passport</SelectItem><SelectItem value="drivers_license">Driver's license</SelectItem><SelectItem value="national_id">National ID</SelectItem><SelectItem value="other">Other</SelectItem></SelectContent></Select></div>
              <div><Label htmlFor="cp-idnum">ID number</Label><Input id="cp-idnum" value={draft.id_number} onChange={(e) => setDraft({ ...draft, id_number: e.target.value })} className="text-base" /></div>
            </div>
            <div>
              <Label htmlFor="cp-photo">ID photo</Label>
              <Input id="cp-photo" type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="text-base" />
              <p className="mt-1 text-xs text-muted-foreground">Uploads directly to Cascade's private storage when you save.</p>
            </div>
            <div><Label htmlFor="cp-notes">Notes</Label><Textarea id="cp-notes" value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className="text-base" /></div>
            <div><Label htmlFor="cp-reason">Reason (optional)</Label><Input id="cp-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="text-base" /></div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setDraft(null)}>Cancel</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</Button></div>
          </form>
        )}
      </DetailSheet>
    </Section>
  );
}

export default function GuestDetailPage() {
  const { id = '' } = useParams();
  const s = useSession();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { state, set } = useUrlState({ task: '' });
  const guest = useQuery({ queryKey: ['guest', id], queryFn: () => fetchGuest(id) });
  const timeline = useQuery({ queryKey: ['timeline', id], queryFn: () => fetchTimeline(id) });
  const tasks = useQuery({ queryKey: ['follow-ups', s.propertyId, id], queryFn: () => fetchFollowUps(s.propertyId, id) });
  const [editing, setEditing] = useState(false);
  const [patch, setPatch] = useState<Record<string, unknown>>({});
  const [reason, setReason] = useState('');
  const [mergeId, setMergeId] = useState('');
  const [mergeReason, setMergeReason] = useState('');
  const [preview, setPreview] = useState<Record<string, unknown> | null>(null);
  const [newTask, setNewTask] = useState(false);

  const save = useMutation({
    mutationFn: () => saveProfile(id, patch, guest.data?.details?.version ?? null, reason),
    onSuccess: (r) => {
      toast.success('Profile saved', { description: `Version ${r.version} · ${formatDateTime(r.updatedAt)}` });
      setEditing(false); setPatch({}); setReason('');
      void qc.invalidateQueries({ queryKey: ['guest', id] });
      void qc.invalidateQueries({ queryKey: ['timeline', id] });
    },
    onError: (e) => { const err = toAppError(e); toast.error(err.kind === 'conflict' ? 'The profile changed since you opened it. Reload and reapply your edit.' : err.message); },
  });
  const doPreview = useMutation({ mutationFn: () => previewMerge(id, mergeId), onSuccess: setPreview, onError: (e) => toast.error(toAppError(e).message) });
  const doMerge = useMutation({
    mutationFn: () => mergeGuests(id, mergeId, mergeReason),
    onSuccess: () => { toast.success('Guests merged; the other record is now inactive and linked here.'); setPreview(null); setMergeId(''); void qc.invalidateQueries(); },
    onError: (e) => toast.error(toAppError(e).message),
  });

  const editingTask = tasks.data?.rows.find((t) => t.id === state.task) ?? null;

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => nav(-1)}><ArrowLeft className="size-4" aria-hidden /> Back</Button>
      <QueryState query={guest}>
        {({ guest: g, details: d, detailsError }) => (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-5 shadow-sm">
              <div className="flex items-start gap-4">
                <div aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                  {(d?.display_name ?? g.name).trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-semibold tracking-tight">{d?.display_name ?? g.name}</h1>
                    <StatusBadge tone="neutral">{g.source}</StatusBadge>
                    {g.tier && <StatusBadge tone={g.tier === 'vip' ? 'warn' : 'info'}>{g.tier}</StatusBadge>}
                    {d?.vip && <StatusBadge tone="warn">VIP</StatusBadge>}
                  </div>
                  {(d?.display_name && d.display_name !== g.name) && <p className="mt-0.5 text-sm text-muted-foreground">{g.name}</p>}
                  <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span className="tabular">{g.total_stays ?? 0} {g.total_stays === 1 ? 'stay' : 'stays'} · {g.total_nights_stayed ?? 0} nights</span>
                    <span>Last stay {formatDate(g.last_stay_date, 'long')}</span>
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => setNewTask(true)}>New follow-up</Button>
                <Button onClick={() => { setPatch({}); setEditing(true); }}>Edit profile</Button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="py-4 gap-3"><CardHeader><CardTitle className="flex items-center gap-2"><Phone className="size-4 text-muted-foreground" aria-hidden /> Contact</CardTitle></CardHeader><CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm"><Phone className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />{g.phone ? <span className="inline-flex items-center gap-1">{g.phone}<CopyButton value={g.phone} /></span> : <span className="text-muted-foreground">Phone not recorded</span>}</div>
                <div className="flex items-center gap-2 text-sm"><Mail className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />{g.email ? <span className="inline-flex items-center gap-1">{g.email}<CopyButton value={g.email} /></span> : <span className="text-muted-foreground">E-mail not recorded</span>}</div>
                <div className="flex items-center gap-2 text-sm"><MessageCircle className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />{d?.messenger_link ? <a href={d.messenger_link} target="_blank" rel="noopener noreferrer" className="underline">Open Messenger conversation</a> : d?.messenger_psid ? <span className="inline-flex items-center gap-1">PSID {d.messenger_psid}<CopyButton value={d.messenger_psid} /> (open the Page inbox)</span> : <span className="text-muted-foreground">No Messenger link recorded</span>}</div>
                <div className="mt-1 border-t pt-3">
                  <Field label="Preferred channel">{d?.preferred_channel ?? 'not stated'}</Field>
                  <Field label="Language">{d?.language ?? 'not stated'}</Field>
                  <Field label="Preferences">{d?.stay_preferences ?? 'none recorded'}</Field>
                  <Field label="Tags">{d?.tags?.length ? d.tags.join(', ') : 'none'}</Field>
                </div>
                {detailsError && <p className="text-xs text-muted-foreground">Profile details unavailable: {detailsError}</p>}
              </CardContent></Card>
              <Card className="py-4 gap-3"><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="size-4 text-muted-foreground" aria-hidden /> Record</CardTitle></CardHeader><CardContent className="space-y-2">
                <Field label="First stay">{formatDate(g.first_stay_date, 'long')}</Field>
                <Field label="Guest id"><span className="inline-flex items-center gap-1 text-xs">{g.id}<CopyButton value={g.id} /></span></Field>
                <Field label="Created">{formatDateTime(g.created_at)}</Field>
                <Field label="Updated">{formatDateTime(d?.updated_at ?? g.updated_at)}</Field>
                <Field label="Consent">{timeline.data ? (timeline.data.events.some((e) => e.kind === 'consent') ? 'see timeline' : 'no consent events recorded') : '…'}</Field>
                {g.notes && <Field label="Notes">{g.notes}</Field>}
              </CardContent></Card>
            </div>

            <CompanionsSection guestId={id} />

            <Section title="Follow-ups" aside={<Button size="sm" variant="outline" onClick={() => setNewTask(true)}>Add</Button>}>
              <QueryState query={tasks}>
                {(t) => t.rows.length === 0 ? <p className="text-sm text-muted-foreground">No follow-ups for this guest.</p> : (
                  <ul className="divide-y rounded-lg border text-sm">{t.rows.map((x) => <li key={x.id} className="flex flex-wrap items-center gap-2 px-3 py-2"><button type="button" className="text-left font-medium hover:underline" onClick={() => set({ task: x.id })}>{x.title}</button><span className="text-xs text-muted-foreground">{x.purpose.replaceAll('_', ' ')}{x.due_at ? ` · due ${formatDateTime(x.due_at)}` : ''}{x.completed_at ? ` · completed ${formatDateTime(x.completed_at)}` : ''}</span><StatusBadge className="ml-auto" tone={x.status === 'done' ? 'good' : x.status === 'cancelled' ? 'neutral' : 'warn'}>{x.status.replace('_', ' ')}</StatusBadge></li>)}</ul>
                )}
              </QueryState>
            </Section>

            <Section title="Timeline">
              {timeline.isPending ? <p className="text-sm text-muted-foreground">Loading timeline…</p> : timeline.isError ? <ErrorState error={timeline.error} onRetry={() => void timeline.refetch()} /> : timeline.data.events.length === 0 ? <EmptyState title="No events yet" /> : (
                <ul className="space-y-2 border-l pl-4 text-sm">
                  {timeline.data.events.map((e, i) => (
                    <li key={i} className="relative"><span aria-hidden className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-champagne" />
                      <span className="tabular text-xs text-muted-foreground">{formatDateTime(e.at)}</span> · <span className="capitalize">{e.kind.replace('_', ' ')}</span> <span className="text-xs text-muted-foreground">({e.source})</span>
                      <div className="text-muted-foreground">
                        {e.kind === 'stay' && <>{String(e.body.code)} · {formatDate(String(e.body.checkin))} → {formatDate(String(e.body.checkout))} · {String(e.body.nights)} nights · {String(e.body.status)}{e.body.accommodationTotal != null ? ` · ${formatPHP(String(e.body.accommodationTotal))}` : ''} · <Link to={`/bookings/${String(e.body.stayKind)}/${String(e.body.id)}`} className="underline">open</Link></>}
                        {e.kind === 'follow_up' && <>{String(e.body.title)} · {String(e.body.status)}{e.body.completionNote ? ` · ${String(e.body.completionNote)}` : ''}</>}
                        {e.kind === 'conversation' && <>{String(e.body.channel)} · {String(e.body.purpose ?? 'general')} · {String(e.body.status)}</>}
                        {e.kind === 'consent' && <>{String(e.body.purpose)} · {String(e.body.status)}</>}
                        {e.kind === 'lifecycle' && <>{String(e.body.eventType)} {e.body.code ? `(${String(e.body.code)})` : ''}</>}
                        {e.kind === 'refund' && <>{formatPHP(String(e.body.amount))} · {String(e.body.rail ?? '')} · {String(e.body.status)}</>}
                        {e.kind === 'profile_change' && <>{String(e.body.reason ?? 'profile updated')}</>}
                        {e.kind === 'merge' && <>merged guest {String(e.body.mergedGuestId)} · {String(e.body.reason)}</>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {timeline.data && !timeline.data.financeVisible && <p className="mt-2 text-xs text-muted-foreground">Financial events are hidden for this session.</p>}
            </Section>

            <Section title="Identity review">
              <div className="flex flex-wrap items-end gap-2">
                <div><Label htmlFor="merge-id">Merge another guest into this one (guest id)</Label><Input id="merge-id" className="w-80 text-base sm:text-sm" value={mergeId} onChange={(e) => setMergeId(e.target.value)} /></div>
                <Button variant="outline" disabled={!mergeId || doPreview.isPending} onClick={() => doPreview.mutate()}>Preview</Button>
              </div>
              {preview && (
                <div className="mt-2 space-y-2 rounded-lg border p-3 text-sm">
                  <p>Affects {String(preview.reservations)} reservations, {String(preview.inquiries)} inquiries, {String(preview.followUps)} follow-ups, {String(preview.conversations)} conversations.</p>
                  <p>{preview.sharedContact ? 'Verified shared phone or e-mail: merge allowed.' : 'No shared verified contact. Name-only similarity cannot be merged.'}</p>
                  <div className="flex flex-wrap items-end gap-2"><div className="min-w-60 flex-1"><Label htmlFor="merge-reason">Reason</Label><Textarea id="merge-reason" rows={1} value={mergeReason} onChange={(e) => setMergeReason(e.target.value)} className="text-base sm:text-sm" /></div><Button variant="destructive" disabled={!preview.sharedContact || mergeReason.trim().length < 3 || doMerge.isPending} onClick={() => doMerge.mutate()}>Merge</Button></div>
                </div>
              )}
            </Section>

            <DetailSheet open={editing} onOpenChange={setEditing} title="Edit profile" description="Only the fields you change are saved, with your reason recorded in the profile history.">
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
                <div><Label htmlFor="pf-name">Display name</Label><Input id="pf-name" defaultValue={d?.display_name ?? ''} onChange={(e) => setPatch({ ...patch, display_name: e.target.value })} className="text-base" /></div>
                <div><Label>Preferred channel</Label><Select defaultValue={d?.preferred_channel ?? 'unset'} onValueChange={(v) => setPatch({ ...patch, preferred_channel: v === 'unset' ? '' : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="unset">Not stated</SelectItem>{['messenger', 'phone', 'email', 'airbnb', 'other'].map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent></Select></div>
                <div><Label htmlFor="pf-lang">Language</Label><Input id="pf-lang" defaultValue={d?.language ?? ''} onChange={(e) => setPatch({ ...patch, language: e.target.value })} className="text-base" /></div>
                <div><Label htmlFor="pf-link">Messenger link</Label><Input id="pf-link" defaultValue={d?.messenger_link ?? ''} onChange={(e) => setPatch({ ...patch, messenger_link: e.target.value })} className="text-base" /></div>
                <div><Label htmlFor="pf-pref">Stay preferences (guest-stated)</Label><Textarea id="pf-pref" defaultValue={d?.stay_preferences ?? ''} onChange={(e) => setPatch({ ...patch, stay_preferences: e.target.value })} className="text-base" /></div>
                <div><Label htmlFor="pf-tags">Tags (comma separated)</Label><Input id="pf-tags" defaultValue={d?.tags?.join(', ') ?? ''} onChange={(e) => setPatch({ ...patch, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} className="text-base" /></div>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" defaultChecked={d?.vip ?? false} onChange={(e) => setPatch({ ...patch, vip: e.target.checked })} /> VIP (manual)</label>
                <div><Label htmlFor="pf-reason">Reason for change</Label><Input id="pf-reason" required value={reason} onChange={(e) => setReason(e.target.value)} className="text-base" /></div>
                <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" disabled={save.isPending || Object.keys(patch).length === 0}>Save</Button></div>
              </form>
            </DetailSheet>
            <DetailSheet open={newTask || !!editingTask} onOpenChange={(o) => { if (!o) { setNewTask(false); set({ task: '' }); } }} title={editingTask ? 'Follow-up' : 'New follow-up'}>
              <FollowUpForm guestId={id} existing={editingTask} onDone={() => { setNewTask(false); set({ task: '' }); }} />
            </DetailSheet>
          </div>
        )}
      </QueryState>
    </div>
  );
}
