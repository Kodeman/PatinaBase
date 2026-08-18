-- ═══════════════════════════════════════════════════════════════════════════
-- proposal-mood-boards bucket read policy (00131 → 00406 → 00438 → 00485)
--
-- The regression this pins: 00438 made the bucket PRIVATE and left its SELECT
-- policy applying TO PUBLIC with a predicate that only proved the proposal
-- EXISTS. On a private bucket RLS is the only gate, so a permissive policy
-- true for everyone is a grant to everyone — any caller holding a proposal
-- UUID, anon included, could read that proposal's mood-board objects.
--
-- The DENY cases below are the discriminators. The pre-00485 policy passes
-- every ALLOW case in this file; it fails the anon, unrelated-user, foreign-
-- studio, and draft cases. A suite that only proved the allow paths would be
-- green against the vulnerable policy.
--
-- Every row-visibility assertion runs under SET LOCAL ROLE with real JWT
-- claims. As postgres (BYPASSRLS) the whole file would pass while proving
-- nothing.
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/storage/moodboard_caller_binding_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ── Actors ────────────────────────────────────────────────────────────────
-- Designer A owns the proposal. Co-member shares Studio A with them. Designer
-- B owns nothing here. Client is the proposal's named client. Stranger is a
-- signed-in account with no relationship to anything.
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('48700000-0000-4000-8000-000000000001', 'mb-designer-a@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('48700000-0000-4000-8000-000000000002', 'mb-designer-b@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('48700000-0000-4000-8000-000000000003', 'mb-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('48700000-0000-4000-8000-000000000004', 'mb-stranger@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('48700000-0000-4000-8000-000000000005', 'mb-comember@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('48700000-0000-4000-8000-000000000001', 'mb-designer-a@test.invalid', 'Mood Designer A', true, now(), now()),
  ('48700000-0000-4000-8000-000000000002', 'mb-designer-b@test.invalid', 'Mood Designer B', true, now(), now()),
  ('48700000-0000-4000-8000-000000000003', 'mb-client@test.invalid', 'Mood Client', false, now(), now()),
  ('48700000-0000-4000-8000-000000000004', 'mb-stranger@test.invalid', 'Mood Stranger', false, now(), now()),
  ('48700000-0000-4000-8000-000000000005', 'mb-comember@test.invalid', 'Mood Co-member', true, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer;

-- Studio A is the shared organization that makes the co-member leg of
-- is_design_studio_comember() true. Studio B exists so Designer B is a real
-- studio designer and not merely an account with no workspace.
INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('48701000-0000-4000-8000-000000000001', 'design_studio', 'Mood Studio A', 'mood-binding-studio-a', 'active'),
  ('48701000-0000-4000-8000-000000000002', 'design_studio', 'Mood Studio B', 'mood-binding-studio-b', 'active');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('48702000-0000-4000-8000-000000000001', '48700000-0000-4000-8000-000000000001',
   '48701000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('48702000-0000-4000-8000-000000000002', '48700000-0000-4000-8000-000000000005',
   '48701000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('48702000-0000-4000-8000-000000000003', '48700000-0000-4000-8000-000000000002',
   '48701000-0000-4000-8000-000000000002', 'owner', 'active', now());

INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, status, source)
VALUES (
  '48703000-0000-4000-8000-000000000001',
  '48700000-0000-4000-8000-000000000001',
  '48700000-0000-4000-8000-000000000003',
  'Mood Client', 'active', 'direct'
);

-- ── Two proposals for the same designer/client pair ───────────────────────
-- The issued one is what the client portal renders. The draft one must stay
-- invisible to the client: that is the status gate 00485 copied from
-- get_client_proposal_bundle.
INSERT INTO public.proposals (
  id, designer_id, designer_client_id, client_id, title, description,
  status, client_visibility_tier, feedback_enabled
) VALUES
  ('48710000-0000-4000-8000-000000000001',
   '48700000-0000-4000-8000-000000000001',
   '48703000-0000-4000-8000-000000000001',
   '48700000-0000-4000-8000-000000000003',
   'Issued mood-board proposal', 'The client may reach this one''s media.',
   'draft', 'full', false),
  ('48710000-0000-4000-8000-000000000002',
   '48700000-0000-4000-8000-000000000001',
   '48703000-0000-4000-8000-000000000001',
   '48700000-0000-4000-8000-000000000003',
   'Unsent mood-board proposal', 'Named client, never issued.',
   'draft', 'full', false);

-- The send path is guarded; app.proposal_send_id is how the rest of the suite
-- (tests/workflow/board_privacy_contract_test.sql) moves a draft to sent.
SELECT set_config('app.proposal_send_id', '48710000-0000-4000-8000-000000000001', true);
UPDATE public.proposals
SET status = 'sent', sent_at = now()
WHERE id = '48710000-0000-4000-8000-000000000001';
SELECT set_config('app.proposal_send_id', '', true);

-- ── Boards under the issued proposal ──────────────────────────────────────
-- The client leg is reference-scoped to the currently-ACTIVE issued board
-- (00485 tightening). Board 001 is that active board. Board 003 is an archived
-- (superseded) board under the SAME issued proposal — its media must stay
-- invisible to the client even though it shares the proposal prefix.
-- Fixture boards are inserted with triggers suspended: the proposal_boards
-- guard triggers enforce mutation-path invariants (copy-only, lineage,
-- reparenting) that are orthogonal to the storage RLS policy under test.
SET session_replication_role = replica;
INSERT INTO public.proposal_boards (id, proposal_id, name, status, cover_image_url)
VALUES
  ('48720000-0000-4000-8000-000000000001',
   '48710000-0000-4000-8000-000000000001', 'Issued active board', 'active',
   '48710000-0000-4000-8000-000000000001/boards/48720000-0000-4000-8000-000000000001/asset-1.png'),
  ('48720000-0000-4000-8000-000000000003',
   '48710000-0000-4000-8000-000000000001', 'Superseded board', 'archived',
   '48710000-0000-4000-8000-000000000001/boards/48720000-0000-4000-8000-000000000003/asset-3.png');
SET session_replication_role = DEFAULT;

-- ── Objects under each proposal's prefix ──────────────────────────────────
-- Canonical shape written by apps/designer-portal/src/lib/mood-board-assets/
-- upload-board-assets.ts: {proposalId}/boards/{boardId}/{assetId}.ext
--   asset-1 → active issued board (client may read)
--   asset-3 → archived board under the SAME issued proposal (client may NOT)
--   asset-2 → the never-issued proposal (client may NOT)
INSERT INTO storage.objects (bucket_id, name, owner)
VALUES
  ('proposal-mood-boards',
   '48710000-0000-4000-8000-000000000001/boards/48720000-0000-4000-8000-000000000001/asset-1.png',
   '48700000-0000-4000-8000-000000000001'),
  ('proposal-mood-boards',
   '48710000-0000-4000-8000-000000000001/boards/48720000-0000-4000-8000-000000000003/asset-3.png',
   '48700000-0000-4000-8000-000000000001'),
  ('proposal-mood-boards',
   '48710000-0000-4000-8000-000000000002/boards/48720000-0000-4000-8000-000000000002/asset-2.png',
   '48700000-0000-4000-8000-000000000001');

-- An active, unexpired share on the issued proposal. Guest surfaces resolve
-- this server-side with service_role; it must NOT become a storage-layer
-- grant to anon or to any signed-in stranger.
INSERT INTO public.document_shares (
  id, proposal_id, token_hash, visibility, status, expires_at, created_by
) VALUES (
  '48730000-0000-4000-8000-000000000001',
  '48710000-0000-4000-8000-000000000001',
  repeat('a', 64),
  jsonb_build_object('feedbackEnabled', false),
  'active',
  now() + interval '7 days',
  '48700000-0000-4000-8000-000000000001'
);

-- ── Role helpers ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.assume_role(p_user_id uuid, p_role text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    CASE
      WHEN p_user_id IS NULL
        THEN json_build_object('role', p_role)::text
      ELSE json_build_object('sub', p_user_id::text, 'role', p_role)::text
    END,
    true
  );
  PERFORM set_config('request.jwt.claim.sub', COALESCE(p_user_id::text, ''), true);
  PERFORM set_config('request.jwt.claim.role', p_role, true);
  EXECUTE format('SET LOCAL ROLE %I', p_role);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.reset_actor()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', '', true);
END;
$$;

-- Rows the CURRENT role can actually see. A role with no SELECT privilege on
-- storage.objects is denied just as surely as one filtered out by the policy,
-- so both collapse to zero rather than aborting the run.
CREATE OR REPLACE FUNCTION pg_temp.visible_objects(p_name text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM storage.objects
  WHERE bucket_id = 'proposal-mood-boards' AND name = p_name;
  RETURN v_count;
EXCEPTION
  WHEN insufficient_privilege THEN RETURN 0;
END;
$$;

-- pg_temp helpers are not executable by the app roles by default, and the
-- probes below run as anon/authenticated. visible_objects stays SECURITY
-- INVOKER so storage RLS is evaluated as the assumed caller.
GRANT EXECUTE ON FUNCTION pg_temp.visible_objects(text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.assume_role(uuid, text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION pg_temp.reset_actor()
  TO anon, authenticated, service_role;

DO $$
DECLARE
  v_designer  uuid := '48700000-0000-4000-8000-000000000001';
  v_designer_b uuid := '48700000-0000-4000-8000-000000000002';
  v_client    uuid := '48700000-0000-4000-8000-000000000003';
  v_stranger  uuid := '48700000-0000-4000-8000-000000000004';
  v_comember  uuid := '48700000-0000-4000-8000-000000000005';
  v_issued    text := '48710000-0000-4000-8000-000000000001/boards/48720000-0000-4000-8000-000000000001/asset-1.png';
  v_issued_archived text := '48710000-0000-4000-8000-000000000001/boards/48720000-0000-4000-8000-000000000003/asset-3.png';
  v_draft     text := '48710000-0000-4000-8000-000000000002/boards/48720000-0000-4000-8000-000000000002/asset-2.png';
  v_read      record;
  v_count     integer;
  v_policies  integer;
BEGIN
  -- ── Catalog invariants ────────────────────────────────────────────────
  -- These are the cheap assertions that would have caught 00438 on the day it
  -- shipped: a private bucket whose SELECT policy neither names a role nor
  -- mentions the caller.
  ASSERT (
    SELECT NOT bucket.public
    FROM storage.buckets AS bucket
    WHERE bucket.id = 'proposal-mood-boards'
  ), 'the proposal-mood-boards bucket must stay private';

  SELECT count(*) INTO v_policies
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname LIKE 'proposal_mood_boards_proposal_%';
  ASSERT v_policies = 4,
    'the FF&E-era read/insert/update/delete policy set must survive (2026-08-12 Ruling 1)';

  SELECT policyname, roles::text AS roles, COALESCE(qual, '') AS qual
  INTO v_read
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND policyname = 'proposal_mood_boards_proposal_read';
  ASSERT v_read.policyname IS NOT NULL,
    'proposal_mood_boards_proposal_read must exist';
  ASSERT v_read.roles = '{authenticated}',
    format('the read policy must name authenticated, not %s', v_read.roles);
  ASSERT v_read.qual LIKE '%is_design_studio_comember%',
    'the read policy must bind the owning design studio';
  -- The client binding moved into can_client_read_issued_board_media (00485
  -- tightening): the policy qual now names the reference-scope helper rather
  -- than an inline client_id/auth.uid() prefix predicate.
  ASSERT v_read.qual LIKE '%can_client_read_issued_board_media%',
    'the read policy must bind the client through the active-board reference helper';

  -- No policy on this bucket may be reachable by an unauthenticated caller.
  SELECT count(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'storage' AND tablename = 'objects'
    AND (COALESCE(qual, '') LIKE '%proposal-mood-boards%'
      OR COALESCE(with_check, '') LIKE '%proposal-mood-boards%')
    AND roles::text <> '{authenticated}';
  ASSERT v_count = 0,
    'every proposal-mood-boards policy must apply to authenticated only';

  -- ── DENY: anon holding a valid proposal UUID ──────────────────────────
  -- The whole vulnerability in one assertion.
  PERFORM pg_temp.assume_role(NULL, 'anon');
  ASSERT pg_temp.visible_objects(v_issued) = 0,
    'an anonymous caller must not read mood-board media for a known proposal';
  ASSERT pg_temp.visible_objects(v_draft) = 0,
    'an anonymous caller must not read mood-board media for a draft proposal';
  PERFORM pg_temp.reset_actor();

  -- ── DENY: a signed-in stranger ────────────────────────────────────────
  PERFORM pg_temp.assume_role(v_stranger, 'authenticated');
  ASSERT pg_temp.visible_objects(v_issued) = 0,
    'an unrelated authenticated user must not read another studio''s mood-board media';
  PERFORM pg_temp.reset_actor();

  -- ── DENY: a designer from a different studio ──────────────────────────
  PERFORM pg_temp.assume_role(v_designer_b, 'authenticated');
  ASSERT pg_temp.visible_objects(v_issued) = 0,
    'a designer outside the owning studio must not read its mood-board media';
  PERFORM pg_temp.reset_actor();

  -- ── ALLOW: the owning designer ────────────────────────────────────────
  PERFORM pg_temp.assume_role(v_designer, 'authenticated');
  ASSERT pg_temp.visible_objects(v_issued) = 1,
    'the owning designer must be able to read their proposal''s mood-board media';
  ASSERT pg_temp.visible_objects(v_draft) = 1,
    'the owning designer must reach their own draft''s mood-board media';
  -- The designer leg is prefix-scoped and UNCHANGED: they own everything under
  -- the prefix, superseded/archived boards included.
  ASSERT pg_temp.visible_objects(v_issued_archived) = 1,
    'the owning designer must reach a superseded board''s media under their own proposal prefix';
  PERFORM pg_temp.reset_actor();

  -- ── ALLOW: an active co-member of the owning studio ───────────────────
  PERFORM pg_temp.assume_role(v_comember, 'authenticated');
  ASSERT pg_temp.visible_objects(v_issued) = 1,
    'an active studio co-member must be able to read the studio''s mood-board media';
  PERFORM pg_temp.reset_actor();

  -- ── ALLOW: the proposal's client, once issued ─────────────────────────
  -- Load-bearing: useClientSafeProposalBundle and the iOS ProposalsAPIClient
  -- both sign these objects with the CLIENT'S own session.
  PERFORM pg_temp.assume_role(v_client, 'authenticated');
  ASSERT pg_temp.visible_objects(v_issued) = 1,
    'the client of an issued proposal must be able to read its ACTIVE board''s mood-board media';
  -- ── DENY: the same client against an unsent proposal ──────────────────
  ASSERT pg_temp.visible_objects(v_draft) = 0,
    'the named client must not reach a draft proposal''s mood-board media';
  -- ── DENY: the same client against a SUPERSEDED board under their OWN
  -- issued proposal (F-h1-3, Kody's tightening ruling). The old prefix-wide
  -- client leg admitted any object under the issued proposal's folder; the
  -- reference-scoped leg admits only the currently-active issued board, so an
  -- archived board's media is denied even though the proposal is issued and the
  -- object shares the client's proposal prefix.
  ASSERT pg_temp.visible_objects(v_issued_archived) = 0,
    'the issued proposal''s client must not reach a superseded (non-active) board''s media under their own proposal prefix';
  PERFORM pg_temp.reset_actor();

  -- ── Shares are NOT a storage-layer grant ──────────────────────────────
  -- An active, unexpired share exists on the issued proposal (inserted above).
  -- Guest share pages resolve it server-side with service_role, which is
  -- BYPASSRLS; the token never reaches a JWT claim, so RLS cannot and must not
  -- honour it. Anything else would restore the "a share exists somewhere,
  -- therefore you may read" defect this migration removes.
  ASSERT (SELECT count(*) = 1 FROM public.document_shares
          WHERE id = '48730000-0000-4000-8000-000000000001'
            AND status = 'active' AND expires_at > now()),
    'the share fixture must be active for the negative assertions to mean anything';

  PERFORM pg_temp.assume_role(NULL, 'anon');
  ASSERT pg_temp.visible_objects(v_issued) = 0,
    'an active share must not let an anonymous caller read the objects directly';
  PERFORM pg_temp.reset_actor();

  PERFORM pg_temp.assume_role(v_stranger, 'authenticated');
  ASSERT pg_temp.visible_objects(v_issued) = 0,
    'an active share must not let a signed-in stranger read the objects directly';
  PERFORM pg_temp.reset_actor();

  -- The server path that DOES serve guests stays intact.
  PERFORM pg_temp.assume_role(NULL, 'service_role');
  ASSERT pg_temp.visible_objects(v_issued) = 1,
    'service_role must still reach the objects — it signs every guest share URL';
  PERFORM pg_temp.reset_actor();

  RAISE NOTICE 'proposal-mood-boards caller-binding assertions passed';
END
$$;

ROLLBACK;
