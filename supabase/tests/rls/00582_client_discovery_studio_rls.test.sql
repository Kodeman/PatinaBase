-- ═══════════════════════════════════════════════════════════════════════════
-- 00582 — a studio co-member reaches the Discovery row and its folio
--
-- NOTE ON STYLE: supabase/tests/** is not pgTAP. Every file in that tree is a
-- plain psql script — BEGIN, fixtures, pg_temp role-assumption helpers, DO
-- blocks of ASSERTs, ROLLBACK — run under ON_ERROR_STOP=1. This file follows
-- rls/00563_proposal_signing_multi_studio.test.sql.
--
-- Run (single file, for iteration):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/00582_client_discovery_studio_rls.test.sql
--
-- Run (the actual gate — whole suite against KNOWN_FAILURES.md):
--   bash scripts/run-sql-tests.sh -f 00582
--
-- Fixture, all seeded by a local reset:
--   designer  a0000000-…-0004  owner, Local Dev Studio b0000000-…-0001
--   co-member a0000000-…-0003  admin of the SAME studio (seed/organizations.sql)
--   outsider  cf100000-…-0001  owner of a DIFFERENT studio, shares no org with
--                              the designer (seed/cloudflare-phase1-staging.sql)
--   engagement designer_clients(designer_id = …0004, client_id = …0005)
--
-- Covers, against migration 00582:
--   1. the reported production failure: a co-member SELECTs the designer's
--      client_discovery row, and the portal's auto-upsert
--      (ON CONFLICT (designer_client_id)) carrying the ENGAGEMENT OWNER's
--      designer_id lands instead of raising 42501
--   2. the widening does not leak: a member of a different studio can neither
--      see nor write that row
--   3. the discovery folio moves with it: a co-member SELECTs and INSERTs a
--      discovery-anchored project_documents row
--   4. and does not leak either: the outsider can do neither
-- Every section runs inside a SAVEPOINT and the file ROLLBACKs.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ─── helpers (same shape as 00563_proposal_signing_multi_studio.test.sql) ───
-- The GRANT after each definition is required: 00483 revokes database
-- TEMPORARY from authenticated/anon/service_role, so a restricted role cannot
-- reach a pg_temp function without it.

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.engagement()
RETURNS uuid AS $$
  SELECT id FROM public.designer_clients
   WHERE designer_id = 'a0000000-0000-0000-0000-000000000004'
     AND client_id   = 'a0000000-0000-0000-0000-000000000005'
   ORDER BY created_at, id
   LIMIT 1;
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION pg_temp.engagement() TO PUBLIC;

-- ─── fixture preconditions ─────────────────────────────────────────────────

DO $$
DECLARE
  v_engagement uuid := pg_temp.engagement();
  v_comember_sees_designer boolean;
  v_comember_sees_designer_ds boolean;
  v_outsider_sees_designer boolean;
  v_outsider_sees_designer_ds boolean;
BEGIN
  ASSERT v_engagement IS NOT NULL,
    'FIXTURE: the seeded designer↔client engagement must exist '
    '(seed/designer-clients.sql)';

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  v_comember_sees_designer :=
    public.is_studio_comember('a0000000-0000-0000-0000-000000000004');
  v_comember_sees_designer_ds :=
    public.is_design_studio_comember('a0000000-0000-0000-0000-000000000004');
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');
  v_outsider_sees_designer :=
    public.is_studio_comember('a0000000-0000-0000-0000-000000000004');
  v_outsider_sees_designer_ds :=
    public.is_design_studio_comember('a0000000-0000-0000-0000-000000000004');
  PERFORM pg_temp.reset_role();

  ASSERT v_comember_sees_designer AND v_comember_sees_designer_ds,
    'FIXTURE: a0000000-…-0003 must be a studio co-member of the designer under '
    'BOTH helpers or nothing below proves the widening';
  ASSERT NOT v_outsider_sees_designer AND NOT v_outsider_sees_designer_ds,
    'FIXTURE: cf100000-…-0001 must NOT be a co-member of the designer under '
    'either helper or the leak sections prove nothing';

  RAISE NOTICE '00582 fixture: engagement %', v_engagement;
END $$;

-- The production shape: a Discovery row that already exists, owned by the
-- engagement's designer. Written as postgres (RLS-exempt) so the sections below
-- measure the READER's authority, not the writer's.
INSERT INTO public.client_discovery
  (designer_client_id, designer_id, project_type, site_notes)
VALUES
  (pg_temp.engagement(), 'a0000000-0000-0000-0000-000000000004',
   'full_room', '00582 fixture row')
ON CONFLICT (designer_client_id) DO UPDATE
  SET designer_id = EXCLUDED.designer_id,
      site_notes  = EXCLUDED.site_notes;

INSERT INTO public.project_documents
  (id, designer_client_id, title, doc_type, section_key, uploaded_by)
VALUES
  ('58200000-0000-4000-8000-000000000001'::uuid, pg_temp.engagement(),
   '00582 fixture folio file', 'img', 'discovery',
   'a0000000-0000-0000-0000-000000000004')
ON CONFLICT (id) DO NOTHING;

-- ─── 1. the co-member reads the row, and the portal's upsert lands ─────────

SAVEPOINT s_comember;

DO $$
DECLARE
  v_engagement uuid := pg_temp.engagement();
  v_seen integer;
  v_notes text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  SELECT count(*) INTO v_seen
    FROM public.client_discovery
   WHERE designer_client_id = v_engagement;
  ASSERT v_seen = 1,
    'FAIL 1a: a studio co-member must SELECT the designer''s discovery row; '
    'got ' || v_seen || ' rows';

  -- useUpsertDiscovery (packages/supabase/src/hooks/use-discovery.ts) sends the
  -- ENGAGEMENT OWNER's designer_id, not the caller's. This exact statement is
  -- what raised "new row violates row-level security policy" in production.
  INSERT INTO public.client_discovery
    (designer_client_id, designer_id, project_type, site_notes)
  VALUES
    (v_engagement, 'a0000000-0000-0000-0000-000000000004',
     'full_room', '00582 co-member upsert')
  ON CONFLICT (designer_client_id) DO UPDATE
    SET project_type = EXCLUDED.project_type,
        site_notes   = EXCLUDED.site_notes;

  SELECT site_notes INTO v_notes
    FROM public.client_discovery
   WHERE designer_client_id = v_engagement;
  ASSERT v_notes = '00582 co-member upsert',
    'FAIL 1b: the co-member''s upsert must be readable back, got '
      || COALESCE(v_notes, '<null>');

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00582 section 1 passed: co-member read + upsert';
END $$;

ROLLBACK TO SAVEPOINT s_comember;

-- ─── 2. a member of a different studio still cannot see or write it ────────

SAVEPOINT s_outsider;

DO $$
DECLARE
  v_engagement uuid := pg_temp.engagement();
  v_seen integer;
  v_blocked boolean := false;
BEGIN
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_seen
    FROM public.client_discovery
   WHERE designer_client_id = v_engagement;
  ASSERT v_seen = 0,
    'FAIL 2a: a member of another studio must not see the discovery row; got '
      || v_seen || ' rows';

  BEGIN
    INSERT INTO public.client_discovery
      (designer_client_id, designer_id, project_type)
    VALUES (v_engagement, 'a0000000-0000-0000-0000-000000000004', 'staging');
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  ASSERT v_blocked,
    'FAIL 2b: a member of another studio must be refused (42501) when writing '
    'the discovery row';

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00582 section 2 passed: outsider blocked on client_discovery';
END $$;

ROLLBACK TO SAVEPOINT s_outsider;

-- ─── 3. the discovery folio moves with the row ─────────────────────────────

SAVEPOINT s_folio_comember;

DO $$
DECLARE
  v_engagement uuid := pg_temp.engagement();
  v_seen integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');

  SELECT count(*) INTO v_seen
    FROM public.project_documents
   WHERE id = '58200000-0000-4000-8000-000000000001'::uuid;
  ASSERT v_seen = 1,
    'FAIL 3a: a studio co-member must SELECT the engagement''s discovery folio '
    'file; got ' || v_seen || ' rows';

  INSERT INTO public.project_documents
    (designer_client_id, title, doc_type, section_key, uploaded_by)
  VALUES
    (v_engagement, '00582 co-member folio file', 'img', 'discovery',
     'a0000000-0000-0000-0000-000000000003');

  SELECT count(*) INTO v_seen
    FROM public.project_documents
   WHERE designer_client_id = v_engagement;
  ASSERT v_seen = 2,
    'FAIL 3b: the co-member''s folio insert must be readable back; got '
      || v_seen || ' rows';

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00582 section 3 passed: co-member folio read + insert';
END $$;

ROLLBACK TO SAVEPOINT s_folio_comember;

-- ─── 4. the folio widening does not leak either ────────────────────────────

SAVEPOINT s_folio_outsider;

DO $$
DECLARE
  v_engagement uuid := pg_temp.engagement();
  v_seen integer;
  v_blocked boolean := false;
BEGIN
  PERFORM pg_temp.assume_user('cf100000-0000-4000-8000-000000000001');

  SELECT count(*) INTO v_seen
    FROM public.project_documents
   WHERE designer_client_id = v_engagement;
  ASSERT v_seen = 0,
    'FAIL 4a: a member of another studio must not see the discovery folio; got '
      || v_seen || ' rows';

  BEGIN
    INSERT INTO public.project_documents
      (designer_client_id, title, doc_type, section_key)
    VALUES (v_engagement, '00582 outsider folio file', 'img', 'discovery');
  EXCEPTION WHEN insufficient_privilege THEN
    v_blocked := true;
  END;
  ASSERT v_blocked,
    'FAIL 4b: a member of another studio must be refused (42501) when writing '
    'the discovery folio';

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '00582 section 4 passed: outsider blocked on the discovery folio';
END $$;

ROLLBACK TO SAVEPOINT s_folio_outsider;

ROLLBACK;
