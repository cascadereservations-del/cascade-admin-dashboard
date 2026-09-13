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
          return (
            <div className="space-y-2">
              <PartialBanner warnings={data.warnings} />
              <div className="overflow-x-auto rounded-lg border" role="region" aria-label="Calendar grid" tabIndex={0}>
                <div className="grid min-w-[700px] grid-cols-7 border-b bg-muted/40 text-xs font-medium text-muted-foreground">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="px-2 py-1.5">{d}</div>)}
                </div>
                <div className="grid min-w-[700px] grid-cols-7">
                  {grid.days.map((d) => {
                    const inMonth = d.startsWith(month);
                    const items = byDay.get(d) ?? [];
                    return (
                      <div key={d} className={cn('min-h-24 border-r border-b p-1 text-xs', !inMonth && 'bg-muted/30 text-muted-foreground', d === today && 'bg-cream')}>
                        <div className={cn('tabular mb-1 px-1', d === today && 'font-semibold')}>{Number(d.slice(8, 10))}</div>
                        <ul className="space-y-0.5">
                          {items.slice(0, 3).map((st) => (
                            <li key={st.key}>
                              <Link
                                to={st.href}
                                className={cn('block truncate rounded px-1 py-0.5', st.kind === 'blocked' ? 'bg-muted text-muted-foreground line-through' : st.kind === 'direct' ? 'bg-chart-3/15' : st.bookingState === 'inquiry' ? 'border border-dashed' : 'bg-primary/10')}
                                title={`${st.guestName} · ${st.kind}`}
                              >
                                {st.checkin === d ? '→ ' : ''}{st.guestName}
                              </Link>
                            </li>
                          ))}
                          {items.length > 3 && <li className="px-1 text-muted-foreground">+{items.length - 3} more</li>}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-xs text-muted-foreground">Legend: solid = Airbnb, blue = direct, dashed = inquiry, struck = blocked. Arrow marks the check-in day.</p>
              <Freshness sourceAsOf={data.sourceAsOf} label="Calendar last synced" />
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
