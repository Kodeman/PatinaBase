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

  -- compliance document: the absorbed card's paper ARRIVES ON THE SURVIVOR
  -- (r3 W3-R3-1). The survivor holds no `license` at all, so there is no
  -- successor to supersede it with — it simply moves, whole, and counts for
  -- itself. Leaving it behind put it on a card the Directory, the pickers and
  -- the sweep all skip, which is data loss in a soft-delete model.
  SELECT holder_id INTO v FROM public.studio_compliance_documents
   WHERE id = 'f9400000-0000-4000-8000-00000000000a';
  IF v <> 'f9100000-0000-4000-8000-00000000000a' THEN
    RAISE EXCEPTION 'BLOCK 1 FAIL: document holder is % (r3 W3-R3-1: it moves to the survivor)', v;
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

  -- the absorbed certificate moved, and says WHY it no longer counts
  SELECT count(*) INTO n FROM public.studio_compliance_documents
   WHERE id = 'f9400000-0000-4000-8000-00000000000d'
     AND holder_id     = 'f9200000-0000-4000-8000-00000000000d'
     AND superseded_by = 'f9400000-0000-4000-8000-00000000000c';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: the absorbed certificate was not superseded by the survivor''s';
  END IF;

  -- r3 W3-R3-1: the absorbed paper with NO successor MOVES TOO. It used to be
  -- left behind, on a card the Directory, the pickers and the sweep all skip —
  -- so a lapse the studio recorded became unreachable and unprintable, and the
  -- same rule hid a renewal in the other direction. The studio declared these
  -- two cards one firm; the firm's paper is the firm's paper.
  SELECT count(*) INTO n FROM public.studio_compliance_documents
   WHERE id = 'f9400000-0000-4000-8000-00000000000e'
     AND holder_id = 'f9200000-0000-4000-8000-00000000000d'
     AND superseded_by IS NULL;
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: the absorbed bond did not move onto the survivor (r3 W3-R3-1)';
  END IF;

  -- nothing at all is left stranded on the absorbed card
  SELECT count(*) INTO n FROM public.studio_compliance_documents
   WHERE holder_id = 'f9200000-0000-4000-8000-00000000000e';
  IF n <> 0 THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: % document(s) stranded on the absorbed card (r3 W3-R3-1)', n;
  END IF;

  -- and the word is now the honest reckoning over BOTH cards' paper: the bond
  -- lapsed ten days ago, so the firm reads lapsed, where before the fix the
  -- lapse was simply invisible.
  w_after := public.compliance_state('f9200000-0000-4000-8000-00000000000d');
  IF w_after <> 'lapsed' THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: the survivor reads % over an absorbed lapsed bond (r3 W3-R3-1)', w_after;
  END IF;
END $$;

-- ── r3 W3-R3-1 · THE OTHER DIRECTION: the RENEWAL the merge used to hide ──
-- The survivor holds a LAPSED certificate; the absorbed duplicate holds the
-- firm's current renewal. Before the fix the survivor read `lapsed` after the
-- merge — and 00630's nightly sweep wrote "…'s paper has lapsed" to every
-- owner and admin — while the renewal that answers it sat on a card
-- people_directory emits no row for.
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, company_name, company_kind, created_by) VALUES
  ('f9200000-0000-4000-8000-00000000001a','f9000000-0000-4000-8000-00000000000a','company','sub','Lapsed Survivor','sub','a0000000-0000-0000-0000-000000000004'),
  ('f9200000-0000-4000-8000-00000000001b','f9000000-0000-4000-8000-00000000000a','company','sub','Renewal Holder','sub','a0000000-0000-0000-0000-000000000004');

INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, blocks, issued_on, expires_on) VALUES
  ('f9400000-0000-4000-8000-00000000001a','f9000000-0000-4000-8000-00000000000a','company',
   'f9200000-0000-4000-8000-00000000001a','coi_gl', ARRAY['site_access']::text[],
   CURRENT_DATE - 400, CURRENT_DATE - 30),
  ('f9400000-0000-4000-8000-00000000001b','f9000000-0000-4000-8000-00000000000a','company',
   'f9200000-0000-4000-8000-00000000001b','coi_gl', ARRAY['site_access']::text[],
   CURRENT_DATE - 20, CURRENT_DATE + 340);

DO $$
DECLARE
  w text;
  n integer;
BEGIN
  w := public.compliance_state('f9200000-0000-4000-8000-00000000001a');
  IF w <> 'lapsed' THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: the survivor reads % before the merge', w;
  END IF;

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.merge_studio_contacts(
    'f9200000-0000-4000-8000-00000000001a','f9200000-0000-4000-8000-00000000001b','company_name');
  PERFORM pg_temp.reset_role();

  SELECT count(*) INTO n FROM public.studio_compliance_documents
   WHERE id = 'f9400000-0000-4000-8000-00000000001b'
     AND holder_id = 'f9200000-0000-4000-8000-00000000001a';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: the renewal stayed on the absorbed card (r3 W3-R3-1)';
  END IF;

  w := public.compliance_state('f9200000-0000-4000-8000-00000000001a');
  IF w <> 'lapsed' THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: expected lapsed while the old certificate is unretired, got %', w;
  END IF;

  -- the studio retires the old certificate against the renewal it now holds,
  -- which is an ordinary member act once both papers are on one card — the
  -- act that was UNREACHABLE while the renewal sat on the folded card.
  UPDATE public.studio_compliance_documents
     SET superseded_by = 'f9400000-0000-4000-8000-00000000001b'
   WHERE id = 'f9400000-0000-4000-8000-00000000001a';

  w := public.compliance_state('f9200000-0000-4000-8000-00000000001a');
  IF w <> 'current' THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: the firm reads % holding its own renewal (r3 W3-R3-1)', w;
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

-- ── r3 W3-R3-3 / W3-R3-4 · A MERGE OF TWO CARDS CARRYING DIFFERENT NUMBERS
-- crm-model §4 rules 3 and 4 (email match; company plus name) fold cards that
-- do NOT share a number, and the absorbed card was the only card carrying its
-- own. Excluding a merged card from the auto-link resolver therefore made that
-- number resolve to NOTHING: the next ordinary roster write landed uncarded
-- and people_directory emitted a SECOND identity row for the human the merge
-- had just made one (W3-R3-3). And because the merge moved typed channel rows
-- but never the card's own phone_e164, the survivor's identity reduced its
-- consent word over ONE number and printed `Not asked` over the studio's own
-- recorded refusal (W3-R3-4).
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, phone, email, created_by, created_at) VALUES
  ('f9100000-0000-4000-8000-00000000001c','f9000000-0000-4000-8000-00000000000a','person','sub','Ray Two Numbers','(612) 555-0921','ray.two@northgate.test','a0000000-0000-0000-0000-000000000004','2025-05-01'),
  ('f9100000-0000-4000-8000-00000000001d','f9000000-0000-4000-8000-00000000000a','person','sub','Ray Two Numbers Dup','(612) 555-0922','ray.two@northgate.test','a0000000-0000-0000-0000-000000000004','2026-05-01');

-- the studio heard STOP on the DUPLICATE's number
INSERT INTO public.studio_channel_consent
  (organization_id, channel_kind, channel_value, status, opt_out_at,
   opt_out_source, opt_out_evidence, opt_out_recorded_at, opt_out_recorded_by)
VALUES
  ('f9000000-0000-4000-8000-00000000000a','sms','+16125550922','opted_out', now(),
   'verbal','said stop on site', now(),'a0000000-0000-0000-0000-000000000004');

DO $$
DECLARE
  v_card  uuid;
  v_seat  uuid;
  v_stamp uuid;
  v_word  text;
  n       integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  v_word := public.identity_consent_status(
    'f9000000-0000-4000-8000-00000000000a',
    'f9100000-0000-4000-8000-00000000001c', '+16125550921');
  IF v_word <> 'not_asked' THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: the survivor reads % before the merge', v_word;
  END IF;

  PERFORM public.merge_studio_contacts(
    'f9100000-0000-4000-8000-00000000001c','f9100000-0000-4000-8000-00000000001d','email');
  PERFORM pg_temp.reset_role();

  -- W3-R3-3: the absorbed card's own number resolves FORWARD to the survivor
  v_card := public.rolodex_card_for_party_phone(
    'f9300000-0000-4000-8000-00000000000a', '+16125550922');
  IF v_card IS DISTINCT FROM 'f9100000-0000-4000-8000-00000000001c' THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: the absorbed number resolves to % not the survivor (r3 W3-R3-3)', v_card;
  END IF;

  INSERT INTO public.project_parties
    (project_id, party_kind, display_name, phone, created_by)
  VALUES
    ('f9300000-0000-4000-8000-00000000000a','sub','Absorbed Number Add','(612) 555-0922',
     'a0000000-0000-0000-0000-000000000004')
  RETURNING id INTO v_seat;

  SELECT studio_contact_id INTO v_stamp FROM public.project_parties WHERE id = v_seat;
  IF v_stamp IS DISTINCT FROM 'f9100000-0000-4000-8000-00000000001c' THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: a seat on the absorbed number was stamped % (r3 W3-R3-3)', v_stamp;
  END IF;
  DELETE FROM public.project_parties WHERE id = v_seat;

  -- W3-R3-4: the absorbed card's own number is now a channel row on the
  -- survivor, so the identity reduces over BOTH numbers
  SELECT count(*) INTO n FROM public.studio_contact_channels
   WHERE owner_id = 'f9100000-0000-4000-8000-00000000001c'
     AND channel_kind = 'mobile' AND value = '+16125550922';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: the absorbed number minted % channel row(s) (r3 W3-R3-4)', n;
  END IF;

  -- the number set and the word are both read as a MEMBER: both functions are
  -- gated on is_active_studio_member(), which is the point of them.
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT count(*) INTO n FROM public.identity_phone_numbers(
    'f9000000-0000-4000-8000-00000000000a',
    'f9100000-0000-4000-8000-00000000001c', '+16125550921') AS t(v)
   WHERE t.v = '+16125550922';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: identity_phone_numbers misses the absorbed number (r3 W3-R3-4)';
  END IF;

  v_word := public.identity_consent_status(
    'f9000000-0000-4000-8000-00000000000a',
    'f9100000-0000-4000-8000-00000000001c', '+16125550921');
  PERFORM pg_temp.reset_role();
  IF v_word <> 'opted_out' THEN
    RAISE EXCEPTION 'BLOCK 1b FAIL: the survivor reads % over a recorded refusal (r3 W3-R3-4)', v_word;
  END IF;
END $$;

-- ── r3 W3-R3-5 · THE LINEAGE TABLE IS NOT HAND-WRITABLE ───────────────────
-- B2-1 shut the pointer against every writer but the RPC; the table that is
-- the other half of PR-o's record stayed INSERTable by any studio member,
-- with no UPDATE or DELETE policy to take a forged row back.
DO $$
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  BEGIN
    INSERT INTO public.studio_contact_merges
      (organization_id, survivor_id, merged_id, matched_on)
    VALUES ('f9000000-0000-4000-8000-00000000000a',
            'f9100000-0000-4000-8000-00000000000c',
            'f9100000-0000-4000-8000-00000000000d','manual');
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'BLOCK 1b FAIL: a member forged a lineage row (r3 W3-R3-5)';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  PERFORM pg_temp.reset_role();
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
-- 1c. merged_into is not an ordinary column, and a renewal chain may be merged
-- ═══════════════════════════════════════════════════════════════════════════
-- Migrations review r2: B2-1 (any active member could PATCH merged_into
-- straight through PostgREST and fold a card out of the room, orphaning its
-- seats, with none of merge_studio_contacts()'s rules applied) and B2-2 (a
-- merge aborted outright whenever the absorbed card carried a renewal and the
-- survivor held a successor). Both were invisible to a green suite: nothing
-- asserted who may write the column, and block 1b's absorbed document had no
-- chain behind it.

-- ── B2-1 · NOBODY WRITES THE POINTER BY HAND ──────────────────────────────
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, company_name, company_kind, created_by) VALUES
  ('f9200000-0000-4000-8000-000000000010','f9000000-0000-4000-8000-00000000000a','company','sub','Chain Survivor','sub','a0000000-0000-0000-0000-000000000004'),
  ('f9200000-0000-4000-8000-000000000011','f9000000-0000-4000-8000-00000000000a','company','sub','Chain Absorbed','sub','a0000000-0000-0000-0000-000000000004');

