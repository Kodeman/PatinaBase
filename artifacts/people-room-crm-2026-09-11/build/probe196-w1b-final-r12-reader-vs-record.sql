\pset pager off
-- probe196 (r12) — reader-vs-record divergence sweep, as every real caller
BEGIN;
SET LOCAL client_min_messages=notice;
DO $$
DECLARE r record; u record; n int;
BEGIN
  FOR u IN SELECT id, email FROM public.profiles
            WHERE email IN ('designer@patina.dev','studio_manager@patina.dev',
                            'client@patina.dev','cf-phase1-alice@patina.invalid','admin@patina.dev')
  LOOP
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claims', json_build_object('sub',u.id::text,'role','authenticated')::text, true);

    -- 1. a Directory row printing a MORE PERMISSIVE word than the record for
    --    any number that identity carries
    SELECT count(*) INTO n
      FROM public.people_directory d
      JOIN public.studio_contacts sc ON sc.id = d.person_id AND d.role='contact'
      JOIN public.studio_channel_consent scc
        ON scc.organization_id = sc.organization_id AND scc.channel_kind='sms'
       AND scc.channel_value = sc.phone_e164
     WHERE public.channel_consent_status(sc.organization_id,'sms',sc.phone_e164) = 'opted_out'
       AND COALESCE(d.consent_status,'') <> 'opted_out';
    RAISE NOTICE '% : contact rows losing a recorded refusal on the CARD number: %', u.email, n;

    -- 2. seat lines vs the record
    SELECT count(*) INTO n
      FROM public.people_directory_seats s
     WHERE s.phone_e164 IS NOT NULL
       AND s.consent_status IS NOT NULL
       AND s.consent_status IS DISTINCT FROM
           COALESCE(public.channel_consent_status(
             public.project_consent_org(s.project_id),'sms',s.phone_e164),'not_asked');
    RAISE NOTICE '% : seat lines disagreeing with the record: %', u.email, n;

    -- 3. paper words vs compliance_state
    SELECT count(*) INTO n
      FROM public.people_directory d
      JOIN public.studio_contacts sc ON sc.id = d.person_id AND d.role='contact'
     WHERE d.paper_state IS DISTINCT FROM public.identity_paper_state(sc.id, sc.company_id);
    RAISE NOTICE '% : paper words disagreeing with identity_paper_state: %', u.email, n;

    -- 4. R-BG: no row claims a seat_count it cannot nest
    SELECT count(*) INTO n
      FROM public.people_directory d
      LEFT JOIN (SELECT person_id, count(*)::int c FROM public.people_directory_seats GROUP BY 1) s
             ON s.person_id = d.person_id
     WHERE d.seat_count <> COALESCE(s.c,0);
    RAISE NOTICE '% : rows claiming a seat_count they cannot nest: %', u.email, n;

    -- 5. the CTE vs identity_seat_count()
    SELECT count(*) INTO n FROM public.people_directory d
     WHERE d.role='contact' AND d.seat_count <> public.identity_seat_count(d.person_id::text);
    RAISE NOTICE '% : contacts rows where the CTE and identity_seat_count() disagree: %', u.email, n;

    -- 6. the six new objects, counted
    SELECT count(*) INTO n FROM public.studio_compliance_documents;  RAISE NOTICE '%   compliance=%', u.email, n;
    SELECT count(*) INTO n FROM public.project_party_authority;      RAISE NOTICE '%   authority=%', u.email, n;
    SELECT count(*) INTO n FROM public.project_site_access_cards;    RAISE NOTICE '%   site_cards=%', u.email, n;
    SELECT count(*) INTO n FROM public.people_directory_seats;       RAISE NOTICE '%   seats=%', u.email, n;
    SELECT count(*) INTO n FROM public.people_directory;             RAISE NOTICE '%   directory=%', u.email, n;
    SELECT count(*) INTO n FROM public.v_access_grants;              RAISE NOTICE '%   access_grants=%', u.email, n;
    RESET ROLE;
  END LOOP;
END $$;
ROLLBACK;
