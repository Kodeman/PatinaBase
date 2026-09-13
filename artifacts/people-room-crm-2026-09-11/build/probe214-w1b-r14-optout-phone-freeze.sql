-- W1b r14 BLOCKING-1 — does the opted_out phone freeze (R-AX) still fire under
-- R-AY's record-only consent? Walked as the studio's own owner, on an UNCARDED
-- identity, whose Directory row is keyed on the phone number itself.
\pset pager off
BEGIN;

\set org  '''b0000000-0000-0000-0000-000000000001'''
\set d    '''a0000000-0000-0000-0000-000000000004'''

CREATE TEMP TABLE p214 AS SELECT
  (SELECT id FROM public.projects
    WHERE studio_id = :org::uuid AND name = 'Okonkwo residence') AS proj,
  gen_random_uuid() AS seat;
GRANT SELECT ON p214 TO authenticated;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', :d, 'role','authenticated')::text, true);

\echo '--- 1. a real, recorded opt-out for a fresh number ---'
SELECT public.record_channel_consent(:org::uuid, 'sms', '+15005550001',
       'opted_out', 'inbound_sms', 'STOP reply', NULL, NULL) IS NOT NULL AS recorded;

\echo '--- 2. an UNCARDED seat carrying that number ---'
INSERT INTO public.project_parties(id, project_id, party_kind, display_name, phone, studio_contact_id)
SELECT seat, proj, 'sub', 'P214 Uncarded Sub', '(500) 555-0001', NULL FROM p214;

SELECT pp.id, pp.phone_e164, pp.sms_consent_status AS legacy_column,
       public.channel_consent_status(:org::uuid,'sms',pp.phone_e164) AS the_record
  FROM public.project_parties pp JOIN p214 ON pp.id = p214.seat;

\echo '--- 3. BEFORE: what the room says ---'
SELECT display_name, phone, consent_status, reach_state
  FROM public.people_directory WHERE display_name = 'P214 Uncarded Sub';

\echo '--- 4. move the number (the exploit shape: phone only) ---'
DO $$
DECLARE raised TEXT; s uuid;
BEGIN
  SELECT seat INTO s FROM p214;
  BEGIN
    UPDATE public.project_parties
       SET phone = '(500) 555-9999' WHERE id = s;
    RAISE NOTICE 'PHONE MOVE SUCCEEDED — the freeze did not fire';
  EXCEPTION WHEN OTHERS THEN
    raised := SQLERRM;
    RAISE NOTICE 'REFUSED: %', raised;
  END;
END $$;

\echo '--- 5. AFTER: what the room says now ---'
SELECT display_name, phone, consent_status, reach_state
  FROM public.people_directory WHERE display_name = 'P214 Uncarded Sub';

\echo '--- 6. the record for the old number is still on the books ---'
SELECT channel_value, status FROM public.studio_channel_consent
 WHERE organization_id = :org::uuid AND channel_value IN ('+15005550001','+15005559999');

\echo '--- 7. control: a CARDED, granted seat''s number still moves freely ---'
DO $$
DECLARE raised TEXT; s uuid; p uuid;
BEGIN
  SELECT proj INTO p FROM p214;
  INSERT INTO public.project_parties(project_id, party_kind, display_name, phone)
  VALUES (p, 'sub', 'P214 Movable Sub', '(500) 555-0777') RETURNING id INTO s;
  BEGIN
    UPDATE public.project_parties SET phone = '(500) 555-0778' WHERE id = s;
    RAISE NOTICE 'CONTROL: an unrefused seat''s number still moves';
  EXCEPTION WHEN OTHERS THEN
    raised := SQLERRM;
    RAISE NOTICE 'CONTROL REGRESSED: %', raised;
  END;
END $$;

ROLLBACK;
