// Regenerates docs/PRD.md (with the design correction), docs/TASKS.json,
// docs/tasks/PXX.md, docs/evidence/PXX.md and the build workflow.
// Run from the repository root: node docs/generate-tracker.mjs [path-to-prd.txt]
import fs from 'node:fs';
import path from 'node:path';

const prdPath = process.argv[2] ?? 'docs/PRD.md';
const raw = fs.readFileSync(prdPath, 'utf8');
const marker = '# Cascade Hideaway Admin Modernisation';
const body = raw.slice(raw.indexOf(marker));
const correction = `> **Design direction (2026-09-13, overrides earlier mockup references).** Primary visual reference is https://apex-shadcn.dashboardpack.com/ : its application shell, grouped navigation, typography, spacing, cards, tables, filters, charts and detail panels, reduced to Cascade's real tasks. Use current shadcn/ui components. Mahogany and champagne are restrained accents on clean neutral working surfaces. The earlier React "Command Center" mockup is NOT a visual reference or frontend starting point; its layouts, styling and components are not reused. Existing business logic may be reused only after verification.
>
> Saved verbatim from the execution brief of 2026-09-13. Baseline reverification of the dated audit findings is in docs/evidence/P01.md and P02.md.

`;
fs.writeFileSync('docs/PRD.md', correction + body);

const P = [
  ['P01', 'Current-state and migration evidence manifest', [], 'done', 'Every reused object classified as deployed, local-only or missing (docs/evidence/P01.md).'],
  ['P02', 'Baseline analytics audit fixtures', ['P01'], 'done', 'A01-A06 reproduced with documented read-only queries; values re-verified 2026-09-13 (evidence/P02.md).'],
  ['P03', 'Metric definitions and typed contracts', ['P02'], 'done', 'docs/METRICS.md + app/src/types/contracts.ts + get_hospitality_metrics_v1 with boundary/coverage fixtures in pgTAP.'],
  ['P04', 'React/Vite build and test foundation', ['P01'], 'done', 'npm run typecheck, vitest (13 tests), vite build, legacy tests (4) all pass.'],
  ['P05', 'Authentication and capability adapter', ['P04'], 'done', 'current_staff_access() + aal mirror; capability tests pass. Role/MFA/disabled/revoked states render.'],
  ['P06', 'Cascade shell, navigation and responsive layout', ['P05'], 'done', 'Sidebar/off-canvas shell, command palette, apps menu, theme. Verified in browser at 640px and 1280px (signed-out).'],
  ['P07', 'Shared tables, forms, filters and errors', ['P06'], 'done', 'DataTable, FilterBar, URL state, QueryState (loading/empty/error/forbidden/unavailable/retry).'],
  ['P08', 'Canonical booking/calendar read model', ['P03', 'P05'], 'done', 'mergeStays() with 7 unit tests; admin_stays_v1 SQL read model.'],
  ['P09', 'Hospitality metric service', ['P08'], 'written_untested', 'get_hospitality_metrics_v1 + pgTAP fixtures written; NOT executed (no local Postgres). Needs rehearsal DB run.'],
  ['P10', 'Today overview and action queue', ['P07', 'P08', 'P09'], 'written_untested', 'get_admin_overview_v1 + Today page; renders once migration applied. Unavailable state verified by design.'],
  ['P11', 'Booking list/calendar/detail', ['P08', 'P07'], 'done_local', 'List, calendar, inquiries, detail pages typecheck and build; cross-channel journey needs signed-in browser test.'],
  ['P12', 'Booking decision/change adapter', ['P11'], 'done_local', 'decide_direct_booking + record_booking_lifecycle_action wired with idempotency keys; concurrency guaranteed by the deployed RPC advisory lock.'],
  ['P13', 'Cleaning register and evidence detail', ['P07', 'P08'], 'done_local', 'Register with fee columns gated by read_finance; photos listed by submission_id folder.'],
  ['P14', 'Cleaning review and readiness', ['P13'], 'written_untested', 'review_property_readiness_v1 refuses ready with open blockers; override needs reason + manage_operations.'],
  ['P15', 'Work orders and notices', ['P14'], 'written_untested', 'work_orders + save_work_order_v1; ops_notices audience/expiry; expiry excluded in overview.'],
  ['P16', 'Inventory baseline and movement compatibility', ['P01', 'P05'], 'written_untested', 'reconcile_inventory_baseline_v1, record_inventory_usage v2, pgTAP 10+5-3=12 replay fixture written.'],
  ['P17', 'Inventory catalogue, counts and usage', ['P07', 'P16'], 'done_local', 'Catalogue via get_inventory_catalogue_v1, counts sheet with variance preview.'],
  ['P18', 'Purchasing and shopping list', ['P17'], 'written_untested', 'inventory_shopping_list proposed -> approved -> received via record_inventory_receipt_v1.'],
  ['P19', 'Guest profile and identity review', ['P07', 'P08'], 'written_untested', 'guest_profile_details + save_guest_profile_v1 (version check) + preview/merge with shared-contact rule.'],
  ['P20', 'Guest timeline and follow-ups', ['P19'], 'written_untested', 'get_guest_timeline_v1 (finance-filtered), follow_up_tasks, Messenger PSID surfaced with copy.'],
  ['P21', 'Finance source reconciliation workbench', ['P02', 'P07'], 'done_local', 'Reconciliation page lists A01/A02/A06 exceptions row by row beside the server cash_received metric.'],
  ['P22', 'Accounts, journals and posting engine', ['P05', 'P21'], 'written_untested', 'post_journal_v1/reverse_journal_v1 with balance, idempotency, one-event, immutability trigger; pgTAP fixtures written.'],
  ['P23', 'Opening-balance setup', ['P22'], 'written_untested', 'save/approve_opening_balances_v1 refuse unbalanced batches with the difference.'],
  ['P24', 'Simple finance forms and source mappings', ['P22', 'P23'], 'written_untested', 'prepare_simple_entry_v1 (13 kinds) + SimpleEntryForm; PRD fixtures encoded in pgTAP.'],
  ['P25', 'Stock valuation and fixed assets', ['P18', 'P24'], 'written_untested', 'acct_fixed_assets, run_depreciation_v1 (skips assets missing inputs), WA stock cost + post_consumable_usage_v1.'],
  ['P26', 'Statements and monthly close', ['P24', 'P25'], 'written_untested', 'get_financial_statement_v1 (9 statements), close with identity checks and immutable snapshot, owner reopen.'],
  ['P27', 'Insights, budgets and explanations', ['P09', 'P26'], 'done_local', 'Insights page with equivalent-period comparison, deterministic explanations, drill-down; budgets via budget:<code> targets.'],
  ['P28', 'Owner exports and print layouts', ['P26', 'P27'], 'partial', 'CSV (Papa, formula-escaped, header block) and print for statements/transactions. XLSX and PDF not built.'],
  ['P29', 'Staff settings, integration health and audit UI', ['P05', 'P15', 'P20', 'P26'], 'done_local', 'Staff via staff-users function, health from heartbeats/sync/e-mail/integrity, audit from staff_access_audit.'],
  ['P30', 'Cross-app acceptance and rollout package', ['P10', 'P11', 'P12', 'P13', 'P14', 'P15', 'P16', 'P17', 'P18', 'P19', 'P20', 'P21', 'P22', 'P23', 'P24', 'P25', 'P26', 'P27', 'P28', 'P29'], 'blocked', 'Needs: migration applied to a rehearsal DB, pgTAP run, signed-in browser journeys, Playwright suite, accessibility pass. See docs/RELEASE.md.'],
];

