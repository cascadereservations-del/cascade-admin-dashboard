# Guest CRM audit — 14 September 2026

Scope: read-only architecture and source audit of the existing admin and its adjacent canonical backend migrations, followed by staged local changes. No production SQL, staff messages, Airbnb changes, or public uploads were performed. This is not a penetration test or a certification of live database policies.

## Verified baseline

- Local and remote HEAD: `b79083f96b924e082ecc0eaebbd4c103792abea3`; working tree initially clean.
- GitHub metadata reports the repository **public**, contrary to the initial private-repository assumption. Do not commit personal records, document links, photos, tokens or exports even if the repository is later made private. No remote visibility change was attempted.
- Source snapshot: workspace `backups/admin-dashboard-before-guest-crm-20260914.zip`. SHA-256 `84B875A3EE2A2A8EFE451AECF207C06AD5957CA89AF0DF814192BC23D1603285`. This is a source backup, not a database/storage backup.
- Baseline: TypeScript passed, 20 unit tests passed, 4 legacy tests passed, production build passed.
- Local source collection: 166 leaf record folders, 5 `guest-details.md` documents, 7 JPEG photos. 161 folders have no detail document. Their folder labels are retained without classifying them as confirmed bookings or inferring identities. Empty inquiry folders are preserved by the preparation script.
- The supplied Drive destination was verified by exact ID and browser folder path. It was empty and link-accessible to anyone. Uploads were paused. Its private URL is intentionally absent from this report.

## Architecture and feature inventory

The admin is a React 19 / TypeScript application built by Vite. Hash routing preserves GitHub Pages deep links. TanStack Query owns online server state; TanStack Table handles list display. Radix primitives provide dialogs, tabs and controls; Tailwind defines the existing lagoon/ink/sand palette. Recharts is lazy-loaded for insights. The legacy HTML dashboard remains under `legacy/`; generated root and `next/` bundles are deployment artifacts.

| Area | Existing flow | Compatibility boundary |
|---|---|---|
| Sign-in / staff | Supabase Auth → `current_staff_access` → capability-gated routes | Server RLS/RPC authorization remains authoritative; no changes to sign-in credentials or the prior MFA policy decision |
| Today / Bookings | Read models, calendar, inquiries, booking decisions | Preserve routes, booking IDs, state transitions and payment workflows |
| Operations | Cleaning, readiness, work orders, notices | Keep cleaner/inspector access and review flows |
| Inventory | Counts, usage, purchases and movement compatibility | Preserve the current writer and opening-count contracts |
| Guests | `guests` + profile details + timeline + companions + follow-ups | Existing IDs and profile RPC signatures preserved; no automatic local-to-server merge |
| Finance / Insights | Transactions, journals, reconciliation, statements and metrics | No ledger, metric definitions or historical balances changed |
| Settings / Audit | Staff management, health checks, audit feed and undo | Sensitive feed branches require additional server scope checks |
| External automation | Supabase outbox and Telegram expense/photo handling; n8n exports | No workflows activated, messages sent or bot settings changed |

### Data flow and trust boundaries

1. Staff credentials reach Supabase Auth. The browser receives a session and resolves server-owned role/property access. Browser visibility is not an access-control boundary.
2. Feature adapters query scoped tables/read-model RPCs. Mutations use audited versioned RPCs and the existing rollout module gate. Client caches are in memory; Auth persists its own session.
3. Companion photo bytes upload directly from the browser to the private Supabase bucket; short-lived signed URLs are created only for explicit viewing.
4. New local review: original Markdown and photos → local preparation → private manifest **outside every Git checkout** → explicit browser file selection → component memory. No Supabase import, outgoing fetch, telemetry, localStorage or public asset is used by this view. Source photos are opened on demand and checked against SHA-256 and size.
5. Optional Drive upload is a separate operation, limited to the exact user-specified destination, after sharing and automation compatibility are resolved. Receipts and document links belong beside the original private collection, never in git.

## Findings and disposition

