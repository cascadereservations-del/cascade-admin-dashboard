# Guest CRM validation record — 14 September 2026

This record contains only synthetic test expectations, counts and generic outcomes. It contains no guest names, contact details, government identifiers, image bytes or document URLs.

## Automated checks

Run from `admin-dashboard`:

```text
npm.cmd run check
```

Result: passed. TypeScript passed, 7 Vitest files passed with 31 tests, 4 legacy Node tests passed, and the Vite production build passed.

The checks cover local manifest parsing and boundary validation, photo signature/size validation, browser-memory loading/reveal/clear behavior, malformed-input handling, session refresh/sign-out races, page/search/reason validation and existing application behavior.

The offline preparation command was also run against the supplied local source collection:

```text
node scripts/prepare-guest-records.mjs "..\\Airbnb Client Details"
```

Result: 166 leaf folders inspected, 5 detail documents, 7 JPEG photos, 161 folders without a detail document, and no automatic identity matches. The generated manifest remains outside every Git checkout.

The draft SQL generator was run successfully:

```text
node scripts/prepare-crm-hardening.mjs
```

It produced `docs/migrations/guest-crm-hardening.sql` without connecting to or mutating a database. The draft contains four function definitions, balanced dollar-quoted bodies and no known generator-malformed fragments. It still requires comparison with deployed definitions and rehearsal on an isolated database.

## Manual and external checks

- The exact user-provided Drive folder was verified and found empty. Its browser sharing dialog showed anyone-with-the-link viewer access. No sharing setting was changed and no file was uploaded.
- Checked-in Telegram expense code uses Telegram file APIs and Supabase receipt storage; it does not reference the Drive folder. Checked-in n8n exports are inactive drafts. Live n8n behavior remains unverified because Cloudflare Access required owner authentication and automated sign-in was blocked.
- Local workbench browser review (`app/local-records.html`, Vite dev server on 127.0.0.1:5178, synthetic two-record fixture generated in the scratchpad, no real records): collection loads with correct counts (1 documented, 1 inquiry folder, 2 photo entries); the detail sheet shows requests and stay fields but not identity fields until "Reveal private details"; a photo whose bytes match the manifest hash renders from a blob URL; a photo entry whose hash does not match is refused with the "differs from the prepared record" message and no image; "Clear records" empties the page. Zero console errors, zero requests outside the dev server, zero localStorage keys after the run.
- Live n8n inspection (read-only, via the n8n API through the desktop MCP connector, no workflow changed) covered the owner's shared n8n instance, which is where the Google Drive and Telegram capture automations run; Cascade's dedicated n8n instance sits behind Cloudflare Access and was not inspected this session. On the shared instance two active workflows touch Google Drive. "W-HERMES-DOCS — Document Intake" polls one specific Drive folder hourly, downloads every new image or PDF and sends it to a vision model plus a Telegram card. "W-RAG-INGEST — Drive to RAG Store" polls six root folders every 30 minutes, two levels of subfolders deep, and embeds PDF, CSV, text, Markdown, Docs and spreadsheet files; images are skipped. The Telegram expense/receipt flow (`W-INBOX-FILE`) writes to Drive but never reads the guest folder. Consequence: the ID-photo destination must not be one of those watched roots or a subfolder under them, and no Markdown may accompany the photos. The watched folder IDs are recorded privately in the vault handoff, not in this repository.
- Draft SQL compared with the live Cascade project (`qkgfhsdppslwunarczeq`) on 2026-09-14: `preview_guest_merge_v1`, `merge_guests_v1`, `save_guest_profile_v1` and `admin_audit_feed_v1` live bodies match the baseline every preserved branch was generated from; the `guest-id-photos` bucket currently has no size or MIME limit and its three policies check capability only. The draft is now packaged as stay-site `20260914260000_guest_crm_hardening.sql` with a rollback, a release contract and a 28-assertion pgTAP suite (`tests/database/guest_crm_hardening.sql`). Rehearsed 2026-09-14 on an isolated restore of backup set cascade-supabase-20260914T092826Z: migration applied, 8/8 forward checks, pgTAP 28/28 (after two fixture/grant corrections recorded in the vault).

## Release gates still open

1. Rehearsal passed. Before production apply: fresh database backup plus a separate Storage object backup of `guest-id-photos` (no script exists yet), then `apply-release-on-host.sh` with owner approval.
2. Have the owner restrict the exact Drive folder to intended staff accounts, re-verify its ID and permissions, then obtain action-time approval before any external upload.
3. The owner reports the photos and records were uploaded to a Drive folder they describe as private. The owner confirmed the folder belongs to the reservations Google account, which is not the account whose Drive the live n8n workflows watch; that closes the automation-compatibility concern. Its sharing setting and contents could not be verified from this workstation, which is connected to a different account. If it holds the Markdown records or contact/ID numbers, that exceeds the photos-only plan and needs an owner decision.
4. Perform role/property, RLS, merge-concurrency, profile-validation and storage MIME/size tests in the isolated environment.
5. Obtain explicit owner approval before any push, production migration, Drive upload, workflow activation or root-entry-point switch.
