-- ═══════════════════════════════════════════════════════════════════════════
-- 00534 — The bell learns what money and decisions are waiting
--
-- SP-08, durable half. On the same device in the same minute the bell read
-- "Nothing yet" / "Updates from your designer will land here" while the Studio
-- two screens away listed a decision overdue since Aug 22, a $4,250.00 invoice
-- due Sep 1, and a proposal to review by Sep 8. The feed reads notification_log
-- (00041) filtered `channel in (in_app, push)`; nothing in the money or
-- decision rail ever wrote a client-facing row there.
--
-- Three parts:
--
--   1. notify_client_attention(...) — ONE helper the edge functions and the
--      decision trigger both call. It writes TWO rows, not one (critique B6):
--
--        channel='in_app', status='delivered'  — the bell row. NEVER handed to
--                                                apns-send, so a push failure
--                                                can never delete it.
--        channel='push',   status='queued'     — the envelope. ITS id is what
--                                                apns-send is given; apns-send
--                                                stamps it delivered or failed
--                                                (apns-send/index.ts:217-238),
--                                                and 'failed' is excluded from
--                                                the client's visible filter.
--
--      Grant posture (critique M5): this is a SECURITY DEFINER writer that
--      inserts into notification_log for an ARBITRARY user_id, and
--      notification_log's INSERT policy is service-role-only (00041:88).
--      Granted to `authenticated` it would let any signed-in client forge
--      notifications for another user. So: REVOKE from PUBLIC, anon AND
--      authenticated; GRANT to service_role only. The trigger below reaches it
--      as the definer; the edge functions call it with the service-role key.
--
--      Row contract (critique M26) — the spellings the client actually reads,
--      NotificationsAPIClient.swift:135-145 and NotificationRouter.swift:61-88:
--        metadata.title       → the bell's title
--        metadata.body        → the bell's body   ⚠ 00289 and 00388 both wrote
--                               'message' and no 'body', so every existing row
--                               renders with an empty body. Both keys ship here.
--        metadata.entity_type ∈ {proposal, invoice, decision}, lower-case
--        metadata.entity_id   → the entity uuid as text
--        metadata.deep_link / .url → /proposals|/invoices|/decisions/<id>
--      Plus whatever the caller passes (project_id, amount_cents, due_date).
--
--      De-duplication (SP-08's own risk note: "duplicate or contradictory rows
--      … de-duplicate on entity id"): when an UNOPENED in-app row already
--      names the same (user, entity_type, entity_id), it is updated in place
--      rather than stacked. Two consequences, both wanted — invoice-reminders
--      cannot bury the bell, and proposal-send's existing dispatch row (part 2)
--      is folded into rather than duplicated.
--
--   2. sync_proposal_send_in_app_log — REDEFINED whole-body.
--      Lineage: 00388 → 00534 (00388 verified sole/head definition via
--        grep "CREATE OR REPLACE FUNCTION[^(]*sync_proposal_send_in_app_log").
--      Delta ONLY: the metadata jsonb gains 'entity_type', 'entity_id', 'title'
--      and 'body'. Every existing key (proposal_id, dispatch_id, sent_at,
--      subject, message, deep_link) is kept byte-for-byte, and no logic moves.
--      Two reasons: without entity_type/entity_id the de-dup key does not exist
--      on the one row proposal-send already writes, so the new call site would
--      print a SECOND bell row; and without 'body' that row renders blank under
--      its title, which is the same defect SP-08 exists to close.
--
--   3. notify_client_decision_raised() + AFTER INSERT trigger on
--      client_decisions, in the 00289 shape: SECURITY DEFINER (the designer's
--      authenticated INSERT cannot satisfy notification_log's service-only
--      policy), guards first, and the whole notification wrapped in
--      BEGIN … EXCEPTION WHEN OTHERS THEN RAISE WARNING so a notification
--      failure can never unwind the decision the designer just raised.
--      Guards: status = 'pending' (a draft is not sent) AND court = 'client'
--      (00062 + the 00419 court vocabulary — a designer-court RFI is not the
--      client's business), and a resolvable designer_clients.client_id (a
--      not-yet-signed-up client has nobody to notify, 00014:74 nullable).
--
-- No table shape changes → no generated-types drift expected.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. notify_client_attention ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_client_attention(
  p_user_id     uuid,
  p_entity_type text,
  p_entity_id   uuid,
  p_title       text,
  p_body        text,
  p_metadata    jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_path   text;
  v_meta   jsonb;
  v_type   text;
  v_in_app uuid;
  v_push   uuid;
BEGIN
  -- A notification helper must never abort its caller's transaction. Every
  -- rejection here is a quiet NULL, not an exception.
  IF p_user_id IS NULL OR p_entity_id IS NULL OR p_title IS NULL THEN
    RETURN NULL;
  END IF;

  v_path := CASE p_entity_type
              WHEN 'proposal' THEN '/proposals/'
              WHEN 'invoice'  THEN '/invoices/'
              WHEN 'decision' THEN '/decisions/'
            END;
  IF v_path IS NULL THEN
    RAISE WARNING 'notify_client_attention: unroutable entity_type %', p_entity_type;
    RETURN NULL;
  END IF;
  v_path := v_path || p_entity_id::text;
  v_type := p_entity_type || '_attention';

  v_meta := COALESCE(p_metadata, '{}'::jsonb) || jsonb_build_object(
    'entity_type', p_entity_type,
    'entity_id',   p_entity_id::text,
    'title',       p_title,
    'body',        COALESCE(p_body, ''),
    -- 'message' mirrors 'body': the client portal inbox renders metadata.message
    -- (00388, invoice-send), the iOS bell renders metadata.body.
    'message',     COALESCE(p_body, ''),
    'deep_link',   v_path,
    'url',         v_path
  );

  -- The bell row. De-duplicated on (user, entity_type, entity_id) while the
  -- reader has not opened it, so a reminder cadence refreshes one line instead
  -- of burying the screen.
  SELECT n.id INTO v_in_app
    FROM public.notification_log n
   WHERE n.user_id = p_user_id
     AND n.channel = 'in_app'
     AND n.opened_at IS NULL
     AND n.metadata->>'entity_type' = p_entity_type
     AND n.metadata->>'entity_id'   = p_entity_id::text
   ORDER BY n.created_at DESC
   LIMIT 1;

  IF v_in_app IS NOT NULL THEN
    UPDATE public.notification_log
       SET metadata = metadata || v_meta,
           type     = v_type,
           status   = 'delivered',
           sent_at  = now()
     WHERE id = v_in_app;
  ELSE
    INSERT INTO public.notification_log
      (user_id, type, channel, status, template_id, metadata, sent_at)
    VALUES
      (p_user_id, v_type, 'in_app', 'delivered', 'client-attention', v_meta, now())
    RETURNING id INTO v_in_app;
  END IF;

  -- The push envelope. Always its own row, always the id apns-send is handed.
  INSERT INTO public.notification_log
    (user_id, type, channel, status, template_id, metadata)
  VALUES
    (p_user_id, v_type, 'push', 'queued', 'client-attention-push', v_meta)
  RETURNING id INTO v_push;

  -- Best-effort dispatch. Locally the Vault carries no service_role_key, so
  -- invoke_edge_function returns NULL with a warning; on a device with no APNs
  -- secrets apns-send answers 200 {skipped}. Neither may break a send.
  BEGIN
    PERFORM public.invoke_edge_function(
      'apns-send',
      jsonb_build_object(
        'user_id',             p_user_id,
        'title',               p_title,
        'body',                COALESCE(p_body, ''),
        'entity_type',         p_entity_type,
        'entity_id',           p_entity_id::text,
        'notification_log_id', v_push
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_client_attention: apns dispatch failed for % %: %',
      p_entity_type, p_entity_id, sqlerrm;
  END;

  RETURN v_push;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_client_attention(uuid, text, uuid, text, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_client_attention(uuid, text, uuid, text, text, jsonb)
  TO service_role;

COMMENT ON FUNCTION public.notify_client_attention(uuid, text, uuid, text, text, jsonb) IS
  'SP-08: the one writer of client-facing attention rows. Two notification_log rows per call — in_app/delivered (the bell, never handed to apns-send) and push/queued (the envelope, whose id is). De-duplicates the bell row on (user, entity_type, entity_id) while unopened. service_role only: it writes for an arbitrary user_id.';

-- ─── 2. sync_proposal_send_in_app_log (lineage 00388 → 00534) ───────────────

CREATE OR REPLACE FUNCTION public.sync_proposal_send_in_app_log(p_dispatch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dispatch public.proposal_send_dispatches%ROWTYPE;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'sync_proposal_send_in_app_log requires service_role'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_dispatch
  FROM public.proposal_send_dispatches
  WHERE id = p_dispatch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal send dispatch not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  INSERT INTO public.notification_log (
    id, user_id, type, channel, status, template_id, metadata, sent_at
  ) VALUES (
    v_dispatch.in_app_log_id,
    v_dispatch.client_id,
    'proposal_sent',
    'in_app',
    'delivered',
    'proposal-sent',
    jsonb_build_object(
      'proposal_id', v_dispatch.proposal_id,
      'dispatch_id', v_dispatch.id,
      'sent_at', v_dispatch.sent_at,
      'subject', 'Proposal ready for your review',
      'message', v_dispatch.proposal_title,
      'deep_link', v_dispatch.client_portal_path,
      -- 00534 delta: the routing + rendering keys the iOS bell reads. Without
      -- entity_type/entity_id this row is unroutable AND invisible to
      -- notify_client_attention's de-dup; without 'body' it renders blank.
      'entity_type', 'proposal',
      'entity_id', v_dispatch.proposal_id::text,
      'title', 'Proposal ready for your review',
      'body', v_dispatch.proposal_title
    ),
    v_dispatch.sent_at
  )
  ON CONFLICT (id) DO UPDATE SET
    metadata = EXCLUDED.metadata;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_proposal_send_in_app_log(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_proposal_send_in_app_log(uuid) TO service_role;

-- ─── 3. the decision trigger (00289 shape) ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_client_decision_raised()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client uuid;
BEGIN
  -- Only a decision that has actually been put to the client.
  IF NEW.status <> 'pending' OR NEW.court <> 'client' THEN
    RETURN NEW;
  END IF;

  SELECT dc.client_id INTO v_client
    FROM public.designer_clients dc
   WHERE dc.id = NEW.designer_client_id;

  -- A client who has not signed up yet (designer_clients.client_id NULL) has
  -- nobody to notify. That is a normal state, not a failure.
  IF v_client IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM public.notify_client_attention(
      v_client,
      'decision',
      NEW.id,
      'A decision needs you',
      COALESCE(NULLIF(btrim(NEW.title), ''), 'Your designer needs a decision from you.'),
      jsonb_build_object('project_id', NEW.project_id, 'due_date', NEW.due_date)
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_client_decision_raised: notification failed for decision %: %',
      NEW.id, sqlerrm;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_client_decision_raised()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_client_decision_raised_notify_client ON public.client_decisions;
CREATE TRIGGER on_client_decision_raised_notify_client
  AFTER INSERT ON public.client_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_client_decision_raised();
