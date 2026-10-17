-- ═══════════════════════════════════════════════════════════════════════════
-- US-37 inherited client / cross-org pricing paths (SQ-1174 + SQ-1199, 00813, D6)
--
-- Astra SQ-1170's three repros, each with a denial and a positive control:
--
--   F1 studio-less job  job N has no studio; its client K shares the
--                       unrelated design studio B with lead O. K reads no
--                       release snapshot, FFE line, pricing settings or PO
--                       money of N, and no gate admits K. Lead O and O's
--                       design-studio teammate T still read and pass. X, who
--                       shares only a manufacturer org with O, is not O's team.
--   F2 proposal lines   K reads no line of O's proposals on studio-A job S
--                       (cross-studio), on N (K is the client) or with no job
--                       (K is the client). O reads all three; T reads S's and
--                       N's, and the job-less 721 (O has two studios and no
--                       household on it) stays with O.
--   R2 job-less lines   (SQ-1199) every proposal carries the studio it was
--                       drafted in. K reads no line of her own duplicate of
--                       S's proposal (clone_proposal starts it with no job)
--                       nor of 731, a job-less proposal for studio A's client
--                       C, and cannot re-stamp one. O and T read both.
--   F3 anon catalog     anon cannot read products.price_trade, nor the trade
--                       figures inside configuration_summary and pricing_tiers
--                       (SQ-1199 R3), nor commission_rate (SQ-1218), and holds
--                       no table-level SELECT, while every anon reader's column
--                       set still reads; a signed-in designer still reads all
--                       three trade columns.
--   R189 history        (SQ-1218, Astra SQ-1213 F2/F3) the column is dropped
--                       and 00813 replayed, as a deployed database first met
--                       it: the one backfill stamps by recorded authority only
--                       (job, commercial-document binding, parent). A
--                       historical duplicate whose lead now sits only in B is
--                       NULL, an authorization bound to S is A, a revision
--                       takes its parent's A; B's peer reads none of their
--                       lines. A replay after a membership change and a new
--                       job binding, and after studio A is deleted, changes no
--                       stamp and opens no line to B.
--
-- Run: cd supabase && supabase test db tests/ffe/us37_inherited_pricing_paths_test.sql
--  or: psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -X -q \
--        -v ON_ERROR_STOP=1 -f supabase/tests/ffe/us37_inherited_pricing_paths_test.sql
-- Everything is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(63);

-- ─── helpers ───────────────────────────────────────────────────────────────

-- Rows the CURRENT role sees for a query; -1 when the role may not read it.
CREATE FUNCTION pg_temp.visible_rows(p_sql text)
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_count integer;
BEGIN
  EXECUTE format('SELECT count(*)::integer FROM (%s) AS q', p_sql) INTO v_count;
  RETURN v_count;
EXCEPTION WHEN insufficient_privilege THEN
  RETURN -1;
END;
$$;

GRANT EXECUTE ON FUNCTION pg_temp.visible_rows(text) TO authenticated, anon;

