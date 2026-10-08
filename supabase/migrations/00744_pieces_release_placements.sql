-- ═══════════════════════════════════════════════════════════════════════════
-- 00744 — The authorization freezes each line's rooms
--         (US-21 slice 3, W4, D7 phase 2; T-36, SQ-642)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRACT §2 00744 (artifacts/pieces-building-room-2026-10-08/build/
-- CONTRACT.md). A line placed in several rooms (00734/00737
-- project_ffe_placements) is released as ONE authorization row. Its frozen
-- snapshot names every room and its share. It is never split into one row per
-- room, and never frozen with only the primary room. room_name and
-- project_room_id stay the primary room, so every reader that knows nothing of
-- placements (iOS, 00441, 00580, 00638) prints the primary room and never splits
-- money by room.
--
-- ── WHAT THIS CHANGES ───────────────────────────────────────────────────────
-- _furnishing_authorization_item_snapshot(project_ffe_items) — NEW.
--   The one definition of a frozen line's snapshot. The release impl writes it,
--   and the insert guard re-derives it from the source line and compares. Before
--   this file each kept its own copy of the jsonb_build_object (00733 step 10,
--   00462:1495-1505). Five keys are added to the six it already had, and their
--   expressions are 00735's spec-book snapshot keys verbatim (00735:74-83,
--   :172-182):
--     unit             NULLIF(i.unit, 'each')            NULL means 'each'
--     needLabel        the thread's need_label, NULL when it equals the name
--     lineKind         NULLIF(i.line_kind, 'goods')      NULL means 'goods'
--     parentFfeItemId  the piece, only on a labor line (a COM child's parent
--                      stays out)
--     placements       NULL unless the line has more than one placement;
--                      otherwise [{roomName, quantity, areaNote}] in
--                      placement order (sort_order, created_at, id)
--   Unlike the spec book, this snapshot is not null-stripped (the base never
--   was), so every key is present and a default key reads JSON null.
--
-- _create_furnishings_authorization_from_schedule_00444_impl(...)
--   CREATE OR REPLACE base: 00733_pieces_release_labor.sql:134 (the W2
--   rewrite, step (2b) included; 00737 does not touch it). Full copy of the
--   base. The only change is step (10): snapshot :=
--   _furnishing_authorization_item_snapshot(v_line).
--
-- guard_furnishing_authorization_item_insert()
--   CREATE OR REPLACE base: 00462_workflow_privacy_authority.sql:1449 (the
--   only definer). Full copy of the base. The only change is v_expected_snapshot
--   := _furnishing_authorization_item_snapshot(v_source). Without it every
--   release from an API session would be refused as "does not match its
--   canonical draft/source", because the guard compares the whole snapshot.
--   The trigger itself (00462) is unchanged.
--
-- Existing authorization rows are untouched. Their snapshots and document
-- fingerprints (00577:188 hashes the snapshot) were frozen at release.
--
-- Rough $ (rough_cents) enters none of these.
--
-- Grants: the impl's and the guard's are re-issued exactly as their bases set
-- them (closed to every API role). The new helper is closed to every API role
-- too. Adds GRANT/REVOKE → regenerate supabase/seed/00-legacy-grants.sql (the
-- W4 reset owner).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. The frozen snapshot of one released line ───────────────────────────

CREATE OR REPLACE FUNCTION public._furnishing_authorization_item_snapshot(
  p_line public.project_ffe_items
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'budgetMinCents', p_line.budget_min_cents,
    'budgetMaxCents', p_line.budget_max_cents,
    'docCode', p_line.doc_code,
    'customFields', p_line.custom_fields,
    'notes', p_line.notes,
    'productImageUrl', (SELECT pr.images[1] FROM public.products pr
                        WHERE pr.id = p_line.product_id),
    'unit', NULLIF(p_line.unit, 'each'),
    'needLabel', (SELECT NULLIF(t.need_label, p_line.name)
                  FROM public.project_ffe_selection_threads t
                  WHERE t.id = p_line.selection_thread_id),
    'lineKind', NULLIF(p_line.line_kind, 'goods'),
    'parentFfeItemId', CASE WHEN p_line.line_kind = 'labor'
                            THEN p_line.parent_ffe_item_id END,
    'placements', (
      SELECT CASE WHEN count(*) > 1 THEN jsonb_agg(jsonb_build_object(
          'roomName', room.name,
          'quantity', fp.quantity,
          'areaNote', fp.area_note
        ) ORDER BY fp.sort_order, fp.created_at, fp.id)
      END
      FROM public.project_ffe_placements fp
      JOIN public.project_rooms room ON room.id = fp.project_room_id
      WHERE fp.ffe_item_id = p_line.id
    )
  );
