-- WP3 workflow-gate e2e fixture — TEARDOWN ONLY.
--
-- LOCAL STACK ONLY. `e2e/helpers/workflow-gate-fixture.ts` refuses to run this
-- against anything but 127.0.0.1/localhost before psql is ever spawned.
--
-- Every table this touches is append-only evidence behind a guard trigger
-- (`guard_stage2_client_decision_edge`, `guard_project_approval_evidence_edge`,
-- `guard_project_decision_authority_edge`, `_plan_room_immutable_row`), each of
-- which raises on DELETE with no escape hatch. `session_replication_role =
-- 'replica'` is the only way to reclaim fixture rows, which is why a fixture
-- may only ever exist locally.
--
-- Scoped by predicate, not by id: the RPCs mint decision UUIDs, so they rotate
-- on every run. `approval_contract = 'project_artifact_v1'` is what separates
-- fixture approvals from the six seeded legacy client_decisions on this
-- project, which must survive untouched.

\set ON_ERROR_STOP on

\set PROJECT '''b0000000-0000-0000-0000-0000000000d1'''
\set ISSUE1  '''ee000000-0000-0000-0000-000000000001'''
\set ISSUE2  '''ee000000-0000-0000-0000-000000000002'''
\set PHASE_DD   '''b0000000-0000-0000-0000-00000005c102'''
\set PHASE_PROC '''b0000000-0000-0000-0000-00000005c103'''

BEGIN;

SET LOCAL session_replication_role = 'replica';

DELETE FROM public.project_approval_action_receipts WHERE project_id = :PROJECT;
DELETE FROM public.project_decision_review_confirmations WHERE project_id = :PROJECT;
DELETE FROM public.project_approval_artifacts WHERE project_id = :PROJECT;
DELETE FROM public.project_decision_authority_snapshots WHERE project_id = :PROJECT;
DELETE FROM public.decision_events WHERE decision_id IN (
  SELECT id FROM public.client_decisions
   WHERE project_id = :PROJECT AND approval_contract = 'project_artifact_v1');
DELETE FROM public.decision_notifications WHERE decision_id IN (
  SELECT id FROM public.client_decisions
   WHERE project_id = :PROJECT AND approval_contract = 'project_artifact_v1');
DELETE FROM public.decision_comments WHERE decision_id IN (
  SELECT id FROM public.client_decisions
   WHERE project_id = :PROJECT AND approval_contract = 'project_artifact_v1');
DELETE FROM public.decision_overrides WHERE decision_id IN (
  SELECT id FROM public.client_decisions
   WHERE project_id = :PROJECT AND approval_contract = 'project_artifact_v1');
DELETE FROM public.client_decision_options WHERE decision_id IN (
  SELECT id FROM public.client_decisions
   WHERE project_id = :PROJECT AND approval_contract = 'project_artifact_v1');
DELETE FROM public.client_decisions
 WHERE project_id = :PROJECT AND approval_contract = 'project_artifact_v1';
DELETE FROM public.project_decision_authorities WHERE project_id = :PROJECT;
DELETE FROM public.plan_issue_prints WHERE issue_id IN (:ISSUE1, :ISSUE2);
DELETE FROM public.plan_issues WHERE id IN (:ISSUE1, :ISSUE2);

-- The seeded phases carry no canonical classification; the fixture adds one so
-- the stage line and the gate provenance have a stage to name. Put it back.
UPDATE public.project_phases
   SET canonical_stage_key = NULL, workflow_track = NULL
 WHERE id IN (:PHASE_DD, :PHASE_PROC);

SET LOCAL session_replication_role = 'origin';

COMMIT;
