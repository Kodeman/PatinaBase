-- ═══════════════════════════════════════════════════════════════════════════
-- 00586 — the Discovery folder's own prefill is not "filled in"
--
-- INTENT
-- QA 2026-09-09, flow C: "Move back to New Lead" refused on the FIRST visit to
-- a Discovery folder, before the designer had typed anything, with 00585's
-- sentence "Discovery has already been filled in for this client."
--
-- WHY
-- Nothing in the accept writes client_discovery. The FOLDER does. Opening
-- Discovery hydrates the draft from the lead-derived prefill and — by the
-- blur-save law (discovery-section.tsx, F2 walk 2026-07: "what the blocks show
-- is what the row holds") — persists the non-null prefill facts on first
-- render through useUpsertDiscovery. On a lead captured from the Desk that is
-- project_type = 'consultation', the capture sheet's honest default. 00585's
-- content probe read any non-null project_type as content, so the door shut on
-- a folder that held only its own echo. Reproduced against the QA database:
--   return_to_lead_check('835b1127-…') → allowed false,
--   "Discovery has already been filled in for this client."
--   client_discovery for that relationship: project_type 'consultation',
--   every other column at its default.
--
-- THE DELTA
-- The four columns the prefill can write — project_type, budget_min_cents,
-- budget_max_cents, start_urgency (useDiscovery: lead.project_type,
-- budgetRangeToCents(lead.budget_range), lead.timeline) — now count as content
-- only when they DIFFER from what the lead would have prefilled, exactly as
-- 00585 already treats client_name / client_email / client_phone on the
-- relationship. Every other column in the probe is unchanged: none of them is
-- ever written by anything but the designer. A value the lead never carried
-- still counts, because the prefill could not have put it there.
--
-- LINEAGE
-- public.return_to_lead_check(uuid) — CURRENT body from
-- 00585_return_lead_to_new.sql:197-500, copied verbatim, with the three
-- grafts above and nothing else. No later file redefines it (verified with
-- grep over supabase/migrations). public.return_to_lead(uuid) is NOT
-- redefined: it calls this function for its verdict, so it inherits the fix,
-- and its own restated guards (authority, one-lead-one-relationship) are
-- untouched. No grants change — 00585's REVOKE/GRANT pair stands, and is
-- restated below only because CREATE OR REPLACE keeps the existing ACL and a
-- restatement is free.
-- ═══════════════════════════════════════════════════════════════════════════

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
  v_lead_found   boolean;
  -- The lead-derived Discovery prefill, mirrored from the portal's own
  -- budgetRangeToCents (use-discovery.ts). Deliberately the five documented
  -- slugs and nothing else: the portal's mapping has no free-text branch, so a
  -- drifted budget_range prefills nothing and any figure in the row is the
  -- designer's own.
  v_prefill_budget_min integer;
  v_prefill_budget_max integer;
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

  v_lead_found := FOUND;

  -- designer_clients.lead_id is caller-writable, so it is not evidence of
  -- anything until the lead agrees. Without this a designer could plant a row
  -- pointing at another studio's accepted lead and un-accept it.
  IF v_lead_found
     AND v_lead.designer_id IS DISTINCT FROM v_relationship.designer_id THEN
    RAISE EXCEPTION 'client relationship % not found or access denied',
      p_designer_client_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT v_lead_found OR v_lead.status <> 'accepted' THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'The lead behind this client is no longer waiting to be accepted.',
      'lead_id', v_relationship.lead_id
    );
  END IF;

  CASE v_lead.budget_range
    WHEN 'under_5k'  THEN v_prefill_budget_min := 0;        v_prefill_budget_max := 500000;
    WHEN '5k_15k'    THEN v_prefill_budget_min := 500000;   v_prefill_budget_max := 1500000;
    WHEN '15k_50k'   THEN v_prefill_budget_min := 1500000;  v_prefill_budget_max := 5000000;
    WHEN '50k_100k'  THEN v_prefill_budget_min := 5000000;  v_prefill_budget_max := 10000000;
    WHEN 'over_100k' THEN v_prefill_budget_min := 10000000; v_prefill_budget_max := NULL;
    ELSE v_prefill_budget_min := NULL; v_prefill_budget_max := NULL;
  END CASE;

  IF v_lead.client_request_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'This client was matched through the app and has already been written to.',
      'lead_id', v_relationship.lead_id
    );
  END IF;

  -- One lead, one relationship. The reversal deletes exactly one row, so a
  -- sibling on the same lead would outlive the accept with no Desk folder to
  -- its name (Shape D wants an accepted lead). Ahead of the content and
  -- adoption branches on purpose: whichever of the two rows is asked, this is
  -- the true answer.
  IF EXISTS (
    SELECT 1 FROM public.designer_clients d2
    WHERE d2.lead_id = v_relationship.lead_id
      AND d2.id <> p_designer_client_id
  ) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'This lead is tied to more than one client, so there is no single move to take back.',
      'lead_id', v_relationship.lead_id
    );
  END IF;

  -- Adopted, not created: begin_discovery has three branches that take over a
  -- relationship that already existed. The undo may not delete one of those.
  IF v_lead.accepted_at IS NOT NULL
     AND v_relationship.created_at < v_lead.accepted_at THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'This client was already on your list before the lead came in.',
      'lead_id', v_relationship.lead_id
    );
  END IF;

  IF v_relationship.notes IS NOT NULL
     OR v_relationship.nickname IS NOT NULL
     OR v_relationship.referral_source IS NOT NULL
     OR v_relationship.location IS NOT NULL
     OR v_relationship.preferred_contact IS NOT NULL
     OR v_relationship.inspiration_quote IS NOT NULL
     OR v_relationship.satisfaction_score IS NOT NULL
     OR v_relationship.last_contacted_at IS NOT NULL
     OR v_relationship.first_project_at IS NOT NULL
     OR v_relationship.last_project_at IS NOT NULL
     OR COALESCE(v_relationship.tags, '{}'::text[]) <> '{}'::text[]
     OR COALESCE(v_relationship.style_tags, '{}'::text[]) <> '{}'::text[]
     OR COALESCE(v_relationship.style_preferences, '{}'::jsonb) <> '{}'::jsonb
     OR COALESCE(v_relationship.total_projects, 0) <> 0
     OR COALESCE(v_relationship.total_revenue, 0) <> 0
     OR (v_relationship.client_name IS NOT NULL
         AND v_relationship.client_name IS DISTINCT FROM v_lead.contact_name)
     OR (v_relationship.client_email IS NOT NULL
         AND v_relationship.client_email IS DISTINCT FROM v_lead.contact_email)
     OR (v_relationship.client_phone IS NOT NULL
         AND v_relationship.client_phone IS DISTINCT FROM v_lead.contact_phone)
  THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'This client''s own details have been filled in.',
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

  -- Two EXISTS, not one OR: each leg then uses its own index (the ceremony's
  -- unique lead_id index, and idx_match_ceremonies_designer_client above).
  IF EXISTS (
    SELECT 1 FROM public.match_ceremonies
    WHERE designer_client_id = p_designer_client_id
  ) OR EXISTS (
    SELECT 1 FROM public.match_ceremonies
    WHERE lead_id = v_relationship.lead_id
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
        -- The four the folder writes by itself (00586): equal to the lead's
        -- own prefill is the echo, not an answer. Anything else — including a
        -- value the lead never carried — is the designer's.
        (cd.project_type IS NOT NULL
         AND cd.project_type IS DISTINCT FROM v_lead.project_type)
        OR (cd.budget_min_cents IS NOT NULL
            AND cd.budget_min_cents IS DISTINCT FROM v_prefill_budget_min)
        OR (cd.budget_max_cents IS NOT NULL
            AND cd.budget_max_cents IS DISTINCT FROM v_prefill_budget_max)
        OR (cd.start_urgency IS NOT NULL
            AND cd.start_urgency IS DISTINCT FROM v_lead.timeline)
        OR cd.project_type_custom IS NOT NULL
        OR cd.budget_basis IS NOT NULL
        OR cd.target_date IS NOT NULL
        OR cd.hard_date IS NOT NULL
        OR cd.site_notes IS NOT NULL
        OR cd.room_scan_id IS NOT NULL
        OR cd.ready_at IS NOT NULL
        OR cd.seeded_proposal_id IS NOT NULL
        OR cd.seeded_at IS NOT NULL
        OR cd.keep_items IS DISTINCT FROM '[]'::jsonb
        OR cd.avoid_items IS DISTINCT FROM '[]'::jsonb
        OR cd.decision_makers IS DISTINCT FROM '[]'::jsonb
        OR cd.style_tag_ids IS DISTINCT FROM '{}'::uuid[]
        OR cd.style_keywords IS DISTINCT FROM '{}'::text[]
        -- rooms / lifestyle: named rows only, mirroring capturedRooms and
        -- capturedLifestyle. The CASE guards the set-returning call — OR is not
        -- promised to short-circuit, so a non-array value must not reach it.
        OR jsonb_typeof(cd.rooms) IS DISTINCT FROM 'array'
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(cd.rooms) = 'array'
              THEN cd.rooms ELSE '[]'::jsonb END
          ) AS room
          WHERE btrim(COALESCE(room->>'name', '')) <> ''
        )
        OR jsonb_typeof(cd.lifestyle) IS DISTINCT FROM 'array'
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(cd.lifestyle) = 'array'
              THEN cd.lifestyle ELSE '[]'::jsonb END
          ) AS row_
          WHERE btrim(COALESCE(row_->>'who', '')) <> ''
             OR btrim(COALESCE(row_->>'how', '')) <> ''
        )
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
  '{allowed, reason, lead_id}. The Discovery columns the folder prefills from '
  'the lead count as content only once they differ from that prefill (00586). '
  'Raises insufficient_privilege for a caller who is neither the designer nor '
  'an active non-guest peer in the same active design_studio, and for a '
  'relationship whose lead_id points at another designer''s lead (00585).';
