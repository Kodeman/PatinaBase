-- Fixture-backed Stage 2 lifecycle/compatibility contract (00464).
\set ON_ERROR_STOP on

BEGIN;

DO $preflight$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(label ORDER BY label)
  INTO v_missing
  FROM (VALUES
    ('00463 classifier column', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'client_decisions'
        AND column_name = 'approval_contract'
    )),
    ('00463 outcome column', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'client_decision_options'
        AND column_name = 'approval_outcome'
    )),
    ('function respond_project_approval(uuid,jsonb,timestamptz,text)',
      to_regprocedure('public.respond_project_approval(uuid,jsonb,timestamptz,text)') IS NOT NULL),
    ('function withdraw_project_approval_decision(uuid,timestamptz,text,text)',
      to_regprocedure('public.withdraw_project_approval_decision(uuid,timestamptz,text,text)') IS NOT NULL),
    ('function supersede_project_approval_decision(uuid,jsonb,timestamptz,text)',
      to_regprocedure('public.supersede_project_approval_decision(uuid,jsonb,timestamptz,text)') IS NOT NULL),
    ('function get_project_decision_reviews(uuid)',
      to_regprocedure('public.get_project_decision_reviews(uuid)') IS NOT NULL),
    ('shared fail-closed phase blocker predicate',
      to_regprocedure('public._client_decision_blocks_phase(client_decisions)') IS NOT NULL),
    ('existing publish_client_decision(uuid)',
      to_regprocedure('public.publish_client_decision(uuid)') IS NOT NULL),
    ('existing apply_client_decision(uuid,uuid,text,text,text,integer)',
      to_regprocedure('public.apply_client_decision(uuid,uuid,text,text,text,integer)') IS NOT NULL),
    ('existing expire_client_decision(uuid)',
      to_regprocedure('public.expire_client_decision(uuid)') IS NOT NULL),
    ('existing expire_due_client_decisions(timestamptz)',
      to_regprocedure('public.expire_due_client_decisions(timestamptz)') IS NOT NULL),
    ('existing reopen_client_decision(uuid)',
      to_regprocedure('public.reopen_client_decision(uuid)') IS NOT NULL),
    ('existing extend_and_reopen_client_decision(uuid,timestamptz,timestamptz)',
      to_regprocedure('public.extend_and_reopen_client_decision(uuid,timestamptz,timestamptz)') IS NOT NULL)
  ) AS required(label, present)
  WHERE NOT present;

  IF COALESCE(cardinality(v_missing), 0) > 0 THEN
    RAISE EXCEPTION '00464 approval lifecycle contract is not installed: %',
      array_to_string(v_missing, ', ')
      USING ERRCODE = '55000',
            HINT = 'Apply 00462, 00463, and 00464, then rerun this contract test.';
  END IF;
END
$preflight$;

-- Static compatibility and guarded-authority assertions.
DO $structure$
DECLARE
  v_status_constraints text;
  v_publish text;
  v_apply text;
  v_apply_authorized text;
  v_expire text;
  v_due_expire text;
  v_reopen text;
  v_extend text;
  v_mark_viewed text;
  v_reminder text;
  v_workflow text;
  v_advance text;
  v_completed_guard text;
  v_blocker text;
  v_respond text;
  v_respond_checked text;
  v_withdraw text;
  v_supersede text;
  v_projection text;
BEGIN
  SELECT string_agg(pg_get_constraintdef(c.oid), E'\n')
  INTO v_status_constraints
  FROM pg_constraint c
  WHERE c.conrelid = 'public.client_decisions'::regclass
    AND pg_get_constraintdef(c.oid) LIKE '%status%';

  ASSERT v_status_constraints LIKE '%draft%'
     AND v_status_constraints LIKE '%pending%'
     AND v_status_constraints LIKE '%responded%'
     AND v_status_constraints LIKE '%expired%',
    'legacy client_decisions status vocabulary must remain wire-compatible';
  ASSERT v_status_constraints NOT LIKE '%withdrawn%'
     AND v_status_constraints NOT LIKE '%superseded%',
    'withdrawn/superseded are evidenced Stage 2 semantics, not new legacy statuses';

  SELECT pg_get_functiondef('public.publish_client_decision(uuid)'::regprocedure)
    INTO v_publish;
  SELECT pg_get_functiondef(
    'public.apply_client_decision(uuid,uuid,text,text,text,integer)'::regprocedure
  ) INTO v_apply;
  SELECT pg_get_functiondef(
    'public._apply_client_decision_authorized(uuid,uuid,uuid,text,text,text,integer)'::regprocedure
  ) INTO v_apply_authorized;
  SELECT pg_get_functiondef('public.expire_client_decision(uuid)'::regprocedure)
    INTO v_expire;
  SELECT pg_get_functiondef(
    'public.expire_due_client_decisions(timestamptz)'::regprocedure
  ) INTO v_due_expire;
  SELECT pg_get_functiondef('public.reopen_client_decision(uuid)'::regprocedure)
    INTO v_reopen;
  SELECT pg_get_functiondef(
    'public.extend_and_reopen_client_decision(uuid,timestamptz,timestamptz)'::regprocedure
  ) INTO v_extend;
  SELECT pg_get_functiondef(
    'public.mark_client_decision_viewed(uuid)'::regprocedure
  ) INTO v_mark_viewed;
  SELECT pg_get_functiondef(
    'public.stamp_client_decision_reminder(uuid)'::regprocedure
  ) INTO v_reminder;
  SELECT pg_get_functiondef('public.get_project_workflow(uuid)'::regprocedure)
    INTO v_workflow;
  SELECT pg_get_functiondef(
    'public.advance_project_phase(uuid,uuid,text)'::regprocedure
  ) INTO v_advance;
  SELECT pg_get_functiondef(
    'public.guard_client_decision_completed_phase_gate()'::regprocedure
  ) INTO v_completed_guard;
  SELECT pg_get_functiondef(
    'public._client_decision_blocks_phase(client_decisions)'::regprocedure
  ) INTO v_blocker;
  SELECT pg_get_functiondef(
    'public.respond_project_approval(uuid,jsonb,timestamptz,text)'::regprocedure
  ) INTO v_respond;
  SELECT pg_get_functiondef(
    'public._respond_project_approval_checked(uuid,text,uuid,timestamptz,text,text,text)'::regprocedure
  ) INTO v_respond_checked;
  SELECT pg_get_functiondef(
    'public.withdraw_project_approval_decision(uuid,timestamptz,text,text)'::regprocedure
  ) INTO v_withdraw;
  SELECT pg_get_functiondef(
    'public.supersede_project_approval_decision(uuid,jsonb,timestamptz,text)'::regprocedure
  ) INTO v_supersede;
  SELECT pg_get_functiondef(
    'public.get_project_decision_reviews(uuid)'::regprocedure
  ) INTO v_projection;

  ASSERT v_publish LIKE '%approval_contract%'
     AND v_publish LIKE '%project_decision_review_confirmations%',
    'publish must branch Stage 2 and require current review confirmation';
  ASSERT (v_apply || v_apply_authorized) LIKE '%approval_contract%'
     AND v_apply_authorized LIKE '%_respond_project_approval_checked%'
     AND v_respond_checked LIKE '%approval_outcome%',
    'installed option-ID clients must route Stage 2 through the canonical outcome';
  ASSERT v_expire LIKE '%approval_contract%'
     AND v_reopen LIKE '%approval_contract%'
     AND v_extend LIKE '%approval_contract%',
    'generic expire/reopen paths must reject Stage 2';
  ASSERT v_due_expire LIKE '%approval_contract%'
     AND (v_due_expire LIKE '%IS NULL%' OR v_due_expire LIKE '%<>%'),
    'due-expiry worker must explicitly exclude Stage 2';
  ASSERT v_mark_viewed LIKE '%project_decision_authority_snapshots%'
     AND v_mark_viewed LIKE '%app.project_approval_decision_write_id%'
     AND v_reminder LIKE '%project_decision_authority_snapshots%'
     AND v_reminder LIKE '%app.project_approval_decision_write_id%',
    'view/reminder compatibility must use frozen authority and Stage-2 capability';
  ASSERT v_workflow LIKE '%approval_outcome%'
     AND v_workflow LIKE '%advance_blocker_count%',
    'workflow gate summary must retain non-approved Stage 2 outcomes as blockers';
  ASSERT v_advance LIKE '%_client_decision_blocks_phase%'
     AND v_completed_guard LIKE '%_client_decision_blocks_phase%'
     AND v_workflow LIKE '%_client_decision_blocks_phase%',
    'advance, completed-phase guard, and workflow must share the exact predicate';
  ASSERT v_blocker LIKE '%project_artifact_v1%'
     AND v_blocker LIKE '%approval_outcome%'
     AND v_blocker LIKE '%selected%'
     AND v_blocker LIKE '%project_approval_action_receipts%'
     AND v_blocker LIKE '%WHEN OTHERS%'
     AND v_blocker LIKE '%RETURN true%',
    'the shared Stage-2 predicate must validate evidence and fail closed';
  ASSERT NOT has_function_privilege(
    'authenticated',
    'public._client_decision_blocks_phase(client_decisions)', 'EXECUTE'
  ) AND NOT has_function_privilege(
    'service_role',
    'public._client_decision_blocks_phase(client_decisions)', 'EXECUTE'
  ), 'the blocker predicate must remain private';

  ASSERT v_respond NOT LIKE '%comment%'
     AND v_respond LIKE '%p_expected_updated_at%'
     AND v_respond LIKE '%p_idempotency_key%',
    'public response accepts no comment evidence and requires CAS/idempotency';
  ASSERT v_supersede LIKE '%_create_project_approval_decision_checked%'
     AND v_supersede LIKE '%predecessor_decision_id%'
     AND v_supersede LIKE '%phaseId%'
     AND v_supersede LIKE '%sectionKey%',
    'supersede must create a checked exact-lineage successor with copied scope';
  ASSERT v_withdraw LIKE '%project_approval_action_receipts%'
     AND v_projection LIKE '%decision_lead_id%'
     AND v_projection LIKE '%isOverdue%'
     AND v_projection NOT LIKE '%project.client_id%',
    'withdraw must be evidenced and projection authority must use frozen lead';

  ASSERT EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_row
    WHERE constraint_row.conrelid =
          'public.project_approval_action_receipts'::regclass
      AND pg_get_constraintdef(constraint_row.oid) LIKE '%successor_decision_id%'
      AND pg_get_constraintdef(constraint_row.oid) LIKE '%superseded%'
  ), 'only superseded receipts may carry one successor';

  ASSERT has_function_privilege(
    'authenticated',
    'public.respond_project_approval(uuid,jsonb,timestamptz,text)', 'EXECUTE'
  ), 'addressed-authority response RPC must be authenticated';
  ASSERT has_function_privilege(
    'authenticated',
    'public.withdraw_project_approval_decision(uuid,timestamptz,text,text)', 'EXECUTE'
  ), 'studio withdrawal RPC must be authenticated and internally authorize';
  ASSERT has_function_privilege(
    'authenticated',
    'public.supersede_project_approval_decision(uuid,jsonb,timestamptz,text)', 'EXECUTE'
  ), 'studio supersession RPC must be authenticated and internally authorize';
  ASSERT has_function_privilege(
    'authenticated', 'public.get_project_decision_reviews(uuid)', 'EXECUTE'
  ), 'sanitized Stage 2 review read model must be authenticated';

  ASSERT (
    SELECT proargnames = ARRAY[
      'p_decision_id', 'p_payload', 'p_expected_updated_at',
      'p_idempotency_key'
    ]
    FROM pg_proc
    WHERE oid =
      'public.respond_project_approval(uuid,jsonb,timestamptz,text)'::regprocedure
  ), 'response RPC JSON argument names are public API';
  ASSERT (
    SELECT proargnames = ARRAY[
      'p_decision_id', 'p_expected_updated_at', 'p_reason',
      'p_idempotency_key'
    ]
    FROM pg_proc
    WHERE oid =
      'public.withdraw_project_approval_decision(uuid,timestamptz,text,text)'::regprocedure
  ), 'withdraw RPC JSON argument names are public API';
  ASSERT (
    SELECT proargnames = ARRAY[
      'p_decision_id', 'p_payload', 'p_expected_updated_at',
      'p_idempotency_key'
    ]
    FROM pg_proc
    WHERE oid =
      'public.supersede_project_approval_decision(uuid,jsonb,timestamptz,text)'::regprocedure
  ), 'supersede RPC JSON argument names are public API';
