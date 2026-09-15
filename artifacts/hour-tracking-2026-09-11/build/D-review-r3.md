# D-review-r3 — adversarial re-review, lane D (W4: time-nudges + 00614 + dark opt-in), round 3

**clean: NO** — 1 major, 2 medium, 3 low, 2 informational new this round. **Every round-2 finding that
asked lane D for code is discharged, and the two biggest ones are discharged well** (the reformat is
genuinely reverted; the idempotency-message match is now empirically proved against Postgres, below).

What is new is a different class than rounds 1 and 2. Round 1 found claims stronger than the code; round 2
found a fix that could silence the deliverable. Round 3 found that the deliverable **does** fire — and that
two pre-existing platform consumers then turn the "quiet Record row" into exactly the two things HT-34
forbade by name. Neither is visible from inside `time-nudges`: both live in other functions that read the
row after it lands. Rounds 1 and 2 both verified "no email / no badge" **structurally, from inside the
function** — "this module imports no dispatch helper", "the port exposes no method that could reach one".
That is true and it is not the question. I asked the inverse question — *who reads a
`notification_log` row with `channel='in_app'`, `status='delivered'`* — and both answers are live in prod.

- Reviewer: separate context; not the implementer, not the round-1 or round-2 reviewer's context. Skills
  loaded: `patina-edge-functions`, `patina-verification`.
- Diff reviewed: `git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-edge diff origin/hour-tracking/integration...hour-tracking/edge`
  → **8 files, 1446 insertions, 3 deletions**, at `4d72d8590` on `hour-tracking/edge`
  (merge-base `2ff00bb2b`; `origin/hour-tracking/integration` tip `85f875907`, re-fetched this session).
