-- r10 fix probe C: F-12 Pete Rusk's seeded reach word, and a no-regression
-- sweep of seat_count over the UNTOUCHED seed (fixed body vs pre-fix body).
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.assume(p uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN EXECUTE 'SET LOCAL role authenticated';
 EXECUTE format('SET LOCAL request.jwt.claims = %L',
   json_build_object('sub',p::text,'role','authenticated')::text); END $$;
GRANT EXECUTE ON FUNCTION pg_temp.assume(uuid) TO authenticated;

DO $$
DECLARE r record; n int;
BEGIN
  PERFORM pg_temp.assume('a0000000-0000-0000-0000-000000000004');  -- designer@patina.dev
  RAISE NOTICE '-- the four identities the r10 tests round was told to check --';
  FOR r IN SELECT display_name, role, reach_state, consent_status, paper_state
             FROM public.people_directory
            WHERE display_name IN ('Dana Kowalski','Pete Rusk','Erin Sato','Joe Wozniak')
            ORDER BY display_name LOOP
    RAISE NOTICE '  % | % | reach=% | consent=% | paper=%',
      rpad(r.display_name,14), rpad(r.role,8), rpad(r.reach_state,10),
      rpad(r.consent_status,10), r.paper_state;
  END LOOP;

  SELECT count(*) INTO n FROM public.field_link_tokens f
    JOIN public.project_parties pp ON pp.id = f.party_id
   WHERE f.status='active' AND f.expires_at > now()
     AND pp.id = 'd0e30000-0000-0000-0000-000000000012';
  RAISE NOTICE 'active, unexpired field links on Pete Rusk''s Okonkwo seat: %', n;
  RAISE NOTICE '  its expiry (his window ends 2027-05-31, PR-d): %',
    (SELECT expires_at::date FROM public.field_link_tokens
      WHERE party_id='d0e30000-0000-0000-0000-000000000012' AND status='active');
  RAISE NOTICE 'seats of Pete Rusk reading field_link: %',
    (SELECT count(*) FROM public.people_directory_seats
      WHERE display_name='Pete Rusk' AND reach_state='field_link');

  -- the claims/nests invariant over the whole untouched seed, per caller
  FOR r IN SELECT unnest(ARRAY['a0000000-0000-0000-0000-000000000004',
                               'a0000000-0000-0000-0000-000000000003']::uuid[]) AS u LOOP
    PERFORM pg_temp.assume(r.u);
    SELECT count(*) INTO n FROM public.people_directory pd
     WHERE pd.seat_count > 0
       AND pd.seat_count <> (SELECT count(*) FROM public.people_directory_seats s
                              WHERE s.person_id = pd.person_id);
    RAISE NOTICE 'caller % : Directory rows claiming a count they cannot nest = %', r.u, n;
  END LOOP;
END $$;

-- no-regression: on the seed as shipped, does the tenant leg change any count?
-- The pre-fix body is expressed inline (no DDL), so both are read in ONE
-- session, by ONE caller, over the same rows. The identity key is the one each
-- branch actually passes: meta->>'identity_key' on the party branch,
-- person_id::text (the rolodex card) on the contacts branch; the other four
-- branches pass nothing and claim 0 by construction (00626 §4).
DO $$
DECLARE n int; tot int;
BEGIN
  PERFORM pg_temp.assume('a0000000-0000-0000-0000-000000000004');
  SELECT count(*) INTO tot FROM public.people_directory pd
   WHERE COALESCE(pd.meta->>'identity_key',
                  CASE WHEN pd.role='contact' THEN pd.person_id::text END) IS NOT NULL;
  SELECT count(*) INTO n
    FROM public.people_directory pd
   WHERE COALESCE(pd.meta->>'identity_key',
                  CASE WHEN pd.role='contact' THEN pd.person_id::text END) IS NOT NULL
     AND pd.seat_count IS DISTINCT FROM (
     SELECT count(*)::integer FROM public.project_parties pp
      WHERE public.party_identity_key(pp.studio_contact_id, pp.profile_id,
              pp.phone_e164, pp.email, pp.id)
          = COALESCE(pd.meta->>'identity_key',
                     CASE WHEN pd.role='contact' THEN pd.person_id::text END));
  RAISE NOTICE 'of % keyed Directory rows, % differ from the PRE-FIX (RLS-only) count on the untouched seed (0 = the fix costs the shipped fixture nothing)', tot, n;
END $$;
ROLLBACK;
