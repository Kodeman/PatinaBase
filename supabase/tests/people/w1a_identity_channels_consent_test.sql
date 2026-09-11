-- ═══════════════════════════════════════════════════════════════════════════
-- People room CRM · W1a — identity, channels, consent (00592 / 00593 / 00594)
--
-- Covers:
--   1. studio_person_affiliations: a studio member may write one; a stranger
--      cannot see or write it; a cross-studio pair is refused by WITH CHECK.
--   2. studio_contact_channels: value normalisation — phones to E.164, emails
--      lowercased and trimmed.
--   3. studio_channel_consent backfill precedence, PER STUDIO: opted_out beats
--      everything inside one studio, and one studio's STOP never reaches
--      another studio holding the same number.
--   4. The mirror trigger writes the studio's verdict back onto every party row
--      in that studio on that number — and onto no other studio's.
--   5. record_channel_consent() refuses a non-member, and authenticated holds
--      no direct INSERT on the consent table (the RPC is the only door).
--
-- How to run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/people/w1a_identity_channels_consent_test.sql
--
-- Wrapped in one transaction and ROLLBACKed, so it is re-runnable.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('a0000000-0000-4000-8000-000000000001', 'w1a-alice@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a0000000-0000-4000-8000-000000000002', 'w1a-bob@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('a0000000-0000-4000-8000-000000000003', 'w1a-carol@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('a0000000-0000-4000-8000-000000000001', 'w1a-alice@test.invalid', 'Alice', NOW(), NOW()),
  ('a0000000-0000-4000-8000-000000000002', 'w1a-bob@test.invalid',   'Bob',   NOW(), NOW()),
  ('a0000000-0000-4000-8000-000000000003', 'w1a-carol@test.invalid', 'Carol', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Two studios that will end up holding the SAME phone number.
INSERT INTO organizations (id, type, name, slug, status, created_at, updated_at)
VALUES
  ('b0000000-0000-4000-8000-00000000000a', 'design_studio', 'W1A Studio Alpha', 'w1a-studio-alpha', 'active', NOW(), NOW()),
  ('b0000000-0000-4000-8000-00000000000b', 'design_studio', 'W1A Studio Beta',  'w1a-studio-beta',  'active', NOW(), NOW());

INSERT INTO organization_members (user_id, organization_id, role, status, joined_at, created_at, updated_at)
VALUES
  ('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000a', 'owner', 'active', NOW(), NOW(), NOW()),
  ('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-00000000000b', 'owner', 'active', NOW(), NOW(), NOW());

-- Rolodex cards. Alpha: one person, one company. Beta: one company.
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, company_name, created_by)
VALUES
  ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000a', 'person',  'sub', 'Dana Kowalski', NULL, 'a0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-00000000000a', 'company', 'sub', NULL, 'Northgate Electric', 'a0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-00000000000b', 'company', 'sub', NULL, 'Beta Electric', 'a0000000-0000-4000-8000-000000000002');

-- One project per studio, each with its studio_id pinned.
INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at)
VALUES
  ('d0000000-0000-4000-8000-00000000000a', 'W1A Okonkwo residence', 'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000a', 'a0000000-0000-4000-8000-000000000001', 'active', NOW(), NOW()),
  ('d0000000-0000-4000-8000-00000000000b', 'W1A Beta job',          'a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-00000000000b', 'a0000000-0000-4000-8000-000000000002', 'active', NOW(), NOW());

-- Party rows. The SHARED number +16125550142 is held by both studios.
--   Alpha: one granted row (newer) and one opted_out row (older)  → opted_out wins
--   Beta : one not_asked row on the same number                   → stays not_asked
-- A second Alpha number +16125550199 has two granted rows → the NEWER evidence wins.
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_consented_at, sms_opt_out_at,
                             sms_consent_source, sms_consent_evidence,
                             sms_consent_recorded_at, sms_consent_disclosure_version)
