-- ═══════════════════════════════════════════════════════════════════════════
-- project_ffe_items.assignment_scope derivation in shipped RPCs (00510)
--
-- 00434 added project_ffe_items.assignment_scope (DEFAULT 'unassigned') with
--   CHECK (assignment_scope IN ('room','throughout','unassigned')
--          AND ((assignment_scope = 'room') = (project_room_id IS NOT NULL)))
-- and, in guard_project_ffe_selection_integrity(), a NARROWLY GATED
-- auto-derivation (00434:465-472) — the gate is the part that matters:
--   IF TG_OP = 'INSERT' AND NEW.assignment_scope = 'unassigned'
--      AND (NEW.source_proposal_item_id IS NOT NULL
--           OR NEW.source_authorization_item_id IS NOT NULL
--           OR NEW.source_decision_id IS NOT NULL) THEN
--     NEW.assignment_scope := CASE WHEN NEW.project_room_id IS NULL
--                                  THEN 'throughout' ELSE 'room' END;
--   END IF;
--
-- 00438 re-created that guard WITHOUT the derivation. Every writer now has to
-- set the column, and two shipped RPCs did not:
--   public.engage_trade_scope(uuid, jsonb)   00423 → 00475
--   public.apply_scope_change(uuid)          00084 → 00253 → 00395
-- Both insert project_ffe_items with a non-NULL project_room_id and no
-- assignment_scope, so a room-scoped section/amendment hard-failed with
-- 'non-room assignment cannot carry a room'. 00510 sets the column explicitly
-- inside both bodies: 'room' when a room is named, else 'throughout'.
--
-- NOTE ON 00434:472. It is cited here as PRECEDENT for the room/throughout
-- pairing, not as behavior being restored. 00434's derivation was gated on
-- assignment_scope='unassigned' AND a source_* column being set (00434:465-471);
-- neither RPC sets a source_* column, so these rows were never auto-derived.
-- The 'throughout' choice is a product decision — see 00510's header.
--
-- Sections (3) and (5) are the discriminators: each reconstructs the pre-00510
-- body from the live definition by removing exactly the two 00510 lines,
-- INSTALLS it, calls the real RPC, and proves the failure comes back. A suite
-- that only ran the happy path would be green against a body that set
-- assignment_scope to any constant.
--
-- Both RPCs are covered end to end here, executing: apply_scope_change in (2)/
-- (3)/(4) and engage_trade_scope in (5)/(6). engage_trade_scope's fuller
-- ceremony (create → execute → deposit → engage through the real RPC chain)
-- lives in supabase/tests/commercial/trade_scope_test.sql, but that file is
-- allowlisted in KNOWN_FAILURES.md for an unrelated readiness-gate residual and
-- therefore does not gate CI — which is why the coverage is duplicated here in
-- a file that does.
--
-- Run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--     -v ON_ERROR_STOP=1 \
--     -f supabase/tests/ffe/assignment_scope_rpc_derivation_test.sql
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL statement_timeout = '60s';

