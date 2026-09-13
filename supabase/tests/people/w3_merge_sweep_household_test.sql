-- ═══════════════════════════════════════════════════════════════════════════
-- W3 (P2) — the merge record, the expiry sweep, bids, households, the widened
--           decision court, the archive door, and R-BD's studio_id backfill
--
-- Migrations under test: 00628 (projects.studio_id backfill), 00629
-- (studio_contacts.merged_into + studio_contact_merges +
-- merge_studio_contacts + resolve_merged_contact + the merged-card seat guard
-- + people_directory v5 + archive/restore), 00630
-- (studio_compliance_notices + compliance_document_state +
-- sweep_compliance_expiries + the nightly cron), 00631 (project_parties' bid
-- fields + assert_party_bid_quoted_by + the trade_rfq backfill), 00632
-- (client_households + designer_clients.household_id + add_household_member),
-- 00633 (client_decisions.court widened).
--
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--        -v ON_ERROR_STOP=1 -f supabase/tests/people/w3_merge_sweep_household_test.sql
--
-- One transaction, ROLLBACKed. Every block builds its own fixture under the
-- f9… id space, so nothing here collides with W1a's or W1b's, and the seeded
-- Okonkwo book is only ever READ (block 2 scopes every count to its own
-- document ids, because the seed's own F-11 lapse is swept at the same time).
--
-- Block 6 DISABLES set_project_studio_id (00317) to stage its fixture. That is
-- deliberate and named: the trigger now derives studio_id on INSERT and on
-- UPDATE, so the legacy shape R-BD repairs — a project carrying NULL — can no
-- longer be written through it. The backfill statement under test is 00628's,
-- restated here for the same reason W1b block 21 restates 00624's stage
-- backfill: a migration's one-time statement is a no-op on every reset and
-- only ever really runs at the deploy.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

-- ─── helpers (the W1a / W1b shape) ─────────────────────────────────────────
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

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ─── the studio, its three standings, and its rolodex ─────────────────────
-- a0…0004 is the owner, a0…0003 a plain member (what PR-n narrows), and
-- a0…0005 belongs to nothing here at all.
INSERT INTO public.organizations (id, type, name, slug, status) VALUES
  ('f9000000-0000-4000-8000-00000000000a', 'design_studio', 'W3 Test Studio', 'w3-studio-a', 'active'),
  ('f9000000-0000-4000-8000-00000000000b', 'design_studio', 'W3 Lone Studio', 'w3-studio-b', 'active');

INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at) VALUES
  ('a0000000-0000-0000-0000-000000000004', 'f9000000-0000-4000-8000-00000000000a', 'owner',  'active', now()),
  ('a0000000-0000-0000-0000-000000000003', 'f9000000-0000-4000-8000-00000000000a', 'member', 'active', now()),
  -- a0…0007 (support@patina.dev) holds NO other membership, so this is the
  -- unambiguous single-membership designer block 6 needs.
  ('a0000000-0000-0000-0000-000000000007', 'f9000000-0000-4000-8000-00000000000b', 'owner',  'active', now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role, status = 'active';

-- Person cards. A is the survivor (the older card, PR-o's pre-pick); B is
-- merged away; SOLE is a declared sole proprietor; PLAIN is not.
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, phone, email, created_by, created_at) VALUES
  ('f9100000-0000-4000-8000-00000000000a','f9000000-0000-4000-8000-00000000000a','person','sub','Dana Survivor','(612) 555-0901','dana@northgate.test','a0000000-0000-0000-0000-000000000004','2025-01-01'),
  ('f9100000-0000-4000-8000-00000000000b','f9000000-0000-4000-8000-00000000000a','person','sub','Dana Duplicate','(612) 555-0901',NULL,'a0000000-0000-0000-0000-000000000004','2026-01-01'),
  ('f9100000-0000-4000-8000-00000000000c','f9000000-0000-4000-8000-00000000000a','person','sub','Sole Prop','(612) 555-0903',NULL,'a0000000-0000-0000-0000-000000000004','2025-02-01'),
  ('f9100000-0000-4000-8000-00000000000d','f9000000-0000-4000-8000-00000000000a','person','sub','Plain Person','(612) 555-0904',NULL,'a0000000-0000-0000-0000-000000000004','2025-02-01'),
  ('f9100000-0000-4000-8000-00000000000e','f9000000-0000-4000-8000-00000000000a','person','client','Adaeze Test','(612) 555-0905',NULL,'a0000000-0000-0000-0000-000000000004','2025-03-01'),
  ('f9100000-0000-4000-8000-00000000000f','f9000000-0000-4000-8000-00000000000a','person','client_rep','Chidi Test','(612) 555-0906',NULL,'a0000000-0000-0000-0000-000000000004','2025-03-01'),
  ('f9100000-0000-4000-8000-000000000010','f9000000-0000-4000-8000-00000000000a','person','client_rep','No Figure Rep','(612) 555-0907',NULL,'a0000000-0000-0000-0000-000000000004','2025-03-01');

UPDATE public.studio_contacts SET is_sole_proprietor = true
 WHERE id = 'f9100000-0000-4000-8000-00000000000c';

-- Company cards. FIRM holds the paper and the designations; ONEMAN is the
-- sole proprietor's own firm; PAPER is block 2's holder.
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, company_name, company_kind, created_by) VALUES
  ('f9200000-0000-4000-8000-00000000000a','f9000000-0000-4000-8000-00000000000a','company','sub','Northgate Test Electric','sub','a0000000-0000-0000-0000-000000000004'),
  ('f9200000-0000-4000-8000-00000000000b','f9000000-0000-4000-8000-00000000000a','company','sub','One Man Band LLC','sub','a0000000-0000-0000-0000-000000000004'),
  ('f9200000-0000-4000-8000-00000000000c','f9000000-0000-4000-8000-00000000000a','company','sub','Paper Holder Co','sub','a0000000-0000-0000-0000-000000000004');

-- The job.
INSERT INTO public.projects
  (id, name, designer_id, studio_id, status, created_by, client_visibility_tier) VALUES
  ('f9300000-0000-4000-8000-00000000000a','W3 test job','a0000000-0000-0000-0000-000000000004','f9000000-0000-4000-8000-00000000000a','active','a0000000-0000-0000-0000-000000000004','full');

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. merge_studio_contacts — everything repoints, both ids stay resolvable
-- ═══════════════════════════════════════════════════════════════════════════
-- What the merged card carries before the act: a duplicate mobile, a unique
-- email, an open affiliation, a contact rule, a compliance paper, all three
-- designations on another firm's card, and a seat on the job.
INSERT INTO public.studio_contact_channels (owner_type, owner_id, channel_kind, value, sms_capable) VALUES
  ('person','f9100000-0000-4000-8000-00000000000a','mobile','(612) 555-0901', true),
  ('person','f9100000-0000-4000-8000-00000000000b','mobile','(612) 555-0901', true),
  ('person','f9100000-0000-4000-8000-00000000000b','email','Dana.Dup@Northgate.test', false);

INSERT INTO public.studio_person_affiliations (person_id, company_id, role_at_firm, from_date) VALUES
  ('f9100000-0000-4000-8000-00000000000b','f9200000-0000-4000-8000-00000000000a','owner','2025-05-01');

INSERT INTO public.studio_contact_rules (subject_type, subject_id, channels_forbidden, reason) VALUES
  ('person','f9100000-0000-4000-8000-00000000000b', ARRAY['email']::text[], 'Text only. The email on file bounces.');

INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, blocks, issued_on, expires_on) VALUES
  ('f9400000-0000-4000-8000-00000000000a','f9000000-0000-4000-8000-00000000000a','person',
   'f9100000-0000-4000-8000-00000000000b','license', ARRAY['site_access']::text[], '2025-01-01','2027-01-01');

UPDATE public.studio_contacts
   SET paperwork_contact_person_id = 'f9100000-0000-4000-8000-00000000000b',
       signer_person_id            = 'f9100000-0000-4000-8000-00000000000b',
       site_contact_person_id      = 'f9100000-0000-4000-8000-00000000000b'
 WHERE id = 'f9200000-0000-4000-8000-00000000000a';

INSERT INTO public.project_parties
  (id, project_id, party_kind, display_name, phone, studio_contact_id,
   company_id, warranty_contact_person_id, created_by) VALUES
  ('f9500000-0000-4000-8000-00000000000a','f9300000-0000-4000-8000-00000000000a','sub','Dana Duplicate','(612) 555-0901',
   'f9100000-0000-4000-8000-00000000000b','f9200000-0000-4000-8000-00000000000a',
   'f9100000-0000-4000-8000-00000000000b','a0000000-0000-0000-0000-000000000004');

-- ── a non-member may not merge ────────────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
  BEGIN
    PERFORM public.merge_studio_contacts(
      'f9100000-0000-4000-8000-00000000000a','f9100000-0000-4000-8000-00000000000b','phone');
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'BLOCK 1 FAIL: a non-member merged two cards';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.reset_role();
    IF SQLERRM NOT LIKE '%merge_not_a_member%' THEN
      RAISE EXCEPTION 'BLOCK 1 FAIL: expected merge_not_a_member, got %', SQLERRM;
    END IF;
  END;
END $$;

-- ── the merge itself, as a plain MEMBER (PR-o: the studio's call, not the
--    owner's alone) ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_survivor uuid;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  v_survivor := public.merge_studio_contacts(
    'f9100000-0000-4000-8000-00000000000a','f9100000-0000-4000-8000-00000000000b','phone');
  PERFORM pg_temp.reset_role();
  IF v_survivor <> 'f9100000-0000-4000-8000-00000000000a' THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: merge returned % not the survivor', v_survivor;
  END IF;
END $$;

DO $$
DECLARE
  n integer;
  v uuid;
  t text;
BEGIN
  -- channels: union, the duplicate mobile dropped, the email moved across
  SELECT count(*) INTO n FROM public.studio_contact_channels
   WHERE owner_id = 'f9100000-0000-4000-8000-00000000000a';
  IF n <> 2 THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: survivor holds % channels, expected 2', n;
  END IF;
  SELECT count(*) INTO n FROM public.studio_contact_channels
   WHERE owner_id = 'f9100000-0000-4000-8000-00000000000b';
  IF n <> 0 THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: merged card still holds % channels', n;
  END IF;
  SELECT count(*) INTO n FROM public.studio_contact_channels
   WHERE owner_id = 'f9100000-0000-4000-8000-00000000000a'
     AND channel_kind = 'mobile';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: the duplicate mobile was not dropped (% rows)', n;
  END IF;
  SELECT owner_type INTO t FROM public.studio_contact_channels
   WHERE owner_id = 'f9100000-0000-4000-8000-00000000000a' AND channel_kind = 'email';
  IF t <> 'person' THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: moved channel carries owner_type %', t;
  END IF;

  -- affiliation
  SELECT count(*) INTO n FROM public.studio_person_affiliations
   WHERE person_id = 'f9100000-0000-4000-8000-00000000000a'
     AND company_id = 'f9200000-0000-4000-8000-00000000000a';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: affiliation did not repoint (% rows)', n;
  END IF;
  -- and the derived legacy pointer followed it (00592's binding)
  SELECT company_id INTO v FROM public.studio_contacts
   WHERE id = 'f9100000-0000-4000-8000-00000000000a';
  IF v IS DISTINCT FROM 'f9200000-0000-4000-8000-00000000000a' THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: survivor company_id is %', v;
  END IF;

  -- contact rule: the survivor had none, so the merged card's became the rule
  SELECT count(*) INTO n FROM public.studio_contact_rules
   WHERE subject_type = 'person' AND subject_id = 'f9100000-0000-4000-8000-00000000000a';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: rule did not repoint (% rows)', n;
  END IF;

  -- compliance document: crm-model §4 — the absorbed card's paper KEEPS ITS
  -- ORIGINAL HOLDER ID unless the survivor already holds the same paper in
  -- force to supersede it. The survivor holds no `license` at all, so this one
  -- stays where it is rather than being moved onto a card that never earned it
  -- (r1 B-1).
  SELECT holder_id INTO v FROM public.studio_compliance_documents
   WHERE id = 'f9400000-0000-4000-8000-00000000000a';
  IF v <> 'f9100000-0000-4000-8000-00000000000b' THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: document holder is % (crm-model §4 keeps it on the absorbed card)', v;
  END IF;
  SELECT count(*) INTO n FROM public.studio_compliance_documents
   WHERE id = 'f9400000-0000-4000-8000-00000000000a' AND superseded_by IS NOT NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: an absorbed paper with no successor was marked superseded';
  END IF;

  -- the three designations another card held
  SELECT count(*) INTO n FROM public.studio_contacts
   WHERE id = 'f9200000-0000-4000-8000-00000000000a'
     AND paperwork_contact_person_id = 'f9100000-0000-4000-8000-00000000000a'
     AND signer_person_id            = 'f9100000-0000-4000-8000-00000000000a'
     AND site_contact_person_id      = 'f9100000-0000-4000-8000-00000000000a';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: designations did not repoint';
  END IF;

  -- the seat, and its warranty contact
  SELECT count(*) INTO n FROM public.project_parties
   WHERE id = 'f9500000-0000-4000-8000-00000000000a'
     AND studio_contact_id = 'f9100000-0000-4000-8000-00000000000a'
     AND warranty_contact_person_id = 'f9100000-0000-4000-8000-00000000000a';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: the seat did not repoint';
  END IF;

  -- BOTH IDS STAY RESOLVABLE (PR-o)
  IF public.resolve_merged_contact('f9100000-0000-4000-8000-00000000000b')
     <> 'f9100000-0000-4000-8000-00000000000a' THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: the merged id does not resolve to the survivor';
  END IF;
  IF public.resolve_merged_contact('f9100000-0000-4000-8000-00000000000a')
     <> 'f9100000-0000-4000-8000-00000000000a' THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: a live id does not resolve to itself';
  END IF;
  SELECT count(*) INTO n FROM public.studio_contacts
   WHERE id = 'f9100000-0000-4000-8000-00000000000b';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: the merged card was deleted';
  END IF;

  -- the record
  SELECT count(*) INTO n FROM public.studio_contact_merges
   WHERE survivor_id = 'f9100000-0000-4000-8000-00000000000a'
     AND merged_id   = 'f9100000-0000-4000-8000-00000000000b'
     AND matched_on  = 'phone'
     AND merged_by   = 'a0000000-0000-0000-0000-000000000003'
     AND organization_id = 'f9000000-0000-4000-8000-00000000000a';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: the merge record is missing or wrong (% rows)', n;
  END IF;
END $$;

-- ── the Directory folds the merged card away, and keeps the survivor ──────
DO $$
DECLARE
  n_surv integer;
  n_gone integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT count(*) INTO n_surv FROM public.people_directory
   WHERE person_id = 'f9100000-0000-4000-8000-00000000000a';
  SELECT count(*) INTO n_gone FROM public.people_directory
   WHERE person_id = 'f9100000-0000-4000-8000-00000000000b';
  PERFORM pg_temp.reset_role();
  IF n_surv <> 1 THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: the survivor has % Directory rows', n_surv;
  END IF;
  IF n_gone <> 0 THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: the merged card still emits % Directory row(s)', n_gone;
  END IF;
END $$;

-- ── a later write may not stamp a seat with the merged card ───────────────
DO $$
BEGIN
  BEGIN
    INSERT INTO public.project_parties
      (project_id, party_kind, display_name, studio_contact_id, created_by)
    VALUES
      ('f9300000-0000-4000-8000-00000000000a','sub','Stale Pick',
       'f9100000-0000-4000-8000-00000000000b','a0000000-0000-0000-0000-000000000004');
    RAISE EXCEPTION 'BLOCK 1 FAIL: a seat was stamped with a merged-away card';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%party_card_merged_away%' THEN
      RAISE EXCEPTION 'BLOCK 1 FAIL: expected party_card_merged_away, got %', SQLERRM;
    END IF;
  END;
END $$;

-- ── merging twice is refused, and the chain is flat ───────────────────────
DO $$
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  BEGIN
    PERFORM public.merge_studio_contacts(
      'f9100000-0000-4000-8000-00000000000d','f9100000-0000-4000-8000-00000000000b','manual');
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'BLOCK 1 FAIL: an already-merged card was merged again';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.reset_role();
    IF SQLERRM NOT LIKE '%merge_already_merged%' THEN
      RAISE EXCEPTION 'BLOCK 1 FAIL: expected merge_already_merged, got %', SQLERRM;
    END IF;
  END;
END $$;

-- ── NO COMPANY INTO A PERSON, unless the person is a sole proprietor ──────
DO $$
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

  -- a firm into a person who is NOT a declared sole proprietor
  BEGIN
    PERFORM public.merge_studio_contacts(
      'f9100000-0000-4000-8000-00000000000d','f9200000-0000-4000-8000-00000000000a','manual');
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'BLOCK 1 FAIL: a firm merged into a plain person';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%merge_kind_mismatch%' THEN
      PERFORM pg_temp.reset_role();
      RAISE EXCEPTION 'BLOCK 1 FAIL: expected merge_kind_mismatch, got %', SQLERRM;
    END IF;
  END;

  -- a person into a firm, always refused (crm-model §4 states one direction)
  BEGIN
    PERFORM public.merge_studio_contacts(
      'f9200000-0000-4000-8000-00000000000a','f9100000-0000-4000-8000-00000000000d','manual');
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'BLOCK 1 FAIL: a person merged into a firm';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%merge_kind_mismatch%' THEN
      PERFORM pg_temp.reset_role();
      RAISE EXCEPTION 'BLOCK 1 FAIL: expected merge_kind_mismatch, got %', SQLERRM;
    END IF;
  END;

  PERFORM pg_temp.reset_role();
END $$;

-- ── the one permitted cross-kind merge: the sole proprietor's own firm ────
INSERT INTO public.studio_person_affiliations (person_id, company_id, role_at_firm, from_date) VALUES
  ('f9100000-0000-4000-8000-00000000000c','f9200000-0000-4000-8000-00000000000b','owner','2025-02-01');
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, blocks, issued_on, expires_on) VALUES
  ('f9400000-0000-4000-8000-00000000000b','f9000000-0000-4000-8000-00000000000a','company',
   'f9200000-0000-4000-8000-00000000000b','coi_gl', ARRAY['payment']::text[], '2026-01-01','2027-06-30');

