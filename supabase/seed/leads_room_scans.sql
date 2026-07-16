-- ═══════════════════════════════════════════════════════════════════════════
-- Seed: 6 Leads with Associated Room Scans
-- Prerequisites: at least one designer profile must exist
-- ═══════════════════════════════════════════════════════════════════════════

-- Temporarily disable lead notification triggers (they require Supabase config not present locally)
ALTER TABLE leads DISABLE TRIGGER on_lead_created_notify_consumer;
ALTER TABLE leads DISABLE TRIGGER on_lead_created_notify_designer;

DO $$
DECLARE
  v_designer_id uuid := 'a0000000-0000-0000-0000-000000000004'; -- designer@patina.dev (dev-accounts.sql)

  -- Homeowner UUIDs
  h1 uuid := gen_random_uuid();
  h2 uuid := gen_random_uuid();
  h3 uuid := gen_random_uuid();
  h4 uuid := gen_random_uuid();
  h5 uuid := gen_random_uuid();
  h6 uuid := gen_random_uuid();

  -- Room scan UUIDs
  rs1 uuid := gen_random_uuid();
  rs2 uuid := gen_random_uuid();
  rs3 uuid := gen_random_uuid();
  rs4 uuid := gen_random_uuid();
  rs5 uuid := gen_random_uuid();
  rs6 uuid := gen_random_uuid();

BEGIN

-- ─── Create homeowner auth users ────────────────────────────────────────
-- The on_auth_user_created trigger auto-creates profiles with display_name
INSERT INTO auth.users (id, instance_id, email, encrypted_password, email_confirmed_at, raw_user_meta_data, role, aud, created_at, updated_at)
VALUES
  (h1, '00000000-0000-0000-0000-000000000000', 'sarah.chen@example.com',    crypt('password123', gen_salt('bf')), now(), '{"full_name":"Sarah Chen"}'::jsonb,    'authenticated', 'authenticated', now(), now()),
  (h2, '00000000-0000-0000-0000-000000000000', 'marcus.wright@example.com', crypt('password123', gen_salt('bf')), now(), '{"full_name":"Marcus Wright"}'::jsonb, 'authenticated', 'authenticated', now(), now()),
  (h3, '00000000-0000-0000-0000-000000000000', 'elena.ruiz@example.com',    crypt('password123', gen_salt('bf')), now(), '{"full_name":"Elena Ruiz"}'::jsonb,    'authenticated', 'authenticated', now(), now()),
  (h4, '00000000-0000-0000-0000-000000000000', 'james.okafor@example.com',  crypt('password123', gen_salt('bf')), now(), '{"full_name":"James Okafor"}'::jsonb,  'authenticated', 'authenticated', now(), now()),
  (h5, '00000000-0000-0000-0000-000000000000', 'lily.tanaka@example.com',   crypt('password123', gen_salt('bf')), now(), '{"full_name":"Lily Tanaka"}'::jsonb,   'authenticated', 'authenticated', now(), now()),
  (h6, '00000000-0000-0000-0000-000000000000', 'david.nielsen@example.com', crypt('password123', gen_salt('bf')), now(), '{"full_name":"David Nielsen"}'::jsonb, 'authenticated', 'authenticated', now(), now());

-- ─── Update profiles to homeowner role with full_name ───────────────────
UPDATE profiles SET role = 'homeowner', full_name = 'Sarah Chen'     WHERE id = h1;
UPDATE profiles SET role = 'homeowner', full_name = 'Marcus Wright'  WHERE id = h2;
UPDATE profiles SET role = 'homeowner', full_name = 'Elena Ruiz'     WHERE id = h3;
UPDATE profiles SET role = 'homeowner', full_name = 'James Okafor'   WHERE id = h4;
UPDATE profiles SET role = 'homeowner', full_name = 'Lily Tanaka'    WHERE id = h5;
UPDATE profiles SET role = 'homeowner', full_name = 'David Nielsen'  WHERE id = h6;

