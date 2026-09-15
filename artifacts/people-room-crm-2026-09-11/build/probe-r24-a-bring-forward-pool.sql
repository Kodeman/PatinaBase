-- r24 major-1(a): the bring-forward picker's candidate pool for needle 'lindqvist'
-- on the Okonkwo residence (the open job, excluded from the prior-job rollup).
-- Reproduces rolodex-picker.tsx `hits` + useStudioContactHistory(excludeProjectId).
\set ON_ERROR_STOP on
\pset pager off

WITH openjob AS (SELECT 'd0e00000-0000-0000-0000-00000000000a'::uuid AS id),
prior AS (
  SELECT pp.studio_contact_id, p.name
  FROM project_parties pp
  JOIN projects p ON p.id = pp.project_id
  WHERE pp.studio_contact_id IS NOT NULL
    AND pp.project_id <> (SELECT id FROM openjob)
  GROUP BY 1,2
),
card AS (
  SELECT c.id, c.full_name, c.email, c.company_name,
         firm.full_name AS firm_name,
         (SELECT array_agg(DISTINCT j) FROM (
            SELECT unnest(coalesce(c.trades,'{}')) j
            UNION SELECT unnest(coalesce(firm.trades,'{}'))
            UNION SELECT unnest(coalesce(c.specialties,'{}'))) t) AS trades
  FROM studio_contacts c
  LEFT JOIN studio_contacts firm ON firm.id = c.company_id
  WHERE c.entity_kind = 'person' AND c.organization_id = 'b0000000-0000-0000-0000-000000000001'
    AND coalesce(c.archived_at::text,'') = ''
)
SELECT card.full_name,
       coalesce(card.firm_name, card.company_name, '-') AS firm,
       (SELECT string_agg(name, ' | ') FROM prior WHERE prior.studio_contact_id = card.id) AS prior_jobs,
       CASE WHEN card.full_name ILIKE '%lindqvist%' THEN 'name'
            WHEN coalesce(card.firm_name, card.company_name,'') ILIKE '%lindqvist%' THEN 'firm'
            WHEN coalesce(card.email,'') ILIKE '%lindqvist%' THEN 'email'
            WHEN EXISTS (SELECT 1 FROM unnest(coalesce(card.trades,'{}')) t WHERE t ILIKE '%lindqvist%') THEN 'trade'
            ELSE 'prior job' END AS matched_on
FROM card
WHERE card.full_name ILIKE '%lindqvist%'
   OR coalesce(card.firm_name,'') ILIKE '%lindqvist%'
   OR coalesce(card.company_name,'') ILIKE '%lindqvist%'
   OR coalesce(card.email,'') ILIKE '%lindqvist%'
   OR EXISTS (SELECT 1 FROM unnest(coalesce(card.trades,'{}')) t WHERE t ILIKE '%lindqvist%')
   OR EXISTS (SELECT 1 FROM prior WHERE prior.studio_contact_id = card.id AND prior.name ILIKE '%lindqvist%')
ORDER BY 1;
