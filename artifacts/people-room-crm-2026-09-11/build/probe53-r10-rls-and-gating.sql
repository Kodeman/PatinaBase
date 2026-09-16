BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.au(p uuid) RETURNS VOID AS $$
BEGIN PERFORM set_config('role','authenticated',true);
PERFORM set_config('request.jwt.claims', json_build_object('sub',p::text,'role','authenticated')::text,true);
EXECUTE 'SET LOCAL ROLE authenticated'; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.rr() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.au(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.rr() TO PUBLIC;

INSERT INTO public.organizations (id,type,name,slug,status) VALUES
 ('fd000000-0000-4000-8000-00000000000a','design_studio','Probe D A','probe-d-a','active'),
 ('fd000000-0000-4000-8000-00000000000b','design_studio','Probe D B','probe-d-b','active');
INSERT INTO public.organization_members (user_id,organization_id,role,status,joined_at) VALUES
 ('a0000000-0000-0000-0000-000000000004','fd000000-0000-4000-8000-00000000000a','owner','active',now()),
 ('a0000000-0000-0000-0000-000000000003','fd000000-0000-4000-8000-00000000000a','member','active',now()),
 ('a0000000-0000-0000-0000-000000000007','fd000000-0000-4000-8000-00000000000b','owner','active',now())
ON CONFLICT (user_id,organization_id) DO UPDATE SET role=EXCLUDED.role, status='active';

INSERT INTO public.studio_contacts (id,organization_id,entity_kind,contact_kind,full_name,created_by) VALUES
 ('fd100000-0000-4000-8000-00000000000a','fd000000-0000-4000-8000-00000000000a','person','client','Adaeze D','a0000000-0000-0000-0000-000000000004'),
 ('fd100000-0000-4000-8000-00000000000b','fd000000-0000-4000-8000-00000000000a','person','client_rep','Chidi D','a0000000-0000-0000-0000-000000000004');

INSERT INTO public.client_households (id,organization_id,designer_id,display_name,member_person_ids,co_threshold_cents,created_by)
VALUES ('fd600000-0000-4000-8000-00000000000a','fd000000-0000-4000-8000-00000000000a',
        'a0000000-0000-0000-0000-000000000004','The D Household',
        ARRAY['fd100000-0000-4000-8000-00000000000a']::uuid[],250000,'a0000000-0000-0000-0000-000000000004');

INSERT INTO public.projects (id,name,designer_id,studio_id,status,created_by,client_visibility_tier) VALUES
 ('fd300000-0000-4000-8000-00000000000a','Probe D job A','a0000000-0000-0000-0000-000000000004','fd000000-0000-4000-8000-00000000000a','active','a0000000-0000-0000-0000-000000000004','full'),
 ('fd300000-0000-4000-8000-00000000000b','Probe D job B','a0000000-0000-0000-0000-000000000007','fd000000-0000-4000-8000-00000000000b','active','a0000000-0000-0000-0000-000000000007','full');

-- 1. cross-tenant read of client_households
SELECT pg_temp.au('a0000000-0000-0000-0000-000000000007');
SELECT 'other-tenant households visible' AS w, count(*) FROM public.client_households;
SELECT pg_temp.rr();

-- 2. plain member with a threshold: PR-n refusal
DO $$ BEGIN
  PERFORM pg_temp.au('a0000000-0000-0000-0000-000000000003');
  BEGIN
    PERFORM public.add_household_member('fd600000-0000-4000-8000-00000000000a',
      'fd100000-0000-4000-8000-00000000000b','client_rep','fd300000-0000-4000-8000-00000000000a');
    RAISE NOTICE 'PROBE D2: NO REFUSAL — a plain member set a money grant';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PROBE D2: refused with %', SQLERRM;
  END;
  PERFORM pg_temp.rr();
END $$;

-- 2b. did the plain member's refused call still leave a seat / membership behind?
SELECT 'seats after refusal' AS w, count(*) FROM public.project_parties WHERE project_id='fd300000-0000-4000-8000-00000000000a';
SELECT 'members after refusal' AS w, member_person_ids FROM public.client_households WHERE id='fd600000-0000-4000-8000-00000000000a';

-- 3. household member seated on ANOTHER STUDIO's project (role client, no grant path)
DO $$ BEGIN
  PERFORM pg_temp.au('a0000000-0000-0000-0000-000000000004');
  BEGIN
    PERFORM public.add_household_member('fd600000-0000-4000-8000-00000000000a',
      'fd100000-0000-4000-8000-00000000000b','client','fd300000-0000-4000-8000-00000000000b');
    RAISE NOTICE 'PROBE D3: SEAT CREATED ON ANOTHER STUDIO''S PROJECT';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PROBE D3: refused with %', SQLERRM;
  END;
  PERFORM pg_temp.rr();
END $$;
SELECT 'seats on other studio job' AS w, count(*) FROM public.project_parties WHERE project_id='fd300000-0000-4000-8000-00000000000b';
SELECT 'members after D3' AS w, member_person_ids FROM public.client_households WHERE id='fd600000-0000-4000-8000-00000000000a';

-- 4. archive gating: a plain member
DO $$ BEGIN
  PERFORM pg_temp.au('a0000000-0000-0000-0000-000000000003');
  BEGIN
    PERFORM public.archive_studio_contact('fd100000-0000-4000-8000-00000000000a');
    RAISE NOTICE 'PROBE D4: a plain member archived a card';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'PROBE D4: refused with %', SQLERRM;
  END;
  PERFORM pg_temp.rr();
END $$;

-- 5. a non-member resolves nothing
DO $$ DECLARE v uuid; BEGIN
  PERFORM pg_temp.au('a0000000-0000-0000-0000-000000000007');
  v := public.resolve_merged_contact('fd100000-0000-4000-8000-00000000000a');
  RAISE NOTICE 'PROBE D5: other-tenant resolve_merged_contact = %', COALESCE(v::text,'NULL');
  PERFORM pg_temp.rr();
END $$;
ROLLBACK;
