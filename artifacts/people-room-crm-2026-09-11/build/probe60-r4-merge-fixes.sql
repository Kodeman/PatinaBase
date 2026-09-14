-- r4 fixes: B-1 (the login and the address), B-2 (a block may not vanish),
-- M-1 (the sole-proprietor fold's document order), M-3 (the agreement
-- pointers). Self-contained; ROLLBACKs. Probe objects only, never the ledger.
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 \
--     -f artifacts/people-room-crm-2026-09-11/build/probe60-r4-merge-fixes.sql
BEGIN;

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('a6000000-0000-4000-8000-000000000001', 'probe60@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
       ('a6000000-0000-4000-8000-000000000002', 'probe60b@test.invalid', '', NOW(), NOW(), NOW(),
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('a6000000-0000-4000-8000-000000000001', 'probe60@test.invalid', 'Probe Sixty', NOW(), NOW()),
       ('a6000000-0000-4000-8000-000000000002', 'probe60b@test.invalid', 'Probe Sixty B', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
INSERT INTO organizations (id, type, name, slug, status, created_at, updated_at)
VALUES ('b6000000-0000-4000-8000-000000000001', 'design_studio', 'Probe60 Studio', 'probe60-studio', 'active', NOW(), NOW());
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at, created_at, updated_at)
VALUES ('a6000000-0000-4000-8000-000000000001', 'b6000000-0000-4000-8000-000000000001', 'owner', 'active', NOW(), NOW(), NOW());
INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at)
VALUES ('d6000000-0000-4000-8000-000000000001', 'Probe60 job', 'a6000000-0000-4000-8000-000000000001',
        'b6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', 'active', NOW(), NOW());

-- ═══════════════════════════════════════════════════════════════════════════
-- B-1 · the older card survives; the newer one holds the login and the address
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name,
                             email, profile_id, created_by, created_at, updated_at)
VALUES
  ('c6000000-0000-4000-8000-00000000000a', 'b6000000-0000-4000-8000-000000000001', 'person', 'client_rep',
   'Chidi Old',  NULL, NULL, 'a6000000-0000-4000-8000-000000000001', '2024-01-01', NOW()),
  ('c6000000-0000-4000-8000-00000000000b', 'b6000000-0000-4000-8000-000000000001', 'person', 'client_rep',
   'Chidi New',  'chidi@example.invalid', 'a6000000-0000-4000-8000-000000000002',
   'a6000000-0000-4000-8000-000000000001', '2025-01-01', NOW());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','a6000000-0000-4000-8000-000000000001','role','authenticated')::text, true);

\echo '=== B-1 --- BEFORE: the Directory row for the card that holds the login ==='
SELECT display_name, reach_state, email FROM people_directory
 WHERE person_id IN ('c6000000-0000-4000-8000-00000000000a','c6000000-0000-4000-8000-00000000000b')
 ORDER BY display_name;

SELECT public.merge_studio_contacts(
  'c6000000-0000-4000-8000-00000000000a',
  'c6000000-0000-4000-8000-00000000000b', 'phone') AS b1_survivor;

\echo '=== B-1 --- AFTER: one row, and it still says Account ==='
SELECT display_name, reach_state, email, profile_id FROM people_directory
 WHERE person_id IN ('c6000000-0000-4000-8000-00000000000a','c6000000-0000-4000-8000-00000000000b')
 ORDER BY display_name;

-- ── B-1 negative control: two DIFFERENT logins refuse ──────────────────────
RESET ROLE;
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name,
                             profile_id, created_by, created_at, updated_at)
VALUES
  ('c6000000-0000-4000-8000-00000000001a', 'b6000000-0000-4000-8000-000000000001', 'person', 'sub',
   'Two Logins A', 'a6000000-0000-4000-8000-000000000001', 'a6000000-0000-4000-8000-000000000001', '2024-02-01', NOW()),
  ('c6000000-0000-4000-8000-00000000001b', 'b6000000-0000-4000-8000-000000000001', 'person', 'sub',
   'Two Logins B', 'a6000000-0000-4000-8000-000000000002', 'a6000000-0000-4000-8000-000000000001', '2025-02-01', NOW());
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','a6000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
DO $$
BEGIN
  PERFORM public.merge_studio_contacts(
    'c6000000-0000-4000-8000-00000000001a','c6000000-0000-4000-8000-00000000001b','manual');
  RAISE NOTICE 'B-1 NEGATIVE CONTROL: NOT REFUSED (wrong)';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'B-1 negative control refused: %', SQLERRM;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- B-2 · a do-not-contact block on the absorbed card
-- ═══════════════════════════════════════════════════════════════════════════
RESET ROLE;
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name,
                             created_by, created_at, updated_at)
VALUES
  ('c6000000-0000-4000-8000-00000000002a', 'b6000000-0000-4000-8000-000000000001', 'person', 'sub',
   'Frank Survivor', 'a6000000-0000-4000-8000-000000000001', '2024-03-01', NOW()),
  ('c6000000-0000-4000-8000-00000000002b', 'b6000000-0000-4000-8000-000000000001', 'person', 'sub',
   'Frank Duplicate', 'a6000000-0000-4000-8000-000000000001', '2025-03-01', NOW()),
  ('c6000000-0000-4000-8000-00000000002c', 'b6000000-0000-4000-8000-000000000001', 'person', 'sub',
   'Rosa Delgado', 'a6000000-0000-4000-8000-000000000001', '2024-03-01', NOW());
