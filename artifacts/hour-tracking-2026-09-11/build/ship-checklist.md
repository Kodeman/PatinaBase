# Ship checklist — hour tracking

Branch `hour-tracking/integration` @ **`5ffe24667`** (pushed). `origin/main` (`b88fd4c5`) is
an ancestor (`git merge-base --is-ancestor` → true). Written by the product + ship-readiness
reviewer; revised at integration rounds 2 and 3, rewritten at integration round 4,
2026-09-14 (closing R4-M2 of `final-review-money-security-r4.md` — the checklist had briefly
not heard HT-10-b's and HT-13-b's rulings, corrected in that same pass; G3 and the P2-n1 item
below are struck as CLOSED, kept only as history), and **rewritten again by the ship
orchestrator, 2026-09-15**, to record **HT-13-c**, which resolves `final-review-money-
security-r4.md`'s **R4-M1**, and to close the remaining gate-hygiene items (§0b's flag-gate
sentence, §1①'s `_shared` diff-check, R4-n3's next-env.d.ts note). Every step below was
either measured this session, measured at integration round 4, or is named as unmeasured.
The reviews are `final-review-product-ship-r4.md` and `final-review-money-security-r4.md`;
the last fix pass is `final-fix-r3.md`.

> **Authorization.** Nothing here has been run against Strata. Rounds 3 (fix) and 4 made
> **zero** prod contact of any kind — not even a read-only `supabase migration list --linked`.
> The chain below needs an explicit "ship it" in the session that runs it. Program ruling
> **P-3**: one ship at the end, all three phases (DB/functions/portals, iOS, Sanity — Sanity
> is not part of this program's diff and is not in this checklist), no flag.

> **Flag gate, as read this session.** The PostHog MCP token is expired and the Chrome
> extension is disconnected, so the two rollouts could not be read live in this session; the
> recorded state is agreement-parts (872155) enabled for all users on 2026-09-08 and
> studio-workspaces (757790) at 100% since 2026-07-12 (memory). This is a **recorded** state,
> not a live read — **§0b** below still names the live-read steps for whoever runs the push,
> and the ship report must carry this same sentence, unaltered, rather than a claim of having
> read the dashboard this session.

## One gate is open, one is recorded-not-live, one is settled by ruling. Read these before typing any command.

> ⚠ **G1 — the two PostHog rollout percentages: RECORDED, not read live this session.**
> `studio-workspaces` and `agreement-parts` gate the doors this program's rate card hangs
> inside. Per the orchestrator, the PostHog MCP token is expired and the Chrome extension is
> disconnected in this session, so a live read was not attempted here (five prior failed
> attempts across the program are on record — §0b) — per the memory sentence in the header,
> the recorded state is **agreement-parts (872155) enabled for all users on 2026-09-08** and
> **studio-workspaces (757790) at 100% since 2026-07-12**. Applying the
> checklist's own decision rule (both at 100% → ship as planned) to that recorded state: **ship
> as planned.** This is not the same as having read the dashboard today — if a live read
> becomes possible before the push runs, take it and prefer it over the recorded figure; §0b
> below still names the exact steps. Write the flag-gate sentence verbatim into the ship
> report either way; never write it as a live read.
>
> Why it matters, measured at rounds 2 and 3: **`studio-workspaces` gates the ENTIRE
> `AccountStudioPage`** (`account-sheet.tsx:105`, `:272`). With it off there is no STUDIO tab
> at all, `/desk?account=studio` reconciles to Profile in silence, and a studio the rollout has
> not reached has **no door** to set a per-member rate — so every services hour prices
> `rate_source='none'`, prints "rate pending", and (since MS-01) cannot reach an invoice at all.
> **`agreement-parts`** gates HT-4's rate card, the role picker, `+ Add a role` and
> `rateCardForSave` (`account-studio-page.tsx:198`, `:1134`).
>
> ⛔ **G2 — `supabase db push --include-all` cannot be run from the linked checkout as it
> stands (R3-M3 / P2-M1). Re-measured at round 4 and still true**, without touching Strata:
> `ls /Users/kody/Code/patina-merged/supabase/migrations/*.sql | tail -1` is
> `00580_room_concept_render.sql`. The linked checkout's working tree has no file for anything
> after `00580`; run there today, `db push --include-all` pushes **nothing** and reports
> success. **§0a** is the fix, as explicit steps.

> ✅ **G3 — MS-15 / HT-10-b is RULED and CLOSED as a gate.** Kody ruled it 2026-09-14: a
> project's LEAD DESIGNER keeps her per-row read of her project team's time rows, **rates
> included**; the pre-existing `designer_id` policy (00177:136-137) stands and **no code
> changes**. `rulings.md`'s HT-10-b row is amended to say the exception covers **bulk,
> per-member reads AND writes on the projects she leads** — not one row at a time. Option (b)
> (a GRANT-level column split on `hourly_rate_cents` / `rated_amount_cents` / `notes` plus a
> definer correction RPC) is owed follow-up work, **not** a ship gate.

> ✅ **P2-B1 IS CLOSED** — the rollups, "the entries", the CSV and the statement take the same
> INSTANT window `mine` uses. Verified at round 3 twice, independently.
>
> ✅ **P2-n1's residual / R3-M2 IS CLOSED by HT-13-b** — day and week labels everywhere are
> derived in the CALLER's timezone, passed as an IANA name. Re-measured in a browser at round
> 4, zone `America/Chicago`, clock fixed at Sun 13 Sep 2026 21:30 local, one hour at 21:05
> local (02:05Z on the 14th): `MINE` prints **13 SEPTEMBER**, `THE STUDIO → BY DAY` prints
> **2026-09-13**, `BY WEEK` prints **2026-W37**, `THE ENTRIES` prints **2026-09-13**, and the
> CSV's Date column is **"2026-09-13"**. One hour, one day, every lens.

> ✅ **HT-13-c IS RULED — ruling-only, ZERO code change.** Resolves `final-review-money-
> security-r4.md`'s **R4-M1**: `resolve_time_rate_cents`'s tier-2 leg (the per-member
> `studio_member_rates` row) picks its `effective_from` / `effective_to` span on the **UTC**
> calendar date of the instant — unchanged by HT-13-b, which only moved PRINTED labels into
> the caller's zone. Ruled 2026-09-14: **a `studio_member_rates` row's `effective_from` /
> `effective_to` are compared in UTC — server truth. Only PRINTED dates follow the viewer's
> zone.** A rate set "from the 14th" governs hours whose UTC date is the 14th, regardless of
> what day any lens prints for that hour. Consequence, stated rather than hidden: west of UTC,
> an hour every printed surface calls "the 13th" can be priced by a rate card effective "the
> 14th." No code moves; `00599` is correct as written. Recorded as a row in `rulings.md`
> ("Integration round 4"). **Tell Leah** — see §2 item 8.

---

## 0 · Preconditions (all re-measured at round 4, on `5ffe24667`)

| Precondition | State |
|---|---|
| `infra/deploy-portal.sh` present and unchanged vs `origin/main` | ✅ `git diff --stat origin/main...HEAD -- infra/ 'apps/*/wrangler.jsonc' '*.env*' package.json turbo.json pnpm-lock.yaml` is **empty** |
| `apps/*/wrangler.jsonc` `vars` untouched | ✅ same empty diff |
| No new `process.env` read in shipped portal code | ✅ the only new reads are in `playwright.hours.config.ts` and `e2e/document/hours.spec.ts` (test-only, not bundled) |
| No new edge-function env var prod lacks | ✅ new `Deno.env.get` reads are `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SECRET_KEYS`; the third is already read by the live `client-invite` |
| No `supabase/functions/_shared/*` edit (no fan-out redeploy) | ✅ empty. Function diff is `digest-dispatcher/{index,status,status.test}.ts`, `qbo-export/index.ts`, and the new `time-nudges/` |
| `time-nudges` registered in the **committed** `config.toml` | ✅ `git show HEAD:supabase/config.toml` → `[functions.time-nudges] verify_jwt = true`. ⚠ the WORKING-TREE copy in `.codex/worktrees/agent-integration` is the skip-worktree'd isolated-stack file (`project_id = "patina-hours"`, ports 54421/54422) — **never commit it** |
| `packages/supabase/src/database.types.ts` in sync | ✅ `SUPABASE_DB_URL=…54422 pnpm db:generate` → empty `git diff` |
| `supabase/seed/00-legacy-grants.sql` regenerated | ✅ `python3 scripts/generate-legacy-grants.py` — "baseline + **2651** replayed statements", empty `git diff` |
| Migration numbers vs Strata | ✅ `00595–00620` are all new; `00609` is **deliberately unused**, so the block is **25 files across 26 numbers**. The peer program's `00592–00594` and `00621–00627` are on other branches and are NOT part of this push |
| Worktree clean | ✅ `git status --porcelain` empty; `git ls-files -v \| grep ^S` → `supabase/config.toml` only (skip-worktree, never committed) |
| **`apps/designer-portal/next-env.d.ts` — DO NOT COMMIT** | ⚠ (R4-n3) A sandboxed `next dev`/`next build` rewrites this file to point at `./.next/dev/types/routes.d.ts`; a fresh worktree can show it modified. It is a Next build artifact, not program content. If the ship commit is cut from a worktree where this file shows modified, stage the ship commit with **explicit pathspecs that exclude it** (N-11) — never `git add -A`, never this file. Same treatment for any stray `apps/designer-portal/e2e/r4-walk/` or `playwright.r4walk.config.ts` left by a review pass. |

### Gates, round 4, in the reviewer's own lens

| Gate | Command | Result |
|---|---|---|
| designer-portal types (the real gate) | `pnpm --filter @patina/designer-portal type-check` | **PASS** — exit 0 |
| designer-portal unit, run ALONE | `pnpm --filter @patina/designer-portal test` | **PASS** — `Test Suites: 581 passed, 581 total / Tests: 7452 passed, 7452 total / Snapshots: 1 passed`, 30.3 s |
| designer-portal lint (the one config that resolves) | `pnpm --filter @patina/designer-portal lint` | **PASS** — exit 0, `✖ 202 problems (0 errors, 202 warnings)` |
| client-portal types | `pnpm --filter @patina/client-portal type-check` | **PASS** — exit 0 |
| client-portal unit (coverage floor enforced) | `pnpm --filter @patina/client-portal test` | **PASS** — `151 passed, 151 total / 2475 passed` |
| admin-portal build (the repo's strictest gate) | `pnpm --filter @patina/admin-portal build` | **PASS** — exit 0, full route table |
| `@patina/supabase` types + unit | `type-check` / `test` | **PASS** — exit 0; `Test Files 102 passed (102) / Tests 1259 passed \| 12 skipped` |
| SQL, whole tree | `./scripts/run-sql-tests.sh -d …/supabase/tests -H 127.0.0.1 -p 54422` | `total 188 · green 162 · expected-fail 23 · **unexpected 3** · effective **185/188**`. Run twice, identical. **The three standing reds are named below.** |
| Edge functions | `deno test --allow-all --config supabase/functions/deno.json supabase/functions/time-nudges/index.test.ts supabase/functions/digest-dispatcher/status.test.ts` | **`ok \| 18 passed \| 0 failed`** (69 ms). No stray `deno.lock` at the worktree root |
| `qbo-export` type | `deno check --config supabase/functions/deno.json supabase/functions/qbo-export/index.ts` | **clean**, exit 0 |
| Hours e2e, **flags ON** | `PLAYWRIGHT_DESIGNER_PORT=3100 … NEXT_PUBLIC_FLAG_OVERRIDES='studio-workspaces:true,agreement-parts:true' … --config playwright.hours.config.ts e2e/document/hours.spec.ts` | **8 passed** (1.9 m) — incl. `[8/8] the studio rate card stands on the Account sheet`. *(fix round 3 did not re-run this after editing `hours-ledger.tsx`; round 4 did.)* |
| Hours e2e, **flags absent** | same without `NEXT_PUBLIC_FLAG_OVERRIDES` | **7 passed, 1 skipped** (2.1 m). The one-case difference is P2-M3's proof |
| Generated types | `pnpm db:generate` + `git diff` | **IN SYNC** |
| ACL seed | `python3 scripts/generate-legacy-grants.py` + `git diff` | **IN SYNC** — 2651 statements |
| iOS | `apps/mobile/Capture/scripts/capture-gate.sh all` on `.codex/worktrees/agent-ios` @ `35336ba7a` (`git diff 35336ba7a..5ffe24667 -- apps/mobile` is **empty**) | **PASS** — `✔ build · ✔ tests · ✔ lint · ✔ fc-r3 sweep (inbox) · ✔ fc-r3 sweep (ai) · ✔ principle-4 sweep`. **Simulator only — never device-verified** |

#### The three standing SQL reds — none is this program's

1. `edge_api/catalog_roles_remote_conformance_negative_test.sql` — the file hard-refuses any
   port but 54322; an isolated-stack artifact.
2. `proposals/proposal_copy_immutability_test.sql` — column census drifted by `subject`, added
   by `00590` **on `origin/main`**.
3. `mood_boards/project_board_share_test.sql` — **new at round 4, and pre-existing in cause.**
   `:899` asserts `metadata->>'headline' = 'A guest approved Proposal board note'` and gets
   `'A guest approved Reactable note'`. `notification_log.created_at` defaults to `now()`
   (transaction timestamp), the whole file runs in ONE transaction, and the SELECT is
   `ORDER BY created_at DESC LIMIT 1` — so the two guest-reaction rows written in that
   transaction are a **tie**, and which one wins is heap/plan order. The program touches
   nothing under `supabase/tests/mood_boards/` or `notification_log`
   (`git diff --name-only origin/main..HEAD` is empty for both). Deterministic on this stack
   today (3/3). **Owed: one `KNOWN_FAILURES.md` line, or a tie-break on `id` in the test.**

> ℹ The runner also prints *"1 known-failure file(s) now pass"*. That is
> `commercial/direct_order_attribution_test.sql`, whose `KNOWN_FAILURES.md` entry already says
> it **fails only between 00:00 and 02:00 UTC**. Green outside that window is expected, not a
> signal.

### `--include-all` — YES, it is required

Strata's newest applied version is the timestamp file `20260910152111`, which sorts *after*
every `NNNNN_` name, so a plain `supabase db push` refuses. Use
`supabase db push --include-all`.

---

### §0a · WHERE the push runs from — G2, as explicit steps

Neither checkout can run it as it stands:

* `/Users/kody/Code/patina-merged` **is** the linked checkout
  (`supabase/.temp/project-ref` = `bkvcixdmuyejfzcijpdg`) but its working tree is on **stale
  local `main`**, whose `supabase/migrations/` still ends at `00580`.
* `.codex/worktrees/agent-integration` has every file but is **not linked** (no
  `supabase/.temp/project-ref`) and its `supabase/config.toml` is the skip-worktree'd
  isolated-stack one. **Never ship from there.**

Run these five steps, in order, and check each expectation before going on.

```bash
# 1 — merge the integration branch into main, from the INTEGRATION worktree
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-integration fetch origin
git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-integration \
    push origin hour-tracking/integration:main
#   (or open/merge the PR — either way, origin/main must end up containing 5ffe24667)

# 2 — bring the LINKED checkout up to it
git -C /Users/kody/Code/patina-merged fetch origin
git -C /Users/kody/Code/patina-merged pull --ff-only origin main
git -C /Users/kody/Code/patina-merged log --oneline -1
#   expect: a commit containing 5ffe24667's tree

# 3 — count the migration files in the LINKED checkout
ls /Users/kody/Code/patina-merged/supabase/migrations/*.sql | wc -l
#   expect: 570      (545 on origin/main b88fd4c5, + this program's 25)

ls /Users/kody/Code/patina-merged/supabase/migrations/*.sql \
  | sed 's#.*/##' | awk -F_ '$1 >= "00595" && $1 <= "00620"' | wc -l
#   expect: 25       (00609 is deliberately unused — 25 files across 26 numbers)

ls /Users/kody/Code/patina-merged/supabase/migrations/*.sql | tail -3
#   expect, in this order:
#     …/00619_countersign_rate_binding_carry.sql
#     …/00620_legacy_project_studio_stamp.sql
#     …/20260910152111_create_contact_messages.sql
#   NOTE: use the *.sql glob. A bare `ls …/supabase/migrations | tail -3` prints the
#   `_pending/` DIRECTORY last (it sorts after the timestamp name) and looks wrong.

# 4 — prove the linked checkout now has a local file for every remote version
supabase migration list --linked | tr ',' '\n' | grep -c '"local":""'
#   expect: 0        (any non-zero means step 2 did not land — STOP)

# 5 — and only then, from /Users/kody/Code/patina-merged:
#     the chain in §1 below.
```

If step 4 is non-zero, **stop**. A `db push --include-all` from a tree missing the files is a
silent no-op that reports success.

---

### §0b · READ THE TWO FLAG ROLLOUTS — G1, as explicit steps

Both numbers go in the ship report **before** `db push`. Project is settled: **326191 "Patina
Website"**, token `phc_D6Rf7ZYD5L7cTCgP1aBIV6kgANIFGnsbEgoYPXpsaNG`, matching
`apps/designer-portal/wrangler.jsonc:33`.

```bash
# A — preferred: the PostHog MCP, if its token has been re-authorized
#     tool  mcp__plugin_posthog_posthog__exec
#     call  feature-flag-get-all {}
#     then, per flag, read `active` and `filters.groups[].rollout_percentage`
#     (five sessions running, this has answered:
#      `MCP server "plugin:posthog:posthog" requires re-authorization (token expired)`)

# B — the web UI, which needs no token refresh
open 'https://us.posthog.com/project/326191/feature_flags?search=studio-workspaces'
open 'https://us.posthog.com/project/326191/feature_flags?search=agreement-parts'
```

Record, verbatim, for each of `studio-workspaces` and `agreement-parts`: **enabled yes/no**,
**rollout %**, and **any release-condition cohort**. Then decide, in the ship report:

* both at 100 % → ship as planned;
* either below 100 % → **say so to Kody before the push**, because a studio the rollout has not
  reached gets the whole program with **no door to set a rate**, and P-5 ("the program adds no
  flag") describes the code, not the doors it hangs inside.

> As of this ship pass, the token/extension are still down and no live read was attempted
> here; the ship report carries the **recorded** state from the header's memory sentence
> instead, per G1 above. If whoever runs the push CAN get a live read (token re-authorized,
> extension reconnected), take it and record the live numbers in place of the recorded ones —
> this section is what to do with either.

---

## 1 · Deploy order

House order is migrations → functions → services → portals. **Two deliberate departures, both
with a stated reason.**

### ① Edge functions FIRST (before `db push`)

**Before deploying, confirm no `_shared` file changed** (a `_shared/*` edit requires
redeploying EVERY importing function, not just these three):

```bash
git -C /Users/kody/Code/patina-merged diff --name-only \
    origin/main...hour-tracking/integration -- supabase/functions/_shared
#   expect: EMPTY.
#   If non-empty: for each changed _shared file, find every importer
#   (grep -rl '_shared/<file>' supabase/functions --include='*.ts') and add its
#   function to the deploy list below, or the stale copy ships.
```

Verified empty on `5ffe24667` at integration round 4 (§0's precondition table above); the
only changed function directories are `digest-dispatcher/`, `qbo-export/`, and the new
`time-nudges/` — all three are already in the list below.

```bash
supabase functions deploy digest-dispatcher
supabase functions deploy time-nudges
supabase functions deploy qbo-export
```

* `digest-dispatcher` must carry the `time_entry_running_long` /
  `time_weekly_unlogged_reminder` exclusion **before** `00614`'s cron can write the first nudge
  row — otherwise a nudge is folded into a `weekly_inspiration` email, which HT-34 forbids by
  name. (Verified in the diff: both keys are in `DIGEST_EXCLUDED_TYPES`, which moved from
  `index.ts` to the tested `status.ts`.)
* `time-nudges` must exist before `00614` schedules `time-nudges-hourly` at `0 * * * *`, or the
  first tick after the push 404s into `net._http_response`.
* `qbo-export` carries MS-04's CSV-formula-injection fix. It is the AP-side export the same fix
  was taken in for; deploying only the two above would ship the repair to the designer portal
  and leave the accountant's file as it was. It touches no object `00595–00620` creates, so its
  position here is free.
* All three are safe early: nothing calls either nudge path until the cron exists, and none
  reaches for an object `00595–00620` creates.

**Probe:** `supabase functions list` shows **all three** with a fresh `updated_at`.

### ②a MS-05 — read the legacy-stamp cost BEFORE the push (HT-3-g AMENDED (a))

`00620` `RAISE NOTICE`s its numbers, but only after it has run. Paste
`artifacts/hour-tracking-2026-09-11/build/ms-05-strata-legacy-stamp-preflight.sql` into the
Supabase SQL editor on Strata and record:

| column | Strata value |
|---|---|
| `projects_studio_id_null` | |
| `projects_total` | |
| `would_stamp_employer` | |
| `would_stamp_owned` | |
| `left_null_ambiguous` | |
| `left_null_roster_key` | |
| `left_null_author_key` | |
| `left_null_non_designer_lead` | |

One SELECT, no writes. The helper bodies are transcribed inline because `00620`'s functions do
not exist on Strata until the push; the inlining was proved equivalent on the isolated stack
across all four discriminating shapes plus an ambiguous tier.

**Read `left_null_ambiguous` first.** On the local stack it is the DEFAULT, not the exotic case.
Every hour on such a project prices `rate_source='none'`; since MS-01 it prints "rate pending",
is refused by the composer and by `claim_time_entries`, and so cannot reach an invoice at $0.00
— but it still cannot be billed until somebody stamps the project or fills the rate card. **If
it is large, tell Leah before the ship, not after.**

`left_null_non_designer_lead` is MS-12's number: rows the two stamp paths would otherwise have
disagreed about. They are left NULL, which is the recoverable direction (HT-3-g AMENDED (c)).

### ② Migrations

```bash
supabase db push --include-all      # from the LINKED, UP-TO-DATE main checkout — see §0a
```

Applies `00595 00596 00597 00598 00599 00600 00601 00602 00603 00604 00605 00606 00607 00608
00610 00611 00612 00613 00614 00615 00616 00617 00618 00619 00620` in **version order** — 25
files. `00609` is deliberately unused. `00617` is MS-01's fix; it could not be folded into
`00596`/`00595` because `project_time_entries.rate_source` does not exist until `00600`.

⚠ **MS-14 — `00596` is no longer standalone-replayable, and that is expected.** `00596`'s
`CREATE OR REPLACE VIEW project_unbilled_time` stops at `billing_state`; `00617` appends
`rate_source` and `rate_role` to the same view, and Postgres refuses a replace that removes
columns. Replaying `00596` ALONE against a stack that already has `00617` fails with
`cannot drop columns from view`. One `db push --include-all` applies in version order, so the
chain is unaffected — but **the view's live column list is `00617`'s** (verified on the stack:
15 columns, ending `rate_source, rate_role`). Do not "repair" `00596` by adding the columns
(they do not exist at that number) or by adding a `DROP VIEW` (dependents).

**Push them in ONE invocation.** Version order is what makes `00618` the last writer of
`classify_project_time_entry_authority` and `resolve_time_rate_cents`; applying a lower number
after a higher one silently reverts W7's two central deltas. This happened on the local stack
twice — finding S-4 at round 1 and R3-M1 at round 3 — which is why the first two probes below
are not optional.

**Probes (read-only, run immediately after):**

```sql
-- 1 & 2. BOTH must return 1. A 0 means 00618 did not land last (S-4 / R3-M1).
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname='classify_project_time_entry_authority'
   and pg_get_functiondef(p.oid) like '%roster_role%';
select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname='resolve_time_rate_cents'
   and pg_get_functiondef(p.oid) like '%roster_role%';

-- 3. P2-B1 + HT-13-b: the rollup takes INSTANTS and a zone, and NO other
--    overload survives beside it. (Round 3 left this probe on the SIX-argument
--    signature; HT-13-b appended `p_timezone text DEFAULT 'UTC'` and DROPPED
--    the six-argument form, because a defaulted argument makes a surviving
--    overload ambiguous rather than resolved.)
select p.oid::regprocedure::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname='studio_hours_rollup';
--   expect EXACTLY ONE row:
--   studio_hours_rollup(uuid,timestamp with time zone,timestamp with time zone,text,uuid,uuid,text)

-- 3b. HT-13-b: the day/week LABELS are cut in the caller's zone, never on
--     00604's UTC columns. Both must be true.
select pg_get_functiondef(
         'public.studio_hours_rollup(uuid,timestamptz,timestamptz,text,uuid,uuid,text)'::regprocedure
       ) like '%(scoped.started_at AT TIME ZONE v_zone)::date%'                        as labels_take_zone,
       pg_get_functiondef(
         'public.studio_hours_rollup(uuid,timestamptz,timestamptz,text,uuid,uuid,text)'::regprocedure
       ) not like '%THEN to_char(scoped.day,%'                                         as no_utc_day_label;

-- 4. the ledger view, the RPCs and the cron exist
select 1 from information_schema.views where table_name='time_entry_ledger';
select proname from pg_proc where proname in
  ('log_time','start_timer','studio_hours_rollup','project_hours_total',
   'stamp_project_pricing_studio','resolve_time_rate_cents');
select jobname, schedule from cron.job where jobname = 'time-nudges-hourly';  -- '0 * * * *'
select count(*) from public.studio_member_rates;                               -- 0 (P-4: no backfill)

-- 5. MS-01: the composer's two provenance columns exist, and the claim refuses 'none'
select count(*) from information_schema.columns
 where table_schema='public' and table_name='project_unbilled_time'
   and column_name in ('rate_source','rate_role');                             -- 2
select pg_get_functiondef('public.claim_time_entries(uuid,uuid[])'::regprocedure)
       ~ 'rate_source IS DISTINCT FROM ''none''';                              -- t

-- 6. MS-02 / MS-12: both stamp paths bind only a designer-domain lead
select pg_get_functiondef('public.set_project_studio_id_owned()'::regprocedure)
       ~ 'has_designer_domain_role';                                           -- t

-- 7. R3-m1: an hour cannot be filed in the future
select pg_get_functiondef(
  'public.log_time(uuid,uuid,timestamptz,integer,text,boolean,text,text,uuid,text,text,uuid)'::regprocedure
) ~ 'interval ''26 hours''';                                                   -- t
```

All of these returned the expected values on the isolated stack at round 4.

### ③ Portals — **client first, then designer**

```bash
./infra/deploy-portal.sh client
./infra/deploy-portal.sh designer
```

**The order is not cosmetic.** HT-21's time line carries its dated sub-table as a JSON payload
in `metadata.attribution`. The pre-ship client portal renders `line.attribution` verbatim, so an
invoice a freshly-shipped designer portal composes during the gap would show a homeowner a raw
`{"kind":"patina_time_subtable","rows":[…]}` string. Shipping the client portal first closes the
window. (`InvoicePaper` lives in `@patina/patina-design-system`, which is `src`-resolved, so
**both** portals must be rebuilt — `deploy-portal.sh` phase 1 does it. Never
`opennextjs-cloudflare build` directly.)

**Probes per unit:**

| Unit | Probe |
|---|---|
| `patina-client-portal` | `npx wrangler deployments list --name patina-client-portal` — read the **bottom** row (oldest-first). Then open a `/pay/<token>` link for an invoice with a time line: the sub-table must render as `13 September · 1h 30m · $120.00/hr` lines, never raw JSON. Every other line kind must still show its plain-text attribution. |
| `patina-designer-portal` | `npx wrangler deployments list --name patina-designer-portal` — bottom row. Then, signed in: `/desk?sheet=hours` opens the **Hours** dialog and the address returns to `/desk`; the lens shows `MINE` + `THE STUDIO` for an owner and **no lens at all** for a plain member; press `t` on `/desk` → the **Log time** dialog opens with a Document picker (including *"Studio time — no document"*), MINUTES, a **DATE** field (whose `max` is today), activity chips including *"activity not set"*, and a **NON-BILLABLE** pill. An owner of two studios must read `THE STUDIO · <name> (1 of 2)` as a clickable word that cycles. |
| `patina-designer-portal` — the P2-B1 regression probe | **Log an hour after 19:00 local, then open `THE STUDIO` and confirm the studio scope counts it.** |
| `patina-designer-portal` — the HT-13-b regression probe | **Same hour: `MINE` and `THE STUDIO → BY DAY` / `THE ENTRIES` and the CSV must all name the day you worked it, not the next UTC day.** |
| both | `npx wrangler tail <worker>` for ~2 min — no new error spike. Kill the tail when done. |

`/api/version` returns static defaults on the live path and proves **liveness only**.

### ④ Patina Field → TestFlight

`apps/mobile/Capture` on `hour-tracking/ios` @ **`35336ba7a`**; `git diff 35336ba7a..5ffe24667
-- apps/mobile` is empty, so the branch tip's iOS content is exactly what the gate read.
`scripts/capture-gate.sh all` is **green** at round 4 — `✔ build · ✔ tests · ✔ lint · ✔ fc-r3
sweep (inbox) · ✔ fc-r3 sweep (ai) · ✔ principle-4 sweep` (Simulator; **compile-green +
sim-verified only, never device-verified**). P-6 rules that sufficient to ship; the device pass
is Kody's, after.

Archive and upload per the `asc-*` skills. **Ship the DB and the portals first** — `LogTimeSheet`
calls the `log_time` RPC (`00608`) and reads `time_entry_ledger` (`00604`); a build in testers'
hands before the push would 404 on both.

---

## 2 · Must be settled BEFORE the ship

1. ⚠ **G1 — the two PostHog rollout percentages are RECORDED (memory), not read live this
   session.** Write the exact flag-gate sentence from the header into the ship report. **§0b**
   carries the live-read steps, for whoever runs the push, if the token/extension recover.
   Recorded state applies the checklist's own decision rule: both effectively at 100% → ship
   as planned.
2. ⛔ **G2 — run the push from the linked, up-to-date main checkout.** **§0a**, five steps.
   Without it the push is a silent no-op.
3. ⚠ **MS-05's eight Strata numbers** — §1②a. The query is ready and carries MS-12's column.
4. **Tell Leah what P-4 means on day one:** a rate written today does not price an hour logged
   before it. The repair exists (an owner/admin edit of any classifier-watched column re-rates
   the row) but nothing on the surface says so.
5. **Tell Leah what an empty rate card means** (P2-n3 / W7-R6-03, re-measured at round 3 as the
   seed DEFAULT): the Studio page renders `RATE CARD`, the binding sentence and `+ Add a role`
   with **no rows**, and readiness passes over it.
6. ⚠ **One §A pass over four sub-44px acts, all accepted as residual, none of them money:**
   `+ Add a role` 69 × 18 (program-new, R3-m2), the two `Remove` acts 18 px / 30 px
   (W7-R6-05 / W7-R5-03), and the pre-existing `‹ earlier` 66 × 17 and
   `Bill week → Accounts` 180 × 28 (R3-n1).
7. ⚠ **One `KNOWN_FAILURES.md` line for `mood_boards/project_board_share_test.sql`** (or a
   tie-break on `id` in the test) so the SQL sweep's "unexpected" count means something at ship
   time. Cause proven at round 4 and not this program's — see §0.
8. **Tell Leah what HT-13-c means** — the per-member rate card's `effective_from` /
   `effective_to` are UTC-anchored server truth even though every printed date (the entries
   list, `BY DAY`/`BY WEEK`, the CSV, the client folio) is now in her studio's local zone
   (HT-13-b). West of UTC, an hour every screen calls "the 13th" can be priced by a card
   effective "the 14th." Ruled, not fixed — see the HT-13-c banner above §0 and `rulings.md`.

---

## 3 · Rollback

* **Portals:** re-run `./infra/deploy-portal.sh <name>` from the last-good commit in a worktree.
* **Edge functions:** redeploy the prior version of `digest-dispatcher`; `time-nudges` is new —
  disable it with `SELECT cron.unschedule('time-nudges-hourly');`.
* **Migrations:** append-only, roll forward. The cheapest kill switch for the whole program's new
  writes is `cron.unschedule('time-nudges-hourly')` plus a portal rollback; the schema is
  additive and inert without the UI.

---

## 4 · After the ship — Kody's walk (charter §5)

1. 1440 / 1024 / 390: scope lens, ⌘K verb, backdate, settings rate table, disclosure sentence.
   **Add three:** (a) open Hours as a designer who owns two studios and read which studio
   `the studio` names and that the `(1 of 2)` word switches; (b) **log an hour after 19:00 local
   and confirm the studio scope counts it** (P2-B1); (c) **read that same hour's date under
   `MINE`, under `THE STUDIO → THE ENTRIES` and `BY DAY`, and in the CSV — all four must name
   the day you worked it** (HT-13-b).
2. iPhone airplane-mode drain walk — the only closure for W6's device claims.
3. Walk Leah's studio through it, carrying §2.4 and §2.5.
4. Rule the provisional reactions still OWED: **P2-n3 / W7-R6-03 / S-9** (an emptied rate card
   passes readiness), **R3-n4** (does the internal-time door need to name its studio for a
   multi-studio owner?), **HT-25-a**, **HT-6-a**, **HT-6-b**. *(P2-n1 is CLOSED by HT-13-b;
   HT-10-b is RULED.)*
5. Widen nothing.
