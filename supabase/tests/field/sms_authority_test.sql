-- ═══════════════════════════════════════════════════════════════════════════
-- Field Line authority: suppression, ref codes, prompt binding (00639)
--
-- Three authorities, measured where they actually bite:
--
--   A. SUPPRESSION BEATS THE RECORD (contract S2). studio_channel_consent stays
--      the only grant; suppression is a layer in front of it, wired in two
--      places — a read fold in channel_consent_status() and a write stamp on
--      the record itself. The case that matters is the residue one: a studio
--      that records a FRESH invite after a STOP must not be able to text that
--      number. Both halves are asserted, including the raw refusal_unanswered
--      column, because _shared/sms.ts channelConsentVerdict reads the table
--      directly (:411-448) and refuses on that flag before it reads status.
--      Suppression is phone-global: it survives adding a new party on a new
--      project, and holds with no party rows at all. A13 adds contract revision
--      5's rule: the stamp normalizes BOTH sides, because studio_channel_consent
--      stores whatever its writer passed and '15556665555' is the same handset
--      as '+15556665555'.
--
--   B. REF CODES (contract S1). `Ref NN` is 2 digits 10–99, unique per
--      (sender, recipient) across open prompts and prompts closed inside 90
--      days, 3 digits once exhausted. The 90-day window is materialized as
--      code_reserved because now() cannot live in an index predicate. The
--      allocator serializes on an advisory lock; the partial unique index is
--      the backstop a racing writer hits. B7 covers contract revision 5's
--      sms_create_prompt(): allocation, the tombstone read and the INSERT in one
--      transaction under one lock, and a cross-tenant prompt still unwritable.
--
--   C. THE PROMPT BINDING IS IMMUTABLE (contract S1) and cross-tenant prompts
--      are unwritable (the composite party/project foreign key). A late reply
--      resolves the ORIGINAL prompt or nothing — an answered or expired prompt
--      never comes back from the resolver, so a stale ref cannot be retargeted
--      at whatever that number means today.
--
--   D. sms_messages attribution is final once set.
--
-- How to run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 -f supabase/tests/field/sms_authority_test.sql
--
-- Transaction-wrapped + ROLLBACK, in the style of field_links_test.sql. The
-- allocator and suppression helpers are service-role only, so they run as
-- postgres; the consent reads run as the DESIGNER through assume_user_role,
-- which is the room's real path (channel_consent_status is SECURITY INVOKER on
-- purpose and reaches suppression through a DEFINER helper).
--
-- NOT ASSERTED HERE, deliberately: a genuine two-session race. A psql script is
-- one session, so the concurrency claim is measured as its two mechanisms —
-- the advisory lock is observed in pg_locks after allocation (case B4) and after
-- sms_create_prompt's insert (case B7a), and the partial unique index is
-- observed refusing the duplicate a loser would write (case B2). A cross-session
-- test belongs to the harness (P0-11), not here.
--
-- Transaction-wrapped, and nested on a SAVEPOINT so the file can be piped
-- STRAIGHT AFTER the migration inside one outer transaction (the ticket verify
-- line does exactly that): the savepoint rolls back this file's fixtures and
-- leaves the schema under test standing for the next file. Run on its own, the
-- BEGIN opens the transaction and closing the connection discards it, so
-- nothing is ever committed either way.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;
SAVEPOINT sms_authority_test;

