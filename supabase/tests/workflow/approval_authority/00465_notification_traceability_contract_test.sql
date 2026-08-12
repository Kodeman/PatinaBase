-- Fixture-backed Stage-2 notification/reminder traceability contract (00465).
\set ON_ERROR_STOP on

BEGIN;

DO $preflight$
DECLARE
  v_missing text[];
BEGIN
  SELECT array_agg(label ORDER BY label)
  INTO v_missing
  FROM (VALUES
    ('service reminder delivery stamp',
      to_regprocedure(
        'public.stamp_project_approval_reminder_delivery(uuid,uuid)'
      ) IS NOT NULL),
    ('artifact candidate projection',
      to_regprocedure(
        'public.get_project_approval_artifact_candidates(uuid)'
      ) IS NOT NULL),
    ('sanitized decision review projection',
      to_regprocedure('public.get_project_decision_reviews(uuid)') IS NOT NULL),
    ('draft withdrawal lifecycle',
      to_regprocedure(
        'public.withdraw_project_approval_decision(uuid,timestamptz,text,text)'
      ) IS NOT NULL)
  ) AS required(label, present)
  WHERE NOT present;

  IF COALESCE(cardinality(v_missing), 0) > 0 THEN
    RAISE EXCEPTION '00465 notification traceability is not installed: %',
      array_to_string(v_missing, ', ')
      USING ERRCODE = '55000';
  END IF;
END
$preflight$;

DO $structure$
DECLARE
  v_enqueue text;
  v_service_stamp text;
  v_manual_stamp text;
  v_projection text;
  v_withdraw text;
  v_transition_guard text;
  v_candidates text;
BEGIN
  SELECT pg_get_functiondef(
    'public._enqueue_decision_notification(uuid,decision_notification_kind)'::regprocedure
  ) INTO v_enqueue;
  SELECT pg_get_functiondef(
    'public.stamp_project_approval_reminder_delivery(uuid,uuid)'::regprocedure
  ) INTO v_service_stamp;
  SELECT pg_get_functiondef(
    'public.stamp_client_decision_reminder(uuid)'::regprocedure
  ) INTO v_manual_stamp;
  SELECT pg_get_functiondef(
    'public.get_project_decision_reviews(uuid)'::regprocedure
  ) INTO v_projection;
  SELECT pg_get_functiondef(
    'public.withdraw_project_approval_decision(uuid,timestamptz,text,text)'::regprocedure
  ) INTO v_withdraw;
  SELECT pg_get_functiondef(
    'public.guard_decision_status_transition()'::regprocedure
  ) INTO v_transition_guard;
  SELECT pg_get_functiondef(
    'public.get_project_approval_artifact_candidates(uuid)'::regprocedure
  ) INTO v_candidates;

  ASSERT v_enqueue LIKE '%approval_contract%'
     AND v_enqueue LIKE '%project_decision_authority_snapshots%'
     AND v_enqueue LIKE '%project_approval_artifacts%'
     AND v_enqueue LIKE '%decision_lead_id%'
     AND v_enqueue LIKE '%v_rearm_existing%service_role%'
     AND v_enqueue LIKE '%THEN NULL ELSE decision_notifications.read_at END%'
     AND v_enqueue LIKE
       '%THEN EXCLUDED.created_at ELSE decision_notifications.created_at END%',
    'Stage-2 client notifications must resolve frozen authority and artifact';
  ASSERT v_service_stamp LIKE '%service_role%'
     AND v_service_stamp LIKE '%decision_lead_id%'
     AND v_service_stamp LIKE '%project_approval_artifacts%'
     AND v_service_stamp LIKE '%app.project_approval_decision_write_id%'
     AND v_service_stamp LIKE '%app.client_decision_write_id%',
    'service delivery stamp must be exact, evidence-bound, and guard-compatible';
  ASSERT v_manual_stamp LIKE '%artifactKind%'
     AND v_manual_stamp LIKE '%artifactVersion%'
     AND v_manual_stamp LIKE '%artifactChecksum%'
     AND v_manual_stamp LIKE '%artifactTitle%',
    'manual reminder metadata must cite immutable artifact evidence';
  ASSERT v_projection LIKE '%authorityRevision%'
     AND v_projection NOT LIKE '%decisionLeadId%'
     AND v_projection NOT LIKE '%requiredCoapproverId%',
    'sanitized projection must expose revision without reviewer identities';
  ASSERT v_withdraw LIKE '%NOT IN (''draft'', ''pending'')%'
     AND v_withdraw LIKE '%project_approval_action_receipts%'
     AND v_withdraw LIKE '%app.project_approval_withdraw_decision_id%'
     AND v_withdraw NOT LIKE '%_enqueue_decision_notification%'
     AND v_withdraw NOT LIKE '%invoke_edge_function%',
    'draft/pending withdrawal must be evidenced without external communication';
  ASSERT v_transition_guard LIKE '%current_user = ''postgres''%'
     AND v_transition_guard LIKE '%app.project_approval_withdraw_decision_id%'
     AND v_transition_guard LIKE '%OLD.id::text%',
    'draft withdrawal exception must be postgres-owned and decision-scoped';
  ASSERT v_candidates LIKE '%_resolve_project_approval_artifact%'
     AND v_candidates LIKE '%is_design_studio_comember%'
     AND v_candidates NOT LIKE '%source_snapshot%',
    'candidate projection must reuse immutable eligibility without private data';

  ASSERT has_function_privilege(
    'service_role',
    'public.stamp_project_approval_reminder_delivery(uuid,uuid)', 'EXECUTE'
  ) AND NOT has_function_privilege(
    'authenticated',
    'public.stamp_project_approval_reminder_delivery(uuid,uuid)', 'EXECUTE'
  ), 'delivery stamp must be service-only';
  ASSERT has_function_privilege(
    'authenticated',
    'public.get_project_approval_artifact_candidates(uuid)', 'EXECUTE'
  ) AND NOT has_function_privilege(
    'service_role',
    'public.get_project_approval_artifact_candidates(uuid)', 'EXECUTE'
  ), 'artifact candidates must be authenticated studio-only';
  ASSERT NOT has_function_privilege(
    'authenticated', 'public.guard_decision_status_transition()', 'EXECUTE'
  ) AND NOT has_function_privilege(
    'service_role', 'public.guard_decision_status_transition()', 'EXECUTE'
  ), 'transition trigger helper must not be a public RPC';

  ASSERT (
    SELECT proargnames = ARRAY['p_decision_id', 'p_decision_lead_id']
    FROM pg_proc
    WHERE oid =
      'public.stamp_project_approval_reminder_delivery(uuid,uuid)'::regprocedure
  ), 'service reminder stamp JSON argument names are public API';
  ASSERT (
    SELECT proargnames = ARRAY['p_project_id']
    FROM pg_proc
    WHERE oid =
      'public.get_project_approval_artifact_candidates(uuid)'::regprocedure
  ), 'artifact candidate JSON argument name is public API';
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

