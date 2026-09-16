\pset pager off
BEGIN;
SET LOCAL client_min_messages=notice;
DO $$
DECLARE d uuid; n int; r record;
BEGIN
  SELECT id INTO d FROM public.profiles WHERE email='designer@patina.dev';
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',d::text,'role','authenticated')::text, true);
  n := 0;
  FOR r IN
    SELECT pd.display_name, pd.consent_status, num.v,
           public.channel_consent_status('b0000000-0000-0000-0000-000000000001','sms',num.v) AS w
      FROM public.people_directory pd
      JOIN public.studio_contacts sc ON sc.id = pd.person_id
      CROSS JOIN LATERAL public.identity_phone_numbers(
        'b0000000-0000-0000-0000-000000000001', pd.person_id::text, sc.phone_e164) num(v)
     WHERE pd.role='contact'
  LOOP
    IF r.consent_status = 'granted' AND COALESCE(r.w,'not_asked') <> 'granted' THEN
      n := n + 1;
      RAISE NOTICE '  FAIL-OPEN % prints granted while % reads % ', r.display_name, r.v, COALESCE(r.w,'(no record)');
    END IF;
  END LOOP;
  RAISE NOTICE 'Directory rows printing `granted` over a number the record does not: %', n;

  -- and the converse: a recorded opted_out that the row does not carry
  n := 0;
  FOR r IN
    SELECT pd.display_name, pd.consent_status, num.v,
           public.channel_consent_status('b0000000-0000-0000-0000-000000000001','sms',num.v) AS w
      FROM public.people_directory pd
      JOIN public.studio_contacts sc ON sc.id = pd.person_id
      CROSS JOIN LATERAL public.identity_phone_numbers(
        'b0000000-0000-0000-0000-000000000001', pd.person_id::text, sc.phone_e164) num(v)
     WHERE pd.role='contact'
  LOOP
    IF r.w = 'opted_out' AND r.consent_status IS DISTINCT FROM 'opted_out' THEN
      n := n + 1;
      RAISE NOTICE '  LOST REFUSAL % reads % while % is opted_out', r.display_name, r.consent_status, r.v;
    END IF;
  END LOOP;
  RAISE NOTICE 'Directory rows losing a recorded refusal: %', n;
  RESET ROLE;
END $$;
ROLLBACK;