DO $$
DECLARE
  n integer;
  t text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.merge_studio_contacts(
    'f9100000-0000-4000-8000-00000000000c','f9200000-0000-4000-8000-00000000000b','company_name');
  PERFORM pg_temp.reset_role();

  -- the firm's paper moved across, and its holder_type became `person`
  SELECT holder_type INTO t FROM public.studio_compliance_documents
   WHERE id = 'f9400000-0000-4000-8000-00000000000b';
  IF t <> 'person' THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: the sole prop''s paper holder_type is %', t;
  END IF;
  SELECT count(*) INTO n FROM public.studio_compliance_documents
   WHERE id = 'f9400000-0000-4000-8000-00000000000b'
     AND holder_id = 'f9100000-0000-4000-8000-00000000000c';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: the sole prop''s paper did not repoint';
  END IF;

  -- the affiliation of a person at themselves is dropped, never written
  SELECT count(*) INTO n FROM public.studio_person_affiliations
   WHERE person_id = 'f9100000-0000-4000-8000-00000000000c';
  IF n <> 0 THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: % affiliation(s) survived the sole-prop merge', n;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1b. What a merge must NOT do, and the four pointers it must not miss
-- ═══════════════════════════════════════════════════════════════════════════
-- Round 1 of the adversarial migration review found four defects that a green
-- suite could not see, because block 1 asserted the GUARDS and never the
-- REPOINTING: B-1 (a firm merge flipped the survivor's paper word to lapsed),
-- B-2 (the ordinary roster write was refused outright afterwards), M-1 (the
-- shared-phone merge left the auto-link ambiguous forever), M-2 (the seat's
-- bid estimator was never repointed) and M-3 (a household was bricked by a
-- member merge). Each has an assertion here.

-- ── B-1 · THE SURVIVOR'S PAPER WORD, BEFORE AND AFTER A FIRM MERGE ────────
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, company_name, company_kind, created_by) VALUES
  ('f9200000-0000-4000-8000-00000000000d','f9000000-0000-4000-8000-00000000000a','company','sub','Acquiring Firm','sub','a0000000-0000-0000-0000-000000000004'),
  ('f9200000-0000-4000-8000-00000000000e','f9000000-0000-4000-8000-00000000000a','company','sub','Absorbed Firm','sub','a0000000-0000-0000-0000-000000000004');

INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, blocks, issued_on, expires_on) VALUES
  -- the survivor's own certificate, current for another ten months
  ('f9400000-0000-4000-8000-00000000000c','f9000000-0000-4000-8000-00000000000a','company',
   'f9200000-0000-4000-8000-00000000000d','coi_gl', ARRAY['site_access']::text[],
   CURRENT_DATE - 60, CURRENT_DATE + 300),
  -- the absorbed firm's, lapsed a month ago — the row that used to move
  ('f9400000-0000-4000-8000-00000000000d','f9000000-0000-4000-8000-00000000000a','company',
   'f9200000-0000-4000-8000-00000000000e','coi_gl', ARRAY['site_access']::text[],
   CURRENT_DATE - 400, CURRENT_DATE - 30),
  -- and a lapsed paper the survivor holds NOTHING of the same kind to retire
  ('f9400000-0000-4000-8000-00000000000e','f9000000-0000-4000-8000-00000000000a','company',
   'f9200000-0000-4000-8000-00000000000e','bond', ARRAY['payment']::text[],
   CURRENT_DATE - 400, CURRENT_DATE - 10);

DO $$
DECLARE
  w_before text;
  w_after  text;
  n        integer;
