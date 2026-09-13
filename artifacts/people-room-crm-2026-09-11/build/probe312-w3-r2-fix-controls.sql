-- W3 round-2 fixes: B2-1, B2-2, B2-3, B2-4 — positive and negative controls.
-- One transaction, ROLLBACK. Local only.
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID) RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub',p_user_id::text,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END; $$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true); END; $$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID), pg_temp.reset_role() TO PUBLIC;

-- ── fixture: two firm cards + a person card, in the seeded studio ─────────
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, company_name, company_kind, created_by) VALUES
  ('fb200000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001','company','sub','Survivor Firm QA','sub','a0000000-0000-0000-0000-000000000004'),
  ('fb200000-0000-4000-8000-000000000002','b0000000-0000-0000-0000-000000000001','company','sub','Absorbed Firm QA','sub','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, full_name, created_by) VALUES
  ('fb100000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001','person','sub','Person QA','a0000000-0000-0000-0000-000000000004');

\echo ''
\echo '=== B2-1 · a plain member may not write merged_into (a0…0003 is a member) ==='
DO $$
DECLARE v_sql text; v_err text; v_ptr uuid;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000003');
  BEGIN
    UPDATE public.studio_contacts SET merged_into='fb200000-0000-4000-8000-000000000001'
     WHERE id='fb200000-0000-4000-8000-000000000002';
    RAISE NOTICE 'B2-1 member write: ALLOWED  <-- FAIL';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RAISE NOTICE 'B2-1 member write: REFUSED -> %', v_err;
  END;
  PERFORM pg_temp.reset_role();
  SELECT merged_into INTO v_ptr FROM public.studio_contacts WHERE id='fb200000-0000-4000-8000-000000000002';
  RAISE NOTICE 'B2-1 pointer after the refused write: %', COALESCE(v_ptr::text,'NULL');
END $$;

\echo ''
\echo '=== B2-1 · an OWNER may not either (00417 admin leg carries no column predicate) ==='
DO $$
DECLARE v_err text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  BEGIN
    UPDATE public.studio_contacts SET merged_into='fb200000-0000-4000-8000-000000000001'
     WHERE id='fb200000-0000-4000-8000-000000000002';
    RAISE NOTICE 'B2-1 owner write: ALLOWED  <-- FAIL';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RAISE NOTICE 'B2-1 owner write: REFUSED -> %', v_err;
  END;
  PERFORM pg_temp.reset_role();
END $$;

-- a firm card in ANOTHER studio, for the cross-tenant pointer control
INSERT INTO public.organizations (id, type, name, slug, status) VALUES
  ('fb000000-0000-4000-8000-00000000000f','design_studio','Other Studio QA','other-studio-qa','active')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.studio_contacts
  (id, organization_id, entity_kind, contact_kind, company_name, company_kind, created_by) VALUES
  ('fb200000-0000-4000-8000-00000000000f','fb000000-0000-4000-8000-00000000000f','company','sub','Foreign Firm QA','sub','a0000000-0000-0000-0000-000000000004');

\echo ''
\echo '=== B2-1 · service_role / postgres cannot hand-fold either, and cross-kind + cross-studio are refused under the door ==='
DO $$
DECLARE v_err text;
BEGIN
  BEGIN
    UPDATE public.studio_contacts SET merged_into='fb200000-0000-4000-8000-000000000001'
     WHERE id='fb100000-0000-4000-8000-000000000001';
    RAISE NOTICE 'postgres hand-fold: ALLOWED  <-- FAIL';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RAISE NOTICE 'postgres hand-fold: REFUSED -> %', v_err;
  END;

  -- under the door, a PERSON into a FIRM is still refused
  PERFORM set_config('app.contact_merge_in_progress','on',true);
  BEGIN
    UPDATE public.studio_contacts SET merged_into='fb200000-0000-4000-8000-000000000001'
     WHERE id='fb100000-0000-4000-8000-000000000001';
    RAISE NOTICE 'under the door, person->firm: ALLOWED  <-- FAIL';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RAISE NOTICE 'under the door, person->firm: REFUSED -> %', v_err;
  END;
  -- and a card in another studio
  BEGIN
    UPDATE public.studio_contacts SET merged_into='fb200000-0000-4000-8000-00000000000f'
     WHERE id='fb200000-0000-4000-8000-000000000002';
    RAISE NOTICE 'under the door, cross-studio: ALLOWED  <-- FAIL';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RAISE NOTICE 'under the door, cross-studio: REFUSED -> %', v_err;
  END;
  PERFORM set_config('app.contact_merge_in_progress','off',true);
END $$;

\echo ''
\echo '=== B2-2 · a merge over a RENEWAL CHAIN, in-force head and lapsed head ==='
-- survivor holds a current coi_gl; absorbed holds P -> H
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, blocks, issued_on, expires_on) VALUES
  ('fb400000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001','company',
   'fb200000-0000-4000-8000-000000000001','coi_gl',ARRAY['site_access']::text[],CURRENT_DATE-60,CURRENT_DATE+300),
  ('fb400000-0000-4000-8000-000000000002','b0000000-0000-0000-0000-000000000001','company',
   'fb200000-0000-4000-8000-000000000002','coi_gl',ARRAY['site_access']::text[],CURRENT_DATE-800,CURRENT_DATE-400),
  -- H is written IN FORCE, so the edge below is a legitimate retirement, and
  -- then AGED past today — the ordinary way a chain's head comes to be lapsed.
  ('fb400000-0000-4000-8000-000000000003','b0000000-0000-0000-0000-000000000001','company',
   'fb200000-0000-4000-8000-000000000002','coi_gl',ARRAY['site_access']::text[],CURRENT_DATE-400,CURRENT_DATE+100),
  -- and a lapsed bond the survivor holds nothing to retire (B2-4's subject)
  ('fb400000-0000-4000-8000-000000000004','b0000000-0000-0000-0000-000000000001','company',
   'fb200000-0000-4000-8000-000000000002','bond',ARRAY['payment']::text[],CURRENT_DATE-400,CURRENT_DATE-10);
UPDATE public.studio_compliance_documents SET superseded_by='fb400000-0000-4000-8000-000000000003'
 WHERE id='fb400000-0000-4000-8000-000000000002';
UPDATE public.studio_compliance_documents SET expires_on = CURRENT_DATE - 30
 WHERE id='fb400000-0000-4000-8000-000000000003';

DO $$
DECLARE w_before text; w_after text; v_err text; n int;
BEGIN
  w_before := public.compliance_state('fb200000-0000-4000-8000-000000000001');
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  BEGIN
    PERFORM public.merge_studio_contacts(
      'fb200000-0000-4000-8000-000000000001','fb200000-0000-4000-8000-000000000002','company_name');
    RAISE NOTICE 'B2-2 merge over a LAPSED head with a retired predecessor: SUCCEEDED';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RAISE NOTICE 'B2-2 merge: FAILED -> %  <-- FAIL', v_err;
  END;
  PERFORM pg_temp.reset_role();
  w_after := public.compliance_state('fb200000-0000-4000-8000-000000000001');
  RAISE NOTICE 'B2-2 survivor paper word: % -> %', w_before, w_after;

  SELECT count(*) INTO n FROM public.studio_compliance_documents
   WHERE id IN ('fb400000-0000-4000-8000-000000000002','fb400000-0000-4000-8000-000000000003')
     AND holder_id='fb200000-0000-4000-8000-000000000001';
  RAISE NOTICE 'B2-2 lineage rows now on the survivor (want 2): %', n;
  SELECT count(*) INTO n FROM public.studio_compliance_documents
   WHERE id='fb400000-0000-4000-8000-000000000003' AND superseded_by='fb400000-0000-4000-8000-000000000001';
  RAISE NOTICE 'B2-2 head now superseded by the survivor''s certificate (want 1): %', n;
  SELECT count(*) INTO n FROM public.studio_compliance_documents
   WHERE id='fb400000-0000-4000-8000-000000000004' AND holder_id='fb200000-0000-4000-8000-000000000002'
     AND superseded_by IS NULL;
  RAISE NOTICE 'B2-2 the bond with no successor stayed on the absorbed card (want 1): %', n;
END $$;

\echo ''
\echo '=== B2-2 negative control · a member may still not LAUNDER a lapse (superseded_by written by hand) ==='
DO $$
DECLARE v_err text; v_lapsed uuid; v_target uuid;
BEGIN
  -- point the absorbed bond at the survivor's certificate: wrong doc_type
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  BEGIN
    UPDATE public.studio_compliance_documents
       SET superseded_by='fb400000-0000-4000-8000-000000000001'
     WHERE id='fb400000-0000-4000-8000-000000000004';
    RAISE NOTICE 'hand supersede across doc_types: ALLOWED  <-- FAIL';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RAISE NOTICE 'hand supersede across doc_types: REFUSED -> %', v_err;
  END;
  PERFORM pg_temp.reset_role();
END $$;

-- The head-of-chain and in-force legs, on their own. Both rows sit on the
-- SURVIVOR now, same doc_type, same gates, and the target's date is not
-- earlier — so only the leg under test can refuse.
INSERT INTO public.studio_compliance_documents
  (id, organization_id, holder_type, holder_id, doc_type, blocks, issued_on, expires_on) VALUES
  ('fb400000-0000-4000-8000-000000000005','b0000000-0000-0000-0000-000000000001','company',
   'fb200000-0000-4000-8000-000000000001','coi_gl',ARRAY['site_access']::text[],CURRENT_DATE-900,CURRENT_DATE-500);
DO $$
DECLARE v_err text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  -- (a) onto an ALREADY-RETIRED row (fb…003 carries superseded_by after the merge)
  BEGIN
    UPDATE public.studio_compliance_documents
       SET superseded_by='fb400000-0000-4000-8000-000000000003'
     WHERE id='fb400000-0000-4000-8000-000000000005';
    RAISE NOTICE 'hand supersede onto a retired row: ALLOWED  <-- FAIL';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RAISE NOTICE 'hand supersede onto a retired row: REFUSED -> %', v_err;
  END;
  -- (b) onto a LAPSED row (fb…003 expired 30 days ago; clear its own edge first
  --     as service_role would not be able to either — done as postgres below)
  PERFORM pg_temp.reset_role();
END $$;

DO $$
DECLARE v_err text;
BEGIN
  PERFORM set_config('app.contact_merge_in_progress','off',true);
  UPDATE public.studio_compliance_documents SET superseded_by = NULL
   WHERE id='fb400000-0000-4000-8000-000000000003';
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
  BEGIN
    UPDATE public.studio_compliance_documents
       SET superseded_by='fb400000-0000-4000-8000-000000000003'
     WHERE id='fb400000-0000-4000-8000-000000000005';
    RAISE NOTICE 'hand supersede onto a LAPSED head: ALLOWED  <-- FAIL';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_err = MESSAGE_TEXT;
    RAISE NOTICE 'hand supersede onto a LAPSED head: REFUSED -> %', v_err;
  END;
  PERFORM pg_temp.reset_role();
END $$;

\echo ''
\echo '=== B2-4 · the sweep says nothing about the folded-away firm ==='
DO $$
DECLARE v jsonb; n int; s text;
BEGIN
  v := public.sweep_compliance_expiries();
  RAISE NOTICE 'B2-4 sweep: %', v::text;
  -- every notice whose document is STILL held by the folded-away card. The
  -- absorbed bond (fb…004) is lapsed, gating {payment}, and inside the sweep's
  -- 30-day window — the only thing keeping it quiet is the merged_into leg.
  SELECT count(*) INTO n
    FROM public.studio_compliance_notices sn
    JOIN public.studio_compliance_documents d ON d.id = sn.document_id
   WHERE d.holder_id = 'fb200000-0000-4000-8000-000000000002';
  RAISE NOTICE 'B2-4 notices about paper still on the folded card (want 0): %', n;
  SELECT count(*) INTO n FROM public.studio_compliance_documents
   WHERE holder_id='fb200000-0000-4000-8000-000000000002'
     AND public.compliance_document_state(id) = 'lapsed';
  RAISE NOTICE 'B2-4 lapsed papers still on the folded card (want 1, unannounced): %', n;
  SELECT count(*) INTO n FROM public.notification_log
   WHERE metadata::text ILIKE '%Absorbed Firm QA%';
  RAISE NOTICE 'B2-4 notifications naming the folded firm (want 0): %', n;
  SELECT count(*) INTO n FROM public.people_directory WHERE person_id='fb200000-0000-4000-8000-000000000002';
  RAISE NOTICE 'B2-4 directory rows for the folded card (want 0): %', n;
END $$;

\echo ''
\echo '=== B2-3 · the backfill leaves bid_selected_at alone, and quoted reads only quoted rows ==='
SELECT count(*) AS bid_selected_at_rows_written FROM public.project_parties WHERE bid_selected_at IS NOT NULL;
ROLLBACK;
