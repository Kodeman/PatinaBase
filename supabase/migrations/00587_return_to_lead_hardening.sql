-- ═══════════════════════════════════════════════════════════════════════════
-- 00587 — return_to_lead hardening: a sibling is only a sibling inside the
--         studio, a room row says more than its name, and a profile holder's
--         own phone wins in the directory
--
-- INTENT
-- Three findings from the F1/F2/F3 adversarial reviews, after the three
-- features shipped 2026-09-09.
--
-- 1. THE SIBLING PROBE WAS UNSCOPED.
--    "One lead, one relationship" reads every designer_clients row carrying
--    the lead's id, whoever wrote it. designer_clients.lead_id is
--    caller-writable and RLS lets a designer insert a row of their own
--    naming any lead id at all — so a designer in another studio could plant
--    a row pointing at a victim's lead and permanently refuse the victim's
--    undo with "This lead is tied to more than one client." 00585 already
--    closed the mirror hole (a planted row cannot be USED to un-accept
--    someone else's lead) but not this one, which is denial rather than
--    escalation. Both probes — the check's and the act's restatement — now
--    require the sibling to belong to the same designer as the relationship
--    under review. A row outside the studio is not a second folder on the
--    designer's desk and must not speak for it.
--
-- 2. THE ROOMS / LIFESTYLE CONTENT PROBES READ ONE FIELD EACH.
--    00585 mirrored capturedRooms / capturedLifestyle (discovery-readiness.ts),
--    which count a room only when it has a name and a lifestyle row only when
--    it says who or how. Those helpers gate READINESS — whether a block is
--    done — which is a different question from whether the designer has typed
--    anything. A room row carrying a type, notes, a floor area, or a
--    keep-as-is mark, and a lifestyle row naming only its room, are all the
--    designer's work; deleting the relationship under them loses it. Every
--    field the jsonb shapes carry (use-discovery.ts: DiscoveryRoom = name,
--    room_type, floor_area_sqft, keep_as_is, notes; LifestyleRow = room, who,
--    how) now counts. A blank string is still blank — an empty row added and
--    never typed into is still not content, which is what F5 asked for.
--
-- 3. THE DIRECTORY'S PHONE PRECEDENCE DISAGREED WITH EVERY OTHER SURFACE.
--    An account holder's own number wins: the household sheet and the Brief
--    already read profiles.phone first, and a client who holds a profile is
--    given no phone field on the studio's side precisely because the number
--    is theirs to manage. 00583 put the captured column first on both the
--    lead and client branches, so a stale number taken at the front door
--    shadowed the one the household maintains. Both branches now read
--    profile-first. The captured column still answers for a household with no
--    Patina account, which is the case 00583 was written for.
--
-- LINEAGE (bodies copied from the files named, then grafted; verified with
-- grep over supabase/migrations that no later file redefines any of the three)
--   public.return_to_lead_check(uuid)  00585 → 00586:45-371 → 00587
--   public.return_to_lead(uuid)        00585:516-608 → 00587
--   public.people_directory (view)     00478 → 00583:390-622 → 00587
--
-- No grants change: each CREATE OR REPLACE keeps the existing ACL, and 00585's
-- REVOKE/GRANT pairs are restated below only because a restatement is free.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. return_to_lead_check — 00586's body, two grafts ─────────────────────

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
  --
  -- 00587 — scoped to the relationship's own designer. lead_id is
  -- caller-writable, so an unscoped probe let a designer in another studio
  -- plant a row carrying this lead's id and refuse this undo forever. A row
  -- outside the studio emits no Desk folder here and is not a second move to
  -- take back.
  IF EXISTS (
    SELECT 1 FROM public.designer_clients d2
    WHERE d2.lead_id = v_relationship.lead_id
      AND d2.id <> p_designer_client_id
      AND d2.designer_id = v_relationship.designer_id
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
        -- rooms / lifestyle (00587): EVERY field the shape carries, not the
        -- one field readiness counts. capturedRooms / capturedLifestyle answer
        -- "is this block done"; this answers "has the designer typed
        -- anything", and a room with only a type, a note, a floor area or a
        -- keep-as-is mark is work that the delete would lose. Blank stays
        -- blank, so an added-and-abandoned row is still not content (F5).
        -- ->> renders a jsonb number or boolean as text, so one btrim test
        -- covers floor_area_sqft whether the portal wrote 240 or '240'.
        -- The CASE guards the set-returning call — OR is not promised to
        -- short-circuit, so a non-array value must not reach it.
        OR jsonb_typeof(cd.rooms) IS DISTINCT FROM 'array'
        OR EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(cd.rooms) = 'array'
              THEN cd.rooms ELSE '[]'::jsonb END
          ) AS room
          WHERE btrim(COALESCE(room->>'name', '')) <> ''
             OR btrim(COALESCE(room->>'room_type', '')) <> ''
             OR btrim(COALESCE(room->>'notes', '')) <> ''
             OR btrim(COALESCE(room->>'floor_area_sqft', '')) <> ''
             OR room->'keep_as_is' = 'true'::jsonb
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
             OR btrim(COALESCE(row_->>'room', '')) <> ''
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
  'A room or lifestyle row counts as content on any field it carries, not on '
  'its name alone, and the one-lead-one-relationship probe only sees siblings '
  'belonging to the same designer (00587). Raises insufficient_privilege for a '
  'caller who is neither the designer nor an active non-guest peer in the same '
  'active design_studio, and for a relationship whose lead_id points at '
  'another designer''s lead (00585).';

-- ── 2. return_to_lead — 00585's body, the sibling probe scoped ─────────────

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
    -- pair cannot drift apart unnoticed. Scoped to the relationship's own
    -- designer (00587) for the same reason the check's probe is: a planted
    -- row from another studio is not a second move to take back.
    IF EXISTS (
      SELECT 1 FROM public.designer_clients d2
      WHERE d2.lead_id = v_relationship.lead_id
        AND d2.id <> p_designer_client_id
        AND d2.designer_id = v_relationship.designer_id
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
  'Desk folder returns to the Brief. Its restated sibling guard only counts '
  'relationships belonging to the same designer (00587). Raises with '
  'return_to_lead_check''s reason when the undo is no longer an undo (00585).';

-- ── 3. people_directory — 00583:390-622 verbatim, one line per branch
--       changed: the client and lead branches now read the joined profile's
--       phone FIRST and fall back to the captured column. Every other column
--       and branch is byte-identical to 00583. ─────────────────────────────

CREATE OR REPLACE VIEW public.people_directory
WITH (security_invoker = true) AS

-- ── CLIENTS ───────────────────────────────────────────────────────────────
-- v4: meta gains has_sent_proposal + issued_on_paper (this migration).
-- Everything else in this branch is unchanged from 00420.
SELECT
  dc.id                                                          AS person_id,
  'client'::text                                                 AS role,
  COALESCE(dc.client_name, pr.full_name, pr.display_name, dc.client_email, 'Unnamed client') AS display_name,
  COALESCE(dc.client_email, pr.email)                            AS email,
  COALESCE(pr.phone, dc.client_phone)                            AS phone,
  dc.client_id                                                   AS profile_id,
  NULL::uuid                                                     AS project_id,
  dc.designer_id                                                 AS designer_id,
  dc.status                                                      AS status_raw,
  COALESCE(dc.last_contacted_at, dc.last_project_at, dc.updated_at) AS last_touch_at,
  jsonb_build_object(
    'total_projects',     dc.total_projects,
    'total_revenue',      dc.total_revenue,
    'last_project_at',    dc.last_project_at,
    'last_contacted_at',  dc.last_contacted_at,
    'first_project_at',   dc.first_project_at,
    'style_tags',         dc.style_tags,
    'source',             dc.source,
    'satisfaction_score', dc.satisfaction_score,
    'nickname',           dc.nickname,
    'location',           dc.location,
    'lead_id',            dc.lead_id
  ) || public.designer_client_send_evidence(dc.id, dc.designer_id, dc.client_id)
                                                                 AS meta,
  (CASE WHEN dc.designer_id = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text AS scope
FROM public.designer_clients dc
LEFT JOIN public.profiles pr ON pr.id = dc.client_id
WHERE public.is_studio_comember(dc.designer_id)

UNION ALL

-- ── LEADS (open only) ─────────────────────────────────────────────────────
-- Unchanged from 00420.
SELECT
  l.id,
  'lead',
  COALESCE(l.contact_name, hp.full_name, hp.display_name, l.contact_email, 'New lead'),
  COALESCE(l.contact_email, hp.email),
  COALESCE(hp.phone, l.contact_phone),
  l.homeowner_id,
  NULL::uuid,
  l.designer_id,
  l.status,
  COALESCE(l.contacted_at, l.created_at),
  jsonb_build_object(
    'project_type',      l.project_type,
    'project_description', l.project_description,
    'budget_range',      l.budget_range,
    'timeline',          l.timeline,
    'match_score',       l.match_score,
    'location_city',     l.location_city,
    'location_state',    l.location_state,
    'response_deadline', l.response_deadline,
    'created_at',        l.created_at
  ),
  (CASE WHEN l.designer_id = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text
FROM public.leads l
LEFT JOIN public.profiles hp ON hp.id = l.homeowner_id
WHERE public.is_studio_comember(l.designer_id)
  AND l.status NOT IN ('accepted', 'declined', 'expired')

UNION ALL

-- ── MAKERS / VENDORS (saved or engaged, studio-wide) ──────────────────────
-- Unchanged from 00420.
SELECT
  v.id,
  'maker',
  v.name,
  COALESCE(v.orders_email, v.trade_account_email),
  NULL::text,
  v.contact_profile_id,
  NULL::uuid,
  auth.uid(),
  v.nomination_status,
  v.updated_at,
  jsonb_build_object(
    'primary_category',      v.primary_category,
    'lead_times',            v.lead_times,
    'default_payment_terms', v.default_payment_terms,
    'founding_circle',       v.founding_circle,
    'made_in',               v.made_in,
    'trade_terms',           v.trade_terms,
    'is_patina_catalog',     v.is_patina_catalog,
    'review_count',          v.review_count,
    'designer_rating_avg',   v.designer_rating_avg
  ),
  (CASE
     WHEN EXISTS (
       SELECT 1 FROM public.saved_vendors mine
       WHERE mine.vendor_id = v.id
         AND mine.designer_id = (select auth.uid())
     ) THEN 'mine'
     ELSE 'studio'
   END)::text
FROM public.vendors v
WHERE v.id IN (
  SELECT sv.vendor_id
  FROM public.saved_vendors sv
  WHERE public.is_studio_comember(sv.designer_id)
  UNION
  SELECT pp.vendor_id
  FROM public.project_parties pp
  JOIN public.projects pj ON pj.id = pp.project_id
  WHERE pp.vendor_id IS NOT NULL
    AND ( public.is_studio_comember(pj.designer_id)
       OR public.is_studio_comember(pj.lead_designer_id)
       OR public.is_studio_comember(pj.created_by) )
)

UNION ALL

-- ── FIELD / ROSTER PARTIES on studio projects ─────────────────────────────
-- Unchanged from 00420.
SELECT
  pp.id,
  pp.party_kind,
  pp.display_name,
  pp.email,
  pp.phone,
  pp.profile_id,
  pp.project_id,
  auth.uid(),
  pp.sms_consent_status,
  pp.updated_at,
  jsonb_build_object(
    'company_name',       pp.company_name,
    'vendor_id',          pp.vendor_id,
    'project_name',       pj.name,
    'party_kind',         pp.party_kind,
    'trade',              pp.trade,
    'phone_e164',         pp.phone_e164,
    'sms_consent_status', pp.sms_consent_status,
    'sms_consented_at',   pp.sms_consented_at,
    'sms_opt_out_at',     pp.sms_opt_out_at,
    'show_to_client',     pp.show_to_client,
    'studio_contact_id',  pp.studio_contact_id
  ),
  (CASE
     WHEN pj.designer_id      = (select auth.uid())
       OR pj.lead_designer_id = (select auth.uid())
       OR pj.created_by       = (select auth.uid())
     THEN 'mine' ELSE 'studio'
   END)::text
FROM public.project_parties pp
JOIN public.projects pj ON pj.id = pp.project_id
WHERE pp.party_kind IN ('gc', 'sub', 'installer', 'receiver',
                        'architect', 'photographer', 'stager')
  AND ( public.is_studio_comember(pj.designer_id)
     OR public.is_studio_comember(pj.lead_designer_id)
     OR public.is_studio_comember(pj.created_by) )

UNION ALL

-- ── TEAM (studio collaborators on studio projects, one row per teammate) ───
-- Unchanged from 00420.
SELECT
  t.id,
  'team',
  COALESCE(tp.full_name, tp.display_name, tp.email, 'Teammate'),
  tp.email,
  tp.phone,
  t.user_id,
  t.project_id,
  auth.uid(),
  t.role,
  t.assigned_at,
  jsonb_build_object(
    'role',         t.role,
    'project_name', t.project_name,
    'job_title',    t.job_title,
    'staff_role',   t.staff_role
  ),
  (CASE WHEN t.is_mine THEN 'mine' ELSE 'studio' END)::text
FROM (
  SELECT DISTINCT ON (tm.user_id)
    tm.id, tm.user_id, tm.role, tm.project_id, tm.assigned_at, pj.name AS project_name,
    om.job_title  AS job_title,
    om.staff_role AS staff_role,
    ( pj.designer_id      = (select auth.uid())
   OR pj.lead_designer_id = (select auth.uid())
   OR pj.created_by       = (select auth.uid()) ) AS is_mine
  FROM public.project_team_members tm
  JOIN public.projects pj ON pj.id = tm.project_id
  LEFT JOIN public.organization_members om
    ON om.user_id = tm.user_id
   AND om.organization_id = pj.studio_id
   AND om.status = 'active'
  WHERE tm.removed_at IS NULL
    AND tm.user_id <> auth.uid()
    AND tm.role IN ('lead_designer', 'support_designer', 'bookkeeper', 'previous_lead')
    AND ( public.is_studio_comember(pj.designer_id)
       OR public.is_studio_comember(pj.lead_designer_id)
       OR public.is_studio_comember(pj.created_by) )
  ORDER BY tm.user_id, tm.assigned_at DESC
) t
LEFT JOIN public.profiles tp ON tp.id = t.user_id

UNION ALL

-- ── CONTACTS (the shared rolodex, 00417) ──────────────────────────────────
-- Unchanged from 00420.
SELECT
  sc.id,
  'contact',
  COALESCE(sc.full_name, sc.company_name),
  sc.email,
  sc.phone,
  sc.profile_id,
  NULL::uuid,
  sc.created_by,
  (CASE WHEN sc.archived_at IS NULL THEN 'active' ELSE 'archived' END)::text,
  sc.updated_at,
  jsonb_build_object(
    'contact_kind',    sc.contact_kind,
    'entity_kind',     sc.entity_kind,
    'company_name',    sc.company_name,
    'company_id',      sc.company_id,
    'specialties',     sc.specialties,
    'vendor_id',       sc.vendor_id,
    'organization_id', sc.organization_id,
    'archived_at',     sc.archived_at
  ),
  (CASE WHEN sc.created_by = (select auth.uid()) THEN 'mine' ELSE 'studio' END)::text
FROM public.studio_contacts sc
WHERE public.is_active_studio_member(sc.organization_id);

COMMENT ON VIEW public.people_directory IS
  'R57 / People Room roster (client|lead|maker|gc|sub|installer|receiver|'
  'architect|photographer|stager|team|contact) for the querying user. v6 '
  '(00587): phone is profile-first on the client and lead branches — '
  'COALESCE(profiles.phone, designer_clients.client_phone) and '
  'COALESCE(profiles.phone, leads.contact_phone). An account holder''s own '
  'number is theirs to manage and the studio is given no field to edit it, so '
  'it wins over a number taken at the front door, which is the order the '
  'household sheet and the Brief already read. The captured column still '
  'answers for a household with no Patina account. v5 (00583): those two '
  'branches gained the captured columns at all, so a phone taken at capture '
  'shows instead of reading blank. v4 (00478): the client branch''s meta gains '
  'has_sent_proposal and issued_on_paper from '
  'designer_client_send_evidence(), so the directory/Nurture derivations can '
  'tell a merely-drafted agreement from one that was really emailed and from '
  'one handed over on paper (00477), instead of all three reading as '
  'status_raw = ''proposal''. Read them paper-first, then send evidence, then '
  'draft. v3 (00420): every branch is STUDIO-scoped via is_studio_comember '
  '(00315), a contacts branch surfaces the shared rolodex (studio_contacts, '
  '00417), and the appended `scope` column reads ''mine'' | ''studio'' for the '
  'scope lens. The party branch admits the 00419 roster kinds but excludes '
  '''client'' (it would collide with the clients branch''s role semantics). '
  'security_invoker view — base-table RLS still governs, so branches over '
  'tables that are not studio-widened (project_parties, project_team_members, '
  'saved_vendors) widen only for callers those tables already admit.';
