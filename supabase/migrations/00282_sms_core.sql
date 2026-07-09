-- ═══════════════════════════════════════════════════════════════════════════
-- 00282 — SMS core + the field-effect choke point (Field Coordination · Wave 1)
--
-- Two tables (sms_conversations, sms_messages) hold the SMS state; ONE function
-- (apply_field_effect) is the single mutating choke point every field surface
-- funnels through — inbound SMS, the /field guest page, and designer triage all
-- call it, so their behavior can never diverge. review_sms_message is the
-- designer's triage handle. A field_activity_summary view + a field-media
-- storage bucket + a field_sms branch on margin_items surface it all.
--
-- Security spine:
--   · sms_conversations / sms_messages: RLS on, writes are service-role ONLY
--     (no authenticated write policy or grant — sms-inbound / sms-dispatch use
--     the service client). authenticated SELECT is team-scoped via the
--     recursion-safe is_project_team_member (00087) with a conversation→party
--     phone_e164 fallback.
--   · apply_field_effect: SECURITY DEFINER, REVOKEd from PUBLIC, anon AND
--     authenticated — only service-role callers and DEFINER callers
--     (review_sms_message) reach it. It validates every target ref belongs to
--     the party's project, so a forged cross-project ref is impossible even
--     though every caller is trusted.
--   · review_sms_message: SECURITY DEFINER but internally checks
--     is_project_team_member; granted to authenticated.
--
-- Additive only (D7). CREATE ... IF NOT EXISTS, CREATE OR REPLACE.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. sms_conversations — one row per (twilio_number, phone)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.sms_conversations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- One Patina number platform-wide today; the key includes it so per-studio
  -- numbers are a config change, not a migration (Kody's ruling 2).
  twilio_number     TEXT NOT NULL,
  phone_e164        TEXT NOT NULL,
  -- The current best-guess party/project for this phone. Soft — a phone can work
  -- many projects; the disambiguation ladder (00 plan) resolves the active one.
  party_id          UUID REFERENCES public.project_parties(id) ON DELETE SET NULL,
  active_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  state             TEXT NOT NULL DEFAULT 'idle'
                      CHECK (state IN ('idle', 'awaiting_project_choice', 'awaiting_confirmation')),
  -- Menus (numbered-reply targets), a parked pending effect awaiting confirm, etc.
  state_context     JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_inbound_at   TIMESTAMPTZ,
  last_outbound_at  TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (twilio_number, phone_e164)
);

COMMENT ON TABLE public.sms_conversations IS
  'Field Coordination: one SMS thread per (twilio_number, phone_e164). state + '
  'state_context drive the deterministic menu/confirm ladder before the LLM parse. '
  'Service-role write only; team-scoped SELECT.';

DROP TRIGGER IF EXISTS set_updated_at_sms_conversations ON public.sms_conversations;
CREATE TRIGGER set_updated_at_sms_conversations
  BEFORE UPDATE ON public.sms_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. sms_messages — every inbound/outbound message; twilio_sid = idempotency
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.sms_messages (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id              UUID NOT NULL REFERENCES public.sms_conversations(id) ON DELETE CASCADE,
  direction                    TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  body                         TEXT,
  -- [{ path, content_type, twilio_url }] — field-media object paths after fetch.
  media                        JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- The Twilio MessageSid. UNIQUE = the inbound idempotency claim
  -- (ON CONFLICT DO NOTHING). NULL for dry-run/deferred rows never sent.
  twilio_sid                   TEXT UNIQUE,
  -- Twilio delivery status, plus our synthetic 'dry_run' / 'deferred'.
  twilio_status                TEXT,
  party_id                     UUID REFERENCES public.project_parties(id) ON DELETE SET NULL,
  project_id                   UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  template_key                 TEXT,
  -- The LLM/deterministic parse result ({ intent, target_ref, confidence, … }).
  parsed_intent                JSONB,
  matched_task_id              UUID REFERENCES public.project_tasks(id) ON DELETE SET NULL,
  matched_coordination_item_id UUID REFERENCES public.client_decisions(id) ON DELETE SET NULL,
  confidence                   NUMERIC,
  needs_review                 BOOLEAN NOT NULL DEFAULT false,
  reviewed_at                  TIMESTAMPTZ,
  reviewed_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- What apply_field_effect actually did (the confirmation payload), stamped back.
  applied_effect               JSONB,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sms_messages IS
  'Field Coordination: every SMS in/out. twilio_sid UNIQUE = inbound idempotency '
  'claim. needs_review drives the Desk triage queue; applied_effect records what '
  'apply_field_effect did. Service-role write only; team-scoped SELECT.';

CREATE INDEX IF NOT EXISTS idx_sms_messages_conversation
  ON public.sms_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_messages_project
  ON public.sms_messages(project_id, created_at DESC)
  WHERE project_id IS NOT NULL;
-- The Desk triage queue: unreviewed inbound only.
CREATE INDEX IF NOT EXISTS idx_sms_messages_needs_review
  ON public.sms_messages(project_id, created_at DESC)
  WHERE needs_review AND reviewed_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. RLS — team-scoped SELECT, service-role-only writes
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.sms_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_messages      ENABLE ROW LEVEL SECURITY;

-- A conversation is readable by the project team of its active project, OR of any
-- project a party on that phone works (the phone_e164 fallback — a conversation
-- may not have picked an active_project_id yet). "Team" = the owning designer
-- (projects.designer_id, inlined EXISTS — the 00212 pattern, recursion-safe: the
-- owner is NOT auto-added to project_team_members) OR a co-designer/staff member
-- (is_project_team_member, 00087 — the only recursion-safe membership helper).
DROP POLICY IF EXISTS sms_conversations_team_select ON public.sms_conversations;
CREATE POLICY sms_conversations_team_select
  ON public.sms_conversations FOR SELECT
  TO authenticated
  USING (
    public.is_project_team_member(active_project_id)
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = sms_conversations.active_project_id
        AND p.designer_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.project_parties pp
      JOIN public.projects p2 ON p2.id = pp.project_id
      WHERE pp.phone_e164 = sms_conversations.phone_e164
        AND (public.is_project_team_member(pp.project_id) OR p2.designer_id = auth.uid())
    )
  );

