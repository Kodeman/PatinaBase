-- Wave 3 web walk seed: a superseded PAIR whose predecessor she ANSWERED,
-- plus a signed paper so /proposals/<id>/record has a signature to print.
-- Local stack only.
\set ON_ERROR_STOP on
\set QUIET on
\pset pager off

\set PROJECT  '''b0000000-0000-0000-0000-0000000000d1'''
\set DESIGNER '''a0000000-0000-0000-0000-000000000004'''
\set CLIENT   '''a0000000-0000-0000-0000-000000000005'''
\set PHASE    '''b0000000-0000-0000-0000-00000005c102'''
\set ISSUE3   '''ee000000-0000-0000-0000-000000000003'''
\set ISSUE4   '''ee000000-0000-0000-0000-000000000004'''

\o /dev/null
BEGIN;

SET LOCAL session_replication_role = 'replica';
INSERT INTO public.plan_issues (
  id, project_id, issue_number, name, idempotency_key, request_hash,
  prior_issue_id, set_checksum, sheet_count, issued_at, created_by
) VALUES
  (:ISSUE3, :PROJECT, 903, 'Issue 03 - Library elevations',
   'w3walk:issue-03', repeat('a3', 32), NULL, repeat('c3', 32), 9,
   now() - interval '9 days', :DESIGNER),
  (:ISSUE4, :PROJECT, 904, 'Issue 04 - Library elevations, Rev B',
   'w3walk:issue-04', repeat('a4', 32), :ISSUE3, repeat('c4', 32), 10,
   now() - interval '2 days', :DESIGNER)
ON CONFLICT (id) DO NOTHING;
SET LOCAL session_replication_role = 'origin';

-- studio
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :DESIGNER, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;

SELECT res->>'decisionId' AS p_id, res->>'artifactHash' AS p_hash,
       res->>'authorityRevision' AS p_rev
FROM (SELECT public.create_project_approval_decision(:PROJECT, jsonb_build_object(
  'title', 'Walk W3 - Library elevations, Edition 903',
  'question', 'Do the library elevations read right to you?',
  'context', 'The edition she answered, before a later one replaced it.',
  'dueAt', (now() + interval '11 days')::text,
  'phaseId', :PHASE, 'sectionKey', 'project',
  'artifactKind', 'plan_issue', 'artifactId', :ISSUE3,
  'costCentsDelta', 125000, 'scheduleDaysDelta', 3, 'leadTimeDaysDelta', 7
), 'w3walk:pred-create', 'The shelves grew two inches so the art fits standing up.') AS res) t \gset

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :CLIENT, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;
SELECT public.confirm_project_decision_review(:'p_id', jsonb_build_object(
  'authorityRevision', (:'p_rev')::int, 'artifactHash', :'p_hash',
  'reviewMethod', 'portal_clickthrough'), 'w3walk:pred-review') AS _;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :DESIGNER, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;
SELECT (public.publish_client_decision(:'p_id')).updated_at AS p_pub \gset

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :CLIENT, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;
SELECT public.respond_project_approval(:'p_id',
  jsonb_build_object('outcome','approved','clientSignature','Client User',
                     'clientConsentMethod','electronic_signature'),
  (:'p_pub')::timestamptz, 'w3walk:pred-respond') AS _;

RESET ROLE;
SELECT updated_at AS p_resp FROM public.client_decisions WHERE id = (:'p_id')::uuid \gset

-- studio supersedes the ANSWERED edition with a cheaper one
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :DESIGNER, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;

SELECT res->>'successorDecisionId' AS s_id
FROM (SELECT public.supersede_project_approval_decision(:'p_id', jsonb_build_object(
  'title', 'Walk W3 - Library elevations, Edition 904',
  'question', 'Do the revised library elevations read right to you?',
  'context', 'The later edition, issued after she answered the first.',
  'dueAt', (now() + interval '13 days')::text,
  'artifactKind', 'plan_issue', 'artifactId', :ISSUE4,
  'costCentsDelta', 45000, 'scheduleDaysDelta', 1, 'leadTimeDaysDelta', 7),
  (:'p_resp')::timestamptz, 'w3walk:supersede',
  'The bookcase lost a bay, so the run is shorter.') AS res) t \gset

SELECT artifact_hash AS s_hash FROM public.project_approval_artifacts
 WHERE decision_id = (:'s_id')::uuid \gset
SELECT authority_revision AS s_rev FROM public.project_decision_authority_snapshots
 WHERE decision_id = (:'s_id')::uuid \gset

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :CLIENT, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;
SELECT public.confirm_project_decision_review(:'s_id', jsonb_build_object(
  'authorityRevision', (:'s_rev')::int, 'artifactHash', :'s_hash',
  'reviewMethod', 'portal_clickthrough'), 'w3walk:succ-review') AS _;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :DESIGNER, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;
SELECT (public.publish_client_decision(:'s_id')).updated_at AS s_pub \gset
RESET ROLE;

-- The signed paper: Aspen Loft - Paintwork and plaster, already executed but
-- carrying no signature row on a fresh seed.
INSERT INTO public.commercial_document_signatures
  (proposal_id, party_role, signer_user_id, signed_name, signed_ip,
   evidence_fingerprint, signed_at, metadata)
VALUES
  ('b0000000-0000-0000-0000-0000000cd003', 'client', :CLIENT, 'Client User',
   '203.0.113.44', repeat('d5', 32), timestamptz '2026-08-07 15:12:00+00',
   '{}'::jsonb)
ON CONFLICT (proposal_id, party_role) DO NOTHING;

COMMIT;

\o
\pset format unaligned
\pset tuples_only on
SELECT jsonb_build_object('predecessor', :'p_id', 'successor', :'s_id',
                          'signedProposal','b0000000-0000-0000-0000-0000000cd003')::text;
