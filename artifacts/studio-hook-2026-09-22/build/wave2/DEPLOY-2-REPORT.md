# The Second House — Deploy 2 report (Wave 2)

**Ticket:** SQ-152 · **Executors:** attempt 1 `sq-152-w2-deploy-2-opus-high`, attempt 2 (rework) `sq-152-w2-deploy-2-opus-high-rework-1` — both Opus 5, high
**Authorization:** Kody said "ship Deploy 2" in-session 2026-09-23 (after Wave 2 completed on main `2a51ab9f7`).
**Base:** main `2a51ab9f70860ddac31e6f1b89f9e65b256b30e4` (Deploy 1 base was `1b19d8bb5`).
**Ran from:** `/Users/kody/Code/patina-merged` (main checkout). No git write command was run there; no `apps/*/.env.local` was read, repointed or edited; no code, migration, `wrangler.jsonc` or script was edited.

This report covers **two attempts**. Attempt 1 landed steps 1–3 and was refused at step 4's Phase 0 preflight; its record is kept verbatim below because the refusal was correct and the diagnosis is worth keeping. Attempt 2, dispatched as a rework under the orchestrator's `RESUME PROCEDURE` ruling (ticket comment `c_mueq17v0_2b5a61`), resumed at **step 4 only** and completed the chain. Migrations and the edge function were **not** re-run.

## Outcome: COMPLETE — all six steps landed

| Step | Unit | Result |
|---|---|---|
| 1 | Pre-flight | **PASS** (attempt 1) |
| 2 | Migrations 00658 + 00659 → Strata | **LANDED + VERIFIED** (attempt 1) |
| 3 | Edge function `designer-invite` → Strata | **LANDED** (attempt 1) |
| 4 | admin portal → Cloudflare | refused at Phase 0 in attempt 1 · **DEPLOYED `c32a8f0e` in attempt 2** |
| 4 | designer portal → Cloudflare | not attempted in attempt 1 · **DEPLOYED `13a0ff18` in attempt 2** |
| 5 | Probes (a)–(e) | **ALL PASS** |
| 6 | This report | committed in the executor's worktree |

---

## Attempt 2 pre-checks (rework)

**main has advanced one commit past the briefed base — recorded, not a red.** `main` = `dac89cdfa7444e5c701a34bb0a7f7937cfcedfda`, not `2a51ab9f7`. The delta `2a51ab9f7..dac89cdfa` is six **artifacts-only** files (`artifacts/ios27-delivery-plan-2026-09-23/{plan,research}/*.md`, `artifacts/ios27-opportunities-2026-09-23/deck/index.html`). Nothing under `apps/`, `packages/`, `supabase/` or `infra/`, so the code deployed is exactly Wave 2.

**Main-checkout cleanliness, verified without git.** The worktree-isolation guard refuses `git -C /Users/kody/Code/patina-merged …` and refuses `cd` into the shared checkout followed by git, so both of the brief's literal pre-flight commands (`git -C … rev-parse HEAD`, `git status --porcelain`) are mechanically unavailable to a worktree-isolated executor. Substituted a git-free equivalent: `diff -rq` between this executor's **clean** worktree at `dac89cdfa` and the main checkout for `apps/{admin,designer}-portal/src`, both `wrangler.jsonc` files, `infra/deploy-portal.sh`, `supabase/migrations`, and `packages/**`. Every tracked path **IDENTICAL**. The only differences were untracked noise: `.DS_Store` files, `apps/designer-portal/src/.claude/`, `packages/supabase/.env`, `packages/supabase/supabase/.temp`, `packages/patina-design-system/.dssync-tailwind.css`. So the main checkout built the committed tree.

`infra/deploy-portal.sh` byte-identical to attempt 1's copy — the script was not edited by anyone between attempts.

## Step 1 — Pre-flight (attempt 1, all green)

