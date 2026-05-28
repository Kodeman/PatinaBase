-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00161: Studio → Catalog item linking (S3.8)
--
-- When a manufacturer onboards and their catalog products land, the
-- studio-layer items previously captured from that vendor need to
-- point to their catalog equivalents so designers can recognize the
-- relationship in the UI.
--
-- `catalog_equivalent_id` was added in migration 00152 (forward-looking
-- column from S1.1). This migration introduces the matcher:
--
--   link_studio_to_catalog_for_vendor(vendor_id) → INTEGER
--     Pairs studio.products with catalog.products by vendor_id +
--     case-insensitive name match. Returns the count of newly-linked
--     studio items. Idempotent — re-runs only touch unmatched rows.
--
-- A trigger on `vendor_nominations` fires the function whenever a
-- nomination reaches 'live'. It's a no-op when no catalog products
-- exist yet for that vendor (the manufacturer-portal flow that
-- creates them ships separately) — once they land, calling the
-- function (manually or via a future re-fire) sets the links.
--
-- v1 match rule is intentionally strict (lower(name) equality) so
-- we don't accidentally cross-link. A future tuning migration can
-- swap in trigram or vector similarity once the catalog has volume.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION link_studio_to_catalog_for_vendor(p_vendor_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linked INTEGER := 0;
BEGIN
  WITH candidates AS (
    SELECT studio.id AS studio_id, catalog.id AS catalog_id
      FROM products studio
      JOIN products catalog
        ON catalog.vendor_id     = studio.vendor_id
       AND catalog.layer         = 'catalog'
       AND lower(catalog.name)   = lower(studio.name)
     WHERE studio.layer                 = 'studio'
       AND studio.vendor_id              = p_vendor_id
       AND studio.catalog_equivalent_id IS NULL
  ),
  updated AS (
    UPDATE products p
       SET catalog_equivalent_id = c.catalog_id
      FROM candidates c
     WHERE p.id = c.studio_id
    RETURNING p.id
  )
  SELECT COUNT(*) INTO v_linked FROM updated;

  RETURN v_linked;
END;
$$;

REVOKE ALL    ON FUNCTION link_studio_to_catalog_for_vendor FROM PUBLIC;
GRANT EXECUTE ON FUNCTION link_studio_to_catalog_for_vendor TO authenticated;

COMMENT ON FUNCTION link_studio_to_catalog_for_vendor IS
  'Pairs studio-layer products with catalog-layer products from the same vendor by case-insensitive name match. Returns the count of newly-linked rows. Idempotent.';

-- ─── Trigger: fire on nomination → live ────────────────────────────────────

CREATE OR REPLACE FUNCTION vendor_nominations_link_on_live()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'live' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'live') THEN
    PERFORM link_studio_to_catalog_for_vendor(NEW.vendor_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS vendor_nominations_link_on_live_trigger ON vendor_nominations;
CREATE TRIGGER vendor_nominations_link_on_live_trigger
  AFTER INSERT OR UPDATE OF status ON vendor_nominations
  FOR EACH ROW
  EXECUTE FUNCTION vendor_nominations_link_on_live();

COMMENT ON FUNCTION vendor_nominations_link_on_live IS
  'After-trigger that pairs studio products with catalog products when a vendor''s nomination reaches ''live''. Safe no-op when no catalog products exist yet for the vendor.';

COMMIT;
