-- The Field Line trade rail (00645). LOCAL ONLY, synthetic, and never pointed at
-- production or at a shared schema that is not the candidate.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/<disposable>" -X \
--     -v ON_ERROR_STOP=1 -f supabase/tests/field/sms_trade_prompts_test.sql
--
-- Part A is one transaction and is ROLLED BACK: the caps, the local-day reset
-- across a DST change, the dead end and its one owner, the two new prompt kinds,
-- the reply-verb matrix, the copy, and the grants.
--
-- Part B COMMITS, because the thing it proves cannot be proved inside one
-- transaction: two real sessions racing for the last slot of a party's daily
-- budget. It opens a second session with dblink, blocks it on the context row,
-- and then cleans up everything it wrote and asserts that it did.
\set ON_ERROR_STOP on

-- The second session's password. Local dev credentials only (the same
-- postgres/postgres every other test in this tree documents); override with
-- `-v second_session_password=…` if your local stack differs.
\if :{?second_session_password}
\else
  \set second_session_password postgres
\endif

-- ════════════════════════════════════════════════════════════════════════════
-- PART A — one session, rolled back
-- ════════════════════════════════════════════════════════════════════════════
BEGIN;
SET LOCAL statement_timeout='60s';

INSERT INTO auth.users(id,email) VALUES ('64500000-0000-4000-8000-000000000001','sq12@test.invalid');
INSERT INTO profiles(id,email,full_name) VALUES ('64500000-0000-4000-8000-000000000001','sq12@test.invalid','Synthetic lead') ON CONFLICT DO NOTHING;
INSERT INTO organizations(id,type,name,slug,status) VALUES
 ('64500000-0000-4000-8000-000000000010','design_studio','Trade rail test','sq12-trade','active');
INSERT INTO organization_members(user_id,organization_id,role,status) VALUES
 ('64500000-0000-4000-8000-000000000001','64500000-0000-4000-8000-000000000010','owner','active');
INSERT INTO projects(id,name,designer_id,created_by,studio_id) VALUES
 ('64500000-0000-4000-8000-000000000020','Trade project','64500000-0000-4000-8000-000000000001','64500000-0000-4000-8000-000000000001','64500000-0000-4000-8000-000000000010');
INSERT INTO project_parties(id,project_id,party_kind,display_name,phone) VALUES
 ('64500000-0000-4000-8000-000000000030','64500000-0000-4000-8000-000000000020','sub','Synthetic trade','+15555120000'),
 ('64500000-0000-4000-8000-000000000031','64500000-0000-4000-8000-000000000020','installer','Other trade','+15555120001');
INSERT INTO project_tasks(id,project_id,title,owner,owner_party_id,status,due_date) VALUES
 ('64500000-0000-4000-8000-000000000040','64500000-0000-4000-8000-000000000020','Install mantel','sub','64500000-0000-4000-8000-000000000030','todo','2026-11-01');
INSERT INTO sms_conversations(id,twilio_number,phone_e164) VALUES
 ('64500000-0000-4000-8000-000000000050','+15555129999','+15555120000'),
 ('64500000-0000-4000-8000-000000000051','+15555129999','+15555120001');
INSERT INTO studio_channel_consent(organization_id,channel_kind,channel_value,status,source,evidence,disclosure_version,recorded_by) VALUES
 ('64500000-0000-4000-8000-000000000010','sms','+15555120000','granted','web_form','Synthetic consent','test-v1','64500000-0000-4000-8000-000000000001');
INSERT INTO project_party_authority(engagement_id,scope,effective_from) VALUES
 ('64500000-0000-4000-8000-000000000030','site_access',CURRENT_DATE-1),
 ('64500000-0000-4000-8000-000000000030','schedule',CURRENT_DATE-1);

-- ── A1. The columns 00645 adds, and their shape ─────────────────────────────
DO $a1$
DECLARE c record;
BEGIN
  FOR c IN SELECT * FROM (VALUES
      ('budget_local_day','date',true),
      ('budget_recurring_used','smallint',false),
      ('budget_events_used','smallint',false),
      ('dead_end_prompt_id','uuid',true),
      ('dead_end_at','timestamp with time zone',true),
      ('dead_end_owner_user_id','uuid',true)
    ) v(name,type,nullable)
  LOOP
    ASSERT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='sms_conversation_context'
        AND column_name=c.name AND data_type=c.type
        AND is_nullable=CASE WHEN c.nullable THEN 'YES' ELSE 'NO' END),
      format('00645 column %s %s (nullable %s)', c.name, c.type, c.nullable);
  END LOOP;
  -- The counters are counted, never guessed: a row that has never spent
  -- anything reads zero rather than NULL.
  ASSERT (SELECT column_default LIKE '0%' FROM information_schema.columns
    WHERE table_schema='public' AND table_name='sms_conversation_context'
      AND column_name='budget_events_used'), 'events_used defaults to zero';
END $a1$;

-- ── A2. The caps: one recurring text a day, three event texts ───────────────
CREATE FUNCTION pg_temp.claim(day date, class text DEFAULT 'event',
  conv uuid DEFAULT '64500000-0000-4000-8000-000000000050',
  party uuid DEFAULT '64500000-0000-4000-8000-000000000030') RETURNS jsonb
LANGUAGE sql AS $$
  SELECT public.sms_claim_party_budget(conv,'64500000-0000-4000-8000-000000000020',party,day,class);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.claim(date, text, uuid, uuid) TO PUBLIC;

