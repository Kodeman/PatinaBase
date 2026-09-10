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
   'Has Ceremony', 'rtl-ceremony@test.invalid'),
  ('d7200000-0000-4000-8000-00000000000c', NULL,
   'd7000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Nurtured', 'rtl-nurtured@test.invalid'),
  ('d7200000-0000-4000-8000-00000000000d', NULL,
   'd7000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Own Details', 'rtl-details@test.invalid'),
  ('d7200000-0000-4000-8000-00000000000e', NULL,
   'd7000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Adopted Row', 'rtl-adopted@test.invalid'),
  ('d7200000-0000-4000-8000-00000000000f', NULL,
   'd7000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Lead Moved On', 'rtl-lead-moved@test.invalid'),
  ('d7200000-0000-4000-8000-000000000010', NULL,
   'd7000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Client Moved On', 'rtl-client-moved@test.invalid'),
  ('d7200000-0000-4000-8000-000000000011', 'd7000000-0000-4000-8000-000000000010',
   'd7000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Written To', 'rtl-written@test.invalid'),
  ('d7200000-0000-4000-8000-000000000012', NULL,
   'd7000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Empty Rows', 'rtl-empty-rows@test.invalid'),
  ('d7200000-0000-4000-8000-000000000013', NULL,
   'd7000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Planted Victim', 'rtl-victim@test.invalid'),
  ('d7200000-0000-4000-8000-000000000014', NULL,
   'd7000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Two Relationships', 'rtl-sibling@test.invalid'),
  -- 00586: the two prefill leads. The first carries all three facts the
  -- Discovery folder prefills from (project_type, budget_range, timeline); the
  -- second's budget_range is the free text prod has drifted to, which the
  -- portal's mapping does not read, so it prefills no figure at all.
  ('d7200000-0000-4000-8000-000000000015', NULL,
   'd7000000-0000-4000-8000-000000000001', 'full_room', 'new',
   'Prefill Echo', 'rtl-prefill@test.invalid'),
  ('d7200000-0000-4000-8000-000000000016', NULL,
   'd7000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Drifted Budget', 'rtl-drifted@test.invalid');

UPDATE public.leads
SET budget_range = '5k_15k', timeline = 'asap'
WHERE id = 'd7200000-0000-4000-8000-000000000015';

UPDATE public.leads
SET budget_range = '$8k-$12k'
WHERE id = 'd7200000-0000-4000-8000-000000000016';

UPDATE public.leads
SET status = 'contacted',
    contacted_at = NOW(),
    response_deadline = TIMESTAMPTZ '2026-12-01 12:00:00+00'
WHERE id = 'd7200000-0000-4000-8000-00000000000c';

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

-- ── A planted lead_id buys a stranger nothing ──────────────────────────────
-- designer_clients.lead_id is caller-writable and RLS lets a designer insert
-- their OWN relationship row. Without authority on the LEAD end too, a
-- designer in another studio could point a row of their own at a victim's
-- accepted lead and un-accept it, leaving the victim with both a Discovery
-- folder and a New-Lead Brief for one lead.
DO $$
DECLARE
  v_victim_dc  uuid;
  v_planted_dc uuid;
  v_error      text;
BEGIN
  v_victim_dc := pg_temp.rtl_accept('d7200000-0000-4000-8000-000000000013');

  PERFORM pg_temp.assume_rtl_actor('d7000000-0000-4000-8000-000000000003');
  INSERT INTO public.designer_clients (
    designer_id, client_email, source, lead_id, status
  ) VALUES (
    'd7000000-0000-4000-8000-000000000003', 'rtl-planted@test.invalid',
    'direct', 'd7200000-0000-4000-8000-000000000013', 'lead'
  )
  RETURNING id INTO v_planted_dc;

  BEGIN
    PERFORM public.return_to_lead_check(v_planted_dc);
    RAISE EXCEPTION 'a planted lead_id must not open the door';
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error LIKE 'client relationship % not found or access denied',
    format('unexpected planted-lead check error %L', v_error);

  v_error := NULL;
  BEGIN
    PERFORM public.return_to_lead(v_planted_dc);
    RAISE EXCEPTION 'a planted lead_id must not run the reversal';
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error LIKE 'client relationship % not found or access denied',
    format('unexpected planted-lead act error %L', v_error);

  PERFORM pg_temp.assume_rtl_actor('d7000000-0000-4000-8000-000000000001');
  ASSERT (SELECT status = 'accepted' AND accepted_at IS NOT NULL
          FROM public.leads
          WHERE id = 'd7200000-0000-4000-8000-000000000013'),
    'the victim''s lead must stay exactly where they left it';
  ASSERT EXISTS (SELECT 1 FROM public.designer_clients WHERE id = v_victim_dc),
    'the victim''s own Discovery relationship must survive';
