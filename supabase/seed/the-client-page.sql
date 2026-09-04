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
    -- 905000 on the LIVE row against 940000 on the signed snapshot below, on
    -- purpose: the client's page must render 940000, the figure she put her name
    -- to, and a page showing 905000 is reading the studio's working row.
    'fixed', 'production', 1, 905000, 905000,
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
  --
  -- ⚠ NEVER LIFT THE set_config LINES BELOW OUT OF A SEED. app.proposal_accept_id
  -- and app.commercial_document_id are the row-exact capability GUCs
  -- guard_proposal_authority and guard_commercial_proposal_authority key on;
  -- setting them by hand executes a commercial instrument without going through
  -- its canonical RPC. That is legitimate for a fixture materialising history
  -- and is a hole anywhere else.
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

-- ═══════════════════════════════════════════════════════════════════════════
-- SOLO CLIENT — the e2e's own house, so it never borrows anyone else's.
--
-- The Threshold's route collapse and solo redirect only fire for a client who
-- owns exactly ONE project. The first draft of the e2e got that by reaching into
-- client@patina.dev's houses and detaching two of them mid-run — shared state,
-- mutated in a beforeAll, while other spec files were running in parallel, and
-- never restored. This client exists so that stops.
--
-- client-solo@patina.dev / password123 (dev-accounts.sql's mechanism and hash),
-- owning exactly one project, "Cedar Lane Study", whose studio_id names the seed
-- designer's Local Dev Studio explicitly. Same minimum commercial fixture shape
-- as the Aspen Loft block above: an executed design-services instrument so the
-- page reads `commercial`, one signed furnishings authorization, one trade scope
-- substantially complete, one open invoice, one standing note, one retired note,
-- one reading mark.
--
-- Fixed UUIDs, idempotent, and guarded: the whole block is skipped once the
-- project exists, because the commercial ceremony below cannot be replayed.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  uid_designer  UUID := 'a0000000-0000-0000-0000-000000000004';  -- Leah Hartwell
  uid_solo      UUID := 'a0000000-0000-0000-0000-00000000c005';
  v_studio      UUID := 'b0000000-0000-0000-0000-000000000001';  -- Local Dev Studio
  v_project     UUID := 'b0000000-0000-0000-0000-00000000c0d1';  -- Cedar Lane Study

  v_room_study  UUID := 'b0000000-0000-0000-0000-00000000ca01';
  v_room_hall   UUID := 'b0000000-0000-0000-0000-00000000ca02';
  v_room_stair  UUID := 'b0000000-0000-0000-0000-00000000ca03';

  v_ds_proposal UUID := 'b0000000-0000-0000-0000-00000000cb01';
  v_ds_document UUID := 'b0000000-0000-0000-0000-00000000cb11';
  v_fa_proposal UUID := 'b0000000-0000-0000-0000-00000000cb02';
  v_fa_document UUID := 'b0000000-0000-0000-0000-00000000cb12';
  v_fa_snapshot UUID := 'b0000000-0000-0000-0000-00000000cb22';
  v_fa_item     UUID := 'b0000000-0000-0000-0000-00000000cb32';
  v_fa_thread   UUID := 'b0000000-0000-0000-0000-00000000cb42';
  v_ts_proposal UUID := 'b0000000-0000-0000-0000-00000000cb03';
  v_ts_document UUID := 'b0000000-0000-0000-0000-00000000cb13';
  v_ts_section  UUID := 'b0000000-0000-0000-0000-00000000cb23';
  v_ts_item     UUID := 'b0000000-0000-0000-0000-00000000cb33';
  v_ts_thread   UUID := 'b0000000-0000-0000-0000-00000000cb43';

  v_invoice     UUID := 'b0000000-0000-0000-0000-00000000cc01';
  v_note_stand  UUID := 'c0000000-0000-0000-0000-00000000c003';
  v_note_retired UUID := 'c0000000-0000-0000-0000-00000000c004';

  v_relationship UUID := 'd0000000-0000-0000-0000-00000000c001';
  v_product     UUID;
  pw_hash       TEXT;
  ts            TIMESTAMPTZ := NOW();
BEGIN
  IF EXISTS (SELECT 1 FROM public.projects WHERE id = v_project) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid_designer) THEN
    RAISE NOTICE 'the-client-page.sql: dev accounts are not seeded yet, skipping the solo client';
    RETURN;
  END IF;

  pw_hash := extensions.crypt('password123', extensions.gen_salt('bf'));

  SELECT id INTO v_product
    FROM public.products
   WHERE images IS NOT NULL AND array_length(images, 1) > 0
   ORDER BY id
   LIMIT 1;

  -- ── The account ─────────────────────────────────────────────────────────

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', uid_solo, 'authenticated', 'authenticated',
    'client-solo@patina.dev', pw_hash, ts,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Nora Ellison"}'::jsonb,
    ts, ts, '', '', '', ''
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    extensions.gen_random_uuid(), uid_solo, uid_solo::text,
    jsonb_build_object('sub', uid_solo::text, 'email', 'client-solo@patina.dev'),
    'email', ts, ts, ts
  ) ON CONFLICT ON CONSTRAINT identities_provider_id_provider_unique DO NOTHING;

  -- handle_new_user pre-creates a bare profile on the auth insert, so this
  -- UPSERTs the intended name and role over it (dev-accounts.sql's note).
  INSERT INTO public.profiles (id, email, full_name, display_name, role, created_at, updated_at)
  VALUES (uid_solo, 'client-solo@patina.dev', 'Nora Ellison', 'Nora Ellison', 'homeowner', ts, ts)
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    updated_at = EXCLUDED.updated_at;

  INSERT INTO public.user_roles (user_id, role_id)
  SELECT uid_solo, id FROM public.roles WHERE name = 'app_user'
  ON CONFLICT (user_id, role_id) DO NOTHING;

  INSERT INTO public.designer_clients (id, designer_id, client_id, status, created_at, updated_at)
  VALUES (v_relationship, uid_designer, uid_solo, 'active', ts, ts)
  ON CONFLICT (id) DO NOTHING;

  -- ── Exactly one house ───────────────────────────────────────────────────
  -- studio_id is set explicitly: the designer portal's studio scoping reads it,
  -- and a project that has to be adopted at test time is shared state again.

  INSERT INTO public.projects (
    id, name, client_id, designer_id, studio_id,
    status, created_by, client_visibility_tier, current_phase,
    budget_cents, total_amount_cents, start_date, created_at, updated_at
  ) VALUES (
    v_project, 'Cedar Lane Study', uid_solo, uid_designer,
    v_studio, 'active', uid_designer, 'full', 'installation',
    1450000, 1450000, (ts - INTERVAL '118 days')::date,
    ts - INTERVAL '120 days', ts
  );

  INSERT INTO public.project_rooms (id, project_id, name, sort_order, created_at, updated_at) VALUES
    (v_room_study, v_project, 'Study',    0, ts, ts),
    (v_room_hall,  v_project, 'Hall',     1, ts, ts),
    (v_room_stair, v_project, 'Stair',    2, ts, ts);

  -- ── The signed design-services instrument: origin 'commercial' ──────────

  INSERT INTO public.proposals (
    id, project_id, designer_id, client_id, designer_client_id, title, description,
    status, document_kind, commercial_state, total_amount, subtotal,
    sent_at, accepted_at, signed_at, signed_by_name, created_at, updated_at
  ) VALUES (
    v_ds_proposal, v_project, uid_designer, uid_solo, v_relationship,
    'Cedar Lane — Design Services',
    'The studio''s engagement for the study, hall and stair.',
    'accepted', 'design_services', 'executed', 640000, 640000,
    ts - INTERVAL '118 days', ts - INTERVAL '112 days',
    ts - INTERVAL '112 days', 'Nora Ellison',
    ts - INTERVAL '120 days', ts - INTERVAL '112 days'
  );

  INSERT INTO public.project_commercial_documents (
    id, project_id, proposal_id, document_kind, wave_name,
    is_origin, bound_at, executed_at, created_by
  ) VALUES (
    v_ds_document, v_project, v_ds_proposal, 'design_services', NULL,
    TRUE, ts - INTERVAL '112 days', ts - INTERVAL '112 days', uid_designer
  );

  -- ── One signed furnishings authorization ───────────────────────────────
  -- 812000 signed against a 780000 live working row, so a page rendering the
  -- studio's figure instead of hers is visible at a glance.

  INSERT INTO public.proposals (
    id, project_id, designer_id, client_id, designer_client_id, title, description,
    status, document_kind, commercial_state, total_amount, subtotal,
    sent_at, accepted_at, signed_at, signed_by_name, created_at, updated_at
  ) VALUES (
    v_fa_proposal, v_project, uid_designer, uid_solo, v_relationship,
    'Cedar Lane — Authorization No. 1',
    'The reading chair and its lamp, agreed and signed.',
    'accepted', 'furnishings_authorization', 'executed', 812000, 812000,
    ts - INTERVAL '40 days', ts - INTERVAL '35 days',
    ts - INTERVAL '35 days', 'Nora Ellison',
    ts - INTERVAL '42 days', ts - INTERVAL '35 days'
  );

  INSERT INTO public.project_commercial_documents (
    id, project_id, proposal_id, document_kind, wave_name,
    is_origin, bound_at, executed_at, created_by
  ) VALUES (
    v_fa_document, v_project, v_fa_proposal, 'furnishings_authorization',
    'Authorization No. 1',
    FALSE, ts - INTERVAL '35 days', ts - INTERVAL '35 days', uid_designer
  );

  INSERT INTO public.project_ffe_selection_threads (id, project_id, created_by, created_at, updated_at)
  VALUES
    (v_fa_thread, v_project, uid_designer, ts - INTERVAL '35 days', ts - INTERVAL '35 days'),
    (v_ts_thread, v_project, uid_designer, ts - INTERVAL '28 days', ts - INTERVAL '28 days');

  INSERT INTO public.project_ffe_items (
    id, project_id, project_room_id, product_id, name, ffe_category,
    item_type, status, quantity, unit_price_cents, line_total_cents,
    trade_price_cents, markup_percent, sort_order, doc_code,
    selection_thread_id, design_disposition, assignment_scope, created_at, updated_at
  ) VALUES (
    v_fa_item, v_project, v_room_study, v_product,
    'Reading chair, oiled oak and shearling', 'furniture',
    'fixed', 'production', 1, 780000, 780000,
    520000, 50.00, 0, 'FF-201',
    v_fa_thread, 'selected', 'room', ts - INTERVAL '35 days', ts - INTERVAL '6 days'
  );

  INSERT INTO public.furnishing_authorization_items (
    id, commercial_document_id, source_ffe_item_id, product_id,
    name, room_name, project_room_id, category, item_type, quantity,
    client_unit_price_cents, client_line_total_cents,
    trade_unit_cost_cents, markup_percent, sort_order, created_at
  ) VALUES (
    v_fa_snapshot, v_fa_document, v_fa_item, v_product,
    'Reading chair, oiled oak and shearling', 'Study', v_room_study, 'furniture',
    'fixed', 1, 812000, 812000,
    520000, 50.00, 0, ts - INTERVAL '35 days'
  );

  UPDATE public.project_ffe_items
     SET source_commercial_document_id = v_fa_document,
         source_authorization_item_id  = v_fa_snapshot
   WHERE id = v_fa_item;

  -- ── One trade scope, substantially complete ────────────────────────────
  -- Built as a draft and then signed: see the ⚠ note on the block above.

  INSERT INTO public.proposals (
    id, project_id, designer_id, client_id, designer_client_id, title, description,
    status, document_kind, commercial_state, total_amount, subtotal,
    sent_at, created_at, updated_at
  ) VALUES (
    v_ts_proposal, v_project, uid_designer, uid_solo, v_relationship,
    'Cedar Lane — Joinery and paint',
    'Built-in shelving to the study''s north wall, and finishes through the hall.',
    'draft', 'trade_scope', 'draft', 298000, 298000,
    ts - INTERVAL '32 days', ts - INTERVAL '34 days', ts - INTERVAL '32 days'
  );

  INSERT INTO public.trade_scope_terms (
    proposal_id, party_display_name, party_company_name, party_trade,
    client_price_cents, terms, progress_state, engaged_at,
    substantial_completion_at, substantial_completion_by, created_at, updated_at
  ) VALUES (
    v_ts_proposal, 'Marta Voss', 'Voss Joinery', 'carpentry',
    298000, 'Shelving to the north wall; hall and stair finishes to follow.',
    'substantially_complete', ts - INTERVAL '27 days',
    ts - INTERVAL '2 days', uid_designer,
    ts - INTERVAL '28 days', ts - INTERVAL '2 days'
  );

  INSERT INTO public.trade_scope_sections (
    id, proposal_id, project_room_id, room_name, prose,
    allocation_cents, sort_order, created_at, updated_at
  ) VALUES (
    v_ts_section, v_ts_proposal, v_room_study, 'Study',
    'Built-in shelving to the north wall, oiled to match the chair.',
    298000, 0, ts - INTERVAL '28 days', ts - INTERVAL '28 days'
  );

  PERFORM set_config('app.proposal_accept_id', v_ts_proposal::text, true);
  PERFORM set_config('app.commercial_document_id', v_ts_proposal::text, true);
  UPDATE public.proposals
     SET status = 'accepted',
         commercial_state = 'executed',
         accepted_at = ts - INTERVAL '28 days',
         signed_at = ts - INTERVAL '28 days',
         signed_by_name = 'Nora Ellison',
         updated_at = ts - INTERVAL '28 days'
   WHERE id = v_ts_proposal;
  PERFORM set_config('app.proposal_accept_id', '', true);
  PERFORM set_config('app.commercial_document_id', '', true);

  INSERT INTO public.project_commercial_documents (
    id, project_id, proposal_id, document_kind, wave_name,
    is_origin, bound_at, executed_at, created_by
  ) VALUES (
    v_ts_document, v_project, v_ts_proposal, 'trade_scope', NULL,
    FALSE, ts - INTERVAL '28 days', ts - INTERVAL '28 days', uid_designer
  );

  INSERT INTO public.project_ffe_items (
    id, project_id, project_room_id, name, ffe_category,
    item_type, status, quantity, unit_price_cents, line_total_cents,
    sort_order, doc_code, trade_scope_document_id,
    selection_thread_id, design_disposition, assignment_scope, created_at, updated_at
  ) VALUES (
    v_ts_item, v_project, v_room_study,
    'Built-in shelving, north wall', 'trade',
    'fixed', 'installed', 1, 298000, 298000,
    1, 'TS-301', v_ts_document,
    v_ts_thread, 'selected', 'room', ts - INTERVAL '28 days', ts - INTERVAL '2 days'
  );

  -- ── One open invoice, for the letterbox ────────────────────────────────

  INSERT INTO public.invoices (
    id, project_id, designer_id, client_id, invoice_number, status,
    issue_date, due_date, payment_terms_days, currency,
    subtotal_cents, tax_rate, tax_cents, total_cents, amount_paid_cents,
    memo, sent_at
  ) VALUES (
    v_invoice, v_project, uid_designer, uid_solo, 'INV-2026-0301', 'sent',
    CURRENT_DATE - 8, CURRENT_DATE + 7, 15, 'USD',
    406000, 0, 0, 406000, 0,
    'Authorization No. 1 — deposit.',
    ts - INTERVAL '8 days'
  );

  -- ── The page itself ────────────────────────────────────────────────────

  INSERT INTO public.project_notes (
    id, project_id, author_id, body, enclosures, state, sent_at, created_at, updated_at
  ) VALUES (
    v_note_stand, v_project, uid_designer,
    'The shelving is up and oiled. Look at it when you can, and if it reads right I will have Marta move on to the hall.',
    jsonb_build_array(jsonb_build_object('kind', 'trade_scope', 'id', v_ts_proposal::text)),
    'standing',
    ts - INTERVAL '1 day', ts - INTERVAL '1 day', ts - INTERVAL '1 day'
  );

  INSERT INTO public.project_notes (
    id, project_id, author_id, body, enclosures, state,
    sent_at, retired_at, created_at, updated_at
  ) VALUES (
    v_note_retired, v_project, uid_designer,
    'The chair shipped from the workshop this morning. Nothing needed at your end.',
    '[]'::jsonb, 'retired',
    ts - INTERVAL '9 days', ts - INTERVAL '5 days',
    ts - INTERVAL '9 days', ts - INTERVAL '5 days'
  );

  INSERT INTO public.project_reading_marks (project_id, user_id, read_at)
  VALUES (v_project, uid_solo, ts - INTERVAL '3 days')
  ON CONFLICT (project_id, user_id) DO NOTHING;
END $$;
