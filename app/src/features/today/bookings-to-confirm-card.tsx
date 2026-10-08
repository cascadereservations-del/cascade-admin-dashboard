import { Link } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { useSession } from '@/auth/session';
import { fetchInquiryPayments } from '@/features/bookings/confirm-api';
import { Card, CardContent } from '@/components/ui/card';

// SPEC-44: how many direct bookings wait for a Confirm. Hidden for roles that
// cannot see payments, while loading or on error, and at zero.
export function BookingsToConfirmCard() {
  const s = useSession();
  const allowed = s.caps.can('approve_payment') || s.caps.can('read_finance');
  const q = useQuery({ queryKey: ['inquiry-payments', s.propertyId], queryFn: () => fetchInquiryPayments(s.propertyId), enabled: allowed, refetchInterval: 120_000 });
  const n = q.data?.length ?? 0;
  if (!allowed || n === 0) return null;
  return (
    <Card className="py-3">
      <CardContent>
        <Link to="/bookings/inquiries" className="flex items-center justify-between gap-2 font-medium hover:underline">
          <span>{n} {n === 1 ? 'booking' : 'bookings'} to confirm</span>
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  );
}
