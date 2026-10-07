-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: Running a Job (US-19) — the walk fixtures the five-scenario gate needs.
--
-- Rulings Q8 make the five scenarios in
-- artifacts/document-running-a-job-2026-10-07/walk/WALK.md the acceptance
-- gate, and name two fixtures that must exist before anyone walks them; D6's
-- install reading needs every arrival-date state on a real paper. The local
-- seed had none of them: Chen's only sofa was already RECEIVED, nothing signed
-- carried a line on a PO, no job was held, and no not-here piece had an
-- arrival date in the past or the future.
--
--   1. Blocked PO + 2. change after signature — "Halloran House", a new
--      Project-stage job: a signed design-services agreement (the
--      AmendmentSheet's target) and a sofa on PO NA-2026-077, sent six days
--      ago and never acknowledged (the `po_unacknowledged` need, and the
--      ChangeOrderAct's target). A new job rather than an existing one: Chen,
--      Olsen and Aspen Loft Refresh are each pinned by an acceptance row or an
--      e2e spec whose band would change if a need landed on them.
--   3. Held job — "Harrow Road Flat", project status `on_hold`.
--   4. Arrival-date states (D6):
--        · Cedar Lane Study — the Reading chair keeps no PO and so no
--          confirmed_eta; one further piece (a picture light, ordered, no PO,
--          later in the Pieces order) is also not here, so the reading counts
--          the rest. Nothing else on Cedar Lane changes.
--        · "Wren Street Library" (install) — one piece whose confirmed_eta
--          passed five days ago and has not arrived.
--        · "Alder Court Bedroom" (install) — one piece arriving in two days.
--        · "Quill Lane Porch" (install) — every piece installed.
--
-- Chen Residence is read, never written: its sectional on WS-188, its overdue
-- balance and its lines stay exactly as procurement_workspace_dev.sql lays
-- them.
--
-- Idempotent: fixed UUIDs (prefix f1900000-…, US-19), ON CONFLICT DO NOTHING
-- for jobs, POs and payments, and NOT EXISTS for lines (see the note there).
-- The signing ceremony cannot be replayed, so it runs only when the agreement
-- does not exist yet. The two arrival dates are relative to
-- the day the file runs and are refreshed on every run, so "passed" and
-- "ahead" stay true on an old local database. Must run after
-- procurement_workspace_dev.sql (vendors) and the-client-page.sql (Cedar Lane).
-- Seed data only: no migration, never Strata.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  uid_designer   UUID := 'a0000000-0000-0000-0000-000000000004';  -- Leah Hartwell
  v_studio       UUID := 'b0000000-0000-0000-0000-000000000001';  -- Local Dev Studio
  v_cedar        UUID := 'b0000000-0000-0000-0000-00000000c0d1';  -- Cedar Lane Study

  v_halloran     UUID := 'f1900000-0000-4000-8000-000000000001';
  v_harrow       UUID := 'f1900000-0000-4000-8000-000000000002';
  v_wren         UUID := 'f1900000-0000-4000-8000-000000000003';
  v_alder        UUID := 'f1900000-0000-4000-8000-000000000004';
  v_quill        UUID := 'f1900000-0000-4000-8000-000000000005';

  v_hal_proposal UUID := 'f1900000-0000-4000-8000-000000000011';
  v_hal_document UUID := 'f1900000-0000-4000-8000-000000000012';
  v_hal_fa_proposal UUID := 'f1900000-0000-4000-8000-000000000013';
  v_hal_fa_document UUID := 'f1900000-0000-4000-8000-000000000014';
  v_hal_fa_snapshot UUID := 'f1900000-0000-4000-8000-000000000015';

  v_po_halloran  UUID := 'f1900000-0000-4000-8000-000000000021';
  v_po_wren      UUID := 'f1900000-0000-4000-8000-000000000023';
  v_po_alder     UUID := 'f1900000-0000-4000-8000-000000000024';

  v_line_sofa    UUID := 'f1900000-0000-4000-8000-000000000031';
  v_line_harrow  UUID := 'f1900000-0000-4000-8000-000000000032';
  v_line_wren    UUID := 'f1900000-0000-4000-8000-000000000033';
  v_line_alder   UUID := 'f1900000-0000-4000-8000-000000000034';
  v_line_quill   UUID := 'f1900000-0000-4000-8000-000000000035';
  v_line_cedar   UUID := 'f1900000-0000-4000-8000-000000000036';

  v_nordic       UUID;
  v_apparatus    UUID;
  v_woodward     UUID;
  v_ceramica     UUID;
  v_product_a    UUID;
  v_product_b    UUID;
  v_product_c    UUID;
  ts             TIMESTAMPTZ := NOW();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid_designer) THEN
    RAISE NOTICE 'running_a_job_walk_dev.sql: dev accounts are not seeded yet, skipping';
    RETURN;
  END IF;

  SELECT id INTO v_nordic    FROM public.vendors WHERE name ILIKE 'Nordic Atelier' ORDER BY id LIMIT 1;
  SELECT id INTO v_apparatus FROM public.vendors WHERE name ILIKE 'Apparatus%'     ORDER BY id LIMIT 1;
  SELECT id INTO v_woodward  FROM public.vendors WHERE name ILIKE 'Woodward%Sons'  ORDER BY id LIMIT 1;
  SELECT id INTO v_ceramica  FROM public.vendors WHERE name ILIKE 'Ceramica%'      ORDER BY id LIMIT 1;
  IF v_nordic IS NULL OR v_apparatus IS NULL OR v_woodward IS NULL OR v_ceramica IS NULL THEN
    RAISE NOTICE 'running_a_job_walk_dev.sql: demo vendors are not seeded yet, skipping';
    RETURN;
  END IF;

  -- A product behind every line, so no fixture adds an "unspecified" count.
  SELECT id INTO v_product_a FROM public.products
   WHERE images IS NOT NULL AND array_length(images, 1) > 0 ORDER BY id LIMIT 1 OFFSET 1;
  SELECT id INTO v_product_b FROM public.products
   WHERE images IS NOT NULL AND array_length(images, 1) > 0 ORDER BY id LIMIT 1 OFFSET 2;
  SELECT id INTO v_product_c FROM public.products
   WHERE images IS NOT NULL AND array_length(images, 1) > 0 ORDER BY id LIMIT 1 OFFSET 3;

  -- ── The five jobs ───────────────────────────────────────────────────────
  INSERT INTO public.projects (
    id, name, designer_id, created_by, studio_id, status, current_phase,
    budget_cents, start_date, notes, created_at, updated_at
  ) VALUES
    (v_halloran, 'Halloran House', uid_designer, uid_designer, v_studio,
     'active', NULL, 2400000, (ts - INTERVAL '70 days')::date,
     'Walk fixture (US-19): signed agreement; sofa PO sent, never acknowledged.',
     ts - INTERVAL '75 days', ts),
    (v_harrow, 'Harrow Road Flat', uid_designer, uid_designer, v_studio,
     'on_hold', NULL, 900000, (ts - INTERVAL '50 days')::date,
     'Walk fixture (US-19): held job.',
     ts - INTERVAL '55 days', ts),
    (v_wren, 'Wren Street Library', uid_designer, uid_designer, v_studio,
     'active', 'installation', 1100000, (ts - INTERVAL '90 days')::date,
     'Walk fixture (US-19): install week, one piece past its arrival date.',
     ts - INTERVAL '95 days', ts),
    (v_alder, 'Alder Court Bedroom', uid_designer, uid_designer, v_studio,
     'active', 'installation', 800000, (ts - INTERVAL '80 days')::date,
     'Walk fixture (US-19): install week, one piece arriving.',
     ts - INTERVAL '85 days', ts),
    (v_quill, 'Quill Lane Porch', uid_designer, uid_designer, v_studio,
     'active', 'installation', 600000, (ts - INTERVAL '60 days')::date,
     'Walk fixture (US-19): install week, everything here.',
     ts - INTERVAL '65 days', ts)
  ON CONFLICT (id) DO NOTHING;

  -- ── 1. Halloran House: the blocked PO ──────────────────────────────────
  -- Sent the way po-send sends (status stays draft, sent_at stamped), six days
  -- ago, and never acknowledged: document_state counts it in
  -- unacked_po_count, and the Desk raises `po_unacknowledged` —
  -- "NA-2026-077 sent — no acknowledgment" · Follow up with the maker.
  -- Payments sum to the total and the line's trade total equals it, so the PO
  -- is in sync if anyone resends it.
  INSERT INTO public.purchase_orders (
    id, designer_id, project_id, vendor_id, vendor_po_number,
    payment_pattern, total_cents, status, ack_state, sent_at, created_by,
    created_at
  ) VALUES (
    v_po_halloran, uid_designer, v_halloran, v_nordic, 'NA-2026-077',
    'fifty_fifty', 640000, 'draft', 'none', ts - INTERVAL '6 days', uid_designer,
    ts - INTERVAL '8 days'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.po_payments (id, purchase_order_id, kind, amount_cents, due_date, state, sort_order)
  VALUES
    ('f1900000-0000-4000-8000-000000000041', v_po_halloran, 'deposit', 320000, NULL, 'pending', 0),
    ('f1900000-0000-4000-8000-000000000042', v_po_halloran, 'balance', 320000, NULL, 'pending', 1)
  ON CONFLICT (id) DO NOTHING;

  -- ── 2. Halloran House: signed, and the sofa ordered under it ───────────
  -- A signed design-services agreement (the AmendmentSheet's target) and a
  -- signed furnishings authorization covering the sofa. On a commercial-origin
  -- job a line may sit on a PO only under an executed authorization
  -- (guard_project_ffe_purchase_authority), so the order is: the agreement,
  -- built as a draft and executed under the row-exact capability GUCs exactly
  -- as the-client-page.sql's Cedar Lane block does; the authorization; the
  -- sofa line; its snapshot; then the line is tied to the snapshot and the PO
  -- in one update. Only when absent: an executed instrument cannot be signed
  -- twice, and provenance is immutable once written.
  IF NOT EXISTS (SELECT 1 FROM public.proposals WHERE id = v_hal_proposal) THEN
    INSERT INTO public.proposals (
      id, project_id, designer_id, title, description,
      status, document_kind, commercial_state, total_amount, subtotal,
      sent_at, created_at, updated_at
    ) VALUES (
      v_hal_proposal, v_halloran, uid_designer,
      'Halloran House — Design Services',
      'The studio''s engagement for the living room and the front hall.',
      'draft', 'design_services', 'draft', 480000, 480000,
      ts - INTERVAL '68 days', ts - INTERVAL '70 days', ts - INTERVAL '68 days'
    );

    PERFORM set_config('app.proposal_accept_id', v_hal_proposal::text, true);
    PERFORM set_config('app.commercial_document_id', v_hal_proposal::text, true);
    UPDATE public.proposals
       SET status = 'accepted',
           commercial_state = 'executed',
           accepted_at = ts - INTERVAL '64 days',
           signed_at = ts - INTERVAL '64 days',
           signed_by_name = 'Margaret Halloran',
           updated_at = ts - INTERVAL '64 days'
     WHERE id = v_hal_proposal;
    PERFORM set_config('app.proposal_accept_id', '', true);
    PERFORM set_config('app.commercial_document_id', '', true);

    INSERT INTO public.project_commercial_documents (
      id, project_id, proposal_id, document_kind, wave_name,
      is_origin, bound_at, executed_at, created_by
    ) VALUES (
      v_hal_document, v_halloran, v_hal_proposal, 'design_services', NULL,
      TRUE, ts - INTERVAL '64 days', ts - INTERVAL '64 days', uid_designer
    );

    INSERT INTO public.proposals (
      id, project_id, designer_id, title, description,
      status, document_kind, commercial_state, total_amount, subtotal,
      sent_at, accepted_at, signed_at, signed_by_name, created_at, updated_at
    ) VALUES (
      v_hal_fa_proposal, v_halloran, uid_designer,
      'Halloran House — Authorization No. 1',
      'The living-room sofa, agreed and signed.',
      'accepted', 'furnishings_authorization', 'executed', 800000, 800000,
      ts - INTERVAL '24 days', ts - INTERVAL '20 days',
      ts - INTERVAL '20 days', 'Margaret Halloran',
      ts - INTERVAL '26 days', ts - INTERVAL '20 days'
    );

    INSERT INTO public.project_commercial_documents (
      id, project_id, proposal_id, document_kind, wave_name,
      is_origin, bound_at, executed_at, created_by
    ) VALUES (
      v_hal_fa_document, v_halloran, v_hal_fa_proposal, 'furnishings_authorization',
      'Authorization No. 1',
      FALSE, ts - INTERVAL '20 days', ts - INTERVAL '20 days', uid_designer
    );

    INSERT INTO public.project_ffe_items (
      id, project_id, product_id, name, ffe_category,
      item_type, status, quantity, unit_price_cents, trade_price_cents,
      markup_percent, line_total_cents, vendor_name, vendor_id, sort_order,
      design_disposition, created_at, updated_at
    ) VALUES (
      v_line_sofa, v_halloran, v_product_a,
      'Linen slipcovered sofa — 96 in', 'seating',
      'fixed', 'approved', 1, 800000, 640000,
      25.00, 800000, 'Nordic Atelier', v_nordic, 0,
      'selected', ts - INTERVAL '30 days', ts - INTERVAL '20 days'
    );

    INSERT INTO public.furnishing_authorization_items (
      id, commercial_document_id, source_ffe_item_id, product_id,
      name, category, item_type, quantity,
      client_unit_price_cents, client_line_total_cents,
      trade_unit_cost_cents, markup_percent, sort_order, created_at
    ) VALUES (
      v_hal_fa_snapshot, v_hal_fa_document, v_line_sofa, v_product_a,
      'Linen slipcovered sofa — 96 in', 'seating', 'fixed', 1,
      800000, 800000,
      640000, 25.00, 0, ts - INTERVAL '20 days'
    );

    -- Linking a line to a PO is refused without a caller
    -- (lock_configuration_snapshot_on_po_link); the seed acts as service_role
    -- for this one statement, as the server-side order path does, and clears
    -- the claim straight after.
    PERFORM set_config('request.jwt.claims', '{"role":"service_role"}', true);
    UPDATE public.project_ffe_items
       SET source_commercial_document_id = v_hal_fa_document,
           source_authorization_item_id  = v_hal_fa_snapshot,
           purchase_order_id             = v_po_halloran,
           status                        = 'ordered'
     WHERE id = v_line_sofa;
    PERFORM set_config('request.jwt.claims', '', true);
  END IF;

  -- ── 4. Arrival-date POs (D6) ───────────────────────────────────────────
  -- Sent and acknowledged, so neither raises a PO need; the confirmed_eta is
  -- the only thing each fixture is about. Refreshed on every run.
  INSERT INTO public.purchase_orders (
    id, designer_id, project_id, vendor_id, vendor_po_number, confirmed_eta,
    payment_pattern, total_cents, status, ack_state, sent_at, acknowledged_at,
    created_by, created_at
  ) VALUES
    (v_po_wren, uid_designer, v_wren, v_woodward, 'WS-214', CURRENT_DATE - 5,
     'net_30', 420000, 'in_production', 'clean',
     ts - INTERVAL '60 days', ts - INTERVAL '58 days', uid_designer, ts - INTERVAL '61 days'),
    (v_po_alder, uid_designer, v_alder, v_ceramica, 'CER-0061', CURRENT_DATE + 2,
     'full_upfront', 96000, 'shipped', 'clean',
     ts - INTERVAL '40 days', ts - INTERVAL '39 days', uid_designer, ts - INTERVAL '41 days')
  ON CONFLICT (id) DO UPDATE SET confirmed_eta = EXCLUDED.confirmed_eta;

  INSERT INTO public.po_payments (id, purchase_order_id, kind, amount_cents, due_date, paid_date, state, sort_order)
  VALUES
    ('f1900000-0000-4000-8000-000000000043', v_po_wren,  'balance', 420000, NULL, NULL, 'pending', 0),
    ('f1900000-0000-4000-8000-000000000044', v_po_alder, 'deposit', 96000,
     (ts - INTERVAL '40 days')::date, (ts - INTERVAL '40 days')::date, 'paid', 0)
  ON CONFLICT (id) DO NOTHING;

  -- ── The lines ──────────────────────────────────────────────────────────
  INSERT INTO public.project_ffe_items (
    id, project_id, product_id, purchase_order_id, name, ffe_category,
    item_type, status, quantity, received_quantity,
    unit_price_cents, trade_price_cents, markup_percent, line_total_cents,
    vendor_name, vendor_id, sort_order, design_disposition, installed_on,
    created_at, updated_at
  )
  -- NOT EXISTS, not ON CONFLICT: the selection-thread trigger opens a thread
  -- for every row it sees BEFORE INSERT, so a row that then conflicts would
  -- leave an orphan thread behind on every re-run.
  SELECT v.* FROM (VALUES
    -- 3: one ordinary line, so the held job has a body.
    (v_line_harrow, v_harrow, v_product_b, NULL,
     'Pair of rattan lounge chairs', 'seating',
     'fixed', 'approved', 2, NULL, 210000, 168000, 25.00, 420000,
     'Ceramica Studio', v_ceramica, 0, 'selected', NULL,
     ts - INTERVAL '40 days', ts - INTERVAL '30 days'),
    -- 4: confirmed_eta passed, not here.
    (v_line_wren, v_wren, v_product_a, v_po_wren,
     'Library ladder and rail, walnut', 'millwork',
     'fixed', 'production', 1, NULL, 504000, 420000, 20.00, 504000,
     'Woodward & Sons', v_woodward, 0, 'selected', NULL,
     ts - INTERVAL '62 days', ts - INTERVAL '20 days'),
    -- 4: confirmed_eta ahead, not here.
    (v_line_alder, v_alder, v_product_b, v_po_alder,
     'Pair of stoneware bedside lamps', 'lighting',
     'fixed', 'shipped', 2, NULL, 60000, 48000, 25.00, 120000,
     'Ceramica Studio', v_ceramica, 0, 'selected', NULL,
     ts - INTERVAL '42 days', ts - INTERVAL '3 days'),
    -- 4: everything here.
    (v_line_quill, v_quill, v_product_c, NULL,
     'Teak porch bench', 'seating',
     'fixed', 'installed', 1, 1, 260000, 208000, 25.00, 260000,
     'Sawkille Co', NULL, 0, 'selected', (ts - INTERVAL '2 days')::date,
     ts - INTERVAL '50 days', ts - INTERVAL '2 days')
  ) AS v (
    id, project_id, product_id, purchase_order_id, name, ffe_category,
    item_type, status, quantity, received_quantity,
    unit_price_cents, trade_price_cents, markup_percent, line_total_cents,
    vendor_name, vendor_id, sort_order, design_disposition, installed_on,
    created_at, updated_at
  )
  WHERE NOT EXISTS (SELECT 1 FROM public.project_ffe_items f WHERE f.id = v.id);

  -- 4: Cedar Lane's further not-here piece. After the Reading chair (0) and
  -- the shelving (1) in the Pieces order, no PO and no arrival date. The
  -- Reading chair itself is not touched.
  IF EXISTS (SELECT 1 FROM public.project_ffe_items WHERE id = v_line_cedar) THEN
    NULL;  -- already laid; see the NOT EXISTS note above
  ELSIF EXISTS (SELECT 1 FROM public.projects WHERE id = v_cedar) THEN
    INSERT INTO public.project_ffe_items (
      id, project_id, product_id, name, ffe_category,
      item_type, status, quantity, unit_price_cents, trade_price_cents,
      markup_percent, line_total_cents, vendor_name, vendor_id, sort_order,
      design_disposition, created_at, updated_at
    ) VALUES (
      v_line_cedar, v_cedar, v_product_c,
      'Brass picture light, 24 in', 'lighting',
      'fixed', 'ordered', 1, 84000, 64600,
      30.00, 84000, 'Apparatus', v_apparatus, 2,
      'selected', ts - INTERVAL '20 days', ts - INTERVAL '6 days'
    );
  ELSE
    RAISE NOTICE 'running_a_job_walk_dev.sql: Cedar Lane Study is not seeded, skipping its extra piece';
  END IF;
END $$;
