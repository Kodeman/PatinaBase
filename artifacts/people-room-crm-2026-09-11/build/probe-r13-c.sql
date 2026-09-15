BEGIN;
-- 00628: ambiguous designers stay NULL
SELECT count(*) FILTER (WHERE studio_id IS NULL) AS still_null,
       count(*) AS total FROM public.projects;
SELECT p.id, p.name, p.designer_id,
       (SELECT count(DISTINCT om.organization_id) FROM public.organization_members om
          JOIN public.organizations o ON o.id=om.organization_id
         WHERE om.user_id=p.designer_id AND om.status='active' AND om.role<>'guest'
           AND o.type='design_studio' AND o.status='active') AS n_orgs
FROM public.projects p WHERE p.studio_id IS NULL;
-- 00633: no invalid court rows
SELECT court, count(*) FROM public.client_decisions GROUP BY 1;
-- cron
SELECT jobname, schedule, command, active FROM cron.job WHERE jobname='compliance-document-expiry-sweep';
-- people_directory comment (m7)
SELECT obj_description('public.people_directory'::regclass) LIKE '%merged_into%' AS comment_mentions_merge;
ROLLBACK;
