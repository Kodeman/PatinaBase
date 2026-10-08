-- ═══════════════════════════════════════════════════════════════════════════
-- US-21 T-12 — the labor gate in SQL (migration 00732; SQ-618)
--
-- Anchors: link_ffe_pair base 00702:108 (one-level check :147); add_labor_line
-- (new); create_purchase_order outer 00450:15-52 (vendor refusal :38-43, NOT
-- rewritten); add_invoice_billing_lines 00718; columns 00729.
--
-- Studio A (owner O, member M) and an outsider X. One project with a Bedroom
-- and a Living room. The worked fixture is the Bedroom wallpaper (Phillip
-- Jeffries Manila Hemp, Chalk: 9 roll, trade $184, client $230) and its
-- install (9 roll, $85, no markup, $765), done by a hanger who is its own
-- vendor (S4, a7, Q5, R-PB7).
--
-- Cases:
--   L. link_ffe_pair(child, parent, kind): com by default; accessory; unlink
--      clears link_kind (story log #3); labor and unknown kinds refused; the
--      old two-argument signature is gone and a two-argument call resolves;
--      grants; an outsider is refused.
--   A. add_labor_line: the wallpaper install is a labor child with the
--      piece's room and scope, candidate, its own unit and rough $, its own
--      thread named for it. Refused under a labor line, a child, a removed
--      piece, a Trade Scope presence line, a piece on a PO and a released
--      piece; bad requests refused; an outsider refused; link_ffe_pair cannot
--      move a labor line or hang anything under it. Deferred checks fire.
--   P. create_purchase_order (not rewritten): the maker's PO refuses the
--      install (vendor ≠ maker) and a vendorless labor line; the maker's PO
--      holds the 9 rolls and no install; the installer, as vendor, gets the
--      install on its own PO.
--   I. add_invoice_billing_lines bills the install on its own $765 line,
--      apart from the wallpaper.
--
-- How to run (local stack, after applying 00732):
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -X -v ON_ERROR_STOP=1 -f supabase/tests/procurement/pieces_labor_gate_test.sql
--
-- One transaction, rolled back at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL timezone TO 'UTC';
SET LOCAL statement_timeout = '60s';

-- ─── fixtures ──────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('73200000-0000-4000-8000-0000000000a1', 't12-owner@test.invalid',    '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- O
  ('73200000-0000-4000-8000-0000000000a2', 't12-member@test.invalid',   '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'), -- M
  ('73200000-0000-4000-8000-0000000000a4', 't12-outsider@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'); -- X

INSERT INTO profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('73200000-0000-4000-8000-0000000000a1', 't12-owner@test.invalid',    'T12 Owner',    NOW(), NOW()),
  ('73200000-0000-4000-8000-0000000000a2', 't12-member@test.invalid',   'T12 Member',   NOW(), NOW()),
  ('73200000-0000-4000-8000-0000000000a4', 't12-outsider@test.invalid', 'T12 Outsider', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, type, name, slug)
VALUES ('73200000-0000-4000-8000-0000000000f1', 'design_studio', 'T12 Studio A', 't12-studio-a-test');

INSERT INTO organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('73200000-0000-4000-8000-0000000000e1', '73200000-0000-4000-8000-0000000000a1', '73200000-0000-4000-8000-0000000000f1', 'owner',  'active', NOW()),
  ('73200000-0000-4000-8000-0000000000e2', '73200000-0000-4000-8000-0000000000a2', '73200000-0000-4000-8000-0000000000f1', 'member', 'active', NOW());

INSERT INTO projects (id, name, designer_id, created_by, studio_id)
VALUES ('73200000-0000-4000-8000-000000000001', 'T12 Whole Home', '73200000-0000-4000-8000-0000000000a1', '73200000-0000-4000-8000-0000000000a1', '73200000-0000-4000-8000-0000000000f1');

INSERT INTO project_rooms (id, project_id, name, sort_order)
VALUES
  ('73200000-0000-4000-8000-0000000000c1', '73200000-0000-4000-8000-000000000001', 'Bedroom',     0),
  ('73200000-0000-4000-8000-0000000000c2', '73200000-0000-4000-8000-000000000001', 'Living room', 1);

-- 011 the maker, 012 the hanger (the installer), 013 the workroom, 014 the mill.
INSERT INTO vendors (id, name, orders_email)
VALUES
  ('73200000-0000-4000-8000-000000000011', 'Phillip Jeffries',      NULL),
  ('73200000-0000-4000-8000-000000000012', 'T12 Wallpaper Hanging', NULL),
  ('73200000-0000-4000-8000-000000000013', 'T12 Workroom',          NULL),
  ('73200000-0000-4000-8000-000000000014', 'T12 Mill',              NULL);

-- 101: a draft PO to the workroom that already holds line 207.
INSERT INTO purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, created_by)
VALUES ('73200000-0000-4000-8000-000000000101', '73200000-0000-4000-8000-0000000000a1', '73200000-0000-4000-8000-000000000001',
        '73200000-0000-4000-8000-000000000013', 'net_30', 120000, 'draft', '73200000-0000-4000-8000-0000000000a2');

-- 501 an executed Trade Scope and 601 its document (204 is its presence line).
-- 502 a furnishings authorization SENT to the client and 602 its document
-- (205 is released on it).
INSERT INTO proposals (id, project_id, designer_id, title, status, document_kind, commercial_state)
VALUES
  ('73200000-0000-4000-8000-000000000501', '73200000-0000-4000-8000-000000000001', '73200000-0000-4000-8000-0000000000a1',
   'T12 Living room millwork', 'draft', 'trade_scope', 'executed'),
  ('73200000-0000-4000-8000-000000000502', '73200000-0000-4000-8000-000000000001', '73200000-0000-4000-8000-0000000000a1',
   'T12 Authorization No. 1', 'draft', 'furnishings_authorization', 'sent');
INSERT INTO project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin, executed_at, created_by)
VALUES
  ('73200000-0000-4000-8000-000000000601', '73200000-0000-4000-8000-000000000001', '73200000-0000-4000-8000-000000000501',
   'trade_scope', NULL, false, now(), '73200000-0000-4000-8000-0000000000a1'),
  ('73200000-0000-4000-8000-000000000602', '73200000-0000-4000-8000-000000000001', '73200000-0000-4000-8000-000000000502',
   'furnishings_authorization', 'Authorization No. 1', false, NULL, '73200000-0000-4000-8000-0000000000a1');

