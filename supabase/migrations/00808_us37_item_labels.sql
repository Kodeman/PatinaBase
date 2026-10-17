-- ═══════════════════════════════════════════════════════════════════════════
-- 00808 — Per-job item labels on doc_code (US-37 #3, SQ-1100; contract D3)
--
-- Each item in a job carries a label unique within that job, so the item
-- list, the client presentation and future POs name items the same way. The
-- label IS project_ffe_items.doc_code (00262): it already flows to the client
-- approval docCode (00423), spec books and the readiness 'documentCode' rule.
--
-- Rules:
--   * A new item without a label gets the next one for its job, under
--     pg_advisory_xact_lock(hashtext('ffe_label:' || project_id)).
--       - In a room: the room's initials, then -NN. Up to 3 words give one
--         letter each, ignoring "and", "&" and "the"; a single word gives its
--         first 2 letters. "Living Room" → LR-01, "Kitchen" → KI-01,
--         "Primary Bath and Closet" → PBC-01. Three digits after 99.
--       - Without a room: 001, 002… Three digits, more after 999.
--       - The next number is max(number in that series in the job) + 1, never
--         a count. Removed and replaced items count, so a number is never
--         handed out twice.
--   * A label is unique among the job's live items: case- and edge-space-
--     insensitive, ignoring removed items and superseded (replaced) items.
--     A replacement carries its predecessor's label (supersede, 00758).
--   * An item ENTERING the job (insert, restore, move to another job) never
--     fails over a label: a taken label is dropped and the next one assigned.
--     Activation carries proposal codes, and proposal twins are allowed
--     (00262: "imports must never break").
--   * EDITING a live item's label to one another live item uses raises 23505
--     "Another item in this job already uses LR-01." (HINT item_label_taken).
--     A blank edit gives the item the next automatic label.
--   * Moving an item to another room never relabels it.
--   * Line breaks (CR, LF, U+2028, U+2029) inside a label become one space
--     before any check, on every write that sets a label: labels print on POs.
--   * Lock order (SQ-1121). The job label lock is _ffe_lock_job_labels: the
--     job's projects row FOR KEY SHARE (what the item insert's own foreign key
--     check takes), then the advisory lock. Every path that locks an item or a
--     selection thread and then writes an item in a way that reaches the label
--     trigger takes the job label lock FIRST. Otherwise an insert (label lock,
--     then the thread via set_project_ffe_thread_primary) and a restore (thread
--     FOR UPDATE, then the label lock) deadlock (40P01), and an item entering
--     the job would fail. Taking the projects row first keeps a path that
--     locks the job row FOR UPDATE before it inserts items (apply_scope_change,
--     _execute_furnishings_authorization_*) ahead of the label lock too.
--
-- New: _ffe_lock_job_labels, _ffe_item_label_prefix, _ffe_next_item_label, ffe_assign_item_label
-- (BEFORE INSERT/UPDATE trigger zz_ffe_assign_item_label_trg), the unique index
-- project_ffe_items_label_unique, _ffe_backfill_item_labels, and the writer
-- set_project_ffe_item_label (no project-side doc_code writer existed; direct
-- writes are RPC-only, guard_ffe_rpc_mutation 00438).
--
-- Backfill: live items without a label, per job in sort_order, created_at,
-- id order. Existing codes are untouched, except a later twin: where two live
-- items in a job already share a label (proposal twins carried by activation),
-- the first keeps it and the later one gets the next label, so the unique
-- index can build. User triggers are disabled for the
-- backfill (00729 pattern) so updated_at keeps its meaning. A removed item
-- without a label gets one if it is restored.
--
-- Lineage: section 8 redefines, each grafted whole from its latest body with
-- only the job label lock added: restore_project_selection (00737),
-- supersede_project_selection (00758), add_labor_line (00737),
-- place_product_in_project_v2 (00752), triage_project_ffe_items (00759),
-- _apply_client_decision_authorized (00763). A later migration that redefines
-- any of them grafts from here. Reconciles: none.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 0. The job label lock ──────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._ffe_lock_job_labels(p_project_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF p_project_id IS NULL THEN
    RETURN;
  END IF;
  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR KEY SHARE;
  PERFORM pg_advisory_xact_lock(hashtext('ffe_label:' || p_project_id::text));
END;
$$;

COMMENT ON FUNCTION public._ffe_lock_job_labels(uuid) IS
  'The job label lock (00808): the projects row FOR KEY SHARE, then pg_advisory_xact_lock(hashtext(''ffe_label:'' || project_id)). Take it before any item or selection-thread row lock in a path that writes items. Called inside SECURITY DEFINER bodies only.';

-- ─── 1. The room prefix (pure) ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._ffe_item_label_prefix(p_room_name text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'pg_catalog'
AS $$
DECLARE
  v_words text[];
BEGIN
  -- Words are runs of letters and digits; an apostrophe stays inside its
  -- word ("Kid's" is one word). "&" and other punctuation separate words.
  SELECT array_agg(cleaned.word ORDER BY cleaned.ord)
  INTO v_words
  FROM (
    SELECT regexp_replace(part.word, '[''’]', '', 'g') AS word, part.ord
    FROM regexp_split_to_table(COALESCE(p_room_name, ''), '[^[:alnum:]''’]+')
      WITH ORDINALITY AS part(word, ord)
  ) AS cleaned
  WHERE cleaned.word <> ''
    AND lower(cleaned.word) NOT IN ('and', 'the');

  IF v_words IS NULL THEN
    RETURN NULL;
  END IF;
  IF cardinality(v_words) = 1 THEN
    RETURN upper(left(v_words[1], 2));
  END IF;
  RETURN upper(left(v_words[1], 1) || left(v_words[2], 1) || COALESCE(left(v_words[3], 1), ''));
END;
$$;

COMMENT ON FUNCTION public._ffe_item_label_prefix(text) IS
  'Room initials for an item label (00808): first letter of up to 3 words, ignoring and/&/the; a single word gives 2 letters. NULL when the name has no letters or digits.';

-- ─── 2. The next label in a job ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public._ffe_next_item_label(p_project_id uuid, p_room_id uuid)
RETURNS text
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_prefix text;
  v_next numeric;
BEGIN
  IF p_room_id IS NOT NULL THEN
    SELECT public._ffe_item_label_prefix(room.name)
    INTO v_prefix
    FROM public.project_rooms AS room
    WHERE room.id = p_room_id;
  END IF;

  IF v_prefix IS NULL THEN
    SELECT COALESCE(max(btrim(item.doc_code)::numeric), 0) + 1
    INTO v_next
    FROM public.project_ffe_items AS item
    WHERE item.project_id = p_project_id
      AND btrim(item.doc_code) ~ '^[0-9]+$';
    RETURN CASE WHEN v_next < 1000 THEN lpad(v_next::text, 3, '0') ELSE v_next::text END;
  END IF;

  -- The prefix is letters and digits only, so it is safe inside the pattern.
  SELECT COALESCE(max(substring(btrim(item.doc_code) FROM '-([0-9]+)$')::numeric), 0) + 1
  INTO v_next
  FROM public.project_ffe_items AS item
  WHERE item.project_id = p_project_id
    AND btrim(item.doc_code) ~* ('^' || v_prefix || '-[0-9]+$');
  RETURN v_prefix || '-'
    || CASE WHEN v_next < 100 THEN lpad(v_next::text, 2, '0') ELSE v_next::text END;
END;
$$;

COMMENT ON FUNCTION public._ffe_next_item_label(uuid, uuid) IS
  'Next item label for a job (00808): room prefix + -NN, or 001… without a room; max of the series + 1 over every item in the job, removed and replaced included. Call under the ffe_label advisory lock.';

-- ─── 3. Assign on insert, refuse a clashing edit ────────────────────────────

CREATE OR REPLACE FUNCTION public.ffe_assign_item_label()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_live boolean := NEW.removed_at IS NULL
    AND NEW.design_disposition IS DISTINCT FROM 'superseded';
  v_entering boolean := true;
  v_taken text;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- A removed or replaced item holds no label against the others.
    IF NOT v_live THEN
      RETURN NEW;
    END IF;
    v_entering := OLD.removed_at IS NOT NULL
      OR OLD.design_disposition = 'superseded'
      OR NEW.project_id IS DISTINCT FROM OLD.project_id;
    IF NOT v_entering
       AND btrim(COALESCE(NEW.doc_code, '')) <> ''
       AND lower(btrim(NEW.doc_code)) = lower(btrim(COALESCE(OLD.doc_code, ''))) THEN
      RETURN NEW;
    END IF;
  END IF;

  PERFORM public._ffe_lock_job_labels(NEW.project_id);

  -- A run of line breaks inside a label becomes one space: labels print on POs.
  NEW.doc_code := regexp_replace(NEW.doc_code, '[\r\n\u2028\u2029]+', ' ', 'g');

  IF btrim(COALESCE(NEW.doc_code, '')) = '' THEN
    NEW.doc_code := public._ffe_next_item_label(NEW.project_id, NEW.project_room_id);
    RETURN NEW;
  END IF;
  IF NOT v_live THEN
    RETURN NEW;
  END IF;

  SELECT btrim(peer.doc_code)
  INTO v_taken
  FROM public.project_ffe_items AS peer
  WHERE peer.project_id = NEW.project_id
    AND peer.id <> NEW.id
    AND peer.removed_at IS NULL
    AND peer.design_disposition <> 'superseded'
    AND lower(btrim(peer.doc_code)) = lower(btrim(NEW.doc_code))
  LIMIT 1;

  IF v_taken IS NULL THEN
    RETURN NEW;
  END IF;
  IF v_entering THEN
    -- Insert, restore or move: never fail. The taken label is dropped.
    NEW.doc_code := public._ffe_next_item_label(NEW.project_id, NEW.project_room_id);
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Another item in this job already uses %.', v_taken
    USING ERRCODE = 'unique_violation', HINT = 'item_label_taken';
END;
$$;

COMMENT ON FUNCTION public.ffe_assign_item_label() IS
  'BEFORE INSERT/UPDATE on project_ffe_items (00808): assigns a blank label, drops a taken label for an item entering the job, refuses (23505) an edit to a label another live item uses.';

DROP TRIGGER IF EXISTS zz_ffe_assign_item_label_trg ON public.project_ffe_items;
CREATE TRIGGER zz_ffe_assign_item_label_trg
  BEFORE INSERT OR UPDATE OF doc_code, removed_at, design_disposition, project_id
  ON public.project_ffe_items
  FOR EACH ROW EXECUTE FUNCTION public.ffe_assign_item_label();

-- ─── 4. Backfill ────────────────────────────────────────────────────────────
-- Activation carries proposal codes and proposal twins are allowed, so a job
-- can already hold two live items with one label. The first (sort_order,
-- created_at, id) keeps it; a later twin gets the next label, as an item
-- entering the job would. Otherwise the unique index below could not build.

CREATE OR REPLACE FUNCTION public._ffe_backfill_item_labels()
RETURNS integer
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_item record;
  v_count integer := 0;
BEGIN
  FOR v_item IN
    SELECT live.id, live.project_id, live.project_room_id
    FROM (
      SELECT item.id, item.project_id, item.project_room_id, item.doc_code,
        item.sort_order, item.created_at,
        row_number() OVER (
          PARTITION BY item.project_id, lower(btrim(item.doc_code))
          ORDER BY item.sort_order, item.created_at, item.id
        ) AS label_rank
      FROM public.project_ffe_items AS item
      WHERE item.removed_at IS NULL
        AND item.design_disposition <> 'superseded'
    ) AS live
    WHERE btrim(COALESCE(live.doc_code, '')) = ''
       OR live.label_rank > 1
    ORDER BY live.project_id, live.sort_order, live.created_at, live.id
  LOOP
    UPDATE public.project_ffe_items
    SET doc_code = public._ffe_next_item_label(v_item.project_id, v_item.project_room_id)
    WHERE id = v_item.id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public._ffe_backfill_item_labels() IS
  'One-time label backfill (00808): live items without a label, and later twins of a label two live items in a job share, per job in sort_order, created_at, id order; each gets the next label. Idempotent; returns how many it labeled.';

DO $$
BEGIN
  ALTER TABLE public.project_ffe_items DISABLE TRIGGER USER;
  PERFORM public._ffe_backfill_item_labels();
  ALTER TABLE public.project_ffe_items ENABLE TRIGGER USER;
END;
$$;

-- ─── 5. Unique among the job's live items ───────────────────────────────────
-- The trigger's check gives the plain sentence; the index is the backstop
-- for any write that races it. Built after the backfill has parted twins.

CREATE UNIQUE INDEX IF NOT EXISTS project_ffe_items_label_unique
  ON public.project_ffe_items (project_id, lower(btrim(doc_code)))
  WHERE doc_code IS NOT NULL
    AND btrim(doc_code) <> ''
    AND removed_at IS NULL
    AND design_disposition <> 'superseded';

-- ─── 6. The writer ──────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.set_project_ffe_item_label(p_item_id uuid, p_label text)
RETURNS public.project_ffe_items
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
BEGIN
  -- The job label lock before the item's row lock (SQ-1121).
  PERFORM public._ffe_lock_job_labels(item.project_id)
  FROM public.project_ffe_items AS item WHERE item.id = p_item_id;
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id = p_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_item.project_id);
  IF v_item.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'This item was removed from the job.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Free text on one line, trimmed: a run of line breaks becomes one space.
  -- Blank gives the next automatic label (the trigger).
  UPDATE public.project_ffe_items
  SET doc_code = NULLIF(btrim(regexp_replace(COALESCE(p_label, ''), '[\r\n\u2028\u2029]+', ' ', 'g')), '')
  WHERE id = p_item_id
  RETURNING * INTO v_item;
  RETURN v_item;
END;
$$;

COMMENT ON FUNCTION public.set_project_ffe_item_label(uuid, text) IS
  'Set an item''s per-job label (doc_code, 00808). Free text, trimmed, line breaks made one space; blank assigns the next automatic label; a label another live item in the job uses raises 23505 "Another item in this job already uses X." (HINT item_label_taken).';

-- ─── 7. Grants ──────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public._ffe_lock_job_labels(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._ffe_item_label_prefix(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._ffe_next_item_label(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ffe_assign_item_label() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._ffe_backfill_item_labels() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_project_ffe_item_label(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_project_ffe_item_label(uuid, text) TO authenticated;

-- ─── 8. Lock order: the job label lock before any item or thread row lock ──
-- SQ-1121 (Astra SQ-1119 F1). Each body below is its latest definition,
-- grafted whole; the only change is the job label lock before the first item
-- or selection-thread row lock. CREATE OR REPLACE keeps each one's grants.

-- restore_project_selection — base 00737_pieces_w2_review_fixes.sql:556. It locks the item and its selection thread FOR UPDATE, then the restore UPDATE reaches the label trigger.
CREATE OR REPLACE FUNCTION public.restore_project_selection(p_ffe_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$
DECLARE v_item public.project_ffe_items%ROWTYPE; v_primary uuid;
BEGIN
  -- 00808 (SQ-1121): the job label lock comes before any row lock.
  PERFORM public._ffe_lock_job_labels(item.project_id)
  FROM public.project_ffe_items AS item WHERE item.id = p_ffe_item_id;
  SELECT * INTO v_item FROM public.project_ffe_items WHERE id=p_ffe_item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'selection not found' USING ERRCODE='no_data_found'; END IF;
  PERFORM public._ffe_require_studio_project(v_item.project_id);
  IF v_item.removed_at IS NULL THEN
    RAISE EXCEPTION 'This line is not removed.' USING ERRCODE='check_violation';
  END IF;
  -- 00737 (F2): a child comes back only under an active piece.
  IF v_item.parent_ffe_item_id IS NOT NULL AND EXISTS(
    SELECT 1 FROM public.project_ffe_items parent
    WHERE parent.id=v_item.parent_ffe_item_id AND parent.removed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Restore its piece first.' USING ERRCODE='check_violation';
  END IF;
  SELECT primary_ffe_item_id INTO v_primary FROM public.project_ffe_selection_threads
  WHERE id=v_item.selection_thread_id FOR UPDATE;
  IF v_primary IS NOT NULL AND v_primary<>v_item.id AND EXISTS(
    SELECT 1 FROM public.project_ffe_items other
    WHERE other.id=v_primary AND other.removed_at IS NULL
      AND other.design_disposition NOT IN ('superseded','not_selected')
  ) THEN
    RAISE EXCEPTION 'Another line now fills this need, so this one cannot be restored.'
      USING ERRCODE='check_violation';
  END IF;
  PERFORM set_config('app.ffe_mutation_rpc','on',true);
  UPDATE public.project_ffe_items SET removed_at=NULL,removed_by=NULL,removal_reason=NULL,
    design_disposition=COALESCE(removed_disposition,'candidate'),removed_disposition=NULL,
    updated_at=now() WHERE id=v_item.id;
  -- 00737 (F2): the children removed with the piece (same removed_at) return
  -- with it; a child removed on its own earlier stays removed.
  UPDATE public.project_ffe_items SET removed_at=NULL,removed_by=NULL,removal_reason=NULL,
    design_disposition=COALESCE(removed_disposition,'candidate'),removed_disposition=NULL,
    updated_at=now()
  WHERE parent_ffe_item_id=v_item.id AND removed_at=v_item.removed_at;
  RETURN jsonb_build_object('selectionId',v_item.id,'restored',true);
END;
$$;

-- supersede_project_selection — base 00758_pieces_w5_review_fixes.sql:63. It locks the predecessor FOR UPDATE and marks it superseded, then INSERTs the replacement.
CREATE OR REPLACE FUNCTION public.supersede_project_selection(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','pg_temp' AS $$
DECLARE v_old_id uuid:=NULLIF(p_request->>'selectionId','')::uuid; v_old public.project_ffe_items%ROWTYPE;
  v_new public.project_ffe_items%ROWTYPE; v_new_product uuid:=NULLIF(p_request->>'productId','')::uuid;
  v_placements uuid[]; v_expected integer; v_updated integer;
BEGIN
  -- 00808 (SQ-1121): the job label lock comes before any row lock.
  PERFORM public._ffe_lock_job_labels(item.project_id)
  FROM public.project_ffe_items AS item WHERE item.id = v_old_id;
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

-- add_labor_line — base 00737_pieces_w2_review_fixes.sql:608. It locks the parent piece FOR UPDATE, then INSERTs the labor line.
CREATE OR REPLACE FUNCTION public.add_labor_line(
  p_parent_ffe_item_id uuid,
  p_request jsonb,
  p_unit_price_cents integer DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp' AS $$
DECLARE
  v_keys constant text[] := ARRAY['name', 'quantity', 'unit', 'roughCents', 'vendorId'];
  v_parent public.project_ffe_items%ROWTYPE;
  v_item public.project_ffe_items%ROWTYPE;
  v_name text;
  v_quantity integer := 1;
  v_unit text := 'each';
  v_rough integer;
  v_vendor_id uuid;
  v_vendor_name text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- 00808 (SQ-1121): the job label lock comes before any row lock.
  PERFORM public._ffe_lock_job_labels(item.project_id)
  FROM public.project_ffe_items AS item WHERE item.id = p_parent_ffe_item_id;

  SELECT * INTO v_parent FROM public.project_ffe_items
   WHERE id = p_parent_ffe_item_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._ffe_require_studio_project(v_parent.project_id);

  -- ── The request ──
  IF p_request IS NULL OR jsonb_typeof(p_request) <> 'object' OR (p_request - v_keys) <> '{}'::jsonb THEN
    RAISE EXCEPTION 'add_labor_line: the request is an object with keys %', array_to_string(v_keys, ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  v_name := CASE WHEN jsonb_typeof(p_request->'name') = 'string'
                 THEN NULLIF(btrim(p_request->>'name'), '') END;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'add_labor_line: a labor line needs a name'
      USING ERRCODE = 'check_violation';
  END IF;

  IF jsonb_typeof(COALESCE(p_request->'quantity', 'null'::jsonb)) <> 'null' THEN
    IF jsonb_typeof(p_request->'quantity') <> 'number'
       OR (p_request->>'quantity')::numeric <> trunc((p_request->>'quantity')::numeric)
       OR (p_request->>'quantity')::numeric <= 0
       OR (p_request->>'quantity')::numeric > 2147483647 THEN
      RAISE EXCEPTION 'add_labor_line: quantity is a whole number above 0'
        USING ERRCODE = 'check_violation';
    END IF;
    v_quantity := (p_request->>'quantity')::numeric::integer;
  END IF;

  -- The value list is project_ffe_items_unit_check (00729); it names itself.
  IF jsonb_typeof(COALESCE(p_request->'unit', 'null'::jsonb)) <> 'null' THEN
    IF jsonb_typeof(p_request->'unit') <> 'string' THEN
      RAISE EXCEPTION 'add_labor_line: unit is a string'
        USING ERRCODE = 'check_violation';
    END IF;
    v_unit := p_request->>'unit';
  END IF;

  IF jsonb_typeof(COALESCE(p_request->'roughCents', 'null'::jsonb)) <> 'null' THEN
    IF jsonb_typeof(p_request->'roughCents') <> 'number'
       OR (p_request->>'roughCents')::numeric <> trunc((p_request->>'roughCents')::numeric)
       OR (p_request->>'roughCents')::numeric < 0
       OR (p_request->>'roughCents')::numeric > 2147483647 THEN
      RAISE EXCEPTION 'add_labor_line: roughCents is whole cents, 0 or more'
        USING ERRCODE = 'check_violation';
    END IF;
    v_rough := (p_request->>'roughCents')::numeric::integer;
  END IF;

  IF jsonb_typeof(COALESCE(p_request->'vendorId', 'null'::jsonb)) <> 'null' THEN
    BEGIN
      v_vendor_id := CASE WHEN jsonb_typeof(p_request->'vendorId') = 'string'
                          THEN (p_request->>'vendorId')::uuid END;
    EXCEPTION WHEN invalid_text_representation THEN
      v_vendor_id := NULL;
    END;
    SELECT name INTO v_vendor_name FROM public.vendors WHERE id = v_vendor_id;
    IF v_vendor_id IS NULL OR NOT FOUND THEN
      RAISE EXCEPTION 'add_labor_line: vendor not found'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- 00737 (F1): the client price, whole cents. Above 0 it prices the line.
  IF p_unit_price_cents < 0 THEN
    RAISE EXCEPTION 'add_labor_line: the price is whole cents, 0 or more'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── The piece ──
  IF v_parent.line_kind = 'labor' THEN
    RAISE EXCEPTION 'add_labor_line: labor attaches to a piece, not to another labor line'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_parent.parent_ffe_item_id IS NOT NULL THEN
    RAISE EXCEPTION 'add_labor_line: labor attaches to a piece, not to a line that supplies one'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_parent.removed_at IS NOT NULL THEN
    RAISE EXCEPTION 'add_labor_line: the piece was removed'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00737 (F6): labor goes on a piece in the design, not on an alternate or a
  -- passed-over line.
  IF v_parent.design_disposition IN ('alternate', 'not_selected') THEN
    RAISE EXCEPTION 'add_labor_line: labor attaches to a chosen piece, not an alternate or a passed-over line'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_parent.trade_scope_document_id IS NOT NULL THEN
    RAISE EXCEPTION 'add_labor_line: this line is a Trade Scope; its work is billed by the scope, not as labor'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_parent.purchase_order_id IS NOT NULL THEN
    RAISE EXCEPTION 'add_labor_line: the piece is on an order. Labor changes through Record a change.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF public.ffe_line_authorization_state(v_parent.id) IS NOT NULL THEN
    RAISE EXCEPTION 'add_labor_line: the piece is released. Labor changes through Record a change.'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  INSERT INTO public.project_ffe_items (
    project_id, project_room_id, assignment_scope, name, quantity, unit,
    rough_cents, vendor_id, vendor_name, line_kind, link_kind,
    parent_ffe_item_id, design_disposition, added_via, sort_order,
    unit_price_cents, line_total_cents
  ) VALUES (
    v_parent.project_id, v_parent.project_room_id, v_parent.assignment_scope,
    v_name, v_quantity, v_unit, v_rough, v_vendor_id, v_vendor_name,
    'labor', 'labor', v_parent.id, 'candidate', 'labor',
    COALESCE((SELECT max(sort_order) + 1 FROM public.project_ffe_items
               WHERE project_id = v_parent.project_id), 0),
    CASE WHEN p_unit_price_cents > 0 THEN p_unit_price_cents ELSE 0 END,
    CASE WHEN p_unit_price_cents > 0 THEN v_quantity * p_unit_price_cents ELSE 0 END
  ) RETURNING * INTO v_item;

  -- Every line has its spec row (precedent 00678:1437).
  INSERT INTO public.project_ffe_specs (ffe_item_id, updated_by)
  VALUES (v_item.id, auth.uid())
  ON CONFLICT (ffe_item_id) DO NOTHING;

  -- D2: a created line's thread is named for it (00729 backfill, 00730).
  UPDATE public.project_ffe_selection_threads
     SET need_label = v_name
   WHERE id = v_item.selection_thread_id
     AND need_label IS NULL;

  RETURN jsonb_build_object('selectionId', v_item.id, 'parentFfeItemId', v_parent.id);
END;
$$;

-- place_product_in_project_v2 — base 00752_pieces_allowance_fill.sql:90. It locks the reference or placeholder item FOR UPDATE, then the impl INSERTs (or fills the placeholder).
CREATE OR REPLACE FUNCTION public.place_product_in_project_v2(p_request jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_request jsonb := p_request;
  v_item_type text := COALESCE(NULLIF(p_request->>'itemType', ''),
    CASE WHEN NULLIF(p_request->>'productId', '') IS NULL THEN 'tbd' ELSE 'fixed' END);
  v_role text := COALESCE(NULLIF(btrim(p_request->>'roleConfigurationIdentity'), ''),
    NULLIF(btrim(p_request->>'roleIdentity'), ''), 'default');
  v_reference_id uuid := CASE WHEN p_request->>'selectionReferenceId' ~* '^[0-9a-f-]{36}$'
    THEN (p_request->>'selectionReferenceId')::uuid END;
  v_placeholder_id uuid := CASE WHEN p_request->>'placeholderSelectionId' ~* '^[0-9a-f-]{36}$'
    THEN (p_request->>'placeholderSelectionId')::uuid END;
  v_configuration_id uuid := CASE WHEN p_request->>'configurationId' ~* '^[0-9a-f-]{36}$'
    THEN (p_request->>'configurationId')::uuid END;
  v_existing public.project_ffe_items%ROWTYPE;
  v_existing_configuration uuid;
  v_result jsonb;
  -- 00752 (D10): the signed allowance this fill resolves, if any.
  v_snapshot public.furnishing_authorization_items%ROWTYPE;
  v_allowance_fill boolean := false;
  v_filled public.project_ffe_items%ROWTYPE;
  v_filled_cents bigint;
BEGIN
  IF NULLIF(p_request->>'quantity', '') IS NOT NULL AND (
    p_request->>'quantity' !~ '^[1-9][0-9]{0,9}$'
    OR (p_request->>'quantity')::numeric > 2147483647
  ) THEN
    RAISE EXCEPTION 'quantity must be a positive 32-bit integer'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NULLIF(p_request->>'budgetMinCents', '') IS NOT NULL AND (
    p_request->>'budgetMinCents' !~ '^[0-9]{1,10}$'
    OR (p_request->>'budgetMinCents')::numeric > 2147483647
  ) OR NULLIF(p_request->>'budgetMaxCents', '') IS NOT NULL AND (
    p_request->>'budgetMaxCents' !~ '^[0-9]{1,10}$'
    OR (p_request->>'budgetMaxCents')::numeric > 2147483647
  ) THEN
    RAISE EXCEPTION 'allowance cents must be 32-bit nonnegative integers'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item_type NOT IN ('fixed', 'allowance', 'tbd') THEN
    RAISE EXCEPTION 'itemType must be fixed, allowance, or tbd'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NULLIF(p_request->>'productId', '') IS NULL
     AND NULLIF(btrim(p_request->>'name'), '') IS NULL THEN
    RAISE EXCEPTION 'manual selections and placeholders require a name'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_item_type = 'allowance' AND COALESCE(p_request->>'budgetMaxCents', '') !~ '^[1-9][0-9]{0,9}$' THEN
    RAISE EXCEPTION 'allowance selections require a positive budgetMaxCents'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00808 (SQ-1121): the job label lock comes before any row lock.
  PERFORM public._ffe_lock_job_labels(NULLIF(p_request->>'projectId', '')::uuid);

  IF v_reference_id IS NOT NULL OR v_placeholder_id IS NOT NULL THEN
    SELECT item.*
    INTO v_existing
    FROM public.project_ffe_items item
    WHERE item.id = COALESCE(v_reference_id, v_placeholder_id)
    FOR UPDATE OF item;
    SELECT configuration_id INTO v_existing_configuration
    FROM public.project_ffe_specs WHERE ffe_item_id = v_existing.id;
    IF NOT FOUND OR v_existing.role_identity IS DISTINCT FROM v_role
       OR (v_reference_id IS NOT NULL AND v_existing_configuration IS DISTINCT FROM v_configuration_id)
       OR (v_reference_id IS NOT NULL AND v_existing.item_type IS DISTINCT FROM v_item_type)
    THEN
      RAISE EXCEPTION 'selection reference does not match role, configuration, or item type'
        USING ERRCODE = 'integrity_constraint_violation';
    END IF;
    -- 00752 (D10, Q12): an allowance bound to a signed authorization may be
    -- filled. The frozen row is the line's own provenance (set at execution,
    -- immutable after), on an executed document whose proposal is executed.
    -- The request must keep the line an allowance; a PO or a live draft/sent
    -- authorization still refuses below.
    IF v_placeholder_id IS NOT NULL
       AND v_existing.item_type = 'allowance' AND v_item_type = 'allowance'
       AND v_existing.purchase_order_id IS NULL
       AND v_existing.source_authorization_item_id IS NOT NULL
    THEN
      SELECT line.* INTO v_snapshot
      FROM public.furnishing_authorization_items line
      JOIN public.project_commercial_documents document ON document.id = line.commercial_document_id
      JOIN public.proposals proposal ON proposal.id = document.proposal_id
      WHERE line.id = v_existing.source_authorization_item_id
        AND document.id = v_existing.source_commercial_document_id
        AND document.executed_at IS NOT NULL
        AND proposal.commercial_state = 'executed'
        AND line.item_type = 'allowance';
      v_allowance_fill := v_snapshot.id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.furnishing_authorization_items line
        JOIN public.project_commercial_documents document ON document.id = line.commercial_document_id
        JOIN public.proposals proposal ON proposal.id = document.proposal_id
        WHERE line.source_ffe_item_id = v_existing.id
          AND proposal.commercial_state IN ('draft', 'sent')
      );
    END IF;
    IF v_placeholder_id IS NOT NULL AND NOT v_allowance_fill AND (
      v_existing.purchase_order_id IS NOT NULL
      OR v_existing.source_commercial_document_id IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM public.furnishing_authorization_items line
        JOIN public.project_commercial_documents document ON document.id = line.commercial_document_id
        JOIN public.proposals proposal ON proposal.id = document.proposal_id
        WHERE line.source_ffe_item_id = v_existing.id
          AND proposal.commercial_state IN ('draft', 'sent', 'executed')
      )
    ) THEN
      RAISE EXCEPTION 'authorized or ordered placeholders cannot be filled in place'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_request := v_request || jsonb_build_object('roleIdentity', v_role);
  v_result := public._place_product_in_project_v2_00444_impl(v_request);

  -- 00752 (D10, Q12): the fill is measured against the signed ceiling. Over
  -- it, the whole fill rolls back. A replay (the line already held a product
  -- before this call) records nothing.
  IF v_allowance_fill AND v_result->>'outcome' = 'filled' AND v_existing.product_id IS NULL THEN
    SELECT * INTO v_filled FROM public.project_ffe_items
    WHERE id = (v_result->>'selectionId')::uuid;
    v_filled_cents := v_filled.quantity::bigint * COALESCE(v_filled.unit_price_cents, 0)::bigint;
    IF v_filled_cents > v_snapshot.client_line_total_cents THEN
      RAISE EXCEPTION 'Over the allowance. This goes through Record a change.'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.project_ffe_allowance_fills (
      ffe_item_id, authorization_item_id, ceiling_cents, filled_cents, variance_cents, filled_by
    ) VALUES (
      v_filled.id, v_snapshot.id, v_snapshot.client_line_total_cents,
      v_filled_cents::integer,
      (v_snapshot.client_line_total_cents - v_filled_cents)::integer,
      auth.uid()
    );
  END IF;

  IF v_result->>'outcome' IN ('created', 'filled') THEN
    PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
    -- 00752: a signed allowance keeps the budget the client signed.
    UPDATE public.project_ffe_items
    SET item_type = v_item_type,
        budget_min_cents = CASE WHEN v_allowance_fill THEN budget_min_cents
          WHEN v_item_type = 'allowance'
          THEN COALESCE(NULLIF(p_request->>'budgetMinCents', '')::integer, 0)
          ELSE budget_min_cents END,
        budget_max_cents = CASE WHEN v_allowance_fill THEN budget_max_cents
          WHEN v_item_type = 'allowance'
          THEN (p_request->>'budgetMaxCents')::integer
          ELSE budget_max_cents END,
        updated_at = now()
    WHERE id = (v_result->>'selectionId')::uuid;
  ELSE
    SELECT * INTO v_existing FROM public.project_ffe_items
    WHERE id = (v_result->>'selectionId')::uuid;
  END IF;
  RETURN (v_result - 'roleIdentity') || jsonb_build_object(
    'itemType', CASE WHEN v_result->>'outcome' = 'reused' THEN v_existing.item_type ELSE v_item_type END,
    'roleConfigurationIdentity', v_role
  );
END;
$$;

-- triage_project_ffe_items — base 00759_pieces_w5_residuals.sql:272. It locks the moving items FOR UPDATE, then UPDATEs design_disposition (an un-supersede reaches the label lock).
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
  v_received record;     -- 00759 (S2)
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

  -- 00808 (SQ-1121): the job label lock comes before any row lock.
  PERFORM public._ffe_lock_job_labels(v_project_id);

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
    -- 00759 (S2): a room keeps what it has received. Dropping the placement
    -- would delete its receipts (ON DELETE CASCADE), as in 00758 F12.
    SELECT room.name, received.total INTO v_received
    FROM public.project_ffe_placements p
    JOIN public.project_rooms room ON room.id = p.project_room_id
    CROSS JOIN LATERAL (
      SELECT sum(r.quantity) AS total
      FROM public.project_ffe_placement_receipts r WHERE r.placement_id = p.id
    ) received
    WHERE p.ffe_item_id = ANY (v_moving)
      AND received.total > 0
    ORDER BY p.ffe_item_id, p.sort_order, p.created_at, p.id
    LIMIT 1;
    IF FOUND THEN
      RAISE EXCEPTION '% has already received %. Record a change instead.',
        v_received.name, v_received.total
        USING ERRCODE = 'check_violation';
    END IF;
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

-- _apply_client_decision_authorized — base 00763_pieces_activation_room_scope.sql:576. It UPDATEs the items the decision blocked (row locks), then INSERTs the chosen option.
CREATE OR REPLACE FUNCTION public._apply_client_decision_authorized(
  p_decision_id uuid,
  p_selected_option_id uuid,
  p_actor uuid,
  p_client_consent_method text DEFAULT NULL,
  p_client_signature text DEFAULT NULL,
  p_client_note text DEFAULT NULL,
  p_quantity integer DEFAULT NULL
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_option public.client_decision_options%ROWTYPE;
  v_receipt public.project_approval_action_receipts%ROWTYPE;
  v_selected_option_id uuid;
  v_selected_outcome text;
  v_requested_signature text := NULLIF(
    btrim(COALESCE(p_client_signature, '')), ''
  );
  v_stored_signature text;
  v_room_id uuid;
  v_trade_price integer;
  v_markup numeric(5,2);
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  -- 00808 (SQ-1121): the job label lock comes before any item row lock
  -- (after the decision row, as _resolve_coordination_item_authorized has it).
  PERFORM public._ffe_lock_job_labels(v_decision.project_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found', p_decision_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_decision.approval_contract = 'project_artifact_v1' THEN
    IF p_actor IS DISTINCT FROM auth.uid()
       OR p_client_note IS NOT NULL
       OR (p_quantity IS NOT NULL AND p_quantity <> 1)
    THEN
      RAISE EXCEPTION
        'Stage-2 installed option response cannot carry comment or quantity evidence'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_decision.status = 'responded' THEN
      SELECT option.id, option.approval_outcome
      INTO v_selected_option_id, v_selected_outcome
      FROM public.client_decision_options AS option
      WHERE option.decision_id = p_decision_id
        AND option.selected
      ORDER BY option.id
      LIMIT 1;
      IF v_selected_option_id IS DISTINCT FROM p_selected_option_id THEN
        RAISE EXCEPTION 'decision % was already resolved with another option',
          p_decision_id
          USING ERRCODE = 'serialization_failure';
      END IF;

      SELECT * INTO v_receipt
      FROM public.project_approval_action_receipts AS receipt
      WHERE receipt.decision_id = p_decision_id
        AND receipt.action_kind = 'responded'
        AND receipt.idempotency_key =
            'installed-option:' || p_selected_option_id::text;
      v_stored_signature := NULLIF(
        btrim(COALESCE(v_decision.client_signature, '')), ''
      );
      IF v_receipt.id IS NULL
         OR v_receipt.actor_id IS DISTINCT FROM p_actor
         OR v_receipt.project_id IS DISTINCT FROM v_decision.project_id
         OR v_receipt.result->>'decisionId' IS DISTINCT FROM p_decision_id::text
         OR v_receipt.result->>'projectId' IS DISTINCT FROM v_decision.project_id::text
         OR v_receipt.result->>'optionId' IS DISTINCT FROM p_selected_option_id::text
         OR v_receipt.result->>'outcome' IS DISTINCT FROM v_selected_outcome
         OR v_decision.selected_by IS DISTINCT FROM p_actor
         OR v_decision.answered_by IS DISTINCT FROM p_actor
         OR v_decision.answer IS DISTINCT FROM v_selected_outcome
         OR p_client_consent_method IS DISTINCT FROM
            v_decision.client_consent_method
         OR v_requested_signature IS DISTINCT FROM v_stored_signature
      THEN
        RAISE EXCEPTION
          'installed Stage-2 response replay conflicts with immutable evidence'
          USING ERRCODE = 'unique_violation';
      END IF;
      RETURN v_decision;
    END IF;

    PERFORM public._respond_project_approval_checked(
      p_decision_id, NULL, p_selected_option_id, v_decision.updated_at,
      'installed-option:' || p_selected_option_id::text,
      p_client_consent_method, p_client_signature
    );
    SELECT * INTO STRICT v_decision
    FROM public.client_decisions
    WHERE id = p_decision_id;
    RETURN v_decision;
  END IF;

  -- Deterministic replay: repeating the same winning option returns the same
  -- terminal row; trying to overwrite a different winner is a stale conflict.
  IF v_decision.status = 'responded' THEN
    SELECT id INTO v_selected_option_id
    FROM public.client_decision_options
    WHERE decision_id = p_decision_id AND selected = true
    ORDER BY id
    LIMIT 1;
    IF v_selected_option_id IS NOT DISTINCT FROM p_selected_option_id THEN
      PERFORM public._enqueue_decision_notification(
        p_decision_id, 'decision_resolved'
      );
      RETURN v_decision;
    END IF;
    RAISE EXCEPTION 'decision % was already resolved with another option', p_decision_id
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'decision % cannot be applied from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.client_decision_options
  WHERE decision_id = p_decision_id
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_option
  FROM public.client_decision_options
  WHERE id = p_selected_option_id
    AND decision_id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'option % does not belong to decision %',
      p_selected_option_id, p_decision_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_quantity IS NOT NULL AND p_quantity < 1 THEN
    RAISE EXCEPTION 'decision option quantity must be at least 1'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_consent_method IS NOT NULL
     AND p_client_consent_method NOT IN ('electronic_signature', 'click_through')
  THEN
    RAISE EXCEPTION 'invalid client consent method %', p_client_consent_method
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_consent_method = 'electronic_signature'
     AND char_length(btrim(COALESCE(p_client_signature, ''))) < 2
  THEN
    RAISE EXCEPTION 'an electronic signature of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);

  UPDATE public.client_decision_options
  SET selected = (id = p_selected_option_id),
      client_note = CASE WHEN id = p_selected_option_id
        THEN COALESCE(p_client_note, client_note) ELSE client_note END,
      quantity = CASE WHEN id = p_selected_option_id
        THEN COALESCE(p_quantity, quantity) ELSE quantity END
  WHERE decision_id = p_decision_id;

  SELECT * INTO v_option
  FROM public.client_decision_options
  WHERE id = p_selected_option_id;

  UPDATE public.client_decisions
  SET status = 'responded',
      responded_at = now(),
      selected_by = p_actor,
      client_consent_method = p_client_consent_method,
      client_signature = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE NULLIF(btrim(COALESCE(p_client_signature, '')), '') END,
      client_consented_at = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE now() END,
      updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;

  UPDATE public.project_ffe_items
  SET blocked = false,
      blocked_reason = NULL,
      blocked_by_decision_id = NULL,
      last_status_change_at = now(),
      updated_at = now()
  WHERE blocked_by_decision_id = p_decision_id
    AND project_id = v_decision.project_id;

  -- Preserve 00175/00185's one-line-per-decision dual-pricing feed-through.
  IF v_decision.project_id IS NOT NULL
     AND v_option.product_id IS NOT NULL
     AND v_decision.blocking_status = 'non_blocking'
  THEN
    v_room_id := (
      SELECT room.id
      FROM public.project_rooms AS room
      WHERE room.id = v_decision.room_id
        AND room.project_id = v_decision.project_id
    );

    SELECT product.price_trade INTO v_trade_price
    FROM public.products AS product
    WHERE product.id = v_option.product_id;

    IF v_trade_price IS NULL OR v_trade_price < 0 THEN
      v_trade_price := GREATEST(COALESCE(v_option.price, 0), 0);
      v_markup := 0;
    ELSIF v_trade_price > 0
          AND COALESCE(v_option.price, 0) > v_trade_price
    THEN
      v_markup := LEAST(
        round(((COALESCE(v_option.price, 0)::numeric / v_trade_price) - 1) * 100, 2),
        999.99
      );
    ELSE
      v_markup := 0;
    END IF;

    -- 00763 (F18): the scope follows the room. With no room, a 'room' line
    -- becomes 'unassigned'; 'throughout' and 'unassigned' stay as they are.
    UPDATE public.project_ffe_items
    SET product_id = v_option.product_id,
        name = v_option.name,
        project_room_id = v_room_id,
        assignment_scope = CASE
          WHEN v_room_id IS NOT NULL THEN 'room'
          WHEN assignment_scope = 'room' THEN 'unassigned'
          ELSE assignment_scope
        END,
        quantity = COALESCE(v_option.quantity, 1),
        unit_price_cents = COALESCE(v_option.price, 0),
        trade_price_cents = v_trade_price,
        markup_percent = v_markup,
        line_total_cents = COALESCE(v_option.price, 0)
          * COALESCE(v_option.quantity, 1),
        currency = 'USD',
        updated_at = now()
    WHERE source_decision_id = p_decision_id;

    IF NOT FOUND THEN
      INSERT INTO public.project_ffe_items (
        project_id, project_room_id, assignment_scope, product_id, source_decision_id,
        name, item_type, status, quantity, unit_price_cents,
        trade_price_cents, markup_percent, line_total_cents
      ) VALUES (
        v_decision.project_id, v_room_id,
        CASE WHEN v_room_id IS NOT NULL THEN 'room' ELSE 'unassigned' END,
        v_option.product_id, p_decision_id,
        v_option.name, 'fixed', 'specified', COALESCE(v_option.quantity, 1),
        COALESCE(v_option.price, 0), v_trade_price, v_markup,
        COALESCE(v_option.price, 0) * COALESCE(v_option.quantity, 1)
      );
    END IF;

    IF jsonb_typeof(v_option.selection_snapshot) = 'array'
       AND jsonb_array_length(v_option.selection_snapshot) > 0
    THEN
      UPDATE public.project_ffe_specs AS spec
      SET material = COALESCE((
            SELECT string_agg(chosen.selection->>'valueLabel', ', '
                              ORDER BY chosen.ordinality)
            FROM jsonb_array_elements(v_option.selection_snapshot)
                 WITH ORDINALITY AS chosen(selection, ordinality)
            WHERE lower(chosen.selection->>'groupCode') = 'material'
          ), spec.material),
          finish = COALESCE((
            SELECT string_agg(chosen.selection->>'valueLabel', ', '
                              ORDER BY chosen.ordinality)
            FROM jsonb_array_elements(v_option.selection_snapshot)
                 WITH ORDINALITY AS chosen(selection, ordinality)
            WHERE lower(chosen.selection->>'groupCode') = 'finish'
          ), spec.finish),
          color_fabric = COALESCE((
            SELECT string_agg(chosen.selection->>'valueLabel', ', '
                              ORDER BY chosen.ordinality)
            FROM jsonb_array_elements(v_option.selection_snapshot)
                 WITH ORDINALITY AS chosen(selection, ordinality)
            WHERE lower(chosen.selection->>'groupCode')
                  IN ('color', 'colour', 'fabric', 'color_fabric', 'upholstery')
          ), spec.color_fabric),
          updated_at = now()
      WHERE spec.ffe_item_id IN (
              SELECT item.id
              FROM public.project_ffe_items AS item
              WHERE item.source_decision_id = p_decision_id
                AND item.project_id = v_decision.project_id
            )
        AND spec.configuration_locked_at IS NULL;
    END IF;
  END IF;

  PERFORM set_config('app.client_decision_write_id', '', true);
  PERFORM public._enqueue_decision_notification(
    p_decision_id, 'decision_resolved'
  );
  RETURN v_decision;
END;
$$;
