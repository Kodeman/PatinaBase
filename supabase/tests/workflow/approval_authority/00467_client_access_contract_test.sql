-- Fixture-backed Stage-2 client access and authority-drift contract (00467).
\set ON_ERROR_STOP on

BEGIN;

DO $preflight$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(label ORDER BY label)
  INTO v_missing
  FROM (VALUES
    ('exact Stage-2 detail',
      to_regprocedure('public.get_project_decision_review(uuid)') IS NOT NULL),
    ('current-user Stage-2 list',
      to_regprocedure('public.list_my_project_decision_reviews()') IS NOT NULL),
    ('private exact review resolver',
      to_regprocedure(
        'app_private.project_decision_review_for_actor(uuid,uuid)'
      ) IS NOT NULL),
    ('private comment authority predicate',
      to_regprocedure(
        'app_private.is_decision_comment_client(uuid)'
      ) IS NOT NULL)
  ) AS required(label, present)
  WHERE NOT present;

  IF COALESCE(cardinality(v_missing), 0) > 0 THEN
    RAISE EXCEPTION '00467 client access repair is not installed: %',
      array_to_string(v_missing, ', ')
      USING ERRCODE = '55000';
  END IF;
END
$preflight$;

DO $structure$
DECLARE
  v_detail text := pg_get_functiondef(
    'public.get_project_decision_review(uuid)'::regprocedure
  );
  v_list text := pg_get_functiondef(
    'public.list_my_project_decision_reviews()'::regprocedure
  );
  v_private text := pg_get_functiondef(
    'app_private.project_decision_review_for_actor(uuid,uuid)'::regprocedure
  );
  v_comment_helper text := pg_get_functiondef(
    'app_private.is_decision_comment_client(uuid)'::regprocedure
  );
  v_client_raw_qual text;
  v_coordination_qual text;
  v_comment_select_qual text;
  v_comment_insert_check text;
