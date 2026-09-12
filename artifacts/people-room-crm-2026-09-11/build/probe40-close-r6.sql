-- ═══════════════════════════════════════════════════════════════════════════
-- close-out review r6 (migrations) — my own probes.
-- Objects, access, and ONE rolled-back fixture. Never the shipped ledger.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
VALUES
  ('a6000000-0000-4000-8000-000000000001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','r6-dee@test.invalid','x',NOW(),NOW(),NOW()),
  ('a6000000-0000-4000-8000-000000000002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','r6-eve@test.invalid','x',NOW(),NOW(),NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, full_name, created_at, updated_at) VALUES
  ('a6000000-0000-4000-8000-000000000001','r6-dee@test.invalid','Dee',NOW(),NOW()),
  ('a6000000-0000-4000-8000-000000000002','r6-eve@test.invalid','Eve',NOW(),NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug, status, created_at, updated_at) VALUES
  ('b6000000-0000-4000-8000-000000000011','design_studio','R6 Studio X','r6-studio-x','active',NOW(),NOW()),
  ('b6000000-0000-4000-8000-000000000022','design_studio','R6 Studio Y','r6-studio-y','active',NOW(),NOW());

-- Dee belongs to BOTH X and Y (the ordinary two-studio designer). Eve only to Y.
INSERT INTO organization_members (user_id, organization_id, role, status, joined_at, created_at, updated_at) VALUES
  ('a6000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000011','owner','active',NOW()-interval '2 y',NOW(),NOW()),
  ('a6000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000022','owner','active',NOW()-interval '1 y',NOW(),NOW()),
  ('a6000000-0000-4000-8000-000000000002','b6000000-0000-4000-8000-000000000022','member','active',NOW(),NOW(),NOW());

INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at) VALUES
  ('d6000000-0000-4000-8000-000000000011','R6 X job','a6000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000011','a6000000-0000-4000-8000-000000000001','active',NOW(),NOW()),
  ('d6000000-0000-4000-8000-000000000022','R6 X job two','a6000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000011','a6000000-0000-4000-8000-000000000001','active',NOW(),NOW());

-- P1 seat: a PRE-FOLD refusal on the seat  (+16125550701)
-- P2 seat: a PRE-FOLD grant on the seat    (+16125550702)
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
    sms_consent_status, sms_consented_at, sms_opt_out_at, sms_consent_source,
    sms_consent_evidence, sms_consent_recorded_at, sms_consent_disclosure_version) VALUES
  ('e6000000-0000-4000-8000-000000000701','d6000000-0000-4000-8000-000000000011','sub','Pete Rusk','6125550701',
   'opted_out', NULL, '2025-12-03T00:00:00Z','inbound_sms','Replied STOP','2025-12-03T00:00:00Z','field-sms-v1'),
  ('e6000000-0000-4000-8000-000000000702','d6000000-0000-4000-8000-000000000022','sub','Dana Kowalski','6125550702',
   'granted','2026-01-02T00:00:00Z',NULL,'written','Kickoff form','2026-01-02T00:00:00Z','field-sms-v1');

-- Fold them in, exactly as 00594 does on first deploy (idempotent).
SELECT public.backfill_channel_consent_from_parties();

DO $$
DECLARE w TEXT; st TEXT; ru BOOLEAN; seatref BOOLEAN;
BEGIN
  SELECT status, refusal_unanswered INTO st, ru FROM studio_channel_consent
   WHERE organization_id='b6000000-0000-4000-8000-000000000011' AND channel_kind='sms' AND channel_value='+16125550701';
  RAISE NOTICE 'P1 fold  : record = %/% (expect opted_out/t)', st, ru;
  SELECT status, refusal_unanswered INTO st, ru FROM studio_channel_consent
   WHERE organization_id='b6000000-0000-4000-8000-000000000011' AND channel_kind='sms' AND channel_value='+16125550702';
  RAISE NOTICE 'P2 fold  : record = %/% (expect granted/f)', st, ru;
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- P1. THE RECIPIENT TEXTS START. The rail's writeChannelConsent() upsert,
--     verbatim in effect: status granted, refusal_unanswered false, fresh
--     consented_at, opt_out_* carried forward. The SEAT stays frozen.
-- ───────────────────────────────────────────────────────────────────────────
UPDATE studio_channel_consent
   SET status='granted', refusal_unanswered=false, consented_at=now(),
       source='inbound_sms', evidence='Inbound START', recorded_at=now()
 WHERE organization_id='b6000000-0000-4000-8000-000000000011'
   AND channel_kind='sms' AND channel_value='+16125550701';