DO $$
DECLARE
  v_ptr uuid;
BEGIN
  -- a plain member (a0…0003)
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  BEGIN
    UPDATE public.studio_contacts
       SET merged_into = 'f9200000-0000-4000-8000-000000000010'
     WHERE id = 'f9200000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'BLOCK 1c FAIL: a plain member wrote merged_into (r2 B2-1)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%studio_contact_merge_pointer_forbidden%' THEN
      RAISE EXCEPTION 'BLOCK 1c FAIL: expected studio_contact_merge_pointer_forbidden, got %', SQLERRM;
    END IF;
  END;
  PERFORM pg_temp.reset_role();

  -- and the OWNER, whose 00417 admin UPDATE leg carries no column predicate
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  BEGIN
    UPDATE public.studio_contacts
       SET merged_into = 'f9200000-0000-4000-8000-000000000010'
     WHERE id = 'f9200000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'BLOCK 1c FAIL: an owner wrote merged_into (r2 B2-1)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%studio_contact_merge_pointer_forbidden%' THEN
      RAISE EXCEPTION 'BLOCK 1c FAIL: expected studio_contact_merge_pointer_forbidden for the owner, got %', SQLERRM;
    END IF;
  END;
  PERFORM pg_temp.reset_role();

  SELECT merged_into INTO v_ptr FROM public.studio_contacts
   WHERE id = 'f9200000-0000-4000-8000-000000000011';
  IF v_ptr IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 1c FAIL: the pointer is % after two refused writes', v_ptr;
  END IF;
END $$;

-- The two structural rules hold for EVERY writer, the door open.
DO $$
BEGIN
  PERFORM set_config('app.contact_merge_in_progress', 'on', true);
  BEGIN
    -- a PERSON into a FIRM: crm-model §4's one forbidden merge
    UPDATE public.studio_contacts
       SET merged_into = 'f9200000-0000-4000-8000-000000000010'
     WHERE id = 'f9100000-0000-4000-8000-00000000000a';
    RAISE EXCEPTION 'BLOCK 1c FAIL: a person was folded into a firm under the door';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%studio_contact_merge_kind_mismatch%' THEN
      RAISE EXCEPTION 'BLOCK 1c FAIL: expected studio_contact_merge_kind_mismatch, got %', SQLERRM;
    END IF;
  END;
  BEGIN
    -- a card in ANOTHER studio (the seeded Hartwell book)
    UPDATE public.studio_contacts
       SET merged_into = 'd0e20000-0000-0000-0000-000000000001'
     WHERE id = 'f9200000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'BLOCK 1c FAIL: a cross-studio pointer was accepted under the door';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%studio_contact_merge_other_studio%' THEN
      RAISE EXCEPTION 'BLOCK 1c FAIL: expected studio_contact_merge_other_studio, got %', SQLERRM;
    END IF;
  END;
  PERFORM set_config('app.contact_merge_in_progress', 'off', true);
END $$;

-- ── B2-2 · A MERGE OVER A RENEWAL CHAIN ───────────────────────────────────
-- The survivor holds a current certificate. The absorbed card holds a chain:
-- a retired predecessor behind a head that has since lapsed — the shape a firm
-- card is folded away FOR. The head is written in force and then aged, because
-- assert_compliance_holder() will not let a lapse be retired by a lapse (the
-- negative control below still proves that).
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, blocks, issued_on, expires_on) VALUES
  ('f9400000-0000-4000-8000-000000000010','f9000000-0000-4000-8000-00000000000a','company',
   'f9200000-0000-4000-8000-000000000010','coi_gl', ARRAY['site_access']::text[],
   CURRENT_DATE - 60,  CURRENT_DATE + 300),
  ('f9400000-0000-4000-8000-000000000011','f9000000-0000-4000-8000-00000000000a','company',
   'f9200000-0000-4000-8000-000000000011','coi_gl', ARRAY['site_access']::text[],
   CURRENT_DATE - 800, CURRENT_DATE - 400),
  ('f9400000-0000-4000-8000-000000000012','f9000000-0000-4000-8000-00000000000a','company',
   'f9200000-0000-4000-8000-000000000011','coi_gl', ARRAY['site_access']::text[],
   CURRENT_DATE - 400, CURRENT_DATE + 100),
  -- and a lapsed bond the survivor holds nothing to retire: it stays behind
  ('f9400000-0000-4000-8000-000000000013','f9000000-0000-4000-8000-00000000000a','company',
   'f9200000-0000-4000-8000-000000000011','bond', ARRAY['payment']::text[],
   CURRENT_DATE - 400, CURRENT_DATE - 10);

UPDATE public.studio_compliance_documents
   SET superseded_by = 'f9400000-0000-4000-8000-000000000012'
 WHERE id = 'f9400000-0000-4000-8000-000000000011';
UPDATE public.studio_compliance_documents
   SET expires_on = CURRENT_DATE - 30
 WHERE id = 'f9400000-0000-4000-8000-000000000012';

DO $$
DECLARE
  w_before text;
  w_after  text;
  n        integer;
BEGIN
  w_before := public.compliance_state('f9200000-0000-4000-8000-000000000010');
  IF w_before <> 'current' THEN
    RAISE EXCEPTION 'BLOCK 1c FAIL: the survivor reads % before the merge', w_before;
  END IF;

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.merge_studio_contacts(
    'f9200000-0000-4000-8000-000000000010','f9200000-0000-4000-8000-000000000011','company_name');
  PERFORM pg_temp.reset_role();

  -- r3 W3-R3-1: the word is the honest reckoning over BOTH cards' paper. The
  -- certificate lineage is retired against the survivor's own current one, and
  -- the absorbed BOND (lapsed ten days ago, gating payment) now counts — where
  -- before the fix it was simply invisible on a card nothing could open.
  w_after := public.compliance_state('f9200000-0000-4000-8000-000000000010');
  IF w_after <> 'lapsed' THEN
    RAISE EXCEPTION 'BLOCK 1c FAIL: the survivor reads % over an absorbed lapsed bond', w_after;
  END IF;

  -- the whole lineage moved, head and predecessor
  SELECT count(*) INTO n FROM public.studio_compliance_documents
   WHERE id IN ('f9400000-0000-4000-8000-000000000011','f9400000-0000-4000-8000-000000000012')
     AND holder_id = 'f9200000-0000-4000-8000-000000000010';
  IF n <> 2 THEN
    RAISE EXCEPTION 'BLOCK 1c FAIL: % of the 2 lineage rows moved onto the survivor (r2 B2-2)', n;
  END IF;

  -- and the edge onto the survivor's certificate was written last
  SELECT count(*) INTO n FROM public.studio_compliance_documents
   WHERE id = 'f9400000-0000-4000-8000-000000000012'
     AND superseded_by = 'f9400000-0000-4000-8000-000000000010';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 1c FAIL: the absorbed head was not superseded by the survivor''s certificate';
  END IF;

  -- the predecessor still names its own head: the chain is intact
  SELECT count(*) INTO n FROM public.studio_compliance_documents
   WHERE id = 'f9400000-0000-4000-8000-000000000011'
     AND superseded_by = 'f9400000-0000-4000-8000-000000000012';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 1c FAIL: the retired predecessor lost its successor';
  END IF;

  -- the bond with no successor moves too, carrying no edge (r3 W3-R3-1)
  SELECT count(*) INTO n FROM public.studio_compliance_documents
   WHERE id = 'f9400000-0000-4000-8000-000000000013'
     AND holder_id = 'f9200000-0000-4000-8000-000000000010'
     AND superseded_by IS NULL;
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 1c FAIL: the absorbed bond did not move onto the survivor (r3 W3-R3-1)';
  END IF;
END $$;

-- ── B2-2 negative control · the laundering doors are still shut ───────────
-- Both rows are on the SURVIVOR now, same doc_type, same gates, the target's
-- date not earlier — so only the leg under test can refuse. §4c narrows the
-- head-of-chain and in-force legs to the write that CHANGES superseded_by;
-- these two writes are exactly that.
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, blocks, issued_on, expires_on) VALUES
  ('f9400000-0000-4000-8000-000000000014','f9000000-0000-4000-8000-00000000000a','company',
   'f9200000-0000-4000-8000-000000000010','coi_gl', ARRAY['site_access']::text[],
   CURRENT_DATE - 900, CURRENT_DATE - 500);

DO $$
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  BEGIN
    -- onto an ALREADY-RETIRED row
    UPDATE public.studio_compliance_documents
       SET superseded_by = 'f9400000-0000-4000-8000-000000000012'
     WHERE id = 'f9400000-0000-4000-8000-000000000014';
    RAISE EXCEPTION 'BLOCK 1c FAIL: a supersede onto a retired row was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%compliance_successor_already_superseded%' THEN
      RAISE EXCEPTION 'BLOCK 1c FAIL: expected compliance_successor_already_superseded, got %', SQLERRM;
    END IF;
  END;
  PERFORM pg_temp.reset_role();
END $$;

DO $$
BEGIN
  -- free the head's own edge, so only its LAPSE can refuse the next write
  PERFORM set_config('app.contact_merge_in_progress', 'off', true);
  UPDATE public.studio_compliance_documents SET superseded_by = NULL
   WHERE id = 'f9400000-0000-4000-8000-000000000012';

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  BEGIN
    UPDATE public.studio_compliance_documents
       SET superseded_by = 'f9400000-0000-4000-8000-000000000012'
     WHERE id = 'f9400000-0000-4000-8000-000000000014';
    RAISE EXCEPTION 'BLOCK 1c FAIL: a supersede onto a LAPSED head was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%compliance_successor_already_lapsed%' THEN
      RAISE EXCEPTION 'BLOCK 1c FAIL: expected compliance_successor_already_lapsed, got %', SQLERRM;
    END IF;
  END;
  PERFORM pg_temp.reset_role();

  -- put the chain back the way the merge left it, for block 2b
  UPDATE public.studio_compliance_documents
     SET superseded_by = 'f9400000-0000-4000-8000-000000000010'
   WHERE id = 'f9400000-0000-4000-8000-000000000012';
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
-- The date move here stands in for THE CLOCK, not for a studio edit: a paper
-- crosses lapses_soon → lapsed because time passes, and CURRENT_DATE cannot be
-- moved inside one transaction. r5 M-3's trigger unspends a document's notices
-- whenever a MEMBER changes the date, which is the correct answer to a
-- correction and the wrong stand-in for a clock — so it is held off for this
-- one statement. The studio-edit case is block 9's, measured there in full.
ALTER TABLE public.studio_compliance_documents
  DISABLE TRIGGER clear_compliance_notices_on_date_change_trg;
UPDATE public.studio_compliance_documents
   SET expires_on = CURRENT_DATE - 1
 WHERE id = 'f9400000-0000-4000-8000-00000000010b';
