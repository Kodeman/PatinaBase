-- close_project workflow + operational-truth authority regression (00394)
-- Run:
--   scripts/run-supabase-sql-test.sh supabase/tests/document/close_project_readiness_test.sql

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES
  (
    'a7000000-0000-4000-8000-000000000001',
    'close-project-owner@test.invalid', '', NOW(), NOW(), NOW(),
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  ),
  (
    'a7000000-0000-4000-8000-000000000002',
    'close-project-client@test.invalid', '', NOW(), NOW(), NOW(),
    '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
  );

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  (
    'a7000000-0000-4000-8000-000000000001',
    'close-project-owner@test.invalid', 'Close Project Owner', NOW(), NOW()
  ),
  (
    'a7000000-0000-4000-8000-000000000002',
    'close-project-client@test.invalid', 'Close Project Client', NOW(), NOW()
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.designer_clients (id, designer_id, client_id, status)
VALUES (
  'a7050000-0000-4000-8000-000000000001',
  'a7000000-0000-4000-8000-000000000001',
  'a7000000-0000-4000-8000-000000000002',
  'active'
);

INSERT INTO public.projects (
  id, name, designer_id, created_by, client_id, total_amount_cents
)
VALUES
  ('a7100000-0000-4000-8000-000000000001', 'Operational closeout',
   'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', NULL, 320000),
  ('a7100000-0000-4000-8000-000000000002', 'Nonbillable closeout',
   'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', NULL, NULL),
  ('a7100000-0000-4000-8000-000000000003', 'Outstanding invoice closeout',
   'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', NULL, 100000),
  ('a7100000-0000-4000-8000-000000000004', 'Uncollected contract closeout',
   'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', NULL, 100000),
  ('a7100000-0000-4000-8000-000000000005', 'Stale draft invoice header',
   'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', NULL, NULL),
  ('a7100000-0000-4000-8000-000000000010', 'Unfinished phase closeout',
   'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', NULL, NULL),
  ('a7100000-0000-4000-8000-000000000011', 'Unresolved decision closeout',
   'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000002', NULL),
  ('a7100000-0000-4000-8000-000000000012', 'Unresolved amendment closeout',
   'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000002', NULL);

INSERT INTO public.project_phases (
  id, project_id, name, phase_key, status, sort_order
)
VALUES (
  'a7150000-0000-4000-8000-000000000001',
  'a7100000-0000-4000-8000-000000000010',
  'Final walkthrough', 'final_walkthrough', 'delayed', 0
);

INSERT INTO public.client_decisions (
  id, designer_client_id, project_id, title, status
)
VALUES (
  'a7160000-0000-4000-8000-000000000001',
  'a7050000-0000-4000-8000-000000000001',
  'a7100000-0000-4000-8000-000000000011',
  'Choose the final placement', 'draft'
);

INSERT INTO public.scope_change_requests (
  id, project_id, requested_by, request_origin, title, description, status,
  applied_at
)
VALUES
  (
    'a7170000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000012',
    'a7000000-0000-4000-8000-000000000002',
    'client_request',
    'Approved but not applied', 'Add one final built-in', 'approved', NULL
  ),
  (
    'a7170000-0000-4000-8000-000000000002',
    'a7100000-0000-4000-8000-000000000012',
    'a7000000-0000-4000-8000-000000000002',
    'client_request',
    'Declined change', 'No longer wanted', 'declined', NULL
  ),
  (
    'a7170000-0000-4000-8000-000000000003',
    'a7100000-0000-4000-8000-000000000012',
    'a7000000-0000-4000-8000-000000000002',
    'client_request',
    'Cancelled change', 'Withdrawn', 'cancelled', NULL
  );

INSERT INTO public.project_ffe_items (
  id, project_id, name, status, quantity, unit_price_cents, line_total_cents
)
VALUES
  (
    'a7200000-0000-4000-8000-000000000001',
    'a7100000-0000-4000-8000-000000000001',
    'Closeout chair', 'specified', 1, 320000, 320000
  ),
  (
    'a7200000-0000-4000-8000-000000000002',
    'a7100000-0000-4000-8000-000000000001',
    'Client-owned zero-price chair', 'installed', 1, 0, NULL
  );

INSERT INTO public.project_payment_milestones (
  id, project_id, label, percentage, amount_cents, status
)
VALUES (
  'a7300000-0000-4000-8000-000000000001',
  'a7100000-0000-4000-8000-000000000001',
  'Final collection', 100, 320000, 'pending'
);

INSERT INTO public.invoices (
  id, project_id, designer_id, invoice_number, status, subtotal_cents,
  total_cents, amount_paid_cents, paid_at
)
VALUES
  (
    'a7400000-0000-4000-8000-000000000003',
    'a7100000-0000-4000-8000-000000000003',
    'a7000000-0000-4000-8000-000000000001',
    'CLOSE-PARTIAL', 'partially_paid', 100000, 100000, 25000, NULL
  ),
  (
    'a7400000-0000-4000-8000-000000000005',
    'a7100000-0000-4000-8000-000000000005',
    'a7000000-0000-4000-8000-000000000001',
    NULL, 'draft', 0, 0, 0, NULL
  );

INSERT INTO public.invoice_line_items (
  id, invoice_id, kind, description, quantity, unit_amount_cents, amount_cents
)
VALUES (
  'a7500000-0000-4000-8000-000000000005',
  'a7400000-0000-4000-8000-000000000005',
  'adhoc', 'Real work on a stale draft header', 1, 50000, 50000
);

CREATE OR REPLACE FUNCTION pg_temp.assume_closeout_owner()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', 'a7000000-0000-4000-8000-000000000001',
      'role', 'authenticated'
    )::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assume_closeout_actor(p_actor uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_actor, 'role', 'authenticated')::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.complete_closeout()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '[
    {"key":"walkthrough","label":"Walkthrough","completed":true},
    {"key":"punch_list","label":"Punch list","completed":true},
    {"key":"payment","label":"Payment","completed":true},
    {"key":"photography","label":"Photography","completed":true},
    {"key":"photos","label":"Photos","completed":true},
    {"key":"case_study","label":"Case study","completed":true}
  ]'::jsonb;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_close_failure(
  p_project_id uuid,
  p_expected text,
  p_closure jsonb DEFAULT pg_temp.complete_closeout()
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    PERFORM public.close_project(p_project_id, p_closure, '{}'::jsonb);
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;

  ASSERT v_error = p_expected,
    format('expected close_project error %L, got %L', p_expected, v_error);
  ASSERT (SELECT status <> 'completed' FROM public.projects WHERE id = p_project_id),
    'a rejected closeout must not complete the project';
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_project_insert_failure(
  p_project_id uuid,
  p_status public.project_status,
  p_completed_at timestamptz,
  p_forge_guc boolean,
  p_label text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_error text;
BEGIN
  PERFORM set_config(
    'app.project_completion_id',
    CASE WHEN p_forge_guc THEN p_project_id::text ELSE '' END,
    true
  );
  BEGIN
    INSERT INTO public.projects (
      id, name, designer_id, created_by, status, completed_at
    ) VALUES (
      p_project_id,
      p_label,
      'a7000000-0000-4000-8000-000000000001',
      'a7000000-0000-4000-8000-000000000001',
      p_status,
      p_completed_at
    );
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  PERFORM set_config('app.project_completion_id', '', true);

  ASSERT v_error = 'project inserts cannot start in terminal or completed state',
    format('%s should reject, got %L', p_label, v_error);
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.projects WHERE id = p_project_id
  ), format('%s rejected insert must leave no row', p_label);