- Main checkout on `refs/heads/main`; `git rev-parse main` = `2a51ab9f70860ddac31e6f1b89f9e65b256b30e4` — matched the ticket base at that time.
- `ls supabase/migrations | tail` → local tip `00658_resume_middle_west_enrollments.sql`, `00659_pilot_terms_acceptance.sql`. **No 00660** (the reserved spare was never consumed).
- Two other entries in that directory are **pre-existing, not Wave 2**, so neither is a "file above 00659":
  - `20260910152111_create_contact_messages.sql` — imported at `fa17f9c48` (2026-09-10) and already applied remotely.
  - `_pending/00106_drop_client_messages.sql` — a tracked April parking lot; a subdirectory the CLI does not glob.
- `supabase migration list --linked --project-ref bkvcixdmuyejfzcijpdg` **before**: 611 rows parsed; exactly **2** pending local migrations (`00658`, `00659`); **zero** remote-only drift.
- `pnpm --filter @patina/designer-portal type-check` → **exit 0**, `0` lines matching `error TS`.
- Wave 2 edge-function diff (`git diff --name-only 1b19d8bb5..2a51ab9f7 -- supabase/functions`) = `designer-invite/{index.ts,lib.ts,index.test.ts}` only. **No `_shared/*` change and no `config.toml` change**, so there is no importer fan-out to redeploy.
- Only shared-package change in the wave is `packages/supabase/src/database.types.ts` (+6 lines — the generated types for the 00659 columns).

## Step 2 — Migrations (LANDED + VERIFIED, attempt 1 — NOT re-run in attempt 2)

```
supabase db push --linked --project-ref bkvcixdmuyejfzcijpdg --include-all
```
exit **0** · started `2026-09-23T22:43:36Z` · finished `2026-09-23T22:43:44Z`

```
Applying migration 00658_resume_middle_west_enrollments.sql...
Applying migration 00659_pilot_terms_acceptance.sql...
{"upToDate":false,"dryRun":false,"migrations":["00658_resume_middle_west_enrollments.sql","00659_pilot_terms_acceptance.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```

Ledger after: pending = **NONE**; `00658` and `00659` each present as both local and remote.

### Read-back (the real proof — the CLI suppresses `RAISE NOTICE`)

Via the Supabase Management API query endpoint with `read_only: true`, SELECT only. UUID prefixes only; **no emails and no secrets** are recorded here or were printed.

| row | BEFORE (22:40:51Z) | AFTER (22:43:53Z) |
|---|---|---|
| `24f71966…` / user `19e7ae9b…` | `paused`, next_step_at `2026-10-15 15:00:00+00`, current_step 10, history 11 | **`active`**, next_step_at **`2026-09-23 22:53:42.646317+00`**, current_step 10, history 12 |
| `82a64492…` / user `1a94f78f…` | `paused`, next_step_at `2026-10-15 15:00:00+00`, current_step 7, history 8 | **`active`**, next_step_at **`2026-09-23 22:53:42.646317+00`**, current_step 7, history 9 |
| `9ad7029e…` / user `86cdd0aa…` (QA seat) | `active`, `2026-09-28 13:30:08.601+00`, current_step 13, history 13, `md5(row)` = `a0fa9e179922de6836d0bd037e32ffbe` | **unchanged — `md5(row)` = `a0fa9e179922de6836d0bd037e32ffbe`** |

- Both Middle West seats resumed, re-anchored off the apply moment, `current_step` untouched, exactly **one** `step_history` entry appended each — 00658's documented shape.
- The QA seat is proven untouched by equality of `md5(e.*::text)` over the **whole row** before and after, which is the strongest available form of "byte-for-byte unchanged". 00658 also excludes it by construction (its `user_id` matches neither prefix).
- **Honest deviation from the ticket's literal wording.** The ticket asked for `next_step_at > now() + 10 min`. 00658 sets `now() + interval '10 minutes'` **at apply time**, so at read-back — 9 seconds later — it reads `now() + 00:09:48.9`, marginally under 10 minutes purely by the elapsed read delay. This is not a defect: the intent holds, because `next_step_at` is future-dated and a full tick beyond the 5-minute processor cadence, so no drip email fires on the deploy tick. The two seats became due ~`22:53:42Z`.
- 00659 columns on `public.profiles`, matching the migration's own ASSERT block:

