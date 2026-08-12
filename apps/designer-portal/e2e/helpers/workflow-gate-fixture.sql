-- WP3 workflow-gate e2e fixture — TEARDOWN then SETUP.
--
-- LOCAL STACK ONLY (guarded in `workflow-gate-fixture.ts`).
--
-- The seeds carry no Stage-2 project approvals at all: `plan_issues` and
-- `project_approval_artifacts` are both empty after a reset, so the gate
-- ceremony has nothing to render and the margin has no handoff to show. This
-- builds that population through the real lifecycle RPCs, so every guard,
-- receipt, and derived row stays consistent with what production would hold.
--
-- Two actors are mandatory and not interchangeable:
--   • the studio (designer@patina.dev) creates, publishes, and supersedes;
--   • the decision lead (client@patina.dev) confirms reviews and responds.
-- `set_project_decision_authority` freezes the lead to `projects.client_id`, so
-- calling the review/response RPCs as the designer is rejected outright.
--
-- Decision UUIDs are minted by the RPCs and therefore rotate every run. The
-- script's only stdout is a JSON id map; the TS helper parses it and hands the
-- ids to the spec. Nothing here may be referenced by a hard-coded UUID.

\set ON_ERROR_STOP on
\set QUIET on
\timing off
\pset pager off

\set PROJECT  '''b0000000-0000-0000-0000-0000000000d1'''
\set DESIGNER '''a0000000-0000-0000-0000-000000000004'''
\set CLIENT   '''a0000000-0000-0000-0000-000000000005'''
\set PHASE    '''b0000000-0000-0000-0000-00000005c102'''
\set PHASE_PROC '''b0000000-0000-0000-0000-00000005c103'''
\set ISSUE1   '''ee000000-0000-0000-0000-000000000001'''
\set ISSUE2   '''ee000000-0000-0000-0000-000000000002'''

\ir workflow-gate-teardown.sql

-- Everything below is chatter until the closing summary; only the id map is
-- allowed to reach stdout.
\o /dev/null

BEGIN;

-- ── Artifact source rows ──────────────────────────────────────────────────
-- Direct INSERT, deliberately: `create_plan_issue` demands a full
-- plan_sheets → plan_prints chain that this fixture has no use for, and
-- `plan_issues` carries no INSERT trigger. `set_checksum` must be a lowercase
-- 64-char hex digest because `confirm_project_decision_review` validates the
-- artifact hash as a SHA-256.
SET LOCAL session_replication_role = 'replica';

INSERT INTO public.plan_issues (
  id, project_id, issue_number, name, idempotency_key, request_hash,
  prior_issue_id, set_checksum, sheet_count, issued_at, created_by
) VALUES
  (:ISSUE1, :PROJECT, 901, 'Issue 01 - Design Development Set',
   'e2e-fixture:issue-01', repeat('a1', 32), NULL, repeat('b1', 32), 12,
   now() - interval '20 days', :DESIGNER),
  (:ISSUE2, :PROJECT, 902, 'Issue 02 - Design Development Set, Rev B',
   'e2e-fixture:issue-02', repeat('a2', 32), :ISSUE1, repeat('b2', 32), 13,
   now() - interval '10 days', :DESIGNER);

-- The seeded phases are unclassified, which makes the stage line report "2
-- active phases not classified to a canonical stage" and strips the stage from
-- every gate's provenance microtext. Classify the two live phases so the WP3
-- surfaces have a canonical stage to name. Both pairs satisfy
-- `project_phases_workflow_capability_check`.
UPDATE public.project_phases
   SET canonical_stage_key = 'design_development', workflow_track = 'core'
 WHERE id = :PHASE;
UPDATE public.project_phases
   SET canonical_stage_key = 'bidding_permitting_procurement',
       workflow_track = 'ffe'
 WHERE id = :PHASE_PROC;

SET LOCAL session_replication_role = 'origin';

-- ── Decision authority (studio) ───────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :DESIGNER, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;
SELECT public.set_project_decision_authority(:PROJECT, :CLIENT, NULL, 0) AS _;

-- G1 :: DRAFT, no review confirmation      -> handoff `review_required`
SELECT res->>'decisionId' AS g1_id, res->>'updatedAt' AS g1_upd,
       res->>'artifactHash' AS g1_hash, res->>'authorityRevision' AS g1_rev
