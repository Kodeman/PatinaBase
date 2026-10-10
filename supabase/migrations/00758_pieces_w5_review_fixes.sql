-- ═══════════════════════════════════════════════════════════════════════════
-- 00758 — W5 review fixes (US-21 T-55a, SQ-691; from the T-55 review, SQ-661)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT (artifacts/pieces-building-room-2026-10-08/build/CONTRACT.md); the
-- orchestrator's triage of the W5 review (SQ-661), rulings final.
--
-- CREATE OR REPLACE bases, each the newest body, full copy plus the change:
--   supersede_project_selection             00750:51
--   set_project_ffe_line_build_fields       00737:337
--   record_project_ffe_receipt_batch        00754:99
--   set_line_placements                     00754:381
--   triage_project_ffe_items                00755:263
--   set_line_group                          00751:107
--   _derive_working_budget_draft_00661_impl 00757:42
--   _publish_budget_checkpoint_00661_impl   00757:180
-- No signature or return shape changes. Grants are re-issued as each base
-- issued them (no ACL change).
-- New: guard_products_referenced_delete() and its BEFORE DELETE trigger on
-- products. Adds REVOKE → the next reset owner regenerates
-- supabase/seed/00-legacy-grants.sql (CONTRACT §4). No type change: a trigger
-- function is not in the generated types.
--
-- F1 + F2 (supersede). The successor carries line_group_id; the spec row's
--   com_spec, na_declarations and source_verifications; and the
--   predecessor's spec_book_item_settings (included, page_template,
--   publication_overrides) over the defaults spec_book_attach_ffe_line seeds.
-- F3 + F17 (drafted lines). set_project_ffe_line_build_fields (a quantity or
--   unit change) and set_line_placements refuse a line on ANY open draft
--   (commercial_state draft: unsent and unvoided; a void moves it to
--   superseded) with 00755's sentence. make_ffe_line_allowance and
--   set_labor_line_price already test every draft that names the line (00755
--   EXISTS, no "newest" restriction), so they are not rewritten.
-- F5 (catalog delete). BEFORE DELETE on products, for every caller (RLS
--   policies filter first; the trigger also binds the service role): refuses a
--   product named by project_ffe_items, furnishing_authorization_items,
--   fulfillment_order_items, project_review_items or a board item on an
--   issued (non-draft) proposal's board, and a product merged into another.
--   00753's merge marker is products.merged_into_id (it also sets
--   deleted_at). The refusal is the merge sentence
--   (REFERENCED_PRODUCT_DELETE_REFUSAL, use-products.ts).
-- F11 (receipts). Named rooms add up to exactly this delivery's receipt for
--   the line, or all the rooms still lack when that is less, matching 00756.
-- F12 (placements). set_line_placements never drops a room that has received
--   nor sets it below its receipts: "<Room> has already received N. Record a
--   change instead."
-- F14 (budget rollup). The scheduled rollup counts live lines only: not
--   removed, not superseded, not not_selected. Stored stamps are untouched.
-- F15 (groups). Move (triage_project_ffe_items) and set_line_placements clear
--   line_group_id when the line's primary room is no longer the group's
--   (00751: a group sits in one room; NULL counts as a room). A group left
--   empty is deleted, as set_line_group does.
-- F16 (set_line_group). Every named line's project is authorized before any
--   existence error; an unknown line raises the access-denied error.
--
-- Idempotent: CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS.
-- Test: supabase/tests/commercial/pieces_w5_review_fixes_test.sql.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. F1 + F2: supersede_project_selection (base 00750:51) ───────────────

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
    currency,unit,rough_cents,line_kind,link_kind,parent_ffe_item_id,
    -- 00758 (F1): the group heading follows the line.
    line_group_id
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
    unit,rough_cents,line_kind,link_kind,parent_ffe_item_id,
    line_group_id
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
    -- 00758 (F2): the COM facts, N/A declarations and source verifications.
    com_spec=COALESCE(old_spec.com_spec,spec.com_spec),
    na_declarations=spec.na_declarations||COALESCE(old_spec.na_declarations,'{}'::jsonb),
    source_verifications=spec.source_verifications||COALESCE(old_spec.source_verifications,'{}'::jsonb),
    routing_source=spec.routing_source||jsonb_build_object('supersedesSelectionId',v_old.id)
  FROM (SELECT 1) one
  LEFT JOIN public.project_ffe_specs old_spec ON old_spec.ffe_item_id=v_old.id
  WHERE spec.ffe_item_id=v_new.id;
  -- 00758 (F2): the spec-book settings the designer set on the predecessor
  -- win over the defaults spec_book_attach_ffe_line seeded for the new line.
  UPDATE public.spec_book_item_settings setting SET
    included=old_setting.included,
    page_template=old_setting.page_template,
    publication_overrides=old_setting.publication_overrides
  FROM public.spec_book_item_settings old_setting
  WHERE old_setting.ffe_item_id=v_old.id
    AND setting.ffe_item_id=v_new.id
    AND setting.spec_book_id=old_setting.spec_book_id;
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

