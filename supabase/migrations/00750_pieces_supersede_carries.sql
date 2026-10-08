-- ═══════════════════════════════════════════════════════════════════════════
-- 00750 — A supersede carries the designer's work (US-21 slice 4, W5; D9;
--         T-44, SQ-650; amended by the T-21 review, F3)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT §2 row 00750 (artifacts/pieces-building-room-2026-10-08/build/
-- CONTRACT.md). CREATE OR REPLACE base: supersede_project_selection at
-- 00661_ffe_extract_commercial_confirmation.sql:374, the newest body (no W1–W4
-- file rewrites it). The guards, the placement repoint, the pricing and the
-- return shape are the base verbatim. Signature unchanged, so CREATE OR
-- REPLACE keeps the ACL: no GRANT/REVOKE, no legacy-grants regeneration.
--
-- ── WHAT THE NEW LINE NOW CARRIES ───────────────────────────────────────────
-- Before this file the successor dropped the designer's work: notes were
-- written as NULL (00661:424), the spec row came out empty (the 00661:429
-- INSERT … ON CONFLICT DO NOTHING lost to the row spec_book_attach_ffe_line
-- had already seeded from the product), and unit, rough_cents, line_kind,
-- link_kind and parent_ffe_item_id fell back to their defaults.
--
-- 1. Line columns: notes, unit, rough_cents, and the parent link
--    (line_kind, link_kind, parent_ffe_item_id). Superseding a labor line
--    keeps it a labor line under the same piece; a COM or accessory child
--    stays linked to its piece.
-- 2. Spec row (project_ffe_specs), designer-authored fields:
--    finish, material, color_fabric, selected_dimensions — carried when the
--      old value is set and is not a product seed (field_provenance key
--      'product_master'). A product-seeded value stays as
--      spec_book_attach_ffe_line seeded it from the successor's product, so
--      a replacement product brings its own facts. Where a carried value
--      differs from that seed, spec_ffe_drop_edited_product_provenance
--      drops the seed's provenance key.
--    exact_location, client/trade/install/care/warranty notes and
--      selected_media — always carried.
--    routing_source gains supersedesSelectionId, as the base intended.
-- 3. Room placements (00734): the predecessor's rows are copied to the new
--    line (same rooms, quantities, area notes, order). The predecessor keeps
--    its own rows as history.
-- 4. Children: the predecessor's active children (labor, COM, accessory;
--    removed_at IS NULL and not superseded) are re-parented to the new
--    line, not copied. Removed and superseded children stay with the
--    predecessor.
-- 5. need_label lives on the thread and the successor joins the same thread,
--    so it is untouched (S3, R1-F19/F20).
--
-- One added refusal: a labor line is never replaced by a product ("Labor
-- isn't replaced with a product."), matching the fill path (00737 F4).
--
-- Idempotent: CREATE OR REPLACE FUNCTION.
-- Test: supabase/tests/ffe/pieces_supersede_carries_test.sql.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.supersede_project_selection(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_old_id uuid:=NULLIF(p_request->>'selectionId','')::uuid; v_old public.project_ffe_items%ROWTYPE;
  v_new public.project_ffe_items%ROWTYPE; v_new_product uuid:=NULLIF(p_request->>'productId','')::uuid;
  v_placements uuid[]; v_expected integer; v_updated integer;
BEGIN
  SELECT * INTO v_old FROM public.project_ffe_items WHERE id=v_old_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'selection not found' USING ERRCODE='no_data_found'; END IF;
  PERFORM public._ffe_require_studio_project(v_old.project_id);
  IF v_old.purchase_order_id IS NOT NULL OR v_old.status IN ('delivered','installed') THEN
    RAISE EXCEPTION 'ordered, delivered, or installed selections require the PO change command'
      USING ERRCODE='check_violation';
  END IF;
  IF EXISTS(SELECT 1 FROM public.furnishing_authorization_items line
    JOIN public.project_commercial_documents document ON document.id=line.commercial_document_id
    JOIN public.proposals proposal ON proposal.id=document.proposal_id
    WHERE line.source_ffe_item_id=v_old.id AND proposal.commercial_state IN ('draft','sent','executed')) THEN
    RAISE EXCEPTION 'authorized selections require void or commercial change authority'
      USING ERRCODE='check_violation';
  END IF;
  IF v_old.design_disposition='superseded' OR v_old.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'selection is already inactive' USING ERRCODE='check_violation';
  END IF;
  -- 00750: labor is never a product (00737 F4 refuses the fill the same way).
  IF v_old.line_kind='labor' AND v_new_product IS NOT NULL THEN
    RAISE EXCEPTION 'Labor isn''t replaced with a product.' USING ERRCODE='check_violation';
  END IF;
  IF v_new_product IS NOT NULL AND NOT public._can_read_configurable_product(v_new_product) THEN
    RAISE EXCEPTION 'replacement product not found or not accessible' USING ERRCODE='insufficient_privilege';
  END IF;
  SELECT array_agg(DISTINCT value::uuid) INTO v_placements
  FROM jsonb_array_elements_text(COALESCE(p_request->'placementIds','[]'::jsonb));
  v_expected:=COALESCE(cardinality(v_placements),0);
  IF v_expected <> jsonb_array_length(COALESCE(p_request->'placementIds','[]'::jsonb)) OR (
    SELECT count(*) FROM public.proposal_board_items placement
    JOIN public.proposal_boards board ON board.id=placement.board_id
    WHERE placement.id=ANY(COALESCE(v_placements,'{}'::uuid[]))
      AND board.project_id=v_old.project_id AND placement.project_ffe_item_id=v_old.id
  ) <> v_expected THEN RAISE EXCEPTION 'chosen placements must be distinct links to the predecessor'
    USING ERRCODE='integrity_constraint_violation'; END IF;
  UPDATE public.project_ffe_items SET design_disposition='superseded',updated_at=now() WHERE id=v_old.id;
  -- 00750: + notes (was NULL), unit, rough_cents, line_kind, link_kind,
  -- parent_ffe_item_id.
  INSERT INTO public.project_ffe_items(
    project_id,project_room_id,product_id,name,ffe_category,item_type,status,quantity,
    unit_price_cents,line_total_cents,budget_min_cents,budget_max_cents,vendor_name,vendor_id,
    blocked,notes,sort_order,trade_price_cents,markup_percent,added_via,doc_code,custom_fields,
    selection_thread_id,supersedes_ffe_item_id,design_disposition,assignment_scope,role_identity,
    currency,unit,rough_cents,line_kind,link_kind,parent_ffe_item_id
  ) SELECT project_id,project_room_id,COALESCE(v_new_product,product_id),
    COALESCE(NULLIF(btrim(p_request->>'name'),''),name),ffe_category,item_type,'specified',quantity,
    CASE WHEN v_new_product IS NULL THEN unit_price_cents ELSE COALESCE((SELECT price_retail FROM public.products WHERE id=v_new_product),0) END,
    quantity*CASE WHEN v_new_product IS NULL THEN COALESCE(unit_price_cents,0) ELSE COALESCE((SELECT price_retail FROM public.products WHERE id=v_new_product),0) END,
    budget_min_cents,budget_max_cents,
    CASE WHEN v_new_product IS NULL THEN vendor_name ELSE (SELECT vendor.name FROM public.products product LEFT JOIN public.vendors vendor ON vendor.id=product.vendor_id WHERE product.id=v_new_product) END,
    CASE WHEN v_new_product IS NULL THEN vendor_id ELSE (SELECT vendor_id FROM public.products WHERE id=v_new_product) END,
    false,notes,sort_order,
    CASE WHEN v_new_product IS NULL THEN trade_price_cents ELSE COALESCE((SELECT price_trade FROM public.products WHERE id=v_new_product),(SELECT price_retail FROM public.products WHERE id=v_new_product),0) END,
    markup_percent,'replacement',doc_code,custom_fields,selection_thread_id,id,'selected',assignment_scope,role_identity,
    CASE WHEN v_new_product IS NULL THEN currency ELSE 'USD' END,
    unit,rough_cents,line_kind,link_kind,parent_ffe_item_id
  FROM public.project_ffe_items WHERE id=v_old.id RETURNING * INTO v_new;
  -- 00750: the spec row exists already (spec_book_attach_ffe_line seeded it
  -- from the successor's product). Carry the designer-authored fields onto it.
  UPDATE public.project_ffe_specs spec SET
    finish=CASE WHEN old_spec.finish IS NOT NULL
      AND old_spec.field_provenance->>'finish' IS DISTINCT FROM 'product_master'
      THEN old_spec.finish ELSE spec.finish END,
    material=CASE WHEN old_spec.material IS NOT NULL
      AND old_spec.field_provenance->>'material' IS DISTINCT FROM 'product_master'
      THEN old_spec.material ELSE spec.material END,
    color_fabric=CASE WHEN old_spec.color_fabric IS NOT NULL
      AND old_spec.field_provenance->>'colorFabric' IS DISTINCT FROM 'product_master'
      THEN old_spec.color_fabric ELSE spec.color_fabric END,
    selected_dimensions=CASE WHEN old_spec.selected_dimensions IS NOT NULL
      AND old_spec.field_provenance->>'dimensions' IS DISTINCT FROM 'product_master'
      THEN old_spec.selected_dimensions ELSE spec.selected_dimensions END,
    exact_location=COALESCE(old_spec.exact_location,spec.exact_location),
    client_notes=COALESCE(old_spec.client_notes,spec.client_notes),
    trade_notes=COALESCE(old_spec.trade_notes,spec.trade_notes),
    install_notes=COALESCE(old_spec.install_notes,spec.install_notes),
    care_notes=COALESCE(old_spec.care_notes,spec.care_notes),
    warranty_notes=COALESCE(old_spec.warranty_notes,spec.warranty_notes),
    selected_media=COALESCE(old_spec.selected_media,spec.selected_media),
    routing_source=spec.routing_source||jsonb_build_object('supersedesSelectionId',v_old.id)
  FROM (SELECT 1) one
  LEFT JOIN public.project_ffe_specs old_spec ON old_spec.ffe_item_id=v_old.id
  WHERE spec.ffe_item_id=v_new.id;
  -- 00750: the room placements are copied; the predecessor keeps its rows.
  INSERT INTO public.project_ffe_placements
    (ffe_item_id,project_id,project_room_id,quantity,area_note,sort_order)
  SELECT v_new.id,placement.project_id,placement.project_room_id,placement.quantity,
    placement.area_note,placement.sort_order
  FROM public.project_ffe_placements placement WHERE placement.ffe_item_id=v_old.id;
  -- 00750: active children follow the piece; they are re-parented, not copied.
  UPDATE public.project_ffe_items SET parent_ffe_item_id=v_new.id
  WHERE parent_ffe_item_id=v_old.id AND removed_at IS NULL
    AND design_disposition<>'superseded';
  IF v_expected>0 THEN
    UPDATE public.proposal_board_items SET project_ffe_item_id=v_new.id,product_id=v_new.product_id
    WHERE id=ANY(v_placements) AND project_ffe_item_id=v_old.id;
    GET DIAGNOSTICS v_updated=ROW_COUNT;
    IF v_updated<>v_expected THEN RAISE EXCEPTION 'not every chosen placement was repointed'
      USING ERRCODE='integrity_constraint_violation'; END IF;
  END IF;
  RETURN jsonb_build_object('predecessorSelectionId',v_old.id,'selectionId',v_new.id,
    'threadId',v_new.selection_thread_id,'repointedPlacementIds',to_jsonb(COALESCE(v_placements,'{}'::uuid[])));
END;
$$;