BEGIN
  SELECT qual INTO v_client_raw_qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'client_decisions'
    AND policyname = 'Clients can view their decisions';
  SELECT qual INTO v_coordination_qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'client_decisions'
    AND policyname = 'coordination_party_decisions_select';
  SELECT qual INTO v_comment_select_qual
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'decision_comments'
    AND policyname = 'decision_comments_participant_select';
  SELECT with_check INTO v_comment_insert_check
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'decision_comments'
    AND policyname = 'decision_comments_insert';

  ASSERT v_detail LIKE '%app_private.project_decision_review_for_actor%'
     AND v_detail LIKE '%auth.uid()%'
     AND v_detail LIKE '%RETURN NULL%',
    'exact detail must be actor-bound and existence-safe';
  ASSERT v_list LIKE '%get_project_decision_reviews%'
     AND v_list LIKE '%project_decision_authority_snapshots%'
     AND v_list LIKE '%is_design_studio_comember%'
     AND v_list LIKE '%''[]''::jsonb%',
    'current-user list must reuse the sanitized projection and return []';
  ASSERT v_private LIKE '%get_project_decision_reviews%'
     AND v_private LIKE '%approval_contract = ''project_artifact_v1''%'
     AND v_private LIKE '%decision_lead_id = p_actor%'
     AND v_private LIKE '%p_actor IS DISTINCT FROM auth.uid()%'
     AND v_private LIKE '%search_path TO ''public'', ''pg_temp''%',
    'private detail resolver is not frozen-authority/source coherent';
  ASSERT v_client_raw_qual LIKE
       '%approval_contract IS DISTINCT FROM ''project_artifact_v1''%',
    'raw client parent policy still admits Stage-2 rows';
  ASSERT v_coordination_qual LIKE
       '%approval_contract IS DISTINCT FROM ''project_artifact_v1''%',
    'coordination-party raw policy still admits Stage-2 rows';
  ASSERT v_comment_helper LIKE '%project_decision_authority_snapshots%'
     AND v_comment_helper LIKE '%decision_lead_id = auth.uid()%'
     AND v_comment_helper LIKE '%is_design_studio_comember%'
     AND v_comment_helper LIKE '%designer_clients%'
     AND v_comment_helper LIKE '%approval_contract%'
     AND v_comment_helper LIKE
       '%IS DISTINCT FROM ''project_artifact_v1''%'
     AND v_comment_helper LIKE '%search_path TO ''public'', ''pg_temp''%',
    'comment helper does not preserve frozen Stage-2 and legacy authority';
  ASSERT v_comment_select_qual LIKE '%is_decision_comment_client%'
     AND v_comment_select_qual NOT LIKE '%get_project_decision_review%'
     AND v_comment_insert_check LIKE '%author_id = auth.uid()%'
     AND v_comment_insert_check LIKE '%is_decision_comment_client%'
     AND v_comment_insert_check NOT LIKE '%get_project_decision_review%',
    'comment policies do not use only the narrow authority predicate';

  ASSERT has_function_privilege(
    'authenticated', 'public.get_project_decision_review(uuid)', 'EXECUTE'
  ) AND has_function_privilege(
    'authenticated', 'public.list_my_project_decision_reviews()', 'EXECUTE'
  ), 'authenticated actors cannot call sanitized Stage-2 projections';
  ASSERT NOT has_function_privilege(
    'anon', 'public.get_project_decision_review(uuid)', 'EXECUTE'
  ) AND NOT has_function_privilege(
    'service_role', 'public.get_project_decision_review(uuid)', 'EXECUTE'
  ) AND NOT has_function_privilege(
    'anon', 'public.list_my_project_decision_reviews()', 'EXECUTE'
  ) AND NOT has_function_privilege(
    'service_role', 'public.list_my_project_decision_reviews()', 'EXECUTE'
  ), 'sanitized client projections leaked to anon/service roles';
  ASSERT NOT has_function_privilege(
    'authenticated',
    'app_private.project_decision_review_for_actor(uuid,uuid)', 'EXECUTE'
  ) AND NOT has_function_privilege(
    'service_role',
    'app_private.project_decision_review_for_actor(uuid,uuid)', 'EXECUTE'
  ) AND NOT has_function_privilege(
    'anon',
    'app_private.project_decision_review_for_actor(uuid,uuid)', 'EXECUTE'
  ), 'private review resolver is publicly executable';
  ASSERT has_schema_privilege(
    'authenticated', 'app_private', 'USAGE'
  ) AND has_function_privilege(
    'authenticated',
    'app_private.is_decision_comment_client(uuid)', 'EXECUTE'
  ) AND NOT has_function_privilege(
    'anon', 'app_private.is_decision_comment_client(uuid)', 'EXECUTE'
  ) AND NOT has_function_privilege(
    'service_role',
    'app_private.is_decision_comment_client(uuid)', 'EXECUTE'
  ), 'comment policy predicate ACL is broader than its authenticated RLS use';

  ASSERT (
    SELECT proargnames = ARRAY['p_decision_id']
    FROM pg_proc
    WHERE oid = 'public.get_project_decision_review(uuid)'::regprocedure
  ), 'exact-detail JSON argument name changed';
  ASSERT (
    SELECT COALESCE(cardinality(proargnames), 0) = 0
    FROM pg_proc
    WHERE oid = 'public.list_my_project_decision_reviews()'::regprocedure
  ), 'current-user list unexpectedly accepts JSON arguments';
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

