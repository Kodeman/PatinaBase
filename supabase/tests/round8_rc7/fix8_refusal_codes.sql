-- RC8-FIX8 (K12): the Strata-live 40001 raises in
-- docs/design/designer-portal-round8/evidence/rc/rc7-fix2-40001-inventory.md.
-- PostgREST 14 re-runs a transaction that fails with 40001 with no limit, so a
-- deterministic refusal raised as 40001 never reaches the caller. 00904 moves
-- rows 1-37 to PT409 (HTTP 409) and the post-lock invariants, rows 38-44, to
-- XX000. Rows 45-46 are transient and keep 40001 with a "40001 on purpose"
-- comment. Row 35's raise left _place_product_in_project_v2_00438_impl in 00873.
-- Rows 47-49 were found by FIX8 outside the RC-7 inventory, in two renamed
-- impls: 47-48 (stale configuration saves) move to PT409, 49 to XX000.
-- Part 1 reads every redefined head definition. Part 2 drives one refusal
-- through each Tier 1 homeowner-facing function as its real actor. Rolled back.
\set ON_ERROR_STOP on
\if :{?expected_port}
\else
\set expected_port 63622
\endif
SELECT :'HOST' = '127.0.0.1' AND :'PORT' = :'expected_port' AND :'PORT' <> '54322' AS owned_stack \gset
\if :owned_stack
\else
DO $$ BEGIN RAISE EXCEPTION 'fix8 refusal-code test requires an owned 127.0.0.1 stack (not 54322)'; END $$;
\quit
\endif

BEGIN;

-- ── Part 1: head definitions ────────────────────────────────────────────────
DO $catalog$
DECLARE
  -- [function, PT409 raises, XX000 raises, retryable raises (rows 45-46 only)]
  -- NULL skips the count.
  expected CONSTANT jsonb := '[
    ["public._respond_project_approval_checked(uuid,text,uuid,timestamptz,text,text,text)", 1, 0, 0],
    ["public._apply_client_decision_authorized(uuid,uuid,uuid,text,text,text,integer)", 2, 0, 0],
    ["public.approve_client_signoff(uuid,text,text)", 1, 0, 0],
    ["public.advance_project_phase(uuid,uuid,text)", 1, 4, 0],
    ["public._resolve_coordination_item_authorized(uuid,uuid,text,uuid,text,uuid)", 5, 0, 0],
    ["public.apply_phase_template(uuid,text,uuid)", 2, 0, 0],
    ["public.update_project_phase(uuid,uuid,timestamptz,jsonb)", 1, 1, 0],
    ["public.update_proposal_phase(uuid,uuid,jsonb,timestamptz)", 1, 0, 0],
    ["public.remove_proposal_phase(uuid,uuid,timestamptz)", 1, 0, 0],
    ["public.publish_client_decision(uuid)", 1, 0, 0],
    ["public.extend_and_reopen_client_decision(uuid,timestamptz,timestamptz)", 2, 0, 0],
    ["public.update_client_decision(uuid,jsonb,jsonb,timestamptz)", 1, 0, 0],
    ["public.withdraw_project_approval_decision(uuid,timestamptz,text,text)", 1, 0, 0],
    ["public.supersede_project_approval_decision(uuid,jsonb,timestamptz,text,text)", 1, 0, 0],
    ["public.field_time_report_decide(uuid,text,integer,uuid)", 1, 0, 0],
    ["public.rerate_pending_time_entries(uuid,integer)", 1, 0, 0],
    ["public.set_project_operational_status(uuid,project_status,project_status)", 1, 0, 0],
    ["public.archive_project(uuid,project_status)", 1, 0, 0],
    ["public.reassign_project_lead(uuid,uuid,uuid)", 1, 0, 0],
    ["public.create_client_decision(uuid,jsonb,jsonb,uuid[],uuid[])", 1, 0, 0],
    ["public.set_project_decision_authority(uuid,uuid,uuid,integer)", 2, 0, 0],
    ["public.revise_project_ffe_configuration(uuid,uuid,uuid,integer,text,uuid,integer)", 2, 0, 0],
    ["public.approve_product_configuration(uuid,integer)", 1, 0, 0],
    ["public.create_custom_commission_revision(uuid,jsonb)", 1, 0, 0],
    ["public.upsert_product_configuration_schema(uuid,jsonb,integer)", 1, 0, 0],
    ["public._place_product_in_project_v2_00438_impl(jsonb)", null, null, 0],
    ["public._record_project_ffe_receipt_batch_00446_impl(uuid,jsonb,receiving_inspection_outcome,text,uuid[],uuid,uuid,text,text,text,date,uuid,boolean,uuid,uuid)", 1, 0, 0],
    ["public.spec_book_bump_spec_version()", 1, 0, 0],
    ["public.delete_project_phase(uuid,uuid)", 0, 2, 0],
    ["public.merge_studio_product(uuid,uuid)", 0, 0, 1],
    ["public._spec_book_trade_chapter(uuid,text)", 0, 0, 1],
    ["public._save_product_configuration_impl(jsonb)", 2, 0, 0],
    ["public._continue_board_in_project_v1_impl(uuid)", 0, 1, 0]
  ]';
  r jsonb;
  defs text;
  found integer;
  pt409 integer := 0;
  xx000 integer := 0;
  passed integer := 0;
