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
--   8. r2 B-1 / r4 M-2: a mirrored `granted` fires NEITHER of project_parties'
--      outward AFTER triggers — not the opt-in invite, and not 00374's
--      site-request consent dispatch — while a direct party-row write still
--      fires both; and the mirror STILL releases the parked site requests on
--      the seats it moved, durably and with no edge invocation.
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
--      — in BOTH directions, so a firm set through the legacy column opens the
--      affiliation the crew list reads (block 12).
--  13. r2r2 B-1 / r4 M-2: an inbound YES/START releases the site requests
--      parked in awaiting_consent — one consent-granted outbox row and one
--      dispatch per request, and the record write that follows adds no second
--      dispatch — INCLUDING the seat the studio never asked on, which the
--      record's mirror grants regardless.
--  14. r2r2 M-1: the "nothing leaves opted_out" gate is part of the WRITE in
--      both doors, not a read before it, so a concurrent STOP cannot land in a
--      read-then-write window.
--  15. r2r2 M-2 / r4 M-1: 00593's backfill marks a number SMS-capable only on
--      REAL SMS-rail evidence — an sms_conversations thread, or a FIELD-kind
--      seat that was actually asked. An architect's or an AHJ inspector's
--      folded party row is not evidence, in leg (a) or in leg (c) (CS4-7).
--  16. r3r2 M-1: the two consent doors COMPOSE — reconsent() then a recorded
--      grant cannot walk a STOP back to `granted`; only the recipient's own
--      inbound YES/START opens that door again.
--  16B. r4 B-1: the same holds for a DATELESS refusal — the shape the shipped
--      portal writes on purpose and the fold mints verbatim. The refusal is a
--      stored fact (refusal_unanswered), not an inference from opt_out_at.
--  17. r3r2 M-2: an affiliation's two ids must be a person card and a company
--      card (and never the same card), and a channel's owner_type must equal
--      its card's entity_kind.
--  18. r5 M5-2 (R-AN): the mirror refreshes the evidence it carries and NEVER
--      nulls a column it does not — the disclosure version and the recorder the
--      seat holds survive a record the inbound rail minted without them.
--  19. r5 B5-1 (R-AL): record_channel_consent reads the SEATS as well as the
--      record. A dated opted_out party row in this studio refuses a grant
--      (channel_opted_out) and survives it byte for byte; the way past is to
--      record the refusal, then reconsent(). Another studio's refusal is still
--      not this studio's fact (R-AK).
--  20. r5 M5-3 (R-AO): N persons x N firms. Writing the legacy company_id
--      pointer opens the affiliation it names and leaves every sibling
--      standing; clearing it closes only the one it named and re-derives onto
--      what is left.
--  21. r5 M5-4 (R-AP): paperwork_contact_person_id / signer_person_id /
--      site_contact_person_id must each name a PERSON card in the SAME studio,
--      never the row itself — on INSERT as well as UPDATE.
--  26. r7 M7-1: no verdict written through record_channel_consent lowers
--      refusal_unanswered. The fold mints `granted` records for legacy seats
--      whose stale opt-out no later consent answered; a granted-on-granted
--      re-record over one of those used to be exempt from the gate AND lower
--      the flag the send rail now reads, turning sending back on with no
--      recipient involved. Only the inbound rail's own write lowers it.
--  27. r7 M7-2: record_channel_reconsent is EVIDENCE-ONLY. It records the
--      studio's fresh consent, leaves the record at `opted_out` with the
--      refusal standing, leaves the mirrored refusal on the seats, and stays
--      re-callable. Sending resumes on the recipient's YES/START alone.
--      r9 R5-M1: the SEAT keeps the refusal's own source and words too — the
--      mirror carries opt_out_source/evidence/recorded_at/recorded_by onto
--      project_parties whenever the verdict it is mirroring is a refusal.
--      r8 R8-M1 (R-AQ): and where the refusal has NO words of its own, all
--      four are written NULL on EVERY seat — including the sibling seat that
--      was carrying the grant's evidence, which the COALESCE used to leave
--      standing under an `opted_out` status.
--  29. r8 R8-M2 (R-AR): a card held by a channel, a designation, a rule route
--      or an affiliation may not change its entity_kind or its studio; a
--      restatement of the same values still writes; detaching the dependents
--      opens the door again.
--  30. r2 R2-M1: the fold picks the refusing sibling by the refusal's OWN
--      facts, not by row age. Two refusals on one number in one studio — the
--      dated, worded inbound STOP and the dateless sourceless one the shipped
--      portal writes — and the record AND both seats keep the STOP's date and
--      its words; where the words and the date sit on different refusing
--      seats, the record still ends up with both.
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
-- A second Alpha number +16125550199 has THREE Alpha rows: two granted (the
-- NEWER evidence wins) and a third that reads `granted` while carrying an
-- opt-out no later consent answered — the legacy shape r8's W4-M1 found the
-- fold throwing away. The clean grant outranks it, so the refusal only survives
-- if the fold asks the whole group rather than the winning row.
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
   'granted', '2026-02-02T00:00:00Z', NULL, 'written', 'newer grant', '2026-02-02T00:00:00Z', 'field-sms-v1'),
  ('e0000000-0000-4000-8000-000000000006', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Pete Rusk', '(612) 555-0199',
   'granted', NULL, '2025-11-16T00:00:00Z', 'inbound_sms', 'Replied STOP on the Rusk thread',
   '2025-11-16T00:00:00Z', 'field-sms-v1');

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

  -- 3c3. r8 W4-M1: the SIBLING seat's unanswered refusal is not thrown away with
  --     the row that carried it. Seat e…0006 reads `granted` while holding a
  --     300-day-old opt-out no consent answered; the clean 2026 grant wins the
  --     ranking, so before the fix the record above was minted fully sendable
  --     (refusal_unanswered = false) and neither the send gate's second check
  --     nor the write door's seat gate could see it — both filter on
  --     sms_consent_status = 'opted_out', and the contaminated seat says
  --     `granted`.
  ASSERT r.refusal_unanswered,
    'FAIL 3c3: a sibling seat''s unanswered refusal must mint the record '
    'UNSENDABLE, even when a clean grant wins the ranking';

  -- 3c4. …and it carries the REFUSAL's own evidence (r8 W4-M2), which is not
  --      the winning row's: that row is the grant.
  ASSERT r.opt_out_source = 'inbound_sms'
     AND r.opt_out_evidence = 'Replied STOP on the Rusk thread'
     AND r.opt_out_recorded_at = '2025-11-16T00:00:00Z'::timestamptz,
    'FAIL 3c4: the refusal''s own source and words must land in the refusal '
    'evidence set, got ' || COALESCE(r.opt_out_source, '<null>') || ' / '
      || COALESCE(r.opt_out_evidence, '<null>');

  -- 3c6. r6 R6-M2: AND THE REFUSAL'S DATE, not only its words. opt_out_at used
  --      to be taken from the WINNING row — here a clean grant with no opt-out
  --      date — so the record said "it arrived by text, it said Replied STOP,
  --      it was written down on 2025-11-16" with the column that carries WHEN
  --      THEY REFUSED left empty. R-Q's sentence lost its date for exactly this
  --      population, and the date test the write gate keeps alongside
  --      refusal_unanswered had nothing to read on every record the fold mints.
  ASSERT r.opt_out_at = '2025-11-16T00:00:00Z'::timestamptz,
    'FAIL 3c6: the refusing sibling''s own opt-out date must land on the '
    'record, got ' || COALESCE(r.opt_out_at::text, '<null>');

  -- 3c5. The consent half is still the winning grant's — two facts, two sets.
  ASSERT r.source = 'written' AND r.evidence = 'newer grant',
    'FAIL 3c5: the shared evidence set still belongs to the winning verdict';

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
  r RECORD;
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

  -- 4c2. PR-m's named door: the studio's fresh consent, written as EVIDENCE
  --      onto the SAME record (no second row) — and the record stays
  --      `opted_out`, refusal standing (r7 M7-2).
  PERFORM public.record_channel_reconsent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '(612) 555-0142',
    'written', 'Fresh written consent', 'field-sms-v1',
    'd0000000-0000-4000-8000-00000000000a');
  PERFORM pg_temp.reset_role();

  SELECT COUNT(*) INTO n FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = '+16125550142';
  ASSERT n = 1, 'FAIL 4c2: the RPC must normalise onto the existing record, got ' || n;

  -- 4d. The refusal stands on both Alpha rows, IN ITS OWN WORDS: the party-row
  --     backstop the send rail falls back on is never cleared by this door
  --     (r7 M7-2), and since r9 R5-M1 the studio's fresh consent evidence does
  --     not overwrite the refusal's on the seat either. project_parties has one
  --     evidence set; under an `opted_out` status it holds the refusal's, so
  --     R-Q's sentence read off the seat still says the STOP arrived by text.
  --     The studio's fresh consent lives on the record (4d3 below).
  SELECT COUNT(*) INTO n FROM project_parties
   WHERE id IN ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002')
     AND sms_consent_status = 'opted_out'
     AND sms_consent_source = 'inbound_sms'
     AND sms_consent_evidence = 'STOP';
  ASSERT n = 2, 'FAIL 4d: both Alpha rows must keep the refusal and its own words, got ' || n;

  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550142';
  ASSERT r.status = 'opted_out' AND r.refusal_unanswered,
    'FAIL 4d2: reconsent must leave the refusal standing, got '
      || COALESCE(r.status, '<null>');
  -- 4d3. The studio's fresh consent IS on the record — it is the record's
  --      consent set that holds it, next to the refusal's own set.
  ASSERT r.evidence = 'Fresh written consent' AND r.source = 'written'
     AND r.opt_out_evidence = 'STOP' AND r.opt_out_source = 'inbound_sms',
    'FAIL 4d3: the record carries both sets, got '
      || COALESCE(r.evidence, '<null>') || ' / ' || COALESCE(r.opt_out_evidence, '<null>');

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
-- r4 M-2 sharpened the invariant: it is about SENDING. Suppressing the trigger
-- wholesale also stranded the DURABLE half — the seat read `granted` while its
-- site request sat in awaiting_consent for ever. So the mirror now carries its
-- own narrow release (site_request_dispatch_after_consent() only, never
-- invoke_edge_function), and this block proves both halves: zero edge
-- invocations, two released requests.
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

  -- 8c. The suppression is about SENDING, not about work. The mirror still
  --     RELEASES the requests parked on the seats it just moved — durable,
  --     in-transaction: snapshot stamped, one consent-granted outbox row each,
  --     and (8b) not one edge invocation. Without this the seats read `granted`
  --     while their requests sat in awaiting_consent for ever, since 00374's
  --     trigger is the only caller of site_request_dispatch_after_consent() and
  --     the lifecycle sweep only promotes requests that already hold an outbox
  --     row (r4 M-2).
  SELECT COUNT(*) INTO n FROM site_requests
   WHERE id IN ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002')
     AND consent_status_snapshot = 'granted';
  ASSERT n = 2,
    'FAIL 8c: a mirrored grant must release the parked requests durably, got ' || n;

  SELECT COUNT(*) INTO n FROM site_request_dispatch_outbox
   WHERE request_id IN ('a1000000-0000-4000-8000-000000000001',
                        'a1000000-0000-4000-8000-000000000002')
     AND action = 'consent-granted';
  ASSERT n = 2,
    'FAIL 8c2: one consent-granted outbox row per released request, got ' || n;

  -- 8c3. …and still NOTHING left the building for them.
  SELECT COUNT(*) INTO d FROM public._w1a_dispatch_log
   WHERE fn_name = 'site-request-dispatch';
  ASSERT d = 0,
    'FAIL 8c3: the durable release must not invoke the edge function, got ' || d;

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

  -- 9h. It writes EVIDENCE ONLY (r7 M7-2): the record stays opted_out, the
  --     refusal stays unanswered, and the opt-out date stays printable.
  PERFORM public.record_channel_reconsent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550166',
    'written', 'Signed 2026 form', 'field-sms-v1', NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550166';
  ASSERT r.status = 'opted_out',
    'FAIL 9h: reconsent must leave the record at opted_out, got ' || COALESCE(r.status, '<none>');
  ASSERT r.refusal_unanswered,
    'FAIL 9h1: the refusal must still stand unanswered after reconsent';
  ASSERT r.evidence = 'Signed 2026 form' AND r.source = 'written',
    'FAIL 9h2: reconsent must stamp its own evidence';
  ASSERT r.opt_out_at IS NOT NULL,
    'FAIL 9h3: the refusal it was recorded against must stay printable';

  -- 9h4. And it stays RE-CALLABLE (r7 M7-2): it no longer moves the row off
  --      the one status it can act on, so a later, better-evidenced consent
  --      can be recorded over the same standing refusal.
  PERFORM public.record_channel_reconsent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550166',
    'written', 'Countersigned 2026 form', 'field-sms-v1', NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550166';
  ASSERT r.evidence = 'Countersigned 2026 form' AND r.status = 'opted_out',
    'FAIL 9h4: a second reconsent must restate the evidence and keep the refusal, got '
      || COALESCE(r.evidence, '<null>');

  -- 9i. And it is not a general-purpose door: with no refusal on the books it
  --     refuses and points back at record_channel_consent.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_reconsent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550167',
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

  -- 10b. THE WHOLE EVIDENCE SET — all five columns (r5 M5-2, R-AN). The two
  --      this check used to omit, disclosure_version and recorded_by, are
  --      exactly the two a record can arrive without (the inbound rail mints
  --      one from a YES), and omitting them here is why the mirror could null
  --      them on the seat without a test noticing.
  SELECT COUNT(*) INTO n FROM project_parties
   WHERE phone_e164 = '+16125550155'
     AND sms_consent_status = 'granted'
     AND sms_consent_source = 'verbal'
     AND sms_consent_evidence = 'Said yes on site'
     AND sms_consent_recorded_at IS NOT NULL
     AND sms_consent_disclosure_version = 'field-sms-v1'
     AND sms_consent_recorded_by = 'a0000000-0000-4000-8000-000000000001';
  ASSERT n = 2,
    'FAIL 10b: the mirror must carry all five evidence columns onto both seats, got ' || n;

  -- No party row may sit at granted with a hollow evidence set.
  SELECT COUNT(*) INTO n FROM project_parties
   WHERE sms_consent_status = 'granted'
     AND (sms_consent_source IS NULL
          OR sms_consent_recorded_at IS NULL
          OR btrim(COALESCE(sms_consent_evidence, '')) = '');
  ASSERT n = 0,
    'FAIL 10b2: a granted party row with a hollow evidence set, ' || n || ' of them';

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

  -- 12b. r2 M-3, THE REVERSE BINDING: the legacy pointer is what the shipped
  --      hooks still write (use-studio-contacts.ts:202, :234). Clearing it
  --      closes the open affiliation…
  UPDATE studio_contacts SET company_id = NULL
   WHERE id = 'c0000000-0000-4000-8000-00000000000f';
  SELECT COUNT(*) INTO n FROM studio_person_affiliations
   WHERE person_id = 'c0000000-0000-4000-8000-00000000000f' AND to_date IS NULL;
  ASSERT n = 0,
    'FAIL 12b: clearing the pointer must close the open affiliation, got ' || n;

  --      …and writing it OPENS one, so a firm set through the legacy column is
  --      a firm the company card's crew list (R-W, which reads affiliations)
  --      can actually see. Bound one way only, this write produced a card with
  --      a company_id and no affiliation row at all.
  UPDATE studio_contacts SET company_id = 'c0000000-0000-4000-8000-000000000002'
   WHERE id = 'c0000000-0000-4000-8000-00000000000f';
  SELECT COUNT(*) INTO n FROM studio_person_affiliations
   WHERE person_id = 'c0000000-0000-4000-8000-00000000000f'
     AND company_id = 'c0000000-0000-4000-8000-000000000002'
     AND to_date IS NULL;
  ASSERT n = 1,
    'FAIL 12b2: writing the pointer must open exactly one affiliation, got ' || n;

  --      The two triggers settle: the pointer still reads what was written.
  SELECT company_id INTO v FROM studio_contacts
   WHERE id = 'c0000000-0000-4000-8000-00000000000f';
  ASSERT v = 'c0000000-0000-4000-8000-000000000002',
    'FAIL 12b3: the pointer must survive its own reverse write, got ' || COALESCE(v::text, '<null>');

  --      A cross-studio pointer is left for a human, exactly as the fold and
  --      the affiliation RLS leave it — no affiliation is opened.
  UPDATE studio_contacts SET company_id = 'c0000000-0000-4000-8000-000000000003'
   WHERE id = 'c0000000-0000-4000-8000-00000000000f';
  SELECT COUNT(*) INTO n FROM studio_person_affiliations
   WHERE person_id = 'c0000000-0000-4000-8000-00000000000f'
     AND company_id = 'c0000000-0000-4000-8000-000000000003';
  ASSERT n = 0,
    'FAIL 12b4: a cross-studio pointer must open no affiliation, got ' || n;
  UPDATE studio_contacts SET company_id = 'c0000000-0000-4000-8000-000000000002'
   WHERE id = 'c0000000-0000-4000-8000-00000000000f';

  --      The open row this block now works with is the one the pointer opened.
  SELECT id INTO aff_id FROM studio_person_affiliations
   WHERE person_id = 'c0000000-0000-4000-8000-00000000000f'
     AND company_id = 'c0000000-0000-4000-8000-000000000002'
     AND to_date IS NULL;
  ASSERT aff_id IS NOT NULL, 'FAIL 12b5: no open affiliation to carry forward';

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
END
$$;

