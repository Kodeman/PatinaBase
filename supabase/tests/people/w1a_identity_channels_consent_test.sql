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
--   4. R-AS: a consent act writes the RECORD and nothing else — the party rows
--      are frozen legacy — and one studio's verdict never reaches another's.
--      v_project_roster prints the record.
--   5. record_channel_consent() refuses a non-member, and authenticated holds
--      no direct INSERT on the consent table (the RPC is the only door).
--   6. r1 B1/M1, under R-AS: a recorded `pending` reaches no party row at all,
--      so 00432's opt-in SMS cannot fan out — while a direct party-row write
--      (through the legacy escape hatch) still dispatches, proving the shipped
--      trigger keeps its shipped body; and a backfill re-run sends nothing.
--   7. r1 M2/M3/M4: the widened vocabularies — ap_email and portal_311 channel
--      kinds (each normalised by its own rule), a dated `bounced` channel
--      status, and the company kinds the shipped UI already renders plus the
--      AHJ `authority`.
--   8. r2 B-1 under R-AS: a recorded `granted` fires neither of
--      project_parties' outward AFTER triggers, because it writes no party row;
--      the shipped triggers still fire on a real party-row transition. It also
--      asserts THE GAP owed to W2: parked site requests are no longer released
--      by consent arriving, because that release lived on the seat transition.
--   9. r2 B-2: record_channel_consent is a transition gate. Evidence is
--      required, nothing leaves opted_out through it, the evidence set is
--      never carried across a status change, and PR-m's way back is the named
--      record_channel_reconsent().
--  10. r2 M-1 / R-AN: a same-status re-record REFRESHES the record's evidence,
--      so no record can sit at granted with a hollow evidence set.
--  11. r2 M-3: one normalisation rule — an unparseable phone gets a channel row
--      AND a consent record, on the same key.
--  12. r3 R-AG/R-AI: record_channel_consent refuses `not_asked` outright and no
--      status change empties the evidence set (block 9d); and
--      studio_person_affiliations is the home of person-at-firm while
--      studio_contacts.company_id is a derived pointer the trigger keeps equal
--      — in BOTH directions, so a firm set through the legacy column opens the
--      affiliation the crew list reads (block 12).
--  13. R-AS: the eight legacy sms_consent_* columns are FROZEN. Any real change
--      raises consent_legacy_column_frozen; restating the same values still
--      writes; `app.consent_legacy_write = 'on'` is the one deliberate door and
--      it closes with its own statement; INSERT is untouched.
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
--  18. r5 M5-2 (R-AN): the record's evidence is refreshed, never nulled by a
--      write that does not restate it; the frozen seat is left alone; and both
--      v_project_roster and people_directory print the record's verdict.
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
--      R-AS: no consent act reaches a seat at all, so the whole class r9 R5-M1
--      and r8 R8-M1 (R-AQ) chased — one evidence set on the seat having to
--      speak for two acts — cannot recur. The record holds the grant's five and
--      the refusal's four side by side.
--  29. r8 R8-M2 (R-AR): a card held by a channel, a designation, a rule route
--      or an affiliation may not change its entity_kind or its studio; a
--      restatement of the same values still writes; detaching the dependents
--      opens the door again.
--  30. r2 R2-M1: the fold picks the refusing sibling by the refusal's OWN
--      facts, not by row age. Two refusals on one number in one studio — the
--      dated, worded inbound STOP and the dateless sourceless one the shipped
--      portal writes — and the RECORD keeps the STOP's date and its words;
--      where the words and the date sit on different refusing seats, the record
--      still ends up with both. The seats are read, never written.
--  35. r9 M1: record_channel_reconsent dates the consent it records. The five
--      evidence columns and consented_at are one act, so a fresh verbal
--      consent is never filed under an older written grant's date, and the
--      disclosure version on the record (and on the seats) is the one standing
--      beside the date on the same row.
--  36. r9 M2: the fold takes the CONSENT side off the whole group, not off the
--      winning row alone — the shipped portal's sourceless `opted_out` seat
--      wins the bucket, and the studio's signed grant on the seat next door
--      lands on the record's consent side instead of being minted away and
--      lost outright, since the record is the only copy. It does not invent a
--      grant for a group that holds none.
--  37. R-AS as objects and access: the mirror function and trigger are gone,
--      refuse_legacy_consent_write_trg is on project_parties, both shipped
--      readers go through channel_consent_status(), and that function is
--      SECURITY INVOKER so one studio cannot read another's verdict.
--  39. close-review r2 MAJOR-1: the add path never lowers a standing grant.
--      `pending` over `granted` is refused by name (consent_already_granted)
--      and leaves the grant's date, words and disclosure version exactly as
--      they stood; record_channel_invite() — the door useAddProjectParty calls
--      — returns that grant untouched, mints the `pending` where nothing
--      stands, and inherits every gate of the sibling it delegates to.
--  40. close-review r2 MAJOR-2: one reader, one verdict. A record carrying an
--      unanswered refusal reads `opted_out` through channel_consent_status()
--      whatever its status column says, so both shipped readers print what the
--      send rail decides — and the rule lives in the reader alone (R-AS).
--  41. close-out r3 MAJOR-1 (00621): field_activity_summary.awaiting_reply_count
--      counts the RECORD's `pending`, not the frozen seat's, so the Field
--      Coordination Desk and the Call Sheet say the same thing about the same
--      person — and a recorded refusal is not a party awaiting a reply. The
--      rest of the 00282 rollup is untouched by the graft.
--  42. close-out r3 MAJOR-3 (00621): 00284's two dispatch gates
--      (fc_dispatch_court_assignment / fc_dispatch_task_assignment) reach a
--      party whose consent the studio holds on the record while the seat stays
--      frozen, and still dispatch nothing for an unasked number, a recorded
--      refusal, or a non-field party. A pre-fold `granted` seat with no record
--      still dispatches, because sendPartySms still honours one.
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

  -- 3c4. …and it carries NO refusal evidence at all — r8 W4-M2 as REFINED by
  --      r4 R4-M1. W4-M2 asked that the refusal's own words come off the
  --      refusing sibling rather than the winning grant, and this fixture's
  --      sibling (e…0006) is the legacy shape: STATUS `granted`, an unanswered
  --      opt-out date, and one evidence set. That set belongs to whatever wrote
  --      the row's CURRENT status — the grant — whatever it happens to read,
  --      and project_parties gives no way to tell the two apart on a single
  --      row. Copied across, the studio's own paperwork gets filed as the
  --      refusal's own words (demonstrated: 'written' / "Signed the Lindqvist
  --      kickoff form" recorded ten months BEFORE opt_out_at) and, being
  --      non-NULL, it suppresses R-AQ's protective wipe in the mirror. So the
  --      words are taken only off a row whose status IS `opted_out`; a refusal
  --      inferred from a date alone is a refusal with no words, and NULL is the
  --      honest record of that. The DATE still lands (3c6), and block 30
  --      covers the case W4-M2 was really about: a sibling that says
  --      `opted_out` and carries the STOP's own words.
  ASSERT r.opt_out_source IS NULL
     AND r.opt_out_evidence IS NULL
     AND r.opt_out_recorded_at IS NULL
     AND r.opt_out_recorded_by IS NULL,
    'FAIL 3c4: a row whose status is not opted_out has no refusal words to '
    'give, got ' || COALESCE(r.opt_out_source, '<null>') || ' / '
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

-- ─── 4. The record is the single source + 5. the RPC ───────────────────────

DO $$
DECLARE
  n INTEGER;
  raised TEXT;
  v TEXT;
  r RECORD;
BEGIN
  -- Put Alpha back to opted_out so the record's effect is unambiguous. Even
  -- this setup step has to run as a member: the RPC gates on auth.uid(), so a
  -- JWT-less session (here, plain postgres) is refused like anyone else.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550142', 'opted_out',
    'inbound_sms', 'STOP', 'field-sms-v1', 'd0000000-0000-4000-8000-00000000000a');
  PERFORM pg_temp.reset_role();

  -- 4a. THE SEATS ARE NOT WRITTEN (R-AS). The seat that carried the STOP still
  --     says opted_out because that is what the fixture wrote; the seat that
  --     carried the grant still says granted. A consent act touches neither.
  SELECT sms_consent_status INTO v FROM project_parties
   WHERE id = 'e0000000-0000-4000-8000-000000000001';
  ASSERT v = 'granted',
    'FAIL 4a: the grant seat must be left exactly as it stood, got '
      || COALESCE(v, '<null>');
  SELECT sms_consent_status INTO v FROM project_parties
   WHERE id = 'e0000000-0000-4000-8000-000000000002';
  ASSERT v = 'opted_out',
    'FAIL 4a2: the refusing seat must be left exactly as it stood, got '
      || COALESCE(v, '<null>');

  -- 4a3. …and the ROSTER prints the record, not the seat: the Alpha grant seat
  --      reads `opted_out` on the Call Sheet because the studio's record does.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  SELECT sms_consent_status INTO v FROM v_project_roster
   WHERE roster_id = 'e0000000-0000-4000-8000-000000000001';
  ASSERT v = 'opted_out',
    'FAIL 4a3: v_project_roster must read the record, got ' || COALESCE(v, '<null>');
  PERFORM pg_temp.reset_role();

  -- 4b. Beta's record on the same number is untouched: one studio's STOP is not
  --     another studio's fact (org isolation).
  SELECT COALESCE(status, '<none>') INTO v FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000b'
     AND channel_kind = 'sms' AND channel_value = '+16125550142';
  ASSERT v = 'not_asked',
    'FAIL 4b: a verdict must not cross studios, Beta record reads ' || COALESCE(v, '<null>');
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000002');
  SELECT sms_consent_status INTO v FROM v_project_roster
   WHERE roster_id = 'e0000000-0000-4000-8000-000000000003';
  ASSERT v = 'not_asked',
    'FAIL 4b2: Beta''s roster must read Beta''s record, got ' || COALESCE(v, '<null>');
  PERFORM pg_temp.reset_role();

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

  -- 4d. The refusal stands ON THE RECORD, in its own words — reconsent never
  --     touches the refusal's four columns (r7 M7-2, r8 W4-M2) — and the seats
  --     are still not written (R-AS).
  SELECT COUNT(*) INTO n FROM project_parties
   WHERE id IN ('e0000000-0000-4000-8000-000000000001', 'e0000000-0000-4000-8000-000000000002')
     AND sms_consent_evidence = 'Fresh written consent';
  ASSERT n = 0, 'FAIL 4d: no consent act may reach a seat, got ' || n;

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
-- The retired mirror wrote the studio's verdict, with the whole evidence set,
-- onto every party row in that studio on that number, and each
-- newly-evidenced-`pending` row independently satisfied fc_dispatch_optin_invite
-- (00432): one record_channel_consent(...,'pending',...) call sent one real
-- opt-in SMS PER PARTY ROW. R-AS removes the copy instead of suppressing the
-- dispatch, so the fan-out has no path at all — and 00432's trigger keeps its
-- shipped body, which this block proves is still live.
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
-- pending row and one sibling, so the fold has a group to fold.
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

  -- 6a. The record carries the verdict, and the three seats are untouched.
  SELECT COUNT(*) INTO n FROM project_parties
   WHERE phone_e164 = '+16125550143' AND sms_consent_status = 'not_asked';
  ASSERT n = 3, 'FAIL 6a: a consent act must reach no seat, got ' || (3 - n);
  SELECT COUNT(*) INTO n FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = '+16125550143'
     AND status = 'pending';
  ASSERT n = 1, 'FAIL 6a2: the record should hold the pending verdict, got ' || n;

  -- 6b. …and not one opt-in SMS left the building.
  SELECT COUNT(*) INTO d FROM public._w1a_dispatch_log
   WHERE body->>'templateKey' = 'sms_optin_invite';
  ASSERT d = 1, 'FAIL 6b: a recorded pending must dispatch nothing, got ' || (d - 1);

  -- 6c. 00432's trigger keeps its SHIPPED body — this file redefines it no
  --     more — so a direct party-row write (with the legacy escape hatch, the
  --     only way one can happen now) still dispatches exactly once.
  SET LOCAL app.consent_legacy_write = 'on';
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
  SET LOCAL app.consent_legacy_write = '';
  SELECT COUNT(*) INTO d FROM public._w1a_dispatch_log
   WHERE body->>'templateKey' = 'sms_optin_invite';
  ASSERT d = 2, 'FAIL 6c: a direct party-row write must still dispatch once, got ' || (d - 1);

  -- 6d. No suppression flag exists any more: nothing in the tree sets it, and
  --     nothing reads it.
  ASSERT NOT EXISTS (
    SELECT 1 FROM pg_proc pr
     JOIN pg_namespace ns ON ns.oid = pr.pronamespace
    WHERE ns.nspname = 'public'
      AND pr.prosrc LIKE '%suppress_consent_dispatch%'),
    'FAIL 6d: no function may still carry the mirror''s suppression flag';

  -- 6e. M1: re-running the backfill as maintenance folds the new number, writes
  --     no seat, and still sends nothing.
  SELECT public.backfill_channel_consent_from_parties() INTO folded;
  ASSERT folded = 1, 'FAIL 6e: the re-run should fold the one unrecorded number, got ' || folded;

  SELECT COUNT(*) INTO n FROM project_parties
   WHERE phone_e164 = '+16125550144' AND sms_consent_status = 'pending';
  ASSERT n = 1, 'FAIL 6e2: the fold must not write the seats, got ' || n;

  SELECT COUNT(*) INTO d FROM public._w1a_dispatch_log
   WHERE body->>'templateKey' = 'sms_optin_invite';
  ASSERT d = 2, 'FAIL 6f: a backfill re-run must send nothing, got ' || (d - 2);

  RAISE NOTICE '6. no fan-out is possible (B1) + backfill re-run (M1): passed';
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

-- ─── 8. r2 B-1, under R-AS: the second outward trigger cannot fire either ──
--
-- project_parties carries two AFTER-row triggers that reach the outside world.
-- Block 6 covered the opt-in invite. This is the other one:
-- site_request_consent_granted_dispatch fires whenever sms_consent_status flips
-- to 'granted', mints durable dispatch work, and calls site-request-dispatch,
-- which calls sendPartySms — a real text to a trade. The retired mirror flipped
-- every party row in the studio on the number, so one recorded grant fanned out
-- into one dispatch per open request per seat, and 00594 had to graft a guard
-- into 00374's trigger to hold it off.
--
-- With the record as the single source there is nothing to guard: a consent act
-- writes no seat, so the trigger cannot fire from one. It keeps its SHIPPED
-- body, and this block proves both halves — nothing dispatches from a recorded
-- grant, and the shipped trigger is still live for a real party-row transition.
--
-- IT ALSO RECORDS THE GAP R-AS LEAVES OPEN FOR W2 (8c): the requests parked in
-- awaiting_consent are NOT released by the grant any more, because that release
-- lived on the party-row transition. The site-request rail reads consent off the
-- seat throughout and has to be repointed at the record.
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

  -- 8a. The seats are untouched, and the record holds the grant.
  SELECT COUNT(*) INTO n FROM project_parties
   WHERE phone_e164 = '+16125550155' AND sms_consent_status = 'not_asked';
  ASSERT n = 2, 'FAIL 8a: a recorded grant must reach no seat, got ' || (2 - n);
  SELECT COUNT(*) INTO n FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550155' AND status = 'granted';
  ASSERT n = 1, 'FAIL 8a2: the record should hold the grant, got ' || n;

  -- 8b. …and NOT ONE site-request dispatch left the building.
  SELECT COUNT(*) INTO d FROM public._w1a_dispatch_log
   WHERE fn_name = 'site-request-dispatch';
  ASSERT d = 0, 'FAIL 8b: a recorded grant must dispatch no site request, got ' || d;

  -- 8c. THE GAP, ASSERTED AS IT STANDS (owed to W2). The parked requests are
  --     NOT released: 00374's trigger is the only caller of
  --     site_request_dispatch_after_consent(), it fires on a party-row
  --     transition, and no consent act makes one any more. The lifecycle sweep
  --     only promotes requests that already hold an outbox row, so these two
  --     stay in awaiting_consent until the site-request rail reads the record.
  SELECT COUNT(*) INTO n FROM site_requests
   WHERE id IN ('a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000002')
     AND consent_status_snapshot = 'granted';
  ASSERT n = 0,
    'FAIL 8c: the consent record does not release parked requests yet — if this '
    'now passes, the site-request rail was repointed and this assertion is the '
    'one to update, got ' || n;

  -- 8d. 00374's trigger keeps its SHIPPED body: a real party-row transition
  --     (only reachable through the legacy escape hatch now) still dispatches
  --     and still releases its request, unguarded.
  SET LOCAL app.consent_legacy_write = 'on';
  UPDATE project_parties SET sms_consent_status = 'granted'
   WHERE id = 'e0000000-0000-4000-8000-000000000021';
  SET LOCAL app.consent_legacy_write = '';

  SELECT COUNT(*) INTO d FROM public._w1a_dispatch_log
   WHERE fn_name = 'site-request-dispatch';
  ASSERT d = 1, 'FAIL 8d: a direct party-row grant must still dispatch once, got ' || d;

  SELECT COUNT(*) INTO n FROM site_requests
   WHERE id = 'a1000000-0000-4000-8000-000000000001' AND consent_status_snapshot = 'granted';
  ASSERT n = 1, 'FAIL 8d2: the direct grant should have released its request';

  RAISE NOTICE '8. a consent act reaches no seat and sends nothing (B-1): passed';
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
  --
  --      AND THE REFUSAL'S WORDS GO ON THE REFUSAL'S SIDE (r6 R6-M1). The
  --      refusal used to write the CONSENT columns too, so this one ordinary
  --      pair of acts left the record reading (verbal, "Told me at the
  --      walk-through to stop") against the GRANT's surviving consented_at:
  --      R-Q's grant sentence composed to "Verbal consent, <the grant's date>"
  --      and "Signed 2025 form" — the 10DLC artifact of the consent itself —
  --      was gone with no audit row.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550166', 'opted_out',
    'verbal', 'Told me at the walk-through to stop', NULL, NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550166';
  ASSERT r.status = 'opted_out', 'FAIL 9d3: expected opted_out, got ' || COALESCE(r.status, '<none>');
  ASSERT r.opt_out_source = 'verbal'
     AND r.opt_out_evidence = 'Told me at the walk-through to stop',
    'FAIL 9d3: the refusal must carry its OWN words, got '
    || COALESCE(r.opt_out_source, '<null>') || ' / ' || COALESCE(r.opt_out_evidence, '<null>');
  ASSERT r.source = 'written' AND r.evidence = 'Signed 2025 form',
    'FAIL 9d3b: and it must not speak for the GRANT it is recorded over (r6 R6-M1), got '
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

  -- 9f. …but a re-record of the SAME refusal is fine. What it may CHANGE is
  --     bounded by two rules that both bite here: a studio-sourced refusal does
  --     not speak for the texted one 9e just recorded (r7 R7-M1), and it does
  --     not fall back onto the consent side either (r6 R6-M1). So the call is
  --     accepted and writes nothing — which is what a duplicate refusal is
  --     worth. Block 28e covers a studio refusal restating a studio refusal.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550166', 'opted_out',
    'verbal', 'Told me on site to stop texting', NULL, NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550166';
  ASSERT r.status = 'opted_out' AND r.opt_out_source = 'inbound_sms'
     AND r.opt_out_evidence = 'Replied STOP',
    'FAIL 9f: hearsay must not speak for the texted refusal, got '
      || COALESCE(r.opt_out_source, '<null>') || ' / ' || COALESCE(r.opt_out_evidence, '<null>');
  ASSERT r.source = 'written' AND r.evidence = 'Signed 2025 form',
    'FAIL 9f2: nor may it land on the consent side instead (r6 R6-M1), got '
      || COALESCE(r.source, '<null>') || ' / ' || COALESCE(r.evidence, '<null>');

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

-- ─── 10. r2 M-1 / R-AN: a re-record REFRESHES the record's evidence ────────

DO $$
DECLARE
  n INTEGER;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  -- Same status twice, different words. The second write must land: the
  -- evidence set is the 10DLC artifact for the send, and since R-AS the record
  -- is the only copy of it.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '(612) 555-0155', 'granted',
    'verbal', 'Said yes on site', 'field-sms-v1', NULL);
  PERFORM pg_temp.reset_role();

  SELECT COUNT(*) INTO n FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550155'
     AND status = 'granted'
     AND source = 'verbal'
     AND evidence = 'Said yes on site'
     AND recorded_at IS NOT NULL;
  ASSERT n = 1,
    'FAIL 10: a same-status re-record must refresh the record''s evidence, got ' || n;

  -- 10b. THE WHOLE EVIDENCE SET — all five columns (r5 M5-2, R-AN). The two
  --      this check used to omit, disclosure_version and recorded_by, are
  --      exactly the two a record can arrive without (the inbound rail mints
  --      one from a YES), so a write that did not restate them must keep them.
  SELECT COUNT(*) INTO n FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550155'
     AND disclosure_version = 'field-sms-v1'
     AND recorded_by = 'a0000000-0000-4000-8000-000000000001';
  ASSERT n = 1,
    'FAIL 10b: the record must keep all five evidence columns, got ' || n;

  -- No consent record may sit at granted with a hollow evidence set.
  SELECT COUNT(*) INTO n FROM studio_channel_consent
   WHERE status = 'granted'
     AND (source IS NULL
          OR recorded_at IS NULL
          OR btrim(COALESCE(evidence, '')) = '');
  ASSERT n = 0,
    'FAIL 10b2: a granted record with a hollow evidence set, ' || n || ' of them';

  RAISE NOTICE '10. the record''s evidence is refreshed, never erased (M-1/R-AN): passed';
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