CREATE TEMP TABLE approval_437_results (
  label text PRIMARY KEY,
  payload jsonb NOT NULL
) ON COMMIT DROP;
GRANT SELECT, INSERT, UPDATE ON approval_437_results
  TO authenticated, service_role;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('a4370000-0000-4000-8000-000000000001', 'notify-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4370000-0000-4000-8000-000000000002', 'notify-frozen-lead@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4370000-0000-4000-8000-000000000003', 'notify-other-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4370000-0000-4000-8000-000000000004', 'notify-studio-peer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4370000-0000-4000-8000-000000000005', 'notify-foreign-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4370000-0000-4000-8000-000000000006', 'notify-foreign-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer)
VALUES
  ('a4370000-0000-4000-8000-000000000001', 'notify-designer@test.invalid', 'Notify Designer', true),
  ('a4370000-0000-4000-8000-000000000002', 'notify-frozen-lead@test.invalid', 'Frozen Lead', false),
  ('a4370000-0000-4000-8000-000000000003', 'notify-other-client@test.invalid', 'Mutable Relationship Client', false),
  ('a4370000-0000-4000-8000-000000000004', 'notify-studio-peer@test.invalid', 'Notify Studio Peer', true),
  ('a4370000-0000-4000-8000-000000000005', 'notify-foreign-designer@test.invalid', 'Foreign Designer', true),
  ('a4370000-0000-4000-8000-000000000006', 'notify-foreign-client@test.invalid', 'Foreign Client', false)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('a4371000-0000-4000-8000-000000000001', 'design_studio', 'Notify Studio', 'notify-stage2-a', 'active'),
  ('a4371000-0000-4000-8000-000000000002', 'design_studio', 'Foreign Notify Studio', 'notify-stage2-b', 'active');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
) VALUES
  ('a4371100-0000-4000-8000-000000000001', 'a4370000-0000-4000-8000-000000000001',
   'a4371000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('a4371100-0000-4000-8000-000000000002', 'a4370000-0000-4000-8000-000000000004',
   'a4371000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('a4371100-0000-4000-8000-000000000003', 'a4370000-0000-4000-8000-000000000005',
   'a4371000-0000-4000-8000-000000000002', 'owner', 'active', now());

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
) VALUES
  ('a4372000-0000-4000-8000-000000000001',
   'a4370000-0000-4000-8000-000000000001',
   'a4370000-0000-4000-8000-000000000002', 'Frozen Lead', 'active', 'direct'),
  ('a4372000-0000-4000-8000-000000000002',
   'a4370000-0000-4000-8000-000000000001',
   'a4370000-0000-4000-8000-000000000003', 'Mutable Relationship Client', 'active', 'direct'),
  ('a4372000-0000-4000-8000-000000000003',
   'a4370000-0000-4000-8000-000000000005',
   'a4370000-0000-4000-8000-000000000006', 'Foreign Client', 'active', 'direct');

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, studio_id, status
) VALUES
  ('a4373000-0000-4000-8000-000000000001', 'Notify Project',
   'a4370000-0000-4000-8000-000000000001',
   'a4370000-0000-4000-8000-000000000002',
   'a4370000-0000-4000-8000-000000000001',
   'a4371000-0000-4000-8000-000000000001', 'active'),
  ('a4373000-0000-4000-8000-000000000002', 'Foreign Notify Project',
   'a4370000-0000-4000-8000-000000000005',
   'a4370000-0000-4000-8000-000000000006',
   'a4370000-0000-4000-8000-000000000005',
   'a4371000-0000-4000-8000-000000000002', 'active');

