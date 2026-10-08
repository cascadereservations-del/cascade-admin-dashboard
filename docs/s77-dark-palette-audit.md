# s77 - Calm-luxury dark palette and audit (admin + staff)

Session 77, lane L1. Branch `s77/palette` in both `admin-dashboard` and `Cascade-Staff`.
Scope: dark tokens only (light tokens byte-identical, see section 5), plus small safe QoL fixes.
Theme v2 (`DESIGN-cascade-ui-theme-2026-10-05.md` section 8) stays the authority for structure, type and light mode; this file supersedes its section 8.2 **dark** values only.

## 1. References and what makes them calm

| Reference | What it does | Taken |
|---|---|---|
| Material dark theme (m2.material.io/design/color/dark-theme) | Dark grey not black; elevation shown by lighter surfaces; desaturated accents so text stays AA | Elevation by lightness: `bg < card < muted`; accents and status colours desaturated |
| Apple HIG Dark Mode (developer.apple.com/design/human-interface-guidelines/dark-mode) | "Base" and "elevated" backgrounds; shadows are weak in dark so lighter colour carries depth | Cards keep no shadow in dark; a bigger card-on-bg step (1.07 to 1.10) instead |
| Linear 2024 UI refresh (linear.app/now/how-we-redesigned-the-linear-ui) | LCH-generated themes from base + accent + contrast; near-white text with a barely warm cast | Text `#ECE4D7` instead of `#F5EFE4`; one hue family for every neutral |
| The Ritz-Carlton system (shadcn.io/design/ritz-carlton) | Warm near-black, one muted antique gold used sparingly; scarcity is the luxury | Gold `#D7B377` to champagne `#D2B788`; gold leaves the hairlines (borders become neutral) |
| Aman (shadcn.io/design/aman) | Calm by subtraction: charcoal not black, no competing chroma | Lower chroma near-black `#12100D` (was a brown `#130E09`); quieter status washes |
| Things 3 dark / PostFinance / Virgin Money dark modes | Dark grey + tinted neutrals; several surface layers; solid colours for contrast control | Three surface layers, solid hex (no alpha) for every text-bearing surface |

Common thread: warm near-black with low chroma, depth from lightness rather than outlines, one restrained gold, text that is not pure white, and status colour as a quiet edge rather than a filled slab.

## 2. Diagnosis of the current dark mode (screenshots 1-5, 8 Oct)

1. **[P1] Loud warnings banner** (screenshot 1): `--warn-soft #3E2414` is a saturated rust slab, the most chromatic thing on the page, above the guest card. Fixed: wash `#2A2018` (near card tone) + a 1px edge in `--warn` at 24% (dark only).
2. **[P2] Gold outlines everywhere**: `--border rgba(215,179,119,.18)` puts a gold ring round every card, row, cell and warning, so nothing is special. Fixed: neutral warm hairline `rgba(236,228,215,.09)`; gold kept for `--hairline` decoration, the calendar bar, Today ring and the action colour.
3. **[P2] Brown cast on the canvas**: `#130E09` reads brown on OLED. Fixed: `#12100D` (same lightness, about a third of the chroma).
4. **[P2] Neon status chips**: salmon count badge `#F28B82`, orange `#F0A05A`, sky `#8FB7F5`. Fixed: desaturated `#E8A097`, `#E3AA7C`, `#A3BCE2`, `#93C2A0`; every pair now AAA (section 3).
5. **[P3] Calendar stay vs blocked**: wash `#3A2C18` vs `#28201A`. Now `#362C1D` vs `#28241F`: the stay stays gold-tinted, blocked is neutral; the gold bar and initial still carry the distinction.

## 3. Token set (both apps, same names as theme v2)

Staff `styles.css` (both dark guards) and admin `app/src/index.css` `.dark` carry identical values.

