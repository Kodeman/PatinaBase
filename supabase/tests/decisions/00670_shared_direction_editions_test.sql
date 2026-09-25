-- 00670 shared-direction editions contract (NI-05, SQ-219; CONTRACT-C rev 4 §C.9).
--
-- Proves, against a fixture built through the installed RPCs:
--   · each answer: ok, revoked, not_found (nonexistent, never a reader, missing
--     proof, wrong proof), unauthorized; request order; 0/201/non-array → SQL error
--   · the three §C.4 authority cases (lead after reassignment → ok; designer after her
--     own membership and the studio are deactivated → ok; peer after deactivation with
--     a correct proof → revoked)
--   · query cost: 5 editions in one project + 2 in another → the projection runs twice
--   · the plan-set assert (fixture checksum reproduces; a mismatched set → null)
--   · the timing regression guard (median ratio < 3 over 50 runs; a guard, not proof)
--   · bucket: private, and no storage.objects policy references it
--   · a malformed item (non-UUID decisionId, non-integer heldAuthorityRevision) answers
--     not_found for that item only; the rest of the batch is answered
--   · spec-book edition: one spec_book_pdf entry whose sha256 is the frozen checksum;
--     budget edition: attachments [] and editionFigures from the frozen snapshot
--   · recorder: checksum refusal, missing-object refusal, size and content-type
--     refusals against the stored object's metadata, refusal for a set whose manifest
--     is NULL, spec book only as application/pdf, idempotent re-record
--     (ON CONFLICT DO NOTHING, first writer wins), two attachments sharing one
--     checksum recorded as two rows at two paths (N3), a spec-book copy recorded,
--     authenticated denied
--   · path CHECK: empty, non-UUID and extra-segment suffixes rejected; rows immutable
--
-- Run (local stack, after 00670):
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' -v ON_ERROR_STOP=1 \
--     -f supabase/tests/decisions/00670_shared_direction_editions_test.sql
\set ON_ERROR_STOP on

BEGIN;

DO $preflight$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(label ORDER BY label)
  INTO v_missing
  FROM (VALUES
    ('batch editions RPC',
      to_regprocedure('public.get_project_decision_editions(jsonb)') IS NOT NULL),
    ('single edition wrapper',
      to_regprocedure('public.get_project_decision_edition(uuid,integer,text)') IS NOT NULL),
    ('private recorder',
      to_regprocedure('app_private.record_project_approval_edition_object(uuid,uuid,text,bigint,text,text)') IS NOT NULL),
    ('public recorder wrapper',
      to_regprocedure('public.record_project_approval_edition_object(uuid,uuid,text,bigint,text,text)') IS NOT NULL),
    ('attachment objects resolver',
      to_regprocedure('public.project_approval_attachment_objects(uuid)') IS NOT NULL),
    ('edition objects table',
      to_regclass('public.project_approval_edition_objects') IS NOT NULL),
    ('untouched legacy detail RPC',
      to_regprocedure('public.get_project_decision_review(uuid)') IS NOT NULL)
  ) AS required(label, present)
  WHERE NOT present;

  IF COALESCE(cardinality(v_missing), 0) > 0 THEN
    RAISE EXCEPTION '00670 shared-direction editions are not installed: %',
      array_to_string(v_missing, ', ')
      USING ERRCODE = '55000';
  END IF;
END
$preflight$;

-- ── Structure, ACLs, bucket, cron ─────────────────────────────────────────────────
DO $structure$
DECLARE
  v_role text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'service_role'] LOOP
    ASSERT NOT has_function_privilege(v_role,
      'public.get_project_decision_editions(jsonb)', 'EXECUTE'),
      format('%s can execute get_project_decision_editions', v_role);
    ASSERT NOT has_function_privilege(v_role,
      'public.get_project_decision_edition(uuid,integer,text)', 'EXECUTE'),
      format('%s can execute get_project_decision_edition', v_role);
  END LOOP;
  ASSERT has_function_privilege('authenticated',
      'public.get_project_decision_editions(jsonb)', 'EXECUTE')
     AND has_function_privilege('authenticated',
      'public.get_project_decision_edition(uuid,integer,text)', 'EXECUTE'),
    'authenticated cannot call the typed edition RPCs';

  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    ASSERT NOT has_function_privilege(v_role,
      'public.record_project_approval_edition_object(uuid,uuid,text,bigint,text,text)', 'EXECUTE'),
      format('%s can execute the public recorder', v_role);
    ASSERT NOT has_function_privilege(v_role,
      'public.project_approval_attachment_objects(uuid)', 'EXECUTE'),
      format('%s can execute the attachment objects resolver', v_role);
  END LOOP;
  ASSERT has_function_privilege('service_role',
      'public.record_project_approval_edition_object(uuid,uuid,text,bigint,text,text)', 'EXECUTE')
     AND has_function_privilege('service_role',
      'public.project_approval_attachment_objects(uuid)', 'EXECUTE'),
    'service_role cannot reach the recorder or resolver';

  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
    ASSERT NOT has_function_privilege(v_role,
      'app_private.record_project_approval_edition_object(uuid,uuid,text,bigint,text,text)', 'EXECUTE'),
      format('%s can execute the private recorder', v_role);
    ASSERT NOT has_function_privilege(v_role,
      'app_private.project_approval_edition_manifest(uuid,boolean)', 'EXECUTE'),
      format('%s can execute the private manifest', v_role);
    ASSERT NOT has_function_privilege(v_role,
      'app_private.project_approval_edition_attachment_rows(uuid)', 'EXECUTE'),
      format('%s can execute the private attachment rows', v_role);
    ASSERT NOT has_table_privilege(v_role, 'public.project_approval_edition_objects',
      'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
      format('%s holds a privilege on project_approval_edition_objects', v_role);
  END LOOP;

  ASSERT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'project-approval-editions'
      AND public = false
      AND file_size_limit = 52428800
      AND allowed_mime_types @> ARRAY['application/pdf', 'image/png', 'image/jpeg']
      AND cardinality(allowed_mime_types) = 3
  ), 'project-approval-editions bucket is missing or misconfigured';
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND (COALESCE(qual, '') LIKE '%project-approval-editions%'
        OR COALESCE(with_check, '') LIKE '%project-approval-editions%')
  ), 'a storage policy references project-approval-editions';

  ASSERT EXISTS (
    SELECT 1 FROM cron.job
    WHERE jobname = 'project-approval-editions-sweep-hourly'
      AND schedule ~ '^[0-9]+ \* \* \* \*$'
      AND command LIKE '%invoke_edge_function(''project-approval-attachments''%sweep%'
  ), 'hourly sweep job is missing';

  ASSERT (SELECT relrowsecurity FROM pg_class
          WHERE oid = 'public.project_approval_edition_objects'::regclass),
    'edition objects table must have RLS enabled';
END
$structure$;

-- ── Fixture ───────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.nf_assume(p_actor uuid, p_role text DEFAULT 'authenticated')
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    jsonb_strip_nulls(jsonb_build_object('sub', p_actor, 'role', p_role))::text, true);
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_actor::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', p_role, true);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.nf_assume(uuid, text) TO PUBLIC;

CREATE TEMP TABLE nf_ids (label text PRIMARY KEY, id uuid NOT NULL) ON COMMIT DROP;
GRANT SELECT, INSERT ON nf_ids TO authenticated, service_role;