INSERT INTO public.project_phases (
  id, project_id, name, phase_key, status, sort_order
) VALUES
  ('a4373100-0000-4000-8000-000000000001',
   'a4373000-0000-4000-8000-000000000001',
   'Notify design phase', 'design', 'in_progress', 0),
  ('a4373100-0000-4000-8000-000000000002',
   'a4373000-0000-4000-8000-000000000002',
   'Foreign design phase', 'design', 'in_progress', 0);

-- Eligible and ineligible immutable sources for the studio-only candidate API.
INSERT INTO public.plan_issues (
  id, project_id, issue_number, name, idempotency_key, request_hash,
  set_checksum, sheet_count, created_by
) VALUES
  ('a4374000-0000-4000-8000-000000000001',
   'a4373000-0000-4000-8000-000000000001', 1, 'Notify issued set 1',
   'notify-plan-1', repeat('1', 64), repeat('a', 64), 8,
   'a4370000-0000-4000-8000-000000000001'),
  ('a4374000-0000-4000-8000-000000000002',
   'a4373000-0000-4000-8000-000000000001', 2, 'Notify issued set 2',
   'notify-plan-2', repeat('2', 64), repeat('b', 64), 9,
   'a4370000-0000-4000-8000-000000000001'),
  ('a4374000-0000-4000-8000-000000000003',
   'a4373000-0000-4000-8000-000000000001', 3, 'Notify issued set 3',
   'notify-plan-3', repeat('3', 64), repeat('c', 64), 10,
   'a4370000-0000-4000-8000-000000000001'),
  ('a4374000-0000-4000-8000-000000000004',
   'a4373000-0000-4000-8000-000000000002', 1, 'Foreign issued set',
   'notify-plan-foreign', repeat('4', 64), repeat('d', 64), 4,
   'a4370000-0000-4000-8000-000000000005');

INSERT INTO public.spec_book_templates (
  id, template_key, version, studio_id, name, page_grammar,
  audience_profiles, required_field_rules, visibility_rules, created_by
) VALUES (
  'a4374100-0000-4000-8000-000000000001', 'notify.stage2', 1,
  'a4371000-0000-4000-8000-000000000001', 'Notify spec template',
  '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb,
  'a4370000-0000-4000-8000-000000000001'
);
INSERT INTO public.spec_books (
  id, project_id, title, template_id, default_audiences, created_by
) VALUES (
  'a4374200-0000-4000-8000-000000000001',
  'a4373000-0000-4000-8000-000000000001', 'Notify client spec book',
  'a4374100-0000-4000-8000-000000000001', ARRAY['client']::text[],
  'a4370000-0000-4000-8000-000000000001'
);
INSERT INTO public.project_documents (
  id, project_id, title, doc_type, storage_path, status, uploaded_by,
  section_key, client_visible, size_bytes
) VALUES (
  'a4374300-0000-4000-8000-000000000001',
  'a4373000-0000-4000-8000-000000000001', 'Notify client spec PDF',
  'pdf', 'notify/project/spec-client.pdf', 'ready',
  'a4370000-0000-4000-8000-000000000001', 'spec-book', true, 2048
);
INSERT INTO public.spec_book_revisions (
  id, spec_book_id, revision_number, idempotency_key, issue_type, status,
  requested_audiences, template_snapshot, render_snapshot,
  snapshot_checksum, created_by, issued_at
) VALUES
  ('a4374400-0000-4000-8000-000000000001',
   'a4374200-0000-4000-8000-000000000001', 4, 'notify-spec-issued',
   'full', 'issued', ARRAY['client']::text[], '{}'::jsonb,
   '{"clientSafe":true}'::jsonb, repeat('e', 64),
   'a4370000-0000-4000-8000-000000000001', now()),
  ('a4374400-0000-4000-8000-000000000002',
   'a4374200-0000-4000-8000-000000000001', 5, 'notify-spec-pending',
   'full', 'pending', ARRAY['client']::text[], '{}'::jsonb,
   '{"clientSafe":true}'::jsonb, repeat('f', 64),
   'a4370000-0000-4000-8000-000000000001', NULL);
