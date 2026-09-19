-- ═══════════════════════════════════════════════════════════════════════════
-- 00645 — The trade rail: site card, day-of ask, daily cadence, dead ends
-- Lineage: prompt authority 00639; dispatch/links 00640; effects + the one
-- canonical closing line 00641; thread ownership and additive pauses 00642;
-- reply grammar and the verb→effect matrix 00643.
--
-- Four things, and nothing else:
--
--   1. Two templates a crew can act on from a flip phone — sms_site_card the
--      evening before (where, when, how to get in, who to call) and sms_day_of
--      the morning of. Studio name first, plain words, GSM-7, two segments with
--      every parameter at its documented maximum, and the SAME rates/HELP/STOP
--      line every other Field Line text ends with. That line is defined ONCE,
--      in 00641; this file READS it back out of a shipped row rather than
--      writing a second copy of it, because two copies is how they drift.
--
--   2. A per-party daily cadence: one recurring text (the digest) and at most
--      three event texts a day. sms_claim_party_budget IS the claim — a single
--      INSERT ... ON CONFLICT ... DO UPDATE ... WHERE, so two sends racing over
--      the third slot meet on the context row's lock and Postgres re-evaluates
--      the predicate after the lock. Exactly one of them gets the slot. The day
--      is the caller's LOCAL day in FIELD_TZ, passed in as a date: the boundary
--      moves with daylight saving and no fixed UTC offset can express it.
--
--   3. A dead end has an owner. Two prompts that went unanswered is not a
--      third prompt — it is a person who needs a call, so the rail stops texting
--      that party and hands the thread to the project lead ONCE. The
--      exactly-once claim is a compare-and-set on the streak's oldest prompt id,
--      taken in the same statement-chain as the pause, because a handoff written
--      twice is two people each assuming the other has it.
--
--   4. The grammar for the words those two cards print. ON MY WAY, LATE 20 and
--      PROBLEM are not VERB NN — the number after LATE is MINUTES — so
--      sms_prompt_reply_verb learns them, for a site_card or day_of prompt and
--      nowhere else, and sms_apply_prompt admits PROBLEM as a not-ok condition
--      and (on the trade rail only) DONE as a departure. Phase 0's grammar is
--      byte-identical.
--
-- NO new table: the cadence and dead-end state are columns on
-- sms_conversation_context, which already exists, is already RLS-scoped to the
-- studio, and already carries this conversation's pause. So there is no new
-- table privilege to REVOKE and supabase/seed/00-legacy-grants.sql does not
-- change. The new FUNCTIONS carry the standard service-only ACL below.
--
-- NONE OF THESE VERBS SAYS GOODS WERE RECEIVED. A crew arriving, running late,
-- finding a problem or leaving is a field report about a visit; receiving is
-- field_delivery_reports + a delivery effect, and nothing here writes one.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Cadence and dead-end state on the existing context row ───────────────
-- One party is one seat on one project reachable at one number, which is one
-- (conversation_id, project_id) — the key 00639 already made unique and 00642
-- already upserts on. The counters live beside the pause they cooperate with.

ALTER TABLE public.sms_conversation_context
  ADD COLUMN IF NOT EXISTS budget_local_day date,
  ADD COLUMN IF NOT EXISTS budget_recurring_used smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS budget_events_used smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dead_end_prompt_id uuid,
  ADD COLUMN IF NOT EXISTS dead_end_at timestamptz,
  ADD COLUMN IF NOT EXISTS dead_end_owner_user_id uuid;

COMMENT ON COLUMN public.sms_conversation_context.budget_local_day IS
  'The Field Line (00645), contract P5: the local day in FIELD_TZ the two '
  'counters below belong to. A different day resets them; the sender passes the '
  'day it computed in the named zone, so the boundary follows daylight saving.';
COMMENT ON COLUMN public.sms_conversation_context.budget_recurring_used IS
  'Recurring texts (the daily digest) spent on budget_local_day. Cap 1.';
