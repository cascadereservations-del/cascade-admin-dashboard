import { supabase } from '@/lib/supabase';
import { AppError } from '@/lib/errors';
import { rpc, unwrapList } from '@/lib/rpc';
import { newIdempotencyKey } from '@/lib/idempotency';
import { todayManila } from '@/lib/dates';
import { mergeStays, type CalendarRow, type InquiryRow, type ReservationRow, type Stay } from './model';

// Adapter for the bookings module. Reads go through RLS-protected tables and
// are merged by the tested read model; writes go only through the deployed
// authoritative RPCs (decide_direct_booking, record_booking_lifecycle_action).

export type StaysResult = { stays: Stay[]; sourceAsOf: string | null; warnings: string[] };

export async function fetchStays(propertyId: string): Promise<StaysResult> {
  const [r, i, c, sync] = await Promise.all([
    supabase
      .from('airbnb_reservations')
      .select('id, confirmation_code, status, guest_id, guest_name, guest_count, checkin_date, checkout_date, checkin_time, checkout_time, guest_paid, host_service_fee, host_payout, payout_amount, payout_date, cancelled_at, refund_type, created_at')
      .eq('property_id', propertyId)
      .order('checkin_date', { ascending: false })
      .limit(1000),
    supabase
      .from('booking_inquiries')
      .select('id, guest_name, guest_email, guest_phone, checkin_date, checkout_date, pax, total_amount, deposit_amount, status, source, submitted_at, guest_id')
      .eq('property_id', propertyId)
      .order('checkin_date', { ascending: false })
      .limit(500),
    supabase
      .from('calendar_events')
      .select('id, uid, source, checkin_date, checkout_date, guest_name, status, linked_reservation_id, synced_at, raw_summary')
      .eq('property_id', propertyId)
      .order('checkin_date', { ascending: false })
      .limit(1000),
    supabase.from('calendar_sync_log').select('synced_at, status').order('synced_at', { ascending: false }).limit(1),
  ]);
  const res = unwrapList<ReservationRow>(r);
  const inq = unwrapList<InquiryRow>(i);
  const cal = unwrapList<CalendarRow>(c);
  const warnings: string[] = [];
  if (res.rows.length >= 1000) warnings.push('Reservation list truncated at 1000 rows.');
  const lastSync = sync.data?.[0];
  if (lastSync && lastSync.status !== 'success' && lastSync.status !== 'ok') warnings.push(`Last calendar sync reported "${lastSync.status}".`);
  return { stays: mergeStays(res.rows, inq.rows, cal.rows, todayManila()), sourceAsOf: lastSync?.synced_at ?? null, warnings };
}

export type StayDetail = {
  stay: Stay | null;
  reservation: ReservationRow | null;
  inquiry: InquiryRow | null;
  calendar: CalendarRow | null;
  lifecycle: Array<{ id: string; event_type: string; reason: string | null; created_at: string; actor_user_id: string | null }>;
  decisions: Array<{ id: string; action: string; outcome: string; created_at: string }>;
  transactions: Array<{ id: string; transaction_date: string; txn_type: string; category: string; gross_amount: string; status: string; source: string }> | 'forbidden';
  cleaning: Array<{ id: string; cleaned_at: string; cleaner_name: string; is_complete: boolean | null }>;
  conversations: Array<{ id: string; channel: string; status: string; purpose: string | null; updated_at: string }> | 'forbidden';
};

const none = Promise.resolve({ data: null, error: null });
const empty = Promise.resolve({ data: [] as never[], error: null });

