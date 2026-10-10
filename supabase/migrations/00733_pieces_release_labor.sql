-- ═══════════════════════════════════════════════════════════════════════════
-- 00733 — Labor is released with its piece (US-21 slice 1, W2; T-13, SQ-619)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT §2 00733 (artifacts/pieces-building-room-2026-10-08/build/
-- CONTRACT.md). D5: a labor line (00729 line_kind 'labor', added by 00732
-- add_labor_line) goes to the client on the same authorization as its piece,
-- never alone and never later (ADV-5: "Release 7 lines · $30,760").
--
-- ── WHAT THIS CHANGES ───────────────────────────────────────────────────────
-- get_project_ffe_readiness(p_ffe_item_id uuid)
--   CREATE OR REPLACE base: 00445_ffe_release_authority_and_receiving.sql:5.
--   Full copy of the base plus: a labor line is ready only when its piece is
--   ready. Otherwise its missingFields gains the blocker key
--   'parent_not_ready'. The piece's readiness is this same function (one
--   level: a piece is never labor and never a child, 00729/00732).
--
-- _create_furnishings_authorization_from_schedule_00444_impl(...)
--   CREATE OR REPLACE base: 00578_design_build_kind.sql:2924 (the latest
--   definer). The wrappers above it are untouched: 00445's readiness gate
--   (renamed _create_furnishings_authorization_from_schedule_impl by 00462)
--   and 00462's public outer (00462:1408).
--   Full copy of the base plus, in step (2b) (after the authoring check):
--     - A labor line of this project named without its piece is refused:
--       'Labor is released with its piece.'
--     - The id set is expanded with every active (removed_at IS NULL) labor
--       child of an included piece.
--     - An added labor line passes the same readiness gate as a named line
--       (00445:116-121; the outer gate only saw the named ids). A piece whose
--       labor is not ready is refused with that labor line's blockers, rather
--       than released without it: labor left behind could never be released.
--   Everything else is the base, so each labor line is locked, proven
--   (price, quantity, room, not already named) and frozen like any other line,
--   and itemCount counts it.
--
-- Rough $ (rough_cents) enters neither function.
--
-- Grants: re-issued exactly as the base set them (readiness 00445:307-318;
-- impl 00445:85-86, closed to every API role). Adds GRANT/REVOKE → regenerate
-- supabase/seed/00-legacy-grants.sql (the W2 reset owner, T-17).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Readiness: labor is ready only with its piece ───────────────────────

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
       OR (v_rule = 'image' AND COALESCE(jsonb_array_length(v_spec.selected_media), 0) = 0)
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