SET LOCAL statement_timeout = '120s';

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('5a000000-0000-4000-8000-000000000001', 'sa-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('5a000000-0000-4000-8000-000000000002', 'sa-other@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('5a000000-0000-4000-8000-000000000001', 'sa-designer@test.invalid', 'SA Designer', NOW(), NOW()),
  ('5a000000-0000-4000-8000-000000000002', 'sa-other@test.invalid',    'SA Other',    NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Two studios sharing one sender number — the Field Line's whole premise.
INSERT INTO organizations (id, type, name, slug, status)
VALUES
  ('5a000000-0000-4000-8000-0000000000d1', 'design_studio', 'SA Studio One', 'sa-studio-one', 'active'),
  ('5a000000-0000-4000-8000-0000000000d2', 'design_studio', 'SA Studio Two', 'sa-studio-two', 'active');

INSERT INTO organization_members (user_id, organization_id, role, status)
VALUES
  ('5a000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-0000000000d1', 'owner', 'active'),
  ('5a000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-0000000000d2', 'owner', 'active');

INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES
  ('5a000000-0000-4000-8000-0000000000a1', 'SA Project One',   '5a000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-0000000000d1'),
  ('5a000000-0000-4000-8000-0000000000a2', 'SA Project Two',   '5a000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-0000000000d1'),
  ('5a000000-0000-4000-8000-0000000000a3', 'SA Other Studio',  '5a000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-000000000002', '5a000000-0000-4000-8000-0000000000d2');

-- One drywaller, one handset. b1 on project one; b3 belongs to the OTHER studio
-- (used for the cross-tenant write case).
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone)
VALUES
  ('5a000000-0000-4000-8000-0000000000b1', '5a000000-0000-4000-8000-0000000000a1', 'sub', 'SA Drywaller', '5557770000'),
  ('5a000000-0000-4000-8000-0000000000b3', '5a000000-0000-4000-8000-0000000000a3', 'sub', 'SA Other Sub', '5557770000');

-- ─── helpers ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.assume_user_role(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user_role(UUID) TO PUBLIC;

CREATE OR REPLACE FUNCTION pg_temp.reset_role()
RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- A · Suppression beats the record (contract S2)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_status   TEXT;
  v_raw      TEXT;
  v_flag     BOOLEAN;
  v_raised   BOOLEAN;
BEGIN
  -- A1. The studio invites the number. Nothing is suppressed yet.
  PERFORM pg_temp.assume_user_role('5a000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    '5a000000-0000-4000-8000-0000000000d1', 'sms', '+15557770000', 'pending',
    'web_form', 'Ticked "text me updates" on the kickoff form', 'v1',
    '5a000000-0000-4000-8000-0000000000a1');
  v_status := public.channel_consent_status('5a000000-0000-4000-8000-0000000000d1', 'sms', '+15557770000');
  ASSERT v_status = 'pending',
    'FAIL A1: a fresh invite should read pending, got ' || COALESCE(v_status, '<null>');
  PERFORM pg_temp.reset_role();

  -- A2. STOP arrives on the rail. The suppression row is the whole of it — no
  -- party row, no project, no studio is named.
  INSERT INTO public.sms_suppressions (sender_number, recipient_phone, reason)
  VALUES ('+15550000000', '+15557770000', 'stop');
  ASSERT public.sms_is_suppressed('+15550000000', '+15557770000'),
    'FAIL A2a: the pair must read suppressed after STOP';
  ASSERT public.sms_phone_suppressed('+15557770000'),
    'FAIL A2b: the handset must read suppressed for any sender';
  -- Formatting must not be able to miss it: both endpoints normalize on the
  -- same rule studio_channel_consent uses.
  ASSERT public.sms_is_suppressed('5550000000', '(555) 777-0000'),
    'FAIL A2c: suppression lookup must normalize both endpoints';

  -- A3. The room says opted_out through the read fold — AND the record that
  -- already existed when the STOP arrived says so itself (SQ-24 F2). The send
  -- gate reads the record directly (_shared/sms.ts channelConsentVerdict
  -- :408-436) and never asks a suppression helper, so a fold the record does not
  -- carry is a gate that still says allow. This is not a parallel ledger: it is
  -- the one record being told the truth by the layer that outranks it.
  PERFORM pg_temp.assume_user_role('5a000000-0000-4000-8000-000000000001');
  v_status := public.channel_consent_status('5a000000-0000-4000-8000-0000000000d1', 'sms', '+15557770000');
  ASSERT v_status = 'opted_out',
    'FAIL A3a: a suppressed number must read opted_out whatever the record says, got ' || COALESCE(v_status, '<null>');
  SELECT status INTO v_raw FROM public.studio_channel_consent
   WHERE organization_id = '5a000000-0000-4000-8000-0000000000d1'
     AND channel_kind = 'sms' AND channel_value = '+15557770000';
  ASSERT v_raw = 'opted_out',
    'FAIL A3b: an arriving suppression must stamp the record that already existed, got ' || COALESCE(v_raw, '<null>');
  SELECT refusal_unanswered INTO v_flag FROM public.studio_channel_consent
   WHERE organization_id = '5a000000-0000-4000-8000-0000000000d1'
     AND channel_kind = 'sms' AND channel_value = '+15557770000';
  ASSERT v_flag,
    'FAIL A3c: the stamped record must carry refusal_unanswered — that is the column the send gate refuses on';
  PERFORM pg_temp.reset_role();

  -- A4. THE RESIDUE CASE, on the studio that already held a record. Once the
  -- STOP has stamped that record (A3), record_channel_consent's own
  -- standing-refusal gate (00622) refuses a fresh invite over it outright: the
  -- ON CONFLICT WHERE finds a refusal that stands, writes nothing, and raises
  -- channel_opted_out — "only they can rejoin, by replying START". The studio's
  -- own book is not lost (record_channel_reconsent puts a fresh consent on the
  -- record while the refusal keeps standing); what it cannot do is mint a
  -- sendable record over a STOP. A5 is the other half: a studio that held NO
  -- record may still write its first one, and that one is born unsendable.
  v_raised := false;
  BEGIN
    PERFORM pg_temp.assume_user_role('5a000000-0000-4000-8000-000000000001');
    PERFORM public.record_channel_consent(
      '5a000000-0000-4000-8000-0000000000d1', 'sms', '+15557770000', 'pending',
      'verbal', 'Asked him again on site', 'v1',
      '5a000000-0000-4000-8000-0000000000a1');
  EXCEPTION WHEN OTHERS THEN
    v_raised := (SQLERRM = 'channel_opted_out');
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_raised,
    'FAIL A4a: recording a fresh invite over a stamped STOP must be refused with channel_opted_out';
  SELECT refusal_unanswered INTO v_flag FROM public.studio_channel_consent
   WHERE organization_id = '5a000000-0000-4000-8000-0000000000d1'
     AND channel_kind = 'sms' AND channel_value = '+15557770000';
  ASSERT v_flag,
    'FAIL A4b: the record must still carry refusal_unanswered (the send gate reads this column directly)';
  PERFORM pg_temp.assume_user_role('5a000000-0000-4000-8000-000000000001');
  v_status := public.channel_consent_status('5a000000-0000-4000-8000-0000000000d1', 'sms', '+15557770000');
  ASSERT v_status = 'opted_out',
    'FAIL A4c: the number must still read opted_out, got ' || COALESCE(v_status, '<null>');
  PERFORM pg_temp.reset_role();

  -- A5. A DIFFERENT studio on the same sender number cannot text it either:
  -- STOP is phone-global (carrier semantics), not per-studio.
  PERFORM pg_temp.assume_user_role('5a000000-0000-4000-8000-000000000002');
  PERFORM public.record_channel_consent(
    '5a000000-0000-4000-8000-0000000000d2', 'sms', '+15557770000', 'pending',
    'web_form', 'Second studio ticked text updates', 'v1',
    '5a000000-0000-4000-8000-0000000000a3');
  v_status := public.channel_consent_status('5a000000-0000-4000-8000-0000000000d2', 'sms', '+15557770000');
  ASSERT v_status = 'opted_out',
    'FAIL A5a: a second studio''s fresh record on a suppressed handset must read opted_out, got ' || COALESCE(v_status, '<null>');
  SELECT refusal_unanswered INTO v_flag FROM public.studio_channel_consent
   WHERE organization_id = '5a000000-0000-4000-8000-0000000000d2'
     AND channel_kind = 'sms' AND channel_value = '+15557770000';
  ASSERT v_flag, 'FAIL A5b: the second studio''s record must carry refusal_unanswered too';
  PERFORM pg_temp.reset_role();

  -- A6. Suppression survives adding a NEW party on a NEW project, and holds
  -- with no party rows at all: it is keyed on the handset, not on a seat.
  INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone)
  VALUES ('5a000000-0000-4000-8000-0000000000b2', '5a000000-0000-4000-8000-0000000000a2',
          'sub', 'SA Drywaller (new job)', '5557770000');
  ASSERT public.sms_is_suppressed('+15550000000', '+15557770000'),
    'FAIL A6a: adding a new party on a new project must not lift a suppression';
  PERFORM pg_temp.assume_user_role('5a000000-0000-4000-8000-000000000001');
  v_status := public.channel_consent_status('5a000000-0000-4000-8000-0000000000d1', 'sms', '+15557770000');
  ASSERT v_status = 'opted_out',
    'FAIL A6b: the new job must read opted_out too, got ' || COALESCE(v_status, '<null>');
  PERFORM pg_temp.reset_role();

  DELETE FROM public.project_parties
   WHERE id IN ('5a000000-0000-4000-8000-0000000000b2');
  ASSERT public.sms_is_suppressed('+15550000000', '+15557770000'),
    'FAIL A6c: suppression must hold with the party rows gone';

  -- A7. A handset that never had a seat at all is still suppressible.
  INSERT INTO public.sms_suppressions (sender_number, recipient_phone, reason)
  VALUES ('+15550000000', '+15556660000', 'stop');
  ASSERT public.sms_is_suppressed('+15550000000', '+15556660000'),
    'FAIL A7: a suppression needs no party row anywhere';

  -- A8. Email is untouched: the fold is the sms channel's.
  PERFORM pg_temp.assume_user_role('5a000000-0000-4000-8000-000000000001');
  PERFORM public.record_channel_consent(
    '5a000000-0000-4000-8000-0000000000d1', 'email', 'sa-sub@test.invalid', 'granted',
    'written', 'Signed the kickoff packet', 'v1',
    '5a000000-0000-4000-8000-0000000000a1');
  v_status := public.channel_consent_status('5a000000-0000-4000-8000-0000000000d1', 'email', 'sa-sub@test.invalid');
  ASSERT v_status = 'granted',
    'FAIL A8: an email record must be unaffected by an sms suppression, got ' || COALESCE(v_status, '<null>');
  PERFORM pg_temp.reset_role();

  -- A9. START lifts the suppression and RE-ASKS; it never grants. The record's
  -- own standing refusal is still unanswered, so the number stays opted_out
  -- until the recipient's answer is written by the inbound rail.
  UPDATE public.sms_suppressions SET lifted_at = now()
   WHERE sender_number = '+15550000000' AND recipient_phone = '+15557770000';
  ASSERT NOT public.sms_is_suppressed('+15550000000', '+15557770000'),
    'FAIL A9a: START must lift the suppression';
  PERFORM pg_temp.assume_user_role('5a000000-0000-4000-8000-000000000001');
  v_status := public.channel_consent_status('5a000000-0000-4000-8000-0000000000d1', 'sms', '+15557770000');
  ASSERT v_status = 'opted_out',
    'FAIL A9b: lifting the suppression must not by itself grant — the record''s refusal is still unanswered, got ' || COALESCE(v_status, '<null>');
  PERFORM pg_temp.reset_role();

  -- The inbound rail's own write answers the refusal (pipeline.ts
  -- writeChannelConsent upserts as service_role). Once lifted, the stamp does
  -- not fire again, so the flag really can come down.
  UPDATE public.studio_channel_consent
     SET refusal_unanswered = false, status = 'granted', consented_at = now()
   WHERE organization_id = '5a000000-0000-4000-8000-0000000000d1'
     AND channel_kind = 'sms' AND channel_value = '+15557770000';
  SELECT refusal_unanswered INTO v_flag FROM public.studio_channel_consent
   WHERE organization_id = '5a000000-0000-4000-8000-0000000000d1'
     AND channel_kind = 'sms' AND channel_value = '+15557770000';
  ASSERT NOT v_flag,
    'FAIL A9c: with the suppression lifted, the rail must be able to lower the flag again';
  PERFORM pg_temp.assume_user_role('5a000000-0000-4000-8000-000000000001');
  v_status := public.channel_consent_status('5a000000-0000-4000-8000-0000000000d1', 'sms', '+15557770000');
  ASSERT v_status = 'granted',
    'FAIL A9d: after START and the recipient''s answer the number reads granted again, got ' || COALESCE(v_status, '<null>');
  PERFORM pg_temp.reset_role();

  -- A10. Re-suppression re-closes it, over the granted record.
  UPDATE public.sms_suppressions SET lifted_at = NULL
   WHERE sender_number = '+15550000000' AND recipient_phone = '+15557770000';
  PERFORM pg_temp.assume_user_role('5a000000-0000-4000-8000-000000000001');
  v_status := public.channel_consent_status('5a000000-0000-4000-8000-0000000000d1', 'sms', '+15557770000');
  ASSERT v_status = 'opted_out',
    'FAIL A10: a second STOP must close a granted record again, got ' || COALESCE(v_status, '<null>');
  PERFORM pg_temp.reset_role();

  -- A11. sms_suppressions is service-role only at the PRIVILEGE level (S12).
  v_raised := false;
  BEGIN
    PERFORM pg_temp.assume_user_role('5a000000-0000-4000-8000-000000000001');
    PERFORM count(*) FROM public.sms_suppressions;
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_raised, 'FAIL A11: authenticated must hold no privilege on sms_suppressions';

  -- A12. THE COUNTEREXAMPLE THE REVIEW REPRODUCED (SQ-24 F2), in its own words:
  -- a record already sitting at granted with refusal_unanswered = false, and the
  -- STOP arriving afterwards. The first candidate left that record allowing,
  -- because its only stamp was a BEFORE trigger on the record's own writes.
  -- Measured on the RAW COLUMNS, because that is all channelConsentVerdict reads.
  INSERT INTO public.studio_channel_consent
    (organization_id, channel_kind, channel_value, status, refusal_unanswered, consented_at)
  VALUES ('5a000000-0000-4000-8000-0000000000d1', 'sms', '+15558880000', 'granted', false, now()),
         ('5a000000-0000-4000-8000-0000000000d2', 'sms', '+15558880000', 'granted', false, now());
  ASSERT (SELECT count(*) FROM public.studio_channel_consent
           WHERE channel_value = '+15558880000' AND status = 'granted'
             AND NOT refusal_unanswered) = 2,
    'FAIL A12a: both studios must start from a clean granted record';

  INSERT INTO public.sms_suppressions (sender_number, recipient_phone, reason)
  VALUES ('+15550000000', '+15558880000', 'stop');

  ASSERT (SELECT count(*) FROM public.studio_channel_consent
           WHERE channel_value = '+15558880000'
             AND status = 'opted_out' AND refusal_unanswered) = 2,
    'FAIL A12b: an arriving STOP must stamp EVERY existing record for that handset, in every organization — the send gate reads the record itself';
  PERFORM pg_temp.assume_user_role('5a000000-0000-4000-8000-000000000001');
  v_status := public.channel_consent_status('5a000000-0000-4000-8000-0000000000d1', 'sms', '+15558880000');
  ASSERT v_status = 'opted_out',
    'FAIL A12c: the room must agree with the record, got ' || COALESCE(v_status, '<null>');
  PERFORM pg_temp.reset_role();

  -- A12d. Lifting restores NOTHING (contract revision 4: START re-grants
  -- explicitly, in P0-06a). The record stays refused until someone writes to it.
  UPDATE public.sms_suppressions SET lifted_at = now()
   WHERE sender_number = '+15550000000' AND recipient_phone = '+15558880000';
  ASSERT (SELECT count(*) FROM public.studio_channel_consent
           WHERE channel_value = '+15558880000'
             AND status = 'opted_out' AND refusal_unanswered) = 2,
    'FAIL A12d: lifting a suppression must not restore any record on its own';

  -- A13. THE COUNTEREXAMPLE THE SECOND REVIEW REPRODUCED (SQ-30 R3).
  -- studio_channel_consent has no normalizing trigger and no CHECK, so a record
  -- written by a service client or an older path can sit at any spelling of the
  -- same handset. Comparing the stored text to the (normalized) suppression left
  -- those records granted with refusal_unanswered false — the exact two columns
  -- _shared/sms.ts channelConsentVerdict reads — while channel_consent_status(),
  -- which normalizes, already said opted_out. Contract revision 5: normalize
  -- BOTH sides. Three spellings, two organizations, one STOP.
  INSERT INTO public.studio_channel_consent
    (organization_id, channel_kind, channel_value, status, refusal_unanswered, consented_at)
  VALUES ('5a000000-0000-4000-8000-0000000000d1', 'sms', '+15556665555',  'granted', false, now()),
         ('5a000000-0000-4000-8000-0000000000d2', 'sms', '15556665555',   'granted', false, now()),
         ('5a000000-0000-4000-8000-0000000000d2', 'sms', '1 555 666 5555', 'granted', false, now());
  ASSERT (SELECT count(*) FROM public.studio_channel_consent
           WHERE public.normalize_channel_value('sms', channel_value) = '+15556665555'
             AND status = 'granted' AND NOT refusal_unanswered) = 3,
    'FAIL A13a: the three spellings must start as three clean granted records, got '
      || (SELECT string_agg(channel_value || '=' || status || '/' || refusal_unanswered::text, ' | ')
            FROM public.studio_channel_consent
           WHERE public.normalize_channel_value('sms', channel_value) = '+15556665555');

  INSERT INTO public.sms_suppressions (sender_number, recipient_phone, reason)
  VALUES ('+15550000000', '+15556665555', 'stop');

  ASSERT NOT EXISTS (
    SELECT 1 FROM public.studio_channel_consent
     WHERE public.normalize_channel_value('sms', channel_value) = '+15556665555'
       AND (status IS DISTINCT FROM 'opted_out' OR refusal_unanswered IS NOT TRUE)),
    'FAIL A13b: a non-canonical stored channel_value is the same handset and must be stamped too';

  -- A13c. The suppression itself may arrive in any spelling: it is normalized on
  -- the way in, so it still finds every record.
  INSERT INTO public.studio_channel_consent
    (organization_id, channel_kind, channel_value, status, refusal_unanswered, consented_at)
  VALUES ('5a000000-0000-4000-8000-0000000000d1', 'sms', '15554445555', 'granted', false, now());
  INSERT INTO public.sms_suppressions (sender_number, recipient_phone, reason)
  VALUES ('+15550000000', '(555) 444-5555', 'stop');
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.studio_channel_consent
     WHERE public.normalize_channel_value('sms', channel_value) = '+15554445555'
       AND (status IS DISTINCT FROM 'opted_out' OR refusal_unanswered IS NOT TRUE)),
    'FAIL A13c: a formatted STOP must reach a non-canonical record as well';

  RAISE NOTICE 'sms_authority A: suppression beats the record (A1-A13) passed.';
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- B · Ref-code allocation (contract S1)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_code     TEXT;
  v_raised   BOOLEAN;
  v_reserved BOOLEAN;
  v_locks    INTEGER;
  v_before   INTEGER;
  v_prompt   UUID;
