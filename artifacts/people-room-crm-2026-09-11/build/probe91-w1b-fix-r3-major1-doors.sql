-- probe91 — w1b final review r3, migrations MAJOR-1: the two new supersede
-- doors, walked exactly as the review walked them (probe88 V1/V2/V3), as a
-- PLAIN studio member. Objects and access only; the ledger is never probed.
-- Everything inside BEGIN … ROLLBACK.
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub',p_user_id::text,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims',NULL,true); END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

\echo '=== before: the seeded fixture reads its own words ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');  -- studio_manager, a plain member
SELECT display_name, paper_state FROM public.people_directory
 WHERE display_name IN ('Dana Kowalski','Northgate Electric') ORDER BY display_name;

\echo '=== V1: the walked act — a coi_gl dated 5 days ago, blocks NEVER typed ==='
DO $$
DECLARE v_new uuid; raised text;
BEGIN
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, issuer, expires_on)
  VALUES ('b0000000-0000-0000-0000-000000000001','company',
          'd0e20000-0000-0000-0000-000000000003','coi_gl','Acme Mutual', CURRENT_DATE - 5)
  RETURNING id INTO v_new;
  RAISE NOTICE 'V1 leg 1 (the INSERT) landed: %', v_new;
  BEGIN
    UPDATE public.studio_compliance_documents SET superseded_by = v_new
     WHERE holder_id = 'd0e20000-0000-0000-0000-000000000003'
       AND doc_type = 'coi_gl' AND expires_on = '2026-03-31';
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  RAISE NOTICE 'V1 leg 2 (point the lapse at it): %', COALESCE(raised,'ACCEPTED — the door is OPEN');
END $$;

SELECT display_name, paper_state FROM public.people_directory
 WHERE display_name IN ('Dana Kowalski','Northgate Electric') ORDER BY display_name;
SELECT display_name, project_name, paper_state FROM public.people_directory_seats
 WHERE display_name = 'Dana Kowalski' ORDER BY project_name;

\echo '=== V2: the same act, but the certificate CARRIES the gates (still expired) ==='
DO $$
DECLARE v_new uuid; raised text;
BEGIN
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, issuer, expires_on, blocks)
  VALUES ('b0000000-0000-0000-0000-000000000001','company',
          'd0e20000-0000-0000-0000-000000000003','coi_gl','Acme Mutual', CURRENT_DATE - 5,
          '{site_access,draw}')
  RETURNING id INTO v_new;
  BEGIN
    UPDATE public.studio_compliance_documents SET superseded_by = v_new
     WHERE holder_id = 'd0e20000-0000-0000-0000-000000000003'
       AND doc_type = 'coi_gl' AND expires_on = '2026-03-31';
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  RAISE NOTICE 'V2 (gates carried, itself expired): %', COALESCE(raised,'ACCEPTED');
END $$;

\echo '=== V3: an HONEST future-dated renewal, gates left at the empty default ==='
DO $$
DECLARE v_new uuid; raised text;
BEGIN
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, issuer, expires_on)
  VALUES ('b0000000-0000-0000-0000-000000000001','company',
          'd0e20000-0000-0000-0000-000000000003','coi_gl','Acme Mutual', CURRENT_DATE + 365)
  RETURNING id INTO v_new;
  BEGIN
    UPDATE public.studio_compliance_documents SET superseded_by = v_new
     WHERE holder_id = 'd0e20000-0000-0000-0000-000000000003'
       AND doc_type = 'coi_gl' AND expires_on = '2026-03-31';
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  RAISE NOTICE 'V3 (future date, no gates typed): %', COALESCE(raised,'ACCEPTED');
  -- and the positive control: the same renewal WITH its gates
  UPDATE public.studio_compliance_documents SET blocks = '{site_access,draw}' WHERE id = v_new;
  BEGIN
    UPDATE public.studio_compliance_documents SET superseded_by = v_new
     WHERE holder_id = 'd0e20000-0000-0000-0000-000000000003'
       AND doc_type = 'coi_gl' AND expires_on = '2026-03-31';
    raised := NULL;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  RAISE NOTICE 'V3 positive control (gates typed): %', COALESCE(raised,'ACCEPTED — the renewal lands');
END $$;

SELECT display_name, paper_state FROM public.people_directory
 WHERE display_name IN ('Dana Kowalski','Northgate Electric') ORDER BY display_name;
SELECT display_name, project_name, paper_state FROM public.people_directory_seats
 WHERE display_name = 'Dana Kowalski' ORDER BY project_name;

\echo '=== why the word is STILL lapsed after V3 landed: V2 left a GATING expired row on file ==='
SELECT issuer, expires_on, blocks, (superseded_by IS NOT NULL) AS retired
  FROM public.studio_compliance_documents
 WHERE holder_id = 'd0e20000-0000-0000-0000-000000000003' AND doc_type = 'coi_gl'
 ORDER BY expires_on;

SELECT pg_temp.reset_role();
ROLLBACK;