CREATE OR REPLACE FUNCTION pg_temp.nf(p_label text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT id FROM nf_ids WHERE label = p_label $$;
GRANT EXECUTE ON FUNCTION pg_temp.nf(text) TO PUBLIC;

-- 01 designer (studio owner) · 02 peer co-member · 03 lead · 04 second client · 05 foreign
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
SELECT ('c6700000-0000-4000-8000-00000000000' || n)::uuid, 'nf-' || n || '@test.invalid',
       '', now(), now(), now(), '00000000-0000-0000-0000-000000000000',
       'authenticated', 'authenticated'
FROM generate_series(1, 5) AS n;

INSERT INTO public.profiles (id, email, full_name, is_designer)
VALUES
  ('c6700000-0000-4000-8000-000000000001', 'nf-1@test.invalid', 'Edition Designer', true),
  ('c6700000-0000-4000-8000-000000000002', 'nf-2@test.invalid', 'Edition Peer', true),
  ('c6700000-0000-4000-8000-000000000003', 'nf-3@test.invalid', 'Edition Lead', false),
  ('c6700000-0000-4000-8000-000000000004', 'nf-4@test.invalid', 'Edition Second Client', false),
  ('c6700000-0000-4000-8000-000000000005', 'nf-5@test.invalid', 'Edition Stranger', false)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('c6701000-0000-4000-8000-000000000001', 'design_studio',
        'Edition Studio', 'nf-edition-studio', 'active');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('c6701100-0000-4000-8000-000000000001', 'c6700000-0000-4000-8000-000000000001',
   'c6701000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('c6701100-0000-4000-8000-000000000002', 'c6700000-0000-4000-8000-000000000002',
   'c6701000-0000-4000-8000-000000000001', 'member', 'active', now());

INSERT INTO public.user_roles (user_id, role_id, granted_by)
SELECT 'c6700000-0000-4000-8000-000000000001', role.id,
       'c6700000-0000-4000-8000-000000000001'
FROM public.roles AS role
WHERE role.name = 'studio_owner';

INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, status, source)
VALUES
  ('c6702000-0000-4000-8000-000000000001', 'c6700000-0000-4000-8000-000000000001',
   'c6700000-0000-4000-8000-000000000003', 'Edition Lead', 'active', 'direct'),
  ('c6702000-0000-4000-8000-000000000002', 'c6700000-0000-4000-8000-000000000001',
   'c6700000-0000-4000-8000-000000000004', 'Edition Second Client', 'active', 'direct');

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
VALUES
  ('c6703000-0000-4000-8000-000000000001', 'Edition Project A',
   'c6700000-0000-4000-8000-000000000001', 'c6700000-0000-4000-8000-000000000003',
   'c6700000-0000-4000-8000-000000000001', 'c6701000-0000-4000-8000-000000000001', 'active'),
  ('c6703000-0000-4000-8000-000000000002', 'Edition Project B',
   'c6700000-0000-4000-8000-000000000001', 'c6700000-0000-4000-8000-000000000003',
   'c6700000-0000-4000-8000-000000000001', 'c6701000-0000-4000-8000-000000000001', 'active');

INSERT INTO public.project_phases (id, project_id, name, phase_key, status, sort_order)
VALUES
  ('c6703100-0000-4000-8000-000000000001', 'c6703000-0000-4000-8000-000000000001',
   'Design', 'design', 'in_progress', 0),
  ('c6703100-0000-4000-8000-000000000002', 'c6703000-0000-4000-8000-000000000002',
   'Design', 'design', 'in_progress', 0);

-- The uploads file_plan_prints requires to exist.
INSERT INTO storage.objects (bucket_id, name, owner)
VALUES
  ('project-documents', 'c6703000-0000-4000-8000-000000000001/plans/a101.pdf', 'c6700000-0000-4000-8000-000000000001'),
  ('project-documents', 'c6703000-0000-4000-8000-000000000001/plans/a102.pdf', 'c6700000-0000-4000-8000-000000000001'),
  ('project-documents', 'c6703000-0000-4000-8000-000000000001/plans/a103.pdf', 'c6700000-0000-4000-8000-000000000001');

SELECT pg_temp.nf_assume('c6700000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT public.set_project_decision_authority(
  'c6703000-0000-4000-8000-000000000001', 'c6700000-0000-4000-8000-000000000003', NULL, 0);
SELECT public.set_project_decision_authority(
  'c6703000-0000-4000-8000-000000000002', 'c6700000-0000-4000-8000-000000000003', NULL, 0);
-- A-101 and A-102 deliberately share one checksum (N3).
SELECT public.file_plan_prints(
  'c6703000-0000-4000-8000-000000000001', 'nf-batch-1',
  jsonb_build_array(
    jsonb_build_object('kind', 'new_sheet',
      'sheet', jsonb_build_object('number', 'A-102', 'title', 'Upper floor'),
      'print', jsonb_build_object(
        'storage_path', 'c6703000-0000-4000-8000-000000000001/plans/a102.pdf',
        'sha256', repeat('a', 64), 'size_bytes', 2000)),
    jsonb_build_object('kind', 'new_sheet',
      'sheet', jsonb_build_object('number', 'A-101', 'title', 'Ground floor'),
      'print', jsonb_build_object(
        'storage_path', 'c6703000-0000-4000-8000-000000000001/plans/a101.pdf',
        'sha256', repeat('a', 64), 'size_bytes', 1000)),
    jsonb_build_object('kind', 'new_sheet',
      'sheet', jsonb_build_object('number', 'A-103', 'title', 'Roof'),
      'print', jsonb_build_object(
        'storage_path', 'c6703000-0000-4000-8000-000000000001/plans/a103.pdf',
        'sha256', repeat('b', 64), 'size_bytes', 3000))),
  'nf-set.pdf');
SELECT public.create_plan_issue(
  'c6703000-0000-4000-8000-000000000001', 'Issue one', 'nf-issue-1');
RESET ROLE;

INSERT INTO nf_ids (label, id)
SELECT 'issue', id FROM public.plan_issues
WHERE project_id = 'c6703000-0000-4000-8000-000000000001' AND issue_number = 1;

-- A set whose frozen checksum the served prints cannot reproduce (project A), and a
-- bare issue with no prints (project B). Both are legal issue rows for the resolver.
INSERT INTO public.plan_issues (
  id, project_id, issue_number, name, idempotency_key, request_hash,
  set_checksum, sheet_count, created_by
) VALUES
  ('c6704000-0000-4000-8000-000000000001', 'c6703000-0000-4000-8000-000000000001', 90,
   'Mismatched set', 'nf-bad-set', repeat('1', 64), repeat('c', 64), 1,
   'c6700000-0000-4000-8000-000000000001'),
  ('c6704000-0000-4000-8000-000000000002', 'c6703000-0000-4000-8000-000000000002', 1,
   'Project B set', 'nf-b-set', repeat('2', 64), repeat('d', 64), 1,
   'c6700000-0000-4000-8000-000000000001');
INSERT INTO public.plan_issue_prints (
  issue_id, sheet_id, print_id, sheet_number, sheet_title, rev_letter, sha256
)
SELECT 'c6704000-0000-4000-8000-000000000001', sheet.id, sheet.current_print_id,
       sheet.sheet_number, sheet.title, plan_print.rev_letter, plan_print.sha256
FROM public.plan_sheets AS sheet
JOIN public.plan_prints AS plan_print ON plan_print.id = sheet.current_print_id
WHERE sheet.project_id = 'c6703000-0000-4000-8000-000000000001'
  AND sheet.sheet_number = 'A-101';

