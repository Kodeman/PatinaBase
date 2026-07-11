-- ═══════════════════════════════════════════════════════════════════════════
-- 00285 — Design request submit (scan → request pipeline, Wave 0)
--
-- The client iOS app holds a room scan locally until the homeowner explicitly
-- requests design services. This migration adds the atomic "design request"
-- primitive on the backend:
--   • lead_room_scans — junction carrying the full scan set for one request
--     (leads.room_scan_id remains the PRIMARY scan; the set lives here).
--   • leads.client_request_id — idempotency key so an iOS retry replays the
--     original lead instead of minting a duplicate.
--   • submit_design_request() — one SECURITY DEFINER transaction that validates
--     ownership/readiness, inserts the lead + junction, and (when a designer is
--     known or auto-resolvable) mints active/full room_scan_associations + an
--     in-app notification for the designer. The existing 00042 AFTER INSERT
--     triggers still fire the designer/consumer EMAILS — we do NOT duplicate
--     them here.
--
-- Conductor integration rulings baked in:
--   #2 auto-resolve: p_designer_id NULL → assign iff the caller has EXACTLY ONE
--      active designer_clients relationship; otherwise leave NULL (open pool).
--   #3 p_source default is the human-readable 'Patina app' (Brief shows it raw).
--
-- New objects → RLS + explicit grants in-file (post-2026-05-30 default flip).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── lead_room_scans junction ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_room_scans (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id    uuid NOT NULL REFERENCES public.leads(id)      ON DELETE CASCADE,
  scan_id    uuid NOT NULL REFERENCES public.room_scans(id) ON DELETE CASCADE,
  is_primary boolean NOT NULL DEFAULT false,
  position   integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lead_id, scan_id)
);

-- At most one primary scan per lead.
CREATE UNIQUE INDEX IF NOT EXISTS lead_room_scans_one_primary
  ON public.lead_room_scans (lead_id) WHERE is_primary;

CREATE INDEX IF NOT EXISTS idx_lead_room_scans_scan ON public.lead_room_scans (scan_id);
CREATE INDEX IF NOT EXISTS idx_lead_room_scans_lead ON public.lead_room_scans (lead_id);

COMMENT ON TABLE public.lead_room_scans IS
  'Junction: the full ordered set of room scans attached to one design request '
  '(lead). leads.room_scan_id remains the primary scan; is_primary flags it here '
  'too. Written only by submit_design_request / claim_design_request (SECURITY '
  'DEFINER); readable by the lead''s homeowner or designer.';

ALTER TABLE public.lead_room_scans ENABLE ROW LEVEL SECURITY;

-- SELECT for the lead''s participants (homeowner or its designer). No INSERT/
-- UPDATE/DELETE policy for callers on purpose — writes flow only through the
-- SECURITY DEFINER RPCs below.
DROP POLICY IF EXISTS "lead_room_scans participant read" ON public.lead_room_scans;
CREATE POLICY "lead_room_scans participant read" ON public.lead_room_scans
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.leads l
      WHERE l.id = lead_room_scans.lead_id
        AND (l.homeowner_id = auth.uid() OR l.designer_id = auth.uid())
    )
  );

GRANT SELECT ON public.lead_room_scans TO authenticated;
GRANT ALL    ON public.lead_room_scans TO service_role;

-- ── leads.client_request_id (idempotency key) ───────────────────────────────
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS client_request_id uuid;

COMMENT ON COLUMN public.leads.client_request_id IS
  'Client-supplied idempotency key (iOS DesignRequestDraft.id). One design '
  'request per (homeowner_id, client_request_id); submit_design_request replays '
  'the existing lead on retry.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_leads_homeowner_client_request
  ON public.leads (homeowner_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- ── Backfill: one primary junction row per existing scan-bearing lead ────────
-- On a fresh local reset this is a no-op (seeds load after migrations); it
-- exists for prod's pre-existing leads that carry only room_scan_id.
INSERT INTO public.lead_room_scans (lead_id, scan_id, is_primary, position)
SELECT l.id, l.room_scan_id, true, 0
FROM public.leads l
JOIN public.room_scans rs ON rs.id = l.room_scan_id
WHERE l.room_scan_id IS NOT NULL
ON CONFLICT (lead_id, scan_id) DO NOTHING;

-- ── submit_design_request RPC ───────────────────────────────────────────────
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
  v_scan_count  integer := array_length(p_scan_ids, 1);
  -- idempotent-replay probes (kept separate so a miss cannot clobber v_designer_id)
  v_replay_id       uuid;
  v_replay_designer uuid;
  v_replay_status   text;
BEGIN
  -- ── validation (stable machine-readable slugs; iOS maps on message) ────────
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING DETAIL = 'auth.uid() is null';
  END IF;

  IF p_scan_ids IS NULL OR v_scan_count IS NULL OR v_scan_count = 0 THEN
    RAISE EXCEPTION 'no_scans' USING DETAIL = 'p_scan_ids is empty';
  END IF;

  v_primary := COALESCE(p_primary_scan_id, p_scan_ids[1]);
  IF NOT (v_primary = ANY (p_scan_ids)) THEN
    RAISE EXCEPTION 'primary_not_in_set' USING DETAIL = v_primary::text;
  END IF;

  IF p_project_type IS NULL
     OR p_project_type NOT IN ('full_room', 'consultation', 'single_piece', 'staging') THEN
    RAISE EXCEPTION 'invalid_project_type' USING DETAIL = COALESCE(p_project_type, 'null');
  END IF;

  IF v_designer_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = v_designer_id AND p.is_designer) THEN
    RAISE EXCEPTION 'designer_not_found' USING DETAIL = v_designer_id::text;
  END IF;

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

  -- ── junction rows (ordered; exactly one primary) ─────────────────────────
  v_pos := 0;
  FOREACH v_scan_id IN ARRAY p_scan_ids LOOP
    INSERT INTO lead_room_scans (lead_id, scan_id, is_primary, position)
    VALUES (v_lead_id, v_scan_id, (v_scan_id = v_primary), v_pos)
    ON CONFLICT (lead_id, scan_id) DO NOTHING;
    v_pos := v_pos + 1;
  END LOOP;

  -- ── resolved designer: mint associations + in-app notification ───────────
  IF v_designer_id IS NOT NULL THEN
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
          'message',    'A homeowner sent you a design request with '
                          || v_scan_count::text || ' room scan'
                          || CASE WHEN v_scan_count = 1 THEN '' ELSE 's' END || '.',
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
