import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { toAppError } from '@/lib/errors';
import { formatDate } from '@/lib/dates';
import { DetailSheet } from '@/components/data/detail-sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchGuests, mergeGuests, previewMerge, type GuestRow } from './api';

// Merge a duplicate: find the other record by name or phone, check the server preview, give a reason, confirm.
// A merge cannot be undone from the screen, so it keeps a typed or chosen reason and a second tap.
export const MERGE_CHIPS = ['Same phone', 'Same person, booked twice'] as const;

export function MergeSheet({ guestId, guestName, open, onClose }: { guestId: string; guestName: string; open: boolean; onClose: () => void }) {
  const s = useSession();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [pick, setPick] = useState<GuestRow | null>(null);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => { if (!open) { setQ(''); setDebounced(''); setPick(null); setReason(''); setConfirm(false); } }, [open]);

  const found = useQuery({ queryKey: ['merge-search', s.propertyId, debounced], queryFn: () => fetchGuests(s.propertyId, { q: debounced }), enabled: open && debounced.length >= 2 });
  const preview = useQuery({ queryKey: ['merge-preview', guestId, pick?.id], queryFn: () => previewMerge(guestId, pick!.id), enabled: !!pick });
  const p = preview.data as { reservations?: number; inquiries?: number; followUps?: number; conversations?: number; sharedContact?: boolean } | undefined;
  const merge = useMutation({
    mutationFn: () => mergeGuests(guestId, pick!.id, reason.trim()),
    onSuccess: () => { toast.success('Guests merged. The other record is now inactive and linked here.'); void qc.invalidateQueries(); onClose(); },
    onError: (e) => { setConfirm(false); toast.error(toAppError(e).message); },
  });
  const rows = (found.data?.rows ?? []).filter((r) => r.id !== guestId);

  return (
    <DetailSheet open={open} onOpenChange={(o) => { if (!o && !merge.isPending) onClose(); }} title="Merge a duplicate" description={<>The other record moves into <b>{guestName}</b>. Its stays, messages and follow-ups come along.</>}>
      {!pick ? (
        <div className="space-y-3">
          <label htmlFor="merge-q" className="text-[0.9375rem] text-muted-foreground">Find the other record</label>
          <Input id="merge-q" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or phone" autoComplete="off" className="min-h-11 text-base" />
          {debounced.length >= 2 && found.isPending && <p className="text-base text-muted-foreground">Searching…</p>}
          {found.isError && <p role="alert" className="text-base">Search did not load. Try again.</p>}
          {found.data && rows.length === 0 && <p className="text-base text-muted-foreground">No match.</p>}
          {rows.length > 0 && <ul className="divide-y rounded-xl border">{rows.map((r) => (
            <li key={r.id}><button type="button" className="flex min-h-14 w-full flex-col items-start justify-center px-4 py-2 text-left hover:bg-muted" onClick={() => setPick(r)}>
              <span className="text-base font-semibold">{r.name}</span>
              <span className="text-[0.9375rem] text-muted-foreground">{r.phone || r.contact_number || 'no phone'} · last stay {formatDate(r.last_stay_date, 'long')}</span>
            </button></li>
          ))}</ul>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl border px-4 py-2">
            <span className="min-w-0 flex-1"><span className="block text-base font-semibold">{pick.name}</span><span className="block text-[0.9375rem] text-muted-foreground">{pick.phone || pick.contact_number || 'no phone'}</span></span>
            <Button type="button" variant="outline" className="min-h-11" disabled={merge.isPending} onClick={() => { setPick(null); setReason(''); setConfirm(false); }}>Change</Button>
          </div>
          {preview.isPending && <p className="text-base text-muted-foreground">Checking what moves…</p>}
          {preview.isError && <p role="alert" className="text-base">{toAppError(preview.error).message}</p>}
          {p && <>
            <p className="text-base">Affects {p.reservations ?? 0} reservations, {p.inquiries ?? 0} inquiries, {p.followUps ?? 0} follow-ups, {p.conversations ?? 0} conversations.</p>
            <p className="text-[0.9375rem] text-muted-foreground">{p.sharedContact ? 'Same phone or e-mail on both. Confirm they are the same person.' : 'No shared contact. A name alone cannot be merged.'}</p>
            {p.sharedContact && <>
              <div className="flex flex-wrap gap-2">{MERGE_CHIPS.map((c) => <Button key={c} type="button" variant={reason === c ? 'default' : 'outline'} aria-pressed={reason === c} className="min-h-11" onClick={() => { setReason(c); setConfirm(false); }}>{c}</Button>)}</div>
              <label htmlFor="merge-reason" className="block text-[0.9375rem] text-muted-foreground">Or write a reason</label>
              <Input id="merge-reason" maxLength={500} value={MERGE_CHIPS.some((c) => c === reason) ? '' : reason} onChange={(e) => { setReason(e.target.value); setConfirm(false); }} className="min-h-11 text-base" autoComplete="off" />
              <Button type="button" variant={confirm ? 'destructive' : 'default'} className="min-h-11 w-full" disabled={reason.trim().length < 3 || merge.isPending} onClick={() => { if (confirm) merge.mutate(); else setConfirm(true); }}>{merge.isPending ? 'Merging…' : confirm ? 'Tap again to merge. This cannot be undone.' : 'Merge'}</Button>
            </>}
          </>}
        </div>
      )}
    </DetailSheet>
  );
}
