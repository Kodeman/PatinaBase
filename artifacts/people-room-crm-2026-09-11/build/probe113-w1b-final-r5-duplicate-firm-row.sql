\pset pager off
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claims" = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
\echo '=== AA. Rivera Finishes: the two Directory rows, side by side ==='
SELECT person_id, role, display_name, phone, reach_state, consent_status, paper_state,
       seat_count, meta->>'entity_kind' AS entity_kind, meta->>'phone_e164' AS seat_e164,
       meta->>'company_id' AS company_id
  FROM public.people_directory WHERE display_name='Rivera Finishes' ORDER BY role;
RESET ROLE;
\echo '=== AA2. the card and the seat, as postgres ==='
SELECT id, entity_kind, company_name, phone, phone_e164 FROM public.studio_contacts WHERE company_name='Rivera Finishes';
SELECT id, party_kind, display_name, phone_e164, studio_contact_id, company_id, company_name
  FROM public.project_parties WHERE display_name='Rivera Finishes';
\echo '=== AA3. paper the card holds ==='
SELECT d.doc_type, d.expires_on, d.blocks FROM public.studio_compliance_documents d
  JOIN public.studio_contacts sc ON sc.id=d.holder_id WHERE sc.company_name='Rivera Finishes';
\echo '=== AA4. Granite North too ==='
SELECT role, display_name, paper_state, meta->>'entity_kind' AS ek FROM public.people_directory
 WHERE display_name='Granite North' ORDER BY role;
ROLLBACK;
