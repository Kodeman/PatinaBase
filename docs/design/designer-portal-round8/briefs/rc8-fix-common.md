# RC-8 fix lanes: rules for every lane

On 29 October 2026 Kody ruled on the RC-7 questions (DECISIONS.md K9–K20). Each RC-8 lane implements one or two of those rulings on top of `r8-evidence`. Read [`rc7-common.md`](rc7-common.md) first. Its runtime isolation, owned-stack recipe, port pattern, cron-off step, teardown and defect rules all apply. The differences are listed below.

## What changes from RC-7

- **You fix product code.** You may edit the product files, migrations and tests your lane brief names. Edit nothing outside that list. If a fix needs another file, stop and report why.
- **Migrations.**
  - Use only the number your brief assigns. Load **patina-db-migrations** first.
  - If you redefine a function, graft onto the latest body on *this branch*: `grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/*.sql | sort | tail -1`. That includes round-8 bodies from 00867–00902.
  - Deterministic refusals raise `ERRCODE 'PT409'`, never 40001, because PostgREST 14.5 retries 40001 forever.
  - Lock order is project → proposal → document.
  - If a migration adds GRANT or REVOKE, regenerate `supabase/seed/00-legacy-grants.sql` with `python3 scripts/generate-legacy-grants.py`.
  - If the public schema changes, run `pnpm db:generate` against **your owned stack** (export `SUPABASE_DB_URL` for it), never the shared one.
  - A redefined `SECURITY DEFINER` function changes its hash in `supabase/tests/edge_api/public_sd_hardening_contract_test.sql`. Re-pin it there and say so.
- **Commits.** Use Conventional Commits (`fix(...)`, `feat(...)`, `test(...)`) and stage explicit pathspecs. Do not push.
- **Codex agents** read large files incrementally (a 272k context cap; HTTP 413 above it).

## Shared machine resources (mandatory)

Swap is near full and the Docker VM has 7.75 GiB for every stack. Two mutexes guard the shared resources. Each is a directory, and `mkdir` acquires it atomically. `$LOCKS` is `/private/tmp/claude-501/-Users-kody-Code-patina-merged/1460bfe7-3b74-49b1-b90e-b7c7dd33fdc9/scratchpad/locks`.

- **The browser slot** is `$LOCKS/browser`. Hold it for any Playwright run and its `next dev` server.
  - Acquire: `until mkdir "$LOCKS/browser" 2>/dev/null; do sleep 60; done; echo "<lane> $(date)" > "$LOCKS/browser/owner"`.
  - Release it as soon as your runs end, dev server killed: `rm -rf "$LOCKS/browser"`.
  - Do all your code, jest and SQL work *before* you take the slot, and never hold it while editing.
- **The heavy slots** are `$LOCKS/heavy-1` and `$LOCKS/heavy-2`. Hold one for `type-check`, `lint`, jest suites over 50 files, the admin build, or `xcodebuild`. Acquire with the same `mkdir` loop over either slot, and release it when the command ends.
- **Before anything heavy,** run `sysctl vm.swapusage` and `df -h /Users/kody`. If disk is below 20 GiB, stop and report.
- **Owned stacks.** Start yours only when you need it, and stop it (`--no-backup`) as soon as your SQL or browser work ends. Never keep an idle stack up.

## Gate before your final commit

1. Run `pnpm --filter @patina/designer-portal type-check` (passes) and `lint` (0 errors), under a heavy slot.
2. Run the jest suites for every file you touched (`--runTestsByPath <files>`, never a directory).
3. Every migration applies on a fresh owned stack (`supabase start` replays all migrations), and every new or touched SQL suite exits 0 under `psql -v ON_ERROR_STOP=1`.
4. Browser specs your brief names pass twice on `chromium` and `webkit-iphone`, under the browser slot.

## Report back (≤ 500 words)

Give:
- your commit SHAs and files changed;
- the exact gate commands and their counts;
- the root cause each fix addresses, as `file:line`;
- what you did not verify;
- teardown proof: your stack stopped, your ports free, and your locks released.

Do not invoke the code-review skill.
