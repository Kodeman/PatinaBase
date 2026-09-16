\pset pager off
SELECT 'GRANTS-tbl' AS probe, c.relname, a.grantee::regrole::text AS grantee,
       string_agg(a.privilege_type, ',' ORDER BY a.privilege_type) AS privs
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  CROSS JOIN LATERAL aclexplode(c.relacl) a
 WHERE n.nspname='public' AND c.relname IN ('studio_contact_merges','studio_compliance_notices','client_households','people_directory','project_parties','studio_contacts')
 GROUP BY 2,3 ORDER BY 2,3;

SELECT 'RLS' AS probe, c.relname, c.relrowsecurity, pol.polname, pol.polcmd
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_policy pol ON pol.polrelid=c.oid
 WHERE n.nspname='public' AND c.relname IN ('studio_contact_merges','studio_compliance_notices','client_households')
 ORDER BY 2,4;

SELECT 'COURT' AS probe, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='client_decisions_court_check';

SELECT 'STUDIOLESS' AS probe,
  count(*) FILTER (WHERE studio_id IS NULL) AS null_studio,
  count(*) AS total,
  count(*) FILTER (WHERE studio_id IS NULL AND EXISTS (SELECT 1 FROM project_parties pp WHERE pp.project_id=p.id)) AS null_with_seats
  FROM projects p;

SELECT 'VIEW-COMMENT' AS probe, obj_description('public.people_directory'::regclass) ILIKE '%merged%' AS mentions_merged,
       left(COALESCE(obj_description('public.people_directory'::regclass),'(null)'), 90) AS head;
