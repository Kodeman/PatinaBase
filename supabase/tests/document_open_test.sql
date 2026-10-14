-- ═══════════════════════════════════════════════════════════════════════════
-- 00792 — document_open branches and RLS (pgTAP, US-34 N9)
--
-- document_open replaces useDocumentEngagement's six sequential reads. Each
-- branch gets a fixture that only that branch can answer, so a missing or
-- reordered leg resolves the id somewhere else and fails here:
--   engagement  project (with its ids), proposal chain (root and live
--               version), relationship (and its accepted lead)
--   R6          an activated proposal's id → its project
--   F1          an accepted lead whose relationship left shape D → the
--               relationship
--   J6          a relationship's activated chain → the project; its live
--               chain → the chain root; two duplicate roots → the oldest
--               (NAV-1)
--   R21         a decision → its project, else its relationship
--   missing     a relationship with nothing to answer it, and an unknown id
-- The outsider, from another studio, must resolve every one to 'missing'.
--
-- Run: supabase test db supabase/tests/document_open_test.sql
--  or: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/document_open_test.sql
-- Everything is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(24);

-- ── grants and security ────────────────────────────────────────────────────
SELECT ok(
  has_function_privilege('authenticated', 'public.document_open(uuid)', 'EXECUTE'),
  'authenticated can call document_open'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.document_open(uuid)', 'EXECUTE'),
  'anon cannot call document_open'
);
SELECT ok(
  NOT has_function_privilege('service_role', 'public.document_open(uuid)', 'EXECUTE'),
  'service_role is not granted document_open'
);
SELECT ok(
  NOT (SELECT p.prosecdef FROM pg_proc AS p WHERE p.oid = 'public.document_open(uuid)'::regprocedure),
  'document_open is SECURITY INVOKER, so RLS decides every read'
);
SELECT is(
  (SELECT p.provolatile::text FROM pg_proc AS p WHERE p.oid = 'public.document_open(uuid)'::regprocedure),
  's',
  'document_open is STABLE'
);

-- ── fixtures (as postgres), all Leah's, in her studio b0…01 ────────────────
-- Leah (owner)            a0000000-0000-0000-0000-000000000004
-- Studio Manager          a0000000-0000-0000-0000-000000000003 (made the job's lead)
-- Outsider (other studio) cf100000-0000-4000-8000-000000000001
-- Fixture ids             d7920000-0000-4000-8000-0000000000NN (job: …41)
INSERT INTO public.leads (id, designer_id, project_type, status) VALUES
  ('d7920000-0000-4000-8000-000000000011', 'a0000000-0000-0000-0000-000000000004', 'living_room', 'accepted'),
  ('d7920000-0000-4000-8000-000000000012', 'a0000000-0000-0000-0000-000000000004', 'kitchen', 'accepted');

INSERT INTO public.designer_clients (id, designer_id, client_name, status, lead_id) VALUES
  -- DC_A: signed; its proposal activated the job (J6 activated, project ids)
  ('d7920000-0000-4000-8000-000000000001', 'a0000000-0000-0000-0000-000000000004', 'N9 Signed', 'active', NULL),
  -- DC_B: a proposal chain whose root was revised (J6 live, shape B ids)
  ('d7920000-0000-4000-8000-000000000002', 'a0000000-0000-0000-0000-000000000004', 'N9 Proposal', 'proposal', NULL),
  -- DC_N: two duplicate-mode roots (NAV-1)
  ('d7920000-0000-4000-8000-000000000003', 'a0000000-0000-0000-0000-000000000004', 'N9 Duplicates', 'proposal', NULL),
  -- DC_D: a Discovery relationship (shape D) from accepted lead L_D
  ('d7920000-0000-4000-8000-000000000004', 'a0000000-0000-0000-0000-000000000004', 'N9 Discovery', 'lead',
   'd7920000-0000-4000-8000-000000000011'),
  -- DC_F: accepted lead L_F's relationship, past shape D (F1 target)
  ('d7920000-0000-4000-8000-000000000005', 'a0000000-0000-0000-0000-000000000004', 'N9 Active', 'active',
   'd7920000-0000-4000-8000-000000000012');

INSERT INTO public.proposals
  (id, designer_id, title, status, project_id, designer_client_id, version, parent_proposal_id, created_at)
VALUES
  -- P_A: DC_A's activated proposal (R6 source; the job's own proposal)
  ('d7920000-0000-4000-8000-000000000021', 'a0000000-0000-0000-0000-000000000004', 'N9 signed', 'accepted',
   NULL, 'd7920000-0000-4000-8000-000000000001', 1, NULL, now() - interval '5 days'),
  -- P_B1 (root, revised) and P_B2 (live revision) of DC_B's chain
  ('d7920000-0000-4000-8000-000000000022', 'a0000000-0000-0000-0000-000000000004', 'N9 chain', 'revised',
   NULL, 'd7920000-0000-4000-8000-000000000002', 1, NULL, now() - interval '2 days'),
  ('d7920000-0000-4000-8000-000000000023', 'a0000000-0000-0000-0000-000000000004', 'N9 chain', 'sent',
   NULL, 'd7920000-0000-4000-8000-000000000002', 2, 'd7920000-0000-4000-8000-000000000022', now() - interval '1 day'),
  -- DC_N's duplicates, the newer one inserted first
  ('d7920000-0000-4000-8000-000000000025', 'a0000000-0000-0000-0000-000000000004', 'N9 newer duplicate', 'draft',
   NULL, 'd7920000-0000-4000-8000-000000000003', 1, NULL, '2026-02-01T00:00:00Z'),
  ('d7920000-0000-4000-8000-000000000024', 'a0000000-0000-0000-0000-000000000004', 'N9 older duplicate', 'draft',
   NULL, 'd7920000-0000-4000-8000-000000000003', 1, NULL, '2026-01-01T00:00:00Z');

