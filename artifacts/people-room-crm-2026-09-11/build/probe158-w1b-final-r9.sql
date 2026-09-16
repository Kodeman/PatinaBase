\pset pager off
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p uuid) RETURNS void AS $$
BEGIN PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated'; END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS void AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(uuid) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

\echo '=== MINOR-5: an engagement rule on a NON-winning seat of an uncarded identity ==='
-- Rivera Finishes is the one uncarded identity in the fixture; give it a second seat
SELECT pg_temp.reset_role();
SELECT 'Rivera seat' q, format('%s on %s, updated %s', pp.id, pj.name, pp.updated_at) v
  FROM project_parties pp JOIN projects pj ON pj.id=pp.project_id
 WHERE pp.display_name='Rivera Finishes' OR pp.company_name='Rivera Finishes';

\echo '=== MINOR-6: firm cards carry a consent word ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
SELECT d.display_name, d.meta->>'entity_kind' AS kind, d.consent_status, d.paper_state, d.contact_rule_summary
  FROM public.people_directory d
 WHERE d.role='contact' AND d.meta->>'entity_kind'='company'
 ORDER BY 1 LIMIT 6;
SELECT pg_temp.reset_role();

\echo '=== definer uuid->fact oracles, as an UNRELATED studio owner ==='
INSERT INTO organizations (id, type, name, slug, status)
VALUES ('e9000000-0000-4000-8000-000000000003','design_studio','Probe Unrelated 158','probe-unrel-158','active');
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at)
VALUES ('a0000000-0000-0000-0000-000000000007','e9000000-0000-4000-8000-000000000003','owner','active',now());
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000007');
SELECT 'X project_recorded_studio(Okonkwo)'  q, coalesce(public.project_recorded_studio('d0e00000-0000-0000-0000-00000000000a')::text,'<null>') v
UNION ALL SELECT 'X project_designer(Okonkwo)', coalesce(public.project_designer('d0e00000-0000-0000-0000-00000000000a')::text,'<null>')
UNION ALL SELECT 'X project_party_recorded_studio(a seat)',
  coalesce(public.project_party_recorded_studio((SELECT id FROM public.project_parties LIMIT 1))::text,'<null>')
UNION ALL SELECT 'X rows readable in project_parties', (SELECT count(*)::text FROM public.project_parties);
SELECT pg_temp.reset_role();
ROLLBACK;
