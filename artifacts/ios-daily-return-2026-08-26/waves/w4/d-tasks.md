# W4 · lane D — backend task list (00539 + the client's typed room)

Worktree `/Users/kody/Code/patina-merged/.codex/worktrees/agent-dr-w4-d`, branch `daily-return/w4-d`,
base `1cb71c346`. Owned set (`waves/w4/steward.md` §4): `supabase/migrations/00539_*.sql`,
`supabase/tests/**`, `packages/supabase/src/database.types.ts`, `supabase/seed/**`. Lane D owns the
local database for this wave — no other lane resets it.

Format per lane: exact files → the interface neighbours rely on → failing assertion → run (red) →
implement → run (green) → pathspec commit.

---

## Facts established before writing anything (all against the live local stack, at 00538)

| # | Fact | Evidence |
|---|---|---|
| F1 | **`saved_items.note` does not exist, and `saved_items.notes` does** — `text`, nullable, since `00055_saved_items.sql:29`. Full column list: `id, user_id, product_id, room_id, name, image_url, brand_name, price_in_cents, notes, source, created_at, updated_at, price_cents_at_save` | `information_schema.columns` |
| F2 | `saved_items.notes` carries **no comment** and **no length constraint**. The whole constraint set is `saved_items_pkey`, three FKs, and `saved_items_source_check` | `pg_constraint`, `col_description` |
| F3 | `saved_items` is **empty** on the local stack (0 rows, `max(char_length(notes))` NULL), so a CHECK added here validates against nothing locally | `select count(*), max(char_length(notes)) from saved_items` |
| F4 | The iOS **write** leg already sends the note: `CreateSavedItemPayload.notes: String?` (`Core/Network/RoomsAPIClient.swift:133`), backed by `TableItemModel.notes` (`:42`). Only the **read** leg is missing it — `RemoteSavedItem` (`:49-59`) decodes 9 fields and neither `notes` nor `price_cents_at_save` is among them | the files |
| F5 | `public.rooms` is **empty in the seed** (0 rows). No seed file inserts into `rooms` at all — `grep -rn "rooms" supabase/seed/*.sql` returns only `project_rooms`, `room_scans` and two grant lines | `select count(*) from rooms` |
| F6 | `client@patina.dev` = `a0000000-0000-0000-0000-000000000005`, deterministic in `seed/dev-accounts.sql:15`; her `profiles` row is written there too (`:114`) | the seed |
| F7 | Her project **Aspen Loft Refresh** already owns two `project_rooms` — `Dining Room` and `Living Room` — and **both carry `budget_cents = 0` and `committed_cents = 0`** | live query |
| F8 | `rooms` (`00019_roomplan_features.sql:12-63`) is owner-scoped: `user_id → profiles(id) ON DELETE CASCADE`; RLS on; `"Users can manage their rooms" FOR ALL USING (auth.uid() = user_id)` plus `"Designers can view client rooms"` through `designer_clients`. Dimensions are `FLOAT` **metres** (`width/length/height_meters`, `floor_area_sqm`, `volume_cbm`); `budget_cents integer` arrived with `00537:62` | the migrations |
| F9 | Migration tip is **00538**; `00539` is free. `_pending/00106` is unapplied and stays so | `ls supabase/migrations \| tail`, `schema_migrations` |
| F10 | `supabase/tests/**` is **not** real pgTAP — every file is a plain psql script, `BEGIN; … DO $$ … ASSERT … $$; ROLLBACK;`, run under `ON_ERROR_STOP=1`. W2's is `supabase/tests/rooms/house_on_today_test.sql` | the directory |
| F11 | `config.toml` carries **two** seed arrays, `[db.seed]` and `[remotes.staging.db.seed]`, kept in sync by hand under a stated derivation rule: *staging = local, minus `00-legacy-grants.sql`, minus `99-local-edge-settings.sql`, plus `cloudflare-phase1-staging.sql`* (`config.toml:52-59`, `:79-88`) | the file |

### F1 forces a deviation from the brief's literal wording — stated up front

