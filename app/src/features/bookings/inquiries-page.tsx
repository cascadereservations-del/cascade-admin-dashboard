import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '@/auth/session';
import { todayManila, formatDate, formatDateTime } from '@/lib/dates';
import { formatPHP } from '@/lib/money';
import { PageHeader } from '@/components/data/page-header';
import { EmptyState, QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { fetchStays } from './api';
import { fetchInquiryPayments } from './confirm-api';
import { paymentLine } from './confirm-model';
import { ConfirmSheet, DeclineSheet } from './confirm-sheet';
import { filterStays, type Stay } from './model';

// BKG03/BKG05 + SPEC-44: pending direct inquiries. Each card shows what
// payment evidence is on file; one Confirm booking sheet (or Decline) decides.
// Confirm needs approve_payment; the server checks it again.

type Pending = { stay: Stay; action: 'confirm' | 'decline' };

export default function InquiriesPage() {
  const s = useSession();
  const query = useQuery({ queryKey: ['stays', s.propertyId], queryFn: () => fetchStays(s.propertyId) });
  const payments = useQuery({ queryKey: ['inquiry-payments', s.propertyId], queryFn: () => fetchInquiryPayments(s.propertyId) });
  const [pending, setPending] = useState<Pending | null>(null);
  const canDecide = s.caps.can('approve_payment');

  return (
    <div>
      <PageHeader title="Inquiries" description="Direct booking requests awaiting a decision. Confirming rechecks the dates on the server." actions={<Button variant="outline" asChild><Link to="/bookings?view=pending">Open in list</Link></Button>} />
      <QueryState query={query}>
        {(data) => {
          const rows = filterStays(data.stays, { view: 'pending' }, todayManila());
          if (rows.length === 0) return <EmptyState title="No pending inquiries" hint="New direct requests from the booking site appear here." />;
          return (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {rows.map((st) => (
                <Card key={st.key} className="py-4 gap-3">
                  <CardContent className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <Link to={st.href} className="font-medium hover:underline">{st.guestName}</Link>
                        <p className="text-xs text-muted-foreground">{st.code}</p>
                      </div>
                      <StatusBadge tone="warn">inquiry</StatusBadge>
                    </div>
                    <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-sm">
                      <dt className="text-muted-foreground">Dates</dt><dd className="tabular">{formatDate(st.checkin)} → {formatDate(st.checkout)} · {st.nights}n</dd>
                      <dt className="text-muted-foreground">Guests</dt><dd>{st.guestCount ?? '—'}</dd>
                      <dt className="text-muted-foreground">Quoted</dt><dd className="tabular">{formatPHP(st.totalAmount)}</dd>
                      <dt className="text-muted-foreground">Deposit</dt><dd className="tabular">{st.depositAmount ? formatPHP(st.depositAmount) : 'Not recorded'}</dd>
                      <dt className="text-muted-foreground">Requested</dt><dd>{formatDateTime(st.createdAt)}</dd>
                    </dl>
                    <p className="text-sm" data-testid="payment-line">{payments.isError ? 'Could not check for a receipt. Reload to try again.' : payments.isPending ? 'Checking for a receipt…' : paymentLine(payments.data?.find((p) => p.id === st.sourceId))}</p>
                    {canDecide && (
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" className="min-h-10 flex-1" disabled={!payments.isSuccess} onClick={() => setPending({ stay: st, action: 'confirm' })}>Confirm booking</Button>
                        <Button size="sm" variant="outline" className="min-h-10 flex-1" onClick={() => setPending({ stay: st, action: 'decline' })}>Decline</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          );
        }}
      </QueryState>
      {pending?.action === 'confirm' && <ConfirmSheet key={pending.stay.key} stay={pending.stay} payment={payments.data?.find((p) => p.id === pending.stay.sourceId) ?? null} onClose={() => setPending(null)} />}
      {pending?.action === 'decline' && <DeclineSheet key={pending.stay.key} stay={pending.stay} onClose={() => setPending(null)} />}
    </div>
  );
}