-- ─── fixtures (as postgres) ────────────────────────────────────────────────
-- O owns studio A and is a member of the unrelated design studio B and of
-- manufacturer org M. T is O's teammate in A. K is a homeowner who also sits
-- in B; K is the client of studio-less job N. X sits only in M with O.
-- C is the client of studio-A job S.

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('81300000-0000-4000-8000-0000000000a1', 'us37-inherited-lead@test.invalid',     '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('81300000-0000-4000-8000-0000000000a2', 'us37-inherited-client@test.invalid',   '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('81300000-0000-4000-8000-0000000000a3', 'us37-inherited-teammate@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('81300000-0000-4000-8000-0000000000a4', 'us37-inherited-homeowner@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('81300000-0000-4000-8000-0000000000a5', 'us37-inherited-maker@test.invalid',    '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('81300000-0000-4000-8000-0000000000a1', 'us37-inherited-lead@test.invalid',      'Inherited Lead',      true,  now(), now()),
  ('81300000-0000-4000-8000-0000000000a2', 'us37-inherited-client@test.invalid',    'Inherited Client',    false, now(), now()),
  ('81300000-0000-4000-8000-0000000000a3', 'us37-inherited-teammate@test.invalid',  'Inherited Teammate',  true,  now(), now()),
  ('81300000-0000-4000-8000-0000000000a4', 'us37-inherited-homeowner@test.invalid', 'Inherited Homeowner', false, now(), now()),
  ('81300000-0000-4000-8000-0000000000a5', 'us37-inherited-maker@test.invalid',     'Inherited Maker',     false, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;

INSERT INTO public.organizations (id, type, name, slug)
VALUES
  ('81300000-0000-4000-8000-0000000000f1', 'design_studio', 'Inherited Studio A', 'us37-inherited-studio-a-test'),
  ('81300000-0000-4000-8000-0000000000f2', 'design_studio', 'Inherited Studio B', 'us37-inherited-studio-b-test'),
  ('81300000-0000-4000-8000-0000000000f3', 'manufacturer',  'Inherited Maker M',  'us37-inherited-maker-m-test');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('81300000-0000-4000-8000-0000000000e1', '81300000-0000-4000-8000-0000000000a1', '81300000-0000-4000-8000-0000000000f1', 'owner',  'active', now()),
  ('81300000-0000-4000-8000-0000000000e2', '81300000-0000-4000-8000-0000000000a3', '81300000-0000-4000-8000-0000000000f1', 'member', 'active', now()),
  ('81300000-0000-4000-8000-0000000000e3', '81300000-0000-4000-8000-0000000000a1', '81300000-0000-4000-8000-0000000000f2', 'member', 'active', now()),
  ('81300000-0000-4000-8000-0000000000e4', '81300000-0000-4000-8000-0000000000a4', '81300000-0000-4000-8000-0000000000f2', 'member', 'active', now()),
  ('81300000-0000-4000-8000-0000000000e5', '81300000-0000-4000-8000-0000000000a1', '81300000-0000-4000-8000-0000000000f3', 'member', 'active', now()),
  ('81300000-0000-4000-8000-0000000000e6', '81300000-0000-4000-8000-0000000000a5', '81300000-0000-4000-8000-0000000000f3', 'member', 'active', now());

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
VALUES
  ('81300000-0000-4000-8000-000000000001', 'Inherited Job S',
   '81300000-0000-4000-8000-0000000000a1', '81300000-0000-4000-8000-0000000000a2',
   '81300000-0000-4000-8000-0000000000a1', '81300000-0000-4000-8000-0000000000f1', 'active'),
  ('81300000-0000-4000-8000-000000000002', 'Inherited Job N',
   '81300000-0000-4000-8000-0000000000a1', '81300000-0000-4000-8000-0000000000a4',
   '81300000-0000-4000-8000-0000000000a1', NULL, 'active');
-- The legacy studio-less population (Astra's repro shape).
UPDATE public.projects SET studio_id = NULL WHERE id = '81300000-0000-4000-8000-000000000002';

INSERT INTO public.vendors (id, name)
VALUES ('81300000-0000-4000-8000-000000000011', 'Inherited Mill');

INSERT INTO public.products (id, name, captured_at, layer, owner_user_id, status, images, price_retail, price_trade)
VALUES ('81300000-0000-4000-8000-000000000021', 'Inherited Lounge chair', now(), 'personal',
        '81300000-0000-4000-8000-0000000000a1', 'draft',
        ARRAY['https://img.test/inherited-a.jpg'], 150000, 70000);

-- A published catalog piece: what the anon catalog pages read.
INSERT INTO public.products (
  id, name, captured_at, layer, patina_managed, status, published_at, vendor_id, brand, category,
  description, short_description, images, dimensions, lead_time_weeks, price_retail, price_trade
) VALUES (
  '81300000-0000-4000-8000-000000000031', 'Inherited Catalog sofa', now(), 'catalog', true, 'published', now(),
  '81300000-0000-4000-8000-000000000011', 'Inherited Mill', 'seating',
  'A catalog sofa.', 'Sofa', ARRAY['https://img.test/inherited-sofa.jpg'], NULL, 8, 150000, 70000
);

INSERT INTO public.project_pricing_settings (project_id, markup_target_percent, sales_tax_rate)
VALUES ('81300000-0000-4000-8000-000000000002', 40, 0.0825);

-- One priced line on N with its trade cost and markup.
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
SELECT set_config('app.ffe_pricing_writer', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, product_id, quantity,
  unit_price_cents, line_total_cents, trade_price_cents, markup_percent,
  retail_unit_cents, price_basis, doc_code, design_disposition, assignment_scope, sort_order
) VALUES
  ('81300000-0000-4000-8000-000000000101', '81300000-0000-4000-8000-000000000002', 'Lounge chair',
   'specified', 'fixed', '81300000-0000-4000-8000-000000000021', 1,
   120000, 120000, 70000, 71.43, 150000, 'markup', 'LR-01', 'selected', 'unassigned', 0);

-- An executed furnishings authorization on N, its release snapshot carrying
-- the trade cost and markup.
INSERT INTO public.proposals (id, project_id, designer_id, client_id, title, status, document_kind, commercial_state, total_amount, subtotal)
VALUES ('81300000-0000-4000-8000-000000000401', '81300000-0000-4000-8000-000000000002', '81300000-0000-4000-8000-0000000000a1',
        '81300000-0000-4000-8000-0000000000a4', 'Inherited Authorization N', 'accepted', 'furnishings_authorization', 'executed', 120000, 120000);
INSERT INTO public.project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin, bound_at, executed_at, created_by)
VALUES ('81300000-0000-4000-8000-000000000402', '81300000-0000-4000-8000-000000000002', '81300000-0000-4000-8000-000000000401',
        'furnishings_authorization', 'Authorization No. 1', false, now(), now(), '81300000-0000-4000-8000-0000000000a1');
INSERT INTO public.furnishing_authorization_items (
  id, commercial_document_id, source_ffe_item_id, product_id, name, room_name, category, item_type,
  quantity, client_unit_price_cents, client_line_total_cents, trade_unit_cost_cents, markup_percent, sort_order
) VALUES ('81300000-0000-4000-8000-000000000403', '81300000-0000-4000-8000-000000000402', '81300000-0000-4000-8000-000000000101',
          '81300000-0000-4000-8000-000000000021', 'Lounge chair', 'Living room', 'seating', 'fixed', 1, 120000, 120000, 70000, 71.43, 0);
UPDATE public.project_ffe_items
   SET source_commercial_document_id = '81300000-0000-4000-8000-000000000402',
       source_authorization_item_id = '81300000-0000-4000-8000-000000000403'
 WHERE id = '81300000-0000-4000-8000-000000000101';
SELECT set_config('app.ffe_pricing_writer', '', true);
SELECT set_config('app.ffe_mutation_rpc', '', true);

-- A purchase order on N: trade money behind can_send_purchase_order.
INSERT INTO public.purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, created_by, sent_at)
VALUES ('81300000-0000-4000-8000-000000000051', '81300000-0000-4000-8000-0000000000a1',
        '81300000-0000-4000-8000-000000000002', '81300000-0000-4000-8000-000000000011',
        'net_30', 70000, 'confirmed', '81300000-0000-4000-8000-0000000000a1', now());

-- Three draft proposals by O, each line carrying trade cost and markup:
-- 701 on studio-A job S (client C), 711 on studio-less N (client K),
-- 721 with no job (client K). 701's line names the catalog sofa, which any
-- signed-in caller sees, so clone_proposal's product visibility guard lets K
-- copy it (R2).
INSERT INTO public.proposals (id, project_id, designer_id, client_id, title, total_amount, status, client_visibility_tier)
VALUES
  ('81300000-0000-4000-8000-000000000701', '81300000-0000-4000-8000-000000000001', '81300000-0000-4000-8000-0000000000a1',
   '81300000-0000-4000-8000-0000000000a2', 'Inherited Proposal S', 120000, 'draft', 'full'),
  ('81300000-0000-4000-8000-000000000711', '81300000-0000-4000-8000-000000000002', '81300000-0000-4000-8000-0000000000a1',
   '81300000-0000-4000-8000-0000000000a4', 'Inherited Proposal N', 120000, 'draft', 'full'),
  ('81300000-0000-4000-8000-000000000721', NULL, '81300000-0000-4000-8000-0000000000a1',
   '81300000-0000-4000-8000-0000000000a4', 'Inherited Proposal no job', 120000, 'draft', 'full');
INSERT INTO public.proposal_items (
  id, proposal_id, product_id, name, quantity, unit_price, unit_sell_price, markup_percent,
  line_total_cents, vendor_name, position, item_type
) VALUES
  ('81300000-0000-4000-8000-000000000702', '81300000-0000-4000-8000-000000000701', '81300000-0000-4000-8000-000000000031',
   'Lounge chair', 1, 70000, 120000, 71.43, 120000, 'Inherited Mill', 0, 'fixed'),
  ('81300000-0000-4000-8000-000000000712', '81300000-0000-4000-8000-000000000711', '81300000-0000-4000-8000-000000000021',
   'Lounge chair', 1, 70000, 120000, 71.43, 120000, 'Inherited Mill', 0, 'fixed'),
  ('81300000-0000-4000-8000-000000000722', '81300000-0000-4000-8000-000000000721', '81300000-0000-4000-8000-000000000021',
   'Lounge chair', 1, 70000, 120000, 71.43, 120000, 'Inherited Mill', 0, 'fixed');

-- SQ-1199 R2: studio A holds C's household; 731 is a job-less proposal for C
-- drafted from that relationship, its line carrying trade cost and markup.
INSERT INTO public.client_households (id, organization_id, designer_id, display_name)
VALUES ('81300000-0000-4000-8000-000000000751', '81300000-0000-4000-8000-0000000000f1', '81300000-0000-4000-8000-0000000000a1', 'Inherited Household C');
INSERT INTO public.designer_clients (id, designer_id, client_id, household_id, status)
VALUES ('81300000-0000-4000-8000-000000000741', '81300000-0000-4000-8000-0000000000a1', '81300000-0000-4000-8000-0000000000a2', '81300000-0000-4000-8000-000000000751', 'active');
INSERT INTO public.proposals (id, project_id, designer_id, client_id, designer_client_id, title, total_amount, status, client_visibility_tier)
VALUES ('81300000-0000-4000-8000-000000000731', NULL, '81300000-0000-4000-8000-0000000000a1', '81300000-0000-4000-8000-0000000000a2', '81300000-0000-4000-8000-000000000741',
        'Inherited Proposal no job, studio A client', 120000, 'draft', 'full');
INSERT INTO public.proposal_items (
  id, proposal_id, product_id, name, quantity, unit_price, unit_sell_price, markup_percent,
  line_total_cents, vendor_name, position, item_type
) VALUES ('81300000-0000-4000-8000-000000000732', '81300000-0000-4000-8000-000000000731', '81300000-0000-4000-8000-000000000021',
          'Lounge chair', 1, 70000, 120000, 71.43, 120000, 'Inherited Mill', 0, 'fixed');

-- SQ-1199 R3: the catalog sofa's JSON columns carry its trade figures, as the
-- 00413 writer stores them.
UPDATE public.products
   SET configuration_summary = jsonb_build_object('baseTradePriceCents', 70000),
       pricing_tiers = jsonb_build_array(jsonb_build_object('minQuantity', 1, 'tradePriceCents', 70000))
 WHERE id = '81300000-0000-4000-8000-000000000031';

-- ─── preconditions ─────────────────────────────────────────────────────────

SELECT ok(
  (SELECT studio_id IS NULL AND client_id = '81300000-0000-4000-8000-0000000000a4'
     FROM public.projects WHERE id = '81300000-0000-4000-8000-000000000002'),
  'fixture: job N is studio-less and K is its client'
);
SELECT ok(
  (SELECT (SELECT trade_price_cents = 70000 AND markup_percent IS NOT NULL
             FROM public.project_ffe_items WHERE id = '81300000-0000-4000-8000-000000000101')
      AND (SELECT trade_unit_cost_cents = 70000 AND markup_percent IS NOT NULL
             FROM public.furnishing_authorization_items WHERE id = '81300000-0000-4000-8000-000000000403')
      AND (SELECT count(*) = 3 FROM public.proposal_items
            WHERE id IN ('81300000-0000-4000-8000-000000000702', '81300000-0000-4000-8000-000000000712',
                         '81300000-0000-4000-8000-000000000722')
              AND unit_price = 70000 AND markup_percent IS NOT NULL)),
  'fixture: N''s line, release snapshot and the three proposal lines carry trade cost and markup'
);
SELECT ok(
  (SELECT layer = 'catalog' AND price_trade = 70000
          AND (configuration_summary->>'baseTradePriceCents')::integer = 70000
          AND (pricing_tiers->0->>'tradePriceCents')::integer = 70000
     FROM public.products WHERE id = '81300000-0000-4000-8000-000000000031'),
  'fixture: the catalog sofa carries a trade price, also inside configuration_summary and pricing_tiers'
);
SELECT is(
  (SELECT array_agg(COALESCE(studio_id::text, 'none') ORDER BY id)
     FROM public.proposals
    WHERE id IN ('81300000-0000-4000-8000-000000000701', '81300000-0000-4000-8000-000000000711', '81300000-0000-4000-8000-000000000721', '81300000-0000-4000-8000-000000000731')),
  ARRAY['81300000-0000-4000-8000-0000000000f1', 'none', 'none', '81300000-0000-4000-8000-0000000000f1'],
  'R2 stamp: S''s proposal carries S''s studio A; N''s and 721 carry none (O has two studios, no household); 731 carries its household''s studio A'
);

-- ─── F1: the studio-less job's client K ────────────────────────────────────

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81300000-0000-4000-8000-0000000000a4","role":"authenticated"}';

SELECT is(public.can_buy_for_project('81300000-0000-4000-8000-000000000002'), false,
  'F1 client K: can_buy_for_project refuses the studio-less job she is the client of');
SELECT is(pg_temp.visible_rows($$SELECT trade_unit_cost_cents, markup_percent FROM public.furnishing_authorization_items WHERE commercial_document_id = '81300000-0000-4000-8000-000000000402'$$),
  0, 'F1 client K: no release snapshot of job N');
SELECT is(pg_temp.visible_rows($$SELECT trade_price_cents, retail_unit_cents, price_basis FROM public.project_ffe_items WHERE project_id = '81300000-0000-4000-8000-000000000002'$$),
  0, 'F1 client K: no project_ffe_items row of job N');
SELECT is(pg_temp.visible_rows($$SELECT 1 FROM public.project_pricing_settings WHERE project_id = '81300000-0000-4000-8000-000000000002'$$),
  0, 'F1 client K: no project_pricing_settings of job N');
SELECT is(public.can_send_purchase_order('81300000-0000-4000-8000-000000000051'), false,
  'F1 client K: can_send_purchase_order refuses job N''s order');
SELECT is(pg_temp.visible_rows($$SELECT total_cents FROM public.purchase_orders WHERE id = '81300000-0000-4000-8000-000000000051'$$),
  0, 'F1 client K: no purchase order of job N');
SELECT ok(public.po_release_preview('81300000-0000-4000-8000-000000000002', '81300000-0000-4000-8000-000000000011', 1000) IS NULL,
  'F1 client K: po_release_preview answers nothing for job N');

-- ─── F1: lead O keeps everything ───────────────────────────────────────────

SET LOCAL request.jwt.claims = '{"sub":"81300000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT is(public.can_buy_for_project('81300000-0000-4000-8000-000000000002'), true,
  'F1 lead O: can_buy_for_project admits the studio-less job');
SELECT is(pg_temp.visible_rows($$SELECT 1 FROM public.furnishing_authorization_items WHERE commercial_document_id = '81300000-0000-4000-8000-000000000402' AND trade_unit_cost_cents = 70000$$),
  1, 'F1 lead O: reads job N''s release snapshot with its cost');
SELECT is(pg_temp.visible_rows($$SELECT 1 FROM public.project_ffe_items WHERE project_id = '81300000-0000-4000-8000-000000000002' AND trade_price_cents = 70000$$),
  1, 'F1 lead O: reads job N''s priced line');
SELECT is(pg_temp.visible_rows($$SELECT 1 FROM public.project_pricing_settings WHERE project_id = '81300000-0000-4000-8000-000000000002'$$),
  1, 'F1 lead O: reads job N''s pricing settings');
SELECT is(public.can_send_purchase_order('81300000-0000-4000-8000-000000000051'), true,
  'F1 lead O: can_send_purchase_order admits job N''s order');
SELECT ok(public.po_release_preview('81300000-0000-4000-8000-000000000002', '81300000-0000-4000-8000-000000000011', 1000) IS NOT NULL,
  'F1 lead O: po_release_preview answers for job N');

-- ─── F1: O's design-studio teammate T keeps everything ─────────────────────

SET LOCAL request.jwt.claims = '{"sub":"81300000-0000-4000-8000-0000000000a3","role":"authenticated"}';

SELECT is(public.can_buy_for_project('81300000-0000-4000-8000-000000000002'), true,
  'F1 teammate T: can_buy_for_project admits the lead''s studio-less job');
SELECT is(pg_temp.visible_rows($$SELECT 1 FROM public.furnishing_authorization_items WHERE commercial_document_id = '81300000-0000-4000-8000-000000000402' AND trade_unit_cost_cents = 70000$$),
  1, 'F1 teammate T: reads job N''s release snapshot with its cost');
SELECT is(pg_temp.visible_rows($$SELECT 1 FROM public.project_ffe_items WHERE project_id = '81300000-0000-4000-8000-000000000002' AND trade_price_cents = 70000$$),
  1, 'F1 teammate T: reads job N''s priced line');
SELECT is(pg_temp.visible_rows($$SELECT 1 FROM public.project_pricing_settings WHERE project_id = '81300000-0000-4000-8000-000000000002'$$),
  1, 'F1 teammate T: reads job N''s pricing settings');
SELECT is(public.can_send_purchase_order('81300000-0000-4000-8000-000000000051'), true,
  'F1 teammate T: can_send_purchase_order admits job N''s order');
SELECT is(pg_temp.visible_rows($$SELECT 1 FROM public.purchase_orders WHERE id = '81300000-0000-4000-8000-000000000051' AND total_cents = 70000$$),
  1, 'F1 teammate T: reads job N''s purchase order');
SELECT ok(public.po_release_preview('81300000-0000-4000-8000-000000000002', '81300000-0000-4000-8000-000000000011', 1000) IS NOT NULL,
  'F1 teammate T: po_release_preview answers for job N');

-- ─── F1: a shared manufacturer org is not the lead's team ──────────────────

SET LOCAL request.jwt.claims = '{"sub":"81300000-0000-4000-8000-0000000000a5","role":"authenticated"}';

SELECT is(public.can_buy_for_project('81300000-0000-4000-8000-000000000002'), false,
  'F1 maker X: a shared manufacturer org does not admit the studio-less job');

-- ─── F2: proposal lines belong to the job's team ───────────────────────────

SET LOCAL request.jwt.claims = '{"sub":"81300000-0000-4000-8000-0000000000a4","role":"authenticated"}';

SELECT is(pg_temp.visible_rows($$SELECT unit_price, markup_percent FROM public.proposal_items WHERE proposal_id = '81300000-0000-4000-8000-000000000701'$$),
  0, 'F2 K: no line of a studio-A proposal through the unrelated studio B');
SELECT is(pg_temp.visible_rows($$SELECT unit_price, markup_percent FROM public.proposal_items WHERE proposal_id = '81300000-0000-4000-8000-000000000711'$$),
  0, 'F2 K: no line of the studio-less job''s proposal she is the client of');
SELECT is(pg_temp.visible_rows($$SELECT unit_price, markup_percent FROM public.proposal_items WHERE proposal_id = '81300000-0000-4000-8000-000000000721'$$),
  0, 'F2 K: no line of a job-less proposal she is the client of');

-- R2: K may duplicate O's draft (00399 _can_author_proposal: she is O's
-- co-member in B). The copy starts with no job and copies the trade line.
SELECT set_config('us37.k_clone', public.clone_proposal('81300000-0000-4000-8000-000000000701', 'duplicate')::text, true);
SELECT is(pg_temp.visible_rows(format($$SELECT unit_price, markup_percent FROM public.proposal_items WHERE proposal_id = %L$$, current_setting('us37.k_clone'))),
  0, 'R2 K: no line of her own duplicate of the studio-A proposal');
SELECT is(pg_temp.visible_rows($$SELECT unit_price, markup_percent FROM public.proposal_items WHERE proposal_id = '81300000-0000-4000-8000-000000000731'$$),
  0, 'R2 K: no line of a job-less proposal for studio A''s client C');
SELECT throws_ok(
  format($$UPDATE public.proposals SET studio_id = %L WHERE id = %L$$, '81300000-0000-4000-8000-0000000000f2', current_setting('us37.k_clone')),
  '42501', 'A proposal stays with the studio it was drafted in.',
  'R2 K: cannot re-stamp her duplicate to the studio she shares with O'
);

RESET ROLE;
SELECT ok(
  (SELECT project_id IS NULL AND studio_id = '81300000-0000-4000-8000-0000000000f1'
     FROM public.proposals WHERE id = current_setting('us37.k_clone')::uuid)
  AND (SELECT count(*) = 1 FROM public.proposal_items
        WHERE proposal_id = current_setting('us37.k_clone')::uuid
          AND unit_price = 70000 AND markup_percent IS NOT NULL),
  'R2 fixture: K''s duplicate has no job, carries the trade line, and keeps S''s studio A'
);
SET LOCAL ROLE authenticated;

SET LOCAL request.jwt.claims = '{"sub":"81300000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT is(pg_temp.visible_rows($$SELECT 1 FROM public.proposal_items WHERE proposal_id IN ('81300000-0000-4000-8000-000000000701', '81300000-0000-4000-8000-000000000711', '81300000-0000-4000-8000-000000000721') AND unit_price = 70000$$),
  3, 'F2 lead O: reads the lines of all three of his proposals');