-- A message is readable by the project team of its project, OR (project not yet
-- resolved) via the conversation→party phone_e164 fallback. Same team = owner or
-- member as above.
DROP POLICY IF EXISTS sms_messages_team_select ON public.sms_messages;
CREATE POLICY sms_messages_team_select
  ON public.sms_messages FOR SELECT
  TO authenticated
  USING (
    public.is_project_team_member(project_id)
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = sms_messages.project_id
        AND p.designer_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1
      FROM public.sms_conversations c
      JOIN public.project_parties pp ON pp.phone_e164 = c.phone_e164
      JOIN public.projects p2 ON p2.id = pp.project_id
      WHERE c.id = sms_messages.conversation_id
        AND (public.is_project_team_member(pp.project_id) OR p2.designer_id = auth.uid())
    )
  );

-- SELECT only for authenticated; NO insert/update/delete grant (writes flow
-- through the service client, which bypasses RLS). service_role gets ALL.
GRANT SELECT ON public.sms_conversations TO authenticated;
GRANT SELECT ON public.sms_messages      TO authenticated;
GRANT ALL ON public.sms_conversations TO service_role;
GRANT ALL ON public.sms_messages      TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. field-media bucket — MMS + /field photos
-- ═══════════════════════════════════════════════════════════════════════════
-- Path: project/{project_id}/sms/{message_id}/{n}.{ext} once matched;
--       holding/{conversation_id}/… while a message is unmatched (stays private —
--       the SELECT policy only exposes project/… paths to the team).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('field-media', 'field-media', false, 26214400, NULL) -- 25 MB, any mime
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Field team can read field media" ON storage.objects;
CREATE POLICY "Field team can read field media"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'field-media'
    AND (storage.foldername(name))[1] = 'project'
    AND (
      public.is_project_team_member(((storage.foldername(name))[2])::uuid)
      OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = ((storage.foldername(name))[2])::uuid
          AND p.designer_id = auth.uid()
      )
    )
  );