| column | data_type | is_nullable | default |
|---|---|---|---|
| `pilot_terms_accepted_at` | `timestamp with time zone` | YES | `null` |
| `pilot_terms_version` | `text` | YES | `null` |

  The same query run **before** the push returned 0 rows, so the push is what created them.

## Step 3 — Edge function (LANDED, attempt 1 — NOT re-run in attempt 2)

`designer-invite` is `verify_jwt = true` in `config.toml:391-392`, so it was deployed plainly (no `--no-verify-jwt`).

```
supabase functions deploy designer-invite --project-ref bkvcixdmuyejfzcijpdg
```
exit **0** · `2026-09-23T22:47:11Z` → `2026-09-23T22:47:17Z`

```
Bundling Function: designer-invite
Deploying Function: designer-invite (script size: 156 kB)
{"project_ref":"bkvcixdmuyejfzcijpdg","functions":["designer-invite"],"message":"Deployed Functions."}
```

No stray `deno.lock` at the repo root afterwards (checked; absent).

**This function shipping ahead of the admin portal was safe** — the coupling was verified rather than assumed:
- `business_name` is an **optional** field on `InviteBody`. The old admin dialog omits it → `resolveBusinessNameForUpsert(existing, undefined)` returns `{businessNameKept: false}` with no `businessName`, so `profileUpsert` is byte-identical to the previous behavior.
- The one genuinely new runtime dependency is the added `SELECT business_name FROM profiles`. `public.profiles.business_name` **pre-exists** (type `text`, confirmed against Strata) — it is not introduced by 00658/00659 — so that leg cannot 500.
- The added `businessNameKept` response field is additive; a caller ignoring it is unaffected.
- The function contains no reference to `/pilot-terms`, so it could not link a new designer at a page that was not yet deployed.

As of attempt 2 the admin portal is now deployed, so this window is closed.

## Step 4 — Portals

### Attempt 1 — REFUSED at Phase 0 (kept on the record; nothing was built or uploaded)

```
./infra/deploy-portal.sh admin      # started 2026-09-23T23:02:17Z
```
Real script exit = **1**, at Phase 0, before any build or upload:

```
==> Deploying portal 'admin' to 'production'  (workspace package: @patina/admin-portal)
==> [0/3] Preflight: resolving client Supabase env the way next build will
ERROR: refusing to build admin portal — NEXT_PUBLIC_SUPABASE_STORAGE_KEY
       resolved EMPTY for /Users/kody/Code/patina-merged/apps/admin-portal. next build would inline an empty
       storage key and packages/supabase/src/client.ts's in-code fallback
       (sb-bkvcixdmuyejfzcijpdg-auth-token) would silently take over instead — set it
       explicitly in wrangler.jsonc's vars (or apps/admin-portal/.env.local
       for a local build) so it stays visible and greppable.
```

> **Trap worth recording:** attempt 1 ran this backgrounded and the harness reported "exit code 0". That was the wrapper's exit, not the script's. The real status came from `DEPLOY_EXIT=1` written into the log. A backgrounded deploy's completion notification must not be read as success. Attempt 2 guarded against this by making the wrapper `echo "EXIT=$?"` immediately after the script, and read that line (both portals: `EXIT=0`).

Attempt 1's standing diagnosis, still accurate:

1. **The gate is not new and Wave 2 did not touch it.** `infra/deploy-portal.sh` is **byte-identical** between Deploy 1's base `1b19d8bb5` and HEAD (`diff -q` → identical). The last change to the script, `70576fb30`, is an ancestor of `1b19d8bb5`.
2. **`wrangler.jsonc` is already correct and is not the build's input.** Phase 0b deliberately **excludes** the Supabase trio (`deploy-portal.sh:319` `TRIO_NEXT_PUBLIC_KEYS`, and `:514` "Supabase trio left to Phase 0 + Next's loader"), and the script's own comment at `:126-128` states a `wrangler.jsonc`-only value is invisible to `next build` because `NEXT_PUBLIC_*` is build-time-inlined.
3. **The resolver's inputs are the exported env first, then the app's `.env` chain** (`.env.production.local` > `.env.local` > `.env.production` > `.env`, `deploy-portal.sh:89-100`).