COMMENT ON COLUMN public.sms_conversation_context.budget_events_used IS
  'Event texts (site card, day-of ask, delivery confirm) spent on '
  'budget_local_day. Cap 3; the fourth folds into the next digest.';
COMMENT ON COLUMN public.sms_conversation_context.dead_end_prompt_id IS
  'The Field Line (00645), contract P4: the oldest unanswered prompt of the '
  'streak this conversation was already handed off for. Deliberately NOT a '
  'foreign key — it is a claim token for exactly-once, not a relationship, and '
  'prompts are append-only.';
COMMENT ON COLUMN public.sms_conversation_context.dead_end_at IS
  'When the dead-end handoff named in dead_end_prompt_id was taken.';
COMMENT ON COLUMN public.sms_conversation_context.dead_end_owner_user_id IS
  'The project lead (field_project_lead_user, 00641) the dead end was handed to.';

-- ── 2. The daily cadence claim ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sms_claim_party_budget(
  p_conversation_id uuid,
  p_project_id      uuid,
  p_party_id        uuid,
  p_local_day       date,
  p_class           text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- One recurring text a day is the digest's own promise ("~1 msg/day", the
  -- words in every opt-in invite this rail has ever sent). Three event texts is
  -- the site card, the morning ask, and one thing that actually happened.
  c_recurring_cap CONSTANT smallint := 1;
  c_event_cap     CONSTANT smallint := 3;
  v_row public.sms_conversation_context;
BEGIN
  IF p_conversation_id IS NULL OR p_project_id IS NULL OR p_local_day IS NULL THEN
    RAISE EXCEPTION 'sms_claim_party_budget: conversation, project and local day are all required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_class NOT IN ('recurring','event') THEN
    RAISE EXCEPTION 'sms_claim_party_budget: unknown cadence class'
      USING ERRCODE = 'check_violation';
  END IF;

  -- THE CLAIM. One statement, so there is no window between reading the
  -- counters and spending them. A first send inserts (both caps are at least 1,
  -- so a fresh row always claims); every later send conflicts on
  -- sms_conversation_context_key, takes the row lock, and the DO UPDATE's WHERE
  -- is re-evaluated against the value the other transaction committed. Over
  -- budget matches nothing and returns no row — that is the refusal, and it is
  -- the same refusal whichever of two concurrent senders lost.
  INSERT INTO public.sms_conversation_context AS ctx
    (conversation_id, project_id, party_id, budget_local_day,
     budget_recurring_used, budget_events_used)
  VALUES
    (p_conversation_id, p_project_id, p_party_id, p_local_day,
     CASE WHEN p_class = 'recurring' THEN 1 ELSE 0 END,
     CASE WHEN p_class = 'event'     THEN 1 ELSE 0 END)
  ON CONFLICT (conversation_id, project_id) DO UPDATE
     SET budget_local_day = p_local_day,
         budget_recurring_used = CASE
           WHEN ctx.budget_local_day IS DISTINCT FROM p_local_day
             THEN CASE WHEN p_class = 'recurring' THEN 1 ELSE 0 END
           WHEN p_class = 'recurring' THEN ctx.budget_recurring_used + 1
           ELSE ctx.budget_recurring_used END,
         budget_events_used = CASE
           WHEN ctx.budget_local_day IS DISTINCT FROM p_local_day
             THEN CASE WHEN p_class = 'event' THEN 1 ELSE 0 END
           WHEN p_class = 'event' THEN ctx.budget_events_used + 1
           ELSE ctx.budget_events_used END,
         updated_at = now()
   WHERE ctx.budget_local_day IS DISTINCT FROM p_local_day
      OR (p_class = 'recurring' AND ctx.budget_recurring_used < c_recurring_cap)
      OR (p_class = 'event'     AND ctx.budget_events_used   < c_event_cap)
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'claimed', false, 'reason', 'budget', 'class', p_class,
      'local_day', p_local_day, 'recurring_cap', c_recurring_cap,
      'event_cap', c_event_cap);
  END IF;

  RETURN jsonb_build_object(
    'claimed', true, 'class', p_class, 'local_day', v_row.budget_local_day,
    'recurring_used', v_row.budget_recurring_used,
    'events_used', v_row.budget_events_used,
    'recurring_cap', c_recurring_cap, 'event_cap', c_event_cap);