REVOKE ALL ON FUNCTION public.supersede_project_selection(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.supersede_project_selection(jsonb) TO authenticated;

-- ─── 2. F3 + F17: set_project_ffe_line_build_fields (base 00737:337) ───────

CREATE OR REPLACE FUNCTION public.set_project_ffe_line_build_fields(
  p_item_id uuid, p_request jsonb
)
RETURNS public.project_ffe_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
  v_name text;
  v_need_label text;
  v_quantity integer;
  v_unit text;
  v_rough integer;
  v_changes_count boolean;
  v_placed bigint;
BEGIN
  IF p_request IS NULL OR jsonb_typeof(p_request) <> 'object' THEN
    RAISE EXCEPTION 'set_project_ffe_line_build_fields: request must be a JSON object'
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_request) AS k
    WHERE k NOT IN ('name', 'needLabel', 'quantity', 'unit', 'roughCents')
  ) THEN
    RAISE EXCEPTION 'set_project_ffe_line_build_fields: only name, needLabel, quantity, unit and roughCents can be set here'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_request = '{}'::jsonb THEN
    RAISE EXCEPTION 'set_project_ffe_line_build_fields: nothing to set'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_item.project_id);
  IF v_item.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'set_project_ffe_line_build_fields: line was removed'
      USING ERRCODE = 'check_violation';
  END IF;

  v_name := v_item.name;
  IF p_request ? 'name' THEN
    v_name := CASE WHEN jsonb_typeof(p_request->'name') = 'string'
      THEN NULLIF(btrim(p_request->>'name'), '') END;
    IF v_name IS NULL THEN
      RAISE EXCEPTION 'name cannot be blank' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_request ? 'needLabel' THEN
    v_need_label := CASE WHEN jsonb_typeof(p_request->'needLabel') = 'string'
      THEN NULLIF(btrim(p_request->>'needLabel'), '') END;
    IF v_need_label IS NULL THEN
      RAISE EXCEPTION 'needLabel cannot be blank' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_quantity := v_item.quantity;
  IF p_request ? 'quantity' THEN
    IF jsonb_typeof(p_request->'quantity') <> 'number'
       OR (p_request->>'quantity') !~ '^[1-9][0-9]{0,9}$'
       OR (p_request->>'quantity')::bigint > 2147483647 THEN
      RAISE EXCEPTION 'quantity must be a positive whole number'
        USING ERRCODE = 'check_violation';
    END IF;
    v_quantity := (p_request->>'quantity')::integer;
  END IF;

  v_unit := v_item.unit;
  IF p_request ? 'unit' THEN
    v_unit := CASE WHEN jsonb_typeof(p_request->'unit') = 'string' THEN p_request->>'unit' END;
    IF v_unit IS NULL
       OR v_unit NOT IN ('each', 'sq_ft', 'lin_ft', 'roll', 'yard', 'box', 'hour', 'lot') THEN
      RAISE EXCEPTION 'unit must be one of each, sq_ft, lin_ft, roll, yard, box, hour, lot'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'project_ffe_items_unit_check';
    END IF;
  END IF;

  v_rough := v_item.rough_cents;
  IF p_request ? 'roughCents' THEN
    IF jsonb_typeof(p_request->'roughCents') = 'null' THEN
      v_rough := NULL;
    ELSIF jsonb_typeof(p_request->'roughCents') <> 'number'
       OR (p_request->>'roughCents') !~ '^(0|[1-9][0-9]{0,9})$'
       OR (p_request->>'roughCents')::bigint > 2147483647 THEN
      RAISE EXCEPTION 'roughCents must be a whole number of cents, 0 or more'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'project_ffe_items_rough_cents_check';
    ELSE
      v_rough := (p_request->>'roughCents')::integer;
    END IF;
  END IF;

  -- A released line keeps its count: on a PO, or on a sent, signed or
  -- executed authorization (00705:79).
  v_changes_count := v_quantity IS DISTINCT FROM v_item.quantity
    OR v_unit IS DISTINCT FROM v_item.unit;
  IF v_changes_count AND (
    v_item.purchase_order_id IS NOT NULL
    OR public.ffe_line_authorization_state(v_item.id) IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This line is released. Quantity and unit change through Record a change.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00758 (F3/F17): a line on any open draft keeps its count until the draft
  -- is sent or voided.
  IF v_changes_count THEN
    IF EXISTS (
      SELECT 1 FROM public.furnishing_authorization_items a
      JOIN public.project_commercial_documents d ON d.id = a.commercial_document_id
      JOIN public.proposals p ON p.id = d.proposal_id
      WHERE a.source_ffe_item_id = v_item.id
        AND COALESCE(p.commercial_state, 'draft') = 'draft'
    ) THEN
      RAISE EXCEPTION 'This line is on a drafted release. Send it or void the draft first.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 00737 (F5): the line never holds less than its rooms add up to (00734).
  IF v_quantity IS DISTINCT FROM v_item.quantity THEN
    SELECT COALESCE(sum(placement.quantity), 0) INTO v_placed
    FROM public.project_ffe_placements placement
    WHERE placement.ffe_item_id = v_item.id;
    IF v_quantity < v_placed THEN
      RAISE EXCEPTION 'Quantity is below the rooms'' total (%).', v_placed
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF p_request ?| ARRAY['name', 'quantity', 'unit', 'roughCents'] THEN
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    UPDATE public.project_ffe_items SET
      name = v_name,
      quantity = v_quantity,
      unit = v_unit,
      rough_cents = v_rough,
      line_total_cents = CASE
        -- 00737 (F1): a priced labor line always totals quantity × its price.
        WHEN line_kind = 'labor' AND unit_price_cents > 0
          THEN v_quantity * unit_price_cents
        WHEN v_quantity IS DISTINCT FROM v_item.quantity AND unit_price_cents IS NOT NULL
          THEN v_quantity * unit_price_cents
        ELSE line_total_cents END,
      updated_at = now()
    WHERE id = p_item_id
    RETURNING * INTO v_item;
  END IF;

  IF v_need_label IS NOT NULL THEN
    UPDATE public.project_ffe_selection_threads
    SET need_label = v_need_label
    WHERE id = v_item.selection_thread_id;
  END IF;

  RETURN v_item;
END;
$$;

REVOKE ALL ON FUNCTION public.set_project_ffe_line_build_fields(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_project_ffe_line_build_fields(uuid, jsonb) TO authenticated;

-- ─── 3. F5: products BEFORE DELETE guard (new) ─────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_products_referenced_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF OLD.merged_into_id IS NOT NULL
     OR EXISTS (SELECT 1 FROM public.project_ffe_items x WHERE x.product_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.furnishing_authorization_items x WHERE x.product_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.fulfillment_order_items x WHERE x.product_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.project_review_items x WHERE x.product_id = OLD.id)
     OR EXISTS (
       SELECT 1
       FROM public.proposal_board_items board_item
       JOIN public.proposal_boards board ON board.id = board_item.board_id
       JOIN public.proposals proposal ON proposal.id = board.proposal_id
       WHERE board_item.product_id = OLD.id
         AND proposal.status <> 'draft'
     )
  THEN
    RAISE EXCEPTION 'A product on a line can''t be deleted. Merge it into the one you keep.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.guard_products_referenced_delete() IS
  'D11 (00758, F5): a product named by a schedule line, a furnishing authorization item, a fulfillment '
  'order item, a review item or an issued board item, or merged into another (merged_into_id, 00753), is '
  'never hard-deleted; every FK there is ON DELETE SET NULL and would un-fill the record. Binds every '
  'caller, the service role included.';

REVOKE ALL ON FUNCTION public.guard_products_referenced_delete()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS products_referenced_delete_guard ON public.products;
CREATE TRIGGER products_referenced_delete_guard
  BEFORE DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.guard_products_referenced_delete();

-- ─── 4. F11: record_project_ffe_receipt_batch (base 00754:99) ───────────────

CREATE OR REPLACE FUNCTION public.record_project_ffe_receipt_batch(
  p_purchase_order_id uuid,
  p_lines jsonb,
  p_outcome public.receiving_inspection_outcome,
  p_notes text DEFAULT NULL,
  p_photo_asset_ids uuid[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $fn$
DECLARE
  v_project_id  uuid;
  v_asset_rel   regclass;
  v_col_id      text;
  v_col_status  text;
  v_col_scan    text;
  v_col_upload  text;
  v_col_perms   text;
  v_col_tags    text;
  v_ambiguous   text;
  v_invalid     boolean;
  -- 00754: receiving by room.
  v_entry       jsonb;
  v_given       jsonb;
  v_given_ids   uuid[];
  v_impl_lines  jsonb;
  v_received_before jsonb;
  v_response    jsonb;
  v_batch_id    uuid;
  v_item_id     uuid;
  v_receipt     bigint;
  v_given_total bigint;
  v_left        bigint;
  v_take        bigint;
  v_placement   record;
  v_lacking     bigint;  -- 00758 (F11)
BEGIN
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_lines) entry
    WHERE entry->>'receivedQuantity' !~ '^[0-9]{1,10}$'
       OR (entry->>'receivedQuantity')::numeric > 2147483647
  ) THEN
    RAISE EXCEPTION 'receivedQuantity must be a nonnegative 32-bit integer'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00754: the optional placements key, shape only. Ownership is checked
  -- after the impl has authorized the caller.
  FOR v_entry IN SELECT entry FROM jsonb_array_elements(p_lines) entry LOOP
    CONTINUE WHEN jsonb_typeof(v_entry) IS DISTINCT FROM 'object' OR NOT (v_entry ? 'placements');
    IF jsonb_typeof(v_entry -> 'placements') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'placements must be a list of placementId and quantity entries'
        USING ERRCODE = 'check_violation';
    END IF;
    v_given_ids := ARRAY[]::uuid[];
    FOR v_given IN SELECT given FROM jsonb_array_elements(v_entry -> 'placements') given LOOP
      IF jsonb_typeof(v_given) IS DISTINCT FROM 'object'
         OR EXISTS (SELECT 1 FROM jsonb_object_keys(v_given) key
                    WHERE key NOT IN ('placementId', 'quantity'))
         OR jsonb_typeof(v_given -> 'placementId') IS DISTINCT FROM 'string'
         OR (v_given ->> 'placementId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
         OR jsonb_typeof(v_given -> 'quantity') IS DISTINCT FROM 'number'
         OR (v_given ->> 'quantity') !~ '^[0-9]{1,10}$'
      THEN
        RAISE EXCEPTION 'placements must be a list of placementId and quantity entries'
          USING ERRCODE = 'check_violation';
      END IF;
      IF (v_given ->> 'quantity')::bigint NOT BETWEEN 1 AND 2147483647 THEN
        RAISE EXCEPTION 'Each room''s receipt is a whole number above zero.'
          USING ERRCODE = 'check_violation';
      END IF;
      IF (v_given ->> 'placementId')::uuid = ANY (v_given_ids) THEN
        RAISE EXCEPTION 'A room appears twice in the receipt.'
          USING ERRCODE = 'check_violation';
      END IF;
      v_given_ids := v_given_ids || (v_given ->> 'placementId')::uuid;
    END LOOP;
  END LOOP;

  -- 00754: lock the PO (the impl's first lock, taken earlier) so the
  -- quantities read below are the ones this batch advances from.
  SELECT project_id INTO v_project_id
  FROM public.purchase_orders
  WHERE id = p_purchase_order_id
  FOR UPDATE;

  SELECT COALESCE(jsonb_object_agg(item.id::text, COALESCE(item.received_quantity, 0)), '{}'::jsonb)
  INTO v_received_before
  FROM public.project_ffe_items item
  WHERE item.purchase_order_id = p_purchase_order_id;

  IF cardinality(COALESCE(p_photo_asset_ids, '{}')) > 0 THEN
    v_asset_rel := COALESCE(
      to_regclass('svc_media."MediaAsset"'),
      to_regclass('svc_media.media_assets')
    );
    IF v_asset_rel IS NULL THEN
      RAISE EXCEPTION 'receiving photos cannot be validated: the svc_media asset table is absent'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    -- A key that two physical columns collapse onto (a half-finished @@map
    -- rollout leaving scan_status beside "scanStatus") must abort rather than
    -- silently bind whichever spelling sorts higher.
    SELECT
      max(col.ident) FILTER (WHERE col.key = 'id'),
      max(col.ident) FILTER (WHERE col.key = 'status'),
      max(col.ident) FILTER (WHERE col.key = 'scanstatus'),
      max(col.ident) FILTER (WHERE col.key = 'uploadedby'),
      max(col.ident) FILTER (WHERE col.key = 'permissions'),
      max(col.ident) FILTER (WHERE col.key = 'tags'),
      string_agg(DISTINCT col.key, ', ') FILTER (WHERE col.collisions > 1)
    INTO v_col_id, v_col_status, v_col_scan, v_col_upload, v_col_perms,
         v_col_tags, v_ambiguous
    FROM (
      SELECT lower(replace(attribute.attname, '_', '')) AS key,
             quote_ident(attribute.attname) AS ident,
             count(*) OVER (
               PARTITION BY lower(replace(attribute.attname, '_', ''))
             ) AS collisions
      FROM pg_attribute AS attribute
      WHERE attribute.attrelid = v_asset_rel
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    ) AS col
    WHERE col.key IN (
      'id', 'status', 'scanstatus', 'uploadedby', 'permissions', 'tags'
    );

    IF v_ambiguous IS NOT NULL THEN
      RAISE EXCEPTION
        'receiving photos cannot be validated: % carries more than one column for: %',
        v_asset_rel::text, v_ambiguous
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    IF v_col_id IS NULL OR v_col_status IS NULL OR v_col_scan IS NULL
       OR v_col_upload IS NULL OR v_col_perms IS NULL OR v_col_tags IS NULL THEN
      RAISE EXCEPTION 'receiving photos cannot be validated: % is missing a required asset column',
        v_asset_rel::text
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;

    EXECUTE format(
      'SELECT EXISTS ('
      ||   'SELECT 1 '
      ||     'FROM unnest($1::uuid[]) AS requested(asset_id) '
      ||     'LEFT JOIN %s AS asset ON asset.%s::text = requested.asset_id::text '
      ||    'WHERE asset.%s IS NULL '
      ||       'OR asset.%s::text <> ''READY'' '
      ||       'OR asset.%s::text <> ''CLEAN'' '
      ||       'OR asset.%s::text IS DISTINCT FROM $2::text '
      ||       'OR asset.%s->>''projectId'' IS DISTINCT FROM $3::text '
      ||       'OR NOT (''receiving'' = ANY(COALESCE(asset.%s, ''{}''::text[])))'
      || ')',
      v_asset_rel::text,
      v_col_id,
      v_col_id,
      v_col_status,
      v_col_scan,
      v_col_upload,
      v_col_perms,
      v_col_tags
    )
    USING p_photo_asset_ids, auth.uid()::text, v_project_id::text
    INTO v_invalid;

    IF v_invalid THEN
      RAISE EXCEPTION 'receiving photos must be clean project receiving assets owned by the actor'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
  END IF;

  -- 00754: the impl allows only selectionId and receivedQuantity, and hashes
  -- exactly those; the placements key is ours.
  SELECT COALESCE(jsonb_agg(
           CASE WHEN jsonb_typeof(entry) = 'object' THEN entry - 'placements' ELSE entry END
           ORDER BY ordinality), '[]'::jsonb)
  INTO v_impl_lines
  FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS lines(entry, ordinality);

  v_response := public._record_project_ffe_receipt_batch_00446_impl(
    p_purchase_order_id, v_impl_lines, p_outcome, p_notes, p_photo_asset_ids
  );

  -- 00754: allocate this batch's receipt to the line's rooms. A reused
  -- request already allocated when it first ran.
  IF COALESCE((v_response ->> 'reused')::boolean, false) THEN
    RETURN v_response;
  END IF;
  v_batch_id := (v_response ->> 'inspectionId')::uuid;

  FOR v_entry IN SELECT entry FROM jsonb_array_elements(p_lines) entry LOOP
    v_item_id := (v_entry ->> 'selectionId')::uuid;
    v_receipt := (v_entry ->> 'receivedQuantity')::bigint
                 - COALESCE((v_received_before ->> v_item_id::text)::bigint, 0);

    IF v_entry ? 'placements' THEN
      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_entry -> 'placements') given
        LEFT JOIN public.project_ffe_placements placement
          ON placement.id = (given ->> 'placementId')::uuid
         AND placement.ffe_item_id = v_item_id
        WHERE placement.id IS NULL
      ) THEN
        RAISE EXCEPTION 'That room is not one this line is placed in.'
          USING ERRCODE = 'check_violation';
      END IF;

      SELECT COALESCE(sum((given ->> 'quantity')::bigint), 0) INTO v_given_total
      FROM jsonb_array_elements(v_entry -> 'placements') given;
      IF v_given_total > v_receipt THEN
        RAISE EXCEPTION 'The rooms are given %, more than the % this delivery brought.',
          v_given_total, v_receipt
          USING ERRCODE = 'check_violation';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_entry -> 'placements') given
        JOIN public.project_ffe_placements placement
          ON placement.id = (given ->> 'placementId')::uuid
        WHERE (given ->> 'quantity')::bigint
              + COALESCE((SELECT sum(earlier.quantity)
                          FROM public.project_ffe_placement_receipts earlier
                          WHERE earlier.placement_id = placement.id), 0)
              > placement.quantity
      ) THEN
        RAISE EXCEPTION 'A room cannot receive more than is placed there.'
          USING ERRCODE = 'check_violation';
      END IF;

      -- 00758 (F11): named rooms account for the whole delivery, as 00756
      -- checks: this batch's receipt, or all the rooms still lack when that
      -- is less (the waste).
      SELECT COALESCE(sum(GREATEST(placement.quantity - COALESCE((
               SELECT sum(earlier.quantity)
                 FROM public.project_ffe_placement_receipts earlier
                WHERE earlier.placement_id = placement.id), 0), 0)), 0)
        INTO v_lacking
        FROM public.project_ffe_placements placement
       WHERE placement.ffe_item_id = v_item_id;
      IF v_given_total <> LEAST(GREATEST(v_receipt, 0), v_lacking) THEN
        RAISE EXCEPTION 'The rooms add up to %, but this delivery brought % to place.',
          v_given_total, LEAST(GREATEST(v_receipt, 0), v_lacking)
          USING ERRCODE = 'check_violation';
      END IF;

      INSERT INTO public.project_ffe_placement_receipts (placement_id, receipt_batch_id, quantity)
      SELECT (given ->> 'placementId')::uuid, v_batch_id, (given ->> 'quantity')::integer
      FROM jsonb_array_elements(v_entry -> 'placements') given;
    ELSE
      v_left := v_receipt;
      FOR v_placement IN
        SELECT placement.id,
               placement.quantity - COALESCE((SELECT sum(earlier.quantity)
                                              FROM public.project_ffe_placement_receipts earlier
                                              WHERE earlier.placement_id = placement.id), 0) AS lacking
        FROM public.project_ffe_placements placement
        WHERE placement.ffe_item_id = v_item_id
        ORDER BY placement.sort_order, placement.created_at, placement.id
      LOOP
        EXIT WHEN v_left <= 0;
        v_take := LEAST(v_left, GREATEST(v_placement.lacking, 0));
        IF v_take > 0 THEN
          INSERT INTO public.project_ffe_placement_receipts (placement_id, receipt_batch_id, quantity)
          VALUES (v_placement.id, v_batch_id, v_take::integer);
          v_left := v_left - v_take;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN v_response;
