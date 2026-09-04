-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: The Client Page — the note, the mark, and something signed to stand on.
--
-- The client page (00565) reads five things off the seeded household: a note
-- standing on the page, a note already taken down, when the client last looked,
-- what she has authorized, and what is under way. Two of those five were the
-- only ones the local stack could answer.
--
-- Before this file the local database held ZERO project_commercial_documents
-- and ZERO furnishing_authorization_items, so `get_client_project_selections`
-- reported origin 'legacy' with an empty list no matter how the RPC was
-- written — the repaired payload had nothing to prove itself against, and the
-- client page had nothing to draw. So this file also lays the smallest
-- commercial fixture that exercises both branches of the repaired payload:
--   · a signed design-services instrument, which is what makes the project
--     `commercial` rather than `legacy`;
--   · a signed furnishings authorization with one line, which is what puts a
--     price the client agreed to on the page;
--   · a signed trade scope, substantially complete, which is the wall the
--     client is asked to accept.
--
-- Touches only client@patina.dev's house. Idempotent: fixed UUIDs, ON CONFLICT,
-- and a guard that skips the whole file if the fixture project is not the dev
-- client's. Must run after first-flight-client-fixture.sql.
--
-- Voice: the page speaks about the studio in the third person; the notes are
-- the designer's own first-person lines, because that is what a note is.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  uid_designer  UUID := 'a0000000-0000-0000-0000-000000000004';  -- Leah Hartwell
  uid_client    UUID := 'a0000000-0000-0000-0000-000000000005';  -- Client User
  v_project     UUID := 'b0000000-0000-0000-0000-0000000000d1';  -- Aspen Loft Refresh
  v_proposal    UUID := 'b0000000-0000-0000-0000-000000000002';  -- the sent proposal

  -- The commercial fixture.
  v_ds_proposal    UUID := 'b0000000-0000-0000-0000-0000000cd001';  -- design services
  v_ds_document    UUID := 'b0000000-0000-0000-0000-0000000cd011';
  v_fa_proposal    UUID := 'b0000000-0000-0000-0000-0000000cd002';  -- furnishings auth
  v_fa_document    UUID := 'b0000000-0000-0000-0000-0000000cd012';
  v_fa_snapshot    UUID := 'b0000000-0000-0000-0000-0000000cd032';  -- authorization item
  v_fa_item        UUID := 'b0000000-0000-0000-0000-0000000cd042';  -- ffe line
  v_fa_thread      UUID := 'b0000000-0000-0000-0000-0000000cd052';
  v_ts_proposal    UUID := 'b0000000-0000-0000-0000-0000000cd003';  -- trade scope
  v_ts_document    UUID := 'b0000000-0000-0000-0000-0000000cd013';
  v_ts_section     UUID := 'b0000000-0000-0000-0000-0000000cd023';
  v_ts_item        UUID := 'b0000000-0000-0000-0000-0000000cd043';
  v_ts_thread      UUID := 'b0000000-0000-0000-0000-0000000cd053';

  -- The page itself.
  v_note_standing  UUID := 'c0000000-0000-0000-0000-00000000c001';
  v_note_retired   UUID := 'c0000000-0000-0000-0000-00000000c002';

  v_relationship   UUID;
  v_room_dining    UUID;
  v_room_living    UUID;
  v_product        UUID;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.projects
     WHERE id = v_project AND client_id = uid_client
  ) THEN
    RAISE NOTICE 'the-client-page.sql: project % is not the dev client''s - run decisions.sql first, skipping', v_project;
    RETURN;
  END IF;

  SELECT id INTO v_relationship
    FROM public.designer_clients
   WHERE designer_id = uid_designer AND client_id = uid_client
   ORDER BY created_at
   LIMIT 1;

  SELECT id INTO v_room_dining
    FROM public.project_rooms
   WHERE project_id = v_project AND name = 'Dining Room'
   LIMIT 1;

  SELECT id INTO v_room_living
    FROM public.project_rooms
   WHERE project_id = v_project AND name = 'Living Room'
   LIMIT 1;

  -- Deterministic, so the image on the page is the same one every reset.
  SELECT id INTO v_product
    FROM public.products
   WHERE images IS NOT NULL AND array_length(images, 1) > 0
   ORDER BY id
   LIMIT 1;

  -- ── 1. The signed design-services instrument ─────────────────────────────
  -- This row alone is what decides `origin` — without it the whole page reads
  -- as a legacy project and every commercial region goes dark.

  INSERT INTO public.proposals (
    id, project_id, designer_id, client_id, designer_client_id, title,
    description, status, document_kind, commercial_state, total_amount,
    subtotal, sent_at, accepted_at, signed_at, signed_by_name,
    created_at, updated_at
  ) VALUES (
    v_ds_proposal, v_project, uid_designer, uid_client, v_relationship,
    'Aspen Loft — Design Services',
    'The studio''s engagement for the loft: survey, plan, specification and the ordering that follows.',
    'accepted', 'design_services', 'executed', 1800000, 1800000,
    NOW() - INTERVAL '120 days', NOW() - INTERVAL '112 days',
    NOW() - INTERVAL '112 days', 'Client User',
    NOW() - INTERVAL '124 days', NOW() - INTERVAL '112 days'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.project_commercial_documents (
    id, project_id, proposal_id, document_kind, wave_name,
    is_origin, bound_at, executed_at, created_by
  ) VALUES (
    v_ds_document, v_project, v_ds_proposal, 'design_services', NULL,
    TRUE, NOW() - INTERVAL '112 days', NOW() - INTERVAL '112 days', uid_designer
  ) ON CONFLICT (id) DO NOTHING;

  -- ── 2. One signed furnishings authorization, one line ───────────────────
  -- The money on this line is the FROZEN client price, not the studio's live
  -- working figure. That is the whole point of the snapshot table.

  INSERT INTO public.proposals (
    id, project_id, designer_id, client_id, designer_client_id, title,
    description, status, document_kind, commercial_state, total_amount,
    subtotal, sent_at, accepted_at, signed_at, signed_by_name,
    created_at, updated_at
  ) VALUES (
    v_fa_proposal, v_project, uid_designer, uid_client, v_relationship,
    'Aspen Loft — Authorization No. 1',
    'The first furnishings authorization: the dining table, agreed and signed.',
    'accepted', 'furnishings_authorization', 'executed', 940000, 940000,
    NOW() - INTERVAL '46 days', NOW() - INTERVAL '41 days',
    NOW() - INTERVAL '41 days', 'Client User',
    NOW() - INTERVAL '48 days', NOW() - INTERVAL '41 days'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.project_commercial_documents (
    id, project_id, proposal_id, document_kind, wave_name,
    is_origin, bound_at, executed_at, created_by
  ) VALUES (
    v_fa_document, v_project, v_fa_proposal, 'furnishings_authorization',
    'Authorization No. 1',
    FALSE, NOW() - INTERVAL '41 days', NOW() - INTERVAL '41 days', uid_designer
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.project_ffe_selection_threads (
    id, project_id, created_by, created_at, updated_at
  ) VALUES
    (v_fa_thread, v_project, uid_designer, NOW() - INTERVAL '41 days', NOW() - INTERVAL '41 days'),
    (v_ts_thread, v_project, uid_designer, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days')
  ON CONFLICT (id) DO NOTHING;

  -- The live schedule line and its frozen snapshot point at each other, so the
  -- line goes in first, the snapshot names it, and the line is then told which
  -- snapshot it stands under. furnishing_authorization_items requires exactly
  -- one source, and source_ffe_item_id is the one a seeded fixture can honour
  -- without forging a draft proposal through its lifecycle authority.
  INSERT INTO public.project_ffe_items (
    id, project_id, project_room_id, product_id, name, ffe_category,
    item_type, status, quantity, unit_price_cents, line_total_cents,
    trade_price_cents, markup_percent, sort_order, doc_code,
    selection_thread_id, design_disposition, assignment_scope,
    created_at, updated_at
  ) VALUES (
    v_fa_item, v_project, v_room_dining, v_product,
    'Walnut dining table, 96"', 'furniture',
    'fixed', 'production', 1, 940000, 940000,
    620000, 51.61, 0, 'FF-101',
    v_fa_thread, 'selected', 'room',
    NOW() - INTERVAL '41 days', NOW() - INTERVAL '9 days'
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.furnishing_authorization_items (
    id, commercial_document_id, source_ffe_item_id, product_id,
    name, room_name, project_room_id, category, item_type, quantity,
    client_unit_price_cents, client_line_total_cents,
    trade_unit_cost_cents, markup_percent, sort_order, created_at
  ) VALUES (
    v_fa_snapshot, v_fa_document, v_fa_item, v_product,
    'Walnut dining table, 96"', 'Dining Room', v_room_dining, 'furniture',
    'fixed', 1, 940000, 940000,
    620000, 51.61, 0, NOW() - INTERVAL '41 days'
  ) ON CONFLICT (id) DO NOTHING;

  -- Both provenance columns move together and only once:
  -- guard_project_ffe_purchase_authority freezes them the moment
  -- source_commercial_document_id is set, which is why the INSERT above leaves
  -- it null.
  UPDATE public.project_ffe_items
     SET source_commercial_document_id = v_fa_document,
         source_authorization_item_id  = v_fa_snapshot
   WHERE id = v_fa_item
     AND source_authorization_item_id IS DISTINCT FROM v_fa_snapshot;

  -- ── 3. One signed trade scope, substantially complete ───────────────────
  -- The paintwork is the wall the client is asked to accept: finished on the
  -- trade's word, standing until she says so herself.

  -- A scope's terms and sections may only be written while its proposal is a
  -- draft (guard_trade_scope_terms), and a commercial proposal may only leave
  -- draft under the row-exact capability GUCs its canonical RPCs set. So the
  -- scope is built as a draft and then signed, exactly as it would be in life.
  -- The whole block is skipped once the proposal exists, which is what makes
  -- re-running this seed safe.
  IF NOT EXISTS (SELECT 1 FROM public.proposals WHERE id = v_ts_proposal) THEN
    INSERT INTO public.proposals (
      id, project_id, designer_id, client_id, designer_client_id, title,
      description, status, document_kind, commercial_state, total_amount,
      subtotal, sent_at, created_at, updated_at
    ) VALUES (
      v_ts_proposal, v_project, uid_designer, uid_client, v_relationship,
      'Aspen Loft — Paintwork and plaster',
      'Wall and ceiling finishes through the living room, by Corbin Finishes.',
      'draft', 'trade_scope', 'draft', 385000, 385000,
      NOW() - INTERVAL '34 days',
      NOW() - INTERVAL '36 days', NOW() - INTERVAL '34 days'
    );

    INSERT INTO public.trade_scope_terms (
      proposal_id, party_display_name, party_company_name, party_trade,
      client_price_cents, terms, progress_state, engaged_at,
      substantial_completion_at, substantial_completion_by,
      created_at, updated_at
    ) VALUES (
      v_ts_proposal, 'Ray Corbin', 'Corbin Finishes', 'painting',
      385000, 'Two coats throughout; plaster repair at the north wall.',
      'substantially_complete', NOW() - INTERVAL '29 days',
      NOW() - INTERVAL '3 days', uid_designer,
      NOW() - INTERVAL '30 days', NOW() - INTERVAL '3 days'
    );

    INSERT INTO public.trade_scope_sections (
      id, proposal_id, project_room_id, room_name, prose,
      allocation_cents, sort_order, created_at, updated_at
    ) VALUES (
      v_ts_section, v_ts_proposal, v_room_living, 'Living Room',
      'Walls and ceiling in flat lime; plaster repair at the north wall before finish.',
      385000, 0, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days'
    );

    PERFORM set_config('app.proposal_accept_id', v_ts_proposal::text, true);
    PERFORM set_config('app.commercial_document_id', v_ts_proposal::text, true);
    UPDATE public.proposals
       SET status = 'accepted',
           commercial_state = 'executed',
           accepted_at = NOW() - INTERVAL '30 days',
           signed_at = NOW() - INTERVAL '30 days',
           signed_by_name = 'Client User',
           updated_at = NOW() - INTERVAL '30 days'
     WHERE id = v_ts_proposal;
    PERFORM set_config('app.proposal_accept_id', '', true);
    PERFORM set_config('app.commercial_document_id', '', true);
  END IF;

  INSERT INTO public.project_commercial_documents (
    id, project_id, proposal_id, document_kind, wave_name,
    is_origin, bound_at, executed_at, created_by
  ) VALUES (
    v_ts_document, v_project, v_ts_proposal, 'trade_scope', NULL,
    FALSE, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days', uid_designer
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.project_ffe_items (
    id, project_id, project_room_id, name, ffe_category,
    item_type, status, quantity, unit_price_cents, line_total_cents,
    sort_order, doc_code, trade_scope_document_id,
    selection_thread_id, design_disposition, assignment_scope,
    created_at, updated_at
  ) VALUES (
    v_ts_item, v_project, v_room_living,
    'Paintwork and plaster', 'trade',
    'fixed', 'installed', 1, 385000, 385000,
    1, 'TS-201', v_ts_document,
    v_ts_thread, 'selected', 'room',
    NOW() - INTERVAL '30 days', NOW() - INTERVAL '3 days'
  ) ON CONFLICT (id) DO NOTHING;

  -- ── 4. The note standing on her page ────────────────────────────────────

  INSERT INTO public.project_notes (
    id, project_id, author_id, body, enclosures, state,
    sent_at, created_at, updated_at
  ) VALUES (
    v_note_standing, v_project, uid_designer,
    'The dining table is cut and on the bench in Dayton. Sign the next authorization and the console and the pair of lamps go on the same truck.',
    jsonb_build_array(jsonb_build_object('kind', 'proposal', 'id', v_proposal::text)),
    'standing',
    NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'
  ) ON CONFLICT (id) DO NOTHING;

  -- ── 5. The note already taken down — this is what Previously is made of ──

  INSERT INTO public.project_notes (
    id, project_id, author_id, body, enclosures, state,
    sent_at, retired_at, created_at, updated_at
  ) VALUES (
    v_note_retired, v_project, uid_designer,
    'I have asked the mill for a second walnut sample before we settle the finish. Nothing needed at your end.',
    '[]'::jsonb,
    'retired',
    NOW() - INTERVAL '11 days', NOW() - INTERVAL '6 days',
    NOW() - INTERVAL '11 days', NOW() - INTERVAL '6 days'
  ) ON CONFLICT (id) DO NOTHING;

  -- ── 6. When she last looked ─────────────────────────────────────────────
  -- Yesterday, so the standing note and the finished paintwork both read as
  -- new the next time the page opens.

  INSERT INTO public.project_reading_marks (project_id, user_id, read_at)
  VALUES (v_project, uid_client, NOW() - INTERVAL '1 day')
  ON CONFLICT (project_id, user_id) DO NOTHING;
END $$;
