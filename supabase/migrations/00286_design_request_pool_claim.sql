-- ═══════════════════════════════════════════════════════════════════════════
-- 00286 — Design request open pool + claim (Wave 0)
--
-- Routing = open pool + claim (Kody ruling). A design request with no designer
-- (designer_id IS NULL) is invisible to every designer through base-table RLS
-- (leads: "designer_id = auth.uid()") and absent from document_state (Shape C
-- filters designer_id IS NOT NULL). This migration exposes the pool and lets a
-- designer claim atomically:
--
--   • open_design_requests — a DELIBERATELY definer-semantics view. It is NOT
--     security_invoker: querying it runs with the view owner's rights so it can
--     read unassigned leads across homeowners, and the visibility gate lives in
--     the view body (requester must be a designer). It exposes request METADATA
--     + the primary scan's PUBLIC thumbnail only — NO homeowner identity columns
--     pre-claim. security_barrier = true blocks predicate-pushdown leaks.
--     ⚠ The Supabase security advisor will flag this view (security_definer_view).
--       That is intentional and reviewed — the row-level gate is the in-view
--       is_designer EXISTS, and only non-identifying columns are surfaced.
--
--   • claim_design_request() — atomic first-wins UPDATE … WHERE designer_id IS
--     NULL. The winner gets the lead + active/full associations for the whole
--     junction set; both parties get an in-app notification and the homeowner an
--     email (invoke_edge_function, 00258). Losers get a clean 'already_claimed'.
--
-- New objects → RLS/grants in-file. Claim is SECURITY DEFINER (bypasses the
-- leads UPDATE policy, which only admits the already-assigned designer).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── open_design_requests view (definer semantics; gate is in-view) ──────────
DROP VIEW IF EXISTS public.open_design_requests;
CREATE VIEW public.open_design_requests
  WITH (security_barrier = true) AS
SELECT
  l.id,
  l.project_type,
  l.budget_range,
  l.timeline,
  l.project_description,
  l.location_city,
  l.location_state,
  l.created_at,
  s.scan_count,
  s.thumbnail_url,
  s.room_type,
  s.floor_area
FROM public.leads l
LEFT JOIN LATERAL (
  SELECT
    count(*)                                                                     AS scan_count,
    (array_agg(rs.thumbnail_url ORDER BY lrs.is_primary DESC, lrs.position))[1]  AS thumbnail_url,
    (array_agg(rs.room_type    ORDER BY lrs.is_primary DESC, lrs.position))[1]   AS room_type,
    (array_agg(rs.floor_area   ORDER BY lrs.is_primary DESC, lrs.position))[1]   AS floor_area
  FROM public.lead_room_scans lrs
  JOIN public.room_scans rs ON rs.id = lrs.scan_id
  WHERE lrs.lead_id = l.id
) s ON true
WHERE l.designer_id IS NULL
  AND l.homeowner_id IS NOT NULL
  AND l.status = 'new'
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.is_designer
  );

COMMENT ON VIEW public.open_design_requests IS
  'Open (unassigned) design requests for the designer pool. DELIBERATELY '
  'definer-semantics (not security_invoker) so a designer can see requests they '
  'do not yet own; the visibility gate is the in-view is_designer EXISTS. '
  'Surfaces request metadata + the primary scan''s public thumbnail only — no '
  'homeowner identity until the request is claimed. Advisor flags this by design.';

GRANT SELECT ON public.open_design_requests TO authenticated, service_role;

