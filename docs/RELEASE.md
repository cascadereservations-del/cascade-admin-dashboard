# RELEASE — deployment order, compatibility and rollback

Status 2026-09-13: **nothing deployed, nothing applied, nothing pushed.** All work is in local commits on `admin-dashboard` (main) and `stay-site` (main).

## What must happen, in order (PRD section 11 rollout)

1. **Rehearsal database.** Restore the latest P5 backup to a rehearsal copy (`scripts/recovery/p5/`), apply `supabase/releases/20260913_admin_modernisation_backend.release.json` there with `apply-release-on-host.sh <contract> apply`, then run the three pgTAP suites (`supabase/tests/database/admin_read_models_v1.sql`, `accounting_foundation_v1.sql`, `inventory_movement_compat_v1.sql`). Fix anything they find and re-commit; they have not been executed yet because this workstation has no Postgres/pgTAP.
2. **Fresh production backup** with `supabase-backup-over-alfred.sh`; set `backup.restore_point` and `backup.verified_at` in the release contract to that backup.
3. **Apply the backend release to production** (owner approval, MFA). It is additive plus one contract-compatible replacement (`record_inventory_usage` v2). Existing PWAs keep working; no item becomes movement-controlled until someone confirms a count sheet. Forward-verification queries are in the contract.
4. **Read-only rollout of the admin.** Build with `npm run check` in `admin-dashboard`, copy `index.html`/`index2.html` to `dist/legacy/`, and publish `dist/` as a *second* entry point (for example `admin-dashboard/next/`) so the legacy admin stays the default. Verify Today, Bookings, Operations, Inventory, Guests and Insights as the owner (aal2) and as Honey (cleaner).
5. **Enable mutations module by module**: inquiries decisions and cancellation (BKG03/04), work orders and notices, readiness reviews, inventory counts/receipts, follow-ups, then finance.
6. **Accounting start.** Finance seeds the chart, enters reviewed opening balances with references, approves. Only then are statements authoritative; earlier ledger rows stay "historical operational data".
7. **Switch the default entry point** after the cleaner→review→usage→fee→payment→owner-report journey is verified. Keep the legacy build reachable under `legacy/`.

## Rollback
- Frontend: repoint Pages to the legacy `index.html` (kept in the repo and in `dist/legacy/`).
- Backend: `supabase/rollbacks/20260913_admin_modernisation_backend.sql` via `run-sql-on-host.sh`. It restores `record_inventory_usage` v1 and drops the v1 objects, and **refuses** if any journal exists or any item is movement-controlled: once new writers are authoritative, rollback must not reactivate incompatible legacy writers.

## Known limitations at hand-off
- pgTAP suites written, not run. Signed-in browser journeys and the Playwright suite are not run (no credentials are entered by the agent).
- XLSX and PDF exports (P28) are not built; CSV and print are.
- `sellable_nights` cannot subtract owner-use nights until a reviewed classification of calendar blocks exists; blocked nights are shown as an exception.
- Sign-in TOTP step assumes an enrolled factor; the owner has one, other roles skip it.
- The reconciliation workbench sums fetched rows client-side and says so; authoritative figures come from the metric service.
