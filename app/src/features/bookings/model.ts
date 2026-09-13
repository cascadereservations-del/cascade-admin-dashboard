import type { IsoDate } from '@/lib/dates';
import { nightsBetween } from '@/lib/dates';

// BKG01 unified read model. Airbnb reservations and direct inquiries/bookings
// become one Stay each; a calendar event is attached (never a second stay)
// when it is linked by id or, for Airbnb, matches on exact dates.

export type ReservationRow = {
  id: string;
  confirmation_code: string;
  status: string;
  guest_id: string | null;
  guest_name: string | null;
  guest_count: number | null;
  checkin_date: IsoDate | null;
  checkout_date: IsoDate | null;
  checkin_time: string | null;
  checkout_time: string | null;
  guest_paid: string | number | null;
  host_service_fee: string | number | null;
  host_payout: string | number | null;
  payout_amount: string | number | null;
  payout_date: IsoDate | null;
  cancelled_at: string | null;
  refund_type: string | null;
  created_at: string;
};

export type InquiryRow = {
  id: string;
  guest_name: string;
  guest_email: string | null;
  guest_phone: string | null;
  checkin_date: IsoDate;
  checkout_date: IsoDate;
  pax: number | null;
  total_amount: string | number | null;
  deposit_amount: string | number | null;
  status: string;
  source: string | null;
  submitted_at: string | null;
  guest_id: string | null;
};

export type CalendarRow = {
  id: string;
  uid: string;
  source: string;
  checkin_date: IsoDate;
  checkout_date: IsoDate;
  guest_name: string | null;
  status: string;
  linked_reservation_id: string | null;
  synced_at: string;
  raw_summary: string | null;
};

export type StayKind = 'airbnb' | 'direct' | 'calendar_only' | 'blocked';
export type BookingState = 'inquiry' | 'confirmed' | 'completed' | 'cancelled' | 'unknown';
export type PaymentState = 'unknown' | 'deposit_recorded' | 'guest_paid_reported' | 'not_recorded';
export type PayoutState = 'not_applicable' | 'expected' | 'recorded' | 'unknown';

export type Stay = {
  key: string;
  kind: StayKind;
  sourceId: string;
  code: string;
  guestName: string;
  guestId: string | null;
  guestCount: number | null;
  checkin: IsoDate;
  checkout: IsoDate;
  nights: number;
  bookingState: BookingState;
  paymentState: PaymentState;
  payoutState: PayoutState;
  payoutDate: IsoDate | null;
  guestPaid: string | null;
  hostPayout: string | null;
  totalAmount: string | null;
  depositAmount: string | null;
  calendar: { id: string; match: 'linked' | 'date_match'; status: string; syncedAt: string } | null;
  createdAt: string | null;
  href: string;
};

const dec = (v: string | number | null | undefined): string | null => (v === null || v === undefined ? null : typeof v === 'number' ? v.toFixed(2) : String(v));

function reservationState(s: string): BookingState {
  if (s === 'confirmed' || s === 'completed' || s === 'cancelled') return s;
  return 'unknown';
}

function inquiryState(s: string): BookingState {
  if (s === 'pending' || s === 'inquiry') return 'inquiry';
  if (s === 'confirmed') return 'confirmed';
  if (s === 'cancelled' || s === 'declined') return 'cancelled';
  if (s === 'completed') return 'completed';
  return 'unknown';
}