INSERT INTO public.spec_book_artifacts (
  id, revision_id, audience, status, project_document_id, storage_path,
  checksum_sha256, size_bytes, rendered_at
) VALUES
  ('a4374500-0000-4000-8000-000000000001',
   'a4374400-0000-4000-8000-000000000001', 'client', 'ready',
   'a4374300-0000-4000-8000-000000000001',
   'notify/project/spec-client.pdf', repeat('5', 64), 2048, now()),
  ('a4374500-0000-4000-8000-000000000002',
   'a4374400-0000-4000-8000-000000000002', 'client', 'pending',
   NULL, NULL, NULL, NULL, NULL);

SET LOCAL session_replication_role = replica;
INSERT INTO public.project_budget_versions (
  id, project_id, version, status, note, created_by, published_at
) VALUES
  ('a4374600-0000-4000-8000-000000000001',
   'a4373000-0000-4000-8000-000000000001', 2, 'published',
   'INTERNAL vendor and margin text must never leave the resolver',
   'a4370000-0000-4000-8000-000000000001', now()),
  ('a4374600-0000-4000-8000-000000000002',
   'a4373000-0000-4000-8000-000000000001', 3, 'draft',
   'Unpublished working budget',
   'a4370000-0000-4000-8000-000000000001', NULL);
SET LOCAL session_replication_role = origin;
INSERT INTO public.project_budget_checkpoints (
  id, project_id, budget_version_id, checkpoint_code,
  snapshot_fingerprint, published_by
) VALUES (
  'a4374800-0000-4000-8000-000000000001',
  'a4373000-0000-4000-8000-000000000001',
  'a4374600-0000-4000-8000-000000000001', 'B-002',
  public._budget_version_fingerprint(
    'a4374600-0000-4000-8000-000000000001'
  ),
  'a4370000-0000-4000-8000-000000000001'
);

SELECT pg_temp.assume_approval_actor('a4370000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
INSERT INTO approval_437_results(label, payload)
SELECT 'authority', public.set_project_decision_authority(
  'a4373000-0000-4000-8000-000000000001',
  'a4370000-0000-4000-8000-000000000002', NULL, 0
);

INSERT INTO approval_437_results(label, payload)
SELECT source.label, public.create_project_approval_decision(
  'a4373000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'title', source.title,
    'question', 'Approve ' || source.title || '?',
    'context', 'Client-safe notification fixture.',
    'dueAt', (now() + interval '2 days')::text,
    'phaseId', 'a4373100-0000-4000-8000-000000000001',
    'sectionKey', 'project',
    'artifactKind', 'plan_issue',
    'artifactId', source.issue_id,
    'costCentsDelta', 0,
    'scheduleDaysDelta', 0,
    'leadTimeDaysDelta', 0
  ),
  'create-' || source.label
)
FROM (VALUES
  ('notify', 'Frozen recipient approval',
   'a4374000-0000-4000-8000-000000000001'::uuid),
  ('manual', 'Manual reminder approval',
   'a4374000-0000-4000-8000-000000000002'::uuid),
  ('withdraw-draft', 'Mistaken draft approval',
   'a4374000-0000-4000-8000-000000000003'::uuid)
) AS source(label, title, issue_id);

DO $$
DECLARE
  v_candidates jsonb := public.get_project_approval_artifact_candidates(
    'a4373000-0000-4000-8000-000000000001'
  );
  v_text text := v_candidates::text;
