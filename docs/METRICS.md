# METRICS — definitions, periods, allocation and coverage (metrics.v1)

Implemented in `stay-site/supabase/migrations/20260913100000_admin_read_models_v1.sql` (`get_hospitality_metrics_v1`). Fixtures: `stay-site/supabase/tests/database/admin_read_models_v1.sql`.

## Shared rules
- Timezone Asia/Manila (`manila_today()`), currency PHP, ranges `[start, end_exclusive)`, nights `[check-in, checkout)`.
- Stay set = `admin_stays_v1`: Airbnb reservations (`confirmed`/`completed`; `cancelled` excluded) + direct bookings (`booking_inquiries` status normalised; `inquiry` never counts). Calendar `blocked` events are never sold nights.
- Historical metrics default through the last completed night (`endExclusive = today`). Future confirmed nights are a separate metric.
- Zero denominators return `value: null` with a warning. Missing ≠ zero.
- Totals are computed server-side before any pagination; ratios use aggregate numerators/denominators.

## Definitions
| Key | Formula | Basis | Coverage rule |
|---|---|---|---|
| capacity_nights | nights in period after `app_settings.operating_start_date` (fallback: earliest non-cancelled stay) | stay | complete |
| sellable_nights | = capacity (no reviewed owner-use/out-of-service classification exists yet); blocked nights reported as `blockedNights` | stay | partial when blocked nights > 0 |
| sold_nights | distinct calendar nights covered by a non-cancelled stay | stay | complete |
| occupancy | sold ÷ sellable × 100 | stay | missing when sellable = 0 |
| accommodation_revenue | Σ nightly allocations inside the period. Per stay: Airbnb = `airbnb_transactions.gross_earnings − cleaning_fee` when the export row exists, else `host_payout + host_service_fee`; direct = `total_amount`. Allocation even per night, rounding remainder on the earliest nights (`allocate_nightly_v1`) | stay | partial when any sold night has no amount (`excludedCount` = such nights) |
| adr | revenue ÷ covered nights | stay | partial if revenue partial; missing if no covered nights |
| revpar | revenue ÷ sellable nights, **withheld (null) when coverage is partial** | stay | as above |
| cash_received | confirmed income rows by transaction date: `airbnb_payout_email` + non-Airbnb sources | cash | complete |
| expected_payout | Σ host_payout of Airbnb stays checking out in period with no payout_date | accrual | complete |
| average_length_of_stay | Σ nights ÷ count of stays checking out in period (≤ today) | stay | missing when none |
| returning_guest_rate | guests (by guest_id) completing a stay in period with a prior completed stay ÷ guests completing a stay | stay | missing when none |
| cancellation_rate | cancelled ÷ (confirmed + completed + cancelled) with scheduled check-in in period | booking_cohort | missing when none |
| booking_lead_time | avg(check-in − `airbnb_transactions.booking_date`) over Airbnb bookings with a date | booking_cohort | partial when any lack a date |
| future_booked_nights | confirmed nights from today onward | stay | complete |

## Comparisons (INS03)
MTD/YTD compare against the same elapsed length one month/year earlier (`comparablePeriod` in `app/src/lib/dates.ts`). Labels state the comparison explicitly.

## Legacy findings mapping
- A01/A02: the reconciliation workbench shows both legacy bases beside `cash_received` and lists the row-level exceptions. Re-verified 2026-09-13: legacy ₱275,658.23 vs ledger ₱269,245.31 (moved since the PRD's ₱267,651.19); direct income excluded ₱1,780.00.
- A03: ADR uses accommodation revenue, never host payout alone; the basis per stay is exposed in the drill-down (`allocation`).
- A04: future nights never enter historical metrics.
- A05: one period contract for every metric in a response.
- A06: `expected_payout` is separate from `cash_received`; 3 reservations currently lack payout dates.
- A07: returning-guest rate joins by `guest_id`.
