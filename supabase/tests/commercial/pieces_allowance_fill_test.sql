-- ═══════════════════════════════════════════════════════════════════════════
-- US-21 T-46 — an allowance filled at or under its ceiling (migration 00752;
-- SQ-652; D10, Q12)
--
-- CONTRACT §2 00752. Anchors: place_product_in_project_v2 base 00447:190,
-- its fill guard 00447:256-269; the fill itself _place_product_in_project_v2_
-- 00438_impl 00737:197 (unit price = product retail, line total = quantity ×
-- that price); the frozen ceiling is furnishing_authorization_items.
-- client_line_total_cents (00744:383, budget_max_cents for an allowance).
--
-- Authorization No. 2 is signed (executed). It froze three allowance
-- placeholders at 2 × $450 = $900 each, and a fixed placeholder at $400.
-- Authorization No. 1 is sent; it holds a fourth allowance.
--
-- Cases:
--   A. At the ceiling: 2 × $450 = $900. Filled; one row, variance 0; the line
--      stays an allowance; the authorization is not voided.
--   U. Under: 2 × $300 = $600. Filled; variance $300; the signed $900 budget
--      is kept even when the request names another.
--   P. A replay of A returns the stored receipt and records no second row.
--   O. Over: 2 × $500 = $1,000. Refused with the Record a change sentence;
--      nothing written.
--   T. The over line asked to fill as fixed: refused as before 00752.
--   F. A fixed placeholder on the signed authorization: refused as before.
--   S. An allowance on a sent authorization: refused as before.
--   N. An allowance on no authorization fills as before and records no row.
--   R. Access: the studio reads its rows, another studio reads none; no API
--      role may write the table; anon has no SELECT.
--
-- How to run (local stack, after applying 00752):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/commercial/pieces_allowance_fill_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL timezone TO 'UTC';
SET LOCAL statement_timeout = '60s';

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('75200000-0000-4000-8000-0000000000a1', 't46-owner@test.invalid',   '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- O
  ('75200000-0000-4000-8000-0000000000a5', 't46-owner-b@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- B

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('75200000-0000-4000-8000-0000000000a1', 't46-owner@test.invalid',   'T46 Owner',   true, now(), now()),
  ('75200000-0000-4000-8000-0000000000a5', 't46-owner-b@test.invalid', 'T46 Owner B', true, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug)
VALUES
  ('75200000-0000-4000-8000-0000000000f1', 'design_studio', 'T46 Studio A', 't46-studio-a-test'),
  ('75200000-0000-4000-8000-0000000000f2', 'design_studio', 'T46 Studio B', 't46-studio-b-test');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('75200000-0000-4000-8000-0000000000e1', '75200000-0000-4000-8000-0000000000a1', '75200000-0000-4000-8000-0000000000f1', 'owner', 'active', now()),
  ('75200000-0000-4000-8000-0000000000e5', '75200000-0000-4000-8000-0000000000a5', '75200000-0000-4000-8000-0000000000f2', 'owner', 'active', now());

INSERT INTO public.projects (id, name, designer_id, created_by, studio_id, status)
VALUES ('75200000-0000-4000-8000-000000000001', 'T46 Whole Home',
        '75200000-0000-4000-8000-0000000000a1', '75200000-0000-4000-8000-0000000000a1',
        '75200000-0000-4000-8000-0000000000f1', 'active');

INSERT INTO public.vendors (id, name)
VALUES ('75200000-0000-4000-8000-000000000011', 'T46 Lighting House');

-- Retail is the client price the fill writes (00737:228).
INSERT INTO public.products (id, name, captured_at, layer, owner_user_id, vendor_id, price_retail, price_trade)
VALUES
  ('75200000-0000-4000-8000-000000000021', 'T46 Sconce at',    now(), 'personal', '75200000-0000-4000-8000-0000000000a1', '75200000-0000-4000-8000-000000000011', 45000, 30000),
  ('75200000-0000-4000-8000-000000000022', 'T46 Sconce under', now(), 'personal', '75200000-0000-4000-8000-0000000000a1', '75200000-0000-4000-8000-000000000011', 30000, 20000),
  ('75200000-0000-4000-8000-000000000023', 'T46 Sconce over',  now(), 'personal', '75200000-0000-4000-8000-0000000000a1', '75200000-0000-4000-8000-000000000011', 50000, 35000);

-- Lines (fixture writes, as postgres):
--   201 at      allowance 2 × ceiling $900, signed      → A, P
--   202 under   allowance 2 × ceiling $900, signed      → U
--   203 over    allowance 2 × ceiling $900, signed      → O, T
--   204 fixed   fixed 1 × $400, no product, signed      → F
--   205 sent    allowance 2 × ceiling $900, sent        → S
--   206 open    allowance 2 × ceiling $900, unreleased  → N
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, product_id, vendor_id, vendor_name, quantity,
  unit_price_cents, line_total_cents, budget_min_cents, budget_max_cents, design_disposition, sort_order
) VALUES
  ('75200000-0000-4000-8000-000000000201', '75200000-0000-4000-8000-000000000001', 'Hall sconces',
   'approved', 'allowance', NULL, '75200000-0000-4000-8000-000000000011', 'T46 Lighting House', 2, 0, 0, 0, 90000, 'selected', 0),
  ('75200000-0000-4000-8000-000000000202', '75200000-0000-4000-8000-000000000001', 'Stair sconces',
   'approved', 'allowance', NULL, '75200000-0000-4000-8000-000000000011', 'T46 Lighting House', 2, 0, 0, 0, 90000, 'selected', 1),
  ('75200000-0000-4000-8000-000000000203', '75200000-0000-4000-8000-000000000001', 'Bath sconces',
   'approved', 'allowance', NULL, '75200000-0000-4000-8000-000000000011', 'T46 Lighting House', 2, 0, 0, 0, 90000, 'selected', 2),
  ('75200000-0000-4000-8000-000000000204', '75200000-0000-4000-8000-000000000001', 'Entry pendant',
   'approved', 'fixed', NULL, '75200000-0000-4000-8000-000000000011', 'T46 Lighting House', 1, 40000, 40000, NULL, NULL, 'selected', 3),
  ('75200000-0000-4000-8000-000000000205', '75200000-0000-4000-8000-000000000001', 'Porch sconces',
   'specified', 'allowance', NULL, '75200000-0000-4000-8000-000000000011', 'T46 Lighting House', 2, 0, 0, 0, 90000, 'selected', 4),
  ('75200000-0000-4000-8000-000000000206', '75200000-0000-4000-8000-000000000001', 'Garage sconces',
   'specified', 'allowance', NULL, '75200000-0000-4000-8000-000000000011', 'T46 Lighting House', 2, 0, 0, 0, 90000, 'selected', 5);

INSERT INTO public.project_ffe_specs (ffe_item_id)
SELECT id FROM public.project_ffe_items WHERE project_id = '75200000-0000-4000-8000-000000000001'
ON CONFLICT (ffe_item_id) DO NOTHING;

-- Authorization No. 1 (sent): the porch sconces. Authorization No. 2
-- (executed): 201–204, each live line carrying its provenance as execution
-- writes it (00578:3893).
INSERT INTO public.proposals (id, project_id, designer_id, title, status, document_kind, commercial_state, total_amount, subtotal)
VALUES
  ('75200000-0000-4000-8000-000000000401', '75200000-0000-4000-8000-000000000001', '75200000-0000-4000-8000-0000000000a1',
   'T46 Authorization No. 1', 'sent', 'furnishings_authorization', 'sent', 90000, 90000),
  ('75200000-0000-4000-8000-000000000411', '75200000-0000-4000-8000-000000000001', '75200000-0000-4000-8000-0000000000a1',
   'T46 Authorization No. 2', 'accepted', 'furnishings_authorization', 'executed', 310000, 310000);
INSERT INTO public.project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin, bound_at, executed_at, created_by)
VALUES
  ('75200000-0000-4000-8000-000000000402', '75200000-0000-4000-8000-000000000001', '75200000-0000-4000-8000-000000000401',
   'furnishings_authorization', 'Authorization No. 1', false, now(), NULL, '75200000-0000-4000-8000-0000000000a1'),
  ('75200000-0000-4000-8000-000000000412', '75200000-0000-4000-8000-000000000001', '75200000-0000-4000-8000-000000000411',
   'furnishings_authorization', 'Authorization No. 2', false, now(), now(), '75200000-0000-4000-8000-0000000000a1');