END
$structure$;

CREATE OR REPLACE FUNCTION pg_temp.assume_approval_actor(
  p_actor uuid,
  p_role text DEFAULT 'authenticated'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_strip_nulls(jsonb_build_object(
      'sub', p_actor,
      'role', p_role
    ))::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_actor::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', p_role, true);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_approval_actor(uuid, text) TO PUBLIC;

-- 00467 removes raw Stage-2 parent reads from clients. Keep this compatibility
-- assertion server-side so a rejected installed response can still prove that
-- it left no state/evidence behind without weakening production RLS.
CREATE OR REPLACE FUNCTION pg_temp.stage2_response_evidence_is_absent(
  p_decision_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
      SELECT 1
      FROM public.client_decisions AS decision
      WHERE decision.id = p_decision_id
        AND decision.status = 'pending'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.client_decision_options AS option
      WHERE option.decision_id = p_decision_id
        AND option.selected
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.project_approval_action_receipts AS receipt
      WHERE receipt.decision_id = p_decision_id
        AND receipt.action_kind = 'responded'
    );
$$;
GRANT EXECUTE ON FUNCTION pg_temp.stage2_response_evidence_is_absent(uuid) TO PUBLIC;


CREATE TEMP TABLE approval_lifecycle_results (
  label text PRIMARY KEY,
  payload jsonb NOT NULL
) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE ON approval_lifecycle_results
  TO authenticated, service_role;

-- Studio A, two historical household leads, one current-but-unsnapshotted
-- project client, a studio peer, and a foreign project/household.
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('a4360000-0000-4000-8000-000000000001', 'lifecycle-designer-a@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4360000-0000-4000-8000-000000000002', 'lifecycle-lead-a@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4360000-0000-4000-8000-000000000003', 'lifecycle-peer-a@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4360000-0000-4000-8000-000000000004', 'lifecycle-designer-b@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4360000-0000-4000-8000-000000000005', 'lifecycle-client-b@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4360000-0000-4000-8000-000000000006', 'lifecycle-current-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4360000-0000-4000-8000-000000000007', 'lifecycle-lead-a2@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer)
VALUES
  ('a4360000-0000-4000-8000-000000000001', 'lifecycle-designer-a@test.invalid', 'Lifecycle Designer A', true),
  ('a4360000-0000-4000-8000-000000000002', 'lifecycle-lead-a@test.invalid', 'Lifecycle Lead A', false),
  ('a4360000-0000-4000-8000-000000000003', 'lifecycle-peer-a@test.invalid', 'Lifecycle Peer A', true),
  ('a4360000-0000-4000-8000-000000000004', 'lifecycle-designer-b@test.invalid', 'Lifecycle Designer B', true),
  ('a4360000-0000-4000-8000-000000000005', 'lifecycle-client-b@test.invalid', 'Lifecycle Client B', false),
  ('a4360000-0000-4000-8000-000000000006', 'lifecycle-current-client@test.invalid', 'Lifecycle Current Client', false),
  ('a4360000-0000-4000-8000-000000000007', 'lifecycle-lead-a2@test.invalid', 'Lifecycle Lead A2', false)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('a4361000-0000-4000-8000-000000000001', 'design_studio', 'Lifecycle Studio A', 'lifecycle-stage2-a', 'active'),
  ('a4361000-0000-4000-8000-000000000002', 'design_studio', 'Lifecycle Studio B', 'lifecycle-stage2-b', 'active');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
) VALUES
  ('a4361100-0000-4000-8000-000000000001', 'a4360000-0000-4000-8000-000000000001',
   'a4361000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('a4361100-0000-4000-8000-000000000002', 'a4360000-0000-4000-8000-000000000003',
   'a4361000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('a4361100-0000-4000-8000-000000000003', 'a4360000-0000-4000-8000-000000000004',
   'a4361000-0000-4000-8000-000000000002', 'owner', 'active', now());

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
) VALUES
  ('a4362000-0000-4000-8000-000000000001',
   'a4360000-0000-4000-8000-000000000001',
   'a4360000-0000-4000-8000-000000000002', 'Lifecycle Lead A', 'active', 'direct'),
  ('a4362000-0000-4000-8000-000000000002',
   'a4360000-0000-4000-8000-000000000004',
   'a4360000-0000-4000-8000-000000000005', 'Lifecycle Client B', 'active', 'direct'),
  ('a4362000-0000-4000-8000-000000000003',
   'a4360000-0000-4000-8000-000000000001',
   'a4360000-0000-4000-8000-000000000007', 'Lifecycle Lead A2', 'active', 'direct'),
  ('a4362000-0000-4000-8000-000000000004',
   'a4360000-0000-4000-8000-000000000001',
   'a4360000-0000-4000-8000-000000000006', 'Lifecycle Current Client', 'active', 'direct');

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, studio_id, status,
  current_phase
) VALUES
  ('a4363000-0000-4000-8000-000000000001', 'Lifecycle Project A',
   'a4360000-0000-4000-8000-000000000001',
   'a4360000-0000-4000-8000-000000000002',
   'a4360000-0000-4000-8000-000000000001',
   'a4361000-0000-4000-8000-000000000001', 'active', 'design'),
  ('a4363000-0000-4000-8000-000000000002', 'Lifecycle Project B',
   'a4360000-0000-4000-8000-000000000004',
   'a4360000-0000-4000-8000-000000000005',
   'a4360000-0000-4000-8000-000000000004',
   'a4361000-0000-4000-8000-000000000002', 'active', 'design');

