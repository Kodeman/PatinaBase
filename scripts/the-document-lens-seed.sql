-- ═══════════════════════════════════════════════════════════════════════════
-- LOCAL DEV ONLY — never run against Strata (or any other hosted database).
--
-- SEED: The Document Lens — "the long paper" (Smart Lens build, W0-L2)
--
-- A NEW project (id b0000000-0000-0000-0000-0000000000d5, "Aspen Loft — the
-- long paper") for designer@patina.dev / client@patina.dev — the SAME client
-- the existing Aspen Loft Refresh project (…d1, supabase/seed/decisions.sql)
-- uses — built to give the Smart Lens walkers a project-shape /doc/<id>
-- spread with real density: 5 rooms, 62 FF&E lines, purchase orders in every
-- stage (including a non-clean receiving inspection), two overdue client
-- approvals, a damaged line, a chased PO, and a second pre-work proposal
-- (…d6) for the "SENT · UNOPENED" walk.
--
-- Sources reconciled: the original brief (specimen.md, 4 rooms/36 lines) was
-- superseded by build/design/reconciliation.md's "Seed requirements" section
-- and two coordinator addenda (5 rooms/62 lines; margin split 3/4 verified
-- against the margin_items VIEW; a receiving_inspections row for the damage;
-- a separate clean-delivered PO; pre-work doc id …d6). Every date below is
-- relative to now()/CURRENT_DATE so the seed stays true on any run day.
--
-- All ids live in the reserved prefix b0000000-0000-0000-0005-xxxxxxxxxxxx
-- (project + the two proposal-shape docs use the pre-assigned …d5 / …d6).
-- Idempotent: every row carries a fixed id; each section deletes its own ids
-- before inserting (mirrors supabase/seed/decisions.sql + schedule.sql).
-- Safe on a fresh `supabase db reset` and safe to re-run against the LOCAL
-- stack. It is not safe against, and refuses to run on, anything else — the
-- guard below is the enforcement; the header is only the warning.
--
-- Run (local only):
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres < scripts/the-document-lens-seed.sql
-- Verify:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres < artifacts/document-lens-build-2026-08-29/build/seed/seed-verify.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Local-dev guard ────────────────────────────────────────────────────────
-- Two independent refusals, either of which stops the file before it writes a
-- row: the local `designer@patina.dev` fixture must exist (it does not on any
-- hosted project), and the server must not answer on a routable address.
-- inet_server_addr() is NULL over the unix socket `docker exec … psql` uses.
DO $$
DECLARE
  v_addr inet := inet_server_addr();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'designer@patina.dev') THEN
    RAISE EXCEPTION 'the-document-lens-seed: local dev only (designer@patina.dev fixture not found)';
  END IF;

  IF v_addr IS NOT NULL
     AND NOT (
       v_addr <<= inet '127.0.0.0/8'
       OR v_addr = inet '::1'
       OR v_addr <<= inet '10.0.0.0/8'
       OR v_addr <<= inet '172.16.0.0/12'
       OR v_addr <<= inet '192.168.0.0/16'
     )
  THEN
    RAISE EXCEPTION 'the-document-lens-seed: local dev only (server address % is neither loopback nor a private docker network)', v_addr;
  END IF;
END $$;