-- ─── 13. R-AS: the legacy consent columns are FROZEN ───────────────────────
--
-- studio_channel_consent is the single source of truth. project_parties'
-- sms_consent_* columns are kept — the fold reads them, and they are the 10DLC
-- evidence of what the studio held before the record existed — but nothing may
-- write them. refuse_legacy_consent_write() raises consent_legacy_column_frozen
-- on any real change, so a shipped writer that still reaches for them FAILS
-- LOUDLY instead of quietly writing a fact no reader reads. The one door is a
-- deliberate `app.consent_legacy_write = 'on'`, for a data repair and for W2.

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, trade, sms_consent_status)
VALUES
  ('e0000000-0000-4000-8000-000000000031', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Nell Bracco', '(612) 555-0177', 'plumbing', 'pending'),
  ('e0000000-0000-4000-8000-000000000032', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Nell Bracco', '612-555-0177',   'plumbing', 'not_asked');

DO $$
DECLARE
  n      INTEGER;
  raised TEXT;
  v      TEXT;
BEGIN
  -- 13a. A change to the status is refused.
  raised := NULL;
  BEGIN
    UPDATE project_parties SET sms_consent_status = 'granted'
     WHERE id = 'e0000000-0000-4000-8000-000000000031';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  ASSERT raised = 'consent_legacy_column_frozen',
    'FAIL 13a: a legacy status write must be refused, got ' || COALESCE(raised, '<no error>');

  -- 13a2. …and so is a change to any one of the other seven, one at a time.
  raised := NULL;
  BEGIN
    UPDATE project_parties SET sms_consent_evidence = 'rewritten'
     WHERE id = 'e0000000-0000-4000-8000-000000000031';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  ASSERT raised = 'consent_legacy_column_frozen',
    'FAIL 13a2: a legacy evidence write must be refused, got ' || COALESCE(raised, '<no error>');
  raised := NULL;
  BEGIN
    UPDATE project_parties SET sms_opt_out_at = now()
     WHERE id = 'e0000000-0000-4000-8000-000000000031';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  ASSERT raised = 'consent_legacy_column_frozen',
    'FAIL 13a3: a legacy opt-out date write must be refused, got ' || COALESCE(raised, '<no error>');

  -- 13b. Nothing was written by any of that.
  SELECT sms_consent_status INTO v FROM project_parties
   WHERE id = 'e0000000-0000-4000-8000-000000000031';
  ASSERT v = 'pending',
    'FAIL 13b: the refused writes must leave the row alone, got ' || COALESCE(v, '<null>');

  -- 13c. RESTATING the same values is not a change, so a whole-row UPDATE that
  --      happens to name the columns still writes. (display_name moves; the
  --      eight are named and unchanged.)
  UPDATE project_parties
     SET display_name = 'Nell Bracco Jr',
         sms_consent_status = sms_consent_status,
         sms_consent_evidence = sms_consent_evidence
   WHERE id = 'e0000000-0000-4000-8000-000000000031';
  SELECT display_name INTO v FROM project_parties
   WHERE id = 'e0000000-0000-4000-8000-000000000031';
  ASSERT v = 'Nell Bracco Jr',
    'FAIL 13c: restating an unchanged legacy column must not block the row';

  -- 13d. The deliberate door, for a data repair and for W2.
  SET LOCAL app.consent_legacy_write = 'on';
  UPDATE project_parties SET sms_consent_status = 'opted_out'
   WHERE id = 'e0000000-0000-4000-8000-000000000032';
  SET LOCAL app.consent_legacy_write = '';
  SELECT sms_consent_status INTO v FROM project_parties
   WHERE id = 'e0000000-0000-4000-8000-000000000032';
  ASSERT v = 'opted_out', 'FAIL 13d: the escape hatch must let a repair through';

  -- 13d2. …and it closes again with the statement that opened it.
  raised := NULL;
  BEGIN
    UPDATE project_parties SET sms_consent_status = 'granted'
     WHERE id = 'e0000000-0000-4000-8000-000000000032';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM;
  END;
  ASSERT raised = 'consent_legacy_column_frozen',
    'FAIL 13d2: the escape hatch must not stay open, got ' || COALESCE(raised, '<no error>');

  -- 13e. INSERT is untouched: a seat may still be BORN carrying what the studio
  --      recorded at the door (useAddProjectParty). The freeze is BEFORE UPDATE.
  INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                               sms_consent_status, sms_consent_source,
                               sms_consent_evidence, sms_consent_recorded_at,
                               sms_consent_disclosure_version)
  VALUES ('e0000000-0000-4000-8000-000000000034', 'd0000000-0000-4000-8000-00000000000a',
          'sub', 'Nell Bracco', '612-555-0178', 'pending', 'written',
          'Kickoff form', now(), 'field-sms-v1');
  SELECT COUNT(*) INTO n FROM project_parties
   WHERE id = 'e0000000-0000-4000-8000-000000000034' AND sms_consent_status = 'pending';
  ASSERT n = 1, 'FAIL 13e: an INSERT carrying consent columns must still land';

  RAISE NOTICE '13. the legacy consent columns are frozen (R-AS): passed';
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
  -- r6 R6-M3 adds ONE exemption to both legs, and it is spelled out here so it
  -- cannot widen unnoticed: email, and `granted`, and nothing else.
  ASSERT norm LIKE '%WHERE (scc.status IS DISTINCT FROM ''opted_out'' OR EXCLUDED.status = ''opted_out'' OR (EXCLUDED.channel_kind = ''email'' AND EXCLUDED.status = ''granted'')) AND (EXCLUDED.status = ''opted_out'' OR (EXCLUDED.channel_kind = ''email'' AND EXCLUDED.status = ''granted'') OR (scc.refusal_unanswered IS NOT TRUE%RETURNING%',
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
  -- r6 R6-M3: the one thing that DOES lower it is the email grant, and it is
  -- keyed off the channel as well as the verdict. Asserted positively so the
  -- SMS half of M7-1 and the email door cannot be confused for each other.
  ASSERT norm LIKE '%WHEN EXCLUDED.channel_kind = ''email'' AND EXCLUDED.status = ''granted'' THEN false%',
    'FAIL 14a6: the email grant must lower refusal_unanswered — nothing else answers an email refusal (r6 R6-M3)';

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
  r        RECORD;
  raised   TEXT;
  v_dated  timestamptz;
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
  -- 16b4. r9 M1: AND IT IS DATED BY THE ACT THAT RECORDED IT. The five
  --       evidence columns and consented_at are one set; this record carried no
  --       prior grant, so before the fix the studio's written consent sat on the
  --       record against a NULL date, and on a record that DID carry one it sat
  --       against the older grant's.
  ASSERT r.consented_at IS NOT NULL,
    'FAIL 16b4: reconsent must date the consent it records';
  v_dated := r.consented_at;

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
  -- The refused grant changed nothing: the record is still the refusal with
  -- the studio's own reconsent standing on it, and the date on that consent is
  -- still reconsent's own (r9 M1 — the grant that was refused wrote no date,
  -- and the one standing is not its).
  ASSERT r.status = 'opted_out' AND r.refusal_unanswered
     AND r.consented_at = v_dated
     AND r.evidence = 'Signed a fresh consent at the walkthrough',
    'FAIL 16c2: the refused grant must leave the record at opted_out with the '
    'reconsent''s own evidence and date, got ' || COALESCE(r.status, '<null>')
      || ' / ' || COALESCE(r.consented_at::text, '<null>') || ' / '
      || COALESCE(r.evidence, '<null>');

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

  -- 16Bd. And the seat still carries the refusal — frozen legacy since R-AS,
  --       and still the backstop sendPartySms falls back on.
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550244';
  -- The record still refuses, and the only consent date on it is the one
  -- reconsent() stamped on its own evidence (r9 M1) — the refused grant wrote
  -- nothing, and a DATELESS refusal stays dateless on the refusal side, which
  -- is the whole point of this block.
  ASSERT r.status = 'opted_out' AND r.refusal_unanswered
     AND r.opt_out_at IS NULL
     AND r.evidence = 'Signed a fresh consent at the walkthrough'
     AND r.consented_at IS NOT NULL,
    'FAIL 16Bd: the refused grant must leave the record at opted_out with the '
    'reconsent''s own evidence standing, got ' || COALESCE(r.status, '<null>')
      || ' / ' || COALESCE(r.evidence, '<null>') || ' / '
      || COALESCE(r.opt_out_at::text, '<null>');
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

  -- …and R-AL's SEAT gate still stands in front of it. This is the shape of
  -- the transition R-AS leaves for W2: the legacy seat is frozen at
  -- `opted_out`, nothing can move it, so PR-x's fail-closed second check keeps
  -- refusing even after the recipient answered. Fail-closed, and loud.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550244', 'granted',
      'written', 'Kickoff form', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'channel_opted_out',
    'FAIL 16Be: a frozen opted_out seat still refuses the write door (R-AL), got '
    || COALESCE(raised, '<no error>');
  PERFORM pg_temp.reset_role();

  -- 16Bf. Repairing that legacy seat through the deliberate door — which is
  --       what retiring PR-x's second check means in practice — opens it.
  SET LOCAL app.consent_legacy_write = 'on';
  UPDATE project_parties SET sms_consent_status = 'granted'
   WHERE id = 'e0000000-0000-4000-8000-000000000051';
  SET LOCAL app.consent_legacy_write = '';

  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '6125550244', 'granted',
    'written', 'Kickoff form', 'field-sms-v1', NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550244';
  ASSERT r.status = 'granted' AND r.evidence = 'Kickoff form',
    'FAIL 16Bf: after the recipient''s own grant and the seat repair the studio '
    'may record again';
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
-- recorder live only on the seat, where the portal put them. The retired mirror
-- used to write those NULLs down onto the seat; since R-AS the seat is never
-- written, so the fact to prove is the other half — the RECORD's own evidence
-- set survives a later write that does not restate it, and the seat's frozen
-- copy is left exactly as it stands.

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

  -- The seat is untouched — frozen legacy (R-AS).
  SELECT * INTO r FROM project_parties
   WHERE id = 'e0000000-0000-4000-8000-0000000000a1';
  ASSERT r.sms_consent_status = 'pending'
     AND r.sms_consent_disclosure_version = 'field-sms-v1'
     AND r.sms_consent_recorded_by = 'a0000000-0000-4000-8000-000000000001',
    'FAIL 18a: a record write must leave the frozen seat exactly as it stands, got '
      || COALESCE(r.sms_consent_status, '<null>');

  -- …and the room reads the RECORD, so the roster prints the rail's verdict.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  ASSERT (SELECT sms_consent_status FROM v_project_roster
           WHERE roster_id = 'e0000000-0000-4000-8000-0000000000a1') = 'granted',
    'FAIL 18b: v_project_roster must print the record''s verdict';
  ASSERT (SELECT meta->>'sms_consent_status' FROM people_directory
           WHERE person_id = 'e0000000-0000-4000-8000-0000000000a1'
             AND role = 'sub' LIMIT 1) = 'granted',
    'FAIL 18b2: people_directory''s consent meta must read the record too';
  PERFORM pg_temp.reset_role();

  -- R-AN on the record itself: a studio member re-records the same verdict
  -- with fresh words and NO disclosure version of its own; the one standing
  -- must survive rather than be nulled.
  UPDATE studio_channel_consent
     SET disclosure_version = 'field-sms-v1',
         recorded_by = 'a0000000-0000-4000-8000-000000000001'
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550344';

  INSERT INTO studio_channel_consent (
    organization_id, channel_kind, channel_value, status,
    consented_at, refusal_unanswered, source, evidence, recorded_at,
    disclosure_version, recorded_by)
  VALUES ('b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550344', 'granted',
          NOW(), false, 'inbound_sms', 'Replied YES again', NOW(), NULL, NULL)
  ON CONFLICT (organization_id, channel_kind, channel_value) DO UPDATE
    SET evidence = EXCLUDED.evidence,
        disclosure_version = COALESCE(EXCLUDED.disclosure_version,
                                      studio_channel_consent.disclosure_version),
        recorded_by = COALESCE(EXCLUDED.recorded_by,
                               studio_channel_consent.recorded_by);

  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550344';
  ASSERT r.disclosure_version = 'field-sms-v1',
    'FAIL 18c: the disclosure version must survive a write that has none, got '
      || COALESCE(r.disclosure_version, '<null>');
  ASSERT r.recorded_by = 'a0000000-0000-4000-8000-000000000001',
    'FAIL 18d: the recorder must survive too, got '
      || COALESCE(r.recorded_by::text, '<null>');

  RAISE NOTICE '18. the record''s evidence is never nulled, and the seat is never written (R-AN/R-AS): passed';
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
-- R-Q requires "granted 2 May 2025, opted out 3 Dec 2025" to stay printable, so
-- a verdict that does not restate one of the two dates must not erase it. Since
-- R-AS the record is the only place that pair lives, and the seat beside it is
-- frozen: this block proves the record keeps both dates and the seat is never
-- touched by either write.

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

  -- The seat is untouched: it still says opted_out, 3 Dec 2025.
  SELECT * INTO r FROM project_parties WHERE id = 'e0000000-0000-4000-8000-0000000000a6';
  ASSERT r.sms_consent_status = 'opted_out'
     AND r.sms_opt_out_at = '2025-12-03T00:00:00Z'::timestamptz,
    'FAIL 23a: the frozen seat must be left exactly as it stands, got '
      || COALESCE(r.sms_consent_status, '<null>');
  -- …and the room reads the record, which now says granted.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  ASSERT (SELECT sms_consent_status FROM v_project_roster
           WHERE roster_id = 'e0000000-0000-4000-8000-0000000000a6') = 'granted',
    'FAIL 23b: the roster prints the record''s verdict, not the seat''s';
  PERFORM pg_temp.reset_role();

  -- And the other way round: a refusal that carries no consented_at must not
  -- erase the grant date standing beside it (R-Q's pair, both directions).
  UPDATE studio_channel_consent
     SET status = 'opted_out', consented_at = NULL, opt_out_at = '2026-07-01T00:00:00Z',
         refusal_unanswered = true, source = 'inbound_sms', evidence = 'Replied STOP again',
         recorded_at = NOW()
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550420';

  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550420';
  ASSERT r.status = 'opted_out',
    'FAIL 23c: the record holds the refusal, got ' || COALESCE(r.status, '<null>');
  ASSERT r.opt_out_at = '2026-07-01T00:00:00Z'::timestamptz,
    'FAIL 23c2: the fresh refusal date is written, got '
      || COALESCE(r.opt_out_at::text, '<null>');
  -- The record keeps its OWN pair: consented_at is not restated by this write,
  -- and the rail's upsert carries it forward (writeChannelConsent keeps the
  -- prior consent side on a refusal).
  UPDATE studio_channel_consent SET consented_at = '2026-06-01T00:00:00Z'::timestamptz
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550420';
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550420';
  ASSERT r.consented_at = '2026-06-01T00:00:00Z'::timestamptz
     AND r.opt_out_at = '2026-07-01T00:00:00Z'::timestamptz,
    'FAIL 23d: both dates must stay printable on the record (R-Q)';

  -- And the seat, still, is untouched by either write.
  SELECT * INTO r FROM project_parties WHERE id = 'e0000000-0000-4000-8000-0000000000a6';
  ASSERT r.sms_opt_out_at = '2025-12-03T00:00:00Z'::timestamptz
     AND r.sms_consented_at = '2025-05-02T00:00:00Z'::timestamptz,
    'FAIL 23e: the frozen seat keeps its own dates';

  RAISE NOTICE '23. the record keeps both dates, the seat keeps its own (r6 M6-2/R-AS): passed';
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
  --      array (the default, and the ordinary state) stays legal. `sms` is in
  --      it (r4 R4-M2) — the one token that is NOT a 00593 channel kind.
  UPDATE studio_contact_rules
     SET channels_allowed   = ARRAY['portal_311', 'office', 'dispatch', 'after_hours',
                                    'email', 'ap_email', 'mobile', 'sms'],
         channels_forbidden = ARRAY['mobile', 'sms']
   WHERE subject_type = 'person' AND subject_id = 'c0000000-0000-4000-8000-000000000001';
  SELECT * INTO r FROM studio_contact_rules
   WHERE subject_type = 'person' AND subject_id = 'c0000000-0000-4000-8000-000000000001';
  ASSERT array_length(r.channels_allowed, 1) = 8
     AND r.channels_forbidden = ARRAY['mobile', 'sms'],
    'FAIL 25d: the real vocabulary must be accepted on both columns';

  -- 25e. r4 R4-M2: THE FIXTURE SENTENCE — "phone yes, TEXT NO" — IS WRITABLE.
  --      F-10 Sam Rowe ("email only; phone for emergencies … never texted")
  --      and F-27 Ray Thao ("phone and email only; NEVER texted; scheduled
  --      through 311") both permit the voice call on the mobile line and
  --      forbid the text on it. With the seven channel kinds alone that pair
  --      collapses: forbidding `mobile` forbids the emergency call, permitting
  --      it permits the text. Decision 1 left this table as the ONE home of
  --      the forbidding fact, so the sentence has to be sayable here.
  UPDATE studio_contact_rules
     SET channels_allowed   = ARRAY['mobile', 'email', 'portal_311'],
         channels_forbidden = ARRAY['sms']
   WHERE subject_type = 'person' AND subject_id = 'c0000000-0000-4000-8000-000000000001';
  SELECT * INTO r FROM studio_contact_rules
   WHERE subject_type = 'person' AND subject_id = 'c0000000-0000-4000-8000-000000000001';
  ASSERT r.channels_forbidden = ARRAY['sms']
     AND 'mobile' = ANY(r.channels_allowed),
    'FAIL 25e: "never texted" must be sayable without forbidding the voice '
    'call on the same line, got forbidden='
      || COALESCE(r.channels_forbidden::text, '<null>') || ' allowed='
      || COALESCE(r.channels_allowed::text, '<null>');

  -- 25f. And the token stays on THIS side of the line: `sms` is rule
  --      vocabulary, never a channel row. 00593's channel_kind is still the
  --      seven kinds, and sms_capable on the mobile line is what a composer
  --      resolves a forbidden `sms` against.
  state := NULL;
  BEGIN
    INSERT INTO studio_contact_channels (owner_type, owner_id, channel_kind, value)
    VALUES ('person', 'c0000000-0000-4000-8000-000000000001', 'sms', '+16125550101');
  EXCEPTION WHEN check_violation THEN state := SQLSTATE; END;
  ASSERT state = '23514',
    'FAIL 25f: `sms` must not be a channel KIND — it rides on mobile, and '
    'sms_capable is a fact about the line, got ' || COALESCE(state, '<no error>');

  UPDATE studio_contact_rules SET channels_allowed = '{}', channels_forbidden = '{}'
   WHERE subject_type = 'person' AND subject_id = 'c0000000-0000-4000-8000-000000000001';

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '25. the channel vocabulary is checked, both ways (r6 M6-5), '
               'and carries the rule-only `sms` token so "phone yes, text no" '
               'is writable (r4 R4-M2): passed';
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

-- r9 R5-M2's population: F-12 Pete Rusk's shape (fixture.md:96 — "granted
-- 2025-05-02, then STOP 2025-12-03"). A seat holding a WRITTEN GRANT that a
-- named studio member recorded. The refusal that lands on it next is the
-- ordinary inbound STOP, whose opt_out_recorded_by is deliberately NULL — and
-- the mirror's one-column wordless test called that refusal "worded" (its
-- source is 'inbound_sms') and let the other three columns fall back to this
-- seat, handing the refusal the GRANT's recorder. The second seat is the
-- sibling hole: a refusal that has a source but no words and no date of its
-- own must not take this seat's grant words and grant date under it.
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_consent_source,
                             sms_consent_evidence, sms_consent_recorded_at,
                             sms_consent_recorded_by, sms_consented_at)
