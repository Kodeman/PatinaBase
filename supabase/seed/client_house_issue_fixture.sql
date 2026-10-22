-- ════════════════════════════════════════════════════════════════════════════
-- The House Issue (US-49) — the client page's e2e fixture (US-44's household)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Local only (and staging, by config.toml's derivation rule). Two houses for
-- one homeowner, June Brennan, kept by a studio of their own — Birchwood
-- Studio, Evanston — so no other spec's household is touched:
--
--   Elm Street House  procurement · Living room / Study / Entry · six open
--                     invoices ($600 past due since 25 September, $1,375.00
--                     in all) · a signed authorization: the walnut sideboard
--                     and the linen sofa. The sideboard has two pictures, each
--                     copied to a plate (client_plate_assets) — a maker's
--                     scene, hero-eligible, and a white-ground catalogue shot.
--                     The sofa has no picture: it is drawn.
--   Lake Cottage      one room, no plate at all: the drawn cover, which is
--                     the majority arrival (SQ-1575: 13 of 24 active projects).
--   Garden Flat       one room, one portrait photograph (1100 × 1900): the
--                     portrait hero (SQ-1614). Its own block, below.
--
-- The plate rows are what record_client_plate_asset would have written; their
-- bytes are not in any bucket. Locally the plate route answers 503 (no PLATES
-- binding under `next dev`), so every photograph falls back to its silhouette
-- with "Picture did not load." — tests/house-issue.spec.ts asserts exactly that.
--
-- Idempotent: the whole block returns early once Elm Street House exists.
-- Sign in as june.brennan@patina.dev / password123.

DO $$
DECLARE
  uid_designer  UUID := 'a0000000-0000-0000-0000-000000000004';  -- Leah Hartwell
  uid_june      UUID := 'a0000000-0000-0000-0000-0000000e1a05';
  v_studio      UUID := 'b0000000-0000-0000-0000-0000000e1a00';  -- Birchwood Studio
  v_elm         UUID := 'b0000000-0000-0000-0000-0000000e1a01';  -- Elm Street House
  v_lake        UUID := 'b0000000-0000-0000-0000-0000000e1a02';  -- Lake Cottage
  v_relationship UUID := 'd0000000-0000-0000-0000-0000000e1a01';

  v_living      UUID := 'b0000000-0000-0000-0000-0000000e1b01';
  v_study       UUID := 'b0000000-0000-0000-0000-0000000e1b02';
  v_entry       UUID := 'b0000000-0000-0000-0000-0000000e1b03';
  v_porch       UUID := 'b0000000-0000-0000-0000-0000000e1b04';  -- Lake Cottage

  v_proposal    UUID := 'b0000000-0000-0000-0000-0000000e1c01';
  v_document    UUID := 'b0000000-0000-0000-0000-0000000e1c11';
  v_thread      UUID := 'b0000000-0000-0000-0000-0000000e1c21';
  v_thread_2    UUID := 'b0000000-0000-0000-0000-0000000e1c22';
  v_sideboard   UUID := 'b0000000-0000-0000-0000-0000000e1d01';
  v_sofa        UUID := 'b0000000-0000-0000-0000-0000000e1d02';
  v_sideboard_s UUID := 'b0000000-0000-0000-0000-0000000e1d11';
  v_sofa_s      UUID := 'b0000000-0000-0000-0000-0000000e1d12';

  v_picture_scene UUID := 'b0000000-0000-0000-0000-0000000e1e01';
  v_picture_white UUID := 'b0000000-0000-0000-0000-0000000e1e02';
  v_plate_scene   UUID := 'b0000000-0000-0000-0000-0000000e1f01';
  v_plate_white   UUID := 'b0000000-0000-0000-0000-0000000e1f02';

  pw_hash       TEXT;
  ts            TIMESTAMPTZ := NOW();
BEGIN
  IF EXISTS (SELECT 1 FROM public.projects WHERE id = v_elm) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = uid_designer) THEN
    RAISE NOTICE 'client_house_issue_fixture.sql: dev accounts are not seeded yet, skipping';
    RETURN;
  END IF;

  pw_hash := extensions.crypt('password123', extensions.gen_salt('bf'));

  -- ── The studio and the homeowner ────────────────────────────────────────
  -- No membership row: the designer stays in Local Dev Studio, so every other
  -- spec's resolve_studio_identity answer is unchanged.

  INSERT INTO public.organizations (id, type, name, slug, settings, status, address)
  VALUES (v_studio, 'design_studio', 'Birchwood Studio', 'birchwood-studio-fixture', '{}'::jsonb, 'active',
          '{"city": "Evanston"}'::jsonb)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, recovery_token,
    email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', uid_june, 'authenticated', 'authenticated',
    'june.brennan@patina.dev', pw_hash, ts,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"June Brennan"}'::jsonb,
    ts, ts, '', '', '', ''
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (
    id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
  ) VALUES (
    extensions.gen_random_uuid(), uid_june, uid_june::text,
    jsonb_build_object('sub', uid_june::text, 'email', 'june.brennan@patina.dev'),
    'email', ts, ts, ts
  ) ON CONFLICT ON CONSTRAINT identities_provider_id_provider_unique DO NOTHING;

  INSERT INTO public.profiles (id, email, full_name, display_name, role, created_at, updated_at)
  VALUES (uid_june, 'june.brennan@patina.dev', 'June Brennan', 'June Brennan', 'homeowner', ts, ts)
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    display_name = EXCLUDED.display_name,
    role = EXCLUDED.role,
    updated_at = EXCLUDED.updated_at;

  INSERT INTO public.user_roles (user_id, role_id)
  SELECT uid_june, id FROM public.roles WHERE name = 'app_user'
  ON CONFLICT (user_id, role_id) DO NOTHING;

  INSERT INTO public.designer_clients (id, designer_id, client_id, status, created_at, updated_at)
  VALUES (v_relationship, uid_designer, uid_june, 'active', ts, ts)
  ON CONFLICT (id) DO NOTHING;

  -- ── Two houses ──────────────────────────────────────────────────────────
  -- Elm Street moved last, so "/" lands there; Lake Cottage opens by name.

  INSERT INTO public.projects (
    id, name, client_id, designer_id, studio_id,
    status, created_by, client_visibility_tier, current_phase,
    budget_cents, total_amount_cents, start_date, created_at, updated_at
  ) VALUES
    (v_elm, 'Elm Street House', uid_june, uid_designer, v_studio,
     'active', uid_designer, 'full', 'procurement',
     2400000, 2400000, (ts - INTERVAL '90 days')::date, ts - INTERVAL '92 days', ts),
    (v_lake, 'Lake Cottage', uid_june, uid_designer, v_studio,
     'active', uid_designer, 'full', 'design_development',
     600000, 600000, (ts - INTERVAL '20 days')::date, ts - INTERVAL '21 days', ts - INTERVAL '2 days');

  INSERT INTO public.project_rooms (id, project_id, name, sort_order, created_at, updated_at) VALUES
    (v_living, v_elm,  'Living room', 0, ts, ts),
    (v_study,  v_elm,  'Study',       1, ts, ts),
    (v_entry,  v_elm,  'Entry',       2, ts, ts),
    (v_porch,  v_lake, 'Porch',       0, ts, ts);

  -- ── The signed furnishings authorization: two lines in the living room ──

  INSERT INTO public.proposals (
    id, project_id, designer_id, client_id, designer_client_id, title, description,
    status, document_kind, commercial_state, total_amount, subtotal,
    sent_at, accepted_at, signed_at, signed_by_name, created_at, updated_at
  ) VALUES (
    v_proposal, v_elm, uid_designer, uid_june, v_relationship,
    'Elm Street — Authorization No. 1',
    'The living room''s sideboard and sofa, agreed and signed.',
    'accepted', 'furnishings_authorization', 'executed', 1290000, 1290000,
    ts - INTERVAL '40 days', ts - INTERVAL '35 days',
    ts - INTERVAL '35 days', 'June Brennan',
    ts - INTERVAL '42 days', ts - INTERVAL '35 days'
  );

  INSERT INTO public.project_commercial_documents (
    id, project_id, proposal_id, document_kind, wave_name,
    is_origin, bound_at, executed_at, created_by
  ) VALUES (
    v_document, v_elm, v_proposal, 'furnishings_authorization', 'Authorization No. 1',
    FALSE, ts - INTERVAL '35 days', ts - INTERVAL '35 days', uid_designer
  );

  INSERT INTO public.project_ffe_selection_threads (id, project_id, created_by, created_at, updated_at)
  VALUES (v_thread, v_elm, uid_designer, ts - INTERVAL '35 days', ts - INTERVAL '35 days'),
         (v_thread_2, v_elm, uid_designer, ts - INTERVAL '35 days', ts - INTERVAL '35 days');

  INSERT INTO public.project_ffe_items (
    id, project_id, project_room_id, name, ffe_category,
    item_type, status, quantity, unit_price_cents, line_total_cents,
    trade_price_cents, markup_percent, sort_order, doc_code,
    selection_thread_id, design_disposition, assignment_scope, created_at, updated_at
  ) VALUES
    (v_sideboard, v_elm, v_living, 'Walnut sideboard', 'furniture',
     'fixed', 'production', 1, 690000, 690000,
     460000, 50.00, 0, 'FF-101',
     v_thread, 'selected', 'room', ts - INTERVAL '35 days', ts - INTERVAL '4 days'),
    (v_sofa, v_elm, v_living, 'Linen sofa', 'furniture',
     'fixed', 'ordered', 1, 600000, 600000,
     400000, 50.00, 1, 'FF-102',
     v_thread_2, 'selected', 'room', ts - INTERVAL '35 days', ts - INTERVAL '4 days');

  INSERT INTO public.furnishing_authorization_items (
    id, commercial_document_id, source_ffe_item_id,
    name, room_name, project_room_id, category, item_type, quantity,
    client_unit_price_cents, client_line_total_cents,
    trade_unit_cost_cents, markup_percent, sort_order, created_at
  ) VALUES
    (v_sideboard_s, v_document, v_sideboard,
     'Walnut sideboard', 'Living room', v_living, 'furniture', 'fixed', 1,
     690000, 690000, 460000, 50.00, 0, ts - INTERVAL '35 days'),
    (v_sofa_s, v_document, v_sofa,
     'Linen sofa', 'Living room', v_living, 'furniture', 'fixed', 1,
     600000, 600000, 400000, 50.00, 1, ts - INTERVAL '35 days');

  UPDATE public.project_ffe_items
     SET source_commercial_document_id = v_document,
         source_authorization_item_id  = CASE id WHEN v_sideboard THEN v_sideboard_s ELSE v_sofa_s END
   WHERE id IN (v_sideboard, v_sofa);

  -- ── The sideboard's two pictures, each copied to a plate ────────────────
  -- The insert trigger (00843) queues one copy request per picture; the
  -- requests are then marked done against the plates, as the copier would.

  INSERT INTO public.project_ffe_item_images (
    id, item_id, project_id, url, source, position, is_primary, created_by, created_at
  ) VALUES
    (v_picture_scene, v_sideboard, v_elm,
     'https://images.example.test/birchwood/walnut-sideboard-room.jpg', 'library', 0, TRUE, uid_designer, ts - INTERVAL '30 days'),
    (v_picture_white, v_sideboard, v_elm,
     'https://images.example.test/birchwood/walnut-sideboard-white.jpg', 'library', 1, FALSE, uid_designer, ts - INTERVAL '30 days');

  INSERT INTO public.client_plate_assets (
    id, project_id, sha256, source_kind, source_ref, original_key,
    width, height, ground, dominant_hex, lqip, crops, created_at, updated_at
  ) VALUES
    (v_plate_scene, v_elm,
     'e1a0000000000000000000000000000000000000000000000000000000005ce1', 'maker',
     jsonb_build_object('table', 'project_ffe_item_images', 'id', v_picture_scene),
     'plates/' || v_elm || '/e1a0000000000000000000000000000000000000000000000000000000005ce1/original',
     2400, 1600, 'scene', '#6B4F3A', NULL,
     '{"wide":        {"rect": [0, 0, 2400, 1500],    "widths": [1280, 1600, 2048]},
       "cover_phone": {"rect": [282, 0, 1835, 1600], "widths": [640, 828, 1080]},
       "wide32":      {"rect": [0, 0, 2400, 1600],    "widths": [768, 1024, 1600]},
       "piece":       {"rect": [400, 0, 1600, 1600],  "widths": [256, 512, 768]}}'::jsonb,
     ts - INTERVAL '29 days', ts - INTERVAL '29 days'),
    (v_plate_white, v_elm,
     'e1a000000000000000000000000000000000000000000000000000000000a11e', 'maker',
     jsonb_build_object('table', 'project_ffe_item_images', 'id', v_picture_white),
     'plates/' || v_elm || '/e1a000000000000000000000000000000000000000000000000000000000a11e/original',
     1200, 1200, 'white', '#F4F1EC', NULL,
     '{"piece": {"rect": [0, 0, 1200, 1200], "widths": [256, 512, 768]}}'::jsonb,
     ts - INTERVAL '29 days', ts - INTERVAL '29 days');

  UPDATE public.client_plate_requests AS request
     SET status = 'done',
         asset_id = CASE request.source_ref ->> 'id'
                      WHEN v_picture_scene::text THEN v_plate_scene
                      ELSE v_plate_white
                    END,
         attempts = 1,
         updated_at = ts - INTERVAL '29 days'
   WHERE request.project_id = v_elm
     AND request.source_ref ->> 'table' = 'project_ffe_item_images'
     AND request.source_ref ->> 'id' IN (v_picture_scene::text, v_picture_white::text);

  -- ── Six open invoices: $1,375.00, one of them past due ──────────────────

  INSERT INTO public.invoices (
    id, project_id, designer_id, client_id, invoice_number, status,
    issue_date, due_date, payment_terms_days, currency,
    subtotal_cents, tax_rate, tax_cents, total_cents, amount_paid_cents,
    memo, sent_at
  )
  SELECT ('b0000000-0000-0000-0000-0000000e1a1' || n)::uuid, v_elm, uid_designer, uid_june,
         'BW-2026-01' || n, 'sent',
         due - 14, due, 14, 'USD',
         cents, 0, 0, cents, 0,
         'Elm Street — invoice ' || n || '.', ts - INTERVAL '30 days'
  FROM (VALUES
    (1, 60000, DATE '2026-09-25'),
    (2, 10000, CURRENT_DATE + 7),
    (3, 30000, CURRENT_DATE + 14),
    (4, 25000, CURRENT_DATE + 21),
    (5,  5000, CURRENT_DATE + 28),
    (6,  7500, CURRENT_DATE + 35)
  ) AS bill(n, cents, due);

  -- ── One standing note, read before her last visit: `#note` stands (SQ-1614) ─

  INSERT INTO public.project_notes (id, project_id, author_id, body, state, sent_at, created_at, updated_at)
  VALUES (
    'b0000000-0000-0000-0000-0000000e1c31', v_elm, uid_designer,
    'The walnut for the sideboard came in a shade darker than your sample. I have asked the workshop for a second board before anything is cut.',
    'standing', ts - INTERVAL '10 days', ts - INTERVAL '10 days', ts - INTERVAL '10 days'
  );

  INSERT INTO public.project_reading_marks (project_id, user_id, read_at)
  VALUES (v_elm, uid_june, ts - INTERVAL '3 days'), (v_lake, uid_june, ts - INTERVAL '3 days')
  ON CONFLICT (project_id, user_id) DO NOTHING;