DO $$
DECLARE
  -- ── People / existing fixtures ──────────────────────────────────────────
  uid_designer     UUID := 'a0000000-0000-0000-0000-000000000004';
  uid_client       UUID := 'a0000000-0000-0000-0000-000000000005';
  uid_manufacturer UUID := 'a0000000-0000-0000-0000-000000000006'; -- dev-accounts.sql fixture; comms_threads.kind='vendor_brief' needs exactly 2 active participants
  v_dc_id          UUID;

  -- ── This project + its sibling pre-work document ────────────────────────
  v_project_id  UUID := 'b0000000-0000-0000-0000-0000000000d5';
  v_prework_id  UUID := 'b0000000-0000-0000-0000-0000000000d6';
  v_lineage_id  UUID := 'b0000000-0000-0000-0005-000000001401'; -- historical, already-signed proposal that activated d5 (gives "The Record" a non-zero settled count)

  -- ── D-B48 · the ONE-LINE-name paper ─────────────────────────────────────
  -- `…d5`'s name (`Aspen Loft — the long paper`) wraps to two lines at 390.
  -- The 390 gates are chosen by MEASURED line count, so the spec needs a
  -- one-line paper to exercise the other arm: `Aspen Loft` is 10 characters,
  -- inside the ~11 a 32px Playfair spends on a 327px measure. Same project
  -- SHAPE as …d5 in everything the LETTERHEAD reads (status, phase, the four
  -- money figures, the dates, the same client and designer, an activating
  -- lineage proposal) — it does not carry …d5's 62 FF&E lines, POs, decisions
  -- or margin, none of which the letterhead's own height depends on.
  -- NOT `…d4`: that id is ALREADY `Marrow & Vale Residence`, the 7-phase
  -- high-extreme schedule fixture in `supabase/seed/schedule-extremes.sql`.
  -- D-B48 named `…d4` as unused; it is not. `…d7` is the next free id in this
  -- family (checked against `supabase/`, `scripts/` and the local database).
  v_oneline_id  UUID := 'b0000000-0000-0000-0000-0000000000d7';
  v_oneline_lineage UUID := 'b0000000-0000-0000-0005-000000001402';
  -- W5F-07: the letterhead reads the project's PHASES (the vitals' stage and
  -- its dates), so the one-line paper carries the same five-phase main lane
  -- `…d5` does — otherwise its letterhead is a different shape from the one
  -- the 390 gate is comparing against.
  v_ol_phase_concept UUID := 'b0000000-0000-0000-0005-000000001411';
  v_ol_phase_dd      UUID := 'b0000000-0000-0000-0005-000000001412';
  v_ol_phase_proc    UUID := 'b0000000-0000-0000-0005-000000001413';
  v_ol_phase_inst    UUID := 'b0000000-0000-0000-0005-000000001414';
  v_ol_phase_comp    UUID := 'b0000000-0000-0000-0005-000000001415';

  -- ── Rooms ────────────────────────────────────────────────────────────────
  v_room_living UUID := 'b0000000-0000-0000-0005-000000000101';
  v_room_dining UUID := 'b0000000-0000-0000-0005-000000000102';
  v_room_pbr    UUID := 'b0000000-0000-0000-0005-000000000103';
  v_room_mud    UUID := 'b0000000-0000-0000-0005-000000000104';
  v_room_kit    UUID := 'b0000000-0000-0000-0005-000000000105';

  -- ── Vendors ──────────────────────────────────────────────────────────────
  v_vendor_sturdy   UUID := 'b0000000-0000-0000-0005-000000000401'; -- Sturdy Oak Woodworks
  v_vendor_heritage UUID := 'b0000000-0000-0000-0005-000000000402'; -- Heritage Cabinetry Co
  v_vendor_coastal  UUID := 'b0000000-0000-0000-0005-000000000403'; -- Coastal Millwork
  v_vendor_fdl      UUID := 'b0000000-0000-0000-0005-000000000404'; -- Fond du Lac Ironworks

  -- ── Purchase orders ──────────────────────────────────────────────────────
  v_po_sturdy   UUID := 'b0000000-0000-0000-0005-000000000501'; -- PO-2026-0418, unacknowledged 14d
  v_po_heritage UUID := 'b0000000-0000-0000-0005-000000000502'; -- acknowledged, in_production
  v_po_coastal  UUID := 'b0000000-0000-0000-0005-000000000503'; -- shipped -> clean inspection -> delivered
  v_po_fdl      UUID := 'b0000000-0000-0000-0005-000000000504'; -- shipped -> damaged inspection (console)

  -- ── Receiving inspections + the claim the damaged stamp reads ────────────
  v_ri_coastal UUID := 'b0000000-0000-0000-0005-000000000701'; -- clean
  v_ri_fdl     UUID := 'b0000000-0000-0000-0005-000000000702'; -- damaged
  v_claim_fdl  UUID := 'b0000000-0000-0000-0005-00000c1a0901'; -- the console's drafted damage_claims row

  -- ── Client decisions (approvals) ─────────────────────────────────────────
  -- Sub-prefix `dec` (a valid hex triplet) keeps these off the FF&E band. FF&E
  -- ids are minted as lpad(to_hex(2000 + n), 12, '0') = 0x7d1…0x80e, so the
  -- decimal-looking …0801…0804 these once used WERE the ids of FF&E lines
  -- n=49…52 — the same uuid meaning two different rows in two tables.
  v_dec_overdue6 UUID := 'b0000000-0000-0000-0005-00000dec0801'; -- Primary bedroom rug + nightstands, overdue 6d
  v_dec_com      UUID := 'b0000000-0000-0000-0005-00000dec0802'; -- Living room reading-chair fabric (COM), overdue 3d
  v_dec_dining   UUID := 'b0000000-0000-0000-0005-00000dec0803'; -- approved: dining finish sample
  v_dec_hardware UUID := 'b0000000-0000-0000-0005-00000dec0804'; -- approved: whole-house hardware

  -- ── Margin: comms threads (beside-Pieces items) ─────────────────────────
  v_thread_console UUID := 'b0000000-0000-0000-0005-000000001001'; -- photo/time on the damaged console
  v_thread_po      UUID := 'b0000000-0000-0000-0005-000000001002'; -- chasing PO-2026-0418
  v_msg_console    UUID := 'b0000000-0000-0000-0005-000000001101';
  v_msg_po         UUID := 'b0000000-0000-0000-0005-000000001102';

  -- ── Money: the outstanding invoice ──────────────────────────────────────
  v_invoice_id    UUID := 'b0000000-0000-0000-0005-000000001201';
  v_invoice_line  UUID := 'b0000000-0000-0000-0005-000000001301';

  -- ── Schedule ─────────────────────────────────────────────────────────────
  v_phase_concept UUID := 'b0000000-0000-0000-0005-000000001501';
  v_phase_dd      UUID := 'b0000000-0000-0000-0005-000000001502';
  v_phase_proc    UUID := 'b0000000-0000-0000-0005-000000001503';
  v_phase_inst    UUID := 'b0000000-0000-0000-0005-000000001504';
  v_phase_comp    UUID := 'b0000000-0000-0000-0005-000000001505';

  v_ms_com     UUID := 'b0000000-0000-0000-0005-000000001601'; -- COM deadline, overdue 3d
  v_ms_walk    UUID := 'b0000000-0000-0000-0005-000000001602'; -- site walk, +14d
  v_ms_install UUID := 'b0000000-0000-0000-0005-000000001603'; -- install day
  v_ms_punch   UUID := 'b0000000-0000-0000-0005-000000001604'; -- punch list, +25d

  v_install_date DATE;

  -- ── FF&E generation state ────────────────────────────────────────────────
  v_product_ids UUID[];
  v_product_count INT;
  n INT;
  v_room_id UUID;
  v_name TEXT;
  v_status TEXT;
  v_qty INT;
  v_unit_cents INT;
  v_line_cents INT;
  v_vendor_name TEXT;
  v_product_id UUID;
  v_po_id UUID;
  v_po_number TEXT;
  v_eta DATE;
  v_id UUID;

  -- Room name pools (cycled per room so lines read as real FF&E, not
  -- "Item N" placeholders).
  v_pool_living  TEXT[] := ARRAY['Sofa','Reading Chair','Console Table','Coffee Table','Area Rug','Floor Lamp','Table Lamp','Throw Pillows Set','Media Cabinet','Bookcase','Side Table','Window Panels','Wall Art','Ottoman','Accent Chair','Fireplace Mantel Styling','Bar Cart','Plant Stand'];
  v_pool_dining  TEXT[] := ARRAY['Dining Table','Dining Chair','Sideboard','Chandelier','Area Rug','Wall Mirror','Bar Cabinet','Table Runner Set','Wine Rack','Buffet Lamp','Wall Sconce','Centerpiece Bowl'];
  v_pool_pbr     TEXT[] := ARRAY['Bed Frame','Nightstand','Dresser','Area Rug','Reading Chair','Bench','Table Lamp','Drapery Panels','Full-Length Mirror','Bedding Set','Bench Cushion','Wall Sconce','Ottoman','Blackout Shades'];
  v_pool_mud     TEXT[] := ARRAY['Boot Bench','Storage Locker Set','Wall Hooks Set','Runner Rug','Cubby Shelving','Ceiling Light','Umbrella Stand','Entry Mirror'];
  v_pool_kit     TEXT[] := ARRAY['Pendant Light Set','Counter Stools','Cabinet Hardware Set','Runner Rug','Bar Cart','Open Shelving Brackets','Pot Rack','Window Treatment','Under-Cabinet Lighting','Banquette Cushions'];
