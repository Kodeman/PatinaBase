-- ═══════════════════════════════════════════════════════════════════════════
-- 00908 — C4 activation: grant the service acceptance mutations
-- Held in _pending/ until Kody's ship request; renumber to the then-current
-- head on release. Ships in the same push as 00907 (see 00907 header).
-- Plan: contracts/C4-evidence-acceptance.md §2.8 activation grant plan;
-- evidence/rc/rc5-rollout-rehearsal.md §1.7. Signatures checked against
-- Strata at 00905 (2026-10-31); unchanged since 00886/00899.
-- ═══════════════════════════════════════════════════════════════════════════
-- Grants exactly the seven mutations to authenticated and the paper content
-- stamp to service_role (its one caller is service-acceptance-paper-hash).
-- Never granted: anything to PUBLIC or anon; the stamp to authenticated; any
-- table privilege; any _service_acceptance_* helper, guard or trigger. The
-- three reads and the two storage predicates were granted by 00886/00889.
-- Every mutation still re-checks scope_editions at entry (F8).
--
-- Preconditions for the release review (C4 §2.8, RC-5 §1.7):
--   * K3, K4, K5 recorded (DECISIONS.md, 2026-10-27);
--   * WP-10C consumer sign-off: client portal and iOS Patina, after activation;
--   * household-card consent: answered by K6 (2026-10-29), the studio's
--     assertion is enough; no longer an activation gate;
--   * RC-5 §6.2 risks: 1 (scope not shown) is fixed, the client portal renders
--     the agreed scope and evidence (service-acceptance.tsx ServiceAcceptanceEvidence);
--     3 (all-paper request never `sent`) is fixed by 00899
--     present_service_acceptance_offline; 2 (an excluded package's open phase
--     blocks C6 completion) is not re-verified and matters at C6 activation;
--   * D9 renderer gate, as for 00907.
-- C6 stays ungranted: the Studio service section reads `active` once
-- scope_editions is on, and a completion attempt is denied until C6 activates.
--
-- Rollback: the same deactivation migration as 00907; the inverse REVOKEs are
-- in C4 §2.8. Open requests stay `sent`; clients see "Responses are paused".
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '5s';

GRANT EXECUTE ON FUNCTION public.create_service_acceptance_request(uuid,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_service_acceptance_paper_intake(uuid,uuid,uuid,date,text,text,jsonb,text,integer,text,text,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_service_acceptance_paper_intake(uuid,text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.replace_service_acceptance_signer(uuid,uuid,uuid,uuid,integer,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_service_acceptance_request(uuid,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.present_service_acceptance_offline(uuid,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stamp_service_acceptance_paper_hash(uuid,text,text,text) TO service_role;

-- C2 must already be active (C2 §2.8, RC-5 D4). The file is one transaction,
-- so this refusal also undoes the grants above.
DO $$ BEGIN
  IF (SELECT enabled FROM public.server_capabilities WHERE key = 'scope_editions') IS DISTINCT FROM true
     OR NOT has_function_privilege('authenticated', 'public.apply_service_arrangement(uuid,text,uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'C4 activation refused: apply the C2 activation (scope_editions on, C2 grants) first';
  END IF;
END $$;