SELECT is(pg_temp.visible_rows(format($$SELECT 1 FROM public.proposal_items WHERE proposal_id IN (%L, '81300000-0000-4000-8000-000000000731') AND unit_price = 70000$$, current_setting('us37.k_clone'))),
  2, 'R2 lead O: reads the lines of the duplicate and of 731');

SET LOCAL request.jwt.claims = '{"sub":"81300000-0000-4000-8000-0000000000a3","role":"authenticated"}';

SELECT is(pg_temp.visible_rows($$SELECT 1 FROM public.proposal_items WHERE proposal_id IN ('81300000-0000-4000-8000-000000000701', '81300000-0000-4000-8000-000000000711', '81300000-0000-4000-8000-000000000721') AND unit_price = 70000$$),
  2, 'F2 teammate T: reads the lines of the lead''s two job proposals; job-less 721 has no studio, so its lines stay with the lead');
SELECT is(pg_temp.visible_rows(format($$SELECT 1 FROM public.proposal_items WHERE proposal_id IN (%L, '81300000-0000-4000-8000-000000000731') AND unit_price = 70000$$, current_setting('us37.k_clone'))),
  2, 'R2 teammate T: reads the lines of the studio-A duplicate and of 731');

-- ─── F3: anon reads the catalog, never its trade price ─────────────────────

