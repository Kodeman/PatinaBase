\pset pager off
\echo '=== A. does compliance_state read blocks[] at all? ==='
SELECT position('blocks' in prosrc) > 0 AS reads_blocks
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname='compliance_state';

\echo '=== B. the seeded documents, with their gates and dates ==='
SELECT COALESCE(sc.full_name, sc.company_name) AS holder, d.holder_type, d.doc_type,
       d.doc_label, d.expires_on, d.blocks, d.superseded_by IS NOT NULL AS superseded,
       public.compliance_state(d.holder_id) AS holder_word
  FROM studio_compliance_documents d JOIN studio_contacts sc ON sc.id=d.holder_id
 ORDER BY holder_word, holder, d.doc_type;

\echo '=== C. a LAPSED paper that gates NOTHING still makes the holder read lapsed ==='
BEGIN;
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, created_by)
VALUES ('cc000000-0000-0000-0000-0000000000a1','b0000000-0000-0000-0000-000000000001','company','sub','Gateless Ltd','a0000000-0000-0000-0000-000000000004');
INSERT INTO studio_compliance_documents (organization_id, holder_type, holder_id, doc_type, doc_label, expires_on, blocks)
VALUES ('b0000000-0000-0000-0000-000000000001','company','cc000000-0000-0000-0000-0000000000a1','other_named','a training card', CURRENT_DATE - 1, '{}');
INSERT INTO studio_compliance_documents (organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
VALUES ('b0000000-0000-0000-0000-000000000001','company','cc000000-0000-0000-0000-0000000000a1','coi_gl', CURRENT_DATE + 200, ARRAY['site_access','payment','draw']);
SELECT public.compliance_state('cc000000-0000-0000-0000-0000000000a1') AS word,
       'COI current to +200d; a gateless other_named lapsed yesterday' AS record;
ROLLBACK;

\echo '=== D. a supersede CYCLE hides both papers; a cross-type supersede hides a lapse ==='
BEGIN;
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, created_by)
VALUES ('cc000000-0000-0000-0000-0000000000b1','b0000000-0000-0000-0000-000000000001','company','sub','Cycle Ltd','a0000000-0000-0000-0000-000000000004');
INSERT INTO studio_compliance_documents (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
VALUES ('cc000000-0000-0000-0000-0000000000b2','b0000000-0000-0000-0000-000000000001','company','cc000000-0000-0000-0000-0000000000b1','coi_gl', CURRENT_DATE - 10, ARRAY['site_access']),
       ('cc000000-0000-0000-0000-0000000000b3','b0000000-0000-0000-0000-000000000001','company','cc000000-0000-0000-0000-0000000000b1','coi_wc', CURRENT_DATE - 20, ARRAY['draw']);
SELECT public.compliance_state('cc000000-0000-0000-0000-0000000000b1') AS before_cycle;
UPDATE studio_compliance_documents SET superseded_by='cc000000-0000-0000-0000-0000000000b3' WHERE id='cc000000-0000-0000-0000-0000000000b2';
UPDATE studio_compliance_documents SET superseded_by='cc000000-0000-0000-0000-0000000000b2' WHERE id='cc000000-0000-0000-0000-0000000000b3';
SELECT public.compliance_state('cc000000-0000-0000-0000-0000000000b1') AS after_cycle,
       (SELECT count(*) FROM studio_compliance_documents WHERE holder_id='cc000000-0000-0000-0000-0000000000b1' AND expires_on < CURRENT_DATE) AS lapsed_papers_still_on_file;
ROLLBACK;

BEGIN;
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, created_by)
VALUES ('cc000000-0000-0000-0000-0000000000c1','b0000000-0000-0000-0000-000000000001','company','sub','Crosstype Ltd','a0000000-0000-0000-0000-000000000004');
INSERT INTO studio_compliance_documents (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
VALUES ('cc000000-0000-0000-0000-0000000000c2','b0000000-0000-0000-0000-000000000001','company','cc000000-0000-0000-0000-0000000000c1','coi_gl', CURRENT_DATE - 10, ARRAY['site_access','draw']);
INSERT INTO studio_compliance_documents (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
VALUES ('cc000000-0000-0000-0000-0000000000c3','b0000000-0000-0000-0000-000000000001','company','cc000000-0000-0000-0000-0000000000c1','w9', NULL, '{}');
SELECT public.compliance_state('cc000000-0000-0000-0000-0000000000c1') AS before_supersede;
UPDATE studio_compliance_documents SET superseded_by='cc000000-0000-0000-0000-0000000000c3' WHERE id='cc000000-0000-0000-0000-0000000000c2';
SELECT public.compliance_state('cc000000-0000-0000-0000-0000000000c1') AS after_a_W9_supersedes_a_lapsed_COI;
ROLLBACK;

\echo '=== E. an ARCHIVED rolodex card still contributes its paper word ==='
BEGIN;
UPDATE studio_contacts SET archived_at = now() WHERE company_name = 'Northgate Electric';
SELECT display_name, status_raw, paper_state FROM people_directory WHERE display_name='Northgate Electric';
ROLLBACK;
