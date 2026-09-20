-- ═══════════════════════════════════════════════════════════════════════════
-- 00653 — Contractor hours arrive as a PROPOSAL, never as a time entry
-- US-4 (Field Line phase 3), contract S1-S6. Lineage: prompt authority 00639;
-- delivery core/vocabulary 00641; PO/condition + the daily identity lock 00643;
-- the trade cards, their grammar and their consumption door 00645.
--
-- WHAT THIS FILE IS FOR. A consented trade party who had a visit today gets one
-- evening text asking how many hours. A numeric reply becomes ONE row in a new
-- party-backed ledger, status 'proposed'. A designer then accepts it, rejects
-- it, or books it explicitly to a profile-backed teammate from the Desk. The
-- reply itself moves no money and writes no timesheet.
--
-- THE BINDING FINDING, AND WHY THE LEDGER EXISTS AT ALL.
-- 00177_project_time_entries.sql:18 — user_id is NOT NULL REFERENCES profiles.
-- A contractor with no profile can therefore never be a time entry's user, and
-- contractor labour is never silently booked as the designer's own hour. So the
-- number the field texts cannot be a time entry: it is a claim, and this file
-- gives the claim its own table. NOTHING here derives a user_id from a party,
-- and project_time_entries' policies are untouched (its RLS, its triggers and
-- its CHECKs are read here as constraints on what the RPC may write, never
-- edited). The ONLY project_time_entries write in this file is the one a
-- designer asks for by name, in public.field_time_report_decide.
--
-- WHAT IS REDEFINED, AND WHY EACH ONE HAD TO BE (contract S1).
--   sms_validate_prompt_effect (00643:14) — admits the 'report_hours' kind and
--     holds it to a task subject.
--   sms_create_prompt (00645:383) — the evening hours ask is a DAILY producer
--     (one per party, task and frozen YYYYMMDD day), so it belongs inside
--     00643's daily identity lock; without it a retried tick issues a second
--     prompt and the crew is asked twice.
--   sms_prompt_reply_verb (00645:465) — an hours answer is a NUMBER ("6",
--     "6.5", "6,5", "6 hrs", "6.5 42"). Before this file every numeric body was
--     refused with "reply must identify this prompt", so the S7 grammar in
--     pipeline.ts could not have been consumed no matter what it parsed.
--   sms_apply_prompt (00645:520) — one new (verb, effect) pair, and the
--     transaction-local prompt capability the ledger's claim needs.
--   apply_field_effect (00643:451) — one branch, delegating to
--     _apply_field_hours_effect exactly as the delivery vocabulary delegates to
--     _apply_field_delivery_effect.
-- field_effect_authority_scopes (00641:210) is deliberately NOT redefined:
-- 'report_hours' is not a delivery effect, its scope answer is already NULL by
-- that function's own ELSE, and a `WHEN 'report_hours' THEN NULL` arm would be
-- dead code. The property is asserted as a postcondition at the end instead.
--
-- Idempotent throughout: CREATE … IF NOT EXISTS, CREATE OR REPLACE, DROP POLICY
-- IF EXISTS + CREATE, a guarded ALTER … ADD CONSTRAINT, and a template write
-- that converges.
--
-- Privileges (00641's contract S12 note still holds): on this stack ALTER
-- DEFAULT PRIVILEGES hands anon and authenticated full rights on a new table at
-- creation, so both new tables carry an explicit REVOKE ALL … FROM PUBLIC,
-- anon, authenticated BEFORE their policies. supabase/seed/00-legacy-grants.sql
-- is NOT regenerated here — that file is outside this ticket's scope and it
-- names tables one by one, so it cannot re-grant a table it has never seen.
-- The regeneration is the activation ticket's, with the deploy.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. S1 — the 'report_hours' prompt kind
-- ═══════════════════════════════════════════════════════════════════════════
-- 00643:14 verbatim, plus 'report_hours' in the allowlist and one rule of its
-- own: the hours answer is about a VISIT, so its target is a task. The subject
-- immutability check above it is what binds the prompt to the visit's own
-- project_tasks row at issuance (the same S1 rule sms_day_of lives under).
CREATE OR REPLACE FUNCTION public.sms_validate_prompt_effect(
  p_project_id uuid, p_kind text, p_subject_id uuid, p_effect jsonb
) RETURNS void LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE v_target uuid; v_project uuid;
BEGIN
  IF jsonb_typeof(p_effect) IS DISTINCT FROM 'object'
     OR p_effect->>'type' IS DISTINCT FROM p_kind
     OR p_kind NOT IN ('mark_done','report_delay','flag_blocker','confirm_delivery','note','punch_report',
                      'confirm_availability','report_arrival','report_departure','report_condition',
                      'report_hours')
     OR p_kind IS NULL OR p_effect ? '_project_id'
     OR jsonb_typeof(p_effect->'target') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'sms_prompt: unsupported or mismatched effect' USING ERRCODE='23514';
  END IF;
  v_target := (p_effect#>>'{target,id}')::uuid;
  IF v_target IS NULL OR v_target IS DISTINCT FROM p_subject_id THEN
    RAISE EXCEPTION 'sms_prompt: immutable subject mismatch' USING ERRCODE='23514';
  END IF;
  -- 00653 (S1): an hours answer is about a VISIT, so report_hours answers about
  -- a task and about nothing else. Stated here, where the kinds are policed, so
  -- that no caller can point it at a coordination item or a purchase order.
  IF p_kind='report_hours' AND p_effect#>>'{target,kind}' IS DISTINCT FROM 'task' THEN
    RAISE EXCEPTION 'sms_prompt: report_hours answers a visit task' USING ERRCODE='23514';
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

-- ── The daily identity lock learns the evening hours ask ────────────────────
-- 00645:383 verbatim, plus 'report_hours' in the list of daily producers. The
-- ask is issued once per party, per visit task, per frozen local day, with no
-- proposed effect (the hours are not known until the crew answers), which is
-- exactly the shape 00643's lock was written for.
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
      -- 00653: the evening hours ask is a daily producer too — one per party,
      -- per visit task, per frozen local day.
      AND p_kind IN ('mark_done','confirm_delivery','site_card','day_of','report_hours')
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

-- ── The words the hours ask is answered in ──────────────────────────────────
-- 00645:465 verbatim, plus the numeric reply. Nothing outside a report_hours
-- prompt changes: a bare number still means what it meant this morning
-- (a digest menu pick, or nothing), because the new branch is entered only when
-- the prompt the caller resolved is itself the hours ask.
CREATE OR REPLACE FUNCTION public.sms_prompt_reply_verb(p_prompt public.sms_prompts,p_body text)
RETURNS text LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE parts text[]; body text := upper(btrim(p_body)); v_trade boolean := false;
  v_hours boolean := false;
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
  -- 00653 (S1/S7): the evening hours ask is answered with a NUMBER — "6",
  -- "6.5", "6,5", "6 hrs", "6.5 42" — and never with a word. Read ONLY for a
  -- report_hours prompt, and only when the whole body is that number and, at
  -- most, its own Ref, so a digest menu pick and every other bare number keep
  -- the meaning they had before this file. Out-of-range numbers are admitted
  -- here on purpose and refused by the ledger's own 0..16 CHECK, which leaves
  -- the prompt open instead of consuming it on a typo.
  IF NOT v_trade AND p_prompt.kind='report_hours' THEN
    parts := regexp_match(body,
      '^([0-9]{1,2}(?:[.,][0-9]{1,2})?)[[:space:]]*(?:H|HR|HRS|HOURS)?[[:space:]]*(?:REF[[:space:]]*)?([0-9]{2,3})?$');
    IF parts IS NOT NULL THEN
      v_hours := true;
      IF parts[2] IS NOT NULL THEN
        -- Exact protocol takes precedence here as well: a wrong code is not an
        -- hours answer to THIS ask.
        IF parts[2]<>p_prompt.short_code THEN
          RAISE EXCEPTION 'sms_prompt: reply must identify this prompt' USING ERRCODE='23514';
        END IF;
        RETURN NULL; -- the number is the answer; the code named this prompt
      END IF;
      parts := ARRAY[NULL::text]; -- codeless: the one-open-prompt guard decides
    END IF;
  END IF;
  IF NOT v_trade AND NOT v_hours THEN
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
        AND (NOT v_trade OR kind IN ('site_card','day_of'))
        AND (NOT v_hours OR kind='report_hours'))<>1 THEN
    RAISE EXCEPTION 'sms_prompt: reply must identify this prompt' USING ERRCODE='23514';
  END IF;
  RETURN parts[1]; -- SQL NULL only for command-only availability/condition freeform.
END $$;

-- ── The consumption door ────────────────────────────────────────────────────
-- 00645:520 verbatim, plus one (verb, effect) pair and the prompt capability.
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
      (verb IS NULL AND p.kind='report_hours' AND effect->>'type'='report_hours') OR
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
  -- 00653: apply_field_effect's signature carries no prompt, and an hours
  -- report IS this prompt's claim. Handed down as a transaction-local
  -- capability, the shape 00399/00643 use for app.client_decision_write_id.
  PERFORM set_config('app.field_time_report_prompt_id',p.id::text,true);
  result := public.apply_field_effect(p.party_id,effect,'sms',m.id);
  PERFORM set_config('app.field_time_report_prompt_id','',true);
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


-- ═══════════════════════════════════════════════════════════════════════════
-- 2. S2 — public.field_time_reports: one claim, one row
-- ═══════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.field_time_reports (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The studio that owns the work. projects.studio_id is nullable on this
  -- stack, so this is too: a studio-less project still gets its ledger row.
  organization_id          uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  project_id               uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  party_id                 uuid NOT NULL,

  -- The visit the hours are about. SET NULL because a deleted task does not
  -- unsay what the crew reported.
  task_id                  uuid REFERENCES public.project_tasks(id) ON DELETE SET NULL,

  -- THE CLAIM. One ask is one proposal: the UNIQUE here is what makes a second
  -- reply to the same prompt impossible rather than merely unlikely.
  prompt_id                uuid NOT NULL UNIQUE REFERENCES public.sms_prompts(id) ON DELETE CASCADE,
  source_message_id        uuid REFERENCES public.sms_messages(id) ON DELETE SET NULL,

  reported_hours           numeric(4,2) NOT NULL,
  note                     text,
  reported_at              timestamptz NOT NULL,

  status                   text NOT NULL DEFAULT 'proposed',
  decided_by               uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decided_at               timestamptz,

  -- Attribution is a SEPARATE, EXPLICIT act (contract S4). NULL here is the
  -- normal, safe state: an accepted report with no attributed_user_id has
  -- written nothing to project_time_entries and never will.
  attributed_user_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  attributed_time_entry_id uuid REFERENCES public.project_time_entries(id) ON DELETE SET NULL,

  version                  integer NOT NULL DEFAULT 1,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT field_time_reports_hours_check
    CHECK (reported_hours >= 0 AND reported_hours <= 16),
  CONSTRAINT field_time_reports_status_check
    CHECK (status IN ('proposed', 'accepted', 'rejected')),
  CONSTRAINT field_time_reports_version_check
    CHECK (version >= 1),
  CONSTRAINT field_time_reports_note_len_check
    CHECK (note IS NULL OR length(note) <= 2000),

  -- The RPC's rules, restated where no caller can get past them. A map that
  -- only exists in the caller can be bypassed by another caller (00641).
  -- Each one is phrased so that an ON DELETE SET NULL on a nullable actor
  -- column cannot break it: those actions run as their own statements, so a
  -- CHECK that demanded decided_by IS NOT NULL would refuse a legitimate
  -- profile deletion halfway through its cascade.
  CONSTRAINT field_time_reports_proposed_shape_check
    CHECK (status <> 'proposed' OR (decided_by IS NULL AND decided_at IS NULL
           AND attributed_user_id IS NULL AND attributed_time_entry_id IS NULL)),
  CONSTRAINT field_time_reports_decided_shape_check
    CHECK (status = 'proposed' OR decided_at IS NOT NULL),
  CONSTRAINT field_time_reports_booked_shape_check
    CHECK (attributed_time_entry_id IS NULL OR status = 'accepted')
);

-- The seat must belong to the report's OWN project — the composite key 00639
-- gave sms_prompts and 00641 gave field_delivery_reports, so a report naming
-- another studio's party is not merely unreadable, it is unwritable.
DO $field_time_reports_fk$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'field_time_reports_party_project_fkey'
       AND conrelid = 'public.field_time_reports'::regclass
  ) THEN
    ALTER TABLE public.field_time_reports
      ADD CONSTRAINT field_time_reports_party_project_fkey
      FOREIGN KEY (party_id, project_id)
      REFERENCES public.project_parties (id, project_id) ON DELETE CASCADE;
  END IF;
