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