END;
$$;

REVOKE ALL ON FUNCTION public.sms_claim_party_budget(uuid, uuid, uuid, date, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_claim_party_budget(uuid, uuid, uuid, date, text)
  TO service_role;
COMMENT ON FUNCTION public.sms_claim_party_budget(uuid, uuid, uuid, date, text) IS
  'The Field Line (00645), contract P5: spend one slot of a party''s daily SMS '
  'cadence — 1 recurring, 3 event — for the caller''s LOCAL day in FIELD_TZ. '
  'Returns {"claimed":true,...} or {"claimed":false,"reason":"budget",...}. The '
  'single INSERT ... ON CONFLICT ... DO UPDATE ... WHERE is the atomic claim: '
  'two senders racing over the last slot serialize on the context row and '
  'exactly one gets it. Never called for a reply to a human, only by automation.';

-- ── 3. The dead end and its one owner ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sms_party_prompt_gate(
  p_conversation_id uuid,
  p_project_id      uuid,
  p_party_id        uuid,
  p_threshold       integer DEFAULT 2,
  p_pause_hours     integer DEFAULT 24
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ctx        public.sms_conversation_context;
  v_last_reply timestamptz;
  v_count      integer;
  v_oldest     uuid;
  v_owner      uuid;
  v_paused     timestamptz;
  v_handoff    boolean := false;
  v_message    uuid;
BEGIN
  IF p_conversation_id IS NULL OR p_project_id IS NULL OR p_party_id IS NULL THEN
    RAISE EXCEPTION 'sms_party_prompt_gate: conversation, project and party are all required'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_threshold < 1 OR p_pause_hours < 1 OR p_pause_hours > 72 THEN
    RAISE EXCEPTION 'sms_party_prompt_gate: threshold and pause hours are out of range'
      USING ERRCODE = '22023';
  END IF;

  -- Take the context row's lock FIRST, creating it if this is the party's first
  -- prompt, exactly as sms_extend_pause (00642) does. Everything below — the
  -- streak count, the compare-and-set, the pause — happens while this
  -- transaction holds it, so a second sender arriving in the same instant reads
  -- the claim the first one made and not the state before it.
  INSERT INTO public.sms_conversation_context AS ctx
    (conversation_id, project_id, party_id)
  VALUES (p_conversation_id, p_project_id, p_party_id)
  ON CONFLICT (conversation_id, project_id) DO UPDATE
     SET updated_at = now()
  RETURNING * INTO v_ctx;

  IF v_ctx.paused_until IS NOT NULL AND v_ctx.paused_until > clock_timestamp() THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'paused',
      'paused_until', v_ctx.paused_until,
      'owner_user_id', v_ctx.dead_end_owner_user_id);
  END IF;

  -- The streak: prompts this party has been asked SINCE the last one they
  -- answered. An expired prompt still counts — going unanswered is the whole
  -- point. optin is excluded (its resend floor is 00644's, and a party with no
  -- consent yet is not a dead end), and so is mark_done: a digest line is an
  -- offer to close a task, not a question anybody owes an answer to.
  SELECT max(answered_at) INTO v_last_reply
    FROM public.sms_prompts
   WHERE party_id = p_party_id AND project_id = p_project_id
     AND answered_at IS NOT NULL;

  SELECT count(*), (array_agg(id ORDER BY created_at, id))[1]
    INTO v_count, v_oldest
    FROM public.sms_prompts
   WHERE party_id = p_party_id AND project_id = p_project_id
     AND answered_at IS NULL
     AND kind NOT IN ('optin','mark_done')
     AND created_at > COALESCE(v_last_reply, '-infinity'::timestamptz);

  IF v_count < p_threshold THEN
    RETURN jsonb_build_object('allowed', true, 'unanswered', v_count);
  END IF;

  v_owner := public.field_project_lead_user(p_project_id);

  -- EXACTLY ONE HANDOFF PER STREAK. The key is the streak's OLDEST unanswered
  -- prompt: stable when a third prompt is added to the same silence, and it
  -- moves only when the party actually answers something. So the third
  -- unanswered prompt finds its own id already claimed and writes nothing.
  IF v_ctx.dead_end_prompt_id IS DISTINCT FROM v_oldest THEN
    UPDATE public.sms_conversation_context
       SET dead_end_prompt_id     = v_oldest,
           dead_end_at            = clock_timestamp(),
           dead_end_owner_user_id = v_owner,
           paused_until           = greatest(
             COALESCE(paused_until, clock_timestamp()), clock_timestamp())
             + make_interval(hours => p_pause_hours),
           updated_at             = now()
     WHERE conversation_id = p_conversation_id
       AND project_id = p_project_id
       AND dead_end_prompt_id IS DISTINCT FROM v_oldest
    RETURNING paused_until INTO v_paused;
    v_handoff := FOUND;

    -- The owned review row. Preferring the party's newest INBOUND message puts
    -- it in sms_review_queue (00639), which filters on direction; a party who
    -- has never texted back has only outbound rows, and flagging the newest of
    -- those is still a row with an owner on it even though the queue view will
    -- not list it. Exactly-once does NOT depend on this write: the
    -- compare-and-set above is the claim, and this is how a person is told.
    IF v_handoff AND v_owner IS NOT NULL THEN
      SELECT id INTO v_message
        FROM public.sms_messages
       WHERE conversation_id = p_conversation_id
         AND party_id = p_party_id
       ORDER BY (direction = 'inbound') DESC, created_at DESC, id DESC
       LIMIT 1;
      IF v_message IS NOT NULL THEN
        UPDATE public.sms_messages
           SET needs_review  = true,
               owner_user_id = COALESCE(owner_user_id, v_owner),
               reviewed_at   = NULL
         WHERE id = v_message;
      END IF;
    END IF;
  ELSE
    v_paused := v_ctx.paused_until;
  END IF;

  RETURN jsonb_build_object(
    'allowed', false, 'reason', 'dead_end', 'handoff', v_handoff,
    'unanswered', v_count, 'prompt_id', v_oldest,
    'paused_until', v_paused, 'owner_user_id', v_owner,
    'review_message_id', v_message);
END;
$$;

REVOKE ALL ON FUNCTION public.sms_party_prompt_gate(uuid, uuid, uuid, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sms_party_prompt_gate(uuid, uuid, uuid, integer, integer)
  TO service_role;
COMMENT ON FUNCTION public.sms_party_prompt_gate(uuid, uuid, uuid, integer, integer) IS
  'The Field Line (00645), contract P4: may this party be asked another '
  'question? Refuses while a pause stands, and on the p_threshold''th prompt '
  'that went unanswered since the party last replied it hands the thread to the '
  'project lead ONCE (compare-and-set on the streak''s oldest prompt id) and '
  'pauses prompts for p_pause_hours. A third unanswered prompt creates no '
  'second handoff. Excludes optin and mark_done prompts.';

-- ── 4. Trade prompt kinds where kinds are enumerated ────────────────────────
-- 00643's daily-identity lock is what makes a producer that runs twice (a
-- retried cron, an expired TypeScript lease) issue ONE prompt for one party,
-- one subject and one frozen YYYYMMDD day. The site card and the morning ask
-- are exactly such producers, so they belong inside it. Everything else in this
-- function is 00643 verbatim.

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
  -- Daily producers encode their frozen digest/delivery/visit day as YYYYMMDD
  -- in version. Serialize that immutable identity independently of phone
  -- formatting and before the allocator lock; a stalled lease owner returns the
  -- winner.
  IF p_proposed_effect IS NULL AND p_subject_id IS NOT NULL
      AND p_kind IN ('mark_done','confirm_delivery','site_card','day_of')
      AND p_version BETWEEN 10000101 AND 99991231 THEN
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

-- ── 5. The words the two cards print ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sms_prompt_reply_verb(p_prompt public.sms_prompts,p_body text)
RETURNS text LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE parts text[]; body text := upper(btrim(p_body)); v_trade boolean := false;
BEGIN
  -- The trade rail answers in the words its own card printed: ON MY WAY, LATE
  -- 20, PROBLEM the gate is locked, HERE, DONE. Three of those cannot be read
  -- as VERB NN at all — the number after LATE is MINUTES, not a reference, and
  -- reading it as one refused the exact reply the card asked for. Admitted for
  -- a site_card or day_of prompt and NOWHERE else, so every phase-0 reply is
  -- parsed by byte-identical code. What stops a forwarded card from answering
  -- someone else's question here is the codeless door's own guard below.
  IF p_prompt.kind IN ('site_card','day_of') THEN
    IF body ~ '^ON[[:space:]]+MY[[:space:]]+WAY[.!]*$' THEN
      v_trade := true; parts := ARRAY['HERE'];
    ELSIF body ~ '^LATE[[:space:]]+[0-9]{1,3}([[:space:]]*(MIN|MINS|MINUTES))?[.!]*$' THEN
      v_trade := true; parts := ARRAY['LATE'];
    ELSIF body ~ '^PROBLEM([^A-Z0-9].*)?$' THEN
      v_trade := true; parts := ARRAY['PROBLEM'];
    ELSIF body ~ '^(HERE|DONE)[.!]*$' THEN
      v_trade := true; parts := ARRAY[(regexp_match(body,'^(HERE|DONE)'))[1]];
    END IF;
  END IF;
  IF NOT v_trade THEN
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
  END IF;
  -- Codeless commands/freeform bind only to the current single open prompt.
  -- sms_apply_prompt holds the creator's pair lock across this check and apply.
  -- A trade word binds against the open TRADE prompts only: the morning ask and
  -- yesterday's digest can both be open, and "ON MY WAY" is plainly an answer to
  -- the one that asked the crew to say so. Narrowing the count, not skipping it.
  IF (SELECT count(*) FROM public.sms_prompts
      WHERE sender_number=p_prompt.sender_number AND recipient_phone=p_prompt.recipient_phone
        AND answered_at IS NULL AND expires_at>clock_timestamp()
        AND (NOT v_trade OR kind IN ('site_card','day_of')))<>1 THEN
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
    -- PROBLEM is a condition report that says something is wrong — the same
    -- pairing DAMAGED already has, and 00641's delivery core opens it for
    -- review and names an owner. DONE closes the visit on the trade rail (a
    -- departure) and closes a task everywhere else; both meanings are kept by
    -- asking the prompt's own kind, so no digest DONE changes meaning.
    IF ((verb IN ('YES','Y','OK') AND effect->>'type'=p.kind) OR
      (verb='AVAILABLE' AND effect->>'type'='confirm_availability') OR
      (verb IS NULL AND p.kind='confirm_availability' AND p.proposed_effect IS NULL
        AND effect->>'type'='confirm_availability') OR
      (verb IN ('DAMAGED','DAMAGE') AND effect->>'type'='report_condition'
        AND effect#>'{condition,ok}'='false'::jsonb) OR
      (verb='PROBLEM' AND p.kind IN ('site_card','day_of')
        AND effect->>'type'='report_condition'
        AND effect#>'{condition,ok}'='false'::jsonb) OR
      (verb IN ('GOOD','FINE') AND effect->>'type'='confirm_delivery') OR
      (verb IS NULL AND p.kind IN ('report_condition','confirm_delivery')
        AND effect->>'type'='report_condition') OR
      (verb='DONE' AND p.kind IN ('site_card','day_of')
        AND effect->>'type'='report_departure') OR
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

-- ── 6. The two cards ────────────────────────────────────────────────────────
-- Budget: two GSM-7 segments is 306 septets, the rates/HELP/STOP line spends 63
-- of them plus its separating space, and every parameter below is measured at
-- the maximum it is documented to carry. Rendered at those maxima:
--   sms_site_card  97 literal + 137 parameters + 64 closing = 298
--   sms_day_of    115 literal +  95 parameters + 64 closing = 274
-- Documented maxima, in SEPTETS (an extension character costs two):
--   studio_name 24, visit_day 10, visit_window 11, site_address 36,
--   access_note 32, contact 24
-- Neither card carries a link: a crew standing at a gate needs a street
-- address and a phone number, and the 98 septets a field link costs would buy
-- neither. No software words, the studio's name first, and the reply words are
-- the ones 00645's grammar above actually accepts.
--
-- THE CLOSING LINE IS NOT WRITTEN HERE. It is defined exactly once, in 00641,
-- and read back out of the row 00641 shipped — sms_selection, whose head is
-- exactly '{{selection}}' — so a second literal cannot drift from the first.

DO $field_line_trade_copy$
DECLARE
  v_closing text;
  v_row     record;
BEGIN
  SELECT btrim(substr(html_content, length('{{selection}}') + 1))
    INTO v_closing
    FROM public.email_templates
   WHERE slug = 'sms_selection';

  IF v_closing IS NULL OR v_closing = '' OR length(v_closing) > 120
      OR v_closing !~ 'rates' OR v_closing !~ 'HELP' OR v_closing !~ 'STOP' THEN
    RAISE EXCEPTION '00645: the canonical Field Line closing line could not be read from the sms_selection template seeded by 00641 (got %); it is defined there and nowhere else, so apply 00641 first',
      COALESCE(quote_literal(v_closing), 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_row IN
    -- <<< FIELD LINE TRADE COPY BLOCK (read by _tests/field-line/inbound-fixture.ts)
    SELECT * FROM (VALUES
      ('sms_site_card',
       'Field SMS - Site card (day before)',
       '{{studio_name}} tomorrow {{visit_day}} {{visit_window}}: {{site_address}}. {{access_note}}. Call {{contact}}. Reply HERE on arrival, LATE 20 if delayed, PROBLEM if something is wrong.',
       '["studio_name","visit_day","visit_window","site_address","access_note","contact"]'),

      ('sms_day_of',
       'Field SMS - Day of the visit',
       '{{studio_name}} at {{site_address}} today {{visit_window}}. Call {{contact}} if anything changes. Reply ON MY WAY when you head out, LATE 20 if delayed, DONE when you leave.',
       '["studio_name","site_address","visit_window","contact"]'),

      -- Reply-to-renew (contract S6/P11). {{link}} and no other parameter the
      -- sender has to remember: resolveBody fills the studio and project names
      -- and MINTS THE LINK AT DISPATCH, which is the whole reason this is a
      -- template and not a URL pasted into a body. 24 + 24 + 98 septets of
      -- parameter, 22 of copy, 64 of closing.
      ('sms_field_link_renew',
       'Field SMS - Link renewed on reply',
       '{{studio_name}}: here is your {{project_name}} link. {{link}}',
       '["studio_name","project_name","link"]')
    ) AS t(slug, name, head, vars)
    -- >>> FIELD LINE TRADE COPY BLOCK
  LOOP
    INSERT INTO public.email_templates (
      slug, name, description, category, subject_default, html_content, variables
    )
    VALUES (
      v_row.slug, v_row.name, v_row.name, 'transactional', NULL,
      v_row.head || ' ' || v_closing, v_row.vars::jsonb
    )
    ON CONFLICT (slug) DO UPDATE
      SET name         = EXCLUDED.name,
          html_content = EXCLUDED.html_content,
          variables    = EXCLUDED.variables,
          is_active    = true,
          updated_at   = now();
  END LOOP;
END
$field_line_trade_copy$;
