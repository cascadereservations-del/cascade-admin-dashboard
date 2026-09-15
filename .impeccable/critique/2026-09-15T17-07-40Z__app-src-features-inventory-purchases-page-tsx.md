---
target: Purchases (app/src/features/inventory/purchases-page.tsx)
total_score: 17
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-09-15T17-07-40Z
slug: app-src-features-inventory-purchases-page-tsx
---
Method: dual-agent (A: Purchases Assessment A design review · B: Purchases Assessment B detector+browser evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 1 | No count/total on the "Shopping list" header (how many proposed? approved-awaiting-receipt?); a status transition is just a badge-color swap in a flat scroll |
| 2 | Match System / Real World | 3 | Copy is plain and honest ("separate steps" framing) |
| 3 | User Control and Freedom | 2 | "Delete" was really a status-flip to `cancelled`, mislabeled — fixed this session; no inline undo for Approve/Reject beyond a toast |
| 4 | Consistency and Standards | 2 | `Section` chrome used identically for a form, a mixed-status queue, and a static ledger — three different jobs, one visual grammar |
| 5 | Error Prevention | 2 | Approve/Reject/Cancel are bare buttons with zero confirmation on a spend-adjacent action |
| 6 | Recognition Rather Than Recall | 1 | Finding "what's waiting on my decision" requires visually scanning every row's badge in an undifferentiated list — no grouping, filter, or count |
| 7 | Flexibility and Efficiency | 1 | No bulk-approve, no filter/sort, no keyboard path |
| 8 | Aesthetic and Minimalist Design | 2 | Clean per-row, but three unrelated jobs (propose / decide / history) stacked with equal visual weight |
| 9 | Error Recovery | 2 | `toast.error` only — no inline/near-field recovery guidance |
| 10 | Help and Documentation | 1 | No inline explanation of the propose→approve→receive lifecycle beyond the one-line page description |
| **Total** | | **17/40** | **Poor — weakest page of the five audited** |

## Design Specificity Verdict
Category-interchangeable. Three `<Section>` blocks (a form, a mixed-status `<ul>`, a second `<ul>`) is the default shape of any CRUD admin scaffold — nothing signals this is a purchasing *pipeline* with three sequential stages. "Propose" (a workflow entry point) and "Recorded purchases" (a historical ledger) get the identical visual grammar despite serving opposite mental models. Deterministic scan: `detect.mjs` exit 0, 0 findings — the integrity gap here is structural/IA, not implementation drift.

## Overall Impression
The clearest implementation-integrity gap of the five pages audited. Confirmed by source: `tone()` maps five distinct lifecycle states (proposed/approved/received/rejected/cancelled) to badge colors inside one `<ul>` with no grouping applied before render.

## Cognitive Load
4+ of 8 checklist items fail — high/critical, per the skill's own scoring band. Single focus fails (three unrelated jobs on one screen), Grouping fails (pipeline stages not grouped), Visual hierarchy fails (all five statuses share one badge-only differentiator), Recognition fails (per Heuristic 6 above), Progressive disclosure fails (everything shown regardless of relevance to the current step).

## What's Working
1. The `Receive` inline sub-form is well-scoped: right fields, right defaults, cancelable.
2. `undoToast` on propose/decide gives real recoverability the heuristics table above doesn't otherwise reward.
3. Financial gating (`canFinance`) correctly hides cost from non-finance roles — domain-aware, not generic.

## Priority Issues

**[P0] One flat list serves five lifecycle states with no grouping.** Confirmed live and in source (lines rendering the `<ul>`). The core admin task — "what needs my decision right now" — requires manually reading every row's badge. Matches the Dashboard Audit Plan's already-published phase-3 concept (status-pipeline columns: Proposed → Approved → Received). `/impeccable shape` — not built this session, phase 3 stays parked.

**[P1] No link from a received shopping-list row to its resulting purchase**, despite `item_id` joining the two datasets in the data layer already. An owner reconciling "did we pay a fair price" must cross-reference two separate lists by eye. `/impeccable clarify`

**[P1] Destructive-adjacent actions (Approve/Reject/Cancel/Receive) have zero confirmation** on a spend-approval workflow — a misclick approves a purchase or discards a proposal with only an undo toast that can be missed. `/impeccable harden`

**[P2] "Delete" mislabeled a status change** — it flipped `status` to `cancelled`, never removed the row. Fixed this session: renamed to "Cancel." `/impeccable clarify` — DONE 2026-09-16.

**[P3] No count/summary on the Shopping list section header** (e.g. "(3 pending)"). `/impeccable polish`

## Persona Red Flags

**Alex (Power User):** No bulk-approve for multiple pending items, no keyboard path to Approve/Reject; a purely linear one-row-at-a-time review loop will feel slow the first time there are 8+ pending items.

**Riley (Stress Tester):** A cancelled item never leaves the list (status flips, row stays) — after a few cancels, "Shopping list" fills with dead rows indistinguishable at a glance from active ones except by badge text.

**Sam (Accessibility):** Status conveyed by badge color + text label (fine — never color-only), but no `aria-live` region announces Approve/Reject/Receive mutation results beyond the transient toast.

## Minor Observations
`formatNumber(quantity, 2)` prints "100.00 units" for whole-number quantities — noisy. Recorded-purchases rows wrap awkwardly at mobile width (375px) with no visual separation between the wrapped item text and the date column above it.

## Questions to Consider
Does the owner actually need "Recorded purchases" and "Shopping list" as two separately-scrolled sections, or is a received shopping-list row just the front half of a purchase record — the same entity, two lifecycle halves?

## Deterministic / Browser Evidence (Assessment B)
`detect.mjs` exit 0, 0 findings. No console errors across propose/approve/reject/receive flows tested live. Status-badge contrast measured directly against composited backgrounds (not raw alpha): proposed 10.72:1, approved 12.59:1, received 12.50:1, neutral (rejected/cancelled) 6.31:1 — all pass AA, only neutral sits below AAA which is acceptable at this text size. Real finding, source-confirmed: `rejected` and `cancelled` share the identical `neutral` tone AND identical glyph in `status-badge.tsx`, distinguished only by text label — not a strict color-only violation but a real visual-distinguishability gap between two different terminal states. Form-label audit: all 4 "Propose an item" fields properly labeled — pass. Touch targets: Approve/Reject/Cancel buttons measure ~30px tall with only 8px between adjacent targets — part of the app-wide `size="sm"` pattern, flagged cross-cutting, not fixed page-by-page. A live-testing pass on this page created one real production row (see D-134, disclosed to Lloyd, harmless, `status: cancelled`). Independently re-verified the page-level overflow question raised by an earlier pass: it was the shared app-shell header bug (fixed, D-134), not Purchases-specific — confirmed 0 overflow post-fix.
