-- ═══════════════════════════════════════════════════════════════════════════
-- Direct-order attribution, the buyability gate, and the settle side effects
-- (migration 00540 — Daily Return W5, rulings R3 / Q5)
--
-- What this pins down, and why each one is worth a test:
--
--   1. THE GATE, field by field. create_direct_order must refuse a piece whose
--      size, lead time, maker or photography is unknown. A $4,200 order sheet
--      over somebody else's photograph is the failure the gate exists to stop,
--      and the client-side gate is only the first of two locks.
--   2. THE ATTRIBUTION ORDER: active project → live lead → roster → nobody.
--      It must agree with DesignerRelationshipResolver.resolve on the device,
--      because that resolver decides who never sees Buy and this decides who
--      gets paid. If they disagree a client is pre-empted without credit, or
--      credited without pre-emption.
--   3. THE SAME-DAY ROSTER TIE files the order UNCREDITED. Two designers added
--      on one day give no honest basis to pick one.
--   4. THE COMMISSION FALLBACK: products.commission_rate, else
--      fulfillment_config commission_rate_default (0.16), snapshotted.
--   5. IMMUTABILITY once paid — a trigger, not a convention, because the
--      settle path is service_role and bypasses RLS entirely.
--   6. THE EARNINGS CREDIT FIRES ONCE, and the project-thread notice with it.
--   7. get_direct_order_terms is readable by a signed-in client and by nobody
--      else, and never returns TRUE for tax/shipping it has not been told is on.
--
-- How to run:
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
--     -f supabase/tests/commercial/direct_order_attribution_test.sql
--
-- Single transaction; ROLLBACK at the end.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.assume_user(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
END;
$$ LANGUAGE plpgsql;

-- ─── fixtures ──────────────────────────────────────────────────────────────
-- D1 designer · D2 second designer
-- CP project client · CL lead client · CR roster client
-- CT tie client (two roster designers, same day) · CN no relationship

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('da000000-0000-4000-8000-0000000000d1', 'do-d1@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('da000000-0000-4000-8000-0000000000d2', 'do-d2@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('da000000-0000-4000-8000-0000000000a1', 'do-cp@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('da000000-0000-4000-8000-0000000000a2', 'do-cl@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('da000000-0000-4000-8000-0000000000a3', 'do-cr@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('da000000-0000-4000-8000-0000000000a4', 'do-ct@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('da000000-0000-4000-8000-0000000000a5', 'do-cn@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, email, full_name, is_designer, created_at, updated_at)
VALUES
  ('da000000-0000-4000-8000-0000000000d1', 'do-d1@test.invalid', 'DO Designer One', true,  NOW(), NOW()),
  ('da000000-0000-4000-8000-0000000000d2', 'do-d2@test.invalid', 'DO Designer Two', true,  NOW(), NOW()),
  ('da000000-0000-4000-8000-0000000000a1', 'do-cp@test.invalid', 'Project Client',  false, NOW(), NOW()),
  ('da000000-0000-4000-8000-0000000000a2', 'do-cl@test.invalid', 'Lead Client',     false, NOW(), NOW()),
  ('da000000-0000-4000-8000-0000000000a3', 'do-cr@test.invalid', 'Roster Client',   false, NOW(), NOW()),
  ('da000000-0000-4000-8000-0000000000a4', 'do-ct@test.invalid', 'Tie Client',      false, NOW(), NOW()),
  ('da000000-0000-4000-8000-0000000000a5', 'do-cn@test.invalid', 'Nobody Client',   false, NOW(), NOW())
-- full_name is in the DO UPDATE deliberately: the auth.users insert above
-- fires Supabase's on_auth_user_created trigger, which has already minted a
-- profiles row with a NULL full_name — and the settle notice names the buyer.
ON CONFLICT (id) DO UPDATE SET is_designer = EXCLUDED.is_designer,
                               full_name   = EXCLUDED.full_name;

INSERT INTO public.organizations (id, type, name, slug, status)
VALUES ('da010000-0000-4000-8000-000000000001', 'design_studio', 'DO Studio', 'do-studio-test', 'active');

-- CP: an active project (which also gives her a roster row, as a real
-- activation would — the project must still win).
INSERT INTO public.projects (id, name, designer_id, created_by, client_id, studio_id, status)
VALUES ('da020000-0000-4000-8000-0000000000a1', 'DO Project',
        'da000000-0000-4000-8000-0000000000d1', 'da000000-0000-4000-8000-0000000000d1',
        'da000000-0000-4000-8000-0000000000a1', 'da010000-0000-4000-8000-000000000001', 'active');
INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, status, source)
VALUES ('da030000-0000-4000-8000-0000000000a1', 'da000000-0000-4000-8000-0000000000d2',
        'da000000-0000-4000-8000-0000000000a1', 'Project Client', 'active', 'direct');

-- CP also has a COMPLETED project with the other designer — the archived-status
-- branch of StudioQueueBuilder.projectIsArchived must not credit it.
INSERT INTO public.projects (id, name, designer_id, created_by, client_id, studio_id, status, created_at)
VALUES ('da020000-0000-4000-8000-0000000000a6', 'DO Finished Project',
        'da000000-0000-4000-8000-0000000000d2', 'da000000-0000-4000-8000-0000000000d2',
        'da000000-0000-4000-8000-0000000000a1', 'da010000-0000-4000-8000-000000000001', 'completed',
        NOW() + INTERVAL '1 day');   -- deliberately NEWER, so only the status filter can exclude it

-- CL: a live lead only.
INSERT INTO public.leads (id, designer_id, homeowner_id, status, project_type, client_request_id)
VALUES ('da040000-0000-4000-8000-0000000000a2', 'da000000-0000-4000-8000-0000000000d1',
        'da000000-0000-4000-8000-0000000000a2', 'contacted', 'full_home', 'da060000-0000-4000-8000-0000000000a2');
-- …and a declined one with the other designer, which must never win.
INSERT INTO public.leads (id, designer_id, homeowner_id, status, project_type, client_request_id, created_at)
VALUES ('da040000-0000-4000-8000-0000000000a7', 'da000000-0000-4000-8000-0000000000d2',
        'da000000-0000-4000-8000-0000000000a2', 'declined', 'full_home', 'da060000-0000-4000-8000-0000000000a7',
        NOW() + INTERVAL '1 day');

-- CR: one active roster row, nothing else.
INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, status, source)
VALUES ('da030000-0000-4000-8000-0000000000a3', 'da000000-0000-4000-8000-0000000000d1',
        'da000000-0000-4000-8000-0000000000a3', 'Roster Client', 'active', 'direct');

-- CT: two active roster designers added the same day → the tie.
INSERT INTO public.designer_clients (id, designer_id, client_id, client_name, status, source, created_at)
VALUES
  ('da030000-0000-4000-8000-0000000000a4', 'da000000-0000-4000-8000-0000000000d1',
   'da000000-0000-4000-8000-0000000000a4', 'Tie Client', 'active', 'direct', NOW() - INTERVAL '2 hours'),
  ('da030000-0000-4000-8000-0000000000a8', 'da000000-0000-4000-8000-0000000000d2',
   'da000000-0000-4000-8000-0000000000a4', 'Tie Client', 'active', 'direct', NOW() - INTERVAL '1 hour');

-- Products. BUYABLE carries all six gate fields; each of the four NOT_* rows
-- is byte-identical except for the one field it withholds.
INSERT INTO public.products
  (id, name, captured_at, layer, status, patina_managed, price_retail, price_trade,
   brand, dimensions, lead_time_weeks, photo_verified_at, shipping_flat_cents, commission_rate)
VALUES
  ('da050000-0000-4000-8000-000000000001', 'DO Buyable Piece', NOW(), 'catalog', 'published', true, 420000, 273000,
   'Nordic Atelier', '{"width":96,"depth":40,"height":30,"unit":"in"}'::jsonb, 10, NOW(), NULL, NULL),
  ('da050000-0000-4000-8000-000000000002', 'DO No Dimensions', NOW(), 'catalog', 'published', true, 420000, 273000,
   'Nordic Atelier', NULL, 10, NOW(), NULL, NULL),
  ('da050000-0000-4000-8000-000000000003', 'DO No Lead Time', NOW(), 'catalog', 'published', true, 420000, 273000,
   'Nordic Atelier', '{"width":96}'::jsonb, NULL, NOW(), NULL, NULL),
  ('da050000-0000-4000-8000-000000000004', 'DO No Brand', NOW(), 'catalog', 'published', true, 420000, 273000,
   '   ', '{"width":96}'::jsonb, 10, NOW(), NULL, NULL),
  ('da050000-0000-4000-8000-000000000005', 'DO Unverified Photo', NOW(), 'catalog', 'published', true, 420000, 273000,
   'Nordic Atelier', '{"width":96}'::jsonb, 10, NULL, NULL, NULL),
  -- freight to fold, and a per-piece commission rate that must beat the default
  ('da050000-0000-4000-8000-000000000006', 'DO Freighted Piece', NOW(), 'catalog', 'published', true, 100000, 70000,
   'Prairie Workshop', '{"width":40}'::jsonb, 6, NOW(), 18000, 0.25);

DO $$
DECLARE
  d1 uuid := 'da000000-0000-4000-8000-0000000000d1';
  d2 uuid := 'da000000-0000-4000-8000-0000000000d2';
  cp uuid := 'da000000-0000-4000-8000-0000000000a1';
  cl uuid := 'da000000-0000-4000-8000-0000000000a2';
  cr uuid := 'da000000-0000-4000-8000-0000000000a3';
  ct uuid := 'da000000-0000-4000-8000-0000000000a4';
  cn uuid := 'da000000-0000-4000-8000-0000000000a5';
  p_ok      uuid := 'da050000-0000-4000-8000-000000000001';
  p_freight uuid := 'da050000-0000-4000-8000-000000000006';
  o     public.direct_orders;
  o2    public.direct_orders;
  r     jsonb;
  n     int;
  v_body text;
BEGIN
  -- ═══ 1. the buyability gate, one field at a time ═══════════════════════
  PERFORM pg_temp.assume_user(cn);

  BEGIN
    o := public.create_direct_order('da050000-0000-4000-8000-000000000002', 1);
    ASSERT false, 'a piece with no dimensions must not be buyable';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%not_buyable:dimensions%',
      'the refusal must name the field, got: ' || SQLERRM;
  END;

  BEGIN
    o := public.create_direct_order('da050000-0000-4000-8000-000000000003', 1);
    ASSERT false, 'a piece with no lead time must not be buyable';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%not_buyable:lead_time_weeks%',
      'the refusal must name the field, got: ' || SQLERRM;
  END;

  BEGIN
    -- whitespace is not a maker: SP-10's "withhold a piece with no resolvable
    -- maker" has to survive a row that carries three spaces.
    o := public.create_direct_order('da050000-0000-4000-8000-000000000004', 1);
    ASSERT false, 'a piece whose brand is blank must not be buyable';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%not_buyable:brand%',
      'the refusal must name the field, got: ' || SQLERRM;
  END;

  BEGIN
    o := public.create_direct_order('da050000-0000-4000-8000-000000000005', 1);
    ASSERT false, 'a piece whose photography nobody has verified must not be buyable';
  EXCEPTION WHEN OTHERS THEN
    ASSERT SQLERRM LIKE '%not_buyable:photo_verified_at%',
      'the refusal must name the field, got: ' || SQLERRM;
  END;

  -- The two 00276 refusals are UNCHANGED and must stay so — iOS and the
  -- _tests assert suite both read these strings.
  ASSERT (SELECT count(*) FROM pg_proc WHERE proname = 'create_direct_order') = 1,
    'there must be exactly one create_direct_order overload';

  -- ═══ 2. attribution order ══════════════════════════════════════════════

  -- 2a. an ACTIVE PROJECT wins, even though a newer COMPLETED project and a
  --     roster row both name the other designer.
  PERFORM pg_temp.assume_user(cp);
  o := public.create_direct_order(p_ok, 1);
  ASSERT o.designer_id = d1,
    'an active project must credit its designer, got ' || COALESCE(o.designer_id::text, 'NULL');
  ASSERT o.project_id = 'da020000-0000-4000-8000-0000000000a1',
    'and must snapshot that project, got ' || COALESCE(o.project_id::text, 'NULL');

  -- 2b. a LIVE LEAD wins when there is no project; a declined one never does.
  PERFORM pg_temp.assume_user(cl);
  o := public.create_direct_order(p_ok, 1);
  ASSERT o.designer_id = d1,
    'a live lead must credit its designer and a declined lead must not, got '
      || COALESCE(o.designer_id::text, 'NULL');
  ASSERT o.project_id IS NULL, 'a lead credit carries no project_id';

  -- 2c. the ROSTER credits, even though it is NOT a live relationship —
  --     R3's whole point: she sees Buy, and her designer is still paid.
  PERFORM pg_temp.assume_user(cr);
  o := public.create_direct_order(p_ok, 1);
  ASSERT o.designer_id = d1, 'a roster row must credit its designer';
  ASSERT o.project_id IS NULL, 'a roster credit carries no project_id';

  -- 2d. NOBODY: no relationship, no credit, and the order still mints.
  PERFORM pg_temp.assume_user(cn);
  o := public.create_direct_order(p_ok, 1);
  ASSERT o.designer_id IS NULL, 'a client with no designer must not credit one';
  ASSERT o.project_id IS NULL, 'and must carry no project';
  ASSERT o.status = 'pending_payment', 'the order is still minted';

  -- ═══ 3. the same-day roster tie is UNCREDITED, not guessed ═════════════
  PERFORM pg_temp.assume_user(ct);
  o := public.create_direct_order(p_ok, 1);
  ASSERT o.designer_id IS NULL,
    'two roster designers on one day must file the order uncredited, got '
      || COALESCE(o.designer_id::text, 'NULL');
  -- …and the rate is still snapshotted, so a hand reconciliation later is not
  -- re-rated at whatever the catalog says then.
  ASSERT o.commission_rate IS NOT NULL, 'an uncredited order still snapshots its rate';

  -- ═══ 4. the commission fallback chain, and the freight fold ════════════
  PERFORM pg_temp.assume_user(cr);
  o := public.create_direct_order(p_ok, 2);
  ASSERT o.commission_rate = 0.1600,
    'with no products.commission_rate the fulfillment_config default (0.16) applies, got '
      || o.commission_rate::text;
  ASSERT o.amount_cents = 840000,
    'no shipping_flat_cents means no freight to fold, got ' || o.amount_cents::text;

  o2 := public.create_direct_order(p_freight, 2);
  ASSERT o2.commission_rate = 0.2500,
    'products.commission_rate must beat the config default, got ' || o2.commission_rate::text;
  ASSERT o2.amount_cents = 218000,
    'freight folds ONCE into the total, not once per unit (2*100000 + 18000), got '
      || o2.amount_cents::text;
  ASSERT o2.amount_cents - (o2.quantity * o2.unit_price_cents) = 18000,
    'and freight must be recoverable as the remainder — that is the contract '
    'create-checkout-session bills the Delivery line from';

  -- ═══ 5. immutable once paid ════════════════════════════════════════════
  UPDATE public.direct_orders SET status = 'paid', paid_at = NOW() WHERE id = o.id;

  BEGIN
    UPDATE public.direct_orders SET commission_rate = 0.9 WHERE id = o.id;
    ASSERT false, 'commission_rate must be frozen once paid';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.direct_orders SET designer_id = d2 WHERE id = o.id;
    ASSERT false, 'designer_id must be frozen once paid';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    -- this order's project_id is already NULL, so the freeze has to be probed
    -- with a real value: `SET x = NULL` where x IS NULL moves nothing.
    UPDATE public.direct_orders SET project_id = 'da020000-0000-4000-8000-0000000000a1' WHERE id = o.id;
    ASSERT false, 'project_id must be frozen once paid';
  EXCEPTION WHEN check_violation THEN NULL; END;

  -- everything else on a paid order still moves (the webhook stamps shipping)
  UPDATE public.direct_orders SET shipping = '{"name":"x"}'::jsonb WHERE id = o.id;

  -- ═══ 6. the settle credits once, and says so once ══════════════════════
  r := public.settle_direct_order_attribution(o.id);
  ASSERT (r->>'credited')::boolean, 'the first settle must credit';
  r := public.settle_direct_order_attribution(o.id);
  ASSERT NOT (r->>'credited')::boolean, 'a redelivered settle must credit nothing';

  SELECT count(*) INTO n FROM public.designer_earnings WHERE order_id = o.id;
  ASSERT n = 1, 'exactly one earnings row per order, got ' || n;

  SELECT gross_amount INTO n FROM public.designer_earnings WHERE order_id = o.id;
  -- 2 × 420000 × 0.16 — on the PIECE, never on freight (there is none here).
  ASSERT n = 134400, 'the credit is rate × product subtotal, got ' || n;

  SELECT count(*) INTO n FROM public.designer_earnings
   WHERE order_id = o.id AND source_type = 'product_commission' AND status = 'confirmed';
  ASSERT n = 1, 'source_type must be product_commission (00014:304 already lists it, so no CHECK '
    'migration was needed) and Stripe money lands ''confirmed'' like the invoice rail''s';

  -- a roster credit has no project, so no thread message is owed
  ASSERT NOT (public.settle_direct_order_attribution(o.id)->>'thread_message')::boolean,
    'a roster-attributed order posts no project message';

  -- the project-attributed order DOES post one, and only one
  PERFORM pg_temp.assume_user(cp);
  o := public.create_direct_order(p_ok, 1);
  UPDATE public.direct_orders SET status = 'paid', paid_at = NOW() WHERE id = o.id;
  r := public.settle_direct_order_attribution(o.id);
  ASSERT (r->>'thread_message')::boolean, 'a project-attributed settle must tell the designer';

  SELECT count(*) INTO n
    FROM public.comms_messages m
    JOIN public.comms_threads t ON t.id = m.thread_id
   WHERE t.project_id = o.project_id AND m.system AND m.body LIKE '%bought the%';
  ASSERT n = 1, 'exactly one purchase notice, got ' || n;

  SELECT m.body INTO v_body
    FROM public.comms_messages m
    JOIN public.comms_threads t ON t.id = m.thread_id
   WHERE t.project_id = o.project_id AND m.system AND m.body LIKE '%bought the%';
  ASSERT v_body = 'Project Client bought the DO Buyable Piece — $4,200.00, credited at the piece''s trade rate.',
    'the notice must read as direction B §5 wrote it, got: ' || v_body;

  r := public.settle_direct_order_attribution(o.id);
  ASSERT NOT (r->>'thread_message')::boolean, 'and it must not be repeated on redelivery';

  -- ═══ 7. an unpaid order settles nothing ════════════════════════════════
  PERFORM pg_temp.assume_user(cr);
  o := public.create_direct_order(p_ok, 1);
  r := public.settle_direct_order_attribution(o.id);
  ASSERT NOT (r->>'credited')::boolean,
    'a pending_payment order must never be credited — internal payable state is the truth';
END $$;

-- ─── 8. the terms RPC, and who may read it ─────────────────────────────────
DO $$
DECLARE
  v_paragraph TEXT; v_contact TEXT; v_enabled BOOLEAN; n int;
BEGIN
  SELECT count(*) INTO n FROM public.get_direct_order_terms();
  ASSERT n = 1, 'get_direct_order_terms returns exactly one row, got ' || n;

  SELECT responsibility_paragraph, contact, tax_shipping_enabled
    INTO v_paragraph, v_contact, v_enabled
    FROM public.get_direct_order_terms();

  ASSERT v_paragraph IS NOT NULL AND length(v_paragraph) > 40,
    'the responsibility paragraph must be real prose, not a stub';
  ASSERT v_contact IS NOT NULL AND v_contact <> 'support',
    'the contact must resolve to something — direction B §5 forbids the word "support"';
  ASSERT v_enabled = FALSE,
    'tax_shipping_enabled defaults FALSE, and while it is false the order sheet '
    'must read "Delivery and tax are not included yet" (critique M14)';

  ASSERT has_function_privilege('authenticated', 'public.get_direct_order_terms()', 'EXECUTE'),
    'a signed-in client must be able to read the terms she is about to agree to';
  ASSERT NOT has_function_privilege('anon', 'public.get_direct_order_terms()', 'EXECUTE'),
    'anon must not';
  ASSERT NOT has_function_privilege('anon', 'public.create_direct_order(uuid,integer)', 'EXECUTE'),
    'nor mint an order (00276:200)';
  ASSERT NOT has_function_privilege('authenticated', 'public.settle_direct_order_attribution(uuid)', 'EXECUTE'),
    'the settle RPC writes money and belongs to service_role alone';
  ASSERT has_function_privilege('service_role', 'public.settle_direct_order_attribution(uuid)', 'EXECUTE'),
    'and service_role must be able to call it';
END $$;

-- ─── 9. the earnings index is partial, and global to the column ────────────
DO $$
DECLARE v_def TEXT;
BEGIN
  SELECT indexdef INTO v_def FROM pg_indexes
   WHERE schemaname = 'public' AND indexname = 'uniq_designer_earnings_order';
  ASSERT v_def IS NOT NULL, 'the one-credit-per-order index must exist';
  ASSERT v_def LIKE '%UNIQUE%' AND v_def LIKE '%order_id IS NOT NULL%',
    'it must be UNIQUE and partial — every pre-existing row has a NULL order_id: ' || v_def;
END $$;

ROLLBACK;