-- An issued client spec-book PDF (checksum 5…5, 4096 bytes) and a published budget
-- checkpoint (B-001) in project A, the sources of the S1 and G1 editions.
INSERT INTO public.spec_book_templates (
  id, template_key, version, studio_id, name, page_grammar,
  audience_profiles, required_field_rules, visibility_rules, created_by
) VALUES (
  'c6705000-0000-4000-8000-000000000001', 'nf.edition', 1,
  'c6701000-0000-4000-8000-000000000001', 'Edition spec template',
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  'c6700000-0000-4000-8000-000000000001'
);
INSERT INTO public.spec_books (
  id, project_id, title, template_id, default_audiences, created_by
) VALUES (
  'c6705100-0000-4000-8000-000000000001', 'c6703000-0000-4000-8000-000000000001',
  'Edition specification book', 'c6705000-0000-4000-8000-000000000001',
  ARRAY['client']::text[], 'c6700000-0000-4000-8000-000000000001'
);
INSERT INTO public.project_documents (
  id, project_id, title, doc_type, storage_path, status, uploaded_by,
  section_key, client_visible, size_bytes
) VALUES (
  'c6705200-0000-4000-8000-000000000001', 'c6703000-0000-4000-8000-000000000001',
  'Edition spec PDF', 'pdf', 'c6703000-0000-4000-8000-000000000001/specs/nf-spec.pdf',
  'ready', 'c6700000-0000-4000-8000-000000000001', 'spec-book', true, 4096
);
INSERT INTO public.spec_book_revisions (
  id, spec_book_id, revision_number, idempotency_key, issue_type, status,
  requested_audiences, template_snapshot, render_snapshot,
  snapshot_checksum, created_by, issued_at
) VALUES (
  'c6705300-0000-4000-8000-000000000001', 'c6705100-0000-4000-8000-000000000001', 1,
  'nf-spec-issued', 'full', 'issued', ARRAY['client']::text[], '{}'::jsonb,
  '{"clientSafe":true}'::jsonb, repeat('4', 64),
  'c6700000-0000-4000-8000-000000000001', now()
);
INSERT INTO public.spec_book_artifacts (
  id, revision_id, audience, status, project_document_id, storage_path,
  checksum_sha256, size_bytes, rendered_at
) VALUES (
  'c6705400-0000-4000-8000-000000000001', 'c6705300-0000-4000-8000-000000000001',
  'client', 'ready', 'c6705200-0000-4000-8000-000000000001',
  'c6703000-0000-4000-8000-000000000001/specs/nf-spec.pdf', repeat('5', 64), 4096, now()
);

INSERT INTO public.project_budget_versions (id, project_id, version, status, note, created_by)
VALUES ('c6705500-0000-4000-8000-000000000001', 'c6703000-0000-4000-8000-000000000001',
        1, 'draft', 'Edition budget', 'c6700000-0000-4000-8000-000000000001');
INSERT INTO public.project_budget_lines (
  id, budget_version_id, room_name, category, low_cents, target_cents,
  high_cents, scheduled_cents, authorized_cents, sort_order
) VALUES (
  'c6705600-0000-4000-8000-000000000001', 'c6705500-0000-4000-8000-000000000001',
  'Living Room', 'Upholstery', 900000, 1000000, 1200000, 0, 0, 0
);
SELECT set_config('app.budget_publish_id', 'c6705500-0000-4000-8000-000000000001', true);
UPDATE public.project_budget_versions
SET status = 'published', low_total_cents = 900000, target_total_cents = 1000000,
    high_total_cents = 1200000, published_at = now()
WHERE id = 'c6705500-0000-4000-8000-000000000001';
SELECT set_config('app.budget_publish_id', '', true);
INSERT INTO public.project_budget_checkpoints (
  id, project_id, budget_version_id, checkpoint_code, snapshot_fingerprint, published_by
) VALUES (
  'c6705700-0000-4000-8000-000000000001', 'c6703000-0000-4000-8000-000000000001',
  'c6705500-0000-4000-8000-000000000001', 'B-001',
  public._budget_version_fingerprint('c6705500-0000-4000-8000-000000000001'),
  'c6700000-0000-4000-8000-000000000001'
);

