# D-review-r2 — adversarial re-review, lane D (W4: time-nudges + 00614 + dark opt-in), round 2

**clean: NO** — 1 major, 4 medium, 3 low, 2 informational new this round; plus 3 round-1 items that
remain open by design (D-R1-04, D-R1-06, D-R1-12) and 1 that is only half-discharged (D-R1-05).
**Nothing here corrupts data and nothing sends anything external.** The single major is new and it is
the inverse of round 1's shape: round 1 found promises stated more strongly than the code delivered;
round 2 finds a *fix* that may silence the one live deliverable, invisibly, and was never proved against
the only caller that matters.

- Reviewer: separate context, not the implementer, not the round-1 reviewer's context. Skills loaded:
  `patina-edge-functions`, `patina-verification`.
- Diff reviewed: `git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-edge diff origin/hour-tracking/integration...hour-tracking/edge`
  → 8 files, 1729 insertions, 299 deletions, at `22b24b989` on `hour-tracking/edge`
  (merge-base `2ff00bb2b`; `origin/hour-tracking/integration` tip `85f875907`, re-fetched this session).
- Three commits on the branch: `64dc2cf0c` (round-0 feature), `e1ff0560e` (round-1 fixes),
  `22b24b989` (**a 726-line cosmetic reformat — see D-R2-05**).
- Worktree clean (`git status --porcelain` empty). No `deno.lock` under the worktree or at
  `/Users/kody/Code/patina-merged` after four `deno` invocations (all passed `--config supabase/functions/deno.json`).

---

## Gates I re-ran myself

```
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/time-nudges/
running 16 tests from ./supabase/functions/time-nudges/index.test.ts
… rule (a) ×2, rule (b) ×2, routing ×3, cutoffs ×2, isoWeekKey, record builders ×2,
  only the service role may run either sweep ... ok
  SUPABASE_SECRET_KEYS is parsed as a dictionary, an array, or a list ... ok
  the service role is one principal in three shapes ... ok
  the two callers this function must turn away: an anon-key bearer, and a signed-in member's JWT ... ok
ok | 16 passed | 0 failed (21ms)          exit 0

$ deno check --config supabase/functions/deno.json \
    supabase/functions/time-nudges/{index.ts,logic.ts,index.test.ts}
Check index.ts / logic.ts / index.test.ts     exit 0

$ npx jest src/lib/document/__tests__/post-derivation.test.ts   (apps/designer-portal)
Tests: 60 passed, 60 total                    exit 0

$ npx eslint src/lib/document/post-derivation.ts \
    src/lib/document/__tests__/post-derivation.test.ts \
    src/lib/analytics/document-events.ts                        exit 0
  (designer-portal's flat config is the only working ESLint config in the repo — patina-verification)

$ pnpm --dir …/agent-edge/apps/designer-portal type-check        exit 1 — 73 pre-existing errors, see D-R2-08
```

The four new service-role tests are **not** tautological (the failure class D-R1-08 named): they build
real JWTs and assert the anon key, an `authenticated` JWT, a wrong-`ref` service-role JWT, an expired
one, and two non-JWTs are all turned away, and that all three admitted shapes are admitted.

### 00614 re-applied standalone, `BEGIN … ROLLBACK`, isolated stack `-H 127.0.0.1 -p 54422`

Stack identity confirmed first — same stack round 1 used: `pg_postmaster_start_time() =
2026-09-12 00:38:30+00`, 552 ledger rows, head `00601` (+ imported `20260910152111`),
`profiles.weekly_hours_reminder_opt_in` **absent**, 0 `time-nudges%` cron rows. So W0+W1 are present and
no W4 object is.

