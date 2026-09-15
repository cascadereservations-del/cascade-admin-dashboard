import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, CalendarRange, ClipboardList, Wallet } from 'lucide-react';
import { useSession } from '@/auth/session';
import { formatDate, formatDateTime, todayManila } from '@/lib/dates';
import { formatPHP } from '@/lib/money';
import { toAppError } from '@/lib/errors';
import { newIdempotencyKey } from '@/lib/idempotency';
import { Section } from '@/components/data/page-header';
import { EmptyState, QueryState } from '@/components/data/query-state';
import { Field } from '@/components/data/detail-sheet';
import { CopyButton } from '@/components/data/copy-button';
import { StatusBadge, bookingTone, payoutTone } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { fetchStayDetail, lifecycleAction } from './api';

// BKG02 detail: guest, dates, separate booking/payment/payout states, verified
// charges, finance evidence for authorised roles, calendar linkage, cleaning
// requirement and related conversations. BKG04: cancellation records a
// lifecycle event with a reason; refunds remain a separate authorised state.

export default function BookingDetailPage() {
  const { kind = 'airbnb', id = '' } = useParams();
  const s = useSession();
  const nav = useNavigate();
  const qc = useQueryClient();
  const canFinance = s.caps.can('read_finance');
  const canManage = s.caps.can('manage_operations');
  const query = useQuery({ queryKey: ['stay', s.propertyId, kind, id, canFinance], queryFn: () => fetchStayDetail(s.propertyId, kind, id, canFinance) });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [key, setKey] = useState(() => newIdempotencyKey('lifecycle'));
  const today = todayManila();

  const cancel = useMutation({
    mutationFn: () => lifecycleAction(id, 'cancel', reason, undefined, key),
    onSuccess: () => {
      toast.success('Booking cancelled', { description: `Lifecycle event recorded ${formatDateTime(new Date().toISOString())}. Financial history is untouched; refunds need separate authorisation.` });
      setCancelOpen(false);
      setKey(newIdempotencyKey('lifecycle'));
      void qc.invalidateQueries({ queryKey: ['stays'] });
      void qc.invalidateQueries({ queryKey: ['stay'] });
    },
    onError: (e) => {
      const err = toAppError(e);
      toast.error(err.message, { description: err.detail });
    },
  });

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-2 -ml-2" onClick={() => nav(-1)}>
        <ArrowLeft className="size-4" aria-hidden /> Back
      </Button>
      <QueryState query={query}>
        {(d) => {
          if (!d.stay) return <EmptyState title="Booking not found" hint="It may belong to another property or was removed." />;
          const st = d.stay;
          return (
            <div className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-5 shadow-sm">
                <div className="flex items-start gap-4">
                  <div aria-hidden className="flex size-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
                    {st.guestName.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-xl font-semibold tracking-tight">{st.guestName}</h1>
                      <StatusBadge tone={bookingTone(st.bookingState)}>{st.bookingState}</StatusBadge>
                      <StatusBadge tone={payoutTone(st.payoutState)}>{st.payoutState.replaceAll('_', ' ')}</StatusBadge>
                    </div>
                    <p className="mt-0.5 inline-flex items-center gap-1 text-sm text-muted-foreground">{st.code}<CopyButton value={st.code} label="Copy code" /> · {st.kind.replace('_', ' ')}</p>
                    <p className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="tabular">{formatDate(st.checkin, 'long')} → {formatDate(st.checkout, 'long')} · {st.nights}n</span>
                      <span className="capitalize">Payment {st.paymentState.replaceAll('_', ' ')}</span>
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {st.guestId && <Button variant="outline" asChild><Link to={`/guests/${st.guestId}`}>Guest profile</Link></Button>}
                  {canManage && st.kind === 'direct' && st.bookingState !== 'cancelled' && st.bookingState !== 'completed' && (
                    <Button variant="destructive" onClick={() => setCancelOpen(true)}>Cancel booking</Button>
                  )}
                </div>
              </div>
              {/* Same fix as cleaning-detail-page: @5xl/main measures actual content
                  width after the sidebar, so the Field label+value grid below never
                  gets squeezed narrow enough to break every word onto its own line. */}
              <div className="grid gap-4 @5xl/main:grid-cols-3">
                <Card className="py-4 gap-3">
                  <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList className="size-4 text-muted-foreground" aria-hidden /> States</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <Field label="Booking"><StatusBadge tone={bookingTone(st.bookingState)}>{st.bookingState}</StatusBadge></Field>
                    <Field label="Payment"><span className="capitalize">{st.paymentState.replaceAll('_', ' ')}</span></Field>
                    <Field label="Payout"><StatusBadge tone={payoutTone(st.payoutState)}>{st.payoutState.replaceAll('_', ' ')}</StatusBadge></Field>
                    {st.payoutDate && <Field label="Payout date">{formatDate(st.payoutDate, 'long')}</Field>}
                    <Field label="Calendar">{st.calendar ? `${st.calendar.match === 'linked' ? 'Linked event' : 'Matched by dates'} · ${st.calendar.status} · synced ${formatDateTime(st.calendar.syncedAt)}` : 'No calendar event found'}</Field>
                  </CardContent>
                </Card>
                <Card className="py-4 gap-3">
                  <CardHeader><CardTitle className="flex items-center gap-2"><CalendarRange className="size-4 text-muted-foreground" aria-hidden /> Stay</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    <Field label="Check-in">{formatDate(st.checkin, 'long')}{d.reservation?.checkin_time ? ` · ${d.reservation.checkin_time}` : ''}</Field>
                    <Field label="Checkout">{formatDate(st.checkout, 'long')}{d.reservation?.checkout_time ? ` · ${d.reservation.checkout_time}` : ''}</Field>
                    <Field label="Nights">{st.nights}</Field>
                    <Field label="Guests">{st.guestCount ?? 'Unknown'}</Field>
                    <Field label="Source">{st.kind}</Field>
                    <Field label="Created">{formatDateTime(st.createdAt)}</Field>
                    {d.inquiry?.guest_phone && <Field label="Phone"><span className="inline-flex items-center gap-1">{d.inquiry.guest_phone}<CopyButton value={d.inquiry.guest_phone} /></span></Field>}
                    {d.inquiry?.guest_email && <Field label="E-mail"><span className="inline-flex items-center gap-1">{d.inquiry.guest_email}<CopyButton value={d.inquiry.guest_email} /></span></Field>}
                  </CardContent>
                </Card>
                <Card className="py-4 gap-3">
                  <CardHeader><CardTitle className="flex items-center gap-2"><Wallet className="size-4 text-muted-foreground" aria-hidden /> Charges</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {canFinance ? (
                      <>
                        {st.kind === 'airbnb' ? (
                          <>
                            <Field label="Guest paid">{formatPHP(st.guestPaid)}</Field>
                            <Field label="Host fee">{formatPHP(d.reservation?.host_service_fee ?? null)}</Field>
                            <Field label="Host payout">{formatPHP(st.hostPayout)}</Field>
                            <Field label="Payout reported">{formatPHP(d.reservation?.payout_amount ?? null)}</Field>
                          </>
                        ) : (
                          <>
                            <Field label="Quoted total">{formatPHP(st.totalAmount)}</Field>
                            <Field label="Deposit">{st.depositAmount ? formatPHP(st.depositAmount) : 'Not recorded'}</Field>
                          </>
                        )}
                        <p className="text-xs text-muted-foreground">Amounts are as reported by the source. Accommodation revenue is allocated per night in reports.</p>
                      </>
                    ) : (
                      <p className="text-sm text-muted-foreground">Financial detail is limited to finance-authorised, two-factor sessions.</p>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Section title="Payment evidence and ledger">
                {d.transactions === 'forbidden' ? (
                  <p className="text-sm text-muted-foreground">Not visible for your role.</p>
                ) : d.transactions.length === 0 ? (
                  <EmptyState title="No ledger rows linked to this booking" hint="Airbnb payouts link by confirmation code once the payout e-mail is ingested." />
                ) : (
                  <ul className="divide-y rounded-lg border text-sm">
                    {d.transactions.map((t) => (
                      <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                        <span className="tabular w-24">{formatDate(t.transaction_date, 'long')}</span>
                        <span className="capitalize">{t.txn_type}</span>
                        <span className="text-muted-foreground">{t.category} · {t.source}</span>
                        <StatusBadge tone={t.status === 'confirmed' ? 'good' : t.status === 'void' ? 'bad' : 'warn'}>{t.status.replace('_', ' ')}</StatusBadge>
                        <span className="tabular ml-auto">{formatPHP(t.gross_amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Cleaning">
                {d.cleaning.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{st.checkout > today ? 'Turnover cleaning not yet due.' : 'No cleaning report matched to this checkout date.'}</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {d.cleaning.map((c) => (
                      <li key={c.id}>
                        <Link to={`/operations/cleaning/${c.id}`} className="hover:underline">{formatDateTime(c.cleaned_at)} · {c.cleaner_name}</Link>{' '}
                        <StatusBadge tone={c.is_complete ? 'good' : 'warn'}>{c.is_complete ? 'complete' : 'incomplete'}</StatusBadge>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section title="Timeline">
                <ul className="space-y-1 text-sm">
                  {d.decisions.map((x) => (
                    <li key={x.id}><span className="tabular text-muted-foreground">{formatDateTime(x.created_at)}</span> · Decision: {x.action} → {x.outcome}</li>
                  ))}
                  {d.lifecycle.map((x) => (
                    <li key={x.id}><span className="tabular text-muted-foreground">{formatDateTime(x.created_at)}</span> · {x.event_type}{x.reason ? ` — ${x.reason}` : ''}</li>
                  ))}
                  {d.decisions.length + d.lifecycle.length === 0 && <li className="text-muted-foreground">No staff actions recorded for this booking.</li>}
                </ul>
              </Section>

              <Section title="Conversations">
                {d.conversations === 'forbidden' ? (
                  <p className="text-sm text-muted-foreground">Guest inbox access is limited to admin roles.</p>
                ) : d.conversations.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No linked conversation. Messenger remains the guest channel; open the Facebook Page inbox to reply.</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {d.conversations.map((c) => (
                      <li key={c.id}>{c.channel} · {c.purpose ?? 'general'} · {c.status} · {formatDateTime(c.updated_at)}</li>
                    ))}
                  </ul>
                )}
              </Section>
            </div>
          );
        }}
      </QueryState>

      <Dialog open={cancelOpen} onOpenChange={(o) => !cancel.isPending && setCancelOpen(o)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel this booking</DialogTitle>
            <DialogDescription>
              Records a cancellation lifecycle event. Nothing financial is deleted; any refund must be authorised separately.
              {canFinance && query.data?.stay?.totalAmount != null && <><br /><strong className="text-foreground">Quoted total: {formatPHP(query.data.stay.totalAmount)}</strong>{query.data.stay.depositAmount ? <> · Deposit: {formatPHP(query.data.stay.depositAmount)}</> : ''}</>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Reason (required)</Label>
            <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} className="text-base" minLength={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)} disabled={cancel.isPending}>Keep booking</Button>
            <Button variant="destructive" disabled={reason.trim().length < 3 || cancel.isPending} onClick={() => cancel.mutate()}>{cancel.isPending ? 'Cancelling…' : 'Cancel booking'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
