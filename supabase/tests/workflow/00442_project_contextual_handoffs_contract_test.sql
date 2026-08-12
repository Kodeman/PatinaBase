-- Fixture-backed contextual handoff projection contract (00442).
\set ON_ERROR_STOP on

BEGIN;

DO $structure$
DECLARE
  v_definition text := pg_get_functiondef(
    'public.get_project_contextual_handoffs(uuid)'::regprocedure
  );
  v_args text;
BEGIN
  SELECT pg_get_function_arguments(
    'public.get_project_contextual_handoffs(uuid)'::regprocedure
  ) INTO v_args;

  ASSERT v_args = 'p_project_id uuid',
    'contextual handoff RPC argument name/signature drifted';
  ASSERT v_definition LIKE '%STABLE%'
     AND v_definition LIKE '%SECURITY DEFINER%'
     AND v_definition LIKE '%search_path TO ''public'', ''pg_temp''%'
     AND v_definition LIKE '%is_design_studio_comember%'
     AND v_definition LIKE '%project_decision_authority_snapshots%'
     AND v_definition LIKE '%project_approval_artifacts%'
     AND v_definition LIKE '%project_approval_action_receipts%'
     AND v_definition LIKE '%site_requests%'
     AND v_definition LIKE '%site_request_item_versions%'
     AND v_definition LIKE '%site_binder_entries%'
     AND v_definition LIKE '%''[]''::jsonb%',
    'contextual handoff source/authority contract is incomplete';
  ASSERT v_definition NOT LIKE '%site_request_access%'
     AND v_definition NOT LIKE '%site_request_events%'
     AND v_definition NOT LIKE '%site_deliverable_media%'
     AND v_definition NOT LIKE '%source_snapshot%'
     AND v_definition !~* '\m(insert|update|delete|merge|call)\M',
    'contextual handoff RPC reads private rails or contains mutation SQL';

  ASSERT has_function_privilege(
    'authenticated', 'public.get_project_contextual_handoffs(uuid)', 'EXECUTE'
  ), 'authenticated studio actors cannot call contextual handoffs';
  ASSERT NOT has_function_privilege(
    'anon', 'public.get_project_contextual_handoffs(uuid)', 'EXECUTE'
  ) AND NOT has_function_privilege(
    'service_role', 'public.get_project_contextual_handoffs(uuid)', 'EXECUTE'
  ), 'anon/service received a contextual handoff execution rail';
END
$structure$;

CREATE OR REPLACE FUNCTION pg_temp.assume_actor(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', p_actor::text,
      'role', 'authenticated',
      'aal', 'aal1'
    )::text,
    true
  );
END;
$$;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('a4410000-0000-4000-8000-000000000001', 'handoff-owner@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4410000-0000-4000-8000-000000000002', 'handoff-lead@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4410000-0000-4000-8000-000000000003', 'handoff-peer@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a4410000-0000-4000-8000-000000000004', 'handoff-foreign@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer)
VALUES
  ('a4410000-0000-4000-8000-000000000001', 'handoff-owner@test.invalid', 'Handoff Owner', true),
  ('a4410000-0000-4000-8000-000000000002', 'handoff-lead@test.invalid', 'Frozen Approval Lead', false),
  ('a4410000-0000-4000-8000-000000000003', 'handoff-peer@test.invalid', 'Handoff Studio Peer', true),
  ('a4410000-0000-4000-8000-000000000004', 'handoff-foreign@test.invalid', 'Foreign Designer', true)
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('a4411000-0000-4000-8000-000000000001', 'design_studio', 'Handoff Studio', 'handoff-studio', 'active'),
  ('a4411000-0000-4000-8000-000000000002', 'design_studio', 'Foreign Handoff Studio', 'foreign-handoff-studio', 'active');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
) VALUES
  ('a4411100-0000-4000-8000-000000000001', 'a4410000-0000-4000-8000-000000000001', 'a4411000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('a4411100-0000-4000-8000-000000000002', 'a4410000-0000-4000-8000-000000000003', 'a4411000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('a4411100-0000-4000-8000-000000000003', 'a4410000-0000-4000-8000-000000000004', 'a4411000-0000-4000-8000-000000000002', 'owner', 'active', now());

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
) VALUES (
  'a4412000-0000-4000-8000-000000000001',
  'a4410000-0000-4000-8000-000000000001',
  'a4410000-0000-4000-8000-000000000002',
  'Frozen Approval Lead', 'active', 'direct'
);

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, studio_id, status
) VALUES
  ('a4413000-0000-4000-8000-000000000001', 'Contextual Handoff Project', 'a4410000-0000-4000-8000-000000000001', 'a4410000-0000-4000-8000-000000000002', 'a4410000-0000-4000-8000-000000000001', 'a4411000-0000-4000-8000-000000000001', 'active'),
  ('a4413000-0000-4000-8000-000000000002', 'Empty Handoff Project', 'a4410000-0000-4000-8000-000000000001', NULL, 'a4410000-0000-4000-8000-000000000001', 'a4411000-0000-4000-8000-000000000001', 'active'),
  ('a4413000-0000-4000-8000-000000000003', 'Foreign Handoff Project', 'a4410000-0000-4000-8000-000000000004', NULL, 'a4410000-0000-4000-8000-000000000004', 'a4411000-0000-4000-8000-000000000002', 'active');

