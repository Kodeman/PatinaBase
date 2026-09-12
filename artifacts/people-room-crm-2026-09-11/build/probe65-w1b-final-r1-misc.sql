\pset pager off
\echo '=== A. is_studio_comember vs is_active_studio_member bodies ==='
SELECT p.proname, pg_get_functiondef(p.oid) AS def
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('is_studio_comember','is_active_studio_member');

\echo '=== B. PR-n: can a plain MEMBER escalate a non-money grant into money? ==='
BEGIN;
-- give a plain member a seat on an Alpha project
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES ('dd000000-0000-0000-0000-0000000000a1','plainmember@example.test','x',now(),now(),now(),
        '{"provider":"email","providers":["email"]}','{}','authenticated','authenticated');
INSERT INTO profiles (id, email, full_name) VALUES ('dd000000-0000-0000-0000-0000000000a1','plainmember@example.test','Plain Member')
ON CONFLICT (id) DO NOTHING;
INSERT INTO organization_members (organization_id, user_id, role, status)
VALUES ('b0000000-0000-0000-0000-000000000001','dd000000-0000-0000-0000-0000000000a1','member','active');
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"dd000000-0000-0000-0000-0000000000a1","role":"authenticated"}';
\echo '-- B1 member inserts a selections grant (expect: lands)'
INSERT INTO project_party_authority (id, engagement_id, scope)
SELECT 'dd000000-0000-0000-0000-0000000000b1', pp.id, 'selections'
  FROM project_parties pp WHERE pp.project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1;
\echo '-- B2 member UPDATEs that grant to scope=money (expect: refused)'
UPDATE project_party_authority SET scope='money', threshold_cents=99999999
 WHERE id='dd000000-0000-0000-0000-0000000000b1';
\echo '-- B3 member inserts scope=change_order with a huge threshold (PR-n permits the scope)'
INSERT INTO project_party_authority (engagement_id, scope, threshold_cents)
SELECT pp.id, 'change_order', 500000000 FROM project_parties pp
 WHERE pp.project_id='d0e00000-0000-0000-0000-00000000000a' LIMIT 1;
\echo '-- B4 member DELETEs an existing MONEY grant (expect: refused / 0 rows)'
DELETE FROM project_party_authority WHERE scope='money';
\echo '-- B5 what the member can read'
SELECT count(*) AS grants_readable FROM project_party_authority;
ROLLBACK;

\echo '=== C. v_access_grants as a plain member vs the owner ==='
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
SELECT tier, count(*) FROM v_access_grants GROUP BY 1 ORDER BY 1;
ROLLBACK;

\echo '=== D. create_field_link on an off_job seat whose warranty has also passed ==='
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
SELECT pp.display_name, pp.stage, pp.on_site_to, pp.warranty_until,
       (SELECT expires_at FROM field_link_tokens f WHERE f.id = (SELECT id FROM public.create_field_link(pp.id))) AS minted_expiry,
       now() AS now
  FROM project_parties pp
 WHERE pp.project_id='d0e00000-0000-0000-0000-00000000000b'
   AND pp.on_site_to IS NOT NULL
 ORDER BY pp.display_name;
ROLLBACK;

\echo '=== E. timing: the rebuilt view ==='
\timing on
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
SELECT count(*) FROM people_directory;
SELECT count(*) FROM people_directory_seats;
SELECT count(*) FROM v_access_grants;
ROLLBACK;
\timing off

\echo '=== F. people_directory grants after a fresh reset ==='
SELECT c.relname, has_table_privilege('anon', c.oid, 'SELECT') AS anon_sel,
       has_table_privilege('authenticated', c.oid, 'SELECT') AS auth_sel
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('people_directory','people_directory_seats','v_access_grants',
   'studio_compliance_documents','project_party_authority','project_site_access_cards');