INSERT INTO public.furnishing_authorization_items (
  id, commercial_document_id, source_ffe_item_id, name, room_name, category, item_type,
  quantity, client_unit_price_cents, client_line_total_cents, vendor_id, vendor_name, sort_order
) VALUES
  ('75200000-0000-4000-8000-000000000405', '75200000-0000-4000-8000-000000000402', '75200000-0000-4000-8000-000000000205',
   'Porch sconces', 'Throughout', 'lighting', 'allowance', 2, 45000, 90000, '75200000-0000-4000-8000-000000000011', 'T46 Lighting House', 0),
  ('75200000-0000-4000-8000-000000000421', '75200000-0000-4000-8000-000000000412', '75200000-0000-4000-8000-000000000201',
   'Hall sconces', 'Throughout', 'lighting', 'allowance', 2, 45000, 90000, '75200000-0000-4000-8000-000000000011', 'T46 Lighting House', 0),
  ('75200000-0000-4000-8000-000000000422', '75200000-0000-4000-8000-000000000412', '75200000-0000-4000-8000-000000000202',
   'Stair sconces', 'Throughout', 'lighting', 'allowance', 2, 45000, 90000, '75200000-0000-4000-8000-000000000011', 'T46 Lighting House', 1),
  ('75200000-0000-4000-8000-000000000423', '75200000-0000-4000-8000-000000000412', '75200000-0000-4000-8000-000000000203',
   'Bath sconces', 'Throughout', 'lighting', 'allowance', 2, 45000, 90000, '75200000-0000-4000-8000-000000000011', 'T46 Lighting House', 2),
  ('75200000-0000-4000-8000-000000000424', '75200000-0000-4000-8000-000000000412', '75200000-0000-4000-8000-000000000204',
   'Entry pendant', 'Throughout', 'lighting', 'fixed', 1, 40000, 40000, '75200000-0000-4000-8000-000000000011', 'T46 Lighting House', 3);
