-- ═══════════════════════════════════════════════════════════════════════════
-- W3 round-6 fix probe — B-1, M-1, M-2, M-3, M-4 (00629), all in one
-- transaction, ROLLBACKed. Re-measures exactly what the r6 migration review
-- measured (/tmp/claude/w3r6/pA,pB,pC,pF,pG.sql) against the fixed file.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f artifacts/people-room-crm-2026-09-11/build/probe-w3-r6-fix.sql
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

INSERT INTO public.organizations (id, type, name, slug, status) VALUES
  ('f6000000-0000-4000-8000-00000000000a', 'design_studio', 'R6 Fix Studio', 'r6-fix-studio', 'active');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at) VALUES
  ('a0000000-0000-0000-0000-000000000004', 'f6000000-0000-4000-8000-00000000000a', 'owner', 'active', now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role = 'owner', status = 'active';

-- ───────────────────────────────────────────────────────────────────────────
-- B-1 · the channel union reduces worst-first instead of deleting
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, created_by, created_at) VALUES
  ('f6100000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-00000000000a','person','sub','F Older',  'a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f6100000-0000-4000-8000-000000000002','f6000000-0000-4000-8000-00000000000a','person','sub','F Newer',  'a0000000-0000-0000-0000-000000000004','2026-01-01');

INSERT INTO public.studio_contact_channels
  (owner_type, owner_id, channel_kind, value, status, status_at, verified, verified_at, preferred, label) VALUES
  ('person','f6100000-0000-4000-8000-000000000001','email','dana@example.invalid','active',      NULL,        false, NULL,         false, NULL),
  ('person','f6100000-0000-4000-8000-000000000002','email','dana@example.invalid','unsubscribed','2025-12-03', true,'2025-11-01', true, 'Shop address');

SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
SELECT public.merge_studio_contacts(
  'f6100000-0000-4000-8000-000000000001','f6100000-0000-4000-8000-000000000002','email') AS "B-1 merge (older survives, PR-o default)";
SELECT pg_temp.reset_role();

\echo '--- B-1 · survivor email row after the fold (was: active / unverified / no label / 0 rows kept) ---'
SELECT status, status_at::date, verified, verified_at::date, preferred, label
  FROM public.studio_contact_channels
 WHERE owner_id = 'f6100000-0000-4000-8000-000000000001' AND channel_kind = 'email';

\echo '--- B-1 · rows left on the folded card (expected 0: the duplicate is reduced then dropped) ---'
SELECT count(*) AS rows_on_folded_card
  FROM public.studio_contact_channels WHERE owner_id = 'f6100000-0000-4000-8000-000000000002';

-- B-1 negative control: the survivor's own WORSE status is not overwritten by
-- an absorbed 'active', and its own label wins.
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, created_by, created_at) VALUES
  ('f6100000-0000-4000-8000-000000000003','f6000000-0000-4000-8000-00000000000a','person','sub','F Held Older','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f6100000-0000-4000-8000-000000000004','f6000000-0000-4000-8000-00000000000a','person','sub','F Live Newer','a0000000-0000-0000-0000-000000000004','2026-01-01');
INSERT INTO public.studio_contact_channels
  (owner_type, owner_id, channel_kind, value, status, status_at, verified, verified_at, preferred, label) VALUES
  ('person','f6100000-0000-4000-8000-000000000003','email','held@example.invalid','unsubscribed','2025-01-05', false, NULL,        false,'Survivor label'),
  ('person','f6100000-0000-4000-8000-000000000004','email','held@example.invalid','active',       NULL,        true,'2026-02-02', true, 'Absorbed label');

SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
SELECT public.merge_studio_contacts(
  'f6100000-0000-4000-8000-000000000003','f6100000-0000-4000-8000-000000000004','email') AS "B-1 negative control";
SELECT pg_temp.reset_role();

\echo '--- B-1 negative control · the refusal stands, verified/preferred are OR''d up, the survivor''s label wins ---'
SELECT status, status_at::date, verified, verified_at::date, preferred, label
  FROM public.studio_contact_channels
 WHERE owner_id = 'f6100000-0000-4000-8000-000000000003' AND channel_kind = 'email';

