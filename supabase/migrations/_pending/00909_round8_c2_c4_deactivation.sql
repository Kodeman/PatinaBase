-- ═══════════════════════════════════════════════════════════════════════════
-- 00909 — Deactivation: pause scope editions and revoke every dependent mutation
-- The rollback for the 00907 C2 and 00908 C4 activations (and for C6/C5 when
-- they activate). Held in _pending/; renumber to the then-current head when it
-- is needed. Plan: contracts/C2-scope-editions.md §2.8 (F8);
-- contracts/C4-evidence-acceptance.md §2.8; evidence/rc/rc5-rollout-rehearsal.md
-- §1.9, rehearsed on an owned stack in §4.3 (state 3).
-- ═══════════════════════════════════════════════════════════════════════════
-- One transaction (each migration file is one under `supabase db push`):
--   * scope_editions off: countersign stops minting; an addendum executed
--     while off marks the job's active edition `stale` and supersedes its open
--     acceptance requests (00886 _scope_after_execution);
--   * revoked from authenticated: the C4 seven, the C6 three, the C5 five
--     (C5 §3.6: every mutation, including bind_fulfilment_evidence, which the
--     RC-5 §1.9 list of four missed) and the C3 direct route
--     record_fabrication_instruction;
--   * revoked from service_role: the paper hash stamp.
-- REVOKE of a privilege that was never granted is a no-op, so this also pauses
-- C5/C6 whether or not they were ever activated.
--
-- Kept, deliberately:
--   * the C2 three (apply_service_arrangement, assign_ffe_items_to_scope_package,
--     reconcile_scope_edition) stay granted: each refuses `scope_editions_inactive`
--     at entry (_assert_scope_composition_enabled), as C2 §2.8 allows;
--   * every read RPC and both storage predicates, so recorded evidence stays
--     visible; minted editions, requests and responses are never deleted.
-- What people see: open requests stay `sent` and cannot be answered; the client
-- shows "Responses are paused for now. Nothing you've seen is lost."
--
-- Reactivation is not a revival (C2 §2.8 point 3): re-run the activation
-- migrations (their grants are idempotent), then reconcile each job whose
-- edition went stale while paused with reconcile_scope_edition. The
-- reactivation review lists those jobs; nothing reconciles automatically.
-- ═══════════════════════════════════════════════════════════════════════════
SET LOCAL lock_timeout = '5s';

UPDATE public.server_capabilities SET enabled = false WHERE key = 'scope_editions';

-- C4 (00886, 00899)
REVOKE EXECUTE ON FUNCTION public.create_service_acceptance_request(uuid,uuid,uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.respond_service_acceptance(uuid,text,jsonb,text,text,text,integer,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_service_acceptance_paper_intake(uuid,uuid,uuid,date,text,text,jsonb,text,integer,text,text,integer,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.review_service_acceptance_paper_intake(uuid,text,text,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.replace_service_acceptance_signer(uuid,uuid,uuid,uuid,integer,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.withdraw_service_acceptance_request(uuid,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.present_service_acceptance_offline(uuid,text,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.stamp_service_acceptance_paper_hash(uuid,text,text,text) FROM service_role;

-- C6 (00888)
REVOKE EXECUTE ON FUNCTION public.complete_studio_service(uuid,uuid,text,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.resolve_service_acceptance_condition(uuid,uuid,text,jsonb,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.revoke_studio_service_completion(uuid,text) FROM authenticated;

-- C5 external fulfilment and the C3 direct route (C2 §2.8 point 1, SQ-1851 R4)
REVOKE EXECUTE ON FUNCTION public.create_external_fulfilment(uuid,uuid,text,text,text[],uuid,uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_external_fulfilment_event(uuid,text,jsonb,text[],text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.verify_external_fulfilment_event(uuid,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.set_ffe_item_external_fulfilment(uuid,uuid,bigint,text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.bind_fulfilment_evidence(uuid,uuid,text[],text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_fabrication_instruction(uuid,uuid,uuid,text[],jsonb,uuid) FROM authenticated;

DO $$ BEGIN
  IF (SELECT enabled FROM public.server_capabilities WHERE key = 'scope_editions') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'Deactivation found no scope_editions capability row to switch off';
  END IF;
END $$;
