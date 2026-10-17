-- ═══════════════════════════════════════════════════════════════════════════
-- 00809 — Trade pricing core (pgTAP, US-37 #4, SQ-1101; subsumes SQ-1057)
--
-- The one writer set_ffe_line_pricing, the line kinds, retail, price_basis,
-- the pending cost flag and its two resolutions, the designer and project
-- markup settings, sales tax, reset per line and for the whole job.
--
-- Studio A: owner O (the lead), member T; client C on Project P. Studio B:
-- owner X (the outsider). Products are O's personal library pieces.
--
-- Cases, in order:
--   grants          the RPCs are authenticated-only; the helpers are internal
--   default (35%)   a direct insert with a cost; five library adds through
--                   place_product_in_project_v2 (client = round(cost x 1.35),
--                   retail kept); a product without a trade price keeps today's
--                   library price
--   quantity        qty 4 → line total = 4 × unit
--   markup          50% on a $1,000 rug → $1,500, a 33.33% margin
--   client price    a typed round price is kept exactly; the markup is
--                   back-calculated and reproduces it
--   designer        set_my_pricing_settings; a freight line takes the freight
--                   default the moment its cost is known; a new goods line
--                   takes the designer default
--   project         set_project_pricing overrides the goods default (never
--                   freight); a tax rate of 1.5 is refused
--   cost change     a cost edit under a priced line flags it and holds the
--                   markup; keep_markup moves the client price; keep_client
--                   keeps it and recomputes the markup; a legacy writer
--                   (set_project_ffe_line_commercials) flags too; nothing to
--                   settle is refused
--   provenance      a designer-typed price equal to the product's retail
--                   survives the library fill of its need
--   trust           outsider and client get 42501; a teammate may price;
--                   released, invoiced and labor lines are refused; a cost
--                   change on a released line through either legacy writer
--                   (an accepted vendor ack, set_project_ffe_line_commercials)
--                   flags it and never moves its client price; it settles
--                   with keep_client and refuses keep_markup
--   below cost      a typed price under cost and a negative markup are exact
--   reset           one line to the project target; the whole job
--   RLS             project pricing is team-only; designer settings own-row
--   audit           audit_logs carries the pricing and project edits
-- SQ-1124 (Astra SQ-1123 repair), in projects P2-P4 owned by O:
--   held markup     markup_percent is always the true markup; a flag holds the
--                   markup the line was priced at; a repeated legacy cost write
--                   changes nothing; keep_markup prices at the held markup (F9)
--   spec book       a flagged line prints its true markup, never the held (F1)
--   fill            a library fill under a typed price keeps it and flags the
--                   cost change, fresh or already pending (F2)
--   overflow        a default price past int4 is refused in words (F5)
--   replacement     supersede carries the price state to the same product; a
--                   free line stays free; a new product fills by the rules (F3)
--   locked lines    a replaced or configuration-locked line refuses pricing;
--                   the job reset skips and counts them; id lock order (F6,
--                   F10, F7); a configured placement locks job labels first
--   below cost      a -20% line releases with its true markup
-- SQ-1151 (Astra SQ-1150 repair):
--   replacement     naming the line's own product is the same product: a -100%
--                   line stays free, a flagged line keeps its flag (R2)
--   reset lock      Reset all waits on the job label lock before any line
--                   lock (dblink interleave against a replacement's order) (R1)
--   configured      a configured placement takes no intermediate default, so a
--                   35% default past int4 never refuses an approved price that
--                   fits; a line total past int4 is still refused (R4)
--
-- Run: (cd supabase && supabase test db tests/ffe/us37_trade_pricing_test.sql)
--  or: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/ffe/us37_trade_pricing_test.sql
-- Everything is rolled back.
-- ═══════════════════════════════════════════════════════════════════════════
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(94);

-- ── grants ─────────────────────────────────────────────────────────────────
SELECT ok(
  has_function_privilege('authenticated', 'public.set_ffe_line_pricing(uuid, text, numeric)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.resolve_ffe_cost_change(uuid, text)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.reset_project_markups(uuid)', 'EXECUTE')
  AND has_function_privilege('authenticated', 'public.set_project_pricing(uuid, numeric, numeric)', 'EXECUTE'),
  'authenticated can call the pricing RPCs'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.set_ffe_line_pricing(uuid, text, numeric)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.set_my_pricing_settings(numeric, numeric, numeric, numeric)', 'EXECUTE')
  AND NOT has_function_privilege('anon', 'public.set_project_pricing(uuid, numeric, numeric)', 'EXECUTE'),
  'anon cannot call the pricing RPCs'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.ffe_line_default_markup(public.project_ffe_items)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public._ffe_pricing_lock_reason(public.project_ffe_items)', 'EXECUTE'),
  'the pricing helpers are internal'
);

-- ── fixtures (as postgres) ─────────────────────────────────────────────────
INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('80900000-0000-4000-8000-0000000000a1', 'p809-owner@test.invalid',    '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('80900000-0000-4000-8000-0000000000a2', 'p809-client@test.invalid',   '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('80900000-0000-4000-8000-0000000000a3', 'p809-member@test.invalid',   '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('80900000-0000-4000-8000-0000000000a5', 'p809-outsider@test.invalid', '', now(), now(), now(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
VALUES
  ('80900000-0000-4000-8000-0000000000a1', 'p809-owner@test.invalid',    'P809 Owner',    now(), now()),
  ('80900000-0000-4000-8000-0000000000a2', 'p809-client@test.invalid',   'P809 Client',   now(), now()),
  ('80900000-0000-4000-8000-0000000000a3', 'p809-member@test.invalid',   'P809 Member',   now(), now()),
  ('80900000-0000-4000-8000-0000000000a5', 'p809-outsider@test.invalid', 'P809 Outsider', now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug)
VALUES
  ('80900000-0000-4000-8000-0000000000f1', 'design_studio', 'P809 Studio A', 'p809-studio-a-test'),
  ('80900000-0000-4000-8000-0000000000f2', 'design_studio', 'P809 Studio B', 'p809-studio-b-test');

INSERT INTO public.organization_members (id, user_id, organization_id, role, status, joined_at)
VALUES
  ('80900000-0000-4000-8000-0000000000e1', '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-0000000000f1', 'owner',  'active', now()),
  ('80900000-0000-4000-8000-0000000000e3', '80900000-0000-4000-8000-0000000000a3', '80900000-0000-4000-8000-0000000000f1', 'member', 'active', now()),
  ('80900000-0000-4000-8000-0000000000e5', '80900000-0000-4000-8000-0000000000a5', '80900000-0000-4000-8000-0000000000f2', 'owner',  'active', now());

INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
VALUES ('80900000-0000-4000-8000-000000000001', 'P809 Lake House',
        '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-0000000000a2',
        '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-0000000000f1', 'active');

INSERT INTO public.vendors (id, name)
VALUES ('80900000-0000-4000-8000-000000000011', 'P809 Mill');

-- Cost (price_trade) / retail (price_retail), integer cents.
INSERT INTO public.products (id, name, captured_at, layer, owner_user_id, vendor_id, price_trade, price_retail)
VALUES
  ('80900000-0000-4000-8000-000000000021', 'P809 Chair A',      now(), 'personal', '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-000000000011',  10000,  18000),
  ('80900000-0000-4000-8000-000000000022', 'P809 Chair B',      now(), 'personal', '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-000000000011',  20000,  36000),
  ('80900000-0000-4000-8000-000000000023', 'P809 Table',        now(), 'personal', '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-000000000011',  30000,  54000),
  ('80900000-0000-4000-8000-000000000024', 'P809 Lamp',         now(), 'personal', '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-000000000011',  40000,  72000),
  ('80900000-0000-4000-8000-000000000025', 'P809 Sofa',         now(), 'personal', '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-000000000011',  50000,  90000),
  ('80900000-0000-4000-8000-000000000026', 'P809 Rug',          now(), 'personal', '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-000000000011', 100000, 180000),
  ('80900000-0000-4000-8000-000000000027', 'P809 Vase',         now(), 'personal', '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-000000000011',   NULL,  25000),
  ('80900000-0000-4000-8000-000000000028', 'P809 Accent chair', now(), 'personal', '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-000000000011',   9000,  16000),
  ('80900000-0000-4000-8000-000000000029', 'P809 Mirror',       now(), 'personal', '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-000000000011',  10000,  19000),
  ('80900000-0000-4000-8000-000000000030', 'P809 Bench',        now(), 'personal', '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-000000000011',  10000,  17000);

INSERT INTO public.purchase_orders (id, designer_id, project_id, vendor_id, payment_pattern, total_cents, status, created_by, sent_at)
VALUES ('80900000-0000-4000-8000-000000000051', '80900000-0000-4000-8000-0000000000a1',
        '80900000-0000-4000-8000-000000000001', '80900000-0000-4000-8000-000000000011',
        'net_30', 60000, 'confirmed', '80900000-0000-4000-8000-0000000000a1', now());

-- Lines:
--   101 PO console     priced, on a PO (released)
--   102 Billed mirror  priced, on an invoice
--   104 Wallcovering   a cost and no client price (an import): takes 35%
--   103 Install        labor under the wallcovering
--   105 Freight in     a need, no cost yet: becomes freight
--   106 Accent need    a need the designer prices by hand, then fills
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, quantity, trade_price_cents,
  unit_price_cents, line_total_cents, design_disposition, purchase_order_id, vendor_id
) VALUES
  ('80900000-0000-4000-8000-000000000101', '80900000-0000-4000-8000-000000000001', 'PO console',
   'specified', 'fixed', 1, 60000, 90000, 90000, 'selected', '80900000-0000-4000-8000-000000000051',
   '80900000-0000-4000-8000-000000000011'),
  ('80900000-0000-4000-8000-000000000102', '80900000-0000-4000-8000-000000000001', 'Billed mirror',
   'specified', 'fixed', 1, 30000, 50000, 50000, 'selected', NULL, NULL),
  ('80900000-0000-4000-8000-000000000104', '80900000-0000-4000-8000-000000000001', 'Wallcovering',
   'specified', 'fixed', 1, 20000, 0, 0, 'selected', NULL, NULL),
  ('80900000-0000-4000-8000-000000000105', '80900000-0000-4000-8000-000000000001', 'Freight in',
   'specified', 'fixed', 1, NULL, 0, 0, 'candidate', NULL, NULL),
  ('80900000-0000-4000-8000-000000000106', '80900000-0000-4000-8000-000000000001', 'Accent need',
   'specified', 'fixed', 1, NULL, 0, 0, 'candidate', NULL, NULL);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, quantity, unit, unit_price_cents, line_total_cents,
  line_kind, link_kind, parent_ffe_item_id
) VALUES
  ('80900000-0000-4000-8000-000000000103', '80900000-0000-4000-8000-000000000001', 'Install',
   'specified', 'fixed', 1, 'each', 8500, 8500, 'labor', 'labor', '80900000-0000-4000-8000-000000000104');

INSERT INTO public.invoices (id, designer_id, project_id)
VALUES ('80900000-0000-4000-8000-000000000061', '80900000-0000-4000-8000-0000000000a1',
        '80900000-0000-4000-8000-000000000001');
INSERT INTO public.invoice_line_items (id, invoice_id, description, kind, ffe_item_id)
VALUES ('80900000-0000-4000-8000-000000000062', '80900000-0000-4000-8000-000000000061',
        'Billed mirror', 'ffe', '80900000-0000-4000-8000-000000000102');
SELECT set_config('app.ffe_mutation_rpc', '', true);

SELECT is(
  (SELECT concat_ws('|', unit_price_cents, line_total_cents, markup_percent, price_basis)
   FROM public.project_ffe_items WHERE id = '80900000-0000-4000-8000-000000000104'),
  '27000|27000|35|markup',
  'a line added with a cost and no client price takes 35%'
);

-- ── the 35% default on library adds (O) ────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"80900000-0000-4000-8000-0000000000a1","role":"authenticated"}';

SELECT is(
  (SELECT concat_ws('|', s->>'defaultMarkupPercent', s->>'freightMarkupPercent', s->>'isDefault')
   FROM (SELECT public.get_my_pricing_settings() AS s) AS settings),
  '35|35|true',
  'a designer who never set defaults reads 35% everywhere'
);

SELECT is(
  (SELECT count(*)::int FROM (
     SELECT public.place_product_in_project_v2(jsonb_build_object(
       'projectId', '80900000-0000-4000-8000-000000000001',
       'productId', product_id,
       'idempotencyKey', 'p809-add-' || product_id)) AS placed
     FROM unnest(ARRAY[
       '80900000-0000-4000-8000-000000000021', '80900000-0000-4000-8000-000000000022',
       '80900000-0000-4000-8000-000000000023', '80900000-0000-4000-8000-000000000024',
       '80900000-0000-4000-8000-000000000025']::uuid[]) AS product_id
   ) AS adds WHERE adds.placed->>'outcome' = 'created'),
  5,
  'five library adds are created'
);

SELECT is(
  (SELECT count(*)::int
   FROM public.project_ffe_items AS item
   JOIN public.products AS product ON product.id = item.product_id
   WHERE item.project_id = '80900000-0000-4000-8000-000000000001'
     AND item.product_id IN ('80900000-0000-4000-8000-000000000021', '80900000-0000-4000-8000-000000000022',
                             '80900000-0000-4000-8000-000000000023', '80900000-0000-4000-8000-000000000024',
                             '80900000-0000-4000-8000-000000000025')
     AND item.markup_percent = 35
     AND item.price_basis = 'markup'
     AND item.trade_price_cents = product.price_trade
     AND item.unit_price_cents = round(product.price_trade * 1.35)
     AND item.line_total_cents = item.quantity * item.unit_price_cents
     AND item.retail_unit_cents = product.price_retail),
  5,
  'five lines default to 35%: client = round(cost x 1.35), line total = qty x unit, retail kept from the library'
);

-- A placement and its read are separate statements: a statement's snapshot
-- does not see the rows its own function call writes.
SELECT is(
  public.place_product_in_project_v2(jsonb_build_object(
    'projectId', '80900000-0000-4000-8000-000000000001',
    'productId', '80900000-0000-4000-8000-000000000027',
    'idempotencyKey', 'p809-add-vase'))->>'outcome',
  'created',
  'the vase (no trade price) is placed'
);
SELECT is(
  (SELECT concat_ws('|', unit_price_cents, retail_unit_cents, coalesce(price_basis, 'none'))
   FROM public.project_ffe_items WHERE project_id = '80900000-0000-4000-8000-000000000001'
     AND product_id = '80900000-0000-4000-8000-000000000027'),
  '25000|25000|none',
  'a product with no trade price keeps today''s library price (no real cost to mark up)'
);

-- ── quantity ───────────────────────────────────────────────────────────────
SELECT is(
  (public.set_ffe_line_pricing(
     (SELECT id FROM public.project_ffe_items WHERE project_id = '80900000-0000-4000-8000-000000000001'
        AND product_id = '80900000-0000-4000-8000-000000000022'),
     'quantity', 4)->>'lineTotalCents')::int,
  4 * 27000,
  'qty 4 → line total = 4 × unit'
);

-- ── markup 50% on a rug ────────────────────────────────────────────────────
SELECT is(
  (SELECT add.placed->>'outcome'
   FROM (SELECT public.place_product_in_project_v2(jsonb_build_object(
           'projectId', '80900000-0000-4000-8000-000000000001',
           'productId', '80900000-0000-4000-8000-000000000026',
           'idempotencyKey', 'p809-add-rug')) AS placed) AS add),
  'created',
  'the $1,000-cost rug is placed'
);
SELECT is(
  (SELECT concat_ws('|', r->>'unitClientPriceCents', r->>'markupPercent', r->>'lineTotalCents', r->>'priceBasis')
   FROM (SELECT public.set_ffe_line_pricing(
           (SELECT id FROM public.project_ffe_items WHERE project_id = '80900000-0000-4000-8000-000000000001'
              AND product_id = '80900000-0000-4000-8000-000000000026'),
           'markup_percent', 50) AS r) AS edit),
  '150000|50|150000|markup',
  'markup 50% on the rug: client $1,500'
);
SELECT is(
  (SELECT round((unit_price_cents - trade_price_cents)::numeric / unit_price_cents * 100, 2)
   FROM public.project_ffe_items WHERE project_id = '80900000-0000-4000-8000-000000000001'
     AND product_id = '80900000-0000-4000-8000-000000000026'),
  33.33,
  'and its margin is 33.33%'
);

-- ── a typed round client price ─────────────────────────────────────────────
SELECT is(
  (SELECT concat_ws('|', r->>'unitClientPriceCents', r->>'lineTotalCents', r->>'priceBasis',
                    round((r->>'markupPercent')::numeric, 4))
   FROM (SELECT public.set_ffe_line_pricing(
           (SELECT id FROM public.project_ffe_items WHERE project_id = '80900000-0000-4000-8000-000000000001'
              AND product_id = '80900000-0000-4000-8000-000000000023'),
           'unit_client_price_cents', 50000) AS r) AS edit),
  '50000|50000|client|66.6667',
  'a typed $500 on a $300 cost is kept exactly; the markup is back-calculated'
);
SELECT is(
  (SELECT round(trade_price_cents * (100 + markup_percent) / 100)
   FROM public.project_ffe_items WHERE project_id = '80900000-0000-4000-8000-000000000001'
     AND product_id = '80900000-0000-4000-8000-000000000023'),
  50000::numeric,
  'the stored markup reproduces the typed price'
);

-- ── designer defaults; a freight line takes its own ───────────────────────
SELECT is(
  (SELECT concat_ws('|', s->>'defaultMarkupPercent', s->>'freightMarkupPercent',
                    s->>'deliveryMarkupPercent', s->>'installMarkupPercent', s->>'isDefault')
   FROM (SELECT public.set_my_pricing_settings(40, 20) AS s) AS settings),
  '40|20|35|35|false',
  'set_my_pricing_settings sets goods 40% and freight 20%, leaving the rest at 35%'
);
SELECT is(
  (public.set_ffe_line_kind('80900000-0000-4000-8000-000000000105', 'freight')->>'lineKind'),
  'freight',
  'the need becomes a freight line'
);
SELECT is(
  (SELECT concat_ws('|', r->>'unitCostCents', r->>'unitClientPriceCents', r->>'markupPercent', r->>'priceBasis')
   FROM (SELECT public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000105', 'unit_cost_cents', 15000) AS r) AS edit),
  '15000|18000|20|markup',
  'a freight line takes the freight default (20%) the moment its cost is known'
);
SELECT is(
  public.place_product_in_project_v2(jsonb_build_object(
    'projectId', '80900000-0000-4000-8000-000000000001',
    'productId', '80900000-0000-4000-8000-000000000029',
    'idempotencyKey', 'p809-add-mirror'))->>'outcome',
  'created',
  'the mirror is placed'
);
SELECT is(
  (SELECT concat_ws('|', unit_price_cents, markup_percent)
   FROM public.project_ffe_items WHERE project_id = '80900000-0000-4000-8000-000000000001'
     AND product_id = '80900000-0000-4000-8000-000000000029'),
  '14000|40',
  'a new goods line takes the designer default (40%)'
);

-- ── the project overrides the designer (goods only) ────────────────────────
SELECT is(
  (SELECT concat_ws('|', s->>'markupTargetPercent', s->>'salesTaxRate')
   FROM (SELECT public.set_project_pricing('80900000-0000-4000-8000-000000000001', 50, 0.0825) AS s) AS settings),
  '50|0.0825',
  'set_project_pricing sets a 50% target and 8.25% sales tax'
);
SELECT is(
  public.place_product_in_project_v2(jsonb_build_object(
    'projectId', '80900000-0000-4000-8000-000000000001',
    'productId', '80900000-0000-4000-8000-000000000030',
    'idempotencyKey', 'p809-add-bench'))->>'outcome',
  'created',
  'the bench is placed'
);
SELECT is(
  (SELECT concat_ws('|', unit_price_cents, markup_percent)
   FROM public.project_ffe_items WHERE project_id = '80900000-0000-4000-8000-000000000001'
     AND product_id = '80900000-0000-4000-8000-000000000030'),
  '15000|50',
  'the designer''s 40% is overridden by the project''s 50%'
);
SELECT is(
  (SELECT concat_ws('|', r->>'unitClientPriceCents', r->>'markupPercent')
   FROM (SELECT public.reset_ffe_line_markup('80900000-0000-4000-8000-000000000105') AS r) AS edit),
  '18000|20',
  'the project target never applies to freight: a reset keeps 20%'
);
SELECT throws_ok(
  $$SELECT public.set_project_pricing('80900000-0000-4000-8000-000000000001', 50, 1.5)$$,
  '23514', 'A sales tax rate is a fraction between 0 and 1, like 0.0825.',
  'a sales tax rate of 1.5 is refused'
);

-- ── a cost change ──────────────────────────────────────────────────────────
SELECT is(
  (SELECT concat_ws('|', r->>'unitCostCents', r->>'unitClientPriceCents', r->>'markupPercent', r->>'priceBasis',
                    r->>'pendingCostPrevCents', (r->>'pendingCostChangedAt' IS NOT NULL),
                    r->>'pendingMarkupHeldPercent')
   FROM (SELECT public.set_ffe_line_pricing(
           (SELECT id FROM public.project_ffe_items WHERE project_id = '80900000-0000-4000-8000-000000000001'
              AND product_id = '80900000-0000-4000-8000-000000000026'),
           'unit_cost_cents', 120000) AS r) AS edit),
  '120000|150000|25|markup|100000|t|50',
  'a cost change on the rug flags it: the client price holds, its markup reads true (25%), the old cost and the 50% it was priced at are held'
);
SELECT is(
  (SELECT concat_ws('|', r->>'unitClientPriceCents', r->>'markupPercent', r->>'priceBasis',
                    coalesce(r->>'pendingCostPrevCents', 'clear'), coalesce(r->>'pendingCostChangedAt', 'clear'),
                    coalesce(r->>'pendingMarkupHeldPercent', 'clear'))
   FROM (SELECT public.resolve_ffe_cost_change(
           (SELECT id FROM public.project_ffe_items WHERE project_id = '80900000-0000-4000-8000-000000000001'
              AND product_id = '80900000-0000-4000-8000-000000000026'),
           'keep_markup') AS r) AS edit),
  '180000|50|markup|clear|clear|clear',
  'keep_markup moves the client price to round(new cost x 1.5) from the held 50% and clears the flag'
);
SELECT is(
  (SELECT r->>'pendingCostPrevCents'
   FROM (SELECT public.set_ffe_line_pricing(
           (SELECT id FROM public.project_ffe_items WHERE project_id = '80900000-0000-4000-8000-000000000001'
              AND product_id = '80900000-0000-4000-8000-000000000025'),
           'unit_cost_cents', 60000) AS r) AS edit),
  '50000',
  'a cost change on the sofa flags it'
);
SELECT is(
  (SELECT concat_ws('|', r->>'unitClientPriceCents', (r->>'markupPercent')::numeric, r->>'priceBasis',
                    coalesce(r->>'pendingCostChangedAt', 'clear'))
   FROM (SELECT public.resolve_ffe_cost_change(
           (SELECT id FROM public.project_ffe_items WHERE project_id = '80900000-0000-4000-8000-000000000001'
              AND product_id = '80900000-0000-4000-8000-000000000025'),
           'keep_client') AS r) AS edit),
  '67500|12.5|client|clear',
  'keep_client keeps $675; its markup is the true one on the new cost (12.5%)'
);
SELECT lives_ok(
  $$SELECT public.set_project_ffe_line_commercials(
      (SELECT id FROM public.project_ffe_items WHERE project_id = '80900000-0000-4000-8000-000000000001'
         AND product_id = '80900000-0000-4000-8000-000000000024'),
      '{"tradePriceCents": 45000}'::jsonb)$$,
  'the legacy writer sets the lamp''s cost'
);
SELECT is(
  (SELECT concat_ws('|', trade_price_cents, markup_percent, pending_cost_prev_cents,
                    pending_cost_changed_at IS NOT NULL, unit_price_cents, pending_markup_held_percent)
   FROM public.project_ffe_items WHERE project_id = '80900000-0000-4000-8000-000000000001'
     AND product_id = '80900000-0000-4000-8000-000000000024'),
  '45000|20|40000|t|54000|35',
  'a cost from the legacy writer flags the lamp too: the client price holds, the markup reads true (20%), 35% is held'
);
SELECT throws_ok(
  $$SELECT public.resolve_ffe_cost_change('80900000-0000-4000-8000-000000000104', 'keep_client')$$,
  '23514', 'This line has no cost change to settle.',
  'a line with no cost change has nothing to settle'
);

-- ── provenance: a designer-typed price survives the library fill ───────────
SELECT is(
  (SELECT concat_ws('|', r->>'unitClientPriceCents', r->>'priceBasis', coalesce(r->>'markupPercent', 'none'))
   FROM (SELECT public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000106', 'unit_client_price_cents', 16000) AS r) AS edit),
  '16000|client|none',
  'the designer prices the need by hand at $160 (no cost yet, so no markup)'
);
SELECT is(
  (SELECT concat_ws('|', r->>'unitClientPriceCents', r->>'unitCostCents', r->>'priceBasis',
                    round((r->>'markupPercent')::numeric, 2), coalesce(r->>'pendingCostPrevCents', 'none'))
   FROM (SELECT public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000106', 'unit_cost_cents', 10000) AS r) AS edit),
  '16000|10000|client|60.00|none',
  'a first cost under the typed $160 keeps the price, makes the markup known (60%) and flags nothing'
);
SELECT is(
  public.place_product_in_project_v2(jsonb_build_object(
    'projectId', '80900000-0000-4000-8000-000000000001',
    'productId', '80900000-0000-4000-8000-000000000028',
    'placeholderSelectionId', '80900000-0000-4000-8000-000000000106',
    'idempotencyKey', 'p809-fill-accent'))->>'outcome',
  'filled',
  'the need is filled from the library with the accent chair'
);
SELECT is(
  (SELECT concat_ws('|', unit_price_cents, trade_price_cents, price_basis,
                    round(markup_percent, 2), retail_unit_cents)
   FROM public.project_ffe_items WHERE id = '80900000-0000-4000-8000-000000000106'),
  '16000|9000|client|77.78|16000',
  'the fill keeps the typed $160, though it equals the product''s retail; the markup follows the cost'
);
SELECT is(
  (SELECT concat_ws('|', pending_cost_prev_cents, pending_markup_held_percent, pending_cost_changed_at IS NOT NULL)
   FROM public.project_ffe_items WHERE id = '80900000-0000-4000-8000-000000000106'),
  '10000|60|t',
  'F2: the fill moved the cost under the kept price, so it flags: $100 and the 60% it was priced at are held'
);

-- ── trust and refusals ─────────────────────────────────────────────────────
SET LOCAL request.jwt.claims = '{"sub":"80900000-0000-4000-8000-0000000000a5","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000104', 'markup_percent', 10)$$,
  '42501', NULL,
  'an outsider cannot price a line (42501)'
);
SELECT throws_ok(
  $$SELECT public.reset_project_markups('80900000-0000-4000-8000-000000000001')$$,
  '42501', NULL,
  'an outsider cannot reset the job (42501)'
);
SELECT throws_ok(
  $$SELECT public.set_project_pricing('80900000-0000-4000-8000-000000000001', 10, 0)$$,
  '42501', NULL,
  'an outsider cannot set the job''s pricing (42501)'
);
SET LOCAL request.jwt.claims = '{"sub":"80900000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000104', 'markup_percent', 10)$$,
  '42501', NULL,
  'the client cannot price a line (42501)'
);
SET LOCAL request.jwt.claims = '{"sub":"80900000-0000-4000-8000-0000000000a3","role":"authenticated"}';
SELECT is(
  (SELECT concat_ws('|', r->>'unitClientPriceCents', r->>'markupPercent')
   FROM (SELECT public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000104', 'markup_percent', 45) AS r) AS edit),
  '29000|45',
  'a studio teammate may price a line'
);
SET LOCAL request.jwt.claims = '{"sub":"80900000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000101', 'unit_client_price_cents', 95000)$$,
  '23514', 'Released lines change through Record a change.',
  'a released line (on a PO) is refused'
);
SELECT throws_ok(
  $$SELECT public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000102', 'markup_percent', 10)$$,
  '23514', 'This line is invoiced, so its price stays as billed.',
  'an invoiced line is refused'
);
SELECT throws_ok(
  $$SELECT public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000103', 'unit_client_price_cents', 9000)$$,
  '23514', 'Labor lines are priced with the labor price.',
  'a labor line keeps set_labor_line_price'
);
SELECT throws_ok(
  $$SELECT public.set_ffe_line_kind('80900000-0000-4000-8000-000000000101', 'delivery')$$,
  '23514', 'Released lines change through Record a change.',
  'a released line keeps its kind'
);

-- A released line's cost still moves through the legacy writers, and its
-- client price never does. (1) The vendor acknowledgement path: the PO'd
-- console's ack carries a new price and the owner accepts it.
SET LOCAL request.jwt.claims = '{"sub":"80900000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.log_po_acknowledgment_v2('80900000-0000-4000-8000-000000000051',
      jsonb_build_object('receivedOn', CURRENT_DATE::text, 'vendorOrderRef', 'V-809'),
      jsonb_build_array(jsonb_build_object('ffeItemId', '80900000-0000-4000-8000-000000000101',
                                           'field', 'unit_price', 'ackValue', 65000)))$$,
  'the vendor acknowledges the console at $650'
);
SELECT lives_ok(
  $$SELECT public.resolve_ack_line(
      (SELECT line.id FROM public.po_ack_lines AS line
         JOIN public.po_acknowledgments AS ack ON ack.id = line.ack_id
        WHERE ack.purchase_order_id = '80900000-0000-4000-8000-000000000051' AND line.field = 'unit_price'),
      'accepted', 'Vendor price increase')$$,
  'the owner accepts the acknowledged price'
);
SELECT is(
  (SELECT concat_ws('|', trade_price_cents, unit_price_cents, line_total_cents, pending_cost_prev_cents,
                    pending_cost_changed_at IS NOT NULL, round(markup_percent, 2), pending_markup_held_percent)
   FROM public.project_ffe_items WHERE id = '80900000-0000-4000-8000-000000000101'),
  '65000|90000|90000|60000|t|38.46|50',
  'an accepted ack moves a released line''s cost and flags it; the client price holds at $900, the markup reads true, 50% is held'
);
-- (2) set_project_ffe_line_commercials on the invoiced mirror (not on a PO).
SELECT lives_ok(
  $$SELECT public.set_project_ffe_line_commercials('80900000-0000-4000-8000-000000000102',
      '{"tradePriceCents": 35000}'::jsonb)$$,
  'the legacy commercials writer moves the invoiced mirror''s cost'
);
SELECT is(
  (SELECT concat_ws('|', trade_price_cents, unit_price_cents, line_total_cents, pending_cost_prev_cents,
                    pending_cost_changed_at IS NOT NULL, round(markup_percent, 2), round(pending_markup_held_percent, 2))
   FROM public.project_ffe_items WHERE id = '80900000-0000-4000-8000-000000000102'),
  '35000|50000|50000|30000|t|42.86|66.67',
  'a legacy cost change flags the invoiced line; the billed client price holds at $500, the markup reads true, 66.67% is held'
);
SELECT throws_ok(
  $$SELECT public.resolve_ffe_cost_change('80900000-0000-4000-8000-000000000101', 'keep_markup')$$,
  '23514', 'Released lines change through Record a change.',
  'keep_markup is refused on a released line'
);
SELECT is(
  (SELECT concat_ws('|', r->>'unitClientPriceCents', round((r->>'markupPercent')::numeric, 2), r->>'priceBasis',
                    coalesce(r->>'pendingCostChangedAt', 'clear'))
   FROM (SELECT public.resolve_ffe_cost_change('80900000-0000-4000-8000-000000000101', 'keep_client') AS r) AS edit),
  '90000|38.46|client|clear',
  'keep_client settles a released line: the client price stands, only the markup moves'
);

-- ── below cost is legible ──────────────────────────────────────────────────
SELECT is(
  (SELECT concat_ws('|', r->>'unitClientPriceCents', (r->>'markupPercent')::numeric = -10)
   FROM (SELECT public.set_ffe_line_pricing(
           (SELECT id FROM public.project_ffe_items WHERE project_id = '80900000-0000-4000-8000-000000000001'
              AND product_id = '80900000-0000-4000-8000-000000000030'),
           'unit_client_price_cents', 9000) AS r) AS edit),
  '9000|t',
  'a typed $90 on a $100 cost is kept, its markup exactly -10%'
);
SELECT is(
  (SELECT concat_ws('|', r->>'unitClientPriceCents', r->>'markupPercent')
   FROM (SELECT public.set_ffe_line_pricing(
           (SELECT id FROM public.project_ffe_items WHERE project_id = '80900000-0000-4000-8000-000000000001'
              AND product_id = '80900000-0000-4000-8000-000000000030'),
           'markup_percent', -12.5) AS r) AS edit),
  '8750|-12.5',
  'a -12.5% markup is stored exactly and prices the bench at $87.50'
);
SELECT throws_ok(
  $$SELECT public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000104', 'markup_percent', -101)$$,
  '23514', 'A markup is a number, -100% or more.',
  'a markup under -100% is refused'
);

-- ── reset ──────────────────────────────────────────────────────────────────
SELECT is(
  (SELECT concat_ws('|', r->>'unitClientPriceCents', r->>'markupPercent', r->>'priceBasis')
   FROM (SELECT public.reset_ffe_line_markup(
           (SELECT id FROM public.project_ffe_items WHERE project_id = '80900000-0000-4000-8000-000000000001'
              AND product_id = '80900000-0000-4000-8000-000000000023')) AS r) AS edit),
  '45000|50|markup',
  'reset puts the typed table back on the project target (50%)'
);
SELECT is(
  (SELECT concat_ws('|', r->>'resetCount', r->>'skippedCount')
   FROM (SELECT public.reset_project_markups('80900000-0000-4000-8000-000000000001') AS r) AS edit),
  '12|2',
  'reset all: twelve lines reset; the released and the invoiced line are skipped (labor is never touched)'
);
RESET ROLE;
SELECT is(
  (SELECT concat_ws('|',
     (SELECT count(*) FROM public.project_ffe_items
      WHERE project_id = '80900000-0000-4000-8000-000000000001' AND line_kind = 'goods'
        AND removed_at IS NULL AND public._ffe_pricing_lock_reason(project_ffe_items) IS NULL
        AND NOT (markup_percent = 50 AND price_basis = 'markup'
                 AND unit_price_cents = round(trade_price_cents * 1.5)
                 AND line_total_cents = quantity * unit_price_cents)),
     (SELECT markup_percent FROM public.project_ffe_items WHERE id = '80900000-0000-4000-8000-000000000105'),
     (SELECT unit_price_cents FROM public.project_ffe_items WHERE id = '80900000-0000-4000-8000-000000000101'),
     (SELECT unit_price_cents FROM public.project_ffe_items WHERE id = '80900000-0000-4000-8000-000000000102'),
     (SELECT unit_price_cents FROM public.project_ffe_items WHERE id = '80900000-0000-4000-8000-000000000103'))),
  '0|20|90000|50000|8500',
  'after reset all every open goods line is at 50%, freight at 20%; released, invoiced and labor untouched'
);

-- ── RLS ────────────────────────────────────────────────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"80900000-0000-4000-8000-0000000000a2","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.project_pricing_settings),
  0,
  'the client cannot read the job''s markup target or sales tax'
);
SELECT is(
  (SELECT count(*)::int FROM public.project_ffe_items
   WHERE project_id = '80900000-0000-4000-8000-000000000001'),
  0,
  'the client cannot read the raw lines (cost, markup, retail, price basis)'
);
SET LOCAL request.jwt.claims = '{"sub":"80900000-0000-4000-8000-0000000000a3","role":"authenticated"}';
SELECT is(
  (SELECT concat_ws('|', markup_target_percent, sales_tax_rate) FROM public.project_pricing_settings
   WHERE project_id = '80900000-0000-4000-8000-000000000001'),
  '50|0.0825',
  'a studio teammate reads the job''s target and tax rate'
);
SELECT is(
  (SELECT count(*)::int FROM public.designer_pricing_settings),
  0,
  'a teammate cannot read the lead''s designer defaults'
);
SET LOCAL request.jwt.claims = '{"sub":"80900000-0000-4000-8000-0000000000a5","role":"authenticated"}';
SELECT is(
  (SELECT count(*)::int FROM public.project_pricing_settings),
  0,
  'an outsider cannot read the job''s pricing'
);
SET LOCAL request.jwt.claims = '{"sub":"80900000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT is(
  (SELECT concat_ws('|', default_markup_percent, freight_markup_percent) FROM public.designer_pricing_settings),
  '40|20',
  'the designer reads her own defaults'
);
SELECT throws_ok(
  $$INSERT INTO public.designer_pricing_settings (user_id) VALUES ('80900000-0000-4000-8000-0000000000a3')$$,
  '42501', NULL,
  'settings are written only through the RPCs'
);

