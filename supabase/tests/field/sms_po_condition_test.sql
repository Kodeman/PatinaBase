-- Standalone, synthetic, rolled back; run only in the disposable controller DB.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='15s';

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

-- PO FIXTURES BEGIN
INSERT INTO vendors(id,name) VALUES ('77000000-0000-4000-8000-000000000001','Synthetic vendor');
INSERT INTO purchase_orders(id,designer_id,project_id,vendor_id,payment_pattern,confirmed_eta) VALUES
 ('77000000-0000-4000-8000-000000000002','51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000020','77000000-0000-4000-8000-000000000001','net_30',CURRENT_DATE),
 ('77000000-0000-4000-8000-000000000003','51000000-0000-4000-8000-000000000001','51000000-0000-4000-8000-000000000021','77000000-0000-4000-8000-000000000001','net_30',CURRENT_DATE);
INSERT INTO project_party_authority(engagement_id,scope,effective_from)
 VALUES ('51000000-0000-4000-8000-000000000030','site_access',CURRENT_DATE-1);
-- PO FIXTURES END
CREATE FUNCTION pg_temp.po_effect(kind text, target uuid DEFAULT '77000000-0000-4000-8000-000000000002') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('type',kind,'target',jsonb_build_object('kind','purchase_order','id',target),
 'condition',jsonb_build_object('ok',false,'note','dented corner'),'note','dented corner');
$$;
GRANT EXECUTE ON FUNCTION pg_temp.po_effect(text, uuid) TO PUBLIC;
CREATE FUNCTION pg_temp.po_prompt(kind text DEFAULT 'confirm_delivery',subject uuid DEFAULT '77000000-0000-4000-8000-000000000002', stored jsonb DEFAULT NULL) RETURNS sms_prompts LANGUAGE plpgsql AS $$
DECLARE i uuid;p sms_prompts;
BEGIN
 SELECT id INTO i FROM sms_create_prompt('51000000-0000-4000-8000-000000000030','51000000-0000-4000-8000-000000000020',kind,subject,1,clock_timestamp()+interval '1 day','+15555109999','+15555100000',stored);
 SELECT * INTO p FROM sms_prompts WHERE id=i; RETURN p;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.po_prompt(text, uuid, jsonb) TO PUBLIC;