```
BEGIN
 preexisting_running_long_rows | 0      ← the new UNIQUE indexes cannot fail on existing data
 preexisting_weekly_rows       | 0
ALTER TABLE / COMMENT / CREATE INDEX / CREATE INDEX / DO / cron.schedule → 64

 weekly_hours_reminder_opt_in | boolean | NOT NULL | false
 uniq_notification_log_time_entry_running_long
 uniq_notification_log_time_weekly_unlogged
 time-nudges-hourly | 0 * * * * | SELECT public.invoke_edge_function('time-nudges', '{"rule":"running_timer"}'::jsonb) | t

--- second apply of the whole file ---
NOTICE: column … already exists, skipping
NOTICE: relation "uniq_notification_log_time_entry_running_long" already exists, skipping
NOTICE: relation "uniq_notification_log_time_weekly_unlogged" already exists, skipping
 cron_rows_after_second_apply   | 1     ← not two
 index_count_after_second_apply | 2

--- does the index actually hold? ---
NOTICE: OK: duplicate rejected with 23505 (unique_violation)
NOTICE: NOTE: two metadata-without-entry_id rows coexist (NULL key, no conflict)

ROLLBACK
 post-rollback column  | 0
 post-rollback indexes | 0
 post-rollback cron    | 0
```

So D-R1-03's index is not merely present, it is **asserted**: a second insert of the same
`(user_id, metadata->>'entry_id')` for `type='time_entry_running_long' AND channel='in_app'` raises
`23505`. The two indexes are shape-identical to `00431`'s `idx_notification_log_project_file_event`
(read and compared), which is also the precedent for the non-`CONCURRENTLY` build on this table, so the
lock posture is the repo's established one rather than a new risk.

### Contamination check

Peer program's stack on `54322` (not ours): `0` `time-nudges%` cron rows, `0`
`weekly_hours_reminder_opt_in` columns, `0` `uniq_notification_log_time%` indexes. Untouched.
`agent-edge`'s `config.toml` is still tracked (`H`) and still points at `project_id = "supabase"` /
54321–54329 — D-R1-13's condition is unchanged, and lane D again held the psql-only discipline that
makes it harmless. `agent-integration`'s is still `S` (skip-worktree) with `patina-hours` / 54421-54429.

---

## Round-1 findings — discharge verdict, each verified in the diff

| # | Verdict | Evidence |
|---|---|---|
| **D-R1-01** | **DISCHARGED as option (b)** — but see **D-R2-01** | `isServiceRoleCaller(...)` gate at `index.ts:171-183`, before `readBody` and before either sweep. The false claim is corrected in all four places it was made: `index.ts:10-24`, `logic.ts:9-20`, `00614:22-35`, `config.toml`'s `[functions.time-nudges]` comment. Ported **verbatim in shape** from `client-invite/lib.ts` (compared line-for-line: same `secretEquals`, `parseSecretKeys`, `isVerifiedLegacyServiceRoleJwt` with the same `role`/`iss`/`ref`/`exp` checks) — so the 2026-09-09 rotation rule is honoured exactly as the memory note prescribes (env key \| `SUPABASE_SECRET_KEYS` \| gateway-verified service-role JWT), never a lone string compare. |
| **D-R1-02** | **DISCHARGED — and over-discharged; see D-R2-03** | `read_at: now.toISOString()` in `logic.ts:193` (running timer) and `:219` (weekly). I confirmed `metadata.read_at` is the exact key the badge reads (`use-inbox.ts:276`) and that the row is **not** thereby hidden: the only read-state filter on the inbox query is `filters.unreadOnly` (`:123-124`) and no designer-portal call site passes it (grepped `apps packages`). |
| **D-R1-03** | **DISCHARGED, live-asserted** | `00614:69-77`; `23505` tolerated at `index.ts:141-143`. Duplicate-rejection proved against Postgres above. |
| **D-R1-04** | **NOT discharged — correctly deferred, disclosed** | `packages/supabase/src/database.types.ts` untouched; `grep weekly_hours_reminder_opt_in` in it returns nothing. Still the orchestrator ruling §11 vs. task-brief. Note integration already re-generated both this file and `00-legacy-grants.sql` for W0, so the integration owner's post-merge regen is the natural home. |
| **D-R1-05** | **HALF discharged — see D-R2-02** | The doc comment landed: `document-events.ts` +32 lines, comment only, **no** emitters, no `-` lines (so no reformat of that file). Nine names with props and owning wave. One of the plan's ten is missing. |
| **D-R1-06** | **NOT discharged — correctly, integration mechanics** | Flags re-verified above. I additionally closed half the risk: `comm -12` of `2ff00bb2b..origin/hour-tracking/integration` against this diff shows **zero overlapping files**, and integration has no committed `config.toml` change — so the merge has no content conflict, only the skip-worktree dance D-R1-06 scripted. |
| **D-R1-07** | **Plumbing landed; the described defect persists — see D-R2-04** | `documentHrefFor` honours `sheet` (`post-derivation.ts:155-166`), `sheet: "hours"` set at `logic.ts:184`, 2 new jest tests. But nothing reads `?sheet=`. |
| **D-R1-08** | **DISCHARGED** | The tautological test is gone; `index.test.ts:190-199` carries the explanatory comment pointing the coverage at D-R1-09's live probe instead of faking it. |
| **D-R1-09** | **NOT discharged — correctly deferred, and now MORE load-bearing** | `index.ts` is still executed by no gate. D-R2-01 raises the cost of that. |
| **D-R1-10** | **DISCHARGED** | `index.ts:194-205`: `console.error("time-nudges: run failed", detail)` server-side, response body `{"error":"internal_error"}` only. |
| **D-R1-11** | **DISCHARGED, folded into D-R1-01** | The gate runs before `resolveNudgeRule`, so rule (a) is behind it too. |
| **D-R1-12** | **NOT discharged — correctly, a plan-document edit** | Re-verified: `grep -nE '^\s*(GRANT\|REVOKE)' 00614` → exit 1; `supabase/seed/00-legacy-grants.sql` untouched in this diff. The regen is genuinely not owed; §0.20/§11's fixed lists are still wrong. |
| **D-R1-13** | **Acknowledged, not changed; no contamination** | Proved above against the peer stack. |

