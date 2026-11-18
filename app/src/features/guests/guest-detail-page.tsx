import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { useSession } from '@/auth/session';
import { useUrlState } from '@/lib/url-state';
import { formatDate, formatDateTime } from '@/lib/dates';
import { formatPHP } from '@/lib/money';
import { toAppError } from '@/lib/errors';
import { EmptyState, ErrorState, QueryState } from '@/components/data/query-state';
import { DetailSheet, Field } from '@/components/data/detail-sheet';
import { CopyButton } from '@/components/data/copy-button';
import { StatusBadge, type Tone } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { TierCard } from './tier-card';
import { GuestUtilitiesCard } from './guest-utilities-card';
import { tierLabel } from './tier';
import { FollowUpForm } from './follow-up-form';
import { validateIdPhoto } from './local-records';
import { GuestIdPanel, IdPhotoProvider, IdPhotoThumb, NoIdPhotoTile } from './id-photos';
import { ID_TYPES, findSelfCompanion, guestIdStatus, otherCompanions, type GuestIdStatus } from './id-photo';
import { TurnoverReport } from './turnover-report';
import { PhotoSheet } from './photo-sheet';
import { autoReason } from './auto-reason';
import { DISPLAY_NAME, FieldRow, GROUP_IDS, ID_TYPE, NOTES, PHONE, ProfileGroups, fieldValue, groupCounts, notesShown, phoneHint, useFieldSave } from './profile-groups';
import { MergeSheet } from './merge-sheet';
import { deleteGuestCompanion, fetchFollowUps, fetchGuest, fetchTimeline, listGuestCompanions, saveGuestCompanion, uploadCompanionIdPhoto, type Companion } from './api';

// CRM01-CRM06. s118 (D-369): the ID photo is the page header, a short always-visible core (contact number, notes,
// ID type, companions) follows, and every optional field sits in a collapsed group. Edits save one field at a time
// with an automatic reason and an Undo toast; only ID number, address, "ID on file" un-ticked and VIP ask why.
//
// Companions (2026-09-14): people on a stay besides the booker. ID photo bytes are uploaded straight from the
// browser to the private guest-id-photos bucket -- the agent never fetches, views or stores the image itself.

type CompanionDraft = { id?: string; name: string; contact_number: string; id_type: string; id_number: string; notes: string; version?: number };

const caption = 'text-[0.8125rem] text-muted-foreground';
const Heading = ({ children }: { children: string }) => <h2 className="px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-muted-foreground">{children}</h2>;
const ID_STATUS: Record<GuestIdStatus, [Tone, string]> = { photo: ['good', 'ID photo on file'], companion_photos: ['info', 'ID via companion'], marked_no_photo: ['warn', 'ID marked, no photo'], none: ['neutral', 'No ID yet'] };

function IdStatusBadge({ guestId, guestName, details }: { guestId: string; guestName: string; details: Parameters<typeof guestIdStatus>[1] }) {
  const companions = useQuery({ queryKey: ['companions', guestId], queryFn: () => listGuestCompanions(guestId) });
  if (!companions.data) return null;
  const others = otherCompanions(companions.data, guestName).filter((c) => c.id_photo_path).length;
  const [tone, word] = ID_STATUS[guestIdStatus(findSelfCompanion(companions.data, guestName), details, others)];
  return <StatusBadge tone={tone}>{word}</StatusBadge>;
}

