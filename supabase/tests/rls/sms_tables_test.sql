-- ═══════════════════════════════════════════════════════════════════════════
-- SMS tenancy RLS + privilege + idempotency tests (00282, 00584, 00639)
--
-- The shape that matters: TWO studios, ONE handset. A single phone works for
-- studio A's project and studio B's project, so there is exactly one
-- sms_conversations transport row and it is shared.
--
--   · 00282:120-141 and :143-164 let either studio read the whole conversation
--     AND the other studio's attributed messages through a phone fallback
--     (:135, :157).
--   · 00584:1043-1063 then added sms_conversations_studio_select /
--     sms_messages_studio_select beside them. Permissive policies OR, so the
--     studio co-member path has to be measured too, not just the team path.
--   · 00639 rewrites BOTH sets and revokes the three cross-studio columns of
--     the shared transport row at the column level.
--
-- Covers:
--   1. Studio A reads only its own attributed message.
--   2. Studio B reads only its own — and neither reads the other's (the leak).
--   3. An UNATTRIBUTED message — the unresolved chooser text and its media — is
--      visible to NEITHER studio (service-role only). This inverts the original
--      Case 3, which asserted the phone fallback exposed it; that WAS the leak.
--   4. The shared transport row is readable only by the team/studio of its
--      ACTIVE project, and its cross-studio columns (party_id, state,
--      state_context — the chooser, the pending body and its media) are
--      readable by NOBODY through `authenticated`.
--   5. The 00584 studio co-member path is scoped too: studio A's co-member gets
--      A's rows and none of B's, and no state_context either.
--   6. sms_conversation_context is per project: each studio reads its own menu.
--   7. sms_prompts are per project: each studio reads only its own refs.
--   8. sms_suppressions is phone-global and belongs to no tenant: authenticated
--      has no grant at all.
--   9. sms_review_queue projects only the reader's own needs_review rows.
--  10. field-media storage: each studio reads only project/<own project>/…;
--      holding/… (unresolved media) is readable by neither.
--  11. No authenticated writes on any of the five tables — asserted at the
--      PRIVILEGE level (contract S12), because this stack's creation-time
--      defaults hand anon and authenticated arwdDxtm on every new table.
--  12. twilio_sid UNIQUE = the inbound idempotency claim.
--  13. THE BACKFILL ITSELF (contract revision 5). 00639 does not put the shared
--      legacy state_context on ANY project's row — not wholesale (SQ-24 F1) and
--      not classified (SQ-30 R1). After it runs, studio A, studio B and A's
--      co-member each read NOTHING for the fixture conversation; the whole JSON
--      is on the holding row (project_id NULL) verbatim, for P0-06b to re-ask;
--      a re-run replaces that held copy rather than keeping a stale one; an
--      attributed row stamped backfilled_at — what an earlier 00639 left behind
--      — is deleted, and an unstamped attributed row (live rail state) is not.
--
-- How to run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 -f supabase/tests/rls/sms_tables_test.sql
--
-- RLS cases switch to the authenticated role + jwt claims (the
-- products_three_layer_test idiom). Every fixture row is written as postgres
-- (RLS-exempt) so each case measures the READER, never the setup.
--
-- Transaction-wrapped, and nested on a SAVEPOINT so the file can be piped
-- STRAIGHT AFTER the migration inside one outer transaction (the ticket verify
-- line does exactly that): the savepoint rolls back this file's fixtures and
-- leaves the schema under test standing for the next file. Run on its own, the
-- BEGIN opens the transaction and closing the connection discards it, so
-- nothing is ever committed either way.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;
SAVEPOINT sms_tables_test;

SET LOCAL statement_timeout = '120s';

