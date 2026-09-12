-- ═══════════════════════════════════════════════════════════════════════════
-- W1b — compliance, authority, the identity directory, the site access card,
--        the access-grant ledger, and the field link's window expiry
--
-- Migrations under test: 00623 (studio_compliance_documents +
-- compliance_state), 00624 (project_parties' stage/window + company pointer,
-- project_party_authority + PR-n), 00625 (project_site_access_cards + PR-w),
-- 00626 (people_directory v4 + people_directory_seats), 00627
-- (v_access_grants + create_field_link's PR-d expiry).
--
-- Blocks 1–2 and 5–8 build their own fixtures. Blocks 3–4 and 9–10 assert
-- against the SEEDED Okonkwo fixture (seed/people_crm_dev.sql), because the
-- brief's acceptance is stated in the fixture's own words — Dana Kowalski's
-- two seats, F-08's field link — and a test that re-invented them would prove
-- the view works on data the room will never hold.
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f supabase/tests/people/w1b_compliance_authority_directory_test.sql
--
-- One transaction, ROLLBACKed. Requires the dev seed (pnpm supabase:reset).
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- ─── helpers (the 00594 W1a test's own shape) ──────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.assume_anon()
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', NULL, true);
  EXECUTE 'SET LOCAL ROLE anon';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_anon() TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ─── scratch fixture for the state and policy blocks ──────────────────────
-- A second studio, so nothing here can read as the seeded one's.
INSERT INTO public.organizations (id, type, name, slug, status) VALUES
  ('f1000000-0000-4000-8000-00000000000a', 'design_studio', 'Test Studio A', 'w1b-studio-a', 'active');

INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at) VALUES
  -- the seed's owner is also this studio's owner, so is_studio_comember() can
  -- resolve the project's designer through a shared membership
  ('a0000000-0000-0000-0000-000000000004', 'f1000000-0000-4000-8000-00000000000a', 'owner',  'active', now()),
  -- and a plain MEMBER, which is what PR-n narrows
  ('a0000000-0000-0000-0000-000000000003', 'f1000000-0000-4000-8000-00000000000a', 'member', 'active', now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role, status = 'active';

INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, company_name, company_kind, created_by) VALUES
  ('f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-00000000000a','company','sub','Four Words Electric','sub','a0000000-0000-0000-0000-000000000004'),
  ('f2000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-00000000000a','company','sub','Undated Paper Co','sub','a0000000-0000-0000-0000-000000000004'),
  ('f2000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-00000000000a','company','lender','No Paper Bank','lender','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, company_id, created_by) VALUES
  ('f2000000-0000-4000-8000-000000000011','f1000000-0000-4000-8000-00000000000a','person','sub','Wire Person','f2000000-0000-4000-8000-000000000001','a0000000-0000-0000-0000-000000000004');

INSERT INTO public.projects
  (id, name, designer_id, studio_id, status, created_by, client_visibility_tier) VALUES
  ('f3000000-0000-4000-8000-00000000000a','W1b test job','a0000000-0000-0000-0000-000000000004','f1000000-0000-4000-8000-00000000000a','active','a0000000-0000-0000-0000-000000000004','full');

INSERT INTO public.project_parties
  (id, project_id, party_kind, display_name, phone, company_id, stage,
   on_site_from, on_site_to, created_by) VALUES
  ('f4000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-00000000000a','sub','Wire Person','(612) 555-0911',
   'f2000000-0000-4000-8000-000000000001','active','2026-11-02','2026-12-18','a0000000-0000-0000-0000-000000000004'),
  ('f4000000-0000-4000-8000-000000000002','f3000000-0000-4000-8000-00000000000a','gc','No Window Person','(612) 555-0912',
   NULL,'active',NULL,NULL,'a0000000-0000-0000-0000-000000000004'),
  ('f4000000-0000-4000-8000-000000000003','f3000000-0000-4000-8000-00000000000a','sub','Warranty Person','(612) 555-0913',
   NULL,'warranty',NULL,NULL,'a0000000-0000-0000-0000-000000000004');
UPDATE public.project_parties SET warranty_until = '2027-06-30'
 WHERE id = 'f4000000-0000-4000-8000-000000000003';

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. compliance_state: four words, and the 30-day window
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  w text;
BEGIN
  -- not_on_file: nothing at all. Distinct from lapsed (C21/R-K).
  w := public.compliance_state('f2000000-0000-4000-8000-000000000003');
  IF w <> 'not_on_file' THEN
    RAISE EXCEPTION '1a expected not_on_file for a card with no paper, got %', w;
  END IF;
  w := public.compliance_state(NULL);
  IF w <> 'not_on_file' THEN
    RAISE EXCEPTION '1b expected not_on_file for a NULL holder, got %', w;
  END IF;

  -- An UNDATED paper (a W-9) is held and cannot lapse.
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, issued_on, blocks)
  VALUES ('f1000000-0000-4000-8000-00000000000a','company','f2000000-0000-4000-8000-000000000002',
          'w9','2024-01-01','{payment}');
  w := public.compliance_state('f2000000-0000-4000-8000-000000000002');
  IF w <> 'current' THEN
    RAISE EXCEPTION '1c expected current for undated paper only, got %', w;
  END IF;

  -- current: an expiry comfortably beyond the window.
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
  VALUES ('f5000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-00000000000a','company',
          'f2000000-0000-4000-8000-000000000001','coi_gl', CURRENT_DATE + 200, '{site_access,draw}');
  w := public.compliance_state('f2000000-0000-4000-8000-000000000001');
  IF w <> 'current' THEN RAISE EXCEPTION '1d expected current, got %', w; END IF;

  -- the boundary: exactly 30 days out is INSIDE the window; 31 is not.
  UPDATE public.studio_compliance_documents SET expires_on = CURRENT_DATE + 31
   WHERE id = 'f5000000-0000-4000-8000-000000000001';
  w := public.compliance_state('f2000000-0000-4000-8000-000000000001');
  IF w <> 'current' THEN RAISE EXCEPTION '1e expected current at +31 days, got %', w; END IF;

  UPDATE public.studio_compliance_documents SET expires_on = CURRENT_DATE + 30
   WHERE id = 'f5000000-0000-4000-8000-000000000001';
  w := public.compliance_state('f2000000-0000-4000-8000-000000000001');
  IF w <> 'lapses_soon' THEN RAISE EXCEPTION '1f expected lapses_soon at +30 days, got %', w; END IF;

  -- today is not yet lapsed; yesterday is.
  UPDATE public.studio_compliance_documents SET expires_on = CURRENT_DATE
   WHERE id = 'f5000000-0000-4000-8000-000000000001';
  w := public.compliance_state('f2000000-0000-4000-8000-000000000001');
  IF w <> 'lapses_soon' THEN RAISE EXCEPTION '1g expected lapses_soon on the expiry day, got %', w; END IF;

  UPDATE public.studio_compliance_documents SET expires_on = CURRENT_DATE - 1
   WHERE id = 'f5000000-0000-4000-8000-000000000001';
  w := public.compliance_state('f2000000-0000-4000-8000-000000000001');
  IF w <> 'lapsed' THEN RAISE EXCEPTION '1h expected lapsed the day after, got %', w; END IF;

  -- worst-first: one lapsed paper outranks a current one beside it.
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
  VALUES ('f1000000-0000-4000-8000-00000000000a','company','f2000000-0000-4000-8000-000000000001',
          'coi_wc', CURRENT_DATE + 300, '{site_access}');
  w := public.compliance_state('f2000000-0000-4000-8000-000000000001');
  IF w <> 'lapsed' THEN RAISE EXCEPTION '1i expected lapsed to outrank current, got %', w; END IF;

  -- a SUPERSEDED paper is out of the reckoning: the renewal answers.
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
  VALUES ('f5000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-00000000000a','company',
          'f2000000-0000-4000-8000-000000000001','coi_gl', CURRENT_DATE + 365, '{site_access,draw}');
  UPDATE public.studio_compliance_documents
     SET superseded_by = 'f5000000-0000-4000-8000-000000000002'
   WHERE id = 'f5000000-0000-4000-8000-000000000001';
  w := public.compliance_state('f2000000-0000-4000-8000-000000000001');
  IF w <> 'current' THEN
    RAISE EXCEPTION '1j a superseded lapse must not still hold the card; got %', w;
  END IF;

  RAISE NOTICE '1. compliance_state: four words, the 30-day boundary both ways, worst-first precedence, and a superseded lapse released: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The holder guard: a person card is not a firm, and not another studio's
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  raised text;
BEGIN
  BEGIN
    INSERT INTO public.studio_compliance_documents
      (organization_id, holder_type, holder_id, doc_type)
    VALUES ('f1000000-0000-4000-8000-00000000000a','company',
            'f2000000-0000-4000-8000-000000000011','coi_gl');
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  IF raised IS NULL OR raised NOT LIKE '%compliance_holder_kind_mismatch%' THEN
    RAISE EXCEPTION '2a a person card accepted as holder_type=company: %', COALESCE(raised,'no error');
  END IF;

  BEGIN
    INSERT INTO public.studio_compliance_documents
      (organization_id, holder_type, holder_id, doc_type)
    VALUES ('b0000000-0000-0000-0000-000000000001','company',
            'f2000000-0000-4000-8000-000000000001','coi_gl');
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  IF raised IS NULL OR raised NOT LIKE '%compliance_holder_other_studio%' THEN
    RAISE EXCEPTION '2b a cross-studio document was accepted (PR-u): %', COALESCE(raised,'no error');
  END IF;

  -- a PERSON-held paper is legitimate: a master licence is the person's
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, doc_label, expires_on)
  VALUES ('f1000000-0000-4000-8000-00000000000a','person',
          'f2000000-0000-4000-8000-000000000011','other_named','OSHA 30 card', CURRENT_DATE + 400);

  -- other_named still needs its label
  BEGIN
    INSERT INTO public.studio_compliance_documents
      (organization_id, holder_type, holder_id, doc_type)
    VALUES ('f1000000-0000-4000-8000-00000000000a','person',
            'f2000000-0000-4000-8000-000000000011','other_named');
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  IF raised IS NULL OR raised NOT LIKE '%doc_label_check%' THEN
    RAISE EXCEPTION '2c an unnamed other_named was accepted (PR-f): %', COALESCE(raised,'no error');
  END IF;

  -- and blocks is a subset of the three gates that have a surface
  BEGIN
    INSERT INTO public.studio_compliance_documents
      (organization_id, holder_type, holder_id, doc_type, blocks)
    VALUES ('f1000000-0000-4000-8000-00000000000a','company',
            'f2000000-0000-4000-8000-000000000001','coi_gl','{permit}');
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  IF raised IS NULL OR raised NOT LIKE '%blocks_check%' THEN
    RAISE EXCEPTION '2d a gate no surface honours was accepted: %', COALESCE(raised,'no error');
  END IF;

  RAISE NOTICE '2. the holder guard: a person is not a firm, a document belongs to one studio, other_named needs its label, and blocks is a closed vocabulary: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. people_directory: ONE row for Dana Kowalski, two seats, fixture words
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  r          record;
  n          integer;
  seats      text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

  SELECT count(*) INTO n FROM public.people_directory
   WHERE display_name = 'Dana Kowalski';
  IF n <> 1 THEN
    RAISE EXCEPTION '3a Dana Kowalski must be ONE row in the Directory (G-9), found %', n;
  END IF;

  SELECT * INTO r FROM public.people_directory WHERE display_name = 'Dana Kowalski';
  IF r.role <> 'contact' THEN
    RAISE EXCEPTION '3b a carded human''s identity row is the rolodex card, got role %', r.role;
  END IF;
  IF r.person_id <> 'd0e10000-0000-0000-0000-000000000011' THEN
    RAISE EXCEPTION '3c her identity is her person card, got %', r.person_id;
  END IF;
  IF r.seat_count <> 2 THEN
    RAISE EXCEPTION '3d she holds two seats (Okonkwo and Lindqvist), seat_count = %', r.seat_count;
  END IF;
  -- The fixture's own words. Reach: a live field link on her Okonkwo seat.
  IF r.reach_state <> 'field_link' THEN
    RAISE EXCEPTION '3e reach must read field_link, got %', r.reach_state;
  END IF;
  -- Consent: granted, carried by the PHONE from the 2025 Lindqvist job (F-11).
  IF r.consent_status <> 'granted' THEN
    RAISE EXCEPTION '3f consent must read granted from the record, got %', r.consent_status;
  END IF;
  -- Paper: Northgate Electric's general liability lapsed 31 Mar 2026 (F-11).
  IF r.paper_state <> 'lapsed' THEN
    RAISE EXCEPTION '3g paper must read her FIRM''s lapse, got %', r.paper_state;
  END IF;
  -- She carries no contact rule; "no rule" is a fact, not an empty string (R-V).
  IF r.contact_rule_summary IS NOT NULL THEN
    RAISE EXCEPTION '3h she has no recorded rule, got %', r.contact_rule_summary;
  END IF;

  -- her two seats, keyed to that one row
  SELECT count(*) INTO n FROM public.people_directory_seats s
   WHERE s.person_id = r.person_id;
  IF n <> 2 THEN
    RAISE EXCEPTION '3i people_directory_seats must nest two seats under her row, found %', n;
  END IF;

  SELECT string_agg(s.project_name || '/' || s.stage, ' · ' ORDER BY s.project_name)
    INTO seats
    FROM public.people_directory_seats s WHERE s.person_id = r.person_id;
  IF seats <> 'Lindqvist kitchen/warranty · Okonkwo residence/active' THEN
    RAISE EXCEPTION '3j her seats and their stages read "%"', seats;
  END IF;

  -- PR-p: stage lives on the seat, never on the person row. people_directory
  -- has no stage column at all, and this is the assertion that keeps it so.
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='people_directory' AND column_name='stage';
  IF n <> 0 THEN
    RAISE EXCEPTION '3k people_directory grew a person-level stage column (PR-p/C1)';
  END IF;

  -- and the honest count: 28 people and 21 firms, one row each (G-9)
  SELECT count(*) INTO n FROM public.people_directory
   WHERE role = 'contact' AND meta->>'organization_id' = 'b0000000-0000-0000-0000-000000000001'
     AND meta->>'entity_kind' = 'person';
  IF n <> 28 THEN RAISE EXCEPTION '3l expected 28 person cards, got %', n; END IF;
  SELECT count(*) INTO n FROM public.people_directory
   WHERE role = 'contact' AND meta->>'organization_id' = 'b0000000-0000-0000-0000-000000000001'
     AND meta->>'entity_kind' = 'company';
  IF n <> 21 THEN RAISE EXCEPTION '3m expected 21 firm cards, got %', n; END IF;

  -- Tom Marrow is the case G-9 named: one human, one row, not one per project.
  SELECT count(*) INTO n FROM public.people_directory WHERE display_name = 'Erin Sato';
  IF n <> 1 THEN
    RAISE EXCEPTION '3n Erin Sato holds two seats on two projects and must still be ONE row, found %', n;
  END IF;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '3. people_directory v4: one row per identity, Dana''s two seats beneath it, her four fixture words, no person-level stage, and an honest 28 + 21: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The uncarded identity collapses across projects