END $$;

-- ── Elm Street House's editions (US-49 Phase 2, SQ-1591) ──────────────────
-- Edition 1 failed to compose; Edition 2 is approved by the studio a day ago
-- (after June's last reading, so the note it opens is ticked as one change);
-- Edition 3 waits for the studio and never reaches the homeowner. The rows
-- are what finish_client_edition and approve_client_edition would have
-- written; the facts are the house as get_project_editorial_facts reads it.
-- Edition 2 heroes the sideboard's workshop picture with its own caption,
-- and nothing approved stands behind it: undo_client_edition returns the page
-- to the Phase 1 composition. Idempotent on Edition 2's id.

DO $$
DECLARE
  uid_designer UUID := 'a0000000-0000-0000-0000-000000000004';
  v_elm        UUID := 'b0000000-0000-0000-0000-0000000e1a01';
  v_living     UUID := 'b0000000-0000-0000-0000-0000000e1b01';
  v_plate      UUID := 'b0000000-0000-0000-0000-0000000e1f01';
  v_failed     UUID := 'b0000000-0000-0000-0000-0000000e2a01';
  v_approved   UUID := 'b0000000-0000-0000-0000-0000000e2a02';
  v_waiting    UUID := 'b0000000-0000-0000-0000-0000000e2a03';
  v_facts      JSONB;
  ts           TIMESTAMPTZ := NOW();
BEGIN
  IF to_regclass('public.client_editions') IS NULL THEN
    RAISE NOTICE 'client_house_issue_fixture.sql: client_editions (00844) is not migrated, skipping the editions';
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM public.client_editions WHERE id = v_approved) THEN
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.client_plate_assets WHERE id = v_plate) THEN
    RAISE NOTICE 'client_house_issue_fixture.sql: Elm Street House is not seeded yet, skipping its editions';
    RETURN;
  END IF;

  v_facts := public.get_project_editorial_facts(v_elm);

  INSERT INTO public.client_editions (
    id, project_id, seq, status, kind, source_hash, composition, facts, overrides,
    prompt_version, model, cost_usd, auto_published,
    reviewed_by, reviewed_at, approved_at, created_at, updated_at
  ) VALUES
    (v_failed, v_elm, 1, 'failed', NULL, NULL, NULL, NULL, '{}'::jsonb,
     'e1', NULL, 0, FALSE,
     NULL, NULL, NULL, ts - INTERVAL '5 days', ts - INTERVAL '5 days'),
    (v_approved, v_elm, 2, 'approved', 'full', repeat('e2', 32),
     jsonb_build_object(
       'sourceHash', repeat('e2', 32),
       'voice', 'model',
       'hero', jsonb_build_object('assetId', v_plate, 'why', 'The workshop photographed her sideboard.'),
       'held', '[]'::jsonb,
       'chapters', jsonb_build_array(
         jsonb_build_object('key', 'cover', 'headline', 'Your walnut sideboard is planed and waiting on the workbench',
                            'standing', 'The workshop has planed the walnut top.'),
         jsonb_build_object('key', 'house', 'headline', 'Three rooms, and the light between them',
                            'standing', 'Every room is drawn and agreed.'),
         jsonb_build_object('key', 'room-' || v_living, 'headline', 'Walnut, linen and a lot of light',
                            'standing', 'The sideboard is on the bench; the sofa is ordered.'),
         jsonb_build_object('key', 'progress', 'headline', 'Planed this week, shipped in the new year',
                            'standing', 'Nothing is late.')
       ),
       'doorstep', jsonb_build_object('standing', 'The house is being made.'),
       'notice', 'The page now opens on your sideboard; the workshop sent photographs on 15 October. Everything else is where it was.'
     ),
     v_facts, '{}'::jsonb,
     'e1', 'fixture', 0, FALSE,
     uid_designer, ts - INTERVAL '1 day', ts - INTERVAL '1 day', ts - INTERVAL '2 days', ts - INTERVAL '1 day'),
    (v_waiting, v_elm, 3, 'awaiting_review', 'full', repeat('e3', 32),
     jsonb_build_object(
       'sourceHash', repeat('e3', 32),
       'voice', 'model',
       'hero', jsonb_build_object('assetId', v_plate, 'why', NULL),
       'held', '[]'::jsonb,
       'chapters', jsonb_build_array(
         jsonb_build_object('key', 'cover', 'headline', 'Not yet approved by the studio', 'standing', NULL)
       ),
       'doorstep', jsonb_build_object('standing', NULL),
       'notice', 'This edition waits for the studio and is never shown.'
     ),
     v_facts, '{}'::jsonb,
     'e1', 'fixture', 0, FALSE,
     NULL, NULL, NULL, ts - INTERVAL '2 hours', ts - INTERVAL '2 hours');

  INSERT INTO public.client_edition_images (
    edition_id, asset_id, plate_role, crop_key, rank, chapter_key,
    alt, caption_what, caption_whose, caption_when
  ) VALUES
    (v_approved, v_plate, 'hero', 'none', 0, 'cover',
     'A walnut sideboard top on a workshop bench', 'Walnut top, planed', 'Harmon Bench Works', '15 October 2026'),
    (v_waiting, v_plate, 'hero', 'none', 0, 'cover',
     'A walnut sideboard top on a workshop bench', 'Not yet approved', 'Harmon Bench Works', '20 October 2026');
