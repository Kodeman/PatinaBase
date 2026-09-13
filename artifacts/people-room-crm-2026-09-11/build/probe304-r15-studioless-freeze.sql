\pset pager off
BEGIN;
SET LOCAL role postgres;
\echo '=== the studio-less population, and who project_consent_org guesses ==='
SELECT pj.id, pj.name, pj.studio_id, pj.designer_id,
       public.project_consent_org(pj.id) AS consent_org,
       (SELECT count(*) FROM public.project_parties pp WHERE pp.project_id=pj.id) AS seats
  FROM public.projects pj WHERE pj.studio_id IS NULL ORDER BY pj.name;

\echo ''
\echo '=== seat an UNCARDED human on a studio-less job, on a number Local Dev Studio has refused ==='
-- pick one studio-less project of designer@patina.dev
CREATE TEMP TABLE tgt AS
  SELECT pj.id AS project_id FROM public.projects pj
   WHERE pj.studio_id IS NULL AND pj.designer_id='a0000000-0000-0000-0000-000000000004'
   ORDER BY pj.name LIMIT 1;
SELECT * FROM tgt;

INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone, phone_e164)
SELECT 'ffff0000-0000-4000-8000-000000000001', project_id, 'sub', 'P304 Uncarded Sub',
       '(612) 555-0112', '+16125550112' FROM tgt;

SELECT pp.id, pp.phone_e164, pp.studio_contact_id, pp.sms_consent_status AS legacy_column,
       public.channel_consent_status('b0000000-0000-0000-0000-000000000001','sms','+16125550112') AS working_studio_record,
       public.channel_consent_status(public.project_consent_org(pp.project_id),'sms','+16125550112') AS guessed_studio_record
  FROM public.project_parties pp WHERE pp.id='ffff0000-0000-4000-8000-000000000001';

\echo ''
\echo '-- the exploit shape: an ordinary member moves the number (phone only) --'
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
DO $$
BEGIN
  UPDATE public.project_parties SET phone='(612) 555-9999'
   WHERE id='ffff0000-0000-4000-8000-000000000001';
  RAISE NOTICE 'PHONE MOVE SUCCEEDED — the freeze did not fire';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'REFUSED: %', SQLERRM;
END $$;

SET LOCAL role postgres;
SELECT pp.phone_e164 AS number_now FROM public.project_parties pp
 WHERE pp.id='ffff0000-0000-4000-8000-000000000001';

\echo ''
\echo '-- control: the SAME seat on a project that RECORDS Local Dev Studio --'
INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone, phone_e164)
SELECT 'ffff0000-0000-4000-8000-000000000002', pj.id, 'sub', 'P304 Control Sub',
       '(612) 555-0112', '+16125550112'
  FROM public.projects pj WHERE pj.studio_id='b0000000-0000-0000-0000-000000000001'
 ORDER BY pj.name LIMIT 1;
SET LOCAL role authenticated;
SET LOCAL request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-000000000004","role":"authenticated"}';
DO $$
BEGIN
  UPDATE public.project_parties SET phone='(612) 555-9999'
   WHERE id='ffff0000-0000-4000-8000-000000000002';
  RAISE NOTICE 'CONTROL: PHONE MOVE SUCCEEDED';
EXCEPTION WHEN others THEN
  RAISE NOTICE 'CONTROL REFUSED: %', SQLERRM;
END $$;
ROLLBACK;