ALTER TABLE public.studio_compliance_documents
  ENABLE TRIGGER clear_compliance_notices_on_date_change_trg;

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
-- 2b. The sweep says nothing about a card the room has folded away
-- ═══════════════════════════════════════════════════════════════════════════
-- Migrations review r2 B2-4. Block 1c's absorbed card still holds its lapsed
-- bond (gating {payment}, inside the sweep's window) because the survivor held
-- nothing to retire it — which is correct, crm-model §4 — and
-- compliance_document_state() still reads it `lapsed`. Without the
-- merged_into leg on the scan the nightly sweep wrote "Chain Absorbed's paper
-- has lapsed" to every owner and admin, with a deep link to a card
-- people_directory emits no row for.
DO $$
DECLARE
  n integer;
BEGIN
  IF public.compliance_document_state('f9400000-0000-4000-8000-000000000013') <> 'lapsed' THEN
    RAISE EXCEPTION 'BLOCK 2b FAIL: the folded card''s bond does not read lapsed, so the assertion below proves nothing';
  END IF;

  PERFORM public.sweep_compliance_expiries();

  SELECT count(*) INTO n
    FROM public.studio_compliance_notices sn
    JOIN public.studio_compliance_documents d ON d.id = sn.document_id
   WHERE d.holder_id = 'f9200000-0000-4000-8000-000000000011';
  IF n <> 0 THEN
    RAISE EXCEPTION 'BLOCK 2b FAIL: the sweep wrote % notices about paper on a folded-away card (r2 B2-4)', n;
  END IF;

  SELECT count(*) INTO n FROM public.people_directory
   WHERE person_id = 'f9200000-0000-4000-8000-000000000011';
  IF n <> 0 THEN
    RAISE EXCEPTION 'BLOCK 2b FAIL: the folded card still emits a directory row';
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

-- ── 7c · r3 W3-R3-2 · THE RECORD, NOT THE WRITER ──────────────────────────
-- Block 6 leaves 'W3 ambiguous legacy job' with studio_id NULL — R-BD/R-BI's
-- legacy population. project_tenant_org() is caller-relative there, so the
-- guard used to check the estimator's card against the WRITER's own rolodex: a
-- member of a second design studio the designer of record also belongs to
-- wrote their OWN card onto the working studio's seat, while
-- assert_project_party_cards() refused the identical write on
-- studio_contact_id. The JWT is set WITHOUT switching role, so RLS is not the
-- thing under test — the trigger is.
INSERT INTO public.project_parties
  (id, project_id, party_kind, display_name, created_by) VALUES
  ('f9500000-0000-4000-8000-00000000020a','f9300000-0000-4000-8000-0000000000b2','sub',
   'Studio-less Seat','a0000000-0000-0000-0000-000000000004');

DO $$
DECLARE
  v_tenant   uuid;
  v_recorded uuid;
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub','a0000000-0000-0000-0000-000000000004',
                      'role','authenticated')::text, true);

  v_tenant   := public.project_tenant_org('f9300000-0000-4000-8000-0000000000b2');
  v_recorded := public.project_recorded_studio('f9300000-0000-4000-8000-0000000000b2');
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'BLOCK 7c FAIL: the fixture no longer reproduces — project_tenant_org answers NULL';
  END IF;
  IF v_recorded IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 7c FAIL: the fixture no longer reproduces — the job records studio %', v_recorded;
  END IF;

  BEGIN
    UPDATE public.project_parties
       SET bid_quoted_by_person_id = 'f9100000-0000-4000-8000-00000000000a'
     WHERE id = 'f9500000-0000-4000-8000-00000000020a';
    PERFORM set_config('request.jwt.claims', NULL, true);
    RAISE EXCEPTION 'BLOCK 7c FAIL: a card was written onto a studio-less job''s seat (r3 W3-R3-2)';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%party_bid_quoted_by_project_has_no_studio%' THEN
      RAISE EXCEPTION 'BLOCK 7c FAIL: expected party_bid_quoted_by_project_has_no_studio, got %', SQLERRM;
    END IF;
  END;

  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

-- ── 7b. THE RFQ BACKFILL, OVER REAL ROWS ──────────────────────────────────
-- Migrations review r2 B2-3 and m2-1. Block 7 above writes the bid columns by
-- hand and tests three refusals; it never ran a line of 00631's mapping, and
-- `trade_scope_bids` / `trade_rfq_requests` both hold ZERO rows locally — so
-- the one statement in this wave that can only really run on Strata had no
-- coverage at all, which is how a fabricated selection date survived a green
-- suite. 00631's mapping is RESTATED here verbatim (the block 6 idiom: a
-- migration's one-time statement is a no-op on every reset).
INSERT INTO public.proposals (id, designer_id, title, status) VALUES
  ('f9600000-0000-4000-8000-00000000000a','a0000000-0000-0000-0000-000000000004','Chain proposal','draft');

-- guard_trade_scope_bid_party() resolves the bid's project through the
-- commercial-document binding, so the trade scope needs one.
INSERT INTO public.project_commercial_documents
  (project_id, proposal_id, document_kind, created_by) VALUES
  ('f9300000-0000-4000-8000-00000000000a','f9600000-0000-4000-8000-00000000000a','trade_scope',
   'a0000000-0000-0000-0000-000000000004');

INSERT INTO public.project_parties
  (id, project_id, party_kind, display_name, created_by) VALUES
  -- a. asked, quoted and SELECTED: the shape that printed a selection date
  ('f9500000-0000-4000-8000-00000000010b','f9300000-0000-4000-8000-00000000000a','sub','Bid Selected','a0000000-0000-0000-0000-000000000004'),
  -- b. asked and answered through the RFQ rail only
  ('f9500000-0000-4000-8000-00000000010c','f9300000-0000-4000-8000-00000000000a','sub','Bid Responded','a0000000-0000-0000-0000-000000000004'),
  -- c. asked, nothing back
  ('f9500000-0000-4000-8000-00000000010d','f9300000-0000-4000-8000-00000000000a','sub','Bid Asked','a0000000-0000-0000-0000-000000000004');

INSERT INTO public.trade_rfq_requests (proposal_id, party_id, status, sent_at, responded_at) VALUES
  ('f9600000-0000-4000-8000-00000000000a','f9500000-0000-4000-8000-00000000010b','responded',
   CURRENT_DATE - 20, NULL),
  ('f9600000-0000-4000-8000-00000000000a','f9500000-0000-4000-8000-00000000010c','responded',
   CURRENT_DATE - 18, CURRENT_DATE - 12),
  ('f9600000-0000-4000-8000-00000000000a','f9500000-0000-4000-8000-00000000010d','sent',
   CURRENT_DATE - 9, NULL);

-- select_trade_scope_bid() (00423) promotes an EXISTING row in place and never
-- touches noted_at, so this is what a selected bid really looks like: one row,
-- status 'selected', carrying the day its NUMBER was written down.
INSERT INTO public.trade_scope_bids (proposal_id, party_id, amount_cents, status, noted_at) VALUES
  ('f9600000-0000-4000-8000-00000000000a','f9500000-0000-4000-8000-00000000010b',
   1250000,'selected', (CURRENT_DATE - 16)::timestamptz);

WITH strongest_bid AS (
  SELECT DISTINCT ON (b.party_id)
    b.party_id, b.status, b.amount_cents
  FROM public.trade_scope_bids b
  ORDER BY b.party_id,
           CASE b.status WHEN 'selected' THEN 0 WHEN 'quoted' THEN 1 ELSE 2 END,
           b.noted_at DESC, b.id
),
quoted_bid AS (
  SELECT DISTINCT ON (b.party_id) b.party_id, b.noted_at
  FROM public.trade_scope_bids b
  WHERE b.status = 'quoted'
  ORDER BY b.party_id, b.noted_at, b.id
),
latest_rfq AS (
  SELECT DISTINCT ON (r.party_id) r.party_id, r.status, r.sent_at, r.responded_at
  FROM public.trade_rfq_requests r
  ORDER BY r.party_id, r.created_at DESC, r.id
),
mapped AS (
  SELECT
    COALESCE(sb.party_id, lr.party_id) AS party_id,
    CASE
      WHEN sb.status = 'selected'  THEN 'selected'
      WHEN sb.status = 'quoted'    THEN 'quoted'
      WHEN sb.status = 'withdrawn' THEN 'withdrawn'
      WHEN lr.status = 'sent'      THEN 'asked'
      WHEN lr.status = 'responded' THEN 'quoted'
      ELSE NULL
    END                              AS outcome,
    sb.amount_cents                  AS amount_cents,
    lr.sent_at::date                 AS asked_at,
    COALESCE(lr.responded_at, qb.noted_at)::date AS quoted_at
  FROM strongest_bid sb
  FULL OUTER JOIN latest_rfq lr ON lr.party_id = sb.party_id
  LEFT JOIN quoted_bid qb ON qb.party_id = COALESCE(sb.party_id, lr.party_id)
)
UPDATE public.project_parties pp
   SET bid_outcome      = m.outcome,
       bid_amount_cents = COALESCE(pp.bid_amount_cents, m.amount_cents),
       bid_asked_at     = COALESCE(pp.bid_asked_at,  m.asked_at),
       bid_quoted_at    = COALESCE(pp.bid_quoted_at, m.quoted_at)
  FROM mapped m
 WHERE pp.id = m.party_id
   AND m.outcome IS NOT NULL
   AND pp.bid_outcome IS NULL;

DO $$
DECLARE
  r record;
  n integer;
BEGIN
  SELECT bid_outcome, bid_amount_cents, bid_asked_at, bid_quoted_at, bid_selected_at, bid_due_at
    INTO r FROM public.project_parties WHERE id = 'f9500000-0000-4000-8000-00000000010b';
  IF r.bid_outcome <> 'selected' THEN
    RAISE EXCEPTION 'BLOCK 7b FAIL: the selected bid mapped to %', r.bid_outcome;
  END IF;
  IF r.bid_amount_cents <> 1250000 THEN
    RAISE EXCEPTION 'BLOCK 7b FAIL: the amount mapped to %', r.bid_amount_cents;
  END IF;
  IF r.bid_asked_at <> CURRENT_DATE - 20 THEN
    RAISE EXCEPTION 'BLOCK 7b FAIL: asked_at mapped to %', r.bid_asked_at;
  END IF;
  -- B2-3: the selected row's noted_at is the day the NUMBER arrived, and it
  -- may answer NEITHER of these two columns. quoted_bid reads status 'quoted'
  -- only, and bid_selected_at is not backfilled at all — so the roster row can
  -- never print "Quoted <d>. Selected <the same d>."
  IF r.bid_quoted_at IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 7b FAIL: bid_quoted_at was taken from a `selected` row''s noted_at (%) — r2 B2-3', r.bid_quoted_at;
  END IF;
  IF r.bid_selected_at IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 7b FAIL: the backfill wrote a selection date (%) the record does not hold — r2 B2-3', r.bid_selected_at;
  END IF;
  IF r.bid_due_at IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 7b FAIL: the backfill guessed a due date';
  END IF;

  -- the RFQ rail's own responded_at still answers bid_quoted_at
  SELECT bid_outcome, bid_asked_at, bid_quoted_at, bid_selected_at
    INTO r FROM public.project_parties WHERE id = 'f9500000-0000-4000-8000-00000000010c';
  IF r.bid_outcome <> 'quoted' OR r.bid_quoted_at <> CURRENT_DATE - 12 THEN
    RAISE EXCEPTION 'BLOCK 7b FAIL: the responded RFQ mapped to % / %', r.bid_outcome, r.bid_quoted_at;
  END IF;
  IF r.bid_selected_at IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 7b FAIL: a selection date landed on a seat nobody chose';
  END IF;

  -- asked and nothing back
  SELECT bid_outcome, bid_asked_at, bid_quoted_at
    INTO r FROM public.project_parties WHERE id = 'f9500000-0000-4000-8000-00000000010d';
  IF r.bid_outcome <> 'asked' OR r.bid_asked_at <> CURRENT_DATE - 9 OR r.bid_quoted_at IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 7b FAIL: the unanswered ask mapped to % / % / %',
      r.bid_outcome, r.bid_asked_at, r.bid_quoted_at;
  END IF;

  -- and the guard: a seat the studio has already typed an outcome onto is
  -- untouched by a rerun
  SELECT count(*) INTO n FROM public.project_parties
   WHERE id = 'f9500000-0000-4000-8000-00000000000a' AND bid_outcome = 'quoted'
     AND bid_amount_cents = 1850000;
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 7b FAIL: the backfill overwrote a hand-typed bid';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. the r4 review's four merge findings, pinned
--
--   B-1  the absorbed card's LOGIN and address travel; two different logins
--        refuse by name.
--   B-2  a merge that would leave a recorded contact refusal behind on the
--        absorbed card refuses by name. WIDENED r5 M-2: the test is
--        subsumption, not R-BL's hard block, so a one-channel refusal and an
--        unmatched route both refuse, and only a survivor whose own rule
--        already says everything the absorbed rule says merges.
--   M-1  the sole-proprietor fold moves a supersede CHAIN in the same order
--        the same-kind branch does — heads first, lineage behind them.
--   M-3  the live agreement link and the lien waiver repoint onto the
--        survivor; a SENT agreement's frozen contact_id does not abort it.
--
-- Its own f9a… id space, so nothing above is disturbed.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, company_name,
   email, profile_id, is_sole_proprietor, created_by, created_at) VALUES
  -- B-1: the older card survives and holds neither login nor address
  ('f9a00000-0000-4000-8000-00000000000a','f9000000-0000-4000-8000-00000000000a','person','client_rep','R4 Chidi Old',   NULL, NULL,                  NULL,                                   false,'a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f9a00000-0000-4000-8000-00000000000b','f9000000-0000-4000-8000-00000000000a','person','client_rep','R4 Chidi New',   NULL, 'chidi.r4@test.invalid','a0000000-0000-0000-0000-000000000003',false,'a0000000-0000-0000-0000-000000000004','2025-01-01'),
  -- B-1 negative control: two different logins
  ('f9a00000-0000-4000-8000-00000000001a','f9000000-0000-4000-8000-00000000000a','person','sub','R4 Login A', NULL, NULL,'a0000000-0000-0000-0000-000000000003',false,'a0000000-0000-0000-0000-000000000004','2024-02-01'),
  ('f9a00000-0000-4000-8000-00000000001b','f9000000-0000-4000-8000-00000000000a','person','sub','R4 Login B', NULL, NULL,'a0000000-0000-0000-0000-000000000004',false,'a0000000-0000-0000-0000-000000000004','2025-02-01'),
  -- B-2: a permissive survivor and a blocking duplicate, plus the route target
  ('f9a00000-0000-4000-8000-00000000002a','f9000000-0000-4000-8000-00000000000a','person','sub','R4 Frank Survivor', NULL,NULL,NULL,false,'a0000000-0000-0000-0000-000000000004','2024-03-01'),
  ('f9a00000-0000-4000-8000-00000000002b','f9000000-0000-4000-8000-00000000000a','person','sub','R4 Frank Duplicate',NULL,NULL,NULL,false,'a0000000-0000-0000-0000-000000000004','2025-03-01'),
  ('f9a00000-0000-4000-8000-00000000002c','f9000000-0000-4000-8000-00000000000a','person','sub','R4 Rosa',           NULL,NULL,NULL,false,'a0000000-0000-0000-0000-000000000004','2024-03-01'),
  -- B-2 control: never-text is not a block (R-BL, F-27 Ray Thao)
  ('f9a00000-0000-4000-8000-00000000003a','f9000000-0000-4000-8000-00000000000a','person','sub','R4 Ray Survivor', NULL,NULL,NULL,false,'a0000000-0000-0000-0000-000000000004','2024-04-01'),
  ('f9a00000-0000-4000-8000-00000000003b','f9000000-0000-4000-8000-00000000000a','person','sub','R4 Ray Duplicate',NULL,NULL,NULL,false,'a0000000-0000-0000-0000-000000000004','2025-04-01'),
  -- M-1: the sole proprietor and their one-man firm
  ('f9a00000-0000-4000-8000-00000000004a','f9000000-0000-4000-8000-00000000000a','person','sub','R4 Dana Owner-Operator',NULL,NULL,NULL,true,'a0000000-0000-0000-0000-000000000004','2024-05-01'),
  ('f9a00000-0000-4000-8000-00000000004b','f9000000-0000-4000-8000-00000000000a','company','sub',NULL,'R4 Kowalski Electric',NULL,NULL,false,'a0000000-0000-0000-0000-000000000004','2024-05-01'),
  -- M-3: one firm carded twice, the newer one carrying the paperwork
  ('f9a00000-0000-4000-8000-00000000005a','f9000000-0000-4000-8000-00000000000a','company','sub',NULL,'R4 Ostrom Builders',    NULL,NULL,false,'a0000000-0000-0000-0000-000000000004','2024-06-01'),
  ('f9a00000-0000-4000-8000-00000000005b','f9000000-0000-4000-8000-00000000000a','company','sub',NULL,'R4 Ostrom Builders LLC',NULL,NULL,false,'a0000000-0000-0000-0000-000000000004','2025-06-01');

