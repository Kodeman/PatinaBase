# D-review-r4 — adversarial re-review, lane D (W4: time-nudges + 00614 + dark opt-in), round 4

**clean: YES** — zero new findings, zero regressions. **D-R3-01 is discharged**, proved by re-running the
r3 probe with the exclusion list read out of the code rather than retyped, and by independently
re-enumerating every reader of `notification_log` across edge functions, portals, packages, services,
Workers, iOS, **and the database itself** (triggers, functions, cron). No path emails or pushes either
nudge type.

Round 4's scope, per the brief, was narrow: verify D-R3-01, re-verify the readers r3 cleared (without
trusting that list), re-run the deno gates, and report any regression. All four done. The five other r3
findings (D-R3-02 … D-R3-06) and the carried round-1/2 items were explicitly out of scope for the r3 fix
pass and remain **open, unchanged** — listed at the bottom so they are not mistaken for closed by a
clean round.

- Reviewer: separate context; not the implementer, not the r1/r2/r3 reviewer's context. Skills loaded:
  `patina-edge-functions`, `patina-verification`.
- Diff reviewed: `git -C /Users/kody/Code/patina-merged/.codex/worktrees/agent-edge diff origin/hour-tracking/integration...hour-tracking/edge`
  → **11 files, 1506 insertions, 19 deletions**, at `683311a0c` on `hour-tracking/edge`
  (merge-base `2ff00bb2b`; `origin/hour-tracking/integration` tip `85f875907`; `hour-tracking/edge` ==
  `origin/hour-tracking/edge` == `683311a0c`, so the fix is pushed).
- Five commits; the r3 fix is the single new one: `683311a0c`.
- Worktree clean (`git status --porcelain` empty; the only lines it emits are sandbox
  *read* denials on `**/.env.example`, not modifications). No `deno.lock` at the repo root, in the
  worktree, or under `supabase/functions/` after six `deno` invocations (all passed
  `--config supabase/functions/deno.json`).

---

## D-R3-01 — DISCHARGED

### The fix, read rather than trusted

`683311a0c` touches **exactly three files, all under `supabase/functions/digest-dispatcher/`** — and
nothing else. I proved the blast radius rather than reading the claim:

```
$ git show --stat --oneline 683311a0c
 digest-dispatcher/index.ts       | 19 +++---------
 digest-dispatcher/status.test.ts | 34 +++++++++++++++++++++-
 digest-dispatcher/status.ts      | 23 +++++++++++++++

$ git diff --stat 4d72d8590..683311a0c -- supabase/functions/time-nudges/ \
      supabase/migrations/ supabase/config.toml apps/
  (empty)
```

So `time-nudges/{index,logic,index.test}.ts`, `00614_time_nudges_cron.sql`, the `config.toml` hunk and
the three designer-portal files are **byte-identical to the state r3 reviewed**. Everything r3 verified
about them still holds without re-derivation.

`DIGEST_EXCLUDED_TYPES` moved from a private `const` in `index.ts` to an exported `const` in
`status.ts`. I checked the relocation is lossless by set arithmetic against the baseline file rather
than by eye:

```
baseline members: 8
in baseline but MISSING at HEAD:  (none)
added at HEAD:                    time_entry_running_long
                                  time_weekly_unlogged_reminder
```

The one consumer is real: `index.ts:275`, inside `dispatchDigests`' per-user collection, is still
`rows.filter((r) => !DIGEST_EXCLUDED_TYPES.has((r as NotificationRow).type))` — the same line the r3
finding named. There is no second collection site (`grep` for `from("notification_log")` in
`digest-dispatcher/` returns exactly one, at `:266`). `status.ts` is a pure constants module with no
module-scope side effect, which is why a unit test can import it where importing `index.ts` would boot
`Deno.serve` — the same reason `time-nudges`' suite imports only `logic.ts`. Correct choice.

