# Verification plan and preparation evidence

The commands below are for the later implementation phase unless explicitly labelled as preparation results. Source inspection does not establish current runtime health. WP-00 captures that baseline before teams attribute failures to the redesign.

## Real gates

Current manifests/configs at `ee9c450a5` were inspected. Designer `build` ignores TypeScript errors; explicit `type-check` is mandatory. Jest global coverage thresholds are zero, so a successful coverage command alone is not a coverage guarantee. Re-read scripts/configs at execution time.

Run from the assigned worktree after `scripts/bootstrap-worktree.sh` and the necessary dependency builds. Load the applicable testing/local-dev/DB/edge/iOS skills. Use one named local stack owner; fixture suites mutate data. Config-owned servers must point at the intended worktree, local database, flags and port. No tests below are permission to run against Strata.

```bash
pnpm --filter @patina/designer-portal type-check
pnpm --filter @patina/designer-portal lint
pnpm --filter @patina/designer-portal build
```

For implementation slices, use `pnpm verify:affected -- <base-sha> <head-sha>` in addition to the explicitly relevant gates; it rebuilds dependencies for affected workspaces. It may select broad app checks even for an app-local documentation edit, so label the actual scope and outcomes. Use the narrow tests relevant to each diff, then integrate the touched journeys. Existing entry points:

```bash
pnpm --filter @patina/designer-portal exec jest --runInBand --runTestsByPath \
  src/lib/document/__tests__/contrast.test.ts \
  src/lib/document/__tests__/authority-hours.test.ts

pnpm --filter @patina/designer-portal exec playwright test \
  e2e/document/quiet-responsive-shell.spec.ts \
  e2e/document/margin-handoffs.spec.ts \
  e2e/document/desk-error-state.spec.ts --project=chromium --workers=1

pnpm --filter @patina/designer-portal exec playwright test \
  e2e/document/pieces-build-room.spec.ts --config playwright.pieces.config.ts
pnpm --filter @patina/designer-portal exec playwright test \
  e2e/document/hours.spec.ts --config playwright.hours.config.ts
pnpm --filter @patina/designer-portal exec playwright test --config playwright.buying.config.ts
pnpm --filter @patina/designer-portal exec playwright test --config playwright.agreement.config.ts --project=chromium
pnpm --filter @patina/designer-portal exec playwright test --config playwright.design-build.config.ts --project=chromium
pnpm --filter @patina/designer-portal test:e2e:library
```

Prefer a dedicated config that inherits the base when adjusting test flags/ports. The base `playwright.config.ts` contains local demo credentials that the staged-file secret scanner flags when the whole file is scanned; dedicated configs document this trap. Do not casually edit it or weaken the scanner for visual work. `reuseExistingServer` can also reuse the wrong worktree/flag set; verify ownership.

Agreement `*.agreement.pw.ts` and design-build `design-build.pw.ts` files use dedicated configs and are not evidence from a default-suite pass. Buying defaults to port 3400; Pieces to 3410; Hours has its own override. Library tests deliberately use Chromium/one worker because shared actors can race. Existing document tests include historical skips; inventory them rather than counting a skipped browser as passed.

Additional evidence entry points: `e2e/document/plan-room.spec.ts`, `room-view.spec.ts`, `spec-book-workspace.spec.ts`, `lens-density.spec.ts`, `lens-band-height.spec.ts`, `lens-rail-budget.spec.ts`, `lens-cls.spec.ts`, `lens-reduced-motion.spec.ts`, `lens-a11y.spec.ts`, `lens-contrast.spec.ts`, `quiet-focus.spec.ts`, `mobile-margin-sheet.spec.ts`; `e2e/field/field-coordination.spec.ts`. Audit each assertion against the new acceptance IDs. `commission-walk.spec.ts` currently exercises a picker/interstitial, not the entire cabinet lifecycle.

## Domain gates

- Supabase hook/type changes: affected package type/unit tests and consuming portal gates; canonical query invalidation assertions and an authenticated local data walk.
- Schema/RPC/RLS changes: additive migration replay on a known local stack, focused SQL positive/negative/concurrent cases, regenerated DB types, consumer compatibility and actual row/RPC evidence. Search later function definitions before relying on an older migration. No hand-edited generated types or fixed migration numbers in advance. SQL suites use `psql` with `ON_ERROR_STOP=1`; any `SUPABASE_DB_URL` supplied to a suite must be verified as localhost before execution, without printing credentials.
- Retained service changes: the affected service's `build` is its real type gate; verify relevant tests and possible shadowing compiled `.js` siblings. Do not add a new NestJS service.
- Shared dist-resolved packages: build the affected package and check consumers; admin's strict build catches breaks designer build can miss. Verify each package's `main` rather than assuming transpilePackages means source resolution.
- Client/Field/iOS changes: use their actual configs/gates and approved local profiles. Include old-consumer behavior for new artifact kinds and fields.
- Send/authority changes: run the applicable policy and domain tests; preserve V22 and delivery-truth semantics.

All live-data checks must disable the designer's mock fallback where present (`NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`). A successful render with fallback data is not proof. Capture RPC/row evidence for business claims without exposing credentials or real client content.

## Bundle and quality policy

The current checked-in bundle budgets in `scripts/bundle-budget.config.json` are 1,346,026 summed gzip bytes for `/desk`, 1,687,684 for `/doc/[id]`, and at most 200 Lucide icon modules. These are existing tripwires, not desirable performance targets or guarantees of actual LCP. Do not increase them to hide a regression. Measure using a local/CI measuring profile, never deploy that profile:

```bash
pnpm exec turbo run build --filter=@patina/designer-portal^...
ANALYZE=true pnpm --filter @patina/designer-portal analyze
node scripts/bundle-budget.mjs apps/designer-portal/.next
```

Existing policy commands:

```bash
node scripts/policy/check-send-authority.mjs
node scripts/policy/check-model-names.mjs
```

Current `ai-quality-gate.yml` covers PRs to main, with affected checks and bundle measurement, and supports manual branch dispatch. Manual runs skip the PR-only bundle step, so measure it explicitly; `policy-quality.yml` covers PRs and main pushes. Integration/nightly workflows are not guaranteed on ordinary PRs. A PR into the redesign branch must carry the required manual/local evidence; a green badge is not a substitute. The older skill paragraph claiming no CI quality gates is stale. `integration.yml` supports manual `ref` input and checks out that branch/commit for local Supabase/SQL/edge and portal E2E; use its documented local setup and record skips/actor prerequisites. Neither workflow dispatch is performed by this documentation preparation.

## Preparation results — no implementation claims

- Source baseline and approved artifact commit recorded in README.
- Three read-only planning contexts inspected architecture, domain contracts and design/test seams; their findings are integrated here.
- Round-eight reference and earlier linked review history carried into the branch unchanged; `evidence/reference-manifest.json` records their hashes.
- A separate Claude Code review of this handoff is stored under `review/`; response/disposition is recorded in PREPARATION-RECORD.md.
- Preparation checks validate local documentation links, referenced source files, frozen reference hashes, changed path boundaries and whitespace. Exact static counts/results are in `evidence/preparation-checks.json`; source/reference path lists and hashes are in its linked input manifests. Review disposition and gate commands are in PREPARATION-RECORD.md.

No app build, browser application walk, database replay, production status probe or deployment was run for this documentation-only preparation. The prior mockup browser checks are in its own VERIFICATION.md and must not be presented as production evidence.
