-- ═══════════════════════════════════════════════════════════════════════════
-- The First Letter — client-invitation render snapshot (migration 00581)
--
-- Covers the six facts Task 1 owes the rest of the build:
--   1. client_invitations accepts a whole frozen letter snapshot.
--   2. The 280-character note cap is enforced by the database.
--   3. kind is constrained to 'invite' | 'notice'.
--   4. project_notes carries a frozen author_byline.
--   5. client_invitation_status() reads the latest non-superseded row as 'sent'.
--   6. An accepted invitation reads 'accepted'.
--
-- How to run:
--   psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
--     -v ON_ERROR_STOP=1 -f supabase/tests/client_invite/letter_snapshot_test.sql
--
-- Everything runs in one transaction and ROLLBACKs, so it is re-runnable.
-- request.jwt.claims is set because client_invitation_status() scopes itself to
-- auth.uid(); without a claim the function is correct and still returns nothing.
-- ═══════════════════════════════════════════════════════════════════════════
\set ON_ERROR_STOP on
BEGIN;

SET LOCAL request.jwt.claims =
  '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- A designer, a client household, an invitation.
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'designer@test.local')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.profiles (id, email, full_name, role)
VALUES ('11111111-1111-1111-1111-111111111111', 'designer@test.local', 'Leah Hartwell', 'designer')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.designer_clients (id, designer_id, client_email, client_name, status)
VALUES ('22222222-2222-2222-2222-222222222222',
        '11111111-1111-1111-1111-111111111111',
        'dave@okonkwo.test', 'Dave Okonkwo', 'active');

-- 1. The snapshot columns exist and accept a full row.
INSERT INTO public.client_invitations
  (token, email, designer_id, designer_client_id, kind, recipient_name,
   sender_display_name, designer_given_name, designer_full_name, studio_name,
   signature_city, project_name, rendered_subject, rendered_standing_sentence,
   personal_message, signer_id, writer_id, last_sent_at)
VALUES
  ('tok-letter-1', 'dave@okonkwo.test',
   '11111111-1111-1111-1111-111111111111',
   '22222222-2222-2222-2222-222222222222',
   'invite', 'Dave Okonkwo',
   'Middle West Studio', 'Leah', 'Leah Hartwell', 'Middle West Studio',
   'Madison', 'Van Hise kitchen and back hall',
   'Leah Hartwell invited you to the Van Hise kitchen and back hall',
   'Leah Hartwell of Middle West Studio added you to the Van Hise kitchen and back hall on 8 September. The page below holds the studio''s record of the job — the plans, the papers, and the numbers.',
   'Dave — this is the same file I work from.',
   '11111111-1111-1111-1111-111111111111',
   '11111111-1111-1111-1111-111111111111',
   now());

-- 2. The 280 cap is enforced by the database, not only by the composer.
DO $$
BEGIN
  INSERT INTO public.client_invitations (token, email, designer_id, personal_message)
  VALUES ('tok-letter-too-long', 'x@test.local',
          '11111111-1111-1111-1111-111111111111', repeat('x', 281));
  RAISE EXCEPTION 'expected the 280 CHECK to reject a 281-character note';
EXCEPTION WHEN check_violation THEN
  NULL;
END $$;

-- 3. kind is constrained.
DO $$
BEGIN
  INSERT INTO public.client_invitations (token, email, designer_id, kind)
  VALUES ('tok-letter-bad-kind', 'y@test.local',
          '11111111-1111-1111-1111-111111111111', 'shout');
  RAISE EXCEPTION 'expected the kind CHECK to reject an unknown kind';
EXCEPTION WHEN check_violation THEN
  NULL;
END $$;

-- 4. project_notes carries a frozen byline.
DO $$
DECLARE v_col text;
BEGIN
  SELECT column_name INTO v_col FROM information_schema.columns
   WHERE table_schema='public' AND table_name='project_notes' AND column_name='author_byline';
  IF v_col IS NULL THEN
    RAISE EXCEPTION 'project_notes.author_byline is missing';
  END IF;
END $$;

-- 5. The status function is callable and reads the latest non-superseded row.
DO $$
DECLARE v_state text;
BEGIN
  SELECT state INTO v_state
    FROM public.client_invitation_status('22222222-2222-2222-2222-222222222222');
  IF v_state IS DISTINCT FROM 'sent' THEN
    RAISE EXCEPTION 'expected state=sent, got %', COALESCE(v_state, '<null>');
  END IF;
END $$;

-- 6. An accepted invitation reads 'accepted'.
UPDATE public.client_invitations SET accepted_at = now() WHERE token = 'tok-letter-1';
DO $$
DECLARE v_state text;
BEGIN
  SELECT state INTO v_state
    FROM public.client_invitation_status('22222222-2222-2222-2222-222222222222');
  IF v_state IS DISTINCT FROM 'accepted' THEN
    RAISE EXCEPTION 'expected state=accepted, got %', COALESCE(v_state, '<null>');
  END IF;
END $$;

ROLLBACK;