END;
$$;

DO $$
BEGIN
  ASSERT NOT has_function_privilege(
    'anon', 'public.close_project(uuid,jsonb,jsonb)', 'EXECUTE'
  ), 'anon must not execute close_project';
  ASSERT has_function_privilege(
    'authenticated', 'public.close_project(uuid,jsonb,jsonb)', 'EXECUTE'
  ), 'authenticated owners need close_project EXECUTE';
  ASSERT NOT has_function_privilege(
    'service_role', 'public.close_project(uuid,jsonb,jsonb)', 'EXECUTE'
  ), 'service_role must not bypass close_project owner authority';
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_closeout_owner();

-- Project visibility is not closeout authority. Even the linked client (and,
-- by the same exact-id rule, a studio collaborator) receives the owner-only
-- denial before any checklist or workflow census runs.
SELECT pg_temp.assume_closeout_actor(
  'a7000000-0000-4000-8000-000000000002'
);
DO $$
DECLARE v_error text;
BEGIN
  BEGIN
    PERFORM public.close_project(
      'a7100000-0000-4000-8000-000000000011',
      pg_temp.complete_closeout(), '{}'::jsonb
    );
  EXCEPTION WHEN insufficient_privilege THEN
    v_error := SQLERRM;
  END;

  ASSERT v_error =
    'project a7100000-0000-4000-8000-000000000011 may only be closed by its designer',
    format('non-owner closeout should fail with exact authority error, got %L', v_error);
END;
$$;
SELECT pg_temp.assume_closeout_owner();

