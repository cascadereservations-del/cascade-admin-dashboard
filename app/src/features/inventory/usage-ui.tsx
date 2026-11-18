import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { formatDay } from '@/lib/dates';
import { toAppError } from '@/lib/errors';
import { Section } from '@/components/data/page-header';
import { StatusBadge } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchUsageKpi, recordMissedRefill, type Item, type UsageKpi } from './api';
import { pillState, pillText, trimNumber, USAGE_TONE } from './usage';

// s120 usage learning screens. Everything here is quiet when the server has no usage data yet.

export function useUsageKpi() {
  const s = useSession();
  return useQuery({ queryKey: ['usage-kpi', s.propertyId], queryFn: () => fetchUsageKpi(s.propertyId) });
}

/** The list pill. Text always carries the state; the badge adds a glyph on top of the colour. */
export function UsagePill({ item, short }: { item: Item; short?: boolean }) {
  const state = pillState(item);
  const text = short ? state : pillText(item);
  return state && text ? <StatusBadge tone={USAGE_TONE[state]} className="whitespace-nowrap">{text}</StatusBadge> : null;
}

function Tile({ value, label, words, children }: { value: string; label: string; words?: boolean; children?: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className={words ? 'text-base font-semibold' : 'text-2xl font-semibold tabular'}>{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
      {children}
    </div>
  );
}

export function UsageTiles({ kpi }: { kpi: UsageKpi }) {
  const pct = kpi.itemsTotal > 0 ? Math.min(100, Math.round((kpi.itemsMeasured / kpi.itemsTotal) * 100)) : 0;
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="grid grid-cols-2 gap-3">
        <Tile value={`${kpi.itemsMeasured} of ${kpi.itemsTotal}`} label="items with measured usage">
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Items with measured usage" aria-valuemin={0} aria-valuemax={kpi.itemsTotal} aria-valuenow={kpi.itemsMeasured}>
            <div className="h-full bg-chart-4" style={{ width: `${pct}%` }} />
          </div>
        </Tile>
        {kpi.medianForecastError === null
          ? <Tile words value="Not enough counts yet" label="forecast error (median, last counts)" />
          : <Tile value={`${Math.round(kpi.medianForecastError * 100)}%`} label="forecast error (median, last counts)" />}
        <Tile value={String(kpi.underFourteenDays.count)} label="items under 14 days of stock" />
        <Tile value={String(kpi.waitingForRefill.count)} label="waiting for a recorded refill" />
      </div>
      <p className="mt-3 text-xs text-muted-foreground">Targets: measured goes up, forecast error goes down each month. Rolling 90-day window.</p>
    </div>
  );
}

/** KPI page card. Hidden while loading and when the server function is missing; a real failure gets one quiet line. */
export function UsageLearningCard() {
  const q = useUsageKpi();
  if (q.isPending || (!q.isError && !q.data)) return null;
  return (
    <Section title="Usage learning">
      {q.isError ? <p className="text-sm text-muted-foreground">{toAppError(q.error).message}</p> : <UsageTiles kpi={q.data!} />}
    </Section>
  );
}

type Waiting = UsageKpi['waitingForRefill']['items'][number];

/** One prompt. Yes opens one field: how much was added. It only corrects the usage record; stock and purchases are never written. */
function RestockPrompt({ w, unit }: { w: Waiting; unit?: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) field.current?.focus(); }, [open]);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['usage-kpi'] }); void qc.invalidateQueries({ queryKey: ['catalogue'] }); };
  const save = useMutation({
    mutationFn: () => recordMissedRefill(w.id, qty.trim()),
    onSuccess: (r) => {
      if (r.ok) { toast.success('Refill recorded'); setNotice(null); refresh(); return; } // a replay is a success too
      if (r.reason === 'too_small') { setNotice(`At least ${trimNumber(r.minimum) ?? '—'} must have been added to reach this count.`); return; }
      setNotice(r.reason === 'not_waiting' ? 'This was already settled.' : 'This item is not in usage learning.');
      refresh();
    },
    onError: (e) => setNotice(toAppError(e).message),
  });
  const since = formatDay(w.since);
  const n = Number(qty);
  const valid = qty.trim() !== '' && Number.isFinite(n) && n > 0;
  return (
    <div className="rounded-lg border border-warn bg-card p-3">
      <p className="font-medium">{w.name} went {trimNumber(w.qtyBefore) ?? '—'} → {trimNumber(w.qtyNow) ?? '—'}</p>
      <p className="mt-0.5 text-sm text-muted-foreground">Was stock added{since ? ` since ${since}` : ''}? Without it this interval is skipped so usage stays accurate.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button className="min-h-11" aria-expanded={open} onClick={() => setOpen(true)}>Yes, record refill</Button>
        <Button className="min-h-11" variant="outline" asChild><Link to="/inventory/counts">No, recount</Link></Button>
      </div>
      {open && (
        <form className="mt-3 space-y-2" onSubmit={(e) => { e.preventDefault(); if (valid) save.mutate(); }}>
          <Label htmlFor={`refill-${w.id}`}>How much was added?</Label>
          <div className="flex items-center gap-2">
            <Input ref={field} id={`refill-${w.id}`} inputMode="decimal" className="min-h-11 w-32 text-base" value={qty} aria-describedby={`refill-help-${w.id}`} onChange={(e) => { setQty(e.target.value); setNotice(null); }} />
            {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
            <Button type="submit" className="min-h-11" disabled={!valid || save.isPending}>Save refill</Button>
          </div>
          <p id={`refill-help-${w.id}`} className="text-xs text-muted-foreground">This corrects the usage record. Stock stays at {trimNumber(w.qtyNow) ?? '—'}.</p>
          {notice && <p role="status" className="text-sm">{notice}</p>}
        </form>
      )}
    </div>
  );
}

/** One card per item whose last count was higher than expected. Yes opens a field in the card; No goes to the counts page, where the item stays in learning. */
export function RestockPrompts({ items, unitOf }: { items: Waiting[]; unitOf?: (id: string) => string | undefined }) {
  if (items.length === 0) return null;
  return <div className="mb-4 space-y-2">{items.map((w) => <RestockPrompt key={w.id} w={w} unit={unitOf?.(w.id)} />)}</div>;
}