FROM (SELECT public.create_project_approval_decision(:PROJECT, jsonb_build_object(
  'title', 'Fixture G1 - Draft awaiting review',
  'question', 'Does the household confirm it reviewed the issued plan set?',
  'context', 'Fixture gate in draft with no review confirmation yet.',
  'dueAt', (now() + interval '14 days')::text,
  'phaseId', :PHASE, 'sectionKey', 'project',
  'artifactKind', 'plan_issue', 'artifactId', :ISSUE1,
  'costCentsDelta', 125000, 'scheduleDaysDelta', 3, 'leadTimeDaysDelta', 7
), 'e2e-fixture:g1-create') AS res) t \gset

-- G2 :: PUBLISHED / pending, future due    -> handoff `response_required`
SELECT res->>'decisionId' AS g2_id, res->>'updatedAt' AS g2_upd,
       res->>'artifactHash' AS g2_hash, res->>'authorityRevision' AS g2_rev
FROM (SELECT public.create_project_approval_decision(:PROJECT, jsonb_build_object(
  'title', 'Fixture G2 - Published, awaiting household response',
  'question', 'Approve the issued Design Development plan set?',
  'context', 'Fixture gate published and pending a household response.',
  'dueAt', (now() + interval '10 days')::text,
  'phaseId', :PHASE, 'sectionKey', 'project',
  'artifactKind', 'plan_issue', 'artifactId', :ISSUE1,
  'costCentsDelta', 0, 'scheduleDaysDelta', 0, 'leadTimeDaysDelta', 0
), 'e2e-fixture:g2-create') AS res) t \gset

-- G3 :: APPROVED (settled, sealed, APPROVED stamp)
SELECT res->>'decisionId' AS g3_id, res->>'updatedAt' AS g3_upd,
       res->>'artifactHash' AS g3_hash, res->>'authorityRevision' AS g3_rev
FROM (SELECT public.create_project_approval_decision(:PROJECT, jsonb_build_object(
  'title', 'Fixture G3 - Approved and sealed',
  'question', 'Approve the issued plan set so procurement may proceed?',
  'context', 'Fixture gate the household approved.',
  'dueAt', (now() + interval '9 days')::text,
  'phaseId', :PHASE, 'sectionKey', 'project',
  'artifactKind', 'plan_issue', 'artifactId', :ISSUE1,
  'costCentsDelta', -48000, 'scheduleDaysDelta', -2, 'leadTimeDaysDelta', 0
), 'e2e-fixture:g3-create') AS res) t \gset

-- G4 :: the edition that gets SUPERSEDED (published first)
SELECT res->>'decisionId' AS g4_id, res->>'updatedAt' AS g4_upd,
       res->>'artifactHash' AS g4_hash, res->>'authorityRevision' AS g4_rev
FROM (SELECT public.create_project_approval_decision(:PROJECT, jsonb_build_object(
  'title', 'Fixture G4 - Superseded edition',
  'question', 'Approve Issue 01 of the plan set?',
  'context', 'Fixture gate replaced by a later edition.',
  'dueAt', (now() + interval '8 days')::text,
  'phaseId', :PHASE, 'sectionKey', 'project',
  'artifactKind', 'plan_issue', 'artifactId', :ISSUE1,
  'costCentsDelta', 310000, 'scheduleDaysDelta', 5, 'leadTimeDaysDelta', 14
), 'e2e-fixture:g4-create') AS res) t \gset

-- G6 :: OVERDUE pending gate (created in the future, backdated at the end)
SELECT res->>'decisionId' AS g6_id, res->>'updatedAt' AS g6_upd,
       res->>'artifactHash' AS g6_hash, res->>'authorityRevision' AS g6_rev
FROM (SELECT public.create_project_approval_decision(:PROJECT, jsonb_build_object(
  'title', 'Fixture G6 - Overdue household response',
  'question', 'Approve the issued plan set? This response is past due.',
  'context', 'Fixture gate whose response window has lapsed.',
  'dueAt', (now() + interval '1 day')::text,
  'phaseId', :PHASE, 'sectionKey', 'project',
  'artifactKind', 'plan_issue', 'artifactId', :ISSUE2,
  'costCentsDelta', 97500, 'scheduleDaysDelta', 11, 'leadTimeDaysDelta', 21
), 'e2e-fixture:g6-create') AS res) t \gset

-- G7 :: DRAFT with its review complete     -> handoff `ready_to_publish`
SELECT res->>'decisionId' AS g7_id, res->>'updatedAt' AS g7_upd,
       res->>'artifactHash' AS g7_hash, res->>'authorityRevision' AS g7_rev