DO $a2$
DECLARE r jsonb; d date := '2026-11-01';
BEGIN
  r := pg_temp.claim(d); ASSERT (r->>'claimed')::boolean AND (r->>'events_used')::int=1, 'first event text: '||r::text;
  r := pg_temp.claim(d); ASSERT (r->>'claimed')::boolean AND (r->>'events_used')::int=2, 'second event text: '||r::text;
  r := pg_temp.claim(d); ASSERT (r->>'claimed')::boolean AND (r->>'events_used')::int=3, 'third event text: '||r::text;
  -- The fourth thing that happens today is not a fourth text.
  r := pg_temp.claim(d);
  ASSERT (r->>'claimed')::boolean IS FALSE AND r->>'reason'='budget', 'fourth event text is refused: '||r::text;
  ASSERT (SELECT budget_events_used=3 FROM public.sms_conversation_context
    WHERE conversation_id='64500000-0000-4000-8000-000000000050'
      AND project_id='64500000-0000-4000-8000-000000000020'),
    'and the refusal spent nothing';

  -- The digest is its own promise ("~1 msg/day"), so it has its own cap and the
  -- event texts did not eat it.
  r := pg_temp.claim(d,'recurring');
  ASSERT (r->>'claimed')::boolean AND (r->>'recurring_used')::int=1, 'the digest still has its slot: '||r::text;
  r := pg_temp.claim(d,'recurring');
  ASSERT (r->>'claimed')::boolean IS FALSE AND r->>'reason'='budget', 'and only one: '||r::text;

  -- Another party on another conversation has their own day.
  r := pg_temp.claim(d,'event','64500000-0000-4000-8000-000000000051','64500000-0000-4000-8000-000000000031');
  ASSERT (r->>'claimed')::boolean AND (r->>'events_used')::int=1, 'budgets are per party: '||r::text;

  -- Neither class is a free-text field, and a day is required.
  BEGIN r := pg_temp.claim(d,'whatever'); ASSERT false,'unknown class must be refused';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN r := pg_temp.claim(NULL::date); ASSERT false,'a claim without a local day must be refused';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $a2$;

-- ── A3. The local day is FIELD_TZ's day, across the change ──────────────────
DO $a3$
DECLARE r jsonb; tz text := 'America/Chicago';
  fallback_morning timestamptz := '2026-11-01T05:30:00Z';   -- 00:30 CDT
  twenty_four_later timestamptz := '2026-11-02T05:30:00Z';  -- 23:30 CST, SAME day
  next_day timestamptz := '2026-11-02T06:30:00Z';           -- 00:30 CST, next day
  spring_eve timestamptz := '2026-03-08T05:30:00Z';         -- 23:30 CST on the 7th
BEGIN
  -- The fact the rail depends on: a Chicago day is 23 or 25 hours long twice a
  -- year, so "a day later" is not "86,400 seconds later".
  ASSERT (fallback_morning AT TIME ZONE tz)::date = DATE '2026-11-01', 'the fall-back morning';
  ASSERT (twenty_four_later AT TIME ZONE tz)::date = DATE '2026-11-01', '24 UTC hours later is the same LOCAL day';
  ASSERT (next_day AT TIME ZONE tz)::date = DATE '2026-11-02', 'and the next local day is 25 hours out';
  ASSERT (spring_eve AT TIME ZONE tz)::date = DATE '2026-03-07', 'the evening before spring forward';

  -- Driven with those days, the counters reset on the ZONE's boundary. The
  -- party above already spent all three event slots on 2026-11-01.
  r := pg_temp.claim((twenty_four_later AT TIME ZONE tz)::date);
  ASSERT (r->>'claimed')::boolean IS FALSE AND r->>'reason'='budget',
    '24 hours after the first text is still today, so still over budget: '||r::text;
  r := pg_temp.claim((next_day AT TIME ZONE tz)::date);
  ASSERT (r->>'claimed')::boolean AND (r->>'events_used')::int=1 AND r->>'local_day'='2026-11-02',
    'the zone''s next day resets the counters: '||r::text;
  -- And the reset is a reset, not an accumulation.
  ASSERT (SELECT budget_recurring_used=0 FROM public.sms_conversation_context
    WHERE conversation_id='64500000-0000-4000-8000-000000000050'
      AND project_id='64500000-0000-4000-8000-000000000020'),
    'yesterday''s digest slot does not carry over';
END $a3$;

-- ── A4. The two new prompt kinds, and their frozen daily identity ───────────
CREATE FUNCTION pg_temp.prompt(kind text, version integer DEFAULT 20261101,
  subject uuid DEFAULT '64500000-0000-4000-8000-000000000040',
  expires timestamptz DEFAULT NULL) RETURNS public.sms_prompts
LANGUAGE plpgsql AS $$
DECLARE i uuid; p public.sms_prompts;
BEGIN
  SELECT id INTO i FROM public.sms_create_prompt('64500000-0000-4000-8000-000000000030',
    '64500000-0000-4000-8000-000000000020',kind,subject,version,
    COALESCE(expires,clock_timestamp()+interval '1 day'),'+15555129999','+15555120000',NULL);
  SELECT * INTO p FROM public.sms_prompts WHERE id=i;
  RETURN p;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.prompt(text, integer, uuid, timestamptz) TO PUBLIC;

