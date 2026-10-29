# RC-3b final-tip evidence matrix

**Source candidate:** `7d5d872f35c1a7d9122d484f5eef0e429d0c5d7e` (final integration tip; migrations 00868–00895)  
**Date:** 2026-10-28–29  
**Scope:** Evidence-only rerun. No application code, tests, config, or bundle budgets changed. Raw logs and screenshots are stored under `/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-2355/`.

## Results at a glance

| Gate | Result |
|---|---|
| G1 build/type/lint | Partial: Turbo build and both type-checks passed; lint had 0 errors/254 warnings; admin build failed on missing `@patina/api-client`. |
| G2 Jest/Supabase | Jest: 984 passed, 15 failed; Supabase: 2,097 passed, 12 skipped. |
| G3 legacy Chromium | Blocked before collection by the `help-state` port guard on owned API 57321; no tests ran. No workaround/retry, per steering. |
| G4 Round-8 Chromium + WebKit-iPhone | 200 passed, 10 failed, 4 skipped (214 total; 39.3m). |
| G5 bundle budget | Passed. `/desk` and `/doc/[id]` both below budget. |
| RC-2 consumer journey | Passed: both journeys; 10/10 legs; isolated stack cleanup census passed. |
| Accessibility probes | 14 viewport checks, two 200% CSS-zoom checks and two reduced-motion checks completed. No axe package or screen-reader pass. |

## G1 — build, type-check, lint

Commands:

- `pnpm exec turbo run build --filter=@patina/designer-portal^...`
- `pnpm --filter @patina/designer-portal type-check`
- `pnpm --filter @patina/designer-portal lint`
- `pnpm --filter @patina/supabase type-check`
- `pnpm --filter @patina/admin-portal build`

The initial Turbo invocation could not find `turbo` because this worktree lacked `node_modules`. `pnpm install --frozen-lockfile --offline` completed; the rerun built all 6 tasks successfully. Designer and Supabase type-checks passed. Designer lint completed with 0 errors and 254 warnings. Admin build failed: `Module not found: Can't resolve '@patina/api-client'` (import trace `src/services/orders.ts` → `src/app/(dashboard)/orders/page.tsx`). No code or package files were changed to address the failure.

## G2 — full Jest and Supabase tests

- `pnpm --filter @patina/designer-portal exec jest --runInBand`: 985 suites, 1 failed and 984 passed; 14,159 tests, 15 failed and 14,144 passed; 1 snapshot passed. All 15 failures were in paper/resume cases and reported `TypeError: useServiceAcceptance is not a function`. No SIGSEGV occurred; no retry was run.
- `pnpm --filter @patina/supabase test`: 149 files passed; 2,097 tests passed and 12 skipped (2,109 total).

## G3 — legacy Chromium

Attempted the four legacy specs on the owned stack (API 57321 / DB 57322), Chromium, one worker:

`pnpm --filter @patina/designer-portal exec playwright test e2e/document/quiet-responsive-shell.spec.ts e2e/document/margin-handoffs.spec.ts e2e/document/desk-error-state.spec.ts e2e/document/pieces-build-room.spec.ts --config playwright.config.ts --project=chromium --workers=1`

Collection stopped before tests ran. `e2e/helpers/help-state.ts:19–23` accepts only local Supabase port 54321 and refused the authorized owned API URL `http://127.0.0.1:57321`. This is a harness block; no G3 tests ran. Per coordinator instruction, no test/config edit, port spoof, shared-stack access, or retry was attempted.

SQ-2236's G3 baseline was 13 passed, 2 failed, 1 skipped and 3 not run (19 total), including two flaky cases. This run cannot establish whether those cases changed because the guard prevented collection.

## G4 — full Round-8 Chromium and WebKit-iPhone

Command:

`pnpm --filter @patina/designer-portal exec playwright test e2e/round8 --config playwright.round8.config.ts --project=chromium --project=webkit-iphone --workers=1`

Ran against the isolated local API 57321 / DB 57322. Result: **200 passed, 10 failed, 4 skipped (214 total; 39.3 minutes)**. No retry was run.

| Failure | First distinguishing observation | Classification and SQ-2236 delta |
|---|---|---|
| Chromium `configured-placement.spec.ts:242`, “sourcing-result Place fills the Throughout placeholder from the native Library handoff” | Expected textbox `New line in Throughout` was not found within 60s after opening the `/pieces?lens=rough&room=throughout` route. The matching WebKit-iPhone case passed. | New observation outside the prior failure table; Chromium-only handoff/route assertion failure. |
| Chromium and WebKit-iPhone `scale-profile.spec.ts:125` at 36, 80, 500, and 2,000 lines (8 failures) | Each `native baseline completeness and stable-ID interaction checks` assertion reported `Silent truncation: DB N, fetched 0, rendered N` (N = 36/80/500/2000). | New scale-profile cases not present in the SQ-2236 table; test-observed completeness failures. Cause is not inferred. |
| WebKit-iPhone `rc4b-presentation.spec.ts:34`, job band at 320px | 60s timeout while setting up `authenticatedPage`; the page/context/browser closed during auth retry. | New WebKit authentication/setup timeout, not in SQ-2236's failure table. |