END;
$$;

-- ── Refusal: two relationships point at one lead ───────────────────────────
-- The reversal un-accepts the lead and deletes ONE relationship. A sibling row
-- on the same lead would be left standing behind a lead that is back at 'new',
-- and Shape D excludes a relationship whose lead is not accepted — so the
-- survivor would emit no Desk folder at all (review F2-R2-01). RLS permits the
-- duplicate: a studio co-member may insert a row carrying any lead id of the
-- studio's, and neither partial unique index on designer_clients forbids it.
DO $$
DECLARE
  v_dc      uuid;
  v_sibling uuid;
BEGIN
  v_dc := pg_temp.rtl_accept('d7200000-0000-4000-8000-000000000014');

  ASSERT (public.return_to_lead_check(v_dc)->>'allowed')::boolean,
    'one relationship on the lead must leave the door open';

  -- A distinct client_email: the hydrate trigger COALESCEs, so this survives,
  -- and the (designer_id, client_email) partial unique index is not tripped.
  INSERT INTO public.designer_clients (
    designer_id, client_email, source, lead_id, status
  ) VALUES (
    'd7000000-0000-4000-8000-000000000001', 'rtl-sibling-second@test.invalid',
    'direct', 'd7200000-0000-4000-8000-000000000014', 'lead'
  )
  RETURNING id INTO v_sibling;

  ASSERT pg_temp.rtl_refusal(v_dc) =
    'This lead is tied to more than one client, so there is no single move to take back.',
    'a second relationship on the same lead must close the door';
  -- Either row refuses, not only the one the accept created: the check is
  -- ahead of the content and adoption branches for exactly this reason.
  ASSERT pg_temp.rtl_refusal(v_sibling) =
    'This lead is tied to more than one client, so there is no single move to take back.',
    'the second relationship must refuse for the same reason';

  ASSERT (SELECT status = 'accepted' AND accepted_at IS NOT NULL
          FROM public.leads
          WHERE id = 'd7200000-0000-4000-8000-000000000014'),
    'a refused reversal must leave the lead accepted';
  ASSERT (SELECT count(*) = 2 FROM public.designer_clients
          WHERE lead_id = 'd7200000-0000-4000-8000-000000000014'),
    'a refused reversal must leave both relationships standing';

  DELETE FROM public.designer_clients WHERE id = v_sibling;
  ASSERT (public.return_to_lead_check(v_dc)->>'allowed')::boolean,
    'with the sibling gone the door opens again';
END;
$$;

-- ── A nurtured lead comes back to its dated return, not to "new" ───────────
DO $$
DECLARE
  v_dc uuid;
BEGIN
  v_dc := pg_temp.rtl_accept('d7200000-0000-4000-8000-00000000000c');
  PERFORM public.return_to_lead(v_dc);

  ASSERT (SELECT status = 'contacted'
            AND accepted_at IS NULL
            AND response_deadline = TIMESTAMPTZ '2026-12-01 12:00:00+00'
          FROM public.leads
          WHERE id = 'd7200000-0000-4000-8000-00000000000c'),
    'a nurtured lead must return to contacted with its reconnect date intact';
END;
$$;

-- ── Refusal: the relationship carries details of its own ───────────────────
DO $$
DECLARE
  v_dc uuid;
BEGIN
  v_dc := pg_temp.rtl_accept('d7200000-0000-4000-8000-00000000000d');

  UPDATE public.designer_clients
  SET notes = 'Wants oak throughout. Hates chrome.'
  WHERE id = v_dc;
  ASSERT pg_temp.rtl_refusal(v_dc) =
    'This client''s own details have been filled in.',
    'a note written on the relationship must close the door';

  -- The household sheet's corrected name is content too, and the DELETE would
  -- discard it: the restored Brief only carries the lead's original contact.
  UPDATE public.designer_clients
  SET notes = NULL, client_name = 'Corrected Name'
  WHERE id = v_dc;
  ASSERT pg_temp.rtl_refusal(v_dc) =
    'This client''s own details have been filled in.',
    'a corrected client name must close the door';
