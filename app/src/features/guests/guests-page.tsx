import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useSession } from '@/auth/session';
import { useUrlState } from '@/lib/url-state';
import { formatDate, formatDateTime } from '@/lib/dates';
import { formatPHP } from '@/lib/money';
import { PageHeader } from '@/components/data/page-header';
import { FilterBar, FilterSelect } from '@/components/data/filter-bar';
import { DataTable } from '@/components/data/data-table';
import { EmptyState, QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { CopyButton } from '@/components/data/copy-button';
import { DetailSheet } from '@/components/data/detail-sheet';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { FollowUpForm } from './follow-up-form';
import { LocalRecordsPanel } from './local-records-panel';
import { daysToNextBirthday, fetchFollowUps, fetchGuests, fetchHandoffs, fetchInquiries, type FollowUp, type GuestRow } from './api';

// CRM list: canonical guests joined by guest_id everywhere else. Same-name
// guests stay separate rows here; merging is a reviewed action on the detail.
//
// Session-13 step 4: the page is four sub-tabs (Guest CRM, Follow-ups,
// Messenger handoffs, Inquiries) instead of one long scroll. Each query is
// enabled only for its active tab.

const DEFAULTS = { tier: '', flag: '', page: '1', density: 'comfortable', tab: '', taskStatus: '' };
const FLAG_OPTIONS = [
  { value: 'id_on_file', label: 'ID on file' },
  { value: 'missing_details', label: 'Missing details' },
  { value: 'upcoming_birthday', label: 'Upcoming birthday' },
  { value: 'repeat', label: 'Repeat guest' },
  { value: 'has_companions', label: 'Has companions' },
];
const TABS = [
  { value: 'crm', label: 'Guest CRM' },
  { value: 'local', label: 'Collected records' },
  { value: 'followups', label: 'Follow-ups' },
  { value: 'handoffs', label: 'Messenger handoffs' },
  { value: 'inquiries', label: 'Inquiries' },
];

export default function GuestsPage() {
  const s = useSession();
  const nav = useNavigate();
  const { state, set, reset } = useUrlState(DEFAULTS);
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(() => params.get('q') ?? '');
  const [queryText, setQueryText] = useState(() => params.get('q') ?? '');
  // Honor an old search link once, then remove personal search text from history.
  useEffect(() => { if (params.has('q')) { const next = new URLSearchParams(params); next.delete('q'); setParams(next, { replace: true }); } }, [params, setParams]);
  useEffect(() => { const timer = setTimeout(() => setQueryText(search), 250); return () => clearTimeout(timer); }, [search]);
  const clearFilters = () => { setSearch(''); setQueryText(''); reset(); };
  const tab = TABS.some((t) => t.value === state.tab) ? state.tab : 'crm';
  const query = useQuery({ queryKey: ['guests', s.propertyId, queryText, state.tier, state.flag, state.page], queryFn: () => fetchGuests(s.propertyId, { ...state, q: queryText }), enabled: tab === 'crm' && search === queryText });
  const tasks = useQuery({ queryKey: ['follow-ups', s.propertyId], queryFn: () => fetchFollowUps(s.propertyId), enabled: tab === 'followups' });
  const handoffs = useQuery({ queryKey: ['handoffs'], queryFn: fetchHandoffs, enabled: tab === 'handoffs' });
  const inquiries = useQuery({ queryKey: ['inquiries', s.propertyId], queryFn: () => fetchInquiries(s.propertyId), enabled: tab === 'inquiries' });
  const [taskSheet, setTaskSheet] = useState<{ open: boolean; existing: FollowUp | null }>({ open: false, existing: null });
  const density = state.density === 'compact' ? 'compact' : 'comfortable';
  const columns = useMemo<ColumnDef<GuestRow, unknown>[]>(() => [
    { id: 'name', header: 'Guest', accessorFn: (r) => r.name, cell: ({ row }) => <div><Link to={`/guests/${row.original.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{row.original.name}</Link><div className="text-xs text-muted-foreground">{row.original.source}{row.original.tier ? ` · ${row.original.tier}` : ''}</div></div> },
    { id: 'contact', header: 'Contact', accessorFn: (r) => r.phone ?? r.email ?? '', cell: ({ row }) => <span className="inline-flex items-center gap-1 text-xs">{row.original.phone ?? row.original.email ?? '—'}{(row.original.phone ?? row.original.email) && <CopyButton value={row.original.phone ?? row.original.email ?? ''} />}</span> },
    { id: 'stays', header: 'Stays', accessorFn: (r) => r.total_stays ?? 0, cell: ({ row }) => <span className="tabular">{row.original.total_stays ?? 0} · {row.original.total_nights_stayed ?? 0} nights</span> },
    { id: 'last', header: 'Last stay', accessorFn: (r) => r.last_stay_date ?? '', cell: ({ row }) => <span className="tabular">{formatDate(row.original.last_stay_date, 'long')}</span> },
    { id: 'tier', header: 'Tier', accessorFn: (r) => r.tier ?? '', cell: ({ row }) => (row.original.tier ? <StatusBadge tone={row.original.tier === 'vip' ? 'warn' : 'info'}>{row.original.tier}</StatusBadge> : <span className="text-xs text-muted-foreground">—</span>) },
    { id: 'flags', header: 'Flags', accessorFn: () => '', cell: ({ row }) => {
      const r = row.original;
      const soon = r.birthday && daysToNextBirthday(r.birthday) <= 30;
      return <div className="flex flex-wrap gap-1">
        {r.id_on_file && <StatusBadge tone="good">ID on file</StatusBadge>}
        {soon && <StatusBadge tone="warn">Birthday soon</StatusBadge>}
        {r.has_companions && <StatusBadge tone="info">Companions</StatusBadge>}
        {!r.id_on_file && !r.has_contact_number && <StatusBadge tone="neutral">Missing details</StatusBadge>}
      </div>;
    } },
  ], []);
  const taskStatusFilter = state.taskStatus;
  return (
    <div>
      <PageHeader title="Guests" description="Know your guests, prepare for their stays and keep every request in view." />
      <Tabs value={tab} onValueChange={(v) => set({ tab: v === 'crm' ? '' : v })} className="mb-3">
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          {TABS.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="crm">
          <FilterBar search={search} onSearch={(q) => { setSearch(q); set({ page: '1' }); }} searchPlaceholder="Name, phone or e-mail" activeCount={(search ? 1 : 0) + (state.tier ? 1 : 0) + (state.flag ? 1 : 0)} onClear={clearFilters} density={density} onDensity={(d) => set({ density: d })}>
            <FilterSelect label="Tier" value={state.tier || undefined} onChange={(v) => set({ tier: v ?? '' })} options={[{ value: 'new', label: 'New' }, { value: 'returning', label: 'Returning' }, { value: 'vip', label: 'VIP' }]} />
            <FilterSelect label="Flags" value={state.flag || undefined} onChange={(v) => { set({ flag: v ?? '', page: '1' }); }} options={FLAG_OPTIONS} />
          </FilterBar>
          <QueryState query={query}>
            {(d) => d.rows.length === 0 ? <EmptyState title="No guests match" action={<Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>} /> : (
              <DataTable columns={columns} rows={d.rows} total={d.total} page={d.page} onPageChange={(p) => set({ page: String(p) })} density={density} onRowClick={(r) => nav(`/guests/${r.id}`)} caption="Guests" getRowId={(r) => r.id} />
            )}
          </QueryState>
        </TabsContent>

        <TabsContent value="local">
          {tab === 'local' && <LocalRecordsPanel key={s.session?.user.id ?? 'signed-out'} />}
        </TabsContent>

        <TabsContent value="followups">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <FilterSelect label="Status" value={taskStatusFilter || undefined} onChange={(v) => set({ taskStatus: v ?? '' })} options={['open', 'in_progress', 'done', 'cancelled'].map((v) => ({ value: v, label: v.replace('_', ' ') }))} />
            <Button size="sm" className="ml-auto" onClick={() => setTaskSheet({ open: true, existing: null })}>New follow-up</Button>
          </div>
          <QueryState query={tasks}>
            {(d) => {
              const rows = taskStatusFilter ? d.rows.filter((t) => t.status === taskStatusFilter) : d.rows;
              return rows.length === 0 ? <p className="text-sm text-muted-foreground">No follow-ups match.</p> : (
                <ul className="divide-y rounded-lg border text-sm">
                  {rows.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                      <button type="button" className="text-left font-medium hover:underline" onClick={() => setTaskSheet({ open: true, existing: t })}>{t.title}</button>
                      <StatusBadge tone={t.status === 'done' ? 'good' : t.status === 'cancelled' ? 'bad' : 'warn'}>{t.status.replace('_', ' ')}</StatusBadge>
                      <span className="text-xs text-muted-foreground">{t.purpose.replaceAll('_', ' ')} · {t.priority}{t.due_at ? ` · due ${formatDateTime(t.due_at)}` : ''}</span>
                      {t.guest_id && <Link to={`/guests/${t.guest_id}`} className="ml-auto text-xs text-muted-foreground hover:underline" onClick={(e) => e.stopPropagation()}>Open guest</Link>}
                    </li>
                  ))}
                </ul>
              );
            }}
          </QueryState>
          <DetailSheet open={taskSheet.open} onOpenChange={(o) => !o && setTaskSheet({ open: false, existing: null })} title={taskSheet.existing ? 'Follow-up' : 'New follow-up'}>
            <FollowUpForm guestId={taskSheet.existing?.guest_id ?? null} existing={taskSheet.existing} onDone={() => setTaskSheet({ open: false, existing: null })} />
          </DetailSheet>
        </TabsContent>

        <TabsContent value="handoffs">
          <QueryState query={handoffs}>
            {(d) => d.rows.length === 0 ? <p className="text-sm text-muted-foreground">No concierge handoffs recorded.</p> : (
              <ul className="divide-y rounded-lg border text-sm">
                {d.rows.map((h) => (
                  <li key={h.id} className="px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-medium">{h.guest_name ?? 'Guest'}</span><StatusBadge tone={h.status === 'pending' ? 'warn' : 'good'}>{h.status}</StatusBadge>{h.risk && <span className="text-xs text-muted-foreground">risk {h.risk}</span>}<span className="ml-auto text-xs text-muted-foreground">{formatDateTime(h.created_at)}</span></div>
                    {h.guest_text && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{h.guest_text}</p>}
                    <p className="mt-1 inline-flex items-center gap-1 text-xs">Reply in Messenger (Page inbox). PSID <code>{h.psid}</code><CopyButton value={h.psid} label="Copy PSID" /></p>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </TabsContent>

        <TabsContent value="inquiries">
          <p className="mb-3 text-sm text-muted-foreground">Direct-booking inquiries. Confirm, decline or authorise refunds on <Link to="/bookings?view=pending" className="underline">Bookings</Link>.</p>
          <QueryState query={inquiries}>
            {(d) => d.rows.length === 0 ? <p className="text-sm text-muted-foreground">No inquiries yet.</p> : (
              <ul className="divide-y rounded-lg border text-sm">
                {d.rows.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    {i.guest_id ? <Link to={`/guests/${i.guest_id}`} className="font-medium hover:underline">{i.guest_name}</Link> : <span className="font-medium">{i.guest_name}</span>}
                    <StatusBadge tone={i.status === 'pending' ? 'warn' : i.status === 'confirmed' ? 'good' : i.status === 'declined' ? 'bad' : 'info'}>{i.status}</StatusBadge>
                    <span className="tabular text-xs text-muted-foreground">{formatDate(i.checkin_date, 'weekday')} → {formatDate(i.checkout_date, 'weekday')}{i.nights ? ` · ${i.nights}n` : ''}{i.pax ? ` · ${i.pax}pax` : ''}</span>
                    {i.total_amount && <span className="tabular text-xs text-muted-foreground">{formatPHP(i.total_amount)}</span>}
                    <span className="ml-auto text-xs text-muted-foreground">{formatDateTime(i.submitted_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </TabsContent>
      </Tabs>
    </div>
  );
}