CREATE FUNCTION pg_temp.message(body text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE i uuid:=gen_random_uuid(); BEGIN
  INSERT INTO public.sms_messages(id,conversation_id,direction,body,twilio_sid)
  VALUES(i,'64500000-0000-4000-8000-000000000050','inbound',body,'SM'||replace(i::text,'-',''));
  RETURN i;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.message(text) TO PUBLIC;

/** Close every open prompt on the pair: the codeless door needs one question. */
CREATE FUNCTION pg_temp.close_open() RETURNS void LANGUAGE sql AS $$
  UPDATE public.sms_prompts SET answered_at=clock_timestamp()
  WHERE recipient_phone='+15555120000' AND answered_at IS NULL;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.close_open() TO PUBLIC;

DO $a4$
DECLARE p public.sms_prompts; again public.sms_prompts; k text;
BEGIN
  FOREACH k IN ARRAY ARRAY['site_card','day_of'] LOOP
    PERFORM pg_temp.close_open();
    p := pg_temp.prompt(k);
    ASSERT p.id IS NOT NULL AND p.short_code ~ '^[0-9]{2,3}$', k||' is an admitted kind with a ref';
    ASSERT p.kind=k AND p.subject_id='64500000-0000-4000-8000-000000000040' AND p.version=20261101,
      k||' is bound to the visit''s own task and day';
    -- The day's identity is frozen: a retry is the SAME question, not a second.
    again := pg_temp.prompt(k);
    ASSERT again.id=p.id, k||' reuses the open ref for its own day';
  END LOOP;
  PERFORM pg_temp.close_open();
END $a4$;

-- ── A5. What the printed words mean, and what they refuse to mean ───────────
CREATE FUNCTION pg_temp.apply(p public.sms_prompts,m uuid,e jsonb) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT public.sms_apply_prompt(p.id,'+15555129999','+15555120000',m,e);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.apply(public.sms_prompts, uuid, jsonb) TO PUBLIC;

CREATE FUNCTION pg_temp.effect(kind text, extra jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT jsonb_build_object('type',kind,'note','from the fixture',
    'target',jsonb_build_object('kind','task','id','64500000-0000-4000-8000-000000000040')) || extra;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.effect(text, jsonb) TO PUBLIC;

DO $a5_reading$
DECLARE trade public.sms_prompts; daily public.sms_prompts; wrong text;
BEGIN
  -- The trade reading belongs to the prompt whose own copy printed the words.
  PERFORM pg_temp.close_open();
  trade := pg_temp.prompt('day_of',20261102);
  ASSERT public.sms_prompt_reply_verb(trade,'ON MY WAY')='HERE', 'ON MY WAY is an arrival';
  ASSERT public.sms_prompt_reply_verb(trade,'on my way!')='HERE', 'and the crew may shout it';
  ASSERT public.sms_prompt_reply_verb(trade,'HERE')='HERE', 'so is HERE';
  ASSERT public.sms_prompt_reply_verb(trade,'LATE 20')='LATE', 'LATE 20 is a delay, not reference 20';
  ASSERT public.sms_prompt_reply_verb(trade,'late 45 min')='LATE', 'with or without the unit';
  ASSERT public.sms_prompt_reply_verb(trade,'PROBLEM')='PROBLEM', 'PROBLEM on its own';
  ASSERT public.sms_prompt_reply_verb(trade,'PROBLEM gate is locked')='PROBLEM', 'and with what is wrong after it';
  ASSERT public.sms_prompt_reply_verb(trade,'DONE')='DONE', 'DONE closes the visit here';

  PERFORM pg_temp.close_open();
  daily := pg_temp.prompt('mark_done',20261103);
  -- Off the trade card those words are not a vocabulary at all: the reader
  -- refuses them outright rather than guessing which question they answer.
  BEGIN
    PERFORM public.sms_prompt_reply_verb(daily,'ON MY WAY');
    ASSERT false,'a digest question was never asked in those words';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.sms_prompt_reply_verb(daily,'PROBLEM gate is locked');
    ASSERT false,'nor in those';
  EXCEPTION WHEN check_violation THEN NULL; END;
  -- And the number after LATE goes back to meaning a REFERENCE the moment the
  -- card that printed minutes is not the card being answered. That precedence
  -- is the whole of 00645's grammar change, so it is asserted in both places.
  wrong := CASE WHEN daily.short_code='20' THEN '21' ELSE '20' END;
  BEGIN
    PERFORM public.sms_prompt_reply_verb(daily,'LATE '||wrong);
    ASSERT false,'a digest reads the number as a reference, and refuses a wrong one';
  EXCEPTION WHEN check_violation THEN NULL; END;
  ASSERT public.sms_prompt_reply_verb(daily,'LATE '||daily.short_code)='LATE',
    'while its own reference is read the way it always was';
  ASSERT public.sms_prompt_reply_verb(daily,'DONE')='DONE',
    'and DONE still means what it has always meant on a digest';
  PERFORM pg_temp.close_open();
END $a5_reading$;

DO $a5_matrix$
DECLARE p public.sms_prompts; m uuid; r jsonb; before_reports jsonb; v integer := 20261110;
  before_inspections integer; before_pos integer;
BEGIN
  -- Baseline counts, not zero: dev-seed data (procurement_receiving_dev.sql)
  -- already carries receiving_inspections/purchase_orders rows unrelated to
  -- this fixture, so "none written" below is asserted as no *change* against
  -- this snapshot rather than an absolute zero.
  SELECT count(*) INTO before_inspections FROM public.receiving_inspections;
  SELECT count(*) INTO before_pos FROM public.purchase_orders;

  -- ARRIVAL, DELAY, PROBLEM, DEPARTURE — each through the real door, each
  -- against the visit's own task.
  PERFORM pg_temp.close_open();
  p := pg_temp.prompt('day_of',v); m := pg_temp.message('ON MY WAY');
  SET LOCAL ROLE service_role; r := pg_temp.apply(p,m,pg_temp.effect('report_arrival')); RESET ROLE;
  ASSERT r->>'status'='applied', 'ON MY WAY files an arrival: '||r::text;

  PERFORM pg_temp.close_open();
  p := pg_temp.prompt('day_of',v+1); m := pg_temp.message('LATE 20');
  SET LOCAL ROLE service_role;
  r := pg_temp.apply(p,m,pg_temp.effect('report_delay',jsonb_build_object('note','Running about 20 minutes late.')));
  RESET ROLE;
  ASSERT r->>'status'='applied', 'LATE 20 files a delay: '||r::text;

  PERFORM pg_temp.close_open();
  p := pg_temp.prompt('day_of',v+2); m := pg_temp.message('PROBLEM gate is locked');
  SET LOCAL ROLE service_role;
  r := pg_temp.apply(p,m,pg_temp.effect('report_condition',
    jsonb_build_object('condition',jsonb_build_object('ok',false,'note','gate is locked'))));
  RESET ROLE;
  ASSERT r->>'status'='applied', 'PROBLEM files a not-ok condition: '||r::text;

  PERFORM pg_temp.close_open();
  p := pg_temp.prompt('day_of',v+3); m := pg_temp.message('DONE');
  SET LOCAL ROLE service_role; r := pg_temp.apply(p,m,pg_temp.effect('report_departure')); RESET ROLE;
  ASSERT r->>'status'='applied', 'DONE files a departure: '||r::text;

  -- NONE OF IT IS A RECEIPT FOR GOODS. What the four words wrote is one
  -- presence record against a TASK: arrived, left, a condition that is not ok.
  ASSERT (SELECT count(*)=1 FROM public.field_delivery_reports), 'one report for the visit';
  ASSERT (SELECT subject_kind='task' AND subject_id='64500000-0000-4000-8000-000000000040'
      AND arrived_at IS NOT NULL AND left_at IS NOT NULL AND condition_ok IS FALSE
    FROM public.field_delivery_reports),
    'presence and condition, against the visit''s own task';
  ASSERT (SELECT count(*)=before_inspections FROM public.receiving_inspections), 'no receiving inspection';
  ASSERT (SELECT count(*)=before_pos FROM public.purchase_orders), 'and no purchase order was even involved';

  -- The refusals. Each one raises 23514 and writes nothing.
  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') INTO before_reports FROM public.field_delivery_reports t;
  PERFORM pg_temp.close_open();
  p := pg_temp.prompt('day_of',v+4); m := pg_temp.message('DONE');
  BEGIN
    SET LOCAL ROLE service_role; r := pg_temp.apply(p,m,pg_temp.effect('confirm_delivery')); RESET ROLE;
    ASSERT false, 'DONE must never confirm a delivery';
  EXCEPTION WHEN check_violation THEN RESET ROLE; END;

  PERFORM pg_temp.close_open();
  p := pg_temp.prompt('day_of',v+5); m := pg_temp.message('PROBLEM');
  BEGIN
    SET LOCAL ROLE service_role;
    r := pg_temp.apply(p,m,pg_temp.effect('report_condition',
      jsonb_build_object('condition',jsonb_build_object('ok',true,'note','fine'))));
    RESET ROLE;
    ASSERT false, 'PROBLEM is not an ok condition';
  EXCEPTION WHEN check_violation THEN RESET ROLE; END;

  PERFORM pg_temp.close_open();
  p := pg_temp.prompt('mark_done',v+6); m := pg_temp.message('ON MY WAY');
  BEGIN
    SET LOCAL ROLE service_role; r := pg_temp.apply(p,m,pg_temp.effect('report_arrival')); RESET ROLE;
    ASSERT false, 'a digest question cannot be answered with a word it never printed';
  EXCEPTION WHEN check_violation THEN RESET ROLE; END;

  ASSERT (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]')=before_reports
    FROM public.field_delivery_reports t), 'the refusals wrote nothing';
  PERFORM pg_temp.close_open();
END $a5_matrix$;

-- ── A6. A dead end has an owner, once ───────────────────────────────────────
-- A6 runs on the OTHER party, and writes created_at by hand. Inside ONE
-- transaction every default created_at is now(), while A5's applies stamped
-- answered_at with clock_timestamp() — later than now() — so no streak can be
-- built here through the real door. Production never has that problem: one send
-- is one transaction. What is under test is the gate's arithmetic, so its rows
-- are written the way a clock would have written them.
CREATE FUNCTION pg_temp.ask(code text, kind text, version integer, age interval)
RETURNS public.sms_prompts LANGUAGE sql AS $$
  INSERT INTO public.sms_prompts(project_id,party_id,sender_number,recipient_phone,
    kind,subject_id,version,short_code,expires_at,created_at)
  VALUES('64500000-0000-4000-8000-000000000020','64500000-0000-4000-8000-000000000031','+15555129999','+15555120001',kind,'64500000-0000-4000-8000-000000000040',version,
    code,clock_timestamp()+interval '1 day',clock_timestamp()-age)
  RETURNING *;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.ask(text, text, integer, interval) TO PUBLIC;

CREATE FUNCTION pg_temp.gate() RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.sms_party_prompt_gate('64500000-0000-4000-8000-000000000051','64500000-0000-4000-8000-000000000020','64500000-0000-4000-8000-000000000031');
$$;
GRANT EXECUTE ON FUNCTION pg_temp.gate() TO PUBLIC;

CREATE FUNCTION pg_temp.unpause() RETURNS void LANGUAGE sql AS $$
  UPDATE public.sms_conversation_context SET paused_until=NULL
   WHERE conversation_id='64500000-0000-4000-8000-000000000051' AND project_id='64500000-0000-4000-8000-000000000020';
$$;
GRANT EXECUTE ON FUNCTION pg_temp.unpause() TO PUBLIC;

DO $a6$
DECLARE r jsonb; first_ask public.sms_prompts; second_ask public.sms_prompts;
  third_ask public.sms_prompts; outbound uuid := gen_random_uuid();
BEGIN
  -- The rail has said something the party can see; the handoff lands on it.
  INSERT INTO public.sms_messages(id,conversation_id,direction,body,twilio_sid,party_id,project_id)
  VALUES(outbound,'64500000-0000-4000-8000-000000000051','outbound','Tomorrow 8-10 at the house.','SMa6out','64500000-0000-4000-8000-000000000031','64500000-0000-4000-8000-000000000020');

  r := pg_temp.gate();
  ASSERT (r->>'allowed')::boolean AND (r->>'unanswered')::int=0,
    'a party with no open question may be asked: '||r::text;

  first_ask := pg_temp.ask('11','site_card',20261201,interval '2 days');
  r := pg_temp.gate();
  ASSERT (r->>'allowed')::boolean AND (r->>'unanswered')::int=1,
    'one quiet day is not a dead end: '||r::text;

  -- A digest line is an offer to close a task, not a question anybody owes an
  -- answer to, so it never counts toward the silence.
  PERFORM pg_temp.ask('13','mark_done',20261201,interval '1 day');
  r := pg_temp.gate();
  ASSERT (r->>'allowed')::boolean AND (r->>'unanswered')::int=1,
    'a digest line is not a question: '||r::text;

  second_ask := pg_temp.ask('12','day_of',20261202,interval '1 day');
  r := pg_temp.gate();
  ASSERT (r->>'allowed')::boolean IS FALSE AND r->>'reason'='dead_end'
    AND (r->>'handoff')::boolean AND (r->>'unanswered')::int=2
    AND r->>'prompt_id'=first_ask.id::text
    AND r->>'owner_user_id'='64500000-0000-4000-8000-000000000001'
    AND r->>'review_message_id'=outbound::text
    AND (r->>'paused_until')::timestamptz > clock_timestamp(),
    'two unanswered questions is a person to call, and the lead owns it: '||r::text;
  ASSERT (SELECT dead_end_prompt_id=first_ask.id AND dead_end_at IS NOT NULL
      AND dead_end_owner_user_id='64500000-0000-4000-8000-000000000001'
      AND paused_until > clock_timestamp()
    FROM public.sms_conversation_context
    WHERE conversation_id='64500000-0000-4000-8000-000000000051' AND project_id='64500000-0000-4000-8000-000000000020'),
    'the dead end is recorded on the thread, keyed on the OLDEST silence';
  ASSERT (SELECT count(*)=1 FROM public.sms_messages
    WHERE conversation_id='64500000-0000-4000-8000-000000000051' AND needs_review
      AND owner_user_id='64500000-0000-4000-8000-000000000001'),
    'exactly one message is flagged for the lead';
  -- This party has only ever been TEXTED, so the flagged row is OUTBOUND, and
  -- 00639's queue listed inbound work only: the handoff existed, had an owner,
  -- paused the rail, and appeared to nobody. 00645 widens the view to any row
  -- that has been ASSIGNED an owner, so the designer the gate named can see the
  -- thing they are being asked to call about. Tenant scope is asserted as two
  -- real members in A6b; this is the predicate itself.
  ASSERT (SELECT direction='outbound' FROM public.sms_messages WHERE id=outbound);
  ASSERT EXISTS (SELECT 1 FROM public.sms_review_queue WHERE id=outbound),
    'the owned outbound handoff IS listed (00645 widened 00639''s inbound filter)';
  -- And the queue is still a work list, not a log: a needs_review row nobody has
  -- claimed is not listed just for being outbound.
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.sms_review_queue q
     WHERE q.direction='outbound' AND q.owner_user_id IS NULL),
    'an unowned outbound row is not in anybody''s queue';

  -- The next ask meets the pause the handoff itself wrote.
  r := pg_temp.gate();
  ASSERT (r->>'allowed')::boolean IS FALSE AND r->>'reason'='paused'
    AND r->>'owner_user_id'='64500000-0000-4000-8000-000000000001',
    'the pause refuses every ask after it, and still names the owner: '||r::text;
  ASSERT (SELECT count(*)=1 FROM public.sms_messages
    WHERE conversation_id='64500000-0000-4000-8000-000000000051' AND needs_review),
    'and no second handoff is filed';

  -- Even with the pause lifted, and a THIRD question added to the same silence,
  -- the same dead end is not handed off twice.
  PERFORM pg_temp.unpause();
  third_ask := pg_temp.ask('14','day_of',20261203,interval '1 hour');
  r := pg_temp.gate();
  ASSERT (r->>'allowed')::boolean IS FALSE AND r->>'reason'='dead_end'
    AND (r->>'handoff')::boolean IS FALSE AND (r->>'unanswered')::int=3
    AND r->>'prompt_id'=first_ask.id::text,
    'the same dead end is already owned: '||r::text;
  ASSERT (SELECT count(*)=1 FROM public.sms_messages
    WHERE conversation_id='64500000-0000-4000-8000-000000000051' AND needs_review),
    'still one handoff';

  -- Answering is what reopens the rail: the streak is measured from the reply.
  UPDATE public.sms_prompts SET answered_at=clock_timestamp()
   WHERE id IN (first_ask.id,second_ask.id,third_ask.id);
  PERFORM pg_temp.unpause();
  r := pg_temp.gate();
  ASSERT (r->>'allowed')::boolean AND (r->>'unanswered')::int=0,
    'a party who answered is not still a dead end: '||r::text;
