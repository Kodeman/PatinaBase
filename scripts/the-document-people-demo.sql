-- The People Room — demo seed (local dev only). Idempotent.
--
-- Populates designer a0000000-…-002 ("Admin User") with all FIVE party roles so
-- the unified directory, the role-adaptive profile/journey, the nurture queue,
-- reviews, and threads all show rich data on a live walk at /people.
--
-- Run:  docker exec -i supabase_db_supabase psql -U postgres -d postgres < scripts/the-document-people-demo.sql
-- Sign in as the seed designer, set NEXT_PUBLIC_FLAG_OVERRIDES=the-document-pilot:true,
-- open the Studio drawer → People (walks into the Room).

BEGIN;

\set designer '''a0000000-0000-0000-0000-000000000002'''
\set clientUser '''a0000000-0000-0000-0000-000000000005'''
\set teammate '''a0000000-0000-0000-0000-000000000003'''

-- ── CLIENTS (active w/ Style DNA · proposal-hesitating · completed-dormant) ──
INSERT INTO public.designer_clients
  (id, designer_id, client_name, client_email, status, source, notes,
   total_projects, total_revenue, last_contacted_at, last_project_at,
   style_tags, style_preferences, inspiration_quote, satisfaction_score)
VALUES
  ('c1000002-0000-0000-0000-0000000000d1', :designer, 'Sarah Whitfield', 'sarah@whitfield.com',
   'active', 'referral', 'Travels mid-November. Dog (Rex) shapes durability calls. Loves a hosting story.',
   2, 2510000, now() - interval '2 days', now() - interval '2 days',
   ARRAY['Warm modern','Layered naturals','Bouclé & oak','Quiet palettes'],
   '{"palette":["#C4A57B","#A8B5A0","#E2DACA","#5C4A3C"]}'::jsonb,
   'Texture-forward and tonal — warmth over contrast. Approves quickly when you lead.', 4.9),
  ('c1000002-0000-0000-0000-0000000000d2', :designer, 'David Chen', 'd.chen@email.com',
   'proposal', 'direct', 'Detail-oriented. Wants to feel he is not being upsold.',
   0, 0, now() - interval '9 days', NULL,
   ARRAY['Transitional','Walnut & brass','Collected, not matched'],
   '{}'::jsonb, 'Early read — leans transitional with warm metals. Still learning him.', NULL),
  ('c1000002-0000-0000-0000-0000000000d3', :designer, 'Joan Marsh', 'joan.marsh@email.com',
   'completed', 'referral', 'Mentioned a lake house "someday." That someday may be now.',
   1, 4800000, now() - interval '250 days', now() - interval '300 days',
   ARRAY['Coastal calm','Linen & pale oak','Soft, sun-filled'],
   '{"palette":["#E2DACA","#A8B5A0","#D8D2C6","#C4A57B"]}'::jsonb,
   'A completed relationship; she loved the loft work. Your strongest dormant tie.', 5.0)
ON CONFLICT (id) DO NOTHING;

-- ── LEADS (open) ────────────────────────────────────────────────────────────
INSERT INTO public.leads
  (id, designer_id, project_type, project_description, budget_range, timeline,
   location_city, location_state, contact_name, contact_email, status, created_at)
VALUES
  ('ad000002-0000-0000-0000-0000000000a1', :designer, 'full_room',
   'Whole-home refresh, three kids — durability and warmth matter.', '50k_100k', '1_3_months',
   'Aspen', 'CO', 'The Bauer Family', 'bauers@email.com', 'new', now() - interval '12 hours')
ON CONFLICT (id) DO NOTHING;

-- ── MAKERS (founding-circle flag + saved by the designer) ───────────────────
UPDATE public.vendors SET founding_circle = true
 WHERE id = '11111111-1111-1111-1111-111111111105';

INSERT INTO public.saved_vendors (designer_id, vendor_id, notes)
SELECT :designer, v.id, 'Go-to maker'
FROM (VALUES ('11111111-1111-1111-1111-111111111105'::uuid),
             ('11111111-1111-1111-1111-111111111104'::uuid)) AS v(id)