INSERT INTO public.project_phases (
  id, project_id, name, phase_key, status, sort_order, lane, follows_phase_id
) VALUES
  ('a4363100-0000-4000-8000-000000000001',
   'a4363000-0000-4000-8000-000000000001',
   'Active design phase', 'design', 'in_progress', 0, 'main', NULL),
  ('a4363100-0000-4000-8000-000000000002',
   'a4363000-0000-4000-8000-000000000001',
   'Next implementation phase', 'implementation', 'pending', 1, 'main',
   'a4363100-0000-4000-8000-000000000001'),
  ('a4363100-0000-4000-8000-000000000003',
   'a4363000-0000-4000-8000-000000000001',
   'Approval laboratory', 'approval-lab', 'pending', 2, 'thread', NULL),
  ('a4363100-0000-4000-8000-000000000004',
   'a4363000-0000-4000-8000-000000000002',
   'Foreign approval phase', 'foreign', 'pending', 0, 'main', NULL);

-- Distinct issued plan sets supply immutable artifacts for each response and
-- successor. All checksums are deliberately different.
INSERT INTO public.plan_issues (
  id, project_id, issue_number, name, idempotency_key, request_hash,
  set_checksum, sheet_count, created_by
)
SELECT
  ('a4364000-0000-4000-8000-' || lpad(issue_no::text, 12, '0'))::uuid,
  'a4363000-0000-4000-8000-000000000001'::uuid,
  issue_no,
  'Lifecycle issued set ' || issue_no,
  'lifecycle-plan-' || issue_no,
  encode(extensions.digest(('request-' || issue_no)::bytea, 'sha256'), 'hex'),
  encode(extensions.digest(('artifact-' || issue_no)::bytea, 'sha256'), 'hex'),
  5 + issue_no,
  'a4360000-0000-4000-8000-000000000001'::uuid
FROM generate_series(1, 20) AS issue_no;

SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
INSERT INTO approval_lifecycle_results (label, payload)
SELECT 'authority-a1', public.set_project_decision_authority(
  'a4363000-0000-4000-8000-000000000001',
  'a4360000-0000-4000-8000-000000000002', NULL, 0
);

-- Must define as the unrestricted session owner: SET LOCAL ROLE authenticated
-- above is still in effect, and 00483 revokes CREATE on this session's own
-- pg_temp_N schema from authenticated (asserted database-TEMPORARY boundary),
-- so defining another pg_temp object here without resetting first fails
-- "permission denied for schema pg_temp_N".
RESET ROLE;
CREATE OR REPLACE FUNCTION pg_temp.create_lifecycle_approval(
  p_label text,
  p_issue_no integer,
  p_phase_id uuid DEFAULT 'a4363100-0000-4000-8000-000000000003'
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.create_project_approval_decision(
    'a4363000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'title', 'Lifecycle ' || p_label,
      'question', 'Approve lifecycle request ' || p_label || '?',
      'context', 'Client-safe lifecycle fixture.',
      'dueAt', (now() + interval '7 days')::text,
      'phaseId', p_phase_id,
      'sectionKey', 'project',
      'artifactKind', 'plan_issue',
      'artifactId', ('a4364000-0000-4000-8000-' ||
                    lpad(p_issue_no::text, 12, '0'))::uuid,
      'costCentsDelta', 0,
      'scheduleDaysDelta', p_issue_no,
      'leadTimeDaysDelta', -p_issue_no
    ),
    'create-' || p_label
  );
  INSERT INTO approval_lifecycle_results(label, payload)
  VALUES (p_label || '-create', v_result);
  RETURN (v_result->>'decisionId')::uuid;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.create_lifecycle_approval(text, integer, uuid) TO PUBLIC;
SET LOCAL ROLE authenticated;

SELECT pg_temp.create_lifecycle_approval(
  'advance-approved', 1, 'a4363100-0000-4000-8000-000000000001'
);
SELECT pg_temp.create_lifecycle_approval('web-changes', 2);
SELECT pg_temp.create_lifecycle_approval('web-discussion', 3);
SELECT pg_temp.create_lifecycle_approval('withdraw', 4);
SELECT pg_temp.create_lifecycle_approval('supersede-pending', 5);
SELECT pg_temp.create_lifecycle_approval('installed-approved', 7);
SELECT pg_temp.create_lifecycle_approval('installed-changes', 8);
SELECT pg_temp.create_lifecycle_approval('installed-discussion', 9);
SELECT pg_temp.create_lifecycle_approval('cutoff-stage2', 10);
SELECT pg_temp.create_lifecycle_approval('malformed-extra', 11);
SELECT pg_temp.create_lifecycle_approval('malformed-supersede', 12);
SELECT pg_temp.create_lifecycle_approval('overdue-stage2', 16);

RESET ROLE;

-- A comment is conversation only: it changes no review, lifecycle, outcome,
-- or gate evidence.
SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
INSERT INTO public.decision_comments (decision_id, author_id, body)
VALUES (
  (SELECT (payload->>'decisionId')::uuid
   FROM approval_lifecycle_results WHERE label = 'web-changes-create'),
  'a4360000-0000-4000-8000-000000000001',
  'Please clarify this request.'
);
DO $$
DECLARE
  v_id uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_lifecycle_results WHERE label = 'web-changes-create'
  );
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_decision_review_confirmations
    WHERE decision_id = v_id
  ), 'ordinary comment manufactured review confirmation';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.client_decision_options
    WHERE decision_id = v_id AND selected
  ), 'ordinary comment selected a Stage-2 outcome';
  ASSERT (SELECT status FROM public.client_decisions WHERE id = v_id) = 'draft',
    'ordinary comment changed Stage-2 lifecycle';
END;
$$;

-- Confirm every original fixture as the exact frozen lead. Publish remains a
-- separate studio act and is denied before confirmation.
DO $$
DECLARE
  v_id uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_lifecycle_results WHERE label = 'advance-approved-create'
  );
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.publish_client_decision(v_id);
  EXCEPTION WHEN OTHERS THEN v_denied := true;
  END;
  ASSERT v_denied, 'client unexpectedly published an unconfirmed Stage-2 draft';
END;
$$;

RESET ROLE;
SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.publish_client_decision((
      SELECT (payload->>'decisionId')::uuid
      FROM approval_lifecycle_results WHERE label = 'advance-approved-create'
    ));
  EXCEPTION WHEN OTHERS THEN v_denied := true;
  END;
  ASSERT v_denied, 'studio published without frozen lead review confirmation';
END;
$$;
RESET ROLE;
SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;

INSERT INTO approval_lifecycle_results(label, payload)
SELECT create_row.label || '-confirm',
       public.confirm_project_decision_review(
         (create_row.payload->>'decisionId')::uuid,
         jsonb_build_object(
           'authorityRevision', (create_row.payload->>'authorityRevision')::integer,
           'artifactHash', create_row.payload->>'artifactHash',
           'reviewMethod', 'portal_clickthrough'
         ),
         'confirm-' || replace(create_row.label, '-create', '')
       )
FROM approval_lifecycle_results AS create_row
WHERE create_row.label LIKE '%-create'
ORDER BY create_row.label;

-- CREATE TEMP TABLE must run before SET LOCAL ROLE: 00483 revokes database
-- TEMPORARY from authenticated by design, so creating it after the role
-- switch fails "permission denied for schema pg_temp_N".
RESET ROLE;
CREATE TEMP TABLE approval_pending_tokens (
  label text PRIMARY KEY,
  decision_id uuid NOT NULL,
  updated_at timestamptz NOT NULL
) ON COMMIT DROP;
GRANT SELECT, INSERT ON approval_pending_tokens TO authenticated, service_role;
SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;

INSERT INTO approval_pending_tokens(label, decision_id, updated_at)
SELECT replace(create_row.label, '-create', ''), decision.id, published.updated_at
FROM approval_lifecycle_results AS create_row
CROSS JOIN LATERAL public.publish_client_decision(
  (create_row.payload->>'decisionId')::uuid
) AS published
JOIN public.client_decisions AS decision
  ON decision.id = (create_row.payload->>'decisionId')::uuid