END;
$fn$;

REVOKE ALL ON FUNCTION public.record_project_ffe_receipt_batch(
  uuid, jsonb, public.receiving_inspection_outcome, text, uuid[]
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_project_ffe_receipt_batch(
  uuid, jsonb, public.receiving_inspection_outcome, text, uuid[]
) TO authenticated;

-- ─── 5. F3, F12, F15: set_line_placements (base 00754:381) ─────────────────

CREATE OR REPLACE FUNCTION public.set_line_placements(p_ffe_item_id uuid, p_placements jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_item     public.project_ffe_items%ROWTYPE;
  v_elem     jsonb;
  v_ord      bigint;
  v_room_id  uuid;
  v_qty      numeric;
  v_note     text;
  v_rooms    uuid[] := ARRAY[]::uuid[];
  v_sum      bigint := 0;
  v_primary  uuid;
  v_locked   boolean;
  v_before   jsonb;
  v_after    jsonb;
  v_piece_rooms uuid[];
  v_received   record;  -- 00758 (F12)
BEGIN
  IF p_placements IS NULL OR jsonb_typeof(p_placements) <> 'array' THEN
    RAISE EXCEPTION 'Placements are a list of rooms.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_item
  FROM public.project_ffe_items
  WHERE id = p_ffe_item_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'line not found' USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM public._ffe_require_studio_project(v_item.project_id);

  -- 00737 (F13): a removed line has no rooms to change.
  IF v_item.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This line was removed.' USING ERRCODE = 'check_violation';
  END IF;
  -- 00758 (F3/F17): a line on any open draft keeps its rooms until the
  -- draft is sent or voided.
  IF EXISTS (
    SELECT 1 FROM public.furnishing_authorization_items a
    JOIN public.project_commercial_documents d ON d.id = a.commercial_document_id
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE a.source_ffe_item_id = v_item.id
      AND COALESCE(p.commercial_state, 'draft') = 'draft'
  ) THEN
    RAISE EXCEPTION 'This line is on a drafted release. Send it or void the draft first.'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00737 (F13): labor is placed only where its piece is assigned or placed.
  IF v_item.line_kind = 'labor' THEN
    SELECT COALESCE(array_agg(DISTINCT piece_room.room_id), ARRAY[]::uuid[]) INTO v_piece_rooms
    FROM (
      SELECT piece.project_room_id AS room_id FROM public.project_ffe_items piece
      WHERE piece.id = v_item.parent_ffe_item_id AND piece.project_room_id IS NOT NULL
      UNION
      SELECT placement.project_room_id FROM public.project_ffe_placements placement
      WHERE placement.ffe_item_id = v_item.parent_ffe_item_id
    ) piece_room;
  END IF;

  -- Validate every element before writing anything.
  FOR v_elem, v_ord IN
    SELECT e.value, e.ordinality FROM jsonb_array_elements(p_placements) WITH ORDINALITY AS e
  LOOP
    IF jsonb_typeof(v_elem) <> 'object'
       OR jsonb_typeof(v_elem -> 'roomId') IS DISTINCT FROM 'string'
       OR (v_elem ->> 'roomId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN
      RAISE EXCEPTION 'Each placement names a room.'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    v_room_id := (v_elem ->> 'roomId')::uuid;

    IF jsonb_typeof(v_elem -> 'quantity') IS DISTINCT FROM 'number' THEN
      RAISE EXCEPTION 'Each room''s quantity is a whole number above zero.'
        USING ERRCODE = 'check_violation';
    END IF;
    v_qty := (v_elem ->> 'quantity')::numeric;
    IF v_qty <= 0 OR v_qty <> trunc(v_qty) OR v_qty > 2147483647 THEN
      RAISE EXCEPTION 'Each room''s quantity is a whole number above zero.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.project_rooms room
      WHERE room.id = v_room_id AND room.project_id = v_item.project_id
    ) THEN
      RAISE EXCEPTION 'That room is not in this project.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_item.line_kind = 'labor' AND NOT (v_room_id = ANY (v_piece_rooms)) THEN
      RAISE EXCEPTION 'Labor goes where its piece goes.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_room_id = ANY (v_rooms) THEN
      RAISE EXCEPTION 'A room appears twice in the placements.'
        USING ERRCODE = 'unique_violation';
    END IF;

    v_rooms := v_rooms || v_room_id;
    v_sum := v_sum + v_qty::integer;
  END LOOP;

  IF v_sum > v_item.quantity THEN
    RAISE EXCEPTION 'The rooms add up to %, more than the % on the line.', v_sum, v_item.quantity
      USING ERRCODE = 'check_violation',
            HINT = 'Change the line''s quantity first; once released, through Record a change.';
  END IF;

  v_primary := CASE WHEN cardinality(v_rooms) > 0 THEN v_rooms[1] ELSE v_item.project_room_id END;

  -- 00754 (D7 phase 3): the primary room may change while the line is on a
  -- PO; the change is recorded below like any locked change.

  v_locked := v_item.purchase_order_id IS NOT NULL
              OR public.ffe_line_authorization_state(v_item.id) IS NOT NULL;

  SELECT jsonb_build_object(
           'primaryRoomId', v_item.project_room_id,
           'placements', COALESCE(jsonb_agg(jsonb_build_object(
             'roomId', p.project_room_id, 'quantity', p.quantity, 'areaNote', p.area_note)
             ORDER BY p.sort_order, p.created_at), '[]'::jsonb))
  INTO v_before
  FROM public.project_ffe_placements p
  WHERE p.ffe_item_id = v_item.id;

  -- 00758 (F12): a room keeps what it has received. Dropping it, or setting
  -- it below its receipts, would delete them (ON DELETE CASCADE).
  SELECT room.name, received.total INTO v_received
  FROM public.project_ffe_placements p
  JOIN public.project_rooms room ON room.id = p.project_room_id
  CROSS JOIN LATERAL (
    SELECT sum(r.quantity) AS total
    FROM public.project_ffe_placement_receipts r WHERE r.placement_id = p.id
  ) received
  WHERE p.ffe_item_id = v_item.id
    AND received.total > 0
    AND COALESCE((
      SELECT (e.value ->> 'quantity')::numeric
      FROM jsonb_array_elements(p_placements) e
      WHERE (e.value ->> 'roomId')::uuid = p.project_room_id), 0) < received.total
  ORDER BY p.sort_order, p.created_at, p.id
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION '% has already received %. Record a change instead.',
      v_received.name, v_received.total
      USING ERRCODE = 'check_violation';
  END IF;

  -- Replace the set: drop rooms no longer named, upsert the rest.
  DELETE FROM public.project_ffe_placements p
  WHERE p.ffe_item_id = v_item.id
    AND NOT (p.project_room_id = ANY (v_rooms));

  FOR v_elem, v_ord IN
    SELECT e.value, e.ordinality FROM jsonb_array_elements(p_placements) WITH ORDINALITY AS e
  LOOP
    v_note := NULLIF(btrim(v_elem ->> 'areaNote'), '');
    INSERT INTO public.project_ffe_placements AS p
      (ffe_item_id, project_id, project_room_id, quantity, area_note, sort_order)
    VALUES
      (v_item.id, v_item.project_id, (v_elem ->> 'roomId')::uuid,
       (v_elem ->> 'quantity')::numeric::integer, v_note, (v_ord - 1)::integer)
    ON CONFLICT (ffe_item_id, project_room_id) DO UPDATE
      SET quantity   = EXCLUDED.quantity,
          area_note  = EXCLUDED.area_note,
          sort_order = EXCLUDED.sort_order
      WHERE (p.quantity, p.area_note, p.sort_order)
            IS DISTINCT FROM (EXCLUDED.quantity, EXCLUDED.area_note, EXCLUDED.sort_order);
  END LOOP;

  -- The first placement is the primary room. Only quantity-free columns move.
  IF cardinality(v_rooms) > 0
     AND (v_item.project_room_id IS DISTINCT FROM v_primary
          OR v_item.assignment_scope IS DISTINCT FROM 'room') THEN
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    UPDATE public.project_ffe_items
    SET project_room_id = v_primary,
        assignment_scope = 'room'
    WHERE id = v_item.id;
  END IF;

  -- 00758 (F15): a group sits in one room (00751, Q9). A line whose primary
  -- room is now another leaves its group; a group left empty is deleted.
  IF v_item.line_group_id IS NOT NULL AND cardinality(v_rooms) > 0 AND EXISTS (
    SELECT 1 FROM public.project_line_groups g
    WHERE g.id = v_item.line_group_id AND g.project_room_id IS DISTINCT FROM v_primary
  ) THEN
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    UPDATE public.project_ffe_items SET line_group_id = NULL WHERE id = v_item.id;
    DELETE FROM public.project_line_groups g
    WHERE g.id = v_item.line_group_id
      AND NOT EXISTS (SELECT 1 FROM public.project_ffe_items i WHERE i.line_group_id = g.id);
  END IF;

  SELECT jsonb_build_object(
           'primaryRoomId', v_primary,
           'placements', COALESCE(jsonb_agg(jsonb_build_object(
             'roomId', p.project_room_id, 'quantity', p.quantity, 'areaNote', p.area_note)
             ORDER BY p.sort_order, p.created_at), '[]'::jsonb))
  INTO v_after
  FROM public.project_ffe_placements p
  WHERE p.ffe_item_id = v_item.id;

  IF v_locked AND v_after IS DISTINCT FROM v_before THEN
    INSERT INTO public.project_ffe_placement_events
      (ffe_item_id, project_id, changed_by, before, after)
    VALUES
      (v_item.id, v_item.project_id, auth.uid(), v_before, v_after);
  END IF;

  RETURN jsonb_build_object(
    'placements', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'placementId', p.id,
               'roomId', p.project_room_id,
               'roomName', room.name,
               'quantity', p.quantity,
               'areaNote', p.area_note,
               'sortOrder', p.sort_order)
             ORDER BY p.sort_order, p.created_at)
      FROM public.project_ffe_placements p
      JOIN public.project_rooms room ON room.id = p.project_room_id
      WHERE p.ffe_item_id = v_item.id), '[]'::jsonb),
    'wasteQuantity', v_item.quantity - v_sum
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_line_placements(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_line_placements(uuid, jsonb) TO authenticated;

-- ─── 6. F15: triage_project_ffe_items (base 00755:263) ─────────────────────

CREATE OR REPLACE FUNCTION public.triage_project_ffe_items(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_project_id uuid:=NULLIF(p_request->>'projectId','')::uuid; v_ids uuid[]; v_scope text:=p_request->>'assignmentScope'; v_room uuid:=NULLIF(p_request->>'roomId','')::uuid; v_disposition text:=NULLIF(p_request->>'disposition',''); v_count integer;
  v_moving  uuid[];
  v_carried uuid[];
  v_crowded record;
  v_before  jsonb;
  v_left_groups uuid[];  -- 00758 (F15)
BEGIN
  PERFORM public._ffe_require_studio_project(v_project_id);
  SELECT array_agg(value::uuid) INTO v_ids FROM jsonb_array_elements_text(p_request->'selectionIds');
  IF COALESCE(cardinality(v_ids),0)=0 OR v_scope NOT IN ('room','throughout','unassigned')
     OR (v_scope='room')<>(v_room IS NOT NULL)
     OR (v_disposition IS NOT NULL AND v_disposition NOT IN ('candidate','selected','alternate','not_selected'))
  THEN RAISE EXCEPTION 'invalid triage request' USING ERRCODE='check_violation'; END IF;
  IF v_room IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.project_rooms WHERE id=v_room AND project_id=v_project_id) THEN
    RAISE EXCEPTION 'room does not belong to project' USING ERRCODE='integrity_constraint_violation';
  END IF;

  -- 00755 (F-D1): Move keeps placements and labor coherent. A named line
  -- moves when its room or scope changes; a disposition-only call moves none.
  PERFORM 1 FROM public.project_ffe_items
  WHERE project_id = v_project_id AND id = ANY (v_ids) ORDER BY id FOR UPDATE;

  SELECT COALESCE(array_agg(item.id ORDER BY item.id), '{}'::uuid[]) INTO v_moving
  FROM public.project_ffe_items item
  WHERE item.project_id = v_project_id AND item.id = ANY (v_ids) AND item.removed_at IS NULL
    AND (item.project_room_id IS DISTINCT FROM v_room OR item.assignment_scope IS DISTINCT FROM v_scope);

  IF EXISTS (
    SELECT 1 FROM public.project_ffe_items item
    WHERE item.id = ANY (v_moving) AND item.line_kind = 'labor'
      AND NOT COALESCE(item.parent_ffe_item_id = ANY (v_ids), false)
  ) THEN
    RAISE EXCEPTION 'Labor moves with its piece.' USING ERRCODE = 'check_violation';
  END IF;

  -- A moving piece carries its active labor and COM children.
  SELECT COALESCE(array_agg(child.id ORDER BY child.id), '{}'::uuid[]) INTO v_carried
  FROM public.project_ffe_items child
  WHERE child.project_id = v_project_id
    AND child.parent_ffe_item_id = ANY (v_moving)
    AND child.link_kind IN ('labor', 'com')
    AND child.removed_at IS NULL
    AND NOT (child.id = ANY (v_ids));
  PERFORM 1 FROM public.project_ffe_items WHERE id = ANY (v_carried) ORDER BY id FOR UPDATE;
  v_moving := v_moving || v_carried;

  SELECT placement.ffe_item_id, count(*) AS rooms INTO v_crowded
  FROM public.project_ffe_placements placement
  WHERE placement.ffe_item_id = ANY (v_moving)
  GROUP BY placement.ffe_item_id
  HAVING count(*) > 1
  ORDER BY placement.ffe_item_id
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'This line sits in % rooms. Change its rooms instead.', v_crowded.rooms
      USING ERRCODE = 'check_violation';
  END IF;

  -- Released or ordered lines record the change, as set_line_placements does.
  SELECT COALESCE(jsonb_object_agg(item.id::text, jsonb_build_object(
           'primaryRoomId', item.project_room_id,
           'placements', COALESCE((
             SELECT jsonb_agg(jsonb_build_object(
               'roomId', p.project_room_id, 'quantity', p.quantity, 'areaNote', p.area_note)
               ORDER BY p.sort_order, p.created_at)
             FROM public.project_ffe_placements p WHERE p.ffe_item_id = item.id), '[]'::jsonb))),
         '{}'::jsonb)
  INTO v_before
  FROM public.project_ffe_items item
  WHERE item.id = ANY (v_moving)
    AND (item.purchase_order_id IS NOT NULL
         OR public.ffe_line_authorization_state(item.id) IS NOT NULL);

  PERFORM set_config('app.ffe_mutation_rpc','on',true);
  UPDATE public.project_ffe_items SET project_room_id=v_room,assignment_scope=v_scope,
    design_disposition=COALESCE(v_disposition,design_disposition),updated_at=now()
  WHERE project_id=v_project_id AND id=ANY(v_ids) AND removed_at IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count<>cardinality(v_ids) THEN RAISE EXCEPTION 'one or more selections are missing or cross-project' USING ERRCODE='integrity_constraint_violation'; END IF;

  -- 00755: the carried children, then the one placement of every moving line.
  UPDATE public.project_ffe_items
  SET project_room_id = v_room, assignment_scope = v_scope, updated_at = now()
  WHERE id = ANY (v_carried);

  IF v_room IS NULL THEN
    DELETE FROM public.project_ffe_placements WHERE ffe_item_id = ANY (v_moving);
  ELSE
    UPDATE public.project_ffe_placements SET project_room_id = v_room
    WHERE ffe_item_id = ANY (v_moving) AND project_room_id <> v_room;
  END IF;

  -- 00758 (F15): a group sits in one room (00751, Q9; NULL, the unassigned
  -- pile, counts as a room). A moved line in another room leaves its group;
  -- a group left empty is deleted.
  WITH cleared AS (
    UPDATE public.project_ffe_items item SET line_group_id = NULL
    FROM public.project_line_groups g
    WHERE item.id = ANY (v_moving) AND g.id = item.line_group_id
      AND g.project_room_id IS DISTINCT FROM item.project_room_id
    RETURNING g.id
  )
  SELECT array_agg(DISTINCT cleared.id) INTO v_left_groups FROM cleared;
  DELETE FROM public.project_line_groups g
  WHERE g.id = ANY (COALESCE(v_left_groups, '{}'::uuid[]))
    AND NOT EXISTS (SELECT 1 FROM public.project_ffe_items i WHERE i.line_group_id = g.id);

  INSERT INTO public.project_ffe_placement_events (ffe_item_id, project_id, changed_by, before, after)
  SELECT item.id, item.project_id, auth.uid(), v_before -> (item.id::text), after_state.state
  FROM public.project_ffe_items item
  CROSS JOIN LATERAL (
    SELECT jsonb_build_object(
      'primaryRoomId', item.project_room_id,
      'placements', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'roomId', p.project_room_id, 'quantity', p.quantity, 'areaNote', p.area_note)
          ORDER BY p.sort_order, p.created_at)
        FROM public.project_ffe_placements p WHERE p.ffe_item_id = item.id), '[]'::jsonb)) AS state
  ) after_state
  WHERE v_before ? (item.id::text)
    AND after_state.state IS DISTINCT FROM v_before -> (item.id::text);

  RETURN jsonb_build_object('updatedCount',v_count,'assignmentScope',v_scope,'roomId',v_room);
