# D-review-r1 — adversarial review, lane D (W4: time-nudges + 00614 + dark opt-in), round 1

**clean: NO** — 3 major, 3 medium, 5 low, 2 informational. Nothing here is a blocker: every blocker the
brief named is refuted with evidence below. The three majors are all "a ruled promise in plan-v2 §5 is
stated more strongly than the code delivers", not defects that corrupt data or send anything external.

- Reviewer: separate context, not the implementer. Skills loaded: `patina-edge-functions`, `patina-verification`.
- Diff reviewed: `git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-edge diff origin/hour-tracking/integration...hour-tracking/edge`
  → 5 files, 869 insertions, 0 deletions, at `64dc2cf0c` on `hour-tracking/edge` (merge-base `2ff00bb2b`;
  `origin/hour-tracking/integration` tip `85f875907`, which already carries W0's `00595–00597`).
- Worktree is clean (`git status --porcelain` empty); no `deno.lock` anywhere under the worktree or at `/Users/kody/Code/patina-merged`.

---

## Gates I ran myself (not taken from D-impl)

```
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/time-nudges/
running 13 tests from ./supabase/functions/time-nudges/index.test.ts
rule (a): a 9-hour running timer produces exactly one Record row across repeated hourly sweeps, and zero email/SMS calls ... ok (16ms)
rule (a): a timer running less than 8 hours produces no Record row ... ok (0ms)
rule (a): a completed entry (duration_minutes set) never reaches the port's stale-timer query surface ... ok (0ms)
rule (b): only opted-in members with nothing logged this week are selected; an opted-out member yields nothing ... ok (0ms)
rule (b): a second sweep the same week does not re-nudge (weekly, not hourly) ... ok (0ms)
resolveNudgeRule: only an exact {rule:'weekly_unlogged'} body selects rule (b) ... ok (0ms)
routing: the default body ({}) never calls the weekly-unlogged port methods, even when a candidate would qualify ... ok (0ms)
routing: {rule:'running_timer'} explicitly behaves identically to the default body ... ok (0ms)
staleRunningTimerCutoff: exactly 8 hours before now ... ok (0ms)
weeklyLookbackSince: exactly 7 days before now ... ok (0ms)
isoWeekKey: stable across the same ISO week, changes across a week boundary ... ok (0ms)
buildRunningTimerRecord: no NOT NULL project_id assumption — a project-less (internal) timer still nudges ... ok (0ms)
buildWeeklyUnloggedRecord: carries the week key used for its own dedupe ... ok (0ms)

ok | 13 passed | 0 failed (19ms)
deno test exit=0

$ deno check --config supabase/functions/deno.json supabase/functions/time-nudges/index.ts
deno check exit=0     (no output)
```

### 00614 applied standalone, `BEGIN … ROLLBACK`, isolated stack `-H 127.0.0.1 -p 54422`

Stack identity confirmed first: `pg_postmaster_start_time() = 2026-09-12 00:38:30+00`, ledger head
`00601` (+ the imported `20260910152111`), 552 rows — i.e. W0+W1 landed, **no W4 lane-A objects present**.

```
BEGIN
ALTER TABLE
COMMENT
DO
 schedule
----------
       62

         column_name          | data_type | is_nullable | column_default
------------------------------+-----------+-------------+----------------
 weekly_hours_reminder_opt_in | boolean   | NO          | false

      jobname       | schedule  |                                        command                                        | active
--------------------+-----------+---------------------------------------------------------------------------------------+--------
 time-nudges-hourly | 0 * * * * | SELECT public.invoke_edge_function('time-nudges', '{"rule":"running_timer"}'::jsonb); | t

 n
---
 1
--- re-apply for idempotency ---
psql:.../00614_time_nudges_cron.sql:30: NOTICE:  column "weekly_hours_reminder_opt_in" of relation "profiles" already exists, skipping
ALTER TABLE
COMMENT
DO
 schedule
----------
       63

 n_after_second_apply
----------------------
                    1
ROLLBACK
             probe             | count
-------------------------------+-------
 post-rollback column present? |     0
          probe          | count
-------------------------+-------
 post-rollback cron rows |     0
```

So: applies cleanly on `00601` alone, idempotent on a double-apply (exactly one `time-nudges-hourly`
row, not two), rolls back to nothing. `public.invoke_edge_function(fn_name text, body jsonb)` exists
and the command text matches its signature.

### I also executed the SQL equivalents of every query `index.ts` actually issues

(The 13 deno tests never import `index.ts` — they drive `logic.ts` through an in-memory fake — so the
real data access was entirely unexercised by any gate. I closed that myself.)

```
-- listStaleRunningTimers
 Index Scan using uniq_project_time_entries_running_timer on project_time_entries
   Filter: (started_at <= (now() - '08:00:00'::interval))

-- hasRunningTimerRecord
 Aggregate
   ->  Index Scan using idx_notification_log_composite on notification_log
         Index Cond: ((user_id = '…'::uuid) AND (type = 'time_entry_running_long'::text))
         Filter: ((metadata @> '{"entry_id": "x"}'::jsonb) AND (channel = 'in_app'::notification_channel))

-- listOptedInMembersNeedingWeeklyReminder
 Seq Scan on profiles
   Filter: weekly_hours_reminder_opt_in

-- insertRecord, real INSERT inside the same rolled-back txn
                  id                  |          type           | channel |  status
--------------------------------------+-------------------------+---------+-----------
 a51c332a-…                           | time_entry_running_long | in_app  | delivered
INSERT 0 1
```

Every column name resolves, both dedupe reads are index-backed, and the insert satisfies every
constraint on `notification_log` (`channel` enum has `in_app`, `status` enum has `delivered`, `type` is
plain `text` with no CHECK, `notification_log_ref_pair_chk` is satisfied by both `ref_*` staying NULL).
`channel='in_app', status='delivered'` is the established shape for a bell row (`00280:27`, `00534:16`).

`isoWeekKey` verified independently across three year boundaries (`deno run` probe, file removed
after): `2025-12-29 → 2026-W01`, `2027-01-03 → 2026-W53`, `2027-01-04 → 2027-W01`, and all seven days
of each boundary week collapse to a single key. Correct; no double-nudge at a year edge.

---

## Blockers the brief named — all refuted

| Refutation target | Verdict | Evidence |
|---|---|---|
| The function sends anything external (email/push/SMS) — **blocker** | **REFUTED** | `index.ts` imports exactly two things: `@supabase/supabase-js` and `./logic.ts`. No `_shared/` import at all (so §11 step 8's "no fan-out redeploy owed" holds). The only write in either file is `insertRecord` → `notification_log`, always `channel:"in_app"`. I also chased **indirect** fan-out, which is the way this promise would realistically break: `pg_trigger` on `public.notification_log` returns **0 non-internal triggers**; `notification-digest` reads `in_app` rows only for `type='proposal_nudge'` (`index.ts:171-174`); `release_due_client_pushes` selects only `channel='push' AND status='queued' AND deliver_after IS NOT NULL`; `notification-dispatch` consumes `notification_queue` and only ever *writes* `notification_log`. Nothing picks up `time_entry_running_long`. |
| The service-role bearer is string-compared — **blocker** | **REFUTED** | There is no bearer comparison of any kind. `index.ts` reads no `Authorization` header and never touches `SUPABASE_SECRET_KEYS`. This matches the plan's explicit §5 design and the three peer cron functions (`decision-reminders`, `field-daily`, `morning-brief` — grepped, none carries an in-code service-role check; `morning-brief`'s only `service_role` hit is a comment). The memory rule ("never string-compare the injected key") is trivially satisfied. See D-R1-01 for the *consequence* of relying on the gateway alone, which is a real finding but not this one. |
| The cron runs more than hourly, or names the wrong function | **REFUTED** | `'0 * * * *'`, command `SELECT public.invoke_edge_function('time-nudges', '{"rule":"running_timer"}'::jsonb);`, function directory `supabase/functions/time-nudges/`. Byte-for-byte the `00572:1216-1225` shape (guarded `DO $$ … cron.unschedule … $$` then `cron.schedule`), which I read at `supabase/migrations/00572_she_sets_the_pace.sql:1212-1225`. One cron row, `active = t`. |
| 00614 is not the assigned number, or references a W4 object that does not exist yet | **REFUTED** | §0 numbering amendment assigns W4 `00610–00614` with "lane D's cron migration at 00614" — filename and banner both say 00614. Applied standalone against a DB at head `00601` (no `00610–00613`): clean. It references no `project_time_entries.studio_id`, no classifier, nothing from lane A. Number is also unique across **every** ref (`git for-each-ref` loop over `refs/heads` + `refs/remotes` for `supabase/migrations/0061*`: only `hour-tracking/edge` and its remote carry `00614`). |
| The config.toml diff touches anything but `[functions]` | **REFUTED** | One hunk, `@@ -663,6 +663,17 @@`: an 8-line comment plus `[functions.time-nudges]` / `verify_jwt = true`, inserted after `[functions.invoice-check-intent]` and before `[analytics]`. No `project_id`, no port, no other section. (But see D-R1-06 — the *merge* of this legitimate change is the hazard.) |
| Tests exist and pass | **CONFIRMED present and green** | 13/13, exit 0, pasted above. Quality caveats in D-R1-08 and D-R1-09. |

---

## Findings

### D-R1-01 · MAJOR · confidence HIGH — rule (b) is reachable in production; plan §5's "Reachable? **no**" is false

`supabase/functions/time-nudges/index.ts` (whole file) · `plan-v2.md` §5 "Edge / cron (lane D)" table
and dark-checklist items 1 and 3 · `supabase/migrations/00614_time_nudges_cron.sql:56-69`

`verify_jwt = true` means the gateway requires *a JWT signed with the project secret* — and the
**publishable anon key is exactly such a JWT**. Per CLAUDE.md, prod portal env lives as committed
literals in `apps/*/wrangler.jsonc` `vars`, so `NEXT_PUBLIC_SUPABASE_ANON_KEY` is public by design.
Anyone on the internet can therefore reach the dark arm:

```
POST https://<ref>.supabase.co/functions/v1/time-nudges
Authorization: Bearer <public anon key>
{"rule":"weekly_unlogged"}
```

`resolveNudgeRule` routes that straight into `runWeeklyUnloggedSweep`. Both the plan and D-impl argue
darkness from the *cron* ("00614 never sends that body", "no `cron.job` row for it is ever created"),
which is only half the premise — the cron is not the only caller the platform permits. What actually
makes rule (b) inert today is **dark-checklist item 2 alone**: `weekly_hours_reminder_opt_in` defaults
`false` and has no writer, so `listOptedInMembersNeedingWeeklyReminder` returns `[]` and zero rows are
written. That is a real guarantee, but it is a *different* guarantee from the one documented, and it is
one `UPDATE profiles SET weekly_hours_reminder_opt_in = true` — or one future settings surface landing
before the weekly cron is ruled — away from a reminder nobody scheduled firing at an attacker-chosen
rate (bounded per week per user by `hasWeeklyUnloggedRecord`, but not by the absent cron).

**Fix (either is acceptable; pick one and make the docs match):**
(a) Restate the guarantee honestly — amend §5's reachability cell to "reachable by any JWT-bearing
caller; inert because no profile is opted in", and amend 00614's banner line "rule (b) cannot fire in
prod no matter how the edge function's own logic reads", which is the sentence that is wrong. Cheapest,
and truthful.
(b) Make the arm refuse a non-service-role caller: verify the **`role` claim of the gateway-verified
JWT** (the `client-invite` pattern the task brief pointed at) and 403 `weekly_unlogged` otherwise. Do
**not** compare the bearer string to the injected key — that is the 2026-09-09 rotation trap.

### D-R1-02 · MAJOR · confidence HIGH — the Record row *does* raise a badge; §5 promises "no badge"

`supabase/functions/time-nudges/logic.ts:139-162` (`buildRunningTimerRecord` sets no `read_at`) ·
`packages/supabase/src/hooks/use-inbox.ts:250-280` · `apps/designer-portal/src/components/document/studio-drawer.tsx:158` ·
`apps/designer-portal/src/components/document/mobile/mobile-bar.tsx:98`

Plan §5's rule-(a) cell reads: "**No push, no email, no badge, no `sendCompliantEmail` call**". Push,
email and `sendCompliantEmail` all hold (see the refutation table). **Badge does not.**
`useUnreadInboxCount` selects the user's 200 most recent `notification_log` rows and counts every one
where `channel === 'in_app'` and `metadata.read_at` is unset:

```ts
return rows.filter((r) => {
  const eligible = r.channel === 'in_app' || (r.channel === 'email' && !TRANSACTIONAL_TYPES.has(r.type));
  if (!eligible) return false;
  return !(r.metadata && r.metadata.read_at);
}).length;
```

There is no type allowlist — the only exclusion for an `in_app` row is `metadata.read_at`. The nudge
sets `subject`, `message`, `deep_link`, `entry_id`, `project_id`, `started_at` and **not** `read_at`, so
every stale-timer Record increments the unread count rendered by the studio drawer and the mobile bar.
A "quiet Record row" that lights the drawer is the engagement-shaped outcome HT-34 was ruled against.

**Fix:** add `read_at: now().toISOString()` to the nudge's `metadata` (the row still lands in the
Record ledger and still renders — `inboxRecordItem` just marks it read — but raises no badge), **or**
get the "no badge" clause amended if "badge" was only ever meant as the APNs badge. The ambiguity is
worth a ruling rather than a guess: §5 already lists "push" separately, which argues the UI badge is
what was meant.

