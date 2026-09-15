\set ON_ERROR_STOP on
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

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES ('a0000000-0000-4000-8000-0000000021a1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','r21-plain@patina.dev','x',now(),now(),now());
INSERT INTO public.profiles (id, email, full_name) VALUES
  ('a0000000-0000-4000-8000-0000000021a1','r21-plain@patina.dev','R21 Plain Member')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES ('b0000000-0000-0000-0000-000000000001','a0000000-0000-4000-8000-0000000021a1','member','active');

-- a SUB seat with a bid on the books AND a money grant, both written by acts
-- the room offers (Add to the roster writes the grant; the Bidding band writes
-- the bid).
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, phone, phone_e164, created_by)
VALUES ('f7d00000-0000-4000-8000-0000000021a0','b0000000-0000-0000-0000-000000000001','person','sub','R21 Bidder','612-555-9401','+16125559401','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone, studio_contact_id, stage, bid_outcome, bid_amount_cents, created_by)
VALUES ('f7e00000-0000-4000-8000-0000000021a0','d0e00000-0000-0000-0000-00000000000a','sub','R21 Bidder','612-555-9401','f7d00000-0000-4000-8000-0000000021a0','bidding','quoted',450000,'a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_party_authority (engagement_id, scope, threshold_cents, source_clause, granted_by)
VALUES ('f7e00000-0000-4000-8000-0000000021a0','money',500000,'agreement §4','a0000000-0000-0000-0000-000000000004');

\echo '=== C1: a PLAIN member presses "Close this seat" on the Call Sheet (useCloseProjectPartySeat) ==='
SELECT pg_temp.assume_user('a0000000-0000-4000-8000-0000000021a1');
DO $$ BEGIN
  UPDATE public.project_parties SET stage='off_job', off_job_at=CURRENT_DATE, off_job_reason='Picked another sub.'
   WHERE id='f7e00000-0000-4000-8000-0000000021a0';
  RAISE NOTICE 'C1 the close LANDED';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'C1 refused, message the portal prints verbatim: %', SQLERRM;
END $$;
SELECT pg_temp.reset_role();

\echo '=== C2: the SAME plain member records "They withdrew" in the Bidding band (useSetPartyBid) ==='
SELECT pg_temp.assume_user('a0000000-0000-4000-8000-0000000021a1');
DO $$ BEGIN
  UPDATE public.project_parties SET bid_outcome='withdrawn', stage='off_job', off_job_at=CURRENT_DATE
   WHERE id='f7e00000-0000-4000-8000-0000000021a0';
  RAISE NOTICE 'C2 the bid write LANDED';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'C2 refused, message asBidError() returns verbatim: %', SQLERRM;
END $$;
SELECT pg_temp.reset_role();
SELECT 'C2 after' AS step, pp.stage, pp.bid_outcome, pp.off_job_at, pa.scope, pa.threshold_cents, pa.effective_to
  FROM public.project_parties pp LEFT JOIN public.project_party_authority pa ON pa.engagement_id = pp.id
 WHERE pp.id='f7e00000-0000-4000-8000-0000000021a0';

\echo '=== C3: the OWNER records "They withdrew" ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
UPDATE public.project_parties SET bid_outcome='withdrawn', stage='off_job', off_job_at=CURRENT_DATE
 WHERE id='f7e00000-0000-4000-8000-0000000021a0';
SELECT pg_temp.reset_role();
SELECT 'C3 after' AS step, pp.stage, pp.bid_outcome, pp.off_job_at, pa.scope, pa.threshold_cents, pa.effective_to
  FROM public.project_parties pp LEFT JOIN public.project_party_authority pa ON pa.engagement_id = pp.id
 WHERE pp.id='f7e00000-0000-4000-8000-0000000021a0';

\echo '=== C4: R-BR — the owner CORRECTS the outcome back to "They quoted" (off_job_at + reason cleared) ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
UPDATE public.project_parties SET bid_outcome='quoted', stage='bidding', off_job_at=NULL, off_job_reason=NULL
 WHERE id='f7e00000-0000-4000-8000-0000000021a0';
SELECT pg_temp.reset_role();
SELECT 'C4 after' AS step, pp.stage, pp.bid_outcome, pp.off_job_at, pa.scope, pa.threshold_cents, pa.effective_to,
       (pa.effective_to IS NULL OR pa.effective_to >= CURRENT_DATE) AS reads_live
  FROM public.project_parties pp LEFT JOIN public.project_party_authority pa ON pa.engagement_id = pp.id
 WHERE pp.id='f7e00000-0000-4000-8000-0000000021a0';

ROLLBACK;