-- Lines:
--   201 the wallpaper, Bedroom, 9 roll, selected, maker 011
--   202 the sofa, Living room, selected, workroom 013
--   203 the COM fabric, unassigned, candidate, mill 014
--   204 the Trade Scope presence line, Living room
--   205 a bedside lamp released on 602
--   206 a removed piece
--   207 a piece already on PO 101
INSERT INTO project_ffe_items (id, project_id, project_room_id, assignment_scope, name, status, quantity, unit,
                               unit_price_cents, trade_price_cents, line_total_cents, vendor_id, vendor_name,
                               design_disposition, purchase_order_id, trade_scope_document_id,
                               removed_at, removed_by, removal_reason)
VALUES
  ('73200000-0000-4000-8000-000000000201', '73200000-0000-4000-8000-000000000001', '73200000-0000-4000-8000-0000000000c1', 'room',
   'Phillip Jeffries Manila Hemp, Chalk', 'specified', 9, 'roll', 23000, 18400, 207000,
   '73200000-0000-4000-8000-000000000011', 'Phillip Jeffries', 'selected', NULL, NULL, NULL, NULL, NULL),
  ('73200000-0000-4000-8000-000000000202', '73200000-0000-4000-8000-000000000001', '73200000-0000-4000-8000-0000000000c2', 'room',
   'T12 sofa', 'specified', 1, 'each', 640000, 480000, 640000,
   '73200000-0000-4000-8000-000000000013', 'T12 Workroom', 'selected', NULL, NULL, NULL, NULL, NULL),
  ('73200000-0000-4000-8000-000000000203', '73200000-0000-4000-8000-000000000001', NULL, 'unassigned',
   'T12 COM fabric', 'specified', 14, 'yard', 0, 0, 0,
   '73200000-0000-4000-8000-000000000014', 'T12 Mill', 'candidate', NULL, NULL, NULL, NULL, NULL),
  ('73200000-0000-4000-8000-000000000204', '73200000-0000-4000-8000-000000000001', '73200000-0000-4000-8000-0000000000c2', 'room',
   'Living room millwork', 'specified', 1, 'each', 900000, NULL, 900000,
   NULL, NULL, 'selected', NULL, '73200000-0000-4000-8000-000000000601', NULL, NULL, NULL),
  ('73200000-0000-4000-8000-000000000205', '73200000-0000-4000-8000-000000000001', '73200000-0000-4000-8000-0000000000c1', 'room',
   'T12 bedside lamp', 'specified', 2, 'each', 45000, 30000, 90000,
   '73200000-0000-4000-8000-000000000013', 'T12 Workroom', 'selected', NULL, NULL, NULL, NULL, NULL),
  ('73200000-0000-4000-8000-000000000206', '73200000-0000-4000-8000-000000000001', '73200000-0000-4000-8000-0000000000c1', 'room',
   'T12 removed bench', 'specified', 1, 'each', 50000, 40000, 50000,
   '73200000-0000-4000-8000-000000000013', 'T12 Workroom', 'not_selected', NULL, NULL,
   now(), '73200000-0000-4000-8000-0000000000a1', 'added by mistake'),
  ('73200000-0000-4000-8000-000000000207', '73200000-0000-4000-8000-000000000001', '73200000-0000-4000-8000-0000000000c2', 'room',
   'T12 ottoman', 'ordered', 1, 'each', 120000, 90000, 120000,
   '73200000-0000-4000-8000-000000000013', 'T12 Workroom', 'selected', '73200000-0000-4000-8000-000000000101', NULL, NULL, NULL, NULL);

