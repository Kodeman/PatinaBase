-- Negative control for close-out r3 MAJOR-1 and MAJOR-3.
--
-- Inside ONE rolled-back transaction: restore the PRE-00621 bodies (00282's
-- awaiting_reply_count subquery and 00284's two dispatch gates, verbatim on the
-- frozen seat), then walk exactly the fixtures SQL test blocks 41/42 walk. The
-- numbers printed here are what the shipped objects did before 00621, so a
-- reader can see the fix is load-bearing and the new assertions are not
-- tautologies. Probe objects and fixtures only; never the ledger.
\pset pager off
BEGIN;

-- ── fixtures: one studio, one project, three seats, two records ────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('d1000000-0000-4000-8000-000000000001','r3nc@test.invalid','',NOW(),NOW(),NOW(),'00000000-0000-0000-0000-000000000000','authenticated','authenticated');
INSERT INTO profiles (id,email,full_name,created_at,updated_at)
VALUES ('d1000000-0000-4000-8000-000000000001','r3nc@test.invalid','Nell',NOW(),NOW()) ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id,type,name,slug,status,created_at,updated_at)
VALUES ('d2000000-0000-4000-8000-00000000000a','design_studio','R3 NC Studio','r3-nc-studio','active',NOW(),NOW());
INSERT INTO organization_members (user_id,organization_id,role,status,joined_at,created_at,updated_at)
VALUES ('d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000a','owner','active',NOW(),NOW(),NOW());
INSERT INTO projects (id,name,designer_id,studio_id,created_by,status,created_at,updated_at)
VALUES ('d3000000-0000-4000-8000-00000000000a','R3 NC job','d1000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-00000000000a','d1000000-0000-4000-8000-000000000001','active',NOW(),NOW());
INSERT INTO designer_clients (id,designer_id,client_name,status,created_at,updated_at)
VALUES ('d4000000-0000-4000-8000-00000000000a','d1000000-0000-4000-8000-000000000001','NC household','active',NOW(),NOW());

-- The seat the RECORD grants, frozen at pending; and the seat the RECORD
-- invited, frozen at not_asked.
INSERT INTO project_parties (id,project_id,party_kind,display_name,phone,sms_consent_status)
VALUES
 ('d5000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-00000000000a','sub','Ove Berglund','(612) 555-0720','pending'),
 ('d5000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-00000000000a','sub','Nan Sorley','(612) 555-0721','not_asked'),
 ('d5000000-0000-4000-8000-000000000003','d3000000-0000-4000-8000-00000000000a','sub','Vi Odom','(612) 555-0722','pending');