VALUES
  ('e0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Dana Kowalski', '(612) 555-0142',
   'granted', '2026-01-02T00:00:00Z', NULL, 'written', 'Okonkwo kickoff form', '2026-01-02T00:00:00Z', 'field-sms-v1'),
  ('e0000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Dana Kowalski', '612-555-0142',
   'opted_out', NULL, '2025-12-03T00:00:00Z', 'inbound_sms', 'Replied STOP on the Lindqvist thread', '2025-12-03T00:00:00Z', 'field-sms-v1'),
  ('e0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-00000000000b', 'sub', 'Dana Kowalski', '+16125550142',
   'not_asked', NULL, NULL, NULL, NULL, NULL, NULL),
  ('e0000000-0000-4000-8000-000000000004', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Pete Rusk', '6125550199',
   'granted', '2025-01-01T00:00:00Z', NULL, 'verbal', 'older grant', '2025-01-01T00:00:00Z', 'field-sms-v1'),
  ('e0000000-0000-4000-8000-000000000005', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Pete Rusk', '612 555 0199',
   'granted', '2026-02-02T00:00:00Z', NULL, 'written', 'newer grant', '2026-02-02T00:00:00Z', 'field-sms-v1');

-- ─── helpers ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text,
    true
  );
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ─── 1. Affiliations: RLS ──────────────────────────────────────────────────

DO $$
DECLARE
  n INTEGER;
  raised TEXT;
BEGIN
  -- 1a. A member of Alpha writes an affiliation between two Alpha cards.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  INSERT INTO studio_person_affiliations
    (id, person_id, company_id, role_at_firm, is_paperwork_contact, holds_trade_license, from_date)
  VALUES
    ('f0000000-0000-4000-8000-000000000001',
     'c0000000-0000-4000-8000-000000000001',
     'c0000000-0000-4000-8000-000000000002',
     'owner', true, true, DATE '2025-03-01');
  SELECT COUNT(*) INTO n FROM studio_person_affiliations
   WHERE id = 'f0000000-0000-4000-8000-000000000001';
  ASSERT n = 1, 'FAIL 1a: Alpha member should write + read the affiliation, got ' || n;

  -- 1b. A cross-studio pair is refused by WITH CHECK (Alpha person, Beta firm).
  raised := NULL;
  BEGIN
    INSERT INTO studio_person_affiliations (person_id, company_id, role_at_firm)
    VALUES ('c0000000-0000-4000-8000-000000000001',
            'c0000000-0000-4000-8000-000000000003', 'rep');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    raised := SQLSTATE;
  END;
  ASSERT raised IS NOT NULL,
    'FAIL 1b: an Alpha person affiliated to a Beta firm must be refused';
  PERFORM pg_temp.reset_role();

  -- 1c. A member of Beta sees none of it.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000002');
  SELECT COUNT(*) INTO n FROM studio_person_affiliations;
  ASSERT n = 0, 'FAIL 1c: a stranger studio must see no affiliation, got ' || n;

  -- 1d. ...and cannot write one over Alpha's cards.
  raised := NULL;
  BEGIN
    INSERT INTO studio_person_affiliations (person_id, company_id, role_at_firm)
    VALUES ('c0000000-0000-4000-8000-000000000001',
            'c0000000-0000-4000-8000-000000000002', 'rep');
  EXCEPTION WHEN insufficient_privilege OR check_violation THEN
    raised := SQLSTATE;
  END;
  ASSERT raised IS NOT NULL,
    'FAIL 1d: a stranger studio must not write an affiliation over another book''s cards';
  PERFORM pg_temp.reset_role();

  RAISE NOTICE '1. affiliations + RLS: passed';
END
$$;

-- ─── 2. Channel normalisation ──────────────────────────────────────────────