CREATE OR REPLACE FUNCTION pg_temp.nf_create(
  p_label text, p_project uuid, p_phase uuid, p_issue uuid,
  p_kind text DEFAULT 'plan_issue'
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
BEGIN
  v_result := public.create_project_approval_decision(
    p_project,
    jsonb_build_object(
      'title', 'Edition ' || p_label,
      'question', 'Approve edition ' || p_label || '?',
      'context', 'Shared-direction fixture.',
      'dueAt', (now() + interval '5 days')::text,
      'phaseId', p_phase,
      'sectionKey', 'project',
      'artifactKind', p_kind,
      'artifactId', p_issue,
      'costCentsDelta', 0,
      'scheduleDaysDelta', 0,
      'leadTimeDaysDelta', 0
    ),
    'nf-create-' || p_label,
    NULL
  );
  INSERT INTO nf_ids (label, id) VALUES (p_label, (v_result->>'decisionId')::uuid);
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.nf_create(text, uuid, uuid, uuid, text) TO PUBLIC;

SELECT pg_temp.nf_assume('c6700000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.nf_create('A' || n, 'c6703000-0000-4000-8000-000000000001',
  'c6703100-0000-4000-8000-000000000001', pg_temp.nf('issue'))
FROM generate_series(1, 5) AS n;
SELECT pg_temp.nf_create('A6', 'c6703000-0000-4000-8000-000000000001',
  'c6703100-0000-4000-8000-000000000001', 'c6704000-0000-4000-8000-000000000001');
SELECT pg_temp.nf_create('B' || n, 'c6703000-0000-4000-8000-000000000002',
  'c6703100-0000-4000-8000-000000000002', 'c6704000-0000-4000-8000-000000000002')
FROM generate_series(1, 2) AS n;
SELECT pg_temp.nf_create('S1', 'c6703000-0000-4000-8000-000000000001',
  'c6703100-0000-4000-8000-000000000001', 'c6705400-0000-4000-8000-000000000001',
  'spec_book_artifact');
SELECT pg_temp.nf_create('G1', 'c6703000-0000-4000-8000-000000000001',
  'c6703100-0000-4000-8000-000000000001', 'c6705500-0000-4000-8000-000000000001',
  'budget_version');
RESET ROLE;

-- The frozen artifact rows of S1 and G1, as the assertions below expect them served.
CREATE TEMP TABLE nf_frozen ON COMMIT DROP AS
SELECT decision_id, source_kind, artifact_title, artifact_hash, source_snapshot
FROM public.project_approval_artifacts
WHERE decision_id IN (pg_temp.nf('S1'), pg_temp.nf('G1'));
GRANT SELECT ON nf_frozen TO authenticated, service_role;

-- Frozen proof for A1: what a device that read it holds.
CREATE TEMP TABLE nf_proof ON COMMIT DROP AS
SELECT snapshot.authority_revision, artifact.artifact_hash
FROM public.project_decision_authority_snapshots AS snapshot
JOIN public.project_approval_artifacts AS artifact USING (decision_id)
WHERE snapshot.decision_id = pg_temp.nf('A1');
GRANT SELECT ON nf_proof TO authenticated, service_role;

-- ── Query cost: 5 editions in A + 2 in B → exactly 2 projections ──────────────────
-- postgres cannot SET track_functions on the Supabase stack, so when it is not
-- settable the installed projection is wrapped (transaction-local) with a counter.
DO $$
BEGIN
  IF has_parameter_privilege('track_functions', 'SET') THEN
    PERFORM set_config('track_functions', 'all', true);
    PERFORM set_config('nf.cost_mode', 'pg_stat', true);
  ELSE
    ALTER FUNCTION public.get_project_decision_reviews(uuid)
      RENAME TO get_project_decision_reviews_nf_counted;
    EXECUTE $shim$
      CREATE FUNCTION public.get_project_decision_reviews(p_project_id uuid)
      RETURNS jsonb
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, pg_temp
      AS $body$
      BEGIN
        PERFORM set_config('nf.review_calls',
          (COALESCE(NULLIF(current_setting('nf.review_calls', true), ''), '0')::integer + 1)::text,
          false);
        RETURN public.get_project_decision_reviews_nf_counted(p_project_id);
      END;
      $body$
    $shim$;
    GRANT EXECUTE ON FUNCTION public.get_project_decision_reviews(uuid) TO authenticated;
    PERFORM set_config('nf.cost_mode', 'shim', true);
  END IF;
  PERFORM set_config('nf.review_calls', '0', false);
END;
$$;

CREATE TEMP TABLE nf_cost (before_calls bigint) ON COMMIT DROP;
INSERT INTO nf_cost
SELECT COALESCE((SELECT calls FROM pg_stat_xact_user_functions
                 WHERE funcid = to_regprocedure('public.get_project_decision_reviews(uuid)')), 0);

CREATE TEMP TABLE nf_cost_result (envelope jsonb) ON COMMIT DROP;
GRANT INSERT, SELECT ON nf_cost_result TO authenticated;

SELECT pg_temp.nf_assume('c6700000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
INSERT INTO nf_cost_result
SELECT public.get_project_decision_editions(jsonb_agg(
  jsonb_build_object('decisionId', pg_temp.nf(label)) ORDER BY label)) AS envelope
FROM unnest(ARRAY['A1', 'A2', 'A3', 'A4', 'A5', 'B1', 'B2']) AS label;
RESET ROLE;

DO $$
DECLARE
  v_envelope jsonb := (SELECT envelope FROM nf_cost_result);
  v_calls bigint;
BEGIN
  IF current_setting('nf.cost_mode') = 'pg_stat' THEN
    SELECT calls - (SELECT before_calls FROM nf_cost) INTO v_calls
    FROM pg_stat_xact_user_functions
    WHERE funcid = 'public.get_project_decision_reviews(uuid)'::regprocedure;
  ELSE
    v_calls := current_setting('nf.review_calls')::bigint;
  END IF;
  ASSERT v_calls = 2,
    format('projection ran %s times for 7 editions across 2 projects (want 2)', v_calls);
  ASSERT jsonb_array_length(v_envelope->'editions') = 7
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_envelope->'editions') AS e(item)
       WHERE e.item->>'status' <> 'ok'
     ), 'lead did not get ok for all seven editions';
  -- Project B's set is a bare issue: ok, but its attachments fail the set assert.
  ASSERT (v_envelope->'editions'->5->'attachments') = 'null'::jsonb,
    'bare plan issue served attachments';

  IF current_setting('nf.cost_mode') = 'shim' THEN
    DROP FUNCTION public.get_project_decision_reviews(uuid);
    ALTER FUNCTION public.get_project_decision_reviews_nf_counted(uuid)
      RENAME TO get_project_decision_reviews;
  END IF;
END;
$$;