-- ───────────────────────────────────────────────────────────────────────────
-- M-1 · a rule that routes at the other card of the pair
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, created_by, created_at) VALUES
  -- A: absorbed routes at survivor, survivor has no rule
  ('f6200000-0000-4000-8000-00000000000a','f6000000-0000-4000-8000-00000000000a','person','sub','A Survivor','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f6200000-0000-4000-8000-00000000000b','f6000000-0000-4000-8000-00000000000a','person','sub','A Absorbed','a0000000-0000-0000-0000-000000000004','2026-01-01'),
  -- C: survivor routes at absorbed, absorbed has no rule
  ('f6200000-0000-4000-8000-00000000000c','f6000000-0000-4000-8000-00000000000a','person','sub','C Survivor','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f6200000-0000-4000-8000-00000000000d','f6000000-0000-4000-8000-00000000000a','person','sub','C Absorbed','a0000000-0000-0000-0000-000000000004','2026-01-01'),
  -- D: both carry rules and the absorbed one routes at the survivor
  ('f6200000-0000-4000-8000-00000000000e','f6000000-0000-4000-8000-00000000000a','person','sub','D Survivor','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f6200000-0000-4000-8000-00000000000f','f6000000-0000-4000-8000-00000000000a','person','sub','D Absorbed','a0000000-0000-0000-0000-000000000004','2026-01-01'),
  -- N: negative control — the absorbed rule forbids a channel the survivor's does not
  ('f6200000-0000-4000-8000-000000000010','f6000000-0000-4000-8000-00000000000a','person','sub','N Survivor','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f6200000-0000-4000-8000-000000000011','f6000000-0000-4000-8000-00000000000a','person','sub','N Absorbed','a0000000-0000-0000-0000-000000000004','2026-01-01');

INSERT INTO public.studio_contact_rules
  (subject_type, subject_id, channels_forbidden, route_to_person_id, reason, set_by) VALUES
  ('person','f6200000-0000-4000-8000-00000000000b', ARRAY['sms','email'], 'f6200000-0000-4000-8000-00000000000a','This card is the old one.','a0000000-0000-0000-0000-000000000004'),
  ('person','f6200000-0000-4000-8000-00000000000c', ARRAY['sms'],         'f6200000-0000-4000-8000-00000000000d','Write the other one.',     'a0000000-0000-0000-0000-000000000004'),
  ('person','f6200000-0000-4000-8000-00000000000f', ARRAY['sms'],         'f6200000-0000-4000-8000-00000000000e','This card is the old one.','a0000000-0000-0000-0000-000000000004'),
  ('person','f6200000-0000-4000-8000-00000000000e', ARRAY['sms','email'], NULL,                                  'Never text, never email.', 'a0000000-0000-0000-0000-000000000004'),
  ('person','f6200000-0000-4000-8000-000000000011', ARRAY['office'],      NULL,                                  'Never ring the office.',   'a0000000-0000-0000-0000-000000000004'),
  ('person','f6200000-0000-4000-8000-000000000010', ARRAY['sms'],         NULL,                                  'Never text.',              'a0000000-0000-0000-0000-000000000004');

SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
SELECT public.merge_studio_contacts('f6200000-0000-4000-8000-00000000000a','f6200000-0000-4000-8000-00000000000b','phone') AS "M-1 A (was: ABORTED rule_route_is_self)";
SELECT public.merge_studio_contacts('f6200000-0000-4000-8000-00000000000c','f6200000-0000-4000-8000-00000000000d','phone') AS "M-1 C (was: ABORTED rule_route_is_self)";
SELECT public.merge_studio_contacts('f6200000-0000-4000-8000-00000000000e','f6200000-0000-4000-8000-00000000000f','phone') AS "M-1 D (was: merge_contact_rule_conflict, and the named repair was itself refused)";
SELECT pg_temp.reset_role();

\echo '--- M-1 · the rules on the three survivors after the fold ---'
SELECT r.subject_id, r.channels_forbidden, r.route_to_person_id, r.reason
  FROM public.studio_contact_rules r
 WHERE r.subject_id IN ('f6200000-0000-4000-8000-00000000000a',
                        'f6200000-0000-4000-8000-00000000000c',
                        'f6200000-0000-4000-8000-00000000000e')
 ORDER BY r.subject_id;

\echo '--- M-1 negative control · a forbidden channel the survivor does not carry is STILL refused ---'
DO $$
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  BEGIN
    PERFORM public.merge_studio_contacts(
      'f6200000-0000-4000-8000-000000000010','f6200000-0000-4000-8000-000000000011','phone');
    RAISE NOTICE 'M-1 negative control: NOT REFUSED — regression';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'M-1 negative control refused by name: %', SQLERRM;
  END;
  PERFORM pg_temp.reset_role();
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- M-2 · the affiliation collision reduces instead of deleting
-- M-3 · the sole-proprietor fold keeps the rest of the crew
-- M-4 · is_sole_proprietor and vendor_id travel
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, created_by, created_at) VALUES
  ('f6300000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-00000000000a','person','sub','I Older','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f6300000-0000-4000-8000-000000000002','f6000000-0000-4000-8000-00000000000a','person','sub','I Newer','a0000000-0000-0000-0000-000000000004','2026-01-01'),
  ('f6300000-0000-4000-8000-000000000005','f6000000-0000-4000-8000-00000000000a','person','sub','J Owner','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f6300000-0000-4000-8000-000000000006','f6000000-0000-4000-8000-00000000000a','person','sub','J Bookkeeper','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f6300000-0000-4000-8000-000000000007','f6000000-0000-4000-8000-00000000000a','person','sub','E Older','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f6300000-0000-4000-8000-000000000008','f6000000-0000-4000-8000-00000000000a','person','sub','E Newer','a0000000-0000-0000-0000-000000000004','2026-01-01');

INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, company_name, company_kind, created_by, created_at) VALUES
  ('f6300000-0000-4000-8000-000000000003','f6000000-0000-4000-8000-00000000000a','company','sub','I Firm','sub','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f6300000-0000-4000-8000-000000000009','f6000000-0000-4000-8000-00000000000a','company','sub','J Firm','sub','a0000000-0000-0000-0000-000000000004','2024-01-01');

UPDATE public.studio_contacts SET is_sole_proprietor = true
 WHERE id IN ('f6300000-0000-4000-8000-000000000005','f6300000-0000-4000-8000-000000000008');
UPDATE public.studio_contacts SET vendor_id = '11111111-1111-1111-1111-111111111104'
 WHERE id = 'f6300000-0000-4000-8000-000000000008';

INSERT INTO public.studio_person_affiliations
  (person_id, company_id, role_at_firm, is_paperwork_contact, is_signer, holds_trade_license, from_date) VALUES
  ('f6300000-0000-4000-8000-000000000001','f6300000-0000-4000-8000-000000000003', NULL,       false,false,false,'2024-01-01'),
  ('f6300000-0000-4000-8000-000000000002','f6300000-0000-4000-8000-000000000003','Foreman',    true, true, true, '2019-03-01'),
  ('f6300000-0000-4000-8000-000000000005','f6300000-0000-4000-8000-000000000009','Owner',      true, true, true, '2018-01-01'),
  ('f6300000-0000-4000-8000-000000000006','f6300000-0000-4000-8000-000000000009','Bookkeeper', false,false,false,'2021-01-01');

SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
SELECT public.merge_studio_contacts('f6300000-0000-4000-8000-000000000001','f6300000-0000-4000-8000-000000000002','phone') AS "M-2 person merge (older survives)";
SELECT public.merge_studio_contacts('f6300000-0000-4000-8000-000000000005','f6300000-0000-4000-8000-000000000009','company_name') AS "M-3 sole-proprietor fold";
SELECT public.merge_studio_contacts('f6300000-0000-4000-8000-000000000007','f6300000-0000-4000-8000-000000000008','phone') AS "M-4 typed-fact carry (older survives)";
SELECT pg_temp.reset_role();

\echo '--- M-2 · the surviving affiliation (was: role NULL, three booleans false, from_date 2024-01-01) ---'
SELECT role_at_firm, is_paperwork_contact, is_signer, holds_trade_license, from_date, to_date
  FROM public.studio_person_affiliations
 WHERE person_id = 'f6300000-0000-4000-8000-000000000001'
   AND company_id = 'f6300000-0000-4000-8000-000000000003';

\echo '--- M-3 · J Bookkeeper after the fold (was: company_id NULL, 0 affiliations) ---'
SELECT sc.full_name, sc.company_id, a.role_at_firm, a.from_date, a.to_date
  FROM public.studio_contacts sc
  LEFT JOIN public.studio_person_affiliations a
    ON a.person_id = sc.id AND a.company_id = 'f6300000-0000-4000-8000-000000000009'
 WHERE sc.id = 'f6300000-0000-4000-8000-000000000006';

\echo '--- M-3 · and the Directory row still names the firm (company_name COALESCE) ---'
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
SELECT display_name, role, meta->>'company_name' AS company_name
  FROM public.people_directory
 WHERE person_id = 'f6300000-0000-4000-8000-000000000006';
SELECT pg_temp.reset_role();

\echo '--- M-3 · the survivor''s OWN self-affiliation is gone (expected 0) ---'
SELECT count(*) AS self_affiliations
  FROM public.studio_person_affiliations
 WHERE company_id = 'f6300000-0000-4000-8000-000000000009'
   AND person_id  = 'f6300000-0000-4000-8000-000000000005';

\echo '--- M-4 · the survivor after the fold (was: is_sole_proprietor f, vendor_id NULL) ---'
SELECT full_name, is_sole_proprietor, vendor_id
  FROM public.studio_contacts
 WHERE id IN ('f6300000-0000-4000-8000-000000000007','f6300000-0000-4000-8000-000000000008')
 ORDER BY full_name;

ROLLBACK;
