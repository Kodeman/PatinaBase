-- Workflow Stage-0 privacy contract: boards, frozen snapshots, and storage metadata.
-- Runner: plain psql with ON_ERROR_STOP=1. Every fixture is transaction-local.
--
-- Expected on the pre-remediation schema: this suite is RED. It reports every
-- failing contract before exiting 1; individual gaps are never skipped merely
-- because an earlier assertion failed.
--
-- Run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/workflow/board_privacy_contract_test.sql

BEGIN;

SET LOCAL statement_timeout = '20s';

CREATE TEMP TABLE workflow_privacy_results (
  case_id text PRIMARY KEY,
  passed boolean NOT NULL,
  detail text NOT NULL
) ON COMMIT DROP;

GRANT SELECT, INSERT ON workflow_privacy_results TO authenticated, service_role;

CREATE OR REPLACE FUNCTION pg_temp.assume_workflow_actor(
  p_actor uuid,
  p_role text DEFAULT 'authenticated'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    jsonb_strip_nulls(jsonb_build_object('sub', p_actor, 'role', p_role))::text,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_actor::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', p_role, true);
END;
$$;

-- Deterministic actors: Studio A owner, exact project client, unrelated user,
-- a designer in Studio B, an active project-team member, and an opted-in party.
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('a3400000-0000-4000-8000-000000000001', 'privacy-designer-a@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a3400000-0000-4000-8000-000000000002', 'privacy-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a3400000-0000-4000-8000-000000000003', 'privacy-unrelated@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a3400000-0000-4000-8000-000000000004', 'privacy-designer-b@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a3400000-0000-4000-8000-000000000005', 'privacy-project-team@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a3400000-0000-4000-8000-000000000006', 'privacy-project-party@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (
  id, email, full_name, is_designer, created_at, updated_at
) VALUES
  ('a3400000-0000-4000-8000-000000000001', 'privacy-designer-a@test.invalid', 'Privacy Designer A', true, now(), now()),
  ('a3400000-0000-4000-8000-000000000002', 'privacy-client@test.invalid', 'Privacy Client', false, now(), now()),
  ('a3400000-0000-4000-8000-000000000003', 'privacy-unrelated@test.invalid', 'Privacy Unrelated', false, now(), now()),
  ('a3400000-0000-4000-8000-000000000004', 'privacy-designer-b@test.invalid', 'Privacy Designer B', true, now(), now()),
  ('a3400000-0000-4000-8000-000000000005', 'privacy-project-team@test.invalid', 'Privacy Project Team', true, now(), now()),
  ('a3400000-0000-4000-8000-000000000006', 'privacy-project-party@test.invalid', 'Privacy Project Party', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('a3410000-0000-4000-8000-000000000001', 'design_studio', 'Privacy Studio A', 'privacy-contract-a', 'active'),
  ('a3410000-0000-4000-8000-000000000002', 'design_studio', 'Privacy Studio B', 'privacy-contract-b', 'active');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
) VALUES
  ('a3420000-0000-4000-8000-000000000001', 'a3400000-0000-4000-8000-000000000001',
   'a3410000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('a3420000-0000-4000-8000-000000000002', 'a3400000-0000-4000-8000-000000000004',
   'a3410000-0000-4000-8000-000000000002', 'owner', 'active', now());

INSERT INTO public.designer_clients (
  id, designer_id, client_id, client_name, status, source
) VALUES (
  'a3430000-0000-4000-8000-000000000001',
  'a3400000-0000-4000-8000-000000000001',
  'a3400000-0000-4000-8000-000000000002',
  'Privacy Client', 'active', 'direct'
);

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, studio_id
) VALUES (
  'a3440000-0000-4000-8000-000000000001', 'Privacy Project',
  'a3400000-0000-4000-8000-000000000001',
  'a3400000-0000-4000-8000-000000000002',
  'a3400000-0000-4000-8000-000000000001',
  'a3410000-0000-4000-8000-000000000001'
);

INSERT INTO public.project_team_members (
  id, project_id, user_id, role, permissions, assigned_by
) VALUES (
  'a3441000-0000-4000-8000-000000000001',
  'a3440000-0000-4000-8000-000000000001',
  'a3400000-0000-4000-8000-000000000005',
  'support_designer', '{}'::jsonb,
  'a3400000-0000-4000-8000-000000000001'
);

