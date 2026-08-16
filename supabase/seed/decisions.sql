-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: Decision Workflow Test Data
--
-- Creates a deterministic project + 5 decisions for the dev designer
-- (designer@patina.dev / a0000000-0000-0000-0000-000000000004) so the
-- decision dashboard, detail pages, analytics, and E2E tests all have
-- consistent data to work with.
--
-- Coverage:
--   - 1 draft (not yet sent)
--   - 1 pending (due in 5 days, on track)
--   - 1 pending overdue (due 3 days ago)
--   - 1 responded (selected option B last week)
--   - 1 expired (was overdue >7d, status = 'expired')
--
-- Idempotent: safe to re-run on `supabase db reset`.
-- Prerequisite: dev-accounts.sql + designer-clients.sql must have run first.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  uid_designer UUID := 'a0000000-0000-0000-0000-000000000004';
  uid_client   UUID := 'a0000000-0000-0000-0000-000000000005';
  v_studio_id  UUID := 'b0000000-0000-0000-0000-000000000001';
  v_dc_id      UUID;
  v_project_id UUID := 'b0000000-0000-0000-0000-0000000000d1';
  v_dec_draft     UUID := 'b0000000-0000-0000-0000-0000000d2c01';
  v_dec_pending   UUID := 'b0000000-0000-0000-0000-0000000d2c02';
  v_dec_overdue   UUID := 'b0000000-0000-0000-0000-0000000d2c03';
  v_dec_responded UUID := 'b0000000-0000-0000-0000-0000000d2c04';
  v_dec_expired   UUID := 'b0000000-0000-0000-0000-0000000d2c05';
  -- Room linkage (migration 00172): two rooms so UI/e2e have room-scoped
  -- decisions to render against.
  v_room_dining UUID := 'b0000000-0000-0000-0000-0000000d2c0a';
  v_room_living UUID := 'b0000000-0000-0000-0000-0000000d2c0b';
