-- ═══════════════════════════════════════════════════════════════════════════
-- US-21 T-35 — Make it an allowance (migration 00743; SQ-641; D12, Q7, Q12)
--
-- public.make_ffe_line_allowance(uuid, integer). CONTRACT §2 W4 00743.
-- Anchors: ffe_line_authorization_state 00705:79; _ffe_require_studio_project
-- 00717:75; get_client_project_selections 00441:82; get_client_project_threshold
-- 00580:167.
--
-- Studio A (owner O, client C on Project A), Studio B (owner B).
-- Cases:
--   M.  Make it an allowance: a fixed sofa at $3,800 with rough $4,815.16
--       becomes an allowance with a $1,200 ceiling; rough_cents, unit price
--       and line total are untouched; budget_min_cents defaults to 0. A second
--       call moves the ceiling. A stale floor never sits above the ceiling.
--   V.  The ceiling must be above 0: NULL, 0 and -1 refuse.
--   R.  Refusals, the line left as it was:
--         labor                     → "Labor can't be an allowance."
--         sent authorization        → "Released lines change through Record a change."
--         executed authorization    → the same
--         on a PO                   → the same
--         removed                   → "This line was removed."
--   X.  Trust: B and the client C are refused; anon cannot execute;
--       authenticated can.
--   D12 Rough $: the client reads both payloads; each carries the selected
--       allowance line and the executed line, and neither payload's JSON
--       contains either rough value or a key starting "rough" (the bare word
--       would match "Throughout").
--
-- How to run (local stack):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/ffe/pieces_price_acts_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('74300000-0000-4000-8000-0000000000a1', 'p743-owner@test.invalid',   '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- O
  ('74300000-0000-4000-8000-0000000000a2', 'p743-client@test.invalid',  '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- C
  ('74300000-0000-4000-8000-0000000000a5', 'p743-owner-b@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- B

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('74300000-0000-4000-8000-0000000000a1', 'p743-owner@test.invalid',   'P743 Owner',   now(), now()),
  ('74300000-0000-4000-8000-0000000000a2', 'p743-client@test.invalid',  'P743 Client',  now(), now()),
  ('74300000-0000-4000-8000-0000000000a5', 'p743-owner-b@test.invalid', 'P743 Owner B', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug)
VALUES
  ('74300000-0000-4000-8000-0000000000f1', 'design_studio', 'P743 Studio A', 'p743-studio-a-test'),
  ('74300000-0000-4000-8000-0000000000f2', 'design_studio', 'P743 Studio B', 'p743-studio-b-test');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('74300000-0000-4000-8000-0000000000e1', '74300000-0000-4000-8000-0000000000a1', '74300000-0000-4000-8000-0000000000f1', 'owner', 'active', now()),
  ('74300000-0000-4000-8000-0000000000e5', '74300000-0000-4000-8000-0000000000a5', '74300000-0000-4000-8000-0000000000f2', 'owner', 'active', now());

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
VALUES ('74300000-0000-4000-8000-000000000001', 'P743 Whole Home',
        '74300000-0000-4000-8000-0000000000a1', '74300000-0000-4000-8000-0000000000a2',
        '74300000-0000-4000-8000-0000000000a1', '74300000-0000-4000-8000-0000000000f1', 'active');

INSERT INTO public.vendors (id, name)
VALUES
  ('74300000-0000-4000-8000-000000000011', 'P743 Workroom'),
  ('74300000-0000-4000-8000-000000000012', 'P743 Paperhanger');

INSERT INTO public.products (id, name, captured_at, layer, owner_user_id)
VALUES ('74300000-0000-4000-8000-000000000021', 'P743 Sofa', now(), 'personal', '74300000-0000-4000-8000-0000000000a1');

-- Lines (fixture writes, as postgres):
--   101 sofa        fixed $3,800, rough 4815162, selected      → M, D12
--   102 drapery     allowance, floor $500 / ceiling $900       → M (floor clamp)
--   103 wallpaper   the piece under the labor line
--   104 sent        on a sent authorization                    → R
--   105 executed    on an executed authorization, rough 7319463 → R, D12
--   106 on a PO                                                → R
--   107 removed                                                → R
--   301 labor       install under the wallpaper                → R
-- The lamp is on the PO from its insert: linking a configured line to a PO by
-- UPDATE needs an end-user identity (lock_configuration_snapshot_on_po_link).
INSERT INTO public.purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, created_by)
VALUES ('74300000-0000-4000-8000-000000000051', '74300000-0000-4000-8000-0000000000a1',
        '74300000-0000-4000-8000-000000000001', '74300000-0000-4000-8000-000000000011',
        'net_30', 18000, 'draft', '74300000-0000-4000-8000-0000000000a1');

SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, product_id, vendor_id, quantity,
  unit_price_cents, line_total_cents, budget_min_cents, budget_max_cents, rough_cents, design_disposition,
  purchase_order_id
) VALUES
  ('74300000-0000-4000-8000-000000000101', '74300000-0000-4000-8000-000000000001', 'Sofa',
   'specified', 'fixed', '74300000-0000-4000-8000-000000000021', '74300000-0000-4000-8000-000000000011', 1,
   380000, 380000, NULL, NULL, 4815162, 'selected', NULL),
  ('74300000-0000-4000-8000-000000000102', '74300000-0000-4000-8000-000000000001', 'Drapery',
   'specified', 'allowance', NULL, NULL, 1,
   0, 0, 50000, 90000, NULL, 'candidate', NULL),
  ('74300000-0000-4000-8000-000000000103', '74300000-0000-4000-8000-000000000001', 'Grasscloth',
   'specified', 'fixed', '74300000-0000-4000-8000-000000000021', '74300000-0000-4000-8000-000000000011', 9,
   21000, 189000, NULL, NULL, NULL, 'selected', NULL),
  ('74300000-0000-4000-8000-000000000104', '74300000-0000-4000-8000-000000000001', 'Sent chair',
   'specified', 'fixed', '74300000-0000-4000-8000-000000000021', '74300000-0000-4000-8000-000000000011', 1,
   90000, 90000, NULL, NULL, NULL, 'selected', NULL),
  ('74300000-0000-4000-8000-000000000105', '74300000-0000-4000-8000-000000000001', 'Executed table',
   'specified', 'fixed', '74300000-0000-4000-8000-000000000021', '74300000-0000-4000-8000-000000000011', 1,
   165000, 165000, NULL, NULL, 7319463, 'selected', NULL),
  ('74300000-0000-4000-8000-000000000106', '74300000-0000-4000-8000-000000000001', 'Ordered lamp',
   'specified', 'fixed', '74300000-0000-4000-8000-000000000021', '74300000-0000-4000-8000-000000000011', 1,
   18000, 18000, NULL, NULL, NULL, 'selected', '74300000-0000-4000-8000-000000000051'),
  ('74300000-0000-4000-8000-000000000107', '74300000-0000-4000-8000-000000000001', 'Removed rug',
   'specified', 'fixed', NULL, NULL, 1,
   0, 0, NULL, NULL, NULL, 'not_selected', NULL);

INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, vendor_id, quantity, unit, unit_price_cents, line_total_cents,
  line_kind, link_kind, parent_ffe_item_id
) VALUES
  ('74300000-0000-4000-8000-000000000301', '74300000-0000-4000-8000-000000000001', 'Install, paperhanger',
   'specified', 'fixed', '74300000-0000-4000-8000-000000000012', 9, 'roll', 8500, 76500,
   'labor', 'labor', '74300000-0000-4000-8000-000000000103');