| Severity | Finding and evidence | Disposition |
|---|---|---|
| High | Repository is public; supplied Drive folder allowed anyone with the link. | No guest data added to git or uploaded. Private manifest stays outside the repository. Sharing decision and upload remain gated. |
| High | `20260914250000_admin_audit_feed_v2.sql` authorizes `read_operations` but its guest/companion history branches return full before/after states without `manage_operations`. A hidden UI route does not prevent direct RPC calls. | Draft migration adds a property-scoped guest-management check to both branches. Rehearsal/live verification still required. |
| High | `preview_guest_merge_v1` in `20260913100000_admin_read_models_v1.sql` authorizes only the surviving guest before reading the other guest. `merge_guests_v1` lacks deterministic locks and source profile/companion reconciliation. | Draft scope/locking/idempotency fixes. Enriched source records are refused pending a reviewed consolidation flow, so their details cannot silently become stranded. |
| High | Storage policies in `20260914240000_guest_companions.sql` check management access without checking the photo path’s guest/property; bucket lacks a MIME/size limit. | Draft property-scoped policies and 10 MB JPEG/PNG/WebP bucket rules. Client now checks signatures, size and MIME before row creation/upload. Existing objects are not deleted. |
| Medium | Initial session access response could complete after sign-out and restore ready state; cached data did not clear on all access refreshes. | Generation checks prevent stale completion; refresh clears caches and drops capabilities; regression tests added. |
| Medium | Guest search interpolated untrusted PostgREST grammar, accepted invalid page values and retained guest searches in the URL. | Search token normalization, bounded pagination, deterministic secondary ordering, memory search and a debounce. Query now excludes notes from list responses. Other feature search adapters remain an audit follow-up. |
| Medium | The companion save consists of row write → upload → attachment. A failed upload could retry by creating a second companion. | Successful row ID/version and upload path survive retry; validation runs before the first write. Network-ambiguous initial writes still need server idempotency, documented below. |
| Medium | Birthday, profile contact, address and ID columns existed in backend migrations but were absent from the profile UI/type. | Added optional fields, validation and reveal-on-demand document details. Existing migrated fields only; no invented DOB or identity verification. |
| Medium | Merge preview could remain displayed after the target guest changed. | Preview is bound to the requested target and invalidated on edits; save validates the pairing. |
| Medium | Server save RPCs accept weak reasons and links; historical profile snapshots duplicate private data. | Client validates reasons/date/links; draft profile RPC adds server checks. Retention and redaction of existing history require owner policy plus a reviewed migration. |
| Low | Shared table keyboard handling bubbled Enter from child controls; page-local sorting was not obvious. | Row key handling now applies only to the focused row, supports Space, and explains page-local sorting. |
| Low | Some form controls lacked explicit labels; definition-list items had invalid containers; guest tabs could wrap into a fixed-height bar. | Associated labels, semantic definition lists and horizontally scrollable tab navigation. |

Positive foundations: route-level code splitting; private rather than public ID storage; short-lived signed URLs; parameterized Supabase query methods; server property/capability helpers; optimistic versions and audit history; CSV formula escaping; stable legacy entry points; no service worker caching of CRM data. Existing design tokens and components are suitable for a small lodging operation.

## UX and design direction

Preserve the existing Cascade palette and component system. Prioritize named guests, the next operational action and source-backed stay details. Use compact cards for the local collection and a detail drawer for contact, requests/occasions and documents. Keep “requested”, “offered” and “confirmed” in their original wording; do not turn an inquiry into a booked stay, a birthday occasion into a birth date, or an ID photo into a verified identity. Prefer progressive disclosure for private identity data, meaningful empty states and explicit retry/recovery messages.

The baseline build contains about 144 KB gzip in the main script, 81 KB in a query/state-related shared chunk, and 117 KB in the lazily loaded insight chart chunk. A rewrite or dependency swap would add risk without solving the immediate guest workflow. Keep current dependencies pinned, debounce online guest search, bound list work and load photo bytes only on request. Runtime performance should be measured on the operator’s actual phone and network before any bundle-splitting changes.

## Research used

Primary sources reviewed 14 September 2026:

- [W3C sortable table example](https://www.w3.org/WAI/ARIA/apg/patterns/table/examples/sortable-table/): native table markup, named sort buttons, `aria-sort`, clear focus treatment. Apply those patterns and test with assistive technology.
- [WCAG 2.2 target size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html): at least 24 CSS pixels or compliant spacing; major new controls use larger targets. No full WCAG conformance claim is made.
- [OWASP file upload guidance](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html): allowlist formats, bound sizes, inspect signatures, generate filenames, restrict storage access. Client checks complement server enforcement.
- [OWASP logging guidance](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html): use event metadata and avoid sensitive payloads. Import scripts report counts and generic errors only.
- [Supabase private bucket model](https://supabase.com/docs/guides/storage/buckets/fundamentals): private downloads are subject to RLS or signed URLs; document URLs do not replace access control.

## Remaining audit limits

- Backend findings are against checked-in migrations, not a fresh deployed function dump. Do not claim the draft SQL has passed pgTAP or production checks.
- No comprehensive signed-in role matrix, screen-reader audit, real-device profiling or production health check has run in this task.
- n8n checked-in exports are inactive safe drafts and do not establish current live behavior. The live n8n inspection reached Cloudflare Access; automatic approval blocked the sign-in. The Telegram expense code obtains files from Telegram and uses Supabase receipt storage, with no reference to the supplied Drive folder. This supports a limited compatibility inference, not a blanket assurance for all live automations.
- Owner retention periods, storage-object orphan cleanup, credential rotation policy and a private hosting decision remain operational decisions. Do not change them speculatively.
