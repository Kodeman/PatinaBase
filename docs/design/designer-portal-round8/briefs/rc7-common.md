# RC-7 evidence wave: rules for every lane

Kody ruled K8 on 29 October 2026: run an evidence wave before any ship. These are the rules every RC-7 lane follows.

RC-6 R3b ([`evidence/rc/rc6-reviews/r3b-evidence-full.md`](../evidence/rc/rc6-reviews/r3b-evidence-full.md)) rated most acceptance criteria as *weak*: the tests prove readings, not transitions. Your lane turns its assigned criteria into **covered**, using recorded end-to-end evidence on live data, or it shows exactly why it cannot.

## What "covered" means

- **Transitions.** Drive the real state change through the product's own UI or RPC, as the real actor. Then read the database back and assert the new state. Importing a pre-built end state and checking that it displays is not enough.
- **Both branches.** Cover the negative branch the criterion names as well as the positive one: refusals, holds, retry or duplicate attempts, the stale version.
- **Fixtures.** Use live data with mock fallback disabled (`NEXT_PUBLIC_DESIGNER_PORTAL_DATA_MODE=live`, which `playwright.round8.config.ts` already sets). Load each fixture through SQL on **your owned stack** only.
- **Browser coverage.** Every new browser spec passes on `chromium` and `webkit-iphone`. If a step genuinely cannot run on WebKit, skip it in the spec with a stated reason.
- **Stability.** Run each new spec **twice** and record both results.

## Runtime isolation (mandatory)

- **The shared stack is off limits.** Never touch 54321/54322 and never run `supabase:reset`. Never use `--linked`, Strata, PostHog or any production service.
- **Owned stack recipe:**
  1. `mkdtemp` a scratch dir under your session scratchpad and copy your worktree's `supabase/` into it.
  2. Edit **only the scratch** `config.toml`: set `project_id` and the ports from your lane's block (see the port pattern below).
  3. Copy only these five pins from `/Users/kody/Code/patina-merged/supabase/.temp/`: `gotrue-version`, `postgres-version`, `rest-version`, `storage-migration`, `storage-version`. Never copy `project-ref`, `linked-project` or `pooler-url`.
  4. Start it with `supabase start --workdir <scratch> -x studio,mailpit,logflare,vector,edge-runtime,imgproxy,postgres-meta`.
     - Lanes that need edge functions drop `edge-runtime` from the `-x` list and run `EMAIL_DEV_MODE=dry_run`.
  5. Tear down with `supabase stop --workdir <scratch> --no-backup`.
