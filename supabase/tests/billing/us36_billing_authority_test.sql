-- ═══════════════════════════════════════════════════════════════════════════
-- 00796 — US-36 R1 billing authority: K5, K9, K11
--
--   (k5)  set_document_client on a project: its lead, an owner and an admin of
--         its studio link a client; a plain studio member and an outsider are
--         refused exactly as before. can_link_document_client answers the same
--         for each. The relationship is still read from the lead's book (00385),
--         and a proposal stays owner-only.
--   (k5h–k5k) SQ-1066 F1: while the lead's seat is inactive, guest or removed,
--         the owner is refused up front ('set_document_client:
--         lead_not_in_studio') and document_client_link_hold names
--         'lead_not_in_studio'; with the seat active again she links as before.
--   (k5l) SQ-1073 R2: owner/admin standing comes from the caller's locked
--         seat row: an admin with no seat, or a suspended one, is refused.
--   (k9)  open_project_direct with p_studio_id: stamps a studio the caller sits
--         in, refuses one she does not ('open_project_direct: studio_not_member'),
--         admits a two-studio designer who names one, and the 6-argument
--         signature still refuses her as today and still works for everybody
--         else.
--   (k11) K11(a) works by stamping at creation. A solo owner's new project gets
--         her studio, her self-authored rate prices her hour (K11(b), no
--         widening), naming a studio on an already-NULL legacy project stays
--         closed for her (HT-3-g(3), orchestrator narrowing pending Kody), and a
--         two-designer studio's owner is still refused the self-stamp.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/billing/us36_billing_authority_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c7960000-0000-4000-8000-000000000001', 'us36-lead@test.invalid',          '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7960000-0000-4000-8000-000000000002', 'us36-owner@test.invalid',         '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7960000-0000-4000-8000-000000000003', 'us36-admin@test.invalid',         '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7960000-0000-4000-8000-000000000004', 'us36-member@test.invalid',        '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7960000-0000-4000-8000-000000000005', 'us36-outsider@test.invalid',      '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7960000-0000-4000-8000-000000000006', 'us36-client@test.invalid',        '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7960000-0000-4000-8000-000000000007', 'us36-owner-client@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7960000-0000-4000-8000-000000000008', 'us36-two-studio@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7960000-0000-4000-8000-000000000009', 'us36-solo-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7960000-0000-4000-8000-00000000000a', 'us36-pair-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7960000-0000-4000-8000-00000000000b', 'us36-pair-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c7960000-0000-4000-8000-00000000000c', 'us36-leaving-lead@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

UPDATE public.profiles SET full_name = 'US36 Lead'          WHERE id = 'c7960000-0000-4000-8000-000000000001';
UPDATE public.profiles SET full_name = 'US36 Owner'         WHERE id = 'c7960000-0000-4000-8000-000000000002';
UPDATE public.profiles SET full_name = 'US36 Admin'         WHERE id = 'c7960000-0000-4000-8000-000000000003';
UPDATE public.profiles SET full_name = 'US36 Member'        WHERE id = 'c7960000-0000-4000-8000-000000000004';
UPDATE public.profiles SET full_name = 'US36 Outsider'      WHERE id = 'c7960000-0000-4000-8000-000000000005';
UPDATE public.profiles SET full_name = 'US36 Client'        WHERE id = 'c7960000-0000-4000-8000-000000000006';
UPDATE public.profiles SET full_name = 'US36 Owner Client'  WHERE id = 'c7960000-0000-4000-8000-000000000007';
UPDATE public.profiles SET full_name = 'US36 Two Studio'    WHERE id = 'c7960000-0000-4000-8000-000000000008';
UPDATE public.profiles SET full_name = 'US36 Solo Owner'    WHERE id = 'c7960000-0000-4000-8000-000000000009';
UPDATE public.profiles SET full_name = 'US36 Pair Owner'    WHERE id = 'c7960000-0000-4000-8000-00000000000a';
UPDATE public.profiles SET full_name = 'US36 Pair Designer' WHERE id = 'c7960000-0000-4000-8000-00000000000b';
UPDATE public.profiles SET full_name = 'US36 Leaving Lead'  WHERE id = 'c7960000-0000-4000-8000-00000000000c';

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES
  ('c7960000-0000-4000-8000-0000000000a1', 'design_studio', 'US36 Studio',         'us36-studio-test',         'active'),
  ('c7960000-0000-4000-8000-0000000000a2', 'design_studio', 'US36 Outside Studio', 'us36-outside-studio-test', 'active'),
  ('c7960000-0000-4000-8000-0000000000a3', 'design_studio', 'US36 Solo Studio',    'us36-solo-studio-test',    'active'),
  ('c7960000-0000-4000-8000-0000000000a4', 'design_studio', 'US36 Pair Studio',    'us36-pair-studio-test',    'active');

-- Legacy NULL-studio projects, inserted before any seat exists (the legacy
-- shape the stamp act repairs): the solo owner's and the pair owner's.
INSERT INTO public.projects (id, name, designer_id, created_by, studio_id, status)
VALUES
  ('c7960000-0000-4000-8000-0000000000e3', 'US36 Solo Legacy House',
   'c7960000-0000-4000-8000-000000000009', 'c7960000-0000-4000-8000-000000000009', NULL, 'active'),
  ('c7960000-0000-4000-8000-0000000000e4', 'US36 Pair Legacy House',
   'c7960000-0000-4000-8000-00000000000a', 'c7960000-0000-4000-8000-00000000000a', NULL, 'active');

-- Seats before roles, so 00295 provisions nobody a workspace. Each studio's
-- owner seat comes first: 00484 admits a first owner only into an empty studio.
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
VALUES
  ('c7960000-0000-4000-8000-000000000002', 'c7960000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW()),
  ('c7960000-0000-4000-8000-000000000001', 'c7960000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c7960000-0000-4000-8000-000000000003', 'c7960000-0000-4000-8000-0000000000a1', 'admin',  'active', NOW()),
  ('c7960000-0000-4000-8000-000000000004', 'c7960000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  -- the lead whose seat (k5h–k5k) goes inactive, guest and removed
  ('c7960000-0000-4000-8000-00000000000c', 'c7960000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c7960000-0000-4000-8000-000000000005', 'c7960000-0000-4000-8000-0000000000a2', 'owner',  'active', NOW()),
  -- the two-studio designer: a seat in each studio, so 00563 cannot choose
  ('c7960000-0000-4000-8000-000000000008', 'c7960000-0000-4000-8000-0000000000a1', 'member', 'active', NOW()),
  ('c7960000-0000-4000-8000-000000000008', 'c7960000-0000-4000-8000-0000000000a2', 'member', 'active', NOW()),
  -- the solo owner: her studio's only active non-guest member
  ('c7960000-0000-4000-8000-000000000009', 'c7960000-0000-4000-8000-0000000000a3', 'owner',  'active', NOW()),
  -- the pair studio: an owner and a second designer
  ('c7960000-0000-4000-8000-00000000000a', 'c7960000-0000-4000-8000-0000000000a4', 'owner',  'active', NOW()),
  ('c7960000-0000-4000-8000-00000000000b', 'c7960000-0000-4000-8000-0000000000a4', 'member', 'active', NOW());

INSERT INTO public.user_roles (user_id, role_id)
SELECT designer.id, role.id
FROM (VALUES
  ('c7960000-0000-4000-8000-000000000001'::uuid),
  ('c7960000-0000-4000-8000-000000000008'::uuid),
  ('c7960000-0000-4000-8000-000000000009'::uuid),
  ('c7960000-0000-4000-8000-00000000000a'::uuid),
  ('c7960000-0000-4000-8000-00000000000b'::uuid),
  ('c7960000-0000-4000-8000-00000000000c'::uuid)
) AS designer(id)
CROSS JOIN public.roles AS role
WHERE role.name = 'studio_designer';

-- The lead's project, in her one studio (00563 derives it), and the leaving
-- lead's, in the same studio.
INSERT INTO public.projects (id, name, designer_id, created_by, status)
VALUES ('c7960000-0000-4000-8000-0000000000e1', 'US36 Lead House',
        'c7960000-0000-4000-8000-000000000001', 'c7960000-0000-4000-8000-000000000001', 'active'),
       ('c7960000-0000-4000-8000-0000000000e2', 'US36 Leaving Lead House',
        'c7960000-0000-4000-8000-00000000000c', 'c7960000-0000-4000-8000-00000000000c', 'active');

-- The lead's book holds the client as a 'lead' row (linking makes it active).
-- The owner's own book holds a different client.
INSERT INTO public.designer_clients (id, designer_id, client_id, client_email, client_name, status, source)
VALUES
  ('c7960000-0000-4000-8000-0000000000d1', 'c7960000-0000-4000-8000-000000000001',
   'c7960000-0000-4000-8000-000000000006', 'us36-client@test.invalid', 'US36 Client', 'lead', 'direct'),
  ('c7960000-0000-4000-8000-0000000000d2', 'c7960000-0000-4000-8000-000000000002',
   'c7960000-0000-4000-8000-000000000007', 'us36-owner-client@test.invalid', 'US36 Owner Client', 'active', 'direct'),
  ('c7960000-0000-4000-8000-0000000000d3', 'c7960000-0000-4000-8000-00000000000c',
   'c7960000-0000-4000-8000-000000000006', 'us36-client@test.invalid', 'US36 Client', 'active', 'direct');

INSERT INTO public.proposals (id, designer_id, designer_client_id, client_id, title, total_amount, status)
VALUES ('c7960000-0000-4000-8000-0000000000f1', 'c7960000-0000-4000-8000-000000000001',
        'c7960000-0000-4000-8000-0000000000d1', NULL, 'US36 Lead Proposal', 100000, 'draft');

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
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

-- set_document_client as p_actor; returns NULL on success, else SQLSTATE|message.
CREATE OR REPLACE FUNCTION pg_temp.link_as(p_actor UUID, p_kind TEXT, p_target UUID, p_client UUID)
RETURNS TEXT AS $$
DECLARE
  v_err TEXT;
BEGIN
  PERFORM pg_temp.assume_user(p_actor);
  BEGIN
    PERFORM public.set_document_client(p_kind, p_target, p_client);
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || '|' || SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  RETURN v_err;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.link_as(UUID, TEXT, UUID, UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.can_link_as(p_actor UUID, p_project UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_answer BOOLEAN;
BEGIN
  PERFORM pg_temp.assume_user(p_actor);
  SELECT public.can_link_document_client(p_project) INTO v_answer;
  PERFORM pg_temp.reset_role();
  RETURN v_answer;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.can_link_as(UUID, UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.link_hold_as(p_actor UUID, p_project UUID)
RETURNS TEXT AS $$
DECLARE
  v_answer TEXT;
BEGIN
  PERFORM pg_temp.assume_user(p_actor);
  SELECT public.document_client_link_hold(p_project) INTO v_answer;
  PERFORM pg_temp.reset_role();
  RETURN v_answer;
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.link_hold_as(UUID, UUID) TO PUBLIC;

-- The leaving lead's seat in the studio, set as the fixture owner.
CREATE OR REPLACE FUNCTION pg_temp.set_leaving_lead_seat(p_role public.member_role, p_status public.member_status)
RETURNS VOID AS $$
BEGIN
  UPDATE public.organization_members
  SET role = p_role, status = p_status
  WHERE user_id = 'c7960000-0000-4000-8000-00000000000c'
    AND organization_id = 'c7960000-0000-4000-8000-0000000000a1';
END;
$$ LANGUAGE plpgsql;

-- ─── preconditions ─────────────────────────────────────────────────────────
DO $$
BEGIN
  ASSERT (SELECT studio_id FROM public.projects WHERE id = 'c7960000-0000-4000-8000-0000000000e1')
         = 'c7960000-0000-4000-8000-0000000000a1',
    'FAIL p0 (precondition): the lead''s project sits in her one studio';
  ASSERT (SELECT studio_id FROM public.projects WHERE id = 'c7960000-0000-4000-8000-0000000000e2')
         = 'c7960000-0000-4000-8000-0000000000a1',
    'FAIL p0e (precondition): the leaving lead''s project sits in the same studio';
  ASSERT (SELECT client_id IS NULL FROM public.projects WHERE id = 'c7960000-0000-4000-8000-0000000000e1'),
    'FAIL p0b (precondition): the project starts with no client';
  ASSERT (SELECT bool_and(studio_id IS NULL) FROM public.projects
           WHERE id IN ('c7960000-0000-4000-8000-0000000000e3', 'c7960000-0000-4000-8000-0000000000e4')),
    'FAIL p0c (precondition): both legacy projects carry a NULL studio';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id IN ('c7960000-0000-4000-8000-000000000001', 'c7960000-0000-4000-8000-000000000009',
                      'c7960000-0000-4000-8000-00000000000a', 'c7960000-0000-4000-8000-00000000000b',
                      'c7960000-0000-4000-8000-000000000008', 'c7960000-0000-4000-8000-00000000000c')
      AND organization_id NOT IN ('c7960000-0000-4000-8000-0000000000a1', 'c7960000-0000-4000-8000-0000000000a2',
                                  'c7960000-0000-4000-8000-0000000000a3', 'c7960000-0000-4000-8000-0000000000a4')),
    'FAIL p0d (precondition): 00295 provisioned no extra workspace';
  RAISE NOTICE 'us36: preconditions passed.';
END
$$;

-- ─── (k5) Link a client ────────────────────────────────────────────────────
DO $$
DECLARE
  v_err TEXT;
BEGIN
  -- k5a: a plain member of the studio is refused, as before.
  v_err := pg_temp.link_as('c7960000-0000-4000-8000-000000000004', 'project',
                           'c7960000-0000-4000-8000-0000000000e1', 'c7960000-0000-4000-8000-000000000006');
  ASSERT v_err = '42501|no project owned by you with id c7960000-0000-4000-8000-0000000000e1',
    'FAIL k5a (K5): a plain studio member keeps today''s refusal; got ' || COALESCE(v_err, 'NO RAISE');
  ASSERT pg_temp.can_link_as('c7960000-0000-4000-8000-000000000004', 'c7960000-0000-4000-8000-0000000000e1') IS FALSE,
    'FAIL k5a2 (K5): can_link_document_client says no to a plain member';

  -- k5b: an outsider (owner of another studio) is refused, as before.
  v_err := pg_temp.link_as('c7960000-0000-4000-8000-000000000005', 'project',
                           'c7960000-0000-4000-8000-0000000000e1', 'c7960000-0000-4000-8000-000000000006');
  ASSERT v_err = '42501|no project owned by you with id c7960000-0000-4000-8000-0000000000e1',
    'FAIL k5b (K5): an outsider keeps today''s refusal; got ' || COALESCE(v_err, 'NO RAISE');
  ASSERT pg_temp.can_link_as('c7960000-0000-4000-8000-000000000005', 'c7960000-0000-4000-8000-0000000000e1') IS FALSE,
    'FAIL k5b2 (K5): can_link_document_client says no to an outsider';
  ASSERT pg_temp.can_link_as('c7960000-0000-4000-8000-000000000002', 'c7960000-0000-4000-8000-0000000000ff') IS FALSE,
    'FAIL k5b3 (K5): can_link_document_client says no for an unknown project';

  ASSERT (SELECT client_id IS NULL FROM public.projects WHERE id = 'c7960000-0000-4000-8000-0000000000e1'),
    'FAIL k5ab: refused calls wrote nothing';

  -- k5c: the studio owner may act, but the client must be on the LEAD's book
  --      (00385's relationship consistency, kept).
  v_err := pg_temp.link_as('c7960000-0000-4000-8000-000000000002', 'project',
                           'c7960000-0000-4000-8000-0000000000e1', 'c7960000-0000-4000-8000-000000000007');
  ASSERT v_err = '42501|client c7960000-0000-4000-8000-000000000007 is not one of this project''s lead designer''s clients',
    'FAIL k5c (00385 kept): a client only on the owner''s own book is refused; got ' || COALESCE(v_err, 'NO RAISE');

  -- k5d: the studio OWNER links the lead's client.
  ASSERT pg_temp.can_link_as('c7960000-0000-4000-8000-000000000002', 'c7960000-0000-4000-8000-0000000000e1') IS TRUE,
    'FAIL k5d1 (K5): can_link_document_client says yes to the studio owner';
  v_err := pg_temp.link_as('c7960000-0000-4000-8000-000000000002', 'project',
                           'c7960000-0000-4000-8000-0000000000e1', 'c7960000-0000-4000-8000-000000000006');
  ASSERT v_err IS NULL,
    'FAIL k5d (K5): the project studio''s owner may link a client; got ' || COALESCE(v_err, 'NULL');
  ASSERT (SELECT client_id FROM public.projects WHERE id = 'c7960000-0000-4000-8000-0000000000e1')
         = 'c7960000-0000-4000-8000-000000000006',
    'FAIL k5d2 (K5): the project now names the client';
  ASSERT (SELECT status FROM public.designer_clients WHERE id = 'c7960000-0000-4000-8000-0000000000d1') = 'active',
    'FAIL k5d3 (00385 kept): the lead''s relationship row is the one advanced to active';

  -- k5e: the studio ADMIN unlinks and relinks.
  ASSERT pg_temp.can_link_as('c7960000-0000-4000-8000-000000000003', 'c7960000-0000-4000-8000-0000000000e1') IS TRUE,
    'FAIL k5e1 (K5): can_link_document_client says yes to the studio admin';
  v_err := pg_temp.link_as('c7960000-0000-4000-8000-000000000003', 'project',
                           'c7960000-0000-4000-8000-0000000000e1', NULL);
  ASSERT v_err IS NULL AND (SELECT client_id IS NULL FROM public.projects
                             WHERE id = 'c7960000-0000-4000-8000-0000000000e1'),
    'FAIL k5e (K5): the project studio''s admin may unlink; got ' || COALESCE(v_err, 'NULL');
  v_err := pg_temp.link_as('c7960000-0000-4000-8000-000000000003', 'project',
                           'c7960000-0000-4000-8000-0000000000e1', 'c7960000-0000-4000-8000-000000000006');
  ASSERT v_err IS NULL AND (SELECT client_id FROM public.projects
                             WHERE id = 'c7960000-0000-4000-8000-0000000000e1')
                           = 'c7960000-0000-4000-8000-000000000006',
    'FAIL k5e2 (K5): the project studio''s admin may link; got ' || COALESCE(v_err, 'NULL');

  -- k5f: the lead, today's rule, unchanged.
  ASSERT pg_temp.can_link_as('c7960000-0000-4000-8000-000000000001', 'c7960000-0000-4000-8000-0000000000e1') IS TRUE,
    'FAIL k5f1 (K5): can_link_document_client says yes to the lead';
  v_err := pg_temp.link_as('c7960000-0000-4000-8000-000000000001', 'project',
                           'c7960000-0000-4000-8000-0000000000e1', NULL);
  ASSERT v_err IS NULL,
    'FAIL k5f (K5): the lead may still unlink; got ' || COALESCE(v_err, 'NULL');
  v_err := pg_temp.link_as('c7960000-0000-4000-8000-000000000001', 'project',
                           'c7960000-0000-4000-8000-0000000000e1', 'c7960000-0000-4000-8000-000000000006');
  ASSERT v_err IS NULL AND (SELECT client_id FROM public.projects
                             WHERE id = 'c7960000-0000-4000-8000-0000000000e1')
                           = 'c7960000-0000-4000-8000-000000000006',
    'FAIL k5f2 (K5): the lead may still link; got ' || COALESCE(v_err, 'NULL');
  v_err := pg_temp.link_as('c7960000-0000-4000-8000-000000000001', 'project',
                           'c7960000-0000-4000-8000-0000000000e1', 'c7960000-0000-4000-8000-000000000007');
  ASSERT v_err = '42501|client c7960000-0000-4000-8000-000000000007 is not one of your clients',
    'FAIL k5f3 (00385 kept): the lead''s own refusal text is unchanged; got ' || COALESCE(v_err, 'NO RAISE');

  -- k5g: a proposal stays owner-only — K5 widens the project branch alone.
  v_err := pg_temp.link_as('c7960000-0000-4000-8000-000000000002', 'proposal',
                           'c7960000-0000-4000-8000-0000000000f1', 'c7960000-0000-4000-8000-000000000006');
  ASSERT v_err = '42501|no proposal owned by you with id c7960000-0000-4000-8000-0000000000f1',
    'FAIL k5g (K5): the studio owner may not link a client to the lead''s proposal; got ' || COALESCE(v_err, 'NO RAISE');

  RAISE NOTICE 'us36: case (k5) passed — lead, studio owner and studio admin link; member, outsider and proposal refused.';
END
$$;

-- ─── (k5h–k5k) the lead has left the studio (SQ-1066 F1) ──────────────────
-- 00563 admits the client UPDATE only while the lead holds an active non-guest
-- seat in the project's studio. The setter refuses that up front, and
-- document_client_link_hold / can_link_document_client say the same.

-- k5h: the lead's seat is inactive (suspended).
DO $$
DECLARE
  v_err TEXT;
BEGIN
  PERFORM pg_temp.set_leaving_lead_seat('member', 'suspended');

  v_err := pg_temp.link_as('c7960000-0000-4000-8000-000000000002', 'project',
                           'c7960000-0000-4000-8000-0000000000e2', 'c7960000-0000-4000-8000-000000000006');
  ASSERT v_err LIKE '55000|set_document_client: lead_not_in_studio%',
    'FAIL k5h1 (SQ-1066 F1): the owner is refused up front when the lead''s seat is inactive; got '
    || COALESCE(v_err, 'NO RAISE');
  ASSERT pg_temp.link_hold_as('c7960000-0000-4000-8000-000000000002', 'c7960000-0000-4000-8000-0000000000e2')
         IS NOT DISTINCT FROM 'lead_not_in_studio',
    'FAIL k5h2 (SQ-1066 F1): document_client_link_hold names lead_not_in_studio for an inactive lead; got '
    || COALESCE(pg_temp.link_hold_as('c7960000-0000-4000-8000-000000000002', 'c7960000-0000-4000-8000-0000000000e2'), 'NULL');
  ASSERT pg_temp.can_link_as('c7960000-0000-4000-8000-000000000002', 'c7960000-0000-4000-8000-0000000000e2') IS FALSE,
    'FAIL k5h3 (SQ-1066 F1): can_link_document_client says no while the lead''s seat is inactive';
  ASSERT (SELECT client_id IS NULL FROM public.projects WHERE id = 'c7960000-0000-4000-8000-0000000000e2'),
    'FAIL k5h4: the refused call wrote nothing';
  -- Standing is asked first: a plain member is still not_permitted.
  ASSERT pg_temp.link_hold_as('c7960000-0000-4000-8000-000000000004', 'c7960000-0000-4000-8000-0000000000e2')
         IS NOT DISTINCT FROM 'not_permitted',
    'FAIL k5h5: a plain member is not_permitted whatever the lead''s seat; got '
    || COALESCE(pg_temp.link_hold_as('c7960000-0000-4000-8000-000000000004', 'c7960000-0000-4000-8000-0000000000e2'), 'NULL');

  PERFORM pg_temp.set_leaving_lead_seat('member', 'active');
  RAISE NOTICE 'us36: case (k5h) passed — inactive lead: lead_not_in_studio, refused up front.';
END
$$;

-- k5i: the lead is a guest.
DO $$
DECLARE
  v_err TEXT;
BEGIN
  PERFORM pg_temp.set_leaving_lead_seat('guest', 'active');

  v_err := pg_temp.link_as('c7960000-0000-4000-8000-000000000002', 'project',
                           'c7960000-0000-4000-8000-0000000000e2', 'c7960000-0000-4000-8000-000000000006');
  ASSERT v_err LIKE '55000|set_document_client: lead_not_in_studio%',
    'FAIL k5i1 (SQ-1066 F1): the owner is refused up front when the lead is a guest; got '
    || COALESCE(v_err, 'NO RAISE');
  ASSERT pg_temp.link_hold_as('c7960000-0000-4000-8000-000000000002', 'c7960000-0000-4000-8000-0000000000e2')
         IS NOT DISTINCT FROM 'lead_not_in_studio',
    'FAIL k5i2 (SQ-1066 F1): document_client_link_hold names lead_not_in_studio for a guest lead; got '
    || COALESCE(pg_temp.link_hold_as('c7960000-0000-4000-8000-000000000002', 'c7960000-0000-4000-8000-0000000000e2'), 'NULL');
  ASSERT pg_temp.can_link_as('c7960000-0000-4000-8000-000000000002', 'c7960000-0000-4000-8000-0000000000e2') IS FALSE,
    'FAIL k5i3 (SQ-1066 F1): can_link_document_client says no while the lead is a guest';
  ASSERT (SELECT client_id IS NULL FROM public.projects WHERE id = 'c7960000-0000-4000-8000-0000000000e2'),
    'FAIL k5i4: the refused call wrote nothing';

  PERFORM pg_temp.set_leaving_lead_seat('member', 'active');
  RAISE NOTICE 'us36: case (k5i) passed — guest lead: lead_not_in_studio, refused up front.';
END
$$;

-- k5j: the lead was removed from the studio.
DO $$
DECLARE
  v_err TEXT;
BEGIN
  PERFORM pg_temp.set_leaving_lead_seat('member', 'removed');

  v_err := pg_temp.link_as('c7960000-0000-4000-8000-000000000002', 'project',
                           'c7960000-0000-4000-8000-0000000000e2', 'c7960000-0000-4000-8000-000000000006');
  ASSERT v_err LIKE '55000|set_document_client: lead_not_in_studio%',
    'FAIL k5j1 (SQ-1066 F1): the owner is refused up front when the lead was removed; got '
    || COALESCE(v_err, 'NO RAISE');
  ASSERT pg_temp.link_hold_as('c7960000-0000-4000-8000-000000000002', 'c7960000-0000-4000-8000-0000000000e2')
         IS NOT DISTINCT FROM 'lead_not_in_studio',
    'FAIL k5j2 (SQ-1066 F1): document_client_link_hold names lead_not_in_studio for a removed lead; got '
    || COALESCE(pg_temp.link_hold_as('c7960000-0000-4000-8000-000000000002', 'c7960000-0000-4000-8000-0000000000e2'), 'NULL');
  ASSERT pg_temp.can_link_as('c7960000-0000-4000-8000-000000000002', 'c7960000-0000-4000-8000-0000000000e2') IS FALSE,
    'FAIL k5j3 (SQ-1066 F1): can_link_document_client says no once the lead was removed';
  ASSERT (SELECT client_id IS NULL FROM public.projects WHERE id = 'c7960000-0000-4000-8000-0000000000e2'),
    'FAIL k5j4: the refused call wrote nothing';

  PERFORM pg_temp.set_leaving_lead_seat('member', 'active');
  RAISE NOTICE 'us36: case (k5j) passed — removed lead: lead_not_in_studio, refused up front.';
END
$$;

-- k5k: the lead's seat is active again: unchanged, the owner links.
DO $$
DECLARE
  v_err TEXT;
BEGIN
  ASSERT pg_temp.link_hold_as('c7960000-0000-4000-8000-000000000002', 'c7960000-0000-4000-8000-0000000000e2') IS NULL,
    'FAIL k5k1: document_client_link_hold is NULL while the lead holds an active seat; got '
    || COALESCE(pg_temp.link_hold_as('c7960000-0000-4000-8000-000000000002', 'c7960000-0000-4000-8000-0000000000e2'), 'NULL');
  ASSERT pg_temp.can_link_as('c7960000-0000-4000-8000-000000000002', 'c7960000-0000-4000-8000-0000000000e2') IS TRUE,
    'FAIL k5k2: can_link_document_client says yes to the owner while the lead holds an active seat';
  v_err := pg_temp.link_as('c7960000-0000-4000-8000-000000000002', 'project',
                           'c7960000-0000-4000-8000-0000000000e2', 'c7960000-0000-4000-8000-000000000006');
  ASSERT v_err IS NULL AND (SELECT client_id FROM public.projects
                             WHERE id = 'c7960000-0000-4000-8000-0000000000e2')
                           = 'c7960000-0000-4000-8000-000000000006',
    'FAIL k5k3: the owner links the active lead''s client; got ' || COALESCE(v_err, 'NULL');
  ASSERT has_function_privilege('authenticated', 'public.document_client_link_hold(uuid)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.document_client_link_hold(uuid)', 'EXECUTE'),
    'FAIL k5k4: document_client_link_hold is granted to authenticated and not to anon';

  RAISE NOTICE 'us36: case (k5k) passed — active lead: may link, unchanged.';
END
$$;

-- k5l (SQ-1073 R2): owner/admin standing is read from the caller's seat row as
-- the setter locks it. An admin with no seat at call time is refused, and so is
-- one whose seat is suspended; with the active seat back she acts as before.
-- The two-session phantom (a seat committed after the lock's snapshot) cannot
-- be scheduled from this one rollback-only session; SQ-1074 records the probe.
DO $$
DECLARE
  v_err TEXT;
BEGIN
  DELETE FROM public.organization_members
  WHERE user_id = 'c7960000-0000-4000-8000-000000000003'
    AND organization_id = 'c7960000-0000-4000-8000-0000000000a1';

  v_err := pg_temp.link_as('c7960000-0000-4000-8000-000000000003', 'project',
                           'c7960000-0000-4000-8000-0000000000e1', NULL);
  ASSERT v_err = '42501|no project owned by you with id c7960000-0000-4000-8000-0000000000e1',
    'FAIL k5l1 (SQ-1073 R2): an admin with no seat at call time is refused; got ' || COALESCE(v_err, 'NO RAISE');
  ASSERT pg_temp.link_hold_as('c7960000-0000-4000-8000-000000000003', 'c7960000-0000-4000-8000-0000000000e1') = 'not_permitted',
    'FAIL k5l2: document_client_link_hold names not_permitted for an admin with no seat';

  INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at)
  VALUES ('c7960000-0000-4000-8000-000000000003', 'c7960000-0000-4000-8000-0000000000a1', 'admin', 'suspended', NOW());
  v_err := pg_temp.link_as('c7960000-0000-4000-8000-000000000003', 'project',
                           'c7960000-0000-4000-8000-0000000000e1', NULL);
  ASSERT v_err = '42501|no project owned by you with id c7960000-0000-4000-8000-0000000000e1',
    'FAIL k5l3 (SQ-1073 R2): a suspended admin seat grants no standing; got ' || COALESCE(v_err, 'NO RAISE');

  ASSERT (SELECT client_id FROM public.projects WHERE id = 'c7960000-0000-4000-8000-0000000000e1')
         = 'c7960000-0000-4000-8000-000000000006',
    'FAIL k5l4: the refused calls wrote nothing';

  UPDATE public.organization_members SET status = 'active'
  WHERE user_id = 'c7960000-0000-4000-8000-000000000003'
    AND organization_id = 'c7960000-0000-4000-8000-0000000000a1';
  v_err := pg_temp.link_as('c7960000-0000-4000-8000-000000000003', 'project',
                           'c7960000-0000-4000-8000-0000000000e1', NULL);
  ASSERT v_err IS NULL AND (SELECT client_id IS NULL FROM public.projects
                             WHERE id = 'c7960000-0000-4000-8000-0000000000e1'),
    'FAIL k5l5: with her active admin seat back she may unlink; got ' || COALESCE(v_err, 'NULL');
  v_err := pg_temp.link_as('c7960000-0000-4000-8000-000000000003', 'project',
                           'c7960000-0000-4000-8000-0000000000e1', 'c7960000-0000-4000-8000-000000000006');
  ASSERT v_err IS NULL AND (SELECT client_id FROM public.projects
                             WHERE id = 'c7960000-0000-4000-8000-0000000000e1')
                           = 'c7960000-0000-4000-8000-000000000006',
    'FAIL k5l6: with her active admin seat back she may link; got ' || COALESCE(v_err, 'NULL');

  RAISE NOTICE 'us36: case (k5l) passed — standing from the locked seat: admin with no seat and suspended admin refused, active admin acts.';
END
$$;

-- ─── (k9) open_project_direct with a chosen studio ─────────────────────────
DO $$
DECLARE
  v_err TEXT;
  v_got UUID;
BEGIN
  -- k9a: a member names her studio.
  PERFORM pg_temp.assume_user('c7960000-0000-4000-8000-000000000001');
  v_err := NULL;
  BEGIN
    v_got := public.open_project_direct('US36 Named House', NULL, NULL, NULL, NULL,
      'c7960000-0000-4000-8000-0000000000e5', 'c7960000-0000-4000-8000-0000000000a1');
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || '|' || SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_err IS NULL AND v_got = 'c7960000-0000-4000-8000-0000000000e5',
    'FAIL k9a (K9): a studio member opens a project in her studio; got ' || COALESCE(v_err, v_got::text, 'NULL');
  ASSERT (SELECT studio_id FROM public.projects WHERE id = 'c7960000-0000-4000-8000-0000000000e5')
         = 'c7960000-0000-4000-8000-0000000000a1',
    'FAIL k9a2 (K9): the project names the chosen studio';

  -- k9b: a studio she holds no seat in is refused with the stable prefix.
  PERFORM pg_temp.assume_user('c7960000-0000-4000-8000-000000000001');
  v_err := NULL;
  BEGIN
    v_got := public.open_project_direct('US36 Foreign House', NULL, NULL, NULL, NULL,
      'c7960000-0000-4000-8000-0000000000e6', 'c7960000-0000-4000-8000-0000000000a2');
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || '|' || SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_err LIKE '42501|open_project_direct: studio_not_member%',
    'FAIL k9b (K9): a non-member is refused with the stable prefix; got ' || COALESCE(v_err, 'NO RAISE');
  ASSERT NOT EXISTS (SELECT 1 FROM public.projects WHERE id = 'c7960000-0000-4000-8000-0000000000e6'),
    'FAIL k9b2 (K9): and nothing was inserted';

  -- k9c: a designer with two studios names one.
  PERFORM pg_temp.assume_user('c7960000-0000-4000-8000-000000000008');
  v_err := NULL;
  BEGIN
    v_got := public.open_project_direct('US36 Two Studio House', NULL, NULL, NULL, NULL,
      'c7960000-0000-4000-8000-0000000000e7', 'c7960000-0000-4000-8000-0000000000a2');
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || '|' || SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_err IS NULL,
    'FAIL k9c (K9): a two-studio designer who names a studio is admitted; got ' || COALESCE(v_err, 'NULL');
  ASSERT (SELECT studio_id FROM public.projects WHERE id = 'c7960000-0000-4000-8000-0000000000e7')
         = 'c7960000-0000-4000-8000-0000000000a2',
    'FAIL k9c2 (K9): the project names the studio she chose, not one derived';

  -- k9d: without a studio she is still refused, as today (00563).
  PERFORM pg_temp.assume_user('c7960000-0000-4000-8000-000000000008');
  v_err := NULL;
  BEGIN
    v_got := public.open_project_direct('US36 Unnamed House', NULL, NULL, NULL, NULL,
      'c7960000-0000-4000-8000-0000000000e8');
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || '|' || SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_err = 'P0001|studio_id_not_designer_studio',
    'FAIL k9d (K9): the 6-argument call still refuses a two-studio designer; got ' || COALESCE(v_err, 'NO RAISE');

  -- k9e: the 6-argument signature still works for a one-studio designer.
  PERFORM pg_temp.assume_user('c7960000-0000-4000-8000-000000000001');
  v_err := NULL;
  BEGIN
    v_got := public.open_project_direct('US36 Old Signature House', NULL, NULL, NULL, NULL,
      'c7960000-0000-4000-8000-0000000000e9');
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || '|' || SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_err IS NULL AND (SELECT studio_id FROM public.projects
                             WHERE id = 'c7960000-0000-4000-8000-0000000000e9')
                           = 'c7960000-0000-4000-8000-0000000000a1',
    'FAIL k9e (K9): the old signature is unchanged; got ' || COALESCE(v_err, 'NULL');

  -- k9f: grants — authenticated only, never anon.
  ASSERT has_function_privilege('authenticated',
           'public.open_project_direct(text, uuid, integer, integer, date, uuid, uuid)', 'EXECUTE')
     AND NOT has_function_privilege('anon',
           'public.open_project_direct(text, uuid, integer, integer, date, uuid, uuid)', 'EXECUTE')
     AND has_function_privilege('authenticated', 'public.can_link_document_client(uuid)', 'EXECUTE')
     AND NOT has_function_privilege('anon', 'public.can_link_document_client(uuid)', 'EXECUTE'),
    'FAIL k9f: the new functions are granted to authenticated and not to anon';

  RAISE NOTICE 'us36: case (k9) passed — a named studio is stamped, a foreign one refused, the old signature unchanged.';
END
$$;

-- ─── (k11) the solo owner: stamped at creation, prices from her own rate ───
DO $$
DECLARE
  v_err    TEXT;
  v_got    UUID;
  v_rate   INTEGER;
  v_source TEXT;
  v_amount INTEGER;
BEGIN
  -- k11a: her new project is stamped to her studio at creation (00563 + 00602).
  PERFORM pg_temp.assume_user('c7960000-0000-4000-8000-000000000009');
  v_got := public.open_project_direct('US36 Solo House', NULL, NULL, NULL, NULL,
    'c7960000-0000-4000-8000-0000000000ea');
  PERFORM pg_temp.reset_role();
  ASSERT (SELECT studio_id FROM public.projects WHERE id = 'c7960000-0000-4000-8000-0000000000ea')
         = 'c7960000-0000-4000-8000-0000000000a3',
    'FAIL k11a (K11): a solo owner''s new project is stamped to her studio at creation';

  -- k11b: she writes her own rate (00598's owner insert admits it).
  PERFORM pg_temp.assume_user('c7960000-0000-4000-8000-000000000009');
  v_err := NULL;
  BEGIN
    INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
    VALUES ('c7960000-0000-4000-8000-0000000000a3', 'c7960000-0000-4000-8000-000000000009', 31000,
            (NOW() AT TIME ZONE 'UTC')::date - 30, 'c7960000-0000-4000-8000-000000000009');
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE || '|' || SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_err IS NULL,
    'FAIL k11b (K11): a solo owner may set her own rate; got ' || COALESCE(v_err, 'NULL');

  -- k11c: and that self-authored rate prices her hour (00615/00618 owner exemption).
  PERFORM pg_temp.assume_user('c7960000-0000-4000-8000-000000000009');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c7960000-0000-4000-8000-0000000000b1', 'c7960000-0000-4000-8000-0000000000ea',
          'c7960000-0000-4000-8000-000000000009', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();
  SELECT hourly_rate_cents, rate_source, rated_amount_cents INTO v_rate, v_source, v_amount
  FROM public.project_time_entries WHERE id = 'c7960000-0000-4000-8000-0000000000b1';
  ASSERT v_rate = 31000 AND v_source = 'studio_member' AND v_amount = 62000,
    'FAIL k11c (K11): her own number prices her hour on a project stamped to her studio; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL') || ' / '
    || COALESCE(v_amount::text, 'NULL');

  -- k11d: naming her studio on an already-NULL legacy project stays closed
  --       (HT-3-g(3); the K11(a) narrowing — the same data as form G, aj5).
  PERFORM pg_temp.assume_user('c7960000-0000-4000-8000-000000000009');
  v_err := NULL;
  BEGIN
    v_got := public.stamp_project_pricing_studio(
      'c7960000-0000-4000-8000-0000000000e3', 'c7960000-0000-4000-8000-0000000000a3');
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_err = '42501'
     AND (SELECT studio_id IS NULL FROM public.projects WHERE id = 'c7960000-0000-4000-8000-0000000000e3'),
    'FAIL k11d (K11 narrowed): the solo owner may not name her studio on a NULL legacy project; got '
    || COALESCE(v_err, 'NO RAISE');

  -- k11e: a two-designer studio's owner writes her own rate, and is still
  --       refused the self-stamp (arm's-length rule, unchanged).
  PERFORM pg_temp.assume_user('c7960000-0000-4000-8000-00000000000a');
  INSERT INTO public.studio_member_rates (studio_id, user_id, hourly_rate_cents, effective_from, created_by)
  VALUES ('c7960000-0000-4000-8000-0000000000a4', 'c7960000-0000-4000-8000-00000000000a', 77700,
          (NOW() AT TIME ZONE 'UTC')::date - 30, 'c7960000-0000-4000-8000-00000000000a');
  v_err := NULL;
  BEGIN
    v_got := public.stamp_project_pricing_studio(
      'c7960000-0000-4000-8000-0000000000e4', 'c7960000-0000-4000-8000-0000000000a4');
  EXCEPTION WHEN OTHERS THEN v_err := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_err = '42501'
     AND (SELECT studio_id IS NULL FROM public.projects WHERE id = 'c7960000-0000-4000-8000-0000000000e4'),
    'FAIL k11e (arm''s-length kept): a two-designer studio''s owner may not stamp her own studio on her own '
    'project; got ' || COALESCE(v_err, 'NO RAISE');

  PERFORM pg_temp.assume_user('c7960000-0000-4000-8000-00000000000a');
  INSERT INTO public.project_time_entries
    (id, project_id, user_id, started_at, duration_minutes, billable, source)
  VALUES ('c7960000-0000-4000-8000-0000000000b2', 'c7960000-0000-4000-8000-0000000000e4',
          'c7960000-0000-4000-8000-00000000000a', NOW() - INTERVAL '2 hours', 120, true, 'manual_entry');
  PERFORM pg_temp.reset_role();
  SELECT hourly_rate_cents, rate_source INTO v_rate, v_source
  FROM public.project_time_entries WHERE id = 'c7960000-0000-4000-8000-0000000000b2';
  ASSERT v_rate IS NULL AND v_source = 'none',
    'FAIL k11e2 (arm''s-length kept): and her hour there prices ''rate pending''; got '
    || COALESCE(v_rate::text, 'NULL') || ' / ' || COALESCE(v_source, 'NULL');

  RAISE NOTICE 'us36: case (k11) passed — stamped at creation, own rate prices, legacy self-stamp and two-designer self-stamp refused.';
END
$$;

DO $$ BEGIN RAISE NOTICE 'All us36_billing_authority assertions passed.'; END $$;

ROLLBACK;