-- RLS-valid project creation stays available, but no browser writer may start
-- at a terminal state or pre-stamp completion. The exact completion GUC alone
-- remains forgeable and therefore cannot authorize an INSERT.
INSERT INTO public.projects (
  id, name, designer_id, created_by, status
)
VALUES (
  'a7100000-0000-4000-8000-000000000009',
  'Valid active project',
  'a7000000-0000-4000-8000-000000000001',
  'a7000000-0000-4000-8000-000000000001',
  'active'
);
SELECT pg_temp.expect_project_insert_failure(
  'a7100000-0000-4000-8000-000000000006',
  'completed', NULL, true, 'forged completed insert'
);
SELECT pg_temp.expect_project_insert_failure(
  'a7100000-0000-4000-8000-000000000007',
  'archived', NULL, false, 'archived insert'
);
SELECT pg_temp.expect_project_insert_failure(
  'a7100000-0000-4000-8000-000000000008',
  'active', now(), false, 'pre-stamped active insert'
);

-- RLS update access is not completion authority. Even a forged row-scoped GUC
-- is insufficient because a browser caller remains current_user=authenticated.
DO $$
DECLARE
  v_error text;
BEGIN
  PERFORM set_config(
    'app.project_completion_id',
    'a7100000-0000-4000-8000-000000000002',
    true
  );
  BEGIN
    UPDATE public.projects
    SET status = 'completed'
    WHERE id = 'a7100000-0000-4000-8000-000000000002';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  PERFORM set_config('app.project_completion_id', '', true);

  ASSERT v_error = 'projects may only enter completed through close_project',
    format('direct completion should be rejected despite forged GUC, got %L', v_error);
  ASSERT (SELECT status <> 'completed' FROM public.projects
          WHERE id = 'a7100000-0000-4000-8000-000000000002'),
    'direct bypass must leave project open';
END;
$$;

DO $$
DECLARE
  v_source text := pg_get_functiondef(
    'public.settle_section_on_gate_approval()'::regprocedure
  );
BEGIN
  ASSERT v_source NOT LIKE '%set status = ''completed''%',
    'install gate settlement must not retain a project-completion writer';
END;
$$;

-- close_project locks project children in one documented order. Workflow rows
-- precede the preserved invoice → line → milestone → FF&E operational chain.
DO $$
DECLARE
  v_source text := pg_get_functiondef(
    'public.close_project(uuid,jsonb,jsonb)'::regprocedure
  );
  v_scope_pos integer;
  v_phase_pos integer;
  v_decision_pos integer;
  v_invoice_pos integer;
  v_line_pos integer;
  v_milestone_pos integer;
  v_ffe_pos integer;
BEGIN
  v_scope_pos := position(
    E'FROM public.scope_change_requests AS scope_change\n  WHERE scope_change.project_id = p_project_id\n  ORDER BY scope_change.id\n  FOR UPDATE'
    IN v_source
  );
  v_phase_pos := position(
    E'FROM public.project_phases AS phase\n  WHERE phase.project_id = p_project_id\n  ORDER BY phase.id\n  FOR UPDATE'
    IN v_source
  );
  v_decision_pos := position(
    E'FROM public.client_decisions AS decision\n  WHERE decision.project_id = p_project_id\n  ORDER BY decision.id\n  FOR UPDATE'
    IN v_source
  );
  v_invoice_pos := position(
    E'FROM public.invoices\n  WHERE project_id = p_project_id\n  ORDER BY id\n  FOR UPDATE'
    IN v_source
  );
  v_line_pos := position(
    E'FROM public.invoice_line_items AS line\n  JOIN public.invoices AS invoice ON invoice.id = line.invoice_id\n  WHERE invoice.project_id = p_project_id\n  ORDER BY line.id\n  FOR UPDATE OF line'
    IN v_source
  );
  v_milestone_pos := position(
    E'FROM public.project_payment_milestones\n  WHERE project_id = p_project_id\n  ORDER BY id\n  FOR UPDATE'
    IN v_source
  );
  v_ffe_pos := position(
    E'FROM public.project_ffe_items\n  WHERE project_id = p_project_id\n  ORDER BY id\n  FOR UPDATE'
    IN v_source
  );

  ASSERT v_scope_pos > 0 AND v_phase_pos > 0 AND v_decision_pos > 0
      AND v_invoice_pos > 0 AND v_line_pos > 0
      AND v_milestone_pos > 0 AND v_ffe_pos > 0,
    'close_project must retain explicit ordered child locks';
  ASSERT v_scope_pos < v_decision_pos
      AND v_decision_pos < v_phase_pos
      AND v_phase_pos < v_invoice_pos
      AND v_invoice_pos < v_line_pos
      AND v_line_pos < v_milestone_pos
      AND v_milestone_pos < v_ffe_pos,
    'close_project lock order must be scope -> decision -> phase -> invoice -> line -> milestone -> FF&E';
