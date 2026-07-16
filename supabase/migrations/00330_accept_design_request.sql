-- ═══════════════════════════════════════════════════════════════════════════
-- 00330 — accept_design_request: accept is a threshold, not a button (R106 §1/§7)
--
-- Program: Arrival Arc (Wave 2). The arc's first act: on accept the request is
-- CLAIMED and the client's app shows a held state at once — "{Studio} has taken
-- your request in hand — introduction on its way." Truth-framed: it reports
-- what happened; it never speaks in the designer's voice.
--
-- What it does (and deliberately does NOT do):
--   1. Claim block copied VERBATIM from claim_design_request's live head
--      (00286 → 00289 lineage; grep-verified 00289 is the head). Delta: an
--      already-yours claim PROCEEDS IDEMPOTENTLY (associations upsert + stub
--      lookup + return already_yours=true) instead of returning early — the
--      designer resuming a parked ceremony re-calls accept harmlessly.
--   2. leads.status stays 'new' — the Shape C folder stays alive on the Desk
--      (the Brief is still the active surface until the ceremony completes),
--      and the 00289 status trigger stays silent (no status change).
--   3. Mints room_scan_associations for the whole lead_room_scans junction set
--      (same loop as claim_design_request, verbatim).
--   4. Inserts the match_ceremonies stub ('draft', client_id = homeowner_id)
--      ON CONFLICT (lead_id) DO NOTHING — the ceremony is put-downable from
--      second zero.
--   5. Client held-state notification (FIRST claim only, never on the
--      idempotent re-call): notification_log in_app row + best-effort
--      notification-dispatch email ('design-request-held', seeded in 00336)
--      + best-effort apns-send push. Studio name via resolve_studio_identity
--      (00320; p_designer_id leg — falls back business_name → full_name, and
--      to 'Your designer' when even that is unresolvable).
--   6. Returns jsonb {lead_id, ceremony_id, already_yours}.
--
-- Creates NOTHING else: no designer_clients, no client_discovery, no thread,
-- no Document — those are ceremony_complete's (00331). Accept: claim recorded;
-- client notified; no Document row exists yet (build plan 2.1).
--
-- claim_design_request itself is left untouched (old zone keeps functioning).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.accept_design_request(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid                uuid := auth.uid();
  v_lead               leads%ROWTYPE;
  v_scan_id            uuid;
  v_existing_designer  uuid;
  v_existing_homeowner uuid;
  v_already_yours      boolean := false;
  v_ceremony_id        uuid;
  v_studio_name        text;
  v_log_id             uuid;
  v_title              text;
  v_message            text;
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
  -- (Claim block verbatim from 00289's claim_design_request.)
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
      -- Arrival Arc delta: proceed IDEMPOTENTLY instead of returning early —
      -- the associations upsert and ceremony-stub insert below are both
      -- conflict-safe, and the held notification is gated on first claim.
      v_already_yours := true;
      SELECT * INTO v_lead FROM leads WHERE id = p_lead_id;
    ELSE
      RAISE EXCEPTION 'already_claimed' USING DETAIL = p_lead_id::text;
    END IF;
  END IF;

  -- Mint winner's active/full associations for the whole junction set.
  -- (Verbatim from 00289.)
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

  -- The ceremony stub: put-downable from second zero. ON CONFLICT (lead_id)
  -- DO NOTHING — a re-accept never resets a draft in progress.
  INSERT INTO match_ceremonies (lead_id, designer_id, client_id)
  VALUES (v_lead.id, v_uid, v_lead.homeowner_id)
  ON CONFLICT (lead_id) DO NOTHING;

  SELECT mc.id INTO v_ceremony_id FROM match_ceremonies mc WHERE mc.lead_id = v_lead.id;

  -- Held-state notification — FIRST claim only (the idempotent re-call must
  -- not re-letter the client). Best-effort per the 00285/00289 pattern: a
  -- notification failure must never unwind a successful claim.
  IF NOT v_already_yours THEN
    BEGIN
      SELECT rsi.name INTO v_studio_name
      FROM public.resolve_studio_identity(NULL, v_uid) rsi;
      v_studio_name := COALESCE(NULLIF(btrim(v_studio_name), ''), 'Your designer');

      v_title   := v_studio_name || ' has your request in hand';
      v_message := v_studio_name
                   || ' has taken your request in hand — introduction on its way.';

      INSERT INTO notification_log (user_id, type, channel, status, template_id, metadata)
      VALUES (
        v_lead.homeowner_id,
        'design_request_held',
        'in_app',
        'delivered',
        'design-request-held',
        jsonb_build_object(
          'lead_id',     v_lead.id,
          'designer_id', v_uid,
          'ceremony_id', v_ceremony_id,
          'entity_type', 'design_request',
          'entity_id',   v_lead.id::text,
          'title',       v_title,
          'message',     v_message,
          'deep_link',   '/doc/' || v_lead.id::text,
          'url',         '/doc/' || v_lead.id::text
        )
      )
      RETURNING id INTO v_log_id;

      -- Best-effort email (template seeded in 00336; unknown-template fallback
      -- would send generic boilerplate — I66).
      PERFORM public.invoke_edge_function(
        'notification-dispatch',
        jsonb_build_object(
          'user_id',     v_lead.homeowner_id,
          'type',        'design_request_held',
          'channel',     'email',
          'template_id', 'design-request-held',
          'data', jsonb_build_object(
            'studio_name', v_studio_name,
            'projectType', v_lead.project_type,
            'leadId',      v_lead.id
          ),
          'priority', 'high'
        )
      );

      -- Best-effort APNs push (edge fn returns 200 {skipped} until the APNS_*
      -- secrets exist — must never error this path).
      PERFORM public.invoke_edge_function(
        'apns-send',
        jsonb_build_object(
          'user_id',             v_lead.homeowner_id,
          'title',               v_title,
          'body',                v_message,
          'entity_type',         'design_request',
          'entity_id',           v_lead.id::text,
          'notification_log_id', v_log_id
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'accept_design_request: notification step failed for lead %: %',
        v_lead.id, sqlerrm;
    END;
  END IF;

  RETURN jsonb_build_object(
    'lead_id',       v_lead.id,
    'ceremony_id',   v_ceremony_id,
    'already_yours', v_already_yours
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_design_request(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.accept_design_request(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.accept_design_request(uuid) IS
  'Arrival Arc (R106): claim the pooled request (block verbatim from '
  'claim_design_request 00289), keep leads.status=''new'' (Shape C stays live), '
  'mint room_scan_associations, insert the match_ceremonies draft stub, and send '
  'the client''s held-state notification (in_app + email + APNs, best-effort, '
  'first claim only). Creates NO designer_clients/client_discovery/thread — '
  'those are ceremony_complete''s (00331). Idempotent for the claiming designer '
  '(already_yours=true); already_claimed raises for anyone else.';
