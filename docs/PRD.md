> **Design direction (2026-09-13, overrides earlier mockup references).** Primary visual reference is https://apex-shadcn.dashboardpack.com/ : its application shell, grouped navigation, typography, spacing, cards, tables, filters, charts and detail panels, reduced to Cascade's real tasks. Use current shadcn/ui components. Mahogany and champagne are restrained accents on clean neutral working surfaces. The earlier React "Command Center" mockup is NOT a visual reference or frontend starting point; its layouts, styling and components are not reused. Existing business logic may be reused only after verification.
>
> Saved verbatim from the execution brief of 2026-09-13. Baseline reverification of the dated audit findings is in docs/evidence/P01.md and P02.md.

# Cascade Hideaway Admin Modernisation — Full PRD

**Version:** 1.0  
**Research date:** 13 September 2026  
**Deliverable:** Implementation specification for execution in bounded tasks by lower-cost coding models.  
**Status:** Planning only; no files, commits, deployments, or production records changed.

## 1. Product summary

Build one coherent Cascade Hideaway admin for understanding business performance and managing daily operations. Replace the current single-file frontend with a modular React application, using Apex’s navigation and presentation patterns with Cascade’s mahogany, champagne and cream branding.

Integrate bookings, cleaning reviews, inventory, guest CRM, operational follow-ups, financial records and owner reporting. Retain the specialised cleaner and inventory PWAs, connected to the same backend contracts.

Supabase remains the system of record. Financial reporting gains an accrual accounting foundation beneath simple everyday forms. Facebook Messenger remains the primary guest communication channel; Telegram remains the staff coordination channel.

**Delivery order:** data reliability → application foundation → daily operations → comprehensive CRM → accounting and owner reports → controlled consolidation.

### Improved implementation brief

> Modernise Cascade Hideaway’s existing admin into a clear, responsive operations and management application. Use Apex as a reference for navigation, tables, cards, filters and information hierarchy, adapted to Cascade’s identity and single-property business.
>
> Inspect and reuse existing production capabilities before adding replacements. Consolidate management workflows while retaining specialised mobile PWAs. Correct analytics through documented, server-calculated definitions and reconciliation against supporting records.
>
> Provide comprehensive guest profiles and timelines, cleaning and meter-evidence review, inventory movements and purchasing, operational follow-ups, and simple financial workflows backed by balanced accrual journals. Produce owner P&L, balance sheet, cash flow and equity reports from reviewed opening balances.
>
> Deliver incrementally through small implementation packets with explicit dependencies, interfaces, acceptance criteria and rollback instructions. Preserve existing booking, cleaner, Messenger and Telegram workflows. A feature is complete only when its data flow, permissions, error states and acceptance tests work.

This makes “modernise,” “integrate,” “verify” and “intuitive” measurable, and separates the reference design from the business logic that must be built.

## 2. Verified baseline and audit findings

### Existing assets