BEGIN
  ------------------------------------------------------------------------
  -- 0. Prerequisites
  ------------------------------------------------------------------------
  SELECT id INTO v_dc_id
    FROM public.designer_clients
   WHERE designer_id = uid_designer AND client_id = uid_client
   LIMIT 1;

  IF v_dc_id IS NULL THEN
    RAISE NOTICE 'the-document-lens-seed.sql: designer_clients row missing - run designer-clients.sql first';
    RETURN;
  END IF;

  SELECT array_agg(id ORDER BY id), count(*)
    INTO v_product_ids, v_product_count
    FROM public.products;

  IF v_product_count IS NULL OR v_product_count = 0 THEN
    RAISE NOTICE 'the-document-lens-seed.sql: no products found - run products.sql first (product linkage will be skipped)';
    v_product_ids := ARRAY[]::UUID[];
    v_product_count := 0;
  END IF;

  -- Exactly +21d. The earlier "next Tuesday on/after +21d" search drifted the
  -- install milestone 21–27d depending on the run day, which is the one
  -- reconciliation figure the ladder rounds to weeks ("3 WEEKS").
  v_install_date := CURRENT_DATE + 21;

  ------------------------------------------------------------------------
  -- 1. The lineage proposal — a long-settled, already-signed proposal that
  --    activated this project. Gives `useProjectV2`'s `project.proposal`
  --    embed a non-null lineage, which is what makes deriveSections()
  --    (apps/designer-portal/src/lib/document/section-derivation.ts) stop
  --    ghosting Brief/Discovery/Direction/Proposal as 'unrecorded' and
  --    settle them instead — the ONLY way "The Record" (previous-work.tsx,
  --    count = sections.filter(state==='settled').length) prints anything
  --    but zero for a manual/direct project row (A-03). The seven-section
  --    ORDER caps this at 4 (brief/discovery/direction/proposal precede
  --    'project'); the specimen's "12 COMPLETE" does not exist in this data
  --    model — see seed-notes.md for the actual resulting count.
  --
  --    projects.proposal_id is guarded (00390 guard_project_completion_
  --    authority): it may only be set on INSERT, only as `postgres`, only
  --    while app.proposal_activation_id matches the target proposal id, and
  --    only when that proposal is 'accepted' with project_id IS NULL and
  --    matching designer/client — mirroring what activate_proposal_as_project
  --    does internally (that RPC mints its OWN project id, so it cannot be
  --    used here where the id is fixed). Sequence: insert the proposal with
  --    project_id NULL first, set the activation GUC, THEN insert the
  --    project with proposal_id set (the guard's UPDATE branch has no escape
  --    hatch at all, so proposal_id must land correctly at INSERT time) —
  --    finally back-fill proposals.project_id (unguarded on that side).
  --
  --    Both guards' UPDATE branches reject EVERY later change to
  --    project_id (including a cascading ON DELETE SET NULL from deleting
  --    the project) — so, unlike every other table in this script, the
  --    project + lineage proposal pair is created ONCE and never deleted:
  --    a re-run finds it and only UPDATEs the mutable project fields.
  ------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.projects WHERE id = v_project_id) THEN
    UPDATE public.projects SET
      name = 'Aspen Loft — the long paper', status = 'active', current_phase = 'procurement',
      budget_cents = 18450000, committed_cents = 17124000, actual_cents = 14160000,
      design_fee_cents = 2500000, client_visibility_tier = 'milestone',
      start_date = NOW() - INTERVAL '80 days', target_end_date = (v_install_date + 32)
     WHERE id = v_project_id;
  ELSE
    -- designer_client_id is required: guard_project_terminal_identity_integrity
    -- (00399) re-checks, on every future UPDATE OF status/client_id/designer_id/
    -- proposal_id/.., that the activated project's client still matches its
    -- proposal's designer_clients relationship — which it can only do if the
    -- proposal actually carries that relationship id.
    INSERT INTO public.proposals (
      id, project_id, designer_id, client_id, designer_client_id, title, status, version,
      subtotal, total_amount, deposit_percent,
      created_at, sent_at, viewed_at, accepted_at, signed_at, signed_by_name
    ) VALUES (
      v_lineage_id, NULL, uid_designer, uid_client, v_dc_id,
      'Aspen Loft — the long paper', 'accepted', 1,
      18450000, 18450000, 50.00,
      NOW() - INTERVAL '90 days', NOW() - INTERVAL '85 days',
      NOW() - INTERVAL '84 days', NOW() - INTERVAL '80 days',
      NOW() - INTERVAL '80 days', 'Client User'
    );

    PERFORM set_config('app.proposal_activation_id', v_lineage_id::text, true);

    -- ── 2. The project itself (document_state Shape A — 'project' spread).
    --      current_phase = 'procurement' keeps active_section = 'project'
    --      (00191: only 'installation'/'final_walkthrough' map to 'install').
    INSERT INTO public.projects (
      id, name, status, client_id, designer_id, created_by,
      proposal_id, current_phase,
      budget_cents, committed_cents, actual_cents, design_fee_cents,
      client_visibility_tier, start_date, target_end_date
    ) VALUES (
      v_project_id, 'Aspen Loft — the long paper', 'active', uid_client, uid_designer, uid_designer,
      v_lineage_id, 'procurement',
      18450000, 17124000, 14160000, 2500000, -- $184,500 / $171,240 / $141,600 / $25,000 (reconciliation.md figures — set directly on the project row, not organically summed from the 62 lines; see seed-notes.md caveat)
      'milestone', NOW() - INTERVAL '80 days', (v_install_date + 32)
    );

    -- guard_proposal_copy_immutability_trg (00390) requires the SAME
    -- activation GUC to still be set (plus a project row that already points
    -- back at this proposal, which now exists) before it will accept this
    -- back-fill — so the token is released only after this UPDATE runs.
    UPDATE public.proposals SET project_id = v_project_id WHERE id = v_lineage_id;

    PERFORM set_config('app.proposal_activation_id', '', true); -- release the activation token, matching activate_proposal_as_project's own cleanup
  END IF;

  ------------------------------------------------------------------------
  -- 3. Rooms (5 — Living 18 / Dining 12 / Primary Bedroom 14 / Mudroom 8 /
  --    Kitchen 10 = 62 lines total, per reconciliation.md's Seed
  --    requirements, superseding the original 4-room/36-line specimen).
  ------------------------------------------------------------------------
  -- Upsert, never delete-then-insert: deleting a room that still carries FF&E
  -- lines cascades ON DELETE SET NULL to project_ffe_items.project_room_id,
  -- which trips guard_project_ffe_selection_integrity (00438) — an
  -- assignment_scope='room' line is never allowed to end up roomless.
  INSERT INTO public.project_rooms (id, project_id, name, room_type, sort_order) VALUES
    (v_room_living, v_project_id, 'Living Room',      'living_room',      0),
    (v_room_dining, v_project_id, 'Dining Room',       'dining_room',      1),
    (v_room_pbr,    v_project_id, 'Primary Bedroom',   'primary_bedroom',  2),
    (v_room_mud,    v_project_id, 'Mudroom',           'mudroom',          3),
    (v_room_kit,    v_project_id, 'Kitchen',           'kitchen',          4)
  ON CONFLICT (id) DO UPDATE SET
    project_id = EXCLUDED.project_id, name = EXCLUDED.name,
    room_type = EXCLUDED.room_type, sort_order = EXCLUDED.sort_order;

  ------------------------------------------------------------------------
  -- 4. Vendors
  ------------------------------------------------------------------------
  INSERT INTO public.vendors (id, name, website, trade_terms, contact_info)
  VALUES
    (v_vendor_sturdy,   'Sturdy Oak Woodworks',   'https://sturdyoak.example.com',
     'Trade-only, 50/50 deposit/balance, 10-week lead time on casegoods.',
     '{"email":"trade@sturdyoak.example.com"}'::jsonb),
    (v_vendor_heritage, 'Heritage Cabinetry Co',  'https://heritagecabinetry.example.com',
     'Trade-only, 50/50 deposit/balance, 8-week lead time.',
     '{"email":"trade@heritagecabinetry.example.com"}'::jsonb),
    (v_vendor_coastal,  'Coastal Millwork',       'https://coastalmillwork.example.com',
     'Net-30, 4-week lead time on stock millwork.',
     '{"email":"orders@coastalmillwork.example.com"}'::jsonb),
    (v_vendor_fdl,      'Fond du Lac Ironworks',  'https://fdlironworks.example.com',
     'Trade-only, net-30, hand-forged casegoods.',
     '{"email":"orders@fdlironworks.example.com"}'::jsonb)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, website = EXCLUDED.website,
    trade_terms = EXCLUDED.trade_terms, contact_info = EXCLUDED.contact_info;

  ------------------------------------------------------------------------
  -- 5. Purchase orders
  --    PO1 Sturdy Oak — status 'draft' (sent to vendor, never confirmed),
  --      created_at backdated 14d, acknowledged_at NULL: the "unacknowledged
  --      14 days" PO the standing sheet chases. po_status_to_ffe_stage
  --      ('draft') = 'ordered', so its two linked lines ratchet to 'ordered'.
  --    PO2 Heritage Cabinetry — 'in_production', acknowledged: its lines
  --      ratchet to 'production'.
  --    PO3 Coastal Millwork — 'shipped' at insert (lines ratchet to
  --      'shipped'), then a CLEAN receiving_inspections row (below) advances
  --      it to 'delivered' via trigger C + cascades the linked lines to
  --      'delivered' via trigger B (A-04's "separate clean-delivered PO").
  --    PO4 Fond du Lac — 'shipped' at insert; the console line is inserted
  --      with an explicit status='delivered' (the ratchet only ever moves a
  --      status UP, so 'delivered' > the 'shipped' target is left alone);
  --      a DAMAGED receiving_inspections row (below) stamps delivered_date
  --      but — per trigger C — does NOT advance the PO's status on a
  --      non-clean outcome (A-04).
  ------------------------------------------------------------------------
  -- Upsert, never delete-then-insert: receiving_inspections.purchase_order_id
  -- is ON DELETE RESTRICT, so a re-run's DELETE would fail once step 8 below
  -- has logged an inspection against these ids. status AND delivered_date are
  -- both reset to their base values on every run (deliberately) — the
  -- receiving_inspections re-insert in step 8 re-cascades PO3 back to
  -- 'delivered' every time, so the final state converges identically
  -- regardless of run count. delivered_date must be reset with status:
  -- trigger C only shifts a net-30 balance's due_date when delivered_date
  -- transitions FROM NULL (00184's v_delivered_was_null branch), so leaving a
  -- run-1 delivered_date in place made run 2 re-insert the payments with
  -- due_date NULL and never re-derive it.
  INSERT INTO public.purchase_orders (
    id, designer_id, project_id, vendor_id, vendor_po_number,
    confirmed_eta, payment_pattern, total_cents, status,
    acknowledged_at, created_at, delivered_date
  ) VALUES
    (v_po_sturdy, uid_designer, v_project_id, v_vendor_sturdy, 'PO-2026-0418',
     v_install_date - 10, 'fifty_fifty', 1488000, 'draft',
     NULL, NOW() - INTERVAL '14 days', NULL),
    (v_po_heritage, uid_designer, v_project_id, v_vendor_heritage, 'HC-2244',
     v_install_date - 5, 'fifty_fifty', 960000, 'in_production',
     NOW() - INTERVAL '9 days', NOW() - INTERVAL '11 days', NULL),
    (v_po_coastal, uid_designer, v_project_id, v_vendor_coastal, 'CM-1187',
     v_install_date - 12, 'net_30', 520000, 'shipped',
     NOW() - INTERVAL '4 days', NOW() - INTERVAL '20 days', NULL),
    (v_po_fdl, uid_designer, v_project_id, v_vendor_fdl, 'FDL-0912',
     NULL, 'net_30', 320000, 'shipped',
     NOW() - INTERVAL '19 days', NOW() - INTERVAL '20 days', NULL)
  ON CONFLICT (id) DO UPDATE SET
    designer_id = EXCLUDED.designer_id, project_id = EXCLUDED.project_id,
    vendor_id = EXCLUDED.vendor_id, vendor_po_number = EXCLUDED.vendor_po_number,
    confirmed_eta = EXCLUDED.confirmed_eta, payment_pattern = EXCLUDED.payment_pattern,
    total_cents = EXCLUDED.total_cents, status = EXCLUDED.status,
    acknowledged_at = EXCLUDED.acknowledged_at, created_at = EXCLUDED.created_at,
    delivered_date = EXCLUDED.delivered_date;

  DELETE FROM public.po_payments WHERE purchase_order_id IN
    (v_po_sturdy, v_po_heritage, v_po_coastal, v_po_fdl);

  -- PO1: deposit $12,300 UNDRAWN (state 'pending', never 'due' — a 'due'
  -- state would surface a second, unintended margin_items row via the
  -- "vendor payment due" branch, 00282).
  INSERT INTO public.po_payments (purchase_order_id, kind, amount_cents, due_date, paid_date, state, sort_order)
  VALUES
    (v_po_sturdy, 'deposit', 1230000, NULL, NULL, 'pending', 0),
    (v_po_sturdy, 'balance',  258000, NULL, NULL, 'pending', 1);

  INSERT INTO public.po_payments (purchase_order_id, kind, amount_cents, due_date, paid_date, state, sort_order)
  VALUES
    (v_po_heritage, 'deposit', 480000, NOW() - INTERVAL '11 days', NOW() - INTERVAL '10 days', 'paid', 0),
    (v_po_heritage, 'balance', 480000, NULL, NULL, 'pending', 1);

  INSERT INTO public.po_payments (purchase_order_id, kind, amount_cents, due_date, paid_date, state, sort_order)
  VALUES (v_po_coastal, 'balance', 520000, NULL, NULL, 'pending', 0);

  INSERT INTO public.po_payments (purchase_order_id, kind, amount_cents, due_date, paid_date, state, sort_order)
  VALUES (v_po_fdl, 'balance', 320000, NULL, NULL, 'pending', 0);

  ------------------------------------------------------------------------
  -- 6. Client decisions (approvals) — 2 overdue (pending) + 2 approved
  --    (responded). overdue_decision_count in document_state / margin_items
  --    both derive from status='pending' AND due_date < now(), so both
  --    overdue rows count toward "overdue approvals = 2".
  ------------------------------------------------------------------------
  -- Create-once (never delete): client_decision_options carries its own
  -- guard (guard_client_decision_option_authority, 00399) whose DELETE-
  -- cascade escape hatch is scoped to the RPC's own app.
  -- client_decision_delete_cascade_id session token, not a plain DELETE.
  -- A fresh `supabase db reset` always hits this branch; a re-run against a
  -- live DB simply leaves these 4 rows and their "overdue Nd" framing as
  -- they were first seeded (their due_date offsets are relative to that
  -- first run's NOW(), not re-derived on every call) — see seed-notes.md.
  IF EXISTS (SELECT 1 FROM public.client_decisions WHERE id = v_dec_overdue6) THEN
    RAISE NOTICE 'the-document-lens-seed.sql: client decisions already seeded — skipping (create-once)';
  ELSE
  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, project_id, room_id,
    title, context, due_date, linked_phase,
    decision_type, blocking_status, status, sent_at
  ) VALUES (
    v_dec_overdue6, v_dc_id, uid_designer, v_project_id, v_room_pbr,
    'Primary bedroom — rug and nightstands',
    'Hartland rug, walnut nightstands. With the client since Aug 13 — six days overdue.',
    NOW() - INTERVAL '6 days', 'Procurement',
    'approval', 'blocks_procurement', 'pending', NOW() - INTERVAL '12 days'
  );
  INSERT INTO public.client_decision_options (decision_id, name, is_recommended, sort_order) VALUES
    (v_dec_overdue6, 'Hartland Rug — Natural', TRUE,  0),
    (v_dec_overdue6, 'Hartland Rug — Charcoal', FALSE, 1);

  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, project_id, room_id,
    title, context, due_date, linked_phase,
    decision_type, blocking_status, status, sent_at
  ) VALUES (
    v_dec_com, v_dc_id, uid_designer, v_project_id, v_room_living,
    'Living room — fabric for the reading chair',
    'Customer''s own material for the reading chair. COM due — three days overdue.',
    NOW() - INTERVAL '3 days', 'Procurement',
    'material', 'blocks_procurement', 'pending', NOW() - INTERVAL '10 days'
  );
  INSERT INTO public.client_decision_options (decision_id, name, is_recommended, sort_order) VALUES
    (v_dec_com, 'Boucle — Oatmeal', TRUE,  0),
    (v_dec_com, 'Linen — Fog',      FALSE, 1);

  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, project_id, room_id,
    title, context, due_date, linked_phase,
    decision_type, blocking_status, status,
    sent_at, responded_at, viewed_at, selected_by
  ) VALUES (
    v_dec_dining, v_dc_id, uid_designer, v_project_id, v_room_dining,
    'Dining room — finish sample',
    'Table finish sample approved against the walnut sample board.',
    NOW() - INTERVAL '20 days', 'Procurement',
    'approval', 'blocks_procurement', 'responded',
    NOW() - INTERVAL '25 days', NOW() - INTERVAL '21 days', NOW() - INTERVAL '23 days', uid_client
  );
  INSERT INTO public.client_decision_options (decision_id, name, is_recommended, selected, sort_order) VALUES
    (v_dec_dining, 'Walnut — Natural Oil', TRUE, TRUE, 0);

  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, project_id,
    title, context, due_date, linked_phase,
    decision_type, blocking_status, status,
    sent_at, responded_at, viewed_at, selected_by
  ) VALUES (
    v_dec_hardware, v_dc_id, uid_designer, v_project_id,
    'Whole-house hardware',
    'Cabinet and door hardware finish approved for every room on this job.',
    NOW() - INTERVAL '30 days', 'Procurement',
    'approval', 'non_blocking', 'responded',
    NOW() - INTERVAL '35 days', NOW() - INTERVAL '31 days', NOW() - INTERVAL '33 days', uid_client
  );
  INSERT INTO public.client_decision_options (decision_id, name, is_recommended, selected, sort_order) VALUES
    (v_dec_hardware, 'Aged Brass', TRUE, TRUE, 0);
  END IF;

  ------------------------------------------------------------------------
  -- 7. FF&E lines — 62 total across the 5 rooms. Generated with a rotating
  --    name/status/product pattern; special lines (damaged console, the
  --    COM-blocked line, the 2 unspecified lines, the PO-linked lines) are
  --    overridden by index below.
  --      n= 1        Living  — damaged console  (PO4, forced status)
  --      n= 2        Living  — COM-blocked reading-chair fabric line
  --      n= 3..18    Living  — plain (16 lines)
  --      n=19..20    Dining  — PO1 (Sturdy Oak) dining table + 6 chairs
  --      n=21..30    Dining  — plain (10 lines)
  --      n=31..44    Primary Bedroom — plain (14 lines)
  --      n=45..46    Mudroom — 2 UNSPECIFIED (no product, status specified)
  --      n=47..48    Mudroom — PO3 (Coastal Millwork, clean-delivered)
  --      n=49..52    Mudroom — plain (4 lines)
  --      n=53..54    Kitchen — PO2 (Heritage Cabinetry, in_production)
  --      n=55..62    Kitchen — plain (8 lines)
  ------------------------------------------------------------------------
  -- Upsert, never delete-then-insert (same reasoning as project_rooms above —
  -- and a delete here would also need to precede the purchase_orders /
  -- receiving_inspections rows that reference these lines' ids indirectly).
  FOR n IN 1..62 LOOP
    v_id := ('b0000000-0000-0000-0005-' || lpad(to_hex(2000 + n), 12, '0'))::uuid;
    v_po_id := NULL;
    v_po_number := NULL;
    v_eta := NULL;
    v_product_id := NULL;

    IF n BETWEEN 1 AND 18 THEN
      v_room_id := v_room_living;
      v_name := v_pool_living[((n - 1) % array_length(v_pool_living, 1)) + 1];
    ELSIF n BETWEEN 19 AND 30 THEN
      v_room_id := v_room_dining;
      v_name := v_pool_dining[((n - 19) % array_length(v_pool_dining, 1)) + 1];
    ELSIF n BETWEEN 31 AND 44 THEN
      v_room_id := v_room_pbr;
      v_name := v_pool_pbr[((n - 31) % array_length(v_pool_pbr, 1)) + 1];
    ELSIF n BETWEEN 45 AND 52 THEN
      v_room_id := v_room_mud;
      v_name := v_pool_mud[((n - 45) % array_length(v_pool_mud, 1)) + 1];
    ELSE
      v_room_id := v_room_kit;
      v_name := v_pool_kit[((n - 53) % array_length(v_pool_kit, 1)) + 1];
    END IF;

    -- Default status cycle for plain lines; special n's overridden below.
    v_status := (ARRAY['specified','quoted','approved','shipped','installed'])[((n % 5) + 1)];
    v_qty := 1 + (n % 3);
    IF v_product_count > 0 THEN
      v_product_id := v_product_ids[((n - 1) % v_product_count) + 1];
    END IF;
    v_unit_cents := 45000 + (n * 3700);
    v_line_cents := v_unit_cents * v_qty;
    v_vendor_name := 'Studio Sourced';

    IF n = 1 THEN
      -- The damaged console (Fond du Lac Ironworks / PO4).
      v_name := 'Brass-and-Oak Console';
      v_status := 'delivered';
      v_qty := 1;
      v_product_id := NULL;
      v_vendor_name := 'Fond du Lac Ironworks';
      v_po_id := v_po_fdl;
      v_unit_cents := 320000;
      v_line_cents := 320000;
      v_eta := NULL;
    ELSIF n = 2 THEN
      -- COM-blocked: awaiting the fabric decision, no product yet.
      v_name := 'Reading Chair — COM Fabric Pending';
      v_status := 'specified';
      v_product_id := NULL;
      v_vendor_name := NULL;
      v_unit_cents := 0;
      v_line_cents := 0;
    ELSIF n IN (19, 20) THEN
      v_po_id := v_po_sturdy;
      v_po_number := 'PO-2026-0418';
      v_vendor_name := 'Sturdy Oak Woodworks';
      v_eta := v_install_date - 10;
      v_status := 'ordered'; -- PO1 (draft) targets 'ordered'; set explicitly so the ratchet has something at/below its target to ratchet (it never moves a status down)
      IF n = 19 THEN
        v_name := 'Dining Table — Sturdy Oak';
        v_qty := 1; v_unit_cents := 688000; v_line_cents := 688000;
      ELSE
        v_name := 'Dining Chairs (Set of 6) — Sturdy Oak';
        v_qty := 6; v_unit_cents := 133333; v_line_cents := 800000;
      END IF;
    ELSIF n IN (45, 46) THEN
      v_name := v_pool_mud[n - 44] || ' — TBD';
      v_status := 'specified';
      v_product_id := NULL;
      v_vendor_name := NULL;
      v_unit_cents := 0;
      v_line_cents := 0;
    ELSIF n IN (47, 48) THEN
      v_po_id := v_po_coastal;
      v_po_number := 'CM-1187';
      v_vendor_name := 'Coastal Millwork';
      v_status := 'shipped'; -- ratchets to 'delivered' once the clean inspection (step 8) fires
      v_eta := v_install_date - 12;
      v_unit_cents := 260000;
      v_line_cents := 260000;
    ELSIF n IN (53, 54) THEN
      v_po_id := v_po_heritage;
      v_po_number := 'HC-2244';
      v_vendor_name := 'Heritage Cabinetry Co';
      v_status := 'production';
      v_eta := v_install_date - 5;
      v_unit_cents := 480000;
      v_line_cents := 480000;
    END IF;

    INSERT INTO public.project_ffe_items (
      id, project_id, project_room_id, assignment_scope, product_id, name, status,
      quantity, unit_price_cents, line_total_cents, vendor_name,
      purchase_order_id, po_number, eta, blocked, blocked_reason,
      blocked_by_decision_id, sort_order
    ) VALUES (
      v_id, v_project_id, v_room_id, 'room', v_product_id, v_name, v_status,
      v_qty, v_unit_cents, v_line_cents, v_vendor_name,
      v_po_id, v_po_number, v_eta,
      -- n=1 is blocked by damage, n=2 by the pending COM decision.
      -- deriveLineStamp's 'decision_due' branch (stamp-derivation.ts) needs
      -- blocked = true AND a pending blocking_decision, so a line carrying
      -- blocked_by_decision_id alone would print as an ordinary line and read
      -- as orderable everywhere .blocked gates authorization.
      (n IN (1, 2)),
      CASE
        WHEN n = 1 THEN
          'Top panel gouged in transit. Carrier claim window closes ' ||
          to_char(CURRENT_DATE + INTERVAL '1 day', 'FMMonth FMDD') || '.'
        WHEN n = 2 THEN
          'Customer''s own material — held for the client''s fabric decision.'
        ELSE NULL
      END,
      CASE WHEN n = 2 THEN v_dec_com ELSE NULL END,
      n
    )
    ON CONFLICT (id) DO UPDATE SET
      project_id = EXCLUDED.project_id, project_room_id = EXCLUDED.project_room_id,
      assignment_scope = EXCLUDED.assignment_scope, product_id = EXCLUDED.product_id,
      name = EXCLUDED.name, status = EXCLUDED.status, quantity = EXCLUDED.quantity,
      unit_price_cents = EXCLUDED.unit_price_cents, line_total_cents = EXCLUDED.line_total_cents,
      vendor_name = EXCLUDED.vendor_name, purchase_order_id = EXCLUDED.purchase_order_id,
      po_number = EXCLUDED.po_number, eta = EXCLUDED.eta, blocked = EXCLUDED.blocked,
      blocked_reason = EXCLUDED.blocked_reason, blocked_by_decision_id = EXCLUDED.blocked_by_decision_id,
      sort_order = EXCLUDED.sort_order;
  END LOOP;

  ------------------------------------------------------------------------
  -- 8. Receiving inspections (A-04): one CLEAN (advances PO3 -> 'delivered'
  --    and cascades its 2 linked lines to 'delivered' via trigger B), one
  --    DAMAGED (stamps PO4.delivered_date but leaves PO4.status = 'shipped'
  --    — the console line's explicit status='delivered' from step 7 stands
  --    because the ratchet trigger never moves a status DOWN).
  ------------------------------------------------------------------------
  -- damage_claims.receiving_inspection_id is ON DELETE RESTRICT, so the claim
  -- must go before the inspection it hangs from (00151 documents the same
  -- ordering for the app's own delete path).
  DELETE FROM public.damage_claims WHERE id = v_claim_fdl;
  DELETE FROM public.receiving_inspections WHERE id IN (v_ri_coastal, v_ri_fdl);

  INSERT INTO public.receiving_inspections (
    id, purchase_order_id, inspected_at, inspected_by, outcome, notes
  ) VALUES
    (v_ri_coastal, v_po_coastal, NOW() - INTERVAL '4 days', uid_designer, 'clean',
     'Boot bench and cubby shelving received complete, no damage.'),
    (v_ri_fdl, v_po_fdl, NOW() - INTERVAL '6 days', uid_designer, 'damaged',
     'Top panel gouged on arrival — photos attached. Filing a carrier claim.');

  -- The line's DAMAGED stamp is read from HERE, not from the inspection and
  -- not from project_ffe_items.blocked: deriveLineStamp (stamp-derivation.ts)
  -- returns 'damaged' only when the item's `item_claims` embed
  -- (damage_claims!ffe_item_id, use-project-v2.ts) holds a row in
  -- 'drafted'/'vendor_notified'. Nothing in the database auto-drafts it —
  -- 00150's "auto-drafted" note describes useCreateReceivingInspection, an
  -- application hook — so the seed writes it. 'drafted' with a NULL
  -- vendor_notified_at is the claim written but not yet filed with the
  -- carrier; the window closes tomorrow, the same date the line's
  -- blocked_reason prints.
  INSERT INTO public.damage_claims (
    id, receiving_inspection_id, ffe_item_id, state, description, vendor_notified_at
  ) VALUES (
    v_claim_fdl, v_ri_fdl,
    ('b0000000-0000-0000-0005-' || lpad(to_hex(2000 + 1), 12, '0'))::uuid,
    'drafted',
    'Brass-and-Oak Console: top panel gouged in transit. Photos filed. Carrier claim window closes ' ||
      to_char(CURRENT_DATE + INTERVAL '1 day', 'FMMonth FMDD') || ' — drafted, not yet sent to Fond du Lac.',
    NULL
  );

  ------------------------------------------------------------------------
  -- 9. Margin — source rows only (margin_items is a VIEW, 00194/00282;
  --    seed-verify.sql SELECTs from the view itself to prove the 3/4 split
  --    rather than re-deriving it here). Deliberately avoid every OTHER
  --    branch of the view for this project (no weekly_pulses, no
  --    project_time_entries, no sms_messages, no margin_notes, and no
  --    po_payments row with state='due') so the count lands on exactly 7:
  --      beside Pieces (anchor_kind='line'): the COM decision (line-anchored
  --        via blocked_by_decision_id on FF&E line n=2), the console thread,
  --        the PO-chase thread.
  --      whole job (anchor_kind='letterhead'): the overdue rug/nightstands
  --        decision, the 2 approved decisions, the outstanding invoice.
  ------------------------------------------------------------------------
  DELETE FROM public.comms_messages WHERE id IN (v_msg_console, v_msg_po);
  DELETE FROM public.comms_thread_participants WHERE thread_id IN (v_thread_console, v_thread_po);
  DELETE FROM public.comms_threads WHERE id IN (v_thread_console, v_thread_po);

  INSERT INTO public.comms_threads (
    id, kind, project_id, title, created_by, last_message_at, anchor_kind, anchor_id
  ) VALUES
    (v_thread_console, 'project', v_project_id, 'Console — damage photos', uid_designer,
     NOW() - INTERVAL '5 days', 'line',
     ('b0000000-0000-0000-0005-' || lpad(to_hex(2000 + 1), 12, '0'))::uuid),
    (v_thread_po, 'vendor_brief', v_project_id, 'PO-2026-0418 follow-up', uid_designer,
     NOW() - INTERVAL '1 days', 'line',
     ('b0000000-0000-0000-0005-' || lpad(to_hex(2000 + 19), 12, '0'))::uuid);

  -- comms_check_thread_cardinality (00101_comms_tables.sql) requires exactly
  -- 2 active participants for kind IN ('direct','vendor_brief'); v_thread_po
  -- is 'vendor_brief', so it needs the designer plus a counterpart — using
  -- the standing dev-accounts.sql manufacturer fixture as the vendor side.
  -- v_thread_console is kind='project' (no cardinality constraint), so it
  -- keeps its single designer participant.
  INSERT INTO public.comms_thread_participants (thread_id, profile_id, role)
  VALUES
    (v_thread_console, uid_designer, 'designer'),
    (v_thread_po, uid_designer, 'designer'),
    (v_thread_po, uid_manufacturer, 'vendor');

  INSERT INTO public.comms_messages (id, thread_id, sender_id, body, created_at) VALUES
    (v_msg_console, v_thread_console, uid_designer,
     'Photo attached — top panel gouged on arrival. Filing the carrier claim before the window closes.',
     NOW() - INTERVAL '5 days'),
    (v_msg_po, v_thread_po, uid_designer,
     'Still no acknowledgment on PO-2026-0418 after 14 days. Chasing Sturdy Oak today.',
     NOW() - INTERVAL '1 days');

  -- The outstanding invoice — whole-job (letterhead) anchored: its one line
  -- is a lump-sum adhoc line with no ffe_item_id.
  DELETE FROM public.invoice_line_items WHERE id = v_invoice_line;
  DELETE FROM public.invoices WHERE id = v_invoice_id;

  INSERT INTO public.invoices (
    id, project_id, designer_id, client_id, invoice_number, status,
    issue_date, due_date, subtotal_cents, total_cents, sent_at
  ) VALUES (
    v_invoice_id, v_project_id, uid_designer, uid_client, 'INV-2026-114', 'sent',
    CURRENT_DATE - 22, CURRENT_DATE - 7, 1750000, 1750000, NOW() - INTERVAL '22 days'
  );
  INSERT INTO public.invoice_line_items (
    id, invoice_id, kind, description, quantity, unit_amount_cents, amount_cents, sort_order
  ) VALUES (
    v_invoice_line, v_invoice_id, 'adhoc', 'Design fee + procurement services — Q3 draw',
    1, 1750000, 1750000, 0
  );

  ------------------------------------------------------------------------
  -- 10. Schedule — 5 chained phases + 4 milestones so the schedule region
  --     is non-empty and the install date, COM deadline, site walk, and
  --     punch list are all exercisable.
  ------------------------------------------------------------------------
  DELETE FROM public.schedule_milestones
   WHERE id IN (v_ms_com, v_ms_walk, v_ms_install, v_ms_punch);
  DELETE FROM public.project_phases
   WHERE id IN (v_phase_concept, v_phase_dd, v_phase_proc, v_phase_inst, v_phase_comp);

  PERFORM set_config(
    'app.project_phase_batch_token',
    format('project_phase_batch:%s:%s', v_project_id, pg_catalog.txid_current()),
    true
  );

  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date, duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_phase_concept, v_project_id, 'Concept & Schematic Design', NULL, 'completed',
    CURRENT_DATE - 70, CURRENT_DATE - 50, 20, NULL, CURRENT_DATE - 70, 'main', 0
  );
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date, duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_phase_dd, v_project_id, 'Design Development', NULL, 'completed',
    CURRENT_DATE - 50, CURRENT_DATE - 25, 25, v_phase_concept, NULL, 'main', 1
  );
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date, duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_phase_proc, v_project_id, 'Procurement & Orders', 'procurement', 'in_progress',
    CURRENT_DATE - 25, v_install_date, (v_install_date - (CURRENT_DATE - 25)), v_phase_dd, NULL, 'main', 2
  );
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date, duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_phase_inst, v_project_id, 'Installation & Styling', 'installation', 'pending',
    v_install_date, v_install_date + 5, 5, v_phase_proc, v_install_date, 'main', 3
  );
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date, duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_phase_comp, v_project_id, 'Completion', NULL, 'pending',
    v_install_date + 5, v_install_date + 12, 7, v_phase_inst, NULL, 'main', 4
  );

  PERFORM set_config('app.project_phase_batch_token', '', true);

  INSERT INTO public.schedule_milestones (id, phase_id, name, kind, anchor_date, status, sort_order) VALUES
    (v_ms_com,     v_phase_proc, 'COM — reading chair fabric due',      'delivery', CURRENT_DATE - 3,  'due',      0),
    (v_ms_walk,    v_phase_inst, 'Site walk',                           'event',    CURRENT_DATE + 14, 'upcoming', 0),
    (v_ms_install, v_phase_inst, 'Install day',                         'event',    v_install_date,    'upcoming', 1),
    (v_ms_punch,   v_phase_comp, 'Punch list walkthrough',              'event',    CURRENT_DATE + 25, 'upcoming', 0);

  ------------------------------------------------------------------------
  -- 11. The second, pre-work document (…d6) — a proposal-stage doc for the
  --     SAME client, sent 6 days ago, unopened, $9,400 fee. Distinct
  --     project_id = NULL keeps it in document_state Shape B ('proposal').
  ------------------------------------------------------------------------
  -- Create-once (never delete): guard_proposal_copy_immutability_trg (00390)
  -- forbids deleting any non-draft edition outright — a 'sent' proposal has
  -- no escape hatch at all, unlike the project_id-relink cases above.
  IF EXISTS (SELECT 1 FROM public.proposals WHERE id = v_prework_id) THEN
    RAISE NOTICE 'the-document-lens-seed.sql: pre-work doc already seeded — skipping (create-once)';
  ELSE
    INSERT INTO public.proposals (
      id, project_id, designer_id, client_id, title, status, version,
      subtotal, total_amount, deposit_percent,
      created_at, sent_at, viewed_at
    ) VALUES (
      v_prework_id, NULL, uid_designer, uid_client,
      'Aspen Loft — Guest Wing', 'sent', 1,
      940000, 940000, 50.00,
      NOW() - INTERVAL '9 days', NOW() - INTERVAL '6 days', NULL
    );
  END IF;

  ------------------------------------------------------------------------
  -- D-B48. The one-line-name paper (…d4). Created ONCE and never deleted,
  -- for the same reason …d5 is: 00390/00399 reject every later change to
  -- projects.proposal_id, a cascading ON DELETE SET NULL included. A re-run
  -- finds it and only UPDATEs the mutable fields.
  ------------------------------------------------------------------------
  IF EXISTS (SELECT 1 FROM public.projects WHERE id = v_oneline_id) THEN
    UPDATE public.projects SET
      name = 'Aspen Loft', status = 'active', current_phase = 'procurement',
      budget_cents = 18450000, committed_cents = 17124000, actual_cents = 14160000,
      design_fee_cents = 2500000, client_visibility_tier = 'milestone',
      start_date = NOW() - INTERVAL '80 days', target_end_date = (v_install_date + 32)
     WHERE id = v_oneline_id;
  ELSE
    INSERT INTO public.proposals (
      id, project_id, designer_id, client_id, designer_client_id, title, status, version,
      subtotal, total_amount, deposit_percent,
      created_at, sent_at, viewed_at, accepted_at, signed_at, signed_by_name
    ) VALUES (
      v_oneline_lineage, NULL, uid_designer, uid_client, v_dc_id,
      'Aspen Loft', 'accepted', 1,
      18450000, 18450000, 50.00,
      NOW() - INTERVAL '90 days', NOW() - INTERVAL '85 days',
      NOW() - INTERVAL '84 days', NOW() - INTERVAL '80 days',
      NOW() - INTERVAL '80 days', 'Client User'
    );

    PERFORM set_config('app.proposal_activation_id', v_oneline_lineage::text, true);

    INSERT INTO public.projects (
      id, name, status, client_id, designer_id, created_by,
      proposal_id, current_phase,
      budget_cents, committed_cents, actual_cents, design_fee_cents,
      client_visibility_tier, start_date, target_end_date
    ) VALUES (
      v_oneline_id, 'Aspen Loft', 'active', uid_client, uid_designer, uid_designer,
      v_oneline_lineage, 'procurement',
      18450000, 17124000, 14160000, 2500000,
      'milestone', NOW() - INTERVAL '80 days', (v_install_date + 32)
    );

    UPDATE public.proposals SET project_id = v_oneline_id WHERE id = v_oneline_lineage;
    PERFORM set_config('app.proposal_activation_id', '', true);
  END IF;

  -- W5F-07 · the one-line paper's phases — the same five-phase main lane as
  -- `…d5`, because the letterhead's vitals read them. Idempotent by fixed id,
  -- like every other section here.
  DELETE FROM public.project_phases
   WHERE id IN (v_ol_phase_concept, v_ol_phase_dd, v_ol_phase_proc,
                v_ol_phase_inst, v_ol_phase_comp);

  PERFORM set_config(
    'app.project_phase_batch_token',
    format('project_phase_batch:%s:%s', v_oneline_id, pg_catalog.txid_current()),
    true
  );

  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date, duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_ol_phase_concept, v_oneline_id, 'Concept & Schematic Design', NULL, 'completed',
    CURRENT_DATE - 70, CURRENT_DATE - 50, 20, NULL, CURRENT_DATE - 70, 'main', 0
  );
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date, duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_ol_phase_dd, v_oneline_id, 'Design Development', NULL, 'completed',
    CURRENT_DATE - 50, CURRENT_DATE - 25, 25, v_ol_phase_concept, NULL, 'main', 1
  );
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date, duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_ol_phase_proc, v_oneline_id, 'Procurement & Orders', 'procurement', 'in_progress',
    CURRENT_DATE - 25, v_install_date, (v_install_date - (CURRENT_DATE - 25)), v_ol_phase_dd, NULL, 'main', 2
  );
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date, duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_ol_phase_inst, v_oneline_id, 'Installation & Styling', 'installation', 'pending',
    v_install_date, v_install_date + 5, 5, v_ol_phase_proc, v_install_date, 'main', 3
  );
  INSERT INTO public.project_phases (
    id, project_id, name, phase_key, status,
    start_date, target_end_date, duration_days, follows_phase_id, anchor_date, lane, sort_order
  ) VALUES (
    v_ol_phase_comp, v_oneline_id, 'Completion', NULL, 'pending',
    v_install_date + 5, v_install_date + 12, 7, v_ol_phase_inst, NULL, 'main', 4
  );

  PERFORM set_config('app.project_phase_batch_token', '', true);

  RAISE NOTICE 'the-document-lens-seed.sql: seeded project %, 5 rooms, 62 FF&E lines, 4 POs, 2 receiving inspections, 4 decisions, 2 margin threads, 1 invoice, 5 phases, 4 milestones, pre-work doc %, one-line-name paper %',
    v_project_id, v_prework_id, v_oneline_id;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Final status distribution + counts (printed by every run, per spec).
-- ═══════════════════════════════════════════════════════════════════════════
SELECT status, count(*)
  FROM public.project_ffe_items
 WHERE project_id = 'b0000000-0000-0000-0000-0000000000d5'
 GROUP BY 1 ORDER BY 1;

SELECT
  (SELECT count(*) FROM public.project_rooms WHERE project_id = 'b0000000-0000-0000-0000-0000000000d5') AS rooms,
  (SELECT count(*) FROM public.project_ffe_items WHERE project_id = 'b0000000-0000-0000-0000-0000000000d5') AS lines,
  (SELECT count(*) FROM public.project_ffe_items WHERE project_id = 'b0000000-0000-0000-0000-0000000000d5' AND product_id IS NOT NULL) AS lines_with_product;
