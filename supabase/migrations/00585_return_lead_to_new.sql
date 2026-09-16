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
-- policies, this file writes two new functions and four indexes, and touches no
-- existing function or view.
--
-- LINEAGE
-- No existing function or view is redefined. Both functions are new. The
-- authority predicate is public._can_author_proposal(uuid) (00387:533) — read
-- from the CURRENT body of public.begin_discovery (00386 → 00399 → 00583:157),
-- which is the act this one reverses, so the two agree on who may act by
-- construction. The exact designer, or an active non-guest peer in the same
-- active design_studio. begin_discovery is NOT redefined here.
--
-- AUTHORITY IS REQUIRED ON BOTH ENDS
-- begin_discovery starts from the lead and derives the relationship from it.
-- This function starts from the relationship and walks designer_clients.lead_id
-- in the opposite direction — and that pointer is caller-writable: RLS lets a
-- designer insert their OWN relationship row carrying ANY lead id they happen
-- to know. Checking only designer_clients.designer_id therefore let a stranger
-- un-accept another studio's lead (review F2-R1-01, reproduced end-to-end).
-- So both functions additionally require the lead to belong to the same
-- designer as the relationship, and answer a mismatch with the same conflated
-- "not found or access denied" the unauthorized-relationship case gives.
--
-- WHAT COUNTS AS "STILL AN UNDO"
-- The check refuses when ANY of these is true. Each is one plain sentence back
-- to the designer; the UI prints it as helper text under a disabled action.
--   1. The relationship carries no lead_id — there is no Brief to return to.
--   2. designer_clients.status <> 'lead' — the relationship has moved on.
--   3. leads.status <> 'accepted' — the lead is not where Accept left it.
--   4. leads.client_request_id IS NOT NULL — the app-matched (ceremony) path
--      writes to the client before the designer ever sees the folder.
--   5. designer_clients.created_at < leads.accepted_at — the relationship
--      PREDATES the accept, so begin_discovery adopted an existing contact
--      rather than creating one (00583:210-292 has three such branches).
--      Deleting an adopted row would destroy a relationship the accept did not
--      make, along with its provenance. Same-transaction creation reads as
--      created_at = accepted_at (both now()), so the ordinary path is not
--      caught by this.
--   6. The relationship carries studio-authored detail of its own. The DELETE
--      below would discard it, and the household sheet writes several of these
--      fields directly (household-sheet.tsx → useUpdateClientContact) without
--      leaving an activity row behind to catch. Columns checked: notes,
--      nickname, referral_source, location, preferred_contact,
--      inspiration_quote, satisfaction_score, last_contacted_at,
--      first_project_at, last_project_at (all NULL when untouched); tags,
--      style_tags (default '{}'); style_preferences (default '{}'::jsonb);
--      total_projects, total_revenue (default 0); and client_name /
--      client_email / client_phone once they differ from the lead's
--      contact_name / contact_email / contact_phone. Those three are compared
--      only when non-NULL: begin_discovery and the 00583 hydrate trigger seed
--      them FROM the lead, but the homeowner branch deliberately leaves
--      client_phone NULL on a profile-holding row, and a NULL there is absence,
--      not an edit.
--      Deliberately NOT checked: `source` and `client_id`, the only other
--      non-key columns on the table (review F2-R2-08). No portal writer sets
--      `source` on an existing row, and `client_id` is written by the accept
--      itself, never by a designer editing the household — so neither is a
--      place studio detail can land. Read the list above as the columns that
--      CAN carry an edit, not as the whole table.
--   7. Any row anchored to this relationship in: proposals, project_documents
--      (the folio), margin_notes, client_activity_log, match_ceremonies (by
--      designer_client_id, or by the lead), client_decisions,
--      client_invitations, client_messages, client_nurture_touchpoints,
--      client_reviews, fulfillment_orders. That list is every table with a
--      designer_client_id foreign key, not only the five the brief named:
--      each of them is either content the studio made or a message the client
--      received, and the ruling closes the door on both.
--   8. A direct thread between this designer and this client's profile — the
--      ceremony's intro thread, or any direct thread opened since.
--   9. client_discovery holds user-entered content. Columns checked, being
--      every column except id / designer_client_id / designer_id / created_at /
--      updated_at: project_type, project_type_custom, budget_min_cents,
--      budget_max_cents, budget_basis, target_date, hard_date, start_urgency,
--      site_notes, room_scan_id, ready_at, seeded_proposal_id, seeded_at
--      (all NULL when untouched), and keep_items, avoid_items,
--      decision_makers (default '[]'::jsonb), style_tag_ids, style_keywords
--      (default '{}'). rooms and lifestyle are counted the way the surface
--      counts them (F5, discovery-readiness.ts capturedRooms /
--      capturedLifestyle): a room row counts only once it has a name, a
--      lifestyle row only once it says who or how — three empty "+ Add a room"
--      rows must not read as content here when they do not read as "3 rooms"
--      there. A bare row with every column at its default is not content, so a
--      Discovery folder opened and never typed in still reverses.
--  10. A second relationship points at the same lead. The reversal un-accepts
--      the lead AND deletes ONE relationship, so a sibling row would be left
--      standing behind a lead that is back at 'new' — and document_state
--      Shape D excludes a relationship whose lead is new/viewed/contacted, so
--      that survivor (and anything on it) would emit no Desk folder at all
--      until someone re-accepted. Review F2-R2-01 reproduced it end to end:
--      RLS lets a studio co-member insert a row carrying a peer's lead id, and
--      neither partial unique index on designer_clients forbids the duplicate.
--      One lead, one relationship, or the door is shut.
--
-- WHAT THE REVERSAL RESTORES
-- A nurtured lead earns a dated return, and useNurtureLead stores that date in
-- the overloaded leads.response_deadline — whose meaning follows status
-- (respond-by while new/viewed, reconnect-on while contacted). Forcing 'new'
-- would reinterpret a December reconnect date as a blown response deadline and
-- band the folder "Response window passed" (desk-derivation.ts:798-810). So the
-- pre-accept status is inferred rather than assumed: a lead carrying both
-- contacted_at and response_deadline is the nurture signature and goes back to
-- 'contacted'; everything else goes back to 'new'. response_deadline itself is
-- left alone on both paths — for a 'new' lead it is still the respond-by it
-- always was.
--
-- NO SEEDED ACTIVITY TO ALLOW FOR
-- The brief allows for "client_activities beyond the discovery-seeded ones".
-- There are none: the table is public.client_activity_log, begin_discovery
-- writes no row to it, and no trigger on designer_clients does either (the four
-- that exist are updated_at, the Aesthete client_added dispatch, and the two
-- 00583 hydration/normalization triggers). So ANY row refuses.
--
-- ONE THING THE DELETE DOES NOT RETRACT
-- designer_clients carries an AFTER INSERT trigger that records an Aesthete
-- 'client_added' activation event. Deleting the row does not retract it, so an
-- accept → undo → re-accept cycle leaves two events for one client. That is
-- accepted here rather than compensated: activation events are an append-only
-- stream that other producers also write into, and inventing a retraction (or
-- reaching in to delete one) is a change to the Aesthete contract, not to this
-- reversal. Recorded so the double count is a known reading of the stream and
-- not a mystery.
--
-- SILENT TO THE CLIENT, BY DESIGN
-- 00332's lead notification trigger fires only on a transition INTO
-- accepted / declined / expired. Returning to 'new' or 'contacted' fires
-- nothing, which is the intent: the client was never told the lead was accepted
-- on this path (the path that tells them is the ceremony path, and that path
-- refuses).
--
-- THE DELETE
-- return_to_lead deletes the designer_clients row rather than demoting it. The
-- row was created by begin_discovery and, by the checks above, holds nothing.
-- Its cascade removes the empty client_discovery row with it. Leaving a
-- status='lead' relationship behind would emit a second Desk folder beside the
-- restored Brief (document_state Shape D and Shape C would both match).
--
-- CHEAP ENOUGH FOR EVERY FOLDER LOAD
-- The check runs on every Discovery folder open, so each probe must be able to
-- use an index. Ten of the twelve designer_client_id tables already index that
-- column; fulfillment_orders and match_ceremonies did not, and the
-- match_ceremonies probe ORed two columns in one EXISTS so its unique lead_id
-- index could not be used either. Both indexes are added below and the ceremony
-- probe is split in two, one leg per index.
--
-- Two more are added for the same reason (review F2-R2-02). The direct-thread
-- probe looks up comms_thread_participants by profile_id with left_at IS NULL,
-- and all three of that table's existing indexes miss it: the pkey and
-- idx_comms_participants_thread both lead with thread_id, and
-- idx_comms_participants_profile_inbox is partial on archived_at IS NULL —
-- which this probe must not assert, because an archived thread is still an open
-- thread. And the sibling probe (item 10) reads designer_clients.lead_id, which
-- carried no index of its own. Without the two below, both probes scale with
-- the whole table rather than with this designer.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 0. The probes that could not use an index ───────────────────────────────

