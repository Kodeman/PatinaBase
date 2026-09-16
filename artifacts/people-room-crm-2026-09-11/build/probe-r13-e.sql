BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.au(p uuid) RETURNS VOID AS $$
BEGIN PERFORM set_config('role','authenticated',true);
 PERFORM set_config('request.jwt.claims', json_build_object('sub',p::text,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated'; END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.au(uuid) TO PUBLIC;

INSERT INTO public.organizations (id,type,name,slug,status) VALUES
 ('fc000000-0000-4000-8000-00000000000a','design_studio','R13 E Studio','r13-e','active');
INSERT INTO public.organization_members (user_id,organization_id,role,status,joined_at) VALUES
 ('a0000000-0000-0000-0000-000000000004','fc000000-0000-4000-8000-00000000000a','owner','active',now()),
 ('a0000000-0000-0000-0000-000000000003','fc000000-0000-4000-8000-00000000000a','member','active',now())
ON CONFLICT (user_id,organization_id) DO UPDATE SET role=EXCLUDED.role,status='active';
INSERT INTO public.studio_contacts (id,organization_id,entity_kind,contact_kind,full_name,created_by) VALUES
 ('fc100000-0000-4000-8000-00000000000a','fc000000-0000-4000-8000-00000000000a','person','sub','Archive Me','a0000000-0000-0000-0000-000000000004');

DO $$
DECLARE v timestamptz;
BEGIN
  -- plain member
  PERFORM pg_temp.au('a0000000-0000-0000-0000-000000000003');
  BEGIN v := public.archive_studio_contact('fc100000-0000-4000-8000-00000000000a');
    RAISE NOTICE 'E-a member archive SUCCEEDED (%)', v;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'E-a member archive refused -> %', SQLERRM; END;
  -- non-member
  PERFORM pg_temp.au('a0000000-0000-0000-0000-000000000005');
  BEGIN v := public.archive_studio_contact('fc100000-0000-4000-8000-00000000000a');
    RAISE NOTICE 'E-b nonmember archive SUCCEEDED (%)', v;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'E-b nonmember archive refused -> %', SQLERRM; END;
  -- owner
  PERFORM pg_temp.au('a0000000-0000-0000-0000-000000000004');
  v := public.archive_studio_contact('fc100000-0000-4000-8000-00000000000a');
  RAISE NOTICE 'E-c owner archive -> %', v;
  -- idempotent
  RAISE NOTICE 'E-d owner archive again -> %', public.archive_studio_contact('fc100000-0000-4000-8000-00000000000a');
  -- merged_into PATCH as owner (admin leg has no column predicate)
  BEGIN
    UPDATE public.studio_contacts SET merged_into='fc100000-0000-4000-8000-00000000000a'
     WHERE id='fc100000-0000-4000-8000-00000000000a';
    RAISE NOTICE 'E-e owner self-pointer SUCCEEDED';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'E-e owner merged_into PATCH refused -> %', SQLERRM; END;
  EXECUTE 'RESET ROLE';
END $$;
ROLLBACK;
