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
--          the rest. A maker-less Side table (no vendor, no PO, no brand;
--          506-1) leads the Pieces order, so R37's held form is walkable.
--          Nothing else on Cedar Lane changes.
--        · "Wren Street Library" (install) — one piece whose confirmed_eta
--          passed five days ago and has not arrived.
--        · "Alder Court Bedroom" (install) — one piece arriving in two days.
--        · "Quill Lane Porch" (install) — every piece installed.
--   5. A named client (499-1) — "Tanaka Garden Flat — Living Room", a
--      proposal sent to a new login, Mei Tanaka, never opened, two decisions
--      overdue. See the block near the foot of the file.
--   6. Release lands on the lift (F6-2) — "Ashby Mews"; and
--   7. Answer the maker — "Fenwick Lodge" (both F7-12). See that block.
--   8. A sent proposal with no login (F8-9 a) — "Okafor Terrace — Study"; and
--   9. Two silences and a held follow-up (F8-9 b) — "Birchwood Row". See the
--      last block, which names their walk steps.
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

-- ═══════════════════════════════════════════════════════════════════════════
-- F3-13 (design-review-3.md §3): the no-login household titles never printed
-- the ' (no-login household)' parenthetical again once designer-clients.sql
-- stopped seeding it, but a local database seeded before that change still
-- carries the old suffix on the two fixed rows it created (dc_discovery
-- 'The Ashfords (no-login household)', dc_direction 'Elena Marlowe (no-login
-- household)'). This repairs an existing database without a reset.
-- Idempotent: regexp_replace is a no-op once the suffix is gone.
-- ═══════════════════════════════════════════════════════════════════════════
UPDATE public.designer_clients
   SET client_name = regexp_replace(client_name, ' \(no-login household\)$', '')
 WHERE id IN (
   'd0c10000-0000-0000-0000-0000000000a2',  -- The Ashfords (Discovery)
   'd0c10000-0000-0000-0000-0000000000b1'   -- Elena Marlowe (Direction)
 )
   AND client_name LIKE '%(no-login household)';

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
  v_line_side    UUID := 'f1900000-0000-4000-8000-000000000037';

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

  -- 506-1: Cedar Lane's maker-less piece, so R37's held form is walkable: no
  -- vendor, no PO (so no PO vendor) and no product (so no brand). First in the
  -- Pieces order (sort 0, laid before the chair), so the install reading names
  -- it. The Reading chair is not touched and stays un-held.
  INSERT INTO public.project_ffe_items (
    id, project_id, product_id, purchase_order_id, name, ffe_category,
    item_type, status, quantity, vendor_name, vendor_id, sort_order,
    design_disposition, created_at, updated_at
  )
  SELECT
    v_line_side, v_cedar, NULL, NULL, 'Side table', 'furniture',
    'fixed', 'approved', 1, NULL, NULL, 0,
    'selected', ts - INTERVAL '40 days', ts - INTERVAL '6 days'
  WHERE EXISTS (SELECT 1 FROM public.projects WHERE id = v_cedar)
    AND NOT EXISTS (SELECT 1 FROM public.project_ffe_items WHERE id = v_line_side);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. A named client on a live paper (499-1, design-review-4 §1, SQ-534).