CREATE INDEX IF NOT EXISTS idx_fulfillment_orders_designer_client
  ON public.fulfillment_orders(designer_client_id)
  WHERE designer_client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_match_ceremonies_designer_client
  ON public.match_ceremonies(designer_client_id)
  WHERE designer_client_id IS NOT NULL;

-- The direct-thread probe: by profile, threads not left. Deliberately NOT
-- partial on archived_at — an archived thread is still an open thread, which
-- is why idx_comms_participants_profile_inbox cannot serve this.
CREATE INDEX IF NOT EXISTS idx_comms_participants_profile_open
  ON public.comms_thread_participants(profile_id)
  WHERE left_at IS NULL;

-- The sibling-relationship probe.
CREATE INDEX IF NOT EXISTS idx_designer_clients_lead
  ON public.designer_clients(lead_id)
  WHERE lead_id IS NOT NULL;

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
  v_lead_found   boolean;
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
  '{allowed, reason, lead_id}. Raises insufficient_privilege for a caller who '
  'is neither the designer nor an active non-guest peer in the same active '
  'design_studio, and for a relationship whose lead_id points at another '
  'designer''s lead (00585).';

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
  v_lead         public.leads%ROWTYPE;
  v_lead_found   boolean;
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
    SELECT * INTO v_lead
    FROM public.leads
    WHERE id = v_relationship.lead_id
    FOR UPDATE;

    v_lead_found := FOUND;

    -- The same both-ends authority the check enforces, restated here so the
    -- write path never depends on the reader for its own safety.
    IF v_lead_found
       AND v_lead.designer_id IS DISTINCT FROM v_relationship.designer_id THEN
      RAISE EXCEPTION 'client relationship % not found or access denied',
        p_designer_client_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Restated under the locks for the same reason the authority test above
    -- is: what this function DELETES must not rest on the reader. The sentence
    -- is the check's, word for word — the SQL test compares the two, so the
    -- pair cannot drift apart unnoticed.
    IF EXISTS (
      SELECT 1 FROM public.designer_clients d2
      WHERE d2.lead_id = v_relationship.lead_id
        AND d2.id <> p_designer_client_id
    ) THEN
      RAISE EXCEPTION 'This lead is tied to more than one client, so there is no single move to take back.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  v_check := public.return_to_lead_check(p_designer_client_id);

  IF NOT (v_check->>'allowed')::boolean THEN
    RAISE EXCEPTION '%', v_check->>'reason'
      USING ERRCODE = 'check_violation';
  END IF;

  v_lead_id := (v_check->>'lead_id')::uuid;

  -- A nurtured lead goes back to its dated return, not to 'new': its reconnect
  -- date lives in response_deadline, which desk-derivation reads as a
  -- respond-by while the status is 'new'.
  UPDATE public.leads
  SET status = CASE
        WHEN contacted_at IS NOT NULL AND response_deadline IS NOT NULL
          THEN 'contacted'
        ELSE 'new'
      END,
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
  'Undo an accidental Accept - begin: the lead goes back to where Accept found '
  'it (new, or contacted when it was nurtured to a dated return) with its '
  'accepted_at cleared, and the empty Discovery relationship is deleted, so the '
  'Desk folder returns to the Brief. Raises with return_to_lead_check''s reason '
  'when the undo is no longer an undo (00585).';