-- ═══════════════════════════════════════════════════════════════════════════
-- Two seats on two projects for one human with no rolodex card and no login,
-- sharing only a phone number: crm-model §4 rule 2. One Directory row, two
-- seats, and the row points at the most recently updated seat so a shipped
-- reader still lands somewhere real.
DO $$
DECLARE
  n        integer;
  v_person uuid;
BEGIN
  INSERT INTO public.project_parties
    (id, project_id, party_kind, display_name, phone, stage, created_by, updated_at)
  VALUES
    ('f4000000-0000-4000-8000-000000000101','f3000000-0000-4000-8000-00000000000a','sub',
     'Twice Seated','(612) 555-0999','active','a0000000-0000-0000-0000-000000000004','2026-01-01T00:00:00Z'),
    ('f4000000-0000-4000-8000-000000000102','d0e00000-0000-0000-0000-00000000000a','sub',
     'Twice Seated','(612) 555-0999','active','a0000000-0000-0000-0000-000000000004','2026-06-01T00:00:00Z');

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

  SELECT count(*) INTO n FROM public.people_directory WHERE display_name = 'Twice Seated';
  IF n <> 1 THEN
    RAISE EXCEPTION '4a an uncarded human on two jobs must be ONE row, found %', n;
  END IF;

  SELECT person_id INTO v_person FROM public.people_directory WHERE display_name = 'Twice Seated';
  IF v_person <> 'f4000000-0000-4000-8000-000000000102' THEN
    RAISE EXCEPTION '4b the row must point at the most recently updated seat, got %', v_person;
  END IF;

  SELECT seat_count INTO n FROM public.people_directory WHERE display_name = 'Twice Seated';
  IF n <> 2 THEN RAISE EXCEPTION '4c seat_count must be 2, got %', n; END IF;

  SELECT count(*) INTO n FROM public.people_directory_seats
   WHERE person_id = v_person;
  IF n <> 2 THEN
    RAISE EXCEPTION '4d both seats must key to that one identity row, found %', n;
  END IF;

  -- and both seats agree on the identity key, which is the phone (rule 2)
  SELECT count(DISTINCT identity_key) INTO n FROM public.people_directory_seats
   WHERE seat_id IN ('f4000000-0000-4000-8000-000000000101','f4000000-0000-4000-8000-000000000102');
  IF n <> 1 THEN RAISE EXCEPTION '4e the two seats keyed differently'; END IF;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '4. the uncarded identity: two seats on two jobs collapse to one row keyed on the phone, pointing at the newest seat: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. project_party_authority: PR-n's insert policy, by role
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  raised text;
  n      integer;
