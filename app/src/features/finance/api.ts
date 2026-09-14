import { supabase } from '@/lib/supabase';
import { rpc, unwrapList } from '@/lib/rpc';
import { newIdempotencyKey } from '@/lib/idempotency';
import { assertMutationEnabled } from '@/lib/rollout';
import { toCentavos } from '@/lib/money';

// Finance adapter (P21-P26, P28). Reads: transactions ledger (RLS), payment
// review queue (deployed RPC), journals and statements (v1 RPCs). Writes:
// transaction review (existing table contract), post/reverse journals, opening
// balances, close. All amounts are decimal strings.

export type Txn = { id: string; transaction_date: string; txn_type: string; category: string; status: string; source: string; gross_amount: string; payee_name: string | null; or_number: string | null; external_ref: string | null; booking_id: string | null; reservation_id: string | null; income_stage: string | null; notes: string | null; receipt_image_path: string | null; ocr_confidence: string | null; created_at: string };
export type TxnFilters = { q?: string; type?: string; status?: string; source?: string; from?: string; to?: string; page?: string; mirror?: string };
const TXN_COLS = 'id, transaction_date, txn_type, category, status, source, gross_amount, payee_name, or_number, external_ref, booking_id, reservation_id, income_stage, notes, receipt_image_path, ocr_confidence, created_at';

export async function fetchTransactions(propertyId: string, f: TxnFilters) {
  let q = supabase.from('transactions').select(TXN_COLS, { count: 'exact' }).eq('property_id', propertyId).order('transaction_date', { ascending: false }).order('created_at', { ascending: false });
  if (f.q) q = q.or(`payee_name.ilike.%${f.q}%,external_ref.ilike.%${f.q}%,category.ilike.%${f.q}%,notes.ilike.%${f.q}%`);
  if (f.type) q = q.eq('txn_type', f.type);
  if (f.status) q = q.eq('status', f.status);
  if (f.source) q = q.eq('source', f.source);
  else if (f.mirror !== 'show') q = q.not('source', 'in', NOT_MIRROR); // estimates and CSV mirrors are archived by default; the payout is the record
  if (f.from) q = q.gte('transaction_date', f.from);
  if (f.to) q = q.lt('transaction_date', f.to);
  const page = Number(f.page) || 1;
  const res = await q.range((page - 1) * 25, page * 25 - 1);
  return { ...unwrapList<Txn>(res), page };
}

// Money that counts: the same rule as get_admin_overview_v1. Airbnb CSV rows
// (source airbnb, income_stage reconciliation) and booking-email estimates
// (airbnb_email) mirror the payout emails and would double count them.
export const MIRROR_SOURCES = ['airbnb', 'airbnb_email'] as const;
const NOT_MIRROR = `(${MIRROR_SOURCES.map((s) => `"${s}"`).join(',')})`;

// Account book (D-095): every row in date order, oldest first, with a running
// balance computed in integer centavos from already-authoritative rows.
// Drawings (owner transfers out) leave the balance like an expense but are
// totalled on their own so income − expenses − drawings reads directly.
export type BookRow = Txn & { inCents: number; outCents: number; drawCents: number; balanceCents: number };
export async function fetchLedgerBook(propertyId: string, f: { from?: string; to?: string; includePending?: boolean }): Promise<{ rows: BookRow[]; total: number; truncated: boolean }> {
  let q = supabase.from('transactions').select(TXN_COLS, { count: 'exact' }).eq('property_id', propertyId).neq('status', 'void').not('source', 'in', NOT_MIRROR).order('transaction_date', { ascending: true }).order('created_at', { ascending: true });
  if (!f.includePending) q = q.eq('status', 'confirmed');
  if (f.from) q = q.gte('transaction_date', f.from);
  if (f.to) q = q.lt('transaction_date', f.to);
  const res = unwrapList<Txn>(await q.range(0, 4999));
  let bal = 0;
  const rows = res.rows.map((r) => {
    const c = toCentavos(r.gross_amount) ?? 0;
    const inCents = r.txn_type === 'income' ? c : 0;
    const outCents = r.txn_type === 'expense' ? c : 0;
    const drawCents = r.txn_type === 'drawing' ? c : 0;
    bal += inCents - outCents - drawCents;
    return { ...r, inCents, outCents, drawCents, balanceCents: bal };
  });
  return { rows, total: res.total, truncated: res.total > rows.length };
}