-- ── audit ──────────────────────────────────────────────────────────────────
RESET ROLE;
SELECT is(
  (SELECT count(*)::int FROM public.audit_logs AS log
   JOIN public.project_ffe_items AS item ON item.id = log.resource_id
   WHERE item.project_id = '80900000-0000-4000-8000-000000000001'
     AND item.product_id = '80900000-0000-4000-8000-000000000026'
     AND log.resource_type = 'project_ffe_items'
     AND log.action = 'ffe_line_pricing_set:markup_percent'
     AND log.user_id = '80900000-0000-4000-8000-0000000000a1'
     AND log.organization_id = '80900000-0000-4000-8000-0000000000f1'
     AND log.old_values->>'unitClientPriceCents' = '135000'
     AND log.new_values->>'unitClientPriceCents' = '150000'),
  1,
  'the rug''s markup edit is audited with its studio, actor, and old and new price'
);
SELECT is(
  (SELECT count(*)::int FROM public.audit_logs
   WHERE resource_type = 'projects' AND resource_id = '80900000-0000-4000-8000-000000000001'
     AND action = 'project_pricing_set'
     AND new_values->>'salesTaxRate' = '0.0825'),
  1,
  'the job''s pricing edit is audited'
);

-- ── SQ-1124 repair: fixtures (as postgres) ─────────────────────────────────
-- P2 holds the held markup, the spec book, the fills, the overflow and the
-- replacements; P3 the job reset over replaced and configuration-locked
-- lines; P4 a below-cost release. All are O's in studio A, so nothing here
-- moves P's counts above. O's defaults are 40% goods (set above).
INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
VALUES
  ('80900000-0000-4000-8000-000000000002', 'P809 Barn',
   '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-0000000000a2',
   '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-0000000000f1', 'active'),
  ('80900000-0000-4000-8000-000000000003', 'P809 Cabin',
   '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-0000000000a2',
   '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-0000000000f1', 'active'),
  ('80900000-0000-4000-8000-000000000004', 'P809 Loft',
   '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-0000000000a2',
   '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-0000000000f1', 'active');