-- ─── Create room scans ─────────────────────────────────────────────────
INSERT INTO room_scans (id, user_id, name, room_type, status, quality_grade, coverage_percentage, floor_area, dimensions, features, furniture_detected, style_signals, suggested_styles, image_count, average_image_quality, scanned_at, processed_at)
VALUES
  -- 1. Sarah's living room — excellent scan
  (rs1, h1, 'Main Living Room', 'living_room', 'ready', 'excellent', 0.94, 320.00,
   '{"width": 20, "length": 16, "height": 9, "unit": "ft"}'::jsonb,
   '{"windows": [{"wall": "south", "width": 72, "height": 48}, {"wall": "south", "width": 72, "height": 48}], "doors": [{"wall": "east", "width": 36}], "outlets": [{"wall": "north", "count": 2}, {"wall": "west", "count": 1}]}'::jsonb,
   '[{"type": "sofa", "confidence": 0.95, "position": {"x": 4.2, "y": 0, "z": 6.1}}, {"type": "coffee_table", "confidence": 0.91, "position": {"x": 4.5, "y": 0, "z": 4.0}}, {"type": "bookshelf", "confidence": 0.88, "position": {"x": 0.3, "y": 0, "z": 8.0}}]'::jsonb,
   '{"naturalLight": 0.85, "openness": 0.78, "warmth": 0.65, "texture": 0.55}'::jsonb,
   ARRAY['mid-century modern', 'scandinavian'], 12, 0.87,
   now() - interval '3 days', now() - interval '3 days' + interval '4 minutes'),

  -- 2. Marcus's bedroom — good scan
  (rs2, h2, 'Primary Bedroom', 'bedroom', 'ready', 'good', 0.82, 224.00,
   '{"width": 16, "length": 14, "height": 8, "unit": "ft"}'::jsonb,
   '{"windows": [{"wall": "west", "width": 60, "height": 42}], "doors": [{"wall": "south", "width": 32}, {"wall": "east", "width": 28}], "outlets": [{"wall": "north", "count": 1}, {"wall": "south", "count": 1}]}'::jsonb,
   '[{"type": "bed_frame", "confidence": 0.97, "position": {"x": 3.0, "y": 0, "z": 5.5}}, {"type": "dresser", "confidence": 0.89, "position": {"x": 0.4, "y": 0, "z": 2.0}}, {"type": "nightstand", "confidence": 0.86, "position": {"x": 1.2, "y": 0, "z": 5.5}}]'::jsonb,
   '{"naturalLight": 0.60, "openness": 0.55, "warmth": 0.80, "texture": 0.70}'::jsonb,
   ARRAY['japandi', 'warm minimalism'], 9, 0.79,
   now() - interval '5 days', now() - interval '5 days' + interval '6 minutes'),

  -- 3. Elena's dining room — excellent scan
  (rs3, h3, 'Formal Dining Room', 'dining_room', 'ready', 'excellent', 0.91, 196.00,
   '{"width": 14, "length": 14, "height": 10, "unit": "ft"}'::jsonb,
   '{"windows": [{"wall": "north", "width": 84, "height": 54}], "doors": [{"wall": "west", "width": 48}], "outlets": [{"wall": "south", "count": 1}]}'::jsonb,
   '[{"type": "dining_table", "confidence": 0.96, "position": {"x": 3.5, "y": 0, "z": 3.5}}, {"type": "chair", "confidence": 0.92, "position": {"x": 2.5, "y": 0, "z": 3.5}}, {"type": "sideboard", "confidence": 0.84, "position": {"x": 0.3, "y": 0, "z": 7.0}}]'::jsonb,
   '{"naturalLight": 0.90, "openness": 0.82, "warmth": 0.45, "texture": 0.40}'::jsonb,
   ARRAY['contemporary', 'transitional'], 14, 0.91,
   now() - interval '2 days', now() - interval '2 days' + interval '3 minutes'),

  -- 4. James's home office — acceptable scan
  (rs4, h4, 'Home Office', 'office', 'ready', 'acceptable', 0.68, 144.00,
   '{"width": 12, "length": 12, "height": 8, "unit": "ft"}'::jsonb,
   '{"windows": [{"wall": "east", "width": 48, "height": 36}], "doors": [{"wall": "north", "width": 32}], "outlets": [{"wall": "east", "count": 2}, {"wall": "south", "count": 2}]}'::jsonb,
   '[{"type": "desk", "confidence": 0.93, "position": {"x": 5.0, "y": 0, "z": 1.0}}, {"type": "office_chair", "confidence": 0.90, "position": {"x": 4.5, "y": 0, "z": 2.5}}, {"type": "bookshelf", "confidence": 0.82, "position": {"x": 0.3, "y": 0, "z": 6.0}}]'::jsonb,
   '{"naturalLight": 0.50, "openness": 0.40, "warmth": 0.35, "texture": 0.30}'::jsonb,
   ARRAY['industrial', 'mid-century modern'], 7, 0.72,
   now() - interval '7 days', now() - interval '7 days' + interval '8 minutes'),

  -- 5. Lily's kitchen — good scan
  (rs5, h5, 'Open Kitchen', 'kitchen', 'ready', 'good', 0.79, 180.00,
   '{"width": 15, "length": 12, "height": 9, "unit": "ft"}'::jsonb,
   '{"windows": [{"wall": "south", "width": 60, "height": 40}], "doors": [], "outlets": [{"wall": "north", "count": 3}, {"wall": "west", "count": 2}]}'::jsonb,
   '[{"type": "island", "confidence": 0.94, "position": {"x": 4.0, "y": 0, "z": 3.5}}, {"type": "stool", "confidence": 0.85, "position": {"x": 3.0, "y": 0, "z": 2.5}}, {"type": "stool", "confidence": 0.83, "position": {"x": 5.0, "y": 0, "z": 2.5}}]'::jsonb,
   '{"naturalLight": 0.75, "openness": 0.70, "warmth": 0.60, "texture": 0.50}'::jsonb,
   ARRAY['farmhouse modern', 'coastal'], 10, 0.81,
   now() - interval '1 day', now() - interval '1 day' + interval '5 minutes'),

  -- 6. David's bathroom — good scan
  (rs6, h6, 'Primary Bathroom', 'bathroom', 'ready', 'good', 0.76, 96.00,
   '{"width": 12, "length": 8, "height": 8, "unit": "ft"}'::jsonb,
   '{"windows": [{"wall": "east", "width": 36, "height": 24}], "doors": [{"wall": "west", "width": 30}], "outlets": [{"wall": "north", "count": 1}]}'::jsonb,
   '[{"type": "vanity", "confidence": 0.95, "position": {"x": 2.0, "y": 0, "z": 0.5}}, {"type": "bathtub", "confidence": 0.92, "position": {"x": 5.0, "y": 0, "z": 4.0}}]'::jsonb,
   '{"naturalLight": 0.45, "openness": 0.35, "warmth": 0.70, "texture": 0.75}'::jsonb,
   ARRAY['spa modern', 'organic contemporary'], 8, 0.78,
   now() - interval '4 days', now() - interval '4 days' + interval '5 minutes');

