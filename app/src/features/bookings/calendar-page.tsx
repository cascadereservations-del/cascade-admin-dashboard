import { useMemo } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { useSession } from '@/auth/session';
import { useUrlState } from '@/lib/url-state';
import { addIsoDays, parseIso, todayManila } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/data/page-header';
import { PartialBanner, QueryState } from '@/components/data/query-state';
import { Freshness } from '@/components/data/freshness';
import { Button } from '@/components/ui/button';
import { fetchStays } from './api';
import type { Stay } from './model';
import { sameGuest } from './same-guest';

// A booked chip inside a turnover cell differs from the cell fill by about 1.1:1; the word "Turnover" carries that state.
const isLive = (st: Stay) => st.kind !== 'blocked' && st.bookingState !== 'inquiry';
const chipLabel = (st: Stay) => (st.kind === 'blocked' ? 'Blocked' : st.guestName);

function Chip({ st, day, conflict }: { st: Stay; day: string; conflict: boolean }) {
  const state = st.kind === 'blocked' ? 'blocked' : st.bookingState === 'inquiry' ? 'inquiry' : conflict ? 'conflict' : 'booked';
  return (
    <Link
      to={st.href}
      data-state={state}
      data-source={st.kind === 'direct' ? 'direct' : 'airbnb'}
      className="cal-chip block truncate rounded px-1.5 py-0.5"
      title={`${st.guestName} · ${st.kind === 'blocked' ? 'blocked (not a stay)' : st.kind}${conflict ? ' · overlaps another guest' : ''}`}
    >
      {st.checkin === day ? '→ ' : ''}{conflict && state === 'conflict' ? '! ' : ''}{st.kind !== 'blocked' && <span className="mr-1 text-[10px] font-semibold opacity-80" aria-label={st.kind === 'direct' ? 'Direct' : 'Airbnb'}>{st.kind === 'direct' ? 'D' : 'A'}</span>}{chipLabel(st)}
    </Link>
  );
}

function Legend({ show }: { show: { conflict: boolean; turn: boolean } }) {
  const item = (cls: string, label: string) => <li className="flex items-center gap-1.5"><span className={`cal-swatch ${cls}`} aria-hidden />{label}</li>;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
      {item('cal-swatch-booked', 'A = Airbnb')}
      {item('cal-swatch-direct', 'D = Direct')}
      {item('cal-swatch-inquiry', 'Inquiry')}
      {item('cal-swatch-blocked', 'Blocked (not a stay)')}
      {show.conflict && item('cal-swatch-conflict', 'Two guests on one night')}
      {show.turn && item('cal-swatch-turn', 'Turnover day')}
      <li>Arrow marks the check-in day.</li>
    </ul>
  );
}

// BKG01 calendar view. Read-only grid: drag-and-drop never commits a change
// (BKG03); amendments go through the booking detail with a reason.

const DEFAULTS = { month: '' };