**Prior G4 failures now observed differently:**

- Both `accounts-paper` native invoice/payment tests passed in Chromium and WebKit-iPhone; the SQ-2236 hard-coded expectation for API port 54321 is no longer a failure on the owned port 57321.
- The previously failing WebKit-iPhone FF&E reload, embedded Spec layout, pending-save Back, and failed-save Back cases passed. The separate “Back to the desk over a failed Spec save is held, then goes on to the desk once it lands” case is explicitly skipped in this run, not counted as fixed.
- The previously failing Library-through-More/Find and keyboard Find-to-Measured-rooms route cases passed in both projects.

Four explicit skips were reported: the WebKit-iPhone failed-save Back/then-goes-to-desk case; two WebKit-iPhone paper-frame contents tests; and the desktop ghost-phase underline case under WebKit-iPhone. No did-not-run tests were reported.

The SQ-2236 G4 baseline was 67 passed, 13 failed, 2 skipped and 2 did not run (84 total). The broader present run has 214 tests; comparison above is per previously failing named case, not a same-size-suite comparison.

## G5 — Round-8-on production bundle budget

Command (Round-8 flags on):

`NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live NEXT_PUBLIC_FLAG_OVERRIDES='designer-paper-round8:true,one-voice:true,worktable:false,agreement-parts:true,agreement-library:true,design-build:true,studio-workspaces:true' ANALYZE=true pnpm --filter @patina/designer-portal analyze && node scripts/bundle-budget.mjs apps/designer-portal/.next`

| Route | Measured / budget | Result |
|---|---:|---|
| `/desk` | 1,282,390 / 1,346,026 bytes; 62 chunks | 63,636 bytes under |
| `/doc/[id]` | 1,682,850 / 1,690,757 bytes; 73 chunks | 7,907 bytes under |

Budget command passed. `crypto-browserify`: 0 modules/chunks. Lucide: 142/200 icon limit. Against SQ-2236, `/desk` decreased by 19,093 bytes and `/doc/[id]` decreased by 18,501 bytes; the prior 10,594-byte `/doc/[id]` overage is no longer present in this measurement. No budget waiver or change was made.

## RC-2 consumer journey rerun

**Passed: 2/2 default journeys; all 10 legs exited 0.** The sanitized receipt recorded the required HEAD, owned local API/DB 57321/57322, a DB system identifier distinct from the shared DB, `EMAIL_DEV_MODE=dry_run`, no provider key names, and scope editions off at start.

| Journey leg (assertion) | Run 1 | Run 2 |
|---|---|---|
| `@rc2-send` drafts against the agreed edition/evidence set and sends through V22 | Passed | Passed |
| `@rc2-return` client returns request with a reason; viewing alone records nothing | Passed | Passed |
| `@rc2-resend` revised evidence is sent and successor supersedes open request | Passed | Passed |
| `@rc2-accept` required signer acceptance is held; client accepts with a condition | Passed | Passed |
| `@rc2-complete` service completes, condition resolves, care return occurs, and request revokes | Passed | Passed |

Runner result: `PASSED`. Teardown census: `supabase stop --no-backup` exited 0; 0 containers and 0 volumes left. Logs are under `verification/SQ-2355/rc2-consumer-journey/`.

## Accessibility probes and limits

The ad-hoc Playwright probes used the owned API, Round-8 flags, desk and job paper at widths 320, 1179, 1180, 1181, 1439, 1440, and 1441px; both surfaces at 200% CSS zoom and with `prefers-reduced-motion: reduce`. At all 14 widths, the document width matched the viewport, horizontal overflow was false, the first tab stop was visible with a focus indicator, and no tested controls were clipped. Both reduced-motion cases had no overflow or clipped controls and had visible keyboard focus. At 200% CSS zoom, overflow remained false, but `Skip to main content` was clipped on both surfaces and `Account and settings` was also clipped on job paper. Screenshots and per-case measurements are under `verification/SQ-2355/accessibility/`.

`@axe-core/playwright` did not resolve (`MODULE_NOT_FOUND`); no package was installed and no axe result is claimed. No screen-reader/VoiceOver pass was done. The first ad-hoc login attempt failed before probes; the diagnostic retry authenticated and completed the measurements. The diagnostic was outside the repo and changed no application files.

## Owned-stack teardown

The G4 stack was stopped with `supabase stop --workdir <owned workdir> --no-backup`; listeners on 3420, 57321, and 57322 were absent afterward. The RC-2 runner completed its own teardown: `supabase stop --no-backup` exited 0 and its census found 0 containers and 0 volumes left.

## Verification artifacts

Raw G1/G2/G3/G4/G5 logs, Playwright reports, and probe screenshots are in `/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-2355/`. The prior comparison is `docs/design/designer-portal-round8/evidence/rc/rc3-browser-matrix.md` (SQ-2236). Final pinned verifier: `test -s docs/design/designer-portal-round8/evidence/rc/rc3b-final-tip-matrix.md`.
