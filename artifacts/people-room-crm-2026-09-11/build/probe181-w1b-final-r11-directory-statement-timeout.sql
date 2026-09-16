\pset pager off
BEGIN;
-- 300 extra cards + 300 extra seats: a studio one year in.
INSERT INTO public.studio_contacts (organization_id, entity_kind, contact_kind, full_name, created_by)
SELECT 'b0000000-0000-0000-0000-000000000001','person','sub','Scale P '||g,
       'a0000000-0000-0000-0000-000000000004' FROM generate_series(1,600) g;
INSERT INTO public.project_parties (project_id, party_kind, display_name, phone_e164)
SELECT 'd0e00000-0000-0000-0000-00000000000a','sub','Scale S '||g,
       '+1612'||lpad((7000000+g)::text,7,'0') FROM generate_series(1,600) g;
ANALYZE public.project_parties; ANALYZE public.studio_contacts;
SELECT set_config('request.jwt.claims',
  json_build_object('sub',(SELECT id::text FROM public.profiles WHERE email='designer@patina.dev'),
                    'role','authenticated')::text, false) \gset
SET LOCAL ROLE authenticated;
SET LOCAL statement_timeout = '8s';   -- exactly authenticated's own rolconfig
\echo '--- the query use-people.ts:125 issues, as PostgREST runs it ---'
SELECT count(*) FROM (SELECT * FROM public.people_directory) s WHERE s.seat_count IS NOT NULL;
ROLLBACK;
