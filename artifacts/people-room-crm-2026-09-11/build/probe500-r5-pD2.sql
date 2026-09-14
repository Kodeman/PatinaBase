\pset pager off
BEGIN;
SET LOCAL search_path TO public;
\set ORG '''b0000000-0000-0000-0000-000000000001'''
\set OWNER '''a0000000-0000-0000-0000-000000000004'''

CREATE TEMP TABLE pick AS
SELECT sc.id, sc.company_name FROM studio_contacts sc
 WHERE sc.organization_id = :ORG::uuid AND sc.entity_kind='company'
   AND EXISTS (SELECT 1 FROM studio_compliance_documents d WHERE d.holder_id=sc.id)
 ORDER BY sc.company_name LIMIT 1;
CREATE TEMP TABLE proj AS
SELECT p.id FROM projects p WHERE p.studio_id = :ORG::uuid ORDER BY p.created_at LIMIT 1;
SELECT 'PICK' AS probe, 'd0e20000-0000-0000-0000-000000000014' AS survivor, 'Ashgrove Millwork', 'd0e00000-0000-0000-0000-00000000000b' AS project;

INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, phone, phone_e164, email, created_by)
VALUES ('dddd0000-0000-4000-8000-00000000d001', :ORG::uuid, 'company','subcontractor','Dup Firm','612-555-0199','+16125550199','dup@example.invalid', :OWNER::uuid);
INSERT INTO studio_contact_channels (owner_type, owner_id, channel_kind, value, label)
VALUES ('company','dddd0000-0000-4000-8000-00000000d001','office','+16125550199','main');
INSERT INTO studio_compliance_documents (id, organization_id, holder_id, holder_type, doc_type, expires_on, blocks)
VALUES ('dddd0000-0000-4000-8000-00000000dd01', :ORG::uuid, 'dddd0000-0000-4000-8000-00000000d001','company','coi_gl', CURRENT_DATE + 200, ARRAY['draw']);
INSERT INTO studio_person_affiliations (person_id, company_id, role_at_firm)
SELECT sc.id, 'dddd0000-0000-4000-8000-00000000d001', 'estimator'
  FROM studio_contacts sc WHERE sc.organization_id=:ORG::uuid AND sc.entity_kind='person' AND sc.merged_into IS NULL
    AND NOT EXISTS (SELECT 1 FROM studio_person_affiliations a WHERE a.person_id=sc.id AND a.to_date IS NULL)
  ORDER BY sc.created_at LIMIT 1;
-- a DRAFT agreement + token, and a SENT agreement
INSERT INTO studio_trade_agreements (id, project_id, studio_id, contact_id, contact_display_name, title, scope, price_cents, created_by, state)
VALUES ('dddd0000-0000-4000-8000-000000000a01', 'd0e00000-0000-0000-0000-00000000000b'::uuid, :ORG::uuid, 'dddd0000-0000-4000-8000-00000000d001','Dup Firm','Probe draft','scope',100000, :OWNER::uuid, 'draft'),
       ('dddd0000-0000-4000-8000-000000000a02', 'd0e00000-0000-0000-0000-00000000000b'::uuid, :ORG::uuid, 'dddd0000-0000-4000-8000-00000000d001','Dup Firm','Probe sent','scope',100000, :OWNER::uuid, 'draft');
UPDATE studio_trade_agreements SET state='sent', sent_at=now() WHERE id='dddd0000-0000-4000-8000-000000000a02';
INSERT INTO studio_trade_agreement_tokens (agreement_id, contact_id, token_hash)
VALUES ('dddd0000-0000-4000-8000-000000000a02','dddd0000-0000-4000-8000-00000000d001', repeat('a',64));