FROM (SELECT public.create_project_approval_decision(:PROJECT, jsonb_build_object(
  'title', 'Fixture G7 - Draft ready to publish',
  'question', 'Approve the issued plan set? Awaiting studio publication.',
  'context', 'Fixture gate reviewed and ready for the studio to publish.',
  'dueAt', (now() + interval '16 days')::text,
  'phaseId', :PHASE, 'sectionKey', 'project',
  'artifactKind', 'plan_issue', 'artifactId', :ISSUE2,
  'costCentsDelta', 62500, 'scheduleDaysDelta', 1, 'leadTimeDaysDelta', 4
), 'e2e-fixture:g7-create') AS res) t \gset

-- G8 :: RESPONDED `changes_requested` — bounced, so it stays in the margin
SELECT res->>'decisionId' AS g8_id, res->>'updatedAt' AS g8_upd,
       res->>'artifactHash' AS g8_hash, res->>'authorityRevision' AS g8_rev
FROM (SELECT public.create_project_approval_decision(:PROJECT, jsonb_build_object(
  'title', 'Fixture G8 - Changes requested',
  'question', 'Approve the issued plan set as drawn?',
  'context', 'Fixture gate the household returned with changes requested.',
  'dueAt', (now() + interval '6 days')::text,
  'phaseId', :PHASE, 'sectionKey', 'project',
  'artifactKind', 'plan_issue', 'artifactId', :ISSUE1,
  'costCentsDelta', 154000, 'scheduleDaysDelta', 8, 'leadTimeDaysDelta', 12
), 'e2e-fixture:g8-create') AS res) t \gset

-- ── Review confirmations :: the frozen decision lead only ─────────────────
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :CLIENT, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;

SELECT public.confirm_project_decision_review(:'g2_id', jsonb_build_object(
  'authorityRevision', (:'g2_rev')::int, 'artifactHash', :'g2_hash',
  'reviewMethod', 'portal_clickthrough'), 'e2e-fixture:g2-review') AS _;
SELECT public.confirm_project_decision_review(:'g3_id', jsonb_build_object(
  'authorityRevision', (:'g3_rev')::int, 'artifactHash', :'g3_hash',
  'reviewMethod', 'portal_clickthrough'), 'e2e-fixture:g3-review') AS _;
SELECT public.confirm_project_decision_review(:'g4_id', jsonb_build_object(
  'authorityRevision', (:'g4_rev')::int, 'artifactHash', :'g4_hash',
  'reviewMethod', 'portal_clickthrough'), 'e2e-fixture:g4-review') AS _;
SELECT public.confirm_project_decision_review(:'g6_id', jsonb_build_object(
  'authorityRevision', (:'g6_rev')::int, 'artifactHash', :'g6_hash',
  'reviewMethod', 'portal_clickthrough'), 'e2e-fixture:g6-review') AS _;
SELECT public.confirm_project_decision_review(:'g7_id', jsonb_build_object(
  'authorityRevision', (:'g7_rev')::int, 'artifactHash', :'g7_hash',
  'reviewMethod', 'portal_clickthrough'), 'e2e-fixture:g7-review') AS _;
SELECT public.confirm_project_decision_review(:'g8_id', jsonb_build_object(
  'authorityRevision', (:'g8_rev')::int, 'artifactHash', :'g8_hash',
  'reviewMethod', 'portal_clickthrough'), 'e2e-fixture:g8-review') AS _;

-- ── Publish :: studio. G1 and G7 stay draft on purpose ────────────────────
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :DESIGNER, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;

SELECT (public.publish_client_decision(:'g2_id')).updated_at AS g2_pub_upd \gset
SELECT (public.publish_client_decision(:'g3_id')).updated_at AS g3_pub_upd \gset
SELECT (public.publish_client_decision(:'g4_id')).updated_at AS g4_pub_upd \gset
SELECT (public.publish_client_decision(:'g6_id')).updated_at AS g6_pub_upd \gset
SELECT (public.publish_client_decision(:'g8_id')).updated_at AS g8_pub_upd \gset

-- ── Responses :: the frozen decision lead only ────────────────────────────
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :CLIENT, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;

SELECT public.respond_project_approval(:'g3_id',
  jsonb_build_object('outcome','approved'),
  (:'g3_pub_upd')::timestamptz, 'e2e-fixture:g3-respond') AS _;
SELECT public.respond_project_approval(:'g8_id',
  jsonb_build_object('outcome','changes_requested'),
  (:'g8_pub_upd')::timestamptz, 'e2e-fixture:g8-respond') AS _;

