-- ═══════════════════════════════════════════════════════════════════════════
-- 00806 — Lead time is optional on library items (US-37 #5, SQ-1098, D7)
--
-- Kody: "Lead time is required on library items. Make it optional." The
-- requirement lived in two database places, both studio-layer only:
--
--   1. 00152:88-99  CHECK products_studio_requires_metadata demanded
--      lead_time_weeks IS NOT NULL on every studio-layer product, so clearing
--      the lead time on a Studio Library piece (the Piece room's Sourcing
--      facet) failed with 23514, and no studio piece could save without one.
--   2. 00154:91-95  promote_to_studio raised 'missing required Layer 2
--      fields' when p_lead_time_weeks was NULL (promote_batch_to_studio calls
--      it per item, so the batch path inherited the refusal).
--
-- This migration:
--   - recreates the CHECK with the same name and every other Layer 2 field,
--     minus lead_time_weeks. Loosening a CHECK cannot invalidate a row.
--   - replaces promote_to_studio with the same body, minus the lead-time
--     guard, and gives p_lead_time_weeks DEFAULT NULL so the generated client
--     type marks it optional. Signature, SECURITY DEFINER, search_path and
--     grants are unchanged.
--
-- Out of scope and untouched: create_direct_order's not_buyable:lead_time_weeks
-- refusal (00671:140).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_studio_requires_metadata;

ALTER TABLE public.products
  ADD CONSTRAINT products_studio_requires_metadata
    CHECK (
      layer != 'studio'
      OR (
        studio_id        IS NOT NULL
        AND vendor_contact   IS NOT NULL
        AND payment_terms    IS NOT NULL
        AND category         IS NOT NULL
        AND usage_notes      IS NOT NULL
      )
    );

COMMENT ON CONSTRAINT products_studio_requires_metadata ON public.products IS
  'Studio-layer products carry studio_id + the Layer 2 bundle (vendor contact, payment terms, category, usage notes). Lead time is optional (00806, US-37 #5).';

CREATE OR REPLACE FUNCTION public.promote_to_studio(
  p_product_id      UUID,
  p_studio_id       UUID,
  p_vendor_contact  JSONB,
  p_payment_terms   TEXT,
  p_category        TEXT,
  p_usage_notes     TEXT,
  p_lead_time_weeks INTEGER DEFAULT NULL,
  p_subcategory     TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor    UUID := auth.uid();
  v_original products%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'promote_to_studio: unauthenticated';
  END IF;

  -- Lock the source row so concurrent attempts serialize.
  SELECT * INTO v_original FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'promote_to_studio: product % not found', p_product_id;
  END IF;

  IF v_original.layer <> 'personal' THEN
    RAISE EXCEPTION 'promote_to_studio: source layer is % (must be personal)', v_original.layer;
  END IF;

  IF v_original.owner_user_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'promote_to_studio: actor % does not own product', v_actor;
  END IF;

  -- Studio membership — non-guest active member.
  IF NOT EXISTS (
    SELECT 1
      FROM organization_members om
     WHERE om.organization_id = p_studio_id
       AND om.user_id         = v_actor
       AND om.status          = 'active'
       AND om.role IN ('owner', 'admin', 'member')
  ) THEN
    RAISE EXCEPTION 'promote_to_studio: actor % is not a non-guest member of studio %', v_actor, p_studio_id;
  END IF;

  -- Required-field guardrails. The CHECK constraint catches this too but
  -- we want a clearer error message than constraint violations bubble up.
  -- Lead time is optional (00806).
  IF p_vendor_contact IS NULL OR p_payment_terms IS NULL
     OR p_category IS NULL OR p_usage_notes IS NULL THEN
    RAISE EXCEPTION 'promote_to_studio: missing required Layer 2 fields';
  END IF;

  UPDATE products SET
    layer            = 'studio',
    studio_id        = p_studio_id,
    owner_user_id    = NULL,
    vendor_contact   = p_vendor_contact,
    payment_terms    = p_payment_terms::purchase_order_payment_pattern,
    category         = p_category,
    subcategory      = p_subcategory,
    usage_notes      = p_usage_notes,
    lead_time_weeks  = p_lead_time_weeks,
    promoted_at      = NOW(),
    promoted_by      = v_actor,
    promoted_from_id = NULL  -- promotion in place; no separate source row to track
  WHERE id = p_product_id;

  INSERT INTO promotion_audit_log (
    product_id, from_layer, to_layer, actor_user_id, action_type, field_snapshot
  ) VALUES (
    p_product_id, 'personal', 'studio', v_actor, 'promote', to_jsonb(v_original)
  );

  RETURN p_product_id;
END;
$$;

REVOKE ALL  ON FUNCTION public.promote_to_studio(UUID, UUID, JSONB, TEXT, TEXT, TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.promote_to_studio(UUID, UUID, JSONB, TEXT, TEXT, TEXT, INTEGER, TEXT) TO authenticated;

COMMENT ON FUNCTION public.promote_to_studio(UUID, UUID, JSONB, TEXT, TEXT, TEXT, INTEGER, TEXT) IS
  'Atomic personal → studio promotion. SECURITY DEFINER + manual auth checks; writes promotion_audit_log with pre-transition snapshot for undo. Lead time optional (00806).';

COMMIT;
