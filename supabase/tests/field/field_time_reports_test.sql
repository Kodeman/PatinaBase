-- 00653 / US-4 S1-S6: contractor hours arrive as a PROPOSAL, and the only way
-- one becomes a timesheet row is a named designer booking it to a named
-- teammate. Standalone, synthetic, rolled back; run only in the disposable
-- controller DB (verification/SQ-20/sql-gate-driver.mjs).
--
-- The claim under test, in one line: a party's reply can NEVER write
-- public.project_time_entries, and public.field_time_report_decide refuses a
-- non-member, a stale version, a decided report and a non-member attribution.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='60s';

-- ─── fixtures ──────────────────────────────────────────────────────────────
-- D = the project's designer AND an owner of the studio org (the only kind of
--     actor 00601's classifier lets write another person's user_id).
-- T = a profile-backed teammate: on the project's roster, a plain org member.
-- S = a studio colleague who is NOT on this project (a legal reader, an illegal
--     booking target).
-- O = a stranger in another studio (no read, no decision).
INSERT INTO auth.users(id,email) VALUES
 ('20000000-0000-4000-8000-000000000001','sq20-designer@test.invalid'),
 ('20000000-0000-4000-8000-000000000002','sq20-teammate@test.invalid'),
 ('20000000-0000-4000-8000-000000000003','sq20-stranger@test.invalid'),
 ('20000000-0000-4000-8000-000000000004','sq20-colleague@test.invalid');
INSERT INTO profiles(id,email,full_name) VALUES
 ('20000000-0000-4000-8000-000000000001','sq20-designer@test.invalid','Synthetic designer'),
 ('20000000-0000-4000-8000-000000000002','sq20-teammate@test.invalid','Synthetic teammate'),
 ('20000000-0000-4000-8000-000000000003','sq20-stranger@test.invalid','Synthetic stranger'),
 ('20000000-0000-4000-8000-000000000004','sq20-colleague@test.invalid','Synthetic colleague')
 ON CONFLICT DO NOTHING;
INSERT INTO organizations(id,type,name,slug,status) VALUES
 ('20000000-0000-4000-8000-000000000010','design_studio','Hours studio','sq20-hours','active'),
 ('20000000-0000-4000-8000-000000000011','design_studio','Other studio','sq20-other','active');
INSERT INTO organization_members(user_id,organization_id,role,status) VALUES
 ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000010','owner','active'),
 ('20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000010','member','active'),
 ('20000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000010','member','active'),
 ('20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000011','owner','active');
INSERT INTO projects(id,name,designer_id,created_by,studio_id) VALUES
 ('20000000-0000-4000-8000-000000000020','Hours project','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000010'),
 ('20000000-0000-4000-8000-000000000021','Other project','20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000011');
INSERT INTO project_team_members(project_id,user_id,role,assigned_by) VALUES
 ('20000000-0000-4000-8000-000000000020','20000000-0000-4000-8000-000000000002','support_designer','20000000-0000-4000-8000-000000000001');
-- The trade seat has NO profile_id: that is the binding finding (00177:18) made
-- concrete, and it is why the reply is a claim rather than a timesheet row.
INSERT INTO project_parties(id,project_id,party_kind,display_name,phone) VALUES
 ('20000000-0000-4000-8000-000000000030','20000000-0000-4000-8000-000000000020','sub','Synthetic trade','+15555200000'),
 ('20000000-0000-4000-8000-000000000031','20000000-0000-4000-8000-000000000020','client','Synthetic client','+15555200001');
INSERT INTO project_tasks(id,project_id,title,owner,owner_party_id,status,due_date) VALUES
 ('20000000-0000-4000-8000-000000000042','20000000-0000-4000-8000-000000000021','Foreign visit','designer',NULL,'todo',CURRENT_DATE);
INSERT INTO sms_conversations(id,twilio_number,phone_e164) VALUES
 ('20000000-0000-4000-8000-000000000050','+15555209999','+15555200000');
INSERT INTO studio_channel_consent(organization_id,channel_kind,channel_value,status,source,evidence,disclosure_version,recorded_by) VALUES
 ('20000000-0000-4000-8000-000000000010','sms','+15555200000','granted','web_form','Synthetic consent','test-v1','20000000-0000-4000-8000-000000000001');

-- ─── helpers ───────────────────────────────────────────────────────────────
CREATE FUNCTION pg_temp.assume(p_user_id uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',p_user_id::text,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $$;

CREATE FUNCTION pg_temp.unassume() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims',NULL,true);
END $$;

-- One visit task per ask, so every prompt has its own immutable subject and the
-- one-open-prompt rules are never accidentally ambiguous.
CREATE FUNCTION pg_temp.visit(p_title text DEFAULT 'Site visit') RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE i uuid := gen_random_uuid();
BEGIN
  INSERT INTO project_tasks(id,project_id,title,owner,owner_party_id,status,due_date)
  VALUES(i,'20000000-0000-4000-8000-000000000020',p_title,'sub',
         '20000000-0000-4000-8000-000000000030','todo',CURRENT_DATE);
  RETURN i;
END $$;

CREATE FUNCTION pg_temp.ask(p_task uuid, p_version integer DEFAULT 1,
  p_party uuid DEFAULT '20000000-0000-4000-8000-000000000030') RETURNS sms_prompts
LANGUAGE plpgsql AS $$
DECLARE i uuid; p sms_prompts;
BEGIN
  SELECT id INTO i FROM sms_create_prompt(p_party,'20000000-0000-4000-8000-000000000020',
    'report_hours',p_task,p_version,clock_timestamp()+interval '1 day',
    '+15555209999','+15555200000',NULL);
  SELECT * INTO p FROM sms_prompts WHERE id=i; RETURN p;
END $$;

CREATE FUNCTION pg_temp.msg(p_body text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE i uuid := gen_random_uuid();
BEGIN
  INSERT INTO sms_messages(id,conversation_id,direction,body,twilio_sid)
  VALUES(i,'20000000-0000-4000-8000-000000000050','inbound',p_body,'SM'||replace(i::text,'-',''));
  RETURN i;
END $$;

CREATE FUNCTION pg_temp.effect(p_task uuid, p_hours text, p_note text DEFAULT NULL,
  p_kind text DEFAULT 'task') RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'type','report_hours',
    'target',jsonb_build_object('kind',p_kind,'id',p_task),
    'hours',p_hours::numeric,
    'note',p_note));