DO $$
DECLARE fnword TEXT; rosterword TEXT; dirword TEXT; seatstatus TEXT; seatrefusal BOOLEAN; awaiting INT;
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub','a6000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  fnword := public.channel_consent_status('b6000000-0000-4000-8000-000000000011','sms','+16125550701');
  SELECT sms_consent_status INTO rosterword FROM v_project_roster WHERE roster_id='e6000000-0000-4000-8000-000000000701';
  SELECT status_raw INTO dirword FROM people_directory WHERE person_id='e6000000-0000-4000-8000-000000000701';

  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);

  SELECT sms_consent_status INTO seatstatus FROM project_parties WHERE id='e6000000-0000-4000-8000-000000000701';
  -- orgHasOptedOutParty(phone, org) in SQL: the send gate's seat leg (PR-x / R-AL)
  SELECT EXISTS (SELECT 1 FROM project_parties pp JOIN projects p ON p.id=pp.project_id
                  WHERE pp.phone_e164='+16125550701' AND pp.sms_consent_status='opted_out'
                    AND COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))='b6000000-0000-4000-8000-000000000011')
    INTO seatrefusal;

  RAISE NOTICE '';
  RAISE NOTICE '=== P1: a pre-fold refused SEAT, the record answered by the recipient''s own START ===';
  RAISE NOTICE 'P1a channel_consent_status()      = %   (the one reader)', fnword;
  RAISE NOTICE 'P1b v_project_roster word         = %   -> Call Sheet prints "Texting"', rosterword;
  RAISE NOTICE 'P1c people_directory status_raw   = %   -> Directory prints "Texting"', dirword;
  RAISE NOTICE 'P1d frozen seat still says        = %', seatstatus;
  RAISE NOTICE 'P1e send gate seat leg refuses?   = %   (orgHasOptedOutParty -> sendPartySms "opted_out")', seatrefusal;
  RAISE NOTICE 'P1f record_channel_consent door   = refused (channel_opted_out), proved below';
END $$;

-- P1g: and the WRITE door still refuses, so the studio cannot even correct the word.
DO $$
DECLARE raised TEXT := NULL;
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub','a6000000-0000-4000-8000-000000000001','role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.record_channel_consent('b6000000-0000-4000-8000-000000000011','sms','+16125550701','granted','written','fresh form','field-sms-v1',NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true);
  RAISE NOTICE 'P1g record_channel_consent(granted) -> %', COALESCE(raised,'(landed)');
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- P2. THE PROJECT IS RE-ATTRIBUTED to the designer's other studio, AFTER a
--     STOP that R-AS recorded only on the record. The seat is frozen at
--     `granted`, so nothing carries the refusal to the new org.
-- ───────────────────────────────────────────────────────────────────────────
-- the rail's STOP, verbatim in effect (writeChannelConsent, status opted_out)
UPDATE studio_channel_consent
   SET status='opted_out', refusal_unanswered=true, opt_out_at=now(),
       opt_out_source='inbound_sms', opt_out_evidence='Inbound STOP', opt_out_recorded_at=now()
 WHERE organization_id='b6000000-0000-4000-8000-000000000011'
   AND channel_kind='sms' AND channel_value='+16125550702';

