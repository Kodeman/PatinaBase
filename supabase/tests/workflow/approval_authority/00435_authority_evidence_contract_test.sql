-- Failing-first Stage 2 authority/evidence contract (00435).
-- This file intentionally fails its preflight until 00435 exists. It performs
-- no fixture writes before that boundary and never fabricates household membership.
\set ON_ERROR_STOP on

BEGIN;

DO $preflight$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(label ORDER BY label)
  INTO v_missing
  FROM (VALUES
    ('table public.project_decision_authorities',
      to_regclass('public.project_decision_authorities') IS NOT NULL),
    ('table public.project_decision_authority_snapshots',
      to_regclass('public.project_decision_authority_snapshots') IS NOT NULL),
    ('table public.project_approval_artifacts',
      to_regclass('public.project_approval_artifacts') IS NOT NULL),
    ('table public.project_decision_review_confirmations',
      to_regclass('public.project_decision_review_confirmations') IS NOT NULL),
    ('table public.project_approval_action_receipts',
      to_regclass('public.project_approval_action_receipts') IS NOT NULL),
    ('function set_project_decision_authority(uuid,uuid,uuid,integer)',
      to_regprocedure('public.set_project_decision_authority(uuid,uuid,uuid,integer)') IS NOT NULL),
    ('function create_project_approval_decision(uuid,jsonb,text)',
      to_regprocedure('public.create_project_approval_decision(uuid,jsonb,text)') IS NOT NULL),
    ('private checked creation core',
      to_regprocedure('public._create_project_approval_decision_checked(uuid,jsonb,text,uuid)') IS NOT NULL),
    ('function confirm_project_decision_review(uuid,jsonb,text)',
      to_regprocedure('public.confirm_project_decision_review(uuid,jsonb,text)') IS NOT NULL),
    ('column client_decisions.approval_contract', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'client_decisions'
        AND column_name = 'approval_contract'
    )),
    ('column client_decisions.predecessor_decision_id', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'client_decisions'
        AND column_name = 'predecessor_decision_id'
    )),
    ('column client_decision_options.approval_outcome', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'client_decision_options'
        AND column_name = 'approval_outcome'
    )),
    ('column client_decision_options.schedule_days_delta', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'client_decision_options'
        AND column_name = 'schedule_days_delta'
    )),
    ('column client_decision_options.cost_cents_delta', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'client_decision_options'
        AND column_name = 'cost_cents_delta'
    )),
    ('column client_decision_options.lead_time_days_delta', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'client_decision_options'
        AND column_name = 'lead_time_days_delta'
    ))
  ) AS required(label, present)
  WHERE NOT present;

  IF COALESCE(cardinality(v_missing), 0) > 0 THEN
    RAISE EXCEPTION '00435 approval-authority contract is not installed: %',
      array_to_string(v_missing, ', ')
      USING ERRCODE = '55000',
            HINT = 'Apply 00434 and 00435, then rerun this contract test.';
  END IF;
END
$preflight$;

