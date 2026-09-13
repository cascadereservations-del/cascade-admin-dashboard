import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useSession } from '@/auth/session';
import { useUrlState } from '@/lib/url-state';
import { formatDate, relativeDay, todayManila } from '@/lib/dates';
import { formatPHP } from '@/lib/money';
import { PageHeader } from '@/components/data/page-header';
import { FilterBar, FilterSelect } from '@/components/data/filter-bar';
import { DataTable } from '@/components/data/data-table';
import { EmptyState, PartialBanner, QueryState } from '@/components/data/query-state';
import { Freshness } from '@/components/data/freshness';
import { StatusBadge, bookingTone, payoutTone } from '@/components/data/status-badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { fetchStays } from './api';
import { filterStays, type Stay } from './model';

const DEFAULTS = { q: '', status: '', channel: '', from: '', to: '', balance: '', view: '', page: '1', density: 'comfortable' };

const VIEWS = [
  { value: 'all', label: 'All' },
  { value: 'arrivals', label: 'Arrivals' },
  { value: 'departures', label: 'In house' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'pending', label: 'Pending inquiries' },
  { value: 'unpaid', label: 'Unresolved payments' },
];

export default function BookingsPage() {
  const s = useSession();
  const nav = useNavigate();
  const { state, set, reset, activeFilterCount } = useUrlState(DEFAULTS);
  const query = useQuery({ queryKey: ['stays', s.propertyId], queryFn: () => fetchStays(s.propertyId) });
  const today = todayManila();
  const canFinance = s.caps.can('read_finance');
  const density = state.density === 'compact' ? 'compact' : 'comfortable';

  const columns = useMemo<ColumnDef<Stay, unknown>[]>(() => {
    const cols: ColumnDef<Stay, unknown>[] = [
      {
        id: 'guest',
        header: 'Guest',
        accessorFn: (r) => r.guestName,
        cell: ({ row }) => (
          <div>
            <Link to={row.original.href} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{row.original.guestName}</Link>
            <div className="text-xs text-muted-foreground">{row.original.code}</div>
          </div>
        ),
      },
      { id: 'checkin', header: 'Check-in', accessorFn: (r) => r.checkin, cell: ({ row }) => <span className="tabular">{relativeDay(row.original.checkin, today)}</span> },
      { id: 'checkout', header: 'Checkout', accessorFn: (r) => r.checkout, cell: ({ row }) => <span className="tabular">{formatDate(row.original.checkout, 'weekday')}</span> },
      { id: 'nights', header: 'Nights', accessorFn: (r) => r.nights, cell: ({ row }) => <span className="tabular">{row.original.nights}</span> },
      { id: 'channel', header: 'Channel', accessorFn: (r) => r.kind, cell: ({ row }) => <span className="capitalize">{row.original.kind.replace('_', ' ')}</span> },
      { id: 'state', header: 'Booking', accessorFn: (r) => r.bookingState, cell: ({ row }) => <StatusBadge tone={bookingTone(row.original.bookingState)}>{row.original.bookingState}</StatusBadge> },
      { id: 'payment', header: 'Payment', accessorFn: (r) => r.paymentState, cell: ({ row }) => <span className="text-xs capitalize text-muted-foreground">{row.original.paymentState.replaceAll('_', ' ')}</span> },
      { id: 'payout', header: 'Payout', accessorFn: (r) => r.payoutState, cell: ({ row }) => <StatusBadge tone={payoutTone(row.original.payoutState)}>{row.original.payoutState.replaceAll('_', ' ')}</StatusBadge> },
    ];
    if (canFinance) {
      cols.push({ id: 'amount', header: 'Guest paid / total', accessorFn: (r) => r.totalAmount ?? '', cell: ({ row }) => <span className="tabular">{formatPHP(row.original.totalAmount)}</span> });
    }
    cols.push({
      id: 'calendar',
      header: 'Calendar',
      accessorFn: (r) => r.calendar?.status ?? '',
      cell: ({ row }) => (row.original.calendar ? <span className="text-xs text-muted-foreground">{row.original.calendar.match === 'linked' ? 'Linked' : 'Date match'}</span> : <span className="text-xs text-muted-foreground">No event</span>),
    });
    return cols;
  }, [today, canFinance]);

  const view = state.view || 'all';

  return (
    <div>
      <PageHeader
        title="Bookings"
        description="Airbnb reservations and direct bookings as one list. Booking, payment and payout states are shown separately."
        actions={<Button variant="outline" asChild><Link to="/bookings/calendar">Calendar</Link></Button>}
      />
      <Tabs value={view} onValueChange={(v) => set({ view: v === 'all' ? '' : v })} className="mb-3">
        <TabsList className="flex-wrap">
          {VIEWS.map((v) => (
            <TabsTrigger key={v.value} value={v.value}>{v.label}</TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <FilterBar search={state.q} onSearch={(q) => set({ q })} searchPlaceholder="Guest or code" activeCount={activeFilterCount} onClear={reset} density={density} onDensity={(d) => set({ density: d })}>
        <FilterSelect label="Status" value={state.status || undefined} onChange={(v) => set({ status: v ?? '' })} options={['inquiry', 'confirmed', 'completed', 'cancelled'].map((v) => ({ value: v, label: v }))} />
        <FilterSelect label="Channel" value={state.channel || undefined} onChange={(v) => set({ channel: v ?? '' })} options={[{ value: 'airbnb', label: 'Airbnb' }, { value: 'direct', label: 'Direct' }, { value: 'calendar_only', label: 'Calendar only' }, { value: 'blocked', label: 'Blocked' }]} />
        <Input type="date" aria-label="From date" className="w-40 text-base sm:text-sm" value={state.from} onChange={(e) => set({ from: e.target.value })} />
        <Input type="date" aria-label="To date" className="w-40 text-base sm:text-sm" value={state.to} onChange={(e) => set({ to: e.target.value })} />
        <FilterSelect label="Balance" value={state.balance || undefined} onChange={(v) => set({ balance: v ?? '' })} options={[{ value: 'outstanding', label: 'Outstanding / unknown' }]} />
      </FilterBar>
      <QueryState query={query}>
        {(data) => {
          const filtered = filterStays(data.stays, { ...state, view: state.view }, today);
          const page = Number(state.page) || 1;
          const rows = filtered.slice((page - 1) * 25, page * 25);
          return (
            <div className="space-y-2">
              <PartialBanner warnings={data.warnings} />
              {filtered.length === 0 ? (
                <EmptyState
                  title={activeFilterCount ? 'No bookings match these filters' : 'No bookings yet'}
                  hint={activeFilterCount ? 'Clear the filters to see all stays.' : undefined}
                  action={activeFilterCount ? <Button variant="outline" size="sm" onClick={reset}>Clear filters</Button> : undefined}
                />
              ) : (
                <DataTable columns={columns} rows={rows} total={filtered.length} page={page} onPageChange={(p) => set({ page: String(p) })} density={density} onRowClick={(r) => nav(r.href)} caption="Bookings" getRowId={(r) => r.key} />
              )}
              <Freshness sourceAsOf={data.sourceAsOf} label="Calendar last synced" />
            </div>
          );
        }}
      </QueryState>
    </div>
  );
}