INSERT INTO public.project_parties (
  id, project_id, party_kind, display_name, profile_id, created_by
) VALUES (
  'a3442000-0000-4000-8000-000000000001',
  'a3440000-0000-4000-8000-000000000001',
  'client_rep', 'Opted-in project representative',
  'a3400000-0000-4000-8000-000000000006',
  'a3400000-0000-4000-8000-000000000001'
);

-- Proposal-owned review copy: author while draft, then issue it. The proposal
-- trigger remains the positive control that prevents later authored DML.
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  status, client_visibility_tier, feedback_enabled
) VALUES (
  'a3450000-0000-4000-8000-000000000001',
  'a3400000-0000-4000-8000-000000000001',
  'a3430000-0000-4000-8000-000000000001',
  'a3400000-0000-4000-8000-000000000002',
  'Curated proposal privacy fixture', 'Client bundle must hide its working board.',
  'draft', 'curated', false
);

INSERT INTO public.proposal_boards (
  id, proposal_id, name, sections, status, sort_order
) VALUES (
  'a3460000-0000-4000-8000-000000000001',
  'a3450000-0000-4000-8000-000000000001',
  'Curated hidden board', '[]'::jsonb, 'active', 0
);

INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, content, data
) VALUES (
  'a3470000-0000-4000-8000-000000000001',
  'a3460000-0000-4000-8000-000000000001',
  'note', 10, 20, 240, 120, 1, 'Working note',
  '{"internal_note":"unpublished","vendor_name":"Private vendor","price_cents":12345}'::jsonb
);

SELECT set_config(
  'app.proposal_send_id',
  'a3450000-0000-4000-8000-000000000001',
  true
);
UPDATE public.proposals
SET status = 'sent', sent_at = now()
WHERE id = 'a3450000-0000-4000-8000-000000000001';
SELECT set_config('app.proposal_send_id', '', true);

-- A separate draft is shared before it is edited, proving a share resolves an
-- immutable edition instead of rereading a live board on each request.
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  status, client_visibility_tier, feedback_enabled
) VALUES (
  'a3450000-0000-4000-8000-000000000002',
  'a3400000-0000-4000-8000-000000000001',
  'a3430000-0000-4000-8000-000000000001',
  'a3400000-0000-4000-8000-000000000002',
  'Draft share privacy fixture', 'The share must freeze this edition.',
  'draft', 'full', false
);

INSERT INTO public.proposal_boards (
  id, proposal_id, name, sections, status, sort_order
) VALUES (
  'a3460000-0000-4000-8000-000000000003',
  'a3450000-0000-4000-8000-000000000002',
  'Draft shared board', '[]'::jsonb, 'active', 0
);

INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, content, data
) VALUES (
  'a3470000-0000-4000-8000-000000000003',
  'a3460000-0000-4000-8000-000000000003',
  'note', 50, 60, 240, 120, 1, 'Edition one',
  '{"name":"Edition one"}'::jsonb
);

-- Project-owned board is the live working surface. project_boards is the
-- activation/signed snapshot that must remain client-readable but immutable.
INSERT INTO public.proposal_boards (
  id, project_id, name, sections, status, sort_order
) VALUES (
  'a3460000-0000-4000-8000-000000000002',
  'a3440000-0000-4000-8000-000000000001',
  'Live project working board', '[]'::jsonb, 'active', 0
);

INSERT INTO public.proposal_board_items (
  id, board_id, type, x, y, width, height, z_index, content, data
) VALUES (
  'a3470000-0000-4000-8000-000000000002',
  'a3460000-0000-4000-8000-000000000002',
  'note', 30, 40, 240, 120, 1, 'Project working note',
  '{"internal_note":"still working"}'::jsonb
);

INSERT INTO public.project_boards (
  id, project_id, source_board_id, name, items, sections, sort_order
) VALUES (
  'a3480000-0000-4000-8000-000000000001',
  'a3440000-0000-4000-8000-000000000001',
  'a3460000-0000-4000-8000-000000000001',
  'Frozen signed board',
  '[{"type":"note","content":"The reviewed copy"}]'::jsonb,
  '[]'::jsonb,
  0
);