UPDATE public.project_ffe_items item
   SET source_commercial_document_id = '75200000-0000-4000-8000-000000000412',
       source_authorization_item_id = auth_item.id
  FROM public.furnishing_authorization_items auth_item
 WHERE auth_item.commercial_document_id = '75200000-0000-4000-8000-000000000412'
   AND item.id = auth_item.source_ffe_item_id;
SELECT set_config('app.ffe_mutation_rpc', '', true);

CREATE OR REPLACE FUNCTION pg_temp.assume(p_actor uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_actor::text, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_actor::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$;

-- Runs p_sql and returns 'code|message' for the error it raised, or NULL.
CREATE OR REPLACE FUNCTION pg_temp.refusal(p_sql text)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_state text; v_message text;
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_message = MESSAGE_TEXT;
  RETURN v_state || '|' || v_message;
END;
$$;

-- The fill request the Build room sends: the line's own item type and budget.
CREATE OR REPLACE FUNCTION pg_temp.fill(p_line text, p_product text, p_key text,
                                        p_item_type text DEFAULT 'allowance',
                                        p_budget_max integer DEFAULT 90000)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'projectId', '75200000-0000-4000-8000-000000000001',
    'productId', '75200000-0000-4000-8000-0000000000' || p_product,
    'placeholderSelectionId', '75200000-0000-4000-8000-000000000' || p_line,
    'itemType', p_item_type,
    'budgetMaxCents', CASE WHEN p_item_type = 'allowance' THEN p_budget_max::text END,
    'assignmentScope', 'unassigned',
    'disposition', 'selected',
    'idempotencyKey', p_key));
$$;

-- ─── A. at the ceiling ─────────────────────────────────────────────────────
DO $$
DECLARE
  v_line constant uuid := '75200000-0000-4000-8000-000000000201';
  v_result jsonb;
  v_row public.project_ffe_items%ROWTYPE;
  v_fill public.project_ffe_allowance_fills%ROWTYPE;
