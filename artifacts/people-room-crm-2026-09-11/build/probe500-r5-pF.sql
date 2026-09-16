\pset pager off
BEGIN;
SET LOCAL search_path TO public;
\set ORG '''b0000000-0000-0000-0000-000000000001'''
\set OWNER '''a0000000-0000-0000-0000-000000000004'''
CREATE TEMP TABLE p AS SELECT id FROM projects WHERE studio_id=:ORG::uuid ORDER BY created_at LIMIT 1;
SELECT 'PROJECT' AS probe, id::text FROM p;
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, email, phone, created_by)
VALUES ('ffff0000-0000-4000-8000-00000000f001', :ORG::uuid,'person','client','Chidi Probe','chidi.probe@example.invalid','612-555-0111', :OWNER::uuid);
INSERT INTO client_households (id, organization_id, designer_id, display_name, co_threshold_cents, created_by)
VALUES ('ffff0000-0000-4000-8000-00000000f0a1', :ORG::uuid, :OWNER::uuid, 'Probe household', 250000, :OWNER::uuid);

SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
SELECT 'ADD' AS probe, public.add_household_member('ffff0000-0000-4000-8000-00000000f0a1','ffff0000-0000-4000-8000-00000000f001','client_rep','d0e00000-0000-0000-0000-00000000000b'::uuid)::text AS seat;
RESET role;
SELECT 'GRANT-1' AS probe, a.scope, a.threshold_cents, a.source_clause
  FROM project_party_authority a JOIN project_parties pp ON pp.id=a.engagement_id
 WHERE pp.studio_contact_id='ffff0000-0000-4000-8000-00000000f001';

-- the owner raises the household figure, as the band's own editor does
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
UPDATE client_households SET co_threshold_cents = 500000 WHERE id='ffff0000-0000-4000-8000-00000000f0a1';
RESET role;
SELECT 'HOUSEHOLD-after' AS probe, co_threshold_cents FROM client_households WHERE id='ffff0000-0000-4000-8000-00000000f0a1';
SELECT 'GRANT-after' AS probe, a.scope, a.threshold_cents, a.source_clause
  FROM project_party_authority a JOIN project_parties pp ON pp.id=a.engagement_id
 WHERE pp.studio_contact_id='ffff0000-0000-4000-8000-00000000f001';

-- plain `client` role gets no money grant (PR-c)
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, created_by)
VALUES ('ffff0000-0000-4000-8000-00000000f002', :ORG::uuid,'person','client','Adaeze Probe', :OWNER::uuid);
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
SELECT 'ADD-client' AS probe, public.add_household_member('ffff0000-0000-4000-8000-00000000f0a1','ffff0000-0000-4000-8000-00000000f002','client','d0e00000-0000-0000-0000-00000000000b'::uuid)::text AS seat;
RESET role;
SELECT 'GRANT-client' AS probe, count(*) FROM project_party_authority a JOIN project_parties pp ON pp.id=a.engagement_id WHERE pp.studio_contact_id='ffff0000-0000-4000-8000-00000000f002';

-- a plain member cannot erase or raise the figure
INSERT INTO organization_members (organization_id, user_id, role, status)
SELECT :ORG::uuid, 'a0000000-0000-0000-0000-000000000005', 'member','active'
 WHERE EXISTS (SELECT 1 FROM profiles WHERE id='a0000000-0000-0000-0000-000000000005')
ON CONFLICT DO NOTHING;
SELECT 'member-exists' AS probe, count(*) FROM organization_members WHERE organization_id=:ORG::uuid AND user_id='a0000000-0000-0000-0000-000000000005';
ROLLBACK;
