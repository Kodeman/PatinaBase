-- 00786 — Outbound send claim ACL regression (pgTAP)
BEGIN;
SELECT plan(5);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.claim_outbound_draft_for_send(uuid)', 'EXECUTE'),
  'authenticated cannot claim an outbound draft'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.release_outbound_draft_claim(uuid)', 'EXECUTE'),
  'authenticated cannot release an outbound draft claim'
);
SELECT ok(
  has_function_privilege('service_role', 'public.claim_outbound_draft_for_send(uuid)', 'EXECUTE'),
  'service_role can claim an outbound draft'
);
SELECT ok(
  has_function_privilege('service_role', 'public.release_outbound_draft_claim(uuid)', 'EXECUTE'),
  'service_role can release an outbound draft claim'
);

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT public.claim_outbound_draft_for_send('00000000-0000-0000-0000-000000000001'::uuid)$$,
  '42501',
  NULL,
  'authenticated member claim attempt raises insufficient_privilege'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