-- Structural authority, privacy, and compatibility assertions. Catalog-only
-- checks keep future objects out of parse-time relation binding.
DO $structure$
DECLARE
  v_table text;
  v_definition text;
  v_create text;
  v_confirm text;
  v_evidence_guard text;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'project_decision_authorities',
    'project_decision_authority_snapshots',
    'project_approval_artifacts',
    'project_decision_review_confirmations',
    'project_approval_action_receipts'
  ] LOOP
    ASSERT EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = v_table
        AND c.relrowsecurity
    ), format('%s must have RLS enabled', v_table);

    ASSERT NOT has_table_privilege('authenticated', 'public.' || v_table, 'INSERT'),
      format('authenticated must not directly insert %s', v_table);
    ASSERT NOT has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE'),
      format('authenticated must not directly update %s', v_table);
    ASSERT NOT has_table_privilege('authenticated', 'public.' || v_table, 'DELETE'),
      format('authenticated must not directly delete %s', v_table);
    ASSERT NOT has_table_privilege('service_role', 'public.' || v_table, 'UPDATE'),
      format('service_role must not rewrite %s evidence', v_table);
    ASSERT NOT has_table_privilege('service_role', 'public.' || v_table, 'DELETE'),
      format('service_role must not delete %s evidence', v_table);
  END LOOP;

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_decisions'
      AND column_name = 'approval_contract' AND is_nullable = 'YES'
  ), 'approval_contract must remain nullable for legacy and proposal decisions';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_decision_options'
      AND column_name IN (
        'approval_outcome', 'cost_cents_delta', 'schedule_days_delta',
        'lead_time_days_delta'
      )
      AND is_nullable = 'YES'
    GROUP BY table_name
    HAVING count(*) = 4
  ), 'Stage 2 option fields must be nullable for installed-client compatibility';

  SELECT string_agg(pg_get_constraintdef(c.oid), E'\n')
  INTO v_definition
  FROM pg_constraint c
  WHERE c.conrelid IN (
    'public.client_decisions'::regclass,
    'public.client_decision_options'::regclass,
    'public.project_decision_authorities'::regclass,
    'public.project_decision_review_confirmations'::regclass
  );

  ASSERT v_definition LIKE '%project_artifact_v1%',
    'Stage 2 classifier must be constrained';
  ASSERT v_definition LIKE '%approved%'
     AND v_definition LIKE '%changes_requested%'
     AND v_definition LIKE '%needs_discussion%',
    'exactly three canonical public outcomes must be constrained';
  ASSERT v_definition LIKE '%cost_cents_delta%'
     AND v_definition LIKE '%schedule_days_delta%'
     AND v_definition LIKE '%lead_time_days_delta%',
    'all three explicit Stage 2 impact deltas must be constrained';

  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_decision_authorities'
      AND column_name = 'decision_lead_id' AND is_nullable = 'NO'
  ), 'authority must name one explicit decision lead';
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_decision_authorities'
      AND column_name = 'required_coapprover_id' AND is_nullable = 'YES'
  ), 'authority must preserve a nullable required co-approver';

  ASSERT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_approval_artifacts'
      AND column_name IN (
        'source_kind', 'source_id', 'source_version', 'artifact_hash',
        'artifact_title', 'question', 'due_at', 'phase_id',
        'cost_cents_delta', 'schedule_days_delta',
        'lead_time_days_delta', 'source_snapshot'
      )
    GROUP BY table_name
    HAVING count(*) = 12
  ), 'artifact evidence must be projection-ready without joining mutable sources';
  ASSERT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_approval_artifacts'
      AND column_name = 'phase_id' AND is_nullable = 'NO'
  ), 'every Stage-2 artifact must be bound to one exact project phase';

  ASSERT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'project_approval_action_receipts'
      AND column_name IN (
        'project_id', 'decision_id', 'action_kind', 'idempotency_key',
        'request_hash', 'actor_id', 'result', 'successor_decision_id',
        'created_at'
      )
    GROUP BY table_name
    HAVING count(*) = 9
  ), 'receipts must carry the complete 00435/00436 idempotency shape';

  ASSERT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.project_approval_action_receipts'::regclass
      AND pg_get_constraintdef(c.oid) LIKE
        '%UNIQUE (project_id, action_kind, idempotency_key)%'
  ), 'creation retries must be scoped by project/action/key';
  ASSERT EXISTS (
    SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.project_approval_action_receipts'::regclass
      AND pg_get_constraintdef(c.oid) LIKE
        '%UNIQUE (decision_id, action_kind, idempotency_key)%'
  ), 'decision actions must be scoped by decision/action/key';
  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'project_approval_action_receipts'
      AND indexdef LIKE '%UNIQUE%successor_decision_id%WHERE%'
  ), 'one successor may be evidenced by at most one action receipt';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    WHERE c.conrelid IN (
      'public.project_decision_authority_snapshots'::regclass,
      'public.project_approval_artifacts'::regclass,
      'public.project_decision_review_confirmations'::regclass,
      'public.project_approval_action_receipts'::regclass
    )
      AND c.contype = 'f'
      AND c.confdeltype <> 'r'
  ), 'approval evidence foreign keys must use ON DELETE RESTRICT';

  SELECT pg_get_functiondef(
    'public._create_project_approval_decision_checked(uuid,jsonb,text,uuid)'::regprocedure
  ) INTO v_create;
  SELECT pg_get_functiondef(
    'public.confirm_project_decision_review(uuid,jsonb,text)'::regprocedure
  ) INTO v_confirm;
  SELECT pg_get_functiondef(
    'public.guard_project_approval_evidence_edge()'::regprocedure
  ) INTO v_evidence_guard;
  ASSERT v_create LIKE '%project_decision_authority_snapshots%'
     AND v_create LIKE '%project_approval_artifacts%'
     AND v_create LIKE '%project_approval_action_receipts%'
     AND v_create LIKE '%p_predecessor_decision_id%'
     AND v_create LIKE '%cost_cents_delta%'
     AND v_create LIKE '%schedule_days_delta%'
     AND v_create LIKE '%lead_time_days_delta%',
    'creation must own the complete atomic evidence set and explicit deltas';
  ASSERT strpos(v_create, 'receipt.action_kind = ''created''') > 0
     AND strpos(v_create, 'v_due_at <= now()') >
         strpos(v_create, 'receipt.action_kind = ''created'''),
    'exact create receipt replay must precede the future-due check';
  ASSERT v_confirm LIKE '%project_decision_review_confirmations%'
     AND v_confirm LIKE '%project_approval_artifacts%'
     AND v_confirm LIKE '%project_approval_action_receipts%',
    'review confirmation must bind immutable artifact evidence and a receipt';
  ASSERT NOT (
    SELECT prosecdef FROM pg_proc
    WHERE oid = 'public.guard_project_approval_evidence_edge()'::regprocedure
  ) AND v_evidence_guard LIKE '%current_user%postgres%'
    AND v_evidence_guard LIKE '%app.project_approval_evidence_decision_id%',
    'evidence table edge must be invoker-mode and bind postgres writer + capability';

  ASSERT has_function_privilege(
    'authenticated',
    'public.set_project_decision_authority(uuid,uuid,uuid,integer)', 'EXECUTE'
  ), 'checked authority assignment RPC must be authenticated';
  ASSERT has_function_privilege(
    'authenticated',
    'public.create_project_approval_decision(uuid,jsonb,text)', 'EXECUTE'
  ), 'atomic Stage 2 creation RPC must be authenticated';
  ASSERT NOT has_function_privilege(
    'authenticated',
    'public._create_project_approval_decision_checked(uuid,jsonb,text,uuid)',
    'EXECUTE'
  ) AND NOT has_function_privilege(
    'service_role',
    'public._create_project_approval_decision_checked(uuid,jsonb,text,uuid)',
    'EXECUTE'
  ), 'predecessor-aware creation core must remain private';
  ASSERT has_function_privilege(
    'authenticated',
    'public.confirm_project_decision_review(uuid,jsonb,text)', 'EXECUTE'
  ), 'checked review-confirm RPC must be authenticated';
  ASSERT (
    SELECT proargnames = ARRAY[
      'p_project_id', 'p_decision_lead_id',
      'p_required_coapprover_id', 'p_expected_revision'
    ]
    FROM pg_proc
    WHERE oid = 'public.set_project_decision_authority(uuid,uuid,uuid,integer)'::regprocedure
  ), 'authority RPC JSON argument names are part of the public API';
  ASSERT (
    SELECT proargnames = ARRAY[
      'p_project_id', 'p_payload', 'p_idempotency_key'
    ]
    FROM pg_proc
    WHERE oid = 'public.create_project_approval_decision(uuid,jsonb,text)'::regprocedure
  ), 'create RPC JSON argument names are part of the public API';
  ASSERT (
    SELECT proargnames = ARRAY[
      'p_decision_id', 'p_payload', 'p_idempotency_key'
    ]
    FROM pg_proc
    WHERE oid = 'public.confirm_project_decision_review(uuid,jsonb,text)'::regprocedure
  ), 'confirmation RPC JSON argument names are part of the public API';
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

CREATE TEMP TABLE approval_rpc_results (
  label text PRIMARY KEY,
  payload jsonb NOT NULL
) ON COMMIT DROP;
GRANT SELECT, INSERT ON approval_rpc_results TO authenticated, service_role;

-- Deterministic identities: Studio A lead + peer + exact project client, a
-- foreign studio/client pair, and an unrelated authenticated household actor.
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('a4350000-0000-4000-8000-000000000001', 'approval-designer-a@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4350000-0000-4000-8000-000000000002', 'approval-client-a@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4350000-0000-4000-8000-000000000003', 'approval-peer-a@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4350000-0000-4000-8000-000000000004', 'approval-designer-b@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4350000-0000-4000-8000-000000000005', 'approval-client-b@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4350000-0000-4000-8000-000000000006', 'approval-unrelated@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer)
VALUES
  ('a4350000-0000-4000-8000-000000000001', 'approval-designer-a@test.invalid', 'Approval Designer A', true),
  ('a4350000-0000-4000-8000-000000000002', 'approval-client-a@test.invalid', 'Approval Client A', false),
  ('a4350000-0000-4000-8000-000000000003', 'approval-peer-a@test.invalid', 'Approval Peer A', true),
  ('a4350000-0000-4000-8000-000000000004', 'approval-designer-b@test.invalid', 'Approval Designer B', true),
  ('a4350000-0000-4000-8000-000000000005', 'approval-client-b@test.invalid', 'Approval Client B', false),
  ('a4350000-0000-4000-8000-000000000006', 'approval-unrelated@test.invalid', 'Approval Unrelated', false)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('a4351000-0000-4000-8000-000000000001', 'design_studio', 'Approval Studio A', 'approval-stage2-a', 'active'),
  ('a4351000-0000-4000-8000-000000000002', 'design_studio', 'Approval Studio B', 'approval-stage2-b', 'active');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
) VALUES
  ('a4351100-0000-4000-8000-000000000001', 'a4350000-0000-4000-8000-000000000001',
   'a4351000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('a4351100-0000-4000-8000-000000000002', 'a4350000-0000-4000-8000-000000000003',
   'a4351000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('a4351100-0000-4000-8000-000000000003', 'a4350000-0000-4000-8000-000000000004',
   'a4351000-0000-4000-8000-000000000002', 'owner', 'active', now());

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
) VALUES
  ('a4352000-0000-4000-8000-000000000001',
   'a4350000-0000-4000-8000-000000000001',
   'a4350000-0000-4000-8000-000000000002', 'Approval Client A', 'active', 'direct'),
  ('a4352000-0000-4000-8000-000000000002',
   'a4350000-0000-4000-8000-000000000004',
   'a4350000-0000-4000-8000-000000000005', 'Approval Client B', 'active', 'direct');

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, studio_id
) VALUES
  ('a4353000-0000-4000-8000-000000000001', 'Approval Project A',
   'a4350000-0000-4000-8000-000000000001',
   'a4350000-0000-4000-8000-000000000002',
   'a4350000-0000-4000-8000-000000000001',
   'a4351000-0000-4000-8000-000000000001'),
  ('a4353000-0000-4000-8000-000000000002', 'Approval Project B',
   'a4350000-0000-4000-8000-000000000004',
   'a4350000-0000-4000-8000-000000000005',
   'a4350000-0000-4000-8000-000000000004',
   'a4351000-0000-4000-8000-000000000002');

