# Guest CRM upgrade and release plan

This is a staged local upgrade. Live deployment, database migration and ID-photo upload are distinct gates. The task’s private-data instruction overrides any historical workflow that would place guest records in source control.

## Milestones and acceptance

| Phase | Deliverable | Acceptance / stop condition |
|---|---|---|
| 0 — Inventory and recovery | Remote/local SHA, clean baseline, source ZIP/hash, source-only audit | Complete. Source ZIP is readable. No DB backup claim. |
| 1 — Local preparation | Versioned manifest from original Markdown; original folder labels; photo hashes | 5 documented records and 7 photos accounted for; 166 total folders; no source mutation, guessed identities or booking states. Invalid input fails without printing private values. |
| 2 — Guest experience | Collected-records tab, source notes, optional birthday/contact/ID fields, private reveal, safe searches and retries | Typecheck, parser/security/component tests, legacy tests, build and local browser review. New code is local until approved release. |
| 3 — Backend privacy | Reviewable SQL draft for audit-feed access, merge scope/concurrency, profile validation and storage scope | **Complete 2026-09-14:** diffed against production, rehearsed (8/8, pgTAP 28/28), applied as stay-site release `guest_crm_hardening_20260914` after a fresh backup. Runtime object-level storage tests still pending (bucket was empty). |
| 4 — Private Drive handoff | Exact destination confirmed; sharing restricted; automation dependency checked; organized uploads and local receipts | **Partly complete 2026-09-14:** owner uploaded the whole collection manually to a reservations-account folder (records included, owner's decision); Restricted verified; automation compatibility closed. Receipts and link attachment still pending. |
| 5 — Review and rollout | Versioned build, owner approval to push, operator smoke test | **Published 2026-09-14** with owner authorization directly to root and `next/` (`cda4e1f`), `legacy/` kept, no private inputs in the build. Signed-in smoke matrix still pending. |

## Compatibility strategy

- Preserve existing guest/booking IDs, routes, legacy entry points, all non-CRM modules, finance calculations and staff role/MFA policy. No dependency upgrades in this patch.
- Local records remain separate from canonical server records. Automatic name matching, database imports and bulk updates are absent. A later import needs an explicit per-record identity match and before/after preview, version check and idempotency key; it must never turn an inquiry into a reservation.
- New profile controls use the existing nullable columns and existing `save_guest_profile_v1` signature. Verify the contact/ID migration is deployed before releasing these controls; if it is absent, hold the release rather than treating a successful RPC as proof all unknown fields were saved.
- The backend hardening draft preserves callable names/signatures. Rejecting unsafe links, short reasons and enriched-source merges is an intentional validation change. Communicate these cases to operators and test the legacy UI as well.
- Guest search is transient for privacy; filters, density, pagination and tab selection remain shareable. Table sorting remains within the current page and is labeled accordingly.
- New local workbench `app/local-records.html` is a Vite development page, outside the production build inputs. It imports no Auth or Supabase client. Its CSP blocks connections to external services. Do not deploy it accidentally with a raw source-folder upload.

## Backup and migration procedure

1. Recheck remote HEAD and local changes; do not overwrite concurrent work. Save current root/next/legacy assets plus build metadata. Verify the source archive’s checksum and contents.
2. Inspect the current production project identity. It must be Cascade (`qkgfhsdppslwunarczeq`). Export function definitions, grants, RLS policies, schema and data. Back up Storage metadata **and bytes** separately; a database backup does not contain object bytes. Record timestamps, tool versions and hashes in private recovery storage.
3. Restore into an isolated Cascade rehearsal environment and verify counts, foreign keys, migrations, example objects and authentication roles. Disable dispatch triggers, cron jobs, webhooks and external providers in rehearsal so no messages can be sent. Prove a restore before any production write.
4. Compare `docs/migrations/guest-crm-hardening.sql` against actual deployed definitions. It was generated from the adjacent stay-site migration baseline. Review every preserved UNION branch and policy; fail if dependencies differ. `node scripts/prepare-crm-hardening.mjs` only regenerates the draft, never applies SQL.
5. Run migration in a transaction with bounded lock and statement timeouts. No guest rows or photo bytes are rewritten. Capture a sanitized receipt and resulting function hashes.
6. Rehearsal tests must cover: anon denied; signed-out denied; cleaner/inspector/maintenance unable to read guest audit payloads; manager property A denied property B in both merge directions, photo read/insert/delete and history; owner authorized within scope; same-guest merge rejected; duplicate names insufficient; enriched source merge rejected without any reassignment; concurrent/replayed operations; empty/long reasons and malformed dates/URLs; valid legacy profile edits; existing compatible images still readable; oversized/SVG uploads rejected.
7. Confirm no new or lost guests, bookings, transactions, companion associations or object references. Record the exact rehearsal result. Only then obtain the required production release approval, refresh the backup and run the reviewed release on Cascade.

## ID-photo upload and recoverability

The upload target is stored privately, not hard-coded into repository scripts. The supplied folder currently had public-link access at inspection, so there is **no upload authorization to a newly verified private target yet**. The user said they will restrict it after Telegram compatibility is checked.

Once resolved:

1. Re-read the exact folder metadata/sharing and confirm the owner/account and parent scope. Do not change its permissions on assumption or grant new recipients access.
2. Create guest/date subfolders matching the source folders, within this destination only. Use generic sequential photo filenames; retain the source-relative path and SHA-256 in a local receipt. Avoid putting government identifiers in remote names.
3. Check for an existing verified receipt before retrying. Verify folder/file parent IDs and size/checksum after each upload. Save the receipt after each success so an interrupted batch can resume without duplicates. Never mark an uncertain upload verified.
4. Keep `drive-upload-manifest.local.json` beside the original collection, with destinationFolderId, sourcePath, sha256, bytes, remote file ID, parent ID, URL, verification result and timestamp. It must not enter git or a public build.
5. Regenerate using `node scripts/prepare-guest-records.mjs "<private source folder>" "<verified destination folder ID>"` to attach only matching verified receipt links. Original files remain unchanged. Do not send photos/records to Airbnb, Telegram, other folders or public previews.
6. An interrupted or partially failed upload leaves the original files intact. Resume from receipts; do not delete cloud copies as an automatic cleanup. Agree the temporary-storage retention/removal date with the owner separately.

## Tests and rollout

- Baseline and final `npm run check`: TypeScript, unit/component/security tests, legacy tests and production build. Tests use only synthetic people/documents.
- Validate the prepared private collection locally with aggregate counts, source/byte hashes and byte-for-byte source-text equality. Scan changed source/build files for the private source names/contacts, filenames and document hashes, logging only counts.
- Run a local desktop/mobile browser review: collection selection, filters/search, opening/closing record, private reveal/hide, photo view/hash failure, keyboard focus, no-match state, malformed import and clear. Do not capture real IDs in screenshots or reports; synthetic fixtures are used for visual evidence.
- Signed-in pre-release smoke matrix: owner and ordinary staff landing pages; guest list/detail/profile/follow-up; invalid save and version conflict; companion partial-save retry; original bookings, cleaning and finance read paths. No live mutation test without a dedicated synthetic test fixture and reviewed cleanup.
- Publish the canary only after approval. Build into a fresh release directory. Copy exactly the verified `dist` output, preserve older hashed assets during the cache overlap, and record its hash. Verify source maps and private inputs are absent. Update root only after owner acceptance; keep `legacy/` reachable.
- Success signals: no elevated 401/403/5xx rates for legitimate operations; guest saves retain correct versions; no duplicates from upload retry; role-boundary checks remain denied; photo access restricted; no unexpected booking/ledger counts. Investigate regressions before advancing.

## Rollback

- Frontend: restore the exact previous index and assets from the source snapshot or prior commit; avoid destructive sync/delete. Keep existing session-compatible routing and legacy entry points. The local originals and manifest remain outside the deploy tree.
- Database: roll back the transaction on migration failure. After a committed privacy fix, prefer a forward correction and keep restrictive access checks. Do not restore broader guest/ID access merely to reverse a UI release. Save exact prior definitions before migration for exceptional, owner-reviewed recovery.
- No data migration is performed in this task, so no data down-migration is required. Do not restore a whole production backup over newer reservations to reverse a UI problem.

## Deferred work with concrete prerequisites

Server idempotency for a companion's initial create is still needed to resolve ambiguous network responses completely. Full per-stay companion modeling, source-document retention controls, an append-only access audit, metadata-only history redaction and authenticated canonical import require separate schema contracts and role tests. Other adapters still interpolate search text and cap result lists. Address those in measured phases without changing financial/operational semantics.
