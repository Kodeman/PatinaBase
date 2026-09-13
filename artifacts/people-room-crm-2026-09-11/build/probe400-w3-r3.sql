-- W3 round-3 adversarial probe. One transaction, ROLLBACKed. Local only.
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
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true); END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ── fixture: one studio, an owner and a plain member, plus a SECOND studio the
--    same designer of record also belongs to (the r5 MAJOR-3 shape) ──────────
INSERT INTO public.organizations (id, type, name, slug, status) VALUES
  ('fa000000-0000-4000-8000-00000000000a','design_studio','P400 Studio A','p400-a','active'),
  ('fa000000-0000-4000-8000-00000000000b','design_studio','P400 Studio B','p400-b','active');

INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at) VALUES
  ('a0000000-0000-0000-0000-000000000004','fa000000-0000-4000-8000-00000000000a','owner','active',now()),
  ('a0000000-0000-0000-0000-000000000003','fa000000-0000-4000-8000-00000000000a','member','active',now()),
  -- the designer of record ALSO works for studio B …
  ('a0000000-0000-0000-0000-000000000004','fa000000-0000-4000-8000-00000000000b','member','active',now()),
  -- … and a0…0007 is a plain member of B ONLY. is_studio_comember(designer)
  -- is therefore TRUE for them, while they belong to no part of studio A.
  ('a0000000-0000-0000-0000-000000000007','fa000000-0000-4000-8000-00000000000b','member','active',now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role = EXCLUDED.role, status='active';

-- ── firm cards for the merge probes ───────────────────────────────────────
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, company_name, created_by, created_at) VALUES
  ('fa100000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-00000000000a','company','sub','Northgate Electric','a0000000-0000-0000-0000-000000000004','2025-01-01'),
  ('fa100000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-00000000000a','company','sub','Northgate Electric LLC','a0000000-0000-0000-0000-000000000004','2026-01-01'),
  ('fa100000-0000-4000-8000-000000000003','fa000000-0000-4000-8000-00000000000a','company','sub','Ostrom Builders','a0000000-0000-0000-0000-000000000004','2025-01-01'),
  ('fa100000-0000-4000-8000-000000000004','fa000000-0000-4000-8000-00000000000a','company','sub','Ostrom Builders Inc','a0000000-0000-0000-0000-000000000004','2026-01-01');

-- ── A1: survivor holds NO paper; the absorbed duplicate holds the firm's one
--        CURRENT, gating certificate. ────────────────────────────────────────
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks, created_by)
VALUES
  ('fa200000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-00000000000a','company',
   'fa100000-0000-4000-8000-000000000002','coi_gl', CURRENT_DATE + 300,
   ARRAY['site_access','payment','draw']::text[], 'a0000000-0000-0000-0000-000000000004');

-- ── A2: survivor holds a LAPSED certificate; the absorbed duplicate holds the
--        CURRENT renewal. ────────────────────────────────────────────────────
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, expires_on, blocks, created_by)
VALUES
  ('fa200000-0000-4000-8000-000000000002','fa000000-0000-4000-8000-00000000000a','company',
   'fa100000-0000-4000-8000-000000000003','coi_gl', CURRENT_DATE - 90,
   ARRAY['site_access','payment','draw']::text[], 'a0000000-0000-0000-0000-000000000004'),
  ('fa200000-0000-4000-8000-000000000003','fa000000-0000-4000-8000-00000000000a','company',
   'fa100000-0000-4000-8000-000000000004','coi_gl', CURRENT_DATE + 300,
   ARRAY['site_access','payment','draw']::text[], 'a0000000-0000-0000-0000-000000000004');

DO $$
DECLARE w_before text; w_after text; v_held uuid; n int;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

  -- A1 --------------------------------------------------------------------
  w_before := public.identity_paper_state('fa100000-0000-4000-8000-000000000001', NULL);
  RAISE NOTICE 'A1 survivor paper BEFORE merge (holds nothing): %', w_before;
  RAISE NOTICE 'A1 absorbed duplicate paper BEFORE merge (current COI): %',
    public.identity_paper_state('fa100000-0000-4000-8000-000000000002', NULL);

  PERFORM public.merge_studio_contacts(
    'fa100000-0000-4000-8000-000000000001','fa100000-0000-4000-8000-000000000002','company_name');

  w_after := public.identity_paper_state('fa100000-0000-4000-8000-000000000001', NULL);
  SELECT holder_id INTO v_held FROM public.studio_compliance_documents
   WHERE id = 'fa200000-0000-4000-8000-000000000001';
  RAISE NOTICE 'A1 survivor paper AFTER merge: %   (certificate still held by %)', w_after, v_held;

  SELECT count(*) INTO n FROM public.people_directory
   WHERE person_id = 'fa100000-0000-4000-8000-000000000002';
  RAISE NOTICE 'A1 Directory rows for the absorbed card after the merge (want 0): %', n;

  -- A2 --------------------------------------------------------------------
  RAISE NOTICE 'A2 survivor paper BEFORE merge (lapsed COI): %',
    public.identity_paper_state('fa100000-0000-4000-8000-000000000003', NULL);
  RAISE NOTICE 'A2 absorbed duplicate BEFORE merge (current COI): %',
    public.identity_paper_state('fa100000-0000-4000-8000-000000000004', NULL);

  PERFORM public.merge_studio_contacts(
    'fa100000-0000-4000-8000-000000000003','fa100000-0000-4000-8000-000000000004','company_name');

  RAISE NOTICE 'A2 survivor paper AFTER merge: %',
    public.identity_paper_state('fa100000-0000-4000-8000-000000000003', NULL);
  SELECT holder_id INTO v_held FROM public.studio_compliance_documents
   WHERE id = 'fa200000-0000-4000-8000-000000000003';
  RAISE NOTICE 'A2 the current renewal is still held by % (survivor is fa1…0003)', v_held;

  PERFORM pg_temp.reset_role();