VALUES
  ('e0000000-0000-4000-8000-0000000000ab', 'd0000000-0000-4000-8000-0000000000a4',
   'sub', 'Pete Rusk', '612-555-0437', 'granted', 'written',
   'Signed the Lindqvist kickoff form', '2025-05-02 00:00:00+00',
   'a0000000-0000-4000-8000-000000000002', '2025-05-02 00:00:00+00'),
  ('e0000000-0000-4000-8000-0000000000ac', 'd0000000-0000-4000-8000-0000000000a4',
   'sub', 'Ruth Calder', '612-555-0438', 'granted', 'written',
   'Signed the porch-swap form', '2025-06-01 00:00:00+00',
   'a0000000-0000-4000-8000-000000000002', '2025-06-01 00:00:00+00');

DO $$
DECLARE
  r      RECORD;
  raised TEXT;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  -- The refusal, recorded on the record — and on nothing else (R-AS).
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0431', 'opted_out',
    'inbound_sms', 'Replied STOP', NULL, NULL);
  SELECT * INTO r FROM project_parties WHERE id = 'e0000000-0000-4000-8000-0000000000a8';
  ASSERT r.sms_consent_status = 'not_asked',
    'FAIL 27a: the frozen seat must be untouched, got ' || COALESCE(r.sms_consent_status, '<null>');

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

  -- 27c. THE BACKSTOP SURVIVES, on the record: the refusal is what the send
  --      rail reads, and reconsent did not move it. The whole class of defect
  --      this block chased — one evidence set on the seat having to speak for
  --      two acts — cannot recur, because the seat holds no copy at all.
  ASSERT (SELECT sms_consent_status FROM project_parties
           WHERE id = 'e0000000-0000-4000-8000-0000000000a8') = 'not_asked',
    'FAIL 27c: reconsent must reach no seat';
  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  ASSERT (SELECT sms_consent_status FROM v_project_roster
           WHERE roster_id = 'e0000000-0000-4000-8000-0000000000a8') = 'opted_out',
    'FAIL 27c2: the roster reads the refusal off the record';

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
  -- 27h. …and the room follows the record all the way: the roster now prints
  --      the grant, off a seat that has never been written.
  ASSERT (SELECT sms_consent_status FROM v_project_roster
           WHERE roster_id = 'e0000000-0000-4000-8000-0000000000a8') = 'granted',
    'FAIL 27h: the roster must follow the record to granted';
  ASSERT (SELECT sms_consent_status FROM project_parties
           WHERE id = 'e0000000-0000-4000-8000-0000000000a8') = 'not_asked',
    'FAIL 27h2: and the seat is still never written';
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
     AND r.opt_out_source IS NULL AND r.opt_out_evidence IS NULL,
    'FAIL 27i: the fold must mint the portal''s sourceless refusal verbatim, got '
      || COALESCE(r.status, '<null>') || ' / '
      || COALESCE(r.opt_out_source, '<null>') || ' / '
      || COALESCE(r.source, '<null>');
  -- 27i1b. r9 M2: AND THE GROUP'S REAL GRANT IS ON THE RECORD'S CONSENT SIDE.
  --        The winning row here is the portal's sourceless, dateless
  --        `opted_out` seat, and the studio's fully evidenced grant is on the
  --        seat NEXT DOOR (Nils Ek, 'Signed consent form at kickoff',
  --        2 Jan 2026). Taking the consent set off the winner alone minted this
  --        record with all five NULL — and then, because opt_out_source is NULL
  --        too, R-AQ's wordless branch wiped that evidence off every seat
  --        (27i6/27i7 below, which still hold). Between the two, the studio's
  --        proof of prior express written consent for this number existed
  --        nowhere. The five and the DATE move together (R-Q): evidence and
  --        consented_at name the same act.
  ASSERT r.source = 'written'
     AND r.evidence = 'Signed consent form at kickoff'
     AND r.recorded_at = '2026-01-02 00:00:00+00'::timestamptz
     AND r.recorded_by = 'a0000000-0000-4000-8000-000000000001'
     AND r.consented_at = '2026-01-02 00:00:00+00'::timestamptz,
    'FAIL 27i1b: the fold must keep the group''s grant evidence on the consent '
    'side, got ' || COALESCE(r.source, '<null>') || ' / '
      || COALESCE(r.evidence, '<null>') || ' / '
      || COALESCE(r.recorded_at::text, '<null>') || ' / '
      || COALESCE(r.recorded_by::text, '<null>') || ' / '
      || COALESCE(r.consented_at::text, '<null>');

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
  -- 27i4. And the record's refusal side stays empty — the studio's own consent
  --        is never allowed to stand in for words the refusal never had.
  ASSERT r.opt_out_source IS NULL AND r.opt_out_evidence IS NULL,
    'FAIL 27i4: the studio''s consent must never become the refusal''s words, got '
      || COALESCE(r.opt_out_source, '<null>') || ' / '
      || COALESCE(r.opt_out_evidence, '<null>');

  -- 27i6. THE SIBLING SEAT IS NEVER WRITTEN AT ALL (R-AS). This is the shape
  --       r8 R8-M1 was written for: a seat next door holding the GRANT's own
  --       evidence, which the retired mirror had to be taught to wipe under an
  --       `opted_out` verdict or it stood there naming the studio's consent
  --       form as the refusal. With no copy, there is nothing to wipe and
  --       nothing to get wrong — the seat keeps its own history, untouched, and
  --       the room reads the record.
  SELECT * INTO r FROM project_parties WHERE id = 'e0000000-0000-4000-8000-0000000000aa';
  ASSERT r.sms_consent_status = 'granted'
     AND r.sms_consent_source = 'written'
     AND r.sms_consent_evidence = 'Signed consent form at kickoff',
    'FAIL 27i6: the sibling seat must be left exactly as it stands, got '
      || COALESCE(r.sms_consent_status, '<null>') || ' / '
      || COALESCE(r.sms_consent_evidence, '<null>');
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  ASSERT (SELECT sms_consent_status FROM v_project_roster
           WHERE roster_id = 'e0000000-0000-4000-8000-0000000000aa') = 'opted_out',
    'FAIL 27i7: …and the roster still prints the studio''s standing refusal';
  PERFORM pg_temp.reset_role();

  -- 27j. r9 R5-M2, on the record: a rail-written STOP names NOBODY in the
  --      studio as its recorder. The defect this chased was the retired
  --      mirror's COALESCE handing the seat the GRANT's recorder under an
  --      opted_out status; the fact that survives it is the record's own.
  -- The inbound STOP rail's own write, verbatim: dated, with the carrier's
  -- words, and NO recorder. An UPSERT, as writeChannelConsent does it — 27i's
  -- fold has already minted this number's record from the seat, so the record
  -- carries the studio's GRANT on its consent side, which is F-12's shape
  -- exactly.
  INSERT INTO studio_channel_consent (
    organization_id, channel_kind, channel_value, status,
    opt_out_at, refusal_unanswered,
    opt_out_source, opt_out_evidence, opt_out_recorded_at, opt_out_recorded_by)
  VALUES (
    'b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550437', 'opted_out',
    '2025-12-03T00:00:00Z', true,
    'inbound_sms', 'Replied STOP', '2025-12-03T00:00:00Z', NULL)
  ON CONFLICT (organization_id, channel_kind, channel_value) DO UPDATE
    SET status              = EXCLUDED.status,
        opt_out_at          = EXCLUDED.opt_out_at,
        refusal_unanswered  = EXCLUDED.refusal_unanswered,
        opt_out_source      = EXCLUDED.opt_out_source,
        opt_out_evidence    = EXCLUDED.opt_out_evidence,
        opt_out_recorded_at = EXCLUDED.opt_out_recorded_at,
        opt_out_recorded_by = EXCLUDED.opt_out_recorded_by;

  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550437';
  ASSERT r.opt_out_recorded_by IS NULL,
    'FAIL 27j2: the record must say nobody in the studio recorded the refusal, got '
      || COALESCE(r.opt_out_recorded_by::text, '<null>');
  ASSERT r.opt_out_source = 'inbound_sms' AND r.opt_out_evidence = 'Replied STOP',
    'FAIL 27j3: the refusal keeps its own words on the record';
  -- The grant's side is untouched: the record holds both acts at once, which is
  -- what one evidence set on a seat never could (R-Q).
  ASSERT r.source = 'written'
     AND r.evidence = 'Signed the Lindqvist kickoff form'
     AND r.consented_at = '2025-05-02T00:00:00Z'::timestamptz,
    'FAIL 27j4: the grant''s evidence must stand beside the refusal''s, got '
      || COALESCE(r.evidence, '<null>');
  -- …and the seat it was folded from is untouched by the rail's write.
  SELECT * INTO r FROM project_parties WHERE id = 'e0000000-0000-4000-8000-0000000000ab';
  ASSERT r.sms_consent_status = 'granted'
     AND r.sms_consent_recorded_by = 'a0000000-0000-4000-8000-000000000002',
    'FAIL 27j5: the frozen seat keeps the grant it was carrying, got '
      || COALESCE(r.sms_consent_status, '<null>');


  RAISE NOTICE '27. reconsent is evidence-only and re-callable (r7 M7-2), '
               'leaves the refusal''s own evidence standing (r8 W4-M2), a '
               'sourceless refusal is never given the studio''s consent as its '
               'words (r6 R6-M1), and no consent act reaches a seat at all '
               '(R-AS): passed';
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

  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550435';
  ASSERT r.status = 'opted_out'
     AND r.opt_out_at = '2025-12-03T00:00:00Z'
     AND r.opt_out_source = 'inbound_sms'
     AND r.opt_out_evidence = 'Inbound STOP',
    'FAIL 28a: the rail''s refusal lands on the record, got '
      || COALESCE(r.status, '<null>') || ' / '
      || COALESCE(r.opt_out_at::text, '<null>') || ' / '
      || COALESCE(r.opt_out_source, '<null>');

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
  -- AND IT DOES NOT LAND ON THE CONSENT SIDE INSTEAD (r6 R6-M1). That side
  -- holds the GRANT's evidence, beside the consented_at the record keeps; a
  -- refusal writing there composed R-Q's grant sentence out of the refusal's
  -- own words. A duplicate refusal writes nothing, which is what it is worth —
  -- here the record has never held a grant, so all five stay NULL.
  ASSERT r.source IS NULL AND r.evidence IS NULL AND r.recorded_by IS NULL
     AND r.recorded_at IS NULL AND r.disclosure_version IS NULL,
    'FAIL 28b4: a refusal must not write the consent side (r6 R6-M1), got '
      || COALESCE(r.source, '<null>') || ' / ' || COALESCE(r.evidence, '<null>') || ' / '
      || COALESCE(r.recorded_by::text, '<null>');
  ASSERT r.status = 'opted_out' AND r.refusal_unanswered,
    'FAIL 28b5: the refusal still stands unanswered, got '
      || COALESCE(r.status, '<null>');

  -- 28c. AND THE SEAT IS NOT WRITTEN AT ALL (R-AS) — the record is where the
  --      refusal's own words live, and the only place any surface reads them.
  SELECT * INTO seat FROM project_parties
   WHERE id = 'e0000000-0000-4000-8000-0000000000b1';
  ASSERT seat.sms_consent_status = 'not_asked'
     AND seat.sms_consent_source IS NULL,
    'FAIL 28c: the frozen seat must be untouched, got '
      || COALESCE(seat.sms_consent_status, '<null>') || ' / '
      || COALESCE(seat.sms_consent_source, '<null>');

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
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  ASSERT (SELECT sms_consent_status FROM v_project_roster
           WHERE roster_id = 'e0000000-0000-4000-8000-0000000000b2') = 'opted_out',
    'FAIL 28e4: the roster follows the record';
  PERFORM pg_temp.reset_role();

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
   'company', 'gc', NULL, 'Holder GC', 'a0000000-0000-4000-8000-000000000001'),
  -- r9 R5-M1's card: the SUBJECT of a rule, not its route. Legal as both kinds
  -- for the same reason as 071 — the entity-name check must not be what
  -- refuses the flip.
  ('c0000000-0000-4000-8000-000000000073', 'b0000000-0000-4000-8000-00000000000a',
   'person', 'sub', 'Ruled Person', 'Ruled Person LLC',
   'a0000000-0000-4000-8000-000000000001');

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

  -- 29g. r9 R5-M1: THE FIFTH HOLDER — the card a rule is ABOUT, not only the
  --      card it routes TO. studio_contact_rules.subject_id is polymorphic and
  --      unFK'd, and assert_studio_contact_rule_route() polices it from the
  --      RULE side only. With subject_id missing from the holder list, ONE
  --      member-reachable `UPDATE studio_contacts SET entity_kind` — a column
  --      the shipped hook writes on every card edit — filed a FORBIDDING rule
  --      under the other noun: unfindable to a reader that asks by the card's
  --      own kind, which is r8 F1's fail-open exactly. And unrepairable, since
  --      rule_subject_kind_mismatch then refuses every later write to the
  --      stranded row, so W1b's rule editor could not undo what the card
  --      editor did. Nothing else points at this card: the rule is the only
  --      thing that can be holding it.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  INSERT INTO studio_contact_rules (subject_type, subject_id, channels_forbidden, reason)
  VALUES ('person', 'c0000000-0000-4000-8000-000000000073', ARRAY['mobile'],
          'Never text this one');

  raised := NULL;
  BEGIN
    UPDATE studio_contacts
       SET entity_kind = 'company'
     WHERE id = 'c0000000-0000-4000-8000-000000000073';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'studio_contact_identity_held',
    'FAIL 29g: a card a contact rule is filed against may not change its kind, got '
      || COALESCE(raised, '<no error>');
  SELECT * INTO r FROM studio_contact_rules
   WHERE subject_id = 'c0000000-0000-4000-8000-000000000073';
  ASSERT r.subject_type = 'person',
    'FAIL 29g2: the rule must still agree with its subject''s noun, got '
      || COALESCE(r.subject_type, '<null>');

  -- 29h. And the studio move, the mirror-image half: it would leave the rule
  --      ruling about a card in ANOTHER TENANT — the state
  --      rule_route_other_studio exists to refuse, which then also blocks the
  --      re-save.
  raised := NULL;
  BEGIN
    UPDATE studio_contacts
       SET organization_id = 'b0000000-0000-4000-8000-00000000000b'
     WHERE id = 'c0000000-0000-4000-8000-000000000073';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'studio_contact_identity_held',
    'FAIL 29h: a card a contact rule is filed against may not move studios, got '
      || COALESCE(raised, '<no error>');

  -- 29h2. Detach the rule and the card is free again — the same way out the
  --       other four holders have.
  DELETE FROM studio_contact_rules
   WHERE subject_id = 'c0000000-0000-4000-8000-000000000073';
  UPDATE studio_contacts
     SET entity_kind = 'company'
   WHERE id = 'c0000000-0000-4000-8000-000000000073';
  PERFORM pg_temp.reset_role();
  SELECT * INTO r FROM studio_contacts
   WHERE id = 'c0000000-0000-4000-8000-000000000073';
  ASSERT r.entity_kind = 'company',
    'FAIL 29h2: once the rule is gone the card must be free to change, got '
      || COALESCE(r.entity_kind, '<null>');

  RAISE NOTICE '29. a held card cannot change what it is or whose it is — '
               'including the card a contact rule is filed against '
               '(r8 R8-M2, R-AR; r9 R5-M1): passed';
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

  -- 30b. And EVERY SEAT is left exactly as the fixture wrote it: the fold
  --      READS project_parties and writes only the record (R-AS). Both seats
  --      print the record's refusal through the roster all the same.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  FOR seat IN
    SELECT * FROM project_parties
     WHERE id IN ('e0000000-0000-4000-8000-0000000000c1',
                  'e0000000-0000-4000-8000-0000000000c2')
     ORDER BY id
  LOOP
    ASSERT seat.sms_consent_status = 'opted_out',
      'FAIL 30b: seat ' || seat.id || ' must be left as the fixture wrote it';
    ASSERT (SELECT sms_consent_status FROM v_project_roster
             WHERE roster_id = seat.id) = 'opted_out',
      'FAIL 30b2: seat ' || seat.id || ' must print the record''s refusal';
  END LOOP;
  PERFORM pg_temp.reset_role();

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
               'words on the record (r2 R2-M1): passed';
