-- ═════════════════════════════════════════════════════════════════════════════════
-- 00326 — Schedule MEMORY: the write path into schedule_revisions
--          (R100 "Memory" — package Slice 05, §6)
--
-- 00323 created schedule_revisions as a SELECT-only-for-authenticated,
-- append-only ledger with UNIQUE(project_id, v) and a jsonb-array CHECK on
-- phase_snapshots; it deliberately shipped NO write path. This migration is
-- that write path — exactly one SECURITY DEFINER writer, hooked from the two
-- events that mint a revision:
--   • v1  — frozen at signature (activate_proposal_as_project)
--   • v2+ — one per committed ripple edit (commit_schedule_edit)
--
-- 1. NEW cut_schedule_revision(p_project_id, p_reason, p_actor) RETURNS int.
--    The ONE writer to schedule_revisions — SECURITY DEFINER + pinned
--    search_path 'public'. authenticated keeps 00323's SELECT-only posture on
--    the TABLE; it only gains EXECUTE on this guarded RPC, so the ledger is
--    append-only BY ACL (no INSERT/UPDATE/DELETE grant exists — direct writes
--    42501).
--    ACTOR RESOLUTION (the crux): p_actor DEFAULT auth.uid(), and the
--    ownership guard accepts the project's designer OR client. This is because
--    the v1 cut runs inside activate_proposal_as_project on the SIGNATURE
--    path, and sign_proposal (00210) runs as the CLIENT — a designer-only
--    guard would reject the client's own baseline cut. auth.uid() survives the
--    DEFINER hop (DEFINER swaps the role, not the request.jwt claims GUC that
--    auth.uid() reads), so the actor is always the real signing/editing user.
--    A non-member caller (neither designer nor client) raises.
--    SNAPSHOT: a jsonb ARRAY (satisfies 00323's jsonb_typeof='array' CHECK) of
--    phase objects ordered by sort_order, each carrying the RESOLVER-INPUT
--    field set { id, name, phase_key, duration_days, duration_weeks,
--    follows_phase_id, anchor_date, lane, start_date, target_end_date,
--    sort_order, status, milestones:[{ id, name, kind, offset_days,
--    anchor_date, status, sort_order }] } — everything the ONE TS resolver
--    (resolveSchedule) needs to re-derive baseline positions client-side
--    (S5-2/S5-3). plpgsql never computes the chain (R100).
--    v = COALESCE(MAX(v),0)+1 computed inline in the INSERT..SELECT. The read
--    and the write are one statement, but two concurrent cuts for the same
--    project can still both read MAX=n and race to v=n+1 — benign: the
--    UNIQUE(project_id, v) backstop (00323) fails the loser, which is correct
--    (a revision is never silently overwritten).
--
-- 2. REGRAFT activate_proposal_as_project — 00324's body VERBATIM + ONE delta.
--    Body lineage (whole-body CREATE OR REPLACE, carried forward whole):
--      00274 → 00279 → 00324 → 00326.
--    The ONLY change vs 00324: after the anchored-milestone insert (the last
--    write to project_phases / schedule_milestones), PERFORM
--    cut_schedule_revision(v_project_id, 'Baseline v1 — cut at signature').
--    Same signature (uuid, date) and return (uuid) as 00324 — plain
--    CREATE OR REPLACE, no DROP. Everything else (FF&E dual-pricing, the
--    two-pass follows remap, deposit auto-draft, palettes/boards, …) is
--    byte-identical to 00324.
--
-- 3. REGRAFT commit_schedule_edit — 00325's body VERBATIM + ONE delta.
--    The delta consumes the "Slice 05 hooks HERE" seam: after the edit loop,
--    PERFORM the cut and RETURN its v. ⚠ DECLARED BREAKING CHANGE: the return
--    type changes UUID → INTEGER (the new revision's v, not the old
--    p_project_id placeholder). CREATE OR REPLACE CANNOT change a function's
--    return type, so this is done idempotently as DROP FUNCTION IF EXISTS
--    (exact signature) + CREATE. The consuming hook (useCommitScheduleEdit)
--    is retyped in S5-2; today's callers treat the return as opaque.
--
-- No prod ship in this slice — the Spine gate stays OFF (package §6).
-- ══════════════════════════════════════════════════════════════════════════════════

-- ─── 1. cut_schedule_revision — the ONE writer to schedule_revisions ──────
CREATE OR REPLACE FUNCTION public.cut_schedule_revision(
  p_project_id UUID,
  p_reason     TEXT DEFAULT NULL,
  p_actor      UUID DEFAULT auth.uid()
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_snapshot JSONB;
  v_new_v    INTEGER;
BEGIN
  -- Actor guard: designer OR client of the project (see banner §1). Neither
  -- → raise. auth.uid() default carries through the DEFINER hop from the
  -- activation (client) and commit (designer) call sites.
  IF NOT EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = p_project_id
      AND (p.designer_id = p_actor OR p.client_id = p_actor)
  ) THEN
    RAISE EXCEPTION 'schedule revision refused: actor % is neither designer nor client of project % (or the project does not exist)',
      p_actor, p_project_id;
  END IF;

  -- Snapshot the resolver-input field set: an ARRAY of phases (ordered by
  -- sort_order) each embedding its milestones ARRAY. COALESCE guarantees a
  -- jsonb ARRAY even for a project with zero phases (00323 CHECK).
  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'id',               ph.id,
             'name',             ph.name,
             'phase_key',        ph.phase_key,
             'duration_days',    ph.duration_days,
             'duration_weeks',   ph.duration_weeks,
             'follows_phase_id', ph.follows_phase_id,
             'anchor_date',      ph.anchor_date,
             'lane',             ph.lane,
             'start_date',       ph.start_date,
             'target_end_date',  ph.target_end_date,
             'sort_order',       ph.sort_order,
             'status',           ph.status,
             'milestones', COALESCE((
               SELECT jsonb_agg(
                        jsonb_build_object(
                          'id',          sm.id,
                          'name',        sm.name,
                          'kind',        sm.kind,
                          'offset_days', sm.offset_days,
                          'anchor_date', sm.anchor_date,
                          'status',      sm.status,
                          'sort_order',  sm.sort_order
                        ) ORDER BY sm.sort_order, sm.id
                      )
               FROM public.schedule_milestones sm
               WHERE sm.phase_id = ph.id
             ), '[]'::jsonb)
           ) ORDER BY ph.sort_order, ph.id
         ), '[]'::jsonb)
    INTO v_snapshot
    FROM public.project_phases ph
   WHERE ph.project_id = p_project_id;

  -- v = next per-project sequence, computed inline. Benign race; the
  -- UNIQUE(project_id, v) backstop (00323) fails a loser rather than
  -- overwriting (see banner §1).
  INSERT INTO public.schedule_revisions (project_id, v, actor, reason, phase_snapshots)
  SELECT p_project_id,
         COALESCE(MAX(v), 0) + 1,
         p_actor,
         COALESCE(p_reason, 'Schedule revised'),
         v_snapshot
    FROM public.schedule_revisions
   WHERE project_id = p_project_id
  RETURNING v INTO v_new_v;

  RETURN v_new_v;
