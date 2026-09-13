import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { todayManila, formatDate, formatDateTime } from '@/lib/dates';
import { formatPHP } from '@/lib/money';
import { toAppError } from '@/lib/errors';
import { newIdempotencyKey } from '@/lib/idempotency';
import { PageHeader } from '@/components/data/page-header';
import { EmptyState, QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { decideDirectBooking, fetchStays } from './api';
import { filterStays, type Stay } from './model';

// BKG03/BKG05: pending direct inquiries with confirm/decline through the
// canonical decision RPC. The idempotency key is minted when the dialog opens
// so a retry after a network failure cannot create a second decision.

type Pending = { stay: Stay; action: 'confirm' | 'decline'; key: string };

export default function InquiriesPage() {
  const s = useSession();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['stays', s.propertyId], queryFn: () => fetchStays(s.propertyId) });
  const [pending, setPending] = useState<Pending | null>(null);
  const canDecide = s.caps.can('manage_operations');

  const decide = useMutation({
    mutationFn: (p: Pending) => decideDirectBooking(p.stay.sourceId, p.action, p.key),
    onSuccess: (res, p) => {
      toast.success(`${p.action === 'confirm' ? 'Confirmed' : 'Declined'} ${p.stay.guestName}`, {
        description: `Outcome: ${String(res.outcome ?? res.status ?? 'recorded')} · ${formatDateTime(new Date().toISOString())}`,
      });
      setPending(null);
      void qc.invalidateQueries({ queryKey: ['stays'] });
    },
    onError: (e) => {
      const err = toAppError(e);
      toast.error(err.kind === 'conflict' ? 'Those dates are no longer available or this decision already exists.' : err.message, { description: err.detail });
    },
  });

  return (
    <div>
      <PageHeader title="Inquiries" description="Direct booking requests awaiting a decision. Confirming rechecks availability on the server." actions={<Button variant="outline" asChild><Link to="/bookings?view=pending">Open in list</Link></Button>} />
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
                    {canDecide && (
                      <div className="flex gap-2 pt-1">
                        <Button size="sm" className="min-h-10 flex-1" onClick={() => setPending({ stay: st, action: 'confirm', key: newIdempotencyKey('decision') })}>Confirm</Button>
                        <Button size="sm" variant="outline" className="min-h-10 flex-1" onClick={() => setPending({ stay: st, action: 'decline', key: newIdempotencyKey('decision') })}>Decline</Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          );
        }}
      </QueryState>
      <Dialog open={!!pending} onOpenChange={(o) => !o && !decide.isPending && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{pending?.action === 'confirm' ? 'Confirm booking' : 'Decline inquiry'}</DialogTitle>
            <DialogDescription>
              {pending && `${pending.stay.guestName}, ${formatDate(pending.stay.checkin, 'long')} to ${formatDate(pending.stay.checkout, 'long')}. `}
              {pending?.action === 'confirm' ? 'Availability is rechecked inside the server transaction; a clash is rejected.' : 'The guest is not messaged automatically. Reply in Messenger as usual.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)} disabled={decide.isPending}>Cancel</Button>
            <Button onClick={() => pending && decide.mutate(pending)} disabled={decide.isPending}>{decide.isPending ? 'Working…' : pending?.action === 'confirm' ? 'Confirm' : 'Decline'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