INSERT INTO public.studio_contact_rules
  (subject_type, subject_id, channels_allowed, channels_forbidden, route_to_person_id, set_by) VALUES
  ('person','f9a00000-0000-4000-8000-00000000002a', ARRAY['email','mobile'], '{}', NULL, 'a0000000-0000-0000-0000-000000000004'),
  ('person','f9a00000-0000-4000-8000-00000000002b', '{}', ARRAY['sms','mobile','office','email'],
   'f9a00000-0000-4000-8000-00000000002c', 'a0000000-0000-0000-0000-000000000004'),
  ('person','f9a00000-0000-4000-8000-00000000003a', ARRAY['email'], '{}', NULL, 'a0000000-0000-0000-0000-000000000004'),
  ('person','f9a00000-0000-4000-8000-00000000003b', ARRAY['email','office'], ARRAY['sms'], NULL, 'a0000000-0000-0000-0000-000000000004');

-- M-1's chain, written the way a book writes one: the original, its renewal
-- retiring it, then the renewal's renewal. Two retired rows behind one head.
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, issued_on, expires_on, blocks) VALUES
  ('f9a10000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-00000000000a','company',
   'f9a00000-0000-4000-8000-00000000004b','coi_gl','2023-01-01', CURRENT_DATE + 400, ARRAY['site_access']);
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, issued_on, expires_on, blocks) VALUES
  ('f9a10000-0000-4000-8000-000000000002','f9000000-0000-4000-8000-00000000000a','company',
   'f9a00000-0000-4000-8000-00000000004b','coi_gl','2024-01-01', CURRENT_DATE + 800, ARRAY['site_access']);
UPDATE public.studio_compliance_documents SET superseded_by = 'f9a10000-0000-4000-8000-000000000002'
 WHERE id = 'f9a10000-0000-4000-8000-000000000001';
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, issued_on, expires_on, blocks) VALUES
  ('f9a10000-0000-4000-8000-000000000003','f9000000-0000-4000-8000-00000000000a','company',
   'f9a00000-0000-4000-8000-00000000004b','coi_gl','2025-01-01', CURRENT_DATE + 1200, ARRAY['site_access']);
UPDATE public.studio_compliance_documents SET superseded_by = 'f9a10000-0000-4000-8000-000000000003'
 WHERE id = 'f9a10000-0000-4000-8000-000000000002';

-- M-3's paperwork: one draft agreement, one SENT agreement, and the live link
-- token on the sent one.
INSERT INTO public.studio_trade_agreements
  (id, project_id, studio_id, contact_id, contact_display_name, title, scope, price_cents, state, created_by) VALUES
  ('f9a20000-0000-4000-8000-000000000001','f9300000-0000-4000-8000-00000000000a','f9000000-0000-4000-8000-00000000000a',
   'f9a00000-0000-4000-8000-00000000005b','R4 Ostrom Builders LLC','Framing','Frame the addition',500000,'draft',
   'a0000000-0000-0000-0000-000000000004'),
  ('f9a20000-0000-4000-8000-000000000002','f9300000-0000-4000-8000-00000000000a','f9000000-0000-4000-8000-00000000000a',
   'f9a00000-0000-4000-8000-00000000005b','R4 Ostrom Builders LLC','Siding','Side the addition',300000,'sent',
   'a0000000-0000-0000-0000-000000000004');
INSERT INTO public.studio_trade_agreement_tokens
  (id, agreement_id, contact_id, token_hash, status, created_by) VALUES
  ('f9a20000-0000-4000-8000-00000000000a','f9a20000-0000-4000-8000-000000000002',
   'f9a00000-0000-4000-8000-00000000005b', repeat('c', 64), 'active',
   'a0000000-0000-0000-0000-000000000004');

DO $$
DECLARE
  v_state text;
  v_row   record;
  n       integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

  -- ── B-1 ────────────────────────────────────────────────────────────────
  SELECT reach_state INTO v_state FROM public.people_directory
   WHERE person_id = 'f9a00000-0000-4000-8000-00000000000b';
  IF v_state IS DISTINCT FROM 'account' THEN
    RAISE EXCEPTION 'BLOCK 8 FAIL: the fixture card with a login did not read account (%)', v_state;
  END IF;

  PERFORM public.merge_studio_contacts(
    'f9a00000-0000-4000-8000-00000000000a','f9a00000-0000-4000-8000-00000000000b','phone');

  SELECT reach_state, email, profile_id INTO v_row FROM public.people_directory
   WHERE person_id = 'f9a00000-0000-4000-8000-00000000000a';
  IF v_row.reach_state IS DISTINCT FROM 'account' THEN
    RAISE EXCEPTION 'BLOCK 8 FAIL (r4 B-1): the merge subtracted the account — the row reads %', v_row.reach_state;
  END IF;
  IF v_row.profile_id IS DISTINCT FROM 'a0000000-0000-0000-0000-000000000003' THEN
    RAISE EXCEPTION 'BLOCK 8 FAIL (r4 B-1): the login did not travel (%)', v_row.profile_id;
  END IF;
  IF v_row.email IS DISTINCT FROM 'chidi.r4@test.invalid' THEN
    RAISE EXCEPTION 'BLOCK 8 FAIL (r4 B-1): the address did not travel (%)', v_row.email;
  END IF;
  SELECT count(*) INTO n FROM public.people_directory
   WHERE person_id = 'f9a00000-0000-4000-8000-00000000000b';
  IF n <> 0 THEN
    RAISE EXCEPTION 'BLOCK 8 FAIL: the absorbed card still emits a Directory row';
  END IF;

  BEGIN
    PERFORM public.merge_studio_contacts(
      'f9a00000-0000-4000-8000-00000000001a','f9a00000-0000-4000-8000-00000000001b','manual');
    RAISE EXCEPTION 'BLOCK 8 FAIL (r4 B-1): two different logins merged';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF SQLERRM <> 'merge_two_logins' THEN RAISE; END IF;
  END;

  -- ── B-2 ────────────────────────────────────────────────────────────────
  BEGIN
    PERFORM public.merge_studio_contacts(
      'f9a00000-0000-4000-8000-00000000002a','f9a00000-0000-4000-8000-00000000002b','phone');
    RAISE EXCEPTION 'BLOCK 8 FAIL (r4 B-2): a do-not-contact block was left on the absorbed card';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF SQLERRM <> 'merge_contact_rule_conflict' THEN RAISE; END IF;
  END;

  IF public.contact_rule_summary('person','f9a00000-0000-4000-8000-00000000002b')
       NOT LIKE '%Write R4 Rosa instead.%' THEN
    RAISE EXCEPTION 'BLOCK 8 FAIL (r4 B-2): the refused merge moved the rule anyway';
  END IF;

  -- r5 M-2: the survivor forbidding all four is STILL not enough, because
  -- the absorbed rule also names a route ("write Rosa instead") the survivor
  -- does not carry. The refusal is about what the survivor's clause would
  -- stop saying, not about how terracotta the absorbed one is.
  PERFORM pg_temp.reset_role();
  UPDATE public.studio_contact_rules
     SET channels_forbidden = ARRAY['sms','mobile','office','email']
   WHERE subject_id = 'f9a00000-0000-4000-8000-00000000002a';
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  BEGIN
    PERFORM public.merge_studio_contacts(
      'f9a00000-0000-4000-8000-00000000002a','f9a00000-0000-4000-8000-00000000002b','phone');
    RAISE EXCEPTION 'BLOCK 8 FAIL (r5 M-2): the route to R4 Rosa was dropped';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF SQLERRM <> 'merge_contact_rule_conflict' THEN RAISE; END IF;
  END;

  -- the survivor now says everything the absorbed card says, route included:
  -- nothing is lost by keeping it, and the merge stands.
  PERFORM pg_temp.reset_role();
  UPDATE public.studio_contact_rules
     SET route_to_person_id = 'f9a00000-0000-4000-8000-00000000002c'
   WHERE subject_id = 'f9a00000-0000-4000-8000-00000000002a';
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.merge_studio_contacts(
    'f9a00000-0000-4000-8000-00000000002a','f9a00000-0000-4000-8000-00000000002b','phone');

  -- r5 M-2 — "never text" with email and office open is NOT a hard block
  -- (R-BL still), and is still a refusal the merge may not drop: R-BL rules
  -- what earns a terracotta leading rule on a face, not what may vanish.
  -- F-27 Ray Thao's shape.
  BEGIN
    PERFORM public.merge_studio_contacts(
      'f9a00000-0000-4000-8000-00000000003a','f9a00000-0000-4000-8000-00000000003b','phone');
    RAISE EXCEPTION 'BLOCK 8 FAIL (r5 M-2): a one-channel refusal was left on the folded card';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF SQLERRM <> 'merge_contact_rule_conflict' THEN RAISE; END IF;
  END;

  IF public.contact_rule_summary('person','f9a00000-0000-4000-8000-00000000003a')
       LIKE '%Never%' THEN
    RAISE EXCEPTION 'BLOCK 8 FAIL (r5 M-2): the refused merge moved the rule anyway';
  END IF;

  -- subsumed: the survivor already forbids sms, so the merge stands.
  PERFORM pg_temp.reset_role();
  UPDATE public.studio_contact_rules
     SET channels_forbidden = ARRAY['sms']
   WHERE subject_id = 'f9a00000-0000-4000-8000-00000000003a';
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.merge_studio_contacts(
    'f9a00000-0000-4000-8000-00000000003a','f9a00000-0000-4000-8000-00000000003b','phone');

  -- ── M-1 ────────────────────────────────────────────────────────────────
  PERFORM public.merge_studio_contacts(
    'f9a00000-0000-4000-8000-00000000004a','f9a00000-0000-4000-8000-00000000004b','company_name');
  SELECT count(*) INTO n FROM public.studio_compliance_documents
   WHERE id IN ('f9a10000-0000-4000-8000-000000000001','f9a10000-0000-4000-8000-000000000002',
                'f9a10000-0000-4000-8000-000000000003')
     AND holder_id = 'f9a00000-0000-4000-8000-00000000004a'
     AND holder_type = 'person';
  IF n <> 3 THEN
    RAISE EXCEPTION 'BLOCK 8 FAIL (r4 M-1): % of 3 certificates reached the sole proprietor', n;
  END IF;

  -- ── M-3 ────────────────────────────────────────────────────────────────
  PERFORM public.merge_studio_contacts(
    'f9a00000-0000-4000-8000-00000000005a','f9a00000-0000-4000-8000-00000000005b','company_name');
  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO n FROM public.studio_trade_agreement_tokens
   WHERE id = 'f9a20000-0000-4000-8000-00000000000a'
     AND contact_id = 'f9a00000-0000-4000-8000-00000000005a';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 8 FAIL (r4 M-3): the live agreement link did not repoint onto the survivor';
  END IF;
  SELECT count(*) INTO n FROM public.studio_trade_agreements
   WHERE id = 'f9a20000-0000-4000-8000-000000000001'
     AND contact_id = 'f9a00000-0000-4000-8000-00000000005a';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 8 FAIL (r4 M-3): the DRAFT agreement did not repoint';
  END IF;
  SELECT count(*) INTO n FROM public.studio_trade_agreements
   WHERE id = 'f9a20000-0000-4000-8000-000000000002'
     AND contact_id = 'f9a00000-0000-4000-8000-00000000005b';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 8 FAIL (r4 M-3): the SENT agreement''s frozen contact_id moved';
  END IF;

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT count(*) INTO n FROM public.access_grants_trade_agreement_links()
   WHERE subject_id = 'f9a00000-0000-4000-8000-00000000005a';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 8 FAIL (r4 M-3): the company card''s agreement_link grant does not key on the survivor';
  END IF;
  PERFORM pg_temp.reset_role();