BEGIN
  ASSERT jsonb_array_length(v_candidates) = 5,
    'candidate projection did not return 3 plans + ready spec + published budget';
  ASSERT v_candidates @> jsonb_build_array(jsonb_build_object(
    'artifactKind', 'spec_book_artifact',
    'artifactId', 'a4374500-0000-4000-8000-000000000001',
    'artifactVersion', 4,
    'artifactChecksum', repeat('5', 64),
    'artifactTitle', 'Notify client spec book'
  )), 'ready issued client spec artifact was omitted';
  ASSERT v_candidates @> jsonb_build_array(jsonb_build_object(
    'artifactKind', 'budget_version',
    'artifactId', 'a4374600-0000-4000-8000-000000000001',
    'artifactVersion', 2
  )), 'published fingerprinted budget was omitted';
  ASSERT v_text NOT LIKE '%a4374500-0000-4000-8000-000000000002%'
     AND v_text NOT LIKE '%a4374600-0000-4000-8000-000000000002%'
     AND v_text NOT LIKE '%a4374000-0000-4000-8000-000000000004%',
    'unready/draft/cross-project source leaked into candidates';
  ASSERT v_text NOT ILIKE '%storage%'
     AND v_text NOT ILIKE '%snapshot%'
     AND v_text NOT ILIKE '%internal%'
     AND v_text NOT ILIKE '%vendor%'
     AND v_text NOT ILIKE '%totalcents%',
    'candidate projection leaked URL/snapshot/internal budget details';
END;
$$;
RESET ROLE;

-- The frozen lead reads authorityRevision from the sanitized projection and
-- uses it with the matching checksum to confirm both requests.
SELECT pg_temp.assume_approval_actor('a4370000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_reviews jsonb := public.get_project_decision_reviews(
    'a4373000-0000-4000-8000-000000000001'
  );
  v_label text;
  v_item jsonb;
  v_decision_id uuid;
BEGIN
  FOREACH v_label IN ARRAY ARRAY['notify', 'manual'] LOOP
    v_decision_id := (
      SELECT (payload->>'decisionId')::uuid
      FROM approval_437_results WHERE label = v_label
    );
    SELECT value INTO v_item
    FROM jsonb_array_elements(v_reviews) AS review(value)
    WHERE value->>'decisionId' = v_decision_id::text;
    ASSERT (v_item->>'authorityRevision')::integer = 1,
      'frozen lead projection omitted the usable authority revision';
    PERFORM public.confirm_project_decision_review(
      v_decision_id,
      jsonb_build_object(
        'authorityRevision', (v_item->>'authorityRevision')::integer,
        'artifactHash', v_item->>'artifactChecksum',
        'reviewMethod', 'portal_clickthrough'
      ),
      'confirm-' || v_label
    );
  END LOOP;
END;
$$;
RESET ROLE;

-- Reassign the mutable project/client relationship after the authority
-- snapshot. The rows remain reference-coherent, while Stage-2 notification
-- routing must still address the frozen lead rather than the current client.
SET LOCAL session_replication_role = replica;
UPDATE public.projects
SET client_id = 'a4370000-0000-4000-8000-000000000003'
WHERE id = 'a4373000-0000-4000-8000-000000000001';
UPDATE public.client_decisions
SET designer_client_id = 'a4372000-0000-4000-8000-000000000002'
WHERE project_id = 'a4373000-0000-4000-8000-000000000001'
  AND approval_contract = 'project_artifact_v1';
SET LOCAL session_replication_role = origin;

SELECT pg_temp.assume_approval_actor('a4370000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_label text;
  v_published public.client_decisions;
BEGIN
  FOREACH v_label IN ARRAY ARRAY['notify', 'manual'] LOOP
    SELECT * INTO v_published
    FROM public.publish_client_decision((
      SELECT (payload->>'decisionId')::uuid
      FROM approval_437_results WHERE label = v_label
    ));
    UPDATE approval_437_results
    SET payload = payload || jsonb_build_object(
      'publishedUpdatedAt', v_published.updated_at
    )
    WHERE label = v_label;
  END LOOP;
END;
$$;
RESET ROLE;

DO $$
DECLARE
  v_decision_id uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_437_results WHERE label = 'notify'
  );
BEGIN
  ASSERT (
    SELECT notification.user_id =
           'a4370000-0000-4000-8000-000000000002'::uuid
    FROM public.decision_notifications AS notification
    WHERE notification.decision_id = v_decision_id
      AND notification.kind = 'decision_required'
  ), 'required notification did not target the frozen decision lead';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.decision_notifications AS notification
    WHERE notification.decision_id = v_decision_id
      AND notification.user_id =
          'a4370000-0000-4000-8000-000000000003'::uuid
  ), 'mutable relationship client received the Stage-2 required notice';