END;
$$;

-- A checklist is workflow evidence, not an optional payload.
SELECT pg_temp.expect_close_failure(
  'a7100000-0000-4000-8000-000000000002',
  'project closeout checklist must include every required item as completed',
  '[{"key":"walkthrough","completed":true}]'::jsonb
);

-- The review request is deliberately absent from complete_closeout(). A real
-- request becomes available after completion; it is never a self-attested
-- precondition. Empty operational sets + no contract value represent a real
-- nonbillable project.
DO $$
DECLARE
  v_project public.projects;
BEGIN
  v_project := public.close_project(
    'a7100000-0000-4000-8000-000000000002',
    pg_temp.complete_closeout(),
    '{"headline":"A consulting engagement"}'::jsonb
  );
  ASSERT v_project.status = 'completed',
    'zero-item/nonbillable projects should be closable';
END;
$$;

-- Every stored phase must reach the sole terminal phase state. Delayed remains
-- promised work and blocks until phase authority records completion.
SELECT pg_temp.expect_close_failure(
  'a7100000-0000-4000-8000-000000000010',
  'project cannot close: 1 project phase(s) are not completed'
);

SELECT public.advance_project_phase(
  'a7100000-0000-4000-8000-000000000010',
  'a7150000-0000-4000-8000-000000000001',
  'delayed'
);
SELECT public.advance_project_phase(
  'a7100000-0000-4000-8000-000000000010',
  'a7150000-0000-4000-8000-000000000001',
  'in_progress'
);

DO $$
DECLARE v_project public.projects;
BEGIN
  v_project := public.close_project(
    'a7100000-0000-4000-8000-000000000010',
    pg_temp.complete_closeout(), '{}'::jsonb
  );
  ASSERT v_project.status = 'completed',
    'a project with only completed phases should close';
END;
$$;

-- Both nonterminal decision states block, even for a non-blocking row. Expired
-- is a guarded terminal status and may close, just like responded.
SELECT pg_temp.expect_close_failure(
  'a7100000-0000-4000-8000-000000000011',
  'project cannot close: 1 coordination/decision item(s) are unresolved'
);

SELECT public.publish_client_decision(
  'a7160000-0000-4000-8000-000000000001'
);

SELECT pg_temp.expect_close_failure(
  'a7100000-0000-4000-8000-000000000011',
  'project cannot close: 1 coordination/decision item(s) are unresolved'
);

SELECT public.expire_client_decision(
  'a7160000-0000-4000-8000-000000000001'
);

DO $$
DECLARE v_project public.projects;
BEGIN
  v_project := public.close_project(
    'a7100000-0000-4000-8000-000000000011',
    pg_temp.complete_closeout(), '{}'::jsonb
  );
  ASSERT v_project.status = 'completed',
    'expired decisions are terminal and should not strand closeout';
END;
$$;

-- Declined/cancelled amendments are terminal. Approved remains open until the
-- actual apply act stamps applied_at, so it cannot be erased by completion.
SELECT pg_temp.expect_close_failure(
  'a7100000-0000-4000-8000-000000000012',
  'project cannot close: 1 scope change request(s) are unresolved'
);

SELECT public.apply_scope_change(
  'a7170000-0000-4000-8000-000000000001'
);

DO $$
DECLARE v_project public.projects;
BEGIN
  v_project := public.close_project(
    'a7100000-0000-4000-8000-000000000012',
    pg_temp.complete_closeout(), '{}'::jsonb
  );
  ASSERT v_project.status = 'completed',
    'applied/declined/cancelled scope changes are terminal';
END;
$$;

-- Installation is required before billing can make an FF&E item complete.
SELECT pg_temp.expect_close_failure(
  'a7100000-0000-4000-8000-000000000001',
  'project cannot close: 1 FF&E item(s) are not installed'
);

UPDATE public.project_ffe_items
SET status = 'installed'
WHERE id = 'a7200000-0000-4000-8000-000000000001';

-- Installed but uninvoiced is still open work.
SELECT pg_temp.expect_close_failure(
  'a7100000-0000-4000-8000-000000000001',
  'project cannot close: 1 FF&E item(s) are not fully invoiced and paid'
);

