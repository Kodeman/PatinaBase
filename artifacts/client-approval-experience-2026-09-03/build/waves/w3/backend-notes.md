# Wave 3 — backend lane notes ("She sets the pace")

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-cae-w3-backend`,
branch `approvals/w3-backend`, base `42d9057e45bbcc8e4eee4794ed15ef20314fae1b`.
Items: P-28 (all six parts), P-27, the Wave-1 digest-copy carry, W2-n4
(whyAuthorName), and the receipt-push silence verification.

## One migration: `00572_she_sets_the_pace.sql`

Minted from `env.md`'s `mintFrom = 00572` (the peer program `studio-invoices`
holds 00571). Grafted bodies, both from **00569** — the winner of
`grep -rln "CREATE OR REPLACE FUNCTION[^(]*<name>" supabase/migrations/*.sql | sort | tail -1`:

| function | grafted from | delta |
|---|---|---|
| `notify_client_attention` | 00569 | the push envelope learns `deliver_after`, and is not dispatched when it is set |
| `_create_project_approval_decision_checked` | 00569 | one line: the why's author resolves through `_why_author_display_name` |

### What it does, in the file's own order

1. **`notification_time_zone(user_id)`** — one zone resolver for every
   arithmetic in the wave.
2. **The three cadences.** `reminder_cadence` was TEXT + CHECK (00278), not an
   enum, so no ADD-VALUE isolation was needed. Widened to
   `right_away | daily | weekly_sunday`; `immediate → right_away`,
   `daily_digest → daily` backfilled; **DEFAULT moves to `daily`**; a BEFORE
   trigger keeps normalising the two retired spellings so a portal running
   yesterday's build still writes a legal value (migrations land before portals
   do). The digest-due partial index is rebuilt on the new predicate.
3. **`decision_snoozes` + `set_decision_snooze(p_decision_id, p_kind)`** —
   RLS in the same file (owner-only select/insert/update/delete, service_role
   all), explicit REVOKE/GRANT, pinned `search_path`. One standing snooze per
   person per approval (`UNIQUE (user_id, decision_id)`); choosing again
   replaces. The RPC refuses any caller the approval is not addressed to (the
   frozen decision lead on Stage-2, the relationship's client on a legacy
   choice) — a studio co-member cannot silence the person being asked.
4. **The push window.** `notification_log.deliver_after` (new, nullable) +
   `push_deliver_after()` + `release_due_client_pushes()` +
   `client-push-window-release` every 15 minutes. Outside 8am–8pm local the
   envelope is written with the next 8am local and left for the release; the
   in_app row is written and delivered exactly as before.
5. **The quiet.** `record_decision_studio_handoff()` writes ONE designer-facing
   `notification_log` in_app row — the rail `packages/supabase/src/hooks/
   use-inbox.ts` already reads — saying "Patina has stopped reminding {client};
   it is yours to chase." Idempotent.
6. **The first-notice retry sweep.** `decision_first_notice_attempts` +
   `_decision_first_notice_sweep_cutoff()` + `sweep_decision_first_notices()` +
   `decision-first-notice-retry-sweep` every 30 minutes.
7. **W2-n4.** `_why_author_display_name()` (display_name, else the whole
   full_name) used by the creating RPC and by
   `backfill_why_author_display_names()`, which re-attributes existing rows from
   the approval's immutable `created` receipt.

### Three decisions worth a reviewer's eye

- **The default cadence is `daily`, not `right_away`.** The vision refuses dark
  defaults: "the quietest cadence that still gets a real decision to her on
  time." `weekly_sunday` cannot promise that (an approval issued Monday and due
  Wednesday would be mailed the following Sunday). `daily` can, because this
  wave makes the first notice and the overdue notice **break the digest**
  (ux/03 §6.2). Existing rows are mapped forward, never re-defaulted.
- **The zone ladder ends at `America/New_York`, not UTC.** The brief offered
  "notification_preferences.timezone, else the profile's, else UTC". `public.
  profiles` carries **no** timezone column (checked in
  `information_schema.columns`), so there is no profile rung. The last rung is
  the rail's own `DEFAULT_TIME_ZONE` (`_shared/decision-notify.ts`) and the
  column default of `notification_preferences.timezone` (00040) — otherwise the
  same person is a New Yorker to the date on her letter and a Londoner to the
  hour her phone may ring, and an 8am-UTC release is a 3am buzz. It only ever
  applies to someone with no preferences row at all.
- **`decision-reminders-daily` (09:00 UTC) becomes `decision-reminders-hourly`.**
  The Sunday rule owes her a Monday letter "at 8am local"; 09:00 UTC is 4am on
  the US east coast, so a not-before-8am-local gate on a daily cron would have
  held every American reminder every day, forever. Hourly, the gate releases at
  the first pass at or after 8am in her zone. Dedupe is per-decision and
  unchanged (`reminder_sent_at` + the `{decisionId, notice}` log key), so
  twenty-four passes send no more letters than one did.
- **The backfill lifts one trigger.** `project_approval_artifacts` is
  UPDATE-immutable by `guard_project_approval_evidence_edge` (00463, no escape
  hatch), so `backfill_why_author_display_names()` disables
  `a_guard_project_approval_artifact_edge_trg` for the length of one statement
  and re-enables it even if that statement raises. This is a repair of a
  rendering the ruling calls wrong — 00569's own comment says the freeze exists
  so a later *rename* cannot rewrite what she read; a repair is not a rename.

## Edge functions

- **`_shared/decision-notify.ts`** — `decisionMailHold()` is one pure function
  carrying all of R16: overdue always sends (breaking cadence, snooze, Sunday
  and the morning gate); after an overdue notice nothing further about that
  approval goes out; a snooze holds everything except the overdue notice and a
  superseding edition; the first notice and a superseding edition break the
  digest; no automated approval mail on Sunday or before 8am local. Two small
  lookups (`decision_snoozes`, `decision_notifications`) feed it, and both fail
  open — a snooze that cannot be read must not become a silence nobody asked
  for. P-27's letter renders here too.
- **`decision-first-notice`** — new `logic.ts` (`resolveSupersededEdition`)
  resolves the predecessor by `predecessor_decision_id` and subtracts the two
  frozen artifacts' three deltas. Absent evidence yields an absent sentence: an
  unanswered predecessor names no answer, a missing artifact yields no delta,
  and the letter falls back to the ordinary first notice.
- **`expire-decisions`** — calls `record_decision_studio_handoff` once the
  overdue notice has landed.
- **`notification-digest`** — scans both batching cadences; `weekly_sunday`
  fires only on Sunday **in her zone**, with a 7-day window and a 6-day
  min-interval. Headings split on `approval_contract` ("Approvals that need
  you" / "Choices that need you"); the subject counts in words ("One reminder
  from Patina" / "A few reminders from Patina"); `decision_overdue` is no longer
  batched (it always mails direct now), and any approval past its overdue notice
  is dropped from the summary.

**Deploy set** (transitive closure of importers of `_shared/decision-notify.ts`
∪ edited dirs): `decision-first-notice`, `decision-reminders`,
`decision-resolved-notify`, `expire-decisions`, `notification-digest`.
`invoice-reminders` names decision-notify only in a prose comment explaining why
it is exempt — no import, excluded (same finding as Wave 2). Portals:
`client-portal` (the cadence picker + regenerated types).

## The receipt push: verified silent, no fix needed

00569 already writes a `metadata.kind = 'decision_receipt'` row already opened,
with **no push envelope written and nothing handed to apns-send** — so there is
no sound and no badge to increment. The regrafted body preserves it byte for
byte, and `she_sets_the_pace_test.sql` §5 now pins it from this side too.

## Verification

Validated against a **scratch database** (`patina_w3` on the shared local
Postgres) — the shared `postgres` database was never reset, migrated or written
to, per `stack-reset-notice.md`. Built as
`pg_dump --no-owner --exclude-schema=cron postgres | psql -d patina_w3`, then
00569 (absent from the shared stack: its ledger tail is `00571, 00568, 00567`),
then 00572.

**Two harness notes for the integration steward.** (a) `--exclude-schema=cron`
is load-bearing: pg_cron cannot be installed outside the cluster's
`cron.database_name`, and a failed `COPY cron.job` desyncs psql's parser badly
enough to swallow every later COPY — the first restore silently landed **zero**
public rows. A stub `cron.job` + `cron.schedule`/`cron.unschedule` stands in so
the guarded-cron block is really exercised. (b) `COMMENT ON EXTENSION pg_cron`
now also guards `undefined_object` beside `insufficient_privilege`.

| Gate | Result |
|---|---|
| scratch apply, clean DB | `psql -v ON_ERROR_STOP=1 -f 00572…` → **exit 0**, 0 errors |
| idempotency | second apply on the same DB → **exit 0**, 0 errors |
| `supabase/tests/notifications/she_sets_the_pace_test.sql` (new, 8 sections) | **PASS** |
| `supabase/tests/workflow/approval_authority/*` (6 files, incl. 00569's) | **6 PASS** |
| `supabase/tests/notifications/client_attention_test.sql` | **PASS** |
| regression sweep, `document/` + `rls/` + `commercial/` (44 files) vs a 00572-less baseline DB | **no regressions** — 9 pre-existing failures reproduce identically on the baseline |
| `deno test --config … --allow-env --allow-read _shared/ decision-reminders/ decision-first-notice/ notification-digest/ expire-decisions/ apns-send/` | **253 passed, 0 failed** |
| `deno test … _tests/apns-send.test.ts _tests/client-attention-deep-links.test.ts` | **42 passed, 0 failed** |
| `deno check --config …` on all 9 touched function files | clean |
| `pnpm --filter @patina/supabase type-check` | **PASS** |
| `pnpm --filter @patina/shared type-check` · `@patina/types build` | **PASS** |
| `pnpm --filter @patina/notifications test` | **89 passed** |
| `pnpm --filter @patina/client-portal type-check` | **PASS** |
| `pnpm --filter @patina/client-portal test -- --testPathPattern details-sheet` | **34 passed** |
| `database.types.ts` | regenerated; **+117 / −0** |
| `seed/00-legacy-grants.sql` | regenerated (`generate-legacy-grants.py`), **+156 / −0** |
| no `deno.lock` left at the repo root or in the worktree | confirmed |

**Types were merged, not pasted.** The scratch DB carries the peer program's
00571 (from the dump) and would have written its tables into the generated file.
The committed delta is the isolated `types(scratch+00572) − types(scratch−00572)`
patch applied to `HEAD`'s file: 117 additions, zero deletions, every one of them
`decision_snoozes`, `decision_first_notice_attempts`, `deliver_after`, or one of
the seven new functions.

## Owed / advisories

1. **Two tests now depend on 00572.** `00569_why_viewer_role_receipt_contract_
   test.sql` expects `'W2 Designer'` / `'Peer Ashford'` where it expected `'W2'`
   / `'Peer'`; it fails on a stack without 00572. That is the W2-n4 change, and
   the file travels with the migration.
2. **Cross-lane touch.** The client portal's cadence picker
   (`threshold/details-sheet.tsx`) had to move with the column, or
   `@patina/client-portal type-check` breaks on the narrowed `ReminderCadence`.
   Three options, labelled in her words. If the web lane also touched that file,
   integration should take the web lane's labels and keep these three values.
3. **`packages/shared`'s `reminderCadenceSchema` still accepts the two retired
   spellings** on purpose, so an older client's write validates and the trigger
   normalises it. Narrow it once every surface has shipped.
4. **Push rows can rest in `sending`.** `release_due_client_pushes` claims a row
   before dispatch so a re-run cannot double-ring; where APNs is unconfigured,
   apns-send returns `{skipped}` without stamping and the row stays `sending`.
   That is deliberate (no retry storm) but it is not a delivery record.
5. **The 8pm side of the floor is push-only**, per the brief ("only the push leg
   honors the 8am–8pm window"). Mail is held on Sunday and before 8am local and
   released at 8am; an email landing at nine at night wakes nobody. Say so if
   the ruling meant both legs.
6. **The sweep's cutoff is a constant**, `2026-09-05T00:00:00Z` — the day 00568
   landed on main with the Wave-1 integration merge. `supabase_migrations.
   schema_migrations` carries no applied-at column, so there is nothing to read
   it from; a later repair moves
   `_decision_first_notice_sweep_cutoff()`.
7. **Not done, and not mine:** nothing was applied to Strata, the shared local
   stack was not reset or written to, and no iOS/web surface for the snooze was
   built (the RPC is there for those lanes).

---

# Round 1 fixes — 2026-09-05

Eight findings (two blockers, six majors) from `backend-review-r1.md`. All eight
are addressed. `00572_she_sets_the_pace.sql` was edited IN PLACE — it has never
been applied to Strata and lives only on this unmerged branch, so fixing forward
into a 00573 would have shipped a file whose first version was wrong.

| id | what changed |
|---|---|
| B1 | `notification-digest` reads `decision_snoozes`. `collectItems` now drops a snoozed approval from the summary through a new pure `dropSnoozedDecisions`, fed by one `decision_snoozes` query per reader (fails open, same as the mail gate). R16's superseding-edition exception needs no clause here: a successor is its own `client_decisions` row with its own id, so a snooze set on the edition she answered cannot reach it, and the announcement mails direct rather than batching. |
| B2 | `proposal-nudge` stopped testing `reminder_cadence === 'daily_digest'`, a value 00572 makes impossible. New `proposal-nudge/logic.ts` exports `nudgeRoutesToDigest`, which tests the cadence's SHAPE through the shared `normalizeReminderCadence` — every cadence but `right_away` batches. A reader with NO preferences row keeps the direct letter she always had. **`proposal-nudge` joins the deploy set** (it now imports `_shared/decision-notify.ts`). |
| M3 | `isDigestDue` gained the letter's own hours: never before 8am local, and never on Sunday except for `weekly_sunday`. That is impossible on a once-a-day cron (15:00 UTC is 07:00 in California in winter), so **`notification-digest-daily` becomes `notification-digest-hourly`** (`20 * * * *`), mirroring what this wave already did to `decision-reminders`. The 20-hour and six-day min-intervals are untouched, so twenty-four passes still send one summary. New `digestWindowStart` stretches the window back to the last summary actually sent (capped at a fortnight) so the Sunday skip does not drop Saturday's reminders through the floor. |
| M4 | `release_due_client_pushes` no longer rings about an ask she answered while the envelope waited. Each due row is dispatched only while its bell row is still unopened AND (for a decision) the decision is still `pending`; anything else is retired as `suppressed` with `metadata.release_skipped`, not left queued forever. `entity_id` is compared as text so a malformed envelope cannot raise a cast error inside a cron. |
| M5 | The gate now runs BEFORE the spine RPC in `deliverDecisionNotification`, and `shouldFireDecisionInApp` decides whether the row may be re-armed. A STANDING quiet (`snoozed`, `quiet_after_overdue`, `type_disabled`, `email_channel_disabled`) leaves an existing line exactly as she left it — no unread pop, no refreshed `created_at` holding it in the digest window. `cadence_digest` deliberately still re-arms: the digest is built from that row's own freshness, and suppressing it would have silenced every batching reader. The hours-long holds (Sunday, before her morning, her quiet hours) also still re-arm; they lift by themselves and their letter then stamps the approval out of the cron's window. A decision with NO row always gets one — R16 defers the push, never the record. |
| M6 | `backfill_why_author_display_names()` resolves an inherited why to its COMPOSER, not to the designer who reissued the edition. A recursive walk up `predecessor_decision_id` stops at the deepest ancestor still carrying the same sentence and reads that decision's immutable `created` receipt. A line re-asked on a reissue differs from its predecessor's, stops the walk at depth 0, and is signed by whoever re-asked it. |
| M7 | `sweep_decision_first_notices` covers EVERY decision put to the client, not only Stage-2 approvals — 00568's trigger announces every one of them and this wave's Sunday/8am gates can hold any of those letters. Frozen evidence is still required where the contract requires it; the publish moment reads `COALESCE(sent_at, created_at)`. |
| M8 | `_decision_first_notice_sweep_cutoff()` stopped being a guessed constant. `decision_first_notice_sweep_state` records the cutoff ONCE when 00572 applies, as `GREATEST('2026-09-05T00:00:00Z', now())`. Migrations apply in order, so that moment is provably at or after 00568's own: the sweep cannot mail a back catalogue whatever date the constant claimed. Cost: an approval published between the two applies that missed its letter gets no retry — and the 72-hour window stops that binding three days after the file lands. |

## Deploy set (revised)

`decision-first-notice`, `decision-reminders`, `decision-resolved-notify`,
`expire-decisions`, `notification-digest`, **`proposal-nudge`**.
Portals: `client-portal` (cadence picker + regenerated types).

## Gates — round 1

Scratch database `patina_w3` on the shared local Postgres, rebuilt this round
**keeping ACLs** (`pg_dump --no-owner --exclude-schema=cron`, no `--no-acl`).
That is a correction to the previous round's harness note: with `--no-acl` every
grant-posture assertion in the approval-authority suite fails for the wrong
reason. The shared `postgres` database was never reset, migrated or written to.

| Gate | Result |
|---|---|
| scratch apply (`psql -v ON_ERROR_STOP=1 -f 00572…`) | **exit 0** |
| second apply, same DB (idempotency) | **exit 0** |
| `cron.job` after apply | `decision-reminders-hourly 0 * * * *` · `notification-digest-hourly 20 * * * *` · `client-push-window-release */15 * * * *` · `decision-first-notice-retry-sweep */30 * * * *` |
| `decision_first_notice_sweep_state.cutoff_at` | `2026-09-06 00:34:26+00` (the apply moment, later than the constant) |
| `she_sets_the_pace_test.sql` (now 10 sections) | **PASS** |
| `workflow/approval_authority/*.sql` (6 files) | **6 PASS** |
| `notifications/client_attention_test.sql` | **PASS** |
| `deno test --config … _shared/ decision-reminders/ decision-first-notice/ notification-digest/ expire-decisions/ proposal-nudge/` | **262 passed, 0 failed** |
| `deno test … _tests/apns-send.test.ts _tests/client-attention-deep-links.test.ts` | **42 passed, 0 failed** |
| `deno check --config …` (8 touched files) | clean |
| `pnpm --filter @patina/supabase type-check` | **PASS** |
| `pnpm --filter @patina/notifications test` | **89 passed** |
| `pnpm --filter @patina/client-portal type-check` | **PASS** |
| `database.types.ts` | **+15 / −0** (`decision_first_notice_sweep_state` only; the peer program's 00571 noise in the scratch dump was excluded by hand, same method as round 0) |
| `seed/00-legacy-grants.sql` | regenerated, **+12 / −0** |
| no `deno.lock` at the repo root or in the worktree | confirmed |

## New SQL test sections

- **§9** builds a real supersession chain inside the fixture — a second studio
  member ("Marta Ashford") reissues two of Leah's approvals, once in silence and
  once re-asking the why — then puts all three names back to the given names
  00569 would have frozen and watches the backfill resolve each one correctly.
- **§10** mints a push for a legacy decision, holds it, closes the decision
  through 00399's own write lever, and asserts the release retires the envelope
  instead of ringing.
- §4 gained the answered-bell case; §6 gained the legacy sweep candidate and the
  recorded cutoff.

## Owed / advisories, round 1

1. **`session_replication_role` is not available inside a DO block** on this
   stack (`postgres` is not a superuser; the file-level `SET LOCAL` is granted,
   `set_config()` inside plpgsql is not). §10 uses 00399's
   `app.client_decision_write_id` lever instead — the same one the product uses.
2. **The digest cron moved**, so the integration steward should expect
   `notification-digest-daily` to be gone from `cron.job` on the shared stack
   after the reset, replaced by `notification-digest-hourly`.
3. Round-0 advisories 3, 4, 5 and 7 stand unchanged. Advisory 6 is closed by M8.

---

# Round 2 fixes — 2026-09-05

Six findings (one blocker, five majors) from `backend-review-r2.md`. All six are
addressed. `00572_she_sets_the_pace.sql` was edited IN PLACE again, for the
same reason as round 1: it has never been applied to Strata and lives only on
this unmerged branch.

| id | what changed |
|---|---|
| **B-R2-01** | The sweep's only stop condition was a `notification_log` row, and there are **nine ordinary paths that write none** — the worst of them a legacy client with no auth profile, whose letter SENDS (`send-email.ts:391`, `shouldLog = Boolean(options.userId …)`) and logs nothing, so the same announcement went out every thirty minutes for seventy-two hours. `decision-first-notice` now reports what its attempt came to, through the new `record_decision_first_notice_attempt(uuid, text)` RPC, on EVERY run — the sweep's and 00568's publish trigger's alike. A **terminal** disposition (`_decision_first_notice_disposition_is_terminal`: `sent`, `already_sent`, `no_recipient_email`, `suppressed`, `cadence_digest`, `snoozed`, `quiet_after_overdue`, `type_disabled`, `email_channel_disabled`) ends the sweep for that approval. The trigger's own run normally writes `sent` before the sweep ever looks. |
| **M-R2-02** | `notification-digest` drops any approval whose own letter went out inside the window (`decisionsMailedDirect` + the pure `directlyMailedDecisionIds` / `dropDirectlyMailedDecisions`). The first notice and a superseding edition break the digest and mail direct, so on the new DEFAULT cadence the ask announced at four in the afternoon was listed again in the next morning's summary — two letters about one approval inside a day, which ux/03 §282 forbids. Only a status that means the letter actually left counts (`failed` and `suppressed` do not silence the summary), and the lookup fails open. |
| **M-R2-03** | `shouldFireDecisionInApp` now re-arms the bell row for exactly two reasons: the letter is going out on this pass, or it has been handed to the digest (which is built from that row's own freshness). **Every** other hold — her snooze, the quiet after the overdue notice, Sunday, before her morning, her own quiet hours — leaves the line exactly as she left it. `STANDING_QUIET` is gone. A decision with no row still always gets one: R16 defers the push, never the record. |
| **M-R2-04** | `decision_first_notice_attempts.attempts` is read at last, as a hard ceiling (`>= 96`, forty-eight hours of passes — longer than the longest hold this wave can impose, a Saturday-evening publish held by the Sunday rule until Monday 8am local, about thirty-six hours) under the terminal disposition. The table comment and the migration banner say what is actually true: the mail log is not a sufficient stop condition, and here is the list of paths on which it writes nothing. |
| **M-R2-05** | The two EMAIL switches stopped deciding the bell. `deliverDecisionNotification` keeps them apart now: `emailClosed` (`type_disabled` / `email_channel_disabled`) answers only for the letter, and `timingHold` — `decisionMailHold`'s answer plus her quiet hours — is the only thing the bell's re-arm reads. The reported `reason` order is unchanged, so every caller reads back what it read before. The re-arm is gated on `channels_in_app` instead, so a reader whose only remaining channel is the bell has it re-armed by every pass that would have mailed her, and a reader who closed the bell keeps the line she has. |
| **M-R2-06** | `set_decision_snooze`'s `when_due` lifts at `next_local_morning(zone, due_date − 1 day − 1 minute)` — the last 8am local strictly before the due moment — instead of at `due_date` itself. `decision-reminders` only reaches a decision while its date is still ahead (`due_date` BETWEEN now AND now+48h), so a hold expiring at the due moment had no pass left to land in and the next thing she heard was the overdue register. `next_local_morning` returns the first 8am at or after its argument, so the result always falls strictly inside `(due − 24h, due)`: on the day, with the date still ahead of it, inside the reminder cron's window. |

## Deploy set (unchanged from round 1)

`decision-first-notice`, `decision-reminders`, `decision-resolved-notify`,
`expire-decisions`, `notification-digest`, `proposal-nudge`.
Portals: `client-portal` (cadence picker + regenerated types).

`decision-first-notice` and `notification-digest` are edited directly this
round; the rest ride the `_shared/decision-notify.ts` change.

## Gates — round 2

Scratch database `patina_w3` on the shared local Postgres, rebuilt this round
by the same recipe (`pg_dump --no-owner --exclude-schema=cron postgres`, ACLs
kept, a stub `cron.job` + `cron.schedule`/`cron.unschedule` standing in), then
00569, then 00572. The shared `postgres` database was never reset, migrated or
written to — its ledger still reads `00571, 00568, 00567` after this pass, and
the scratch database was dropped at the end.

| Gate | Result |
|---|---|
| scratch apply (`psql -v ON_ERROR_STOP=1 -f 00572…`) | **exit 0** |
| second apply, same DB (idempotency) | **exit 0** |
| `cron.job` after apply | `client-push-window-release */15 * * * *` · `decision-first-notice-retry-sweep */30 * * * *` · `decision-reminders-hourly 0 * * * *` · `notification-digest-hourly 20 * * * *` |
| `decision_first_notice_attempts` shape | `decision_id` · `attempts` · `last_attempt_at` · **`disposition`** |
| `she_sets_the_pace_test.sql` (§6b new) | **PASS** — "all assertions passed" |
| `workflow/approval_authority/*.sql` (6 files) | **6 PASS** (exit 0 each) |
| `notifications/client_attention_test.sql` | **PASS** |
| `deno test --config … _shared/ decision-reminders/ decision-first-notice/ notification-digest/ expire-decisions/ proposal-nudge/` | **270 passed, 0 failed** (was 262) |
| `deno test … _tests/apns-send.test.ts _tests/client-attention-deep-links.test.ts` | **42 passed, 0 failed** |
| `deno check --config …` (8 touched files) | clean |
| `pnpm --filter @patina/supabase type-check` | **PASS** |
| `pnpm --filter @patina/notifications test` | **89 passed** |
| `pnpm --filter @patina/client-portal type-check` | **PASS** |
| `database.types.ts` | **+11 / −0** (`disposition` on the attempts table, and the two new functions; the peer program's 00571 noise in the scratch dump was excluded by hand, same method as rounds 0 and 1) |
| `seed/00-legacy-grants.sql` | regenerated, **+24 / −0** |
| no `deno.lock` at the repo root, in `supabase/` or in `supabase/functions/` | confirmed |

## New test coverage

- **SQL §6b** — the grant posture on `record_decision_first_notice_attempt`
  (no browser, no signed-in reader), the terminal/retryable split, the report
  back recorded without inflating the sweep's own pass count, a `sent`
  disposition removing an approval from the selection (4 → 3 candidates), the
  96-pass ceiling, and one pass short of it under a hold that lifts.
- **SQL §3** — `when_due` now asserts the hold lifts strictly BEFORE the date,
  inside the day before it, at eight in her own morning.
- **deno** — five new cases on `firstNoticeDisposition` (a letter that went with
  nothing to log it; a refused address vs the hourly cap; the three holds that
  lift; the seven handled answers that end the sweep; an unreadable failure);
  two on the digest's direct-mail drop; and `shouldFireDecisionInApp` rewritten
  into two tests, one per rule.

## Owed / advisories, round 2

1. **The dateless `when_due` branch is not exercised in SQL.** `due_date` is
   frozen evidence and the only lever that clears one is
   `session_replication_role`, which this stack refuses inside a DO block
   (round-1 advisory 1). The branch is a one-line CASE returning `'infinity'`,
   and the `never` kind covers the same storage path.
2. **`decisionMailHold` now runs even when the email channel is closed**, so a
   reader with email off costs two extra reads per pass (`decision_snoozes`,
   `decision_notifications`). That is the price of the bell answering to its own
   switch; both queries are indexed point lookups.
3. **A reader with `channels_in_app` off still gets the first row written.**
   R16 says the record is never deferred; only the re-arm is hers to switch off.
4. Round-0 advisories 3, 4, 5 and 7 and round-1 advisories 2 and 3 stand
   unchanged. Advisory 6 is closed by M8; round-1 advisory 1 is restated above.