END;
$$;

-- ── Refusal: begin_discovery ADOPTED a relationship that predates the accept ─
DO $$
DECLARE
  v_pre uuid;
  v_dc  uuid;
BEGIN
  INSERT INTO public.designer_clients (
    designer_id, client_email, source, status, created_at
  ) VALUES (
    'd7000000-0000-4000-8000-000000000001', 'rtl-adopted@test.invalid',
    'direct', 'lead', NOW() - INTERVAL '1 day'
  )
  RETURNING id INTO v_pre;

  v_dc := pg_temp.rtl_accept('d7200000-0000-4000-8000-00000000000e');
  ASSERT v_dc = v_pre,
    'begin_discovery must have adopted the pre-existing contact for this test to mean anything';

  ASSERT pg_temp.rtl_refusal(v_dc) =
    'This client was already on your list before the lead came in.',
    'an adopted relationship must not be deleted by the undo';
  ASSERT EXISTS (SELECT 1 FROM public.designer_clients WHERE id = v_pre),
    'the adopted relationship must still stand';
END;
$$;

-- ── Refusal: the relationship carries no lead ──────────────────────────────
DO $$
DECLARE
  v_dc uuid;
BEGIN
  INSERT INTO public.designer_clients (
    designer_id, client_email, source, status
  ) VALUES (
    'd7000000-0000-4000-8000-000000000001', 'rtl-nolead@test.invalid',
    'direct', 'lead'
  )
  RETURNING id INTO v_dc;

  ASSERT pg_temp.rtl_refusal(v_dc) =
    'This client did not arrive as a lead, so there is no lead to go back to.',
    'a relationship with no lead behind it has nowhere to go back to';
END;
$$;

-- ── Refusal: the relationship has moved past Discovery ─────────────────────
DO $$
DECLARE
  v_dc uuid;
BEGIN
  v_dc := pg_temp.rtl_accept('d7200000-0000-4000-8000-000000000010');
  UPDATE public.designer_clients SET status = 'active' WHERE id = v_dc;

  ASSERT pg_temp.rtl_refusal(v_dc) =
    'This client has already moved past Discovery.',
    'a relationship past Discovery must close the door';
END;
$$;

-- ── Refusal: the lead is no longer waiting to be accepted ──────────────────
DO $$
DECLARE
  v_dc uuid;
BEGIN
  v_dc := pg_temp.rtl_accept('d7200000-0000-4000-8000-00000000000f');
  UPDATE public.leads
  SET status = 'declined', declined_at = NOW()
  WHERE id = 'd7200000-0000-4000-8000-00000000000f';

  ASSERT pg_temp.rtl_refusal(v_dc) =
    'The lead behind this client is no longer waiting to be accepted.',
    'a lead that moved on under the relationship must close the door';
END;
$$;

-- ── An empty row is not content, a named one is ────────────────────────────
-- F5: "+ Add a room" tapped once and never typed into must not read as content
-- here when it does not read as "1 room" on the surface.
DO $$
DECLARE
  v_dc uuid;
BEGIN
  v_dc := pg_temp.rtl_accept('d7200000-0000-4000-8000-000000000012');
  INSERT INTO public.client_discovery (
    designer_client_id, designer_id, rooms, lifestyle
  ) VALUES (
    v_dc, 'd7000000-0000-4000-8000-000000000001',
    '[{}]'::jsonb, '[{"room": "Living"}]'::jsonb
  );

  ASSERT (public.return_to_lead_check(v_dc)->>'allowed')::boolean,
    'a nameless room row and a wordless lifestyle row are not content';

  UPDATE public.client_discovery
  SET rooms = '[{"name": "Living room"}]'::jsonb
  WHERE designer_client_id = v_dc;
  ASSERT pg_temp.rtl_refusal(v_dc) =
    'Discovery has already been filled in for this client.',
    'a named room must close the door';

  UPDATE public.client_discovery
  SET rooms = '[{}]'::jsonb,
      lifestyle = '[{"who": "two children"}]'::jsonb
  WHERE designer_client_id = v_dc;
  ASSERT pg_temp.rtl_refusal(v_dc) =
    'Discovery has already been filled in for this client.',
    'a lifestyle row that says who must close the door';