---

## New findings

### D-R2-01 · MAJOR · confidence HIGH — the new service-role gate is unproven against the only caller that matters, and its failure mode silences the one live deliverable invisibly

`supabase/functions/time-nudges/index.ts:171-183` · `logic.ts:358-403` ·
`supabase/migrations/00258_edge_settings_vault.sql:52-83` · `supabase/functions/client-invite/index.ts:8-13`

The cron bridge does **not** present the function's own injected environment key. `invoke_edge_function`
sends `Authorization: 'Bearer ' || v_key` where `v_key := public.app_setting('service_role_key')` — a
**Vault literal, provisioned at deploy time** (`00258:47`: "values never live in git"). Nothing
guarantees it equals `Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')` or appears in `SUPABASE_SECRET_KEYS`.

And the pattern has no precedent that covers this. `client-invite` — the function this check was ported
from — is explicitly **not** cron-invoked; its own header says "The browser never calls this function;
the designer portal's `/api/clients/invite` and the client portal's `/api/auth/invite/{accept,refresh}`
call it server-to-server with the service-role key", i.e. callers that hold the *same injected env key*.
The three peers `time-nudges` models its cron posture on (`decision-reminders`, `field-daily`,
`morning-brief`) carry **no** in-code service-role check at all. **`time-nudges` is the first cron→edge
function in this repo to gate on `isServiceRoleCaller`, so the Vault value has never been tested against
any of the three arms.**

The arms are demonstrably environment-sensitive. On the isolated stack:

```
$ select name, length(...), shape, claims from vault.decrypted_secrets
    where name='app.settings.service_role_key';
 app.settings.service_role_key | 164 | legacy JWT | {"iss":"supabase-demo","role":"service_role","exp":2099573285}
```

That token has **no `ref` claim** and `iss = "supabase-demo"`, so `isVerifiedLegacyServiceRoleJwt`
rejects it on two separate checks (`logic.ts:373-374`). Locally only arm 1 — byte-equality with the
injected key — can admit the cron, and it does only because the CLI happens to inject the same demo key.
On Strata, if the Vault literal is neither the injected `SUPABASE_SERVICE_ROLE_KEY`, nor a member of
`SUPABASE_SECRET_KEYS`, nor an unexpired JWT with `role=service_role` + `iss="supabase"` +
`ref=bkvcixdmuyejfzcijpdg`, then **every hourly sweep 403s and rule (a) never fires.**