RESET ROLE;
SET LOCAL ROLE anon;
SET LOCAL request.jwt.claims = '{"role":"anon"}';

SELECT is(pg_temp.visible_rows($$SELECT price_trade FROM public.products WHERE id = '81300000-0000-4000-8000-000000000031'$$),
  -1, 'F3 anon: SELECT price_trade FROM products is refused');
SELECT is(pg_temp.visible_rows($$SELECT configuration_summary FROM public.products WHERE id = '81300000-0000-4000-8000-000000000031'$$),
  -1, 'R3 anon: SELECT configuration_summary FROM products is refused');
SELECT is(pg_temp.visible_rows($$SELECT pricing_tiers FROM public.products WHERE id = '81300000-0000-4000-8000-000000000031'$$),
  -1, 'R3 anon: SELECT pricing_tiers FROM products is refused');
SELECT is(pg_temp.visible_rows($$SELECT commission_rate FROM public.products WHERE id = '81300000-0000-4000-8000-000000000031'$$),
  -1, 'SQ-1218 anon: SELECT commission_rate FROM products is refused');
SELECT ok(NOT has_table_privilege('anon', 'public.products', 'SELECT'),
  'F3 anon: no table-level SELECT on products');
SELECT is(
  (SELECT COALESCE(array_agg(attribute.attname::text ORDER BY attribute.attname), '{}'::text[])
     FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid = 'public.products'::regclass
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
      AND NOT has_column_privilege('anon', 'public.products', attribute.attnum, 'SELECT')),
  ARRAY['commission_rate', 'configuration_summary', 'price_trade', 'pricing_tiers'],
  'F3 anon: price_trade, the two trade-carrying JSON columns and commission_rate are the only products columns anon cannot read'
);
-- client-portal piece/[id] PIECE_SELECT; its vendors embed joins on vendor_id
-- and retailer_id.
SELECT is(pg_temp.visible_rows($$SELECT id, name, brand, description, price_retail, images, dimensions, lead_time_weeks, vendor_id, retailer_id FROM public.products WHERE id = '81300000-0000-4000-8000-000000000031'$$),
  1, 'F3 anon: the piece page''s columns still read');