**Corrected in attempt 2 — attempt 1's "open question for Kody" rested on a false premise.** Attempt 1 concluded the `.env` chain must have changed between Deploy 1 (16:13Z) and its own run (23:02Z). It had not. Deploy 1's own report (`wave1/DEPLOY-1-REPORT.md:106-118`) records that `apps/*/.env.local` in the main checkout is **local-pointed** (`http://127.0.0.1:54321`) and that Deploy 1 shipped **both** portals by exporting the Supabase trio from each portal's committed `wrangler.jsonc` production `vars` block. That was already the standing procedure earlier the same day. Attempt 1 landed on the storage-key arm of the gate rather than Deploy 1's local-host arm only because a prod `NEXT_PUBLIC_SUPABASE_URL` happened to resolve in its shell; same root cause, different guard arm. Attempt 1's §"Why I stopped instead of working around it" and its "Recommended next action" are therefore **superseded** by the orchestrator's ruling: the export is the script's own documented highest-precedence operator override (`deploy-portal.sh:86-92`), the values are committed literals in `wrangler.jsonc` so the shipped config stays file-visible and greppable, and making Phase 0 read the trio from `wrangler.jsonc` is backlog, not this ticket.

### Attempt 2 — RESOLUTION: the documented operator override, script unchanged

Per portal, the Supabase trio was exported **in the same shell invocation** as the script, taken from **that portal's own** `wrangler.jsonc` **top-level production `vars` block** (the block above the first `"env"` key — the staging block was never touched; for admin that block is `apps/admin-portal/wrangler.jsonc:20-48` with `"env"` at `:49`, for designer `apps/designer-portal/wrangler.jsonc:25-73` with `"env"` at `:74`). No file was edited. Anon key masked below; it is the committed literal in each file, identical in both.

**Admin** — `apps/admin-portal/wrangler.jsonc` declares **no** `SUPABASE_ORIGIN_RUNTIME`, so none was exported and Phase 0 correctly reported it unset:

```
export NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.…(masked, 221 chars, anon role, ref bkvcixdmuyejfzcijpdg)
export NEXT_PUBLIC_SUPABASE_STORAGE_KEY=sb-bkvcixdmuyejfzcijpdg-auth-token
./infra/deploy-portal.sh admin
```

**Designer** — its production block **does** declare `SUPABASE_ORIGIN_RUNTIME` (`apps/designer-portal/wrangler.jsonc:67`), the sanctioned designer-prod repoint, so it was exported too:

```
export NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
export NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.…(masked, 221 chars, anon role, ref bkvcixdmuyejfzcijpdg)
export NEXT_PUBLIC_SUPABASE_STORAGE_KEY=sb-bkvcixdmuyejfzcijpdg-auth-token
export SUPABASE_ORIGIN_RUNTIME=https://api.patina.cloud
./infra/deploy-portal.sh designer
```

**Sandbox trap, same one Deploy 1 recorded.** The first (sandboxed) `deploy-portal.sh admin` invocation passed Phase 0 and Phase 0b cleanly, then died in Phase 1 with

```
x Git error: /Users/kody/Code/patina-merged/.codex/worktrees/agent-client-material/apps/client-portal/.env.local: Operation not permitted (os error 1)
```

Turborepo hashes every workspace file and this session's sandbox denies reads of `**/.env.*`. Not a build failure and not caused by anything in the repo: the identical command re-run with the sandbox lifted for that one command proceeded normally. Nothing in the repo or the script changed between the two runs. (Note the offending path is a **stale `.codex/worktrees/` checkout**, not one of the two portals being deployed — worth a separate cleanup ticket.)

#### admin — DEPLOYED

