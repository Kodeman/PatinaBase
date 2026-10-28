# RC-3 browser, accessibility, and bundle matrix

**Source candidate:** `5a0acd0e4a806434c28d6b6005e2f2e14d82aeab`  
**Scope:** G3 legacy Chromium baseline, G4 Round-8 Chromium + WebKit-iPhone matrix, and G5 Round-8-on bundle budget. Evidence-only: no application code, Playwright configuration, or bundle budget was changed.

## G3 — legacy Chromium

Command (one worker; artifacts outside the worktree):

```sh
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres PLAYWRIGHT_HTML_OUTPUT_DIR=/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-2236/g3-legacy-html-r1 pnpm --filter @patina/designer-portal exec playwright test e2e/document/quiet-responsive-shell.spec.ts e2e/document/margin-handoffs.spec.ts e2e/document/desk-error-state.spec.ts --project=chromium --workers=1 --output=/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-2236/g3-legacy-results-r1
```

Result: 13 passed, 2 failed, 1 skipped, 3 did not run; 19 tests; 8.7 minutes. The failed assertions/errors were:

1. `e2e/document/desk-error-state.spec.ts:102`, “20 consecutive desk loads each reach a complete state with zero half-states”: run 8 had neither the empty-state line nor job lines (`empty=false lines=false`); assertion in the `toPass` loop timed out.
2. `e2e/document/margin-handoffs.spec.ts:63`, “every gate is a margin item: lane, need line, and exactly one act”: `page.goto` to `/doc/b0000000-0000-0000-0000-0000000000d1` failed with `net::ERR_ABORTED; maybe frame was detached?`, then the 60-second test timeout elapsed.

The four margin-handoffs tests following the failing test were the only cases not reported as passed/failed: “unfolding the margin shows each gate its stage as microtext”; “an overdue gate wears the stamp, and only an overdue gate does”; “an overdue gate's elapsed-time derivation prints once more above the paper”; and “the guide's gate act focuses the gate's own control in the margin.” The console summary reports one skipped and three did-not-run. The archived Playwright JSON normalizes all four to `skipped`, so it does not retain which one was the explicit skip versus the three not run; no finer mapping is claimed.

Two failure-only attempts followed, not a third G3 full run. Attempt 1 command selected those same two cases with `--retries=1`; both attempts failed in `authenticatedPage` setup at `/auth/signin?callbackUrl=%2Fdesk` (60-second timeout / detached-frame), before their assertions. Attempt 2 raised the timeout to 180 seconds but Playwright failed waiting 120 seconds for the base-config `webServer` before test collection. Neither retry establishes whether the original failures were flaky. The explicit shared DB target was `postgresql://postgres:postgres@127.0.0.1:54322/postgres`; attempt 2 did not reach fixture setup.

## G4 — Round-8 Chromium and WebKit-iPhone

Ran with `playwright.round8.config.ts`, one worker, 11 files, 2 projects, owned local Supabase project `patina-rc3-sq2236`: API `127.0.0.1:57321`, DB `127.0.0.1:57322`. Environment targets were `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:57321` and `SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:57322/postgres`; `PLAYWRIGHT_OUTPUT_DIR` pointed to external SQ-2236 evidence storage. The full retry invocation was grouped as 4 initial files (`accounts-paper`, `arrangements`, `audience-work`, `buying-paper`) plus 7 targeted FF&E/paper/responsive/state/studio files, with both projects and the Round-8 config. The first attempt stopped during F01 global fixture setup after the owned PostgreSQL server exited with code 2 and entered crash recovery. Following preflight (`select 1`, healthy container), exactly one retry was allowed and run; its F01 readback and teardown succeeded. No third G4 attempt was run.

Retry result: 67 passed, 13 failed, 2 skipped, 2 did not run (84 total; 49m 40.9s). Every failure, with its first distinguishing error and provisional classification:

| Test | Project | First error / observed result | Classification |
|---|---|---|---|
| `accounts-paper.spec.ts:73` — “issued, received and due read native invoice/payment truth; drafts remain rows, not balances” | Chromium | Expected API URL `127.0.0.1:54321`, received owned API `127.0.0.1:57321` | Environment/setup mismatch |
| same | WebKit-iPhone | Expected API URL `127.0.0.1:54321`, received `127.0.0.1:57321` | Environment/setup mismatch |
| `ffe-unfold.spec.ts:146` — “a reload on the unfold address reopens it, and the /pieces route still resolves” | WebKit-iPhone | Test timed out at 60 seconds | Provisional behavior failure; no base comparison |
| `ffe-unfold.spec.ts:173` — “embedded Spec layout fits the paper column at 1180, 1440 and 1920” | WebKit-iPhone | Test timed out at 60 seconds | Provisional behavior failure; no base comparison |
| `ffe-unfold.spec.ts:228` — “a failed Spec save keeps the sheet open until a retry lands” | WebKit-iPhone | `authenticatedPage` setup timed out at 60 seconds | Environment/setup timeout |
| `ffe-unfold.spec.ts:365` — “Back over a pending Spec save that then fails stays open on the field” | WebKit-iPhone | Test timed out at 60 seconds | Provisional behavior failure; no base comparison |
| `ffe-unfold.spec.ts:490` — “Back to the desk over a failed Spec save is held” | WebKit-iPhone | Test timed out at 60 seconds | Provisional behavior failure; no base comparison |
| `ffe-unfold.spec.ts:490` — “Back to the desk over a failed Spec save is held, then goes on to the desk once it lands” | WebKit-iPhone | `authenticatedPage` setup timed out at 60 seconds | Environment/setup timeout |
| `first-slice.spec.ts:72` — “studio → exact living-room line → save and recover → room → studio” | WebKit-iPhone | Authentication failed after three `page.goto` timeouts at 30 seconds each | Environment/setup timeout |
| `first-slice.spec.ts:278` — “phone keeps the survey, living-room unfold and exact line reachable by keyboard” | WebKit-iPhone | Authentication failed after three `page.goto` timeouts at 30 seconds each | Environment/setup timeout |
| `responsive.spec.ts:162` — “touch reaches Library through More and Find” | Chromium | Expected Resource library heading was not found | Provisional behavior failure; no base comparison |
| same | WebKit-iPhone | Expected Resource library heading was not found | Provisional behavior failure; no base comparison |
| `responsive.spec.ts:150` — “keyboard Find reaches Measured rooms through its registry row” | WebKit-iPhone | Expected `/rooms`; URL remained `http://localhost:3420/desk` | Provisional behavior failure; no base comparison |

Classifications describe only observed symptoms. No base comparison was run; none of these are confirmed regressions or confirmed pre-existing failures. The 4 timeouts during a test (FF&E reload/layout/back cases) and the route/heading assertion failures are provisionally product-behavior failures, not proven regressions. Hard-coded port mismatch and auth/setup timeouts are environment/setup. The two skipped and two did-not-run cases are included in the run totals; their names are preserved in the Playwright output, not inferred here.

The allowed retry completed with the owned DB `Running=true`, `Health=healthy`, `OOMKilled=false`, `ExitCode=0`; logs showed normal F01 teardown and cron activity. F01 remained local-only on the owned DB and readback succeeded. Earlier setup attempt's PostgreSQL crash is recorded as a failed acquisition/setup attempt; its cause was not established. The two fixture `plan_issues` rows were left in place as directed; no cleanup/reset was run. Inventory is limited to observations in the run; no claim of exhaustive DB inventory or timer/cron isolation is made.

## G5 — Round-8-on bundle budget

The Round-8-on production build completed. Bundle budget analysis then exited 1:

| Route | Measured / budget | Result |
|---|---:|---:|
| `/desk` | 1,301,483 / 1,346,026 bytes; 63 chunks | 44,543 bytes under |
| `/doc/[id]` | 1,701,351 / 1,690,757 bytes; 74 chunks | **10,594 bytes over; release-blocking** |

Additional analyzer findings: crypto-browserify = 0 modules/chunks; Lucide = 142 / 200 icon limit. Dynamically loaded Closeout chapter sections: service-acceptance 25,433 raw / 7,198 gzip bytes; studio-service completion 18,489 raw / 5,658 gzip bytes. No budget or source changes were made. The overage is not waived or repaired in this evidence task.

## Accessibility and coverage limits

The named runs exercised responsive layouts at the viewports encoded in their tests (including 390, 1024, 1180, 1280, 1440, and 1920 CSS px where those cases ran). This is not a complete viewport matrix: G3 includes 390/1024/1280/1440 cases; G4 includes the 1180/1440/1920 embedded Spec case, which timed out in WebKit-iPhone. The run did not establish browser zoom coverage, reduced-motion coverage, or screen-reader/VoiceOver coverage. Keyboard coverage is represented only by the named Playwright cases, including the WebKit-iPhone keyboard Find case that failed to navigate to `/rooms`; no assistive-technology session was performed.

An axe sweep was not run: `require.resolve('@axe-core/playwright')` returned `MODULE_NOT_FOUND`. No dependency was installed and no extra browser run was started. There is no axe result to claim.

## Owned stack and teardown

G3 used the existing shared local API/DB ports 54321/54322. G4 used only the isolated owned API/DB ports 57321/57322 and `playwright.round8.config.ts`; the F01 fixture was not moved to the shared DB. Stopped with `pnpm exec supabase stop --project-id patina-rc3-sq2236 --no-backup --yes` (CLI confirmed stopped; no data backup). `lsof -nP -iTCP:57321 -iTCP:57322 -sTCP:LISTEN` returned no listeners (exit 1), confirming both owned API/DB ports are free. No shared-stack teardown was performed.

## Verification artifacts

Source candidate for all captures: `5a0acd0e4a806434c28d6b6005e2f2e14d82aeab`. Original G3 log/HTML and retry logs, G4 retry JSON/HTML/log, and bundle logs remain under `/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-2236/`. G4 and G5 result comments are recorded on SQ-2236. This report does not substitute for those raw captures.