BEGIN
  -- a plain MEMBER may record selections …
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  INSERT INTO public.project_party_authority (engagement_id, scope)
  VALUES ('f4000000-0000-4000-8000-000000000001','selections');
  SELECT count(*) INTO n FROM public.project_party_authority
   WHERE engagement_id = 'f4000000-0000-4000-8000-000000000001' AND scope = 'selections';
  IF n <> 1 THEN RAISE EXCEPTION '5a a studio member could not record a selections grant'; END IF;

  -- … and may NOT record money (PR-n)
  BEGIN
    INSERT INTO public.project_party_authority (engagement_id, scope, threshold_cents)
    VALUES ('f4000000-0000-4000-8000-000000000001','money',250000);
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLSTATE;
  END;
  IF raised IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION '5b a plain member wrote a MONEY grant (PR-n), sqlstate %', COALESCE(raised,'none');
  END IF;

  -- … nor draw certification
  BEGIN
    INSERT INTO public.project_party_authority (engagement_id, scope)
    VALUES ('f4000000-0000-4000-8000-000000000001','draw_certify');
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLSTATE;
  END;
  IF raised IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION '5c a plain member wrote a DRAW_CERTIFY grant (PR-n), sqlstate %', COALESCE(raised,'none');
  END IF;

  -- an OWNER may. Money is integer cents.
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  INSERT INTO public.project_party_authority (engagement_id, scope, threshold_cents)
  VALUES ('f4000000-0000-4000-8000-000000000001','money',250000);
  SELECT threshold_cents INTO n FROM public.project_party_authority
   WHERE engagement_id = 'f4000000-0000-4000-8000-000000000001' AND scope = 'money';
  IF n <> 250000 THEN RAISE EXCEPTION '5d the $2,500 line must be 250000 cents, got %', n; END IF;

  -- and a member may not edit the money grant an owner wrote
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  UPDATE public.project_party_authority SET threshold_cents = 999999999
   WHERE engagement_id = 'f4000000-0000-4000-8000-000000000001' AND scope = 'money';
  IF FOUND THEN
    RAISE EXCEPTION '5e a plain member raised a money threshold (PR-n)';
  END IF;

  -- someone outside the studio sees no grant at all
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000001');
  SELECT count(*) INTO n FROM public.project_party_authority
   WHERE engagement_id = 'f4000000-0000-4000-8000-000000000001';
  IF n <> 0 THEN RAISE EXCEPTION '5f a non-member read % authority rows', n; END IF;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '5. project_party_authority: a member records selections and is refused money and draw certification, an owner records both, and a non-member reads nothing (PR-n): passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. copy_to must name seats on the same job
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  raised text;
BEGIN
  BEGIN
    INSERT INTO public.project_party_authority (engagement_id, scope, copy_to)
    VALUES ('f4000000-0000-4000-8000-000000000001','schedule',
            ARRAY['d0e30000-0000-0000-0000-000000000007'::uuid]);
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  IF raised IS NULL OR raised NOT LIKE '%authority_copy_to_off_project%' THEN
    RAISE EXCEPTION '6a an off-project copy_to was accepted: %', COALESCE(raised,'no error');
  END IF;

  INSERT INTO public.project_party_authority (engagement_id, scope, copy_to)
  VALUES ('f4000000-0000-4000-8000-000000000001','schedule',
          ARRAY['f4000000-0000-4000-8000-000000000002'::uuid]);

  RAISE NOTICE '6. copy_to: a seat on another job is refused, a seat on this one lands: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. The site access card: studio only, PR-r and PR-w
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  n      integer;
  raised text;