SELECT 'BEFORE' AS probe,
 (SELECT count(*) FROM studio_contact_channels WHERE owner_id='dddd0000-0000-4000-8000-00000000d001') AS ch,
 (SELECT count(*) FROM studio_compliance_documents WHERE holder_id='dddd0000-0000-4000-8000-00000000d001') AS docs,
 (SELECT count(*) FROM studio_person_affiliations WHERE company_id='dddd0000-0000-4000-8000-00000000d001') AS affs,
 (SELECT count(*) FROM studio_trade_agreement_tokens WHERE contact_id='dddd0000-0000-4000-8000-00000000d001') AS toks,
 (SELECT count(*) FROM studio_trade_agreements WHERE contact_id='dddd0000-0000-4000-8000-00000000d001') AS agrs;

SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
SELECT 'MERGE' AS probe, public.merge_studio_contacts('d0e20000-0000-0000-0000-000000000014'::uuid,'dddd0000-0000-4000-8000-00000000d001','phone')::text;
RESET role;

SELECT 'AFTER-orphans' AS probe,
 (SELECT count(*) FROM studio_contact_channels WHERE owner_id='dddd0000-0000-4000-8000-00000000d001') AS ch,
 (SELECT count(*) FROM studio_compliance_documents WHERE holder_id='dddd0000-0000-4000-8000-00000000d001') AS docs,
 (SELECT count(*) FROM studio_person_affiliations WHERE company_id='dddd0000-0000-4000-8000-00000000d001') AS affs,
 (SELECT count(*) FROM studio_trade_agreement_tokens WHERE contact_id='dddd0000-0000-4000-8000-00000000d001') AS toks,
 (SELECT count(*) FROM studio_trade_agreements WHERE contact_id='dddd0000-0000-4000-8000-00000000d001') AS agrs_left,
 (SELECT string_agg(state,',') FROM studio_trade_agreements WHERE contact_id='dddd0000-0000-4000-8000-00000000d001') AS agr_states,
 (SELECT count(*) FROM project_parties WHERE company_id='dddd0000-0000-4000-8000-00000000d001' OR studio_contact_id='dddd0000-0000-4000-8000-00000000d001' OR warranty_contact_person_id='dddd0000-0000-4000-8000-00000000d001' OR bid_quoted_by_person_id='dddd0000-0000-4000-8000-00000000d001') AS seats,
 (SELECT count(*) FROM studio_contacts WHERE company_id='dddd0000-0000-4000-8000-00000000d001') AS ptr;

SELECT 'RESOLVE' AS probe, public.resolve_merged_contact('dddd0000-0000-4000-8000-00000000d001')::text AS head;
SELECT 'LINEAGE' AS probe, survivor_id::text, merged_id::text, matched_on FROM studio_contact_merges;

SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);
SELECT 'DIR-merged' AS probe, count(*) FROM people_directory WHERE person_id='dddd0000-0000-4000-8000-00000000d001';
SELECT 'AG-GRANTS' AS probe, subject_id::text, tier FROM public.access_grants_trade_agreement_links() WHERE subject_id IN ('d0e20000-0000-0000-0000-000000000014'::uuid,'dddd0000-0000-4000-8000-00000000d001');
SELECT set_config('request.jwt.claims', json_build_object('sub','cf100000-0000-4000-8000-000000000001','role','authenticated')::text, true);
SELECT 'XT-merges' AS probe, count(*) FROM studio_contact_merges;
SELECT 'XT-notices' AS probe, count(*) FROM studio_compliance_notices;
SELECT 'XT-households' AS probe, count(*) FROM client_households;
SELECT 'XT-resolve' AS probe, COALESCE(public.resolve_merged_contact('dddd0000-0000-4000-8000-00000000d001')::text,'(null)');
SELECT 'XT-dir' AS probe, count(*) FROM people_directory WHERE person_id IN ('dddd0000-0000-4000-8000-00000000d001','d0e20000-0000-0000-0000-000000000014'::uuid);
SELECT 'XT-merge-attempt' AS probe;
DO $$ BEGIN
  PERFORM public.merge_studio_contacts('dddd0000-0000-4000-8000-00000000d001','dddd0000-0000-4000-8000-00000000d001','manual');
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'XT merge refused: %', SQLERRM; END $$;
ROLLBACK;