END $$;

-- ── B: does the nightly sweep still announce the absorbed card's lapse? ────
DO $$
DECLARE n int;
BEGIN
  PERFORM public.sweep_compliance_expiries();
  SELECT count(*) INTO n FROM public.studio_compliance_notices
   WHERE document_id IN ('fa200000-0000-4000-8000-000000000001',
                         'fa200000-0000-4000-8000-000000000002',
                         'fa200000-0000-4000-8000-000000000003');
  RAISE NOTICE 'B notices over the three probe documents: %', n;
  SELECT count(*) INTO n FROM public.studio_compliance_notices
   WHERE document_id = 'fa200000-0000-4000-8000-000000000002';
  RAISE NOTICE 'B the SURVIVOR''s own lapsed COI (fa2…0002) earned % notice(s)', n;
END $$;

-- ── C: households — can a member of the designer's SECOND studio read the
--       money figure? ────────────────────────────────────────────────────────
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, created_by) VALUES
  ('fa100000-0000-4000-8000-00000000000a','fa000000-0000-4000-8000-00000000000a','person','client','Chidi Probe','a0000000-0000-0000-0000-000000000004');

INSERT INTO public.client_households
  (id, organization_id, designer_id, display_name, member_person_ids,
   primary_member_person_id, co_threshold_cents, created_by)
VALUES
  ('fa300000-0000-4000-8000-000000000001','fa000000-0000-4000-8000-00000000000a',
   'a0000000-0000-0000-0000-000000000004','The Okonkwos',
   ARRAY['fa100000-0000-4000-8000-00000000000a']::uuid[],
   'fa100000-0000-4000-8000-00000000000a', 250000,
   'a0000000-0000-0000-0000-000000000004');

DO $$
DECLARE n int; v int;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000007');
  SELECT count(*), max(co_threshold_cents) INTO n, v FROM public.client_households
   WHERE id = 'fa300000-0000-4000-8000-000000000001';
  RAISE NOTICE 'C a member of studio B only reads % household row(s), figure %', n, v;
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  SELECT count(*) INTO n FROM public.client_households
   WHERE id = 'fa300000-0000-4000-8000-000000000001';
  RAISE NOTICE 'C a plain member of studio A reads % household row(s)', n;
  PERFORM pg_temp.reset_role();
END $$;

-- ── D: the append-only lineage — can a plain member forge a merge record? ──
DO $$
DECLARE n int;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  BEGIN
    INSERT INTO public.studio_contact_merges
      (organization_id, survivor_id, merged_id, matched_on)
    VALUES ('fa000000-0000-4000-8000-00000000000a',
            'fa100000-0000-4000-8000-000000000001',
            'fa100000-0000-4000-8000-000000000003', 'phone');
    RAISE NOTICE 'D a plain member INSERTed a lineage row for a merge that never happened';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'D forged lineage row REFUSED -> %', SQLERRM;
  END;
  SELECT count(*) INTO n FROM public.studio_contact_merges
   WHERE merged_id = 'fa100000-0000-4000-8000-000000000003';
  RAISE NOTICE 'D lineage rows naming a LIVE card as merged away: % (its merged_into is %)',
    n, (SELECT merged_into FROM public.studio_contacts WHERE id='fa100000-0000-4000-8000-000000000003');
  PERFORM pg_temp.reset_role();
END $$;

-- ── E: resolve_merged_contact across tenants ──────────────────────────────
DO $$
DECLARE v uuid;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000007');
  v := public.resolve_merged_contact('fa100000-0000-4000-8000-000000000002');
  RAISE NOTICE 'E a non-member of studio A resolves the merged id to % (want NULL)', v;
  PERFORM pg_temp.reset_role();
END $$;

-- ── F: the merged card's company card is still reachable by id ────────────
DO $$
DECLARE n int;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  SELECT count(*) INTO n FROM public.studio_contacts
   WHERE id = 'fa100000-0000-4000-8000-000000000002';
  RAISE NOTICE 'F the absorbed card is still SELECTable by a member: % row(s)', n;
  SELECT count(*) INTO n FROM public.studio_compliance_documents
   WHERE holder_id = 'fa100000-0000-4000-8000-000000000002';
  RAISE NOTICE 'F it still holds % document(s), unreachable from the Directory', n;
  PERFORM pg_temp.reset_role();
END $$;

ROLLBACK;
