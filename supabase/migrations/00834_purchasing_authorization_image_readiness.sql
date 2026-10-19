-- ═══════════════════════════════════════════════════════════════════════════
-- 00834 — Purchasing authorization accepts the line's existing picture
-- Lineage: readiness 00435 → 00445 → 00733 (current body, grafted below).
-- Match the Specifications image sources: the first selected-spec URL
-- (string or {url}), then 00807's computed item primary, then catalog first.
-- Empty/blank values are not pictures. All other readiness gates are kept.
-- No business rows, frozen snapshots, reader semantics or grants change;
-- CREATE OR REPLACE retains the existing function's ACL and identity.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_project_ffe_readiness(p_ffe_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
  v_spec public.project_ffe_specs%ROWTYPE;
  v_rules jsonb := '[]'::jsonb;
  v_rule text;
  v_missing text[] := '{}';
BEGIN
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = p_ffe_item_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'selection not found' USING ERRCODE = 'no_data_found';
  END IF;
  PERFORM public._ffe_require_studio_project(v_item.project_id);
  SELECT * INTO v_spec FROM public.project_ffe_specs WHERE ffe_item_id = v_item.id;
  SELECT COALESCE(template.required_field_rules->'fixed', '[]'::jsonb)
  INTO v_rules
  FROM public.spec_books book
  JOIN public.spec_book_templates template ON template.id = book.template_id
  WHERE book.project_id = v_item.project_id
  ORDER BY book.created_at
  LIMIT 1;

  FOR v_rule IN SELECT jsonb_array_elements_text(COALESCE(v_rules, '[]'::jsonb)) LOOP
    IF (v_rule = 'name' AND btrim(COALESCE(v_item.name, '')) = '')
       OR (v_rule = 'documentCode' AND btrim(COALESCE(v_item.doc_code, '')) = '')
       OR (v_rule = 'room' AND v_item.assignment_scope = 'unassigned')
       OR (v_rule = 'quantity' AND COALESCE(v_item.quantity, 0) <= 0)
       OR (v_rule = 'image' AND COALESCE(
         NULLIF(btrim(CASE
           WHEN jsonb_typeof(v_spec.selected_media->0) = 'string'
             THEN v_spec.selected_media->>0
           WHEN jsonb_typeof(v_spec.selected_media->0->'url') = 'string'
             THEN v_spec.selected_media->0->>'url'
         END), ''),
         NULLIF(btrim(public.primary_image_url(v_item)), ''),
         (SELECT NULLIF(btrim(product.images[1]), '')
          FROM public.products product WHERE product.id = v_item.product_id)
       ) IS NULL)
       OR (v_rule = 'selection' AND v_item.product_id IS NULL)
    THEN
      v_missing := array_append(v_missing, v_rule);
    END IF;
  END LOOP;

  IF v_item.design_disposition <> 'selected' THEN
    v_missing := array_append(v_missing, 'designDisposition');
  END IF;
  IF v_item.removed_at IS NOT NULL THEN
    v_missing := array_append(v_missing, 'removed');
  END IF;
  IF v_item.blocked THEN
    v_missing := array_append(v_missing, 'releaseBlock');
  END IF;
  IF v_item.vendor_id IS NULL THEN
    v_missing := array_append(v_missing, 'vendor');
  END IF;
  IF COALESCE(v_item.quantity, 0) <= 0 THEN
    v_missing := array_append(v_missing, 'quantity');
  END IF;
  IF v_item.item_type = 'fixed' AND (
    COALESCE(v_item.unit_price_cents, 0) <= 0
    OR v_item.line_total_cents IS NULL
    OR v_item.line_total_cents <> v_item.quantity * v_item.unit_price_cents
  ) THEN
    v_missing := array_append(v_missing, 'clientPrice');
  ELSIF v_item.item_type = 'allowance' AND COALESCE(v_item.budget_max_cents, 0) <= 0 THEN
    v_missing := array_append(v_missing, 'allowanceCeiling');
  ELSIF v_item.item_type NOT IN ('fixed', 'allowance') THEN
    v_missing := array_append(v_missing, 'itemType');
  END IF;
  -- 00733 (D5): labor is ready only when its piece is.
  IF v_item.line_kind = 'labor' AND (
    v_item.parent_ffe_item_id IS NULL
    OR NOT COALESCE((public.get_project_ffe_readiness(v_item.parent_ffe_item_id)->>'ready')::boolean, false)
  ) THEN
    v_missing := array_append(v_missing, 'parent_not_ready');
  END IF;

  SELECT COALESCE(array_agg(DISTINCT missing ORDER BY missing), '{}')
  INTO v_missing
  FROM unnest(v_missing) AS missing;

  RETURN jsonb_build_object(
    'selectionId', v_item.id,
    'ready', cardinality(v_missing) = 0,
    'missingFields', to_jsonb(v_missing)
  );
END;
$$;
