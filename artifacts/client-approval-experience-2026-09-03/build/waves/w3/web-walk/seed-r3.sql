-- Wave 3 web walk, round 3 — the two fixtures rounds 1 and 2 lacked.
--
--   1. A fifth pending approval, so the browser can ANSWER one (Approve, hold
--      + typed name) while the walk's superseded successor stays open for the
--      P-27 reads. (`project_approval_artifacts.due_at` is NOT NULL, so an
--      approval with no date cannot be seeded at all — that leg is walked by
--      nulling `dueAt` in the projection response instead.)
--   2. A service addendum still waiting for her name, so the DOOR draws at all.
--      Three walks in a row reported the door unreachable because the seed
--      carries no unsigned commercial instrument; this is one, in the same
--      shape `the-client-page.sql` builds its signed ones.
--
-- Local stack only.
\set ON_ERROR_STOP on
\set QUIET on
\pset pager off

\set PROJECT  '''b0000000-0000-0000-0000-0000000000d1'''
\set DESIGNER '''a0000000-0000-0000-0000-000000000004'''
\set CLIENT   '''a0000000-0000-0000-0000-000000000005'''
\set PHASE    '''b0000000-0000-0000-0000-00000005c102'''
\set ISSUE5   '''ee000000-0000-0000-0000-000000000005'''
\set DOORPROP '''b0000000-0000-0000-0000-0000000cd004'''
\set DOORDOC  '''b0000000-0000-0000-0000-0000000dd004'''

\o /dev/null
BEGIN;

SET LOCAL session_replication_role = 'replica';
INSERT INTO public.plan_issues (
  id, project_id, issue_number, name, idempotency_key, request_hash,
  prior_issue_id, set_checksum, sheet_count, issued_at, created_by
) VALUES
  (:ISSUE5, :PROJECT, 905, 'Issue 05 - Hall lantern',
   'w3walk:issue-05', repeat('a5', 32), NULL, repeat('c5', 32), 4,
   now() - interval '1 day', :DESIGNER)
ON CONFLICT (id) DO NOTHING;
SET LOCAL session_replication_role = 'origin';

-- ── 1. The undated approval ───────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :DESIGNER, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;

SELECT res->>'decisionId' AS u_id, res->>'artifactHash' AS u_hash,
       res->>'authorityRevision' AS u_rev
FROM (SELECT public.create_project_approval_decision(:PROJECT, jsonb_build_object(
  'title', 'Walk W3 - Hall lantern, Edition 905',
  'question', 'Is the hall lantern the one you want?',
  'context', 'The fifth ask, kept open for the walk''s own answer.',
  'dueAt', (now() + interval '16 days')::text,
  'phaseId', :PHASE, 'sectionKey', 'project',
  'artifactKind', 'plan_issue', 'artifactId', :ISSUE5,
  'costCentsDelta', 32000, 'scheduleDaysDelta', 0, 'leadTimeDaysDelta', 4
), 'w3walk:undated-create', 'The plaster ceiling will not take a heavier fitting.') AS res) t \gset

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :CLIENT, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;
SELECT public.confirm_project_decision_review(:'u_id', jsonb_build_object(
  'authorityRevision', (:'u_rev')::int, 'artifactHash', :'u_hash',
  'reviewMethod', 'portal_clickthrough'), 'w3walk:undated-review') AS _;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :DESIGNER, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;
SELECT (public.publish_client_decision(:'u_id')).updated_at AS u_pub \gset
RESET ROLE;

-- ── 2. The door ───────────────────────────────────────────────────────────
-- A service addendum in `sent`, so `signatureGates` draws a leaf and
-- `sign_design_services_agreement_with_trusted_ip` is the act behind it.
INSERT INTO public.proposals (
  id, project_id, designer_id, client_id, designer_client_id, title,
  description, status, document_kind, commercial_state, total_amount,
  subtotal, sent_at, valid_until, created_at, updated_at
)
SELECT
  (:DOORPROP)::uuid, (:PROJECT)::uuid, (:DESIGNER)::uuid, (:CLIENT)::uuid,
  p.designer_client_id,
  'Aspen Loft — Addendum No. 1',
  'An addendum to the engagement: the hall and stair, added to the studio''s scope.',
  'sent', 'service_addendum', 'sent', 240000, 240000,
  now() - interval '3 days', now() + interval '21 days',
  now() - interval '4 days', now() - interval '3 days'
FROM public.proposals p
WHERE p.id = 'b0000000-0000-0000-0000-0000000cd001'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.project_commercial_documents (
  id, project_id, proposal_id, document_kind, wave_name,
  is_origin, created_by
) VALUES (
  (:DOORDOC)::uuid, (:PROJECT)::uuid, (:DOORPROP)::uuid, 'service_addendum',
  NULL, FALSE, (:DESIGNER)::uuid
) ON CONFLICT (id) DO NOTHING;

COMMIT;

\o
\pset format unaligned
\pset tuples_only on
SELECT jsonb_build_object('fifth', :'u_id', 'door', 'b0000000-0000-0000-0000-0000000cd004')::text;
