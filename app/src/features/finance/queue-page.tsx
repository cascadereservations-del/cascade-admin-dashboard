import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { formatDate, formatDateTime } from '@/lib/dates';
import { formatPHP } from '@/lib/money';
import { toAppError } from '@/lib/errors';
import { PageHeader, Section } from '@/components/data/page-header';
import { EmptyState, ErrorState, QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchPaymentQueue, fetchTransactions, reviewPayment, reviewTransaction } from './api';

// Finance review queue: pending-review ledger rows (existing contract) and the
// deployed payment evidence queue. Every action leaves a receipt toast.

export default function FinanceQueuePage() {
  const s = useSession();
  const qc = useQueryClient();
  const canApprove = s.caps.can('approve_payment');
  const pending = useQuery({ queryKey: ['transactions', s.propertyId, 'pending'], queryFn: () => fetchTransactions(s.propertyId, { status: 'pending_review' }) });
  const payments = useQuery({ queryKey: ['payment-queue', s.propertyId], queryFn: () => fetchPaymentQueue(s.propertyId) });
  const [reason, setReason] = useState<Record<string, string>>({});
  const review = useMutation({
    mutationFn: (p: { id: string; status: 'confirmed' | 'void' }) => reviewTransaction(p.id, p.status, reason[p.id]),
    onSuccess: (r) => {
      toast.success(`Transaction ${r.status}`, { description: formatDateTime(new Date().toISOString()) });
      void qc.invalidateQueries({ queryKey: ['transactions'] });
      void qc.invalidateQueries({ queryKey: ['overview'] });
    },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const decidePayment = useMutation({
    mutationFn: (p: { id: string; outcome: string }) => reviewPayment(p.id, p.outcome, reason[p.id] ?? 'reviewed in admin'),
    onSuccess: () => { toast.success('Payment review recorded'); void qc.invalidateQueries({ queryKey: ['payment-queue'] }); },
    onError: (e) => toast.error(toAppError(e).message),
  });
  const paymentRows = Array.isArray(payments.data) ? payments.data : (payments.data?.rows ?? []);
  return (
    <div>
      <PageHeader title="Finance review" description="Items that block displayed totals until reviewed. Approvals need a two-factor session." actions={<Button variant="outline" asChild><Link to="/finance/journals">Record an entry</Link></Button>} />
      <div className="space-y-6">
        <Section title="Transactions awaiting review">
          <QueryState query={pending}>
            {(d) => d.rows.length === 0 ? <EmptyState title="No transactions awaiting review" hint="OCR receipts and Airbnb e-mail candidates land here as pending_review." /> : (
              <ul className="divide-y rounded-lg border text-sm">
                {d.rows.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <span className="tabular w-24">{formatDate(t.transaction_date, 'long')}</span>
                    <div className="min-w-0 flex-1"><span className="font-medium capitalize">{t.txn_type}</span> · {t.category} · {t.source}{t.payee_name ? ` · ${t.payee_name}` : ''}{t.external_ref ? ` · ${t.external_ref}` : ''}{t.ocr_confidence ? ` · OCR ${Number(t.ocr_confidence).toFixed(2)}` : ''}</div>
                    <span className="tabular font-medium">{formatPHP(t.gross_amount)}</span>
                    {canApprove ? (
                      <div className="flex items-center gap-1"><Input aria-label="Review note" placeholder="Note" className="h-8 w-40 text-sm" value={reason[t.id] ?? ''} onChange={(e) => setReason({ ...reason, [t.id]: e.target.value })} /><Button size="sm" onClick={() => review.mutate({ id: t.id, status: 'confirmed' })}>Confirm</Button><Button size="sm" variant="outline" onClick={() => review.mutate({ id: t.id, status: 'void' })}>Void</Button></div>
                    ) : <StatusBadge tone="warn">needs approval role</StatusBadge>}
                  </li>
                ))}
              </ul>
            )}
          </QueryState>
        </Section>
        <Section title="Payment evidence comparisons">
          {payments.isPending ? <p className="text-sm text-muted-foreground">Loading…</p> : payments.isError ? <ErrorState error={payments.error} onRetry={() => void payments.refetch()} /> : paymentRows.length === 0 ? <EmptyState title="Nothing in the payment review queue" /> : (
            <ul className="divide-y rounded-lg border text-sm">
              {paymentRows.map((r, i) => {
                const id = String(r.comparison_id ?? r.id ?? i);
                return (
                  <li key={id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">Booking {String(r.booking_id ?? '—')} · expected {formatPHP(String(r.expected_amount ?? ''))} · {String(r.comparison_outcome ?? 'outcome unknown')}{r.amount_delta ? ` · delta ${formatPHP(String(r.amount_delta))}` : ''}</div>
                    {canApprove && <div className="flex items-center gap-1"><Input aria-label="Reason" placeholder="Reason" className="h-8 w-40 text-sm" value={reason[id] ?? ''} onChange={(e) => setReason({ ...reason, [id]: e.target.value })} /><Button size="sm" onClick={() => decidePayment.mutate({ id, outcome: 'approved' })}>Approve</Button><Button size="sm" variant="outline" onClick={() => decidePayment.mutate({ id, outcome: 'rejected' })}>Reject</Button></div>}
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>
    </div>
  );
}
