-- ═══════════════════════════════════════════════════════════════════════════
-- 00693 — Field capture mint carries the buy spec onto the product (C-17)
-- ═══════════════════════════════════════════════════════════════════════════
-- US-16 Phase 1 (SQ-401). direction §7 C-17, d3 §4.2.
--
-- commit_field_capture's library branch (00530:666-677, carried from 00235 and
-- 00516) mints a personal-library product from the capture row, but its
-- INSERT lists only name, category, subcategory, vendor_id, price_retail and
-- images. The capture row already holds sku, finish, materials, colors,
-- dimensions and price_trade_cents (the upsert at 00530:387-450 writes them),
-- so the mint drops them, and a field find reaches the schedule with no SKU,
-- no finish and retail written as trade (placement falls back
-- COALESCE(price_trade, price_retail), 00435:203).
--
-- ── WHY A TRIGGER AND NOT A `CREATE OR REPLACE commit_field_capture` ────────
-- Same reason as 00532:18-29 and 00669:15-19: commit_field_capture is a shared
-- object whose second author silently reverts the first, and its 00530 body
-- is ~500 lines of safe harbors. No `_impl` rename and no redefinition is
-- needed: the mint INSERT already sets products.field_capture_id and
-- capture_source = 'field_capture', so a BEFORE INSERT trigger on products
-- reads the capture row and fills the columns the mint left NULL. That stays
-- off the contested function entirely.
--
-- ── WHAT IS CARRIED (only into a column the INSERT left NULL / empty) ──────
--   field_captures.sku               → products.sku
--   field_captures.finish            → products.finish
--   field_captures.materials         → products.materials
--   field_captures.colors            → products.colors
--   field_captures.dimensions        → products.dimensions  ({width,height,depth,unit})
--   field_captures.price_trade_cents → products.price_trade (cents, like price_retail)
-- These are the product-master fields the buy-spec readers fall back to:
-- po-send's VendorProductMaster (sku, finish, materials, colors, dimensions)
-- and the spec book resolver's product tier. 00694 seeds the line's spec row
-- from the same columns at placement, which is how they reach the line.
--
-- ── GUARD ───────────────────────────────────────────────────────────────────
-- SECURITY DEFINER so the read does not depend on field_captures RLS, and
-- therefore copies ONLY from a capture whose designer_id is the new product's
-- owner_user_id. A personal product whose field_capture_id names somebody
-- else's capture copies nothing. The mint always satisfies this
-- (owner_user_id = designer_id = auth.uid(), 00530:672).
--
-- The trigger cannot raise on a well-formed capture: every source column has
-- the same type as its target. The library branch's own safe harbor
-- (00530:705) would park the capture in the inbox if it ever did.
--
-- No backfill: already-minted field products keep their columns. The
-- capture rows still hold the values if a backfill is ever ruled.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.products_carry_field_capture_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_capture public.field_captures%ROWTYPE;
BEGIN
  SELECT * INTO v_capture
    FROM public.field_captures
   WHERE id = NEW.field_capture_id
     AND designer_id = NEW.owner_user_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  NEW.sku         := COALESCE(NEW.sku, NULLIF(btrim(v_capture.sku), ''));
  NEW.finish      := COALESCE(NEW.finish, NULLIF(btrim(v_capture.finish), ''));
  -- products.materials defaults to '{}' (applied before this trigger), so an
  -- empty array counts as "left unset", like NULL.
  NEW.materials   := COALESCE(NULLIF(NEW.materials, '{}'::text[]),
                              NULLIF(v_capture.materials, '{}'::text[]), NEW.materials);
  NEW.colors      := COALESCE(NULLIF(NEW.colors, '{}'::text[]),
                              NULLIF(v_capture.colors, '{}'::text[]), NEW.colors);
  NEW.dimensions  := COALESCE(
    NEW.dimensions,
    CASE WHEN jsonb_typeof(v_capture.dimensions) = 'object'
              AND v_capture.dimensions <> '{}'::jsonb
         THEN v_capture.dimensions END
  );
  NEW.price_trade := COALESCE(NEW.price_trade, v_capture.price_trade_cents);
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.products_carry_field_capture_fields() IS
  'BEFORE INSERT on products (00693, C-17): when a field capture mints a product '
  '(capture_source = ''field_capture'', field_capture_id set), fills sku, finish, '
  'materials, colors, dimensions and price_trade from the capture row wherever the '
  'INSERT left them NULL. Copies only from a capture owned by the product''s '
  'owner_user_id. Keeps commit_field_capture (00530) untouched.';

REVOKE ALL ON FUNCTION public.products_carry_field_capture_fields() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_products_carry_field_capture_fields ON public.products;
CREATE TRIGGER trg_products_carry_field_capture_fields
  BEFORE INSERT ON public.products
  FOR EACH ROW
  WHEN (NEW.field_capture_id IS NOT NULL AND NEW.capture_source = 'field_capture')
  EXECUTE FUNCTION public.products_carry_field_capture_fields();