INSERT INTO public.project_phases (
  id, project_id, name, phase_key, status, sort_order
) VALUES
  ('a4353100-0000-4000-8000-000000000001',
   'a4353000-0000-4000-8000-000000000001',
   'Project A design development', 'design-development', 'pending', 0),
  ('a4353100-0000-4000-8000-000000000002',
   'a4353000-0000-4000-8000-000000000002',
   'Project B design development', 'design-development', 'pending', 0);

-- Real immutable source rows. The test creates source ledgers directly as the
-- unassumed owner; the approval RPC must still validate their installed shape.
INSERT INTO public.plan_issues (
  id, project_id, issue_number, name, idempotency_key, request_hash,
  set_checksum, sheet_count, created_by
) VALUES
  ('a4354000-0000-4000-8000-000000000001',
   'a4353000-0000-4000-8000-000000000001', 3, 'Issued construction set',
   'approval-plan-a', repeat('a', 64), repeat('b', 64), 12,
   'a4350000-0000-4000-8000-000000000001'),
  ('a4354000-0000-4000-8000-000000000002',
   'a4353000-0000-4000-8000-000000000002', 1, 'Foreign issued set',
   'approval-plan-b', repeat('c', 64), repeat('d', 64), 4,
   'a4350000-0000-4000-8000-000000000004');

INSERT INTO public.spec_book_templates (
  id, template_key, version, studio_id, name, page_grammar,
  audience_profiles, required_field_rules, visibility_rules, created_by
) VALUES (
  'a4354100-0000-4000-8000-000000000001', 'approval.stage2', 1,
  'a4351000-0000-4000-8000-000000000001', 'Approval spec template',
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  'a4350000-0000-4000-8000-000000000001'
);

INSERT INTO public.spec_books (
  id, project_id, title, template_id, default_audiences, created_by
) VALUES (
  'a4354200-0000-4000-8000-000000000001',
  'a4353000-0000-4000-8000-000000000001', 'Client specification book',
  'a4354100-0000-4000-8000-000000000001', ARRAY['client']::text[],
  'a4350000-0000-4000-8000-000000000001'
);

INSERT INTO public.project_documents (
  id, project_id, title, doc_type, storage_path, status, uploaded_by,
  section_key, client_visible, size_bytes
) VALUES (
  'a4354300-0000-4000-8000-000000000001',
  'a4353000-0000-4000-8000-000000000001', 'Issued client spec PDF',
  'pdf', 'approval/project-a/spec-client.pdf', 'ready',
  'a4350000-0000-4000-8000-000000000001', 'spec-book', true, 4096
);

INSERT INTO public.spec_book_revisions (
  id, spec_book_id, revision_number, idempotency_key, issue_type, status,
  requested_audiences, template_snapshot, render_snapshot,
  snapshot_checksum, created_by, issued_at
) VALUES
  ('a4354400-0000-4000-8000-000000000001',
   'a4354200-0000-4000-8000-000000000001', 2, 'approval-spec-issued',
   'full', 'issued', ARRAY['client']::text[], '{}'::jsonb,
   '{"clientSafe":true}'::jsonb, repeat('e', 64),
   'a4350000-0000-4000-8000-000000000001', now()),
  ('a4354400-0000-4000-8000-000000000002',
   'a4354200-0000-4000-8000-000000000001', 3, 'approval-spec-pending',
   'full', 'pending', ARRAY['client']::text[], '{}'::jsonb,
   '{"clientSafe":true}'::jsonb, repeat('f', 64),
   'a4350000-0000-4000-8000-000000000001', NULL);

INSERT INTO public.spec_book_artifacts (
  id, revision_id, audience, status, project_document_id, storage_path,
  checksum_sha256, size_bytes, rendered_at
) VALUES
  ('a4354500-0000-4000-8000-000000000001',
   'a4354400-0000-4000-8000-000000000001', 'client', 'ready',
   'a4354300-0000-4000-8000-000000000001',
   'approval/project-a/spec-client.pdf', repeat('1', 64), 4096, now()),
  ('a4354500-0000-4000-8000-000000000002',
   'a4354400-0000-4000-8000-000000000002', 'client', 'pending',
   NULL, NULL, NULL, NULL, NULL);

INSERT INTO public.project_budget_versions (
  id, project_id, version, status, note, created_by
) VALUES
  ('a4354600-0000-4000-8000-000000000001',
   'a4353000-0000-4000-8000-000000000001', 4, 'draft',
   'INTERNAL margin and vendor note must never enter client evidence',
   'a4350000-0000-4000-8000-000000000001'),
  ('a4354600-0000-4000-8000-000000000002',
   'a4353000-0000-4000-8000-000000000001', 5, 'draft',
   'Unpublished working budget',
   'a4350000-0000-4000-8000-000000000001');

INSERT INTO public.project_budget_lines (
  id, budget_version_id, room_name, category, low_cents, target_cents,
  high_cents, scheduled_cents, authorized_cents, sort_order
) VALUES (
  'a4354700-0000-4000-8000-000000000001',
  'a4354600-0000-4000-8000-000000000001', 'Living Room',
  'Trade-only custom upholstery', 900000, 1000000, 1200000, 250000, 100000, 0
);

SELECT set_config(
  'app.budget_publish_id', 'a4354600-0000-4000-8000-000000000001', true
);
UPDATE public.project_budget_versions
SET status = 'published', low_total_cents = 900000,
    target_total_cents = 1000000, high_total_cents = 1200000,
    published_at = now()
WHERE id = 'a4354600-0000-4000-8000-000000000001';
SELECT set_config('app.budget_publish_id', '', true);

INSERT INTO public.project_budget_checkpoints (
  id, project_id, budget_version_id, checkpoint_code,
  snapshot_fingerprint, published_by
) VALUES (
  'a4354800-0000-4000-8000-000000000001',
  'a4353000-0000-4000-8000-000000000001',
  'a4354600-0000-4000-8000-000000000001', 'B-004',
  public._budget_version_fingerprint(
    'a4354600-0000-4000-8000-000000000001'
  ),
  'a4350000-0000-4000-8000-000000000001'
);

