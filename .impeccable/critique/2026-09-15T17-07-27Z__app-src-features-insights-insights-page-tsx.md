---
target: KPIs & Analytics / Insights (app/src/features/insights/insights-page.tsx)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
timestamp: 2026-09-15T17-07-27Z
slug: app-src-features-insights-insights-page-tsx
---
Method: dual-agent (A: Insights Assessment A design review · B: Insights Assessment B detector+browser evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Per-section skeletons, Complete/Partial coverage badges, freshness timestamp are strong |
| 2 | Match System / Real World | 3 | Domain terms (ADR, RevPAR) carry inline definitions via info icons |
| 3 | User Control and Freedom | 2 | Clicking a chart bar navigates away with no confirmation, losing the period-slicer context |
| 4 | Consistency and Standards | 3 | Two legend patterns coexist (Recharts `<Legend>` vs custom `MiniLegend`) |
| 5 | Error Prevention | 3 | Low-risk read-only surface; custom date range has no from>to validation |
| 6 | Recognition Rather Than Recall | 2 | Selected period text scrolls out of view; nothing restates it near Utilities/Consumption sections |
| 7 | Flexibility and Efficiency | 2 | No shortcuts, no CSV export from the drill-down table, no saved custom periods |
| 8 | Aesthetic and Minimalist Design | 2 | Individual sections are clean; 8 stacked sections as a whole is not |
| 9 | Error Recovery | 2 | `MoneyTrend`/`UtilitiesChart` surface raw `Error.message` on failure, breaking from the page's otherwise friendly copy |
| 10 | Help and Documentation | 2 | "Definitions" section links to a repo file path (`docs/METRICS.md`) an in-browser admin user can't open |
| **Total** | | **24/40** | **Acceptable** |

## Design Specificity Verdict
High on content, generic on form. Genuinely purpose-built domain logic: sold-nights defined as `[check-in, checkout)`, calendar-blocked nights explicitly excluded from occupancy, owner Drawings deliberately isolated on its own axis so a personal draw never reads as a business cost, Forward Projection priced off actual confirmed calendar nights. But the visual language (card grid, Recharts defaults, shadcn Tabs/Switch) is interchangeable with any admin analytics product. Deterministic scan: `detect.mjs` exit 0, 0 findings.

## Overall Impression
The best-modeled data on the dashboard, presented with zero progressive disclosure — every one of 8 sections (KPIs, month-snapshot, performance, money, drawings, projection, utilities, consumption, definitions) renders unconditionally on every visit regardless of what the owner came to check.

## What's Working
1. Coverage transparency — "Complete"/"Partial" badges plus plain-language warnings turn data-quality caveats into trust rather than confusion.
2. Owner Drawings intentionally isolated from Income vs Expenses — a real domain insight (a prior critique, D-120, drove this), not a generic chart choice.
3. Every chart is clickable to its source records, closing the trust-but-verify loop.

## Priority Issues

**[P1] Silent period substitution.** When the slicer is set to "Month," every chart below quietly swaps in a trailing-12-month window with no on-screen indication it happened — confirmed in source (`chartPeriod` logic). Fixed this session: section titles now append " · last 12 months" when active. `/impeccable clarify` — DONE 2026-09-16.

**[P1] No progressive disclosure across 8 stacked sections.** Utilities and Consumption per Occupied Night sit far below the fold behind sections a user visiting for one thing may not need. Fix: tabbed or accordion IA (Performance / Money / Utilities), or sticky anchor nav. `/impeccable layout`

**[P2] Chart drill-down is mouse-only.** `onClick` handlers on bar/line charts have no keyboard/focus equivalent, unlike the KPI cards' own "Records" button.

**[P2] Raw error strings break the page's friendly-copy pattern** in `MoneyTrend`/`UtilitiesChart`. Fixed elsewhere on the page via friendly empty-states; these two still leak `Error.message`.

**[P2] Owner Drawings section vanished entirely (returned null) when a period had zero drawings**, reading as broken rather than empty to a returning user (Riley/stress-tester persona). Fixed this session: now shows "No owner drawings in this period." `/impeccable clarify` — DONE 2026-09-16.

## Persona Red Flags

**Alex (Power User):** No keyboard shortcuts, no CSV export from the drill-down table; checking Utilities alone still requires scrolling past 6 unrelated sections every visit.

**Sam (Accessibility):** Every Recharts chart lacks `aria-label`; combined with mouse-only drill-down, a keyboard/screen-reader user gets the surrounding paragraph text but no equivalent path into 7 of the page's interactive charts.

## Minor Observations
9-tab period selector can wrap awkwardly at mid desktop widths. `ForwardProjection`'s dashed/translucent "not real yet" styling is a nice, underused pattern. Color (`--chart-1`) is reused across unrelated metrics in adjacent charts (Occupancy's line and Accommodation Revenue's bar), weakening a page-wide color-to-metric mental model.

## Questions to Consider
Does the owner ever open this page to check one thing, or always all of it — and if the former, why is there no way to jump straight there? Should Utilities/Consumption (facilities data) live on the same page as Income/Expenses at all?

## Deterministic / Browser Evidence (Assessment B)
`detect.mjs` exit 0, 0 findings. No console errors. Contrast sampled: muted text 16.06:1, chart axis labels 14.86:1 — both pass AAA. `--chart-1` through `--chart-5` confirmed to hold genuinely distinct light-vs-dark values (not a copy-paste leak) — the dark-mode contrast concern flagged by a prior session (D-131) is an automated-threshold finding, not an obvious visual failure on direct inspection; left as previously accepted, deferred to its own future pass (phase 4). 22 Recharts containers checked at mobile width, none overflow their own box. Page-level 150px mobile overflow was traced this session to a shared app-shell header bug (fixed, see D-134) — not page-specific.
