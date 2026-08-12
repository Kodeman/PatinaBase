-- One published gate the household can still answer, minted on demand.
--
-- LOCAL STACK ONLY (guarded in `workflow-gate-fixture.ts`).
--
-- A suite that RESPONDS to a gate consumes it: settling folds the ceremony and
-- takes the gate out of the margin. The base fixture is shared and reused
-- across spec files and across runs, so a mutating suite must not answer one of
-- its gates — the second run would find it already settled. It calls this
-- instead and gets a gate of its own, additive to everything already standing.
--
-- Requires the base fixture (decision authority + the two plan issues).
-- `:KEY` must be unique per call: `create_project_approval_decision` is
-- idempotent on it, so a repeated key replays the original receipt and hands
-- back the already-answered decision.
--
-- psql vars: :KEY (text, unique) and :TITLE (text).

\set ON_ERROR_STOP on
\set QUIET on
\timing off
\pset pager off

\set PROJECT  '''b0000000-0000-0000-0000-0000000000d1'''
\set DESIGNER '''a0000000-0000-0000-0000-000000000004'''
\set CLIENT   '''a0000000-0000-0000-0000-000000000005'''
\set PHASE    '''b0000000-0000-0000-0000-00000005c102'''
\set ISSUE1   '''ee000000-0000-0000-0000-000000000001'''

\o /dev/null

BEGIN;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', :DESIGNER, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;

SELECT res->>'decisionId' AS d_id, res->>'artifactHash' AS d_hash,
       res->>'authorityRevision' AS d_rev
FROM (SELECT public.create_project_approval_decision(:PROJECT, jsonb_build_object(
  'title', :'TITLE',
  'question', 'Approve the issued Design Development plan set?',
  'context', 'Minted for one client-side suite to answer.',
  'dueAt', (now() + interval '21 days')::text,
  'phaseId', :PHASE, 'sectionKey', 'project',
  'artifactKind', 'plan_issue', 'artifactId', :ISSUE1,
  'costCentsDelta', 42000, 'scheduleDaysDelta', 2, 'leadTimeDaysDelta', 5
), :'KEY') AS res) t \gset

-- The review confirmation belongs to the frozen decision lead, never the studio.
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :CLIENT, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;
SELECT public.confirm_project_decision_review(:'d_id', jsonb_build_object(
  'authorityRevision', (:'d_rev')::int, 'artifactHash', :'d_hash',
  'reviewMethod', 'portal_clickthrough'), :'KEY' || ':review') AS _;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :DESIGNER, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;
SELECT public.publish_client_decision(:'d_id') AS _;

RESET ROLE;
COMMIT;

\o
\pset format unaligned
\pset tuples_only on
SELECT :'d_id';
