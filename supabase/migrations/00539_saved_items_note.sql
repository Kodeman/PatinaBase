-- ═══════════════════════════════════════════════════════════════════════════
-- 00539 — the note on a saved row
--
-- W4 gives the Saved row its three facts: save date, room, and note
-- (direction-b §3, F197/F170). The first two have been columns since 00055
-- (`created_at`, `room_id`). The third has been one too — `notes`, 00055:29 —
-- but unbounded and undocumented, which is the whole of what this file fixes.
--
-- ⚠ The W4 brief named this column `note`, singular, and asked for
--   `ADD COLUMN IF NOT EXISTS note text`. `note` genuinely does not exist, so
--   that statement would have SUCCEEDED and minted a second home for one fact.
--   The iOS write leg already fills `notes` — `CreateSavedItemPayload.notes`,
--   `apps/mobile/Patina/Patina/Core/Network/RoomsAPIClient.swift:133`, backed
--   by `TableItemModel.notes:42` — so a reader of a new `note` column would
--   have found every row NULL and the app would have said nothing where the
--   person had written something. The note therefore stays where it lives, and
--   this migration hardens that column instead. Same shape 00535 used when the
--   build plan named `room_id` and `room_id` turned out to already exist
--   (00535:22-27).
--
-- Three statements, in order:
--
--   1. ADD COLUMN IF NOT EXISTS — a no-op at or past 00055:29. Kept so a replay
--      from an older baseline lands the same shape before the CHECK is added.
--
--   2. A named length CHECK, ≤ 2000 characters. Postgres has no
--      `ADD CONSTRAINT IF NOT EXISTS`, so the idempotent pair is DROP IF EXISTS
--      then ADD. NULL passes the CHECK explicitly (`notes IS NULL OR …`) rather
--      than by SQL's three-valued accident, so the intent is readable: an unset
--      note is silence.
--
--      ⚠ This CHECK VALIDATES EXISTING ROWS. On a stack already holding a note
--        longer than 2000 characters the migration FAILS rather than truncating
--        somebody's words — the loud failure is the correct one; nobody's note
--        gets shortened by a migration. Local is 0 rows at 00538, so nothing is
--        validated here; nothing is asserted about Strata.
--
--   3. A comment, so the next reader knows who writes the column and what an
--      absent note means.
--
-- No GRANT, no REVOKE, no function, no policy, no new table ⇒
-- `seed/00-legacy-grants.sql` is NOT regenerated, and the 00055 owner policies
-- ("Users can view/insert/update/delete their own saved items") already cover
-- every column of this table. Generated types do NOT drift either — the column
-- already existed at 00538 — and `database.types.ts` is regenerated in this
-- wave to prove that rather than to assume it.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. no-op at or past 00055:29; present for replay from an older baseline ─

ALTER TABLE public.saved_items
  ADD COLUMN IF NOT EXISTS notes text;

-- ─── 2. a note is a note, not an essay ──────────────────────────────────────

ALTER TABLE public.saved_items
  DROP CONSTRAINT IF EXISTS saved_items_notes_length_check;

ALTER TABLE public.saved_items
  ADD CONSTRAINT saved_items_notes_length_check
  CHECK (notes IS NULL OR char_length(notes) <= 2000);

-- ─── 3. what the column is ──────────────────────────────────────────────────

COMMENT ON COLUMN public.saved_items.notes IS
  'What the person wrote about this piece when she saved it, in her own words — the third fact on a Saved row, beside the save date (created_at) and the room (room_id). Written by the client apps only; nothing derives it and nothing generates it. NULL when she wrote nothing, and the row then draws no note line rather than an empty one — that rule is the client''s, not this column''s. Bounded at 2000 characters by saved_items_notes_length_check.';
