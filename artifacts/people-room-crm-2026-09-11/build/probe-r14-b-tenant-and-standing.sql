-- r14 probe B: cross-tenant reads of the three new tables, the standings the
-- wave narrows, and add_household_member against another studio's job.
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- Studio A (owner 0004, plain member 0003) and Studio B (owner 0006).
-- 0004 is a member of BOTH, which is w1b r5 MAJOR-3's shape.
INSERT INTO public.organizations (id, type, name, slug, status) VALUES
  ('fb140000-0000-4000-8000-00000000000a','design_studio','R14 Studio A','r14b-a','active'),
  ('fb140000-0000-4000-8000-00000000000b','design_studio','R14 Studio B','r14b-b','active');
INSERT INTO public.organization_members (user_id, organization_id, role, status, joined_at) VALUES
  ('a0000000-0000-0000-0000-000000000004','fb140000-0000-4000-8000-00000000000a','owner','active',now()),
  ('a0000000-0000-0000-0000-000000000003','fb140000-0000-4000-8000-00000000000a','member','active',now()),
  ('a0000000-0000-0000-0000-000000000006','fb140000-0000-4000-8000-00000000000b','owner','active',now()),
  ('a0000000-0000-0000-0000-000000000004','fb140000-0000-4000-8000-00000000000b','member','active',now())
ON CONFLICT (user_id, organization_id) DO UPDATE SET role=EXCLUDED.role, status='active';

INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, created_by, created_at) VALUES
  ('fb140000-0000-4000-8000-000000000001','fb140000-0000-4000-8000-00000000000a','person','client','R14 Chidi','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('fb140000-0000-4000-8000-000000000002','fb140000-0000-4000-8000-00000000000a','person','sub','R14 Dupe A','a0000000-0000-0000-0000-000000000004','2024-01-01'),
  ('fb140000-0000-4000-8000-000000000003','fb140000-0000-4000-8000-00000000000a','person','sub','R14 Dupe B','a0000000-0000-0000-0000-000000000004','2026-01-01');

-- a household in studio A, designer of record 0004 (who also belongs to B)
INSERT INTO public.client_households
  (id, organization_id, designer_id, display_name, member_person_ids,
   primary_member_person_id, co_threshold_cents, created_by)
VALUES ('fb140000-0000-4000-8000-0000000000c1','fb140000-0000-4000-8000-00000000000a',
        'a0000000-0000-0000-0000-000000000004','R14 Okonkwo',
        ARRAY['fb140000-0000-4000-8000-000000000001']::uuid[],
        'fb140000-0000-4000-8000-000000000001', 250000,
        'a0000000-0000-0000-0000-000000000004');

-- studio B's own job, recorded to B
INSERT INTO public.projects (id, name, designer_id, studio_id, status, created_by, client_id)
VALUES ('fb140000-0000-4000-8000-0000000000f1','R14 B job',
        'a0000000-0000-0000-0000-000000000006','fb140000-0000-4000-8000-00000000000b','active',
        'a0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000006');

-- a lineage row + a notice row in studio A, written as the service side does
INSERT INTO public.studio_contact_merges (organization_id, survivor_id, merged_id, matched_on)
VALUES ('fb140000-0000-4000-8000-00000000000a','fb140000-0000-4000-8000-000000000002',
        'fb140000-0000-4000-8000-000000000003','manual');
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_id, holder_type, doc_type, blocks, expires_on)
VALUES ('fb140000-0000-4000-8000-0000000000d1','fb140000-0000-4000-8000-00000000000a',
        'fb140000-0000-4000-8000-000000000002','person','license',
        ARRAY['site_access'], CURRENT_DATE - 1);
INSERT INTO public.studio_compliance_notices (organization_id, document_id, state, expires_on)
VALUES ('fb140000-0000-4000-8000-00000000000a','fb140000-0000-4000-8000-0000000000d1','lapsed', CURRENT_DATE - 1);

DO $$
DECLARE n integer; v uuid;
BEGIN
  -- ── B1. studio B's OWNER (no membership in A) reads nothing of A's ──────
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000006');
  SELECT count(*) INTO n FROM public.client_households
   WHERE organization_id='fb140000-0000-4000-8000-00000000000a';
  RAISE NOTICE 'B1-a households of A visible to B''s owner: %', n;
  SELECT count(*) INTO n FROM public.studio_contact_merges
   WHERE organization_id='fb140000-0000-4000-8000-00000000000a';
  RAISE NOTICE 'B1-b merge lineage of A visible to B''s owner: %', n;
  SELECT count(*) INTO n FROM public.studio_compliance_notices
   WHERE organization_id='fb140000-0000-4000-8000-00000000000a';
  RAISE NOTICE 'B1-c notices of A visible to B''s owner: %', n;
  SELECT count(*) INTO n FROM public.studio_contacts
   WHERE organization_id='fb140000-0000-4000-8000-00000000000a';
  RAISE NOTICE 'B1-d A''s cards visible to B''s owner: %', n;

  -- ── B2. a plain member of A: may read, may not forge, may not erase ─────
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  SELECT count(*) INTO n FROM public.client_households
   WHERE organization_id='fb140000-0000-4000-8000-00000000000a';
  RAISE NOTICE 'B2-a households of A visible to A''s plain member: % (expect 1)', n;
  BEGIN
    INSERT INTO public.studio_contact_merges (organization_id, survivor_id, merged_id, matched_on)
    VALUES ('fb140000-0000-4000-8000-00000000000a','fb140000-0000-4000-8000-000000000002',
            'fb140000-0000-4000-8000-000000000001','manual');
    RAISE NOTICE 'B2-b FORGED LINEAGE ACCEPTED';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'B2-b forged lineage refused -> %', SQLERRM;
  END;
  BEGIN
    DELETE FROM public.studio_compliance_notices
     WHERE document_id='fb140000-0000-4000-8000-0000000000d1';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'B2-c notice rows deleted by a plain member: %', n;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'B2-c notice delete refused -> %', SQLERRM;
  END;
  BEGIN
    UPDATE public.client_households SET co_threshold_cents = NULL
     WHERE id='fb140000-0000-4000-8000-0000000000c1';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'B2-d plain member ERASED the figure on % row(s)', n;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'B2-d erase refused -> %', SQLERRM;
  END;
  BEGIN
    UPDATE public.client_households SET co_threshold_cents = 999900
     WHERE id='fb140000-0000-4000-8000-0000000000c1';
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'B2-e plain member RAISED the figure on % row(s)', n;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'B2-e raise refused -> %', SQLERRM;
  END;
  BEGIN
    PERFORM public.set_household_threshold('fb140000-0000-4000-8000-0000000000c1', 999900);
    RAISE NOTICE 'B2-f plain member moved the figure through the RPC';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'B2-f RPC refused -> %', SQLERRM;
  END;

  -- ── B3. 0004 belongs to BOTH studios: may they seat A's household member
  --        on studio B's job? ─────────────────────────────────────────────
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  BEGIN
    v := public.add_household_member('fb140000-0000-4000-8000-0000000000c1',
                                     'fb140000-0000-4000-8000-000000000001',
                                     'client_rep',
                                     'fb140000-0000-4000-8000-0000000000f1');
    RAISE NOTICE 'B3 CROSS-STUDIO SEAT WRITTEN -> %', v;
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'B3 cross-studio seat refused -> %', SQLERRM;
  END;

  PERFORM pg_temp.reset_role();
END $$;
ROLLBACK;
