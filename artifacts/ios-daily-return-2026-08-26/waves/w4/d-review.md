# W4 · lane D — review

Reviewer: separate context, read-only. Verified by reading the worktree diff (`main...HEAD` in
`/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w4-d`), the two new SQL files, the seed
file, the `config.toml` diff, `d-notes.md`, `d-tasks.md`, `steward.md`, `build-plan.md` §W4/§W2-DONE,
and cross-checking `h1-notes.md` for consistency. **Did not** run `supabase db reset` or start the
local stack — lane D is sole owner of the local database this wave and no stack was running; the gate
transcript's claims are checked against source, not re-executed. No prod/Strata touched by this review.

Commits reviewed: `69855ac93` (feat(db): 00539), `61991f39a` (chore(seed): client-rooms).

## Verdict

**No blocking findings.** The migration and seed are correct, idempotent, honesty-compliant, and
scoped tightly to the brief. The one deviation from the literal brief text (`note` → `notes`) is
correctly reasoned, evidenced, tested, and disclosed — it is the right call, not a shortcut. Two minor
process notes below, neither functional.

## What was checked against the brief

- **F1 deviation (`note` vs `notes`)** — verified independently: `saved_items` schema (00055:29) has
  had `notes` since inception; no `note` column exists anywhere in the migration history
  (`grep -rn "ADD COLUMN.*\bnote\b" supabase/migrations` finds nothing before 00539). The write leg
  (`CreateSavedItemPayload.notes`, `RoomsAPIClient.swift:133`) does write `notes`. Minting a second
  `note` column would indeed have silently orphaned the write leg from a same-named-but-different
  read column — the deviation is correct and the banner/commit/test all say so. Test assertion #6
  (`saved_items.note` must NOT exist) is the right guardrail against a later re-mint.
- **CHECK constraint arithmetic** — `notes IS NULL OR char_length(notes) <= 2000`; test proves 2000
  accepted, 2001 rejected via `check_violation`, NULL accepted, empty string accepted (correctly
  scoped as a database-level allowance, with the note that "no line if empty" is the client's rule,
  not the column's — this is an honest boundary statement, not a shortcut).
- **Idempotency** — `ADD COLUMN IF NOT EXISTS` (no-op past 00055) + `DROP CONSTRAINT IF EXISTS` then
  `ADD CONSTRAINT` (correct pattern; Postgres has no `ADD CONSTRAINT IF NOT EXISTS`). Matches the
  00535 precedent cited.
- **No unwarranted grants** — confirmed zero `GRANT`/`REVOKE` lines in 00539; existing 00055 owner
  policies already cover the column, so `seed/00-legacy-grants.sql` correctly untouched.
- **Seed room (`Guest Bedroom`)** — `user_id` matches `client@patina.dev`
  (`a0000000-0000-0000-0000-000000000005`, `dev-accounts.sql:15`). Name deliberately avoids colliding
  with the two existing `project_rooms` names (`Dining Room`, `Living Room`) — verified those two do
  exist on `Aspen Loft Refresh` via the migration/seed reasoning in F7; a walker will not see two
  identically-named cards. Arithmetic checks out: `4.57 × 3.66 = 16.7262 → 16.73`;
  `16.7262 × 2.74 = 45.829788 → 45.83` — both match `CreateRoomPayload`'s rounding rule as described.
  `budget_cents = 900000` matches `b-M4.html`'s printed figure (a stored number drawn, not derived —
  C5-compliant). `scan_count` correctly left at column default (typed, not scanned). No saved items
  seeded — correctly leaves the truthful-empty path for H1 to render.
- **Idempotent + order-safe seed** — fixed id, `ON CONFLICT (id) DO NOTHING`, guarded by a
  profile-existence check with a `RAISE NOTICE` skip rather than a hard failure. Safe to replay.
- **`config.toml` wiring** — `client-rooms.sql` added to both `[db.seed]` and
  `[remotes.staging.db.seed]` arrays, at the same position (immediately after
  `leads_room_scans.sql`), consistent with F11's stated derivation rule (the rule only adds/removes
  three named files; this is none of them, so mirroring it into staging is correct).