const legend = {
  done: 'implemented and verified locally',
  done_local: 'implemented; typecheck/build pass; runtime needs a signed-in session against the applied backend',
  written_untested: 'code written; depends on the un-applied backend release or an unrun pgTAP suite',
  partial: 'part of scope delivered',
  blocked: 'cannot proceed without an external step',
};
fs.writeFileSync('docs/TASKS.json', JSON.stringify({ updated: '2026-09-13', legend, packets: P.map(([id, title, dependsOn, status, evidence]) => ({ id, title, dependsOn, status, evidence })) }, null, 2) + '\n');
fs.mkdirSync('docs/tasks', { recursive: true });
fs.mkdirSync('docs/evidence', { recursive: true });
for (const [id, title, deps, status, evidence] of P) {
  fs.writeFileSync(path.join('docs/tasks', `${id}.md`), `# ${id} - ${title}

- Depends on: ${deps.join(', ') || 'none'}
- Status: ${status}
- Requirement IDs: see PRD section 10 row ${id}.
- Allowed files: admin-dashboard/app/src/** for UI packets; stay-site/supabase/{migrations,tests/database,releases,rollbacks}/** for backend packets. stay-site is the only migration authority.
- Context files: docs/PRD.md, docs/CONTRACTS.md, docs/METRICS.md, docs/evidence/P01.md.
- Validation: npm run check (typecheck + vitest + legacy tests + build); pgTAP suites in stay-site/supabase/tests/database on a rehearsal copy.
- Rollback: revert the packet commit; backend packets use stay-site/supabase/rollbacks/20260913_admin_modernisation_backend.sql (refuses once journals or movement-controlled items exist).
`);
  const evidencePath = path.join('docs/evidence', `${id}.md`);
  if (!(fs.existsSync(evidencePath) && (id === 'P01' || id === 'P02'))) {
    fs.writeFileSync(evidencePath, `# ${id} evidence

Status: **${status}**

${evidence}

Commands run 2026-09-13 (admin-dashboard): npm run typecheck (clean), npx vitest run (13 passed), npx vite build (built), npm run test:legacy (4 passed). Backend: release contract validated with release-safety.mjs (contract valid). pgTAP suites written, not executed.
`);
  }
}
fs.mkdirSync('.github/workflows', { recursive: true });
fs.writeFileSync('.github/workflows/build-admin.yml', `# Builds the new admin and uploads ONLY the build output plus the legacy entry
# points (PRD section 8). Publishing to Pages is a deliberate later step
# (rollout step 7); until then the legacy index.html at the root stays served.
name: Build admin (dist only)
on:
  push:
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run check
      - run: mkdir -p dist/legacy && cp index.html dist/legacy/index.html && cp index2.html dist/legacy/index2.html
      - uses: actions/upload-artifact@v4
        with:
          name: admin-dist
          path: dist
`);
console.log('generated', P.length, 'packets');
