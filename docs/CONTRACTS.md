# CONTRACTS — public DTOs and backend authorities

Updated 2026-09-13. Every request is authenticated and property-scoped on the server. Amounts cross JSON as decimal strings. Mutations carry an idempotency key (16–160 chars); reusing a key with a different payload returns a conflict (SQLSTATE 23505). Errors are mapped in `app/src/lib/errors.ts`: 42501 → forbidden, 22023/23514 → validation, 23505/40001 → conflict, PGRST202/42883 → unavailable.

## Authorities that stay authoritative (deployed, reused as-is)

| Authority | Contract | Used by |
|---|---|---|
| `current_staff_access()` | `{user_id, role, property_ids[], disabled, session_current}` | `auth/session.tsx` |
| `staff_access_allowed(role, action, disabled_at, aal)` | finance/staff actions need `aal2` | mirrored in `auth/capabilities.ts` (visibility only) |
| `decide_direct_booking(p_booking_id, p_action, p_idempotency_key)` | confirm/decline; availability rechecked inside the transaction | Inquiries |
| `record_booking_lifecycle_action(p_booking_id, p_action, p_idempotency_key, p_reason, p_checkin_date, p_checkout_date)` | amend/cancel/no_show/reconcile_calendar | Booking detail |
| `authorize_booking_refund(...)` | refund approval separate from cancellation | Booking adapter |
| `review_cleaning_verification(p_evidence_id, p_outcome, p_reason, p_idempotency_key)` | reviewed / follow_up_required / resolved | Cleaning detail |
| `record_inventory_movement(p_item_id, p_kind, p_quantity, p_reason, p_idempotency_key)` | ledger movement; requires reconciled baseline | Inventory adjust, baseline |
| `record_inventory_usage(p_property_id, p_session_date, p_logged_by, p_notes, p_rows)` | **v2 in this release, same signature and `{ok, rows}` shape**; adds `movements[]`; optional `rows[i].usage_key` | Cleaner and inventory PWAs (unchanged callers) |
| `get_payment_review_queue`, `record_payment_finance_review` | payment evidence review | Finance queue |
| `get_data_integrity_report(p_property_id)` | health JSON | System health |
| Edge Function `staff-users` | `{action, userId, ...}` owner/admin, service role inside | Settings › Staff |
| `transactions` table status flip (`confirmed`/`void`) | legacy review contract kept | Finance queue |

## New v1 interfaces (stay-site migrations 20260913100000/110000/120000, not yet applied)

| RPC | Purpose | Auth |
|---|---|---|
| `get_admin_overview_v1(p_property_id)` | Today summary and prioritised action queue | read_operations; finance block only with read_finance (else `finance: null`) |
| `get_hospitality_metrics_v1(p_property_id, p_start, p_end_exclusive)` | `MetricResult` map (see METRICS.md) | read_operations; monetary metrics need read_finance |
| `get_report_drilldown_v1(p_property_id, p_token)` | supporting rows; token `key|v1|property|start|end`; re-authorised | as above |
| `get_guest_timeline_v1(p_guest_id)` | chronological events, finance events filtered | manage_operations |
| `save_guest_profile_v1(p_guest_id, p_patch, p_expected_version, p_reason)` | profile fields + history; 40001 on stale version | manage_operations |
| `save_follow_up_v1(p_property_id, p_task, p_idempotency_key)` | create/update; `done` needs completion_note | manage_operations |
| `save_work_order_v1(p_property_id, p_order, p_idempotency_key)` | create/update; `resolved` needs resolution | manage_maintenance |
| `review_property_readiness_v1(p_property_id, p_for_checkin, p_outcome, p_reason, p_cleaning_session_id, p_idempotency_key)` | ready / not_ready / override_ready (reason + manage_operations) | inspect_cleaning |
| `preview_guest_merge_v1`, `merge_guests_v1` | reviewed merge; refuses name-only similarity | manage_operations |
| `reconcile_inventory_baseline_v1(p_item_id, p_counted_qty, p_note, p_idempotency_key)` | reviewed baseline → movement ledger | manage_inventory |
| `record_inventory_receipt_v1(p_item_id, p_packs, p_unit_cost, p_supplier, p_purchased_at, p_receipt_path, p_shopping_list_id, p_idempotency_key)` | packs → base units once, on the server | manage_inventory |
| `save_shopping_item_v1(p_property_id, p_item, p_idempotency_key)` | proposed → approved/rejected | read_operations propose, manage_inventory decide |
| `get_inventory_catalogue_v1(p_property_id)` | items with coverage and attention flags | read_operations |
| `acct_seed_chart_v1`, `post_journal_v1`, `reverse_journal_v1`, `prepare_simple_entry_v1`, `save_opening_balance_batch_v1`, `approve_opening_balances_v1`, `get_financial_statement_v1`, `close_accounting_period_v1`, `reopen_accounting_period_v1`, `save_fixed_asset_v1`, `run_depreciation_v1`, `review_stock_valuation_v1`, `post_consumable_usage_v1` | accounting foundation | approve_payment (aal2); reopen needs owner (aal2); statements need read_finance |

`post_journal_v1(p_property_id, p_entry_date, p_description, p_lines, p_source_table, p_source_id, p_event_kind, p_evidence_ref, p_idempotency_key, p_channel)`; `p_lines` = `[{account_code, debit, credit, memo}]`. One `(source_table, source_id, event_kind)` posts once (partial unique index); posted journals are immutable (trigger); corrections via `reverse_journal_v1(p_journal_id, p_reason, p_entry_date, p_idempotency_key)`.

## Shared DTOs (`app/src/types/contracts.ts`)

`MetricResult` exactly as PRD section 6. `ListResponse<T>` `{rows, total, page, pageSize, sourceAsOf}`. Lists default to 25 rows, max 100, stable ordering.

## Data additions

`follow_up_tasks`, `work_orders`, `readiness_reviews`, `guest_profile_details`, `guest_profile_history`, `guest_merge_history`, `inventory_shopping_list`, `acct_accounts`, `acct_settings`, `acct_periods`, `acct_journals`, `acct_journal_lines`, `acct_opening_balance_batches`, `acct_close_snapshots`, `acct_fixed_assets`, `acct_depreciation_runs`, `acct_stock_valuations`; columns `inventory_items.movement_controlled_at/baseline_reviewed_by/baseline_note`, `ops_notices.audience/expires_at`. All RLS-enabled, select-only for `authenticated`, writes only through RPCs.