END;
$$;

-- ── 00586: the folder's own prefill is not "filled in" ─────────────────────
-- Opening Discovery persists the lead-derived prefill on first render
-- (discovery-section.tsx). QA 2026-09-09 flow C: that echo refused the undo
-- before the designer had typed anything. The echo is not content; a value
-- that differs from it is.
DO $$
DECLARE
  v_dc uuid;
BEGIN
  v_dc := pg_temp.rtl_accept('d7200000-0000-4000-8000-000000000015');

  -- Exactly what useDiscovery's prefill writes for this lead: its
  -- project_type, budgetRangeToCents('5k_15k'), and its timeline.
  INSERT INTO public.client_discovery (
    designer_client_id, designer_id, project_type,
    budget_min_cents, budget_max_cents, start_urgency
  ) VALUES (
    v_dc, 'd7000000-0000-4000-8000-000000000001', 'full_room',
    500000, 1500000, 'asap'
  );

  ASSERT (public.return_to_lead_check(v_dc)->>'allowed')::boolean,
    format(
      'the folder''s own prefill must not close the door, got %L',
      public.return_to_lead_check(v_dc)->>'reason'
    );

  -- Each of the four, moved off the prefill in turn, is the designer's answer.
  UPDATE public.client_discovery SET project_type = 'whole_home'
  WHERE designer_client_id = v_dc;
  ASSERT pg_temp.rtl_refusal(v_dc) =
    'Discovery has already been filled in for this client.',
    'a project type the designer changed must close the door';

  UPDATE public.client_discovery SET project_type = 'full_room',
                                     budget_max_cents = 1600000
  WHERE designer_client_id = v_dc;
  ASSERT pg_temp.rtl_refusal(v_dc) =
    'Discovery has already been filled in for this client.',
    'a budget ceiling the designer set must close the door';

  UPDATE public.client_discovery SET budget_max_cents = 1500000,
                                     budget_min_cents = 400000
  WHERE designer_client_id = v_dc;
  ASSERT pg_temp.rtl_refusal(v_dc) =
    'Discovery has already been filled in for this client.',
    'a budget floor the designer set must close the door';

  UPDATE public.client_discovery SET budget_min_cents = 500000,
                                     start_urgency = 'next_spring'
  WHERE designer_client_id = v_dc;
  ASSERT pg_temp.rtl_refusal(v_dc) =
    'Discovery has already been filled in for this client.',
    'an urgency the designer set must close the door';
END;
$$;

-- A budget_range the portal's mapping does not read prefills nothing, so any
-- figure in the row came from the designer.
DO $$
DECLARE
  v_dc uuid;
BEGIN
  v_dc := pg_temp.rtl_accept('d7200000-0000-4000-8000-000000000016');
  INSERT INTO public.client_discovery (
    designer_client_id, designer_id, project_type, budget_max_cents
  ) VALUES (
    v_dc, 'd7000000-0000-4000-8000-000000000001', 'consultation', 1200000
  );

  ASSERT pg_temp.rtl_refusal(v_dc) =
    'Discovery has already been filled in for this client.',
    'a figure no prefill could have written must close the door';
END;
$$;

-- ── Refusal: the client has already been written to (all six tables) ───────
-- One relationship, six rows in turn. Each seed is written as the session
-- owner: these tables' INSERT policies are not the designer's to satisfy from
-- the portal, and what is under test is the check, not the writer.
RESET ROLE;

SELECT set_config(
  'app.rtl_written_dc',
  pg_temp.rtl_accept('d7200000-0000-4000-8000-000000000011')::text,
  true
);

INSERT INTO public.client_invitations (
  token, email, designer_id, designer_client_id
) VALUES (
  'rtl-invite-token', 'rtl-written@test.invalid',
  'd7000000-0000-4000-8000-000000000001',
  current_setting('app.rtl_written_dc')::uuid
);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT pg_temp.rtl_refusal(current_setting('app.rtl_written_dc')::uuid) =
    'This client has already been written to.',
    'a client invitation must close the door';
