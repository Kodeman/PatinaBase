-- ═══════════════════════════════════════════════════════════════════════════
-- 00906 — C2 activation: switch on scope editions and grant the C2 mutations
-- Held in _pending/ until Kody's ship request; renumber to the then-current
-- head on release. Ship it in the same push as 00907 (C4): once C2 mints an
-- edition, the designer's acceptance section offers a request that C4 refuses.
--
-- BLOCKER (Codex review, 2026-10-31; confirmed on Strata): with the setting on,
-- _scope_after_execution (00886) mints for every executed document, and
-- _mint_scope_edition (00886:1305) refuses a non-origin document on a job with
-- no active edition (`scope_edition_stale`). Every job executed while C2 was
-- off has none (Strata: 8 such jobs, 0 editions, 4 open addenda), so
-- countersigning an addendum there would roll back. Do not release until a
-- legacy-job transition is ruled and built.
-- Plan: contracts/C2-scope-editions.md §2.8; evidence/rc/rc5-rollout-rehearsal.md §1.7.
-- ═══════════════════════════════════════════════════════════════════════════
-- Effect, global (server_capabilities has one row, not one per studio):
--   * countersign starts minting scope editions for every executed agreement
--     and addendum (00868 graft); invalidation already ran while inactive;
--   * designers can apply a launch arrangement (00905, K22), assign FF&E lines
--     to a scope package, and reconcile a stale edition.
-- Not changed: C4, C5, C6 and the C3 direct route stay ungranted; reads stay
-- as granted by 00868; margin_note_escalation stays off.
--
-- Review before release (Kody):
--   * D9 renderer gate (RC-5): the arrangement composer and scope readings
--     mount only in the round-8 renderer. Either every studio that could be
--     asked to act renders round 8, or the legacy frame gains the sections.
--   * Stale editions to reconcile: none expected. Strata has never had the
--     setting on, so project_scope_editions is empty; the release probe
--     re-counts `status = 'stale'` and never reconciles automatically (§2.8).
--
-- Rollback: a deactivation migration (C2 §2.8, RC-5 §1.9) that clears the
-- setting and revokes every C4/C5/C6 mutation and record_fabrication_instruction
-- in one transaction. Revoking apply_service_arrangement stops new compositions.
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '5s';

UPDATE public.server_capabilities SET enabled = true WHERE key = 'scope_editions';

GRANT EXECUTE ON FUNCTION public.apply_service_arrangement(uuid,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_ffe_items_to_scope_package(uuid,uuid[],text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_scope_edition(uuid,uuid,uuid) TO authenticated;

DO $$ BEGIN
  IF (SELECT enabled FROM public.server_capabilities WHERE key = 'scope_editions') IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'C2 activation found no scope_editions capability row to switch on';
  END IF;
END $$;
