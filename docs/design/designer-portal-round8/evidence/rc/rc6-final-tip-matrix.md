# RC-6 final-tip gate matrix (G1–G5)

**Gated tip:** `c066bc47a9978f270b7da50a266b263ed826466c` (branch `r8-integrate`). While these gates ran, the parallel SQL agent committed `e48533d88` on top (`docs(us-52): record the RC-6 final-tip SQL, edge and lock gate`, one new file `rc6-final-tip-sql.md`). It only adds docs, so the code tree under test is the same at both SHAs.
**Date:** 2026-10-28–29
**Scope:** This run only produced evidence. No product code, test, `playwright.config.ts`, migration or bundle budget was changed, and no harness fix was needed.
**Stack:** owned local Supabase project `patina-final`: API `127.0.0.1:57321`, DB `57322`, shadow `57320`, pooler `57329`, studio `57323`, inbucket `57324`, analytics `57327`, edge inspector `57383`. It was started from a scratch copy of this worktree's `supabase/` with only the five `.temp` version pins (gotrue v2.196.0, postgres 17.6.1.063, rest v14.5, storage v1.73.1, storage-migration `objects-null-version-index`), using `supabase start --workdir <scratch>/stack -x studio,mailpit,logflare,vector,edge-runtime,imgproxy,postgres-meta` (CLI 2.120.0). 825 migrations were applied, the highest numbered one being `00899`. DB system identifier `7701945529003462698`. The shared 54321/54322 stack was never touched.
**Raw logs:** `/private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad/rc6.NR8dk6/logs/` (cited as `logs/`). These are session-scoped and may not survive a session restart.

## Results at a glance

| Gate | Result |
|---|---|
| G1 designer type-check / lint | Pass. Lint: **0 errors, 250 warnings** (RC-3c had 254). |
| G1 admin build (`turbo`) | Pass. `Tasks: 8 successful, 8 total` (7 cached; admin-portal itself was a cache miss and built). |
| G1 `@patina/supabase` | Type-check pass. `Test Files 151 passed (151)`, `Tests 2122 passed \| 12 skipped (2134)`. |
| G1 `@patina/client-portal` | Type-check pass. `Test Suites: 195 passed, 195 total`, `Tests: 3406 passed, 3406 total`. Coverage floors pass; see below. |
| G2 designer Jest | **`Test Suites: 986 passed, 986 total`, `Tests: 14186 passed, 14186 total`**, 1 snapshot, 297.5 s |
| G3 legacy (Chromium) | **18 passed, 1 skipped (fixme), 0 failed** (2.9 m) |
| G3 pieces config | 40 passed, 33 skipped (WebKit by design), 1 failed. The failure is **flaky**: it passed when rerun alone. |
| G4 round-8 matrix | **239 passed, 1 failed, 4 skipped** (244 tests, 39.8 m). The 1 failure is **flaky**: it passed when rerun alone. |
| G4 scale-profile | 36, 80, 500 and **2,000** lines pass on both projects |
| G5 bundle | **Pass.** `/desk` 1,282,511 / 1,346,026. `/doc/[id]` 1,682,981 / 1,690,757. |

## G1

```
pnpm --filter @patina/designer-portal type-check                       # exit 0
pnpm --filter @patina/designer-portal lint                             # exit 0, "✖ 250 problems (0 errors, 250 warnings)"
pnpm exec turbo run build --filter=@patina/admin-portal                # exit 0, "Tasks: 8 successful, 8 total"
pnpm --filter @patina/supabase type-check && pnpm --filter @patina/supabase test   # exit 0
pnpm --filter @patina/client-portal type-check && pnpm --filter @patina/client-portal test   # exit 0
```

**Coverage floors.** `pnpm --filter @patina/client-portal test` runs bare `jest`, which collects no coverage, so it never evaluates the `coverageThreshold` floors (global 70 lines, 60 branches, 70 functions, 70 statements). To check them, `pnpm --filter @patina/client-portal test:coverage` (`jest --coverage`) was run as well. It exited 0 with the same 195 suites and 3,406 tests. The `All files` row was 80.83 % statements, 76.59 % branches, 82.16 % functions and 83 % lines, so **every floor passes** (`logs/g1-client-coverage.log`).

## G2

`pnpm --filter @patina/designer-portal exec jest --runInBand` exited 0. Verbatim output: `Test Suites: 986 passed, 986 total`, `Tests: 14186 passed, 14186 total`, `Snapshots: 1 passed, 1 total`, `Time: 297.471 s`. There were no failures (`logs/g2-jest.log`).

## G3: legacy specs on the owned stack

Precondition: `scripts/the-document-lens-seed.sql` was loaded into the owned DB container (`docker exec -i supabase_db_patina-final psql -U postgres -d postgres -v ON_ERROR_STOP=1 < scripts/the-document-lens-seed.sql`, exit 0). The env followed RC-3c: `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_URL=http://127.0.0.1:57321`, the owned stack's anon and service keys, `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:57322/postgres`, and `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`. Neither config was edited. For each run, this session started a dev server on the config's port, and Playwright reused it (`reuseExistingServer: !CI`). The servers ran one after the other, never at the same time.

