-- ═══════════════════════════════════════════════════════════════════════════
-- 00535 — A save remembers what the piece cost that day
--
-- SP-14 / SP-12, server half. `saved_items` (00055) is the remote mirror that
-- lets a save survive a reinstall and reach a second device. It carries
-- `price_in_cents`, which mirrors what the piece costs TODAY — so nothing on
-- the Saved row can say what the reader agreed to when they saved it, and no
-- surface may invent that figure (C5).
--
-- ⚠ `room_id` was ALSO named for this migration by the build plan. It has
--   existed since 00055:23, nullable, referencing rooms(id) ON DELETE SET NULL
--   (critique m8). The ADD COLUMN IF NOT EXISTS below is therefore a no-op on
--   any stack at or past 00055; it is kept only so a replay from an older
--   baseline lands the same shape. The real delta in this file is one column.
--
-- No GRANT/REVOKE, no function, no policy change: the 00055 owner policies
-- ("Users can view/insert/update/delete their own saved items") already cover
-- every column, and the designer-read leg is unchanged.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.saved_items
  ADD COLUMN IF NOT EXISTS price_cents_at_save integer;

-- No-op at or past 00055:23; present for replay from an older baseline.
ALTER TABLE public.saved_items
  ADD COLUMN IF NOT EXISTS room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.saved_items.price_cents_at_save IS
  'Retail price in integer cents at the moment of saving. Distinct from price_in_cents, which mirrors what the piece costs today; the pair is what lets the app say a price moved without inventing a figure (C5). NULL when the price was unknown at save time — a guest save reconciled at sign-in, say — and the app then says nothing.';