*(Good news while I was in here: the metadata keys are right. `notificationTitle` at
`post-derivation.ts:309` reads `metaString(md, 'subject', 'headline', 'title')` — `subject` is the
**first** key, so the nudge titles correctly; `deepLinkFor` at `:164` reads `deep_link` then `url`.)*

### D-R1-03 · MAJOR · confidence MEDIUM-HIGH — idempotency is query-before-insert, not a constraint, and the repo already has the right idiom for this exact shape

`supabase/functions/time-nudges/index.ts:64-74, 96-111` · `supabase/migrations/00614_time_nudges_cron.sql` (no index) ·
precedent: `idx_notification_log_project_file_event`

`hasRunningTimerRecord` then `insertRecord` is two round trips with no uniqueness backing them. Two
concurrent invocations both read `count = 0` and both insert, producing two Record rows for one timer —
which breaks §5's Done-when verbatim ("A nine-hour running timer produces **exactly one** Record row").
On an hourly single-shot cron that race is theoretical. **Combined with D-R1-01 it is trivially
reachable**: fire two anon POSTs at once.

`notification_log` already carries the constraint-shaped solution for the structurally identical case:

```
"idx_notification_log_project_file_event" UNIQUE, btree (user_id, (metadata ->> 'event_key'::text))
    WHERE type = 'project_file_changed'::text AND channel = 'in_app'::notification_channel
```