END $a6$;

-- ── A6b. The handoff reaches its own studio, and no other ───────────────────
-- sms_review_queue is SECURITY INVOKER: 00639's project-scoped sms_messages
-- policies are the ONLY tenant predicate in it, so widening the direction filter
-- has to be asked as two real members rather than as the superuser who bypasses
-- RLS. A second studio, with its own active owner, is what "no other" means here.
INSERT INTO auth.users(id,email) VALUES
 ('64500000-0000-4000-8000-000000000002','sq12-other@test.invalid');
INSERT INTO profiles(id,email,full_name) VALUES
 ('64500000-0000-4000-8000-000000000002','sq12-other@test.invalid','Another studio''s lead')
 ON CONFLICT DO NOTHING;
INSERT INTO organizations(id,type,name,slug,status) VALUES
 ('64500000-0000-4000-8000-000000000011','design_studio','Other studio','sq12-other','active');
INSERT INTO organization_members(user_id,organization_id,role,status) VALUES
 ('64500000-0000-4000-8000-000000000002','64500000-0000-4000-8000-000000000011','owner','active');

DO $a6b$
DECLARE v_handoff uuid; v_claims text := current_setting('request.jwt.claims', true);
BEGIN
  SELECT id INTO v_handoff FROM public.sms_messages
   WHERE conversation_id='64500000-0000-4000-8000-000000000051'
     AND needs_review AND owner_user_id='64500000-0000-4000-8000-000000000001';
  ASSERT v_handoff IS NOT NULL, 'A6 left an owned handoff to look for';

  -- The project's own designer, who is the lead the gate named.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"64500000-0000-4000-8000-000000000001","role":"authenticated"}', true);
  ASSERT EXISTS (SELECT 1 FROM public.sms_review_queue
    WHERE id=v_handoff AND direction='outbound'
      AND owner_user_id='64500000-0000-4000-8000-000000000001'),
    'the owning studio SEES the dead-end handoff on a party it has only texted';
  RESET ROLE;

  -- Another studio's owner: same view, same widened predicate, nothing to see.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims',
    '{"sub":"64500000-0000-4000-8000-000000000002","role":"authenticated"}', true);
  ASSERT NOT EXISTS (SELECT 1 FROM public.sms_review_queue WHERE id=v_handoff),
    'another studio does NOT: widening the direction filter widened no tenant';
  ASSERT NOT EXISTS (SELECT 1 FROM public.sms_review_queue),
    'and that studio''s queue is empty, not merely missing this row';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', coalesce(v_claims, ''), true);