END;
$$;

-- A digest recipient can read or age the single required row before another
-- authoritative reminder is emitted. Re-enqueue must rearm that same row for
-- the next digest window without minting a duplicate notification.
DO $$
DECLARE
  v_decision_id uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_437_results WHERE label = 'notify'
  );
BEGIN
  UPDATE public.decision_notifications
  SET read_at = now() - interval '2 days',
      created_at = now() - interval '3 days',
      updated_at = now() - interval '3 days'
  WHERE decision_id = v_decision_id
    AND kind = 'decision_required';

  INSERT INTO approval_437_results (label, payload)
  SELECT 'required-notification-before-requeue', jsonb_build_object('id', id)
  FROM public.decision_notifications
  WHERE decision_id = v_decision_id
    AND kind = 'decision_required';
END;
$$;

SELECT pg_temp.assume_approval_actor(NULL, 'service_role');
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_decision_id uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_437_results WHERE label = 'notify'
  );
  v_notification_id uuid;
BEGIN
  SELECT public.notify_decision_required(v_decision_id)
  INTO v_notification_id;
  ASSERT v_notification_id = (
    SELECT (payload->>'id')::uuid
    FROM approval_437_results
    WHERE label = 'required-notification-before-requeue'
  ), 'required notification requeue replaced the authoritative row';
END;
$$;
RESET ROLE;

DO $$
DECLARE
  v_decision_id uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_437_results WHERE label = 'notify'
  );
BEGIN
  ASSERT (
    SELECT count(*) = 1
       AND bool_and(read_at IS NULL)
       AND bool_and(created_at > now() - interval '1 minute')
       AND bool_and(updated_at > now() - interval '1 minute')
       AND bool_and(
         user_id = 'a4370000-0000-4000-8000-000000000002'::uuid
       )
    FROM public.decision_notifications
    WHERE decision_id = v_decision_id
      AND kind = 'decision_required'
  ), 'required notification was not rearmed for frozen-lead digest delivery';
END;
$$;

-- The compatibility wrapper remains studio-callable, but an authenticated
-- author cannot abuse that access to resurrect a notification the lead read.
DO $$
DECLARE
  v_decision_id uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_437_results WHERE label = 'notify'
  );
BEGIN
  UPDATE public.decision_notifications
  SET read_at = now() - interval '1 hour',
      created_at = now() - interval '2 days',
      updated_at = now() - interval '1 hour'
  WHERE decision_id = v_decision_id
    AND kind = 'decision_required';
END;
$$;

SELECT pg_temp.assume_approval_actor('a4370000-0000-4000-8000-000000000004');
SET LOCAL ROLE authenticated;
SELECT public.notify_decision_required((
  SELECT (payload->>'decisionId')::uuid
  FROM approval_437_results WHERE label = 'notify'
));
RESET ROLE;

DO $$
DECLARE
  v_decision_id uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_437_results WHERE label = 'notify'
  );
BEGIN
  ASSERT (
    SELECT count(*) = 1
       AND bool_and(read_at IS NOT NULL)
       AND bool_and(created_at < now() - interval '1 day')
    FROM public.decision_notifications
    WHERE decision_id = v_decision_id
      AND kind = 'decision_required'
  ), 'authenticated compatibility call rearmed a frozen-lead notification';
END;
$$;

-- Direct service DML remains blocked; only the exact frozen-lead stamp works.
SELECT pg_temp.assume_approval_actor(NULL, 'service_role');
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_id uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_437_results WHERE label = 'notify'
  );
  v_direct_denied boolean := false;
  v_wrong_lead_denied boolean := false;
  v_first public.client_decisions;
  v_retry public.client_decisions;