END $$;


-- ═══════════════════════════════════════════════════════════════════════════
-- 9. the r5 review's five findings, pinned
--
--   B-1  every typed fact on the absorbed card reaches the survivor, on BOTH
--        entity kinds (the firm fold AND the person fold), COALESCEd.
--   M-1  set_household_threshold() moves the figure AND the grants the
--        household is the stated source of; a hand-sourced grant stands;
--        erasing the figure closes them.
--   M-2  pinned in block 8 above (the subsumption gate).
--   M-3  a corrected expiry announces again.
--   M-4  a merge whose SURVIVOR was put away refuses by name.
--
-- Its own f9b… id space.
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, company_name,
   company_kind, created_by, created_at) VALUES
  -- B-1 firm fold: the OLDER blank card PR-o pre-picks, and the newer one
  -- carrying everything the studio actually typed.
  ('f9b00000-0000-4000-8000-00000000001a','f9000000-0000-4000-8000-00000000000a','company','sub',NULL,'R5 Ostrom Blank', NULL,'a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f9b00000-0000-4000-8000-00000000001b','f9000000-0000-4000-8000-00000000000a','company','sub',NULL,'R5 Ostrom Typed', NULL,'a0000000-0000-0000-0000-000000000004','2025-01-01'),
  -- B-1 person fold (the QA walk's own shape: notes, verdict, specialties,
  -- warranty on a PERSON card)
  ('f9b00000-0000-4000-8000-00000000002a','f9000000-0000-4000-8000-00000000000a','person','sub','R5 Wren Older',NULL,NULL,'a0000000-0000-0000-0000-000000000004','2024-02-01'),
  ('f9b00000-0000-4000-8000-00000000002b','f9000000-0000-4000-8000-00000000000a','person','sub','R5 Wren Newer',NULL,NULL,'a0000000-0000-0000-0000-000000000004','2025-02-01'),
  -- M-4: a card the studio put away, beside a live duplicate
  ('f9b00000-0000-4000-8000-00000000003a','f9000000-0000-4000-8000-00000000000a','person','sub','R5 Put Away',  NULL,NULL,'a0000000-0000-0000-0000-000000000004','2024-03-01'),
  ('f9b00000-0000-4000-8000-00000000003b','f9000000-0000-4000-8000-00000000000a','person','sub','R5 Still Live',NULL,NULL,'a0000000-0000-0000-0000-000000000004','2025-03-01'),
  -- M-3: the holder of a document whose date the studio corrects
  ('f9b00000-0000-4000-8000-00000000004a','f9000000-0000-4000-8000-00000000000a','company','sub',NULL,'R5 Date Corrector',NULL,'a0000000-0000-0000-0000-000000000004','2024-04-01');

UPDATE public.studio_contacts
   SET studio_verdict    = 'Good crew. Slow to send paper.',
       studio_verdict_at = '2026-02-01T00:00:00Z',
       legal_name        = 'R5 Ostrom Builders LLC',
       dba_name          = 'R5 Ostrom',
       company_kind      = 'sub',
       remit_to          = 'PO Box 44, Minneapolis MN',
       retainage_bps     = 1000,
       tax_id_last4      = '4417',
       w9_on_file_at     = '2026-08-15',
       warranty_until    = '2027-09-14',
       notes             = 'Ask for Pete, not the office.',
       trades            = ARRAY['framing'],
       specialties       = ARRAY['millwork']
 WHERE id = 'f9b00000-0000-4000-8000-00000000001b';

-- the survivor holds two of the thirteen itself, so the COALESCE rule is
-- measured in both directions in one act.
UPDATE public.studio_contacts
   SET notes  = 'The survivor''s own note.',
       trades = ARRAY['siding']
 WHERE id = 'f9b00000-0000-4000-8000-00000000001a';

UPDATE public.studio_contacts
   SET studio_verdict = 'Excellent. Always on time.',
       notes          = 'Owner-operator. Repeat sub.',
       specialties    = ARRAY['electrical'],
       warranty_until = '2027-06-01'
 WHERE id = 'f9b00000-0000-4000-8000-00000000002b';

UPDATE public.studio_contacts SET archived_at = now()
 WHERE id = 'f9b00000-0000-4000-8000-00000000003a';

INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, blocks, issued_on, expires_on) VALUES
  ('f9b10000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-00000000000a','company',
   'f9b00000-0000-4000-8000-00000000004a','coi_gl', ARRAY['site_access']::text[],
   CURRENT_DATE - 300, CURRENT_DATE + 5);

DO $$
DECLARE
  v_card public.studio_contacts%ROWTYPE;
  n      integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

  -- ── B-1 · the FIRM fold ─────────────────────────────────────────────────
  PERFORM public.merge_studio_contacts(
    'f9b00000-0000-4000-8000-00000000001a','f9b00000-0000-4000-8000-00000000001b','company_name');
  SELECT * INTO v_card FROM public.studio_contacts
   WHERE id = 'f9b00000-0000-4000-8000-00000000001a';

  IF v_card.studio_verdict IS DISTINCT FROM 'Good crew. Slow to send paper.'
     OR v_card.studio_verdict_at IS NULL THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 B-1): the verdict and its date did not travel (%, %)',
      v_card.studio_verdict, v_card.studio_verdict_at;
  END IF;
  IF v_card.remit_to IS DISTINCT FROM 'PO Box 44, Minneapolis MN'
     OR v_card.retainage_bps IS DISTINCT FROM 1000
     OR btrim(v_card.tax_id_last4) IS DISTINCT FROM '4417' THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 B-1): the payee facts did not travel (%, %, %)',
      v_card.remit_to, v_card.retainage_bps, v_card.tax_id_last4;
  END IF;
  IF v_card.legal_name IS DISTINCT FROM 'R5 Ostrom Builders LLC'
     OR v_card.dba_name IS DISTINCT FROM 'R5 Ostrom'
     OR v_card.company_kind IS DISTINCT FROM 'sub'
     OR v_card.w9_on_file_at IS DISTINCT FROM DATE '2026-08-15'
     OR v_card.warranty_until IS DISTINCT FROM DATE '2027-09-14' THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 B-1): a named firm fact did not travel';
  END IF;
  -- the survivor's own value WINS where it has one (COALESCE, never overwrite)
  IF v_card.notes IS DISTINCT FROM 'The survivor''s own note.' THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 B-1): the merge overwrote the survivor''s own note (%)',
      v_card.notes;
  END IF;
  -- the two NOT NULL arrays are UNIONED, so neither card's is lost
  IF NOT (v_card.trades @> ARRAY['siding','framing']
          AND cardinality(v_card.trades) = 2) THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 B-1): trades did not union (%)', v_card.trades;
  END IF;
  IF v_card.specialties IS DISTINCT FROM ARRAY['millwork'] THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 B-1): specialties did not travel (%)', v_card.specialties;
  END IF;
  -- and the Directory row the room actually reads carries them
  SELECT count(*) INTO n FROM public.people_directory
   WHERE person_id = 'f9b00000-0000-4000-8000-00000000001a';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 B-1): the survivor emits % Directory rows', n;
  END IF;

  -- ── B-1 · the PERSON fold (the QA walk's own shape) ─────────────────────
  PERFORM public.merge_studio_contacts(
    'f9b00000-0000-4000-8000-00000000002a','f9b00000-0000-4000-8000-00000000002b','phone');
  SELECT * INTO v_card FROM public.studio_contacts
   WHERE id = 'f9b00000-0000-4000-8000-00000000002a';
  IF v_card.studio_verdict IS DISTINCT FROM 'Excellent. Always on time.'
     OR v_card.notes IS DISTINCT FROM 'Owner-operator. Repeat sub.'
     OR v_card.specialties IS DISTINCT FROM ARRAY['electrical']
     OR v_card.warranty_until IS DISTINCT FROM DATE '2027-06-01' THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 B-1): a person-to-person merge dropped a typed fact';
  END IF;

  -- ── M-4 · a survivor the studio put away ────────────────────────────────
  BEGIN
    PERFORM public.merge_studio_contacts(
      'f9b00000-0000-4000-8000-00000000003a','f9b00000-0000-4000-8000-00000000003b','phone');
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 M-4): a merge onto a put-away card was permitted';
  EXCEPTION WHEN sqlstate 'P0001' THEN
    IF SQLERRM <> 'merge_survivor_archived' THEN RAISE; END IF;
  END;
  -- the other direction is the ordinary tidy, and stands
  PERFORM public.merge_studio_contacts(
    'f9b00000-0000-4000-8000-00000000003b','f9b00000-0000-4000-8000-00000000003a','phone');
  PERFORM pg_temp.reset_role();
END $$;

-- ── M-1 · the figure, and the grants it already wrote ─────────────────────
-- Block 3 seated f9100000…000f as `client_rep` on the job and wrote its open
-- money grant at 250000 from household f9600000…000a.
DO $$
DECLARE
  v_seat uuid;
  v_thr  integer;
  v_src  text;
  v_to   date;
  n      integer;
