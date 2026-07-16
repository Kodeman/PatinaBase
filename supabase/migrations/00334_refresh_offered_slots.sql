-- ═══════════════════════════════════════════════════════════════════════════
-- 00334 — refresh_offered_slots: fresh times when the offer goes stale (R106 §4)
--
-- Program: Arrival Arc (Wave 2, build plan 2.7). When the offered slots pass
-- unpicked ("the chip asks for fresh times"), the designer replaces them.
-- Designer-callable; state must still be 'sent' (a picked ceremony is booked —
-- rescheduling a booked call is thread territory, not this RPC).
--
-- Slots are validated + normalized exactly like ceremony_complete (2–3 slots,
-- all future, server-minted uuid ids where absent, 45-minute default).
-- offered_slots is REPLACED wholesale and offered_at reset to now() — the 48h
-- silence timer restarts with the fresh offer.
--
-- Client notification: in_app row + best-effort APNs ONLY. Deliberately NO
-- email: there is no seeded template for a times-refresh, and reusing
-- 'design-request-intro-delivered' would re-send "introduced themselves" copy
-- for an act that isn't an introduction. If pilot shows refreshes need email
-- weight, seed a dedicated template first (00336 pattern).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.refresh_offered_slots(p_ceremony_id uuid, p_slots jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_ceremony    match_ceremonies%ROWTYPE;
  v_slot        jsonb;
  v_slots       jsonb := '[]'::jsonb;
  v_slot_count  int;
  v_starts      timestamptz;
  v_studio_name text;
  v_log_id      uuid;
  v_title       text;
  v_message     text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING DETAIL = 'auth.uid() is null';
  END IF;

  SELECT * INTO v_ceremony FROM match_ceremonies
   WHERE id = p_ceremony_id FOR UPDATE;
  IF NOT FOUND OR v_ceremony.designer_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not_found' USING DETAIL = p_ceremony_id::text;
  END IF;

  IF v_ceremony.state = 'picked' THEN
    RAISE EXCEPTION 'already_picked' USING DETAIL = jsonb_build_object(
      'picked_slot_id',        v_ceremony.picked_slot_id,
      'picked_slot_starts_at', v_ceremony.picked_slot_starts_at
    )::text;
  END IF;
  IF v_ceremony.state <> 'sent' THEN
    RAISE EXCEPTION 'not_sent'
      USING DETAIL = 'ceremony ' || p_ceremony_id::text || ' is still a draft';
  END IF;

  -- Validate + normalize (same rules as ceremony_complete).
  IF p_slots IS NULL OR jsonb_typeof(p_slots) <> 'array' THEN
    RAISE EXCEPTION 'slots_invalid' USING DETAIL = 'offered slots must be a json array';
  END IF;
  v_slot_count := jsonb_array_length(p_slots);
  IF v_slot_count < 2 OR v_slot_count > 3 THEN
    RAISE EXCEPTION 'slots_count' USING DETAIL = '2-3 offered slots required, got ' || v_slot_count;
  END IF;

  FOR v_slot IN SELECT * FROM jsonb_array_elements(p_slots) LOOP
    v_starts := (v_slot->>'starts_at')::timestamptz;
    IF v_starts IS NULL THEN
      RAISE EXCEPTION 'slot_starts_at_required' USING DETAIL = v_slot::text;
    END IF;
    IF v_starts <= now() THEN
      RAISE EXCEPTION 'slot_in_past' USING DETAIL = v_starts::text;
    END IF;
    v_slots := v_slots || jsonb_build_array(jsonb_build_object(
      'id',               COALESCE(NULLIF(v_slot->>'id', '')::uuid, gen_random_uuid()),
      'starts_at',        to_jsonb(v_starts),
      'duration_minutes', COALESCE(NULLIF(v_slot->>'duration_minutes', '')::int, 45)
    ));
  END LOOP;

  UPDATE match_ceremonies
     SET offered_slots = v_slots,
         offered_at    = now(),
         updated_at    = now()
   WHERE id = v_ceremony.id;

  -- Client notification: in_app + APNs only (no email — see header).
  BEGIN
    SELECT rsi.name INTO v_studio_name
    FROM public.resolve_studio_identity(NULL, v_uid) rsi;
    v_studio_name := COALESCE(NULLIF(btrim(v_studio_name), ''), 'Your designer');

    v_title   := v_studio_name || ' offered fresh times';
    v_message := v_studio_name || ' offered fresh times — pick one that works.';

    INSERT INTO notification_log (user_id, type, channel, status, template_id, metadata)
    VALUES (
      v_ceremony.client_id,
      'match_times_refreshed',
      'in_app',
      'delivered',
      NULL,
      jsonb_build_object(
        'lead_id',     v_ceremony.lead_id,
        'ceremony_id', v_ceremony.id,
        'entity_type', 'design_request',
        'entity_id',   v_ceremony.lead_id::text,
        'title',       v_title,
        'message',     v_message,
        'deep_link',   '/doc/' || v_ceremony.lead_id::text,
        'url',         '/doc/' || v_ceremony.lead_id::text
      )
    )
    RETURNING id INTO v_log_id;

    PERFORM public.invoke_edge_function(
      'apns-send',
      jsonb_build_object(
        'user_id',             v_ceremony.client_id,
        'title',               v_title,
        'body',                v_message,
        'entity_type',         'design_request',
        'entity_id',           v_ceremony.lead_id::text,
        'notification_log_id', v_log_id
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'refresh_offered_slots: notification step failed for ceremony %: %',
      v_ceremony.id, sqlerrm;
  END;

  RETURN v_slots;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_offered_slots(uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.refresh_offered_slots(uuid, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.refresh_offered_slots(uuid, jsonb) IS
  'Arrival Arc (R106 §4): the designer replaces a stale unpicked slot offer. '
  'Caller must be the ceremony''s designer; state must be sent (picked → '
  'already_picked). Validates/normalizes 2–3 future slots (ceremony_complete '
  'rules), replaces offered_slots, resets offered_at. Letters the client in-app '
  '+ APNs; deliberately no email (no dedicated template — see 00334 header).';