BEGIN
  BEGIN
    UPDATE public.client_decisions SET reminder_sent_at = now() WHERE id = v_id;
  EXCEPTION WHEN OTHERS THEN v_direct_denied := true;
  END;
  BEGIN
    PERFORM public.stamp_project_approval_reminder_delivery(
      v_id, 'a4370000-0000-4000-8000-000000000003'
    );
  EXCEPTION WHEN OTHERS THEN v_wrong_lead_denied := true;
  END;
  SELECT * INTO v_first
  FROM public.stamp_project_approval_reminder_delivery(
    v_id, 'a4370000-0000-4000-8000-000000000002'
  );
  SELECT * INTO v_retry
  FROM public.stamp_project_approval_reminder_delivery(
    v_id, 'a4370000-0000-4000-8000-000000000002'
  );
  ASSERT v_direct_denied, 'service role directly rewrote Stage-2 reminder state';
  ASSERT v_wrong_lead_denied, 'service stamp accepted a non-frozen recipient';
  ASSERT v_first.reminder_sent_at IS NOT NULL
     AND v_retry.reminder_sent_at IS NOT DISTINCT FROM v_first.reminder_sent_at
     AND v_retry.updated_at IS NOT DISTINCT FROM v_first.updated_at,
    'exact service delivery retry was not idempotent';
END;
$$;
RESET ROLE;

-- Manual reminder remains studio-authored but cites immutable evidence only.
SELECT pg_temp.assume_approval_actor('a4370000-0000-4000-8000-000000000004');
SET LOCAL ROLE authenticated;
SELECT public.stamp_client_decision_reminder((
  SELECT (payload->>'decisionId')::uuid
  FROM approval_437_results WHERE label = 'manual'
));
RESET ROLE;
DO $$
DECLARE
  v_id uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_437_results WHERE label = 'manual'
  );
  v_metadata jsonb;
BEGIN
  SELECT metadata INTO v_metadata
  FROM public.notification_log
  WHERE user_id = 'a4370000-0000-4000-8000-000000000002'
    AND type = 'decision_reminder'
    AND metadata->>'decision_id' = v_id::text;
  ASSERT v_metadata @> jsonb_build_object(
    'artifactKind', 'plan_issue',
    'artifactVersion', 2,
    'artifactChecksum', repeat('b', 64),
    'artifactTitle', 'Notify issued set 2'
  ), 'manual reminder log omitted immutable artifact traceability';
  ASSERT v_metadata ?& ARRAY[
    'artifactKind', 'artifactVersion', 'artifactChecksum', 'artifactTitle'
  ], 'manual reminder metadata is incomplete';
  ASSERT NOT (v_metadata ?| ARRAY[
    'reviewerId', 'decisionLeadId', 'requiredCoapproverId', 'approverId'
  ]), 'manual reminder metadata exposed reviewer identity';
END;
$$;