WHERE create_row.label LIKE '%-create'
ORDER BY create_row.label;

DO $$
DECLARE
  v_id uuid := (
    SELECT decision_id FROM approval_pending_tokens
    WHERE label = 'advance-approved'
  );
  v_before timestamptz := (
    SELECT updated_at FROM approval_pending_tokens
    WHERE label = 'advance-approved'
  );
  v_retry public.client_decisions;
BEGIN
  SELECT * INTO v_retry FROM public.publish_client_decision(v_id);
  ASSERT v_retry.status = 'pending'
     AND v_retry.updated_at IS NOT DISTINCT FROM v_before,
    'exact derived publish retry changed Stage-2 evidence';
END;
$$;

RESET ROLE;

-- Installed view/reminder RPCs retain their signatures but use frozen Stage-2
-- authority and both guarded write capabilities.
SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_id uuid := (
    SELECT decision_id FROM approval_pending_tokens WHERE label = 'cutoff-stage2'
  );
  v_first public.client_decisions;
  v_retry public.client_decisions;
BEGIN
  v_first := public.mark_client_decision_viewed(v_id);
  v_retry := public.mark_client_decision_viewed(v_id);
  ASSERT v_first.viewed_at IS NOT NULL
     AND v_retry.viewed_at IS NOT DISTINCT FROM v_first.viewed_at
     AND v_retry.updated_at IS NOT DISTINCT FROM v_first.updated_at,
    'frozen lead Stage-2 viewed retry was not idempotent';
END;
$$;
RESET ROLE;

SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000005');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.mark_client_decision_viewed(
      (SELECT decision_id FROM approval_pending_tokens
       WHERE label = 'cutoff-stage2')
    );
  EXCEPTION WHEN insufficient_privilege THEN v_denied := true;
  END;
  ASSERT v_denied, 'foreign household marked a Stage-2 decision viewed';
END;
$$;
RESET ROLE;

SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_id uuid := (
    SELECT decision_id FROM approval_pending_tokens WHERE label = 'cutoff-stage2'
  );
  v_row public.client_decisions;
  v_throttled boolean := false;
BEGIN
  v_row := public.stamp_client_decision_reminder(v_id);
  ASSERT v_row.reminder_sent_at IS NOT NULL,
    'studio Stage-2 reminder did not stamp the pending decision';
  BEGIN
    PERFORM public.stamp_client_decision_reminder(v_id);
  EXCEPTION WHEN check_violation THEN v_throttled := true;
  END;
  ASSERT v_throttled, 'Stage-2 reminder bypassed the one-hour throttle';
END;
$$;
RESET ROLE;
DO $$
DECLARE
  v_id uuid := (
    SELECT decision_id FROM approval_pending_tokens WHERE label = 'cutoff-stage2'
  );
BEGIN
  ASSERT (
    SELECT count(*) = 1
    FROM public.notification_log AS notification
    WHERE notification.user_id = 'a4360000-0000-4000-8000-000000000002'
      AND notification.type = 'decision_reminder'
      AND notification.metadata->>'decision_id' = v_id::text
  ), 'Stage-2 reminder was not one atomic frozen-lead notification';
END;
$$;

-- Stage-2 response effects are limited to exact-project FF&E blockers. The
-- same approved decision is deliberately referenced by one foreign-project
-- row to prove it cannot become a confused cross-project unblock.
INSERT INTO public.project_ffe_items (
  id, project_id, name, item_type, status, quantity,
  blocked, blocked_reason, blocked_by_decision_id
)
SELECT fixture.item_id, fixture.project_id, fixture.item_name,
       'fixed', 'specified', 1, true, 'Awaiting Stage-2 response',
       token.decision_id
FROM (VALUES
  ('advance-approved',
   'a4366000-0000-4000-8000-000000000001'::uuid,
   'a4363000-0000-4000-8000-000000000001'::uuid,
   'Approved response blocker'),
  ('web-changes',
   'a4366000-0000-4000-8000-000000000002'::uuid,
   'a4363000-0000-4000-8000-000000000001'::uuid,
   'Changes requested blocker'),
  ('web-discussion',
   'a4366000-0000-4000-8000-000000000003'::uuid,
   'a4363000-0000-4000-8000-000000000001'::uuid,
   'Needs discussion blocker'),
  ('advance-approved',
   'a4366000-0000-4000-8000-000000000004'::uuid,
   'a4363000-0000-4000-8000-000000000002'::uuid,
   'Foreign project blocker')
) AS fixture(label, item_id, project_id, item_name)
JOIN approval_pending_tokens AS token ON token.label = fixture.label;

-- A controlled same-day past due time distinguishes timestamp semantics from
-- the stale CURRENT_DATE behavior while preserving artifact/parent coherence.
SET LOCAL session_replication_role = replica;
UPDATE public.client_decisions
SET due_date = now() - interval '1 hour'
WHERE id = (
  SELECT decision_id FROM approval_pending_tokens WHERE label = 'overdue-stage2'
);
UPDATE public.project_approval_artifacts
SET due_at = now() - interval '1 hour'
WHERE decision_id = (
  SELECT decision_id FROM approval_pending_tokens WHERE label = 'overdue-stage2'
);
SET LOCAL session_replication_role = origin;

-- The actual phase command sees the shared pending Stage-2 blocker.
SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.advance_project_phase(
      'a4363000-0000-4000-8000-000000000001',
      'a4363100-0000-4000-8000-000000000001',
      'in_progress'
    );
  EXCEPTION WHEN OTHERS THEN v_denied := true;
  END;
  ASSERT v_denied, 'real phase advance ignored a pending Stage-2 blocker';
END;
$$;
RESET ROLE;

-- Stage one pre-00464 malformed extra option without blessing a production
-- writer. Both response entry points must fail closed on total child count.
SET LOCAL session_replication_role = replica;
INSERT INTO public.client_decision_options (
  id, decision_id, name, approves, selected, sort_order
) VALUES (
  'a4365000-0000-4000-8000-000000000001',
  (SELECT decision_id FROM approval_pending_tokens
   WHERE label = 'malformed-extra'),
  'Historical extra option', false, false, 99
);
SET LOCAL session_replication_role = origin;

SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_web_denied boolean := false;
  v_installed_denied boolean := false;
  v_comment_key_denied boolean := false;
  v_comment_arg_denied boolean := false;
  v_quantity_denied boolean := false;
  v_malformed_id uuid := (
    SELECT decision_id FROM approval_pending_tokens
    WHERE label = 'malformed-extra'
  );
  v_malformed_updated timestamptz := (
    SELECT updated_at FROM approval_pending_tokens
    WHERE label = 'malformed-extra'
  );
  v_malformed_option uuid := (
    SELECT id FROM public.client_decision_options
    WHERE decision_id = (
      SELECT decision_id FROM approval_pending_tokens
      WHERE label = 'malformed-extra'
    ) AND approval_outcome = 'approved'
  );
  v_changes_id uuid := (
    SELECT decision_id FROM approval_pending_tokens WHERE label = 'web-changes'
  );
  v_installed_id uuid := (
    SELECT decision_id FROM approval_pending_tokens
    WHERE label = 'installed-approved'
  );
  v_installed_option uuid := (
    SELECT id FROM public.client_decision_options
    WHERE decision_id = (
      SELECT decision_id FROM approval_pending_tokens
      WHERE label = 'installed-approved'
    ) AND approval_outcome = 'approved'
  );
BEGIN
  BEGIN
    PERFORM public.respond_project_approval(
      v_malformed_id, '{"outcome":"approved"}'::jsonb,
      v_malformed_updated, 'malformed-web'
    );
  EXCEPTION WHEN OTHERS THEN v_web_denied := true;
  END;
  BEGIN
    PERFORM public.apply_client_decision(
      v_malformed_id, v_malformed_option, NULL, NULL, NULL, NULL
    );
  EXCEPTION WHEN OTHERS THEN v_installed_denied := true;
  END;
  BEGIN
    PERFORM public.respond_project_approval(
      v_changes_id,
      '{"outcome":"changes_requested","comment":"not evidence"}'::jsonb,
      (SELECT updated_at FROM approval_pending_tokens WHERE label = 'web-changes'),
      'comment-key-denied'
    );
  EXCEPTION WHEN OTHERS THEN v_comment_key_denied := true;
  END;
  BEGIN
    PERFORM public.apply_client_decision(
      v_installed_id, v_installed_option, NULL, NULL, 'not evidence', NULL
    );
  EXCEPTION WHEN OTHERS THEN v_comment_arg_denied := true;
  END;
  BEGIN
    PERFORM public.apply_client_decision(
      v_installed_id, v_installed_option, NULL, NULL, NULL, 2
    );
  EXCEPTION WHEN OTHERS THEN v_quantity_denied := true;
  END;
  ASSERT v_web_denied AND v_installed_denied,
    'a fourth option did not fail closed through both response rails';
  ASSERT v_comment_key_denied AND v_comment_arg_denied,
    'comment material was accepted as Stage-2 response evidence';
  ASSERT v_quantity_denied,
    'installed Stage-2 response accepted quantity other than NULL/1';
