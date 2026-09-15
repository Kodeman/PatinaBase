\pset pager off
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL role authenticated;
-- the studio owner
SELECT set_config('request.jwt.claims', json_build_object('sub','a0000000-0000-0000-0000-000000000004','role','authenticated')::text, true);

SELECT public.merge_studio_contacts(
  'd0e10000-0000-0000-0000-000000000011'::uuid,   -- survivor: Dana (person, sole prop)
  'd0e20000-0000-0000-0000-000000000003'::uuid,   -- merged: Northgate Electric (company)
  'manual') AS survivor;

RESET role;
-- orphan sweep across every FK column into studio_contacts
SELECT 'dangling FK refs' AS what, count(*) FROM (
  SELECT 1 FROM project_parties pp JOIN studio_contacts sc ON sc.id=pp.studio_contact_id WHERE sc.merged_into IS NOT NULL
  UNION ALL SELECT 1 FROM project_parties pp JOIN studio_contacts sc ON sc.id=pp.company_id WHERE sc.merged_into IS NOT NULL
  UNION ALL SELECT 1 FROM project_parties pp JOIN studio_contacts sc ON sc.id=pp.warranty_contact_person_id WHERE sc.merged_into IS NOT NULL
  UNION ALL SELECT 1 FROM project_parties pp JOIN studio_contacts sc ON sc.id=pp.bid_quoted_by_person_id WHERE sc.merged_into IS NOT NULL
  UNION ALL SELECT 1 FROM studio_contact_channels c JOIN studio_contacts sc ON sc.id=c.owner_id WHERE sc.merged_into IS NOT NULL
  UNION ALL SELECT 1 FROM studio_compliance_documents d JOIN studio_contacts sc ON sc.id=d.holder_id WHERE sc.merged_into IS NOT NULL
  UNION ALL SELECT 1 FROM studio_trade_agreement_tokens t JOIN studio_contacts sc ON sc.id=t.contact_id WHERE sc.merged_into IS NOT NULL
  UNION ALL SELECT 1 FROM agreement_draw_lien_waivers w JOIN studio_contacts sc ON sc.id=w.contact_id WHERE sc.merged_into IS NOT NULL
  UNION ALL SELECT 1 FROM client_households h, unnest(h.member_person_ids) m JOIN studio_contacts sc ON sc.id=m WHERE sc.merged_into IS NOT NULL
) x;

SELECT 'directory rows for merged card' AS what, count(*) FROM people_directory WHERE person_id='d0e20000-0000-0000-0000-000000000003';
SELECT 'survivor name/firm' AS what, display_name, meta->>'company_name' AS firm FROM people_directory WHERE person_id='d0e10000-0000-0000-0000-000000000011';
SELECT 'crew affiliations at folded firm, closed not deleted' AS what, count(*) FILTER (WHERE to_date IS NOT NULL) AS closed, count(*) AS total
  FROM studio_person_affiliations WHERE company_id='d0e20000-0000-0000-0000-000000000003';
SELECT 'merge lineage rows' AS what, count(*) FROM studio_contact_merges;
SELECT 'docs on survivor' AS what, count(*) FROM studio_compliance_documents WHERE holder_id='d0e10000-0000-0000-0000-000000000011';
SELECT 'docs still on folded firm' AS what, count(*) FROM studio_compliance_documents WHERE holder_id='d0e20000-0000-0000-0000-000000000003';
SELECT 'resolve old id' AS what, public.resolve_merged_contact('d0e20000-0000-0000-0000-000000000003');
ROLLBACK;