INSERT INTO public.project_phases (
  id, project_id, name, phase_key, status, sort_order,
  canonical_stage_key, workflow_track
) VALUES
  ('a4413100-0000-4000-8000-000000000001', 'a4413000-0000-4000-8000-000000000001', 'Contract administration', 'ca', 'in_progress', 0, 'contract_administration', 'construction'),
  ('a4413100-0000-4000-8000-000000000002', 'a4413000-0000-4000-8000-000000000001', 'Unclassified exact phase', 'custom', 'pending', 1, NULL, NULL);

INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES (
  'a4413200-0000-4000-8000-000000000001',
  'a4413000-0000-4000-8000-000000000001', 'Kitchen', 0
);

INSERT INTO public.plan_issues (
  id, project_id, issue_number, name, idempotency_key, request_hash,
  set_checksum, sheet_count, created_by
)
SELECT
  ('a4414000-0000-4000-8000-' || lpad(issue_no::text, 12, '0'))::uuid,
  'a4413000-0000-4000-8000-000000000001'::uuid,
  issue_no,
  'Handoff issued set ' || issue_no,
  'handoff-plan-' || issue_no,
  encode(extensions.digest(('handoff-request-' || issue_no)::bytea, 'sha256'), 'hex'),
  encode(extensions.digest(('handoff-artifact-' || issue_no)::bytea, 'sha256'), 'hex'),
  4 + issue_no,
  'a4410000-0000-4000-8000-000000000001'::uuid
FROM generate_series(1, 9) AS issue_no;

CREATE TEMP TABLE handoff_441_decisions (
  label text PRIMARY KEY,
  decision_id uuid NOT NULL
);
GRANT SELECT, INSERT, UPDATE ON handoff_441_decisions TO authenticated;

CREATE OR REPLACE FUNCTION pg_temp.create_handoff_approval(
  p_label text,
  p_issue_no integer,
  p_phase_id uuid DEFAULT 'a4413100-0000-4000-8000-000000000001'
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_result jsonb;
  v_id uuid;
BEGIN
  v_result := public.create_project_approval_decision(
    'a4413000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'title', 'Handoff ' || p_label,
      'question', 'Approve handoff request ' || p_label || '?',
      'context', 'Client-safe handoff context.',
      'dueAt', (now() + interval '10 days')::text,
      'phaseId', p_phase_id,
      'sectionKey', 'project',
      'artifactKind', 'plan_issue',
      'artifactId', ('a4414000-0000-4000-8000-' || lpad(p_issue_no::text, 12, '0'))::uuid,
      'costCentsDelta', 0,
      'scheduleDaysDelta', p_issue_no,
      'leadTimeDaysDelta', -p_issue_no
    ),
    'handoff-create-' || p_label
  );
  v_id := (v_result->>'decisionId')::uuid;
  INSERT INTO handoff_441_decisions(label, decision_id) VALUES (p_label, v_id);
  RETURN v_id;
END;
$$;