END;
$field_time_reports_fk$;

CREATE INDEX IF NOT EXISTS idx_field_time_reports_queue
  ON public.field_time_reports (project_id, reported_at DESC)
  WHERE status = 'proposed';
CREATE INDEX IF NOT EXISTS idx_field_time_reports_party
  ON public.field_time_reports (party_id, reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_time_reports_entry
  ON public.field_time_reports (attributed_time_entry_id)
  WHERE attributed_time_entry_id IS NOT NULL;

COMMENT ON TABLE public.field_time_reports IS
  'The Field Line (00653), US-4 contract S2: one row per hours claim a trade '
  'party texted in, and the designer''s decision about it. A PROPOSAL ledger: '
  'status starts at ''proposed'' and nothing outside '
  'public.field_time_report_decide may move it. Written on the way in only by '
  'apply_field_effect (SECURITY DEFINER, service path); readable by the '
  'project''s studio. It exists because 00177:18 makes a profile-less '
  'contractor ineligible to be a project_time_entries.user_id — so the hour '
  'the field reports is a claim about the day, not a timesheet row, until '
  'somebody with a name accepts it.';
COMMENT ON COLUMN public.field_time_reports.prompt_id IS
  'The sms_prompts row that asked. UNIQUE: one ask is one claim, so a second '
  'reply to the same prompt is refused by the database '
  '(field_time_report_duplicate) rather than by whoever remembers to check.';
COMMENT ON COLUMN public.field_time_reports.reported_hours IS
  'What the crew said, 0..16, to the quarter hour or finer. Their number, '
  'unrounded and unpriced: no rate is resolved here and none is stored.';
COMMENT ON COLUMN public.field_time_reports.version IS
  'Bumped by every decision. The Desk sends the version it displayed and a '
  'stale one is refused (field_time_report_stale), so two designers cannot '
  'both settle the same report from two tabs.';
COMMENT ON COLUMN public.field_time_reports.attributed_user_id IS
  'The profile-backed teammate a designer explicitly booked these hours to, '
  'and the ONLY thing that can put a row in project_time_entries. Never '
  'derived from the party: 00177:18 needs a profile, a contractor seat is not '
  'one, and a contractor''s labour is not the designer''s hour.';
COMMENT ON COLUMN public.field_time_reports.attributed_time_entry_id IS
  'The one project_time_entries row this decision created, if any. SET NULL if '
  'that entry is later deleted: the claim and the decision outlive the entry.';

ALTER TABLE public.field_time_reports ENABLE ROW LEVEL SECURITY;

REVOKE ALL    ON public.field_time_reports FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON public.field_time_reports TO authenticated;
GRANT  ALL    ON public.field_time_reports TO service_role;

-- The membership predicate sms_review_queue reads through (00639's two
-- sms_messages SELECT policies), in the single-expression form 00641 already
-- uses for field_delivery_reports.
DROP POLICY IF EXISTS field_time_reports_team_select ON public.field_time_reports;
CREATE POLICY field_time_reports_team_select
  ON public.field_time_reports FOR SELECT
  TO authenticated
  USING (
    public.is_project_team_member(project_id)
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = field_time_reports.project_id
        AND (p.designer_id = (select auth.uid()) OR public.is_studio_comember(p.designer_id))
    )
  );
