-- close_project operational-truth + authority regression (00383, 00387)
-- Run:
--   psql 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' \
--     -v ON_ERROR_STOP=1 -f supabase/tests/document/close_project_readiness_test.sql

BEGIN;

INSERT INTO auth.users (
  id, email, encrypted_password, email_confirmed_at, created_at, updated_at,
  instance_id, aud, role
)
VALUES (
  'a7000000-0000-4000-8000-000000000001',
  'close-project-owner@test.invalid', '', NOW(), NOW(), NOW(),
  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'
);

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES (
  'a7000000-0000-4000-8000-000000000001',
  'close-project-owner@test.invalid', 'Close Project Owner', NOW(), NOW()
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.projects (
  id, name, designer_id, created_by, total_amount_cents
)
VALUES
  ('a7100000-0000-4000-8000-000000000001', 'Operational closeout',
   'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 320000),
  ('a7100000-0000-4000-8000-000000000002', 'Nonbillable closeout',
   'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', NULL),
  ('a7100000-0000-4000-8000-000000000003', 'Outstanding invoice closeout',
   'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 100000),
  ('a7100000-0000-4000-8000-000000000004', 'Uncollected contract closeout',
   'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', 100000),
  ('a7100000-0000-4000-8000-000000000005', 'Stale draft invoice header',
   'a7000000-0000-4000-8000-000000000001', 'a7000000-0000-4000-8000-000000000001', NULL);

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
    {"key":"case_study","label":"Case study","completed":true},
    {"key":"review","label":"Review","completed":true}
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

SET LOCAL ROLE authenticated;
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

-- close_project shares rows with issue_invoice, record_invoice_payment /
-- apply_invoice_payment_effects, void_invoice, and direct invoice-line edits.
-- Lock them in the canonical dependency direction so two valid operations do
-- not form invoice<->milestone or line<->FF&E deadlock cycles.
DO $$
DECLARE
  v_source text := pg_get_functiondef(
    'public.close_project(uuid,jsonb,jsonb)'::regprocedure
  );
  v_invoice_pos integer;
  v_line_pos integer;
  v_milestone_pos integer;
  v_ffe_pos integer;
BEGIN
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

  ASSERT v_invoice_pos > 0 AND v_line_pos > 0
      AND v_milestone_pos > 0 AND v_ffe_pos > 0,
    'close_project must retain explicit ordered child locks';
  ASSERT v_invoice_pos < v_line_pos
      AND v_line_pos < v_milestone_pos
      AND v_milestone_pos < v_ffe_pos,
    'close_project lock order must be invoice -> line -> milestone -> FF&E';
END;
$$;

-- A checklist is workflow evidence, not an optional payload.
SELECT pg_temp.expect_close_failure(
  'a7100000-0000-4000-8000-000000000002',
  'project closeout checklist must include every required item as completed',
  '[{"key":"walkthrough","completed":true}]'::jsonb
);

-- The same project is valid once all workflow items are attested: empty
-- operational sets + no contract value represent a real nonbillable project.
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
UPDATE public.invoice_line_items
SET unit_amount_cents = 320000,
    amount_cents = 320000
WHERE id = 'a7500000-0000-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.assume_closeout_owner();

-- Full positive-value line coverage does not erase an explicit unpaid project
-- milestone. The installed zero/unpriced FF&E row has no invoice by design and
-- does not add a billing blocker.
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