**No fan-out.** `status.ts` lives inside the function directory, not `_shared/`, and nothing else in
the repo imports it (`grep -rn "digest-dispatcher/status" supabase packages apps` → no hits). The ship
chain therefore grows by exactly one function, as the fix report says.

### The probe, re-run — and hardened against the reviewer's own typing

The r3 probe's weak link was that the "excluded" array in SQL was hand-transcribed from the TypeScript
Set, so the probe could have passed against a list the code does not actually hold. I closed that: I
printed both constants **out of `status.ts` itself** with deno, and fed those literals to psql.

```
$ deno run --allow-read --config supabase/functions/deno.json  (importing digest-dispatcher/status.ts)
EXCLUDED=ARRAY['account_verification','password_reset','security_alert','order_confirmation',
               'payment_receipt','client_confirmation','in_app_message','in_app_message_mention',
               'time_entry_running_long','time_weekly_unlogged_reminder']::text[]
ELIGIBLE=ARRAY['sent','delivered','opened','clicked','queued','sending','unconfirmed']::text[]
```

Then, inside `BEGIN … ROLLBACK` on the isolated stack `-H 127.0.0.1 -p 54422`, I inserted the **exact
row shape `buildRunningTimerRecord` / `buildWeeklyUnloggedRecord` produce** (`channel:'in_app'`,
`status:'delivered'`, the full metadata object including `read_at`, `sheet`, `deep_link`) and replayed
`dispatchDigests`' complete collection predicate:

```
 ledger_rows |      head
         552 | 20260910152111          ← same stack content r1–r3 used

 pre-state: 0 rows of either nudge type

             type              |  status   | channel | digest_status_eligible | digest_type_excluded | would_reach_digest_email
-------------------------------+-----------+---------+------------------------+----------------------+--------------------------
 time_entry_running_long       | delivered | in_app  | t                      | t                    | f
 time_weekly_unlogged_reminder | delivered | in_app  | t                      | t                    | f

 DO          ← asserted exactly 2 nudge rows landed (so no trigger forked a push twin)
 ROLLBACK
 rows_left | 0
```

**`digest_type_excluded = t` for BOTH types**, which is the ask. And the full predicate —
status-eligible **AND NOT** type-excluded — is `f` for both, so the rows do not survive into
`eligible`, never reach `buildDigestHtml`, and never reach `sendCompliantEmail`. The status half is
still `t`, which is the point: it confirms `DIGEST_EXCLUDED_TYPES` is doing the work, exactly as the
finding diagnosed, rather than the rows being saved by some incidental status filter.

Two side benefits of inserting the real shape: the `DO` block asserting `count = 2` is positive proof
that **`notification_log` carries no trigger** that forks an email or push leg off the insert
(independently confirmed below), and the rollback was verified complete (`rows_left 0`).

### No empty-digest regression from the exclusion

Worth stating because an exclusion can break the surrounding flow: when a user's window holds *only*
nudge rows, `eligible.length === 0` and `index.ts:278-288` bumps `last_digest_sent_at` and counts a
skip — it does not mail an empty digest, and it does not lose a real notification, because only the
nudge rows are dropped from a batch. Behavior for every other type is untouched.

### The added test earns its place

`status.test.ts`'s new case does the thing set-membership assertions usually fail to do: part (c)
reproduces `dispatchDigests`' own filter expression against a three-row mixed batch (two nudge rows +
one `new_lead_designer`, all `status:'delivered'`) and asserts the collected ids are `["3"]`. That is a
collection-level assertion, not a Set-level one. Part (a) pins `'delivered'` as status-eligible, so if
someone later removes `'delivered'` from the eligible list the test does not silently start passing for
the wrong reason.

---

## Every other reader of `notification_log`, re-verified from scratch

I did not take r3's cleared list. I enumerated from the table name across the whole repo
(`supabase/functions packages apps services studios infra`, excluding `node_modules` and
`database.types.ts`) — 95 files — classified each access as read vs write, and then read the filter of
**every read**. Writers cannot email these types; readers are the whole risk surface.