DO $$
DECLARE orgbefore UUID; orgafter UUID; wbefore TEXT; wafter TEXT; seatstatus TEXT; seatrefusal_new BOOLEAN; moved BOOLEAN := false; raised TEXT;
BEGIN
  orgbefore := public.project_consent_org('d6000000-0000-4000-8000-000000000022');
  wbefore   := public.channel_consent_status(orgbefore,'sms','+16125550702');

  -- the move, as an ordinary authenticated co-member through PostgREST's own
  -- UPDATE policy (projects_studio_update = is_studio_comember(designer_id));
  -- 00317's guard allows it because Dee belongs to Y.
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub','a6000000-0000-4000-8000-000000000002','role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    UPDATE projects SET studio_id='b6000000-0000-4000-8000-000000000022' WHERE id='d6000000-0000-4000-8000-000000000022';
    moved := true;
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true);

  orgafter := public.project_consent_org('d6000000-0000-4000-8000-000000000022');
  wafter   := public.channel_consent_status(orgafter,'sms','+16125550702');
  SELECT sms_consent_status INTO seatstatus FROM project_parties WHERE id='e6000000-0000-4000-8000-000000000702';
  SELECT EXISTS (SELECT 1 FROM project_parties pp JOIN projects p ON p.id=pp.project_id
                  WHERE pp.phone_e164='+16125550702' AND pp.sms_consent_status='opted_out'
                    AND COALESCE(p.studio_id, public._primary_studio_for(p.designer_id))=orgafter)
    INTO seatrefusal_new;

  RAISE NOTICE '';
  RAISE NOTICE '=== P2: the same job moved to the designer''s other studio after a STOP ===';
  RAISE NOTICE 'P2a move by a plain co-member (Eve, member of Y only) = %  %', moved, COALESCE('('||raised||')','');
  RAISE NOTICE 'P2b project_consent_org  before=%  after=%', orgbefore, orgafter;
  RAISE NOTICE 'P2c the studio verdict   before=%  after=%   (NULL = no record for the new org)', COALESCE(wbefore,'NULL'), COALESCE(wafter,'NULL');
  RAISE NOTICE 'P2d frozen seat still says = %  -> sendPartySms legacy leg treats it as consent', seatstatus;
  RAISE NOTICE 'P2e new org has an opted_out SEAT to fail closed on? = %', seatrefusal_new;
  RAISE NOTICE 'P2f the refusal still exists, under the OLD org only: %',
    (SELECT status||'/'||refusal_unanswered FROM studio_channel_consent
      WHERE organization_id='b6000000-0000-4000-8000-000000000011' AND channel_kind='sms' AND channel_value='+16125550702');
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- P3. cross-tenant: can Eve (Y only) read or write X's verdict?
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE w TEXT; n INT; raised TEXT;
BEGIN
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub','a6000000-0000-4000-8000-000000000002','role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  w := public.channel_consent_status('b6000000-0000-4000-8000-000000000011','sms','+16125550701');
  SELECT count(*) INTO n FROM studio_channel_consent WHERE organization_id='b6000000-0000-4000-8000-000000000011';
  RAISE NOTICE '';
  RAISE NOTICE '=== P3: cross-tenant ===';
  RAISE NOTICE 'P3a Eve reading X''s verdict through channel_consent_status = %', COALESCE(w,'NULL');
  RAISE NOTICE 'P3b Eve''s row count on X''s records                        = %', n;
  raised := NULL;
  BEGIN PERFORM public.record_channel_consent('b6000000-0000-4000-8000-000000000011','sms','+16125550777','granted','written','x','v1',NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'P3c Eve writing X''s record                               = %', COALESCE(raised,'LANDED');
  raised := NULL;
  BEGIN INSERT INTO studio_channel_consent (organization_id, channel_kind, channel_value, status)
        VALUES ('b6000000-0000-4000-8000-000000000011','sms','+16125550888','granted');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'P3d Eve direct INSERT on the table                        = %', COALESCE(raised,'LANDED');
  -- Eve can see X's roster row (is_studio_comember(Dee) is true through Y) —
  -- what word does she get for a number X has REFUSED?
  SELECT sms_consent_status INTO w FROM v_project_roster WHERE roster_id='e6000000-0000-4000-8000-000000000701';
  SELECT count(*) INTO n FROM v_project_roster WHERE roster_id='e6000000-0000-4000-8000-000000000701';
  RAISE NOTICE 'P3e Eve sees X''s roster row? rows=%   word=%', n, COALESCE(w,'NULL');
  EXECUTE 'RESET ROLE'; PERFORM set_config('request.jwt.claims', NULL, true);
END $$;

-- ───────────────────────────────────────────────────────────────────────────
-- P4. the freeze, spot-checked on the shapes the room actually writes
-- ───────────────────────────────────────────────────────────────────────────
DO $$
DECLARE raised TEXT; n INT;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== P4: the freeze ===';
  FOREACH raised IN ARRAY ARRAY['x'] LOOP END LOOP;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
DECLARE raised TEXT;
BEGIN
  raised := NULL;
  BEGIN UPDATE project_parties SET sms_consent_status='granted' WHERE id='e6000000-0000-4000-8000-000000000701';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'P4a UPDATE sms_consent_status                  -> %', COALESCE(raised,'LANDED');
  raised := NULL;
  BEGIN UPDATE project_parties SET phone='612-555-0999' WHERE id='e6000000-0000-4000-8000-000000000701';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'P4b phone-only UPDATE on the opted_out seat    -> %', COALESCE(raised,'LANDED');
  raised := NULL;
  BEGIN UPDATE project_parties SET display_name='Pete R.' WHERE id='e6000000-0000-4000-8000-000000000701';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'P4c unrelated UPDATE on the opted_out seat     -> %', COALESCE(raised,'LANDED');
  raised := NULL;
  BEGIN DELETE FROM project_parties WHERE id='e6000000-0000-4000-8000-000000000701';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'P4d DELETE of the opted_out seat               -> %  (the freeze is UPDATE-only)', COALESCE(raised,'LANDED');
  raised := NULL;
  BEGIN INSERT INTO project_parties (project_id, party_kind, display_name, phone, sms_consent_status)
        VALUES ('d6000000-0000-4000-8000-000000000011','sub','Ghost','6125550701','granted');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  RAISE NOTICE 'P4e INSERT a seat straight at `granted`        -> %  (the freeze is UPDATE-only)', COALESCE(raised,'LANDED');
END $$;

ROLLBACK;
