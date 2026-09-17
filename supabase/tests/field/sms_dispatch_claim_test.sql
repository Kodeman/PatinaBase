-- ═══════════════════════════════════════════════════════════════════════════
-- The Field Line · durable dispatch: the logical send claim, the recipe, and
-- provider-accepted-then-crash reconciliation (migration 00640, contract S5)
--
-- Covers:
--   1. The three new sms_messages columns exist and hold their shapes
--      (recipe jsonb, dedupe_key text, claimed_at timestamptz).
--   2. ONE LOGICAL SEND UNDER CONCURRENT CLAIMS. Two writers racing over one
--      fact — a 00284 row trigger and the field-daily cron — both try to take
--      (party, template, dedupe_key). The second loses with 23505 and sends
--      nothing. The insert IS the claim.
--   3. A different party, template or dedupe key is a different logical send.
--   4. The claim is held for the whole live life of the send: queued, sent,
--      delivered and DEFERRED all keep it.
--   5. A terminal FAILURE releases it — that is the one outcome for which
--      sending again is right.
--   6. dedupe_key NULL opts out: every send that existed before 00640 keeps its
--      old behaviour and never collides with another.
--   7. RECONCILIATION. A row the provider accepted carries its twilio_sid
--      BEFORE its status flips, so a crash in that window leaves it findable:
--      sms_reconcile_accepted_send() settles it from the sms-status callback's
--      MessageSid, is idempotent, and never walks back a terminal status a
--      delivery callback already recorded.
--   8. sms_release_stale_send_claims() releases the claims that never reached
--      the provider (no sid) and leaves the accepted ones alone.
--   9. PRIVILEGE LEVEL (contract S12), not only policy: anon and authenticated
--      hold no EXECUTE on the reconciliation doors, and an authenticated role
--      that tries one is refused 42501 by the grant, before any body runs.
--  10. THE DAY-EIGHT RE-INVITE. sms_prompts_open_optin_uniq (00639) keys on
--      (party_id, version) WHERE kind='optin' AND answered_at IS NULL, and
--      EXPIRY IS NOT IN THAT PREDICATE: a challenge that simply ran out still
--      holds its generation, so sms-dispatch must allocate the NEXT version
--      rather than version 1 again (SQ-37 R6).
--  11. A CLAIM NOBODY CAME BACK FOR IS A TEXT THAT WAS NEVER SENT (SQ-43 R1).
--      The sweep REQUEUES what can be rendered again — back to 'deferred',
--      where flushDeferredMessages looks, keeping its logical claim because it
--      is the same send resuming — and fails only what cannot, whose stored
--      body is an audit preview that must never reach a recipient.
--
-- How to run (from supabase/, so the \ir below resolves):
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f tests/field/sms_dispatch_claim_test.sql
--
-- Transaction-wrapped + ROLLBACK, and it DRY-APPLIES 00640 ITSELF. It has to:
-- every suite in this directory opens its own transaction and ends with its
-- own ROLLBACK, so a migration dry-applied by the caller in an enclosing
-- transaction does not survive the suite that ran before this one — the first
-- inner ROLLBACK ends the caller's transaction too, and this file then met an
-- sms_messages with no dedupe_key. Applying it here makes the suite hermetic
-- in either position and idempotent by construction (CREATE OR REPLACE, ADD
-- COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS, DROP FUNCTION IF EXISTS).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