BEGIN
  FOR r IN SELECT value FROM jsonb_array_elements(expected) LOOP
    IF to_regprocedure(r->>0) IS NULL THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % does not exist', r->>0;
    END IF;
    defs := pg_get_functiondef(to_regprocedure(r->>0));
    SELECT count(*) INTO found FROM regexp_matches(defs,
      'ERRCODE\s*=\s*''(serialization_failure|40001)''', 'gi');
    IF found <> (r->>3)::integer THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % has % 40001 raises, expected %', r->>0, found, r->>3;
    END IF;
    IF (SELECT count(*) FROM regexp_matches(defs, '40001 on purpose', 'g')) <> found THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % 40001 raises lack their "40001 on purpose" comment', r->>0;
    END IF;
    IF r->1 <> 'null'::jsonb THEN
      SELECT count(*) INTO found FROM regexp_matches(defs, 'ERRCODE\s*=\s*''PT409''', 'gi');
      IF found <> (r->>1)::integer THEN
        RAISE EXCEPTION 'ASSERTION FAILED: % has % PT409 raises, expected %', r->>0, found, r->>1;
      END IF;
      pt409 := pt409 + found;
      SELECT count(*) INTO found FROM regexp_matches(defs, 'ERRCODE\s*=\s*''XX000''', 'gi');
      IF found <> (r->>2)::integer THEN
        RAISE EXCEPTION 'ASSERTION FAILED: % has % XX000 raises, expected %', r->>0, found, r->>2;
      END IF;
      xx000 := xx000 + found;
    END IF;
    passed := passed + 1;
  END LOOP;
  -- Rows 1-37 less row 35, plus 47-48, are 38 PT409 raises; rows 38-44 and 49
  -- are 8 XX000 raises.
  IF passed <> 33 OR pt409 <> 38 OR xx000 <> 8 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: % functions, % PT409, % XX000 (expected 33, 38, 8)', passed, pt409, xx000;
  END IF;
  RAISE NOTICE 'PASS: 33 functions; 38 PT409, 8 XX000, 2 commented 40001';
END
$catalog$;

-- ── Part 2: Tier 1 refusals through the public entry points ────────────────
CREATE OR REPLACE FUNCTION pg_temp.fix8_actor(p_actor uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    jsonb_build_object('sub', p_actor, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.fix8_actor(uuid) TO PUBLIC;

-- Runs p_sql as the authenticated actor and returns 'SQLSTATE|message', or
-- 'OK' when it does not raise.
CREATE OR REPLACE FUNCTION pg_temp.fix8_try(p_actor uuid, p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_state text; v_message text;
BEGIN
  PERFORM pg_temp.fix8_actor(p_actor);
  BEGIN
    EXECUTE p_sql;
    RETURN 'OK';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
    RETURN v_state || '|' || v_message;
  END;
END $$;
GRANT EXECUTE ON FUNCTION pg_temp.fix8_try(uuid, text) TO PUBLIC;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at,
  updated_at, instance_id, aud, role)
VALUES
  ('f8080000-0000-4000-8000-000000000001', 'fix8-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('f8080000-0000-4000-8000-000000000002', 'fix8-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name, is_designer)
VALUES
  ('f8080000-0000-4000-8000-000000000001', 'fix8-designer@test.invalid', 'Fix8 Designer', true),
  ('f8080000-0000-4000-8000-000000000002', 'fix8-client@test.invalid', 'Fix8 Client', false)
ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, full_name = EXCLUDED.full_name,
  is_designer = EXCLUDED.is_designer;
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('f8081000-0000-4000-8000-000000000001', 'design_studio', 'Fix8 Studio',
  'fix8-refusal-studio', 'active');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('f8080000-0000-4000-8000-000000000001', 'f8081000-0000-4000-8000-000000000001',
  'owner', 'active', now());
INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT 'f8080000-0000-4000-8000-000000000001', role.id, 'f8080000-0000-4000-8000-000000000001'
FROM public.roles AS role WHERE role.name = 'studio_owner';
INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, client_email,
  status, source)
VALUES ('f8082000-0000-4000-8000-000000000001', 'f8080000-0000-4000-8000-000000000001',
  'f8080000-0000-4000-8000-000000000002', 'Fix8 Client', 'fix8-client@test.invalid',
  'active', 'direct');
INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status,
  current_phase)