UPDATE public.project_ffe_items
   SET removed_at = now(), removed_by = '74300000-0000-4000-8000-0000000000a1',
       removal_reason = 'removed while building', removed_disposition = 'candidate'
 WHERE id = '74300000-0000-4000-8000-000000000107';

-- Authorization No. 1 (sent): the chair. Authorization No. 2 (executed): the
-- table, whose live line carries its provenance so the threshold reader shows it.
INSERT INTO public.proposals (id, project_id, designer_id, title, status, document_kind, commercial_state, total_amount, subtotal)
VALUES
  ('74300000-0000-4000-8000-000000000401', '74300000-0000-4000-8000-000000000001', '74300000-0000-4000-8000-0000000000a1',
   'P743 Authorization No. 1', 'sent', 'furnishings_authorization', 'sent', 90000, 90000),
  ('74300000-0000-4000-8000-000000000411', '74300000-0000-4000-8000-000000000001', '74300000-0000-4000-8000-0000000000a1',
   'P743 Authorization No. 2', 'accepted', 'furnishings_authorization', 'executed', 165000, 165000);
INSERT INTO public.project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin, bound_at, executed_at, created_by)
VALUES
  ('74300000-0000-4000-8000-000000000402', '74300000-0000-4000-8000-000000000001', '74300000-0000-4000-8000-000000000401',
   'furnishings_authorization', 'Authorization No. 1', false, now(), NULL, '74300000-0000-4000-8000-0000000000a1'),
  ('74300000-0000-4000-8000-000000000412', '74300000-0000-4000-8000-000000000001', '74300000-0000-4000-8000-000000000411',
   'furnishings_authorization', 'Authorization No. 2', false, now(), now(), '74300000-0000-4000-8000-0000000000a1');
