-- r19 — following merge_seat_collision's own HINT ("Close one of these two
-- seats first, then merge") leaves the survivor holding TWO client_rep seats
-- on ONE job, BOTH carrying an OPEN money grant, and the Call Sheet's Client
-- side bands both (CLIENT_BAND_KINDS is consulted before the window rule).
-- One transaction, ROLLBACKed. Local only. Room acts only.
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
VALUES ('f7d00000-0000-4000-8000-00000000000a','b0000000-0000-0000-0000-000000000001','person','client','Cyril R19','612-555-9201','+16125559201','a0000000-0000-0000-0000-000000000004'),
       ('f7d00000-0000-4000-8000-00000000000b','b0000000-0000-0000-0000-000000000001','person','client','Cyril R19','612-555-9201','+16125559201','a0000000-0000-0000-0000-000000000004');

SELECT pg_temp.assume_user('a0000000-0000-0000-0000-000000000004');

-- card A (survivor): seated client_rep on the Okonkwo residence, with the
-- agreement's $10,000 (R-J "Confirm from the agreement").
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone, studio_contact_id, created_by)
VALUES ('f7e00000-0000-4000-8000-00000000000a','d0e00000-0000-0000-0000-00000000000a','client_rep','Cyril R19','612-555-9201','f7d00000-0000-4000-8000-00000000000a','a0000000-0000-0000-0000-000000000004');
INSERT INTO public.project_party_authority (engagement_id, scope, threshold_cents, source_clause, granted_by)
VALUES ('f7e00000-0000-4000-8000-00000000000a','money',1000000,'agreement §4','a0000000-0000-0000-0000-000000000004');

-- card B (to be folded): the household's $2,500 on the SAME job.
INSERT INTO public.client_households (id, organization_id, designer_id, display_name, co_threshold_cents)
VALUES ('f7f00000-0000-4000-8000-000000000001','b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000004','R19 household',250000);
SELECT public.add_household_member('f7f00000-0000-4000-8000-000000000001','f7d00000-0000-4000-8000-00000000000b','client_rep','d0e00000-0000-0000-0000-00000000000a') AS seat_b;

\echo '--- A-a: the fold is refused, as r18 fixed it ---'
DO $$
DECLARE m text; d text; h text;
BEGIN
  BEGIN
    PERFORM public.merge_studio_contacts('f7d00000-0000-4000-8000-00000000000a','f7d00000-0000-4000-8000-00000000000b','phone');
    RAISE NOTICE 'A-a FAIL: went through';
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS m = MESSAGE_TEXT, d = PG_EXCEPTION_DETAIL, h = PG_EXCEPTION_HINT;
    RAISE NOTICE 'A-a refusal: % | DETAIL % | HINT %', m, d, h;
  END;
END $$;

\echo '--- A-b: the room takes the repair the HINT names: "Close this seat" on the absorbed one ---'
-- exactly what useCloseProjectPartySeat writes, and nothing else
UPDATE public.project_parties
   SET stage = 'off_job', off_job_at = CURRENT_DATE,
       off_job_reason = 'Seated twice by mistake.'
 WHERE studio_contact_id = 'f7d00000-0000-4000-8000-00000000000b';

\echo '--- A-c: does "Close this seat" end that seat''s money grant? ---'
SELECT pp.id AS seat, pp.off_job_at, pa.scope, pa.threshold_cents, pa.effective_to, pa.source_clause
  FROM public.project_parties pp
  JOIN public.project_party_authority pa ON pa.engagement_id = pp.id
 WHERE pp.studio_contact_id = 'f7d00000-0000-4000-8000-00000000000b';

\echo '--- A-d: the fold now goes through ---'
SELECT public.merge_studio_contacts('f7d00000-0000-4000-8000-00000000000a','f7d00000-0000-4000-8000-00000000000b','phone') AS survivor;

\echo '--- A-e: what the Call Sheet Client side now holds for ONE human on ONE job ---'
-- useProjectAuthority: effective_to IS NULL OR >= today
-- roster-derivation callSheetProjection(): client/client_rep -> clientSide, band rule never consulted
SELECT pp.id AS seat, pp.party_kind, pp.off_job_at, pp.off_job_reason,
       pa.scope, pa.threshold_cents, pa.effective_to, pa.source_clause,
       'Signs money to $' || to_char(round(pa.threshold_cents/100.0),'FM999,999,999') AS authority_phrase
  FROM public.project_parties pp
  LEFT JOIN public.project_party_authority pa
    ON pa.engagement_id = pp.id
   AND pa.scope = 'money'
   AND (pa.effective_to IS NULL OR pa.effective_to >= CURRENT_DATE)
 WHERE pp.studio_contact_id = 'f7d00000-0000-4000-8000-00000000000a'
   AND pp.project_id = 'd0e00000-0000-0000-0000-00000000000a'
 ORDER BY pp.off_job_at NULLS FIRST, pp.id;

\echo '--- A-f: what people_directory / _seats say ---'
SELECT person_id, display_name, seat_count FROM public.people_directory WHERE display_name = 'Cyril R19';
SELECT seat_id, project_id, party_kind, display_name FROM public.people_directory_seats
 WHERE person_id = 'f7d00000-0000-4000-8000-00000000000a' ORDER BY seat_id;

SELECT pg_temp.reset_role();
ROLLBACK;
