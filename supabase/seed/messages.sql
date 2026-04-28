-- ═══════════════════════════════════════════════════════════════════════════
-- SEED: client_messages — realistic back-and-forth threads
--
-- Seeds 5 messages for each of the 4 seeded designer_clients rows so the
-- messaging thread page shows bubbles, date dividers, and unread state
-- in local dev.
--
-- Seeded designer_client_id values (from designer-clients.sql):
--   47e290c7-d576-4a2d-830d-66daeadd8be5  superadmin ↔ client
--   24ffb30c-10bc-47c9-9b19-68b78d3b55cb  admin      ↔ client
--   424ab092-5193-4bd6-b635-dbaa5cadadc1  studio_mgr ↔ client
--   f2c46a9a-b525-4e3c-872e-f5289ecc3bdc  designer   ↔ client  (primary)
--
-- User UUIDs:
--   uid_superadmin = a0000000-0000-0000-0000-000000000001
--   uid_admin      = a0000000-0000-0000-0000-000000000002
--   uid_studio_mgr = a0000000-0000-0000-0000-000000000003
--   uid_designer   = a0000000-0000-0000-0000-000000000004
--   uid_client     = a0000000-0000-0000-0000-000000000005
--
-- Idempotent: uses stable UUIDs + ON CONFLICT DO NOTHING.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.client_messages (
  id,
  designer_client_id,
  sender_id,
  recipient_id,
  project_id,
  subject,
  body,
  read_at,
  created_at
)
VALUES

-- ─── designer ↔ client (f2c46a9a) ───────────────────────────────────────────

-- 1. Designer opens thread — 6 days ago (read by client)
(
  'c0000001-0000-0000-0000-000000000001',
  'f2c46a9a-b525-4e3c-872e-f5289ecc3bdc',
  'a0000000-0000-0000-0000-000000000004',  -- designer sends
  'a0000000-0000-0000-0000-000000000005',  -- client receives
  'b0000000-0000-0000-0000-0000000000d1',  -- Aspen Loft project
  'Aspen Loft — kickoff',
  'Hi! I''m thrilled to be working on the Aspen Loft with you. I''ve reviewed your inspiration board and I have some fantastic ideas to share. When would be a good time for a call this week?',
  now() - interval '6 days 2 hours',
  now() - interval '6 days 3 hours'
),

-- 2. Client replies — 6 days ago (read by designer)
(
  'c0000001-0000-0000-0000-000000000002',
  'f2c46a9a-b525-4e3c-872e-f5289ecc3bdc',
  'a0000000-0000-0000-0000-000000000005',  -- client sends
  'a0000000-0000-0000-0000-000000000004',  -- designer receives
  'b0000000-0000-0000-0000-0000000000d1',
  NULL,
  'So excited! Thursday at 2 pm works perfectly for me. I''ve been collecting a lot of warm-toned references — earthy linens, walnut wood, that kind of thing. Looking forward to hearing your ideas.',
  now() - interval '5 days 22 hours',
  now() - interval '6 days 1 hour'
),

-- 3. Designer — 3 days ago with project ref (read by client)
(
  'c0000001-0000-0000-0000-000000000003',
  'f2c46a9a-b525-4e3c-872e-f5289ecc3bdc',
  'a0000000-0000-0000-0000-000000000004',  -- designer sends
  'a0000000-0000-0000-0000-000000000005',  -- client receives
  'b0000000-0000-0000-0000-0000000000d1',
  NULL,
  'Great call on Thursday! I''ve uploaded the initial moodboard to the Aspen Loft project. I''m leaning toward a palette of warm sage, ivory linen, and oiled walnut. I''ll have the fabric swatches ready for you to review by Friday.',
  now() - interval '2 days 20 hours',
  now() - interval '3 days 1 hour'
),

-- 4. Client — yesterday (unread by designer, read_at = NULL)
(
  'c0000001-0000-0000-0000-000000000004',
  'f2c46a9a-b525-4e3c-872e-f5289ecc3bdc',
  'a0000000-0000-0000-0000-000000000005',  -- client sends
  'a0000000-0000-0000-0000-000000000004',  -- designer receives (unread)
  NULL,
  NULL,
  'Love the direction! The sage and ivory combination sounds exactly right. Quick question — for the living room sofa, would you recommend a performance fabric given we have two dogs? I want something that looks beautiful but can actually handle real life.',
  NULL,  -- unread by designer
  now() - interval '1 day 4 hours'
),

-- 5. Client — this morning (unread by designer)
(
  'c0000001-0000-0000-0000-000000000005',
  'f2c46a9a-b525-4e3c-872e-f5289ecc3bdc',
  'a0000000-0000-0000-0000-000000000005',  -- client sends
  'a0000000-0000-0000-0000-000000000004',  -- designer receives (unread)
  NULL,
  NULL,
  'Also — my partner is asking about the dining area. Should we go with a round or rectangular table? The space is roughly 12 × 14 ft. No rush, just wanted to flag it while I was thinking about it!',
  NULL,  -- unread by designer
  now() - interval '2 hours'
),

