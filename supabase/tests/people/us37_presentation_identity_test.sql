-- ═══════════════════════════════════════════════════════════════════════════
-- 00812 — get_client_presentation_identity (pgTAP, US-37 #6, contract D8)
--
-- The client's approval presentation carries the firm's mark and the lead's
-- contact. This proves the reader returns exactly the six allowlisted keys,
-- resolves the lead's fields before the firm's per field, renders nothing
-- when nothing resolves, and never answers for another studio's project or
-- paper.
--
-- Run: supabase test db tests/people/us37_presentation_identity_test.sql
-- Everything is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(19);

-- ── grants and security ────────────────────────────────────────────────────
SELECT ok(
  (SELECT p.prosecdef FROM pg_proc p
    WHERE p.oid = 'public.get_client_presentation_identity(uuid, uuid)'::regprocedure),
  'the reader is SECURITY DEFINER (clients hold no grant on organizations)'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.get_client_presentation_identity(uuid, uuid)', 'EXECUTE'),
  'authenticated can call the reader'
);

-- ── fixtures (as postgres) ─────────────────────────────────────────────────
-- e8120000-…-01  Leah     lead, owner of Hart Studio, every field filled
-- e8120000-…-02  Dana     lead, member of Hart Studio, email/phone blank
-- e8120000-…-03  Otto     owner of Other Studio
-- e8120000-…-04  Client A (Hart Studio's client)
-- e8120000-…-05  Nobody   lead with no studio and no name
-- e8120000-…-06  Client B (Other Studio's client)
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('e8120000-0000-4000-8000-000000000001', 'us37-leah@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('e8120000-0000-4000-8000-000000000002', 'us37-dana@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('e8120000-0000-4000-8000-000000000003', 'us37-otto@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('e8120000-0000-4000-8000-000000000004', 'us37-client-a@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('e8120000-0000-4000-8000-000000000005', 'us37-nobody@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('e8120000-0000-4000-8000-000000000006', 'us37-client-b@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (
  id, email, full_name, display_name, business_name, phone, is_designer, created_at, updated_at
) VALUES
  ('e8120000-0000-4000-8000-000000000001', 'leah@hart.test', 'Leah Hart', NULL, NULL, '+1 555 0101', true, now(), now()),
  ('e8120000-0000-4000-8000-000000000002', '', 'Dana Low', NULL, NULL, '   ', true, now(), now()),
  ('e8120000-0000-4000-8000-000000000003', 'otto@other.test', 'Otto Vale', NULL, NULL, '+1 555 0303', true, now(), now()),
  ('e8120000-0000-4000-8000-000000000004', 'us37-client-a@test.invalid', 'Client A', NULL, NULL, '+1 555 0404', false, now(), now()),
  ('e8120000-0000-4000-8000-000000000005', NULL, NULL, NULL, NULL, NULL, true, now(), now()),
  ('e8120000-0000-4000-8000-000000000006', 'us37-client-b@test.invalid', 'Client B', NULL, NULL, NULL, false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    display_name = EXCLUDED.display_name,
    business_name = EXCLUDED.business_name,
    phone = EXCLUDED.phone,
    -- Designer flags are set after the seats below exist: a designer with no
    -- seat is auto-provisioned a studio of her own (provision_studio_on_designer),
    -- which would become her primary studio.
    is_designer = false;

INSERT INTO public.organizations (id, type, name, slug, status, logo_url, website, email, phone, description)
VALUES
  ('e8121000-0000-4000-8000-000000000001', 'design_studio', 'Hart Studio', 'us37-hart-studio', 'active',
   'https://cdn.test/hart-logo.png', 'https://hart.test', 'studio@hart.test', '+1 555 0100',
   'not part of the allowlist'),
  ('e8121000-0000-4000-8000-000000000002', 'design_studio', 'Other Studio', 'us37-other-studio', 'active',
   'https://cdn.test/other-logo.png', 'https://other.test', 'hello@other.test', '+1 555 0300', NULL),
  ('e8121000-0000-4000-8000-000000000003', 'design_studio', 'Left Studio', 'us37-left-studio', 'active',
   'https://cdn.test/left-logo.png', 'https://left.test', 'hello@left.test', '+1 555 0500', NULL);

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at) VALUES
  ('e8122000-0000-4000-8000-000000000001', 'e8120000-0000-4000-8000-000000000001',
   'e8121000-0000-4000-8000-000000000001', 'owner', 'active', now()),
  ('e8122000-0000-4000-8000-000000000002', 'e8120000-0000-4000-8000-000000000002',
   'e8121000-0000-4000-8000-000000000001', 'member', 'active', now()),
  ('e8122000-0000-4000-8000-000000000003', 'e8120000-0000-4000-8000-000000000003',
   'e8121000-0000-4000-8000-000000000002', 'owner', 'active', now()),
  -- Nobody left her only studio: no active seat, so no primary studio.
  ('e8122000-0000-4000-8000-000000000005', 'e8120000-0000-4000-8000-000000000005',
   'e8121000-0000-4000-8000-000000000003', 'member', 'removed', now());

UPDATE public.profiles SET is_designer = true
WHERE id IN ('e8120000-0000-4000-8000-000000000001', 'e8120000-0000-4000-8000-000000000002',
             'e8120000-0000-4000-8000-000000000003', 'e8120000-0000-4000-8000-000000000005');

INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, status, source) VALUES
  ('e8123000-0000-4000-8000-000000000001', 'e8120000-0000-4000-8000-000000000001',
   'e8120000-0000-4000-8000-000000000004', 'Client A', 'active', 'direct'),
  ('e8123000-0000-4000-8000-000000000002', 'e8120000-0000-4000-8000-000000000002',
   'e8120000-0000-4000-8000-000000000004', 'Client A', 'active', 'direct'),
  ('e8123000-0000-4000-8000-000000000003', 'e8120000-0000-4000-8000-000000000003',
   'e8120000-0000-4000-8000-000000000006', 'Client B', 'active', 'direct'),
  ('e8123000-0000-4000-8000-000000000005', 'e8120000-0000-4000-8000-000000000005',
   'e8120000-0000-4000-8000-000000000004', 'Client A', 'active', 'direct');

-- P1 Leah/Hart (full) · P2 Dana/Hart (fallback) · P3 Otto/Other · P4 Nobody/no studio
INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id) VALUES
  ('e8124000-0000-4000-8000-000000000001', 'US-37 full', 'e8120000-0000-4000-8000-000000000001',
   'e8120000-0000-4000-8000-000000000004', 'e8120000-0000-4000-8000-000000000001',
   'e8121000-0000-4000-8000-000000000001'),
  ('e8124000-0000-4000-8000-000000000002', 'US-37 fallback', 'e8120000-0000-4000-8000-000000000002',
   'e8120000-0000-4000-8000-000000000004', 'e8120000-0000-4000-8000-000000000002',
   'e8121000-0000-4000-8000-000000000001'),
  ('e8124000-0000-4000-8000-000000000003', 'US-37 other studio', 'e8120000-0000-4000-8000-000000000003',
   'e8120000-0000-4000-8000-000000000006', 'e8120000-0000-4000-8000-000000000003',
   'e8121000-0000-4000-8000-000000000002'),
  ('e8124000-0000-4000-8000-000000000004', 'US-37 empty', 'e8120000-0000-4000-8000-000000000005',
   'e8120000-0000-4000-8000-000000000004', 'e8120000-0000-4000-8000-000000000005', NULL);

-- Two houseless papers from Leah to Client A: one sent, one still a draft.
INSERT INTO public.proposals (id, designer_id, client_id, designer_client_id, title, status) VALUES
  ('e8125000-0000-4000-8000-000000000001', 'e8120000-0000-4000-8000-000000000001',
   'e8120000-0000-4000-8000-000000000004', 'e8123000-0000-4000-8000-000000000001',
   'US-37 sent paper', 'sent'),
  ('e8125000-0000-4000-8000-000000000002', 'e8120000-0000-4000-8000-000000000001',
   'e8120000-0000-4000-8000-000000000004', 'e8123000-0000-4000-8000-000000000001',
   'US-37 draft paper', 'draft');

CREATE TEMP TABLE expected (label text PRIMARY KEY, value jsonb);
INSERT INTO expected VALUES
  ('full', jsonb_build_object(
    'firmName', 'Hart Studio', 'logoUrl', 'https://cdn.test/hart-logo.png',
    'website', 'https://hart.test', 'designerName', 'Leah Hart',
    'email', 'leah@hart.test', 'phone', '+1 555 0101')),
  ('fallback', jsonb_build_object(
    'firmName', 'Hart Studio', 'logoUrl', 'https://cdn.test/hart-logo.png',
    'website', 'https://hart.test', 'designerName', 'Dana Low',
    'email', 'studio@hart.test', 'phone', '+1 555 0100'));
GRANT SELECT ON expected TO authenticated;

-- ── unauthenticated ────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT throws_ok(
  $$ SELECT public.get_client_presentation_identity('e8124000-0000-4000-8000-000000000001'::uuid) $$,
  '42501', NULL,
  'a caller with no user id is refused'
);
RESET ROLE;
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.get_client_presentation_identity('e8124000-0000-4000-8000-000000000001'::uuid) $$,
  '42501', NULL,
  'anon is refused (local seeds grant anon EXECUTE broadly; the body still refuses)'
);
RESET ROLE;
SET LOCAL ROLE authenticated;

-- ── Client A ───────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"e8120000-0000-4000-8000-000000000004","role":"authenticated"}', true);

SELECT is(
  public.get_client_presentation_identity('e8124000-0000-4000-8000-000000000001'::uuid),
  (SELECT value FROM expected WHERE label = 'full'),
  'full profile: firm mark, firm name, website and the lead''s own name, email and phone'
);
SELECT is(
  ARRAY(SELECT jsonb_object_keys(
    public.get_client_presentation_identity('e8124000-0000-4000-8000-000000000001'::uuid)) ORDER BY 1),
  ARRAY['designerName', 'email', 'firmName', 'logoUrl', 'phone', 'website'],
  'exactly the six allowlisted keys and nothing else from profiles or organizations'
);
SELECT is(
  public.get_client_presentation_identity('e8124000-0000-4000-8000-000000000002'::uuid),
  (SELECT value FROM expected WHERE label = 'fallback'),
  'blank lead email/phone fall back to the firm''s, per field; the lead''s name still wins'
);
SELECT is(
  public.get_client_presentation_identity('e8124000-0000-4000-8000-000000000004'::uuid),
  '{}'::jsonb,
  'nothing resolvable: an empty object, no blank keys'
);
SELECT throws_ok(
  $$ SELECT public.get_client_presentation_identity('e8124000-0000-4000-8000-000000000003'::uuid) $$,
  '42501', NULL,
  'Client A never reads another studio''s project'
);
SELECT is(
  public.get_client_presentation_identity(p_proposal_id => 'e8125000-0000-4000-8000-000000000001'::uuid),
  (SELECT value FROM expected WHERE label = 'full'),
  'a houseless sent paper resolves through its designer''s primary studio'
);
SELECT throws_ok(
  $$ SELECT public.get_client_presentation_identity(p_proposal_id => 'e8125000-0000-4000-8000-000000000002'::uuid) $$,
  '42501', NULL,
  'a client never reads through an unsent paper'
);
SELECT throws_ok(
  $$ SELECT public.get_client_presentation_identity() $$,
  '22023', NULL,
  'exactly one of project or paper is required'
);
SELECT throws_ok(
  $$ SELECT public.get_client_presentation_identity('e8124000-0000-4000-8000-000000000001'::uuid,
                                                     'e8125000-0000-4000-8000-000000000001'::uuid) $$,
  '22023', NULL,
  'both project and paper is refused'
);

-- ── Client B ───────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"e8120000-0000-4000-8000-000000000006","role":"authenticated"}', true);
SELECT throws_ok(
  $$ SELECT public.get_client_presentation_identity('e8124000-0000-4000-8000-000000000001'::uuid) $$,
  '42501', NULL,
  'Client B never reads Hart Studio''s project'
);
SELECT throws_ok(
  $$ SELECT public.get_client_presentation_identity(p_proposal_id => 'e8125000-0000-4000-8000-000000000001'::uuid) $$,
  '42501', NULL,
  'Client B never reads Hart Studio''s paper'
);
SELECT is(
  public.get_client_presentation_identity('e8124000-0000-4000-8000-000000000003'::uuid)->>'firmName',
  'Other Studio',
  'Client B reads her own studio, not Hart Studio'
);
SELECT is(
  public.get_client_presentation_identity('e8124000-0000-4000-8000-000000000003'::uuid)->>'email',
  'otto@other.test',
  'Client B reads her own lead''s email'
);

-- ── studio side ────────────────────────────────────────────────────────────
SELECT set_config('request.jwt.claims',
  '{"sub":"e8120000-0000-4000-8000-000000000002","role":"authenticated"}', true);
SELECT is(
  public.get_client_presentation_identity('e8124000-0000-4000-8000-000000000001'::uuid),
  (SELECT value FROM expected WHERE label = 'full'),
  'a Hart Studio co-member previewing the client view reads the same block'
);

SELECT set_config('request.jwt.claims',
  '{"sub":"e8120000-0000-4000-8000-000000000003","role":"authenticated"}', true);
SELECT throws_ok(
  $$ SELECT public.get_client_presentation_identity('e8124000-0000-4000-8000-000000000001'::uuid) $$,
  '42501', NULL,
  'another studio''s designer is refused'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;