export function mergeStays(res: ReservationRow[], inq: InquiryRow[], cal: CalendarRow[], today: IsoDate): Stay[] {
  const stays: Stay[] = [];
  const usedCal = new Set<string>();
  const byLinked = new Map<string, CalendarRow>();
  const byDates = new Map<string, CalendarRow[]>();
  for (const c of cal) {
    if (c.status === 'cancelled') continue;
    if (c.linked_reservation_id) byLinked.set(c.linked_reservation_id, c);
    const k = `${c.source}|${c.checkin_date}|${c.checkout_date}`;
    byDates.set(k, [...(byDates.get(k) ?? []), c]);
  }

  for (const r of res) {
    if (!r.checkin_date || !r.checkout_date) continue;
    let calRow: CalendarRow | undefined = byLinked.get(r.id);
    let match: 'linked' | 'date_match' = 'linked';
    if (!calRow) {
      const cands = (byDates.get(`airbnb|${r.checkin_date}|${r.checkout_date}`) ?? []).filter((c) => !usedCal.has(c.id) && c.status !== 'blocked');
      calRow = cands[0];
      match = 'date_match';
    }
    if (calRow) usedCal.add(calRow.id);
    const state = reservationState(r.status);
    const bookingState: BookingState = state === 'confirmed' && r.checkout_date <= today ? 'completed' : state;
    const payoutState: PayoutState = state === 'cancelled' ? 'not_applicable' : r.payout_date ? 'recorded' : r.host_payout !== null ? 'expected' : 'unknown';
    stays.push({
      key: `airbnb:${r.id}`,
      kind: 'airbnb',
      sourceId: r.id,
      code: r.confirmation_code,
      guestName: r.guest_name ?? 'Unknown guest',
      guestId: r.guest_id,
      guestCount: r.guest_count,
      checkin: r.checkin_date,
      checkout: r.checkout_date,
      nights: nightsBetween(r.checkin_date, r.checkout_date),
      bookingState,
      paymentState: r.guest_paid !== null ? 'guest_paid_reported' : 'unknown',
      payoutState,
      payoutDate: r.payout_date,
      guestPaid: dec(r.guest_paid),
      hostPayout: dec(r.host_payout),
      totalAmount: dec(r.guest_paid),
      depositAmount: null,
      calendar: calRow ? { id: calRow.id, match, status: calRow.status, syncedAt: calRow.synced_at } : null,
      createdAt: r.created_at,
      href: `/bookings/airbnb/${r.id}`,
    });
  }

  for (const i of inq) {
    let calRow = byLinked.get(i.id);
    let match: 'linked' | 'date_match' = 'linked';
    if (!calRow) {
      const cands = (byDates.get(`direct|${i.checkin_date}|${i.checkout_date}`) ?? []).filter((c) => !usedCal.has(c.id));
      calRow = cands[0];
      match = 'date_match';
    }
    if (calRow) usedCal.add(calRow.id);
    const state = inquiryState(i.status);
    const bookingState: BookingState = state === 'confirmed' && i.checkout_date <= today ? 'completed' : state;
    stays.push({
      key: `direct:${i.id}`,
      kind: 'direct',
      sourceId: i.id,
      code: `DIR-${i.id.slice(0, 8).toUpperCase()}`,
      guestName: i.guest_name,
      guestId: i.guest_id,
      guestCount: i.pax,
      checkin: i.checkin_date,
      checkout: i.checkout_date,
      nights: nightsBetween(i.checkin_date, i.checkout_date),
      bookingState,
      paymentState: i.deposit_amount !== null && Number(i.deposit_amount) > 0 ? 'deposit_recorded' : 'not_recorded',
      payoutState: 'not_applicable',
      payoutDate: null,
      guestPaid: null,
      hostPayout: null,
      totalAmount: dec(i.total_amount),
      depositAmount: dec(i.deposit_amount),
      calendar: calRow ? { id: calRow.id, match, status: calRow.status, syncedAt: calRow.synced_at } : null,
      createdAt: i.submitted_at,
      href: `/bookings/direct/${i.id}`,
    });
  }

  for (const c of cal) {
    if (usedCal.has(c.id) || c.status === 'cancelled') continue;
    const blocked = c.status === 'blocked';
    stays.push({
      key: `cal:${c.id}`,
      kind: blocked ? 'blocked' : 'calendar_only',
      sourceId: c.id,
      code: c.uid.slice(0, 12),
      guestName: blocked ? 'Blocked (calendar)' : (c.guest_name ?? c.raw_summary ?? 'Calendar reservation'),
      guestId: null,
      guestCount: null,
      checkin: c.checkin_date,
      checkout: c.checkout_date,
      nights: nightsBetween(c.checkin_date, c.checkout_date),
      bookingState: blocked ? 'unknown' : 'confirmed',
      paymentState: 'unknown',
      payoutState: blocked ? 'not_applicable' : 'unknown',
      payoutDate: null,
      guestPaid: null,
      hostPayout: null,
      totalAmount: null,
      depositAmount: null,
      calendar: { id: c.id, match: 'linked', status: c.status, syncedAt: c.synced_at },
      createdAt: null,
      href: `/bookings/calendar/${c.id}`,
    });
  }

  return stays.sort((a, b) => (a.checkin < b.checkin ? 1 : a.checkin > b.checkin ? -1 : 0));
}

export type StayFilters = { q?: string; status?: string; channel?: string; from?: string; to?: string; balance?: string; view?: string };

export function filterStays(stays: Stay[], f: StayFilters, today: IsoDate): Stay[] {
  let out = stays;
  const from = f.from;
  const to = f.to;
  if (f.view === 'arrivals') out = out.filter((s) => s.checkin >= today && s.kind !== 'blocked' && s.bookingState !== 'cancelled');
  if (f.view === 'departures') out = out.filter((s) => s.checkout >= today && s.checkin <= today && s.kind !== 'blocked' && s.bookingState !== 'cancelled');
  if (f.view === 'upcoming') out = out.filter((s) => s.checkin > today && s.bookingState === 'confirmed');
  if (f.view === 'pending') out = out.filter((s) => s.bookingState === 'inquiry');
  if (f.view === 'unpaid') out = out.filter((s) => s.kind === 'direct' && s.bookingState !== 'cancelled' && s.paymentState === 'not_recorded');
  if (f.status) out = out.filter((s) => s.bookingState === f.status);
  if (f.channel) out = out.filter((s) => s.kind === f.channel);
  if (from) out = out.filter((s) => s.checkout > from);
  if (to) out = out.filter((s) => s.checkin < to);
  if (f.balance === 'outstanding') out = out.filter((s) => s.paymentState === 'not_recorded' || s.paymentState === 'unknown');
  if (f.q) {
    const q = f.q.toLowerCase();
    out = out.filter((s) => s.guestName.toLowerCase().includes(q) || s.code.toLowerCase().includes(q));
  }
  return out;
}
