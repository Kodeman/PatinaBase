-- ═══════════════════════════════════════════════════════════════════════════
-- 00787 — The model-apply log: every change a model makes without a click is
--         written down with its exact before/after values, and a studio
--         member can put it back (V23 R2, US-32 SQ-929)
--
-- Two producers change rows with no human click today:
--   1. An inbound SMS parsed at confidence >= 0.8 (sms-inbound pipeline.ts
--      `applyEffect`) → apply_field_effect(p_source => 'sms', …). The prompt
--      path (sms_apply_prompt, the field party answered YES) also arrives as
--      'sms', but it carries app.field_time_report_prompt_id (00653); that is
--      a human confirmation and is NOT logged. 'triage' (designer review) and
--      'field_link' (a click on the /field page) are not logged either.
--   2. A 'ready' capture-enrichment run (record_capture_enrichment_result)
--      filling an empty field_captures category/subcategory/finish column.
--
-- Lineage:
--   apply_field_effect                 00653:758 → here. Body verbatim; the
--     only addition is the logging block around the legacy core call. The
--     delivery vocabulary (00641/00643) and report_hours (00653) branches
--     return before it: delivery effects never auto-apply and report_hours
--     writes a proposal, not a change.
--   record_capture_enrichment_result   00664:49 → here. Body verbatim plus one
--     log row per column it fills.
--
-- What one log row holds: the allowlisted columns of ONE target row that the
--   change actually moved (before → after, unchanged columns omitted), or,
--   for a row the change inserted (flag_blocker's RFI, punch_report's punch
--   item), inserted = true, before NULL and the row's allowlisted values.
--   A resolve (mark_done on a coordination item) also unblocks tasks and FF&E
--   lines that waited on the item; each of those is its own row, so the whole
--   SMS can be put back together (revert_model_apply_group).
--   Every row is locked by the read that takes its `before` and stays locked
--   through the write, so before/after hold that change and nothing else.
--
-- Revert never guesses. It writes `before` back only while every `after`
--   value is still what the model wrote; otherwise it reports 'conflict' and
--   writes nothing, so it can be tried again later. An inserted decision is
--   never deleted: while untouched (its `fingerprint` — every column a
--   designer can edit and the work waiting on it — unchanged) it is withdrawn
--   to 'expired', the closed status expire_client_decision (pending → expired)
--   uses. A link `before` would restore (a task's blocked_by_item_id, an FF&E
--   line's blocked_by_decision_id) must point at a decision still pending, or
--   one the same Undo reopens; otherwise that row is a conflict too.
--
-- Who may read a row: an active member of its studio, or, for a row with no
--   studio (a private capture), its owner_user_id — the designer who owns the
--   capture or project. Never a guessed studio. Putting a row back also needs
--   the right to change its target now, checked under the target's lock
--   (_model_apply_may_write); without it the row is a conflict. Members put
--   back a whole SMS or run (revert_model_apply_group); the single-row
--   revert_model_apply is not granted to them.
--
-- Lock order, everywhere here: the SMS message, the log rows, then targets —
--   client_decisions (including every decision a revert links a row back
--   to), project_ffe_items, project_tasks, field_captures, each by id.
--   update_coordination_item and the resolve cascade lock in the same
--   decision → FF&E → task order.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. The log ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.model_applies (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id      uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id     uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  source         text NOT NULL CHECK (source IN ('sms', 'capture_enrichment')),
  source_id      uuid,
  effect_type    text NOT NULL,
  target_table   text NOT NULL CHECK (target_table IN (
                   'project_tasks', 'client_decisions', 'project_ffe_items', 'field_captures')),
  target_id      uuid NOT NULL,
  inserted       boolean NOT NULL DEFAULT false,
  before         jsonb,
  after          jsonb NOT NULL,
  summary        text,
  applied_at     timestamptz NOT NULL DEFAULT now(),
  reverted_at    timestamptz,
  reverted_by    uuid,
  revert_outcome text CHECK (revert_outcome IN ('restored', 'conflict')),
  owner_user_id  uuid,
  fingerprint    jsonb,
  CONSTRAINT model_applies_inserted_has_no_before CHECK (inserted = (before IS NULL))
);
-- Re-applying over an earlier local draft of this file, which lacked these.
ALTER TABLE public.model_applies
  ADD COLUMN IF NOT EXISTS owner_user_id uuid,
  ADD COLUMN IF NOT EXISTS fingerprint jsonb;

CREATE INDEX IF NOT EXISTS model_applies_project_applied_idx
  ON public.model_applies (project_id, applied_at DESC);
CREATE INDEX IF NOT EXISTS model_applies_source_idx
  ON public.model_applies (source, source_id);
-- The Desk's slice: a studio's SMS applies for one day.
CREATE INDEX IF NOT EXISTS model_applies_sms_studio_applied_idx
  ON public.model_applies (studio_id, applied_at DESC) WHERE source = 'sms';

ALTER TABLE public.model_applies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS model_applies_studio_select ON public.model_applies;
CREATE POLICY model_applies_studio_select ON public.model_applies
  FOR SELECT TO authenticated
  USING (public.is_active_org_member(studio_id)
         OR (studio_id IS NULL AND owner_user_id = (SELECT auth.uid())));

-- Reads only. Rows are written by the DEFINER producers and revert RPCs below.
REVOKE ALL ON TABLE public.model_applies FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.model_applies TO authenticated, service_role;

COMMENT ON TABLE public.model_applies IS
  'One row per target row a model changed without a click (00787, V23 R2): '
  'source sms (autonomous apply_field_effect) or capture_enrichment. before/after '
  'hold only the allowlisted columns that moved; inserted rows have before NULL '
  'and a fingerprint of their designer-editable state. owner_user_id is the '
  'designer who owns the capture or project; it alone reaches a row with no '
  'studio. Put back through revert_model_apply / revert_model_apply_group.';

-- ─── 2. Internal helpers (owner-only; reached from the DEFINER functions) ──

-- The columns a model may move on each table, and therefore the only columns
-- a revert may write back.
CREATE OR REPLACE FUNCTION public._model_apply_columns(p_table text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
  SELECT CASE p_table
    WHEN 'project_tasks' THEN
      ARRAY['status', 'completed_at', 'due_date', 'description', 'blocked_by_item_id']
    WHEN 'client_decisions' THEN
      ARRAY['status', 'due_date', 'context', 'answer', 'answered_at', 'answered_by',
            'responded_at', 'selected_by', 'court']
    WHEN 'project_ffe_items' THEN
      ARRAY['blocked', 'blocked_reason', 'blocked_by_decision_id', 'last_status_change_at']
    WHEN 'field_captures' THEN
      ARRAY['category', 'subcategory', 'finish']
  END::text[];
$$;

-- The allowlisted columns of one row as jsonb (NULL when the row is gone).
-- TimeZone is pinned so a timestamptz always renders the same text and the
-- after-vs-current comparison never sees a session-zone difference.
CREATE OR REPLACE FUNCTION public._model_apply_snapshot(
  p_table text,
  p_id uuid,
  p_lock boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
SET TimeZone = 'UTC'
AS $$
DECLARE
  v_cols text[] := public._model_apply_columns(p_table);
  v_row  jsonb;
BEGIN
  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'model_applies: unsupported target table %', p_table
      USING ERRCODE = '22023';
  END IF;
  EXECUTE format(
    'SELECT to_jsonb(t) FROM public.%I AS t WHERE t.id = $1%s',
    p_table, CASE WHEN p_lock THEN ' FOR UPDATE' ELSE '' END
  ) INTO v_row USING p_id;
  IF v_row IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN (SELECT jsonb_object_agg(c, v_row -> c) FROM unnest(v_cols) AS c);
END;
$$;

-- What a designer can change on a decision: every column update_client_decision
-- and update_coordination_item may write, plus how much work waits on it
-- (tasks and FF&E lines) and how many options it carries. An inserted
-- decision's fingerprint is kept at insert; any change since means touched.
CREATE OR REPLACE FUNCTION public._model_apply_fingerprint(p_decision_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
SET TimeZone = 'UTC'
AS $$
  SELECT (SELECT jsonb_object_agg(k, to_jsonb(d) -> k)
            FROM unnest(ARRAY[
              'title', 'context', 'due_date', 'linked_phase', 'phase_id', 'room_id',
              'section_key', 'project_id', 'decision_type', 'decision_kind',
              'coordination_kind', 'blocking_status', 'blocks_kind',
              'blocks_milestone_id', 'court', 'court_party_id', 'status']) AS k)
         || jsonb_build_object(
              'linked',
                (SELECT count(*) FROM public.project_tasks t WHERE t.blocked_by_item_id = d.id)
                + (SELECT count(*) FROM public.project_ffe_items f WHERE f.blocked_by_decision_id = d.id),
              'options',
                (SELECT count(*) FROM public.client_decision_options o WHERE o.decision_id = d.id))
    FROM public.client_decisions AS d
   WHERE d.id = p_decision_id;
$$;

-- Writes one log row. For a changed row only the columns that moved are kept;
-- nothing is written when nothing moved or the row is gone.
-- The first local draft of this file had no p_owner_user_id.
DROP FUNCTION IF EXISTS public._record_model_apply(
  text, uuid, uuid, uuid, text, text, uuid, boolean, jsonb, jsonb, text);
CREATE OR REPLACE FUNCTION public._record_model_apply(
  p_source text,
  p_source_id uuid,
  p_project_id uuid,
  p_studio_id uuid,
  p_owner_user_id uuid,
  p_effect_type text,
  p_table text,
  p_target_id uuid,
  p_inserted boolean,
  p_before jsonb,
  p_after jsonb,
  p_summary text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_before jsonb;
  v_after  jsonb;
  v_fingerprint jsonb;
BEGIN
  IF p_after IS NULL OR p_target_id IS NULL THEN
    RETURN;
  END IF;
  IF p_inserted THEN
    v_after := p_after;
    IF p_table = 'client_decisions' THEN
      v_fingerprint := public._model_apply_fingerprint(p_target_id);
    END IF;
  ELSE
    IF p_before IS NULL THEN
      RETURN;
    END IF;
    SELECT jsonb_object_agg(k, p_before -> k), jsonb_object_agg(k, p_after -> k)
      INTO v_before, v_after
      FROM jsonb_object_keys(p_after) AS k
     WHERE (p_before -> k) IS DISTINCT FROM (p_after -> k);
    IF v_after IS NULL THEN
      RETURN;
    END IF;
  END IF;
  INSERT INTO public.model_applies (
    studio_id, owner_user_id, project_id, source, source_id, effect_type,
    target_table, target_id, inserted, before, after, fingerprint, summary
  ) VALUES (
    p_studio_id, p_owner_user_id, p_project_id, p_source, p_source_id, p_effect_type,
    p_table, p_target_id, p_inserted, v_before, v_after, v_fingerprint, p_summary
  );
END;
$$;

REVOKE ALL ON FUNCTION public._model_apply_columns(text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._model_apply_snapshot(text, uuid, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._model_apply_fingerprint(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._record_model_apply(
  text, uuid, uuid, uuid, uuid, text, text, uuid, boolean, jsonb, jsonb, text
) FROM PUBLIC, anon, authenticated, service_role;

-- ─── 3. apply_field_effect (00653:758 verbatim + the 00787 log block) ──────

CREATE OR REPLACE FUNCTION public.apply_field_effect(
  p_party_id uuid,
  p_effect jsonb,
  p_source text DEFAULT 'sms',
  p_sms_message_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_id uuid;
  v_result jsonb;
  v_message public.sms_messages;
  v_party public.project_parties;
  v_conversation public.sms_conversations;
  -- 00787: the model-apply log.
  v_log boolean;
  v_log_project uuid;
  v_log_studio uuid;
  v_log_owner uuid;
  v_log_tables text[] := ARRAY[]::text[];
  v_log_ids uuid[] := ARRAY[]::uuid[];
  v_log_before jsonb[] := ARRAY[]::jsonb[];
  v_log_rec record;
  v_log_i integer;
BEGIN
  -- One persisted SMS origin is one business operation. Raw callers take only
  -- message -> business locks. Atomic callers already hold pair -> prompt ->
  -- message -> consent; this message lock is reentrant and takes no new rail lock.
  IF p_source = 'sms' AND p_sms_message_id IS NOT NULL THEN
    SELECT * INTO v_message FROM public.sms_messages WHERE id=p_sms_message_id FOR UPDATE;
    IF NOT FOUND OR v_message.direction IS DISTINCT FROM 'inbound'
        OR NULLIF(btrim(v_message.twilio_sid),'') IS NULL THEN
      RAISE EXCEPTION 'sms_effect: invalid inbound origin' USING ERRCODE='23514';
    END IF;
    SELECT * INTO v_party FROM public.project_parties WHERE id=p_party_id;
    IF NOT FOUND OR v_party.project_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.projects WHERE id=v_party.project_id) THEN
      RAISE EXCEPTION 'sms_effect: invalid actor' USING ERRCODE='42501';
    END IF;
    SELECT * INTO v_conversation FROM public.sms_conversations WHERE id=v_message.conversation_id;
    IF NOT FOUND OR NULLIF(public.normalize_channel_value('sms',v_party.phone),'') IS NULL
        OR public.normalize_channel_value('sms',v_conversation.phone_e164)
          IS DISTINCT FROM public.normalize_channel_value('sms',v_party.phone)
        OR (v_message.party_id IS NOT NULL AND v_message.party_id<>p_party_id)
        OR (v_message.project_id IS NOT NULL AND v_message.project_id<>v_party.project_id) THEN
      RAISE EXCEPTION 'sms_effect: origin actor mismatch' USING ERRCODE='42501';
    END IF;
    IF v_message.applied_effect IS NOT NULL THEN
      -- Historical unbound completion can be suppressed by the consumer, but
      -- cannot disclose a result here. Never infer an actor from a new request.
      IF v_message.party_id IS DISTINCT FROM p_party_id
          OR v_message.project_id IS DISTINCT FROM v_party.project_id THEN
        RAISE EXCEPTION 'sms_effect: completed origin has no trustworthy binding' USING ERRCODE='42501';
      END IF;
      IF jsonb_typeof(v_message.applied_effect) IS DISTINCT FROM 'object'
          OR jsonb_typeof(v_message.applied_effect->'applied') IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION 'sms_effect: malformed completion' USING ERRCODE='23514';
      END IF;
      -- Return-only sentinel; stored result retains its original unmodified shape.
      -- Replacement target/payload is deliberately not even cast or dispatched.
      RETURN v_message.applied_effect || jsonb_build_object('_sms_replayed',true);
    END IF;
    UPDATE public.sms_messages SET party_id=p_party_id,project_id=v_party.project_id
      WHERE id=p_sms_message_id;
  END IF;
  v_target_id := NULLIF(p_effect#>>'{target,id}', '')::uuid;
  -- 00653 (S3): the hours ledger is its own door, in front of the delivery
  -- vocabulary and the legacy core. report_hours is NOT a delivery report and
  -- NEVER a time entry — the branch below writes one proposed
  -- field_time_reports row and nothing else.
  IF p_effect->>'type' = 'report_hours' THEN
    RETURN public._apply_field_hours_effect(
      p_party_id, p_effect, p_source, p_sms_message_id
    );
  END IF;
  -- The Field Line vocabulary (00641). Registered names route to the delivery
  -- core, which asks project_party_authority before it writes anything.
  IF public.field_effect_authority_scopes(p_effect->>'type') IS NOT NULL
      OR (p_effect->>'type'='confirm_delivery' AND p_effect#>>'{target,kind}'='purchase_order') THEN
    RETURN public._apply_field_delivery_effect(
      p_party_id, p_effect, p_source, p_sms_message_id
    );
  END IF;

  -- 00787 (V23 R2): only the autonomous path is logged — an SMS applied with
  -- no prompt answered. sms_apply_prompt hands down
  -- app.field_time_report_prompt_id (00653) for its YES; triage/field_link
  -- are human clicks. Snapshot every row the legacy core can move.
  v_log := p_source = 'sms'
    AND NULLIF(current_setting('app.field_time_report_prompt_id', true), '') IS NULL;
  IF v_log THEN
    IF p_effect#>>'{target,kind}' = 'task' AND v_target_id IS NOT NULL THEN
      v_log_tables := array_append(v_log_tables, 'project_tasks');
      v_log_ids := array_append(v_log_ids, v_target_id);
    ELSIF p_effect#>>'{target,kind}' = 'coordination' AND v_target_id IS NOT NULL THEN
      v_log_tables := array_append(v_log_tables, 'client_decisions');
      v_log_ids := array_append(v_log_ids, v_target_id);
      IF p_effect->>'type' = 'mark_done' THEN
        -- The item is locked first, so no more work can be linked to it.
        PERFORM 1 FROM public.client_decisions WHERE id = v_target_id FOR UPDATE;
        -- The resolve cascade (resolve_coordination_item) unblocks some of
        -- these. Every linked row is taken, whatever its status: which ones
        -- the cascade moves is decided only once the snapshot below has
        -- locked them, so a task flipped to blocked meanwhile is either in
        -- its before or waits for this SMS. A row the cascade leaves alone
        -- logs nothing. ORDER BY puts FF&E before tasks, each by id: the
        -- lock order.
        FOR v_log_rec IN
          SELECT 'project_tasks'::text AS tbl, t.id FROM public.project_tasks t
           WHERE t.blocked_by_item_id = v_target_id
          UNION ALL
          SELECT 'project_ffe_items'::text, f.id FROM public.project_ffe_items f
           WHERE f.blocked_by_decision_id = v_target_id
          ORDER BY 1, 2
        LOOP
          v_log_tables := array_append(v_log_tables, v_log_rec.tbl);
          v_log_ids := array_append(v_log_ids, v_log_rec.id);
        END LOOP;
      END IF;
    END IF;
    -- Lock, then read: each row is taken FOR UPDATE by the read that records
    -- its before and stays locked through the legacy core, so a designer
    -- edit committed meanwhile is either in before or waits for this SMS.
    FOR v_log_i IN 1 .. COALESCE(array_length(v_log_ids, 1), 0) LOOP
      v_log_before := array_append(v_log_before,
        public._model_apply_snapshot(v_log_tables[v_log_i], v_log_ids[v_log_i], true));
    END LOOP;
  END IF;

  -- 00399's wrapper, verbatim: pin the decision-write capability for a
  -- coordination target so the journey guard passes, then the legacy core.
  IF p_effect#>>'{target,kind}' = 'coordination' AND v_target_id IS NOT NULL THEN
    PERFORM set_config('app.client_decision_write_id', v_target_id::text, true);
  END IF;

  v_result := public._apply_field_effect_legacy_00399(
    p_party_id, p_effect, p_source, p_sms_message_id
  );
  PERFORM set_config('app.client_decision_write_id', '', true);

  IF v_log THEN
    SELECT pp.project_id, pr.studio_id, pr.designer_id
      INTO v_log_project, v_log_studio, v_log_owner
      FROM public.project_parties pp
      LEFT JOIN public.projects pr ON pr.id = pp.project_id
     WHERE pp.id = p_party_id;
    IF p_effect->>'type' IN ('flag_blocker', 'punch_report')
        AND NULLIF(v_result->>'item_id', '') IS NOT NULL THEN
      PERFORM public._record_model_apply(
        'sms', p_sms_message_id, v_log_project, v_log_studio, v_log_owner, p_effect->>'type',
        'client_decisions', (v_result->>'item_id')::uuid, true, NULL,
        public._model_apply_snapshot('client_decisions', (v_result->>'item_id')::uuid),
        v_result->>'summary_text'
      );
    END IF;
    FOR v_log_i IN 1 .. COALESCE(array_length(v_log_ids, 1), 0) LOOP
      PERFORM public._record_model_apply(
        'sms', p_sms_message_id, v_log_project, v_log_studio, v_log_owner, p_effect->>'type',
        v_log_tables[v_log_i], v_log_ids[v_log_i], false, v_log_before[v_log_i],
        public._model_apply_snapshot(v_log_tables[v_log_i], v_log_ids[v_log_i]),
        v_result->>'summary_text'
      );
    END LOOP;
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_field_effect(uuid, jsonb, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_field_effect(uuid, jsonb, text, uuid)
  TO service_role;

COMMENT ON FUNCTION public.apply_field_effect(uuid, jsonb, text, uuid) IS
  'Field Coordination single mutation choke point (SMS / /field page / triage). '
  'SECURITY DEFINER, service-role + DEFINER callers only. 00399''s coordination '
  'guard and 00641''s delivery vocabulary are unchanged. 00653 adds one name in '
  'front of both: report_hours is answered by _apply_field_hours_effect, which '
  'writes a PROPOSAL in public.field_time_reports and never touches '
  'public.project_time_entries. 00787: an autonomous SMS apply (source sms, no '
  'prompt answered) logs each row the legacy core moved in public.model_applies.';

-- ─── 4. record_capture_enrichment_result (00664:49 verbatim + the log) ─────

CREATE OR REPLACE FUNCTION public.record_capture_enrichment_result(
  p_run_id         uuid,
  p_suggestions    jsonb,
  p_model_metadata jsonb,
  p_status         text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_run       public.capture_enrichment_runs%ROWTYPE;
  v_key       text;
  -- 00664 (D7b): 'vendor_name' and 'sku' are suggestion-only. They stay in
  -- capture_enrichment_runs.suggestions and are never written to the capture.
  v_allowed   CONSTANT text[] := ARRAY['category', 'subcategory', 'finish'];
  v_sql       text;
  -- 00787: the model-apply log.
  v_before    jsonb;
  v_filled    integer;
  v_project   uuid;
  v_studio    uuid;
  v_owner     uuid;
BEGIN
  IF p_status NOT IN ('ready', 'failed') THEN
    RAISE EXCEPTION 'record_capture_enrichment_result: p_status must be ready or failed, got %', p_status
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_run
    FROM public.capture_enrichment_runs
   WHERE id = p_run_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'record_capture_enrichment_result: run % not found', p_run_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.capture_enrichment_runs
     SET status         = p_status,
         suggestions    = COALESCE(p_suggestions, '{}'::jsonb),
         model_metadata = COALESCE(p_model_metadata, '{}'::jsonb)
   WHERE id = p_run_id;

  IF p_status = 'ready'
     AND v_run.target_type = 'field_capture'
     AND p_suggestions IS NOT NULL
     AND jsonb_typeof(p_suggestions) = 'object'
  THEN
    -- 00787: the capture's values before any fill, read under the row lock
    -- the fills below keep, and where it belongs and who owns it.
    v_before := public._model_apply_snapshot('field_captures', v_run.target_id, true);
    SELECT fc.project_id, COALESCE(pr.studio_id, fc.organization_id), fc.designer_id
      INTO v_project, v_studio, v_owner
      FROM public.field_captures fc
      LEFT JOIN public.projects pr ON pr.id = fc.project_id
     WHERE fc.id = v_run.target_id;
    FOR v_key IN SELECT jsonb_object_keys(p_suggestions)
    LOOP
      IF v_key = ANY (v_allowed) AND jsonb_typeof(p_suggestions -> v_key) = 'string' THEN
        -- %1$I is the allowlisted, validated column name — never raw user
        -- input passed straight to format(). The WHERE guard is the
        -- never-overwrite enforcement point (see anti-vacuity test in
        -- supabase/tests/capture_enrichment/).
        v_sql := format(
          'UPDATE public.field_captures SET %1$I = $1, updated_at = now() ' ||
          'WHERE id = $2 AND (%1$I IS NULL OR %1$I = '''')',
          v_key
        );
        EXECUTE v_sql USING (p_suggestions ->> v_key), v_run.target_id;
        -- 00787: one log row per column actually filled.
        GET DIAGNOSTICS v_filled = ROW_COUNT;
        IF v_filled > 0 THEN
          PERFORM public._record_model_apply(
            'capture_enrichment', p_run_id, v_project, v_studio, v_owner, 'enrichment_fill',
            'field_captures', v_run.target_id, false,
            jsonb_build_object(v_key, v_before -> v_key),
            jsonb_build_object(v_key, p_suggestions -> v_key),
            format('Filled in %s.', v_key)
          );
        END IF;
      END IF;
    END LOOP;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.record_capture_enrichment_result(uuid, jsonb, jsonb, text) IS
  'Records a capture enrichment run''s outcome and its suggestions. For a ready '
  'field_capture run, only category/subcategory/finish may fill an empty column. '
  'vendor_name and sku are suggestion-only (00664, ruling D7b): they stay in '
  'capture_enrichment_runs.suggestions, and only the designer writes them onto '
  'the capture. 00787: each filled column is logged in public.model_applies.';

-- ─── 5. Revert ──────────────────────────────────────────────────────────────

-- Whether the caller may change this row now: the predicate the table's RLS
-- applies today, never the log's historical studio. A capture: its designer
-- or a studio co-member of the designer (00530/00584). A task, FF&E line or
-- decision: an active member of its project's current studio, or, when the
-- project has no studio, the project's designer.
CREATE OR REPLACE FUNCTION public._model_apply_may_write(p_table text, p_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(CASE p_table
    WHEN 'field_captures' THEN
      (SELECT public.is_studio_comember(fc.designer_id)
         FROM public.field_captures AS fc WHERE fc.id = p_id)
    ELSE
      (SELECT CASE WHEN pr.studio_id IS NOT NULL THEN public.is_active_org_member(pr.studio_id)
                   ELSE pr.designer_id = auth.uid() END
         FROM public.projects AS pr
        WHERE pr.id = CASE p_table
                WHEN 'project_tasks' THEN
                  (SELECT t.project_id FROM public.project_tasks AS t WHERE t.id = p_id)
                WHEN 'project_ffe_items' THEN
                  (SELECT f.project_id FROM public.project_ffe_items AS f WHERE f.id = p_id)
                WHEN 'client_decisions' THEN
                  (SELECT d.project_id FROM public.client_decisions AS d WHERE d.id = p_id)
              END)
  END, false);
$$;

-- True while the target still holds exactly what the model wrote and the
-- caller may still change it. Locks the decision `before` links the row back
-- to, then the target row. That decision must be pending once this revert is
-- done: pending now, or, in a group revert (p_group), put back to pending by
-- the same Undo. An inserted decision must also be untouched: still pending
-- (its after values), its fingerprint unchanged, no comment or revision
-- posted against it, and nothing waiting on it but the work this same SMS
-- blocked.
-- The first local draft of this file had no p_group.
DROP FUNCTION IF EXISTS public._model_apply_is_current(public.model_applies);
CREATE OR REPLACE FUNCTION public._model_apply_is_current(
  p_apply public.model_applies,
  p_group boolean
)
RETURNS boolean
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parent   uuid := NULLIF(COALESCE(p_apply.before ->> 'blocked_by_item_id',
                                     p_apply.before ->> 'blocked_by_decision_id'), '')::uuid;
  v_current  jsonb;
  v_now      jsonb;
  v_released integer;
BEGIN
  -- Parent first: the restore's foreign key would otherwise lock it after
  -- the target, against update_coordination_item's decision → task order.
  -- A group revert already holds it.
  IF v_parent IS NOT NULL THEN
    PERFORM 1 FROM public.client_decisions WHERE id = v_parent FOR UPDATE;
  END IF;
  v_current := public._model_apply_snapshot(p_apply.target_table, p_apply.target_id, true);
  IF v_current IS NULL OR EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_apply.after) AS k
     WHERE (v_current -> k) IS DISTINCT FROM (p_apply.after -> k)
  ) THEN
    RETURN false;
  END IF;
  IF NOT public._model_apply_may_write(p_apply.target_table, p_apply.target_id) THEN
    RETURN false;
  END IF;
  -- 'pending' is the open blocker task_blocked_state reads.
  IF v_parent IS NOT NULL AND COALESCE(
       (SELECT g.before ->> 'status' FROM public.model_applies AS g
         WHERE p_group AND g.source = p_apply.source AND g.source_id = p_apply.source_id
           AND g.target_table = 'client_decisions' AND g.target_id = v_parent
           AND g.reverted_at IS NULL),
       (SELECT d.status FROM public.client_decisions AS d WHERE d.id = v_parent))
     IS DISTINCT FROM 'pending' THEN
    RETURN false;
  END IF;
  IF NOT p_apply.inserted THEN
    RETURN true;
  END IF;
  IF p_apply.target_table <> 'client_decisions' OR p_apply.fingerprint IS NULL
     OR v_current ->> 'status' IS DISTINCT FROM 'pending'
     OR EXISTS (SELECT 1 FROM public.decision_comments c WHERE c.decision_id = p_apply.target_id)
     OR EXISTS (SELECT 1 FROM public.coordination_item_revisions r WHERE r.decision_id = p_apply.target_id)
  THEN
    RETURN false;
  END IF;
  -- Work this SMS blocked on the item that Undo has already released no
  -- longer waits on it; it still counts toward the fingerprint's 'linked'.
  SELECT count(*) INTO v_released
    FROM public.model_applies AS g
   WHERE g.source = p_apply.source AND g.source_id = p_apply.source_id
     AND g.reverted_at IS NOT NULL
     AND p_apply.target_id::text IN (g.after ->> 'blocked_by_item_id', g.after ->> 'blocked_by_decision_id');
  v_now := public._model_apply_fingerprint(p_apply.target_id);
  RETURN v_now || jsonb_build_object('linked', (v_now ->> 'linked')::integer + v_released)
           = p_apply.fingerprint
    -- Every task or FF&E line waiting on it is one this SMS blocked and Undo
    -- has not released.
    AND NOT EXISTS (
      SELECT 1
        FROM (SELECT 'project_tasks'::text AS tbl, t.id FROM public.project_tasks t
               WHERE t.blocked_by_item_id = p_apply.target_id
              UNION ALL
              SELECT 'project_ffe_items'::text, f.id FROM public.project_ffe_items f
               WHERE f.blocked_by_decision_id = p_apply.target_id) AS l
       WHERE NOT EXISTS (
         SELECT 1 FROM public.model_applies AS g
          WHERE g.source = p_apply.source AND g.source_id = p_apply.source_id
            AND g.target_table = l.tbl AND g.target_id = l.id
            AND g.reverted_at IS NULL));
END;
$$;

-- Puts one row back and stamps the log. Callers have locked both rows and
-- checked _model_apply_is_current.
CREATE OR REPLACE FUNCTION public._model_apply_restore(p_apply public.model_applies)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_set text;
BEGIN
  IF p_apply.target_table = 'client_decisions' THEN
    PERFORM set_config('app.client_decision_write_id', p_apply.target_id::text, true);
  END IF;
  IF p_apply.inserted THEN
    -- Withdrawn, never deleted: the closed status expire_client_decision uses.
    UPDATE public.client_decisions
       SET status = 'expired', updated_at = now()
     WHERE id = p_apply.target_id;
  ELSE
    IF EXISTS (
      SELECT 1 FROM jsonb_object_keys(p_apply.before) AS k
       WHERE NOT (k = ANY (public._model_apply_columns(p_apply.target_table)))
    ) THEN
      RAISE EXCEPTION 'model_applies: % holds a column outside the allowlist', p_apply.id
        USING ERRCODE = '22023';
    END IF;
    SELECT string_agg(format('%1$I = b.%1$I', k), ', ')
      INTO v_set
      FROM jsonb_object_keys(p_apply.before) AS k;
    EXECUTE format(
      'UPDATE public.%1$I AS t SET %2$s FROM jsonb_populate_record(NULL::public.%1$I, $1) AS b WHERE t.id = $2',
      p_apply.target_table, v_set
    ) USING p_apply.before, p_apply.target_id;
  END IF;
  IF p_apply.target_table = 'client_decisions' THEN
    PERFORM set_config('app.client_decision_write_id', '', true);
  END IF;

  UPDATE public.model_applies
     SET reverted_at = now(), reverted_by = auth.uid(), revert_outcome = 'restored'
   WHERE id = p_apply.id;
END;
$$;

-- Once every row an SMS produced is put back, the message says so. Callers
-- hold the message lock, so two reverts of one SMS cannot both miss the last
-- row; an 'already' call repairs a missing stamp and keeps an existing one.
CREATE OR REPLACE FUNCTION public._model_apply_mark_source_reverted(p_source text, p_source_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_source = 'sms' AND p_source_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.model_applies
     WHERE source = 'sms' AND source_id = p_source_id AND reverted_at IS NULL
  ) THEN
    UPDATE public.sms_messages
       SET applied_effect = applied_effect || jsonb_build_object('reverted', true, 'reverted_at', now())
     WHERE id = p_source_id AND applied_effect IS NOT NULL
       AND (applied_effect ->> 'reverted') IS DISTINCT FROM 'true';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._model_apply_may_write(text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._model_apply_is_current(public.model_applies, boolean)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._model_apply_restore(public.model_applies)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._model_apply_mark_source_reverted(text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.revert_model_apply(p_apply_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_apply public.model_applies%ROWTYPE;
BEGIN
  SELECT * INTO v_apply FROM public.model_applies WHERE id = p_apply_id;
  IF NOT FOUND OR auth.uid() IS NULL OR NOT (
    public.is_active_org_member(v_apply.studio_id)
    OR COALESCE(v_apply.studio_id IS NULL AND v_apply.owner_user_id = auth.uid(), false)
  ) THEN
    RAISE EXCEPTION 'model apply % not found or access denied', p_apply_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- Lock order: the message (one SMS is put back by one caller at a time),
  -- the log row, then the decision it links back to and the target
  -- (_model_apply_is_current).
  IF v_apply.source = 'sms' AND v_apply.source_id IS NOT NULL THEN
    PERFORM 1 FROM public.sms_messages WHERE id = v_apply.source_id FOR UPDATE;
  END IF;
  SELECT * INTO v_apply FROM public.model_applies WHERE id = p_apply_id FOR UPDATE;
  IF v_apply.reverted_at IS NOT NULL THEN
    PERFORM public._model_apply_mark_source_reverted(v_apply.source, v_apply.source_id);
    RETURN jsonb_build_object('outcome', 'already', 'applyId', v_apply.id);
  END IF;
  IF NOT public._model_apply_is_current(v_apply, false) THEN
    RETURN jsonb_build_object('outcome', 'conflict', 'applyId', v_apply.id);
  END IF;
  PERFORM public._model_apply_restore(v_apply);
  PERFORM public._model_apply_mark_source_reverted(v_apply.source, v_apply.source_id);
  RETURN jsonb_build_object('outcome', 'restored', 'applyId', v_apply.id);
END;
$$;

-- Every row one source produced, in one transaction: all restored, or (on any
-- conflict) nothing written.
CREATE OR REPLACE FUNCTION public.revert_model_apply_group(p_source_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows public.model_applies[];
  v_apply public.model_applies;
  v_conflicts uuid[] := ARRAY[]::uuid[];
  v_restored integer := 0;
BEGIN
  SELECT array_agg(ma) INTO v_rows
    FROM public.model_applies AS ma
   WHERE ma.source_id = p_source_id;
  IF v_rows IS NULL OR auth.uid() IS NULL OR EXISTS (
    SELECT 1 FROM unnest(v_rows) AS r
     WHERE NOT (public.is_active_org_member(r.studio_id)
                OR COALESCE(r.studio_id IS NULL AND r.owner_user_id = auth.uid(), false))
  ) THEN
    RAISE EXCEPTION 'model apply group % not found or access denied', p_source_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Lock order: the message, the log rows, then the targets. Targets go
  -- decisions, FF&E lines, tasks, captures, each by target_id (the order
  -- update_coordination_item and the resolve cascade use), never by log id:
  -- the first loop below locks each target as it checks it, in v_rows order.
  -- The decisions are all taken together first, by id: the ones put back
  -- and every one a `before` links a task or FF&E line back to.
  IF v_rows[1].source = 'sms' THEN
    PERFORM 1 FROM public.sms_messages WHERE id = p_source_id FOR UPDATE;
  END IF;
  PERFORM 1 FROM public.model_applies
    WHERE source_id = p_source_id ORDER BY id FOR UPDATE;
  SELECT array_agg(ma ORDER BY
           array_position(ARRAY['client_decisions', 'project_ffe_items', 'project_tasks',
                                'field_captures'], ma.target_table),
           ma.target_id, ma.id)
    INTO v_rows
    FROM public.model_applies AS ma
   WHERE ma.source_id = p_source_id;
  PERFORM 1 FROM public.client_decisions
    WHERE id IN (SELECT r.target_id FROM unnest(v_rows) AS r
                  WHERE r.reverted_at IS NULL AND r.target_table = 'client_decisions'
                 UNION
                 SELECT NULLIF(COALESCE(r.before ->> 'blocked_by_item_id',
                                        r.before ->> 'blocked_by_decision_id'), '')::uuid
                   FROM unnest(v_rows) AS r
                  WHERE r.reverted_at IS NULL)
    ORDER BY id FOR UPDATE;

  FOREACH v_apply IN ARRAY v_rows LOOP
    IF v_apply.reverted_at IS NULL AND NOT public._model_apply_is_current(v_apply, true) THEN
      v_conflicts := v_conflicts || v_apply.id;
    END IF;
  END LOOP;
  IF cardinality(v_conflicts) > 0 THEN
    RETURN jsonb_build_object('outcome', 'conflict', 'sourceId', p_source_id,
                              'conflicts', to_jsonb(v_conflicts));
  END IF;

  FOREACH v_apply IN ARRAY v_rows LOOP
    IF v_apply.reverted_at IS NULL THEN
      PERFORM public._model_apply_restore(v_apply);
      v_restored := v_restored + 1;
    END IF;
  END LOOP;
  IF v_restored = 0 THEN
    PERFORM public._model_apply_mark_source_reverted(v_rows[1].source, p_source_id);
    RETURN jsonb_build_object('outcome', 'already', 'sourceId', p_source_id);
  END IF;
  PERFORM public._model_apply_mark_source_reverted(v_rows[1].source, p_source_id);
  RETURN jsonb_build_object('outcome', 'restored', 'sourceId', p_source_id,
                            'restored', v_restored);
END;
$$;

-- One row alone can leave the rest of its SMS inconsistent (an RFI withdrawn
-- while the task it blocks stays blocked), so members only put back a whole
-- source. The single-row function stays for the database owner.
REVOKE ALL ON FUNCTION public.revert_model_apply(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revert_model_apply_group(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.revert_model_apply_group(uuid) TO authenticated;

COMMENT ON FUNCTION public.revert_model_apply(uuid) IS
  'Puts back one model_applies row for an active member of its studio, or its '
  'owner when it has no studio, who may still change its target (00787). '
  'Not granted to authenticated: members use revert_model_apply_group. '
  'Returns {outcome: restored | conflict | already}. Conflict (the target moved '
  'since the model wrote it, or is out of the caller''s reach) writes nothing. '
  'An inserted decision is withdrawn to expired, never deleted.';
COMMENT ON FUNCTION public.revert_model_apply_group(uuid) IS
  'Puts back every model_applies row of one source (an SMS or enrichment run) '
  'in one transaction (00787), for a caller who may still change every target. '
  'Any conflict wins and nothing is written.';

COMMIT;
