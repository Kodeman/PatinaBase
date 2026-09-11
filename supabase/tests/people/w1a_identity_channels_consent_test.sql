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
--   6. r1 B1/M1: one recorded `pending` mirrors onto every row in the studio
--      WITHOUT firing 00432's opt-in SMS once per row — while a designer's own
--      write to a party row still dispatches; and a maintenance re-run of the
--      backfill sends nothing either.
--   7. r1 M2/M3/M4: the widened vocabularies — ap_email and portal_311 channel
--      kinds (each normalised by its own rule), a dated `bounced` channel
--      status, and the company kinds the shipped UI already renders plus the
--      AHJ `authority`.
--   8. r2 B-1: a mirrored `granted` fires NEITHER of project_parties' outward
--      AFTER triggers — not the opt-in invite, and not 00374's site-request
--      consent dispatch — while a direct party-row write still fires both.
--   9. r2 B-2: record_channel_consent is a transition gate. Evidence is
--      required, nothing leaves opted_out through it, the evidence set is
--      never carried across a status change, and PR-m's way back is the named
--      record_channel_reconsent().
--  10. r2 M-1: a same-status re-record REFRESHES the mirrored evidence, so a
--      party row can never sit at granted with a NULL evidence set.
--  11. r2 M-3: one normalisation rule — an unparseable phone gets a channel row
--      AND a consent record, on the same key.
--  12. r3 R-AG/R-AI: record_channel_consent refuses `not_asked` outright and no
--      status change empties the evidence set (block 9d); and
--      studio_person_affiliations is the home of person-at-firm while
--      studio_contacts.company_id is a derived pointer the trigger keeps equal
--      (block 12).
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

  -- 4c. The record now says opted_out, so the ordinary door is shut: a studio
  --     member cannot type their way back to granted (r2 B-2).
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '(612) 555-0142', 'granted',
      'written', 'Fresh written consent', 'field-sms-v1',
      'd0000000-0000-4000-8000-00000000000a');
  EXCEPTION WHEN OTHERS THEN
    raised := SQLERRM;
  END;
  ASSERT raised = 'channel_opted_out',
    'FAIL 4c: opted_out -> granted must be refused, got ' || COALESCE(raised, '<no error>');

  -- 4c2. PR-m's named way back: a fresh recorded consent, landing on pending,
  --      normalised onto the SAME record (no second row).
  PERFORM public.record_channel_reconsent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '(612) 555-0142',
    'written', 'Fresh written consent', 'field-sms-v1',
    'd0000000-0000-4000-8000-00000000000a');
  PERFORM pg_temp.reset_role();

  SELECT COUNT(*) INTO n FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = '+16125550142';
  ASSERT n = 1, 'FAIL 4c2: the RPC must normalise onto the existing record, got ' || n;

  SELECT COUNT(*) INTO n FROM project_parties
   WHERE id IN ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002')
     AND sms_consent_status = 'pending'
     AND sms_consent_evidence = 'Fresh written consent';
  ASSERT n = 2, 'FAIL 4d: the mirror should carry the fresh consent onto both Alpha rows, got ' || n;

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
END
$$;

-- ─── 6. B1 regression: one recorded `pending` is ONE consent act, not N texts ─
--
-- mirror_channel_consent_to_parties() writes the studio's verdict, with the
-- whole evidence set, onto every party row in that studio on that number. Each
-- newly-evidenced-`pending` row independently satisfies fc_dispatch_optin_invite
-- (00432), so before the r1 fix one record_channel_consent(...,'pending',...)
-- call sent one real opt-in SMS PER PARTY ROW. 00594 now suppresses the
-- dispatch for the mirror's own UPDATE and only for that.
--
-- Dispatches are observed by standing in for public.invoke_edge_function for the
-- length of this (rolled-back) transaction — the real one calls out over pg_net.

CREATE TABLE public._w1a_dispatch_log (
  id      bigserial PRIMARY KEY,
  fn_name text,
  body    jsonb
);

