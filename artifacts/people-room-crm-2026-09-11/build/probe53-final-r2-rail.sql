-- probe53 — final-run review r2: the record-only rail, walked. One rolled-back txn.
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.au(p uuid) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN PERFORM set_config('request.jwt.claims', json_build_object('sub',p::text,'role','authenticated')::text, true);
      EXECUTE 'SET LOCAL ROLE authenticated'; END $f$;
CREATE OR REPLACE FUNCTION pg_temp.rr() RETURNS void LANGUAGE plpgsql AS $f$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','',true); END $f$;
GRANT EXECUTE ON FUNCTION pg_temp.au(uuid), pg_temp.rr() TO PUBLIC;

-- pg_net is not reachable in a test txn; make the eager wake-up a no-op so the
-- DURABLE half of the rail is what we observe (00105 pattern, same as the suite).
CREATE TABLE pg_temp.edge_calls(fn text, body jsonb);
GRANT ALL ON pg_temp.edge_calls TO PUBLIC;
CREATE OR REPLACE FUNCTION public.invoke_edge_function(fn_name text, body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $f$
BEGIN INSERT INTO pg_temp.edge_calls(fn, body) VALUES (fn_name, body); RETURN 1; END $f$;

INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,aud,role) VALUES
 ('e1000000-0000-4000-8000-00000000000a','r2-a@t.test','x',now(),now(),now(),'{}','{}','authenticated','authenticated'),
 ('e1000000-0000-4000-8000-00000000000b','r2-b@t.test','x',now(),now(),now(),'{}','{}','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at) VALUES
 ('e1000000-0000-4000-8000-00000000000a','r2-a@t.test','A',now(),now()),
 ('e1000000-0000-4000-8000-00000000000b','r2-b@t.test','B',now(),now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,name,slug,type,created_at,updated_at) VALUES
 ('e2000000-0000-4000-8000-00000000000a','R2 Alpha','r2-alpha','design_studio',now(),now()),
 ('e2000000-0000-4000-8000-00000000000b','R2 Beta','r2-beta','design_studio',now(),now());
INSERT INTO organization_members (organization_id,user_id,role,status,joined_at,created_at,updated_at) VALUES
 ('e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-00000000000a','owner','active',now(),now(),now()),
 ('e2000000-0000-4000-8000-00000000000b','e1000000-0000-4000-8000-00000000000b','owner','active',now(),now(),now());
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at) VALUES
 ('e3000000-0000-4000-8000-00000000000a','Alpha job','e1000000-0000-4000-8000-00000000000a','e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-00000000000a','active',now(),now()),
 ('e3000000-0000-4000-8000-0000000000a2','Alpha job 2','e1000000-0000-4000-8000-00000000000a','e2000000-0000-4000-8000-00000000000a','e1000000-0000-4000-8000-00000000000a','active',now(),now()),
 ('e3000000-0000-4000-8000-00000000000b','Beta job','e1000000-0000-4000-8000-00000000000b','e2000000-0000-4000-8000-00000000000b','e1000000-0000-4000-8000-00000000000b','active',now(),now());
-- Alpha: an un-asked sub (no record at all) on the number +16125550701
INSERT INTO project_parties (id,project_id,party_kind,display_name,trade,phone) VALUES
 ('e4000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-00000000000a','sub','Unasked Sub','tile','612-555-0701'),
 ('e4000000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-00000000000a','sub','Refused Sub','paint','612-555-0702'),
 ('e4000000-0000-4000-8000-000000000003','e3000000-0000-4000-8000-00000000000a','sub','Frozen Granted Sub','trim','612-555-0703'),
 ('e4000000-0000-4000-8000-000000000004','e3000000-0000-4000-8000-00000000000b','sub','Beta Sub','tile','612-555-0701');
-- give seat 3 a pre-fold frozen `granted` with full evidence, via the repair door
SET LOCAL app.consent_legacy_write = 'on';
UPDATE project_parties SET sms_consent_status='granted', sms_consent_source='written',
  sms_consent_evidence='Signed the form', sms_consent_recorded_at=now(),
  sms_consent_disclosure_version='field-sms-v1', sms_consented_at=now()
 WHERE id='e4000000-0000-4000-8000-000000000003';
UPDATE project_parties SET sms_consent_status='opted_out', sms_opt_out_at='2025-12-03'
 WHERE id='e4000000-0000-4000-8000-000000000002';
SET LOCAL app.consent_legacy_write = '';

INSERT INTO site_requests (id, project_id, created_by, assignee_party_id, status, due_at, note)
VALUES ('e5000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-00000000000a',
        'e1000000-0000-4000-8000-00000000000a','e4000000-0000-4000-8000-000000000001',
        'draft', now()+interval '3 days', 'Measure the niche');