-- Activate P_A as a job the way activate_proposal_as_project does: project
-- provenance can only be written on insert, under the activation setting.
SELECT set_config('app.proposal_activation_id', 'd7920000-0000-4000-8000-000000000021', true);
INSERT INTO public.projects (id, name, created_by, designer_id, studio_id, status, proposal_id)
VALUES ('d7920000-0000-4000-8000-000000000041', 'N9 Signed Job', 'a0000000-0000-0000-0000-000000000004',
        'a0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000001', 'active',
        'd7920000-0000-4000-8000-000000000021');
UPDATE public.proposals
SET project_id = 'd7920000-0000-4000-8000-000000000041'
WHERE id = 'd7920000-0000-4000-8000-000000000021';

-- The team's active lead outranks projects.lead_designer_id (Leah).
INSERT INTO public.project_team_members (project_id, user_id, role)
VALUES ('d7920000-0000-4000-8000-000000000041', 'a0000000-0000-0000-0000-000000000003', 'lead_designer');

INSERT INTO public.client_decisions (id, designer_id, designer_client_id, project_id, title) VALUES
  ('d7920000-0000-4000-8000-000000000031', 'a0000000-0000-0000-0000-000000000004',
   'd7920000-0000-4000-8000-000000000001', 'd7920000-0000-4000-8000-000000000041', 'N9 project decision'),
  ('d7920000-0000-4000-8000-000000000032', 'a0000000-0000-0000-0000-000000000004',
   'd7920000-0000-4000-8000-000000000004', NULL, 'N9 relationship decision');