CREATE OR REPLACE FUNCTION public.invoke_edge_function(fn_name text, body jsonb DEFAULT '{}'::jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $fn$
BEGIN
  INSERT INTO public._w1a_dispatch_log (fn_name, body) VALUES (fn_name, body);
  RETURN 0;
END;
$fn$;

-- Three Alpha seats, one number, nobody asked yet.
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, sms_consent_status)
VALUES
  ('e0000000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Ray Thao', '(612) 555-0143', 'not_asked'),
  ('e0000000-0000-4000-8000-000000000012', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Ray Thao', '612-555-0143',   'not_asked'),
  ('e0000000-0000-4000-8000-000000000013', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Ray Thao', '+1 612 555 0143', 'not_asked');

-- A fourth number for the maintenance re-run of the backfill (M1): one evidenced
-- pending row, one sibling that the fold's mirror will flip.
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_consent_source, sms_consent_evidence,
                             sms_consent_recorded_at, sms_consent_disclosure_version)
VALUES
  ('e0000000-0000-4000-8000-000000000014', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Ray Thao', '612-555-0144',
   'pending', 'written', 'Kickoff form', '2026-03-03T00:00:00Z', 'field-sms-v1'),
  ('e0000000-0000-4000-8000-000000000015', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Ray Thao', '+16125550144',
   'not_asked', NULL, NULL, NULL, NULL);

DO $$
DECLARE
  n INTEGER;
  d INTEGER;
  folded INTEGER;
BEGIN
  -- 6z. Control: the fixture row above that was INSERTed already-evidenced and
  --     already-pending is a real consent act and DID dispatch — proof the
  --     00432 rail is live in this transaction, so a zero below means
  --     suppressed, not absent.
  SELECT COUNT(*) INTO d FROM public._w1a_dispatch_log
   WHERE body->>'templateKey' = 'sms_optin_invite';
  ASSERT d = 1, 'FAIL 6z: the fixture''s evidenced-pending insert should dispatch once, got ' || d;

  -- 6a. One act: a studio member records a pending consent for the number.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '(612) 555-0143', 'pending',
    'written', 'Kickoff form', 'field-sms-v1', 'd0000000-0000-4000-8000-00000000000a');
  PERFORM pg_temp.reset_role();

  -- The mirror still does its job: all three rows are fully evidenced pending.
  SELECT COUNT(*) INTO n FROM project_parties
   WHERE phone_e164 = '+16125550143'
     AND sms_consent_status = 'pending'
     AND sms_consent_source IS NOT NULL
     AND sms_consent_recorded_at IS NOT NULL
     AND sms_consent_disclosure_version IS NOT NULL
     AND btrim(COALESCE(sms_consent_evidence, '')) <> '';
  ASSERT n = 3, 'FAIL 6a: the mirror should evidence all three rows, got ' || n;

  -- 6b. …and not one opt-in SMS left the building.
  SELECT COUNT(*) INTO d FROM public._w1a_dispatch_log
   WHERE body->>'templateKey' = 'sms_optin_invite';
  ASSERT d = 1, 'FAIL 6b: a mirrored pending must dispatch nothing, got ' || (d - 1);

  -- 6c. The suppression is scoped to the mirror's own write: a designer writing
  --     an evidenced pending onto a party row directly still dispatches, once.
  UPDATE project_parties
     SET sms_consent_status = 'not_asked', sms_consent_source = NULL,
         sms_consent_evidence = NULL, sms_consent_recorded_at = NULL,
         sms_consent_disclosure_version = NULL
   WHERE id = 'e0000000-0000-4000-8000-000000000011';
  UPDATE project_parties
     SET sms_consent_status = 'pending', sms_consent_source = 'written',
         sms_consent_evidence = 'Kickoff form', sms_consent_recorded_at = now(),
         sms_consent_disclosure_version = 'field-sms-v1'
   WHERE id = 'e0000000-0000-4000-8000-000000000011';
  SELECT COUNT(*) INTO d FROM public._w1a_dispatch_log
   WHERE body->>'templateKey' = 'sms_optin_invite';
  ASSERT d = 2, 'FAIL 6c: a direct party-row write must still dispatch once, got ' || (d - 1);

  -- 6d. The flag does not leak past the mirror's own statement.
  ASSERT COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') <> '1',
    'FAIL 6d: the suppression flag must not survive the mirror';

  -- 6e. M1: re-running the backfill as maintenance folds a new row, whose mirror
  --     flips a sibling to evidenced pending — and still sends nothing.
  SELECT public.backfill_channel_consent_from_parties() INTO folded;
  ASSERT folded = 1, 'FAIL 6e: the re-run should fold the one unrecorded number, got ' || folded;

  SELECT COUNT(*) INTO n FROM project_parties
   WHERE phone_e164 = '+16125550144' AND sms_consent_status = 'pending';
  ASSERT n = 2, 'FAIL 6e: the fold should mirror onto both rows, got ' || n;

  SELECT COUNT(*) INTO d FROM public._w1a_dispatch_log
   WHERE body->>'templateKey' = 'sms_optin_invite';
  ASSERT d = 2, 'FAIL 6f: a backfill re-run must send nothing, got ' || (d - 2);

  RAISE NOTICE '6. mirror fan-out (B1) + backfill re-run (M1): passed';