END;
$$;

REVOKE ALL ON FUNCTION public.triage_project_ffe_items(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.triage_project_ffe_items(jsonb) TO authenticated;

-- ─── 7. F16: set_line_group (base 00751:107) ───────────────────────────────

CREATE OR REPLACE FUNCTION public.set_line_group(p_ffe_item_ids uuid[], p_group jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_ids        uuid[];
  v_project_id uuid;
  v_count      integer;
  v_projects   integer;
  v_group     public.project_line_groups%ROWTYPE;
  v_group_id   uuid;
  v_room_id    uuid;
  v_name       text;
  v_old_groups uuid[];
  v_deleted    uuid[];
  v_uuid_re    constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
BEGIN
  SELECT array_agg(DISTINCT x) INTO v_ids
  FROM unnest(p_ffe_item_ids) AS x
  WHERE x IS NOT NULL;
  IF v_ids IS NULL THEN
    RAISE EXCEPTION 'Name at least one line.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_group IS NOT NULL AND jsonb_typeof(p_group) = 'null' THEN
    p_group := NULL;
  END IF;
  IF p_group IS NOT NULL AND jsonb_typeof(p_group) <> 'object' THEN
    RAISE EXCEPTION 'A group is {groupId}, {name, roomId} or null.'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Lock the lines; they must exist and share one project.
  PERFORM 1 FROM public.project_ffe_items i
  WHERE i.id = ANY (v_ids)
  ORDER BY i.id
  FOR UPDATE;

  -- 00758 (F16): authorize every project a named line is in before any
  -- error that would say whether a line exists. An unknown line then reads
  -- exactly like a line in a project the caller cannot reach.
  FOR v_project_id IN
    SELECT DISTINCT i.project_id FROM public.project_ffe_items i
    WHERE i.id = ANY (v_ids) ORDER BY i.project_id
  LOOP
    PERFORM public._ffe_require_studio_project(v_project_id);
  END LOOP;

  SELECT count(*), count(DISTINCT i.project_id), min(i.project_id::text)::uuid
  INTO v_count, v_projects, v_project_id
  FROM public.project_ffe_items i
  WHERE i.id = ANY (v_ids);

  IF v_count <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_projects > 1 THEN
    RAISE EXCEPTION 'The lines are in different projects.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public._ffe_require_studio_project(v_project_id);

  SELECT array_agg(DISTINCT i.line_group_id) INTO v_old_groups
  FROM public.project_ffe_items i
  WHERE i.id = ANY (v_ids) AND i.line_group_id IS NOT NULL;

  IF p_group IS NOT NULL THEN
    IF p_group ? 'groupId' THEN
      IF jsonb_typeof(p_group -> 'groupId') IS DISTINCT FROM 'string'
         OR (p_group ->> 'groupId') !~* v_uuid_re THEN
        RAISE EXCEPTION 'A group is {groupId}, {name, roomId} or null.'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
      SELECT * INTO v_group
      FROM public.project_line_groups g
      WHERE g.id = (p_group ->> 'groupId')::uuid
      FOR UPDATE;
      IF NOT FOUND OR v_group.project_id <> v_project_id THEN
        RAISE EXCEPTION 'That group is not in this project.'
          USING ERRCODE = 'check_violation';
      END IF;
      v_room_id := v_group.project_room_id;
    ELSE
      v_name := NULLIF(btrim(p_group ->> 'name'), '');
      IF jsonb_typeof(p_group -> 'name') IS DISTINCT FROM 'string' OR v_name IS NULL THEN
        RAISE EXCEPTION 'A group needs a name.'
          USING ERRCODE = 'check_violation';
      END IF;
      IF jsonb_typeof(p_group -> 'roomId') = 'string' THEN
        IF (p_group ->> 'roomId') !~* v_uuid_re THEN
          RAISE EXCEPTION 'A group is {groupId}, {name, roomId} or null.'
            USING ERRCODE = 'invalid_parameter_value';
        END IF;
        v_room_id := (p_group ->> 'roomId')::uuid;
        IF NOT EXISTS (
          SELECT 1 FROM public.project_rooms room
          WHERE room.id = v_room_id AND room.project_id = v_project_id
        ) THEN
          RAISE EXCEPTION 'That room is not in this project.'
            USING ERRCODE = 'check_violation';
        END IF;
      ELSIF p_group ? 'roomId' AND jsonb_typeof(p_group -> 'roomId') <> 'null' THEN
        RAISE EXCEPTION 'A group is {groupId}, {name, roomId} or null.'
          USING ERRCODE = 'invalid_parameter_value';
      END IF;
    END IF;

    -- Q9: a group sits inside one room. A removed line is not grouped.
    IF EXISTS (
      SELECT 1 FROM public.project_ffe_items i
      WHERE i.id = ANY (v_ids) AND i.removed_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'This line was removed.'
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.project_ffe_items i
      WHERE i.id = ANY (v_ids) AND i.project_room_id IS DISTINCT FROM v_room_id
    ) THEN
      RAISE EXCEPTION 'A group sits inside one room; a line is in another.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_group.id IS NULL THEN
      INSERT INTO public.project_line_groups (project_id, project_room_id, name, sort_order)
      VALUES (
        v_project_id, v_room_id, v_name,
        COALESCE((
          SELECT max(g.sort_order) + 1 FROM public.project_line_groups g
          WHERE g.project_id = v_project_id
            AND g.project_room_id IS NOT DISTINCT FROM v_room_id
        ), 0)
      )
      RETURNING * INTO v_group;
    END IF;
    v_group_id := v_group.id;
  END IF;

  -- Only line_group_id moves.
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items i
  SET line_group_id = v_group_id
  WHERE i.id = ANY (v_ids)
    AND i.line_group_id IS DISTINCT FROM v_group_id;

  -- A group the move left empty is deleted.
  WITH gone AS (
    DELETE FROM public.project_line_groups g
    WHERE g.id = ANY (COALESCE(v_old_groups, ARRAY[]::uuid[]))
      AND g.id IS DISTINCT FROM v_group_id
      AND NOT EXISTS (
        SELECT 1 FROM public.project_ffe_items i WHERE i.line_group_id = g.id
      )
    RETURNING g.id
  )
  SELECT array_agg(gone.id ORDER BY gone.id) INTO v_deleted FROM gone;

  RETURN jsonb_build_object(
    'groupId', v_group_id,
    'ffeItemIds', to_jsonb(v_ids),
    'deletedGroupIds', COALESCE(to_jsonb(v_deleted), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_line_group(uuid[], jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_line_group(uuid[], jsonb) TO authenticated;

-- ─── 8. F14: the working budget rollup (base 00757:42, 00757:180) ─────────

CREATE OR REPLACE FUNCTION public._derive_working_budget_draft_00661_impl(p_project_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_version public.project_budget_versions%ROWTYPE;
BEGIN
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
  IF NOT FOUND OR v_actor IS NULL
     OR NOT public.is_studio_comember(v_project.designer_id) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_version FROM public.project_budget_versions
  WHERE project_id = p_project_id
  ORDER BY version DESC LIMIT 1 FOR UPDATE;
  IF v_version.id IS NULL OR v_version.status <> 'draft' THEN
    INSERT INTO public.project_budget_versions (project_id, version, created_by)
    VALUES (p_project_id, COALESCE(v_version.version, 0) + 1, v_actor)
    RETURNING * INTO v_version;
  END IF;

  -- Additive only. A studio target the designer typed is a JUDGEMENT; the
  -- schedule rollup is an OBSERVATION. Re-deriving must never overwrite the
  -- judgement, so an existing (version, room, category) line is left alone and
  -- only genuinely new room×category pairs appear.
  --
  -- The conflict key is the ROOM ID, not the room name: two rooms both called
  -- "Bedroom" are two rooms, and the old name key silently discarded the
  -- second one's rollup — leaving its schedule lines permanently un-releasable
  -- against an id-keyed coverage proof.
  INSERT INTO public.project_budget_lines (
    budget_version_id, project_room_id, room_name, category,
    low_cents, target_cents, high_cents, sort_order
  )
  SELECT
    v_version.id, rollup.room_id, rollup.room_name, rollup.category,
    0,
    public._cents_to_int4(rollup.target,
      format('the scheduled rollup for %s · %s', rollup.room_name, rollup.category)),
    0,
    rollup.sort_order
  FROM (
    -- 00757 delta: the rollup sums each line's room SLICES, not the line. A
    -- placed line (2+ placements) is one slice per placement room, by share;
    -- any other line is one slice in project_room_id. Same copy as
    -- _publish_budget_checkpoint_00661_impl's `slice`.
    WITH line AS (
      SELECT
        item.id, item.project_room_id,
        COALESCE(item.ffe_category, 'Uncategorized') AS category,
        (CASE
          WHEN item.item_type = 'fixed' THEN COALESCE(item.line_total_cents, 0)
          WHEN item.item_type = 'allowance' THEN COALESCE(item.budget_max_cents, 0)
          ELSE 0 END)::numeric AS amount
      FROM public.project_ffe_items item
      WHERE item.project_id = p_project_id
        -- 00423 delta: a trade scope's presence lines are not furnishings, and
        -- this is a FURNISHING budget. Without this predicate the rollup mints a
        -- 'trade work' budget line out of them — which is also what let the
        -- presence lines into publish_budget_checkpoint's scheduled stamp, since
        -- that stamp matches a schedule line to a budget line on category.
        AND item.trade_scope_document_id IS NULL
        -- 00758 (F14): only live lines. A removed line, a superseded one
        -- (its successor carries the money) and a not-selected one (the
        -- designer passed on it; release needs 'selected') are not scheduled.
        AND item.removed_at IS NULL
        AND item.design_disposition NOT IN ('not_selected', 'superseded')
    ), placed AS (
      SELECT
        pl.ffe_item_id, pl.project_room_id, pl.quantity,
        row_number() OVER (PARTITION BY pl.ffe_item_id
                           ORDER BY pl.sort_order, pl.created_at, pl.id) AS ord,
        sum(pl.quantity) OVER (PARTITION BY pl.ffe_item_id) AS placed_sum,
        count(*) OVER (PARTITION BY pl.ffe_item_id) AS placed_count
      FROM public.project_ffe_placements pl
      WHERE pl.project_id = p_project_id
    ), share AS (
      -- floor(amount × quantity / placed_sum), and its remainder numerator
      -- (a floor mod, so a negative amount still rounds down).
      SELECT
        line.id, line.category, line.amount, placed.project_room_id, placed.ord,
        mod(mod(line.amount * placed.quantity, placed.placed_sum) + placed.placed_sum,
            placed.placed_sum) AS rem,
        placed.quantity, placed.placed_sum
      FROM line
      JOIN placed ON placed.ffe_item_id = line.id AND placed.placed_count >= 2
    ), ranked AS (
      SELECT
        share.*,
        (share.amount * share.quantity - share.rem) / share.placed_sum AS base,
        row_number() OVER (PARTITION BY share.id ORDER BY share.rem DESC, share.ord) AS rem_rank
      FROM share
    ), slice AS (
      SELECT
        ranked.project_room_id, ranked.category,
        (ranked.base + CASE
          WHEN ranked.rem_rank <= ranked.amount
               - sum(ranked.base) OVER (PARTITION BY ranked.id) THEN 1
          ELSE 0 END)::integer AS amount
      FROM ranked
      UNION ALL
      SELECT line.project_room_id, line.category, line.amount::integer
      FROM line
      WHERE NOT EXISTS (
        SELECT 1 FROM placed
        WHERE placed.ffe_item_id = line.id AND placed.placed_count >= 2
      )
    )
    SELECT
      room.id AS room_id, room.name AS room_name,
      slice.category AS category,
      room.sort_order AS sort_order,
      SUM(slice.amount)::bigint AS target
    FROM slice
    JOIN public.project_rooms room ON room.id = slice.project_room_id
    GROUP BY room.id, room.name, slice.category, room.sort_order
  ) rollup
  -- A legacy line carrying no project_room_id still owns its (name, category)
  -- pair on this version. Re-deriving must not shadow that judgement with a
  -- second, id-keyed line for the same room and category.
  WHERE NOT EXISTS (
    SELECT 1 FROM public.project_budget_lines legacy
    WHERE legacy.budget_version_id = v_version.id
      AND legacy.project_room_id IS NULL
      AND legacy.room_name = rollup.room_name
      AND legacy.category = rollup.category
  )
  ON CONFLICT (budget_version_id, project_room_id, category)
    WHERE project_room_id IS NOT NULL
  DO NOTHING;

  RETURN public.get_project_working_budget(p_project_id);
END;
$$;
REVOKE ALL ON FUNCTION public._derive_working_budget_draft_00661_impl(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._publish_budget_checkpoint_00661_impl(
  p_project_id uuid,
  p_version_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_version public.project_budget_versions%ROWTYPE;
  v_checkpoint public.project_budget_checkpoints%ROWTYPE;
  v_low bigint;
  v_target bigint;
  v_high bigint;
  v_stamp record;
  v_fingerprint text;
  v_previous_publish text := current_setting('app.budget_publish_id', true);
BEGIN
  SELECT v.* INTO v_version
  FROM public.project_budget_versions v
  JOIN public.projects p ON p.id = v.project_id
  WHERE v.id = p_version_id AND v.project_id = p_project_id
    AND public.is_studio_comember(p.designer_id)
  FOR UPDATE OF v;
  IF NOT FOUND OR v_actor IS NULL OR v_version.status <> 'draft' THEN
    RAISE EXCEPTION 'draft budget version % not found or access denied', p_version_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- 00414: a checkpoint is an act of signed commercial authority — it is what a
  -- furnishing wave is built on. A legacy project has no such authority, so it
  -- can no longer publish one.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = p_project_id AND d.is_origin
      AND d.document_kind IN ('design_services', 'design_build') AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.project_budget_lines l WHERE l.budget_version_id = p_version_id) THEN
    RAISE EXCEPTION 'budget version % has no lines', p_version_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00422: freeze the coverage picture INTO the version, so the checkpoint the
  -- client acknowledges says what was scheduled and what was already authorized
  -- against each line — not just what was targeted.
  --
  -- Both rollups match on the ROOM ID wherever both sides carry one, and fall
  -- back to the name only for a legacy row that has no id (a budget line filed
  -- before 00412's project_room_id, or a proposal-sourced snapshot that never
  -- had one). Matching on name alone double-counted every pair of rooms that
  -- happened to share a name, and froze that inflated figure into the hash the
  -- client acknowledges. Written as a loop, not one UPDATE, so the narrowing to
  -- the integer columns can name which rollup overflowed.
  FOR v_stamp IN
    -- 00757 delta: the `scheduled` rollup sums each line's room SLICES, not
    -- the line. A placed line (2+ placements) is one slice per placement
    -- room, by share; any other line is one slice in project_room_id. Same
    -- copy as _derive_working_budget_draft_00661_impl's `slice`. The
    -- `authorized` rollup is untouched: it reads the frozen release snapshot.
    WITH line AS (
      SELECT
        i.id, i.project_room_id,
        COALESCE(i.ffe_category, 'Uncategorized') AS category,
        (CASE
          WHEN i.item_type = 'fixed' THEN COALESCE(i.line_total_cents, 0)
          WHEN i.item_type = 'allowance' THEN COALESCE(i.budget_max_cents, 0)
          ELSE 0 END)::numeric AS amount
      FROM public.project_ffe_items i
      WHERE i.project_id = p_project_id
        -- 00423 delta: same exclusion as derive_working_budget_draft, and it
        -- is load-bearing independently. derive is not the only way a
        -- 'trade work' budget line can exist — a studio can type any category
        -- by hand, and a version derived before 00423 already carries one —
        -- so the stamp must refuse the presence lines on its own account.
        AND i.trade_scope_document_id IS NULL
        -- 00758 (F14): only live lines. A removed line, a superseded one
        -- (its successor carries the money) and a not-selected one (the
        -- designer passed on it; release needs 'selected') are not scheduled.
        AND i.removed_at IS NULL
        AND i.design_disposition NOT IN ('not_selected', 'superseded')
    ), placed AS (
      SELECT
        pl.ffe_item_id, pl.project_room_id, pl.quantity,
        row_number() OVER (PARTITION BY pl.ffe_item_id
                           ORDER BY pl.sort_order, pl.created_at, pl.id) AS ord,
        sum(pl.quantity) OVER (PARTITION BY pl.ffe_item_id) AS placed_sum,
        count(*) OVER (PARTITION BY pl.ffe_item_id) AS placed_count
      FROM public.project_ffe_placements pl
      WHERE pl.project_id = p_project_id
    ), share AS (
      -- floor(amount × quantity / placed_sum), and its remainder numerator
      -- (a floor mod, so a negative amount still rounds down).
      SELECT
        line.id, line.category, line.amount, placed.project_room_id, placed.ord,
        mod(mod(line.amount * placed.quantity, placed.placed_sum) + placed.placed_sum,
            placed.placed_sum) AS rem,
        placed.quantity, placed.placed_sum
      FROM line
      JOIN placed ON placed.ffe_item_id = line.id AND placed.placed_count >= 2
    ), ranked AS (
      SELECT
        share.*,
        (share.amount * share.quantity - share.rem) / share.placed_sum AS base,
        row_number() OVER (PARTITION BY share.id ORDER BY share.rem DESC, share.ord) AS rem_rank
      FROM share
    ), slice AS (
      SELECT
        ranked.project_room_id, ranked.category,
        (ranked.base + CASE
          WHEN ranked.rem_rank <= ranked.amount
               - sum(ranked.base) OVER (PARTITION BY ranked.id) THEN 1
          ELSE 0 END)::integer AS amount
      FROM ranked
      UNION ALL
      SELECT line.project_room_id, line.category, line.amount::integer
      FROM line
      WHERE NOT EXISTS (
        SELECT 1 FROM placed
        WHERE placed.ffe_item_id = line.id AND placed.placed_count >= 2
      )
    )
    SELECT
      l.id AS line_id, l.room_name AS room_name, l.category AS category,
      COALESCE((
        SELECT SUM(s.amount)
        FROM slice s
        LEFT JOIN public.project_rooms r ON r.id = s.project_room_id
        WHERE CASE
                WHEN l.project_room_id IS NOT NULL AND s.project_room_id IS NOT NULL
                  THEN s.project_room_id = l.project_room_id
                ELSE COALESCE(r.name, '') = l.room_name
              END
          AND s.category = l.category
      ), 0) AS scheduled,
      COALESCE((
        SELECT SUM(a.client_line_total_cents)
        FROM public.furnishing_authorization_items a
        JOIN public.project_commercial_documents d ON d.id = a.commercial_document_id
        JOIN public.proposals p ON p.id = d.proposal_id
        WHERE d.project_id = p_project_id
          AND d.executed_at IS NOT NULL
          AND p.commercial_state = 'executed'
          AND CASE
                WHEN l.project_room_id IS NOT NULL AND a.project_room_id IS NOT NULL
                  THEN a.project_room_id = l.project_room_id
                ELSE COALESCE(a.room_name, '') = l.room_name
              END
          AND COALESCE(a.category, 'Uncategorized') = l.category
      ), 0) AS authorized
    FROM public.project_budget_lines l
    WHERE l.budget_version_id = p_version_id
  LOOP
    UPDATE public.project_budget_lines SET
      scheduled_cents = public._cents_to_int4(v_stamp.scheduled,
        format('the scheduled rollup for %s · %s', v_stamp.room_name, v_stamp.category)),
      authorized_cents = public._cents_to_int4(v_stamp.authorized,
        format('the authorized rollup for %s · %s', v_stamp.room_name, v_stamp.category))
    WHERE id = v_stamp.line_id;
  END LOOP;

  SELECT sum(low_cents), sum(target_cents), sum(high_cents)
  INTO v_low, v_target, v_high
  FROM public.project_budget_lines WHERE budget_version_id = p_version_id;

  PERFORM set_config('app.budget_publish_id', p_version_id::text, true);
  UPDATE public.project_budget_versions SET
    low_total_cents = public._cents_to_int4(v_low, 'this budget version''s low total'),
    target_total_cents = public._cents_to_int4(v_target, 'this budget version''s target total'),
    high_total_cents = public._cents_to_int4(v_high, 'this budget version''s high total'),
    status = 'published', published_at = now()
  WHERE id = p_version_id RETURNING * INTO v_version;
  v_fingerprint := public._budget_version_fingerprint(p_version_id);

  INSERT INTO public.project_budget_checkpoints (
    project_id, budget_version_id, checkpoint_code, snapshot_fingerprint,
    published_by, published_at
  ) VALUES (
    p_project_id, p_version_id, 'B-' || lpad(v_version.version::text, 3, '0'),
    v_fingerprint, v_actor, v_version.published_at
  ) RETURNING * INTO v_checkpoint;
  PERFORM set_config('app.budget_publish_id', COALESCE(v_previous_publish, ''), true);

  RETURN jsonb_build_object(
    'checkpointId', v_checkpoint.id,
    'projectId', p_project_id,
    'versionId', p_version_id,
    'checkpointCode', v_checkpoint.checkpoint_code,
    'status', v_checkpoint.status,
    'snapshotFingerprint', v_checkpoint.snapshot_fingerprint,
    'publishedAt', v_checkpoint.published_at
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.budget_publish_id', COALESCE(v_previous_publish, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public._publish_budget_checkpoint_00661_impl(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