BEGIN
  SELECT id INTO v_dc_id
  FROM public.designer_clients
  WHERE studio_id = v_studio_id
    AND designer_id = uid_designer AND client_id = uid_client
  LIMIT 1;

  IF v_dc_id IS NULL THEN
    RAISE NOTICE 'decisions.sql: designer_clients row missing - run designer-clients.sql first';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = v_project_id) THEN
    INSERT INTO public.projects (
      id, name, status, budget_cents, design_fee_cents,
      client_visibility_tier, client_id, designer_id, created_by, studio_id
    ) VALUES (
      v_project_id, 'Aspen Loft Refresh', 'active', 12000000, 250000,
      'milestone', uid_client, uid_designer, uid_designer, v_studio_id
    );
  END IF;

  -- Project rooms (00172 room linkage). Idempotent.
  INSERT INTO public.project_rooms (id, project_id, name, room_type, sort_order)
  VALUES
    (v_room_dining, v_project_id, 'Dining Room', 'dining_room', 0),
    (v_room_living, v_project_id, 'Living Room', 'living_room', 1)
  ON CONFLICT (id) DO NOTHING;

  DELETE FROM public.client_decisions
   WHERE id IN (v_dec_draft, v_dec_pending, v_dec_overdue, v_dec_responded, v_dec_expired);

  -- DRAFT
  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, studio_id, project_id,
    title, context, due_date, linked_phase,
    decision_type, blocking_status, status, sent_at
  ) VALUES (
    v_dec_draft, v_dc_id, uid_designer, v_studio_id, v_project_id,
    'Pendant lights - brushed brass vs blackened steel',
    'Two finishes for the dining pendants. Saving until I have the wood-tone samples back.',
    NULL, 'Concept', 'material', 'non_blocking', 'draft', NULL
  );
  INSERT INTO public.client_decision_options (
    decision_id, name, designer_note, is_recommended, price, quantity, sort_order
  ) VALUES
    (v_dec_draft, 'Brushed Brass',  'Warmer, picks up the oak floor.',                 TRUE,  48000, 3, 0),
    (v_dec_draft, 'Blackened Steel','More architectural, recedes against the ceiling.',FALSE, 42000, 3, 1);

  -- PENDING (due in 5 days) — scoped to the Dining Room (00172 room_id)
  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, studio_id, project_id, room_id,
    title, context, due_date, linked_phase,
    decision_type, blocking_status, status, sent_at
  ) VALUES (
    v_dec_pending, v_dc_id, uid_designer, v_studio_id, v_project_id, v_room_dining,
    'Dining chairs - Shaker Oak vs Windsor Elm',
    'Six chairs to pair with the Nordic Atelier table. Both are solid wood - different personalities for the room.',
    (NOW() + INTERVAL '5 days'),
    'Procurement', 'product', 'blocks_procurement', 'pending',
    NOW() - INTERVAL '2 days'
  );
  INSERT INTO public.client_decision_options (
    decision_id, name, designer_note, is_recommended,
    price, quantity, cost_delta_cents, lead_time_days_delta, sort_order
  ) VALUES
    (v_dec_pending, 'Shaker Oak',  'Lighter, more casual.',  TRUE,  68000, 6, 0,     0,  0),
    (v_dec_pending, 'Windsor Elm', 'Darker, heirloom feel.', FALSE, 78000, 6, 60000, 14, 1);

  -- PENDING + OVERDUE (due 3 days ago) — scoped to the Living Room (00172 room_id)
  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, studio_id, project_id, room_id,
    title, context, due_date, linked_phase,
    decision_type, blocking_status, status, sent_at
  ) VALUES (
    v_dec_overdue, v_dc_id, uid_designer, v_studio_id, v_project_id, v_room_living,
    'Rug color - Natural vs Sand',
    'The jute rug from Studio Piet. Natural is warmer, Sand is more neutral.',
    (NOW() - INTERVAL '3 days'),
    'Procurement', 'color', 'blocks_procurement', 'pending',
    NOW() - INTERVAL '12 days'
  );
  INSERT INTO public.client_decision_options (
    decision_id, name, designer_note, is_recommended, price, quantity, sort_order
  ) VALUES
    (v_dec_overdue, 'Natural', 'Warmer pairs with the brass.', TRUE,  85000, 1, 0),
    (v_dec_overdue, 'Sand',    'More neutral - safer choice.', FALSE, 85000, 1, 1);

  -- RESPONDED
  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, studio_id, project_id,
    title, context, due_date, linked_phase,
    decision_type, blocking_status, status,
    sent_at, responded_at, viewed_at, selected_by
  ) VALUES (
    v_dec_responded, v_dc_id, uid_designer, v_studio_id, v_project_id,
    'Concept direction approval',
    'Two approaches: Scandinavian Warm or Modern Organic. Mood boards in the conversation.',
    (NOW() - INTERVAL '4 days'),
    'Concept', 'approval', 'blocks_phase', 'responded',
    NOW() - INTERVAL '10 days', NOW() - INTERVAL '6 days', NOW() - INTERVAL '8 days', uid_client
  );
  INSERT INTO public.client_decision_options (
    decision_id, name, designer_note, is_recommended, selected,
    price, quantity, sort_order
  ) VALUES
    (v_dec_responded, 'Scandinavian Warm', 'Lighter palette, more open.', TRUE,  TRUE,  NULL, 1, 0),
    (v_dec_responded, 'Modern Organic',    'Heavier textures.',           FALSE, FALSE, NULL, 1, 1);

  -- EXPIRED
  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, studio_id, project_id,
    title, context, due_date, linked_phase,
    decision_type, blocking_status, status,
    sent_at, reminder_sent_at
  ) VALUES (
    v_dec_expired, v_dc_id, uid_designer, v_studio_id, v_project_id,
    'Hardware finish - pulls vs knobs',
    'For the kitchen. Going stale - superseded by a different scope choice.',
    (NOW() - INTERVAL '14 days'),
    'Refinement', 'substitution', 'non_blocking', 'expired',
    NOW() - INTERVAL '30 days', NOW() - INTERVAL '20 days'
  );
  INSERT INTO public.client_decision_options (
    decision_id, name, is_recommended, sort_order
  ) VALUES
    (v_dec_expired, 'Pulls (linear)', TRUE,  0),
    (v_dec_expired, 'Knobs (round)',  FALSE, 1);

  RAISE NOTICE 'decisions.sql: seeded 5 decisions on project %', v_project_id;
END $$;