END
$$;

-- ─── 7. r1 vocabulary widenings (M2 / M3 / M4) ─────────────────────────────

DO $$
DECLARE
  raised TEXT;
  n INTEGER;
BEGIN
  -- 7a. The AP address and the 311 portal both have a kind now, and each is
  --     normalised by its own rule (email lowercased, portal handle kept raw).
  INSERT INTO studio_contact_channels (id, owner_type, owner_id, channel_kind, value)
  VALUES
    ('f0000000-0000-4000-8000-000000000011', 'company', 'c0000000-0000-4000-8000-000000000002', 'ap_email', '  AP@Northgate.COM '),
    ('f0000000-0000-4000-8000-000000000012', 'company', 'c0000000-0000-4000-8000-000000000002', 'portal_311', '  MPLS-311 / acct 88213  ');

  SELECT COUNT(*) INTO n FROM studio_contact_channels
   WHERE id = 'f0000000-0000-4000-8000-000000000011' AND value = 'ap@northgate.com';
  ASSERT n = 1, 'FAIL 7a: ap_email must be lowercased like email';

  SELECT COUNT(*) INTO n FROM studio_contact_channels
   WHERE id = 'f0000000-0000-4000-8000-000000000012' AND value = 'MPLS-311 / acct 88213';
  ASSERT n = 1, 'FAIL 7a: a portal_311 handle must survive verbatim (trimmed)';

  -- 7b. A bounce has somewhere to land, dated.
  UPDATE studio_contact_channels
     SET status = 'bounced', status_at = now()
   WHERE id = 'f0000000-0000-4000-8000-000000000011';
  SELECT COUNT(*) INTO n FROM studio_contact_channels
   WHERE id = 'f0000000-0000-4000-8000-000000000011' AND status = 'bounced' AND status_at IS NOT NULL;
  ASSERT n = 1, 'FAIL 7b: the email rail must be able to write a dated bounce';

  -- 7c. The vocabulary is still a CHECK, not a free-text column.
  raised := NULL;
  BEGIN
    INSERT INTO studio_contact_channels (owner_type, owner_id, channel_kind, value)
    VALUES ('company', 'c0000000-0000-4000-8000-000000000002', 'carrier_pigeon', 'x');
  EXCEPTION WHEN check_violation THEN
    raised := SQLSTATE;
  END;
  ASSERT raised = '23514', 'FAIL 7c: an unknown channel_kind must still be refused';

  -- 7d. M3: every company kind the shipped UI renders, plus the AHJ, now fits.
  UPDATE studio_contacts SET company_kind = 'workroom'  WHERE id = 'c0000000-0000-4000-8000-000000000002';
  UPDATE studio_contacts SET company_kind = 'showroom'  WHERE id = 'c0000000-0000-4000-8000-000000000002';
  UPDATE studio_contacts SET company_kind = 'supplier'  WHERE id = 'c0000000-0000-4000-8000-000000000002';
  UPDATE studio_contacts SET company_kind = 'authority' WHERE id = 'c0000000-0000-4000-8000-000000000002';
  SELECT COUNT(*) INTO n FROM studio_contacts
   WHERE id = 'c0000000-0000-4000-8000-000000000002' AND company_kind = 'authority';
  ASSERT n = 1, 'FAIL 7d: authority (the AHJ) must be a company kind';

  raised := NULL;
  BEGIN
    UPDATE studio_contacts SET company_kind = 'not_a_kind' WHERE id = 'c0000000-0000-4000-8000-000000000002';
  EXCEPTION WHEN check_violation THEN
    raised := SQLSTATE;
  END;
  ASSERT raised = '23514', 'FAIL 7d: an unknown company_kind must still be refused';

  RAISE NOTICE '7. widened vocabularies (M2/M3/M4): passed';
