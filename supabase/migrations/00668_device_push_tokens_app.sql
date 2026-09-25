-- ═══════════════════════════════════════════════════════════════════════════
-- 00668 — device_push_tokens.app: which app a device token belongs to
--         (iOS 27 program, NI-01, US-11)
--
-- An APNs token belongs to one app on one device, and APNs refuses a push
-- whose `apns-topic` is not that app's bundle id. 00335 stored no app, because
-- only Patina registered tokens. Patina Field (cloud.patina.field) will
-- register too, so apns-send needs each token's app to choose its topic.
--
-- The column holds the bundle id. The default is the backfill: every row that
-- exists today was registered by Patina, so no UPDATE runs, and a Patina build
-- that omits `app` on its upsert still registers a Patina token.
--
-- apns-send (the same ticket) selects `token, environment, app`, keeps only
-- the audience's app for a user_id push, and sets the topic per token. Deploy
-- this migration before that function.
--
-- Rollback: supabase/rollback/00668_device_push_tokens_app.sql. It is kept
-- outside migrations/ because a reset or `db push` applies everything in
-- migrations/.
--
-- Grants: none. 00335's table grants already cover a new column: the owner
-- (authenticated, under the owner-only RLS policy) and service_role.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.device_push_tokens
  ADD COLUMN IF NOT EXISTS app text NOT NULL DEFAULT 'cloud.patina.app'
    CONSTRAINT device_push_tokens_app_check
    CHECK (app IN ('cloud.patina.app', 'cloud.patina.field'));

COMMENT ON COLUMN public.device_push_tokens.app IS
  'The bundle id of the app that registered the token (00668): '
  'cloud.patina.app or cloud.patina.field. apns-send sends each token under '
  'its own app''s topic, and a user_id push reaches one app''s tokens only. '
  'Defaults to cloud.patina.app, the only app that registered before 00668.';
