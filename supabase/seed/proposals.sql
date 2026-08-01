-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: Proposal fixtures for local end-to-end testing.
--
-- Two proposals tied to the dev designer + client:
--   1. ACCEPTED — exercises the proposal→project activation fast-path.
--   2. SENT     — has full sections + items so the client-portal can render
--                 the read-only document and the sign flow.
--
-- Idempotent via fixed UUIDs + ON CONFLICT. Safe to re-run on db reset.
-- Prerequisites: dev-accounts.sql + designer-clients.sql.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  uid_designer UUID := 'a0000000-0000-0000-0000-000000000004';
  uid_client   UUID := 'a0000000-0000-0000-0000-000000000005';
  v_designer_client UUID;
  v_accepted   UUID := 'b0000000-0000-0000-0000-000000000001';
  v_sent       UUID := 'b0000000-0000-0000-0000-000000000002';
BEGIN
  -- Skip cleanly if the dev accounts haven't been seeded yet.
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid_designer) THEN
    RAISE NOTICE 'proposals.sql: dev designer profile missing - run dev-accounts.sql first';
    RETURN;
  END IF;

  SELECT id INTO v_designer_client
  FROM public.designer_clients
  WHERE designer_id = uid_designer
    AND client_id = uid_client
  ORDER BY (status <> 'lead') DESC, created_at, id
  LIMIT 1;

  IF v_designer_client IS NULL THEN
    RAISE NOTICE 'proposals.sql: designer/client relationship missing - run designer-clients.sql first';
    RETURN;
  END IF;

  -- ── Proposal 1: accepted (activation fast-path) ───────────────────────
  INSERT INTO public.proposals (
    id, designer_id, client_id, designer_client_id, title, description, status,
    subtotal, total_amount, accepted_at, created_at, updated_at
  ) VALUES (
    v_accepted, uid_designer, uid_client, v_designer_client,
    'Sample accepted proposal',
    'Pre-seeded proposal in accepted status. Used to exercise the proposal-to-project activation flow in local dev.',
    'accepted', 10000000, 10000000, NOW(), NOW(), NOW()
  )
  ON CONFLICT (id) DO NOTHING;

  -- ── Proposal 2: sent (client review fixture) ──────────────────────────
  -- Materialize its authored graph as a draft first. 00390 makes an issued
  -- proposal immutable even to postgres, so the seed crosses the lifecycle
  -- boundary only after all sections/items exist.
  INSERT INTO public.proposals (
    id, designer_id, client_id, designer_client_id, title, description, status,
    subtotal, total_amount, sent_at, valid_until,
    personal_message, created_at, updated_at, version
  ) VALUES (
    v_sent, uid_designer, uid_client, v_designer_client,
    'Aspen Loft — Living Room Refresh',
    'Sent fixture: open this from the client portal to exercise the engagement, sign, and activation flow.',
    'draft',
    1850000, 1850000,
    NULL,
    NOW() + INTERVAL '14 days',
    'Excited to share this — let me know what resonates and what you''d like to discuss.',
    NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', 1
  )
  ON CONFLICT (id) DO NOTHING;

  -- Sections for proposal 2
  INSERT INTO public.proposal_sections (proposal_id, type, title, body, sort_order, metadata)
  VALUES
    (v_sent, 'vision', 'Design Vision',
     E'A warm, layered space that anchors quiet evenings and gathers easily for friends.\n\nWe''ll lean into honest materials — wool, walnut, hand-thrown ceramics — and let the existing architecture lead.',
     0, '{}'::jsonb),
    (v_sent, 'concept', 'Concept Direction',
     'Earthy neutrals offset with one moment of saturated terracotta. Texture over pattern.',
     1, jsonb_build_object('color_palette', jsonb_build_array(
       jsonb_build_object('hex','#E8DDD0'),
       jsonb_build_object('hex','#C4A57B'),
       jsonb_build_object('hex','#8B7355'),
       jsonb_build_object('hex','#A8B5A0')
     ))),
    (v_sent, 'space_plan', 'Space Plan',
     'Conversation seating around the fireplace, with a flexible reading nook by the south window.',
     2, '{}'::jsonb),
    (v_sent, 'selections', 'Product Selections',
     NULL, 3, '{}'::jsonb),
    (v_sent, 'investment', 'Investment',
     NULL, 4, '{}'::jsonb),
    (v_sent, 'timeline', 'Timeline',
     NULL, 5, '{}'::jsonb),
    (v_sent, 'terms', 'Terms',
     E'Revisions: 2 rounds per phase included. Beyond that billed at $150/hr.\n\nDeposits are non-refundable once procurement begins. Custom items are final sale.',
     6, '{}'::jsonb)
  ON CONFLICT DO NOTHING;

  -- Items for proposal 2 (mix of vendors so the selections list has texture)
  INSERT INTO public.proposal_items (
    proposal_id, name, description, quantity,
    unit_price, unit_sell_price, line_total_cents, vendor_name, position
  ) VALUES
    (v_sent, 'Walnut sectional sofa', 'Custom 102" sectional, charcoal mohair', 1,
     650000, 650000, 650000, 'Lawson', 0),
    (v_sent, 'Hand-knotted wool rug', '9x12, oat with terracotta border', 1,
     420000, 420000, 420000, 'Beni Ourain Co.', 1),
    (v_sent, 'Walnut coffee table', 'Sculpted slab on bronze base', 1,
     280000, 280000, 280000, 'Studio Ren', 2),
    (v_sent, 'Reading lounge chair', 'Pair, cognac saddle leather', 2,
     185000, 185000, 370000, 'Lostine', 3),
    (v_sent, 'Floor lamp', 'Brass arc lamp with linen shade', 2,
     65000, 65000, 130000, 'Allied Maker', 4)
  ON CONFLICT DO NOTHING;

  PERFORM set_config('app.proposal_send_id', v_sent::text, true);
  UPDATE public.proposals
  SET status = 'sent',
      sent_at = NOW() - INTERVAL '1 day',
      updated_at = NOW() - INTERVAL '1 day'
  WHERE id = v_sent AND status = 'draft';
  PERFORM set_config('app.proposal_send_id', '', true);