-- No INSERT/UPDATE/DELETE policy on purpose, and no table privilege for them
-- either: the way in is apply_field_effect and the way on is
-- public.field_time_report_decide.

DROP TRIGGER IF EXISTS set_updated_at_field_time_reports ON public.field_time_reports;
CREATE TRIGGER set_updated_at_field_time_reports
  BEFORE UPDATE ON public.field_time_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── The audit trail: every decision, including the ones that booked nothing ──
CREATE TABLE IF NOT EXISTS public.field_time_report_decisions (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id                uuid NOT NULL REFERENCES public.field_time_reports(id) ON DELETE CASCADE,
  version                  integer NOT NULL,
  decision                 text NOT NULL,
  decided_by               uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  attributed_user_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  attributed_time_entry_id uuid REFERENCES public.project_time_entries(id) ON DELETE SET NULL,
  decided_at               timestamptz NOT NULL DEFAULT now(),
  created_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT field_time_report_decisions_decision_check
    CHECK (decision IN ('accepted', 'rejected')),
  CONSTRAINT field_time_report_decisions_version_check
    CHECK (version >= 1),
  -- One row per version of one report: a replay cannot write a second history.
  CONSTRAINT field_time_report_decisions_report_version_uniq
    UNIQUE (report_id, version)
);