BEGIN
  SELECT pp.id INTO v_seat FROM public.project_parties pp
   WHERE pp.project_id        = 'f9300000-0000-4000-8000-00000000000a'
     AND pp.studio_contact_id = 'f9100000-0000-4000-8000-00000000000f'
     AND pp.party_kind        = 'client_rep';
  IF v_seat IS NULL THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 M-1): block 3''s client_rep seat is missing';
  END IF;
  SELECT threshold_cents, source_clause INTO v_thr, v_src
    FROM public.project_party_authority
   WHERE engagement_id = v_seat AND scope = 'money' AND effective_to IS NULL;
  IF v_thr <> 250000 OR v_src <> 'client_households.co_threshold_cents' THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 M-1): the seat''s grant reads % / %', v_thr, v_src;
  END IF;

  -- PR-n: a plain member may not move the figure
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  BEGIN
    PERFORM public.set_household_threshold('f9600000-0000-4000-8000-00000000000a', 500000);
    PERFORM pg_temp.reset_role();
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 M-1): a plain member moved the figure';
  EXCEPTION WHEN OTHERS THEN
    PERFORM pg_temp.reset_role();
    IF SQLERRM NOT LIKE '%household_threshold_forbidden%' THEN
      RAISE EXCEPTION 'BLOCK 9 FAIL (r5 M-1): expected household_threshold_forbidden, got %', SQLERRM;
    END IF;
  END;

  -- the owner raises it, and the seat moves with it
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.set_household_threshold('f9600000-0000-4000-8000-00000000000a', 500000);
  PERFORM pg_temp.reset_role();

  SELECT co_threshold_cents INTO v_thr FROM public.client_households
   WHERE id = 'f9600000-0000-4000-8000-00000000000a';
  IF v_thr <> 500000 THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 M-1): the household reads %', v_thr;
  END IF;
  SELECT threshold_cents INTO v_thr FROM public.project_party_authority
   WHERE engagement_id = v_seat AND scope = 'money' AND effective_to IS NULL;
  IF v_thr <> 500000 THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 M-1): the seat''s money grant still reads %', v_thr;
  END IF;

  -- a grant the studio re-sourced by hand is NOT the household's to move
  UPDATE public.project_party_authority
     SET source_clause = 'The agreement, clause 9.'
   WHERE engagement_id = v_seat AND scope = 'money' AND effective_to IS NULL;
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.set_household_threshold('f9600000-0000-4000-8000-00000000000a', 750000);
  PERFORM pg_temp.reset_role();
  SELECT threshold_cents INTO v_thr FROM public.project_party_authority
   WHERE engagement_id = v_seat AND scope = 'money' AND effective_to IS NULL;
  IF v_thr <> 500000 THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 M-1): a hand-sourced grant was moved by the household (%)', v_thr;
  END IF;

  -- erasing the figure CLOSES the grants the household sourced, rather than
  -- leaving a stale cap or widening to no cap at all
  UPDATE public.project_party_authority
     SET source_clause = 'client_households.co_threshold_cents'
   WHERE engagement_id = v_seat AND scope = 'money' AND effective_to IS NULL;
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  PERFORM public.set_household_threshold('f9600000-0000-4000-8000-00000000000a', NULL);
  PERFORM pg_temp.reset_role();
  SELECT count(*) INTO n FROM public.project_party_authority
   WHERE engagement_id = v_seat AND scope = 'money' AND effective_to IS NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 M-1): erasing the figure left % open money grants', n;
  END IF;
  SELECT effective_to INTO v_to FROM public.project_party_authority
   WHERE engagement_id = v_seat AND scope = 'money';
  IF v_to IS NULL THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 M-1): the closed grant carries no end date';
  END IF;
END $$;

-- ── M-3 · a corrected expiry announces again ──────────────────────────────
DO $$
DECLARE
  n integer;
  w text;
  d date;
BEGIN
  PERFORM public.sweep_compliance_expiries();
  SELECT count(*) INTO n FROM public.studio_compliance_notices
   WHERE document_id = 'f9b10000-0000-4000-8000-000000000001';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 M-3): the first sweep wrote % notices', n;
  END IF;

  -- the studio corrects the date OUT of the window …
  UPDATE public.studio_compliance_documents SET expires_on = CURRENT_DATE + 400
   WHERE id = 'f9b10000-0000-4000-8000-000000000001';
  w := public.compliance_document_state('f9b10000-0000-4000-8000-000000000001');
  IF w <> 'current' THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 M-3): the corrected paper reads %', w;
  END IF;
  SELECT count(*) INTO n FROM public.studio_compliance_notices
   WHERE document_id = 'f9b10000-0000-4000-8000-000000000001';
  IF n <> 0 THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 M-3): a moved date left % stale notices', n;
  END IF;

  -- … and back in, to the SAME date it was first told about
  UPDATE public.studio_compliance_documents SET expires_on = CURRENT_DATE + 5
   WHERE id = 'f9b10000-0000-4000-8000-000000000001';
  PERFORM public.sweep_compliance_expiries();
  SELECT count(*) INTO n FROM public.studio_compliance_notices
   WHERE document_id = 'f9b10000-0000-4000-8000-000000000001' AND state = 'lapses_soon';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 M-3): the studio was told % times about the restored date', n;
  END IF;
  SELECT expires_on INTO d FROM public.studio_compliance_notices
   WHERE document_id = 'f9b10000-0000-4000-8000-000000000001';
  IF d <> CURRENT_DATE + 5 THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 M-3): the notice does not record the date it was about (%)', d;
  END IF;

  -- and an UNCHANGED document is still swept silently, which is the whole of
  -- the original idempotency rule
  PERFORM public.sweep_compliance_expiries();
  SELECT count(*) INTO n FROM public.studio_compliance_notices
   WHERE document_id = 'f9b10000-0000-4000-8000-000000000001';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 9 FAIL (r5 M-3): a rerun wrote a second notice (% rows)', n;
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 10. the r6 review's five merge findings, pinned (R-BN)
--
-- "A merge never deletes a typed fact." Every one of these was measured on
-- the OLDER card surviving, which is PR-o's own pre-pick:
--   B-1  a duplicate channel row is an address plus six typed facts; the blind
--        dedupe DELETE destroyed a recorded unsubscribe and the room then
--        offered the address as live
--   M-1  a rule routing at the other card of the pair aborted the merge with
--        rule_route_is_self, and the repair the refusal named was itself
--        refused — a closed loop
--   M-2  the affiliation collision DELETE dropped the role, the three
--        designations and the true start date
--   M-3  the sole-proprietor fold deleted EVERY person's affiliation at the
--        folded firm and blanked their legacy firm pointer
--   M-4  is_sole_proprietor and vendor_id were the two typed facts r5 B-1's
--        own list still left behind
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, created_by, created_at) VALUES
  ('f9e00000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-00000000000a','person','sub','R6 B1 Older','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f9e00000-0000-4000-8000-000000000002','f9000000-0000-4000-8000-00000000000a','person','sub','R6 B1 Newer','a0000000-0000-0000-0000-000000000004','2026-01-01'),
  ('f9e00000-0000-4000-8000-000000000003','f9000000-0000-4000-8000-00000000000a','person','sub','R6 A Survivor','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f9e00000-0000-4000-8000-000000000004','f9000000-0000-4000-8000-00000000000a','person','sub','R6 A Absorbed','a0000000-0000-0000-0000-000000000004','2026-01-01'),
  ('f9e00000-0000-4000-8000-000000000005','f9000000-0000-4000-8000-00000000000a','person','sub','R6 C Survivor','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f9e00000-0000-4000-8000-000000000006','f9000000-0000-4000-8000-00000000000a','person','sub','R6 C Absorbed','a0000000-0000-0000-0000-000000000004','2026-01-01'),
  ('f9e00000-0000-4000-8000-000000000007','f9000000-0000-4000-8000-00000000000a','person','sub','R6 D Survivor','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f9e00000-0000-4000-8000-000000000008','f9000000-0000-4000-8000-00000000000a','person','sub','R6 D Absorbed','a0000000-0000-0000-0000-000000000004','2026-01-01'),
  ('f9e00000-0000-4000-8000-000000000009','f9000000-0000-4000-8000-00000000000a','person','sub','R6 N Survivor','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f9e00000-0000-4000-8000-00000000000a','f9000000-0000-4000-8000-00000000000a','person','sub','R6 N Absorbed','a0000000-0000-0000-0000-000000000004','2026-01-01'),
  ('f9e00000-0000-4000-8000-00000000000b','f9000000-0000-4000-8000-00000000000a','person','sub','R6 I Older','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f9e00000-0000-4000-8000-00000000000c','f9000000-0000-4000-8000-00000000000a','person','sub','R6 I Newer','a0000000-0000-0000-0000-000000000004','2026-01-01'),
  ('f9e00000-0000-4000-8000-00000000000e','f9000000-0000-4000-8000-00000000000a','person','sub','R6 J Owner','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f9e00000-0000-4000-8000-00000000000f','f9000000-0000-4000-8000-00000000000a','person','sub','R6 J Bookkeeper','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f9e00000-0000-4000-8000-000000000011','f9000000-0000-4000-8000-00000000000a','person','sub','R6 E Older','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f9e00000-0000-4000-8000-000000000012','f9000000-0000-4000-8000-00000000000a','person','sub','R6 E Newer','a0000000-0000-0000-0000-000000000004','2026-01-01');

INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, company_name, company_kind, created_by, created_at) VALUES
  ('f9e00000-0000-4000-8000-00000000000d','f9000000-0000-4000-8000-00000000000a','company','sub','R6 I Firm','sub','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f9e00000-0000-4000-8000-000000000010','f9000000-0000-4000-8000-00000000000a','company','sub','R6 J Firm','sub','a0000000-0000-0000-0000-000000000004','2024-01-01');

UPDATE public.studio_contacts SET is_sole_proprietor = true
 WHERE id IN ('f9e00000-0000-4000-8000-00000000000e','f9e00000-0000-4000-8000-000000000012');
UPDATE public.studio_contacts SET vendor_id = '11111111-1111-1111-1111-111111111105'
 WHERE id = 'f9e00000-0000-4000-8000-000000000012';

-- B-1's pair: the survivor's row says active and blank; the absorbed row
-- carries the studio's own refusal, its date, verified, preferred and a label.
INSERT INTO public.studio_contact_channels
  (owner_type, owner_id, channel_kind, value, status, status_at, verified, verified_at, preferred, label) VALUES
  ('person','f9e00000-0000-4000-8000-000000000001','email','r6dana@example.invalid','active',      NULL,        false, NULL,        false, NULL),
  ('person','f9e00000-0000-4000-8000-000000000002','email','r6dana@example.invalid','unsubscribed','2025-12-03', true,'2025-11-01', true, 'Shop address');

INSERT INTO public.studio_contact_rules
  (subject_type, subject_id, channels_forbidden, route_to_person_id, reason, set_by) VALUES
  ('person','f9e00000-0000-4000-8000-000000000004', ARRAY['sms','email'], 'f9e00000-0000-4000-8000-000000000003','This card is the old one.','a0000000-0000-0000-0000-000000000004'),
  ('person','f9e00000-0000-4000-8000-000000000005', ARRAY['sms'],         'f9e00000-0000-4000-8000-000000000006','Write the other one.',     'a0000000-0000-0000-0000-000000000004'),
  ('person','f9e00000-0000-4000-8000-000000000008', ARRAY['sms'],         'f9e00000-0000-4000-8000-000000000007','This card is the old one.','a0000000-0000-0000-0000-000000000004'),
  ('person','f9e00000-0000-4000-8000-000000000007', ARRAY['sms','email'], NULL,                                  'Never text, never email.', 'a0000000-0000-0000-0000-000000000004'),
  ('person','f9e00000-0000-4000-8000-00000000000a', ARRAY['office'],      NULL,                                  'Never ring the office.',   'a0000000-0000-0000-0000-000000000004'),
  ('person','f9e00000-0000-4000-8000-000000000009', ARRAY['sms'],         NULL,                                  'Never text.',              'a0000000-0000-0000-0000-000000000004');

INSERT INTO public.studio_person_affiliations
  (person_id, company_id, role_at_firm, is_paperwork_contact, is_signer, holds_trade_license, from_date) VALUES
  ('f9e00000-0000-4000-8000-00000000000b','f9e00000-0000-4000-8000-00000000000d', NULL,       false,false,false,'2024-01-01'),
  ('f9e00000-0000-4000-8000-00000000000c','f9e00000-0000-4000-8000-00000000000d','Foreman',    true, true, true, '2019-03-01'),
  ('f9e00000-0000-4000-8000-00000000000e','f9e00000-0000-4000-8000-000000000010','Owner',      true, true, true, '2018-01-01'),
  ('f9e00000-0000-4000-8000-00000000000f','f9e00000-0000-4000-8000-000000000010','Bookkeeper', false,false,false,'2021-01-01');

