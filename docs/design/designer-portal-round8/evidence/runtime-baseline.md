# Round-eight runtime baseline

Captured on 2026-10-23 against the unchanged integration candidate. This is a local baseline, not a claim that the redesigned application is implemented or production-ready.

## Environment

| Item | Observed |
|---|---|
| Candidate/base | `f8b3fe66350e5fff2c3448668588b4bea3605bbf` (`redesign/designer-portal-round8`) |
| Node | `v24.12.0` |
| pnpm | `9.0.0` |
| Root Node requirement / package manager | `>=20.9.0` / `pnpm@9.0.0` |
| Designer portal Next.js | Manifest declares `~16.2.6`; installed build reported `Next.js 16.2.10` |
| Supabase URL safety check | `apps/designer-portal/.env.local` matched `127.0.0.1:54321`; values/keys were not recorded |
| Designer data mode | `.env.local` matched `NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live` |
| Database | Local Supabase API `127.0.0.1:54321`, Postgres `127.0.0.1:54322`; one `pnpm supabase:reset` completed before tests. Migrations replayed through `00866_inbound_notice_shipment_quantities.sql` plus timestamped contact-messages migration; configured seed set included local accounts, procurement, Aesthete, agent tasks, fulfillment, direct orders, CRM and House Issue fixture seeds. No real client content or keys recorded. |
| Stack | Existing shared Supabase stack and Redis/MiniO/Mailhog containers were present. `pnpm supabase:start` reported the local endpoints. `docker compose up -d` could not create a duplicate named `/patina-mailhog`; worktree-scoped `docker compose ps` showed no project containers. Existing `patina-minio` reported unhealthy in `docker ps`. No app dev server was started outside test-managed servers. |
| Dependencies | `bash scripts/bootstrap-worktree.sh` succeeded; 6 local env files copied; frozen lockfile install completed. `pnpm exec turbo run build --filter=@patina/designer-portal^...` passed (6/6 tasks, 459ms cached). |

## Baseline commands

| Command | Outcome | Counts / skips / duration | Inherited failures |
|---|---|---|---|
| `pnpm --filter @patina/designer-portal type-check` | PASS | No result count; command log captured; duration was not measured | None reported |
| `pnpm --filter @patina/designer-portal lint` | PASS (exit 0) | 255 warnings, 0 errors; details in verification log | Warnings only |
| `pnpm --filter @patina/designer-portal exec jest --runInBand src/lib/document/__tests__/shadow-gate.test.ts src/lib/document/__tests__/contrast.test.ts src/lib/document/__tests__/document-action-hierarchy-contract.test.ts` | PASS | 3 suites, 112 tests, 0 snapshots; 0.954s | None |
| `pnpm --filter @patina/designer-portal test -- --runInBand` | PASS | 920 suites, 13,194 tests and 1 snapshot passed; 300.469s. First attempt was interrupted before summary; clean rerun completed with exit 0. | None reported by Jest summary |
| Document Playwright, Chromium, 1 worker | FAIL (exit 1) | 10 passed, 1 skipped, 3 failed, 5 did not run; 462s. Temporary scratchpad config rebased the base server from hard-coded 3000 to 3101; no repository config change. Failure log includes OD-4 find-in-page assertion: `window.find("published budget checkpoint")` returned false. | No retry; see concurrency note below. |
| Pieces Playwright, 1 worker (`e2e/document/pieces-build-room.spec.ts`) | FAIL (exit 1) | 32 passed, 33 skipped, 5 failed; 1,085s. Config used `PLAYWRIGHT_DESIGNER_PORT=3101`. Example failure: expected product-search locator was not visible. | Run overlapped SQ-1819's frozen pieces oracle; coordinator observed high host load and SQ-1819 auth setup timeouts. Per coordinator, no repeat or fixture reseed without clearance. |
| Hours Playwright, 1 worker | PASS (exit 0) | 7 passed, 1 skipped; 135s. | Sanity help fetches logged network errors; no test failures. |

