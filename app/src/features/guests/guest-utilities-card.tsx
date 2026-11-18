import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/auth/session';
import { toAppError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import { fetchStayUtilities, UTILITIES_KEY } from './utilities-api';
import { averageOf, estimateWords, fmtValue, guestMatch, isHigh, perNight, READ_AS_HINT_UNDER, type Metric } from './utilities-math';
import { AboveAverage, nightsText, shortDate, T, UsageBar } from './utilities-ranking';

// s119 lane U. Electricity and water for one guest, against the house average of the same readings.
// A heavy reading is a fact about a stay, not a verdict on the guest.
export function GuestUtilitiesCard({ propertyId, guestName }: { propertyId: string; guestName: string }) {
  const s = useSession();
  const allowed = s.caps.can('manage_staff'); // owner and admin only
  const q = useQuery({ queryKey: UTILITIES_KEY(propertyId), queryFn: () => fetchStayUtilities(propertyId), enabled: allowed, staleTime: 60_000 });
  if (!allowed) return null;

  const matches = (q.data ?? []).map((st) => ({ st, how: guestMatch(st.guest, guestName) })).filter((x) => x.how);
  const mine = matches.map((x) => x.st);
  const byFirstName = matches.some((x) => x.how === 'first');
  const house = { kwh: averageOf(q.data ?? [], 'kwh'), m3: averageOf(q.data ?? [], 'm3') };
  const own = { kwh: averageOf(mine, 'kwh'), m3: averageOf(mine, 'm3') };
  const main = own.kwh.nights >= own.m3.nights ? own.kwh : own.m3; // one metric supplies both the night and stay counts
  const nights = main.nights;
  const high = isHigh(own.kwh.avg, house.kwh.avg) || isHigh(own.m3.avg, house.m3.avg);
  const estimated = mine.filter((st) => st.estimate !== null);

  const line = (label: string, m: Metric) => {
    const v = own[m].avg, h = house[m].avg;
    if (v === null) return null;
    const max = Math.max(v, h ?? 0) * 1.15 || 1;
    return (
      <div key={m} className="mt-2">
        <div className={cn('flex justify-between', T.t3)}><span>{label}</span><b>{fmtValue(v, m)} a night</b></div>
        <UsageBar value={v} avg={h} max={max} metric={m} />
        {h !== null && <div className={cn('text-muted-foreground', T.t4)}>{(Math.floor((v / h) * 100) / 100).toFixed(2)} times the average of {fmtValue(h, m)} a night</div>}
      </div>
    );
  };

  return (
    <section aria-labelledby="guest-util-title" className="space-y-2 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 id="guest-util-title" className={cn('font-semibold', T.t2)}>Electricity and water</h3>
        {nights > 0 && (high ? <AboveAverage /> : <span className={cn('rounded-full border bg-muted px-2 py-0.5', T.t4)}>Typical</span>)}
      </div>
      {q.isError && <p role="alert" className={T.t3}>{toAppError(q.error).message}</p>}
      {q.isPending && allowed && <p className={cn('text-muted-foreground', T.t3)}>Loading readings</p>}
      {q.data && nights === 0 && (
        <p className={cn('text-muted-foreground', T.t3)}>{estimated.length ? 'Only estimated readings for this guest, so there is no average yet.' : 'No meter readings are tied to this guest yet.'}</p>
      )}
      {nights > 0 && (
        <>
          <p className={cn('text-muted-foreground', T.t4)}>
            Average across {main.stays} {main.stays === 1 ? 'stay' : 'stays'}, {nightsText(nights)}
            {nights < READ_AS_HINT_UNDER && `. Under ${READ_AS_HINT_UNDER} nights, so read it as a hint.`}
            {byFirstName && ' The cleaning report holds a first name only, so a stay by another guest with the same first name may be included.'}
          </p>
          {line('Electricity', 'kwh')}
          {line('Water', 'm3')}
        </>
      )}
      {mine.length > 0 && (
        <ul className={cn('divide-y border-t pt-1', T.t4)}>
          {mine.map((st) => {
            const k = perNight(st.kwh, st.nights), w = perNight(st.m3, st.nights);
            return (
              <li key={st.sessionId} className="py-1.5">
                {shortDate(st.date)} · {nightsText(st.nights)}
                {st.estimate ? <span className="text-muted-foreground"> · Estimated: {estimateWords(st.estimate)}</span> : <span className="text-muted-foreground"> · {k === null ? 'kWh not known' : fmtValue(k, 'kwh')} · {w === null ? 'water not known' : fmtValue(w, 'm3')} a night</span>}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