BEGIN
  PERFORM pg_temp.assume('75200000-0000-4000-8000-0000000000a1');
  v_result := public.place_product_in_project_v2(pg_temp.fill('201', '21', 't46-fill-at'));
  IF v_result->>'outcome' IS DISTINCT FROM 'filled' OR v_result->>'itemType' IS DISTINCT FROM 'allowance' THEN
    RAISE EXCEPTION 'A: the fill did not land as an allowance: %', v_result;
  END IF;

  SELECT * INTO v_row FROM public.project_ffe_items WHERE id = v_line;
  IF v_row.product_id IS DISTINCT FROM '75200000-0000-4000-8000-000000000021'
     OR v_row.item_type IS DISTINCT FROM 'allowance'
     OR v_row.budget_max_cents IS DISTINCT FROM 90000
     OR v_row.unit_price_cents IS DISTINCT FROM 45000
     OR v_row.line_total_cents IS DISTINCT FROM 90000
     OR v_row.source_commercial_document_id IS DISTINCT FROM '75200000-0000-4000-8000-000000000412'
     OR v_row.source_authorization_item_id IS DISTINCT FROM '75200000-0000-4000-8000-000000000421' THEN
    RAISE EXCEPTION 'A: the line is not the filled, still-bound allowance: %', row_to_json(v_row);
  END IF;

  SELECT * INTO STRICT v_fill FROM public.project_ffe_allowance_fills WHERE ffe_item_id = v_line;
  IF v_fill.authorization_item_id IS DISTINCT FROM '75200000-0000-4000-8000-000000000421'
     OR v_fill.ceiling_cents IS DISTINCT FROM 90000
     OR v_fill.filled_cents IS DISTINCT FROM 90000
     OR v_fill.variance_cents IS DISTINCT FROM 0
     OR v_fill.filled_by IS DISTINCT FROM '75200000-0000-4000-8000-0000000000a1' THEN
    RAISE EXCEPTION 'A: the variance row is wrong: %', row_to_json(v_fill);
  END IF;

  IF (SELECT commercial_state FROM public.proposals WHERE id = '75200000-0000-4000-8000-000000000411') IS DISTINCT FROM 'executed'
     OR (SELECT superseded_at FROM public.proposals WHERE id = '75200000-0000-4000-8000-000000000411') IS NOT NULL
     OR (SELECT count(*) FROM public.furnishing_authorization_items
          WHERE commercial_document_id = '75200000-0000-4000-8000-000000000412') <> 4 THEN
    RAISE EXCEPTION 'A: the signed authorization changed';
  END IF;
  RAISE NOTICE 'PASS A: at the ceiling, the fill lands, variance 0, the authorization stands';
END $$;

-- ─── U. under the ceiling ──────────────────────────────────────────────────
DO $$
DECLARE
  v_line constant uuid := '75200000-0000-4000-8000-000000000202';
  v_result jsonb;
  v_row public.project_ffe_items%ROWTYPE;
  v_fill public.project_ffe_allowance_fills%ROWTYPE;
BEGIN
  PERFORM pg_temp.assume('75200000-0000-4000-8000-0000000000a1');
  -- The request names a $1,200 budget; the signed $900 stands.
  v_result := public.place_product_in_project_v2(pg_temp.fill('202', '22', 't46-fill-under', 'allowance', 120000));
  IF v_result->>'outcome' IS DISTINCT FROM 'filled' THEN
    RAISE EXCEPTION 'U: the fill did not land: %', v_result;
  END IF;

  SELECT * INTO v_row FROM public.project_ffe_items WHERE id = v_line;
  IF v_row.product_id IS DISTINCT FROM '75200000-0000-4000-8000-000000000022'
     OR v_row.item_type IS DISTINCT FROM 'allowance'
     OR v_row.budget_min_cents IS DISTINCT FROM 0
     OR v_row.budget_max_cents IS DISTINCT FROM 90000
     OR v_row.line_total_cents IS DISTINCT FROM 60000 THEN
    RAISE EXCEPTION 'U: the line is not the filled allowance at its signed budget: %', row_to_json(v_row);
  END IF;

  SELECT * INTO STRICT v_fill FROM public.project_ffe_allowance_fills WHERE ffe_item_id = v_line;
  IF v_fill.authorization_item_id IS DISTINCT FROM '75200000-0000-4000-8000-000000000422'
     OR v_fill.ceiling_cents IS DISTINCT FROM 90000
     OR v_fill.filled_cents IS DISTINCT FROM 60000
     OR v_fill.variance_cents IS DISTINCT FROM 30000 THEN
    RAISE EXCEPTION 'U: the variance row is wrong: %', row_to_json(v_fill);
  END IF;

  IF (SELECT commercial_state FROM public.proposals WHERE id = '75200000-0000-4000-8000-000000000411') IS DISTINCT FROM 'executed' THEN
    RAISE EXCEPTION 'U: the signed authorization was voided';
  END IF;
  RAISE NOTICE 'PASS U: under the ceiling, variance $300 recorded, the signed budget kept';
