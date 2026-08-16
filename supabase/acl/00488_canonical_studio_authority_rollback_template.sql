-- ═══════════════════════════════════════════════════════════════════════════
-- 00488 — Canonical studio authority: focused ordinary rollback
--
-- Run the platform-admin storage rollback first when the nine reserved-owner
-- policies reached their 00488 final state.  This transaction accepts only
-- the exact reviewed ordinary final state with exact source storage policies,
-- then restores the exact reviewed source catalog.  It never guesses a
-- workspace, merges rows, drops a dependency with CASCADE, or discards a
-- non-NULL 00488-only snapshot.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;
SET LOCAL search_path = pg_catalog, public;
SET LOCAL standard_conforming_strings = on;
SET LOCAL quote_all_identifiers = off;

-- Exact final-state proof.  This is the same hash-pinned catalog/caller gate
-- used by the forward renderer, forced to the final branch.
-- @@GENERATED_FINAL_PREFLIGHT@@

DO $canonical_studio_rollback_executor$
BEGIN
  IF current_user IS DISTINCT FROM 'postgres' THEN
    RAISE EXCEPTION '00488 ordinary rollback must run as postgres';
  END IF;
END;
$canonical_studio_rollback_executor$;

-- The ordinary phase may proceed only after reserved-owner storage policies
-- are exactly source-shaped.  The platform rollback deliberately restores
-- the narrow 00488 compatibility helpers so the final-state proof above is
-- coherent before this transaction begins.
-- @@GENERATED_STORAGE_SOURCE_SENTINEL@@