-- ─── 13. r2 B-1: an inbound grant RELEASES a parked site request ───────────
--
-- Block 8 proves the mirror alone dispatches nothing. This is the other half,
-- and the one the shipped rail depends on: when the recipient texts YES or
-- START, sms-inbound/pipeline.ts writes the PARTY ROWS FIRST and the consent
-- record second, so the real pending → granted transition is the one
-- site_request_consent_granted_dispatch (00374) sees. That trigger is the ONLY
-- caller of site_request_dispatch_after_consent(), which mints the
-- 'consent-granted' outbox row and stamps consent_status_snapshot; the
-- lifecycle sweep only promotes requests that already HAVE an outbox row. With
-- the record written first, the mirror consumed the transition under
-- patina.suppress_consent_dispatch, the later party write matched nothing, and
-- the trade's request sat in awaiting_consent for ever.

-- Three seats for one human on one number in ONE studio: two `pending`, and a
-- third the studio never asked on this job. r4 M-2: the YES used to move only
-- the pending seats, while the consent record's mirror flipped the third to
-- `granted` too — silently, under the dispatch guard — so that seat read
-- granted for ever while its site request stayed parked for ever.
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, trade, sms_consent_status)
VALUES
  ('e0000000-0000-4000-8000-000000000031', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Nell Bracco', '(612) 555-0177', 'plumbing', 'pending'),
  ('e0000000-0000-4000-8000-000000000032', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Nell Bracco', '612-555-0177',   'plumbing', 'pending'),
  ('e0000000-0000-4000-8000-000000000033', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Nell Bracco', '+16125550177',   'plumbing', 'not_asked');

INSERT INTO site_requests (id, project_id, created_by, assignee_party_id, status, due_at, note)
VALUES
  ('a1000000-0000-4000-8000-000000000011', 'd0000000-0000-4000-8000-00000000000a',
   'a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000031',
   'awaiting_consent', now() + interval '3 days', 'Stack photos'),
  ('a1000000-0000-4000-8000-000000000012', 'd0000000-0000-4000-8000-00000000000a',
   'a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000032',
   'awaiting_consent', now() + interval '3 days', 'Valve photos'),
  ('a1000000-0000-4000-8000-000000000013', 'd0000000-0000-4000-8000-00000000000a',
   'a0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000033',
   'awaiting_consent', now() + interval '3 days', 'Meter photos');

DO $$
DECLARE
  n INTEGER;
  d INTEGER;
BEGIN
  -- 13a. The shipped order, step 1: grantPartiesForStudios() — scoped to the
  --      studios that ASKED, but covering EVERY seat those studios hold on the
  --      number, exactly as the YES branch now writes it (r4 M-2). No status
  --      filter: the record's mirror is about to cover all three anyway, and a
  --      seat the mirror moves takes no real transition.
  UPDATE project_parties
     SET sms_consent_status = 'granted', sms_consented_at = now(), sms_opt_out_at = NULL
   WHERE id IN ('e0000000-0000-4000-8000-000000000031',
                'e0000000-0000-4000-8000-000000000032',
                'e0000000-0000-4000-8000-000000000033');

  -- 13b. Step 2: writeChannelConsent() — the rail's own upsert, as service_role.
  INSERT INTO studio_channel_consent (
    organization_id, channel_kind, channel_value, status,
    consented_at, opt_out_at, source, evidence, recorded_at,
    disclosure_version, origin_project_id)
  VALUES (
    'b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550177', 'granted',
    now(), NULL, 'inbound_sms', 'Inbound YES', now(),
    NULL, 'd0000000-0000-4000-8000-00000000000a')
  ON CONFLICT (organization_id, channel_kind, channel_value) DO UPDATE
    SET status = EXCLUDED.status, consented_at = EXCLUDED.consented_at,
        source = EXCLUDED.source, evidence = EXCLUDED.evidence,
        recorded_at = EXCLUDED.recorded_at;

  -- 13c. ALL THREE requests were RELEASED — including the one on the seat the
  --      studio never asked on, which the record was going to grant regardless
  --      (r4 M-2). Durable outbox work, and the snapshot.
  SELECT COUNT(*) INTO n FROM site_request_dispatch_outbox
   WHERE request_id IN ('a1000000-0000-4000-8000-000000000011',
                        'a1000000-0000-4000-8000-000000000012',
                        'a1000000-0000-4000-8000-000000000013')
     AND action = 'consent-granted';
  ASSERT n = 3,
    'FAIL 13c: an inbound grant must mint one consent-granted outbox row per '
    'parked request, got ' || n;

  SELECT COUNT(*) INTO n FROM site_requests
   WHERE id IN ('a1000000-0000-4000-8000-000000000011',
                'a1000000-0000-4000-8000-000000000012',
                'a1000000-0000-4000-8000-000000000013')
     AND consent_status_snapshot = 'granted';
  ASSERT n = 3, 'FAIL 13c2: all three snapshots must read granted, got ' || n;

  -- 13c3. And none of them is still parked with a stale snapshot — the exact
  --       state the not_asked sibling used to be stranded in.
  ASSERT NOT EXISTS (
    SELECT 1 FROM site_requests sr
      JOIN project_parties pp ON pp.id = sr.assignee_party_id
     WHERE pp.phone_e164 = '+16125550177'
       AND sr.status = 'awaiting_consent'
       AND sr.consent_status_snapshot IS DISTINCT FROM 'granted'),
    'FAIL 13c3: a granted seat must not still hold a request parked at not_asked';

  -- 13d. …once each. The mirror that follows refreshes evidence under
  --      suppression and must not dispatch a second time.
  SELECT COUNT(*) INTO d FROM public._w1a_dispatch_log
   WHERE fn_name = 'site-request-dispatch'
     AND body->>'request_id' IN ('a1000000-0000-4000-8000-000000000011',
                                 'a1000000-0000-4000-8000-000000000012',
                                 'a1000000-0000-4000-8000-000000000013');
  ASSERT d = 3,
    'FAIL 13d: exactly one dispatch per released request, got ' || d;

  -- 13e. And the mirror still did its own job: the seats carry the record's
  --      evidence, not just its status.
  SELECT COUNT(*) INTO n FROM project_parties
   WHERE phone_e164 = '+16125550177'
     AND sms_consent_status = 'granted'
     AND sms_consent_source = 'inbound_sms'
     AND sms_consent_evidence = 'Inbound YES';
  ASSERT n = 3, 'FAIL 13e: the mirror must refresh all three seats'' evidence, got ' || n;

  RAISE NOTICE '13. an inbound grant releases its parked site requests (B-1/M-2): passed';
END
$$;

-- ─── 14. r2 M-1: the opted_out gate lives INSIDE the write ────────────────
--
-- A `SELECT … FOR UPDATE` before the upsert locks nothing when the row does not
-- exist yet, so the inbound STOP rail (which upserts this table directly as
-- service_role) could land `opted_out` in the gap and the grant would take the
-- DO UPDATE branch straight over it. The race itself needs two sessions and
-- cannot be staged inside this single rolled-back transaction; what IS
-- assertable here is that neither door still reads-then-checks — the condition
-- is part of the writing statement, which re-reads the latest row version.

DO $$
DECLARE
  norm TEXT;
  r RECORD;
  raised TEXT;
BEGIN
  -- The line comments are stripped BEFORE the whitespace is collapsed: the
  -- body's own prose quotes the wording these assertions are checking is gone,
  -- and a NOT LIKE that a comment can satisfy proves nothing.
  SELECT regexp_replace(
           regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g'),
           '\s+', ' ', 'g') INTO norm
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'record_channel_consent';
  -- r6 B6-1: the second and third legs are stated on the REFUSAL
  -- (EXCLUDED.status = 'opted_out' is the only exemption), never on
  -- "which verdict is being written".
  ASSERT norm LIKE '%WHERE (scc.status IS DISTINCT FROM ''opted_out'' OR EXCLUDED.status = ''opted_out'') AND (EXCLUDED.status = ''opted_out'' OR (scc.refusal_unanswered IS NOT TRUE%RETURNING%',
    'FAIL 14a: record_channel_consent must gate opted_out AND the unanswered refusal in the upsert''s DO UPDATE … WHERE';
  ASSERT norm NOT LIKE '%EXCLUDED.status <> ''granted''%',
    'FAIL 14a2: no leg may be stated on the verdict being written (r6 B6-1)';
  ASSERT norm NOT LIKE '%pp.sms_opt_out_at IS NOT NULL%',
    'FAIL 14a3: the seat test must not require a DATED refusal (r6 M6-1)';
  -- r7 M7-1: a record already AT `granted` was exempt from that gate, and the
  -- write that came through then lowered the flag the send rail reads. Both
  -- halves are gone, and the source text is where that is cheapest to hold.
  ASSERT norm NOT LIKE '%OR scc.status = ''granted''%',
    'FAIL 14a4: a record already at granted must not be exempt from the refusal gate (r7 M7-1)';
  ASSERT norm NOT LIKE '%WHEN EXCLUDED.status = ''granted'' THEN false%',
    'FAIL 14a5: no verdict written through this door may lower refusal_unanswered (r7 M7-1)';

  SELECT regexp_replace(
           regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g'),
           '\s+', ' ', 'g') INTO norm
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'record_channel_reconsent';
  ASSERT norm LIKE '%AND scc.status = ''opted_out'' RETURNING%',
    'FAIL 14b: record_channel_reconsent must gate on status in the UPDATE''s own WHERE';
  -- r7 M7-2: and it writes EVIDENCE ONLY — the status it sets is the status it
  -- requires, so the refusal stays on the books and the door stays re-callable.
  ASSERT norm LIKE '%SET status = ''opted_out'', refusal_unanswered = true%',
    'FAIL 14b2: record_channel_reconsent must leave the record at opted_out (r7 M7-2)';
  ASSERT norm NOT LIKE '%SET status = ''pending''%',
    'FAIL 14b3: record_channel_reconsent must not move the row to pending (r7 M7-2)';

  -- 14c. Behaviour: a refused grant leaves the refusal byte-for-byte intact —
  --      no half-write of the evidence set or the dates.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550188', 'opted_out',
    'inbound_sms', 'Replied STOP', NULL, NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550188';

  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550188', 'granted',
      'written', 'Kickoff form', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'channel_opted_out',
    'FAIL 14c: the grant must be refused, got ' || COALESCE(raised, '<no error>');
  PERFORM pg_temp.reset_role();

  ASSERT EXISTS (
    SELECT 1 FROM studio_channel_consent x
     WHERE x.organization_id = r.organization_id
       AND x.channel_kind = r.channel_kind
       AND x.channel_value = r.channel_value
       AND x.status = r.status AND x.source = r.source
       AND x.evidence = r.evidence AND x.recorded_at = r.recorded_at
       AND x.opt_out_at IS NOT DISTINCT FROM r.opt_out_at
       AND x.consented_at IS NOT DISTINCT FROM r.consented_at),
    'FAIL 14c2: a refused grant must leave the refusal untouched';

  RAISE NOTICE '14. the opted_out gate is part of the write (M-1): passed';
END
$$;

-- ─── 15. r2 M-2 / r4 M-1: the card backfill does not invent SMS capability ─
--
-- crm-model §2 CS4-7 / direction §5.1: an office line must never be offered an
-- SMS invite, and sms_capable is the column that says so. A person card holds
-- ONE untyped number and the fixture is full of person cards carrying an
-- office, showroom or dispatch line (F-13, F-14, F-17, F-20, F-27).
--
-- r4 M-1: "a party row exists on this card with this number" is NOT that
-- evidence. party_kind covers architect, photographer, stager, client,
-- client_rep, vendor and other, none of which the SMS rail touches — so F-10
-- Sam Rowe ("never texted") and F-27 Ray Thao ("NEVER texted; scheduled through
-- 311") both came out of the fold marked SMS-capable. The evidence is now
-- public.channel_value_was_on_sms_rail(): a real sms_conversations thread on the
-- number, or a FIELD-kind seat on it that has actually been asked. Both legs
-- (a) and (c) use it, and everything else keeps the `line type unconfirmed`
-- label. The two statements below are 00593 backfill legs (a) and (c),
-- verbatim — if those statements change, change these with them.

INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, company_name, phone, created_by)
VALUES
  ('c0000000-0000-4000-8000-000000000021', 'b0000000-0000-4000-8000-00000000000a',
   'person', 'sub', 'Ingrid Solheim', NULL, '(612) 555-0201', 'a0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000022', 'b0000000-0000-4000-8000-00000000000a',
   'person', 'sub', 'Nell Bracco', NULL, '612-555-0177', 'a0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000023', 'b0000000-0000-4000-8000-00000000000a',
   'company', 'sub', NULL, 'Solheim Tile', '(612) 555-0202', 'a0000000-0000-4000-8000-000000000001'),
  -- F-10's shape: an architect the studio has never texted, with a folded
  -- party row on the card carrying exactly that number.
  ('c0000000-0000-4000-8000-000000000024', 'b0000000-0000-4000-8000-00000000000a',
   'person', 'other', 'Sam Rowe (architect, never texted)', NULL, '(612) 555-0210', 'a0000000-0000-4000-8000-000000000001'),
  -- F-27's shape: the AHJ inspector, scheduled through 311, reachable on a desk
  -- line that must NEVER be texted. His card carries no number of its own —
  -- only leg (c), off the party row, can produce a channel for him.
  ('c0000000-0000-4000-8000-000000000025', 'b0000000-0000-4000-8000-00000000000a',
   'person', 'other', 'Ray Thao (AHJ, NEVER text)', NULL, NULL, 'a0000000-0000-4000-8000-000000000001'),
  -- A number the studio really has texted, on a card with no party row at all:
  -- the sms_conversations thread is the evidence.
  ('c0000000-0000-4000-8000-000000000026', 'b0000000-0000-4000-8000-00000000000a',
   'person', 'sub', 'Tova Lind (real SMS thread)', NULL, '(612) 555-0288', 'a0000000-0000-4000-8000-000000000001');

-- Nell's card is the one with evidence: a FIELD-kind party row folded onto it
-- (00418) carries the same number and has been asked for consent — block 13
-- granted it — so that number really was on an SMS rail.
UPDATE project_parties SET studio_contact_id = 'c0000000-0000-4000-8000-000000000022'
 WHERE id = 'e0000000-0000-4000-8000-000000000031';

-- Sam's and Ray's rows: folded onto their cards, on their numbers, and NEITHER
-- of them a kind the SMS rail covers.
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, studio_contact_id, sms_consent_status)
VALUES
  ('e0000000-0000-4000-8000-000000000041', 'd0000000-0000-4000-8000-00000000000a', 'architect',
   'Sam Rowe', '612-555-0210', 'c0000000-0000-4000-8000-000000000024', 'not_asked'),
  ('e0000000-0000-4000-8000-000000000042', 'd0000000-0000-4000-8000-00000000000a', 'other',
   'Ray Thao', '(612) 555-0311', 'c0000000-0000-4000-8000-000000000025', 'not_asked');

-- Tova's evidence: a real thread on her number, no party row anywhere.
INSERT INTO sms_conversations (twilio_number, phone_e164, last_outbound_at)
VALUES ('+16125550100', '+16125550288', now());

DO $$
DECLARE
  r RECORD;
BEGIN
  -- 00593 backfill leg (a), verbatim.
  INSERT INTO public.studio_contact_channels (owner_type, owner_id, channel_kind, value, sms_capable, label)
  SELECT sc.entity_kind,
         sc.id,
         CASE WHEN sc.entity_kind = 'person' THEN 'mobile' ELSE 'office' END,
         COALESCE(sc.phone_e164, sc.phone),
         ev.texted,
         CASE WHEN sc.entity_kind = 'person' AND NOT ev.texted
              THEN 'From the card (00593 backfill) — line type unconfirmed'
              ELSE 'From the card (00593 backfill)' END
  FROM public.studio_contacts sc
  CROSS JOIN LATERAL (
    SELECT sc.entity_kind = 'person'
           AND public.channel_value_was_on_sms_rail(
                 public.normalize_channel_value('mobile', COALESCE(sc.phone_e164, sc.phone))
               ) AS texted
  ) ev
  WHERE btrim(COALESCE(sc.phone_e164, sc.phone, '')) <> ''
  ON CONFLICT (owner_id, channel_kind, value) DO NOTHING;

  -- 00593 backfill leg (c), verbatim.
  INSERT INTO public.studio_contact_channels (owner_type, owner_id, channel_kind, value, sms_capable, label)
  SELECT 'person', sc.id, 'mobile', COALESCE(pp.phone_e164, pp.phone),
         public.channel_value_was_on_sms_rail(
           public.normalize_channel_value('mobile', COALESCE(pp.phone_e164, pp.phone))),
         CASE WHEN public.channel_value_was_on_sms_rail(
                     public.normalize_channel_value('mobile', COALESCE(pp.phone_e164, pp.phone)))
              THEN 'From a project roster (00593 backfill)'
              ELSE 'From a project roster (00593 backfill) — line type unconfirmed' END
  FROM public.project_parties pp
  JOIN public.studio_contacts sc
    ON sc.id = pp.studio_contact_id AND sc.entity_kind = 'person'
  WHERE btrim(COALESCE(pp.phone_e164, pp.phone, '')) <> ''
  ON CONFLICT (owner_id, channel_kind, value) DO NOTHING;

  -- 15a. A person card with no SMS evidence keeps the SAFE default, and says so.
  SELECT * INTO r FROM studio_contact_channels
   WHERE owner_id = 'c0000000-0000-4000-8000-000000000021' AND value = '+16125550201';
  ASSERT r.sms_capable = false,
    'FAIL 15a: an unevidenced person-card number must not be marked SMS-capable';
  ASSERT r.label LIKE '%line type unconfirmed%',
    'FAIL 15a2: the row must say the line type is unconfirmed, got ' || COALESCE(r.label, '<null>');

  -- 15b. A person card whose number carries a FIELD-kind seat that has actually
  --      been asked IS SMS-capable.
  SELECT * INTO r FROM studio_contact_channels
   WHERE owner_id = 'c0000000-0000-4000-8000-000000000022' AND value = '+16125550177';
  ASSERT r.sms_capable = true,
    'FAIL 15b: a number on an asked field seat must be SMS-capable';
  ASSERT r.label NOT LIKE '%unconfirmed%',
    'FAIL 15b2: an evidenced row must not be labelled unconfirmed';

  -- 15c. A firm's number is an office line, and never SMS-capable.
  SELECT * INTO r FROM studio_contact_channels
   WHERE owner_id = 'c0000000-0000-4000-8000-000000000023' AND value = '+16125550202';
  ASSERT r.channel_kind = 'office' AND r.sms_capable = false,
    'FAIL 15c: a company card number must be an office line, never SMS-capable';

  -- 15e. r4 M-1, leg (a): the architect the studio has never texted. A folded
  --      party row on the same number is NOT evidence — his kind is not one the
  --      SMS rail covers.
  SELECT * INTO r FROM studio_contact_channels
   WHERE owner_id = 'c0000000-0000-4000-8000-000000000024' AND value = '+16125550210';
  ASSERT FOUND, 'FAIL 15e: the architect card should still get a channel row';
  ASSERT r.sms_capable = false,
    'FAIL 15e2: an architect party row must not make a number SMS-capable';
  ASSERT r.label LIKE '%line type unconfirmed%',
    'FAIL 15e3: the architect row must say the line type is unconfirmed, got '
    || COALESCE(r.label, '<null>');

  -- 15f. r4 M-1, leg (c): the AHJ desk line, which arrives ONLY through the
  --      party-row leg. Leg (c) used to write a literal `true`.
  SELECT * INTO r FROM studio_contact_channels
   WHERE owner_id = 'c0000000-0000-4000-8000-000000000025' AND value = '+16125550311';
  ASSERT FOUND, 'FAIL 15f: leg (c) should still fold the roster number onto the card';
  ASSERT r.label LIKE 'From a project roster%',
    'FAIL 15f2: that row must come from leg (c), got ' || COALESCE(r.label, '<null>');
  ASSERT r.sms_capable = false,
    'FAIL 15f3: leg (c) must not assert SMS capability for a 311 desk line';
  ASSERT r.label LIKE '%line type unconfirmed%',
    'FAIL 15f4: leg (c) must label an unevidenced line unconfirmed, got '
    || COALESCE(r.label, '<null>');

  -- 15g. And a number with a REAL sms_conversations thread is capable, with no
  --      party row anywhere.
  SELECT * INTO r FROM studio_contact_channels
   WHERE owner_id = 'c0000000-0000-4000-8000-000000000026' AND value = '+16125550288';
  ASSERT r.sms_capable = true,
    'FAIL 15g: a number with a real SMS thread must be SMS-capable';
  ASSERT r.label NOT LIKE '%unconfirmed%',
    'FAIL 15g2: a threaded number must not be labelled unconfirmed';

  -- 15d. Nothing anywhere is SMS-capable without a real SMS rail behind it.
  ASSERT NOT EXISTS (
    SELECT 1 FROM studio_contact_channels c
     WHERE c.label LIKE '%(00593 backfill)%'
       AND c.sms_capable
       AND NOT public.channel_value_was_on_sms_rail(c.value)),
    'FAIL 15d: the backfill marked a number SMS-capable with no SMS rail behind it';

  RAISE NOTICE '15. the card backfill does not invent SMS capability (M-2/M-1): passed';
END
$$;

-- ─── 16. r3r2 M-1: the two doors, composed ────────────────────────────────
--
-- Each door held its own line: record_channel_consent refused every transition
-- out of `opted_out`, and record_channel_reconsent landed on `pending`, never
-- `granted`. Composed they did not: reconsent moved the row off `opted_out`,
-- and the next recorded grant found a row the first gate no longer refused. Two
-- calls, any studio member, and a recorded STOP was back at `granted` — with
-- the mirror clearing the party-row backstop sendPartySms falls back on.

DO $$
DECLARE
  r      RECORD;
  raised TEXT;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  -- The refusal, recorded.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550233', 'opted_out',
    'inbound_sms', 'Replied STOP', NULL, NULL);

  -- 16a. The direct grant is refused, as before.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550233', 'granted',
      'written', 'Kickoff form', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'channel_opted_out',
    'FAIL 16a: a direct grant over a refusal must be refused, got ' || COALESCE(raised, '<no error>');

  -- 16b. The named door records the studio's fresh consent as EVIDENCE and
  --      leaves the record at opted_out, refusal standing (r7 M7-2).
  PERFORM public.record_channel_reconsent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550233',
    'written', 'Signed a fresh consent at the walkthrough', 'field-sms-v1', NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550233';
  ASSERT r.status = 'opted_out' AND r.refusal_unanswered,
    'FAIL 16b: reconsent must leave the refusal standing, got ' || r.status;
  ASSERT r.opt_out_at IS NOT NULL, 'FAIL 16b2: the refusal date must survive';
  ASSERT r.evidence = 'Signed a fresh consent at the walkthrough',
    'FAIL 16b3: the fresh consent must be on the record, got ' || COALESCE(r.evidence, '<null>');

  -- 16c. THE COMPOSITION. The grant is still refused — now by the first gate
  --      itself, because reconsent no longer moves the row off `opted_out`.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550233', 'granted',
      'written', 'Kickoff form', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'channel_opted_out',
    'FAIL 16c: reconsent + grant must not compose into granted, got ' || COALESCE(raised, '<no error>');

  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550233';
  ASSERT r.status = 'opted_out' AND r.consented_at IS NULL,
    'FAIL 16c2: the refused grant must leave the record at opted_out with no consent date';

  -- 16d. AND `pending` IS NOT A FREE HOP EITHER (r6 B6-1). The gate used to be
  --      stated as "refuse granted", so the studio could keep re-recording
  --      `pending` over an unanswered refusal — and every one of those writes
  --      mirrors onto the seats exactly as a grant does. The gate is on whether
  --      the REFUSAL STANDS, so this is refused too, and refused as what it is.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550233', 'pending',
      'written', 'Re-sent the confirmation text', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'channel_opted_out',
    'FAIL 16d: a pending re-record over an unanswered refusal must be refused, got '
      || COALESCE(raised, '<no error>');
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550233';
  ASSERT r.evidence = 'Signed a fresh consent at the walkthrough',
    'FAIL 16d2: the refused pending must not have restated the record''s evidence, got '
      || COALESCE(r.evidence, '<null>');

  -- 16d3. Recording the REFUSAL is always open — that is the way forward, and
  --       it is what puts the fact back where reconsent() can act on it.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550233', 'opted_out',
    'verbal', 'Said it again on site', NULL, NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550233';
  ASSERT r.status = 'opted_out' AND r.refusal_unanswered,
    'FAIL 16d3: re-recording the refusal must be accepted';

  PERFORM pg_temp.reset_role();

  -- 16e. The recipient answers. The inbound rail writes this table directly as
  --      service_role (sms-inbound/pipeline.ts writeChannelConsent), lowering
  --      refusal_unanswered and stamping a FRESH consented_at — which is what
  --      reopens the studio's door.
  UPDATE studio_channel_consent
     -- clock_timestamp(), not now(): in a real deployment the rail's write is a
     -- LATER transaction than the refusal it answers, and the gate asks for a
     -- consent date strictly after the opt-out date. now() is frozen at
     -- transaction start for the whole of this test file.
     SET status = 'granted', consented_at = clock_timestamp(), refusal_unanswered = false,
         source = 'inbound_sms', evidence = 'Replied START', recorded_at = clock_timestamp()
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550233';

  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550233', 'granted',
    'written', 'Kickoff form', 'field-sms-v1', NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550233';
  ASSERT r.status = 'granted' AND r.evidence = 'Kickoff form',
    'FAIL 16e: after the recipient''s own grant the studio may record again';
  ASSERT r.opt_out_at IS NOT NULL,
    'FAIL 16e2: the refusal date still has to print (R-Q)';
  PERFORM pg_temp.reset_role();

  RAISE NOTICE '16. the two consent doors do not compose past a STOP (M-1): passed';
END
$$;

-- ─── 16B. r4 B-1: and they do not compose past a DATELESS STOP either ─────
--
-- The gate above used to be stated as "opt_out_at set with no later
-- consented_at". A refusal is routinely DATELESS: the shipped portal writes
-- opted_out party rows with a NULL sms_opt_out_at on purpose
-- (use-coordination.ts — "a sibling with no date leaves this row with none"),
-- every pre-00432 row carries no date either, and
-- backfill_channel_consent_from_parties() folds that population verbatim. So
-- the date test failed OPEN for exactly the records the first prod push mints:
-- reconsent() plus a recorded grant walked a real STOP back to `granted` in two
-- calls, by any studio member, and the mirror then cleared the party-row
-- backstop sendPartySms falls back on. The refusal is now a stored FACT.

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_opt_out_at,
                             sms_consent_source, sms_consent_evidence)
