# Cascade Hideaway Admin

Two entry points live in this repository during the rollout (PRD section 11):

- `index.html` / `index2.html` — the **legacy** single-file admin, still the served page.
- `app/` — the **new** React + TypeScript + Vite + shadcn/ui admin, built to `dist/`.

## Run the new admin locally

```bash
npm install
npm run dev
```

Open http://localhost:5178. Sign in with a staff name (or e-mail) and password; the owner is offered the authenticator code step, which unlocks finance and staff settings (`aal2`).

## Verify

```bash
npm run check
```

Runs typecheck, vitest unit tests, the four legacy tests and a production build. `npm run test:e2e` runs Playwright once browsers are installed (`npx playwright install`).

## Backend

New RPCs and tables live in `../stay-site/supabase/migrations/20260913*.sql` with pgTAP suites and a release contract. They are **not applied** yet; screens that depend on them show an explicit "backend interface not deployed" state. See `docs/RELEASE.md`.

## Documentation

`docs/PRD.md`, `docs/CONTRACTS.md`, `docs/METRICS.md`, `docs/TASKS.json` (30 packets and statuses), `docs/tasks/PXX.md`, `docs/evidence/PXX.md`, `docs/RELEASE.md`. Regenerate the tracker with `node docs/generate-tracker.mjs docs/PRD.md`.