BEGIN
  w_before := public.compliance_state('f9200000-0000-4000-8000-00000000000d');
  IF w_before <> 'current' THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: the survivor firm reads % before the merge', w_before;
  END IF;

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.merge_studio_contacts(
    'f9200000-0000-4000-8000-00000000000d','f9200000-0000-4000-8000-00000000000e','company_name');
  PERFORM pg_temp.reset_role();

  w_after := public.compliance_state('f9200000-0000-4000-8000-00000000000d');
  IF w_after <> 'current' THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: the merge flipped the survivor''s paper word to % (r1 B-1)', w_after;
  END IF;

  -- the absorbed certificate moved, and says WHY it no longer counts
  SELECT count(*) INTO n FROM public.studio_compliance_documents
   WHERE id = 'f9400000-0000-4000-8000-00000000000d'
     AND holder_id     = 'f9200000-0000-4000-8000-00000000000d'
     AND superseded_by = 'f9400000-0000-4000-8000-00000000000c';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: the absorbed certificate was not superseded by the survivor''s';
  END IF;

  -- the absorbed paper with NO successor stays where crm-model §4 puts it
  SELECT count(*) INTO n FROM public.studio_compliance_documents
   WHERE id = 'f9400000-0000-4000-8000-00000000000e'
     AND holder_id = 'f9200000-0000-4000-8000-00000000000e'
     AND superseded_by IS NULL;
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: a lapsed paper with no successor was moved onto the survivor';
  END IF;
END $$;

-- ── B-2 / M-1 · THE ORDINARY ROSTER WRITE, AFTER A SHARED-PHONE MERGE ─────
-- Block 1 merged Dana Duplicate into Dana Survivor on their shared number.
-- Both cards still carry it, so the "exactly one card" test could only answer
-- again once merged_into was excluded from the resolver.
DO $$
DECLARE
  v_card uuid;
  v_seat uuid;
  v_stamp uuid;
BEGIN
  v_card := public.rolodex_card_for_party_phone(
    'f9300000-0000-4000-8000-00000000000a', '+16125550901');
  IF v_card IS DISTINCT FROM 'f9100000-0000-4000-8000-00000000000a' THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: the shared number resolves to % not the survivor (r1 M-1)', v_card;
  END IF;

  -- the room's own act: no card named, a phone supplied
  INSERT INTO public.project_parties
    (project_id, party_kind, display_name, phone, created_by)
  VALUES
    ('f9300000-0000-4000-8000-00000000000a','sub','Ordinary Add','(612) 555-0901',
     'a0000000-0000-0000-0000-000000000004')
  RETURNING id INTO v_seat;

  SELECT studio_contact_id INTO v_stamp FROM public.project_parties WHERE id = v_seat;
  IF v_stamp IS DISTINCT FROM 'f9100000-0000-4000-8000-00000000000a' THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: the new seat was stamped % (r1 B-2)', v_stamp;
  END IF;
  DELETE FROM public.project_parties WHERE id = v_seat;
END $$;

-- ── M-2 · THE SEAT'S BID ESTIMATOR ────────────────────────────────────────
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, phone, created_by, created_at) VALUES
  ('f9100000-0000-4000-8000-000000000011','f9000000-0000-4000-8000-00000000000a','person','sub','Tom Estimator','(612) 555-0911','a0000000-0000-0000-0000-000000000004','2025-04-01'),
  ('f9100000-0000-4000-8000-000000000012','f9000000-0000-4000-8000-00000000000a','person','sub','Tom Estimator Dup','(612) 555-0912','a0000000-0000-0000-0000-000000000004','2026-04-01');

INSERT INTO public.project_parties
  (id, project_id, party_kind, display_name, created_by,
   bid_outcome, bid_due_at, bid_asked_at, bid_quoted_at, bid_quoted_by_person_id) VALUES
  ('f9500000-0000-4000-8000-00000000000b','f9300000-0000-4000-8000-00000000000a','sub','Priced Seat',
   'a0000000-0000-0000-0000-000000000004','quoted','2026-10-05','2026-09-28','2026-10-02',
   'f9100000-0000-4000-8000-000000000012');

DO $$
DECLARE
  v uuid;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.merge_studio_contacts(
    'f9100000-0000-4000-8000-000000000011','f9100000-0000-4000-8000-000000000012','profile');
  PERFORM pg_temp.reset_role();

  SELECT bid_quoted_by_person_id INTO v FROM public.project_parties
   WHERE id = 'f9500000-0000-4000-8000-00000000000b';
  IF v IS DISTINCT FROM 'f9100000-0000-4000-8000-000000000011' THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: bid_quoted_by_person_id is % after the merge (r1 M-2)', v;
  END IF;

  -- and the next ordinary save of that bid is not refused
  UPDATE public.project_parties
     SET bid_amount_cents = 1234500, bid_selected_at = '2026-10-09', bid_outcome = 'selected'
   WHERE id = 'f9500000-0000-4000-8000-00000000000b';

  -- M-6: the three dated events are columns, and they hold what was written
  PERFORM 1 FROM public.project_parties
   WHERE id = 'f9500000-0000-4000-8000-00000000000b'
     AND bid_asked_at    = DATE '2026-09-28'
     AND bid_quoted_at   = DATE '2026-10-02'
     AND bid_selected_at = DATE '2026-10-09';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: the asked/quoted/selected dates did not round-trip (r1 M-6)';
  END IF;
END $$;

-- ── M-3 · A HOUSEHOLD SURVIVES A MEMBER MERGE ─────────────────────────────
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, phone, created_by, created_at) VALUES
  ('f9100000-0000-4000-8000-000000000013','f9000000-0000-4000-8000-00000000000a','person','client_rep','Spouse Survivor','(612) 555-0913','a0000000-0000-0000-0000-000000000004','2025-05-01'),
  ('f9100000-0000-4000-8000-000000000014','f9000000-0000-4000-8000-00000000000a','person','client_rep','Spouse Duplicate','(612) 555-0914','a0000000-0000-0000-0000-000000000004','2026-05-01');

-- BOTH ids are already members, which is the shape a plain array_replace would
-- leave carrying the survivor twice.
INSERT INTO public.client_households
  (id, organization_id, designer_id, display_name, member_person_ids,
   primary_member_person_id, created_by) VALUES
  ('f9600000-0000-4000-8000-00000000000c','f9000000-0000-4000-8000-00000000000a',
   'a0000000-0000-0000-0000-000000000004','Merge household',
   ARRAY['f9100000-0000-4000-8000-000000000013','f9100000-0000-4000-8000-000000000014']::uuid[],
   'f9100000-0000-4000-8000-000000000014','a0000000-0000-0000-0000-000000000004');

DO $$
DECLARE
  v_arr  uuid[];
  v_prim uuid;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.merge_studio_contacts(
    'f9100000-0000-4000-8000-000000000013','f9100000-0000-4000-8000-000000000014','profile');

  SELECT member_person_ids, primary_member_person_id INTO v_arr, v_prim
    FROM public.client_households WHERE id = 'f9600000-0000-4000-8000-00000000000c';
  IF v_arr <> ARRAY['f9100000-0000-4000-8000-000000000013']::uuid[] THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: the household holds % after the merge (r1 M-3)', v_arr;
  END IF;
  IF v_prim IS DISTINCT FROM 'f9100000-0000-4000-8000-000000000013' THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: the primary member is % after the merge', v_prim;
  END IF;

  -- the row is not bricked: the room's own act still writes to it
  PERFORM public.add_household_member(
    'f9600000-0000-4000-8000-00000000000c','f9100000-0000-4000-8000-00000000000e',
    'client', NULL);
  PERFORM pg_temp.reset_role();

  SELECT member_person_ids INTO v_arr
    FROM public.client_households WHERE id = 'f9600000-0000-4000-8000-00000000000c';
  IF NOT ('f9100000-0000-4000-8000-00000000000e' = ANY (v_arr)) THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: add_household_member could not write after a member merge';
  END IF;