// Monthly income, expense and drawing totals (confirmed rows only).
// unaccountedCents is tracked separately (not subtracted from expenseCents) so
// totals/position stay ledger-accurate; only the monthly trend chart uses it
// to keep a one-time catch-up entry (D-113) from dwarfing real monthly activity.
export type MonthTotal = { month: string; incomeCents: number; expenseCents: number; drawingCents: number; unaccountedCents: number; count: number };
export async function fetchMonthlyTotals(propertyId: string, fromMonth: string, toMonthExclusive?: string): Promise<MonthTotal[]> {
  let q = supabase.from('transactions').select('transaction_date, txn_type, category, gross_amount').eq('property_id', propertyId).eq('status', 'confirmed').not('source', 'in', NOT_MIRROR).gte('transaction_date', fromMonth).order('transaction_date', { ascending: true });
  if (toMonthExclusive) q = q.lt('transaction_date', toMonthExclusive);
  const res = unwrapList<Pick<Txn, 'transaction_date' | 'txn_type' | 'category' | 'gross_amount'>>(await q.range(0, 4999));
  const byMonth = new Map<string, MonthTotal>();
  for (const r of res.rows) {
    const month = r.transaction_date.slice(0, 7);
    const t = byMonth.get(month) ?? { month, incomeCents: 0, expenseCents: 0, drawingCents: 0, unaccountedCents: 0, count: 0 };
    const c = toCentavos(r.gross_amount) ?? 0;
    if (r.txn_type === 'income') t.incomeCents += c;
    else if (r.txn_type === 'expense') { t.expenseCents += c; if (r.category === 'unaccounted') t.unaccountedCents += c; }
    else if (r.txn_type === 'drawing') t.drawingCents += c;
    t.count += 1;
    byMonth.set(month, t);
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

// Existing review contract: the legacy admin flips status on the transactions table.
export async function reviewTransaction(id: string, status: 'confirmed' | 'void', note?: string) {
  assertMutationEnabled('finance');
  const { data, error } = await supabase.from('transactions').update({ status, ...(note ? { notes: note } : {}) }).eq('id', id).select('id, status').single();
  if (error) throw error;
  return data;
}

// Manual ledger rows through the audited RPC (session 12). Create needs an
// idempotency key; edit needs the row id and a reason; delete is a void.
export type TxnDraft = { id?: string; txn_type: string; category: string; transaction_date: string; gross_amount: string; payee_name?: string; notes?: string; or_number?: string; reservation_id?: string | null; reason?: string };
export function saveTransaction(propertyId: string, draft: TxnDraft, key = newIdempotencyKey('txn')) {
  return rpc<{ ok: boolean; id: string; status: string; auditId: string | null; replayed?: boolean }>('admin_save_transaction_v1', { p_property_id: propertyId, p_txn: draft, p_idempotency_key: key });
}

export type PaymentQueueRow = Record<string, unknown>;
export function fetchPaymentQueue(propertyId: string) {
  return rpc<PaymentQueueRow[] | { rows?: PaymentQueueRow[] }>('get_payment_review_queue', { p_property_id: propertyId, p_limit: 50 });
}
export function reviewPayment(comparisonId: string, outcome: string, reason: string) {
  return rpc('record_payment_finance_review', { p_comparison_id: comparisonId, p_outcome: outcome, p_reason: reason });
}

// P21 workbench: fetch the raw rows the two legacy views disagree over. The
// page labels every figure as a client-side comparison of fetched rows, not an
// authoritative total; the authoritative totals live in get_hospitality_metrics_v1.
export async function fetchReconciliationRows(propertyId: string, start: string, endExclusive: string) {
  const [res, txn] = await Promise.all([
    supabase.from('airbnb_reservations').select('id, confirmation_code, guest_name, status, checkin_date, checkout_date, host_payout, guest_paid, host_service_fee, payout_date, payout_amount').eq('property_id', propertyId).in('status', ['confirmed', 'completed']).order('checkout_date'),
    supabase.from('transactions').select('id, transaction_date, txn_type, source, status, category, gross_amount, external_ref, booking_id, income_stage').eq('property_id', propertyId).eq('txn_type', 'income').gte('transaction_date', start).lt('transaction_date', endExclusive).order('transaction_date'),
  ]);
  return { reservations: unwrapList<Record<string, string | null>>(res).rows, income: unwrapList<Record<string, string | null>>(txn).rows };
}

export type Journal = { id: string; journal_no: number; entry_date: string; description: string; status: string; source_table: string | null; source_id: string | null; event_kind: string | null; channel: string | null; evidence_ref: string | null; reversal_of: string | null; reversed_by: string | null; reversal_reason: string | null; posted_at: string; lines: Array<{ line_no: number; debit: string; credit: string; memo: string | null; account: { code: string; name: string } }> };
export async function fetchJournals(propertyId: string, from?: string, to?: string) {
  let q = supabase.from('acct_journals').select('*, lines:acct_journal_lines(line_no, debit, credit, memo, account:acct_accounts(code, name))').eq('property_id', propertyId).order('entry_date', { ascending: false }).order('journal_no', { ascending: false }).limit(200);
  if (from) q = q.gte('entry_date', from);
  if (to) q = q.lt('entry_date', to);
  return unwrapList<Journal>(await q);
}

export type Account = { id: string; code: string; name: string; class: string; subtype: string; is_cash: boolean; active: boolean };
export async function fetchAccounts(propertyId: string) {
  return unwrapList<Account>(await supabase.from('acct_accounts').select('*').eq('property_id', propertyId).order('code'));
}

export type Prepared = { kind: string; description: string; lines: Array<{ account_code: string; debit: string; credit: string; memo: string | null }>; channel: string | null; source: { source_table: string; source_id: string; event_kind: string } | null; warnings: string[]; balanced: boolean };
export function prepareEntry(propertyId: string, kind: string, payload: Record<string, unknown>) {
  return rpc<Prepared>('prepare_simple_entry_v1', { p_property_id: propertyId, p_kind: kind, p_payload: payload });
}
export function postJournal(propertyId: string, p: { entryDate: string; description: string; lines: Prepared['lines']; source: Prepared['source']; evidenceRef: string | null; channel: string | null }, key = newIdempotencyKey('journal')) {
  return rpc<{ ok: boolean; journalId: string; journalNo: number; replayed?: boolean }>('post_journal_v1', {
    p_property_id: propertyId, p_entry_date: p.entryDate, p_description: p.description, p_lines: p.lines,
    p_source_table: p.source?.source_table ?? null, p_source_id: p.source?.source_id ?? null, p_event_kind: p.source?.event_kind ?? null,
    p_evidence_ref: p.evidenceRef, p_idempotency_key: key, p_channel: p.channel,
  });
}
export function reverseJournal(journalId: string, reason: string, key = newIdempotencyKey('reversal')) {
  return rpc<{ ok: boolean; journalId: string; journalNo: number }>('reverse_journal_v1', { p_journal_id: journalId, p_reason: reason, p_entry_date: null, p_idempotency_key: key });
}

export type Statement = { meta: Record<string, unknown> & { completeness?: Record<string, unknown> }; body: Record<string, unknown> };
export function fetchStatement(propertyId: string, statement: string, start: string, endExclusive: string, snapshotId?: string, accountCode?: string) {
  return rpc<Statement>('get_financial_statement_v1', { p_property_id: propertyId, p_statement: statement, p_start: start, p_end_exclusive: endExclusive, p_snapshot_id: snapshotId ?? null, p_account_code: accountCode ?? null });
}

export type AcctSettings = { property_id: string; accounting_start: string | null; opening_batch_id: string | null };
export type Period = { id: string; period_start: string; status: string; closed_at: string | null; snapshot_id: string | null; reopen_reason: string | null };
export type OpeningBatch = { id: string; accounting_start: string; status: string; lines: Array<{ account_code: string; debit: string; credit: string; memo?: string }>; reference_notes: string | null; version: number; review_note: string | null; journal_id: string | null };
export async function fetchAccountingSetup(propertyId: string) {
  const [s, p, b, snaps] = await Promise.all([
    supabase.from('acct_settings').select('*').eq('property_id', propertyId).maybeSingle(),
    supabase.from('acct_periods').select('*').eq('property_id', propertyId).order('period_start'),
    supabase.from('acct_opening_balance_batches').select('*').eq('property_id', propertyId).order('prepared_at', { ascending: false }).limit(5),
    supabase.from('acct_close_snapshots').select('id, period_start, version, created_at').eq('property_id', propertyId).order('period_start', { ascending: false }).limit(24),
  ]);
  for (const r of [s, p, b, snaps]) if (r.error) throw r.error;
  return { settings: (s.data as AcctSettings | null) ?? null, periods: (p.data ?? []) as Period[], batches: (b.data ?? []) as OpeningBatch[], snapshots: (snaps.data ?? []) as Array<{ id: string; period_start: string; version: number; created_at: string }> };
}
export function seedChart(propertyId: string) {
  return rpc<{ ok: boolean; inserted: number }>('acct_seed_chart_v1', { p_property_id: propertyId });
}
export function saveOpeningBatch(propertyId: string, batch: Record<string, unknown>) {
  return rpc<{ ok: boolean; id: string; version: number; debits: string; credits: string; difference: string }>('save_opening_balance_batch_v1', { p_property_id: propertyId, p_batch: batch });
}
export function approveOpening(batchId: string, note: string, key = newIdempotencyKey('opening')) {
  return rpc<{ ok: boolean; journalId: string }>('approve_opening_balances_v1', { p_batch_id: batchId, p_review_note: note, p_idempotency_key: key });
}
export function closePeriod(propertyId: string, periodStart: string, checklist: Record<string, boolean>, key = newIdempotencyKey('close')) {
  return rpc<{ ok: boolean; snapshotId: string; version: number }>('close_accounting_period_v1', { p_property_id: propertyId, p_period_start: periodStart, p_checklist: checklist, p_idempotency_key: key });
}
export function reopenPeriod(propertyId: string, periodStart: string, reason: string) {
  return rpc<{ ok: boolean }>('reopen_accounting_period_v1', { p_property_id: propertyId, p_period_start: periodStart, p_reason: reason });
}
export function runDepreciation(propertyId: string, periodStart: string, key = newIdempotencyKey('dep')) {
  return rpc<{ ok: boolean; posted: unknown[]; skipped: Array<{ name: string; reason: string }> }>('run_depreciation_v1', { p_property_id: propertyId, p_period_start: periodStart, p_idempotency_key: key });
}
export function postConsumableUsage(propertyId: string, start: string, endExclusive: string, key = newIdempotencyKey('cons')) {
  return rpc<{ ok: boolean; posted?: boolean; amount: string; unvalued: Array<{ name: string; reason: string }> }>('post_consumable_usage_v1', { p_property_id: propertyId, p_start: start, p_end_exclusive: endExclusive, p_idempotency_key: key });
}
