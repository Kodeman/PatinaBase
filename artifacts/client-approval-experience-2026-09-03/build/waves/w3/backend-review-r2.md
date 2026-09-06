# Wave 3 — backend lane, adversarial review (round 2)

Reviewer context, separate from the implementer. Worktree
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-backend`
(`git rev-parse --show-toplevel` confirmed), branch `approvals/w3-backend`,
seven commits ahead of `main` (`62767ee14 … 4e5e8c8fc`).

**Verdict: BLOCK.** One blocker, five majors. Every round-1 blocker and major
is genuinely fixed and the gates are green; the blocker below is a *new* defect
created by the round-1 M7 repair (widening the first-notice sweep), and the
biggest major is a hole the wave opened in the DEFAULT cadence.

---

## 1. Round-1 findings — verification

| id | status | evidence |
|---|---|---|
| B1 snooze absent from the digest | **FIXED** | `notification-digest/index.ts` `snoozedDecisions()` + `logic.ts` `dropSnoozedDecisions()`; `collectItems` composes both drops. Test "a snoozed approval is not in her summary either (P-28, R16)". |
| B2 `proposal-nudge` tests a retired spelling | **FIXED** | `proposal-nudge/logic.ts` `nudgeRoutesToDigest` tests the shape through `normalizeReminderCadence`; `proposal-nudge` joins the deploy set. 3 new tests. |
| M3 digest not Sunday-gated, no 8am floor | **FIXED** | `isDigestDue` now applies `localWeekdayAndHour`; `notification-digest-daily` → `notification-digest-hourly '20 * * * *'` (verified in `cron.job` after apply); `digestWindowStart` stretches over the skipped run. |
| M4 held push rings about an answered ask | **FIXED** | `release_due_client_pushes` `still_waiting` (unopened bell row AND decision still `pending`), else retired as `suppressed`. SQL test §10. |
| M5 hourly cron re-arms a snoozed bell row | **PARTIALLY FIXED** | Gate moved before the spine RPC; `shouldFireDecisionInApp` + `STANDING_QUIET`. Covers `snoozed` / `quiet_after_overdue`. **Does not** cover `sunday_quiet` / `before_local_morning` / `quiet_hours` — see M-R2-03. |
| M6 backfill re-signs an inherited why | **FIXED** | Recursive walk up `predecessor_decision_id` while the sentence is identical, resolved from the deepest ancestor's `created` receipt. SQL test §9. |
| M7 sweep skipped legacy decisions | **FIXED, with a new hole** | Selection now mirrors 00568's own edge. This is the change that produces B-R2-01. |
| M8 guessed cutoff constant | **FIXED** | `decision_first_notice_sweep_state.cutoff_at = GREATEST('2026-09-05Z', now())`, written once at apply. Verified: after apply the row carried the apply moment. |
| m9 direct DML bypasses the RPC authority check | **OPEN** | Probed: as `authenticated` with `sub` = a stranger, `INSERT INTO decision_snoozes (user_id = self, decision_id = an approval addressed to someone else)` **succeeded**. |
| m10 `attempts` written, never read | **OPEN, now worse** | See M-R2-04. |
| m11 `next_local_morning` comment vs body | **OPEN** | Probed: `next_local_morning('America/New_York','2026-10-07T12:00:00Z')` (= exactly 08:00 EDT) returns `2026-10-08 12:00Z`. `COMMENT ON FUNCTION` still says "at or after". No behavioural impact (`push_deliver_after` never calls it at 08:00). |
| m12 8pm side of the floor is push-only | **OPEN (ruling owed)** | `ux/03 §284` says "nothing before 8am or after 8pm local" of the *mail*; the reviewer brief says push only. Lane followed the brief. |
| m13 `SupersededEdition.title` never rendered | **OPEN** | `grep` finds no reader of `edition.title` in `decision-notify.ts`. |
| m14 `isReminderDigestUser` defaults true | **OPEN** | `getReminderCadence` default is now `'daily'`; no product caller today. |
| n15 hand-off line written on `inAppOk` alone | **OPEN** | `expire-decisions/index.ts:150` `if (result.emailSent || result.inAppOk)`. |
| n16 `created_at = now()` on conflict | **OPEN** | `set_decision_snooze` ON CONFLICT clause unchanged. |
| n17 backfill lifts a trigger / needs ownership | **OPEN** | Unchanged; `backfill_why_author_display_names()` still `GRANT`ed to `service_role`. |
| n18 `notify_client_attention` redefined with no REVOKE/GRANT | **OPEN** | 00572 carries `COMMENT ON FUNCTION` but no grant pair. |
| n19 schema accepts 5 values, type declares 3 | **OPEN (deliberate)** | Unchanged. |
| n20 hourly reminder cron cost | **OPEN, doubled** | The digest cron is now hourly too. |

---

## 2. New findings

### B-R2-01 (blocker) — the sweep re-sends the first notice to a recipient with no auth user, every 30 minutes for 72 hours

`sweep_decision_first_notices` (00572:945) now selects **legacy** decisions
(the r1 M7 repair). Its only stop condition is a `notification_log` row keyed
`{decisionId, notice:'first'}`. For a legacy decision the recipient is
`decision-first-notice/index.ts:186` — `userId: dc?.client?.id ?? dc?.client_id ?? null`,
`email: dc?.client?.email ?? dc?.client_email ?? null` — i.e. the deliberate
"direct-contact fallback for relationships with no auth profile".
`sendCompliantEmail` writes a log row only when `options.userId` is set
(`send-email.ts:391 shouldLog = Boolean(options.userId && !options.skipLog)`),
and `existingEmailLogStatus` drops its `user_id` filter and finds nothing.

So for a `designer_clients` row with `client_id IS NULL` and `client_email` set:
the letter sends, no log row is written, and the sweep re-invokes 30 minutes
later. `decision_first_notice_attempts` enforces only a cooldown, never a cap
(m10) — **up to 144 identical first-notice emails over the 72-hour window.**

`client_id` is nullable and the local seed already carries two such rows
(probed). Before this wave `decision-first-notice` had exactly one producer (the
00568 trigger), so the one-shot was its own guard.

*Fix:* record the send in `decision_first_notice_attempts` as a terminal state
(or cap `attempts`), and/or exclude decisions with no `client_id` from the
sweep's selection.

### M-R2-02 (major) — the DEFAULT cadence sends two letters about one approval inside 24 hours

`decisionMailHold` makes the first notice and a superseding edition break the
digest, so they mail direct. But `notification-digest/index.ts collectItems`
selects `decision_notifications` `kind = decision_required, read_at IS NULL,
created_at > since` with no notion of register — the same row the first notice
just wrote. A `daily` reader who does not open the app therefore receives the
announcement letter, then the next morning's summary listing the same approval
under "Approvals that need you".

`ux/03 §282`: *"No second automated notice for one decision inside 24 hours."*
On `main` this could not happen: the pre-wave gate folded `decision_required`
of **every** register into the digest for a `daily_digest` reader. Wave 3 makes
the first notice break the digest without teaching the digest that it did.

This is the common path: 00572 moves the column DEFAULT to `daily`, so every
new homeowner is on it.

*Fix:* drop from the digest any decision whose `{decisionId, notice:'first'}`
(or `supersedesVersion`) email already went out inside the window.

### M-R2-03 (major) — the hours-long holds still re-arm the bell row, now on two half-hourly producers

`STANDING_QUIET` deliberately excludes `sunday_quiet`, `before_local_morning`
and `quiet_hours`, so `shouldFireDecisionInApp` returns true and
`_enqueue_decision_notification` re-arms on a service-role call
(verified body: `read_at = CASE WHEN v_rearm_existing THEN NULL …`,
`created_at = EXCLUDED.created_at`).

Two producers now hit that path repeatedly:
`decision-reminders-hourly` (24×/day) and `decision-first-notice-retry-sweep`
(48×/day, because a gate-held letter writes no log row and stays selected for
72 hours). On a Sunday that is ~72 re-arms; overnight it is ~24 between midnight
and 8am. If she reads the line at 1am it is unread again by 1:30am — and the
refreshed `created_at` also keeps it inside the digest window, which is the
mechanism that made B1 recur nightly in round 1.

*Fix:* either suppress the re-arm for every hold (write the row only when
absent), or exempt the sweep's invocations from the RPC re-arm.

### M-R2-04 (major) — `decision_first_notice_attempts.attempts` is still never read, and the sweep now has three no-log exits

Round 1 left m10 open; the M7 widening makes it load-bearing.
`sendCompliantEmail` returns **before** writing any log row on three paths:
no `userId` (`shouldLog` false), a suppressed address (`send-email.ts:216`),
and the per-user hourly rate cap (`send-email.ts:246`). `decisionMailHold` adds
six more silent exits (`snoozed`, `sunday_quiet`, `before_local_morning`,
`quiet_after_overdue`, `type_disabled`, `email_channel_disabled`) plus
`quiet_hours`. On every one of them the sweep's `NOT EXISTS` stays true and the
decision is re-invoked 48×/day for three days.

For a homeowner who unsubscribed (suppressed), that is 144 pointless edge
invocations **and** 144 bell-row re-arms (M-R2-03) — the letter is correctly not
sent, but her inbox line flips back to unread every half hour for three days.

The migration banner (00572:~86) claims the table exists so a gated letter is
not "retried 144 times". It is.

*Fix:* cap on `attempts` (the column is already there), or record a terminal
disposition per decision.

### M-R2-05 (major) — the email-channel and type preferences now silence the *in-app* re-arm

`STANDING_QUIET` includes `type_disabled` and `email_channel_disabled`. Both are
**email** preferences (`channels_email`, `type_project_milestone`), and
`channels_in_app` is loaded and never consulted. A homeowner who turned email
off keeps the bell as her only channel — and the digest also excludes her
(`.eq("channels_email", true)`), so nothing else speaks. Before this wave the
reminder pass re-armed her line; now her first-notice row is written once and
never refreshed again.

*Fix:* gate the in-app re-arm on `channels_in_app`, not on the two email
preferences.

### M-R2-06 (major) — "When it's due" produces no letter at its hour

`set_decision_snooze('when_due')` stores `snoozed_until = due_date`.
`decision-reminders` selects `due_date >= now() AND due_date <= now()+48h`, so
at the moment the snooze lifts the decision has already fallen out of the
reminder window (the next hourly pass is after `due_date`). The next thing she
hears is the overdue notice — the "Still open, {Designer} asked on {date}"
register — not the due-day reminder the control promises
(`ux/03 §290`: *"When it's due"*).

*Fix:* set `snoozed_until` to a real morning before the date (or widen
`decision-reminders`' lower bound so a lifting `when_due` snooze has a pass to
land in).

---

## 3. New minors and nits

- **m-R2-07 (minor).** The push window now defers **every** client attention
  push, not only approvals: `notify_client_attention` is the shared writer for
  `proposal-send`, `invoice-send`, `invoice-reminders` and
  `notify_client_decision_raised`. A proposal sent at 9pm no longer buzzes until
  8am. Defensible and arguably right, but it is a scope expansion beyond R16's
  approval push and is not called out in the lane notes.
- **m-R2-08 (minor).** `release_due_client_pushes`' relevance leg checks only
  `client_decisions.status`. A proposal she accepted at 11pm, without opening the
  bell row, still rings at 8am.
- **m-R2-09 (minor).** Three different answers to "no preferences row":
  `getReminderCadence` → `daily`, `_shared/decision-notify.loadPreferences` →
  `immediate` → `right_away`, `proposal-nudge.nudgeRoutesToDigest` → direct mail.
  The client portal picker shows "Once a day" pre-selected
  (`details-sheet.tsx:616 prefs.reminder_cadence ?? "daily"`) for a state the
  rail treats as "right away". Rare (00040's trigger mints a row per user) but
  the UI would be lying when it happens.
- **n-R2-10 (nit).** `packages/shared/src/types/notifications.ts:76-82` keeps the
  old JSDoc block describing `immediate` / `daily_digest` directly above the new
  one. Two stacked doc comments, the first now false.
- **n-R2-11 (nit).** The successor letter falls back to
  `previous.version + 1` when the successor carries no artifact
  (`decision-notify.ts:961`) — an invented edition number on a path that can
  only be reached by a non-Stage-2 decision with a predecessor.
- **n-R2-12 (nit).** The zone ladder ends at `America/New_York`, where the brief
  said UTC. Disclosed and argued in the banner; recorded as a deviation, not a
  defect.

---

## 4. Gates run by the reviewer

| gate | result |
|---|---|
| `deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/` | **ok · 225 passed · 0 failed** |
| `deno test … decision-first-notice/ decision-reminders/ notification-digest/ expire-decisions/ proposal-nudge/ decision-resolved-notify/` | **ok · 37 passed · 0 failed** |
| `deno check --config …` on the 6 touched `index.ts` | clean (6/6) |
| scratch DB `patina_w3_rev2` (`pg_dump --no-owner --exclude-schema=cron postgres` + cron stub + 00569) → `psql -v ON_ERROR_STOP=1 -f 00572` | **exit 0**, 0 errors |
| second apply, same DB (idempotency) | **exit 0** |
| `cron.job` after apply | `client-push-window-release */15` · `decision-first-notice-retry-sweep */30` · `decision-reminders-hourly 0 * * * *` · `notification-digest-hourly 20 * * * *` |
| `scripts/run-sql-tests.sh -f notifications` (PGURL → scratch) | `she_sets_the_pace_test.sql` **PASS**, `client_attention_test.sql` **PASS**, `onboarding_drip_retiming_test.sql` **PASS**; `decision_first_notice_test.sql` FAIL — **reproduced identically on a 00572-less baseline DB**, a scratch-harness artefact (`invoke_edge_function: missing app.settings.supabase_url`) |
| `scripts/run-sql-tests.sh -f approval_authority` | **6 / 6 PASS** |
| `pnpm --filter @patina/notifications test` | **89 passed** |
| `pnpm --filter @patina/client-portal type-check` | **PASS** |
| client-portal `pnpm test -- --testPathPattern details-sheet` | **34 passed** |
| probe: `set_decision_snooze` as a stranger | refused (`insufficient_privilege`) — expected |
| probe: direct `INSERT INTO decision_snoozes` as `authenticated` for self | **succeeded** — m9 confirmed open |
| probe: `next_local_morning(zone, exactly 08:00 local)` | returns tomorrow 08:00 — m11 confirmed open |
| probe: sweep selection against a legacy decision with `client_id IS NULL` | **selected** — B-R2-01 confirmed reachable |
| deploy set (`grep -rl decision-notify.ts supabase/functions`) | matches the lane's revised set; `invoice-reminders` is a prose comment only — correctly excluded |
| pathspec hygiene | 27 files, no `.env`, no `.claude/`, no `deno.lock`, no stray untracked adds |

Both scratch databases were dropped afterwards. The shared `postgres` database
on `127.0.0.1:54322` was never reset, migrated or written to.

---

## 5. What is genuinely good here

- `decisionMailHold` is one pure function holding all of R16 and is tested as
  one; the overdue and superseding exemptions are correct and asserted.
- The migration is well-formed for Strata: banner, lineage, RLS in-file, pinned
  `search_path`, schema-qualified `extensions.gen_random_uuid()`, guarded cron
  blocks with schema-qualified bodies, no enum touched, applies and re-applies
  clean.
- Both grafts are from 00569, the true latest bodies, and the receipt-push
  silence (R16 / Wave-2 walk) survives the regraft byte for byte.
- The M6 repair is the subtle one and it is right: an inherited why keeps its
  composer through the whole supersession chain.
- Homeowner copy passes every refusal I could test it against — no "overdue",
  no counts in numerals, no guilt, no invented timing in the delta lines, and
  the successor letter says out loud that the earlier edition stays in the
  record.
