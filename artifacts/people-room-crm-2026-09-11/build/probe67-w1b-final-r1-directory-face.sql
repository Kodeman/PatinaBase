\pset pager off
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';

\echo '=== A. what directory-view.tsx renders (role <> contact) after 00626 ==='
SELECT role, count(*) FROM people_directory WHERE role <> 'contact' GROUP BY 1 ORDER BY 1;

\echo '=== B. what the SIX-BRANCH view would have rendered for the same seats ==='
SELECT pp.party_kind AS role_before, count(*) AS rows_before
  FROM project_parties pp JOIN projects pj ON pj.id = pp.project_id
 WHERE pp.party_kind IN ('gc','sub','installer','receiver','architect','photographer','stager')
   AND ( public.is_studio_comember(pj.designer_id)
      OR public.is_studio_comember(pj.lead_designer_id)
      OR public.is_studio_comember(pj.created_by) )
 GROUP BY 1 ORDER BY 1;

\echo '=== C. the room head count ==='
SELECT count(*) AS head_count_all_rows,
       count(*) FILTER (WHERE role <> 'contact') AS rows_the_feed_renders
  FROM people_directory;

\echo '=== D. contact_rule_summary, every recorded rule ==='
SELECT COALESCE(sc.full_name, sc.company_name) AS subject, r.subject_type,
       public.contact_rule_summary(r.subject_type, r.subject_id) AS line
  FROM studio_contact_rules r LEFT JOIN studio_contacts sc ON sc.id = r.subject_id
 ORDER BY 1;

\echo '=== E. the appended columns, in place and typed ==='
SELECT a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) AS typ
  FROM pg_attribute a
 WHERE a.attrelid='public.people_directory'::regclass AND a.attnum > 0 AND NOT a.attisdropped
 ORDER BY a.attnum;
ROLLBACK;

\echo '=== F. can a member move a seat to a project in ANOTHER studio? ==='
BEGIN;
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
                        raw_app_meta_data, raw_user_meta_data, aud, role)
VALUES ('ee000000-0000-0000-0000-0000000000a1','other@example.test','x',now(),now(),now(),
        '{"provider":"email","providers":["email"]}','{}','authenticated','authenticated');
INSERT INTO organizations (id, name, slug, type) VALUES ('ee000000-0000-0000-0000-0000000000c1','Other Studio','other-studio','design_studio');
INSERT INTO organization_members (organization_id, user_id, role, status)
VALUES ('ee000000-0000-0000-0000-0000000000c1','ee000000-0000-0000-0000-0000000000a1','owner','active');
INSERT INTO projects (id, name, designer_id, studio_id, status, created_by)
VALUES ('ee000000-0000-0000-0000-0000000000d1','Other job','ee000000-0000-0000-0000-0000000000a1','ee000000-0000-0000-0000-0000000000c1','active','ee000000-0000-0000-0000-0000000000a1');
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
SELECT count(*) AS rows_moved FROM (
  UPDATE project_parties SET project_id='ee000000-0000-0000-0000-0000000000d1'
   WHERE display_name='Pete Rusk' AND project_id='d0e00000-0000-0000-0000-00000000000b'
   RETURNING 1) x;
ROLLBACK;

\echo '=== G. the dual predicate: a project co-member who is NOT an active member of the card''s studio ==='
SELECT 'is_studio_comember reaches a designer through ANY shared org; the contacts branch needs active membership of the CARD''s org' AS note;