-- SQL-visible storage contract. HTTP object retrieval/overwrite is covered by
-- the companion follow-up document because psql cannot exercise Storage HTTP.
INSERT INTO workflow_privacy_results
SELECT
  'B01_WORKING_BUCKET_PRIVATE',
  COALESCE((
    SELECT NOT bucket.public
    FROM storage.buckets AS bucket
    WHERE bucket.id = 'proposal-mood-boards'
  ), false),
  format(
    'proposal-mood-boards exists=%s public=%s; required=true/false',
    EXISTS (
      SELECT 1 FROM storage.buckets
      WHERE id = 'proposal-mood-boards'
    ),
    COALESCE((
      SELECT public::text FROM storage.buckets
      WHERE id = 'proposal-mood-boards'
    ), 'missing')
  );

INSERT INTO workflow_privacy_results
SELECT
  'B02_NO_PUBLIC_WORKING_MEDIA_SELECT_POLICY',
  NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND cmd = 'SELECT'
      AND 'public' = ANY (roles)
      AND COALESCE(qual, '') LIKE '%proposal-mood-boards%'
  ),
  'PUBLIC must not SELECT proposal-mood-boards objects';

-- Unrelated users and a different studio remain fail-closed.
SELECT pg_temp.assume_workflow_actor('a3400000-0000-4000-8000-000000000003');
SET LOCAL ROLE authenticated;
INSERT INTO workflow_privacy_results
SELECT
  'B03_UNRELATED_USER_CANNOT_READ_WORKING_BOARD',
  count(*) = 0,
  format('unrelated working-board row count=%s; required=0', count(*))
FROM public.proposal_boards
WHERE id = 'a3460000-0000-4000-8000-000000000002';
RESET ROLE;

-- Opting a coordination party into a project does not imply access to the
-- studio's working board. Editions grant any future read separately.
SELECT pg_temp.assume_workflow_actor('a3400000-0000-4000-8000-000000000006');
SET LOCAL ROLE authenticated;
INSERT INTO workflow_privacy_results
SELECT
  'B13_PROJECT_PARTY_CANNOT_READ_WORKING_BOARD',
  count(*) = 0,
  format('opted-in party working-board row count=%s; required=0', count(*))
FROM public.proposal_boards
WHERE id = 'a3460000-0000-4000-8000-000000000002';
RESET ROLE;

SELECT pg_temp.assume_workflow_actor('a3400000-0000-4000-8000-000000000004');
SET LOCAL ROLE authenticated;
INSERT INTO workflow_privacy_results
SELECT
  'B04_DIFFERENT_STUDIO_CANNOT_READ_WORKING_BOARD',
  count(*) = 0,
  format('different-studio working-board row count=%s; required=0', count(*))
FROM public.proposal_boards
WHERE id = 'a3460000-0000-4000-8000-000000000002';
RESET ROLE;