INSERT INTO studio_contact_rules (subject_type, subject_id, channels_allowed, channels_forbidden, set_by)
VALUES ('person', 'c6000000-0000-4000-8000-00000000002a', ARRAY['email','mobile'], '{}',
        'a6000000-0000-4000-8000-000000000001');
INSERT INTO studio_contact_rules (subject_type, subject_id, channels_forbidden, route_to_person_id, reason, set_by)
VALUES ('person', 'c6000000-0000-4000-8000-00000000002b',
        ARRAY['sms','mobile','office','email','dispatch','after_hours'],
        'c6000000-0000-4000-8000-00000000002c', 'Do not contact directly. Write Rosa instead.',
        'a6000000-0000-4000-8000-000000000001');

\echo '=== B-2 --- the two rules the merge is asked to fold ==='
SELECT public.contact_rule_summary('person','c6000000-0000-4000-8000-00000000002a') AS survivor_rule,
       public.contact_rule_summary('person','c6000000-0000-4000-8000-00000000002b') AS duplicate_rule;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','a6000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
DO $$
BEGIN
  PERFORM public.merge_studio_contacts(
    'c6000000-0000-4000-8000-00000000002a','c6000000-0000-4000-8000-00000000002b','phone');
  RAISE NOTICE 'B-2: MERGED (the block would have vanished — wrong)';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'B-2 refused: %', SQLERRM;
END $$;

\echo '=== B-2 --- the block is still where the studio recorded it ==='
SELECT public.contact_rule_summary('person','c6000000-0000-4000-8000-00000000002b') AS duplicate_rule_after;

-- ── B-2 negative control A: the survivor also blocks → the merge proceeds ──
RESET ROLE;
UPDATE studio_contact_rules
   SET channels_forbidden = ARRAY['sms','mobile','office','email']
 WHERE subject_id = 'c6000000-0000-4000-8000-00000000002a';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','a6000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
SELECT public.merge_studio_contacts(
  'c6000000-0000-4000-8000-00000000002a','c6000000-0000-4000-8000-00000000002b','phone')
  AS b2_control_a_both_block_merges;

-- ── B-2 negative control B: a one-channel rule is not a block (R-BL) ───────
RESET ROLE;
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name,
                             created_by, created_at, updated_at)
VALUES
  ('c6000000-0000-4000-8000-00000000003a', 'b6000000-0000-4000-8000-000000000001', 'person', 'sub',
   'Ray Survivor', 'a6000000-0000-4000-8000-000000000001', '2024-04-01', NOW()),
  ('c6000000-0000-4000-8000-00000000003b', 'b6000000-0000-4000-8000-000000000001', 'person', 'sub',
   'Ray Duplicate', 'a6000000-0000-4000-8000-000000000001', '2025-04-01', NOW());
INSERT INTO studio_contact_rules (subject_type, subject_id, channels_allowed, channels_forbidden, set_by)
VALUES ('person', 'c6000000-0000-4000-8000-00000000003a', ARRAY['email'], '{}',
        'a6000000-0000-4000-8000-000000000001'),
       ('person', 'c6000000-0000-4000-8000-00000000003b', ARRAY['email','office'], ARRAY['sms'],
        'a6000000-0000-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','a6000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
SELECT public.merge_studio_contacts(
  'c6000000-0000-4000-8000-00000000003a','c6000000-0000-4000-8000-00000000003b','phone')
  AS b2_control_b_never_text_merges;

-- ═══════════════════════════════════════════════════════════════════════════
-- M-1 · the sole-proprietor fold, with a renewed certificate behind it
-- ═══════════════════════════════════════════════════════════════════════════
RESET ROLE;
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name,
                             company_name, is_sole_proprietor, created_by, created_at, updated_at)
VALUES
  ('c6000000-0000-4000-8000-00000000004a', 'b6000000-0000-4000-8000-000000000001', 'person', 'sub',
   'Dana Kowalski', NULL, true, 'a6000000-0000-4000-8000-000000000001', '2024-05-01', NOW());
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, company_name,
                             created_by, created_at, updated_at)
VALUES
  ('c6000000-0000-4000-8000-00000000004b', 'b6000000-0000-4000-8000-000000000001', 'company', 'sub',
   'Kowalski Electric', 'a6000000-0000-4000-8000-000000000001', '2024-05-01', NOW());

-- A three-deep chain on the FIRM card, written the way a book writes one: the
-- original, then its renewal retiring it, then the renewal's renewal. Two
-- retired rows behind one head is what the single unordered UPDATE could not
-- move in a safe order.
INSERT INTO studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, issued_on, expires_on, blocks)
VALUES
  ('f6000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001','company',
   'c6000000-0000-4000-8000-00000000004b','coi_gl','2023-01-01','2027-01-01', ARRAY['site_access']);