END $a6b$;

-- ── A7. The copy: GSM-7, two segments at full length, one closing line ──────
DO $a7$
DECLARE
  -- GSM 03.38's basic table. Anything outside it (and its extension set below)
  -- forces the whole message to UCS-2 and halves what a segment can carry.
  basic CONSTANT text := '@£$¥èéùìòÇ' || E'\n' || 'Øø' || E'\r' ||
    'Åå_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&''()*+,-./0123456789:;<=>?¡' ||
    'ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
  ext CONSTANT text := E'\f' || '^{}\[~]|€';
  closing text;
  r record; rendered text; septets integer; n integer := 0;
BEGIN
  -- The canonical line, read off the row 00641 shipped rather than retyped.
  SELECT btrim(substr(html_content, length('{{selection}}')+1)) INTO closing
    FROM public.email_templates WHERE slug='sms_selection';
  ASSERT closing IS NOT NULL AND closing LIKE '%rates%' AND closing LIKE '%HELP%'
    AND closing LIKE '%STOP%', 'the canonical closing line is where 00641 put it';

  FOR r IN SELECT slug, html_content FROM public.email_templates
    WHERE slug IN ('sms_site_card','sms_day_of','sms_field_link_renew') ORDER BY slug
  LOOP
    n := n + 1;
    ASSERT r.html_content LIKE '%'||closing, r.slug||' ends with the canonical line';
    ASSERT length(r.html_content) - length(replace(r.html_content, closing, '')) = length(closing),
      r.slug||' says it exactly once';
    ASSERT translate(r.html_content, basic||ext, '')='',
      r.slug||' is GSM-7 only: '||translate(r.html_content, basic||ext, '');
    -- Plain words, and no product language: this is a text to a trade.
    ASSERT r.html_content !~* '\y(platform|portal|dashboard|account)\y'
      AND r.html_content !~ '\yAI\y', r.slug||' says it in plain words';

    -- Rendered with every parameter at the maximum the producer allows.
    rendered := r.html_content;
    rendered := replace(rendered,'{{studio_name}}',repeat('W',24));
    rendered := replace(rendered,'{{project_name}}',repeat('W',24));
    rendered := replace(rendered,'{{visit_day}}',repeat('W',10));
    rendered := replace(rendered,'{{visit_window}}',repeat('W',11));
    rendered := replace(rendered,'{{site_address}}',repeat('W',36));
    rendered := replace(rendered,'{{access_note}}',repeat('W',32));
    rendered := replace(rendered,'{{contact}}',repeat('W',24));
    rendered := replace(rendered,'{{link}}','https://client.patina.cloud/field/'||repeat('a',64));
    ASSERT rendered !~ '\{\{', r.slug||' has no parameter this test does not budget for: '||rendered;
    septets := length(rendered) + (length(rendered) - length(translate(rendered, ext, '')));
    ASSERT septets <= 306, format('%s is %s septets at full length: %s', r.slug, septets, rendered);
    RAISE NOTICE '% renders in % septets (2 segments = 306)', r.slug, septets;
  END LOOP;
  ASSERT n=3, format('00645 ships three templates, found %s', n);
