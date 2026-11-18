import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/auth/session';
import { formatDay } from '@/lib/dates';
import { toAppError } from '@/lib/errors';
import { Section } from '@/components/data/page-header';
import { StatusBadge } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { fetchUsageKpi, type Item, type UsageKpi } from './api';
import { pillText, trimNumber, USAGE_TONE, usageStateOf } from './usage';

// s120 usage learning screens. Everything here is quiet when the server has no usage data yet.

export function useUsageKpi() {
  const s = useSession();
  return useQuery({ queryKey: ['usage-kpi', s.propertyId], queryFn: () => fetchUsageKpi(s.propertyId) });
}

/** The list pill. Text always carries the state; the badge adds a glyph on top of the colour. */
export function UsagePill({ item, short }: { item: Item; short?: boolean }) {
  const state = usageStateOf(item);
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

/** One card per item whose last count was higher than expected. Yes opens the receipt form; No goes to the counts page. */
export function RestockPrompts({ items, onRecord }: { items: UsageKpi['waitingForRefill']['items']; onRecord: (id: string) => void }) {
  if (items.length === 0) return null;
  return (
    <div className="mb-4 space-y-2">
      {items.map((w) => {
        const since = formatDay(w.since);
        return (
          <div key={w.id} className="rounded-lg border border-warn bg-card p-3">
            <p className="font-medium">{w.name} went {trimNumber(w.qtyBefore) ?? '—'} → {trimNumber(w.qtyNow) ?? '—'}</p>
            <p className="mt-0.5 text-sm text-muted-foreground">Was stock added{since ? ` since ${since}` : ''}? Without it this interval is skipped so usage stays accurate.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button className="min-h-11" onClick={() => onRecord(w.id)}>Yes, record refill</Button>
              <Button className="min-h-11" variant="outline" asChild><Link to="/inventory/counts">No, recount</Link></Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Shown in the item panel after a receipt that started from a restock prompt. */
export function RefillNote() {
  return (
    <div role="status" className="rounded-lg border border-warn bg-card p-3">
      <p className="text-sm">Refill recorded. Count this item again so the stock number is right.</p>
      <Button className="mt-2 min-h-11" variant="outline" asChild><Link to="/inventory/counts">Go to counts</Link></Button>
    </div>
  );
}