-- ── ok, the plan-set assert, request order, wrapper shape ─────────────────────────
SELECT pg_temp.nf_assume('c6700000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_a1 uuid := pg_temp.nf('A1');
  v_missing uuid := 'c670dead-0000-4000-8000-000000000001';
  v_envelope jsonb;
  v_item jsonb;
  v_single jsonb;
  v_manifest jsonb;
BEGIN
  v_envelope := public.get_project_decision_editions(jsonb_build_array(
    jsonb_build_object('decisionId', v_a1),
    jsonb_build_object('decisionId', v_missing,
      'heldAuthorityRevision', 1, 'heldArtifactChecksum', repeat('e', 64)),
    jsonb_build_object('decisionId', pg_temp.nf('A6'))
  ));
  ASSERT v_envelope->>'contract' = 'shared_direction_v1', 'wrong contract tag';
  ASSERT (v_envelope->>'servedAt')::timestamptz = now(), 'servedAt is not server now()';
  ASSERT jsonb_array_length(v_envelope->'editions') = 3, 'one answer per held item';

  v_item := v_envelope->'editions'->0;
  ASSERT v_item->>'decisionId' = v_a1::text AND v_item->>'status' = 'ok',
    'lead did not get ok for A1';
  ASSERT v_item->'review' = public.get_project_decision_review(v_a1),
    'ok review is not the projection item as served';
  ASSERT v_item->'editionFigures' = 'null'::jsonb, 'plan edition carried editionFigures';

  -- Plan-set assert: the manifest exists only because the served prints reproduce
  -- the fixture's frozen set_checksum.
  v_manifest := v_item->'attachments';
  ASSERT jsonb_typeof(v_manifest) = 'array' AND jsonb_array_length(v_manifest) = 3,
    format('A1 manifest wrong: %s', v_manifest);
  ASSERT (SELECT array_agg(e.item->>'label' ORDER BY (e.item->>'position')::int)
          FROM jsonb_array_elements(v_manifest) AS e(item))
       = ARRAY['A-101 · Ground floor · rev A', 'A-102 · Upper floor · rev A',
               'A-103 · Roof · rev A'],
    format('manifest order/labels wrong: %s', v_manifest);
  ASSERT (SELECT bool_and(
            e.item->>'kind' = 'plan_sheet'
            AND e.item->>'contentType' = 'application/pdf'
            AND NOT (e.item ? 'objectPath') AND NOT (e.item ? 'source')
            AND NOT (e.item ? 'recorded'))
          FROM jsonb_array_elements(v_manifest) AS e(item)),
    'client manifest leaked storage pointers or wrong kind/content type';
  ASSERT (SELECT array_agg((e.item->>'sizeBytes')::bigint ORDER BY (e.item->>'position')::int)
          FROM jsonb_array_elements(v_manifest) AS e(item)) = ARRAY[1000, 2000, 3000]::bigint[],
    'manifest sizeBytes must come from project_documents before recording';
  ASSERT (SELECT array_agg(e.item->>'sha256' ORDER BY (e.item->>'position')::int)
          FROM jsonb_array_elements(v_manifest) AS e(item))
       = ARRAY[repeat('a', 64), repeat('a', 64), repeat('b', 64)],
    'manifest checksums are not the frozen print checksums';
  ASSERT v_envelope::text NOT LIKE '%plans/a10%', 'storage path reached the client';

  ASSERT v_envelope->'editions'->1 = jsonb_build_object(
    'decisionId', v_missing, 'status', 'not_found',
    'review', NULL, 'attachments', NULL, 'editionFigures', NULL),
    'nonexistent id is not a bare not_found';
  ASSERT v_envelope->'editions'->2->>'status' = 'ok'
     AND v_envelope->'editions'->2->'attachments' = 'null'::jsonb,
    'mismatched plan set must be ok with attachments null';

  v_single := public.get_project_decision_edition(v_a1);
  ASSERT v_single->>'contract' = 'shared_direction_v1'
     AND v_single ? 'servedAt'
     AND (v_single - 'contract' - 'servedAt') = v_item,
    'wrapper is not the batch item plus contract and servedAt';
END;
$$;

-- ── Spec-book and budget editions (§C.3 A1, A3) ───────────────────────────────────
DO $$
DECLARE
  v_spec uuid := pg_temp.nf('S1');
  v_budget uuid := pg_temp.nf('G1');
  v_spec_frozen nf_frozen%ROWTYPE;
  v_budget_frozen nf_frozen%ROWTYPE;
  v_envelope jsonb;
  v_item jsonb;
BEGIN
  SELECT * INTO v_spec_frozen FROM nf_frozen WHERE decision_id = v_spec;
  SELECT * INTO v_budget_frozen FROM nf_frozen WHERE decision_id = v_budget;
  ASSERT v_spec_frozen.source_kind = 'spec_book_artifact'
     AND v_spec_frozen.artifact_hash = repeat('5', 64)
     AND v_budget_frozen.source_kind = 'budget_version',
    'fixture: S1/G1 artifacts are not the spec book and the budget';

  v_envelope := public.get_project_decision_editions(jsonb_build_array(
    jsonb_build_object('decisionId', v_spec),
    jsonb_build_object('decisionId', v_budget)));

  v_item := v_envelope->'editions'->0;
  ASSERT v_item->>'status' = 'ok'
     AND v_item->'review' = public.get_project_decision_review(v_spec)
     AND v_item->'editionFigures' = 'null'::jsonb,
    format('spec-book edition is not ok with null editionFigures: %s', v_item);
  ASSERT v_item->'attachments' = jsonb_build_array(jsonb_build_object(
      'attachmentId', 'c6705400-0000-4000-8000-000000000001',
      'kind', 'spec_book_pdf',
      'position', 1,
      'label', v_spec_frozen.artifact_title,
      'sha256', v_spec_frozen.artifact_hash,
      'sizeBytes', 4096,
      'contentType', 'application/pdf')),
    format('spec-book manifest wrong: %s', v_item->'attachments');
  ASSERT v_spec_frozen.artifact_title = 'Edition specification book',
    format('spec-book label is not the book title: %s', v_spec_frozen.artifact_title);

  v_item := v_envelope->'editions'->1;
  ASSERT v_item->>'status' = 'ok'
     AND v_item->'review' = public.get_project_decision_review(v_budget)
     AND v_item->'attachments' = '[]'::jsonb,
    format('budget edition is not ok with an empty manifest: %s', v_item);
  ASSERT v_item->'editionFigures' = jsonb_build_object(
      'checkpointCode', 'B-001',
      'publishedAt', v_budget_frozen.source_snapshot->'publishedAt',
      'lowTotalCents', 900000,
      'targetTotalCents', 1000000,
      'highTotalCents', 1200000)
     AND jsonb_typeof(v_item->'editionFigures'->'publishedAt') = 'string',
    format('budget editionFigures wrong: %s', v_item->'editionFigures');

  ASSERT v_envelope::text NOT LIKE '%specs/nf-spec%', 'spec-book storage path reached the client';
END;
$$;
RESET ROLE;

-- ── unauthorized, bad batches ─────────────────────────────────────────────────────
SELECT pg_temp.nf_assume(NULL);
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_envelope jsonb;
  v_raised boolean;
BEGIN
  v_envelope := public.get_project_decision_editions(jsonb_build_array(
    jsonb_build_object('decisionId', pg_temp.nf('A1'),
      'heldAuthorityRevision', (SELECT authority_revision FROM nf_proof),
      'heldArtifactChecksum', (SELECT artifact_hash FROM nf_proof)),
    jsonb_build_object('decisionId', 'c670dead-0000-4000-8000-000000000002')));
  ASSERT (SELECT bool_and(e.item->>'status' = 'unauthorized'
                          AND e.item->'review' = 'null'::jsonb)
          FROM jsonb_array_elements(v_envelope->'editions') AS e(item))
     AND jsonb_array_length(v_envelope->'editions') = 2,
    'a caller with no subject must get unauthorized for every item';
  ASSERT public.get_project_decision_edition(pg_temp.nf('A1'))->>'status' = 'unauthorized',
    'wrapper without a subject is not unauthorized';

  -- A malformed item does not fail the batch without a subject either.
  v_envelope := public.get_project_decision_editions(jsonb_build_array(
    jsonb_build_object('decisionId', 'not-a-uuid'),
    jsonb_build_object('decisionId', pg_temp.nf('A1'))));
  ASSERT v_envelope->'editions'->0->>'status' = 'not_found'
     AND v_envelope->'editions'->1->>'status' = 'unauthorized',
    format('malformed item without a subject answered wrong: %s', v_envelope);
END;
$$;
RESET ROLE;

SELECT pg_temp.nf_assume('c6700000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_bad jsonb;
  v_raised boolean;
  v_envelope jsonb;
BEGIN
  FOREACH v_bad IN ARRAY ARRAY[
    '[]'::jsonb,
    '{"decisionId": "c670dead-0000-4000-8000-000000000003"}'::jsonb,
    '[1]'::jsonb,
    (SELECT jsonb_agg(jsonb_build_object('decisionId', gen_random_uuid()))
     FROM generate_series(1, 201))
  ] LOOP
    v_raised := false;
    BEGIN
      PERFORM public.get_project_decision_editions(v_bad);
    EXCEPTION WHEN invalid_parameter_value THEN
      v_raised := true;
    END;
    ASSERT v_raised, format('batch of %s items was not refused',
      CASE WHEN jsonb_typeof(v_bad) = 'array' THEN jsonb_array_length(v_bad)::text ELSE 'non-array' END);
  END LOOP;

  -- 200 is the ceiling, not an error.
  ASSERT jsonb_array_length(public.get_project_decision_editions(
    (SELECT jsonb_agg(jsonb_build_object('decisionId', gen_random_uuid()))
     FROM generate_series(1, 200)))->'editions') = 200,
    '200 held items must be answered';

  -- One malformed item among valid ones answers not_found for itself only: a
  -- non-UUID decisionId, and a readable decision held with a revision that is a
  -- fraction, a word, or out of integer range. Uppercase UUIDs still parse.
  v_envelope := public.get_project_decision_editions(jsonb_build_array(
    jsonb_build_object('decisionId', pg_temp.nf('A1')),
    jsonb_build_object('decisionId', 'not-a-uuid'),
    jsonb_build_object('decisionId', pg_temp.nf('A2'), 'heldAuthorityRevision', 1.5),
    jsonb_build_object('decisionId', pg_temp.nf('A3'), 'heldAuthorityRevision', 'two'),
    jsonb_build_object('decisionId', pg_temp.nf('A4'), 'heldAuthorityRevision', 99999999999),
    jsonb_build_object('decisionId', upper(pg_temp.nf('A5')::text),
      'heldAuthorityRevision', 1)));
  ASSERT (SELECT array_agg(e.item->>'status' ORDER BY e.ordinality)
          FROM jsonb_array_elements(v_envelope->'editions') WITH ORDINALITY AS e(item, ordinality))
       = ARRAY['ok', 'not_found', 'not_found', 'not_found', 'not_found', 'ok'],
    format('malformed items were not answered per item: %s', v_envelope);
  ASSERT v_envelope->'editions'->1 = jsonb_build_object(
      'decisionId', 'not-a-uuid', 'status', 'not_found',
      'review', NULL, 'attachments', NULL, 'editionFigures', NULL),
    format('malformed decisionId is not a bare not_found echoing it: %s',
      v_envelope->'editions'->1);
  ASSERT v_envelope->'editions'->2->>'decisionId' = pg_temp.nf('A2')::text
     AND v_envelope->'editions'->2->'review' = 'null'::jsonb
     AND v_envelope->'editions'->5->>'decisionId' = pg_temp.nf('A5')::text,
    format('per-item answers echo the wrong decisionId: %s', v_envelope);
END;
$$;
RESET ROLE;

-- ── Never a reader: not_found without a proof; a matching proof → revoked ─────────
SELECT pg_temp.nf_assume('c6700000-0000-4000-8000-000000000005');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_a1 uuid := pg_temp.nf('A1');
  v_rev integer := (SELECT authority_revision FROM nf_proof);
  v_hash text := (SELECT artifact_hash FROM nf_proof);
BEGIN
  ASSERT public.get_project_decision_edition(v_a1)->>'status' = 'not_found',
    'stranger without proof must be not_found';
  ASSERT public.get_project_decision_edition(v_a1, v_rev, repeat('f', 64))->>'status' = 'not_found',
    'wrong checksum proof must be not_found';
  ASSERT public.get_project_decision_edition(v_a1, v_rev + 1, v_hash)->>'status' = 'not_found',
    'wrong revision proof must be not_found';
  ASSERT public.get_project_decision_edition(v_a1, NULL, v_hash)->>'status' = 'not_found'
     AND public.get_project_decision_edition(v_a1, v_rev, NULL)->>'status' = 'not_found',
    'half a proof must be not_found';
  -- Accepted residual (§C.5): possession of UUID + checksum confirms existence only.
  ASSERT public.get_project_decision_edition(v_a1, v_rev, v_hash)->>'status' = 'revoked',
    'a matching proof from a non-reader must be revoked';
  ASSERT public.get_project_decision_edition(
           'c670dead-0000-4000-8000-000000000004', v_rev, v_hash)->>'status' = 'not_found',
    'a proof for a nonexistent id must be not_found';
END;
$$;

-- Timing regression guard (§C.3.2, ruling J): identical bodies for a nonexistent and an
-- existing-denied id; median ratio under 3 over 50 runs each. A guard, not a proof.
DO $$
DECLARE
  v_a1 uuid := pg_temp.nf('A1');
  v_missing uuid := 'c670dead-0000-4000-8000-000000000005';
  v_denied jsonb := public.get_project_decision_edition(v_a1);
  v_absent jsonb := public.get_project_decision_edition(v_missing);
  v_start timestamptz;
  v_denied_ms double precision[] := '{}';
  v_absent_ms double precision[] := '{}';
  v_denied_median double precision;
  v_absent_median double precision;
  i integer;
BEGIN
  ASSERT (v_denied - 'decisionId' - 'servedAt') = (v_absent - 'decisionId' - 'servedAt'),
    format('negative bodies differ: %s vs %s', v_denied, v_absent);

  FOR i IN 1..50 LOOP
    v_start := clock_timestamp();
    PERFORM public.get_project_decision_edition(v_a1);
    v_denied_ms := v_denied_ms || extract(epoch FROM clock_timestamp() - v_start) * 1000;
    v_start := clock_timestamp();
    PERFORM public.get_project_decision_edition(v_missing);
    v_absent_ms := v_absent_ms || extract(epoch FROM clock_timestamp() - v_start) * 1000;
  END LOOP;
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY x) INTO v_denied_median FROM unnest(v_denied_ms) AS x;
  SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY x) INTO v_absent_median FROM unnest(v_absent_ms) AS x;
  ASSERT greatest(v_denied_median, v_absent_median)
         < 3 * greatest(least(v_denied_median, v_absent_median), 0.001),
    format('negative-path median ratio regressed: denied %s ms, absent %s ms',
           v_denied_median, v_absent_median);