-- The exact client must not see either live project work or raw proposal-edition
-- rows. Released content belongs behind an edition/bundle projection.
SELECT pg_temp.assume_workflow_actor('a3400000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
INSERT INTO workflow_privacy_results
SELECT
  'B05_CLIENT_CANNOT_READ_LIVE_PROJECT_BOARD',
  count(*) = 0,
  format('client live-project-board row count=%s; required=0', count(*))
FROM public.proposal_boards
WHERE id = 'a3460000-0000-4000-8000-000000000002';

INSERT INTO workflow_privacy_results
SELECT
  'B06_CLIENT_CANNOT_READ_LIVE_PROJECT_BOARD_ITEM',
  count(*) = 0,
  format('client live-project-board-item row count=%s; required=0', count(*))
FROM public.proposal_board_items
WHERE id = 'a3470000-0000-4000-8000-000000000002';

INSERT INTO workflow_privacy_results
SELECT
  'B07_CLIENT_CANNOT_BYPASS_CURATED_PROPOSAL_BOARD_BUNDLE',
  count(*) = 0,
  format('client raw curated-proposal-board row count=%s; required=0', count(*))
FROM public.proposal_boards
WHERE id = 'a3460000-0000-4000-8000-000000000001';

INSERT INTO workflow_privacy_results
SELECT
  'B08_CLIENT_CANNOT_BYPASS_CURATED_PROPOSAL_ITEM_BUNDLE',
  count(*) = 0,
  format('client raw curated-proposal-item row count=%s; required=0', count(*))
FROM public.proposal_board_items
WHERE id = 'a3470000-0000-4000-8000-000000000001';

DO $$
DECLARE
  v_denied boolean := false;
  v_rows integer := 0;
  v_detail text := '';
BEGIN
  BEGIN
    UPDATE public.project_boards
    SET name = 'Client rewrote signed truth'
    WHERE id = 'a3480000-0000-4000-8000-000000000001';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_denied := v_rows = 0;
    v_detail := format('client UPDATE affected %s rows; required=0/error', v_rows);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
    v_detail := format('client UPDATE rejected [%s] %s', SQLSTATE, SQLERRM);
  END;
  INSERT INTO workflow_privacy_results VALUES (
    'B09_CLIENT_CANNOT_MUTATE_FROZEN_PROJECT_BOARD', v_denied, v_detail
  );
END;
$$;

DO $$
DECLARE
  v_denied boolean := false;
  v_rows integer := 0;
  v_detail text := '';
BEGIN
  BEGIN
    BEGIN
      INSERT INTO public.project_boards (
        id, project_id, source_board_id, name, items, sections, sort_order
      ) VALUES (
        'a3480000-0000-4000-8000-000000000002',
        'a3440000-0000-4000-8000-000000000001',
        'a3460000-0000-4000-8000-000000000002',
        'Client forged project board', '[]'::jsonb, '[]'::jsonb, 1
      );
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      RAISE EXCEPTION 'rollback successful probe' USING ERRCODE = 'Z0001';
    EXCEPTION WHEN SQLSTATE 'Z0001' THEN
      v_denied := v_rows = 0;
      v_detail := format('client INSERT affected %s rows; required=0/error', v_rows);
    END;
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
    v_detail := format('client INSERT rejected [%s] %s', SQLSTATE, SQLERRM);
  END;
  INSERT INTO workflow_privacy_results VALUES (
    'B09A_CLIENT_CANNOT_INSERT_FROZEN_PROJECT_BOARD', v_denied, v_detail
  );
END;
$$;

DO $$
DECLARE
  v_denied boolean := false;
  v_rows integer := 0;
  v_detail text := '';
BEGIN
  BEGIN
    BEGIN
      DELETE FROM public.project_boards
      WHERE id = 'a3480000-0000-4000-8000-000000000001';
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      RAISE EXCEPTION 'rollback successful probe' USING ERRCODE = 'Z0001';
    EXCEPTION WHEN SQLSTATE 'Z0001' THEN
      v_denied := v_rows = 0;
      v_detail := format('client DELETE affected %s rows; required=0/error', v_rows);
    END;
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
    v_detail := format('client DELETE rejected [%s] %s', SQLSTATE, SQLERRM);
  END;
  INSERT INTO workflow_privacy_results VALUES (
    'B09B_CLIENT_CANNOT_DELETE_FROZEN_PROJECT_BOARD', v_denied, v_detail
  );
END;
$$;
RESET ROLE;

-- Active team membership may authorize a separately scoped read, but it can
-- never rewrite an activated/signed snapshot.
SELECT pg_temp.assume_workflow_actor('a3400000-0000-4000-8000-000000000005');
SET LOCAL ROLE authenticated;
DO $$
DECLARE
  v_denied boolean := false;
  v_rows integer := 0;
  v_detail text := '';
BEGIN
  BEGIN
    BEGIN
      UPDATE public.project_boards
      SET name = 'Project team rewrote signed truth'
      WHERE id = 'a3480000-0000-4000-8000-000000000001';
      GET DIAGNOSTICS v_rows = ROW_COUNT;
      RAISE EXCEPTION 'rollback successful probe' USING ERRCODE = 'Z0001';
    EXCEPTION WHEN SQLSTATE 'Z0001' THEN
      v_denied := v_rows = 0;
      v_detail := format('project-team UPDATE affected %s rows; required=0/error', v_rows);
    END;
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
    v_detail := format('project-team UPDATE rejected [%s] %s', SQLSTATE, SQLERRM);
  END;
  INSERT INTO workflow_privacy_results VALUES (
    'B14_PROJECT_TEAM_CANNOT_MUTATE_FROZEN_PROJECT_BOARD', v_denied, v_detail
  );
END;
$$;
RESET ROLE;

-- Studio A keeps working-board read access.
SELECT pg_temp.assume_workflow_actor('a3400000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
INSERT INTO workflow_privacy_results
SELECT
  'B10_OWN_STUDIO_CAN_READ_WORKING_BOARD',
  count(*) = 1,
  format('own-studio working-board row count=%s; required=1', count(*))
FROM public.proposal_boards
WHERE id = 'a3460000-0000-4000-8000-000000000002';

DO $$
DECLARE
  v_token text;
  v_before jsonb;
  v_after jsonb;
BEGIN
  SELECT share.token INTO v_token
  FROM public.create_board_share(
    'a3460000-0000-4000-8000-000000000003',
    'Immutable edition probe',
    now() + interval '1 hour'
  ) AS share;

  v_before := public.resolve_board_share(v_token);

  UPDATE public.proposal_board_items
  SET content = 'Edition two',
      data = '{"name":"Edition two"}'::jsonb
  WHERE id = 'a3470000-0000-4000-8000-000000000003';

  v_after := public.resolve_board_share(v_token);

  INSERT INTO workflow_privacy_results VALUES (
    'B15_BOARD_SHARE_REMAINS_BYTE_IDENTICAL_AFTER_WORKING_EDIT',
    v_before IS NOT NULL AND v_before = v_after,
    format(
      'share before/after both non-null=%s payload byte-identical=%s; required=true/true',
      v_before IS NOT NULL AND v_after IS NOT NULL,
      v_before = v_after
    )
  );
END;
$$;

-- The existing sent-proposal guard must continue to reject authenticated
-- author mutation after privacy remediation.
DO $$
DECLARE
  v_denied boolean := false;
  v_rows integer := 0;
  v_detail text := '';
BEGIN
  BEGIN
    UPDATE public.proposal_boards
    SET name = 'Designer rewrote sent board'
    WHERE id = 'a3460000-0000-4000-8000-000000000001';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_denied := v_rows = 0;
    v_detail := format('authenticated sent-board UPDATE affected %s rows; required=0/error', v_rows);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
    v_detail := format('authenticated sent-board UPDATE rejected [%s] %s', SQLSTATE, SQLERRM);
  END;
  INSERT INTO workflow_privacy_results VALUES (
    'B16_SENT_PROPOSAL_BOARD_REMAINS_IMMUTABLE', v_denied, v_detail
  );
END;
$$;
RESET ROLE;

-- service_role bypasses RLS, so immutable truth must be protected by triggers.
SELECT pg_temp.assume_workflow_actor(NULL, 'service_role');
SET LOCAL ROLE service_role;
DO $$
DECLARE
  v_denied boolean := false;
  v_rows integer := 0;
  v_detail text := '';
BEGIN
  BEGIN
    UPDATE public.project_boards
    SET name = 'Service rewrote signed truth'
    WHERE id = 'a3480000-0000-4000-8000-000000000001';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_denied := v_rows = 0;
    v_detail := format('service_role UPDATE affected %s rows; required=0/error', v_rows);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
    v_detail := format('service_role UPDATE rejected [%s] %s', SQLSTATE, SQLERRM);
  END;
  INSERT INTO workflow_privacy_results VALUES (
    'B11_SERVICE_ROLE_CANNOT_MUTATE_FROZEN_PROJECT_BOARD', v_denied, v_detail
  );
END;
$$;

-- Existing proposal-edition trigger is a preserved positive control.
DO $$
DECLARE
  v_denied boolean := false;
  v_rows integer := 0;
  v_detail text := '';
BEGIN
  BEGIN
    UPDATE public.proposal_board_items
    SET content = 'Service rewrote issued proposal copy'
    WHERE id = 'a3470000-0000-4000-8000-000000000001';
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_denied := v_rows = 0;
    v_detail := format('service_role issued-item UPDATE affected %s rows', v_rows);
  EXCEPTION WHEN OTHERS THEN
    v_denied := true;
    v_detail := format('service_role issued-item UPDATE rejected [%s] %s', SQLSTATE, SQLERRM);
  END;
  INSERT INTO workflow_privacy_results VALUES (
    'B12_SENT_PROPOSAL_BOARD_ITEM_REMAINS_IMMUTABLE', v_denied, v_detail
  );
END;
$$;
RESET ROLE;

SELECT case_id, passed, detail
FROM workflow_privacy_results
ORDER BY case_id;

SELECT COALESCE(bool_and(passed), false) AS all_contracts_passed
FROM workflow_privacy_results
\gset

ROLLBACK;

\if :all_contracts_passed
  \echo 'board_privacy_contract_test: all assertions passed'
\else
  \echo 'board_privacy_contract_test: privacy contract failures reported above'
  DO $contract_failure$
  BEGIN
    RAISE EXCEPTION 'workflow board privacy contract failed';
  END
  $contract_failure$;
\endif