-- P2 lines:
--   201 Console      $100 cost: takes 40% on insert; priced at 50% below
--   202 Wall mirror  $100 cost: takes 40%; its cost then moves to $125
--   206 Side need    a need the designer prices by hand, then fills
--   207 Slab         a line with no cost yet
--   211 Free stool   Chair A, given away at a typed $0
--   212 Gift lamp    Chair A at -100%
--   213 Flagged arm  Chair A at 50%, then its cost moves (flagged)
--   214 Typed chair  Chair A at a typed $170
--   215 Default seat Chair A at the 40% default
--   216 Gift stool   Chair A at -100%, replaced naming Chair A again (SQ-1151)
--   217 Flagged back Chair A at 50%, then flagged, replaced naming Chair A
-- P3 lines:
--   301 Open table   $100 cost: takes 40%, then typed at $150
--   302 Banquette    a typed $300 on a $200 cost, configuration-locked below
--   303 Old sconce   replaced (superseded), with a cost change pending
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, quantity, trade_price_cents,
  unit_price_cents, line_total_cents, design_disposition, product_id
) VALUES
  ('80900000-0000-4000-8000-000000000201', '80900000-0000-4000-8000-000000000002', 'Console',
   'specified', 'fixed', 1, 10000, 0, 0, 'selected', NULL),
  ('80900000-0000-4000-8000-000000000202', '80900000-0000-4000-8000-000000000002', 'Wall mirror',
   'specified', 'fixed', 1, 10000, 0, 0, 'selected', NULL),
  ('80900000-0000-4000-8000-000000000206', '80900000-0000-4000-8000-000000000002', 'Side need',
   'specified', 'fixed', 1, NULL, 0, 0, 'candidate', NULL),
  ('80900000-0000-4000-8000-000000000207', '80900000-0000-4000-8000-000000000002', 'Slab',
   'specified', 'fixed', 1, NULL, 0, 0, 'selected', NULL),
  ('80900000-0000-4000-8000-000000000211', '80900000-0000-4000-8000-000000000002', 'Free stool',
   'specified', 'fixed', 1, 10000, 0, 0, 'selected', '80900000-0000-4000-8000-000000000021'),
  ('80900000-0000-4000-8000-000000000212', '80900000-0000-4000-8000-000000000002', 'Gift lamp',
   'specified', 'fixed', 1, 10000, 0, 0, 'selected', '80900000-0000-4000-8000-000000000021'),
  ('80900000-0000-4000-8000-000000000213', '80900000-0000-4000-8000-000000000002', 'Flagged arm',
   'specified', 'fixed', 1, 10000, 0, 0, 'selected', '80900000-0000-4000-8000-000000000021'),
  ('80900000-0000-4000-8000-000000000214', '80900000-0000-4000-8000-000000000002', 'Typed chair',
   'specified', 'fixed', 1, 10000, 0, 0, 'selected', '80900000-0000-4000-8000-000000000021'),
  ('80900000-0000-4000-8000-000000000215', '80900000-0000-4000-8000-000000000002', 'Default seat',
   'specified', 'fixed', 1, 10000, 0, 0, 'selected', '80900000-0000-4000-8000-000000000021'),
  ('80900000-0000-4000-8000-000000000216', '80900000-0000-4000-8000-000000000002', 'Gift stool',
   'specified', 'fixed', 1, 10000, 0, 0, 'selected', '80900000-0000-4000-8000-000000000021'),
  ('80900000-0000-4000-8000-000000000217', '80900000-0000-4000-8000-000000000002', 'Flagged back',
   'specified', 'fixed', 1, 10000, 0, 0, 'selected', '80900000-0000-4000-8000-000000000021'),
  ('80900000-0000-4000-8000-000000000301', '80900000-0000-4000-8000-000000000003', 'Open table',
   'specified', 'fixed', 1, 10000, 0, 0, 'selected', NULL),
  ('80900000-0000-4000-8000-000000000302', '80900000-0000-4000-8000-000000000003', 'Banquette',
   'specified', 'fixed', 1, 20000, 30000, 30000, 'selected', NULL);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, quantity, trade_price_cents, unit_price_cents,
  line_total_cents, design_disposition, price_basis, pending_cost_prev_cents,
  pending_cost_changed_at, pending_markup_held_percent
) VALUES
  ('80900000-0000-4000-8000-000000000303', '80900000-0000-4000-8000-000000000003', 'Old sconce',
   'specified', 'fixed', 1, 10000, 15000, 15000, 'superseded', 'client', 9000, now(), 66.67);