$$;

REVOKE ALL ON FUNCTION public._furnishing_authorization_item_snapshot(public.project_ffe_items)
  FROM PUBLIC, anon, authenticated, service_role;

-- ─── 2. The release freezes it ─────────────────────────────────────────────

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
      -- 00744 (D7 phase 2): one row per line, whatever its rooms. room_name
      -- above stays the primary; the snapshot names every room and its share.
      public._furnishing_authorization_item_snapshot(v_line),
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

-- ─── 3. The insert guard re-derives it ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_furnishing_authorization_item_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_project_id uuid;
  v_source public.project_ffe_items%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_proposal public.proposals%ROWTYPE;
  v_room_name text;
  v_expected_total integer;
  v_expected_unit integer;
  v_expected_snapshot jsonb;
BEGIN
  IF current_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION 'authorization items are inserted only by the canonical release RPC'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF current_user = 'postgres'
     AND session_user = 'postgres'
     AND COALESCE(current_setting('role', true), 'none') = 'none'
  THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'furnishings release requires an authenticated actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_project_id := NULLIF(current_setting(
    'app.furnishing_authorization_project_id', true
  ), '')::uuid;
  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE id = NEW.commercial_document_id;
  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = v_document.proposal_id;
  SELECT * INTO v_source FROM public.project_ffe_items
  WHERE id = NEW.source_ffe_item_id;
  SELECT room.name INTO v_room_name FROM public.project_rooms AS room
  WHERE room.id = v_source.project_room_id;
  v_expected_total := CASE WHEN v_source.item_type = 'fixed'
    THEN v_source.line_total_cents ELSE v_source.budget_max_cents END;
  v_expected_unit := CASE WHEN v_source.item_type = 'fixed'
    THEN v_source.unit_price_cents
    ELSE (v_source.budget_max_cents / v_source.quantity)::integer END;
  -- 00744: the same definition the release writes (D7 phase 2 keys included).
  v_expected_snapshot := public._furnishing_authorization_item_snapshot(v_source);

  IF v_project_id IS NULL
     OR v_document.project_id IS DISTINCT FROM v_project_id
     OR v_document.document_kind <> 'furnishings_authorization'
     OR v_document.executed_at IS NOT NULL
     OR v_proposal.document_kind <> 'furnishings_authorization'
     OR v_proposal.status <> 'draft'
     OR v_proposal.commercial_state <> 'draft'
     OR v_source.project_id IS DISTINCT FROM v_project_id
     OR v_source.source_commercial_document_id IS NOT NULL
     OR NEW.source_proposal_item_id IS NOT NULL
     OR NEW.project_room_id IS DISTINCT FROM v_source.project_room_id
     OR NEW.product_id IS DISTINCT FROM v_source.product_id
     OR NEW.name IS DISTINCT FROM v_source.name
     OR NEW.room_name IS DISTINCT FROM v_room_name
     OR NEW.category IS DISTINCT FROM COALESCE(v_source.ffe_category, 'Uncategorized')
     OR NEW.item_type IS DISTINCT FROM v_source.item_type
     OR NEW.quantity IS DISTINCT FROM v_source.quantity
     OR NEW.client_unit_price_cents IS DISTINCT FROM v_expected_unit
     OR NEW.client_line_total_cents IS DISTINCT FROM v_expected_total
     OR NEW.trade_unit_cost_cents IS DISTINCT FROM v_source.trade_price_cents
     OR NEW.markup_percent IS DISTINCT FROM v_source.markup_percent
     OR NEW.vendor_id IS DISTINCT FROM v_source.vendor_id
     OR NEW.vendor_name IS DISTINCT FROM v_source.vendor_name
     OR NEW.snapshot IS DISTINCT FROM v_expected_snapshot
     OR NEW.sort_order IS DISTINCT FROM v_source.sort_order
  THEN
    RAISE EXCEPTION 'authorization item does not match its canonical draft/source'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_furnishing_authorization_item_insert()
  FROM PUBLIC, anon, authenticated, service_role;