END $$;

-- ── M-4 · PR-n OVER A CHANGE: a plain member may not ERASE the figure ─────
DO $$
DECLARE
  v integer;
BEGIN
  UPDATE public.client_households SET co_threshold_cents = 250000
   WHERE id = 'f9600000-0000-4000-8000-00000000000c';

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  BEGIN
    UPDATE public.client_households SET co_threshold_cents = NULL
     WHERE id = 'f9600000-0000-4000-8000-00000000000c';
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'BLOCK 1b FAIL: a plain member erased the change-order figure (r1 M-4)';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.reset_role();
    IF SQLERRM NOT LIKE '%household_threshold_forbidden%' THEN
      RAISE EXCEPTION 'BLOCK 1b FAIL: expected household_threshold_forbidden, got %', SQLERRM;
    END IF;
  END;

  SELECT co_threshold_cents INTO v FROM public.client_households
   WHERE id = 'f9600000-0000-4000-8000-00000000000c';
  IF v IS DISTINCT FROM 250000 THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: the figure is % after the refused write', v;
  END IF;

  -- the owner may, in both directions
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  UPDATE public.client_households SET co_threshold_cents = 500000
   WHERE id = 'f9600000-0000-4000-8000-00000000000c';
  UPDATE public.client_households SET co_threshold_cents = NULL
   WHERE id = 'f9600000-0000-4000-8000-00000000000c';
  PERFORM pg_temp.reset_role();
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. sweep_compliance_expiries — one notice per (document, state)
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, doc_label, blocks, issued_on, expires_on) VALUES
  -- lapsed, gating
  ('f9400000-0000-4000-8000-00000000010a','f9000000-0000-4000-8000-00000000000a','company',
   'f9200000-0000-4000-8000-00000000000c','coi_gl',NULL, ARRAY['draw']::text[],
   CURRENT_DATE - 400, CURRENT_DATE - 10),
  -- inside the 30-day window, gating
  ('f9400000-0000-4000-8000-00000000010b','f9000000-0000-4000-8000-00000000000a','company',
   'f9200000-0000-4000-8000-00000000000c','coi_wc',NULL, ARRAY['payment']::text[],
   CURRENT_DATE - 300, CURRENT_DATE + 10),
  -- undated: held, never news
  ('f9400000-0000-4000-8000-00000000010c','f9000000-0000-4000-8000-00000000000a','company',
   'f9200000-0000-4000-8000-00000000000c','w9',NULL, ARRAY[]::text[], CURRENT_DATE - 300, NULL),
  -- dated but holding NO gate: a date with no gate changes nothing (CS2 §4)
  ('f9400000-0000-4000-8000-00000000010d','f9000000-0000-4000-8000-00000000000a','company',
   'f9200000-0000-4000-8000-00000000000c','bond',NULL, ARRAY[]::text[],
   CURRENT_DATE - 300, CURRENT_DATE - 5),
  -- gating and far from its date
  ('f9400000-0000-4000-8000-00000000010e','f9000000-0000-4000-8000-00000000000a','company',
   'f9200000-0000-4000-8000-00000000000c','license',NULL, ARRAY['site_access']::text[],
   CURRENT_DATE - 300, CURRENT_DATE + 200);

DO $$
DECLARE
  w text;
BEGIN
  w := public.compliance_document_state('f9400000-0000-4000-8000-00000000010a');
  IF w <> 'lapsed' THEN RAISE EXCEPTION 'BLOCK 2 FAIL: lapsed paper reads %', w; END IF;
  w := public.compliance_document_state('f9400000-0000-4000-8000-00000000010b');
  IF w <> 'lapses_soon' THEN RAISE EXCEPTION 'BLOCK 2 FAIL: 10-day paper reads %', w; END IF;
  w := public.compliance_document_state('f9400000-0000-4000-8000-00000000010c');
  IF w <> 'held' THEN RAISE EXCEPTION 'BLOCK 2 FAIL: undated paper reads %', w; END IF;
  w := public.compliance_document_state('f9400000-0000-4000-8000-00000000010d');
  IF w <> 'held' THEN RAISE EXCEPTION 'BLOCK 2 FAIL: gateless paper reads %', w; END IF;
  w := public.compliance_document_state('f9400000-0000-4000-8000-00000000010e');
  IF w <> 'current' THEN RAISE EXCEPTION 'BLOCK 2 FAIL: in-force paper reads %', w; END IF;
END $$;

DO $$
DECLARE
  n        integer;
  n_notif  integer;
  n_admins integer;
  n_runs   integer;