END $a7$;

-- ── A8. Who may run any of this (contract S12) ──────────────────────────────
DO $a8$
DECLARE fn text; ident text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.sms_claim_party_budget(uuid,uuid,uuid,date,text)',
    'public.sms_party_prompt_gate(uuid,uuid,uuid,integer,integer)']
  LOOP
    ASSERT has_function_privilege('service_role',fn,'EXECUTE'), fn||' is the service role''s';
    ASSERT NOT has_function_privilege('authenticated',fn,'EXECUTE'), fn||' is not a signed-in user''s';
    ASSERT NOT has_function_privilege('anon',fn,'EXECUTE'), fn||' is certainly not anon''s';
    ASSERT (SELECT proacl IS NOT NULL FROM pg_proc WHERE oid=fn::regprocedure),
      fn||' has an explicit grant list (a NULL one still grants PUBLIC by default)';
    ASSERT NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a
      WHERE p.oid=fn::regprocedure AND a.grantee=0), fn||' is not granted to PUBLIC';
    ASSERT (SELECT prosecdef FROM pg_proc WHERE oid=fn::regprocedure), fn||' runs as its owner';
  END LOOP;
END $a8$;

ROLLBACK;

-- ════════════════════════════════════════════════════════════════════════════
-- PART B — two real sessions racing for the last slot
-- ════════════════════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA public;