-- No INSERT/UPDATE/DELETE policy: uploads (MMS fetch, /field capture) run through
-- the service client, which bypasses RLS. holding/… objects have no SELECT policy
-- → service-role only until moved under project/… on match.

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. apply_field_effect — THE single field-mutation choke point
-- ═══════════════════════════════════════════════════════════════════════════
-- Every field status change (SMS parse, /field page tap, Desk triage-apply) lands
-- here. p_effect shape:
--   { "type": "mark_done" | "report_delay" | "flag_blocker" | "punch_report"
--             | "confirm_delivery" | "note",
--     "target": { "kind": "task" | "coordination", "id": <uuid> },   -- optional
--     "new_date": "YYYY-MM-DD",                                       -- report_delay
--     "note": "…",                                                   -- any
--     "media": ["project/…/1.jpg", …] }                              -- punch_report
--
-- FORGERY GUARD: the party (p_party_id) is on exactly one project; every target
-- ref is validated to belong to that project before any write. A trusted caller
-- passing another project's task/item id is rejected (no cross-project write).
--
-- Coordination resolves delegate to resolve_coordination_item (00218), recorded
-- on the project designer's behalf (R46 — field parties are login-less), so its
-- may_resolve_coordination_item authorization passes and the blocked→todo cascade
-- runs in the same transaction.
--
-- Returns { applied, effect_type, summary_text, remaining_count, item_id?,
--           task_id? } — summary_text is the confirmation SMS body; remaining_count
-- is the party's still-open work (owned tasks + court items).
CREATE OR REPLACE FUNCTION public.apply_field_effect(
  p_party_id       UUID,
  p_effect         JSONB,
  p_source         TEXT DEFAULT 'sms',
  p_sms_message_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_party        public.project_parties;
  v_project_id   UUID;
  v_designer_id  UUID;
  v_client_id    UUID;
  v_dc_id        UUID;
  v_type         TEXT := p_effect->>'type';
  v_target_kind  TEXT := p_effect#>>'{target,kind}';
  v_target_id    UUID := (p_effect#>>'{target,id}')::uuid;
  v_note         TEXT := NULLIF(btrim(COALESCE(p_effect->>'note', '')), '');
  v_new_date     DATE;
  v_media        JSONB := COALESCE(p_effect->'media', '[]'::jsonb);
  v_summary      TEXT;
  v_applied      BOOLEAN := true;
  v_item_id      UUID;
  v_task_id      UUID;
  v_title        TEXT;
  v_remaining    INTEGER;
  v_result       JSONB;
BEGIN
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'apply_field_effect: p_effect.type is required'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Resolve + pin the party's project. The party is the authority anchor: every
  -- write is scoped to v_project_id, so a forged target can't escape it.
  SELECT * INTO v_party FROM public.project_parties WHERE id = p_party_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_field_effect: party % not found', p_party_id
      USING ERRCODE = 'no_data_found';
  END IF;
  v_project_id := v_party.project_id;

  SELECT p.designer_id, p.client_id
    INTO v_designer_id, v_client_id
    FROM public.projects p WHERE p.id = v_project_id;

  -- The designer↔client relationship (client_decisions.designer_client_id is NOT
  -- NULL) — resolved by (designer_id, client_id), matching the seed/app path.
  -- Only flag_blocker / punch_report INSERT a client_decisions row and need it.
  IF v_type IN ('flag_blocker', 'punch_report') THEN
    SELECT dc.id INTO v_dc_id
      FROM public.designer_clients dc
     WHERE dc.designer_id = v_designer_id
       AND dc.client_id IS NOT DISTINCT FROM v_client_id
     ORDER BY dc.created_at
     LIMIT 1;
    IF v_dc_id IS NULL THEN
      RAISE EXCEPTION 'apply_field_effect: no designer↔client relationship for project %',
        v_project_id USING ERRCODE = 'no_data_found';
    END IF;
  END IF;

  -- FORGERY GUARD: a supplied target must belong to the party's project.
  IF v_target_id IS NOT NULL THEN
    IF v_target_kind = 'task' THEN
      PERFORM 1 FROM public.project_tasks t
        WHERE t.id = v_target_id AND t.project_id = v_project_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'apply_field_effect: task % is not on party %''s project',
          v_target_id, p_party_id USING ERRCODE = 'check_violation';
      END IF;
    ELSIF v_target_kind = 'coordination' THEN
      PERFORM 1 FROM public.client_decisions cd
        WHERE cd.id = v_target_id AND cd.project_id = v_project_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'apply_field_effect: item % is not on party %''s project',
          v_target_id, p_party_id USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  -- ── Dispatch ───────────────────────────────────────────────────────────────
  IF v_type = 'mark_done' THEN
    IF v_target_kind = 'task' AND v_target_id IS NOT NULL THEN
      UPDATE public.project_tasks
         SET status = 'done', completed_at = now(), updated_at = now()
       WHERE id = v_target_id AND project_id = v_project_id
       RETURNING title INTO v_title;
      v_task_id := v_target_id;
      v_summary := 'Marked "' || COALESCE(v_title, 'task') || '" done.';
    ELSIF v_target_kind = 'coordination' AND v_target_id IS NOT NULL THEN
      -- Selections need an option pick — a field "done" can't supply one.
      IF (SELECT coordination_kind FROM public.client_decisions WHERE id = v_target_id) = 'selection' THEN
        RAISE EXCEPTION 'apply_field_effect: a selection item cannot be marked done from the field'
          USING ERRCODE = 'check_violation';
      END IF;
      -- Recorded on the designer's behalf (R46) so may_resolve passes + cascade runs.
      PERFORM public.resolve_coordination_item(
        p_item_id     => v_target_id,
        p_answer      => v_note,
        p_resolved_by => v_designer_id
      );
      v_item_id := v_target_id;
      SELECT title INTO v_title FROM public.client_decisions WHERE id = v_target_id;
      v_summary := 'Resolved "' || COALESCE(v_title, 'item') || '".';
    ELSE
      RAISE EXCEPTION 'apply_field_effect: mark_done needs a task or coordination target'
        USING ERRCODE = 'check_violation';
    END IF;

  ELSIF v_type = 'report_delay' THEN
    v_new_date := NULLIF(p_effect->>'new_date', '')::date;
    IF v_target_kind = 'task' AND v_target_id IS NOT NULL THEN
      UPDATE public.project_tasks
         SET due_date    = COALESCE(v_new_date, due_date),
             description = btrim(COALESCE(description, '') ||
                            CASE WHEN v_note IS NOT NULL THEN E'\n[field] ' || v_note ELSE '' END),
             updated_at  = now()
       WHERE id = v_target_id AND project_id = v_project_id
       RETURNING title INTO v_title;
      v_task_id := v_target_id;
    ELSIF v_target_kind = 'coordination' AND v_target_id IS NOT NULL THEN
      UPDATE public.client_decisions
         SET due_date   = COALESCE(v_new_date::timestamptz, due_date),
             context    = btrim(COALESCE(context, '') ||
                            CASE WHEN v_note IS NOT NULL THEN E'\n[field] ' || v_note ELSE '' END),
             updated_at = now()
       WHERE id = v_target_id AND project_id = v_project_id
       RETURNING title INTO v_title;
      v_item_id := v_target_id;
    ELSE
      RAISE EXCEPTION 'apply_field_effect: report_delay needs a task or coordination target'
        USING ERRCODE = 'check_violation';
    END IF;
    v_summary := 'Pushed "' || COALESCE(v_title, 'it') || '"' ||
                 CASE WHEN v_new_date IS NOT NULL
                      THEN ' to ' || to_char(v_new_date, 'Mon FMDD') ELSE '' END || '.';

  ELSIF v_type = 'flag_blocker' THEN
    -- Raise an RFI in the designer's court; optionally block the target task.
    INSERT INTO public.client_decisions (
      designer_client_id, designer_id, project_id, title, context,
      decision_type, decision_kind, coordination_kind, court, court_party_id,
      blocks_kind, blocking_status, status, sent_at
    ) VALUES (
      v_dc_id, v_designer_id, v_project_id,
      COALESCE(v_note, 'Field blocker from ' || COALESCE(v_party.display_name, 'a trade')),
      v_note,
      'product', 'choice', 'rfi', 'designer', NULL,
      CASE WHEN v_target_kind = 'task' AND v_target_id IS NOT NULL THEN 'task' ELSE 'none' END,
      'non_blocking', 'pending', now()
    )
    RETURNING id INTO v_item_id;

    IF v_target_kind = 'task' AND v_target_id IS NOT NULL THEN
      UPDATE public.project_tasks
         SET status = 'blocked', blocked_by_item_id = v_item_id, updated_at = now()
       WHERE id = v_target_id AND project_id = v_project_id;
      v_task_id := v_target_id;
    END IF;
    v_summary := 'Flagged a blocker — an RFI is in your designer''s court.';

  ELSIF v_type = 'punch_report' THEN
    -- A punch item lands in the designer's court to verify & close (R49-style).
    -- Photo paths ride the item context + the returned/stamped applied_effect
    -- (client_decisions has no media column; Open-Q3 lighter path for v1).
    INSERT INTO public.client_decisions (
      designer_client_id, designer_id, project_id, title, context,
      decision_type, decision_kind, coordination_kind, court, court_party_id,
      blocks_kind, blocking_status, status, sent_at
    ) VALUES (
      v_dc_id, v_designer_id, v_project_id,
      COALESCE(v_note, 'Punch item from ' || COALESCE(v_party.display_name, 'a trade')),
      btrim(COALESCE(v_note, '') ||
        CASE WHEN jsonb_array_length(v_media) > 0
             THEN E'\nPhotos: ' || jsonb_array_length(v_media)::text ELSE '' END),
      'product', 'choice', 'punch', 'designer', NULL,
      'none', 'non_blocking', 'pending', now()
    )
    RETURNING id INTO v_item_id;
    v_summary := 'Logged a punch item' ||
                 CASE WHEN jsonb_array_length(v_media) > 0
                      THEN ' with ' || jsonb_array_length(v_media)::text || ' photo(s)' ELSE '' END || '.';

  ELSIF v_type = 'confirm_delivery' THEN
    -- Lighter path (Open-Q3 default): confirm as a note; if a receiving task was
    -- named, close it. No receiving_inspections auto-create in v1.
    IF v_target_kind = 'task' AND v_target_id IS NOT NULL THEN
      UPDATE public.project_tasks
         SET status = 'done', completed_at = now(), updated_at = now()
       WHERE id = v_target_id AND project_id = v_project_id
       RETURNING title INTO v_title;
      v_task_id := v_target_id;
      v_summary := 'Delivery confirmed — closed "' || COALESCE(v_title, 'task') || '".';
    ELSE
      v_applied := false;  -- note-only; nothing structural changed
      v_summary := 'Delivery confirmed' ||
                   CASE WHEN v_note IS NOT NULL THEN ': ' || v_note ELSE '.' END;
    END IF;

  ELSIF v_type = 'note' THEN
    -- A freeform note surfaces via the sms_message row + margin_items field_sms
    -- branch; no structural mutation.
    v_applied := false;
    v_summary := COALESCE(v_note, 'Noted.');

  ELSE
    RAISE EXCEPTION 'apply_field_effect: unknown effect type %', v_type
      USING ERRCODE = 'check_violation';
  END IF;

  -- Remaining open work for this party (the confirmation "N left" line).
  SELECT
    (SELECT count(*) FROM public.project_tasks t
       WHERE t.owner_party_id = p_party_id AND t.status <> 'done')
    + (SELECT count(*) FROM public.client_decisions cd
       WHERE cd.court_party_id = p_party_id AND cd.status = 'pending')
    INTO v_remaining;

  v_result := jsonb_build_object(
    'applied',         v_applied,
    'effect_type',     v_type,
    'summary_text',    v_summary,
    'remaining_count', v_remaining,
    'item_id',         v_item_id,
    'task_id',         v_task_id,
    'source',          p_source
  );

  -- Stamp the outcome back onto the originating message (when there is one).
  IF p_sms_message_id IS NOT NULL THEN
    UPDATE public.sms_messages
       SET applied_effect               = v_result,
           matched_task_id              = COALESCE(v_task_id, matched_task_id),
           matched_coordination_item_id = COALESCE(v_item_id, matched_coordination_item_id)
     WHERE id = p_sms_message_id;
  END IF;

  RETURN v_result;
END;
$$;

-- apply_field_effect is the trusted choke point: only service-role callers and
-- DEFINER callers (review_sms_message) may run it. Revoke from authenticated too.
REVOKE ALL ON FUNCTION public.apply_field_effect(UUID, JSONB, TEXT, UUID) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.apply_field_effect(UUID, JSONB, TEXT, UUID) IS
  'Field Coordination single mutation choke point (SMS / /field page / triage). '
  'SECURITY DEFINER; validates every target ref belongs to the party''s project '
  '(cross-project forgery rejected); coordination resolves delegate to '
  'resolve_coordination_item on the designer''s behalf (R46). Returns '
  '{applied, summary_text, remaining_count, …}. Revoked from PUBLIC/anon/'
  'authenticated — service-role + DEFINER callers only.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. review_sms_message — designer triage handle
-- ═══════════════════════════════════════════════════════════════════════════
-- p_action: 'apply' (run the parked effect via apply_field_effect) | 'dismiss'
-- (clear the review flag, no effect). SECURITY DEFINER (it must call the
-- authenticated-revoked apply_field_effect) but authorizes the caller against
-- is_project_team_member first.
CREATE OR REPLACE FUNCTION public.review_sms_message(
  p_message_id UUID,
  p_action     TEXT,
  p_effect     JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_msg        public.sms_messages;
  v_project_id UUID;
  v_effect     JSONB;
  v_result     JSONB := '{}'::jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'review_sms_message requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_msg FROM public.sms_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'review_sms_message: message % not found', p_message_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Resolve the project (message.project_id, else via conversation→party phone).
  v_project_id := v_msg.project_id;
  IF v_project_id IS NULL THEN
    SELECT pp.project_id INTO v_project_id
      FROM public.sms_conversations c
      JOIN public.project_parties pp ON pp.phone_e164 = c.phone_e164
     WHERE c.id = v_msg.conversation_id
     LIMIT 1;
  END IF;

  -- Team = the owning designer (projects.designer_id — not auto in
  -- project_team_members) OR a co-designer/staff member (is_project_team_member).
  IF v_project_id IS NULL OR NOT (
       public.is_project_team_member(v_project_id, auth.uid())
       OR EXISTS (
         SELECT 1 FROM public.projects p
         WHERE p.id = v_project_id AND p.designer_id = auth.uid()
       )
     ) THEN
    RAISE EXCEPTION 'not authorized to review message %', p_message_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_action = 'apply' THEN
    -- The effect to apply: an explicit designer-edited p_effect wins, else the
    -- parsed intent parked on the message.
    v_effect := COALESCE(p_effect, v_msg.parsed_intent);
    IF v_effect IS NULL OR v_msg.party_id IS NULL THEN
      RAISE EXCEPTION 'review_sms_message: nothing to apply (no effect or party)'
        USING ERRCODE = 'check_violation';
    END IF;
    v_result := public.apply_field_effect(v_msg.party_id, v_effect, 'triage', p_message_id);
  ELSIF p_action <> 'dismiss' THEN
    RAISE EXCEPTION 'review_sms_message: unknown action %', p_action
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.sms_messages
     SET needs_review = false, reviewed_at = now(), reviewed_by = auth.uid()
   WHERE id = p_message_id;

  RETURN jsonb_build_object('action', p_action, 'result', v_result);
END;
$$;

REVOKE ALL ON FUNCTION public.review_sms_message(UUID, TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.review_sms_message(UUID, TEXT, JSONB) TO authenticated;

COMMENT ON FUNCTION public.review_sms_message(UUID, TEXT, JSONB) IS
  'Field Coordination Desk triage: apply the parked/edited effect or dismiss a '
  'needs_review message. SECURITY DEFINER (calls the authenticated-revoked '
  'apply_field_effect) but authorizes the caller via is_project_team_member first.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. field_activity_summary — per-project Desk rollup (SECURITY INVOKER)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.field_activity_summary
  WITH (security_invoker = true) AS
SELECT
  p.id AS project_id,
  (SELECT count(*) FROM public.sms_messages m
     WHERE m.project_id = p.id AND m.needs_review AND m.reviewed_at IS NULL)
                                                        AS unreviewed_sms_count,
  (SELECT count(*) FROM public.project_parties pp
     WHERE pp.project_id = p.id
       AND pp.party_kind IN ('gc', 'sub', 'installer', 'receiver')
       AND pp.sms_consent_status = 'pending')            AS awaiting_reply_count,
  (SELECT count(*) FROM public.project_tasks t
     WHERE t.project_id = p.id
       AND t.owner IN ('gc', 'sub', 'installer', 'receiver')
       AND t.status <> 'done'
       AND t.due_date IS NOT NULL
       AND t.due_date < current_date)                    AS overdue_field_task_count
FROM public.projects p;

COMMENT ON VIEW public.field_activity_summary IS
  'Field Coordination Desk "In the field" rollup: per project, unreviewed SMS, '
  'parties awaiting opt-in reply, and overdue field-owned tasks. SECURITY INVOKER '
  '— base-table RLS scopes every count to the querying team member.';

GRANT SELECT ON public.field_activity_summary TO authenticated;
GRANT SELECT ON public.field_activity_summary TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. margin_items — recreate the 00219 body VERBATIM + a field_sms branch
-- ═══════════════════════════════════════════════════════════════════════════
-- Inbound field texts appear in the Post as their own margin kind. Every prior
-- branch (decision/message/invoice/pulse/time/note/vendor-payment) is byte-for-
-- byte 00219; the ONLY change is the appended field_sms UNION branch (same 11
-- columns, so CREATE OR REPLACE is column-compatible). security_invoker stays on.
create or replace view margin_items
  with (security_invoker = true) as

-- ── decision ────────────────────────────────────────────────────────────────
select
  'decision'::text                          as kind,
  cd.id                                     as item_id,
  cd.project_id                             as project_id,
  cd.linked_proposal_id                     as proposal_id,
  case
    when li.line_id is not null then 'line'
    when cd.section_key is not null then 'section'
    else 'letterhead'
  end                                       as anchor_kind,
  li.line_id                                as anchor_id,
  case
    when cd.status = 'pending' and cd.due_date is not null and cd.due_date < now()
      then 'overdue'
    else cd.status
  end                                       as state,
  cd.title                                  as title,
  coalesce(cd.context, '')                  as detail,
  coalesce(cd.due_date, cd.updated_at)      as ts,
  jsonb_build_object(
    'due_date', cd.due_date,
    'blocking_status', cd.blocking_status,
    'reminder_sent_at', cd.reminder_sent_at,
    'responded_at', cd.responded_at,
    'decision_kind', cd.decision_kind,
    'section_key', cd.section_key,
    'coordination_kind', cd.coordination_kind,
    'court', cd.court
  )                                         as payload
from client_decisions cd
left join lateral (
  select i.id as line_id
  from project_ffe_items i
  where i.blocked_by_decision_id = cd.id or i.source_decision_id = cd.id
  order by (i.blocked_by_decision_id = cd.id) desc, i.sort_order
  limit 1
) li on true
where cd.status in ('pending', 'responded', 'expired')

union all

-- ── message (one row per anchored thread) ───────────────────────────────────
select
  'message'::text                           as kind,
  t.id                                      as item_id,
  t.project_id                              as project_id,
  t.proposal_id                             as proposal_id,
  coalesce(t.anchor_kind, 'letterhead')     as anchor_kind,
  t.anchor_id                               as anchor_id,
  case
    when m.own_voice then 'read'
    when exists (
      select 1 from comms_thread_participants tp
      where tp.thread_id = t.id
        and tp.profile_id = auth.uid()
        and (tp.last_read_at is null or tp.last_read_at < t.last_message_at)
    ) then 'unread'
    else 'read'
  end                                       as state,
  coalesce(t.title, 'Conversation')         as title,
  coalesce(m.snippet, '')                   as detail,
  t.last_message_at                         as ts,
  jsonb_build_object(
    'thread_kind', t.kind,
    'sender_name', m.sender_name,
    'own_voice', m.own_voice
  )                                         as payload
from comms_threads t
left join projects  mpj on mpj.id = t.project_id
left join proposals mpp on mpp.id = t.proposal_id
left join lateral (
  select
    left(cm.body, 140) as snippet,
    (cm.sender_id is null or not exists (
      select 1 from comms_thread_participants sp
      where sp.thread_id = t.id
        and sp.profile_id = cm.sender_id
        and sp.role in ('client', 'vendor')
    )) as own_voice,
    case
      when cm.sender_id is null or not exists (
        select 1 from comms_thread_participants sp
        where sp.thread_id = t.id
          and sp.profile_id = cm.sender_id
          and sp.role in ('client', 'vendor')
      )
      then coalesce(nullif(btrim(p.full_name), ''), st.studio_name)
      else nullif(btrim(p.full_name), '')
    end as sender_name
  from comms_messages cm
  left join profiles p on p.id = cm.sender_id
  left join lateral (
    select o.name as studio_name
    from organization_members om
    join organizations o on o.id = om.organization_id
    where om.user_id = coalesce(mpj.designer_id, mpp.designer_id)
      and om.status = 'active'
      and o.type = 'design_studio'
    order by om.created_at
    limit 1
  ) st on true
  where cm.thread_id = t.id and cm.deleted_at is null
  order by cm.created_at desc
  limit 1
) m on true
where t.kind in ('direct', 'project', 'vendor_brief')
  and (t.project_id is not null or t.proposal_id is not null)
  and t.last_message_at is not null

union all

-- ── invoice ─────────────────────────────────────────────────────────────────
select
  'invoice'::text                           as kind,
  inv.id                                    as item_id,
  inv.project_id                            as project_id,
  null::uuid                                as proposal_id,
  case when fl.ffe_item_id is not null then 'line' else 'letterhead' end
                                            as anchor_kind,
  fl.ffe_item_id                            as anchor_id,
  inv.status                                as state,
  case
    when inv.invoice_number is not null then inv.invoice_number
    else 'Draft invoice'
  end                                       as title,
  coalesce(inv.memo, '')                    as detail,
  inv.updated_at                            as ts,
  jsonb_build_object(
    'invoice_number', inv.invoice_number,
    'total_cents', inv.total_cents,
    'due_date', inv.due_date,
    'sent_at', inv.sent_at
  )                                         as payload
from invoices inv
left join lateral (
  select l.ffe_item_id
  from invoice_line_items l
  where l.invoice_id = inv.id and l.ffe_item_id is not null
  order by l.sort_order
  limit 1
) fl on true
where inv.status in ('draft', 'sent', 'partially_paid')

union all

-- ── pulse ───────────────────────────────────────────────────────────────────
select
  'pulse'::text                             as kind,
  wp.id                                     as item_id,
  wp.project_id                             as project_id,
  null::uuid                                as proposal_id,
  wp.anchor_kind                            as anchor_kind,
  wp.anchor_id                              as anchor_id,
  case
    when wp.status = 'draft' and wp.week_of = date_trunc('week', now())::date
      then 'due'
    else wp.status
  end                                       as state,
  coalesce(wp.subject, 'Weekly Pulse')      as title,
  coalesce(wp.body, '')                     as detail,
  coalesce(wp.sent_at, wp.week_of::timestamptz) as ts,
  jsonb_build_object(
    'week_of', wp.week_of,
    'sent_at', wp.sent_at
  )                                         as payload
from weekly_pulses wp

union all

-- ── time (daily summary — a query, not a table; spec §5) ────────────────────
select
  'time'::text                              as kind,
  -- Schema-qualified (unlike the 00219 original): the prod push session's
  -- search_path does not include `extensions`, so the bare name fails there.
  extensions.uuid_generate_v5(
    'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid,
    te.project_id::text || te.day::text
  )                                         as item_id,
  te.project_id                             as project_id,
  null::uuid                                as proposal_id,
  'letterhead'::text                        as anchor_kind,
  null::uuid                                as anchor_id,
  'logged'::text                            as state,
  'Time · ' || to_char(te.day, 'Mon FMDD')  as title,
  ''::text                                  as detail,
  te.day::timestamptz                       as ts,
  jsonb_build_object(
    'minutes', te.minutes,
    'entry_count', te.entry_count,
    'day', te.day
  )                                         as payload
from (
  select
    pte.project_id,
    date(pte.started_at) as day,
    sum(pte.duration_minutes) as minutes,
    count(*) as entry_count
  from project_time_entries pte
  where pte.duration_minutes is not null
    and pte.started_at > now() - interval '7 days'
  group by pte.project_id, date(pte.started_at)
) te
union all

-- ── note (R14 — designer-authored marginalia; studio-only via RLS) ──────────
select
  'note'::text                              as kind,
  n.id                                      as item_id,
  n.project_id                              as project_id,
  n.proposal_id                             as proposal_id,
  n.anchor_kind                             as anchor_kind,
  n.anchor_id                               as anchor_id,
  case
    when n.escalated_to_decision_id is not null
      or n.escalated_to_scope_change_id is not null      then 'escalated'
    when n.due_date is not null and n.due_date <= now()  then 'due'
    else 'open'
  end                                       as state,
  left(n.body, 80)                          as title,
  ''::text                                  as detail,
  coalesce(n.due_date, n.updated_at)        as ts,
  jsonb_build_object(
    'due_date', n.due_date,
    'escalated_to_decision_id', n.escalated_to_decision_id,
    'escalated_to_scope_change_id', n.escalated_to_scope_change_id,
    'author_name', ap.full_name
  )                                         as payload
from margin_notes n
left join profiles ap on ap.id = n.designer_id

union all

-- ── vendor payment due (R18 — the 00189 cron's flips become Money items) ────
select
  'invoice'::text                           as kind,
  pp.id                                     as item_id,
  po.project_id                             as project_id,
  null::uuid                                as proposal_id,
  'letterhead'::text                        as anchor_kind,
  null::uuid                                as anchor_id,
  'due'::text                               as state,
  'Vendor payment — ' || coalesce(pp.label, replace(pp.kind::text, '_', ' '))
                                            as title,
  coalesce(po.po_number, po.vendor_po_number, po.sidemark, 'PO') || ' · ' || v.name
                                            as detail,
  pp.due_date::timestamptz                  as ts,
  jsonb_build_object(
    'po_payment', true,
    'amount_cents', pp.amount_cents,
    'due_date', pp.due_date,
    'po_label', coalesce(po.po_number, po.vendor_po_number, po.sidemark),
    'vendor_name', v.name,
    'payment_kind', pp.kind
  )                                         as payload
from po_payments pp
join purchase_orders po on po.id = pp.purchase_order_id
join vendors v on v.id = po.vendor_id
where pp.state = 'due'

union all

-- ── field_sms (Field Coordination Wave 1 — inbound texts land in the Post) ──
-- One margin item per inbound field text. needs_review rows read 'needs_review'
-- (the Desk triage state); applied ones read 'logged'. The payload carries the
-- parse/apply provenance + any media so the rail renders the thread inline.
select
  'field_sms'::text                         as kind,
  m.id                                      as item_id,
  m.project_id                              as project_id,
  null::uuid                                as proposal_id,
  'letterhead'::text                        as anchor_kind,
  null::uuid                                as anchor_id,
  case when m.needs_review and m.reviewed_at is null then 'needs_review' else 'logged' end
                                            as state,
  coalesce(pp.display_name, 'Field text')   as title,
  coalesce(left(m.body, 140), '')           as detail,
  m.created_at                              as ts,
  jsonb_build_object(
    'direction', m.direction,
    'party_id', m.party_id,
    'party_kind', pp.party_kind,
    'trade', pp.trade,
    'confidence', m.confidence,
    'needs_review', m.needs_review,
    'parsed_intent', m.parsed_intent,
    'applied_effect', m.applied_effect,
    'media', m.media
  )                                         as payload
from sms_messages m
left join project_parties pp on pp.id = m.party_id
where m.direction = 'inbound' and m.project_id is not null;

comment on view margin_items is
  'The Document margins (spec §5 + R14/R18/R23 + R33 F1/F6 + Track 5 + Field '
  'Coordination): unified index of decision/message/invoice/pulse/time/note/'
  'field_sms items. The field_sms branch (00282) surfaces inbound field texts in '
  'the Post (needs_review → triage state). SECURITY INVOKER — base-table RLS applies.';

grant select on margin_items to authenticated;
grant select on margin_items to service_role;