DO $$
DECLARE
  c  public.studio_contact_channels%ROWTYPE;
  a  public.studio_person_affiliations%ROWTYPE;
  sc public.studio_contacts%ROWTYPE;
  r  public.studio_contact_rules%ROWTYPE;
  n  integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

  -- ── B-1 · the duplicate channel row reduces worst-first, then goes ──────
  PERFORM public.merge_studio_contacts(
    'f9e00000-0000-4000-8000-000000000001','f9e00000-0000-4000-8000-000000000002','email');
  SELECT * INTO c FROM public.studio_contact_channels
   WHERE owner_id = 'f9e00000-0000-4000-8000-000000000001' AND channel_kind = 'email'
     AND value = 'r6dana@example.invalid';
  IF c.status <> 'unsubscribed' THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 B-1): the recorded refusal reads % after the fold', c.status;
  END IF;
  IF c.status_at::date <> DATE '2025-12-03' THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 B-1): the refusal lost its date (%)', c.status_at;
  END IF;
  IF NOT c.verified OR c.verified_at::date <> DATE '2025-11-01' THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 B-1): verified/verified_at did not travel';
  END IF;
  IF NOT c.preferred THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 B-1): preferred did not travel';
  END IF;
  IF c.label <> 'Shop address' THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 B-1): the label did not travel (%)', c.label;
  END IF;
  SELECT count(*) INTO n FROM public.studio_contact_channels
   WHERE owner_id = 'f9e00000-0000-4000-8000-000000000002';
  IF n <> 0 THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 B-1): % rows left on the folded card', n;
  END IF;

  -- ── M-1 · a route at the other card of the pair merges, all three ways ──
  PERFORM public.merge_studio_contacts(
    'f9e00000-0000-4000-8000-000000000003','f9e00000-0000-4000-8000-000000000004','phone');
  SELECT * INTO r FROM public.studio_contact_rules
   WHERE subject_type = 'person' AND subject_id = 'f9e00000-0000-4000-8000-000000000003';
  IF r.id IS NULL THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 M-1 A): the absorbed rule did not travel';
  END IF;
  IF r.route_to_person_id IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 M-1 A): the fold wrote a self-route';
  END IF;
  IF NOT (ARRAY['sms','email']::text[] <@ r.channels_forbidden) THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 M-1 A): the refusal did not travel with the rule';
  END IF;

  PERFORM public.merge_studio_contacts(
    'f9e00000-0000-4000-8000-000000000005','f9e00000-0000-4000-8000-000000000006','phone');
  SELECT * INTO r FROM public.studio_contact_rules
   WHERE subject_type = 'person' AND subject_id = 'f9e00000-0000-4000-8000-000000000005';
  IF r.route_to_person_id IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 M-1 C): the survivor still routes at the card it absorbed';
  END IF;

  PERFORM public.merge_studio_contacts(
    'f9e00000-0000-4000-8000-000000000007','f9e00000-0000-4000-8000-000000000008','phone');
  SELECT * INTO r FROM public.studio_contact_rules
   WHERE subject_type = 'person' AND subject_id = 'f9e00000-0000-4000-8000-000000000007';
  IF r.route_to_person_id IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 M-1 D): the survivor''s own rule was left routing somewhere';
  END IF;

  -- and the gate still bites where a refusal really would be lost
  BEGIN
    PERFORM public.merge_studio_contacts(
      'f9e00000-0000-4000-8000-000000000009','f9e00000-0000-4000-8000-00000000000a','phone');
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 M-1 control): an unsubsumed refusal was merged away';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%merge_contact_rule_conflict%' THEN
      RAISE EXCEPTION 'BLOCK 10 FAIL (r6 M-1 control): refused by the wrong name — %', SQLERRM;
    END IF;
  END;

  -- ── M-2 · the affiliation collision reduces ─────────────────────────────
  PERFORM public.merge_studio_contacts(
    'f9e00000-0000-4000-8000-00000000000b','f9e00000-0000-4000-8000-00000000000c','phone');
  SELECT * INTO a FROM public.studio_person_affiliations
   WHERE person_id = 'f9e00000-0000-4000-8000-00000000000b'
     AND company_id = 'f9e00000-0000-4000-8000-00000000000d';
  IF a.role_at_firm IS DISTINCT FROM 'Foreman' THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 M-2): the crew line lost the role (%)', a.role_at_firm;
  END IF;
  IF NOT (a.is_paperwork_contact AND a.is_signer AND a.holds_trade_license) THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 M-2): the three designations did not OR up';
  END IF;
  IF a.from_date <> DATE '2019-03-01' THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 M-2): "since" reads % rather than the earlier true start', a.from_date;
  END IF;

  -- ── M-3 · the fold closes the rest of the crew, and keeps their firm ────
  PERFORM public.merge_studio_contacts(
    'f9e00000-0000-4000-8000-00000000000e','f9e00000-0000-4000-8000-000000000010','company_name');
  SELECT * INTO a FROM public.studio_person_affiliations
   WHERE person_id = 'f9e00000-0000-4000-8000-00000000000f'
     AND company_id = 'f9e00000-0000-4000-8000-000000000010';
  IF a.id IS NULL THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 M-3): the bookkeeper''s affiliation was deleted';
  END IF;
  IF a.to_date IS NULL THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 M-3): the affiliation was left open past the fold';
  END IF;
  IF a.role_at_firm <> 'Bookkeeper' THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 M-3): the role did not survive the close';
  END IF;
  SELECT * INTO sc FROM public.studio_contacts
   WHERE id = 'f9e00000-0000-4000-8000-00000000000f';
  IF sc.company_id IS DISTINCT FROM 'f9e00000-0000-4000-8000-000000000010'::uuid THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 M-3): the legacy firm pointer was blanked (%)', sc.company_id;
  END IF;
  SELECT count(*) INTO n FROM public.studio_person_affiliations
   WHERE company_id = 'f9e00000-0000-4000-8000-000000000010'
     AND person_id  = 'f9e00000-0000-4000-8000-00000000000e';
  IF n <> 0 THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 M-3): the self-affiliation survived the fold';
  END IF;
  SELECT count(*) INTO n FROM public.people_directory
   WHERE person_id = 'f9e00000-0000-4000-8000-00000000000f'
     AND meta->>'company_name' = 'R6 J Firm';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 M-3): the Directory row no longer names the firm';
  END IF;

  -- ── M-4 · is_sole_proprietor and vendor_id travel ───────────────────────
  PERFORM public.merge_studio_contacts(
    'f9e00000-0000-4000-8000-000000000011','f9e00000-0000-4000-8000-000000000012','phone');
  SELECT * INTO sc FROM public.studio_contacts
   WHERE id = 'f9e00000-0000-4000-8000-000000000011';
  IF NOT sc.is_sole_proprietor THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 M-4): is_sole_proprietor did not travel';
  END IF;
  IF sc.vendor_id IS DISTINCT FROM '11111111-1111-1111-1111-111111111105'::uuid THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 M-4): vendor_id did not travel (%)', sc.vendor_id;
  END IF;
  SELECT * INTO sc FROM public.studio_contacts
   WHERE id = 'f9e00000-0000-4000-8000-000000000012';
  IF sc.vendor_id IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 10 FAIL (r6 M-4): the folded card still holds the vendor pointer';
  END IF;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '10. the r6 review''s five merge findings (B-1, M-1, M-2, M-3, M-4) — R-BN: passed';
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 11. the r7 review's three migration findings (B-1, M-1, M-2)
-- ═══════════════════════════════════════════════════════════════════════════
--   B-1  a firm merge dropped the folded card's OWN three designations —
--        paperwork_contact_person_id, signer_person_id, site_contact_person_id
--        — while the merge sheet promised "firm designations move onto
--        <survivor>", the Directory firm row's payee marker (which reads
--        signer_person_id, not the affiliation's is_signer) went blank, and
--        "Chase the renewal" was drafted with no recipient
--   M-2  the sole-proprietor fold leaves the crew's legacy company_id naming
--        the folded card with zero OPEN affiliations, and the shipped card
--        editor's next ordinary save silently re-derived a fresh one with the
--        role and the start date at their defaults
--   M-1  compliance_successor_not_later and compliance_successor_drops_a_gate
--        were never gated on v_retiring, so an ordinary permitted edit to a
--        renewal left an existing supersede edge failing a leg nothing
--        re-checks — until the merge's holder-move re-judged it and lost the
--        whole transaction to a raw schema token
-- ═══════════════════════════════════════════════════════════════════════════
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, created_by, created_at) VALUES
  ('f9f00000-0000-4000-8000-000000000003','f9000000-0000-4000-8000-00000000000a','person','sub','R7 Paperwork Hand','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f9f00000-0000-4000-8000-000000000004','f9000000-0000-4000-8000-00000000000a','person','sub','R7 Signer Hand','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f9f00000-0000-4000-8000-000000000005','f9000000-0000-4000-8000-00000000000a','person','sub','R7 Site Hand','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f9f00000-0000-4000-8000-000000000006','f9000000-0000-4000-8000-00000000000a','person','sub','R7 Sole Prop','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f9f00000-0000-4000-8000-000000000008','f9000000-0000-4000-8000-00000000000a','person','sub','R7 Crew','a0000000-0000-0000-0000-000000000004','2024-01-01');

INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, company_name, company_kind, created_by, created_at) VALUES
  ('f9f00000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-00000000000a','company','sub','R7 Marrow & Sons','sub','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f9f00000-0000-4000-8000-000000000002','f9000000-0000-4000-8000-00000000000a','company','sub','R7 Marrow and Sons LLC','sub','a0000000-0000-0000-0000-000000000004','2026-01-01'),
  ('f9f00000-0000-4000-8000-000000000007','f9000000-0000-4000-8000-00000000000a','company','sub','R7 Sole Prop Firm','sub','a0000000-0000-0000-0000-000000000004','2026-01-01'),
  ('f9f00000-0000-4000-8000-000000000011','f9000000-0000-4000-8000-00000000000a','company','sub','R7 Gate Survivor','sub','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f9f00000-0000-4000-8000-000000000012','f9000000-0000-4000-8000-00000000000a','company','sub','R7 Gate Absorbed','sub','a0000000-0000-0000-0000-000000000004','2026-01-01'),
  ('f9f00000-0000-4000-8000-000000000013','f9000000-0000-4000-8000-00000000000a','company','sub','R7 Date Survivor','sub','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('f9f00000-0000-4000-8000-000000000014','f9000000-0000-4000-8000-00000000000a','company','sub','R7 Date Absorbed','sub','a0000000-0000-0000-0000-000000000004','2026-01-01');

UPDATE public.studio_contacts SET is_sole_proprietor = true
 WHERE id = 'f9f00000-0000-4000-8000-000000000006';

-- The NEWER firm card is the one the studio typed the three designations on,
-- and PR-o pre-picks the OLDER one to survive — which is exactly the shape
-- that lost all three.
UPDATE public.studio_contacts
   SET paperwork_contact_person_id = 'f9f00000-0000-4000-8000-000000000003',
       signer_person_id            = 'f9f00000-0000-4000-8000-000000000004',
       site_contact_person_id      = 'f9f00000-0000-4000-8000-000000000005'
 WHERE id = 'f9f00000-0000-4000-8000-000000000002';

-- The sole-proprietor fold's own edge: the firm names the SURVIVING PERSON as
-- its own site contact, which assert_studio_contact_designations() refuses as
-- designated_person_is_self the moment it lands on that person's card. The
-- carry drops exactly that value (NULLIF) and carries the other one.
UPDATE public.studio_contacts
   SET paperwork_contact_person_id = 'f9f00000-0000-4000-8000-000000000003',
       site_contact_person_id      = 'f9f00000-0000-4000-8000-000000000006'
 WHERE id = 'f9f00000-0000-4000-8000-000000000007';

-- The fold's crew: R-AI keeps the legacy pointer in step with the open
-- affiliation, so inserting the row derives studio_contacts.company_id.
INSERT INTO public.studio_person_affiliations
  (person_id, company_id, role_at_firm, is_paperwork_contact, is_signer, holds_trade_license, from_date) VALUES
  ('f9f00000-0000-4000-8000-000000000006','f9f00000-0000-4000-8000-000000000007','Owner',      true, true, true, '2018-01-01'),
  ('f9f00000-0000-4000-8000-000000000008','f9f00000-0000-4000-8000-000000000007','Bookkeeper', false,false,false,'2021-01-01');

-- M-1's two pairs. Each absorbed firm holds a renewal chain: a predecessor
-- pointing at a head that is in force and carries its gates at the moment the
-- edge is written — so the edge is legitimate — and the head is then EDITED,
-- which is a permitted member write that re-checks nothing.
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, blocks, issued_on, expires_on) VALUES
  -- gate variant: predecessor gates {site_access,draw}; head gates both too
  ('f9f40000-0000-4000-8000-000000000001','f9000000-0000-4000-8000-00000000000a','company',
   'f9f00000-0000-4000-8000-000000000012','coi_gl', ARRAY['site_access','draw']::text[],
   CURRENT_DATE - 800, CURRENT_DATE - 10),
  ('f9f40000-0000-4000-8000-000000000002','f9000000-0000-4000-8000-00000000000a','company',
   'f9f00000-0000-4000-8000-000000000012','coi_gl', ARRAY['site_access','draw']::text[],
   CURRENT_DATE - 30,  CURRENT_DATE + 400),
  -- date variant: predecessor runs to +100; head runs to +400
  ('f9f40000-0000-4000-8000-000000000003','f9000000-0000-4000-8000-00000000000a','company',
   'f9f00000-0000-4000-8000-000000000014','coi_gl', ARRAY['site_access']::text[],
   CURRENT_DATE - 400, CURRENT_DATE + 100),
  ('f9f40000-0000-4000-8000-000000000004','f9000000-0000-4000-8000-00000000000a','company',
   'f9f00000-0000-4000-8000-000000000014','coi_gl', ARRAY['site_access']::text[],
   CURRENT_DATE - 30,  CURRENT_DATE + 400);

