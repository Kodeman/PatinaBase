-- ═══════════════════════════════════════════════════════════════════════════
-- 00289 — Design request client-facing status notifications
--
-- Homeowner-side promotion of a submitted design request (iOS nav plan, Phase
-- B1). Two changes, both aimed at giving the client app a routable in-app inbox
-- row when their request's fate changes:
--
--   1. claim_design_request() — REDEFINED whole-body.
--      Lineage: 00286 → 00289 (00286 verified sole/head definition via
--        grep "CREATE OR REPLACE FUNCTION[^(]*claim_design_request").
--      Delta ONLY: both notification_log inserts (homeowner + designer) gain
--        'entity_type' = 'design_request' and 'entity_id' = <lead id>::text in
--        their metadata jsonb, so the client's NotificationRouter can route a
--        tap-through to the design-request surface. Body is otherwise verbatim
--        from 00286 — no logic change.
--
--   2. notify_design_request_status_change() — NEW SECURITY DEFINER trigger fn +
--      AFTER UPDATE OF status ON public.leads trigger. Portal designers accept/
--      decline via direct PostgREST UPDATEs and carry a real auth.uid(), so they
--      CANNOT satisfy notification_log's insert policy (00041: WITH CHECK
--      auth.uid() IS NULL — service-role only). SECURITY DEFINER escalates so the
--      trigger writes the homeowner's in-app row. Best-effort (exception-wrapped
--      per the 00285 pattern): a notification failure must never unwind the
--      status update.
--      Guards: NEW.client_request_id IS NOT NULL AND NEW.homeowner_id IS NOT NULL
--        (app-originated leads only — keeps bulk legacy reconciles like 00288
--        silent), NEW.status IS DISTINCT FROM OLD.status, and NEW.status in
--        ('accepted','declined','expired').
--
-- No table shape changes → no generated-types drift expected.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. claim_design_request (lineage 00286 → 00289; delta = entity_type/id) ──
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
        'entity_type', 'design_request',
        'entity_id',   v_lead.id::text,
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
        'lead_id',     v_lead.id,
        'entity_type', 'design_request',
        'entity_id',   v_lead.id::text,
        'title',       'You accepted a design request',
        'message',     'The request is now on your Desk.',
        'deep_link',   '/doc/' || v_lead.id::text,
        'url',         '/doc/' || v_lead.id::text
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

-- ── 2. notify_design_request_status_change (client-facing status inbox row) ──
CREATE OR REPLACE FUNCTION public.notify_design_request_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer_name text;
  v_title         text;
  v_message       text;
BEGIN
  -- App-originated leads only. client_request_id is the iOS discriminator
  -- (00285); its absence marks legacy/portal/bulk-reconcile rows (00288) that
  -- must stay silent. homeowner_id is the notification recipient.
  IF NEW.client_request_id IS NULL OR NEW.homeowner_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Real transitions into a terminal client-facing state only.
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('accepted', 'declined', 'expired') THEN
    RETURN NEW;
  END IF;

  -- Resolve the designer's name cheaply (scalar subquery) when one is assigned.
  IF NEW.designer_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(btrim(p.display_name), ''), NULLIF(btrim(p.full_name), ''))
      INTO v_designer_name
    FROM public.profiles p
    WHERE p.id = NEW.designer_id;
  END IF;
  v_designer_name := COALESCE(v_designer_name, 'Your designer');

  IF NEW.status = 'accepted' THEN
    v_title   := 'Designer matched';
    v_message := v_designer_name
                 || ' accepted your design request. You''re all set.';
  ELSIF NEW.status = 'declined' THEN
    v_title   := 'About your design request';
    v_message := 'Your request wasn''t accepted this time. '
                 || 'You can send a new one anytime.';
  ELSE  -- 'expired'
    v_title   := 'Your design request expired';
    v_message := 'No designer picked it up in time. '
                 || 'Send a new request anytime.';
  END IF;

  -- Best-effort in-app inbox row (bell polls). A notification failure must never
  -- unwind the status update the designer just made (00285 pattern).
  BEGIN
    INSERT INTO notification_log (user_id, type, channel, status, template_id, metadata)
    VALUES (
      NEW.homeowner_id,
      'design_request_' || NEW.status,
      'in_app',
      'delivered',
      'design-request-' || NEW.status,
      jsonb_build_object(
        'lead_id',     NEW.id,
        'entity_type', 'design_request',
        'entity_id',   NEW.id::text,
        'title',       v_title,
        'message',     v_message,
        'deep_link',   '/doc/' || NEW.id::text,
        'url',         '/doc/' || NEW.id::text
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_design_request_status_change: notification insert failed for lead %: %',
      NEW.id, sqlerrm;
  END;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_design_request_status_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_lead_status_change_notify_homeowner ON public.leads;
CREATE TRIGGER on_lead_status_change_notify_homeowner
  AFTER UPDATE OF status ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_design_request_status_change();