VALUES ('f8083000-0000-4000-8000-000000000001', 'Fix8 Project',
  'f8080000-0000-4000-8000-000000000001', 'f8080000-0000-4000-8000-000000000002',
  'f8080000-0000-4000-8000-000000000001', 'f8081000-0000-4000-8000-000000000001',
  'active', 'design');
INSERT INTO public.project_phases (id, project_id, name, phase_key, status, sort_order, lane,
  follows_phase_id)
VALUES ('f8083100-0000-4000-8000-000000000001', 'f8083000-0000-4000-8000-000000000001',
  'Approval', 'fix8-approval', 'pending', 0, 'thread', NULL);
INSERT INTO public.plan_issues (id, project_id, issue_number, name, idempotency_key,
  request_hash, set_checksum, sheet_count, created_by)
VALUES ('f8084000-0000-4000-8000-000000000001', 'f8083000-0000-4000-8000-000000000001', 1,
  'Fix8 issued set', 'fix8-plan-1',
  encode(extensions.digest('fix8-request'::bytea, 'sha256'), 'hex'),
  encode(extensions.digest('fix8-artifact'::bytea, 'sha256'), 'hex'), 4,
  'f8080000-0000-4000-8000-000000000001');
-- Row 3: an ordinary client-court selection with two options.
INSERT INTO public.client_decisions (id, designer_client_id, project_id, title, status, sent_at,
  coordination_kind, court, due_date)
VALUES ('f8085000-0000-4000-8000-000000000001', 'f8082000-0000-4000-8000-000000000001',
  'f8083000-0000-4000-8000-000000000001', 'Fix8 Choice', 'pending', now(), 'selection',
  'client', now() + interval '7 days');
INSERT INTO public.client_decision_options (id, decision_id, name, price, quantity, selected,
  sort_order)
VALUES
  ('f8085100-0000-4000-8000-000000000001', 'f8085000-0000-4000-8000-000000000001', 'First',
   12000, 1, false, 0),
  ('f8085100-0000-4000-8000-000000000002', 'f8085000-0000-4000-8000-000000000001', 'Second',
   9000, 1, false, 1);
-- Row 4: a client-court sign-off with no options.
INSERT INTO public.client_decisions (id, designer_client_id, project_id, title, status, sent_at,
  coordination_kind, court, due_date)
VALUES ('f8085000-0000-4000-8000-000000000002', 'f8082000-0000-4000-8000-000000000001',
  'f8083000-0000-4000-8000-000000000001', 'Fix8 Sign-off', 'pending', now(), 'signoff',
  'client', now() + interval '7 days');
CREATE TEMP TABLE fix8_results (label text PRIMARY KEY, result text NOT NULL) ON COMMIT DROP;
GRANT SELECT, INSERT ON fix8_results TO authenticated;
SET LOCAL ROLE authenticated;

-- Row 1: the household lead answers a project approval from a stale view.
SELECT pg_temp.fix8_actor('f8080000-0000-4000-8000-000000000001');
SELECT public.set_project_decision_authority('f8083000-0000-4000-8000-000000000001',
  'f8080000-0000-4000-8000-000000000002', NULL, 0);
INSERT INTO fix8_results
SELECT 'approval', public.create_project_approval_decision(
  'f8083000-0000-4000-8000-000000000001',
  jsonb_build_object('title', 'Fix8 approval', 'question', 'Approve the issued set?',
    'context', 'Client-safe fixture.', 'dueAt', (now() + interval '9 days')::text,
    'phaseId', 'f8083100-0000-4000-8000-000000000001', 'sectionKey', 'project',
    'artifactKind', 'plan_issue', 'artifactId', 'f8084000-0000-4000-8000-000000000001',
    'costCentsDelta', 0, 'scheduleDaysDelta', 0, 'leadTimeDaysDelta', 0),
  'fix8-create', NULL)->>'decisionId';
