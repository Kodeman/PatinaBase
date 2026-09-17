-- Run via sms_prompt_concurrency_test.mjs: isolated candidate schema + ACL replay.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='15s';
-- FIXTURES BEGIN
INSERT INTO auth.users(id,email) VALUES ('51000000-0000-4000-8000-000000000001','sq51@test.invalid');
INSERT INTO profiles(id,email,full_name) VALUES ('51000000-0000-4000-8000-000000000001','sq51@test.invalid','Synthetic designer') ON CONFLICT DO NOTHING;
INSERT INTO organizations(id,type,name,slug,status) VALUES
 ('51000000-0000-4000-8000-000000000010','design_studio','Prompt test','sq51-prompt','active'),
 ('51000000-0000-4000-8000-000000000011','design_studio','Other studio','sq51-other','active');
INSERT INTO organization_members(user_id,organization_id,role,status) VALUES
 ('51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000010','owner','active');
INSERT INTO projects(id,name,designer_id,created_by,studio_id) VALUES
 ('51000000-0000-4000-8000-000000000020','Prompt project','51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000010'),
 ('51000000-0000-4000-8000-000000000021','Other project','51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000011');
INSERT INTO designer_clients(id,designer_id,client_name,status) VALUES
 ('51000000-0000-4000-8000-000000000025','51000000-0000-4000-8000-000000000001','Synthetic client','active');
INSERT INTO project_parties(id,project_id,party_kind,display_name,phone) VALUES
 ('51000000-0000-4000-8000-000000000030','51000000-0000-4000-8000-000000000020','sub','Synthetic trade','+15555100000');
INSERT INTO project_tasks(id,project_id,title,owner,owner_party_id,status,due_date) VALUES
 ('51000000-0000-4000-8000-000000000040','51000000-0000-4000-8000-000000000020','Original task','sub','51000000-0000-4000-8000-000000000030','todo','2026-11-01'),
 ('51000000-0000-4000-8000-000000000041','51000000-0000-4000-8000-000000000020','Second task','sub','51000000-0000-4000-8000-000000000030','todo','2026-11-01'),
 ('51000000-0000-4000-8000-000000000042','51000000-0000-4000-8000-000000000021','Foreign task','designer',NULL,'todo','2026-11-01');
INSERT INTO sms_conversations(id,twilio_number,phone_e164) VALUES
 ('51000000-0000-4000-8000-000000000050','+15555109999','+15555100000');
INSERT INTO studio_channel_consent(organization_id,channel_kind,channel_value,status,source,evidence,disclosure_version,recorded_by) VALUES
 ('51000000-0000-4000-8000-000000000010','sms','+15555100000','granted','web_form','Synthetic consent','test-v1','51000000-0000-4000-8000-000000000001'),
 ('51000000-0000-4000-8000-000000000011','sms','+15555100000','pending','web_form','Other pending','other-v1','51000000-0000-4000-8000-000000000001');
-- FIXTURES END

CREATE FUNCTION pg_temp.proposal(kind text DEFAULT 'report_delay', target uuid DEFAULT '51000000-0000-4000-8000-000000000040', expiry timestamptz DEFAULT now()+interval '1 day', stored boolean DEFAULT true)
RETURNS public.sms_prompts LANGUAGE plpgsql AS $$
DECLARE i uuid; p public.sms_prompts; e jsonb;
BEGIN
 e=jsonb_build_object('type',kind,'target',jsonb_build_object('kind','task','id',target),'new_date','2026-11-04','note','original proposal');
 SELECT id INTO i FROM public.sms_create_prompt('51000000-0000-4000-8000-000000000030','51000000-0000-4000-8000-000000000020',kind,
 CASE WHEN kind='optin' THEN NULL ELSE target END, (SELECT COALESCE(max(version),0)+1 FROM sms_prompts),expiry,'+15555109999','+15555100000',CASE WHEN stored AND kind<>'optin' THEN e ELSE NULL END);
 SELECT * INTO p FROM public.sms_prompts WHERE id=i; RETURN p;