-- Committed, because a lock barrier between two sessions cannot exist inside
-- one transaction. Everything here is removed at the end and the removal is
-- asserted.
BEGIN;
INSERT INTO auth.users(id,email) VALUES ('64500000-0000-4000-8000-000000000101','sq12b@test.invalid');
INSERT INTO profiles(id,email,full_name) VALUES ('64500000-0000-4000-8000-000000000101','sq12b@test.invalid','Synthetic lead B') ON CONFLICT DO NOTHING;
INSERT INTO organizations(id,type,name,slug,status) VALUES
 ('64500000-0000-4000-8000-000000000110','design_studio','Trade rail race','sq12-race','active');
-- No owner membership here, deliberately: an organization's last active owner
-- is protected from deletion by design, so a COMMITTED fixture that made one
-- could not take it back afterwards. The budget claim never reads a project
-- lead; Part A, which does, is the part that rolls back.
INSERT INTO projects(id,name,designer_id,created_by,studio_id) VALUES
 ('64500000-0000-4000-8000-000000000120','Race project','64500000-0000-4000-8000-000000000101','64500000-0000-4000-8000-000000000101','64500000-0000-4000-8000-000000000110');
INSERT INTO project_parties(id,project_id,party_kind,display_name,phone) VALUES
 ('64500000-0000-4000-8000-000000000130','64500000-0000-4000-8000-000000000120','sub','Race trade','+15555121000');
INSERT INTO sms_conversations(id,twilio_number,phone_e164) VALUES
 ('64500000-0000-4000-8000-000000000150','+15555129999','+15555121000');
COMMIT;

-- Two event slots are already spent today, so the next claim is the LAST one.
DO $spend$
DECLARE r jsonb;
BEGIN
  r := public.sms_claim_party_budget('64500000-0000-4000-8000-000000000150',
    '64500000-0000-4000-8000-000000000120','64500000-0000-4000-8000-000000000130','2026-11-01','event');
  ASSERT (r->>'events_used')::int=1, r::text;
  r := public.sms_claim_party_budget('64500000-0000-4000-8000-000000000150',
    '64500000-0000-4000-8000-000000000120','64500000-0000-4000-8000-000000000130','2026-11-01','event');
  ASSERT (r->>'events_used')::int=2, r::text;
END $spend$;

SELECT public.dblink_connect('sq12b', format('dbname=%s user=%s host=%s port=%s password=%s',
  current_database(), current_user, coalesce(host(inet_server_addr()),'127.0.0.1'),
  inet_server_port(), :'second_session_password')) AS connected;

