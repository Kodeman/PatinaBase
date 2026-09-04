-- ═══════════════════════════════════════════════════════════════════════════
-- 00564 — a client-court sign-off is a decision the client can actually make
--
-- NOTE ON STYLE: supabase/tests/** is not pgTAP. Every file in that tree is a
-- plain psql script — BEGIN, fixtures, pg_temp role-assumption helpers, DO
-- blocks of ASSERTs, ROLLBACK — run under ON_ERROR_STOP=1. This file follows
-- rls/00563_proposal_signing_multi_studio.test.sql.
--
-- Run (single file, for iteration):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/rls/00564_client_signoff_approval.test.sql
--
-- Run (the actual gate — whole suite against KNOWN_FAILURES.md):
--   bash scripts/run-sql-tests.sh
--
-- Fixture: the seeded designer↔client pair every local reset carries
-- (designer@patina.dev a0000000-…-0004, client@patina.dev a0000000-…-0005) and
-- the sign-off decision walk B filed W1-B-03 against:
--   b0000000-…-00000005c301 "Design Development sign-off — drawing set B",
--   status pending, decision_type approval, coordination_kind signoff,
--   court client, approval_contract NULL, and NO options.
-- The whole file runs inside one transaction and ROLLBACKs.
--
-- Covers:
--   1. RED — the canonical selection RPC cannot answer this row at all, which
--      is why the screen had nothing to draw
--   2. GREEN — the addressed client approves it: responded, stamped, consented
--   3. the point of the row: an FF&E item blocked on the decision is released
--   4. replay by the same client is idempotent; nothing moves twice
--   5. a stranger is refused, and so is an anonymous caller
--   6. a `selection` row is refused here, so there are never two ways to
--      resolve one decision
--   7. a decision that HAS options is refused here for the same reason
--   8. consent validation matches the option path's, word for word
--   9. the grants are the neighbour's: authenticated only
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ─── helpers ───────────────────────────────────────────────────────────────
-- The GRANT after each definition is required: 00483 revokes database
-- TEMPORARY from authenticated/anon/service_role, so a restricted role cannot
-- reach a pg_temp function without it.

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

-- ─── fixture preconditions ─────────────────────────────────────────────────

DO $$
DECLARE
  v_status text;
  v_kind text;
  v_court text;
  v_contract text;
  v_options integer;
  v_client uuid;
BEGIN
  SELECT decision.status, decision.coordination_kind, decision.court,
         decision.approval_contract, relationship.client_id
    INTO v_status, v_kind, v_court, v_contract, v_client
    FROM public.client_decisions AS decision
    JOIN public.designer_clients AS relationship
      ON relationship.id = decision.designer_client_id
   WHERE decision.id = 'b0000000-0000-0000-0000-00000005c301'::uuid;

  ASSERT v_status = 'pending',
    'FIXTURE: the sign-off decision must be pending, got ' || COALESCE(v_status, '<missing>');
  ASSERT v_kind = 'signoff',
    'FIXTURE: coordination_kind must be signoff, got ' || COALESCE(v_kind, '<null>');
  ASSERT v_court = 'client',
    'FIXTURE: court must be client, got ' || COALESCE(v_court, '<null>');
  ASSERT v_contract IS NULL,
    'FIXTURE: this row must not be a Stage-2 artifact decision';
  ASSERT v_client = 'a0000000-0000-0000-0000-000000000005'::uuid,
    'FIXTURE: the addressed client must be client@patina.dev';

  SELECT count(*) INTO v_options
    FROM public.client_decision_options
   WHERE decision_id = 'b0000000-0000-0000-0000-00000005c301'::uuid;
  ASSERT v_options = 0,
    'FIXTURE: W1-B-03 is about a decision with NO options, found ' || v_options;
END $$;

-- ─── 1. RED: the selection RPC cannot answer this row ──────────────────────

SAVEPOINT s1;
DO $$
DECLARE
  v_sqlstate text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005'::uuid);
  BEGIN
    PERFORM public.apply_client_decision(
      'b0000000-0000-0000-0000-00000005c301'::uuid,
      NULL::uuid,
      'click_through'
    );
    ASSERT false, 'apply_client_decision answered a sign-off row (W1-B-03 is closed elsewhere?)';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_sqlstate = '42501',
    'the selection RPC must refuse a signoff row with insufficient_privilege, got ' || v_sqlstate;
END $$;
ROLLBACK TO SAVEPOINT s1;

-- ─── 2 + 3 + 4. GREEN: the client approves, FF&E is released, replay is flat ─

SAVEPOINT s2;
DO $$
DECLARE
  v_project uuid;
  v_item uuid;
  v_status text;
  v_selected_by uuid;
  v_consented boolean;
  v_blocked boolean;
  v_responded_at timestamptz;
BEGIN
  SELECT project_id INTO v_project
    FROM public.client_decisions
   WHERE id = 'b0000000-0000-0000-0000-00000005c301'::uuid;
  ASSERT v_project IS NOT NULL, 'FIXTURE: the sign-off decision must name a project';

  -- An FF&E item held by exactly this decision — the "long-lead casegoods"
  -- the decision's own body says Procurement cannot release. No room: an
  -- unassigned line is what `guard_project_ffe_selection_integrity` allows a
  -- `fixed` item to be, and the room is not what this test is about.
  INSERT INTO public.project_ffe_items (
    project_id, source_decision_id, blocked_by_decision_id,
    blocked, blocked_reason, name, item_type, status, quantity,
    unit_price_cents, line_total_cents
  ) VALUES (
    v_project, NULL, 'b0000000-0000-0000-0000-00000005c301'::uuid,
    true, 'awaiting drawing set B sign-off', 'Long-lead casegoods',
    'fixed', 'specified', 1, 0, 0
  )
  RETURNING id INTO v_item;

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005'::uuid);
  PERFORM public.approve_client_signoff(
    'b0000000-0000-0000-0000-00000005c301'::uuid,
    'electronic_signature',
    'Client User'
  );
  PERFORM pg_temp.reset_role();

  SELECT status, selected_by, client_consented_at IS NOT NULL, responded_at
    INTO v_status, v_selected_by, v_consented, v_responded_at
    FROM public.client_decisions
   WHERE id = 'b0000000-0000-0000-0000-00000005c301'::uuid;

  ASSERT v_status = 'responded', 'the sign-off did not resolve, status ' || v_status;
  ASSERT v_selected_by = 'a0000000-0000-0000-0000-000000000005'::uuid,
    'the approval is not attributed to the client who made it';
  ASSERT v_consented, 'the consent columns were not written';
  ASSERT v_responded_at IS NOT NULL, 'responded_at was not stamped';

  SELECT blocked INTO v_blocked FROM public.project_ffe_items WHERE id = v_item;
  ASSERT v_blocked = false,
    'Procurement is still blocked after the sign-off — the one thing the row is for';

  -- 4. Replay by the same client returns the terminal row and moves nothing.
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005'::uuid);
  PERFORM public.approve_client_signoff(
    'b0000000-0000-0000-0000-00000005c301'::uuid,
    'electronic_signature',
    'Client User'
  );
  PERFORM pg_temp.reset_role();

  ASSERT (
    SELECT responded_at FROM public.client_decisions
     WHERE id = 'b0000000-0000-0000-0000-00000005c301'::uuid
  ) = v_responded_at, 'a replay re-stamped responded_at';
END $$;
ROLLBACK TO SAVEPOINT s2;

-- ─── 5. a stranger, and nobody at all ──────────────────────────────────────

SAVEPOINT s3;
DO $$
DECLARE
  v_sqlstate text;
BEGIN
  -- The designer is not the addressed client.
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000004'::uuid);
  BEGIN
    PERFORM public.approve_client_signoff(
      'b0000000-0000-0000-0000-00000005c301'::uuid, 'click_through', NULL
    );
    ASSERT false, 'the designer approved the client''s own sign-off';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_sqlstate = '42501',
    'a non-addressed actor must be refused with insufficient_privilege, got ' || v_sqlstate;

  ASSERT (
    SELECT status FROM public.client_decisions
     WHERE id = 'b0000000-0000-0000-0000-00000005c301'::uuid
  ) = 'pending', 'the refused call still moved the row';
END $$;

DO $$
DECLARE
  v_has_execute boolean;
BEGIN
  -- anon cannot even reach it.
  SELECT has_function_privilege(
    'anon', 'public.approve_client_signoff(uuid, text, text)', 'EXECUTE'
  ) INTO v_has_execute;
  ASSERT NOT v_has_execute, 'anon may EXECUTE approve_client_signoff';

  SELECT has_function_privilege(
    'service_role', 'public.approve_client_signoff(uuid, text, text)', 'EXECUTE'
  ) INTO v_has_execute;
  ASSERT NOT v_has_execute,
    'service_role may EXECUTE approve_client_signoff — it reads auth.uid() and would resolve nobody';

  SELECT has_function_privilege(
    'authenticated', 'public.approve_client_signoff(uuid, text, text)', 'EXECUTE'
  ) INTO v_has_execute;
  ASSERT v_has_execute, 'authenticated may not EXECUTE approve_client_signoff';
END $$;
ROLLBACK TO SAVEPOINT s3;

-- ─── 6 + 7. one act per decision ───────────────────────────────────────────

SAVEPOINT s4;
DO $$
DECLARE
  v_sqlstate text;
  v_selection uuid := 'b0000000-0000-0000-0000-0000000d2c02'::uuid;  -- Dining chairs
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005'::uuid);
  BEGIN
    PERFORM public.approve_client_signoff(v_selection, 'click_through', NULL);
    ASSERT false, 'a selection decision was approved without choosing anything';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_sqlstate = '42501',
    'a selection row must be refused with insufficient_privilege, got ' || v_sqlstate;
END $$;

DO $$
DECLARE
  v_sqlstate text;
  v_project uuid;
BEGIN
  -- Give the sign-off row an option and it stops being answerable here: a row
  -- with options is resolved by choosing one.
  INSERT INTO public.client_decision_options (decision_id, name, sort_order)
  VALUES ('b0000000-0000-0000-0000-00000005c301'::uuid, 'Approved as drawn', 0);

  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005'::uuid);
  BEGIN
    PERFORM public.approve_client_signoff(
      'b0000000-0000-0000-0000-00000005c301'::uuid, 'click_through', NULL
    );
    ASSERT false, 'a decision with options was resolved without choosing one';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_sqlstate = '23514',
    'a decision carrying options must be refused with check_violation, got ' || v_sqlstate;
END $$;
ROLLBACK TO SAVEPOINT s4;

-- ─── 8. consent validation is the option path's, word for word ─────────────

SAVEPOINT s5;
DO $$
DECLARE
  v_sqlstate text;
BEGIN
  PERFORM pg_temp.assume_user('a0000000-0000-0000-0000-000000000005'::uuid);
  BEGIN
    PERFORM public.approve_client_signoff(
      'b0000000-0000-0000-0000-00000005c301'::uuid, 'nodded_at_it', NULL
    );
    ASSERT false, 'an invented consent method was accepted';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  ASSERT v_sqlstate = '23514',
    'an invalid consent method must be a check_violation, got ' || v_sqlstate;

  BEGIN
    PERFORM public.approve_client_signoff(
      'b0000000-0000-0000-0000-00000005c301'::uuid, 'electronic_signature', ' A '
    );
    ASSERT false, 'a one-character signature was accepted';
  EXCEPTION WHEN OTHERS THEN
    v_sqlstate := SQLSTATE;
  END;
  PERFORM pg_temp.reset_role();
  ASSERT v_sqlstate = '23514',
    'a signature under two characters must be a check_violation, got ' || v_sqlstate;

  ASSERT (
    SELECT status FROM public.client_decisions
     WHERE id = 'b0000000-0000-0000-0000-00000005c301'::uuid
  ) = 'pending', 'a refused consent still moved the row';
END $$;
ROLLBACK TO SAVEPOINT s5;

ROLLBACK;