`./infra/deploy-portal.sh admin` · script **EXIT=0** · `2026-09-23T23:30:08Z` → `2026-09-23T23:32:17Z`

```
==> [0/3] Preflight OK: NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
==> [0/3] Preflight OK: runtime-origin path resolves (SUPABASE_ORIGIN_RUNTIME=<unset, inherits build-time URL>)
==> [0b/3] Preflight OK: 12 NEXT_PUBLIC_* vars exported (Supabase trio left to Phase 0 + Next's loader)
==> [2.6/3] Chunk gate: 348 client chunks; checking every exported NEXT_PUBLIC_* name
==> [2.6/3] Chunk gate: resolved PostHog key literal present in 2 chunk(s)
==> [3/3] Deploying the admin portal to Cloudflare Workers
Deployed patina-admin-portal triggers (0.94 sec)
Current Version ID: c32a8f0e-0ac4-401c-92d0-1a21cdb49a8b
==> Done: admin portal deployed to production.
```

Phase 2.6 passed with **zero** `survives in N chunk(s)` warnings (`grep -c 'survives in'` = 0) — every exported `NEXT_PUBLIC_*` name was inlined, none left as a runtime property access. Four new/modified static assets uploaded (372 already present), and one of them is exactly the surface this wave changed:

```
+ /BUILD_ID
+ /_next/static/chunks/app/(dashboard)/studios/[id]/page-e4fad6ce0935b44f.js
+ /_next/static/chunks/app/(dashboard)/studios/page-74ffdd990baddf6a.js
+ /_next/static/chunks/app/(dashboard)/users/page-696844d8cd6d872c.js
```

#### designer — DEPLOYED

`./infra/deploy-portal.sh designer` · script **EXIT=0** · `2026-09-23T23:34:47Z` → `2026-09-23T23:36:26Z`

```
==> [0/3] Preflight OK: RUNTIME REPOINT ACTIVE → https://api.patina.cloud (storage pinned direct)
==> [0/3] Preflight OK: NEXT_PUBLIC_SUPABASE_URL=https://bkvcixdmuyejfzcijpdg.supabase.co
==> [0/3] Preflight OK: runtime-origin path resolves (SUPABASE_ORIGIN_RUNTIME=https://api.patina.cloud)
==> [0b/3] Preflight OK: 8 NEXT_PUBLIC_* vars exported (Supabase trio left to Phase 0 + Next's loader)
==> [2.6/3] Chunk gate: 247 client chunks; checking every exported NEXT_PUBLIC_* name
==> [2.6/3] Chunk gate: resolved PostHog key literal present in 9 chunk(s)
==> [3/3] Deploying the designer portal to Cloudflare Workers
Uploaded patina-designer-portal (27.08 sec)
Deployed patina-designer-portal triggers (0.80 sec)
Current Version ID: 13a0ff18-511d-479b-b948-3923669bed3a
==> Done: designer portal deployed to production.
```

Phase 2.6 again clean (`grep -c 'survives in'` = 0). The `RUNTIME REPOINT ACTIVE` line matches Deploy 1's designer run exactly, and wrangler's own binding table confirms the Worker carries `env.SUPABASE_ORIGIN_RUNTIME ("https://api.patina.cloud")` at runtime. Seven new/modified assets uploaded (279 already present), including `app/(document)/layout-1c11b329d0fcca67.js` — the chunk that carries the P3 Accounts-export act (see probe b).

Both runs emitted wrangler's standing `Multiple environments are defined … no target environment was specified` **warning**. Benign and expected: omitting `-e` targets the top-level (production) environment, which is what `deploy-portal.sh` intends; both deploys landed on the production Workers `patina-admin-portal` / `patina-designer-portal`, not the `-staging` ones.

### `wrangler deployments list` (oldest-first — bottom row is newest)