CREATE FUNCTION pg_temp.po_message(body text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE i uuid:=gen_random_uuid(); BEGIN
 INSERT INTO sms_messages(id,conversation_id,direction,body,twilio_sid) VALUES(i,'51000000-0000-4000-8000-000000000050','inbound',body,'SM'||replace(i::text,'-',''));
 RETURN i;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.po_message(text) TO PUBLIC;
CREATE FUNCTION pg_temp.po_apply(p sms_prompts,m uuid,e jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT sms_apply_prompt(p.id,'+15555109999','+15555100000',m,e);
$$;
GRANT EXECUTE ON FUNCTION pg_temp.po_apply(sms_prompts, uuid, jsonb) TO PUBLIC;
CREATE FUNCTION pg_temp.po_refuses(p sms_prompts,m uuid,e jsonb,label text,expected text DEFAULT '23514') RETURNS void LANGUAGE plpgsql AS $$
DECLARE before_p jsonb;before_m jsonb;before_r jsonb;failed boolean:=false;
BEGIN
 SELECT to_jsonb(t) INTO before_p FROM sms_prompts t WHERE id=p.id;
 SELECT to_jsonb(t) INTO before_m FROM sms_messages t WHERE id=m;
 SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') INTO before_r FROM field_delivery_reports t;
 BEGIN PERFORM pg_temp.po_apply(p,m,e); EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected THEN RAISE; END IF;failed:=true;
 END;
 ASSERT failed,label||' refused';
 ASSERT (SELECT to_jsonb(t)=before_p FROM sms_prompts t WHERE id=p.id),label||' prompt unchanged';
 ASSERT (SELECT to_jsonb(t)=before_m FROM sms_messages t WHERE id=m),label||' inbound unchanged';
 ASSERT (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]')=before_r FROM field_delivery_reports t),label||' reports unchanged';
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.po_refuses(sms_prompts, uuid, jsonb, text, text) TO PUBLIC;
DO $$ DECLARE p sms_prompts;m uuid;r jsonb;receipt jsonb;body text;kind text;before_po jsonb;before_receiving jsonb;
BEGIN
 SELECT jsonb_agg(to_jsonb(t) ORDER BY id) INTO before_po FROM purchase_orders t;
 SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]') INTO before_receiving FROM receiving_inspections t;
 FOR body,kind IN SELECT * FROM (VALUES ('OK','confirm_delivery'),('HERE','report_arrival'),('DAMAGED','report_condition'),('DAMAGE','report_condition'),('GOOD','confirm_delivery'),('FINE','confirm_delivery')) v LOOP
  p:=pg_temp.po_prompt();m:=pg_temp.po_message(body||' '||p.short_code);
  SET LOCAL ROLE service_role;
  r:=pg_temp.po_apply(p,m,pg_temp.po_effect(kind));
  RESET ROLE;
  ASSERT r->>'status'='applied','SQ77 PO '||body||' applies atomically';
  ASSERT (SELECT subject_kind='purchase_order' AND subject_id=p.subject_id AND project_id=p.project_id FROM field_delivery_reports), 'SQ77 PO immutable target report';
  IF kind='report_condition' THEN
   ASSERT (SELECT condition_ok=false AND condition_note='dented corner' AND condition_at IS NOT NULL FROM field_delivery_reports),'SQ77 damage payload saved';
   ASSERT (SELECT needs_review AND owner_user_id='51000000-0000-4000-8000-000000000001' FROM sms_messages WHERE id=m),'SQ77 damage has review owner';
  ELSE ASSERT (SELECT arrived_at IS NOT NULL FROM field_delivery_reports),'SQ77 delivery is presence not receipt';END IF;
  receipt:=sms_prompt_receipt('+15555109999','+15555100000',m);
  ASSERT receipt->'result'=r->'result','SQ77 exact immutable receipt';
  ASSERT pg_temp.po_apply(p,m,pg_temp.po_effect('report_condition'))->>'status'='replayed','SQ77 same SID replay';
  ASSERT pg_temp.po_apply(p,pg_temp.po_message(body||' '||p.short_code),pg_temp.po_effect(kind))->>'status'='closed','SQ77 distinct later SID closed';
 END LOOP;
 p:=pg_temp.po_prompt('report_condition');m:=pg_temp.po_message('dented corner');
 ASSERT pg_temp.po_apply(p,m,pg_temp.po_effect('report_condition'))->>'status'='applied','SQ77 freeform condition applies';
 ASSERT (SELECT jsonb_agg(to_jsonb(t) ORDER BY id)=before_po FROM purchase_orders t),'SQ77 purchase orders unchanged';
 ASSERT (SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY id),'[]')=before_receiving FROM receiving_inspections t),'SQ77 receiving unchanged';
 ASSERT NOT EXISTS(SELECT 1 FROM project_time_entries),'SQ77 no time entries';
 -- Tenant and immutable-subject validation both fail before consumption.
 p:=pg_temp.po_prompt('report_condition','77000000-0000-4000-8000-000000000003');
 PERFORM pg_temp.po_refuses(p,pg_temp.po_message('DAMAGED '||p.short_code),pg_temp.po_effect('report_condition','77000000-0000-4000-8000-000000000003'),'SQ77 foreign studio PO');
 UPDATE sms_prompts SET answered_at=clock_timestamp() WHERE id=p.id;
 p:=pg_temp.po_prompt();
 PERFORM pg_temp.po_refuses(p,pg_temp.po_message('DAMAGED '||p.short_code),pg_temp.po_effect('report_condition','77000000-0000-4000-8000-000000000003'),'SQ77 immutable PO subject');
 FOREACH body IN ARRAY ARRAY['DAMAGED 99','DAMAGED 99 please','GOOD 1','STOP now','YES please','17 dented corner'] LOOP
  PERFORM pg_temp.po_refuses(p,pg_temp.po_message(body),pg_temp.po_effect('report_condition'),'SQ77 wrong code/control '||body);
 END LOOP;
 PERFORM pg_temp.po_refuses(p,pg_temp.po_message('DAMAGED '||p.short_code),jsonb_set(pg_temp.po_effect('report_condition'),'{condition,ok}','true'),'SQ77 DAMAGE cannot become clean');
 PERFORM pg_temp.po_refuses(p,pg_temp.po_message('HERE '||p.short_code),pg_temp.po_effect('report_condition'),'SQ77 mismatched effect');
 DELETE FROM project_party_authority WHERE engagement_id=p.party_id;
 PERFORM pg_temp.po_refuses(p,pg_temp.po_message('HERE '||p.short_code),pg_temp.po_effect('report_arrival'),'SQ77 arrival needs authority','42501');
 UPDATE sms_prompts SET answered_at=clock_timestamp() WHERE id=p.id;
 -- Proposals keep YES-only and their original stored payload.
 p:=pg_temp.po_prompt('report_condition','77000000-0000-4000-8000-000000000002',pg_temp.po_effect('report_condition'));
 PERFORM pg_temp.po_refuses(p,pg_temp.po_message('dented corner'),NULL,'SQ77 proposal forbids freeform');
 ASSERT pg_temp.po_apply(p,pg_temp.po_message('YES '||p.short_code),NULL)->>'status'='applied','SQ77 stored condition proposal applies';
 -- Negative control: task DONE remains the legacy completion, not a PO report.
 p:=pg_temp.po_prompt('mark_done','51000000-0000-4000-8000-000000000040');
 ASSERT pg_temp.po_apply(p,pg_temp.po_message('DONE '||p.short_code),'{"type":"mark_done","target":{"kind":"task","id":"51000000-0000-4000-8000-000000000040"}}')->>'status'='applied','SQ77 task ref unchanged';
 ASSERT (SELECT status='done' FROM project_tasks WHERE id=p.subject_id),'SQ77 task DONE still closes task';
 RAISE NOTICE 'PASS SQ77 condition/PO atomic receipt, tenant refusals, no receiving/time writes, task negative control';
