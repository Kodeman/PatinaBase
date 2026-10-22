# US-49 Phase 2 combined gate

**Candidate:** `4ee6e50aeb168043be8480b7ced77adacd3804ac` (exact worktree HEAD)
**Date:** 2026-10-22
**Scope:** verification only; no product-code edits; no production access or mutations.

## Setup

- `pnpm install --frozen-lockfile --offline` — exit 0; 3,403 packages installed/reused, lockfile unchanged.
- Copied only `postgres-version`, `rest-version`, `storage-version`, `gotrue-version`, and `storage-migration` from the main checkout's `supabase/.temp/`.
- Both worktree `.env.local` files were absent. Main-checkout values pointed to Strata (`https://bkvcixdmuyejfzcijpdg.supabase.co`), so they were not copied. Created ignored worktree-only portal env files with `http://127.0.0.1:54321` and local anon key. `pnpm supabase status -o env` reported local `API_URL=http://127.0.0.1:54321` and `DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres`.
- `pnpm turbo build --filter=@patina/client-portal... --filter=@patina/designer-portal...` — exit 0; 10/10 tasks successful. This full dependency-graph build includes `@patina/aesthete-quiz`.

## Gate results

| Gate | Command | Exit | Result |
|---|---|---:|---|
| Client type-check | `pnpm --filter @patina/client-portal type-check` | 0 | Passed after dependency builds. An initial attempt before the full dependency graph build failed on unresolved `@patina/aesthete-quiz`; that prerequisite was built and the exact check then passed. |
| Client Jest | `pnpm --filter @patina/client-portal exec jest --maxWorkers=2` | 0 | 183 suites, 3,146 tests, 1 snapshot passed. |
| Designer type-check | `pnpm --filter @patina/designer-portal type-check` | 0 | Passed. |
| Designer Jest | `pnpm --filter @patina/designer-portal exec jest --maxWorkers=2` | 1 | 909/910 suites passed; 12,984 passed, 3 failed (12,987 total); 1 snapshot passed. All three failures are in `src/components/document/__tests__/client-mirror.test.tsx`: “paints the answered mark mocha, not sage”, “leaves no sage anywhere in the section that carries the mark”, and “says the outcome in a word and a date, with no checkmark standing in”. Each throws `TypeError: (0, _supabase.useProjectFFEItems) is not a function` from `src/components/document/client-mirror.tsx:109`. Attribution: `client-mirror.tsx` last changed by `e6070a622`; test last changed by `e2841c0e7`. No code changes made. |
| Designer lint | `pnpm --filter @patina/designer-portal lint` | 1 | 252 problems: 1 error, 251 warnings. Error: `src/hooks/__tests__/use-commercial-documents.test.ts:1337:80` — `react-hooks/rules-of-hooks`, `useFurnishingsAuthorizationPreview` called in function `query` (commit `48ae7ef7e`). |
| Edge Deno tests | `deno test --no-check -A --node-modules-dir=auto supabase/functions/client-edition-compose/ supabase/functions/_shared/claude.test.ts supabase/functions/project-ffe-document-extract/ supabase/functions/client-plate-copy/` | 0 | 167 passed, 0 failed. |
| Deno type-check | `deno check --config supabase/functions/deno.json supabase/functions/client-edition-compose/index.ts supabase/functions/aesthete-dna-draft/index.ts supabase/functions/board-deck-import-resolve/index.ts supabase/functions/companion-message/index.ts supabase/functions/project-ffe-document-extract/index.ts supabase/functions/sms-inbound/index.ts supabase/functions/client-plate-copy/index.ts` | 0 | All seven importers checked. |
| Media worker | `npm --prefix <worktree>/infra/media-worker test` | 0 | 69/69 passed, including native plate-lane (a)–(d) and plate-read. |
| Migration replay | `pnpm supabase:reset` | 0 | Reset completed; migrations replayed through the configured head and seeded local fixtures. No production database was touched. |
| SQL pgTAP | `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -v ON_ERROR_STOP=1 -f <each of supabase/tests/00842_*.test.sql … 00846_*.test.sql>` | 0 | 00842: 34/34; 00843: 62/62; 00844: 33/33; 00845: 109/109; 00846: 61/61 — 299/299 assertions. No `not ok` output. |
| Client Playwright | `pnpm --filter @patina/client-portal exec playwright test tests/house-issue.spec.ts tests/threshold.spec.ts tests/homeowner-usability.spec.ts --workers=2 --reporter=list` (run via scratch script to export key obtained from local `supabase status -o env`) | 0 | 58/58 passed in Chromium (2 workers). Includes House Issue geometry at 390px/1440px, server HTML preload, flag-off no editorial/plate requests, and approved/undone edition paths. |
| Designer Press Playwright | Searched `apps/designer-portal/e2e/` for Press-named spec/test files | n/a | No matching Press band Playwright spec was present; skipped. |

## Non-gate command note

A first media-test invocation used `npm test` from the repository root (the shell starts at the worktree root); this ran an unintended broad Turbo test sweep rather than media-worker. It exited 1 on two unrelated `patina-edge-api-worker:test` failures in `infra/edge-api-worker/test/validate-config.test.ts` (“pins the ruled SCAN_ROUTES posture per scope” and “pins the ruled MEDIA_UPLOADS posture per scope”; expected `off`, received `on`). It is not the media-worker result; the correctly scoped media-worker command above passed. No product code was changed. The root `deno.lock` created by the mandated Deno command was removed after verification.

## Summary

The gate is **not green**: designer-portal Jest has three failures in the client mirror tests, and designer-portal lint has one error. All other listed checks passed. No failing check was repaired, per the ticket's finding-only boundary. The local database was reset for the gate and is now released; no tests or reset remain running.

## Orchestrator disposition (2026-10-22)

- Designer Jest, client-mirror (3 failures): this is a test-only mock gap from SQ-1690. `client-mirror.test.tsx` never mocked `useProjectFFEItems`. It is fixed on main in `caa60928c`. The `client-mirror` suites now pass 2/2 suites and 34/34 tests. Runtime behaviour is unchanged.
- Designer lint, rules-of-hooks in `use-commercial-documents.test.ts:1337`: this predates US-49. Commit `48ae7ef7e` (2026-10-20) is an ancestor of the US-49 base `5a7c00120`, and the designer portal has deployed with it since. The error is in test code, and the deploy build does not lint. It is not a Phase 2 blocker, and it is tracked with the other pre-existing gate noise (SQ-1494).
- The `edge-api-worker` `validate-config` reds came from an accidental root `npm test`. They are pre-existing, unrelated, and not part of this gate.
- Phase 2 is GO on main `caa60928c` plus this note.