INSERT INTO public.furnishing_authorization_items (
  id, commercial_document_id, source_ffe_item_id, product_id, name, room_name, category, item_type,
  quantity, client_unit_price_cents, client_line_total_cents, trade_unit_cost_cents, markup_percent, sort_order
) VALUES
  ('74300000-0000-4000-8000-000000000403', '74300000-0000-4000-8000-000000000402', '74300000-0000-4000-8000-000000000104',
   '74300000-0000-4000-8000-000000000021', 'Sent chair', 'Throughout', 'seating', 'fixed', 1, 90000, 90000, 50000, 80.00, 0),
  ('74300000-0000-4000-8000-000000000413', '74300000-0000-4000-8000-000000000412', '74300000-0000-4000-8000-000000000105',
   '74300000-0000-4000-8000-000000000021', 'Executed table', 'Throughout', 'tables', 'fixed', 1, 165000, 165000, 90000, 83.33, 0);
UPDATE public.project_ffe_items
   SET source_commercial_document_id = '74300000-0000-4000-8000-000000000412',
       source_authorization_item_id = '74300000-0000-4000-8000-000000000413'
 WHERE id = '74300000-0000-4000-8000-000000000105';
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

-- ─── M. Make it an allowance ───────────────────────────────────────────────
DO $$
DECLARE
  v_sofa constant uuid := '74300000-0000-4000-8000-000000000101';
  v_drapery constant uuid := '74300000-0000-4000-8000-000000000102';
  v_row public.project_ffe_items%ROWTYPE;