END;
$$;

-- All public outcomes, with exact replay, changed-key conflict, and stale CAS.
INSERT INTO approval_lifecycle_results(label, payload)
SELECT 'advance-approved-response', public.respond_project_approval(
  token.decision_id, '{"outcome":"approved"}'::jsonb,
  token.updated_at, 'respond-advance-approved'
)
FROM approval_pending_tokens AS token
WHERE token.label = 'advance-approved';

INSERT INTO approval_lifecycle_results(label, payload)
SELECT 'advance-approved-retry', public.respond_project_approval(
  token.decision_id, '{"outcome":"approved"}'::jsonb,
  token.updated_at, 'respond-advance-approved'
)
FROM approval_pending_tokens AS token
WHERE token.label = 'advance-approved';

DO $$
DECLARE
  v_conflict boolean := false;
  v_stale boolean := false;
  v_discussion_id uuid := (
    SELECT decision_id FROM approval_pending_tokens WHERE label = 'web-discussion'
  );
BEGIN
  BEGIN
    PERFORM public.respond_project_approval(
      (SELECT decision_id FROM approval_pending_tokens
       WHERE label = 'advance-approved'),
      '{"outcome":"needs_discussion"}'::jsonb,
      (SELECT updated_at FROM approval_pending_tokens
       WHERE label = 'advance-approved'),
      'respond-advance-approved'
    );
  EXCEPTION WHEN OTHERS THEN v_conflict := true;
  END;
  BEGIN
    PERFORM public.respond_project_approval(
      v_discussion_id, '{"outcome":"needs_discussion"}'::jsonb,
      '2000-01-01T00:00:00Z', 'stale-discussion'
    );
  EXCEPTION WHEN OTHERS THEN v_stale := true;
  END;
  ASSERT v_conflict, 'changed outcome reused a response key';
  ASSERT v_stale, 'stale response CAS unexpectedly succeeded';
END;
$$;

INSERT INTO approval_lifecycle_results(label, payload)
SELECT 'web-changes-response', public.respond_project_approval(
  token.decision_id,
  jsonb_build_object(
    'optionId', (
      SELECT option.id FROM public.client_decision_options AS option
      WHERE option.decision_id = token.decision_id
        AND option.approval_outcome = 'changes_requested'
    )
  ),
  token.updated_at, 'respond-web-changes'
)
FROM approval_pending_tokens AS token
WHERE token.label = 'web-changes';

INSERT INTO approval_lifecycle_results(label, payload)
SELECT 'web-discussion-response', public.respond_project_approval(
  token.decision_id, '{"outcome":"needs_discussion"}'::jsonb,
  token.updated_at, 'respond-web-discussion'
)
FROM approval_pending_tokens AS token
WHERE token.label = 'web-discussion';

-- Installed option-ID compatibility reaches the same receipt/effect core.
SELECT public.apply_client_decision(
  token.decision_id, option.id, 'click_through', NULL, NULL, 1
)
FROM approval_pending_tokens AS token
JOIN public.client_decision_options AS option
  ON option.decision_id = token.decision_id
 AND option.approval_outcome = 'approved'
WHERE token.label = 'installed-approved';

SELECT public.apply_client_decision(
  token.decision_id, option.id, NULL, NULL, NULL, NULL
)
FROM approval_pending_tokens AS token
JOIN public.client_decision_options AS option
  ON option.decision_id = token.decision_id
 AND option.approval_outcome = 'changes_requested'
WHERE token.label = 'installed-changes';

SELECT public.apply_client_decision(
  token.decision_id, option.id, NULL, NULL, NULL, NULL
)
FROM approval_pending_tokens AS token
JOIN public.client_decision_options AS option
  ON option.decision_id = token.decision_id
 AND option.approval_outcome = 'needs_discussion'
WHERE token.label = 'installed-discussion';

-- Installed terminal replay must prove the original receipt and normalized
-- consent/signature identity rather than treating the selected option alone
-- as authority.
SELECT public.apply_client_decision(
  token.decision_id, option.id, 'click_through', NULL, NULL, 1
)
FROM approval_pending_tokens AS token
JOIN public.client_decision_options AS option
  ON option.decision_id = token.decision_id
 AND option.approval_outcome = 'approved'
WHERE token.label = 'installed-approved';

DO $$
DECLARE
  v_decision_id uuid := (
    SELECT decision_id FROM approval_pending_tokens
    WHERE label = 'installed-approved'
  );
  v_option_id uuid := (
    SELECT option.id
    FROM public.client_decision_options AS option
    WHERE option.decision_id = (
      SELECT decision_id FROM approval_pending_tokens
      WHERE label = 'installed-approved'
    ) AND option.approval_outcome = 'approved'
  );
  v_pending_id uuid := (
    SELECT decision_id FROM approval_pending_tokens
    WHERE label = 'cutoff-stage2'
  );
  v_pending_option_id uuid := (
    SELECT option.id
    FROM public.client_decision_options AS option
    WHERE option.decision_id = (
      SELECT decision_id FROM approval_pending_tokens
      WHERE label = 'cutoff-stage2'
    ) AND option.approval_outcome = 'approved'
  );
  v_consent_conflict boolean := false;
  v_signature_conflict boolean := false;
  v_orphan_signature_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.apply_client_decision(
      v_decision_id, v_option_id,
      'electronic_signature', 'Lifecycle Lead A', NULL, 1
    );
  EXCEPTION WHEN OTHERS THEN v_consent_conflict := true;
  END;
  BEGIN
    PERFORM public.apply_client_decision(
      v_decision_id, v_option_id,
      'click_through', 'Changed signature', NULL, 1
    );
  EXCEPTION WHEN OTHERS THEN v_signature_conflict := true;
  END;
  BEGIN
    PERFORM public.apply_client_decision(
      v_pending_id, v_pending_option_id,
      NULL, 'Unbound signature', NULL, 1
    );
  EXCEPTION WHEN OTHERS THEN v_orphan_signature_denied := true;
  END;
  ASSERT v_consent_conflict AND v_signature_conflict,
    'installed terminal replay accepted changed consent/signature evidence';
  ASSERT v_orphan_signature_denied,
    'Stage-2 response accepted a signature without a consent method';
  ASSERT pg_temp.stage2_response_evidence_is_absent(v_pending_id),
    'rejected unbound signature left response evidence behind';
END;
$$;

RESET ROLE;
DO $$
DECLARE
  v_row record;
BEGIN
  FOR v_row IN
    SELECT token.label, decision.id, decision.status, decision.answer,
           selected.approval_outcome,
           public._client_decision_blocks_phase(decision) AS blocks
    FROM approval_pending_tokens AS token
    JOIN public.client_decisions AS decision ON decision.id = token.decision_id
    JOIN public.client_decision_options AS selected
      ON selected.decision_id = decision.id AND selected.selected
    WHERE token.label IN (
      'advance-approved', 'web-changes', 'web-discussion',
      'installed-approved', 'installed-changes', 'installed-discussion'
    )
  LOOP
    ASSERT v_row.status = 'responded'
       AND v_row.answer IS NOT DISTINCT FROM v_row.approval_outcome,
      format('%s did not preserve response compatibility fields', v_row.label);
    ASSERT v_row.blocks IS DISTINCT FROM
      (v_row.approval_outcome = 'approved'),
      format('%s has the wrong shared blocker result', v_row.label);
  END LOOP;
  ASSERT EXISTS (
    SELECT 1 FROM public.project_ffe_items
    WHERE id = 'a4366000-0000-4000-8000-000000000001'
      AND project_id = 'a4363000-0000-4000-8000-000000000001'
      AND blocked = false
      AND blocked_reason IS NULL
      AND blocked_by_decision_id IS NULL
  ), 'approved Stage-2 response did not release its exact-project FF&E blocker';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_ffe_items
    WHERE id IN (
      'a4366000-0000-4000-8000-000000000002',
      'a4366000-0000-4000-8000-000000000003',
      'a4366000-0000-4000-8000-000000000004'
    )
      AND (
        blocked IS DISTINCT FROM true
        OR blocked_reason IS DISTINCT FROM 'Awaiting Stage-2 response'
        OR blocked_by_decision_id IS NULL
      )
  ), 'non-approved or foreign-project FF&E blocker was released';
END;
$$;