-- Authority is explicit, optimistic, studio-assigned, and singular today.
SELECT pg_temp.assume_approval_actor('a4350000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
INSERT INTO approval_rpc_results (label, payload)
SELECT 'authority_v1', public.set_project_decision_authority(
  'a4353000-0000-4000-8000-000000000001',
  'a4350000-0000-4000-8000-000000000002', NULL, 0
);
INSERT INTO approval_rpc_results (label, payload)
SELECT 'authority_v2', public.set_project_decision_authority(
  'a4353000-0000-4000-8000-000000000001',
  'a4350000-0000-4000-8000-000000000002', NULL, 1
);

DO $$
DECLARE
  v_stale_denied boolean := false;
  v_coapprover_denied boolean := false;
  v_wrong_lead_denied boolean := false;
  v_foreign_studio_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.set_project_decision_authority(
      'a4353000-0000-4000-8000-000000000001',
      'a4350000-0000-4000-8000-000000000002', NULL, 1
    );
  EXCEPTION WHEN OTHERS THEN v_stale_denied := true;
  END;
  BEGIN
    PERFORM public.set_project_decision_authority(
      'a4353000-0000-4000-8000-000000000001',
      'a4350000-0000-4000-8000-000000000002',
      'a4350000-0000-4000-8000-000000000006', 2
    );
  EXCEPTION WHEN OTHERS THEN v_coapprover_denied := true;
  END;
  BEGIN
    PERFORM public.set_project_decision_authority(
      'a4353000-0000-4000-8000-000000000001',
      'a4350000-0000-4000-8000-000000000006', NULL, 2
    );
  EXCEPTION WHEN OTHERS THEN v_wrong_lead_denied := true;
  END;
  BEGIN
    PERFORM public.set_project_decision_authority(
      'a4353000-0000-4000-8000-000000000002',
      'a4350000-0000-4000-8000-000000000005', NULL, 0
    );
  EXCEPTION WHEN OTHERS THEN v_foreign_studio_denied := true;
  END;
  ASSERT v_stale_denied, 'stale authority revision unexpectedly succeeded';
  ASSERT v_coapprover_denied,
    'non-null coapprover unexpectedly succeeded without household membership';
  ASSERT v_wrong_lead_denied,
    'authority lead other than exact projects.client_id unexpectedly succeeded';
  ASSERT v_foreign_studio_denied,
    'foreign studio assigned project decision authority';
END;
$$;

-- One request-level signed impact triplet is copied identically to all three
-- server-owned outcomes. Per-outcome values are not accepted.
INSERT INTO approval_rpc_results (label, payload)
SELECT 'plan_create', public.create_project_approval_decision(
  'a4353000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'title', 'Construction set approval',
    'question', 'Approve the issued construction set?',
    'context', 'Review the named issued set before construction.',
    'dueAt', (now() + interval '5 days')::text,
    'phaseId', 'a4353100-0000-4000-8000-000000000001',
    'artifactKind', 'plan_issue',
    'artifactId', 'a4354000-0000-4000-8000-000000000001',
    'costCentsDelta', 0,
    'scheduleDaysDelta', -2,
    'leadTimeDaysDelta', 7
  ),
  'create-plan-1'
);

INSERT INTO approval_rpc_results (label, payload)
SELECT 'plan_retry', public.create_project_approval_decision(
  'a4353000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'title', 'Construction set approval',
    'question', 'Approve the issued construction set?',
    'context', 'Review the named issued set before construction.',
    'dueAt', (SELECT decision.due_date::text
              FROM public.client_decisions AS decision
              WHERE decision.id = (
                SELECT (payload->>'decisionId')::uuid
                FROM approval_rpc_results WHERE label = 'plan_create'
              )),
    'phaseId', 'a4353100-0000-4000-8000-000000000001',
    'artifactKind', 'plan_issue',
    'artifactId', 'a4354000-0000-4000-8000-000000000001',
    'costCentsDelta', 0,
    'scheduleDaysDelta', -2,
    'leadTimeDaysDelta', 7
  ),
  'create-plan-1'
);

INSERT INTO approval_rpc_results (label, payload)
SELECT 'spec_create', public.create_project_approval_decision(
  'a4353000-0000-4000-8000-000000000001',
  '{
    "title":"Specification book approval",
    "question":"Approve the issued client specification book?",
    "dueAt":"2099-01-10T12:00:00Z",
    "phaseId":"a4353100-0000-4000-8000-000000000001",
    "artifactKind":"spec_book_artifact",
    "artifactId":"a4354500-0000-4000-8000-000000000001",
    "costCentsDelta":125000,
    "scheduleDaysDelta":0,
    "leadTimeDaysDelta":0
  }'::jsonb,
  'create-spec-1'
);

INSERT INTO approval_rpc_results (label, payload)
SELECT 'budget_create', public.create_project_approval_decision(
  'a4353000-0000-4000-8000-000000000001',
  '{
    "title":"Budget checkpoint approval",
    "question":"Approve published budget checkpoint B-004?",
    "dueAt":"2099-01-11T12:00:00Z",
    "phaseId":"a4353100-0000-4000-8000-000000000001",
    "artifactKind":"budget_version",
    "artifactId":"a4354600-0000-4000-8000-000000000001",
    "costCentsDelta":-50000,
    "scheduleDaysDelta":3,
    "leadTimeDaysDelta":0
  }'::jsonb,
  'create-budget-1'
);

DO $$
DECLARE
  v_before integer;
  v_after integer;
  v_conflict_denied boolean := false;
  v_foreign_denied boolean := false;
  v_unready_denied boolean := false;
  v_draft_budget_denied boolean := false;
  v_missing_delta_denied boolean := false;
  v_missing_question_denied boolean := false;
  v_missing_due_denied boolean := false;
  v_missing_phase_denied boolean := false;
  v_foreign_phase_denied boolean := false;
  v_per_outcome_denied boolean := false;