**Legacy.** Dev server: `next dev --webpack -p 3000` with the base config's flags `procurement-workspace-pilot:true,the-document-pilot:true,client-invite-letter:true`.

`PLAYWRIGHT_HTML_OUTPUT_DIR=<scratch>/g3-base/html PLAYWRIGHT_JSON_OUTPUT_NAME=<scratch>/g3-base/results.json pnpm exec playwright test e2e/document/quiet-responsive-shell.spec.ts e2e/document/margin-handoffs.spec.ts e2e/document/desk-error-state.spec.ts --project=chromium --workers=1 --output=<scratch>/g3-base/results --reporter=list,json`

Result: `1 skipped`, `18 passed (2.9m)`, exit 0 (`logs/g3-legacy.log`). The skip is `margin-handoffs.spec.ts:195` "the guide's gate act focuses the gate's own control in the margin", which the spec marks `test.fixme` (the act does not exist on the route yet). Two cases that failed at RC-3c both passed this time. `desk-error-state.spec.ts:102` (20 consecutive desk loads) passed in 29.2 s, after taking about 60 s and failing at RC-3c. `quiet-responsive-shell.spec.ts:723` and `:774` passed because the lens seed was present.

**Pieces.** Dev server: `next dev --webpack -p 3410` with the base flags plus `ask-the-paper:true,one-voice:true`.

`PLAYWRIGHT_OUTPUT_DIR=<scratch>/g3-pieces/results pnpm exec playwright test e2e/document/pieces-build-room.spec.ts --config playwright.pieces.config.ts --reporter=list`

Result: `1 failed`, `33 skipped`, `40 passed (6.7m)` (`logs/g3-pieces.log`). Chromium: 36 passed and 1 failed. WebKit-iPhone: 4 passed and 33 skipped, all by the spec's own `test.skip(browserName !== 'chromium', WALK_ONLY)`.

| Failure | First error | Rerun alone | Root cause |
|---|---|---|---|
| `[chromium] pieces-build-room.spec.ts:309` S4 wallpaper labor, the PO and the price (a7) @1440 | `expect(locator).toBeVisible() failed … getByTestId('build-room') … element(s) not found` (`openSheet`, spec :109) | `pieces-build-room.spec.ts:309 --project=chromium`: **2 passed** (@1440 and @390). **Flaky.** | At 04:55:20Z the local gateway returned a transient 502. Kong logged `upstream prematurely closed connection while reading response header from upstream … request: "POST /rest/v1/rpc/document_open"`, and its access log shows `502`. Postgres logged no error for that call. The page then showed its designed read-failure alert, "The pieces could not be read. Reload the page to try again." (`error-context.md`), and the browser logged `AppError: An invalid response was received from the upstream server` on `['document-state','engagement',…]`. This is a fault in the local Kong↔PostgREST connection, not product logic. |

Incidental, not a failure: PostgREST repeatedly logged `permission denied for function get_project_ffe_readiness_batch` (403). Migration `00880_round8_readiness_batch.sql` deliberately revokes EXECUTE from every role ("Inactive readiness transport … No rules, locks or grants added"). That is the designed state, not a defect.

## G4: round-8 matrix (chromium + webkit-iphone)

`PLAYWRIGHT_DESIGNER_PORT=3420 PLAYWRIGHT_OUTPUT_DIR=<scratch>/g4 PLAYWRIGHT_JSON_OUTPUT_NAME=<scratch>/g4/results.json pnpm exec playwright test e2e/round8 --config playwright.round8.config.ts --workers=1 --reporter=list,json`

The env was the same as for G3. The config started its own webServer on 3420 with the round-8 flags. `json` was added to `list` only to capture skip annotations, and does not change execution. Result: `1 failed`, `4 skipped`, `239 passed (39.8m)`. JSON stats: `expected 239, skipped 4, unexpected 1, flaky 0` (`logs/g4-round8.log`).

### Skipped (4, all webkit-iphone, all declared skips with reasons)

| Test | Reason (annotation) |
|---|---|
| `ffe-unfold.spec.ts:495` Back to the desk over a failed Spec save is held, then goes on to the desk once it lands | `test.skip(browserName !== 'chromium', …)`: "Story logs #42/#44: WebKit second-traversal observation unresolved under Playwright. Real-device Safari check owed at WP-11." |
| `paper-frame.spec.ts:55` the contents margin names exactly the mounted chapters | `test.skip(width < 1180)`: "the contents margin stands from 1180px" (the iPhone 14 viewport is narrower) |
| `paper-frame.spec.ts:68` a contents press scrolls to the chapter and moves focus to its heading | Same: "the contents margin stands from 1180px" |
| `rc4b-presentation.spec.ts:113` the ghost phase underline keeps its intrinsic width on desktop paper | `test.skip(project !== 'chromium')`: "desktop width only" |