END $$;

-- ─── P. a replay records nothing new ───────────────────────────────────────
DO $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM pg_temp.assume('75200000-0000-4000-8000-0000000000a1');
  v_result := public.place_product_in_project_v2(pg_temp.fill('201', '21', 't46-fill-at'));
  IF v_result->>'outcome' IS DISTINCT FROM 'filled'
     OR v_result->>'selectionId' IS DISTINCT FROM '75200000-0000-4000-8000-000000000201' THEN
    RAISE EXCEPTION 'P: the replay did not return the stored receipt: %', v_result;
  END IF;
  IF (SELECT count(*) FROM public.project_ffe_allowance_fills
       WHERE ffe_item_id = '75200000-0000-4000-8000-000000000201') <> 1 THEN
    RAISE EXCEPTION 'P: the replay recorded a second fill';
  END IF;
  RAISE NOTICE 'PASS P: a replay returns the receipt and records no second row';
END $$;

-- ─── O. over the ceiling ───────────────────────────────────────────────────
DO $$
DECLARE
  v_line constant uuid := '75200000-0000-4000-8000-000000000203';
  v_err text;
  v_row public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM pg_temp.assume('75200000-0000-4000-8000-0000000000a1');
  v_err := pg_temp.refusal(format('SELECT public.place_product_in_project_v2(%L::jsonb)',
    pg_temp.fill('203', '23', 't46-fill-over')));
  IF v_err IS DISTINCT FROM '23514|Over the allowance. This goes through Record a change.' THEN
    RAISE EXCEPTION 'O: 2 x $500 over a $900 ceiling was not refused with the Record a change sentence, got %', v_err;
  END IF;

  SELECT * INTO v_row FROM public.project_ffe_items WHERE id = v_line;
  IF v_row.product_id IS NOT NULL OR v_row.line_total_cents <> 0 OR v_row.item_type <> 'allowance'
     OR v_row.budget_max_cents <> 90000 THEN
    RAISE EXCEPTION 'O: the refused line changed: %', row_to_json(v_row);
  END IF;
  IF EXISTS (SELECT 1 FROM public.project_ffe_allowance_fills WHERE ffe_item_id = v_line) THEN
    RAISE EXCEPTION 'O: a refused fill recorded a row';
  END IF;
  IF EXISTS (SELECT 1 FROM public.project_ffe_command_idempotency
              WHERE actor_id = '75200000-0000-4000-8000-0000000000a1' AND idempotency_key = 't46-fill-over') THEN
    RAISE EXCEPTION 'O: a refused fill kept its idempotency claim';
  END IF;
  RAISE NOTICE 'PASS O: over the ceiling, refused with the Record a change sentence, nothing written';
END $$;

-- ─── T, F, S. every other bound placeholder refuses as before ──────────────
DO $$
DECLARE
  v_err text;