| Token (staff / admin) | Old dark | New dark |
|---|---|---|
| `--bg` / `--background` | `#130E09` | `#12100D` |
| `--card` / `--card`, `--popover` | `#1D1611` | `#1D1A16` |
| `--muted` / `--muted`, `--secondary` | `#28201A` | `#28241F` |
| `--border` | `rgba(215,179,119,.18)` | `rgba(236,228,215,.09)` |
| `--input` (admin) | `rgba(215,179,119,.24)` | `rgba(236,228,215,.14)` |
| `--fg` / `--foreground` | `#F5EFE4` | `#ECE4D7` |
| `--fg-2` / `--muted-foreground` | `#C3B5A3` | `#BBB0A1` |
| `--fg-3` | `#9A8C7B` | `#968B7D` |
| `--primary` | `#D7B377` | `#D2B788` |
| `--primary-fg` | `#2A1E0E` | `#231A0E` |
| `--primary-soft` / `--accent` | `#3A2C18` | `#362C1D` |
| `--ring` | `#E4C98F` | `#E2CB9E` |
| `--accent` / `--accent-bronze` | `#EAD3A3` | `#E2CC9F` |
| `--accent-text` / `--accent-bronze-text` | `#E4C98F` | `#DCC69C` |
| `--accent-soft` / `--accent-bronze-soft`, `--cream` | `#33291A` | `#2A241A` |
| `--hairline` | `rgba(215,179,119,.22)` | `rgba(210,183,136,.16)` |
| `--ok` / `--ok-soft` | `#84C79A` / `#1E3527` | `#93C2A0` / `#1A2820` |
| `--warn` / `--warn-soft` | `#F0A05A` / `#3E2414` | `#E3AA7C` / `#2A2018` |
| `--danger` (`--destructive`) / `--danger-soft` | `#F28B82` / `#44201D` | `#E8A097` / `#311D1A` |
| `--danger-btn-fg` / `--destructive-foreground` | `#44201D` | `#2A1512` |
| `--info` / `--info-soft` | `#8FB7F5` / `#1D2C44` | `#A3BCE2` / `#1C2330` |
| `--sidebar` / `--sidebar-accent` | `#0F0B07` / `#231A12` | `#0F0D0A` / `#211D18` |
| `--chart-1..5` | `#D7B377 #63C5C7 #8FB7F5 #84C79A #F28B82` | `#D2B788 #6FBDBE #A3BCE2 #93C2A0 #E8A097` |
| `--gilt` | `#EAD3A3 / #D7B377 / #C9963A` | `#E8D4AA / #D2B788 / #BF9447` |
| `theme-color` meta (staff, pay, admin + use-theme.tsx) | `#130E09` | `#12100D` |

### Contrast (WCAG 2.x, `node docs/s77-contrast.mjs`, exits 1 on any text pair under 4.5)

| Pair | Old dark | New dark | Verdict |
|---|---|---|---|
| fg on bg / card / muted | 16.77 / 15.62 / 13.99 | 15.05 / 13.74 / 12.22 | AAA |
| fg-2 on bg / card / muted | 9.56 / 8.90 / 7.97 | 8.90 / 8.12 / 7.22 | AAA |
| fg-3 on bg / card / muted | 5.86 / 5.46 / 4.89 | 5.69 / 5.19 / 4.61 | AA |
| primary-fg on primary (button) | 8.22 | 8.87 | AAA |
| primary on card / bg / primary-soft / muted | 9.02 / 9.69 / 6.83 / 8.08 | 8.97 / 9.83 / 7.08 / 7.98 | AAA |
| accent-text on card / accent-soft | 11.11 / 8.86 | 10.40 / 9.23 | AAA |
| ok on ok-soft / card | 6.66 / 9.04 | 7.65 / 8.64 | AAA |
| warn on warn-soft / card | 6.73 / 8.41 | 7.82 / 8.51 | AAA |
| fg on warn-soft (banner text) | 12.51 | 12.63 | AAA |
| danger on danger-soft / card | 5.98 / 7.48 | 7.50 / 8.18 | AAA |
| danger-btn-fg on danger (count badge) | 5.98 | 8.16 | AAA |
| info on info-soft / card | 6.86 / 8.73 | 8.14 / 8.95 | AAA |
| card on bg (surface step) | 1.07 | 1.10 | elevation |