CREATE TEMP TABLE approval_439_results (
  label text PRIMARY KEY,
  payload jsonb NOT NULL
) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE ON approval_439_results TO authenticated;
GRANT SELECT ON approval_439_results TO anon;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('a4390000-0000-4000-8000-000000000001', 'access-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4390000-0000-4000-8000-000000000002', 'access-frozen@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4390000-0000-4000-8000-000000000003', 'access-mutable@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4390000-0000-4000-8000-000000000004', 'access-peer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4390000-0000-4000-8000-000000000005', 'access-foreign@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer)
VALUES
  ('a4390000-0000-4000-8000-000000000001', 'access-designer@test.invalid', 'Access Designer', true),
  ('a4390000-0000-4000-8000-000000000002', 'access-frozen@test.invalid', 'Frozen Approval Lead', false),
  ('a4390000-0000-4000-8000-000000000003', 'access-mutable@test.invalid', 'Mutable Project Client', false),
  ('a4390000-0000-4000-8000-000000000004', 'access-peer@test.invalid', 'Access Studio Peer', true),
  ('a4390000-0000-4000-8000-000000000005', 'access-foreign@test.invalid', 'Unrelated Actor', false)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES (
  'a4391000-0000-4000-8000-000000000001', 'design_studio',
  'Stage2 Access Studio', 'stage2-access-studio', 'active'
);

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
) VALUES
  ('a4391100-0000-4000-8000-000000000001',
   'a4390000-0000-4000-8000-000000000001',
   'a4391000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('a4391100-0000-4000-8000-000000000002',
   'a4390000-0000-4000-8000-000000000004',
   'a4391000-0000-4000-8000-000000000001', 'member', 'active', now());

-- 00511 requires every project lead to hold a designer-domain role; this
-- fixture predates that invariant. Grant it to the studio members it creates.
INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT DISTINCT membership.user_id, role.id, membership.user_id
FROM public.organization_members AS membership
JOIN public.organizations AS studio
  ON studio.id = membership.organization_id
 AND studio.type = 'design_studio'
CROSS JOIN public.roles AS role
WHERE membership.organization_id IN (
    'a4391000-0000-4000-8000-000000000001'
  )
  AND membership.status = 'active'
  -- Only studio leads. Several of these fixtures deliberately model a plain
  -- member who must NOT be an eligible lead, and handing that member a
  -- designer role would silently defeat their own denial probes.
  AND membership.role IN ('owner', 'admin')
  AND role.name = 'studio_owner';

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
) VALUES
  ('a4392000-0000-4000-8000-000000000001',
   'a4390000-0000-4000-8000-000000000001',
   'a4390000-0000-4000-8000-000000000002',
   'Frozen Approval Lead', 'active', 'direct'),
  ('a4392000-0000-4000-8000-000000000002',
   'a4390000-0000-4000-8000-000000000001',
   'a4390000-0000-4000-8000-000000000003',
   'Mutable Project Client', 'active', 'direct');

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, studio_id, status
) VALUES (
  'a4393000-0000-4000-8000-000000000001', 'Stage2 Access Project',
  'a4390000-0000-4000-8000-000000000001',
  'a4390000-0000-4000-8000-000000000002',
  'a4390000-0000-4000-8000-000000000001',
  'a4391000-0000-4000-8000-000000000001', 'active'
);

INSERT INTO public.project_phases (
  id, project_id, name, phase_key, status, sort_order
) VALUES (
  'a4393100-0000-4000-8000-000000000001',
  'a4393000-0000-4000-8000-000000000001',
  'Access design phase', 'design', 'in_progress', 0
);

INSERT INTO public.plan_issues (
  id, project_id, issue_number, name, idempotency_key, request_hash,
  set_checksum, sheet_count, created_by
) VALUES (
  'a4394000-0000-4000-8000-000000000001',
  'a4393000-0000-4000-8000-000000000001', 1,
  'Client issued access set', 'stage2-access-plan', repeat('1', 64),
  repeat('a', 64), 7, 'a4390000-0000-4000-8000-000000000001'
);