The brief names `00539_saved_items_note.sql — ALTER TABLE saved_items ADD COLUMN IF NOT EXISTS note
text`. Column `note` (singular) genuinely does not exist, so that statement would **succeed** and mint
a *second* note column beside the `notes` that has held the fact since 00055 and that the iOS write
leg already populates (F4). Two columns for one fact is a data split, not a migration: the client
writes `notes`, a new reader of `note` would find every row NULL, and no honesty rule survives that.

So 00539 keeps the brief's **intent** — the saved row's note becomes a first-class, bounded,
documented column — on the column that already holds it. This is the shape 00535 already used when
the plan named a column that turned out to exist (`room_id`, `00535:22-27`: an `IF NOT EXISTS` no-op
kept for replay, and a banner paragraph saying why). Recorded for Fable in `waves/w4/d-notes.md` §1.

---

## Task 1 — `00539_saved_items_note.sql`

**Files**
- new `supabase/migrations/00539_saved_items_note.sql`
- new `supabase/tests/rooms/saved_item_note_test.sql`

**Interface neighbours rely on**
- H2's Saved row prints *save date · room · note* (B §3). It reads `saved_items.notes` on the server
  leg, once H1 adds the field to `RemoteSavedItem` (F4 — filed as an integration note, not D's file).
- H1/W1b's save path must stay legal: the CHECK must accept NULL and every note the app can write.
- `packages/supabase/src/database.types.ts` gains nothing new (the column already exists) — Task 3
  proves that by a clean `git diff --exit-code` after a regen, which is the evidence, not a skip.

**Content**
1. `ALTER TABLE public.saved_items ADD COLUMN IF NOT EXISTS notes text;` — a no-op at or past
   00055:29, present only so a replay from an older baseline lands the same shape (00535's pattern).
2. Drop-then-add the length constraint (Postgres has no `ADD CONSTRAINT IF NOT EXISTS`, so
   `DROP CONSTRAINT IF EXISTS` + `ADD CONSTRAINT` is the idempotent pair):
   `CHECK (notes IS NULL OR char_length(notes) <= 2000)`.
3. `COMMENT ON COLUMN public.saved_items.notes` — what it is, who writes it, and that an unset note
   is silence rather than an empty string on the row.
4. No GRANT, no REVOKE, no function, no policy ⇒ `scripts/generate-legacy-grants.py` is **not**
   re-run. Assert by inspection: `grep -c 'GRANT\|REVOKE' 00539_saved_items_note.sql` = 0.
5. Banner records the F1 deviation, and records that the CHECK **validates existing rows** — on a
   stack that already holds a note longer than 2000 characters the migration fails loudly rather than
   truncating anyone's words. Local is 0 rows (F3); nothing is asserted about Strata.

**Failing assertions first** (`supabase/tests/rooms/saved_item_note_test.sql`, repo style per F10):
- `saved_items.notes` exists, is `text`, is nullable, and carries a comment.
- a note of exactly 2000 characters is **accepted**.
- a note of 2001 characters raises `check_violation`.
- `NULL` is accepted (an unset note is silence).
- the empty string is accepted at the database — the rule that a row prints no note line rather than
  an empty one is the client's, and the test says so rather than implying the column enforces it.
- `saved_items.note` (singular) **does not exist** — the assertion that keeps a later reader from
  re-minting the duplicate F1 describes.

**Run red** → `psql -v ON_ERROR_STOP=1 -f supabase/tests/rooms/saved_item_note_test.sql` fails on the
comment/constraint assertions. **Implement** → `supabase db reset`. **Run green** → same command
passes, plus W2's `house_on_today_test.sql` still passes (00539 must not disturb 00537's indexes).

---

## Task 2 — one typed room for `client@patina.dev`

**Files**
- new `supabase/seed/client-rooms.sql`
- `supabase/config.toml` — both seed arrays (F11)

**Interface neighbours rely on**
- H1 draws "Your house" from project rooms **and** the rooms the client typed. Today the local half is
  empty on every fresh stack (F5), so the wave's central surface has nothing local to render and the
  walk cannot tell a real empty from a broken read.
- The row must satisfy `rooms`' owner RLS as `client@patina.dev` (F8) — `user_id` is her profile id.

**Content** — exactly one `rooms` row, fixed id `c0000000-0000-4000-8000-000000000001`,
`ON CONFLICT (id) DO NOTHING`, wrapped in a guard that skips silently when her profile is absent
(so the file is safe in any seed order):

| Column | Value | Why |
|---|---|---|
| `user_id` | `a0000000-0000-0000-0000-000000000005` | F6 |
| `name` | `Guest Bedroom` | **not** `Living Room`/`Dining Room` — those two names are already taken by her project rooms (F7), and a rail showing two cards called "Living Room" would make the walk unreadable. The point of the row is that a walker can name which card is the typed one. |
| `type` | `bedroom` | 00019's vocabulary |
| `length_meters` / `width_meters` / `height_meters` | `4.57` / `3.66` / `2.74` | 15 × 12 ft, 9 ft ceiling — metres, because that is the column's unit (F8) |
| `floor_area_sqm` | `16.73` | `round(4.57 × 3.66, 2)`, the same arithmetic `CreateRoomPayload` does on the device (`RoomsAPIClient.swift:80-85`), so a later sync writes the identical figure |
| `volume_cbm` | `45.83` | `round(4.57 × 3.66 × 2.74, 2)`, same rule |
| `budget_cents` | `900000` | $9,000 — the figure `mock/fragments/b-M4.html` prints. **A number stored, so a number may be drawn** (C5); the room draws `budget $9,000`, never a spend figure. |
| `scan_count` | `0` | the room is **typed, not scanned** — M4's own subtitle. Left at the column default rather than set, and the seed says so. |

No saved items are seeded into it: with zero saved pieces the room's stat line must read its budget and
nothing else, which is exactly the truthful-empty H1 has to get right.

**Wire it in** — `[db.seed].sql_paths` gains `'./seed/client-rooms.sql'` immediately after
`'./seed/leads_room_scans.sql'` (the rooms/scans neighbourhood; the only ordering requirement is
*after* `dev-accounts.sql`, which writes the profile the FK needs). Per F11's derivation rule the same
entry, at the same position, goes into `[remotes.staging.db.seed].sql_paths` — the rule adds and
removes only the three named files, and this is none of them.

**Assertion** — extend `saved_item_note_test.sql`? No: the seed is not migration surface. Prove it by
query after the reset instead (Task 4), and record the output.

---

## Task 3 — regenerate `database.types.ts`

`pnpm db:generate`, then `git diff --stat packages/supabase/src/database.types.ts`. 00539 adds no
column and no function, so the expected result is **no diff** — and the regen is what proves that
rather than an argument that it should be. If a diff appears, it is drift from an earlier wave and
gets reported, not silently committed.

## Task 4 — reset, gates, evidence

1. `supabase db reset` (unsandboxed) — replays 00001…00539 and all seed files clean.
2. `psql -v ON_ERROR_STOP=1 -f supabase/tests/rooms/saved_item_note_test.sql` — green.
3. `psql -v ON_ERROR_STOP=1 -f supabase/tests/rooms/house_on_today_test.sql` — still green.
4. Probe the objects, not the ledger: `information_schema.columns` for `notes`, `pg_constraint` for
   the CHECK, `col_description` for the comment, and a `select` of the seeded room as itself.
5. `ls supabase/migrations | tail` re-checked immediately before the final commit; renumber to 00540
   and re-reset if another lane has landed a 00539 in the meantime (steward §6).

## Task 5 — commits, notes, finish

Pathspec commits only:
- `supabase/migrations/00539_saved_items_note.sql supabase/tests/rooms/saved_item_note_test.sql`
- `supabase/seed/client-rooms.sql supabase/config.toml`

`waves/w4/d-notes.md` carries: §1 the F1 deviation, §2 the `RemoteSavedItem` decode gap for H1
(steward §4a, now measured), §3 `listRooms()` has **no caller** — the seeded room is inert until a
lane wires it — and §4 the `project_rooms` budget/committed zeros of F7, with the one line of SQL
that would fix them, for Fable to rule on rather than for D to take.

Then `rmdir .writer.lock.d`; `git status --porcelain -uno` empty.
