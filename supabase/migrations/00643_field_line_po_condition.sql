-- 00643 — Atomic PO field reports, condition replies, and daily issuance.
-- Lineage: prompt authority 00639; delivery core/wrapper 00399 -> 00641.
-- PO answers are field reports, NEVER receiving inspections or goods receipts.
-- CREATE OR REPLACE keeps existing signatures and ACLs (no new RPC/table).
-- Daily version is the producer's frozen YYYYMMDD; its identity lock closes
-- both stalled-create orderings across expired TypeScript leases.

ALTER TABLE public.field_delivery_reports
  DROP CONSTRAINT IF EXISTS field_delivery_reports_subject_kind_check;
ALTER TABLE public.field_delivery_reports
  ADD CONSTRAINT field_delivery_reports_subject_kind_check
  CHECK (subject_kind IN ('task','coordination','purchase_order'));

CREATE OR REPLACE FUNCTION public.sms_validate_prompt_effect(
  p_project_id uuid, p_kind text, p_subject_id uuid, p_effect jsonb
) RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_target uuid; v_project uuid;
BEGIN
  IF jsonb_typeof(p_effect) IS DISTINCT FROM 'object'
     OR p_effect->>'type' IS DISTINCT FROM p_kind
     OR p_kind NOT IN ('mark_done','report_delay','flag_blocker','confirm_delivery','note','punch_report',
                      'confirm_availability','report_arrival','report_departure','report_condition')
     OR p_kind IS NULL OR p_effect ? '_project_id'
     OR jsonb_typeof(p_effect->'target') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'sms_prompt: unsupported or mismatched effect' USING ERRCODE='23514';
  END IF;
  v_target := (p_effect#>>'{target,id}')::uuid;
  IF v_target IS NULL OR v_target IS DISTINCT FROM p_subject_id THEN
    RAISE EXCEPTION 'sms_prompt: immutable subject mismatch' USING ERRCODE='23514';
  END IF;
  IF p_effect#>>'{target,kind}' = 'task' THEN
    SELECT project_id INTO v_project FROM public.project_tasks WHERE id=v_target;
  ELSIF p_effect#>>'{target,kind}' = 'coordination' THEN
    SELECT project_id INTO v_project FROM public.client_decisions WHERE id=v_target;
  ELSIF p_effect#>>'{target,kind}' = 'purchase_order' THEN
    SELECT project_id INTO v_project FROM public.purchase_orders WHERE id=v_target;
  ELSE
    RAISE EXCEPTION 'sms_prompt: unsupported target kind' USING ERRCODE='23514';
  END IF;
  IF v_project IS DISTINCT FROM p_project_id THEN
    RAISE EXCEPTION 'sms_prompt: target must belong to prompt project' USING ERRCODE='23514';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.sms_create_prompt(
  p_party_id        UUID,
  p_project_id      UUID,
  p_kind            TEXT,
  p_subject_id      UUID,
  p_version         INTEGER,
  p_expires_at      TIMESTAMPTZ,
  p_sender_number   TEXT,
  p_recipient_phone TEXT,
  p_proposed_effect JSONB DEFAULT NULL
)
RETURNS TABLE (id UUID, short_code TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_sender    TEXT := public.normalize_channel_value('sms', p_sender_number);
  v_recipient TEXT := public.normalize_channel_value('sms', p_recipient_phone);
  v_code      TEXT;
  v_id        UUID;
  v_existing  public.sms_prompts;
BEGIN
  IF p_party_id IS NULL OR p_project_id IS NULL THEN
    RAISE EXCEPTION 'sms_create_prompt: a prompt is always about one party on one project'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_sender IS NULL OR v_recipient IS NULL THEN
    RAISE EXCEPTION 'sms_create_prompt: sender and recipient are both required'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_proposed_effect IS NOT NULL THEN
    PERFORM public.sms_validate_prompt_effect(p_project_id,p_kind,p_subject_id,p_proposed_effect);
  END IF;

  -- Stated here as well as inside the allocator, because THIS function is where
  -- the guarantee is claimed: the pair is serialized from before the code is
  -- read until the caller's transaction ends, so the prompt is inserted while
  -- the lock still stands. Advisory locks nest, so taking it twice is free.
  -- Daily producers encode their frozen digest/delivery day as YYYYMMDD in
  -- version. Serialize that immutable identity independently of phone formatting
  -- and before the allocator lock; a stalled lease owner returns the winner.
  IF p_proposed_effect IS NULL AND p_subject_id IS NOT NULL
      AND p_kind IN ('mark_done','confirm_delivery') AND p_version BETWEEN 10000101 AND 99991231 THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      'sms_daily|'||p_party_id||'|'||p_project_id||'|'||p_kind||'|'||p_subject_id||'|'||p_version, 0));
    SELECT * INTO v_existing FROM public.sms_prompts
      WHERE party_id=p_party_id AND project_id=p_project_id AND kind=p_kind
        AND subject_id=p_subject_id AND version=p_version AND proposed_effect IS NULL
        AND answered_at IS NULL AND expires_at>clock_timestamp()
      ORDER BY created_at,id LIMIT 1;
    IF FOUND THEN
      IF v_existing.sender_number IS DISTINCT FROM v_sender
          OR v_existing.recipient_phone IS DISTINCT FROM v_recipient THEN
        RAISE EXCEPTION 'sms_create_prompt: existing daily prompt endpoints differ' USING ERRCODE='23514';
      END IF;
      RETURN QUERY SELECT v_existing.id,v_existing.short_code;
      RETURN;
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_sender || '|' || v_recipient, 0));

  v_code := public.sms_next_short_code(v_sender, v_recipient);

  INSERT INTO public.sms_prompts
    (project_id, party_id, sender_number, recipient_phone, kind, subject_id,
     version, short_code, expires_at, proposed_effect)
  VALUES (p_project_id, p_party_id, v_sender, v_recipient, p_kind, p_subject_id,
          COALESCE(p_version, 1), v_code,
          COALESCE(p_expires_at, now() + interval '7 days'), p_proposed_effect)
  RETURNING sms_prompts.id, sms_prompts.short_code INTO v_id, v_code;

  RETURN QUERY SELECT v_id, v_code;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.sms_prompt_reply_verb(p_prompt public.sms_prompts,p_body text)