**`zoom-accessibility.spec.ts` had no skips.** All 30 of its tests passed: 5 viewports × 3 tests × 2 projects. The two `paper-frame` skips are the pair that most likely read as "around zoom-accessibility". Both are viewport-width skips declared in the spec.

### Failures (1)

| Test | First error | Rerun alone | Evidence |
|---|---|---|---|
| `[webkit-iphone] phone-line-editor.spec.ts:165` C03 fitted phone editor at 320: touch/keyboard fit, conflict recovery, reload and mounted Return/Back hold | `expect(locator('[data-arrival-ready]')).toHaveCount(1)` failed, `Received: 0`, `Timeout: 5000ms` (spec :327, right after `page.reload`) | `phone-line-editor.spec.ts:165 --project=webkit-iphone`: **2 passed** (@320 28.9 s, @390 26.0 s). **Flaky.** | When it failed, the page snapshot showed the round-8 paper fully rendered but the overview still reading "Now at Project schedule · Reading…". `data-arrival-ready` is `paperSettled && lensResolved` (`doc/[id]/page.tsx:3146`), so after the reload WebKit had not settled the schedule read within the assertion's default 5 s expect timeout. The test had just driven forced refusals and a conflict ("This selection changed in another session"), as designed. There was no server error. This is a timing margin at the 5 s default, and it does not reproduce in isolation. |

### scale-profile

| Lines | chromium | webkit-iphone |
|---|---|---|
| 36 | ✓ 10.3 s | ✓ 11.6 s |
| 80 | ✓ 9.8 s | ✓ 12.2 s |
| 500 | ✓ 12.8 s | ✓ 16.3 s |
| 2,000 | ✓ 31.2 s | ✓ 34.7 s |

The 2,000-line statement timeout that RC-3c reported is no longer reproduced on this tip.

## G5: bundle budget

All dev servers were stopped first (`pgrep 'next dev'` returned none, and `lsof` showed nothing on 3000/3410/3420). Then `rm -rf apps/designer-portal/.next` was run.

`ANALYZE=true pnpm --filter @patina/designer-portal analyze && node scripts/bundle-budget.mjs apps/designer-portal/.next`: exit 0, "Bundle budget passed." (`logs/g5-bundle.log`)

| Route | Measured (summed gzip) | Budget | Headroom | Chunks |
|---|---:|---:|---:|---:|
| `/desk` | 1,282,511 | 1,346,026 (VERIFICATION.md) | 63,515 | 62 |
| `/doc/[id]` | 1,682,981 | 1,690,757 (G5-doc) | 7,776 | 73 |

Other tripwires: `crypto-browserify` 0 modules and 0 chunks, Lucide 142 of 200.

**Lazy round-8 chunks.** These come from the `analyze.html` chartData plus the `gzipSync` of each emitted file, using the bundle-wave1 method. None of them is in either route's client-reference manifest, so none is counted in the route totals above.

| Chunk | Contains | Gzip | Wave 1 |
|---|---|---:|---:|
| `static/chunks/429.e55c70b767c06dab.js` | `round8-paper-frame.tsx` (+11 modules) | 12,139 | 11,609 |
| `static/chunks/8041.67ee918ec32f2568.js` | `round8-desk.tsx` (+7 modules) | 6,164 | 5,911 |
| `static/chunks/8603.79f25ca5fa9d425c.js` | `round8-states.tsx` | 747 | — |
| `static/chunks/7627.53e06c4721f10799.js` | `round8-library-editorial.tsx` (+1) | 641 | — |

A flag-on first visit therefore pays the route total plus about 12.9 KB on `/doc` (paper frame and states) and about 6.2 KB on `/desk`.

## What was NOT run

- RC-2 consumer journey, the `@renderer-off` round-8 legacy pass (`ROUND8_RENDERER=off`), the iOS gates, an axe pass and a screen-reader pass.
- The SQL, edge and lock gates. These belong to the parallel agent (`rc6-final-tip-sql.md`).
- No second full G4 matrix. Each flaky case was rerun once in isolation only, so dependence on run order or load stays unproven.
- No `EXPLAIN` of the 2,000-line FF&E read, and no investigation of the Kong↔PostgREST connection reuse behind the G3 pieces 502.
- `pnpm exec turbo run build --filter=@patina/designer-portal^...` was not rerun before G5. The workspace dists from setup were used as-is.

## Teardown

`supabase stop --workdir <scratch>/stack --no-backup` exited 0 with "Stopped supabase local development setup." Afterwards there were 0 `patina-final` containers and 0 volumes. `pgrep 'next dev'` found nothing, and `lsof` found no listener on 573xx, 3000, 3410 or 3420. The shared stack on 54321/54322 was still listening and was never stopped, reset or written to (`logs/teardown.log`). The G5 analyze output remains in the ignored `apps/designer-portal/.next`.