-- ── G4 supersede :: studio; mints the G5 successor draft ──────────────────
RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :DESIGNER, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;

SELECT res->>'successorDecisionId' AS g5_id
FROM (SELECT public.supersede_project_approval_decision(:'g4_id',
  jsonb_build_object(
    'title', 'Fixture G5 - Successor edition',
    'question', 'Approve Issue 02 of the plan set, superseding Issue 01?',
    'context', 'Fixture successor to the superseded edition.',
    'dueAt', (now() + interval '12 days')::text,
    'artifactKind', 'plan_issue', 'artifactId', :ISSUE2,
    'costCentsDelta', 275000, 'scheduleDaysDelta', 4, 'leadTimeDaysDelta', 10),
  (:'g4_pub_upd')::timestamptz, 'e2e-fixture:g4-supersede') AS res) t \gset

-- G5 is carried all the way to `approved`. The predecessor link ("Edition 901
-- superseded — view") renders only on a SEALED row, and a settled successor is
-- the only state where a sealed row also has a predecessor — a draft successor
-- renders the unfolded ceremony instead and shows no link at all.
-- The supersede result names the successor but not its frozen evidence, so
-- both halves of the review payload are read back from the rows it wrote.
SELECT artifact_hash AS g5_hash
  FROM public.project_approval_artifacts
 WHERE decision_id = (:'g5_id')::uuid \gset
SELECT authority_revision AS g5_rev
  FROM public.project_decision_authority_snapshots
 WHERE decision_id = (:'g5_id')::uuid \gset

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :CLIENT, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;
SELECT public.confirm_project_decision_review(:'g5_id', jsonb_build_object(
  'authorityRevision', (:'g5_rev')::int, 'artifactHash', :'g5_hash',
  'reviewMethod', 'portal_clickthrough'), 'e2e-fixture:g5-review') AS _;

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :DESIGNER, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;
SELECT (public.publish_client_decision(:'g5_id')).updated_at AS g5_pub_upd \gset

RESET ROLE;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :CLIENT, 'role','authenticated')::text, true) AS _;
SET LOCAL ROLE authenticated;
SELECT public.respond_project_approval(:'g5_id',
  jsonb_build_object('outcome','approved'),
  (:'g5_pub_upd')::timestamptz, 'e2e-fixture:g5-respond') AS _;

RESET ROLE;

-- ── G6 backdate + deterministic record order ──────────────────────────────
-- `create_project_approval_decision` rejects a due moment in the past, and
-- afterwards `guard_stage2_client_decision_edge` keeps `due_date` out of its
-- mutable-column allow-list while `guard_project_approval_evidence_edge` makes
-- `project_approval_artifacts` append-only. Replica mode is the only route to
-- a lapsed gate. Both columns move together: the handoff projection joins on
-- `artifact.due_at IS NOT DISTINCT FROM decision.due_date`, so moving one alone
-- makes the gate vanish from the rail rather than turn overdue.
SET LOCAL session_replication_role = 'replica';
UPDATE public.client_decisions
   SET due_date = now() - interval '5 days' WHERE id = (:'g6_id')::uuid;
UPDATE public.project_approval_artifacts
   SET due_at   = now() - interval '5 days' WHERE decision_id = (:'g6_id')::uuid;

-- `get_project_decision_reviews` sorts by (created_at, id); every fixture row
-- is born inside one transaction, so without this the Approval record's order
-- is arbitrary per run. Cosmetic only — the specs key on ids.
UPDATE public.client_decisions AS d
   SET created_at = now() - interval '8 hours' + (ord.n * interval '1 minute')
  FROM (VALUES
    ((:'g1_id')::uuid, 1), ((:'g2_id')::uuid, 2), ((:'g3_id')::uuid, 3),
    ((:'g4_id')::uuid, 4), ((:'g5_id')::uuid, 5), ((:'g6_id')::uuid, 6),
    ((:'g7_id')::uuid, 7), ((:'g8_id')::uuid, 8)
  ) AS ord(id, n)
 WHERE d.id = ord.id;
SET LOCAL session_replication_role = 'origin';

COMMIT;

\o
\pset format unaligned
\pset tuples_only on
SELECT jsonb_build_object(
  'projectId', :PROJECT,
  'draft', :'g1_id',
  'pending', :'g2_id',
  'approved', :'g3_id',
  'superseded', :'g4_id',
  'successor', :'g5_id',
  'overdue', :'g6_id',
  'readyToPublish', :'g7_id',
  'changesRequested', :'g8_id'
)::text;
