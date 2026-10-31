import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { formatDate, formatDateTime } from '@/lib/dates';
import { toAppError } from '@/lib/errors';
import { Section } from '@/components/data/page-header';
import { PhotoLightbox, type LightboxItem } from '@/components/data/photo-lightbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchReportBlocks, correctionProblem, resolveReportBlock, type ReportBlockAction, type ReportBlockRow } from './report-blocks-api';

// s101: lists every meter photo mismatch that is holding up a cleaning report, so an admin can answer it here.
const show = (v: number | null) => (v === null ? 'not read' : String(v));

function BlockCard({ row }: { row: ReportBlockRow }) {
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [fixing, setFixing] = useState(false);
  const [electric, setElectric] = useState(row.typed_electric === null ? '' : String(row.typed_electric));
  const [water, setWater] = useState(row.typed_water === null ? '' : String(row.typed_water));
  const [viewer, setViewer] = useState<number | null>(null);
  const items: LightboxItem[] = [
    ...(row.electric_url ? [{ src: row.electric_url, label: 'Electric meter photo' }] : []),
    ...(row.water_url ? [{ src: row.water_url, label: 'Water meter photo' }] : []),
  ];
  const problem = fixing ? correctionProblem(row, electric, water) : null;
  const answer = useMutation({
    mutationFn: (action: ReportBlockAction) => resolveReportBlock(row.reading_id, action, action === 'correct_numbers' ? Number(electric) : null, action === 'correct_numbers' ? Number(water) : null, note),
    onSuccess: () => {
      toast.success('Answered. The next cleaning report can go through.');
      void qc.invalidateQueries({ queryKey: ['report-blocks'] });
      void qc.invalidateQueries({ queryKey: ['cleanings'] });
      void qc.invalidateQueries({ queryKey: ['cleaning'] });
      void qc.invalidateQueries({ queryKey: ['meter-baseline'] });
    },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const busy = answer.isPending;
  const meters: Array<[string, number | null, number | null, number | null, string | null]> = [
    ['Electric', row.typed_electric, row.photo_electric, row.prev_electric, row.photo_note_electric],
    ['Water', row.typed_water, row.photo_water, row.prev_water, row.photo_note_water],
  ];
  const notes = meters.filter((m) => m[4]).map((m) => `${m[0]}: ${m[4]}`);
  return (
    <li className="space-y-3 rounded-lg border bg-card p-4 text-sm">
      <p className="font-medium">The report was accepted. Check the photo against the typed numbers and pick one answer.</p>
      <p className="text-muted-foreground">
        {row.cleaner_name ?? 'A cleaner'} · stay ending {formatDate(row.checkout_date, 'long')} · recorded {formatDateTime(row.recorded_at)}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-xs text-muted-foreground"><tr><th className="py-1 pr-3 font-normal"><span className="sr-only">Meter</span></th><th className="py-1 pr-3 font-normal">Typed</th><th className="py-1 pr-3 font-normal">Photo read</th><th className="py-1 font-normal">Last reading</th></tr></thead>
          <tbody>
            {meters.map(([name, typed, photo, prev]) => (
              <tr key={name} className="border-t"><th scope="row" className="py-1 pr-3 font-medium">{name}</th><td className="tabular py-1 pr-3">{show(typed)}</td><td className="tabular py-1 pr-3">{show(photo)}</td><td className="tabular py-1">{show(prev)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {notes.length > 0 && <p className="text-muted-foreground">Photo reader note: {notes.join(' · ')}</p>}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {items.map((it, i) => (
            <button key={it.label} type="button" onClick={() => setViewer(i)} className="overflow-hidden rounded border" aria-label={`Enlarge: ${it.label}`}>
              <img src={it.src} alt={it.label} loading="lazy" className="h-28 w-40 object-cover" />
            </button>
          ))}
        </div>
      )}
      <PhotoLightbox items={items} index={viewer} onIndexChange={setViewer} onClose={() => setViewer(null)} />
      <label className="block space-y-1">
        <span className="text-xs text-muted-foreground">Note (optional)</span>
        <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} disabled={busy} />
      </label>
      {fixing && (
        <div className="space-y-1">
          <div className="grid max-w-md grid-cols-2 gap-3">
            <label className="space-y-1"><span className="text-xs text-muted-foreground">Electric (kWh)</span><Input inputMode="decimal" value={electric} onChange={(e) => setElectric(e.target.value)} disabled={busy} /></label>
            <label className="space-y-1"><span className="text-xs text-muted-foreground">Water (m3)</span><Input inputMode="decimal" value={water} onChange={(e) => setWater(e.target.value)} disabled={busy} /></label>
          </div>
          {problem && <p className="text-xs text-destructive" role="alert">{problem}</p>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {fixing ? (
          <>
            <Button size="sm" onClick={() => answer.mutate('correct_numbers')} disabled={busy || problem !== null}>{busy ? 'Saving…' : 'Save corrected numbers'}</Button>
            <Button size="sm" variant="ghost" onClick={() => setFixing(false)} disabled={busy}>Cancel</Button>
          </>
        ) : (
          <>
            <Button size="sm" onClick={() => answer.mutate('typed_is_right')} disabled={busy}>Typed numbers are right</Button>
            <Button size="sm" variant="outline" onClick={() => setFixing(true)} disabled={busy}>Correct the numbers</Button>
          </>
        )}
      </div>
      {answer.isError && <p className="text-xs text-destructive" role="alert">{toAppError(answer.error).message}</p>}
    </li>
  );
}

export function ReportBlocksCard() {
  const s = useSession();
  // Same gate as the server (inspect_cleaning): a cleaner must never see buttons that clear her own hold.
  const canInspect = s.caps.can('inspect_cleaning');
  const q = useQuery({ queryKey: ['report-blocks', s.propertyId], queryFn: () => fetchReportBlocks(s.propertyId), refetchInterval: 60_000, enabled: canInspect });
  if (!canInspect) return null;
  return (
    <div className="mb-6">
      <Section title="Meter readings to check">
        {q.isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : q.isError ? <p className="text-sm text-destructive">{toAppError(q.error).message}</p> : q.data.length === 0 ? <p className="text-sm text-muted-foreground">No meter readings to check.</p> : (
          <ul className="space-y-3">{q.data.map((r) => <BlockCard key={r.reading_id} row={r} />)}</ul>
        )}
      </Section>
    </div>
  );
}