END
$$;

-- ─── 8. r2 B-1: BOTH outward AFTER triggers stand down for a mirror write ──
--
-- project_parties carries two AFTER-row triggers that reach the outside world.
-- Block 6 proved the opt-in invite is suppressed. This is the other one:
-- site_request_consent_granted_dispatch fires whenever sms_consent_status flips
-- to 'granted', mints durable dispatch work, and calls site-request-dispatch,
-- which calls sendPartySms — a real text to a trade. The mirror's UPDATE flips
-- every party row in the studio on the number, so one recorded grant fanned out
-- into one dispatch per open request per seat.
--
-- public.invoke_edge_function is still standing in (installed for block 6).

-- Two Alpha seats for one human on one number, each with a site request parked
-- in awaiting_consent.
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, trade, sms_consent_status)
VALUES
  ('e0000000-0000-4000-8000-000000000021', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Ivo Marek', '(612) 555-0155', 'electrical', 'not_asked'),
  ('e0000000-0000-4000-8000-000000000022', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Ivo Marek', '612-555-0155',   'electrical', 'not_asked');

INSERT INTO site_requests (id, project_id, created_by, assignee_party_id, status, due_at, note)
VALUES
  ('a1000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-00000000000a',
   'a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000021',
   'awaiting_consent', now() + interval '3 days', 'Panel photos'),
  ('a1000000-0000-4000-8000-000000000002', 'd0000000-0000-4000-8000-00000000000a',
   'a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000022',
   'awaiting_consent', now() + interval '3 days', 'Rough-in photos');

DO $$
DECLARE
  d INTEGER;
  n INTEGER;
BEGIN
  -- 8a. One studio act: a member records the grant the studio holds in writing.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '(612) 555-0155', 'granted',
    'written', 'Signed kickoff form', 'field-sms-v1',
    'd0000000-0000-4000-8000-00000000000a');
  PERFORM pg_temp.reset_role();

  -- The mirror did its job: both seats read granted.
  SELECT COUNT(*) INTO n FROM project_parties
   WHERE phone_e164 = '+16125550155' AND sms_consent_status = 'granted';
  ASSERT n = 2, 'FAIL 8a: the mirror should grant both seats, got ' || n;

  -- 8b. …and NOT ONE site-request dispatch left the building.
  SELECT COUNT(*) INTO d FROM public._w1a_dispatch_log
   WHERE fn_name = 'site-request-dispatch';
  ASSERT d = 0, 'FAIL 8b: a mirrored grant must dispatch no site request, got ' || d;

  -- 8c. Nor any durable dispatch work: the requests are still parked.
  SELECT COUNT(*) INTO n FROM site_requests
   WHERE id IN ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002')
     AND status = 'awaiting_consent' AND consent_status_snapshot <> 'granted';
  ASSERT n = 2, 'FAIL 8c: a mirrored grant must mint no dispatch work, got ' || n;

  -- 8d. The suppression is scoped to the mirror's own write: a designer
  --     flipping a party row to granted directly still releases its request.
  UPDATE project_parties SET sms_consent_status = 'not_asked'
   WHERE id = 'e0000000-0000-4000-8000-000000000021';
  UPDATE project_parties SET sms_consent_status = 'granted'
   WHERE id = 'e0000000-0000-4000-8000-000000000021';

  SELECT COUNT(*) INTO d FROM public._w1a_dispatch_log
   WHERE fn_name = 'site-request-dispatch';
  ASSERT d = 1, 'FAIL 8d: a direct party-row grant must still dispatch once, got ' || d;

  SELECT COUNT(*) INTO n FROM site_requests
   WHERE id = 'a1000000-0000-4000-8000-000000000001' AND consent_status_snapshot = 'granted';
  ASSERT n = 1, 'FAIL 8d2: the direct grant should have released its request';

  -- 8e. The flag does not leak past the mirror's own statement.
  ASSERT COALESCE(current_setting('patina.suppress_consent_dispatch', true), '') <> '1',
    'FAIL 8e: the suppression flag must not survive the mirror';

  RAISE NOTICE '8. mirror fan-out, site-request leg (B-1): passed';
END
$$;

-- ─── 9. r2 B-2: the write door is a transition gate ────────────────────────

DO $$
DECLARE
  raised TEXT;
  r RECORD;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  -- 9a. `granted` with no source at all.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550166', 'granted');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'consent_evidence_required',
    'FAIL 9a: a bare four-argument grant must be refused, got ' || COALESCE(raised, '<no error>');

  -- 9b. `pending`/`granted` need the disclosure version too, not just words.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550166', 'pending',
      'written', 'Kickoff form', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'consent_evidence_required',
    'FAIL 9b: pending needs a disclosure version, got ' || COALESCE(raised, '<no error>');

  -- 9c. PR-m: marking a refusal by hand needs a source and the words too.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550166', 'opted_out');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'consent_evidence_required',
    'FAIL 9c: a manual opt-out needs source + evidence, got ' || COALESCE(raised, '<no error>');

  -- 9d. r3 R-AG: `not_asked` is not a verdict. The four-argument call that
  --     needed no evidence at all — and erased a recorded grant, its source,
  --     its words and its disclosure version, from the record AND from every
  --     mirrored seat — is refused outright.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550166', 'granted',
    'written', 'Signed 2025 form', 'field-sms-v1', NULL);
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550166', 'not_asked');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'consent_not_recordable',
    'FAIL 9d: not_asked must be refused, got ' || COALESCE(raised, '<no error>');

  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550166';
  ASSERT r.status = 'granted', 'FAIL 9d2: the grant must stand, got ' || COALESCE(r.status, '<none>');
  ASSERT r.source = 'written' AND r.evidence = 'Signed 2025 form'
     AND r.disclosure_version = 'field-sms-v1' AND r.recorded_by IS NOT NULL,
    'FAIL 9d2: the refused call must leave the whole evidence set standing, got '
    || COALESCE(r.source, '<null>') || ' / ' || COALESCE(r.evidence, '<null>') || ' / '
    || COALESCE(r.disclosure_version, '<null>');

  -- 9d3. R-AG's other half: a status CHANGE may not EMPTY the evidence set. An
  --      opt-out carries no disclosure version of its own — the version the
  --      person was shown when they consented is the audit's, and it stays.
  --      Laundering is closed by the evidence gate instead: source and evidence
  --      were restated by this very call.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550166', 'opted_out',
    'verbal', 'Told me at the walk-through to stop', NULL, NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550166';
  ASSERT r.status = 'opted_out', 'FAIL 9d3: expected opted_out, got ' || COALESCE(r.status, '<none>');
  ASSERT r.source = 'verbal' AND r.evidence = 'Told me at the walk-through to stop',
    'FAIL 9d3: the refusal must carry its OWN words, got '
    || COALESCE(r.source, '<null>') || ' / ' || COALESCE(r.evidence, '<null>');
  ASSERT r.disclosure_version = 'field-sms-v1',
    'FAIL 9d3: the disclosure version must not be nulled by a change, got '
    || COALESCE(r.disclosure_version, '<null>');
  ASSERT r.recorded_by IS NOT NULL, 'FAIL 9d3: recorded_by must not be nulled';
  ASSERT r.consented_at IS NOT NULL, 'FAIL 9d4: the grant DATE still survives (R-Q)';

  -- 9e. Nothing leaves opted_out through this door. not_asked is now refused
  --     one gate earlier (R-AG), so it cannot erase the refusal either way.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550166', 'opted_out',
    'inbound_sms', 'Replied STOP', NULL, NULL);
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550166', 'not_asked');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'consent_not_recordable',
    'FAIL 9e: opted_out -> not_asked must be refused, got ' || COALESCE(raised, '<no error>');

  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550166', 'pending',
      'written', 'Kickoff form', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'channel_opted_out',
    'FAIL 9e2: opted_out -> pending must be refused, got ' || COALESCE(raised, '<no error>');

  -- 9f. …but a re-record of the SAME refusal is fine, and restates its words.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550166', 'opted_out',
    'verbal', 'Told me on site to stop texting', NULL, NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550166';
  ASSERT r.evidence = 'Told me on site to stop texting',
    'FAIL 9f: a same-status re-record should restate the evidence, got ' || COALESCE(r.evidence, '<null>');

  -- 9g. The named way back needs the full evidence set.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_reconsent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550166',
      'written', 'Signed 2026 form', NULL, NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'consent_evidence_required',
    'FAIL 9g: reconsent needs a disclosure version, got ' || COALESCE(raised, '<no error>');

  -- 9h. It lands on pending — never granted — and keeps the opt-out date.
  PERFORM public.record_channel_reconsent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550166',
    'written', 'Signed 2026 form', 'field-sms-v1', NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550166';
  ASSERT r.status = 'pending',
    'FAIL 9h: reconsent must land on pending, got ' || COALESCE(r.status, '<none>');
  ASSERT r.evidence = 'Signed 2026 form' AND r.source = 'written',
    'FAIL 9h2: reconsent must stamp its own evidence';
  ASSERT r.opt_out_at IS NOT NULL,
    'FAIL 9h3: the refusal it superseded must stay printable';

  -- 9i. And it is not a general-purpose door: with no refusal on the books it
  --     refuses and points back at record_channel_consent.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_reconsent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550166',
      'written', 'again', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'no_opt_out_to_supersede',
    'FAIL 9i: reconsent without a refusal must be refused, got ' || COALESCE(raised, '<no error>');
  PERFORM pg_temp.reset_role();

  -- 9j. A member of another studio cannot use the named door either.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000002');
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_reconsent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550166',
      'written', 'not mine to give', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'not_a_studio_member',
    'FAIL 9j: a non-member must be refused, got ' || COALESCE(raised, '<no error>');
  PERFORM pg_temp.reset_role();

  RAISE NOTICE '9. record_channel_consent transition gate (B-2): passed';