INSERT INTO site_request_items (id, request_id, sort_order, status, current_version_number, current_version_id)
VALUES ('e6000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001',1,'open',1,NULL);
INSERT INTO site_request_item_versions (id, item_id, version_number, kit_code, title, configuration, created_by)
VALUES ('e6100000-0000-4000-8000-000000000001','e6000000-0000-4000-8000-000000000001',1,'K-01','Niche photos','{}'::jsonb,'e1000000-0000-4000-8000-00000000000a');
UPDATE site_request_items SET current_version_id='e6100000-0000-4000-8000-000000000001' WHERE id='e6000000-0000-4000-8000-000000000001';

INSERT INTO site_requests (id, project_id, created_by, assignee_party_id, status, due_at, note, consent_status_snapshot)
VALUES ('e5000000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-00000000000b',
        'e1000000-0000-4000-8000-00000000000b','e4000000-0000-4000-8000-000000000004',
        'awaiting_consent', now()+interval '3 days','Beta measure','not_asked');

DO $$
DECLARE raised text; v text; n int; j jsonb; rid uuid;
BEGIN
  -- ══ A. site_request_send on an assignee with NO record ════════════════════
  PERFORM pg_temp.au('e1000000-0000-4000-8000-00000000000a');
  raised := NULL;
  BEGIN j := public.site_request_send('e5000000-0000-4000-8000-000000000001');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'A1 site_request_send (no record) raised = %  result = %', COALESCE(raised,'<none>'), COALESCE(j::text,'<null>');
  SELECT status, consent_status_snapshot INTO v, raised FROM site_requests WHERE id='e5000000-0000-4000-8000-000000000001';
  RAISE NOTICE 'A2 request status = %  snapshot = %', v, raised;
  SELECT sms_consent_status INTO v FROM project_parties WHERE id='e4000000-0000-4000-8000-000000000001';
  RAISE NOTICE 'A3 the seat after the send = %  (must still be not_asked: no seat written)', v;
  SELECT count(*) INTO n FROM studio_channel_consent
   WHERE organization_id='e2000000-0000-4000-8000-00000000000a' AND channel_value='+16125550701';
  RAISE NOTICE 'A4 records minted by the send = %  (0 = the invite is NOT recorded here)', n;
  PERFORM pg_temp.rr();
  SELECT count(*) INTO n FROM site_request_dispatch_outbox
   WHERE request_id='e5000000-0000-4000-8000-000000000001' AND action='consent-invite';
  RAISE NOTICE 'A5 consent-invite outbox rows enqueued = %', n;
  PERFORM pg_temp.au('e1000000-0000-4000-8000-00000000000a');

  -- ══ B. resend on the same (un-asked) assignee ════════════════════════════
  raised := NULL;
  BEGIN j := public.site_request_resend('e5000000-0000-4000-8000-000000000001');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'B1 resend on an awaiting_consent request = %', COALESCE(raised,'<no error>');

  -- ══ C. the studio records the invite, then the grant; the release fires ══
  PERFORM public.record_channel_invite('e2000000-0000-4000-8000-00000000000a','sms','612-555-0701',
    'written','Ticked text updates on the add sheet','field-sms-v1','e3000000-0000-4000-8000-00000000000a');
  SELECT public.channel_consent_status('e2000000-0000-4000-8000-00000000000a','sms','+16125550701') INTO v;
  RAISE NOTICE 'C1 after record_channel_invite the verdict = %', COALESCE(v,'<null>');
  SELECT count(*) INTO n FROM pg_temp.edge_calls;
  RAISE NOTICE 'C2 edge calls after the invite = % (the release must not fire on pending)', n;
  PERFORM public.record_channel_consent('e2000000-0000-4000-8000-00000000000a','sms','612-555-0701',
    'granted','written','They replied yes in writing','field-sms-v1','e3000000-0000-4000-8000-00000000000a');
  PERFORM pg_temp.rr();
  SELECT status, consent_status_snapshot INTO v, raised FROM site_requests WHERE id='e5000000-0000-4000-8000-000000000001';
  RAISE NOTICE 'C3 the parked request after the grant: status = % snapshot = %', v, raised;
  PERFORM pg_temp.au('e1000000-0000-4000-8000-00000000000a');
  SELECT count(*) INTO n FROM pg_temp.edge_calls WHERE fn='site-request-dispatch';
  RAISE NOTICE 'C4 site-request-dispatch wake-ups = % (must be 1)', n;
  -- restating the grant releases nothing a second time
  PERFORM public.record_channel_consent('e2000000-0000-4000-8000-00000000000a','sms','612-555-0701',
    'granted','written','Restated','field-sms-v1',NULL);
  SELECT count(*) INTO n FROM pg_temp.edge_calls WHERE fn='site-request-dispatch';
  RAISE NOTICE 'C5 wake-ups after a RESTATED grant = % (must still be 1)', n;
  -- and resend now works, off the record
  raised := NULL;
  BEGIN j := public.site_request_resend('e5000000-0000-4000-8000-000000000001');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'C6 resend on a record-granted assignee = %', COALESCE(raised, j->>'action');

  -- ══ D. the two 00284 dispatch gates ══════════════════════════════════════
  PERFORM pg_temp.rr();
  DELETE FROM pg_temp.edge_calls;
  INSERT INTO project_tasks (id, project_id, title, status, owner, owner_party_id)
  VALUES ('e7000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-00000000000a','Tile the niche','todo','sub','e4000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO n FROM pg_temp.edge_calls WHERE fn='sms-dispatch';
  RAISE NOTICE 'D1 task assigned to a RECORD-GRANTED party -> sms-dispatch = % (must be 1)', n;
  DELETE FROM pg_temp.edge_calls;
  INSERT INTO project_tasks (id, project_id, title, status, owner, owner_party_id)
  VALUES ('e7000000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-00000000000a','Paint','todo','sub','e4000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO n FROM pg_temp.edge_calls WHERE fn='sms-dispatch';
  RAISE NOTICE 'D2 task assigned to a party with NO record but a frozen opted_out seat -> = % (must be 0)', n;
  DELETE FROM pg_temp.edge_calls;
  INSERT INTO project_tasks (id, project_id, title, status, owner, owner_party_id)
  VALUES ('e7000000-0000-4000-8000-000000000003','e3000000-0000-4000-8000-00000000000a','Trim','todo','sub','e4000000-0000-4000-8000-000000000003');
  SELECT count(*) INTO n FROM pg_temp.edge_calls WHERE fn='sms-dispatch';
  RAISE NOTICE 'D3 task assigned to a FROZEN GRANTED seat with no record -> = % (must be 0, R-AW)', n;

  -- ══ E. Alpha's grant must not reach Beta's seat on the same number ═══════
  PERFORM pg_temp.rr();
  PERFORM pg_temp.au('e1000000-0000-4000-8000-00000000000b');
  SELECT sms_consent_status INTO v FROM v_project_roster WHERE roster_id='e4000000-0000-4000-8000-000000000004';
  RAISE NOTICE 'E1 Beta''s roster word for Beta''s seat on the SAME number = % (must be not_asked)', COALESCE(v,'<null>');
  SELECT COALESCE(public.channel_consent_status('e2000000-0000-4000-8000-00000000000a','sms','+16125550701'),'<null>') INTO v;
  RAISE NOTICE 'E2 Beta reading ALPHA''s record = % (must be <null>)', v;
  SELECT count(*) INTO n FROM studio_channel_consent;
  RAISE NOTICE 'E3 rows Beta can see in studio_channel_consent = % (must be 0)', n;
  PERFORM pg_temp.rr();

  -- ══ F. the freeze, and R-AX ══════════════════════════════════════════════
  PERFORM pg_temp.au('e1000000-0000-4000-8000-00000000000a');
  raised := NULL;
  BEGIN UPDATE project_parties SET sms_consent_status='granted' WHERE id='e4000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'F1 an authenticated member writing the frozen status = %', COALESCE(raised,'<NO ERROR — HOLE>');
  raised := NULL;
  BEGIN UPDATE project_parties SET phone='612-555-0799' WHERE id='e4000000-0000-4000-8000-000000000002';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'F2 moving an opted_out seat''s number = %', COALESCE(raised,'<NO ERROR — HOLE>');
  raised := NULL;
  BEGIN UPDATE project_parties SET display_name='Unasked Sub II' WHERE id='e4000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'F3 an ordinary edit that names no frozen column = %', COALESCE(raised,'<no error, correct>');
  -- a seat MOVED to the studio's other job (the MAJOR-3 population)
  raised := NULL;
  BEGIN UPDATE project_parties SET project_id='e3000000-0000-4000-8000-0000000000a2' WHERE id='e4000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'F4 moving a seat to another job = %', COALESCE(raised,'<no error>');
  PERFORM pg_temp.rr();

  -- ══ G. a service_role write that lowers the flag WITHOUT naming status ═══
  DELETE FROM pg_temp.edge_calls;
  INSERT INTO studio_channel_consent (organization_id,channel_kind,channel_value,status,refusal_unanswered,
                                      source,evidence,recorded_at,disclosure_version,consented_at)
  VALUES ('e2000000-0000-4000-8000-00000000000b','sms','+16125550701','granted',true,
          'written','Folded legacy seat',now(),'field-sms-v1',now());
  SELECT count(*) INTO n FROM pg_temp.edge_calls;
  RAISE NOTICE 'G1 INSERT of granted+unanswered -> wake-ups = % (must be 0)', n;
  UPDATE studio_channel_consent SET refusal_unanswered = false
   WHERE organization_id='e2000000-0000-4000-8000-00000000000b' AND channel_value='+16125550701';
  SELECT count(*) INTO n FROM pg_temp.edge_calls;
  RAISE NOTICE 'G2 lowering the flag WITHOUT naming status -> wake-ups = % (0 = the parked request stays parked)', n;
  SELECT status INTO v FROM site_requests WHERE id='e5000000-0000-4000-8000-000000000002';
  RAISE NOTICE 'G3 Beta''s parked request after the flag dropped = %', v;
  SELECT COALESCE(public.channel_consent_status('e2000000-0000-4000-8000-00000000000b','sms','+16125550701'),'<null>') INTO v;
  RAISE NOTICE 'G4 …while the verdict now reads = %', v;
END $$;
ROLLBACK;