VALUES
  ('e0000000-0000-4000-8000-000000000051', 'd0000000-0000-4000-8000-00000000000a', 'sub',
   'Bo Ferrand', '(612) 555-0244', 'opted_out', NULL, 'other', 'Opted out, date unknown');

DO $$
DECLARE
  r      RECORD;
  raised TEXT;
BEGIN
  -- 16Ba. The fold mints the dateless refusal — and records it AS a refusal.
  PERFORM public.backfill_channel_consent_from_parties();
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550244';
  ASSERT FOUND, 'FAIL 16Ba: the fold should mint a record for the opted_out row';
  ASSERT r.status = 'opted_out' AND r.opt_out_at IS NULL,
    'FAIL 16Ba2: this is the DATELESS refusal the portal really writes';
  ASSERT r.refusal_unanswered,
    'FAIL 16Ba3: a folded refusal must be recorded as unanswered, dated or not';

  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  -- 16Bb. The direct grant is refused by the first gate, as always.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550244', 'granted',
      'written', 'Kickoff form', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'channel_opted_out',
    'FAIL 16Bb: a direct grant over a dateless refusal must be refused, got '
    || COALESCE(raised, '<no error>');

  -- 16Bc. THE COMPOSITION, on a refusal with no date. reconsent() records the
  --       fresh consent; the grant that follows must STILL be refused.
  PERFORM public.record_channel_reconsent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550244',
    'written', 'Signed a fresh consent at the walkthrough', 'field-sms-v1', NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550244';
  ASSERT r.status = 'opted_out' AND r.refusal_unanswered,
    'FAIL 16Bc: reconsent keeps the record at opted_out and the refusal unanswered';

  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550244', 'granted',
      'written', 'Kickoff form', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'channel_opted_out',
    'FAIL 16Bc2: a DATELESS refusal must fail closed like a dated one, got '
    || COALESCE(raised, '<no error>');

  -- 16Bd. And the seats still carry the refusal: the backstop sendPartySms
  --       falls back on was never cleared.
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550244';
  ASSERT r.status = 'opted_out' AND r.consented_at IS NULL,
    'FAIL 16Bd: the refused grant must leave the record at opted_out, undated';
  ASSERT NOT EXISTS (
    SELECT 1 FROM project_parties pp
     WHERE pp.phone_e164 = '+16125550244' AND pp.sms_consent_status = 'granted'),
    'FAIL 16Bd2: no seat on a STOPped number may read granted';

  PERFORM pg_temp.reset_role();

  -- 16Be. Only the recipient's own answer opens the door — the rail lowers the
  --       flag, exactly as writeChannelConsent does.
  UPDATE studio_channel_consent
     -- clock_timestamp(), not now(): in a real deployment the rail's write is a
     -- LATER transaction than the refusal it answers, and the gate asks for a
     -- consent date strictly after the opt-out date. now() is frozen at
     -- transaction start for the whole of this test file.
     SET status = 'granted', consented_at = clock_timestamp(), refusal_unanswered = false,
         source = 'inbound_sms', evidence = 'Replied START', recorded_at = clock_timestamp()
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550244';

  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550244', 'granted',
    'written', 'Kickoff form', 'field-sms-v1', NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550244';
  ASSERT r.status = 'granted' AND r.evidence = 'Kickoff form',
    'FAIL 16Be: after the recipient''s own grant the studio may record again';
  PERFORM pg_temp.reset_role();

  RAISE NOTICE '16B. a DATELESS refusal fails closed too (r4 B-1): passed';