END $$;
CREATE FUNCTION pg_temp.message(p public.sms_prompts,verb text DEFAULT 'YES') RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE i uuid:=gen_random_uuid();
BEGIN
 INSERT INTO public.sms_messages(id,conversation_id,direction,body,twilio_sid)
 VALUES(i,'51000000-0000-4000-8000-000000000050','inbound',verb||' '||p.short_code,'SM'||replace(i::text,'-',''));
 RETURN i;
END $$;
CREATE FUNCTION pg_temp.apply(p public.sms_prompts,m uuid,e jsonb DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.sms_apply_prompt(p.id,'+15555109999','+15555100000',m,e);
$$;
CREATE FUNCTION pg_temp.grant_optin(p public.sms_prompts,m uuid) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.sms_grant_optin_prompt(p.id,'+15555109999','+15555100000',m);
$$;
CREATE FUNCTION pg_temp.must_fail(q text, label text, expected text DEFAULT '23514') RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE q; EXCEPTION WHEN OTHERS THEN
   IF SQLSTATE=expected THEN RETURN; ELSE RAISE; END IF;
 END;
 RAISE EXCEPTION 'ASSERT expected refusal: %',label;
END $$;

DO $$ DECLARE p public.sms_prompts; other public.sms_prompts; m uuid; r jsonb; again jsonb;
BEGIN
 p:=pg_temp.proposal(); m:=pg_temp.message(p);
 other:=pg_temp.proposal('report_delay','51000000-0000-4000-8000-000000000041');
 -- Mutable context is deliberately unrelated; authority lives on p.
 UPDATE sms_conversations SET state_context='{"pending_effect":{"new_date":"2099-01-01"}}' WHERE id='51000000-0000-4000-8000-000000000050';
 SET LOCAL ROLE service_role;
 r:=pg_temp.apply(p,m);
 RESET ROLE;
 ASSERT r->>'status'='applied','original proposal applied';
 ASSERT (SELECT due_date=DATE '2026-11-04' FROM project_tasks WHERE id=p.subject_id),'original date survives another proposal and overwritten context';
 again:=pg_temp.apply(p,m);
 ASSERT again->>'status'='replayed' AND again->'result'=r->'result','same SID returns recorded result';
 ASSERT pg_temp.apply(p,pg_temp.message(p))->>'status'='closed','different SID gets closed';
 ASSERT public.sms_prompt_receipt('+15555109999','+15555100000',m)->'result'=r->'result','commit-ambiguous receipt lookup before dedupe';
 PERFORM pg_temp.must_fail(format('UPDATE sms_prompts SET proposed_effect=%L WHERE id=%L','{}',p.id),'immutable payload');
 PERFORM pg_temp.must_fail(format('UPDATE sms_prompts SET consumed_sid=%L WHERE id=%L','replacement',p.id),'write-once SID');
 PERFORM pg_temp.must_fail(format('UPDATE sms_prompts SET consumption_result=%L WHERE id=%L','{}',p.id),'write-once receipt');
 PERFORM pg_temp.must_fail(format('UPDATE sms_prompts SET answered_at=NULL WHERE id=%L',p.id),'write-once closure');
 ASSERT public.sms_prompt_receipt('+15555109998','+15555100000',m) IS NULL,'wrong pair cannot recover receipt';
 RAISE NOTICE 'PASS original date, receipt replay/recovery, immutability, distinct-SID closure';
END $$;

DO $$ DECLARE p public.sms_prompts; m uuid; e jsonb;
BEGIN
 p:=pg_temp.proposal(); m:=pg_temp.message(p,'NO');
 PERFORM pg_temp.must_fail(format('SELECT pg_temp.apply(%L::sms_prompts,%L)',p,m),'nonaffirmative proposal');
 m:=pg_temp.message(p,'DONE');
 PERFORM pg_temp.must_fail(format('SELECT pg_temp.apply(%L::sms_prompts,%L)',p,m),'conflicting proposal verb');
 m:=pg_temp.message(p);
 PERFORM pg_temp.must_fail(format('SELECT pg_temp.apply(%L::sms_prompts,%L,%L)',p,m,p.proposed_effect),'caller cannot replace stored payload');
 PERFORM pg_temp.must_fail(format('SELECT sms_apply_prompt(%L,%L,%L,%L)',p.id,'+15555109998','+15555100000',m),'wrong endpoint');
 UPDATE sms_messages SET twilio_sid=NULL WHERE id=m;
 PERFORM pg_temp.must_fail(format('SELECT pg_temp.apply(%L::sms_prompts,%L)',p,m),'missing SID');
 UPDATE sms_messages SET twilio_sid='SM-test-missing',direction='outbound' WHERE id=m;
 PERFORM pg_temp.must_fail(format('SELECT pg_temp.apply(%L::sms_prompts,%L)',p,m),'outbound message');
 UPDATE sms_messages SET direction='inbound',project_id='51000000-0000-4000-8000-000000000021' WHERE id=m;
 PERFORM pg_temp.must_fail(format('SELECT pg_temp.apply(%L::sms_prompts,%L)',p,m),'foreign message project');
 PERFORM pg_temp.must_fail('SELECT pg_temp.proposal(''report_delay'',''51000000-0000-4000-8000-000000000042'')','foreign target');
 PERFORM pg_temp.must_fail('SELECT pg_temp.proposal(''report_condition'')','condition remains review-only');
 p:=pg_temp.proposal('report_delay','51000000-0000-4000-8000-000000000040',now()-interval '1 second');
 ASSERT pg_temp.apply(p,pg_temp.message(p))->>'status'='expired','expired prompt cannot apply';
 p:=pg_temp.proposal(); UPDATE sms_prompts SET answered_at=now() WHERE id=p.id;
 ASSERT pg_temp.apply(p,pg_temp.message(p))->>'status'='closed','cancellation is closed without receipt';
 PERFORM pg_temp.must_fail(format('UPDATE sms_prompts SET consumed_sid=%L, consumption_result=%L WHERE id=%L','SM-fabricated','{"kind":"effect","result":{}}',p.id),'cannot turn cancellation into receipt');
 p:=pg_temp.proposal('report_arrival');
 PERFORM pg_temp.must_fail(format('SELECT pg_temp.apply(%L::sms_prompts,%L)',p,pg_temp.message(p)),'guarded authority', '42501');
 ASSERT NOT EXISTS(SELECT 1 FROM field_delivery_reports WHERE party_id=p.party_id),'authority refusal leaves no delivery report';
 p:=pg_temp.proposal('confirm_availability','51000000-0000-4000-8000-000000000041',now()+interval '1 day',false);
 e:=jsonb_build_object('type','mark_done','target',jsonb_build_object('kind','task','id',p.subject_id));
 ASSERT pg_temp.apply(p,pg_temp.message(p,'DONE'),e)->>'status'='applied','command-only creation and DONE remain usable';
 RAISE NOTICE 'PASS binding/verb/payload refusals, expiry/cancellation, guarded authority, command-only compatibility';
END $$;

DO $$ DECLARE p public.sms_prompts; m uuid; n integer; r jsonb; i uuid;
BEGIN
 SELECT count(*) INTO n FROM sms_prompts;
 PERFORM pg_temp.must_fail($q$SELECT sms_create_prompt(
   '51000000-0000-4000-8000-000000000030','51000000-0000-4000-8000-000000000020','report_delay',
   '51000000-0000-4000-8000-000000000040',888,now()+interval '1 day','+15555109999','+15555100000',
   '{"type":"mark_done","target":{"kind":"task","id":"51000000-0000-4000-8000-000000000040"}}')$q$,'mismatched payload type');
 ASSERT (SELECT count(*)=n FROM sms_prompts),'failed payload persistence offers no prompt/code';
 -- The existing eight named arguments used by dispatch and START still bind.
 SELECT id INTO i FROM sms_create_prompt(
   p_party_id=>'51000000-0000-4000-8000-000000000030',p_project_id=>'51000000-0000-4000-8000-000000000020',
   p_kind=>'optin',p_subject_id=>NULL,p_version=>888,p_expires_at=>now()+interval '1 day',
   p_sender_number=>'+15555109999',p_recipient_phone=>'+15555100000');
 ASSERT (SELECT proposed_effect IS NULL FROM sms_prompts WHERE id=i),'eight-argument optin compatibility';
 INSERT INTO client_decisions(id,designer_client_id,designer_id,project_id,title,decision_type,coordination_kind,court,court_party_id,blocks_kind,status)
 VALUES('51000000-0000-4000-8000-000000000060','51000000-0000-4000-8000-000000000025','51000000-0000-4000-8000-000000000001',
 '51000000-0000-4000-8000-000000000020','Synthetic delivery','approval','signoff','sub','51000000-0000-4000-8000-000000000030','none','pending');
 SELECT id INTO i FROM sms_create_prompt('51000000-0000-4000-8000-000000000030','51000000-0000-4000-8000-000000000020','confirm_delivery',
 '51000000-0000-4000-8000-000000000060',888,now()+interval '1 day','+15555109999','+15555100000',
 '{"type":"confirm_delivery","target":{"kind":"coordination","id":"51000000-0000-4000-8000-000000000060"},"note":"delivery noted"}');
 SELECT * INTO p FROM sms_prompts WHERE id=i;
 r:=pg_temp.apply(p,pg_temp.message(p));
 ASSERT r->>'status'='applied' AND (r#>>'{result,result,applied}')::boolean=false,'recognized note-only result still earns receipt';
 -- Retirement changes allocation only, never a recorded receipt.
 p:=pg_temp.proposal('flag_blocker'); m:=pg_temp.message(p); r:=pg_temp.apply(p,m);
 UPDATE sms_prompts SET code_reserved=false WHERE id=p.id;
 ASSERT public.sms_prompt_receipt('+15555109999','+15555100000',m)->'result'=r->'result','receipt survives code retirement';
 RAISE NOTICE 'PASS atomic payload creation, eight-argument optin, legacy note-only result and retired-code receipt';
END $$;

-- SQ-55 cases 1-3: retain both legacy kinds, including the defaulted eight-arg
-- command door. Exercise both target shapes accepted by the guarded wrapper.
INSERT INTO client_decisions(id,designer_client_id,designer_id,project_id,title,decision_type,coordination_kind,court,court_party_id,blocks_kind,status)
VALUES('51000000-0000-4000-8000-000000000061','51000000-0000-4000-8000-000000000025','51000000-0000-4000-8000-000000000001',
 '51000000-0000-4000-8000-000000000020','Legacy target','approval','signoff','sub','51000000-0000-4000-8000-000000000030','none','pending');
CREATE FUNCTION pg_temp.legacy_payload(kind text, target_kind text DEFAULT 'task') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('type',kind,'target',jsonb_build_object('kind',target_kind,'id',
   CASE WHEN target_kind='task' THEN '51000000-0000-4000-8000-000000000040' ELSE '51000000-0000-4000-8000-000000000061' END),
   'note','original proposal','media','["synthetic/photo.jpg"]'::jsonb);
$$;
CREATE FUNCTION pg_temp.legacy_prompt(e jsonb, stored boolean DEFAULT true) RETURNS public.sms_prompts LANGUAGE plpgsql AS $$
DECLARE i uuid; p public.sms_prompts; failure text;
BEGIN
 BEGIN
  IF stored THEN
   SELECT id INTO i FROM sms_create_prompt('51000000-0000-4000-8000-000000000030','51000000-0000-4000-8000-000000000020',
    e->>'type',(e#>>'{target,id}')::uuid,1,now()+interval '1 day','+15555109999','+15555100000',e);
  ELSE
   SELECT id INTO i FROM sms_create_prompt('51000000-0000-4000-8000-000000000030','51000000-0000-4000-8000-000000000020',
    e->>'type',(e#>>'{target,id}')::uuid,1,now()+interval '1 day','+15555109999','+15555100000');
  END IF;
 EXCEPTION WHEN OTHERS THEN failure:=SQLSTATE||' '||SQLERRM;
 END;
 ASSERT failure IS NULL, 'legacy '||(e->>'type')||' proposal creation supported: '||COALESCE(failure,'');
 SELECT * INTO STRICT p FROM sms_prompts WHERE id=i; RETURN p;
END $$;

DO $$ DECLARE k text; target_kind text; stored boolean; e jsonb; p public.sms_prompts; m uuid; r jsonb; again jsonb; n integer; failure text;
BEGIN
 FOREACH k IN ARRAY ARRAY['note','punch_report'] LOOP
  FOREACH target_kind IN ARRAY ARRAY['task','coordination'] LOOP
   FOREACH stored IN ARRAY ARRAY[true,false] LOOP
    e:=pg_temp.legacy_payload(k,target_kind); p:=pg_temp.legacy_prompt(e,stored); m:=pg_temp.message(p);
    ASSERT p.party_id='51000000-0000-4000-8000-000000000030' AND p.project_id='51000000-0000-4000-8000-000000000020', 'legacy prompt actor/project bound';
    ASSERT p.proposed_effect IS NOT DISTINCT FROM CASE WHEN stored THEN e ELSE NULL END, 'legacy original note/media persisted verbatim';
    UPDATE sms_conversations SET state_context='{"pending_effect":{"type":"note","note":"replacement","media":["wrong.jpg"]}}'
     WHERE id='51000000-0000-4000-8000-000000000050';
    SELECT count(*) INTO n FROM client_decisions;
    failure:=NULL;
    BEGIN
     SET LOCAL ROLE service_role;
     r:=pg_temp.apply(p,m,CASE WHEN stored THEN NULL ELSE e END);
     RESET ROLE;
    EXCEPTION WHEN OTHERS THEN failure:=SQLSTATE||' '||SQLERRM;
    END;
    ASSERT failure IS NULL, 'legacy '||k||' command/proposal consumption supported: '||COALESCE(failure,'');
    ASSERT r->>'status'='applied' AND r#>>'{result,kind}'='effect' AND r#>>'{result,result,effect_type}'=k, 'legacy kind earns atomic receipt';
    ASSERT (r#>>'{result,result,applied}')::boolean=(k='punch_report'), 'note false / punch_report true is a successful guarded result';
    ASSERT (SELECT consumption_result=r->'result' AND consumed_sid=(SELECT twilio_sid FROM sms_messages WHERE id=m) AND answered_at IS NOT NULL FROM sms_prompts WHERE id=p.id), 'legacy receipt and closure agree';
    ASSERT (SELECT applied_effect=r#>'{result,result}' FROM sms_messages WHERE id=m), 'legacy message stamp equals receipt';
    IF k='note' THEN
     ASSERT r#>>'{result,result,summary_text}'='original proposal', 'note uses original proposal not mutable context';
     ASSERT (SELECT count(*)=n FROM client_decisions), 'note creates no structural item';
    ELSE
     ASSERT (SELECT count(*)=n+1 FROM client_decisions), 'punch creates exactly one item';
     ASSERT (SELECT project_id=p.project_id AND designer_id='51000000-0000-4000-8000-000000000001' AND coordination_kind='punch'
       AND court='designer' AND title='original proposal' AND context=E'original proposal\nPhotos: 1'
       FROM client_decisions WHERE id=(r#>>'{result,result,item_id}')::uuid), 'punch preserves note/media and party project';
     ASSERT (SELECT matched_coordination_item_id=(r#>>'{result,result,item_id}')::uuid FROM sms_messages WHERE id=m), 'punch message links created item';
    END IF;
    SELECT count(*) INTO n FROM client_decisions;
    again:=pg_temp.apply(p,m,CASE WHEN stored THEN NULL ELSE e END);
    ASSERT again->>'status'='replayed' AND again->'result'=r->'result', 'legacy same-SID replay returns exact result';
    ASSERT sms_prompt_receipt('+15555109999','+15555100000',m)->'result'=r->'result', 'legacy receipt independently recoverable';
    ASSERT pg_temp.apply(p,pg_temp.message(p),CASE WHEN stored THEN NULL ELSE e END)->>'status'='closed', 'legacy distinct SID cannot reapply';
    ASSERT (SELECT count(*)=n FROM client_decisions), 'legacy replay creates no duplicate item';
    RAISE NOTICE 'PASS legacy % / % / stored=%: original payload, guarded result, atomic receipt, same-SID replay',k,target_kind,stored;
   END LOOP;
  END LOOP;
  PERFORM pg_temp.must_fail(format('SELECT pg_temp.proposal(%L,%L)',k,'51000000-0000-4000-8000-000000000042'),'legacy foreign target refused');
 END LOOP;
 PERFORM pg_temp.must_fail('SELECT pg_temp.proposal(''unknown_effect'')','unknown effect remains refused');
END $$;

-- A SQL failure in note/message work is NOT a successful applied=false note.
CREATE FUNCTION pg_temp.fail_legacy_stamp() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.applied_effect->>'effect_type' IN ('note','punch_report') THEN
  RAISE EXCEPTION 'injected message failure' USING ERRCODE='22000';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sq57_fail_stamp BEFORE UPDATE ON sms_messages FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_legacy_stamp();
DO $$ DECLARE k text; p public.sms_prompts; m uuid; n integer;
BEGIN
 FOREACH k IN ARRAY ARRAY['note','punch_report'] LOOP
  p:=pg_temp.legacy_prompt(pg_temp.legacy_payload(k)); m:=pg_temp.message(p);
  SELECT count(*) INTO n FROM client_decisions;
  PERFORM pg_temp.must_fail(format('SELECT pg_temp.apply(%L::sms_prompts,%L)',p,m),'legacy SQL error propagated','22000');
  ASSERT (SELECT count(*)=n FROM client_decisions), 'legacy failed SQL rolls back business work';
  ASSERT (SELECT answered_at IS NULL AND consumed_sid IS NULL AND consumption_result IS NULL FROM sms_prompts WHERE id=p.id), 'legacy failed SQL never earns receipt';
  ASSERT (SELECT applied_effect IS NULL AND matched_coordination_item_id IS NULL FROM sms_messages WHERE id=m), 'legacy failed SQL leaves message unstamped';
  RAISE NOTICE 'PASS legacy % SQLSTATE preserved without false receipt',k;
 END LOOP;
END $$;
DROP TRIGGER sq57_fail_stamp ON sms_messages;

-- Throw AFTER business work and BEFORE receipt: statement rollback must undo all.
CREATE FUNCTION pg_temp.fail_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF NEW.consumed_sid IS NOT NULL THEN RAISE EXCEPTION 'injected receipt failure' USING ERRCODE='P0001'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER sq51_fail_receipt BEFORE UPDATE ON sms_prompts FOR EACH ROW EXECUTE FUNCTION pg_temp.fail_receipt();
DO $$ DECLARE k text; target_kind text; stored boolean; e jsonb; p public.sms_prompts; m uuid; n integer; before_message jsonb;
BEGIN
 FOREACH k IN ARRAY ARRAY['note','punch_report'] LOOP
  FOREACH target_kind IN ARRAY ARRAY['task','coordination'] LOOP
   FOREACH stored IN ARRAY ARRAY[true,false] LOOP
    e:=pg_temp.legacy_payload(k,target_kind); p:=pg_temp.legacy_prompt(e,stored); m:=pg_temp.message(p);
    SELECT count(*) INTO n FROM client_decisions;
    SELECT to_jsonb(s) INTO before_message FROM sms_messages s WHERE id=m;
    PERFORM pg_temp.must_fail(format('SELECT pg_temp.apply(%L::sms_prompts,%L,%L)',p,m,CASE WHEN stored THEN NULL ELSE e END),'legacy receipt failure propagates','P0001');
    ASSERT (SELECT count(*)=n FROM client_decisions), 'legacy failed receipt rolls back punch item';
    ASSERT (SELECT answered_at IS NULL AND consumed_sid IS NULL AND consumption_result IS NULL FROM sms_prompts WHERE id=p.id), 'legacy failed receipt leaves prompt open';
    ASSERT (SELECT to_jsonb(s)=before_message FROM sms_messages s WHERE id=m), 'legacy failed receipt rolls back entire message stamp';
    ASSERT sms_prompt_receipt('+15555109999','+15555100000',m) IS NULL, 'legacy failed receipt cannot be recovered as success';
    RAISE NOTICE 'PASS legacy % / % / stored=%: receipt failure rolls back business/message/closure',k,target_kind,stored;
   END LOOP;
  END LOOP;
 END LOOP;
END $$;
DO $$ DECLARE p public.sms_prompts; m uuid; n integer;
BEGIN
 p:=pg_temp.proposal('flag_blocker'); m:=pg_temp.message(p);
 SELECT count(*) INTO n FROM client_decisions;
 PERFORM pg_temp.must_fail(format('SELECT pg_temp.apply(%L::sms_prompts,%L)',p,m),'effect+receipt rollback','P0001');
 ASSERT (SELECT count(*)=n FROM client_decisions),'failed receipt rolls back RFI';
 ASSERT (SELECT answered_at IS NULL AND consumed_sid IS NULL FROM sms_prompts WHERE id=p.id),'failed receipt leaves prompt open';
 ASSERT (SELECT applied_effect IS NULL FROM sms_messages WHERE id=m),'failed receipt rolls back message stamping';
 UPDATE studio_channel_consent SET status='pending' WHERE organization_id='51000000-0000-4000-8000-000000000010';
 p:=pg_temp.proposal('optin'); m:=pg_temp.message(p);
 PERFORM pg_temp.must_fail(format('SELECT pg_temp.grant_optin(%L::sms_prompts,%L)',p,m),'grant+receipt rollback','P0001');
 ASSERT (SELECT status='pending' FROM studio_channel_consent WHERE organization_id='51000000-0000-4000-8000-000000000010'),'failed receipt rolls back grant';
 RAISE NOTICE 'PASS effect and optin receipt-failure atomic rollback';
END $$;
DROP TRIGGER sq51_fail_receipt ON sms_prompts;

DO $$ DECLARE p public.sms_prompts; m uuid; r jsonb;
BEGIN
 UPDATE studio_channel_consent SET opt_out_at='2026-01-01',opt_out_source='inbound_sms',opt_out_evidence='old STOP',opt_out_recorded_at='2026-01-01',refusal_unanswered=false WHERE organization_id='51000000-0000-4000-8000-000000000010';
 p:=pg_temp.proposal('optin'); m:=pg_temp.message(p);
 r:=pg_temp.grant_optin(p,m);
 ASSERT r->>'status'='granted','coded optin grants pending record';
 ASSERT pg_temp.grant_optin(p,m)->'result'=r->'result','optin same SID replay';
 ASSERT pg_temp.grant_optin(p,pg_temp.message(p))->>'status'='closed','optin other SID closed';
 ASSERT (SELECT status='pending' FROM studio_channel_consent WHERE organization_id='51000000-0000-4000-8000-000000000011'),'coded optin leaves other studio pending';
 ASSERT (SELECT source='inbound_sms' AND evidence='YES '||p.short_code AND disclosure_version='test-v1' AND recorded_by='51000000-0000-4000-8000-000000000001' AND opt_out_evidence='old STOP' AND opt_out_at='2026-01-01' AND origin_project_id=p.project_id FROM studio_channel_consent WHERE organization_id='51000000-0000-4000-8000-000000000010'),'grant preserves disclosure recorder and refusal history';
 p:=pg_temp.proposal('optin'); m:=pg_temp.message(p);
 ASSERT pg_temp.grant_optin(p,m)->>'status'='not_pending','cannot grant granted record again';
 UPDATE studio_channel_consent SET status='pending',refusal_unanswered=true WHERE organization_id='51000000-0000-4000-8000-000000000010';
 ASSERT pg_temp.grant_optin(p,m)->>'status'='not_pending','refusal beats pending';
 UPDATE studio_channel_consent SET refusal_unanswered=false,disclosure_version=NULL WHERE organization_id='51000000-0000-4000-8000-000000000010';
 PERFORM pg_temp.must_fail(format('SELECT pg_temp.grant_optin(%L::sms_prompts,%L)',p,m),'missing disclosure');
 UPDATE studio_channel_consent SET disclosure_version='test-v1' WHERE organization_id='51000000-0000-4000-8000-000000000010';
 UPDATE sms_messages SET body='YES' WHERE id=m;
 PERFORM pg_temp.must_fail(format('SELECT pg_temp.grant_optin(%L::sms_prompts,%L)',p,m),'coded YES required');
 UPDATE sms_messages SET body='YES '||p.short_code WHERE id=m;
 INSERT INTO sms_suppressions(sender_number,recipient_phone) VALUES('+15555109999','+15555100000');
 ASSERT pg_temp.grant_optin(p,m)->>'status'='suppressed','suppression beats optin';
 p:=pg_temp.proposal();
 ASSERT pg_temp.apply(p,pg_temp.message(p))->>'status'='suppressed','suppression beats effect';
 UPDATE sms_suppressions SET lifted_at=now();
 ASSERT pg_temp.apply(p,pg_temp.message(p))->>'status'='not_consented','lifting suppression restores no grant';
 DELETE FROM studio_channel_consent WHERE organization_id='51000000-0000-4000-8000-000000000010';
 p:=pg_temp.proposal('optin');
 ASSERT pg_temp.grant_optin(p,pg_temp.message(p))->>'status'='not_pending','missing consent never inserted';
 RAISE NOTICE 'PASS pending-only optin, disclosure/refusal history, suppression and no-record refusal';
END $$;

DO $$ DECLARE signature text; role_name text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
 'sms_create_prompt(uuid,uuid,text,uuid,integer,timestamptz,text,text,jsonb)',
 'sms_apply_prompt(uuid,text,text,uuid,jsonb)','sms_grant_optin_prompt(uuid,text,text,uuid)',
 'sms_prompt_receipt(text,text,uuid)'] LOOP
   FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
     ASSERT NOT has_function_privilege(role_name,signature,'EXECUTE'),'RPC denies '||role_name||' '||signature;
   END LOOP;
   ASSERT has_function_privilege('service_role',signature,'EXECUTE'),'service role can consume';
 END LOOP;
 FOREACH signature IN ARRAY ARRAY['sms_validate_prompt_effect(uuid,text,uuid,jsonb)','sms_prompt_message(sms_prompts,text,text,uuid)','sms_prompt_reply_verb(sms_prompts,text)'] LOOP
   ASSERT NOT has_function_privilege('service_role',signature,'EXECUTE'),'internal helper not a public RPC';
 END LOOP;
 ASSERT to_regprocedure('sms_create_prompt(uuid,uuid,text,uuid,integer,timestamptz,text,text)') IS NULL,'old overload dropped';
 ASSERT NOT has_table_privilege('authenticated','sms_prompts','UPDATE'),'untrusted callers cannot fabricate receipt';
 RAISE NOTICE 'PASS service-only ACLs after seed replay and old overload removal';
END $$;
ROLLBACK;
