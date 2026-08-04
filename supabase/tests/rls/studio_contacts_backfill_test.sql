-- ═══════════════════════════════════════════════════════════════════════════
-- Studio contacts backfill tests — migration 00418
--   fold_legacy_contacts_into_studios()
--
-- Fixtures: ONE studio, TWO designers who both saved the SAME maker, the SAME
-- human recorded as a party on both designers' projects (different casing,
-- differently punctuated phone), a vendor-linked party for a maker nobody
-- saved, a GUEST seat with a saved maker, and an orphan project whose designer
-- belongs to no studio.
--
-- Asserts:
--   A. one company card per (org, vendor) — the double-save collapses, and the
--      EARLIEST saver is recorded as created_by; specialties seed from
--      vendors.primary_category.
--   B. a vendor-linked party seeds a company card for a maker nobody saved
--      (pass B), preferring the name the project wrote down.
--   C. one person card per (org, lower(trim(name)), phone_e164) — the same
--      human on two projects collapses, and the LATEST-updated party row wins
--      email / trade / kind.
--   D. company_id links the vendor rep's person card to their company card.
--   E. every folded party carries studio_contact_id; the orphan project's party
--      (no resolvable org) carries NULL and seeds nothing.
--   F. a GUEST seat's saved maker is NOT folded.
--   G. IDEMPOTENCY — calling fold a second time in the same transaction leaves
--      every count identical (org-scoped AND global).
--   H. MERGES NEED EVIDENCE — two DISTINCT humans sharing a display_name, both
--      with NULL phone AND NULL email, on two projects of one studio, stay TWO
--      cards, and each party links to its OWN card. (A name is not evidence;
--      the R5 owner review archives a real duplicate, but a wrong merge welds
--      two people's history together irreversibly.)
--   H2. …and the email IS evidence: same name, same non-NULL email, NULL
--      phones → ONE card, both parties on it.
--   I. ORG RESOLUTION THROUGH A GUEST SEAT — a designer holding an EARLIER
--      guest seat in studio X and a later active member seat in studio Y folds
--      into Y. (Resolving the primary studio first and re-checking non-guest
--      afterwards would surface X and then drop the designer entirely.)
--
-- Runs entirely as postgres (the fold is service_role-only and writes across
-- studios); RLS is not the subject here — studio_contacts_test.sql covers that.
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/rls/studio_contacts_backfill_test.sql
--
-- Transaction-wrapped + ROLLBACK — rerunnable, no side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('bf000000-0000-4000-8000-000000000001', 'bf-des1@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bf000000-0000-4000-8000-000000000002', 'bf-des2@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bf000000-0000-4000-8000-000000000003', 'bf-orphan@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('bf000000-0000-4000-8000-000000000004', 'bf-guest@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  -- H / H2: owner of a SECOND studio, so the new person fixtures cannot move
  -- the card counts case C asserts on the first studio.
  ('bf000000-0000-4000-8000-000000000005', 'bf-des3@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  -- I: guest in one studio, real member in another.
  ('bf000000-0000-4000-8000-000000000006', 'bf-des4@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('bf000000-0000-4000-8000-000000000001', 'bf-des1@test.invalid',   'BF Designer One', NOW(), NOW()),
  ('bf000000-0000-4000-8000-000000000002', 'bf-des2@test.invalid',   'BF Designer Two', NOW(), NOW()),
  ('bf000000-0000-4000-8000-000000000003', 'bf-orphan@test.invalid', 'BF Orphan',       NOW(), NOW()),
  ('bf000000-0000-4000-8000-000000000004', 'bf-guest@test.invalid',  'BF Guest',        NOW(), NOW()),
  ('bf000000-0000-4000-8000-000000000005', 'bf-des3@test.invalid',   'BF Designer Three', NOW(), NOW()),
  ('bf000000-0000-4000-8000-000000000006', 'bf-des4@test.invalid',   'BF Designer Four',  NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES
  ('bf000000-0000-4000-8000-0000000000a1', 'design_studio', 'BF Studio',        'bf-studio-test'),
  -- H / H2 live here, isolated from a1's counts.
  ('bf000000-0000-4000-8000-0000000000a2', 'design_studio', 'BF Studio Two',    'bf-studio-two-test'),
  -- I: X (the guest seat) and Y (the real seat). BOTH are design_studio orgs —
  -- that is the point: X is a perfectly valid resolution target by every rule
  -- EXCEPT role, so only a resolver that excludes guests up front reaches Y.
  ('bf000000-0000-4000-8000-0000000000a3', 'design_studio', 'BF Studio Guesty', 'bf-studio-guesty-test'),
  ('bf000000-0000-4000-8000-0000000000a4', 'design_studio', 'BF Studio Real',   'bf-studio-real-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('bf000000-0000-4000-8000-0000000000c1', 'bf000000-0000-4000-8000-000000000001', 'bf000000-0000-4000-8000-0000000000a1', 'owner',  'active', NOW() - INTERVAL '30 days'),
  ('bf000000-0000-4000-8000-0000000000c2', 'bf000000-0000-4000-8000-000000000002', 'bf000000-0000-4000-8000-0000000000a1', 'member', 'active', NOW() - INTERVAL '20 days'),
  ('bf000000-0000-4000-8000-0000000000c4', 'bf000000-0000-4000-8000-000000000004', 'bf000000-0000-4000-8000-0000000000a1', 'guest',  'active', NOW() - INTERVAL '10 days'),
  ('bf000000-0000-4000-8000-0000000000c5', 'bf000000-0000-4000-8000-000000000005', 'bf000000-0000-4000-8000-0000000000a2', 'owner',  'active', NOW() - INTERVAL '25 days'),
  -- I: the guest seat is EARLIER and neither seat is owner, so joined_at order
  -- puts X first for any resolver that does not filter on role.
  ('bf000000-0000-4000-8000-0000000000c6', 'bf000000-0000-4000-8000-000000000006', 'bf000000-0000-4000-8000-0000000000a3', 'guest',  'active', NOW() - INTERVAL '40 days'),
  ('bf000000-0000-4000-8000-0000000000c7', 'bf000000-0000-4000-8000-000000000006', 'bf000000-0000-4000-8000-0000000000a4', 'member', 'active', NOW() - INTERVAL '5 days');

-- d1 saved by BOTH designers · d2 saved by one · d3 never saved (party only)
-- d4 saved only by the guest seat.
INSERT INTO vendors (id, name, primary_category)
VALUES
  ('bf000000-0000-4000-8000-0000000000d1', 'BF Maker One',   'lighting'),
  ('bf000000-0000-4000-8000-0000000000d2', 'BF Maker Two',   'textiles'),
  ('bf000000-0000-4000-8000-0000000000d3', 'BF Maker Three', NULL),
  ('bf000000-0000-4000-8000-0000000000d4', 'BF Maker Four',  'rugs'),
  -- I: saved by the designer whose ordering-first seat is a guest seat.
  ('bf000000-0000-4000-8000-0000000000d5', 'BF Maker Five',  'stone');

INSERT INTO saved_vendors (id, designer_id, vendor_id, saved_at)
VALUES
  -- Designer TWO saved d1 first → she is the earliest saver, not the owner.
  ('bf000000-0000-4000-8000-0000000000f1', 'bf000000-0000-4000-8000-000000000002', 'bf000000-0000-4000-8000-0000000000d1', NOW() - INTERVAL '10 days'),
  ('bf000000-0000-4000-8000-0000000000f2', 'bf000000-0000-4000-8000-000000000001', 'bf000000-0000-4000-8000-0000000000d1', NOW() - INTERVAL '2 days'),
  ('bf000000-0000-4000-8000-0000000000f3', 'bf000000-0000-4000-8000-000000000001', 'bf000000-0000-4000-8000-0000000000d2', NOW() - INTERVAL '5 days'),
  -- Guest seat: must NOT seed the studio book.
  ('bf000000-0000-4000-8000-0000000000f4', 'bf000000-0000-4000-8000-000000000004', 'bf000000-0000-4000-8000-0000000000d4', NOW() - INTERVAL '3 days'),
  -- I: must land in the REAL seat's studio (a4), not the guest studio (a3),
  -- and must not be dropped.
  ('bf000000-0000-4000-8000-0000000000f5', 'bf000000-0000-4000-8000-000000000006', 'bf000000-0000-4000-8000-0000000000d5', NOW() - INTERVAL '3 days');

INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES
  ('bf000000-0000-4000-8000-0000000000e1', 'BF Project One', 'bf000000-0000-4000-8000-000000000001', 'bf000000-0000-4000-8000-000000000001', 'bf000000-0000-4000-8000-0000000000a1'),
  ('bf000000-0000-4000-8000-0000000000e2', 'BF Project Two', 'bf000000-0000-4000-8000-000000000002', 'bf000000-0000-4000-8000-000000000002', 'bf000000-0000-4000-8000-0000000000a1');

-- Orphan project: its designer belongs to NO design_studio, so the 00317
-- trigger leaves studio_id NULL and the fold must skip its parties entirely.
INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('bf000000-0000-4000-8000-0000000000e3', 'BF Orphan Project', 'bf000000-0000-4000-8000-000000000003', 'bf000000-0000-4000-8000-000000000003');

-- Same human, two projects, different casing + punctuation. The LATER-updated
-- row (b2, on Designer Two's project) must win email / trade / kind.
INSERT INTO project_parties (id, project_id, party_kind, display_name, email, phone, trade, created_by, created_at, updated_at)
VALUES
  ('bf000000-0000-4000-8000-0000000000b1', 'bf000000-0000-4000-8000-0000000000e1', 'sub', 'Sal Sub',   'old@test.invalid', '(555) 123-4567', 'plumbing',   'bf000000-0000-4000-8000-000000000001', NOW() - INTERVAL '9 days', NOW() - INTERVAL '9 days'),
  ('bf000000-0000-4000-8000-0000000000b2', 'bf000000-0000-4000-8000-0000000000e2', 'sub', '  sal sub ', 'new@test.invalid', '555-123-4567',   'electrical', 'bf000000-0000-4000-8000-000000000002', NOW() - INTERVAL '4 days', NOW() - INTERVAL '1 day');

-- Vendor rep for a maker nobody saved (pass B seeds the company card; pass C
-- seeds the person and hangs them off it).
INSERT INTO project_parties (id, project_id, party_kind, display_name, company_name, vendor_id, created_by, created_at, updated_at)
VALUES
  ('bf000000-0000-4000-8000-0000000000b3', 'bf000000-0000-4000-8000-0000000000e1', 'vendor', 'Vera Rep', 'Third Co (as we call them)', 'bf000000-0000-4000-8000-0000000000d3', 'bf000000-0000-4000-8000-000000000001', NOW() - INTERVAL '8 days', NOW() - INTERVAL '8 days');

-- Orphan-project party: no resolvable org → no card, no lineage stamp.
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, created_by)
VALUES
  ('bf000000-0000-4000-8000-0000000000b4', 'bf000000-0000-4000-8000-0000000000e3', 'gc', 'Orphan Gary', '5559998888', 'bf000000-0000-4000-8000-000000000003');

-- ─── H / H2 fixtures — studio TWO's projects ───────────────────────────────
-- A second studio, so these rows cannot move the counts cases A–G assert on a1.
INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES
  ('bf000000-0000-4000-8000-0000000000e4', 'BF2 Project One', 'bf000000-0000-4000-8000-000000000005', 'bf000000-0000-4000-8000-000000000005', 'bf000000-0000-4000-8000-0000000000a2'),
  ('bf000000-0000-4000-8000-0000000000e5', 'BF2 Project Two', 'bf000000-0000-4000-8000-000000000005', 'bf000000-0000-4000-8000-000000000005', 'bf000000-0000-4000-8000-0000000000a2');

-- H: two DIFFERENT humans who happen to share a name. No phone, no email —
-- nothing in the data says they are one person, so nothing may merge them.
INSERT INTO project_parties (id, project_id, party_kind, display_name, trade, created_by, created_at, updated_at)
VALUES
  ('bf000000-0000-4000-8000-0000000000b5', 'bf000000-0000-4000-8000-0000000000e4', 'gc', 'Chris Crew', 'framing', 'bf000000-0000-4000-8000-000000000005', NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days'),
  ('bf000000-0000-4000-8000-0000000000b6', 'bf000000-0000-4000-8000-0000000000e5', 'gc', 'Chris Crew', 'roofing', 'bf000000-0000-4000-8000-000000000005', NOW() - INTERVAL '6 days', NOW() - INTERVAL '6 days');

-- H2: same name (different casing), same email (different casing), no phones.
-- The EMAIL is the evidence → one card, and the later-updated row wins trade.
INSERT INTO project_parties (id, project_id, party_kind, display_name, email, trade, created_by, created_at, updated_at)
VALUES
  ('bf000000-0000-4000-8000-0000000000b7', 'bf000000-0000-4000-8000-0000000000e4', 'installer', 'Dana Dup', 'dana@test.invalid', 'tile',     'bf000000-0000-4000-8000-000000000005', NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days'),
  ('bf000000-0000-4000-8000-0000000000b8', 'bf000000-0000-4000-8000-0000000000e5', 'installer', 'dana dup', 'Dana@Test.Invalid', 'millwork', 'bf000000-0000-4000-8000-000000000005', NOW() - INTERVAL '6 days', NOW() - INTERVAL '2 days');

-- ═══════════════════════════════════════════════════════════════════════════
-- Run the fold.
-- ═══════════════════════════════════════════════════════════════════════════
SELECT public.fold_legacy_contacts_into_studios();

DO $$
DECLARE
  v_org        CONSTANT uuid := 'bf000000-0000-4000-8000-0000000000a1';
  v_count      INTEGER;
  v_id         uuid;
  v_company_id uuid;
  v_text       TEXT;
  v_kind       TEXT;
  v_arr        TEXT[];
BEGIN
  -- ── A: one company card per (org, vendor); earliest saver wins created_by ──
  SELECT count(*) INTO v_count FROM studio_contacts
   WHERE organization_id = v_org AND entity_kind = 'company';
  ASSERT v_count = 3,
    'FAIL A: expected 3 company cards (d1 saved twice, d2 saved once, d3 party-only), got ' || v_count;

  SELECT id, created_by, company_name, specialties
    INTO v_id, v_company_id, v_text, v_arr
    FROM studio_contacts
   WHERE organization_id = v_org AND vendor_id = 'bf000000-0000-4000-8000-0000000000d1';
  ASSERT v_id IS NOT NULL, 'FAIL A2: no company card for the double-saved maker';
  ASSERT v_company_id = 'bf000000-0000-4000-8000-000000000002',
    'FAIL A3: created_by should be the EARLIEST saver (designer two), got ' || COALESCE(v_company_id::text, 'NULL');
  ASSERT v_text = 'BF Maker One', 'FAIL A4: company_name should come from vendors.name, got ' || COALESCE(v_text, 'NULL');
  ASSERT v_arr = ARRAY['lighting'], 'FAIL A5: specialties should seed from primary_category, got ' || COALESCE(v_arr::text, 'NULL');

  -- Vendor with a NULL primary_category → empty specialties, never NULL.
  SELECT specialties INTO v_arr FROM studio_contacts
   WHERE organization_id = v_org AND vendor_id = 'bf000000-0000-4000-8000-0000000000d3';
  ASSERT v_arr = '{}'::text[], 'FAIL A6: a NULL primary_category should yield {}, got ' || COALESCE(v_arr::text, 'NULL');

  -- ── B: pass B seeded the never-saved maker, project-preferred name ────────
  SELECT company_name INTO v_text FROM studio_contacts
   WHERE organization_id = v_org AND vendor_id = 'bf000000-0000-4000-8000-0000000000d3';
  ASSERT v_text = 'Third Co (as we call them)',
    'FAIL B: pass B should prefer the party''s company_name, got ' || COALESCE(v_text, 'NULL');

  -- ── F: the guest seat's saved maker was NOT folded ────────────────────────
  SELECT count(*) INTO v_count FROM studio_contacts
   WHERE vendor_id = 'bf000000-0000-4000-8000-0000000000d4';
  ASSERT v_count = 0, 'FAIL F: a guest seat''s saved maker must not seed any studio book, got ' || v_count;

  -- ── C: one person card per dedupe key; latest-updated wins the details ────
  SELECT count(*) INTO v_count FROM studio_contacts
   WHERE organization_id = v_org AND entity_kind = 'person';
  ASSERT v_count = 2, 'FAIL C: expected 2 person cards (Sal + Vera), got ' || v_count;

  SELECT id, email, specialties, contact_kind
    INTO v_id, v_text, v_arr, v_kind
    FROM studio_contacts
   WHERE organization_id = v_org AND entity_kind = 'person' AND lower(btrim(full_name)) = 'sal sub';
  ASSERT v_id IS NOT NULL, 'FAIL C2: no person card for the twice-recorded human';
  ASSERT v_text = 'new@test.invalid',
    'FAIL C3: latest-updated party should win email, got ' || COALESCE(v_text, 'NULL');
  ASSERT v_arr = ARRAY['electrical'],
    'FAIL C4: latest-updated party should win trade, got ' || COALESCE(v_arr::text, 'NULL');
  ASSERT v_kind = 'sub',
    'FAIL C4b: contact_kind should carry the party_kind, got ' || COALESCE(v_kind, 'NULL');

  SELECT phone_e164 INTO v_text FROM studio_contacts WHERE id = v_id;
  ASSERT v_text = '+15551234567',
    'FAIL C5: the person card should carry the normalized phone, got ' || COALESCE(v_text, 'NULL');

  -- No vendor_id on a person card (it would collide with the company card on
  -- the 00417 partial unique index).
  SELECT count(*) INTO v_count FROM studio_contacts
   WHERE organization_id = v_org AND entity_kind = 'person' AND vendor_id IS NOT NULL;
  ASSERT v_count = 0, 'FAIL C6: person cards must not carry vendor_id, got ' || v_count;

  -- ── D: the vendor rep hangs off their company card ────────────────────────
  SELECT company_id INTO v_company_id FROM studio_contacts
   WHERE organization_id = v_org AND entity_kind = 'person' AND full_name = 'Vera Rep';
  SELECT id INTO v_id FROM studio_contacts
   WHERE organization_id = v_org AND vendor_id = 'bf000000-0000-4000-8000-0000000000d3';
  ASSERT v_company_id = v_id,
    'FAIL D: Vera''s company_id should be the d3 company card, got ' || COALESCE(v_company_id::text, 'NULL');

  -- Sal has no vendor → no company.
  SELECT company_id INTO v_company_id FROM studio_contacts
   WHERE organization_id = v_org AND entity_kind = 'person' AND lower(btrim(full_name)) = 'sal sub';
  ASSERT v_company_id IS NULL, 'FAIL D2: a vendor-less person should have NULL company_id';

  -- ── E: lineage stamped on the folded parties, NULL on the orphan ──────────
  SELECT id INTO v_id FROM studio_contacts
   WHERE organization_id = v_org AND entity_kind = 'person' AND lower(btrim(full_name)) = 'sal sub';
  SELECT count(*) INTO v_count FROM project_parties
   WHERE id IN ('bf000000-0000-4000-8000-0000000000b1', 'bf000000-0000-4000-8000-0000000000b2')
     AND studio_contact_id = v_id;
  ASSERT v_count = 2, 'FAIL E: both Sal party rows should point at the one person card, got ' || v_count;

  SELECT studio_contact_id INTO v_company_id FROM project_parties
   WHERE id = 'bf000000-0000-4000-8000-0000000000b3';
  SELECT id INTO v_id FROM studio_contacts
   WHERE organization_id = v_org AND entity_kind = 'person' AND full_name = 'Vera Rep';
  ASSERT v_company_id = v_id,
    'FAIL E2: the vendor-rep party should link to their PERSON card, got ' || COALESCE(v_company_id::text, 'NULL');

  SELECT studio_contact_id INTO v_company_id FROM project_parties
   WHERE id = 'bf000000-0000-4000-8000-0000000000b4';
  ASSERT v_company_id IS NULL,
    'FAIL E3: a party on a studio-less project must stay unlinked, got ' || COALESCE(v_company_id::text, 'NULL');

  SELECT count(*) INTO v_count FROM studio_contacts
   WHERE lower(btrim(COALESCE(full_name, ''))) = 'orphan gary';
  ASSERT v_count = 0, 'FAIL E4: a party on a studio-less project must seed no card, got ' || v_count;

  -- The snapshot stays on the party row: editing the card must not be needed
  -- for the party to keep its own name (lineage, not a live join).
  SELECT display_name INTO v_text FROM project_parties WHERE id = 'bf000000-0000-4000-8000-0000000000b1';
  ASSERT v_text = 'Sal Sub', 'FAIL E5: the party row keeps its own snapshotted name, got ' || COALESCE(v_text, 'NULL');

  RAISE NOTICE 'studio_contacts_backfill: cases A–F passed.';
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- H / H2 / I — merges need evidence, and org resolution must see past a guest
-- seat. These are the two ways the fold can silently CORRUPT rather than merely
-- miss: welding two humans onto one card, and dropping a designer's whole book.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_org2    CONSTANT uuid := 'bf000000-0000-4000-8000-0000000000a2';
  v_orgX    CONSTANT uuid := 'bf000000-0000-4000-8000-0000000000a3';  -- guest seat
  v_orgY    CONSTANT uuid := 'bf000000-0000-4000-8000-0000000000a4';  -- real seat
  v_count   INTEGER;
  v_b5_card uuid;
  v_b6_card uuid;
  v_b7_card uuid;
  v_b8_card uuid;
  v_id      uuid;
  v_arr     TEXT[];
BEGIN
  -- ── H: a shared NAME with no phone and no email is NOT evidence ───────────
  SELECT count(*) INTO v_count FROM studio_contacts
   WHERE organization_id = v_org2
     AND entity_kind     = 'person'
     AND lower(btrim(full_name)) = 'chris crew';
  ASSERT v_count = 2,
    'FAIL H: two same-named people with NULL phone AND NULL email must stay TWO cards, got ' || v_count;

  SELECT studio_contact_id INTO v_b5_card FROM project_parties WHERE id = 'bf000000-0000-4000-8000-0000000000b5';
  SELECT studio_contact_id INTO v_b6_card FROM project_parties WHERE id = 'bf000000-0000-4000-8000-0000000000b6';
  ASSERT v_b5_card IS NOT NULL AND v_b6_card IS NOT NULL,
    'FAIL H2a: both evidence-free parties must still be stamped with lineage';
  ASSERT v_b5_card <> v_b6_card,
    'FAIL H2b: each evidence-free party must link to its OWN card, both got ' || v_b5_card::text;

  -- …and each stamp points at a real Chris card in this studio (not a stray).
  SELECT count(*) INTO v_count FROM studio_contacts
   WHERE id IN (v_b5_card, v_b6_card)
     AND organization_id = v_org2
     AND entity_kind     = 'person'
     AND lower(btrim(full_name)) = 'chris crew';
  ASSERT v_count = 2,
    'FAIL H2c: both stamps should resolve to Chris person cards in studio two, got ' || v_count;

  -- ── H2: a shared non-NULL EMAIL *is* evidence → one card ──────────────────
  SELECT count(*) INTO v_count FROM studio_contacts
   WHERE organization_id = v_org2
     AND entity_kind     = 'person'
     AND lower(btrim(full_name)) = 'dana dup';
  ASSERT v_count = 1,
    'FAIL H2: same name + same email (NULL phones) should merge to ONE card, got ' || v_count;

  SELECT studio_contact_id INTO v_b7_card FROM project_parties WHERE id = 'bf000000-0000-4000-8000-0000000000b7';
  SELECT studio_contact_id INTO v_b8_card FROM project_parties WHERE id = 'bf000000-0000-4000-8000-0000000000b8';
  ASSERT v_b7_card IS NOT NULL AND v_b7_card = v_b8_card,
    'FAIL H2d: both email-matched parties must link to the SAME card, got ' ||
    COALESCE(v_b7_card::text, 'NULL') || ' / ' || COALESCE(v_b8_card::text, 'NULL');

  SELECT specialties INTO v_arr FROM studio_contacts WHERE id = v_b7_card;
  ASSERT v_arr = ARRAY['millwork'],
    'FAIL H2e: the latest-updated party should still win the trade, got ' || COALESCE(v_arr::text, 'NULL');

  -- Studio two holds exactly these three person cards — no stray merge, no
  -- stray split.
  SELECT count(*) INTO v_count FROM studio_contacts
   WHERE organization_id = v_org2 AND entity_kind = 'person';
  ASSERT v_count = 3,
    'FAIL H3: studio two should hold 3 person cards (2 Chris + 1 Dana), got ' || v_count;

  -- ── I: an earlier GUEST seat must not shadow a later real seat ────────────
  SELECT count(*) INTO v_count FROM studio_contacts WHERE organization_id = v_orgX;
  ASSERT v_count = 0,
    'FAIL I: the guest-seat studio must receive nothing, got ' || v_count;

  SELECT id INTO v_id FROM studio_contacts
   WHERE organization_id = v_orgY
     AND entity_kind     = 'company'
     AND vendor_id       = 'bf000000-0000-4000-8000-0000000000d5';
  ASSERT v_id IS NOT NULL,
    'FAIL I2: the saved maker must fold into the studio where the designer holds a REAL seat';

  SELECT count(*) INTO v_count FROM studio_contacts WHERE organization_id = v_orgY;
  ASSERT v_count = 1,
    'FAIL I3: the real-seat studio should hold exactly the one company card, got ' || v_count;

  RAISE NOTICE 'studio_contacts_backfill: cases H, H2, I passed.';
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- G. IDEMPOTENCY — a second fold in the same transaction changes nothing.
--
-- This also guards the 'party:' discriminator specifically: the evidence-free
-- Chris cards (H) can only survive a re-run if the key reproduces itself from
-- the party row's id, since there is no phone or email to find them by.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_org        CONSTANT uuid := 'bf000000-0000-4000-8000-0000000000a1';
  v_org_before INTEGER;
  v_all_before INTEGER;
  v_lnk_before INTEGER;
  v_org_after  INTEGER;
  v_all_after  INTEGER;
  v_lnk_after  INTEGER;
BEGIN
  SELECT count(*) INTO v_org_before FROM studio_contacts WHERE organization_id = v_org;
  SELECT count(*) INTO v_all_before FROM studio_contacts;
  SELECT count(*) INTO v_lnk_before FROM project_parties WHERE studio_contact_id IS NOT NULL;

  PERFORM public.fold_legacy_contacts_into_studios();
  PERFORM public.fold_legacy_contacts_into_studios();

  SELECT count(*) INTO v_org_after FROM studio_contacts WHERE organization_id = v_org;
  SELECT count(*) INTO v_all_after FROM studio_contacts;
  SELECT count(*) INTO v_lnk_after FROM project_parties WHERE studio_contact_id IS NOT NULL;

  ASSERT v_org_after = v_org_before,
    'FAIL G: re-running the fold changed the studio''s card count ' || v_org_before || ' → ' || v_org_after;
  ASSERT v_all_after = v_all_before,
    'FAIL G2: re-running the fold changed the GLOBAL card count ' || v_all_before || ' → ' || v_all_after;
  ASSERT v_lnk_after = v_lnk_before,
    'FAIL G3: re-running the fold changed the linked-party count ' || v_lnk_before || ' → ' || v_lnk_after;

  RAISE NOTICE 'studio_contacts_backfill: case G (idempotency, 2 extra runs) passed.';
  RAISE NOTICE 'All studio_contacts_backfill assertions passed.';
END
$$;

ROLLBACK;