RETURNS text LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE parts text[]; body text := upper(btrim(p_body));
BEGIN
  -- Exact protocol takes precedence: a wrong code never becomes freeform.
  parts := regexp_match(body, '^([A-Z]+)(?:[[:space:]]+([0-9]{2,3}))?$');
  IF parts IS NOT NULL THEN
    IF parts[2] IS NOT NULL THEN
      IF parts[2]<>p_prompt.short_code THEN
        RAISE EXCEPTION 'sms_prompt: reply must identify this prompt' USING ERRCODE='23514';
      END IF;
      RETURN parts[1];
    END IF;
  ELSIF ((p_prompt.kind='confirm_availability' OR p_prompt.kind IN ('report_condition','confirm_delivery')) AND p_prompt.proposed_effect IS NULL
      AND p_prompt.answered_at IS NULL AND p_prompt.expires_at>clock_timestamp()
      AND body ~ '^[A-Z][^[:space:]]*[[:space:]]+[^[:space:]]'
      AND body !~ '^(YES|Y|OK|DONE|HERE|ARRIVED|DELIVERED|LEAVING|DEPARTED|DELAY|LATE|BLOCKED|BLOCKER|AVAILABLE|NO|STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT|START|UNSTOP|HELP|INFO)([^A-Z]|$)'
      AND (p_prompt.kind IN ('report_condition','confirm_delivery') OR body !~ '^(DAMAGED|DAMAGE|GOOD|FINE)([^A-Z]|$)')
      AND body !~ '^(DAMAGED|DAMAGE|GOOD|FINE)[[:space:]]+[0-9]') IS NOT TRUE THEN
    RAISE EXCEPTION 'sms_prompt: reply must identify this prompt' USING ERRCODE='23514';
  END IF;
  -- Codeless commands/freeform bind only to the current single open prompt.
  -- sms_apply_prompt holds the creator's pair lock across this check and apply.
  IF (SELECT count(*) FROM public.sms_prompts
      WHERE sender_number=p_prompt.sender_number AND recipient_phone=p_prompt.recipient_phone
        AND answered_at IS NULL AND expires_at>clock_timestamp())<>1 THEN
    RAISE EXCEPTION 'sms_prompt: reply must identify this prompt' USING ERRCODE='23514';
  END IF;
  RETURN parts[1]; -- SQL NULL only for command-only availability/condition freeform.
END $$;

