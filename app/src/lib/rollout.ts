import { AppError } from './errors';

// PRD section 11, rollout step 5: mutations are enabled module by module after
// the read-only stage is verified. This is the single switch. Enabling a module
// is a one-line change here, `npm run check`, then republish `next/`.
// Reads are never gated; server-side capability checks still apply to every call.

export type MutationModule = 'bookings' | 'operations' | 'readiness' | 'inventory' | 'follow_ups' | 'finance';

export const ENABLED_MUTATION_MODULES: readonly MutationModule[] = ['bookings', 'operations', 'readiness', 'inventory', 'follow_ups', 'finance']; // all six enabled in order 2026-09-13 on Lloyd's word (rollout step 5 complete)

const LABEL: Record<MutationModule, string> = {
  bookings: 'booking decisions and cancellations',
  operations: 'work orders and notices',
  readiness: 'readiness and evidence reviews',
  inventory: 'inventory counts and receipts',
  follow_ups: 'guest profiles and follow-ups',
  finance: 'finance',
};

// Every mutating RPC the admin calls, by module. A read RPC is absent and passes.
export const RPC_MODULE: Record<string, MutationModule> = {
  decide_direct_booking: 'bookings',
  record_booking_lifecycle_action: 'bookings',
  authorize_booking_refund: 'bookings',
  save_work_order_v1: 'operations',
  review_cleaning_verification: 'readiness',
  review_property_readiness_v1: 'readiness',
  reconcile_inventory_baseline_v1: 'inventory',
  record_inventory_receipt_v1: 'inventory',
  record_inventory_movement: 'inventory',
  save_shopping_item_v1: 'inventory',
  save_guest_profile_v1: 'follow_ups',
  save_follow_up_v1: 'follow_ups',
  merge_guests_v1: 'follow_ups',
  record_payment_finance_review: 'finance',
  post_journal_v1: 'finance',
  reverse_journal_v1: 'finance',
  acct_seed_chart_v1: 'finance',
  save_opening_balance_batch_v1: 'finance',
  approve_opening_balances_v1: 'finance',
  close_accounting_period_v1: 'finance',
  reopen_accounting_period_v1: 'finance',
};

export function mutationsEnabled(module: MutationModule): boolean {
  return ENABLED_MUTATION_MODULES.includes(module);
}

/** Throws an `unavailable` AppError when the module's writes are not yet enabled. */
export function assertMutationEnabled(module: MutationModule): void {
  if (!mutationsEnabled(module)) {
    throw new AppError('unavailable', `Writes for ${LABEL[module]} are not enabled in this rollout stage yet. Use the legacy admin for now.`, `rollout: ${module} disabled`);
  }
}

/** For the shared rpc() helper: gate by RPC name, pass reads through. */
export function assertRpcEnabled(fn: string): void {
  const m = RPC_MODULE[fn];
  if (m) assertMutationEnabled(m);
}