BEGIN
  -- B1. The first ref on a handset is 10, the next is 11.
  v_code := public.sms_next_short_code('+15550000000', '+15557770000');
  ASSERT v_code = '10', 'FAIL B1a: the first ref must be 10, got ' || COALESCE(v_code, '<null>');
  INSERT INTO public.sms_prompts (id, project_id, party_id, sender_number, recipient_phone, kind, short_code, expires_at)
  VALUES ('5a000000-0000-4000-8000-0000000000c1', '5a000000-0000-4000-8000-0000000000a1',
          '5a000000-0000-4000-8000-0000000000b1', '+15550000000', '+15557770000',
          'confirm_availability', v_code, now() + interval '3 days');

  v_code := public.sms_next_short_code('+15550000000', '+15557770000');
  ASSERT v_code = '11', 'FAIL B1b: the second ref must be 11, got ' || COALESCE(v_code, '<null>');
  INSERT INTO public.sms_prompts (id, project_id, party_id, sender_number, recipient_phone, kind, short_code, expires_at)
  VALUES ('5a000000-0000-4000-8000-0000000000c2', '5a000000-0000-4000-8000-0000000000a1',
          '5a000000-0000-4000-8000-0000000000b1', '+15550000000', '+15557770000',
          'mark_done', v_code, now() + interval '3 days');

  -- B2. The partial unique index is the backstop a racing writer hits — this is
  -- literally what the loser of a two-session race sees. A DIFFERENT handset
  -- may hold the same code at the same time: the code space is per pair.
  v_raised := false;
  BEGIN
    INSERT INTO public.sms_prompts (project_id, party_id, sender_number, recipient_phone, kind, short_code, expires_at)
    VALUES ('5a000000-0000-4000-8000-0000000000a1', '5a000000-0000-4000-8000-0000000000b1',
            '+15550000000', '+15557770000', 'report_delay', '10', now() + interval '3 days');
  EXCEPTION WHEN unique_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL B2a: a duplicate reserved short code on one (sender, recipient) must violate UNIQUE';

  INSERT INTO public.sms_prompts (project_id, party_id, sender_number, recipient_phone, kind, short_code, expires_at)
  VALUES ('5a000000-0000-4000-8000-0000000000a3', '5a000000-0000-4000-8000-0000000000b3',
          '+15550000000', '+15554440000', 'report_delay', '10', now() + interval '3 days');
  ASSERT (SELECT count(*) FROM public.sms_prompts WHERE short_code = '10' AND code_reserved) = 2,
    'FAIL B2b: two different handsets may hold Ref 10 at the same time';

  -- B3. The 90-day non-reuse window. A prompt closed 30 days ago keeps its
  -- code; one closed 100 days ago gives it back.
  INSERT INTO public.sms_prompts (id, project_id, party_id, sender_number, recipient_phone, kind, short_code, expires_at, answered_at, created_at)
  VALUES
    ('5a000000-0000-4000-8000-0000000000c3', '5a000000-0000-4000-8000-0000000000a1',
     '5a000000-0000-4000-8000-0000000000b1', '+15550000000', '+15557770000',
     'mark_done', '12', now() - interval '31 days', now() - interval '30 days', now() - interval '40 days'),
    ('5a000000-0000-4000-8000-0000000000c4', '5a000000-0000-4000-8000-0000000000a1',
     '5a000000-0000-4000-8000-0000000000b1', '+15550000000', '+15557770000',
     'mark_done', '13', now() - interval '101 days', now() - interval '100 days', now() - interval '110 days');

  v_code := public.sms_next_short_code('+15550000000', '+15557770000');
  ASSERT v_code = '13',
    'FAIL B3a: the code of a prompt closed 100 days ago returns to the pool; 10, 11 and 12 do not. Got ' || COALESCE(v_code, '<null>');
  SELECT code_reserved INTO v_reserved FROM public.sms_prompts WHERE id = '5a000000-0000-4000-8000-0000000000c3';
  ASSERT v_reserved, 'FAIL B3b: a prompt closed 30 days ago must keep its code reserved';
  SELECT code_reserved INTO v_reserved FROM public.sms_prompts WHERE id = '5a000000-0000-4000-8000-0000000000c4';
  ASSERT NOT v_reserved, 'FAIL B3c: a prompt closed 100 days ago must have released its code';

  -- An UNANSWERED prompt that expired long ago closes on its expiry, not on an
  -- answer that never came: COALESCE(answered_at, expires_at) is one rule.
  INSERT INTO public.sms_prompts (id, project_id, party_id, sender_number, recipient_phone, kind, short_code, expires_at, created_at)
  VALUES ('5a000000-0000-4000-8000-0000000000c5', '5a000000-0000-4000-8000-0000000000a1',
          '5a000000-0000-4000-8000-0000000000b1', '+15550000000', '+15557770000',
          'report_delay', '14', now() - interval '120 days', now() - interval '130 days');
  PERFORM public.sms_release_expired_short_codes('+15550000000', '+15557770000');
  SELECT code_reserved INTO v_reserved FROM public.sms_prompts WHERE id = '5a000000-0000-4000-8000-0000000000c5';
  ASSERT NOT v_reserved,
    'FAIL B3d: a prompt that expired unanswered 120 days ago must release its code too';

  -- B4. The allocator serializes on an advisory lock keyed to the pair. A psql
  -- script is one session, so the mechanism is observed rather than raced.
  SELECT count(*) INTO v_before FROM pg_locks
   WHERE locktype = 'advisory' AND pid = pg_backend_pid();
  PERFORM public.sms_next_short_code('+15550000000', '+15553330000');
  SELECT count(*) INTO v_locks FROM pg_locks
   WHERE locktype = 'advisory' AND pid = pg_backend_pid();
  ASSERT v_locks > v_before,
    'FAIL B4: sms_next_short_code must hold a transaction-level advisory lock on the pair so concurrent issuers serialize';

  -- B5. Exhaustion: 10–99 full for one handset yields a three-digit ref.
  INSERT INTO public.sms_prompts (project_id, party_id, sender_number, recipient_phone, kind, short_code, expires_at)
  SELECT '5a000000-0000-4000-8000-0000000000a1', '5a000000-0000-4000-8000-0000000000b1',
         '+15550000000', '+15552220000', 'confirm_availability', g.n::text, now() + interval '3 days'
    FROM generate_series(10, 99) AS g(n);
  v_code := public.sms_next_short_code('+15550000000', '+15552220000');
  ASSERT v_code = '100',
    'FAIL B5: with 10-99 exhausted the next ref must be three digits, got ' || COALESCE(v_code, '<null>');

  -- B6. THE COUNTEREXAMPLE THE REVIEW REPRODUCED (SQ-24 F3): answer a ref, then
  -- delete the engagement it belonged to. sms_prompts cascades with the party,
  -- so the row is gone — but the handset can still reply to that ref, and the
  -- code must not be handed to another studio inside its 90-day window.
  INSERT INTO public.project_parties (id, project_id, party_kind, display_name, phone)
  VALUES ('5a000000-0000-4000-8000-0000000000b9', '5a000000-0000-4000-8000-0000000000a1',
          'sub', 'SA Ref Holder', '5551110000');
  INSERT INTO public.sms_prompts (id, project_id, party_id, sender_number, recipient_phone, kind, short_code, answered_at)
  VALUES ('5a000000-0000-4000-8000-0000000000c9', '5a000000-0000-4000-8000-0000000000a1',
          '5a000000-0000-4000-8000-0000000000b9', '+15550000000', '+15551110000',
          'mark_done', '10', now());
  DELETE FROM public.project_parties WHERE id = '5a000000-0000-4000-8000-0000000000b9';
  ASSERT NOT EXISTS (SELECT 1 FROM public.sms_prompts
                      WHERE id = '5a000000-0000-4000-8000-0000000000c9'),
    'FAIL B6a: the prompt row is expected to cascade with its party — that is the hazard, not the fix';
  ASSERT EXISTS (SELECT 1 FROM public.sms_short_code_reservations
                  WHERE sender_number = '+15550000000' AND recipient_phone = '+15551110000'
                    AND short_code = '10' AND reserved_until > now()),
    'FAIL B6b: the 90-day reservation must outlive the engagement (no foreign key can cascade to it)';
  v_code := public.sms_next_short_code('+15550000000', '+15551110000');
  ASSERT v_code = '11',
    'FAIL B6c: a deleted engagement must not release its ref inside the 90-day window, got ' || COALESCE(v_code, '<null>');

  -- B7. ALLOCATION AND BINDING IN ONE TRANSACTION (contract S1 revision 5).
  -- SQ-30's lens: sms_next_short_code's advisory lock only covers the tombstone
  -- read for the rest of the CALLER's transaction, so a caller that fetched a
  -- code in one round trip and inserted the prompt in the next held nothing in
  -- between and two issuers could both read the same code as free.
  -- public.sms_create_prompt() does both under that one lock.
  --
  -- ON CONCURRENCY: two sessions are not simulated here (psql is one session and
  -- the whole suite runs inside one transaction, where a second connection would
  -- see none of these fixtures). What is MEASURED is the property that makes the
  -- race impossible: the pair's advisory lock is taken by sms_create_prompt
  -- itself and, being an xact lock, is still held when the INSERT lands and until
  -- the caller commits — so a concurrent caller on the same (sender, recipient)
  -- blocks at the lock and does not read the code as free. The partial unique
  -- index sms_prompts_short_code_reserved_uniq remains the write-time backstop
  -- for anyone who writes a prompt without going through this door (B2a).
  SELECT count(*) INTO v_before FROM pg_locks
   WHERE locktype = 'advisory' AND pid = pg_backend_pid();
  SELECT id, short_code INTO v_prompt, v_code
    FROM public.sms_create_prompt(
      '5a000000-0000-4000-8000-0000000000b1', '5a000000-0000-4000-8000-0000000000a1',
      'confirm_availability', NULL, 1, now() + interval '3 days',
      '+15550000000', '+15559990000');
  SELECT count(*) INTO v_locks FROM pg_locks
   WHERE locktype = 'advisory' AND pid = pg_backend_pid();
  ASSERT v_locks > v_before,
    'FAIL B7a: sms_create_prompt must hold the pair''s advisory lock through the insert, not just around the read';
  ASSERT v_code = '10',
    'FAIL B7b: the first ref on a fresh handset must be 10, got ' || COALESCE(v_code, '<null>');
  ASSERT EXISTS (SELECT 1 FROM public.sms_prompts
                  WHERE id = v_prompt AND short_code = '10'
                    AND project_id = '5a000000-0000-4000-8000-0000000000a1'
                    AND party_id   = '5a000000-0000-4000-8000-0000000000b1'
                    AND recipient_phone = '+15559990000'),
    'FAIL B7c: sms_create_prompt must return the id of the row it inserted, bound to its party and project';
  ASSERT EXISTS (SELECT 1 FROM public.sms_short_code_reservations
                  WHERE sender_number = '+15550000000' AND recipient_phone = '+15559990000'
                    AND short_code = '10' AND reserved_until > now()),
    'FAIL B7d: the prompt and its 90-day tombstone must be written in the same transaction';

  -- B7e. The second call on the same handset cannot repeat the code.
  SELECT short_code INTO v_code
    FROM public.sms_create_prompt(
      '5a000000-0000-4000-8000-0000000000b1', '5a000000-0000-4000-8000-0000000000a1',
      'report_arrival', NULL, 1, now() + interval '3 days',
      '+15550000000', '+15559990000');
  ASSERT v_code = '11',
    'FAIL B7e: a second prompt on the same handset must take the next ref, got ' || COALESCE(v_code, '<null>');

  -- B7f. It respects the tombstone, which is the half that outlives the prompt
  -- rows: '12' is reserved by a handset that has no live prompt at all.
  INSERT INTO public.sms_short_code_reservations
    (sender_number, recipient_phone, short_code, reserved_until)
  VALUES ('+15550000000', '+15559990000', '12', now() + interval '30 days');
  SELECT short_code INTO v_code
    FROM public.sms_create_prompt(
      '5a000000-0000-4000-8000-0000000000b1', '5a000000-0000-4000-8000-0000000000a1',
      'report_condition', NULL, 1, now() + interval '3 days',
      '+15550000000', '+15559990000');
  ASSERT v_code = '13',
    'FAIL B7f: sms_create_prompt must skip a code still held by a tombstone, got ' || COALESCE(v_code, '<null>');

  -- B7g. A cross-tenant prompt is unwritable through this door too: the
  -- composite (party_id, project_id) foreign key refuses it.
  v_raised := false;
  BEGIN
    PERFORM public.sms_create_prompt(
      '5a000000-0000-4000-8000-0000000000b3', '5a000000-0000-4000-8000-0000000000a1',
      'report_delay', NULL, 1, now() + interval '3 days',
      '+15550000000', '+15559990000');
  EXCEPTION WHEN foreign_key_violation THEN v_raised := true;
  END;
  ASSERT v_raised,
    'FAIL B7g: sms_create_prompt must not be able to write a prompt naming another studio''s party';

  RAISE NOTICE 'sms_authority B: ref-code allocation (B1-B7) passed.';
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- C · The prompt binding, the resolver, and cross-tenant writes
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_id     UUID;
  v_kind   TEXT;
  v_raised BOOLEAN;
  v_count  INTEGER;