-- Unsnapshotted/foreign clients cannot read either projection.
SELECT pg_temp.assume_approval_actor('a4370000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_reviews_denied boolean := false;
  v_candidates_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.get_project_decision_reviews(
      'a4373000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN OTHERS THEN v_reviews_denied := true;
  END;
  BEGIN
    PERFORM public.get_project_approval_artifact_candidates(
      'a4373000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN OTHERS THEN v_candidates_denied := true;
  END;
  ASSERT v_reviews_denied AND v_candidates_denied,
    'unsnapshotted client read Stage-2 projection/candidates';
END;
$$;
RESET ROLE;

SELECT pg_temp.assume_approval_actor('a4370000-0000-4000-8000-000000000005');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_reviews_denied boolean := false;
  v_candidates_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.get_project_decision_reviews(
      'a4373000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN OTHERS THEN v_reviews_denied := true;
  END;
  BEGIN
    PERFORM public.get_project_approval_artifact_candidates(
      'a4373000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN OTHERS THEN v_candidates_denied := true;
  END;
  ASSERT v_reviews_denied AND v_candidates_denied,
    'foreign studio read Stage-2 projection/candidates';
END;
$$;
RESET ROLE;

SELECT pg_temp.assume_approval_actor(NULL, 'service_role');
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.get_project_approval_artifact_candidates(
      'a4373000-0000-4000-8000-000000000001'
    );
  EXCEPTION WHEN OTHERS THEN v_denied := true;
  END;
  ASSERT v_denied, 'service role invoked the studio artifact candidate API';
END;
$$;
RESET ROLE;

-- Draft withdrawal is a studio-only immutable disposition with no notice.
-- Even the exact caller-set capability strings cannot authorize raw DML.
SELECT pg_temp.assume_approval_actor('a4370000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_id uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_437_results WHERE label = 'withdraw-draft'
  );
  v_denied boolean := false;
  v_count integer := 0;
BEGIN
  PERFORM set_config('app.project_approval_decision_write_id', v_id::text, true);
  PERFORM set_config('app.client_decision_write_id', v_id::text, true);
  PERFORM set_config('app.project_approval_withdraw_decision_id', v_id::text, true);
  BEGIN
    UPDATE public.client_decisions SET status = 'expired' WHERE id = v_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    v_denied := v_count = 0;
  EXCEPTION WHEN OTHERS THEN v_denied := true;
  END;
  PERFORM set_config('app.project_approval_decision_write_id', '', true);
  PERFORM set_config('app.client_decision_write_id', '', true);
  PERFORM set_config('app.project_approval_withdraw_decision_id', '', true);
  ASSERT v_denied, 'authenticated caller-set GUC bypassed draft withdrawal';
END;
$$;
RESET ROLE;

SELECT pg_temp.assume_approval_actor(NULL, 'service_role');
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_id uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_437_results WHERE label = 'withdraw-draft'
  );
  v_denied boolean := false;
BEGIN
  PERFORM set_config('app.project_approval_decision_write_id', v_id::text, true);
  PERFORM set_config('app.client_decision_write_id', v_id::text, true);
  PERFORM set_config('app.project_approval_withdraw_decision_id', v_id::text, true);
  BEGIN
    UPDATE public.client_decisions SET status = 'expired' WHERE id = v_id;
  EXCEPTION WHEN OTHERS THEN v_denied := true;
  END;
  PERFORM set_config('app.project_approval_decision_write_id', '', true);
  PERFORM set_config('app.client_decision_write_id', '', true);
  PERFORM set_config('app.project_approval_withdraw_decision_id', '', true);
  ASSERT v_denied, 'service caller-set GUC bypassed draft withdrawal';
END;
$$;
RESET ROLE;

SELECT pg_temp.assume_approval_actor('a4370000-0000-4000-8000-000000000005');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_id uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_437_results WHERE label = 'withdraw-draft'
  );
  v_updated_at timestamptz := (
    SELECT updated_at FROM public.client_decisions WHERE id = v_id
  );
  v_denied boolean := false;
BEGIN
  BEGIN
    PERFORM public.withdraw_project_approval_decision(
      v_id, v_updated_at, 'Foreign withdrawal', 'withdraw-foreign'
    );
  EXCEPTION WHEN OTHERS THEN v_denied := true;
  END;
  ASSERT v_denied, 'foreign studio withdrew a Stage-2 draft';
END;
$$;
RESET ROLE;

DO $$
DECLARE
  v_id uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_437_results WHERE label = 'withdraw-draft'
  );
BEGIN
  ASSERT (SELECT status FROM public.client_decisions WHERE id = v_id) = 'draft'
     AND NOT EXISTS (
       SELECT 1 FROM public.project_approval_action_receipts
       WHERE decision_id = v_id AND action_kind = 'withdrawn'
     ), 'failed foreign withdrawal left lifecycle/receipt residue';
END;
$$;

SELECT pg_temp.assume_approval_actor('a4370000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_id uuid := (
    SELECT (payload->>'decisionId')::uuid
    FROM approval_437_results WHERE label = 'withdraw-draft'
  );
  v_updated_at timestamptz := (
    SELECT updated_at FROM public.client_decisions WHERE id = v_id
  );
  v_first jsonb;
  v_retry jsonb;
  v_conflict boolean := false;
BEGIN
  v_first := public.withdraw_project_approval_decision(
    v_id, v_updated_at, 'Composer mistake', 'withdraw-draft-1'
  );
  v_retry := public.withdraw_project_approval_decision(
    v_id, v_updated_at, 'Composer mistake', 'withdraw-draft-1'
  );
  BEGIN
    PERFORM public.withdraw_project_approval_decision(
      v_id, v_updated_at, 'Different reason', 'withdraw-draft-1'
    );
  EXCEPTION WHEN unique_violation THEN v_conflict := true;
  END;
  ASSERT v_first->>'status' = 'expired'
     AND v_first->>'disposition' = 'withdrawn'
     AND (v_first->>'idempotent')::boolean = false,
    'draft withdrawal did not create the immutable disposition';
  ASSERT (v_retry->>'idempotent')::boolean = true
     AND v_retry->>'receiptId' = v_first->>'receiptId',
    'draft withdrawal exact replay did not return its receipt';
  ASSERT v_conflict, 'draft withdrawal accepted conflicting idempotency reuse';
  ASSERT (
    SELECT count(*) = 1
    FROM public.project_approval_action_receipts
    WHERE decision_id = v_id AND action_kind = 'withdrawn'
  ), 'draft withdrawal did not preserve one exact receipt';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.decision_notifications WHERE decision_id = v_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.notification_log
    WHERE metadata->>'decision_id' = v_id::text
  ), 'draft withdrawal emitted an external/in-app notification';
END;
$$;
RESET ROLE;

ROLLBACK;