-- Fixture setup crosses the real invoice lifecycle's draft-only line policy;
-- switch back to the test owner (postgres) only to materialize its final paid
-- state, then immediately restore the authenticated caller for every RPC.
RESET ROLE;
INSERT INTO public.invoices (
  id, project_id, designer_id, invoice_number, status, subtotal_cents,
  total_cents, amount_paid_cents, paid_at
)
VALUES (
  'a7400000-0000-4000-8000-000000000001',
  'a7100000-0000-4000-8000-000000000001',
  'a7000000-0000-4000-8000-000000000001',
  'CLOSE-PAID', 'paid', 320000, 320000, 320000, NOW()
);

INSERT INTO public.invoice_line_items (
  id, invoice_id, kind, ffe_item_id, description, quantity,
  unit_amount_cents, amount_cents
)
VALUES (
  'a7500000-0000-4000-8000-000000000001',
  'a7400000-0000-4000-8000-000000000001',
  'ffe', 'a7200000-0000-4000-8000-000000000001',
  'Closeout chair', 1, 319999, 319999
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_closeout_owner();

-- A paid header does not make a one-cent/partial FF&E line complete.
SELECT pg_temp.expect_close_failure(
  'a7100000-0000-4000-8000-000000000001',
  'project cannot close: 1 FF&E item(s) are not fully invoiced and paid'
);

RESET ROLE;
-- Reproduce a historical/imported split-line shape. The current UI's unique
-- live-slot index prevents creating it prospectively; closeout must still sum
-- such rows if they exist in migrated business data. The surrounding test
-- transaction restores the index at ROLLBACK.
DROP INDEX public.uniq_invoice_line_items_ffe_item;
INSERT INTO public.invoice_line_items (
  id, invoice_id, kind, ffe_item_id, description, quantity,
  unit_amount_cents, amount_cents
)
VALUES (
  'a7500000-0000-4000-8000-000000000002',
  'a7400000-0000-4000-8000-000000000001',
  'ffe', 'a7200000-0000-4000-8000-000000000001',
  'Closeout chair adjustment', 1, 1, 1
);
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_closeout_owner();

-- Paid coverage is cumulative across split lines: neither line alone reaches
-- 320000, but 319999 + 1 fully covers the FF&E item. The next truthful blocker
-- is therefore the explicit unpaid milestone, not a false invoice dead end.
SELECT pg_temp.expect_close_failure(
  'a7100000-0000-4000-8000-000000000001',
  'project cannot close: 1 positive payment milestone(s) are not paid'
);

UPDATE public.project_payment_milestones
SET status = 'paid', paid_at = NOW()
WHERE id = 'a7300000-0000-4000-8000-000000000001';

DO $$
DECLARE
  v_project public.projects;
BEGIN
  v_project := public.close_project(
    'a7100000-0000-4000-8000-000000000001',
    pg_temp.complete_closeout(),
    '{"headline":"Operationally complete"}'::jsonb
  );
  ASSERT v_project.status = 'completed',
    'installed + invoiced + collected work should close';
  ASSERT v_project.portfolio_snapshot->>'headline' = 'Operationally complete',
    'close_project must still atomically persist the portfolio snapshot';
END;
$$;

-- Completion is terminal project truth. Even the owner cannot directly reopen
-- it after close_project returns; the only next state is the checked archive act.
DO $$
DECLARE
  v_error text;
BEGIN
  BEGIN
    UPDATE public.projects
    SET status = 'active'
    WHERE id = 'a7100000-0000-4000-8000-000000000001';
  EXCEPTION WHEN check_violation THEN
    v_error := SQLERRM;
  END;
  ASSERT v_error = 'completed projects may only move to the archive',
    format('direct project reopen should reject, got %L', v_error);
  ASSERT (SELECT status = 'completed'
          FROM public.projects
          WHERE id = 'a7100000-0000-4000-8000-000000000001'),
    'rejected reopen must preserve completed state';
END;
$$;

-- Header-level receivables block closeout even without FF&E lines.
SELECT pg_temp.expect_close_failure(
  'a7100000-0000-4000-8000-000000000003',
  'project cannot close: 1 invoice(s) still carry a balance'
);

-- A positive contract with no invoices is not silently treated as paid.
SELECT pg_temp.expect_close_failure(
  'a7100000-0000-4000-8000-000000000004',
  'project cannot close: contract total is not fully collected'
);

-- Header total_cents is advisory for a nonempty draft. Positive canonical
-- lines must block closeout even when the stale header still says zero.
SELECT pg_temp.expect_close_failure(
  'a7100000-0000-4000-8000-000000000005',
  'project cannot close: 1 invoice(s) still carry a balance'
);

ROLLBACK;