-- ─── Create leads linked to room scans ──────────────────────────────────
INSERT INTO leads (homeowner_id, designer_id, room_scan_id, project_type, project_description, budget_range, timeline, location_city, location_state, location_zip, match_score, match_reasons, status, response_deadline, created_at)
VALUES
  -- 1. Sarah — new lead, high match
  (h1, v_designer_id, rs1, 'full_room',
   'Looking to redesign our living room. We love mid-century modern but want it to feel warm and livable, not like a showroom. Two kids and a dog.',
   '15k_50k', '3_6_months', 'Austin', 'TX', '78704',
   0.92, '["style alignment: mid-century modern", "budget match", "local market expertise"]'::jsonb,
   'new', now() + interval '5 days', now() - interval '3 days'),

  -- 2. Marcus — viewed lead
  (h2, v_designer_id, rs2, 'full_room',
   'Complete bedroom refresh. Transitioning from college furniture to something grown-up. Want a calm, restful space with Japanese influences.',
   '5k_15k', '1_3_months', 'Austin', 'TX', '78701',
   0.85, '["style alignment: japandi", "timeline fit", "room type experience"]'::jsonb,
   'viewed', now() + interval '3 days', now() - interval '5 days'),

  -- 3. Elena — contacted lead
  (h3, v_designer_id, rs3, 'consultation',
   'Hosting more dinner parties and want the dining room to make a statement. Have a few heirloom pieces to incorporate.',
   '50k_100k', 'flexible', 'Dripping Springs', 'TX', '78620',
   0.88, '["high-value project", "style alignment: transitional", "heirloom integration experience"]'::jsonb,
   'contacted', now() + interval '7 days', now() - interval '2 days'),

  -- 4. James — accepted lead
  (h4, v_designer_id, rs4, 'single_piece',
   'Need a proper desk setup for WFH. Current IKEA situation is falling apart. Want something with character — maybe reclaimed wood?',
   'under_5k', 'asap', 'Round Rock', 'TX', '78664',
   0.72, '["local proximity", "quick timeline match"]'::jsonb,
   'accepted', now() + interval '2 days', now() - interval '7 days'),

  -- 5. Lily — new lead, recent
  (h5, v_designer_id, rs5, 'full_room',
   'Just bought a 1960s ranch and the kitchen is stuck in the 90s. Want to keep the bones but modernize everything else. Open to knocking out the breakfast nook wall.',
   '50k_100k', '6_12_months', 'Bee Cave', 'TX', '78738',
   0.90, '["high-value project", "style alignment: farmhouse modern", "renovation experience"]'::jsonb,
   'new', now() + interval '6 days', now() - interval '1 day'),

  -- 6. David — new lead
  (h6, v_designer_id, rs6, 'full_room',
   'Primary bathroom needs a spa-like overhaul. Thinking freestanding tub, walk-in shower, heated floors. The scan shows what we are working with.',
   '15k_50k', '3_6_months', 'Lakeway', 'TX', '78734',
   0.81, '["style alignment: spa modern", "budget match", "bathroom specialization"]'::jsonb,
   'new', now() + interval '5 days', now() - interval '4 days');

-- ─── Set timestamps on contacted/accepted leads ────────────────────────
UPDATE leads SET contacted_at = created_at + interval '6 hours'
  WHERE homeowner_id = h3;
UPDATE leads SET contacted_at = created_at + interval '4 hours', accepted_at = created_at + interval '1 day'
  WHERE homeowner_id = h4;

END $$;

-- Re-enable lead notification triggers
ALTER TABLE leads ENABLE TRIGGER on_lead_created_notify_consumer;
ALTER TABLE leads ENABLE TRIGGER on_lead_created_notify_designer;
