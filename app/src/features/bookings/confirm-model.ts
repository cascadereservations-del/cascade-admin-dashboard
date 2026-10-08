import { formatDate } from '@/lib/dates';
import { formatPHP, fromCentavos, toCentavos } from '@/lib/money';

// SPEC-44 (Revision 1): one Confirm booking sheet per pending inquiry. Pure
// helpers only; the RPC calls live in confirm-api.ts. Unknown payment fields
// are null, never 0, and the page never claims a reference "matches".

export type InquiryPayment = {
  id: string;
  booking_ref: string | null;
  guest_name: string | null;
  checkin_date: string | null;
  checkout_date: string | null;
  pax: number | null;
  expected_amount: string | null;
  comparison_id: string | null;
  candidate_amount: string | null;
  reference: string | null;
  receipt_image_path: string | null;
  hold_expires_at: string | null;
};

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const amount = (v: unknown): string | null => (typeof v === 'string' || typeof v === 'number' ? (toCentavos(v) === null ? null : String(v)) : null);

/** Rows from staff_inquiry_payments_v1; a missing field is null, an amount that is not a number is null (never 0). */
export function normalizePayments(raw: unknown): InquiryPayment[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const o = (r ?? {}) as Record<string, unknown>;
    const id = str(o.id);
    if (!id) return [];
    return [{
      id,
      booking_ref: str(o.booking_ref),
      guest_name: str(o.guest_name),
      checkin_date: str(o.checkin_date),
      checkout_date: str(o.checkout_date),
      pax: typeof o.pax === 'number' ? o.pax : null,
      expected_amount: amount(o.expected_amount),
      comparison_id: str(o.comparison_id),
      candidate_amount: amount(o.candidate_amount),
      reference: str(o.reference),
      receipt_image_path: str(o.receipt_image_path),
      hold_expires_at: str(o.hold_expires_at),
    }];
  });
}

/** A receipt is on file when the server has compared one (it gave a comparison id). */
export const hasReceipt = (p: InquiryPayment | null | undefined): p is InquiryPayment => !!p?.comparison_id;

/** "Receipt on file · ₱5,073.00 · ref ...1234" or "No receipt yet". Unknown parts are left out. */
export function paymentLine(p: InquiryPayment | null | undefined): string {
  if (!hasReceipt(p)) return 'No receipt yet';
  const parts = ['Receipt on file'];
  const amt = p.candidate_amount ?? null;
  if (amt !== null) parts.push(formatPHP(amt));
  if (p.reference) parts.push(`ref ...${p.reference.slice(-4)}`);
  return parts.join(' · ');
}

export type Method = 'messenger_gcash' | 'gcash_qr' | 'bank' | 'cash' | 'other';
export const METHODS: ReadonlyArray<{ value: Method; label: string }> = [
  { value: 'messenger_gcash', label: 'GCash via Messenger' },
  { value: 'gcash_qr', label: 'GCash QR' },
  { value: 'bank', label: 'Bank' },
  { value: 'cash', label: 'Cash' },
  { value: 'other', label: 'Other' },
];

export type ConfirmForm = { checked: boolean; method: Method; reference: string; amount: string; note: string };
export type FormErrors = Partial<Record<'checked' | 'reference' | 'amount' | 'note', string>>;

/** The decimal string for an amount the staff typed ("5,073" -> "5073.00"), or null when it is not above zero or has more than two decimals. */
export function parseAmount(text: string): string | null {
  const clean = text.replace(/[,\s]|^(PHP|₱)/gi, '');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null; // more than two decimals is refused, never truncated
  const cents = toCentavos(clean);
  return cents !== null && cents > 0 ? fromCentavos(cents) : null;
}

/** With a receipt the method is fixed (messenger_gcash) and the reference comes from the receipt unless it has none. */
export function validateConfirm(f: ConfirmForm, payment: InquiryPayment | null | undefined): FormErrors {
  const e: FormErrors = {};
  const receipt = hasReceipt(payment);
  if (receipt && !f.checked) e.checked = 'Tick the box once you have checked the money arrived.';
  if (parseAmount(f.amount) === null) e.amount = 'Enter the amount received, more than zero, with at most two decimal places.';
  const needsRef = receipt ? !payment.reference : f.method !== 'cash';
  if (needsRef && !f.reference.trim()) e.reference = 'Enter the payment reference.';
  if (!receipt && f.method === 'cash' && !f.note.trim()) e.note = 'Add a short note about the cash, for example who handed it over.';
  return e;
}

export function confirmArgs(bookingId: string, f: ConfirmForm, payment: InquiryPayment | null | undefined, key: string) {
  const receipt = hasReceipt(payment);
  const method: Method = receipt ? 'messenger_gcash' : f.method;
  const reference = (receipt && payment.reference ? payment.reference : f.reference).trim();
  return {
    p_booking_id: bookingId,
    p_method: method,
    p_reference: reference === '' || (!receipt && method === 'cash') ? null : reference,
    p_amount: parseAmount(f.amount),
    p_note: f.note.trim() === '' ? null : f.note.trim(),
    p_comparison_id: receipt ? payment.comparison_id : null,
    p_idempotency_key: key,
  };
}

export type DecisionResult = { ok?: boolean; outcome?: string; booking_ref?: string | null; guest_name?: string | null; checkin?: string | null; checkout?: string | null; prior_ref?: string | null };

/** One plain sentence per confirm outcome. The sheet closes only on `confirmed`. */
export function confirmSentence(r: DecisionResult): string {
  switch (r.outcome) {
    case 'confirmed': {
      const who = r.guest_name ?? 'The guest';
      const when = r.checkin && r.checkout ? `, ${formatDate(r.checkin)} to ${formatDate(r.checkout)}` : '';
      return `Booking confirmed for ${who}${when}.`;
    }
    case 'conflict': return 'These dates clash with another stay, so nothing was confirmed.';
    case 'invalid_state': return 'This booking is no longer waiting for a decision. Nothing was changed.';
    case 'reference_reused': return `That payment reference was already used for booking ${r.prior_ref ?? 'another booking'}, so nothing was confirmed.`;
    case 'amount_required': return 'Enter the amount received, more than zero.';
    case 'reference_required': return 'Enter the payment reference.';
    case 'note_required': return 'Add a short note about the cash, for example who handed it over.';
    case 'denied': return 'Your account is not allowed to confirm bookings.';
    default: return 'Nothing was confirmed. Please try again.';
  }
}

export function declineSentence(r: DecisionResult): string {
  if (r.ok === true) return `Request declined${r.guest_name ? ` for ${r.guest_name}` : ''}.`;
  switch (r.outcome) {
    case 'invalid_state': return 'This booking is no longer waiting for a decision. Nothing was changed.';
    case 'denied': return 'Your account is not allowed to decline bookings.';
    default: return 'Nothing was declined. Please try again.';
  }
}

export const DECLINE_REASONS = ['Dates not available', 'No payment received', 'Guest asked to cancel', 'Duplicate request'] as const;

/** Chip plus free text, joined; null when both are empty. */
export function declineReason(chip: string | null, text: string): string | null {
  const t = text.trim();
  return [chip, t].filter(Boolean).join(': ') || null;
}
