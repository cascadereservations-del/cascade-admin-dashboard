---
target: Inventory (app/src/features/inventory/inventory-page.tsx)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 1
timestamp: 2026-09-15T17-07-35Z
slug: app-src-features-inventory-inventory-page-tsx
---
Method: dual-agent (A: Inventory Assessment A design review · B: Inventory Assessment B detector+browser evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Toasts on receipt/adjust are good, but "Legacy Quantity" doesn't say why the ledger is off or what unblocks it |
| 2 | Match System / Real World | 3 | Plain language throughout, but "movement ledger" vs "legacy quantity" is internal system vocabulary a cleaner won't parse |
| 3 | User Control and Freedom | 3 | Undo on adjustments (8s toast action) is a genuine safety net; no confirm-cancel on the Receive form itself |
| 4 | Consistency and Standards | 3 | Table/sheet/filter patterns internally consistent with the rest of the admin |
| 5 | Error Prevention | 2 | `Record adjustment` correctly disables without a movement ledger; nothing bounds an implausible `packs` value or blocks receiving stock for an inactive item |
| 6 | Recognition Rather Than Recall | 2 | "Legacy Quantity" vs "Movement ledger" must be recalled each time — no inline explanation where it first appears |
| 7 | Flexibility and Efficiency | 2 | No bulk receive, no keyboard shortcut, no batch-restock path |
| 8 | Aesthetic and Minimalist Design | 2 | "Not enough usage history" repeated on literally every row is the single most-repeated string on the page, zero signal |
| 9 | Error Recovery | 3 | The "reconciliation required" API error maps to a plain-language message pointing to Counts |
| 10 | Help and Documentation | 1 | No inline help for "Legacy Quantity," "movement ledger," or why coverage is unavailable |
| **Total** | | **24/40** | **Acceptable** |

## Design Specificity Verdict
Category-interchangeable. This is the same `@tanstack/react-table` + shadcn DataTable + Sheet skeleton that would ship for a SaaS billing table or CRM contact list. The one product-specific touch — `attention` filter chips and the coverage-days column — is undermined by a real data gap (below), so even that differentiator reads as inert. Deterministic scan: `detect.mjs` exit 0, 0 findings.

## Overall Impression
Solid, safe CRUD implementation let down by two compounding problems: a flat list that never groups by what actually matters (consumable vs durable), and a coverage-days concept the underlying data can't support yet on any visible row.

## What's Working
1. The undo-via-reverse-adjustment pattern is a thoughtful, audit-safe safety net — rare in an admin CRUD form.
2. Contextual, non-generic error messages anticipate real confusion points instead of leaking raw API text.
3. Finance-gated unit cost (`read_finance` capability) is a nice least-privilege touch most admin tables skip.

## Priority Issues

**[P0] Flat table interleaves consumables and durables with no grouping.** Confirmed live: rows alternate types every row (3-in-1 Coffee → Wooden Wardrobe → Bed → Bottled Water → Mattress Protector). Forces two different mental tasks ("what do I need to buy" vs "what do I own") into one undifferentiated scan. Matches the Dashboard Audit Plan's already-published phase-3 redesign concept (group into Consumables/Stores). `/impeccable shape` — not built this session, phase 3 stays parked.

**[P0] "Not enough usage history" and "Legacy Quantity" appear on every single visible row.** This isn't a UI bug, it's a data-completeness problem that neuters any future coverage-based sort — the phase-3 redesign's proposed "sort consumables by ascending coverage days" has nothing to sort by on 100% of current rows. Flag before investing in that redesign, not after. `/impeccable audit`

**[P1] Mobile table requires horizontal scroll to see Stock Control / State** — confirmed live at 375px, these two columns sit off-screen within the table's own contained scroll box. A cleaner restocking mid-shift on a phone can't see whether an item is "out of stock" without scrolling sideways. `/impeccable adapt`

**[P2] Both Receive and Adjust forms always render, one frequently disabled** with a grey caption next to a fully-enabled sibling form — extra scanning cost for zero payoff on the majority-legacy-quantity items. `/impeccable clarify`

## Persona Red Flags

**Alex (Power User):** No bulk receive — open sheet, fill 4 fields, submit, close, repeat per item. Will find this workflow-blocking on a delivery day with 10+ items.

**Casey (Mobile/Distracted):** The Receive form's primary submit button sits at the top of a form whose fields extend past the thumb zone on a phone.

**Sam (Accessibility):** The disabled "Record adjustment" caption is a sibling `<p>`, not programmatically associated via `aria-describedby` with the button it explains.

## Minor Observations
`formatNumber(qty, 2)` shows "5.00 pc" — two decimals on whole-unit consumables reads oddly precise. The Coverage column header has no tooltip explaining what "days" means, despite being the metric most tied to the pending redesign.

## Questions to Consider
If 100% of items currently show "Not enough usage history," is the redesign's coverage-ascending sort solving a problem the data can support yet, or should data completeness come first? Does "Legacy Quantity" need to be user-facing vocabulary at all?

## Deterministic / Browser Evidence (Assessment B)
`detect.mjs` exit 0, 0 findings. No console errors, list or detail sheet. All 6 form inputs across both forms (Receive, Adjust) have properly associated `<label>` elements — pass. Contrast on 4 representative elements (dialog heading, usage text, submit button, disabled-helper text) all exceed 7.76:1 — pass AAA. Touch targets: item-name row link 44.0×18.8px (height fails), sheet Close button 15×15px (fails), Record receipt submit 108.5×30.0px (height fails) — part of the app-wide `size="sm"`/small-target pattern, flagged cross-cutting, not fixed page-by-page. Mobile-width detail sheet and cold-load deep-link findings from initial sub-agent passes were independently re-verified this session in a clean tab and **did not reproduce** — ruled out as false positives from 9-tab browser contention during the parallel sub-agent run, not real bugs (see D-134).