-- Every id the cases below open, for the outsider sweep.
CREATE TEMP TABLE open_ids (id uuid);
INSERT INTO open_ids (id) VALUES
  ('d7920000-0000-4000-8000-000000000041'),
  ('d7920000-0000-4000-8000-000000000001'), ('d7920000-0000-4000-8000-000000000002'),
  ('d7920000-0000-4000-8000-000000000003'), ('d7920000-0000-4000-8000-000000000004'),
  ('d7920000-0000-4000-8000-000000000005'), ('d7920000-0000-4000-8000-000000000011'),
  ('d7920000-0000-4000-8000-000000000012'), ('d7920000-0000-4000-8000-000000000021'),
  ('d7920000-0000-4000-8000-000000000022'), ('d7920000-0000-4000-8000-000000000023'),
  ('d7920000-0000-4000-8000-000000000031'), ('d7920000-0000-4000-8000-000000000032');

CREATE TEMP TABLE opens (who text, id uuid, res jsonb, direct_row jsonb);
GRANT ALL ON opens, open_ids TO authenticated;

-- ── read as each identity ──────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
INSERT INTO opens
SELECT 'owner', o.id, public.document_open(o.id),
       (SELECT to_jsonb(d) FROM public.document_state AS d WHERE d.engagement_id = o.id)
FROM (SELECT id FROM open_ids UNION ALL SELECT 'd7920000-0000-4000-8000-000000000099'::uuid) AS o;
RESET ROLE;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cf100000-0000-4000-8000-000000000001","role":"authenticated"}';
INSERT INTO opens SELECT 'outsider', o.id, public.document_open(o.id), NULL FROM open_ids AS o;
RESET ROLE;

CREATE FUNCTION pg_temp.opened(p_id text) RETURNS jsonb
LANGUAGE sql STABLE AS $$
  SELECT o.res FROM opens AS o WHERE o.who = 'owner' AND o.id = p_id::uuid
$$;

-- ── engagement ─────────────────────────────────────────────────────────────
SELECT is(
  pg_temp.opened('d7920000-0000-4000-8000-000000000041')->'row',
  (SELECT o.direct_row FROM opens AS o
   WHERE o.who = 'owner' AND o.id = 'd7920000-0000-4000-8000-000000000041'),
  'engagement: a project id answers its document_state row, as the direct read returns it'
);
SELECT is(
  pg_temp.opened('d7920000-0000-4000-8000-000000000041')->'ids',
  jsonb_build_object(
    'project_id', 'd7920000-0000-4000-8000-000000000041',
    'proposal_id', NULL,
    'lead_id', NULL,
    'designer_client_id', 'd7920000-0000-4000-8000-000000000001',
    'studio_id', 'b0000000-0000-0000-0000-000000000001',
    'lead_user_id', 'a0000000-0000-0000-0000-000000000003'),
  'engagement ids (project): its proposal''s relationship, its studio, and its active team lead'
);
SELECT is(
  pg_temp.opened('d7920000-0000-4000-8000-000000000022') - 'row',
  jsonb_build_object(
    'kind', 'engagement',
    'ids', jsonb_build_object(
      'project_id', NULL,
      'proposal_id', 'd7920000-0000-4000-8000-000000000023',
      'lead_id', NULL,
      'designer_client_id', 'd7920000-0000-4000-8000-000000000002',
      'studio_id', NULL,
      'lead_user_id', NULL)),
  'engagement ids (proposal): the live version and its relationship, no studio or lead'
);
SELECT is(
  pg_temp.opened('d7920000-0000-4000-8000-000000000022')->'row',
  (SELECT o.direct_row FROM opens AS o
   WHERE o.who = 'owner' AND o.id = 'd7920000-0000-4000-8000-000000000022'),
  'engagement: a chain root answers its shape B row, as the direct read returns it'
);
SELECT is(
  pg_temp.opened('d7920000-0000-4000-8000-000000000023')->'row'->>'engagement_id',
  'd7920000-0000-4000-8000-000000000022',
  'engagement: the live version''s id answers the same chain row'
);
SELECT is(
  pg_temp.opened('d7920000-0000-4000-8000-000000000004') - 'row',
  jsonb_build_object(
    'kind', 'engagement',
    'ids', jsonb_build_object(
      'project_id', NULL,
      'proposal_id', NULL,
      'lead_id', 'd7920000-0000-4000-8000-000000000011',
      'designer_client_id', 'd7920000-0000-4000-8000-000000000004',
      'studio_id', NULL,
      'lead_user_id', NULL)),
  'engagement ids (relationship): the relationship is its own designer_client_id'
);
SELECT is(
  pg_temp.opened('d7920000-0000-4000-8000-000000000011')->'row'->>'engagement_id',
  'd7920000-0000-4000-8000-000000000004',
  'engagement: an accepted lead still in Discovery answers its relationship''s row directly'
);

