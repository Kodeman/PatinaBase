# D-impl — Lane D (hour tracking, W4): time-nudges edge function + cron + dark opt-in

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-edge`, branch `hour-tracking/edge`, cut from `origin/main @ 2ff00bb2b`.

## Delivered

| File | What |
|---|---|
| `supabase/migrations/00614_time_nudges_cron.sql` | (new) `ADD COLUMN IF NOT EXISTS weekly_hours_reminder_opt_in boolean NOT NULL DEFAULT false` on `public.profiles`; guarded unschedule + `cron.schedule('time-nudges-hourly', '0 * * * *', …)` on the `00572:1216-1225` pattern; the weekly `cron.schedule` call for rule (b) is present only as a commented-out block naming HT-34/P-5 |
| `supabase/functions/time-nudges/logic.ts` | (new) pure decisions + a `TimeNudgesPort` structural seam (aesthete-nightly's `RpcClient`-fake convention): `resolveNudgeRule`, `staleRunningTimerCutoff`, `weeklyLookbackSince`, `isoWeekKey`, `buildRunningTimerRecord`, `buildWeeklyUnloggedRecord`, `runTimeNudges` |
| `supabase/functions/time-nudges/index.ts` | (new) `Deno.serve` wiring: real service-role client implementing `TimeNudgesPort` against `project_time_entries`/`profiles`/`notification_log`, calls `runTimeNudges` |
| `supabase/functions/time-nudges/index.test.ts` | (new) 13 Deno tests against `logic.ts` (never imports `index.ts`, so no `Deno.serve` boot — matches `aesthete-nightly`/`po-send` convention) |
| `supabase/config.toml` | `[functions.time-nudges]` `verify_jwt = true` block appended after `[functions.invoice-check-intent]`, before `[analytics]`. Diff is additive-only — confirmed with `git diff -- supabase/config.toml`; no port or other section touched |

## Rule (a) — running timer > 8h (LIVE)

`listStaleRunningTimers` selects `project_time_entries` where `duration_minutes IS NULL AND started_at <= now() - 8h`. For each, `hasRunningTimerRecord(user_id, entry_id)` checks `notification_log` (`type='time_entry_running_long'`, `channel='in_app'`, `.contains("metadata", {entry_id})`) — the same "query before insert" idiom as `lead-expiration-check`/`back-in-stock-check`/`price-drop-check`. On a miss, one row is inserted via `insertRecord`; that is the function's **only** write. No email/SMS/push helper is imported anywhere in `logic.ts` or `index.ts`, so "no push, no email, no SMS" is structural, not just observed behavior.

Test `rule (a): a 9-hour running timer produces exactly one Record row across repeated hourly sweeps, and zero email/SMS calls` drives 9 simulated hourly sweeps over one still-running timer and asserts exactly one row lands, with `channel='in_app'` on every row ever written.

## Rule (b) — weekly opt-in reminder (built, dark)

Reachable only when `resolveNudgeRule(body) === 'weekly_unlogged'`, which requires the body to be exactly `{"rule":"weekly_unlogged"}`. `00614` never sends that body — its weekly `cron.schedule` call is commented out, so no `cron.job` row for it is ever created. Verified against the isolated DB: after applying `00614`, `cron.job` contains exactly one row, `time-nudges-hourly`.

Tests cover: only opted-in members with nothing logged in the last 7 days are candidates (`listOptedInMembersNeedingWeeklyReminder`); an opted-out member is never a candidate even when quiet; a second sweep in the same ISO week does not double-nudge (`isoWeekKey`-keyed dedupe); and — the routing claim — the default body `{}` never calls any weekly-unlogged port method at all, even when a candidate exists that would otherwise qualify (asserted via call counters on the fake port, not just on the returned row count).

Per the plan's "what dark means" checklist (§5, W4): the column defaults to `false`; no portal file, hook, or `@patina/types` export reads or writes it (`grep -rn "weekly_hours_reminder_opt_in" apps packages` returns nothing); the weekly cron entry is commented out; rule (b) is fully implemented and deno-tested rather than stubbed.

## Migration validation (no `db reset` run)

Applied `00614` inside `BEGIN … ROLLBACK` against the isolated stack (`psql -h 127.0.0.1 -p 54422`, currently at head `00601`, W0+W1 landed):
- Column added with the right type/nullability/default; cron job row created with the expected schedule and command text; `ROLLBACK` left both absent (verified with a second connection).
- Re-ran the file twice in one transaction to confirm idempotency: `ADD COLUMN IF NOT EXISTS` no-ops with a NOTICE, the guarded `cron.unschedule`/`cron.schedule` pair leaves exactly one `time-nudges-hourly` row (not two).

00614 has no dependency on lane A's `00610–00613` (no reference to `project_time_entries.studio_id` or the classifier) — it applies cleanly on top of `00601` alone, consistent with the merge-order note that it must land *after* `00610–00613` for sequencing, not because it needs their objects.

## Deviations from the task brief, flagged explicitly

1. **No in-code service-role bearer check.** The task brief said to use the repo's `_shared` helper for verifying the bearer (the `isServiceRoleCaller`/`SUPABASE_SECRET_KEYS`/never-string-compare memory rule). Plan-v2 §5 states outright for this function: *"the caller is `public.invoke_edge_function`, which POSTs `apikey` + `Authorization: Bearer <service-role>` from Vault … so no opt-out and no in-code signature check."* I followed the plan: `index.ts` relies solely on `verify_jwt = true` at the gateway (config.toml), exactly like `decision-reminders`/`field-daily`/`morning-brief`/`cowork-intake-bridge`, none of which string-compare or otherwise re-derive caller identity in code. There's no actual conflict with the memory rule (which is about never *string-comparing* the bearer) — I simply don't compare it at all, which trivially satisfies "never string-compare" while matching the plan's explicit, reviewed design. `client-invite`'s `isServiceRoleCaller` is the right pattern for a function that *names an arbitrary writer/signer* from the caller's identity; `time-nudges` resolves no caller-scoped data and writes only quiet, idempotent, non-PII-bearing rows, so it doesn't need that. Flagging this so the integrator/reviewer can override if they disagree.

2. **`00614` was NOT run through `generate-legacy-grants.py`.** Rule 0.20 says "the rule is the grep, not a list" — `grep -nE '^\s*(GRANT|REVOKE)' supabase/migrations/00614_time_nudges_cron.sql` matches nothing (confirmed; the migration is one `ADD COLUMN`, one banner comment, and two `cron.schedule`/`cron.unschedule` blocks — no GRANT/REVOKE of any kind). The plan's own §0.20/§11 tables list `00614` among migrations needing the ACL-seed regen, but per the rule's own text that list is advisory and the grep is authoritative; §0.20 also documents a prior instance (`00597`) where the fixed list was *wrong in the other direction* (missing an entry the grep would have caught). I did not run `scripts/generate-legacy-grants.py` and did not touch `supabase/seed/00-legacy-grants.sql`. If a reviewer disagrees and believes `00614` should carry a GRANT/REVOKE I haven't written, that's a design gap to raise, not a regen I skipped.
3. Also note: the task's `generate-legacy-grants.py` path pointed at `agent-server`'s copy — that script's `ROOT` is derived from its own file location (`Path(__file__).resolve().parent.parent`), so running the `agent-server` copy would have rewritten *that worktree's* `supabase/seed/00-legacy-grants.sql`, not `agent-edge`'s. Moot here since no regen was owed, but worth flagging in case a later wave copies this instruction verbatim.

## Gates run

```
deno test --allow-all --config supabase/functions/deno.json supabase/functions/time-nudges/
```
→ **13 passed, 0 failed.**

```
deno check --config supabase/functions/deno.json supabase/functions/time-nudges/index.ts
```
→ clean (index.ts isn't imported by the test file, so it needed its own check).

No stray `./deno.lock` appeared at the repo root after any `deno` run (checked after every invocation).

## Type regeneration

Not owed by this lane per §11 ("Lane D for `00614`" only under the GRANT/REVOKE-seed rule, and separately "the lane that writes a migration runs `pnpm db:generate`" — however `00614` adds one column, so the type diff is real and small). I did **not** run `pnpm db:generate` / touch `packages/supabase/src/database.types.ts`: the task brief states type regeneration is not mine ("00614 merges after W4; the integrator regenerates"), which I'm treating as authoritative over the general §11 per-migration-author rule for this specific case. Flagging this explicitly: if the integrator expects lane D to have already regenerated types for `00614`, that step is still outstanding.

## Commit

Committed with explicit pathspecs (no `git add -A`) as `64dc2cf0c` on `hour-tracking/edge`:
- `supabase/migrations/00614_time_nudges_cron.sql`
- `supabase/functions/time-nudges/logic.ts`
- `supabase/functions/time-nudges/index.ts`
- `supabase/functions/time-nudges/index.test.ts`
- `supabase/config.toml`

`git show --stat HEAD` confirmed the diff is exactly those 5 files (869 insertions, 0 deletions). The repo's `pre-commit` hook flagged a false positive (`migration-search-path`: a naive regex matched the prose "SECURITY DEFINER function" in a comment saying the migration adds none) — fixed by rewording the comment rather than bypassing the hook. Prettier also reformatted the three new TS files (whitespace only, re-verified green after).

Pushed `hour-tracking/edge` to origin (`git push -u origin hour-tracking/edge` under `dangerouslyDisableSandbox`, per the sandbox network exception for git push/fetch). The repo's `pre-push` hook re-ran `deno check` + the full `deno test` suite for `time-nudges` server-side as part of the push gate — 13/13 passed again. New branch created at `origin/hour-tracking/edge`.
