-- w1b final review r13 · MAJOR-2, after the fix
-- people_directory_seats.paper_state is now
-- identity_paper_state(pp.studio_contact_id, COALESCE(pp.company_id, sc.company_id))
-- over a LEFT JOIN onto the stamped card. probe207 is re-run unchanged, then the
-- OLD expression is computed beside the shipped one on the very same row as the
-- negative control: the old formula still reads `not_on_file` under a Directory
-- row reading `lapsed`, which is what block 23a would catch.
\set ON_ERROR_STOP on
BEGIN;
\echo '--- 1. the record: Dana Kowalski, Northgate Electric, COI lapsed 2026-03-31 ---'
SELECT sc.full_name, sc.company_id,
       public.compliance_state(sc.id)                    AS her_own_paper,
       public.compliance_state(sc.company_id)            AS her_firm_paper,
       public.identity_paper_state(sc.id, sc.company_id) AS identity_paper
  FROM public.studio_contacts sc WHERE sc.full_name = 'Dana Kowalski';

SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
\echo '--- 2. the shipped inline add on her own number, no rolodex pick ---'
INSERT INTO public.project_parties
  (project_id, party_kind, display_name, company_name, trade, phone, email,
   sms_consent_status, studio_contact_id, show_to_client)
VALUES ('d0e00000-0000-0000-0000-00000000000a','sub','Dana Kowalski','Northgate Electric',
        'electrical','+16125550111', NULL,'not_asked', NULL, false)
RETURNING id, studio_contact_id, company_id, company_name;

\echo '--- 3. the identity row, and every seat line beneath it (AFTER the fix) ---'
SELECT display_name, seat_count, paper_state AS row_paper FROM public.people_directory
 WHERE display_name = 'Dana Kowalski';
SELECT s.project_name, s.studio_contact_id IS NOT NULL AS stamped,
       s.company_id IS NOT NULL AS seat_has_company, s.paper_state AS seat_paper
  FROM public.people_directory_seats s
  JOIN public.people_directory d ON d.person_id = s.person_id
 WHERE d.display_name = 'Dana Kowalski' ORDER BY 1, 3;

\echo '--- 4. NEGATIVE CONTROL: the OLD expression on the same rows ---'
SELECT pj.name AS project_name,
       pp.company_id IS NOT NULL                                       AS seat_has_company,
       public.identity_paper_state(pp.studio_contact_id, pp.company_id) AS old_word,
       public.identity_paper_state(pp.studio_contact_id,
         COALESCE(pp.company_id, sc.company_id))                        AS shipped_word
  FROM public.project_parties pp
  JOIN public.projects pj ON pj.id = pp.project_id
  LEFT JOIN public.studio_contacts sc ON sc.id = pp.studio_contact_id
 WHERE pp.display_name = 'Dana Kowalski'
 ORDER BY 1, 2;

\echo '--- 5. crm-model §5: a seat that names its OWN firm keeps that firm''s word ---'
RESET role;
INSERT INTO public.studio_contacts
  (organization_id, entity_kind, contact_kind, company_name, created_by)
VALUES ('b0000000-0000-0000-0000-000000000001','company','trade','R13 Paperless Firm',
        'a0000000-0000-0000-0000-000000000004');
UPDATE public.project_parties
   SET company_id = (SELECT id FROM public.studio_contacts WHERE company_name='R13 Paperless Firm')
 WHERE display_name = 'Dana Kowalski'
   AND project_id = 'd0e00000-0000-0000-0000-00000000000a'
   AND company_id IS NULL;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
SELECT s.project_name, s.company_id IS NOT NULL AS seat_has_company,
       s.paper_state AS seat_paper,
       (SELECT paper_state FROM public.people_directory d WHERE d.person_id = s.person_id) AS row_paper
  FROM public.people_directory_seats s
  JOIN public.people_directory d ON d.person_id = s.person_id
 WHERE d.display_name = 'Dana Kowalski' ORDER BY 1, 2;
ROLLBACK;
