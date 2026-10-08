import { useState } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useSession } from '@/auth/session';
import { formatDate, formatDateTime } from '@/lib/dates';
import { formatPHP } from '@/lib/money';
import { toAppError } from '@/lib/errors';
import { PageHeader, Section } from '@/components/data/page-header';
import { EmptyState, QueryState } from '@/components/data/query-state';
import { StatusBadge } from '@/components/data/status-badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fetchInquiryPayments } from '@/features/bookings/confirm-api';
import { fetchTransactions, hidePendingInquiryRows, reviewTransaction } from './api';

// Finance review queue: pending-review ledger rows. Payment evidence for direct
// bookings is confirmed on Inquiries (SPEC-44). Every action leaves a receipt toast.

export default function FinanceQueuePage() {
  const s = useSession();
  const qc = useQueryClient();
  const canApprove = s.caps.can('approve_payment');
  const pending = useQuery({ queryKey: ['transactions', s.propertyId, 'pending'], queryFn: () => fetchTransactions(s.propertyId, { status: 'pending_review', hidden: '1' }) });
  // If this lookup fails the rows are shown as they are; nothing is hidden on a guess.
  const inquiries = useQuery({ queryKey: ['inquiry-payments', s.propertyId], queryFn: () => fetchInquiryPayments(s.propertyId), retry: false });
  const pendingBookingIds = inquiries.data ? new Set(inquiries.data.map((p) => p.id)) : null;
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
  return (
    <div>
      <PageHeader title="Finance review" description="Items that block displayed totals until reviewed. Approvals need a two-factor session." actions={<Button variant="outline" asChild><Link to="/finance/journals">Record an entry</Link></Button>} />
      <div className="space-y-6">
        <Section title="Transactions awaiting review">
          <QueryState query={pending}>
            {(d) => { const rows = hidePendingInquiryRows(d.rows, pendingBookingIds, inquiries.isPending); return rows.length === 0 ? <EmptyState title="No transactions awaiting review" hint="OCR receipts and Airbnb e-mail candidates land here as pending_review." /> : (
              <ul className="divide-y rounded-lg border text-sm">
                {rows.map((t) => (
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
            ); }}
          </QueryState>
          <p className="mt-3 text-sm text-muted-foreground">Direct booking payments are confirmed on <Link to="/bookings/inquiries" className="underline">Inquiries</Link>.</p>
        </Section>
      </div>
    </div>
  );
}
