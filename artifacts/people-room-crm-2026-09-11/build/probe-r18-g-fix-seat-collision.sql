-- r18 MAJOR-1 fix control — merge_seat_collision (00629).
-- Four measurements, one transaction, ROLLBACKed. Local only.
--   G-a  the refusal fires, names the job and the kind, and WRITES NOTHING
--   G-b  the repair the HINT names (Close this seat) lifts the gate, and the
--        fold then converges to ONE open seat with ONE open money grant
--   G-c  the milder trade-card shape (probe C, no household) is refused too
--   G-d  a CLOSED seat on the survivor does NOT refuse the fold
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

INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, phone, phone_e164, created_by)
VALUES ('f8d00000-0000-4000-8000-00000000000a','b0000000-0000-0000-0000-000000000001','person','client','Cyril Probe','612-555-9101','+16125559101','a0000000-0000-0000-0000-000000000004'),
       ('f8d00000-0000-4000-8000-00000000000b','b0000000-0000-0000-0000-000000000001','person','client','Cyril Probe','612-555-9101','+16125559101','a0000000-0000-0000-0000-000000000004');

SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone, studio_contact_id, created_by)
VALUES ('f8e00000-0000-4000-8000-00000000000a','d0e00000-0000-0000-0000-00000000000a','client_rep','Cyril Probe','612-555-9101','f8d00000-0000-4000-8000-00000000000a','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_party_authority (engagement_id, scope, threshold_cents, source_clause, granted_by)
VALUES ('f8e00000-0000-4000-8000-00000000000a','money',1000000,'agreement §4','a0000000-0000-0000-0000-000000000004');

INSERT INTO public.client_households (id, organization_id, designer_id, display_name, co_threshold_cents)
VALUES ('f8f00000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000004','Probe household',250000);
SELECT public.add_household_member('f8f00000-0000-4000-8000-000000000001','f8d00000-0000-4000-8000-00000000000b','client_rep','d0e00000-0000-0000-0000-00000000000a') AS seat_b;

\echo '--- G-a: the duplicate band''s own act, refused by name ---'
DO $$
DECLARE v_sqlstate text; v_msg text; v_detail text; v_hint text; n integer;
BEGIN
  BEGIN
    PERFORM public.merge_studio_contacts(
      'f8d00000-0000-4000-8000-00000000000a','f8d00000-0000-4000-8000-00000000000b','phone');
    RAISE NOTICE 'G-a FAIL: the merge went through';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_sqlstate = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT,
                            v_detail = PG_EXCEPTION_DETAIL, v_hint = PG_EXCEPTION_HINT;
    RAISE NOTICE 'G-a refusal: % | DETAIL % | HINT %', v_msg, v_detail, v_hint;
  END;
  -- and nothing moved: both cards still live, both grants still open
  SELECT count(*) INTO n FROM public.studio_contacts
   WHERE id IN ('f8d00000-0000-4000-8000-00000000000a','f8d00000-0000-4000-8000-00000000000b')
     AND merged_into IS NULL;
  RAISE NOTICE 'G-a cards still unfolded: % of 2', n;
  SELECT count(*) INTO n FROM public.studio_contact_merges;
  RAISE NOTICE 'G-a merge rows written: %', n;
  SELECT count(*) INTO n FROM public.project_parties
   WHERE studio_contact_id = 'f8d00000-0000-4000-8000-00000000000a';
  RAISE NOTICE 'G-a seats on the survivor: % (1 = the repoint never ran)', n;
END $$;

\echo '--- G-b: the repair the HINT names, then the fold ---'
SELECT pg_temp.reset_role();
UPDATE public.project_parties
   SET stage = 'off_job', off_job_at = CURRENT_DATE,
       off_job_reason = 'The same person was already seated under the other card.'
 WHERE studio_contact_id = 'f8d00000-0000-4000-8000-00000000000b';
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
SELECT public.merge_studio_contacts(
  'f8d00000-0000-4000-8000-00000000000a','f8d00000-0000-4000-8000-00000000000b','phone') AS survivor;
SELECT person_id, display_name, seat_count FROM public.people_directory
 WHERE display_name = 'Cyril Probe' ORDER BY person_id;
SELECT pp.id AS seat, pp.party_kind, pp.off_job_at,
       pa.threshold_cents, pa.source_clause
  FROM public.project_parties pp
  LEFT JOIN public.project_party_authority pa
    ON pa.engagement_id = pp.id AND pa.scope = 'money' AND pa.effective_to IS NULL
 WHERE pp.studio_contact_id = 'f8d00000-0000-4000-8000-00000000000a'
 ORDER BY pp.off_job_at NULLS FIRST, pp.id;

\echo '--- G-c: the milder trade-card shape (no household) is refused too ---'
SELECT pg_temp.reset_role();
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, phone, phone_e164, created_by)
VALUES ('f8d00000-0000-4000-8000-00000000000c','b0000000-0000-0000-0000-000000000001','person','trade','Probe Twin A','612-555-9102','+16125559102','a0000000-0000-0000-0000-000000000004'),
       ('f8d00000-0000-4000-8000-00000000000d','b0000000-0000-0000-0000-000000000001','person','trade','Probe Twin B','612-555-9102','+16125559102','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_parties (project_id, party_kind, display_name, studio_contact_id, created_by)
VALUES ('d0e00000-0000-0000-0000-00000000000a','sub','Probe Twin A','f8d00000-0000-4000-8000-00000000000c','a0000000-0000-0000-0000-000000000004'),
       ('d0e00000-0000-0000-0000-00000000000a','sub','Probe Twin B','f8d00000-0000-4000-8000-00000000000d','a0000000-0000-0000-0000-000000000004');
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
DO $$
DECLARE v_msg text; v_detail text;
BEGIN
  BEGIN
    PERFORM public.merge_studio_contacts(
      'f8d00000-0000-4000-8000-00000000000c','f8d00000-0000-4000-8000-00000000000d','phone');
    RAISE NOTICE 'G-c FAIL: the trade fold went through';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
    RAISE NOTICE 'G-c refusal: % | DETAIL %', v_msg, v_detail;
  END;
END $$;

\echo '--- G-d: a CLOSED seat on the survivor does NOT refuse the fold ---'
SELECT pg_temp.reset_role();
INSERT INTO public.studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, phone, phone_e164, created_by)
VALUES ('f8d00000-0000-4000-8000-00000000000e','b0000000-0000-0000-0000-000000000001','person','trade','Probe Twin C','612-555-9103','+16125559103','a0000000-0000-0000-0000-000000000004'),
       ('f8d00000-0000-4000-8000-00000000000f','b0000000-0000-0000-0000-000000000001','person','trade','Probe Twin D','612-555-9103','+16125559103','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_parties (project_id, party_kind, display_name, studio_contact_id, created_by, stage, off_job_at, off_job_reason)
VALUES ('d0e00000-0000-0000-0000-00000000000a','installer','Probe Twin C','f8d00000-0000-4000-8000-00000000000e','a0000000-0000-0000-0000-000000000004','off_job',CURRENT_DATE - 30,'Finished last spring.');
INSERT INTO public.project_parties (project_id, party_kind, display_name, studio_contact_id, created_by)
VALUES ('d0e00000-0000-0000-0000-00000000000a','installer','Probe Twin D','f8d00000-0000-4000-8000-00000000000f','a0000000-0000-0000-0000-000000000004');
SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');
SELECT public.merge_studio_contacts(
  'f8d00000-0000-4000-8000-00000000000e','f8d00000-0000-4000-8000-00000000000f','phone') AS survivor_cd;
SELECT pp.party_kind, pp.display_name, pp.off_job_at
  FROM public.project_parties pp
 WHERE pp.studio_contact_id = 'f8d00000-0000-4000-8000-00000000000e'
 ORDER BY pp.off_job_at NULLS FIRST;

SELECT pg_temp.reset_role();
ROLLBACK;