-- Once the only exact-phase request is approved, the real transition succeeds.
SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_lab record;
  v_overdue_id text := (
    SELECT decision_id::text FROM approval_pending_tokens
    WHERE label = 'overdue-stage2'
  );
  v_changes_id text := (
    SELECT decision_id::text FROM approval_pending_tokens
    WHERE label = 'web-changes'
  );
  v_discussion_id text := (
    SELECT decision_id::text FROM approval_pending_tokens
    WHERE label = 'web-discussion'
  );
BEGIN
  SELECT * INTO STRICT v_lab
  FROM public.get_project_workflow(
    'a4363000-0000-4000-8000-000000000001'
  )
  WHERE phase_id = 'a4363100-0000-4000-8000-000000000003';

  ASSERT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_lab.current_blockers->'phase') AS item
    WHERE item->>'id' = v_overdue_id
      AND (item->>'status') = 'pending'
      AND (item->>'isOverdue')::boolean
  ), 'same-day pending Stage-2 item was not overdue in workflow projection';
  ASSERT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_lab.current_blockers->'phase') AS item
    WHERE item->>'id' IN (v_changes_id, v_discussion_id)
      AND (item->>'isOverdue')::boolean
  ), 'responded changes/discussion was mislabeled overdue in workflow projection';
END;
$$;

INSERT INTO approval_lifecycle_results(label, payload)
SELECT 'advance-receipt', public.advance_project_phase(
  'a4363000-0000-4000-8000-000000000001',
  'a4363100-0000-4000-8000-000000000001',
  'in_progress'
);

DO $$
DECLARE
  v_completed_guard_denied boolean := false;
  v_completed_supersede_denied boolean := false;
  v_approved_id uuid := (
    SELECT decision_id FROM approval_pending_tokens
    WHERE label = 'advance-approved'
  );
BEGIN
  BEGIN
    PERFORM public.create_project_approval_decision(
      'a4363000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'title', 'Late completed phase request',
        'question', 'May a completed phase gain a blocker?',
        'dueAt', (now() + interval '7 days')::text,
        'phaseId', 'a4363100-0000-4000-8000-000000000001',
        'artifactKind', 'plan_issue',
        'artifactId', 'a4364000-0000-4000-8000-000000000013',
        'costCentsDelta', 0,
        'scheduleDaysDelta', 0,
        'leadTimeDaysDelta', 0
      ),
      'completed-phase-create'
    );
  EXCEPTION WHEN OTHERS THEN v_completed_guard_denied := true;
  END;
  BEGIN
    PERFORM public.supersede_project_approval_decision(
      v_approved_id,
      jsonb_build_object(
        'title', 'Late revision',
        'question', 'Approve a revision after phase completion?',
        'dueAt', (now() + interval '7 days')::text,
        'artifactKind', 'plan_issue',
        'artifactId', 'a4364000-0000-4000-8000-000000000013',
        'costCentsDelta', 0,
        'scheduleDaysDelta', 0,
        'leadTimeDaysDelta', 0
      ),
      (SELECT updated_at FROM public.client_decisions WHERE id = v_approved_id),
      'completed-phase-supersede'
    );
  EXCEPTION WHEN OTHERS THEN v_completed_supersede_denied := true;
  END;
  ASSERT v_completed_guard_denied,
    'completed phase accepted a new Stage-2 blocker';
  ASSERT v_completed_supersede_denied,
    'completed phase accepted a blocking successor after approval';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_approval_action_receipts
    WHERE idempotency_key IN (
      'completed-phase-create', 'completed-phase-supersede'
    )
  ), 'failed completed-phase operations left partial receipts';
END;
$$;
RESET ROLE;

-- Clients cannot author dispositions. Studio withdrawal/supersession are
-- exact-CAS, receipt-idempotent, and preserve responded approval effects.
SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_withdraw_denied boolean := false;
  v_supersede_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.withdraw_project_approval_decision(
      (SELECT decision_id FROM approval_pending_tokens WHERE label = 'withdraw'),
      (SELECT updated_at FROM approval_pending_tokens WHERE label = 'withdraw'),
      'Client cannot withdraw', 'client-withdraw'
    );
  EXCEPTION WHEN OTHERS THEN v_withdraw_denied := true;
  END;
  BEGIN
    PERFORM public.supersede_project_approval_decision(
      (SELECT decision_id FROM approval_pending_tokens
       WHERE label = 'supersede-pending'),
      jsonb_build_object(
        'title', 'Client-forged revision',
        'question', 'Should this fail?',
        'dueAt', (now() + interval '7 days')::text,
        'artifactKind', 'plan_issue',
        'artifactId', 'a4364000-0000-4000-8000-000000000006',
        'costCentsDelta', 0,
        'scheduleDaysDelta', 0,
        'leadTimeDaysDelta', 0
      ),
      (SELECT updated_at FROM approval_pending_tokens
       WHERE label = 'supersede-pending'),
      'client-supersede'
    );
  EXCEPTION WHEN OTHERS THEN v_supersede_denied := true;
  END;
  ASSERT v_withdraw_denied AND v_supersede_denied,
    'frozen household lead performed a studio-only disposition';
END;
$$;
RESET ROLE;

SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;

INSERT INTO approval_lifecycle_results(label, payload)
SELECT 'withdraw-result', public.withdraw_project_approval_decision(
  decision_id, updated_at, 'Scope intentionally removed', 'withdraw-1'
)
FROM approval_pending_tokens WHERE label = 'withdraw';
INSERT INTO approval_lifecycle_results(label, payload)
SELECT 'withdraw-retry', public.withdraw_project_approval_decision(
  decision_id, updated_at, 'Scope intentionally removed', 'withdraw-1'
)
FROM approval_pending_tokens WHERE label = 'withdraw';

DO $$
DECLARE
  v_conflict boolean := false;
  v_cross_phase boolean := false;
BEGIN
  BEGIN
    PERFORM public.withdraw_project_approval_decision(
      (SELECT decision_id FROM approval_pending_tokens WHERE label = 'withdraw'),
      (SELECT updated_at FROM approval_pending_tokens WHERE label = 'withdraw'),
      'Different reason', 'withdraw-1'
    );
  EXCEPTION WHEN OTHERS THEN v_conflict := true;
  END;
  BEGIN
    PERFORM public.supersede_project_approval_decision(
      (SELECT decision_id FROM approval_pending_tokens
       WHERE label = 'supersede-pending'),
      jsonb_build_object(
        'title', 'Cross-phase revision',
        'question', 'Should this fail?',
        'dueAt', (now() + interval '7 days')::text,
        'phaseId', 'a4363100-0000-4000-8000-000000000002',
        'artifactKind', 'plan_issue',
        'artifactId', 'a4364000-0000-4000-8000-000000000006',
        'costCentsDelta', 0,
        'scheduleDaysDelta', 0,
        'leadTimeDaysDelta', 0
      ),
      (SELECT updated_at FROM approval_pending_tokens
       WHERE label = 'supersede-pending'),
      'cross-phase-supersede'
    );
  EXCEPTION WHEN OTHERS THEN v_cross_phase := true;
  END;
  ASSERT v_conflict, 'withdrawal key accepted a conflicting reason';
  ASSERT v_cross_phase, 'supersede accepted a caller-supplied phase override';
END;
$$;

INSERT INTO approval_lifecycle_results(label, payload)
SELECT 'supersede-pending-result', public.supersede_project_approval_decision(
  token.decision_id,
  jsonb_build_object(
    'title', 'Checked successor',
    'question', 'Approve the revised immutable set?',
    'context', 'A genuinely new client-safe issue.',
    'dueAt', (now() + interval '8 days')::text,
    'artifactKind', 'plan_issue',
    'artifactId', 'a4364000-0000-4000-8000-000000000006',
    'costCentsDelta', 0,
    'scheduleDaysDelta', 2,
    'leadTimeDaysDelta', -2
  ),
  token.updated_at, 'supersede-pending-1'
)
FROM approval_pending_tokens AS token
WHERE token.label = 'supersede-pending';

INSERT INTO approval_lifecycle_results(label, payload)
SELECT 'supersede-pending-retry', public.supersede_project_approval_decision(
  token.decision_id,
  jsonb_build_object(
    'title', 'Checked successor',
    'question', 'Approve the revised immutable set?',
    'context', 'A genuinely new client-safe issue.',
    'dueAt', (
      SELECT artifact.due_at::text
      FROM public.project_approval_artifacts AS artifact
      WHERE artifact.decision_id = (
        SELECT (payload->>'successorDecisionId')::uuid
        FROM approval_lifecycle_results
        WHERE label = 'supersede-pending-result'
      )
    ),
    'artifactKind', 'plan_issue',
    'artifactId', 'a4364000-0000-4000-8000-000000000006',
    'costCentsDelta', 0,
    'scheduleDaysDelta', 2,
    'leadTimeDaysDelta', -2
  ),
  token.updated_at, 'supersede-pending-1'
)
FROM approval_pending_tokens AS token
WHERE token.label = 'supersede-pending';