CREATE INDEX IF NOT EXISTS idx_field_time_report_decisions_report
  ON public.field_time_report_decisions (report_id, decided_at DESC);

COMMENT ON TABLE public.field_time_report_decisions IS
  'The Field Line (00653), US-4 contract S2: one row for every decision taken '
  'on a field_time_reports claim, written by '
  'public.field_time_report_decide and by nothing else. Append-only — there is '
  'no UPDATE privilege and no UPDATE policy, which is why it carries no '
  'updated_at.';
COMMENT ON COLUMN public.field_time_report_decisions.version IS
  'The version this decision STAMPED on the report (the report''s version '
  'after the bump), so the audit row and the report agree about which state '
  'each decision produced.';

ALTER TABLE public.field_time_report_decisions ENABLE ROW LEVEL SECURITY;

REVOKE ALL    ON public.field_time_report_decisions FROM PUBLIC, anon, authenticated;
GRANT  SELECT ON public.field_time_report_decisions TO authenticated;
GRANT  ALL    ON public.field_time_report_decisions TO service_role;

-- The same membership predicate, reached through the report: this table has no
-- project_id of its own and is not given one, because the report it belongs to
-- is the only thing that can say which project it is about.
DROP POLICY IF EXISTS field_time_report_decisions_team_select
  ON public.field_time_report_decisions;