BEGIN
  PERFORM public.sweep_compliance_expiries();

  SELECT count(*) INTO n FROM public.studio_compliance_notices
   WHERE document_id IN ('f9400000-0000-4000-8000-00000000010a',
                         'f9400000-0000-4000-8000-00000000010b',
                         'f9400000-0000-4000-8000-00000000010c',
                         'f9400000-0000-4000-8000-00000000010d',
                         'f9400000-0000-4000-8000-00000000010e');
  IF n <> 2 THEN
    RAISE EXCEPTION 'BLOCK 2 FAIL: the sweep wrote % notices, expected 2', n;
  END IF;
  SELECT count(*) INTO n FROM public.studio_compliance_notices
   WHERE document_id = 'f9400000-0000-4000-8000-00000000010a' AND state = 'lapsed';
  IF n <> 1 THEN RAISE EXCEPTION 'BLOCK 2 FAIL: no lapsed notice'; END IF;
  SELECT count(*) INTO n FROM public.studio_compliance_notices
   WHERE document_id = 'f9400000-0000-4000-8000-00000000010b' AND state = 'lapses_soon';
  IF n <> 1 THEN RAISE EXCEPTION 'BLOCK 2 FAIL: no lapses_soon notice'; END IF;

  -- one in_app notification per owner/admin of the holding studio
  SELECT count(*) INTO n_admins FROM public.organization_members
   WHERE organization_id = 'f9000000-0000-4000-8000-00000000000a'
     AND status = 'active' AND role IN ('owner','admin');
  SELECT count(*) INTO n_notif FROM public.notification_log
   WHERE type = 'compliance_document_expiry'
     AND channel = 'in_app'
     AND (metadata->>'document_id') IN ('f9400000-0000-4000-8000-00000000010a',
                                        'f9400000-0000-4000-8000-00000000010b');
  IF n_notif <> 2 * n_admins THEN
    RAISE EXCEPTION 'BLOCK 2 FAIL: % notifications for % owner/admin(s), expected %',
      n_notif, n_admins, 2 * n_admins;
  END IF;
  -- a0…0003 is a plain MEMBER of this studio (it is an owner/admin of other
  -- seeded studios, whose own lapsed paper the same sweep legitimately
  -- notices), so the check is scoped to THIS studio's two documents.
  SELECT count(*) INTO n FROM public.notification_log
   WHERE type = 'compliance_document_expiry'
     AND user_id = 'a0000000-0000-0000-0000-000000000003'
     AND (metadata->>'document_id') IN ('f9400000-0000-4000-8000-00000000010a',
                                        'f9400000-0000-4000-8000-00000000010b');
  IF n <> 0 THEN
    RAISE EXCEPTION 'BLOCK 2 FAIL: a plain member was notified % time(s)', n;
  END IF;

  -- M-5: NO SCHEMA WORD ON THE FACE. doc_label is blank on ordinary paper, so
  -- the fallback used to be the raw doc_type token and the principal read
  -- "coi_gl for Ostrom Builders lapsed 31 Dec 2025." SPEC §7 and §5.7 #8
  -- forbid it; every token in the vocabulary is checked, not only the one the
  -- fixture happens to carry.
  SELECT count(*) INTO n FROM public.notification_log
   WHERE type = 'compliance_document_expiry'
     AND (metadata->>'document_id') IN ('f9400000-0000-4000-8000-00000000010a',
                                        'f9400000-0000-4000-8000-00000000010b')
     AND ( (metadata->>'message') ~ '(coi_gl|coi_wc|coi_auto|lien_waiver_conditional|lien_waiver_unconditional|other_named)'
        OR (metadata->>'message') ~ '^w9 '
        OR (metadata->>'message') ~ '^license ' );
  IF n <> 0 THEN
    RAISE EXCEPTION 'BLOCK 2 FAIL: % notice(s) print a schema word (r1 M-5)', n;
  END IF;
  SELECT count(*) INTO n FROM public.notification_log
   WHERE type = 'compliance_document_expiry'
     AND (metadata->>'document_id') = 'f9400000-0000-4000-8000-00000000010a'
     AND (metadata->>'message') LIKE 'The certificate of insurance for %';
  IF n = 0 THEN
    RAISE EXCEPTION 'BLOCK 2 FAIL: the lapsed notice does not name the paper in words';
  END IF;

  -- IDEMPOTENT: a second night tells nobody anything new
  PERFORM public.sweep_compliance_expiries();
  SELECT count(*) INTO n FROM public.studio_compliance_notices
   WHERE document_id IN ('f9400000-0000-4000-8000-00000000010a',
                         'f9400000-0000-4000-8000-00000000010b');
  IF n <> 2 THEN
    RAISE EXCEPTION 'BLOCK 2 FAIL: a rerun wrote a third notice (% rows)', n;
  END IF;
  SELECT count(*) INTO n_notif FROM public.notification_log
   WHERE type = 'compliance_document_expiry'
     AND (metadata->>'document_id') IN ('f9400000-0000-4000-8000-00000000010a',
                                        'f9400000-0000-4000-8000-00000000010b');
  IF n_notif <> 2 * n_admins THEN
    RAISE EXCEPTION 'BLOCK 2 FAIL: a rerun notified again (% rows)', n_notif;
  END IF;

  -- and the run history
  SELECT count(*) INTO n_runs FROM public.job_runs
   WHERE job_name = 'compliance-document-expiry-sweep' AND status = 'succeeded';
  IF n_runs < 2 THEN
    RAISE EXCEPTION 'BLOCK 2 FAIL: % succeeded job_runs row(s), expected 2', n_runs;
  END IF;
END $$;

-- ── the SECOND state earns its own notice ─────────────────────────────────
UPDATE public.studio_compliance_documents
   SET expires_on = CURRENT_DATE - 1
 WHERE id = 'f9400000-0000-4000-8000-00000000010b';

DO $$
DECLARE
  n integer;
BEGIN
  PERFORM public.sweep_compliance_expiries();
  SELECT count(*) INTO n FROM public.studio_compliance_notices
   WHERE document_id = 'f9400000-0000-4000-8000-00000000010b';
  IF n <> 2 THEN
    RAISE EXCEPTION 'BLOCK 2 FAIL: the paper that crossed into lapsed holds % notices, expected 2', n;
  END IF;
END $$;

-- ── the schedule exists, nightly at 06:00 UTC ─────────────────────────────
DO $$
DECLARE
  v_sched text;
BEGIN
  SELECT schedule INTO v_sched FROM cron.job
   WHERE jobname = 'compliance-document-expiry-sweep';
  IF v_sched IS NULL THEN
    RAISE EXCEPTION 'BLOCK 2 FAIL: the nightly sweep is not scheduled';
  END IF;
  IF v_sched <> '0 6 * * *' THEN
    RAISE EXCEPTION 'BLOCK 2 FAIL: the sweep runs at %, expected 0 6 * * *', v_sched;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. client_households — the membership, the client_rep seat, the grant
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.client_households
  (id, organization_id, designer_id, display_name, co_threshold_cents, created_by) VALUES
  ('f9600000-0000-4000-8000-00000000000a','f9000000-0000-4000-8000-00000000000a',
   'a0000000-0000-0000-0000-000000000004','Okonkwo household', 250000,
   'a0000000-0000-0000-0000-000000000004'),
  ('f9600000-0000-4000-8000-00000000000b','f9000000-0000-4000-8000-00000000000a',
   'a0000000-0000-0000-0000-000000000004','No-figure household', NULL,
   'a0000000-0000-0000-0000-000000000004');

-- ── a bad role word ───────────────────────────────────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  BEGIN
    PERFORM public.add_household_member(
      'f9600000-0000-4000-8000-00000000000a','f9100000-0000-4000-8000-00000000000f',
      'vendor','f9300000-0000-4000-8000-00000000000a');
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'BLOCK 3 FAIL: a household member was added as `vendor`';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.reset_role();
    IF SQLERRM NOT LIKE '%household_role_invalid%' THEN
      RAISE EXCEPTION 'BLOCK 3 FAIL: expected household_role_invalid, got %', SQLERRM;
    END IF;
  END;
END $$;

-- ── PR-n: a plain member may not set a money grant ────────────────────────
DO $$
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  BEGIN
    PERFORM public.add_household_member(
      'f9600000-0000-4000-8000-00000000000a','f9100000-0000-4000-8000-00000000000f',
      'client_rep','f9300000-0000-4000-8000-00000000000a');
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'BLOCK 3 FAIL: a plain member set a money authority';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.reset_role();
    IF SQLERRM NOT LIKE '%household_grant_forbidden%' THEN
      RAISE EXCEPTION 'BLOCK 3 FAIL: expected household_grant_forbidden, got %', SQLERRM;
    END IF;
  END;
END $$;

