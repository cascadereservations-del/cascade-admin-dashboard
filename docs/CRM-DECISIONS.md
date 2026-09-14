# Decisions and implementation notes — guest CRM upgrade

## 2026-09-14

1. **Extend the existing app.** React/TypeScript, Radix controls, route splitting and the Cascade palette already provide a modern baseline. Avoid a replacement framework or generic CRM redesign.
2. **Treat the repo as public.** GitHub metadata verified public visibility. All source records and document links live outside git. Add ignored filename conventions as defense in depth; the preparation script rejects any output inside a Git checkout.
3. **Separate collected statements from canonical identity.** Five detail files were found among 166 leaf folders. Keep every original folder label, including empty inquiry folders; absent detail documents do not establish a booking status. Names alone never link or merge.
4. **Source wording wins.** Birthday occasions, benefits, courtesy, security concerns, requests and early check-in/out notes are retained with source line numbers. No OCR, invented date normalization, ID verification or interpretation of an offer as an agreement.
5. **Browser-memory review.** The new collected-records panel has no backend imports. Clearing/leaving it drops data and revokes photo object URLs. File hashes prevent a mismatched photo from appearing under a record. There is also a development-only local workbench for immediate review without a production account.
6. **Explicit private reveal.** Government ID details, full source text and document photos require an explicit reveal/view action. Drive links use an HTTPS host/path allowlist and do not preload.
7. **Keep first-stage writes compatible.** Expose existing optional profile columns and preserve the audited RPC/version contract. Changes to the database itself are drafted, not applied, pending backup and rehearsal.
8. **Repair recoverable client failures.** Validate photo size/signature before writing metadata. Preserve returned companion ID/version and uploaded path across a failed attachment retry. Do not automatically delete an upload after an ambiguous response; a server idempotency extension remains necessary for ambiguous initial creation.
9. **Refresh authorization safely.** Access refresh clears in-memory cache/capabilities. Generation checks prevent an old request restoring access after sign-out or a newer refresh. The prior role/MFA policy is unchanged.
10. **Bind merge approval to its preview.** Editing the target invalidates the preview; only a response for the current target is actionable. Matching contacts are described as recorded, not independently verified. Draft server hardening adds both-side property scope, locks and enriched-source refusal.
11. **Pause Drive upload on observed public access.** Exact target confirmed, then browser sharing showed “Anyone with the link”. The user will restrict the folder only after Telegram compatibility is checked. No file has been uploaded or shared elsewhere.
12. **Telegram compatibility is evidence-limited.** Checked-in Telegram expense code uses Telegram file APIs and Supabase storage, not this Drive folder. Checked-in n8n exports are inactive drafts. Live inspection stopped at a Cloudflare sign-in rejected by automatic approval; an explicit sign-in approval was requested. No test messages or bot/webhook changes.
13. **Release remains a separate gate.** Workspace `CLAUDE.md` explicitly says never push a Cascade repository without Lloyd’s explicit approval. Prepare code, tests, documentation and build first. Source and deployment artifacts are not pushed in this stage.

## Implementation map

- `scripts/prepare-guest-records.mjs`: offline, source-preserving manifest preparation and optional verified upload receipt association.
- `app/src/features/guests/local-records.ts`: shared parser, manifest boundary validation, link allowlists and image validation.
- `local-records-panel.tsx`: browser file selection, local search/filter, source provenance, private reveal and local photo verification.
- `profile-extras.tsx`: existing profile fields and private document presentation/editing.
- Guest adapter/page: safe bounded search, optional profile typing, validated photo upload, stable pagination and private search state.
- Shared session/table/field components: sign-out race protection, error-state ordering, row keyboard scope and semantic labels.
- `scripts/prepare-crm-hardening.mjs`: exact-baseline draft SQL generator; no database client or network operations.
- `docs/migrations/guest-crm-hardening.sql`: reviewed next-stage proposal; never automatically applied by npm checks.

Validation results and outstanding release gates are recorded in `CRM-VALIDATION.md` when verification completes. No real guest values are included in these documents or tests.