-- ── B1. Two senders, one slot left: exactly one of them gets it ─────────────
BEGIN;
DO $b1$
DECLARE r jsonb;
BEGIN
  r := public.sms_claim_party_budget('64500000-0000-4000-8000-000000000150',
    '64500000-0000-4000-8000-000000000120','64500000-0000-4000-8000-000000000130','2026-11-01','event');
  ASSERT (r->>'claimed')::boolean AND (r->>'events_used')::int=3,
    'this session took the last slot: '||r::text;
  PERFORM public.dblink_send_query('sq12b',
    $q$SELECT public.sms_claim_party_budget('64500000-0000-4000-8000-000000000150',
         '64500000-0000-4000-8000-000000000120','64500000-0000-4000-8000-000000000130',
         '2026-11-01','event')::text$q$);
  PERFORM pg_sleep(0.8);
  ASSERT public.dblink_is_busy('sq12b')=1, 'the other session has not finished';
  ASSERT EXISTS (SELECT 1 FROM pg_stat_activity
    WHERE pid<>pg_backend_pid() AND datname=current_database()
      AND query LIKE '%sms_claim_party_budget%' AND wait_event_type='Lock'),
    'and what it is waiting on is the context row''s LOCK, not the network';
END $b1$;
COMMIT;

DO $b1_result$
DECLARE r jsonb; extra integer := 0;
BEGIN
  SELECT t.r::jsonb INTO r FROM public.dblink_get_result('sq12b') AS t(r text);
  ASSERT (r->>'claimed')::boolean IS FALSE AND r->>'reason'='budget',
    'the loser is refused, by the value the winner committed: '||r::text;
  SELECT count(*) INTO extra FROM public.dblink_get_result('sq12b') AS t(r text);
  ASSERT extra=0, 'and it was one statement';
  ASSERT (SELECT budget_events_used=3 FROM public.sms_conversation_context
    WHERE conversation_id='64500000-0000-4000-8000-000000000150'
      AND project_id='64500000-0000-4000-8000-000000000120'),
    'three slots spent by two sessions, not four';
END $b1_result$;

-- ── B2. A slot is spent only if the sender's transaction commits ────────────
BEGIN;
DO $b2$
DECLARE r jsonb;
BEGIN
  r := public.sms_claim_party_budget('64500000-0000-4000-8000-000000000150',
    '64500000-0000-4000-8000-000000000120','64500000-0000-4000-8000-000000000130','2026-11-02','event');
  ASSERT (r->>'claimed')::boolean, 'a new local day, so this session claims: '||r::text;
  PERFORM public.dblink_send_query('sq12b',
    $q$SELECT public.sms_claim_party_budget('64500000-0000-4000-8000-000000000150',
         '64500000-0000-4000-8000-000000000120','64500000-0000-4000-8000-000000000130',
         '2026-11-02','event')::text$q$);
  PERFORM pg_sleep(0.8);
  ASSERT public.dblink_is_busy('sq12b')=1, 'and the other session waits again';
END $b2$;
ROLLBACK;

DO $b2_result$
DECLARE r jsonb;
BEGIN
  SELECT t.r::jsonb INTO r FROM public.dblink_get_result('sq12b') AS t(r text);
  PERFORM public.dblink_get_result('sq12b');
  ASSERT (r->>'claimed')::boolean AND (r->>'events_used')::int=1,
    'a claim whose sender rolled back spent nothing, so the other sender gets it: '||r::text;
  ASSERT (SELECT budget_local_day=DATE '2026-11-02' AND budget_events_used=1
    FROM public.sms_conversation_context
    WHERE conversation_id='64500000-0000-4000-8000-000000000150'
      AND project_id='64500000-0000-4000-8000-000000000120'),
    'one text on the new day, by the session that committed';
END $b2_result$;

SELECT public.dblink_disconnect('sq12b') AS disconnected;

-- ── B3. Put the disposable database back the way we found it ────────────────
BEGIN;
DELETE FROM public.sms_conversation_context WHERE conversation_id='64500000-0000-4000-8000-000000000150';
DELETE FROM public.sms_messages WHERE conversation_id='64500000-0000-4000-8000-000000000150';
DELETE FROM public.sms_conversations WHERE id='64500000-0000-4000-8000-000000000150';
DELETE FROM public.project_parties WHERE id='64500000-0000-4000-8000-000000000130';
DELETE FROM public.projects WHERE id='64500000-0000-4000-8000-000000000120';
DELETE FROM public.organizations WHERE id='64500000-0000-4000-8000-000000000110';
DELETE FROM public.profiles WHERE id='64500000-0000-4000-8000-000000000101';
DELETE FROM auth.users WHERE id='64500000-0000-4000-8000-000000000101';
DO $b3$
BEGIN
  ASSERT (SELECT count(*)=0 FROM public.sms_conversations WHERE twilio_number='+15555129999'),
    'no conversation this test made is left behind';
  ASSERT (SELECT count(*)=0 FROM public.projects WHERE id='64500000-0000-4000-8000-000000000120');
  ASSERT (SELECT count(*)=0 FROM public.sms_conversation_context
    WHERE conversation_id='64500000-0000-4000-8000-000000000150');
  ASSERT (SELECT count(*)=0 FROM auth.users WHERE email LIKE 'sq12%@test.invalid');
END $b3$;
COMMIT;

DROP EXTENSION dblink;
DO $b4$
BEGIN
  ASSERT NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='dblink'),
    'the second session''s only tool is put away again';
END $b4$;

SELECT 'sms_trade_prompts_test: PASS' AS result;