BEGIN
  -- PR-r: there is NO gate_code column, and that is the ruling, not an omission
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='project_site_access_cards'
     AND column_name IN ('gate_code','code','access_code','lockbox_code');
  IF n <> 0 THEN
    RAISE EXCEPTION '7a project_site_access_cards stores an access code (PR-r forbids it)';
  END IF;

  -- PR-w: no client policy, and no show_to_client column to make one
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE table_schema='public' AND table_name='project_site_access_cards'
     AND column_name = 'show_to_client';
  IF n <> 0 THEN RAISE EXCEPTION '7b the site access card grew a show_to_client toggle (PR-w)'; END IF;

  SELECT count(*) INTO n FROM pg_policy p
    JOIN pg_class c ON c.oid = p.polrelid
   WHERE c.relname = 'project_site_access_cards';
  IF n <> 4 THEN
    RAISE EXCEPTION '7c expected exactly the four studio policies on the site access card, found %', n;
  END IF;

  -- a studio member reads the seeded card
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT count(*) INTO n FROM public.project_site_access_cards
   WHERE project_id = 'd0e00000-0000-0000-0000-00000000000a';
  IF n <> 1 THEN RAISE EXCEPTION '7d a studio member cannot read the site access card'; END IF;

  -- a CLIENT account reads nothing (PR-w)
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000001');
  SELECT count(*) INTO n FROM public.project_site_access_cards;
  IF n <> 0 THEN
    RAISE EXCEPTION '7e a client account read % site access rows (PR-w forbids any)', n;
  END IF;

  -- and anon is refused at the GRANT, before any policy runs
  PERFORM pg_temp.assume_anon();
  BEGIN
    SELECT count(*) INTO n FROM public.project_site_access_cards;
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  IF raised IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION '7f anon was not refused the site access card at the grant, sqlstate %',
      COALESCE(raised, 'none — it READ the table');
  END IF;

  RAISE NOTICE '7. the site access card: no code column and no client toggle (PR-r), four studio policies, a client reads nothing and anon is refused at the grant (PR-w): passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. The key holder is a seat on this job
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  raised text;
BEGIN
  BEGIN
    INSERT INTO public.project_site_access_cards (project_id, key_holder_engagement_id)
    VALUES ('f3000000-0000-4000-8000-00000000000a','d0e30000-0000-0000-0000-000000000006');
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  IF raised IS NULL OR raised NOT LIKE '%site_access_key_holder_off_project%' THEN
    RAISE EXCEPTION '8a a key holder from another job was accepted: %', COALESCE(raised,'no error');
  END IF;

  INSERT INTO public.project_site_access_cards
    (project_id, key_holder_engagement_id, lockbox_version)
  VALUES ('f3000000-0000-4000-8000-00000000000a','f4000000-0000-4000-8000-000000000001',
          'Lockbox, version 1');

  RAISE NOTICE '8. the key holder must be a seat on the card''s own project: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. v_access_grants: F-08's field link, with the WINDOW expiry
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  r record;
  n integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

  -- Erin Sato's Okonkwo seat: the window closes 2027-08-13, so the grant ends
  -- through the end of that day — NOT 90 days from the mint (PR-d).
  SELECT g.* INTO r
    FROM public.v_access_grants g
   WHERE g.tier = 'field_link'
     AND g.subject_type = 'engagement'
     AND g.subject_id = 'd0e30000-0000-0000-0000-000000000008';
  IF r.grant_id IS NULL THEN
    RAISE EXCEPTION '9a F-08''s field link is missing from v_access_grants';
  END IF;
  IF r.scope_type <> 'project' OR r.scope_id <> 'd0e00000-0000-0000-0000-00000000000a' THEN
    RAISE EXCEPTION '9b the grant''s scope must be the Okonkwo project, got %/%', r.scope_type, r.scope_id;
  END IF;
  IF r.expires_at <> '2027-08-14T00:00:00+00'::timestamptz THEN
    RAISE EXCEPTION '9c expected the window end 2027-08-14, got %', r.expires_at;
  END IF;
  IF r.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION '9d the seeded link reads revoked';
  END IF;

  -- her Lindqvist seat's window closed in 2025 but its warranty runs to
  -- 2026-11-21, and PR-l takes the later of the two.
  SELECT g.expires_at::date INTO r
    FROM public.v_access_grants g
   WHERE g.tier = 'field_link' AND g.subject_id = 'd0e40000-0000-0000-0000-000000000008';
  IF r IS NULL THEN RAISE EXCEPTION '9e her second seat''s link is missing'; END IF;

  -- the ledger carries every tier the caller can see, and NO credential
  SELECT count(*) INTO n FROM public.v_access_grants WHERE grant_id ~ '[0-9a-f]{64}';
  IF n <> 0 THEN
    RAISE EXCEPTION '9f % grant_ids look like a bearer token', n;
  END IF;

  -- and the four closed sources come through their definer readers without
  -- raising: a plain member of no such studio simply sees nothing.
  SELECT count(*) INTO n FROM public.access_grants_invoice_links();
  SELECT count(*) INTO n FROM public.access_grants_trade_rfq();
  SELECT count(*) INTO n FROM public.access_grants_plan_transmittals();
  SELECT count(*) INTO n FROM public.access_grants_trade_agreement_links();

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '9. v_access_grants: F-08''s field link ends with the engagement (PR-d), her warranty seat''s link takes the later date (PR-l), no bearer credential is in the ledger, and the four grant-closed sources read without raising: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. create_field_link: the window sets expires_at, and the old shape still
--     works for a seat that has none
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_id    uuid;
  v_exp   timestamptz;
  raised  text;