BEGIN
  PERFORM pg_temp.assume('74300000-0000-4000-8000-0000000000a1');

  v_row := public.make_ffe_line_allowance(v_sofa, 120000);
  IF v_row.id IS DISTINCT FROM v_sofa
     OR v_row.item_type IS DISTINCT FROM 'allowance'
     OR v_row.budget_max_cents IS DISTINCT FROM 120000
     OR v_row.budget_min_cents IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'M: the returned row is not the allowance: %', row_to_json(v_row);
  END IF;
  SELECT * INTO v_row FROM public.project_ffe_items WHERE id = v_sofa;
  IF v_row.item_type IS DISTINCT FROM 'allowance' OR v_row.budget_max_cents IS DISTINCT FROM 120000 THEN
    RAISE EXCEPTION 'M: the stored line is not the allowance: %', row_to_json(v_row);
  END IF;
  IF v_row.rough_cents IS DISTINCT FROM 4815162 THEN
    RAISE EXCEPTION 'M: rough_cents moved: %', v_row.rough_cents;
  END IF;
  IF v_row.unit_price_cents IS DISTINCT FROM 380000 OR v_row.line_total_cents IS DISTINCT FROM 380000 THEN
    RAISE EXCEPTION 'M: price moved: % / %', v_row.unit_price_cents, v_row.line_total_cents;
  END IF;

  -- A second call moves the ceiling.
  v_row := public.make_ffe_line_allowance(v_sofa, 95000);
  IF v_row.budget_max_cents IS DISTINCT FROM 95000 OR v_row.rough_cents IS DISTINCT FROM 4815162 THEN
    RAISE EXCEPTION 'M: the ceiling did not move: %', row_to_json(v_row);
  END IF;

  -- A stale floor ($500) never sits above a lower ceiling ($300).
  v_row := public.make_ffe_line_allowance(v_drapery, 30000);
  IF v_row.budget_max_cents IS DISTINCT FROM 30000 OR v_row.budget_min_cents IS DISTINCT FROM 30000 THEN
    RAISE EXCEPTION 'M: floor not clamped to the ceiling: % / %', v_row.budget_min_cents, v_row.budget_max_cents;
  END IF;
  RAISE NOTICE 'M passed: allowance set, ceiling moved, rough and price untouched, floor clamped';
END $$;

-- ─── V. The ceiling must be above 0 ────────────────────────────────────────
DO $$
DECLARE
  v_err text;
  v_amount text;
BEGIN
  PERFORM pg_temp.assume('74300000-0000-4000-8000-0000000000a1');
  FOREACH v_amount IN ARRAY ARRAY['NULL', '0', '-1'] LOOP
    v_err := pg_temp.refusal(format('SELECT public.make_ffe_line_allowance(%L, %s)',
      '74300000-0000-4000-8000-000000000103', v_amount));
    IF v_err IS DISTINCT FROM '23514|An allowance needs a ceiling above $0.' THEN
      RAISE EXCEPTION 'V: ceiling % should refuse, got %', v_amount, v_err;
    END IF;
  END LOOP;
  IF (SELECT item_type FROM public.project_ffe_items WHERE id = '74300000-0000-4000-8000-000000000103') <> 'fixed' THEN
    RAISE EXCEPTION 'V: a refused call changed the line';
  END IF;
  RAISE NOTICE 'V passed: NULL, 0 and -1 refuse';
END $$;

-- ─── R. Refusals ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_err text;
  v_case record;
BEGIN
  PERFORM pg_temp.assume('74300000-0000-4000-8000-0000000000a1');
  FOR v_case IN
    SELECT * FROM (VALUES
      ('labor',    '74300000-0000-4000-8000-000000000301'::uuid, '23514|Labor can''t be an allowance.'),
      ('sent',     '74300000-0000-4000-8000-000000000104'::uuid, '23514|Released lines change through Record a change.'),
      ('executed', '74300000-0000-4000-8000-000000000105'::uuid, '23514|Released lines change through Record a change.'),
      ('on a PO',  '74300000-0000-4000-8000-000000000106'::uuid, '23514|Released lines change through Record a change.'),
      ('removed',  '74300000-0000-4000-8000-000000000107'::uuid, '23514|This line was removed.')
    ) AS c(label, id, expected)
  LOOP
    v_err := pg_temp.refusal(format('SELECT public.make_ffe_line_allowance(%L, 50000)', v_case.id));
    IF v_err IS DISTINCT FROM v_case.expected THEN
      RAISE EXCEPTION 'R: % should refuse with %, got %', v_case.label, v_case.expected, v_err;
    END IF;
    IF EXISTS (SELECT 1 FROM public.project_ffe_items
                WHERE id = v_case.id AND (item_type = 'allowance' OR budget_max_cents IS NOT NULL)) THEN
      RAISE EXCEPTION 'R: the refused % line changed', v_case.label;
    END IF;
  END LOOP;
  RAISE NOTICE 'R passed: labor, sent, executed, on a PO and removed refuse; lines unchanged';
