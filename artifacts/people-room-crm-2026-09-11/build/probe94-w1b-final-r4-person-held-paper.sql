\set ON_ERROR_STOP on
BEGIN;
-- a PLAIN member (role 'member', not admin/owner), so no PR-n privilege is in play
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, aud, role)
VALUES ('a0000000-0000-0000-0000-0000000000f1','plain_member@patina.dev','x',now(),'authenticated','authenticated')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email, full_name)
VALUES ('a0000000-0000-0000-0000-0000000000f1','plain_member@patina.dev','Plain Member')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-0000000000f1','member','active');

SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-0000000000f1","role":"authenticated"}', true);
SELECT public.is_active_studio_member('b0000000-0000-0000-0000-000000000001') AS member,
       public.is_org_admin_or_owner('b0000000-0000-0000-0000-000000000001')   AS admin;

\echo '=== B0: Luis Ochoa, as the shipped readers print him today ==='
SELECT display_name, paper_state, seat_count FROM public.people_directory
 WHERE person_id='d0e10000-0000-0000-0000-000000000009';
SELECT display_name, project_name, paper_state FROM public.people_directory_seats
 WHERE person_id='d0e10000-0000-0000-0000-000000000009';

\echo '=== B1: the honest act — the OSHA card expired last month ==='
UPDATE public.studio_compliance_documents SET expires_on = CURRENT_DATE - 30
 WHERE id='d0e50000-0000-0000-0000-000000000036';
SELECT display_name, paper_state FROM public.people_directory
 WHERE person_id='d0e10000-0000-0000-0000-000000000009';
SELECT display_name, project_name, paper_state FROM public.people_directory_seats
 WHERE person_id='d0e10000-0000-0000-0000-000000000009';

\echo '=== B2: the launder — an UNDATED other_named successor carrying the same gate ==='
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, doc_label, expires_on, blocks)
VALUES ('dd000000-0000-4000-8000-0000000000b2','b0000000-0000-0000-0000-000000000001',
        'person','d0e10000-0000-0000-0000-000000000009','other_named','OSHA 30 card',
        NULL, ARRAY['site_access']::text[]);
UPDATE public.studio_compliance_documents
   SET superseded_by='dd000000-0000-4000-8000-0000000000b2'
 WHERE id='d0e50000-0000-0000-0000-000000000036';

\echo '=== B3: what the two shipped readers print now, over an expired gate still on file ==='
SELECT display_name, paper_state FROM public.people_directory
 WHERE person_id='d0e10000-0000-0000-0000-000000000009';
SELECT display_name, project_name, paper_state FROM public.people_directory_seats
 WHERE person_id='d0e10000-0000-0000-0000-000000000009';
SELECT id, doc_type, doc_label, expires_on, blocks, superseded_by IS NOT NULL AS retired
  FROM public.studio_compliance_documents
 WHERE holder_id='d0e10000-0000-0000-0000-000000000009';
ROLLBACK;
\set ON_ERROR_STOP on
BEGIN;
\echo '=== C1: the honest record — Luis Ochoa personal OSHA card gating site_access, EXPIRED ==='
UPDATE public.studio_compliance_documents SET expires_on = CURRENT_DATE - 30
 WHERE id='d0e50000-0000-0000-0000-000000000036';
SELECT public.compliance_state('d0e10000-0000-0000-0000-000000000009') AS his_own_card_word,
       public.compliance_state('d0e20000-0000-0000-0000-000000000001') AS his_firm_word;

SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
\echo '=== C2: what the two shipped readers print for him ==='
SELECT display_name, paper_state FROM public.people_directory
 WHERE person_id='d0e10000-0000-0000-0000-000000000009';
SELECT display_name, project_name, paper_state FROM public.people_directory_seats
 WHERE person_id='d0e10000-0000-0000-0000-000000000009';
\echo '=== C3: and a sole proprietor (no company_id) with the same expired card, as a control ==='
ROLLBACK;

BEGIN;
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, full_name, contact_kind, created_by)
VALUES ('cc000000-0000-4000-8000-0000000000c3','b0000000-0000-0000-0000-000000000001',
        'person','Sole Prop Sam','trade','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.studio_compliance_documents
  (organization_id, holder_type, holder_id, doc_type, doc_label, expires_on, blocks)
VALUES ('b0000000-0000-0000-0000-000000000001','person','cc000000-0000-4000-8000-0000000000c3',
        'other_named','OSHA 30 card', CURRENT_DATE - 30, ARRAY['site_access']::text[]);
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
SELECT display_name, paper_state FROM public.people_directory
 WHERE person_id='cc000000-0000-4000-8000-0000000000c3';
ROLLBACK;
