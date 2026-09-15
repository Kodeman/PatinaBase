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

-- Two duplicate cards for ONE human, each holding an OPEN sub seat on ONE job,
-- each carrying its own OPEN money grant (the Add sheet's R-J "Confirm from
-- the agreement" shape, add-person-sheet.tsx:893-911, which is not gated on
-- party kind).
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, phone, phone_e164, created_by) VALUES
 ('f7d00000-0000-4000-8000-0000000022a1','b0000000-0000-0000-0000-000000000001','person','sub','R22 Dup Old','612-555-9501','+16125559501','a0000000-0000-0000-0000-000000000004'),
 ('f7d00000-0000-4000-8000-0000000022a2','b0000000-0000-0000-0000-000000000001','person','sub','R22 Dup New','612-555-9502','+16125559502','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, studio_contact_id, stage, bid_outcome, created_by) VALUES
 ('f7e00000-0000-4000-8000-0000000022a1','d0e00000-0000-0000-0000-00000000000a','sub','R22 Dup Old','f7d00000-0000-4000-8000-0000000022a1','bidding','quoted','a0000000-0000-0000-0000-000000000004'),
 ('f7e00000-0000-4000-8000-0000000022a2','d0e00000-0000-0000-0000-00000000000a','sub','R22 Dup New','f7d00000-0000-4000-8000-0000000022a2','bidding','quoted','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_party_authority (engagement_id, scope, threshold_cents, source_clause, granted_by) VALUES
 ('f7e00000-0000-4000-8000-0000000022a1','money',250000,'agreement §4','a0000000-0000-0000-0000-000000000004'),
 ('f7e00000-0000-4000-8000-0000000022a2','money',1000000,'agreement §4','a0000000-0000-0000-0000-000000000004');

\echo '=== A0: the fold is refused while both seats are open (merge_seat_collision) ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
DO $$ BEGIN
  PERFORM public.merge_studio_contacts('f7d00000-0000-4000-8000-0000000022a2','f7d00000-0000-4000-8000-0000000022a1','phone');
  RAISE NOTICE 'A0 the fold LANDED (unexpected)';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'A0 refused: %', SQLERRM;
END $$;
SELECT pg_temp.reset_role();

\echo '=== A1: the studio records "They withdrew" on the old seat (the Bidding band, useSetPartyBid) ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
UPDATE public.project_parties SET bid_outcome='withdrawn', stage='off_job', off_job_at=CURRENT_DATE
 WHERE id='f7e00000-0000-4000-8000-0000000022a1';
SELECT pg_temp.reset_role();
SELECT 'A1 after' AS step, pp.id, pp.off_job_at, pa.threshold_cents, pa.effective_to,
       (pa.effective_to IS NULL OR pa.effective_to >= CURRENT_DATE) AS reads_live
  FROM public.project_parties pp JOIN public.project_party_authority pa ON pa.engagement_id=pp.id
 WHERE pp.id IN ('f7e00000-0000-4000-8000-0000000022a1','f7e00000-0000-4000-8000-0000000022a2') ORDER BY 2;

\echo '=== A2: the fold is now PERMITTED — the collision predicate reads off_job_at IS NULL ==='
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
DO $$ BEGIN
  PERFORM public.merge_studio_contacts('f7d00000-0000-4000-8000-0000000022a2','f7d00000-0000-4000-8000-0000000022a1','phone');
  RAISE NOTICE 'A2 the fold LANDED';
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'A2 refused: %', SQLERRM;
END $$;
SELECT pg_temp.reset_role();

\echo '=== A3: one human, one job, two seats, TWO OPEN money grants ==='
SELECT 'A3' AS step, pp.id AS seat, pp.party_kind, pp.off_job_at, pp.bid_outcome,
       pa.threshold_cents, pa.effective_to,
       (pa.effective_to IS NULL OR pa.effective_to >= CURRENT_DATE) AS reads_live
  FROM public.project_parties pp JOIN public.project_party_authority pa ON pa.engagement_id=pp.id
 WHERE pp.studio_contact_id='f7d00000-0000-4000-8000-0000000022a2'
   AND pp.project_id='d0e00000-0000-0000-0000-00000000000a'
 ORDER BY pa.threshold_cents;

\echo '=== B: a FUTURE-dated hand close (r20-n1) ==='
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, studio_contact_id, stage, created_by)
VALUES ('f7e00000-0000-4000-8000-0000000022b1','d0e00000-0000-0000-0000-00000000000a','installer','R22 Future','f7d00000-0000-4000-8000-0000000022a2','active','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_party_authority (engagement_id, scope, threshold_cents, source_clause, granted_by)
VALUES ('f7e00000-0000-4000-8000-0000000022b1','money',300000,'agreement §4','a0000000-0000-0000-0000-000000000004');
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
UPDATE public.project_parties SET stage='off_job', off_job_at=CURRENT_DATE + 30, off_job_reason='Leaves at the end of the month.'
 WHERE id='f7e00000-0000-4000-8000-0000000022b1';
SELECT pg_temp.reset_role();
SELECT 'B after' AS step, pp.off_job_at, pa.effective_to,
       (pa.effective_to IS NULL OR pa.effective_to >= CURRENT_DATE) AS grant_reads_live_today
  FROM public.project_parties pp JOIN public.project_party_authority pa ON pa.engagement_id=pp.id
 WHERE pp.id='f7e00000-0000-4000-8000-0000000022b1';

\echo '=== C: told_refs on a site access card after a merge ==='
SELECT 'C' AS step, sac.project_id, sac.told_refs,
       (SELECT count(*) FROM unnest(sac.told_refs) t JOIN public.studio_contacts sc ON sc.id=t WHERE sc.merged_into IS NOT NULL) AS refs_naming_a_merged_card
  FROM public.project_site_access_cards sac WHERE cardinality(sac.told_refs) > 0;

\echo '=== D: people_directory own COMMENT (m7) ==='
SELECT left(obj_description('public.people_directory'::regclass, 'pg_class'), 180) AS directory_comment;

ROLLBACK;