END
$$;

-- ─── 10. r2 M-1: the mirror refreshes evidence, not only status ────────────

DO $$
DECLARE
  n INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  -- Same status twice, different words. Guarded on status alone, the second
  -- write never reached the party rows, leaving the cache permanently wrong
  -- about the audit half of the record — the 10DLC evidence for the send.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '(612) 555-0155', 'granted',
    'verbal', 'Said yes on site', 'field-sms-v1', NULL);
  PERFORM pg_temp.reset_role();

  SELECT COUNT(*) INTO n FROM project_parties
   WHERE phone_e164 = '+16125550155'
     AND sms_consent_status = 'granted'
     AND sms_consent_source = 'verbal'
     AND sms_consent_evidence = 'Said yes on site'
     AND sms_consent_recorded_at IS NOT NULL;
  ASSERT n = 2,
    'FAIL 10: a same-status re-record must refresh the mirrored evidence on both seats, got ' || n;

  -- No party row may sit at granted with a hollow evidence set.
  SELECT COUNT(*) INTO n FROM project_parties
   WHERE sms_consent_status = 'granted'
     AND (sms_consent_source IS NULL
          OR sms_consent_recorded_at IS NULL
          OR btrim(COALESCE(sms_consent_evidence, '')) = '');
  ASSERT n = 0,
    'FAIL 10b: a granted party row with a hollow evidence set, ' || n || ' of them';

  RAISE NOTICE '10. mirror evidence refresh (M-1): passed';