-- The banquette's approved configuration is bound and locked on its spec row
-- (the 00403 workflow's own GUC, as postgres).
INSERT INTO public.product_configurations (
  id, product_id, owner_user_id, studio_id, project_id, ffe_item_id, version, schema_revision,
  evaluation, snapshot, snapshot_hash, is_complete, is_valid, retail_price_cents, trade_price_cents
) VALUES (
  '80900000-0000-4000-8000-000000000390', '80900000-0000-4000-8000-000000000021',
  '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-0000000000f1',
  '80900000-0000-4000-8000-000000000003', '80900000-0000-4000-8000-000000000302', 1, 1,
  '{}'::jsonb, '{"selections": []}'::jsonb, repeat('a', 64), true, true, 30000, 20000
);
SELECT set_config('patina.configuration_spec_workflow', '00403', true);
UPDATE public.project_ffe_specs
   SET configuration_id = '80900000-0000-4000-8000-000000000390',
       configuration_snapshot = '{"selections": []}'::jsonb,
       configuration_snapshot_hash = repeat('a', 64),
       configuration_locked_at = now()
 WHERE ffe_item_id = '80900000-0000-4000-8000-000000000302';
SELECT set_config('patina.configuration_spec_workflow', '', true);

-- P4: one room, an executed design-services origin, a budget over the room,
-- and a line priced $80 on a $100 cost (a -20% markup).
INSERT INTO public.project_rooms (id, project_id, name, sort_order)
VALUES ('80900000-0000-4000-8000-0000000004c1', '80900000-0000-4000-8000-000000000004', 'Hall', 0);
INSERT INTO public.proposals (id, project_id, designer_id, title, status, document_kind, commercial_state)
VALUES ('80900000-0000-4000-8000-000000000450', '80900000-0000-4000-8000-000000000004',
        '80900000-0000-4000-8000-0000000000a1', 'P809 Design services', 'accepted', 'design_services', 'executed');
INSERT INTO public.project_commercial_documents (id, project_id, proposal_id, document_kind, is_origin, bound_at, executed_at, created_by)
VALUES ('80900000-0000-4000-8000-000000000460', '80900000-0000-4000-8000-000000000004',
        '80900000-0000-4000-8000-000000000450', 'design_services', true, now(), now(),
        '80900000-0000-4000-8000-0000000000a1');
INSERT INTO public.project_budget_versions (id, project_id, version, created_by)
VALUES ('80900000-0000-4000-8000-000000000470', '80900000-0000-4000-8000-000000000004', 1,
        '80900000-0000-4000-8000-0000000000a1');
INSERT INTO public.project_budget_lines (budget_version_id, project_room_id, room_name, category, low_cents, target_cents, high_cents)
VALUES ('80900000-0000-4000-8000-000000000470', '80900000-0000-4000-8000-0000000004c1', 'Hall', 'Furnishings',
        10000, 50000, 90000);
INSERT INTO public.project_ffe_items (
  id, project_id, project_room_id, assignment_scope, name, status, item_type, quantity, unit,
  unit_price_cents, trade_price_cents, line_total_cents, vendor_id, vendor_name, design_disposition, sort_order
) VALUES
  ('80900000-0000-4000-8000-000000000401', '80900000-0000-4000-8000-000000000004',
   '80900000-0000-4000-8000-0000000004c1', 'room', 'Floor sample stool', 'specified', 'fixed', 1, 'each',
   8000, 10000, 8000, '80900000-0000-4000-8000-000000000011', 'P809 Mill', 'selected', 0);
SELECT set_config('app.ffe_mutation_rpc', '', true);

DO $fixture$
DECLARE
  v_published jsonb;
BEGIN
  ASSERT (SELECT count(*) FROM public.project_ffe_specs
          WHERE ffe_item_id = '80900000-0000-4000-8000-000000000302'
            AND configuration_locked_at IS NOT NULL) = 1,
    'fixture: the banquette is configuration-locked';
  PERFORM set_config('request.jwt.claims',
    '{"sub":"80900000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  PERFORM set_config('request.jwt.claim.sub', '80900000-0000-4000-8000-0000000000a1', true);
  v_published := public.publish_budget_checkpoint('80900000-0000-4000-8000-000000000004',
                                                  '80900000-0000-4000-8000-000000000470');
  PERFORM public.override_budget_checkpoint((v_published->>'checkpointId')::uuid,
    'Client travelling; proceeding on the reviewed budget.');
END
$fixture$;


-- ── the held markup (F9) and a truthful spec book (F1) ─────────────────────
-- Setup runs as O through the RPCs; only the behaviour is asserted.
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"80900000-0000-4000-8000-0000000000a1","role":"authenticated"}';
DO $setup$
BEGIN
  PERFORM public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000201', 'markup_percent', 50);
  PERFORM public.set_project_ffe_line_commercials('80900000-0000-4000-8000-000000000201',
    '{"tradePriceCents": 12000}'::jsonb);
END
$setup$;
SELECT is(
  (SELECT concat_ws('|', trade_price_cents, unit_price_cents, markup_percent, pending_cost_prev_cents,
                    pending_markup_held_percent, pending_cost_changed_at IS NOT NULL)
   FROM public.project_ffe_items WHERE id = '80900000-0000-4000-8000-000000000201'),
  '12000|15000|25|10000|50|t',
  'F9: a legacy cost change ($100 to $120) flags the $150 console and holds the 50% it was priced at; its markup reads true (25%)'
);
DO $setup$
BEGIN
  PERFORM public.set_project_ffe_line_commercials('80900000-0000-4000-8000-000000000201',
    '{"tradePriceCents": 12000}'::jsonb);
END
$setup$;
SELECT is(
  (SELECT concat_ws('|', markup_percent, pending_cost_prev_cents, pending_markup_held_percent,
                    pending_cost_changed_at IS NOT NULL)
   FROM public.project_ffe_items WHERE id = '80900000-0000-4000-8000-000000000201'),
  '25|10000|50|t',
  'F9: the legacy writer writing the same $120 again leaves the flag, the old cost and the held 50% as they were'
);
SELECT is(
  (SELECT concat_ws('|', r->>'unitClientPriceCents', r->>'markupPercent', r->>'priceBasis',
                    coalesce(r->>'pendingMarkupHeldPercent', 'clear'))
   FROM (SELECT public.resolve_ffe_cost_change('80900000-0000-4000-8000-000000000201', 'keep_markup') AS r) AS edit),
  '18000|50|markup|clear',
  'F9: keep_markup prices the $120 cost at the held 50%: $180'
);
DO $setup$
BEGIN
  PERFORM public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000202', 'unit_cost_cents', 12500);
  PERFORM public.ensure_project_spec_book('80900000-0000-4000-8000-000000000002');
END
$setup$;
RESET ROLE;
SELECT is(
  (SELECT concat_ws('|', snap.item_snapshot #>> '{pricing,markupPercent}',
                    (snap.item_snapshot #>> '{pricing,markupPercent}')::numeric
                      = public._ffe_true_markup(item.unit_price_cents, item.trade_price_cents),
                    item.pending_markup_held_percent)
   FROM public.spec_books AS book
   CROSS JOIN LATERAL public._spec_book_current_item_snapshots(book.id) AS snap
   JOIN public.project_ffe_items AS item ON item.id = snap.ffe_item_id
   WHERE book.project_id = '80900000-0000-4000-8000-000000000002'
     AND snap.ffe_item_id = '80900000-0000-4000-8000-000000000202'),
  '12|t|40',
  'F1: the spec book prints a flagged line''s true markup ($140 on $125: 12%), never the held 40%'
);

-- ── a fill under a typed price that is already flagged (F2) ────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"80900000-0000-4000-8000-0000000000a1","role":"authenticated"}';
DO $setup$
BEGIN
  PERFORM public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000206', 'unit_client_price_cents', 16000);
  PERFORM public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000206', 'unit_cost_cents', 10000);
  PERFORM public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000206', 'unit_cost_cents', 12000);
  ASSERT public.place_product_in_project_v2(jsonb_build_object(
    'projectId', '80900000-0000-4000-8000-000000000002',
    'productId', '80900000-0000-4000-8000-000000000028',
    'placeholderSelectionId', '80900000-0000-4000-8000-000000000206',
    'idempotencyKey', 'p809-fill-side'))->>'outcome' = 'filled',
    'fixture: the flagged side need is filled with the accent chair';
END
$setup$;
SELECT is(
  (SELECT concat_ws('|', unit_price_cents, trade_price_cents, price_basis, pending_cost_prev_cents,
                    pending_markup_held_percent, pending_cost_changed_at IS NOT NULL, round(markup_percent, 2))
   FROM public.project_ffe_items WHERE id = '80900000-0000-4000-8000-000000000206'),
  '16000|9000|client|10000|60|t|77.78',
  'F2: a fill under a typed $160 already flagged ($100 to $120) keeps the price and the first cost with its 60%; nothing is overwritten'
);

-- ── an unrepresentable default is refused (F5) ─────────────────────────────
SELECT throws_ok(
  $$SELECT public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000207', 'unit_cost_cents', 2000000000)$$,
  '23514', 'That price is too large for one line.',
  'F5: a cost whose default client price cannot be stored on one line is refused, not left unpriced'
);

-- ── a replacement carries its price state (F3) ─────────────────────────────
DO $setup$
BEGIN
  PERFORM public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000211', 'unit_client_price_cents', 0);
  PERFORM public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000212', 'markup_percent', -100);
  PERFORM public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000213', 'markup_percent', 50);
  PERFORM public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000213', 'retail_unit_cents', 21000);
  PERFORM public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000213', 'unit_cost_cents', 12000);
  PERFORM public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000214', 'unit_client_price_cents', 17000);
  PERFORM public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000216', 'markup_percent', -100);
  PERFORM public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000217', 'markup_percent', 50);
  PERFORM public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000217', 'retail_unit_cents', 21000);
  PERFORM public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000217', 'unit_cost_cents', 12000);
  -- SQ-1151 (Astra SQ-1150 R2): the gift stool and the flagged back are
  -- replaced naming their own Chair A, which is the same product.
  PERFORM public.supersede_project_selection(jsonb_build_object('selectionId', '80900000-0000-4000-8000-000000000216',
    'productId', '80900000-0000-4000-8000-000000000021'));
  PERFORM public.supersede_project_selection(jsonb_build_object('selectionId', '80900000-0000-4000-8000-000000000217',
    'productId', '80900000-0000-4000-8000-000000000021'));
  -- The stool, the lamp and the arm keep Chair A; the chair takes the accent
  -- chair ($90 cost, $160 retail); the seat (40% default) takes the table
  -- ($300 cost, $540 retail).
  PERFORM public.supersede_project_selection(jsonb_build_object('selectionId', '80900000-0000-4000-8000-000000000211'));
  PERFORM public.supersede_project_selection(jsonb_build_object('selectionId', '80900000-0000-4000-8000-000000000212'));
  PERFORM public.supersede_project_selection(jsonb_build_object('selectionId', '80900000-0000-4000-8000-000000000213'));
  PERFORM public.supersede_project_selection(jsonb_build_object('selectionId', '80900000-0000-4000-8000-000000000214',
    'productId', '80900000-0000-4000-8000-000000000028'));
  PERFORM public.supersede_project_selection(jsonb_build_object('selectionId', '80900000-0000-4000-8000-000000000215',
    'productId', '80900000-0000-4000-8000-000000000023'));
END
$setup$;
RESET ROLE;
SELECT is(
  (SELECT string_agg(concat_ws('|', item.unit_price_cents, item.line_total_cents, item.price_basis),
                     ',' ORDER BY item.supersedes_ffe_item_id)
   FROM public.project_ffe_items AS item
   WHERE item.supersedes_ffe_item_id IN ('80900000-0000-4000-8000-000000000211',
                                         '80900000-0000-4000-8000-000000000212')),
  '0|0|client,0|0|markup',
  'F3: a free line stays free on the same product (a typed $0 and -100%), its basis carried'
);
SELECT is(
  (SELECT concat_ws('|', item.unit_price_cents, item.trade_price_cents, item.price_basis,
                    item.pending_cost_prev_cents, item.pending_markup_held_percent,
                    item.pending_cost_changed_at IS NOT NULL, item.retail_unit_cents, item.markup_percent)
   FROM public.project_ffe_items AS item
   WHERE item.supersedes_ffe_item_id = '80900000-0000-4000-8000-000000000213'),
  '15000|12000|markup|10000|50|t|21000|25',
  'F3: the same-product successor carries the basis, the pending flag with its held 50%, and the typed retail'
);
SELECT is(
  (SELECT concat_ws('|', item.unit_price_cents, item.trade_price_cents, item.price_basis,
                    item.pending_cost_prev_cents, item.pending_markup_held_percent,
                    item.pending_cost_changed_at IS NOT NULL, round(item.markup_percent, 2))
   FROM public.project_ffe_items AS item
   WHERE item.supersedes_ffe_item_id = '80900000-0000-4000-8000-000000000214'),
  '17000|9000|client|10000|70|t|88.89',
  'F3: a new product under a typed $170 follows the fill rules: the price is kept and the moved cost flags, 70% held'
);
SELECT is(
  (SELECT concat_ws('|', item.unit_price_cents, item.trade_price_cents, item.price_basis,
                    coalesce(item.pending_cost_prev_cents::text, 'none'), item.markup_percent, item.retail_unit_cents)
   FROM public.project_ffe_items AS item
   WHERE item.supersedes_ffe_item_id = '80900000-0000-4000-8000-000000000215'),
  '42000|30000|markup|none|40|54000',
  'F3: a new product under a default price is priced from its cost at the 40% default, retail from the product'
);
SELECT is(
  (SELECT concat_ws('|', item.product_id = '80900000-0000-4000-8000-000000000021', item.unit_price_cents,
                    item.line_total_cents, item.price_basis, item.trade_price_cents, item.markup_percent)
   FROM public.project_ffe_items AS item
   WHERE item.supersedes_ffe_item_id = '80900000-0000-4000-8000-000000000216'),
  't|0|0|markup|10000|-100',
  'SQ-1151 R2: a -100% line replaced naming its own product stays free; no library fill, its basis carried'
);
SELECT is(
  (SELECT concat_ws('|', item.unit_price_cents, item.trade_price_cents, item.price_basis,
                    item.pending_cost_prev_cents, item.pending_markup_held_percent,
                    item.pending_cost_changed_at IS NOT NULL, item.retail_unit_cents, item.markup_percent)
   FROM public.project_ffe_items AS item
   WHERE item.supersedes_ffe_item_id = '80900000-0000-4000-8000-000000000217'),
  '15000|12000|markup|10000|50|t|21000|25',
  'SQ-1151 R2: a flagged line replaced naming its own product keeps its basis, the flag with its held 50%, and the typed retail'
);

-- ── replaced and configuration-locked lines (F6, F10); lock order (F7) ─────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"80900000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT throws_ok(
  $$SELECT public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000303', 'markup_percent', 10)$$,
  '23514', 'This line was replaced. Price the line that replaced it.',
  'F6: the pricing writer refuses a replaced line'
);
SELECT throws_ok(
  $$SELECT public.resolve_ffe_cost_change('80900000-0000-4000-8000-000000000303', 'keep_client')$$,
  '23514', 'This line was replaced. Price the line that replaced it.',
  'F6: a replaced line''s pending flag is not settled with keep_client'
);
SELECT throws_ok(
  $$SELECT public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000302', 'unit_client_price_cents', 31000)$$,
  '23514', 'This configured line is locked. Change it through a configuration revision.',
  'F10: the pricing writer refuses a configuration-locked line with a plain sentence'
);
DO $setup$
BEGIN
  PERFORM public.set_ffe_line_pricing('80900000-0000-4000-8000-000000000301', 'unit_client_price_cents', 15000);