-- ─── fixtures ──────────────────────────────────────────────────────────────
-- ...0001 = studio A's designer, ...0002 = studio B's designer, ...0003 = an
-- active non-guest member of studio A (the 00584 co-member path). Each studio
-- is an outsider to the other.
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('ab000000-0000-4000-8000-000000000001', 'ab-studio-a@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('ab000000-0000-4000-8000-000000000002', 'ab-studio-b@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('ab000000-0000-4000-8000-000000000003', 'ab-a-comember@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('ab000000-0000-4000-8000-000000000001', 'ab-studio-a@test.invalid',   'AB Studio A',   NOW(), NOW()),
  ('ab000000-0000-4000-8000-000000000002', 'ab-studio-b@test.invalid',   'AB Studio B',   NOW(), NOW()),
  ('ab000000-0000-4000-8000-000000000003', 'ab-a-comember@test.invalid', 'AB A Co-member', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

-- Two real studios, so is_studio_comember (00556) resolves the 00584 branch.
INSERT INTO organizations (id, type, name, slug, status)
VALUES
  ('ab000000-0000-4000-8000-0000000000d1', 'design_studio', 'AB Studio A Org', 'ab-studio-a-org', 'active'),
  ('ab000000-0000-4000-8000-0000000000d2', 'design_studio', 'AB Studio B Org', 'ab-studio-b-org', 'active');

INSERT INTO organization_members (user_id, organization_id, role, status)
VALUES
  ('ab000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-0000000000d1', 'owner',  'active'),
  ('ab000000-0000-4000-8000-000000000003', 'ab000000-0000-4000-8000-0000000000d1', 'member', 'active'),
  ('ab000000-0000-4000-8000-000000000002', 'ab000000-0000-4000-8000-0000000000d2', 'owner',  'active');

INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES
  ('ab000000-0000-4000-8000-0000000000a1', 'AB Studio A Project', 'ab000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-0000000000d1'),
  ('ab000000-0000-4000-8000-0000000000a2', 'AB Studio B Project', 'ab000000-0000-4000-8000-000000000002', 'ab000000-0000-4000-8000-000000000002', 'ab000000-0000-4000-8000-0000000000d2');

-- ONE tile setter, working for both studios, texting from one handset.
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone)
VALUES
  ('ab000000-0000-4000-8000-0000000000b1', 'ab000000-0000-4000-8000-0000000000a1', 'sub', 'AB Tile (for A)', '5551230000'),
  ('ab000000-0000-4000-8000-0000000000b2', 'ab000000-0000-4000-8000-0000000000a2', 'sub', 'AB Tile (for B)', '5551230000');

-- One transport row, pinned to studio A. Its state_context is mid-chooser: it
-- names BOTH studios' projects and parks the unresolved inbound body + media.
INSERT INTO sms_conversations (id, twilio_number, phone_e164, party_id, active_project_id, state, state_context)
VALUES ('ab000000-0000-4000-8000-0000000000f1', '+15550000000', '+15551230000',
        'ab000000-0000-4000-8000-0000000000b1', 'ab000000-0000-4000-8000-0000000000a1',
        'awaiting_project_choice',
        jsonb_build_object(
          'chooser', jsonb_build_array(
            jsonb_build_object('n', 1, 'project_id', 'ab000000-0000-4000-8000-0000000000a1', 'party_id', 'ab000000-0000-4000-8000-0000000000b1'),
            jsonb_build_object('n', 2, 'project_id', 'ab000000-0000-4000-8000-0000000000a2', 'party_id', 'ab000000-0000-4000-8000-0000000000b2')
          ),
          'pending_body', 'grout is cracked in the guest bath',
          'pending_media', jsonb_build_array('holding/ab000000-0000-4000-8000-0000000000f1/1.jpg')
        ));

-- f2: attributed to studio A. f4: attributed to studio B. f3: UNATTRIBUTED —
-- the unresolved chooser text, carrying its media. f5: A's triage row.
INSERT INTO sms_messages (id, conversation_id, direction, body, media, party_id, project_id, twilio_sid, needs_review, parsed_intent)
VALUES
  ('ab000000-0000-4000-8000-0000000000f2', 'ab000000-0000-4000-8000-0000000000f1', 'inbound', 'tile done',
   '[]'::jsonb, 'ab000000-0000-4000-8000-0000000000b1', 'ab000000-0000-4000-8000-0000000000a1', 'SM_ab_0001', false, NULL),
  ('ab000000-0000-4000-8000-0000000000f4', 'ab000000-0000-4000-8000-0000000000f1', 'inbound', 'B studio grout order',
   '[]'::jsonb, 'ab000000-0000-4000-8000-0000000000b2', 'ab000000-0000-4000-8000-0000000000a2', 'SM_ab_0003', false,
   '{"intent": "report_delay", "note": "B studio only"}'::jsonb),
  ('ab000000-0000-4000-8000-0000000000f3', 'ab000000-0000-4000-8000-0000000000f1', 'inbound', 'grout is cracked in the guest bath',
   '[{"path": "holding/ab000000-0000-4000-8000-0000000000f1/1.jpg", "content_type": "image/jpeg"}]'::jsonb,
   NULL, NULL, 'SM_ab_0002', true, NULL),
  ('ab000000-0000-4000-8000-0000000000f5', 'ab000000-0000-4000-8000-0000000000f1', 'inbound', 'punch list photo',
   '[]'::jsonb, 'ab000000-0000-4000-8000-0000000000b1', 'ab000000-0000-4000-8000-0000000000a1', 'SM_ab_0004', true, NULL);

-- Project-scoped conversation state: one row per studio (00639, contract S4).
INSERT INTO sms_conversation_context (conversation_id, project_id, party_id, state, state_context)
VALUES
  ('ab000000-0000-4000-8000-0000000000f1', 'ab000000-0000-4000-8000-0000000000a1', 'ab000000-0000-4000-8000-0000000000b1',
   'idle', '{"menu": [{"n": 1, "kind": "task", "title": "A: set guest bath tile"}]}'::jsonb),
  ('ab000000-0000-4000-8000-0000000000f1', 'ab000000-0000-4000-8000-0000000000a2', 'ab000000-0000-4000-8000-0000000000b2',
   'idle', '{"menu": [{"n": 1, "kind": "task", "title": "B: grout the powder room"}]}'::jsonb);

-- One handset, one sender number → the two studios' refs share a code space.
INSERT INTO sms_prompts (id, project_id, party_id, sender_number, recipient_phone, kind, short_code, expires_at)
VALUES
  ('ab000000-0000-4000-8000-0000000000c1', 'ab000000-0000-4000-8000-0000000000a1', 'ab000000-0000-4000-8000-0000000000b1',
   '+15550000000', '+15551230000', 'confirm_availability', '10', now() + interval '3 days'),
  ('ab000000-0000-4000-8000-0000000000c2', 'ab000000-0000-4000-8000-0000000000a2', 'ab000000-0000-4000-8000-0000000000b2',
   '+15550000000', '+15551230000', 'confirm_availability', '11', now() + interval '3 days');

INSERT INTO sms_suppressions (sender_number, recipient_phone, reason)
VALUES ('+15550000000', '+15559998888', 'stop');

-- field-media objects: one per studio under project/…, plus the unresolved
-- holding/… object that belongs to no project yet.
INSERT INTO storage.objects (bucket_id, name, owner)
VALUES
  ('field-media', 'project/ab000000-0000-4000-8000-0000000000a1/sms/ab000000-0000-4000-8000-0000000000f2/1.jpg', NULL),
  ('field-media', 'project/ab000000-0000-4000-8000-0000000000a2/sms/ab000000-0000-4000-8000-0000000000f4/1.jpg', NULL),
  ('field-media', 'holding/ab000000-0000-4000-8000-0000000000f1/1.jpg', NULL);

-- ─── helpers ───────────────────────────────────────────────────────────────
-- The GRANT after each definition is required: 00483 revokes database TEMPORARY
-- from authenticated/anon/service_role, so a restricted role cannot reach a
-- pg_temp function without it.
CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
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

-- ─── assertions ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_count  INTEGER;
  v_raised BOOLEAN;
  v_txt    TEXT;
BEGIN
  -- ── Case 1: studio A reads its own attributed message ────────────────────
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_count FROM sms_messages WHERE id = 'ab000000-0000-4000-8000-0000000000f2';
  ASSERT v_count = 1, 'FAIL 1a: studio A should read its own attributed message, got ' || v_count;
  SELECT body INTO v_txt FROM sms_messages WHERE id = 'ab000000-0000-4000-8000-0000000000f2';
  ASSERT v_txt = 'tile done', 'FAIL 1b: studio A should read its own message body, got ' || COALESCE(v_txt, '<null>');

  -- ── Case 2: the cross-studio leak (00282:143-164) is closed ──────────────
  SELECT count(*) INTO v_count FROM sms_messages WHERE id = 'ab000000-0000-4000-8000-0000000000f4';
  ASSERT v_count = 0, 'FAIL 2a: studio A must NOT read studio B''s message on the shared handset, got ' || v_count;
  -- The body and the parse are the payload the deck names; neither may arrive.
  SELECT count(*) INTO v_count FROM sms_messages
   WHERE body = 'B studio grout order' OR parsed_intent->>'note' = 'B studio only';
  ASSERT v_count = 0, 'FAIL 2b: studio A must NOT read studio B''s body or parsed_intent, got ' || v_count;
  PERFORM pg_temp.reset_role();

  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_count FROM sms_messages WHERE id = 'ab000000-0000-4000-8000-0000000000f4';
  ASSERT v_count = 1, 'FAIL 2c: studio B should read its own attributed message, got ' || v_count;
  SELECT count(*) INTO v_count FROM sms_messages WHERE id = 'ab000000-0000-4000-8000-0000000000f2';
  ASSERT v_count = 0, 'FAIL 2d: studio B must NOT read studio A''s message on the shared handset, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- ── Case 3: the unattributed chooser text + media belong to no tenant ────
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_count FROM sms_messages WHERE id = 'ab000000-0000-4000-8000-0000000000f3';
  ASSERT v_count = 0, 'FAIL 3a: an unattributed message must be service-role only (studio A read it), got ' || v_count;
  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_count FROM sms_messages WHERE id = 'ab000000-0000-4000-8000-0000000000f3';
  ASSERT v_count = 0, 'FAIL 3b: an unattributed message must be service-role only (studio B read it), got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- ── Case 4: the shared transport row and its cross-studio columns ────────
  -- The pin is on studio A's project, so A (and 00584's co-member branch) may
  -- see the transport row itself — that is what 00584 item 24 established and
  -- its sweep test asserts at I2. What no authenticated caller may reach is the
  -- chooser/pending payload, which names the OTHER studio.
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_count FROM sms_conversations WHERE id = 'ab000000-0000-4000-8000-0000000000f1';
  ASSERT v_count = 1, 'FAIL 4a: studio A should read the transport row pinned to its own project, got ' || v_count;

  v_raised := false;
  BEGIN
    SELECT state_context::text INTO v_txt FROM sms_conversations
     WHERE id = 'ab000000-0000-4000-8000-0000000000f1';
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 4b: state_context (the cross-studio chooser + pending body/media) must be column-revoked from authenticated';

  v_raised := false;
  BEGIN
    SELECT party_id::text INTO v_txt FROM sms_conversations
     WHERE id = 'ab000000-0000-4000-8000-0000000000f1';
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 4c: the transport row''s best-guess party_id must be column-revoked from authenticated';

  v_raised := false;
  BEGIN
    SELECT state INTO v_txt FROM sms_conversations
     WHERE id = 'ab000000-0000-4000-8000-0000000000f1';
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 4d: the shared ladder position (state) must be column-revoked from authenticated';
  PERFORM pg_temp.reset_role();

  -- Studio B is not on the pin, so it does not see the row at all.
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_count FROM sms_conversations WHERE id = 'ab000000-0000-4000-8000-0000000000f1';
  ASSERT v_count = 0, 'FAIL 4e: studio B must not read a transport row pinned to studio A, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- ── Case 5: the 00584 studio co-member path is scoped too ────────────────
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000003');
  SELECT count(*) INTO v_count FROM sms_messages WHERE id = 'ab000000-0000-4000-8000-0000000000f2';
  ASSERT v_count = 1, 'FAIL 5a: studio A''s co-member should read studio A''s message (00584 item 24), got ' || v_count;
  SELECT count(*) INTO v_count FROM sms_messages WHERE id = 'ab000000-0000-4000-8000-0000000000f4';
  ASSERT v_count = 0, 'FAIL 5b: studio A''s co-member must NOT read studio B''s message, got ' || v_count;
  SELECT count(*) INTO v_count FROM sms_messages WHERE id = 'ab000000-0000-4000-8000-0000000000f3';
  ASSERT v_count = 0, 'FAIL 5c: studio A''s co-member must NOT read the unattributed message, got ' || v_count;
  SELECT count(*) INTO v_count FROM sms_conversations WHERE id = 'ab000000-0000-4000-8000-0000000000f1';
  ASSERT v_count = 1, 'FAIL 5d: studio A''s co-member should read the transport row on A''s pin, got ' || v_count;
  v_raised := false;
  BEGIN
    SELECT state_context::text INTO v_txt FROM sms_conversations
     WHERE id = 'ab000000-0000-4000-8000-0000000000f1';
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 5e: the co-member path must not reach state_context either';
  SELECT count(*) INTO v_count FROM sms_conversation_context
   WHERE project_id = 'ab000000-0000-4000-8000-0000000000a2';
  ASSERT v_count = 0, 'FAIL 5f: studio A''s co-member must NOT read studio B''s context, got ' || v_count;
  SELECT count(*) INTO v_count FROM sms_prompts WHERE id = 'ab000000-0000-4000-8000-0000000000c2';
  ASSERT v_count = 0, 'FAIL 5g: studio A''s co-member must NOT read studio B''s prompt, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- ── Case 6: per-project conversation context ─────────────────────────────
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_count FROM sms_conversation_context
   WHERE conversation_id = 'ab000000-0000-4000-8000-0000000000f1';
  ASSERT v_count = 1, 'FAIL 6a: studio A should read exactly its own context row, got ' || v_count;
  SELECT count(*) INTO v_count FROM sms_conversation_context
   WHERE conversation_id = 'ab000000-0000-4000-8000-0000000000f1'
     AND project_id = 'ab000000-0000-4000-8000-0000000000a2';
  ASSERT v_count = 0, 'FAIL 6b: studio A must not read studio B''s menu/context, got ' || v_count;
  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_count FROM sms_conversation_context
   WHERE conversation_id = 'ab000000-0000-4000-8000-0000000000f1'
     AND project_id = 'ab000000-0000-4000-8000-0000000000a2';
  ASSERT v_count = 1, 'FAIL 6c: studio B should read its own context row, got ' || v_count;
  SELECT count(*) INTO v_count FROM sms_conversation_context
   WHERE conversation_id = 'ab000000-0000-4000-8000-0000000000f1'
     AND project_id = 'ab000000-0000-4000-8000-0000000000a1';
  ASSERT v_count = 0, 'FAIL 6d: studio B must not read studio A''s menu/context, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- ── Case 7: refs are per project ─────────────────────────────────────────
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_count FROM sms_prompts WHERE recipient_phone = '+15551230000';
  ASSERT v_count = 1, 'FAIL 7a: studio A should read exactly its own prompt, got ' || v_count;
  SELECT count(*) INTO v_count FROM sms_prompts WHERE id = 'ab000000-0000-4000-8000-0000000000c2';
  ASSERT v_count = 0, 'FAIL 7b: studio A must not read studio B''s prompt, got ' || v_count;
  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_count FROM sms_prompts WHERE id = 'ab000000-0000-4000-8000-0000000000c1';
  ASSERT v_count = 0, 'FAIL 7c: studio B must not read studio A''s prompt, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- ── Case 8: suppression belongs to no tenant ─────────────────────────────
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000001');
  v_raised := false;
  BEGIN
    SELECT count(*) INTO v_count FROM sms_suppressions;
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 8: sms_suppressions must not be granted to authenticated (phone-global, no tenant)';
  PERFORM pg_temp.reset_role();

  -- ── Case 9: the review queue projects only the reader's rows ─────────────
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_count FROM sms_review_queue;
  ASSERT v_count = 1, 'FAIL 9a: studio A''s review queue should hold exactly its own needs_review row, got ' || v_count;
  SELECT count(*) INTO v_count FROM sms_review_queue WHERE id = 'ab000000-0000-4000-8000-0000000000f5';
  ASSERT v_count = 1, 'FAIL 9b: studio A''s review queue should hold f5';
  SELECT count(*) INTO v_count FROM sms_review_queue WHERE id = 'ab000000-0000-4000-8000-0000000000f3';
  ASSERT v_count = 0, 'FAIL 9c: the unattributed needs_review row must never reach a studio queue, got ' || v_count;
  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_count FROM sms_review_queue;
  ASSERT v_count = 0, 'FAIL 9d: studio B has no needs_review rows of its own, got ' || v_count;
  PERFORM pg_temp.reset_role();

  -- review_sms_message must refuse the unattributed row for everyone: with the
  -- 00282 phone fallback gone it has no tenant to authorize against.
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000001');
  v_raised := false;
  BEGIN
    PERFORM public.review_sms_message('ab000000-0000-4000-8000-0000000000f3', 'dismiss');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 9e: review_sms_message must refuse an unattributed message (the 00282 phone fallback is gone)';
  v_raised := false;
  BEGIN
    PERFORM public.review_sms_message('ab000000-0000-4000-8000-0000000000f4', 'dismiss');
  EXCEPTION WHEN insufficient_privilege THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 9f: review_sms_message must refuse studio B''s message to studio A';
  PERFORM pg_temp.reset_role();

  -- ── Case 10: field-media objects ─────────────────────────────────────────
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_count FROM storage.objects
   WHERE bucket_id = 'field-media'
     AND name LIKE 'project/ab000000-0000-4000-8000-0000000000a1/%';
  ASSERT v_count = 1, 'FAIL 10a: studio A should read its own field media, got ' || v_count;
  SELECT count(*) INTO v_count FROM storage.objects
   WHERE bucket_id = 'field-media'
     AND name LIKE 'project/ab000000-0000-4000-8000-0000000000a2/%';
  ASSERT v_count = 0, 'FAIL 10b: studio A must not read studio B''s field media, got ' || v_count;
  SELECT count(*) INTO v_count FROM storage.objects
   WHERE bucket_id = 'field-media' AND name LIKE 'holding/%';
  ASSERT v_count = 0, 'FAIL 10c: unresolved holding/ media must be service-role only (studio A), got ' || v_count;
  PERFORM pg_temp.reset_role();
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_count FROM storage.objects
   WHERE bucket_id = 'field-media'
     AND name LIKE 'project/ab000000-0000-4000-8000-0000000000a2/%';
  ASSERT v_count = 1, 'FAIL 10d: studio B should read its own field media, got ' || v_count;
  SELECT count(*) INTO v_count FROM storage.objects
   WHERE bucket_id = 'field-media' AND name LIKE 'holding/%';
  ASSERT v_count = 0, 'FAIL 10e: unresolved holding/ media must be service-role only (studio B), got ' || v_count;
  PERFORM pg_temp.reset_role();

  RAISE NOTICE 'sms_tables: cases 1-10 passed (two studios, one handset).';
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 11 · PRIVILEGE level (contract S12)
-- ═══════════════════════════════════════════════════════════════════════════
-- Not "no policy exists", but "no privilege exists". On this stack ALTER
-- DEFAULT PRIVILEGES grants anon and authenticated arwdDxtm at CREATE TABLE
-- time, so a table with perfect policies can still be written by authenticated
-- unless the migration revokes explicitly. supabase/seed/00-legacy-grants.sql
-- replays that history after a reset, which is why it is regenerated with the
-- migration.
DO $$
DECLARE
  v_table text;
  v_priv  text;
  v_role  text;
  v_tables text[] := ARRAY[
    'public.sms_suppressions',
    'public.sms_prompts',
    'public.sms_conversation_context',
    'public.sms_short_code_reservations',
    'public.sms_messages',
    'public.sms_conversations'
  ];
  v_writes text[] := ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'];
BEGIN
  FOREACH v_table IN ARRAY v_tables LOOP
    FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      FOREACH v_priv IN ARRAY v_writes LOOP
        ASSERT NOT has_table_privilege(v_role, v_table, v_priv),
          format('FAIL 11a: %s must not hold %s on %s', v_role, v_priv, v_table);
      END LOOP;
    END LOOP;
  END LOOP;

  -- anon reads nothing on the SMS rail; authenticated reads only what a policy
  -- can then scope.
  FOREACH v_table IN ARRAY v_tables LOOP
    ASSERT NOT has_table_privilege('anon', v_table, 'SELECT'),
      format('FAIL 11b: anon must not hold SELECT on %s', v_table);
  END LOOP;

  ASSERT NOT has_table_privilege('authenticated', 'public.sms_suppressions', 'SELECT'),
    'FAIL 11c: authenticated must not hold SELECT on sms_suppressions';
  ASSERT NOT has_table_privilege('authenticated', 'public.sms_short_code_reservations', 'SELECT'),
    'FAIL 11c2: authenticated must not hold SELECT on sms_short_code_reservations (a ref reservation belongs to a handset, not to a tenant)';
  ASSERT has_table_privilege('authenticated', 'public.sms_prompts', 'SELECT'),
    'FAIL 11d: authenticated needs SELECT on sms_prompts for its policy to matter';
  ASSERT has_table_privilege('authenticated', 'public.sms_conversation_context', 'SELECT'),
    'FAIL 11e: authenticated needs SELECT on sms_conversation_context';

  -- sms_conversations is granted per COLUMN, so the table-wide test is the
  -- three cross-studio columns.
  ASSERT has_column_privilege('authenticated', 'public.sms_conversations', 'id', 'SELECT'),
    'FAIL 11f: authenticated needs SELECT on sms_conversations.id';
  ASSERT NOT has_column_privilege('authenticated', 'public.sms_conversations', 'state_context', 'SELECT'),
    'FAIL 11g: authenticated must not hold SELECT on sms_conversations.state_context';
  ASSERT NOT has_column_privilege('authenticated', 'public.sms_conversations', 'state', 'SELECT'),
    'FAIL 11h: authenticated must not hold SELECT on sms_conversations.state';
  ASSERT NOT has_column_privilege('authenticated', 'public.sms_conversations', 'party_id', 'SELECT'),
    'FAIL 11i: authenticated must not hold SELECT on sms_conversations.party_id';

  -- The projection inherits the base tables' scoping, but it is its own object
  -- and the legacy baseline grants views too.
  ASSERT NOT has_table_privilege('anon', 'public.sms_review_queue', 'SELECT'),
    'FAIL 11j: anon must not hold SELECT on sms_review_queue';

  -- The service role still owns the rail end to end.
  FOREACH v_table IN ARRAY v_tables LOOP
    ASSERT has_table_privilege('service_role', v_table, 'INSERT'),
      format('FAIL 11k: service_role must keep INSERT on %s', v_table);
  END LOOP;

  RAISE NOTICE 'sms_tables: case 11 (privilege level, contract S12) passed.';
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 12 · twilio_sid idempotency (unchanged behaviour, 00282)
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_count  INTEGER;
  v_raised BOOLEAN;
BEGIN
  v_raised := false;
  BEGIN
    INSERT INTO sms_messages (conversation_id, direction, body, twilio_sid)
    VALUES ('ab000000-0000-4000-8000-0000000000f1', 'inbound', 'dup', 'SM_ab_0001');
  EXCEPTION WHEN unique_violation THEN v_raised := true;
  END;
  ASSERT v_raised, 'FAIL 12a: a duplicate twilio_sid must violate UNIQUE';

  INSERT INTO sms_messages (conversation_id, direction, body, twilio_sid)
  VALUES ('ab000000-0000-4000-8000-0000000000f1', 'inbound', 'dup2', 'SM_ab_0001')
  ON CONFLICT (twilio_sid) DO NOTHING;
  SELECT count(*) INTO v_count FROM sms_messages WHERE twilio_sid = 'SM_ab_0001';
  ASSERT v_count = 1, 'FAIL 12b: ON CONFLICT DO NOTHING should keep exactly one row, got ' || v_count;

  RAISE NOTICE 'sms_tables: case 12 (twilio_sid idempotency) passed.';
END
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 13 · The BACKFILL HOLDS; it attributes nothing (00639, contract rev 5)
-- ═══════════════════════════════════════════════════════════════════════════
-- Two reviews rejected two attempts to decide which studio a legacy
-- state_context key belongs to (SQ-24 F1, then SQ-30 R1: field-daily reuses the
-- handset's conversation without moving active_project_id, so the pin and the
-- menu routinely name different studios). Contract revision 5 stops deciding.
-- Everything the transport row carried moves VERBATIM to the holding row that
-- no studio policy admits, and P0-06b re-asks.
--
-- The two context rows in the fixtures above are hand-made, which is exactly how
-- the first candidate's suite missed this: it asserted on sanitized rows it had
-- written itself. Here they are removed, an attributed row of the kind an
-- EARLIER 00639 wrote is planted in their place, and the migration's own rule is
-- asked to produce the outcome from the legacy transport row.
DO $$
DECLARE
  v_legacy  JSONB;
  v_state   TEXT;
  v_rows    INTEGER;
  v_count   INTEGER;
  v_held    JSONB;
  v_total   INTEGER;
BEGIN
  SELECT state_context, state INTO v_legacy, v_state
    FROM sms_conversations WHERE id = 'ab000000-0000-4000-8000-0000000000f1';

  DELETE FROM sms_conversation_context
   WHERE conversation_id = 'ab000000-0000-4000-8000-0000000000f1';

  -- What a database that ran 2060c132 or 3cc12bf4 is carrying right now: a
  -- project-attributed row holding classified legacy JSON. The stamp is what the
  -- migration's own ALTER puts on every row that predates the column.
  INSERT INTO sms_conversation_context
    (conversation_id, project_id, party_id, state, state_context, backfilled_at)
  VALUES ('ab000000-0000-4000-8000-0000000000f1', 'ab000000-0000-4000-8000-0000000000a1',
          'ab000000-0000-4000-8000-0000000000b1', 'awaiting_project_choice', v_legacy, now());

  PERFORM public.sms_backfill_conversation_context();

  -- 13a. Studio A's designer reads NOTHING for this conversation. Not a
  -- sanitized row: nothing. Legacy state is never attributed to a studio.
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000001');
  SELECT count(*) INTO v_rows FROM sms_conversation_context
   WHERE conversation_id = 'ab000000-0000-4000-8000-0000000000f1';
  ASSERT v_rows = 0,
    'FAIL 13a: studio A must read no backfilled context row at all, got ' || v_rows;

  -- 13b. And neither does studio B.
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000002');
  SELECT count(*) INTO v_rows FROM sms_conversation_context
   WHERE conversation_id = 'ab000000-0000-4000-8000-0000000000f1';
  ASSERT v_rows = 0,
    'FAIL 13b: studio B must read no backfilled context row at all, got ' || v_rows;

  -- 13c. Nor does studio A's co-member, who reaches A's rows by the 00584 path.
  PERFORM pg_temp.assume_user('ab000000-0000-4000-8000-000000000003');
  SELECT count(*) INTO v_rows FROM sms_conversation_context
   WHERE conversation_id = 'ab000000-0000-4000-8000-0000000000f1';
  ASSERT v_rows = 0,
    'FAIL 13c: studio A''s co-member must read no backfilled context row either, got ' || v_rows;
  PERFORM pg_temp.reset_role();

  -- 13d. Exactly ONE row exists for the conversation, it is the holding row, and
  -- it carries the legacy JSON byte for byte — nothing dropped, nothing split.
  SELECT count(*) INTO v_count FROM sms_conversation_context
   WHERE conversation_id = 'ab000000-0000-4000-8000-0000000000f1';
  ASSERT v_count = 1,
    'FAIL 13d: exactly one row — the holding row — must exist for the conversation, got ' || v_count;
  SELECT state_context INTO v_held FROM sms_conversation_context
   WHERE conversation_id = 'ab000000-0000-4000-8000-0000000000f1'
     AND project_id IS NULL AND party_id IS NULL;
  ASSERT v_held = v_legacy,
    'FAIL 13e: the holding row must carry the legacy state_context VERBATIM, got ' || COALESCE(v_held::text, '<null>');
  ASSERT (SELECT state FROM sms_conversation_context
           WHERE conversation_id = 'ab000000-0000-4000-8000-0000000000f1') = v_state,
    'FAIL 13f: the holding row keeps the conversation''s own state';

  -- 13g. The row an earlier 00639 wrote is GONE — convergence is a property of
  -- the data, not only of the DDL (SQ-30 R2).
  ASSERT NOT EXISTS (
    SELECT 1 FROM sms_conversation_context
     WHERE conversation_id = 'ab000000-0000-4000-8000-0000000000f1'
       AND project_id IS NOT NULL),
    'FAIL 13g: an attributed row stamped backfilled_at must be deleted, not kept or merged';

  -- 13h. Re-running writes no new row and REPLACES the held copy rather than
  -- preserving a stale one.
  SELECT count(*) INTO v_total FROM sms_conversation_context;
  PERFORM public.sms_backfill_conversation_context();
  SELECT count(*) INTO v_rows FROM sms_conversation_context;
  ASSERT v_rows = v_total,
    'FAIL 13h: the backfill must be idempotent, ' || v_total || ' -> ' || v_rows;
  SELECT state_context INTO v_held FROM sms_conversation_context
   WHERE conversation_id = 'ab000000-0000-4000-8000-0000000000f1' AND project_id IS NULL;
  ASSERT v_held = v_legacy,
    'FAIL 13i: a re-run must leave the held copy equal to the legacy JSON';
  UPDATE sms_conversation_context
     SET state_context = '{"stale": true}'::jsonb
   WHERE conversation_id = 'ab000000-0000-4000-8000-0000000000f1' AND project_id IS NULL;
  PERFORM public.sms_backfill_conversation_context();
  SELECT state_context INTO v_held FROM sms_conversation_context
   WHERE conversation_id = 'ab000000-0000-4000-8000-0000000000f1' AND project_id IS NULL;
  ASSERT v_held = v_legacy,
    'FAIL 13j: ON CONFLICT must REPLACE the held copy, not keep the old one';

  -- 13k. Live rail state is not legacy state: a row P0-06b writes carries no
  -- backfilled_at stamp and the backfill must never delete it.
  INSERT INTO sms_conversation_context
    (conversation_id, project_id, party_id, state, state_context)
  VALUES ('ab000000-0000-4000-8000-0000000000f1', 'ab000000-0000-4000-8000-0000000000a1',
          'ab000000-0000-4000-8000-0000000000b1', 'idle',
          '{"menu": [{"n": 1, "kind": "task", "title": "A: set guest bath tile"}]}'::jsonb);
  PERFORM public.sms_backfill_conversation_context();
  SELECT count(*) INTO v_count FROM sms_conversation_context
   WHERE conversation_id = 'ab000000-0000-4000-8000-0000000000f1'
     AND project_id = 'ab000000-0000-4000-8000-0000000000a1'
     AND backfilled_at IS NULL
     AND state_context -> 'menu' -> 0 ->> 'title' = 'A: set guest bath tile';
  ASSERT v_count = 1,
    'FAIL 13k: an unstamped attributed row is live state and must survive the backfill, got ' || v_count;

  RAISE NOTICE 'sms_tables: case 13 (backfill holds, attributes nothing, converges) passed.';
  RAISE NOTICE 'All sms_tables assertions passed (two studios, one handset).';
END
$$;

ROLLBACK TO SAVEPOINT sms_tables_test;
RELEASE SAVEPOINT sms_tables_test;