END
$$;

-- ─── 11. r2 M-3: one normalisation rule, one origin rule ───────────────────

DO $$
DECLARE
  r RECORD;
  v TEXT;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  -- 11a. The channels table keeps 'ext 411' verbatim (block 2d). The consent
  --      RPC used to refuse that same value, so the channel row could never
  --      carry a consent record. One shared rule now, so it can.
  SELECT value INTO v FROM studio_contact_channels
   WHERE id = 'f1000000-0000-4000-8000-000000000004';
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '  ext 411 ', 'granted',
    'written', 'Dispatch desk letter', 'field-sms-v1', NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = v;
  ASSERT r.status = 'granted',
    'FAIL 11a: an unparseable phone must key the same way in both tables (' || COALESCE(v, '<null>') || ')';

  -- 11b. The origin follows the CURRENT verdict: a later verdict naming a
  --      different job wins, matching the inbound rail (pipeline.ts).
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', 'ext 411', 'granted',
    'written', 'Dispatch desk letter', 'field-sms-v1',
    'd0000000-0000-4000-8000-00000000000a');
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = v;
  ASSERT r.origin_project_id = 'd0000000-0000-4000-8000-00000000000a',
    'FAIL 11b: a supplied origin must win over the stored one';

  -- …and a verdict that names no job keeps the one on the books.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', 'ext 411', 'granted',
    'written', 'Dispatch desk letter', 'field-sms-v1', NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = v;
  ASSERT r.origin_project_id = 'd0000000-0000-4000-8000-00000000000a',
    'FAIL 11b2: an unnamed origin must keep the stored one';
  PERFORM pg_temp.reset_role();

  RAISE NOTICE '11. one normalisation + origin rule (M-3): passed';
