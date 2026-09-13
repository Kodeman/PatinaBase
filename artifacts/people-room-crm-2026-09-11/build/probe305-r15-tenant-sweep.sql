\pset pager off
\echo '################ A. an UNRELATED studio owner (cf-phase1-alice) ################'
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"cf100000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT 'compliance_docs' o, count(*) FROM public.studio_compliance_documents
UNION ALL SELECT 'authority', count(*) FROM public.project_party_authority
UNION ALL SELECT 'site_cards', count(*) FROM public.project_site_access_cards
UNION ALL SELECT 'directory_seats', count(*) FROM public.people_directory_seats
UNION ALL SELECT 'directory', count(*) FROM public.people_directory
UNION ALL SELECT 'access_grants', count(*) FROM public.v_access_grants
UNION ALL SELECT 'ag_trade_rfq', count(*) FROM public.access_grants_trade_rfq()
UNION ALL SELECT 'ag_agreement', count(*) FROM public.access_grants_trade_agreement_links()
UNION ALL SELECT 'ag_plan', count(*) FROM public.access_grants_plan_transmittals()
UNION ALL SELECT 'ag_invoice', count(*) FROM public.access_grants_invoice_links();
SELECT tier, count(*) FROM public.v_access_grants GROUP BY 1 ORDER BY 1;
\echo '-- the cross-tenant oracles, asked with a FOREIGN key --'
SELECT 'identity_phone_numbers' AS probe,
       (SELECT count(*) FROM public.identity_phone_numbers(
          'cf120000-0000-4000-8000-000000000001',
          (SELECT id::text FROM public.studio_contacts WHERE organization_id='b0000000-0000-0000-0000-000000000001' AND entity_kind='person' LIMIT 1),
          NULL)) AS n;
SELECT 'compliance_state(foreign card)' AS probe,
       public.compliance_state((SELECT id FROM public.studio_contacts WHERE organization_id='b0000000-0000-0000-0000-000000000001' AND entity_kind='company' AND company_name='Northgate Electric' LIMIT 1)) AS word;
SELECT 'identity_consent_status(their org, their card)' AS probe,
       public.identity_consent_status('b0000000-0000-0000-0000-000000000001',
         (SELECT id::text FROM public.studio_contacts WHERE organization_id='b0000000-0000-0000-0000-000000000001' AND phone_e164='+16125550112' LIMIT 1),
         '+16125550112') AS word;
ROLLBACK;

\echo ''
\echo '################ B. a CLIENT account (client@patina.dev) — PR-w ################'
BEGIN;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000005","role":"authenticated"}';
SELECT 'site_cards' o, count(*) FROM public.project_site_access_cards
UNION ALL SELECT 'authority', count(*) FROM public.project_party_authority
UNION ALL SELECT 'compliance_docs', count(*) FROM public.studio_compliance_documents
UNION ALL SELECT 'directory_seats', count(*) FROM public.people_directory_seats;
ROLLBACK;

\echo ''
\echo '################ C. anon ################'
BEGIN;
SET LOCAL role anon;
DO $$ BEGIN PERFORM 1 FROM public.project_site_access_cards; RAISE NOTICE 'anon read site cards'; EXCEPTION WHEN others THEN RAISE NOTICE 'anon site cards: %', SQLERRM; END $$;
DO $$ BEGIN PERFORM 1 FROM public.people_directory_seats; RAISE NOTICE 'anon read seats'; EXCEPTION WHEN others THEN RAISE NOTICE 'anon seats: %', SQLERRM; END $$;
DO $$ BEGIN PERFORM 1 FROM public.v_access_grants; RAISE NOTICE 'anon read grants'; EXCEPTION WHEN others THEN RAISE NOTICE 'anon grants: %', SQLERRM; END $$;
DO $$ BEGIN PERFORM 1 FROM public.people_directory; RAISE NOTICE 'anon read directory'; EXCEPTION WHEN others THEN RAISE NOTICE 'anon directory: %', SQLERRM; END $$;
DO $$ BEGIN PERFORM 1 FROM public.studio_compliance_documents; RAISE NOTICE 'anon read docs'; EXCEPTION WHEN others THEN RAISE NOTICE 'anon docs: %', SQLERRM; END $$;
ROLLBACK;

\echo ''
\echo '################ D. PR-n: a plain MEMBER vs an ADMIN on project_party_authority ################'
BEGIN;
SET LOCAL role postgres;
INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES ('b0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000007','member','active')
ON CONFLICT DO NOTHING;
CREATE TEMP TABLE seat AS SELECT pp.id FROM public.project_parties pp
  JOIN public.projects pj ON pj.id=pp.project_id
 WHERE pj.studio_id='b0000000-0000-0000-0000-000000000001' LIMIT 1;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000007","role":"authenticated"}';
DO $$ DECLARE s uuid; BEGIN SELECT id INTO s FROM seat;
  BEGIN INSERT INTO public.project_party_authority(engagement_id, scope) VALUES (s,'selections'); RAISE NOTICE 'member selections: LANDED';
  EXCEPTION WHEN others THEN RAISE NOTICE 'member selections: REFUSED %', SQLERRM; END;
  BEGIN INSERT INTO public.project_party_authority(engagement_id, scope, threshold_cents) VALUES (s,'money',250000); RAISE NOTICE 'member money: LANDED';
  EXCEPTION WHEN others THEN RAISE NOTICE 'member money: REFUSED %', SQLERRM; END;
  BEGIN INSERT INTO public.project_party_authority(engagement_id, scope) VALUES (s,'draw_certify'); RAISE NOTICE 'member draw_certify: LANDED';
  EXCEPTION WHEN others THEN RAISE NOTICE 'member draw_certify: REFUSED %', SQLERRM; END;
END $$;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000003","role":"authenticated"}';
DO $$ DECLARE s uuid; BEGIN SELECT id INTO s FROM seat;
  BEGIN INSERT INTO public.project_party_authority(engagement_id, scope, threshold_cents) VALUES (s,'money',250000); RAISE NOTICE 'admin money: LANDED';
  EXCEPTION WHEN others THEN RAISE NOTICE 'admin money: REFUSED %', SQLERRM; END;
  BEGIN INSERT INTO public.project_party_authority(engagement_id, scope) VALUES (s,'draw_certify'); RAISE NOTICE 'admin draw_certify: LANDED';
  EXCEPTION WHEN others THEN RAISE NOTICE 'admin draw_certify: REFUSED %', SQLERRM; END;
END $$;
\echo '-- can the plain member UPDATE the admin-made money grant down? --'
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000007","role":"authenticated"}';
DO $$ DECLARE n int; BEGIN
  UPDATE public.project_party_authority SET threshold_cents = 99999999 WHERE scope='money';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'member UPDATE money rows=%', n;
  UPDATE public.project_party_authority SET scope='selections' WHERE scope='money';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'member rescope money->selections rows=%', n;
  DELETE FROM public.project_party_authority WHERE scope='money';
  GET DIAGNOSTICS n = ROW_COUNT; RAISE NOTICE 'member DELETE money rows=%', n;
EXCEPTION WHEN others THEN RAISE NOTICE 'member write on money: REFUSED %', SQLERRM; END $$;
\echo '-- and can the plain member READ the money grant? --'
SELECT scope, threshold_cents FROM public.project_party_authority ORDER BY scope;
ROLLBACK;