export async function fetchStayDetail(propertyId: string, kind: string, id: string, canReadFinance: boolean): Promise<StayDetail> {
  const all = await fetchStays(propertyId);
  const stay = all.stays.find((s) => s.sourceId === id) ?? null;
  const [r, i, c] = await Promise.all([
    kind === 'airbnb' ? supabase.from('airbnb_reservations').select('*').eq('id', id).maybeSingle() : none,
    kind === 'direct' ? supabase.from('booking_inquiries').select('*').eq('id', id).maybeSingle() : none,
    stay?.calendar ? supabase.from('calendar_events').select('*').eq('id', stay.calendar.id).maybeSingle() : none,
  ]);
  const reservation = (r.data as ReservationRow | null) ?? null;
  const inquiry = (i.data as InquiryRow | null) ?? null;
  const txnFilter = kind === 'airbnb' && reservation ? `booking_id.eq.${id},external_ref.eq.${reservation.confirmation_code}` : `booking_id.eq.${id}`;
  const [life, dec, txn, clean, conv] = await Promise.all([
    kind === 'direct' ? supabase.from('booking_lifecycle_events').select('id, event_type, reason, created_at, actor_user_id').eq('booking_id', id).order('created_at', { ascending: false }) : empty,
    kind === 'direct' ? supabase.from('booking_decisions').select('id, action, outcome, created_at').eq('booking_id', id).order('created_at', { ascending: false }) : empty,
    canReadFinance
      ? supabase.from('transactions').select('id, transaction_date, txn_type, category, gross_amount, status, source').eq('property_id', propertyId).or(txnFilter).order('transaction_date', { ascending: false })
      : Promise.resolve({ data: null, error: { code: '42501', message: 'finance not permitted' } }),
    stay ? supabase.from('cleaning_sessions').select('id, cleaned_at, cleaner_name, is_complete').eq('property_id', propertyId).eq('checkout_date', stay.checkout).order('cleaned_at', { ascending: false }) : empty,
    supabase.from('guest_conversations').select('id, channel, status, purpose, updated_at').eq('booking_id', id).order('updated_at', { ascending: false }),
  ]);
  return {
    stay,
    reservation,
    inquiry,
    calendar: (c.data as CalendarRow | null) ?? null,
    lifecycle: (life.data as StayDetail['lifecycle']) ?? [],
    decisions: (dec.data as StayDetail['decisions']) ?? [],
    transactions: txn.error ? 'forbidden' : ((txn.data as Exclude<StayDetail['transactions'], 'forbidden'>) ?? []),
    cleaning: (clean.data as StayDetail['cleaning']) ?? [],
    conversations: conv.error ? 'forbidden' : ((conv.data as Exclude<StayDetail['conversations'], 'forbidden'>) ?? []),
  };
}

// BKG03: confirm/decline a direct inquiry through the canonical decision RPC.
// The server rechecks availability inside its transaction and serialises on
// the idempotency key, so two concurrent confirmations cannot both succeed.
// decide_direct_booking requires the id of a final Finance review of the
// booking's payment evidence (approved authorises confirm, rejected authorises
// decline); without one the server refuses. Look it up and name it.
export async function decideDirectBooking(bookingId: string, action: 'confirm' | 'decline', idempotencyKey = newIdempotencyKey('decision')) {
  const wanted = action === 'confirm' ? 'approved' : 'rejected';
  const { data: review, error } = await supabase
    .from('payment_finance_reviews')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('outcome', wanted)
    .order('reviewed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!review) {
    throw new AppError('validation', `No ${wanted} Finance review of this booking's payment yet. Review it in Finance → Payment queue first.`);
  }
  // D-171: decide_direct_booking is service_role only, so the direct call could never succeed; this is its staff-session gate (approve_payment).
  return rpc<Record<string, unknown>>('staff_decide_direct_booking_v1', { p_booking_id: bookingId, p_action: action, p_idempotency_key: idempotencyKey, p_finance_review_id: review.id });
}

// BKG04: cancellation and amendment update the lifecycle only; refunds are a
// separate authorised state via authorize_booking_refund.
export async function lifecycleAction(
  bookingId: string,
  action: 'amend' | 'cancel' | 'no_show' | 'reconcile_calendar',
  reason: string,
  dates?: { checkin: string; checkout: string },
  idempotencyKey = newIdempotencyKey('lifecycle'),
) {
  return rpc<Record<string, unknown>>('record_booking_lifecycle_action', {
    p_booking_id: bookingId,
    p_action: action,
    p_idempotency_key: idempotencyKey,
    p_reason: reason,
    p_checkin_date: dates?.checkin ?? null,
    p_checkout_date: dates?.checkout ?? null,
  });
}

export async function authorizeRefund(bookingId: string, amount: string, reason: string, idempotencyKey = newIdempotencyKey('refund')) {
  return rpc<Record<string, unknown>>('authorize_booking_refund', { p_booking_id: bookingId, p_amount: amount, p_currency: 'PHP', p_reason: reason, p_idempotency_key: idempotencyKey });
}