BEGIN
  SELECT count(*) INTO v_before
  FROM public.client_decisions
  WHERE approval_contract = 'project_artifact_v1';

  BEGIN
    PERFORM public.create_project_approval_decision(
      'a4353000-0000-4000-8000-000000000001',
      '{"title":"conflict","question":"conflict?","dueAt":"2099-01-01T00:00:00Z","phaseId":"a4353100-0000-4000-8000-000000000001","artifactKind":"plan_issue","artifactId":"a4354000-0000-4000-8000-000000000001","costCentsDelta":1,"scheduleDaysDelta":-2,"leadTimeDaysDelta":7}'::jsonb,
      'create-plan-1'
    );
  EXCEPTION WHEN OTHERS THEN v_conflict_denied := true;
  END;
  BEGIN
    PERFORM public.create_project_approval_decision(
      'a4353000-0000-4000-8000-000000000001',
      '{"title":"foreign source","question":"Approve?","dueAt":"2099-01-01T00:00:00Z","phaseId":"a4353100-0000-4000-8000-000000000001","artifactKind":"plan_issue","artifactId":"a4354000-0000-4000-8000-000000000002","costCentsDelta":0,"scheduleDaysDelta":0,"leadTimeDaysDelta":0}'::jsonb,
      'invalid-foreign'
    );
  EXCEPTION WHEN OTHERS THEN v_foreign_denied := true;
  END;
  BEGIN
    PERFORM public.create_project_approval_decision(
      'a4353000-0000-4000-8000-000000000001',
      '{"title":"unready spec","question":"Approve?","dueAt":"2099-01-01T00:00:00Z","phaseId":"a4353100-0000-4000-8000-000000000001","artifactKind":"spec_book_artifact","artifactId":"a4354500-0000-4000-8000-000000000002","costCentsDelta":0,"scheduleDaysDelta":0,"leadTimeDaysDelta":0}'::jsonb,
      'invalid-unready'
    );
  EXCEPTION WHEN OTHERS THEN v_unready_denied := true;
  END;
  BEGIN
    PERFORM public.create_project_approval_decision(
      'a4353000-0000-4000-8000-000000000001',
      '{"title":"draft budget","question":"Approve?","dueAt":"2099-01-01T00:00:00Z","phaseId":"a4353100-0000-4000-8000-000000000001","artifactKind":"budget_version","artifactId":"a4354600-0000-4000-8000-000000000002","costCentsDelta":0,"scheduleDaysDelta":0,"leadTimeDaysDelta":0}'::jsonb,
      'invalid-draft-budget'
    );
  EXCEPTION WHEN OTHERS THEN v_draft_budget_denied := true;
  END;
  BEGIN
    PERFORM public.create_project_approval_decision(
      'a4353000-0000-4000-8000-000000000001',
      '{"title":"missing zero","question":"Approve?","dueAt":"2099-01-01T00:00:00Z","phaseId":"a4353100-0000-4000-8000-000000000001","artifactKind":"plan_issue","artifactId":"a4354000-0000-4000-8000-000000000001","costCentsDelta":0,"scheduleDaysDelta":0}'::jsonb,
      'invalid-missing-delta'
    );
  EXCEPTION WHEN OTHERS THEN v_missing_delta_denied := true;
  END;
  BEGIN
    PERFORM public.create_project_approval_decision(
      'a4353000-0000-4000-8000-000000000001',
      '{"title":"missing question","dueAt":"2099-01-01T00:00:00Z","phaseId":"a4353100-0000-4000-8000-000000000001","artifactKind":"plan_issue","artifactId":"a4354000-0000-4000-8000-000000000001","costCentsDelta":0,"scheduleDaysDelta":0,"leadTimeDaysDelta":0}'::jsonb,
      'invalid-missing-question'
    );
  EXCEPTION WHEN OTHERS THEN v_missing_question_denied := true;
  END;
  BEGIN
    PERFORM public.create_project_approval_decision(
      'a4353000-0000-4000-8000-000000000001',
      '{"title":"missing due","question":"Approve?","phaseId":"a4353100-0000-4000-8000-000000000001","artifactKind":"plan_issue","artifactId":"a4354000-0000-4000-8000-000000000001","costCentsDelta":0,"scheduleDaysDelta":0,"leadTimeDaysDelta":0}'::jsonb,
      'invalid-missing-due'
    );
  EXCEPTION WHEN OTHERS THEN v_missing_due_denied := true;
  END;
  BEGIN
    PERFORM public.create_project_approval_decision(
      'a4353000-0000-4000-8000-000000000001',
      '{"title":"missing phase","question":"Approve?","dueAt":"2099-01-01T00:00:00Z","artifactKind":"plan_issue","artifactId":"a4354000-0000-4000-8000-000000000001","costCentsDelta":0,"scheduleDaysDelta":0,"leadTimeDaysDelta":0}'::jsonb,
      'invalid-missing-phase'
    );
  EXCEPTION WHEN OTHERS THEN v_missing_phase_denied := true;
  END;
  BEGIN
    PERFORM public.create_project_approval_decision(
      'a4353000-0000-4000-8000-000000000001',
      '{"title":"foreign phase","question":"Approve?","dueAt":"2099-01-01T00:00:00Z","phaseId":"a4353100-0000-4000-8000-000000000002","artifactKind":"plan_issue","artifactId":"a4354000-0000-4000-8000-000000000001","costCentsDelta":0,"scheduleDaysDelta":0,"leadTimeDaysDelta":0}'::jsonb,
      'invalid-foreign-phase'
    );
  EXCEPTION WHEN OTHERS THEN v_foreign_phase_denied := true;
  END;
  BEGIN
    PERFORM public.create_project_approval_decision(
      'a4353000-0000-4000-8000-000000000001',
      '{"title":"nine values","question":"Approve?","dueAt":"2099-01-01T00:00:00Z","phaseId":"a4353100-0000-4000-8000-000000000001","artifactKind":"plan_issue","artifactId":"a4354000-0000-4000-8000-000000000001","costCentsDelta":0,"scheduleDaysDelta":0,"leadTimeDaysDelta":0,"outcomes":{}}'::jsonb,
      'invalid-nine-deltas'
    );
  EXCEPTION WHEN OTHERS THEN v_per_outcome_denied := true;
  END;

  SELECT count(*) INTO v_after
  FROM public.client_decisions
  WHERE approval_contract = 'project_artifact_v1';
  ASSERT v_conflict_denied AND v_foreign_denied AND v_unready_denied
     AND v_draft_budget_denied AND v_missing_delta_denied
     AND v_missing_question_denied AND v_missing_due_denied
     AND v_missing_phase_denied AND v_foreign_phase_denied
     AND v_per_outcome_denied,
    'one or more invalid Stage-2 creation requests unexpectedly succeeded';
  ASSERT v_after = v_before,
    format('failed creation left partial decisions: before=%s after=%s', v_before, v_after);
END;
$$;
RESET ROLE;

DO $$
DECLARE
  v_plan uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_rpc_results WHERE label = 'plan_create'
  );
