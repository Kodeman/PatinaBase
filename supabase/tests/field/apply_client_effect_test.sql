-- ═══════════════════════════════════════════════════════════════════════════
-- apply_client_effect — what a homeowner with a capability and no session may
-- decide by text (migration 00651, The Field Line Phase 2, US-3 P23)
--
-- Covers:
--   1. No capability at all → refused, nothing written.
--   2. A capability whose scope names ANOTHER house → refused.
--   3. A revoked capability and an expired one → both refused.
--   4. A LIVE capability whose invitation was superseded → refused
--      (SQ-108 INFO-2: resolve_client_link validates the token, not the letter).
--   5. A reply pinned to a version the batch has moved past → refused,
--      the batch stays open, every decision stays pending, the prompt stays
--      answerable.
--   6. The version bumps: an option edit inside a presented decision bumps
--      every OPEN batch naming it; changing the presented set bumps; a CLOSED
--      batch is left alone.
--   7. approve_selection applies EVERY decision in the batch and names the
--      party — not a forged auth user — in the audit row.
--   8. Replay by source SID applies once and returns the same result.
--   9. select_window writes availability ONLY: one delivery_availability row,
--      no trigger on that table at all, and not one row moved in any delivery,
--      purchase-order, contract, payment, signature or FF&E table.
--  10. A voided prompt, an answered prompt, and an effect that answers another
--      kind of ask → all refused.
--  11. One OPEN batch per party per local day.
--  12. Authorization: service_role only on the function, studio-read /
--      service-write on both tables, anon nothing.
--  13. (00652 LOW-1/LOW-5) The generation moves when the presented set moves,
--      whatever the same statement wrote; it never moves DOWN; and a closed
--      batch cannot be reopened.
--  14. (00652 LOW-3) A decision belonging to another household than the letter
--      → refused, nothing written — including the half-set case that plain
--      inequality would have admitted.
--  15. (00652 LOW-6) The capability's two copies of the project must AGREE:
--      diverge either one and the door is shut.
--
-- How to run (P26 — a disposable TEMPLATE template0 clone, NEVER the shared
-- stack, and never `supabase db reset`):
--   psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/field/apply_client_effect_test.sql
--
-- Transaction-wrapped + ROLLBACK. Fixture writes run as `postgres` with no JWT
-- claim, which is the maintenance arm of the client_decision authority guards
-- (00399/00464); the one case that needs a real end user assumes the role the
-- way field_links_test.sql does, and resets it before the next case.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('c1700000-0000-4000-8000-000000000001', 'c17-designer@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('c1700000-0000-4000-8000-000000000002', 'c17-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('c1700000-0000-4000-8000-000000000001', 'c17-designer@test.invalid', 'C17 Designer', NOW(), NOW()),
  ('c1700000-0000-4000-8000-000000000002', 'c17-outsider@test.invalid', 'C17 Outsider', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug, status)
VALUES ('c1700000-0000-4000-8000-0000000000f1', 'design_studio', 'C17 Studio', 'c17-studio', 'active');

INSERT INTO organization_members (user_id, organization_id, role, status)
VALUES ('c1700000-0000-4000-8000-000000000001', 'c1700000-0000-4000-8000-0000000000f1', 'owner', 'active');

INSERT INTO designer_clients (id, designer_id, client_name, status)
VALUES ('c1700000-0000-4000-8000-0000000000c1', 'c1700000-0000-4000-8000-000000000001', 'C17 Household', 'active');

-- Two houses. A capability minted on one must never decide anything on the other.
INSERT INTO projects (id, name, designer_id, created_by)
VALUES
  ('c1700000-0000-4000-8000-0000000000a1', 'C17 House One', 'c1700000-0000-4000-8000-000000000001', 'c1700000-0000-4000-8000-000000000001'),
  ('c1700000-0000-4000-8000-0000000000a2', 'C17 House Two', 'c1700000-0000-4000-8000-000000000001', 'c1700000-0000-4000-8000-000000000001');

-- The homeowner's seat on each house, each on its own number.
INSERT INTO project_parties (id, project_id, party_kind, display_name, phone)
VALUES
  ('c1700000-0000-4000-8000-0000000000b1', 'c1700000-0000-4000-8000-0000000000a1', 'client', 'Dana Homeowner', '5551230000'),
  ('c1700000-0000-4000-8000-0000000000b2', 'c1700000-0000-4000-8000-0000000000a2', 'client', 'Dana Elsewhere', '5551230002');

-- The letters. Phone-only, so neither recipient has or will get an auth user.
INSERT INTO client_invitations (id, token, email, phone, designer_id, designer_client_id, project_id, kind)
VALUES
  ('c1700000-0000-4000-8000-000000000011', 'c17-token-house-one', NULL, '5551230000',
   'c1700000-0000-4000-8000-000000000001', 'c1700000-0000-4000-8000-0000000000c1',
   'c1700000-0000-4000-8000-0000000000a1', 'invite'),
  ('c1700000-0000-4000-8000-000000000012', 'c17-token-house-two', NULL, '5551230002',
   'c1700000-0000-4000-8000-000000000001', 'c1700000-0000-4000-8000-0000000000c1',
   'c1700000-0000-4000-8000-0000000000a2', 'invite');

-- ─── helpers ───────────────────────────────────────────────────────────────

-- One ask on one handset. Short codes are unique per (sender, recipient) while
-- reserved, so every prompt to the same number gets its own code.
-- expires_at is part of the IMMUTABLE prompt binding (00639's
-- sms_prompts_guard_binding), so an already-expired ask has to be born that
-- way rather than aged afterwards.
CREATE FUNCTION pg_temp.ask(
  p_code text, p_kind text, p_project uuid, p_party uuid, p_recipient text,
  p_subject uuid, p_version integer DEFAULT 1, p_expires timestamptz DEFAULT NULL
) RETURNS public.sms_prompts LANGUAGE sql AS $$
  INSERT INTO public.sms_prompts (project_id, party_id, sender_number,
    recipient_phone, kind, subject_id, version, short_code, expires_at)
  VALUES (p_project, p_party, '+15555129999', p_recipient, p_kind, p_subject,
          p_version, p_code,
          COALESCE(p_expires, clock_timestamp() + interval '3 days'))
  RETURNING *;
$$;

-- One client-court selection decision with a recommended option and a rival.
CREATE FUNCTION pg_temp.present(
  p_id uuid, p_project uuid, p_title text, p_recommended uuid, p_rival uuid
) RETURNS uuid LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.client_decisions (id, designer_client_id, designer_id,
    project_id, title, status, coordination_kind, court)
  VALUES (p_id, 'c1700000-0000-4000-8000-0000000000c1',
          'c1700000-0000-4000-8000-000000000001', p_project, p_title,
          'pending', 'selection', 'client');
  INSERT INTO public.client_decision_options (id, decision_id, name,
    is_recommended, sort_order)
  VALUES (p_recommended, p_id, p_title || ' — recommended', true, 0),
         (p_rival,       p_id, p_title || ' — alternative', false, 1);
  RETURN p_id;
END;
$$;

-- Every ledger a text must NEVER reach. Counted before and after select_window.
CREATE FUNCTION pg_temp.untouched() RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE t text; n bigint; acc jsonb := '{}'::jsonb;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'purchase_orders', 'purchase_order_changes', 'po_payments',
    'field_delivery_reports', 'invoices', 'invoice_payments',
    'invoice_line_items', 'commercial_document_signatures',
    'studio_trade_agreement_signatures', 'site_deliverables',
    'project_payment_milestones', 'decision_overrides', 'project_ffe_items',
    'client_decisions', 'client_decision_options'
  ] LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
    acc := acc || jsonb_build_object(t, n);
  END LOOP;
  RETURN acc;