END
$$;

-- ─── 17. r3r2 M-2: both sides of an affiliation are the card they claim ────
--
-- person_id and company_id are both FKs into studio_contacts, which holds both
-- kinds of card, and company_id is copied onto studio_contacts.company_id by
-- the pointer trigger — so an unguarded row produced a person card that is its
-- own firm, rendered as its own crew (R-W). owner_type on a channel has the
-- same shape of hole.

INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, company_name, created_by)
VALUES
  ('c0000000-0000-4000-8000-000000000031', 'b0000000-0000-4000-8000-00000000000a',
   'person', 'sub', 'Rosa Villareal', NULL, 'a0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000032', 'b0000000-0000-4000-8000-00000000000a',
   'company', 'sub', NULL, 'Villareal Millwork', 'a0000000-0000-4000-8000-000000000001');

DO $$
DECLARE
  raised TEXT;
  v_ptr  uuid;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  -- 17a. A person card as the FIRM.
  raised := NULL;
  BEGIN
    INSERT INTO studio_person_affiliations (person_id, company_id)
    VALUES ('c0000000-0000-4000-8000-000000000031', 'c0000000-0000-4000-8000-000000000001');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'affiliation_company_not_a_company',
    'FAIL 17a: a person card may not be an affiliation''s firm, got ' || COALESCE(raised, '<no error>');

  -- 17b. A company card as the PERSON.
  raised := NULL;
  BEGIN
    INSERT INTO studio_person_affiliations (person_id, company_id)
    VALUES ('c0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000032');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'affiliation_person_not_a_person',
    'FAIL 17b: a company card may not be an affiliation''s person, got ' || COALESCE(raised, '<no error>');

  -- 17c. The card as its own firm — the shape that reached
  --      studio_contacts.company_id = id through the pointer trigger. The kind
  --      guard catches it before the distinct-cards CHECK ever runs (one card
  --      cannot be both kinds), and either refusal is the right answer.
  raised := NULL;
  BEGIN
    INSERT INTO studio_person_affiliations (person_id, company_id)
    VALUES ('c0000000-0000-4000-8000-000000000031', 'c0000000-0000-4000-8000-000000000031');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised IN ('affiliation_company_not_a_company',
                    'new row for relation "studio_person_affiliations" violates check constraint "studio_person_affiliations_distinct_cards_check"'),
    'FAIL 17c: a card may not be its own firm, got ' || COALESCE(raised, '<no error>');
  ASSERT NOT EXISTS (
    SELECT 1 FROM studio_contacts sc
     WHERE sc.id = 'c0000000-0000-4000-8000-000000000031' AND sc.company_id = sc.id),
    'FAIL 17c2: no card may point at itself as its firm';

  -- 17d. A well-formed affiliation still writes, and still moves the pointer.
  INSERT INTO studio_person_affiliations (person_id, company_id, role_at_firm)
  VALUES ('c0000000-0000-4000-8000-000000000031', 'c0000000-0000-4000-8000-000000000032', 'owner');
  SELECT company_id INTO v_ptr FROM studio_contacts
   WHERE id = 'c0000000-0000-4000-8000-000000000031';
  ASSERT v_ptr = 'c0000000-0000-4000-8000-000000000032',
    'FAIL 17d: the guard must not break the pointer binding';

  -- 17e. An UPDATE that moves either side is guarded too.
  raised := NULL;
  BEGIN
    UPDATE studio_person_affiliations
       SET company_id = 'c0000000-0000-4000-8000-000000000001'
     WHERE person_id = 'c0000000-0000-4000-8000-000000000031';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'affiliation_company_not_a_company',
    'FAIL 17e: the UPDATE path must be guarded too, got ' || COALESCE(raised, '<no error>');

  -- 17f. A channel's owner_type must be the card's own kind.
  raised := NULL;
  BEGIN
    INSERT INTO studio_contact_channels (owner_type, owner_id, channel_kind, value)
    VALUES ('company', 'c0000000-0000-4000-8000-000000000031', 'mobile', '612-555-0234');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'channel_owner_kind_mismatch',
    'FAIL 17f: a person card''s channel may not claim owner_type=company, got ' || COALESCE(raised, '<no error>');

  INSERT INTO studio_contact_channels (owner_type, owner_id, channel_kind, value)
  VALUES ('person', 'c0000000-0000-4000-8000-000000000031', 'mobile', '612-555-0234');
  ASSERT EXISTS (
    SELECT 1 FROM studio_contact_channels
     WHERE owner_id = 'c0000000-0000-4000-8000-000000000031' AND value = '+16125550234'),
    'FAIL 17f2: a matching owner_type must still write';

  PERFORM pg_temp.reset_role();

  -- 17g. The legacy pointer can still name a person card (00417's own CHECK
  --      permits it). The reverse binding must stand down rather than raise
  --      out of the guard and take the studio_contacts write with it.
  UPDATE studio_contacts SET company_id = 'c0000000-0000-4000-8000-000000000001'
   WHERE id = 'c0000000-0000-4000-8000-000000000031';
  ASSERT NOT EXISTS (
    SELECT 1 FROM studio_person_affiliations spa
     WHERE spa.person_id = 'c0000000-0000-4000-8000-000000000031'
       AND spa.company_id = 'c0000000-0000-4000-8000-000000000001'),
    'FAIL 17g: a malformed legacy pointer must not be mirrored into an affiliation';

  RAISE NOTICE '17. affiliation and channel kinds are enforced (M-2): passed';
END
$$;

-- ─── 18. r5 M5-2 (R-AN): the mirror REFRESHES evidence, it never erases it ──
--
-- A record can carry a verdict without carrying every evidence column: the
-- inbound rail writes one from a YES on a number whose disclosure version and
-- recorder live only on the seat, where the portal put them. The mirror used to
-- write those NULLs down, so after a real double opt-in neither the record nor
-- any seat said which disclosure the person was shown.

INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at)
VALUES ('d0000000-0000-4000-8000-0000000000a1', 'W1A Evidence job',
        'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000a',
        'a0000000-0000-4000-8000-000000000001', 'active', NOW(), NOW());

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_consent_source, sms_consent_evidence,
                             sms_consent_recorded_at, sms_consent_disclosure_version,
                             sms_consent_recorded_by)
VALUES ('e0000000-0000-4000-8000-0000000000a1', 'd0000000-0000-4000-8000-0000000000a1',
        'sub', 'Ada Wren', '612-555-0344',
        'pending', 'written', 'Signed the studio''s field-SMS form',
        '2026-03-01T00:00:00Z', 'field-sms-v1', 'a0000000-0000-4000-8000-000000000001');

DO $$
DECLARE
  r RECORD;
BEGIN
  -- The rail's own write, in its own shape: service-side, status + dates +
  -- source + evidence, and NOTHING in disclosure_version / recorded_by.
  INSERT INTO studio_channel_consent (
    organization_id, channel_kind, channel_value, status,
    consented_at, refusal_unanswered, source, evidence, recorded_at,
    disclosure_version, recorded_by)
  VALUES ('b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550344', 'granted',
          NOW(), false, 'inbound_sms', 'Replied YES', NOW(), NULL, NULL);

  SELECT * INTO r FROM project_parties
   WHERE id = 'e0000000-0000-4000-8000-0000000000a1';

  ASSERT r.sms_consent_status = 'granted',
    'FAIL 18a: the verdict must still mirror, got ' || COALESCE(r.sms_consent_status, '<null>');
  ASSERT r.sms_consent_source = 'inbound_sms' AND r.sms_consent_evidence = 'Replied YES',
    'FAIL 18b: the evidence the record DOES carry must still refresh';
  ASSERT r.sms_consent_disclosure_version = 'field-sms-v1',
    'FAIL 18c: the disclosure version the seat held must survive a record that has none, got '
      || COALESCE(r.sms_consent_disclosure_version, '<null>');
  ASSERT r.sms_consent_recorded_by = 'a0000000-0000-4000-8000-000000000001',
    'FAIL 18d: the recorder the seat held must survive too, got '
      || COALESCE(r.sms_consent_recorded_by::text, '<null>');

  RAISE NOTICE '18. the mirror never nulls an evidence column (R-AN): passed';
END
$$;

-- ─── 19. r5 B5-1 (R-AL): the write door reads the seats too ────────────────
--
-- project_parties.sms_consent_* is still writable by the portal (PR-x), so a
-- refusal can stand on a seat with no record behind it — PR-m's manually marked
-- verbal STOP. The send gate tests both ledgers; before R-AL the write door
-- tested only the record, wrote `granted` over the refusal, and the mirror then
-- cleared the very seat the send gate was going to test.

INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at)
VALUES ('d0000000-0000-4000-8000-0000000000a2', 'W1A Seat-refusal job',
        'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000a',
        'a0000000-0000-4000-8000-000000000001', 'active', NOW(), NOW());

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_opt_out_at,
                             sms_consent_source, sms_consent_evidence,
                             sms_consent_recorded_at)
VALUES
  -- Alpha's own seat, refused and DATED, with no consent record anywhere.
  ('e0000000-0000-4000-8000-0000000000a2', 'd0000000-0000-4000-8000-0000000000a2',
   'sub', 'Pete Rusk', '612-555-0322',
   'opted_out', '2026-04-01T00:00:00Z', 'verbal', 'Told the PM to stop texting him',
   '2026-04-01T00:00:00Z'),
  -- BETA's seat, on a different number Alpha has never contacted. R-AK: one
  -- studio's refusal is not another studio's fact, and this door must not
  -- re-open the phone-global reduction.
  ('e0000000-0000-4000-8000-0000000000a3', 'd0000000-0000-4000-8000-00000000000b',
   'sub', 'Pete Rusk', '612-555-0333',
   'opted_out', '2026-04-01T00:00:00Z', 'inbound_sms', 'Replied STOP to Beta',
   '2026-04-01T00:00:00Z');

DO $$
DECLARE
  raised TEXT;
  r      RECORD;
  n      INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  -- 19a. The grant is refused, and refused as what it is.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '(612) 555-0322', 'granted',
      'written', 'We have a new signed form', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'channel_opted_out',
    'FAIL 19a: a dated refusal on this studio''s own seat must refuse the grant, got '
      || COALESCE(raised, '<no error>');

  -- 19b. And the refusal survives byte for byte — no record was minted, and
  --      the seat still says what it said.
  SELECT COUNT(*) INTO n FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = '+16125550322';
  ASSERT n = 0, 'FAIL 19b: a refused write must mint no record, got ' || n;

  SELECT * INTO r FROM project_parties
   WHERE id = 'e0000000-0000-4000-8000-0000000000a2';
  ASSERT r.sms_consent_status = 'opted_out'
     AND r.sms_opt_out_at IS NOT NULL
     AND r.sms_consent_source = 'verbal'
     AND r.sms_consent_evidence = 'Told the PM to stop texting him',
    'FAIL 19b2: the seat''s refusal must survive the refused grant untouched';

  -- 19c. The way past is to put the refusal ON THE BOOKS first…
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '(612) 555-0322', 'opted_out',
    'verbal', 'Told the PM to stop texting him, recorded by the studio', NULL, NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = '+16125550322';
  ASSERT r.status = 'opted_out' AND r.refusal_unanswered,
    'FAIL 19c: recording the refusal must be accepted and stand unanswered';

  --      …after which the record''s own gate governs: still no grant, and
  --      reconsent() is the named door.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '(612) 555-0322', 'granted',
      'written', 'We have a new signed form', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'channel_opted_out',
    'FAIL 19c2: the recorded refusal must still refuse the grant, got '
      || COALESCE(raised, '<no error>');

  PERFORM public.record_channel_reconsent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '(612) 555-0322',
    'written', 'Fresh signed consent, 12 Sep', 'field-sms-v1', NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = '+16125550322';
  ASSERT r.status = 'opted_out' AND r.refusal_unanswered
     AND r.evidence = 'Fresh signed consent, 12 Sep',
    'FAIL 19c3: reconsent() must record the fresh consent and leave the refusal '
    'standing, got ' || COALESCE(r.status, '<null>') || '/' || COALESCE(r.evidence, '<null>');

  -- 19d. R-AK is not re-opened: BETA's dated refusal on +16125550333 is not
  --      Alpha''s fact, and Alpha''s first outreach to that number stands.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0333', 'granted',
    'written', 'Signed at the Alpha kickoff', 'field-sms-v1', NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = '+16125550333';
  ASSERT r.status = 'granted',
    'FAIL 19d: another studio''s refusal must not refuse this studio''s grant, got '
      || COALESCE(r.status, '<null>');

  PERFORM pg_temp.reset_role();

  -- …and Beta's own seat is untouched by Alpha's grant. Read outside Alpha's
  -- role: under RLS a member of Alpha cannot see Beta's rows at all.
  SELECT * INTO r FROM project_parties
   WHERE id = 'e0000000-0000-4000-8000-0000000000a3';
  ASSERT r.sms_consent_status = 'opted_out',
    'FAIL 19d2: Alpha''s grant must not reach Beta''s seat, got ' || COALESCE(r.sms_consent_status, '<null>');

  RAISE NOTICE '19. the write door reads the seats too (R-AL): passed';
END
$$;

-- ─── 20. r5 M5-3 (R-AO): N persons x N firms — siblings stand ──────────────
--
-- The pointer trigger fires on the column the SHIPPED card editor writes on
-- every save (use-studio-contacts.ts:202, :234). Closing every other open
-- affiliation there meant a designer picking the other firm silently ended a
-- standing affiliation and struck the person off that firm's crew list (R-W).

INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, company_name, created_by)
VALUES
  ('c0000000-0000-4000-8000-000000000051', 'b0000000-0000-4000-8000-00000000000a',
   'person', 'sub', 'Ray Thao', NULL, 'a0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000052', 'b0000000-0000-4000-8000-00000000000a',
   'company', 'sub', NULL, 'Thao Electric (sole prop)', 'a0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000053', 'b0000000-0000-4000-8000-00000000000a',
   'company', 'gc', NULL, 'Marrow & Sons', 'a0000000-0000-4000-8000-000000000001');

