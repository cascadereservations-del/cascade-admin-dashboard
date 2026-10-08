import { rpc } from '@/lib/rpc';
import { newIdempotencyKey } from '@/lib/idempotency';
import { normalizePayments, type DecisionResult, type InquiryPayment } from './confirm-model';

// SPEC-44 (Revision 1). The three RPCs are built in the stay-site release
// inquiry_one_tap_20261008. The confirm and decline calls are gated by the
// rollout switch through RPC_MODULE (finance / bookings) inside rpc().

export const newConfirmKey = () => newIdempotencyKey('confirm');

export async function fetchInquiryPayments(propertyId: string): Promise<InquiryPayment[]> {
  return normalizePayments(await rpc<unknown>('staff_inquiry_payments_v1', { p_property_id: propertyId }));
}

export function confirmDirectBooking(args: Record<string, unknown>) {
  return rpc<DecisionResult>('staff_confirm_direct_booking_v1', args);
}

export function declineDirectBooking(bookingId: string, reason: string, key: string) {
  return rpc<DecisionResult>('staff_decline_direct_booking_v1', { p_booking_id: bookingId, p_reason: reason, p_idempotency_key: key });
}
