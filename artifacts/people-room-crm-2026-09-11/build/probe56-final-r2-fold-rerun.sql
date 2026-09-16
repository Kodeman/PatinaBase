-- probe56 — final-run review r2: is the fold still "side-effect-free to re-run"?
-- 00594's COMMENT says it "writes studio_channel_consent and nothing else".
-- 00622 put an AFTER INSERT trigger on that table. One rolled-back txn.
\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE pg_temp.edge_calls(fn text, body jsonb);
GRANT ALL ON pg_temp.edge_calls TO PUBLIC;
CREATE OR REPLACE FUNCTION public.invoke_edge_function(fn_name text, body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER AS $f$
BEGIN INSERT INTO pg_temp.edge_calls(fn, body) VALUES (fn_name, body); RETURN 1; END $f$;

INSERT INTO auth.users (id,email,encrypted_password,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,aud,role)
VALUES ('c1000000-0000-4000-8000-00000000000a','fold-a@t.test','x',now(),now(),now(),'{}','{}','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at)
VALUES ('c1000000-0000-4000-8000-00000000000a','fold-a@t.test','F',now(),now()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,name,slug,type,created_at,updated_at)
VALUES ('c2000000-0000-4000-8000-00000000000a','Fold Studio','fold-studio','design_studio',now(),now());
INSERT INTO organization_members (organization_id,user_id,role,status,joined_at,created_at,updated_at)
VALUES ('c2000000-0000-4000-8000-00000000000a','c1000000-0000-4000-8000-00000000000a','owner','active',now(),now(),now());
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at)
VALUES ('c3000000-0000-4000-8000-00000000000a','Fold job','c1000000-0000-4000-8000-00000000000a','c2000000-0000-4000-8000-00000000000a','c1000000-0000-4000-8000-00000000000a','active',now(),now());
INSERT INTO project_parties (id,project_id,party_kind,display_name,trade,phone)
VALUES ('c4000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a','sub','Fold Sub','tile','612-555-0801');
SET LOCAL app.consent_legacy_write = 'on';
UPDATE project_parties SET sms_consent_status='granted', sms_consent_source='written',
  sms_consent_evidence='Signed the form', sms_consent_recorded_at=now(),
  sms_consent_disclosure_version='field-sms-v1', sms_consented_at=now()
 WHERE id='c4000000-0000-4000-8000-00000000000a';
SET LOCAL app.consent_legacy_write = '';
INSERT INTO site_requests (id, project_id, created_by, assignee_party_id, status, due_at, note, consent_status_snapshot)
VALUES ('c5000000-0000-4000-8000-00000000000a','c3000000-0000-4000-8000-00000000000a',
        'c1000000-0000-4000-8000-00000000000a','c4000000-0000-4000-8000-00000000000a',
        'awaiting_consent', now()+interval '3 days','Fold measure','not_asked');

DO $$
DECLARE n int; folded int; v text;
BEGIN
  DELETE FROM pg_temp.edge_calls;
  folded := public.backfill_channel_consent_from_parties();
  SELECT count(*) INTO n FROM pg_temp.edge_calls WHERE fn='site-request-dispatch';
  RAISE NOTICE 'FOLD re-run: records minted = %, site-request-dispatch wake-ups = %', folded, n;
  SELECT count(*) INTO n FROM site_request_dispatch_outbox
   WHERE request_id='c5000000-0000-4000-8000-00000000000a' AND action='consent-granted';
  RAISE NOTICE 'FOLD re-run: consent-granted outbox rows minted = %', n;
  SELECT consent_status_snapshot INTO v FROM site_requests WHERE id='c5000000-0000-4000-8000-00000000000a';
  RAISE NOTICE 'FOLD re-run: the parked request''s snapshot is now = %', v;
END $$;
ROLLBACK;