INSERT INTO approval_lifecycle_results(label, payload)
SELECT 'supersede-approved-result', public.supersede_project_approval_decision(
  token.decision_id,
  jsonb_build_object(
    'title', 'Approved decision revision',
    'question', 'Approve the next immutable set?',
    'dueAt', (now() + interval '9 days')::text,
    'artifactKind', 'plan_issue',
    'artifactId', 'a4364000-0000-4000-8000-000000000014',
    'costCentsDelta', 1,
    'scheduleDaysDelta', 1,
    'leadTimeDaysDelta', 1
  ),
  decision.updated_at, 'supersede-approved-1'
)
FROM approval_pending_tokens AS token
JOIN public.client_decisions AS decision ON decision.id = token.decision_id
WHERE token.label = 'installed-approved';

DO $$
DECLARE
  v_pending_id uuid := (
    SELECT decision_id FROM approval_pending_tokens
    WHERE label = 'supersede-pending'
  );
  v_approved_id uuid := (
    SELECT decision_id FROM approval_pending_tokens
    WHERE label = 'installed-approved'
  );
BEGIN
  ASSERT (SELECT status FROM public.client_decisions WHERE id = v_pending_id)
           = 'expired',
    'pending superseded predecessor did not retain expired wire status';
  ASSERT (SELECT status FROM public.client_decisions WHERE id = v_approved_id)
           = 'responded',
    'superseding approved response reversed its terminal effect';
  ASSERT EXISTS (
    SELECT 1 FROM public.client_decision_options
    WHERE decision_id = v_approved_id
      AND approval_outcome = 'approved' AND selected
  ), 'superseding approved response cleared its selected outcome';
  ASSERT EXISTS (
    SELECT 1 FROM public.client_decisions AS successor
    WHERE successor.predecessor_decision_id = v_pending_id
      AND successor.status = 'draft'
      AND successor.phase_id = 'a4363100-0000-4000-8000-000000000003'
      AND successor.section_key = 'project'
      AND successor.blocks_kind = 'phase'
      AND successor.blocking_status = 'blocks_phase'
  ), 'pending successor did not preserve exact server-owned lineage';
END;
$$;
RESET ROLE;

-- Staged historical corruption proves the shared predicate fails closed on a
-- mismatched response receipt and on supersession evidence whose predecessor
-- retained the wrong pending status.
SET LOCAL session_replication_role = replica;
UPDATE public.client_decision_options AS option
SET selected = option.approval_outcome = 'approved'
WHERE option.decision_id = (
  SELECT decision_id FROM approval_pending_tokens WHERE label = 'cutoff-stage2'
);
UPDATE public.client_decisions
SET status = 'responded',
    responded_at = now(),
    selected_by = 'a4360000-0000-4000-8000-000000000002',
    answer = 'approved',
    answered_at = now(),
    answered_by = 'a4360000-0000-4000-8000-000000000002',
    updated_at = now()
WHERE id = (
  SELECT decision_id FROM approval_pending_tokens WHERE label = 'cutoff-stage2'
);
INSERT INTO public.project_approval_action_receipts (
  id, project_id, decision_id, action_kind, idempotency_key,
  request_hash, actor_id, result
) SELECT
  'a4366000-0000-4000-8000-000000000001',
  decision.project_id, decision.id, 'responded', 'forged-mismatch',
  repeat('a', 64), 'a4360000-0000-4000-8000-000000000002',
  jsonb_build_object(
    'projectId', decision.project_id,
    'decisionId', decision.id,
    'optionId', selected.id,
    'outcome', 'changes_requested'
  )
FROM public.client_decisions AS decision
JOIN public.client_decision_options AS selected
  ON selected.decision_id = decision.id AND selected.selected
WHERE decision.id = (
  SELECT decision_id FROM approval_pending_tokens WHERE label = 'cutoff-stage2'
);

INSERT INTO public.client_decisions
SELECT (jsonb_populate_record(
  NULL::public.client_decisions,
  to_jsonb(predecessor) || jsonb_build_object(
    'id', 'a4367000-0000-4000-8000-000000000001',
    'predecessor_decision_id', predecessor.id,
    'status', 'draft',
    'sent_at', NULL,
    'responded_at', NULL,
    'selected_by', NULL,
    'answer', NULL,
    'answered_at', NULL,
    'answered_by', NULL,
    'created_at', now(),
    'updated_at', now()
  )
)).*
FROM public.client_decisions AS predecessor
WHERE predecessor.id = (
  SELECT decision_id FROM approval_pending_tokens
  WHERE label = 'malformed-supersede'
);
INSERT INTO public.project_approval_action_receipts (
  id, project_id, decision_id, action_kind, idempotency_key,
  request_hash, actor_id, result, successor_decision_id
) SELECT
  'a4366000-0000-4000-8000-000000000002',
  predecessor.project_id, predecessor.id, 'superseded', 'forged-old-status',
  repeat('b', 64), 'a4360000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'projectId', predecessor.project_id,
    'decisionId', predecessor.id,
    'successorDecisionId', 'a4367000-0000-4000-8000-000000000001'
  ),
  'a4367000-0000-4000-8000-000000000001'
FROM public.client_decisions AS predecessor
WHERE predecessor.id = (
  SELECT decision_id FROM approval_pending_tokens
  WHERE label = 'malformed-supersede'
);
SET LOCAL session_replication_role = origin;

DO $$
DECLARE
  v_mismatched public.client_decisions;
  v_wrong_status public.client_decisions;
BEGIN
  SELECT * INTO STRICT v_mismatched
  FROM public.client_decisions
  WHERE id = (
    SELECT decision_id FROM approval_pending_tokens WHERE label = 'cutoff-stage2'
  );
  SELECT * INTO STRICT v_wrong_status
  FROM public.client_decisions
  WHERE id = (
    SELECT decision_id FROM approval_pending_tokens
    WHERE label = 'malformed-supersede'
  );
  ASSERT public._client_decision_blocks_phase(v_mismatched),
    'mismatched responded receipt cleared a Stage-2 gate';
  ASSERT public._client_decision_blocks_phase(v_wrong_status),
    'supersede receipt cleared a predecessor that retained pending status';
END;
$$;

SELECT pg_temp.assume_approval_actor(
  'a4360000-0000-4000-8000-000000000001', 'service_role'
);
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_forged_denied boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.project_approval_action_receipts (
      project_id, decision_id, action_kind, idempotency_key,
      request_hash, actor_id, result, successor_decision_id
    ) VALUES (
      'a4363000-0000-4000-8000-000000000001',
      (SELECT decision_id FROM approval_pending_tokens
       WHERE label = 'web-changes'),
      'responded', 'service-forged-successor', repeat('c', 64),
      'a4360000-0000-4000-8000-000000000001', '{}'::jsonb,
      (SELECT (payload->>'successorDecisionId')::uuid
       FROM approval_lifecycle_results
       WHERE label = 'supersede-pending-result')
    );
  EXCEPTION WHEN OTHERS THEN v_forged_denied := true;
  END;
  ASSERT v_forged_denied,
    'service role forged a receipt or bypassed successor/action coherence';
END;
$$;
RESET ROLE;

-- Stage-2 pending rows are never expired/reopened by generic compatibility
-- commands. A future cutoff stands in for overdue scheduling while the read
-- model derives isOverdue only from server time and due_at.

SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_id uuid := (
    SELECT decision_id FROM approval_pending_tokens
    WHERE label = 'malformed-extra'
  );
  v_expire_denied boolean := false;
  v_reopen_denied boolean := false;
  v_extend_denied boolean := false;
BEGIN
  BEGIN PERFORM public.expire_client_decision(v_id);
  EXCEPTION WHEN OTHERS THEN v_expire_denied := true; END;
  BEGIN PERFORM public.reopen_client_decision(v_id);
  EXCEPTION WHEN OTHERS THEN v_reopen_denied := true; END;
  BEGIN PERFORM public.extend_and_reopen_client_decision(
    v_id, now() + interval '30 days',
    (SELECT updated_at FROM public.client_decisions WHERE id = v_id)
  );
  EXCEPTION WHEN OTHERS THEN v_extend_denied := true; END;
  ASSERT v_expire_denied AND v_reopen_denied AND v_extend_denied,
    'generic lifecycle command accepted a Stage-2 decision';
END;
$$;
RESET ROLE;