SELECT pg_temp.assume_approval_actor(
  'a4390000-0000-4000-8000-000000000001'
);
SET LOCAL ROLE authenticated;
INSERT INTO approval_439_results(label, payload)
SELECT 'authority', public.set_project_decision_authority(
  'a4393000-0000-4000-8000-000000000001',
  'a4390000-0000-4000-8000-000000000002', NULL, 0
);
INSERT INTO approval_439_results(label, payload)
SELECT 'stage2', public.create_project_approval_decision(
  'a4393000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'title', 'Draft issued-set approval',
    'question', 'Approve the client issued access set?',
    'context', 'Client-safe exact-detail context.',
    'dueAt', (now() + interval '5 days')::text,
    'phaseId', 'a4393100-0000-4000-8000-000000000001',
    'sectionKey', 'project',
    'artifactKind', 'plan_issue',
    'artifactId', 'a4394000-0000-4000-8000-000000000001',
    'costCentsDelta', 0,
    'scheduleDaysDelta', 0,
    'leadTimeDaysDelta', 0
  ),
  'stage2-access-create'
);
RESET ROLE;

INSERT INTO public.decision_comments (id, decision_id, author_id, body)
SELECT 'a4397000-0000-4000-8000-000000000001',
       (payload->>'decisionId')::uuid,
       'a4390000-0000-4000-8000-000000000001',
       'Frozen-authority Stage2 discussion.'
FROM approval_439_results WHERE label = 'stage2';

-- Reassign the mutable project client through the installed checked RPC. The
-- Stage-2 parent remains immutable and its authority snapshot keeps naming the
-- original frozen lead.
SELECT pg_temp.assume_approval_actor(
  'a4390000-0000-4000-8000-000000000001'
);
SET LOCAL ROLE authenticated;
SELECT public.set_document_client(
  'project',
  'a4393000-0000-4000-8000-000000000001',
  'a4390000-0000-4000-8000-000000000003'
);
RESET ROLE;

-- One legacy pending decision created after the checked reassignment proves
-- every installed mutable-relationship branch remains intact while Stage-2
-- authority stays frozen.
INSERT INTO public.client_decisions (
  id, designer_client_id, project_id, title, context, due_date, status,
  designer_id, sent_at, decision_type, decision_kind, coordination_kind,
  court, blocks_kind, blocking_status
) VALUES (
  'a4395000-0000-4000-8000-000000000001',
  'a4392000-0000-4000-8000-000000000002',
  'a4393000-0000-4000-8000-000000000001', 'Legacy finish choice',
  'Legacy client-safe context.', now() + interval '4 days', 'pending',
  'a4390000-0000-4000-8000-000000000001', now(), 'product', 'choice',
  'selection', 'client', 'none', 'non_blocking'
);

INSERT INTO public.decision_comments (id, decision_id, author_id, body)
VALUES (
  'a4397000-0000-4000-8000-000000000002',
  'a4395000-0000-4000-8000-000000000001',
  'a4390000-0000-4000-8000-000000000001',
  'Legacy relationship discussion.'
);

-- The mutable client is also a logged-in coordination party. This specifically
-- proves the additive party policy cannot bypass the Stage-2 raw denial.
INSERT INTO public.project_parties (
  id, project_id, party_kind, display_name, profile_id, created_by
) VALUES (
  'a4396000-0000-4000-8000-000000000001',
  'a4393000-0000-4000-8000-000000000001', 'client_rep',
  'Mutable Project Client', 'a4390000-0000-4000-8000-000000000003',
  'a4390000-0000-4000-8000-000000000001'
);

CREATE TEMP TABLE approval_439_state_before AS
SELECT decision.id, decision.updated_at
FROM public.client_decisions AS decision
WHERE decision.id = (
  SELECT (payload->>'decisionId')::uuid
  FROM approval_439_results WHERE label = 'stage2'
);

-- The frozen lead reaches the draft parent only through sanitized projections.
-- The installed option-ID response rail exposes its three client-safe canonical
-- outcomes to the exact frozen lead, while discussion follows the snapshot.
SELECT pg_temp.assume_approval_actor(
  'a4390000-0000-4000-8000-000000000002'
);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_id uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_439_results WHERE label = 'stage2'
  );
  v_detail jsonb := public.get_project_decision_review(v_id);
  v_list jsonb := public.list_my_project_decision_reviews();
  v_text text;