-- client-portal lib/aesthete/matches.ts and edge-api-worker catalog.ts.
SELECT is(pg_temp.visible_rows($$SELECT id, name, brand, category, price_retail, images, short_description, patina_managed, status, layer FROM public.products WHERE id IN ('81300000-0000-4000-8000-000000000031') AND layer = 'catalog' AND status = 'published'$$),
  1, 'F3 anon: the quiz matches and edge catalog columns still read');
-- iOS ProductAPIClient.productColumns.
SELECT is(pg_temp.visible_rows($$SELECT id, name, price_retail, quality_score, images, materials, style_tags, tags, category, status, dimensions, lead_time_weeks, brand, description, finish, patina_managed, source_url, published_at, photo_verified_at, shipping_flat_cents, deleted_at FROM public.products WHERE id = '81300000-0000-4000-8000-000000000031'$$),
  1, 'F3 anon: the iOS product columns still read');

-- A signed-in designer still reads trade (authenticated is unchanged).
RESET ROLE;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81300000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT is(pg_temp.visible_rows($$SELECT price_trade FROM public.products WHERE id = '81300000-0000-4000-8000-000000000031' AND price_trade = 70000$$),
  1, 'F3 authenticated: a signed-in designer still reads the catalog trade price');
SELECT is(pg_temp.visible_rows($$SELECT 1 FROM public.products WHERE id = '81300000-0000-4000-8000-000000000031' AND (configuration_summary->>'baseTradePriceCents')::integer = 70000 AND (pricing_tiers->0->>'tradePriceCents')::integer = 70000$$),
  1, 'R3 authenticated: a signed-in designer still reads the trade figures in configuration_summary and pricing_tiers');

