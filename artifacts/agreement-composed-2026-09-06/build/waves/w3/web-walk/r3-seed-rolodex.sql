\set ON_ERROR_STOP on
-- The Trade Agreement composer's rolodex reads public.studio_contacts, and no
-- surface under Wave 3's flag set writes one (carried from round 2). Seeded here
-- so step 16 can be walked.
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, company_name,
   email, specialties, created_by)
VALUES
  ('c0000000-0000-4000-8000-00000000ca03',
   (SELECT om.organization_id FROM public.proposals p
    JOIN public.organization_members om ON om.user_id = p.designer_id
    WHERE p.id = '8cac8743-9b06-40ba-aeab-aa6a1829070b' LIMIT 1),
   'person', 'sub', 'Marta Reyes', 'Reyes Cabinetry',
   'marta@reyescabinetry.test', ARRAY['Cabinetry'],
   (SELECT designer_id FROM public.proposals WHERE id='8cac8743-9b06-40ba-aeab-aa6a1829070b'))
ON CONFLICT (id) DO NOTHING;
SELECT id, organization_id, contact_kind, company_name FROM public.studio_contacts;
