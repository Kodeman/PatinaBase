-- Web walk r1 · a published approval that carries P-13's frozen why.
-- LOCAL STACK ONLY. Composed through the real RPCs so why_author_name freezes
-- from the composing designer rather than being written by hand.
\set ON_ERROR_STOP on
\set PROJECT  '''b0000000-0000-0000-0000-0000000000d1'''
\set DESIGNER '''a0000000-0000-0000-0000-000000000004'''
\set CLIENT   '''a0000000-0000-0000-0000-000000000005'''
\set PHASE    '''b0000000-0000-0000-0000-00000005c102'''
\set ISSUE1   '''ee000000-0000-0000-0000-000000000001'''

BEGIN;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', :DESIGNER, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;

SELECT res->>'decisionId' AS g9_id, res->>'artifactHash' AS g9_hash,
       res->>'authorityRevision' AS g9_rev
FROM (SELECT public.create_project_approval_decision(:PROJECT, jsonb_build_object(
  'title', 'Fixture G9 - Published, carries the why',
  'question', 'Do the library elevations read right to you?',
  'context', 'Fixture approval composed with a why, for the web walk.',
  'dueAt', (now() + interval '11 days')::text,
  'phaseId', :PHASE, 'sectionKey', 'project',
  'artifactKind', 'plan_issue', 'artifactId', :ISSUE1,
  'costCentsDelta', 125000, 'scheduleDaysDelta', 3, 'leadTimeDaysDelta', 7
), 'web-walk-r1:g9-create',
  'The shelves grew two inches so the art fits standing up.') AS res) t \gset

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :CLIENT, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;
SELECT public.confirm_project_decision_review(:'g9_id', jsonb_build_object(
  'authorityRevision', (:'g9_rev')::int, 'artifactHash', :'g9_hash',
  'reviewMethod', 'portal_clickthrough'), 'web-walk-r1:g9-review') AS _;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :DESIGNER, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;
SELECT (public.publish_client_decision(:'g9_id')).updated_at AS g9_pub \gset

RESET ROLE;
COMMIT;

\echo G9 seeded:
SELECT :'g9_id' AS g9_id;
