-- Lead contact phone regression (00583)
-- A phone taken at the front door must normalize on the lead, carry onto the
-- designer_clients row Discovery ensures, and read in the People directory
-- both before Discovery (as the lead's) and after (as the client's).
-- Clearing a raw phone must clear its E.164 derivation with it, on both tables,
-- and an emptied "Phone on file" must not be re-hydrated from the lead.
-- A household that holds a Patina profile keeps its own number: no captured
-- phone reaches a designer_clients row with a client_id.
-- 00331's ceremony_complete is deliberately not redefined by 00583 and so is
-- not exercised here; the arc path reaches client_phone, when it reaches it at
-- all, through the same hydrate trigger the legs below cover.
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/document/lead_contact_phone_test.sql

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  ('d9000000-0000-4000-8000-000000000001', 'phone-owner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('d9000000-0000-4000-8000-000000000002', 'phone-homeowner@test.invalid', '', NOW(), NOW(), NOW(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('d9000000-0000-4000-8000-000000000001', 'phone-owner@test.invalid',
   'Phone Owner', true, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET is_designer = true;

-- The homeowner with a Patina account keeps their own number on the profile.
INSERT INTO public.profiles (id, email, full_name, phone, is_designer, created_at, updated_at)
VALUES
  ('d9000000-0000-4000-8000-000000000002', 'phone-homeowner@test.invalid',
   'Ada Okafor', '(555) 990-0001', false, NOW(), NOW())
ON CONFLICT (id) DO UPDATE SET phone = EXCLUDED.phone;

INSERT INTO public.organizations (id, type, name, slug)
VALUES
  ('d9100000-0000-4000-8000-000000000001', 'design_studio',
   'Lead Phone Studio', 'lead-phone-studio');

INSERT INTO public.organization_members (
  id, user_id, organization_id, role, status, joined_at
)
VALUES
  ('d9110000-0000-4000-8000-000000000001', 'd9000000-0000-4000-8000-000000000001',
   'd9100000-0000-4000-8000-000000000001', 'owner', 'active', NOW());

-- The capture: name, email, phone. No homeowner profile — the R46/R62 normal
-- case for a lead the designer took down themselves.
INSERT INTO public.leads (
  id, homeowner_id, designer_id, project_type, status,
  contact_name, contact_email, contact_phone
)
VALUES
  ('d9200000-0000-4000-8000-000000000001', NULL,
   'd9000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'The Okafors', 'okafors@test.invalid', '(555) 014-2200'),
  ('d9200000-0000-4000-8000-000000000002', NULL,
   'd9000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'No Phone Household', 'nophone@test.invalid', NULL),
  ('d9200000-0000-4000-8000-000000000003', 'd9000000-0000-4000-8000-000000000002',
   'd9000000-0000-4000-8000-000000000001', 'consultation', 'new',
   'Ada Okafor', NULL, '(555) 014-2299');

DO $$
BEGIN
  ASSERT (SELECT contact_phone_e164 = '+15550142200'
          FROM public.leads
          WHERE id = 'd9200000-0000-4000-8000-000000000001'),
    format('lead phone must normalize to E.164, got %L',
           (SELECT contact_phone_e164 FROM public.leads
            WHERE id = 'd9200000-0000-4000-8000-000000000001'));
  ASSERT (SELECT contact_phone_e164 IS NULL
          FROM public.leads
          WHERE id = 'd9200000-0000-4000-8000-000000000002'),
    'a lead with no phone must carry a NULL contact_phone_e164';
END;
$$;

-- Clearing the raw phone clears the derivation with it: a stale e164 is a
-- number a later SMS path would still read after the designer removed it.
DO $$
BEGIN
  UPDATE public.leads
  SET contact_phone = NULL
  WHERE id = 'd9200000-0000-4000-8000-000000000001';
  ASSERT (SELECT contact_phone_e164 IS NULL
          FROM public.leads
          WHERE id = 'd9200000-0000-4000-8000-000000000001'),
    format('clearing contact_phone must clear contact_phone_e164, got %L',
           (SELECT contact_phone_e164 FROM public.leads
            WHERE id = 'd9200000-0000-4000-8000-000000000001'));

  -- Put it back for the Discovery legs below.
  UPDATE public.leads
  SET contact_phone = '(555) 014-2200'
  WHERE id = 'd9200000-0000-4000-8000-000000000001';
  ASSERT (SELECT contact_phone_e164 = '+15550142200'
          FROM public.leads
          WHERE id = 'd9200000-0000-4000-8000-000000000001'),
    're-typing the phone must re-derive its E.164 form';
END;
$$;

-- An unparseable phone must not raise — it simply yields a NULL derivation.
DO $$
BEGIN
  UPDATE public.leads
  SET contact_phone = 'call the studio'
  WHERE id = 'd9200000-0000-4000-8000-000000000002';
  ASSERT (SELECT contact_phone_e164 IS NULL
          FROM public.leads
          WHERE id = 'd9200000-0000-4000-8000-000000000002'),
    'an unparseable phone must yield NULL, not a failed write';
  UPDATE public.leads
  SET contact_phone = NULL
  WHERE id = 'd9200000-0000-4000-8000-000000000002';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assume_phone_actor(p_actor uuid)
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
GRANT EXECUTE ON FUNCTION pg_temp.assume_phone_actor(uuid) TO PUBLIC;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_phone_actor('d9000000-0000-4000-8000-000000000001');

-- Before Discovery the directory shows the lead's own captured phone (the
-- household has no profile to borrow one from).
DO $$
BEGIN
  ASSERT (SELECT phone = '(555) 014-2200'
          FROM public.people_directory
          WHERE person_id = 'd9200000-0000-4000-8000-000000000001'
            AND role = 'lead'),
    format('directory lead row must expose the captured phone, got %L',
           (SELECT phone FROM public.people_directory
            WHERE person_id = 'd9200000-0000-4000-8000-000000000001'
              AND role = 'lead'));
END;
$$;

-- Discovery carries the phone onto the relationship, normalized.
DO $$
DECLARE
  v_relationship_id uuid;
BEGIN
  v_relationship_id := (
    public.begin_discovery('d9200000-0000-4000-8000-000000000001')
    ->>'designerClientId'
  )::uuid;

  ASSERT (SELECT client_phone = '(555) 014-2200'
          FROM public.designer_clients WHERE id = v_relationship_id),
    format('Discovery must carry the lead phone onto client_phone, got %L',
           (SELECT client_phone FROM public.designer_clients
            WHERE id = v_relationship_id));
  ASSERT (SELECT client_phone_e164 = '+15550142200'
          FROM public.designer_clients WHERE id = v_relationship_id),
    format('client_phone_e164 must normalize, got %L',
           (SELECT client_phone_e164 FROM public.designer_clients
            WHERE id = v_relationship_id));
  ASSERT (SELECT client_email = 'okafors@test.invalid'
          FROM public.designer_clients WHERE id = v_relationship_id),
    'Discovery must still carry the captured email';

  -- A retry must not disturb the phone it already carried.
  ASSERT (public.begin_discovery('d9200000-0000-4000-8000-000000000001')
          ->>'designerClientId')::uuid = v_relationship_id,
    'Discovery retry must return the same relationship';
  ASSERT (SELECT client_phone = '(555) 014-2200'
          FROM public.designer_clients WHERE id = v_relationship_id),
    'Discovery retry must not clear the carried phone';

  -- After Discovery the directory reads the client row's phone.
  ASSERT (SELECT phone = '(555) 014-2200'
          FROM public.people_directory
          WHERE person_id = v_relationship_id AND role = 'client'),
    format('directory client row must expose client_phone, got %L',
           (SELECT phone FROM public.people_directory
            WHERE person_id = v_relationship_id AND role = 'client'));
END;
$$;

-- A phone typed onto the relationship after the fact stays the designer's own:
-- hydration only fills a NULL, it never overwrites.
DO $$
DECLARE
  v_relationship_id uuid;
BEGIN
  SELECT id INTO v_relationship_id
  FROM public.designer_clients
  WHERE lead_id = 'd9200000-0000-4000-8000-000000000001';

  UPDATE public.designer_clients
  SET client_phone = '+44 20 7946 0100'
  WHERE id = v_relationship_id;

  ASSERT (SELECT client_phone = '+44 20 7946 0100'
                 AND client_phone_e164 = '+442079460100'
          FROM public.designer_clients WHERE id = v_relationship_id),
    format('a corrected phone must stick and normalize, got %L / %L',
           (SELECT client_phone FROM public.designer_clients
            WHERE id = v_relationship_id),
           (SELECT client_phone_e164 FROM public.designer_clients
            WHERE id = v_relationship_id));

  -- The household sheet's own clear: it saves name, email, and phone together,
  -- so this is the shape hydration sees. The phone must stay empty (hydration
  -- fills it on INSERT only) and its derivation must go with it. The email
  -- re-hydrating is 00399's deliberate behaviour, asserted here so the
  -- difference between the two columns is on the record.
  UPDATE public.designer_clients
  SET client_email = NULL, client_phone = NULL
  WHERE id = v_relationship_id;

  ASSERT (SELECT client_phone IS NULL AND client_phone_e164 IS NULL
          FROM public.designer_clients WHERE id = v_relationship_id),
    format('an emptied Phone on file must stay empty, got %L / %L',
           (SELECT client_phone FROM public.designer_clients
            WHERE id = v_relationship_id),
           (SELECT client_phone_e164 FROM public.designer_clients
            WHERE id = v_relationship_id));
  ASSERT (SELECT client_email = 'okafors@test.invalid'
          FROM public.designer_clients WHERE id = v_relationship_id),
    'the email leg still re-hydrates from the lead (00399)';
END;
$$;

-- A lead with no phone leaves the relationship's phone empty rather than
-- inventing one.
DO $$
DECLARE
  v_relationship_id uuid;
BEGIN
  v_relationship_id := (
    public.begin_discovery('d9200000-0000-4000-8000-000000000002')
    ->>'designerClientId'
  )::uuid;
  ASSERT (SELECT client_phone IS NULL AND client_phone_e164 IS NULL
          FROM public.designer_clients WHERE id = v_relationship_id),
    'a phone-less lead must leave client_phone NULL';
END;
$$;

-- A household that holds a Patina profile manages its own phone. The captured
-- number must NOT be seeded onto that relationship: the household sheet gives a
-- profile-holding client no phone field, so a number written here could never
-- be cleared, and it would shadow profiles.phone in the directory forever.
DO $$
DECLARE
  v_relationship_id uuid;
BEGIN
  v_relationship_id := (
    public.begin_discovery('d9200000-0000-4000-8000-000000000003')
    ->>'designerClientId'
  )::uuid;

  ASSERT (SELECT client_id = 'd9000000-0000-4000-8000-000000000002'
          FROM public.designer_clients WHERE id = v_relationship_id),
    'the profile-holding lead must link its homeowner';
  ASSERT (SELECT client_phone IS NULL AND client_phone_e164 IS NULL
          FROM public.designer_clients WHERE id = v_relationship_id),
    format('a profile-holding client must not be seeded a captured phone, got %L',
           (SELECT client_phone FROM public.designer_clients
            WHERE id = v_relationship_id));
  ASSERT (SELECT phone = '(555) 990-0001'
          FROM public.people_directory
          WHERE person_id = v_relationship_id AND role = 'client'),
    format('the directory must fall through to the profile phone, got %L',
           (SELECT phone FROM public.people_directory
            WHERE person_id = v_relationship_id AND role = 'client'));
END;
$$;

ROLLBACK;