UPDATE public.studio_compliance_documents
   SET superseded_by = 'f9f40000-0000-4000-8000-000000000002'
 WHERE id = 'f9f40000-0000-4000-8000-000000000001';
UPDATE public.studio_compliance_documents
   SET superseded_by = 'f9f40000-0000-4000-8000-000000000004'
 WHERE id = 'f9f40000-0000-4000-8000-000000000003';

DO $$
DECLARE
  sc public.studio_contacts%ROWTYPE;
  n  integer;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

  -- ── B-1 · the folded firm's own three designations travel ───────────────
  PERFORM public.merge_studio_contacts(
    'f9f00000-0000-4000-8000-000000000001','f9f00000-0000-4000-8000-000000000002','company_name');
  SELECT * INTO sc FROM public.studio_contacts
   WHERE id = 'f9f00000-0000-4000-8000-000000000001';
  IF sc.paperwork_contact_person_id IS DISTINCT FROM 'f9f00000-0000-4000-8000-000000000003'::uuid THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL (r7 B-1): paperwork_contact_person_id did not travel (%)', sc.paperwork_contact_person_id;
  END IF;
  IF sc.signer_person_id IS DISTINCT FROM 'f9f00000-0000-4000-8000-000000000004'::uuid THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL (r7 B-1): signer_person_id did not travel (%)', sc.signer_person_id;
  END IF;
  IF sc.site_contact_person_id IS DISTINCT FROM 'f9f00000-0000-4000-8000-000000000005'::uuid THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL (r7 B-1): site_contact_person_id did not travel (%)', sc.site_contact_person_id;
  END IF;
  -- R-BN: carried, never deleted — the folded card keeps its own copy
  SELECT * INTO sc FROM public.studio_contacts
   WHERE id = 'f9f00000-0000-4000-8000-000000000002';
  IF sc.signer_person_id IS DISTINCT FROM 'f9f00000-0000-4000-8000-000000000004'::uuid THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL (r7 B-1): the fold deleted the folded card''s own designation';
  END IF;

  -- ── B-1 · and the sole-proprietor fold does not name a person themselves ─
  PERFORM public.merge_studio_contacts(
    'f9f00000-0000-4000-8000-000000000006','f9f00000-0000-4000-8000-000000000007','company_name');
  SELECT * INTO sc FROM public.studio_contacts
   WHERE id = 'f9f00000-0000-4000-8000-000000000006';
  IF sc.paperwork_contact_person_id IS DISTINCT FROM 'f9f00000-0000-4000-8000-000000000003'::uuid THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL (r7 B-1): the fold dropped the firm''s paperwork contact (%)', sc.paperwork_contact_person_id;
  END IF;
  IF sc.site_contact_person_id IS NOT NULL THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL (r7 B-1): the fold wrote a self-designation (%)', sc.site_contact_person_id;
  END IF;

  -- ── M-2 · one ordinary card save after the fold re-derives nothing ──────
  -- The crew member came out of the fold with the legacy pointer naming the
  -- folded card and their affiliation CLOSED (r6 M-3). The shipped editor
  -- names company_id in the SET list on EVERY save, and `UPDATE OF col` fires
  -- whether or not the value changed.
  SELECT count(*) INTO n FROM public.studio_person_affiliations
   WHERE person_id = 'f9f00000-0000-4000-8000-000000000008' AND to_date IS NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL (r6 M-3): the fold left % open affiliation(s) on the crew', n;
  END IF;
  UPDATE public.studio_contacts
     SET full_name = 'R7 Crew', company_id = company_id
   WHERE id = 'f9f00000-0000-4000-8000-000000000008';
  SELECT count(*) INTO n FROM public.studio_person_affiliations
   WHERE person_id = 'f9f00000-0000-4000-8000-000000000008' AND to_date IS NULL;
  IF n <> 0 THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL (r7 M-2): an ordinary card save re-derived % affiliation(s) the fold closed', n;
  END IF;
  SELECT count(*) INTO n FROM public.studio_person_affiliations
   WHERE person_id = 'f9f00000-0000-4000-8000-000000000008'
     AND role_at_firm = 'Bookkeeper' AND from_date = DATE '2021-01-01';
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL (r7 M-2): the typed role and start date did not survive the re-save';
  END IF;
  SELECT * INTO sc FROM public.studio_contacts
   WHERE id = 'f9f00000-0000-4000-8000-000000000008';
  IF sc.company_id IS DISTINCT FROM 'f9f00000-0000-4000-8000-000000000007'::uuid THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL (r7 M-2): the legacy firm pointer moved (%)', sc.company_id;
  END IF;

  -- Negative control: the stand-down is scoped to a MERGED card. A pointer at
  -- a live firm with no open affiliation still derives one, which is R-AI.
  UPDATE public.studio_contacts
     SET company_id = 'f9f00000-0000-4000-8000-000000000001'
   WHERE id = 'f9f00000-0000-4000-8000-000000000008';
  SELECT count(*) INTO n FROM public.studio_person_affiliations
   WHERE person_id = 'f9f00000-0000-4000-8000-000000000008'
     AND company_id = 'f9f00000-0000-4000-8000-000000000001'
     AND to_date IS NULL;
  IF n <> 1 THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL (r7 M-2): a pointer at a LIVE firm stopped deriving its affiliation';
  END IF;

  -- ── M-1 · an ordinary edit to a renewal, then an ordinary merge ─────────
  -- Shrinking the renewal's gates is a permitted member write: the row's own
  -- superseded_by is null, so no successor leg is asked about it at all.
  UPDATE public.studio_compliance_documents
     SET blocks = ARRAY['site_access']::text[]
   WHERE id = 'f9f40000-0000-4000-8000-000000000002';
  PERFORM public.merge_studio_contacts(
    'f9f00000-0000-4000-8000-000000000011','f9f00000-0000-4000-8000-000000000012','company_name');
  SELECT count(*) INTO n FROM public.studio_compliance_documents
   WHERE id IN ('f9f40000-0000-4000-8000-000000000001','f9f40000-0000-4000-8000-000000000002')
     AND holder_id = 'f9f00000-0000-4000-8000-000000000011';
  IF n <> 2 THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL (r7 M-1): % of the 2 chain rows moved after a gate edit', n;
  END IF;

  -- and the same, reached by correcting the renewal's DATE earlier
  UPDATE public.studio_compliance_documents
     SET expires_on = CURRENT_DATE + 50
   WHERE id = 'f9f40000-0000-4000-8000-000000000004';
  PERFORM public.merge_studio_contacts(
    'f9f00000-0000-4000-8000-000000000013','f9f00000-0000-4000-8000-000000000014','company_name');
  SELECT count(*) INTO n FROM public.studio_compliance_documents
   WHERE id IN ('f9f40000-0000-4000-8000-000000000003','f9f40000-0000-4000-8000-000000000004')
     AND holder_id = 'f9f00000-0000-4000-8000-000000000013';
  IF n <> 2 THEN
    RAISE EXCEPTION 'BLOCK 11 FAIL (r7 M-1): % of the 2 chain rows moved after a date edit', n;
  END IF;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '11. the r7 review''s three migration findings (B-1, M-1, M-2): passed';
END $$;

-- ── M-1 negative control · the laundering doors are still shut ────────────
-- The four legs are gated on v_retiring, not removed. WRITING a supersede edge
-- that drops a gate, pulls the cover earlier, changes the paper's type or
-- retires a dated row with an undated one is still refused by name — r1
-- MAJOR-4 / r2 MAJOR-1 / r3 MAJOR-1 stay closed.
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, blocks, issued_on, expires_on) VALUES
  ('f9f40000-0000-4000-8000-000000000011','f9000000-0000-4000-8000-00000000000a','company',
   'f9f00000-0000-4000-8000-000000000011','coi_gl', ARRAY['site_access','draw']::text[],
   CURRENT_DATE - 900, CURRENT_DATE - 500),
  ('f9f40000-0000-4000-8000-000000000012','f9000000-0000-4000-8000-00000000000a','company',
   'f9f00000-0000-4000-8000-000000000011','coi_gl', ARRAY['site_access','draw']::text[],
   CURRENT_DATE - 900, CURRENT_DATE - 600),
  ('f9f40000-0000-4000-8000-000000000013','f9000000-0000-4000-8000-00000000000a','company',
   'f9f00000-0000-4000-8000-000000000011','w9',     ARRAY[]::text[],
   CURRENT_DATE - 900, NULL);

DO $$
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

  BEGIN
    -- the renewal on the survivor now gates {site_access} only
    UPDATE public.studio_compliance_documents
       SET superseded_by = 'f9f40000-0000-4000-8000-000000000002'
     WHERE id = 'f9f40000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'BLOCK 11 FAIL (r7 M-1): a gate-dropping supersede was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%compliance_successor_drops_a_gate%' THEN
      RAISE EXCEPTION 'BLOCK 11 FAIL (r7 M-1): expected compliance_successor_drops_a_gate, got %', SQLERRM;
    END IF;
  END;

  BEGIN
    -- a successor whose own cover ends BEFORE the row it would retire
    UPDATE public.studio_compliance_documents
       SET superseded_by = 'f9f40000-0000-4000-8000-000000000012'
     WHERE id = 'f9f40000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'BLOCK 11 FAIL (r7 M-1): an earlier-ending supersede was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%compliance_successor_not_later%' THEN
      RAISE EXCEPTION 'BLOCK 11 FAIL (r7 M-1): expected compliance_successor_not_later, got %', SQLERRM;
    END IF;
  END;

  BEGIN
    -- a W-9 does not renew a certificate
    UPDATE public.studio_compliance_documents
       SET superseded_by = 'f9f40000-0000-4000-8000-000000000013'
     WHERE id = 'f9f40000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'BLOCK 11 FAIL (r7 M-1): a wrong-type supersede was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%compliance_successor_wrong_type%'
       AND SQLERRM NOT LIKE '%compliance_successor_undated%' THEN
      RAISE EXCEPTION 'BLOCK 11 FAIL (r7 M-1): expected a wrong-type/undated refusal, got %', SQLERRM;
    END IF;
  END;

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '11b. r7 M-1 negative control — the four legs still judge the ACT: passed';
END $$;

DO $$ BEGIN RAISE NOTICE 'W3 SQL suite: all blocks passed'; END $$;

ROLLBACK;