DO $$
DECLARE
  v UUID;
  n INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  -- The sole proprietor who also crews for a GC: TWO open affiliations
  -- (crm-model §4). The pointer holds the most recently begun.
  INSERT INTO studio_person_affiliations (person_id, company_id, from_date)
  VALUES ('c0000000-0000-4000-8000-000000000051', 'c0000000-0000-4000-8000-000000000052', DATE '2025-01-01'),
         ('c0000000-0000-4000-8000-000000000051', 'c0000000-0000-4000-8000-000000000053', DATE '2026-01-01');
  PERFORM pg_temp.reset_role();

  SELECT company_id INTO v FROM studio_contacts
   WHERE id = 'c0000000-0000-4000-8000-000000000051';
  ASSERT v = 'c0000000-0000-4000-8000-000000000053',
    'FAIL 20a: the pointer must hold the most recently begun, got ' || COALESCE(v::text, '<null>');

  -- 20b. The designer picks the other firm on the card. The pointer moves; the
  --      GC affiliation STANDS.
  UPDATE studio_contacts SET company_id = 'c0000000-0000-4000-8000-000000000052'
   WHERE id = 'c0000000-0000-4000-8000-000000000051';

  SELECT COUNT(*) INTO n FROM studio_person_affiliations
   WHERE person_id = 'c0000000-0000-4000-8000-000000000051' AND to_date IS NULL;
  ASSERT n = 2,
    'FAIL 20b: moving the pointer must leave the sibling affiliation open, got ' || n;
  ASSERT EXISTS (
    SELECT 1 FROM studio_person_affiliations
     WHERE person_id = 'c0000000-0000-4000-8000-000000000051'
       AND company_id = 'c0000000-0000-4000-8000-000000000053'
       AND to_date IS NULL),
    'FAIL 20b2: the GC affiliation must still be open — the person still crews there';

  SELECT company_id INTO v FROM studio_contacts
   WHERE id = 'c0000000-0000-4000-8000-000000000051';
  ASSERT v = 'c0000000-0000-4000-8000-000000000052',
    'FAIL 20b3: the pointer must read what the designer picked, got ' || COALESCE(v::text, '<null>');

  -- 20c. Clearing the firm ends ONLY the one the pointer named, and the
  --      pointer re-derives onto the affiliation that is still standing.
  UPDATE studio_contacts SET company_id = NULL
   WHERE id = 'c0000000-0000-4000-8000-000000000051';

  ASSERT EXISTS (
    SELECT 1 FROM studio_person_affiliations
     WHERE person_id = 'c0000000-0000-4000-8000-000000000051'
       AND company_id = 'c0000000-0000-4000-8000-000000000052'
       AND to_date IS NOT NULL),
    'FAIL 20c: clearing the pointer must close the affiliation it named';
  ASSERT EXISTS (
    SELECT 1 FROM studio_person_affiliations
     WHERE person_id = 'c0000000-0000-4000-8000-000000000051'
       AND company_id = 'c0000000-0000-4000-8000-000000000053'
       AND to_date IS NULL),
    'FAIL 20c2: the sibling must survive the clear';

  SELECT company_id INTO v FROM studio_contacts
   WHERE id = 'c0000000-0000-4000-8000-000000000051';
  ASSERT v = 'c0000000-0000-4000-8000-000000000053',
    'FAIL 20c3: the pointer must re-derive onto the surviving open affiliation, got '
      || COALESCE(v::text, '<null>');

  RAISE NOTICE '20. the pointer moves one affiliation, not all of them (R-AO): passed';
END
$$;

-- ─── 21. r5 M5-4 (R-AP): the three designated people ───────────────────────
--
-- paperwork_contact_person_id / signer_person_id / site_contact_person_id are
-- plain self-FKs into studio_contacts, which holds both kinds of card and every
-- studio's cards. Same hole assert_affiliation_card_kinds() closes, same shape
-- of guard.

INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind, full_name, company_name, created_by)
VALUES
  ('c0000000-0000-4000-8000-000000000061', 'b0000000-0000-4000-8000-00000000000b',
   'person', 'sub', 'Beta Person', NULL, 'a0000000-0000-4000-8000-000000000002'),
  ('c0000000-0000-4000-8000-000000000062', 'b0000000-0000-4000-8000-00000000000a',
   'person', 'sub', 'Alpha Paperwork Person', NULL, 'a0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000063', 'b0000000-0000-4000-8000-00000000000a',
   'company', 'gc', NULL, 'Alpha GC', 'a0000000-0000-4000-8000-000000000001');

DO $$
DECLARE
  raised TEXT;
  r      RECORD;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  -- 21a. Another studio's card.
  raised := NULL;
  BEGIN
    UPDATE studio_contacts
       SET paperwork_contact_person_id = 'c0000000-0000-4000-8000-000000000061'
     WHERE id = 'c0000000-0000-4000-8000-000000000063';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'designated_person_other_studio',
    'FAIL 21a: a cross-studio paperwork contact must be refused, got ' || COALESCE(raised, '<no error>');

  -- 21b. A COMPANY card as the signer.
  raised := NULL;
  BEGIN
    UPDATE studio_contacts
       SET signer_person_id = 'c0000000-0000-4000-8000-000000000002'
     WHERE id = 'c0000000-0000-4000-8000-000000000063';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'designated_person_not_a_person',
    'FAIL 21b: a firm may not sign for a firm, got ' || COALESCE(raised, '<no error>');

  -- 21c. The row itself.
  raised := NULL;
  BEGIN
    UPDATE studio_contacts
       SET site_contact_person_id = 'c0000000-0000-4000-8000-000000000063'
     WHERE id = 'c0000000-0000-4000-8000-000000000063';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'designated_person_is_self',
    'FAIL 21c: a firm may not be its own site contact, got ' || COALESCE(raised, '<no error>');

  -- 21d. The INSERT path is guarded too.
  raised := NULL;
  BEGIN
    INSERT INTO studio_contacts (organization_id, entity_kind, contact_kind, company_name,
                                 created_by, signer_person_id)
    VALUES ('b0000000-0000-4000-8000-00000000000a', 'company', 'gc', 'Alpha GC Two',
            'a0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000061');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'designated_person_other_studio',
    'FAIL 21d: the INSERT path must be guarded too, got ' || COALESCE(raised, '<no error>');

  -- 21e. A person card in the same studio is accepted, on all three.
  UPDATE studio_contacts
     SET paperwork_contact_person_id = 'c0000000-0000-4000-8000-000000000062',
         signer_person_id            = 'c0000000-0000-4000-8000-000000000062',
         site_contact_person_id      = 'c0000000-0000-4000-8000-000000000062'
   WHERE id = 'c0000000-0000-4000-8000-000000000063';
  SELECT * INTO r FROM studio_contacts WHERE id = 'c0000000-0000-4000-8000-000000000063';
  ASSERT r.paperwork_contact_person_id = 'c0000000-0000-4000-8000-000000000062'
     AND r.signer_person_id            = 'c0000000-0000-4000-8000-000000000062'
     AND r.site_contact_person_id      = 'c0000000-0000-4000-8000-000000000062',
    'FAIL 21e: a well-formed designation must still write';

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '21. the designated people are people, in this studio (R-AP): passed';
END
$$;

-- ─── 22. r6 B6-1 / M6-1: the seat gate is on the REFUSAL, not the verdict ──
--
-- R-AL's seat gate arrived narrowed twice, and both narrowings were walkable:
--   · it ran only for p_status = 'granted', so `pending` was a free first hop.
--     A recorded `pending` mirrors `pending` — and, before M6-2, a NULL
--     opt_out_at — onto every seat in the studio on that number, erasing the
--     refusal AND its date; the `granted` call behind it then passed every leg,
--     and reconsent() could not recover the row (it requires opted_out).
--   · it required sms_opt_out_at IS NOT NULL, so it failed OPEN for a DATELESS
--     refusal — the shape the shipped portal writes on purpose
--     (use-coordination.ts, "opted out, date unknown") and the shape every
--     pre-00432 row carries. The SEND gate it mirrors (orgHasOptedOutParty)
--     has no date test at all.

INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at)
VALUES ('d0000000-0000-4000-8000-0000000000a4', 'W1A r6 seat-gate job',
        'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000a',
        'a0000000-0000-4000-8000-000000000001', 'active', NOW(), NOW());

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_opt_out_at,
                             sms_consent_source, sms_consent_evidence,
                             sms_consent_recorded_at)
VALUES
  -- DATELESS, exactly as the portal writes it.
  ('e0000000-0000-4000-8000-0000000000a4', 'd0000000-0000-4000-8000-0000000000a4',
   'sub', 'Ray Thao', '612-555-0411',
   'opted_out', NULL, 'other', 'Opted out, date unknown', '2026-04-01T00:00:00Z'),
  -- DATED, and fully evidenced — B6-1's own repro.
  ('e0000000-0000-4000-8000-0000000000a5', 'd0000000-0000-4000-8000-0000000000a4',
   'sub', 'Sam Rowe', '612-555-0412',
   'opted_out', '2025-12-03T00:00:00Z', 'inbound_sms', 'Replied STOP', '2025-12-03T00:00:00Z');

DO $$
DECLARE
  raised TEXT;
  r      RECORD;
  n      INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  -- 22a. M6-1: a DATELESS seat refusal refuses the grant, like a dated one.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0411', 'granted',
      'written', 'We have a new signed form', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'channel_opted_out',
    'FAIL 22a: a DATELESS seat refusal must refuse the grant, got '
      || COALESCE(raised, '<no error>');

  -- 22b. B6-1: and `pending` is refused over it too — it is not a free hop.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0411', 'pending',
      'written', 'Sending the confirmation text', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'channel_opted_out',
    'FAIL 22b: pending over a seat refusal must be refused, got '
      || COALESCE(raised, '<no error>');

  -- 22c. B6-1's named case: a DATED, fully evidenced seat refusal + `pending`.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0412', 'pending',
      'written', 'Sending the confirmation text', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'channel_opted_out',
    'FAIL 22c: pending over a dated seat refusal must be refused, got '
      || COALESCE(raised, '<no error>');

  -- 22d. Nothing was minted, and neither seat moved: the refusal and its date
  --      are still on the books the send gate reads.
  SELECT COUNT(*) INTO n FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value IN ('+16125550411', '+16125550412');
  ASSERT n = 0, 'FAIL 22d: a refused write must mint no record, got ' || n;

  SELECT * INTO r FROM project_parties WHERE id = 'e0000000-0000-4000-8000-0000000000a4';
  ASSERT r.sms_consent_status = 'opted_out' AND r.sms_opt_out_at IS NULL
     AND r.sms_consent_evidence = 'Opted out, date unknown',
    'FAIL 22d2: the dateless refusal must survive untouched';

  SELECT * INTO r FROM project_parties WHERE id = 'e0000000-0000-4000-8000-0000000000a5';
  ASSERT r.sms_consent_status = 'opted_out'
     AND r.sms_opt_out_at = '2025-12-03T00:00:00Z'::timestamptz,
    'FAIL 22d3: the dated refusal and its date must survive untouched';

  -- 22e. The two-call walk is dead end to end. Recording the refusal is the
  --      way forward — and the way back is still reconsent() plus the
  --      recipient's own answer, never a second studio-side call.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0412', 'opted_out',
    'inbound_sms', 'Replied STOP', NULL, NULL);
  PERFORM public.record_channel_reconsent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0412',
    'written', 'Signed a fresh consent', 'field-sms-v1', NULL);
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0412', 'granted',
      'written', 'We have a new signed form', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'channel_opted_out',
    'FAIL 22e: the walk must still end at the recipient, got '
      || COALESCE(raised, '<no error>');

  -- 22f. The gate does not over-refuse: a number this studio holds no refusal
  --      on takes `pending` exactly as before.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0413', 'pending',
    'written', 'Signed the studio''s field-SMS form', 'field-sms-v1', NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550413';
  ASSERT r.status = 'pending',
    'FAIL 22f: a clean number must still take pending, got ' || COALESCE(r.status, '<null>');

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '22. the seat gate is on the refusal, not the verdict (r6 B6-1/M6-1): passed';
END
$$;

-- ─── 23. r6 M6-2: the mirror keeps the two dates ──────────────────────────
--
-- The mirror COALESCEd the four evidence columns (R-AN) but copied
-- consented_at and opt_out_at straight. A record carrying a verdict without an
-- opt_out_at is the ORDINARY case — the inbound rail mints one for a number
-- with no prior row — so the mirror wrote NULL over a real, dated refusal on
-- every seat. R-Q requires "granted 2 May 2025, opted out 3 Dec 2025" to stay
-- printable, and the RPC goes to trouble to keep the pair on the record; the
-- mirror must not destroy it on the seats.

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_consented_at, sms_opt_out_at,
                             sms_consent_source, sms_consent_evidence,
                             sms_consent_recorded_at, sms_consent_disclosure_version)
VALUES
  ('e0000000-0000-4000-8000-0000000000a6', 'd0000000-0000-4000-8000-0000000000a4',
   'sub', 'Bo Ferrand', '612-555-0420',
   'opted_out', '2025-05-02T00:00:00Z', '2025-12-03T00:00:00Z',
   'inbound_sms', 'Replied STOP', '2025-12-03T00:00:00Z', 'field-sms-v1');

DO $$
DECLARE
  r RECORD;