END $$;
-- SQ85: the authoritative condition note is the whole trimmed reply, never
-- the parser's 200-character preview. Prove both insert and update rollback.
DO $$ DECLARE p sms_prompts;m uuid;e jsonb;r jsonb;body text;
BEGIN
 DELETE FROM field_delivery_reports;
 UPDATE sms_prompts SET answered_at=clock_timestamp() WHERE answered_at IS NULL;
 p:=pg_temp.po_prompt();
 body:='damaged '||repeat('x',1993);
 e:=jsonb_set(pg_temp.po_effect('report_condition'),'{condition,note}',to_jsonb(body));
 e:=jsonb_set(e,'{note}',to_jsonb(left(body,200)));
 m:=pg_temp.po_message(body);
 PERFORM pg_temp.po_refuses(p,m,e,'SQ85 2001-character insert whole-row rollback');
 ASSERT NOT EXISTS(SELECT 1 FROM field_delivery_reports),'SQ85 overlength creates no partial report';
 ASSERT (SELECT answered_at IS NULL AND consumed_sid IS NULL AND consumption_result IS NULL FROM sms_prompts WHERE id=p.id),'SQ85 refused prompt stays open';
 ASSERT sms_prompt_receipt('+15555109999','+15555100000',m) IS NULL,'SQ85 refused reply has no success receipt';
 body:='damaged '||repeat('x',1992);
 e:=jsonb_set(e,'{condition,note}',to_jsonb(body));
 m:=pg_temp.po_message(body);
 SET LOCAL ROLE service_role;
 r:=pg_temp.po_apply(p,m,e);
 RESET ROLE;
 ASSERT r->>'status'='applied','SQ85 2000-character reply applies';
 ASSERT (SELECT length(condition_note)=2000 AND condition_note=body FROM field_delivery_reports),'SQ85 2000-character note saved in full';
 ASSERT (SELECT consumption_result=r->'result' AND consumed_sid IS NOT NULL AND answered_at IS NOT NULL FROM sms_prompts WHERE id=p.id),'SQ85 boundary success consumes with immutable receipt';
 p:=pg_temp.po_prompt();
 body:='damaged '||repeat('x',1993);
 e:=jsonb_set(e,'{condition,note}',to_jsonb(body));
 PERFORM pg_temp.po_refuses(p,pg_temp.po_message(body),e,'SQ85 2001-character update whole-row rollback');
 ASSERT (SELECT length(condition_note)=2000 FROM field_delivery_reports),'SQ85 refused update preserves prior full report';
 RAISE NOTICE 'PASS SQ85 full 2000-character condition, 2001-character insert/update whole-row rollback, open prompt and no partial report';
END $$;
ROLLBACK;
