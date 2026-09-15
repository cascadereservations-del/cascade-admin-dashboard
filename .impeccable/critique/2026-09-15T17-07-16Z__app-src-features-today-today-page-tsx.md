---
target: Today (app/src/features/today/today-page.tsx)
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-09-15T17-07-16Z
slug: app-src-features-today-today-page-tsx
---
Method: dual-agent (A: Today Assessment A design review · B: Today Assessment B detector+browser evidence)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | "Source updated" footer timestamp can sit visibly stale against the header date with no escalation |
| 2 | Match System / Real World | 2 | "P5" priority badges and "source: inventory item" style tags are undefined system vocabulary |
| 3 | User Control and Freedom | 3 | Read-only overview, nothing to escape |
| 4 | Consistency and Standards | 3 | CTA button variant drifts (outline vs ghost) for equivalent "go to detail" actions |
| 5 | Error Prevention | 3 | n/a mostly — no input surface on this page |
| 6 | Recognition Rather Than Recall | 3 | Icons paired with text labels throughout |
| 7 | Flexibility and Efficiency | 1 | No manual refresh, no shortcuts, no bulk action on low-stock rows |
| 8 | Aesthetic and Minimalist Design | 3 | Clean grid, but 4 of 6 KPI cards can render red simultaneously with no period context, diluting the alarm |
| 9 | Error Recovery | 3 | QueryState surfaces the real error message, not a generic failure |
| 10 | Help and Documentation | 1 | 3-mo-avg explanation lives only in a hover-only `title` tooltip, screen-reader-unreachable |
| **Total** | | **24/40** | **Acceptable** |

## Design Specificity Verdict
Content is domain-specific (cleaning reports, cleaner fees, PHP/Asia-Manila) but the composition (KPI card grid + bordered list rows + sidebar) is generic-admin-template, indistinguishable from any vertical SaaS dashboard. Deterministic scan: `detect.mjs` exit 0, 0 findings — no repeated implementation-shortcut markers.

## Overall Impression
A comprehensive, honestly-computed morning-glance dashboard let down by presentation: the first thing an owner sees each morning can be four red down-arrows with no framing that they're a partial-month comparison, and the one number that matters most (data freshness) is the smallest, least prominent text on the page.

## What's Working
1. Every empty state has real explanatory copy ("Nobody in house by dates") instead of ambiguous blanks.
2. Errors render the actual message text, not a generic failure state.
3. The trailing 3-month comparison aligns elapsed days, not full months — careful domain modeling, just undiscoverable behind a hover-only tooltip.

## Priority Issues

**[P0] Stale freshness timestamp buried.** "Source updated" text can trail the header date by a day or more, shown in tiny gray footer text. Undermines the page's whole premise as a live daily-ops view. Fix: move into the header, escalate styling past a threshold. `/impeccable clarify`

**[P1] Readiness card gets no visual priority over purely informational cards.** An action-required "Unknown"/"Overdue" readiness state has identical card weight to the FYI "Current stay" card. Fix: distinct accent/position for action-required cards. `/impeccable clarify`

**[P1] "Open" action-list buttons measure 55×30px (DOM-confirmed, desktop and mobile).** Below the 44px touch-target minimum, on the page's primary action list. `/impeccable harden`

**[P2] Wall of red on first paint.** 4/6 KPIs can render alarm-red simultaneously mid-month with no "day N of 30" framing. Fix: inline period context. `/impeccable clarify`

**[P2] "P5" priority label is unexplained system vocabulary.** No legend anywhere on the page. `/impeccable clarify`

## Persona Red Flags

**Alex (Power User):** No refresh control, no shortcuts, no bulk action on the 2 low-stock rows; the careful 3-mo-avg math is locked behind a hover-only tooltip he'll likely never find.

**Sam (Accessibility):** State is never color-only (good), but the 3-mo-avg context is screen-reader-unreachable (native `title` attribute only); the 30px "Open" buttons fail the touch-target guideline.

## Minor Observations
Button variant drifts between outline/ghost for equivalent CTAs. KPI strip stays 2-column even at 375px mobile width, tight for longer PHP figures. "Calendar sync" and "Source updated" sit in one undifferentiated footer row despite carrying different freshness meanings.

## Questions to Consider
What if the freshness timestamp were the first thing seen, not the last? If everything is red, does red mean anything? Does "P5" need to exist as a user-facing label at all?

## Deterministic / Browser Evidence (Assessment B)
`detect.mjs` exit 0, 0 findings. No console errors (idle load or after theme toggle). Contrast sampled on 5 representative elements, all pass WCAG AA (lowest: 5.65:1 on the destructive-red delta text at 11px, still passing). Touch targets: "Open" buttons 55×30px (fails 44px height), P5 badges 23×15px (non-interactive status label, flagged per instructions as a possible false positive). No horizontal overflow at 375px (post-session's app-shell fix). Dark mode renders cleanly, no contrast regression.