export default function BookingCalendarPage() {
  const s = useSession();
  const { state, set } = useUrlState(DEFAULTS);
  const today = todayManila();
  const month = state.month || today.slice(0, 7);
  const query = useQuery({ queryKey: ['stays', s.propertyId], queryFn: () => fetchStays(s.propertyId) });

  const grid = useMemo(() => {
    const first = `${month}-01`;
    const firstDate = parseIso(first);
    const startOffset = (firstDate.getDay() + 6) % 7; // Monday first
    const start = addIsoDays(first, -startOffset);
    const days: string[] = [];
    for (let i = 0; i < 42; i++) days.push(addIsoDays(start, i));
    return { first, days };
  }, [month]);

  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const prev = format(new Date(y, m - 2, 1), 'yyyy-MM');
  const next = format(new Date(y, m, 1), 'yyyy-MM');

  return (
    <div>
      <PageHeader
        title="Booking calendar"
        description="Nights are [check-in, checkout). Blocked nights come from the Airbnb calendar and are not stays."
        actions={
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" aria-label="Previous month" onClick={() => set({ month: prev })}><ChevronLeft className="size-4" aria-hidden /></Button>
            <span className="tabular min-w-32 text-center text-sm font-medium">{format(parseIso(grid.first), 'MMMM yyyy')}</span>
            <Button variant="outline" size="icon-sm" aria-label="Next month" onClick={() => set({ month: next })}><ChevronRight className="size-4" aria-hidden /></Button>
            <Button variant="ghost" size="sm" onClick={() => set({ month: '' })}>Today</Button>
          </div>
        }
      />
      <QueryState query={query}>
        {(data) => {
          const byDay = new Map<string, Stay[]>();
          for (const st of data.stays) {
            if (st.bookingState === 'cancelled') continue;
            let d = st.checkin;
            while (d < st.checkout) {
              byDay.set(d, [...(byDay.get(d) ?? []), st]);
              d = addIsoDays(d, 1);
            }
          }
          const outBy = new Map<string, Stay[]>();
          for (const st of data.stays) if (isLive(st) && st.bookingState !== 'cancelled') outBy.set(st.checkout, [...(outBy.get(st.checkout) ?? []), st]);
          // Conflict = two different guests on one night. The same guest on a direct stay and its Airbnb mirror is one stay.
          const dayInfo = (d: string) => {
            const items = byDay.get(d) ?? [];
            const live = items.filter(isLive);
            const distinct = live.filter((a, i) => live.findIndex((b) => sameGuest({ name: a.guestName, id: a.guestId, checkin: a.checkin, checkout: a.checkout }, { name: b.guestName, id: b.guestId, checkin: b.checkin, checkout: b.checkout })) === i);
            const conflict = distinct.length >= 2;
            const turn = live.some((a) => a.checkin === d && (outBy.get(d) ?? []).some((o) => !sameGuest({ name: a.guestName, id: a.guestId, checkin: a.checkin, checkout: a.checkout }, { name: o.guestName, id: o.guestId, checkin: o.checkin, checkout: o.checkout })));
            return { items, conflict, turn };
          };
          const monthDays = grid.days.filter((d) => d.startsWith(month)).map((d) => ({ d, ...dayInfo(d) }));
          const show = { conflict: monthDays.some((x) => x.conflict), turn: monthDays.some((x) => x.turn) };
          return (
            <div className="space-y-2">
              <PartialBanner warnings={data.warnings} />
              <ul className="divide-y rounded-lg border sm:hidden" aria-label="Month agenda">
                {monthDays.filter((x) => x.items.length > 0).length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">No stays or blocked nights this month.</li>}
                {monthDays.filter((x) => x.items.length > 0).map(({ d, items, conflict, turn }) => (
                  <li key={d} className={cn('flex gap-3 px-3 py-2 text-sm', turn && 'cal-cell-turn', d === today && 'bg-cream')}>
                    <div className="tabular w-14 shrink-0 text-xs font-medium">{format(parseIso(d), 'EEE d')}{turn && <div className="font-normal">Turnover</div>}</div>
                    <ul className="min-w-0 flex-1 space-y-1">
                      {items.map((st) => <li key={st.key}><Chip st={st} day={d} conflict={conflict && isLive(st)} /></li>)}
                    </ul>
                  </li>
                ))}
              </ul>
              <div className="hidden overflow-x-auto rounded-lg border sm:block" role="region" aria-label="Calendar grid" tabIndex={0}>
                <div className="grid min-w-[700px] grid-cols-7 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="px-2 py-1.5">{d}</div>)}
                </div>
                <div className="grid min-w-[700px] grid-cols-7">
                  {grid.days.map((d) => {
                    const inMonth = d.startsWith(month);
                    const { items, conflict, turn } = dayInfo(d);
                    return (
                      <div key={d} className={cn('min-h-24 border-r border-b p-1 text-xs', !inMonth && 'bg-muted/30 text-muted-foreground', d === today && 'bg-cream', turn && 'cal-cell-turn')}>
                        <div className={cn('tabular mb-1 flex justify-between px-1', d === today && 'font-semibold')}><span>{Number(d.slice(8, 10))}</span>{turn && <span className="font-normal">Turnover</span>}</div>
                        <ul className="space-y-0.5">
                          {items.slice(0, 3).map((st) => <li key={st.key}><Chip st={st} day={d} conflict={conflict && isLive(st)} /></li>)}
                          {items.length > 3 && <li className="px-1 text-muted-foreground">+{items.length - 3} more</li>}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
              <Legend show={show} />
              <Freshness sourceAsOf={data.sourceAsOf} label="Calendar last synced" />
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
