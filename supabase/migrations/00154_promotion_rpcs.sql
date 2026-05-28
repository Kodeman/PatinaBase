-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00154: promote_to_studio + demote_to_personal RPCs
--
-- Atomic state-transition functions for the three-layer catalog. The
-- Supabase JS client can't span multi-table writes in a single client-
-- side transaction, so promotion + audit-log writes live in SECURITY
-- DEFINER functions with manual authorization checks instead of relying
-- on the table-level RLS that protects ad-hoc UPDATEs.
--
-- Authorization model:
--   promote_to_studio
--     • actor must be authenticated (auth.uid() IS NOT NULL)
--     • actor must own the source product (layer='personal', owner_user_id = actor)
--     • actor must be a non-guest active member of the target studio
--     • all Layer 2 required fields must be supplied (the
--       products_studio_requires_metadata CHECK is the safety net)
--
--   demote_to_personal
--     • actor must be authenticated
--     • either: actor is a non-guest active member of the current studio
--       (studio → personal — the demoter becomes the new owner)
--     • or:    actor is super_admin (admin override; catalog → personal
--       isn't normal but allowed)
--     • product must not be in active project use — defined as any
--       project_ffe_items row with status NOT IN ('installed') OR any
--       project_products row whose project is currently 'active'
--     • action_type is 'undo' if within 7 days of promoted_at, otherwise
--       'demote' (the UI's confirmation behavior follows the same window
--       but is a UX concern, not enforced here)
--
-- Both functions write a promotion_audit_log row with `field_snapshot`
-- holding the pre-transition product state — that's what powers the
-- undo path on the modal side.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── promote_to_studio ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION promote_to_studio(
  p_product_id      UUID,
  p_studio_id       UUID,
  p_vendor_contact  JSONB,
  p_payment_terms   TEXT,
  p_category        TEXT,
  p_usage_notes     TEXT,
  p_lead_time_weeks INTEGER,
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
  IF p_vendor_contact IS NULL OR p_payment_terms IS NULL
     OR p_category IS NULL OR p_usage_notes IS NULL
     OR p_lead_time_weeks IS NULL THEN
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

REVOKE ALL  ON FUNCTION promote_to_studio FROM PUBLIC;
GRANT EXECUTE ON FUNCTION promote_to_studio TO authenticated;

COMMENT ON FUNCTION promote_to_studio IS
  'Atomic personal → studio promotion. SECURITY DEFINER + manual auth checks; writes promotion_audit_log with pre-transition snapshot for undo.';

-- ─── helper: is_product_in_active_use ──────────────────────────────────────

CREATE OR REPLACE FUNCTION is_product_in_active_use(p_product_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    -- Any FFE item not yet installed
    SELECT 1
      FROM project_ffe_items pf
     WHERE pf.product_id = p_product_id
       AND pf.status IS DISTINCT FROM 'installed'
    UNION ALL
    -- Any project_products row on an active project
    SELECT 1
      FROM project_products pp
      JOIN projects p ON p.id = pp.project_id
     WHERE pp.product_id = p_product_id
       AND p.status = 'active'
  );
$$;

REVOKE ALL  ON FUNCTION is_product_in_active_use FROM PUBLIC;
GRANT EXECUTE ON FUNCTION is_product_in_active_use TO authenticated;

COMMENT ON FUNCTION is_product_in_active_use IS
  'True when a product is referenced by an in-flight FFE item or an active project. Used by demote_to_personal to enforce the PRD §6.5 active-project block.';

-- ─── demote_to_personal ────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION demote_to_personal(p_product_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor      UUID := auth.uid();
  v_original   products%ROWTYPE;
  v_is_undo    BOOLEAN;
  v_is_admin   BOOLEAN;
  v_is_member  BOOLEAN;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'demote_to_personal: unauthenticated';
  END IF;

  SELECT * INTO v_original FROM products WHERE id = p_product_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'demote_to_personal: product % not found', p_product_id;
  END IF;

  IF v_original.layer = 'personal' THEN
    RAISE EXCEPTION 'demote_to_personal: product is already personal';
  END IF;

  v_is_admin := user_has_role(v_actor, 'super_admin');
  v_is_member := EXISTS (
    SELECT 1
      FROM organization_members om
     WHERE om.organization_id = v_original.studio_id
       AND om.user_id         = v_actor
       AND om.status          = 'active'
       AND om.role IN ('owner', 'admin', 'member')
  );

  IF NOT (v_is_admin OR v_is_member) THEN
    RAISE EXCEPTION 'demote_to_personal: actor % is not a member of studio % and not super_admin', v_actor, v_original.studio_id;
  END IF;

  IF is_product_in_active_use(p_product_id) THEN
    RAISE EXCEPTION 'demote_to_personal: product is in active project use — wait until projects close, or remove it from the FFE schedule first';
  END IF;

  v_is_undo := v_original.promoted_at IS NOT NULL
               AND v_original.promoted_at > NOW() - INTERVAL '7 days';

  UPDATE products SET
    layer            = 'personal',
    owner_user_id    = v_actor,           -- demoter becomes the new owner
    studio_id        = NULL,
    vendor_contact   = NULL,
    payment_terms    = NULL,
    category         = NULL,
    subcategory      = NULL,
    usage_notes      = NULL,
    lead_time_weeks  = NULL,
    promoted_at      = NULL,
    promoted_by      = NULL,
    promoted_from_id = NULL
  WHERE id = p_product_id;

  INSERT INTO promotion_audit_log (
    product_id, from_layer, to_layer, actor_user_id, action_type, field_snapshot
  ) VALUES (
    p_product_id, v_original.layer, 'personal', v_actor,
    CASE WHEN v_is_undo THEN 'undo' ELSE 'demote' END,
    to_jsonb(v_original)
  );

  RETURN p_product_id;
END;
$$;

REVOKE ALL  ON FUNCTION demote_to_personal FROM PUBLIC;
GRANT EXECUTE ON FUNCTION demote_to_personal TO authenticated;

COMMENT ON FUNCTION demote_to_personal IS
  'Atomic studio (or catalog by super_admin) → personal demotion. Refuses if the product is in active project use. Records the action as ''undo'' when called within 7 days of the original promotion, else ''demote''.';

COMMIT;