BEGIN
  -- The inbound rail's own write, as it really lands: service_role, status
  -- granted, a fresh consented_at, NO opt_out_at (the rail mints the row from
  -- the START it just received). This is the only writer that still reaches a
  -- number with a standing seat refusal — the studio's door now refuses it.
  INSERT INTO studio_channel_consent (
    organization_id, channel_kind, channel_value, status,
    consented_at, opt_out_at, refusal_unanswered,
    source, evidence, recorded_at, disclosure_version)
  VALUES (
    'b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550420', 'granted',
    '2026-06-01T00:00:00Z', NULL, false,
    'inbound_sms', 'Replied START', '2026-06-01T00:00:00Z', 'field-sms-v1');

  SELECT * INTO r FROM project_parties WHERE id = 'e0000000-0000-4000-8000-0000000000a6';
  ASSERT r.sms_consent_status = 'granted',
    'FAIL 23a: the verdict itself is still copied, got ' || COALESCE(r.sms_consent_status, '<null>');
  ASSERT r.sms_consented_at = '2026-06-01T00:00:00Z'::timestamptz,
    'FAIL 23a2: a date the record DOES carry is written, got '
      || COALESCE(r.sms_consented_at::text, '<null>');
  ASSERT r.sms_opt_out_at = '2025-12-03T00:00:00Z'::timestamptz,
    'FAIL 23b: the seat''s refusal date must survive a verdict that does not '
      'restate it, got ' || COALESCE(r.sms_opt_out_at::text, '<null>');

  -- And the other way round: a refusal that carries no consented_at must not
  -- erase the grant date standing beside it (R-Q's pair, both directions).
  UPDATE studio_channel_consent
     SET status = 'opted_out', consented_at = NULL, opt_out_at = '2026-07-01T00:00:00Z',
         refusal_unanswered = true, source = 'inbound_sms', evidence = 'Replied STOP again',
         recorded_at = NOW()
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550420';

  SELECT * INTO r FROM project_parties WHERE id = 'e0000000-0000-4000-8000-0000000000a6';
  ASSERT r.sms_consent_status = 'opted_out',
    'FAIL 23c: the refusal is mirrored, got ' || COALESCE(r.sms_consent_status, '<null>');
  ASSERT r.sms_opt_out_at = '2026-07-01T00:00:00Z'::timestamptz,
    'FAIL 23c2: the fresh refusal date is written, got '
      || COALESCE(r.sms_opt_out_at::text, '<null>');
  ASSERT r.sms_consented_at = '2026-06-01T00:00:00Z'::timestamptz,
    'FAIL 23d: the grant date must still print beside the refusal (R-Q), got '
      || COALESCE(r.sms_consented_at::text, '<null>');

  RAISE NOTICE '23. the mirror keeps both dates (r6 M6-2): passed';
END
$$;

-- ─── 24. r6 M6-4: the routed person is a person, in the subject's studio ───
--
-- route_to_person_id is the fourth self-FK into studio_contacts and the only
-- one R-AP's guard did not cover. R-L prints the routed person's email and
-- office phone on that line, §5.4 collapses Channels to "Do not contact
-- directly. Write <name> instead.", and R-S appends the routed line wherever a
-- rule blocks — so a dangling or cross-tenant route blanks the one line that
-- says how to reach a do-not-contact person, and a self-route renders "write
-- themselves instead".

DO $$
DECLARE
  raised TEXT;
  r      RECORD;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  -- 24a. Another studio's card.
  raised := NULL;
  BEGIN
    INSERT INTO studio_contact_rules (subject_type, subject_id, route_to_person_id, reason)
    VALUES ('company', 'c0000000-0000-4000-8000-000000000063',
            'c0000000-0000-4000-8000-000000000061', 'cross-tenant route');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'rule_route_other_studio',
    'FAIL 24a: a cross-studio route must be refused, got ' || COALESCE(raised, '<no error>');

  -- 24b. The subject itself.
  raised := NULL;
  BEGIN
    INSERT INTO studio_contact_rules (subject_type, subject_id, route_to_person_id, reason)
    VALUES ('person', 'c0000000-0000-4000-8000-000000000062',
            'c0000000-0000-4000-8000-000000000062', 'write themselves instead');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'rule_route_is_self',
    'FAIL 24b: a self-route must be refused, got ' || COALESCE(raised, '<no error>');

  -- 24c. A COMPANY card.
  raised := NULL;
  BEGIN
    INSERT INTO studio_contact_rules (subject_type, subject_id, route_to_person_id, reason)
    VALUES ('person', 'c0000000-0000-4000-8000-000000000001',
            'c0000000-0000-4000-8000-000000000002', 'write the firm instead');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'rule_route_not_a_person',
    'FAIL 24c: a route to a firm must be refused, got ' || COALESCE(raised, '<no error>');

  -- 24d. A person card in the same studio is accepted.
  INSERT INTO studio_contact_rules (subject_type, subject_id, route_to_person_id,
                                    channels_forbidden, reason)
  VALUES ('person', 'c0000000-0000-4000-8000-000000000001',
          'c0000000-0000-4000-8000-000000000062', ARRAY['mobile'],
          'Never texted; write the office manager');
  SELECT * INTO r FROM studio_contact_rules
   WHERE subject_type = 'person' AND subject_id = 'c0000000-0000-4000-8000-000000000001';
  ASSERT r.route_to_person_id = 'c0000000-0000-4000-8000-000000000062',
    'FAIL 24d: a well-formed route must write';

  -- 24e. The UPDATE path is guarded too.
  raised := NULL;
  BEGIN
    UPDATE studio_contact_rules
       SET route_to_person_id = 'c0000000-0000-4000-8000-000000000061'
     WHERE subject_id = 'c0000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'rule_route_other_studio',
    'FAIL 24e: the UPDATE path must be guarded, got ' || COALESCE(raised, '<no error>');

  -- 24f. The engagement leg resolves the studio through the project, not
  --      through studio_contacts — and holds the same line.
  raised := NULL;
  BEGIN
    INSERT INTO studio_contact_rules (subject_type, subject_id, route_to_person_id, reason)
    VALUES ('engagement', 'e0000000-0000-4000-8000-000000000001',
            'c0000000-0000-4000-8000-000000000061', 'cross-tenant job override');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'rule_route_other_studio',
    'FAIL 24f: a cross-studio job override must be refused, got ' || COALESCE(raised, '<no error>');

  INSERT INTO studio_contact_rules (subject_type, subject_id, route_to_person_id, reason)
  VALUES ('engagement', 'e0000000-0000-4000-8000-000000000001',
          'c0000000-0000-4000-8000-000000000062', 'On this job, write the PM');
  SELECT * INTO r FROM studio_contact_rules
   WHERE subject_type = 'engagement' AND subject_id = 'e0000000-0000-4000-8000-000000000001';
  ASSERT r.route_to_person_id = 'c0000000-0000-4000-8000-000000000062',
    'FAIL 24f2: a same-studio job override must write';

  -- 24g. A rule with no route at all is untouched by the guard.
  INSERT INTO studio_contact_rules (subject_type, subject_id, channels_forbidden, reason)
  VALUES ('company', 'c0000000-0000-4000-8000-000000000002', ARRAY['mobile'],
          'Dispatch only');
  SELECT * INTO r FROM studio_contact_rules
   WHERE subject_type = 'company' AND subject_id = 'c0000000-0000-4000-8000-000000000002';
  ASSERT r.route_to_person_id IS NULL,
    'FAIL 24g: a routeless rule must still write';

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '24. the routed person is a person, in this studio (r6 M6-4): passed';
END
$$;

-- ─── 25. r6 M6-5: the channel vocabulary is CHECKED, both ways ─────────────
--
-- The table's own COMMENT promises "Omission fails closed at the composer,
-- never open." A WRONG value is not an omission and fails OPEN: '{never_text}',
-- '{SMS}', '{txt}', '{carrier pigeon}' all match nothing the composer compares
-- against, so R-S's blocked clause never prints and the forbidding fact is
-- silently absent from the one table that is supposed to hold it. F-27 Ray Thao
-- ("NEVER texted; scheduled through 311") and F-10 Sam Rowe ("never texted")
-- are the fixture cases that lose.

DO $$
DECLARE
  state TEXT;
  r     RECORD;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  -- 25a. The reviewer's own probe value.
  state := NULL;
  BEGIN
    UPDATE studio_contact_rules SET channels_forbidden = ARRAY['carrier pigeon', 'sms']
     WHERE subject_type = 'person' AND subject_id = 'c0000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN state := SQLSTATE; END;
  ASSERT state = '23514',
    'FAIL 25a: an out-of-vocabulary channels_forbidden must be refused, got '
      || COALESCE(state, '<no error>');

  -- 25b. The near-misses that read like the real thing.
  FOR r IN SELECT unnest(ARRAY['never_text', 'SMS', 'txt', 'phone']) AS v LOOP
    state := NULL;
    BEGIN
      UPDATE studio_contact_rules SET channels_forbidden = ARRAY[r.v]
       WHERE subject_type = 'person' AND subject_id = 'c0000000-0000-4000-8000-000000000001';
    EXCEPTION WHEN check_violation THEN state := SQLSTATE; END;
    ASSERT state = '23514',
      'FAIL 25b: channels_forbidden = {' || r.v || '} must be refused, got '
        || COALESCE(state, '<no error>');
  END LOOP;

  -- 25c. channels_allowed is checked the same way — one door, not one and a half.
  state := NULL;
  BEGIN
    UPDATE studio_contact_rules SET channels_allowed = ARRAY['text_message']
     WHERE subject_type = 'person' AND subject_id = 'c0000000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN state := SQLSTATE; END;
  ASSERT state = '23514',
    'FAIL 25c: an out-of-vocabulary channels_allowed must be refused, got '
      || COALESCE(state, '<no error>');

  -- 25d. The whole real vocabulary is accepted, on both columns, and the empty
  --      array (the default, and the ordinary state) stays legal.
  UPDATE studio_contact_rules
     SET channels_allowed   = ARRAY['portal_311', 'office', 'dispatch', 'after_hours',
                                    'email', 'ap_email', 'mobile'],
         channels_forbidden = ARRAY['mobile']
   WHERE subject_type = 'person' AND subject_id = 'c0000000-0000-4000-8000-000000000001';
  SELECT * INTO r FROM studio_contact_rules
   WHERE subject_type = 'person' AND subject_id = 'c0000000-0000-4000-8000-000000000001';
  ASSERT array_length(r.channels_allowed, 1) = 7 AND r.channels_forbidden = ARRAY['mobile'],
    'FAIL 25d: the real vocabulary must be accepted on both columns';

  UPDATE studio_contact_rules SET channels_allowed = '{}', channels_forbidden = '{}'
   WHERE subject_type = 'person' AND subject_id = 'c0000000-0000-4000-8000-000000000001';

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '25. the channel vocabulary is checked, both ways (r6 M6-5): passed';
END
$$;

-- ─── 26. r7 M7-1: this door never lowers refusal_unanswered ────────────────
--
-- After r6's M6-3 fix the send rail refuses on refusal_unanswered whatever the
-- status says, so the flag is the fact sending rests on. The upsert exempted a
-- record already AT `granted` from the transition gate — so its evidence could
-- be restated — and the write that came through then set the flag FALSE. One
-- ordinary record_channel_consent(…,'granted',…) by any studio member, no
-- recipient involved, and the number was sendable again.
--
-- The state is reachable from the FIRST PROD FOLD:
-- backfill_channel_consent_from_parties() raises the flag for any winning row
-- carrying an opt-out date no later consent answered, whatever its status — a
-- legacy seat reading `granted` with a stale sms_opt_out_at and no
-- sms_consented_at folds to `granted` + flag true. That fold behaviour is ruled
-- correct (the refusal is the half that fails closed); what is fixed is the
-- door that lowered the flag on it.

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_consented_at, sms_opt_out_at,
                             sms_consent_source, sms_consent_evidence,
                             sms_consent_recorded_at, sms_consent_disclosure_version)
VALUES
  ('e0000000-0000-4000-8000-0000000000a7', 'd0000000-0000-4000-8000-0000000000a4',
   'sub', 'Nils Brandt', '612-555-0430',
   'granted', NULL, '2025-12-03T00:00:00Z',
   'verbal', 'Said yes on site, years ago', '2024-02-01T00:00:00Z', 'field-sms-v1');

DO $$
DECLARE
  r      RECORD;
  raised TEXT;
BEGIN
  -- 26a. The fold mints the contradictory legacy row: granted, with a refusal
  --      nobody answered standing under it.
  PERFORM public.backfill_channel_consent_from_parties();
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550430';
  ASSERT FOUND, 'FAIL 26a: the fold should mint a record for the granted row';
  ASSERT r.status = 'granted' AND r.refusal_unanswered
     AND r.opt_out_at = '2025-12-03T00:00:00Z'::timestamptz,
    'FAIL 26a2: a granted winner with an unanswered opt-out must fold to '
    'granted + refusal_unanswered, got ' || COALESCE(r.status, '<null>');

  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  -- 26b. THE FINDING: a granted-on-granted re-record must NOT get through, and
  --      must not lower the flag.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0430', 'granted',
      'verbal', 'I asked him again today', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'consent_awaiting_recipient',
    'FAIL 26b: granted-on-granted over an unanswered refusal must be refused, got '
      || COALESCE(raised, '<no error>');

  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550430';
  ASSERT r.refusal_unanswered,
    'FAIL 26b2: the refused write must leave the flag standing';
  ASSERT r.consented_at IS NULL AND r.evidence = 'Said yes on site, years ago',
    'FAIL 26b3: the refused write must not stamp a consent date or new evidence, got '
      || COALESCE(r.evidence, '<null>');

  -- 26c. `pending` is not a way round it either.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0430', 'pending',
      'written', 'Sending the confirmation text', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'consent_awaiting_recipient',
    'FAIL 26c: pending over an unanswered refusal must be refused, got '
      || COALESCE(raised, '<no error>');

  -- 26d. Recording the REFUSAL is still open — the way forward, not around —
  --      and it leaves the fact where reconsent() can act on it.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0430', 'opted_out',
    'other', 'The date on the old record is a refusal nobody answered', NULL, NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550430';
  ASSERT r.status = 'opted_out' AND r.refusal_unanswered,
    'FAIL 26d: recording the refusal must be accepted';

  PERFORM pg_temp.reset_role();

  -- 26e. Only the inbound rail lowers the flag (service_role, writing this
  --      table directly on a YES/START), and then the studio's door opens.
  UPDATE studio_channel_consent
     -- clock_timestamp(), not now(): in a real deployment the rail's write is a
     -- LATER transaction than the refusal it answers, and the gate asks for a
     -- consent date strictly after the opt-out date. now() is frozen at
     -- transaction start for the whole of this test file.
     SET status = 'granted', consented_at = clock_timestamp(), refusal_unanswered = false,
         source = 'inbound_sms', evidence = 'Replied START', recorded_at = clock_timestamp()
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550430';

  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0430', 'granted',
    'written', 'Kickoff form', 'field-sms-v1', NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550430';
  ASSERT r.status = 'granted' AND r.evidence = 'Kickoff form' AND NOT r.refusal_unanswered,
    'FAIL 26e: after the recipient''s own answer the studio may record again';
  PERFORM pg_temp.reset_role();

  RAISE NOTICE '26. no studio-side verdict lowers refusal_unanswered (r7 M7-1): passed';
END
$$;

-- ─── 27. r7 M7-2: reconsent is evidence-only, and re-callable ──────────────
--
-- PR-m names a studio-side act after a STOP: a fresh recorded consent. It used
-- to land the record on `pending` "so the double opt-in still runs" — but after
-- r6's M6-3 fix the flag refuses EVERY send including the opt-in invite, so
-- nothing ran; the mirrored `pending` erased the party-row refusal the send
-- rail falls back on; and the row was no longer at the one status reconsent()
-- can act on, so it could not be called again. The studio was strictly worse
-- off for calling it. It now writes evidence and leaves everything else
-- standing.

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status)
VALUES
  ('e0000000-0000-4000-8000-0000000000a8', 'd0000000-0000-4000-8000-0000000000a4',
   'sub', 'Ida Ruiz', '612-555-0431', 'not_asked'),
  -- r6 R6-M1's population: a refusal with NO SOURCE AND NO WORDS of its own.
  -- This is what the shipped portal writes on purpose (use-coordination.ts
  -- writes `opted_out` together with the not-asked columns) and what every
  -- pre-00432 row carries; the fold mints it verbatim.
  ('e0000000-0000-4000-8000-0000000000a9', 'd0000000-0000-4000-8000-0000000000a4',
   'sub', 'Ola Nyquist', '612-555-0433', 'opted_out');

-- r8 R8-M1's population: THE SIBLING SEAT. Same studio, same number, carrying
-- the GRANT's evidence — the studio's own consent form, dated the day of the
-- kickoff. project_parties has ONE evidence set, so this is the seat the
-- mirror's COALESCE quietly left asserting that form AS the refusal.
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_consent_source,
                             sms_consent_evidence, sms_consent_recorded_at,
                             sms_consent_recorded_by, sms_consented_at)
VALUES
  ('e0000000-0000-4000-8000-0000000000aa', 'd0000000-0000-4000-8000-0000000000a4',
   'sub', 'Nils Ek', '612-555-0433', 'granted', 'written',
   'Signed consent form at kickoff', '2026-01-02 00:00:00+00',
   'a0000000-0000-4000-8000-000000000001', '2026-01-02 00:00:00+00');