BEGIN
  ASSERT (
    SELECT payload->>'decisionId' FROM approval_rpc_results WHERE label = 'plan_create'
  ) = (
    SELECT payload->>'decisionId' FROM approval_rpc_results WHERE label = 'plan_retry'
  ), 'exact create retry returned a different decision';
  ASSERT (
    SELECT payload ? 'updatedAt'
       AND payload->>'updatedAt' IS NOT NULL
       AND payload ? 'predecessorDecisionId'
       AND payload->'predecessorDecisionId' = 'null'::jsonb
    FROM approval_rpc_results WHERE label = 'plan_create'
  ), 'create result lacks optimistic updatedAt or explicit null predecessor';
  ASSERT (
    SELECT count(*) = 3
    FROM public.client_decision_options WHERE decision_id = v_plan
  ), 'Stage-2 creation must own exactly three options';
  ASSERT (
    SELECT phase_id = 'a4353100-0000-4000-8000-000000000001'
       AND blocks_kind = 'phase'
       AND blocking_status = 'blocks_phase'
       AND coordination_kind = 'signoff'
    FROM public.client_decisions WHERE id = v_plan
  ), 'Stage-2 decision is not bound to its exact phase blocker';
  ASSERT (
    SELECT array_agg(approval_outcome ORDER BY sort_order) =
      ARRAY['approved','changes_requested','needs_discussion']::text[]
    FROM public.client_decision_options WHERE decision_id = v_plan
  ), 'Stage-2 creation did not mint the exact canonical outcomes';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.client_decision_options
    WHERE decision_id = v_plan
      AND (
        cost_cents_delta IS DISTINCT FROM 0
        OR schedule_days_delta IS DISTINCT FROM -2
        OR lead_time_days_delta IS DISTINCT FROM 7
        OR approves IS DISTINCT FROM (approval_outcome = 'approved')
      )
  ), 'request-level impact triplet was not copied identically to every outcome';
  ASSERT (
    SELECT authority_revision = 2
       AND decision_lead_id = 'a4350000-0000-4000-8000-000000000002'
       AND required_coapprover_id IS NULL
    FROM public.project_decision_authority_snapshots
    WHERE decision_id = v_plan
  ), 'decision authority snapshot does not match explicit revision 2';
  ASSERT (
    SELECT count(*) = 1
       AND bool_and(phase_id = 'a4353100-0000-4000-8000-000000000001')
    FROM public.project_approval_artifacts WHERE decision_id = v_plan
  ), 'Stage-2 creation must own one immutable phase-bound artifact';
  ASSERT (
    SELECT count(*) = 1
    FROM public.project_approval_action_receipts
    WHERE decision_id = v_plan AND action_kind = 'created'
  ), 'Stage-2 creation must own one immutable receipt';
END;
$$;

-- Create idempotency is project-scoped: another authorized studio may reuse
-- the same key without collision, and must receive only its own result.
SELECT pg_temp.assume_approval_actor('a4350000-0000-4000-8000-000000000004');
SET LOCAL ROLE authenticated;
INSERT INTO approval_rpc_results (label, payload)
SELECT 'foreign_authority_v1', public.set_project_decision_authority(
  'a4353000-0000-4000-8000-000000000002',
  'a4350000-0000-4000-8000-000000000005', NULL, 0
);
INSERT INTO approval_rpc_results (label, payload)
SELECT 'foreign_plan_create', public.create_project_approval_decision(
  'a4353000-0000-4000-8000-000000000002',
  '{
    "title":"Foreign studio construction approval",
    "question":"Approve the foreign studio issued construction set?",
    "dueAt":"2099-01-12T12:00:00Z",
    "phaseId":"a4353100-0000-4000-8000-000000000002",
    "artifactKind":"plan_issue",
    "artifactId":"a4354000-0000-4000-8000-000000000002",
    "costCentsDelta":0,
    "scheduleDaysDelta":0,
    "leadTimeDaysDelta":0
  }'::jsonb,
  'create-plan-1'
);
DO $$
BEGIN
  ASSERT (
    SELECT payload->>'decisionId'
    FROM approval_rpc_results WHERE label = 'foreign_plan_create'
  ) <> (
    SELECT payload->>'decisionId'
    FROM approval_rpc_results WHERE label = 'plan_create'
  ), 'cross-project idempotency key reuse collided or leaked a decision';
END;
$$;
RESET ROLE;

-- Generic draft compatibility and raw table DML must fail closed for Stage 2.
SELECT pg_temp.assume_approval_actor('a4350000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_decision uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_rpc_results WHERE label = 'plan_create'
  );
  v_publish_denied boolean := false;
  v_update_denied boolean := false;
  v_delete_denied boolean := false;
  v_option_denied boolean := false;
  v_parent_insert_denied boolean := false;
  v_option_insert_denied boolean := false;
  v_option_delete_denied boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.client_decisions (
      id, designer_client_id, project_id, designer_id, title, status,
      decision_type, decision_kind, coordination_kind, court,
      approval_contract, phase_id, blocking_status, blocks_kind
    ) VALUES (
      'a4356000-0000-4000-8000-000000000001',
      'a4352000-0000-4000-8000-000000000001',
      'a4353000-0000-4000-8000-000000000001',
      'a4350000-0000-4000-8000-000000000001', 'Forged Stage-2 parent',
      'draft', 'approval', 'approval', 'signoff', 'client',
      'project_artifact_v1', 'a4353100-0000-4000-8000-000000000001',
      'blocks_phase', 'phase'
    );
  EXCEPTION WHEN OTHERS THEN v_parent_insert_denied := true; END;
  BEGIN PERFORM public.publish_client_decision(v_decision);
  EXCEPTION WHEN OTHERS THEN v_publish_denied := true; END;
  BEGIN UPDATE public.client_decisions SET title = 'direct rewrite' WHERE id = v_decision;
  EXCEPTION WHEN OTHERS THEN v_update_denied := true; END;
  BEGIN DELETE FROM public.client_decisions WHERE id = v_decision;
  EXCEPTION WHEN OTHERS THEN v_delete_denied := true; END;
  BEGIN
    INSERT INTO public.client_decision_options (
      decision_id, name, approval_outcome, cost_cents_delta,
      schedule_days_delta, lead_time_days_delta, approves, sort_order
    ) VALUES (
      v_decision, 'Extra outcome', 'approved', 0, 0, 0, true, 3
    );
  EXCEPTION WHEN OTHERS THEN v_option_insert_denied := true; END;
  BEGIN
    DELETE FROM public.client_decision_options
    WHERE decision_id = v_decision AND approval_outcome = 'needs_discussion';
  EXCEPTION WHEN OTHERS THEN v_option_delete_denied := true; END;
  BEGIN
    UPDATE public.client_decision_options
    SET cost_cents_delta = 999
    WHERE decision_id = v_decision AND approval_outcome = 'approved';
  EXCEPTION WHEN OTHERS THEN v_option_denied := true; END;
  ASSERT v_parent_insert_denied AND v_publish_denied AND v_update_denied
     AND v_delete_denied AND v_option_insert_denied AND v_option_delete_denied
     AND v_option_denied,
    'authenticated generic/direct Stage-2 mutation unexpectedly succeeded';
END;
$$;
RESET ROLE;

-- Comments remain discussion. Only exact authenticated portal click-through
-- from the snapshotted lead creates confirmation evidence.
INSERT INTO public.decision_comments (decision_id, author_id, body)
SELECT (payload->>'decisionId')::uuid,
       'a4350000-0000-4000-8000-000000000002',
       'I discussed this; this is not review evidence.'
FROM approval_rpc_results WHERE label = 'spec_create';