CREATE POLICY field_time_report_decisions_team_select
  ON public.field_time_report_decisions FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.field_time_reports r
      WHERE r.id = field_time_report_decisions.report_id
        AND (
          public.is_project_team_member(r.project_id)
          OR EXISTS (
            SELECT 1 FROM public.projects p
            WHERE p.id = r.project_id
              AND (p.designer_id = (select auth.uid()) OR public.is_studio_comember(p.designer_id))
          )
        )
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. S3 — the way in: one proposed row, and never a time entry
-- ═══════════════════════════════════════════════════════════════════════════
-- apply_field_effect carries no prompt in its signature, and a time report IS
-- its prompt's claim. sms_apply_prompt therefore hands the prompt down in a
-- transaction-local setting, the same capability shape 00399 and 00643 use for
-- app.client_decision_write_id. Without it (a raw /field or triage call) the
-- ONE open hours ask for this party and this task is the claim, and anything
-- ambiguous is refused rather than guessed at.
CREATE OR REPLACE FUNCTION public._apply_field_hours_effect(
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
  v_org_id      uuid;
  v_target_kind text        := p_effect#>>'{target,kind}';
  v_target_id   uuid        := NULLIF(p_effect#>>'{target,id}', '')::uuid;
  v_note        text        := NULLIF(btrim(COALESCE(p_effect->>'note', '')), '');
  v_hours_raw   text        := NULLIF(btrim(COALESCE(p_effect->>'hours', '')), '');
  v_hours       numeric(4,2);
  v_hours_text  text;
  v_now         timestamptz := now();
  v_prompt      public.sms_prompts;
  v_prompt_id   uuid        := NULLIF(current_setting('app.field_time_report_prompt_id', true), '')::uuid;
  v_open        integer;
  v_title       text;
  v_report_id   uuid;
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

  -- Hours are a trade party's report about their own visit. A client (00650)
  -- never reports hours: there is no such ask on the client rail.
  IF v_party.party_kind = 'client' THEN
    RAISE EXCEPTION 'apply_field_effect: report_hours is a trade report, not a client one'
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── FORGERY GUARD: the visit belongs to the party's project ─────────────
  IF v_target_kind IS DISTINCT FROM 'task' OR v_target_id IS NULL THEN
    RAISE EXCEPTION 'apply_field_effect: report_hours needs the visit task as its target'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT t.title INTO v_title
    FROM public.project_tasks t
   WHERE t.id = v_target_id AND t.project_id = v_project_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'apply_field_effect: task % is not on party %''s project',
      v_target_id, p_party_id USING ERRCODE = 'check_violation';
  END IF;

  -- ── The number ─────────────────────────────────────────────────────────
  -- A comma decimal is what a phone keyboard often produces and what the S7
  -- grammar admits, so it is read here rather than refused here.
  IF v_hours_raw IS NULL OR v_hours_raw !~ '^[0-9]{1,2}([.,][0-9]{1,2})?$' THEN
    RAISE EXCEPTION 'apply_field_effect: report_hours needs a number of hours, got %',
      COALESCE(quote_literal(v_hours_raw), 'nothing')
      USING ERRCODE = 'check_violation';
  END IF;
  v_hours := replace(v_hours_raw, ',', '.')::numeric;

  -- ── The claim ──────────────────────────────────────────────────────────
  IF v_prompt_id IS NOT NULL THEN
    SELECT * INTO v_prompt FROM public.sms_prompts WHERE id = v_prompt_id;
    IF NOT FOUND OR v_prompt.kind IS DISTINCT FROM 'report_hours'
        OR v_prompt.party_id IS DISTINCT FROM p_party_id
        OR v_prompt.project_id IS DISTINCT FROM v_project_id
        OR v_prompt.subject_id IS DISTINCT FROM v_target_id THEN
      RAISE EXCEPTION
        'apply_field_effect: field_time_report_no_prompt — the named prompt is not this party''s open hours ask for this visit'
        USING ERRCODE = 'check_violation',
              DETAIL  = 'field_time_report_no_prompt';
    END IF;
  ELSE
    -- No min() for uuid; at count 1 the one element is the answer.
    SELECT count(*), (array_agg(id))[1] INTO v_open, v_prompt_id
      FROM public.sms_prompts
     WHERE party_id = p_party_id AND project_id = v_project_id
       AND kind = 'report_hours' AND subject_id = v_target_id
       AND answered_at IS NULL AND expires_at > clock_timestamp();
    IF v_open <> 1 THEN
      RAISE EXCEPTION
        'apply_field_effect: field_time_report_no_prompt — % open hours asks for party % on task %, need exactly one',
        v_open, p_party_id, v_target_id
        USING ERRCODE = 'check_violation',
              DETAIL  = 'field_time_report_no_prompt',
              HINT    = 'An hours report is one prompt''s claim; sms_apply_prompt names the prompt it is consuming.';
    END IF;
  END IF;

  SELECT p.studio_id INTO v_org_id FROM public.projects p WHERE p.id = v_project_id;

  BEGIN
    INSERT INTO public.field_time_reports (
      organization_id, project_id, party_id, task_id, prompt_id, source_message_id,
      reported_hours, note, reported_at
    )
    VALUES (
      v_org_id, v_project_id, p_party_id, v_target_id, v_prompt_id,
      CASE WHEN p_source = 'sms' THEN p_sms_message_id ELSE NULL END,
      v_hours, v_note, v_now
    )
    RETURNING id INTO v_report_id;
  EXCEPTION WHEN unique_violation THEN
    -- The claim is taken. One ask is one proposal, so this is refused with a
    -- stable token rather than folded into the existing row.
    RAISE EXCEPTION
      'apply_field_effect: field_time_report_duplicate — prompt % has already been claimed by an hours report',
      v_prompt_id
      USING ERRCODE = 'unique_violation',
            DETAIL  = 'field_time_report_duplicate',
            HINT    = 'A second reply to the same ask cannot open a second proposal.';
  END;

  v_hours_text := CASE WHEN v_hours = trunc(v_hours)
                       THEN trunc(v_hours)::bigint::text
                       ELSE btrim(to_char(v_hours, 'FM99990.99')) END;
  -- Remaining open work for this party, counted exactly as the delivery core
  -- and the legacy core count it (00282:437-443).
  SELECT
    (SELECT count(*) FROM public.project_tasks t
      WHERE t.owner_party_id = p_party_id AND t.status <> 'done')
    + (SELECT count(*) FROM public.client_decisions cd
      WHERE cd.court_party_id = p_party_id AND cd.status = 'pending')
    INTO v_remaining;

  v_result := jsonb_build_object(
    'applied',         true,
    'effect_type',     'report_hours',
    'summary_text',    v_hours_text || ' hours reported for "' ||
                       COALESCE(v_title, 'the visit') ||
                       '". A proposal for the studio; nothing is booked.',
    'remaining_count', v_remaining,
    'item_id',         NULL,
    'task_id',         v_target_id,
    'report_id',       v_report_id,
    'reported_hours',  v_hours,
    'source',          p_source
  );

  IF p_sms_message_id IS NOT NULL THEN
    UPDATE public.sms_messages
       SET applied_effect  = v_result,
           matched_task_id = COALESCE(v_target_id, matched_task_id)
     WHERE id = p_sms_message_id;
  END IF;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public._apply_field_hours_effect(uuid, jsonb, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._apply_field_hours_effect(uuid, jsonb, text, uuid)
  TO service_role;

COMMENT ON FUNCTION public._apply_field_hours_effect(uuid, jsonb, text, uuid) IS
  'The Field Line (00653), US-4 contract S3: the hours half of '
  'apply_field_effect. Reached ONLY through public.apply_field_effect. Writes '
  'exactly one public.field_time_reports row at status ''proposed'' and touches '
  'public.project_time_entries NEVER — not the table, not a rate, not a '
  'user_id. No 00624 grant is asked for, because reporting how long you were '
  'on site is a statement of fact, not an authority '
  '(field_effect_authority_scopes(''report_hours'') is NULL, which is also why '
  'the delivery core never sees this effect).';

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
  'public.project_time_entries.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. S4 — the decision: public.field_time_report_decide
-- ═══════════════════════════════════════════════════════════════════════════
-- THE ONE PLACE a reported hour can become a timesheet row, and only when a
-- signed-in member of the project names the teammate it belongs to. Three
-- things are deliberately NOT done here: no rate is resolved (the classifier
-- 00601 owns that), no invoice is touched, and no user_id is ever inferred
-- from the party who texted.
CREATE OR REPLACE FUNCTION public.field_time_report_decide(
  p_report_id            uuid,
  p_decision             text,
  p_expected_version     integer,
  p_attribute_to_user_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor    uuid := (select auth.uid());
  v_report   public.field_time_reports;
  v_party    text;
  v_minutes  integer;
  v_entry_id uuid;
  v_version  integer;
  v_now      timestamptz := now();
BEGIN
  IF p_decision IS NULL OR p_decision NOT IN ('accepted', 'rejected') THEN
    RAISE EXCEPTION 'field_time_report_decide: a decision is ''accepted'' or ''rejected'', not %',
      COALESCE(quote_literal(p_decision), 'nothing')
      USING ERRCODE = 'check_violation';
  END IF;

  -- ── Who is asking ──────────────────────────────────────────────────────
  -- SECURITY DEFINER, so RLS is not the gate here and the membership question
  -- is asked out loud. A report this actor cannot read is refused exactly as a
  -- report that does not exist is refused: the error must not become a way to
  -- discover that somebody else's ledger has a row with this id.
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'field_time_report_decide: field_time_report_forbidden — no signed-in actor'
      USING ERRCODE = 'insufficient_privilege',
            DETAIL  = 'field_time_report_forbidden';
  END IF;

  SELECT * INTO v_report FROM public.field_time_reports
   WHERE id = p_report_id FOR UPDATE;

  IF NOT FOUND OR NOT (
    public.is_project_team_member(v_report.project_id)
    OR EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = v_report.project_id
        AND (p.designer_id = v_actor OR public.is_studio_comember(p.designer_id))
    )
  ) THEN
    RAISE EXCEPTION
      'field_time_report_decide: field_time_report_forbidden — % is not on this report''s project', v_actor
      USING ERRCODE = 'insufficient_privilege',
            DETAIL  = 'field_time_report_forbidden';
  END IF;

  -- ── Already settled? ───────────────────────────────────────────────────
  -- Asked BEFORE the version compare-and-swap, because a settled report is
  -- settled whatever version the caller was looking at, and "this one is
  -- already decided" is the more specific thing to be told.
  IF v_report.status <> 'proposed' THEN
    RAISE EXCEPTION
      'field_time_report_decide: field_time_report_decided — report % is already %',
      p_report_id, v_report.status
      USING ERRCODE = 'check_violation',
            DETAIL  = 'field_time_report_decided';
  END IF;

  IF p_expected_version IS DISTINCT FROM v_report.version THEN
    RAISE EXCEPTION
      'field_time_report_decide: field_time_report_stale — expected version %, found %',
      p_expected_version, v_report.version
      USING ERRCODE = 'serialization_failure',
            DETAIL  = 'field_time_report_stale';
  END IF;

  -- ── Attribution, which is the only door to project_time_entries ────────
  IF p_attribute_to_user_id IS NOT NULL THEN
    IF p_decision <> 'accepted' THEN
      RAISE EXCEPTION
        'field_time_report_decide: field_time_report_bad_attribution — only an accepted report can be booked to a teammate'
        USING ERRCODE = 'check_violation',
              DETAIL  = 'field_time_report_bad_attribution';
    END IF;

    -- A member of THIS project: someone on its roster, or the designer whose
    -- project it is. A studio colleague who merely READS the project is not a
    -- booking target — 00177:18 wants the person who worked the hour, and the
    -- portal picks from the project's own people for the same reason.
    IF NOT (
      EXISTS (
        SELECT 1 FROM public.project_team_members tm
        WHERE tm.project_id = v_report.project_id
          AND tm.user_id    = p_attribute_to_user_id
          AND tm.removed_at IS NULL
      )
      OR EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = v_report.project_id
          AND p.designer_id = p_attribute_to_user_id
      )
    ) THEN
      RAISE EXCEPTION
        'field_time_report_decide: field_time_report_bad_attribution — % is not a member of this project',
        p_attribute_to_user_id
        USING ERRCODE = 'check_violation',
              DETAIL  = 'field_time_report_bad_attribution',
              HINT    = 'Hours can only be booked to a profile-backed member of the project the visit belongs to.';
    END IF;

    v_minutes := round(v_report.reported_hours * 60)::integer;
    IF v_minutes < 1 THEN
      -- 00177:20 admits only a positive duration (a NULL one is the desk's one
      -- running-timer slot). A nothing-hours report can be accepted or
      -- rejected; it cannot be booked.
      RAISE EXCEPTION
        'field_time_report_decide: field_time_report_bad_attribution — a report of % hours has no hour to book',
        v_report.reported_hours
        USING ERRCODE = 'check_violation',
              DETAIL  = 'field_time_report_bad_attribution',
              HINT    = 'Accept it as reported, or reject it: project_time_entries holds positive durations only.';
    END IF;

    SELECT pp.display_name INTO v_party
      FROM public.project_parties pp WHERE pp.id = v_report.party_id;

    -- EXACTLY ONE row, and only the columns a reported day can honestly fill.
    -- started_at is noon UTC of the reported day, which is HT-13-a's ruled
    -- convention for a DATE-ONLY entry (00608:44) — the studio timezone was
    -- declined there, so a day is a day at both offsets a US studio takes.
    -- billable is left at the table's default and no rate is named: pricing is
    -- 00601's classifier's, and payroll and invoicing are not in this story.
    INSERT INTO public.project_time_entries (
      project_id, task_id, user_id, started_at, duration_minutes, notes, source
    )
    VALUES (
      v_report.project_id,
      v_report.task_id,
      p_attribute_to_user_id,
      (((v_report.reported_at AT TIME ZONE 'UTC')::date + time '12:00') AT TIME ZONE 'UTC'),
      v_minutes,
      'Reported by text by ' || COALESCE(v_party, 'the trade'),
      'field_manual'
    )
    RETURNING id INTO v_entry_id;
  END IF;

  v_version := v_report.version + 1;

  UPDATE public.field_time_reports
     SET status                   = p_decision,
         decided_by               = v_actor,
         decided_at               = v_now,
         attributed_user_id       = p_attribute_to_user_id,
         attributed_time_entry_id = v_entry_id,
         version                  = v_version
   WHERE id = p_report_id;

  -- Every decision, including the ones that booked nothing.
  INSERT INTO public.field_time_report_decisions (
    report_id, version, decision, decided_by,
    attributed_user_id, attributed_time_entry_id, decided_at
  )
  VALUES (
    p_report_id, v_version, p_decision, v_actor,
    p_attribute_to_user_id, v_entry_id, v_now
  );

  RETURN jsonb_build_object(
    'report_id',                p_report_id,
    'status',                   p_decision,
    'version',                  v_version,
    'decided_by',               v_actor,
    'decided_at',               v_now,
    'reported_hours',           v_report.reported_hours,
    'attributed_user_id',       p_attribute_to_user_id,
    'attributed_time_entry_id', v_entry_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.field_time_report_decide(uuid, text, integer, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.field_time_report_decide(uuid, text, integer, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.field_time_report_decide(uuid, text, integer, uuid) IS
  'The Field Line (00653), US-4 contract S4: a designer''s decision on one '
  'reported-hours claim. SECURITY DEFINER with a pinned search_path and an '
  'explicit auth.uid() membership check (field_time_report_forbidden), '
  'proposed -> accepted|rejected only (field_time_report_decided), a version '
  'compare-and-swap (field_time_report_stale), and one audit row every time. '
  'It writes EXACTLY ONE project_time_entries row, and only when the caller '
  'names a profile-backed member of the project to book the hours to '
  '(field_time_report_bad_attribution otherwise); with no attribution it '
  'writes none, ever. authenticated only — service_role has no auth.uid() and '
  'this decision is a person''s.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. S5 — public.field_time_report_queue: what the Desk asks for
-- ═══════════════════════════════════════════════════════════════════════════
-- SECURITY INVOKER, like sms_review_queue: the ledger's own policy is the only
-- tenant predicate, so a studio cannot see another studio's proposals, and the
-- party''s name is resolved the way the review queue resolves it.
CREATE OR REPLACE VIEW public.field_time_report_queue
  WITH (security_invoker = true) AS
SELECT
  r.id,
  r.organization_id,
  r.project_id,
  pr.name AS project_name,
  r.party_id,
  pp.display_name AS party_name,
  r.task_id,
  t.title AS task_title,
  r.reported_hours,
  r.note,
  r.reported_at,
  r.version
FROM public.field_time_reports r
LEFT JOIN public.projects pr       ON pr.id = r.project_id
LEFT JOIN public.project_parties pp ON pp.id = r.party_id
LEFT JOIN public.project_tasks t    ON t.id  = r.task_id
WHERE r.status = 'proposed';

COMMENT ON VIEW public.field_time_report_queue IS
  'The Field Line (00653), US-4 contract S5: the Desk''s undecided hours '
  'claims across the projects the viewer is on. SECURITY INVOKER — '
  'field_time_reports'' own SELECT policy scopes every row. Proposals only: a '
  'decided report leaves the queue and stays in the ledger.';

REVOKE ALL   ON public.field_time_report_queue FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.field_time_report_queue TO authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. S6 — the evening ask
-- ═══════════════════════════════════════════════════════════════════════════
-- Budget, in SEPTETS, measured the way 00645 measures its two cards: two GSM-7
-- segments is 306 and the closing line spends 63 plus its separating space.
--   sms_hours_prompt  70 literal + 63 parameters (studio 24, address 36,
--                     code 3) + 64 closing = 197
-- ONE DEVIATION FROM THE CONTRACT'S LITERAL COPY, REPORTED NOT IMPROVISED: the
-- contract writes "6.5 — Ref" with an em dash. U+2014 is not in GSM-7 at all,
-- so a body carrying it is sent as UCS-2 (70 characters a segment) and the same
-- sentence the contract asks to fit in two GSM-7 segments cannot fit in three.
-- The hyphen is the GSM-7 character that keeps the words, the order and the
-- rhythm the contract wrote; every other byte is the contract's.
-- No link: a crew answering with a number needs neither.
-- THE CLOSING LINE IS NOT WRITTEN HERE. It is defined once, in 00641, and read
-- back out of the row 00641 shipped (sms_selection, whose head is exactly
-- '{{selection}}'), so a second literal cannot drift from the first.
DO $field_line_hours_copy$
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
    RAISE EXCEPTION '00653: the canonical Field Line closing line could not be read from the sms_selection template seeded by 00641 (got %); it is defined there and nowhere else, so apply 00641 first',
      COALESCE(quote_literal(v_closing), 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_row IN
    -- <<< FIELD LINE HOURS COPY BLOCK (same shape as 00645's trade copy block)
    SELECT * FROM (VALUES
      ('sms_hours_prompt',
       'Field SMS - Hours ask (evening of the visit)',
       '{{studio}}: How many hours today at {{address}}? Reply with a number, like 6 or 6.5 - Ref {{code}}.',
       '["studio","address","code"]')
    ) AS t(slug, name, head, vars)
    -- >>> FIELD LINE HOURS COPY BLOCK
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
$field_line_hours_copy$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Postconditions — the claims this file makes, checked where it makes them
-- ═══════════════════════════════════════════════════════════════════════════
DO $field_time_reports_postconditions$
BEGIN
  -- S1: the kind is admitted, and it answers about a task.
  ASSERT public.field_effect_authority_scopes('report_hours') IS NULL,
    '00653: report_hours must NOT be a Field Line delivery effect — a NULL scope answer is what keeps the delivery core and its 00624 gate out of the hours path';

  -- The ledger is readable by a studio and writable by nobody with a session.
  ASSERT NOT has_table_privilege('authenticated', 'public.field_time_reports', 'INSERT')
     AND NOT has_table_privilege('authenticated', 'public.field_time_reports', 'UPDATE')
     AND NOT has_table_privilege('authenticated', 'public.field_time_reports', 'DELETE')
     AND has_table_privilege('authenticated', 'public.field_time_reports', 'SELECT'),
    '00653: authenticated may read the hours ledger and may not write it';
  ASSERT NOT has_table_privilege('authenticated', 'public.field_time_report_decisions', 'INSERT')
     AND NOT has_table_privilege('authenticated', 'public.field_time_report_decisions', 'UPDATE')
     AND has_table_privilege('authenticated', 'public.field_time_report_decisions', 'SELECT'),
    '00653: the decision audit is append-only through the RPC';
  ASSERT NOT has_table_privilege('anon', 'public.field_time_reports', 'SELECT')
     AND NOT has_table_privilege('anon', 'public.field_time_report_queue', 'SELECT'),
    '00653: anon reads no part of the hours ledger';
  ASSERT has_function_privilege('authenticated',
      'public.field_time_report_decide(uuid,text,integer,uuid)', 'EXECUTE')
     AND NOT has_function_privilege('anon',
      'public.field_time_report_decide(uuid,text,integer,uuid)', 'EXECUTE')
     AND NOT has_function_privilege('service_role',
      'public.field_time_report_decide(uuid,text,integer,uuid)', 'EXECUTE'),
    '00653: the decision is a signed-in person''s, not a service''s';

  -- project_time_entries is untouched as a matter of policy, not of luck.
  ASSERT (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'project_time_entries'
             AND policyname LIKE '%field_time%') = 0,
    '00653: project_time_entries RLS is not this file''s business';
END
$field_time_reports_postconditions$;