END;
$$;

-- ── 00390 concurrency fixtures ────────────────────────────────────────────
-- Two committed drafts let the dblink regression move a phase A→B while a
-- leaf edit races B's send. They are inert in product surfaces (fixed UUIDs,
-- ordinary drafts) and every race transaction rolls back its own changes.
DO $$
DECLARE
  uid_designer uuid := 'a0000000-0000-0000-0000-000000000004';
  uid_client uuid := 'a0000000-0000-0000-0000-000000000005';
  v_relationship uuid;
  v_source uuid := 'b3900000-0000-4000-8000-000000000001';
  v_target uuid := 'b3900000-0000-4000-8000-000000000002';
  v_phase uuid := 'b3900000-0000-4000-8000-000000000003';
BEGIN
  SELECT id INTO v_relationship
  FROM public.designer_clients
  WHERE designer_id = uid_designer
    AND client_id = uid_client
  ORDER BY (status <> 'lead') DESC, created_at, id
  LIMIT 1;

  IF v_relationship IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.proposals (
    id, designer_id, client_id, designer_client_id, title, description,
    status, subtotal, total_amount, valid_until
  )
  VALUES
    (
      v_source, uid_designer, uid_client, v_relationship,
      'Concurrency source draft', '00390 parent-lock regression source',
      'draft', 100000, 100000, now() + interval '30 days'
    ),
    (
      v_target, uid_designer, uid_client, v_relationship,
      'Concurrency target draft', '00390 parent-lock regression target',
      'draft', 100000, 100000, now() + interval '30 days'
    )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.proposal_phases (
    id, proposal_id, name, phase_key, duration_weeks, sort_order
  )
  VALUES (v_phase, v_source, 'Movable phase', 'movable', 1, 10)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.proposal_phase_deliverables (
    id, phase_id, label, description, is_required, sort_order
  )
  VALUES (
    'b3900000-0000-4000-8000-000000000004',
    v_phase, 'Race-safe deliverable', 'Must serialize with send', true, 10
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.proposal_phase_gates (
    id, phase_id, gate_kind, payload, sort_order
  )
  VALUES (
    'b3900000-0000-4000-8000-000000000005',
    v_phase, 'client_signature', '{"label":"Race-safe gate"}', 10
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.proposal_schedule_milestones (
    id, phase_id, name, kind, anchor_date, sort_order
  )
  VALUES (
    'b3900000-0000-4000-8000-000000000006',
    v_phase, 'Race-safe milestone', 'signoff', current_date + 7, 10
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.proposal_payment_milestones (
    id, proposal_id, label, percentage, amount_cents, trigger_condition,
    sort_order
  )
  VALUES (
    'b3900000-0000-4000-8000-000000000007',
    v_target, 'Concurrency retainer', 100, 100000, 'Upon acceptance', 10
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: Arrival Arc (Wave 1) no-login-household DRAFT proposal — I62.
-- The local Elena analog: a DRAFT proposal for a no-login household (client_id
-- NULL) linked to designer_clients d0c10000…b1 via proposals.designer_client_id
-- (seeded in designer-clients.sql). Exercises document_state Shape B's client_name
-- rescue — the row must read 'Elena Marlowe (no-login household)', NOT 'Client'.
-- Idempotent via fixed UUID + ON CONFLICT (id) DO NOTHING.
-- Prerequisite: designer-clients.sql (runs earlier in config.toml [db.seed]).
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  uid_designer  UUID := 'a0000000-0000-0000-0000-000000000004';
  dc_direction  UUID := 'd0c10000-0000-0000-0000-0000000000b1';  -- Elena-analog relationship
  v_elena       UUID := 'd0c10000-0000-0000-0000-0000000000b2';  -- the draft proposal
BEGIN
  -- Skip cleanly if prerequisites are missing (dev designer or the linked dc).
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid_designer) THEN
    RAISE NOTICE 'proposals.sql: dev designer missing - run dev-accounts.sql first';
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.designer_clients WHERE id = dc_direction) THEN
    RAISE NOTICE 'proposals.sql: Elena-analog relationship missing - run designer-clients.sql first';
    RETURN;
  END IF;

  INSERT INTO public.proposals (
    id, designer_id, client_id, designer_client_id, title, description, status,
    subtotal, total_amount, created_at, updated_at, version
  ) VALUES (
    v_elena, uid_designer, NULL, dc_direction,
    'Elena Marlowe — Living Room Direction',
    'Draft fixture for a no-login household: proposals.designer_client_id links '
      || 'to the household so document_state Shape B rescues the client_name.',
    'draft', 0, 0,
    now() - interval '10 days', now() - interval '10 days', 1
  )
  ON CONFLICT (id) DO NOTHING;
END;
$$;