END
$setup$;
RESET ROLE;
CREATE TEMP TABLE p809_reset (result jsonb, failure text) ON COMMIT DROP;
DO $reset$
BEGIN
  PERFORM set_config('request.jwt.claims',
    '{"sub":"80900000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);
  INSERT INTO p809_reset (result) VALUES (public.reset_project_markups('80900000-0000-4000-8000-000000000003'));
EXCEPTION WHEN OTHERS THEN
  INSERT INTO p809_reset (failure) VALUES (SQLSTATE || ': ' || SQLERRM);
END
$reset$;
SELECT is(
  (SELECT coalesce(concat_ws('|', result->>'resetCount', result->>'skippedCount'), failure) FROM p809_reset),
  '1|1',
  'F6/F10: reset all on a mixed job resets the open line, skips and counts the configuration-locked one, and leaves the replaced one out'
);
SELECT is(
  (SELECT string_agg(concat_ws('|', right(id::text, 3), unit_price_cents, coalesce(price_basis, 'none')), ',' ORDER BY id)
   FROM public.project_ffe_items WHERE project_id = '80900000-0000-4000-8000-000000000003'),
  '301|14000|markup,302|30000|none,303|15000|client',
  'F6/F10: the reset moved only the open line ($150 typed to the 40% default); the configured and the replaced lines keep their prices'
);
SELECT ok(
  pg_get_functiondef('public.reset_project_markups(uuid)'::regprocedure) ~ 'ORDER BY id\s+FOR UPDATE',
  'F7: reset_project_markups takes its row locks in id order'
);
SELECT ok(
  strpos(def, 'public._can_access_product_configuration(p_configuration_id)') > 0
  AND strpos(def, 'public._can_access_product_configuration(p_configuration_id)')
      < strpos(def, 'PERFORM public._ffe_lock_job_labels(p_project_id)')
  AND strpos(def, 'PERFORM public._ffe_lock_job_labels(p_project_id)')
      < regexp_instr(def, 'FOR (UPDATE|SHARE|KEY SHARE|NO KEY UPDATE)'),
  'Lock order (SQ-1135): a configured placement takes the job label lock after its access check and before any row lock'
)
FROM (SELECT pg_get_functiondef(
  'public._place_product_configuration_in_project_impl(uuid,uuid,uuid,uuid,text,jsonb)'::regprocedure) AS def) AS fn;

-- SQ-1151 (Astra SQ-1150 R1, R182): Reset all takes the job label lock before
-- it locks a line. Two-session interleave (dblink). Session A stands in for a
-- replacement: it holds the job label lock and the parent piece, and next
-- locks the parent's active accessory, whose id is lower. Session B runs
-- Reset all on the same job. B must wait on the job label lock holding no
-- line, so A can still lock the accessory without waiting. Without the lock B
-- would hold the accessory and wait on the parent: 40P01 once A asks. The
-- fixture is committed through a third session and removed after; B rolls back.
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
CREATE TEMP TABLE p809_reset_interleave (result text) ON COMMIT DROP;
DO $p809_interleave$
DECLARE
  v_dsn text := format(
    'host=%s port=54322 dbname=%s user=postgres password=postgres connect_timeout=5',
    host(network(set_masklen(inet_server_addr(), 16)) + 1), current_database());
  v_cleanup text := $c$
    SET statement_timeout = '20s';
    SET lock_timeout = '10s';
    SET app.ffe_mutation_rpc = 'on';
    DELETE FROM public.projects WHERE id = '80915100-0000-4000-8000-000000000001';
    DELETE FROM public.profiles WHERE id = '80915100-0000-4000-8000-0000000000d1';
    DELETE FROM auth.users WHERE id = '80915100-0000-4000-8000-0000000000d1';
  $c$;
  v_b_pid integer;
  v_wait text;
  v_result text;
  v_conn text;
BEGIN
  PERFORM extensions.dblink_connect('p809_setup', v_dsn);
  PERFORM extensions.dblink_connect('p809_a', v_dsn);
  PERFORM extensions.dblink_connect('p809_b', v_dsn);
  BEGIN
    PERFORM extensions.dblink_exec('p809_setup', v_cleanup);
    PERFORM extensions.dblink_exec('p809_setup', $f$
      INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
      VALUES ('80915100-0000-4000-8000-0000000000d1', 'p809-interleave@test.invalid', '', now(), now(), now(),
              '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
      INSERT INTO public.profiles (id, email, full_name, created_at, updated_at)
      VALUES ('80915100-0000-4000-8000-0000000000d1', 'p809-interleave@test.invalid', 'P809 Interleave', now(), now())
      ON CONFLICT (id) DO NOTHING;
      INSERT INTO public.projects (id, name, designer_id, created_by, status)
      VALUES ('80915100-0000-4000-8000-000000000001', 'P809 Interleave job', '80915100-0000-4000-8000-0000000000d1',
              '80915100-0000-4000-8000-0000000000d1', 'active');
      INSERT INTO public.project_ffe_items (id, project_id, name, status, item_type, quantity,
        trade_price_cents, unit_price_cents, line_total_cents, design_disposition)
      VALUES ('80915100-0000-4000-8000-0000000000b2', '80915100-0000-4000-8000-000000000001', 'Parent sofa',
              'specified', 'fixed', 1, 10000, 0, 0, 'selected');
      INSERT INTO public.project_ffe_items (id, project_id, name, status, item_type, quantity,
        trade_price_cents, unit_price_cents, line_total_cents, design_disposition, link_kind, parent_ffe_item_id)
      VALUES ('80915100-0000-4000-8000-0000000000a1', '80915100-0000-4000-8000-000000000001', 'Accessory pillow',
              'specified', 'fixed', 1, 2000, 0, 0, 'selected', 'accessory', '80915100-0000-4000-8000-0000000000b2');
    $f$);
    PERFORM extensions.dblink_exec('p809_a', $q$SET lock_timeout = '20s'$q$);
    PERFORM extensions.dblink_exec('p809_b', $q$SET lock_timeout = '20s'$q$);
    PERFORM * FROM extensions.dblink('p809_b', $q$SELECT set_config('request.jwt.claims',
      '{"sub":"80915100-0000-4000-8000-0000000000d1","role":"authenticated"}', false),
      set_config('request.jwt.claim.sub', '80915100-0000-4000-8000-0000000000d1', false)$q$)
      AS r(claims text, sub text);

    PERFORM extensions.dblink_exec('p809_a', 'BEGIN');
    PERFORM * FROM extensions.dblink('p809_a',
      $q$SELECT public._ffe_lock_job_labels('80915100-0000-4000-8000-000000000001')::text$q$) AS r(x text);
    PERFORM * FROM extensions.dblink('p809_a', $q$SELECT 1 FROM public.project_ffe_items
      WHERE id = '80915100-0000-4000-8000-0000000000b2' FOR UPDATE$q$) AS r(x integer);
    SELECT pid INTO v_b_pid FROM extensions.dblink('p809_b', 'SELECT pg_backend_pid()') AS r(pid integer);
    PERFORM extensions.dblink_exec('p809_b', 'BEGIN');
    PERFORM extensions.dblink_send_query('p809_b',
      $q$SELECT public.reset_project_markups('80915100-0000-4000-8000-000000000001')::text$q$);
    FOR i IN 1..50 LOOP
      SELECT wait INTO v_wait FROM extensions.dblink('p809_setup', format(
        $q$SELECT wait_event FROM pg_stat_activity WHERE pid = %s AND wait_event_type = 'Lock'$q$, v_b_pid))
        AS r(wait text);
      EXIT WHEN v_wait IS NOT NULL;
      PERFORM pg_sleep(0.1);
    END LOOP;

    IF v_wait IS NULL THEN
      v_result := 'the reset never waited';
    ELSE
      BEGIN
        PERFORM * FROM extensions.dblink('p809_a', $q$SELECT 1 FROM public.project_ffe_items
          WHERE id = '80915100-0000-4000-8000-0000000000a1' FOR UPDATE NOWAIT$q$) AS r(x integer);
        v_result := 'waits on ' || v_wait || '; accessory free';
      EXCEPTION WHEN OTHERS THEN
        v_result := 'waits on ' || v_wait || '; accessory held by the reset: ' || SQLERRM;
      END;
    END IF;
    PERFORM extensions.dblink_exec('p809_a', 'ROLLBACK');
    -- B goes on and resets the job inside its own transaction, then rolls back.
    PERFORM * FROM extensions.dblink_get_result('p809_b', false) AS r(x text);
    PERFORM * FROM extensions.dblink_get_result('p809_b', false) AS r(x text);
    PERFORM extensions.dblink_exec('p809_b', 'ROLLBACK');
  EXCEPTION WHEN OTHERS THEN
    v_result := COALESCE(v_result, 'interleave error: ' || SQLERRM);
  END;
  -- A and B close first, so nothing they still hold can block the cleanup.
  FOREACH v_conn IN ARRAY COALESCE(extensions.dblink_get_connections(), ARRAY[]::text[]) LOOP
    IF v_conn IN ('p809_a', 'p809_b') THEN PERFORM extensions.dblink_disconnect(v_conn); END IF;
  END LOOP;
  BEGIN
    PERFORM extensions.dblink_exec('p809_setup', v_cleanup);
  EXCEPTION WHEN OTHERS THEN
    v_result := COALESCE(v_result, '') || ' / cleanup error: ' || SQLERRM;
  END;
  PERFORM extensions.dblink_disconnect('p809_setup');
  INSERT INTO p809_reset_interleave VALUES (v_result);
END
$p809_interleave$;
SELECT is(
  (SELECT result FROM p809_reset_interleave),
  'waits on advisory; accessory free',
  'SQ-1151 R1: Reset all waits on the job label lock holding no line, so a replacement holding the parent can still lock its lower-id accessory (dblink interleave)'
);
SELECT ok(
  strpos(def, 'PERFORM public._ffe_require_studio_project(p_project_id)') > 0
  AND strpos(def, 'PERFORM public._ffe_require_studio_project(p_project_id)')
      < strpos(def, 'PERFORM public._ffe_lock_job_labels(p_project_id)')
  AND strpos(def, 'PERFORM public._ffe_lock_job_labels(p_project_id)')
      < regexp_instr(def, 'FOR (UPDATE|SHARE|KEY SHARE|NO KEY UPDATE)'),
  'SQ-1151 R1: reset_project_markups takes the job label lock after its access check and before its first row lock'
)
FROM (SELECT pg_get_functiondef('public.reset_project_markups(uuid)'::regprocedure) AS def) AS fn;

-- ── a configured placement takes no intermediate default (SQ-1151 R4) ──────
-- P5 is O's at a 35% target. The Grand sofa costs $20,000,000.00 (int4 holds
-- $21,474,836.47) with a $1 retail. Its two configurations carry an approved
-- $21,000,000.00 client price on that cost. The 35% default would be
-- $27,000,000.00, past int4, but it never prices the line: the approved price
-- does. A need of two takes the second configuration: $42,000,000.00 on one
-- line is still refused in words.
INSERT INTO public.projects (id, name, designer_id, client_id, created_by, studio_id, status)
VALUES ('80900000-0000-4000-8000-000000000005', 'P809 Estate',
        '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-0000000000a2',
        '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-0000000000f1', 'active');
INSERT INTO public.project_pricing_settings (project_id, markup_target_percent)
VALUES ('80900000-0000-4000-8000-000000000005', 35);
INSERT INTO public.products (id, name, captured_at, layer, owner_user_id, vendor_id, price_trade, price_retail)
VALUES ('80900000-0000-4000-8000-000000000031', 'P809 Grand sofa', now(), 'personal',
        '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-000000000011', 2000000000, 100);
INSERT INTO public.product_configurations (
  id, product_id, owner_user_id, studio_id, project_id, version, schema_revision,
  evaluation, snapshot, snapshot_hash, is_complete, is_valid, retail_price_cents, trade_price_cents
) VALUES
  ('80900000-0000-4000-8000-000000000591', '80900000-0000-4000-8000-000000000031',
   '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-0000000000f1',
   '80900000-0000-4000-8000-000000000005', 1, 1,
   '{}'::jsonb, '{"selections": []}'::jsonb, repeat('b', 64), true, true, 2100000000, 2000000000),
  ('80900000-0000-4000-8000-000000000592', '80900000-0000-4000-8000-000000000031',
   '80900000-0000-4000-8000-0000000000a1', '80900000-0000-4000-8000-0000000000f1',
   '80900000-0000-4000-8000-000000000005', 1, 1,
   '{}'::jsonb, '{"selections": []}'::jsonb, repeat('c', 64), true, true, 2100000000, 2000000000);
SELECT set_config('app.ffe_mutation_rpc', 'on', true);
INSERT INTO public.project_ffe_items (
  id, project_id, name, status, item_type, quantity, trade_price_cents,
  unit_price_cents, line_total_cents, design_disposition, product_id
) VALUES
  ('80900000-0000-4000-8000-000000000502', '80900000-0000-4000-8000-000000000005', 'Pair of sofas',
   'specified', 'fixed', 2, NULL, 0, 0, 'candidate', NULL);
SELECT set_config('app.ffe_mutation_rpc', '', true);
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"80900000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.place_product_configuration_in_project('80900000-0000-4000-8000-000000000005',
      '80900000-0000-4000-8000-000000000591')$$,
  'SQ-1151 R4: a configured placement whose 35% default would pass int4 still places at its approved price'
);
SELECT throws_ok(
  $$SELECT public.place_product_configuration_in_project('80900000-0000-4000-8000-000000000005',
      '80900000-0000-4000-8000-000000000592', NULL, '80900000-0000-4000-8000-000000000502')$$,
  '23514', 'That price is too large for one line.',
  'SQ-1151 R4: an approved price whose line total passes int4 (two at $21,000,000.00) is still refused in words'
);
RESET ROLE;
SELECT is(
  (SELECT concat_ws('|', count(*), min(item.unit_price_cents), min(item.line_total_cents),
                    min(item.trade_price_cents), min(item.price_basis), min(item.markup_percent))
   FROM public.project_ffe_items AS item
   JOIN public.product_configurations AS config ON config.ffe_item_id = item.id
   WHERE config.id = '80900000-0000-4000-8000-000000000591'),
  '1|2100000000|2100000000|2000000000|client|5',
  'SQ-1151 R4: the configured line carries the approved $21,000,000.00 as a client price, its true 5% markup over the configuration cost'
);

-- ── a below-cost line releases with its true markup ────────────────────────
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claims = '{"sub":"80900000-0000-4000-8000-0000000000a1","role":"authenticated"}';
SELECT lives_ok(
  $$SELECT public.create_furnishings_authorization_from_schedule('80900000-0000-4000-8000-000000000004',
      'Authorization No. 1', ARRAY['80900000-0000-4000-8000-000000000401'::uuid], NULL)$$,
  'a line priced $80 on a $100 cost (-20%) is released'
);
RESET ROLE;
SELECT is(
  (SELECT concat_ws('|', count(*), min(markup_percent), min(client_unit_price_cents), min(trade_unit_cost_cents))
   FROM public.furnishing_authorization_items
   WHERE source_ffe_item_id = '80900000-0000-4000-8000-000000000401'),
  '1|-20|8000|10000',
  'the release snapshot carries the line''s true -20% markup'
);

SELECT * FROM finish();
ROLLBACK;
