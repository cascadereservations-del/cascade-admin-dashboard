# Cascade Hideaway Admin

Two entry points live in this repository during the rollout (PRD section 11):

- `index.html` + `assets/` — the **new admin**, served at the repository root since 2026-09-14 (step 7). `legacy/index.html` / `legacy/index2.html` — the legacy single-file admin, kept reachable at `legacy/`.
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

New RPCs and tables live in `../stay-site/supabase/migrations/20260913*.sql` with pgTAP suites and a release contract. Applied to production on 2026-09-13 after a rehearsal on Alfred. The new admin is the default entry point at the root (built `dist/`, copied to `index.html` + `assets/`; `next/` still mirrors it); all six mutation modules are enabled in `app/src/lib/rollout.ts`. See `docs/RELEASE.md`.

## Documentation

`docs/PRD.md`, `docs/CONTRACTS.md`, `docs/METRICS.md`, `docs/TASKS.json` (30 packets and statuses), `docs/tasks/PXX.md`, `docs/evidence/PXX.md`, `docs/RELEASE.md`. Regenerate the tracker with `node docs/generate-tracker.mjs docs/PRD.md`.