END $$;

-- ─── X. Trust ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_err text;
BEGIN
  PERFORM pg_temp.assume('74300000-0000-4000-8000-0000000000a5');
  v_err := pg_temp.refusal(format('SELECT public.make_ffe_line_allowance(%L, 50000)',
    '74300000-0000-4000-8000-000000000103'));
  IF v_err IS DISTINCT FROM '42501|project not found or access denied' THEN
    RAISE EXCEPTION 'X: another studio should be refused, got %', v_err;
  END IF;

  PERFORM pg_temp.assume('74300000-0000-4000-8000-0000000000a2');
  v_err := pg_temp.refusal(format('SELECT public.make_ffe_line_allowance(%L, 50000)',
    '74300000-0000-4000-8000-000000000103'));
  IF v_err IS DISTINCT FROM '42501|project not found or access denied' THEN
    RAISE EXCEPTION 'X: the client should be refused, got %', v_err;
  END IF;

  IF has_function_privilege('anon', 'public.make_ffe_line_allowance(uuid, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'X: anon can execute make_ffe_line_allowance';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.make_ffe_line_allowance(uuid, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'X: authenticated cannot execute make_ffe_line_allowance';
  END IF;
  IF (SELECT item_type FROM public.project_ffe_items WHERE id = '74300000-0000-4000-8000-000000000103') <> 'fixed' THEN
    RAISE EXCEPTION 'X: a refused caller changed the line';
  END IF;
  RAISE NOTICE 'X passed: other studio and client refused; anon has no EXECUTE';
END $$;

-- ─── D12. Rough $ never reaches the client payloads ────────────────────────
DO $$
DECLARE
  v_selections jsonb;
  v_threshold jsonb;
BEGIN
  PERFORM pg_temp.assume('74300000-0000-4000-8000-0000000000a2');

  v_selections := public.get_client_project_selections('74300000-0000-4000-8000-000000000001');
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_selections->'selections') AS line
                  WHERE line->>'id' = '74300000-0000-4000-8000-000000000101') THEN
    RAISE EXCEPTION 'D12: the selected allowance line is missing from get_client_project_selections: %', v_selections;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_selections->'selections') AS line
                  WHERE line->>'id' = '74300000-0000-4000-8000-000000000105') THEN
    RAISE EXCEPTION 'D12: the executed line is missing from get_client_project_selections: %', v_selections;
  END IF;
  IF position('4815162' IN v_selections::text) > 0
     OR position('7319463' IN v_selections::text) > 0
     OR position('"rough' IN lower(v_selections::text)) > 0 THEN
    RAISE EXCEPTION 'D12: rough $ reached get_client_project_selections: %', v_selections;
  END IF;

  v_threshold := public.get_client_project_threshold('74300000-0000-4000-8000-000000000001');
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v_threshold->'selections') AS line
                  WHERE line->>'id' = '74300000-0000-4000-8000-000000000105') THEN
    RAISE EXCEPTION 'D12: the executed line is missing from get_client_project_threshold: %', v_threshold;
  END IF;
  IF position('4815162' IN v_threshold::text) > 0
     OR position('7319463' IN v_threshold::text) > 0
     OR position('"rough' IN lower(v_threshold::text)) > 0 THEN
    RAISE EXCEPTION 'D12: rough $ reached get_client_project_threshold: %', v_threshold;
  END IF;
  RAISE NOTICE 'D12 passed: neither client payload carries rough $ (% / % bytes)',
    length(v_selections::text), length(v_threshold::text);
END $$;

ROLLBACK;
