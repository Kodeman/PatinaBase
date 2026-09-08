\set ON_ERROR_STOP on
-- The Trade Agreement was CREATED and marked sent through the room's own composer;
-- only the dispatch (edge function trade-agreement-send) fails on this stack, because
-- RESEND_API_KEY is not set locally. Mint its token through the same RPC that
-- function calls, so the sub's page can be walked.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
SET LOCAL role authenticated;
SELECT public.mint_trade_agreement_token('f35ee37c-52e3-4074-90a2-d60505531933') AS token \gset
COMMIT;
\echo TOKEN:
SELECT :'token';