BEGIN
  -- C1. An open ref resolves to its own prompt, read digits-only so `Ref 10`,
  -- `#10` and `10` are the same question.
  SELECT id, kind INTO v_id, v_kind
    FROM public.sms_resolve_prompt('+15550000000', '+15557770000', 'Ref 10');
  ASSERT v_id = '5a000000-0000-4000-8000-0000000000c1',
    'FAIL C1a: Ref 10 must resolve to its own prompt, got ' || COALESCE(v_id::text, '<null>');
  ASSERT v_kind = 'confirm_availability', 'FAIL C1b: the resolved prompt carries its own kind';
  SELECT count(*) INTO v_count FROM public.sms_resolve_prompt('+15550000000', '+15557770000', '11');
  ASSERT v_count = 1, 'FAIL C1c: a bare code resolves the same way, got ' || v_count;

  -- C2. A ref belonging to ANOTHER handset does not resolve for this one.
  SELECT count(*) INTO v_count FROM public.sms_resolve_prompt('+15550000000', '+15554440000', '11');
  ASSERT v_count = 0, 'FAIL C2: a ref must not resolve across handsets, got ' || v_count;

  -- C3. An ANSWERED prompt is closed. This is what stops a late `DONE 11` from
  -- landing on the job that ref used to mean.
  UPDATE public.sms_prompts SET answered_at = now()
   WHERE id = '5a000000-0000-4000-8000-0000000000c2';
  SELECT count(*) INTO v_count FROM public.sms_resolve_prompt('+15550000000', '+15557770000', '11');
  ASSERT v_count = 0, 'FAIL C3: an answered prompt must not resolve, got ' || v_count;

  -- C4. An EXPIRED prompt is closed too (c3 expired 31 days ago).
  SELECT count(*) INTO v_count FROM public.sms_resolve_prompt('+15550000000', '+15557770000', '12');
  ASSERT v_count = 0, 'FAIL C4: an expired prompt must not resolve, got ' || v_count;

  -- C5. The binding is immutable: no code path may retarget a live ref.
  v_raised := false;
  BEGIN
    UPDATE public.sms_prompts SET subject_id = gen_random_uuid()
     WHERE id = '5a000000-0000-4000-8000-0000000000c1';
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL C5a: retargeting a prompt''s subject must raise';

  v_raised := false;
  BEGIN
    UPDATE public.sms_prompts SET short_code = '77'
     WHERE id = '5a000000-0000-4000-8000-0000000000c1';
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL C5b: changing a prompt''s short code must raise';

  v_raised := false;
  BEGIN
    UPDATE public.sms_prompts SET project_id = '5a000000-0000-4000-8000-0000000000a3'
     WHERE id = '5a000000-0000-4000-8000-0000000000c1';
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL C5c: moving a prompt to another studio''s project must raise';

  -- answered_at is write-once: a second answer cannot overwrite the first.
  v_raised := false;
  BEGIN
    UPDATE public.sms_prompts SET answered_at = now() + interval '1 hour'
     WHERE id = '5a000000-0000-4000-8000-0000000000c2';
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL C5d: answered_at must be write-once';

  -- A released code cannot be re-reserved (that would resurrect a dead ref).
  v_raised := false;
  BEGIN
    UPDATE public.sms_prompts SET code_reserved = true
     WHERE id = '5a000000-0000-4000-8000-0000000000c4';
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL C5e: a released short code must not be re-reserved';

  -- C6. A cross-tenant prompt is UNWRITABLE, not merely unreadable: the
  -- composite (party_id, project_id) foreign key refuses it outright.
  v_raised := false;
  BEGIN
    INSERT INTO public.sms_prompts (project_id, party_id, sender_number, recipient_phone, kind, short_code, expires_at)
    VALUES ('5a000000-0000-4000-8000-0000000000a1', '5a000000-0000-4000-8000-0000000000b3',
            '+15550000000', '+15557770000', 'report_delay', '20', now() + interval '3 days');
  EXCEPTION WHEN foreign_key_violation THEN v_raised := true;
  END;
  ASSERT v_raised,
    'FAIL C6: a prompt naming another studio''s party must be impossible to write';

  -- C7. ONE open consent challenge per (party, engagement version) — contract
  -- S2. START re-asks the existing challenge; it never opens a second.
  INSERT INTO public.sms_prompts (id, project_id, party_id, sender_number, recipient_phone, kind, version, short_code, expires_at)
  VALUES ('5a000000-0000-4000-8000-0000000000c9', '5a000000-0000-4000-8000-0000000000a1',
          '5a000000-0000-4000-8000-0000000000b1', '+15550000000', '+15557770000',
          'optin', 1, '30', now() + interval '3 days');

  v_raised := false;
  BEGIN
    INSERT INTO public.sms_prompts (project_id, party_id, sender_number, recipient_phone, kind, version, short_code, expires_at)
    VALUES ('5a000000-0000-4000-8000-0000000000a1', '5a000000-0000-4000-8000-0000000000b1',
            '+15550000000', '+15557770000', 'optin', 1, '31', now() + interval '3 days');
  EXCEPTION WHEN unique_violation THEN v_raised := true;
  END;
  ASSERT v_raised,
    'FAIL C7a: a second OPEN optin challenge at the same (party, version) must raise';

  -- A NEW engagement version may ask again while the old one is still open.
  INSERT INTO public.sms_prompts (project_id, party_id, sender_number, recipient_phone, kind, version, short_code, expires_at)
  VALUES ('5a000000-0000-4000-8000-0000000000a1', '5a000000-0000-4000-8000-0000000000b1',
          '+15550000000', '+15557770000', 'optin', 2, '31', now() + interval '3 days');
  SELECT count(*) INTO v_count FROM public.sms_prompts
   WHERE party_id = '5a000000-0000-4000-8000-0000000000b1' AND kind = 'optin' AND answered_at IS NULL;
  ASSERT v_count = 2, 'FAIL C7b: a new engagement version may open its own challenge, got ' || v_count;

  -- Once answered, the same version may be asked again.
  UPDATE public.sms_prompts SET answered_at = now()
   WHERE id = '5a000000-0000-4000-8000-0000000000c9';
  INSERT INTO public.sms_prompts (project_id, party_id, sender_number, recipient_phone, kind, version, short_code, expires_at)
  VALUES ('5a000000-0000-4000-8000-0000000000a1', '5a000000-0000-4000-8000-0000000000b1',
          '+15550000000', '+15557770000', 'optin', 1, '32', now() + interval '3 days');
  SELECT count(*) INTO v_count FROM public.sms_prompts
   WHERE party_id = '5a000000-0000-4000-8000-0000000000b1' AND kind = 'optin' AND version = 1;
  ASSERT v_count = 2, 'FAIL C7c: an answered challenge frees its (party, version) for a re-ask, got ' || v_count;

  RAISE NOTICE 'sms_authority C: prompt binding + resolver (C1-C7) passed.';
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- D · sms_messages attribution is final
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_raised BOOLEAN;
  v_proj   UUID;
