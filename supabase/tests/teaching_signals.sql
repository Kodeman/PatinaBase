-- 00673 — teaching_signals(): role, used.*, lastAt.* for the caller.
--
-- Covers: (1) anon cannot execute; (2) a fresh user gets role 'owner', every used
-- flag false and every lastAt null, with exactly the TeachingSignals keys; (3) after
-- one sent invoice for user A, used.ledger is true and lastAt.invoice_sent is its
-- sent_at; (4) user B sees false/null for A's rows; (5) an active 'member'
-- membership makes the caller a 'hand', while A (owner of that studio) stays 'owner';
-- (6) role counts only ACTIVE memberships (R2 finding 15): a solo designer D whose only
-- rows are 'removed' and 'invited' gets the function's default for "no active
-- membership", which is 'owner'; (7) documented multi-studio limitation: A, owner of
-- studio 1 and an active 'member' (hand) of studio 2, is 'owner'.
--
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/teaching_signals.sql
-- Everything runs inside one transaction and is rolled back.

BEGIN;

-- ─── fixture: three users (handle_new_user creates the profiles rows) ──────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('e9673000-0000-4000-8000-00000000000a', '00673-signals-a@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('e9673000-0000-4000-8000-00000000000b', '00673-signals-b@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  ('e9673000-0000-4000-8000-00000000000c', '00673-signals-h@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.profiles
          WHERE id IN ('e9673000-0000-4000-8000-00000000000a',
                       'e9673000-0000-4000-8000-00000000000b',
                       'e9673000-0000-4000-8000-00000000000c')) = 3,
    'fixture: the three profiles rows must exist';
  ASSERT NOT has_function_privilege('anon', 'public.teaching_signals()', 'EXECUTE'),
    'anon must not hold EXECUTE on teaching_signals';
  ASSERT has_function_privilege('authenticated', 'public.teaching_signals()', 'EXECUTE'),
    'authenticated must hold EXECUTE on teaching_signals';
END $$;

-- (1) anon cannot execute
SET LOCAL ROLE anon;
DO $$
BEGIN
  PERFORM public.teaching_signals();
  RAISE EXCEPTION 'anon executed teaching_signals';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;
RESET ROLE;

-- (2) a fresh user: owner, all used false, all lastAt null
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'e9673000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  s jsonb := public.teaching_signals();
BEGIN
  ASSERT s->>'role' = 'owner', format('a fresh user must be owner, got %s', s->>'role');
  ASSERT s->>'createdAt' IS NOT NULL, 'createdAt must carry profiles.created_at';
  ASSERT (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(s) k)
         = ARRAY['createdAt', 'lastAt', 'role', 'used'],
    format('top-level keys must be exactly role, createdAt, used, lastAt, got %s', s);
  ASSERT (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(s->'used') k)
         = ARRAY['client_page', 'field_capture', 'galley', 'hours', 'ledger',
                 'people', 'purchase_orders', 'seats'],
    format('used keys must be the eight TeachingFeatureKey values, got %s', s->'used');
  ASSERT (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(s->'lastAt') k)
         = ARRAY['agreement_signed_unrevised', 'client_page_sent', 'invite_sent',
                 'invite_with_handoff_note', 'invoice_line_from_member_time',
                 'invoice_line_from_time', 'invoice_sent', 'part_saved',
                 'time_entry_field_visit', 'time_logged'],
    format('lastAt keys must be the five boundaries and five success signals, got %s', s->'lastAt');
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_each(s->'used') e WHERE e.value <> 'false'::jsonb),
    format('every used flag must be false for a fresh user, got %s', s->'used');
  ASSERT NOT EXISTS (SELECT 1 FROM jsonb_each(s->'lastAt') e WHERE e.value <> 'null'::jsonb),
    format('every lastAt must be null for a fresh user, got %s', s->'lastAt');
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, true);

-- ─── fixture: one sent invoice for A ─────────────────────────────────────────

INSERT INTO public.projects (id, name, created_by, designer_id)
VALUES ('e9673000-0000-4000-8000-0000000000f1', '00673 signals project',
        'e9673000-0000-4000-8000-00000000000a', 'e9673000-0000-4000-8000-00000000000a');

INSERT INTO public.invoices (id, project_id, designer_id, status, invoice_number, sent_at)
VALUES ('e9673000-0000-4000-8000-0000000000e1', 'e9673000-0000-4000-8000-0000000000f1',
        'e9673000-0000-4000-8000-00000000000a', 'sent', 'INV-00673',
        '2026-09-20T12:00:00Z');

-- (3) A: ledger used, invoice_sent set
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'e9673000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  s jsonb := public.teaching_signals();
BEGIN
  ASSERT (s->'used'->>'ledger')::boolean, format('used.ledger must be true after a sent invoice, got %s', s->'used');
  ASSERT (s->'lastAt'->>'invoice_sent')::timestamptz = '2026-09-20T12:00:00Z'::timestamptz,
    format('lastAt.invoice_sent must be the invoice sent_at, got %s', s->'lastAt'->>'invoice_sent');
  ASSERT s->'lastAt'->'invoice_line_from_time' = 'null'::jsonb,
    'invoice_line_from_time must stay null with no time entry on the invoice';
