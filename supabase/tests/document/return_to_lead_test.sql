-- return_to_lead / return_to_lead_check regression (00585)
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/document/return_to_lead_test.sql

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('d7000000-0000-4000-8000-000000000001', 'rtl-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d7000000-0000-4000-8000-000000000002', 'rtl-coworker@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d7000000-0000-4000-8000-000000000003', 'rtl-foreign@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d7000000-0000-4000-8000-000000000010', 'rtl-client@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('d7000000-0000-4000-8000-000000000001', 'rtl-owner@test.invalid', 'Return Owner', NOW(), NOW()),
  ('d7000000-0000-4000-8000-000000000002', 'rtl-coworker@test.invalid', 'Return Coworker', NOW(), NOW()),
  ('d7000000-0000-4000-8000-000000000003', 'rtl-foreign@test.invalid', 'Return Foreign', NOW(), NOW()),
  ('d7000000-0000-4000-8000-000000000010', 'rtl-client@test.invalid', 'Threaded Client', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles
SET is_designer = true
WHERE id IN (
  'd7000000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000002',
  'd7000000-0000-4000-8000-000000000003'
);

INSERT INTO public.organizations (id, type, name, slug)
VALUES
  ('d7100000-0000-4000-8000-000000000001', 'design_studio',
   'Return To Lead Studio', 'return-to-lead-studio'),
  ('d7100000-0000-4000-8000-000000000002', 'design_studio',
   'Return To Lead Other Studio', 'return-to-lead-other-studio');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('d7110000-0000-4000-8000-000000000001', 'd7000000-0000-4000-8000-000000000001',
   'd7100000-0000-4000-8000-000000000001', 'owner', 'active', NOW()),
  ('d7110000-0000-4000-8000-000000000002', 'd7000000-0000-4000-8000-000000000002',
   'd7100000-0000-4000-8000-000000000001', 'member', 'active', NOW()),
  ('d7110000-0000-4000-8000-000000000003', 'd7000000-0000-4000-8000-000000000003',
   'd7100000-0000-4000-8000-000000000002', 'owner', 'active', NOW());

-- One lead per scenario. Each carries a distinct contact_email: the
-- (designer_id, client_email) partial unique index makes a shared address a
-- collision inside begin_discovery, not a test of this migration.
INSERT INTO public.leads (
  id, homeowner_id, designer_id, project_type, status, contact_name, contact_email
)
VALUES
  ('d7200000-0000-4000-8000-000000000001', NULL,
   'd7000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Happy Path', 'rtl-happy@test.invalid'),
  ('d7200000-0000-4000-8000-000000000002', NULL,
   'd7000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'App Matched', 'rtl-matched@test.invalid'),
  ('d7200000-0000-4000-8000-000000000003', NULL,
   'd7000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Has Proposal', 'rtl-proposal@test.invalid'),
  ('d7200000-0000-4000-8000-000000000004', NULL,
   'd7000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Has Folio Doc', 'rtl-folio@test.invalid'),
  ('d7200000-0000-4000-8000-000000000005', NULL,
   'd7000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Has Margin Note', 'rtl-note@test.invalid'),
  ('d7200000-0000-4000-8000-000000000006', NULL,
   'd7000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Has Discovery Content', 'rtl-discovery@test.invalid'),
  ('d7200000-0000-4000-8000-000000000007', 'd7000000-0000-4000-8000-000000000010',
   'd7000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Has Thread', 'rtl-thread@test.invalid'),
  ('d7200000-0000-4000-8000-000000000008', NULL,
   'd7000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Cross Studio', 'rtl-cross@test.invalid'),
  ('d7200000-0000-4000-8000-000000000009', NULL,
   'd7000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Coworker Reverses', 'rtl-coworker-lead@test.invalid'),
  ('d7200000-0000-4000-8000-00000000000a', NULL,
   'd7000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Has Activity', 'rtl-activity@test.invalid'),
  ('d7200000-0000-4000-8000-00000000000b', NULL,
   'd7000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Has Ceremony', 'rtl-ceremony@test.invalid');

CREATE OR REPLACE FUNCTION pg_temp.assume_rtl_actor(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_actor, 'role', 'authenticated')::text,
    true
  );
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.assume_rtl_actor(uuid) TO PUBLIC;

-- Every scenario begins where the mis-click leaves the designer: Discovery.
CREATE OR REPLACE FUNCTION pg_temp.rtl_accept(p_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN (public.begin_discovery(p_lead_id)->>'designerClientId')::uuid;
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.rtl_accept(uuid) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.rtl_refusal(p_designer_client_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_check jsonb;
  v_error text;
BEGIN
  v_check := public.return_to_lead_check(p_designer_client_id);
  IF (v_check->>'allowed')::boolean THEN
    RAISE EXCEPTION 'expected a refusal for %, got allowed', p_designer_client_id;
  END IF;

  -- The act must refuse for exactly the reason the door gave.
  BEGIN
    PERFORM public.return_to_lead(p_designer_client_id);
    RAISE EXCEPTION 'return_to_lead completed a refused reversal';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  IF v_error IS DISTINCT FROM v_check->>'reason' THEN
    RAISE EXCEPTION 'act reason %L does not match check reason %L',
      v_error, v_check->>'reason';
  END IF;

  RETURN v_check->>'reason';
END;
$$;
GRANT EXECUTE ON FUNCTION pg_temp.rtl_refusal(uuid) TO PUBLIC;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_rtl_actor('d7000000-0000-4000-8000-000000000001');

-- ── Happy path ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_dc      uuid;
  v_check   jsonb;
  v_result  jsonb;
BEGIN
  v_dc := pg_temp.rtl_accept('d7200000-0000-4000-8000-000000000001');

  -- An empty Discovery row is not content: the folder was opened, nothing typed.
  INSERT INTO public.client_discovery (designer_client_id, designer_id)
  VALUES (v_dc, 'd7000000-0000-4000-8000-000000000001');

  ASSERT (SELECT active_section = 'discovery' AND engagement_kind = 'relationship'
          FROM public.document_state WHERE engagement_id = v_dc),
    'the accepted lead must sit in Discovery (Shape D) before the reversal';

  v_check := public.return_to_lead_check(v_dc);
  ASSERT (v_check->>'allowed')::boolean,
    format('an untouched Discovery must be reversible, got %L', v_check->>'reason');
  ASSERT v_check->>'reason' IS NULL, 'an allowed check carries no reason';
  ASSERT (v_check->>'lead_id')::uuid = 'd7200000-0000-4000-8000-000000000001',
    'the check must name the lead the folder returns to';

  v_result := public.return_to_lead(v_dc);
  ASSERT (v_result->>'lead_id')::uuid = 'd7200000-0000-4000-8000-000000000001',
    'the act must return the restored lead id';

  ASSERT (SELECT status = 'new' AND accepted_at IS NULL
          FROM public.leads WHERE id = 'd7200000-0000-4000-8000-000000000001'),
    'the lead must go back to new with its accepted stamp cleared';
  ASSERT NOT EXISTS (SELECT 1 FROM public.designer_clients WHERE id = v_dc),
    'the empty Discovery relationship must be gone';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.client_discovery WHERE designer_client_id = v_dc
  ), 'the cascade must take the empty client_discovery row with it';

  -- document_state: Shape C returns, Shape D does not linger beside it.
  ASSERT (SELECT engagement_kind = 'lead' AND active_section = 'brief'
          FROM public.document_state
          WHERE engagement_id = 'd7200000-0000-4000-8000-000000000001'),
    'the Desk folder must read as the Brief again';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.document_state WHERE engagement_id = v_dc
  ), 'no Discovery row may survive the reversal';
  ASSERT (SELECT count(*) = 1 FROM public.document_state
          WHERE lead_id = 'd7200000-0000-4000-8000-000000000001'),
    'the reversal must leave exactly one folder for the lead';

  -- Idempotence: the relationship id is gone, so a second Undo refuses
  -- cleanly rather than half-applying anything.
  BEGIN
    PERFORM public.return_to_lead(v_dc);
    RAISE EXCEPTION 'a second reversal must not succeed';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  ASSERT (SELECT status = 'new' FROM public.leads
          WHERE id = 'd7200000-0000-4000-8000-000000000001'),
    'the refused second reversal must leave the restored lead alone';
END;
$$;

-- ── Refusal: the app-matched (ceremony) path ───────────────────────────────
DO $$
DECLARE
  v_dc uuid;
BEGIN
  v_dc := pg_temp.rtl_accept('d7200000-0000-4000-8000-000000000002');
  UPDATE public.leads
  SET client_request_id = 'd7900000-0000-4000-8000-000000000002'
  WHERE id = 'd7200000-0000-4000-8000-000000000002';

  ASSERT pg_temp.rtl_refusal(v_dc) =
    'This client was matched through the app and has already been written to.',
    'the app-matched refusal must read in the ruled words';
  ASSERT EXISTS (SELECT 1 FROM public.designer_clients WHERE id = v_dc),
    'a refused reversal must leave the relationship standing';
  ASSERT (SELECT status = 'accepted' FROM public.leads
          WHERE id = 'd7200000-0000-4000-8000-000000000002'),
    'a refused reversal must leave the lead accepted';
END;
$$;

-- ── Refusal: a proposal exists ─────────────────────────────────────────────
DO $$
DECLARE
  v_dc uuid;
BEGIN
  v_dc := pg_temp.rtl_accept('d7200000-0000-4000-8000-000000000003');
  INSERT INTO public.proposals (
    id, designer_id, designer_client_id, title, status
  ) VALUES (
    'd7400000-0000-4000-8000-000000000003',
    'd7000000-0000-4000-8000-000000000001', v_dc, 'Draft', 'draft'
  );

  ASSERT pg_temp.rtl_refusal(v_dc) =
    'A proposal has already been started for this client.',
    'a drafted proposal must close the door';
END;
$$;

-- ── Refusal: the folio holds a document ────────────────────────────────────
DO $$
DECLARE
  v_dc uuid;
BEGIN
  v_dc := pg_temp.rtl_accept('d7200000-0000-4000-8000-000000000004');
  INSERT INTO public.project_documents (
    id, designer_client_id, title, doc_type
  ) VALUES (
    'd7500000-0000-4000-8000-000000000004', v_dc, 'Inspiration', 'other'
  );

  ASSERT pg_temp.rtl_refusal(v_dc) =
    'The folio already holds a document for this client.',
    'a folio document must close the door';
END;
$$;

-- ── Refusal: a margin note ─────────────────────────────────────────────────
DO $$
DECLARE
  v_dc uuid;
BEGIN
  v_dc := pg_temp.rtl_accept('d7200000-0000-4000-8000-000000000005');
  INSERT INTO public.margin_notes (
    id, designer_id, designer_client_id, body, anchor_kind
  ) VALUES (
    'd7600000-0000-4000-8000-000000000005',
    'd7000000-0000-4000-8000-000000000001', v_dc, 'Warm, wants oak.', 'section'
  );

  ASSERT pg_temp.rtl_refusal(v_dc) =
    'There is already a note in the margin for this client.',
    'a margin note must close the door';
END;
$$;

-- ── Refusal: Discovery has been filled in ──────────────────────────────────
DO $$
DECLARE
  v_dc uuid;
BEGIN
  v_dc := pg_temp.rtl_accept('d7200000-0000-4000-8000-000000000006');
  INSERT INTO public.client_discovery (designer_client_id, designer_id, site_notes)
  VALUES (v_dc, 'd7000000-0000-4000-8000-000000000001', 'Nine-foot ceilings.');

  ASSERT pg_temp.rtl_refusal(v_dc) =
    'Discovery has already been filled in for this client.',
    'user-entered discovery content must close the door';
END;
$$;

-- ── Refusal: activity on the record ────────────────────────────────────────
DO $$
DECLARE
  v_dc uuid;
BEGIN
  v_dc := pg_temp.rtl_accept('d7200000-0000-4000-8000-00000000000a');
  INSERT INTO public.client_activity_log (
    designer_client_id, activity_type, title
  ) VALUES (v_dc, 'note', 'Left a voicemail');

  ASSERT pg_temp.rtl_refusal(v_dc) =
    'This client already has activity on the record.',
    'a logged activity must close the door';
END;
$$;

-- ── Refusal: an arrival was prepared ───────────────────────────────────────
DO $$
DECLARE
  v_dc uuid;
BEGIN
  v_dc := pg_temp.rtl_accept('d7200000-0000-4000-8000-00000000000b');
  INSERT INTO public.match_ceremonies (
    id, lead_id, designer_id, designer_client_id, state
  ) VALUES (
    'd7700000-0000-4000-8000-00000000000b',
    'd7200000-0000-4000-8000-00000000000b',
    'd7000000-0000-4000-8000-000000000001', v_dc, 'draft'
  );

  ASSERT pg_temp.rtl_refusal(v_dc) =
    'An arrival has already been prepared for this client.',
    'a ceremony must close the door';
END;
$$;

-- ── Refusal: a direct thread is open ───────────────────────────────────────
-- The relationship is made as the designer; the thread is seeded as the
-- session owner, because comms_thread_participants' INSERT policy only lets a
-- participant add themselves and the ceremony path reaches it through a
-- SECURITY DEFINER RPC, not through the designer's own grants.
-- The id rides a transaction-local GUC, not a psql variable: psql does not
-- interpolate :vars inside the dollar-quoted DO block below.
SELECT set_config(
  'app.rtl_threaded_dc',
  pg_temp.rtl_accept('d7200000-0000-4000-8000-000000000007')::text,
  true
);

RESET ROLE;

INSERT INTO public.comms_threads (id, kind, created_by)
VALUES ('d7800000-0000-4000-8000-000000000007', 'direct',
        'd7000000-0000-4000-8000-000000000001');
INSERT INTO public.comms_thread_participants (thread_id, profile_id, role)
VALUES
  ('d7800000-0000-4000-8000-000000000007',
   'd7000000-0000-4000-8000-000000000001', 'designer'),
  ('d7800000-0000-4000-8000-000000000007',
   'd7000000-0000-4000-8000-000000000010', 'client');

SET LOCAL ROLE authenticated;

DO $$
BEGIN
  ASSERT pg_temp.rtl_refusal(current_setting('app.rtl_threaded_dc')::uuid) =
    'A thread with this client is already open.',
    'an open direct thread must close the door';
END;
$$;

-- ── A studio co-member may reverse ─────────────────────────────────────────
DO $$
DECLARE
  v_dc uuid;
BEGIN
  v_dc := pg_temp.rtl_accept('d7200000-0000-4000-8000-000000000009');
  PERFORM pg_temp.assume_rtl_actor('d7000000-0000-4000-8000-000000000002');

  ASSERT (public.return_to_lead_check(v_dc)->>'allowed')::boolean,
    'an active non-guest studio peer must see the door open';
  PERFORM public.return_to_lead(v_dc);
  ASSERT (SELECT status = 'new' AND accepted_at IS NULL FROM public.leads
          WHERE id = 'd7200000-0000-4000-8000-000000000009'),
    'a studio peer''s reversal must restore the lead';

  PERFORM pg_temp.assume_rtl_actor('d7000000-0000-4000-8000-000000000001');
END;
$$;

-- ── A designer in another studio is refused, and learns nothing ────────────
DO $$
DECLARE
  v_dc    uuid;
  v_error text;
BEGIN
  v_dc := pg_temp.rtl_accept('d7200000-0000-4000-8000-000000000008');
  PERFORM pg_temp.assume_rtl_actor('d7000000-0000-4000-8000-000000000003');

  BEGIN
    PERFORM public.return_to_lead_check(v_dc);
    RAISE EXCEPTION 'a cross-studio check must not answer';
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error LIKE 'client relationship % not found or access denied',
    format('unexpected cross-studio check error %L', v_error);

  v_error := NULL;
  BEGIN
    PERFORM public.return_to_lead(v_dc);
    RAISE EXCEPTION 'a cross-studio reversal must not run';
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error LIKE 'client relationship % not found or access denied',
    format('unexpected cross-studio act error %L', v_error);

  PERFORM pg_temp.assume_rtl_actor('d7000000-0000-4000-8000-000000000001');
  ASSERT EXISTS (SELECT 1 FROM public.designer_clients WHERE id = v_dc),
    'a cross-studio refusal must leave the relationship standing';
  ASSERT (SELECT status = 'accepted' FROM public.leads
          WHERE id = 'd7200000-0000-4000-8000-000000000008'),
    'a cross-studio refusal must leave the lead accepted';
END;
$$;

RESET ROLE;

DO $$
BEGIN
  ASSERT has_function_privilege(
    'authenticated', 'public.return_to_lead(uuid)', 'EXECUTE'
  ), 'authenticated must be able to execute return_to_lead';
  ASSERT has_function_privilege(
    'authenticated', 'public.return_to_lead_check(uuid)', 'EXECUTE'
  ), 'authenticated must be able to execute return_to_lead_check';
  ASSERT NOT has_function_privilege(
    'anon', 'public.return_to_lead(uuid)', 'EXECUTE'
  ), 'anon must not execute return_to_lead';
  ASSERT NOT has_function_privilege(
    'anon', 'public.return_to_lead_check(uuid)', 'EXECUTE'
  ), 'anon must not execute return_to_lead_check';
  ASSERT NOT has_function_privilege(
    'public', 'public.return_to_lead(uuid)', 'EXECUTE'
  ), 'PUBLIC must not execute return_to_lead';
  ASSERT NOT has_function_privilege(
    'public', 'public.return_to_lead_check(uuid)', 'EXECUTE'
  ), 'PUBLIC must not execute return_to_lead_check';
  ASSERT (
    SELECT prosecdef AND proconfig @> ARRAY['search_path=public, pg_temp']
    FROM pg_proc WHERE oid = 'public.return_to_lead(uuid)'::regprocedure
  ), 'return_to_lead must be SECURITY DEFINER with a pinned search_path';
  ASSERT (
    SELECT prosecdef AND proconfig @> ARRAY['search_path=public, pg_temp']
    FROM pg_proc WHERE oid = 'public.return_to_lead_check(uuid)'::regprocedure
  ), 'return_to_lead_check must be SECURITY DEFINER with a pinned search_path';
END;
$$;

ROLLBACK;