The failure is invisible in every ledger this program watches:
- `cron.job_run_details.status = 'succeeded'` — that only means `net.http_post` was enqueued
  (patina-verification false-green trap 5);
- `time-nudges` writes no `job_runs` row (D-R2-06), so there is no run history;
- "no `notification_log` row" is indistinguishable from "no stale running timers", which is the normal
  case most hours.

Note also the **scope**: D-R1-01's option (b) asked to "403 `weekly_unlogged` otherwise". The
implementer gated **both** arms. That is strictly more hardening than the finding asked for, and it is
exactly what puts the *live* rule behind an unverified door — the dark rule was already inert three ways.

**Fix (pick one before ship):**
(a) Confirm the Vault literal satisfies an arm, read-only, shape only — never the value:
`select left(decrypted_secret,10) as prefix, length(decrypted_secret) from vault.decrypted_secrets where name='app.settings.service_role_key';`
on Strata, and compare against the function's injected key shape. If it is a legacy JWT, confirm
`iss='supabase'` and `ref='bkvcixdmuyejfzcijpdg'`.
(b) If that cannot be confirmed pre-deploy, **narrow the gate to the `weekly_unlogged` arm** (D-R1-01's
literal option b) so a 403 can never silence rule (a).
Either way, §11 step 8's probe must read `net._http_response`'s **status** for the time-nudges POST, not
only `SELECT` the `notification_log` table — an empty table proves nothing.

### D-R2-02 · MEDIUM · confidence HIGH — the canonical event list is missing one of the plan's ten names, and it is lane D's to emit

`apps/designer-portal/src/lib/analytics/document-events.ts` (the new block) · `plan-v2.md:723-725`

plan-v2 §7: "### PostHog events (lane D emits, lane B calls) — `time_export_taken` (`scope`,
`row_count`, `period`)." The doc comment lists nine names (W1 ×2, W2 ×5, W3 ×2) and omits this one. I
cross-checked all ten against §§2/3/4/5/7 line by line; the nine that are present match the plan's props
exactly, including `time_timer_stopped`'s cumulative-idle ratio and `time_entry_logged`'s eight props.

This matters because of the rule the comment itself states — "do not add a new one without updating this
block" — combined with §11's "lane D is the sole writer of this file for the whole program". W7 (lane B)
must now either invent a string or write into lane D's file. **Fix:** add
`· time_export_taken — scope, row_count, period (W7)` to the block.

### D-R2-03 · MEDIUM · confidence HIGH (the behaviour) / MEDIUM (whether it is wrong) — the fix resolved by guess the exact ambiguity D-R1-02 reserved for a ruling, in the direction that makes the nudge unnoticeable

`supabase/functions/time-nudges/logic.ts:188-193, :215-219` · `rulings.md:40` (HT-34) · `plan-v2.md` §5

HT-34's ruled text is: "Running timer > 8 h writes one quiet Record row only; the unlogged-day reminder
is built opt-in per member, weekly at most, behind a flag that ships off." It says *quiet* — no push, no
email. It does not say *born read*. Stamping `metadata.read_at` at write time makes the row
indistinguishable from one the designer already dismissed: no badge, no unread treatment, nothing
whatever to draw her to it. She learns a timer has been running nine hours only if she independently
opens the Record sheet and scrolls past rows that all look already-seen.

D-R1-02 named this precisely and declined to guess: "**The ambiguity is worth a ruling rather than a
guess**: §5 already lists 'push' separately, which argues the UI badge is what was meant." The fix took
the stronger branch anyway, and extended it to rule (b) as well.

(For the record, I verified the fix does not *hide* the row — see the D-R1-02 row above — so this is a
product question, not a defect.)

**Fix — orchestrator ruling, one line either way:** if "no badge" meant the APNs badge, drop the
`read_at` stamp from both builders and let the Record row read as unread. If it meant the unread count
too, keep the stamp and record the ruling so a later reader does not "fix" it back.

### D-R2-04 · MEDIUM · confidence HIGH — D-R1-07's plumbing landed but nothing reads `?sheet=`, so the defect it described is unchanged today, and the dependency is undisclosed