-- ── R6 ─────────────────────────────────────────────────────────────────────
SELECT is(
  pg_temp.opened('d7920000-0000-4000-8000-000000000021'),
  '{"kind": "redirect", "projectId": "d7920000-0000-4000-8000-000000000041"}'::jsonb,
  'R6: an activated proposal redirects to its project'
);

-- ── F1 ─────────────────────────────────────────────────────────────────────
SELECT is(
  pg_temp.opened('d7920000-0000-4000-8000-000000000012'),
  '{"kind": "redirect", "projectId": "d7920000-0000-4000-8000-000000000005"}'::jsonb,
  'F1: an accepted lead redirects to its relationship'
);

-- ── J6 ─────────────────────────────────────────────────────────────────────
SELECT is(
  pg_temp.opened('d7920000-0000-4000-8000-000000000001'),
  '{"kind": "redirect", "projectId": "d7920000-0000-4000-8000-000000000041"}'::jsonb,
  'J6: a relationship whose chain activated redirects to the project'
);
SELECT is(
  pg_temp.opened('d7920000-0000-4000-8000-000000000002'),
  '{"kind": "redirect", "projectId": "d7920000-0000-4000-8000-000000000022"}'::jsonb,
  'J6: a relationship whose live row is a later revision redirects to the chain root'
);
SELECT is(
  pg_temp.opened('d7920000-0000-4000-8000-000000000003'),
  '{"kind": "redirect", "projectId": "d7920000-0000-4000-8000-000000000024"}'::jsonb,
  'J6 NAV-1: two duplicate-mode roots resolve to the oldest'
);

-- ── R21 ────────────────────────────────────────────────────────────────────
SELECT is(
  pg_temp.opened('d7920000-0000-4000-8000-000000000031'),
  '{"kind": "redirect", "projectId": "d7920000-0000-4000-8000-000000000041"}'::jsonb,
  'R21: a decision redirects to its project'
);
SELECT is(
  pg_temp.opened('d7920000-0000-4000-8000-000000000032'),
  '{"kind": "redirect", "projectId": "d7920000-0000-4000-8000-000000000004"}'::jsonb,
  'R21: a decision with no project redirects to its relationship'
);

-- ── missing ────────────────────────────────────────────────────────────────
SELECT is(
  pg_temp.opened('d7920000-0000-4000-8000-000000000005'),
  '{"kind": "missing"}'::jsonb,
  'missing: a relationship past Discovery with no chain or decision answers nothing'
);
SELECT is(
  pg_temp.opened('d7920000-0000-4000-8000-000000000099'),
  '{"kind": "missing"}'::jsonb,
  'missing: an unknown id'
);

-- ── RLS: the outsider ──────────────────────────────────────────────────────
SELECT is(
  (SELECT count(*)::int FROM opens AS o WHERE o.who = 'owner' AND o.res->>'kind' <> 'missing'),
  12,
  'owner: every fixture id but the stale relationship resolves'
);
SELECT is(
  (SELECT count(*)::int FROM opens AS o WHERE o.who = 'outsider'),
  13,
  'outsider opened every fixture id'
);
SELECT is(
  ARRAY(SELECT o.id::text FROM opens AS o
        WHERE o.who = 'outsider' AND o.res <> '{"kind": "missing"}'::jsonb
        ORDER BY o.id),
  '{}'::text[],
  'outsider from another studio gets nothing: every id is missing, with no row, ids or redirect'
);

SELECT * FROM finish();
ROLLBACK;