--
-- The placeholder guard is proven only when a real first name reaches the
-- paper. Aspen's client is the shared `Client User` profile, which the guard
-- rightly prints as "the client", and the profile is pinned by the
-- workflow-gate fixture and the client-portal specs, so Aspen is left alone.
-- This lays one new proposal paper in Aspen's state instead: sent, not yet
-- opened, two decisions overdue. Its client is a new login, Mei Tanaka, so
-- the paper prints `Nudge Mei` and `Waiting on Mei`.
--
--   Proposal: f1900000-0000-4000-8000-000000000053 (/doc/<id>)
--
-- Local dev only. The login follows dev-accounts.sql (password123); the
-- profile UPSERTs past the handle_new_user stub. Fixed UUIDs and ON CONFLICT
-- or NOT EXISTS throughout; the proposal is sent only when first laid,
-- because an issued proposal is immutable (00390).
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  uid_designer UUID := 'a0000000-0000-0000-0000-000000000004';  -- Leah Hartwell
  uid_mei      UUID := 'f1900000-0000-4000-8000-000000000051';  -- Mei Tanaka
  v_dc_mei     UUID := 'f1900000-0000-4000-8000-000000000052';
  v_proposal   UUID := 'f1900000-0000-4000-8000-000000000053';
  v_dec_a      UUID := 'f1900000-0000-4000-8000-000000000054';
  v_dec_b      UUID := 'f1900000-0000-4000-8000-000000000055';
  ts           TIMESTAMPTZ := NOW();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid_designer) THEN
    RAISE NOTICE 'running_a_job_walk_dev.sql: dev accounts are not seeded yet, skipping the named client';
    RETURN;
  END IF;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', uid_mei, 'authenticated', 'authenticated',
    'mei.tanaka@patina.dev', extensions.crypt('password123', extensions.gen_salt('bf')), ts,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Mei Tanaka"}'::jsonb,
    ts, ts, '', '', '', ''
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), uid_mei, uid_mei::text,
    jsonb_build_object('sub', uid_mei::text, 'email', 'mei.tanaka@patina.dev'),
    'email', ts, ts, ts
  ) ON CONFLICT ON CONSTRAINT identities_provider_id_provider_unique DO NOTHING;

  INSERT INTO public.profiles (id, email, full_name, display_name, role, created_at, updated_at)
  VALUES (uid_mei, 'mei.tanaka@patina.dev', 'Mei Tanaka', 'Mei Tanaka', 'homeowner', ts, ts)
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role;

  INSERT INTO public.user_roles (user_id, role_id)
  SELECT uid_mei, id FROM public.roles WHERE name IN ('client', 'app_user')
  ON CONFLICT (user_id, role_id) DO NOTHING;

  INSERT INTO public.designer_clients (
    id, designer_id, client_id, status, client_name, client_email, source,
    created_at, updated_at
  )
  SELECT v_dc_mei, uid_designer, uid_mei, 'proposal',
         'Mei Tanaka', 'mei.tanaka@patina.dev', 'manual',
         ts - INTERVAL '30 days', ts - INTERVAL '30 days'
  WHERE NOT EXISTS (SELECT 1 FROM public.designer_clients WHERE id = v_dc_mei);

  -- Built as a draft, then sent under the send capability GUC exactly as
  -- proposals.sql sends Aspen's. Never opened: viewed_at stays NULL.
  IF NOT EXISTS (SELECT 1 FROM public.proposals WHERE id = v_proposal) THEN
    INSERT INTO public.proposals (
      id, designer_id, client_id, designer_client_id, title, description,
      status, subtotal, total_amount, valid_until, personal_message,
      created_at, updated_at, version
    ) VALUES (
      v_proposal, uid_designer, uid_mei, v_dc_mei,
      'Tanaka Garden Flat — Living Room',
      'Walk fixture (US-19, 499-1): sent, not yet opened, two decisions overdue.',
      'draft', 1240000, 1240000, (ts + INTERVAL '10 days'),
      'Here is the living room as we talked it through. Two picks are waiting on you.',
      ts - INTERVAL '6 days', ts - INTERVAL '6 days', 1
    );

    INSERT INTO public.proposal_sections (proposal_id, type, title, body, sort_order, metadata)
    VALUES
      (v_proposal, 'vision', 'Design Vision',
       'A calm garden-facing room: pale oak, undyed linen and one deep green.',
       0, '{}'::jsonb),
      (v_proposal, 'selections', 'Product Selections', NULL, 1, '{}'::jsonb),
      (v_proposal, 'investment', 'Investment', NULL, 2, '{}'::jsonb);

    INSERT INTO public.proposal_items (
      proposal_id, name, description, quantity,
      unit_price, unit_sell_price, line_total_cents, vendor_name, position
    ) VALUES
      (v_proposal, 'Oak daybed', 'Rift oak frame, undyed linen cushion', 1,
       780000, 780000, 780000, 'Nordic Atelier', 0),
      (v_proposal, 'Wool flatweave rug', '8x10, moss and oat', 1,
       460000, 460000, 460000, 'Studio Piet', 1);

    PERFORM set_config('app.proposal_send_id', v_proposal::text, true);
    UPDATE public.proposals
       SET status = 'sent',
           sent_at = ts - INTERVAL '4 days',
           updated_at = ts - INTERVAL '4 days'
     WHERE id = v_proposal AND status = 'draft';
    PERFORM set_config('app.proposal_send_id', '', true);
  END IF;

  -- Two decisions on the proposal, both past due (document_state counts them
  -- through linked_proposal_id). The dates are fixed in the past at first
  -- run, so "overdue" stays true on an old local database.
  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, project_id, linked_proposal_id,
    title, context, due_date, linked_phase,
    decision_type, blocking_status, status, sent_at
  ) VALUES
    (v_dec_a, v_dc_mei, uid_designer, NULL, v_proposal,
     'Daybed cushion — undyed linen vs moss wool',
     'The linen is softer; the wool wears better against the garden door.',
     ts - INTERVAL '3 days', 'Concept', 'material', 'non_blocking', 'pending',
     ts - INTERVAL '4 days'),
    (v_dec_b, v_dc_mei, uid_designer, NULL, v_proposal,
     'Rug size — 8x10 vs 9x12',
     '9x12 runs under the daybed; 8x10 keeps the oak floor showing.',
     ts - INTERVAL '2 days', 'Concept', 'layout', 'non_blocking', 'pending',
     ts - INTERVAL '4 days')
  ON CONFLICT (id) DO NOTHING;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6 + 7. Two walk fixtures (F7-12, design-review-7.md §1 F6-2 row, §2).