00614 adds no analogue. D-impl cites `lead-expiration-check` / `back-in-stock-check` /
`price-drop-check` as the precedent for query-before-insert, which is true, but those are not the
precedent the plan's "exactly one" language needs.

**Fix:** add to 00614 a partial UNIQUE expression index on
`(user_id, (metadata->>'entry_id')) WHERE type = 'time_entry_running_long' AND channel = 'in_app'`
(and the `week_key` analogue for rule (b)), keep the pre-check as a cheap fast path, and tolerate
`23505` on insert. Note this makes 00614 a real index migration — re-confirm the `00614` number holds
at merge time either way (§0.2a).

### D-R1-04 · MEDIUM · confidence HIGH — `database.types.ts` not regenerated; W4's own gate cannot pass on this branch

`plan-v2.md` §11 "Type regeneration ownership" · §0.19 · §5 "Gate commands (verbatim)" ·
`packages/supabase/src/database.types.ts` (untouched — `git diff --stat` against integration returns nothing for it)

§11 is unambiguous: "The lane that writes a migration runs `pnpm db:generate` and commits
`packages/supabase/src/database.types.ts` with it. … **lane D for `00614`**." §5's verbatim gate list
ends with `pnpm db:generate` / `git diff --exit-code packages/supabase/src/database.types.ts`. 00614
adds `profiles.weekly_hours_reminder_opt_in`; the committed types do not contain it (grep for the
column across `apps packages` returns **nothing at all**, including the types file). So the W4 gate as
written fails on this branch, and the plan's dark-checklist item 4 — "its only appearance outside the
migration is in the regenerated `database.types.ts`" — is currently unmet in the other direction.

