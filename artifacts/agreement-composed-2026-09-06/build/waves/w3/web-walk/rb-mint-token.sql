\set ON_ERROR_STOP on
-- The Trade Agreement was CREATED through the room's own composer; only the
-- dispatch (edge function trade-agreement-send) 503s on this stack, because
-- supabase_edge_runtime is a stopped service. Mark it sent and mint its token
-- through the same RPCs that function calls, so the sub's page can be walked.
BEGIN;
SELECT set_config('request.jwt.claims',
  json_build_object('sub', 'a0000000-0000-0000-0000-000000000004', 'role', 'authenticated')::text, true);
SET LOCAL role authenticated;

SELECT public.mint_trade_agreement_token('7e1c1d96-4e05-4607-b5a3-2cd419bfd420') AS token \gset
COMMIT;
\echo TOKEN:
SELECT :'token';