--
-- The FR6 re-walk could not reach either step: no seeded paper rendered
-- `[data-release-lift]` (release-scan.json: 0 of 25), and no paper carried
-- an acknowledgment that differs. These are the walk steps they serve:
--
--   6. "Release lands on the lift" (F6-2) — "Ashby Mews", a Project paper.
--      Under the `worktable` flag a project-section paper composes the
--      Delivery table in its procurement setting (deriveTableComposition), so
--      page.tsx passes `releaseLeaderElsewhere`; FFESection reports
--      `releaseOffered` when get_project_authority_summary's state is active,
--      retainer_pending or exhausted (canRelease) and one line is eligible
--      (authorization-derivation `eligibility`: selected, not blocked,
--      get_project_ffe_readiness ready, on no authorization, priced). Then the
--      Pieces head prints no Release and the lift renders above the table.
--      The fixture: an executed design-services agreement (the origin), an
--      active billing authority on it (immediate, uncapped), and one priced
--      line with a vendor and a product on no authorization and no PO.
--        Doc: f1900000-0000-4000-8000-000000000061 (/doc/<id>)
--
--   7. "Answer the maker" — "Fenwick Lodge", a Project paper with no
--      agreement behind it. PO WS-231 sent, and the maker's acknowledgment
--      (the 00705 v2 record) lists a different unit price for the table: one
--      `mismatch` ack line, so the PO's ack_state syncs to `discrepancy`; the
--      PO's open `ack_discrepancy` exception; and its `ack_discrepancy_reply`
--      draft in `awaiting_review`. The rows are the ones
--      log_po_acknowledgment_v2 and compose_ack_discrepancy_draft write, laid
--      with fixed ids. The Desk read (use-desk-engagements → needDraftReview)
--      raises the `ack_discrepancy` need from the draft, and one-voice labels
--      its act `Answer the maker`.
--        Doc: f1900000-0000-4000-8000-000000000071 (/doc/<id>)
--
-- Nothing sends: the draft waits for a member's review. Local dev only; fixed
-- UUIDs with ON CONFLICT DO NOTHING or NOT EXISTS; the agreement is executed
-- only when first laid (an executed instrument cannot be signed twice).
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  uid_designer   UUID := 'a0000000-0000-0000-0000-000000000004';  -- Leah Hartwell
  v_studio       UUID := 'b0000000-0000-0000-0000-000000000001';  -- Local Dev Studio

  v_ashby        UUID := 'f1900000-0000-4000-8000-000000000061';
  v_ash_proposal UUID := 'f1900000-0000-4000-8000-000000000062';
  v_ash_document UUID := 'f1900000-0000-4000-8000-000000000063';
  v_ash_authority UUID := 'f1900000-0000-4000-8000-000000000064';
  v_line_ashby   UUID := 'f1900000-0000-4000-8000-000000000065';

  v_fenwick      UUID := 'f1900000-0000-4000-8000-000000000071';
  v_po_fenwick   UUID := 'f1900000-0000-4000-8000-000000000072';
  v_line_fenwick UUID := 'f1900000-0000-4000-8000-000000000073';
  v_ack_fenwick  UUID := 'f1900000-0000-4000-8000-000000000074';
  v_ack_line     UUID := 'f1900000-0000-4000-8000-000000000075';
  v_exc_fenwick  UUID := 'f1900000-0000-4000-8000-000000000076';
  v_draft_fenwick UUID := 'f1900000-0000-4000-8000-000000000077';

  v_nordic       UUID;
  v_woodward     UUID;
  v_product_a    UUID;
  v_product_b    UUID;
  v_org          UUID;
  v_po           public.purchase_orders%ROWTYPE;
  v_received     DATE;
  ts             TIMESTAMPTZ := NOW();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid_designer) THEN
    RAISE NOTICE 'running_a_job_walk_dev.sql: dev accounts are not seeded yet, skipping the F7-12 fixtures';
    RETURN;
  END IF;

  SELECT id INTO v_nordic   FROM public.vendors WHERE name ILIKE 'Nordic Atelier' ORDER BY id LIMIT 1;
  SELECT id INTO v_woodward FROM public.vendors WHERE name ILIKE 'Woodward%Sons'  ORDER BY id LIMIT 1;
  IF v_nordic IS NULL OR v_woodward IS NULL THEN
    RAISE NOTICE 'running_a_job_walk_dev.sql: demo vendors are not seeded yet, skipping the F7-12 fixtures';
    RETURN;
  END IF;

  SELECT id INTO v_product_a FROM public.products
   WHERE images IS NOT NULL AND array_length(images, 1) > 0 ORDER BY id LIMIT 1 OFFSET 4;
  SELECT id INTO v_product_b FROM public.products
   WHERE images IS NOT NULL AND array_length(images, 1) > 0 ORDER BY id LIMIT 1 OFFSET 5;

  INSERT INTO public.projects (
    id, name, designer_id, created_by, studio_id, status, current_phase,
    budget_cents, start_date, notes, created_at, updated_at
  ) VALUES
    (v_ashby, 'Ashby Mews', uid_designer, uid_designer, v_studio,
     'active', NULL, 1800000, (ts - INTERVAL '40 days')::date,
     'Walk fixture (US-19, F7-12): signed agreement, active authority, one line ready to release.',
     ts - INTERVAL '45 days', ts),
    (v_fenwick, 'Fenwick Lodge', uid_designer, uid_designer, v_studio,
     'active', NULL, 1200000, (ts - INTERVAL '35 days')::date,
     'Walk fixture (US-19, F7-12): PO acknowledged with a different unit price; reply drafted.',
     ts - INTERVAL '40 days', ts)
  ON CONFLICT (id) DO NOTHING;

  -- ── 6. Ashby Mews: the authority to release against ────────────────────
  -- The agreement is built as a draft and executed under the row-exact
  -- capability GUCs, exactly as Halloran House's is above.
  IF NOT EXISTS (SELECT 1 FROM public.proposals WHERE id = v_ash_proposal) THEN
    INSERT INTO public.proposals (
      id, project_id, designer_id, title, description,
      status, document_kind, commercial_state, total_amount, subtotal,
      sent_at, created_at, updated_at
    ) VALUES (
      v_ash_proposal, v_ashby, uid_designer,
      'Ashby Mews — Design Services',
      'The studio''s engagement for the dining room.',
      'draft', 'design_services', 'draft', 360000, 360000,
      ts - INTERVAL '38 days', ts - INTERVAL '40 days', ts - INTERVAL '38 days'
    );

    PERFORM set_config('app.proposal_accept_id', v_ash_proposal::text, true);
    PERFORM set_config('app.commercial_document_id', v_ash_proposal::text, true);
    UPDATE public.proposals
       SET status = 'accepted',
           commercial_state = 'executed',
           accepted_at = ts - INTERVAL '34 days',
           signed_at = ts - INTERVAL '34 days',
           signed_by_name = 'Clare Ashby',
           updated_at = ts - INTERVAL '34 days'
     WHERE id = v_ash_proposal;
    PERFORM set_config('app.proposal_accept_id', '', true);
    PERFORM set_config('app.commercial_document_id', '', true);

    INSERT INTO public.project_commercial_documents (
      id, project_id, proposal_id, document_kind, wave_name,
      is_origin, bound_at, executed_at, created_by
    ) VALUES (
      v_ash_document, v_ashby, v_ash_proposal, 'design_services', NULL,
      TRUE, ts - INTERVAL '34 days', ts - INTERVAL '34 days', uid_designer
    );
  END IF;

  -- Active from signature: immediate activation, no ceiling, so
  -- get_project_authority_summary reads `active`.
  INSERT INTO public.project_billing_authorities (
    id, project_id, commercial_document_id, source_proposal_id,
    billing_ceiling_cents, retainer_amount_cents, retainer_activation_policy,
    billing_cadence, effective_at, status, created_at
  ) VALUES (
    v_ash_authority, v_ashby, v_ash_document, v_ash_proposal,
    NULL, 0, 'immediate',
    'monthly', ts - INTERVAL '34 days', 'active', ts - INTERVAL '34 days'
  ) ON CONFLICT (id) DO NOTHING;

  -- One line that can join a release: selected, a vendor, quantity 1, priced
  -- (line total = quantity × unit price, so readiness is clean), and on no
  -- authorization and no PO. NOT EXISTS for the selection-thread reason above.
  INSERT INTO public.project_ffe_items (
    id, project_id, product_id, name, ffe_category,
    item_type, status, quantity, unit_price_cents, trade_price_cents,
    markup_percent, line_total_cents, vendor_name, vendor_id, sort_order,
    design_disposition, created_at, updated_at
  )
  SELECT
    v_line_ashby, v_ashby, v_product_a,
    'Walnut extending dining table — 96 in', 'furniture',
    'fixed', 'approved', 1, 720000, 576000,
    25.00, 720000, 'Nordic Atelier', v_nordic, 0,
    'selected', ts - INTERVAL '20 days', ts - INTERVAL '10 days'
  WHERE NOT EXISTS (SELECT 1 FROM public.project_ffe_items WHERE id = v_line_ashby);

  -- ── 7. Fenwick Lodge: an acknowledgment that differs ───────────────────
  -- Sent nine days ago; the acknowledgment came back two days ago, so the PO
  -- is confirmed and stamped acknowledged (log_po_acknowledgment_v2's v1
  -- stamps) and raises no `po_unacknowledged`. ack_state is left to
  -- po_ack_state_sync, which sets it from the ack line below.
  INSERT INTO public.purchase_orders (
    id, designer_id, project_id, vendor_id, vendor_po_number,
    payment_pattern, total_cents, status, ack_state, sent_at, acknowledged_at,
    created_by, created_at
  ) VALUES (
    v_po_fenwick, uid_designer, v_fenwick, v_woodward, 'WS-231',
    'net_30', 380000, 'confirmed', 'none', ts - INTERVAL '9 days', ts - INTERVAL '2 days',
    uid_designer, ts - INTERVAL '10 days'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.po_payments (id, purchase_order_id, kind, amount_cents, due_date, state, sort_order)
  VALUES ('f1900000-0000-4000-8000-000000000078', v_po_fenwick, 'balance', 380000, NULL, 'pending', 0)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.project_ffe_items (
    id, project_id, product_id, purchase_order_id, name, ffe_category,
    item_type, status, quantity, unit_price_cents, trade_price_cents,
    markup_percent, line_total_cents, vendor_name, vendor_id, sort_order,
    design_disposition, created_at, updated_at
  )
  SELECT
    v_line_fenwick, v_fenwick, v_product_b, v_po_fenwick,
    'Oak trestle table — 84 in', 'furniture',
    'fixed', 'ordered', 1, 475000, 380000,
    25.00, 475000, 'Woodward & Sons', v_woodward, 0,
    'selected', ts - INTERVAL '25 days', ts - INTERVAL '9 days'
  WHERE NOT EXISTS (SELECT 1 FROM public.project_ffe_items WHERE id = v_line_fenwick);

  -- The acknowledgment, its one differing line, the exception and the draft
  -- are laid together, once: a walker who answers the maker resolves them,
  -- and a re-run leaves that answer standing.
  IF NOT EXISTS (SELECT 1 FROM public.po_acknowledgments WHERE id = v_ack_fenwick) THEN
    SELECT * INTO v_po FROM public.purchase_orders WHERE id = v_po_fenwick;
    v_org := public.purchase_order_studio_id(v_po_fenwick);
    v_received := (ts - INTERVAL '2 days')::date;

    INSERT INTO public.po_acknowledgments (
      id, organization_id, purchase_order_id, received_on, received_via,
      vendor_order_ref, recorded_by, created_at
    ) VALUES (
      v_ack_fenwick, v_org, v_po_fenwick, v_received, 'email',
      'WS-231', uid_designer, ts - INTERVAL '2 days'
    );

    -- The PO's trade unit price is 380000; the maker's acknowledgment says
    -- 412000.
    INSERT INTO public.po_ack_lines (
      id, ack_id, ffe_item_id, field, po_value, ack_value, verdict, created_at
    ) VALUES (
      v_ack_line, v_ack_fenwick, v_line_fenwick, 'unit_price', '380000', '412000',
      'mismatch', ts - INTERVAL '2 days'
    );

    -- d2 §M7's clock, as log_po_acknowledgment_v2 sets it.
    INSERT INTO public.procurement_exceptions (
      id, organization_id, project_id, type, purchase_order_id, acknowledgment_id,
      status, opened_at, opened_by, clock_due_on, clock_basis, created_at
    ) VALUES (
      v_exc_fenwick, v_org, v_fenwick, 'ack_discrepancy', v_po_fenwick, v_ack_fenwick,
      'open', ts - INTERVAL '2 days', uid_designer,
      v_received + CASE extract(isodow FROM v_received)::integer
                     WHEN 4 THEN 4 WHEN 5 THEN 4 WHEN 6 THEN 3 ELSE 2 END,
      'Answer the vendor within 2 business days of the acknowledgment, before production starts.',
      ts - INTERVAL '2 days'
    );

    -- The letter compose_ack_discrepancy_draft writes for one difference.
    INSERT INTO public.procurement_drafts (
      id, organization_id, project_id, kind, purchase_order_id, exception_id, ack_id,
      to_email, subject, body, status, created_at, updated_at
    ) VALUES (
      v_draft_fenwick, v_org, v_fenwick, 'ack_discrepancy_reply', v_po_fenwick,
      v_exc_fenwick, v_ack_fenwick,
      public._procurement_vendor_email(v_org, v_woodward),
      format('PO %s: your acknowledgment differs from our order', public._procurement_po_label(v_po)),
      format(E'Hello %s,\n\nThank you for acknowledging PO %s (your order %s). It differs from our purchase order in one place:\n\n- %s: your acknowledgment lists a unit price of "%s"; our PO specifies "%s".\n\nPlease confirm our PO values before production, or tell us what cannot be met.\n\nThank you,\n%s',
        'Woodward & Sons', public._procurement_po_label(v_po), 'WS-231',
        'Oak trestle table — 84 in',
        to_char(4120.00, 'FM$999,999,990.00'), to_char(3800.00, 'FM$999,999,990.00'),
        public._procurement_signoff(v_org, v_fenwick)),
      'awaiting_review', ts - INTERVAL '2 days', ts - INTERVAL '2 days'
    );
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8 + 9. Two walk fixtures (F8-9, design-review-8.md §1 N1 and the F7-1/F7-5
-- N/A row, §2).
--
-- The final walk could not reach F7-3's no-login legs (Tanaka has a login on
-- local), and no paper carried two unacknowledged POs (F7-1) or a
-- `maker_follow_up` draft (F7-5). These are the walk steps they serve, as
-- `designer@patina.dev`, flags `ask-the-paper` + `one-voice` on:
--
--   8. "A sent proposal with no login" (F7-3) — "Okafor Terrace — Study", sent
--      three days ago to Adaeze Okafor, a household with no login
--      (designer_clients.client_id NULL, an email on file), never opened,
--      reminded once yesterday.
--        Doc: f1900000-0000-4000-8000-000000000082 (/doc/<id>)
--      a. Open the paper: the band reads `PROPOSAL · Okafor Terrace` /
--         `Reminder sent {yesterday}.` and offers no act (Message is held
--         without a login; the reminder is inside its 3-day cooldown).
--      b. The Desk card reads `Send a reminder`.
--      c. Put the reminder outside its cooldown (the nudge guard admits the
--         change only under its row-exact GUC):
--           psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c "BEGIN; SELECT set_config('app.proposal_nudge_id', 'f1900000-0000-4000-8000-000000000082', true); UPDATE public.proposals SET last_nudged_at = now() - interval '4 days' WHERE id = 'f1900000-0000-4000-8000-000000000082'; COMMIT;"
--         Reload: the band reads `Sent {day} — not yet opened ·
--         SEND A REMINDER`, landing on `#document-act-proposal-reminder`.
--         Do not press Send. Restore by re-running this file, which sets the
--         reminder back to yesterday on every run.
--
--   9. "Two silences and a held follow-up" (F7-1, F7-5) — "Birchwood Row", a
--      Project paper with two POs sent and never acknowledged: BR-2026-031
--      (Apparatus, seven days ago) and BR-2026-032 (Ceramica Studio, five days
--      ago), one line each; and a `maker_follow_up` note held in
--      `awaiting_review` on 031's line (kind from 00728).
--        Doc: f1900000-0000-4000-8000-000000000091 (/doc/<id>)
--      a. Open Standing: it holds two silences.
--      b. 031's reads `Open the held draft` and opens the note on the line's
--         Movement cell; the DraftReview head reads `Follow-up to the maker`.
--         Do not press Send.
--      c. 032's reads `Follow up with the maker`.
--
-- Nothing sends: the proposal's send and nudge are laid as rows, and the note
-- waits for a member's review. Local dev only; fixed UUIDs
-- f1900000-…-0000000000{81…99} with ON CONFLICT DO NOTHING or NOT EXISTS;
-- the proposal is sent only when first laid (an issued proposal is immutable,
-- 00390). Must run after procurement_workspace_dev.sql (vendors).
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  uid_designer   UUID := 'a0000000-0000-0000-0000-000000000004';  -- Leah Hartwell
  v_studio       UUID := 'b0000000-0000-0000-0000-000000000001';  -- Local Dev Studio

  v_dc_okafor    UUID := 'f1900000-0000-4000-8000-000000000081';
  v_okafor       UUID := 'f1900000-0000-4000-8000-000000000082';

  v_birchwood    UUID := 'f1900000-0000-4000-8000-000000000091';
  v_po_031       UUID := 'f1900000-0000-4000-8000-000000000092';
  v_po_032       UUID := 'f1900000-0000-4000-8000-000000000093';
  v_line_031     UUID := 'f1900000-0000-4000-8000-000000000094';
  v_line_032     UUID := 'f1900000-0000-4000-8000-000000000095';
  v_draft_031    UUID := 'f1900000-0000-4000-8000-000000000098';

  v_apparatus    UUID;
  v_ceramica     UUID;
  v_product_a    UUID;
  v_product_b    UUID;
  v_org          UUID;
  ts             TIMESTAMPTZ := NOW();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid_designer) THEN
    RAISE NOTICE 'running_a_job_walk_dev.sql: dev accounts are not seeded yet, skipping the F8-9 fixtures';
    RETURN;
  END IF;

  -- ── 8. Okafor Terrace: a sent proposal with no login ───────────────────
  INSERT INTO public.designer_clients (
    id, designer_id, client_id, status, client_name, client_email, source,
    created_at, updated_at
  )
  SELECT v_dc_okafor, uid_designer, NULL, 'proposal',
         'Adaeze Okafor', 'adaeze.okafor@example.com', 'manual',
         ts - INTERVAL '20 days', ts - INTERVAL '20 days'
  WHERE NOT EXISTS (SELECT 1 FROM public.designer_clients WHERE id = v_dc_okafor);

  -- Built as a draft, then sent under the send capability GUC exactly as the
  -- Tanaka block sends its paper. Never opened: viewed_at stays NULL.
  IF NOT EXISTS (SELECT 1 FROM public.proposals WHERE id = v_okafor) THEN
    INSERT INTO public.proposals (
      id, designer_id, client_id, designer_client_id, title, description,
      status, subtotal, total_amount, valid_until, personal_message,
      created_at, updated_at, version
    ) VALUES (
      v_okafor, uid_designer, NULL, v_dc_okafor,
      'Okafor Terrace — Study',
      'Walk fixture (US-19, F8-9): sent to a household with no login, not yet opened, reminded once.',
      'draft', 0, 0, (ts + INTERVAL '14 days'),
      'Here is the study as we walked it: the desk under the window, the shelves along the party wall.',
      ts - INTERVAL '5 days', ts - INTERVAL '5 days', 1
    );

    INSERT INTO public.proposal_sections (proposal_id, type, title, body, sort_order, metadata)
    VALUES
      (v_okafor, 'vision', 'Design Vision',
       'A quiet study off the terrace: limed oak, a deep window seat, and lamplight for evenings.',
       0, '{}'::jsonb);

    PERFORM set_config('app.proposal_send_id', v_okafor::text, true);
    UPDATE public.proposals
       SET status = 'sent',
           sent_at = ts - INTERVAL '3 days',
           updated_at = ts - INTERVAL '3 days'
     WHERE id = v_okafor AND status = 'draft';
    PERFORM set_config('app.proposal_send_id', '', true);
  END IF;

  -- The one reminder, yesterday. Refreshed on every run (as the arrival
  -- dates above are), so the cooldown stays live on an old local database and
  -- a re-run restores walk step 8c. Only under nudge_proposal's row-exact GUC,
  -- and only while the paper is still out.
  PERFORM set_config('app.proposal_nudge_id', v_okafor::text, true);
  UPDATE public.proposals
     SET last_nudged_at = ts - INTERVAL '1 day',
         nudge_count = 1
   WHERE id = v_okafor AND status IN ('sent', 'viewed');
  PERFORM set_config('app.proposal_nudge_id', '', true);

  -- ── 9. Birchwood Row: two silences and a held follow-up ────────────────
  SELECT id INTO v_apparatus FROM public.vendors WHERE name ILIKE 'Apparatus%' ORDER BY id LIMIT 1;
  SELECT id INTO v_ceramica  FROM public.vendors WHERE name ILIKE 'Ceramica%'  ORDER BY id LIMIT 1;
  IF v_apparatus IS NULL OR v_ceramica IS NULL THEN
    RAISE NOTICE 'running_a_job_walk_dev.sql: demo vendors are not seeded yet, skipping Birchwood Row';
    RETURN;
  END IF;

  -- A product behind each line, so the paper adds no "unspecified" count.
  SELECT id INTO v_product_a FROM public.products
   WHERE images IS NOT NULL AND array_length(images, 1) > 0 ORDER BY id LIMIT 1 OFFSET 6;
  SELECT id INTO v_product_b FROM public.products
   WHERE images IS NOT NULL AND array_length(images, 1) > 0 ORDER BY id LIMIT 1 OFFSET 7;

  INSERT INTO public.projects (
    id, name, designer_id, created_by, studio_id, status, current_phase,
    budget_cents, start_date, notes, created_at, updated_at
  ) VALUES (
    v_birchwood, 'Birchwood Row', uid_designer, uid_designer, v_studio,
    'active', NULL, 1400000, (ts - INTERVAL '45 days')::date,
    'Walk fixture (US-19, F8-9): two POs sent, never acknowledged; a follow-up held on one.',
    ts - INTERVAL '50 days', ts
  ) ON CONFLICT (id) DO NOTHING;

  -- Sent the way po-send sends (status stays draft, sent_at stamped), as
  -- Halloran's PO is, and never acknowledged: document_state counts both in
  -- unacked_po_count, labelled by the older (031). No agreement stands
  -- behind the job, so the lines sit on their POs directly, as Fenwick's does.
  INSERT INTO public.purchase_orders (
    id, designer_id, project_id, vendor_id, vendor_po_number,
    payment_pattern, total_cents, status, ack_state, sent_at, created_by,
    created_at
  ) VALUES
    (v_po_031, uid_designer, v_birchwood, v_apparatus, 'BR-2026-031',
     'net_30', 312000, 'draft', 'none', ts - INTERVAL '7 days', uid_designer,
     ts - INTERVAL '9 days'),
    (v_po_032, uid_designer, v_birchwood, v_ceramica, 'BR-2026-032',
     'net_30', 136000, 'draft', 'none', ts - INTERVAL '5 days', uid_designer,
     ts - INTERVAL '7 days')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.po_payments (id, purchase_order_id, kind, amount_cents, due_date, state, sort_order)
  VALUES
    ('f1900000-0000-4000-8000-000000000096', v_po_031, 'balance', 312000, NULL, 'pending', 0),
    ('f1900000-0000-4000-8000-000000000097', v_po_032, 'balance', 136000, NULL, 'pending', 0)
  ON CONFLICT (id) DO NOTHING;

  -- NOT EXISTS for the selection-thread reason above. Trade totals equal the
  -- PO totals, so either PO is in sync if anyone resends it.
  INSERT INTO public.project_ffe_items (
    id, project_id, product_id, purchase_order_id, name, ffe_category,
    item_type, status, quantity, unit_price_cents, trade_price_cents,
    markup_percent, line_total_cents, vendor_name, vendor_id, sort_order,
    design_disposition, created_at, updated_at
  )
  SELECT v.* FROM (VALUES
    (v_line_031, v_birchwood, v_product_a, v_po_031,
     'Brass cloud pendant, 36 in', 'lighting',
     'fixed', 'ordered', 1, 390000, 312000,
     25.00, 390000, 'Apparatus', v_apparatus, 0,
     'selected', ts - INTERVAL '20 days', ts - INTERVAL '7 days'),
    (v_line_032, v_birchwood, v_product_b, v_po_032,
     'Stoneware console lamp', 'lighting',
     'fixed', 'ordered', 1, 170000, 136000,
     25.00, 170000, 'Ceramica Studio', v_ceramica, 1,
     'selected', ts - INTERVAL '18 days', ts - INTERVAL '5 days')
  ) AS v (
    id, project_id, product_id, purchase_order_id, name, ffe_category,
    item_type, status, quantity, unit_price_cents, trade_price_cents,
    markup_percent, line_total_cents, vendor_name, vendor_id, sort_order,
    design_disposition, created_at, updated_at
  )
  WHERE NOT EXISTS (SELECT 1 FROM public.project_ffe_items f WHERE f.id = v.id);

  -- The follow-up a member held on 031's line through "Follow up with the
  -- maker" (/api/document/ask-maker-date, kind maker_follow_up), laid with a
  -- fixed id: subject `{PO} — following up`, the maker's address as the route
  -- resolves it. Laid once; a walker who sends or discards it leaves that
  -- standing, and the one-open-note index (00728) refuses a second.
  v_org := public.purchase_order_studio_id(v_po_031);
  INSERT INTO public.procurement_drafts (
    id, organization_id, project_id, kind, purchase_order_id, ffe_item_id,
    to_email, subject, body, status, composed_by, created_at, updated_at
  ) VALUES (
    v_draft_031, v_org, v_birchwood, 'maker_follow_up', v_po_031, v_line_031,
    public._procurement_vendor_email(v_org, v_apparatus),
    'BR-2026-031 — following up',
    E'Hello,\n\nWe sent PO BR-2026-031 for the brass cloud pendant a week ago and have not had an acknowledgment. Could you confirm you have it, and the date you expect it to ship?\n\nThank you,\nLeah',
    'awaiting_review', uid_designer::text, ts - INTERVAL '1 day', ts - INTERVAL '1 day'
  ) ON CONFLICT DO NOTHING;
END $$;