`apps/designer-portal/src/lib/document/post-derivation.ts:155-166` · `logic.ts:177-187` ·
`apps/designer-portal/src/components/document/desk-doorway.tsx:19`

```
$ grep -rn "get('sheet')\|get(\"sheet\")\|searchParams.sheet\|sheet=" apps/designer-portal/src
post-derivation.ts:152   (the new comment)
post-derivation.ts:163   (the new code)
room-file/drawings-section.tsx:62   <PlanPreview sheet={…} />   ← an unrelated React prop
```

**No route, layout or component in the designer portal consumes a `?sheet=` query parameter.**
`/desk?book=hours` is real (`desk-doorway.tsx:19`, so the project-less nudge works); `/doc/{id}?sheet=hours`
is not. A project-bearing nudge therefore still lands the designer on the document rather than the Hours
book — exactly what D-R1-07 described. The query string now survives into the href instead of being
discarded, which is the correct plumbing, but it is inert until W2 lands the Hours-book doorway on the
document (plan §12 risk 12, and W2's own Done-when: "`?sheet=hours` opens the Hours book").

D-fix-r1.md presents this as "fixed generally, not just patched locally" and names no W2 dependency.
**Fix:** nothing in lane D. State the dependency in the ship note, and make W2's Done-when assert the
round trip from an actual nudge href rather than from a hand-written URL.

### D-R2-05 · MEDIUM · confidence HIGH — an undisclosed 726-line cosmetic reformat of two shared designer-portal files, in its own commit, on a file no lane owns

`22b24b989 chore(time-nudges): prettier formatting on round-1 fix files`

```
 post-derivation.test.ts | 590 ++++++++++++---------
 post-derivation.ts      | 136 ++---
```

Scale: the functional commit `e1ff0560e` touched **11** lines of `post-derivation.ts` and added **29**
test lines. The churn commit is ~66× that, and it converts designer-portal's prevailing single quotes to
double. `post-derivation.ts` is now 156 double / 35 single — the outlier in a 95-file
`lib/document` directory that is overwhelmingly single-quoted. There is no root `.prettierrc`
(patina-verification), so this is Prettier's defaults, not a repo convention; `D-fix-r1.md`'s "Files
changed this round" section does not mention the reformat at all.

**I verified the churn is semantically empty** rather than assuming it. Token-level diff of
`e1ff0560e..HEAD` with quotes normalised and whitespace collapsed:

```
post-derivation.ts       → 1 differing token   ("needKind" → "needKind,")
post-derivation.test.ts  → 165 differing tokens, every one a trailing comma or a line re-wrap
```

So nothing is smuggled in, and it does not conflict with the current integration tip (zero file overlap,
proved above). The cost is forward: `post-derivation.ts` / `.test.ts` are **not** in §11's ownership
table, and `hours-ledger.tsx`-adjacent Record work is lane B's in W2/W3 — whichever lane next touches
these files inherits a 726-line reformat in its merge base.

**Fix:** revert `22b24b989` and keep only the functional hunks, **or** have the orchestrator explicitly
accept the churn and add `post-derivation.ts` + its test to §11's ownership table as lane-D-owned for the
rest of the program. Do not leave it unstated.

### D-R2-06 · LOW · confidence HIGH — the new gate adds a silent-403 failure mode to a function that writes no `job_runs` row, in a program whose own rule is that run history lives there

AGENTS.md / CLAUDE.md: "Scheduled jobs = pg_cron (SQL RPC or `public.invoke_edge_function`); run history
= `job_runs`." `grep -rln "job_runs" supabase/functions --include=index.ts` → **13 of 85** functions
write one, **including `morning-brief`** — one of the three cron peers `time-nudges` explicitly models
itself on. `time-nudges` writes none.

Before D-R2-01's gate that was merely conventional. After it, there is no surface anywhere on which a
403 becomes visible. **This is also the cheapest mitigation for D-R2-01:** one `job_runs` row per sweep
(started / finished / `recorded`) makes "never ran" distinguishable from "nothing to nudge", which is the
distinction the whole rule depends on.

### D-R2-07 · LOW · confidence MEDIUM — `insertRecord` swallows every `23505`, not only the two it names

`supabase/functions/time-nudges/index.ts:134-146` · `logic.ts:236-244`

The handler returns silently on **any** `unique_violation`. Today that is safe — I enumerated the unique
indexes on `notification_log` on the isolated stack and there are exactly two besides the new pair:
`notification_log_pkey` and the unrelated partial `idx_notification_log_project_file_event`
(`WHERE type='project_file_changed'`). But the comment asserts a 23505 "IS the idempotency guarantee
working, not a failure", which stops being true the moment another unique constraint lands on this
table — a genuine insert failure would then be counted as a successful record.

Second-order: the swallow resolves `insertRecord`, so `runRunningTimerSweep` increments `recorded`
(`logic.ts:242-243`) for a row it did not write. The "exactly one row" guarantee still holds; the
returned `recorded` count over-reports on a race. **Fix:** match on the two index names, or at minimum
`console.warn` the swallowed violation so it is not invisible.

### D-R2-08 · LOW · confidence HIGH — designer-portal's real type gate was never run by the fixer, and cannot run cleanly in this worktree

patina-verification's matrix: designer-portal's real type gate is **`type-check`** (`build` is not one —
`next.config.js` sets `typescript.ignoreBuildErrors: true`). `D-fix-r1.md` lists `deno test`,
`deno check`, and one jest file. No `type-check`, despite the diff editing three designer-portal
TypeScript files.

I ran it: **73 `error TS` lines, all pre-existing module resolution** —
`Cannot find module '@patina/api-routes'`, `Cannot find module '@patina/types/media'` — because this
worktree has never built its workspace package dists (`packages/api-routes/dist` does not exist).
**None of the 73 names `post-derivation`, `post-derivation.test` or `document-events`**
(`npx tsc --noEmit -p tsconfig.json | grep -E "post-derivation|document-events"` → no match). So no type
error is attributable to the diff, but the gate is not green here and the integration owner owes a real
run post-merge, where the dists exist. I did run the one lint that works in this repo —
`npx eslint` on all three touched files → exit 0.

### D-R2-09 · INFORMATIONAL · confidence HIGH — `isServiceRoleCaller` + three helpers are now duplicated verbatim across two functions

`time-nudges/logic.ts:310-403` vs `client-invite/lib.ts:21-116`. Identical shape and identical claim
checks. **Correct call for now:** hoisting it into `_shared/` would put every importer on the
fan-out-redeploy hook (patina-edge-functions step 2, and §11 step 8 currently records "no fan-out
redeploy owed" for this lane), and two copies is not yet a maintenance problem. Named so the **third**
copy triggers the extraction rather than a third drift — and so that if the claim checks ever need
changing (D-R2-01 may force that), both copies are found.

### D-R2-10 · INFORMATIONAL · confidence HIGH — the branch has never been merged with, or tested against, W0

`hour-tracking/edge` sits on `2ff00bb2b`; `origin/hour-tracking/integration` is **9 commits ahead**
(W0: `00595–00597`, the `use-time-tracking.ts` move into `@patina/supabase`, plus `database.types.ts` and
`00-legacy-grants.sql` regens). I closed most of this risk rather than only flagging it: the two change
sets share **zero files**, and `00614` was applied against a stack at head `00601` — i.e. the post-W0,
post-W1 schema — so the migration is tested on the right schema and the merge has no content conflict.
Recorded only so that "the merge is clean" is not read as "the merge is tested".

---

## Hard rules and binding rules re-checked, no finding

- **No flags** (§0.5, P-5): no `useFeatureFlag`, no PostHog gate, no `ComingSoon` in the diff. ✓
- **No backfill** (§0.6, P-4): `00614` touches no existing row; `ADD COLUMN … DEFAULT false` plus two
  indexes on a table with **zero** rows of either nudge type (probed). ✓
- **Additive to `project_time_entries` only** (§0.1): the function only reads it; `00614` does not touch it. ✓
- **A client-supplied `hourly_rate_cents` is discarded server-side**: the diff contains no rate path at all. ✓
- **The invoiced-entry lock untouched** (§0.12): `guard_invoiced_time_entry` not referenced. ✓
- **One running-timer slot stays with the desk** (§0.11, HT-7): the function writes no
  `duration_minutes IS NULL` row. ✓
- **`notes` never in a rollup return** (§0.10, HT-36): the Record metadata carries `entry_id`,
  `project_id`, `started_at`, `subject`, `message`, `sheet`, `deep_link`, `read_at` — no `notes`. ✓
- **Hand-numbered migration at its assigned number** (§0.2, §0 amendment): `00614_time_nudges_cron.sql`,
  banner matches filename, and `00614` is unique across **every** ref (`git for-each-ref` loop over
  `refs/heads` + `refs/remotes` for `supabase/migrations/0061*` → only `hour-tracking/edge` and its
  remote). No `00610–00613` exists on any ref yet, so the number still holds — re-check at merge. ✓
- **No `generate-legacy-grants.py` owed**: `grep -nE '^\s*(GRANT|REVOKE)'` on `00614` → exit 1. ✓ (D-R1-12)
- **`verify_jwt` decision** (patina-edge-functions step 4): `true`, declared in `config.toml`, and now
  backed by a compensating in-code check — stricter than the rule requires, which is what D-R2-01 is about.
  No CORS (never browser-called). ✓
- **No `_shared/*` edit** → no fan-out redeploy owed. Zero `_shared` imports in `time-nudges`. ✓
- **`config.toml` diff is `[functions]`-only**: one hunk `@@ -663,6 +663,19 @@`, an 11-line comment plus
  `[functions.time-nudges]` / `verify_jwt = true`. No `project_id`, no port, no other section. ✓
- **No new SECURITY DEFINER function** (§0.16): none; `public.invoke_edge_function` (00258) reused, not
  redefined. Nothing here touches HT-10-a's `project_hours_total` (lane A's). ✓
- **No automated external send**: `index.ts` imports exactly `@supabase/supabase-js` and `./logic.ts`;
  the only write is `insertRecord` → `notification_log`, always `channel:"in_app"`. ✓
- **Commit hygiene**: three commits, explicit pathspecs, worktree clean, nothing from the main checkout,
  no `git add -A` residue. The third commit's *content* is the D-R2-05 finding, not its hygiene. ✓

---

## Round-3 asks, in the order I would do them

1. **D-R2-01** — confirm the Vault key's shape on Strata, or narrow the gate to rule (b). This is the one
   finding that can make W4 ship a deliverable that never runs, with no ledger showing it.
2. **D-R2-03** — rule "no badge". One line either way; it decides whether a designer ever notices a nine-hour timer.
3. **D-R2-05** — revert the reformat commit, or adopt the two files into §11's ownership table. Decide
   before any lane-B wave branches off integration.
4. **D-R2-02** — add `time_export_taken` to the canonical block (mechanical).
5. **D-R2-06** — one `job_runs` row; it is also the cheap half of D-R2-01's mitigation.
6. **D-R2-04** — carry the W2 dependency into the ship note; do not let "D-R1-07 fixed" stand unqualified.
7. **D-R2-07 / D-R2-08** — narrow the 23505 match; integration owner runs designer-portal `type-check`
   where the dists exist.
8. **Still open from round 1, all needing the orchestrator, none needing lane D**: **D-R1-04** (who
   regenerates `database.types.ts` for `00614`), **D-R1-06** (script the skip-worktree dance before the
   first W4 merge), **D-R1-12** (strike `00614` from §0.20/§11's fixed lists), **D-R1-09** (the live probe
   at ship, now load-bearing per D-R2-01).

*Re-reviewed 2026-09-11/12. Isolated stack `127.0.0.1:54422` (head `00601`, `pg_postmaster_start_time
2026-09-12 00:38:30+00`); peer stack on 54322 probed read-only and left untouched. `00614` applied only
inside `BEGIN … ROLLBACK`. No branch mutated, no commit made, no deploy, no prod access. Not verified:
anything requiring the deployed function or Strata — the 403 question in D-R2-01 is exactly that, and it
is why it is the first ask.*