END;
$$;

COMMENT ON FUNCTION public.cut_schedule_revision(UUID, TEXT, UUID) IS
  'The ONE writer to schedule_revisions (R100 "Memory", Slice 05). SECURITY '
  'DEFINER so authenticated keeps 00323''s SELECT-only posture on the table '
  '(append-only by ACL). p_actor DEFAULT auth.uid(); the ownership guard '
  'accepts the project''s designer OR client because the v1 cut runs on the '
  'signature path, where sign_proposal executes as the client. Snapshots the '
  'resolver-input field set (phases + embedded milestones) as a jsonb array; '
  'v = MAX(v)+1 per project (UNIQUE backstop on the benign race). Returns the '
  'new revision''s v.';

-- Append-only BY ACL: authenticated gets EXECUTE on this guarded DEFINER RPC
-- (commit_schedule_edit runs SECURITY INVOKER and PERFORMs it as the caller,
-- so authenticated MUST hold EXECUTE) but NO table write grant — direct
-- INSERT/UPDATE/DELETE on schedule_revisions stays 42501.
REVOKE EXECUTE ON FUNCTION public.cut_schedule_revision(UUID, TEXT, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.cut_schedule_revision(UUID, TEXT, UUID) TO authenticated, service_role;

-- ─── 2. activate_proposal_as_project regraft (00324 body VERBATIM + 1 delta) ─
-- Body lineage: 00274 → 00279 → 00324 → 00326. The one delta is marked
-- "-- 00326:" — a PERFORM cut_schedule_revision after the milestone insert.
-- Same signature + return as 00324, so plain CREATE OR REPLACE (no DROP).
CREATE OR REPLACE FUNCTION public.activate_proposal_as_project(p_proposal_id uuid, p_start_date date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_proposal RECORD;
  v_project_id UUID;
  v_design_fee_total INTEGER := 0;
  v_ffe_budget_total INTEGER := 0;
  v_room RECORD;
  v_new_room_id UUID;
  v_item RECORD;
  v_item_notes TEXT;
  v_item_eta DATE;
  v_phase RECORD;
  v_new_phase_id UUID;
  v_milestone RECORD;
  v_new_milestone_id UUID;       -- 00274 delta
  v_kickoff_milestone_id UUID;   -- 00274 delta
  v_kickoff_amount_cents INTEGER; -- 00274 delta
  v_co_terms RECORD;
  v_team RECORD;
  v_section RECORD;
  v_palette RECORD;
  v_swatches JSONB;
  v_board RECORD;
  v_board_items JSONB;
  v_scope_room_map JSONB := '{}'::jsonb;
  v_exclusions JSONB;
  v_running_date DATE;
  v_phase_map JSONB := '{}'::jsonb;
BEGIN
  SELECT * INTO v_proposal
  FROM proposals
  WHERE id = p_proposal_id AND status = 'accepted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal % not found or not in accepted status', p_proposal_id;
  END IF;

  IF v_proposal.project_id IS NOT NULL THEN
    RAISE EXCEPTION 'Proposal % already activated as project %', p_proposal_id, v_proposal.project_id;
  END IF;

  SELECT COALESCE(SUM(fee_cents), 0) INTO v_design_fee_total
  FROM proposal_phases
  WHERE proposal_id = p_proposal_id;

  SELECT COALESCE(SUM(line_total_cents), 0) INTO v_ffe_budget_total
  FROM proposal_items
  WHERE proposal_id = p_proposal_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'description', pe.description,
    'category', pe.category
  ) ORDER BY pe.sort_order), '[]'::jsonb)
  INTO v_exclusions
  FROM proposal_exclusions pe
  WHERE pe.proposal_id = p_proposal_id;

  SELECT * INTO v_co_terms
  FROM proposal_change_order_terms
  WHERE proposal_id = p_proposal_id;

  INSERT INTO projects (
    proposal_id, designer_id, client_id, name, status, notes,
    budget_cents, total_amount_cents, design_fee_cents, start_date,
    site_address, kickoff_message, client_visibility_tier,
    scope_boundaries,
    change_order_terms,
    created_by
  ) VALUES (
    p_proposal_id,
    v_proposal.designer_id,
    v_proposal.client_id,
    v_proposal.title,
    'active',
    v_proposal.description,
    v_ffe_budget_total,
    v_proposal.total_amount,
    v_design_fee_total,
    p_start_date,
    v_proposal.project_address,
    v_proposal.personal_message,
    COALESCE(v_proposal.client_visibility_tier, 'milestone'),
    v_exclusions,
    CASE WHEN v_co_terms IS NOT NULL THEN jsonb_build_object(
      'process_description', v_co_terms.process_description,
      'hourly_rate_cents', v_co_terms.hourly_rate_cents,
      'minimum_fee_cents', v_co_terms.minimum_fee_cents,
      'approval_required', v_co_terms.approval_required
    ) ELSE '{}'::jsonb END,
    v_proposal.designer_id
  )
  RETURNING id INTO v_project_id;

  FOR v_room IN
    SELECT * FROM proposal_scope_rooms
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    INSERT INTO project_rooms (
      project_id, source_scope_room_id, room_id,
      name, room_type, dimensions, floor_area_sqft,
      budget_cents, ffe_categories, notes, sort_order
    ) VALUES (
      v_project_id, v_room.id, v_room.room_id,
      v_room.name, v_room.room_type, v_room.dimensions, v_room.floor_area_sqft,
      v_room.budget_cents, v_room.ffe_categories, v_room.notes, v_room.sort_order
    )
    RETURNING id INTO v_new_room_id;

    v_scope_room_map := v_scope_room_map || jsonb_build_object(v_room.id::text, v_new_room_id::text);

    FOR v_item IN
      SELECT * FROM proposal_items
      WHERE proposal_id = p_proposal_id AND scope_room_id = v_room.id
      ORDER BY position
    LOOP
      v_item_notes := COALESCE(v_item.notes, '');
      IF v_item.internal_notes IS NOT NULL AND length(trim(v_item.internal_notes)) > 0 THEN
        v_item_notes := CASE WHEN length(v_item_notes) > 0 THEN v_item_notes || E'\n\n' ELSE '' END
                        || 'Internal: ' || v_item.internal_notes;
      END IF;
      v_item_eta := CASE WHEN v_item.lead_time_weeks IS NOT NULL AND v_item.lead_time_weeks > 0
                         THEN p_start_date + (v_item.lead_time_weeks * 7)
                         ELSE NULL END;

      -- 00279: unit_price_cents = CLIENT price (unit_sell_price); trade price +
      -- markup carry alongside (restores the 00185 dual-pricing repair that
      -- 00199 reverted). line_total_cents was already the client total.
      -- GREATEST/COALESCE clamps mirror the 00185 tier-a backfill: negative
      -- trade/markup (writable via direct PostgREST, propagated by
      -- clone_proposal) would violate the 00185 >= 0 CHECKs and block activation.
      INSERT INTO project_ffe_items (
        project_id, project_room_id, source_proposal_item_id,
        product_id, name, ffe_category, item_type, doc_code, custom_fields,
        status, quantity, unit_price_cents, trade_price_cents, markup_percent, line_total_cents,
        budget_min_cents, budget_max_cents,
        vendor_id, vendor_name, eta, notes, sort_order
      ) VALUES (
        v_project_id, v_new_room_id, v_item.id,
        v_item.product_id, v_item.name, v_item.ffe_category, v_item.item_type, v_item.doc_code, v_item.custom_fields,
        'specified',
        v_item.quantity,
        v_item.unit_sell_price,
        GREATEST(COALESCE(v_item.unit_price, 0), 0),
        GREATEST(COALESCE(v_item.markup_percent, 0), 0),
        v_item.line_total_cents,
        v_item.budget_min_cents, v_item.budget_max_cents,
        v_item.vendor_id, v_item.vendor_name, v_item_eta,
        NULLIF(v_item_notes, ''),
        v_item.position
      );
    END LOOP;
  END LOOP;

  FOR v_item IN
    SELECT * FROM proposal_items
    WHERE proposal_id = p_proposal_id AND scope_room_id IS NULL
    ORDER BY position
  LOOP
    v_item_notes := COALESCE(v_item.notes, '');
    IF v_item.internal_notes IS NOT NULL AND length(trim(v_item.internal_notes)) > 0 THEN
      v_item_notes := CASE WHEN length(v_item_notes) > 0 THEN v_item_notes || E'\n\n' ELSE '' END
                      || 'Internal: ' || v_item.internal_notes;
    END IF;
    v_item_eta := CASE WHEN v_item.lead_time_weeks IS NOT NULL AND v_item.lead_time_weeks > 0
                       THEN p_start_date + (v_item.lead_time_weeks * 7)
                       ELSE NULL END;

    -- 00279: same dual-pricing mapping as the room loop above (restores 00185).
    INSERT INTO project_ffe_items (
      project_id, project_room_id, source_proposal_item_id,
      product_id, name, ffe_category, item_type, doc_code, custom_fields,
      status, quantity, unit_price_cents, trade_price_cents, markup_percent, line_total_cents,
      budget_min_cents, budget_max_cents,
      vendor_id, vendor_name, eta, notes, sort_order
    ) VALUES (
      v_project_id, NULL, v_item.id,
      v_item.product_id, v_item.name, v_item.ffe_category, v_item.item_type, v_item.doc_code, v_item.custom_fields,
      'specified',
      v_item.quantity,
      v_item.unit_sell_price,
      GREATEST(COALESCE(v_item.unit_price, 0), 0),
      GREATEST(COALESCE(v_item.markup_percent, 0), 0),
      v_item.line_total_cents,
      v_item.budget_min_cents, v_item.budget_max_cents,
      v_item.vendor_id, v_item.vendor_name, v_item_eta,
      NULLIF(v_item_notes, ''),
      v_item.position
    );
  END LOOP;

  -- Custom field DEFS (S6, 00268): copy the proposal's schedule columns onto
  -- project-owned rows (same field_key/name/kind/sort). The per-line VALUES ride
  -- along in project_ffe_items.custom_fields above, keyed by field_key —
  -- verbatim, no id remap.
  INSERT INTO spec_field_defs (project_id, field_key, name, kind, sort_order)
  SELECT v_project_id, field_key, name, kind, sort_order
  FROM spec_field_defs
  WHERE proposal_id = p_proposal_id;

  -- 00324 delta (1): TWO-PASS phase copy. Pass 1 inserts every project_phase
  -- with follows_phase_id NULL (a forward chain reference cannot be resolved in
  -- a single pass), carrying the chain columns duration_days / anchor_date /
  -- lane, and builds v_phase_map. The legacy start/target cascade is KEPT but
  -- now advances by duration_days when present (delta 2) — a naive compat
  -- approximation the gated Spine UI never reads (the resolver is TS-only).
  v_running_date := p_start_date;
  FOR v_phase IN
    SELECT * FROM proposal_phases
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    INSERT INTO project_phases (
      project_id, source_proposal_phase_id,
      name, phase_key, status,
      start_date, target_end_date, duration_weeks,
      duration_days, anchor_date, lane, follows_phase_id,   -- 00324: chain columns
      fee_cents, revision_limit, gate_condition,
      deliverables, sort_order
    ) VALUES (
      v_project_id, v_phase.id,
      v_phase.name, v_phase.phase_key,
      CASE v_phase.sort_order WHEN 0 THEN 'in_progress' ELSE 'pending' END,
      v_running_date,
      v_running_date + COALESCE(v_phase.duration_days, v_phase.duration_weeks * 7, 14),  -- 00324 delta (2)
      v_phase.duration_weeks,
      v_phase.duration_days, v_phase.anchor_date, v_phase.lane, NULL,   -- 00324: follows remapped in pass 2
      v_phase.fee_cents, v_phase.revision_limit, v_phase.gate_condition,
      v_phase.deliverables, v_phase.sort_order
    )
    RETURNING id INTO v_new_phase_id;

    v_phase_map := v_phase_map || jsonb_build_object(v_phase.id::text, v_new_phase_id::text);
    v_running_date := v_running_date + COALESCE(v_phase.duration_days, v_phase.duration_weeks * 7, 14);  -- 00324 delta (2)
  END LOOP;

  -- 00324 delta (1), pass 2: remap the follows chain now that v_phase_map holds
  -- every source→new phase pairing. Resolves forward references a single-pass
  -- insertion cannot.
  UPDATE project_phases pp
  SET follows_phase_id = (v_phase_map ->> src.follows_phase_id::text)::uuid
  FROM proposal_phases src
  WHERE pp.source_proposal_phase_id = src.id
    AND pp.project_id = v_project_id
    AND src.follows_phase_id IS NOT NULL;

  -- 00324 delta (3): translate anchored proposal milestones into project-side
  -- schedule_milestones. phase_id remaps through v_phase_map; anchor_date / kind
  -- / name / sort_order carry; offset_days is NULL and status is 'upcoming'
  -- (activation stamps the working status — R101.3). No schedule_revisions
  -- write (Slice 05).
  INSERT INTO schedule_milestones (phase_id, name, kind, offset_days, anchor_date, status, sort_order)
  SELECT (v_phase_map ->> psm.phase_id::text)::uuid,
         psm.name, psm.kind, NULL, psm.anchor_date, 'upcoming', psm.sort_order
  FROM proposal_schedule_milestones psm
  JOIN proposal_phases pp ON pp.id = psm.phase_id
  WHERE pp.proposal_id = p_proposal_id;

  -- 00326: Slice 05 memory — freeze the baseline. project_phases +
  -- schedule_milestones are now fully written (the two-pass follows remap
  -- above and this milestone insert are the last touches to either table),
  -- so cut the v1 revision snapshot. cut_schedule_revision is SECURITY
  -- DEFINER with p_actor DEFAULT auth.uid(); inside this DEFINER function
  -- auth.uid() STILL resolves to the signing session user (SECURITY DEFINER
  -- swaps the role, never the request.jwt GUC that auth.uid() reads), and
  -- that user is the proposal's client (sign_proposal, 00210) or designer
  -- (record_offline_signature, 00254) — the cut's designer-OR-client guard
  -- accepts either. NOT wrapped in an exception block (unlike the deposit
  -- auto-draft): the baseline is a hard guarantee of activation, not a
  -- best-effort side effect.
  PERFORM cut_schedule_revision(v_project_id, 'Baseline v1 — cut at signature');

  UPDATE projects SET target_end_date = v_running_date WHERE id = v_project_id;
  UPDATE projects SET current_phase = (
    SELECT phase_key FROM project_phases
    WHERE project_id = v_project_id
    ORDER BY sort_order LIMIT 1
  ) WHERE id = v_project_id;

  -- 00274: the kickoff milestone (sort_order = 0, seeded 'outstanding' at
  -- signing) is stamped trigger_kind = 'on_signing'. The NOT EXISTS guard is
  -- defensive-only — v_project_id is fresh from the INSERT above, so no
  -- project_payment_milestones row for it can already exist — but it keeps
  -- the invariant "at most one on_signing milestone per project" true even
  -- if this function is ever reached a second time for the same project.
  FOR v_milestone IN
    SELECT * FROM proposal_payment_milestones
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    INSERT INTO project_payment_milestones (
      project_id, phase_id, label, percentage,
      amount_cents, trigger_condition,
      status, due_date, sort_order,
      trigger_kind
    ) VALUES (
      v_project_id,
      CASE WHEN v_milestone.phase_id IS NOT NULL
        THEN (v_phase_map ->> v_milestone.phase_id::text)::UUID
        ELSE NULL
      END,
      v_milestone.label, v_milestone.percentage,
      v_milestone.amount_cents, v_milestone.trigger_condition,
      CASE v_milestone.sort_order WHEN 0 THEN 'outstanding' ELSE 'pending' END,
      CASE v_milestone.sort_order WHEN 0 THEN p_start_date ELSE NULL END,
      v_milestone.sort_order,
      CASE
        WHEN v_milestone.sort_order = 0
             AND NOT EXISTS (
               SELECT 1 FROM project_payment_milestones existing
               WHERE existing.project_id = v_project_id
                 AND existing.trigger_kind = 'on_signing'
             )
        THEN 'on_signing'
        ELSE NULL
      END
    )
    RETURNING id INTO v_new_milestone_id;

    IF v_milestone.sort_order = 0 THEN
      v_kickoff_milestone_id := v_new_milestone_id;
      v_kickoff_amount_cents := v_milestone.amount_cents;
    END IF;
  END LOOP;

  -- 00274: auto-draft the deposit invoice. Draft only (review-then-send per
  -- R26/R11 stands — the designer still uses Issue & Send). Guarded to
  -- amount_cents > 0 because draft_invoice_from_milestone (00204) has no
  -- zero-amount special case of its own. Wrapped so drafting can NEVER fail
  -- activation — a client signature must succeed even if this hits an edge
  -- case; the milestone simply stays undrafted for the designer to pick up
  -- manually via Generate-invoice (00204).
  IF v_kickoff_milestone_id IS NOT NULL AND v_kickoff_amount_cents > 0 THEN
    BEGIN
      PERFORM draft_invoice_from_milestone(v_kickoff_milestone_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'activate_proposal_as_project: deposit auto-draft failed for milestone % (project %): %',
        v_kickoff_milestone_id, v_project_id, SQLERRM;
    END;
  END IF;

  FOR v_team IN
    SELECT * FROM proposal_team_members
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order, created_at
  LOOP
    INSERT INTO project_team_members (
      project_id, user_id, role, permissions,
      assigned_by, assigned_at
    ) VALUES (
      v_project_id, v_team.user_id, v_team.role, COALESCE(v_team.permissions, '{}'::jsonb),
      v_proposal.designer_id, NOW()
    )
    ON CONFLICT (project_id, user_id, role) DO NOTHING;
  END LOOP;

  FOR v_section IN
    SELECT * FROM proposal_sections
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    INSERT INTO project_narrative_sections (
      project_id, source_section_id,
      type, title, body, metadata, sort_order
    ) VALUES (
      v_project_id, v_section.id,
      v_section.type, v_section.title, v_section.body,
      COALESCE(v_section.metadata, '{}'::jsonb), v_section.sort_order
    );
  END LOOP;

  FOR v_palette IN
    SELECT * FROM proposal_palettes
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'hex', ps.hex,
      'name', ps.name,
      'role', ps.role,
      'paint_color_id', ps.paint_color_id,
      'brand', ps.brand,
      'brand_code', ps.brand_code,
      'sort_order', ps.sort_order
    ) ORDER BY ps.sort_order), '[]'::jsonb)
    INTO v_swatches
    FROM palette_swatches ps
    WHERE ps.palette_id = v_palette.id;

    INSERT INTO project_palettes (
      project_id, source_palette_id,
      name, is_primary, source_image_url, notes,
      scope_room_id, swatches, sort_order
    ) VALUES (
      v_project_id, v_palette.id,
      v_palette.name, COALESCE(v_palette.is_primary, FALSE),
      v_palette.source_image_url, v_palette.notes,
      CASE WHEN v_palette.scope_room_id IS NOT NULL
        THEN (v_scope_room_map ->> v_palette.scope_room_id::text)::UUID
        ELSE NULL END,
      v_swatches, v_palette.sort_order
    );
  END LOOP;

  -- Mood boards (00180): snapshot each proposal board into project_boards
  -- with its items embedded as an ordered JSONB array. The board's scope
  -- room is remapped to the new project_rooms row the same way palettes are.
  FOR v_board IN
    SELECT * FROM proposal_boards
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'type', bi.type,
      'x', bi.x,
      'y', bi.y,
      'width', bi.width,
      'height', bi.height,
      'z_index', bi.z_index,
      'rotation', bi.rotation,
      'product_id', bi.product_id,
      'image_url', bi.image_url,
      'content', bi.content,
      'data', bi.data
    ) ORDER BY bi.z_index, bi.created_at), '[]'::jsonb)
    INTO v_board_items
    FROM proposal_board_items bi
    WHERE bi.board_id = v_board.id;

    INSERT INTO project_boards (
      project_id, source_board_id, name, project_room_id,
      cover_image_url, canvas_width, canvas_height, background_color,
      items, sort_order
    ) VALUES (
      v_project_id, v_board.id, v_board.name,
      CASE WHEN v_board.scope_room_id IS NOT NULL
        THEN (v_scope_room_map ->> v_board.scope_room_id::text)::UUID
        ELSE NULL END,
      v_board.cover_image_url, v_board.canvas_width, v_board.canvas_height,
      v_board.background_color,
      v_board_items, v_board.sort_order
    );
  END LOOP;

  UPDATE proposals SET project_id = v_project_id WHERE id = p_proposal_id;

  UPDATE designer_clients
  SET status = 'active', updated_at = NOW()
  WHERE designer_id = v_proposal.designer_id
    AND client_id = v_proposal.client_id
    AND status IN ('lead', 'proposal');

  RETURN v_project_id;