SELECT pg_temp.assume_actor('a4410000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT public.set_project_decision_authority(
  'a4413000-0000-4000-8000-000000000001',
  'a4410000-0000-4000-8000-000000000002', NULL, 0
);
SELECT pg_temp.create_handoff_approval('review', 1);
SELECT pg_temp.create_handoff_approval('ready', 2, 'a4413100-0000-4000-8000-000000000002');
SELECT pg_temp.create_handoff_approval('response', 3);
SELECT pg_temp.create_handoff_approval('changes', 4);
SELECT pg_temp.create_handoff_approval('discussion', 5);
SELECT pg_temp.create_handoff_approval('approved', 6);
SELECT pg_temp.create_handoff_approval('withdrawn', 7);
SELECT pg_temp.create_handoff_approval('superseded', 8);
RESET ROLE;

-- The frozen lead confirms every request except the active review draft and
-- the intentionally withdrawn draft. Confirmation remains immutable evidence.
CREATE TEMP TABLE handoff_441_confirmation_tokens AS
SELECT decision.label,
       decision.decision_id,
       snapshot.authority_revision,
       artifact.artifact_hash
FROM handoff_441_decisions AS decision
JOIN public.project_decision_authority_snapshots AS snapshot
  ON snapshot.decision_id = decision.decision_id
JOIN public.project_approval_artifacts AS artifact
  ON artifact.decision_id = decision.decision_id;
GRANT SELECT ON handoff_441_confirmation_tokens TO authenticated;

SELECT pg_temp.assume_actor('a4410000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT public.confirm_project_decision_review(
  decision.decision_id,
  jsonb_build_object(
    'authorityRevision', decision.authority_revision,
    'artifactHash', decision.artifact_hash,
    'reviewMethod', 'portal_clickthrough'
  ),
  'handoff-confirm-' || decision.label
)
FROM handoff_441_confirmation_tokens AS decision
WHERE decision.label IN (
  'ready', 'response', 'changes', 'discussion', 'approved', 'superseded'
);
RESET ROLE;