- Four commits: `64dc2cf0c` (feature) · `e1ff0560e` (round-1 fixes) · `22b24b989` (the reformat) ·
  `4d72d8590` (round-2 fixes, which reverts the reformat's two unowned files).
- Worktree clean (`git status --porcelain` empty). No `deno.lock` in the worktree or at
  `/Users/kody/Code/patina-merged` after three `deno` invocations (all passed `--config supabase/functions/deno.json`).

---

## Gates I re-ran myself

```
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/time-nudges/
running 16 tests from ./supabase/functions/time-nudges/index.test.ts
ok | 16 passed | 0 failed (20ms)                                        exit 0

$ deno check --config supabase/functions/deno.json \
    supabase/functions/time-nudges/{index.ts,logic.ts,index.test.ts}
Check index.ts / logic.ts / index.test.ts                               exit 0

$ npx jest src/lib/document/__tests__/post-derivation.test.ts    (apps/designer-portal)
Tests: 60 passed, 60 total                                              exit 0
  (including the two D-R1-07 `?sheet=` tests — so the D-R2-05 revert lost no functional hunk)

$ npx eslint src/lib/document/post-derivation.ts \
    src/lib/document/__tests__/post-derivation.test.ts \
    src/lib/analytics/document-events.ts                                exit 0
  (designer-portal's flat config is the only working ESLint config in the repo — patina-verification)
```

`pnpm --filter @patina/designer-portal type-check` not re-run: D-R2-08 already measured it as 73
pre-existing `Cannot find module '@patina/api-routes'` / `'@patina/types/media'` errors from unbuilt
workspace dists in this worktree, none naming a file in this diff. Still owed by the integration owner.

### 00614 re-applied standalone, `BEGIN … ROLLBACK`, isolated stack `-H 127.0.0.1 -p 54422`

Stack identity confirmed first, and it is the same stack rounds 1 and 2 used:
`pg_postmaster_start_time() = 2026-09-12 00:38:30.560358+00`, **552** ledger rows, max version
`20260910152111`. Pre-state: `profiles.weekly_hours_reminder_opt_in` **absent**, 0
`uniq_notification_log_time%` indexes, 0 `time-nudges%` cron rows, 0 rows of either nudge type.

```
 pre_running_long | 0      ← the new UNIQUE indexes cannot fail on existing data
 pre_weekly       | 0

--- apply 1 ---  ALTER TABLE / COMMENT / CREATE INDEX ×2 / DO / cron.schedule → 64
 weekly_hours_reminder_opt_in | boolean | NO | false
 uniq_notification_log_time_entry_running_long
 uniq_notification_log_time_weekly_unlogged
 time-nudges-hourly | 0 * * * * | t | SELECT public.invoke_edge_function('time-nudges', '{"rule":"running_timer"}'::jsonb)
 cron_rows | 1
 column_comment | 00614/HT-34(b): opt-in for the weekly unlogged-day reminder. Defaults to false … (one
                  string — Postgres concatenates the adjacent literals across newlines, so the banner's
                  four-line COMMENT is one sentence, not a syntax error)

--- apply 2 (idempotency) ---  three "already exists, skipping" NOTICEs
 cron_rows_after_2nd | 1      ← not two (the guarded unschedule block works; new jobid 67)
 idx_after_2nd       | 2
```

**New this round — I inserted the real row shape `buildRunningTimerRecord` produces, not a stand-in**, and
captured the duplicate's `SQLSTATE` **and message text**, because D-R2-07's fix now depends on the text:

```
NOTICE: OK: first real-shape insert accepted
NOTICE: SQLSTATE=23505 MESSAGE=<duplicate key value violates unique constraint
        "uniq_notification_log_time_entry_running_long">
NOTICE: OK: D-R2-07 message.includes(indexName) WOULD match
NOTICE: OK weekly: SQLSTATE=23505 MESSAGE=<duplicate key value violates unique constraint
        "uniq_notification_log_time_weekly_unlogged">
ROLLBACK
 post-rollback: col 0 | idx 0 | cronrows 0 | rows_left 0
```

So three things are now proved rather than assumed: the exact row the function writes is **accepted** by
`notification_log` (no missing NOT NULL column, no `type` CHECK, `channel='in_app'` and
`status='delivered'` are both real enum labels, no triggers on the table); the duplicate is **rejected**;
and the rejection's **message carries the index name**, which is what D-R2-07's `message.includes(...)`
needs. The one link still unverified is PostgREST's mapping of that Postgres message onto
`error.message` — standard, but not executed here, and `insertRecord`'s error branch is reachable by no
test (see D-R3-04).

### Contamination check

Peer program's stack on 54322 (not ours): `0` `time-nudges%` cron rows, `0`
`weekly_hours_reminder_opt_in` columns, `0` `uniq_notification_log_time%` indexes, `0` rows of either
nudge type. Untouched. `agent-edge`'s `config.toml` is still tracked normally (`git ls-files -v` → `H`),
which is why every probe above went through `psql -p 54422` and no `supabase` CLI command was run from
this worktree (D-R1-13's condition, unchanged, again held harmless by discipline rather than by config).

---

## Round-2 findings — discharge verdict, each verified in the diff

| # | Verdict | Evidence |
|---|---|---|
| **D-R2-01** | **DISCHARGED via the finding's own fallback (b)** — and it **re-opened** what round 1 closed; see **D-R3-03** | `index.ts:216-237`: `resolveNudgeRule(body)` is read first, and the gate is `rule === "weekly_unlogged" && !isServiceRoleCaller(...)`. `running_timer` is ungated. All four prose sites corrected to match: `index.ts:26-42`, `logic.ts:18-29`, `00614:37-45`, `config.toml`'s `[functions.time-nudges]` comment. The pre-deploy Vault-shape confirmation (option (a)) is **still not done** and is now the fix for two findings, not one. |
| **D-R2-02** | **DISCHARGED — and the fixer corrected the finding** | `document-events.ts` now lists `· time_export_taken — scope, row_count, period (W5)`. The r2 finding's prose said "(W7)"; `plan-v2.md:723-725` sits under **§6 · W5**, so **(W5) is right and the finding was wrong**. I re-extracted every `time_*` event name from the whole plan and diffed it against the block: **all 10 present, none extra** (`time_entry_logged`, `time_rate_unresolved`, `time_timer_started`, `time_timer_stopped`, `time_scope_viewed`, `time_entry_adjusted`, `time_entry_deleted`, `time_autostart_disclosed`, `time_autostart_opted_out`, `time_export_taken`). |
| **D-R2-03** | **NOT resolved — correctly deferred; and the ruling is now bigger than round 2 framed it** | No code change; `read_at` still stamped at `logic.ts:202` / `:228`. The fixer refused to guess twice, which is right. **But D-R3-02 changes what the ruling has to decide:** `metadata.read_at` is only ONE of this repo's two read-state conventions, and the stamp satisfies the web bell while the iOS badge ignores it. The ruling must now say what "no badge" means on **both** surfaces, not pick a branch on one. |
| **D-R2-04** | **Confirmed unchanged; correctly stated, not patched** | Re-grepped: `grep -rn "sheet=" apps/designer-portal/src` still returns only `post-derivation.ts`'s comment + code and the unrelated `<PlanPreview sheet={…}>` prop. No route reads `?sheet=`. W2 dependency, stated in D-fix-r2.md. |
| **D-R2-05** | **DISCHARGED — genuinely reverted, and I verified the revert rather than trusting it** | Diffstat is now `post-derivation.test.ts | 29 ++` and `post-derivation.ts | 11 +-` against integration — i.e. **only the functional hunks**, down from 590/136. The diff body shows single quotes restored (`metaString(md, 'project_id', 'projectId')`). 60/60 jest still green including both `?sheet=` tests, so nothing functional went out with the churn. |
| **D-R2-06** | **DISCHARGED — morning-brief's idiom, copied correctly; it also introduced D-R3-03's second half** | `index.ts:247-288`. I checked the target schema rather than the comment: `public.job_runs` (`00300:41-51`) is `id bigint GENERATED ALWAYS AS IDENTITY`, `status text CHECK IN ('running','succeeded','failed','skipped')`, `detail jsonb NOT NULL DEFAULT '{}'`, `error text` — so `status:'running'/'succeeded'/'failed'`, `detail:{rule}` / `{...RunResult}`, and `error: detail` all land in real columns with legal values, and `runRow?.id as number` matches `bigint`. Shape is line-for-line `morning-brief/index.ts:41-46, 216-218`. A failed `job_runs` insert logs and continues rather than aborting the sweep (`:252-254`) — correct resilience. |
| **D-R2-07** | **DISCHARGED, and now empirically validated** | `index.ts:91-94, 167-195`. The swallow requires `code==='23505'` **and** the message to name one of the two indexes; an unrecognized 23505 `console.warn`s **and rethrows**. Validated against Postgres above: the message really does carry the index name. |
| **D-R2-08** | **NOT discharged — correctly, integration owner's** | Unchanged; owed post-merge where the dists exist. |
| **D-R2-09** | **Acknowledged, no change — correct** | `isServiceRoleCaller` + 3 helpers still duplicated verbatim in `time-nudges/logic.ts:321-414` and `client-invite/lib.ts`. Hoisting to `_shared/` would buy a fan-out redeploy; two copies is not yet a problem. |
| **D-R2-10** | **Acknowledged, no change — correct** | Re-confirmed: `comm`-style file comparison of `2ff00bb2b..origin/hour-tracking/integration` against this diff still shows **zero overlapping files**; integration still commits no `config.toml` change. Merge has no content conflict; it is still untested against W0. |

### Round-1 items still open (all unchanged, all correctly not lane D's)

**D-R1-04** (regen `database.types.ts`) · **D-R1-06** (the skip-worktree merge dance) · **D-R1-09** (nothing
executes `index.ts`; see D-R3-04, which sharpens it) · **D-R1-12** (strike `00614` from §0.20/§11's fixed
GRANT lists — re-verified: `grep -nE '^\s*(GRANT|REVOKE)' 00614` → exit 1, and
`supabase/seed/00-legacy-grants.sql` is untouched in this diff, so **no `generate-legacy-grants.py` run is
owed**) · **D-R1-13** (this worktree's `config.toml` points at the peer's ports).

---

## New findings

### D-R3-01 · MAJOR · confidence HIGH — the "quiet Record row" is digest-eligible: `digest-dispatcher` will put it in an **email**, by default, for every designer at her default preferences

`supabase/functions/time-nudges/logic.ts:173-205` (the row) · `supabase/functions/digest-dispatcher/index.ts:49-59, 262-288, 163-200, 313-330` ·
`supabase/functions/digest-dispatcher/status.ts:7-15` · `rulings.md` HT-34 · `plan-v2.md:633`

HT-34 and the plan's own §5 table say it in those words: *"Writes one quiet Record row … **No push, no
email, no badge, no `sendCompliantEmail` call**."* Rounds 0–2 all proved the first clause — `time-nudges`
imports no email helper and its port exposes no method that could reach one. That is true. It is also not
where the email comes from.

`digest-dispatcher` is **cron-scheduled and live** (probed on the isolated stack: `digest-dispatcher |
0 14 * * * | SELECT invoke_edge_function('digest-dispatcher')`). Its per-user collection query is:

```ts
.from("notification_log")
.select("id, type, template_id, status, metadata, created_at")
.eq("user_id", raw.user_id)
.gt("created_at", sinceIso)
.in("status", [...DIGEST_ELIGIBLE_NOTIFICATION_STATUSES])   // status.ts: sent, delivered, opened,
                                                            // clicked, queued, sending, unconfirmed
```

**There is no `channel` filter and no `metadata.read_at` check.** The only other gate is
`DIGEST_EXCLUDED_TYPES` (`index.ts:49-59`) — eight names, all transactional, and
`time_entry_running_long` is not one of them. Then `buildDigestHtml` renders each row's
`meta.headline ?? meta.subject ?? …`, and `sendCompliantEmail(…, notificationType:"weekly_inspiration",
category:"engagement")` sends it.

The selector gate is on by default, not off. Measured on the isolated stack:

```
notification_preferences.digest_frequency : NOT NULL DEFAULT 'weekly'::digest_frequency
notification_preferences.channels_email   : NOT NULL DEFAULT true
```

and `dispatchDigests` selects `WHERE digest_frequency <> 'never' AND channels_email = true`. So a designer
who has never touched her notification settings **is** in the digest audience.

I confirmed the eligibility against the row the function actually writes, inside the same rolled-back
transaction as the 00614 apply:

```
             type              |  status   | channel | digest_status_eligible | digest_type_excluded |    would_render_in_digest_as
-------------------------------+-----------+---------+------------------------+----------------------+----------------------------------
 time_entry_running_long       | delivered | in_app  | t                      | f                    | A timer has been running a while
 time_weekly_unlogged_reminder | delivered | in_app  | t                      | f                    |
```

`TYPE_LABELS` (`index.ts:135-161`) has no entry for either type, so the section heading falls back to
`type.replace(/_/g,' ')` — the digest would read **"time entry running long (1) · A timer has been running
a while"**. That cosmetic tell is itself the evidence that nobody has ever considered this type in the
digest.

Note what this is and is not. The digest *including* in-app rows is deliberate for marketing nudges —
`price_drop`, `back_in_stock`, `wishlist_update` all appear in `TYPE_LABELS` on purpose. So the mechanism
is pre-existing and by design; what is new is the **first row type whose own ruling forbids the email**.
Closing it is therefore lane D's, not digest-dispatcher's author's. I also checked the other
`notification_log` readers and they are clean: `notification-digest` filters `type='proposal_nudge'` /
`'decision_required'`; `comms-notification-dispatch` filters `in_app_message*`; `packages/notifications`'
frequency cap and `findRecentSequenceSend` both filter `channel='email'`. `digest-dispatcher` is the
only one with no channel filter.

**Fix:** add `"time_entry_running_long"` and `"time_weekly_unlogged_reminder"` to `DIGEST_EXCLUDED_TYPES`
in `supabase/functions/digest-dispatcher/index.ts`. Two consequences to carry into the ship note: lane D
now owns a **second** edge function, and `supabase functions deploy digest-dispatcher` joins the ship
chain (it is not a `_shared/*` edit, so the fan-out is exactly one extra function, not all importers).
Do **not** instead pick a status outside the eligible list — every remaining label (`bounced`, `failed`,
`suppressed`, `complained`) is a lie about the row, and `use-inbox` doesn't filter on status anyway so the
bell would still show it.

### D-R3-02 · MEDIUM · confidence HIGH — "no badge" holds on the web bell and fails on the iOS springboard: `read_at` is only one of this repo's two read-state conventions

`supabase/functions/apns-send/core.ts:72-122` · `supabase/functions/apns-send/index.ts:61-68, 95-107` ·
`packages/supabase/src/hooks/use-inbox.ts:123-124, ~282` · `logic.ts:197-202, 224-228` · D-R1-02 / D-R2-03

D-R1-02's fix stamps `metadata.read_at` at write time, and I re-verified it does work for the web surface:
`useUnreadInboxCount` filters `!(r.metadata && r.metadata.read_at)`, so the nudge never raises the bell.

The iOS badge uses a **different** predicate:

```ts
// apns-send/core.ts:72
export function badgeRowIsRead(row: BadgeRow): boolean {
  const openedAt = row?.opened_at ?? null;
  if (openedAt !== null) return true;
  return row?.status === "opened" || row?.status === "clicked";
}
```

No `metadata.read_at`. Our row is `opened_at = NULL`, `status = 'delivered'` → `read = false`. And
`collapsedBadgeCount` collapses on `metadata.entity_type|entity_id`, which this row does not carry, so it
takes the `if (!read) count++` branch at `core.ts:110-112` — an uncollapsed, unconditional **+1**. The
query that feeds it (`index.ts:95-101`) selects `channel='in_app'` with `status IN
('queued','sending','delivered','unconfirmed','opened','clicked')`, which admits it.

Confirmed in the same rolled-back transaction:

```
             type              | opened_at |  status   | counts_toward_ios_badge | has_metadata_read_at
-------------------------------+-----------+-----------+-------------------------+----------------------
 time_entry_running_long       |           | delivered | t                       | t
 time_weekly_unlogged_reminder |           | delivered | t                       | t
```

Second-order, not first: `apns-send` computes the badge only while dispatching a push for some *other*
event, so the nudge never triggers a push itself — it silently inflates the number attached to the next
unrelated one. A nine-hour timer therefore does produce a springboard number the designer sees, which is
the thing HT-34 named.

**Fix (cleanest, and entirely inside lane D's own file):** add `opened_at: now.toISOString()` alongside
`sent_at` in `NotificationLogInsert` and both builders. `badgeRowIsRead` then returns `true`, both
conventions agree, and no other function needs redeploying. The alternative — teaching `badgeRowIsRead`
about `metadata.read_at` — is more correct in the abstract but buys an `apns-send` redeploy and changes a
predicate five other producers depend on. **Fold this into D-R2-03's ruling:** if the ruling goes the other
way and the row should read *unread*, then it must say so for both surfaces, and `opened_at` stays NULL
deliberately.

### D-R3-03 · MEDIUM · confidence HIGH (mechanism) / MEDIUM (whether to act pre-ship) — the narrowing re-opened the anon-triggerable sweep, and D-R2-06's `job_runs` row turned the exposure round 1 judged "bounded" into unbounded row growth

`index.ts:216-254` · D-R1-01 / D-R1-11 (which called the cost "bounded") · D-R2-01 · D-R2-06 ·
`00300:41-75` · `morning-brief/index.ts:59-66`

Round 1's D-R1-01 established the premise and nothing has changed it: `verify_jwt = true` admits **any**
project-signed JWT, the publishable anon key included, and that key is a committed literal in every
portal's `wrangler.jsonc`. Round 1 closed the door on both arms. Round 2 re-opened it for
`running_timer` — defensibly, to stop an unconfirmed Vault literal from silently 403ing the live rule.

But D-R1-11 judged that exposure "bounded" against a function whose only write was an **idempotent**
`notification_log` row. That is no longer the shape. Every request now reaches:

```ts
const { data: runRow, … } = await supabase.from("job_runs")
  .insert({ job_name: "time-nudges", status: "running", detail: { rule } })
```

unconditionally, before any authorization consideration, under the service-role client. So one public
credential now yields **one unbounded `job_runs` row per request**, forever, with no rate limit in the
function, in `config.toml`, or at the gateway. `job_runs` is the Agent OS Run Log — the admin-portal
surface reads it, and `morning-brief` pulls **every** row in yesterday's window
(`morning-brief/index.ts:59-66`) to compose the daily digest. Flooding it degrades both. The
`notification_log` writes stay bounded by the new UNIQUE indexes, so this is the one genuinely unbounded
effect the round-2 diff added.

Smaller, same door: the 200 response body returns `{rule, scanned, recorded, skipped}` to that caller, and
`scanned` is the count of stale running timers **platform-wide** — a cross-tenant aggregate, to a public
key.

**Fix — and it is D-R2-01's own option (a), which is still owed:** one read-only probe on Strata settles
both halves at once.

```sql
SELECT left(decrypted_secret,10) AS prefix, length(decrypted_secret)
  FROM vault.decrypted_secrets WHERE name = 'app.settings.service_role_key';
-- if it is a legacy JWT, also confirm iss='supabase' and ref='bkvcixdmuyejfzcijpdg'
```

Shape only, never the value. If it satisfies an arm of `isServiceRoleCaller`, widen the gate back to both
arms (round 1's shape) and this finding and the 403 risk both disappear. If it satisfies none, the gate
must stay narrow **and** the `job_runs` insert should move behind a cheap non-credential guard, because
round 2's mitigation otherwise hands a public key a write. For the record, on the isolated stack the Vault
literal is a legacy JWT with **no `ref` claim** and `iss='supabase-demo'`, so locally only byte-equality
with the injected key admits the cron — the local stack cannot answer this question for Strata, which is
exactly why the probe is owed there.

### D-R3-04 · LOW · confidence HIGH — the suite's own name now asserts the opposite of the code, and nothing in any gate executes the one line round 2 changed

`supabase/functions/time-nudges/index.test.ts:426` · `index.ts:216-237` · D-R1-09

```
$ deno test …
  only the service role may run either sweep ... ok
```

That test name is **false as of `4d72d8590`**: only the `weekly_unlogged` sweep is gated. The assertions
under it are fine — they exercise `isServiceRoleCaller` as a pure function, correctly — but the name is
what a later reader greps, and it says rule (a) is gated when it is not.

Underneath the naming is the substantive half. The suite imports `./logic.ts` only, deliberately (importing
`index.ts` would boot `Deno.serve`). So **which arm the gate binds** — the single most consequential line
changed this round, and the whole subject of D-R2-01 — is asserted by nothing. Nor is
`insertRecord`'s new 23505 discrimination (D-R2-07), nor the `job_runs` bookkeeping (D-R2-06). All three of
round 2's code changes live in the one file no gate executes. D-R1-09 flagged that as a deferral; it is now
the coverage gap sitting exactly on top of this round's changes.

**Fix:** rename the test to what it proves (e.g. *"isServiceRoleCaller admits only the service-role
principal"*), and either extract the handler's routing decision into a testable pure function in `logic.ts`
— something like `requiresServiceRole(rule: NudgeRule): boolean` — or make the ship probe assert it live
(POST `{"rule":"weekly_unlogged"}` with the anon key → 403; POST `{}` with the anon key → 200). The pure
extraction is the cheap one and needs no deploy.

### D-R3-05 · LOW · confidence MEDIUM — a 403 on the dark arm leaves no trace anywhere, which is the inverse of D-R2-06's own argument

`index.ts:224-237` vs `:247-254`

The gate returns 403 **before** the `job_runs` row is opened, and logs nothing. So someone probing rule (b)
— the arm the gate exists to protect — produces no `job_runs` row, no `console` line, no
`notification_log` row: the attempt is invisible on every surface. D-R2-06's whole argument was that a
silent outcome on a gated path is the thing to avoid. One `console.warn` before the 403 (or a `skipped`
`job_runs` row, which the `00300` CHECK already permits) would close it. Low because rule (b) is inert
three ways; named because the asymmetry is unintentional.

### D-R3-06 · LOW · confidence HIGH — the nudge rows inflate the admin comms dashboard's "sent" count and depress its open rate

`apps/admin-portal/src/app/api/admin/comms/dashboard/route.ts:31-32`

```ts
supabase.from('notification_log').select('*', {count:'exact', head:true}).gte('created_at', since)
  .in('status', ['sending','sent','delivered','opened','clicked','unconfirmed']),   // no channel filter
supabase.from('notification_log').select('*', {count:'exact', head:true}).gte('created_at', since)
  .not('opened_at','is',null),
```

`status='delivered'` with `opened_at IS NULL` counts in the numerator of "sent" and never in "opened". This
is shared with every other `in_app` producer, so it is a pre-existing class rather than a lane-D defect —
but D-R3-02's fix (stamping `opened_at`) happens to close the open-rate half too, which is a reason to
prefer that fix over patching `badgeRowIsRead`.

### D-R3-07 · INFORMATIONAL · confidence HIGH — `00610–00613` exist on no ref, so `00614` is a forward reference until lane A pushes

Enumerated across every ref (`git for-each-ref` over `refs/heads` + `refs/remotes`, `git ls-tree` per ref,
pattern `supabase/migrations/006[12][0-9]_`): the **only** hits are `hour-tracking/edge` and its remote,
both carrying `00614_time_nudges_cron.sql` alone. Nothing collides, and §0.2's "provisional until merge"
still governs — but lane D's file currently sorts immediately after `00601`, so a merge that lands 00614
before lane A's 00610–00613 would replay it against a schema W4 has not finished building. Harmless for
00614 specifically (it depends on nothing from 00610–00613), stated so the merge order is chosen rather
than inherited.

### D-R3-08 · INFORMATIONAL · confidence HIGH — §5's own Done-when cannot pass today, and the reason is D-R1-04

`plan-v2.md:692` · §0.19

> `grep -rn "weekly_hours_reminder_opt_in" apps packages` returns nothing **outside `database.types.ts`**.

Measured: `grep -c weekly_hours_reminder_opt_in packages/supabase/src/database.types.ts` → **0**, and the
`apps packages` grep returns **nothing at all**. So the Done-when is vacuously green for the wrong reason:
the column is absent from the generated types entirely, not merely absent from portal code. D-R1-04 parked
the regen with the integration owner, which is the right home (integration already regenerated this file
for W0) — recorded here so the Done-when is read as **unmet**, not as passed.

---

## Hard rules and binding rules re-checked, no finding

- **No flags** (§0.5, P-5): `git diff … | grep -nE "useFeatureFlag|posthog.isFeatureEnabled|ComingSoon|feature_flag"` → no match. ✓
- **No backfill** (§0.6, P-4): `00614` touches no existing row; `ADD COLUMN … DEFAULT false` + two indexes, both probed against **0** pre-existing rows of either type. ✓
- **Additive to `project_time_entries` only** (§0.1): the function only SELECTs it; `00614` does not touch it. ✓
- **A client-supplied `hourly_rate_cents` is discarded server-side** (§0.7): no rate path anywhere in the diff. ✓
- **The invoiced-entry lock untouched** (§0.12): `guard_invoiced_time_entry` not referenced. ✓
- **One running-timer slot, with the desk** (§0.11, HT-7): the function writes no `duration_minutes IS NULL` row — it writes only `notification_log` and `job_runs`. ✓
- **`notes` never in a rollup return** (§0.10, HT-36): metadata is `entry_id, project_id, started_at, subject, message, sheet, deep_link, read_at` (+ `week_key`). No `notes`. ✓
- **Hand-numbered migration at its assigned number** (§0.2): `00614_time_nudges_cron.sql`, banner `-- 00614 —` matches the filename, unique across every ref (D-R3-07). ✓
- **No `generate-legacy-grants.py` owed**: `grep -nE '^\s*(GRANT|REVOKE)' 00614` → exit 1; `supabase/seed/00-legacy-grants.sql` untouched in the diff. ✓ (D-R1-12 still owes the plan-text correction.)
- **Migration idempotent + bannered** (§0.3): second apply produced only "already exists, skipping" NOTICEs; cron rows stayed at 1. ✓
- **`verify_jwt` decision** (patina-edge-functions step 4): `true`, declared in `config.toml`, one hunk, `[functions]`-only — no `project_id`, no port, no other section touched. No CORS (never browser-called), correct. ✓
- **No `_shared/*` edit** → no fan-out redeploy owed *for this diff*. Zero `_shared` imports in `time-nudges`. ✓ (D-R3-01's fix would add `digest-dispatcher` to the deploy list — still not a `_shared` change.)
- **No new SECURITY DEFINER function** (§0.16): none. `public.invoke_edge_function` (00258) reused, not redefined. Nothing touches HT-10-a's `project_hours_total` (lane A's, W2). ✓
- **No automated external send *by this function***: `index.ts` imports exactly `@supabase/supabase-js` and `./logic.ts`; its only writes are `notification_log` (always `channel:"in_app"`) and `job_runs`. ✓ — **but see D-R3-01: a downstream function sends on the strength of that row.** The structural check passes and the ruling still fails.
- **Commit hygiene**: four commits, explicit pathspecs, worktree clean, nothing from the main checkout, no `git add -A` residue. ✓
- **Deno hygiene**: all three `deno` invocations passed `--config supabase/functions/deno.json`; no `deno.lock` in the worktree or at the repo root. ✓

---

## Round-4 asks, in the order I would do them

1. **D-R3-01** — exclude both nudge types from `digest-dispatcher`'s `DIGEST_EXCLUDED_TYPES`, and add
   `supabase functions deploy digest-dispatcher` to W4's ship chain. This is the one finding that makes a
   shipped W4 send an email HT-34 forbade, to a default-configured designer.
2. **D-R3-02** — stamp `opened_at` alongside `sent_at` in both record builders, so "no badge" is true on
   iOS as well as the web bell. One line, lane D's own file, and it closes D-R3-06 too.
3. **D-R2-03 + D-R3-02 together** — rule "no badge" once, for **both** read-state conventions. Keep
   `read_at` + `opened_at` (born read, both surfaces quiet), or drop both (born unread, both surfaces
   nudge). Do not leave the two surfaces disagreeing, which is where the branch stands today.
4. **D-R3-03 / D-R2-01(a)** — run the read-only Vault-shape probe on Strata. It decides whether the gate
   widens back to both arms (closing the public-trigger and `job_runs`-growth surface) or stays narrow with
   the `job_runs` insert moved behind a guard.
5. **D-R3-04** — rename the false test and extract `requiresServiceRole(rule)` into `logic.ts` so the gate
   placement is asserted by the suite that actually runs.
6. **D-R3-05** — one `console.warn` (or a `skipped` `job_runs` row) before the dark arm's 403.
7. **Carried, all needing the orchestrator or the integration owner, none needing lane D:** **D-R1-04 /
   D-R3-08** (regen `database.types.ts`; §5's Done-when is unmet until then) · **D-R1-06** (script the
   skip-worktree dance before the first W4 merge) · **D-R1-12** (strike `00614` from §0.20/§11's fixed GRANT
   lists) · **D-R1-09** (the live probe at ship — now also the only check on D-R3-04's gate placement) ·
   **D-R2-04** (the `?sheet=hours` W2 dependency in the ship note and W2's Done-when) · **D-R2-08**
   (designer-portal `type-check` where the dists exist) · **D-R3-07** (merge order vs. lane A's 00610–00613).

*Re-reviewed 2026-09-11/12. Isolated stack `127.0.0.1:54422` (552 ledger rows, `pg_postmaster_start_time
2026-09-12 00:38:30.560358+00`); peer stack on 54322 probed read-only and left untouched. `00614` applied
only inside `BEGIN … ROLLBACK`, verified reverted (col 0 / idx 0 / cron 0 / rows 0). No branch mutated, no
commit made, no deploy, no Strata access, no `supabase` CLI command from this worktree. Not verified:
anything requiring the deployed function or Strata — D-R3-03's Vault-shape question and D-R3-01's actual
digest send are both exactly that; `pnpm --filter @patina/designer-portal type-check` (pre-existing dist
failures, D-R2-08); PostgREST's mapping of the Postgres 23505 message onto `error.message` (validated at
the psql layer only).*