-- Source has no representation for these six columns.  Even one non-NULL
-- value makes a lossless exact-source rollback impossible.
DO $canonical_studio_rollback_data_gate$
BEGIN
  IF EXISTS (SELECT 1 FROM public.proposals WHERE studio_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.designer_clients WHERE studio_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.leads WHERE studio_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.client_decisions WHERE studio_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.saved_vendors WHERE studio_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.phase_templates WHERE studio_id IS NOT NULL)
  THEN
    RAISE EXCEPTION
      '00488 rollback refused: a non-NULL canonical studio snapshot has no source-state representation';
  END IF;

  -- The source uniqueness surface collapses the studio dimension.  Never
  -- choose, merge, or delete a row to make these constraints fit.
  IF EXISTS (
    SELECT 1
    FROM public.designer_clients
    WHERE client_id IS NOT NULL AND status <> 'lead'
    GROUP BY designer_id, client_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      '00488 rollback refused: designer/client rows collide in source uniqueness';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.designer_clients
    WHERE client_email IS NOT NULL AND client_id IS NULL
    GROUP BY designer_id, client_email
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      '00488 rollback refused: designer/email rows collide in source uniqueness';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.saved_vendors
    GROUP BY designer_id, vendor_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      '00488 rollback refused: saved-vendor rows collide in source uniqueness';
  END IF;
END;
$canonical_studio_rollback_data_gate$;

-- Re-emit only bodies whose reviewed source and final hashes differ, plus the
-- four source-only RPC signatures and four legacy authority identities.
-- @@GENERATED_SOURCE_ROUTINES@@

-- Restore the exact source security-invoker view before removing columns it
-- no longer references.
-- @@GENERATED_SOURCE_VIEW@@

-- Only the 136 ordinary policies whose source/final fingerprints differ need
-- replacement.  The other 48 are already exact in both states.
-- @@GENERATED_SOURCE_POLICIES@@

-- Final-only RPC overloads and compatibility cores have no source identity.
DROP FUNCTION public.claim_design_request(uuid,uuid);
DROP FUNCTION public.accept_design_request(uuid,uuid);
DROP FUNCTION public.open_project_direct(text,uuid,uuid,integer,integer,date,uuid);
DROP FUNCTION public.set_document_client(text,uuid,uuid,uuid);
DROP FUNCTION public._prepare_canonical_lead_claim(uuid,uuid);
DROP FUNCTION public._claim_design_request_00488_core(uuid);
DROP FUNCTION public._accept_design_request_00488_core(uuid);

DROP TRIGGER guard_canonical_studio_snapshot ON public.proposals;
DROP TRIGGER guard_canonical_studio_snapshot ON public.designer_clients;
DROP TRIGGER guard_canonical_studio_snapshot ON public.leads;
DROP TRIGGER guard_canonical_studio_snapshot ON public.client_decisions;
DROP TRIGGER guard_canonical_studio_snapshot ON public.saved_vendors;
DROP TRIGGER guard_canonical_studio_snapshot ON public.phase_templates;
DROP FUNCTION public.guard_canonical_studio_snapshot();

-- Restore exact source uniqueness while the final columns still exist.  The
-- read-only conflict gates above make every CREATE/ADD deterministic.
DROP INDEX public.idx_designer_clients_unique_profile;
DROP INDEX public.idx_designer_clients_unique_profile_legacy_null_studio;
CREATE UNIQUE INDEX idx_designer_clients_unique_profile
  ON public.designer_clients(designer_id, client_id)
  WHERE client_id IS NOT NULL AND status <> 'lead';
COMMENT ON INDEX public.idx_designer_clients_unique_profile IS
  '00331 (Arrival Arc): re-scoped from all-statuses to NON-LEAD rows only. '
  'status=''lead'' rows are per-engagement (one per accepted request, deduped by '
  'lead_id inside ceremony_complete); non-lead rows keep the one-canonical-'
  'relationship-per-pair invariant. Changing this predicate requires re-checking '
  'every ON CONFLICT inference on (designer_id, client_id): open_project_direct '
  'and activate_proposal_as_project were regrafted in 00331 for exactly that.';

DROP INDEX public.idx_designer_clients_unique_email;
DROP INDEX public.idx_designer_clients_unique_email_legacy_null_studio;
CREATE UNIQUE INDEX idx_designer_clients_unique_email
  ON public.designer_clients(designer_id, client_email)
  WHERE client_email IS NOT NULL AND client_id IS NULL;

DROP INDEX public.saved_vendors_studio_designer_vendor_key;
DROP INDEX public.saved_vendors_designer_vendor_legacy_null_studio_key;
ALTER TABLE public.saved_vendors
  ADD CONSTRAINT saved_vendors_designer_id_vendor_id_key
  UNIQUE (designer_id, vendor_id);

DROP INDEX public.proposals_studio_id_idx;
DROP INDEX public.designer_clients_studio_id_idx;
DROP INDEX public.leads_studio_id_idx;
DROP INDEX public.client_decisions_studio_id_idx;
DROP INDEX public.saved_vendors_studio_id_idx;
DROP INDEX public.phase_templates_studio_id_idx;

ALTER TABLE public.proposals DROP CONSTRAINT proposals_studio_id_fkey;
ALTER TABLE public.designer_clients DROP CONSTRAINT designer_clients_studio_id_fkey;
ALTER TABLE public.leads DROP CONSTRAINT leads_studio_id_fkey;
ALTER TABLE public.client_decisions DROP CONSTRAINT client_decisions_studio_id_fkey;
ALTER TABLE public.saved_vendors DROP CONSTRAINT saved_vendors_studio_id_fkey;
ALTER TABLE public.phase_templates DROP CONSTRAINT phase_templates_studio_id_fkey;

ALTER TABLE public.proposals DROP COLUMN studio_id;
ALTER TABLE public.designer_clients DROP COLUMN studio_id;
ALTER TABLE public.leads DROP COLUMN studio_id;
ALTER TABLE public.client_decisions DROP COLUMN studio_id;
ALTER TABLE public.saved_vendors DROP COLUMN studio_id;
ALTER TABLE public.phase_templates DROP COLUMN studio_id;

-- Every source caller has now been restored and storage is already source.
-- Plain DROP (never CASCADE) is the final reverse-dependency assertion.
DROP FUNCTION public._can_author_studio_snapshot(uuid,uuid);
DROP FUNCTION public._can_read_studio_snapshot(uuid,uuid);
DROP FUNCTION public._lock_designer_studio_authority(uuid,uuid);

-- Exact source ACLs for every re-emitted/reintroduced identity.
-- @@GENERATED_SOURCE_DCL@@

-- Re-run the complete hash/profile/ACL/policy/view/schema/caller proof, forced
-- to the source branch.
-- @@GENERATED_SOURCE_POSTFLIGHT@@

COMMIT;