- **`rooms.budget_cents` really exists** — confirmed independently in `00537_house_on_today.sql:63`
  (`ADD COLUMN IF NOT EXISTS budget_cents integer`), so the seed's use of that column is not
  speculative.
- **`database.types.ts`** — absent from the commit diff, consistent with the claimed clean regen;
  00539 adds no column, so no diff is the expected and correct outcome.
- **Restraint on `project_rooms` (F7/d-notes.md §4)** — D correctly did **not** touch
  `decisions.sql`'s zero `budget_cents`/`committed_cents` on the client's two project rooms, despite
  having the file in its owned set and a ready one-line fix. It surfaced the tension (both project-room
  cards will hit the truthful-empty path, never the labelled-committed-number path B §11/M4 describes)
  as a ruling request rather than taking the liberty. This is the right call under `steward.md`'s "no
  lane edits a path without warrant" posture — flagging, not fixing, an out-of-brief change.
- **Scope discipline** — diff touches exactly 4 files (migration, test, seed, config.toml), all within
  or adjacent to D's owned set (see note below on config.toml). No iOS file touched — correct, since
  backend has no "both roots" surface to render. No Strata/prod command anywhere in the transcript or
  notes.
- **Commits** — Conventional Commits, pathspec-scoped (`feat(db): …` for migration+test,
  `chore(seed): …` for seed+config), matches the two-commit split `d-tasks.md` Task 5 specifies.
- **Finish hygiene** — `.writer.lock.d` absent (already removed); `git status --porcelain -uno` in the
  worktree shows only sandbox read-denial noise on `.env.example` files (this reviewer's sandbox, not
  real changes) — no uncommitted drift in the four owned files.

## Minor findings (non-blocking)

1. **Process, low severity, medium confidence** — `supabase/config.toml` is not listed in
   `steward.md` §4's OWNED-FILE MAP for lane D (only `supabase/migrations/00539_*.sql`,
   `supabase/tests/**`, `database.types.ts`, `supabase/seed/**` are granted). `d-tasks.md` Task 2
   explicitly directs the `config.toml` edit anyway, and no other W4 lane needed the file (H1/H2 are
   iOS-only), so there was no actual collision risk. Still, strictly by `steward.md`'s own rule ("no
   lane edits a path this file does not grant it"), this edit falls outside the letter of the grant.
   Worth a one-line addition to future stewards' file maps so seed-wiring edits to `config.toml` are
   explicit rather than inferred from the task list.

2. **Informational, low severity, low confidence (process only, not a D defect)** — the numbering
   consequence D's own report flagged ("D did mint 00539, so W5's backend shifts to 00540") is stated
   in the report text and in `steward.md` §6's pre-existing conditional rule, but is **not** written
   into `d-notes.md` itself. Because `steward.md` §6 already instructs the integration steward to
   `ls supabase/migrations | tail` and re-check before every merge, this is self-enforcing regardless —
   low risk — but a one-line entry in `d-notes.md` would make the fact discoverable without needing
   the original dispatch report.

3. **Informational — untouched carry-over, not assigned to D** — W2's carry-over list
   (`build-plan.md` §W2-DONE) names *"`Leah added two pieces to the proposal.` has no producer (a
   proposal-revision event, W4 or later)"* as a W4-or-later item. `d-tasks.md` never assigns this to
   lane D, and D's diff does not address it (no new event-producing trigger/function). Since the
   carry-over explicitly allows "or later," this is not a gap in D's delivered scope — flagging only
   so it stays visible as still-open across W4 as a whole, in case no other lane picked it up either.

## Not independently verified

- The literal gate transcript (`supabase db reset`, both `psql` test runs, the red-first proof, the
  RLS probe, the grants grep, the types-diff check) was not re-run by this review — no local stack was
  up and this role is read-only. Everything checked against source is internally consistent with the
  transcript's claims (migration content matches what the test asserts, the seed's arithmetic and IDs
  match what the transcript's "object probes" section reports, `rooms.budget_cents` really exists at
  00537 as claimed). Nothing found contradicts the transcript.