| `pnpm --filter @patina/designer-portal build` | PASS | Exit 0; output captured in verification log | Designer Next build and route output completed |
| `node scripts/policy/check-send-authority.mjs` | PASS | `Outbound provider usage is confined to approved chokepoints.` | No skips reported |
| `node scripts/policy/check-model-names.mjs` | PASS | `No model-feature names found in product strings.` | No skips reported |
| Buying Playwright, dedicated config, 1 worker | FAIL (exit 1) | 1 passed, 12 failed, 1 did not run; 3,736s. Failures: `phase0-member-walk.spec.ts:239`, `phase1-member-walk.spec.ts:397`, `phase2-member-walk.spec.ts:344`, and `phase3-coverage-walk.spec.ts:506,593,774,851,914,982,1042,1105,1164`. Eleven failed on 90s `toBeVisible` timeouts; phase 2 failed in a local `psql` fixture setup command. | Classified as likely environment/fixture-contended flaky, not established inherited failures: coordinator observed load ~36 and SQ-1819 auth setup timeouts during the overlapping run. No retry or reseed without clearance; classification is provisional absent an isolated repeat. |
| Agreement Playwright, dedicated config, Chromium, 1 worker | FAIL (exit 1) | Load 10.91 before start; 7 passed, 2 failed; 313s. `e2e/agreement/galley.agreement.pw.ts:412:7` (`carries the consequence, the held send and its reason at 1024 and at 390`) expected the no-fee consequence but got the combined fee/client blocker. `e2e/agreement/galley.agreement.pw.ts:463:7` (`opens the send sheet, composed from the parts, once the fee, the ceiling and the client are there`) timed out on the `Role 1 hourly rate` locator. That locator timeout reproduced on its single permitted standalone rerun with retries disabled: load 8.64; 0 passed/1 failed; 77s. | The `Role 1 hourly rate` locator timeout is recorded as an inherited failure; no further retry. |
| Design-build Playwright, dedicated config, Chromium, 1 worker | PASS (exit 0) | Load 3.98 before start; 1 passed; 40s. Passing assertion: `locks the turnkey template until the studio attests, then composes one`. | Application logged AppErrors while saving invalid pricing/supervision combinations; test passed. |
| Library Playwright, Chromium, 1 worker, scratchpad config on port 3101 | FAIL (exit 1) | Load 3.11 before start; 4 failed, 3 did not run; 23s. Failures: `commission-walk.spec.ts` (piece-room interstitial), `decisions-compare.spec.ts` (priced sibling snapshots), `picker-configure.spec.ts` (resolved selection), and `spec-book-dimensions.spec.ts` (structured dimensions/unknown keys). All four reported `P0001 studio_id_not_designer_studio` against the local seeded designer-studio fixtures. | Inherited fixture/tenancy failure; same error is present in the client-portal main-branch red `SQ-1610` (plans-link). No retry. |
| `ANALYZE=true pnpm --filter @patina/designer-portal analyze` + `node scripts/bundle-budget.mjs apps/designer-portal/.next` | NOT RUN (superseded by SQ-1815) | SQ-1815 story log #3 measured both renderer paths at candidate `0fabcadf2`. | This ticket did not repeat bundle analysis. |
| `pnpm verify:affected` and other implementation-slice/domain gates | NOT RUN | This ticket changes only baseline evidence, not implementation or schema. No additional DB/SQL/edge/iOS gates apply. | Out of scope for this evidence-only ticket. |

## Known inherited gate gaps and CI failures

- `verify:affected` does not run SQL suites; the designer `build` ignores TypeScript errors, so explicit `type-check` is required; Jest global coverage thresholds are zero.
- `e2e/document/margin-handoffs.spec.ts` contains a historical `fixme` (to be reported with actual Playwright results).
- Inherited base-main failures recorded by the orchestrator: Integration run `39948932058` (DB tests and admin, designer, client browser suites); affected-quality run `39940129272` (affected gates). These are not results of this local candidate run.

## Run evidence

Captured logs and command outputs are outside the repository at `/Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-1808/`. After the earlier document, pieces, hours, and buying runs, the coordinator authorized only agreement, design-build, and library, serially with one worker each and no reset. Agreement failed (7 passed/2 failed; 313s); its locator-timeout test was rerun once alone with retries disabled and failed again (0 passed/1 failed; 77s). Design-build passed (1 test; 40s). Library failed (4 failed, 3 did not run; 23s) with four `P0001 studio_id_not_designer_studio` database errors; no retry was authorized for those failures. One-minute load before each run was below 12 (10.91, 8.64 for the timeout-only rerun, 3.98, and 3.11). After library, no listeners remained on ports 3000, 3101, or 3413; process inspection found no suite runner or Next dev server (the existing Playwright MCP service was unrelated). Bundle analysis was superseded by SQ-1815 story log #3 at candidate `0fabcadf2`. Production-only status probes, deployments, external sends, and CI workflow dispatches were not performed.