SELECT pg_temp.assume_approval_actor('a4350000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
INSERT INTO approval_rpc_results (label, payload)
SELECT 'plan_confirm', public.confirm_project_decision_review(
  (SELECT (payload->>'decisionId')::uuid
   FROM approval_rpc_results WHERE label = 'plan_create'),
  jsonb_build_object(
    'authorityRevision', 2,
    'artifactHash', (
      SELECT artifact_hash FROM public.project_approval_artifacts
      WHERE decision_id = (
        SELECT (payload->>'decisionId')::uuid
        FROM approval_rpc_results WHERE label = 'plan_create'
      )
    ),
    'reviewMethod', 'portal_clickthrough'
  ),
  'confirm-plan-1'
);
INSERT INTO approval_rpc_results (label, payload)
SELECT 'plan_confirm_retry', public.confirm_project_decision_review(
  (SELECT (payload->>'decisionId')::uuid
   FROM approval_rpc_results WHERE label = 'plan_create'),
  jsonb_build_object(
    'authorityRevision', 2,
    'artifactHash', (
      SELECT artifact_hash FROM public.project_approval_artifacts
      WHERE decision_id = (
        SELECT (payload->>'decisionId')::uuid
        FROM approval_rpc_results WHERE label = 'plan_create'
      )
    ),
    'reviewMethod', 'portal_clickthrough'
  ),
  'confirm-plan-1'
);

DO $$
DECLARE
  v_conflict_denied boolean := false;
  v_comment_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.confirm_project_decision_review(
      (SELECT (payload->>'decisionId')::uuid
       FROM approval_rpc_results WHERE label = 'plan_create'),
      jsonb_build_object(
        'authorityRevision', 2,
        'artifactHash', repeat('9', 64),
        'reviewMethod', 'portal_clickthrough'
      ),
      'confirm-plan-1'
    );
  EXCEPTION WHEN OTHERS THEN v_conflict_denied := true;
  END;
  BEGIN
    PERFORM public.confirm_project_decision_review(
      (SELECT (payload->>'decisionId')::uuid
       FROM approval_rpc_results WHERE label = 'spec_create'),
      jsonb_build_object(
        'authorityRevision', 2,
        'artifactHash', repeat('1', 64),
        'reviewMethod', 'portal_clickthrough',
        'comment', 'comments are not evidence'
      ),
      'invalid-comment-evidence'
    );
  EXCEPTION WHEN OTHERS THEN v_comment_denied := true;
  END;
  ASSERT v_conflict_denied AND v_comment_denied,
    'conflicting receipt or comment-shaped review evidence unexpectedly succeeded';
END;
$$;
RESET ROLE;

DO $$
DECLARE
  v_plan uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_rpc_results WHERE label = 'plan_create'
  );
BEGIN
  ASSERT (
    SELECT payload->>'confirmationId'
    FROM approval_rpc_results WHERE label = 'plan_confirm'
  ) = (
    SELECT payload->>'confirmationId'
    FROM approval_rpc_results WHERE label = 'plan_confirm_retry'
  ), 'exact confirmation retry returned different evidence';
  ASSERT (
    SELECT approver_id = 'a4350000-0000-4000-8000-000000000002'
       AND authority_revision = 2
       AND review_method = 'portal_clickthrough'
       AND confirmed_at BETWEEN transaction_timestamp() - interval '1 minute'
                            AND clock_timestamp() + interval '1 minute'
    FROM public.project_decision_review_confirmations
    WHERE decision_id = v_plan
  ), 'review evidence did not bind server actor/revision/method/time';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_decision_review_confirmations
    WHERE decision_id = (
      SELECT (payload->>'decisionId')::uuid
      FROM approval_rpc_results WHERE label = 'spec_create'
    )
  ), 'a decision comment unexpectedly created review confirmation';
END;
$$;

-- Unrelated household actors have neither implicit authority nor comment-based
-- authority to confirm the exact project client's review.
SELECT pg_temp.assume_approval_actor('a4350000-0000-4000-8000-000000000006');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.confirm_project_decision_review(
      (SELECT (payload->>'decisionId')::uuid
       FROM approval_rpc_results WHERE label = 'spec_create'),
      jsonb_build_object(
        'authorityRevision', 2,
        'artifactHash', repeat('1', 64),
        'reviewMethod', 'portal_clickthrough'
      ),
      'unrelated-confirm'
    );
  EXCEPTION WHEN OTHERS THEN v_denied := true;
  END;
  ASSERT v_denied, 'unrelated household actor confirmed a project review';
END;
$$;
RESET ROLE;

-- Service-role table DML is not a canonical authority path.
-- Transaction-local test grants deliberately bypass the ACL layer so these
-- assertions exercise the table-edge trigger itself. They are revoked below.
GRANT INSERT ON TABLE public.project_decision_authority_snapshots TO service_role;
GRANT INSERT ON TABLE public.project_approval_artifacts TO service_role;
GRANT INSERT ON TABLE public.project_decision_review_confirmations TO service_role;
GRANT INSERT ON TABLE public.project_approval_action_receipts TO service_role;
SELECT pg_temp.assume_approval_actor(
  'a4350000-0000-4000-8000-000000000002', 'service_role'
);
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_decision uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_rpc_results WHERE label = 'plan_create'
  );
  v_parent_update_denied boolean := false;
  v_parent_delete_denied boolean := false;
  v_artifact_update_denied boolean := false;
  v_artifact_delete_denied boolean := false;
  v_receipt_insert_denied boolean := false;
  v_parent_insert_denied boolean := false;
  v_option_insert_denied boolean := false;
  v_option_update_denied boolean := false;
  v_option_delete_denied boolean := false;
  v_snapshot_insert_denied boolean := false;
  v_artifact_insert_denied boolean := false;
  v_confirmation_insert_denied boolean := false;