export function CompanionsSection({ guestId, guestName }: { guestId: string; guestName: string }) {
  const qc = useQueryClient();
  const companions = useQuery({ queryKey: ['companions', guestId], queryFn: () => listGuestCompanions(guestId) });
  const [draft, setDraft] = useState<CompanionDraft | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploadedPath, setUploadedPath] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [picking, setPicking] = useState(false);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['companions', guestId] }); void qc.invalidateQueries({ queryKey: ['id-photo-urls', guestId] }); };
  const current = companions.data?.find((c) => c.id === draft?.id);
  const preview = useMemo(() => (file && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error('nothing to save');
      if (draft.name.trim().length < 2) throw new Error('Enter the companion’s name.');
      if (file) await validateIdPhoto(file);
      const r = await saveGuestCompanion(guestId, draft.id ?? null, { name: draft.name.trim(), contact_number: draft.contact_number, id_type: draft.id_type, id_number: draft.id_number, notes: draft.notes }, draft.version, autoReason('companion'));
      // A later upload failure must not turn Retry into a second companion.
      setDraft({ ...draft, id: r.id, version: r.version });
      refresh();
      if (file) {
        const path = uploadedPath ?? await uploadCompanionIdPhoto(r.id, file);
        setUploadedPath(path);
        await saveGuestCompanion(guestId, r.id, { id_photo_path: path }, r.version, autoReason(current?.id_photo_path ? 'photo_replaced' : 'photo_added'));
      }
      return r;
    },
    onSuccess: () => { toast.success('Companion saved'); setDraft(null); setFile(null); setUploadedPath(null); refresh(); },
    onError: (e) => toast.error(toAppError(e).message),
  });
  // Remove is deferred: the row hides, the 6 s Undo toast shows, and the delete runs only when the time is up (or the
  // page unmounts). A restore would insert a new id, and the stored photo path (folder = old id) would stop being readable.
  const [hidden, setHidden] = useState<string[]>([]);
  const pending = useRef(new Map<string, { c: Companion; timer: ReturnType<typeof setTimeout> }>());
  const commit = (c: Companion) => {
    pending.current.delete(c.id);
    deleteGuestCompanion(c.id, 'Companion removed').then(refresh).catch((e) => { setHidden((h) => h.filter((x) => x !== c.id)); toast.error(toAppError(e).message); });
  };
  const remove = (c: Companion) => {
    setDraft(null);
    setHidden((h) => [...h, c.id]);
    pending.current.set(c.id, { c, timer: setTimeout(() => commit(c), 6000) });
    toast.success('Companion removed', { duration: 6000, action: { label: 'Undo', onClick: () => { const p = pending.current.get(c.id); if (p) { clearTimeout(p.timer); pending.current.delete(c.id); } setHidden((h) => h.filter((x) => x !== c.id)); } } });
  };
  // Leaving the page must not lose a delete that is waiting for its Undo window.
  useEffect(() => () => { for (const { c, timer } of pending.current.values()) { clearTimeout(timer); commit(c); } }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (c?: Companion) => { setFile(null); setUploadedPath(null); setMore(false); setDraft(c ? { id: c.id, name: c.name, contact_number: c.contact_number ?? '', id_type: c.id_type ?? '', id_number: c.id_number ?? '', notes: c.notes ?? '', version: c.version } : { name: '', contact_number: '', id_type: '', id_number: '', notes: '' }); };
  const pick = (f: File) => { validateIdPhoto(f).then(() => { setFile(f); setUploadedPath(null); }).catch((e) => toast.error(toAppError(e).message)); };
  const set = (patch: Partial<CompanionDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const moreFilled = draft ? [draft.id_type, draft.contact_number, draft.id_number, draft.notes].filter(Boolean).length : 0;
  const nameOk = (draft?.name.trim().length ?? 0) >= 2;
  const control = 'min-h-11 text-base md:text-base';

  return (
    <section className="space-y-2">
      <Heading>Companions</Heading>
      <QueryState query={companions}>
        {(all) => {
          const rows = otherCompanions(all, guestName).filter((c) => !hidden.includes(c.id)); // the guest's own photo is the page header
          return (
            <div className="divide-y overflow-hidden rounded-xl border bg-card">
              {rows.map((c) => (
                <div key={c.id} className="flex min-h-14 items-center gap-3 px-4 py-2">
                  {c.id_photo_path ? <IdPhotoThumb companionId={c.id} path={c.id_photo_path} name={c.name} className="w-16" /> : <NoIdPhotoTile className="w-16" text="No ID" onClick={() => open(c)} />}
                  <button type="button" className="min-h-11 min-w-0 flex-1 text-left" onClick={() => open(c)}>
                    <span className="block truncate text-base font-semibold">{c.name}</span>
                    <span className="block text-[0.9375rem] text-muted-foreground">{c.id_type ? c.id_type.replaceAll('_', ' ') : 'ID type not stated'}</span>
                  </button>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                </div>
              ))}
              <button type="button" className="flex min-h-12 w-full items-center px-4 text-left text-base font-semibold text-primary hover:bg-muted" onClick={() => open()}>+ Add companion</button>
            </div>
          );
        }}
      </QueryState>
      <p className={`px-1 ${caption}`}>People staying besides the booking guest.</p>
      <DetailSheet open={!!draft} onOpenChange={(o) => { if (!o && !save.isPending) setDraft(null); }} title={draft?.id ? 'Companion' : 'Add companion'}>
        {draft && (
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
            <div className="space-y-1">
              <label htmlFor="cp-name" className="text-[0.9375rem] text-muted-foreground">Name</label>
              <Input id="cp-name" required minLength={2} autoComplete="off" placeholder="Full name as on the ID" value={draft.name} onChange={(e) => set({ name: e.target.value })} className={control} />
            </div>
            <div className="space-y-2">
              <p className="text-[0.9375rem] text-muted-foreground">ID photo</p>
              {preview ? <img src={preview} alt="The photo you picked" className="aspect-[8/5] w-full max-w-72 rounded-xl border object-contain" />
                : current?.id_photo_path ? <IdPhotoThumb companionId={current.id} path={current.id_photo_path} name={current.name} className="w-full max-w-72" /> : null}
              <Button type="button" variant="outline" className="min-h-11 w-full" disabled={!nameOk || save.isPending} onClick={() => setPicking(true)}>{preview || current?.id_photo_path ? 'Replace photo' : 'Add photo'}</Button>
              <p className={caption}>{nameOk ? 'Take it now or choose one from the phone.' : 'Type the name first.'}</p>
              <PhotoSheet open={picking} onClose={() => setPicking(false)} onPicked={pick} allowPaste />
            </div>
            <div className="overflow-hidden rounded-xl border">
              <button type="button" aria-expanded={more} className="flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left hover:bg-muted" onClick={() => setMore(!more)}>
                <span className="min-w-0 flex-1"><span className="block text-base font-semibold">More details</span><span className="block text-[0.9375rem] text-muted-foreground">ID type, contact number, ID number, notes</span></span>
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[0.8125rem] font-semibold text-muted-foreground">{moreFilled} of 4 filled</span>
                <ChevronRight className={`size-4 shrink-0 text-muted-foreground transition-transform ${more ? 'rotate-90' : ''}`} aria-hidden />
              </button>
              {more && <div className="space-y-3 border-t p-4">
                <div className="space-y-1"><label htmlFor="cp-type" className="text-[0.9375rem] text-muted-foreground">ID type</label><select id="cp-type" value={draft.id_type} onChange={(e) => set({ id_type: e.target.value })} className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base"><option value="">Not stated</option>{ID_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                <div className="space-y-1"><label htmlFor="cp-contact" className="text-[0.9375rem] text-muted-foreground">Contact number</label><Input id="cp-contact" type="tel" inputMode="tel" autoComplete="off" value={draft.contact_number} onChange={(e) => set({ contact_number: e.target.value })} className={control} /></div>
                <div className="space-y-1"><label htmlFor="cp-idnum" className="text-[0.9375rem] text-muted-foreground">ID number</label><Input id="cp-idnum" autoComplete="off" value={draft.id_number} onChange={(e) => set({ id_number: e.target.value })} className={control} /></div>
                <div className="space-y-1"><label htmlFor="cp-notes" className="text-[0.9375rem] text-muted-foreground">Notes</label><Textarea id="cp-notes" value={draft.notes} onChange={(e) => set({ notes: e.target.value })} className={control} /></div>
              </div>}
            </div>
            {save.isError && draft.id && <p role="alert" className="text-base">Details may already be saved. Retry keeps the same companion; check the list before cancelling.</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={save.isPending} onClick={() => setDraft(null)}>Cancel</Button><Button type="submit" className="min-h-11" disabled={save.isPending || !nameOk}>{save.isPending ? 'Saving…' : draft.id ? 'Done' : 'Add'}</Button></div>
            {current && <Button type="button" variant="ghost" className="min-h-11 w-full text-destructive" disabled={save.isPending} onClick={() => remove(current)}>Remove companion</Button>}
            {current && <p className={caption}>You can undo for a few seconds. The ID photo file is kept.</p>}
          </form>
        )}
      </DetailSheet>
    </section>
  );
}

export default function GuestDetailPage() {
  const { id = '' } = useParams();
  const s = useSession();
  const nav = useNavigate();
  const { state, set } = useUrlState({ task: '' });
  const guest = useQuery({ queryKey: ['guest', id], queryFn: () => fetchGuest(id) });
  const timeline = useQuery({ queryKey: ['timeline', id], queryFn: () => fetchTimeline(id) });
  const tasks = useQuery({ queryKey: ['follow-ups', s.propertyId, id], queryFn: () => fetchFollowUps(s.propertyId, id) });
  const { saveField, saveFields, reasonSheet } = useFieldSave(id, guest.data?.details ?? null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ contact_number: '', stay_preferences: '', id_type: '', display_name: '' });
  const [openGroups, setOpenGroups] = useState<string[]>([]);
  const [newTask, setNewTask] = useState(false);
  const [merging, setMerging] = useState(false);
  const editingTask = tasks.data?.rows.find((t) => t.id === state.task) ?? null;
  const showGroup = (gid: string) => {
    setEditing(false);
    setOpenGroups((o) => (o.includes(gid) ? o : [...o, gid]));
    setTimeout(() => document.getElementById(`group-${gid}`)?.scrollIntoView({ block: 'start' }), 80);
  };
  const saveEdit = useMutation({
    mutationFn: async () => {
      const src = { guest: { email: null }, details: guest.data?.details ?? null };
      const defs = [PHONE, NOTES, ID_TYPE, DISPLAY_NAME].filter((def) => draft[def.key as keyof typeof draft].trim() !== fieldValue(src, def.key).trim());
      if (defs.length) await saveFields(Object.fromEntries(defs.map((def) => [def.key, draft[def.key as keyof typeof draft].trim()])), { labels: defs.map((def) => def.label), kind: defs.length === 1 ? defs[0]!.reason : 'contact' });
    },
    onSuccess: () => setEditing(false),
    onError: (e) => toast.error(toAppError(e).message),
  });

  return (
    <div>
      <Button variant="ghost" className="mb-2 -ml-2 min-h-11" onClick={() => nav(-1)}><ArrowLeft className="size-4" aria-hidden /> Back</Button>
      <QueryState query={guest}>
        {({ guest: g, details: d, detailsError }) => {
          const src = { guest: g, details: d };
          const counts = groupCounts(src);
          const shownName = d?.display_name ?? g.name;
          const phone = fieldValue(src, PHONE.key) || g.phone || '';
          const stays = g.total_stays ?? 0;
          const openFollowUps = tasks.data?.rows.filter((t) => t.status !== 'done' && t.status !== 'cancelled').length ?? 0;
          return (
            <IdPhotoProvider guestId={id} guestName={g.name}>
              <div className="mx-auto max-w-2xl space-y-5 pb-16">
                <div className="flex flex-col items-center gap-2 text-center">
                  <GuestIdPanel guestId={id} guestName={g.name} details={d} />
                  <h1 className="text-[1.75rem] leading-tight font-semibold">{shownName}</h1>
                  {d?.display_name && d.display_name !== g.name && <p className="text-[0.9375rem] text-muted-foreground">{g.name}</p>}
                  <p className="text-[0.9375rem] text-muted-foreground">{g.source} · {stays} {stays === 1 ? 'stay' : 'stays'} · last stay {formatDate(g.last_stay_date, 'long')}</p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <IdStatusBadge guestId={id} guestName={g.name} details={d} />
                    {g.tier && <StatusBadge tone="info">{tierLabel(g.tier)}</StatusBadge>}
                    {d?.vip && g.tier !== 'vip' && <StatusBadge tone="info">VIP</StatusBadge>}
                  </div>
                  <Button variant="outline" className="min-h-11" disabled={!!detailsError} onClick={() => { setDraft({ contact_number: d?.contact_number ?? '', stay_preferences: d?.stay_preferences ?? '', id_type: d?.id_type ?? '', display_name: d?.display_name ?? '' }); setEditing(true); }}>Edit</Button>
                  {detailsError && <p className={caption}>Profile details unavailable: {detailsError}</p>}
                </div>

                <section className="space-y-2">
                  <Heading>Guest</Heading>
                  <div className="divide-y overflow-hidden rounded-xl border bg-card">
                    <div className="flex items-center">
                      <div className="min-w-0 flex-1"><FieldRow def={PHONE} value={phone} hint={phoneHint} onSave={(v) => (!v && !fieldValue(src, PHONE.key) ? Promise.resolve() : saveField(PHONE, v))} /></div>
                      {phone && <span className="pr-2 [&>button]:size-11"><CopyButton value={phone} /></span>}
                    </div>
                    <FieldRow def={NOTES} value={d?.stay_preferences ?? ''} shown={notesShown(d?.stay_preferences ?? '')} onSave={(v) => saveField(NOTES, v)} />
                    <FieldRow def={ID_TYPE} value={d?.id_type ?? ''} onSave={(v) => saveField(ID_TYPE, v)} />
                  </div>
                  <p className={`px-1 ${caption}`}>ID photos are for staff only and stay in Cascade’s private storage.</p>
                </section>

                <CompanionsSection key={`companions-${id}`} guestId={id} guestName={g.name} />

                <GuestUtilitiesCard propertyId={s.propertyId} guestName={g.name} />

                <section className="space-y-2">
                  <Heading>Optional</Heading>
                  <ProfileGroups
                    key={`groups-${id}`} guest={g} details={d} open={openGroups} saveField={saveField}
                    onOpenChange={(gid, o) => setOpenGroups((cur) => (o ? [...cur, gid] : cur.filter((x) => x !== gid)))}
                    tier={{ summary: g.tier ? `${tierLabel(g.tier)}${g.tier_manual ? ', set by hand' : ''}` : 'No tier yet', node: <TierCard key={`tier-${id}`} guestId={id} tier={g.tier} manual={g.tier_manual ?? null} events={timeline.data?.events} /> }}
                    history={{
                      summary: `${stays} ${stays === 1 ? 'stay' : 'stays'} · ${openFollowUps} open ${openFollowUps === 1 ? 'follow-up' : 'follow-ups'}`,
                      node: <>
                        <div className="space-y-2 px-4 py-3">
                          <p className="text-[0.9375rem] font-semibold">Follow-ups</p>
                          <QueryState query={tasks}>
                            {(t) => t.rows.length === 0 ? <p className="text-base text-muted-foreground">No follow-ups for this guest.</p> : (
                              <ul className="divide-y rounded-lg border">{t.rows.map((x) => <li key={x.id} className="flex flex-wrap items-center gap-2 px-3 py-2"><button type="button" className="min-h-11 text-left text-base font-semibold hover:underline" onClick={() => set({ task: x.id })}>{x.title}</button><span className={caption}>{x.purpose.replaceAll('_', ' ')}{x.due_at ? ` · due ${formatDateTime(x.due_at)}` : ''}{x.completed_at ? ` · completed ${formatDateTime(x.completed_at)}` : ''}</span><StatusBadge className="ml-auto" tone={x.status === 'done' ? 'good' : x.status === 'cancelled' ? 'neutral' : 'info'}>{x.status.replace('_', ' ')}</StatusBadge></li>)}</ul>
                            )}
                          </QueryState>
                          <Button variant="outline" className="min-h-11" onClick={() => setNewTask(true)}>Add follow-up</Button>
                        </div>
                        <div className="space-y-2 px-4 py-3">
                          <p className="text-[0.9375rem] font-semibold">Timeline</p>
                          {timeline.isPending ? <p className="text-base text-muted-foreground">Loading timeline…</p> : timeline.isError ? <ErrorState error={timeline.error} onRetry={() => void timeline.refetch()} /> : timeline.data.events.length === 0 ? <EmptyState title="No events yet" /> : (
                            <ul className="space-y-2 border-l pl-4 text-[0.9375rem]">
                              {timeline.data.events.map((e, i) => (
                                <li key={i} className="relative"><span aria-hidden className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-champagne" />
                                  <span className={`tabular ${caption}`}>{formatDateTime(e.at)}</span> · <span className="capitalize">{e.kind.replace('_', ' ')}</span> <span className={caption}>({e.source})</span>
                                  <div className="text-muted-foreground">
                                    {e.kind === 'stay' && <>{String(e.body.code)} · {formatDate(String(e.body.checkin))} → {formatDate(String(e.body.checkout))} · {String(e.body.nights)} nights · {String(e.body.status)}{e.body.accommodationTotal != null ? ` · ${formatPHP(String(e.body.accommodationTotal))}` : ''} · <Link to={`/bookings/${String(e.body.stayKind)}/${String(e.body.id)}`} className="underline">open</Link></>}
                                    {e.kind === 'follow_up' && <>{String(e.body.title)} · {String(e.body.status)}{e.body.completionNote ? ` · ${String(e.body.completionNote)}` : ''}</>}
                                    {e.kind === 'conversation' && <>{String(e.body.channel)} · {String(e.body.purpose ?? 'general')} · {String(e.body.status)}</>}
                                    {e.kind === 'consent' && <>{String(e.body.purpose)} · {String(e.body.status)}</>}
                                    {e.kind === 'lifecycle' && <>{String(e.body.eventType)} {e.body.code ? `(${String(e.body.code)})` : ''}</>}
                                    {e.kind === 'refund' && <>{formatPHP(String(e.body.amount))} · {String(e.body.rail ?? '')} · {String(e.body.status)}</>}
                                    {e.kind === 'profile_change' && <>{String(e.body.reason ?? 'profile updated')}</>}
                                    {e.kind === 'turnover_report' && <TurnoverReport body={e.body} />}
                                    {e.kind === 'merge' && <>merged guest {String(e.body.mergedGuestId)} · {String(e.body.reason)}</>}
                                  </div>
                                </li>
                              ))}
                            </ul>
                          )}
                          {timeline.data && !timeline.data.financeVisible && <p className={caption}>Financial events are hidden for this session.</p>}
                        </div>
                      </>,
                    }}
                    record={{
                      summary: 'Guest id, created, merge a duplicate',
                      node: <>
                        <div className="space-y-2 px-4 py-3">
                          <Field label="First stay">{formatDate(g.first_stay_date, 'long')}</Field>
                          <Field label="Guest id"><span className="inline-flex max-w-full flex-wrap items-center gap-1 break-all text-[0.8125rem]">{g.id}<span className="[&>button]:size-11"><CopyButton value={g.id} /></span></span></Field>
                          <Field label="Created">{formatDateTime(g.created_at)}</Field>
                          <Field label="Updated">{formatDateTime(d?.updated_at ?? g.updated_at)}</Field>
                          <Field label="Consent">{timeline.data ? (timeline.data.events.some((e) => e.kind === 'consent') ? 'see timeline' : 'no consent events recorded') : '…'}</Field>
                          {g.notes && <Field label="Notes">{g.notes}</Field>}
                        </div>
                        <button type="button" className="flex min-h-12 w-full items-center px-4 text-left text-base font-semibold text-primary hover:bg-muted" onClick={() => setMerging(true)}>Merge a duplicate…</button>
                      </>,
                    }}
                  />
                </section>

                <DetailSheet open={editing} onOpenChange={setEditing} title="Edit guest" description="Saves with an automatic reason. Each change can be undone for a few seconds.">
                  <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); saveEdit.mutate(); }}>
                    <div className="space-y-1"><label htmlFor="ed-phone" className="text-[0.9375rem] text-muted-foreground">Contact number</label><Input id="ed-phone" type="tel" inputMode="tel" autoComplete="off" placeholder={g.phone ?? undefined} value={draft.contact_number} onChange={(e) => setDraft({ ...draft, contact_number: e.target.value })} className="min-h-11 text-base md:text-base" /></div>
                    <div className="space-y-1"><label htmlFor="ed-notes" className="text-[0.9375rem] text-muted-foreground">Notes and stay preferences</label><Textarea id="ed-notes" placeholder="Requests, arrival time, occasions" value={draft.stay_preferences} onChange={(e) => setDraft({ ...draft, stay_preferences: e.target.value })} className="min-h-24 text-base md:text-base" /></div>
                    <div className="space-y-1"><label htmlFor="ed-idtype" className="text-[0.9375rem] text-muted-foreground">ID type</label><select id="ed-idtype" value={draft.id_type} onChange={(e) => setDraft({ ...draft, id_type: e.target.value })} className="min-h-11 w-full rounded-md border border-input bg-background px-3 text-base"><option value="">Not stated</option>{ID_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
                    <div className="space-y-1"><label htmlFor="ed-name" className="text-[0.9375rem] text-muted-foreground">Name shown to staff (optional)</label><Input id="ed-name" autoComplete="off" placeholder={g.name} value={draft.display_name} onChange={(e) => setDraft({ ...draft, display_name: e.target.value })} className="min-h-11 text-base md:text-base" /></div>
                    <div className="flex justify-end gap-2"><Button type="button" variant="outline" className="min-h-11" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" className="min-h-11" disabled={saveEdit.isPending}>{saveEdit.isPending ? 'Saving…' : 'Save'}</Button></div>
                    <div className="space-y-2">
                      <Heading>Optional</Heading>
                      <div className="divide-y overflow-hidden rounded-xl border bg-card">
                        {GROUP_IDS.map(([gid, title]) => {
                          const c = gid === 'contact' ? counts.contact : gid === 'private' ? counts.private : gid === 'tags' ? counts.tags : null;
                          return <button key={gid} type="button" className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-base hover:bg-muted" onClick={() => showGroup(gid)}><span className="flex-1">{title}</span>{c && <span className={caption}>{c.filled} of {c.total}</span>}<ChevronRight className="size-4 text-muted-foreground" aria-hidden /></button>;
                        })}
                      </div>
                      <p className={`px-1 ${caption}`}>Opens that group on the guest page.</p>
                    </div>
                  </form>
                </DetailSheet>
                {reasonSheet}
                <MergeSheet open={merging} guestId={id} guestName={g.name} onClose={() => setMerging(false)} />
              </div>
            </IdPhotoProvider>
          );
        }}
      </QueryState>
      <DetailSheet open={newTask || !!editingTask} onOpenChange={(o) => { if (!o) { setNewTask(false); set({ task: '' }); } }} title={editingTask ? 'Follow-up' : 'New follow-up'}>
        <FollowUpForm guestId={id} existing={editingTask} onDone={() => { setNewTask(false); set({ task: '' }); }} />
      </DetailSheet>
    </div>
  );
}