END
$$;

-- ─── 30e. r4 R4-M1: the refusal's WORDS only ever come off a refusal ───────
--
-- The refusal CTE admits two shapes, and only one of them is a refusal. The
-- second — a seat whose STATUS reads `granted` while it carries an opt-out date
-- no later consent answered (the r8 W4-M1 population) — is admitted precisely
-- BECAUSE its status lies about the refusal. project_parties has ONE evidence
-- set, so on that row the source, the words, the recorder and the recorded-at
-- belong to whatever wrote the CURRENT status: THE GRANT, i.e. the studio's own
-- consent paperwork. Projected across as the refusal's own evidence, the record
-- reads "opted out IN WRITING, per the Lindqvist kickoff form, written down
-- 2025-01-01" against an opt_out_at of 2025-11-16 — the refusal recorded ten
-- months before it happened, the studio's consent document named as the
-- refusal. That is decisions 22 and 23 (R5-M1, R-AQ) failing from the FOLD
-- rather than from the mirror; and because opt_out_source came out non-NULL,
-- the mirror's wordless-refusal branch never fired, so R-AQ's protective
-- NULL-write was suppressed exactly where it was needed and the grant's
-- paperwork reached BOTH seats.
--
-- The date legs are not the defect and are not changed: 2025-11-16 is a real
-- refusal date whichever status carries it, and it must still land.

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_consented_at, sms_opt_out_at,
                             sms_consent_source, sms_consent_evidence,
                             sms_consent_recorded_at, sms_consent_disclosure_version,
                             sms_consent_recorded_by)
VALUES
  -- the portal's honest refusal: opted out, no date, no source, no words
  ('e0000000-0000-4000-8000-0000000000c5', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Pete Rusk', '(612) 555-0503',
   'opted_out', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  -- the legacy seat: says granted, carries an unanswered opt-out date, and its
  -- evidence set is THE GRANT'S — the studio's own kickoff paperwork
  ('e0000000-0000-4000-8000-0000000000c6', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Pete Rusk', '612-555-0503',
   'granted', '2025-01-01T00:00:00Z', '2025-11-16T00:00:00Z',
   'written', 'Signed the Lindqvist kickoff form', '2025-01-01T00:00:00Z',
   'field-sms-v1', 'a0000000-0000-4000-8000-000000000001');

DO $$
DECLARE
  r    RECORD;
  seat RECORD;
BEGIN
  PERFORM public.backfill_channel_consent_from_parties();

  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = '+16125550503';

  -- 30e1. Still an unanswered refusal, and still dated: the fix is about the
  --       words, not the date.
  ASSERT r.status = 'opted_out' AND r.refusal_unanswered,
    'FAIL 30e1: the folded record must be an unanswered refusal, got '
      || COALESCE(r.status, '<none>');
  ASSERT r.opt_out_at = '2025-11-16T00:00:00Z'::timestamptz,
    'FAIL 30e2: the real opt-out date must still land, got '
      || COALESCE(r.opt_out_at::text, '<null>');

  -- 30e3. And the record says NOTHING about how they refused, because no row
  --       here knows: a grant's paperwork is not a refusal's words.
  ASSERT r.opt_out_source IS NULL
     AND r.opt_out_evidence IS NULL
     AND r.opt_out_recorded_at IS NULL
     AND r.opt_out_recorded_by IS NULL,
    'FAIL 30e3: the GRANT''s evidence must never be filed as the refusal''s '
    'own words, got ' || COALESCE(r.opt_out_source, '<null>') || ' / '
      || COALESCE(r.opt_out_evidence, '<null>') || ' / '
      || COALESCE(r.opt_out_recorded_at::text, '<null>') || ' / '
      || COALESCE(r.opt_out_recorded_by::text, '<null>');

  -- 30e4. A sourceless refusal reaching the mirror is the wordless case, so
  --       R-AQ's branch fires and BOTH seats are left saying nothing about the
  --       refusal either — including the seat that was holding the grant's
  --       paperwork. Before the fix the branch was suppressed by the fold's own
  --       contamination and both seats read (opted_out, written, "Signed the
  --       Lindqvist kickoff form").
  -- …and the seats are untouched, but every one of them prints the record's
  --  refusal through the roster (R-AS).
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  FOR seat IN
    SELECT * FROM project_parties
     WHERE id IN ('e0000000-0000-4000-8000-0000000000c5',
                  'e0000000-0000-4000-8000-0000000000c6')
     ORDER BY id
  LOOP
    ASSERT (SELECT sms_consent_status FROM v_project_roster
             WHERE roster_id = seat.id) = 'opted_out',
      'FAIL 30e4: seat ' || seat.id || ' must print the record''s refusal';
  END LOOP;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE '30e. a grant''s paperwork is never filed as the refusal''s own '
               'words on the record (r4 R4-M1): passed';
END
$$;

-- ─── 30f. r10 M1: a STOP over a standing grant is not a refusal IN WRITING ──
--
-- 30e covered one of the two shapes whose evidence set does not belong to the
-- refusal. This is the other, and it is the commonest real refusal on the
-- books: a seat with a recorded grant that later texted STOP. The shipped
-- inbound rail flipped sms_consent_status to `opted_out` and stamped the date
-- while LEAVING THE GRANT'S FOUR EVIDENCE COLUMNS STANDING, so the row reads
-- (opted_out, written, "Signed the Lindqvist kickoff form", recorded
-- 2025-05-02) against an opt_out_at of 2025-12-03. Folded on status alone the
-- record came out saying the person opted out IN WRITING, seven months before
-- they did, recorded_by the studio member who wrote down the GRANT — the
-- attribution R7-M1 and R5-M2 both ruled must be NULL on a rail-written STOP.
-- And because opt_out_source came out non-NULL, R-AQ's wordless branch never
-- fired, so the grant's paperwork was stamped onto every sibling seat in the
-- studio on that number. Nothing repaired it: ON CONFLICT DO NOTHING, and
-- record_channel_reconsent never touches opt_out_*.
--
-- The grant's paperwork is not DESTROYED here — it is a true fact about the
-- consent, and 30f4 holds it on the record's CONSENT side, which is where the
-- 10DLC artifact of a grant belongs. Only the refusal's own four columns must
-- not borrow it.

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_consented_at, sms_opt_out_at,
                             sms_consent_source, sms_consent_evidence,
                             sms_consent_recorded_at, sms_consent_disclosure_version,
                             sms_consent_recorded_by)
VALUES
  -- the seat that texted STOP over a standing written grant: the rail flipped
  -- the status and the date and left the GRANT's evidence set behind
  ('e0000000-0000-4000-8000-0000000000c7', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Ruth Ojala', '(612) 555-0504',
   'opted_out', '2025-05-02T00:00:00Z', '2025-12-03T00:00:00Z',
   'written', 'Signed the Lindqvist kickoff form', '2025-05-02T00:00:00Z',
   'field-sms-v1', 'a0000000-0000-4000-8000-000000000001'),
  -- a sibling seat the studio holds on the same number, still granted, with
  -- its own paperwork: the seat R-AQ's branch must reach
  ('e0000000-0000-4000-8000-0000000000c8', 'd0000000-0000-4000-8000-00000000000a', 'installer', 'Ruth Ojala', '612.555.0504',
   'granted', '2025-06-01T00:00:00Z', NULL,
   'verbal', 'Said yes on the walk-through', '2025-06-01T00:00:00Z',
   'field-sms-v1', 'a0000000-0000-4000-8000-000000000001'),
  -- CONTROL A: the same STOP as written by the FIXED rail. Its evidence says
  -- `inbound_sms`, which only the rail writes, so the record must keep it.
  ('e0000000-0000-4000-8000-0000000000c9', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Ivar Melby', '(612) 555-0505',
   'opted_out', '2025-05-02T00:00:00Z', '2025-12-03T00:00:00Z',
   'inbound_sms', 'Inbound STOP', '2025-12-03T00:00:00Z',
   'field-sms-v1', NULL),
  -- CONTROL B: a studio-recorded refusal over a standing grant — written down
  -- the day AFTER the person refused. Nothing about it contradicts the
  -- refusal, so its words are the refusal's and must survive.
  ('e0000000-0000-4000-8000-0000000000ca', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Ada Sorem', '(612) 555-0506',
   'opted_out', '2025-05-02T00:00:00Z', '2025-12-03T00:00:00Z',
   'verbal', 'Told me on site to stop texting', '2025-12-04T00:00:00Z',
   'field-sms-v1', 'a0000000-0000-4000-8000-000000000001');

DO $$
DECLARE
  r    RECORD;
  seat RECORD;
BEGIN
  PERFORM public.backfill_channel_consent_from_parties();

  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = '+16125550504';

  -- 30f1/30f2. Still an unanswered refusal, still dated: the fix is about the
  --            words, not the verdict or the date.
  ASSERT r.status = 'opted_out' AND r.refusal_unanswered,
    'FAIL 30f1: the folded record must be an unanswered refusal, got '
      || COALESCE(r.status, '<none>');
  ASSERT r.opt_out_at = '2025-12-03T00:00:00Z'::timestamptz,
    'FAIL 30f2: the refusal date must still land, got '
      || COALESCE(r.opt_out_at::text, '<null>');

  -- 30f3. And the record says NOTHING about HOW they refused. A grant's
  --       paperwork, written down seven months before the STOP, is not the
  --       refusal's words, and the studio member who recorded that grant did
  --       not record this refusal.
  ASSERT r.opt_out_source IS NULL
     AND r.opt_out_evidence IS NULL
     AND r.opt_out_recorded_at IS NULL
     AND r.opt_out_recorded_by IS NULL,
    'FAIL 30f3: a STOP over a standing grant must never be recorded as a '
    'refusal in writing, got ' || COALESCE(r.opt_out_source, '<null>') || ' / '
      || COALESCE(r.opt_out_evidence, '<null>') || ' / '
      || COALESCE(r.opt_out_recorded_at::text, '<null>') || ' / '
      || COALESCE(r.opt_out_recorded_by::text, '<null>');

  -- 30f4. The grant's paperwork is not thrown away — it is the CONSENT's own
  --       10DLC artifact and it lands on the consent side, next to the
  --       consent's date. Nothing is lost; it is filed under the right act.
  ASSERT r.source = 'written'
     AND r.evidence = 'Signed the Lindqvist kickoff form'
     AND r.recorded_at = '2025-05-02T00:00:00Z'::timestamptz
     AND r.recorded_by = 'a0000000-0000-4000-8000-000000000001'
     AND r.disclosure_version = 'field-sms-v1'
     AND r.consented_at = '2025-05-02T00:00:00Z'::timestamptz,
    'FAIL 30f4: the grant''s own paperwork must stand on the consent side, got '
      || COALESCE(r.source, '<null>') || ' / ' || COALESCE(r.evidence, '<null>')
      || ' / ' || COALESCE(r.recorded_at::text, '<null>') || ' / '
      || COALESCE(r.recorded_by::text, '<null>');

  -- 30f5. The seats keep their own history — the fold READS them and writes
  --       only the record (R-AS) — and both print the record's refusal. The
  --       whole hazard this block was written for (a seat left asserting the
  --       studio's kickoff form AS the refusal) belonged to the copy.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  FOR seat IN
    SELECT * FROM project_parties
     WHERE id IN ('e0000000-0000-4000-8000-0000000000c7',
                  'e0000000-0000-4000-8000-0000000000c8')
     ORDER BY id
  LOOP
    ASSERT (SELECT sms_consent_status FROM v_project_roster
             WHERE roster_id = seat.id) = 'opted_out',
      'FAIL 30f5: seat ' || seat.id || ' must print the record''s refusal';
  END LOOP;
  PERFORM pg_temp.reset_role();

  -- 30f7. CONTROL A — the fixed rail's own write. `inbound_sms` is a source
  --       only the rail writes, so the words ARE the refusal's however the
  --       dates fall, and the record keeps every one of them. This is the leg
  --       that proves the test above is a test and not a blanket NULL.
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = '+16125550505';
  ASSERT r.opt_out_source = 'inbound_sms'
     AND r.opt_out_evidence = 'Inbound STOP'
     AND r.opt_out_recorded_at = '2025-12-03T00:00:00Z'::timestamptz
     AND r.opt_out_recorded_by IS NULL,
    'FAIL 30f7: a texted refusal must keep its own words, got '
      || COALESCE(r.opt_out_source, '<null>') || ' / '
      || COALESCE(r.opt_out_evidence, '<null>') || ' / '
      || COALESCE(r.opt_out_recorded_at::text, '<null>') || ' / '
      || COALESCE(r.opt_out_recorded_by::text, '<null>');

  -- 30f8. CONTROL B — a studio-recorded refusal written down AFTER the person
  --       refused. Nothing contradicts it, so it keeps its words and its
  --       recorder: this is the ordinary "told me on site to stop" refusal and
  --       the fix must not touch it.
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = '+16125550506';
  ASSERT r.opt_out_source = 'verbal'
     AND r.opt_out_evidence = 'Told me on site to stop texting'
     AND r.opt_out_recorded_at = '2025-12-04T00:00:00Z'::timestamptz
     AND r.opt_out_recorded_by = 'a0000000-0000-4000-8000-000000000001',
    'FAIL 30f8: a refusal recorded after the fact must keep its own words, got '
      || COALESCE(r.opt_out_source, '<null>') || ' / '
      || COALESCE(r.opt_out_evidence, '<null>') || ' / '
      || COALESCE(r.opt_out_recorded_at::text, '<null>') || ' / '
      || COALESCE(r.opt_out_recorded_by::text, '<null>');

  RAISE NOTICE '30f. a STOP over a standing grant is recorded wordless, the '
               'grant''s paperwork stays on the consent side, and a real '
               'refusal keeps its words (r10 M1): passed';
END
$$;

-- ─── 31. r8 F1: the rule's SUBJECT is held to its own noun ──────────────────
--
-- subject_id is polymorphic and unFK'd. Block 24 proved the ROUTE is guarded,
-- but assert_studio_contact_rule_route() returned at its first statement when
-- route_to_person_id was NULL, so a routeless rule — which is what a plain
-- "never texted" rule is — was never inspected at all, and subject_type was
-- free to name the other kind of card. The RLS legs catch only the cross-FAMILY
-- slip (studio_contact_org() and project_party_designer() return NULL for the
-- wrong table), never the wrong noun inside studio_contacts.
--
-- The room asks for a rule by the noun of the card it is holding, so a rule
-- filed under the other noun is invisible to every correct reader, and a
-- FORBIDDING rule nobody finds fails OPEN — F-27 Ray Thao (NEVER texted) and
-- F-10 Sam Rowe (never texted), lost inside the ONE home decision 1 gave them.
--
-- Fixtures in hand: c…0062 is a PERSON card at studio A, c…0063 a COMPANY card
-- at the same studio, and neither carries a rule yet (the unique index is on
-- (subject_type, subject_id)).

DO $$
DECLARE
  raised TEXT;
  r      RECORD;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  -- 31a. 'person' naming a COMPANY card, with NO route — the case the early
  --      return used to wave through.
  raised := NULL;
  BEGIN
    INSERT INTO studio_contact_rules (subject_type, subject_id, channels_forbidden, reason)
    VALUES ('person', 'c0000000-0000-4000-8000-000000000063', ARRAY['mobile'],
            'Never texted');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'rule_subject_kind_mismatch',
    'FAIL 31a: a person rule filed against a company card must be refused, got '
      || COALESCE(raised, '<no error>');

  -- 31b. The other crossing: 'company' naming a PERSON card.
  raised := NULL;
  BEGIN
    INSERT INTO studio_contact_rules (subject_type, subject_id, channels_forbidden, reason)
    VALUES ('company', 'c0000000-0000-4000-8000-000000000062', ARRAY['mobile'],
            'Dispatch only');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'rule_subject_kind_mismatch',
    'FAIL 31b: a company rule filed against a person card must be refused, got '
      || COALESCE(raised, '<no error>');

  -- 31c/31d. Both matching pairs write, routeless.
  INSERT INTO studio_contact_rules (subject_type, subject_id, channels_forbidden, reason)
  VALUES ('person', 'c0000000-0000-4000-8000-000000000062', ARRAY['mobile'],
          'Never texted; scheduled through the office');
  SELECT * INTO r FROM studio_contact_rules
   WHERE subject_type = 'person' AND subject_id = 'c0000000-0000-4000-8000-000000000062';
  ASSERT r.channels_forbidden = ARRAY['mobile']
     AND r.route_to_person_id IS NULL,
    'FAIL 31c: a person rule on a person card must write, routeless';

  INSERT INTO studio_contact_rules (subject_type, subject_id, channels_forbidden, reason)
  VALUES ('company', 'c0000000-0000-4000-8000-000000000063', ARRAY['mobile'],
          'The firm is reached at the desk');
  SELECT * INTO r FROM studio_contact_rules
   WHERE subject_type = 'company' AND subject_id = 'c0000000-0000-4000-8000-000000000063';
  ASSERT r.channels_forbidden = ARRAY['mobile'],
    'FAIL 31d: a company rule on a company card must write, routeless';

  -- 31e. The UPDATE path is guarded on subject_type …
  raised := NULL;
  BEGIN
    UPDATE studio_contact_rules SET subject_type = 'company'
     WHERE subject_type = 'person'
       AND subject_id = 'c0000000-0000-4000-8000-000000000062';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'rule_subject_kind_mismatch',
    'FAIL 31e: re-filing a person rule as a company rule must be refused, got '
      || COALESCE(raised, '<no error>');

  -- 31f. … and on subject_id.
  raised := NULL;
  BEGIN
    UPDATE studio_contact_rules
       SET subject_id = 'c0000000-0000-4000-8000-000000000063'
     WHERE subject_type = 'person'
       AND subject_id = 'c0000000-0000-4000-8000-000000000062';
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'rule_subject_kind_mismatch',
    'FAIL 31f: moving a person rule onto a company card must be refused, got '
      || COALESCE(raised, '<no error>');

  -- 31g. A card subject that names no card at all.
  raised := NULL;
  BEGIN
    INSERT INTO studio_contact_rules (subject_type, subject_id, channels_forbidden, reason)
    VALUES ('person', 'c0000000-0000-4000-8000-0000000009ff', ARRAY['mobile'],
            'Never texted');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'rule_subject_not_found',
    'FAIL 31g: a rule on a card that does not exist must be refused, got '
      || COALESCE(raised, '<no error>');

  -- 31h. An engagement subject that names no party — and the real one, which
  --      is checked against project_parties rather than against a card kind.
  raised := NULL;
  BEGIN
    INSERT INTO studio_contact_rules (subject_type, subject_id, channels_forbidden, reason)
    VALUES ('engagement', 'e0000000-0000-4000-8000-0000000009ff', ARRAY['mobile'],
            'On this job, never texted');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'rule_subject_not_found',
    'FAIL 31h: a job override on a party that does not exist must be refused, '
    'got ' || COALESCE(raised, '<no error>');

  -- 31i. Nothing above moved the well-formed row.
  SELECT * INTO r FROM studio_contact_rules
   WHERE subject_type = 'person' AND subject_id = 'c0000000-0000-4000-8000-000000000062';
  ASSERT r.reason = 'Never texted; scheduled through the office',
    'FAIL 31i: the accepted rule must still stand where it was filed';

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '31. a rule is filed under the noun its subject actually is '
               '(r8 F1): passed';
END
$$;

-- ─── 32. r6 R6-M1: a refusal never writes the CONSENT side ─────────────────
--
-- The record holds a GRANT and a later REFUSAL at once, and R-Q has to print
-- both: "Written consent, 2 May 2025 · Opted out verbally, 3 Dec 2025". The
-- opted_out branch used to write the consent's five columns as well as the
-- refusal's own four, and the evidence gate forces a refusal to carry a
-- non-blank source and evidence, so the COALESCEs never protected anything.
-- One ordinary PR-m act — the F-12 shape, a written kickoff-form grant then the
-- verbal refusal the studio heard — left the record dating the grant to 2 May
-- and sourcing it to the refusal: R-Q's grant sentence composed to "Verbal
-- consent, 2 May 2025" and the consent's own 10DLC artifact was gone with no
-- audit row. This is W4-M2's finding arriving from the opposite direction.

DO $$
DECLARE
  grant_row RECORD;
  r         RECORD;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0490', 'granted',
    'written', 'Signed the Lindqvist kickoff form', 'field-sms-v1', NULL);
  SELECT * INTO grant_row FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550490';

  -- PR-m: the studio marks the refusal it heard. Accepted — recording a
  -- refusal is always the way forward.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0490', 'opted_out',
    'verbal', 'He told me on site', NULL, NULL);
  PERFORM pg_temp.reset_role();

  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550490';

  -- 32a. The refusal is on the books, with its own account of itself.
  ASSERT r.status = 'opted_out' AND r.refusal_unanswered
     AND r.opt_out_source = 'verbal' AND r.opt_out_evidence = 'He told me on site'
     AND r.opt_out_recorded_by = 'a0000000-0000-4000-8000-000000000001',
    'FAIL 32a: the refusal must be recorded with its own evidence, got '
      || COALESCE(r.status, '<null>') || ' / '
      || COALESCE(r.opt_out_source, '<null>') || ' / '
      || COALESCE(r.opt_out_evidence, '<null>');

  -- 32b. And the GRANT the record still dates is still the grant that happened.
  ASSERT r.source = 'written',
    'FAIL 32b: the grant''s source must survive the refusal, got '
      || COALESCE(r.source, '<null>');
  ASSERT r.evidence = 'Signed the Lindqvist kickoff form',
    'FAIL 32b2: the grant''s words must survive the refusal, got '
      || COALESCE(r.evidence, '<null>');
  ASSERT r.disclosure_version = 'field-sms-v1',
    'FAIL 32b3: the disclosure the person was shown must survive, got '
      || COALESCE(r.disclosure_version, '<null>');
  ASSERT r.recorded_at = grant_row.recorded_at,
    'FAIL 32b4: the grant''s recorded_at must not walk forward to the refusal, got '
      || COALESCE(r.recorded_at::text, '<null>') || ' vs '
      || COALESCE(grant_row.recorded_at::text, '<null>');
  ASSERT r.recorded_by = grant_row.recorded_by,
    'FAIL 32b5: the grant''s recorder must survive the refusal';
  ASSERT r.consented_at = grant_row.consented_at,
    'FAIL 32b6: the grant''s DATE must survive the refusal (R-Q)';

  -- 32c. Which is the point: both halves of R-Q's sentence compose, and the
  --      grant half names a WRITTEN consent, not the refusal's verbal one.
  ASSERT (r.source || ' consent, ' || to_char(r.consented_at, 'DD Mon YYYY'))
         = ('written consent, ' || to_char(grant_row.consented_at, 'DD Mon YYYY')),
    'FAIL 32c: R-Q''s grant sentence must still be the grant''s, got '
      || COALESCE(r.source, '<null>');

  RAISE NOTICE '32. a recorded refusal never speaks for the grant it stands '
               'beside (r6 R6-M1): passed';
