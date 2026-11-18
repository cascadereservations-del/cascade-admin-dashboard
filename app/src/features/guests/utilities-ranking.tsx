import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowUp, Droplet, Zap } from 'lucide-react';
import { useSession } from '@/auth/session';
import { toAppError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { fetchStayUtilities, UTILITIES_KEY } from './utilities-api';
import { estimateWords, fmtValue, rankStays, FLAG_RATIO, type Metric } from './utilities-math';

// s119 lane U. Type sizes come from the v5 tokens (--t1..--t4) with rem fallbacks until they are merged.
export const T = { t1: 'text-[length:var(--t1,1.75rem)]', t2: 'text-[length:var(--t2,1.0625rem)]', t3: 'text-[length:var(--t3,0.9375rem)]', t4: 'text-[length:var(--t4,0.8125rem)]' };
const SHOW_FIRST = 10;

export const nightsText = (n: number | null) => (n === null ? 'nights not known' : `${n} ${n === 1 ? 'night' : 'nights'}`);
export const shortDate = (d: string | null) => (d ? new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Date not known');

/** A bar scaled to max, with a marker at the average. Decorative: the number beside it carries the meaning. */
export function UsageBar({ value, avg, max, metric }: { value: number; avg: number | null; max: number; metric: Metric }) {
  const pct = (x: number) => `${Math.min(100, Math.max(0, (x / max) * 100))}%`;
  return (
    <div aria-hidden="true" className="relative my-1.5 h-3 rounded-md bg-muted">
      <i className="absolute inset-y-0 left-0 rounded-md" style={{ width: pct(value), background: metric === 'kwh' ? 'var(--elec, var(--chart-1))' : 'var(--water, var(--chart-2))' }} />
      {avg !== null && <span className="absolute -inset-y-1 w-0.5 bg-foreground" style={{ left: pct(avg) }} />}
    </div>
  );
}

/** Neutral badge with an arrow: shape, not colour, says "above average". Never red. */
export function AboveAverage() {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-0.5 text-foreground', T.t4)}>
      <ArrowUp aria-hidden className="size-3.5" />Above average
    </span>
  );
}

export function UtilitiesRanking({ propertyId }: { propertyId: string }) {
  const s = useSession();
  const allowed = s.caps.can('manage_staff'); // owner and admin only
  const [metric, setMetric] = useState<Metric>('kwh');
  const [all, setAll] = useState(false);
  const q = useQuery({ queryKey: UTILITIES_KEY(propertyId), queryFn: () => fetchStayUtilities(propertyId), enabled: allowed, staleTime: 60_000 });
  if (!allowed) return null;

  const r = rankStays(q.data ?? [], metric);
  const rows = all ? r.ranked : r.ranked.slice(0, SHOW_FIRST);
  const max = (r.ranked[0]?.value ?? 0) * 1.08 || 1;
  const top = r.ranked[0];

  return (
    <section aria-labelledby="util-title" className="space-y-3">
      <div>
        <h2 id="util-title" className={cn('font-semibold', T.t2)}>Use per stay</h2>
        <p className={cn('text-muted-foreground', T.t3)}>{q.data ? `${r.avg.stays} stays · ${r.avg.nights} nights` : 'Loading readings'}</p>
      </div>
      <div role="group" aria-label="Measure" className="flex gap-2">
        {([['kwh', 'Electricity', Zap], ['m3', 'Water', Droplet]] as const).map(([m, label, Icon]) => (
          <button key={m} type="button" aria-pressed={metric === m} onClick={() => setMetric(m)}
            className={cn('inline-flex min-h-11 items-center gap-1.5 rounded-full border px-4', T.t3, metric === m ? 'border-foreground bg-foreground text-background' : 'bg-card')}>
            <Icon aria-hidden className="size-4" />{label}
          </button>
        ))}
      </div>
      {q.isError && <p role="alert" className={T.t3}>{toAppError(q.error).message}</p>}
      {q.data && !r.ranked.length && <p className={cn('text-muted-foreground', T.t3)}>No stays with a meter reading yet. They appear here after a cleaner sends the checkout readings.</p>}
      {top && r.avg.avg !== null && (
        <>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border bg-card p-3"><div className={cn('font-bold leading-tight', T.t1)}>{fmtValue(r.avg.avg, metric)}</div><div className={cn('text-muted-foreground', T.t4)}>average a night</div></div>
            <div className="rounded-xl border bg-card p-3"><div className={cn('font-bold leading-tight', T.t1)}>{fmtValue(top.value, metric)}</div><div className={cn('text-muted-foreground', T.t4)}>highest stay · {shortDate(top.stay.date)} · {nightsText(top.stay.nights)}</div></div>
          </div>
          <p className={cn('text-muted-foreground', T.t4)}>Above average means {FLAG_RATIO} times the average of these stays or more.</p>
          <ol aria-live="polite" className="overflow-hidden rounded-xl border bg-card">
            {rows.map(({ stay, value, high }) => (
              <li key={stay.sessionId} className="flex min-h-14 items-center gap-2.5 border-t px-4 py-1.5 first:border-t-0">
                <span className={cn('w-24 shrink-0 leading-tight', T.t3)}>{stay.guest ?? 'Guest not named'}<small className={cn('block text-muted-foreground', T.t4)}>{shortDate(stay.date)} · {nightsText(stay.nights)}</small></span>
                <span className="min-w-0 flex-1"><UsageBar value={value} avg={r.avg.avg} max={max} metric={metric} /></span>
                <span className={cn('min-w-14 text-right', T.t3)}>{fmtValue(value, metric)}{high && <><br /><AboveAverage /></>}</span>
              </li>
            ))}
          </ol>
          {r.ranked.length > SHOW_FIRST && (
            <button type="button" onClick={() => setAll((v) => !v)} className={cn('min-h-11 rounded-full border bg-card px-4', T.t3)}>{all ? 'Show fewer' : `Show all ${r.ranked.length} stays`}</button>
          )}
        </>
      )}
      {r.estimated.length > 0 && (
        <div className="space-y-1">
          <h3 className={cn('font-semibold', T.t3)}>Estimated, left out of the average</h3>
          <ul className={cn('text-muted-foreground', T.t4)}>
            {r.estimated.map((e) => <li key={e.sessionId}>{e.guest ?? 'Guest not named'} · {shortDate(e.date)} · {estimateWords(e.estimate ?? '')}</li>)}
          </ul>
        </div>
      )}
      <p className={cn('text-muted-foreground', T.t4)}>Measured from the meter reading at each checkout, so it includes the cleaning visit. A one-night stay reads higher for that reason. The newest 60 readings are used.</p>
    </section>
  );
}