DO $$
DECLARE
  v TEXT;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  INSERT INTO studio_contact_channels (id, owner_type, owner_id, channel_kind, value, sms_capable)
  VALUES ('f1000000-0000-4000-8000-000000000001', 'person',
          'c0000000-0000-4000-8000-000000000001', 'mobile', '(612) 555-0142', true);
  SELECT value INTO v FROM studio_contact_channels WHERE id = 'f1000000-0000-4000-8000-000000000001';
  ASSERT v = '+16125550142', 'FAIL 2a: mobile should normalise to E.164, got ' || COALESCE(v, '<null>');

  INSERT INTO studio_contact_channels (id, owner_type, owner_id, channel_kind, value)
  VALUES ('f1000000-0000-4000-8000-000000000002', 'company',
          'c0000000-0000-4000-8000-000000000002', 'office', '612.555.0100');
  SELECT value INTO v FROM studio_contact_channels WHERE id = 'f1000000-0000-4000-8000-000000000002';
  ASSERT v = '+16125550100', 'FAIL 2b: office line should normalise to E.164, got ' || COALESCE(v, '<null>');

  INSERT INTO studio_contact_channels (id, owner_type, owner_id, channel_kind, value)
  VALUES ('f1000000-0000-4000-8000-000000000003', 'person',
          'c0000000-0000-4000-8000-000000000001', 'email', '  Rosa@Example.COM ');
  SELECT value INTO v FROM studio_contact_channels WHERE id = 'f1000000-0000-4000-8000-000000000003';
  ASSERT v = 'rosa@example.com', 'FAIL 2c: email should lowercase + trim, got ' || COALESCE(v, '<null>');

  -- An unparseable phone keeps its raw text (the column is NOT NULL, so it can
  -- never become the normaliser's NULL).
  INSERT INTO studio_contact_channels (id, owner_type, owner_id, channel_kind, value)
  VALUES ('f1000000-0000-4000-8000-000000000004', 'person',
          'c0000000-0000-4000-8000-000000000001', 'dispatch', 'ext 411');
  SELECT value INTO v FROM studio_contact_channels WHERE id = 'f1000000-0000-4000-8000-000000000004';
  ASSERT v = 'ext 411', 'FAIL 2d: an unparseable phone should keep its raw text, got ' || COALESCE(v, '<null>');

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '2. channel normalisation: passed';
END
$$;

-- ─── 3. Consent backfill precedence, per studio ────────────────────────────
-- Run as postgres: the fold is a service-role act, never a portal one.

DO $$
DECLARE
  r RECORD;
  n INTEGER;
BEGIN
  PERFORM public.backfill_channel_consent_from_parties();

  -- 3a. Inside Alpha, the STOP beats the newer grant.
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = '+16125550142';
  ASSERT r.status = 'opted_out',
    'FAIL 3a: opted_out must win inside a studio, got ' || COALESCE(r.status, '<none>');
  ASSERT r.opt_out_at = '2025-12-03T00:00:00Z'::timestamptz,
    'FAIL 3a2: the opt-out date should carry, got ' || COALESCE(r.opt_out_at::text, '<null>');
  ASSERT r.origin_project_id = 'd0000000-0000-4000-8000-00000000000a',
    'FAIL 3a3: the origin project should carry';

  -- 3b. Beta holds the SAME number and is untouched by Alpha's STOP.
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000b'
     AND channel_kind = 'sms' AND channel_value = '+16125550142';
  ASSERT r.status = 'not_asked',
    'FAIL 3b: one studio''s STOP must not reach another studio, got ' || COALESCE(r.status, '<none>');

  -- 3c. Two grants on one number in one studio: the most recent one wins.
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = '+16125550199';
  ASSERT r.status = 'granted',
    'FAIL 3c: should be granted, got ' || COALESCE(r.status, '<none>');
  ASSERT r.evidence = 'newer grant',
    'FAIL 3c2: the most recent grant should win, got ' || COALESCE(r.evidence, '<null>');

  -- 3d. One row per (studio, kind, value) — never one per party row.
  SELECT COUNT(*) INTO n FROM studio_channel_consent
   WHERE channel_value IN ('+16125550142', '+16125550199');
  ASSERT n = 3, 'FAIL 3d: expected 3 consent records (Alpha x2, Beta x1), got ' || n;

  -- 3e. Re-running the fold never overwrites a recorded decision.
  UPDATE studio_channel_consent SET status = 'granted', evidence = 'a later decision'
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550142';
  PERFORM public.backfill_channel_consent_from_parties();
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550142';
  ASSERT r.evidence = 'a later decision',
    'FAIL 3e: the fold must be idempotent, got ' || COALESCE(r.evidence, '<null>');

  RAISE NOTICE '3. consent backfill precedence: passed';
END
$$;

-- ─── 4. The mirror + 5. the RPC ────────────────────────────────────────────

DO $$
DECLARE
  n INTEGER;
  raised TEXT;
  v TEXT;
BEGIN
  -- Put Alpha back to opted_out so the mirror's effect is unambiguous. Even
  -- this setup step has to run as a member: the RPC gates on auth.uid(), so a
  -- JWT-less session (here, plain postgres) is refused like anyone else.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550142', 'opted_out',
    'inbound_sms', 'STOP', 'field-sms-v1', 'd0000000-0000-4000-8000-00000000000a');
  PERFORM pg_temp.reset_role();

  -- 4a. Every Alpha party row on that number now reads opted_out.
  SELECT COUNT(*) INTO n FROM project_parties
   WHERE id IN ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002')
     AND sms_consent_status = 'opted_out';
  ASSERT n = 2, 'FAIL 4a: the mirror should opt out both Alpha rows, got ' || n;

  -- 4b. Beta's row on the same number is untouched.
  SELECT sms_consent_status INTO v FROM project_parties
   WHERE id = 'e0000000-0000-4000-8000-000000000003';
  ASSERT v = 'not_asked',
    'FAIL 4b: the mirror must not cross studios, Beta row reads ' || COALESCE(v, '<null>');

  -- 4c. A studio member records a fresh grant through the RPC, passing the
  --     number as typed; the RPC normalises it onto the same record.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '(612) 555-0142', 'granted',
    'written', 'Fresh written consent', 'field-sms-v1',
    'd0000000-0000-4000-8000-00000000000a');
  PERFORM pg_temp.reset_role();

  SELECT COUNT(*) INTO n FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = '+16125550142';
  ASSERT n = 1, 'FAIL 4c: the RPC must normalise onto the existing record, got ' || n;

  SELECT COUNT(*) INTO n FROM project_parties
   WHERE id IN ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002')
     AND sms_consent_status = 'granted';
  ASSERT n = 2, 'FAIL 4d: the mirror should re-grant both Alpha rows, got ' || n;

  -- 4e. The earlier opt-out date survives the new grant.
  SELECT opt_out_at::text INTO v FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550142';
  ASSERT v IS NOT NULL, 'FAIL 4e: the opt-out date should survive a later grant';

  -- 5a. A member of another studio cannot record consent for Alpha.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000002');
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550142', 'granted',
      'verbal', 'not mine to give', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN
    raised := SQLERRM;
  END;
  ASSERT raised = 'not_a_studio_member',
    'FAIL 5a: a non-member must be refused, got ' || COALESCE(raised, '<no error>');

  -- 5b. A user in no studio at all is refused too.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000003');
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550142', 'granted',
      'verbal', 'no studio', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN
    raised := SQLERRM;
  END;
  ASSERT raised = 'not_a_studio_member',
    'FAIL 5b: a studio-less user must be refused, got ' || COALESCE(raised, '<no error>');

  -- 5c. The RPC is the ONLY door: authenticated holds no INSERT privilege.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  raised := NULL;
  BEGIN
    INSERT INTO studio_channel_consent (organization_id, channel_kind, channel_value, status)
    VALUES ('b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550777', 'granted');
  EXCEPTION WHEN insufficient_privilege THEN
    raised := SQLSTATE;
  END;
  ASSERT raised = '42501',
    'FAIL 5c: authenticated must hold no direct INSERT on studio_channel_consent, got ' || COALESCE(raised, '<none>');

  -- 5d. ...but a member can still READ their studio's records, and only theirs.
  SELECT COUNT(*) INTO n FROM studio_channel_consent;
  ASSERT n = 2,
    'FAIL 5d: an Alpha member should read Alpha''s two records only, got ' || n;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE '4. mirror + 5. record_channel_consent: passed';
  RAISE NOTICE 'All W1a assertions passed.';
END
$$;

ROLLBACK;