BEGIN
  -- a seat with a window: 2026-12-18 → through the end of that day
  SELECT id INTO v_id FROM public.create_field_link('f4000000-0000-4000-8000-000000000001');
  SELECT expires_at INTO v_exp FROM public.field_link_tokens WHERE id = v_id;
  IF v_exp <> '2026-12-19T00:00:00+00'::timestamptz THEN
    RAISE EXCEPTION '10a expected the window end 2026-12-19, got %', v_exp;
  END IF;

  -- a seat with NO window and no caller date: the 90-day fallback stands
  SELECT id INTO v_id FROM public.create_field_link('f4000000-0000-4000-8000-000000000002');
  SELECT expires_at INTO v_exp FROM public.field_link_tokens WHERE id = v_id;
  IF v_exp::date <> (now() + interval '90 days')::date THEN
    RAISE EXCEPTION '10b expected the 90-day fallback, got %', v_exp;
  END IF;

  -- a seat with NO window and an explicit date: the caller's date wins
  SELECT id INTO v_id
    FROM public.create_field_link('f4000000-0000-4000-8000-000000000002',
                                  '2027-03-01T00:00:00Z'::timestamptz);
  SELECT expires_at INTO v_exp FROM public.field_link_tokens WHERE id = v_id;
  IF v_exp <> '2027-03-01T00:00:00+00'::timestamptz THEN
    RAISE EXCEPTION '10c expected the caller''s date, got %', v_exp;
  END IF;

  -- a WARRANTY-only seat: warranty_until answers when on_site_to is null (PR-l)
  SELECT id INTO v_id FROM public.create_field_link('f4000000-0000-4000-8000-000000000003');
  SELECT expires_at INTO v_exp FROM public.field_link_tokens WHERE id = v_id;
  IF v_exp <> '2027-07-01T00:00:00+00'::timestamptz THEN
    RAISE EXCEPTION '10d expected the warranty end 2027-07-01, got %', v_exp;
  END IF;

  -- the window still outranks a caller date, which is what PR-d means
  SELECT id INTO v_id
    FROM public.create_field_link('f4000000-0000-4000-8000-000000000001',
                                  '2099-01-01T00:00:00Z'::timestamptz);
  SELECT expires_at INTO v_exp FROM public.field_link_tokens WHERE id = v_id;
  IF v_exp <> '2026-12-19T00:00:00+00'::timestamptz THEN
    RAISE EXCEPTION '10e a caller date overrode the engagement window, got %', v_exp;
  END IF;

  -- and the mint still supersedes the prior active token
  SELECT count(*) INTO raised FROM public.field_link_tokens
   WHERE party_id = 'f4000000-0000-4000-8000-000000000001' AND status = 'active';
  IF raised <> '1' THEN
    RAISE EXCEPTION '10f the mint left % active tokens on one seat', raised;
  END IF;

  -- 00284's authorization guard is untouched: a non-owner authenticated caller
  -- is still refused.
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000001');
  BEGIN
    PERFORM public.create_field_link('f4000000-0000-4000-8000-000000000001');
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  IF raised IS DISTINCT FROM '42501' THEN
    RAISE EXCEPTION '10g a non-owner minted a field link, sqlstate %', COALESCE(raised,'none');
  END IF;

  RAISE NOTICE '10. create_field_link: the engagement window sets the expiry and outranks a caller date, warranty answers alone, the 90-day fallback survives for a windowless seat, the supersede and 00284''s ownership guard are untouched: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. The stage and the window are writable; the consent columns are not
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  raised text;
  v_stage text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

  UPDATE public.project_parties
     SET stage = 'closeout', on_site_to = '2027-01-31', off_job_reason = 'scope complete'
   WHERE id = 'f4000000-0000-4000-8000-000000000001';
  SELECT stage INTO v_stage FROM public.project_parties
   WHERE id = 'f4000000-0000-4000-8000-000000000001';
  IF v_stage <> 'closeout' THEN
    RAISE EXCEPTION '11a a studio member could not move the seat''s stage, it reads %', v_stage;
  END IF;

  -- and the freeze still holds the eight consent columns (R-AY / R-AX)
  BEGIN
    UPDATE public.project_parties SET sms_consent_status = 'granted'
     WHERE id = 'f4000000-0000-4000-8000-000000000001';
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  IF raised IS NULL OR raised NOT LIKE '%consent_legacy_column_frozen%' THEN
    RAISE EXCEPTION '11b the consent freeze did not hold: %', COALESCE(raised,'no error');
  END IF;

  -- a bad stage is refused
  BEGIN
    UPDATE public.project_parties SET stage = 'on_the_job'
     WHERE id = 'f4000000-0000-4000-8000-000000000001';
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  IF raised IS NULL OR raised NOT LIKE '%project_parties_stage_check%' THEN
    RAISE EXCEPTION '11c a stage outside the vocabulary was accepted: %', COALESCE(raised,'no error');
  END IF;

  PERFORM pg_temp.reset_role();

  -- the company pointer must name a firm in the project's own studio
  BEGIN
    UPDATE public.project_parties
       SET company_id = 'd0e20000-0000-0000-0000-000000000001'
     WHERE id = 'f4000000-0000-4000-8000-000000000002';
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  IF raised IS NULL OR raised NOT LIKE '%party_company_other_studio%' THEN
    RAISE EXCEPTION '11d a cross-studio firm pointer was accepted: %', COALESCE(raised,'no error');
  END IF;

  BEGIN
    UPDATE public.project_parties
       SET company_id = 'f2000000-0000-4000-8000-000000000011'
     WHERE id = 'f4000000-0000-4000-8000-000000000002';
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  IF raised IS NULL OR raised NOT LIKE '%party_company_not_a_company%' THEN
    RAISE EXCEPTION '11e a PERSON card was accepted as the seat''s firm: %', COALESCE(raised,'no error');
  END IF;

  RAISE NOTICE '11. the seat''s new columns are writable by a member, the eight consent columns are still frozen, the stage vocabulary is closed, and the firm pointer must be a firm in this studio: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 12. The seeded fixture's own facts, as the room will read them
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  n integer;
  w text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

  -- R-F's "5 reachable by text": five granted records in this studio
  SELECT count(*) INTO n FROM public.people_directory
   WHERE consent_status = 'granted'
     AND meta->>'organization_id' = 'b0000000-0000-0000-0000-000000000001';
  IF n <> 5 THEN RAISE EXCEPTION '12a expected 5 granted numbers, got %', n; END IF;

  -- F-12 Pete Rusk: the refusal he made on the Lindqvist thread still answers
  -- on the Okonkwo job, because consent is a fact about the NUMBER (G-3).
  SELECT consent_status INTO w FROM public.people_directory
   WHERE display_name = 'Pete Rusk';
  IF w <> 'opted_out' THEN
    RAISE EXCEPTION '12b Pete Rusk must read opted_out from the record, got %', w;
  END IF;
  SELECT count(*) INTO n FROM public.people_directory_seats
   WHERE display_name = 'Pete Rusk' AND consent_status <> 'opted_out';
  IF n <> 0 THEN
    RAISE EXCEPTION '12c % of Pete Rusk''s seats disagree with his record', n;
  END IF;

  -- F-18 Joe Wozniak is invited and has not answered
  SELECT consent_status INTO w FROM public.people_directory WHERE display_name = 'Joe Wozniak';
  IF w <> 'pending' THEN RAISE EXCEPTION '12d Joe Wozniak must read pending, got %', w; END IF;

  -- F-15 Frank Bauer's rule names the route, and F-14 Rosa is who to write
  SELECT contact_rule_summary INTO w FROM public.people_directory
   WHERE display_name = 'Frank Bauer';
  IF w IS NULL OR w NOT LIKE 'Never text.%' OR w NOT LIKE '%Write Rosa Delgado instead.%' THEN
    RAISE EXCEPTION '12e Frank Bauer''s rule reads "%"', COALESCE(w,'NULL');
  END IF;

  -- F-27 Ray Thao is never texted, and the 311 portal is a channel
  SELECT contact_rule_summary INTO w FROM public.people_directory WHERE display_name = 'Ray Thao';
  IF w IS NULL OR w NOT LIKE 'Never text.%' OR w NOT LIKE '%portal_311%' THEN
    RAISE EXCEPTION '12f Ray Thao''s rule reads "%"', COALESCE(w,'NULL');
  END IF;

  -- C13/R-A: a lender and an AHJ hold no paper. The VIEW still reports
  -- not_on_file — the "print no word at all" rule is the room's, not the
  -- view's, and this assertion is what says so.
  SELECT paper_state INTO w FROM public.people_directory WHERE display_name = 'Great Northern Bank';
  IF w <> 'not_on_file' THEN
    RAISE EXCEPTION '12g the view must report the FACT for a lender, got %', w;
  END IF;

  -- F-05 Chidi signs money over $2,500, and the grant carries the figure
  SELECT a.threshold_cents INTO n
    FROM public.project_party_authority a
    JOIN public.project_parties pp ON pp.id = a.engagement_id
   WHERE pp.display_name = 'Chidi Okonkwo' AND a.scope = 'money';
  IF n <> 250000 THEN
    RAISE EXCEPTION '12h Chidi''s money grant reads % cents', COALESCE(n::text,'NULL');
  END IF;

  -- F-08 Erin PREPARES the change order and does not sign it
  SELECT count(*) INTO n
    FROM public.project_party_authority a
    JOIN public.project_parties pp ON pp.id = a.engagement_id
   WHERE pp.id = 'd0e30000-0000-0000-0000-000000000008'
     AND a.scope = 'change_order' AND a.prepares_only IS TRUE;
  IF n <> 1 THEN RAISE EXCEPTION '12i Erin''s prepares-only grant is missing'; END IF;

  -- the site access card names the key holder and holds no code
  SELECT count(*) INTO n FROM public.project_site_access_cards c
    JOIN public.project_parties pp ON pp.id = c.key_holder_engagement_id
   WHERE c.project_id = 'd0e00000-0000-0000-0000-00000000000a'
     AND pp.display_name = 'Ngozi Eze';
  IF n <> 1 THEN RAISE EXCEPTION '12j the key holder is not Ngozi Eze'; END IF;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '12. the seeded fixture reads as the fixture: five granted numbers, Pete''s Lindqvist refusal answering on Okonkwo, Joe invited, Frank routed to Rosa, Ray never texted, the lender''s paper reported as a fact, Chidi''s $2,500 line in cents, Erin preparing only, and Ngozi holding the key: passed';
END $$;

DO $$ BEGIN RAISE NOTICE 'All W1b assertions passed.'; END $$;
ROLLBACK;