CREATE OR REPLACE FUNCTION public.sms_apply_prompt(
  p_prompt_id uuid, p_sender text, p_recipient text, p_sms_message_id uuid,
  p_effect jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p public.sms_prompts; m public.sms_messages; c public.studio_channel_consent;
  effect jsonb; result jsonb; verb text;
  v_sender text := public.normalize_channel_value('sms',p_sender);
  v_recipient text := public.normalize_channel_value('sms',p_recipient);
BEGIN
  -- Same key/order as sms_create_prompt, before any prompt/message row locks.
  -- Issuance cannot change the one-open binding while consumption holds it.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_sender || '|' || v_recipient, 0));
  SELECT * INTO p FROM public.sms_prompts WHERE id=p_prompt_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'sms_prompt: unknown prompt' USING ERRCODE='23514'; END IF;
  m := public.sms_prompt_message(p,p_sender,p_recipient,p_sms_message_id);
  IF p.kind='optin' THEN RAISE EXCEPTION 'sms_apply_prompt: optin uses its own door' USING ERRCODE='23514'; END IF;
  IF p.consumed_sid=m.twilio_sid THEN
    RETURN jsonb_build_object('status','replayed','result',p.consumption_result);
  END IF;
  IF p.answered_at IS NOT NULL THEN RETURN jsonb_build_object('status','closed'); END IF;
  IF p.expires_at<=clock_timestamp() THEN RETURN jsonb_build_object('status','expired'); END IF;
  verb := public.sms_prompt_reply_verb(p,m.body);
  IF p.proposed_effect IS NOT NULL THEN
    IF p_effect IS NOT NULL OR verb NOT IN ('YES','Y','OK') THEN
      RAISE EXCEPTION 'sms_prompt: proposal requires affirmation, never replacement' USING ERRCODE='23514';
    END IF;
    effect := p.proposed_effect;
  ELSE
    effect := p_effect;
    IF ((verb IN ('YES','Y','OK') AND effect->>'type'=p.kind) OR
      (verb='AVAILABLE' AND effect->>'type'='confirm_availability') OR
      (verb IS NULL AND p.kind='confirm_availability' AND p.proposed_effect IS NULL
        AND effect->>'type'='confirm_availability') OR
      (verb IN ('DAMAGED','DAMAGE') AND effect->>'type'='report_condition'
        AND effect#>'{condition,ok}'='false'::jsonb) OR
      (verb IN ('GOOD','FINE') AND effect->>'type'='confirm_delivery') OR
      (verb IS NULL AND p.kind IN ('report_condition','confirm_delivery')
        AND effect->>'type'='report_condition') OR
      (verb='DONE' AND effect->>'type'='mark_done') OR
      (verb IN ('HERE','ARRIVED','DELIVERED') AND effect->>'type'='report_arrival') OR
      (verb IN ('LEAVING','DEPARTED') AND effect->>'type'='report_departure') OR
      (verb IN ('DELAY','LATE') AND effect->>'type'='report_delay') OR
      (verb IN ('BLOCKED','BLOCKER') AND effect->>'type'='flag_blocker')) IS NOT TRUE THEN
      RAISE EXCEPTION 'sms_prompt: conflicting command' USING ERRCODE='23514';
    END IF;
  END IF;
  PERFORM public.sms_validate_prompt_effect(p.project_id,effect->>'type',p.subject_id,effect);
  SELECT * INTO c FROM public.studio_channel_consent
    WHERE organization_id=public.project_consent_org(p.project_id)
      AND channel_kind='sms' AND channel_value=p.recipient_phone FOR UPDATE;
  IF public.sms_is_suppressed(p.sender_number,p.recipient_phone) OR public.sms_phone_suppressed(p.recipient_phone) THEN
    RETURN jsonb_build_object('status','suppressed');
  END IF;
  IF c.status IS DISTINCT FROM 'granted' OR c.refusal_unanswered IS DISTINCT FROM false THEN
    RETURN jsonb_build_object('status','not_consented');
  END IF;
  result := public.apply_field_effect(p.party_id,effect,'sms',m.id);
  IF result->'_sms_replayed' = 'true'::jsonb THEN
    -- A raw operation already completed this inbound. It is not an answer to
    -- this (possibly different) prompt; neither close it nor mint its receipt.
    RETURN jsonb_build_object('status','already_completed');
  END IF;
  result := jsonb_build_object('kind','effect','result',result);
  UPDATE public.sms_prompts SET consumed_sid=m.twilio_sid,consumption_result=result,answered_at=clock_timestamp()
    WHERE id=p.id;
  RETURN jsonb_build_object('status','applied','result',result);
END $$;

CREATE OR REPLACE FUNCTION public._apply_field_delivery_effect(
  p_party_id       uuid,
  p_effect         jsonb,
  p_source         text,
  p_sms_message_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_party       public.project_parties;
  v_project_id  uuid;
  v_type        text  := p_effect->>'type';
  v_target_kind text  := p_effect#>>'{target,kind}';
  v_target_id   uuid  := NULLIF(p_effect#>>'{target,id}', '')::uuid;
  v_note        text  := NULLIF(btrim(COALESCE(p_effect#>>'{condition,note}', p_effect->>'note', '')), '');
  v_scopes      text[] := public.field_effect_authority_scopes(p_effect->>'type');
  v_now         timestamptz := now();
  v_title       text;
  v_summary     text;
  v_when        text;
  v_date        date;
  v_window      text;
  v_ok_raw      text;
  v_ok          boolean;
  v_owner       uuid;
  v_report_id   uuid;
  v_task_id     uuid;
  v_item_id     uuid;
  v_remaining   integer;
  v_result      jsonb;
BEGIN
  -- ── The party is the actor and the tenant anchor ────────────────────────
  SELECT * INTO v_party FROM public.project_parties WHERE id = p_party_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_field_effect: party % not found', p_party_id
      USING ERRCODE = 'no_data_found';
  END IF;
  v_project_id := v_party.project_id;

  -- ── The authority gate (contract S3) ────────────────────────────────────
  -- Refused here, not in the caller's map: the grant is the authority.
  IF NOT public.party_holds_field_authority(
       p_party_id, v_scopes, (v_now AT TIME ZONE 'UTC')::date
     ) THEN
    RAISE EXCEPTION
      'apply_field_effect: field_effect_no_authority — % needs an in-force % grant on party %',
      v_type, array_to_string(v_scopes, ' or '), p_party_id
      USING ERRCODE = 'insufficient_privilege',
            DETAIL  = 'field_effect_no_authority',
            HINT    = 'project_party_authority (00624) holds no in-force grant for this seat and scope.';
  END IF;

  -- ── FORGERY GUARD: the subject belongs to the party's project ───────────
  IF v_target_id IS NULL OR v_target_kind IS NULL THEN
    RAISE EXCEPTION
      'apply_field_effect: % needs the prompt subject as its target', v_type
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_target_kind = 'task' THEN
    SELECT t.title INTO v_title
      FROM public.project_tasks t
     WHERE t.id = v_target_id AND t.project_id = v_project_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'apply_field_effect: task % is not on party %''s project',
        v_target_id, p_party_id USING ERRCODE = 'check_violation';
    END IF;
    v_task_id := v_target_id;
  ELSIF v_target_kind = 'coordination' THEN
    SELECT cd.title INTO v_title
      FROM public.client_decisions cd
     WHERE cd.id = v_target_id AND cd.project_id = v_project_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'apply_field_effect: item % is not on party %''s project',
        v_target_id, p_party_id USING ERRCODE = 'check_violation';
    END IF;
    v_item_id := v_target_id;
  ELSIF v_target_kind = 'purchase_order' THEN
    SELECT po.po_number INTO v_title FROM public.purchase_orders po
      WHERE po.id=v_target_id AND po.project_id=v_project_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'apply_field_effect: purchase order is not on party project'
        USING ERRCODE='23514';
    END IF;
    IF v_type NOT IN ('confirm_delivery','report_arrival','report_condition') THEN
      RAISE EXCEPTION 'apply_field_effect: unsupported purchase order report' USING ERRCODE='23514';
    END IF;
  ELSE
    RAISE EXCEPTION 'apply_field_effect: % cannot target a %', v_type, v_target_kind
      USING ERRCODE = 'check_violation';
  END IF;

  -- One visit record per (seat, subject).
  INSERT INTO public.field_delivery_reports (project_id, party_id, subject_kind, subject_id)
  VALUES (v_project_id, p_party_id, v_target_kind, v_target_id)
  ON CONFLICT (party_id, subject_kind, subject_id) DO NOTHING;

  SELECT r.id INTO v_report_id
    FROM public.field_delivery_reports r
   WHERE r.party_id = p_party_id
     AND r.subject_kind = v_target_kind
     AND r.subject_id = v_target_id;

  -- ── Dispatch ────────────────────────────────────────────────────────────
  IF v_type = 'confirm_availability' THEN
    v_date := NULLIF(btrim(COALESCE(
      p_effect#>>'{availability,date}', p_effect->>'new_date', ''
    )), '')::date;
    v_window := NULLIF(btrim(COALESCE(
      p_effect#>>'{availability,window}', p_effect->>'window', ''
    )), '');

    IF v_date IS NULL AND v_window IS NULL THEN
      RAISE EXCEPTION
        'apply_field_effect: confirm_availability needs a date or a window'
        USING ERRCODE = 'check_violation';
    END IF;

    -- AVAILABILITY IS NOT RECEIPT. No task close, no arrived_at, no receiving
    -- row — a window someone offered is not goods on the floor.
    UPDATE public.field_delivery_reports
       SET proposed_date   = v_date,
           proposed_window = v_window,
           availability_at = v_now
     WHERE id = v_report_id;

    v_when := btrim(
      COALESCE(to_char(v_date, 'Mon FMDD'), '') ||
      CASE WHEN v_window IS NOT NULL
           THEN CASE WHEN v_date IS NOT NULL THEN ' ' ELSE '' END || v_window
           ELSE '' END
    );
    v_summary := 'Noted for "' || COALESCE(v_title, 'the delivery') || '": ' ||
                 v_when || '. Nothing is marked received.';

  ELSIF v_type = 'report_arrival' OR (v_type='confirm_delivery' AND v_target_kind='purchase_order') THEN
    UPDATE public.field_delivery_reports
       SET arrived_at = COALESCE(arrived_at, v_now)
     WHERE id = v_report_id;
    v_summary := 'Arrival logged for "' || COALESCE(v_title, 'the delivery') || '".';

  ELSIF v_type = 'report_departure' THEN
    UPDATE public.field_delivery_reports
       SET left_at = v_now
     WHERE id = v_report_id;
    v_summary := 'Departure logged for "' || COALESCE(v_title, 'the delivery') || '".';

  ELSIF v_type = 'report_condition' THEN
    v_ok_raw := NULLIF(btrim(COALESCE(
      p_effect#>>'{condition,ok}', p_effect->>'ok', ''
    )), '');
    IF v_ok_raw IS NULL THEN
      RAISE EXCEPTION 'apply_field_effect: report_condition needs ok true or false'
        USING ERRCODE = 'check_violation';
    END IF;
    v_ok := v_ok_raw::boolean;

    UPDATE public.field_delivery_reports
       SET condition_ok   = v_ok,
           condition_note = v_note,
           condition_at   = v_now
     WHERE id = v_report_id;

    IF v_ok THEN
      v_summary := 'Condition logged for "' || COALESCE(v_title, 'the delivery') || '": looks good.';
    ELSE
      -- A problem is not a column entry. Open the review and name its owner.
      IF p_sms_message_id IS NOT NULL THEN
        v_owner := public.field_project_lead_user(v_project_id);
        UPDATE public.sms_messages
           SET needs_review   = true,
               owner_user_id  = COALESCE(owner_user_id, v_owner)
         WHERE id = p_sms_message_id;
      END IF;
      v_summary := 'Condition logged for "' || COALESCE(v_title, 'the delivery') ||
                   '" and flagged for review.';
    END IF;

  ELSE
    -- Unreachable while the wrapper routes by field_effect_authority_scopes();
    -- kept so a future name added to that table but not here fails loudly.
    RAISE EXCEPTION 'apply_field_effect: % is registered but not implemented', v_type
      USING ERRCODE = 'check_violation';
  END IF;

  -- Remaining open work for this party — the confirmation's "N left" line,
  -- counted exactly as the legacy core counts it (00282:437-443).
  SELECT
    (SELECT count(*) FROM public.project_tasks t
      WHERE t.owner_party_id = p_party_id AND t.status <> 'done')
    + (SELECT count(*) FROM public.client_decisions cd
      WHERE cd.court_party_id = p_party_id AND cd.status = 'pending')
    INTO v_remaining;

  v_result := jsonb_build_object(
    'applied',         true,
    'effect_type',     v_type,
    'summary_text',    v_summary,
    'remaining_count', v_remaining,
    'item_id',         v_item_id,
    'task_id',         v_task_id,
    'report_id',       v_report_id,
    'source',          p_source
  );

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

COMMENT ON FUNCTION public._apply_field_delivery_effect(uuid, jsonb, text, uuid) IS
  'The Field Line (00641), contract S3: the delivery half of '
  'apply_field_effect — confirm_availability, report_arrival, '
  'report_condition, report_departure. Reached ONLY through '
  'public.apply_field_effect. Refuses an effect the seat holds no 00624 grant '
  'for (field_effect_no_authority), re-asserts 00282''s cross-project forgery '
  'guard on the prompt subject, and writes public.field_delivery_reports. '
  'Availability never marks goods received.';

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
  -- The Field Line vocabulary (00641). Registered names route to the delivery
  -- core, which asks project_party_authority before it writes anything.
  IF public.field_effect_authority_scopes(p_effect->>'type') IS NOT NULL
      OR (p_effect->>'type'='confirm_delivery' AND p_effect#>>'{target,kind}'='purchase_order') THEN
    RETURN public._apply_field_delivery_effect(
      p_party_id, p_effect, p_source, p_sms_message_id
    );
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
  RETURN v_result;
END;
$$;