WHERE NOT EXISTS (
  SELECT 1 FROM public.saved_vendors s WHERE s.designer_id = :designer AND s.vendor_id = v.id
);

-- ── PROJECT (so GC + team have a home owned by the designer) ────────────────
INSERT INTO public.projects (id, name, status, designer_id, created_by, client_id)
VALUES ('b1000002-0000-0000-0000-0000000000f1', 'Aspen Loft Refresh', 'active',
        :designer, :designer, :clientUser)
ON CONFLICT (id) DO NOTHING;

-- ── GC (a tracked, login-less court party) ──────────────────────────────────
INSERT INTO public.project_parties
  (id, project_id, party_kind, display_name, company_name, email, phone)
VALUES ('cc000002-0000-0000-0000-0000000000cc', 'b1000002-0000-0000-0000-0000000000f1',
        'gc', 'Reyes Build', 'Reyes Build LLC', 'marcus@reyesbuild.com', '(312) 555-0190')
ON CONFLICT (id) DO NOTHING;

-- ── TEAM (a studio collaborator on the project) ─────────────────────────────
INSERT INTO public.project_team_members (id, project_id, user_id, role)
SELECT 'dd000002-0000-0000-0000-0000000000dd', 'b1000002-0000-0000-0000-0000000000f1',
       :teammate, 'support_designer'
WHERE NOT EXISTS (
  SELECT 1 FROM public.project_team_members
  WHERE project_id = 'b1000002-0000-0000-0000-0000000000f1' AND user_id = :teammate AND removed_at IS NULL
);

-- ── A THREAD (direct, designer ↔ client user) ───────────────────────────────
INSERT INTO public.comms_threads (id, kind, title, created_by, last_message_at)
VALUES ('ee000002-0000-0000-0000-0000000000ee', 'direct', 'Aspen rug — warmer?',
        :designer, now() - interval '2 days')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.comms_thread_participants (thread_id, profile_id, role)
SELECT 'ee000002-0000-0000-0000-0000000000ee', p.profile_id, p.role
FROM (VALUES (:designer::uuid, 'designer'), (:clientUser::uuid, 'client')) AS p(profile_id, role)
WHERE NOT EXISTS (
  SELECT 1 FROM public.comms_thread_participants tp
  WHERE tp.thread_id = 'ee000002-0000-0000-0000-0000000000ee' AND tp.profile_id = p.profile_id
);

INSERT INTO public.comms_messages (id, thread_id, sender_id, body, created_at)
VALUES ('ee000002-0000-0000-0000-0000000000ef', 'ee000002-0000-0000-0000-0000000000ee',
        :clientUser, 'Could the rug go a touch warmer? The samples felt cool against the oak.',
        now() - interval '2 days')
ON CONFLICT (id) DO NOTHING;

-- ── NURTURE (a suggested touchpoint for the dormant tie) ────────────────────
INSERT INTO public.client_nurture_touchpoints
  (id, designer_client_id, touchpoint_type, status, suggested_date, reason)
VALUES ('af000002-0000-0000-0000-0000000000af', 'c1000002-0000-0000-0000-0000000000d3',
        'check_in', 'suggested', current_date, '8 months quiet — the Engine recommends reconnecting now')
ON CONFLICT (id) DO NOTHING;

-- ── REVIEWS (one collected, one not-yet-requested) ──────────────────────────
INSERT INTO public.client_reviews
  (id, designer_client_id, rating, review_text, request_status, published_to_portfolio, created_at)
VALUES
  ('ba000002-0000-0000-0000-0000000000ba', 'c1000002-0000-0000-0000-0000000000d3',
   5, 'Joan finally feels at home.', 'collected', true, now() - interval '240 days'),
  ('ba000002-0000-0000-0000-0000000000bb', 'c1000002-0000-0000-0000-0000000000d2',
   NULL, NULL, 'not_sent', false, now())
ON CONFLICT (id) DO NOTHING;

COMMIT;

\echo '── people_directory for the seed designer ──'
SET LOCAL role authenticated;
SELECT set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
SELECT role, count(*) FROM public.people_directory GROUP BY role ORDER BY role;