END $$;

-- ── Garden Flat: the portrait hero (SQ-1614) ──────────────────────────────
-- One signed line, an oak tallboy, whose one picture is a portrait 1100 × 1900.
-- floors.ts places it as the `portrait` hero: under `wide`'s 1600 floor and
-- the 1248 measure, at or over the 1040 portrait floor. Its crops are what
-- plates.mjs plans for that size: `cover_phone`, `tall` and `piece` (wide and
-- wide32 miss their floors; pair would discard more than half). Every clock is
-- two months old, so "/" still lands on Elm Street House. Idempotent on its
-- own house; it needs June and her studio from the block above.

DO $$
DECLARE
  uid_designer   UUID := 'a0000000-0000-0000-0000-000000000004';
  uid_june       UUID := 'a0000000-0000-0000-0000-0000000e1a05';
  v_studio       UUID := 'b0000000-0000-0000-0000-0000000e1a00';
  v_relationship UUID := 'd0000000-0000-0000-0000-0000000e1a01';
  v_garden       UUID := 'b0000000-0000-0000-0000-0000000e1a03';
  v_bedroom      UUID := 'b0000000-0000-0000-0000-0000000e1b05';
  v_proposal     UUID := 'b0000000-0000-0000-0000-0000000e1c02';
  v_document     UUID := 'b0000000-0000-0000-0000-0000000e1c12';
  v_thread       UUID := 'b0000000-0000-0000-0000-0000000e1c23';
  v_tallboy      UUID := 'b0000000-0000-0000-0000-0000000e1d03';
  v_tallboy_s    UUID := 'b0000000-0000-0000-0000-0000000e1d13';
  v_picture      UUID := 'b0000000-0000-0000-0000-0000000e1e03';
  v_plate        UUID := 'b0000000-0000-0000-0000-0000000e1f03';
  v_sha          TEXT := 'e1a0000000000000000000000000000000000000000000000000000000007a11';
  ts             TIMESTAMPTZ := NOW() - INTERVAL '60 days';
