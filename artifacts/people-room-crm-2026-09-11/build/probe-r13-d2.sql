BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p uuid) RETURNS VOID AS $$
BEGIN PERFORM set_config('role','authenticated',true);
 PERFORM set_config('request.jwt.claims', json_build_object('sub',p::text,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated'; END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid) TO PUBLIC;

INSERT INTO public.organizations (id,type,name,slug,status) VALUES
 ('fb000000-0000-4000-8000-00000000000a','design_studio','R13 D Studio','r13-d','active');
INSERT INTO public.organization_members (user_id,organization_id,role,status,joined_at) VALUES
 ('a0000000-0000-0000-0000-000000000004','fb000000-0000-4000-8000-00000000000a','owner','active',now())
ON CONFLICT (user_id,organization_id) DO UPDATE SET role=EXCLUDED.role,status='active';

-- two FIRM cards, the "saved twice, one firm" duplicate
INSERT INTO public.studio_contacts (id,organization_id,entity_kind,contact_kind,company_name,company_kind,created_by,created_at) VALUES
 ('fb200000-0000-4000-8000-00000000000a','fb000000-0000-4000-8000-00000000000a','company','sub','Stonehaven Tile','sub','a0000000-0000-0000-0000-000000000004','2025-01-01'),
 ('fb200000-0000-4000-8000-00000000000b','fb000000-0000-4000-8000-00000000000a','company','sub','Stonehaven Tile Gallery','sub','a0000000-0000-0000-0000-000000000004','2026-01-01');

-- two jobs in that studio
INSERT INTO public.projects (id,name,designer_id,studio_id,status,created_by,client_visibility_tier) VALUES
 ('fb300000-0000-4000-8000-000000000001','OLD closed job','a0000000-0000-0000-0000-000000000004','fb000000-0000-4000-8000-00000000000a','active','a0000000-0000-0000-0000-000000000004','full'),
 ('fb300000-0000-4000-8000-000000000002','LIVE job','a0000000-0000-0000-0000-000000000004','fb000000-0000-4000-8000-00000000000a','active','a0000000-0000-0000-0000-000000000004','full');

-- ONE UNCARDED human (phone identity) with two seats:
--   old seat carries the DUPLICATE firm card, 400 days quiet
--   live seat carries no firm, 10 days quiet  -> today's Directory winner
INSERT INTO public.project_parties (id,project_id,party_kind,display_name,phone,phone_e164,company_id,company_name,created_by) VALUES
 ('fb400000-0000-4000-8000-000000000001','fb300000-0000-4000-8000-000000000001','sub','Marta Uncarded','(612) 555-0951','+16125550951','fb200000-0000-4000-8000-00000000000b','Stonehaven Tile Gallery','a0000000-0000-0000-0000-000000000004'),
 ('fb400000-0000-4000-8000-000000000002','fb300000-0000-4000-8000-000000000002','sub','Marta Uncarded','(612) 555-0951','+16125550951',NULL,NULL,'a0000000-0000-0000-0000-000000000004');

ALTER TABLE public.project_parties DISABLE TRIGGER set_updated_at_project_parties;
UPDATE public.project_parties SET updated_at = now() - interval '400 days' WHERE id='fb400000-0000-4000-8000-000000000001';
UPDATE public.project_parties SET updated_at = now() - interval '10 days'  WHERE id='fb400000-0000-4000-8000-000000000002';
ALTER TABLE public.project_parties ENABLE TRIGGER set_updated_at_project_parties;

DO $$
DECLARE r record;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT person_id, meta->>'project_name' AS job, last_touch_at, meta->>'company_name' AS firm
    INTO r FROM public.people_directory WHERE display_name='Marta Uncarded';
  RAISE NOTICE 'D2-a BEFORE merge: seat=% job=% firm=% last_touch=%', r.person_id, r.job, r.firm, r.last_touch_at;
  EXECUTE 'RESET ROLE';
  ALTER TABLE public.project_parties DISABLE TRIGGER set_updated_at_project_parties;
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.merge_studio_contacts('fb200000-0000-4000-8000-00000000000a','fb200000-0000-4000-8000-00000000000b','company_name');
  SELECT person_id, meta->>'project_name' AS job, last_touch_at, meta->>'company_name' AS firm
    INTO r FROM public.people_directory WHERE display_name='Marta Uncarded';
  RAISE NOTICE 'D2-b AFTER(updated_at trigger OFF) merge:  seat=% job=% firm=% last_touch=%', r.person_id, r.job, r.firm, r.last_touch_at;
  EXECUTE 'RESET ROLE';
END $$;
ROLLBACK;
