-- 00668 — device_push_tokens.app: the default is the backfill, the CHECK
-- admits the two bundle ids only, and the owner can register either app.
--
-- Run: psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/notifications/00668_device_push_tokens_app_test.sql
-- Everything runs inside one transaction and is rolled back.

BEGIN;

-- ─── the column's shape ────────────────────────────────────────────────────

DO $$
DECLARE
  v_column record;
  v_check text;
BEGIN
  SELECT data_type, is_nullable, column_default
  INTO v_column
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'device_push_tokens'
    AND column_name = 'app';

  ASSERT FOUND, 'device_push_tokens.app must exist';
  ASSERT v_column.data_type = 'text', 'app must be text';
  ASSERT v_column.is_nullable = 'NO', 'app must be NOT NULL';
  ASSERT v_column.column_default = '''cloud.patina.app''::text',
    format('app must default to cloud.patina.app, got %s', v_column.column_default);

  SELECT pg_get_constraintdef(c.oid)
  INTO v_check
  FROM pg_constraint c
  WHERE c.conrelid = 'public.device_push_tokens'::regclass
    AND c.conname = 'device_push_tokens_app_check';

  ASSERT v_check IS NOT NULL, 'device_push_tokens_app_check must exist';
  ASSERT v_check LIKE '%cloud.patina.app%' AND v_check LIKE '%cloud.patina.field%',
    format('the CHECK must name both bundle ids, got %s', v_check);

  -- Every row that existed before 00668 is a Patina token.
  ASSERT NOT EXISTS (
    SELECT 1 FROM public.device_push_tokens WHERE app <> 'cloud.patina.app'
  ), 'no pre-existing token may read as anything but cloud.patina.app';
END $$;

-- ─── fixture ───────────────────────────────────────────────────────────────

INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('e9668000-0000-4000-8000-000000000001', '00668-push-owner@test.invalid', '', NOW(), NOW(), NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

-- ─── the default and the CHECK (as service_role would write) ───────────────

DO $$
DECLARE
  v_user uuid := 'e9668000-0000-4000-8000-000000000001';
  v_app text;
BEGIN
  -- A Patina build that sends no app (every build before W1A-13).
  INSERT INTO public.device_push_tokens (user_id, token, environment)
  VALUES (v_user, '00668-token-omits-app', 'sandbox')
  RETURNING app INTO v_app;
  ASSERT v_app = 'cloud.patina.app',
    format('a token registered without app must default to cloud.patina.app, got %s', v_app);

  INSERT INTO public.device_push_tokens (user_id, token, environment, app)
  VALUES (v_user, '00668-token-field', 'production', 'cloud.patina.field')
  RETURNING app INTO v_app;
  ASSERT v_app = 'cloud.patina.field', 'a Field token keeps its app';

  -- The audience's short names are not bundle ids.
  BEGIN
    INSERT INTO public.device_push_tokens (user_id, token, environment, app)
    VALUES (v_user, '00668-token-short-name', 'sandbox', 'field');
    RAISE EXCEPTION 'app = field must violate device_push_tokens_app_check';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.device_push_tokens (user_id, token, environment, app)
    VALUES (v_user, '00668-token-other-bundle', 'sandbox', 'cloud.patina.app.widget');
    RAISE EXCEPTION 'an unknown bundle id must violate device_push_tokens_app_check';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.device_push_tokens (user_id, token, environment, app)
    VALUES (v_user, '00668-token-null-app', 'sandbox', NULL);
    RAISE EXCEPTION 'an explicit NULL app must violate NOT NULL';
  EXCEPTION WHEN not_null_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE public.device_push_tokens
    SET app = 'app'
    WHERE token = '00668-token-omits-app';
    RAISE EXCEPTION 'updating app to a short name must violate the CHECK';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  DELETE FROM public.device_push_tokens WHERE user_id = v_user;
END $$;

-- ─── the owner registers under RLS, with and without app ───────────────────
-- The client's upsert (PushTokenService, onConflict: token) runs as the
-- signed-in user. 00335's table grants must cover the new column.

SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', 'e9668000-0000-4000-8000-000000000001', 'role', 'authenticated')::text,
  true
);
SET LOCAL ROLE authenticated;

INSERT INTO public.device_push_tokens (user_id, token, environment)
VALUES ('e9668000-0000-4000-8000-000000000001', '00668-owner-patina', 'sandbox')
ON CONFLICT (token) DO UPDATE SET environment = EXCLUDED.environment;

INSERT INTO public.device_push_tokens (user_id, token, environment, app)
VALUES ('e9668000-0000-4000-8000-000000000001', '00668-owner-field', 'sandbox', 'cloud.patina.field')
ON CONFLICT (token) DO UPDATE SET environment = EXCLUDED.environment, app = EXCLUDED.app;

DO $$
BEGIN
  ASSERT (
    SELECT app FROM public.device_push_tokens WHERE token = '00668-owner-patina'
  ) = 'cloud.patina.app', 'the owner''s token without app reads as Patina';
  ASSERT (
    SELECT app FROM public.device_push_tokens WHERE token = '00668-owner-field'
  ) = 'cloud.patina.field', 'the owner can register a Field token';
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims', NULL, true);

ROLLBACK;