BEGIN
  ASSERT v_detail IS NOT NULL
     AND v_detail->>'decisionId' = v_id::text
     AND v_detail->>'lifecycleStatus' = 'draft'
     AND (v_detail->>'authorityRevision')::integer = 1,
    'frozen lead could not reach canonical draft detail';
  ASSERT jsonb_array_length(v_list) = 1
     AND v_list->0 = v_detail,
    'frozen lead current-user list did not match exact detail';
  ASSERT (SELECT count(*) = 0 FROM public.client_decisions WHERE id = v_id),
    'frozen lead received raw Stage-2 parent data';
  ASSERT (
    SELECT count(*) = 3
    FROM public.client_decision_options
    WHERE decision_id = v_id
      AND approval_outcome IN (
        'approved', 'changes_requested', 'needs_discussion'
      )
      AND designer_note IS NULL
  ), 'frozen lead lost the client-safe Stage-2 option-ID rail';
  ASSERT public.is_addressed_client_decision(v_id) = false,
    'raw addressed-client helper still admits Stage-2';
  ASSERT (SELECT count(*) = 1 FROM public.decision_comments WHERE decision_id = v_id),
    'frozen lead lost Stage-2 discussion access';

  v_text := v_detail::text;
  ASSERT v_text NOT ILIKE '%reviewer%'
     AND v_text NOT ILIKE '%decisionLead%'
     AND v_text NOT ILIKE '%requiredCoapprover%'
     AND v_text NOT ILIKE '%assignedBy%'
     AND v_text NOT ILIKE '%designerClient%'
     AND v_text NOT ILIKE '%sourceSnapshot%'
     AND v_text NOT ILIKE '%clientEmail%'
     AND v_text NOT LIKE '%a4390000-0000-4000-8000-000000000002%',
    'sanitized detail leaked reviewer/private authority data';

  PERFORM public.get_project_decision_review(v_id);
  PERFORM public.list_my_project_decision_reviews();
END;
$$;

INSERT INTO public.decision_comments (decision_id, author_id, body)
SELECT (payload->>'decisionId')::uuid,
       'a4390000-0000-4000-8000-000000000002',
       'Frozen lead may still ask a question.'
FROM approval_439_results WHERE label = 'stage2';
RESET ROLE;

DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1
    FROM approval_439_state_before AS before
    JOIN public.client_decisions AS decision USING (id)
    WHERE decision.updated_at IS NOT DISTINCT FROM before.updated_at
  ), 'read-only projections mutated Stage-2 state';
END;
$$;

-- The new mutable project client cannot inherit frozen Stage-2 authority, even
-- through its project-party row. Legacy relationship access remains intact.
SELECT pg_temp.assume_approval_actor(
  'a4390000-0000-4000-8000-000000000003'
);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_id uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_439_results WHERE label = 'stage2'
  );
  v_stage2_insert_denied boolean := false;
BEGIN
  ASSERT public.list_my_project_decision_reviews() = '[]'::jsonb,
    'mutable relationship client inherited the frozen-lead list';
  ASSERT public.get_project_decision_review(v_id) IS NULL
     AND public.get_project_decision_review(
       'a4399999-0000-4000-8000-000000000001'
     ) IS NULL,
    'exact detail leaked decision existence to an unauthorized client';
  ASSERT (SELECT count(*) = 0 FROM public.client_decisions WHERE id = v_id),
    'mutable client/coordination party read raw Stage-2 parent data';
  ASSERT (SELECT count(*) = 0 FROM public.decision_comments WHERE decision_id = v_id),
    'mutable client read frozen Stage-2 discussion';
  BEGIN
    INSERT INTO public.decision_comments (decision_id, author_id, body)
    VALUES (
      v_id, 'a4390000-0000-4000-8000-000000000003',
      'This mutable client must not enter the Stage2 thread.'
    );
  EXCEPTION WHEN OTHERS THEN
    v_stage2_insert_denied := true;
  END;
  ASSERT v_stage2_insert_denied,
    'mutable relationship client posted to frozen Stage-2 discussion';

  ASSERT (
    SELECT count(*) = 1
    FROM public.client_decisions
    WHERE id = 'a4395000-0000-4000-8000-000000000001'
  ), 'legacy addressed-client raw SELECT regressed';
  ASSERT (
    SELECT count(*) = 1
    FROM public.decision_comments
    WHERE decision_id = 'a4395000-0000-4000-8000-000000000001'
  ), 'legacy relationship comment SELECT regressed';
  ASSERT public.get_project_decision_review(
    'a4395000-0000-4000-8000-000000000001'
  ) IS NULL, 'Stage-2 detail serialized a legacy decision';