BEGIN
  INSERT INTO public.sms_conversations (id, twilio_number, phone_e164)
  VALUES ('5a000000-0000-4000-8000-0000000000e1', '+15550000000', '+15557770000');

  INSERT INTO public.sms_messages (id, conversation_id, direction, body)
  VALUES ('5a000000-0000-4000-8000-0000000000e2', '5a000000-0000-4000-8000-0000000000e1',
          'inbound', 'which job is this');

  -- D1. An UNattributed message may be attributed once — that is the phone
  -- fallback's only legitimate act.
  UPDATE public.sms_messages SET project_id = '5a000000-0000-4000-8000-0000000000a1'
   WHERE id = '5a000000-0000-4000-8000-0000000000e2';
  SELECT project_id INTO v_proj FROM public.sms_messages WHERE id = '5a000000-0000-4000-8000-0000000000e2';
  ASSERT v_proj = '5a000000-0000-4000-8000-0000000000a1',
    'FAIL D1: an unattributed message must be attributable once';

  -- D2. …and never again, by anyone, including the service role.
  v_raised := false;
  BEGIN
    UPDATE public.sms_messages SET project_id = '5a000000-0000-4000-8000-0000000000a3'
     WHERE id = '5a000000-0000-4000-8000-0000000000e2';
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL D2a: an attributed message must not be retargeted to another studio';

  v_raised := false;
  BEGIN
    UPDATE public.sms_messages SET project_id = NULL
     WHERE id = '5a000000-0000-4000-8000-0000000000e2';
  EXCEPTION WHEN check_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL D2b: attribution must not be cleared either';

  -- D3. Ordinary triage fields still move on an attributed row.
  UPDATE public.sms_messages SET needs_review = true, owner_user_id = '5a000000-0000-4000-8000-000000000001'
   WHERE id = '5a000000-0000-4000-8000-0000000000e2';

  RAISE NOTICE 'sms_authority D: attribution is final (D1-D3) passed.';
  RAISE NOTICE 'All sms_authority assertions passed.';
END
$$;

ROLLBACK TO SAVEPOINT sms_authority_test;
RELEASE SAVEPOINT sms_authority_test;