-- ── Actors and project ────────────────────────────────────────────────────
INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
) VALUES
  ('52000000-0000-4000-8000-000000000001', 'as-designer@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('52000000-0000-4000-8000-000000000002', 'as-client@test.invalid', '', now(), now(), now(),
   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('52000000-0000-4000-8000-000000000001', 'as-designer@test.invalid', 'AS Designer', true, now(), now()),
  ('52000000-0000-4000-8000-000000000002', 'as-client@test.invalid', 'AS Client', false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email,
    full_name = EXCLUDED.full_name,
    is_designer = EXCLUDED.is_designer;

INSERT INTO public.projects (
  id, name, designer_id, client_id, created_by, status,
  budget_cents, design_fee_cents, target_end_date
) VALUES (
  '52100000-0000-4000-8000-000000000001', 'Assignment scope project',
  '52000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000002',
  '52000000-0000-4000-8000-000000000001', 'active',
  100000, 20000, DATE '2026-12-31'
);

INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES (
  '52200000-0000-4000-8000-000000000001',
  '52100000-0000-4000-8000-000000000001', 'Existing Study', 0
);

-- Two approved designer amendments. The first names a room (via roomName, which
-- apply_scope_change resolves to the room it mints in the same call); the
-- second names none, so it exercises the NULL-room branch of the derivation.
INSERT INTO public.scope_change_requests (
  id, project_id, requested_by, request_origin, title, description, status,
  sent_at, approved_at, additional_ffe_budget_cents, additional_design_fee_cents,
  timeline_impact_weeks, new_rooms, new_ffe_items
) VALUES
  ('52300000-0000-4000-8000-000000000001',
   '52100000-0000-4000-8000-000000000001',
   '52000000-0000-4000-8000-000000000001',
   'designer_amendment',
   'Room-scoped amendment', 'Adds a room and a line filed in it.',
   'approved', now(), now(), 500, 200, 1,
   '[{"name":"Reading Nook","roomType":"living","budgetCents":800,"ffeCategories":["lighting"]}]'::jsonb,
   '[{"roomName":"Reading Nook","name":"Floor Lamp","ffeCategory":"lighting","itemType":"allowance","quantity":2,"unitPriceCents":15000}]'::jsonb),
  ('52300000-0000-4000-8000-000000000002',
   '52100000-0000-4000-8000-000000000001',
   '52000000-0000-4000-8000-000000000001',
   'designer_amendment',
   'Project-wide amendment', 'Adds a line with no room.',
   'approved', now(), now(), 0, 0, 0,
   '[]'::jsonb,
   '[{"name":"Hallway runner","ffeCategory":"rugs","itemType":"allowance","quantity":1,"unitPriceCents":40000}]'::jsonb),
  -- Consumed only by the anti-vacuity section, inside a savepoint that is
  -- rolled back. Names an EXISTING room directly, so the reverted body has to
  -- take the room branch on its first item.
  ('52300000-0000-4000-8000-000000000003',
   '52100000-0000-4000-8000-000000000001',
   '52000000-0000-4000-8000-000000000001',
   'designer_amendment',
   'Anti-vacuity amendment', 'Room-scoped line for the reverted body.',
   'approved', now(), now(), 0, 0, 0,
   '[]'::jsonb,
   '[{"project_room_id":"52200000-0000-4000-8000-000000000001","name":"Reverted probe","ffeCategory":"Seating","itemType":"allowance","quantity":1,"unitPriceCents":1000}]'::jsonb);

-- ── Trade-scope engagement fixture ────────────────────────────────────────
-- Enough state for engage_trade_scope to run for real. `status` stays 'draft'
-- so guard_commercial_authored_child / guard_trade_scope_terms allow the child
-- rows to be seeded; `commercial_state` is 'executed', which is the column the
-- RPC actually reads. The RPC never inspects proposals.status.
--
-- Two sections on purpose — one naming a room, one not — so a single engage
-- call exercises BOTH branches of the 00510 derivation.
INSERT INTO public.proposals (
  id, designer_id, client_id, title, document_kind, commercial_state, status, project_id
) VALUES (
  '52400000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000002',
  'Study millwork', 'trade_scope', 'executed', 'draft',
  '52100000-0000-4000-8000-000000000001'
);

INSERT INTO public.trade_scope_terms (proposal_id, client_price_cents, progress_state)
VALUES ('52400000-0000-4000-8000-000000000001', 900000, 'none');

INSERT INTO public.trade_scope_sections (
  proposal_id, project_room_id, prose, allocation_cents, sort_order
) VALUES
  ('52400000-0000-4000-8000-000000000001',
   '52200000-0000-4000-8000-000000000001', 'Study millwork prose', 600000, 0),
  ('52400000-0000-4000-8000-000000000001',
   NULL, 'Whole-house punch list', 300000, 1);

INSERT INTO public.invoices (
  id, project_id, designer_id, status, invoice_number, paid_at,
  total_cents, amount_paid_cents
) VALUES (
  '52500000-0000-4000-8000-000000000001',
  '52100000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000001',
  'paid', 'TS-DEP-0001', now(), 360000, 360000
);

INSERT INTO public.project_commercial_documents (
  id, project_id, proposal_id, document_kind, executed_at, deposit_invoice_id, created_by
) VALUES (
  '52600000-0000-4000-8000-000000000001',
  '52100000-0000-4000-8000-000000000001',
  '52400000-0000-4000-8000-000000000001',
  'trade_scope', now(),
  '52500000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000001'
);

CREATE OR REPLACE FUNCTION pg_temp.assume(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

-- Builds the pre-00510 body of a function by deleting exactly the two lines
-- 00510 added. Both replacements must bite — if either anchor stops matching
-- the migration's text changed and the discriminator would silently become a
-- no-op, so this raises instead.
CREATE OR REPLACE FUNCTION pg_temp.revert_00510(
  p_signature text,
  p_column_anchor text,
  p_column_replacement text,
  p_value_anchor text,
  p_value_replacement text
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_def  text := pg_get_functiondef(p_signature::regprocedure);
  v_next text;
BEGIN
  v_next := replace(v_def, p_column_anchor, p_column_replacement);
  IF v_next = v_def THEN
    RAISE EXCEPTION 'anti-vacuity setup: column anchor did not match in %', p_signature;
  END IF;
  v_def := v_next;

  v_next := replace(v_def, p_value_anchor, p_value_replacement);
  IF v_next = v_def THEN
    RAISE EXCEPTION 'anti-vacuity setup: value anchor did not match in %', p_signature;
  END IF;

  -- Only the INSERT is reverted; the surrounding `-- 00510` prose comment stays,
  -- so a bare `assignment_scope` substring check would false-positive here.
  RETURN v_next;
END;
$$;

-- ── (1) The guard really does require the column ──────────────────────────
-- This is the statement shape both RPCs executed before 00510: a room-scoped
-- row that leaves assignment_scope at its 'unassigned' default.
DO $$
DECLARE
  v_err text;
BEGIN
  BEGIN
    INSERT INTO public.project_ffe_items (
      project_id, project_room_id, name, ffe_category, item_type, quantity,
      unit_price_cents, line_total_cents
    ) VALUES (
      '52100000-0000-4000-8000-000000000001',
      '52200000-0000-4000-8000-000000000001',
      'Unscoped probe', 'Seating', 'fixed', 1, 1000, 1000
    );
    ASSERT false, 'a room-scoped insert that omits assignment_scope must be rejected';
  EXCEPTION WHEN check_violation THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err = 'non-room assignment cannot carry a room',
    format('unexpected guard message: %L', v_err);
END $$;

-- ── (2) apply_scope_change files a room-scoped amendment ──────────────────
DO $$
DECLARE
  v_room uuid;
  v_item public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM pg_temp.assume('52000000-0000-4000-8000-000000000001');
  PERFORM public.apply_scope_change('52300000-0000-4000-8000-000000000001');

  SELECT id INTO v_room FROM public.project_rooms
  WHERE project_id = '52100000-0000-4000-8000-000000000001' AND name = 'Reading Nook';
  ASSERT v_room IS NOT NULL, 'the amendment must have minted its room';

  SELECT * INTO v_item FROM public.project_ffe_items
  WHERE project_id = '52100000-0000-4000-8000-000000000001' AND name = 'Floor Lamp';
  ASSERT FOUND, 'the amendment must have minted its FF&E line';
  ASSERT v_item.project_room_id = v_room,
    'the roomName item must link to the newly inserted room';
  ASSERT v_item.assignment_scope = 'room',
    format('a room-linked amendment line must be filed room, got %L', v_item.assignment_scope);
END $$;

-- ── (3) ANTI-VACUITY for apply_scope_change ───────────────────────────────
SAVEPOINT pre_00510_apply;

DO $$
DECLARE
  v_reverted text;
  v_err      text;
BEGIN
  v_reverted := pg_temp.revert_00510(
    'public.apply_scope_change(uuid)',
    E'      notes,\n      assignment_scope\n    ) VALUES (',
    E'      notes\n    ) VALUES (',
    E'      v_new_item->>''notes'',\n      CASE WHEN v_project_room_id IS NOT NULL THEN ''room'' ELSE ''throughout'' END\n    );',
    E'      v_new_item->>''notes''\n    );'
  );
  EXECUTE v_reverted;

  PERFORM pg_temp.assume('52000000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM public.apply_scope_change('52300000-0000-4000-8000-000000000003');
    ASSERT false,
      'the pre-00510 apply_scope_change body must fail on a room-scoped amendment';
  EXCEPTION WHEN check_violation THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err = 'non-room assignment cannot carry a room',
    format('pre-00510 apply_scope_change failure message: %L', v_err);
END $$;

ROLLBACK TO SAVEPOINT pre_00510_apply;

-- ── (4) apply_scope_change files a room-less amendment 'throughout' ───────
DO $$
DECLARE
  v_item public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM pg_temp.assume('52000000-0000-4000-8000-000000000001');
  PERFORM public.apply_scope_change('52300000-0000-4000-8000-000000000002');

  SELECT * INTO v_item FROM public.project_ffe_items
  WHERE project_id = '52100000-0000-4000-8000-000000000001' AND name = 'Hallway runner';
  ASSERT FOUND, 'the room-less amendment must have minted its line';
  ASSERT v_item.project_room_id IS NULL, 'the room-less line must carry no room';
  ASSERT v_item.assignment_scope = 'throughout',
    format('a room-less amendment line must be filed throughout, got %L',
           v_item.assignment_scope);
END $$;

-- ── (5) ANTI-VACUITY for engage_trade_scope — the old body, EXECUTED ──────
-- Installs the pre-00510 body and calls the real RPC. This must run before
-- section (6): engagement is idempotent, so a scope already engaged would make
-- the reverted body mint nothing and the failure would not reproduce.
SAVEPOINT pre_00510_engage;

DO $$
DECLARE
  v_reverted text;
  v_err      text;
BEGIN
  v_reverted := pg_temp.revert_00510(
    'public.engage_trade_scope(uuid,jsonb)',
    E'      trade_scope_document_id,\n      assignment_scope\n    ) VALUES (',
    E'      trade_scope_document_id\n    ) VALUES (',
    E'      v_document.id,\n      CASE WHEN v_section.project_room_id IS NOT NULL THEN ''room'' ELSE ''throughout'' END\n    );',
    E'      v_document.id\n    );'
  );
  EXECUTE v_reverted;

  PERFORM pg_temp.assume('52000000-0000-4000-8000-000000000001');
  BEGIN
    PERFORM public.engage_trade_scope('52400000-0000-4000-8000-000000000001');
    ASSERT false,
      'the pre-00510 engage_trade_scope body must fail on a room-scoped section';
  EXCEPTION WHEN check_violation THEN
    v_err := SQLERRM;
  END;
  ASSERT v_err = 'non-room assignment cannot carry a room',
    format('pre-00510 engage_trade_scope failure message: %L', v_err);
END $$;

ROLLBACK TO SAVEPOINT pre_00510_engage;

-- ── (6) engage_trade_scope mints both scopes correctly ────────────────────
-- One call, both branches: the room-scoped section lands 'room' with its room,
-- the room-less section lands 'throughout' with no room. Before 00510 this RPC
-- could not complete at all when any section named a room.
DO $$
DECLARE
  v_engaged jsonb;
  v_room    public.project_ffe_items%ROWTYPE;
  v_whole   public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM pg_temp.assume('52000000-0000-4000-8000-000000000001');
  v_engaged := public.engage_trade_scope('52400000-0000-4000-8000-000000000001');

  ASSERT (v_engaged->>'newlyEngaged')::boolean, 'first engagement must be new';
  ASSERT (v_engaged->>'presenceLineCount')::integer = 2,
    format('one presence line per section, got %s', v_engaged->>'presenceLineCount');

  SELECT * INTO v_room FROM public.project_ffe_items
  WHERE trade_scope_document_id = '52600000-0000-4000-8000-000000000001'
    AND project_room_id = '52200000-0000-4000-8000-000000000001';
  ASSERT FOUND, 'the room-scoped section must have minted a presence line';
  ASSERT v_room.assignment_scope = 'room',
    format('a room-scoped section must be filed room, got %L', v_room.assignment_scope);

  SELECT * INTO v_whole FROM public.project_ffe_items
  WHERE trade_scope_document_id = '52600000-0000-4000-8000-000000000001'
    AND project_room_id IS NULL;
  ASSERT FOUND, 'the room-less section must have minted a presence line';
  ASSERT v_whole.assignment_scope = 'throughout',
    format('a room-less section must be filed throughout, not the unassigned default, got %L',
           v_whole.assignment_scope);

  -- The allocations still ride the sections, so the fix did not disturb the
  -- one-price invariant the trade-scope rail depends on.
  ASSERT (SELECT sum(line_total_cents) FROM public.project_ffe_items
          WHERE trade_scope_document_id = '52600000-0000-4000-8000-000000000001') = 900000,
    'presence lines must still sum to the client price';
END $$;

-- ── (7) Both RPCs keep their authorization posture ────────────────────────
DO $$
BEGIN
  ASSERT has_function_privilege('authenticated', 'public.engage_trade_scope(uuid,jsonb)', 'EXECUTE'),
    'authenticated must keep EXECUTE on engage_trade_scope';
  ASSERT NOT has_function_privilege('anon', 'public.engage_trade_scope(uuid,jsonb)', 'EXECUTE'),
    'anon must not hold EXECUTE on engage_trade_scope';
  ASSERT has_function_privilege('authenticated', 'public.apply_scope_change(uuid)', 'EXECUTE'),
    'authenticated must keep EXECUTE on apply_scope_change';
  ASSERT NOT has_function_privilege('anon', 'public.apply_scope_change(uuid)', 'EXECUTE'),
    'anon must not hold EXECUTE on apply_scope_change';
END $$;

ROLLBACK;
