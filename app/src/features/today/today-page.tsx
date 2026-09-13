import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ArrowRight, CheckCircle2, HelpCircle } from 'lucide-react';
import { useSession } from '@/auth/session';
import { formatDate, formatDateTime, relativeDay, todayManila } from '@/lib/dates';
import { formatPHP } from '@/lib/money';
import { PageHeader, Section } from '@/components/data/page-header';
import { CardSkeleton, EmptyState, QueryState } from '@/components/data/query-state';
import { Freshness } from '@/components/data/freshness';
import { StatusBadge } from '@/components/data/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { fetchOverview, type Overview, type OverviewStay } from './api';

// Today (P10). Every card links to the matching records; a failed or
// unavailable section stays visible as such and never reads "all clear".

function StayLink({ st }: { st: OverviewStay }) {
  return <Link to={`/bookings/${st.kind}/${st.id}`} className="font-medium hover:underline">{st.guest}</Link>;
}

function ReadinessCard({ r }: { r: Overview['readiness'] }) {
  const tone = r.state === 'ready' ? 'good' : r.state === 'not_ready' ? 'bad' : 'warn';
  const Icon = r.state === 'ready' ? CheckCircle2 : r.state === 'not_ready' ? AlertTriangle : HelpCircle;
  const lc = r.lastCleaning;
  return (
    <Card className="py-4 gap-3">
      <CardHeader><CardTitle className="flex items-center gap-2"><Icon className="size-4" aria-hidden /> Property readiness</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">
        <StatusBadge tone={tone}>{r.state.replace('_', ' ')}</StatusBadge>
        <p className="text-muted-foreground">
          {lc ? `Last cleaning ${formatDateTime(lc.cleanedAt)} by ${lc.cleaner} (${lc.complete ? 'complete' : 'incomplete'}${lc.issues ? `, ${lc.issues} issues` : ''}).` : 'No cleaning report since the last checkout.'}
        </p>
        <p className="text-muted-foreground">
          {r.review ? `Reviewed ${r.review.outcome.replace('_', ' ')} ${formatDateTime(r.review.reviewedAt)}${r.review.reason ? `: ${r.review.reason}` : ''}.` : 'No human readiness review for the next arrival yet.'}
        </p>
        {r.blockingWorkOrders > 0 && <p className="font-medium">{r.blockingWorkOrders} work order{r.blockingWorkOrders > 1 ? 's' : ''} block the next arrival.</p>}
        <Button size="sm" variant="outline" asChild><Link to="/operations">Open cleaning log <ArrowRight className="size-3.5" aria-hidden /></Link></Button>
      </CardContent>
    </Card>
  );
}