D-impl flags the deferral honestly and cites a task-brief line ("the integrator regenerates") that
conflicts with §11. **Orchestrator ruling needed**; either way somebody owes one
`pnpm --dir <worktree> db:generate` against the isolated stack plus a commit. Mechanical; no judgement.

### D-R1-05 · MEDIUM · confidence HIGH — lane D's other named W4 deliverable is missing: the canonical event-name list in `document-events.ts`

`plan-v2.md` §5 header ("Lane … **D (Sonnet)** for `00614` + the edge function + **the PostHog event set**"),
§5 "PostHog events", §11 shared-file ownership · `apps/designer-portal/src/lib/analytics/document-events.ts` (untouched)

§5's PostHog section: "None new. `time_entry_logged` carries `source='internal'`. **Lane D also lands
the canonical event-name list as a doc comment in `document-events.ts`** for lane C's `posthog-ios`
call sites." §11 names lane D "sole writer of this file for the whole program — it is otherwise a
four-lane conflict surface." The diff touches 5 files; `document-events.ts` is not one of them, and
`grep -n "time_entry\|hours\|timer" apps/designer-portal/src/lib/analytics/document-events.ts` returns
nothing — so neither the W1 emitters (`time_entry_logged`, `time_rate_unresolved`) nor the W4 doc
comment exist yet.

