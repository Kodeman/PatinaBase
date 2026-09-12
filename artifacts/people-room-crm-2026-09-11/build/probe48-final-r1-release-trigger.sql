\set ON_ERROR_STOP on
BEGIN;

-- ── helpers (the test file's own pattern) ────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p uuid) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p::text, 'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END $f$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS void LANGUAGE plpgsql AS $f$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims','',true); END $f$;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ── fixture ─────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES ('c1000000-0000-4000-8000-000000000001','probe-des@patina.test','x',now(),now(),now(),
        '{"provider":"email"}','{}','authenticated','authenticated');
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('c1000000-0000-4000-8000-000000000001','probe-des@patina.test','Probe Designer',now(),now())
ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id, name, slug, type, created_at, updated_at)
VALUES ('c2000000-0000-4000-8000-00000000000a','Probe Studio A','probe-studio-a','design_studio',now(),now());
INSERT INTO organization_members (organization_id, user_id, role, status, joined_at, created_at, updated_at)
VALUES ('c2000000-0000-4000-8000-00000000000a','c1000000-0000-4000-8000-000000000001','owner','active',now(),now(),now());

INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at)
VALUES ('c3000000-0000-4000-8000-000000000001','Probe job one','c1000000-0000-4000-8000-000000000001',
        'c2000000-0000-4000-8000-00000000000a','c1000000-0000-4000-8000-000000000001','active',now(),now()),
       ('c3000000-0000-4000-8000-000000000002','Probe job two','c1000000-0000-4000-8000-000000000001',
        'c2000000-0000-4000-8000-00000000000a','c1000000-0000-4000-8000-000000000001','active',now(),now());

-- two seats, SAME number, one per job
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, trade, sms_consent_status)
VALUES ('c4000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001','sub','Probe Sub','612-555-0901','electrical','not_asked'),
       ('c4000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000002','sub','Probe Sub','612-555-0901','electrical','not_asked');

-- one parked site request per seat
INSERT INTO site_requests (id, project_id, created_by, assignee_party_id, status, due_at, note)
VALUES ('c5000000-0000-4000-8000-000000000001','c3000000-0000-4000-8000-000000000001',
        'c1000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000001',
        'awaiting_consent', now()+interval '4 days','one'),
       ('c5000000-0000-4000-8000-000000000002','c3000000-0000-4000-8000-000000000002',
        'c1000000-0000-4000-8000-000000000001','c4000000-0000-4000-8000-000000000002',
        'awaiting_consent', now()+interval '4 days','two');

\echo '=== P1: the grant releases each parked request, once each ==='
DO $$
DECLARE n int; raised text;
BEGIN
  PERFORM pg_temp.assume_user('c1000000-0000-4000-8000-000000000001');
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'c2000000-0000-4000-8000-00000000000a','sms','612-555-0901','granted',
      'written','Signed the field-SMS form','field-sms-v1',NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  PERFORM pg_temp.reset_role();
  RAISE NOTICE 'P1a record_channel_consent(granted) raised = %', COALESCE(raised,'<none>');
  SELECT count(*) INTO n FROM site_request_dispatch_outbox
   WHERE action='consent-granted';
  RAISE NOTICE 'P1b consent-granted outbox rows = % (expect 2)', n;
  SELECT count(*) INTO n FROM site_requests
   WHERE id IN ('c5000000-0000-4000-8000-000000000001','c5000000-0000-4000-8000-000000000002')
     AND consent_status_snapshot='granted';
  RAISE NOTICE 'P1c requests snapshotted granted = % (expect 2)', n;

  -- restate the grant: must release nothing more
  PERFORM pg_temp.assume_user('c1000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    'c2000000-0000-4000-8000-00000000000a','sms','612-555-0901','granted',
    'written','Signed again','field-sms-v1',NULL);
  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO n FROM site_request_events WHERE event_type='consent_granted_dispatch_ready';
  RAISE NOTICE 'P1d consent_granted_dispatch_ready events after a restated grant = % (expect 2)', n;
END $$;

\echo '=== P2: a seat moved to another project, then a grant ==='
DO $$
DECLARE raised text; n int;
BEGIN
  -- park request one again
  UPDATE site_requests SET status='awaiting_consent' WHERE id='c5000000-0000-4000-8000-000000000001';
  -- a studio co-member moves the seat to the studio's other job (PostgREST-reachable;
  -- project_id is not on the freeze trigger and site_requests' validate trigger
  -- only fires on site_requests writes)
  UPDATE project_parties SET project_id='c3000000-0000-4000-8000-000000000002'
   WHERE id='c4000000-0000-4000-8000-000000000001';
  -- force a real transition: refuse, then grant
  PERFORM pg_temp.assume_user('c1000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    'c2000000-0000-4000-8000-00000000000a','sms','612-555-0901','opted_out',
    'verbal','He said stop on site',NULL,NULL);
  PERFORM pg_temp.reset_role();
  -- the recipient's START, as the rail writes it
  UPDATE studio_channel_consent
     SET status='granted', refusal_unanswered=false, consented_at=clock_timestamp(),
         source='inbound_sms', evidence='Replied START', recorded_at=clock_timestamp()
   WHERE organization_id='c2000000-0000-4000-8000-00000000000a'
     AND channel_value='+16125550901';
  RAISE NOTICE 'P2a the rail START landed with no error';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'P2a RAISED: %', SQLERRM;
END $$;

ROLLBACK;
