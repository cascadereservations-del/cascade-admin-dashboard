import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Pencil, Plus, Sparkles } from 'lucide-react';
import { useSession } from '@/auth/session';
import { formatDate } from '@/lib/dates';
import { DetailSheet } from '@/components/data/detail-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchTimeline } from './api';
import { confirmStayStaying, fetchStayRows, fetchStayStaying, keyFor, MSG_GONE, MSG_STALE_KEPT, NAMES_MAX, setStayStaying, STAYING_KEY, stayingError, type StayRow, type StayStaying } from './staying';

const SOURCE_LABEL: Record<string, string> = { airbnb: 'Airbnb', direct: 'Direct' };
const stayTitle = (r: StayRow) => `${formatDate(r.checkin)} to ${formatDate(r.checkout)}${SOURCE_LABEL[r.kind] ? ` · ${SOURCE_LABEL[r.kind]}` : ''}`;

/** What a row shows: the typed names with who typed them, else the pending Cassy suggestion, else nothing recorded. */
export function stayingState(s: StayStaying | undefined): { value: string | null; tag: 'You' | 'Staff' | 'Cassy suggested' | null; action: 'Edit' | 'Review' | 'Add' } {
  if (s?.names) return { value: s.names, tag: s.source === 'staff' ? 'Staff' : 'You', action: 'Edit' };
  if (s?.suggestion) return { value: s.suggestion, tag: 'Cassy suggested', action: 'Review' };
  return { value: null, tag: null, action: 'Add' };
}