-- ── the owner's act ───────────────────────────────────────────────────────
DO $$
DECLARE
  v_seat  uuid;
  v_seat2 uuid;
  n       integer;
  v_thr   integer;
  v_arr   uuid[];
  v_prim  uuid;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  v_seat := public.add_household_member(
    'f9600000-0000-4000-8000-00000000000a','f9100000-0000-4000-8000-00000000000f',
    'client_rep','f9300000-0000-4000-8000-00000000000a');
  -- a second member, on the same job, as the plain client
  v_seat2 := public.add_household_member(
    'f9600000-0000-4000-8000-00000000000a','f9100000-0000-4000-8000-00000000000e',
    'client','f9300000-0000-4000-8000-00000000000a');
  PERFORM pg_temp.reset_role();

  IF v_seat IS NULL THEN
    RAISE EXCEPTION 'BLOCK 3 FAIL: no seat was returned';
  END IF;

  -- the membership
  SELECT member_person_ids, primary_member_person_id INTO v_arr, v_prim
    FROM public.client_households WHERE id = 'f9600000-0000-4000-8000-00000000000a';
  IF NOT ('f9100000-0000-4000-8000-00000000000f' = ANY (v_arr))
     OR NOT ('f9100000-0000-4000-8000-00000000000e' = ANY (v_arr)) THEN
    RAISE EXCEPTION 'BLOCK 3 FAIL: the household holds % members', v_arr;
  END IF;
  IF v_prim <> 'f9100000-0000-4000-8000-00000000000f' THEN
    RAISE EXCEPTION 'BLOCK 3 FAIL: the first member did not become primary (%)', v_prim;
  END IF;

  -- the client_rep seat
  SELECT count(*) INTO n FROM public.project_parties
   WHERE id = v_seat
     AND project_id = 'f9300000-0000-4000-8000-00000000000a'
     AND party_kind = 'client_rep'
     AND studio_contact_id = 'f9100000-0000-4000-8000-00000000000f';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 3 FAIL: the client_rep seat is missing or wrong';
  END IF;

  -- the authority row, with the household's figure in integer cents
  SELECT count(*), max(threshold_cents) INTO n, v_thr
    FROM public.project_party_authority
   WHERE engagement_id = v_seat AND scope = 'money' AND effective_to IS NULL;
  IF n <> 1 OR v_thr <> 250000 THEN
    RAISE EXCEPTION 'BLOCK 3 FAIL: % money grant(s), threshold %', n, v_thr;
  END IF;

  -- calling again is idempotent: one seat, one open grant
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.add_household_member(
    'f9600000-0000-4000-8000-00000000000a','f9100000-0000-4000-8000-00000000000f',
    'client_rep','f9300000-0000-4000-8000-00000000000a');
  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO n FROM public.project_parties
   WHERE project_id = 'f9300000-0000-4000-8000-00000000000a'
     AND party_kind = 'client_rep'
     AND studio_contact_id = 'f9100000-0000-4000-8000-00000000000f';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 3 FAIL: a second client_rep seat was opened (% rows)', n;
  END IF;
  SELECT count(*) INTO n FROM public.project_party_authority
   WHERE engagement_id = v_seat AND scope = 'money' AND effective_to IS NULL;
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 3 FAIL: a second open money grant was written (% rows)', n;
  END IF;
END $$;

-- ── a household with NO figure writes no grant even for a client_rep, and a
-- ── plain member may still add a member to it ─────────────────────────────
DO $$
DECLARE
  v_seat uuid;
  n      integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  v_seat := public.add_household_member(
    'f9600000-0000-4000-8000-00000000000b','f9100000-0000-4000-8000-000000000010',
    'client_rep','f9300000-0000-4000-8000-00000000000a');
  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO n FROM public.project_party_authority
   WHERE engagement_id = v_seat;
  IF n <> 0 THEN
    RAISE EXCEPTION 'BLOCK 3 FAIL: a figureless household wrote % grant(s)', n;
  END IF;
END $$;

-- ── PR-c: the figure rides the client_rep seat, never the plain client one
DO $$
DECLARE
  v_seat uuid;
  n      integer;
BEGIN
  SELECT pp.id INTO v_seat FROM public.project_parties pp
   WHERE pp.project_id = 'f9300000-0000-4000-8000-00000000000a'
     AND pp.party_kind = 'client'
     AND pp.studio_contact_id = 'f9100000-0000-4000-8000-00000000000e';
  IF v_seat IS NULL THEN
    RAISE EXCEPTION 'BLOCK 3 FAIL: the plain client seat is missing';
  END IF;
  SELECT count(*) INTO n FROM public.project_party_authority
   WHERE engagement_id = v_seat AND scope = 'money';
  IF n <> 0 THEN
    RAISE EXCEPTION 'BLOCK 3 FAIL: the plain client seat carries % money grant(s)', n;
  END IF;
END $$;

-- ── designer_clients.household_id ─────────────────────────────────────────
INSERT INTO public.designer_clients
  (id, designer_id, client_name, client_email, status, household_id) VALUES
  ('f9700000-0000-4000-8000-00000000000a','a0000000-0000-0000-0000-000000000004',
   'Okonkwo household','okonkwo-w3@test.invalid','active',
   'f9600000-0000-4000-8000-00000000000a');

DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM public.designer_clients
   WHERE id = 'f9700000-0000-4000-8000-00000000000a'
     AND household_id = 'f9600000-0000-4000-8000-00000000000a';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 3 FAIL: designer_clients.household_id did not take';
  END IF;
END $$;

-- ── the member array refuses anything but a live person card of this studio
DO $$
BEGIN
  BEGIN
    UPDATE public.client_households
       SET member_person_ids = member_person_ids || 'f9200000-0000-4000-8000-00000000000a'::uuid
     WHERE id = 'f9600000-0000-4000-8000-00000000000a';
    RAISE EXCEPTION 'BLOCK 3 FAIL: a FIRM card became a household member';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%household_member_not_a_live_person_card%' THEN
      RAISE EXCEPTION 'BLOCK 3 FAIL: expected household_member_not_a_live_person_card, got %', SQLERRM;
    END IF;
  END;

  BEGIN
    UPDATE public.client_households
       SET member_person_ids = member_person_ids || 'f9100000-0000-4000-8000-00000000000b'::uuid
     WHERE id = 'f9600000-0000-4000-8000-00000000000a';
    RAISE EXCEPTION 'BLOCK 3 FAIL: a MERGED-AWAY card became a household member';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%household_member_not_a_live_person_card%' THEN
      RAISE EXCEPTION 'BLOCK 3 FAIL: expected household_member_not_a_live_person_card, got %', SQLERRM;
    END IF;
  END;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The decision court accepts the four new words
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  c text;
BEGIN
  FOREACH c IN ARRAY ARRAY['architect','engineer','inspector','lender'] LOOP
    INSERT INTO public.client_decisions
      (designer_client_id, designer_id, project_id, title, court)
    VALUES
      ('f9700000-0000-4000-8000-00000000000a','a0000000-0000-0000-0000-000000000004',
       'f9300000-0000-4000-8000-00000000000a','W3 court '||c, c);
  END LOOP;

  -- and still refuses a word nobody defined
  BEGIN
    INSERT INTO public.client_decisions
      (designer_client_id, designer_id, project_id, title, court)
    VALUES
      ('f9700000-0000-4000-8000-00000000000a','a0000000-0000-0000-0000-000000000004',
       'f9300000-0000-4000-8000-00000000000a','W3 court bogus','surveyor');
    RAISE EXCEPTION 'BLOCK 4 FAIL: an undefined court was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END $$;

DO $$
DECLARE
  n integer;
BEGIN
  SELECT count(*) INTO n FROM public.client_decisions
   WHERE project_id = 'f9300000-0000-4000-8000-00000000000a'
     AND court IN ('architect','engineer','inspector','lender');
  IF n <> 4 THEN
    RAISE EXCEPTION 'BLOCK 4 FAIL: % of the 4 new courts took', n;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. Archive and restore — owner/admin only, 00417's shipped rule
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_at  timestamptz;
  v_at2 timestamptz;