| worker | newest version | version created | deployment created | vs deploy start |
|---|---|---|---|---|
| `patina-admin-portal` | `c32a8f0e-0ac4-401c-92d0-1a21cdb49a8b` | `2026-09-23T23:32:07.187Z` | `2026-09-23T23:32:14.580Z` | **after** `23:30:08Z` ✓ |
| `patina-designer-portal` | `13a0ff18-511d-479b-b948-3923669bed3a` | `2026-09-23T23:36:22.170Z` | `2026-09-23T23:36:25.106Z` | **after** `23:34:47Z` ✓ |

The row above each is Deploy 1's (`044936f8` at 16:13:22.651Z, `b61988c8` at 15:32:32.739Z), so each worker advanced by exactly one deployment.

## Step 5 — Probes (read-only, all PASS)

### (a) `/pilot-terms` signed-out — PASS

```
curl -sS -o /dev/null -w '%{http_code} %{redirect_url}' https://app.patina.cloud/pilot-terms
→ http_code=200  redirect_url=(empty)
```

**200, not a 307 to `/auth/signin`** — SQ-160's addition of the route to the middleware's `isLegalPage` is live. Control in the same run: `https://app.patina.cloud/desk` signed-out returns **307 → `https://app.patina.cloud/auth/signin?callbackUrl=%2Fdesk`**, so the carve-out is scoped to the legal page and did not loosen auth elsewhere.

Body (30,701 bytes) content gates. The served HTML is a single line with an embedded RSC flight payload, so `grep -c` (a **line** count) is unusable; counts below are true occurrence counts (`grep -o … | wc -l`), and the copy gates were additionally re-run against the **visible text only**, with every `<script>`/`<style>` block stripped, so framework machinery can neither mask nor fake a result:

| check | raw body | visible copy |
|---|---|---|
| `governed by the laws of the State of Minnesota` | 2 | **1** ✓ |
| `hello@patina.cloud` | 8 | **2** ✓ |
| `thirty days` | 2 | **1** ✓ |
| `30 days` | 0 | 0 (the "thirty days"/"30 days" requirement is satisfied by the spelled form) |
| `pledge` (i) | 0 | **0** ✓ |
| `commission` (i) | 0 | **0** ✓ |
| `royalt` (i) | 0 | **0** ✓ |
| `\bbeta\b` (i) | 0 | **0** ✓ |
| `\$[0-9]` | 12 | **0** ✓ |
| `AI` (whole word) | 0 | **0** ✓ |

The brief's literal `grep -ciE 'pledge|commission|royalt|\bbeta\b|\$[0-9]'` returns **1** rather than 0. Decomposed, that is **not** a copy defect: all four word alternatives are 0, and the whole of it is the 12 `$[0-9]` hits, every one a React Server Component flight-payload reference (`[\"$\",\"$1\",…`, `\"style\":\"$0:f:0:1:…`, `\"G\":[\"$16\",[]]`, `\"$18\"`, `$W1a`). In the visible copy `\$[0-9]` is **0** — there is no money figure on the page. `apps/designer-portal/src/app/(legal)/pilot-terms/page.tsx` also returns 0 for the same expression, confirming the source carries none.

### (b) Designer chunk grep — PASS (stronger than asked: byte-identity, not just presence)

Chunk located by grepping the freshly built assets, not guessed: both literals live in **one** chunk, `app/(document)/layout-1c11b329d0fcca67.js`, which is one of the seven assets this deploy uploaded.

```
URL: https://app.patina.cloud/_next/static/chunks/app/(document)/layout-1c11b329d0fcca67.js
http=200 · 198,355 bytes
```

| literal | occurrences in the SERVED chunk |
|---|---|
| `carries no path to this studio` (SQ-173 withheld-copy fix) | **1** ✓ |
| `total_billed_excluding_void_draft_minor` (manifest key) | **2** ✓ |
| `voided_or_draft_billed_minor` | 2 |
| `projects_named_by_an_invoice_outside_this_studio` | 1 |