W6 (lane C, iOS) is briefed to take its event names *from that list*. If lane D's W1 emitter task is a
separate dispatch, only the doc-comment half is this round's gap — but somebody has to say so, because
a later lane writing this file breaks §11's single-writer rule.

### D-R1-06 · MEDIUM · confidence HIGH (flag state) / MEDIUM (exact git failure mode) — merging this branch collides with the skip-worktree'd `config.toml`

```
$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-integration ls-files -v supabase/config.toml
S supabase/config.toml                     # S = skip-worktree
  project_id = "patina-hours" / port 54421 / port 54422 / port 54429

$ git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-edge ls-files -v supabase/config.toml
H supabase/config.toml                     # H = normal
  project_id = "supabase"    / port 54321 / port 54322 / port 54329
```

Lane D's commit legitimately modifies the tracked `supabase/config.toml` (the plan *requires* the
`[functions.time-nudges]` block there). The integration worktree holds an uncommitted, skip-worktree'd
edit to the same file — the port isolation this whole program depends on. Merging into it will either
abort (`Entry 'supabase/config.toml' not uptodate. Cannot merge.` / "local changes would be
overwritten") or, worse, succeed while the worktree silently keeps a `config.toml` with **no**
`[functions.time-nudges]` entry — so a local `supabase functions serve` would not know the function
exists, and the committed tree and the working tree would disagree.

**Not lane D's defect** — it is an integration-mechanics step nobody has scripted. The sequence is:
`git update-index --no-skip-worktree supabase/config.toml` → stash or copy aside the port edit → merge →
re-apply the port edit → `git update-index --skip-worktree supabase/config.toml` → verify `ls-files -v`
shows `S` again and that the merged `config.toml` in HEAD contains both the ports-from-origin *and*
`[functions.time-nudges]`. Do this before any other W4 merge so it's discovered once, not four times.

### D-R1-07 · LOW · confidence HIGH — the `?sheet=hours` deep link is discarded for every project-bearing nudge

`supabase/functions/time-nudges/logic.ts:156-158` · `apps/designer-portal/src/lib/document/post-derivation.ts:152-158, 196-202`

The nudge builds `deep_link = /doc/{project_id}?sheet=hours`. But `deriveRecordRow` computes
`docHref = documentHrefFor(n)` **first** and uses it in preference to the deep link:

```ts
const deep = deepLinkFor(n);
const href = docHref ?? (isDocumentRoute(deep) ? deep : null);
```

`documentHrefFor` is built from `metadata.project_id` alone and returns `/doc/{projectId}` (or
`/doc/{projectId}#anchor` when `metadata.section`/`section_key` is present). Since the nudge carries
`project_id`, `docHref` is non-null and the `?sheet=hours` query never survives — the designer lands on
the document, not on the Hours book. The project-less (internal) case is fine: `docHref` is null, and
`isDocumentRoute('/desk?book=hours')` is true (`/desk` is in `DOCUMENT_ROUTE_PREFIXES` and the
`startsWith('/desk?')` leg matches), and `/desk?book=hours` is a real doorway (`desk-doorway.tsx:19`).

Worth naming because §12 risk 12 and W2's Done-when both rest on "`?sheet=hours` opens the Hours book".
**Fix:** either drop `project_id` from the nudge metadata (the deep link then wins, at the cost of the
Record losing its project address and its `documentHrefFor` fallback), or carry the sheet through a key
`documentHrefFor` honours, or accept `/doc/{id}` and delete the misleading query string.

### D-R1-08 · LOW · confidence HIGH — one of the 13 tests is tautological and its name claims coverage it has none of

`supabase/functions/time-nudges/index.test.ts:179-200`

`"rule (a): a completed entry (duration_minutes set) never reaches the port's stale-timer query
surface"` seeds `runningTimers: []` and asserts `result.scanned === 0`. No completed entry is
constructed; no `duration_minutes` value is read by anything under test. Its own comment concedes it:
"the fake mirrors that contract **by construction**". The actual filter — `.is("duration_minutes",
null)` at `index.ts:58` — is never executed by any gate in the program. A test whose name describes
coverage it does not provide is worse than no test; it is the false-green class §0.24 and §12 risk 9 are
about. **Fix:** delete it, or promote it to a live-stack assertion (I verified the predicate's plan by
hand — see the EXPLAIN above — so the behaviour is right; it is the *test* that is empty).

The sibling claim "and zero email/SMS calls" in the first test is also structural rather than asserted
(the fake exposes no such method), but that one is honestly documented in the file header and the
structural argument genuinely holds — informational, not a finding.

### D-R1-09 · LOW · confidence HIGH — no live probe of the deployed shape; `index.ts` is never executed by any gate

`patina-edge-functions` step 6/8 and its Verification checklist · `plan-v2.md` §5 Done-when

All 13 tests import `./logic.ts` and deliberately never import `index.ts`, so the real PostgREST reads,
the real insert, the 405 method gate and the `readBody` fallback have zero execution coverage; no
`supabase functions serve` + curl was run. §5's Done-when "A nine-hour running timer produces exactly
one Record row and no notification of any kind" is, on this branch, satisfied only by a fake —
precisely the "a green suite proves the suite" shape `patina-verification` warns about.

**I closed most of the risk myself** rather than just flagging it: I executed the SQL equivalent of all
four reads and the insert against the isolated stack (pasted above). Every column name resolves, both
dedupe reads are index-backed (`uniq_project_time_entries_running_timer`,
`idx_notification_log_composite`), and the insert satisfies every constraint. **So no defect is hiding
here** — but the end-to-end claim remains unproven, and the ship chain (§11 step 8) owes a real probe
after `supabase functions deploy time-nudges`: trigger it and `SELECT` the `notification_log` row.

### D-R1-10 · LOW · confidence MEDIUM — the 500 path echoes raw error text, and the 200 path returns a platform-wide census, to an endpoint D-R1-01 shows is publicly reachable

`supabase/functions/time-nudges/index.ts:141-149` and `:137-140`

```ts
const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
return new Response(JSON.stringify({ error: "internal_error", detail }), { status: 500, … });
```

A Postgres/PostgREST error message (relation names, column names, constraint names) is returned to the
caller, and the success body returns `{rule, scanned, recorded, skipped}` — `scanned` being the count of
stale running timers across the **entire platform**. Peers return counts too, so the census is
conventional; the raw `detail` echo is the new part. **Fix:** keep the `console.error(detail)` and
return `{error:"internal_error"}` only.

### D-R1-11 · LOW · confidence MEDIUM — rule (a) is anon-triggerable at arbitrary frequency with a service-role client (pre-existing repo pattern, named because D-R1-01 makes it concrete)

Same mechanism as D-R1-01. Each call costs one index scan of `project_time_entries` plus one indexed
`notification_log` count per stale timer, with at most one running timer per user (the global partial
unique index `uniq_project_time_entries_running_timer`, §0.11), so per-call cost is small and bounded —
but call count is not, and the work runs as `service_role`. `decision-reminders`, `field-daily` and
`morning-brief` carry the identical exposure, so this is **not** a lane-D regression and I would not
hold the merge for it. It belongs in the ship note, and it is the second reason to prefer D-R1-01's
option (b) over option (a) if the orchestrator wants one change to buy both.

### D-R1-12 · INFORMATIONAL · confidence HIGH — lane D is right and the *plan* is wrong about 00614 and `generate-legacy-grants.py`

```
$ grep -nE '^\s*(GRANT|REVOKE)' supabase/migrations/00614_time_nudges_cron.sql
(exit 1 — no match)
$ git diff --stat origin/hour-tracking/integration...hour-tracking/edge -- supabase/seed/00-legacy-grants.sql
(empty — untouched)
```

§0.20's own text is "**the rule is the grep, not a list**", and the grep says no. 00614 is one
`ADD COLUMN`, one `COMMENT`, one guarded `DO` block and one `cron.schedule` — no GRANT or REVOKE
anywhere. So the ACL-seed regen is genuinely not owed, and the task brief's blanket "every migration
adding GRANT/REVOKE is followed by …" does not bind here. **Remove `00614` from the fixed lists in
§0.20 and §11**, which currently name it — the same class of error §0.20 already records for `00597`,
just in the opposite direction.

D-impl's third deviation note is also correct and worth carrying into every later brief:
`scripts/generate-legacy-grants.py` derives `ROOT` from `Path(__file__).resolve().parent.parent`, so
running **agent-server's** copy (as the brief's verbatim path instructs) rewrites *agent-server's*
`supabase/seed/00-legacy-grants.sql`, not the calling worktree's. Moot this round; a live trap next time
a lane actually owes a regen.

