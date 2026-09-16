-- probe68 — negative controls for the five w1b final-review r1 MAJOR findings,
-- run against the local DB after the fixes (127.0.0.1:54322 only).
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f <this file>
-- Every section is a rolled-back transaction over probe OBJECTS; the seeded
-- ledger is never written.
\pset pager off

\echo '=== A. MAJOR-4: the walked laundering, as a plain studio MEMBER ==='
\echo '--- F-11 Northgate Electric: coi_gl lapsed 2026-03-31, w9 undated ---'
BEGIN;
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES ('dd000000-0000-0000-0000-0000000000a1','plainmember@example.test','x',now(),now(),now(),
        '{"provider":"email","providers":["email"]}','{}','authenticated','authenticated');
INSERT INTO organization_members (organization_id, user_id, role, status)
VALUES ('b0000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-0000000000a1','member','active');
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
SELECT display_name, paper_state AS paper_before
  FROM people_directory WHERE display_name = 'Northgate Electric';
\echo '-- point the lapsed COI at the firm undated W-9 (expect refused)'
SAVEPOINT s1;
UPDATE studio_compliance_documents
   SET superseded_by = 'd0e50000-0000-0000-0000-000000000007'
 WHERE id = 'd0e50000-0000-0000-0000-000000000006';
ROLLBACK TO s1;
SELECT display_name, paper_state AS paper_after_the_attempt
  FROM people_directory WHERE display_name = 'Northgate Electric';
\echo '-- and a GENUINE renewal by the same member still lands'
RESET role;
INSERT INTO studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
VALUES ('dd000000-0000-0000-0000-0000000000e1','b0000000-0000-0000-0000-000000000001','company',
        'd0e20000-0000-0000-0000-000000000003','coi_gl', CURRENT_DATE + 365, '{site_access,draw}');
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
UPDATE studio_compliance_documents
   SET superseded_by = 'dd000000-0000-0000-0000-0000000000e1'
 WHERE id = 'd0e50000-0000-0000-0000-000000000006';
SELECT display_name, paper_state AS paper_after_a_real_renewal
  FROM people_directory WHERE display_name = 'Northgate Electric';
ROLLBACK;

\echo '=== B. MAJOR-4: a shorter-dated successor of the same paper is refused ==='
BEGIN;
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, created_by)
VALUES ('dd000000-0000-0000-0000-0000000000c1','b0000000-0000-0000-0000-000000000001','company','sub','Shortdate Ltd','a0000000-0000-0000-0000-000000000004');
INSERT INTO studio_compliance_documents (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
VALUES ('dd000000-0000-0000-0000-0000000000c2','b0000000-0000-0000-0000-000000000001','company','dd000000-0000-0000-0000-0000000000c1','coi_gl', CURRENT_DATE - 1,  '{site_access}'),
       ('dd000000-0000-0000-0000-0000000000c3','b0000000-0000-0000-0000-000000000001','company','dd000000-0000-0000-0000-0000000000c1','coi_gl', CURRENT_DATE - 30, '{site_access}');
SAVEPOINT s2;
UPDATE studio_compliance_documents SET superseded_by='dd000000-0000-0000-0000-0000000000c3'
 WHERE id='dd000000-0000-0000-0000-0000000000c2';
ROLLBACK TO s2;
SELECT public.compliance_state('dd000000-0000-0000-0000-0000000000c1') AS word_after_the_attempt;
ROLLBACK;

\echo '=== C. MAJOR-3: a gate is what makes a date a word ==='
BEGIN;
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, created_by)
VALUES ('dd000000-0000-0000-0000-0000000000d1','b0000000-0000-0000-0000-000000000001','company','sub','Gateless Ltd','a0000000-0000-0000-0000-000000000004');
INSERT INTO studio_compliance_documents (id, organization_id, holder_type, holder_id, doc_type, doc_label, expires_on, blocks)
VALUES ('dd000000-0000-0000-0000-0000000000d2','b0000000-0000-0000-0000-000000000001','company','dd000000-0000-0000-0000-0000000000d1','other_named','a training card', CURRENT_DATE - 1, '{}');
INSERT INTO studio_compliance_documents (organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
VALUES ('b0000000-0000-0000-0000-000000000001','company','dd000000-0000-0000-0000-0000000000d1','coi_gl', CURRENT_DATE + 200, ARRAY['site_access','payment','draw']);
SELECT public.compliance_state('dd000000-0000-0000-0000-0000000000d1') AS word_with_a_gateless_lapse;
UPDATE studio_compliance_documents SET blocks = '{payment}'
 WHERE id = 'dd000000-0000-0000-0000-0000000000d2';
SELECT public.compliance_state('dd000000-0000-0000-0000-0000000000d1') AS word_once_that_paper_holds_a_gate;
\echo '-- and no paper at all is still a different fact'
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, company_name, created_by)
VALUES ('dd000000-0000-0000-0000-0000000000d9','b0000000-0000-0000-0000-000000000001','company','sub','No Paper Ltd','a0000000-0000-0000-0000-000000000004');
SELECT public.compliance_state('dd000000-0000-0000-0000-0000000000d9') AS a_card_with_no_paper;
ROLLBACK;

