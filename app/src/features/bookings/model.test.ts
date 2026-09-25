import { describe, expect, it } from 'vitest';
import { filterStays, mergeStays, type CalendarRow, type InquiryRow, type ReservationRow } from './model';

const res = (o: Partial<ReservationRow>): ReservationRow => ({
  id: 'r1', confirmation_code: 'HM1', status: 'confirmed', guest_id: 'g1', guest_name: 'Ana', guest_count: 2,
  checkin_date: '2026-09-20', checkout_date: '2026-09-22', checkin_time: null, checkout_time: null, guest_paid: '6000.00',
  host_service_fee: '180.00', host_payout: '5820.00', payout_amount: null, payout_date: null, cancelled_at: null, refund_type: null,
  created_at: '2026-09-01T00:00:00Z', ...o,
});
const cal = (o: Partial<CalendarRow>): CalendarRow => ({
  id: 'c1', uid: 'uid-1', source: 'airbnb', checkin_date: '2026-09-20', checkout_date: '2026-09-22', guest_name: null, status: 'confirmed',
  linked_reservation_id: null, synced_at: '2026-09-13T00:00:00Z', raw_summary: 'Reserved', ...o,
});
const inq = (o: Partial<InquiryRow>): InquiryRow => ({
  id: 'i1', guest_name: 'Ben', guest_email: null, guest_phone: null, checkin_date: '2026-10-01', checkout_date: '2026-10-03', pax: 2,
  total_amount: '4000.00', deposit_amount: null, status: 'pending', source: 'direct', submitted_at: '2026-09-10T00:00:00Z', guest_id: null, receipt_image_path: null, ...o,
});

describe('mergeStays', () => {
  it('an Airbnb reservation and its linked calendar event are one stay', () => {
    const stays = mergeStays([res({})], [], [cal({ linked_reservation_id: 'r1' })], '2026-09-13');
    expect(stays).toHaveLength(1);
    expect(stays[0]!.calendar?.match).toBe('linked');
  });
  it('an unlinked calendar event with the same dates attaches by date match, once', () => {
    const stays = mergeStays([res({})], [], [cal({}), cal({ id: 'c2', uid: 'uid-2' })], '2026-09-13');
    expect(stays.filter((s) => s.kind === 'airbnb')).toHaveLength(1);
    expect(stays.filter((s) => s.kind === 'calendar_only')).toHaveLength(1);
  });
  it('blocked calendar nights are not stays', () => {
    const stays = mergeStays([], [], [cal({ status: 'blocked' })], '2026-09-13');
    expect(stays[0]!.kind).toBe('blocked');
    expect(stays[0]!.bookingState).toBe('unknown');
  });
  it('payout state is separate from booking state', () => {
    const [s] = mergeStays([res({ payout_date: null })], [], [], '2026-09-13');
    expect(s!.bookingState).toBe('confirmed');
    expect(s!.payoutState).toBe('expected');
    const [t] = mergeStays([res({ payout_date: '2026-09-25' })], [], [], '2026-09-13');
    expect(t!.payoutState).toBe('recorded');
  });
  it('a confirmed reservation whose checkout has passed reads as completed', () => {
    const [s] = mergeStays([res({ checkin_date: '2026-09-01', checkout_date: '2026-09-03' })], [], [], '2026-09-13');
    expect(s!.bookingState).toBe('completed');
  });
  it('direct inquiries keep their identity and payment state', () => {
    const [s] = mergeStays([], [inq({})], [], '2026-09-13');
    expect(s!.kind).toBe('direct');
    expect(s!.bookingState).toBe('inquiry');
    expect(s!.paymentState).toBe('not_recorded');
    expect(s!.payoutState).toBe('not_applicable');
  });
  it('a fee due is not a payment: only a receipt or a confirmation records the deposit', () => {
    const due = { total_amount: '3560.00', deposit_amount: '1780.00' };
    expect(mergeStays([], [inq(due)], [], '2026-09-13')[0]!.paymentState).toBe('not_recorded');
    expect(mergeStays([], [inq({ ...due, receipt_image_path: 'r.jpg' })], [], '2026-09-13')[0]!.paymentState).toBe('deposit_recorded');
    expect(mergeStays([], [inq({ ...due, status: 'confirmed' })], [], '2026-09-13')[0]!.paymentState).toBe('deposit_recorded');
  });
  it('quick views filter arrivals, pending and unpaid', () => {
    const stays = mergeStays([res({})], [inq({})], [], '2026-09-13');
    expect(filterStays(stays, { view: 'pending' }, '2026-09-13').map((s) => s.kind)).toEqual(['direct']);
    expect(filterStays(stays, { view: 'arrivals' }, '2026-09-13')).toHaveLength(2);
    expect(filterStays(stays, { view: 'unpaid' }, '2026-09-13').map((s) => s.kind)).toEqual(['direct']);
    expect(filterStays(stays, { q: 'hm1' }, '2026-09-13')).toHaveLength(1);
  });
});
