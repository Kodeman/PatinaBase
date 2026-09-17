-- ═══════════════════════════════════════════════════════════════════════════
-- The Field Line · SQ-24 REVIEW PROBES, kept in the repo (00639)
--
-- The bound Codex review of this migration's first candidate
-- (2060c1320a388da3222ec13072a874537f545d61) reproduced three defects in
-- rolled-back local SQL. Each one is here, as the reviewer wrote it, so the
-- counterexample ships with the fix and a later change cannot quietly undo it:
--
--   F1  backfill leak      — studio A read studio B's chooser and the
--                            unresolved pending body/media out of the
--                            project-attributed sms_conversation_context row.
--   F2  suppression gate   — a record already sitting at granted /
--                            refusal_unanswered = false survived an arriving
--                            STOP, so the real send gate
--                            (_shared/sms.ts channelConsentVerdict :408-436,
--                            which reads the record and no helper) kept saying
--                            allow while the room said opted_out.
--   F3  ref retention      — deleting a party cascaded its prompt away and
--                            released a live `Ref 10` inside its 90-day window,
--                            so a late reply resolved another studio's prompt.
--
-- VERBATIM, with one mechanical adaptation, stated plainly: the reviewer had no
-- 00639 file to run, so the backfill probe INLINED the whole candidate migration
-- between its fixture and its assertion. Here the migration is applied by the
-- verify line that runs this file, so in its place the backfill's own entry
-- point — public.sms_backfill_conversation_context() — is called over the
-- fixture. Every fixture row, every probe statement and every assertion message
-- is the reviewer's own text, unchanged. Source:
-- /Users/kody/.claude/sidequest/projects/patina-merged-5f06cee3/verification/SQ-24/
--
-- How to run (after the migration, in the same transaction):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 -c "BEGIN" \
--     -f supabase/migrations/00639_field_line_authority.sql \
--     -f supabase/tests/field/sms_authority_review_probes_test.sql -c "ROLLBACK"
--
-- Each probe owns a SAVEPOINT, so the three fixtures do not see each other and
-- the schema under test is left standing for whatever runs next. Run on its
-- own, the BEGIN opens the transaction and closing the connection discards it.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '120s';

-- ═══════════════════════════════════════════════════════════════════════════
-- F1 · the backfill must not hand studio A studio B's chooser or the
--      unresolved text and media (verification/SQ-24/backfill-probe.log)
-- ═══════════════════════════════════════════════════════════════════════════
SAVEPOINT sq24_f1_backfill;


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


-- In the reviewer's run the candidate migration was inlined here, and its
-- backfill statement swept this fixture as a side effect of being applied. The
-- migration is applied by the verify line now, before this file, so the rule is
-- invoked directly over the fixture instead.
DO $$ BEGIN PERFORM public.sms_backfill_conversation_context(); END $$;

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"ab000000-0000-4000-8000-000000000001","role":"authenticated"}';
SELECT project_id, state_context FROM public.sms_conversation_context WHERE conversation_id='ab000000-0000-4000-8000-0000000000f1';
DO $$ BEGIN
ASSERT NOT EXISTS (SELECT 1 FROM public.sms_conversation_context WHERE conversation_id='ab000000-0000-4000-8000-0000000000f1' AND state_context ? 'pending_body'), 'REVIEW FAIL: A reads unresolved pending body/media and B chooser through backfilled context';
END $$;
RESET ROLE;
RESET request.jwt.claims;
ROLLBACK TO SAVEPOINT sq24_f1_backfill;
RELEASE SAVEPOINT sq24_f1_backfill;

-- ═══════════════════════════════════════════════════════════════════════════
-- F2 · an arriving suppression must beat a record that is already granted
--      (verification/SQ-24/suppression-probe.log)
-- ═══════════════════════════════════════════════════════════════════════════
SAVEPOINT sq24_f2_suppression;

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
INSERT INTO public.studio_channel_consent(organization_id,channel_kind,channel_value,status,refusal_unanswered,consented_at) VALUES ('5a000000-0000-4000-8000-0000000000d1','sms','+15557770000','granted',false,now());
INSERT INTO public.sms_suppressions(sender_number,recipient_phone,reason) VALUES ('+15550000000','+15557770000','carrier');
SELECT public.sms_is_suppressed('+15550000000','+15557770000') AS suppressed, public.channel_consent_status(organization_id,channel_kind,channel_value) AS room_verdict, status AS rail_status, refusal_unanswered AS rail_refusal FROM public.studio_channel_consent WHERE organization_id='5a000000-0000-4000-8000-0000000000d1' AND channel_value='+15557770000';
DO $$ BEGIN ASSERT NOT EXISTS(SELECT 1 FROM public.studio_channel_consent WHERE organization_id='5a000000-0000-4000-8000-0000000000d1' AND channel_value='+15557770000' AND status='granted' AND NOT refusal_unanswered), 'REVIEW FAIL: suppressed pair remains allow in channelConsentVerdict raw-record path'; END $$;
ROLLBACK TO SAVEPOINT sq24_f2_suppression;
RELEASE SAVEPOINT sq24_f2_suppression;

-- ═══════════════════════════════════════════════════════════════════════════
-- F3 · deleting the engagement must not release its ref inside 90 days
--      (verification/SQ-24/code-retention-probe.log)
-- ═══════════════════════════════════════════════════════════════════════════
SAVEPOINT sq24_f3_retention;

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
INSERT INTO public.sms_prompts (id,project_id,party_id,sender_number,recipient_phone,kind,short_code,answered_at) VALUES ('5a000000-0000-4000-8000-0000000000c1','5a000000-0000-4000-8000-0000000000a1','5a000000-0000-4000-8000-0000000000b1','+15550000000','+15557770000','mark_done','10',now());
DELETE FROM public.project_parties WHERE id='5a000000-0000-4000-8000-0000000000b1';
INSERT INTO public.sms_prompts (project_id,party_id,sender_number,recipient_phone,kind,short_code) VALUES ('5a000000-0000-4000-8000-0000000000a3','5a000000-0000-4000-8000-0000000000b3','+15550000000','+15557770000','mark_done',public.sms_next_short_code('+15550000000','+15557770000'));
SELECT project_id,party_id,short_code FROM public.sms_resolve_prompt('+15550000000','+15557770000','10');
DO $$ BEGIN ASSERT NOT EXISTS (SELECT 1 FROM public.sms_resolve_prompt('+15550000000','+15557770000','10')), 'REVIEW FAIL: deleting A party permits immediate ref reuse on B inside 90-day window'; END $$;
ROLLBACK TO SAVEPOINT sq24_f3_retention;
RELEASE SAVEPOINT sq24_f3_retention;

DO $$ BEGIN
  RAISE NOTICE 'sms_authority_review_probes: SQ-24 F1, F2 and F3 all pass against 00639.';
END $$;
