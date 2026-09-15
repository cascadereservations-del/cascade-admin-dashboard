---
target: Bookings list + detail (app/src/features/bookings/bookings-page.tsx, booking-detail-page.tsx)
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-15T17-07-31Z
slug: app-src-features-bookings-bookings-page-tsx
---
Method: dual-agent (A: Bookings [list+detail] Assessment A design review · B: Bookings Assessment B detector+browser evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Loading skeletons, "Calendar last synced" freshness label, "Cancelling…" mutation state — solid |
| 2 | Match System / Real World | 3 | "Blocked" calendar rows show Booking:"Unknown" in the same column as real reservations — a non-booking wearing booking-state UI |
| 3 | User Control and Freedom | 3 | Back button, filter reset, "Keep booking" escape all present |
| 4 | Consistency and Standards | 3 | Payout uses a colored `StatusBadge` everywhere; Payment is plain muted text — two peer status fields, inconsistent treatment |
| 5 | Error Prevention | 3 | Strong gating (role + type + state checks, idempotency key, 3-char reason minimum), but the Cancel dialog didn't restate the charge amount for the destructive action — fixed this session |
| 6 | Recognition / Recall | 4 | Text-labeled badges (never color-only), copy buttons on code/phone/email, labeled tabs |
| 7 | Flexibility and Efficiency | 2 | No bulk select/cancel on the list, no saved filter views, no keyboard shortcuts |
| 8 | Aesthetic and Minimalist Design | 3 | Clean dark theme, tabular-nums; list widens to 9 columns for finance users |
| 9 | Error Recovery | 3 | `toast.error` shows message+detail, idempotency key only rotates on success (retry-safe) |
| 10 | Help and Documentation | 1 | No tooltip anywhere on ambiguous fields like "Payout: Expected" vs "Payout reported" or "Calendar: Date match" vs "Linked" |
| **Total** | | **28/40** | **Good — strongest page of the five audited** |

## Design Specificity Verdict
Authored for this product, not generic. The Booking/Payment/Payout tri-state split (explicit throughout, and repeated identically in list columns and detail's States card) reflects a real Airbnb-hosting pain point — payout and payment status genuinely diverge. The Cancel dialog's copy ("Financial history is untouched; refunds need separate authorisation") is hospitality-ops-specific, not boilerplate CRUD chrome. Deterministic scan: `detect.mjs` exit 0, 0 findings across both files.

## Overall Impression
The most product-specific and best-heuristic-scoring page of the five. The main gaps are density-related (a 6-tab, 6-filter list shown simultaneously) rather than conceptual.

## What's Working
1. Booking/Payment/Payout kept as three distinct, consistently-styled states rather than one collapsed "status" — makes the product's actual domain model visible.
2. The Cancel dialog's copy does real explanatory work, not just "Are you sure?"
3. Finance-gated fields degrade gracefully to an explanatory sentence rather than blank space.

## Priority Issues

**[P1] List: horizontal overflow with no scroll affordance at normal desktop width** when finance columns + Calendar are shown together — header text clips mid-word with only a thin native scrollbar as the cue. Note: distinguished from page-level overflow — this is the table's own contained-scroll box, an acceptable pattern for dense tables, but the affordance (a visible "more columns" cue) is missing. `/impeccable adapt`

**[P1] Detail: Cancel dialog omitted the Charges figure it acts against** — cancelling a confirmed ₱5,847 stay used the identical 3-character-reason gate as cancelling an empty inquiry. Fixed this session: dialog now shows guest-paid total + deposit when finance-authorised. `/impeccable harden` — DONE 2026-09-16.

**[P2] List: 6-option view Tabs + 6-control FilterBar shown simultaneously**, exceeding the ≤4 working-memory guideline before any row is read. Fix: fold Balance/From/To behind a "More filters" disclosure. `/impeccable layout`

**[P2] Consistency: Payment state has no badge while Booking and Payout do**, in both list and detail's States card — same visual language should mark all three peer states.

**[P3] No tooltips on jargon** ("Payout: Expected" vs "reported", "Calendar: Date match" vs "Linked"). `/impeccable clarify`

## Persona Red Flags

**Alex (Power User):** No bulk-cancel or bulk-export on the list; every cancellation is one booking, one dialog, one reason field.

**Sam (Accessibility):** Payout/Booking badges have good text+color; Payment's plain muted-gray text has lower contrast than the badges beside it.

**Riley (Stress Tester):** "Blocked" calendar rows carry Booking:"Unknown"/Payment:"Unknown" — an edge case rendered with the same vocabulary as a real failure state, inviting confusion.

## Minor Observations
Guest name in the list row is a separately-clickable `Link` with `stopPropagation` even though the whole row is already clickable — two overlapping click targets doing the same thing. "Nights" column duplicates check-in/checkout math already visible.

## Questions to Consider
Should the Cancel dialog inherit the Charges card's numbers automatically, given it's the single destructive action on this whole surface? Does a 6-tab, 6-filter list need both, or could tabs subsume the most common filters entirely?

## Deterministic / Browser Evidence (Assessment B)
`detect.mjs` exit 0, 0 findings across both files. No console errors on either view. A sub-agent's contrast script initially measured the "Confirmed" status badge at 2.03:1 (apparent fail); independently re-verified this session directly against the actual composited background — the badge uses a 10%-opacity tint (`bg-chart-4/10`), true composited contrast is ~14:1+. **Ruled out as a false positive** (the script read the raw alpha-channel color as opaque) — not a real bug, not fixed. Touch targets: sort-header buttons and row links measure ~17-19px tall, under 44px (part of the app-wide `size="sm"` pattern, flagged cross-cutting, not fixed page-by-page). List-view table overflow is contained to its own scroll box (525px viewport at mobile shows page-level scrollWidth == innerWidth after the shared app-shell fix, D-134).