SELECT set_config('request.jwt.claims', json_build_object('sub','d1000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT status FROM public.record_channel_consent(
  'd2000000-0000-4000-8000-00000000000a','sms','(612) 555-0720','granted',
  'written','Signed the kickoff form','field-sms-v1','d3000000-0000-4000-8000-00000000000a');
SELECT status FROM public.record_channel_invite(
  'd2000000-0000-4000-8000-00000000000a','sms','(612) 555-0721',
  'written','Kickoff form','field-sms-v1','d3000000-0000-4000-8000-00000000000a');
SELECT status FROM public.record_channel_consent(
  'd2000000-0000-4000-8000-00000000000a','sms','(612) 555-0722','granted',
  'written','Signed the kickoff form','field-sms-v1','d3000000-0000-4000-8000-00000000000a');
RESET ROLE;

-- Dispatch spy, the shape SQL test block 6 uses.
CREATE TABLE public._r3nc_dispatch_log (id bigserial PRIMARY KEY, fn_name text, body jsonb);
CREATE OR REPLACE FUNCTION public.invoke_edge_function(fn_name text, body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $fn$ BEGIN INSERT INTO public._r3nc_dispatch_log (fn_name, body) VALUES (fn_name, body); RETURN 0; END; $fn$;

\echo '=== AFTER 00621 (what ships) ==='
SELECT set_config('request.jwt.claims', json_build_object('sub','d1000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT awaiting_reply_count AS desk_awaiting_reply_count_after_00621
  FROM field_activity_summary WHERE project_id='d3000000-0000-4000-8000-00000000000a';
SELECT pp.display_name AS counted_as_awaiting_after_00621
  FROM project_parties pp
 WHERE pp.project_id='d3000000-0000-4000-8000-00000000000a'
   AND public.channel_consent_status(public.project_consent_org(pp.project_id),'sms',pp.phone_e164)='pending'
 ORDER BY 1;
RESET ROLE;
INSERT INTO project_tasks (id,project_id,title,status,owner,owner_party_id)
VALUES ('d6000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-00000000000a','Set the sconces','todo','sub','d5000000-0000-4000-8000-000000000001');
INSERT INTO client_decisions (id,designer_client_id,designer_id,project_id,title,status,court,court_party_id,coordination_kind)
VALUES ('d7000000-0000-4000-8000-000000000001','d4000000-0000-4000-8000-00000000000a','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-00000000000a','Confirm the grout colour','pending','gc','d5000000-0000-4000-8000-000000000001','rfi');
SELECT count(*) AS dispatches_after_00621
  FROM public._r3nc_dispatch_log
 WHERE body->>'templateKey'='sms_court_assignment'
   AND body->>'partyId'='d5000000-0000-4000-8000-000000000001';

-- ── restore the PRE-00621 bodies, verbatim on the frozen seat ─────────────
CREATE OR REPLACE VIEW public.field_activity_summary WITH (security_invoker = true) AS
SELECT
  p.id AS project_id,
  (SELECT count(*) FROM public.sms_messages m
     WHERE m.project_id = p.id AND m.needs_review AND m.reviewed_at IS NULL) AS unreviewed_sms_count,
  (SELECT count(*) FROM public.project_parties pp
     WHERE pp.project_id = p.id
       AND pp.party_kind IN ('gc','sub','installer','receiver')
       AND pp.sms_consent_status = 'pending') AS awaiting_reply_count,
  (SELECT count(*) FROM public.project_tasks t
     WHERE t.project_id = p.id AND t.owner IN ('gc','sub','installer','receiver')
       AND t.status <> 'done' AND t.due_date IS NOT NULL AND t.due_date < current_date) AS overdue_field_task_count
FROM public.projects p;

CREATE OR REPLACE FUNCTION public.fc_dispatch_task_assignment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_party public.project_parties;
BEGIN
  IF NEW.owner_party_id IS NULL OR NEW.status = 'done' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.owner_party_id IS NOT DISTINCT FROM OLD.owner_party_id THEN RETURN NEW; END IF;
  SELECT * INTO v_party FROM public.project_parties WHERE id = NEW.owner_party_id;
  IF NOT FOUND OR v_party.party_kind NOT IN ('gc','sub','installer','receiver')
     OR v_party.sms_consent_status <> 'granted' THEN RETURN NEW; END IF;
  BEGIN
    PERFORM public.invoke_edge_function('sms-dispatch', jsonb_build_object(
      'partyId', NEW.owner_party_id, 'projectId', NEW.project_id,
      'templateKey','sms_court_assignment','type','field_task_assignment',
      'vars', jsonb_build_object('item_title', NEW.title, 'kind','task')));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.fc_dispatch_court_assignment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_party public.project_parties;
BEGIN
  IF NEW.court_party_id IS NULL OR NEW.status <> 'pending' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.court_party_id IS NOT DISTINCT FROM OLD.court_party_id THEN RETURN NEW; END IF;
  SELECT * INTO v_party FROM public.project_parties WHERE id = NEW.court_party_id;
  IF NOT FOUND OR v_party.party_kind NOT IN ('gc','sub','installer','receiver')
     OR v_party.sms_consent_status <> 'granted' THEN RETURN NEW; END IF;
  BEGIN
    PERFORM public.invoke_edge_function('sms-dispatch', jsonb_build_object(
      'partyId', NEW.court_party_id, 'projectId', NEW.project_id,
      'templateKey','sms_court_assignment','type','field_court_assignment',
      'vars', jsonb_build_object('item_title', NEW.title, 'kind', NEW.coordination_kind)));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN NEW;
END; $$;

\echo '=== BEFORE 00621 (the shipped objects the review found) ==='
SELECT set_config('request.jwt.claims', json_build_object('sub','d1000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
SET LOCAL ROLE authenticated;
SELECT awaiting_reply_count AS desk_awaiting_reply_count_before_00621
  FROM field_activity_summary WHERE project_id='d3000000-0000-4000-8000-00000000000a';
SELECT pp.display_name AS counted_as_awaiting_before_00621
  FROM project_parties pp
 WHERE pp.project_id='d3000000-0000-4000-8000-00000000000a'
   AND pp.sms_consent_status='pending'
 ORDER BY 1;
SELECT display_name, sms_consent_status AS roster_word FROM v_project_roster
 WHERE roster_id IN ('d5000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000002',
                     'd5000000-0000-4000-8000-000000000003') ORDER BY 1;
RESET ROLE;
DELETE FROM public._r3nc_dispatch_log;
INSERT INTO project_tasks (id,project_id,title,status,owner,owner_party_id)
VALUES ('d6000000-0000-4000-8000-000000000002','d3000000-0000-4000-8000-00000000000a','Set the sconces again','todo','sub','d5000000-0000-4000-8000-000000000001');
INSERT INTO client_decisions (id,designer_client_id,designer_id,project_id,title,status,court,court_party_id,coordination_kind)
VALUES ('d7000000-0000-4000-8000-000000000002','d4000000-0000-4000-8000-00000000000a','d1000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-00000000000a','Confirm the grout colour again','pending','gc','d5000000-0000-4000-8000-000000000001','rfi');
SELECT count(*) AS dispatches_before_00621
  FROM public._r3nc_dispatch_log
 WHERE body->>'templateKey'='sms_court_assignment'
   AND body->>'partyId'='d5000000-0000-4000-8000-000000000001';

ROLLBACK;
