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

DO $$
DECLARE
  v_dc_id     uuid := 'e5910000-0000-4000-8000-000000000001';
  v_project   uuid := 'b0000000-0000-0000-0000-0000000000d1';
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
END $$;

ROLLBACK;
