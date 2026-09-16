\set ON_ERROR_STOP on
-- r22 MAJOR-1, the fix measured. One transaction, ROLLBACKed, room acts only.
-- Same fixture as build/probe-r22-a-withdrawal-dated-seat-merge.sql §A.
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

INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, phone, phone_e164, created_by) VALUES
 ('f7d00000-0000-4000-8000-0000000022a1','b0000000-0000-0000-0000-000000000001','person','sub','R22 Dup Old','612-555-9501','+16125559501','a0000000-0000-0000-0000-000000000004'),
 ('f7d00000-0000-4000-8000-0000000022a2','b0000000-0000-0000-0000-000000000001','person','sub','R22 Dup New','612-555-9502','+16125559502','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, studio_contact_id, stage, bid_outcome, created_by) VALUES
 ('f7e00000-0000-4000-8000-0000000022a1','d0e00000-0000-0000-0000-00000000000a','sub','R22 Dup Old','f7d00000-0000-4000-8000-0000000022a1','bidding','quoted','a0000000-0000-0000-0000-000000000004'),
 ('f7e00000-0000-4000-8000-0000000022a2','d0e00000-0000-0000-0000-00000000000a','sub','R22 Dup New','f7d00000-0000-4000-8000-0000000022a2','bidding','quoted','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_party_authority (engagement_id, scope, threshold_cents, source_clause, granted_by) VALUES
 ('f7e00000-0000-4000-8000-0000000022a1','money',250000,'agreement §4','a0000000-0000-0000-0000-000000000004'),
 ('f7e00000-0000-4000-8000-0000000022a2','money',1000000,'agreement §4','a0000000-0000-0000-0000-000000000004');

\echo '=== A1: the studio records "They withdrew" on the old seat (Bidding band, useSetPartyBid) ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
UPDATE public.project_parties SET bid_outcome='withdrawn', stage='off_job', off_job_at=CURRENT_DATE
 WHERE id='f7e00000-0000-4000-8000-0000000022a1';
SELECT pg_temp.reset_role();
SELECT 'A1 after' AS step, pp.id, pp.off_job_at, pa.threshold_cents, pa.effective_to
  FROM public.project_parties pp JOIN public.project_party_authority pa ON pa.engagement_id=pp.id
 WHERE pp.id IN ('f7e00000-0000-4000-8000-0000000022a1','f7e00000-0000-4000-8000-0000000022a2') ORDER BY 2;

\echo '=== A2: the fold is now REFUSED by the fourth name (was: it landed) ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
DO $$
DECLARE v_msg text; v_detail text; v_hint text;
BEGIN
  PERFORM public.merge_studio_contacts('f7d00000-0000-4000-8000-0000000022a2','f7d00000-0000-4000-8000-0000000022a1','phone');
  RAISE NOTICE 'A2 the fold LANDED (the gap is still open)';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT;
  RAISE NOTICE 'A2 refused: % | DETAIL % | HINT %', v_msg, v_detail, v_hint;
END $$;
SELECT pg_temp.reset_role();

\echo '=== A3: nothing was written ==='
SELECT 'A3' AS step,
       (SELECT count(*) FROM public.studio_contacts WHERE id IN ('f7d00000-0000-4000-8000-0000000022a1','f7d00000-0000-4000-8000-0000000022a2') AND merged_into IS NULL) AS cards_still_live,
       (SELECT count(*) FROM public.studio_contact_merges WHERE merged_id='f7d00000-0000-4000-8000-0000000022a1') AS merge_rows;

\echo '=== B: THE HINT''S FIRST REPAIR — close the seat that is still open ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
UPDATE public.project_parties SET stage='off_job', off_job_at=CURRENT_DATE, off_job_reason='Already bidding under the other card.'
 WHERE id='f7e00000-0000-4000-8000-0000000022a2';
SELECT pg_temp.reset_role();
SELECT 'B after the close' AS step, pa.engagement_id, pa.threshold_cents, pa.effective_to
  FROM public.project_party_authority pa WHERE pa.engagement_id='f7e00000-0000-4000-8000-0000000022a2';
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
DO $$
DECLARE v_msg text;
BEGIN
  PERFORM public.merge_studio_contacts('f7d00000-0000-4000-8000-0000000022a2','f7d00000-0000-4000-8000-0000000022a1','phone');
  RAISE NOTICE 'B the fold LANDED after the repair';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT;
  RAISE NOTICE 'B refused: %', v_msg;
END $$;
SELECT pg_temp.reset_role();
SELECT 'B survivor' AS step, pp.id AS seat, pp.off_job_at, pa.threshold_cents, pa.effective_to,
       (pa.effective_to IS NULL) AS grant_open
  FROM public.project_parties pp JOIN public.project_party_authority pa ON pa.engagement_id=pp.id
 WHERE pp.studio_contact_id='f7d00000-0000-4000-8000-0000000022a2'
   AND pp.project_id='d0e00000-0000-0000-0000-00000000000a' ORDER BY pa.threshold_cents;
ROLLBACK;

-- ═══════════════════════════════════════════════════════════════════════════
-- C. THE HINT'S SECOND REPAIR — both seats already dated by a withdrawal.
--    A hand close on a seat ALREADY dated does not fire 00634 (the WHEN reads
--    OLD.off_job_at IS NULL, and useCloseProjectPartySeat keeps the recorded
--    day, r20 major-1), so the room's path is the Bidding band's own
--    correction (R-BR clears off_job_at) and then "Close this seat".
-- ═══════════════════════════════════════════════════════════════════════════
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

INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, phone, phone_e164, created_by) VALUES
 ('f7d00000-0000-4000-8000-0000000022c1','b0000000-0000-0000-0000-000000000001','person','sub','R22 Both Dated A','612-555-9503','+16125559503','a0000000-0000-0000-0000-000000000004'),
 ('f7d00000-0000-4000-8000-0000000022c2','b0000000-0000-0000-0000-000000000001','person','sub','R22 Both Dated B','612-555-9504','+16125559504','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, studio_contact_id, stage, bid_outcome, created_by) VALUES
 ('f7e00000-0000-4000-8000-0000000022c1','d0e00000-0000-0000-0000-00000000000a','sub','R22 Both Dated A','f7d00000-0000-4000-8000-0000000022c1','bidding','quoted','a0000000-0000-0000-0000-000000000004'),
 ('f7e00000-0000-4000-8000-0000000022c2','d0e00000-0000-0000-0000-00000000000a','sub','R22 Both Dated B','f7d00000-0000-4000-8000-0000000022c2','bidding','quoted','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_party_authority (engagement_id, scope, threshold_cents, source_clause, granted_by) VALUES
 ('f7e00000-0000-4000-8000-0000000022c1','money',250000,'agreement §4','a0000000-0000-0000-0000-000000000004'),
 ('f7e00000-0000-4000-8000-0000000022c2','money',1000000,'agreement §4','a0000000-0000-0000-0000-000000000004');

SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
UPDATE public.project_parties SET bid_outcome='withdrawn', stage='off_job', off_job_at=CURRENT_DATE
 WHERE id IN ('f7e00000-0000-4000-8000-0000000022c1','f7e00000-0000-4000-8000-0000000022c2');
SELECT pg_temp.reset_role();

\echo '=== C1: both seats dated by a withdrawal, both grants open, the fold refused ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
DO $$
DECLARE v_msg text;
BEGIN
  PERFORM public.merge_studio_contacts('f7d00000-0000-4000-8000-0000000022c2','f7d00000-0000-4000-8000-0000000022c1','phone');
  RAISE NOTICE 'C1 the fold LANDED';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; RAISE NOTICE 'C1 refused: %', v_msg;
END $$;
SELECT pg_temp.reset_role();

\echo '=== C2: a hand close on an ALREADY-dated seat keeps the recorded day and does not fire 00634 ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
UPDATE public.project_parties SET stage='off_job', off_job_at=CURRENT_DATE, off_job_reason='Tried to close a dated seat.'
 WHERE id='f7e00000-0000-4000-8000-0000000022c2';
SELECT pg_temp.reset_role();
SELECT 'C2' AS step, pa.effective_to AS grant_still_open_is_null
  FROM public.project_party_authority pa WHERE pa.engagement_id='f7e00000-0000-4000-8000-0000000022c2';

\echo '=== C3: the room''s path — put it back in the bidding (R-BR clears the date), then close it by hand ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
UPDATE public.project_parties SET bid_outcome='quoted', stage='bidding', off_job_at=NULL, off_job_reason=NULL
 WHERE id='f7e00000-0000-4000-8000-0000000022c2';
UPDATE public.project_parties SET stage='off_job', off_job_at=CURRENT_DATE, off_job_reason='Already bidding under the other card.'
 WHERE id='f7e00000-0000-4000-8000-0000000022c2';
SELECT pg_temp.reset_role();
SELECT 'C3' AS step, pa.threshold_cents, pa.effective_to
  FROM public.project_party_authority pa WHERE pa.engagement_id='f7e00000-0000-4000-8000-0000000022c2';

\echo '=== C4: and the fold then lands, one live figure on the job ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
DO $$
DECLARE v_msg text;
BEGIN
  PERFORM public.merge_studio_contacts('f7d00000-0000-4000-8000-0000000022c2','f7d00000-0000-4000-8000-0000000022c1','phone');
  RAISE NOTICE 'C4 the fold LANDED after the two-step repair';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT; RAISE NOTICE 'C4 refused: %', v_msg;
END $$;
SELECT pg_temp.reset_role();
SELECT 'C4 survivor' AS step, count(*) FILTER (WHERE pa.effective_to IS NULL) AS open_money_grants_on_the_job
  FROM public.project_parties pp JOIN public.project_party_authority pa
    ON pa.engagement_id=pp.id AND pa.scope='money'
 WHERE pp.studio_contact_id='f7d00000-0000-4000-8000-0000000022c2'
   AND pp.project_id='d0e00000-0000-0000-0000-00000000000a';
ROLLBACK;