-- Publish only the response/outcome/supersede sources. The confirmed `ready`
-- draft remains studio-owned until publication.
SELECT pg_temp.assume_actor('a4410000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT public.publish_client_decision(decision.decision_id)
FROM handoff_441_decisions AS decision
WHERE decision.label IN (
  'response', 'changes', 'discussion', 'approved', 'superseded'
)
ORDER BY decision.label;
RESET ROLE;

CREATE TEMP TABLE handoff_441_response_tokens AS
SELECT decision.label, decision.decision_id, parent.updated_at
FROM handoff_441_decisions AS decision
JOIN public.client_decisions AS parent ON parent.id = decision.decision_id;
GRANT SELECT ON handoff_441_response_tokens TO authenticated;

SELECT pg_temp.assume_actor('a4410000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT public.respond_project_approval(
  decision.decision_id,
  jsonb_build_object('outcome', response.outcome),
  decision.updated_at,
  'handoff-respond-' || decision.label
)
FROM handoff_441_response_tokens AS decision
JOIN (VALUES
  ('changes', 'changes_requested'),
  ('discussion', 'needs_discussion'),
  ('approved', 'approved')
) AS response(label, outcome) ON response.label = decision.label
ORDER BY decision.label;
RESET ROLE;

SELECT pg_temp.assume_actor('a4410000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT public.withdraw_project_approval_decision(
  decision.decision_id, parent.updated_at,
  'Mistaken handoff draft', 'handoff-withdraw'
)
FROM handoff_441_decisions AS decision
JOIN public.client_decisions AS parent ON parent.id = decision.decision_id
WHERE decision.label = 'withdrawn';

INSERT INTO handoff_441_decisions(label, decision_id)
SELECT 'successor', (result.payload->>'successorDecisionId')::uuid
FROM (
  SELECT public.supersede_project_approval_decision(
    decision.decision_id,
    jsonb_build_object(
      'title', 'Handoff successor',
      'question', 'Approve the revised handoff artifact?',
      'context', 'Revised client-safe handoff context.',
      'dueAt', (now() + interval '12 days')::text,
      'artifactKind', 'plan_issue',
      'artifactId', 'a4414000-0000-4000-8000-000000000009',
      'costCentsDelta', 0,
      'scheduleDaysDelta', 9,
      'leadTimeDaysDelta', -9
    ),
    parent.updated_at,
    'handoff-supersede'
  ) AS payload
  FROM handoff_441_decisions AS decision
  JOIN public.client_decisions AS parent ON parent.id = decision.decision_id
  WHERE decision.label = 'superseded'
) AS result;
RESET ROLE;

-- Controlled past-due evidence keeps the canonical status unchanged while
-- proving overdue is derived only for a pending response.
SET LOCAL session_replication_role = replica;
UPDATE public.client_decisions
SET due_date = now() - interval '1 day'
WHERE id = (SELECT decision_id FROM handoff_441_decisions WHERE label = 'response');
UPDATE public.project_approval_artifacts
SET due_at = now() - interval '1 day'
WHERE decision_id = (SELECT decision_id FROM handoff_441_decisions WHERE label = 'response');
SET LOCAL session_replication_role = origin;

-- Site Request fixtures cover all included states plus an omitted closed row.
-- Mutable party/contact and raw request/evidence values are deliberately toxic;
-- only the frozen assignee label and redacted evidence may leave the RPC.
INSERT INTO public.project_parties (
  id, project_id, party_kind, display_name, email, phone, trade, profile_id,
  created_by, sms_consent_status
) VALUES
  ('a4416000-0000-4000-8000-000000000001', 'a4413000-0000-4000-8000-000000000001', 'gc', 'MUTABLE PARTY NAME', 'secret-party@test.invalid', '3125550199', 'SECRET TRADE', NULL, 'a4410000-0000-4000-8000-000000000001', 'granted'),
  ('a4416000-0000-4000-8000-000000000002', 'a4413000-0000-4000-8000-000000000003', 'gc', 'Foreign party', 'foreign-party@test.invalid', '3125550188', 'Foreign trade', NULL, 'a4410000-0000-4000-8000-000000000004', 'granted');

INSERT INTO public.site_requests (
  id, project_id, created_by, assignee_party_id,
  assignee_name_snapshot, assignee_phone_snapshot, assignee_trade_snapshot,
  status, note, due_at, due_context, sent_at, closed_at,
  last_nudged_at, due_reminder_sent_at
) VALUES
  ('a4417000-0000-4000-8000-000000000001', 'a4413000-0000-4000-8000-000000000001', 'a4410000-0000-4000-8000-000000000001', 'a4416000-0000-4000-8000-000000000001', 'Frozen Field Party', 'SECRET PHONE', 'SECRET TRADE', 'sent', 'SECRET REQUEST NOTE', now() - interval '2 days', 'Before inspection', now() - interval '3 days', NULL, now() - interval '1 day', now() - interval '1 day'),
  ('a4417000-0000-4000-8000-000000000002', 'a4413000-0000-4000-8000-000000000001', 'a4410000-0000-4000-8000-000000000001', 'a4416000-0000-4000-8000-000000000001', 'Frozen Field Party', 'SECRET PHONE', 'SECRET TRADE', 'in_progress', 'SECRET REQUEST NOTE', now() + interval '2 days', NULL, now() - interval '3 days', NULL, NULL, NULL),
  ('a4417000-0000-4000-8000-000000000003', 'a4413000-0000-4000-8000-000000000001', 'a4410000-0000-4000-8000-000000000001', 'a4416000-0000-4000-8000-000000000001', 'Frozen Field Party', 'SECRET PHONE', 'SECRET TRADE', 'delivered', 'SECRET REQUEST NOTE', now() - interval '1 day', 'Review delivery', now() - interval '4 days', NULL, NULL, NULL),
  ('a4417000-0000-4000-8000-000000000004', 'a4413000-0000-4000-8000-000000000001', 'a4410000-0000-4000-8000-000000000001', 'a4416000-0000-4000-8000-000000000001', 'Frozen Field Party', 'SECRET PHONE', 'SECRET TRADE', 'completed', 'SECRET REQUEST NOTE', now() - interval '1 day', 'Ready to close', now() - interval '4 days', NULL, NULL, NULL),
  ('a4417000-0000-4000-8000-000000000005', 'a4413000-0000-4000-8000-000000000001', 'a4410000-0000-4000-8000-000000000001', 'a4416000-0000-4000-8000-000000000001', 'Frozen Field Party', 'SECRET PHONE', 'SECRET TRADE', 'closed', 'SECRET REQUEST NOTE', now() - interval '1 day', NULL, now() - interval '4 days', now(), NULL, NULL),
  ('a4417000-0000-4000-8000-000000000006', 'a4413000-0000-4000-8000-000000000003', 'a4410000-0000-4000-8000-000000000004', 'a4416000-0000-4000-8000-000000000002', 'Foreign Frozen Party', 'FOREIGN SECRET PHONE', 'Foreign trade', 'sent', 'FOREIGN SECRET NOTE', now() - interval '1 day', NULL, now() - interval '2 days', NULL, NULL, NULL);

INSERT INTO public.site_request_items (
  id, request_id, sort_order, status, current_version_number,
  current_version_id, approved_at
) VALUES
  ('a4418000-0000-4000-8000-000000000001', 'a4417000-0000-4000-8000-000000000003', 0, 'delivered', 1, 'a4419000-0000-4000-8000-000000000001', NULL),
  ('a4418000-0000-4000-8000-000000000002', 'a4417000-0000-4000-8000-000000000004', 0, 'approved', 1, 'a4419000-0000-4000-8000-000000000002', now());

INSERT INTO public.site_request_item_versions (
  id, item_id, version_number, kit_code, title, guidance, room_id,
  room_name_snapshot, configuration, created_by
) VALUES
  ('a4419000-0000-4000-8000-000000000001', 'a4418000-0000-4000-8000-000000000001', 1, 'K-01', 'Safe delivered measurement', 'SECRET GUIDANCE', 'a4413200-0000-4000-8000-000000000001', 'Kitchen', '{"secret":"CONFIGURATION"}'::jsonb, 'a4410000-0000-4000-8000-000000000001'),
  ('a4419000-0000-4000-8000-000000000002', 'a4418000-0000-4000-8000-000000000002', 1, 'K-02', 'Safe approved photo set', 'SECRET GUIDANCE', 'a4413200-0000-4000-8000-000000000001', 'Kitchen', '{"secret":"CONFIGURATION"}'::jsonb, 'a4410000-0000-4000-8000-000000000001');

INSERT INTO public.site_deliverables (
  id, request_id, item_id, item_version_id, client_attempt_id,
  attempt_number, status, payload, captured_by_name, captured_at, delivered_at
) VALUES
  ('a441a000-0000-4000-8000-000000000001', 'a4417000-0000-4000-8000-000000000003', 'a4418000-0000-4000-8000-000000000001', 'a4419000-0000-4000-8000-000000000001', 'a441a100-0000-4000-8000-000000000001', 1, 'delivered', '{"secret":"DELIVERY PAYLOAD"}'::jsonb, 'SECRET CAPTURE NAME', now(), now()),
  ('a441a000-0000-4000-8000-000000000002', 'a4417000-0000-4000-8000-000000000004', 'a4418000-0000-4000-8000-000000000002', 'a4419000-0000-4000-8000-000000000002', 'a441a100-0000-4000-8000-000000000002', 1, 'delivered', '{"secret":"DELIVERY PAYLOAD"}'::jsonb, 'SECRET CAPTURE NAME', now(), now());

INSERT INTO public.site_binder_entries (
  id, project_id, room_id, request_id, item_id, item_version_id,
  deliverable_id, entry_kind, payload, approved_by
) VALUES (
  'a441b000-0000-4000-8000-000000000001',
  'a4413000-0000-4000-8000-000000000001',
  'a4413200-0000-4000-8000-000000000001',
  'a4417000-0000-4000-8000-000000000004',
  'a4418000-0000-4000-8000-000000000002',
  'a4419000-0000-4000-8000-000000000002',
  'a441a000-0000-4000-8000-000000000002',
  'K-02', '{"secret":"BINDER PAYLOAD"}'::jsonb,
  'a4410000-0000-4000-8000-000000000001'
);

CREATE TEMP TABLE handoff_441_state_before AS
SELECT jsonb_build_object(
  'decisions', (SELECT count(*) FROM public.client_decisions WHERE project_id = 'a4413000-0000-4000-8000-000000000001'),
  'decisionUpdated', (SELECT max(updated_at) FROM public.client_decisions WHERE project_id = 'a4413000-0000-4000-8000-000000000001'),
  'receipts', (SELECT count(*) FROM public.project_approval_action_receipts WHERE project_id = 'a4413000-0000-4000-8000-000000000001'),
  'requests', (SELECT count(*) FROM public.site_requests WHERE project_id = 'a4413000-0000-4000-8000-000000000001'),
  'requestUpdated', (SELECT max(updated_at) FROM public.site_requests WHERE project_id = 'a4413000-0000-4000-8000-000000000001'),
  'binder', (SELECT count(*) FROM public.site_binder_entries WHERE project_id = 'a4413000-0000-4000-8000-000000000001')
) AS fingerprint;

CREATE TEMP TABLE handoff_441_projection (
  label text PRIMARY KEY,
  result jsonb NOT NULL
);
GRANT SELECT, INSERT ON handoff_441_projection TO authenticated;

SELECT pg_temp.assume_actor('a4410000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
INSERT INTO handoff_441_projection(label, result)
VALUES (
  'owner',
  public.get_project_contextual_handoffs(
    'a4413000-0000-4000-8000-000000000001'
  )
);
DO $$
DECLARE
  v_result jsonb := (
    SELECT result FROM handoff_441_projection WHERE label = 'owner'
  );
  v_repeat jsonb := public.get_project_contextual_handoffs(
    'a4413000-0000-4000-8000-000000000001'
  );
  v_text text := v_result::text;
  v_item jsonb;
  v_id uuid;
BEGIN
  ASSERT jsonb_array_length(v_result) = 10,
    'contextual handoff projection did not return 6 approvals + 4 site requests';
  ASSERT v_repeat = v_result,
    'contextual handoff ordering/payload is not stable';
  ASSERT public.get_project_contextual_handoffs(
    'a4413000-0000-4000-8000-000000000002'
  ) = '[]'::jsonb, 'authorized empty project did not return []';

  ASSERT v_text NOT ILIKE '%reviewer%'
     AND v_text NOT ILIKE '%actorid%'
     AND v_text NOT ILIKE '%decisionlead%'
     AND v_text NOT ILIKE '%assignedby%'
     AND v_text NOT ILIKE '%sourceSnapshot%'
     AND v_text NOT ILIKE '%storage%'
     AND v_text NOT ILIKE '%token%'
     AND v_text NOT ILIKE '%url%'
     AND v_text NOT ILIKE '%secret%'
     AND v_text NOT ILIKE '%mutable party%'
     AND v_text NOT ILIKE '%configuration%'
     AND v_text NOT ILIKE '%payload%',
    'contextual handoff projection leaked identity/private evidence';

  ASSERT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_result) AS entry(value)
    CROSS JOIN LATERAL jsonb_object_keys(entry.value) AS key
    WHERE key NOT IN (
      'sourceKind', 'sourceId', 'projectId', 'phaseId',
      'canonicalStageKey', 'workflowTrack',
      'stageAttribution', 'sourceState', 'responsibility',
      'expectedResponse', 'dueAt', 'isOverdue', 'escalation',
      'artifact', 'actionKind', 'updatedAt'
    )
  ), 'contextual handoff emitted an undocumented top-level field';

  SELECT decision_id INTO v_id FROM handoff_441_decisions WHERE label = 'review';
  SELECT value INTO v_item FROM jsonb_array_elements(v_result) AS item(value)
  WHERE value->>'sourceId' = v_id::text;
  ASSERT v_item @> '{"sourceKind":"project_approval","sourceState":"review_required","canonicalStageKey":"contract_administration","workflowTrack":"construction","stageAttribution":"exact_project_phase","expectedResponse":"confirm_artifact_review","actionKind":"open_approval_review","isOverdue":false}'::jsonb
     AND v_item->'responsibility'->'sender'->>'kind' = 'studio'
     AND v_item->'responsibility'->'recipient'->>'kind' = 'client'
     AND v_item->'responsibility'->'currentOwner'->>'kind' = 'client'
     AND v_item->'artifact'->>'kind' = 'plan_issue'
     AND v_item->'artifact' ? 'checksum',
    'review-required approval route/classification/artifact is wrong';

  SELECT decision_id INTO v_id FROM handoff_441_decisions WHERE label = 'ready';
  SELECT value INTO v_item FROM jsonb_array_elements(v_result) AS item(value)
  WHERE value->>'sourceId' = v_id::text;
  ASSERT v_item->>'sourceState' = 'ready_to_publish'
     AND v_item->>'actionKind' = 'publish_approval_request'
     AND v_item->'responsibility'->'sender'->>'kind' = 'client'
     AND v_item->'responsibility'->'recipient'->>'kind' = 'studio'
     AND v_item->'responsibility'->'currentOwner'->>'kind' = 'studio'
     AND v_item->>'phaseId' = 'a4413100-0000-4000-8000-000000000002'
     AND v_item->'canonicalStageKey' = 'null'::jsonb
     AND v_item->'workflowTrack' = 'null'::jsonb,
    'confirmed draft did not preserve exact phase with null classification';

  SELECT decision_id INTO v_id FROM handoff_441_decisions WHERE label = 'response';
  SELECT value INTO v_item FROM jsonb_array_elements(v_result) AS item(value)
  WHERE value->>'sourceId' = v_id::text;
  ASSERT v_item->>'sourceState' = 'response_required'
     AND v_item->>'actionKind' = 'open_approval_response'
     AND v_item->'responsibility'->'sender'->>'kind' = 'studio'
     AND v_item->'responsibility'->'recipient'->>'kind' = 'client'
     AND (v_item->>'isOverdue')::boolean,
    'pending overdue response route is wrong';

  FOREACH v_id IN ARRAY ARRAY[
    (SELECT decision_id FROM handoff_441_decisions WHERE label = 'changes'),
    (SELECT decision_id FROM handoff_441_decisions WHERE label = 'discussion')
  ] LOOP
    SELECT value INTO v_item FROM jsonb_array_elements(v_result) AS item(value)
    WHERE value->>'sourceId' = v_id::text;
    ASSERT v_item->>'sourceState' IN ('changes_requested', 'needs_discussion')
       AND (
         (v_item->>'sourceState' = 'changes_requested'
          AND v_item->>'actionKind' = 'supersede_approval_request')
         OR
         (v_item->>'sourceState' = 'needs_discussion'
          AND v_item->>'actionKind' = 'open_approval_discussion')
       )
       AND v_item->'responsibility'->'sender'->>'kind' = 'client'
       AND v_item->'responsibility'->'recipient'->>'kind' = 'studio'
       AND v_item->'responsibility'->'currentOwner'->>'kind' = 'studio'
       AND NOT (v_item->>'isOverdue')::boolean,
      'returned approval route/overdue ownership is wrong';
  END LOOP;

  ASSERT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_result) AS item(value)
    WHERE value->>'sourceId' IN (
      (SELECT decision_id::text FROM handoff_441_decisions WHERE label = 'approved'),
      (SELECT decision_id::text FROM handoff_441_decisions WHERE label = 'withdrawn'),
      (SELECT decision_id::text FROM handoff_441_decisions WHERE label = 'superseded'),
      'a4417000-0000-4000-8000-000000000005'
    )
  ), 'approved/withdrawn/superseded/closed source remained actionable';
  ASSERT EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_result) AS item(value)
    WHERE value->>'sourceId' = (
      SELECT decision_id::text FROM handoff_441_decisions WHERE label = 'successor'
    ) AND value->>'sourceState' = 'review_required'
  ), 'superseded source successor did not become the current leaf handoff';

  SELECT value INTO v_item FROM jsonb_array_elements(v_result) AS item(value)
  WHERE value->>'sourceId' = 'a4417000-0000-4000-8000-000000000001';
  ASSERT v_item @> '{"sourceKind":"site_request","sourceState":"sent","canonicalStageKey":"contract_administration","stageAttribution":"source_domain","actionKind":"open_site_request","expectedResponse":"acknowledge_and_begin","isOverdue":true}'::jsonb
     AND v_item->'phaseId' = 'null'::jsonb
     AND v_item->'workflowTrack' = 'null'::jsonb
     AND v_item->'responsibility'->'recipient'->>'label' = 'Frozen Field Party'
     AND v_item->'responsibility'->'currentOwner'->>'kind' = 'site_party'
     AND (v_item->'escalation'->>'nudgeSent')::boolean
     AND (v_item->'escalation'->>'dueReminderSent')::boolean,
    'sent Site Request route/domain/frozen party/escalation is wrong';

  SELECT value INTO v_item FROM jsonb_array_elements(v_result) AS item(value)
  WHERE value->>'sourceId' = 'a4417000-0000-4000-8000-000000000002';
  ASSERT v_item->>'sourceState' = 'in_progress'
     AND v_item->>'actionKind' = 'continue_site_request'
     AND NOT (v_item->>'isOverdue')::boolean,
    'in-progress Site Request route is wrong';

  SELECT value INTO v_item FROM jsonb_array_elements(v_result) AS item(value)
  WHERE value->>'sourceId' = 'a4417000-0000-4000-8000-000000000003';
  ASSERT v_item->>'sourceState' = 'delivered'
     AND v_item->>'actionKind' = 'review_site_request'
     AND v_item->'responsibility'->'sender'->>'kind' = 'site_party'
     AND v_item->'responsibility'->'sender'->>'label' = 'Frozen Field Party'
     AND v_item->'responsibility'->'recipient'->>'kind' = 'studio'
     AND v_item->'responsibility'->'currentOwner'->>'kind' = 'studio'
     AND (v_item->>'isOverdue')::boolean
     AND v_item->'artifact'->'items'->0->>'title' = 'Safe delivered measurement'
     AND (v_item->'artifact'->'items'->0->>'hasDeliveredEvidence')::boolean
     AND NOT (v_item->'artifact'->'items'->0->>'hasApprovedEvidence')::boolean,
    'delivered Site Request evidence/review route is wrong';

  SELECT value INTO v_item FROM jsonb_array_elements(v_result) AS item(value)
  WHERE value->>'sourceId' = 'a4417000-0000-4000-8000-000000000004';
  ASSERT v_item->>'sourceState' = 'completed'
     AND v_item->>'actionKind' = 'close_site_request'
     AND NOT (v_item->>'isOverdue')::boolean
     AND (v_item->'artifact'->'items'->0->>'hasApprovedEvidence')::boolean,
    'completed Site Request close/review evidence route is wrong';