END
$$;

-- ─── 12. r3 R-AI: one home for person-at-firm, one derived pointer ─────────
--
-- studio_person_affiliations is the fact the room reads; studio_contacts.
-- company_id (00417) is a derived pointer kept for the legacy readers. The
-- trigger is what binds them, so the two can never answer "which firm is this
-- person at" differently.

-- A second Alpha person card, so this block's affiliation does not collide
-- with block 1's (person c…0001 is already open at Northgate).
INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, created_by)
VALUES ('c0000000-0000-4000-8000-00000000000f', 'b0000000-0000-4000-8000-00000000000a',
        'person', 'sub', 'Rosa Vela', 'a0000000-0000-4000-8000-000000000001');

DO $$
DECLARE
  v UUID;
  n INTEGER;
  aff_id UUID;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  -- 12a. Opening an affiliation moves the pointer.
  INSERT INTO studio_person_affiliations (person_id, company_id, role_at_firm)
  VALUES ('c0000000-0000-4000-8000-00000000000f',
          'c0000000-0000-4000-8000-000000000002', 'foreman')
  RETURNING id INTO aff_id;
  PERFORM pg_temp.reset_role();

  SELECT company_id INTO v FROM studio_contacts
   WHERE id = 'c0000000-0000-4000-8000-00000000000f';
  ASSERT v = 'c0000000-0000-4000-8000-000000000002',
    'FAIL 12a: the open affiliation must set the pointer, got ' || COALESCE(v::text, '<null>');

  -- 12a2. Block 1's affiliation moved its own person's pointer too — the
  --       trigger is not scoped to this block's fixture.
  SELECT company_id INTO v FROM studio_contacts
   WHERE id = 'c0000000-0000-4000-8000-000000000001';
  ASSERT v = 'c0000000-0000-4000-8000-000000000002',
    'FAIL 12a2: block 1''s affiliation must have set its pointer, got ' || COALESCE(v::text, '<null>');

  -- 12b. A direct legacy write to the pointer does not survive the next
  --      affiliation write: the affiliation is the fact, the column the cache.
  UPDATE studio_contacts SET company_id = NULL
   WHERE id = 'c0000000-0000-4000-8000-00000000000f';
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  UPDATE studio_person_affiliations SET role_at_firm = 'superintendent'
   WHERE id = aff_id;
  PERFORM pg_temp.reset_role();
  SELECT company_id INTO v FROM studio_contacts
   WHERE id = 'c0000000-0000-4000-8000-00000000000f';
  ASSERT v = 'c0000000-0000-4000-8000-000000000002',
    'FAIL 12b: the pointer must be re-derived from the affiliation, got ' || COALESCE(v::text, '<null>');

  -- 12c. Closing the affiliation (the person leaving the firm) clears it.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  UPDATE studio_person_affiliations SET to_date = CURRENT_DATE WHERE id = aff_id;
  PERFORM pg_temp.reset_role();
  SELECT company_id INTO v FROM studio_contacts
   WHERE id = 'c0000000-0000-4000-8000-00000000000f';
  ASSERT v IS NULL,
    'FAIL 12c: a closed affiliation must clear the pointer, got ' || COALESCE(v::text, '<null>');

  -- 12d. Deleting the row re-derives it too, and there is nothing left.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  UPDATE studio_person_affiliations SET to_date = NULL WHERE id = aff_id;
  DELETE FROM studio_person_affiliations WHERE id = aff_id;
  PERFORM pg_temp.reset_role();
  SELECT company_id INTO v FROM studio_contacts
   WHERE id = 'c0000000-0000-4000-8000-00000000000f';
  ASSERT v IS NULL,
    'FAIL 12d: a deleted affiliation must clear the pointer, got ' || COALESCE(v::text, '<null>');

  -- 12e. The fold 00592 runs at migration time, over live data: a person
  --      already linked through company_id gets ONE open affiliation, and a
  --      re-run adds nothing. (The statement is 00592's, verbatim — it has no
  --      function to call; if that statement changes, change this with it.)
  UPDATE studio_contacts SET company_id = 'c0000000-0000-4000-8000-000000000002'
   WHERE id = 'c0000000-0000-4000-8000-00000000000f';

  INSERT INTO public.studio_person_affiliations (person_id, company_id, from_date, to_date)
  SELECT p.id, p.company_id, NULL, NULL
    FROM public.studio_contacts p
    JOIN public.studio_contacts c ON c.id = p.company_id
   WHERE p.company_id IS NOT NULL
     AND p.entity_kind = 'person'
     AND c.organization_id = p.organization_id
  ON CONFLICT (person_id, company_id) WHERE to_date IS NULL DO NOTHING;

  INSERT INTO public.studio_person_affiliations (person_id, company_id, from_date, to_date)
  SELECT p.id, p.company_id, NULL, NULL
    FROM public.studio_contacts p
    JOIN public.studio_contacts c ON c.id = p.company_id
   WHERE p.company_id IS NOT NULL
     AND p.entity_kind = 'person'
     AND c.organization_id = p.organization_id
  ON CONFLICT (person_id, company_id) WHERE to_date IS NULL DO NOTHING;

  SELECT COUNT(*) INTO n FROM studio_person_affiliations
   WHERE person_id = 'c0000000-0000-4000-8000-00000000000f'
     AND company_id = 'c0000000-0000-4000-8000-000000000002'
     AND to_date IS NULL;
  ASSERT n = 1,
    'FAIL 12e: the fold must leave exactly one open affiliation, got ' || n;

  -- 12f. And no person card anywhere is left pointing at a firm it has no open
  --      affiliation with — the invariant the backfill exists to establish.
  SELECT COUNT(*) INTO n
    FROM studio_contacts p
   WHERE p.entity_kind = 'person'
     AND p.company_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM studio_person_affiliations a
        WHERE a.person_id = p.id AND a.company_id = p.company_id AND a.to_date IS NULL);
  ASSERT n = 0,
    'FAIL 12f: ' || n || ' person card(s) point at a firm with no open affiliation';

  RAISE NOTICE '12. affiliations are the home, company_id the pointer (R-AI): passed';
  RAISE NOTICE 'All W1a assertions passed.';
END
$$;

ROLLBACK;
