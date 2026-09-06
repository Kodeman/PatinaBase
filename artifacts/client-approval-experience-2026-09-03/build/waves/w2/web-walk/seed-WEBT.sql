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

SELECT res->>'decisionId' AS webt_id, res->>'artifactHash' AS webt_hash,
       res->>'authorityRevision' AS webt_rev
FROM (SELECT public.create_project_approval_decision(:PROJECT, jsonb_build_object(
  'title', 'Fixture WEBT - Pointer tail leg',
  'question', 'Approve the guest bath vanity?',
  'context', 'Web walk row for the pointer-tail leg.',
  'dueAt', (now() + interval '11 days')::text,
  'phaseId', :PHASE, 'sectionKey', 'project',
  'artifactKind', 'plan_issue', 'artifactId', :ISSUE1,
  'costCentsDelta', 125000, 'scheduleDaysDelta', 3, 'leadTimeDaysDelta', 7
), 'web-walk-r1:webt-create',
  'The vanity clears the door swing by four inches.') AS res) t \gset

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :CLIENT, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;
SELECT public.confirm_project_decision_review(:'webt_id', jsonb_build_object(
  'authorityRevision', (:'webt_rev')::int, 'artifactHash', :'webt_hash',
  'reviewMethod', 'portal_clickthrough'), 'web-walk-r1:webt-review') AS _;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :DESIGNER, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;
SELECT (public.publish_client_decision(:'webt_id')).updated_at AS webt_pub \gset

RESET ROLE;
COMMIT;

\echo G9 seeded:
SELECT :'webt_id' AS webt_id;