END;
$$;
RESET ROLE;

-- ── §C.4 case 1: the frozen lead keeps ok after the project lead is reassigned ────
SELECT pg_temp.nf_assume('c6700000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT public.set_document_client('project', 'c6703000-0000-4000-8000-000000000001',
  'c6700000-0000-4000-8000-000000000004');
DO $$
DECLARE
  v_authority public.project_decision_authorities%ROWTYPE;
BEGIN
  SELECT * INTO v_authority FROM public.project_decision_authorities
  WHERE project_id = 'c6703000-0000-4000-8000-000000000001';
  IF v_authority.decision_lead_id IS DISTINCT FROM 'c6700000-0000-4000-8000-000000000004' THEN
    PERFORM public.set_project_decision_authority(
      'c6703000-0000-4000-8000-000000000001', 'c6700000-0000-4000-8000-000000000004',
      NULL, v_authority.revision);
  END IF;
END;
$$;
RESET ROLE;

DO $$
BEGIN
  ASSERT (SELECT decision_lead_id = 'c6700000-0000-4000-8000-000000000004' AND revision > 1
          FROM public.project_decision_authorities
          WHERE project_id = 'c6703000-0000-4000-8000-000000000001'),
    'fixture: project lead was not reassigned';
END;
$$;

SELECT pg_temp.nf_assume('c6700000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT public.get_project_decision_edition(pg_temp.nf('A1'))->>'status' = 'ok',
    'frozen lead lost ok after project-lead reassignment';
END;
$$;
RESET ROLE;
SELECT pg_temp.nf_assume('c6700000-0000-4000-8000-000000000004');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT public.get_project_decision_edition(pg_temp.nf('A1'))->>'status' = 'not_found',
    'new project lead inherited a frozen edition';
END;
$$;
RESET ROLE;

-- ── §C.4 case 3: a peer co-member reads until deactivated, then proves → revoked ──
SELECT pg_temp.nf_assume('c6700000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT public.get_project_decision_edition(pg_temp.nf('A1'))->>'status' = 'ok',
    'active peer co-member must read the edition';
END;
$$;
RESET ROLE;

SELECT pg_temp.nf_assume(NULL);
SET LOCAL ROLE service_role;
UPDATE public.organization_members SET status = 'removed'
WHERE id = 'c6701100-0000-4000-8000-000000000002';
RESET ROLE;

SELECT pg_temp.nf_assume('c6700000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_a1 uuid := pg_temp.nf('A1');
  v_rev integer := (SELECT authority_revision FROM nf_proof);
  v_hash text := (SELECT artifact_hash FROM nf_proof);
BEGIN
  ASSERT public.get_project_decision_edition(v_a1, v_rev, v_hash)->>'status' = 'revoked',
    'deactivated peer with a correct proof must be revoked';
  ASSERT public.get_project_decision_edition(v_a1)->>'status' = 'not_found',
    'deactivated peer without a proof must be not_found';
  ASSERT public.get_project_decision_edition(v_a1, v_rev, repeat('0', 64))->>'status' = 'not_found',
    'deactivated peer with a wrong proof must be not_found';
END;
$$;
RESET ROLE;

-- ── §C.4 case 2: the decision's designer keeps ok after leaving and deactivation ──
SELECT pg_temp.nf_assume(NULL);
SET LOCAL ROLE service_role;
UPDATE public.organization_members SET status = 'removed'
WHERE id = 'c6701100-0000-4000-8000-000000000001';
RESET ROLE;

SELECT pg_temp.nf_assume('c6700000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT public.get_project_decision_edition(pg_temp.nf('A1'))->>'status' = 'ok',
    'designer lost ok after her own membership was deactivated';
END;
$$;
RESET ROLE;

SELECT pg_temp.nf_assume(NULL);
UPDATE public.organizations SET status = 'deactivated'
WHERE id = 'c6701000-0000-4000-8000-000000000001';

SELECT pg_temp.nf_assume('c6700000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT public.get_project_decision_edition(pg_temp.nf('A1'))->>'status' = 'ok',
    'designer lost ok after the studio was deactivated';
END;
$$;
RESET ROLE;

-- ── Recorder, resolver, path CHECK, immutability ──────────────────────────────────
INSERT INTO nf_ids (label, id)
SELECT 'att' || (e.item->>'position'), (e.item->>'attachmentId')::uuid
FROM jsonb_array_elements(
  app_private.project_approval_edition_manifest(pg_temp.nf('A1'), true)) AS e(item);
INSERT INTO nf_ids (label, id)
SELECT 'a6att', entry.attachment_id
FROM app_private.project_approval_edition_attachment_rows(pg_temp.nf('A6')) AS entry;
INSERT INTO nf_ids (label, id) VALUES
  ('try1', gen_random_uuid()), ('try2', gen_random_uuid()),
  ('try3', gen_random_uuid()), ('try4', gen_random_uuid()),
  ('try5', gen_random_uuid()), ('try6', gen_random_uuid()),
  ('try7', gen_random_uuid()),
  ('specatt', 'c6705400-0000-4000-8000-000000000001');

CREATE OR REPLACE FUNCTION pg_temp.nf_path(
  p_att text, p_sha text, p_try text, p_edition text DEFAULT 'A1'
)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT pg_temp.nf(p_edition) || '/' || pg_temp.nf(p_att) || '/' || p_sha || '/' || pg_temp.nf(p_try)
$$;
GRANT EXECUTE ON FUNCTION pg_temp.nf_path(text, text, text, text) TO PUBLIC;

-- Each stored copy carries the metadata the Storage API writes: its size and mimetype.
INSERT INTO storage.objects (bucket_id, name, metadata)
VALUES
  ('project-approval-editions', pg_temp.nf_path('att1', repeat('a', 64), 'try1'),
   '{"size": 1000, "mimetype": "application/pdf"}'),
  ('project-approval-editions', pg_temp.nf_path('att1', repeat('a', 64), 'try2'),
   '{"size": 1000, "mimetype": "application/pdf"}'),
  ('project-approval-editions', pg_temp.nf_path('att2', repeat('a', 64), 'try3'),
   '{"size": 2000, "mimetype": "application/pdf"}'),
  ('project-approval-editions', pg_temp.nf_path('att1', repeat('b', 64), 'try4'),
   '{"size": 1000, "mimetype": "application/pdf"}'),
  ('project-approval-editions', pg_temp.nf_path('a6att', repeat('a', 64), 'try5', 'A6'),
   '{"size": 1000, "mimetype": "application/pdf"}'),
  ('project-approval-editions', pg_temp.nf_path('specatt', repeat('5', 64), 'try6', 'S1'),
   '{"size": 4096, "mimetype": "application/pdf"}'),
  ('project-approval-editions', pg_temp.nf_path('specatt', repeat('5', 64), 'try7', 'S1'),
   '{"size": 4096, "mimetype": "image/png"}');

-- authenticated is denied on the public recorder and the resolver.
SELECT pg_temp.nf_assume('c6700000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_raised boolean := false;
BEGIN
  BEGIN
    PERFORM public.record_project_approval_edition_object(
      pg_temp.nf('A1'), pg_temp.nf('att1'), repeat('a', 64), 1000, 'application/pdf',
      pg_temp.nf_path('att1', repeat('a', 64), 'try1'));
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'authenticated reached the public recorder';
  v_raised := false;
  BEGIN
    PERFORM public.project_approval_attachment_objects(pg_temp.nf('A1'));
  EXCEPTION WHEN insufficient_privilege THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'authenticated reached the attachment objects resolver';
END;
$$;
RESET ROLE;

SELECT pg_temp.nf_assume(NULL, 'service_role');
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_a1 uuid := pg_temp.nf('A1');
  v_objects jsonb;
  v_raised boolean;
BEGIN
  v_objects := public.project_approval_attachment_objects(v_a1);
  ASSERT jsonb_array_length(v_objects) = 3
     AND (SELECT bool_and(NOT (e.item->>'recorded')::boolean
                          AND e.item->'objectPath' = 'null'::jsonb
                          AND e.item->'source'->>'bucket' = 'project-documents'
                          AND e.item->'source'->>'path' LIKE 'c6703000-0000-4000-8000-000000000001/plans/a10%.pdf')
          FROM jsonb_array_elements(v_objects) AS e(item)),
    format('unrecorded resolver entries wrong: %s', v_objects);

  -- Checksum refusal: bytes whose sha256 is not the frozen print checksum.
  v_raised := false;
  BEGIN
    PERFORM public.record_project_approval_edition_object(
      v_a1, pg_temp.nf('att1'), repeat('b', 64), 1000, 'application/pdf',
      pg_temp.nf_path('att1', repeat('b', 64), 'try4'));
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'recorder accepted a checksum other than the frozen one';

  -- Missing-object refusal.
  v_raised := false;
  BEGIN
    PERFORM public.record_project_approval_edition_object(
      v_a1, pg_temp.nf('att3'), repeat('b', 64), 3000, 'application/pdf',
      v_a1 || '/' || pg_temp.nf('att3') || '/' || repeat('b', 64) || '/' || gen_random_uuid());
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'recorder accepted a path with no stored object';

  -- An attachment that is not part of this edition.
  v_raised := false;
  BEGIN
    PERFORM public.record_project_approval_edition_object(
      v_a1, gen_random_uuid(), repeat('a', 64), 1000, 'application/pdf',
      pg_temp.nf_path('att1', repeat('a', 64), 'try1'));
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'recorder accepted a foreign attachment';

  -- Size and content type must be the stored object's metadata (1000, application/pdf).
  v_raised := false;
  BEGIN
    PERFORM public.record_project_approval_edition_object(
      v_a1, pg_temp.nf('att1'), repeat('a', 64), 999, 'application/pdf',
      pg_temp.nf_path('att1', repeat('a', 64), 'try1'));
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'recorder accepted a size other than the stored object''s';
  v_raised := false;
  BEGIN
    PERFORM public.record_project_approval_edition_object(
      v_a1, pg_temp.nf('att1'), repeat('a', 64), 1000, 'image/png',
      pg_temp.nf_path('att1', repeat('a', 64), 'try1'));
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'recorder accepted a content type other than the stored object''s';

  -- A6's set fails the plan-set assert (manifest NULL): nothing is recorded for it,
  -- although checksum, object and metadata all match.
  ASSERT public.project_approval_attachment_objects(pg_temp.nf('A6')) IS NULL,
    'fixture: A6 manifest is not NULL';
  v_raised := false;
  BEGIN
    PERFORM public.record_project_approval_edition_object(
      pg_temp.nf('A6'), pg_temp.nf('a6att'), repeat('a', 64), 1000, 'application/pdf',
      pg_temp.nf_path('a6att', repeat('a', 64), 'try5', 'A6'));
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'recorder accepted an attachment of an unservable set';

  -- First writer wins; re-recording the same path is idempotent; a second attempt's
  -- path is not recorded and the first row is untouched.
  ASSERT public.record_project_approval_edition_object(
      v_a1, pg_temp.nf('att1'), repeat('a', 64), 1000, 'application/pdf',
      pg_temp.nf_path('att1', repeat('a', 64), 'try1')) = true,
    'first attempt was not recorded';
  ASSERT public.record_project_approval_edition_object(
      v_a1, pg_temp.nf('att1'), repeat('a', 64), 1000, 'application/pdf',
      pg_temp.nf_path('att1', repeat('a', 64), 'try1')) = true,
    'idempotent re-record of the recorded path did not report true';
  ASSERT public.record_project_approval_edition_object(
      v_a1, pg_temp.nf('att1'), repeat('a', 64), 1000, 'application/pdf',
      pg_temp.nf_path('att1', repeat('a', 64), 'try2')) = false,
    'a losing attempt was reported as recorded';

  -- N3: A-102 shares A-101's checksum and gets its own row at its own path.
  ASSERT public.record_project_approval_edition_object(
      v_a1, pg_temp.nf('att2'), repeat('a', 64), 2000, 'application/pdf',
      pg_temp.nf_path('att2', repeat('a', 64), 'try3')) = true,
    'same-checksum second attachment was not recorded';

  -- Spec book: the frozen artifact_hash is the checksum, and only a PDF is recorded.
  v_raised := false;
  BEGIN
    PERFORM public.record_project_approval_edition_object(
      pg_temp.nf('S1'), pg_temp.nf('specatt'), repeat('6', 64), 4096, 'application/pdf',
      pg_temp.nf_path('specatt', repeat('5', 64), 'try6', 'S1'));
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'recorder accepted a spec book checksum other than artifact_hash';
  v_raised := false;
  BEGIN
    PERFORM public.record_project_approval_edition_object(
      pg_temp.nf('S1'), pg_temp.nf('specatt'), repeat('5', 64), 4096, 'image/png',
      pg_temp.nf_path('specatt', repeat('5', 64), 'try7', 'S1'));
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'recorder accepted a spec book that is not application/pdf';
  ASSERT public.record_project_approval_edition_object(
      pg_temp.nf('S1'), pg_temp.nf('specatt'), repeat('5', 64), 4096, 'application/pdf',
      pg_temp.nf_path('specatt', repeat('5', 64), 'try6', 'S1')) = true,
    'spec-book copy was not recorded';
  v_objects := public.project_approval_attachment_objects(pg_temp.nf('S1'));
  ASSERT jsonb_array_length(v_objects) = 1
     AND (v_objects->0->>'recorded')::boolean
     AND v_objects->0->>'objectPath' = pg_temp.nf_path('specatt', repeat('5', 64), 'try6', 'S1')
     AND v_objects->0->>'kind' = 'spec_book_pdf'
     AND (v_objects->0->>'sizeBytes')::bigint = 4096,
    format('spec-book resolver after recording is wrong: %s', v_objects);

  v_objects := public.project_approval_attachment_objects(v_a1);
  ASSERT (v_objects->0->>'recorded')::boolean
     AND v_objects->0->>'objectPath' = pg_temp.nf_path('att1', repeat('a', 64), 'try1')
     AND v_objects->0->'source' = 'null'::jsonb
     AND (v_objects->0->>'sizeBytes')::bigint = 1000
     AND (v_objects->1->>'recorded')::boolean
     AND v_objects->1->>'objectPath' = pg_temp.nf_path('att2', repeat('a', 64), 'try3')
     AND NOT (v_objects->2->>'recorded')::boolean
     AND v_objects->2->'source'->>'bucket' = 'project-documents',
    format('resolver after recording is wrong: %s', v_objects);
END;
$$;
RESET ROLE;

DO $$
DECLARE
  v_a1 uuid := pg_temp.nf('A1');
  v_bad text;
  v_raised boolean;
BEGIN
  ASSERT (SELECT count(*) FROM public.project_approval_edition_objects WHERE decision_id = v_a1) = 2
     AND (SELECT count(DISTINCT object_path) FROM public.project_approval_edition_objects
          WHERE decision_id = v_a1 AND sha256 = repeat('a', 64)) = 2
     AND (SELECT object_path FROM public.project_approval_edition_objects
          WHERE decision_id = v_a1 AND attachment_id = pg_temp.nf('att1'))
         = pg_temp.nf_path('att1', repeat('a', 64), 'try1'),
    'recorded rows are not exactly the two first-writer rows';
  ASSERT (SELECT array_agg(size_bytes::text || ' ' || content_type ORDER BY size_bytes)
          FROM public.project_approval_edition_objects WHERE decision_id = v_a1)
       = ARRAY['1000 application/pdf', '2000 application/pdf'],
    'recorded rows do not carry the stored objects'' size and type';
  ASSERT NOT EXISTS (SELECT 1 FROM public.project_approval_edition_objects
                     WHERE decision_id = pg_temp.nf('A6')),
    'a row was recorded for the unservable A6 set';

  -- Path CHECK: exactly one UUIDv4 attempt segment.
  FOREACH v_bad IN ARRAY ARRAY[
    v_a1 || '/' || pg_temp.nf('att3') || '/' || repeat('b', 64) || '/',
    v_a1 || '/' || pg_temp.nf('att3') || '/' || repeat('b', 64) || '/not-a-uuid',
    v_a1 || '/' || pg_temp.nf('att3') || '/' || repeat('b', 64) || '/' || gen_random_uuid() || '/extra',
    v_a1 || '/' || pg_temp.nf('att3') || '/' || repeat('b', 64) || '/c6700000-0000-1000-8000-000000000001',
    v_a1 || '/' || pg_temp.nf('att3') || '/' || repeat('c', 64) || '/' || gen_random_uuid()
  ] LOOP
    v_raised := false;
    BEGIN
      INSERT INTO public.project_approval_edition_objects (
        decision_id, attachment_id, object_path, sha256, size_bytes, content_type
      ) VALUES (v_a1, pg_temp.nf('att3'), v_bad, repeat('b', 64), 3000, 'application/pdf');
    EXCEPTION WHEN check_violation THEN
      v_raised := true;
    END;
    ASSERT v_raised, format('path CHECK accepted %s', v_bad);
  END LOOP;

  -- Immutability.
  v_raised := false;
  BEGIN
    UPDATE public.project_approval_edition_objects SET size_bytes = 1
    WHERE decision_id = v_a1;
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'recorded edition objects accepted an UPDATE';
  v_raised := false;
  BEGIN
    DELETE FROM public.project_approval_edition_objects WHERE decision_id = v_a1;
  EXCEPTION WHEN check_violation THEN
    v_raised := true;
  END;
  ASSERT v_raised, 'recorded edition objects accepted a DELETE';
END;
$$;

-- The client manifest now reports the recorded size and still no storage path.
SELECT pg_temp.nf_assume('c6700000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_item jsonb := public.get_project_decision_edition(pg_temp.nf('A1'));
BEGIN
  ASSERT v_item->>'status' = 'ok'
     AND (v_item->'attachments'->0->>'sizeBytes')::bigint = 1000
     AND (v_item->'attachments'->1->>'sizeBytes')::bigint = 2000
     AND (v_item->'attachments'->2->>'sizeBytes')::bigint = 3000
     AND v_item::text NOT LIKE '%' || pg_temp.nf('try1') || '%',
    format('client manifest after recording is wrong: %s', v_item);
END;
$$;
RESET ROLE;

ROLLBACK;