-- ── claim_design_request RPC ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.claim_design_request(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid              uuid := auth.uid();
  v_lead             leads%ROWTYPE;
  v_scan_id          uuid;
  v_existing_designer uuid;
  v_existing_homeowner uuid;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING DETAIL = 'auth.uid() is null';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = v_uid AND p.is_designer) THEN
    RAISE EXCEPTION 'not_designer' USING DETAIL = v_uid::text;
  END IF;

  -- Atomic first-wins: only an unassigned, homeowner-originated, 'new' lead is
  -- claimable, and only the row that matches here is updated. A concurrent
  -- second caller finds designer_id already set and drops to the diagnosis below.
  UPDATE leads
     SET designer_id = v_uid, updated_at = now()
   WHERE id = p_lead_id
     AND designer_id IS NULL
     AND homeowner_id IS NOT NULL
     AND status = 'new'
  RETURNING * INTO v_lead;

  -- FOUND here reflects the UPDATE (true iff a claimable row matched).
  IF NOT FOUND THEN
    SELECT l.designer_id, l.homeowner_id
      INTO v_existing_designer, v_existing_homeowner
    FROM leads l WHERE l.id = p_lead_id;

    -- FOUND here reflects the SELECT above.
    IF NOT FOUND THEN
      RAISE EXCEPTION 'request_not_found' USING DETAIL = p_lead_id::text;
    ELSIF v_existing_designer = v_uid THEN
      RETURN jsonb_build_object('lead_id', p_lead_id, 'already_yours', true);
    ELSE
      RAISE EXCEPTION 'already_claimed' USING DETAIL = p_lead_id::text;
    END IF;
  END IF;

  -- Mint winner's active/full associations for the whole junction set.
  FOR v_scan_id IN
    SELECT lrs.scan_id FROM lead_room_scans lrs WHERE lrs.lead_id = v_lead.id
  LOOP
    INSERT INTO room_scan_associations (
      scan_id, consumer_id, designer_id, association_type, status, access_level,
      shared_at, requested_at, lead_id
    ) VALUES (
      v_scan_id, v_lead.homeowner_id, v_uid, 'explicit', 'active', 'full',
      now(), now(), v_lead.id
    )
    ON CONFLICT (scan_id, designer_id) DO UPDATE SET
      status         = 'active',
      access_level   = 'full',
      shared_at      = now(),
      revoked_at     = NULL,
      revoked_reason = NULL,
      lead_id        = EXCLUDED.lead_id,
      updated_at     = now();
  END LOOP;

  -- Notifications (both parties in-app + homeowner email). Best-effort — a
  -- notification failure must never unwind a successful claim.
  BEGIN
    INSERT INTO notification_log (user_id, type, channel, status, template_id, metadata)
    VALUES (
      v_lead.homeowner_id,
      'design_request_claimed',
      'in_app',
      'delivered',
      'design-request-claimed',
      jsonb_build_object(
        'lead_id',     v_lead.id,
        'designer_id', v_uid,
        'title',       'Your design request was accepted',
        'message',     'A designer accepted your design request and will be in touch.',
        'deep_link',   '/doc/' || v_lead.id::text,
        'url',         '/doc/' || v_lead.id::text
      )
    );

    INSERT INTO notification_log (user_id, type, channel, status, template_id, metadata)
    VALUES (
      v_uid,
      'design_request_claim_confirmed',
      'in_app',
      'delivered',
      'design-request-claim-confirmed',
      jsonb_build_object(
        'lead_id',   v_lead.id,
        'title',     'You accepted a design request',
        'message',   'The request is now on your Desk.',
        'deep_link', '/doc/' || v_lead.id::text,
        'url',       '/doc/' || v_lead.id::text
      )
    );

    PERFORM public.invoke_edge_function(
      'notification-dispatch',
      jsonb_build_object(
        'user_id',     v_lead.homeowner_id,
        'type',        'design_request_claimed',
        'channel',     'email',
        'template_id', 'design-request-claimed',
        'data', jsonb_build_object(
          'projectType', v_lead.project_type,
          'leadId',      v_lead.id
        ),
        'priority', 'high'
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'claim_design_request: notification step failed for lead %: %',
      v_lead.id, sqlerrm;
  END;

  RETURN jsonb_build_object(
    'lead_id',      v_lead.id,
    'designer_id',  v_uid,
    'status',       v_lead.status,
    'already_yours', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_design_request(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.claim_design_request(uuid) TO authenticated, service_role;