DO $$
DECLARE
  r      RECORD;
  raised TEXT;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  -- The refusal, recorded and mirrored onto the seat.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0431', 'opted_out',
    'inbound_sms', 'Replied STOP', NULL, NULL);
  SELECT * INTO r FROM project_parties WHERE id = 'e0000000-0000-4000-8000-0000000000a8';
  ASSERT r.sms_consent_status = 'opted_out',
    'FAIL 27a: the refusal must reach the seat, got ' || COALESCE(r.sms_consent_status, '<null>');

  -- 27b. The studio's fresh consent goes ON the record; the record stays
  --      opted_out with the refusal unanswered.
  PERFORM public.record_channel_reconsent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0431',
    'written', 'Signed a fresh consent at the walkthrough', 'field-sms-v1', NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550431';
  ASSERT r.status = 'opted_out' AND r.refusal_unanswered,
    'FAIL 27b: reconsent must leave the refusal standing, got ' || COALESCE(r.status, '<null>');
  ASSERT r.evidence = 'Signed a fresh consent at the walkthrough'
     AND r.source = 'written' AND r.disclosure_version = 'field-sms-v1',
    'FAIL 27b2: the studio''s fresh consent must be on the record';

  -- 27b3. r8 W4-M2: AND THE REFUSAL'S OWN WORDS ARE STILL THERE. With one
  --       shared evidence set this call wrote `written` / 'Signed a fresh
  --       consent…' straight over `inbound_sms` / 'Replied STOP' — the record
  --       still refused every send, but it could no longer say what the refusal
  --       was or that it arrived BY TEXT, which is the noun R-Q's sentence
  --       prints. The mirror then pushed the same overwrite onto every seat.
  ASSERT r.opt_out_source = 'inbound_sms' AND r.opt_out_evidence = 'Replied STOP',
    'FAIL 27b3: reconsent must not touch the refusal''s own evidence, got '
      || COALESCE(r.opt_out_source, '<null>') || ' / '
      || COALESCE(r.opt_out_evidence, '<null>');
  ASSERT r.opt_out_recorded_at IS NOT NULL
     AND r.opt_out_recorded_by = 'a0000000-0000-4000-8000-000000000001',
    'FAIL 27b4: the refusal keeps who wrote it down, and when';

  -- 27c. THE BACKSTOP SURVIVES. The seat still reads opted_out — the `pending`
  --      hop used to clear exactly this, which is what let the invite out.
  SELECT * INTO r FROM project_parties WHERE id = 'e0000000-0000-4000-8000-0000000000a8';
  ASSERT r.sms_consent_status = 'opted_out',
    'FAIL 27c: the seat''s refusal must survive reconsent, got '
      || COALESCE(r.sms_consent_status, '<null>');
  -- 27c2. r9 R5-M1: AND THE SEAT SAYS WHAT THE REFUSAL WAS, not what the
  --       studio's paperwork says. project_parties has ONE evidence set, so
  --       mirroring the record's CONSENT columns under an `opted_out` status
  --       made the seat read (opted_out, written, 'Signed a fresh consent…') —
  --       R-Q's sentence, read off the seat, became "Opted out in writing", and
  --       the 10DLC artifact of how the STOP arrived was gone from the only
  --       copy every shipped surface reads. The mirror now carries the
  --       refusal's own set when the verdict is a refusal.
  ASSERT r.sms_consent_source = 'inbound_sms'
     AND r.sms_consent_evidence = 'Replied STOP',
    'FAIL 27c2: the seat must keep the refusal''s own source and words, got '
      || COALESCE(r.sms_consent_source, '<null>') || ' / '
      || COALESCE(r.sms_consent_evidence, '<null>');
  -- The disclosure version has no refusal-side twin and still comes from the
  -- record, so the studio's fresh paperwork does reach the seat there.
  ASSERT r.sms_consent_disclosure_version = 'field-sms-v1',
    'FAIL 27c3: the record''s disclosure version still mirrors, got '
      || COALESCE(r.sms_consent_disclosure_version, '<null>');

  -- 27d. RE-CALLABLE: the door does not move the row off the status it needs,
  --      so a later, better-evidenced consent can be recorded.
  PERFORM public.record_channel_reconsent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0431',
    'written', 'Countersigned at the second walkthrough', 'field-sms-v1', NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550431';
  ASSERT r.evidence = 'Countersigned at the second walkthrough' AND r.status = 'opted_out',
    'FAIL 27d: reconsent must stay re-callable, got ' || COALESCE(r.evidence, '<null>');
  ASSERT r.opt_out_source = 'inbound_sms' AND r.opt_out_evidence = 'Replied STOP',
    'FAIL 27d2: a second reconsent must not reach the refusal''s evidence either';
  SELECT * INTO r FROM project_parties WHERE id = 'e0000000-0000-4000-8000-0000000000a8';
  ASSERT r.sms_consent_source = 'inbound_sms'
     AND r.sms_consent_evidence = 'Replied STOP',
    'FAIL 27d3: nor may a second reconsent reach the seat''s copy of it, got '
      || COALESCE(r.sms_consent_source, '<null>') || ' / '
      || COALESCE(r.sms_consent_evidence, '<null>');

  -- 27e. And it buys no grant: the studio still cannot type its way past the
  --      refusal.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0431', 'granted',
      'written', 'Countersigned at the second walkthrough', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'channel_opted_out',
    'FAIL 27e: a grant after reconsent must still be refused, got '
      || COALESCE(raised, '<no error>');

  PERFORM pg_temp.reset_role();

  -- 27f. The recipient answers on the rail, and only then does the door open.
  UPDATE studio_channel_consent
     -- clock_timestamp(), not now(): in a real deployment the rail's write is a
     -- LATER transaction than the refusal it answers, and the gate asks for a
     -- consent date strictly after the opt-out date. now() is frozen at
     -- transaction start for the whole of this test file.
     SET status = 'granted', consented_at = clock_timestamp(), refusal_unanswered = false,
         source = 'inbound_sms', evidence = 'Replied START', recorded_at = clock_timestamp()
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550431';

  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0431', 'granted',
    'written', 'Kickoff form', 'field-sms-v1', NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550431';
  ASSERT r.status = 'granted' AND r.evidence = 'Kickoff form',
    'FAIL 27f: after the recipient''s own answer the studio may record again';
  -- 27g. The answered refusal is still on the books, in its own words: a
  --      carrier audit asks about the STOP whether or not it was answered.
  ASSERT r.opt_out_source = 'inbound_sms' AND r.opt_out_evidence = 'Replied STOP',
    'FAIL 27g: a later grant must not speak for the refusal it followed, got '
      || COALESCE(r.opt_out_source, '<null>');
  -- 27h. r9 R5-M1: the swap is scoped to refusals. Once the verdict is
  --      `granted` the seat carries the STUDIO's consent set again — the seat
  --      is the mirror of the verdict that stands, and the verdict that stands
  --      is a grant.
  SELECT * INTO r FROM project_parties WHERE id = 'e0000000-0000-4000-8000-0000000000a8';
  ASSERT r.sms_consent_status = 'granted'
     AND r.sms_consent_source = 'written'
     AND r.sms_consent_evidence = 'Kickoff form',
    'FAIL 27h: a granted verdict mirrors the consent set onto the seat, got '
      || COALESCE(r.sms_consent_status, '<null>') || ' / '
      || COALESCE(r.sms_consent_source, '<null>') || ' / '
      || COALESCE(r.sms_consent_evidence, '<null>');
  PERFORM pg_temp.reset_role();

  -- 27i. r6 R6-M1: A SOURCELESS REFUSAL IS NOT GIVEN THE STUDIO'S OWN CONSENT
  --      AS ITS WORDS. The mirror's refusal branch used to fall back to the
  --      record's CONSENT set (COALESCE(NEW.opt_out_source, NEW.source) and
  --      three siblings), justified as covering "legacy rows minted before
  --      opt_out_* existed" — a population 00594 makes impossible, since it
  --      creates the table with all four columns. What the fallback really hit
  --      is this: a refusal carrying no source of its own, where NEW.source is
  --      the studio's FRESH CONSENT put there by record_channel_reconsent().
  --      The seat went from saying nothing about the refusal (honest) to
  --      reading (opted_out, written, 'Signed a fresh consent form…', recorded
  --      today) — R-Q's sentence off the seat became "Opted out in writing,
  --      <today>", naming the studio's own consent document as the refusal.
  PERFORM public.backfill_channel_consent_from_parties();
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550433';
  ASSERT r.status = 'opted_out' AND r.refusal_unanswered
     AND r.opt_out_source IS NULL AND r.opt_out_evidence IS NULL
     AND r.source IS NULL AND r.evidence IS NULL,
    'FAIL 27i: the fold must mint the portal''s sourceless refusal verbatim, got '
      || COALESCE(r.status, '<null>') || ' / '
      || COALESCE(r.opt_out_source, '<null>') || ' / '
      || COALESCE(r.source, '<null>');
  SELECT * INTO r FROM project_parties WHERE id = 'e0000000-0000-4000-8000-0000000000a9';
  ASSERT r.sms_consent_status = 'opted_out'
     AND r.sms_consent_source IS NULL AND r.sms_consent_evidence IS NULL,
    'FAIL 27i2: the seat says nothing about a refusal it has no words for, got '
      || COALESCE(r.sms_consent_source, '<null>') || ' / '
      || COALESCE(r.sms_consent_evidence, '<null>');

  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_reconsent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0433',
    'written', 'Signed a fresh consent form at the walkthrough', 'field-sms-v1', NULL);
  PERFORM pg_temp.reset_role();

  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550433';
  ASSERT r.source = 'written' AND r.status = 'opted_out' AND r.refusal_unanswered,
    'FAIL 27i3: the studio''s fresh consent goes on the record, the refusal stands';
  SELECT * INTO r FROM project_parties WHERE id = 'e0000000-0000-4000-8000-0000000000a9';
  ASSERT r.sms_consent_source IS NULL AND r.sms_consent_evidence IS NULL,
    'FAIL 27i4: the studio''s own consent must never be mirrored onto the seat '
    'as the refusal''s source and words, got '
      || COALESCE(r.sms_consent_source, '<null>') || ' / '
      || COALESCE(r.sms_consent_evidence, '<null>');
  ASSERT r.sms_consent_status = 'opted_out',
    'FAIL 27i5: the seat''s refusal still stands, got '
      || COALESCE(r.sms_consent_status, '<null>');

  -- 27i6. r8 R8-M1: AND THE SIBLING SEAT SAYS NOTHING EITHER. Before this,
  --       27i–27i5 proved only that the seat which CARRIED the sourceless
  --       refusal was left NULL — which it was, because it had nothing to keep.
  --       The seat next door had the studio's kickoff consent form on it, the
  --       COALESCE kept it, and the mirror left that seat reading
  --       (opted_out, written, 'Signed consent form at kickoff', 2 Jan 2026).
  --       R-Q's sentence, composed off the seat — which is what every shipped
  --       surface reads — printed "Opted out in writing, 2 Jan 2026": the
  --       studio's own consent document named as the refusal, dated to the day
  --       of the grant. A refusal with no source is a refusal whose evidence is
  --       known ABSENT, so all four columns are written NULL (R-AQ).
  SELECT * INTO r FROM project_parties WHERE id = 'e0000000-0000-4000-8000-0000000000aa';
  ASSERT r.sms_consent_status = 'opted_out',
    'FAIL 27i6: the refusal reaches the sibling seat too, got '
      || COALESCE(r.sms_consent_status, '<null>');
  ASSERT r.sms_consent_source IS NULL AND r.sms_consent_evidence IS NULL
     AND r.sms_consent_recorded_at IS NULL AND r.sms_consent_recorded_by IS NULL,
    'FAIL 27i7: a wordless refusal must not leave the GRANT''s evidence '
    'standing on a sibling seat, got '
      || COALESCE(r.sms_consent_source, '<null>') || ' / '
      || COALESCE(r.sms_consent_evidence, '<null>') || ' / '
      || COALESCE(r.sms_consent_recorded_at::text, '<null>') || ' / '
      || COALESCE(r.sms_consent_recorded_by::text, '<null>');
  -- The grant's own date is NOT evidence and is not in the wiped set: the
  -- record still says the number was once granted, and R-Q prints both halves.
  ASSERT r.sms_consented_at IS NOT NULL,
    'FAIL 27i8: the wipe is the four evidence columns, not the consent date';

  RAISE NOTICE '27. reconsent is evidence-only and re-callable (r7 M7-2), '
               'leaves the refusal''s own evidence standing (r8 W4-M2), the '
               'seat carries the refusal''s own words too (r9 R5-M1), and a '
               'sourceless refusal is never given the studio''s consent as its '
               'words (r6 R6-M1) — nor left standing on the sibling seat '
               '(r8 R8-M1): passed';
END
$$;

-- ─── 28. r7 R7-M1: a studio-recorded refusal never speaks for a texted one ──
--
-- r6's B6-1 made "record that refusal here first" the ONLY way past a seat
-- refusal, and both channel_opted_out hints now instruct the studio to do it.
-- A studio that obeys, over a number that really replied STOP, used to
-- overwrite the refusal's whole evidence set with hearsay and today's date, on
-- the record and -- through the mirror -- on every seat in the studio: R-Q's
-- sentence went from "Opted out by text, 3 Dec 2025" to "Opted out verbally,
-- <today>", the 10DLC artifact of how the STOP arrived was gone with no audit
-- row, and opt_out_recorded_by named a studio member for a refusal the
-- recipient made -- the attribution the inbound rail writes NULL to avoid.
-- Sending stayed blocked throughout (nothing here lowers refusal_unanswered);
-- what was destroyed is the record's ability to say what the refusal WAS.

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status)
VALUES
  ('e0000000-0000-4000-8000-0000000000b1', 'd0000000-0000-4000-8000-0000000000a4',
   'sub', 'Ari Benet', '612-555-0435', 'not_asked'),
  ('e0000000-0000-4000-8000-0000000000b2', 'd0000000-0000-4000-8000-0000000000a4',
   'sub', 'Nora Vance', '612-555-0436', 'not_asked');

DO $$
DECLARE
  r    RECORD;
  seat RECORD;
BEGIN
  -- 28a. The inbound STOP rail's own write: service_role, straight into the
  --      table (sms-inbound/pipeline.ts writeChannelConsent), dated, with the
  --      carrier's words and NO recorder -- nobody in the studio wrote it down.
  INSERT INTO studio_channel_consent (
    organization_id, channel_kind, channel_value, status,
    opt_out_at, refusal_unanswered,
    opt_out_source, opt_out_evidence, opt_out_recorded_at, opt_out_recorded_by)
  VALUES (
    'b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550435', 'opted_out',
    '2025-12-03T00:00:00Z', true,
    'inbound_sms', 'Inbound STOP', '2025-12-03T00:00:00Z', NULL);

  SELECT * INTO seat FROM project_parties
   WHERE id = 'e0000000-0000-4000-8000-0000000000b1';
  ASSERT seat.sms_consent_status = 'opted_out'
     AND seat.sms_opt_out_at = '2025-12-03T00:00:00Z'
     AND seat.sms_consent_source = 'inbound_sms'
     AND seat.sms_consent_evidence = 'Inbound STOP',
    'FAIL 28a: the rail''s refusal must reach the seat first, got '
      || COALESCE(seat.sms_consent_status, '<null>') || ' / '
      || COALESCE(seat.sms_opt_out_at::text, '<null>') || ' / '
      || COALESCE(seat.sms_consent_source, '<null>');

  -- 28b. One ordinary call, by an ordinary member, through the door the hint
  --      names. It is ACCEPTED -- recording a refusal is always the way
  --      forward -- and it changes nothing about what the refusal was.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0435', 'opted_out',
    'verbal', 'He told me on site', NULL, NULL);
  PERFORM pg_temp.reset_role();

  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550435';
  ASSERT r.opt_out_at = '2025-12-03T00:00:00Z',
    'FAIL 28b: the refusal keeps the date it arrived, got '
      || COALESCE(r.opt_out_at::text, '<null>');
  ASSERT r.opt_out_source = 'inbound_sms' AND r.opt_out_evidence = 'Inbound STOP',
    'FAIL 28b2: a studio-sourced refusal must not speak for a texted one, got '
      || COALESCE(r.opt_out_source, '<null>') || ' / '
      || COALESCE(r.opt_out_evidence, '<null>');
  ASSERT r.opt_out_recorded_at = '2025-12-03T00:00:00Z'
     AND r.opt_out_recorded_by IS NULL,
    'FAIL 28b3: nor may it claim to have written the refusal down, got '
      || COALESCE(r.opt_out_recorded_at::text, '<null>') || ' / '
      || COALESCE(r.opt_out_recorded_by::text, '<null>');
  -- The studio's own account is not lost: it lands on the CONSENT side, with
  -- recorded_at saying when the studio told us and recorded_by naming who.
  ASSERT r.source = 'verbal' AND r.evidence = 'He told me on site'
     AND r.recorded_by = 'a0000000-0000-4000-8000-000000000001',
    'FAIL 28b4: the studio''s own account belongs on the consent side, got '
      || COALESCE(r.source, '<null>') || ' / ' || COALESCE(r.evidence, '<null>');
  ASSERT r.status = 'opted_out' AND r.refusal_unanswered,
    'FAIL 28b5: the refusal still stands unanswered, got '
      || COALESCE(r.status, '<null>');

  -- 28c. AND ON THE SEAT. The mirror carries the refusal's own set, so a seat
  --      that has been saying "opted out by text, 3 Dec 2025" keeps saying it.
  SELECT * INTO seat FROM project_parties
   WHERE id = 'e0000000-0000-4000-8000-0000000000b1';
  ASSERT seat.sms_opt_out_at = '2025-12-03T00:00:00Z'
     AND seat.sms_consent_source = 'inbound_sms'
     AND seat.sms_consent_evidence = 'Inbound STOP'
     AND seat.sms_consent_recorded_by IS NULL,
    'FAIL 28c: the seat must keep the texted refusal too, got '
      || COALESCE(seat.sms_opt_out_at::text, '<null>') || ' / '
      || COALESCE(seat.sms_consent_source, '<null>') || ' / '
      || COALESCE(seat.sms_consent_evidence, '<null>') || ' / '
      || COALESCE(seat.sms_consent_recorded_by::text, '<null>');

  -- 28d. THE CARRIER MAY STILL SPEAK AGAIN. A second inbound_sms refusal
  --      restates the words -- that is the rail, not hearsay -- while the date
  --      the refusal has stood since stays the earliest one.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0435', 'opted_out',
    'inbound_sms', 'Replied STOP again', NULL, NULL);
  PERFORM pg_temp.reset_role();
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550435';
  ASSERT r.opt_out_source = 'inbound_sms'
     AND r.opt_out_evidence = 'Replied STOP again'
     AND r.opt_out_at = '2025-12-03T00:00:00Z',
    'FAIL 28d: a second texted refusal restates the words and keeps the date, got '
      || COALESCE(r.opt_out_evidence, '<null>') || ' / '
      || COALESCE(r.opt_out_at::text, '<null>');

  -- 28e. The guard is about WHO SAID IT, not about freezing the column. A
  --      studio refusal recorded over a studio refusal still restates itself;
  --      only the date the refusal has stood since is kept.
  INSERT INTO studio_channel_consent (
    organization_id, channel_kind, channel_value, status,
    opt_out_at, refusal_unanswered,
    opt_out_source, opt_out_evidence, opt_out_recorded_at, opt_out_recorded_by)
  VALUES (
    'b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550436', 'opted_out',
    '2026-01-05T00:00:00Z', true,
    'verbal', 'Told us at the walkthrough', '2026-01-05T00:00:00Z',
    'a0000000-0000-4000-8000-000000000001');

  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0436', 'opted_out',
    'written', 'Signed an opt-out form', NULL, NULL);
  PERFORM pg_temp.reset_role();

  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550436';
  ASSERT r.opt_out_source = 'written' AND r.opt_out_evidence = 'Signed an opt-out form',
    'FAIL 28e: a studio refusal may restate a studio refusal, got '
      || COALESCE(r.opt_out_source, '<null>') || ' / '
      || COALESCE(r.opt_out_evidence, '<null>');
  ASSERT r.opt_out_at = '2026-01-05T00:00:00Z',
    'FAIL 28e2: and the date the refusal has stood since is still the earliest, got '
      || COALESCE(r.opt_out_at::text, '<null>');
  ASSERT r.opt_out_recorded_at > r.opt_out_at,
    'FAIL 28e3: the refusal cannot be written down before it happened, got '
      || COALESCE(r.opt_out_recorded_at::text, '<null>');
  SELECT * INTO seat FROM project_parties
   WHERE id = 'e0000000-0000-4000-8000-0000000000b2';
  ASSERT seat.sms_consent_source = 'written'
     AND seat.sms_opt_out_at = '2026-01-05T00:00:00Z',
    'FAIL 28e4: the seat follows the record, got '
      || COALESCE(seat.sms_consent_source, '<null>') || ' / '
      || COALESCE(seat.sms_opt_out_at::text, '<null>');

  RAISE NOTICE '28. a studio-recorded refusal never speaks for a texted one, '
               'and the refusal keeps the date it arrived (r7 R7-M1): passed';