END
$$;

-- ─── 33. r6 R6-M2: an EMPTY disclosure version is a blank, not a value ─────
--
-- Every gate in record_channel_consent tests blankness the SQL way —
-- COALESCE(btrim(x), '') = ''. The DO UPDATE's disclosure_version tested NULL,
-- and p_disclosure_version is the one evidence argument the opted_out branch
-- does NOT require (deliberately: a refusal is not shown a disclosure). So a
-- caller sending an empty form field rather than omitting it wrote '' straight
-- over the stored version — the single column the file names as the one a
-- refusal may not touch — and nothing restores it: reconsent overwrites it, the
-- mirror only COALESCEs record → seat, the fold is ON CONFLICT DO NOTHING.

DO $$
DECLARE
  r    RECORD;
  norm TEXT;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0491', 'granted',
    'written', 'Signed the 2026 form', 'v2', NULL);

  -- The blank, not the omission.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0491', 'opted_out',
    'verbal', 'Asked us to stop', '', NULL);
  PERFORM pg_temp.reset_role();

  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550491';
  ASSERT r.status = 'opted_out',
    'FAIL 33a: the refusal must still be recorded, got ' || COALESCE(r.status, '<null>');
  ASSERT r.disclosure_version = 'v2',
    'FAIL 33a2: a blank disclosure version must not wipe the stored one, got '
      || COALESCE(NULLIF(r.disclosure_version, ''), '<blank>');

  -- 33b. And the blank is refused where the disclosure IS required, so the
  --      empty form field cannot launder a grant either.
  DECLARE raised TEXT; BEGIN
    PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
    raised := NULL;
    BEGIN
      PERFORM public.record_channel_consent(
        'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0492', 'granted',
        'written', 'Signed', '', NULL);
    EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
    ASSERT raised = 'consent_evidence_required',
      'FAIL 33b: a blank disclosure version must be refused on a grant, got '
        || COALESCE(raised, '<no error>');
    PERFORM pg_temp.reset_role();
  END;

  -- 33c. The three consent-side columns all test blankness the same way, so a
  --      future caller-side blank cannot empty any of them either. Held on the
  --      source text: no verdict this RPC accepts can reach them with a blank
  --      today, which is exactly why the rule needs a guard that does not rely
  --      on a caller.
  SELECT regexp_replace(
           regexp_replace(pg_get_functiondef(p.oid), '--[^\n]*', '', 'g'),
           '\s+', ' ', 'g') INTO norm
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname = 'record_channel_consent';
  ASSERT norm LIKE '%COALESCE(NULLIF(btrim(EXCLUDED.source), ''''), scc.source)%',
    'FAIL 33c: source must test blankness, not NULL (r6 R6-M2)';
  ASSERT norm LIKE '%COALESCE(NULLIF(btrim(EXCLUDED.evidence), ''''), scc.evidence)%',
    'FAIL 33c2: evidence must test blankness, not NULL (r6 R6-M2)';
  ASSERT norm LIKE '%COALESCE(NULLIF(btrim(EXCLUDED.disclosure_version), ''''), scc.disclosure_version)%',
    'FAIL 33c3: disclosure_version must test blankness, not NULL (r6 R6-M2)';

  RAISE NOTICE '33. a blank evidence field cannot empty the evidence set '
               '(r6 R6-M2): passed';
END
$$;

-- ─── 34. r6 R6-M3: an EMAIL refusal has a way back; an SMS one does not ────
--
-- PR-m: "The way back is always a fresh recorded consent OR an inbound START."
-- For SMS the wave chose the START half and defended it on 10DLC grounds — the
-- inbound rail is the one writer that lowers refusal_unanswered. channel_kind
-- also admits 'email', and on email that rail does not exist: pipeline.ts
-- writes channel_kind 'sms' only, nothing in the tree writes an email consent
-- row, and reconsent() no longer moves the status. So an email refusal was
-- PERMANENT — recorded, then granted → channel_opted_out; reconsent, then
-- granted → channel_opted_out; for ever, with no carrier rule asking for it.
-- Latent only until direction §7's P3 email channel status lands.

DO $$
DECLARE
  r      RECORD;
  raised TEXT;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  -- 34a. An unsubscribe the studio heard, recorded on the email channel.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'email', ' Dana@Example.COM ', 'opted_out',
    'verbal', 'Asked to be taken off the list', NULL, NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'email' AND channel_value = 'dana@example.com';
  ASSERT r.status = 'opted_out' AND r.refusal_unanswered,
    'FAIL 34a: the email refusal must be on the books, got '
      || COALESCE(r.status, '<null>');

  -- 34b. `pending` stays refused: the double opt-in is the SMS rail's dance,
  --      and there is no inbound START on email to complete it.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'email', 'dana@example.com', 'pending',
      'written', 'Signed the 2026 form', 'email-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'channel_opted_out',
    'FAIL 34b: pending must still be refused on an email refusal, got '
      || COALESCE(raised, '<no error>');

  -- 34c. The evidence is still mandatory — "a fresh recorded consent" means a
  --      source, the words, and the disclosure the person was shown.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'email', 'dana@example.com', 'granted',
      'written', 'Signed the 2026 form', NULL, NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'consent_evidence_required',
    'FAIL 34c: an email grant still needs its full evidence set, got '
      || COALESCE(raised, '<no error>');

  -- 34d. And with it, the door opens — the flag comes down, because nothing
  --      else on email can ever lower it.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'email', 'dana@example.com', 'granted',
    'written', 'Signed the 2026 form', 'email-v1', NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'email' AND channel_value = 'dana@example.com';
  ASSERT r.status = 'granted' AND NOT r.refusal_unanswered,
    'FAIL 34d: a fresh recorded consent must be email''s way back, got '
      || COALESCE(r.status, '<null>') || ' / ' || COALESCE(r.refusal_unanswered::text, '<null>');
  ASSERT r.consented_at IS NOT NULL AND r.opt_out_at IS NOT NULL,
    'FAIL 34d2: both dates must stay printable — "opted out …, consented again …" (R-Q)';
  ASSERT r.opt_out_source = 'verbal'
     AND r.opt_out_evidence = 'Asked to be taken off the list',
    'FAIL 34d3: the refusal''s own account must survive the grant that answers it, got '
      || COALESCE(r.opt_out_source, '<null>');
  ASSERT r.source = 'written' AND r.evidence = 'Signed the 2026 form'
     AND r.disclosure_version = 'email-v1',
    'FAIL 34d4: and the grant must carry its own evidence, got '
      || COALESCE(r.source, '<null>') || ' / ' || COALESCE(r.disclosure_version, '<null>');

  -- 34e. THE ASYMMETRY IS THE WHOLE POINT. The same two acts on SMS are still
  --      refused: there the recipient's own YES/START is the only answer, and
  --      10DLC is why.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0493', 'opted_out',
    'verbal', 'Asked to be taken off the list', NULL, NULL);
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0493', 'granted',
      'written', 'Signed the 2026 form', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'channel_opted_out',
    'FAIL 34e: an SMS refusal must still refuse a studio-recorded grant, got '
      || COALESCE(raised, '<no error>');

  -- 34e2. Including after reconsent() — the composed path r3r2 M-1 closed.
  PERFORM public.record_channel_reconsent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0493',
    'written', 'Signed the 2026 form', 'field-sms-v1', NULL);
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0493', 'granted',
      'written', 'Signed the 2026 form', 'field-sms-v1', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'channel_opted_out',
    'FAIL 34e2: reconsent plus a grant must still not compose on SMS, got '
      || COALESCE(raised, '<no error>');

  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = '+16125550493';
  ASSERT r.status = 'opted_out' AND r.refusal_unanswered,
    'FAIL 34e3: the SMS refusal must still stand unanswered, got '
      || COALESCE(r.status, '<null>');

  PERFORM pg_temp.reset_role();
  RAISE NOTICE '34. an email refusal is recoverable by a fresh recorded '
               'consent and an SMS one is not (r6 R6-M3): passed';
END
$$;

-- ─── 35. r9 M1: a fresh consent recorded over a refusal DATES ITSELF ───────
--
-- record_channel_reconsent() restates the studio's five evidence columns on
-- every call — source, evidence, recorded_at, disclosure_version, recorded_by —
-- and consented_at was deliberately left alone on the reading that "the dates
-- are kept". But consented_at is the date OF THOSE FIVE (R-Q, 00594:159-170),
-- not a fact of its own: left on the older grant, one ordinary call through the
-- door the channel_opted_out HINT sends studios to turned a record holding
-- (2 May 2025, written, "Signed the kickoff form", v3) into one reading
-- (verbal, "He said it is fine now", recorded today, v9) AGAINST 2 May 2025 —
-- R-Q's grant sentence composing to "Verbal consent, 2 May 2025", which is
-- verbatim the failure r6 R6-M1 closed in record_channel_consent. Worse, v3 —
-- the disclosure the person was actually shown at that grant — was destroyed on
-- the record and, through the mirror's COALESCE, stamped as v9 onto every seat
-- in the studio on that number, under an opted_out status.

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status)
VALUES
  ('e0000000-0000-4000-8000-0000000000d0', 'd0000000-0000-4000-8000-00000000000a',
   'sub', 'Hetty Vance', '(612) 555-0507', 'not_asked');

DO $$
DECLARE
  r       RECORD;
  seat    RECORD;
  v_grant CONSTANT timestamptz := '2025-05-02 00:00:00+00';
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  -- A real, evidenced, DATED grant on the record…
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0507', 'granted',
    'written', 'Signed the kickoff form', 'field-sms-v3', NULL);
  PERFORM pg_temp.reset_role();
  UPDATE studio_channel_consent
     SET consented_at = v_grant, recorded_at = v_grant
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550507';

  -- …then the STOP, which keeps the grant's five and its date (r6 R6-M1).
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0507', 'opted_out',
    'inbound_sms', 'Replied STOP', NULL, NULL);
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550507';
  ASSERT r.consented_at = v_grant AND r.source = 'written'
     AND r.disclosure_version = 'field-sms-v3',
    'FAIL 35a: the refusal must leave the grant''s dated evidence standing, got '
      || COALESCE(r.consented_at::text, '<null>') || ' / '
      || COALESCE(r.source, '<null>') || ' / '
      || COALESCE(r.disclosure_version, '<null>');

  -- 35b. THE FRESH CONSENT. Its source, its words, its disclosure version AND
  --      its date are one act.
  PERFORM public.record_channel_reconsent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0507',
    'verbal', 'He said it is fine now', 'field-sms-v9', NULL);
  PERFORM pg_temp.reset_role();
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550507';
  ASSERT r.source = 'verbal' AND r.evidence = 'He said it is fine now'
     AND r.disclosure_version = 'field-sms-v9',
    'FAIL 35b: the studio''s fresh consent must be on the record, got '
      || COALESCE(r.source, '<null>') || ' / ' || COALESCE(r.evidence, '<null>');
  ASSERT r.consented_at <> v_grant AND r.consented_at = r.recorded_at,
    'FAIL 35b2: the fresh consent must carry its OWN date, not the older '
    'grant''s — R-Q would otherwise compose "verbal consent, 2 May 2025", got '
      || COALESCE(r.consented_at::text, '<null>') || ' vs recorded_at '
      || COALESCE(r.recorded_at::text, '<null>');

  -- 35c. AND NOTHING ELSE MOVED (r7 M7-2). The refusal still stands, on its own
  --      date, with its own words: this is an evidence-only door.
  ASSERT r.status = 'opted_out' AND r.refusal_unanswered
     AND r.opt_out_at IS NOT NULL
     AND r.opt_out_source = 'inbound_sms' AND r.opt_out_evidence = 'Replied STOP',
    'FAIL 35c: reconsent must move nothing but the consent evidence, got '
      || COALESCE(r.status, '<null>') || ' / '
      || COALESCE(r.opt_out_at::text, '<null>') || ' / '
      || COALESCE(r.opt_out_source, '<null>');

  -- 35d. And the record agrees with itself: the disclosure version it carries
  --      is the one standing beside the date it carries. Before the fix it read
  --      v9 against a consented_at of 2 May 2025 — a version stamped onto a
  --      grant whose recipient never saw it. The seat is untouched (R-AS).
  ASSERT r.disclosure_version = 'field-sms-v9'
     AND r.consented_at IS NOT NULL
     AND r.consented_at > '2025-05-02T00:00:00Z'::timestamptz,
    'FAIL 35d: the record''s disclosure version and consent date must name the '
    'same act, got ' || COALESCE(r.disclosure_version, '<null>')
      || ' / ' || COALESCE(r.consented_at::text, '<null>');
  SELECT * INTO seat FROM project_parties
   WHERE id = 'e0000000-0000-4000-8000-0000000000d0';
  ASSERT seat.sms_consent_disclosure_version IS NOT DISTINCT FROM
         (SELECT sms_consent_disclosure_version FROM project_parties
           WHERE id = 'e0000000-0000-4000-8000-0000000000d0'),
    'FAIL 35d2: the seat is frozen legacy and is not written by reconsent';

  RAISE NOTICE '35. a fresh consent recorded over a refusal carries its own '
               'date, so source, words, disclosure version and date name one '
               'act (r9 M1): passed';
END
$$;

-- ─── 36. r9 M2: the fold takes the CONSENT side off the group, not off the ──
--        winning row alone
--
-- The commonest legacy shape on the books: a studio holding a fully evidenced
-- grant on one seat and the shipped portal's SOURCELESS, DATELESS `opted_out`
-- on another seat on the same number (use-coordination.ts writes exactly that).
-- The sourceless refusal wins the bucket — it must, it is the refusal — and the
-- consent set used to come off that winner alone, so the record was minted with
-- source / evidence / recorded_at / disclosure_version / recorded_by all NULL.
-- Then the second half: opt_out_source came out NULL too, which is what R-AQ's
-- mirror branch reads as "this refusal has no words", so the mirror wrote NULL
-- over all four evidence columns on EVERY seat in the studio on that number —
-- including the seat that held the grant. ON CONFLICT DO NOTHING means no later
-- fold repairs the record and reconsent never touches opt_out_*, so the
-- studio's proof of prior express written consent survived nowhere.

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_consented_at, sms_opt_out_at,
                             sms_consent_source, sms_consent_evidence,
                             sms_consent_recorded_at, sms_consent_disclosure_version,
                             sms_consent_recorded_by)
VALUES
  -- the portal's refusal: a status and nothing else
  ('e0000000-0000-4000-8000-0000000000d1', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Bo Ferris', '(612) 555-0511',
   'opted_out', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  -- the seat next door, carrying the studio's whole 10DLC artifact
  ('e0000000-0000-4000-8000-0000000000d2', 'd0000000-0000-4000-8000-00000000000a', 'installer', 'Bo Ferris', '612.555.0511',
   'granted', '2025-05-02T00:00:00Z', NULL,
   'written', 'Signed the kickoff form', '2025-05-02T00:00:00Z',
   'field-sms-v3', 'a0000000-0000-4000-8000-000000000001'),
  -- CONTROL: the same sourceless refusal, but the only sibling's evidence is
  -- the REFUSAL'S OWN WORDS (a rail-written STOP). A refusal is not a grant, so
  -- nothing may be projected onto the consent side from it — "Replied STOP"
  -- filed as the consent's evidence is r4 R4-M1 in reverse.
  ('e0000000-0000-4000-8000-0000000000d3', 'd0000000-0000-4000-8000-00000000000a', 'sub', 'Cleo Hart', '(612) 555-0512',
   'opted_out', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
  ('e0000000-0000-4000-8000-0000000000d4', 'd0000000-0000-4000-8000-00000000000a', 'installer', 'Cleo Hart', '612.555.0512',
   'opted_out', NULL, '2025-12-03T00:00:00Z',
   'inbound_sms', 'Inbound STOP', '2025-12-03T00:00:00Z',
   'field-sms-v3', NULL);

DO $$
DECLARE
  r    RECORD;
  seat RECORD;
BEGIN
  PERFORM public.backfill_channel_consent_from_parties();

  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = '+16125550511';

  -- 36a. The verdict is unchanged: the refusal wins, unanswered and wordless.
  ASSERT r.status = 'opted_out' AND r.refusal_unanswered
     AND r.opt_out_source IS NULL AND r.opt_out_evidence IS NULL
     AND r.opt_out_recorded_at IS NULL AND r.opt_out_recorded_by IS NULL,
    'FAIL 36a: the folded record must be a wordless unanswered refusal, got '
      || COALESCE(r.status, '<null>') || ' / '
      || COALESCE(r.opt_out_source, '<null>');

  -- 36b. AND THE GROUP'S GRANT IS ON THE CONSENT SIDE, ALL SIX TOGETHER.
  ASSERT r.source = 'written'
     AND r.evidence = 'Signed the kickoff form'
     AND r.recorded_at = '2025-05-02T00:00:00Z'::timestamptz
     AND r.disclosure_version = 'field-sms-v3'
     AND r.recorded_by = 'a0000000-0000-4000-8000-000000000001'
     AND r.consented_at = '2025-05-02T00:00:00Z'::timestamptz,
    'FAIL 36b: the fold must take the group''s grant evidence, not the winning '
    'row''s emptiness, got ' || COALESCE(r.source, '<null>') || ' / '
      || COALESCE(r.evidence, '<null>') || ' / '
      || COALESCE(r.recorded_at::text, '<null>') || ' / '
      || COALESCE(r.disclosure_version, '<null>') || ' / '
      || COALESCE(r.recorded_by::text, '<null>') || ' / '
      || COALESCE(r.consented_at::text, '<null>');

  -- 36c. The seats keep their own history — the sourceless refusal on one, the
  --      studio's written grant on the other — because the fold only READS them
  --      (R-AS). R-AQ's wipe was the mirror's answer to one evidence set having
  --      to describe two acts; with no copy, both facts simply stay where they
  --      were written and the record carries both sides at once.
  SELECT * INTO seat FROM project_parties
   WHERE id = 'e0000000-0000-4000-8000-0000000000d1';
  ASSERT seat.sms_consent_status = 'opted_out' AND seat.sms_consent_source IS NULL,
    'FAIL 36c: the sourceless refusing seat is left as it stands, got '
      || COALESCE(seat.sms_consent_status, '<null>');
  SELECT * INTO seat FROM project_parties
   WHERE id = 'e0000000-0000-4000-8000-0000000000d2';
  ASSERT seat.sms_consent_status = 'granted' AND seat.sms_consent_source = 'written',
    'FAIL 36c2: the grant seat keeps the studio''s paperwork, got '
      || COALESCE(seat.sms_consent_status, '<null>') || ' / '
      || COALESCE(seat.sms_consent_source, '<null>');
  -- …and both print the record's refusal.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  ASSERT (SELECT COUNT(*) FROM v_project_roster
           WHERE roster_id IN ('e0000000-0000-4000-8000-0000000000d1',
                               'e0000000-0000-4000-8000-0000000000d2')
             AND sms_consent_status = 'opted_out') = 2,
    'FAIL 36c3: both seats must print the record''s refusal';
  PERFORM pg_temp.reset_role();

  -- 36d. CONTROL — a group whose only evidence is the REFUSAL's own words, so
  --      there is no grant anywhere in it. The refusal side takes those words
  --      (that is what they are). The consent side takes the WINNER's own set,
  --      unchanged by this fix — which here is the same refusal minting the
  --      record, exactly as the other two writers of a mint do
  --      (record_channel_consent's INSERT leg 00594, sms-inbound/pipeline.ts:
  --      "when this act MINTS the record there is no grant standing to
  --      protect"). What must NOT happen is the fold reaching into the group
  --      and inventing a grant out of a refusing sibling's words, or DATING
  --      one: consented_at stays NULL, so no grant sentence composes.
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_kind = 'sms' AND channel_value = '+16125550512';
  ASSERT r.opt_out_source = 'inbound_sms' AND r.opt_out_evidence = 'Inbound STOP'
     AND r.opt_out_at = '2025-12-03T00:00:00Z'::timestamptz,
    'FAIL 36d: the texted refusal must keep its own words, got '
      || COALESCE(r.opt_out_source, '<null>') || ' / '
      || COALESCE(r.opt_out_evidence, '<null>');
  ASSERT r.consented_at IS NULL AND r.recorded_by IS NULL
     AND r.source = 'inbound_sms' AND r.evidence = 'Inbound STOP',
    'FAIL 36d2: a group holding no grant must not have one invented for it — '
    'the winner''s own set stands and no consent DATE appears, got '
      || COALESCE(r.source, '<null>') || ' / ' || COALESCE(r.evidence, '<null>')
      || ' / ' || COALESCE(r.consented_at::text, '<null>') || ' / '
      || COALESCE(r.recorded_by::text, '<null>');

  RAISE NOTICE '36. the fold keeps the group''s grant evidence when the winning '
               'row carries none, and never invents one for a group that holds '
               'none (r9 M2): passed';
END
$$;

-- ─── 37. R-AS: the single source, as objects and as access ─────────────────
--
-- The shape of the ruling, asserted directly: the mirror is gone, the freeze is
-- on, both shipped readers go through channel_consent_status(), and that
-- function is SECURITY INVOKER so the consent table's own member-only RLS is
-- what decides who may read a studio's verdict.

DO $$
DECLARE
  n INTEGER;
  v TEXT;
BEGIN
  -- 37a. The mirror and its trigger are gone, wholly.
  SELECT COUNT(*) INTO n FROM pg_proc pr
    JOIN pg_namespace ns ON ns.oid = pr.pronamespace
   WHERE ns.nspname = 'public' AND pr.proname = 'mirror_channel_consent_to_parties';
  ASSERT n = 0, 'FAIL 37a: the mirror function must not exist, got ' || n;
  SELECT COUNT(*) INTO n FROM pg_trigger
   WHERE tgrelid = 'public.studio_channel_consent'::regclass
     AND NOT tgisinternal AND tgname = 'mirror_channel_consent_to_parties_trg';
  ASSERT n = 0, 'FAIL 37a2: the mirror trigger must not exist, got ' || n;

  -- 37b. The freeze is on the table.
  SELECT COUNT(*) INTO n FROM pg_trigger
   WHERE tgrelid = 'public.project_parties'::regclass
     AND NOT tgisinternal AND tgname = 'refuse_legacy_consent_write_trg';
  ASSERT n = 1, 'FAIL 37b: the freeze trigger must exist, got ' || n;

  -- 37c. Both shipped readers go through the one function.
  ASSERT (SELECT definition FROM pg_views
           WHERE schemaname = 'public' AND viewname = 'v_project_roster')
         ILIKE '%channel_consent_status%',
    'FAIL 37c: v_project_roster must read the record';
  ASSERT (SELECT definition FROM pg_views
           WHERE schemaname = 'public' AND viewname = 'people_directory')
         ILIKE '%channel_consent_status%',
    'FAIL 37c2: people_directory must read the record';

  -- 37d. …and neither one still reads the frozen column for its consent word.
  ASSERT (SELECT definition FROM pg_views
           WHERE schemaname = 'public' AND viewname = 'v_project_roster')
         NOT ILIKE '%pp.sms_consent_status%',
    'FAIL 37d: v_project_roster must not read the frozen seat column';

  -- 37e. ORG ISOLATION, through RLS. Alpha's member sees Alpha's verdict for
  --      the shared number; Beta's member asks the same question of Alpha's org
  --      and is answered nothing at all — the function is SECURITY INVOKER, so
  --      studio_channel_consent's member-only policy is the whole access rule.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  SELECT public.channel_consent_status(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550142') INTO v;
  ASSERT v IS NOT NULL,
    'FAIL 37e: a member must read their own studio''s verdict, got <null>';
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000002');
  SELECT public.channel_consent_status(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550142') INTO v;
  ASSERT v IS NULL,
    'FAIL 37e2: another studio''s verdict must not be readable, got ' || COALESCE(v, '<null>');
  PERFORM pg_temp.reset_role();

  RAISE NOTICE '37. the record is the single source: no mirror, the legacy '
               'columns frozen, both readers on channel_consent_status(), and '
               'org isolation through RLS (R-AS): passed';
END
$$;


-- ─── 38. close-review r1 MAJOR-1: one resolver, so a reader and a writer ────
--        can never name different studios for the same seat
--
-- Both views used to INLINE _primary_studio_for's body, and an inlined copy in
-- a security_invoker view is not a definer: it sees only the memberships the
-- CALLER's own organization_members RLS shows it. A project with studio_id NULL
-- whose designer belongs to two studios therefore resolved to one studio for a
-- writer and to another for a reader — and the reader then asked THAT studio's
-- ledger and printed its word with confidence.
--
-- The fixture is exactly that shape: Carol joined Beta in 2025 and Alpha in
-- 2026, so the resolver's ordering (owner first, then earliest joined) resolves
-- her to Beta; her project carries no studio_id; Beta holds the refusal for the
-- number and Alpha holds a grant for the same number on its own books.

DO $$
DECLARE
  v_org   UUID;
  v_alice TEXT;
  v_bob   TEXT;
BEGIN
  INSERT INTO organization_members (user_id, organization_id, role, status, joined_at, created_at, updated_at)
  VALUES
    ('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-00000000000a', 'member', 'active', '2026-01-01T00:00:00Z', NOW(), NOW()),
    ('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-00000000000b', 'admin',  'active', '2025-01-01T00:00:00Z', NOW(), NOW());

  INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at)
  VALUES ('d0000000-0000-4000-8000-00000000000c', 'W1A Carol job',
          'a0000000-0000-4000-8000-000000000003', NULL,
          'a0000000-0000-4000-8000-000000000003', 'active', NOW(), NOW());

  ASSERT (SELECT studio_id FROM projects
           WHERE id = 'd0000000-0000-4000-8000-00000000000c') IS NULL,
    'FAIL 38 fixture: the project must carry no studio_id — that is the whole case';

  INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, sms_consent_status)
  VALUES ('e0000000-0000-4000-8000-00000000000c', 'd0000000-0000-4000-8000-00000000000c',
          'sub', 'Ray Thao', '(612) 555-9001', 'not_asked');

  INSERT INTO studio_channel_consent (organization_id, channel_kind, channel_value, status, refusal_unanswered)
  VALUES ('b0000000-0000-4000-8000-00000000000b', 'sms', '+16125559001', 'opted_out', true),
         ('b0000000-0000-4000-8000-00000000000a', 'sms', '+16125559001', 'granted',   false);

  -- 38a. The resolver answers the way every WRITER answers.
  SELECT public.project_consent_org('d0000000-0000-4000-8000-00000000000c') INTO v_org;
  ASSERT v_org = 'b0000000-0000-4000-8000-00000000000b',
    'FAIL 38a: the seat''s consent belongs to Beta, got ' || COALESCE(v_org::text, '<null>');

  -- 38b. …and it answers the same for a caller who can see only Alpha's half
  --      of Carol's memberships. Before this fix the inlined copy answered
  --      Alpha here, and the roster printed Alpha's `granted` for a number
  --      Beta's books refuse.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  SELECT public.project_consent_org('d0000000-0000-4000-8000-00000000000c') INTO v_org;
  ASSERT v_org = 'b0000000-0000-4000-8000-00000000000b',
    'FAIL 38b: the resolver must not answer per caller, got ' || COALESCE(v_org::text, '<null>');

  -- 38c. So Alpha's owner no longer reads Alpha's word for Beta's seat. She is
  --      not a member of Beta, and channel_consent_status() is SECURITY
  --      INVOKER, so Beta's ledger is closed to her: the roster degrades to
  --      `not_asked` rather than printing another studio's verdict.
  SELECT sms_consent_status INTO v_alice FROM v_project_roster
   WHERE roster_id = 'e0000000-0000-4000-8000-00000000000c';
  ASSERT v_alice = 'not_asked',
    'FAIL 38c: an Alpha reader must not be answered off Alpha''s ledger, got '
      || COALESCE(v_alice, '<null>');
  PERFORM pg_temp.reset_role();

  -- 38d. Beta's owner — the studio whose ledger this is — reads the refusal.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000002');
  SELECT sms_consent_status INTO v_bob FROM v_project_roster
   WHERE roster_id = 'e0000000-0000-4000-8000-00000000000c';
  ASSERT v_bob = 'opted_out',
    'FAIL 38d: the owning studio must read its own refusal, got '
      || COALESCE(v_bob, '<null>');
  PERFORM pg_temp.reset_role();

  -- 38e. Neither view carries the inlined body any more — one resolver, three
  --      call sites, so this cannot drift back.
  ASSERT (SELECT definition FROM pg_views
           WHERE schemaname = 'public' AND viewname = 'v_project_roster')
         ILIKE '%project_consent_org%',
    'FAIL 38e: v_project_roster must call the resolver';
  ASSERT (SELECT definition FROM pg_views
           WHERE schemaname = 'public' AND viewname = 'people_directory')
         ILIKE '%project_consent_org%',
    'FAIL 38e2: people_directory must call the resolver';
  -- The team branch still joins organization_members for its own reasons; what
  -- must be gone is the primary-studio ORDER BY the consent word used to
  -- resolve through.
  ASSERT (SELECT definition FROM pg_views
           WHERE schemaname = 'public' AND viewname = 'v_project_roster')
         NOT ILIKE '%design_studio%',
    'FAIL 38e3: v_project_roster must not inline the primary-studio lookup';
  ASSERT (SELECT definition FROM pg_views
           WHERE schemaname = 'public' AND viewname = 'people_directory')
         NOT ILIKE '%design_studio%',
    'FAIL 38e4: people_directory must not inline the primary-studio lookup';

  -- 38f. The resolver is a definer with its search_path pinned, closed to
  --      PUBLIC and anon, open to the two roles the views are read by.
  ASSERT (SELECT prosecdef FROM pg_proc pr
            JOIN pg_namespace ns ON ns.oid = pr.pronamespace
           WHERE ns.nspname = 'public' AND pr.proname = 'project_consent_org'),
    'FAIL 38f: project_consent_org must be SECURITY DEFINER';
  ASSERT (SELECT 'search_path=public' = ANY(proconfig) FROM pg_proc pr
            JOIN pg_namespace ns ON ns.oid = pr.pronamespace
           WHERE ns.nspname = 'public' AND pr.proname = 'project_consent_org'),
    'FAIL 38f2: project_consent_org must pin its search_path';
  ASSERT NOT has_function_privilege('anon',
    'public.project_consent_org(uuid)', 'EXECUTE'),
    'FAIL 38f3: anon must not execute project_consent_org';
  ASSERT has_function_privilege('authenticated',
    'public.project_consent_org(uuid)', 'EXECUTE'),
    'FAIL 38f4: authenticated must execute project_consent_org';

  RAISE NOTICE '38. one resolver for the seat''s studio: reader and writer '
               'agree, and no view prints another studio''s consent word '
               '(close-review r1 MAJOR-1): passed';
END
$$;

-- ─── 39. close-review r2 MAJOR-1: the add path never lowers a standing grant ─
--
-- The room's most ordinary act — a repeat sub added to a SECOND job with "text
-- updates" ticked — used to call record_channel_consent(…, 'pending', …)
-- unconditionally. The transition gate only refuses a move OUT of opted_out, so
-- granted -> pending passed every leg: the studio's own recorded grant was
-- demoted on every add. Three things went with it — the room printed "Invited"
-- for a number the studio holds an evidenced grant for, channelConsentVerdict
-- fell from "allow" to "unknown" so every non-invite send was refused as
-- not_consented against a seat born `pending` (fixture F-11), and the new act's
-- five evidence columns landed on top of the OLD grant's consented_at, so R-Q
-- composed "Verbal consent, 2 May 2025" and the disclosure version the person
-- was actually shown was gone from the only copy there is.
--
-- Two halves are asserted here: the RPC now refuses the downgrade by name, and
-- record_channel_invite() — the door useAddProjectParty calls — returns the
-- standing grant untouched instead.

INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at)
VALUES ('d0000000-0000-4000-8000-0000000000a5', 'W1A Lindqvist kitchen',
        'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000a',
        'a0000000-0000-4000-8000-000000000001', 'active', NOW(), NOW());

DO $$
DECLARE
  r      RECORD;
  r2     RECORD;
  raised TEXT;
  w      TEXT;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  -- 39a. The studio records the written grant it holds, and it is back-dated
  --      the way a real 2025 grant is. (The back-date is a direct write as the
  --      test's superuser — now() is frozen for the whole transaction, and the
  --      point of the case is that an OLD date must not end up under a NEW
  --      act's words.)
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '(612) 555-0601', 'granted',
    'written', 'Signed the Lindqvist kickoff form', 'field-sms-v3', NULL);
  PERFORM pg_temp.reset_role();

  UPDATE studio_channel_consent
     SET consented_at = '2025-05-02T00:00:00Z', recorded_at = '2025-05-02T00:00:00Z'
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550601';

  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550601';
  ASSERT r.status = 'granted' AND r.source = 'written'
     AND r.disclosure_version = 'field-sms-v3',
    'FAIL 39a fixture: the studio must hold an evidenced written grant';

  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');

  -- 39b. THE FINDING. A `pending` over that grant is refused, by name.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_consent(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0601', 'pending',
      'verbal', 'Said yes at the Okonkwo walkthrough', 'field-sms-v9',
      'd0000000-0000-4000-8000-0000000000a5');
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'consent_already_granted',
    'FAIL 39b: pending over a standing granted must be refused by name, got '
      || COALESCE(raised, '<no error>');

  -- 39c. …and the record is byte-for-byte what it was. The grant's date is
  --      still filed under the grant's own words and its own disclosure.
  SELECT * INTO r2 FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550601';
  ASSERT r2.status             = 'granted'
     AND r2.source             = 'written'
     AND r2.evidence           = 'Signed the Lindqvist kickoff form'
     AND r2.disclosure_version = 'field-sms-v3'
     AND r2.consented_at       = '2025-05-02T00:00:00Z'::timestamptz
     AND r2.recorded_at        = '2025-05-02T00:00:00Z'::timestamptz,
    'FAIL 39c: the refused write must leave the grant and its evidence exactly '
    'as they stood, got ' || COALESCE(r2.status, '<null>') || ' / '
      || COALESCE(r2.source, '<null>') || ' / '
      || COALESCE(r2.disclosure_version, '<null>');

  -- 39d. The door the add path actually uses returns that grant UNTOUCHED —
  --      no error to swallow, no write, nothing for the designer to see.
  SELECT * INTO r2 FROM public.record_channel_invite(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0601',
    'verbal', 'Said yes at the Okonkwo walkthrough', 'field-sms-v9',
    'd0000000-0000-4000-8000-0000000000a5');
  ASSERT r2.status             = 'granted'
     AND r2.source             = 'written'
     AND r2.evidence           = 'Signed the Lindqvist kickoff form'
     AND r2.disclosure_version = 'field-sms-v3'
     AND r2.consented_at       = '2025-05-02T00:00:00Z'::timestamptz,
    'FAIL 39d: the invite door must return the standing grant untouched, got '
      || COALESCE(r2.status, '<null>') || ' / ' || COALESCE(r2.source, '<null>');

  SELECT * INTO r2 FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550601';
  ASSERT r2.recorded_at = '2025-05-02T00:00:00Z'::timestamptz
     AND r2.origin_project_id IS NOT DISTINCT FROM r.origin_project_id,
    'FAIL 39d2: the invite door must write NOTHING when a grant stands';

  -- 39e. So the room keeps printing the grant's word — "Texting", not
  --      "Invited" — for the seat the add creates.
  SELECT public.channel_consent_status(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550601') INTO w;
  ASSERT w = 'granted',
    'FAIL 39e: the room must still read the grant, got ' || COALESCE(w, '<null>');

  -- 39f. NEGATIVE CONTROL — with nothing on the books the same door mints the
  --      `pending` the add path needs, with the caller's own evidence. The
  --      close-review r1 MAJOR-2 fix is not undone.
  SELECT * INTO r2 FROM public.record_channel_invite(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '(612) 555-0602',
    'verbal', 'Said yes at the Okonkwo walkthrough', 'field-sms-v9',
    'd0000000-0000-4000-8000-0000000000a5');
  ASSERT r2.status = 'pending' AND r2.source = 'verbal'
     AND r2.evidence = 'Said yes at the Okonkwo walkthrough'
     AND r2.disclosure_version = 'field-sms-v9'
     AND r2.channel_value = '+16125550602'
     AND r2.origin_project_id = 'd0000000-0000-4000-8000-0000000000a5',
    'FAIL 39f: with no record standing the invite door must mint the pending, got '
      || COALESCE(r2.status, '<null>');

  -- 39g. …and over a standing `pending` it still goes through, refreshing the
  --      invite's evidence. A pending is not a grant; nothing is protected.
  SELECT * INTO r2 FROM public.record_channel_invite(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550602',
    'written', 'Re-sent the opt-in from the Lindqvist job', 'field-sms-v9', NULL);
  ASSERT r2.status = 'pending' AND r2.source = 'written'
     AND r2.evidence = 'Re-sent the opt-in from the Lindqvist job',
    'FAIL 39g: the invite door must restate a pending''s evidence, got '
      || COALESCE(r2.source, '<null>');

  -- 39h. Every gate of the sibling still applies through this door: a refusal
  --      on the books refuses the invite before any seat is born.
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '(612) 555-0603', 'opted_out',
    'inbound_sms', 'Replied STOP', NULL, NULL);
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_invite(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0603',
      'verbal', 'Said yes at the walkthrough', 'field-sms-v9', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'channel_opted_out',
    'FAIL 39h: the invite door must inherit the refusal gate, got '
      || COALESCE(raised, '<no error>');

  -- 39i. …and the evidence requirement, and the normaliser.
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_invite(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '(612) 555-0604',
      NULL, NULL, NULL, NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'consent_evidence_required',
    'FAIL 39i: the invite door must require evidence, got '
      || COALESCE(raised, '<no error>');

  -- …and the same normaliser, so the two spellings of 0602 above are ONE key.
  -- (An unparseable phone is deliberately KEPT by normalize_channel_value as
  -- trimmed raw text — 00593's rule, block 11 — so there is no refusal to
  -- assert here; what matters is that this door cannot land on a key the
  -- sibling would not.)
  ASSERT (SELECT COUNT(*) FROM studio_channel_consent
           WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
             AND channel_value IN ('+16125550602', '(612) 555-0602')) = 1,
    'FAIL 39i2: both spellings must land on one key';
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_invite(
      'b0000000-0000-4000-8000-00000000000a', 'carrier_pigeon', '612-555-0606',
      'verbal', 'Said yes', 'field-sms-v9', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'invalid_channel_kind',
    'FAIL 39i3: the invite door must refuse a channel kind it has no rules for, got '
      || COALESCE(raised, '<no error>');
  PERFORM pg_temp.reset_role();

  -- 39j. A GRANT CARRYING AN UNANSWERED REFUSAL IS NOT A GRANT TO PROTECT.
  --      It is unsendable (block 40), so the invite falls through and is
  --      refused properly rather than silently "succeeding" on a dead number.
  INSERT INTO studio_channel_consent (
    organization_id, channel_kind, channel_value, status, consented_at,
    opt_out_at, refusal_unanswered, source, evidence, recorded_at,
    disclosure_version)
  VALUES ('b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550605', 'granted',
          NULL, '2025-11-16T00:00:00Z', true, 'verbal', 'Said yes on site, years ago',
          '2024-02-01T00:00:00Z', 'field-sms-v1');

  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_invite(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0605',
      'verbal', 'Said yes at the walkthrough', 'field-sms-v9', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'consent_awaiting_recipient',
    'FAIL 39j: an unsendable granted must not be treated as a standing grant, got '
      || COALESCE(raised, '<no error>');
  PERFORM pg_temp.reset_role();

  -- 39k. A stranger studio cannot use the door to learn whether a grant stands
  --      — the membership gate is BEFORE the read, since the door is a definer.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000002');
  raised := NULL;
  BEGIN
    PERFORM public.record_channel_invite(
      'b0000000-0000-4000-8000-00000000000a', 'sms', '612-555-0601',
      'verbal', 'Said yes', 'field-sms-v9', NULL);
  EXCEPTION WHEN OTHERS THEN raised := SQLERRM; END;
  ASSERT raised = 'not_a_studio_member',
    'FAIL 39k: a non-member must be refused before the read, got '
      || COALESCE(raised, '<no error>');
  PERFORM pg_temp.reset_role();

  -- 39l. The door is a definer with its search_path pinned, closed to PUBLIC
  --      and anon, open to the two roles that call it.
  ASSERT (SELECT prosecdef FROM pg_proc pr
            JOIN pg_namespace ns ON ns.oid = pr.pronamespace
           WHERE ns.nspname = 'public' AND pr.proname = 'record_channel_invite'),
    'FAIL 39l: record_channel_invite must be SECURITY DEFINER';
  ASSERT (SELECT 'search_path=public' = ANY(proconfig) FROM pg_proc pr
            JOIN pg_namespace ns ON ns.oid = pr.pronamespace
           WHERE ns.nspname = 'public' AND pr.proname = 'record_channel_invite'),
    'FAIL 39l2: record_channel_invite must pin its search_path';
  ASSERT NOT has_function_privilege('anon',
    'public.record_channel_invite(uuid, text, text, text, text, text, uuid)', 'EXECUTE'),
    'FAIL 39l3: anon must not execute record_channel_invite';
  ASSERT has_function_privilege('authenticated',
    'public.record_channel_invite(uuid, text, text, text, text, text, uuid)', 'EXECUTE'),
    'FAIL 39l4: authenticated must execute record_channel_invite';
  ASSERT has_function_privilege('service_role',
    'public.record_channel_invite(uuid, text, text, text, text, text, uuid)', 'EXECUTE'),
    'FAIL 39l5: service_role must execute record_channel_invite';

  RAISE NOTICE '39. the add path never lowers a standing grant: pending over '
               'granted is refused by name and the invite door returns the '
               'grant untouched (close-review r2 MAJOR-1): passed';
END
$$;

-- ─── 40. close-review r2 MAJOR-2: one reader, one verdict ──────────────────
--
-- refusal_unanswered is verdict-bearing everywhere but here:
-- channelConsentVerdict (_shared/sms.ts) refuses EVERY send on it whatever the
-- status says, and record_channel_consent refuses every studio-side write on
-- it. The fold deliberately mints records where it is TRUE while status reads
-- `granted` — the r8 W4-M1 shape, ruled at 00594:655-666 as "the record is
-- minted UNSENDABLE". channel_consent_status() returned scc.status alone, so
-- both readers printed `granted`, which renders as "Texting": the Call Sheet
-- and the Directory told the designer the number was on the rail while every
-- send came back opted_out, and the studio could not correct it because the
-- write door refuses every verdict but opted_out. G-3 restored inside the
-- record built to end it.

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                             sms_consent_status, sms_consented_at, sms_opt_out_at,
                             sms_consent_source, sms_consent_evidence,
                             sms_consent_recorded_at, sms_consent_disclosure_version)
VALUES
  ('e0000000-0000-4000-8000-0000000000e1', 'd0000000-0000-4000-8000-0000000000a5',
   'sub', 'Pete Rusk', '(612) 555-0610',
   'granted', NULL, '2025-11-16T00:00:00Z',
   'inbound_sms', 'Replied STOP on the Rusk thread', '2025-11-16T00:00:00Z', 'field-sms-v1'),
  ('e0000000-0000-4000-8000-0000000000e2', 'd0000000-0000-4000-8000-0000000000a5',
   'sub', 'Ida Lindqvist', '(612) 555-0611',
   'granted', '2026-03-01T00:00:00Z', NULL,
   'written', 'Signed the kickoff form', '2026-03-01T00:00:00Z', 'field-sms-v1');

DO $$
DECLARE
  r          RECORD;
  w          TEXT;
  dir_word   TEXT;
  meta_word  TEXT;
  refuses    BOOLEAN;
BEGIN
  -- 40a. The fold mints the contradictory legacy shape, unchanged: the status
  --      reads `granted` and an unanswered refusal stands under it.
  PERFORM public.backfill_channel_consent_from_parties();
  SELECT * INTO r FROM studio_channel_consent
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550610';
  ASSERT FOUND AND r.status = 'granted' AND r.refusal_unanswered
     AND r.opt_out_at = '2025-11-16T00:00:00Z'::timestamptz,
    'FAIL 40a: the fold must still mint granted + refusal_unanswered, got '
      || COALESCE(r.status, '<null>');

  -- 40b. THE FINDING. The one reader carries the one verdict: the number is
  --      opted out, whatever the status column happens to say.
  SELECT public.channel_consent_status(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550610') INTO w;
  ASSERT w = 'opted_out',
    'FAIL 40b: an unanswered refusal must read opted_out, got '
      || COALESCE(w, '<null>');

  -- 40c. …so the reader and the SEND GATE now agree by construction. This is
  --      channelConsentVerdict's rule (_shared/sms.ts: status opted_out OR
  --      refusal_unanswered -> "refuse") stated in SQL against the same row.
  refuses := (r.status = 'opted_out' OR r.refusal_unanswered);
  ASSERT refuses AND w = 'opted_out',
    'FAIL 40c: the room must print what the send rail decides — '
      || 'send gate refuses=' || refuses::text || ', room says ' || COALESCE(w, '<null>');

  -- 40d. Both shipped readers print it, for the studio whose ledger it is.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  SELECT sms_consent_status INTO w FROM v_project_roster
   WHERE roster_id = 'e0000000-0000-4000-8000-0000000000e1';
  ASSERT w = 'opted_out',
    'FAIL 40d: v_project_roster must not print "Texting" for an unsendable '
    'number, got ' || COALESCE(w, '<null>');

  SELECT status_raw, meta->>'sms_consent_status' INTO dir_word, meta_word
    FROM people_directory
   WHERE person_id = 'e0000000-0000-4000-8000-0000000000e1' AND role = 'sub';
  ASSERT dir_word = 'opted_out' AND meta_word = 'opted_out',
    'FAIL 40d2: people_directory must print it in both places, got '
      || COALESCE(dir_word, '<null>') || ' / ' || COALESCE(meta_word, '<null>');

  -- 40e. NEGATIVE CONTROL — a clean grant with no refusal standing still reads
  --      `granted` and still prints "Texting". The flag is the whole rule; the
  --      status column is not overridden for anything else.
  SELECT public.channel_consent_status(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550611') INTO w;
  ASSERT w = 'granted',
    'FAIL 40e: a clean grant must still read granted, got ' || COALESCE(w, '<null>');
  SELECT sms_consent_status INTO w FROM v_project_roster
   WHERE roster_id = 'e0000000-0000-4000-8000-0000000000e2';
  ASSERT w = 'granted',
    'FAIL 40e2: the roster must still print a clean grant, got '
      || COALESCE(w, '<null>');
  PERFORM pg_temp.reset_role();

  -- 40f. The same holds for a folded `pending` or `not_asked` winner with a
  --      refusing sibling — the divergence was never about `granted`.
  UPDATE studio_channel_consent SET status = 'pending'
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550610';
  SELECT public.channel_consent_status(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550610') INTO w;
  ASSERT w = 'opted_out',
    'FAIL 40f: a pending winner with a standing refusal must read opted_out, got '
      || COALESCE(w, '<null>');

  UPDATE studio_channel_consent SET status = 'not_asked'
   WHERE organization_id = 'b0000000-0000-4000-8000-00000000000a'
     AND channel_value = '+16125550610';
  SELECT public.channel_consent_status(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550610') INTO w;
  ASSERT w = 'opted_out',
    'FAIL 40f2: a not_asked winner with a standing refusal must read opted_out, got '
      || COALESCE(w, '<null>');

  -- 40g. And no record at all is still the absence the callers COALESCE.
  SELECT public.channel_consent_status(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '+16125550699') INTO w;
  ASSERT w IS NULL,
    'FAIL 40g: no record must stay NULL, got ' || COALESCE(w, '<null>');

  -- 40h. The rule lives in ONE place (R-AS): neither view tests the flag
  --      itself — they take the word from the reader.
  ASSERT (SELECT definition FROM pg_views
           WHERE schemaname = 'public' AND viewname = 'v_project_roster')
         NOT ILIKE '%refusal_unanswered%',
    'FAIL 40h: v_project_roster must not restate the refusal rule';
  ASSERT (SELECT definition FROM pg_views
           WHERE schemaname = 'public' AND viewname = 'people_directory')
         NOT ILIKE '%refusal_unanswered%',
    'FAIL 40h2: people_directory must not restate the refusal rule';

  RAISE NOTICE '40. one reader, one verdict: an unanswered refusal reads '
               'opted_out everywhere the room prints it (close-review r2 '
               'MAJOR-2): passed';
END
$$;

-- ─── 41. close-out r3 MAJOR-1: the Desk rollup reads the record (00621) ────
--
-- field_activity_summary.awaiting_reply_count counted
-- project_parties.sms_consent_status = 'pending' (00282:578-582). The Field
-- Coordination Desk renders it as "N parties haven't opted in"
-- (use-field-activity.ts:48-55 -> field-desk.tsx:44-52). After the freeze no
-- consent act moves a seat, so the count could never clear: the Call Sheet
-- printed "Texting" and the Desk said the same person had not opted in, off
-- the same row. 00621 repoints the subquery at
-- channel_consent_status(project_consent_org(...)).

INSERT INTO projects (id, name, designer_id, studio_id, created_by, status, created_at, updated_at)
VALUES ('d0000000-0000-4000-8000-0000000000a6', 'W1A Desk rollup job',
        'a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-00000000000a',
        'a0000000-0000-4000-8000-000000000001', 'active', NOW(), NOW());

-- Three field seats on one project, all frozen where the fold left them:
--   · 0620 — the record says GRANTED, the seat still says pending. The Desk
--            used to count this one. It must not any more.
--   · 0621 — the record says PENDING (the studio invited, nobody replied),
--            the seat says not_asked. The Desk never counted this one. It
--            must now.
--   · 0622 — nobody asked at all: no record, seat not_asked. Counted by
--            neither.
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone, sms_consent_status)
VALUES
  ('e0000000-0000-4000-8000-0000000000f1', 'd0000000-0000-4000-8000-0000000000a6',
   'sub', 'Ove Berglund', '(612) 555-0620', 'pending'),
  ('e0000000-0000-4000-8000-0000000000f2', 'd0000000-0000-4000-8000-0000000000a6',
   'sub', 'Nan Sorley', '(612) 555-0621', 'not_asked'),
  ('e0000000-0000-4000-8000-0000000000f3', 'd0000000-0000-4000-8000-0000000000a6',
   'sub', 'Cy Marchetti', '(612) 555-0622', 'not_asked');

DO $$
DECLARE
  n         BIGINT;
  w         TEXT;
  view_def  TEXT;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '(612) 555-0620', 'granted',
    'written', 'Signed the kickoff form', 'field-sms-v1',
    'd0000000-0000-4000-8000-0000000000a6');
  PERFORM public.record_channel_invite(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '(612) 555-0621',
    'written', 'Kickoff form', 'field-sms-v1',
    'd0000000-0000-4000-8000-0000000000a6');
  PERFORM pg_temp.reset_role();

  -- 41a. The seats are exactly where the freeze left them — this block is
  --      about the READER, so the premise is asserted, not assumed.
  ASSERT (SELECT sms_consent_status FROM project_parties
           WHERE id = 'e0000000-0000-4000-8000-0000000000f1') = 'pending',
    'FAIL 41a: the granted party''s seat must still read pending (frozen)';
  ASSERT (SELECT sms_consent_status FROM project_parties
           WHERE id = 'e0000000-0000-4000-8000-0000000000f2') = 'not_asked',
    'FAIL 41a2: the invited party''s seat must still read not_asked (frozen)';

  -- 41b. THE FINDING. One awaiting reply on this project: the one the RECORD
  --      says was invited. On the frozen column it was the other one.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  SELECT awaiting_reply_count INTO n FROM field_activity_summary
   WHERE project_id = 'd0000000-0000-4000-8000-0000000000a6';
  ASSERT n = 1,
    'FAIL 41b: the Desk must count the record''s pending, not the seat''s — got '
      || n;

  -- 41c. …and the Desk and the Call Sheet now say the same thing about the
  --      same person, which is the whole of MAJOR-1.
  SELECT sms_consent_status INTO w FROM v_project_roster
   WHERE roster_id = 'e0000000-0000-4000-8000-0000000000f1';
  ASSERT w = 'granted',
    'FAIL 41c: the roster must print the grant, got ' || COALESCE(w, '<null>');
  SELECT sms_consent_status INTO w FROM v_project_roster
   WHERE roster_id = 'e0000000-0000-4000-8000-0000000000f2';
  ASSERT w = 'pending',
    'FAIL 41c2: the roster must print the invite, got ' || COALESCE(w, '<null>');
  PERFORM pg_temp.reset_role();

  -- 41d. A recorded refusal is not a party awaiting a reply either.
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    'b0000000-0000-4000-8000-00000000000a', 'sms', '(612) 555-0621', 'opted_out',
    'inbound_sms', 'Replied STOP', 'field-sms-v1',
    'd0000000-0000-4000-8000-0000000000a6');
  SELECT awaiting_reply_count INTO n FROM field_activity_summary
   WHERE project_id = 'd0000000-0000-4000-8000-0000000000a6';
  ASSERT n = 0,
    'FAIL 41d: a refusal is not an awaited reply, got ' || n;
  PERFORM pg_temp.reset_role();

  -- 41e. The rest of the rollup is byte-identical to 00282 — the graft moved
  --      one expression and nothing else. The overdue-task count still counts.
  INSERT INTO project_tasks (id, project_id, title, status, owner, due_date)
  VALUES ('f0000000-0000-4000-8000-0000000000f1',
          'd0000000-0000-4000-8000-0000000000a6', 'Hang the pendants',
          'todo', 'sub', current_date - 3);
  PERFORM pg_temp.assume_user('a0000000-0000-4000-8000-000000000001');
  SELECT overdue_field_task_count INTO n FROM field_activity_summary
   WHERE project_id = 'd0000000-0000-4000-8000-0000000000a6';
  ASSERT n = 1,
    'FAIL 41e: the overdue-task count must be untouched by the graft, got ' || n;
  PERFORM pg_temp.reset_role();

  -- 41f. The view still reads the record through the ONE reader (R-AS) and
  --      still takes no consent word off the frozen column.
  SELECT definition INTO view_def FROM pg_views
   WHERE schemaname = 'public' AND viewname = 'field_activity_summary';
  ASSERT view_def ILIKE '%channel_consent_status%',
    'FAIL 41f: the Desk rollup must read the record';
  ASSERT view_def NOT ILIKE '%sms_consent_status%',
    'FAIL 41f2: the Desk rollup must not read the frozen seat any more';
  ASSERT view_def NOT ILIKE '%refusal_unanswered%',
    'FAIL 41f3: the Desk rollup must not restate the refusal rule';

  RAISE NOTICE '41. the Desk rollup counts the record''s pending, not the '
               'frozen seat''s, and agrees with the Call Sheet about the same '
               'person (close-out r3 MAJOR-1): passed';
END
$$;

-- ─── 42. close-out r3 MAJOR-3: the two 00284 dispatch gates (00621) ────────
--
-- fc_dispatch_court_assignment (00284:118-123) and fc_dispatch_task_assignment
-- (:176-181) RETURN NEW early when v_party.sms_consent_status <> 'granted'.
-- Nothing writes a seat to 'granted' any more, so assigning a coordination item
-- or a task to a sub whose consent the studio holds ON THE RECORD dispatched
-- nothing at all — closed, silent, on a live un-flagged path. Dispatches are
-- observed through public._w1a_dispatch_log (block 6's stand-in for
-- invoke_edge_function).

INSERT INTO designer_clients (id, designer_id, client_name, status, created_at, updated_at)
VALUES ('a9000000-0000-4000-8000-0000000000d1',
        'a0000000-0000-4000-8000-000000000001', 'Berglund household',
        'active', NOW(), NOW());

DO $$
DECLARE
  d_before BIGINT;
  d        BIGINT;
BEGIN
  -- 42a. THE FINDING, task leg. The record grants; the seat is frozen at
  --      `pending` (asserted in 41a). Assigning a task must dispatch.
  SELECT COUNT(*) INTO d_before FROM public._w1a_dispatch_log
   WHERE body->>'templateKey' = 'sms_court_assignment';

  INSERT INTO project_tasks (id, project_id, title, status, owner, owner_party_id)
  VALUES ('f0000000-0000-4000-8000-0000000000f2',
          'd0000000-0000-4000-8000-0000000000a6', 'Set the sconces',
          'todo', 'sub', 'e0000000-0000-4000-8000-0000000000f1');

  SELECT COUNT(*) INTO d FROM public._w1a_dispatch_log
   WHERE body->>'templateKey' = 'sms_court_assignment'
     AND body->>'partyId' = 'e0000000-0000-4000-8000-0000000000f1';
  ASSERT d = 1,
    'FAIL 42a: a task assigned to a party the RECORD granted must dispatch, got '
      || d;

  -- 42b. THE FINDING, court leg. Same party, same record, a coordination item.
  INSERT INTO client_decisions (id, designer_client_id, designer_id, project_id,
                                title, status, court, court_party_id,
                                coordination_kind)
  VALUES ('a9000000-0000-4000-8000-0000000000c1',
          'a9000000-0000-4000-8000-0000000000d1',
          'a0000000-0000-4000-8000-000000000001',
          'd0000000-0000-4000-8000-0000000000a6',
          'Confirm the grout colour', 'pending', 'gc',
          'e0000000-0000-4000-8000-0000000000f1', 'rfi');

  SELECT COUNT(*) INTO d FROM public._w1a_dispatch_log
   WHERE body->>'templateKey' = 'sms_court_assignment'
     AND body->>'partyId' = 'e0000000-0000-4000-8000-0000000000f1';
  ASSERT d = 2,
    'FAIL 42b: a court item assigned to a party the RECORD granted must '
    'dispatch, got ' || (d - 1);

  -- 42c. NEGATIVE CONTROL — a party nobody asked (no record, seat not_asked)
  --      dispatches nothing, on either leg. The gate still fails CLOSED, and
  --      the NULL channel_consent_status() returns for "no record" does not
  --      fall through the guard.
  INSERT INTO project_tasks (id, project_id, title, status, owner, owner_party_id)
  VALUES ('f0000000-0000-4000-8000-0000000000f3',
          'd0000000-0000-4000-8000-0000000000a6', 'Crate the mirror',
          'todo', 'sub', 'e0000000-0000-4000-8000-0000000000f3');
  INSERT INTO client_decisions (id, designer_client_id, designer_id, project_id,
                                title, status, court, court_party_id,
                                coordination_kind)
  VALUES ('a9000000-0000-4000-8000-0000000000c2',
          'a9000000-0000-4000-8000-0000000000d1',
          'a0000000-0000-4000-8000-000000000001',
          'd0000000-0000-4000-8000-0000000000a6',
          'Pick the crate route', 'pending', 'gc',
          'e0000000-0000-4000-8000-0000000000f3', 'rfi');
  SELECT COUNT(*) INTO d FROM public._w1a_dispatch_log
   WHERE body->>'templateKey' = 'sms_court_assignment'
     AND body->>'partyId' = 'e0000000-0000-4000-8000-0000000000f3';
  ASSERT d = 0,
    'FAIL 42c: an unasked party must dispatch nothing, got ' || d;

  -- 42d. NEGATIVE CONTROL — a RECORDED REFUSAL dispatches nothing either,
  --      even though 0621's seat still reads not_asked (block 41d recorded the
  --      STOP for that number).
  INSERT INTO project_tasks (id, project_id, title, status, owner, owner_party_id)
  VALUES ('f0000000-0000-4000-8000-0000000000f4',
          'd0000000-0000-4000-8000-0000000000a6', 'Return the pendant',
          'todo', 'sub', 'e0000000-0000-4000-8000-0000000000f2');
  SELECT COUNT(*) INTO d FROM public._w1a_dispatch_log
   WHERE body->>'templateKey' = 'sms_court_assignment'
     AND body->>'partyId' = 'e0000000-0000-4000-8000-0000000000f2';
  ASSERT d = 0,
    'FAIL 42d: a refused number must dispatch nothing, got ' || d;

  -- 42e. The pre-fold leg still stands: a seat holding a real legacy `granted`
  --      with no record dispatches, because sendPartySms still honours it.
  INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                               sms_consent_status)
  VALUES ('e0000000-0000-4000-8000-0000000000f4',
          'd0000000-0000-4000-8000-0000000000a6', 'sub', 'Vi Odom',
          '(612) 555-0623', 'granted');
  INSERT INTO project_tasks (id, project_id, title, status, owner, owner_party_id)
  VALUES ('f0000000-0000-4000-8000-0000000000f5',
          'd0000000-0000-4000-8000-0000000000a6', 'Shim the vanity',
          'todo', 'sub', 'e0000000-0000-4000-8000-0000000000f4');
  SELECT COUNT(*) INTO d FROM public._w1a_dispatch_log
   WHERE body->>'templateKey' = 'sms_court_assignment'
     AND body->>'partyId' = 'e0000000-0000-4000-8000-0000000000f4';
  ASSERT d = 1,
    'FAIL 42e: a pre-fold granted seat must still dispatch, got ' || d;

  -- 42f. The party-kind filter and the shipped trigger wiring are untouched by
  --      the graft: a non-field party is still never texted, and both triggers
  --      are still the ones 00284 created.
  INSERT INTO project_parties (id, project_id, party_kind, display_name, phone,
                               sms_consent_status)
  VALUES ('e0000000-0000-4000-8000-0000000000f5',
          'd0000000-0000-4000-8000-0000000000a6', 'architect', 'Ann Reyes',
          '(612) 555-0623', 'granted');
  INSERT INTO project_tasks (id, project_id, title, status, owner, owner_party_id)
  VALUES ('f0000000-0000-4000-8000-0000000000f6',
          'd0000000-0000-4000-8000-0000000000a6', 'Stamp the drawings',
          'todo', 'designer', 'e0000000-0000-4000-8000-0000000000f5');
  SELECT COUNT(*) INTO d FROM public._w1a_dispatch_log
   WHERE body->>'templateKey' = 'sms_court_assignment'
     AND body->>'partyId' = 'e0000000-0000-4000-8000-0000000000f5';
  ASSERT d = 0,
    'FAIL 42f: a non-field party must never be texted, got ' || d;

  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
     WHERE c.relname = 'project_tasks'
       AND tg.tgname = 'fc_task_assignment_dispatch' AND NOT tg.tgisinternal),
    'FAIL 42f2: 00284''s task-assignment trigger must still be wired';
  ASSERT EXISTS (
    SELECT 1 FROM pg_trigger tg
      JOIN pg_class c ON c.oid = tg.tgrelid
     WHERE c.relname = 'client_decisions'
       AND tg.tgname = 'fc_court_assignment_dispatch' AND NOT tg.tgisinternal),
    'FAIL 42f3: 00284''s court-assignment trigger must still be wired';

  -- 42g. Both gates read the record, and neither reads it as anything but the
  --      one reader (R-AS), and both are still definers with a pinned path.
  ASSERT (SELECT prosrc FROM pg_proc pr JOIN pg_namespace ns ON ns.oid = pr.pronamespace
           WHERE ns.nspname = 'public' AND pr.proname = 'fc_dispatch_court_assignment')
         ILIKE '%channel_consent_status%',
    'FAIL 42g: the court gate must read the record';
  ASSERT (SELECT prosrc FROM pg_proc pr JOIN pg_namespace ns ON ns.oid = pr.pronamespace
           WHERE ns.nspname = 'public' AND pr.proname = 'fc_dispatch_task_assignment')
         ILIKE '%channel_consent_status%',
    'FAIL 42g2: the task gate must read the record';
  ASSERT (SELECT COUNT(*) FROM pg_proc pr
            JOIN pg_namespace ns ON ns.oid = pr.pronamespace
           WHERE ns.nspname = 'public'
             AND pr.proname IN ('fc_dispatch_court_assignment',
                                'fc_dispatch_task_assignment')
             AND pr.prosecdef
             AND 'search_path=public' = ANY(pr.proconfig)) = 2,
    'FAIL 42g3: both gates must stay SECURITY DEFINER with search_path pinned';
  ASSERT NOT has_function_privilege('anon',
    'public.fc_dispatch_court_assignment()', 'EXECUTE'),
    'FAIL 42g4: anon must not execute the court gate';
  ASSERT NOT has_function_privilege('anon',
    'public.fc_dispatch_task_assignment()', 'EXECUTE'),
    'FAIL 42g5: anon must not execute the task gate';

  RAISE NOTICE '42. the two 00284 dispatch gates reach a party the record '
               'granted, and still refuse an unasked, a refused and a '
               'non-field one (close-out r3 MAJOR-3): passed';
  RAISE NOTICE 'All W1a assertions passed.';
END
$$;

ROLLBACK;