- **Port pattern.** With block `B` (for example `571`): API `B21`, DB `B22`, shadow `B20`, pooler `B29`, studio `B23`, inbucket `B24`, analytics `B27`, inspector `B83`.
- **Dev servers.** Use only your lane's dev port(s). Point them at your owned stack's API through env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` and `PLAYWRIGHT_DESIGNER_PORT`.
  - Read the keys from `supabase status --workdir <scratch> -o env`, and **never print them**.
  - Never edit `.env.local`.
- **Local activation.** Turn C2/C4/C6 on only on your owned stack, through SQL that refuses unless the DB is yours (check the system identifier or the port). RC-5 §4.3 and `supabase/tests/service_acceptance_activation_plan_test.sql` show the method.
- **Round-8 harness guard.** `playwright.round8.config.ts`, `global-setup.ts` and `global-teardown.ts` (through `e2e/round8/owned-stack.ts`) throw when `SUPABASE_DB_URL` is unset and refuse API or DB port 54321/54322. A deliberate run against the shared stack needs `ROUND8_ALLOW_SHARED_DB=1`.
- **Hard-coded shared ports.** Some existing suites and helpers hard-code `54321`/`54322`, for example the dblink DSNs in `supabase/tests/00845_*` and `00848_*`, which go through the Docker host gateway. Before running any existing file, run `grep -nE '5432[12]'` on it. If it matches, run a scratch copy with your own port swapped in (grep the copy first), and record the match as harness debt.
- **Docker memory.** All owned stacks share the Docker VM's 7.75 GiB. If your Postgres exits, check `docker inspect … --format '{{.State.OOMKilled}}'` before suspecting the product.
- **Turn cron off.** Once your stack is up, run `ALTER SYSTEM SET cron.launch_active_jobs = off; SELECT pg_reload_conf();` as `supabase_admin`, because `postgres` lacks the permission: `docker exec -e PGPASSWORD=postgres supabase_db_<your project_id> psql -h 127.0.0.1 -U supabase_admin -c …`, on your own container only. Cron job start-up crashed backends in several lanes on 2026-10-29 (exit code 2, then recovery and PostgREST PGRST002 503s). If you need a scheduled job's effect, call its SQL function directly.
- **Heavy work.** Playwright runs with `--workers=1`. Run one heavy command at a time in your lane. Check `df -h /Users/kody` first and stop if less than 20 GiB is free.
- **Before you finish:**
  - stop your stack;
  - kill your dev ports (`lsof -ti :<port> | xargs kill`);
  - confirm nothing in your blocks is still listening.

## Worktree and git

- **Paths and setup.**
  - Work only in your own worktree, using absolute paths. Do not use Serena.
  - Set it up with `pnpm install --frozen-lockfile --offline`, then `pnpm exec turbo run build --filter=@patina/designer-portal^... --filter=@patina/client-portal^...`.
  - If G3-style legacy specs need it, load `scripts/the-document-lens-seed.sql` into your owned DB.
- **Files you may create.**
  - Specs: `apps/designer-portal/e2e/round8/rc7-<lane>-*.spec.ts`.
  - Fixtures: `apps/designer-portal/e2e/round8/rc7-<lane>-*-fixture.sql`.
  - SQL suites: `supabase/tests/round8_rc7/<lane>_*.sql` or `*.test.mjs`.
  - Your evidence doc: `docs/design/designer-portal-round8/evidence/rc/rc7-<lane>.md`.
- **Files you may not edit.**
  - Shared helpers, existing specs and existing fixtures. The exception is a file your lane brief names as owned.
  - Any `playwright*.config.ts`, any migration, and any product source file.
  - If you need a shared helper changed, write a new lane-local helper, or report why that is not possible.
- **Commits.** Use Conventional Commits (`test(...)`, `docs(evidence): ...`) and stage explicit pathspecs only, never `git add -A`. **Do not push; the orchestrator merges.**

## Defects

If the product misbehaves, **do not fix product code**. Instead:
1. Root-cause it to `file:line`, using systematic debugging: reproduce, trace, then form a hypothesis.
2. Keep the reproducing test, marked `test.fixme(...)` or `-- DEFECT` and kept out of the passing gate. Give it a `// DEFECT RC7-<lane>-<n>: <one line>` comment.
3. Record the defect in your evidence doc: severity, confidence, repro, root cause and the fix you propose.
4. Continue with the rest of the lane.

Fixing your own test or harness code is fine.

## Evidence doc (your deliverable)

`evidence/rc/rc7-<lane>.md` contains these parts.

1. **Header:**
   - the worktree tip SHA you tested;
   - your stack's ports and `project_id`;
   - the migration head applied;
   - the date.
2. **One table row per assigned criterion clause:**

   | Field | Content |
   |---|---|
   | ID / clause | The criterion and the clause covered |
   | Before | R3b's rating |
   | Now | `covered`, `weak` or `defect` |
   | Spec | Spec file and test name(s) |
   | Asserted | The transitions asserted |
   | Readback | The DB readback (the query and the observed values) |
   | Runs | Run 1 / run 2 results per project |

3. **Verbatim command lines and pass/fail counts.**
4. **Defects,** as described above.
5. **Not verified, and why.**
6. **Teardown proof.**

Write it plainly. Keep the evidence doc to the facts, numbers and file references, without narration.

## Gate before your final commit

- `pnpm --filter @patina/designer-portal type-check` passes.
- `pnpm --filter @patina/designer-portal lint` shows 0 errors (warnings are allowed).
- Every new spec has passed twice on both projects, or is marked fixme for a recorded defect.
- Every new SQL suite exits 0 under `psql -v ON_ERROR_STOP=1`.

## Report back (to the orchestrator, ≤ 600 words)

- your commit SHAs;
- per-criterion now-ratings;
- defects with their IDs;
- what is not verified;
- teardown confirmation.

Do not invoke the code-review skill.