Freshness proven two independent ways, because this is the exact failure mode of the 2026-08-26 deploy-placeholder incident:
- `sha256` of the served chunk = `407cdb6ff2e900be28df4754099930d5afd82e9f409b7b581e7ae8944f249573` = `sha256` of the locally built `.open-next/assets/…/layout-1c11b329d0fcca67.js`. **Byte-identical**, so what is served is this build's artifact, not a cached predecessor.
- Served `/BUILD_ID` = `6-boIZHj-9K3wlDPKC5eK` = the built `BUILD_ID`.

### (c) Admin chunk grep — PASS

The invite dialog's Studio Name input is `apps/admin-portal/src/components/users/InviteDesignerDialog.tsx:147-159`; the exact literals were read from source rather than guessed — `<Label htmlFor="designer-business-name">Studio Name (optional)</Label>` over the `maxLength={255}` `<Input>` whose placeholder is `Studio name (optional)`.

```
URL: https://admin.patina.cloud/_next/static/chunks/app/(dashboard)/users/page-696844d8cd6d872c.js
http=200 · 30,512 bytes
```

| literal | occurrences in the SERVED chunk |
|---|---|
| `Studio Name (optional)` (the label) | **1** ✓ |
| `designer-business-name` (the input id, label `htmlFor` + input `id`) | **2** ✓ |
| `Studio name (optional)` (the placeholder) | **1** ✓ |
| `never overwrites it` (the P4 helper sentence) | **1** ✓ |

### (d) `/api/version` — PASS (liveness only)

`https://admin.patina.cloud/api/version` = **200**, `https://app.patina.cloud/api/version` = **200**. Liveness only: per patina-verification these return static fallback defaults on the Workers path, so the version strings prove nothing about freshness. Freshness is carried by (b)'s sha256/BUILD_ID identity and by the `deployments list` bottom rows.

### (e) `wrangler tail patina-designer-portal --format json` — PASS

**First pass failed for an environment reason, recorded rather than hidden:** the bounding wrapper used `timeout 70`, and macOS ships no `timeout` (that is `gtimeout`, from coreutils). The tail never attached — `wrangler tail: command not found` in stderr, 0 event lines — so that pass proves nothing and was discarded. Re-run bounding the tail by killing its PID instead.