INSERT INTO studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, issued_on, expires_on, blocks)
VALUES
  ('f6000000-0000-4000-8000-000000000002','b6000000-0000-4000-8000-000000000001','company',
   'c6000000-0000-4000-8000-00000000004b','coi_gl','2024-01-01','2028-01-01', ARRAY['site_access']);
UPDATE studio_compliance_documents SET superseded_by = 'f6000000-0000-4000-8000-000000000002'
 WHERE id = 'f6000000-0000-4000-8000-000000000001';
INSERT INTO studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, issued_on, expires_on, blocks)
VALUES
  ('f6000000-0000-4000-8000-000000000003','b6000000-0000-4000-8000-000000000001','company',
   'c6000000-0000-4000-8000-00000000004b','coi_gl','2025-01-01','2099-01-01', ARRAY['site_access']);
UPDATE studio_compliance_documents SET superseded_by = 'f6000000-0000-4000-8000-000000000003'
 WHERE id = 'f6000000-0000-4000-8000-000000000002';

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','a6000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
DO $$
BEGIN
  PERFORM public.merge_studio_contacts(
    'c6000000-0000-4000-8000-00000000004a','c6000000-0000-4000-8000-00000000004b','company_name');
  RAISE NOTICE 'M-1: MERGE OK';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'M-1: MERGE FAILED: %', SQLERRM;
END $$;

RESET ROLE;
\echo '=== M-1 --- every certificate on the person, holder_type rewritten ==='
SELECT id, holder_type, holder_id = 'c6000000-0000-4000-8000-00000000004a' AS on_the_person, superseded_by
  FROM studio_compliance_documents
 WHERE id IN ('f6000000-0000-4000-8000-000000000001','f6000000-0000-4000-8000-000000000002',
              'f6000000-0000-4000-8000-000000000003')
 ORDER BY id;

-- ═══════════════════════════════════════════════════════════════════════════
-- M-3 · the trade agreement's card pointers
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, company_name,
                             created_by, created_at, updated_at)
VALUES
  ('c6000000-0000-4000-8000-00000000005a', 'b6000000-0000-4000-8000-000000000001', 'company', 'sub',
   'Ostrom Builders', 'a6000000-0000-4000-8000-000000000001', '2024-06-01', NOW()),
  ('c6000000-0000-4000-8000-00000000005b', 'b6000000-0000-4000-8000-000000000001', 'company', 'sub',
   'Ostrom Builders LLC', 'a6000000-0000-4000-8000-000000000001', '2025-06-01', NOW());

INSERT INTO studio_trade_agreements
  (id, project_id, studio_id, contact_id, contact_display_name, title, scope, price_cents, state, created_by)
VALUES
  ('06000000-0000-4000-8000-000000000001','d6000000-0000-4000-8000-000000000001',
   'b6000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-00000000005b',
   'Ostrom Builders LLC','Framing','Frame the addition',500000,'draft',
   'a6000000-0000-4000-8000-000000000001'),
  ('06000000-0000-4000-8000-000000000002','d6000000-0000-4000-8000-000000000001',
   'b6000000-0000-4000-8000-000000000001','c6000000-0000-4000-8000-00000000005b',
   'Ostrom Builders LLC','Siding','Side the addition',300000,'sent',
   'a6000000-0000-4000-8000-000000000001');
INSERT INTO studio_trade_agreement_tokens (id, agreement_id, contact_id, token_hash, status, created_by)
VALUES ('06000000-0000-4000-8000-00000000000a','06000000-0000-4000-8000-000000000002',
        'c6000000-0000-4000-8000-00000000005b', repeat('a',64), 'active',
        'a6000000-0000-4000-8000-000000000001');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub','a6000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
DO $$
BEGIN
  PERFORM public.merge_studio_contacts(
    'c6000000-0000-4000-8000-00000000005a','c6000000-0000-4000-8000-00000000005b','company_name');
  RAISE NOTICE 'M-3: MERGE OK (a sent agreement did not abort it)';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'M-3: MERGE FAILED: %', SQLERRM;
END $$;

RESET ROLE;
\echo '=== M-3 --- the LIVE link now keys on the survivor ==='
SELECT id, contact_id = 'c6000000-0000-4000-8000-00000000005a' AS on_the_survivor, status
  FROM studio_trade_agreement_tokens WHERE id = '06000000-0000-4000-8000-00000000000a';
\echo '=== M-3 --- the draft moved; the SENT agreement kept its frozen pointer ==='
SELECT state, contact_id = 'c6000000-0000-4000-8000-00000000005a' AS on_the_survivor
  FROM studio_trade_agreements
 WHERE id IN ('06000000-0000-4000-8000-000000000001','06000000-0000-4000-8000-000000000002')
 ORDER BY state;
\echo '=== M-3 --- and the agreement_link grant the company card reads ==='
SELECT tier, subject_id = 'c6000000-0000-4000-8000-00000000005a' AS subject_is_survivor
  FROM public.access_grants_trade_agreement_links();

ROLLBACK;