export default function TodayPage() {
  const s = useSession();
  const query = useQuery({ queryKey: ['overview', s.propertyId, s.caps.role, s.caps.aal], queryFn: () => fetchOverview(s.propertyId), refetchInterval: 120_000 });
  return (
    <div>
      <PageHeader title="Today" description={`Asia/Manila · ${formatDate(todayManila(), 'long')}`} />
      <QueryState query={query} skeleton={<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton /></div>}>
        {(o) => (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Card className="py-4 gap-3">
                <CardHeader><CardTitle>Current stay</CardTitle></CardHeader>
                <CardContent className="text-sm">
                  {o.currentStays.length === 0 ? (
                    <p className="text-muted-foreground">Nobody in house by dates.</p>
                  ) : (
                    o.currentStays.map((st) => (
                      <p key={st.id}><StayLink st={st} /> · until {formatDate(st.checkout, 'weekday')} · arrival state <em>unknown</em> (date-only)</p>
                    ))
                  )}
                </CardContent>
              </Card>
              <Card className="py-4 gap-3">
                <CardHeader><CardTitle>Arrivals and departures</CardTitle></CardHeader>
                <CardContent className="space-y-1 text-sm">
                  <p>{o.arrivals.length} arriving today{o.arrivals.map((a) => <span key={a.id}> · <StayLink st={a} /></span>)}</p>
                  <p>{o.departures.length} departing today{o.departures.map((a) => <span key={a.id}> · <StayLink st={a} /></span>)}</p>
                  <p className="text-muted-foreground">
                    {o.nextArrival ? <>Next: <StayLink st={o.nextArrival} /> {relativeDay(o.nextArrival.checkin, o.today)} ({o.nextArrival.daysUntil} days)</> : 'No confirmed future arrival.'}
                  </p>
                </CardContent>
              </Card>
              <ReadinessCard r={o.readiness} />
              <Card className="py-4 gap-3">
                <CardHeader><CardTitle>Finance review</CardTitle></CardHeader>
                <CardContent className="text-sm">
                  {o.finance === null ? (
                    <p className="text-muted-foreground">Not available for your role or without a two-factor session.</p>
                  ) : (
                    <ul className="space-y-1">
                      <li><Link to="/finance" className="hover:underline">{o.finance.pendingReviewCount} transactions awaiting review</Link> · {formatPHP(o.finance.pendingReviewAmount)}</li>
                      <li><Link to="/finance" className="hover:underline">{o.finance.paymentReviewCount} payment evidence comparisons unreviewed</Link></li>
                      <li><Link to="/operations?fees=unpaid" className="hover:underline">{o.finance.unpaidCleanerFees} cleaner fees unpaid</Link></li>
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>

            <Section title="What needs attention" aside={<span className="text-xs text-muted-foreground">{o.actions.length} actions, ordered by priority</span>}>
              {o.actions.length === 0 ? (
                <EmptyState title="Nothing needs attention right now" hint="Computed from readiness, work orders, inquiries, follow-ups and stock, not a default." />
              ) : (
                <ul className="divide-y rounded-lg border">
                  {o.actions.map((a, i) => (
                    <li key={`${a.kind}-${a.sourceId ?? i}`} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                      <span className="tabular w-6 text-center text-xs font-semibold text-muted-foreground" aria-label={`priority ${a.priority}`}>P{a.priority}</span>
                      <div className="min-w-0 flex-1">
                        <Link to={a.href} className="font-medium hover:underline">{a.title}</Link>
                        <div className="text-xs text-muted-foreground">
                          {a.reason}{a.dueAt ? ` · due ${a.dueAt.length > 10 ? formatDateTime(a.dueAt) : formatDate(a.dueAt, 'weekday')}` : ''} · source: {a.sourceKind.replaceAll('_', ' ')}
                        </div>
                      </div>
                      <Button size="sm" variant="ghost" asChild><Link to={a.href}>Open</Link></Button>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <div className="grid gap-4 lg:grid-cols-3">
              <Section title="Low stock">
                {o.lowStock.length === 0 ? <p className="text-sm text-muted-foreground">No items at or below their reorder level.</p> : (
                  <ul className="space-y-1 text-sm">
                    {o.lowStock.map((i) => <li key={i.id}><Link to="/inventory?attention=low" className="hover:underline">{i.name}</Link> · {i.out ? 'out' : `${i.qty} ${i.unit}`} (reorder below {i.reorderBelow})</li>)}
                  </ul>
                )}
              </Section>
              <Section title="Follow-ups and handoffs">
                {o.followUps.length === 0 && (!o.handoffs || o.handoffs.length === 0) ? (
                  <p className="text-sm text-muted-foreground">No open follow-ups{o.handoffs === null ? ' (handoffs need an admin role)' : ' or Messenger handoffs'}.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {o.followUps.map((f) => <li key={f.id}><Link to={`/guests/${f.guestId ?? ''}?task=${f.id}`} className="hover:underline">{f.title}</Link> · {f.purpose.replaceAll('_', ' ')}</li>)}
                    {o.handoffs?.map((h) => <li key={h.id}><Link to="/guests?handoffs=1" className="hover:underline">Messenger: {h.guest ?? 'guest'}</Link> · {h.risk ?? 'risk unknown'} · {formatDateTime(h.createdAt)}</li>)}
                  </ul>
                )}
              </Section>
              <Section title="Notices">
                {o.notices.length === 0 ? <p className="text-sm text-muted-foreground">No active notices.</p> : (
                  <ul className="space-y-1 text-sm">
                    {o.notices.map((n) => <li key={n.id}><Link to="/operations/notices" className="hover:underline">{n.title}</Link> · {n.type} · {formatDate(n.effectiveDate, 'weekday')}</li>)}
                  </ul>
                )}
              </Section>
            </div>
            <div className="flex flex-wrap gap-4">
              <Freshness sourceAsOf={o.sourceAsOf} />
              <p className="text-xs text-muted-foreground">Calendar sync: {o.calendarSync ? `${o.calendarSync.status} at ${formatDateTime(o.calendarSync.syncedAt)}` : 'no sync recorded'}</p>
            </div>
          </div>
        )}
      </QueryState>
    </div>
  );
}
