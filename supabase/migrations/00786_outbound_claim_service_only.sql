-- ═══════════════════════════════════════════════════════════════════════════
-- 00786 — Restrict outbound send claims to the service role
-- Reconciles: 00784 grants claim/release to authenticated; sender uses service_role.
-- ═══════════════════════════════════════════════════════════════════════════
REVOKE EXECUTE ON FUNCTION public.claim_outbound_draft_for_send(uuid)
  FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_outbound_draft_for_send(uuid)
  TO service_role;

REVOKE EXECUTE ON FUNCTION public.release_outbound_draft_claim(uuid)
  FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.release_outbound_draft_claim(uuid)
  TO service_role;
