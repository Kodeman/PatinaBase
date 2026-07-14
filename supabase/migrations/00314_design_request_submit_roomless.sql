-- ═══════════════════════════════════════════════════════════════════════════
-- 00314 — Roomless design request: submit_design_request accepts zero scans
--
-- Lineage: 00285 (original) → (this). Body grafted VERBATIM from
--   00285_design_request_submit.sql (grep confirms no intervening redefinition)
--   with one surgical change: scans are now OPTIONAL, so a homeowner can request
--   design help WITHOUT attaching a room scan (the iOS "Request without a scan"
--   path — DesignRequestDraft.isRoomless, SubmitDesignRequestParams with empty
--   p_scan_ids + null p_primary_scan_id).
--
-- When p_scan_ids is empty/NULL:
--   • skip the `no_scans` RAISE and the per-scan ownership/'ready' validation,
--   • the lead is inserted with room_scan_id = NULL (column is nullable —
--     REFERENCES room_scans(id) ON DELETE SET NULL, 00029/00224),
--   • no lead_room_scans junction rows and no room_scan_associations are written
--     (the FOREACH loops iterate an empty array = no-ops),
--   • the designer in-app notification copy reads as a scanless request.
--
-- The scan-based path is BYTE-IDENTICAL to 00285 (every guard/loop runs only
-- when scans are provided). Pooling/claim, idempotent replay (client_request_id),
-- and the concurrent-double-submit race guard are preserved exactly. Same
-- signature → the 00285 REVOKE/GRANT still applies (re-asserted below).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.submit_design_request(
  p_scan_ids         uuid[],
  p_project_type     text,
  p_primary_scan_id  uuid DEFAULT NULL,
  p_budget_range     text DEFAULT NULL,
  p_timeline         text DEFAULT NULL,
  p_description      text DEFAULT NULL,
  p_designer_id      uuid DEFAULT NULL,
  p_source           text DEFAULT 'Patina app',
  p_client_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_primary     uuid;
  v_scan_id     uuid;
  v_scan_status text;
  v_designer_id uuid := p_designer_id;
  v_dc_designers uuid[];
  v_city        text;
  v_state       text;
  v_zip         text;
  v_lead_id     uuid;
  v_pos         integer := 0;
  v_scan_count  integer := COALESCE(array_length(p_scan_ids, 1), 0);
  -- A roomless request carries no scans: skip scan validation, leave
  -- leads.room_scan_id NULL, write no junction/association rows.
  v_is_roomless boolean := (p_scan_ids IS NULL OR COALESCE(array_length(p_scan_ids, 1), 0) = 0);
  -- idempotent-replay probes (kept separate so a miss cannot clobber v_designer_id)
  v_replay_id       uuid;
  v_replay_designer uuid;
  v_replay_status   text;
BEGIN
  -- ── validation (stable machine-readable slugs; iOS maps on message) ────────
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING DETAIL = 'auth.uid() is null';
  END IF;

  -- Scans are optional now. Validate them only when provided.
  IF NOT v_is_roomless THEN
    v_primary := COALESCE(p_primary_scan_id, p_scan_ids[1]);
    IF NOT (v_primary = ANY (p_scan_ids)) THEN
      RAISE EXCEPTION 'primary_not_in_set' USING DETAIL = v_primary::text;
    END IF;
  END IF;

  IF p_project_type IS NULL
     OR p_project_type NOT IN ('full_room', 'consultation', 'single_piece', 'staging') THEN
    RAISE EXCEPTION 'invalid_project_type' USING DETAIL = COALESCE(p_project_type, 'null');
  END IF;

  IF v_designer_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = v_designer_id AND p.is_designer) THEN
    RAISE EXCEPTION 'designer_not_found' USING DETAIL = v_designer_id::text;
  END IF;

  IF NOT v_is_roomless THEN
    FOREACH v_scan_id IN ARRAY p_scan_ids LOOP
      SELECT rs.status INTO v_scan_status
      FROM room_scans rs
      WHERE rs.id = v_scan_id AND rs.user_id = v_uid;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'scan_not_found_or_not_owned' USING DETAIL = v_scan_id::text;
      END IF;
      IF v_scan_status IS DISTINCT FROM 'ready' THEN
        RAISE EXCEPTION 'scan_not_ready' USING DETAIL = v_scan_id::text;
      END IF;
    END LOOP;
  END IF;

  -- ── idempotent replay ─────────────────────────────────────────────────────
  IF p_client_request_id IS NOT NULL THEN
    SELECT l.id, l.designer_id, l.status
      INTO v_replay_id, v_replay_designer, v_replay_status
    FROM leads l
    WHERE l.homeowner_id = v_uid
      AND l.client_request_id = p_client_request_id
    LIMIT 1;

    IF v_replay_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'lead_id',           v_replay_id,
        'designer_id',       v_replay_designer,
        'status',            v_replay_status,
        'pooled',            (v_replay_designer IS NULL),
        'idempotent_replay', true
      );
    END IF;
  END IF;

  -- ── auto-resolve designer (conductor ruling #2) ──────────────────────────
  -- Assign iff the caller has EXACTLY ONE active designer_clients relationship.
  IF v_designer_id IS NULL THEN
    SELECT array_agg(DISTINCT dc.designer_id) INTO v_dc_designers
    FROM designer_clients dc
    WHERE dc.client_id = v_uid AND dc.status = 'active';

    IF array_length(v_dc_designers, 1) = 1 THEN
      v_designer_id := v_dc_designers[1];
    END IF;
  END IF;

  -- Copy the homeowner''s location onto the lead so the pool card / Brief can
  -- show a city/state without exposing the profile.
  SELECT p.city, p.state, p.zip INTO v_city, v_state, v_zip
  FROM profiles p WHERE p.id = v_uid;

  -- ── insert lead ───────────────────────────────────────────────────────────
  -- room_scan_id = v_primary, which is NULL for a roomless request.
  BEGIN
    INSERT INTO leads (
      homeowner_id, designer_id, project_type, project_description,
      budget_range, timeline, status, source, room_scan_id, client_request_id,
      location_city, location_state, location_zip
    ) VALUES (
      v_uid, v_designer_id, p_project_type, p_description,
      p_budget_range, p_timeline, 'new', COALESCE(p_source, 'Patina app'),
      v_primary, p_client_request_id,
      v_city, v_state, v_zip
    )
    RETURNING id INTO v_lead_id;
  EXCEPTION WHEN unique_violation THEN
    IF p_client_request_id IS NULL THEN
      RAISE;  -- no idempotency key in play — not our race, rethrow
    END IF;

    -- concurrent duplicate with the same idempotency key: replay the winner
    SELECT l.id, l.designer_id, l.status
      INTO v_replay_id, v_replay_designer, v_replay_status
    FROM leads l
    WHERE l.homeowner_id = v_uid
      AND l.client_request_id = p_client_request_id
    LIMIT 1;

    IF v_replay_id IS NULL THEN
      RAISE;  -- some other unique constraint fired — rethrow
    END IF;

    RETURN jsonb_build_object(
      'lead_id',           v_replay_id,
      'designer_id',       v_replay_designer,
      'status',            v_replay_status,
      'pooled',            (v_replay_designer IS NULL),
      'idempotent_replay', true
    );
  END;

  -- ── junction rows (ordered; exactly one primary) — none when roomless ─────
  v_pos := 0;
  FOREACH v_scan_id IN ARRAY p_scan_ids LOOP
    INSERT INTO lead_room_scans (lead_id, scan_id, is_primary, position)
    VALUES (v_lead_id, v_scan_id, (v_scan_id = v_primary), v_pos)
    ON CONFLICT (lead_id, scan_id) DO NOTHING;
    v_pos := v_pos + 1;
  END LOOP;

  -- ── resolved designer: mint associations + in-app notification ───────────
  IF v_designer_id IS NOT NULL THEN
    -- No-op FOREACH over an empty array for a roomless request.
    FOREACH v_scan_id IN ARRAY p_scan_ids LOOP
      INSERT INTO room_scan_associations (
        scan_id, consumer_id, designer_id, association_type, status, access_level,
        shared_at, requested_at, lead_id
      ) VALUES (
        v_scan_id, v_uid, v_designer_id, 'explicit', 'active', 'full',
        now(), now(), v_lead_id
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

    -- In-app inbox row (bell polls). Best-effort — a notification failure must
    -- never fail the submit. Emails are the 00042 triggers' job, not ours.
    BEGIN
      INSERT INTO notification_log (user_id, type, channel, status, template_id, metadata)
      VALUES (
        v_designer_id,
        'design_request_received',
        'in_app',
        'delivered',
        'design-request-received',
        jsonb_build_object(
          'lead_id',    v_lead_id,
          'scan_count', v_scan_count,
          'title',      'New design request',
          'message',    CASE
                          WHEN v_is_roomless THEN
                            'A homeowner sent you a design request (no room scan attached).'
                          ELSE
                            'A homeowner sent you a design request with '
                              || v_scan_count::text || ' room scan'
                              || CASE WHEN v_scan_count = 1 THEN '' ELSE 's' END || '.'
                        END,
          'deep_link',  '/doc/' || v_lead_id::text,
          'url',        '/doc/' || v_lead_id::text
        )
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'submit_design_request: notification insert failed for lead %: %',
        v_lead_id, sqlerrm;
    END;
  END IF;

  RETURN jsonb_build_object(
    'lead_id',           v_lead_id,
    'designer_id',       v_designer_id,
    'status',            'new',
    'pooled',            (v_designer_id IS NULL),
    'idempotent_replay', false
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_design_request(uuid[], text, uuid, text, text, text, uuid, text, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.submit_design_request(uuid[], text, uuid, text, text, text, uuid, text, uuid) TO authenticated, service_role;