BEGIN
  -- A caller may set custom GUC text, but that cannot confer the postgres
  -- writer identity required by the invoker-mode table-edge trigger.
  PERFORM set_config(
    'app.project_approval_evidence_decision_id', v_decision::text, true
  );
  BEGIN
    INSERT INTO public.client_decisions (
      id, designer_client_id, project_id, designer_id, title, status,
      decision_type, decision_kind, coordination_kind, court,
      approval_contract, phase_id, blocking_status, blocks_kind
    ) VALUES (
      'a4356000-0000-4000-8000-000000000002',
      'a4352000-0000-4000-8000-000000000001',
      'a4353000-0000-4000-8000-000000000001',
      'a4350000-0000-4000-8000-000000000001', 'Service forged parent',
      'draft', 'approval', 'approval', 'signoff', 'client',
      'project_artifact_v1', 'a4353100-0000-4000-8000-000000000001',
      'blocks_phase', 'phase'
    );
  EXCEPTION WHEN OTHERS THEN v_parent_insert_denied := true; END;
  BEGIN UPDATE public.client_decisions SET title = 'service rewrite' WHERE id = v_decision;
  EXCEPTION WHEN OTHERS THEN v_parent_update_denied := true; END;
  BEGIN DELETE FROM public.client_decisions WHERE id = v_decision;
  EXCEPTION WHEN OTHERS THEN v_parent_delete_denied := true; END;
  BEGIN UPDATE public.project_approval_artifacts SET artifact_title = 'rewrite' WHERE decision_id = v_decision;
  EXCEPTION WHEN OTHERS THEN v_artifact_update_denied := true; END;
  BEGIN DELETE FROM public.project_approval_artifacts WHERE decision_id = v_decision;
  EXCEPTION WHEN OTHERS THEN v_artifact_delete_denied := true; END;
  BEGIN
    INSERT INTO public.client_decision_options (
      decision_id, name, approval_outcome, cost_cents_delta,
      schedule_days_delta, lead_time_days_delta, approves, sort_order
    ) VALUES (v_decision, 'Service extra', 'approved', 0, 0, 0, true, 3);
  EXCEPTION WHEN OTHERS THEN v_option_insert_denied := true; END;
  BEGIN
    UPDATE public.client_decision_options SET schedule_days_delta = 88
    WHERE decision_id = v_decision AND approval_outcome = 'approved';
  EXCEPTION WHEN OTHERS THEN v_option_update_denied := true; END;
  BEGIN
    DELETE FROM public.client_decision_options
    WHERE decision_id = v_decision AND approval_outcome = 'needs_discussion';
  EXCEPTION WHEN OTHERS THEN v_option_delete_denied := true; END;
  BEGIN
    INSERT INTO public.project_decision_authority_snapshots (
      decision_id, project_id, decision_lead_id, authority_revision,
      assigned_by
    ) VALUES (
      v_decision, 'a4353000-0000-4000-8000-000000000001',
      'a4350000-0000-4000-8000-000000000002', 2,
      'a4350000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN OTHERS THEN v_snapshot_insert_denied := true; END;
  BEGIN
    INSERT INTO public.project_approval_artifacts (
      decision_id, project_id, source_kind, source_id, source_version,
      artifact_hash, artifact_title, question, due_at,
      phase_id,
      cost_cents_delta, schedule_days_delta, lead_time_days_delta,
      source_snapshot
    ) VALUES (
      v_decision, 'a4353000-0000-4000-8000-000000000001', 'plan_issue',
      'a4354000-0000-4000-8000-000000000001', 3, repeat('b', 64),
      'Forged artifact', 'Forged?', now() + interval '1 day',
      'a4353100-0000-4000-8000-000000000001', 0, 0, 0,
      '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN v_artifact_insert_denied := true; END;
  BEGIN
    PERFORM set_config(
      'app.project_approval_evidence_decision_id',
      (SELECT payload->>'decisionId'
       FROM approval_rpc_results WHERE label = 'spec_create'), true
    );
    INSERT INTO public.project_decision_review_confirmations (
      decision_id, project_id, authority_revision, approver_id,
      approver_role, artifact_hash, review_method
    ) VALUES (
      (SELECT (payload->>'decisionId')::uuid
      FROM approval_rpc_results WHERE label = 'spec_create'),
      'a4353000-0000-4000-8000-000000000001', 2,
      'a4350000-0000-4000-8000-000000000002', 'lead', repeat('1', 64),
      'portal_clickthrough'
    );
  EXCEPTION WHEN OTHERS THEN v_confirmation_insert_denied := true; END;
  BEGIN
    PERFORM set_config(
      'app.project_approval_evidence_decision_id', v_decision::text, true
    );
    INSERT INTO public.project_approval_action_receipts (
      project_id, decision_id, action_kind, idempotency_key,
      request_hash, actor_id, result
    ) VALUES (
      'a4353000-0000-4000-8000-000000000001', v_decision, 'created',
      'service-forgery', repeat('8', 64),
      'a4350000-0000-4000-8000-000000000002', '{}'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN v_receipt_insert_denied := true; END;
  ASSERT v_parent_insert_denied AND v_parent_update_denied AND v_parent_delete_denied
     AND v_artifact_update_denied AND v_artifact_delete_denied
     AND v_option_insert_denied AND v_option_update_denied
     AND v_option_delete_denied AND v_snapshot_insert_denied
     AND v_artifact_insert_denied AND v_confirmation_insert_denied
     AND v_receipt_insert_denied,
    'service_role directly mutated Stage-2 authority/evidence';
END;
$$;
RESET ROLE;
REVOKE INSERT ON TABLE public.project_decision_authority_snapshots FROM service_role;
REVOKE INSERT ON TABLE public.project_approval_artifacts FROM service_role;
REVOKE INSERT ON TABLE public.project_decision_review_confirmations FROM service_role;
REVOKE INSERT ON TABLE public.project_approval_action_receipts FROM service_role;

-- Client-visible artifacts are allowlisted summaries. Raw authority,
-- confirmations, and receipts remain studio-private.
SELECT pg_temp.assume_approval_actor('a4350000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $$
DECLARE v_safe_text text;
BEGIN
  ASSERT (
    SELECT count(*) = 3 FROM public.project_approval_artifacts
    WHERE project_id = 'a4353000-0000-4000-8000-000000000001'
  ), 'addressed project client cannot read its three immutable artifacts';
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_decision_authorities),
    'client can read raw authority assignments';
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_decision_authority_snapshots),
    'client can read raw authority snapshots';
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_decision_review_confirmations),
    'client can read raw reviewer identities';
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_approval_action_receipts),
    'client can read private action receipts';

  SELECT string_agg(source_snapshot::text, E'\n') INTO v_safe_text
  FROM public.project_approval_artifacts
  WHERE project_id = 'a4353000-0000-4000-8000-000000000001';
  ASSERT NOT (
    v_safe_text ~* 'vendor|trade|internal|source_url|storage|path|budget_lines|note'
  ), 'client-readable source snapshot carries internal/source/commercial keys';
END;
$$;
RESET ROLE;

SELECT pg_temp.assume_approval_actor('a4350000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT (
    SELECT count(*) = 1 FROM public.project_decision_authorities
    WHERE project_id = 'a4353000-0000-4000-8000-000000000001'
  ), 'same-studio peer cannot read authority assignment';
  ASSERT (
    SELECT count(*) = 3 FROM public.project_decision_authority_snapshots
    WHERE project_id = 'a4353000-0000-4000-8000-000000000001'
  ), 'same-studio peer cannot read authority snapshots';
  ASSERT (
    SELECT count(*) = 1 FROM public.project_decision_review_confirmations
    WHERE project_id = 'a4353000-0000-4000-8000-000000000001'
  ), 'same-studio peer cannot read private review evidence';
END;
$$;
RESET ROLE;

SELECT pg_temp.assume_approval_actor('a4350000-0000-4000-8000-000000000006');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.project_approval_artifacts
    WHERE project_id = 'a4353000-0000-4000-8000-000000000001'
  ), 'foreign authenticated user can read project artifacts';
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_decision_authorities),
    'foreign authenticated user can read authority assignments';
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_decision_review_confirmations),
    'foreign authenticated user can read review evidence';
END;
$$;
RESET ROLE;

DO $$
BEGIN
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.client_decisions
    WHERE approval_contract = 'project_artifact_v1'
      AND linked_proposal_id IS NOT NULL
  ), 'Stage-2 classifier contaminated proposal signature decisions';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.client_decision_options AS option
    JOIN public.client_decisions AS decision ON decision.id = option.decision_id
    WHERE decision.approval_contract IS NULL
      AND (
        option.approval_outcome IS NOT NULL
        OR option.cost_cents_delta IS NOT NULL
        OR option.schedule_days_delta IS NOT NULL
      )
  ), '00435 backfilled or rewrote legacy decision option evidence';
END;
$$;

ROLLBACK;
