# Wave 3 — backend lane, adversarial review r1

Reviewer context, separate from the implementer. Branch `approvals/w3-backend` at `a8df47ca7`,
worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-backend`
(`git rev-parse --show-toplevel` confirmed). Four commits, 23 files, pathspec-clean, Conventional
subjects, no trailers, no `deno.lock`, working tree clean.

**Verdict: fix.** Two blockers, five majors, six minors, six nits. Every gate the lane claims is
green is green in my hands too — the defects below are behavioural, and the tests do not reach
them.

---

## What is right

- **The migration is well made and safe to replay.** Banner, lineage, RLS in-file, explicit
  REVOKE/GRANT, pinned `search_path`, `extensions.gen_random_uuid()`, guarded cron blocks matching
  00553's house pattern. It applied clean to a scratch DB and applied clean a second time
  (idempotent, 0 errors both passes).
- **Both grafts are honest.** `_create_project_approval_decision_checked` diffs against 00569 to
  exactly the W2-n4 resolution and its comment; `notify_client_attention` diffs to exactly the
  `deliver_after` mint plus the early return. Nothing else moved.
- **The receipt push is verified silent** — the receipt branch still returns before the envelope,
  so there is no push row and nothing handed to apns-send. No fix was needed and none was made.
- **`decisionMailHold` is the right shape**: one pure function, tested as one, with overdue and the
  superseding edition escaping every gate. The pure-gate tests are good and they assert R16 by name.
- **P-27's letter is evidence-bound.** An unanswered predecessor names no answer, a missing artifact
  yields no delta, and the letter falls back to the ordinary first notice. One forward act. No
  refusal in any homeowner string I read across the successor letter, the digest, the hand-off row
  and the cadence picker.
- **The deploy set is correct**, name for name: `decision-first-notice`, `decision-reminders`,
  `decision-resolved-notify`, `expire-decisions`, `notification-digest`. `invoice-reminders` names
  decision-notify only in prose — verified no import.

---

## Blockers

### B1 — The digest ignores the snooze. A snoozed approval still arrives in her summary mail.

`supabase/functions/notification-digest/index.ts:118` (the `decision_notifications` scan in
`collectItems`). The digest reads `decision_notifications` and drops only decisions past their
overdue notice (`dropDecisionsPastOverdue`). It never reads `decision_snoozes`.

Proof it cannot: the only reader of that table in the whole tree is the direct-mail gate.

```
$ grep -rn "decision_snoozes" supabase/functions packages apps | grep -v '\.test\.'
supabase/functions/_shared/decision-notify.ts:121:  /** decision_snoozes.snoozed_until … */
supabase/functions/_shared/decision-notify.ts:1318:    .from("decision_snoozes")
packages/supabase/src/database.types.ts:…   (type rows only)
```

The path: `deliverDecisionNotification` fires `fireDecisionInApp` at step 1 — **before** any gate —
so the `decision_notifications` row exists whatever the hold says. `decisionMailHold` then returns
`"snoozed"` and the *direct* letter is held. The digest cron later picks the same row up
(`kind = decision_required`, `read_at IS NULL`, `created_at > since`) and mails it.

The default cadence this wave installs is `daily`, so this is the common path, not the corner: the
woman who taps "Sunday" on Monday morning is mailed about that approval every evening until she
answers. P-28's own line — *"a snoozed approval sends nothing until snoozed_until, EXCEPT the
overdue notice and a superseding edition"* — is not delivered. R16.

Fix: `collectItems` needs the same snooze read the mail gate has (one `decision_snoozes` query for
the user, filtered like `dropDecisionsPastOverdue`), with the superseding-edition exception kept.

### B2 — `proposal-nudge` still tests for `'daily_digest'`, a value this migration makes impossible.

`supabase/functions/proposal-nudge/index.ts:134`:

```ts
if (pref?.reminder_cadence === 'daily_digest') {
```

00572 backfills every row (`daily_digest → daily`), adds
`CHECK (reminder_cadence IN ('right_away','daily','weekly_sunday'))`, and normalises the retired
spellings on write. That branch can never be taken again. The consequence is the opposite of the
wave's promise: **every client who chose the summary starts receiving direct proposal-nudge emails
the moment this migration lands**, and the digest's whole `proposal` section goes empty (it is fed
only by the in-app rows that branch writes).

`proposal-nudge` was not edited and is not in the lane's deploy set. It is the one remaining
consumer of the old spelling — I grepped the whole tree:

```
$ grep -rn "reminder_cadence" supabase/functions | grep -v "decision-notify\|notification-digest"
supabase/functions/invoice-reminders/index.ts:3,5,12,14   (prose: deliberately exempt)
supabase/functions/proposal-nudge/index.ts:130,134        (the live check)
```

Fix: `isReminderDigestUser`-equivalent (`!== 'right_away'`) in `proposal-nudge`, and add it to the
deploy set.

---

## Majors

### M3 — The daily digest is not Sunday-gated and honours no morning floor.

`notification-digest/logic.ts:isDigestDue` sends `period === 'daily'` straight to
`isReminderDigestDue`, which is a 20-hour min-interval and nothing else. The cron is
`0 15 * * *` (00278). So:

- a `daily` reader **receives automated approval mail on Sunday**, which P-28 item 3 forbids for
  every cadence but `weekly_sunday` ("send Monday 8am local");
- at 15:00 UTC a Pacific reader is mailed at **07:00 PST** in winter — below the 8am floor the same
  wave enforces on the direct letter;
- `weekly_sunday` has the Sunday check but no morning check: 15:00 UTC on Saturday is **00:00
  Sunday in Asia/Tokyo**, so her "Sunday summary" arrives at midnight.

The direct-letter gate got this right (`sunday_quiet`, `before_local_morning`). The digest — which
is now the vehicle for the *default* cadence — got none of it.

### M4 — A deferred push can ring for an approval she has already answered.

`00572:release_due_client_pushes` selects `channel='push' AND status='queued' AND deliver_after <=
now()` and dispatches. Nothing checks that the decision is still pending, or that the paired
`in_app` row is still unopened.

Before this wave the envelope was dispatched in the same statement that minted it, so the window
was zero. Now an envelope minted at 22:00 local waits until 08:00 — up to ten hours in which she can
open the app and answer. `_respond_project_approval_checked` (00569) writes the receipt through
`notify_client_attention`, which updates the **in_app** row to `opened` and returns before the push
branch; the queued envelope is untouched and still fires at 8am saying "A sign-off needs you."

Fix: skip a row whose entity is no longer pending, or whose paired in_app row is opened, at release
time.

### M5 — The hourly reminder cron re-arms the in-app row every hour for a held approval.

The migration moves `decision-reminders` from daily (09:00 UTC) to `0 * * * *`. `decision-reminders`
calls `fireDecisionInApp` on every pass, and `_enqueue_decision_notification` (00466:88-99) on a
service_role call sets

```sql
read_at    = CASE WHEN v_rearm_existing THEN NULL ELSE … END,
created_at = CASE WHEN v_rearm_existing THEN EXCLUDED.created_at ELSE … END
```

`reminderStampDisposition` (decision-reminders/logic.ts) stamps only on `emailSent` or on
`cadence_digest`. Every **new** hold — `snoozed`, `sunday_quiet`, `before_local_morning`,
`quiet_after_overdue` — leaves the row unstamped, so the decision stays in the 48-hour query and is
re-armed 24 times a day instead of once.

Two consequences. Her snoozed approval **pops back to unread every hour** on the in-app rail —
the snooze makes Patina more insistent, not less. And the re-armed `created_at`/`read_at` keep the
row permanently inside the digest's window, which is what makes B1 recur nightly forever rather
than once.

### M6 — The `why` backfill re-signs inherited lines with the wrong studio member.

`00572:backfill_why_author_display_names()` resolves every artifact's author from **that decision's
own `created` receipt actor**:

```sql
FROM ( SELECT receipt.decision_id, public._why_author_display_name(receipt.actor_id) AS name
         FROM public.project_approval_action_receipts AS receipt
        WHERE receipt.action_kind = 'created' ) AS resolved
WHERE resolved.decision_id = artifact.decision_id AND artifact.why IS NOT NULL …
```

But a successor created by `supersede_project_approval_decision` (00569:938-955) **inherits** the
predecessor's `why` *and* its `why_author_name`, precisely so an inherited line keeps the name of
whoever wrote it — and its own `created` receipt names the *reissuing* designer. The backfill
overwrites the inherited attribution with the reissuer's display name, so the predecessor's sentence
is re-signed by someone who did not write it. It is exactly the failure 00569's freeze exists to
prevent, and it fires on every superseded chain in a multi-member studio.

Fix: exclude artifacts whose `why` equals the predecessor's `why` (or whose decision carries a
`predecessor_decision_id` and an unchanged why), or resolve inherited rows from the predecessor's
receipt instead.

### M7 — A legacy first notice published on a Sunday or before 8am is now dropped, permanently.

00568's trigger fires for **every** client decision (`IF NEW.status <> 'pending' OR NEW.court <>
'client' THEN RETURN NEW` — no `approval_contract` filter). This wave adds `sunday_quiet` and
`before_local_morning` to the mail gate, so a first notice minted in those hours is held. The new
retry sweep only covers Stage-2:

```sql
WHERE d.approval_contract = 'project_artifact_v1'
```

A legacy decision published Sunday therefore loses its announcing letter with nothing to return for
it. Before 00572 it always went out. `decision-reminders` will later send the *returning* register
inside the 48-hour window, which is a different letter and only if the decision has a `due_date`
inside it.

### M8 — The sweep cutoff is a guess about a date on Strata that nobody read.

`_decision_first_notice_sweep_cutoff()` hardcodes `2026-09-05T00:00:00Z` — "the day 00568 landed on
main with the Wave-1 integration merge". That is main's merge date, not Strata's apply date, and the
cutoff's whole job is to keep the sweep off approvals published *before the producer existed in
production*. If 00568 was applied to Strata at any hour after midnight on 2026-09-05, every approval
published in the gap gets a "first notice" it was never owed — the exact failure Wave 1's R3-01 was.
Read the Strata apply time before deploying and move the constant to it (or to the later of the two).

---

## Minors

- **m9 — the RPC's authorization is decorative.** `decision_snoozes` grants
  `SELECT, INSERT, UPDATE, DELETE` to `authenticated` under an owner-only RLS check, so any signed-in
  reader can INSERT a snooze row for any `decision_id` for themselves, bypassing
  `set_decision_snooze`'s careful "this approval is not addressed to you". It only mutes their own
  mail, so nothing leaks and nobody else is silenced — but the check is not a boundary. Either drop
  the direct DML grants (RPC-only writes) or say in the comment that it is advisory.
- **m10 — `decision_first_notice_attempts.attempts` is write-only.** The banner says the table exists
  because a gated letter "would otherwise be retried 144 times"; the sweep enforces only the
  30-minute cooldown, so it *is* still retried ~144 times across the 72-hour window. The counter is
  never read. Either cap on it or drop the claim.
- **m11 — two arithmetics for one idea, and an off-by-one comment.**
  `next_local_morning`'s comment says "the first 8am in p_zone **at or after** p_from", but the body
  uses `<`, so exactly 08:00:00 local returns *tomorrow*. Separately, `set_decision_snooze` computes
  `tomorrow_morning` inline rather than calling `next_local_morning`, so the same sentence is written
  twice and can drift.
- **m12 — mail honours only half the floor.** ux/03 §6.2 and the build sheet's P-28 row both say
  "a floor of 8am–8pm local"; the lane implemented 8am for mail and left 8pm to the push leg alone,
  on the reviewer brief's "only the push leg honors the 8am–8pm window". Its own advisory 5 asks for
  the ruling. It needs one, not a default.
- **m13 — the successor never names the predecessor's title.** P-27 asks the letter to name
  "title/version"; `SupersededEdition.title` is resolved in `logic.ts` and never rendered. Dead field,
  half a promise.
- **m14 — cadence flip changes a shared helper's default.** `isReminderDigestUser` now returns
  `true` for an absent preference (it was `false`). It is only exported, not called in product code
  today, but any future caller inherits "batch by default" while `notification-digest` scans the
  *table* — a user with no preferences row would be suppressed by the helper and never digested.

---

## Nits

- **n15** — the studio hand-off is written on `emailSent || inAppOk`, and `inAppOk` is true when the
  overdue **mail** was suppressed. The designer reads "Patina has stopped reminding Anne" when Patina
  never wrote to Anne at all. Same asymmetry in `decisionOverdueAlreadySent`, which reads the spine
  row rather than the mail log — the lane documents the choice; the hand-off line does not.
- **n16** — `set_decision_snooze`'s `ON CONFLICT … SET created_at = now()` makes `created_at` a
  last-changed stamp. Rename or leave it alone.
- **n17** — `backfill_why_author_display_names()` survives in the schema, granted to `service_role`,
  able to `DISABLE TRIGGER` on the evidence table. Also: the whole migration aborts if
  `project_approval_artifacts` is not owned by the migrating role. It is `postgres` locally
  (verified); confirm on Strata before the push.
- **n18** — `notify_client_attention` is redefined with no REVOKE/GRANT pair (00534 carried one;
  00569 set this precedent). `CREATE OR REPLACE` keeps the ACL on a live chain so it is safe, but any
  rebuild that loses ACLs leaves it EXECUTE-to-PUBLIC — I reproduced exactly that on a `--no-acl`
  restore, where `client_attention_test.sql` failed until the legacy-grants seed was replayed.
- **n19** — `reminderCadenceSchema` (5 values) and `ReminderCadence` (3) no longer agree; the lane
  flags it as deliberate. Narrow once the portals ship.
- **n20** — the hourly cron re-runs the full PostgREST reminder query 24×/day where it ran once.
  Cost only, but say so in the runbook so the next reader does not read it as a regression.

---

## Gates I ran myself

| Gate | Result |
|---|---|
| `deno test --allow-all --config supabase/functions/deno.json supabase/functions/_shared/` | **PASS** — `ok \| 223 passed \| 0 failed (3s)` |
| `deno test … decision-first-notice/ notification-digest/ decision-reminders/ expire-decisions/` | **PASS** — `ok \| 30 passed \| 0 failed` (8 + 6 + 16) |
| `deno check --config …` on all 7 touched function files | **clean**, every file |
| scratch DB build (`pg_dump --no-owner --no-acl --exclude-schema=cron postgres` → `patina_w3_rev`, cron stubbed, 00569 then 00572) | **rc=0**, 0 errors |
| 00572 second apply, same DB | **rc=0**, 0 errors — idempotent |
| `supabase/tests/notifications/she_sets_the_pace_test.sql` | **PASS** — `all assertions passed` |
| `supabase/tests/workflow/approval_authority/*.sql` (6 files) + `client_attention_test.sql` | **7 PASS** (after replaying `seed/00-legacy-grants.sql` — the 5 initial failures were `--no-acl` restore artifacts, all ACL assertions, not lane defects) |
| `cron.job` after apply | 3 guarded jobs present: `decision-reminders-hourly` `0 * * * *`, `client-push-window-release` `*/15 * * * *`, `decision-first-notice-retry-sweep` `*/30 * * * *`; all bodies schema-qualified |
| function volatility | `next_local_morning` IMMUTABLE is legal here — `timezone(text, timestamptz)` is IMMUTABLE in this server; `push_deliver_after`/`notification_time_zone` STABLE, correct |
| `pnpm --filter @patina/notifications test` | **PASS** — 89 passed |
| `pnpm --filter @patina/client-portal type-check` | **PASS** — no output |
| `pnpm --filter @patina/client-portal test -- --testPathPattern=details-sheet` | **PASS** — 34 passed |
| generated types vs scratch schema | consistent — `decision_snoozes`, `decision_first_notice_attempts`, `deliver_after`, and all seven new functions present |
| `git status --porcelain`, `deno.lock` sweep | clean; no lock anywhere |

Scratch DB `patina_w3_rev` was created and dropped; the shared `postgres` database on
127.0.0.1:54322 was read only (`select version from supabase_migrations.schema_migrations` →
`00571, 00568, 00567, …`) and never reset, migrated or written to.
