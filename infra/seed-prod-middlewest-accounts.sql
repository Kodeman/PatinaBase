-- =============================================================================
-- Patina: prod test accounts — Middlewest Studio (designer + client)
-- =============================================================================
-- Idempotent. Single transaction.
--
-- Designer:  kody@middlewest.studio (existing auth user — roles fixed only)
-- Client:    client@middlewest.studio (created fresh, password pre-confirmed)
--
-- All seeded data UUIDs are prefixed `99999999-9999-9999-9999-...` so cleanup
-- is a single `WHERE id::text LIKE '99999999-9999-9999-9999-%'` per table.
-- This prefix is visually distinct from the existing kody@kochaver.com seed
-- (which uses `00000000-...`) and from any real gen_random_uuid() output.
--
-- Counts seeded:
--   8 projects / 12 rooms / 52 client_decisions / 9 comms_threads / 72 comms_messages
--   1 vendor / 8 products / 1 designer_clients link
--
-- Usage: see infra/seed-prod-middlewest-accounts.sh
--   psql is expected to set the `client_password` variable via `-v client_password=...`.
-- =============================================================================

\set ON_ERROR_STOP on

-- Hard refuse if the client_password variable wasn't provided. Avoids creating
-- the account with an empty bcrypt'd password.
\if :{?client_password}
\else
\echo 'ERROR: psql variable client_password is required. Pass via -v client_password=...'
\quit
\endif

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Refuse to run if the designer auth user is missing.
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'kody@middlewest.studio') THEN
    RAISE EXCEPTION 'auth user kody@middlewest.studio not found — sign up via the iOS app first';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. Ensure designer profile + roles. UPSERT keeps the existing row if any
--    other fields (full_name, avatar_url, etc.) have been set by the iOS
--    onboarding flow — we only force role + display_name.
-- ---------------------------------------------------------------------------
DO $$
DECLARE designer_uid uuid;
BEGIN
  SELECT id INTO designer_uid FROM auth.users WHERE email = 'kody@middlewest.studio';

  INSERT INTO public.profiles (id, email, display_name, role, created_at, updated_at)
  VALUES (designer_uid, 'kody@middlewest.studio', 'Kody (Middlewest Studio)', 'designer', NOW(), NOW())
  ON CONFLICT (id) DO UPDATE
    SET role = 'designer',
        display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
        updated_at = NOW();

  INSERT INTO public.user_roles (user_id, role_id)
    SELECT designer_uid, id FROM public.roles WHERE name IN ('independent_designer', 'app_user')
    ON CONFLICT (user_id, role_id) DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Create the client auth user (pre-confirmed bcrypt password).
--    Mirrors supabase/seed/dev-accounts.sql pattern. The four empty-string
--    token columns are required: Supabase trips on NULL there.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  client_uid uuid := '99999999-9999-9999-9999-aaaaaaaaaaa1';
  pw_hash    text := crypt(:'client_password', gen_salt('bf'));
  ts         timestamptz := NOW();
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', client_uid, 'authenticated', 'authenticated',
    'client@middlewest.studio', pw_hash, ts,
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"Middlewest Client"}'::jsonb, ts, ts, '', '', '', ''
  ) ON CONFLICT (id) DO NOTHING;

  INSERT INTO auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  VALUES (
    gen_random_uuid(), client_uid, client_uid::text,
    jsonb_build_object('sub', client_uid::text, 'email', 'client@middlewest.studio'),
    'email', ts, ts, ts
  ) ON CONFLICT ON CONSTRAINT identities_provider_id_provider_unique DO NOTHING;

  INSERT INTO public.profiles (id, email, display_name, role, created_at, updated_at)
  VALUES (client_uid, 'client@middlewest.studio', 'Middlewest Client', 'homeowner', ts, ts)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role_id)
    SELECT client_uid, id FROM public.roles WHERE name IN ('client', 'app_user')
    ON CONFLICT (user_id, role_id) DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Link designer ↔ client.