RESET ROLE;

-- ─── R189: the one backfill reads recorded authority only ──────────────────
-- (SQ-1218, Astra SQ-1213 F2/F3.) These run last: dropping the column
-- re-stamps every proposal above by the backfill rule. Rows that predate
-- proposals.studio_id are replayed as a deployed database first met 00813:
-- the column is dropped and the migration file runs again, so its guarded
-- block adds the column and backfills it once. Three historical proposals,
-- each line carrying trade cost and markup:
--   761  a duplicate (clone_proposal leaves project_id and parent NULL) by L,
--        who drafted it in studio A and now sits only in B. A seat today
--        says nothing about whom it was drafted for: NULL.
--   771  a legacy furnishings authorization with project_id NULL, bound to S
--        (studio A) only through project_commercial_documents (00412); its
--        client relationship's household is in B. A.
--   781  a revision of 701 with no job (parent = chain root). Its parent's A.
-- TB is a designer in studio B, O's and L's co-member there.

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('81300000-0000-4000-8000-0000000000a6', 'us37-inherited-b-teammate@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('81300000-0000-4000-8000-0000000000a7', 'us37-inherited-moved-lead@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('81300000-0000-4000-8000-0000000000a6', 'us37-inherited-b-teammate@test.invalid', 'Inherited B Teammate', true, now(), now()),
  ('81300000-0000-4000-8000-0000000000a7', 'us37-inherited-moved-lead@test.invalid', 'Inherited Moved Lead', true, now(), now())
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email, full_name = EXCLUDED.full_name, is_designer = EXCLUDED.is_designer;
INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('81300000-0000-4000-8000-0000000000e7', '81300000-0000-4000-8000-0000000000a6', '81300000-0000-4000-8000-0000000000f2', 'member', 'active',  now()),
  ('81300000-0000-4000-8000-0000000000e8', '81300000-0000-4000-8000-0000000000a7', '81300000-0000-4000-8000-0000000000f1', 'member', 'removed', now()),
  ('81300000-0000-4000-8000-0000000000e9', '81300000-0000-4000-8000-0000000000a7', '81300000-0000-4000-8000-0000000000f2', 'member', 'active',  now());
-- provision_studio_on_designer gave L a studio of her own; she has left it
-- too (the service role, as an admin removal; the last-owner guard yields).
SET LOCAL ROLE service_role;
UPDATE public.organization_members
   SET status = 'removed'
 WHERE user_id = '81300000-0000-4000-8000-0000000000a7'
   AND organization_id NOT IN ('81300000-0000-4000-8000-0000000000f1', '81300000-0000-4000-8000-0000000000f2');
RESET ROLE;
SELECT is(
  (SELECT array_agg(seat.organization_id::text)
     FROM public.organization_members AS seat
     JOIN public.organizations AS studio ON studio.id = seat.organization_id
    WHERE seat.user_id = '81300000-0000-4000-8000-0000000000a7'
      AND seat.status = 'active' AND studio.type = 'design_studio'),
  ARRAY['81300000-0000-4000-8000-0000000000f2'],
  'R189 fixture: the moved lead L''s only active design-studio seat is B (a seat rule would pick B)'
);

INSERT INTO public.client_households (id, organization_id, designer_id, display_name)
VALUES ('81300000-0000-4000-8000-000000000752', '81300000-0000-4000-8000-0000000000f2', '81300000-0000-4000-8000-0000000000a1', 'Inherited Household K');
INSERT INTO public.designer_clients (id, designer_id, client_id, household_id, status)
VALUES ('81300000-0000-4000-8000-000000000742', '81300000-0000-4000-8000-0000000000a1', '81300000-0000-4000-8000-0000000000a4', '81300000-0000-4000-8000-000000000752', 'active');

INSERT INTO public.proposals (id, project_id, designer_id, client_id, title, total_amount, status, client_visibility_tier)
VALUES ('81300000-0000-4000-8000-000000000761', NULL, '81300000-0000-4000-8000-0000000000a7', '81300000-0000-4000-8000-0000000000a2',
        'Inherited historical duplicate', 120000, 'draft', 'full');
INSERT INTO public.proposals (id, project_id, designer_id, client_id, designer_client_id, title, total_amount, status, document_kind, client_visibility_tier)
VALUES ('81300000-0000-4000-8000-000000000771', NULL, '81300000-0000-4000-8000-0000000000a1', '81300000-0000-4000-8000-0000000000a4',
        '81300000-0000-4000-8000-000000000742', 'Inherited legacy authorization S', 120000, 'draft', 'furnishings_authorization', 'full');
INSERT INTO public.project_commercial_documents (id, project_id, proposal_id, document_kind, wave_name, is_origin, bound_at, created_by)
VALUES ('81300000-0000-4000-8000-000000000773', '81300000-0000-4000-8000-000000000001', '81300000-0000-4000-8000-000000000771',
        'furnishings_authorization', 'Legacy Authorization S', false, now(), '81300000-0000-4000-8000-0000000000a1');
INSERT INTO public.proposals (id, project_id, parent_proposal_id, designer_id, client_id, title, total_amount, status, client_visibility_tier)
VALUES ('81300000-0000-4000-8000-000000000781', NULL, '81300000-0000-4000-8000-000000000701', '81300000-0000-4000-8000-0000000000a1',
        '81300000-0000-4000-8000-0000000000a2', 'Inherited revision of S''s proposal', 120000, 'draft', 'full');
INSERT INTO public.proposal_items (
  id, proposal_id, product_id, name, quantity, unit_price, unit_sell_price, markup_percent,
  line_total_cents, vendor_name, position, item_type
) VALUES
  ('81300000-0000-4000-8000-000000000762', '81300000-0000-4000-8000-000000000761', '81300000-0000-4000-8000-000000000031',
   'Lounge chair', 1, 70000, 120000, 71.43, 120000, 'Inherited Mill', 0, 'fixed'),
  ('81300000-0000-4000-8000-000000000772', '81300000-0000-4000-8000-000000000771', '81300000-0000-4000-8000-000000000021',
   'Lounge chair', 1, 70000, 120000, 71.43, 120000, 'Inherited Mill', 0, 'fixed'),
  ('81300000-0000-4000-8000-000000000782', '81300000-0000-4000-8000-000000000781', '81300000-0000-4000-8000-000000000021',
   'Lounge chair', 1, 70000, 120000, 71.43, 120000, 'Inherited Mill', 0, 'fixed');

-- The deferred proposals_send_dispatch_exact_fk (00388) checks queued by the
-- inserts above would refuse ALTER TABLE; run them now.
SET CONSTRAINTS public.proposals_send_dispatch_exact_fk IMMEDIATE;
-- CASCADE drops the two 00813 objects that name the column (the line policy
-- and the stamp guard trigger); the replay recreates both.
ALTER TABLE public.proposals DROP COLUMN studio_id CASCADE;
\ir ../../migrations/00813_us37_inherited_pricing_paths.sql

SELECT is((SELECT COALESCE(studio_id::text, 'none') FROM public.proposals WHERE id = '81300000-0000-4000-8000-000000000761'),
  'none', 'R189 backfill (a): a historical duplicate whose lead now sits only in studio B is stamped NULL');
SELECT is((SELECT COALESCE(studio_id::text, 'none') FROM public.proposals WHERE id = '81300000-0000-4000-8000-000000000771'),
  '81300000-0000-4000-8000-0000000000f1', 'R189 backfill (b): a legacy authorization bound to S is stamped S''s studio A, not its household''s B');
SELECT is((SELECT COALESCE(studio_id::text, 'none') FROM public.proposals WHERE id = '81300000-0000-4000-8000-000000000781'),
  '81300000-0000-4000-8000-0000000000f1', 'R189 backfill (c): a job-less revision takes its parent''s stamp A');

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81300000-0000-4000-8000-0000000000a6","role":"authenticated"}';

SELECT is(pg_temp.visible_rows($$SELECT unit_price, markup_percent FROM public.proposal_items WHERE proposal_id = '81300000-0000-4000-8000-000000000761'$$),
  0, 'R189 backfill (a): studio B''s peer reads no line of the moved lead''s historical duplicate');
SELECT is(pg_temp.visible_rows($$SELECT unit_price, markup_percent FROM public.proposal_items WHERE proposal_id = '81300000-0000-4000-8000-000000000771'$$),
  0, 'R189 backfill (b): studio B''s peer reads no line of the authorization bound to S');
SELECT is(pg_temp.visible_rows($$SELECT unit_price, markup_percent FROM public.proposal_items WHERE proposal_id = '81300000-0000-4000-8000-000000000781'$$),
  0, 'R189 backfill (c): studio B''s peer reads no line of the revision');

SET LOCAL request.jwt.claims = '{"sub":"81300000-0000-4000-8000-0000000000a7","role":"authenticated"}';
SELECT is(pg_temp.visible_rows($$SELECT 1 FROM public.proposal_items WHERE proposal_id = '81300000-0000-4000-8000-000000000761' AND unit_price = 70000$$),
  1, 'R189 backfill (a): the duplicate''s designer L still reads its line');

SET LOCAL request.jwt.claims = '{"sub":"81300000-0000-4000-8000-0000000000a3","role":"authenticated"}';
SELECT is(pg_temp.visible_rows($$SELECT 1 FROM public.proposal_items WHERE proposal_id = '81300000-0000-4000-8000-000000000771' AND unit_price = 70000$$),
  1, 'R189 backfill (b): studio A''s teammate T reads the line of the authorization bound to S');
SELECT is(pg_temp.visible_rows($$SELECT 1 FROM public.proposal_items WHERE proposal_id = '81300000-0000-4000-8000-000000000781' AND unit_price = 70000$$),
  1, 'R189 backfill (c): studio A''s teammate T reads the revision''s line');

RESET ROLE;

-- (d) A replay after a membership change and a new job binding. O leaves
-- studio A (the service role, as an admin removal; the last-owner guard
-- yields to it), and 721 gains recorded authority in studio B: it is bound
-- to studio-B job Q. A second backfill would stamp 721 B.
CREATE TEMP TABLE us37_stamps_backfilled AS SELECT id, studio_id FROM public.proposals;

SET LOCAL ROLE service_role;
UPDATE public.organization_members SET status = 'removed' WHERE id = '81300000-0000-4000-8000-0000000000e1';
RESET ROLE;

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
VALUES ('81300000-0000-4000-8000-000000000003', 'Inherited Job Q',
        '81300000-0000-4000-8000-0000000000a1', '81300000-0000-4000-8000-0000000000a2',
        '81300000-0000-4000-8000-0000000000a1', '81300000-0000-4000-8000-0000000000f2', 'active');
INSERT INTO public.project_commercial_documents (id, project_id, proposal_id, document_kind, is_origin, bound_at, created_by)
VALUES ('81300000-0000-4000-8000-000000000723', '81300000-0000-4000-8000-000000000003', '81300000-0000-4000-8000-000000000721',
        'design_services', false, now(), '81300000-0000-4000-8000-0000000000a1');

SELECT ok(
  (SELECT status = 'removed' FROM public.organization_members WHERE id = '81300000-0000-4000-8000-0000000000e1')
  AND public._proposal_recorded_studio('81300000-0000-4000-8000-000000000721', NULL, NULL) = '81300000-0000-4000-8000-0000000000f2'
  AND (SELECT studio_id IS NULL FROM public.proposals WHERE id = '81300000-0000-4000-8000-000000000721'),
  'R189 replay fixture: O has left studio A, and unstamped 721 now records studio B through job Q'
);

\ir ../../migrations/00813_us37_inherited_pricing_paths.sql

SELECT is(
  (SELECT count(*)::integer
     FROM public.proposals AS proposal
     JOIN pg_temp.us37_stamps_backfilled AS backfilled USING (id)
    WHERE proposal.studio_id IS DISTINCT FROM backfilled.studio_id),
  0, 'R189 replay (d): after a membership change and a new job binding, a replay changes no stamp, NULL included'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81300000-0000-4000-8000-0000000000a6","role":"authenticated"}';
SELECT is(pg_temp.visible_rows($$SELECT unit_price, markup_percent FROM public.proposal_items WHERE proposal_id IN ('81300000-0000-4000-8000-000000000721', '81300000-0000-4000-8000-000000000761')$$),
  0, 'R189 replay (d): after the membership change, studio B''s peer still reads no line of 721 or the historical duplicate');
RESET ROLE;

-- (d) A replay after studio A is deleted: ON DELETE SET NULL clears its
-- jobs' and its proposals' studio, and the replay must not re-stamp them.
-- Deleted as postgres: set_project_studio_id (00563) refuses the service
-- role a job whose studio becomes NULL.
DELETE FROM public.organizations WHERE id = '81300000-0000-4000-8000-0000000000f1';

SELECT ok(
  NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = '81300000-0000-4000-8000-0000000000f1')
  AND NOT EXISTS (SELECT 1 FROM public.proposals WHERE studio_id = '81300000-0000-4000-8000-0000000000f1')
  AND (SELECT studio_id IS NULL FROM public.projects WHERE id = '81300000-0000-4000-8000-000000000001'),
  'R189 replay fixture: studio A is deleted, and its job S and its stamps fall to NULL'
);
CREATE TEMP TABLE us37_stamps_after_delete AS SELECT id, studio_id FROM public.proposals;

\ir ../../migrations/00813_us37_inherited_pricing_paths.sql

SELECT is(
  (SELECT count(*)::integer
     FROM public.proposals AS proposal
     JOIN pg_temp.us37_stamps_after_delete AS after_delete USING (id)
    WHERE proposal.studio_id IS DISTINCT FROM after_delete.studio_id),
  0, 'R189 replay (d): after studio A is deleted, a replay changes no stamp, NULL included'
);

SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"81300000-0000-4000-8000-0000000000a6","role":"authenticated"}';
SELECT is(pg_temp.visible_rows(format(
    $$SELECT unit_price, markup_percent FROM public.proposal_items WHERE proposal_id IN ('81300000-0000-4000-8000-000000000721', '81300000-0000-4000-8000-000000000731', '81300000-0000-4000-8000-000000000761', '81300000-0000-4000-8000-000000000771', '81300000-0000-4000-8000-000000000781', %L)$$,
    current_setting('us37.k_clone'))),
  0, 'R189 replay (d): once studio A is gone, studio B''s peer reads no line of any job-less proposal');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
