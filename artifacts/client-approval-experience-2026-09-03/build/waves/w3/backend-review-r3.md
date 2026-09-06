# W3 backend — adversarial review, round 3

Reviewer: a separate context; did not write this code. Branch `approvals/w3-backend`,
worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-backend`,
diffed against `main` (`git diff main...HEAD`, 28 files, +6071 / −151).

**Verdict: FIX.** No blocker. One major. The round-2 blocker (B-R2-01) and all five
round-2 majors are genuinely repaired; the M-R2-02 repair is over-broad and is the
one major this round. Eight round-1/round-2 nits remain unfixed (most deliberately,
several awaiting a ruling).

---

## Gates run (by the reviewer, on this branch)

| gate | result |
|---|---|
| `deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/` | **ok · 226 passed, 0 failed** |
| `deno test … decision-first-notice/` | **ok · 13 passed** |
| `deno test … notification-digest/` | **ok · 22 passed** |
| `deno test … proposal-nudge/` | **ok · 3 passed** |
| `deno test … decision-reminders/` | **ok · 6 passed** |
| `deno check` on the five touched `index.ts` | **Check** on all five, no diagnostics |
| `deno.lock` present? | no (`supabase/functions/deno.lock` and repo-root both absent) |
| scratch apply: `psql -v ON_ERROR_STOP=1 -f 00572_she_sets_the_pace.sql` | **exit 0**, no ERROR lines |
| `supabase/tests/notifications/she_sets_the_pace_test.sql` | **exit 0** — "all assertions passed" |
| `supabase/tests/notifications/client_attention_test.sql` | exit 0 |
| `supabase/tests/notifications/onboarding_drip_retiming_test.sql` | exit 0 |
| `supabase/tests/workflow/approval_authority/*.sql` (6 files incl. the edited 00569 contract test) | **all exit 0** |
| `supabase/tests/notifications/decision_first_notice_test.sql` | exit 3 — **also fails on a baseline scratch DB without 00572** (pg_net/app.settings harness), not caused by this branch |
| `supabase/tests/notifications/unconfirmed_analytics_test.sql` | exit 3 — listed in `supabase/tests/KNOWN_FAILURES.md:94` |
| `cron.job` after apply | `client-push-window-release */15` · `decision-first-notice-retry-sweep */30` · `decision-reminders-hourly 0 * * * *` · `notification-digest-hourly 20 * * * *` |
| `pnpm --filter @patina/notifications test` | 89 passed |
| `pnpm --filter @patina/client-portal test -- details-sheet` | 34 passed |
| `pnpm turbo type-check` (client-portal, shared, notifications, types, supabase) | 13 successful, 13 total |
| types delta | `database.types.ts` carries `decision_snoozes`, `notification_log.deliver_after`, `decision_first_notice_attempts.disposition`, `decision_first_notice_sweep_state` and all eleven new functions |
| `seed/00-legacy-grants.sql` | +192 lines; every new function and all three new tables carry their REVOKE/GRANT |
| deploy set | recomputed independently: `decision-first-notice, decision-reminders, decision-resolved-notify, expire-decisions, notification-digest, proposal-nudge` — matches the notes; `invoice-reminders` names decision-notify in a comment only |
| shared local stack | **untouched.** Scratch DBs `patina_w3r3` (with 00572) and `patina_w3base` (without) built by `pg_dump --no-owner --exclude-schema=cron postgres`, 00569 applied first, cron stubbed; both dropped at the end. `select datname from pg_database` back to `template1/template0/_supabase/postgres/storage_vectors`. |

---

## Round-2 findings — disposition

| id | verdict |
|---|---|
| **B-R2-01** (sweep re-sends to a legacy client 144×) | **FIXED.** `decision-first-notice` now reports a disposition through `record_decision_first_notice_attempt`; `firstNoticeDisposition` classes `sent` as terminal *whether or not any log row was written*, and `sweep_decision_first_notices` reads `_decision_first_notice_disposition_is_terminal` plus an `attempts >= 96` ceiling. SQL test §6b pins it. |
| **M-R2-02** (two letters in 24 h on the default cadence) | Fixed for the case reported — and **over-fixed**; see M-R3-01 below. |
| **M-R2-03** (hours-long holds re-arm the row) | **FIXED.** `shouldFireDecisionInApp` returns false for every hold but `cadence_digest` when a row already stands. |
| **M-R2-04** (attempts written, never read; banner untrue) | **FIXED.** `attempts` is now the ceiling; the banner (lines 88–103) and the table comment describe what the code does. Closes m10. |
| **M-R2-05** (email switches silencing the bell) | **FIXED** as asked — `inAppEnabled` (`channels_in_app`) gates the re-arm and the two email switches are answered before the function. Its unintended consequence is m-R3-03 below. |
| **M-R2-06** (`when_due` lifts too late) | **FIXED.** `next_local_morning(zone, due − 1 day − 1 minute)` lands strictly inside `(due − 24h, due)`; SQL test asserts both bounds and hour = 8. |

---

## New this round

### M-R3-01 · major (confidence 0.75) — the summary's "already mailed" filter spans the whole digest window, not 24 hours

`notification-digest/index.ts:322` computes `sinceIso = digestWindowStart(period, lastSent, now)`
and hands **that same instant** to `decisionsMailedDirect(...)` at `:270`. The M-R2-02 rule
it implements is ux/03 §282 — "no second automated notice for one decision inside **24
hours**" — but the window it is applied over is a period, not a day:

```
digestWindowStart("weekly_sunday", "2026-10-04T12:00:00Z", 2026-10-11T13:00:00Z)
  → 2026-10-04T12:00:00.000Z          # seven days