END
$$;

-- ─── 29. r8 R8-M2 (R-AR): the card cannot change what it is, or whose ──────
--
-- The three card guards this wave adds all fire on the REFERENCING row. One
-- ordinary UPDATE of the card being pointed AT undid all three at once: a
-- company card left carrying owner_type = 'person' channels (the exact state
-- assert_channel_owner_kind exists to refuse), a paperwork/site designation
-- naming a firm and then a card in ANOTHER STUDIO, a contact rule routing
-- across tenants. entity_kind is a column the shipped data layer already
-- writes on update (use-studio-contacts.ts).

INSERT INTO studio_contacts (id, organization_id, entity_kind, contact_kind,
                             full_name, company_name, created_by)
VALUES
  -- full_name AND company_name, so studio_contacts_entity_name_check cannot be
  -- what refuses the flip: the guard under test is the only thing in the way.
  ('c0000000-0000-4000-8000-000000000071', 'b0000000-0000-4000-8000-00000000000a',
   'person', 'sub', 'Held Person', 'Held Person LLC',
   'a0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000072', 'b0000000-0000-4000-8000-00000000000a',
   'company', 'gc', NULL, 'Holder GC', 'a0000000-0000-4000-8000-000000000001');

DO $$
DECLARE
  raised TEXT;
  r      RECORD;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  -- 29a. A card nothing points at is free to change. The guard refuses a
  --      CHANGE, never a card.
  UPDATE studio_contacts
     SET entity_kind = 'company'
   WHERE id = 'c0000000-0000-4000-8000-000000000071';
  UPDATE studio_contacts
     SET entity_kind = 'person'
   WHERE id = 'c0000000-0000-4000-8000-000000000071';

  -- Now hang all four kinds of dependent on it.
  INSERT INTO studio_contact_channels (owner_type, owner_id, channel_kind, value)
  VALUES ('person', 'c0000000-0000-4000-8000-000000000071', 'mobile', '612-555-0471');

  UPDATE studio_contacts
     SET site_contact_person_id = 'c0000000-0000-4000-8000-000000000071'
   WHERE id = 'c0000000-0000-4000-8000-000000000072';

  INSERT INTO studio_contact_rules (subject_type, subject_id, route_to_person_id,
                                    channels_forbidden, reason)
  VALUES ('company', 'c0000000-0000-4000-8000-000000000072',
          'c0000000-0000-4000-8000-000000000071', ARRAY['mobile'],
          'Write the PM instead');

  INSERT INTO studio_person_affiliations (person_id, company_id, role_at_firm)
  VALUES ('c0000000-0000-4000-8000-000000000071',
          'c0000000-0000-4000-8000-000000000072', 'pm');

  -- 29b. The kind flip is refused, and the hint names what holds it.
  raised := NULL;
  BEGIN
    UPDATE studio_contacts
       SET entity_kind = 'company'
     WHERE id = 'c0000000-0000-4000-8000-000000000071';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'studio_contact_identity_held',
    'FAIL 29b: a held card may not change its entity_kind, got '
      || COALESCE(raised, '<no error>');

  -- 29c. So is the studio move — the half that mints the cross-tenant
  --      paperwork link 00592's own comment warns about.
  raised := NULL;
  BEGIN
    UPDATE studio_contacts
       SET organization_id = 'b0000000-0000-4000-8000-00000000000b'
     WHERE id = 'c0000000-0000-4000-8000-000000000071';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'studio_contact_identity_held',
    'FAIL 29c: a held card may not be moved to another studio, got '
      || COALESCE(raised, '<no error>');

  -- 29d. The COMPANY side is held too — by the affiliation standing on it.
  --      The designation it carries is cleared first only so that the OLDER
  --      guard is not the one that answers: assert_studio_contact_designations_trg
  --      also fires on an organization_id change, sorts before this trigger by
  --      name, and correctly refuses the move as designated_person_other_studio.
  --      Clearing it leaves the affiliation as the only thing holding the firm.
  UPDATE studio_contacts SET site_contact_person_id = NULL
   WHERE id = 'c0000000-0000-4000-8000-000000000072';

  raised := NULL;
  BEGIN
    UPDATE studio_contacts
       SET organization_id = 'b0000000-0000-4000-8000-00000000000b'
     WHERE id = 'c0000000-0000-4000-8000-000000000072';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'studio_contact_identity_held',
    'FAIL 29d: the firm the affiliation names is held too, got '
      || COALESCE(raised, '<no error>');

  -- 29e. A RESTATEMENT is not a change. `UPDATE OF` fires whenever the column
  --      is in the SET list, and the shipped hook writes entity_kind on every
  --      edit that passes one — so an ordinary card edit must still write.
  UPDATE studio_contacts
     SET entity_kind = 'person',
         organization_id = 'b0000000-0000-4000-8000-00000000000a',
         full_name = 'Held Person, renamed'
   WHERE id = 'c0000000-0000-4000-8000-000000000071';
  SELECT * INTO r FROM studio_contacts
   WHERE id = 'c0000000-0000-4000-8000-000000000071';
  ASSERT r.full_name = 'Held Person, renamed',
    'FAIL 29e: restating the same kind and studio must not refuse the edit';

  -- 29f. Detach the four, and the change goes through. The studio's way out is
  --      the room's own doors, not an ops fix.
  DELETE FROM studio_person_affiliations
   WHERE person_id = 'c0000000-0000-4000-8000-000000000071';
  DELETE FROM studio_contact_rules
   WHERE route_to_person_id = 'c0000000-0000-4000-8000-000000000071';
  DELETE FROM studio_contact_channels
   WHERE owner_id = 'c0000000-0000-4000-8000-000000000071';

  -- The kind flip, not the studio move: studio_contacts' own member RLS
  -- WITH CHECK refuses a move into a studio this member does not belong to,
  -- which would prove nothing about this guard.
  UPDATE studio_contacts
     SET entity_kind = 'company'
   WHERE id = 'c0000000-0000-4000-8000-000000000071';
  PERFORM pg_temp.reset_role();
  SELECT * INTO r FROM studio_contacts
   WHERE id = 'c0000000-0000-4000-8000-000000000071';
  ASSERT r.entity_kind = 'company',
    'FAIL 29f: an unheld card must still be free to change, got '
      || COALESCE(r.entity_kind, '<null>');

  RAISE NOTICE '29. a held card cannot change what it is or whose it is '
               '(r8 R8-M2, R-AR): passed';
END
$$;

-- ─── 30. r2 R2-M1: the fold picks the sibling that HOLDS the refusal ───────
--
-- Two refusing seats on one number in one studio: the real inbound STOP, dated
-- and worded, and the dateless sourceless `opted_out` the shipped portal writes
-- on purpose (use-coordination.ts). Ranked by COALESCE(..., updated_at) the
-- portal row wins on row age alone — it is touched whenever anything on the
-- roster changes — and every fact the record carries about the refusal comes
-- off a row that carries none: opt_out_at NULL, all four opt_out_* NULL, for
-- good (ON CONFLICT DO NOTHING; reconsent never writes opt_out_*). The mirror
-- then reads the NULL source as "this refusal has no words" (R-AQ) and wipes
-- the STOP's own words off EVERY seat, including the one that received it.
-- 30c is the other half of the same rule: where the words and the date are on
-- different refusing seats, the record must still end up with both.

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_consented_at, sms_opt_out_at,
                             sms_consent_source, sms_consent_evidence,
                             sms_consent_recorded_at, sms_consent_disclosure_version)
VALUES
  -- the STOP, with its date and its words
  ('e0000000-0000-4000-8000-0000000000c1', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Pete Rusk', '(612) 555-0501',
   'opted_out', NULL, '2025-12-03T00:00:00Z', 'inbound_sms', 'Replied STOP on the Lindqvist thread',
   '2025-12-03T00:00:00Z', 'field-sms-v1'),
  -- the portal's refusal: opted out, date unknown, no source, no words
  ('e0000000-0000-4000-8000-0000000000c2', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Pete Rusk', '612-555-0501',
   'opted_out', NULL, NULL, NULL, NULL, NULL, NULL),
  -- 30c: a dated refusal with no words, and a worded refusal with no date
  ('e0000000-0000-4000-8000-0000000000c3', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Ada Fenn', '(612) 555-0502',
   'opted_out', NULL, '2025-10-09T00:00:00Z', NULL, NULL, NULL, NULL),
  ('e0000000-0000-4000-8000-0000000000c4', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Ada Fenn', '612-555-0502',
   'opted_out', NULL, NULL, 'written', 'Told the PM to stop texting', '2025-10-10T00:00:00Z', 'field-sms-v1');

-- The roster touch that makes the dateless row the most recently TOUCHED one —
-- the whole mechanism of the defect, and ordinary portal traffic.
UPDATE project_parties SET display_name = 'Pete Rusk (crew lead)'
 WHERE id = 'e0000000-0000-4000-8000-0000000000c2';

DO $$
DECLARE
  r    RECORD;
  seat RECORD;
  n    INTEGER;
BEGIN
  PERFORM public.backfill_channel_consent_from_parties();

  -- 30a. The RECORD keeps the STOP's own date and words.
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = '+16125550501';
  ASSERT r.status = 'opted_out' AND r.refusal_unanswered,
    'FAIL 30a: the folded record must be an unanswered refusal, got '
      || COALESCE(r.status, '<none>');
  ASSERT r.opt_out_at = '2025-12-03T00:00:00Z'::timestamptz,
    'FAIL 30a2: the STOP''s own date must land on the record, not the dateless '
    'sibling''s NULL, got ' || COALESCE(r.opt_out_at::text, '<null>');
  ASSERT r.opt_out_source = 'inbound_sms'
     AND r.opt_out_evidence = 'Replied STOP on the Lindqvist thread'
     AND r.opt_out_recorded_at = '2025-12-03T00:00:00Z'::timestamptz,
    'FAIL 30a3: the STOP''s own words must land on the record, got '
      || COALESCE(r.opt_out_source, '<null>') || ' / '
      || COALESCE(r.opt_out_evidence, '<null>');

  -- 30b. And so does EVERY SEAT, the dateless one included: the mirror has
  --      already run, and a record that knows the refusal's words is not the
  --      wordless-refusal case R-AQ wipes.
  FOR seat IN
    SELECT * FROM project_parties
     WHERE id IN ('e0000000-0000-4000-8000-0000000000c1',
                  'e0000000-0000-4000-8000-0000000000c2')
     ORDER BY id
  LOOP
    ASSERT seat.sms_consent_status = 'opted_out',
      'FAIL 30b: seat ' || seat.id || ' must read opted_out';
    ASSERT seat.sms_opt_out_at = '2025-12-03T00:00:00Z'::timestamptz,
      'FAIL 30b2: seat ' || seat.id || ' must keep the STOP''s date, got '
        || COALESCE(seat.sms_opt_out_at::text, '<null>');
    ASSERT seat.sms_consent_source = 'inbound_sms'
       AND seat.sms_consent_evidence = 'Replied STOP on the Lindqvist thread',
      'FAIL 30b3: seat ' || seat.id || ' must keep the STOP''s words, got '
        || COALESCE(seat.sms_consent_source, '<null>') || ' / '
        || COALESCE(seat.sms_consent_evidence, '<null>');
  END LOOP;

  -- 30c. Words on one refusing seat, the date on another: the record takes the
  --      words from the seat that has them and the date from the group, rather
  --      than printing half a sentence.
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = '+16125550502';
  ASSERT r.opt_out_source = 'written'
     AND r.opt_out_evidence = 'Told the PM to stop texting',
    'FAIL 30c: the refusal''s words must come from the seat that has them, got '
      || COALESCE(r.opt_out_source, '<null>');
  ASSERT r.opt_out_at = '2025-10-09T00:00:00Z'::timestamptz,
    'FAIL 30c2: a worded refusal with no date of its own must still take a '
    'real date from the refusing group, got '
      || COALESCE(r.opt_out_at::text, '<null>');

  -- 30d. Still one record per (studio, kind, value).
  SELECT COUNT(*) INTO n FROM studio_channel_consent
   WHERE channel_value IN ('+16125550501', '+16125550502');
  ASSERT n = 2, 'FAIL 30d: expected 2 consent records, got ' || n;

  RAISE NOTICE '30. the fold picks the sibling that HOLDS the refusal, so a '
               'dateless portal refusal never erases the STOP''s date or '
               'words — on the record or on the seats (r2 R2-M1): passed';
  RAISE NOTICE 'All W1a assertions passed.';
END
$$;

ROLLBACK;