BEGIN
  PERFORM pg_temp.assume('75200000-0000-4000-8000-0000000000a1');

  -- T: the signed allowance asked to fill as a fixed line.
  v_err := pg_temp.refusal(format('SELECT public.place_product_in_project_v2(%L::jsonb)',
    pg_temp.fill('203', '22', 't46-fill-as-fixed', 'fixed')));
  IF v_err IS DISTINCT FROM '23514|authorized or ordered placeholders cannot be filled in place' THEN
    RAISE EXCEPTION 'T: a signed allowance filled as fixed was not refused as before, got %', v_err;
  END IF;

  -- F: a fixed placeholder on the signed authorization.
  v_err := pg_temp.refusal(format('SELECT public.place_product_in_project_v2(%L::jsonb)',
    pg_temp.fill('204', '22', 't46-fill-fixed', 'fixed')));
  IF v_err IS DISTINCT FROM '23514|authorized or ordered placeholders cannot be filled in place' THEN
    RAISE EXCEPTION 'F: a signed fixed placeholder was not refused as before, got %', v_err;
  END IF;
  IF (SELECT product_id IS NOT NULL OR line_total_cents <> 40000 OR item_type <> 'fixed'
        FROM public.project_ffe_items WHERE id = '75200000-0000-4000-8000-000000000204') THEN
    RAISE EXCEPTION 'F: the fixed line changed';
  END IF;

  -- S: an allowance on a sent authorization.
  v_err := pg_temp.refusal(format('SELECT public.place_product_in_project_v2(%L::jsonb)',
    pg_temp.fill('205', '22', 't46-fill-sent')));
  IF v_err IS DISTINCT FROM '23514|authorized or ordered placeholders cannot be filled in place' THEN
    RAISE EXCEPTION 'S: an allowance on a sent authorization was not refused as before, got %', v_err;
  END IF;

  IF EXISTS (SELECT 1 FROM public.project_ffe_allowance_fills
              WHERE ffe_item_id IN ('75200000-0000-4000-8000-000000000203',
                                    '75200000-0000-4000-8000-000000000204',
                                    '75200000-0000-4000-8000-000000000205')) THEN
    RAISE EXCEPTION 'T/F/S: a refused fill recorded a row';
  END IF;
  RAISE NOTICE 'PASS T/F/S: fixed, fill-as-fixed and sent placeholders refuse as before';
END $$;

-- ─── N. an unreleased allowance fills as before ────────────────────────────
DO $$
DECLARE
  v_result jsonb;
BEGIN
  PERFORM pg_temp.assume('75200000-0000-4000-8000-0000000000a1');
  v_result := public.place_product_in_project_v2(pg_temp.fill('206', '23', 't46-fill-open', 'allowance', 120000));
  IF v_result->>'outcome' IS DISTINCT FROM 'filled' THEN
    RAISE EXCEPTION 'N: the unreleased allowance did not fill: %', v_result;
  END IF;
  IF (SELECT product_id IS DISTINCT FROM '75200000-0000-4000-8000-000000000023'
             OR budget_max_cents IS DISTINCT FROM 120000 OR line_total_cents IS DISTINCT FROM 100000
        FROM public.project_ffe_items WHERE id = '75200000-0000-4000-8000-000000000206') THEN
    RAISE EXCEPTION 'N: the unreleased allowance did not fill as before';
  END IF;
  IF EXISTS (SELECT 1 FROM public.project_ffe_allowance_fills
              WHERE ffe_item_id = '75200000-0000-4000-8000-000000000206') THEN
    RAISE EXCEPTION 'N: an unreleased fill recorded a row';
  END IF;
  RAISE NOTICE 'PASS N: an unreleased allowance fills as before, no row';
END $$;

-- ─── R. access ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT has_table_privilege('authenticated', 'public.project_ffe_allowance_fills', 'SELECT')
     OR has_table_privilege('anon', 'public.project_ffe_allowance_fills', 'SELECT')
     OR has_table_privilege('authenticated', 'public.project_ffe_allowance_fills', 'INSERT, UPDATE, DELETE')
     OR has_table_privilege('anon', 'public.project_ffe_allowance_fills', 'INSERT, UPDATE, DELETE')
     OR has_table_privilege('service_role', 'public.project_ffe_allowance_fills', 'INSERT, UPDATE, DELETE') THEN
    RAISE EXCEPTION 'R: table grants are wrong';
  END IF;
  IF has_function_privilege('anon', 'public.place_product_in_project_v2(jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.place_product_in_project_v2(jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'R: function grants are wrong';
  END IF;
END $$;

SELECT pg_temp.assume('75200000-0000-4000-8000-0000000000a1');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.project_ffe_allowance_fills) <> 2 THEN
    RAISE EXCEPTION 'R: the studio does not read its two fills';
  END IF;
END $$;
RESET ROLE;

SELECT pg_temp.assume('75200000-0000-4000-8000-0000000000a5');
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF (SELECT count(*) FROM public.project_ffe_allowance_fills) <> 0 THEN
    RAISE EXCEPTION 'R: another studio reads the fills';
  END IF;
  RAISE NOTICE 'PASS R: the studio reads its fills, another studio none, no API role writes';
END $$;
RESET ROLE;

ROLLBACK;