digestWindowStart("daily", <last sent Saturday>, <Monday>)
  → the Saturday send                  # ≈48 h after a Sunday skip
```
(run against the branch's own `logic.ts`.)

Every approval mails its **first notice direct** — `decisionMailHold` makes
`notice === "first"` break the digest for all three cadences. So on `weekly_sunday`
every approval announced during the week has a `decision_required` email row inside
the Sunday window and is dropped from the Sunday summary by
`dropDirectlyMailedDecisions`. The reminder for it never mails either: it was held
as `cadence_digest`, and `reminderStampDisposition` stamped `reminder_sent_at`, so
`decision-reminders` will not return to it. A "once a week, on Sunday" reader
therefore hears the announcement and then **nothing** about that approval until its
date passes — for any approval whose whole life falls inside one week, which is most
of them. On `daily` the same filter suppresses a Saturday announcement from Monday's
summary (the Sunday skip stretches the window).

**Fix:** give `decisionsMailedDirect` its own 24-hour floor
(`max(sinceIso, now − 24h)`) instead of the digest window, and keep the window for
`collectItems` alone. No test covers this today — the digest tests only exercise the
daily window, where the two coincide.

### m-R3-02 · minor (confidence 0.85) — R16's gates do not exist for a recipient with no auth profile

In `deliverDecisionNotification` (`_shared/decision-notify.ts:1483`) the entire gate —
cadence, snooze, Sunday rule, 8am floor, quiet-after-overdue and quiet hours — sits
inside `if (recipient.userId) { … }`. For the legacy relationship B-R2-01 was about
(`designer_clients.client_id IS NULL`, email resolved from `client_email`),
`timingHold` is never computed and `held` is null: her letters go out at 3am, on a
Sunday, and after the overdue notice. ux/03 §6.2 states the floor as a fact about
Patina, not as a preference. There is no zone for such a recipient, but the rail's own
`DEFAULT_TIME_ZONE` already stands in everywhere else (and `notification_time_zone`
does exactly that in SQL).

### m-R3-03 · minor (confidence 0.8) — the M-R2-05 repair re-arms the spine row on every hourly pass for a reader whose email is off

With `channels_email = false` (or `type_project_milestone = false`) and the bell on:
`emailClosed` is set, `timingHold` stays null, so `mayFire` short-circuits `rowExists`
to `false` and `shouldFireDecisionInApp` returns true — the row is re-armed
(`read_at = NULL`, `created_at = now()`; verified in `_enqueue_decision_notification`'s
body on the scratch DB). `reminderStampDisposition` returns null for that reason, so
`reminder_sent_at` is never stamped and `decision-reminders` — **hourly** since this
migration — selects the same approval again in an hour, for the whole 48-hour window.
Impact is bounded because the only reader of `decision_notifications` in the tree is
`notification-digest` (grepped: no client-portal, no iOS, no designer surface), but
the digest *does* read `read_at IS NULL`, and it never consults
`type_project_milestone` — so a reader who switched approval mail off is still
summarised, on a row this branch refreshes 24×/day.

### m-R3-04 · minor (confidence 0.8) — the quiet after the overdue notice is never applied to the overdue row itself, and a Stage-2 approval never leaves `pending`

`decisionMailHold` returns null immediately for `decision_overdue`, so `mayFire` is
always true for it and `expire-decisions` (daily, 02:00 UTC) re-arms the
`decision_overdue` spine row on every pass. `expire_due_client_decisions` filters
`approval_contract IS NULL` (read from the scratch DB), so a Stage-2 approval past its
date **never expires** and is re-selected forever. The email is deduped by
`notification_log`, and nothing homeowner-facing reads `decision_notifications`, so
this is churn rather than a second letter — but "Patina goes quiet after the overdue
notice" is not true of the row it writes.

### n-R3-05 · nit (confidence 0.8) — `decisionsMailedDirect`'s 200-row page is unordered

`notification-digest/index.ts:145` selects `decision_required` email rows with
`.limit(200)` and no `order`. A reader with more than 200 such rows in the window gets
an arbitrary subset, so the duplicate the filter exists to prevent can reappear.

### n-R3-06 · nit (confidence 0.7) — a bounced letter silences the summary

`EMAIL_ACTUALLY_LEFT` (`notification-digest/logic.ts:90`) includes `bounced` and
`complained`. A bounce means she did **not** read it; treating it as spoken-for drops
the approval from the one summary that could still reach her in-app-adjacent channel.

### n-R3-07 · nit (confidence 0.95) — cross-lane collision on four shared files

`approvals/w3-web` edits the same lines of `apps/client-portal/.../details-sheet.tsx`
and `packages/shared/src/types/notifications.ts` (its versions are supersets — it also
deletes the stale JSDoc this branch leaves stacked, n-R2-10). `packages/notifications/
src/preferences.ts`, `packages/shared/src/validation/notifications.ts`,
`packages/types/src/strata-notifications.ts` and
`packages/supabase/src/hooks/use-notification-preferences.ts` are byte-identical on the
two branches. Advisory 2 in the lane notes calls this out; integration should take the
web lane's text for the two that differ.

---

## Carried, still unfixed

| id | severity | state |
|---|---|---|
| m9 | minor | **Reprobed and still true.** As `SET LOCAL ROLE authenticated` with a stranger's `sub`, `INSERT INTO public.decision_snoozes (user_id = <stranger>, decision_id = <an approval addressed to someone else>, 'infinity', 'never')` **SUCCEEDED**. `set_decision_snooze`'s authority check is advisory while `authenticated` holds INSERT/UPDATE/DELETE (00572:310). The SQL test only proves a reader cannot write a row *for another user*. |
| m12 | minor | Unfixed; ruling owed. `decisionMailHold` has no `hour >= 20` branch. Lane advisory 5 asks for the ruling; ux/03 §284 and build-sheet P-28 both say 8am–8pm for mail. |
| m13 | nit | Unfixed. `SupersededEdition.title` is resolved in `decision-first-notice/logic.ts` and read nowhere (grepped `_shared/decision-notify.ts`). P-27 asks the successor to name title/version. |
| m14 | nit | Unfixed. `isReminderDigestUser` is true for an absent preference; `notification-digest` never scans a user with no row. |
| m-R2-07 | nit | Unfixed and **still unrecorded.** Probed: `notify_client_attention(u, 'proposal', …)` at 05:00 local wrote a push row with `deliver_after = 2026-09-06 12:00:00+00`. Proposals and invoices ride the window with approvals; the lane notes and the deploy runbook still do not say so. |
| m-R2-08 | nit | Unfixed. `release_due_client_pushes`' liveness leg is guarded by `metadata->>'entity_type' = 'decision'` (00572:724); a proposal accepted overnight still rings at 8am unless its bell row was opened. |
| m-R2-09 | minor | Unfixed. Four answers to "no preferences row": `details-sheet.tsx:616` → `daily`; `getReminderCadence` → `daily`; `loadPreferences` (`decision-notify.ts:492`) → `immediate` → `right_away`; `nudgeRoutesToDigest(null)` → direct mail. |
| n11 | nit | Unfixed. Probed: `next_local_morning('America/New_York','2026-10-07T12:00:00Z')` (08:00 EDT) → `2026-10-08 12:00:00+00`. The inline comment says "strictly after"; `COMMENT ON FUNCTION` at 00572:351 still says "at or after". The `when_due` branch's own comment repeats the wrong reading (harmlessly). |
| n15 | nit | Unfixed, and slightly wider: `expire-decisions/index.ts:153` gates the hand-off on `result.emailSent \|\| result.inAppOk`, and `inAppOk` is now `true` even on the pass where no row was written (`mayFire === false` returns `{ ok: true }`). |
| n16 | nit | Unfixed. `ON CONFLICT … SET created_at = now()` (00572:460). |
| n17 | nit | Unfixed. `backfill_why_author_display_names()` survives with `GRANT EXECUTE … TO service_role` and runs `ALTER TABLE … DISABLE TRIGGER` (00572:1709), which needs table ownership on Strata. |
| n18 | nit | Unfixed. `notify_client_attention` is redefined at 00572:533 with only a `COMMENT`; 00534:219-222's REVOKE/GRANT pair is not repeated. |
| n19 | nit | Deliberate. `reminderCadenceSchema` carries five values, `ReminderCadence` three. |
| n20 | nit | **Addressed in the notes** (banner "AND TWO SCHEDULES MOVE", notes lines 272-273 and the M3 row). Confirmed on the scratch DB. |
| n-R2-10 | nit | Unfixed on this branch (the web lane deleted it) — `packages/shared/src/types/notifications.ts:79-88` stacks the superseded `immediate`/`daily_digest` block above the new one. |
| n-R2-11 | nit | Unfixed. `thisVersion = decision.artifact?.version ?? previous.version + 1`. |
| n-R2-12 | nit | Disclosed deviation, still owed an accept/overrule: the zone ladder ends at `America/New_York`, not UTC. |

---

## Verified good

- **R16, snooze exceptions.** `decisionMailHold` returns null for `decision_overdue`
  before any snooze/cadence/Sunday branch, and the `isSupersedingEdition` flag bypasses
  both the snooze and the digest. Deno tests at `decision-notify.test.ts:1051`, `:1073`.
- **The in-app row is never deferred.** `shouldFireDecisionInApp` returns true for
  `rowExists === false` under every hold and with `inAppEnabled === false`; tested.
- **No Sunday approval mail**, read in HER zone, `:1091` and `:1118`.
- **The default cadence** is `'daily'::text` on the column (asserted in SQL), existing
  rows are mapped forward rather than re-defaulted, and the banner argues the choice.
- **The receipt push is silent** — the regrafted `notify_client_attention` writes the
  receipt row already opened, mints no envelope, dispatches nothing.
- **W2-n4** — the why is signed with the display name; the recursive backfill keeps an
  inherited sentence with its composer; the 00569 contract test was updated to the new
  ruling and passes.
- **Copy.** No badge, no count chip, no red/green, no checkmark, no emoji, no "gate",
  "task", "dashboard", "AI" or "overdue" in any new homeowner string. Subjects count in
  words. `decisionDigestTitle` still says "Still open:". The successor letter never
  implies the earlier answer was undone and says "Edition N stays in the record."
- **Commit hygiene.** Nine commits, explicit pathspecs only, Conventional subjects, no
  trailers, no `merge(...)`, program docs force-added.
