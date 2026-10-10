-- ═══════════════════════════════════════════════════════════════════════════
-- US-21 T-47 — Merge catalog duplicates, never hard delete (migration 00753;
-- SQ-653; D11, Q11, S5)
--
-- public.merge_studio_product(uuid, uuid) and the narrowed
-- products_studio_delete policy. CONTRACT §2 W5 00753.
-- Anchors: products.merged_into_id / deleted_at 00152:55-56;
-- products_studio_delete base 00584:1270-1282; project_ffe_items.product_id
-- ON DELETE SET NULL 00066:261 (R1 F30); _ffe_require_studio_project 00717:75.
--
-- Studio A (owner O, member N), client C on Project 1; Studio B (owner B) with
-- Project X. Studio A products: D (the duplicate), K (kept), E (merged into D
-- earlier), F and F2 (a configured pair), R, H and U (delete probes).
-- Cases:
--   M.  The merge of D into K re-points every line on D (selected, on a PO,
--       removed), both project-board items, and the project product list; no
--       line is un-filled; D carries merged_into_id = K and deleted_at and
--       still exists; E now points at K. Issued proposal copy keeps D, and a
--       project that already lists K keeps its D row.
--   R.  Refusals, nothing written: the same product twice; D again (already
--       merged); into D (merged); Studio B's owner; the client; across
--       studios; a line carrying a configuration of the duplicate.
--   X.  anon cannot execute; authenticated can.
--   S5. Under RLS as O: deleting K (on lines), R (only on a removed line) and
--       H (only on a line in Studio B's project, which O cannot read) deletes
--       nothing; deleting U (on no line) deletes it.
--
-- How to run (local stack):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/catalog/pieces_catalog_merge_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('75300000-0000-4000-8000-0000000000a1', 'p753-owner@test.invalid',   '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- O
  ('75300000-0000-4000-8000-0000000000a2', 'p753-client@test.invalid',  '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- C
  ('75300000-0000-4000-8000-0000000000a3', 'p753-member@test.invalid',  '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- N
  ('75300000-0000-4000-8000-0000000000a5', 'p753-owner-b@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- B

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('75300000-0000-4000-8000-0000000000a1', 'p753-owner@test.invalid',   'P753 Owner',   now(), now()),
  ('75300000-0000-4000-8000-0000000000a2', 'p753-client@test.invalid',  'P753 Client',  now(), now()),
  ('75300000-0000-4000-8000-0000000000a3', 'p753-member@test.invalid',  'P753 Member',  now(), now()),
  ('75300000-0000-4000-8000-0000000000a5', 'p753-owner-b@test.invalid', 'P753 Owner B', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug)
VALUES
  ('75300000-0000-4000-8000-0000000000f1', 'design_studio', 'P753 Studio A', 'p753-studio-a-test'),
  ('75300000-0000-4000-8000-0000000000f2', 'design_studio', 'P753 Studio B', 'p753-studio-b-test');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('75300000-0000-4000-8000-0000000000e1', '75300000-0000-4000-8000-0000000000a1', '75300000-0000-4000-8000-0000000000f1', 'owner',  'active', now()),
  ('75300000-0000-4000-8000-0000000000e3', '75300000-0000-4000-8000-0000000000a3', '75300000-0000-4000-8000-0000000000f1', 'member', 'active', now()),
  ('75300000-0000-4000-8000-0000000000e5', '75300000-0000-4000-8000-0000000000a5', '75300000-0000-4000-8000-0000000000f2', 'owner',  'active', now());

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
VALUES
  ('75300000-0000-4000-8000-000000000001', 'P753 Whole Home',
   '75300000-0000-4000-8000-0000000000a1', '75300000-0000-4000-8000-0000000000a2',
   '75300000-0000-4000-8000-0000000000a1', '75300000-0000-4000-8000-0000000000f1', 'active'),
  ('75300000-0000-4000-8000-000000000002', 'P753 Guest House',
   '75300000-0000-4000-8000-0000000000a1', '75300000-0000-4000-8000-0000000000a2',
   '75300000-0000-4000-8000-0000000000a1', '75300000-0000-4000-8000-0000000000f1', 'active'),
  ('75300000-0000-4000-8000-000000000009', 'P753 Studio B job',
   '75300000-0000-4000-8000-0000000000a5', NULL,
   '75300000-0000-4000-8000-0000000000a5', '75300000-0000-4000-8000-0000000000f2', 'active');

INSERT INTO public.vendors (id, name)
VALUES ('75300000-0000-4000-8000-000000000011', 'P753 Workroom');

-- Studio-layer products (00152 products_studio_requires_metadata).
INSERT INTO public.products (
  id, name, captured_at, layer, studio_id,
  vendor_contact, lead_time_weeks, payment_terms, category, usage_notes
)
SELECT p.id, p.name, now(), 'studio', p.studio_id,
       '{}'::jsonb, 6, 'net_30', 'seating', 'test'
FROM (VALUES
  ('75300000-0000-4000-8000-000000000021'::uuid, 'P753 Lounge chair (dup)', '75300000-0000-4000-8000-0000000000f1'::uuid), -- D
  ('75300000-0000-4000-8000-000000000022'::uuid, 'P753 Lounge chair',       '75300000-0000-4000-8000-0000000000f1'::uuid), -- K
  ('75300000-0000-4000-8000-000000000023'::uuid, 'P753 Lounge chair (old)', '75300000-0000-4000-8000-0000000000f1'::uuid), -- E
  ('75300000-0000-4000-8000-000000000024'::uuid, 'P753 Sofa (configured)',  '75300000-0000-4000-8000-0000000000f1'::uuid), -- F
  ('75300000-0000-4000-8000-000000000025'::uuid, 'P753 Sofa',               '75300000-0000-4000-8000-0000000000f1'::uuid), -- F2
  ('75300000-0000-4000-8000-000000000026'::uuid, 'P753 Removed-line rug',   '75300000-0000-4000-8000-0000000000f1'::uuid), -- R
  ('75300000-0000-4000-8000-000000000027'::uuid, 'P753 Lent lamp',          '75300000-0000-4000-8000-0000000000f1'::uuid), -- H
  ('75300000-0000-4000-8000-000000000028'::uuid, 'P753 Unused stool',       '75300000-0000-4000-8000-0000000000f1'::uuid), -- U
  ('75300000-0000-4000-8000-000000000029'::uuid, 'P753 Studio B chair',     '75300000-0000-4000-8000-0000000000f2'::uuid)  -- BK
) AS p(id, name, studio_id);

UPDATE public.products
   SET merged_into_id = '75300000-0000-4000-8000-000000000021', deleted_at = now()
 WHERE id = '75300000-0000-4000-8000-000000000023';

INSERT INTO public.purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, created_by)
VALUES ('75300000-0000-4000-8000-000000000051', '75300000-0000-4000-8000-0000000000a1',
        '75300000-0000-4000-8000-000000000001', '75300000-0000-4000-8000-000000000011',
        'net_30', 120000, 'draft', '75300000-0000-4000-8000-0000000000a1');

-- Lines (fixture writes, as postgres):
--   101 selected chair on D                 → M (re-pointed)
--   102 ordered chair on D, on the PO       → M (re-pointed, PO kept)
--   103 removed chair on D                  → M (re-pointed)
--   104 placeholder, no product             → M (stays a placeholder)
--   105 removed rug on R                    → S5
--   106 configured sofa on F                → R
--   901 lamp on H, in Studio B's project    → S5
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, product_id, vendor_id, quantity,
  unit_price_cents, line_total_cents, design_disposition, purchase_order_id
) VALUES
  ('75300000-0000-4000-8000-000000000101', '75300000-0000-4000-8000-000000000001', 'Lounge chair',
   'specified', 'fixed', '75300000-0000-4000-8000-000000000021', '75300000-0000-4000-8000-000000000011', 2,
   60000, 120000, 'selected', NULL),
  ('75300000-0000-4000-8000-000000000102', '75300000-0000-4000-8000-000000000001', 'Lounge chair, study',
   'specified', 'fixed', '75300000-0000-4000-8000-000000000021', '75300000-0000-4000-8000-000000000011', 2,
   60000, 120000, 'selected', '75300000-0000-4000-8000-000000000051'),
  ('75300000-0000-4000-8000-000000000103', '75300000-0000-4000-8000-000000000001', 'Lounge chair, porch',
   'specified', 'fixed', '75300000-0000-4000-8000-000000000021', NULL, 1,
   0, 0, 'not_selected', NULL),
  ('75300000-0000-4000-8000-000000000104', '75300000-0000-4000-8000-000000000001', 'Side table',
   'specified', 'fixed', NULL, NULL, 1,
   0, 0, 'candidate', NULL),
  ('75300000-0000-4000-8000-000000000105', '75300000-0000-4000-8000-000000000001', 'Rug',
   'specified', 'fixed', '75300000-0000-4000-8000-000000000026', NULL, 1,
   0, 0, 'not_selected', NULL),
  ('75300000-0000-4000-8000-000000000106', '75300000-0000-4000-8000-000000000001', 'Sofa',
   'specified', 'fixed', '75300000-0000-4000-8000-000000000024', NULL, 1,
   0, 0, 'candidate', NULL),
  ('75300000-0000-4000-8000-000000000901', '75300000-0000-4000-8000-000000000009', 'Lamp',
   'specified', 'fixed', '75300000-0000-4000-8000-000000000027', NULL, 1,
   0, 0, 'candidate', NULL);

UPDATE public.project_ffe_items
   SET removed_at = now(), removed_by = '75300000-0000-4000-8000-0000000000a1',
       removal_reason = 'removed while building', removed_disposition = 'candidate'
 WHERE id IN ('75300000-0000-4000-8000-000000000103', '75300000-0000-4000-8000-000000000105');
SELECT set_config('app.ffe_mutation_rpc', '', true);

-- The sofa's spec carries a configuration of F (configuration workflow GUC,
-- guard_project_configuration_snapshot).
INSERT INTO public.product_configurations (
  id, product_id, owner_user_id, version, schema_revision, evaluation, snapshot, snapshot_hash
) VALUES (
  '75300000-0000-4000-8000-000000000061', '75300000-0000-4000-8000-000000000024',
  '75300000-0000-4000-8000-0000000000a1', 1, 1, '{}'::jsonb, '{}'::jsonb, repeat('a', 64)
);
SELECT set_config('patina.configuration_spec_workflow', '00403', true);
UPDATE public.project_ffe_specs
   SET configuration_id = '75300000-0000-4000-8000-000000000061'
 WHERE ffe_item_id = '75300000-0000-4000-8000-000000000106';
SELECT set_config('patina.configuration_spec_workflow', '', true);

-- Boards: a project board with D twice (one linked to line 101), and a legacy
-- proposal board whose proposal is issued after its item is placed.
INSERT INTO public.proposals (id, designer_id, client_id, title, status)
VALUES ('75300000-0000-4000-8000-000000000071', '75300000-0000-4000-8000-0000000000a1',
        '75300000-0000-4000-8000-0000000000a2', 'P753 Proposal', 'draft');
INSERT INTO public.proposal_boards (id, name, project_id, proposal_id)
VALUES
  ('75300000-0000-4000-8000-000000000081', 'P753 Living board', '75300000-0000-4000-8000-000000000001', NULL),
  ('75300000-0000-4000-8000-000000000082', 'P753 Proposal board', NULL, '75300000-0000-4000-8000-000000000071');
INSERT INTO public.proposal_board_items (id, board_id, type, product_id, project_ffe_item_id)
VALUES
  ('75300000-0000-4000-8000-000000000083', '75300000-0000-4000-8000-000000000081', 'product',
   '75300000-0000-4000-8000-000000000021', '75300000-0000-4000-8000-000000000101'),
  ('75300000-0000-4000-8000-000000000084', '75300000-0000-4000-8000-000000000081', 'product',
   '75300000-0000-4000-8000-000000000021', NULL),
  ('75300000-0000-4000-8000-000000000085', '75300000-0000-4000-8000-000000000082', 'product',
   '75300000-0000-4000-8000-000000000021', NULL);
-- The send rail's GUC (guard_proposal_authority) lets the fixture issue it.
SELECT set_config('app.proposal_send_id', '75300000-0000-4000-8000-000000000071', true);
UPDATE public.proposals SET status = 'sent' WHERE id = '75300000-0000-4000-8000-000000000071';
SELECT set_config('app.proposal_send_id', '', true);

-- Project product lists: Project 1 lists D; Project 2 lists D and K.
INSERT INTO public.project_products (id, project_id, product_id)
VALUES
  ('75300000-0000-4000-8000-000000000091', '75300000-0000-4000-8000-000000000001', '75300000-0000-4000-8000-000000000021'),
  ('75300000-0000-4000-8000-000000000092', '75300000-0000-4000-8000-000000000002', '75300000-0000-4000-8000-000000000021'),
  ('75300000-0000-4000-8000-000000000093', '75300000-0000-4000-8000-000000000002', '75300000-0000-4000-8000-000000000022');

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

-- ─── R. Refusals, before the merge ─────────────────────────────────────────
DO $$
DECLARE
  v_err text;
  v_d constant text := '75300000-0000-4000-8000-000000000021';
  v_k constant text := '75300000-0000-4000-8000-000000000022';
BEGIN
  PERFORM pg_temp.assume('75300000-0000-4000-8000-0000000000a1');
  v_err := pg_temp.refusal(format('SELECT public.merge_studio_product(%L, %L)', v_d, v_d));
  IF v_err IS DISTINCT FROM '22023|A product cannot merge into itself.' THEN
    RAISE EXCEPTION 'R: self merge not refused: %', v_err;
  END IF;

  -- Across studios: A's duplicate into Studio B's product.
  v_err := pg_temp.refusal(format('SELECT public.merge_studio_product(%L, %L)',
    v_d, '75300000-0000-4000-8000-000000000029'));
  IF v_err IS DISTINCT FROM '42501|product not found or access denied' THEN
    RAISE EXCEPTION 'R: cross-studio merge not refused: %', v_err;
  END IF;

  -- The configured sofa.
  v_err := pg_temp.refusal(format('SELECT public.merge_studio_product(%L, %L)',
    '75300000-0000-4000-8000-000000000024', '75300000-0000-4000-8000-000000000025'));
  IF v_err IS DISTINCT FROM '23514|A line uses a configuration of this product, so it cannot merge.' THEN
    RAISE EXCEPTION 'R: configured merge not refused: %', v_err;
  END IF;
  IF (SELECT product_id FROM public.project_ffe_items WHERE id = '75300000-0000-4000-8000-000000000106')
     IS DISTINCT FROM '75300000-0000-4000-8000-000000000024'::uuid
     OR (SELECT merged_into_id FROM public.products WHERE id = '75300000-0000-4000-8000-000000000024') IS NOT NULL THEN
    RAISE EXCEPTION 'R: the configured refusal wrote';
  END IF;

  -- Studio B's owner, and the client.
  PERFORM pg_temp.assume('75300000-0000-4000-8000-0000000000a5');
  v_err := pg_temp.refusal(format('SELECT public.merge_studio_product(%L, %L)', v_d, v_k));
  IF v_err IS DISTINCT FROM '42501|product not found or access denied' THEN
    RAISE EXCEPTION 'R: Studio B owner not refused: %', v_err;
  END IF;
  PERFORM pg_temp.assume('75300000-0000-4000-8000-0000000000a2');
  v_err := pg_temp.refusal(format('SELECT public.merge_studio_product(%L, %L)', v_d, v_k));
  IF v_err IS DISTINCT FROM '42501|product not found or access denied' THEN
    RAISE EXCEPTION 'R: client not refused: %', v_err;
  END IF;

  IF EXISTS (SELECT 1 FROM public.products
             WHERE id IN (v_d::uuid, v_k::uuid) AND (merged_into_id IS NOT NULL OR deleted_at IS NOT NULL)) THEN
    RAISE EXCEPTION 'R: a refused merge wrote';
  END IF;
  RAISE NOTICE 'R passed: self, cross-studio, configured, other studio and client refused; nothing written';
END $$;

-- ─── M. The merge ──────────────────────────────────────────────────────────
DO $$
DECLARE
  v_d constant uuid := '75300000-0000-4000-8000-000000000021';
  v_k constant uuid := '75300000-0000-4000-8000-000000000022';
  v_unfilled_before integer;
  v_result jsonb;
  v_product public.products%ROWTYPE;
  v_line public.project_ffe_items%ROWTYPE;
BEGIN
  SELECT count(*) INTO v_unfilled_before FROM public.project_ffe_items
  WHERE project_id IN ('75300000-0000-4000-8000-000000000001', '75300000-0000-4000-8000-000000000009')
    AND product_id IS NULL;

  -- A studio member, not only the owner, may merge.
  PERFORM pg_temp.assume('75300000-0000-4000-8000-0000000000a3');
  v_result := public.merge_studio_product(v_d, v_k);

  IF v_result IS DISTINCT FROM jsonb_build_object(
       'fromId', v_d, 'intoId', v_k, 'lines', 3, 'boardItems', 2,
       'projectProducts', 1, 'earlierMerges', 1) THEN
    RAISE EXCEPTION 'M: unexpected result: %', v_result;
  END IF;

  -- No live line is un-filled.
  IF EXISTS (SELECT 1 FROM public.project_ffe_items WHERE product_id = v_d) THEN
    RAISE EXCEPTION 'M: a line still names the duplicate';
  END IF;
  IF (SELECT count(*) FROM public.project_ffe_items
      WHERE id IN ('75300000-0000-4000-8000-000000000101', '75300000-0000-4000-8000-000000000102',
                   '75300000-0000-4000-8000-000000000103')
        AND product_id = v_k) <> 3 THEN
    RAISE EXCEPTION 'M: the three chair lines are not on the kept product';
  END IF;
  IF (SELECT count(*) FROM public.project_ffe_items
      WHERE project_id IN ('75300000-0000-4000-8000-000000000001', '75300000-0000-4000-8000-000000000009')
        AND product_id IS NULL) <> v_unfilled_before THEN
    RAISE EXCEPTION 'M: a line was un-filled';
  END IF;
  SELECT * INTO v_line FROM public.project_ffe_items WHERE id = '75300000-0000-4000-8000-000000000102';
  IF v_line.purchase_order_id IS DISTINCT FROM '75300000-0000-4000-8000-000000000051'::uuid
     OR v_line.line_total_cents IS DISTINCT FROM 120000 THEN
    RAISE EXCEPTION 'M: the ordered line moved: %', row_to_json(v_line);
  END IF;
  SELECT * INTO v_line FROM public.project_ffe_items WHERE id = '75300000-0000-4000-8000-000000000103';
  IF v_line.removed_at IS NULL THEN
    RAISE EXCEPTION 'M: the removed line was restored';
  END IF;

  -- The duplicate is merged, not deleted.
  SELECT * INTO v_product FROM public.products WHERE id = v_d;
  IF NOT FOUND OR v_product.merged_into_id IS DISTINCT FROM v_k OR v_product.deleted_at IS NULL THEN
    RAISE EXCEPTION 'M: the duplicate does not carry merged_into_id and deleted_at: %',
      row_to_json(v_product);
  END IF;
  SELECT * INTO v_product FROM public.products WHERE id = v_k;
  IF v_product.merged_into_id IS NOT NULL OR v_product.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'M: the kept product was touched';
  END IF;
  IF (SELECT merged_into_id FROM public.products WHERE id = '75300000-0000-4000-8000-000000000023')
     IS DISTINCT FROM v_k THEN
    RAISE EXCEPTION 'M: the earlier merge still points at the duplicate';
  END IF;

  -- Board items: the project board moves; issued proposal copy keeps D.
  IF (SELECT count(*) FROM public.proposal_board_items
      WHERE id IN ('75300000-0000-4000-8000-000000000083', '75300000-0000-4000-8000-000000000084')
        AND product_id = v_k) <> 2 THEN
    RAISE EXCEPTION 'M: the project board items were not re-pointed';
  END IF;
  IF (SELECT product_id FROM public.proposal_board_items WHERE id = '75300000-0000-4000-8000-000000000085')
     IS DISTINCT FROM v_d THEN
    RAISE EXCEPTION 'M: issued proposal copy was rewritten';
  END IF;

  -- Project product lists: Project 1 moves; Project 2 already lists K.
  IF (SELECT product_id FROM public.project_products WHERE id = '75300000-0000-4000-8000-000000000091')
     IS DISTINCT FROM v_k
     OR (SELECT product_id FROM public.project_products WHERE id = '75300000-0000-4000-8000-000000000092')
     IS DISTINCT FROM v_d THEN
    RAISE EXCEPTION 'M: project product lists are wrong';
  END IF;
  RAISE NOTICE 'M passed: 3 lines, 2 board items, 1 list row and 1 earlier merge re-pointed; nothing un-filled; D merged into K';
END $$;

-- ─── R (after). A merged product cannot merge again or be merged into ──────
DO $$
DECLARE v_err text;
BEGIN
  PERFORM pg_temp.assume('75300000-0000-4000-8000-0000000000a1');
  v_err := pg_temp.refusal($q$SELECT public.merge_studio_product(
    '75300000-0000-4000-8000-000000000021', '75300000-0000-4000-8000-000000000022')$q$);
  IF v_err IS DISTINCT FROM '23514|This product was already merged or removed.' THEN
    RAISE EXCEPTION 'R: a second merge not refused: %', v_err;
  END IF;
  v_err := pg_temp.refusal($q$SELECT public.merge_studio_product(
    '75300000-0000-4000-8000-000000000028', '75300000-0000-4000-8000-000000000021')$q$);
  IF v_err IS DISTINCT FROM '23514|The product to keep was merged or removed.' THEN
    RAISE EXCEPTION 'R: a merge into a merged product not refused: %', v_err;
  END IF;
  RAISE NOTICE 'R passed: merged products refuse a second merge either way';
END $$;

-- ─── X. Grants ─────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.merge_studio_product(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'X: anon can execute merge_studio_product';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.merge_studio_product(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'X: authenticated cannot execute merge_studio_product';
  END IF;
  IF has_function_privilege('anon', 'public._product_on_a_schedule_line(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'X: anon can execute _product_on_a_schedule_line';
  END IF;
  RAISE NOTICE 'X passed: anon refused, authenticated granted';
END $$;

-- ─── S5. A referenced delete is refused ────────────────────────────────────
-- As O, under RLS. Each DELETE of a referenced product matches no row.
CREATE TEMP TABLE p753_deleted (probe text, n integer) ON COMMIT DROP;
GRANT INSERT, SELECT ON p753_deleted TO authenticated;

SELECT set_config('request.jwt.claims',
  json_build_object('sub', '75300000-0000-4000-8000-0000000000a1', 'role', 'authenticated')::text, true);
SELECT set_config('request.jwt.claim.sub', '75300000-0000-4000-8000-0000000000a1', true);
SELECT set_config('request.jwt.claim.role', 'authenticated', true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE v_n integer;
BEGIN
  -- O cannot read Studio B's line, so an invoker NOT EXISTS would miss it.
  IF EXISTS (SELECT 1 FROM public.project_ffe_items WHERE id = '75300000-0000-4000-8000-000000000901') THEN
    RAISE EXCEPTION 'S5: fixture premise failed, O can read Studio B''s line';
  END IF;

  DELETE FROM public.products WHERE id = '75300000-0000-4000-8000-000000000022'; -- K, on lines
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO p753_deleted VALUES ('K', v_n);
  DELETE FROM public.products WHERE id = '75300000-0000-4000-8000-000000000026'; -- R, removed line only
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO p753_deleted VALUES ('R', v_n);
  DELETE FROM public.products WHERE id = '75300000-0000-4000-8000-000000000027'; -- H, Studio B's line only
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO p753_deleted VALUES ('H', v_n);
  DELETE FROM public.products WHERE id = '75300000-0000-4000-8000-000000000028'; -- U, on no line
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO p753_deleted VALUES ('U', v_n);
END $$;

RESET ROLE;

DO $$
DECLARE v_got text;
BEGIN
  SELECT string_agg(probe || '=' || n, ',' ORDER BY probe) INTO v_got FROM p753_deleted;
  IF v_got IS DISTINCT FROM 'H=0,K=0,R=0,U=1' THEN
    RAISE EXCEPTION 'S5: delete counts %, expected H=0,K=0,R=0,U=1', v_got;
  END IF;
  IF (SELECT count(*) FROM public.products
      WHERE id IN ('75300000-0000-4000-8000-000000000022', '75300000-0000-4000-8000-000000000026',
                   '75300000-0000-4000-8000-000000000027')) <> 3 THEN
    RAISE EXCEPTION 'S5: a referenced product was deleted';
  END IF;
  IF (SELECT count(*) FROM public.project_ffe_items
      WHERE id IN ('75300000-0000-4000-8000-000000000101', '75300000-0000-4000-8000-000000000105',
                   '75300000-0000-4000-8000-000000000901')
        AND product_id IS NOT NULL) <> 3 THEN
    RAISE EXCEPTION 'S5: a line was un-filled';
  END IF;
  IF EXISTS (SELECT 1 FROM public.products WHERE id = '75300000-0000-4000-8000-000000000028') THEN
    RAISE EXCEPTION 'S5: the unreferenced product was not deleted';
  END IF;
  RAISE NOTICE 'S5 passed: referenced deletes (lines, removed line, unreadable line) refused; unreferenced delete allowed';
END $$;

ROLLBACK;