-- ─── superadmin ↔ client (47e290c7) ─────────────────────────────────────────

(
  'c0000002-0000-0000-0000-000000000001',
  '47e290c7-d576-4a2d-830d-66daeadd8be5',
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000005',
  NULL, NULL,
  'Hello! Just checking in to see how the renovation is progressing. Let me know if you need anything from our end.',
  now() - interval '5 days',
  now() - interval '5 days 1 hour'
),
(
  'c0000002-0000-0000-0000-000000000002',
  '47e290c7-d576-4a2d-830d-66daeadd8be5',
  'a0000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000001',
  NULL, NULL,
  'Things are going well, thank you! We''ve been really happy with the selections so far.',
  now() - interval '4 days 22 hours',
  now() - interval '5 days'
),
(
  'c0000002-0000-0000-0000-000000000003',
  '47e290c7-d576-4a2d-830d-66daeadd8be5',
  'a0000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000005',
  NULL, NULL,
  'Wonderful to hear! I''ll send over the revised timeline for phase 2 by end of week.',
  now() - interval '4 days 20 hours',
  now() - interval '4 days 21 hours'
),
(
  'c0000002-0000-0000-0000-000000000004',
  '47e290c7-d576-4a2d-830d-66daeadd8be5',
  'a0000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000001',
  NULL, NULL,
  'Perfect, looking forward to it!',
  NULL,
  now() - interval '1 day 6 hours'
),

-- ─── admin ↔ client (24ffb30c) ───────────────────────────────────────────────

(
  'c0000003-0000-0000-0000-000000000001',
  '24ffb30c-10bc-47c9-9b19-68b78d3b55cb',
  'a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000005',
  NULL, NULL,
  'Hi there! I wanted to share the updated proposal for the bedroom refresh. Let me know your thoughts.',
  now() - interval '7 days 2 hours',
  now() - interval '7 days 3 hours'
),
(
  'c0000003-0000-0000-0000-000000000002',
  '24ffb30c-10bc-47c9-9b19-68b78d3b55cb',
  'a0000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000002',
  NULL, NULL,
  'I reviewed the proposal — it looks great overall. Could we possibly swap the headboard fabric to something a bit softer?',
  now() - interval '6 days 22 hours',
  now() - interval '7 days 1 hour'
),
(
  'c0000003-0000-0000-0000-000000000003',
  '24ffb30c-10bc-47c9-9b19-68b78d3b55cb',
  'a0000000-0000-0000-0000-000000000002',
  'a0000000-0000-0000-0000-000000000005',
  NULL, NULL,
  'Absolutely — I''ll source a few velvet options in muted tones and send you swatches by Thursday.',
  now() - interval '6 days 18 hours',
  now() - interval '6 days 20 hours'
),
(
  'c0000003-0000-0000-0000-000000000004',
  '24ffb30c-10bc-47c9-9b19-68b78d3b55cb',
  'a0000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000002',
  NULL, NULL,
  'That would be amazing, thank you!',
  NULL,
  now() - interval '3 hours'
),

-- ─── studio_mgr ↔ client (424ab092) ──────────────────────────────────────────

(
  'c0000004-0000-0000-0000-000000000001',
  '424ab092-5193-4bd6-b635-dbaa5cadadc1',
  'a0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000005',
  NULL, NULL,
  'Good morning! I wanted to follow up on the kitchen cabinet samples we sent over last week. Did you get a chance to review them in the space?',
  now() - interval '4 days 1 hour',
  now() - interval '4 days 2 hours'
),
(
  'c0000004-0000-0000-0000-000000000002',
  '424ab092-5193-4bd6-b635-dbaa5cadadc1',
  'a0000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000003',
  NULL, NULL,
  'Yes! I held them up in the kitchen and the white oak definitely reads more warm and golden than the photos suggested — in the best way. I think that''s the one.',
  now() - interval '3 days 22 hours',
  now() - interval '4 days'
),
(
  'c0000004-0000-0000-0000-000000000003',
  '424ab092-5193-4bd6-b635-dbaa5cadadc1',
  'a0000000-0000-0000-0000-000000000003',
  'a0000000-0000-0000-0000-000000000005',
  NULL, NULL,
  'White oak it is! I''ll lock that in and get an order lead time from the fabricator. Expect a confirmed timeline by Monday.',
  now() - interval '3 days 20 hours',
  now() - interval '3 days 21 hours'
),
(
  'c0000004-0000-0000-0000-000000000004',
  '424ab092-5193-4bd6-b635-dbaa5cadadc1',
  'a0000000-0000-0000-0000-000000000005',
  'a0000000-0000-0000-0000-000000000003',
  NULL, NULL,
  'Fantastic — I''m so relieved we found the right match. Thank you for your patience while I compared all the samples!',
  NULL,
  now() - interval '30 minutes'
)

ON CONFLICT (id) DO NOTHING;