REVOKE ALL ON FUNCTION public.get_project_ffe_readiness(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_ffe_readiness(uuid) TO authenticated;

-- ─── 2. The release: a piece takes its labor with it ────────────────────────

CREATE OR REPLACE FUNCTION public._create_furnishings_authorization_from_schedule_00444_impl(
  p_project_id uuid,
  p_name text,
  p_ffe_item_ids uuid[],
  p_deposit_percent numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_origin public.proposals%ROWTYPE;
  v_checkpoint public.project_budget_checkpoints%ROWTYPE;
  v_proposal_id uuid := extensions.gen_random_uuid();
  v_document_id uuid;
  v_name text := btrim(COALESCE(p_name, ''));
  v_ids uuid[];
  v_line public.project_ffe_items%ROWTYPE;
  v_id uuid;
  v_room_name text;
  v_price bigint;
  v_subtotal bigint := 0;
  v_deposit numeric;
  v_uncovered text;
  v_labor_ids uuid[];
  v_readiness jsonb;
BEGIN
  -- (1) Shape.
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'furnishings release requires an authenticated author and a name'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_ffe_item_ids IS NULL OR array_position(p_ffe_item_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'furnishings release requires a non-null list of schedule lines'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(array_agg(DISTINCT s), '{}'::uuid[]) INTO v_ids
  FROM unnest(p_ffe_item_ids) AS s;
  IF array_length(v_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'furnishings release requires at least one schedule line'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_deposit_percent IS NOT NULL
     AND (p_deposit_percent < 0 OR p_deposit_percent > 100) THEN
    RAISE EXCEPTION 'furnishings deposit percent must be between 0 and 100'
      USING ERRCODE = 'check_violation';
  END IF;

  -- (2) Project + authoring authority.
  SELECT * INTO v_project FROM public.projects WHERE id = p_project_id FOR SHARE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'project % not found or access denied', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- (2b) 00733 (D5): labor is released with its piece. A labor line named
  -- without its piece is refused; every active labor line of a named piece
  -- joins the set. Lines of another project fall through to step (5)'s
  -- refusal unchanged.
  IF EXISTS (
    SELECT 1 FROM public.project_ffe_items labor
    WHERE labor.id = ANY (v_ids)
      AND labor.project_id = p_project_id
      AND labor.line_kind = 'labor'
      AND (labor.parent_ffe_item_id IS NULL
           OR NOT (labor.parent_ffe_item_id = ANY (v_ids)))
  ) THEN
    RAISE EXCEPTION 'Labor is released with its piece.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT COALESCE(array_agg(labor.id ORDER BY labor.id), '{}'::uuid[]) INTO v_labor_ids
  FROM public.project_ffe_items labor
  WHERE labor.parent_ffe_item_id = ANY (v_ids)
    AND labor.project_id = p_project_id
    AND labor.line_kind = 'labor'
    AND labor.removed_at IS NULL
    AND NOT (labor.id = ANY (v_ids));
  -- The outer readiness gate (00445:116-121) saw only the named ids.
  FOREACH v_id IN ARRAY v_labor_ids
  LOOP
    v_readiness := public.get_project_ffe_readiness(v_id);
    IF NOT COALESCE((v_readiness->>'ready')::boolean, false) THEN
      RAISE EXCEPTION 'schedule line % is not ready for authorization: %',
        v_id, v_readiness->'missingFields'
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  SELECT array_agg(DISTINCT s) INTO v_ids
  FROM unnest(v_ids || v_labor_ids) AS s;

  -- (3) Executed design-services origin (00412 shape, byte-for-byte).
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = p_project_id AND d.is_origin
      AND d.document_kind IN ('design_services', 'design_build') AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', p_project_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- (4) The latest checkpoint must be settled AND still describe its version.
  -- Verifying the fingerprint here (not only at execution) fails the studio
  -- early, while the instrument is still cheap to abandon.
  SELECT checkpoint.* INTO v_checkpoint
  FROM public.project_budget_checkpoints checkpoint
  JOIN public.project_budget_versions version
    ON version.id = checkpoint.budget_version_id
  WHERE checkpoint.project_id = p_project_id
  ORDER BY version.version DESC, checkpoint.published_at DESC, checkpoint.id DESC
  LIMIT 1 FOR SHARE OF checkpoint;
  IF v_checkpoint.id IS NULL
     OR v_checkpoint.status NOT IN ('acknowledged', 'overridden') THEN
    RAISE EXCEPTION 'latest furnishings checkpoint must be acknowledged or audited override'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_checkpoint.snapshot_fingerprint IS DISTINCT FROM
     public._budget_version_fingerprint(v_checkpoint.budget_version_id) THEN
    RAISE EXCEPTION 'budget checkpoint no longer matches its published version'
      USING ERRCODE = 'check_violation';
  END IF;

  -- (5) Every named schedule line, locked and proven releasable.
  PERFORM 1 FROM public.project_ffe_items
  WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;

  FOREACH v_id IN ARRAY v_ids
  LOOP
    SELECT * INTO v_line FROM public.project_ffe_items WHERE id = v_id;
    IF NOT FOUND OR v_line.project_id IS DISTINCT FROM p_project_id THEN
      RAISE EXCEPTION 'schedule line % does not belong to project %', v_id, p_project_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- 00423: a trade presence line is not furniture. It is priced on its own
    -- scope and billed by that scope's draws, so releasing it here would put the
    -- same money on two instruments — and the single-provenance CHECK would only
    -- say so at the client's signature. Refuse it while it is still the studio's
    -- problem, by name, the way the purchase-order sibling does.
    IF v_line.trade_scope_document_id IS NOT NULL THEN
      RAISE EXCEPTION 'schedule line "%" is trade work on its own scope and cannot be released as furnishings',
        v_line.name
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_line.item_type = 'tbd' THEN
      RAISE EXCEPTION 'schedule line % is still TBD; resolve it before releasing', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- The allowance snapshot divides the ceiling by quantity, and quantity has
    -- no CHECK on project_ffe_items. A zero would raise a bare 22012 out of the
    -- release; a negative would sign a negative unit price into the snapshot.
    IF COALESCE(v_line.quantity, 0) <= 0 THEN
      RAISE EXCEPTION 'schedule line % has no quantity to authorize', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_line.item_type = 'fixed' THEN
      IF COALESCE(v_line.unit_price_cents, 0) <= 0 OR v_line.line_total_cents IS NULL THEN
        RAISE EXCEPTION 'fixed schedule line % has no client price to authorize', v_id
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF v_line.item_type = 'allowance' THEN
      IF COALESCE(v_line.budget_max_cents, 0) <= 0 THEN
        RAISE EXCEPTION 'allowance schedule line % has no ceiling to authorize', v_id
          USING ERRCODE = 'check_violation';
      END IF;
    ELSE
      RAISE EXCEPTION 'schedule line % has unsupported item type %', v_id, v_line.item_type
        USING ERRCODE = 'check_violation';
    END IF;
    -- A roomless line cannot be proven against a room-keyed budget, and the
    -- client's read has nowhere to file it. Distinct message on purpose: the
    -- studio's fix is to file the line, not to change the budget.
    IF v_line.project_room_id IS NULL THEN
      RAISE EXCEPTION 'schedule line % has no room; file it in a room before releasing', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.furnishing_authorization_items a
      JOIN public.project_commercial_documents d ON d.id = a.commercial_document_id
      JOIN public.proposals p ON p.id = d.proposal_id
      WHERE a.source_ffe_item_id = v_id
        AND COALESCE(p.commercial_state, 'draft') NOT IN ('declined', 'superseded')
    ) THEN
      RAISE EXCEPTION 'schedule line % is already named by a live authorization', v_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_line.source_commercial_document_id IS NOT NULL THEN
      RAISE EXCEPTION 'schedule line % is already bound to an executed authorization', v_id
        USING ERRCODE = 'check_violation';
    END IF;

    v_subtotal := v_subtotal + CASE
      WHEN v_line.item_type = 'fixed' THEN v_line.line_total_cents
      ELSE v_line.budget_max_cents END;
  END LOOP;

  -- (6) R6 COVERAGE, HARD. Every room in the release must be a room the client
  -- saw a budget for. There is deliberately NO drift check here: whether the
  -- schedule has outgrown its target is a conversation, not a constraint. That
  -- the room was never budgeted at all is a defect.
  SELECT r.name INTO v_uncovered
  FROM public.project_ffe_items i
  JOIN public.project_rooms r ON r.id = i.project_room_id
  WHERE i.id = ANY (v_ids)
    AND NOT EXISTS (
      SELECT 1 FROM public.project_budget_lines l
      WHERE l.budget_version_id = v_checkpoint.budget_version_id
        AND l.project_room_id = i.project_room_id
    )
  ORDER BY r.name
  LIMIT 1;
  IF v_uncovered IS NOT NULL THEN
    RAISE EXCEPTION 'room "%" is not covered by the acknowledged budget', v_uncovered
      USING ERRCODE = 'check_violation';
  END IF;

  -- (7) Deposit: explicit argument, else the signed agreement's standing term,
  -- else the house default.
  -- LEFT JOIN, not JOIN: an inner join drops an authority with no terms row
  -- BEFORE the ORDER BY/LIMIT, so the answer would silently come from an older
  -- authority instead of the newest one. The newest active authority decides,
  -- and if it names no term the house default does.
  v_deposit := COALESCE(
    p_deposit_percent,
    (SELECT t.furnishings_deposit_percent
     FROM public.project_billing_authorities ba
     LEFT JOIN public.proposal_service_terms t ON t.proposal_id = ba.source_proposal_id
     WHERE ba.project_id = p_project_id AND ba.status = 'active'
     ORDER BY ba.effective_at DESC
     LIMIT 1),
    50
  );

  -- (8) The client-facing edition. Identities come from the executed origin
  -- (00412:1941-1956 shape) — there is no source draft to inherit them from.
  -- NOTE: no proposal_items clone. The schedule IS the line population.
  SELECT origin_proposal.* INTO v_origin
  FROM public.project_commercial_documents origin
  JOIN public.proposals origin_proposal ON origin_proposal.id = origin.proposal_id
  WHERE origin.project_id = p_project_id AND origin.is_origin
    AND origin.document_kind IN ('design_services', 'design_build')
    AND origin_proposal.commercial_state = 'executed'
  LIMIT 1;

  INSERT INTO public.proposals (
    id, designer_id, client_id, designer_client_id, title, description,
    subtotal, discount_amount, discount_percent, tax_rate, tax_amount,
    total_amount, deposit_percent, status, version, project_address,
    client_visibility_tier, feedback_enabled, document_kind, commercial_state
  ) VALUES (
    v_proposal_id, v_project.designer_id, v_project.client_id,
    v_origin.designer_client_id, v_name,
    'Furnishings released from the project schedule.',
    public._cents_to_int4(v_subtotal, 'this release'), 0, 0, 0, 0,
    public._cents_to_int4(v_subtotal, 'this release'), v_deposit, 'draft', 1,
    v_origin.project_address, 'full', v_origin.feedback_enabled,
    'furnishings_authorization', 'draft'
  );

  -- (9) Bind it to the project and the checkpoint it was proven against.
  INSERT INTO public.project_commercial_documents (
    project_id, proposal_id, document_kind, wave_name, budget_checkpoint_id,
    created_by
  ) VALUES (
    p_project_id, v_proposal_id, 'furnishings_authorization', v_name,
    v_checkpoint.id, v_actor
  ) RETURNING id INTO v_document_id;

  -- (10) Freeze each line. An allowance is authorized at its CEILING: the
  -- client signs for "up to this much", and the per-unit figure is that ceiling
  -- divided by quantity. Integer division truncates, so for quantity > 1 the
  -- unit price can round down by up to (quantity - 1) cents against the
  -- ceiling — deliberate: client_line_total_cents is the authoritative ceiling
  -- and the guard compares totals, never quantity × unit.
  FOREACH v_id IN ARRAY v_ids
  LOOP
    SELECT * INTO v_line FROM public.project_ffe_items WHERE id = v_id;
    SELECT r.name INTO v_room_name FROM public.project_rooms r
    WHERE r.id = v_line.project_room_id;
    v_price := CASE WHEN v_line.item_type = 'fixed'
      THEN v_line.line_total_cents ELSE v_line.budget_max_cents END;

    INSERT INTO public.furnishing_authorization_items (
      commercial_document_id, source_proposal_item_id, source_ffe_item_id,
      project_room_id, product_id, name, room_name, category, item_type,
      quantity, client_unit_price_cents, client_line_total_cents,
      trade_unit_cost_cents, markup_percent, vendor_id, vendor_name,
      snapshot, sort_order
    ) VALUES (
      v_document_id, NULL, v_line.id, v_line.project_room_id, v_line.product_id,
      v_line.name, v_room_name, COALESCE(v_line.ffe_category, 'Uncategorized'),
      v_line.item_type, v_line.quantity,
      CASE WHEN v_line.item_type = 'fixed' THEN v_line.unit_price_cents
           ELSE (v_line.budget_max_cents / v_line.quantity)::integer END,
      v_price::integer,
      v_line.trade_price_cents, v_line.markup_percent, v_line.vendor_id,
      v_line.vendor_name,
      jsonb_build_object(
        'budgetMinCents', v_line.budget_min_cents,
        'budgetMaxCents', v_line.budget_max_cents,
        'docCode', v_line.doc_code,
        'customFields', v_line.custom_fields,
        'notes', v_line.notes,
        'productImageUrl', (SELECT pr.images[1] FROM public.products pr
                            WHERE pr.id = v_line.product_id)
      ),
      v_line.sort_order
    );
  END LOOP;

  -- No GUC save/restore here on purpose: unlike the send/execute/void rails,
  -- this body sets no transaction-local capability. Every write it makes is
  -- authorized by being SECURITY DEFINER (the ledger guard's postgres check);
  -- an exception handler that restores a setting nothing set would read as
  -- load-bearing and is not.
  RETURN jsonb_build_object(
    'proposalId', v_proposal_id,
    'documentId', v_document_id,
    'projectId', p_project_id,
    'waveName', v_name,
    'commercialState', 'draft',
    'budgetCheckpointId', v_checkpoint.id,
    'itemCount', array_length(v_ids, 1),
    'documentFingerprint', public._commercial_document_fingerprint(v_proposal_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public._create_furnishings_authorization_from_schedule_00444_impl(uuid, text, uuid[], numeric)
  FROM PUBLIC, anon, authenticated, service_role;
