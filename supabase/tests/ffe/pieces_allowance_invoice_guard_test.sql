-- ═══════════════════════════════════════════════════════════════════════════
-- pieces_allowance_invoice_guard_test — 00764 (US-21 T-60k, SQ-709; QA F21)
-- ═══════════════════════════════════════════════════════════════════════════
-- An allowance with no price yet is not billable, on every path that writes
-- an invoice line naming an FF&E line, and it never reads as billed:
--   A1 create_draft_invoice refuses it: 'An allowance bills once it's filled.'
--      (23514), and the whole draft is refused with it.
--   A2 add_invoice_billing_lines refuses it as a deposit.
--   A3 a direct draft-line insert under RLS refuses it.
--   A4 coverage still reads it uninvoiced, with no billing slot.
--   B1 once filled, it bills at its real price beside a fixed line, and
--      coverage reads it invoiced.
--   C1 an existing line keeps its edits (same ffe_item_id); repointing a line
--      at an unfilled allowance is refused.
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL timezone TO 'UTC';
SET LOCAL statement_timeout = '60s';

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('76400000-0000-4000-8000-0000000000a1', 't60k-owner@test.invalid',  '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('76400000-0000-4000-8000-0000000000a6', 't60k-client@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('76400000-0000-4000-8000-0000000000a1', 't60k-owner@test.invalid',  'T60k Owner',  NOW(), NOW()),
  ('76400000-0000-4000-8000-0000000000a6', 't60k-client@test.invalid', 'T60k Client', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT '76400000-0000-4000-8000-0000000000a1', role.id
  FROM roles AS role WHERE role.domain = 'designer' ORDER BY role.id LIMIT 1;

INSERT INTO organizations (id, type, name, slug)
VALUES ('76400000-0000-4000-8000-0000000000f1', 'design_studio', 'T60k Studio', 't60k-studio-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES ('76400000-0000-4000-8000-0000000000e1', '76400000-0000-4000-8000-0000000000a1',
        '76400000-0000-4000-8000-0000000000f1', 'owner', 'active', NOW());

INSERT INTO projects (id, name, designer_id, client_id, created_by, studio_id)
VALUES ('76400000-0000-4000-8000-000000000001', 'T60k Walk', '76400000-0000-4000-8000-0000000000a1',
        '76400000-0000-4000-8000-0000000000a6', '76400000-0000-4000-8000-0000000000a1',
        '76400000-0000-4000-8000-0000000000f1');

INSERT INTO designer_clients (id, designer_id, client_id, status)
VALUES ('76400000-0000-4000-8000-0000000000d1', '76400000-0000-4000-8000-0000000000a1',
        '76400000-0000-4000-8000-0000000000a6', 'active');

INSERT INTO project_rooms (id, project_id, name, sort_order)
VALUES ('76400000-0000-4000-8000-0000000000c1', '76400000-0000-4000-8000-000000000001', 'Living Room', 0);

-- 201 the rug: an allowance, $4,500 ceiling, no price yet (the 00066 default 0).
-- 202 the table: a fixed line at $6,800.
-- 203 a second unfilled allowance, price null.
INSERT INTO project_ffe_items (id, project_id, project_room_id, assignment_scope, name, status, quantity,
                               item_type, unit_price_cents, line_total_cents, budget_max_cents, design_disposition)
VALUES
  ('76400000-0000-4000-8000-000000000201', '76400000-0000-4000-8000-000000000001', '76400000-0000-4000-8000-0000000000c1', 'room',
   'Area rug, 9 × 12', 'specified', 1, 'allowance', 0, 0, 450000, 'selected'),
  ('76400000-0000-4000-8000-000000000202', '76400000-0000-4000-8000-000000000001', '76400000-0000-4000-8000-0000000000c1', 'room',
   'Dining table, walnut', 'specified', 1, 'fixed', 680000, 680000, NULL, 'selected'),
  ('76400000-0000-4000-8000-000000000203', '76400000-0000-4000-8000-000000000001', '76400000-0000-4000-8000-0000000000c1', 'room',
   'Sconces', 'specified', 2, 'allowance', NULL, NULL, 130000, 'selected');

-- 301: a draft invoice for the direct-write and billing-writer cases.
INSERT INTO invoices (id, project_id, designer_id, client_id, studio_id, status, tax_rate)
VALUES ('76400000-0000-4000-8000-000000000301', '76400000-0000-4000-8000-000000000001',
        '76400000-0000-4000-8000-0000000000a1', '76400000-0000-4000-8000-0000000000a6',
        '76400000-0000-4000-8000-0000000000f1', 'draft', 0);

-- ─── helpers ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION pg_temp.raised(p_sql text)
RETURNS text AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ' ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.act(p_user uuid)
RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.as_owner(p_sql text)
RETURNS void SECURITY DEFINER AS $$
BEGIN
  EXECUTE p_sql;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.check(p_ok boolean, p_message text)
RETURNS void AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION '%', p_message;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- A create_draft_invoice call on the fixture project with the given lines.
CREATE OR REPLACE FUNCTION pg_temp.draft_sql(p_lines jsonb)
RETURNS text AS $$
  SELECT format(
    'SELECT public.create_draft_invoice(%L::uuid, %L::uuid, %L::uuid, %L::uuid, 0, 15, NULL, NULL, %L::jsonb)',
    '76400000-0000-4000-8000-000000000001', '76400000-0000-4000-8000-0000000000a1',
    '76400000-0000-4000-8000-0000000000a6', '76400000-0000-4000-8000-0000000000f1', p_lines);
$$ LANGUAGE sql;

GRANT EXECUTE ON FUNCTION pg_temp.raised(text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.act(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.as_owner(text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.check(boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.draft_sql(jsonb) TO authenticated;

SELECT pg_temp.act('76400000-0000-4000-8000-0000000000a1');
SET LOCAL ROLE authenticated;

-- ─── A: an unfilled allowance is refused on every path ─────────────────────

DO $$
DECLARE
  v_err text;
  v_before integer;
BEGIN
  SELECT count(*) INTO v_before FROM public.invoices WHERE project_id = '76400000-0000-4000-8000-000000000001';

  -- A1: create_draft_invoice, the rug beside the table: the whole draft refuses.
  v_err := pg_temp.raised(pg_temp.draft_sql(jsonb_build_array(
    jsonb_build_object('kind', 'ffe', 'ffe_item_id', '76400000-0000-4000-8000-000000000202',
      'description', 'Dining table, walnut', 'quantity', 1, 'unit_amount_cents', 680000, 'sort_order', 0),
    jsonb_build_object('kind', 'ffe', 'ffe_item_id', '76400000-0000-4000-8000-000000000201',
      'description', 'Area rug, 9 × 12 — Living Room', 'quantity', 1, 'unit_amount_cents', 0, 'sort_order', 1))));
  PERFORM pg_temp.check(v_err = '23514 An allowance bills once it''s filled.',
    'FAIL A1: create_draft_invoice refuses the unfilled rug, got ' || COALESCE(v_err, 'no error'));
  PERFORM pg_temp.check(
    (SELECT count(*) FROM public.invoices WHERE project_id = '76400000-0000-4000-8000-000000000001') = v_before,
    'FAIL A1: the refused draft left no invoice behind');

  -- A1: a null-price allowance is refused the same way.
  v_err := pg_temp.raised(pg_temp.draft_sql(jsonb_build_array(
    jsonb_build_object('kind', 'ffe', 'ffe_item_id', '76400000-0000-4000-8000-000000000203',
      'description', 'Sconces', 'quantity', 2, 'unit_amount_cents', 0, 'sort_order', 0))));
  PERFORM pg_temp.check(v_err = '23514 An allowance bills once it''s filled.',
    'FAIL A1: create_draft_invoice refuses a null-price allowance, got ' || COALESCE(v_err, 'no error'));

  -- A2: the billing writer, as a deposit.
  v_err := pg_temp.raised(format(
    'SELECT public.add_invoice_billing_lines(%L::uuid, %L::jsonb)',
    '76400000-0000-4000-8000-000000000301',
    jsonb_build_array(jsonb_build_object('ffeItemId', '76400000-0000-4000-8000-000000000201',
      'stage', 'deposit', 'depositPct', 50))));
  PERFORM pg_temp.check(v_err = '23514 An allowance bills once it''s filled.',
    'FAIL A2: add_invoice_billing_lines refuses the rug deposit, got ' || COALESCE(v_err, 'no error'));

  -- A3: a direct draft-line insert under RLS (useUpsertLineItems).
  v_err := pg_temp.raised(format(
    'INSERT INTO public.invoice_line_items (invoice_id, kind, ffe_item_id, description, quantity, unit_amount_cents, amount_cents, sort_order)
     VALUES (%L, ''ffe'', %L, ''Area rug'', 1, 0, 0, 0)',
    '76400000-0000-4000-8000-000000000301', '76400000-0000-4000-8000-000000000201'));
  PERFORM pg_temp.check(v_err = '23514 An allowance bills once it''s filled.',
    'FAIL A3: a direct insert refuses the rug, got ' || COALESCE(v_err, 'no error'));

  -- A4: nothing counts the rug as billed.
  PERFORM pg_temp.check(
    (SELECT coverage FROM public.get_ffe_invoice_coverage('76400000-0000-4000-8000-000000000001')
      WHERE ffe_item_id = '76400000-0000-4000-8000-000000000201') = 'uninvoiced',
    'FAIL A4: the rug reads uninvoiced');
  PERFORM pg_temp.check(
    NOT EXISTS (SELECT 1 FROM public.get_ffe_invoice_stage_coverage('76400000-0000-4000-8000-000000000001')
                 WHERE ffe_item_id = '76400000-0000-4000-8000-000000000201'),
    'FAIL A4: the rug holds no billing slot');
END;
$$;

-- ─── B: once filled, it bills at its real price ────────────────────────────

DO $$
DECLARE
  v_err text;
  v_invoice public.invoices%ROWTYPE;
  v_rug public.invoice_line_items%ROWTYPE;
BEGIN
  PERFORM pg_temp.as_owner($q$UPDATE public.project_ffe_items
     SET unit_price_cents = 410000, line_total_cents = 410000
   WHERE id = '76400000-0000-4000-8000-000000000201'$q$);

  SELECT * INTO v_invoice FROM public.create_draft_invoice(
    '76400000-0000-4000-8000-000000000001', '76400000-0000-4000-8000-0000000000a1',
    '76400000-0000-4000-8000-0000000000a6', '76400000-0000-4000-8000-0000000000f1', 0, 15, NULL, NULL,
    jsonb_build_array(
      jsonb_build_object('kind', 'ffe', 'ffe_item_id', '76400000-0000-4000-8000-000000000202',
        'description', 'Dining table, walnut', 'quantity', 1, 'unit_amount_cents', 680000, 'sort_order', 0),
      jsonb_build_object('kind', 'ffe', 'ffe_item_id', '76400000-0000-4000-8000-000000000201',
        'description', 'Area rug, 9 × 12 — Living Room', 'quantity', 1, 'unit_amount_cents', 410000, 'sort_order', 1)));
  PERFORM pg_temp.check(v_invoice.subtotal_cents = 1090000,
    'FAIL B1: table $6,800 + filled rug $4,100, got ' || COALESCE(v_invoice.subtotal_cents::text, 'NULL'));
  SELECT * INTO v_rug FROM public.invoice_line_items
   WHERE invoice_id = v_invoice.id AND ffe_item_id = '76400000-0000-4000-8000-000000000201';
  PERFORM pg_temp.check(v_rug.amount_cents = 410000, 'FAIL B1: the filled rug bills $4,100');
  PERFORM pg_temp.check(
    (SELECT coverage FROM public.get_ffe_invoice_coverage('76400000-0000-4000-8000-000000000001')
      WHERE ffe_item_id = '76400000-0000-4000-8000-000000000201') = 'invoiced',
    'FAIL B1: the filled rug reads invoiced');

  -- C1: an existing line keeps its edits while it names the same line ...
  PERFORM pg_temp.as_owner($q$UPDATE public.project_ffe_items
     SET unit_price_cents = 0, line_total_cents = 0
   WHERE id = '76400000-0000-4000-8000-000000000201'$q$);
  v_err := pg_temp.raised(format(
    'UPDATE public.invoice_line_items SET description = ''Area rug'', ffe_item_id = ffe_item_id WHERE id = %L',
    v_rug.id));
  PERFORM pg_temp.check(v_err IS NULL, 'FAIL C1: an edit that keeps the line passes, got ' || COALESCE(v_err, ''));

  -- ... but cannot be repointed at an unfilled allowance.
  v_err := pg_temp.raised(format(
    'UPDATE public.invoice_line_items SET ffe_item_id = %L WHERE id = %L',
    '76400000-0000-4000-8000-000000000203', v_rug.id));
  PERFORM pg_temp.check(v_err = '23514 An allowance bills once it''s filled.',
    'FAIL C1: repointing at the sconces is refused, got ' || COALESCE(v_err, 'no error'));
END;
$$;

RESET ROLE;

-- The guard is reachable by no API role.
DO $$
BEGIN
  PERFORM pg_temp.check(
    NOT has_function_privilege('authenticated', 'public._ffe_guard_unfilled_allowance_invoice_line()', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public._ffe_guard_unfilled_allowance_invoice_line()', 'EXECUTE'),
    'FAIL G: the trigger function is executable by no API role');
END;
$$;

DO $$ BEGIN RAISE NOTICE 'pieces_allowance_invoice_guard_test: all cases passed (A, B, C, G)'; END $$;

ROLLBACK;
