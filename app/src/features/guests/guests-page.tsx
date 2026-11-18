import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { useSession } from '@/auth/session';
import { useUrlState } from '@/lib/url-state';
import { formatDate, formatDateTime } from '@/lib/dates';
import { formatPHP } from '@/lib/money';
import { PageBand, FLUID, GlassSheet, useNarrow } from '@/components/shell/page-band';
import { Check, ChevronLeft, ChevronRight, IdCard, Search, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
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
import { displayContact, isMissingDetails } from './contact';
import { daysToNextBirthday, fetchFollowUps, fetchGuests, fetchHandoffs, fetchInquiries, type FollowUp, type GuestRow } from './api';
import { tierLabel } from './tier';
import { UtilitiesRanking } from './utilities-ranking';

// s119 lane G: under 640 px the CRM list is row cards (no sideways table) and the filters sit behind one control. The desktop table is unchanged.

// CRM list: canonical guests joined by guest_id everywhere else. Same-name
// guests stay separate rows here; merging is a reviewed action on the detail.
//
// Session-13 step 4: the page is four sub-tabs (Guest CRM, Follow-ups,
// Messenger handoffs, Inquiries) instead of one long scroll. Each query is
// enabled only for its active tab.

const DEFAULTS = { tier: '', flag: '', page: '1', density: 'comfortable', tab: '', taskStatus: '' };
const FLAG_OPTIONS = [
  { value: 'id_on_file', label: 'ID on file' },
  { value: 'id_no_photo', label: 'ID marked, no photo' },
  { value: 'missing_details', label: 'Missing details' },
  { value: 'upcoming_birthday', label: 'Upcoming birthday' },
  { value: 'repeat', label: 'Repeat guest' },
  { value: 'has_companions', label: 'Has companions' },
];
const TIER_OPTIONS = [{ value: 'new', label: 'New' }, { value: 'returning', label: 'Returning' }, { value: 'regular', label: 'Regular' }, { value: 'vip', label: 'VIP' }];
const TABS = [
  { value: 'crm', label: 'Guest CRM' },
  { value: 'local', label: 'Collected records' },
  { value: 'followups', label: 'Follow-ups' },
  { value: 'handoffs', label: 'Messenger handoffs' },
  { value: 'inquiries', label: 'Inquiries' },
  { value: 'usage', label: 'Use per stay' }, // owner and admin only, see tabs below
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
  const tabs = TABS.filter((t) => t.value !== 'usage' || s.caps.can('manage_staff'));
  const tab = tabs.some((t) => t.value === state.tab) ? state.tab : 'crm';
  const query = useQuery({ queryKey: ['guests', s.propertyId, queryText, state.tier, state.flag, state.page], queryFn: () => fetchGuests(s.propertyId, { ...state, q: queryText }), enabled: tab === 'crm' && search === queryText });
  const tasks = useQuery({ queryKey: ['follow-ups', s.propertyId], queryFn: () => fetchFollowUps(s.propertyId), enabled: tab === 'followups' });
  const handoffs = useQuery({ queryKey: ['handoffs'], queryFn: fetchHandoffs, enabled: tab === 'handoffs' });
  const inquiries = useQuery({ queryKey: ['inquiries', s.propertyId], queryFn: () => fetchInquiries(s.propertyId), enabled: tab === 'inquiries' });
  const [taskSheet, setTaskSheet] = useState<{ open: boolean; existing: FollowUp | null }>({ open: false, existing: null });
  const narrow = useNarrow();
  const density = state.density === 'compact' ? 'compact' : 'comfortable';
  const columns = useMemo<ColumnDef<GuestRow, unknown>[]>(() => [
    { id: 'name', header: 'Guest', accessorFn: (r) => r.name, cell: ({ row }) => <div><Link to={`/guests/${row.original.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>{row.original.name}</Link><div className="text-xs text-muted-foreground">{row.original.source}{row.original.tier ? ` · ${tierLabel(row.original.tier)}` : ''}</div></div> },
    { id: 'contact', header: 'Contact', accessorFn: (r) => displayContact(r) ?? '', cell: ({ row }) => { const c = displayContact(row.original); return <span className="inline-flex items-center gap-1 text-xs">{c ?? '—'}{c && <CopyButton value={c} />}</span>; } },
    { id: 'stays', header: 'Stays', accessorFn: (r) => r.total_stays ?? 0, cell: ({ row }) => <span className="tabular">{row.original.total_stays ?? 0} · {row.original.total_nights_stayed ?? 0} nights</span> },
    { id: 'last', header: 'Last stay', accessorFn: (r) => r.last_stay_date ?? '', cell: ({ row }) => <span className="tabular">{formatDate(row.original.last_stay_date, 'long')}</span> },
    { id: 'tier', header: 'Tier', accessorFn: (r) => r.tier ?? '', cell: ({ row }) => (row.original.tier ? <StatusBadge tone={row.original.tier === 'vip' ? 'warn' : 'info'}>{tierLabel(row.original.tier)}</StatusBadge> : <span className="text-xs text-muted-foreground">—</span>) },
    { id: 'flags', header: 'Flags', accessorFn: () => '', cell: ({ row }) => {
      const r = row.original;
      const soon = r.birthday && daysToNextBirthday(r.birthday) <= 30;
      return <div className="flex flex-wrap gap-1">
        {r.has_id_photo ? <StatusBadge tone="good">ID photo</StatusBadge> : r.id_on_file && <StatusBadge tone="warn">ID marked · no photo</StatusBadge>}
        {soon && <StatusBadge tone="warn">Birthday soon</StatusBadge>}
        {r.has_companions && <StatusBadge tone="info">Companions</StatusBadge>}
        {isMissingDetails(r) && <StatusBadge tone="neutral">Missing details</StatusBadge>}
      </div>;
    } },
  ], []);
  const taskStatusFilter = state.taskStatus;
  return (
    <div>
      <PageBand title="Guests" description="Know your guests, prepare for their stays and keep every request in view." />
      <Tabs value={tab} onValueChange={(v) => set({ tab: v === 'crm' ? '' : v })} className="mb-3">
        <TabsList className="h-auto w-full justify-start overflow-x-auto">
          {tabs.map((t) => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
        </TabsList>

        <TabsContent value="crm">
          {narrow ? (
            <MobileFilters search={search} onSearch={(q) => { setSearch(q); set({ page: '1' }); }} tier={state.tier} flag={state.flag} onTier={(v) => set({ tier: v, page: '1' })} onFlag={(v) => set({ flag: v, page: '1' })} onClear={clearFilters} />
          ) : (
          <FilterBar search={search} onSearch={(q) => { setSearch(q); set({ page: '1' }); }} searchPlaceholder="Name, phone or e-mail" activeCount={(search ? 1 : 0) + (state.tier ? 1 : 0) + (state.flag ? 1 : 0)} onClear={clearFilters} density={density} onDensity={(d) => set({ density: d })}>
            <FilterSelect label="Tier" value={state.tier || undefined} onChange={(v) => set({ tier: v ?? '' })} options={TIER_OPTIONS} />
            <FilterSelect label="Flags" value={state.flag || undefined} onChange={(v) => { set({ flag: v ?? '', page: '1' }); }} options={FLAG_OPTIONS} />
          </FilterBar>
          )}
          <QueryState query={query}>
            {(d) => d.rows.length === 0 ? <EmptyState title="No guests match" action={<Button size="sm" variant="outline" onClick={clearFilters}>Clear filters</Button>} /> : narrow ? (
              <GuestCards rows={d.rows} total={d.total} page={d.page} onPage={(p) => set({ page: String(p) })} />
            ) : (
              <DataTable columns={columns} rows={d.rows} total={d.total} page={d.page} onPageChange={(p) => set({ page: String(p) })} density={density} onRowClick={(r) => nav(`/guests/${r.id}`)} caption="Guests" getRowId={(r) => r.id} />
            )}
          </QueryState>
        </TabsContent>

        <TabsContent value="usage">
          {tab === 'usage' && <UtilitiesRanking propertyId={s.propertyId} />}
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

/** The ID status word on a card: a plain word with an icon, never an alarm colour for a normal state. */
export function idStatusWord(r: Pick<GuestRow, 'has_id_photo' | 'id_on_file'>): string {
  return r.has_id_photo ? 'ID photo' : r.id_on_file ? 'ID marked, no photo' : 'No ID yet';
}
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** One guest as a tappable row card: avatar initial, name, last stay, stays and nights, ID status. At least 72 px tall. */
export function GuestCard({ g }: { g: GuestRow }) {
  const stays = g.total_stays ?? 0;
  const nights = g.total_nights_stayed ?? 0;
  const initial = (g.name.trim()[0] ?? '?').toUpperCase();
  return (
    <Link to={`/guests/${g.id}`} data-slot="guest-card" className="flex min-h-[72px] items-center gap-3 rounded-[20px] border bg-card px-4 py-3 shadow-xs focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full font-bold" style={{ background: 'var(--tile-gold)', color: 'var(--tile-gold-fg)' }}>{initial}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <b className="min-w-0 truncate" style={{ fontSize: 'var(--t2)' }}>{g.name}</b>
          <span className="shrink-0 tabular text-muted-foreground" style={{ fontSize: 'var(--t4)' }}>{g.last_stay_date ? formatDate(g.last_stay_date, 'long') : 'No stay yet'}</span>
        </span>
        <span className="mt-1 flex flex-wrap items-center justify-between gap-x-3 text-muted-foreground" style={{ fontSize: 'var(--t3)' }}>
          <span className="tabular">{plural(stays, 'stay', 'stays')} · {plural(nights, 'night', 'nights')}</span>
          <span className="inline-flex items-center gap-1"><IdCard size={14} strokeWidth={1.75} aria-hidden />{idStatusWord(g)}</span>
        </span>
      </span>
      <ChevronRight size={20} strokeWidth={1.75} aria-hidden className="shrink-0 text-muted-foreground" />
    </Link>
  );
}

const PAGE_SIZE = 25;
function GuestCards({ rows, total, page, onPage }: { rows: GuestRow[]; total: number; page: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className={FLUID}>
      <ul aria-label="Guests" className="space-y-2.5">
        {rows.map((g) => <li key={g.id}><GuestCard g={g} /></li>)}
      </ul>
      <div className="mt-3 flex items-center justify-between text-muted-foreground" style={{ fontSize: 'var(--t3)' }}>
        <span className="tabular">{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
        <span className="flex items-center gap-1">
          <Button variant="outline" className="size-11" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={20} strokeWidth={1.75} aria-hidden /></Button>
          <Button variant="outline" className="size-11" aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)}><ChevronRight size={20} strokeWidth={1.75} aria-hidden /></Button>
        </span>
      </div>
    </div>
  );
}

/** Selected chip = neutral fill + 2 px edge + tick (colour is never the only signal); a second tap clears it. */
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border-2 px-4 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none ${on ? 'border-foreground bg-card font-semibold' : 'border-transparent bg-muted'}`}>
      {on && <Check size={16} strokeWidth={1.75} aria-hidden />}{children}
    </button>
  );
}

/** Search stays visible; tier and flags sit behind one Filters control that opens a vaul sheet (lazy). */
function MobileFilters({ search, onSearch, tier, flag, onTier, onFlag, onClear }: { search: string; onSearch: (q: string) => void; tier: string; flag: string; onTier: (v: string) => void; onFlag: (v: string) => void; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  const active = (search ? 1 : 0) + (tier ? 1 : 0) + (flag ? 1 : 0);
  return (
    <div className={`mb-3 flex items-center gap-2 ${FLUID}`}>
      <div className="relative min-w-0 flex-1">
        <Search size={20} strokeWidth={1.75} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input aria-label="Search" placeholder="Name, phone or e-mail" className="h-11 pl-9 text-base" value={search} onChange={(e) => onSearch(e.target.value)} />
      </div>
      <Button variant="outline" className="min-h-11 shrink-0" onClick={() => setOpen(true)}><SlidersHorizontal size={20} strokeWidth={1.75} aria-hidden />{active > 0 ? `Filters (${active})` : 'Filters'}</Button>
      <GlassSheet open={open} onOpenChange={setOpen} title="Filters" description="Narrow the list. Changes apply straight away.">
        <div>
          <p className="mb-2 font-semibold" style={{ fontSize: 'var(--t3)' }}>Tier</p>
          <div className="flex flex-wrap gap-2">{TIER_OPTIONS.map((o) => <Chip key={o.value} on={tier === o.value} onClick={() => onTier(tier === o.value ? '' : o.value)}>{o.label}</Chip>)}</div>
        </div>
        <div>
          <p className="mb-2 font-semibold" style={{ fontSize: 'var(--t3)' }}>Flags</p>
          <div className="flex flex-wrap gap-2">{FLAG_OPTIONS.map((o) => <Chip key={o.value} on={flag === o.value} onClick={() => onFlag(flag === o.value ? '' : o.value)}>{o.label}</Chip>)}</div>
        </div>
        <div className="flex gap-2">
          {active > 0 && <Button variant="outline" className="min-h-12 flex-1" onClick={onClear}>Clear filters</Button>}
          <Button className="min-h-12 flex-1" onClick={() => setOpen(false)}>Done</Button>
        </div>
      </GlassSheet>
    </div>
  );
}