### D-R1-13 · INFORMATIONAL · confidence HIGH — `agent-edge` is **not** port-isolated; no contamination occurred

`git -C …/agent-edge ls-files -v supabase/config.toml` → `H`, and that file carries
`project_id = "supabase"` with ports 54321/54322 — the **peer program's** stack. The task's LOCAL
DATABASE paragraph only grants the isolated `patina-hours` config to `agent-server` and
`agent-integration`; lane D worked in a third worktree. Any `supabase db reset` / `start` /
`functions serve` run from `agent-edge` would have hit the peer program's database.

It didn't. I probed the peer stack directly:

```
$ psql -h 127.0.0.1 -p 54322 -c "select count(*) from cron.job where jobname like 'time-nudges%'"  → 0
$ psql … -c "select count(*) from information_schema.columns
             where table_name='profiles' and column_name='weekly_hours_reminder_opt_in'"            → 0
```

Clean. Lane D used `psql -p 54422` directly and ran no `supabase` CLI command, which is why. Future
lane-D rounds in this worktree need either the isolated `config.toml` (skip-worktree'd, like the other
two) or the same discipline stated as a rule rather than relied on as luck.

---

## Hard rules and binding rules checked, no finding

- **No flags** (§0.5, P-5): no `useFeatureFlag`, no PostHog gate, no `ComingSoon` anywhere in the diff. "Dark" is the uncommented-cron + default-false column, as ruled. ✓ (with D-R1-01's correction to how the darkness is *argued*)
- **No backfill** (§0.6, P-4): 00614 touches no existing row; the `ADD COLUMN … DEFAULT false` is the only data effect. ✓
- **Additive to `project_time_entries` only** (§0.1): the function never writes that table at all; 00614 does not touch it. ✓
- **The invoiced-entry lock untouched** (§0.12): `guard_invoiced_time_entry` not referenced, not redefined. ✓
- **One running-timer slot stays with the desk** (§0.11, HT-7): the function writes no `duration_minutes IS NULL` row — it only reads them. ✓
- **`notes` never in a rollup return** (§0.10, HT-36): the Record metadata carries `entry_id`, `project_id`, `started_at`, `subject`, `message`, `deep_link` — no `notes`. ✓
- **Hand-numbered migration, no `supabase migration new`** (§0.2): `00614_time_nudges_cron.sql`, banner matches filename. ✓
- **Banner + idempotency + lineage** (§0.3): 23-line banner naming HT-34(a)/(b), `ADD COLUMN IF NOT EXISTS`, guarded unschedule/schedule; double-apply verified. ✓
- **No new SECURITY DEFINER function** (§0.16): none added; `public.invoke_edge_function` (00258) reused, not redefined. ✓
- **`verify_jwt` decision** (`patina-edge-functions` step 4): `true`, no opt-out, declared in `config.toml`, no CORS (never browser-called) — correct for a cron-invoked function and consistent with every peer. ✓
- **No `_shared/*` edit** → no fan-out redeploy owed (§11 step 8). Confirmed: zero `_shared` imports in `time-nudges`. ✓
- **Handler style** matches neighbours (`Deno.serve`), 405 for non-POST, `readBody` defaults to `{}` on malformed JSON (which routes to rule (a), the safe arm). ✓
- **No stray `deno.lock`** at the worktree root or the main checkout after three `deno` invocations (all passed `--config supabase/functions/deno.json`). ✓
- **Commit hygiene**: `64dc2cf0c`, 5 explicit pathspecs, 869 insertions / 0 deletions, no `git add -A` residue, worktree clean, nothing from the main checkout. ✓

---

## Round-2 asks, in the order I'd do them

1. **D-R1-02** — add `read_at` to the nudge metadata, or get "no badge" amended. One line either way; it is the one finding that changes what a designer actually experiences.
2. **D-R1-01** — pick (a) honest restatement or (b) a role-claim check, and make 00614's banner and §5's table agree with the code.
3. **D-R1-03** — add the partial UNIQUE index to 00614 (cheap now, impossible to retrofit cleanly once prod has duplicate rows).
4. **D-R1-04 / D-R1-05** — orchestrator rules who regenerates types and who lands the `document-events.ts` list; both are mechanical once ruled.
5. **D-R1-06** — script the skip-worktree dance before the first W4 merge.
6. **D-R1-07 / D-R1-08 / D-R1-10** — small, independent, no ruling needed.
7. **D-R1-12** — correct the plan's two fixed lists so the next lane doesn't skip a regen it *does* owe.

*Reviewed 2026-09-11. Isolated stack `127.0.0.1:54422` (`pg_postmaster_start_time 2026-09-12 00:38:30+00`, head `00601`), peer stack on 54322 probed read-only and left untouched. No migration applied outside `BEGIN … ROLLBACK`; no branch mutated; no deploy.*