\ir ../../migrations/00640_field_line_dispatch.sql

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('d0000000-0000-4000-8000-000000000001', 'd0-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES ('d0000000-0000-4000-8000-000000000001', 'd0-designer@test.invalid', 'D0 Designer', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO projects (id, name, designer_id, created_by)
VALUES ('d0000000-0000-4000-8000-0000000000a1', 'D0 Project', 'd0000000-0000-4000-8000-000000000001', 'd0000000-0000-4000-8000-000000000001');

INSERT INTO project_parties (id, project_id, party_kind, display_name, phone)
VALUES
  ('d0000000-0000-4000-8000-0000000000b1', 'd0000000-0000-4000-8000-0000000000a1', 'sub', 'Sal Sub', '5559990001'),
  ('d0000000-0000-4000-8000-0000000000b2', 'd0000000-0000-4000-8000-0000000000a1', 'gc',  'Gil GC',  '5559990002'),
  ('d0000000-0000-4000-8000-0000000000b3', 'd0000000-0000-4000-8000-0000000000a1', 'sub', 'Ada Abandoned', '5559990003');

INSERT INTO sms_conversations (id, twilio_number, phone_e164, party_id, active_project_id)
VALUES ('d0000000-0000-4000-8000-0000000000c1', '+15550000000', '+15559990001',
        'd0000000-0000-4000-8000-0000000000b1', 'd0000000-0000-4000-8000-0000000000a1');

-- A writer that takes the claim, exactly as _shared/sms.ts does: the row goes
-- in at 'claimed', BEFORE the provider is called.
CREATE OR REPLACE FUNCTION pg_temp.claim(
  p_party   UUID,
  p_tmpl    TEXT,
  p_dedupe  TEXT,
  p_status  TEXT DEFAULT 'claimed',
  p_sid     TEXT DEFAULT NULL,
  p_claimed TIMESTAMPTZ DEFAULT now()
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.sms_messages
    (conversation_id, direction, body, twilio_status, twilio_sid,
     party_id, project_id, template_key, dedupe_key, claimed_at, recipe)
  VALUES
    ('d0000000-0000-4000-8000-0000000000c1', 'outbound', 'preview', p_status, p_sid,
     p_party, 'd0000000-0000-4000-8000-0000000000a1', p_tmpl, p_dedupe, p_claimed,
     jsonb_build_object(
       'template_key', p_tmpl,
       'params',       jsonb_build_object('code', '17'),
       'party_id',     p_party,
       'project_id',   'd0000000-0000-4000-8000-0000000000a1',
       'link_kind',    'field'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ─── assertions ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_first   UUID;
  v_second  UUID;
  v_id      UUID;
  v_state   TEXT;
  v_code    TEXT;
  v_recipe  JSONB;
  v_flag    BOOLEAN;
  v_n       INTEGER;
  v_sqlstate TEXT;
BEGIN
  -- ── Case 1: the columns exist and hold their shapes ─────────────────────
  v_first := pg_temp.claim('d0000000-0000-4000-8000-0000000000b1', 'sms_court_assignment', 'court:visit-1');
  SELECT recipe, dedupe_key, claimed_at IS NOT NULL
    INTO v_recipe, v_code, v_state
    FROM public.sms_messages WHERE id = v_first;
  ASSERT v_recipe->>'template_key' = 'sms_court_assignment',
    'FAIL 1a: the recipe must name the template to render, got ' || COALESCE(v_recipe::text, 'NULL');
  ASSERT v_recipe->>'link_kind' = 'field',
    'FAIL 1b: the recipe names the link to mint, it does not carry one';
  ASSERT v_recipe->'params'->>'code' = '17', 'FAIL 1c: the recipe carries the caller''s params';
  ASSERT (v_recipe::text) NOT LIKE '%token%',
    'FAIL 1d: a recipe must never hold a raw token';
  ASSERT v_code = 'court:visit-1', 'FAIL 1e: dedupe_key must round-trip';
  ASSERT v_state = 'true', 'FAIL 1f: claimed_at must be stamped when the claim is taken';

  -- ── Case 2: one logical send under concurrent claims ────────────────────
  -- The second writer is the cron retrying behind the row trigger. It must
  -- lose the claim and send nothing.
  v_sqlstate := NULL;
  BEGIN
    v_second := pg_temp.claim('d0000000-0000-4000-8000-0000000000b1', 'sms_court_assignment', 'court:visit-1');
  EXCEPTION WHEN unique_violation THEN v_sqlstate := SQLSTATE;
  END;
  ASSERT v_sqlstate = '23505',
    'FAIL 2a: a concurrent claim on the same (party, template, dedupe key) must be refused, got ' ||
    COALESCE(v_sqlstate, 'no error');
  SELECT count(*) INTO v_n FROM public.sms_messages
   WHERE party_id = 'd0000000-0000-4000-8000-0000000000b1'
     AND template_key = 'sms_court_assignment' AND dedupe_key = 'court:visit-1';
  ASSERT v_n = 1, 'FAIL 2b: one logical send means one row, got ' || v_n;

  -- ── Case 3: a different party / template / key is a different send ──────
  PERFORM pg_temp.claim('d0000000-0000-4000-8000-0000000000b2', 'sms_court_assignment', 'court:visit-1');
  PERFORM pg_temp.claim('d0000000-0000-4000-8000-0000000000b1', 'sms_daily_digest',     'court:visit-1');
  PERFORM pg_temp.claim('d0000000-0000-4000-8000-0000000000b1', 'sms_court_assignment', 'court:visit-2');
  SELECT count(*) INTO v_n FROM public.sms_messages WHERE dedupe_key IS NOT NULL;
  ASSERT v_n = 4, 'FAIL 3: three distinct logical sends should stand beside the first, got ' || v_n;

  -- ── Case 4: the claim is held for the whole live life of the send ───────
  FOREACH v_state IN ARRAY ARRAY['queued', 'sent', 'delivered', 'dry_run', 'deferred'] LOOP
    UPDATE public.sms_messages SET twilio_status = v_state WHERE id = v_first;
    v_sqlstate := NULL;
    BEGIN
      PERFORM pg_temp.claim('d0000000-0000-4000-8000-0000000000b1', 'sms_court_assignment', 'court:visit-1');
    EXCEPTION WHEN unique_violation THEN v_sqlstate := SQLSTATE;
    END;
    ASSERT v_sqlstate = '23505',
      'FAIL 4 (' || v_state || '): a live send must keep its claim — a retry here is a second text';
  END LOOP;

  -- ── Case 5: a terminal failure releases the claim ───────────────────────
  FOREACH v_state IN ARRAY ARRAY['failed', 'undelivered', 'canceled', 'expired', 'suppressed'] LOOP
    UPDATE public.sms_messages SET twilio_status = v_state WHERE id = v_first;
    v_second := pg_temp.claim('d0000000-0000-4000-8000-0000000000b1', 'sms_court_assignment', 'court:visit-1');
    ASSERT v_second IS NOT NULL,
      'FAIL 5 (' || v_state || '): a released claim must be retakeable';
    DELETE FROM public.sms_messages WHERE id = v_second;
  END LOOP;
  UPDATE public.sms_messages SET twilio_status = 'delivered' WHERE id = v_first;

  -- ── Case 6: dedupe_key NULL opts out ────────────────────────────────────
  PERFORM pg_temp.claim('d0000000-0000-4000-8000-0000000000b2', 'sms_daily_digest', NULL);
  PERFORM pg_temp.claim('d0000000-0000-4000-8000-0000000000b2', 'sms_daily_digest', NULL);
  SELECT count(*) INTO v_n FROM public.sms_messages
   WHERE party_id = 'd0000000-0000-4000-8000-0000000000b2'
     AND template_key = 'sms_daily_digest' AND dedupe_key IS NULL;
  ASSERT v_n = 2,
    'FAIL 6: a send that names no dedupe key must behave exactly as it did before 00640, got ' || v_n;

  -- ── Case 7: provider-accepted-then-crash reconciliation ─────────────────
  -- The sender wrote the sid and then died. The row still reads 'claimed'; the
  -- sms-status callback carrying that MessageSid is what finds it.
  v_id := pg_temp.claim('d0000000-0000-4000-8000-0000000000b2', 'sms_optin_invite',
                        'optin:2026-09-17', 'claimed', 'SM_ACCEPTED_1');
  SELECT public.sms_reconcile_accepted_send('SM_ACCEPTED_1', 'accepted') INTO v_second;
  ASSERT v_second = v_id, 'FAIL 7a: the accepted send must reconcile by provider sid';
  SELECT twilio_status INTO v_state FROM public.sms_messages WHERE id = v_id;
  ASSERT v_state = 'accepted', 'FAIL 7b: the reconciled row must carry the provider status, got ' || v_state;

  -- Idempotent: nothing is open the second time.
  SELECT public.sms_reconcile_accepted_send('SM_ACCEPTED_1', 'accepted') INTO v_second;
  ASSERT v_second IS NULL, 'FAIL 7c: reconciling twice must be a no-op';

  -- And a terminal status a delivery callback already recorded is never walked
  -- back: only a row still reading 'claimed' is reconciled.
  UPDATE public.sms_messages SET twilio_status = 'delivered' WHERE id = v_id;
  SELECT public.sms_reconcile_accepted_send('SM_ACCEPTED_1', 'accepted') INTO v_second;
  SELECT twilio_status INTO v_state FROM public.sms_messages WHERE id = v_id;
  ASSERT v_second IS NULL AND v_state = 'delivered',
    'FAIL 7d: reconciliation must never overwrite a delivered row, got ' || v_state;

  -- An unknown sid reconciles nothing.
  SELECT public.sms_reconcile_accepted_send('SM_NEVER_SEEN') INTO v_second;
  ASSERT v_second IS NULL, 'FAIL 7e: an unknown provider sid must reconcile nothing';

  -- ── Case 8: stale claims that never reached the provider ────────────────
  -- No sid → nothing was accepted → the claim is released so the logical send
  -- can be tried again.
  v_id := pg_temp.claim('d0000000-0000-4000-8000-0000000000b2', 'sms_court_assignment',
                        'stale:1', 'claimed', NULL, now() - interval '1 hour');
  -- Accepted (has a sid) and fresh (claimed just now): neither may be released.
  PERFORM pg_temp.claim('d0000000-0000-4000-8000-0000000000b2', 'sms_court_assignment',
                        'stale:2', 'claimed', 'SM_ACCEPTED_2', now() - interval '1 hour');
  PERFORM pg_temp.claim('d0000000-0000-4000-8000-0000000000b2', 'sms_court_assignment',
                        'stale:3', 'claimed', NULL, now());

  SELECT public.sms_release_stale_send_claims(interval '15 minutes') INTO v_n;
  ASSERT v_n = 1, 'FAIL 8a: exactly the abandoned claim should be released, got ' || v_n;
  SELECT twilio_status, claimed_at IS NULL INTO v_state, v_flag
    FROM public.sms_messages WHERE id = v_id;
  ASSERT v_state = 'deferred' AND v_flag,
    'FAIL 8b: a renderable abandoned claim is QUEUED AGAIN, not failed — got ' ||
    v_state || ', claim stamp cleared = ' || v_flag;
  SELECT twilio_status INTO v_state FROM public.sms_messages WHERE twilio_sid = 'SM_ACCEPTED_2';
  ASSERT v_state = 'claimed',
    'FAIL 8c: a claim the provider ACCEPTED belongs to sms_reconcile_accepted_send, not the sweep';

  -- And it is the SAME send resuming, so it keeps the logical claim: a second
  -- writer on that key still loses. Requeued is not released.
  v_sqlstate := NULL;
  BEGIN
    PERFORM pg_temp.claim('d0000000-0000-4000-8000-0000000000b2', 'sms_court_assignment', 'stale:1');
  EXCEPTION WHEN unique_violation THEN v_sqlstate := SQLSTATE;
  END;
  ASSERT v_sqlstate = '23505',
    'FAIL 8d: a requeued send still holds its logical claim, got ' ||
    COALESCE(v_sqlstate, 'no error');

  RAISE NOTICE 'sms_dispatch_claim: cases 1–8 passed.';
END
$$;

-- ── Case 11: a claim nobody came back for is a text that was never SENT ────
-- (SQ-43 R1.) A sender that died between taking the claim and reaching the
-- provider left the row at 'claimed' with no provider id. Marking that 'failed'
-- recorded the wrong fact and ended the send: the trade was simply never
-- contacted, and the rail said it had tried. A row the flush can RENDER again
-- goes back to 'deferred' — where flushDeferredMessages looks — and a row it
-- cannot is still failed honestly, because its stored body is an audit preview
-- and putting that on the wire is the hazard contract S6 exists to stop.
DO $$
DECLARE
  v_id      UUID;
  v_state   TEXT;
  v_code    TEXT;
  v_flag    BOOLEAN;
  v_n       INTEGER;
  v_second  UUID;
BEGIN
  -- Renderable: a recipe with a template to render from.
  v_id := pg_temp.claim('d0000000-0000-4000-8000-0000000000b3', 'sms_daily_digest',
                        'abandoned:renderable', 'claimed', NULL, now() - interval '1 hour');

  -- Not renderable: no recipe at all, and a stored body that is the caller's
  -- AUDIT copy — the redacted preview, not the words that were meant to go out.
  INSERT INTO public.sms_messages
    (conversation_id, direction, body, twilio_status, twilio_sid,
     party_id, project_id, template_key, dedupe_key, claimed_at, recipe)
  VALUES
    ('d0000000-0000-4000-8000-0000000000c1', 'outbound',
     'Patina Site Request private link [redacted]', 'claimed', NULL,
     'd0000000-0000-4000-8000-0000000000b3', 'd0000000-0000-4000-8000-0000000000a1',
     NULL, 'abandoned:literal', now() - interval '1 hour', NULL)
  RETURNING id INTO v_second;

  SELECT public.sms_release_stale_send_claims(interval '15 minutes') INTO v_n;
  ASSERT v_n = 2, 'FAIL 11a: both abandoned claims should be released, got ' || v_n;

  SELECT twilio_status, claimed_at IS NULL, error_message INTO v_state, v_flag, v_code
    FROM public.sms_messages WHERE id = v_id;
  ASSERT v_state = 'deferred' AND v_flag,
    'FAIL 11b: a renderable abandoned claim is requeued for the flush, got ' ||
    v_state || ', claim stamp cleared = ' || v_flag;
  ASSERT v_code LIKE '%queued again%',
    'FAIL 11c: the row says what happened to it, got ' || COALESCE(v_code, 'NULL');

  SELECT twilio_status, error_code INTO v_state, v_code
    FROM public.sms_messages WHERE id = v_second;
  ASSERT v_state = 'failed' AND v_code = 'claim_abandoned',
    'FAIL 11d: a claim with nothing to render from is failed honestly, got ' ||
    v_state || '/' || COALESCE(v_code, 'NULL');

  -- Failing it RELEASES the logical claim: the caller may compose the send
  -- again, with the words it actually meant.
  ASSERT pg_temp.claim('d0000000-0000-4000-8000-0000000000b3', NULL,
                       'abandoned:literal') IS NOT NULL,
    'FAIL 11e: a failed claim must be retakeable';

  -- And nothing the sweep did may reach a row that is still somebody's: a
  -- claim taken a minute ago is a sender that is still working.
  PERFORM pg_temp.claim('d0000000-0000-4000-8000-0000000000b3', 'sms_court_assignment',
                        'abandoned:fresh', 'claimed', NULL, now());
  SELECT public.sms_release_stale_send_claims(interval '15 minutes') INTO v_n;
  ASSERT v_n = 0, 'FAIL 11f: a live claim is not abandoned, got ' || v_n;

  RAISE NOTICE 'sms_dispatch_claim: case 11 (abandoned claims resume) passed.';
END
$$;

-- ── Case 10: a challenge that expired UNANSWERED still holds its generation ─
-- sms-dispatch's open-prompt read deliberately excludes an expired prompt —
-- that exclusion is what makes a day-eight re-invite a NEW ask rather than a
-- reuse. The unique index it then has to get past does not make that
-- distinction: sms_prompts_open_optin_uniq is (party_id, version) WHERE
-- kind = 'optin' AND answered_at IS NULL, with no expiry term. Allocating
-- version 1 again therefore died on 23505, and the one person the double
-- opt-in exists for — the one who never answered — was never asked again.
DO $$
DECLARE
  v_open     INTEGER;
  v_version  INTEGER;
  v_code     TEXT;
  v_sqlstate TEXT;
BEGIN
  -- The first challenge, seven days ago. Never answered; it simply ran out.
  PERFORM public.sms_create_prompt(
    'd0000000-0000-4000-8000-0000000000b1', 'd0000000-0000-4000-8000-0000000000a1',
    'optin', 'd0000000-0000-4000-8000-0000000000b1', 1,
    now() - interval '1 day', '+15550000000', '+15559990001');

  -- What sms-dispatch asks before it allocates: is there an OPEN prompt to
  -- reuse? No — so this invite is a fresh ask and needs its own code.
  SELECT count(*) INTO v_open
    FROM public.sms_prompts
   WHERE party_id = 'd0000000-0000-4000-8000-0000000000b1'
     AND kind = 'optin' AND answered_at IS NULL AND expires_at > now();
  ASSERT v_open = 0,
    'FAIL 10a: an expired challenge is not an open prompt, got ' || v_open;

  -- And yet version 1 is still taken. This is the collision.
  v_sqlstate := NULL;
  BEGIN
    PERFORM public.sms_create_prompt(
      'd0000000-0000-4000-8000-0000000000b1', 'd0000000-0000-4000-8000-0000000000a1',
      'optin', 'd0000000-0000-4000-8000-0000000000b1', 1,
      now() + interval '7 days', '+15550000000', '+15559990001');
  EXCEPTION WHEN unique_violation THEN v_sqlstate := SQLSTATE;
  END;
  ASSERT v_sqlstate = '23505',
    'FAIL 10b: the expired unanswered row must still hold version 1, got ' ||
    COALESCE(v_sqlstate, 'no error');

  -- The allocation sms-dispatch makes instead: the next generation, read
  -- across the party's optin prompts in EVERY state — exactly the scope the
  -- index keys on.
  SELECT COALESCE(max(version), 0) + 1 INTO v_version
    FROM public.sms_prompts
   WHERE party_id = 'd0000000-0000-4000-8000-0000000000b1' AND kind = 'optin';
  ASSERT v_version = 2,
    'FAIL 10c: the next generation is 2, got ' || v_version;

  SELECT short_code INTO v_code FROM public.sms_create_prompt(
    'd0000000-0000-4000-8000-0000000000b1', 'd0000000-0000-4000-8000-0000000000a1',
    'optin', 'd0000000-0000-4000-8000-0000000000b1', v_version,
    now() + interval '7 days', '+15550000000', '+15559990001');
  ASSERT v_code IS NOT NULL AND v_code ~ '^[0-9]{2,3}$',
    'FAIL 10d: the day-eight re-invite must get its own Ref code, got ' ||
    COALESCE(v_code, 'NULL');

  SELECT count(*) INTO v_open
    FROM public.sms_prompts
   WHERE party_id = 'd0000000-0000-4000-8000-0000000000b1'
     AND kind = 'optin' AND answered_at IS NULL AND expires_at > now();
  ASSERT v_open = 1,
    'FAIL 10e: exactly one challenge stands open after the re-invite, got ' || v_open;

  RAISE NOTICE 'sms_dispatch_claim: case 10 (expired opt-in re-invite) passed.';
END
$$;

-- ── Case 9: privileges, not policies (contract S12) ────────────────────────
DO $$
DECLARE
  v_sqlstate TEXT;
BEGIN
  -- The reconciliation doors are the webhook's and the cron's, not a studio
  -- member's: a studio member asking them would be settling sends for handsets
  -- it has no relationship with.
  ASSERT NOT has_function_privilege('anon',
    'public.sms_reconcile_accepted_send(text,text,text,text)', 'EXECUTE'),
    'FAIL 9a: anon must hold no EXECUTE on sms_reconcile_accepted_send';
  ASSERT NOT has_function_privilege('authenticated',
    'public.sms_reconcile_accepted_send(text,text,text,text)', 'EXECUTE'),
    'FAIL 9b: authenticated must hold no EXECUTE on sms_reconcile_accepted_send';
  ASSERT has_function_privilege('service_role',
    'public.sms_reconcile_accepted_send(text,text,text,text)', 'EXECUTE'),
    'FAIL 9c: service_role must be able to reconcile';
  ASSERT NOT has_function_privilege('anon',
    'public.sms_release_stale_send_claims(interval)', 'EXECUTE'),
    'FAIL 9d: anon must hold no EXECUTE on sms_release_stale_send_claims';
  ASSERT NOT has_function_privilege('authenticated',
    'public.sms_release_stale_send_claims(interval)', 'EXECUTE'),
    'FAIL 9e: authenticated must hold no EXECUTE on sms_release_stale_send_claims';
  ASSERT has_function_privilege('service_role',
    'public.sms_release_stale_send_claims(interval)', 'EXECUTE'),
    'FAIL 9f: service_role must be able to sweep abandoned claims';

  -- The mint and the revoke-all stay a designer's doors (00284's guard decides
  -- WHICH seats), and anon holds neither.
  ASSERT has_function_privilege('authenticated',
    'public.create_field_link(uuid,timestamptz,boolean)', 'EXECUTE'),
    'FAIL 9g: the designer must still be able to mint';
  ASSERT NOT has_function_privilege('anon',
    'public.create_field_link(uuid,timestamptz,boolean)', 'EXECUTE'),
    'FAIL 9h: anon must hold no EXECUTE on the mint';
  ASSERT has_function_privilege('authenticated',
    'public.revoke_party_field_links(uuid)', 'EXECUTE'),
    'FAIL 9i: the designer must be able to revoke every link at once';
  ASSERT NOT has_function_privilege('anon',
    'public.revoke_party_field_links(uuid)', 'EXECUTE'),
    'FAIL 9j: anon must hold no EXECUTE on revoke_party_field_links';

  -- And the grant is what refuses, before any body runs — asserted by asking
  -- as the role rather than about it.
  SET LOCAL ROLE authenticated;
  v_sqlstate := NULL;
  BEGIN
    PERFORM public.sms_reconcile_accepted_send('SM_ACCEPTED_1');
  EXCEPTION WHEN OTHERS THEN v_sqlstate := SQLSTATE;
  END;
  RESET ROLE;
  ASSERT v_sqlstate = '42501',
    'FAIL 9k: an authenticated caller must be refused at the privilege level, got ' ||
    COALESCE(v_sqlstate, 'no error');

  RAISE NOTICE 'sms_dispatch_claim: case 9 (privileges) passed.';
  RAISE NOTICE 'All sms_dispatch_claim assertions passed.';
END
$$;

ROLLBACK;
