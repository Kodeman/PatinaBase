\set ON_ERROR_STOP on
BEGIN;
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims',
  '{"sub":"cf100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
\echo '=== D1: a foreign studio owner reads the four new relations ==='
SELECT 'compliance_documents' AS rel, count(*) FROM public.studio_compliance_documents
UNION ALL SELECT 'party_authority', count(*) FROM public.project_party_authority
UNION ALL SELECT 'site_access_cards', count(*) FROM public.project_site_access_cards
UNION ALL SELECT 'directory_seats', count(*) FROM public.people_directory_seats
UNION ALL SELECT 'directory', count(*) FROM public.people_directory
UNION ALL SELECT 'access_grants', count(*) FROM public.v_access_grants;

\echo '=== D2: does the foreign caller get another studio paper word out of compliance_state? ==='
SELECT public.compliance_state('d0e20000-0000-0000-0000-000000000002') AS northgate_word_seen_by_outsider;
\echo '=== D3: identity_consent_status / channel_consent_status across the tenant line ==='
SELECT public.identity_consent_status('b0000000-0000-0000-0000-000000000001',
        'd0e10000-0000-0000-0000-000000000012', NULL) AS pete_word_seen_by_outsider,
       public.channel_consent_status('b0000000-0000-0000-0000-000000000001','sms','+16125550112') AS raw_word_seen_by_outsider;
\echo '=== D4: can the outsider WRITE into the seeded studio? ==='
DO $$
BEGIN
  INSERT INTO public.studio_compliance_documents
    (organization_id, holder_type, holder_id, doc_type, expires_on, blocks)
  VALUES ('b0000000-0000-0000-0000-000000000001','company',
          'd0e20000-0000-0000-0000-000000000002','coi_gl', CURRENT_DATE+365, '{}');
  RAISE NOTICE 'D4 compliance INSERT LANDED (cross-tenant write)';
EXCEPTION WHEN others THEN RAISE NOTICE 'D4 compliance INSERT refused -> %', SQLERRM;
END $$;
DO $$
BEGIN
  UPDATE public.studio_compliance_documents SET blocks='{}'
   WHERE organization_id='b0000000-0000-0000-0000-000000000001';
  RAISE NOTICE 'D4 compliance UPDATE affected % rows', (SELECT count(*) FROM public.studio_compliance_documents WHERE blocks='{}' AND organization_id='b0000000-0000-0000-0000-000000000001');
EXCEPTION WHEN others THEN RAISE NOTICE 'D4 compliance UPDATE refused -> %', SQLERRM;
END $$;
DO $$
BEGIN
  INSERT INTO public.project_site_access_cards (project_id, lockbox_version)
  VALUES ((SELECT id FROM public.projects WHERE name='Okonkwo residence'), 'x');
  RAISE NOTICE 'D4 site card INSERT LANDED (cross-tenant write)';
EXCEPTION WHEN others THEN RAISE NOTICE 'D4 site card INSERT refused -> %', SQLERRM;
END $$;
DO $$
DECLARE v uuid;
BEGIN
  SELECT pp.id INTO v FROM public.project_parties pp JOIN public.projects pj ON pj.id=pp.project_id
   WHERE pj.name='Okonkwo residence' LIMIT 1;
  RAISE NOTICE 'D4 outsider can see a seat id: %', coalesce(v::text,'(none - RLS blocked)');
  INSERT INTO public.project_party_authority (engagement_id, scope) VALUES (v, 'money');
  RAISE NOTICE 'D4 authority INSERT LANDED (cross-tenant write)';
EXCEPTION WHEN others THEN RAISE NOTICE 'D4 authority INSERT refused -> %', SQLERRM;
END $$;
DO $$
BEGIN
  PERFORM public.create_field_link((SELECT pp.id FROM public.project_parties pp JOIN public.projects pj ON pj.id=pp.project_id WHERE pj.name='Okonkwo residence' LIMIT 1));
  RAISE NOTICE 'D4 create_field_link LANDED (cross-tenant mint)';
EXCEPTION WHEN others THEN RAISE NOTICE 'D4 create_field_link refused -> %', SQLERRM;
END $$;
ROLLBACK;

\echo '=== D5: anon ==='
BEGIN;
SET LOCAL role anon;
DO $$
BEGIN PERFORM count(*) FROM public.studio_compliance_documents;
  RAISE NOTICE 'anon compliance_documents READ (leak)';
EXCEPTION WHEN others THEN RAISE NOTICE 'anon compliance_documents -> %', SQLERRM; END $$;
DO $$
BEGIN PERFORM count(*) FROM public.project_site_access_cards;
  RAISE NOTICE 'anon site_access_cards READ (leak)';
EXCEPTION WHEN others THEN RAISE NOTICE 'anon site_access_cards -> %', SQLERRM; END $$;
DO $$
BEGIN PERFORM count(*) FROM public.project_party_authority;
  RAISE NOTICE 'anon party_authority READ (leak)';
EXCEPTION WHEN others THEN RAISE NOTICE 'anon party_authority -> %', SQLERRM; END $$;
DO $$
BEGIN PERFORM count(*) FROM public.people_directory_seats;
  RAISE NOTICE 'anon directory_seats READ (leak)';
EXCEPTION WHEN others THEN RAISE NOTICE 'anon directory_seats -> %', SQLERRM; END $$;
DO $$
BEGIN PERFORM count(*) FROM public.v_access_grants;
  RAISE NOTICE 'anon access_grants READ (leak)';
EXCEPTION WHEN others THEN RAISE NOTICE 'anon access_grants -> %', SQLERRM; END $$;
DO $$
DECLARE n bigint;
BEGIN SELECT count(*) INTO n FROM public.people_directory;
  RAISE NOTICE 'anon people_directory READ % rows (leak)', n;
EXCEPTION WHEN others THEN RAISE NOTICE 'anon people_directory -> %', SQLERRM; END $$;
ROLLBACK;