END;
$$;

-- Studio co-member sees the same redacted projection.
SELECT pg_temp.assume_actor('a4410000-0000-4000-8000-000000000003');
DO $$
BEGIN
  ASSERT public.get_project_contextual_handoffs(
    'a4413000-0000-4000-8000-000000000001'
  ) = (SELECT result FROM handoff_441_projection WHERE label = 'owner'),
    'studio co-member did not receive the same redacted handoffs';
END;
$$;
RESET ROLE;

-- Frozen lead is a client, not a studio author; foreign and unknown project
-- paths are existence-safe stable empty arrays.
SELECT pg_temp.assume_actor('a4410000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT public.get_project_contextual_handoffs(
    'a4413000-0000-4000-8000-000000000001'
  ) = '[]'::jsonb, 'client received the designer contextual handoff rail';
END;
$$;
RESET ROLE;

SELECT pg_temp.assume_actor('a4410000-0000-4000-8000-000000000004');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT public.get_project_contextual_handoffs(
    'a4413000-0000-4000-8000-000000000001'
  ) = '[]'::jsonb
  AND public.get_project_contextual_handoffs(
    'a4419999-0000-4000-8000-000000000001'
  ) = '[]'::jsonb,
    'foreign/nonexistent project leaked contextual handoff existence';
END;
$$;
RESET ROLE;

DO $$
DECLARE
  v_after jsonb := jsonb_build_object(
    'decisions', (SELECT count(*) FROM public.client_decisions WHERE project_id = 'a4413000-0000-4000-8000-000000000001'),
    'decisionUpdated', (SELECT max(updated_at) FROM public.client_decisions WHERE project_id = 'a4413000-0000-4000-8000-000000000001'),
    'receipts', (SELECT count(*) FROM public.project_approval_action_receipts WHERE project_id = 'a4413000-0000-4000-8000-000000000001'),
    'requests', (SELECT count(*) FROM public.site_requests WHERE project_id = 'a4413000-0000-4000-8000-000000000001'),
    'requestUpdated', (SELECT max(updated_at) FROM public.site_requests WHERE project_id = 'a4413000-0000-4000-8000-000000000001'),
    'binder', (SELECT count(*) FROM public.site_binder_entries WHERE project_id = 'a4413000-0000-4000-8000-000000000001')
  );
BEGIN
  ASSERT v_after = (SELECT fingerprint FROM handoff_441_state_before),
    'read-only contextual handoff calls mutated authority/source state';
END;
$$;

ROLLBACK;
