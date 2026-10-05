import { rpc } from '@/lib/rpc';
import { formatPHP } from '@/lib/money';

// Pay rates adapter (D-301). cleaner_rate_schedule is the ONE source of the cleaning fee and the transport fee: the Cascade Staff
// app and the payment requests read the row in force on the clean's date. This page only ADDS a new effective-dated row through
// admin_add_pay_rate_v1 (owner/admin, append-only, audited); history is never edited.

export type PayRate = {
  id: string;
  effective_from: string;
  regular_rate: number | null;
  general_rate: number | null;
  /** null = the fee already includes transport, so staff get no transport toggle. */
  transport_rate: number | null;
  note: string | null;
  created_at: string;
};
export type PayRates = { ok: boolean; today: string; in_force: PayRate | null; next: PayRate | null; history: PayRate[] };
export type NewPayRate = { effectiveFrom: string; regular: number; general: number; transport: number | null; note: string };

/** Unknown stays null (never 0): a JSON number or numeric string becomes a finite number, anything else null. */
export function rateNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanRate(r: PayRate | null): PayRate | null {
  if (!r) return null;
  return { ...r, regular_rate: rateNumber(r.regular_rate), general_rate: rateNumber(r.general_rate), transport_rate: rateNumber(r.transport_rate) };
}

export async function fetchPayRates(propertyId: string): Promise<PayRates> {
  const r = await rpc<PayRates>('admin_pay_rates_v1', { p_property_id: propertyId });
  return { ...r, in_force: cleanRate(r.in_force), next: cleanRate(r.next), history: (r.history ?? []).map((h) => cleanRate(h) as PayRate) };
}

export function addPayRate(propertyId: string, input: NewPayRate) {
  return rpc<{ ok: boolean; id: string; effective_from: string; replayed: boolean }>('admin_add_pay_rate_v1', {
    p_property_id: propertyId,
    p_effective_from: input.effectiveFrom,
    p_regular: input.regular,
    p_general: input.general,
    p_transport: input.transport,
    p_note: input.note.trim(),
  });
}

/** One plain sentence for a rate: "₱500 per clean · ₱1,000 per deep clean · ₱150 transport when ticked". */
export function describeRate(r: Pick<PayRate, 'regular_rate' | 'general_rate' | 'transport_rate'>): string {
  const parts = [`${formatPHP(r.regular_rate, { whole: true })} per clean`, `${formatPHP(r.general_rate ?? r.regular_rate, { whole: true })} per deep clean`];
  parts.push(r.transport_rate === null ? 'transport included' : `${formatPHP(r.transport_rate, { whole: true })} transport when ticked`);
  return parts.join(' · ');
}

/** The earliest start date the server accepts: after the latest row, and not in the past. */
export function earliestStart(history: Array<Pick<PayRate, 'effective_from'>>, today: string, addDays: (d: string, n: number) => string): string {
  const latest = history.reduce<string | null>((m, h) => (m === null || h.effective_from > m ? h.effective_from : m), null);
  return latest !== null && latest >= today ? addDays(latest, 1) : today;
}

/** Mirrors admin_add_pay_rate_v1's checks so a bad form is caught before the server refuses it. null = fine. */
export function rateProblem(
  input: { effectiveFrom: string; regular: number; general: number; transport: number | null; note: string },
  earliest: string,
  today: string,
  addDays: (d: string, n: number) => string,
): string | null {
  const fee = (n: number) => Number.isFinite(n) && n >= 1 && n <= 10000 && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
  if (!input.effectiveFrom) return 'Pick the date the new rate starts.';
  if (input.effectiveFrom < earliest) return `A new rate starts on ${earliest} or later: history is never changed.`;
  if (input.effectiveFrom > addDays(today, 366)) return 'The start date is more than a year away.';
  if (!fee(input.regular)) return 'The cleaning fee is between 1 and 10,000.';
  if (!fee(input.general)) return 'The deep clean fee is between 1 and 10,000.';
  if (input.transport !== null && input.transport !== 0 && !(fee(input.transport) && input.transport <= 2000)) return 'The transport fee is between 1 and 2,000, or leave it empty when the fee already includes transport.';
  const note = input.note.trim();
  if (note.length < 3) return 'Say why (a few words), for the audit history.';
  if (note.length > 500) return 'Keep the note under 500 characters.';
  return null;
}
