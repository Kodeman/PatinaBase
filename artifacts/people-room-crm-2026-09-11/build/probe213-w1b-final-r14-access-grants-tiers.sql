-- W1b final review r14 — v_access_grants tier by tier, three callers.
--   · the seeded studio's own OWNER (designer@patina.dev, Local Dev Studio)
--   · an UNRELATED studio owner (cf-phase1-alice, Phase One Synthetic Studio)
--   · anon
\pset pager off
\echo '=== the studio owner ==='
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
SELECT tier, count(*) FROM public.v_access_grants GROUP BY 1 ORDER BY 1;
\echo '--- any bearer-credential-shaped grant_id? (expect 0) ---'
SELECT count(*) AS hexish FROM public.v_access_grants WHERE split_part(grant_id,':',2) ~ '^[0-9a-f]{64}$';
ROLLBACK;

\echo '=== an unrelated studio owner ==='
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"sub":"cf100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
SELECT tier, count(*) FROM public.v_access_grants GROUP BY 1 ORDER BY 1;
\echo '--- and every new object of the wave, for the same caller ---'
SELECT (SELECT count(*) FROM public.studio_compliance_documents)              AS compliance_docs,
       (SELECT count(*) FROM public.project_party_authority)                  AS authority,
       (SELECT count(*) FROM public.project_site_access_cards)                AS site_cards,
       (SELECT count(*) FROM public.people_directory_seats)                   AS seats,
       (SELECT count(*) FROM public.people_directory)                         AS directory;
\echo '--- the four definer readers, called directly ---'
SELECT (SELECT count(*) FROM public.access_grants_trade_rfq())               AS rfq,
       (SELECT count(*) FROM public.access_grants_trade_agreement_links())   AS agr,
       (SELECT count(*) FROM public.access_grants_plan_transmittals())       AS plan,
       (SELECT count(*) FROM public.access_grants_invoice_links())           AS inv;
\echo '--- naming their OWN org but a FOREIGN identity key: numbers, word, dates ---'
SELECT (SELECT count(*) FROM public.identity_phone_numbers(
          'cf120000-0000-4000-8000-000000000001'::uuid,
          (SELECT id::text FROM public.studio_contacts
            WHERE organization_id='b0000000-0000-0000-0000-000000000001'
              AND phone_e164='+16125550112' LIMIT 1), NULL))                 AS foreign_numbers,
       public.identity_consent_status('cf120000-0000-4000-8000-000000000001'::uuid,
          (SELECT id::text FROM public.studio_contacts
            WHERE organization_id='b0000000-0000-0000-0000-000000000001'
              AND phone_e164='+16125550112' LIMIT 1), '+16125550112')        AS foreign_word,
       (SELECT count(*) FROM public.identity_consent_evidence(
          'cf120000-0000-4000-8000-000000000001'::uuid,
          (SELECT id::text FROM public.studio_contacts
            WHERE organization_id='b0000000-0000-0000-0000-000000000001'
              AND phone_e164='+16125550112' LIMIT 1), '+16125550112'))       AS foreign_dates,
       public.compliance_state((SELECT id FROM public.studio_contacts
            WHERE organization_id='b0000000-0000-0000-0000-000000000001'
              AND company_name='Northgate Electric' LIMIT 1))                AS foreign_paper;
ROLLBACK;

\echo '=== anon on v_access_grants and the seats view ==='
BEGIN;
SET LOCAL ROLE anon;
SAVEPOINT a;
SELECT count(*) FROM public.v_access_grants;
ROLLBACK TO a;
SELECT count(*) FROM public.people_directory_seats;
ROLLBACK;
