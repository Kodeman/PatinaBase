-- ═══════════════════════════════════════════════════════════════════════════
-- 00585 — return to lead: undo an accidental Accept · begin
--
-- INTENT
-- "Accept · begin" is one click and it navigates away. Nothing in the database
-- forbids putting a lead back (leads.status is bare text, no CHECK, no
-- transition trigger), but nothing offered it either, so a mis-click left the
-- studio with a Discovery folder it never meant to open. This adds the reversal
-- as a first-class act, with the one rule that makes it safe: an undo only
-- exists while it is still an undo. The moment real content exists, or the
-- client has been written to, the door closes and says why.
--
-- NUMBER
-- 00585, not 00584 as briefed. origin/main already carries
-- 00584_studio_comember_rls_sweep.sql (verified with `git ls-tree origin/main`),
-- and this branch's base carries 00583_lead_contact_phone.sql. Two files with
-- the same numeric prefix are one migration version to the Supabase CLI, so
-- 00584 was not free. 00585 is. Ordering is safe either way — the sweep writes
-- policies, this file writes two new functions and touches no existing object.
--
-- LINEAGE
-- Nothing existing is redefined. Both functions are new. The authority
-- predicate is public._can_author_proposal(uuid) (00387:533) — read from the
-- CURRENT body of public.begin_discovery (00386 → 00399 → 00583:157), which is
-- the act this one reverses, so the two agree on who may act by construction.
-- The exact designer, or an active non-guest peer in the same active
-- design_studio. begin_discovery is NOT redefined here.
--
-- WHAT COUNTS AS "STILL AN UNDO"
-- The check refuses when ANY of these is true. Each is one plain sentence back
-- to the designer; the UI prints it as helper text under a disabled action.
--   1. The relationship carries no lead_id — there is no Brief to return to.
--   2. designer_clients.status <> 'lead' — the relationship has moved on.
--   3. leads.status <> 'accepted' — the lead is not where Accept left it.
--   4. leads.client_request_id IS NOT NULL — the app-matched (ceremony) path
--      writes to the client before the designer ever sees the folder.
--   5. Any row anchored to this relationship in: proposals, project_documents
--      (the folio), margin_notes, client_activity_log, match_ceremonies (by
--      designer_client_id OR by the lead), client_decisions, client_invitations,
--      client_messages, client_nurture_touchpoints, client_reviews,
--      fulfillment_orders. That list is every table with a
--      designer_client_id foreign key, not only the five the brief named:
--      each of them is either content the studio made or a message the client
--      received, and the ruling closes the door on both.
--   6. A direct thread between this designer and this client's profile — the
--      ceremony's intro thread, or any direct thread opened since.
--   7. client_discovery holds user-entered content. Columns checked, being
--      every column except id / designer_client_id / designer_id / created_at /
--      updated_at: project_type, project_type_custom, budget_min_cents,
--      budget_max_cents, budget_basis, target_date, hard_date, start_urgency,
--      site_notes, room_scan_id, ready_at, seeded_proposal_id, seeded_at
--      (all NULL when untouched), and rooms, lifestyle, keep_items,
--      avoid_items, decision_makers (default '[]'::jsonb), style_tag_ids,
--      style_keywords (default '{}'). A bare row with every column at its
--      default is not content, so a Discovery folder opened and never typed in
--      still reverses.
--
-- NO SEEDED ACTIVITY TO ALLOW FOR
-- The brief allows for "client_activities beyond the discovery-seeded ones".
-- There are none: the table is public.client_activity_log, begin_discovery
-- writes no row to it, and no trigger on designer_clients does either (the
-- three that exist are updated_at, the Aesthete client_added dispatch, and the
-- two 00583 hydration/normalization triggers). So ANY row refuses.
--
-- SILENT TO THE CLIENT, BY DESIGN
-- 00332's lead notification trigger fires only on a transition INTO
-- accepted / declined / expired. Returning to 'new' fires nothing, which is the
-- intent: the client was never told the lead was accepted on this path (the
-- path that tells them is the ceremony path, and that path refuses).
--
-- THE DELETE
-- return_to_lead deletes the designer_clients row rather than demoting it. The
-- row was created by begin_discovery and, by the checks above, holds nothing.
-- Its cascade removes the empty client_discovery row with it. Leaving a
-- status='lead' relationship behind would emit a second Desk folder beside the
-- restored Brief (document_state Shape D and Shape C would both match).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. return_to_lead_check — the door, and the reason it is shut ───────────