| Asset | Verified state | Treatment |
|---|---|---|
| [Admin repository](https://github.com/cascadereservations-del/cascade-admin-dashboard) | Local checkout at `99e558a`; approximately 302 KB single-page HTML plus `index2.html` | Replace incrementally within this repository |
| [Local admin source](C:/Users/Lloyd/Claude/Projects/Cascade/admin-dashboard/index.html) | Existing bookings, finance, guests, inventory, cleaning, operations, staff and health screens | Preserve useful behaviours; replace inconsistent calculations and write paths |
| Shared backend in `stay-site` | Supabase migrations and Edge Functions; remote is `Stay_At_CascadeGSC` | Canonical location for new backend work |
| Inventory application | Catalogue, purchases, usage and stock adjustments | Retain PWA; integrate management capabilities |
| Cleaner checklist | Named staff access, booking selection, photo evidence, meters and submission processing | Retain PWA and production contracts |
| Earlier Command Center mockup | React/Vite source with sample data and no backend integration | Reuse selected presentation patterns only |
| Operations Manual | Finance section is a placeholder | Link to actual admin reports once delivered |
| Prior finance/CRM work | Deployed tables and RPCs exist, but several new workflows have no records | Integrate and validate; do not label complete from schema presence |

**Canonical database:** `qkgfhsdppslwunarczeq`  
**Current property:** `6ae230f4-c189-4547-84b1-cb6e0b2cc9bd`

### Analytics findings

Read-only production queries and source inspection established:

| ID | Finding | Required correction |
|---|---|---|
| A01 | The overview calculation produces **₱275,658.23**, while `v_canonical_ledger` produces **₱267,651.19** for the same current-year-through-current-month window | Explain the **₱8,007.04** difference through source reconciliation |
| A02 | `v_canonical_ledger` excludes **₱1,780** of confirmed direct-booking income in that window | Include all supported channels through reviewed source mappings |
| A03 | “ADR” uses host payout, while its explanation says guest-paid revenue | Define accommodation revenue explicitly; separate ADR from net payout per night |
| A04 | Two future reservations, representing four nights, enter the legacy YTD booking calculation | Separate historical performance from future bookings |
| A05 | Headline metrics and sparklines use different date bases | Use one period and metric contract |
| A06 | Four confirmed/completed reservations lack payout dates; legacy code substitutes checkout dates | Distinguish expected payout, recorded payout and verified cash receipt |
| A07 | Guest stay-status matching uses guest names despite existing `guest_id` relationships | Join by canonical identity |
| A08 | Several queries omit explicit property scope; some failures become empty arrays or silent skips | Enforce scope server-side and show unavailable/stale states |
| A09 | New finance facts, CRM profiles and inventory stock movements each contain zero records | Provide adoption/backfill workflows and truthful completeness indicators |
| A10 | Inventory uses both direct stock updates and newer movement RPCs | Establish one atomic stock mutation path across clients |
| A11 | The admin’s direct-booking form inserts directly into reservation records and asks staff to block Airbnb manually | Use the canonical booking decision and calendar workflow |
| A12 | An old migration-reconciliation document is stale; the nine checked live migration versions are already aligned | Compare deployed definitions and ledger entries before migrations |

The current four admin tests pass. They cover a link, staff action handling, a field limit and JavaScript parsing—not analytics or complete user journeys.

**Verification limit:** these findings establish defects and discrepancies, not audited financial statements. Bank balances, complete source documents and every production workflow have not been reconciled. The latest GitHub remote HEAD was not independently confirmed.

## 3. Users and measurable outcomes

### Users and permissions

| User | Default experience | Access |
|---|---|---|
| Owner | Today and business performance | All modules, accounting setup, targets and closing |
| Admin | Today and operational exceptions | Property operations, CRM, inventory and authorised finance actions |
| Finance | Finance review queue | Reconciliation, journals, statements and payment evidence |
| Inspector | Cleaning review | Checklist, photos, meters and operational issues |
| Maintenance | Assigned work | Relevant work orders, asset details and completion evidence |
| Cleaner | Existing cleaner PWA | Assigned operational workflow and permitted personal records |

Use existing server-owned staff identities and property assignments. Frontend visibility must follow backend permissions; it is not an access-control mechanism.

### Acceptance targets

Targets below are product acceptance hypotheses, not claimed existing benchmarks.

- Owner can answer “What needs attention?”, “Is the property ready?”, “How are bookings performing?” and “What money needs review?” within **60 seconds**.
- At least **90% completion** across five representative workflows during owner/staff acceptance testing.
- Find a guest, booking, cleaning report or inventory item within **three navigation actions**, excluding typing.
- Every displayed financial total reconciles to its included records to **₱0.01**.
- Every KPI exposes its period, definition, source freshness and supporting records.
- No duplicate stock movement, journal or business decision after a repeated request.
- No finance or unrestricted guest-data access for cleaner, inspector or maintenance roles.
- Existing cleaner submission and guest booking flows pass compatibility tests before each related release.

## 4. Information architecture and design

### Navigation

| Navigation item | Purpose |
|---|---|
| **Today** | Prioritised actions, current stay, arrivals, departures and property readiness |
| **Bookings** | Reservation list, calendar, inquiries and booking detail |
| **Guests** | CRM, returning guests, timelines and follow-ups |
| **Operations** | Cleaning log, meter review, maintenance and notices |
| **Inventory** | Stock, purchases, usage, assets and shopping list |
| **Finance** | Review queue, transactions, reconciliation, accounts and statements |
| **Insights** | Hospitality performance, costs, channel mix and budgets |
| **Settings** | Staff, property, accounting setup, integrations and audit history |

Guest guide, cleaner PWA, inventory PWA, manual and public booking site remain accessible through an **Apps** menu.

### Visual contract

Adopt Apex’s grouped sidebar, persistent search, readable cards, consistent tables and contextual detail views. Its broad demonstration navigation should be reduced to Cascade’s actual tasks. [Apex reference](https://apex-shadcn.dashboardpack.com/)

- Default light theme; optional dark and system themes.
- Mahogany `#1C1006` for strong brand surfaces.
- Champagne `#C9963A` for restrained accents.
- Cream `#F7F2E8` for selected backgrounds.
- Neutral working surfaces and high-contrast sans-serif text.
- Gold is not the default small-text colour.
- Tabular numerals, explicit currency units and consistent decimal formatting.
- Body text defaults to 14–16 px; mobile form inputs use at least 16 px.
- Main touch actions target at least 44 × 44 px.
- Desktop sidebar collapses; mobile uses an off-canvas menu.
- Detail drawers become full-screen sheets on narrow screens.
- Charts include a text summary and accessible table.
- Colour never carries status by itself.

Use visible titles such as **Accommodation revenue**, **Cash received**, **Awaiting review** and **Ready for arrival**. Avoid an ambiguous “Revenue” card that changes accounting basis between screens.

### Shared usability requirements

| ID | Requirement |
|---|---|
| UX01 | Global search across authorised bookings, guests, inventory and tasks |
| UX02 | `Ctrl/Cmd+K` command palette for navigation and permitted actions |
| UX03 | Search, filters, sorting, pagination and selected period persist in the URL |
| UX04 | Saved views, column visibility and comfortable/compact table density |
| UX05 | Clear filters control and active-filter count |
| UX06 | Clickable summary counts open the corresponding filtered records |
| UX07 | Back navigation restores list filters and scroll position |
| UX08 | Forms preserve entered values after validation or server errors |
| UX09 | Dirty-form warning before navigation; optional server-side saved drafts |
| UX10 | Inline errors explain what to correct and focus the first invalid field |
| UX11 | Bulk actions show selected count and a preview before consequential changes |
| UX12 | Successful actions provide a receipt: changed record, status and timestamp |
| UX13 | Undo only where a real inverse operation exists; accounting uses reversals |
| UX14 | Copy booking codes, contact details and references with confirmation |
| UX15 | Skeleton, empty, filtered-empty, partial-data, forbidden and retry states |
| UX16 | Permission-filtered notifications with links to the required action |
| UX17 | “Last updated” displays source freshness, not merely page-load time |
| UX18 | No fabricated sample numbers or silent zero values in production |
| UX19 | Keyboard navigation, focus restoration and reduced-motion support |
| UX20 | Print and export preserve the visible report period and accounting basis |

## 5. Functional requirements

All requirements below belong to the complete release unless explicitly marked as a later enhancement.

### 5.1 Today

**TOD01 — Operational summary**

Show:

- Current stay and actual check-in/check-out state where recorded.
- Today’s arrivals and departures.
- Next arrival and time remaining.
- Cleaning/readiness status.
- Outstanding maintenance blockers.
- Critical stock shortages.
- Guest follow-ups and concierge handoffs.
- Finance review counts for authorised users.

Date-only reservations must not imply an actual arrival or departure event. An unknown status is shown as unknown.

**TOD02 — Prioritised action queue**

Each action includes priority, reason, responsible person, due time, source record and primary action.

Order actions as:

1. Arrival blocked by readiness, availability or access issues.
2. Overdue operational work.
3. Pending booking/payment decisions.
4. Guest follow-ups.
5. Routine stock and administrative work.

A source event creates one action. Resolving the source updates its action rather than leaving an independent stale notification.

**TOD03 — Role-aware performance**

Owner and Finance see approved financial summaries. Operational roles see readiness and workload summaries.

**Acceptance:** a flagged meter report, low-stock item and unresolved handoff each open the correct record. An unavailable finance request cannot display “All clear.”

### 5.2 Bookings

**BKG01 — Unified booking view**

Combine Airbnb reservations and direct inquiries/bookings into one read model while retaining their original source identities.

Support list and calendar views, with filters for status, channel, dates, guest and outstanding balance.

**BKG02 — Booking detail**

Show:

- Guest and linked CRM profile.
- Stay dates, guest count and source.
- Booking, payment and payout states separately.
- Accommodation charges, adjustments and channel fees where verified.
- Payment evidence and reconciliation state for authorised users.
- Calendar linkage, cleaning requirement and timeline.
- Related conversations and follow-up tasks.

**BKG03 — Controlled changes**

Create, confirm, amend and cancel through existing authoritative booking functions or a compatible staff adapter. Recheck availability inside the server transaction.

Calendar drag-and-drop must not commit a change directly.

**BKG04 — Safe cancellation and refund handling**

Cancellation updates the booking lifecycle. Refund approval, refund execution and refund reconciliation remain separate states.

Cancelling a booking must not silently delete financial history or assume all money was returned.

**BKG05 — Operational convenience**

Provide quick views for arrivals, departures, upcoming stays, pending inquiries and unresolved payments.

**Acceptance:** two concurrent confirmations for overlapping dates cannot both succeed. An Airbnb reservation and its linked calendar event appear as one stay.

### 5.3 Guest CRM and follow-ups

**CRM01 — Comprehensive profile**

Extend `guests` rather than create a competing contact database.

Profile includes:

- Preferred/display name and verified contact methods.
- Messenger identity or conversation link where available.
- Preferred contact channel and language.
- Guest-stated stay preferences.
- Source, tags and manually assigned VIP status.
- Completed stays, nights, last stay and next booking.
- Revenue history for authorised financial roles.
- Service issues, outstanding commitments and follow-ups.
- Consent status and provenance.
- Created/updated timestamps and source of important fields.

Do not require additional personal information merely to make the profile look complete. Sensitive documents and unrelated demographic data are outside this release.

**CRM02 — Unified timeline**

Display bookings, stays, relevant communications, concierge handoffs, service issues, refunds and staff notes chronologically.

Every event identifies its source and timestamp. Financial events are filtered on the server by permission.

**CRM03 — Reliable identity**

Use `guest_id` and existing identity resolution.

- Unique, consistent verified identifiers may link.
- Conflicting identifiers, shared contacts and name-only similarity require review.
- Merge previews show affected bookings, contacts and notes.
- Preserve merge history and original source references.
- Do not merge automatically from names.

**CRM04 — Follow-up workflow**

Tasks contain assignee, due date, priority, related guest/booking, status and completion note.

Preset purposes: pre-arrival question, service recovery, promised item, post-stay follow-up and returning-guest enquiry.

**CRM05 — Messenger and Telegram integration**

Surface existing Messenger conversation links, concierge handoffs and Telegram delivery/status references.

Sending remains in the existing channel. Where a reliable deep link is unavailable, show a copyable reference and the correct channel destination.

A draft is never labelled “sent.”

**CRM06 — Consent**

Reuse existing CRM consent/lifecycle records. Distinguish permission for operational communication from marketing consent.

**Acceptance:** two guests with the same name remain separate. One returning guest has one linked timeline. Completing a follow-up creates a timestamped completion event.

### 5.4 Cleaning log, meters and property readiness

**CLN01 — Complete cleaning register**

Include stay, cleaner, cleaning type, submission time, checklist completion, evidence state, review state and payment state.

Fee information is restricted to authorised users.

**CLN02 — Evidence review**

Show checklist answers, photos, meter readings, incomplete reasons, permitted photo skips and subsequent review findings.

Link evidence by submission/session identity. Do not match photos solely by date folders.

**CLN03 — Separate operational states**

Maintain separate:

- Submission completeness.
- Evidence verification.
- Inspector review.
- Property readiness.
- Cleaner fee accrual/payment.

One percentage cannot stand in for all five.

**CLN04 — Human review**

Support reviewed, follow-up required and resolved outcomes, with actor and reason.

AI or arithmetic findings remain advisory. Preserve the existing rule that meter anomalies do not themselves block cleaner submission.

**CLN05 — Readiness**

Readiness derives from the relevant cleaning review and unresolved arrival-blocking work.

An authorised override requires a reason and appears in the timeline.

**CLN06 — Cleaner payments**

Link fee obligations and payments to the existing session and financial record. Recording payment must not create a duplicate expense.

**Acceptance:** repeated submission creates one session. An unreadable meter photo shows uncertainty, not misconduct. A payment update does not alter checklist completion.

### 5.5 Inventory and purchasing

**INV01 — Integrated catalogue**

Include consumables and durable items with category, unit, quantity, reorder threshold, purchase-unit conversion, cost, location, condition and relevant photo.

Search and filters cover low stock, out of stock, inactive and attention required.

**INV02 — Atomic movements**

All stock changes produce an auditable movement through one backend service:

- Receipt.
- Usage.
- Adjustment.
- Reconciliation.

Record before/after quantity, reason, actor and source event.

**INV03 — Opening stock reconciliation**

The existing movement RPC requires reconciled starting stock. Provide an explicit reviewed baseline for each item before switching it to movement-controlled writes.

Never interpret an empty movement table as zero physical stock.

**INV04 — Purchases**

Workflow: proposed shopping list → approval → receipt → stock movement → linked financial treatment.

Receiving goods, approving expenditure and paying a supplier are distinct actions.

**INV05 — Usage and forecasting**

Reuse cleaner/inventory usage records. Show recorded consumption and advisory reorder estimates with history coverage.

Insufficient history displays “Not enough usage history.” Forecasting must not place supplier orders.

**INV06 — Stock counts and adjustments**

Provide count sheets, variance preview, reasoned adjustment and audit history.

Purchase packs convert to base units once, on the server.

**Acceptance:** opening quantity 10, receipt 5 and usage 3 yields 12. Replaying the usage request leaves 12. Concurrent operations cannot overwrite each other.

### 5.6 Maintenance, notices and staff

**OPS01 — Work orders**

Create work orders from cleaning issues, inventory condition or manual entry.

Fields: property, source, title, description, priority, assignee, due date, blocking status, evidence and resolution.

States: open → in progress → awaiting external action → resolved.

**OPS02 — Notices**

Notices have an audience, effective period and expiry. Expired notices stop appearing automatically.

**OPS03 — Staff management**

Preserve named staff accounts, property access, disablement and session revocation. Staff notes remain operational notes and must not store credentials.

**OPS04 — System health**

Show last successful calendar sync, ingestion activity, pending failures and relevant job heartbeats.

Distinguish “No records received” from “Integration is healthy.” Do not expose secret values.

### 5.7 Insights

**INS01 — Hospitality performance**

Occupancy, accommodation ADR, RevPAR, average stay length, channel mix, returning-guest rate, cancellations and future booked nights.

**INS02 — Cost performance**

Cleaning, consumables, utilities, channel fees and maintenance; drill down to included records.

**INS03 — Comparisons**

Default MTD/YTD comparisons use equivalent elapsed periods. Previous-month and previous-year comparisons are labelled explicitly.

**INS04 — Budgets and scenarios**

Reuse effective-dated owner targets. Provide monthly category budgets and deterministic low/base/high scenarios.

Assumptions are editable and visible. Forecasts never mix into actuals.

**INS05 — Explanations**

Generate plain-language explanations from deterministic rules and verified values. No LLM dependency is required.

Example: “Three expenses await review; the displayed profit excludes them.”

**INS06 — Website funnel**

Reuse `site_funnel_events` and existing event contracts. Count supported funnel events with documented deduplication and denominator rules. Where sessions cannot be reliably connected, report event counts rather than invent a conversion rate.

## 6. Analytics contract

### Shared rules

- Business timezone: **Asia/Manila**, independent of the browser timezone.
- Currency: **PHP**.
- Reporting date ranges use an inclusive start and exclusive end.
- Stay nights use `[check-in date, checkout date)`.
- Historical occupancy and earned accommodation metrics default through the last completed night.
- Current operational status uses actual timestamps where available.
- Future confirmed nights are presented separately.
- Calendar blocks are not automatically occupied nights.
- Unknown source values remain unknown; missing and zero are different.
- Derive totals on the server, before pagination.
- Calculate ratios from aggregate numerators and denominators, not averages of displayed percentages.
- Frontend code formats numbers; it does not calculate authoritative financial totals.

### Metric definitions

| Metric | Definition and treatment |
|---|---|
| Physical capacity nights | One rentable unit × calendar nights in the period after the configured operating start |
| Sellable nights | Capacity less explicitly classified owner-use and out-of-service nights; unexplained imported blocks remain visible exceptions |
| Sold nights | Deduplicated paid accommodation nights within the reporting interval |
| Occupancy | Sold nights ÷ sellable nights |
| Capacity utilisation | Sold nights ÷ physical capacity nights; shown beside occupancy to expose blocked capacity |
| Accommodation revenue | Earned accommodation charges allocated to stay nights, net of accommodation discounts/refunds; excludes taxes, deposits, unrelated fees and guest-paid platform fees |
| ADR | Accommodation revenue ÷ sold nights |
| RevPAR | Accommodation revenue ÷ sellable nights |
| Net accommodation contribution | Accommodation revenue less attributable channel, cleaning and consumable costs |
| Cash received | Reviewed settlements into configured cash/bank/wallet accounts, on settlement date |
| Expected payout | Amount expected from the channel; not treated as cash received |
| Average length of stay | Nights across completed stays checking out in the period ÷ those stays |
| Returning-guest rate | Unique guests completing a stay in the period who had a prior completed stay ÷ unique guests completing a stay in the period |
| Cancellation rate | Cancelled bookings in the selected scheduled-arrival cohort ÷ eligible bookings in that cohort |
| Booking lead time | Check-in date minus reliable booking-created date, one value per booking; missing dates excluded with coverage shown |
| Stock coverage | Current usable quantity ÷ observed average daily usage, only where valid history exists |
| Utility usage | Difference between accepted cumulative readings; reset, replacement and anomalous intervals require explicit handling |

The ADR, occupancy and RevPAR relationship follows the established hospitality definitions, adapted to Cascade’s single rentable unit. [CoStar/STR glossary](https://www.costar.com/products/str-benchmark/resources/glossary)

**Revenue allocation:** use actual nightly charges where available. Otherwise allocate a verified accommodation total evenly across its nights, distributing rounding remainder chronologically. Label this allocation method. If accommodation cannot be separated reliably from bundled charges, show incomplete ADR coverage.

**Period boundaries:** stays crossing months or years contribute only the relevant nights and allocated revenue to each period.

**Zero denominators:** return `null` and an explanation. A 0% occupancy is valid when sellable nights are known and none were sold.

**Coverage:** monetary ADR/RevPAR must not silently divide partial revenue by all nights. Show a complete metric only when the applicable revenue coverage is complete; a restricted covered subset must identify its subset explicitly.

### KPI response

Every metric response includes:

```ts
type MetricResult = {
  key: string;
  value: string | null;
  unit: "PHP" | "percent" | "night" | "day" | "count";
  periodStart: string;
  periodEndExclusive: string;
  basis: "stay" | "cash" | "accrual" | "booking_cohort";
  definitionVersion: string;
  sourceAsOf: string | null;
  coverage: "complete" | "partial" | "missing";
  includedCount: number;
  excludedCount: number;
  warnings: string[];
  drilldownToken: string;
};
```

Drill-down tokens reference the same report scope and calculation revision. They must be authorised again when used.

## 7. Simplified accounting foundation

### User experience

Everyday actions use plain-language forms:

- Record expense.
- Record supplier bill.
- Match payout.
- Record guest deposit.
- Record refund.
- Record owner contribution.
- Record owner withdrawal.
- Transfer between accounts.
- Record asset purchase.

The system prepares balanced entries. Finance reviews and posts them. Advanced journal entry remains a separate restricted screen.

### Accounting structure

Create a compact chart of accounts covering:

| Class | Initial accounts |
|---|---|
| Assets | Cash, UnionBank, GCash, channel clearing/receivables, guest receivables, prepayments, supplies, fixed assets, accumulated depreciation |
| Liabilities | Supplier/cleaner payables, guest advances, refundable deposits, owner loans and other reviewed liabilities |
| Equity | Owner capital, drawings and accumulated earnings |
| Income | Accommodation, earned cancellation/no-show charges and other service income |
| Expenses | Channel/co-host fees, cleaning, utilities, consumables, maintenance, software, depreciation and other approved categories |

These are accounting categories, not assertions about existing balances or asset ownership.

### Core requirements

**ACC01 — Balanced journals**

Store journal headers and lines separately. Posting requires equal debits and credits, valid accounts, property scope, source linkage and an open period.

**ACC02 — Immutable posting**

Posted journals cannot be edited or deleted. Correct them with linked reversals and replacement entries.

**ACC03 — Source traceability**

A business event can post once. Retain source table/ID, reviewed evidence, actor, request identity and mapping version.

A booking confirmation email and payout email are evidence for the same economic lifecycle, not independent revenue.

**ACC04 — Accrual treatment**

- Guest advances remain liabilities until the stay is earned.
- Accommodation revenue is recognised by stay night.
- Payout receipt settles a receivable or clearing account.
- Channel fees are separate expenses.
- Transfers between owned accounts are not income or expense.
- Owner contributions and drawings are not operating profit.
- Refunds reverse the appropriate advance or earned charge according to the reviewed event.
- Cleaner obligations and payment are separate, linked events.

**ACC05 — Inventory and assets**

Use weighted-average cost for consumable stock from the accounting cutover. Recognise consumable expense on recorded usage.

Existing stock requires a reviewed opening valuation. Missing costs remain unresolved rather than becoming zero-value inventory.

Durable operational items enter the fixed-asset register only after Finance explicitly classifies ownership, cost and capitalisation treatment. Depreciation requires entered useful life, residual value and in-service date; the system must not invent them.

**ACC06 — Opening balances**

Setup requires:

- Accounting start date on the first day of a month.
- Verified cash/bank/wallet balances.
- Receivables, payables, advances and deposits.
- Stock valuation.
- Applicable fixed assets and accumulated depreciation.
- Owner equity and loans.
- Supporting references and reviewer.

Do not invent balancing figures. Unresolved differences prevent approval of opening balances.

Earlier records remain accessible as **Historical operational data**, with coverage and reconciliation labels. Do not automatically backfill earlier events into opening balances and then post them again.

**ACC07 — Statements**

Produce from posted journals:

1. Accrual profit and loss.
2. Balance sheet.
3. Direct-method cash flow.
4. Statement of changes in owner equity.
5. Trial balance and general ledger.
6. Receivable/payable ageing.
7. Budget versus actual.
8. Channel profitability and owner pack.

Cash flow classifies operating, investing and financing movements and reconciles opening to closing cash. [IFRS Foundation: IAS 7](https://www.ifrs.org/issued-standards/list-of-standards/ias-7-statement-of-cash-flows/)

Outputs are internal management accounts. This release does not claim BIR, statutory or IFRS compliance and does not generate tax filings.

**ACC08 — Monthly close**

Checklist:

1. Verify ingestion and source coverage.
2. Reconcile cash and channel settlements.
3. Resolve duplicates and missing classifications.
4. Review unpaid obligations, deposits and refunds.
5. Review stock and depreciation.
6. Verify statement identities.
7. Save an immutable close snapshot.

Reopening requires owner/authorised Finance permission and a reason. Previous close versions remain available.

**ACC09 — Exports**

CSV, XLSX and printable PDF use the same report JSON and snapshot as the screen. Include property, period, accounting basis, generation time and completeness state.

### Required accounting fixtures

| Event | Expected result |
|---|---|
| Guest pays ₱6,000 before a three-night stay | Cash +₱6,000; guest advances +₱6,000; no earned revenue yet |
| First night is earned at ₱2,000 | Advance decreases ₱2,000; accommodation revenue increases ₱2,000 |
| ₱6,000 earned channel charge with ₱180 host fee | Revenue ₱6,000; fee expense ₱180; net settlement ₱5,820 |
| ₱10,000 owner contribution | Cash and equity increase; profit unchanged |
| ₱1,000 transfer from bank to GCash | Account balances change; total cash and profit unchanged |
| Buy ten units for ₱500; use four | Supplies asset ₱300 remains; consumable expense ₱200 |
| Repeated payout import | One settlement and one posting |
| Correction in a closed period | Direct edit rejected; authorised reopening/reversal workflow offered |

## 8. Technical architecture and integration contracts

### Application architecture

- React + TypeScript + Vite.
- shadcn/ui with one consistent primitive family.
- Tailwind tokens for Cascade branding.
- TanStack Query for server state.
- TanStack Table for reusable lists.
- React Hook Form + Zod for form contracts.
- Recharts for charts.
- React Router hash routing for compatibility with GitHub Pages.
- Supabase Auth, Postgres, Storage and Edge Functions retained.

Deploy built assets under the existing repository base path. GitHub Pages should upload the production build output rather than the entire repository. [Vite deployment guidance](https://vite.dev/guide/static-deploy.html)

The admin is online-first. Do not persist unrestricted CRM or finance data in a service-worker cache. Existing specialised PWA offline behaviour remains supported.

### Repository ownership

| Responsibility | Location |
|---|---|
| Admin frontend, route tests and product documentation | `C:\Users\Lloyd\Claude\Projects\Cascade\admin-dashboard` |
| SQL, RPCs, Edge Functions and backend contract tests | `C:\Users\Lloyd\Claude\Projects\Cascade\stay-site` |
| Compatible client updates | Existing `inventory` and `CH-Cleaners-Checklist` repositories |

Do not create a second backend migration authority under the admin repository.

### Frontend boundaries

Use feature modules for Today, bookings, guests, operations, inventory, finance, insights and settings.

Shared modules contain:

- UI components.
- Authentication and capability handling.
- API adapters and generated types.
- Dates, money formatting and URL filters.
- Shared loading/error states.

Components do not call arbitrary database tables directly. All data access passes through a feature API adapter.

### Backend additions

Reuse deployed functions when their actual contracts satisfy the requirement. Add versioned APIs where the old semantics conflict.

| Interface | Purpose |
|---|---|
| `get_admin_overview_v1` | Capability-filtered operational summary |
| `get_hospitality_metrics_v1` | Server-calculated metrics and provenance |
| `get_guest_timeline_v1` | Permission-filtered timeline |
| `get_report_drilldown_v1` | Supporting rows for a report calculation |
| `get_financial_statement_v1` | Statements from journals or close snapshots |
| `post_journal_v1` | Validate and post a reviewed draft atomically |
| `reverse_journal_v1` | Create a linked reversal |
| `close_accounting_period_v1` | Validate and create an immutable close |
| `save_guest_profile_v1` | Validated profile changes with audit history |
| `save_follow_up_v1` | Create/update operational follow-ups |
| `review_property_readiness_v1` | Record review or reasoned override |

Existing booking decisions, staff management, cleaning reviews, CRM consent and inventory functions remain authoritative unless a documented compatibility migration replaces them.

### Data additions

Add only missing entities after comparing live schema:

- Guest preferences/contact provenance and merge history.
- Follow-up tasks and work orders.
- Readiness reviews.
- Accounting accounts, journals, lines and source links.
- Accounting periods, opening-balance batches and close snapshots.
- Fixed-asset records and depreciation schedules.
- Report definitions/snapshots and user saved views.

Extend existing inventory movement, reconciliation, consent and target structures rather than duplicate them.

### Shared API rules

- Every request is authenticated and property-scoped.
- Existing privileged actions retain their server-enforced MFA requirements.
- Amounts cross JSON boundaries as decimal strings; accounting storage uses fixed-precision numeric values.
- List queries default to 25 rows, maximum 100, with stable ordering.
- Exports request all matching authorised rows separately.
- Mutations include an idempotency key.
- Mutable records use an expected version to detect stale edits.
- Reusing a key with a different payload returns a conflict.
- Return structured forbidden, validation, conflict and unavailable errors.
- No browser-supplied totals or evidence hashes become authoritative without server derivation/verification.
- Report snapshot and drill-down permissions are rechecked on access.

### Integration migration rules

1. Inventory every existing reader and writer.
2. Add compatible backend interfaces first.
3. Update admin and PWA clients.
4. Reconcile stock/source baselines.
5. Verify exactly-once behaviour across clients.
6. Disable superseded direct writes only after compatibility is proven.

Do not let both an old direct quantity update and a new movement command apply to the same usage event.

Preserve:

- Canonical booking/calendar ownership.
- Cleaning submission identity and deduplication.
- Photo matching by submission identity.
- Existing photo-skip rules.
- Separate Finance and OPS Telegram audiences.
- Messenger concierge/handoff behaviour.
- Existing server-owned staff roles and revocation.

Supabase row-level security and function-level checks must enforce these boundaries. [Supabase RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security)

## 9. Researched resources selected for integration

| Resource | Use | Integration decision |
|---|---|---|
| [shadcn/ui Data Table](https://ui.shadcn.com/docs/components/radix/data-table) | Shared sortable/filterable lists | Adopt documented TanStack Table integration |
| [shadcn/ui Chart](https://ui.shadcn.com/docs/components/radix/chart) | Consistent chart styles and tooltips | Use Recharts; totals remain server-calculated |
| [TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview) | Request caching, refetching and mutation invalidation | Clear sensitive cache on sign-out; scope keys by property/user capability |
| [React Hook Form](https://github.com/react-hook-form/react-hook-form) and [Zod](https://zod.dev/) | Forms and validation | Share validated DTO contracts; repeat enforcement server-side |
| [FullCalendar Standard](https://fullcalendar.io/license) | Booking calendar and agenda | Use standard plugins; no premium scheduler dependency |
| [Papa Parse](https://www.papaparse.com/docs) | CSV preview/import/export | Enable formula escaping and import validation |
| [ExcelJS](https://github.com/exceljs/exceljs) | Owner XLSX workbooks | Load only when exporting; use explicit text/numeric cell types |
| [Vitest](https://vitest.dev/guide/) | Unit and component tests | Test state transitions and calculations |
| [Playwright](https://playwright.dev/docs/test-assertions) | Complete browser workflows | Use real assertions, permission fixtures and mobile layouts |
| [WCAG 2.2 guidance](https://www.w3.org/WAI/WCAG22/quickref/) | Accessibility acceptance criteria | Keyboard and manual checks accompany automated checks |

Pin a mutually compatible stable dependency set and commit the lockfile. Preserve dependency licences. Do not copy Apex source or paid assets without an established licence; the implementation uses its observed design patterns.

**Not required for this release:** a new CRM SaaS, accounting SaaS, analytics SaaS, messaging platform, or LLM-based financial calculation service.

## 10. Implementation packets for lower-cost models

Execute one packet at a time. Each packet must preserve unrelated work and have one bounded acceptance result.

### Required packet contents

Each task file contains:

- Requirement IDs and purpose.
- Exact allowed files.
- Required source/context files.
- Existing and new interface contracts.
- Fixture inputs and expected outputs.
- Implementation steps.
- Validation commands.
- Completion evidence.
- Compatibility and rollback instructions.

Generate exact file lists from the current checkout before that packet starts. If inspected code contradicts the contract, report the conflict; do not silently invent a new business rule.

### Ordered work queue

| Packet | Deliverable | Dependencies | Acceptance gate |
|---|---|---|---|
| P01 | Current-state and migration evidence manifest | None | Every reused object classified as deployed, local-only or missing |
| P02 | Baseline analytics audit fixtures | P01 | Reproduce A01–A06 with documented queries |
| P03 | Metric definitions and typed contracts | P02 | Boundary and coverage fixtures approved against this PRD |
| P04 | React/Vite build and test foundation | P01 | Clean install, typecheck, test and production build pass |
| P05 | Authentication and capability adapter | P04 | Role, MFA, disabled-user and property tests pass |
| P06 | Cascade shell, navigation and responsive layout | P05 | All authorised routes usable on desktop and mobile |
| P07 | Shared tables, forms, filters and errors | P06 | URL restoration, validation and retry tests pass |
| P08 | Canonical booking/calendar read model | P03, P05 | Linked records deduplicate; date boundaries pass |
| P09 | Hospitality metric service | P08 | Formula, future-night and coverage fixtures pass |
| P10 | Today overview and action queue | P07–P09 | Every card links to matching records; failures stay visible |
| P11 | Booking list/calendar/detail | P08, P07 | Cross-channel and mobile journeys pass |
| P12 | Booking decision/change adapter | P11 | Concurrency, cancellation and payment-state tests pass |
| P13 | Cleaning register and evidence detail | P07, P08 | Session/photo identity and restricted fee tests pass |
| P14 | Cleaning review and readiness | P13 | Advisory findings cannot auto-approve or auto-reject readiness |
| P15 | Work orders and notices | P14 | Blocking work affects readiness; expiry and resolution pass |
| P16 | Inventory baseline and movement compatibility | P01, P05 | Starting stock, concurrent mutation and replay tests pass |
| P17 | Inventory catalogue, counts and usage | P07, P16 | Admin/PWA quantity agreement proven |
| P18 | Purchasing and shopping list | P17 | Receipt, stock and financial source links do not duplicate |
| P19 | Guest profile and identity review | P07, P08 | Same-name/conflicting-contact tests pass |
| P20 | Guest timeline and follow-ups | P19 | Messenger/Telegram links and permission-filtered events pass |
| P21 | Finance source reconciliation workbench | P02, P07 | A01/A02 have explicit explanations or unresolved entries |
| P22 | Accounts, journals and posting engine | P05, P21 | Balanced posting, idempotency and immutable correction pass |
| P23 | Opening-balance setup | P22 | Missing balances cannot be silently fabricated |
| P24 | Simple finance forms and source mappings | P22, P23 | Deposit, payout, expense, transfer and owner-money fixtures pass |
| P25 | Stock valuation and fixed assets | P18, P24 | Usage costs reconcile; depreciation requires configured inputs |
| P26 | Statements and monthly close | P24, P25 | Trial balance, balance sheet, equity and cash-flow identities pass |
| P27 | Insights, budgets and explanations | P09, P26 | Actuals, forecasts, source coverage and comparisons remain distinct |
| P28 | Owner exports and print layouts | P26, P27 | Screen/CSV/XLSX/PDF totals match |
| P29 | Staff settings, integration health and audit UI | P05, P15, P20, P26 | Permissions, expiry, failures and audit links pass |
| P30 | Cross-app acceptance and rollout package | P10–P29 | Compatibility, accessibility, restore and rollback gates pass |

### Runner prompt

> Implement packet PXX only. Read the PRD, that packet’s context files and current repository instructions. Confirm that its dependencies have completion evidence. Preserve unrelated edits.
>
> Follow the specified interfaces, accounting rules and acceptance fixtures. Do not replace existing backend authorities or introduce new services. Never substitute mock data, silent zeros or frontend permissions for a missing integration.
>
> Implement the bounded change, run the packet’s required checks, and report changed files, test outcomes and unresolved limitations. Do not mark the packet complete if its acceptance gate fails. Do not push, deploy, activate workflows or modify production data unless separately authorised.

### Documentation package

The implementation should maintain:

- `PRD.md` — this specification.
- `CONTRACTS.md` — public DTOs and backend authorities.
- `METRICS.md` — formulas, periods, allocation and coverage rules.
- `TASKS.json` — packet IDs, dependencies and statuses.
- `tasks/PXX.md` — bounded task instructions.
- `evidence/PXX.md` — commands, results and acceptance evidence.
- `RELEASE.md` — deployment order, compatibility and rollback.

Do not copy dated “not deployed” claims from older plans without checking the current environment.

## 11. Test and release plan

### Mandatory test scenarios

| Area | Required scenarios |
|---|---|
| Dates | Month/year crossing, leap day, Manila midnight, browser in another timezone, checkout-exclusive nights |
| Revenue | Direct income, channel fees, partial refunds, retained cancellation fees, missing accommodation breakdown |
| Reporting | Equal-period comparison, zero denominator, incomplete coverage, more than 1,000 source rows |
| Identity | Same names, shared phones, changed contacts, reviewed merge, returning guest |
| Booking | Overlap race, duplicate submission, stale calendar, cancelled stay with financial history |
| Cleaning | Missing photos, permitted skip, advisory mismatch, repeated upload, readiness override |
| Inventory | Concurrent usage, repeated receipt, unit conversion, baseline mismatch, insufficient stock |
| Accounting | Balanced journals, duplicate source, deposit recognition, owner contribution, transfer, reversal, close/reopen |
| Access | Anonymous, every staff role, disabled identity, revoked session, missing MFA, cross-property request |
| Reliability | Supabase unavailable, one failed dashboard section, expired session, stale cached data |
| Exports | Exact totals, all filtered rows, formula-like guest text, long notes, page breaks |
| Cross-app | Cleaner submission → review → stock usage → fee obligation → payment → owner report |

### Performance and accessibility

- Test at 360, 390, 768 and 1440 px widths, plus landscape mobile.
- No page-level horizontal overflow; wide tables may use a labelled internal scroll area.
- Target usable Today content within three seconds on the agreed mobile test profile.
- Target indexed primary list/summary queries under two seconds at p95 in staging.
- Test with at least 10,000 synthetic financial rows.
- Lazy-load charts, calendars and export libraries.
- No critical/serious automated accessibility findings on principal workflows.
- Complete keyboard checks for navigation, dialogs, forms, tables and chart alternatives.

### Rollout

1. Build the new admin alongside the current entry point.
2. Deploy additive backend changes before dependent UI.
3. Release read-only operational and analytics views first.
4. Enable mutations module by module after compatibility tests.
5. Complete reviewed opening balances before authoritative accounting statements.
6. Verify the complete cleaner-to-owner-report journey.
7. Switch the default admin entry point.
8. Retain a documented rollback build during observation.

Once new accounting or inventory writers are authoritative, rollback must not reactivate incompatible legacy writers.

No automatic deletion of `index2.html`, old PWAs or Apps Script paths. Remove a legacy entry point only after its consumers and replacement behaviour are verified.

### Final completion criteria

The complete release is accepted when:

- Every packet has passing evidence.
- Every baseline discrepancy is either resolved or visible as a specific reconciliation exception.
- Operational users complete their workflows without opening unrelated admin modules.
- All statements reconcile from reviewed opening balances through posted journals.
- No production screen relies on demo data.
- Role and property isolation work at the database/API boundary.
- Cleaner and inventory PWAs remain functional.
- Owner/staff acceptance targets are met.
- Deployment, rollback and monthly-close instructions are usable by another implementer.

## 12. Locked decisions and exclusions

**Confirmed decisions**

- Unified admin; specialised PWAs retained.
- React/shadcn migration.
- Apex layout patterns with Cascade colours.
- Reliability and daily operations before accounting completion.
- Accrual accounting beneath simple forms.
- Verified opening balances rather than reconstructing all history.
- Guest timelines and follow-ups; Messenger and Telegram remain the primary channels.

**Defaults**

- Single-property experience with property-scoped storage and permissions.
- PHP and Asia/Manila.
- Light theme by default.
- Online-first admin.
- No paid template or new SaaS dependency.
- Deterministic calculations and explanations.
- Setup collects the actual accounting start date, balances, assets and account mappings; these are business inputs, not values an implementing model should guess.

**Outside this release**

- Replacement of the cleaner PWA.
- A new full messaging inbox.
- Automated bank transfers or supplier orders.
- Tax filing and statutory compliance certification.
- Multi-currency accounting.
- Full payroll.
- Automated dynamic pricing.
- Marketing campaigns and autonomous guest messaging.
- Reconstructing all historical accounts.
- AI-generated financial calculations or autonomous financial approvals.
