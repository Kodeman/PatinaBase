-- ═══════════════════════════════════════════════════════════════════════════
-- US-21 D1 — the derived stage of a line (migration 00736; T-16, SQ-622)
--
-- public.ffe_line_stage(project_ffe_items) and
-- public.ffe_line_authorization(project_ffe_items), the computed fields the
-- stamp-derivation.ts mirror (T-19) reads. CONTRACT §2 "00736 in full", §3.3
-- cases R6a–R9b and L1–L3 (the same fixtures as the TS test); direction.md D1
-- rows 6–9 and the labor rule. ffe_line_authorization_state: 00705:79.
--
-- Studio A (owner O), Studio B (owner B), Project A (O's), Project B (B's).
-- Cases:
--   S.  Every case below, as O through RLS (the PostgREST computed-field path):
--         R6a  sent authorization                         → released
--         R6b  signed allowance, no product               → released (+ ALLOWANCE)
--         R7a  product, qty 2, fixed 3800                 → ready
--         R7b  product, allowance, ceiling 120000         → ready
--         R7c  product, fixed, price 0, rough 480000      → specced
--         R8a  product, no price                          → specced
--         R8b  no product, vendor_name Hollis Millwork    → specced
--         R9a  no product, no maker, rough 480000         → placeholder
--         R9b  no product, no maker, fixed 5000           → placeholder
--         L1   labor 9 roll × 8500, piece ready           → ready
--         L2   labor, own price, piece specced            → specced
--         L3   labor, piece released (labor released with it) → released
--         ord  status ordered, on an authorization        → NULL (rows 1–5 stay TS)
--   P.  The same answers as postgres (no end-user identity).
--   A.  ffe_line_authorization: 'sent', 'client_signed', NULL.
--   L.  The labor rule reads the piece's stage: L1's labor under a piece with
--       no price reads specced; a labor line on no authorization under a
--       released piece reads ready (it is released only on its own row).
--   R.  Rough $ never promotes: raising rough_cents on R9a / R7c changes
--       nothing, and neither function body names rough_cents.
--   X.  Trust: B sees none of Project A's lines; a forged Project A row handed
--       to ffe_line_authorization by B returns NULL; anon cannot execute;
--       ffe_line_authorization_state stays closed to authenticated (00705).
--
-- How to run (local stack):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/ffe/pieces_line_stage_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('70622000-0000-4000-8000-0000000000a1', 'sq622-owner@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- O
  ('70622000-0000-4000-8000-0000000000a5', 'sq622-owner-b@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- B

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('70622000-0000-4000-8000-0000000000a1', 'sq622-owner@test.invalid',   'SQ622 Owner',   NOW(), NOW()),
  ('70622000-0000-4000-8000-0000000000a5', 'sq622-owner-b@test.invalid', 'SQ622 Owner B', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES
  ('70622000-0000-4000-8000-0000000000f1', 'design_studio', 'SQ622 Studio A', 'sq622-studio-a-test'),
  ('70622000-0000-4000-8000-0000000000f2', 'design_studio', 'SQ622 Studio B', 'sq622-studio-b-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('70622000-0000-4000-8000-0000000000e1', '70622000-0000-4000-8000-0000000000a1', '70622000-0000-4000-8000-0000000000f1', 'owner', 'active', NOW()),
  ('70622000-0000-4000-8000-0000000000e5', '70622000-0000-4000-8000-0000000000a5', '70622000-0000-4000-8000-0000000000f2', 'owner', 'active', NOW());

INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES
  ('70622000-0000-4000-8000-000000000001', 'SQ622 Project A', '70622000-0000-4000-8000-0000000000a1', '70622000-0000-4000-8000-0000000000a1', '70622000-0000-4000-8000-0000000000f1'),
  ('70622000-0000-4000-8000-000000000002', 'SQ622 Project B', '70622000-0000-4000-8000-0000000000a5', '70622000-0000-4000-8000-0000000000a5', '70622000-0000-4000-8000-0000000000f2');

INSERT INTO vendors (id, name)
VALUES
  ('70622000-0000-4000-8000-000000000011', 'SQ622 Paper Maker'),
  ('70622000-0000-4000-8000-000000000012', 'SQ622 Paperhanger');

INSERT INTO products (id, name, captured_at, layer, owner_user_id)
VALUES ('70622000-0000-4000-8000-000000000021', 'SQ622 Grasscloth', NOW(), 'personal', '70622000-0000-4000-8000-0000000000a1');

-- Lines on Project A. Goods first (the labor lines point at their pieces).
-- 1xx: the D1 rows; 2xx: the pieces under the labor lines; 3xx: labor.
INSERT INTO project_ffe_items (id, project_id, name, status, item_type, product_id, vendor_id, vendor_name, quantity, unit_price_cents, budget_max_cents, rough_cents)
VALUES
  ('70622000-0000-4000-8000-000000000161', '70622000-0000-4000-8000-000000000001', 'R6a sent',             'specified', 'fixed',     '70622000-0000-4000-8000-000000000021', NULL, NULL, 1, 3800, NULL,   NULL),
  ('70622000-0000-4000-8000-000000000162', '70622000-0000-4000-8000-000000000001', 'R6b signed allowance', 'specified', 'allowance', NULL, NULL, NULL,                                                      1, 0,    300000, NULL),
  ('70622000-0000-4000-8000-000000000171', '70622000-0000-4000-8000-000000000001', 'R7a fixed',            'specified', 'fixed',     '70622000-0000-4000-8000-000000000021', NULL, NULL, 2, 3800, NULL,   NULL),
  ('70622000-0000-4000-8000-000000000172', '70622000-0000-4000-8000-000000000001', 'R7b allowance',        'specified', 'allowance', '70622000-0000-4000-8000-000000000021', NULL, NULL, 1, 0,    120000, NULL),
  ('70622000-0000-4000-8000-000000000173', '70622000-0000-4000-8000-000000000001', 'R7c rough only',       'specified', 'fixed',     '70622000-0000-4000-8000-000000000021', NULL, NULL, 1, 0,    NULL,   480000),
  ('70622000-0000-4000-8000-000000000181', '70622000-0000-4000-8000-000000000001', 'R8a no price',         'specified', 'fixed',     '70622000-0000-4000-8000-000000000021', NULL, NULL, 1, 0,    NULL,   NULL),
  ('70622000-0000-4000-8000-000000000182', '70622000-0000-4000-8000-000000000001', 'R8b custom cabinet',   'specified', 'fixed',     NULL, NULL, 'Hollis Millwork',                                         1, 0,    NULL,   NULL),
  ('70622000-0000-4000-8000-000000000191', '70622000-0000-4000-8000-000000000001', 'R9a rough name',       'specified', 'fixed',     NULL, NULL, NULL,                                                      1, 0,    NULL,   480000),
  ('70622000-0000-4000-8000-000000000192', '70622000-0000-4000-8000-000000000001', 'R9b priced name',      'specified', 'fixed',     NULL, NULL, NULL,                                                      1, 5000, NULL,   NULL),
  ('70622000-0000-4000-8000-000000000199', '70622000-0000-4000-8000-000000000001', 'ordered',              'ordered',   'fixed',     '70622000-0000-4000-8000-000000000021', NULL, NULL, 1, 3800, NULL,   NULL),
  -- Pieces under the labor lines: ready, specced, released.
  ('70622000-0000-4000-8000-000000000201', '70622000-0000-4000-8000-000000000001', 'Wallpaper (ready)',    'specified', 'fixed',     '70622000-0000-4000-8000-000000000021', '70622000-0000-4000-8000-000000000011', NULL, 9, 21000, NULL, NULL),
  ('70622000-0000-4000-8000-000000000202', '70622000-0000-4000-8000-000000000001', 'Wallpaper (specced)',  'specified', 'fixed',     '70622000-0000-4000-8000-000000000021', '70622000-0000-4000-8000-000000000011', NULL, 9, 0,     NULL, NULL),
  ('70622000-0000-4000-8000-000000000203', '70622000-0000-4000-8000-000000000001', 'Wallpaper (released)', 'specified', 'fixed',     '70622000-0000-4000-8000-000000000021', '70622000-0000-4000-8000-000000000011', NULL, 9, 21000, NULL, NULL);

INSERT INTO project_ffe_items (id, project_id, name, status, item_type, vendor_id, quantity, unit, unit_price_cents, line_kind, link_kind, parent_ffe_item_id)
VALUES
  ('70622000-0000-4000-8000-000000000301', '70622000-0000-4000-8000-000000000001', 'L1 install', 'specified', 'fixed', '70622000-0000-4000-8000-000000000012', 9, 'roll', 8500, 'labor', 'labor', '70622000-0000-4000-8000-000000000201'),
  ('70622000-0000-4000-8000-000000000302', '70622000-0000-4000-8000-000000000001', 'L2 install', 'specified', 'fixed', '70622000-0000-4000-8000-000000000012', 9, 'roll', 8500, 'labor', 'labor', '70622000-0000-4000-8000-000000000202'),
  ('70622000-0000-4000-8000-000000000303', '70622000-0000-4000-8000-000000000001', 'L3 install', 'specified', 'fixed', '70622000-0000-4000-8000-000000000012', 9, 'roll', 8500, 'labor', 'labor', '70622000-0000-4000-8000-000000000203'),
  -- Case L: a priced labor line under the released piece that is not itself
  -- on the authorization (no RPC makes this; it pins the rule as written).
  ('70622000-0000-4000-8000-000000000304', '70622000-0000-4000-8000-000000000001', 'L edge',     'specified', 'fixed', '70622000-0000-4000-8000-000000000012', 1, 'lot',  9000, 'labor', 'labor', '70622000-0000-4000-8000-000000000203');

-- A Project B line, to prove B reads its own and none of A's.
INSERT INTO project_ffe_items (id, project_id, name, status, item_type, quantity)
VALUES ('70622000-0000-4000-8000-000000000901', '70622000-0000-4000-8000-000000000002', 'B line', 'specified', 'fixed', 1);

-- Authorization No. 1 (sent): R6a, the released wallpaper and its install
-- (00733 releases labor with its piece), and the ordered line.
-- Authorization No. 2 (client signed): the R6b allowance.
INSERT INTO proposals (id, project_id, designer_id, title, status, document_kind, commercial_state, total_amount, subtotal)
VALUES
  ('70622000-0000-4000-8000-000000000401', '70622000-0000-4000-8000-000000000001', '70622000-0000-4000-8000-0000000000a1',
   'SQ622 Authorization No. 1', 'sent', 'furnishings_authorization', 'sent', 274300, 274300),
  ('70622000-0000-4000-8000-000000000411', '70622000-0000-4000-8000-000000000001', '70622000-0000-4000-8000-0000000000a1',
   'SQ622 Authorization No. 2', 'accepted', 'furnishings_authorization', 'client_signed', 300000, 300000);
INSERT INTO project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin, bound_at, executed_at, created_by)
VALUES
  ('70622000-0000-4000-8000-000000000402', '70622000-0000-4000-8000-000000000001', '70622000-0000-4000-8000-000000000401',
   'furnishings_authorization', 'Authorization No. 1', false, now(), NULL, '70622000-0000-4000-8000-0000000000a1'),
  ('70622000-0000-4000-8000-000000000412', '70622000-0000-4000-8000-000000000001', '70622000-0000-4000-8000-000000000411',
   'furnishings_authorization', 'Authorization No. 2', false, now(), NULL, '70622000-0000-4000-8000-0000000000a1');
INSERT INTO furnishing_authorization_items (id, commercial_document_id, source_ffe_item_id, name, quantity, client_unit_price_cents, client_line_total_cents)
VALUES
  ('70622000-0000-4000-8000-000000000403', '70622000-0000-4000-8000-000000000402', '70622000-0000-4000-8000-000000000161', 'R6a sent',             1, 3800,   3800),
  ('70622000-0000-4000-8000-000000000404', '70622000-0000-4000-8000-000000000402', '70622000-0000-4000-8000-000000000203', 'Wallpaper (released)', 9, 21000,  189000),
  ('70622000-0000-4000-8000-000000000405', '70622000-0000-4000-8000-000000000402', '70622000-0000-4000-8000-000000000303', 'L3 install',           9, 8500,   76500),
  ('70622000-0000-4000-8000-000000000406', '70622000-0000-4000-8000-000000000402', '70622000-0000-4000-8000-000000000199', 'ordered',              1, 3800,   3800),
  ('70622000-0000-4000-8000-000000000413', '70622000-0000-4000-8000-000000000412', '70622000-0000-4000-8000-000000000162', 'R6b signed allowance', 1, 300000, 300000);

-- The expected stage of every Project A line, keyed by id.
CREATE TEMP TABLE sq622_expect (id uuid PRIMARY KEY, case_name text NOT NULL, stage text) ON COMMIT DROP;
INSERT INTO sq622_expect (id, case_name, stage) VALUES
  ('70622000-0000-4000-8000-000000000161', 'R6a', 'released'),
  ('70622000-0000-4000-8000-000000000162', 'R6b', 'released'),
  ('70622000-0000-4000-8000-000000000171', 'R7a', 'ready'),
  ('70622000-0000-4000-8000-000000000172', 'R7b', 'ready'),
  ('70622000-0000-4000-8000-000000000173', 'R7c', 'specced'),
  ('70622000-0000-4000-8000-000000000181', 'R8a', 'specced'),
  ('70622000-0000-4000-8000-000000000182', 'R8b', 'specced'),
  ('70622000-0000-4000-8000-000000000191', 'R9a', 'placeholder'),
  ('70622000-0000-4000-8000-000000000192', 'R9b', 'placeholder'),
  ('70622000-0000-4000-8000-000000000199', 'ordered', NULL),
  ('70622000-0000-4000-8000-000000000201', 'piece ready', 'ready'),
  ('70622000-0000-4000-8000-000000000202', 'piece specced', 'specced'),
  ('70622000-0000-4000-8000-000000000203', 'piece released', 'released'),
  ('70622000-0000-4000-8000-000000000301', 'L1', 'ready'),
  ('70622000-0000-4000-8000-000000000302', 'L2', 'specced'),
  ('70622000-0000-4000-8000-000000000303', 'L3', 'released'),
  ('70622000-0000-4000-8000-000000000304', 'L edge', 'ready');
GRANT SELECT ON sq622_expect TO authenticated;

-- Acts as p_user for the rest of the transaction (auth.uid()).
CREATE OR REPLACE FUNCTION pg_temp.act(p_user uuid)
RETURNS void AS $$
  SELECT set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
$$ LANGUAGE sql;
GRANT EXECUTE ON FUNCTION pg_temp.act(uuid) TO authenticated;

-- ─── case P: as postgres (no end-user identity) ─────────────────────────────

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT e.case_name, e.stage AS expected, public.ffe_line_stage(i) AS actual
    FROM sq622_expect e
    JOIN public.project_ffe_items i ON i.id = e.id
  LOOP
    IF r.actual IS DISTINCT FROM r.expected THEN
      RAISE EXCEPTION 'FAIL P %: expected %, got %', r.case_name, r.expected, r.actual;
    END IF;
  END LOOP;
  RAISE NOTICE 'case P passed (postgres)';
END;
$$;

-- ─── cases S, A: as O, through RLS (the computed-field path) ────────────────

SET LOCAL ROLE authenticated;
SELECT pg_temp.act('70622000-0000-4000-8000-0000000000a1');

DO $$
DECLARE
  r record;
  v_seen int := 0;
  v_auth text;
BEGIN
  FOR r IN
    SELECT e.case_name, e.stage AS expected, public.ffe_line_stage(i) AS actual
    FROM sq622_expect e
    JOIN public.project_ffe_items i ON i.id = e.id
  LOOP
    v_seen := v_seen + 1;
    IF r.actual IS DISTINCT FROM r.expected THEN
      RAISE EXCEPTION 'FAIL S %: expected %, got %', r.case_name, r.expected, r.actual;
    END IF;
  END LOOP;
  IF v_seen <> 17 THEN
    RAISE EXCEPTION 'FAIL S: O should read all 17 Project A lines, read %', v_seen;
  END IF;
  RAISE NOTICE 'case S passed (R6a–R9b, L1–L3, ordered → NULL, as the studio)';

  -- A. the authorization computed field.
  SELECT public.ffe_line_authorization(i) INTO v_auth FROM public.project_ffe_items i
  WHERE i.id = '70622000-0000-4000-8000-000000000161';
  IF v_auth IS DISTINCT FROM 'sent' THEN RAISE EXCEPTION 'FAIL A R6a: expected sent, got %', v_auth; END IF;

  SELECT public.ffe_line_authorization(i) INTO v_auth FROM public.project_ffe_items i
  WHERE i.id = '70622000-0000-4000-8000-000000000162';
  IF v_auth IS DISTINCT FROM 'client_signed' THEN RAISE EXCEPTION 'FAIL A R6b: expected client_signed, got %', v_auth; END IF;

  SELECT public.ffe_line_authorization(i) INTO v_auth FROM public.project_ffe_items i
  WHERE i.id = '70622000-0000-4000-8000-000000000171';
  IF v_auth IS NOT NULL THEN RAISE EXCEPTION 'FAIL A R7a: expected NULL, got %', v_auth; END IF;

  -- R6b keeps its allowance (the ALLOWANCE word beside RELEASED reads item_type).
  IF NOT EXISTS (SELECT 1 FROM public.project_ffe_items i
                 WHERE i.id = '70622000-0000-4000-8000-000000000162'
                   AND i.item_type = 'allowance' AND i.product_id IS NULL
                   AND public.ffe_line_stage(i) = 'released') THEN
    RAISE EXCEPTION 'FAIL A R6b: a signed allowance with no product reads released, with item_type allowance';
  END IF;
  RAISE NOTICE 'case A passed (ffe_line_authorization)';
END;
$$;

-- ─── case L: the labor rule reads the piece ─────────────────────────────────

RESET ROLE;

DO $$
DECLARE
  v_stage text;
BEGIN
  -- The ready piece loses its price: L1 drops to specced with it.
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items SET unit_price_cents = 0
  WHERE id = '70622000-0000-4000-8000-000000000201';
  SELECT public.ffe_line_stage(i) INTO v_stage FROM public.project_ffe_items i
  WHERE i.id = '70622000-0000-4000-8000-000000000301';
  IF v_stage IS DISTINCT FROM 'specced' THEN
    RAISE EXCEPTION 'FAIL L: labor under a specced piece should read specced, got %', v_stage;
  END IF;

  -- The piece is priced again: L1 reads ready again.
  UPDATE public.project_ffe_items SET unit_price_cents = 21000
  WHERE id = '70622000-0000-4000-8000-000000000201';
  SELECT public.ffe_line_stage(i) INTO v_stage FROM public.project_ffe_items i
  WHERE i.id = '70622000-0000-4000-8000-000000000301';
  IF v_stage IS DISTINCT FROM 'ready' THEN
    RAISE EXCEPTION 'FAIL L: labor back under a ready piece should read ready, got %', v_stage;
  END IF;

  -- L edge (fixture): labor not on the authorization, under the released
  -- piece, reads ready by the rule — released only on its own row.
  SELECT public.ffe_line_stage(i) INTO v_stage FROM public.project_ffe_items i
  WHERE i.id = '70622000-0000-4000-8000-000000000304';
  IF v_stage IS DISTINCT FROM 'ready' THEN
    RAISE EXCEPTION 'FAIL L edge: expected ready, got %', v_stage;
  END IF;
  RAISE NOTICE 'case L passed (labor reads its piece)';
END;
$$;

-- ─── case R: Rough $ never promotes ─────────────────────────────────────────

DO $$
DECLARE
  v_stage text;
  v_fn text;
BEGIN
  PERFORM set_config('app.ffe_mutation_rpc', 'on', true);
  UPDATE public.project_ffe_items SET rough_cents = 2000000000
  WHERE id IN ('70622000-0000-4000-8000-000000000191', '70622000-0000-4000-8000-000000000173',
               '70622000-0000-4000-8000-000000000192', '70622000-0000-4000-8000-000000000181');

  SELECT public.ffe_line_stage(i) INTO v_stage FROM public.project_ffe_items i
  WHERE i.id = '70622000-0000-4000-8000-000000000191';
  IF v_stage IS DISTINCT FROM 'placeholder' THEN RAISE EXCEPTION 'FAIL R R9a: rough promoted to %', v_stage; END IF;

  SELECT public.ffe_line_stage(i) INTO v_stage FROM public.project_ffe_items i
  WHERE i.id = '70622000-0000-4000-8000-000000000173';
  IF v_stage IS DISTINCT FROM 'specced' THEN RAISE EXCEPTION 'FAIL R R7c: rough promoted to %', v_stage; END IF;

  SELECT public.ffe_line_stage(i) INTO v_stage FROM public.project_ffe_items i
  WHERE i.id = '70622000-0000-4000-8000-000000000181';
  IF v_stage IS DISTINCT FROM 'specced' THEN RAISE EXCEPTION 'FAIL R R8a: rough promoted to %', v_stage; END IF;

  FOREACH v_fn IN ARRAY ARRAY['public.ffe_line_stage(public.project_ffe_items)',
                              'public.ffe_line_authorization(public.project_ffe_items)'] LOOP
    IF pg_get_functiondef(v_fn::regprocedure) ILIKE '%rough%' THEN
      RAISE EXCEPTION 'FAIL R: % reads rough_cents', v_fn;
    END IF;
  END LOOP;
  RAISE NOTICE 'case R passed (rough never promotes)';
END;
$$;

-- ─── case X: trust ──────────────────────────────────────────────────────────

DO $$
DECLARE
  v_fn text;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY['public.ffe_line_stage(public.project_ffe_items)',
                              'public.ffe_line_authorization(public.project_ffe_items)'] LOOP
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL X: authenticated must run % (computed field)', v_fn;
    END IF;
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL X: anon must not run %', v_fn;
    END IF;
  END LOOP;
  IF has_function_privilege('authenticated', 'public.ffe_line_authorization_state(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FAIL X: ffe_line_authorization_state must stay service-side (00705)';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid = 'public.ffe_line_stage(public.project_ffe_items)'::regprocedure) THEN
    RAISE EXCEPTION 'FAIL X: ffe_line_stage must be SECURITY INVOKER';
  END IF;
END;
$$;

-- A forged row: B builds a Project A line (R6a's id) by hand, outside RLS.
CREATE TEMP TABLE sq622_forged ON COMMIT DROP AS
SELECT i AS line FROM public.project_ffe_items i WHERE i.id = '70622000-0000-4000-8000-000000000161';
GRANT SELECT ON sq622_forged TO authenticated;

SET LOCAL ROLE authenticated;
SELECT pg_temp.act('70622000-0000-4000-8000-0000000000a5');

DO $$
DECLARE
  v_count int;
  v_auth text;
  v_stage text;
BEGIN
  SELECT count(*) INTO v_count FROM public.project_ffe_items
  WHERE project_id = '70622000-0000-4000-8000-000000000001';
  IF v_count <> 0 THEN RAISE EXCEPTION 'FAIL X: B reads % Project A lines', v_count; END IF;

  SELECT count(*) INTO v_count FROM public.project_ffe_items i
  WHERE i.id = '70622000-0000-4000-8000-000000000901' AND public.ffe_line_stage(i) = 'placeholder';
  IF v_count <> 1 THEN RAISE EXCEPTION 'FAIL X: B reads its own line''s stage'; END IF;

  SELECT public.ffe_line_authorization(f.line), public.ffe_line_stage(f.line) INTO v_auth, v_stage FROM sq622_forged f;
  IF v_stage IS NULL THEN RAISE EXCEPTION 'FAIL X: the forged row was not evaluated'; END IF;
  IF v_auth IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL X: a forged Project A row leaks its authorization (%) to B', v_auth;
  END IF;
  IF v_stage = 'released' THEN
    RAISE EXCEPTION 'FAIL X: a forged Project A row reads released for B';
  END IF;
  RAISE NOTICE 'case X passed (trust)';
END;
$$;

RESET ROLE;

ROLLBACK;