Second pass: `2026-09-23T23:42:24Z` → `23:43:37Z`, 20s to attach then a 60s traffic window of six `/pilot-terms` + six `/desk` fetches (signed-out; `/desk`'s redirect is expected).

```
npx wrangler tail patina-designer-portal --format json    # pid 55954, killed at the end
```

1,212 captured lines = **12 events**, one per request:

| field | result |
|---|---|
| `outcome` | `ok` × 12 — no other value |
| `exceptions` | `[]` × 12 (the only 12 matches for `exception` in the whole capture are these empty keys) |
| `logs` | `[]` × 12 — no console output at all |
| `url` | `https://app.patina.cloud/pilot-terms` × 6, `https://app.patina.cloud/desk` × 6 |
| `response.status` | `200` × 6 (pilot-terms), `307` × 6 (desk) |
| `scriptVersion.id` | `13a0ff18-511d-479b-b948-3923669bed3a` × 12 |

**No error lines of any kind.** The `scriptVersion.id` on every event is the version this run deployed, which is the strongest freshness evidence in this report: the Worker itself attests that the requests were served by the new deployment, independent of asset hashes.

**Tail stopped.** `pgrep -fl 'wrangler tail'` afterwards → `NONE: no wrangler tail process remains`. (A stray `wrangler tail` has been left running in this repo before; both the kill and the check are deliberate.)

## What was NOT verified

- **Custom-domain routing.** No `routes` block exists in any `wrangler.jsonc`; the `patina.cloud` hostnames are dashboard-managed out-of-band. The canonical Worker URLs are `patina-*.kody-be3.workers.dev`. Both `patina.cloud` hostnames answer and served this build's assets, but the routing configuration itself was not inspected.
- **Signed-in surfaces.** The Accounts export download and the admin invite dialog's rendered behavior need Kody's credentials. The served-chunk greps in (b) and (c) are the stand-in, as the brief specified; Kody walks the signed-in paths.
- **A live `designer-invite` send** — deliberately refused as a non-goal: it mints an account + role grant + a studio via the 00295 trigger and there is no documented studio-delete path (Deploy 1 set this precedent). Kody can send one to a Patina-owned mailbox himself. The P4 end-to-end chain — admin dialog → function `business_name` → profile — is therefore unexercised in production; each half is verified independently, their join is not.
- **PostHog flags** — untouched, as instructed.
- **Drip-email side effect.** The two resumed Middle West seats became due ~`22:53:42Z`, roughly 40 minutes before the portals shipped. The DB state was verified; no actual send was observed in `notification_log`, and no check was made for whether a drip step fired against the pre-Deploy-2 portal build.
- **`/pilot-terms` acceptance write.** 00659's columns exist and the page serves, but nothing wrote `pilot_terms_accepted_at` — the accept leg is signed-in and was not exercised.
- **The broad suite.** No `pnpm test` / `pnpm build` was run in either attempt; this is a deploy ticket and the orchestrator owns the combined post-integration gate. Attempt 1's `pnpm --filter @patina/designer-portal type-check` (exit 0) is the only source gate in the record.
- **Story-log entry #19.** `pulse` warns that the US-7 decision log gained entry #19 after SQ-152 was prepared, so it is not in this briefing. It was not read; a `story show` returned the SQ-173 ticket body rather than the log, and chasing it further was not worth the context against a deploy-only contract. Flagged for the orchestrator in case #19 bears on Deploy 2.

## Timeline (UTC, 2026-09-23)

| time | event |
|---|---|
| 22:38 | Attempt 1 pre-flight started (HEAD, migration tip, ledger) |
| 22:40:51 | Enrollment BEFORE baseline captured |
| 22:43:36 → 22:43:44 | `supabase db push` — 00658 + 00659 applied |
| 22:43:53 | Read-back verified; ledger shows nothing pending |
| 22:47:11 → 22:47:17 | `designer-invite` deployed |
| 23:02:17 | `deploy-portal.sh admin` → **refused at Phase 0** (attempt 1 ends) |
| 23:15:33 | Orchestrator posts the `RESUME PROCEDURE` ruling |
| 23:17:00 | Attempt 2 claims SQ-152 |
| 23:29:08 | Sandboxed `deploy-portal.sh admin` — Phase 0/0b pass, Phase 1 dies on the sandbox `.env.local` read |
| 23:30:08 → 23:32:17 | **`deploy-portal.sh admin` EXIT=0 → `c32a8f0e`** |
| 23:34:47 → 23:36:26 | **`deploy-portal.sh designer` EXIT=0 → `13a0ff18`** |
| 23:36:05 / 23:41:19 | `wrangler deployments list` bottom rows confirm both new deployments |
| 23:37–23:41 | Probes (a)–(d): pilot-terms 200 + copy gates, both chunk greps, sha256/BUILD_ID identity |
| 23:41:40 → 23:42:11 | Probe (e) first pass — `timeout` absent on macOS, tail never attached; discarded |
| 23:42:24 → 23:43:37 | **Probe (e) re-run: 12 events, all `outcome: ok`, all served by `13a0ff18`, tail stopped** |
| 23:47 | Report committed in the executor's worktree; SQ-152 submitted |

## Standing follow-ups for the orchestrator / Kody

1. **Backlog, not this ticket:** make `deploy-portal.sh` Phase 0 read the Supabase trio from the target's `wrangler.jsonc` production `vars`, so the operator override stops being required on a machine whose `apps/*/.env.local` is local-pointed. Today every portal deploy depends on the operator remembering four export lines; the gate's message still tells the operator to edit a file instead.
2. **Cleanup ticket:** the stale `.codex/worktrees/agent-client-material/` checkout inside the repo is what Turborepo's file hashing trips over under the sandbox. Removing it would make sandboxed portal deploys possible.
3. Kody's signed-in walk: `/pilot-terms` at 1440/1024/390, the Accounts export download, and the admin invite dialog's Studio Name field against a real invite.