SELECT pg_temp.assume_approval_actor(
  'a4360000-0000-4000-8000-000000000001', 'service_role'
);
SET LOCAL ROLE service_role;
SELECT count(*) AS stage2_expired_by_cutoff
FROM public.expire_due_client_decisions('2100-01-01T00:00:00Z')
WHERE id IN (
  SELECT decision_id FROM approval_pending_tokens
);
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1
    FROM approval_pending_tokens AS token
    JOIN public.client_decisions AS decision ON decision.id = token.decision_id
    WHERE token.label = 'malformed-extra' AND decision.status = 'pending'
  ), 'due-expiry worker mutated a pending Stage-2 decision';
  ASSERT EXISTS (
    SELECT 1
    FROM approval_pending_tokens AS token
    JOIN public.client_decisions AS decision ON decision.id = token.decision_id
    WHERE token.label = 'overdue-stage2'
      AND decision.status = 'pending'
      AND decision.due_date < now()
  ), 'due-expiry worker mutated the past-due Stage-2 request';
END;
$$;
RESET ROLE;

-- One unclassified selection exercises the preserved 00399/00413 lifecycle.
INSERT INTO public.client_decisions (
  id, designer_client_id, designer_id, project_id, phase_id,
  title, due_date, status, decision_type, blocking_status,
  coordination_kind, court, blocks_kind
) VALUES (
  'a4368000-0000-4000-8000-000000000001',
  'a4362000-0000-4000-8000-000000000001',
  'a4360000-0000-4000-8000-000000000001',
  'a4363000-0000-4000-8000-000000000001',
  'a4363100-0000-4000-8000-000000000003',
  'Legacy option selection', now() + interval '7 days', 'draft',
  'product', 'non_blocking', 'selection', 'client', 'none'
);
INSERT INTO public.client_decision_options (
  id, decision_id, name, approves, selected, sort_order
) VALUES (
  'a4368100-0000-4000-8000-000000000001',
  'a4368000-0000-4000-8000-000000000001',
  'Legacy selection', false, false, 0
);

SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT public.publish_client_decision('a4368000-0000-4000-8000-000000000001');
DO $$
DECLARE
  v_row public.client_decisions;
BEGIN
  v_row := public.stamp_client_decision_reminder(
    'a4368000-0000-4000-8000-000000000001'
  );
  ASSERT v_row.reminder_sent_at IS NOT NULL,
    'legacy reminder compatibility was not preserved';
END;
$$;
RESET ROLE;
SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_first public.client_decisions;
  v_retry public.client_decisions;
BEGIN
  v_first := public.mark_client_decision_viewed(
    'a4368000-0000-4000-8000-000000000001'
  );
  v_retry := public.mark_client_decision_viewed(
    'a4368000-0000-4000-8000-000000000001'
  );
  ASSERT v_first.viewed_at IS NOT NULL
     AND v_retry.viewed_at IS NOT DISTINCT FROM v_first.viewed_at
     AND v_retry.updated_at IS NOT DISTINCT FROM v_first.updated_at,
    'legacy viewed compatibility/idempotency was not preserved';
END;
$$;
SELECT public.apply_client_decision(
  'a4368000-0000-4000-8000-000000000001',
  'a4368100-0000-4000-8000-000000000001',
  NULL, NULL, 'legacy note remains supported', 2
);
RESET ROLE;
SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT public.reopen_client_decision('a4368000-0000-4000-8000-000000000001');
SELECT public.expire_client_decision('a4368000-0000-4000-8000-000000000001');
SELECT public.extend_and_reopen_client_decision(
  'a4368000-0000-4000-8000-000000000001',
  now() + interval '20 days',
  (SELECT updated_at FROM public.client_decisions
   WHERE id = 'a4368000-0000-4000-8000-000000000001')
);
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM public.client_decisions
    WHERE id = 'a4368000-0000-4000-8000-000000000001'
      AND approval_contract IS NULL AND status = 'pending'
  ), 'legacy decision lifecycle was not preserved';
  ASSERT EXISTS (
    SELECT 1 FROM public.client_decision_options
    WHERE id = 'a4368100-0000-4000-8000-000000000001'
      AND approval_outcome IS NULL
  ), 'legacy option was reclassified as Stage-2';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.client_decisions
    WHERE linked_proposal_id IS NOT NULL AND approval_contract IS NOT NULL
  ), 'proposal signature decisions were reclassified as Stage-2';
END;
$$;
RESET ROLE;

-- Rotate the exact project client and explicit authority to create one later
-- frozen-lead decision, then rotate again without authority. Projection access
-- must follow snapshots, never the mutable projects.client_id value.
SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT public.set_document_client(
  'project', 'a4363000-0000-4000-8000-000000000001',
  'a4360000-0000-4000-8000-000000000007'
);
INSERT INTO approval_lifecycle_results(label, payload)
SELECT 'authority-a2', public.set_project_decision_authority(
  'a4363000-0000-4000-8000-000000000001',
  'a4360000-0000-4000-8000-000000000007', NULL, 1
);
SELECT pg_temp.create_lifecycle_approval('new-lead-only', 15);
SELECT public.set_document_client(
  'project', 'a4363000-0000-4000-8000-000000000001',
  'a4360000-0000-4000-8000-000000000006'
);
RESET ROLE;

SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
INSERT INTO approval_lifecycle_results(label, payload)
SELECT 'old-lead-projection', public.get_project_decision_reviews(
  'a4363000-0000-4000-8000-000000000001'
);
RESET ROLE;
SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000007');
SET LOCAL ROLE authenticated;
INSERT INTO approval_lifecycle_results(label, payload)
SELECT 'new-lead-projection', public.get_project_decision_reviews(
  'a4363000-0000-4000-8000-000000000001'
);
RESET ROLE;

DO $$
DECLARE
  v_old jsonb := (
    SELECT payload FROM approval_lifecycle_results
    WHERE label = 'old-lead-projection'
  );
  v_new jsonb := (
    SELECT payload FROM approval_lifecycle_results
    WHERE label = 'new-lead-projection'
  );
  v_new_id text := (
    SELECT payload->>'decisionId' FROM approval_lifecycle_results
    WHERE label = 'new-lead-only-create'
  );
BEGIN
  ASSERT jsonb_array_length(v_old) > 1
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_old) AS item
       WHERE item->>'decisionId' = v_new_id
     ), 'old frozen lead saw a later lead snapshot';
  ASSERT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_old) AS item
    WHERE item->>'decisionId' = (
      SELECT decision_id::text FROM approval_pending_tokens
      WHERE label = 'overdue-stage2'
    )
      AND item->>'lifecycleStatus' = 'pending'
      AND (item->>'isOverdue')::boolean
  ), 'past-due Stage-2 request did not remain pending with isOverdue=true';
  ASSERT jsonb_array_length(v_new) = 1
     AND v_new->0->>'decisionId' = v_new_id,
    'new frozen lead saw another lead snapshot';
  ASSERT v_old::text NOT LIKE '%decisionLeadId%'
     AND v_old::text NOT LIKE '%approverId%'
     AND v_new::text NOT LIKE '%decisionLeadId%'
     AND v_new::text NOT LIKE '%approverId%',
    'sanitized projection leaked reviewer identities';
  ASSERT (v_old->0) ?& ARRAY[
    'artifactKind', 'artifactId', 'artifactVersion', 'artifactChecksum',
    'artifactTitle', 'question', 'dueAt', 'phaseId',
    'costCentsDelta', 'scheduleDaysDelta', 'leadTimeDaysDelta',
    'lifecycleStatus', 'outcome', 'disposition',
    'completedReviewCount', 'requiredReviewCount',
    'predecessorDecisionId', 'successorDecisionId', 'updatedAt'
  ], 'projection omitted required client-safe lifecycle fields';
END;
$$;

SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000006');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.get_project_decision_reviews(
      'a4363000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN OTHERS THEN v_denied := true;
  END;
  ASSERT v_denied,
    'mutable current project client gained review access without a snapshot';
END;
$$;
RESET ROLE;

SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000005');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.get_project_decision_reviews(
      'a4363000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN OTHERS THEN v_denied := true;
  END;
  ASSERT v_denied, 'foreign household read Stage-2 review projection';
END;
$$;
RESET ROLE;

SELECT pg_temp.assume_approval_actor('a4360000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_studio jsonb;
BEGIN
  v_studio := public.get_project_decision_reviews(
    'a4363000-0000-4000-8000-000000000001'
  );
  ASSERT jsonb_array_length(v_studio) > jsonb_array_length((
    SELECT payload FROM approval_lifecycle_results
    WHERE label = 'old-lead-projection'
  )), 'studio co-member did not receive the full sanitized project list';
END;
$$;
RESET ROLE;

ROLLBACK;
