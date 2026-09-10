-- document_state.subject regression (00590, R4 of the Standing Head)
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/document/document_state_subject_test.sql

\set ON_ERROR_STOP on

BEGIN;

-- ── Fixture: a fresh client profile against an existing seeded designer ─────
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('e5900000-0000-4000-8000-000000000001', 'subj-client@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('e5900000-0000-4000-8000-000000000001', 'subj-client@test.invalid', 'Subject Test Client', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- A designer_clients row (status='lead' — Shape D of document_state) for an
-- existing seeded designer, carrying the studio-written subject (R4).
INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source, subject
)
SELECT
  'e5910000-0000-4000-8000-000000000001',
  p.id,
  'e5900000-0000-4000-8000-000000000001',
  'Subject Test Client',
  'lead',
  'direct',
  'Whole-house refresh · Beaverdale foursquare'
FROM public.profiles p
WHERE p.role = 'designer'
LIMIT 1;

-- A pre-signing proposal chain (Shape B) carrying the studio-written subject.
-- client_id and designer_client_id stay NULL so neither the engagement link nor
-- the legacy designer/client pair heuristic can suppress the Shape D leg above.
INSERT INTO public.proposals (
  id, designer_id, client_id, designer_client_id, project_id, parent_proposal_id,
  title, status, version, subject
)
SELECT
  'e5920000-0000-4000-8000-000000000001',
  p.id,
  NULL,
  NULL,
  NULL,
  NULL,
  'Subject Test Proposal',
  'draft',
  1,
  'Direction for the foursquare'
FROM public.profiles p
WHERE p.role = 'designer'
LIMIT 1;

-- An open lead (Shape C) carrying the studio-written subject. homeowner_id stays
-- NULL for the same reason.
INSERT INTO public.leads (
  id, designer_id, homeowner_id, project_type, status, subject
)
SELECT
  'e5930000-0000-4000-8000-000000000001',
  p.id,
  NULL,
  'full_house',
  'new',
  'Beaverdale foursquare — first call'
FROM public.profiles p
WHERE p.role = 'designer'
LIMIT 1;

DO $$
DECLARE
  v_dc_id       uuid := 'e5910000-0000-4000-8000-000000000001';
  v_project     uuid := 'b0000000-0000-0000-0000-0000000000d1';
  v_proposal    uuid := 'e5920000-0000-4000-8000-000000000001';
  v_lead        uuid := 'e5930000-0000-4000-8000-000000000001';
BEGIN
  -- The relationship leg (Shape D) reads the studio-written subject through
  -- dc.subject at the same ordinal position as every other leg.
  ASSERT (
    SELECT subject FROM public.document_state
    WHERE engagement_kind = 'relationship' AND engagement_id = v_dc_id
  ) = 'Whole-house refresh · Beaverdale foursquare',
    'relationship leg did not read the studio-written subject through document_state';

  -- A project row that has never had a subject written to it reads null
  -- through the view — the assembled line is never written back (R4).
  ASSERT (
    SELECT subject FROM public.document_state
    WHERE engagement_kind = 'project' AND engagement_id = v_project
  ) IS NULL,
    'project leg with no studio-written subject must read null, not an assembled line';

  -- The proposal leg (Shape B) reads pr.subject. The engagement_id is the
  -- CHAIN ROOT — coalesce(parent_proposal_id, id) — which for a first version
  -- is the proposal's own id.
  ASSERT (
    SELECT subject FROM public.document_state
    WHERE engagement_kind = 'proposal' AND engagement_id = v_proposal
  ) = 'Direction for the foursquare',
    'proposal leg did not read the studio-written subject through document_state';

  -- The lead leg (Shape C) reads l.subject.
  ASSERT (
    SELECT subject FROM public.document_state
    WHERE engagement_kind = 'lead' AND engagement_id = v_lead
  ) = 'Beaverdale foursquare — first call',
    'lead leg did not read the studio-written subject through document_state';
END $$;

ROLLBACK;