/** Per-booking "Who is staying" on the guest page. Hidden until the admin read function exists. */
export function StayingSection({ guestId }: { guestId: string }) {
  const s = useSession();
  const qc = useQueryClient();
  const canEdit = s.caps.can('manage_operations');
  const timeline = useQuery({ queryKey: ['timeline', guestId], queryFn: () => fetchTimeline(guestId) });
  const events = timeline.data?.events;
  const stays = useQuery({ queryKey: ['stay-rows', s.propertyId, guestId, events?.length ?? 0], queryFn: () => fetchStayRows(s.propertyId, events!, qc), enabled: !!events });
  const uids = stays.data?.map((r) => r.uid) ?? [];
  const staying = useQuery({ queryKey: [...STAYING_KEY(s.propertyId), uids.join(',')], queryFn: () => fetchStayStaying(s.propertyId, uids), enabled: uids.length > 0, retry: false });
  const [open, setOpen] = useState<StayRow | null>(null);
  if (!staying.data || !stays.data?.length) return null; // read function absent, no bookings, loading or failed: the page works without it
  const byUid = staying.data;
  return (
    <section className="space-y-2" aria-label="Who is staying, by booking">
      <h2 className="px-1 text-[0.9375rem] font-semibold text-muted-foreground">Who is staying, by booking</h2>
      <div className="divide-y overflow-hidden rounded-xl border bg-card">
        {stays.data.map((r) => {
          const st = stayingState(byUid.get(r.uid));
          return (
            <div key={r.uid} data-slot="staying-row" className="flex min-h-14 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{stayTitle(r)}</p>
                <p className="flex flex-wrap items-center gap-2 text-[0.9375rem]">
                  <span className="text-muted-foreground">Who is staying:</span>
                  {st.value ? <span className="font-semibold [overflow-wrap:anywhere]">{st.value}</span> : <span className="text-muted-foreground">Not recorded</span>}
                  {st.tag && <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.8125rem] font-semibold ${st.tag === 'Cassy suggested' ? 'bg-[var(--tile-gold)] text-[var(--tile-gold-fg)]' : 'bg-muted text-muted-foreground'}`}>{st.tag === 'Cassy suggested' && <Sparkles size={14} strokeWidth={1.75} aria-hidden />}{st.tag}</span>}
                </p>
                {st.tag === 'Cassy suggested' && <p className="text-[0.8125rem] text-muted-foreground">Not confirmed. Staff have not accepted it.</p>}
              </div>
              {canEdit && (
                <Button variant="outline" className="min-h-11" onClick={() => setOpen(r)} aria-label={`${st.action} who is staying, ${stayTitle(r)}`}>
                  {st.action === 'Edit' ? <Pencil size={16} strokeWidth={1.75} aria-hidden /> : st.action === 'Add' ? <Plus size={16} strokeWidth={1.75} aria-hidden /> : null}{st.action}
                </Button>
              )}
            </div>
          );
        })}
      </div>
      <p className="px-1 text-[0.8125rem] text-muted-foreground">The booker is the guest on the booking. The people staying can be different.</p>
      {open && <StayingDialog key={open.uid} stay={open} current={byUid.get(open.uid)} onClose={() => setOpen(null)} onRefresh={() => qc.invalidateQueries({ queryKey: STAYING_KEY(s.propertyId) })} />}
    </section>
  );
}

export function StayingDialog({ stay, current, onClose, onRefresh }: { stay: StayRow; current: StayStaying | undefined; onClose: () => void; onRefresh: () => Promise<unknown> | void }) {
  const s = useSession();
  const reviewing = !current?.names && !!current?.suggestion;
  const shown = (c: StayStaying | undefined) => c?.names ?? c?.suggestion ?? '';
  const [names, setNames] = useState(shown(current));
  const baseline = useRef(shown(current)); // what the box held when it was last filled from the server
  const resetOnRefresh = useRef(false);
  const [note, setNote] = useState<string | null>(null);
  const sent = useRef<{ key: string; names: string } | null>(null); // a new key whenever the names differ from the last sent
  const version = current?.version ?? 0;
  const done = () => { toast.success('Names saved'); void onRefresh(); onClose(); };
  // A refused-as-stale save shows the refreshed names only when the box is still untouched; typed text is never thrown away.
  useEffect(() => { if (resetOnRefresh.current) { resetOnRefresh.current = false; baseline.current = shown(current); setNames(baseline.current); } }, [current]);
  const fail = (e: unknown) => {
    const r = stayingError(e);
    const typed = r.stale && names !== baseline.current;
    resetOnRefresh.current = r.stale && !typed;
    setNote(typed ? MSG_STALE_KEPT : r.text);
    if (r.stale) void onRefresh();
  };
  const save = useMutation({
    mutationFn: () => { const n = names.trim(); sent.current = keyFor(sent.current, n); return setStayStaying(s.propertyId, stay.uid, n, version, sent.current.key); },
    onSuccess: done,
    onError: fail,
  });
  const answer = useMutation({
    mutationFn: (accept: boolean) => confirmStayStaying(s.propertyId, stay.uid, accept, version),
    onSuccess: (r, accept) => {
      if (r.ok === false) { setNote(MSG_GONE); void onRefresh(); return; }
      if (accept) done(); else { toast.success('Suggestion set aside'); void onRefresh(); onClose(); }
    },
    onError: fail,
  });
  const busy = save.isPending || answer.isPending;
  const tooLong = names.trim().length > NAMES_MAX;
  const asSuggested = reviewing && names.trim() === current?.suggestion;
  const canSave = !busy && !tooLong && (!!names.trim() || (!reviewing && !!current?.names)); // a blank save clears typed names
  const use = () => { setNote(null); if (asSuggested) answer.mutate(true); else save.mutate(); };
  return (
    <DetailSheet open onOpenChange={(o) => { if (!o) onClose(); }} title={reviewing ? 'Review the suggestion' : 'Who is staying'} description={`${stayTitle(stay)}. Type names only.`}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (canSave) use(); }}>
        {reviewing && <p className="text-base text-muted-foreground">Cassy read these names from the booking. Nothing is saved until you choose.</p>}
        <div className="space-y-1">
          <label htmlFor="staying-names" className="text-[0.9375rem] text-muted-foreground">Who is staying</label>
          <Input id="staying-names" autoComplete="off" value={names} onChange={(e) => { setNames(e.target.value); setNote(null); }} className="min-h-11 text-base md:text-base" aria-invalid={tooLong || undefined} />
          {tooLong && <p role="alert" className="text-base text-destructive">Keep the names under {NAMES_MAX} characters.</p>}
        </div>
        {note && <p role="alert" className="text-base text-destructive">{note}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" className="min-h-11" onClick={onClose}>Cancel</Button>
          {reviewing && <Button type="button" variant="outline" className="min-h-11" disabled={busy} onClick={() => { setNote(null); answer.mutate(false); }}>Not these</Button>}
          <Button type="submit" className="min-h-11" disabled={!canSave}>{busy ? 'Saving…' : reviewing ? 'Use these' : 'Save'}</Button>
        </div>
      </form>
    </DetailSheet>
  );
}