\echo '=== D. MAJOR-1: a closed window mints a LIVE link and revokes nothing on behalf of a dead one ==='
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
DO $$
DECLARE v_id uuid; t record; e timestamptz; v_prior uuid; v_st text; n integer;
BEGIN
  INSERT INTO project_parties (project_id, party_kind, display_name, phone, phone_e164,
                               stage, on_site_from, on_site_to, off_job_at)
  VALUES ('d0e00000-0000-0000-0000-00000000000a','sub','Off Job Ollie','+16125557702','+16125557702',
          'off_job', CURRENT_DATE - 90, CURRENT_DATE - 30, now())
  RETURNING id INTO v_id;
  INSERT INTO field_link_tokens (party_id, project_id, token_hash, expires_at, status)
  VALUES (v_id,'d0e00000-0000-0000-0000-00000000000a', repeat('b',64), now() + interval '45 days','active')
  RETURNING id INTO v_prior;
  SELECT * INTO t FROM public.create_field_link(v_id);
  SELECT expires_at INTO e FROM field_link_tokens WHERE id = t.id;
  SELECT status INTO v_st FROM field_link_tokens WHERE id = v_prior;
  SELECT count(*) INTO n FROM field_link_tokens WHERE party_id = v_id AND status = 'active';
  RAISE NOTICE 'window closed % .. % | minted expiry = % (dead: %) | prior token: % | active tokens: %',
    CURRENT_DATE - 90, CURRENT_DATE - 30, e, (e <= now()), v_st, n;
  RAISE NOTICE 'reach_state_for = % (was on_paper before the fix)', public.reach_state_for(NULL,NULL,v_id);
  SELECT * INTO t FROM public.create_field_link(v_id, now() - interval '1 day');
  SELECT expires_at INTO e FROM field_link_tokens WHERE id = t.id;
  RAISE NOTICE 'a caller date in the past: minted expiry = % (dead: %)', e, (e <= now());
END $$;
ROLLBACK;

\echo '=== E. MAJOR-2: one winner, so a row nests what it claims ==='
BEGIN;
ALTER TABLE project_parties DISABLE TRIGGER set_updated_at_project_parties;
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, phone_e164, updated_at)
VALUES ('11111111-0000-0000-0000-00000000aaaa','d0e00000-0000-0000-0000-00000000000a','sub','Zeb Mixedkind','+16125559901','+16125559901', now() - interval '9 days'),
       ('11111111-0000-0000-0000-00000000bbbb','b0000000-0000-0000-0000-00000000c0d1','vendor','Zeb Mixedkind','+16125559901','+16125559901', now());
ALTER TABLE project_parties ENABLE TRIGGER set_updated_at_project_parties;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
SELECT d.person_id AS dir_person, d.role, d.seat_count AS claims, count(s.seat_id) AS nests
  FROM people_directory d LEFT JOIN people_directory_seats s ON s.person_id = d.person_id
 WHERE d.display_name = 'Zeb Mixedkind' GROUP BY 1,2,3;
\echo '-- and the invariant over EVERY visible Directory row'
SELECT count(*) AS rows_claiming_a_count_they_cannot_nest
  FROM people_directory pd
 WHERE pd.seat_count > 0
   AND pd.seat_count <> (SELECT count(*) FROM people_directory_seats s WHERE s.person_id = pd.person_id);
ROLLBACK;

\echo '=== F. MAJOR-5: the shipped Directory face is UNCHANGED — the sequencing constraint is real ==='
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
\echo '-- what directory-view.tsx:294 renders (role <> contact)'
SELECT role, count(*) FROM people_directory WHERE role <> 'contact' GROUP BY role ORDER BY role;
SELECT (SELECT count(*) FROM people_directory) AS head_count_all_rows,
       (SELECT count(*) FROM people_directory WHERE role <> 'contact') AS rows_the_feed_renders;
ROLLBACK;