END;
$$;
INSERT INTO public.decision_comments (decision_id, author_id, body)
VALUES (
  'a4395000-0000-4000-8000-000000000001',
  'a4390000-0000-4000-8000-000000000003',
  'Legacy relationship comment remains valid.'
);
RESET ROLE;

-- A design-studio comember is an authorized project author for sanitized and
-- raw project workspace reads. The exact designer retains discussion writes.
SELECT pg_temp.assume_approval_actor(
  'a4390000-0000-4000-8000-000000000004'
);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_id uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_439_results WHERE label = 'stage2'
  );
BEGIN
  ASSERT public.get_project_decision_review(v_id) IS NOT NULL
     AND jsonb_array_length(public.list_my_project_decision_reviews()) = 1,
    'studio comember lost sanitized Stage-2 access';
  ASSERT (SELECT count(*) = 1 FROM public.client_decisions WHERE id = v_id),
    'studio comember lost raw authored-workspace access';
END;
$$;
RESET ROLE;

SELECT pg_temp.assume_approval_actor(
  'a4390000-0000-4000-8000-000000000001'
);
SET LOCAL ROLE authenticated;
INSERT INTO public.decision_comments (decision_id, author_id, body)
SELECT (payload->>'decisionId')::uuid,
       'a4390000-0000-4000-8000-000000000001',
       'Studio author discussion remains valid.'
FROM approval_439_results WHERE label = 'stage2';
RESET ROLE;

-- An unrelated authenticated actor receives stable empty/null projections and
-- cannot read or write the Stage-2 thread.
SELECT pg_temp.assume_approval_actor(
  'a4390000-0000-4000-8000-000000000005'
);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_id uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_439_results WHERE label = 'stage2'
  );
  v_insert_denied boolean := false;
BEGIN
  ASSERT public.list_my_project_decision_reviews() = '[]'::jsonb
     AND public.get_project_decision_review(v_id) IS NULL,
    'foreign actor learned Stage-2 existence through projections';
  ASSERT (SELECT count(*) = 0 FROM public.client_decisions WHERE id = v_id)
     AND (SELECT count(*) = 0 FROM public.decision_comments WHERE decision_id = v_id),
    'foreign actor read raw Stage-2 data/comments';
  BEGIN
    INSERT INTO public.decision_comments (decision_id, author_id, body)
    VALUES (
      v_id, 'a4390000-0000-4000-8000-000000000005',
      'Foreign comment must fail.'
    );
  EXCEPTION WHEN OTHERS THEN
    v_insert_denied := true;
  END;
  ASSERT v_insert_denied, 'foreign actor posted to Stage-2 discussion';
END;
$$;
RESET ROLE;

-- Grant replay must not expose any raw Stage-2 row to anon, and the sanitized
-- RPCs remain entirely absent from anon/service callable surfaces.
SELECT pg_temp.assume_approval_actor(NULL, 'anon');
SET LOCAL ROLE anon;
DO $$
DECLARE
  v_id uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_439_results WHERE label = 'stage2'
  );
BEGIN
  ASSERT (SELECT count(*) = 0 FROM public.client_decisions WHERE id = v_id)
     AND (SELECT count(*) = 0 FROM public.decision_comments WHERE decision_id = v_id),
    'anon read raw Stage-2 data after grant replay';
END;
$$;
RESET ROLE;

ROLLBACK;