RESET ROLE;
INSERT INTO fix8_results
SELECT 'row1-before', decision.status || '|' || decision.updated_at::text
FROM public.client_decisions AS decision
WHERE decision.id = (SELECT result::uuid FROM fix8_results WHERE label = 'approval');
INSERT INTO fix8_results
SELECT 'row1-call', format(
  $q$SELECT public.respond_project_approval(%L, '{"outcome":"approved"}'::jsonb, %L, 'fix8-respond')$q$,
  decision.id, decision.updated_at - interval '1 microsecond')
FROM public.client_decisions AS decision
WHERE decision.id = (SELECT result::uuid FROM fix8_results WHERE label = 'approval');
SET LOCAL ROLE authenticated;
INSERT INTO fix8_results
SELECT 'row1', pg_temp.fix8_try('f8080000-0000-4000-8000-000000000002', result)
FROM fix8_results WHERE label = 'row1-call';
RESET ROLE;

-- Row 3: the client picks an option after the decision was resolved with
-- another one.
SET LOCAL ROLE authenticated;
INSERT INTO fix8_results SELECT 'row3-first', pg_temp.fix8_try(
  'f8080000-0000-4000-8000-000000000002',
  $q$SELECT public.apply_client_decision('f8085000-0000-4000-8000-000000000001',
    'f8085100-0000-4000-8000-000000000001', 'click_through', NULL, NULL, NULL)$q$);
INSERT INTO fix8_results SELECT 'row3', pg_temp.fix8_try(
  'f8080000-0000-4000-8000-000000000002',
  $q$SELECT public.apply_client_decision('f8085000-0000-4000-8000-000000000001',
    'f8085100-0000-4000-8000-000000000002', 'click_through', NULL, NULL, NULL)$q$);
RESET ROLE;

-- Row 4: another actor resolved the sign-off before the addressed client
-- approves it from a screen loaded earlier. The fixture writes the earlier
-- resolution as maintenance (postgres, no JWT), which the 00463 guard admits.
SELECT set_config('request.jwt.claims', '', true), set_config('request.jwt.claim.sub', '', true),
  set_config('request.jwt.claim.role', '', true);
UPDATE public.client_decisions
SET status = 'responded', selected_by = 'f8080000-0000-4000-8000-000000000001',
    responded_at = now()
WHERE id = 'f8085000-0000-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
INSERT INTO fix8_results SELECT 'row4', pg_temp.fix8_try(
  'f8080000-0000-4000-8000-000000000002',
  $q$SELECT public.approve_client_signoff('f8085000-0000-4000-8000-000000000002',
    'click_through', NULL)$q$);
RESET ROLE;

DO $tier1$
DECLARE v text;
BEGIN
  SELECT result INTO v FROM fix8_results WHERE label = 'row1';
  ASSERT v = 'PT409|project approval decision changed since it was loaded',
    'row 1: a stale project approval response must refuse with PT409; got ' || COALESCE(v, 'NULL');
  ASSERT (SELECT status || '|' || updated_at::text FROM public.client_decisions
          WHERE id = (SELECT result::uuid FROM fix8_results WHERE label = 'approval'))
         = (SELECT result FROM fix8_results WHERE label = 'row1-before'),
    'row 1: the refused response must leave the approval unchanged';

  SELECT result INTO v FROM fix8_results WHERE label = 'row3-first';
  ASSERT v = 'OK', 'row 3 precondition: the first choice must land; got ' || v;
  SELECT result INTO v FROM fix8_results WHERE label = 'row3';
  ASSERT v = 'PT409|decision f8085000-0000-4000-8000-000000000001 was already resolved with another option',
    'row 3: a choice against another resolved option must refuse with PT409; got ' || COALESCE(v, 'NULL');
  ASSERT (SELECT count(*) = 1 AND bool_and(id = 'f8085100-0000-4000-8000-000000000001')
          FROM public.client_decision_options
          WHERE decision_id = 'f8085000-0000-4000-8000-000000000001' AND selected),
    'row 3: the refused choice must keep the first option selected';

  SELECT result INTO v FROM fix8_results WHERE label = 'row4';
  ASSERT v = 'PT409|decision f8085000-0000-4000-8000-000000000002 was already resolved by another actor',
    'row 4: a sign-off another actor resolved must refuse with PT409; got ' || COALESCE(v, 'NULL');
  ASSERT (SELECT selected_by = 'f8080000-0000-4000-8000-000000000001' FROM public.client_decisions
          WHERE id = 'f8085000-0000-4000-8000-000000000002'),
    'row 4: the refused sign-off must keep the first resolver';
  RAISE NOTICE 'PASS: Tier 1 rows 1, 3 and 4 refuse with PT409 and change nothing';
END
$tier1$;

ROLLBACK;