BEGIN
  -- a plain member is refused
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  BEGIN
    PERFORM public.archive_studio_contact('f9100000-0000-4000-8000-00000000000d');
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'BLOCK 5 FAIL: a plain member archived a card';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.reset_role();
    IF SQLERRM NOT LIKE '%studio_contact_archive_forbidden%' THEN
      RAISE EXCEPTION 'BLOCK 5 FAIL: expected studio_contact_archive_forbidden, got %', SQLERRM;
    END IF;
  END;

  -- a non-member reads not_found, never a different error
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005');
  BEGIN
    PERFORM public.archive_studio_contact('f9100000-0000-4000-8000-00000000000d');
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'BLOCK 5 FAIL: a non-member archived a card';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.reset_role();
    IF SQLERRM NOT LIKE '%studio_contact_not_found%' THEN
      RAISE EXCEPTION 'BLOCK 5 FAIL: expected studio_contact_not_found, got %', SQLERRM;
    END IF;
  END;

  -- the owner archives, idempotently
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  v_at  := public.archive_studio_contact('f9100000-0000-4000-8000-00000000000d');
  v_at2 := public.archive_studio_contact('f9100000-0000-4000-8000-00000000000d');
  PERFORM pg_temp.reset_role();
  IF v_at IS NULL THEN
    RAISE EXCEPTION 'BLOCK 5 FAIL: archive returned no date';
  END IF;
  IF v_at2 IS DISTINCT FROM v_at THEN
    RAISE EXCEPTION 'BLOCK 5 FAIL: a second archive re-stamped the date';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.studio_contacts
                  WHERE id = 'f9100000-0000-4000-8000-00000000000d'
                    AND archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'BLOCK 5 FAIL: the card is not archived';
  END IF;

  -- and restores
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.restore_studio_contact('f9100000-0000-4000-8000-00000000000d');
  PERFORM pg_temp.reset_role();
  IF EXISTS (SELECT 1 FROM public.studio_contacts
              WHERE id = 'f9100000-0000-4000-8000-00000000000d'
                AND archived_at IS NOT NULL) THEN
    RAISE EXCEPTION 'BLOCK 5 FAIL: the card was not restored';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. R-BD — the studio_id backfill, and the ambiguous case that stays NULL
-- ═══════════════════════════════════════════════════════════════════════════
-- The fixture is written with set_project_studio_id (00317) DISABLED, because
-- that trigger now derives studio_id on INSERT and on UPDATE, so the legacy
-- shape this backfill repairs can no longer be written through it. The
-- statement under test is 00628's, restated verbatim.
ALTER TABLE public.projects DISABLE TRIGGER set_project_studio_id;

INSERT INTO public.projects
  (id, name, designer_id, studio_id, status, created_by, client_visibility_tier) VALUES
  -- a0…0007 holds exactly ONE active design-studio membership: resolvable
  ('f9300000-0000-4000-8000-0000000000b1','W3 lone-designer legacy job',
   'a0000000-0000-0000-0000-000000000007', NULL,'active',
   'a0000000-0000-0000-0000-000000000007','full'),
  -- a0…0004 holds several: ambiguous, and stays NULL
  ('f9300000-0000-4000-8000-0000000000b2','W3 ambiguous legacy job',
   'a0000000-0000-0000-0000-000000000004', NULL,'active',
   'a0000000-0000-0000-0000-000000000004','full');

ALTER TABLE public.projects ENABLE TRIGGER set_project_studio_id;

WITH candidate AS (
  SELECT
    p.id AS project_id,
    (
      SELECT om.organization_id
        FROM public.organization_members om
        JOIN public.organizations o ON o.id = om.organization_id
       WHERE om.user_id = p.designer_id
         AND om.status  = 'active'
         AND om.role   <> 'guest'
         AND o.type     = 'design_studio'
         AND o.status   = 'active'
       LIMIT 1
    ) AS only_org,
    (
      SELECT count(DISTINCT om.organization_id)
        FROM public.organization_members om
        JOIN public.organizations o ON o.id = om.organization_id
       WHERE om.user_id = p.designer_id
         AND om.status  = 'active'
         AND om.role   <> 'guest'
         AND o.type     = 'design_studio'
         AND o.status   = 'active'
    ) AS n_orgs
  FROM public.projects p
  WHERE p.studio_id IS NULL
    AND p.designer_id IS NOT NULL
)
UPDATE public.projects p
   SET studio_id = c.only_org
  FROM candidate c
 WHERE p.id = c.project_id
   AND c.n_orgs = 1
   AND c.only_org IS NOT NULL;

DO $$
DECLARE
  v_lone uuid;
  v_amb  uuid;
BEGIN
  SELECT studio_id INTO v_lone FROM public.projects
   WHERE id = 'f9300000-0000-4000-8000-0000000000b1';
  SELECT studio_id INTO v_amb  FROM public.projects
   WHERE id = 'f9300000-0000-4000-8000-0000000000b2';

  IF v_lone IS DISTINCT FROM 'f9000000-0000-4000-8000-00000000000b' THEN
    RAISE EXCEPTION 'BLOCK 6 FAIL: the single-membership job took studio %', v_lone;
  END IF;
  IF v_amb IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 6 FAIL: the ambiguous job was stamped with %', v_amb;
  END IF;

  -- and the repaired job now resolves ONE studio through every resolver
  IF public.project_recorded_studio('f9300000-0000-4000-8000-0000000000b1')
     IS DISTINCT FROM 'f9000000-0000-4000-8000-00000000000b' THEN
    RAISE EXCEPTION 'BLOCK 6 FAIL: project_recorded_studio disagrees after the backfill';
  END IF;
  IF public.project_consent_org('f9300000-0000-4000-8000-0000000000b1')
     IS DISTINCT FROM 'f9000000-0000-4000-8000-00000000000b' THEN
    RAISE EXCEPTION 'BLOCK 6 FAIL: project_consent_org disagrees after the backfill';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. The bid fields, and the quoting person's guard
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  n integer;
BEGIN
  UPDATE public.project_parties
     SET bid_outcome = 'quoted',
         bid_due_at = CURRENT_DATE + 5,
         bid_valid_until = CURRENT_DATE + 35,
         bid_amount_cents = 1850000,
         bid_quoted_by_person_id = 'f9100000-0000-4000-8000-00000000000a'
   WHERE id = 'f9500000-0000-4000-8000-00000000000a';

  SELECT count(*) INTO n FROM public.project_parties
   WHERE id = 'f9500000-0000-4000-8000-00000000000a'
     AND bid_outcome = 'quoted' AND bid_amount_cents = 1850000;
  IF n <> 1 THEN RAISE EXCEPTION 'BLOCK 7 FAIL: the bid did not take'; END IF;

  -- a word outside the vocabulary
  BEGIN
    UPDATE public.project_parties SET bid_outcome = 'maybe'
     WHERE id = 'f9500000-0000-4000-8000-00000000000a';
    RAISE EXCEPTION 'BLOCK 7 FAIL: an undefined bid_outcome was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  -- a FIRM card cannot have quoted it
  BEGIN
    UPDATE public.project_parties
       SET bid_quoted_by_person_id = 'f9200000-0000-4000-8000-00000000000a'
     WHERE id = 'f9500000-0000-4000-8000-00000000000a';
    RAISE EXCEPTION 'BLOCK 7 FAIL: a firm card quoted the bid';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%party_bid_quoted_by_not_a_person%' THEN
      RAISE EXCEPTION 'BLOCK 7 FAIL: expected party_bid_quoted_by_not_a_person, got %', SQLERRM;
    END IF;
  END;

  -- nor a card that was merged away
  BEGIN
    UPDATE public.project_parties
       SET bid_quoted_by_person_id = 'f9100000-0000-4000-8000-00000000000b'
     WHERE id = 'f9500000-0000-4000-8000-00000000000a';
    RAISE EXCEPTION 'BLOCK 7 FAIL: a merged-away card quoted the bid';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%party_bid_quoted_by_merged_away%' THEN
      RAISE EXCEPTION 'BLOCK 7 FAIL: expected party_bid_quoted_by_merged_away, got %', SQLERRM;
    END IF;
  END;
END $$;

DO $$ BEGIN RAISE NOTICE 'W3 SQL suite: all blocks passed'; END $$;

ROLLBACK;
