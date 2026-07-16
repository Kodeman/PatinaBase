-- ═══════════════════════════════════════════════════════════════════════════
-- 00333 — client_pick: she picks, the arc closes (R106 §4/§7, build plan 2.6)
--
-- Program: Arrival Arc (Wave 2). The homeowner's one act on the match screen:
-- tap a slot, book the discovery call. Writes the pick onto the ceremony
-- (state='picked'), letters the DESIGNER in The Post with a named,
-- deep-linked line — "{Client} chose {Thu Jul 23 · 2:00 PM}" — pointing at
-- the Document ('/doc/{designer_client_id}').
--
-- Contract details:
--   · Caller must be the ceremony's client_id; anything else (including a
--     nonexistent ceremony) raises 'not_found' — never leak whether a
--     ceremony exists to a stranger.
--   · state='picked' already → 'already_picked', with the existing pick in
--     the error DETAIL payload so the client app can render the booked slot.
--   · state='draft' is unreachable for a client (RLS hides drafts), but the
--     RPC re-checks: only 'sent' proceeds.
--   · The slot must exist in offered_slots (else 'not_found') and still be in
--     the future (else 'slot_stale' — the chip asks the designer for fresh
--     times, 00334).
--   · Slot time formatted in the ceremony's timezone (fallback UTC) as
--     'Dy Mon DD · HH12:MI AM'.
--   · Returns the booked slot jsonb.
--
-- GRANT: authenticated — homeowners call this. Row-level safety lives in the
-- function's own client_id check (SECURITY DEFINER), not RLS.
-- No APNs/email to the designer: The Post letter is the designer-side surface
-- (portals poll notification_log); push is a client-app rail only.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.client_pick(p_ceremony_id uuid, p_slot_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid         uuid := auth.uid();
  v_ceremony    match_ceremonies%ROWTYPE;
  v_slot        jsonb;
  v_starts      timestamptz;
  v_client_name text;
  v_formatted   text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING DETAIL = 'auth.uid() is null';
  END IF;

  -- Lock + ownership in one read. A stranger (or a bad id) learns nothing
  -- beyond 'not_found'.
  SELECT * INTO v_ceremony FROM match_ceremonies
   WHERE id = p_ceremony_id FOR UPDATE;
  IF NOT FOUND OR v_ceremony.client_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'not_found' USING DETAIL = p_ceremony_id::text;
  END IF;

  IF v_ceremony.state = 'picked' THEN
    RAISE EXCEPTION 'already_picked' USING DETAIL = jsonb_build_object(
      'picked_slot_id',        v_ceremony.picked_slot_id,
      'picked_slot_starts_at', v_ceremony.picked_slot_starts_at,
      'picked_at',             v_ceremony.picked_at
    )::text;
  END IF;

  IF v_ceremony.state <> 'sent' THEN
    -- A draft is invisible to clients by RLS; belt-and-braces here.
    RAISE EXCEPTION 'not_found' USING DETAIL = p_ceremony_id::text;
  END IF;

  -- Find the offered slot by id.
  SELECT s.value INTO v_slot
  FROM jsonb_array_elements(COALESCE(v_ceremony.offered_slots, '[]'::jsonb)) s
  WHERE s.value->>'id' = p_slot_id::text;
  IF v_slot IS NULL THEN
    RAISE EXCEPTION 'not_found' USING DETAIL = 'slot ' || p_slot_id::text;
  END IF;

  v_starts := (v_slot->>'starts_at')::timestamptz;
  IF v_starts IS NULL OR v_starts <= now() THEN
    RAISE EXCEPTION 'slot_stale' USING DETAIL = COALESCE(v_starts::text, 'no starts_at');
  END IF;

  UPDATE match_ceremonies
     SET picked_slot_id        = p_slot_id,
         picked_slot_starts_at = v_starts,
         picked_at             = now(),
         state                 = 'picked',
         updated_at            = now()
   WHERE id = v_ceremony.id;

  -- ── The Post letter for the designer: named, timed, deep-linked (P3 fix). ──
  -- Best-effort: a letter failure must never unwind the booking.
  BEGIN
    -- Client name: the ceremony's engagement row first (household label wins,
    -- 00327 precedence), then the profile.
    SELECT dc.client_name INTO v_client_name
    FROM designer_clients dc
    WHERE dc.id = v_ceremony.designer_client_id;

    IF v_client_name IS NULL OR btrim(v_client_name) = '' THEN
      SELECT COALESCE(NULLIF(btrim(p.display_name), ''), p.full_name)
        INTO v_client_name
      FROM profiles p WHERE p.id = v_uid;
    END IF;
    v_client_name := COALESCE(NULLIF(btrim(v_client_name), ''), 'Your client');

    v_formatted := to_char(
      v_starts AT TIME ZONE COALESCE(NULLIF(btrim(v_ceremony.timezone), ''), 'UTC'),
      'Dy Mon DD · HH12:MI AM'
    );

    INSERT INTO notification_log (user_id, type, channel, status, template_id, metadata)
    VALUES (
      v_ceremony.designer_id,
      'discovery_call_picked',
      'in_app',
      'delivered',
      'discovery-call-picked',
      jsonb_build_object(
        'lead_id',            v_ceremony.lead_id,
        'ceremony_id',        v_ceremony.id,
        'designer_client_id', v_ceremony.designer_client_id,
        'thread_id',          v_ceremony.thread_id,
        'picked_slot_id',     p_slot_id,
        'starts_at',          v_starts,
        'entity_type',        'design_request',
        'entity_id',          v_ceremony.lead_id::text,
        'title',              v_client_name || ' chose ' || v_formatted,
        'message',            v_client_name || ' chose ' || v_formatted
                              || ' for the discovery call.',
        'deep_link',          '/doc/' || COALESCE(v_ceremony.designer_client_id::text,
                                                  v_ceremony.lead_id::text),
        'url',                '/doc/' || COALESCE(v_ceremony.designer_client_id::text,
                                                  v_ceremony.lead_id::text)
      )
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'client_pick: designer letter failed for ceremony %: %',
      v_ceremony.id, sqlerrm;
  END;

  RETURN v_slot;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.client_pick(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.client_pick(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.client_pick(uuid, uuid) IS
  'Arrival Arc (R106 §4): the homeowner books one offered discovery slot. '
  'Validates caller = ceremony.client_id (else not_found — no existence leak), '
  'state=sent (picked → already_picked with the existing pick in DETAIL), slot '
  'present and future (else slot_stale). Stamps the pick, flips state=picked, '
  'letters the designer in The Post (named + formatted in the ceremony timezone, '
  'deep-linked to /doc/{designer_client_id}). Returns the booked slot jsonb.';