Figures are the script output for the final values. Hairline borders are decoration, not component boundaries; input edges use `--border-strong` / `--input`.

## 4. Audit (impeccable audit method, both apps)

Scope: staff app rendered on a local fixture of the real classes (sign-in needs live data), admin built (`npm run build`) and served from `dist/`; sign-in viewed at 375 and 1280 px in dark and light. Signed-in admin screens were audited in code only.

| # | Dimension | Score | Key finding |
|---|---|---|---|
| 1 | Accessibility | 3 | Two light-mode text colours under AA in admin (amber-600 3.2:1, emerald-600 3.8:1) - fixed |
| 2 | Performance | 3 | Fine for scope; Google Fonts + one self-hosted Cormorant preload |
| 3 | Responsive | 3 | Admin `CopyButton` is 28 px (under 44 px touch) |
| 4 | Theming | 3 | Full token system; three Tailwind palette colours bypassed tokens - fixed |
| 5 | Implementation integrity | 3 | Detector flagged gilt wordmark text and the 4px calendar stay bar - both deliberate (theme v2 8.4/8.5), false positives in context |
| | **Total** | **15/20** | Good |

Findings by severity:
- **[P1] Loud dark warnings banner** - staff `styles.css` tokens + dark-only `.warnline` edge. **Shipped.**
- **[P1] Light-mode contrast under AA (admin)** - `guest-detail-page.tsx` "check format" (`text-amber-600`) and `inventory-page.tsx` trend (`text-emerald-600`) to `text-warn` / `text-ok`; `id-photos.tsx` warn tile to `border-warn/60 text-warn`. **Shipped** (light colour changes here are contrast fixes, not regressions).
- **[P2] Gold outline on every surface; brown canvas; neon status** - tokens. **Shipped.**
- **[P2] Finance / OPS chips open telegram.org** (screenshot 5) - `LINKS.tgOps/tgFinance` are `https://t.me/c/<id>`; on Android that opens a Custom Tab on telegram.org when the app does not claim the link. Recommend `tg://privatepost?channel=<id>&post=<last>` or the group's invite link (`t.me/+...`). **Not shipped**: `app.js`, outside this lane.
- **[P2] Cassy row repeats "Open in Telegram"** (screenshot 1) as both the subtitle and the expanded caption. Drop the caption or change the subtitle to "Finance, OPS, quick guide". **Not shipped**: `app.js` markup.
- **[P3] Admin CopyButton 28 px target** - wrap with a 44 px hit area if it moves to mobile tables. Not shipped (table layout risk).
- **[P3] `quick/index.html` dark `theme-color` still `#130E09`** - one-character difference, owned by L5.

Positive: one action colour, status always glyph + label, `lining-nums` handled, focus rings tokenised, reduced motion honoured, sheets and badges token-driven.

## 5. Light mode does not regress

The `:root { ... }` light block hashes are identical before and after in both files (md5 of the block: staff `c8cba884...`, admin `bb9df4a1...`). Every new staff rule is behind the dark guards. In the admin, only the three AA fixes above change light rendering.

## 6. Screenshots

`docs/s77-shots/`: `staff-dark-before.jpg`, `staff-dark-after.jpg`, `staff-light-after.jpg` (fixture with a sample name, real CSS), `admin-signin-dark-after-375.jpg`, `admin-signin-dark-after-1280.jpg`.

## 7. Proposal (not built): a named sign-in per person

Today the owner side signs in as a shared account whose display name is "admin", so the staff app greets "Good morning, admin" and every audit row says "admin". Give each person who runs the house (Lloyd, and the owner) their own Supabase auth user and `staff` row with a real `display_name` and role `owner`/`admin`, add them to the sign-in name list the same way cleaners are listed, move the authenticator (aal2) enrolment to each person, then disable the shared account once both have signed in once. The greeting, the ledger `created_by`, Telegram host notices and the D-317 "host replied" hold would then name the actual person at no extra cost (free tier, existing RPCs), and a lost phone means revoking one person rather than rotating the only admin password.
