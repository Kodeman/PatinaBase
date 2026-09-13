-- w1b final review r13 · MAJOR-2
-- people_directory_seats.paper_state is identity_paper_state(studio_contact_id,
-- pp.company_id) — the SEAT's firm pointer. The shipped inline add writes
-- company_name as TEXT and never company_id (use-coordination.ts:500-512), and
-- 00626 §1b now stamps that seat with the person's card. So the seat line reads
-- `not_on_file` while the identity row above it — identity_paper_state(card,
-- studio_contacts.company_id) — reads `lapsed` off the same record.
\set ON_ERROR_STOP on
BEGIN;
\echo '--- 1. the record: Dana Kowalski, Northgate Electric, COI lapsed 2026-03-31 ---'
SELECT sc.full_name, sc.company_id,
       public.compliance_state(sc.id)                    AS her_own_paper,
       public.compliance_state(sc.company_id)            AS her_firm_paper,
       public.identity_paper_state(sc.id, sc.company_id) AS identity_paper
  FROM public.studio_contacts sc WHERE sc.full_name = 'Dana Kowalski';
SELECT doc_type, expires_on, blocks FROM public.studio_compliance_documents
 WHERE holder_id = (SELECT company_id FROM public.studio_contacts WHERE full_name='Dana Kowalski');

SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
\echo '--- 2. the shipped inline add on her own number, no rolodex pick ---'
INSERT INTO public.project_parties
  (project_id, party_kind, display_name, company_name, trade, phone, email,
   sms_consent_status, studio_contact_id, show_to_client)
VALUES ('d0e00000-0000-0000-0000-00000000000a','sub','Dana Kowalski','Northgate Electric',
        'electrical','+16125550111', NULL,'not_asked', NULL, false)
RETURNING id, studio_contact_id, company_id, company_name;

\echo '--- 3. the identity row, and every seat line beneath it ---'
SELECT display_name, seat_count, paper_state AS row_paper FROM public.people_directory
 WHERE display_name = 'Dana Kowalski';
SELECT s.project_name, s.studio_contact_id IS NOT NULL AS stamped,
       s.company_id IS NOT NULL AS seat_has_company, s.paper_state AS seat_paper
  FROM public.people_directory_seats s
  JOIN public.people_directory d ON d.person_id = s.person_id
 WHERE d.display_name = 'Dana Kowalski' ORDER BY 1, 3;
ROLLBACK;