| Reader | Filter that makes it safe | Verdict |
|---|---|---|
| `digest-dispatcher/index.ts:266` | `DIGEST_EXCLUDED_TYPES` now holds both types | **FIXED — the finding** |
| `notification-digest/index.ts:144` | `.eq("channel","email").eq("type","decision_required")` | clear |
| `notification-digest/index.ts:171` | `.eq("channel","in_app").eq("type","proposal_nudge")`; also skips `meta.read_at` | clear |
| `comms-notification-dispatch/index.ts:177` | `.in("type",["in_app_message","in_app_message_mention"])`; coalescing only | clear |
| `_shared/send-email.ts:262` | `.eq("channel","email")`; count-only hourly cap — can only *reduce* sends | clear |
| `_shared/decision-notify.ts:567, :1281` | `.eq("type",…).eq("channel","email")`; dedupe `NOT EXISTS`-style | clear |
| `_shared/invoice-check-intent-core.ts:110` | `.eq('type', CHECK_INTENT_NOTIFICATION_TYPE)`; idempotency read | clear |
| `packages/notifications/audience.ts:221, :238` | `.eq('status','bounced')` / `.eq('channel','email')`; both build a **suppression** set — can only remove from an audience | clear |
| `packages/notifications/automation-engine.ts:227` · `automation-processor/index.ts:237` | `.eq('channel','email')`; 24h spacing guard — can only delay | clear |
| `ab-winner-evaluator/index.ts:35-51` · `packages/notifications/ab-test.ts:70-92` | `metadata->>campaign_id` + `metadata->>ab_variant`; our metadata carries neither key | clear |
| `back-in-stock-check:99` · `price-drop-check:107` · `lead-expiration-check:82` | `.eq("type", …)` + `contains(metadata,…)`; dedupe guards | clear |
| `resend-webhook/index.ts:205` | `.eq("provider_id", emailId)`; our rows have `provider_id` NULL, which `.eq` can never match | clear |
| `resend-webhook/index.ts:541` | `.eq("status","bounced")` | clear |
| `apns-send/index.ts:96` | `channel='in_app'` + visible statuses, **no type filter** — admits our row | **D-R3-02, still open** (badge, not a push *of* these types; see below) |
| `admin-portal/src/lib/dlq-retry.ts:26` | loads one row by id, then **`if (row.status !== 'failed') return error`**; our rows are `delivered`. Even a hypothetical failed nudge re-dispatches with the row's own `channel:'in_app'`, and `notification-dispatch:187-210` on `in_app` writes a log row and returns — it never emails or pushes | clear, two ways |
| `admin-portal/.../comms/dlq/route.ts:48` | `.eq('status','failed')` — our rows never list | clear |
| `admin-portal/.../comms/{dashboard,analytics}/route.ts` · designer-portal's twin · `settings-overview` · `campaigns/[id]/recipients` | read-only counts for admin display | clear of sending; the count distortion is **D-R3-06**, still open |
| `packages/supabase/use-inbox.ts:104, :260` | the web bell; `useUnreadInboxCount` excludes rows with `metadata.read_at`, which both builders stamp | clear (r1's fix, re-confirmed) |
| `packages/supabase/use-email-delivery.ts:211` | `.eq('channel','email')` | clear |
| `{designer,client}-portal/api/inbox/mark-read` | writes `metadata.read_at` | clear |
| `{admin,designer}-portal/src/lib/gdpr.ts:159` | `.delete()` | clear |
| iOS `NotificationsAPIClient` / `NotificationsViewModel` / `BadgeCountService` | the bell feed — showing the Record row in the in-app bell is what HT-34 *wants*. The badge predicate is `opened_at IS NULL`, same as `apns-send` → **D-R3-02**. `InvoiceReminderService` is the only `UNMutableNotificationContent` in the app and it is sourced from invoices, not `notification_log` — no local notification is synthesized from a bell row | clear of push; badge = D-R3-02 |
| `infra/`, `services/`, `studios/` | zero code readers; only runbook prose | clear |

### The database layer, which no earlier round checked

A reader does not have to be TypeScript. I probed the live schema on the isolated stack:

```
-- triggers on notification_log
SELECT tgname … WHERE c.relname='notification_log' AND NOT tgisinternal;   → 0 rows
```

**No trigger on the table at all** — so the insert cannot fork an email or push leg. (The probe's
`count = 2` assertion says the same thing behaviorally.)

Of the 23 DB functions whose bodies mention `notification_log`, exactly **three both read it and reach
an HTTP/edge call**, and I read all three:

- **`public.release_due_client_pushes`** — the real push dispatcher. Its driving loop is
  `WHERE n.channel='push' AND n.status='queued' AND n.deliver_after IS NOT NULL AND n.deliver_after <= now()`.
  Our rows are `in_app` / `delivered` / `deliver_after` NULL → never in the loop. They appear only in
  the inner `still_waiting` EXISTS, which requires
  `bell.metadata->>'entity_type' = n.metadata->>'entity_type'` and the same for `entity_id`; our
  metadata carries neither key, so both sides are NULL and `NULL = NULL` is NULL, never true. And that
  subquery only *gates* an already-queued envelope — it cannot create one.
- **`public.sweep_decision_first_notices`** — reads `notification_log` only inside a `NOT EXISTS`
  filtered `type='decision_required' AND channel='email'`. Cannot match, and a match would *suppress* a
  send, not cause one.
- **`public.notify_client_attention`** — its read is a de-dup keyed on
  `metadata->>'entity_type'`/`'entity_id'`; our rows carry neither, so it can never select one.

And the cron side, on the live stack — every scheduled job that could conceivably mail off this table:

```
 automation-processor       | */5 * * * * | invoke_edge_function('automation-processor')   → channel='email' guard
 campaign-scheduler         | */5 * * * * | invoke_edge_function('campaign-scheduler')    → suppression-only reads
 digest-dispatcher          | 0 14 * * *  | invoke_edge_function('digest-dispatcher')     → FIXED
 notification-digest-hourly | 20 * * * *  | invoke_edge_function('notification-digest')   → type-filtered
```

`digest-dispatcher` really is the only reader in the repo with no channel filter and no type filter
adequate to exclude a new in-app type — r3's diagnosis was right, and the fix lands on the one place
that needed it.

---

## Gates re-run

```
$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/time-nudges/
ok | 16 passed | 0 failed (27ms)                                            exit 0

$ deno test --allow-all --config supabase/functions/deno.json supabase/functions/digest-dispatcher/
running 2 tests from ./supabase/functions/digest-dispatcher/status.test.ts
  digest eligibility includes uncertain attempts but excludes non-deliveries ... ok
  hour-tracking nudge rows never enter the digest collection (HT-34 / D-R3-01) ... ok
ok | 2 passed | 0 failed (18ms)                                             exit 0

$ deno check --config supabase/functions/deno.json \
    supabase/functions/time-nudges/{index.ts,logic.ts,index.test.ts}
Check index.ts / logic.ts / index.test.ts                                   exit 0

$ deno check --config supabase/functions/deno.json \
    supabase/functions/digest-dispatcher/{index.ts,status.ts,status.test.ts}
Found 5 errors.                                                             exit 1
```

**The 5 `digest-dispatcher` errors are pre-existing, and I proved it rather than accepting the fix
report's word.** I materialized the pre-fix `index.ts` from `origin/hour-tracking/integration` at a
temp path *inside the same directory* (so its relative imports resolve identically) and type-checked it
standalone:

```
baseline (pre-fix) index.ts:  TS2345 ×3 / TS2339 ×2 — Found 5 errors.
HEAD       index.ts:          TS2345 ×3 / TS2339 ×2 — Found 5 errors.
```

Same five, same kinds, all of the `SupabaseClient<any,…>` vs untyped-`never`-schema family at
`:283, :295, :309, :326, :360` — none on a line this diff touches, none introduced. Temp file removed;
worktree re-verified clean afterward.

`pnpm --filter @patina/designer-portal type-check` not re-run: unchanged from D-R2-08 (73 pre-existing
`Cannot find module` errors from unbuilt workspace dists in this worktree, none naming a file in this
diff). Still the integration owner's. The three designer-portal files are byte-identical to the state
r3 ran 60/60 jest and clean eslint against, so those gates carry forward.

### Regression checks beyond the gates

- **The prettier near-miss is genuinely absent.** The fix report discloses running `npx prettier
  --write` after committing and reverting with `git checkout --`. I verified the outcome rather than the
  narrative: the committed `index.ts` diff is **only** the import rewrite and the constant removal (19
  lines, 3 insertions), with no signature/ternary/object-literal churn — i.e. none of the D-R2-05
  shape. `status.ts`'s diff is pure addition, `status.test.ts`'s is an import line plus the new case.
  Worktree clean, so nothing was left behind either.
- **`00614` not re-applied** — byte-identical to the file r3 applied standalone in `BEGIN … ROLLBACK`
  (idempotent second apply, cron rows stayed at 1, col/idx/cron/rows all 0 post-rollback). Nothing to
  re-derive.
- **`config.toml`** — one hunk, `[functions.time-nudges]` only, unchanged. `digest-dispatcher` has no
  `config.toml` entry and needs none: it is cron-invoked with a service-role bearer and inherits the
  platform default `verify_jwt = true`. Correct per patina-edge-functions step 4.
- **Contamination** — every psql call went to `-p 54422`. No `supabase` CLI command was run from this
  worktree (D-R1-13's standing condition, again held by discipline rather than by config). The peer
  program's stack on 54322 was not contacted at all this round.

---

## Hard rules and binding rules re-checked, no finding

- **No flags** (§0.5, P-5): `git diff … | grep -nE "useFeatureFlag|posthog.isFeatureEnabled|ComingSoon|feature_flag"` → no match. ✓
- **No backfill** (§0.6, P-4): `00614` unchanged; `ADD COLUMN … DEFAULT false` + two indexes against 0 pre-existing rows of either type. ✓
- **Additive to `project_time_entries` only** (§0.1) · **rate discarded server-side** (§0.7) · **invoiced-entry lock untouched** (§0.12) · **one running-timer slot** (§0.11, HT-7): all unchanged; the r3 fix touches neither the table nor any rate or timer path. ✓
- **`notes` never in a rollup return** (§0.10, HT-36): metadata keys unchanged — `entry_id, project_id, started_at, subject, message, sheet, deep_link, read_at` (+ `week_key`). No `notes`. ✓
- **Hand-numbered migration at its assigned number** (§0.2): `00614_time_nudges_cron.sql`, unchanged. ✓
- **No `generate-legacy-grants.py` owed**: `grep -nE '^\s*(GRANT|REVOKE)' 00614` → exit 1; `supabase/seed/00-legacy-grants.sql` untouched in the diff. ✓
- **No new SECURITY DEFINER function** (§0.16): none this round. Nothing touches HT-10-a's `project_hours_total` (lane A's, W2). ✓
- **No `_shared/*` edit** → fan-out is exactly two functions, `time-nudges` + `digest-dispatcher`, not every importer of anything shared. Verified: no file under `supabase/functions/_shared/` appears in the diff, and `digest-dispatcher/status.ts` has no external importer. ✓
- **No automated external send by lane D's own code**: `time-nudges` imports only `@supabase/supabase-js` and `./logic.ts`; writes only `notification_log` (`channel:"in_app"`) and `job_runs`. ✓ — **and, now, no downstream function sends on the strength of that row either**, which is what r3 caught and this round closed.
- **Deno hygiene**: all six `deno` invocations passed `--config supabase/functions/deno.json`; no `deno.lock` at root, in the worktree, or under `supabase/functions/`. ✓
- **Commit hygiene**: one new commit, three explicit pathspecs, worktree clean, nothing from the main checkout, no `git add -A` residue, pushed to `origin/hour-tracking/edge`. ✓

---

## Still open — carried, unchanged, and NOT closed by this clean round

Nothing below is a regression; each was explicitly out of scope for the r3 fix pass and is stated so a
clean round-4 verdict is not read as a clean branch.

**Needs lane D code:**

1. **D-R3-02** (medium/high) — re-verified live this round and **still true**. `apns-send/core.ts:72`'s
   `badgeRowIsRead` is `opened_at !== null || status ∈ {opened,clicked}` — no `metadata.read_at` — and
   iOS's own `BadgeCountService` documents the identical predicate (`opened_at IS NULL`). Our row
   (`opened_at` NULL, `delivered`, no `entity_type`/`entity_id` to collapse on) takes the uncollapsed
   `if (!read) count++` branch. So "no badge" holds on the web bell and fails on the springboard. One
   line in lane D's own file — `opened_at: now.toISOString()` alongside `sent_at` in both builders —
   fixes it with no extra redeploy, and closes D-R3-06's open-rate half too.
2. **D-R3-04** (low/high) — `index.test.ts`'s `"only the service role may run either sweep"` still
   passes and is still false; only `weekly_unlogged` is gated. Rename, and extract
   `requiresServiceRole(rule)` into `logic.ts` so the gate placement is asserted by a suite that runs.
3. **D-R3-05** (low/medium) — the dark arm's 403 still leaves no `console` line and no `job_runs` row.

**Needs a ruling:**

4. **D-R2-03 + D-R3-02 together** — rule "no badge" once, for **both** read-state conventions. Keep
   `read_at` + add `opened_at` (born read on both surfaces), or drop both (born unread on both). The
   branch today has the two surfaces disagreeing.

**Needs Strata (read-only):**

5. **D-R3-03 / D-R2-01(a)** — the Vault-shape probe on `app.settings.service_role_key`. It decides
   whether the `running_timer` gate widens back to both arms, or stays narrow with the unconditional
   `job_runs` insert moved behind a non-credential guard.

**Orchestrator / integration owner:**

6. **D-R1-04 + D-R3-08** — regenerate `database.types.ts`; §5's Done-when is **unmet**, not passed,
   until then.
7. **D-R1-06** (skip-worktree merge dance) · **D-R1-12** (strike `00614` from §0.20/§11's fixed GRANT
   lists) · **D-R1-09** (the live ship probe, now also the only live check on D-R3-04's gate placement)
   · **D-R2-04** (the `?sheet=hours` W2 dependency) · **D-R2-08** (designer-portal `type-check` where
   the dists exist) · **D-R3-07** (merge order: `00614` after lane A's `00610`–`00613`).

**Ship chain, for the note:** W4 now deploys **two** edge functions —
`supabase functions deploy time-nudges` **and** `supabase functions deploy digest-dispatcher`. Not a
`_shared/*` change, so the fan-out stops there.

*Re-reviewed 2026-09-11/12. Isolated stack `127.0.0.1:54422` (552 ledger rows, head `20260910152111`);
the peer stack on 54322 was not contacted. All inserts inside `BEGIN … ROLLBACK`, rollback verified
(`rows_left 0`). No branch mutated, no commit made, no deploy, no Strata access, no `supabase` CLI
command from this worktree. One temp file written into the worktree for the baseline type-check and
removed, worktree clean after. Not verified: anything requiring the deployed function or Strata —
D-R3-03's Vault-shape question and an actual `digest-dispatcher` send are both exactly that;
`pnpm --filter @patina/designer-portal type-check` (pre-existing dist failures, D-R2-08); PostgREST's
mapping of a Postgres 23505 message onto `error.message` (validated at the psql layer in r3 only).*