END;
$$;

CREATE FUNCTION pg_temp.batch_version(p_id uuid) RETURNS integer LANGUAGE sql AS $$
  SELECT version FROM public.client_decision_batches WHERE id = p_id;
$$;

CREATE FUNCTION pg_temp.assume_user_role(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.assume_user_role(UUID) TO PUBLIC;

CREATE FUNCTION pg_temp.reset_role() RETURNS VOID AS $$
BEGIN
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', NULL, true);
END;
$$ LANGUAGE plpgsql;
GRANT EXECUTE ON FUNCTION pg_temp.reset_role() TO PUBLIC;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 1 — no capability authorizes anything
-- ═══════════════════════════════════════════════════════════════════════════
DO $case1$
DECLARE
  d1 uuid := pg_temp.present('c1700000-0000-4000-8000-000000000d11',
    'c1700000-0000-4000-8000-0000000000a1', 'Oak or walnut top',
    'c1700000-0000-4000-8000-000000000e11', 'c1700000-0000-4000-8000-000000000e12');
  b1 uuid := 'c1700000-0000-4000-8000-0000000000f5';
  p  public.sms_prompts;
  msg text;
BEGIN
  INSERT INTO public.client_decision_batches (id, project_id, party_id,
    decision_ids, presented_local_day)
  VALUES (b1, 'c1700000-0000-4000-8000-0000000000a1',
          'c1700000-0000-4000-8000-0000000000b1', ARRAY[d1],
          CURRENT_DATE);

  p := pg_temp.ask('11', 'selection_batch',
    'c1700000-0000-4000-8000-0000000000a1', 'c1700000-0000-4000-8000-0000000000b1',
    '+15551230000', b1);

  BEGIN
    PERFORM public.apply_client_effect(p.id, 'approve_selection',
      jsonb_build_object('version', 1), 'SM-c17-no-cap');
    ASSERT false, 'FAIL 1a: an approval with no capability must be refused';
  EXCEPTION WHEN insufficient_privilege THEN
    msg := SQLERRM;
  END;
  ASSERT msg LIKE '%no_capability%',
    'FAIL 1b: the refusal must name no_capability, got: ' || msg;

  ASSERT (SELECT status FROM public.client_decisions WHERE id = d1) = 'pending',
    'FAIL 1c: a refused approval must leave the decision pending';
  ASSERT (SELECT closed_at FROM public.client_decision_batches WHERE id = b1) IS NULL,
    'FAIL 1d: a refused approval must leave the batch open';
  ASSERT (SELECT answered_at FROM public.sms_prompts WHERE id = p.id) IS NULL,
    'FAIL 1e: a refused approval must leave the prompt answerable';
  ASSERT NOT EXISTS (SELECT 1 FROM public.client_link_uses),
    'FAIL 1f: a refused approval must write no capability-use row';

  RAISE NOTICE 'apply_client_effect: case 1 (no capability) passed.';
END
$case1$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 2 — a capability that speaks for another house
-- ═══════════════════════════════════════════════════════════════════════════
-- Written by hand rather than minted, precisely because create_client_link
-- cannot produce it: the point is that apply_client_effect re-derives the
-- project from the SCOPE and the prompt instead of trusting the pairing.
DO $case2$
DECLARE
  p   public.sms_prompts := (SELECT ROW(sp.*)::public.sms_prompts
                               FROM public.sms_prompts sp WHERE sp.short_code = '11');
  msg text;
BEGIN
  INSERT INTO public.client_links (id, invitation_id, project_id, party_id,
    token_hash, scope, status, expires_at)
  VALUES ('c1700000-0000-4000-8000-000000000201',
          'c1700000-0000-4000-8000-000000000011',
          'c1700000-0000-4000-8000-0000000000a2',
          'c1700000-0000-4000-8000-0000000000b1',
          repeat('a', 64),
          jsonb_build_object(
            'project_id', 'c1700000-0000-4000-8000-0000000000a2',
            'party_id',   'c1700000-0000-4000-8000-0000000000b1',
            'invitation_id', 'c1700000-0000-4000-8000-000000000011',
            'actions', jsonb_build_array('approve_selection', 'select_window')),
          'active', now() + interval '30 days');

  BEGIN
    PERFORM public.apply_client_effect(p.id, 'approve_selection',
      jsonb_build_object('version', 1), 'SM-c17-wrong-project');
    ASSERT false, 'FAIL 2a: a capability scoped to another house must be refused';
  EXCEPTION WHEN insufficient_privilege THEN
    msg := SQLERRM;
  END;
  ASSERT msg LIKE '%capability_wrong_project%',
    'FAIL 2b: the refusal must name capability_wrong_project, got: ' || msg;

  ASSERT (SELECT status FROM public.client_decisions
           WHERE id = 'c1700000-0000-4000-8000-000000000d11') = 'pending',
    'FAIL 2c: nothing may be applied through an out-of-scope capability';
  ASSERT NOT EXISTS (SELECT 1 FROM public.client_link_uses),
    'FAIL 2d: an out-of-scope capability leaves no use row';

  -- Retire it so it cannot satisfy a later case.
  UPDATE public.client_links SET status = 'revoked'
   WHERE id = 'c1700000-0000-4000-8000-000000000201';

  RAISE NOTICE 'apply_client_effect: case 2 (wrong project) passed.';
END
$case2$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 3 — revoked, then expired
-- ═══════════════════════════════════════════════════════════════════════════
DO $case3$
DECLARE
  p    public.sms_prompts := (SELECT ROW(sp.*)::public.sms_prompts
                                FROM public.sms_prompts sp WHERE sp.short_code = '11');
  link uuid;
  msg  text;
BEGIN
  -- 3a. A LIVE capability that does not name the ACTION is no capability for
  -- it. Tested first, while no capability naming approve_selection has ever
  -- existed for this seat, so the answer can only be no_capability.
  SELECT id INTO link FROM public.create_client_link(
    'c1700000-0000-4000-8000-000000000011',
    ARRAY['open_letter']::text[], interval '90 days');
  ASSERT (SELECT party_id FROM public.client_links WHERE id = link)
         = 'c1700000-0000-4000-8000-0000000000b1',
    'FAIL 3a: the mint must resolve the homeowner''s seat on house one';
  BEGIN
    PERFORM public.apply_client_effect(p.id, 'approve_selection',
      jsonb_build_object('version', 1), 'SM-c17-no-action');
    ASSERT false, 'FAIL 3b: a capability that does not name the action must be refused';
  EXCEPTION WHEN insufficient_privilege THEN
    msg := SQLERRM;
  END;
  ASSERT msg LIKE '%no_capability%',
    'FAIL 3c: a letter-only capability authorizes no approval, got: ' || msg;

  -- 3b. Revoked. (The mint supersedes the letter-only link above, so the only
  -- row naming approve_selection from here on is the one under test.)
  SELECT id INTO link FROM public.create_client_link(
    'c1700000-0000-4000-8000-000000000011',
    ARRAY['open_letter', 'approve_selection', 'select_window']::text[],
    interval '90 days');
  PERFORM public.revoke_client_link(link);
  msg := NULL;
  BEGIN
    PERFORM public.apply_client_effect(p.id, 'approve_selection',
      jsonb_build_object('version', 1), 'SM-c17-revoked');
    ASSERT false, 'FAIL 3d: a revoked capability must be refused';
  EXCEPTION WHEN insufficient_privilege THEN
    msg := SQLERRM;
  END;
  ASSERT msg LIKE '%capability_expired_or_revoked%',
    'FAIL 3e: the refusal must name capability_expired_or_revoked, got: ' || msg;

  -- 3c. A fresh mint, then time runs out on it.
  SELECT id INTO link FROM public.create_client_link(
    'c1700000-0000-4000-8000-000000000011',
    ARRAY['open_letter', 'approve_selection', 'select_window']::text[],
    interval '90 days');
  UPDATE public.client_links SET expires_at = now() - interval '1 day'
   WHERE id = link;
  msg := NULL;
  BEGIN
    PERFORM public.apply_client_effect(p.id, 'approve_selection',
      jsonb_build_object('version', 1), 'SM-c17-expired');
    ASSERT false, 'FAIL 3f: an expired capability must be refused';
  EXCEPTION WHEN insufficient_privilege THEN
    msg := SQLERRM;
  END;
  ASSERT msg LIKE '%capability_expired_or_revoked%',
    'FAIL 3g: an expired capability must be refused by the same rule, got: ' || msg;

  ASSERT (SELECT status FROM public.client_decisions
           WHERE id = 'c1700000-0000-4000-8000-000000000d11') = 'pending',
    'FAIL 3h: three refusals in a row must still have applied nothing';
  ASSERT NOT EXISTS (SELECT 1 FROM public.client_link_uses),
    'FAIL 3i: no refusal writes a capability-use row';

  RAISE NOTICE 'apply_client_effect: case 3 (dead capabilities) passed.';
END
$case3$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 4 — the letter behind a LIVE capability was superseded (SQ-108 INFO-2)
-- ═══════════════════════════════════════════════════════════════════════════
DO $case4$
DECLARE
  d2   uuid := pg_temp.present('c1700000-0000-4000-8000-000000000d21',
    'c1700000-0000-4000-8000-0000000000a2', 'Brass or nickel pulls',
    'c1700000-0000-4000-8000-000000000e21', 'c1700000-0000-4000-8000-000000000e22');
  b2   uuid := 'c1700000-0000-4000-8000-0000000000f6';
  p    public.sms_prompts;
  link uuid;
  msg  text;
BEGIN
  INSERT INTO public.client_decision_batches (id, project_id, party_id,
    decision_ids, presented_local_day)
  VALUES (b2, 'c1700000-0000-4000-8000-0000000000a2',
          'c1700000-0000-4000-8000-0000000000b2', ARRAY[d2], CURRENT_DATE);

  SELECT id INTO link FROM public.create_client_link(
    'c1700000-0000-4000-8000-000000000012',
    ARRAY['open_letter', 'approve_selection', 'select_window']::text[],
    interval '90 days');
  ASSERT (SELECT status FROM public.client_links WHERE id = link) = 'active',
    'FAIL 4a: the capability under test must be LIVE';

  -- The studio sends a replacement letter. Nobody revoked the token.
  UPDATE public.client_invitations
     SET superseded_by = 'c1700000-0000-4000-8000-000000000011'
   WHERE id = 'c1700000-0000-4000-8000-000000000012';

  p := pg_temp.ask('21', 'selection_batch',
    'c1700000-0000-4000-8000-0000000000a2', 'c1700000-0000-4000-8000-0000000000b2',
    '+15551230002', b2);

  BEGIN
    PERFORM public.apply_client_effect(p.id, 'approve_selection',
      jsonb_build_object('version', 1), 'SM-c17-superseded');
    ASSERT false, 'FAIL 4b: a superseded letter must not decide anything';
  EXCEPTION WHEN insufficient_privilege THEN
    msg := SQLERRM;
  END;
  ASSERT msg LIKE '%letter_revoked%',
    'FAIL 4c: the refusal must name letter_revoked, got: ' || msg;

  ASSERT (SELECT status FROM public.client_decisions WHERE id = d2) = 'pending',
    'FAIL 4d: nothing may be applied behind a superseded letter';
  ASSERT (SELECT closed_at FROM public.client_decision_batches WHERE id = b2) IS NULL,
    'FAIL 4e: the batch stays open';
  ASSERT NOT EXISTS (SELECT 1 FROM public.decision_events
                      WHERE decision_id = d2 AND actor_party_id IS NOT NULL),
    'FAIL 4f: no party may be audited as having answered';
  ASSERT NOT EXISTS (SELECT 1 FROM public.client_link_uses WHERE link_id = link),
    'FAIL 4g: the use row is written only after the letter check passes';

  -- Same story for a REVOKED letter.
  UPDATE public.client_invitations
     SET superseded_by = NULL, revoked_at = now()
   WHERE id = 'c1700000-0000-4000-8000-000000000012';
  msg := NULL;
  BEGIN
    PERFORM public.apply_client_effect(p.id, 'approve_selection',
      jsonb_build_object('version', 1), 'SM-c17-letter-revoked');
    ASSERT false, 'FAIL 4h: a revoked letter must not decide anything';
  EXCEPTION WHEN insufficient_privilege THEN
    msg := SQLERRM;
  END;
  ASSERT msg LIKE '%letter_revoked%',
    'FAIL 4i: a revoked letter is refused by the same rule, got: ' || msg;
  ASSERT (SELECT status FROM public.client_decisions WHERE id = d2) = 'pending',
    'FAIL 4j: still nothing applied';

  RAISE NOTICE 'apply_client_effect: case 4 (revoked/superseded letter) passed.';
END
$case4$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 5 — a stale version refuses and applies nothing
-- ═══════════════════════════════════════════════════════════════════════════
-- The batch for the happy path. The decisions and their options are built
-- FIRST and the batch second, so the batch is presented at version 1 — an
-- option written after a batch exists is itself a change to the ask (case 6).
DO $case5$
DECLARE
  d_a  uuid := pg_temp.present('c1700000-0000-4000-8000-000000000d31',
    'c1700000-0000-4000-8000-0000000000a1', 'Rug for the study',
    'c1700000-0000-4000-8000-000000000e31', 'c1700000-0000-4000-8000-000000000e32');
  d_b  uuid := pg_temp.present('c1700000-0000-4000-8000-000000000d32',
    'c1700000-0000-4000-8000-0000000000a1', 'Reading lamp',
    'c1700000-0000-4000-8000-000000000e33', 'c1700000-0000-4000-8000-000000000e34');
  b3   uuid := 'c1700000-0000-4000-8000-0000000000f7';
  p    public.sms_prompts;
  link uuid;
  r    jsonb;
BEGIN
  -- Close case 1's batch: one OPEN batch per party per local day (case 11).
  UPDATE public.client_decision_batches SET closed_at = now()
   WHERE id = 'c1700000-0000-4000-8000-0000000000f5';

  INSERT INTO public.client_decision_batches (id, project_id, party_id,
    decision_ids, presented_local_day)
  VALUES (b3, 'c1700000-0000-4000-8000-0000000000a1',
          'c1700000-0000-4000-8000-0000000000b1', ARRAY[d_a, d_b], CURRENT_DATE);
  ASSERT pg_temp.batch_version(b3) = 1,
    'FAIL 5a: a batch presented after its options is at version 1, got '
      || pg_temp.batch_version(b3);

  -- The live capability the rest of the test uses. Supersedes case 3's mints.
  SELECT id INTO link FROM public.create_client_link(
    'c1700000-0000-4000-8000-000000000011',
    ARRAY['open_letter', 'approve_selection', 'select_window']::text[],
    interval '90 days');

  p := pg_temp.ask('31', 'selection_batch',
    'c1700000-0000-4000-8000-0000000000a1', 'c1700000-0000-4000-8000-0000000000b1',
    '+15551230000', b3);

  r := public.apply_client_effect(p.id, 'approve_selection',
    jsonb_build_object('version', 0), 'SM-c17-stale');
  ASSERT r->>'status' = 'stale_version',
    'FAIL 5b: a reply pinned to another version must answer stale_version, got '
      || COALESCE(r->>'status', '<null>');
  ASSERT (r#>>'{result,current_version}') = '1',
    'FAIL 5c: the refusal must name the version the batch is actually at';

  ASSERT (SELECT status FROM public.client_decisions WHERE id = d_a) = 'pending'
     AND (SELECT status FROM public.client_decisions WHERE id = d_b) = 'pending',
    'FAIL 5d: a stale reply applies NOTHING';
  ASSERT (SELECT closed_at FROM public.client_decision_batches WHERE id = b3) IS NULL,
    'FAIL 5e: a stale reply leaves the batch open so the rail can re-present it';
  ASSERT (SELECT answered_at FROM public.sms_prompts WHERE id = p.id) IS NULL
     AND (SELECT consumed_sid FROM public.sms_prompts WHERE id = p.id) IS NULL,
    'FAIL 5f: a stale reply mints no receipt and leaves the ask answerable';
  ASSERT NOT EXISTS (SELECT 1 FROM public.client_decision_options
                      WHERE decision_id IN (d_a, d_b) AND selected),
    'FAIL 5g: no option may be selected by a stale reply';

  -- A payload with no version at all is not a pinned reply.
  BEGIN
    PERFORM public.apply_client_effect(p.id, 'approve_selection',
      '{}'::jsonb, 'SM-c17-noversion');
    ASSERT false, 'FAIL 5h: approve_selection without payload.version must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  RAISE NOTICE 'apply_client_effect: case 5 (stale version) passed.';
END
$case5$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 6 — the version moves when what was presented moves
-- ═══════════════════════════════════════════════════════════════════════════
DO $case6$
DECLARE
  b3  uuid := 'c1700000-0000-4000-8000-0000000000f7';
  d_a uuid := 'c1700000-0000-4000-8000-000000000d31';
  d_b uuid := 'c1700000-0000-4000-8000-000000000d32';
  v0  integer := pg_temp.batch_version(b3);
BEGIN
  -- 6a: renaming the recommended option renames what she was shown.
  UPDATE public.client_decision_options SET name = 'Rug for the study — Kilim'
   WHERE id = 'c1700000-0000-4000-8000-000000000e31';
  ASSERT pg_temp.batch_version(b3) = v0 + 1,
    'FAIL 6a: an edit to a presented option must bump the batch version ('
      || v0 || ' -> ' || pg_temp.batch_version(b3) || ')';

  -- 6b: so does adding a rival she never saw.
  INSERT INTO public.client_decision_options (id, decision_id, name,
    is_recommended, sort_order)
  VALUES ('c1700000-0000-4000-8000-000000000e35', d_b,
          'Reading lamp — third way', false, 2);
  ASSERT pg_temp.batch_version(b3) = v0 + 2,
    'FAIL 6b: a new option on a presented decision must bump the version';

  -- 6c: and deleting one.
  DELETE FROM public.client_decision_options
   WHERE id = 'c1700000-0000-4000-8000-000000000e35';
  ASSERT pg_temp.batch_version(b3) = v0 + 3,
    'FAIL 6c: deleting an option must bump the version';

  -- 6d: an option on a decision NOT in the batch moves nothing.
  UPDATE public.client_decision_options SET name = 'Brass — matte'
   WHERE id = 'c1700000-0000-4000-8000-000000000e21';
  ASSERT pg_temp.batch_version(b3) = v0 + 3,
    'FAIL 6d: an option outside the batch must not bump its version';

  -- 6e: changing the presented set itself.
  UPDATE public.client_decision_batches SET decision_ids = ARRAY[d_a]
   WHERE id = b3;
  ASSERT pg_temp.batch_version(b3) = v0 + 4,
    'FAIL 6e: changing the presented set must bump the version';
  UPDATE public.client_decision_batches SET decision_ids = ARRAY[d_a, d_b]
   WHERE id = b3;
  ASSERT pg_temp.batch_version(b3) = v0 + 5,
    'FAIL 6f: putting a decision back is another change to the ask';

  -- 6g: a CLOSED batch is finished; option churn no longer moves it.
  UPDATE public.client_decision_options SET name = 'Kilim, again'
   WHERE id = 'c1700000-0000-4000-8000-000000000e31';
  ASSERT pg_temp.batch_version('c1700000-0000-4000-8000-0000000000f5') = 1,
    'FAIL 6g: a closed batch must not be re-versioned by option edits';

  RAISE NOTICE 'apply_client_effect: case 6 (version bumps) passed.';
END
$case6$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 7 — approve_selection applies EVERY decision and names the party
-- ═══════════════════════════════════════════════════════════════════════════
DO $case7$
DECLARE
  b3   uuid := 'c1700000-0000-4000-8000-0000000000f7';
  d_a  uuid := 'c1700000-0000-4000-8000-000000000d31';
  d_b  uuid := 'c1700000-0000-4000-8000-000000000d32';
  p    public.sms_prompts := (SELECT ROW(sp.*)::public.sms_prompts
                                FROM public.sms_prompts sp WHERE sp.short_code = '31');
  v    integer := pg_temp.batch_version(b3);
  r    jsonb;
BEGIN
  r := public.apply_client_effect(p.id, 'approve_selection',
    jsonb_build_object('version', v), 'SM-c17-approve');

  ASSERT r->>'status' = 'applied',
    'FAIL 7a: the pinned version must apply, got ' || COALESCE(r->>'status', '<null>');
  ASSERT (r#>>'{result,kind}') = 'effect',
    'FAIL 7b: the receipt must be a {kind:effect,result:…} the prompt can hold';
  ASSERT (r#>>'{result,result,decision_count}') = '2',
    'FAIL 7c: both presented decisions must be reported applied, got '
      || COALESCE(r#>>'{result,result,decision_count}', '<null>');

  -- Every decision in the batch, applied.
  ASSERT (SELECT status FROM public.client_decisions WHERE id = d_a) = 'responded'
     AND (SELECT status FROM public.client_decisions WHERE id = d_b) = 'responded',
    'FAIL 7d: EVERY decision in the batch must be applied';
  ASSERT (SELECT selected FROM public.client_decision_options
           WHERE id = 'c1700000-0000-4000-8000-000000000e31') IS TRUE
     AND (SELECT selected FROM public.client_decision_options
           WHERE id = 'c1700000-0000-4000-8000-000000000e33') IS TRUE,
    'FAIL 7e: the option she was shown — the recommended one — must be the winner';
  ASSERT (SELECT selected FROM public.client_decision_options
           WHERE id = 'c1700000-0000-4000-8000-000000000e32') IS NOT TRUE,
    'FAIL 7f: the rival she was not shown as recommended must not be selected';

  -- The actor. Named as a party, never as a forged user.
  ASSERT (SELECT count(*) FROM public.decision_events
           WHERE decision_id IN (d_a, d_b)
             AND actor_party_id = 'c1700000-0000-4000-8000-0000000000b1') = 2,
    'FAIL 7g: each applied decision must carry one audit row naming the party';
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.decision_events
     WHERE decision_id IN (d_a, d_b) AND changed_by IS NOT NULL),
    'FAIL 7h: no audit row may claim an authenticated actor';
  ASSERT (SELECT selected_by FROM public.client_decisions WHERE id = d_a) IS NULL
     AND (SELECT selected_by FROM public.client_decisions WHERE id = d_b) IS NULL,
    'FAIL 7i: selected_by is an auth.users key and must stay empty, not forged';
  ASSERT (SELECT client_consent_method FROM public.client_decisions WHERE id = d_a) IS NULL
     AND (SELECT client_signature FROM public.client_decisions WHERE id = d_a) IS NULL,
    'FAIL 7j: a text is neither a signature nor a click-through';
  ASSERT (SELECT reason FROM public.decision_events
           WHERE decision_id = d_a AND actor_party_id IS NOT NULL)
         LIKE '%approve_selection%',
    'FAIL 7k: the audit row must say what was done';

  -- The batch is closed, the prompt carries its receipt, the use is on record.
  ASSERT (SELECT closed_at FROM public.client_decision_batches WHERE id = b3) IS NOT NULL,
    'FAIL 7l: an approved batch is closed';
  ASSERT (SELECT version FROM public.client_decision_batches WHERE id = b3) = v,
    'FAIL 7m: closing before applying keeps the batch off its own option writes';
  ASSERT (SELECT consumed_sid FROM public.sms_prompts WHERE id = p.id) = 'SM-c17-approve'
     AND (SELECT answered_at FROM public.sms_prompts WHERE id = p.id) IS NOT NULL,
    'FAIL 7n: the prompt must be marked answered with the effect result';
  -- One use row per inbound that got past the capability gate, attached to the
  -- LIVE capability that authorized it. (Case 5's stale reply has its own row:
  -- the capability really was exercised there; it was the batch that had moved.)
  ASSERT (SELECT count(*) FROM public.client_link_uses u
            JOIN public.client_links cl ON cl.id = u.link_id
           WHERE u.source = 'sms:SM-c17-approve'
             AND u.action = 'apply_client_effect:approve_selection'
             AND cl.party_id = 'c1700000-0000-4000-8000-0000000000b1'
             AND cl.project_id = 'c1700000-0000-4000-8000-0000000000a1'
             AND cl.status = 'active'
             AND cl.expires_at > now()) = 1,
    'FAIL 7o: one capability-use row for this inbound, on the live capability '
    'that authorized it';

  RAISE NOTICE 'apply_client_effect: case 7 (approve applies and audits) passed.';
END
$case7$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 8 — replay by source SID applies once, answers the same result
-- ═══════════════════════════════════════════════════════════════════════════
DO $case8$
DECLARE
  p     public.sms_prompts := (SELECT ROW(sp.*)::public.sms_prompts
                                 FROM public.sms_prompts sp WHERE sp.short_code = '31');
  first jsonb := (SELECT consumption_result FROM public.sms_prompts WHERE id = p.id);
  again jsonb;
  events integer := (SELECT count(*) FROM public.decision_events
                      WHERE actor_party_id IS NOT NULL);
  uses   integer := (SELECT count(*) FROM public.client_link_uses);
BEGIN
  again := public.apply_client_effect(p.id, 'approve_selection',
    jsonb_build_object('version', 99), 'SM-c17-approve');

  ASSERT again->>'status' = 'replayed',
    'FAIL 8a: the same SID must replay, got ' || COALESCE(again->>'status', '<null>');
  ASSERT again->'result' = first,
    'FAIL 8b: a replay must return the ORIGINAL result, byte for byte';
  ASSERT (SELECT count(*) FROM public.decision_events
           WHERE actor_party_id IS NOT NULL) = events,
    'FAIL 8c: a replay must audit nothing a second time';
  ASSERT (SELECT count(*) FROM public.client_link_uses) = uses,
    'FAIL 8d: a replay must not write a second capability-use row';
  ASSERT (SELECT count(*) FROM public.client_decision_options
           WHERE decision_id = 'c1700000-0000-4000-8000-000000000d31' AND selected) = 1,
    'FAIL 8e: a replay must not select a second option';

  -- Note the replay above deliberately passed version 99 and 'approve_selection'
  -- against an ANSWERED prompt: the SID check comes first for exactly this
  -- reason, so a redelivered webhook gets its own receipt back rather than a
  -- refusal it would then retry forever.

  RAISE NOTICE 'apply_client_effect: case 8 (SID replay) passed.';
END
$case8$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 9 — select_window writes AVAILABILITY and nothing else
-- ═══════════════════════════════════════════════════════════════════════════
DO $case9$
DECLARE
  p      public.sms_prompts;
  before jsonb := pg_temp.untouched();
  r      jsonb;
  a      public.delivery_availability;
BEGIN
  ASSERT (SELECT count(*) FROM pg_trigger
           WHERE tgrelid = 'public.delivery_availability'::regclass
             AND NOT tgisinternal) = 0,
    'FAIL 9a: delivery_availability must carry NO trigger — nothing may follow '
    'from availability on its own';

  p := pg_temp.ask('41', 'window_pick',
    'c1700000-0000-4000-8000-0000000000a1', 'c1700000-0000-4000-8000-0000000000b1',
    '+15551230000', 'c1700000-0000-4000-8000-000000000d31');

  r := public.apply_client_effect(p.id, 'select_window',
    jsonb_build_object('option', 'B', 'window_label', 'Tue 8-12',
                       'subject_kind', 'delivery'),
    'SM-c17-window');
  ASSERT r->>'status' = 'applied',
    'FAIL 9b: a window pick must apply, got ' || COALESCE(r->>'status', '<null>');
  ASSERT (r#>>'{result,result,availability_only}') = 'true',
    'FAIL 9c: the result must say, in so many words, availability only';

  SELECT * INTO a FROM public.delivery_availability WHERE source_sid = 'SM-c17-window';
  ASSERT FOUND, 'FAIL 9d: the availability row must exist';
  ASSERT a.option = 'B' AND a.window_label = 'Tue 8-12'
     AND a.subject_kind = 'delivery'
     AND a.subject_id = 'c1700000-0000-4000-8000-000000000d31'
     AND a.party_id = 'c1700000-0000-4000-8000-0000000000b1'
     AND a.recorded_by_party_id = 'c1700000-0000-4000-8000-0000000000b1'
     AND a.project_id = 'c1700000-0000-4000-8000-0000000000a1',
    'FAIL 9e: the availability row must carry exactly what the prompt and the '
    'card said';
  ASSERT (SELECT count(*) FROM public.delivery_availability) = 1,
    'FAIL 9f: one reply is one availability row';

  -- NOT ONE ROW anywhere a text may not reach.
  ASSERT pg_temp.untouched() = before,
    'FAIL 9g: select_window moved a delivery / purchase-order / contract / '
    'payment / signature / FF&E row. before=' || before::text
      || ' after=' || pg_temp.untouched()::text;

  -- The subject must come from the immutable prompt, never from the payload.
  p := pg_temp.ask('42', 'window_pick',
    'c1700000-0000-4000-8000-0000000000a1', 'c1700000-0000-4000-8000-0000000000b1',
    '+15551230000', 'c1700000-0000-4000-8000-000000000d32');
  r := public.apply_client_effect(p.id, 'select_window',
    jsonb_build_object('option', 'A',
      'subject_id', 'c1700000-0000-4000-8000-000000000d31'),
    'SM-c17-window-2');
  ASSERT (SELECT subject_id FROM public.delivery_availability
           WHERE source_sid = 'SM-c17-window-2')
         = 'c1700000-0000-4000-8000-000000000d32',
    'FAIL 9h: a payload must not be able to retarget the subject';

  -- An option-less window pick says nothing and is refused.
  p := pg_temp.ask('43', 'window_pick',
    'c1700000-0000-4000-8000-0000000000a1', 'c1700000-0000-4000-8000-0000000000b1',
    '+15551230000', 'c1700000-0000-4000-8000-000000000d32');
  BEGIN
    PERFORM public.apply_client_effect(p.id, 'select_window',
      jsonb_build_object('window_label', 'whenever'), 'SM-c17-window-3');
    ASSERT false, 'FAIL 9i: a window pick with no option must be refused';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  ASSERT (SELECT count(*) FROM public.delivery_availability) = 2,
    'FAIL 9j: a refused window pick writes no availability row';

  RAISE NOTICE 'apply_client_effect: case 9 (availability only) passed.';
END
$case9$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 10 — a withdrawn ask, a finished ask, and an answer to another ask
-- ═══════════════════════════════════════════════════════════════════════════
DO $case10$
DECLARE
  d4 uuid := pg_temp.present('c1700000-0000-4000-8000-000000000d41',
    'c1700000-0000-4000-8000-0000000000a1', 'Hall runner',
    'c1700000-0000-4000-8000-000000000e41', 'c1700000-0000-4000-8000-000000000e42');
  b4 uuid := 'c1700000-0000-4000-8000-0000000000f8';
  p  public.sms_prompts;
  r  jsonb;
BEGIN
  INSERT INTO public.client_decision_batches (id, project_id, party_id,
    decision_ids, presented_local_day)
  VALUES (b4, 'c1700000-0000-4000-8000-0000000000a1',
          'c1700000-0000-4000-8000-0000000000b1', ARRAY[d4],
          CURRENT_DATE - 1);

  -- 10a: withdrawn. 00644 made voided_at write-once; 00646 made it unanswerable.
  p := pg_temp.ask('51', 'selection_batch',
    'c1700000-0000-4000-8000-0000000000a1', 'c1700000-0000-4000-8000-0000000000b1',
    '+15551230000', b4);
  UPDATE public.sms_prompts
     SET voided_at = clock_timestamp(), void_reason = 'studio withdrew the list'
   WHERE id = p.id;
  r := public.apply_client_effect(p.id, 'approve_selection',
    jsonb_build_object('version', 1), 'SM-c17-voided');
  ASSERT r->>'status' = 'closed',
    'FAIL 10a: a withdrawn ask is closed, got ' || COALESCE(r->>'status', '<null>');
  ASSERT (SELECT status FROM public.client_decisions WHERE id = d4) = 'pending',
    'FAIL 10b: a withdrawn ask applies nothing';

  -- 10b: already answered, by a DIFFERENT inbound.
  r := public.apply_client_effect(
    (SELECT id FROM public.sms_prompts WHERE short_code = '31'),
    'approve_selection', jsonb_build_object('version', 1), 'SM-c17-late');
  ASSERT r->>'status' = 'closed',
    'FAIL 10c: a finished ask is closed to a new inbound, got '
      || COALESCE(r->>'status', '<null>');

  -- 10c: an expired ask.
  p := pg_temp.ask('52', 'selection_batch',
    'c1700000-0000-4000-8000-0000000000a1', 'c1700000-0000-4000-8000-0000000000b1',
    '+15551230000', b4, 1, clock_timestamp() - interval '1 hour');
  r := public.apply_client_effect(p.id, 'approve_selection',
    jsonb_build_object('version', 1), 'SM-c17-too-late');
  ASSERT r->>'status' = 'expired',
    'FAIL 10d: time running out is its own word, got ' || COALESCE(r->>'status', '<null>');

  -- 10d: the effects do not cross. A window pick cannot answer a selection ask.
  p := pg_temp.ask('53', 'selection_batch',
    'c1700000-0000-4000-8000-0000000000a1', 'c1700000-0000-4000-8000-0000000000b1',
    '+15551230000', b4);
  BEGIN
    PERFORM public.apply_client_effect(p.id, 'select_window',
      jsonb_build_object('option', 'A'), 'SM-c17-crossed');
    ASSERT false, 'FAIL 10e: select_window must not answer a selection_batch ask';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    PERFORM public.apply_client_effect(p.id, 'confirm_delivery',
      jsonb_build_object('version', 1), 'SM-c17-unknown');
    ASSERT false, 'FAIL 10f: a field-rail effect is not a client effect';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.apply_client_effect(p.id, 'approve_selection',
      jsonb_build_object('version', 1), '   ');
    ASSERT false, 'FAIL 10g: an inbound with no SID cannot be made idempotent';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT (SELECT status FROM public.client_decisions WHERE id = d4) = 'pending'
     AND (SELECT closed_at FROM public.client_decision_batches WHERE id = b4) IS NULL,
    'FAIL 10h: none of the crossed or malformed calls applied anything';

  RAISE NOTICE 'apply_client_effect: case 10 (closed, expired, crossed) passed.';
END
$case10$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 11 — one OPEN batch per party per local day
-- ═══════════════════════════════════════════════════════════════════════════
DO $case11$
DECLARE
  raised boolean := false;
BEGIN
  -- b4 is open on CURRENT_DATE - 1. A second open one for the same homeowner on
  -- that day is the ask arriving twice.
  BEGIN
    INSERT INTO public.client_decision_batches (project_id, party_id,
      decision_ids, presented_local_day)
    VALUES ('c1700000-0000-4000-8000-0000000000a1',
            'c1700000-0000-4000-8000-0000000000b1',
            ARRAY['c1700000-0000-4000-8000-000000000d41'::uuid],
            CURRENT_DATE - 1);
  EXCEPTION WHEN unique_violation THEN raised := true;
  END;
  ASSERT raised, 'FAIL 11a: a second OPEN batch on the same local day must be refused';

  -- Today is a different day, and today's batch was already closed by case 7.
  INSERT INTO public.client_decision_batches (id, project_id, party_id,
    decision_ids, presented_local_day)
  VALUES ('c1700000-0000-4000-8000-0000000000f9',
          'c1700000-0000-4000-8000-0000000000a1',
          'c1700000-0000-4000-8000-0000000000b1',
          ARRAY['c1700000-0000-4000-8000-000000000d41'::uuid], CURRENT_DATE);
  ASSERT pg_temp.batch_version('c1700000-0000-4000-8000-0000000000f9') = 1,
    'FAIL 11b: a new day opens a new batch at version 1';

  -- An empty batch asks nothing.
  raised := false;
  BEGIN
    INSERT INTO public.client_decision_batches (project_id, party_id,
      decision_ids, presented_local_day)
    VALUES ('c1700000-0000-4000-8000-0000000000a1',
            'c1700000-0000-4000-8000-0000000000b1',
            ARRAY[]::uuid[], CURRENT_DATE - 2);
  EXCEPTION WHEN check_violation THEN raised := true;
  END;
  ASSERT raised, 'FAIL 11c: a batch of no decisions must be refused';

  -- A NULL member names no decision. (array_length of '{}' is NULL, not 0, so
  -- both halves of this CHECK have to be written for NULL rather than assumed.)
  raised := false;
  BEGIN
    INSERT INTO public.client_decision_batches (project_id, party_id,
      decision_ids, presented_local_day)
    VALUES ('c1700000-0000-4000-8000-0000000000a1',
            'c1700000-0000-4000-8000-0000000000b1',
            ARRAY['c1700000-0000-4000-8000-000000000d41'::uuid, NULL],
            CURRENT_DATE - 4);
  EXCEPTION WHEN check_violation THEN raised := true;
  END;
  ASSERT raised, 'FAIL 11d: a batch with a NULL member must be refused';

  -- A batch naming another studio's party is unwritable, not merely unreadable.
  raised := false;
  BEGIN
    INSERT INTO public.client_decision_batches (project_id, party_id,
      decision_ids, presented_local_day)
    VALUES ('c1700000-0000-4000-8000-0000000000a1',
            'c1700000-0000-4000-8000-0000000000b2',
            ARRAY['c1700000-0000-4000-8000-000000000d41'::uuid], CURRENT_DATE - 3);
  EXCEPTION WHEN foreign_key_violation THEN raised := true;
  END;
  ASSERT raised, 'FAIL 11e: a batch may not name a party from another project';

  RAISE NOTICE 'apply_client_effect: case 11 (one open batch a day) passed.';
END
$case11$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 12 — authorization
-- ═══════════════════════════════════════════════════════════════════════════
DO $case12$
DECLARE
  n integer;
BEGIN
  ASSERT NOT has_function_privilege('anon',
    'public.apply_client_effect(uuid,text,jsonb,text)', 'EXECUTE'),
    'FAIL 12a: anon must not decide anything';
  ASSERT NOT has_function_privilege('authenticated',
    'public.apply_client_effect(uuid,text,jsonb,text)', 'EXECUTE'),
    'FAIL 12b: an authenticated caller has apply_decision, not this door';
  ASSERT has_function_privilege('service_role',
    'public.apply_client_effect(uuid,text,jsonb,text)', 'EXECUTE'),
    'FAIL 12c: service_role must be able to apply a client effect';

  ASSERT NOT has_table_privilege('anon', 'public.client_decision_batches', 'SELECT'),
    'FAIL 12d: anon must not read the presented lists';
  ASSERT NOT has_table_privilege('anon', 'public.delivery_availability', 'SELECT'),
    'FAIL 12e: anon must not read a homeowner''s availability';
  ASSERT has_table_privilege('authenticated', 'public.client_decision_batches', 'SELECT'),
    'FAIL 12f: a studio member reads batches through the policy';
  ASSERT NOT has_table_privilege('authenticated', 'public.client_decision_batches', 'INSERT'),
    'FAIL 12g: only service_role writes batches';
  ASSERT NOT has_table_privilege('authenticated', 'public.delivery_availability', 'INSERT'),
    'FAIL 12h: only service_role writes availability';
  ASSERT has_table_privilege('service_role', 'public.client_decision_batches', 'INSERT'),
    'FAIL 12i: service_role writes batches';
  ASSERT has_table_privilege('service_role', 'public.delivery_availability', 'INSERT'),
    'FAIL 12j: service_role writes availability';

  ASSERT (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public.client_decision_batches'::regclass),
    'FAIL 12k: client_decision_batches must have RLS enabled';
  ASSERT (SELECT relrowsecurity FROM pg_class
           WHERE oid = 'public.delivery_availability'::regclass),
    'FAIL 12l: delivery_availability must have RLS enabled';
  ASSERT (SELECT count(*) FROM pg_policies
           WHERE schemaname = 'public'
             AND tablename IN ('client_decision_batches', 'delivery_availability')
             AND cmd <> 'SELECT') = 0,
    'FAIL 12m: no policy may admit a write from an end user';

  -- The studio really can read its own, and an outsider really cannot.
  PERFORM pg_temp.assume_user_role('c1700000-0000-4000-8000-000000000001');
  SELECT count(*) INTO n FROM public.client_decision_batches;
  PERFORM pg_temp.reset_role();
  ASSERT n >= 1, 'FAIL 12n: the owning designer must read her own batches, saw ' || n;

  PERFORM pg_temp.assume_user_role('c1700000-0000-4000-8000-000000000002');
  SELECT count(*) INTO n FROM public.client_decision_batches;
  PERFORM pg_temp.reset_role();
  ASSERT n = 0, 'FAIL 12o: an outsider must read no batch at all, saw ' || n;

  PERFORM pg_temp.assume_user_role('c1700000-0000-4000-8000-000000000002');
  SELECT count(*) INTO n FROM public.delivery_availability;
  PERFORM pg_temp.reset_role();
  ASSERT n = 0, 'FAIL 12p: an outsider must read no availability at all, saw ' || n;

  RAISE NOTICE 'apply_client_effect: case 12 (authorization) passed.';
END
$case12$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 13 — the generation cannot be suppressed, and cannot move down (00652)
-- ═══════════════════════════════════════════════════════════════════════════
-- Batch f9 is case 11's: open today, at version 1, naming one decision.
DO $case13$
DECLARE
  b     uuid := 'c1700000-0000-4000-8000-0000000000f9';
  d_new uuid := 'c1700000-0000-4000-8000-000000000d31';
BEGIN
  ASSERT pg_temp.batch_version(b) = 1,
    'FAIL 13a: the batch under test must start at version 1, got '
      || COALESCE(pg_temp.batch_version(b)::text, '<null>');

  -- THE WRITE THAT SUPPRESSED ITS OWN BUMP. 00651 bumped only when the caller
  -- left version alone, so exactly this statement — a sender swapping the list
  -- and restating the version it thought it was presenting — moved what she was
  -- being asked about and left every reply in flight still answerable.
  UPDATE public.client_decision_batches
     SET decision_ids = ARRAY[d_new], version = 1
   WHERE id = b;
  ASSERT pg_temp.batch_version(b) = 2,
    'FAIL 13b: changing the presented set must open the next version whatever '
      'the same statement wrote, got ' || pg_temp.batch_version(b);

  -- And a generation never moves DOWN: that is the one direction that makes a
  -- stale reply current again.
  UPDATE public.client_decision_batches SET version = 1 WHERE id = b;
  ASSERT pg_temp.batch_version(b) = 2,
    'FAIL 13c: version may not be written down, got ' || pg_temp.batch_version(b);
  UPDATE public.client_decision_batches SET version = 99 WHERE id = b;
  ASSERT pg_temp.batch_version(b) = 2,
    'FAIL 13d: version may not jump, got ' || pg_temp.batch_version(b);
  UPDATE public.client_decision_batches SET version = NULL WHERE id = b;
  ASSERT pg_temp.batch_version(b) = 2,
    'FAIL 13e: version may not be cleared, got '
      || COALESCE(pg_temp.batch_version(b)::text, '<null>');

  -- The ONE legal move is the option trigger's +1. It arrives as an ordinary
  -- UPDATE and cannot be told from a hand-written one by anything but its
  -- value — and advancing can only ever invalidate a reply in flight, so this
  -- permissive half fails closed.
  UPDATE public.client_decision_batches SET version = 3 WHERE id = b;
  ASSERT pg_temp.batch_version(b) = 3,
    'FAIL 13f: a +1 step must be allowed, got ' || pg_temp.batch_version(b);

  -- LOW-5 — an answered ask is not reopened. A studio asks again by opening a
  -- new batch; clearing closed_at would file a second answer for the first one.
  UPDATE public.client_decision_batches SET closed_at = now() WHERE id = b;
  BEGIN
    UPDATE public.client_decision_batches SET closed_at = NULL WHERE id = b;
    ASSERT false, 'FAIL 13g: reopening a closed batch must be refused';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  ASSERT (SELECT closed_at FROM public.client_decision_batches WHERE id = b) IS NOT NULL,
    'FAIL 13h: the refused reopen must leave the batch closed';

  RAISE NOTICE 'apply_client_effect: case 13 (version authority) passed.';
END
$case13$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 14 — a decision from another household on the same house (00652 LOW-3)
-- ═══════════════════════════════════════════════════════════════════════════
-- One project can carry two client records — a couple who split, an owner and a
-- tenant, a landlord and a business. The capability speaks for ONE letter, and
-- a letter speaks for one household, so a decision filed against the other one
-- is not hers to answer even though it is on her house.
DO $case14$
DECLARE
  hh2  uuid := 'c1700000-0000-4000-8000-0000000000c2';
  d5   uuid := 'c1700000-0000-4000-8000-000000000d51';
  b    uuid := 'c1700000-0000-4000-8000-0000000000fa';
  p    public.sms_prompts;
  link uuid;
  msg  text;
BEGIN
  INSERT INTO designer_clients (id, designer_id, client_name, status)
  VALUES (hh2, 'c1700000-0000-4000-8000-000000000001', 'C17 Other Household', 'active');
  INSERT INTO public.client_decisions (id, designer_client_id, designer_id,
    project_id, title, status, coordination_kind, court)
  VALUES (d5, hh2, 'c1700000-0000-4000-8000-000000000001',
          'c1700000-0000-4000-8000-0000000000a1', 'Pendant for the other unit',
          'pending', 'selection', 'client');
  INSERT INTO public.client_decision_options (id, decision_id, name,
    is_recommended, sort_order)
  VALUES ('c1700000-0000-4000-8000-000000000e51', d5, 'Brass', true, 0),
         ('c1700000-0000-4000-8000-000000000e52', d5, 'Black', false, 1);

  INSERT INTO public.client_decision_batches (id, project_id, party_id,
    decision_ids, presented_local_day)
  VALUES (b, 'c1700000-0000-4000-8000-0000000000a1',
          'c1700000-0000-4000-8000-0000000000b1', ARRAY[d5], CURRENT_DATE);

  SELECT id INTO link FROM public.create_client_link(
    'c1700000-0000-4000-8000-000000000011',
    ARRAY['open_letter', 'approve_selection', 'select_window']::text[],
    interval '90 days');
  p := pg_temp.ask('61', 'selection_batch',
    'c1700000-0000-4000-8000-0000000000a1', 'c1700000-0000-4000-8000-0000000000b1',
    '+15551230000', b);

  BEGIN
    PERFORM public.apply_client_effect(p.id, 'approve_selection',
      jsonb_build_object('version', 1), 'SM-c17-household');
    ASSERT false, 'FAIL 14a: a decision from another household must be refused';
  EXCEPTION WHEN insufficient_privilege THEN msg := SQLERRM;
  END;
  ASSERT msg LIKE '%decision_other_household%',
    'FAIL 14b: the refusal must name itself, got ' || COALESCE(msg, '<null>');
  ASSERT (SELECT status FROM public.client_decisions WHERE id = d5) = 'pending',
    'FAIL 14c: nothing may be applied to another household''s decision';
  ASSERT (SELECT closed_at FROM public.client_decision_batches WHERE id = b) IS NULL,
    'FAIL 14d: the batch stays open for the studio to fix';
  ASSERT (SELECT answered_at FROM public.sms_prompts WHERE id = p.id) IS NULL
     AND (SELECT consumed_sid FROM public.sms_prompts WHERE id = p.id) IS NULL,
    'FAIL 14e: a refused reply mints no receipt';
  ASSERT NOT EXISTS (SELECT 1 FROM public.decision_events
                      WHERE decision_id = d5),
    'FAIL 14f: and writes down no decision that did not happen';

  -- IS DISTINCT FROM, not <>. A decision filed against a household, answered by
  -- a letter that names none, is the same mismatch — and plain inequality is
  -- NULL there, which 00651 read as "no objection".
  UPDATE public.client_invitations SET designer_client_id = NULL
   WHERE id = 'c1700000-0000-4000-8000-000000000011';
  msg := NULL;
  BEGIN
    PERFORM public.apply_client_effect(p.id, 'approve_selection',
      jsonb_build_object('version', 1), 'SM-c17-halfset');
    ASSERT false, 'FAIL 14g: a letter naming no household cannot answer one that does';
  EXCEPTION WHEN insufficient_privilege THEN msg := SQLERRM;
  END;
  ASSERT msg LIKE '%decision_other_household%',
    'FAIL 14h: the half-set mismatch must refuse too, got ' || COALESCE(msg, '<null>');
  UPDATE public.client_invitations
     SET designer_client_id = 'c1700000-0000-4000-8000-0000000000c1'
   WHERE id = 'c1700000-0000-4000-8000-000000000011';

  RAISE NOTICE 'apply_client_effect: case 14 (other household) passed.';
END
$case14$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Case 15 — the capability's two copies of the project must agree (LOW-6)
-- ═══════════════════════════════════════════════════════════════════════════
-- client_links carries the house twice: the FK column, and the scope written at
-- mint. 00651 read only the scope, so a row whose column had drifted — a
-- backfill, a repair script, a future re-parent — would have authorized an
-- effect on a house the scope did not name. Both copies are read, and either
-- one disagreeing shuts the door.
DO $case15$
DECLARE
  d6   uuid := 'c1700000-0000-4000-8000-000000000d61';
  b    uuid := 'c1700000-0000-4000-8000-0000000000fb';
  p    public.sms_prompts;
  link uuid;
  msg  text;
  r    jsonb;
BEGIN
  -- Case 14's ask is over; one OPEN batch per homeowner per local day.
  UPDATE public.client_decision_batches SET closed_at = now()
   WHERE id = 'c1700000-0000-4000-8000-0000000000fa';
  PERFORM pg_temp.present(d6, 'c1700000-0000-4000-8000-0000000000a1',
    'Hall runner', 'c1700000-0000-4000-8000-000000000e61',
    'c1700000-0000-4000-8000-000000000e62');
  INSERT INTO public.client_decision_batches (id, project_id, party_id,
    decision_ids, presented_local_day)
  VALUES (b, 'c1700000-0000-4000-8000-0000000000a1',
          'c1700000-0000-4000-8000-0000000000b1', ARRAY[d6], CURRENT_DATE);

  SELECT id INTO link FROM public.create_client_link(
    'c1700000-0000-4000-8000-000000000011',
    ARRAY['open_letter', 'approve_selection', 'select_window']::text[],
    interval '90 days');
  p := pg_temp.ask('62', 'selection_batch',
    'c1700000-0000-4000-8000-0000000000a1', 'c1700000-0000-4000-8000-0000000000b1',
    '+15551230000', b);

  -- The FK column drifts to the other house; the scope still says this one.
  UPDATE public.client_links SET project_id = 'c1700000-0000-4000-8000-0000000000a2'
   WHERE id = link;
  BEGIN
    PERFORM public.apply_client_effect(p.id, 'approve_selection',
      jsonb_build_object('version', 1), 'SM-c17-lowsix-column');
    ASSERT false, 'FAIL 15a: a capability whose column names another house must be refused';
  EXCEPTION WHEN insufficient_privilege THEN msg := SQLERRM;
  END;
  ASSERT msg LIKE '%capability_wrong_project%',
    'FAIL 15b: the refusal must name itself, got ' || COALESCE(msg, '<null>');
  UPDATE public.client_links SET project_id = 'c1700000-0000-4000-8000-0000000000a1'
   WHERE id = link;

  -- And the other way round: the scope drifts, the column does not.
  msg := NULL;
  UPDATE public.client_links
     SET scope = jsonb_set(scope, '{project_id}',
                           to_jsonb('c1700000-0000-4000-8000-0000000000a2'::text))
   WHERE id = link;
  BEGIN
    PERFORM public.apply_client_effect(p.id, 'approve_selection',
      jsonb_build_object('version', 1), 'SM-c17-lowsix-scope');
    ASSERT false, 'FAIL 15c: a capability whose scope names another house must be refused';
  EXCEPTION WHEN insufficient_privilege THEN msg := SQLERRM;
  END;
  ASSERT msg LIKE '%capability_wrong_project%',
    'FAIL 15d: the scope copy must be read too, got ' || COALESCE(msg, '<null>');
  ASSERT (SELECT status FROM public.client_decisions WHERE id = d6) = 'pending',
    'FAIL 15e: neither divergence may apply anything';
  UPDATE public.client_links
     SET scope = jsonb_set(scope, '{project_id}',
                           to_jsonb('c1700000-0000-4000-8000-0000000000a1'::text))
   WHERE id = link;

  -- With both copies agreeing, the same words apply.
  r := public.apply_client_effect(p.id, 'approve_selection',
    jsonb_build_object('version', 1), 'SM-c17-lowsix-agree');
  ASSERT r->>'status' = 'applied',
    'FAIL 15f: an undiverged capability must apply, got ' || COALESCE(r->>'status', '<null>');
  ASSERT (SELECT status FROM public.client_decisions WHERE id = d6) = 'responded',
    'FAIL 15g: and the decision she answered is answered';

  RAISE NOTICE 'apply_client_effect: case 15 (both project copies) passed.';
  RAISE NOTICE 'All apply_client_effect assertions passed.';
END
$case15$;

ROLLBACK;