-- ---------------------------------------------------------------------------
INSERT INTO public.designer_clients (id, designer_id, client_id, status, source, nickname)
SELECT
  '99999999-9999-9999-9999-bbbbbbbbbbbb'::uuid,
  (SELECT id FROM auth.users WHERE email = 'kody@middlewest.studio'),
  '99999999-9999-9999-9999-aaaaaaaaaaa1'::uuid,
  'active', 'direct', 'Middlewest test client'
ON CONFLICT (designer_id, client_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Vendor + 8 FF&E products.
-- ---------------------------------------------------------------------------
INSERT INTO public.vendors (id, name)
VALUES ('99999999-9999-9999-9999-cccccccccccc', 'Middlewest Showroom (seed)')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.products (id, name, slug, vendor_id, price_retail, status, captured_by, captured_at)
SELECT
  prod.id, prod.name, prod.slug,
  '99999999-9999-9999-9999-cccccccccccc'::uuid,
  prod.price,
  'published',
  (SELECT id FROM auth.users WHERE email = 'kody@middlewest.studio'),
  NOW()
FROM (VALUES
  ('99999999-9999-9999-9999-dddddddd0001'::uuid, 'Oak Dining Table (mws)',       'mws-oak-dining',        345000),
  ('99999999-9999-9999-9999-dddddddd0002'::uuid, 'Linen Sectional Sofa (mws)',   'mws-linen-sectional',   525000),
  ('99999999-9999-9999-9999-dddddddd0003'::uuid, 'Walnut Sideboard (mws)',       'mws-walnut-sideboard',  248000),
  ('99999999-9999-9999-9999-dddddddd0004'::uuid, 'Brass Pendant Light (mws)',    'mws-brass-pendant',      98000),
  ('99999999-9999-9999-9999-dddddddd0005'::uuid, 'Wool Berber Rug (mws)',        'mws-wool-berber',       162000),
  ('99999999-9999-9999-9999-dddddddd0006'::uuid, 'Mid-Century Lounge Chair (mws)','mws-midcentury-lounge', 189000),
  ('99999999-9999-9999-9999-dddddddd0007'::uuid, 'Marble Coffee Table (mws)',    'mws-marble-coffee',     142000),
  ('99999999-9999-9999-9999-dddddddd0008'::uuid, 'Linen Drapery Set (mws)',      'mws-linen-drapery',      78000)
) AS prod(id, name, slug, price)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 6. 8 Projects.
--    Distribution: 5 active, 2 completed, 1 archived (matches projects.status
--    enum from migration 00001 — 'active' | 'completed' | 'archived'). Phase
--    progress lives on project_phases, but for the dashboard count we only
--    need rows in `projects` keyed by designer_id + client_id.
-- ---------------------------------------------------------------------------
INSERT INTO public.projects (id, name, designer_id, client_id, status, budget_cents, notes)
SELECT
  proj.id, proj.name,
  (SELECT id FROM auth.users WHERE email = 'kody@middlewest.studio'),
  '99999999-9999-9999-9999-aaaaaaaaaaa1'::uuid,
  proj.status::project_status,
  proj.budget,
  'Middlewest Studio seed — production demo data.'
FROM (VALUES
  ('99999999-9999-9999-9999-eeeeeeee0001'::uuid, 'Smith Residence — Living Room',     'active',    4500000),
  ('99999999-9999-9999-9999-eeeeeeee0002'::uuid, 'Anderson Loft — Whole Home',        'active',   12500000),
  ('99999999-9999-9999-9999-eeeeeeee0003'::uuid, 'Park Avenue Apartment',             'active',    7200000),
  ('99999999-9999-9999-9999-eeeeeeee0004'::uuid, 'Brooklyn Brownstone',               'active',    8800000),
  ('99999999-9999-9999-9999-eeeeeeee0005'::uuid, 'Hudson Valley Retreat',             'active',    9300000),
  ('99999999-9999-9999-9999-eeeeeeee0006'::uuid, 'SoHo Studio',                       'completed', 3100000),
  ('99999999-9999-9999-9999-eeeeeeee0007'::uuid, 'Bridgehampton Cottage',             'completed', 5400000),
  ('99999999-9999-9999-9999-eeeeeeee0008'::uuid, 'Tribeca Penthouse (archive)',       'archived',  6700000)
) AS proj(id, name, status, budget)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. 12 project_rooms.
--    Distribution: projects 1-4 → 2 rooms each (8); projects 5-7 → 1 room each (3);
--    project 8 (archived) → 1 room (1). Total = 12.
-- ---------------------------------------------------------------------------
INSERT INTO public.project_rooms (id, project_id, name, room_type, budget_cents, sort_order)
VALUES
  -- Project 1 (Smith — Living Room)
  ('99999999-9999-9999-9999-ffffffff0001', '99999999-9999-9999-9999-eeeeeeee0001', 'Living Room',         'living_room', 2500000, 0),
  ('99999999-9999-9999-9999-ffffffff0002', '99999999-9999-9999-9999-eeeeeeee0001', 'Dining Nook',         'dining_room', 2000000, 1),
  -- Project 2 (Anderson Loft)
  ('99999999-9999-9999-9999-ffffffff0003', '99999999-9999-9999-9999-eeeeeeee0002', 'Great Room',          'living_room', 6500000, 0),
  ('99999999-9999-9999-9999-ffffffff0004', '99999999-9999-9999-9999-eeeeeeee0002', 'Primary Bedroom',     'bedroom',     6000000, 1),
  -- Project 3 (Park Avenue)
  ('99999999-9999-9999-9999-ffffffff0005', '99999999-9999-9999-9999-eeeeeeee0003', 'Formal Living Room',  'living_room', 4200000, 0),
  ('99999999-9999-9999-9999-ffffffff0006', '99999999-9999-9999-9999-eeeeeeee0003', 'Library',             'office',      3000000, 1),
  -- Project 4 (Brooklyn Brownstone)
  ('99999999-9999-9999-9999-ffffffff0007', '99999999-9999-9999-9999-eeeeeeee0004', 'Parlor Floor',        'living_room', 5000000, 0),
  ('99999999-9999-9999-9999-ffffffff0008', '99999999-9999-9999-9999-eeeeeeee0004', 'Garden Level Den',    'family_room', 3800000, 1),
  -- Project 5 (Hudson Valley)
  ('99999999-9999-9999-9999-ffffffff0009', '99999999-9999-9999-9999-eeeeeeee0005', 'Open Plan Main',      'living_room', 9300000, 0),
  -- Project 6 (SoHo Studio — completed)
  ('99999999-9999-9999-9999-ffffffff000a', '99999999-9999-9999-9999-eeeeeeee0006', 'Studio',              'living_room', 3100000, 0),
  -- Project 7 (Bridgehampton — completed)
  ('99999999-9999-9999-9999-ffffffff000b', '99999999-9999-9999-9999-eeeeeeee0007', 'Cottage Main',        'living_room', 5400000, 0),
  -- Project 8 (Tribeca — archived)
  ('99999999-9999-9999-9999-ffffffff000c', '99999999-9999-9999-9999-eeeeeeee0008', 'Penthouse Living',    'living_room', 6700000, 0)
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8. 52 client_decisions.
--    The set_decision_designer_id trigger auto-populates designer_id from
--    designer_client_id, so we don't need to set it explicitly.
--
--    Distribution:
--      Projects 1-4 (active): 8 each, mix of pending + responded  = 32
--      Project 5 (active):    5 decisions, 3 pending + 2 responded =  5
--      Project 6 (completed): 5 decisions, all responded           =  5
--      Project 7 (completed): 5 decisions, all responded           =  5
--      Project 8 (archived):  5 decisions, all responded           =  5
--    Total: 52
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  link_id uuid := '99999999-9999-9999-9999-bbbbbbbbbbbb';
  topics  text[] := ARRAY[
    'Approve sofa fabric direction',
    'Confirm dining table finish',
    'Select pendant light height',
    'Approve rug color palette',
    'Confirm window treatment style',
    'Approve paint color sample',
    'Select lounge chair upholstery',
    'Confirm coffee table material'
  ];
  -- {project_ordinal, total, pending_count}
  plan_rows int[][] := ARRAY[
    ARRAY[1, 8, 3],
    ARRAY[2, 8, 4],
    ARRAY[3, 8, 6],
    ARRAY[4, 8, 4],
    ARRAY[5, 5, 3],
    ARRAY[6, 5, 0],
    ARRAY[7, 5, 0],
    ARRAY[8, 5, 0]
  ];
  p       integer;
  i       integer;
  proj_id uuid;
  ord     integer;
  total   integer;
  pending integer;
BEGIN
  FOR p IN 1..array_length(plan_rows, 1) LOOP
    ord     := plan_rows[p][1];
    total   := plan_rows[p][2];
    pending := plan_rows[p][3];
    proj_id := ('99999999-9999-9999-9999-eeeeeeee000' || to_hex(ord))::uuid;

    FOR i IN 1..total LOOP
      INSERT INTO public.client_decisions (
        id, designer_client_id, project_id, title, context,
        status, decision_type, blocking_status,
        due_date, sent_at, responded_at, created_at, updated_at
      ) VALUES (
        -- Pack project ordinal (1..8) in hi nibble, decision index (1..8) in lo nibble.
        ('99999999-9999-9999-9999-aabbccdd' || lpad(to_hex(ord * 16 + i), 4, '0'))::uuid,
        link_id,
        proj_id,
        topics[((i - 1) % array_length(topics, 1)) + 1] || ' (Project ' || ord || ')',
        'Pick the option that best fits your space and lifestyle.',
        CASE WHEN i <= pending THEN 'pending' ELSE 'responded' END,
        'product',
        'non_blocking',
        NOW() + (i || ' days')::interval,
        NOW() - ((total - i + 1) || ' days')::interval,
        CASE WHEN i <= pending THEN NULL ELSE NOW() - ((total - i) || ' days')::interval END,
        NOW() - ((total - i + 1) || ' days')::interval,
        NOW()
      )
      ON CONFLICT (id) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 9. 9 comms_threads + participants.
--    8 project threads (kind='project') + 1 direct thread (kind='direct').
--    `created_by` references profiles(id) — use the designer profile.
--    Participants: designer + client on each thread.
--
--    Note: comms_thread_participants has a deferred CONSTRAINT TRIGGER that
--    requires exactly 2 active participants on direct/vendor_brief threads.
--    We satisfy it within this transaction (designer + client on thread 9).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  designer_uid uuid := (SELECT id FROM auth.users WHERE email = 'kody@middlewest.studio');
  client_uid   uuid := '99999999-9999-9999-9999-aaaaaaaaaaa1';
  i            integer;
  proj_ids     uuid[] := ARRAY[
    '99999999-9999-9999-9999-eeeeeeee0001'::uuid,
    '99999999-9999-9999-9999-eeeeeeee0002'::uuid,
    '99999999-9999-9999-9999-eeeeeeee0003'::uuid,
    '99999999-9999-9999-9999-eeeeeeee0004'::uuid,
    '99999999-9999-9999-9999-eeeeeeee0005'::uuid,
    '99999999-9999-9999-9999-eeeeeeee0006'::uuid,
    '99999999-9999-9999-9999-eeeeeeee0007'::uuid,
    '99999999-9999-9999-9999-eeeeeeee0008'::uuid
  ];
  proj_names   text[] := ARRAY[
    'Smith Residence — Living Room',
    'Anderson Loft — Whole Home',
    'Park Avenue Apartment',
    'Brooklyn Brownstone',
    'Hudson Valley Retreat',
    'SoHo Studio',
    'Bridgehampton Cottage',
    'Tribeca Penthouse (archive)'
  ];
  thread_id    uuid;
BEGIN
  FOR i IN 1..8 LOOP
    thread_id := ('99999999-9999-9999-9999-11111111000' || to_hex(i))::uuid;

    INSERT INTO public.comms_threads (id, kind, project_id, title, created_by)
    VALUES (thread_id, 'project', proj_ids[i], proj_names[i] || ' — Conversation', designer_uid)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.comms_thread_participants (thread_id, profile_id, role)
    VALUES (thread_id, designer_uid, 'designer'), (thread_id, client_uid, 'client')
    ON CONFLICT (thread_id, profile_id) DO NOTHING;
  END LOOP;

  -- Thread 9: direct (general, no project_id).
  thread_id := '99999999-9999-9999-9999-111111110009';
  INSERT INTO public.comms_threads (id, kind, project_id, title, created_by)
  VALUES (thread_id, 'direct', NULL, 'Middlewest Studio — General', designer_uid)
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.comms_thread_participants (thread_id, profile_id, role)
  VALUES (thread_id, designer_uid, 'designer'), (thread_id, client_uid, 'client')
  ON CONFLICT (thread_id, profile_id) DO NOTHING;
END $$;

-- ---------------------------------------------------------------------------
-- 10. 72 comms_messages (8 messages per thread, 9 threads).
--     Messages alternate between designer and client to look like a real
--     conversation. created_at is offset so the inbox sorts naturally.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  designer_uid uuid := (SELECT id FROM auth.users WHERE email = 'kody@middlewest.studio');
  client_uid   uuid := '99999999-9999-9999-9999-aaaaaaaaaaa1';
  t            integer;
  m            integer;
  thread_id    uuid;
  sender_id    uuid;
  body_text    text;
  designer_lines text[] := ARRAY[
    'Sharing the latest direction for your review.',
    'I refined the proposal based on our last call — let me know what you think.',
    'Here''s the swatch comparison you asked about.',
    'Walking through the FF&E shortlist tomorrow morning.'
  ];
  client_lines text[] := ARRAY[
    'Love the direction — a couple of small notes.',
    'Going through it now, will respond by end of day.',
    'Can we revisit the lighting option from last week?',
    'Looks great. Sending approval shortly.'
  ];
BEGIN
  FOR t IN 1..9 LOOP
    thread_id := CASE WHEN t = 9
                      THEN '99999999-9999-9999-9999-111111110009'::uuid
                      ELSE ('99999999-9999-9999-9999-11111111000' || to_hex(t))::uuid
                 END;

    FOR m IN 1..8 LOOP
      IF m % 2 = 1 THEN
        sender_id := designer_uid;
        body_text := designer_lines[((m - 1) / 2 % array_length(designer_lines, 1)) + 1];
      ELSE
        sender_id := client_uid;
        body_text := client_lines[((m - 2) / 2 % array_length(client_lines, 1)) + 1];
      END IF;

      INSERT INTO public.comms_messages (
        id, thread_id, sender_id, body, created_at
      ) VALUES (
        ('99999999-9999-9999-9999-22222222' || lpad(to_hex(t * 16 + m), 4, '0'))::uuid,
        thread_id,
        sender_id,
        body_text,
        NOW() - ((9 - m) || ' hours')::interval - ((9 - t) || ' days')::interval
      )
      ON CONFLICT (id) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

COMMIT;

-- =============================================================================
-- Summary
-- =============================================================================
SELECT
  (SELECT count(*) FROM public.projects
     WHERE id::text LIKE '99999999-9999-9999-9999-%') AS projects,
  (SELECT count(*) FROM public.project_rooms
     WHERE id::text LIKE '99999999-9999-9999-9999-%') AS rooms,
  (SELECT count(*) FROM public.client_decisions
     WHERE id::text LIKE '99999999-9999-9999-9999-%') AS decisions,
  (SELECT count(*) FROM public.comms_threads
     WHERE id::text LIKE '99999999-9999-9999-9999-%') AS threads,
  (SELECT count(*) FROM public.comms_messages
     WHERE id::text LIKE '99999999-9999-9999-9999-%') AS messages,
  (SELECT count(*) FROM public.user_roles ur
     JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = (SELECT id FROM auth.users WHERE email = 'kody@middlewest.studio')
       AND r.domain = 'designer') AS designer_domain_roles_for_kody,
  (SELECT count(*) FROM public.user_roles ur
     JOIN public.roles r ON r.id = ur.role_id
     WHERE ur.user_id = '99999999-9999-9999-9999-aaaaaaaaaaa1'
       AND r.domain = 'consumer') AS consumer_domain_roles_for_client;