END $$;

RESET ROLE;

-- (4) B sees nothing of A's
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'e9673000-0000-4000-8000-00000000000b', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  s jsonb := public.teaching_signals();
BEGIN
  ASSERT s->>'role' = 'owner', format('B has no membership and must be owner, got %s', s->>'role');
  ASSERT s->'used'->'ledger' = 'false'::jsonb, 'B must not see A''s sent invoice as used.ledger';
  ASSERT s->'lastAt'->'invoice_sent' = 'null'::jsonb, 'B must not see A''s invoice_sent';
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, true);

-- ─── fixture: a studio A owns, with H as an active member invited by A ─────────

INSERT INTO public.organizations (id, type, name, slug)
VALUES ('e9673000-0000-4000-8000-0000000000d1', 'design_studio', '00673 Studio', 'studio-00673-signals');

INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES ('e9673000-0000-4000-8000-0000000000d1', 'e9673000-0000-4000-8000-00000000000a', 'owner', 'active')
ON CONFLICT (user_id, organization_id) DO UPDATE SET role = 'owner', status = 'active';

INSERT INTO public.organization_members (organization_id, user_id, role, status, invited_by)
VALUES ('e9673000-0000-4000-8000-0000000000d1', 'e9673000-0000-4000-8000-00000000000c', 'member', 'active',
        'e9673000-0000-4000-8000-00000000000a');

-- (5) H is a hand
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'e9673000-0000-4000-8000-00000000000c', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  s jsonb := public.teaching_signals();
BEGIN
  ASSERT s->>'role' = 'hand', format('an active member must be a hand, got %s', s->>'role');
  ASSERT s->'used'->'seats' = 'false'::jsonb, 'H invited nobody';
END $$;

RESET ROLE;

-- A, owner of that studio, stays owner and now has seats
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'e9673000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  s jsonb := public.teaching_signals();
BEGIN
  ASSERT s->>'role' = 'owner', format('an active owner must be owner, got %s', s->>'role');
  ASSERT (s->'used'->>'seats')::boolean, 'used.seats must be true after A invited H';
  ASSERT s->'lastAt'->>'invite_sent' IS NOT NULL, 'lastAt.invite_sent must be set after A invited H';
  ASSERT s->'lastAt'->'invite_with_handoff_note' = 'null'::jsonb,
    'invite_with_handoff_note must stay null for an invite with no handoff note';
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, true);

-- ─── fixture: solo designer D with only removed/invited rows; a second studio ──
-- D was removed from studio 1 and has a pending invite to studio 2; D holds no
-- active membership anywhere. A joins studio 2 as an active 'member'.

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES
  ('e9673000-0000-4000-8000-00000000000d', '00673-signals-d@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.organizations (id, type, name, slug)
VALUES ('e9673000-0000-4000-8000-0000000000d2', 'design_studio', '00673 Studio Two', 'studio-00673-signals-two');

INSERT INTO public.organization_members (organization_id, user_id, role, status)
VALUES
  ('e9673000-0000-4000-8000-0000000000d1', 'e9673000-0000-4000-8000-00000000000d', 'member', 'removed'),
  ('e9673000-0000-4000-8000-0000000000d2', 'e9673000-0000-4000-8000-00000000000d', 'member', 'invited'),
  ('e9673000-0000-4000-8000-0000000000d2', 'e9673000-0000-4000-8000-00000000000a', 'member', 'active');

-- (6) D: only removed/invited rows → no active membership → the default, 'owner'
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'e9673000-0000-4000-8000-00000000000d', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  s jsonb := public.teaching_signals();
BEGIN
  -- Fixture sanity: D can read both of its own non-active rows, so the old
  -- any-row predicate would have made D a 'hand'.
  ASSERT (SELECT count(*) FROM public.organization_members
          WHERE user_id = 'e9673000-0000-4000-8000-00000000000d'
            AND status IN ('removed', 'invited')) = 2,
    'fixture: D must see its own removed and invited rows';
  ASSERT s->>'role' = 'owner',
    format('a designer with only removed/invited rows has no active membership and must be owner (the default), got %s', s->>'role');
END $$;

RESET ROLE;

-- (7) A: active owner of studio 1 and active member (hand) of studio 2 → 'owner'
-- (accepted: teaching_signals() takes no studio context).
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'e9673000-0000-4000-8000-00000000000a', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  s jsonb := public.teaching_signals();
BEGIN
  ASSERT s->>'role' = 'owner',
    format('an owner of one studio who is a hand in another must be owner (documented), got %s', s->>'role');
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, true);

ROLLBACK;