END;
$$;
RESET ROLE;
DELETE FROM public.client_invitations
WHERE designer_client_id = current_setting('app.rtl_written_dc')::uuid;

INSERT INTO public.client_messages (
  sender_id, recipient_id, body, designer_client_id
) VALUES (
  'd7000000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000010',
  'Looking forward to it.',
  current_setting('app.rtl_written_dc')::uuid
);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT pg_temp.rtl_refusal(current_setting('app.rtl_written_dc')::uuid) =
    'This client has already been written to.',
    'a client message must close the door';
END;
$$;
RESET ROLE;
DELETE FROM public.client_messages
WHERE designer_client_id = current_setting('app.rtl_written_dc')::uuid;

INSERT INTO public.client_nurture_touchpoints (
  designer_client_id, touchpoint_type
) VALUES (current_setting('app.rtl_written_dc')::uuid, 'check_in');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT pg_temp.rtl_refusal(current_setting('app.rtl_written_dc')::uuid) =
    'This client has already been written to.',
    'a nurture touchpoint must close the door';
END;
$$;
RESET ROLE;
DELETE FROM public.client_nurture_touchpoints
WHERE designer_client_id = current_setting('app.rtl_written_dc')::uuid;

INSERT INTO public.client_reviews (designer_client_id, rating)
VALUES (current_setting('app.rtl_written_dc')::uuid, 5);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT pg_temp.rtl_refusal(current_setting('app.rtl_written_dc')::uuid) =
    'This client has already been written to.',
    'a client review must close the door';
END;
$$;
RESET ROLE;
DELETE FROM public.client_reviews
WHERE designer_client_id = current_setting('app.rtl_written_dc')::uuid;

-- fulfillment_writer_guard refuses any write not stamped as an RPC or a
-- migration; the stamp is transaction-local and cleared straight after.
SELECT set_config('app.fulfillment_writer', 'migration', true);
INSERT INTO public.fulfillment_orders (
  client_name, designer_client_id, captured_total_cents,
  product_subtotal_cents, freight_charged_cents, tax_cents
) VALUES (
  'Written To', current_setting('app.rtl_written_dc')::uuid, 0, 0, 0, 0
);
SELECT set_config('app.fulfillment_writer', '', true);
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT pg_temp.rtl_refusal(current_setting('app.rtl_written_dc')::uuid) =
    'This client has already been written to.',
    'a fulfillment order must close the door';
END;
$$;
RESET ROLE;
SELECT set_config('app.fulfillment_writer', 'migration', true);
DELETE FROM public.fulfillment_orders
WHERE designer_client_id = current_setting('app.rtl_written_dc')::uuid;
SELECT set_config('app.fulfillment_writer', '', true);

-- Last of the six, and left standing: a client decision may only be removed
-- through delete_client_decision_draft (guard_client_decision_authority), so
-- there is no tidy-up to do after it and nothing after it needs the door open.
INSERT INTO public.client_decisions (designer_client_id, designer_id, title)
VALUES (current_setting('app.rtl_written_dc')::uuid,
        'd7000000-0000-4000-8000-000000000001', 'Sconce finish');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  ASSERT pg_temp.rtl_refusal(current_setting('app.rtl_written_dc')::uuid) =
    'This client has already been written to.',
    'a client decision must close the door';
END;
$$;
RESET ROLE;

-- ── The four indexes 00585 adds for its own probes are here ────────────────
-- Existence only, and only for the four this migration adds — the other
-- probes ride indexes their own migrations created, and an EXPLAIN on an empty
-- local table proves nothing either way (review F2-R2-02).
DO $$
BEGIN
  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_fulfillment_orders_designer_client'
  ), 'fulfillment_orders.designer_client_id must be indexed for the check';
  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_match_ceremonies_designer_client'
  ), 'match_ceremonies.designer_client_id must be indexed for the check';
  -- Deliberately not partial on archived_at: an archived thread is still an
  -- open thread, which is why idx_comms_participants_profile_inbox is no use
  -- to the direct-thread probe.
  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_comms_participants_profile_open'
      AND indexdef NOT LIKE '%archived_at%'
  ), 'the direct-thread probe needs comms_thread_participants(profile_id)';
  ASSERT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_designer_clients_lead'
  ), 'the sibling probe needs designer_clients(lead_id) indexed';
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
