\set ON_ERROR_STOP on
BEGIN;
-- act as an active member of the studio (the seeded owner)
DO $$
DECLARE v_uid uuid;
BEGIN
  SELECT om.user_id INTO v_uid
    FROM public.organization_members om
    JOIN public.studio_contacts sc ON sc.organization_id = om.organization_id
   WHERE sc.id = 'd0e10000-0000-0000-0000-000000000011'
     AND om.status='active' AND om.role IN ('owner','admin')
   LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role','authenticated')::text, true);
  PERFORM set_config('role','authenticated', true);
END $$;
RESET ROLE;

SELECT 'BEFORE' AS when, display_name, meta->>'company_name' AS firm_on_row,
       meta->>'entity_kind' AS kind, paper_state
  FROM public.people_directory
 WHERE person_id = 'd0e10000-0000-0000-0000-000000000011';

SELECT public.merge_studio_contacts(
  'd0e10000-0000-0000-0000-000000000011'::uuid,   -- Dana Kowalski (person, sole prop)
  'd0e20000-0000-0000-0000-000000000003'::uuid,   -- Northgate Electric (firm)
  'manual') AS survivor;

SELECT 'AFTER' AS when, display_name, meta->>'company_name' AS firm_on_row,
       meta->>'entity_kind' AS kind, paper_state
  FROM public.people_directory
 WHERE person_id = 'd0e10000-0000-0000-0000-000000000011';

SELECT id, full_name, company_name, company_id, is_sole_proprietor, trades
  FROM public.studio_contacts WHERE id='d0e10000-0000-0000-0000-000000000011';

-- the crew who were affiliated with the folded firm
SELECT sc.full_name, sc.company_id, a.to_date, a.role_at_firm
  FROM public.studio_person_affiliations a
  JOIN public.studio_contacts sc ON sc.id = a.person_id
 WHERE a.company_id = 'd0e20000-0000-0000-0000-000000000003';
ROLLBACK;