END;
$function$;

COMMENT ON FUNCTION public.activate_proposal_as_project(uuid, date) IS
  'Bridges an accepted proposal into an active project (body lineage: 00140 → 00167 → 00180 → 00185 → 00199 → 00262 → 00269 → 00274 → 00279 → 00324 → 00326). '
  '00279 reconciles the 00185 FF&E dual-pricing repair 00199 reverted; 00324 carries the schedule chain (two-pass follows remap + anchored milestone translation). '
  '00326 (Slice 05, R100 "Memory") adds ONE delta: after the milestone insert it PERFORMs cut_schedule_revision(project, ''Baseline v1 — cut at signature'') to freeze the v1 baseline — actor = the signing user via cut_schedule_revision''s auth.uid() default (designer-or-client guard). Everything else is byte-identical to 00324.';

-- ─── 3. commit_schedule_edit regraft (00325 body VERBATIM + 1 delta) ──────
-- The delta fills 00325's "Slice 05 hooks HERE" seam: cut the revision and
-- RETURN its v. ⚠ Return type changes UUID → INTEGER — CREATE OR REPLACE
-- cannot change a return type, so DROP first (idempotent, exact signature).
DROP FUNCTION IF EXISTS public.commit_schedule_edit(UUID, JSONB, TEXT);

