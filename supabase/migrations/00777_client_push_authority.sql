-- ═══════════════════════════════════════════════════════════════════════════
-- 00777 — Carry send authority through client push dispatch and held release.
-- Lineage: 00534 → 00569 → 00572 (notify_client_attention and its trigger).
-- Reconciles: client-facing APNs pushes previously left without send authority.
-- ═══════════════════════════════════════════════════════════════════════════

-- Replace the historical six-argument signature with a seven-argument function.
-- The nullable default is a transition bridge for existing callers only: the
-- APNs endpoint refuses and logs any unlabelled client-recipient push.
DROP FUNCTION IF EXISTS public.notify_client_attention(uuid, text, uuid, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.notify_client_attention(
  p_user_id     uuid,
  p_entity_type text,
  p_entity_id   uuid,
  p_title       text,
  p_body        text,
  p_metadata    jsonb DEFAULT '{}'::jsonb,
  p_authority   jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_path       text;
  v_meta       jsonb;
  v_type       text;
  v_in_app     uuid;
  v_push       uuid;
  v_is_receipt boolean;
  v_deliver_at timestamptz;
BEGIN
  -- A notification helper must never abort its caller's transaction. Every
  -- rejection here is a quiet NULL, not an exception.
  IF p_user_id IS NULL OR p_entity_id IS NULL OR p_title IS NULL THEN
    RETURN NULL;
  END IF;

  v_is_receipt := COALESCE(p_metadata->>'kind', '') = 'decision_receipt';

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
    'message',     COALESCE(p_body, ''),
    'deep_link',   v_path,
    'url',         v_path
  );

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
       SET metadata  = metadata || v_meta,
           type      = v_type,
           status    = CASE WHEN v_is_receipt THEN 'opened' ELSE 'delivered' END
                         ::public.notification_status,
           opened_at = CASE WHEN v_is_receipt THEN now() ELSE opened_at END,
           sent_at   = now()
     WHERE id = v_in_app;
  ELSE
    INSERT INTO public.notification_log
      (user_id, type, channel, status, template_id, metadata, sent_at, opened_at)
    VALUES
      (p_user_id, v_type, 'in_app',
       (CASE WHEN v_is_receipt THEN 'opened' ELSE 'delivered' END)
         ::public.notification_status,
       'client-attention', v_meta, now(),
       CASE WHEN v_is_receipt THEN now() END)
    RETURNING id INTO v_in_app;
  END IF;

  IF v_is_receipt THEN
    RETURN NULL;
  END IF;

  v_deliver_at := public.push_deliver_after(p_user_id, now());

  INSERT INTO public.notification_log
    (user_id, type, channel, status, template_id, metadata, deliver_after, send_authority)
  VALUES
    (p_user_id, v_type, 'push', 'queued', 'client-attention-push', v_meta,
     v_deliver_at, p_authority)
  RETURNING id INTO v_push;

  IF v_deliver_at IS NOT NULL THEN
    RETURN v_push;
  END IF;

  BEGIN
    PERFORM public.invoke_edge_function(
      'apns-send',
      jsonb_build_object(
        'user_id',             p_user_id,
        'title',               p_title,
        'body',                COALESCE(p_body, ''),
        'entity_type',         p_entity_type,
        'entity_id',           p_entity_id::text,
        'notification_log_id', v_push,
        'authority',           p_authority
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'notify_client_attention: apns dispatch failed for % %: %',
      p_entity_type, p_entity_id, sqlerrm;
  END;

  RETURN v_push;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_client_attention(uuid, text, uuid, text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notify_client_attention(uuid, text, uuid, text, text, jsonb, jsonb)
  TO service_role;
COMMENT ON FUNCTION public.notify_client_attention(uuid, text, uuid, text, text, jsonb, jsonb) IS
  'Writes client attention rows and carries typed send authority to apns-send. p_authority defaults to NULL only as a transition bridge for old callers; apns-send refuses/logs unlabelled client pushes. Authority is stored on the push notification_log row so held pushes preserve it through release. decision_receipt remains an in-app-only acknowledgement.';

CREATE OR REPLACE FUNCTION public.release_due_client_pushes(
  p_limit integer DEFAULT 200
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row record;
  v_sent integer := 0;
BEGIN
  FOR v_row IN
    SELECT n.id, n.user_id, n.metadata, n.send_authority,
           (
             EXISTS (
               SELECT 1
                 FROM public.notification_log AS bell
                WHERE bell.user_id = n.user_id
                  AND bell.channel = 'in_app'
                  AND bell.opened_at IS NULL
                  AND bell.metadata->>'entity_type' = n.metadata->>'entity_type'
                  AND bell.metadata->>'entity_id'   = n.metadata->>'entity_id'
             )
             AND NOT EXISTS (
               SELECT 1
                 FROM public.client_decisions AS decision
                WHERE n.metadata->>'entity_type' = 'decision'
                  AND decision.id::text = n.metadata->>'entity_id'
                  AND decision.status <> 'pending'
             )
           ) AS still_waiting
      FROM public.notification_log AS n
     WHERE n.channel = 'push'
       AND n.status = 'queued'
       AND n.deliver_after IS NOT NULL
       AND n.deliver_after <= now()
     ORDER BY n.deliver_after
     LIMIT GREATEST(COALESCE(p_limit, 200), 1)
  LOOP
    IF NOT v_row.still_waiting THEN
      UPDATE public.notification_log
         SET status = 'suppressed',
             metadata = metadata || jsonb_build_object(
               'release_skipped', 'answered_before_release')
       WHERE id = v_row.id;
      CONTINUE;
    END IF;

    UPDATE public.notification_log
       SET status = 'sending', sent_at = now()
     WHERE id = v_row.id;

    BEGIN
      PERFORM public.invoke_edge_function(
        'apns-send',
        jsonb_build_object(
          'user_id',             v_row.user_id,
          'title',               COALESCE(v_row.metadata->>'title', ''),
          'body',                COALESCE(v_row.metadata->>'body', ''),
          'entity_type',         v_row.metadata->>'entity_type',
          'entity_id',           v_row.metadata->>'entity_id',
          'notification_log_id', v_row.id,
          'authority',           v_row.send_authority
        )
      );
      v_sent := v_sent + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'release_due_client_pushes: dispatch failed for %: %',
        v_row.id, sqlerrm;
    END;
  END LOOP;

  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.release_due_client_pushes(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_due_client_pushes(integer)
  TO service_role;
COMMENT ON FUNCTION public.release_due_client_pushes(integer) IS
  'Releases held client push envelopes and forwards each row''s persisted send_authority to apns-send. Unlabelled client pushes are refused and logged by apns-send.';

CREATE OR REPLACE FUNCTION public.notify_client_decision_raised()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client uuid;
  v_title text;
BEGIN
  IF NEW.status <> 'pending' OR NEW.court <> 'client' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NOT (OLD.status IS DISTINCT FROM NEW.status) THEN
    RETURN NEW;
  END IF;

  SELECT dc.client_id INTO v_client
    FROM public.designer_clients dc
   WHERE dc.id = NEW.designer_client_id;

  IF v_client IS NULL THEN
    RETURN NEW;
  END IF;

  v_title := CASE NEW.coordination_kind
               WHEN 'rfi'       THEN 'A question needs you'
               WHEN 'submittal' THEN 'A submittal needs your review'
               WHEN 'signoff'   THEN 'A sign-off needs you'
               WHEN 'punch'     THEN 'A punch item needs you'
               ELSE 'A decision needs you'
             END;

  BEGIN
    PERFORM public.notify_client_attention(
      v_client,
      'decision',
      NEW.id,
      v_title,
      COALESCE(NULLIF(btrim(NEW.title), ''), 'Your designer needs a decision from you.'),
      jsonb_build_object('project_id', NEW.project_id, 'due_date', NEW.due_date,
                         'coordination_kind', NEW.coordination_kind),
      jsonb_build_object('kind', 'designer', 'userId', auth.uid())
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
COMMENT ON FUNCTION public.notify_client_decision_raised() IS
  'Sends the client decision attention push with designer authority for the transaction''s publishing actor (auth.uid()); non-fatal to the decision publish transaction.';