$$;

-- The service path, with the prompt named the way sms_apply_prompt names it.
CREATE FUNCTION pg_temp.propose(p_prompt sms_prompts, p_task uuid, p_hours text,
  p_note text DEFAULT NULL, p_close boolean DEFAULT true) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE r jsonb;
BEGIN
  PERFORM set_config('app.field_time_report_prompt_id',p_prompt.id::text,true);
  r := apply_field_effect(p_prompt.party_id,pg_temp.effect(p_task,p_hours,p_note),'field',NULL);
  PERFORM set_config('app.field_time_report_prompt_id','',true);
  IF p_close THEN
    UPDATE sms_prompts SET answered_at=clock_timestamp() WHERE id=p_prompt.id;
  END IF;
  RETURN (r->>'report_id')::uuid;
END $$;

-- Refusal harness: the statement must raise, with this SQLSTATE, this stable
-- DETAIL token when one is expected, and this message when one is named. The
-- caught exception rolls its own subtransaction back, which is what makes the
-- "and wrote nothing" assertions after each call meaningful.
CREATE FUNCTION pg_temp.refuses(p_sql text, p_state text, p_detail text,
  p_message_like text, p_label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_state text; v_detail text; v_message text; v_failed boolean := false;
BEGIN
  BEGIN
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_detail = PG_EXCEPTION_DETAIL,
      v_message = MESSAGE_TEXT;
    ASSERT v_state = p_state,
      p_label||' expected SQLSTATE '||p_state||', got '||v_state||' ('||v_message||')';
    IF p_detail IS NOT NULL THEN
      ASSERT v_detail = p_detail,
        p_label||' expected DETAIL '||p_detail||', got '||COALESCE(v_detail,'<none>');
    END IF;
    IF p_message_like IS NOT NULL THEN
      ASSERT v_message LIKE p_message_like,
        p_label||' expected message like '||p_message_like||', got '||v_message;
    END IF;
  END;
  ASSERT v_failed, p_label||' must be refused';
END $$;

CREATE FUNCTION pg_temp.decide_sql(p_report uuid, p_decision text, p_version integer,
  p_user uuid DEFAULT NULL) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.field_time_report_decide(%L,%L,%s,%s)',
    p_report, p_decision, p_version, COALESCE(quote_literal(p_user)||'::uuid','NULL'));
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. S1 — the kind, its subject, and the issuance rule
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_task uuid; v_task2 uuid; p sms_prompts; q sms_prompts;
BEGIN
  ASSERT field_effect_authority_scopes('report_hours') IS NULL,
    'SQ20 report_hours is not a delivery effect: NULL scope keeps the 00624 gate and field_delivery_reports out of the hours path';

  v_task := pg_temp.visit('Framing walkthrough');
  v_task2 := pg_temp.visit('Second visit');

  -- Admitted, with the task as the immutable subject.
  PERFORM sms_validate_prompt_effect('20000000-0000-4000-8000-000000000020','report_hours',
    v_task,pg_temp.effect(v_task,'6.5'));

  -- Refused: a subject that is not the prompt's own.
  PERFORM pg_temp.refuses(format(
    'SELECT sms_validate_prompt_effect(%L,%L,%L,%L::jsonb)',
    '20000000-0000-4000-8000-000000000020','report_hours',v_task,
    pg_temp.effect(v_task2,'6.5')),'23514',NULL,'%immutable subject mismatch%',
    'SQ20 validator mismatched subject');
  -- Refused: a task on somebody else's project.
  PERFORM pg_temp.refuses(format(
    'SELECT sms_validate_prompt_effect(%L,%L,%L,%L::jsonb)',
    '20000000-0000-4000-8000-000000000020','report_hours',
    '20000000-0000-4000-8000-000000000042',
    pg_temp.effect('20000000-0000-4000-8000-000000000042','6.5')),'23514',NULL,
    '%must belong to prompt project%','SQ20 validator foreign task');
  -- Refused: hours are about a visit, never a coordination item or a PO.
  PERFORM pg_temp.refuses(format(
    'SELECT sms_validate_prompt_effect(%L,%L,%L,%L::jsonb)',
    '20000000-0000-4000-8000-000000000020','report_hours',v_task,
    pg_temp.effect(v_task,'6.5',NULL,'coordination')),'23514',NULL,
    '%report_hours answers a visit task%','SQ20 validator non-task target');
  -- Refused: the type must be the kind (00643's rule, unchanged).
  PERFORM pg_temp.refuses(format(
    'SELECT sms_validate_prompt_effect(%L,%L,%L,%L::jsonb)',
    '20000000-0000-4000-8000-000000000020','mark_done',v_task,
    pg_temp.effect(v_task,'6.5')),'23514',NULL,'%unsupported or mismatched effect%',
    'SQ20 validator kind/type mismatch');

  -- S8's issuance rule: one ask per party, per visit, per frozen local day.
  p := pg_temp.ask(v_task,20260919);
  q := pg_temp.ask(v_task,20260919);
  ASSERT p.id = q.id AND p.short_code = q.short_code,
    'SQ20 a replayed evening tick re-uses the same hours ask, so the crew is asked once';
  -- The ask carries NO stored proposal, and that is load-bearing: 00645's
  -- consumption door raises 23514 when a stored proposal meets an incoming
  -- p_effect, so a proposal here would make the crew's number unanswerable. The
  -- number arrives in the reply's own effect instead.
  ASSERT p.proposed_effect IS NULL,
    'SQ20 the hours ask stores no proposed effect';
  ASSERT (SELECT count(*) FROM sms_prompts WHERE kind='report_hours' AND subject_id=v_task)=1,
    'SQ20 exactly one hours prompt exists for that party, visit and day';
  q := pg_temp.ask(v_task,20260920);
  ASSERT q.id <> p.id, 'SQ20 the NEXT day is a new ask';
  UPDATE sms_prompts SET answered_at=clock_timestamp() WHERE id IN (p.id,q.id);
  RAISE NOTICE 'PASS SQ20 S1 report_hours kind, task-only subject, NULL authority scope, one ask a day';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. S3 — the way in writes one proposal and never a time entry
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_task uuid; p sms_prompts; r uuid; v_row field_time_reports;
BEGIN
  v_task := pg_temp.visit('Tile day');
  p := pg_temp.ask(v_task);

  -- The service path, under the role production uses.
  SET LOCAL ROLE service_role;
  r := pg_temp.propose(p,v_task,'6.5','gate was locked till 9',false);
  RESET ROLE;

  SELECT * INTO v_row FROM field_time_reports WHERE id=r;
  ASSERT v_row.status='proposed' AND v_row.version=1
     AND v_row.reported_hours=6.5 AND v_row.note='gate was locked till 9'
     AND v_row.project_id='20000000-0000-4000-8000-000000000020'
     AND v_row.organization_id='20000000-0000-4000-8000-000000000010'
     AND v_row.party_id='20000000-0000-4000-8000-000000000030'
     AND v_row.task_id=v_task AND v_row.prompt_id=p.id
     AND v_row.decided_by IS NULL AND v_row.decided_at IS NULL
     AND v_row.attributed_user_id IS NULL AND v_row.attributed_time_entry_id IS NULL,
    'SQ20 one proposed row, anchored to the prompt that asked';
  ASSERT (SELECT count(*) FROM field_time_reports)=1,'SQ20 exactly one claim per reply';
  -- The binding finding, asserted: the party has no profile and the reply wrote
  -- no timesheet row for anybody.
  ASSERT (SELECT profile_id IS NULL FROM project_parties WHERE id=v_row.party_id),
    'SQ20 the reporting trade seat is profile-less (00177:18)';
  ASSERT NOT EXISTS(SELECT 1 FROM project_time_entries),
    'SQ20 a party reply writes ZERO project_time_entries rows';
  ASSERT NOT EXISTS(SELECT 1 FROM field_delivery_reports),
    'SQ20 hours are not a delivery report either';

  -- One ask is one claim.
  PERFORM set_config('app.field_time_report_prompt_id',p.id::text,true);
  PERFORM pg_temp.refuses(format(
    'SELECT apply_field_effect(%L,%L::jsonb,%L,NULL)',
    p.party_id,pg_temp.effect(v_task,'4'),'field'),
    '23505','field_time_report_duplicate','%already been claimed%',
    'SQ20 second application on the same prompt');
  ASSERT (SELECT count(*) FROM field_time_reports)=1 AND
    (SELECT reported_hours FROM field_time_reports WHERE id=r)=6.5,
    'SQ20 the refused duplicate changed nothing';
  PERFORM set_config('app.field_time_report_prompt_id','',true);

  -- Out of range: the grammar admits it, the ledger's own CHECK refuses it,
  -- and the ask it answered is left open for a corrected reply.
  DECLARE v_long uuid; lp sms_prompts;
  BEGIN
    v_long := pg_temp.visit('Long day'); lp := pg_temp.ask(v_long);
    PERFORM pg_temp.refuses(format(
      'SELECT apply_field_effect(%L,%L::jsonb,%L,NULL)',
      lp.party_id,pg_temp.effect(v_long,'17'),'field'),
      '23514',NULL,'%field_time_reports_hours_check%','SQ20 seventeen hours');
    ASSERT (SELECT answered_at IS NULL FROM sms_prompts WHERE id=lp.id)
       AND NOT EXISTS(SELECT 1 FROM field_time_reports WHERE task_id=v_long),
      'SQ20 an out-of-range number leaves the ask open and writes nothing';
    UPDATE sms_prompts SET answered_at=clock_timestamp() WHERE id=lp.id;
  END;

  -- Nonsense, and a missing number.
  PERFORM pg_temp.refuses(format(
    'SELECT apply_field_effect(%L,%L::jsonb,%L,NULL)',
    p.party_id,jsonb_build_object('type','report_hours','target',
      jsonb_build_object('kind','task','id',v_task),'hours','about six'),'field'),
    '23514',NULL,'%needs a number of hours%','SQ20 unparsable hours');
  PERFORM pg_temp.refuses(format(
    'SELECT apply_field_effect(%L,%L::jsonb,%L,NULL)',
    p.party_id,jsonb_build_object('type','report_hours','target',
      jsonb_build_object('kind','task','id',v_task)),'field'),
    '23514',NULL,'%needs a number of hours%','SQ20 missing hours');

  -- The claim must be identifiable. Two open asks for one visit is ambiguous,
  -- and an ambiguous claim is refused rather than guessed at.
  DECLARE v_amb uuid; a sms_prompts; b sms_prompts;
  BEGIN
    v_amb := pg_temp.visit('Ambiguous day');
    a := pg_temp.ask(v_amb,1); b := pg_temp.ask(v_amb,2);
    ASSERT a.id <> b.id,'SQ20 two non-daily asks are two prompts';
    PERFORM pg_temp.refuses(format(
      'SELECT apply_field_effect(%L,%L::jsonb,%L,NULL)',
      a.party_id,pg_temp.effect(v_amb,'8'),'field'),
      '23514','field_time_report_no_prompt','%need exactly one%',
      'SQ20 two open asks for one visit');
    -- Named, it is unambiguous again.
    PERFORM set_config('app.field_time_report_prompt_id',b.id::text,true);
    PERFORM apply_field_effect(a.party_id,pg_temp.effect(v_amb,'8'),'field',NULL);
    PERFORM set_config('app.field_time_report_prompt_id','',true);
    ASSERT (SELECT prompt_id FROM field_time_reports WHERE task_id=v_amb)=b.id,
      'SQ20 the named prompt is the claim';
    -- A prompt that is not this party's open hours ask for this visit.
    PERFORM set_config('app.field_time_report_prompt_id',a.id::text,true);
    PERFORM pg_temp.refuses(format(
      'SELECT apply_field_effect(%L,%L::jsonb,%L,NULL)',
      a.party_id,pg_temp.effect(pg_temp.visit('Other visit'),'3'),'field'),
      '23514','field_time_report_no_prompt','%not this party%',
      'SQ20 prompt that asked about another visit');
    PERFORM set_config('app.field_time_report_prompt_id','',true);
    UPDATE sms_prompts SET answered_at=clock_timestamp() WHERE id IN (a.id,b.id);
  END;

  -- Hours are a trade report. The client rail (00650) has no such ask.
  PERFORM pg_temp.refuses(format(
    'SELECT apply_field_effect(%L,%L::jsonb,%L,NULL)',
    '20000000-0000-4000-8000-000000000031',pg_temp.effect(v_task,'6'),'field'),
    '23514',NULL,'%trade report, not a client one%','SQ20 client hours');

  ASSERT NOT EXISTS(SELECT 1 FROM project_time_entries),
    'SQ20 nothing in this section wrote a timesheet row';
  RAISE NOTICE 'PASS SQ20 S3 one proposal per claim, duplicate/ambiguous/out-of-range refused, zero time entries';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. S7's door: a numeric reply reaches the ledger through sms_apply_prompt
-- ═══════════════════════════════════════════════════════════════════════════
-- The cross-ticket seam. pipeline.ts (SQ-121) parses the body and calls
-- sms_apply_prompt; if this door refused numbers, no grammar it shipped could
-- have worked. Proven here end to end, including that the consumed message
-- carries the applied effect and that a refusal leaves the ask open.
DO $$
DECLARE v_task uuid; p sms_prompts; m uuid; r jsonb; v_report field_time_reports;
BEGIN
  -- Section 2 left asks open on purpose. The codeless rule below is about
  -- exactly ONE open hours ask for this phone pair, so this section starts from
  -- the production-normal state: every earlier ask settled.
  UPDATE sms_prompts SET answered_at=clock_timestamp() WHERE answered_at IS NULL;
  v_task := pg_temp.visit('Paint day');
  p := pg_temp.ask(v_task);
  m := pg_temp.msg('6.5 '||p.short_code);
  SET LOCAL ROLE service_role;
  r := sms_apply_prompt(p.id,'+15555209999','+15555200000',m,pg_temp.effect(v_task,'6.5'));
  RESET ROLE;
  ASSERT r->>'status'='applied','SQ20 a numeric reply with its Ref is applied';
  SELECT * INTO v_report FROM field_time_reports WHERE prompt_id=p.id;
  ASSERT v_report.reported_hours=6.5 AND v_report.status='proposed'
     AND v_report.source_message_id=m,
    'SQ20 the reply became one proposal, carrying the message it came in on';
  ASSERT (SELECT answered_at IS NOT NULL AND consumed_sid IS NOT NULL
            AND consumption_result=r->'result' FROM sms_prompts WHERE id=p.id),
    'SQ20 the ask is consumed exactly once, with its immutable receipt';
  ASSERT (SELECT applied_effect->>'effect_type'='report_hours'
            AND (applied_effect->>'applied')::boolean
            AND matched_task_id=v_task FROM sms_messages WHERE id=m),
    'SQ20 the inbound row records what was applied';
  ASSERT NOT EXISTS(SELECT 1 FROM project_time_entries),
    'SQ20 the text door still writes no timesheet row';

  -- Codeless, with exactly one open hours ask for the pair.
  v_task := pg_temp.visit('Trim day');
  p := pg_temp.ask(v_task);
  SET LOCAL ROLE service_role;
  r := sms_apply_prompt(p.id,'+15555209999','+15555200000',pg_temp.msg('6,5'),
    pg_temp.effect(v_task,'6.5'));
  RESET ROLE;
  ASSERT r->>'status'='applied','SQ20 a codeless number binds to the one open ask';
  ASSERT (SELECT reported_hours FROM field_time_reports WHERE prompt_id=p.id)=6.5,
    'SQ20 a comma decimal is read, not refused';

  -- The plain spelling, no Ref: what most crews will actually send.
  v_task := pg_temp.visit('Base day');
  p := pg_temp.ask(v_task);
  SET LOCAL ROLE service_role;
  r := sms_apply_prompt(p.id,'+15555209999','+15555200000',pg_temp.msg('6.5'),
    pg_temp.effect(v_task,'6.5'));
  RESET ROLE;
  ASSERT r->>'status'='applied'
     AND (SELECT status='proposed' AND reported_hours=6.5
            FROM field_time_reports WHERE prompt_id=p.id),
    'SQ20 "6.5" with no Ref answers the one open ask and creates the proposed row';

  -- "6 hrs 42" spelled long, and the wrong code.
  v_task := pg_temp.visit('Grout day');
  p := pg_temp.ask(v_task);
  PERFORM pg_temp.refuses(format(
    'SELECT sms_apply_prompt(%L,%L,%L,%L,%L::jsonb)',p.id,'+15555209999','+15555200000',
    pg_temp.msg('6.5 99'),pg_temp.effect(v_task,'6.5')),
    '23514',NULL,'%must identify this prompt%','SQ20 wrong Ref on an hours reply');
  ASSERT (SELECT answered_at IS NULL FROM sms_prompts WHERE id=p.id)
     AND NOT EXISTS(SELECT 1 FROM field_time_reports WHERE prompt_id=p.id),
    'SQ20 a wrong Ref leaves the ask open and the ledger empty';
  SET LOCAL ROLE service_role;
  r := sms_apply_prompt(p.id,'+15555209999','+15555200000',
    pg_temp.msg('6 hrs '||p.short_code),pg_temp.effect(v_task,'6'));
  RESET ROLE;
  ASSERT r->>'status'='applied' AND
    (SELECT reported_hours FROM field_time_reports WHERE prompt_id=p.id)=6,
    'SQ20 "6 hrs <ref>" is the same answer';

  -- Out of range through the door: refused whole, ask still open.
  v_task := pg_temp.visit('Double day');
  p := pg_temp.ask(v_task);
  PERFORM pg_temp.refuses(format(
    'SELECT sms_apply_prompt(%L,%L,%L,%L,%L::jsonb)',p.id,'+15555209999','+15555200000',
    pg_temp.msg('17 '||p.short_code),pg_temp.effect(v_task,'17')),
    '23514',NULL,'%field_time_reports_hours_check%','SQ20 seventeen hours through the door');
  ASSERT (SELECT answered_at IS NULL AND consumed_sid IS NULL FROM sms_prompts WHERE id=p.id)
     AND NOT EXISTS(SELECT 1 FROM field_time_reports WHERE prompt_id=p.id),
    'SQ20 an out-of-range number does not consume the ask';

  -- A word is not an hours answer, and an hours effect is not an answer to the
  -- morning card: the (verb, effect) gate still decides.
  PERFORM pg_temp.refuses(format(
    'SELECT sms_apply_prompt(%L,%L,%L,%L,%L::jsonb)',p.id,'+15555209999','+15555200000',
    pg_temp.msg('DONE '||p.short_code),pg_temp.effect(v_task,'6')),
    '23514',NULL,'%conflicting command%','SQ20 DONE is not an hours answer');
  UPDATE sms_prompts SET answered_at=clock_timestamp() WHERE id=p.id;

  -- And the negative control that matters for S7: a bare number is not an hours
  -- answer when the open ask is the morning card. Nothing about today's
  -- behaviour for digests and cards changes.
  DECLARE v_card uuid; v_card_prompt uuid; c sms_prompts;
  BEGIN
    v_card := pg_temp.visit('Card day');
    SELECT id INTO v_card_prompt FROM sms_create_prompt(
      '20000000-0000-4000-8000-000000000030','20000000-0000-4000-8000-000000000020',
      'day_of',v_card,20260919,clock_timestamp()+interval '1 day',
      '+15555209999','+15555200000',NULL);
    SELECT * INTO c FROM sms_prompts WHERE id=v_card_prompt;
    PERFORM pg_temp.refuses(format(
      'SELECT sms_apply_prompt(%L,%L,%L,%L,%L::jsonb)',c.id,'+15555209999','+15555200000',
      pg_temp.msg('6.5'),pg_temp.effect(v_card,'6.5')),
      '23514',NULL,'%must identify this prompt%','SQ20 bare number on a day_of card');
    UPDATE sms_prompts SET answered_at=clock_timestamp() WHERE id=c.id;
  END;

  ASSERT NOT EXISTS(SELECT 1 FROM project_time_entries),
    'SQ20 no reply in this section wrote a timesheet row';
  RAISE NOTICE 'PASS SQ20 S7 door: numbers with and without a Ref reach the ledger, wrong Ref/range/word refused whole';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. S4 — the decision, its authority, and the ONE time entry
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_task uuid; p sms_prompts; r_reject uuid; r_plain uuid; r_book uuid;
        r_zero uuid; r_rule uuid; v_entry project_time_entries; v_report field_time_reports;
        v_entries_before integer; v_open_claims integer;
BEGIN
  v_task := pg_temp.visit('Decision day');
  p := pg_temp.ask(v_task); r_reject := pg_temp.propose(p,v_task,'8');
  v_task := pg_temp.visit('Plain accept day');
  p := pg_temp.ask(v_task); r_plain := pg_temp.propose(p,v_task,'6.25');
  v_task := pg_temp.visit('Booked day');
  p := pg_temp.ask(v_task); r_book := pg_temp.propose(p,v_task,'6.5');
  v_task := pg_temp.visit('Nothing day');
  p := pg_temp.ask(v_task); r_zero := pg_temp.propose(p,v_task,'0');
  v_task := pg_temp.visit('Teammate rule day');
  p := pg_temp.ask(v_task); r_rule := pg_temp.propose(p,v_task,'4');
  SELECT count(*) INTO v_entries_before FROM project_time_entries;
  ASSERT v_entries_before=0,'SQ20 five proposals, no timesheet rows';
  -- Every claim made so far, here and in the sections above, is still open.
  SELECT count(*) INTO v_open_claims FROM field_time_reports WHERE status='proposed';
  ASSERT v_open_claims>=5,'SQ20 the queue fixture has the five new claims and the earlier ones';

  -- A stranger cannot decide, and is told nothing about the row.
  PERFORM pg_temp.assume('20000000-0000-4000-8000-000000000003');
  PERFORM pg_temp.refuses(pg_temp.decide_sql(r_reject,'accepted',1),
    '42501','field_time_report_forbidden',NULL,'SQ20 decide as a non-member');
  PERFORM pg_temp.refuses(pg_temp.decide_sql(gen_random_uuid(),'accepted',1),
    '42501','field_time_report_forbidden',NULL,'SQ20 decide a report that does not exist');
  ASSERT (SELECT count(*) FROM field_time_report_queue)=0,
    'SQ20 another studio sees no proposals at all';
  PERFORM pg_temp.unassume();

  -- A studio colleague who is not on the project may READ it and may not book
  -- it to herself.
  PERFORM pg_temp.assume('20000000-0000-4000-8000-000000000004');
  ASSERT (SELECT count(*) FROM field_time_report_queue)=v_open_claims,
    'SQ20 a studio colleague reads the queue (the same predicate sms_review_queue uses)';
  PERFORM pg_temp.refuses(pg_temp.decide_sql(r_book,'accepted',1,
    '20000000-0000-4000-8000-000000000004'),'23514','field_time_report_bad_attribution',
    '%not a member of this project%','SQ20 booking to a non-member of the project');
  PERFORM pg_temp.unassume();
  ASSERT NOT EXISTS(SELECT 1 FROM project_time_entries)
     AND (SELECT status='proposed' AND version=1 FROM field_time_reports WHERE id=r_book),
    'SQ20 a refused attribution wrote nothing and settled nothing';

  -- The designer decides. A stale version is refused.
  PERFORM pg_temp.assume('20000000-0000-4000-8000-000000000001');
  PERFORM pg_temp.refuses(pg_temp.decide_sql(r_reject,'accepted',99),
    '40001','field_time_report_stale','%expected version 99, found 1%','SQ20 stale version');
  PERFORM pg_temp.refuses(pg_temp.decide_sql(r_reject,'maybe',1),
    '23514',NULL,'%accepted%rejected%','SQ20 a decision is accept or reject');

  -- Reject, then a second decision on the same report.
  ASSERT field_time_report_decide(r_reject,'rejected',1)->>'status'='rejected',
    'SQ20 reject settles the report';
  SELECT * INTO v_report FROM field_time_reports WHERE id=r_reject;
  ASSERT v_report.status='rejected' AND v_report.version=2
     AND v_report.decided_by='20000000-0000-4000-8000-000000000001'
     AND v_report.decided_at IS NOT NULL AND v_report.attributed_user_id IS NULL
     AND v_report.attributed_time_entry_id IS NULL,
    'SQ20 a rejected report is stamped, bumped and books nothing';
  PERFORM pg_temp.refuses(pg_temp.decide_sql(r_reject,'accepted',2),
    '23514','field_time_report_decided','%already rejected%','SQ20 reject then accept');
  PERFORM pg_temp.refuses(pg_temp.decide_sql(r_reject,'accepted',1),
    '23514','field_time_report_decided',NULL,'SQ20 a decided report is decided at any version');

  -- Accept as reported, with nobody named: still no timesheet row.
  ASSERT field_time_report_decide(r_plain,'accepted',1)->>'status'='accepted',
    'SQ20 accept without attribution';
  SELECT * INTO v_report FROM field_time_reports WHERE id=r_plain;
  ASSERT v_report.status='accepted' AND v_report.version=2
     AND v_report.attributed_user_id IS NULL AND v_report.attributed_time_entry_id IS NULL,
    'SQ20 an accepted report with nobody named carries no attribution';
  ASSERT NOT EXISTS(SELECT 1 FROM project_time_entries),
    'SQ20 accept alone writes ZERO project_time_entries rows';

  -- A nothing-hours report can be accepted; it cannot be booked (00177:20
  -- admits only a positive duration).
  PERFORM pg_temp.refuses(pg_temp.decide_sql(r_zero,'accepted',1,
    '20000000-0000-4000-8000-000000000002'),'23514','field_time_report_bad_attribution',
    '%no hour to book%','SQ20 booking a zero-hour report');
  ASSERT field_time_report_decide(r_zero,'accepted',1)->>'status'='accepted',
    'SQ20 a zero-hour report is still a report';

  -- Attribution to a profile that is nobody here at all.
  PERFORM pg_temp.refuses(pg_temp.decide_sql(r_book,'accepted',1,gen_random_uuid()),
    '23514','field_time_report_bad_attribution','%not a member of this project%',
    'SQ20 booking to an unknown profile');
  -- Attribution without accepting.
  PERFORM pg_temp.refuses(pg_temp.decide_sql(r_book,'rejected',1,
    '20000000-0000-4000-8000-000000000002'),'23514','field_time_report_bad_attribution',
    '%only an accepted report%','SQ20 booking while rejecting');
  ASSERT NOT EXISTS(SELECT 1 FROM project_time_entries),'SQ20 still nothing booked';

  -- THE ONE WRITE. A member profile, named by a designer who may write another
  -- person's hour (00601's classifier: the studio's owner or admin).
  ASSERT (field_time_report_decide(r_book,'accepted',1,
    '20000000-0000-4000-8000-000000000002')->>'attributed_time_entry_id') IS NOT NULL,
    'SQ20 booking to a teammate returns the entry it created';
  SELECT * INTO v_report FROM field_time_reports WHERE id=r_book;
  ASSERT (SELECT count(*) FROM project_time_entries)=1,
    'SQ20 EXACTLY ONE project_time_entries row';
  SELECT * INTO v_entry FROM project_time_entries;
  ASSERT v_entry.user_id='20000000-0000-4000-8000-000000000002'
     AND v_entry.project_id='20000000-0000-4000-8000-000000000020'
     AND v_entry.task_id=v_report.task_id
     AND v_entry.duration_minutes=390
     AND v_entry.notes='Reported by text by Synthetic trade'
     AND v_entry.source='field_manual'
     AND v_entry.invoice_id IS NULL
     AND (v_entry.started_at AT TIME ZONE 'UTC')::date
         = (v_report.reported_at AT TIME ZONE 'UTC')::date
     AND (v_entry.started_at AT TIME ZONE 'UTC')::time = time '12:00',
    'SQ20 the booked hour is the teammate''s, on the visit, at noon UTC of the reported day (HT-13-a)';
  ASSERT v_report.attributed_user_id='20000000-0000-4000-8000-000000000002'
     AND v_report.attributed_time_entry_id=v_entry.id
     AND v_report.status='accepted' AND v_report.version=2,
    'SQ20 the report stores the id of the entry it created';

  -- The audit trail: one row per decision, including the ones that booked
  -- nothing.
  ASSERT (SELECT count(*) FROM field_time_report_decisions)=4,
    'SQ20 four decisions, four audit rows';
  ASSERT (SELECT count(*) FROM field_time_report_decisions d
           WHERE d.report_id=r_book AND d.version=2 AND d.decision='accepted'
             AND d.decided_by='20000000-0000-4000-8000-000000000001'
             AND d.attributed_user_id='20000000-0000-4000-8000-000000000002'
             AND d.attributed_time_entry_id=v_entry.id)=1,
    'SQ20 the audit row names the decider, the teammate and the entry';
  ASSERT (SELECT count(*) FROM field_time_report_decisions d
           WHERE d.report_id=r_reject AND d.decision='rejected'
             AND d.attributed_user_id IS NULL AND d.attributed_time_entry_id IS NULL)=1,
    'SQ20 a rejection is audited too';
  PERFORM pg_temp.unassume();

  -- A DISCOVERED BOUNDARY, not this file's rule: 00601's classifier
  -- (classify_project_time_entry_authority, "the hour belongs to the person who
  -- worked it") lets only the studio's owner or admin write somebody else's
  -- user_id. A support designer booking a colleague is refused BY THAT RULE,
  -- and the whole decision rolls back with it. Asserted here so the Desk's
  -- "Book to a teammate" is built knowing who may press it.
  PERFORM pg_temp.assume('20000000-0000-4000-8000-000000000002');
  PERFORM pg_temp.refuses(pg_temp.decide_sql(r_rule,'accepted',1,
    '20000000-0000-4000-8000-000000000001'),'42501',NULL,
    '%logged by the person who worked the hour%',
    'SQ20 a plain member booking another person''s hour');
  ASSERT (SELECT status='proposed' AND version=1 FROM field_time_reports WHERE id=r_rule),
    'SQ20 that refusal left the proposal exactly where it was';
  -- She may book her OWN hour on her own project.
  ASSERT (field_time_report_decide(r_rule,'accepted',1,
    '20000000-0000-4000-8000-000000000002')->>'attributed_user_id')
    ='20000000-0000-4000-8000-000000000002',
    'SQ20 a teammate can book the hour to herself';
  PERFORM pg_temp.unassume();
  ASSERT (SELECT count(*) FROM project_time_entries)=2,
    'SQ20 two bookings, two entries, and not one more';
  RAISE NOTICE 'PASS SQ20 S4 decide: forbidden/stale/decided/bad attribution refused, exactly one entry per booking, every decision audited';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. S5 — the queue, and who may write the ledger (nobody with a session)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_proposed integer; v_row record; v_n integer;
        v_reports integer; v_decisions integer;
BEGIN
  SELECT count(*) INTO v_proposed FROM field_time_reports WHERE status='proposed';
  SELECT count(*) INTO v_reports FROM field_time_reports;
  SELECT count(*) INTO v_decisions FROM field_time_report_decisions;
  ASSERT v_proposed>0 AND (SELECT count(*) FROM field_time_reports WHERE status<>'proposed')>0,
    'SQ20 the fixture has both proposed and decided reports';

  PERFORM pg_temp.assume('20000000-0000-4000-8000-000000000001');
  ASSERT (SELECT count(*) FROM field_time_report_queue)=v_proposed,
    'SQ20 the queue lists every proposal on my projects';
  ASSERT NOT EXISTS(SELECT 1 FROM field_time_report_queue q
    JOIN field_time_reports r ON r.id=q.id WHERE r.status<>'proposed'),
    'SQ20 and nothing that has been decided';
  SELECT * INTO v_row FROM field_time_report_queue q
    JOIN field_time_reports r ON r.id=q.id WHERE r.note IS NOT NULL LIMIT 1;
  ASSERT v_row.party_name='Synthetic trade' AND v_row.project_name='Hours project'
     AND v_row.task_title IS NOT NULL AND v_row.organization_id IS NOT NULL
     AND v_row.reported_hours IS NOT NULL AND v_row.version=1,
    'SQ20 the queue row names the party, the project and the visit';

  -- The ledger is read-only for every session, and it is worth being exact
  -- about WHICH layer says so. 00653 revokes INSERT/UPDATE/DELETE from
  -- authenticated and asserts that as its own postcondition (the ASSERT block at
  -- the end of the migration, which this gate runs). But
  -- supabase/seed/00-legacy-grants.sql:21-27 then loops over every public
  -- relation and GRANTs ALL back to anon, authenticated and service_role, and
  -- this gate replays that seed after the candidate on purpose. So the privilege
  -- can come back on any reseed, and what holds the door either way is the
  -- POLICY set: there is no INSERT, UPDATE or DELETE policy on either table. The
  -- way in is apply_field_effect, the way on is field_time_report_decide, and
  -- nothing else can write an hour into this ledger.
  ASSERT (SELECT count(*) FROM pg_policies WHERE schemaname='public'
            AND tablename IN ('field_time_reports','field_time_report_decisions')
            AND cmd<>'SELECT')=0,
    'SQ20 neither ledger table has an INSERT, UPDATE or DELETE policy';
  PERFORM pg_temp.refuses(
    'INSERT INTO public.field_time_reports(project_id,party_id,prompt_id,reported_hours,reported_at)
       VALUES (''20000000-0000-4000-8000-000000000020'',''20000000-0000-4000-8000-000000000030'',
               gen_random_uuid(),1,now())','42501',NULL,NULL,
    'SQ20 authenticated INSERT into the ledger');
  PERFORM pg_temp.refuses(
    'INSERT INTO public.field_time_report_decisions(report_id,version,decision)
       VALUES (gen_random_uuid(),1,''accepted'')','42501',NULL,NULL,
    'SQ20 authenticated INSERT into the audit');
  -- An UPDATE or DELETE with the privilege but no policy matches no row instead
  -- of raising; without the privilege it raises. Both are "the ledger did not
  -- move", which is the claim.
  BEGIN
    UPDATE public.field_time_reports SET status='accepted';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    ASSERT v_n=0,'SQ20 an authenticated UPDATE of the ledger changes no row';
    DELETE FROM public.field_time_reports;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    ASSERT v_n=0,'SQ20 an authenticated DELETE from the ledger removes no row';
    DELETE FROM public.field_time_report_decisions;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    ASSERT v_n=0,'SQ20 an authenticated DELETE from the audit removes no row';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL; -- the privilege itself is gone: the stronger of the two refusals
  END;
  PERFORM pg_temp.unassume();
  ASSERT (SELECT count(*) FROM field_time_reports)=v_reports
     AND (SELECT count(*) FROM field_time_report_decisions)=v_decisions
     AND (SELECT count(*) FROM field_time_reports WHERE status='proposed')=v_proposed,
    'SQ20 every row and every status is exactly where the decisions left it';

  PERFORM pg_temp.assume('20000000-0000-4000-8000-000000000002');
  ASSERT (SELECT count(*) FROM field_time_report_queue)=v_proposed,
    'SQ20 a roster teammate sees the same queue';
  PERFORM pg_temp.unassume();
  PERFORM pg_temp.assume('20000000-0000-4000-8000-000000000003');
  ASSERT (SELECT count(*) FROM field_time_report_queue)=0
     AND (SELECT count(*) FROM field_time_reports)=0
     AND (SELECT count(*) FROM field_time_report_decisions)=0,
    'SQ20 another studio sees no ledger, no queue and no audit';
  PERFORM pg_temp.unassume();
  RAISE NOTICE 'PASS SQ20 S5 queue: proposals only, scoped by project membership, ledger unwritable by any session';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. S6 — the evening ask, its footer and its budget
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE v_body text; v_closing text; v_rendered text;
BEGIN
  SELECT btrim(substr(html_content,length('{{selection}}')+1)) INTO v_closing
    FROM email_templates WHERE slug='sms_selection';
  SELECT html_content INTO v_body FROM email_templates WHERE slug='sms_hours_prompt';
  ASSERT v_body IS NOT NULL,'SQ20 sms_hours_prompt is seeded';
  ASSERT v_body = '{{studio}}: How many hours today at {{address}}? Reply with a number, like 6 or 6.5 - Ref {{code}}. '||v_closing,
    'SQ20 the ask is the contract''s copy (hyphen for the em dash, which GSM-7 has no character for) plus 00641''s one compliance line';
  ASSERT left(v_body,10)='{{studio}}','SQ20 the studio speaks first';
  ASSERT (SELECT variables FROM email_templates WHERE slug='sms_hours_prompt')
    = '["studio","address","code"]'::jsonb,'SQ20 studio, address, code and nothing else';
  ASSERT v_body ~ '^[ -~]+$',
    'SQ20 printable ASCII only: one em dash or smart quote sends the whole body as UCS-2';
  ASSERT v_body !~ '[\[\]{}\\~^|]' OR v_body ~ '\{\{',
    'SQ20 no GSM-7 extension characters outside the {{parameter}} braces';
  -- Rendered at the documented maxima: studio 24, address 36, code 3.
  v_rendered := replace(replace(replace(v_body,'{{studio}}',repeat('S',24)),
    '{{address}}',repeat('A',36)),'{{code}}','123');
  ASSERT length(v_rendered) <= 306,
    'SQ20 two GSM-7 segments at the documented parameter maxima, got '||length(v_rendered);
  ASSERT v_rendered ~ 'Msg&data rates may apply' AND v_rendered ~ 'HELP' AND v_rendered ~ 'STOP',
    'SQ20 every body ends in the one compliance line';
  RAISE NOTICE 'PASS SQ20 S6 sms_hours_prompt: exact copy, studio first, 00641 footer, % septets of 306', length(v_rendered);
END $$;

ROLLBACK;