CREATE OR REPLACE FUNCTION public.commit_schedule_edit(
  p_project_id UUID,
  p_edits      JSONB,
  p_reason     TEXT DEFAULT NULL
)
RETURNS INTEGER   -- 00326: was UUID (breaking; hook retyped in S5-2)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_edit           JSONB;
  v_kind           TEXT;
  v_phase_id       UUID;
  v_milestone_id   UUID;
  v_duration_days  INTEGER;
  v_anchor_date    DATE;
  v_offset_days    INTEGER;
  v_rows_affected  INTEGER;
  v_new_v          INTEGER;   -- 00326: the cut revision's v (now the return)
BEGIN
  -- Ownership guard (schema-qualified auth.uid() — search_path is pinned to
  -- 'public' above, so auth.uid() must be schema-qualified regardless).
  IF NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND designer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'project % not found or not owned by caller', p_project_id;
  END IF;

  IF p_edits IS NULL OR jsonb_typeof(p_edits) <> 'array' THEN
    RAISE EXCEPTION 'p_edits must be a JSON array of edit objects';
  END IF;

  FOR v_edit IN SELECT * FROM jsonb_array_elements(p_edits)
  LOOP
    v_kind := v_edit->>'kind';

    IF v_kind = 'phase-duration' THEN
      v_phase_id      := NULLIF(v_edit->>'phase_id', '')::uuid;
      v_duration_days := (v_edit->>'duration_days')::integer;

      -- Project-scoped WHERE: a phase_id belonging to a different project
      -- (or no project at all) matches zero rows here, never mutates
      -- anything, and falls straight into the not-found raise below.
      UPDATE public.project_phases
         SET duration_days = v_duration_days
       WHERE id = v_phase_id
         AND project_id = p_project_id;

      GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
      IF v_rows_affected = 0 THEN
        RAISE EXCEPTION 'phase % not found in project % (phase-duration edit)', v_phase_id, p_project_id;
      END IF;

    ELSIF v_kind = 'phase-anchor' THEN
      v_phase_id   := NULLIF(v_edit->>'phase_id', '')::uuid;
      v_anchor_date := (v_edit->>'anchor_date')::date;

      UPDATE public.project_phases
         SET anchor_date = v_anchor_date
       WHERE id = v_phase_id
         AND project_id = p_project_id;

      GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
      IF v_rows_affected = 0 THEN
        RAISE EXCEPTION 'phase % not found in project % (phase-anchor edit)', v_phase_id, p_project_id;
      END IF;

    ELSIF v_kind = 'milestone-offset' THEN
      v_milestone_id := NULLIF(v_edit->>'milestone_id', '')::uuid;
      v_phase_id      := NULLIF(v_edit->>'phase_id', '')::uuid;
      v_offset_days   := (v_edit->>'offset_days')::integer;

      -- Two project-scoped guards up front: the milestone's CURRENT host
      -- phase must belong to p_project_id (else it — or its whole project —
      -- is foreign and unreachable), and so must the edit's TARGET host
      -- phase (else this door could re-home a milestone onto another
      -- project's chain). Checked before the UPDATE so the single UPDATE by
      -- id below is provably safe.
      IF NOT EXISTS (
        SELECT 1 FROM public.schedule_milestones sm
        JOIN public.project_phases ph ON ph.id = sm.phase_id
        WHERE sm.id = v_milestone_id AND ph.project_id = p_project_id
      ) THEN
        RAISE EXCEPTION 'milestone % not found in project % (milestone-offset edit)', v_milestone_id, p_project_id;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.project_phases
        WHERE id = v_phase_id AND project_id = p_project_id
      ) THEN
        RAISE EXCEPTION 'host phase % not found in project % (milestone-offset edit)', v_phase_id, p_project_id;
      END IF;

      -- anchor_date := NULL unconditionally — see the banner's milestone-
      -- offset note (mirrors useUpdateScheduleMilestone's chip-unpin).
      UPDATE public.schedule_milestones
         SET phase_id    = v_phase_id,
             offset_days = v_offset_days,
             anchor_date = NULL
       WHERE id = v_milestone_id;

    ELSE
      RAISE EXCEPTION 'commit_schedule_edit: unknown edit kind %', v_kind;
    END IF;
  END LOOP;

  -- ═══════════════════════════════════════════════════════════════════════
  -- Slice 05 hooks HERE.
  --
  -- Once the mutations above land, Slice 05 (R100 "Memory") cuts the next
  -- numbered schedule_revisions row for p_project_id: snapshot every
  -- project_phases row for the project into phase_snapshots, set
  -- v = next sequence for this project, actor = auth.uid(), reason =
  -- p_reason (already accepted as a parameter today, unused until then),
  -- and RETURN the new revision's id instead of p_project_id below.
  -- schedule_revisions is append-only / RPC-only-write (00323) specifically
  -- so this is the only place that ever inserts into it.
  -- ═══════════════════════════════════════════════════════════════════════

  -- 00326: Slice 05 memory — the mutations above landed; cut the next
  -- numbered schedule_revisions row (snapshot of every project_phases row
  -- with its schedule_milestones) and RETURN ITS v. p_reason is now CONSUMED
  -- (accepted-but-unused in 00325). SECURITY INVOKER here, so auth.uid() is
  -- the designer this function already ownership-checked; the cut's
  -- designer-OR-client guard accepts them.
  v_new_v := cut_schedule_revision(p_project_id, p_reason);
  RETURN v_new_v;
END;
$$;

COMMENT ON FUNCTION public.commit_schedule_edit(UUID, JSONB, TEXT) IS
  'The ripple''s commit door (R100). Applies a batch of previewed '
  'RipplePendingEdit objects (phase-duration/phase-anchor/milestone-offset) '
  'to project_phases/schedule_milestones under an ownership + project-scoped '
  'guard; unknown kinds raise; milestone-offset always clears anchor_date. '
  '00326 (Slice 05): after the loop it cuts a numbered schedule_revisions row '
  'via cut_schedule_revision(p_project_id, p_reason) and RETURNS that '
  'revision''s v (INTEGER — was UUID/p_project_id in 00325; the hook is '
  'retyped in S5-2). p_reason is now consumed.';

REVOKE EXECUTE ON FUNCTION public.commit_schedule_edit(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.commit_schedule_edit(UUID, JSONB, TEXT) TO authenticated;