INSERT INTO furnishing_authorization_items (id, commercial_document_id, source_ffe_item_id, name, quantity, client_unit_price_cents, client_line_total_cents)
VALUES ('73200000-0000-4000-8000-000000000701', '73200000-0000-4000-8000-000000000602', '73200000-0000-4000-8000-000000000205',
        'T12 bedside lamp', 2, 45000, 90000);

-- 301: a draft invoice on the project.
INSERT INTO invoices (id, project_id, designer_id, status, tax_rate)
VALUES ('73200000-0000-4000-8000-000000000301', '73200000-0000-4000-8000-000000000001', '73200000-0000-4000-8000-0000000000a1', 'draft', 0);

-- ─── helpers ───────────────────────────────────────────────────────────────

-- Runs p_sql and returns the SQLSTATE + message it raised, or NULL.
CREATE OR REPLACE FUNCTION pg_temp.raised(p_sql text)
RETURNS text AS $$
BEGIN
  EXECUTE p_sql;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN SQLSTATE || ' ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

-- Acts as p_user for the rest of the transaction (auth.uid()).
CREATE OR REPLACE FUNCTION pg_temp.act(p_user uuid)
RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_user::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
END;
$$ LANGUAGE plpgsql;

-- A fixture write as the table owner mid-case (the client price and
-- disposition writers are other RPCs, out of this ticket's scope).
CREATE OR REPLACE FUNCTION pg_temp.as_owner(p_sql text)
RETURNS void SECURITY DEFINER AS $$
BEGIN
  EXECUTE p_sql;
END;
$$ LANGUAGE plpgsql;

-- Raises p_message unless p_ok.
CREATE OR REPLACE FUNCTION pg_temp.check(p_ok boolean, p_message text)
RETURNS void AS $$
BEGIN
  IF p_ok IS NOT TRUE THEN
    RAISE EXCEPTION '%', p_message;
  END IF;
END;
$$ LANGUAGE plpgsql;

GRANT EXECUTE ON FUNCTION pg_temp.raised(text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.act(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.as_owner(text) TO authenticated;
GRANT EXECUTE ON FUNCTION pg_temp.check(boolean, text) TO authenticated;

-- Shared between cases: the install's id.
CREATE TEMP TABLE t12_ids (k text PRIMARY KEY, id uuid NOT NULL);
GRANT SELECT, INSERT ON t12_ids TO authenticated;

-- ─── case L: link_ffe_pair gains its kind (run as postgres: catalog reads) ──

DO $$
BEGIN
  PERFORM pg_temp.check(
    (SELECT array_agg(oid::regprocedure::text) FROM pg_proc
      WHERE proname = 'link_ffe_pair' AND pronamespace = 'public'::regnamespace)
      = ARRAY['link_ffe_pair(uuid,uuid,text)'],
    'FAIL L0: only link_ffe_pair(uuid,uuid,text) exists after 00732');
  PERFORM pg_temp.check(
    has_function_privilege('authenticated', 'public.link_ffe_pair(uuid,uuid,text)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.link_ffe_pair(uuid,uuid,text)', 'EXECUTE')
    AND has_function_privilege('authenticated', 'public.add_labor_line(uuid,jsonb)', 'EXECUTE')
    AND NOT has_function_privilege('anon', 'public.add_labor_line(uuid,jsonb)', 'EXECUTE'),
    'FAIL L0: authenticated executes both RPCs; anon executes neither');
  -- Fixture check (authenticated cannot execute this helper): 205 is released.
  PERFORM pg_temp.check(public.ffe_line_authorization_state('73200000-0000-4000-8000-000000000205') = 'sent',
    'FAIL L0: fixture 205 reads released (sent)');
END;
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  v_row public.project_ffe_items%ROWTYPE;
  v_err text;
BEGIN
  PERFORM pg_temp.act('73200000-0000-4000-8000-0000000000a2');

  -- L1: a two-argument call resolves and pairs as COM.
  v_row := public.link_ffe_pair('73200000-0000-4000-8000-000000000203', '73200000-0000-4000-8000-000000000202');
  PERFORM pg_temp.check(v_row.parent_ffe_item_id = '73200000-0000-4000-8000-000000000202' AND v_row.link_kind = 'com',
    'FAIL L1: the default kind is com, got ' || COALESCE(v_row.link_kind, 'NULL'));

  -- L2: unlink clears link_kind with the parent (story log #3).
  v_row := public.link_ffe_pair('73200000-0000-4000-8000-000000000203', NULL);
  PERFORM pg_temp.check(v_row.parent_ffe_item_id IS NULL AND v_row.link_kind IS NULL,
    'FAIL L2: unlink clears parent and link_kind, got ' || COALESCE(v_row.link_kind, 'NULL'));

  -- L3: accessory, then back to com.
  v_row := public.link_ffe_pair('73200000-0000-4000-8000-000000000203', '73200000-0000-4000-8000-000000000202', 'accessory');
  PERFORM pg_temp.check(v_row.link_kind = 'accessory', 'FAIL L3: kind accessory is written');
  v_row := public.link_ffe_pair('73200000-0000-4000-8000-000000000203', '73200000-0000-4000-8000-000000000202', 'com');
  PERFORM pg_temp.check(v_row.link_kind = 'com', 'FAIL L3: kind com is written on a re-link');

  -- L4: labor is refused; it goes through add_labor_line.
  v_err := pg_temp.raised($q$SELECT public.link_ffe_pair('73200000-0000-4000-8000-000000000203', '73200000-0000-4000-8000-000000000202', 'labor')$q$);
  PERFORM pg_temp.check(v_err LIKE '23514 %add_labor_line%', 'FAIL L4: labor refused, got ' || COALESCE(v_err, 'no error'));

  -- L5: an unknown kind is refused.
  v_err := pg_temp.raised($q$SELECT public.link_ffe_pair('73200000-0000-4000-8000-000000000203', '73200000-0000-4000-8000-000000000202', 'trim')$q$);
  PERFORM pg_temp.check(v_err LIKE '23514 %com or accessory%', 'FAIL L5: unknown kind refused, got ' || COALESCE(v_err, 'no error'));

  -- L6: the one-level check (00702:147) is kept: the COM line cannot be a piece.
  v_err := pg_temp.raised($q$SELECT public.link_ffe_pair('73200000-0000-4000-8000-000000000205', '73200000-0000-4000-8000-000000000203')$q$);
  PERFORM pg_temp.check(v_err LIKE '23514 %already supplies%', 'FAIL L6: one level, got ' || COALESCE(v_err, 'no error'));

  -- L7: an outsider is refused.
  PERFORM pg_temp.act('73200000-0000-4000-8000-0000000000a4');
  v_err := pg_temp.raised($q$SELECT public.link_ffe_pair('73200000-0000-4000-8000-000000000203', NULL)$q$);
  PERFORM pg_temp.check(v_err LIKE '42501 %', 'FAIL L7: outsider refused, got ' || COALESCE(v_err, 'no error'));
END;
$$;

-- ─── case A: add_labor_line ─────────────────────────────────────────────────

DO $$
DECLARE
  v_result jsonb;
  v_install public.project_ffe_items%ROWTYPE;
  v_parent public.project_ffe_items%ROWTYPE;
  v_label text;
BEGIN
  PERFORM pg_temp.act('73200000-0000-4000-8000-0000000000a2');

  -- A1: the wallpaper's install, 9 roll, by the hanger.
  v_result := public.add_labor_line('73200000-0000-4000-8000-000000000201',
    '{"name": "Install, wallpaper hanger", "quantity": 9, "unit": "roll", "roughCents": 76500,
      "vendorId": "73200000-0000-4000-8000-000000000012"}');
  PERFORM pg_temp.check(v_result->>'parentFfeItemId' = '73200000-0000-4000-8000-000000000201'
    AND v_result ? 'selectionId', 'FAIL A1: returns {selectionId, parentFfeItemId}, got ' || v_result::text);
  INSERT INTO t12_ids VALUES ('install', (v_result->>'selectionId')::uuid);

  SELECT * INTO v_install FROM public.project_ffe_items WHERE id = (v_result->>'selectionId')::uuid;
  SELECT * INTO v_parent FROM public.project_ffe_items WHERE id = '73200000-0000-4000-8000-000000000201';
  PERFORM pg_temp.check(v_install.line_kind = 'labor' AND v_install.link_kind = 'labor'
    AND v_install.parent_ffe_item_id = v_parent.id,
    'FAIL A1: a labor child of the wallpaper');
  PERFORM pg_temp.check(v_install.project_room_id = v_parent.project_room_id
    AND v_install.assignment_scope = v_parent.assignment_scope
    AND v_install.assignment_scope = 'room',
    'FAIL A1: the install takes the wallpaper''s room and scope');
  PERFORM pg_temp.check(v_install.design_disposition = 'candidate' AND v_install.name = 'Install, wallpaper hanger'
    AND v_install.quantity = 9 AND v_install.unit = 'roll' AND v_install.rough_cents = 76500,
    'FAIL A1: candidate, named, 9 roll, rough $765');
  PERFORM pg_temp.check(v_install.vendor_id = '73200000-0000-4000-8000-000000000012'
    AND v_install.vendor_name = 'T12 Wallpaper Hanging' AND v_install.purchase_order_id IS NULL,
    'FAIL A1: the hanger is the install''s vendor; it is on no PO');
  PERFORM pg_temp.check(v_install.selection_thread_id <> v_parent.selection_thread_id,
    'FAIL A1: the install has its own thread');
  SELECT need_label INTO v_label FROM public.project_ffe_selection_threads WHERE id = v_install.selection_thread_id;
  PERFORM pg_temp.check(v_label = 'Install, wallpaper hanger', 'FAIL A1: the thread is named for the install, got ' || COALESCE(v_label, 'NULL'));
  PERFORM pg_temp.check(EXISTS (SELECT 1 FROM public.project_ffe_specs WHERE ffe_item_id = v_install.id),
    'FAIL A1: the install has its spec row');
  PERFORM pg_temp.check(v_parent.parent_ffe_item_id IS NULL AND v_parent.line_kind = 'goods' AND v_parent.link_kind IS NULL,
    'FAIL A1: the wallpaper stays a goods piece');
END;
$$;

-- Fire the deferred checks now (thread consistency, thread FKs): a ROLLBACK
-- would otherwise skip them.
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;

DO $$
DECLARE
  v_install uuid := (SELECT id FROM t12_ids WHERE k = 'install');
  v_err text;
BEGIN
  PERFORM pg_temp.act('73200000-0000-4000-8000-0000000000a2');

  -- A2: refused pieces.
  v_err := pg_temp.raised(format($q$SELECT public.add_labor_line(%L, '{"name": "x"}')$q$, v_install));
  PERFORM pg_temp.check(v_err LIKE '23514 %not to another labor line%', 'FAIL A2: under a labor line, got ' || COALESCE(v_err, 'no error'));
  v_err := pg_temp.raised($q$SELECT public.add_labor_line('73200000-0000-4000-8000-000000000203', '{"name": "x"}')$q$);
  PERFORM pg_temp.check(v_err LIKE '23514 %not to a line that supplies one%', 'FAIL A2: under a COM child, got ' || COALESCE(v_err, 'no error'));
  v_err := pg_temp.raised($q$SELECT public.add_labor_line('73200000-0000-4000-8000-000000000206', '{"name": "x"}')$q$);
  PERFORM pg_temp.check(v_err LIKE '23514 %was removed%', 'FAIL A2: under a removed piece, got ' || COALESCE(v_err, 'no error'));
  v_err := pg_temp.raised($q$SELECT public.add_labor_line('73200000-0000-4000-8000-000000000204', '{"name": "x"}')$q$);
  PERFORM pg_temp.check(v_err LIKE '23514 %Trade Scope%', 'FAIL A2: under a Trade Scope presence line, got ' || COALESCE(v_err, 'no error'));
  v_err := pg_temp.raised($q$SELECT public.add_labor_line('73200000-0000-4000-8000-000000000207', '{"name": "x"}')$q$);
  PERFORM pg_temp.check(v_err LIKE '23514 %on an order%', 'FAIL A2: under a piece on a PO, got ' || COALESCE(v_err, 'no error'));
  v_err := pg_temp.raised($q$SELECT public.add_labor_line('73200000-0000-4000-8000-000000000205', '{"name": "x"}')$q$);
  PERFORM pg_temp.check(v_err LIKE '23514 %released%', 'FAIL A2: under a released piece, got ' || COALESCE(v_err, 'no error'));
  PERFORM pg_temp.check(NOT EXISTS (SELECT 1 FROM public.project_ffe_items
                                     WHERE parent_ffe_item_id IN ('73200000-0000-4000-8000-000000000204',
                                                                  '73200000-0000-4000-8000-000000000205',
                                                                  '73200000-0000-4000-8000-000000000206',
                                                                  '73200000-0000-4000-8000-000000000207')),
    'FAIL A2: no refused call left a line behind');

  -- A3: refused requests.
  v_err := pg_temp.raised($q$SELECT public.add_labor_line('73200000-0000-4000-8000-000000000202', '{"quantity": 1}')$q$);
  PERFORM pg_temp.check(v_err LIKE '23514 %needs a name%', 'FAIL A3: no name, got ' || COALESCE(v_err, 'no error'));
  v_err := pg_temp.raised($q$SELECT public.add_labor_line('73200000-0000-4000-8000-000000000202', '{"name": "x", "quantity": 0}')$q$);
  PERFORM pg_temp.check(v_err LIKE '23514 %quantity%', 'FAIL A3: quantity 0, got ' || COALESCE(v_err, 'no error'));
  v_err := pg_temp.raised($q$SELECT public.add_labor_line('73200000-0000-4000-8000-000000000202', '{"name": "x", "quantity": 1.5}')$q$);
  PERFORM pg_temp.check(v_err LIKE '23514 %quantity%', 'FAIL A3: fractional quantity, got ' || COALESCE(v_err, 'no error'));
  v_err := pg_temp.raised($q$SELECT public.add_labor_line('73200000-0000-4000-8000-000000000202', '{"name": "x", "unit": "bolt"}')$q$);
  PERFORM pg_temp.check(v_err LIKE '23514 %project_ffe_items_unit_check%', 'FAIL A3: unknown unit, got ' || COALESCE(v_err, 'no error'));
  v_err := pg_temp.raised($q$SELECT public.add_labor_line('73200000-0000-4000-8000-000000000202', '{"name": "x", "roughCents": -1}')$q$);
  PERFORM pg_temp.check(v_err LIKE '23514 %roughCents%', 'FAIL A3: negative rough, got ' || COALESCE(v_err, 'no error'));
  v_err := pg_temp.raised($q$SELECT public.add_labor_line('73200000-0000-4000-8000-000000000202', '{"name": "x", "unitPriceCents": 8500}')$q$);
  PERFORM pg_temp.check(v_err LIKE '23514 %keys name, quantity, unit, roughCents, vendorId%', 'FAIL A3: unknown key, got ' || COALESCE(v_err, 'no error'));
  v_err := pg_temp.raised($q$SELECT public.add_labor_line('73200000-0000-4000-8000-000000000202', '{"name": "x", "vendorId": "73200000-0000-4000-8000-0000000000ff"}')$q$);
  PERFORM pg_temp.check(v_err LIKE '23514 %vendor not found%', 'FAIL A3: unknown vendor, got ' || COALESCE(v_err, 'no error'));
  v_err := pg_temp.raised($q$SELECT public.add_labor_line('73200000-0000-4000-8000-000000000202', '{"name": "x", "vendorId": "nope"}')$q$);
  PERFORM pg_temp.check(v_err LIKE '23514 %vendor not found%', 'FAIL A3: malformed vendor id, got ' || COALESCE(v_err, 'no error'));

  -- A5: link_ffe_pair never moves a labor line or hangs anything under one.
  v_err := pg_temp.raised(format($q$SELECT public.link_ffe_pair(%L, NULL)$q$, v_install));
  PERFORM pg_temp.check(v_err LIKE '23514 %stays on its piece%', 'FAIL A5: unlinking labor, got ' || COALESCE(v_err, 'no error'));
  v_err := pg_temp.raised(format($q$SELECT public.link_ffe_pair(%L, '73200000-0000-4000-8000-000000000202', 'com')$q$, v_install));
  PERFORM pg_temp.check(v_err LIKE '23514 %stays on its piece%', 'FAIL A5: re-linking labor, got ' || COALESCE(v_err, 'no error'));
  v_err := pg_temp.raised(format($q$SELECT public.link_ffe_pair('73200000-0000-4000-8000-000000000203', %L)$q$, v_install));
  PERFORM pg_temp.check(v_err LIKE '23514 %already supplies%', 'FAIL A5: a line under labor, got ' || COALESCE(v_err, 'no error'));

  -- A4: an outsider is refused.
  PERFORM pg_temp.act('73200000-0000-4000-8000-0000000000a4');
  v_err := pg_temp.raised($q$SELECT public.add_labor_line('73200000-0000-4000-8000-000000000202', '{"name": "x"}')$q$);
  PERFORM pg_temp.check(v_err LIKE '42501 %', 'FAIL A4: outsider refused, got ' || COALESCE(v_err, 'no error'));
END;
$$;

-- ─── case P: create_purchase_order keeps labor off the maker's PO ───────────

DO $$
DECLARE
  v_install uuid := (SELECT id FROM t12_ids WHERE k = 'install');
  v_result jsonb;
  v_loose uuid;
  v_po public.purchase_orders%ROWTYPE;
  v_err text;
  v_n int;
BEGIN
  PERFORM pg_temp.act('73200000-0000-4000-8000-0000000000a2');

  -- Fixture: the install is priced $85 / roll with no markup ($765) and
  -- selected, as the client-price and disposition writers would leave it.
  PERFORM pg_temp.as_owner(format($q$UPDATE public.project_ffe_items
     SET design_disposition = 'selected', unit_price_cents = 8500, trade_price_cents = 8500,
         line_total_cents = 76500
   WHERE id = %L$q$, v_install));

  -- A vendorless labor line on the sofa, selected too.
  v_result := public.add_labor_line('73200000-0000-4000-8000-000000000202',
    '{"name": "Deliver and place", "unit": "lot"}');
  v_loose := (v_result->>'selectionId')::uuid;
  PERFORM pg_temp.check((SELECT vendor_id IS NULL AND quantity = 1 AND unit = 'lot' AND rough_cents IS NULL
                           FROM public.project_ffe_items WHERE id = v_loose),
    'FAIL P0: a labor line without a vendor, 1 lot, no rough $');
  PERFORM pg_temp.as_owner(format($q$UPDATE public.project_ffe_items
     SET design_disposition = 'selected', unit_price_cents = 30000, line_total_cents = 30000
   WHERE id = %L$q$, v_loose));

  -- P1: the maker's PO refuses the install (its vendor is the hanger).
  v_err := pg_temp.raised(format($q$SELECT public.create_purchase_order(
      '73200000-0000-4000-8000-000000000001', '73200000-0000-4000-8000-000000000011', 'net_30',
      ARRAY['73200000-0000-4000-8000-000000000201', %L]::uuid[])$q$, v_install));
  PERFORM pg_temp.check(v_err LIKE '23000 %every PO line must be an active selected line for the PO project and vendor%',
    'FAIL P1: the install never rides the maker''s PO, got ' || COALESCE(v_err, 'no error'));

  -- P2: nor does a labor line with no vendor ride the workroom's PO.
  v_err := pg_temp.raised(format($q$SELECT public.create_purchase_order(
      '73200000-0000-4000-8000-000000000001', '73200000-0000-4000-8000-000000000013', 'net_30',
      ARRAY['73200000-0000-4000-8000-000000000202', %L]::uuid[])$q$, v_loose));
  PERFORM pg_temp.check(v_err LIKE '23000 %every PO line must be an active selected line for the PO project and vendor%',
    'FAIL P2: a vendorless labor line never rides a maker''s PO, got ' || COALESCE(v_err, 'no error'));

  -- P3: the maker's PO for Phillip Jeffries: 9 rolls and no install.
  v_po := public.create_purchase_order(
    p_project_id      => '73200000-0000-4000-8000-000000000001',
    p_vendor_id       => '73200000-0000-4000-8000-000000000011',
    p_payment_pattern => 'net_30',
    p_ffe_item_ids    => ARRAY['73200000-0000-4000-8000-000000000201']::uuid[]);
  PERFORM pg_temp.check(v_po.id IS NOT NULL AND v_po.vendor_id = '73200000-0000-4000-8000-000000000011',
    'FAIL P3: the maker''s PO is created');
  SELECT count(*) INTO v_n FROM public.project_ffe_items WHERE purchase_order_id = v_po.id;
  PERFORM pg_temp.check(v_n = 1, 'FAIL P3: the maker''s PO has one line, got ' || v_n);
  PERFORM pg_temp.check((SELECT id = '73200000-0000-4000-8000-000000000201' AND quantity = 9 AND unit = 'roll'
                              AND line_kind = 'goods'
                           FROM public.project_ffe_items WHERE purchase_order_id = v_po.id),
    'FAIL P3: the maker''s PO lists the wallpaper, 9 roll');
  PERFORM pg_temp.check(NOT EXISTS (SELECT 1 FROM public.project_ffe_items
                                     WHERE purchase_order_id = v_po.id AND line_kind = 'labor'),
    'FAIL P3: the maker''s PO has no labor line');
  PERFORM pg_temp.check((SELECT purchase_order_id IS NULL FROM public.project_ffe_items WHERE id = v_install),
    'FAIL P3: the install is on no PO');

  -- The wallpaper is on an order now: its labor changes through Record a change.
  v_err := pg_temp.raised($q$SELECT public.add_labor_line('73200000-0000-4000-8000-000000000201', '{"name": "Second coat"}')$q$);
  PERFORM pg_temp.check(v_err LIKE '23514 %on an order%', 'FAIL P3: labor under an ordered piece, got ' || COALESCE(v_err, 'no error'));

  -- P4: the installer is the vendor: the install goes on the hanger's own PO.
  v_po := public.create_purchase_order(
    p_project_id      => '73200000-0000-4000-8000-000000000001',
    p_vendor_id       => '73200000-0000-4000-8000-000000000012',
    p_payment_pattern => 'net_30',
    p_ffe_item_ids    => ARRAY[v_install]::uuid[]);
  PERFORM pg_temp.check(v_po.vendor_id = '73200000-0000-4000-8000-000000000012'
    AND (SELECT purchase_order_id FROM public.project_ffe_items WHERE id = v_install) = v_po.id
    AND (SELECT count(*) FROM public.project_ffe_items WHERE purchase_order_id = v_po.id) = 1,
    'FAIL P4: the installer''s PO holds the install alone');
END;
$$;

-- ─── case I: the install bills on its own line ──────────────────────────────

DO $$
DECLARE
  v_install uuid := (SELECT id FROM t12_ids WHERE k = 'install');
  v_wall public.invoice_line_items%ROWTYPE;
  v_labor public.invoice_line_items%ROWTYPE;
  v_inv public.invoices%ROWTYPE;
  v_n int;
BEGIN
  PERFORM pg_temp.act('73200000-0000-4000-8000-0000000000a2');

  PERFORM public.add_invoice_billing_lines('73200000-0000-4000-8000-000000000301', jsonb_build_array(
    jsonb_build_object('ffeItemId', '73200000-0000-4000-8000-000000000201', 'stage', 'deposit', 'depositPct', 50),
    jsonb_build_object('ffeItemId', v_install, 'stage', 'deposit', 'depositPct', 100,
                       'description', 'Install, wallpaper hanger')));

  SELECT count(*) INTO v_n FROM public.invoice_line_items WHERE invoice_id = '73200000-0000-4000-8000-000000000301';
  PERFORM pg_temp.check(v_n = 2, 'FAIL I1: two invoice lines, got ' || v_n);
  SELECT * INTO v_labor FROM public.invoice_line_items
   WHERE invoice_id = '73200000-0000-4000-8000-000000000301' AND ffe_item_id = v_install;
  PERFORM pg_temp.check(v_labor.id IS NOT NULL AND v_labor.kind = 'ffe' AND v_labor.amount_cents = 76500
    AND v_labor.description = 'Install, wallpaper hanger',
    'FAIL I1: the install bills on its own $765 line, got ' || COALESCE(v_labor.amount_cents::text, 'no line'));
  SELECT * INTO v_wall FROM public.invoice_line_items
   WHERE invoice_id = '73200000-0000-4000-8000-000000000301' AND ffe_item_id = '73200000-0000-4000-8000-000000000201';
  PERFORM pg_temp.check(v_wall.id IS NOT NULL AND v_wall.id <> v_labor.id AND v_wall.amount_cents = 103500,
    'FAIL I1: the wallpaper bills on its own line ($1,035 of $2,070), got ' || COALESCE(v_wall.amount_cents::text, 'no line'));
  SELECT * INTO v_inv FROM public.invoices WHERE id = '73200000-0000-4000-8000-000000000301';
  PERFORM pg_temp.check(v_inv.subtotal_cents = 180000,
    'FAIL I1: subtotal $1,035 + $765, got ' || v_inv.subtotal_cents);
END;
$$;

RESET ROLE;

DO $$ BEGIN RAISE NOTICE 'pieces_labor_gate_test: all cases passed (L, A, P, I)'; END $$;

ROLLBACK;
