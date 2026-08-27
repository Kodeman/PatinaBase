-- ═══════════════════════════════════════════════════════════════════════════
-- 00537 — The house on Today
--
-- Three server-side gaps the Record home (W2) and its rails read, authored in
-- one file so W4 has no late mint.
--
--   1. rooms.budget_cents — the "Your house" rail names a room's budget when
--      the homeowner has set one, and says nothing when she has not (C5). The
--      column does not exist (verified against the local stack at 00536:
--      information_schema.columns has no rooms.budget_cents), so today the rail
--      has nothing truthful to draw and the alternative is an invented figure.
--      Money is integer cents, like every other *_cents column in this schema.
--
--   2. profiles.last_seen_at — the server's half of the return clock. The app's
--      own "new" tick comes from LastSeenStore on the device (W2 R1), never
--      from a day count shown to the person; this column is what a later
--      server-side surface (a widget refresh, a digest) would read so it does
--      not have to ask the device. NULL until something writes it, and nothing
--      in W2 does — the Record does not count days away at anyone.
--
--   3. saved_items uniqueness — SP-14's "no duplicate rows" is true in the
--      client (W1b lane A made the save idempotent) and false in the database:
--      saved_items carries no unique index at all (saved_items_pkey,
--      idx_saved_items_user, _room, _product, _created — that is the whole
--      set). Two devices saving the same piece in the same second, or a retry
--      after a dropped response, both write a second row. Fable's W1b ruling 4
--      makes it true at the database: de-duplicate keeping the EARLIEST row,
--      then two partial unique indexes.
--
--      Two indexes rather than one, because a save has two shapes and they are
--      different facts:
--        · saved to the Table, no room       → one row per (user, product)
--        · put in a room (SP-11)             → one row per (user, product, room)
--      A single index over (user_id, product_id, room_id) would not constrain
--      the unroomed shape at all — room_id is NULL there and NULLs are distinct
--      in a btree unique — so the exact duplicate SP-14 is about would still be
--      legal. The pair is disjoint on `room_id IS NULL`, so the same piece may
--      live on the Table AND in a room, and in two different rooms, which is
--      what the product does.
--
--      product_id is NULLABLE (00055:19 — "product may be deleted or
--      external"). Rows with a NULL product_id are unconstrained by both
--      indexes, by design: a save with no product reference has no key to be
--      the duplicate of.
--
-- NOT in this file: the client-scoped SELECT policy on project_rooms the build
-- plan held open. It already exists — 00066:249-253, "Clients can view their
-- project rooms", reachable by `authenticated` through PUBLIC role membership
-- and backed by a table grant. The W2 steward proved it against this database
-- before the lanes started (steward.md §5c): as client@patina.dev the policy
-- returns 2 of 2 project rooms on her own project, and 0 for a manufacturer and
-- 0 for anon. The plan's own instruction is to drop the migration when no
-- blocker exists (critique M4). None exists, so nothing is written here.
--
-- No GRANT, no REVOKE, no function, no policy in this file, so
-- seed/00-legacy-grants.sql is NOT regenerated. Generated types DO drift: two
-- new public columns. database.types.ts is regenerated in the same wave.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. a room can carry a budget ───────────────────────────────────────────

ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS budget_cents integer;

COMMENT ON COLUMN public.rooms.budget_cents IS
  'What the homeowner means to spend on this room, in integer cents. NULL when she has not said — and then the house rail says nothing rather than inventing a figure (C5). Set by the person who owns the room, never derived.';

-- ─── 2. the server's half of the return clock ───────────────────────────────

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

COMMENT ON COLUMN public.profiles.last_seen_at IS
  'The last time this person was seen in a Patina client, for server-side surfaces that cannot ask the device. The app''s own "new since you were here" tick reads LastSeenStore on the device, not this column, and nothing counts days away at the person (C5). NULL until something writes it.';

-- ─── 3. one save per piece ──────────────────────────────────────────────────

-- De-duplicate BEFORE the indexes, keeping the earliest row per key.
-- (created_at, id) is a total order, so the survivor is deterministic even for
-- rows written in the same transaction.

-- 3a. the unroomed shape: one save per (user, product) with no room.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, product_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
    FROM public.saved_items
   WHERE product_id IS NOT NULL
     AND room_id IS NULL
)
DELETE FROM public.saved_items AS item
 USING ranked
 WHERE item.id = ranked.id
   AND ranked.rn > 1;

-- 3b. the roomed shape: one save per (user, product, room).
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id, product_id, room_id
           ORDER BY created_at ASC, id ASC
         ) AS rn
    FROM public.saved_items
   WHERE product_id IS NOT NULL
     AND room_id IS NOT NULL
)
DELETE FROM public.saved_items AS item
 USING ranked
 WHERE item.id = ranked.id
   AND ranked.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS saved_items_user_product_unroomed_key
  ON public.saved_items (user_id, product_id)
  WHERE room_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS saved_items_user_product_room_key
  ON public.saved_items (user_id, product_id, room_id)
  WHERE room_id IS NOT NULL;

COMMENT ON INDEX public.saved_items_user_product_unroomed_key IS
  'W1b ruling 4 / SP-14: one save per piece on the Table. Partial on room_id IS NULL so it does not collide with the roomed key; rows with a NULL product_id are unconstrained (00055:19 — the product reference is optional).';

COMMENT ON INDEX public.saved_items_user_product_room_key IS
  'W1b ruling 4 / SP-11: one save per piece per room. Disjoint from the unroomed key, so the same piece may sit on the Table and in a room, and in two different rooms.';