BEGIN
  IF EXISTS (SELECT 1 FROM public.projects WHERE id = v_garden) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.designer_clients WHERE id = v_relationship) THEN
    RAISE NOTICE 'client_house_issue_fixture.sql: June Brennan is not seeded yet, skipping Garden Flat';
    RETURN;
  END IF;

  INSERT INTO public.projects (
    id, name, client_id, designer_id, studio_id,
    status, created_by, client_visibility_tier, current_phase,
    budget_cents, total_amount_cents, start_date, created_at, updated_at
  ) VALUES (
    v_garden, 'Garden Flat', uid_june, uid_designer, v_studio,
    'active', uid_designer, 'full', 'procurement',
    900000, 900000, (ts - INTERVAL '30 days')::date, ts - INTERVAL '31 days', ts
  );

  INSERT INTO public.project_rooms (id, project_id, name, sort_order, created_at, updated_at)
  VALUES (v_bedroom, v_garden, 'Bedroom', 0, ts, ts);

  INSERT INTO public.proposals (
    id, project_id, designer_id, client_id, designer_client_id, title, description,
    status, document_kind, commercial_state, total_amount, subtotal,
    sent_at, accepted_at, signed_at, signed_by_name, created_at, updated_at
  ) VALUES (
    v_proposal, v_garden, uid_designer, uid_june, v_relationship,
    'Garden Flat — Authorization No. 1',
    'The bedroom''s tallboy, agreed and signed.',
    'accepted', 'furnishings_authorization', 'executed', 480000, 480000,
    ts - INTERVAL '20 days', ts - INTERVAL '18 days',
    ts - INTERVAL '18 days', 'June Brennan',
    ts - INTERVAL '22 days', ts - INTERVAL '18 days'
  );

  INSERT INTO public.project_commercial_documents (
    id, project_id, proposal_id, document_kind, wave_name,
    is_origin, bound_at, executed_at, created_by
  ) VALUES (
    v_document, v_garden, v_proposal, 'furnishings_authorization', 'Authorization No. 1',
    FALSE, ts - INTERVAL '18 days', ts - INTERVAL '18 days', uid_designer
  );

  INSERT INTO public.project_ffe_selection_threads (id, project_id, created_by, created_at, updated_at)
  VALUES (v_thread, v_garden, uid_designer, ts - INTERVAL '18 days', ts - INTERVAL '18 days');

  INSERT INTO public.project_ffe_items (
    id, project_id, project_room_id, name, ffe_category,
    item_type, status, quantity, unit_price_cents, line_total_cents,
    trade_price_cents, markup_percent, sort_order, doc_code,
    selection_thread_id, design_disposition, assignment_scope, created_at, updated_at
  ) VALUES (
    v_tallboy, v_garden, v_bedroom, 'Oak tallboy', 'furniture',
    'fixed', 'production', 1, 480000, 480000,
    320000, 50.00, 0, 'FF-201',
    v_thread, 'selected', 'room', ts - INTERVAL '18 days', ts - INTERVAL '2 days'
  );

  INSERT INTO public.furnishing_authorization_items (
    id, commercial_document_id, source_ffe_item_id,
    name, room_name, project_room_id, category, item_type, quantity,
    client_unit_price_cents, client_line_total_cents,
    trade_unit_cost_cents, markup_percent, sort_order, created_at
  ) VALUES (
    v_tallboy_s, v_document, v_tallboy,
    'Oak tallboy', 'Bedroom', v_bedroom, 'furniture', 'fixed', 1,
    480000, 480000, 320000, 50.00, 0, ts - INTERVAL '18 days'
  );

  UPDATE public.project_ffe_items
     SET source_commercial_document_id = v_document,
         source_authorization_item_id  = v_tallboy_s
   WHERE id = v_tallboy;

  INSERT INTO public.project_ffe_item_images (
    id, item_id, project_id, url, source, position, is_primary, created_by, created_at
  ) VALUES (
    v_picture, v_tallboy, v_garden,
    'https://images.example.test/birchwood/oak-tallboy-room.jpg', 'library', 0, TRUE, uid_designer, ts - INTERVAL '15 days'
  );

  INSERT INTO public.client_plate_assets (
    id, project_id, sha256, source_kind, source_ref, original_key,
    width, height, ground, dominant_hex, lqip, crops, created_at, updated_at
  ) VALUES (
    v_plate, v_garden, v_sha, 'maker',
    jsonb_build_object('table', 'project_ffe_item_images', 'id', v_picture),
    'plates/' || v_garden || '/' || v_sha || '/original',
    1100, 1900, 'scene', '#7A6450', NULL,
    '{"cover_phone": {"rect": [0, 376, 1100, 959], "widths": [640, 828, 1080]},
      "tall":        {"rect": [113, 0, 874, 1900], "widths": [640, 828]},
      "piece":       {"rect": [0, 0, 1100, 1900],  "widths": [256, 512, 768]}}'::jsonb,
    ts - INTERVAL '14 days', ts - INTERVAL '14 days'
  );

  UPDATE public.client_plate_requests AS request
     SET status = 'done',
         asset_id = v_plate,
         attempts = 1,
         updated_at = ts - INTERVAL '14 days'
   WHERE request.project_id = v_garden
     AND request.source_ref ->> 'table' = 'project_ffe_item_images'
     AND request.source_ref ->> 'id' = v_picture::text;

  INSERT INTO public.project_reading_marks (project_id, user_id, read_at)
  VALUES (v_garden, uid_june, ts)
  ON CONFLICT (project_id, user_id) DO NOTHING;
END $$;
