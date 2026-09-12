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

  -- a paper that holds NO gate cannot move the word (w1b r1 MAJOR-3).
  -- CS2 §4: "a date with no gate changes nothing"; PR-h puts the word in the
  -- blocked family, so a lapsed training card that gates nothing must not make
  -- a firm whose COI is current print the blocked word.
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, doc_label, expires_on, blocks)
  VALUES ('f5000000-0000-4000-8000-000000000003','f1000000-0000-4000-8000-00000000000a','company',
          'f2000000-0000-4000-8000-000000000001','other_named','a training card',
          CURRENT_DATE - 1, '{}');
  w := public.compliance_state('f2000000-0000-4000-8000-000000000001');
  IF w <> 'current' THEN
    RAISE EXCEPTION '1k a gateless lapse changed the word (CS2 §4), got %', w;
  END IF;

  -- nor inside the 30-day window
  UPDATE public.studio_compliance_documents SET expires_on = CURRENT_DATE + 10
   WHERE id = 'f5000000-0000-4000-8000-000000000003';
  w := public.compliance_state('f2000000-0000-4000-8000-000000000001');
  IF w <> 'current' THEN
    RAISE EXCEPTION '1l a gateless paper 10 days out changed the word, got %', w;
  END IF;

  -- give that SAME paper one gate and the same date now holds the card
  UPDATE public.studio_compliance_documents
     SET blocks = '{payment}', expires_on = CURRENT_DATE - 1
   WHERE id = 'f5000000-0000-4000-8000-000000000003';
  w := public.compliance_state('f2000000-0000-4000-8000-000000000001');
  IF w <> 'lapsed' THEN
    RAISE EXCEPTION '1m a gated lapse must hold the card, got %', w;
  END IF;

  -- and not_on_file still means NO paper, not no GATING paper: a card holding
  -- only a gateless expired certificate is on file, and reads current.
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, doc_label, expires_on, blocks)
  VALUES ('f5000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-00000000000a','company',
          'f2000000-0000-4000-8000-000000000003','other_named','a courtesy letter',
          CURRENT_DATE - 1, '{}');
  w := public.compliance_state('f2000000-0000-4000-8000-000000000003');
  IF w <> 'current' THEN
    RAISE EXCEPTION '1n a card holding only gateless paper must read current, got %', w;
  END IF;

  RAISE NOTICE '1. compliance_state: four words, the 30-day boundary both ways, worst-first precedence, a superseded lapse released, and a gateless lapse that changes nothing until it holds a gate: passed';
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
      (organization_id, holder_type, holder_id, doc_type, expires_on)
    VALUES ('f1000000-0000-4000-8000-00000000000a','company',
            'f2000000-0000-4000-8000-000000000011','coi_gl', CURRENT_DATE + 100);
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  IF raised IS NULL OR raised NOT LIKE '%compliance_holder_kind_mismatch%' THEN
    RAISE EXCEPTION '2a a person card accepted as holder_type=company: %', COALESCE(raised,'no error');
  END IF;

  BEGIN
    INSERT INTO public.studio_compliance_documents
      (organization_id, holder_type, holder_id, doc_type, expires_on)
    VALUES ('b0000000-0000-0000-0000-000000000001','company',
            'f2000000-0000-4000-8000-000000000001','coi_gl', CURRENT_DATE + 100);
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
      (organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
    VALUES ('f1000000-0000-4000-8000-00000000000a','company',
            'f2000000-0000-4000-8000-000000000001','coi_gl', CURRENT_DATE + 100,'{permit}');
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  IF raised IS NULL OR raised NOT LIKE '%blocks_check%' THEN
    RAISE EXCEPTION '2d a gate no surface honours was accepted: %', COALESCE(raised,'no error');
  END IF;

  -- a supersede is a RENEWAL, not a way to hide a lapse (w1b r1 MAJOR-4).
  -- Card and studio were the whole guard, so one UPDATE through PostgREST by a
  -- plain studio member pointed a lapsed COI at the firm's undated W-9 and the
  -- paper word flipped from lapsed to current with the lapse still on file.
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks) VALUES
    ('f5000000-0000-4000-8000-000000000021','f1000000-0000-4000-8000-00000000000a','company',
     'f2000000-0000-4000-8000-000000000001','coi_gl', CURRENT_DATE - 1, '{site_access}'),
    ('f5000000-0000-4000-8000-000000000022','f1000000-0000-4000-8000-00000000000a','company',
     'f2000000-0000-4000-8000-000000000001','w9', NULL, '{payment}'),
    ('f5000000-0000-4000-8000-000000000023','f1000000-0000-4000-8000-00000000000a','company',
     'f2000000-0000-4000-8000-000000000001','coi_gl', CURRENT_DATE - 10, '{site_access}'),
    ('f5000000-0000-4000-8000-000000000024','f1000000-0000-4000-8000-00000000000a','company',
     'f2000000-0000-4000-8000-000000000001','coi_gl', CURRENT_DATE + 365, '{site_access}'),
    ('f5000000-0000-4000-8000-000000000025','f1000000-0000-4000-8000-00000000000a','company',
     'f2000000-0000-4000-8000-000000000001','w9', CURRENT_DATE - 1, '{payment}');

  -- the walked laundering: a W-9 as the renewal of a COI
  BEGIN
    UPDATE public.studio_compliance_documents
       SET superseded_by = 'f5000000-0000-4000-8000-000000000022'
     WHERE id = 'f5000000-0000-4000-8000-000000000021';
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  IF raised IS NULL OR raised NOT LIKE '%compliance_successor_wrong_type%' THEN
    RAISE EXCEPTION '2e a W-9 was accepted as the renewal of a lapsed COI: %', COALESCE(raised,'no error');
  END IF;

  -- and a COI that expired even earlier is not a renewal either
  BEGIN
    UPDATE public.studio_compliance_documents
       SET superseded_by = 'f5000000-0000-4000-8000-000000000023'
     WHERE id = 'f5000000-0000-4000-8000-000000000021';
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  IF raised IS NULL OR raised NOT LIKE '%compliance_successor_not_later%' THEN
    RAISE EXCEPTION '2f a shorter-dated COI was accepted as a renewal: %', COALESCE(raised,'no error');
  END IF;

  -- the real renewal lands: the same paper, covering longer
  UPDATE public.studio_compliance_documents
     SET superseded_by = 'f5000000-0000-4000-8000-000000000024'
   WHERE id = 'f5000000-0000-4000-8000-000000000021';
  IF NOT EXISTS (
    SELECT 1 FROM public.studio_compliance_documents
     WHERE id = 'f5000000-0000-4000-8000-000000000021'
       AND superseded_by = 'f5000000-0000-4000-8000-000000000024') THEN
    RAISE EXCEPTION '2g a genuine renewal was refused';
  END IF;

  -- an UNDATED successor of the same paper is open-ended and qualifies
  UPDATE public.studio_compliance_documents
     SET superseded_by = 'f5000000-0000-4000-8000-000000000022'
   WHERE id = 'f5000000-0000-4000-8000-000000000025';
  IF NOT EXISTS (
    SELECT 1 FROM public.studio_compliance_documents
     WHERE id = 'f5000000-0000-4000-8000-000000000025'
       AND superseded_by = 'f5000000-0000-4000-8000-000000000022') THEN
    RAISE EXCEPTION '2h an undated W-9 was refused as the renewal of a dated one';
  END IF;

  -- ═══ r2 MAJOR-1 door (a): a DATED type must carry its date ═══════════════
  -- r1 MAJOR-4 was closed by requiring the same doc_type and a date no earlier,
  -- and the leg above (2h) states the deliberate exemption for an undated
  -- successor. Nothing required expires_on on a COI, so the successor could be
  -- an undated COI: compliance_state() counts an undated paper as held and
  -- unable to lapse, so two ordinary member writes — record the renewal without
  -- typing the date, mark the old one superseded — flipped a firm holding a
  -- lapsed, GATING certificate from `lapsed` to `current` with the lapse still
  -- on file.
  BEGIN
    INSERT INTO public.studio_compliance_documents
      (organization_id, holder_type, holder_id, doc_type, issuer, blocks)
    VALUES ('f1000000-0000-4000-8000-00000000000a','company',
            'f2000000-0000-4000-8000-000000000001','coi_gl',
            'Acme Mutual (renewal, no date typed)','{site_access,draw}');
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  IF raised IS NULL OR raised NOT LIKE '%dated_expiry_check%' THEN
    RAISE EXCEPTION '2i an undated COI was recorded, and an undated certificate reads current forever: %', COALESCE(raised,'no error');
  END IF;

  -- a licence and a bond are dated types too
  BEGIN
    INSERT INTO public.studio_compliance_documents
      (organization_id, holder_type, holder_id, doc_type, blocks)
    VALUES ('f1000000-0000-4000-8000-00000000000a','company',
            'f2000000-0000-4000-8000-000000000001','bond','{}');
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  IF raised IS NULL OR raised NOT LIKE '%dated_expiry_check%' THEN
    RAISE EXCEPTION '2j an undated bond was recorded: %', COALESCE(raised,'no error');
  END IF;

  -- an UNDATED type is untouched: a W-9 and a signed waiver are open-ended
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, blocks)
  VALUES ('f5000000-0000-4000-8000-000000000031','f1000000-0000-4000-8000-00000000000a','company',
          'f2000000-0000-4000-8000-000000000002','lien_waiver_unconditional','{payment}');

  -- and the trigger says the same thing where the CHECK cannot see it — over a
  -- row that predates the constraint. The constraint is dropped and restored
  -- inside this rolled-back transaction so the second guard is exercised on its
  -- own; a successor with no date is refused for a dated paper.
  EXECUTE 'ALTER TABLE public.studio_compliance_documents '
          'DROP CONSTRAINT studio_compliance_documents_dated_expiry_check';
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, issuer, blocks) VALUES
    ('f5000000-0000-4000-8000-000000000032','f1000000-0000-4000-8000-00000000000a','company',
     'f2000000-0000-4000-8000-000000000002','coi_gl','Acme Mutual (no date typed)','{site_access}');
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks) VALUES
    ('f5000000-0000-4000-8000-000000000033','f1000000-0000-4000-8000-00000000000a','company',
     'f2000000-0000-4000-8000-000000000002','coi_gl', CURRENT_DATE - 1,'{site_access}');
  BEGIN
    UPDATE public.studio_compliance_documents
       SET superseded_by = 'f5000000-0000-4000-8000-000000000032'
     WHERE id = 'f5000000-0000-4000-8000-000000000033';
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  IF raised IS NULL OR raised NOT LIKE '%compliance_successor_undated%' THEN
    RAISE EXCEPTION '2k an undated COI was accepted as the renewal of a lapsed one: %', COALESCE(raised,'no error');
  END IF;
  DELETE FROM public.studio_compliance_documents
   WHERE id = 'f5000000-0000-4000-8000-000000000032';
  EXECUTE 'ALTER TABLE public.studio_compliance_documents '
          'ADD CONSTRAINT studio_compliance_documents_dated_expiry_check CHECK ('
          '  doc_type NOT IN (''coi_gl'', ''coi_wc'', ''coi_auto'', ''license'', ''bond'')'
          '  OR expires_on IS NOT NULL)';

  -- ═══ r2 MAJOR-1 door (b): a supersede may not close a chain ══════════════
  -- Only self-reference was blocked, so A -> B then B -> A passed both r1 legs
  -- whenever the two rows shared a doc_type and a date — and compliance_state()
  -- excludes EVERY superseded row, so a card fell back to whatever gateless
  -- paper it holds. r1 measured the cycle as lapsed -> not_on_file; after the
  -- blocks[] fix it is lapsed -> current on any card holding a W-9, which every
  -- real firm in the fixture holds. This card gets both.
  INSERT INTO public.studio_contacts
    (id, organization_id, entity_kind, contact_kind, company_name, company_kind, created_by)
  VALUES ('f2000000-0000-4000-8000-000000000004','f1000000-0000-4000-8000-00000000000a',
          'company','sub','Cycle Paper Co','sub','a0000000-0000-0000-0000-000000000004');
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks) VALUES
    ('f5000000-0000-4000-8000-000000000041','f1000000-0000-4000-8000-00000000000a','company',
     'f2000000-0000-4000-8000-000000000004','coi_gl', CURRENT_DATE - 1,'{site_access,draw}'),
    ('f5000000-0000-4000-8000-000000000042','f1000000-0000-4000-8000-00000000000a','company',
     'f2000000-0000-4000-8000-000000000004','coi_gl', CURRENT_DATE - 1,'{site_access,draw}');
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, blocks) VALUES
    ('f5000000-0000-4000-8000-000000000043','f1000000-0000-4000-8000-00000000000a','company',
     'f2000000-0000-4000-8000-000000000004','w9','{payment}');

  IF public.compliance_state('f2000000-0000-4000-8000-000000000004') <> 'lapsed' THEN
    RAISE EXCEPTION '2l the cycle card must start lapsed, got %',
      public.compliance_state('f2000000-0000-4000-8000-000000000004');
  END IF;

  -- the first leg is a legitimate supersede of one duplicate by the other
  UPDATE public.studio_compliance_documents
     SET superseded_by = 'f5000000-0000-4000-8000-000000000042'
   WHERE id = 'f5000000-0000-4000-8000-000000000041';

  -- the second leg closes the loop, and is refused
  BEGIN
    UPDATE public.studio_compliance_documents
       SET superseded_by = 'f5000000-0000-4000-8000-000000000041'
     WHERE id = 'f5000000-0000-4000-8000-000000000042';
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  IF raised IS NULL OR raised NOT LIKE '%compliance_successor_already_superseded%' THEN
    RAISE EXCEPTION '2m a supersede CYCLE was accepted: %', COALESCE(raised,'no error');
  END IF;

  -- and the consequence the cycle bought is gone: the lapse still holds the card
  IF public.compliance_state('f2000000-0000-4000-8000-000000000004') <> 'lapsed' THEN
    RAISE EXCEPTION '2n the refused cycle still moved the word to %',
      public.compliance_state('f2000000-0000-4000-8000-000000000004');
  END IF;

  -- a genuine three-row chain is untouched: the head is always in force
  INSERT INTO public.studio_compliance_documents
    (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks) VALUES
    ('f5000000-0000-4000-8000-000000000044','f1000000-0000-4000-8000-00000000000a','company',
     'f2000000-0000-4000-8000-000000000004','coi_gl', CURRENT_DATE + 365,'{site_access,draw}');
  UPDATE public.studio_compliance_documents
     SET superseded_by = 'f5000000-0000-4000-8000-000000000044'
   WHERE id = 'f5000000-0000-4000-8000-000000000042';
  IF public.compliance_state('f2000000-0000-4000-8000-000000000004') <> 'current' THEN
    RAISE EXCEPTION '2o a real renewal at the head of the chain was not honoured, got %',
      public.compliance_state('f2000000-0000-4000-8000-000000000004');
  END IF;

  RAISE NOTICE '2. the holder guard: a person is not a firm, a document belongs to one studio, other_named needs its label, blocks is a closed vocabulary, a supersede must be the same paper covering at least as long, a dated type must carry its date (and may not be renewed by an undated one), and a supersede may not close a chain: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. people_directory: ONE row for Dana Kowalski, two seats, fixture words
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  r          record;
  n          integer;
  seats      text;
  w          text;
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

  -- ═══ r2 MAJOR-2: the consent word covers every number the identity carries ═
  -- v4 moves every carded human to the CONTACTS branch, which read the CARD's
  -- phone_e164 alone — so a recorded refusal on the number the person's SEAT
  -- carries left the face, and the identity row printed `not_asked` (or no word
  -- at all) over people_directory_seats printing `opted_out` for the same human
  -- off the same record. The seeded fixture cannot show it: every card there
  -- shares its seat's number, zero disagreements across all 62 rows. These are
  -- the two shapes that disagree, plus the control that must still read NULL.
  PERFORM pg_temp.reset_role();

  INSERT INTO public.studio_contacts
    (id, organization_id, entity_kind, contact_kind, full_name, phone, company_id, created_by)
  VALUES
    ('f2000000-0000-4000-8000-000000000021','f1000000-0000-4000-8000-00000000000a','person','sub',
     'Two Number Sub','(612) 555-7100','f2000000-0000-4000-8000-000000000001',
     'a0000000-0000-0000-0000-000000000004'),
    ('f2000000-0000-4000-8000-000000000022','f1000000-0000-4000-8000-00000000000a','person','sub',
     'Cardless Number Sub',NULL,'f2000000-0000-4000-8000-000000000001',
     'a0000000-0000-0000-0000-000000000004'),
    ('f2000000-0000-4000-8000-000000000023','f1000000-0000-4000-8000-00000000000a','person','sub',
     'No Number Anywhere Sub',NULL,'f2000000-0000-4000-8000-000000000001',
     'a0000000-0000-0000-0000-000000000004');

  INSERT INTO public.project_parties
    (id, project_id, party_kind, display_name, phone, studio_contact_id, company_id,
     stage, created_by)
  VALUES
    -- a card whose number is NOT the number its seat carries
    ('f4000000-0000-4000-8000-000000000121','f3000000-0000-4000-8000-00000000000a','sub',
     'Two Number Sub','(612) 555-7200','f2000000-0000-4000-8000-000000000021',
     'f2000000-0000-4000-8000-000000000001','active','a0000000-0000-0000-0000-000000000004'),
    -- a card with no number at all, seated on a number that refused
    ('f4000000-0000-4000-8000-000000000122','f3000000-0000-4000-8000-00000000000a','sub',
     'Cardless Number Sub','(612) 555-7001','f2000000-0000-4000-8000-000000000022',
     'f2000000-0000-4000-8000-000000000001','active','a0000000-0000-0000-0000-000000000004');

  -- the record: a refusal on each SEAT's number, nothing on the card's own
  INSERT INTO public.studio_channel_consent
    (organization_id, channel_kind, channel_value, status, opt_out_at,
     opt_out_source, opt_out_evidence, opt_out_recorded_at, opt_out_recorded_by)
  VALUES
    ('f1000000-0000-4000-8000-00000000000a','sms','+16125557200','opted_out', now(),
     'verbal','said stop on site', now(),'a0000000-0000-0000-0000-000000000004'),
    ('f1000000-0000-4000-8000-00000000000a','sms','+16125557001','opted_out', now(),
     'verbal','said stop on site', now(),'a0000000-0000-0000-0000-000000000004');

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

  SELECT consent_status INTO w FROM public.people_directory
   WHERE display_name = 'Two Number Sub';
  IF w IS DISTINCT FROM 'opted_out' THEN
    RAISE EXCEPTION '3o a refusal on the number this person''s SEAT carries must be on the identity row (§1.4), got %', COALESCE(w,'NULL');
  END IF;

  SELECT consent_status INTO w FROM public.people_directory
   WHERE display_name = 'Cardless Number Sub';
  IF w IS DISTINCT FROM 'opted_out' THEN
    RAISE EXCEPTION '3p a card with NO number must still print its seat''s refusal, got %', COALESCE(w,'NULL');
  END IF;

  -- the seat line beneath agrees, which is the whole point
  SELECT count(*) INTO n FROM public.people_directory_seats
   WHERE display_name IN ('Two Number Sub','Cardless Number Sub')
     AND consent_status <> 'opted_out';
  IF n <> 0 THEN
    RAISE EXCEPTION '3q % seat lines disagree with the record the row now reads', n;
  END IF;

  -- NULL still means no number ANYWHERE, not "no number on the card"
  SELECT consent_status INTO w FROM public.people_directory
   WHERE display_name = 'No Number Anywhere Sub';
  IF w IS NOT NULL THEN
    RAISE EXCEPTION '3r a carded human with no number anywhere must print no consent word, got %', w;
  END IF;

  -- and the reduction is least-permission-first, not last-write-wins: a
  -- granted card number does not answer for an un-recorded seat number
  PERFORM pg_temp.reset_role();
  UPDATE public.studio_channel_consent
     SET status = 'granted', refusal_unanswered = false, opt_out_at = NULL,
         consented_at = now(), source = 'written', evidence = 'signed form',
         recorded_at = now(), recorded_by = 'a0000000-0000-0000-0000-000000000004',
         opt_out_source = NULL, opt_out_evidence = NULL,
         opt_out_recorded_at = NULL, opt_out_recorded_by = NULL
   WHERE organization_id = 'f1000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = '+16125557200';
  INSERT INTO public.studio_channel_consent
    (organization_id, channel_kind, channel_value, status, consented_at,
     source, evidence, recorded_at, recorded_by)
  VALUES
    ('f1000000-0000-4000-8000-00000000000a','sms','+16125557100','granted', now(),
     'written','signed form', now(),'a0000000-0000-0000-0000-000000000004');
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

  SELECT consent_status INTO w FROM public.people_directory
   WHERE display_name = 'Two Number Sub';
  IF w IS DISTINCT FROM 'granted' THEN
    RAISE EXCEPTION '3s both of this identity''s numbers are granted and the row reads %', COALESCE(w,'NULL');
  END IF;

  PERFORM pg_temp.reset_role();
  UPDATE public.studio_channel_consent
     SET status = 'not_asked', consented_at = NULL, source = NULL,
         evidence = NULL, recorded_at = NULL, recorded_by = NULL
   WHERE organization_id = 'f1000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = '+16125557100';
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

  SELECT consent_status INTO w FROM public.people_directory
   WHERE display_name = 'Two Number Sub';
  IF w IS DISTINCT FROM 'not_asked' THEN
    RAISE EXCEPTION '3t one un-asked number must pull the identity word back to not_asked, got %', COALESCE(w,'NULL');
  END IF;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '3. people_directory v4: one row per identity, Dana''s two seats beneath it, her four fixture words, no person-level stage, an honest 28 + 21, and the consent word reduced worst-first over every number the identity carries — the card''s and its seats'': passed';
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
  w        text;
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

  -- ═══ r2 MAJOR-3: reach reads the IDENTITY's links, not the winner's ══════
  -- The party branch passed the winning seat's id, so the EXISTS clause could
  -- only match a link minted on that one seat. The live door here hangs on the
  -- OLDER seat — the one the Directory does NOT point at — and the row read
  -- `on_paper` while the seat line beneath it printed `field_link`, which is
  -- the reach drift G-20/G-21 this program exists to remove: the studio's next
  -- act is to mint a second door for someone who already holds one.
  PERFORM pg_temp.reset_role();
  INSERT INTO public.field_link_tokens
    (id, party_id, project_id, token_hash, status, expires_at, created_by)
  VALUES ('f6000000-0000-4000-8000-000000000101',
          'f4000000-0000-4000-8000-000000000101','f3000000-0000-4000-8000-00000000000a',
          'w1b-r2-major3-identity-link','active', now() + interval '30 days',
          'a0000000-0000-0000-0000-000000000004');
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

  SELECT reach_state INTO w FROM public.people_directory
   WHERE display_name = 'Twice Seated';
  IF w IS DISTINCT FROM 'field_link' THEN
    RAISE EXCEPTION '4e1 a live link on a NON-winning seat must read field_link on the identity row, got %', COALESCE(w,'NULL');
  END IF;

  -- and it really is the non-winning seat that holds it
  SELECT reach_state INTO w FROM public.people_directory_seats
   WHERE seat_id = 'f4000000-0000-4000-8000-000000000101';
  IF w IS DISTINCT FROM 'field_link' THEN
    RAISE EXCEPTION '4e2 the seat holding the link reads %', COALESCE(w,'NULL');
  END IF;
  SELECT reach_state INTO w FROM public.people_directory_seats
   WHERE seat_id = 'f4000000-0000-4000-8000-000000000102';
  IF w IS DISTINCT FROM 'on_paper' THEN
    RAISE EXCEPTION '4e3 the WINNING seat must hold no link for this leg to mean anything, got %', COALESCE(w,'NULL');
  END IF;

  -- a revoked or expired door is not a door
  PERFORM pg_temp.reset_role();
  UPDATE public.field_link_tokens SET status = 'revoked'
   WHERE id = 'f6000000-0000-4000-8000-000000000101';
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT reach_state INTO w FROM public.people_directory
   WHERE display_name = 'Twice Seated';
  IF w IS DISTINCT FROM 'on_paper' THEN
    RAISE EXCEPTION '4e4 a revoked link still reads %', COALESCE(w,'NULL');
  END IF;

  PERFORM pg_temp.reset_role();
  UPDATE public.field_link_tokens
     SET status = 'active', expires_at = now() - interval '1 day'
   WHERE id = 'f6000000-0000-4000-8000-000000000101';
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT reach_state INTO w FROM public.people_directory
   WHERE display_name = 'Twice Seated';
  IF w IS DISTINCT FROM 'on_paper' THEN
    RAISE EXCEPTION '4e5 an expired link still reads %', COALESCE(w,'NULL');
  END IF;
  PERFORM pg_temp.reset_role();
  UPDATE public.field_link_tokens SET status = 'revoked'
   WHERE id = 'f6000000-0000-4000-8000-000000000101';
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

  -- MIXED KINDS (w1b r1 MAJOR-2): the same human seated under a kind the
  -- Directory does not emit. people_directory picked its winner over the seven
  -- kinds and people_directory_seats over every kind, so the newest seat being
  -- a `vendor` made the row claim two seats and nest none — the one join the
  -- redesign rests on.
  PERFORM pg_temp.reset_role();
  INSERT INTO public.project_parties
    (id, project_id, party_kind, display_name, phone, stage, created_by, updated_at)
  VALUES
    ('f4000000-0000-4000-8000-000000000111','f3000000-0000-4000-8000-00000000000a','sub',
     'Mixed Kinds','(612) 555-0888','active','a0000000-0000-0000-0000-000000000004','2026-01-01T00:00:00Z'),
    ('f4000000-0000-4000-8000-000000000112','d0e00000-0000-0000-0000-00000000000a','vendor',
     'Mixed Kinds','(612) 555-0888','active','a0000000-0000-0000-0000-000000000004','2026-06-01T00:00:00Z');

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

  SELECT count(*) INTO n FROM public.people_directory WHERE display_name = 'Mixed Kinds';
  IF n <> 1 THEN
    RAISE EXCEPTION '4f a mixed-kind uncarded human must be ONE row, found %', n;
  END IF;

  SELECT person_id, seat_count INTO v_person, n
    FROM public.people_directory WHERE display_name = 'Mixed Kinds';
  IF v_person <> 'f4000000-0000-4000-8000-000000000111' THEN
    RAISE EXCEPTION '4g the Directory must win on a seat it actually emits (the sub), got %', v_person;
  END IF;
  IF n <> 2 THEN RAISE EXCEPTION '4h seat_count must count every kind, got %', n; END IF;

  SELECT count(*) INTO n FROM public.people_directory_seats WHERE person_id = v_person;
  IF n <> 2 THEN
    RAISE EXCEPTION '4i the row claims 2 seats and nests % — the two views picked different winners', n;
  END IF;

  SELECT count(*) INTO n FROM public.people_directory_seats
   WHERE person_id = v_person AND party_kind = 'vendor';
  IF n <> 1 THEN
    RAISE EXCEPTION '4j the vendor seat must nest under the same identity row, found %', n;
  END IF;

  -- the invariant itself, over EVERY Directory row the caller can see:
  -- what a row claims is what it nests.
  SELECT count(*) INTO n
    FROM public.people_directory pd
   WHERE pd.seat_count > 0
     AND pd.seat_count <> (
           SELECT count(*) FROM public.people_directory_seats s
            WHERE s.person_id = pd.person_id);
  IF n <> 0 THEN
    RAISE EXCEPTION '4k % Directory rows claim a seat count they cannot nest', n;
  END IF;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '4. the uncarded identity: two seats on two jobs collapse to one row keyed on the phone, pointing at the newest seat, reach reads a live door on a NON-winning seat (and stops reading a revoked or expired one), a mixed-kind identity nests every seat it claims, and no row anywhere claims a count it cannot nest: passed';
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
  v_id     uuid;
  v_prior  uuid;
  v_exp    timestamptz;
  v_status text;
  n        integer;
  raised   text;
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

  -- A CLOSED window cannot date a live grant (w1b r1 MAJOR-1). Taking it
  -- unconditionally stamped the token in the past and revoked the link the
  -- trade was already using in the same call, and the shipped SMS rail
  -- (_shared/sms.ts:624-629, any {{link}} template) texted that dead URL.
  INSERT INTO public.project_parties
    (id, project_id, party_kind, display_name, phone, stage,
     on_site_from, on_site_to, created_by)
  VALUES ('f4000000-0000-4000-8000-000000000004','f3000000-0000-4000-8000-00000000000a','sub',
          'Closed Window Person','(612) 555-0914','off_job',
          CURRENT_DATE - 90, CURRENT_DATE - 30,'a0000000-0000-0000-0000-000000000004');

  SELECT id INTO v_prior FROM public.create_field_link('f4000000-0000-4000-8000-000000000004');
  SELECT expires_at INTO v_exp FROM public.field_link_tokens WHERE id = v_prior;
  IF v_exp <= now() THEN
    RAISE EXCEPTION '10h a closed window minted a token dated in the past: %', v_exp;
  END IF;
  IF v_exp::date <> (now() + interval '90 days')::date THEN
    RAISE EXCEPTION '10i a closed window must fall to the 90-day default, got %', v_exp;
  END IF;

  -- and the link the studio just copied is actually live
  IF public.reach_state_for(NULL, NULL, 'f4000000-0000-4000-8000-000000000004') <> 'field_link' THEN
    RAISE EXCEPTION '10j the minted link is not live: reach reads %',
      public.reach_state_for(NULL, NULL, 'f4000000-0000-4000-8000-000000000004');
  END IF;

  -- a caller date in the past is not stamped either
  SELECT id INTO v_id
    FROM public.create_field_link('f4000000-0000-4000-8000-000000000004',
                                  now() - interval '1 day');
  SELECT expires_at INTO v_exp FROM public.field_link_tokens WHERE id = v_id;
  IF v_exp <= now() THEN
    RAISE EXCEPTION '10k a caller date in the past was stamped: %', v_exp;
  END IF;

  -- the prior token was superseded only by a mint that could succeed
  SELECT status INTO v_status FROM public.field_link_tokens WHERE id = v_prior;
  IF v_status <> 'revoked' THEN
    RAISE EXCEPTION '10l the prior token reads % after a successful mint', v_status;
  END IF;
  SELECT count(*) INTO n FROM public.field_link_tokens
   WHERE party_id = 'f4000000-0000-4000-8000-000000000004' AND status = 'active';
  IF n <> 1 THEN
    RAISE EXCEPTION '10m the closed-window seat carries % active tokens', n;
  END IF;

  -- no mint anywhere in this block left a live token dated in the past
  SELECT count(*) INTO n FROM public.field_link_tokens
   WHERE status = 'active' AND expires_at <= now()
     AND party_id IN ('f4000000-0000-4000-8000-000000000001',
                      'f4000000-0000-4000-8000-000000000002',
                      'f4000000-0000-4000-8000-000000000003',
                      'f4000000-0000-4000-8000-000000000004');
  IF n <> 0 THEN
    RAISE EXCEPTION '10n % live tokens are dated in the past', n;
  END IF;

  RAISE NOTICE '10. create_field_link: the engagement window sets the expiry and outranks a caller date, warranty answers alone, the 90-day fallback survives for a windowless seat and for a CLOSED one, no mint is dated in the past or revokes on behalf of one, and the supersede and 00284''s ownership guard are untouched: passed';
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
