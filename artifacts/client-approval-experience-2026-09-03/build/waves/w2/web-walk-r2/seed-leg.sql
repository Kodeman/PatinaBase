-- Web walk r2 · mint ONE published approval carrying P-13's frozen why.
-- LOCAL STACK ONLY. Composed through the real RPCs so why_author_name freezes
-- from the composing designer rather than being written by hand.
-- Variables the caller must set with -v: LABEL, QUESTION, WHY, COST, SCHED, LEAD
\set ON_ERROR_STOP on
\set QUIET on
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

SELECT res->>'decisionId' AS leg_id, res->>'artifactHash' AS leg_hash,
       res->>'authorityRevision' AS leg_rev
FROM (SELECT public.create_project_approval_decision(:PROJECT, jsonb_build_object(
  'title', :'LABEL',
  'question', :'QUESTION',
  'context', 'Web walk r2 row.',
  'dueAt', (now() + interval '11 days')::text,
  'phaseId', :PHASE, 'sectionKey', 'project',
  'artifactKind', 'plan_issue', 'artifactId', :ISSUE1,
  'costCentsDelta', :COST, 'scheduleDaysDelta', :SCHED, 'leadTimeDaysDelta', :LEAD
), :'LABEL' || ':create', :'WHY') AS res) t \gset

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :CLIENT, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;
SELECT public.confirm_project_decision_review(:'leg_id', jsonb_build_object(
  'authorityRevision', (:'leg_rev')::int, 'artifactHash', :'leg_hash',
  'reviewMethod', 'portal_clickthrough'), :'LABEL' || ':review') AS _;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :DESIGNER, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;
SELECT (public.publish_client_decision(:'leg_id')).updated_at AS leg_pub \gset

RESET ROLE;
COMMIT;
\o
SELECT :'LABEL' AS label, :'leg_id' AS decision_id;