CREATE OR REPLACE FUNCTION public.return_to_lead_check(
  p_designer_client_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor        uuid := auth.uid();
  v_relationship public.designer_clients%ROWTYPE;
  v_lead         public.leads%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'return_to_lead_check requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_relationship
  FROM public.designer_clients
  WHERE id = p_designer_client_id;

  -- Same authority predicate begin_discovery uses, and the same conflated
  -- "not found or denied" message, so a caller outside the studio cannot use
  -- this to learn whether a relationship id exists.
  IF NOT FOUND OR NOT public._can_author_proposal(v_relationship.designer_id) THEN
    RAISE EXCEPTION 'client relationship % not found or access denied',
      p_designer_client_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_relationship.lead_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'This client did not arrive as a lead, so there is no lead to go back to.',
      'lead_id', NULL
    );
  END IF;

  IF v_relationship.status <> 'lead' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'This client has already moved past Discovery.',
      'lead_id', v_relationship.lead_id
    );
  END IF;

  SELECT * INTO v_lead
  FROM public.leads
  WHERE id = v_relationship.lead_id;

  IF NOT FOUND OR v_lead.status <> 'accepted' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'The lead behind this client is no longer waiting to be accepted.',
      'lead_id', v_relationship.lead_id
    );
  END IF;

  IF v_lead.client_request_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'This client was matched through the app and has already been written to.',
      'lead_id', v_relationship.lead_id
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.proposals
    WHERE designer_client_id = p_designer_client_id
  ) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'A proposal has already been started for this client.',
      'lead_id', v_relationship.lead_id
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.project_documents
    WHERE designer_client_id = p_designer_client_id
  ) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'The folio already holds a document for this client.',
      'lead_id', v_relationship.lead_id
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.margin_notes
    WHERE designer_client_id = p_designer_client_id
  ) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'There is already a note in the margin for this client.',
      'lead_id', v_relationship.lead_id
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.client_activity_log
    WHERE designer_client_id = p_designer_client_id
  ) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'This client already has activity on the record.',
      'lead_id', v_relationship.lead_id
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.match_ceremonies
    WHERE designer_client_id = p_designer_client_id
       OR lead_id = v_relationship.lead_id
  ) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'An arrival has already been prepared for this client.',
      'lead_id', v_relationship.lead_id
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.client_decisions
    WHERE designer_client_id = p_designer_client_id
  ) OR EXISTS (
    SELECT 1 FROM public.client_invitations
    WHERE designer_client_id = p_designer_client_id
  ) OR EXISTS (
    SELECT 1 FROM public.client_messages
    WHERE designer_client_id = p_designer_client_id
  ) OR EXISTS (
    SELECT 1 FROM public.client_nurture_touchpoints
    WHERE designer_client_id = p_designer_client_id
  ) OR EXISTS (
    SELECT 1 FROM public.client_reviews
    WHERE designer_client_id = p_designer_client_id
  ) OR EXISTS (
    SELECT 1 FROM public.fulfillment_orders
    WHERE designer_client_id = p_designer_client_id
  ) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'This client has already been written to.',
      'lead_id', v_relationship.lead_id
    );
  END IF;

  IF v_relationship.client_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.comms_threads t
    JOIN public.comms_thread_participants dp
      ON dp.thread_id = t.id
     AND dp.profile_id = v_relationship.designer_id
     AND dp.left_at IS NULL
    JOIN public.comms_thread_participants cp
      ON cp.thread_id = t.id
     AND cp.profile_id = v_relationship.client_id
     AND cp.left_at IS NULL
    WHERE t.kind = 'direct'
  ) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'A thread with this client is already open.',
      'lead_id', v_relationship.lead_id
    );
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.client_discovery cd
    WHERE cd.designer_client_id = p_designer_client_id
      AND (
        cd.project_type IS NOT NULL
        OR cd.project_type_custom IS NOT NULL
        OR cd.budget_min_cents IS NOT NULL
        OR cd.budget_max_cents IS NOT NULL
        OR cd.budget_basis IS NOT NULL
        OR cd.target_date IS NOT NULL
        OR cd.hard_date IS NOT NULL
        OR cd.start_urgency IS NOT NULL
        OR cd.site_notes IS NOT NULL
        OR cd.room_scan_id IS NOT NULL
        OR cd.ready_at IS NOT NULL
        OR cd.seeded_proposal_id IS NOT NULL
        OR cd.seeded_at IS NOT NULL
        OR cd.rooms IS DISTINCT FROM '[]'::jsonb
        OR cd.lifestyle IS DISTINCT FROM '[]'::jsonb
        OR cd.keep_items IS DISTINCT FROM '[]'::jsonb
        OR cd.avoid_items IS DISTINCT FROM '[]'::jsonb
        OR cd.decision_makers IS DISTINCT FROM '[]'::jsonb
        OR cd.style_tag_ids IS DISTINCT FROM '{}'::uuid[]
        OR cd.style_keywords IS DISTINCT FROM '{}'::text[]
      )
  ) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'Discovery has already been filled in for this client.',
      'lead_id', v_relationship.lead_id
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'reason', NULL,
    'lead_id', v_relationship.lead_id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.return_to_lead_check(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.return_to_lead_check(uuid) TO authenticated;

COMMENT ON FUNCTION public.return_to_lead_check(uuid) IS
  'Whether an accidental Accept - begin can still be undone for this '
  'relationship, and if not, one plain sentence saying why. Returns '
  '{allowed, reason, lead_id}. Raises insufficient_privilege for a caller who '
  'is neither the designer nor an active non-guest peer in the same active '
  'design_studio (00585).';

-- ── 2. return_to_lead — the reversal itself ────────────────────────────────

CREATE OR REPLACE FUNCTION public.return_to_lead(
  p_designer_client_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor        uuid := auth.uid();
  v_relationship public.designer_clients%ROWTYPE;
  v_check        jsonb;
  v_lead_id      uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'return_to_lead requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Lock the relationship before the check reads it, the same way
  -- begin_discovery locks the lead before it writes: two designers clicking
  -- Undo at once must not both pass a check that was true only once.
  SELECT * INTO v_relationship
  FROM public.designer_clients
  WHERE id = p_designer_client_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_relationship.designer_id) THEN
    RAISE EXCEPTION 'client relationship % not found or access denied',
      p_designer_client_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_relationship.lead_id IS NOT NULL THEN
    PERFORM 1 FROM public.leads WHERE id = v_relationship.lead_id FOR UPDATE;
  END IF;

  v_check := public.return_to_lead_check(p_designer_client_id);

  IF NOT (v_check->>'allowed')::boolean THEN
    RAISE EXCEPTION '%', v_check->>'reason'
      USING ERRCODE = 'check_violation';
  END IF;

  v_lead_id := (v_check->>'lead_id')::uuid;

  UPDATE public.leads
  SET status = 'new',
      accepted_at = NULL,
      updated_at = now()
  WHERE id = v_lead_id;

  -- The cascade takes the empty client_discovery row with it.
  DELETE FROM public.designer_clients WHERE id = p_designer_client_id;

  RETURN jsonb_build_object('lead_id', v_lead_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.return_to_lead(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.return_to_lead(uuid) TO authenticated;

COMMENT ON FUNCTION public.return_to_lead(uuid) IS
  'Undo an accidental Accept - begin: the lead goes back to new with its '
  'accepted_at cleared and the empty Discovery relationship is deleted, so the '
  'Desk folder returns to the Brief. Raises with return_to_lead_check''s reason '
  'when the undo is no longer an undo (00585).';
