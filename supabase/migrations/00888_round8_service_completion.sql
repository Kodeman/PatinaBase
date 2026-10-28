-- 00888 Round 8 C6 studio service completion (US-52 W5 WP-10B). Shipped INACTIVE.
--
-- Contract: docs/design/designer-portal-round8/contracts/C6-service-completion.md
-- §2.1-§2.11, under Kody's K3 ruling of 2026-10-27 = Option A (complete with
-- conditions): the state CHECK allows 'completed' and 'completed_with_conditions';
-- an open acceptance condition is reported under `conditions`, never a blocker;
-- resolving the last id in a completion's open_condition_ids moves it to
-- 'completed' in the same transaction. Included studio obligations block;
-- excluded external work is informational; an outstanding balance is a separate
-- financial hold (read as of the derivation, outside the obligation hash, R20).
--
-- Not touched: close_project, the projects closure columns
-- (status/closure_checklist/portfolio_snapshot) and the 00853 freeze trigger.
-- C6 never writes public.projects.
--
-- Inactive: every mutation and helper has EXECUTE revoked from PUBLIC, anon,
-- authenticated and service_role, and each mutation re-checks scope_editions at
-- entry (scope_editions_inactive). Only the two reads,
-- derive_studio_service_obligations(uuid) and get_studio_service_completion(uuid),
-- are granted to authenticated. The activation grant plan is C6 §2.7.
--
-- §2.5 service-obligation lock. Key: hashtext('svc_obligations:' || project_id)
-- (00808 'ffe_label:' naming). Contributing writers take it SHARED through the
-- BEFORE INSERT OR UPDATE OR DELETE row trigger zzzzz_service_obligation_lock,
-- which sorts after every other BEFORE row trigger on its table. The triggers
-- ship active: they change no data. complete_studio_service locks
--   1 projects FOR KEY SHARE, 2 the active edition FOR SHARE, 3 the acceptance
--   request FOR SHARE, 4 live completions of that edition FOR UPDATE,
--   5 pg_advisory_xact_lock(key) EXCLUSIVE,
--   6 then, in later statements, re-reads its key's receipt (replay), derives,
--     compares the hash and inserts.
-- It refuses unless the transaction is READ COMMITTED. resolve_service_acceptance_condition
-- takes the same order through step 5 on every call (before or after completion),
-- except that step 3 is FOR NO KEY UPDATE; revoke_studio_service_completion takes
-- steps 1-4 the same way. Step 3 FOR NO KEY UPDATE conflicts with a completion's
-- FOR SHARE and with another resolver's or revoker's lock, but not with the FOR KEY
-- SHARE of a child-row FK check. A completion row is inserted only while its
-- inserter holds its request FOR SHARE, so a resolver's step-4 statement sees,
-- and locks, every completion it can later UPDATE: after step 5 no C6 caller waits
-- on a row lock.
-- Step 1 is FOR KEY SHARE, not the contract draft's FOR SHARE. Both conflict with
-- the FOR UPDATE that close_project and the C2/C4/C5 paths take, so the
-- serialization is the same. FOR SHARE also conflicts with a plain UPDATE of
-- projects, and two writers update projects AFTER a contributing write:
-- settle_section_on_gate_approval (AFTER UPDATE trigger on client_decisions)
-- and _activate_proposal_as_project_impl. Against FOR SHARE each is a hard 40P01
-- (writer holds the shared key and waits on the projects row; completion holds
-- the row and waits on the key). C6 reads no projects column into the hash.
--
-- Writer census on the replayed head (pg_proc, every public plpgsql/sql body;
-- static and shallow: a helper's locks count only where the body names them).
-- 117 functions write a contributing table. The rule each satisfies:
--   R1 (22): projects FOR UPDATE before the first contributing write, which
--     excludes completion at step 1. _mint_scope_edition, create_service_acceptance_request,
--     create_external_fulfilment, create_plan_issue, advance_project_phase,
--     update_project_phase, create/delete_project_phase, seed_project_schedule_from_template,
--     apply_scope_change and the create/send/approve/decline/cancel/accept scope-change
--     RPCs, reassign_project_lead, supersede_project_approval_decision,
--     _create_project_approval_decision_checked, the two furnishings-authorization
--     executors, set_project_ffe_planned_destination.
--   R0 (94): no projects FOR UPDATE and no C2/C4/C6 row lock after the first
--     contributing write, so no wait edge leads back to a waiting completion.
--     Includes place_product_in_project_v2 and the placement core (projects
--     KEY SHARE + label lock), the FF&E status/pricing RPCs, respond and paper
--     intake/review (their C4 row locks are taken by _lock_service_acceptance_request
--     before the first write: R2), the C5 record/verify/bind paths (projects,
--     label, edition and fulfilment locks before the first write: R2) and
--     resolve_service_acceptance_condition (steps 1-5 before the insert: R2).
--     Two R0 writers then UPDATE projects; FOR KEY SHARE at step 1 covers them.
--     _sign_proposal_authorized_00400 is R0 too. Only a fresh signature inserts its
--     approval client_decisions row, keyed on proposals.project_id. Its later
--     projects lock is FOR SHARE when that project is set (no conflict with step 1)
--     and FOR UPDATE only when it is NULL, where the insert took no project's key.
--     An accepted retry skips the insert. No residual path remains.
-- Direct table writes through RLS (project_ffe_items_studio_rw and the like)
-- take the key through the trigger and lock nothing after it: R0.
-- Invoice, invoice-line, payment and milestone tables carry no trigger (R20).
-- close_project is not edited: it holds projects FOR UPDATE (excludes step 1)
-- and writes no contributing row.
--
-- Idempotent DDL: tables and indexes use IF NOT EXISTS with every constraint
-- inline, and each trigger is dropped before it is created.

-- ---------------------------------------------------------------------------
-- Records (§2.2)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.studio_service_completions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE RESTRICT,
  scope_edition_id uuid NOT NULL REFERENCES public.project_scope_editions(id) ON DELETE RESTRICT,
  acceptance_request_id uuid NOT NULL REFERENCES public.service_acceptance_requests(id) ON DELETE RESTRICT,
  state text NOT NULL CHECK (state IN ('completed','completed_with_conditions')),
  obligation_snapshot jsonb NOT NULL CHECK (jsonb_typeof(obligation_snapshot) = 'object'),
  obligation_hash text NOT NULL CHECK (obligation_hash ~ '^[0-9a-f]{64}$'),
  open_condition_ids uuid[] NOT NULL DEFAULT '{}',
  financial_hold jsonb NOT NULL CHECK (jsonb_typeof(financial_hold) = 'object'),
  conditions_closed_at timestamptz,
  completed_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  completed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  client_request_id text NOT NULL CHECK (btrim(client_request_id) <> '' AND length(client_request_id) <= 200),
  request_hash text NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  revoke_reason text,
  CONSTRAINT studio_service_completions_client_request_key UNIQUE (project_id, client_request_id),
  CONSTRAINT studio_service_completions_conditions_ck CHECK (
    array_ndims(open_condition_ids) IS NULL OR array_ndims(open_condition_ids) = 1),
  CONSTRAINT studio_service_completions_state_ck CHECK (
    (state <> 'completed_with_conditions' OR cardinality(open_condition_ids) > 0)
    AND (conditions_closed_at IS NOT NULL) = (state = 'completed' AND cardinality(open_condition_ids) > 0)),
  CONSTRAINT studio_service_completions_revoked_ck CHECK (
    (revoked_at IS NULL) = (revoked_by IS NULL)
    AND (revoked_at IS NULL) = (revoke_reason IS NULL)
    AND (revoke_reason IS NULL OR (btrim(revoke_reason) <> '' AND length(revoke_reason) <= 2000)))
);
CREATE UNIQUE INDEX IF NOT EXISTS studio_service_completions_one_live_idx
  ON public.studio_service_completions (project_id, scope_edition_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS studio_service_completions_request_idx
  ON public.studio_service_completions (acceptance_request_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS public.service_acceptance_condition_resolutions (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.service_acceptance_requests(id) ON DELETE RESTRICT,
  condition_id uuid NOT NULL,
  response_id uuid NOT NULL REFERENCES public.service_acceptance_responses(id) ON DELETE RESTRICT,
  resolution text NOT NULL CHECK (btrim(resolution) <> '' AND length(resolution) <= 2000),
  evidence jsonb NOT NULL CHECK (jsonb_typeof(evidence) = 'object'),
  resolved_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  resolved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  client_request_id text NOT NULL CHECK (btrim(client_request_id) <> '' AND length(client_request_id) <= 200),
  request_hash text NOT NULL,
  CONSTRAINT service_acceptance_condition_resolutions_condition_key UNIQUE (request_id, condition_id),
  CONSTRAINT service_acceptance_condition_resolutions_client_request_key UNIQUE (request_id, client_request_id)
);
CREATE INDEX IF NOT EXISTS service_acceptance_condition_resolutions_response_idx
  ON public.service_acceptance_condition_resolutions (response_id);

COMMENT ON TABLE public.studio_service_completions IS
  'C6 studio service completion. Never writes projects; immutable except completed_with_conditions -> completed and revocation, under app.service_completion_id.';
COMMENT ON COLUMN public.studio_service_completions.open_condition_ids IS
  'Acceptance conditions still unresolved at completion (K3 Option A). Fixed at insert; the row moves to completed once every id has a resolution.';
COMMENT ON COLUMN public.studio_service_completions.financial_hold IS
  'As-of-read display copy of the invoice-truth hold (R20). Not part of obligation_snapshot or obligation_hash.';
COMMENT ON TABLE public.service_acceptance_condition_resolutions IS
  'Append-only studio-recorded resolution of one C4 acceptance condition, with evidence (K3).';

ALTER TABLE public.studio_service_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_acceptance_condition_resolutions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.studio_service_completions FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.service_acceptance_condition_resolutions FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Write guards (SECURITY INVOKER: current_user is postgres only inside the
-- definer RPCs below; the capability setting names the exact row).
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._guard_studio_service_completion()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  closed text[] := ARRAY['state','conditions_closed_at'];
  revoked text[] := ARRAY['revoked_at','revoked_by','revoke_reason'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'service_completion_immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF current_user <> 'postgres' OR current_setting('app.service_completion_id', true)
     IS DISTINCT FROM (CASE WHEN TG_OP = 'INSERT' THEN NEW.id ELSE OLD.id END)::text THEN
    RAISE EXCEPTION 'service_completion_write_unauthorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.revoked_at IS NOT NULL OR NEW.conditions_closed_at IS NOT NULL THEN
      RAISE EXCEPTION 'service_completion_transition_invalid' USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.revoked_at IS NULL
     AND OLD.state = 'completed_with_conditions' AND NEW.state = 'completed'
     AND OLD.conditions_closed_at IS NULL AND NEW.conditions_closed_at IS NOT NULL
     AND (to_jsonb(NEW) - closed) = (to_jsonb(OLD) - closed) THEN
    RETURN NEW;
  END IF;
  IF OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL
     AND (to_jsonb(NEW) - revoked) = (to_jsonb(OLD) - revoked) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'service_completion_transition_invalid' USING ERRCODE = 'check_violation';
END;
$$;

CREATE OR REPLACE FUNCTION public._guard_service_acceptance_condition_resolution()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
BEGIN
  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'service_acceptance_resolution_immutable' USING ERRCODE = 'check_violation';
  END IF;
  IF current_user <> 'postgres'
     OR current_setting('app.service_condition_resolution_id', true) IS DISTINCT FROM NEW.id::text THEN
    RAISE EXCEPTION 'service_acceptance_resolution_unauthorized' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_studio_service_completion ON public.studio_service_completions;
CREATE TRIGGER guard_studio_service_completion BEFORE INSERT OR UPDATE OR DELETE
  ON public.studio_service_completions FOR EACH ROW EXECUTE FUNCTION public._guard_studio_service_completion();
DROP TRIGGER IF EXISTS guard_service_acceptance_condition_resolution ON public.service_acceptance_condition_resolutions;
CREATE TRIGGER guard_service_acceptance_condition_resolution BEFORE INSERT OR UPDATE OR DELETE
  ON public.service_acceptance_condition_resolutions FOR EACH ROW
  EXECUTE FUNCTION public._guard_service_acceptance_condition_resolution();

-- ---------------------------------------------------------------------------
-- §2.5 service-obligation lock
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._service_obligation_key(p_project_id uuid)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT hashtext('svc_obligations:' || p_project_id::text);
$$;

CREATE OR REPLACE FUNCTION public._service_obligation_write_lock(p_project_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_project_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock_shared(public._service_obligation_key(p_project_id));
  END IF;
END;
$$;

-- Definer, so a direct RLS write by authenticated can resolve a child row's
-- project and call the revoked helper. It reads parents only and writes nothing.
CREATE OR REPLACE FUNCTION public._service_obligation_lock_row()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_old uuid; v_new uuid;
BEGIN
  IF TG_TABLE_NAME IN ('project_phases','project_ffe_items','client_decisions','scope_change_requests',
      'project_scope_editions','service_acceptance_requests','project_external_fulfilments','install_punch_items') THEN
    IF TG_OP <> 'INSERT' THEN v_old := OLD.project_id; END IF;
    IF TG_OP <> 'DELETE' THEN v_new := NEW.project_id; END IF;
  ELSIF TG_TABLE_NAME IN ('project_scope_edition_packages','project_scope_edition_phases','project_scope_edition_signers') THEN
    IF TG_OP <> 'INSERT' THEN
      SELECT project_id INTO v_old FROM public.project_scope_editions WHERE id = OLD.edition_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT project_id INTO v_new FROM public.project_scope_editions WHERE id = NEW.edition_id;
    END IF;
  ELSIF TG_TABLE_NAME IN ('service_acceptance_signers','service_acceptance_paper_intakes','service_acceptance_responses',
      'service_acceptance_condition_resolutions') THEN
    IF TG_OP <> 'INSERT' THEN
      SELECT project_id INTO v_old FROM public.service_acceptance_requests WHERE id = OLD.request_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT project_id INTO v_new FROM public.service_acceptance_requests WHERE id = NEW.request_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'project_external_fulfilment_events' THEN
    IF TG_OP <> 'INSERT' THEN
      SELECT project_id INTO v_old FROM public.project_external_fulfilments WHERE id = OLD.fulfilment_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT project_id INTO v_new FROM public.project_external_fulfilments WHERE id = NEW.fulfilment_id;
    END IF;
  ELSIF TG_TABLE_NAME = 'trade_scope_terms' THEN
    IF TG_OP <> 'INSERT' THEN
      SELECT project_id INTO v_old FROM public.proposals WHERE id = OLD.proposal_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT project_id INTO v_new FROM public.proposals WHERE id = NEW.proposal_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'service_obligation_lock_unmapped_table %', TG_TABLE_NAME USING ERRCODE = 'internal_error';
  END IF;
  -- Ascending key order when a row moves between projects.
  PERFORM public._service_obligation_write_lock(LEAST(v_old, v_new));
  IF v_old IS DISTINCT FROM v_new THEN
    PERFORM public._service_obligation_write_lock(GREATEST(v_old, v_new));
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

-- Top-level, one statement per table (no DO body), so the trigger set is greppable.
DROP TRIGGER IF EXISTS zzzzz_service_obligation_lock ON public.project_phases;
CREATE TRIGGER zzzzz_service_obligation_lock BEFORE INSERT OR UPDATE OR DELETE ON public.project_phases
  FOR EACH ROW EXECUTE FUNCTION public._service_obligation_lock_row();
DROP TRIGGER IF EXISTS zzzzz_service_obligation_lock ON public.project_ffe_items;
CREATE TRIGGER zzzzz_service_obligation_lock BEFORE INSERT OR UPDATE OR DELETE ON public.project_ffe_items
  FOR EACH ROW EXECUTE FUNCTION public._service_obligation_lock_row();
DROP TRIGGER IF EXISTS zzzzz_service_obligation_lock ON public.client_decisions;
CREATE TRIGGER zzzzz_service_obligation_lock BEFORE INSERT OR UPDATE OR DELETE ON public.client_decisions
  FOR EACH ROW EXECUTE FUNCTION public._service_obligation_lock_row();
DROP TRIGGER IF EXISTS zzzzz_service_obligation_lock ON public.scope_change_requests;
CREATE TRIGGER zzzzz_service_obligation_lock BEFORE INSERT OR UPDATE OR DELETE ON public.scope_change_requests
  FOR EACH ROW EXECUTE FUNCTION public._service_obligation_lock_row();
DROP TRIGGER IF EXISTS zzzzz_service_obligation_lock ON public.project_scope_editions;
CREATE TRIGGER zzzzz_service_obligation_lock BEFORE INSERT OR UPDATE OR DELETE ON public.project_scope_editions
  FOR EACH ROW EXECUTE FUNCTION public._service_obligation_lock_row();
DROP TRIGGER IF EXISTS zzzzz_service_obligation_lock ON public.project_scope_edition_packages;
CREATE TRIGGER zzzzz_service_obligation_lock BEFORE INSERT OR UPDATE OR DELETE ON public.project_scope_edition_packages
  FOR EACH ROW EXECUTE FUNCTION public._service_obligation_lock_row();
DROP TRIGGER IF EXISTS zzzzz_service_obligation_lock ON public.project_scope_edition_phases;
CREATE TRIGGER zzzzz_service_obligation_lock BEFORE INSERT OR UPDATE OR DELETE ON public.project_scope_edition_phases
  FOR EACH ROW EXECUTE FUNCTION public._service_obligation_lock_row();
DROP TRIGGER IF EXISTS zzzzz_service_obligation_lock ON public.project_scope_edition_signers;
CREATE TRIGGER zzzzz_service_obligation_lock BEFORE INSERT OR UPDATE OR DELETE ON public.project_scope_edition_signers
  FOR EACH ROW EXECUTE FUNCTION public._service_obligation_lock_row();
DROP TRIGGER IF EXISTS zzzzz_service_obligation_lock ON public.service_acceptance_requests;
CREATE TRIGGER zzzzz_service_obligation_lock BEFORE INSERT OR UPDATE OR DELETE ON public.service_acceptance_requests
  FOR EACH ROW EXECUTE FUNCTION public._service_obligation_lock_row();
DROP TRIGGER IF EXISTS zzzzz_service_obligation_lock ON public.service_acceptance_signers;
CREATE TRIGGER zzzzz_service_obligation_lock BEFORE INSERT OR UPDATE OR DELETE ON public.service_acceptance_signers
  FOR EACH ROW EXECUTE FUNCTION public._service_obligation_lock_row();
DROP TRIGGER IF EXISTS zzzzz_service_obligation_lock ON public.service_acceptance_paper_intakes;
CREATE TRIGGER zzzzz_service_obligation_lock BEFORE INSERT OR UPDATE OR DELETE ON public.service_acceptance_paper_intakes
  FOR EACH ROW EXECUTE FUNCTION public._service_obligation_lock_row();
DROP TRIGGER IF EXISTS zzzzz_service_obligation_lock ON public.service_acceptance_responses;
CREATE TRIGGER zzzzz_service_obligation_lock BEFORE INSERT OR UPDATE OR DELETE ON public.service_acceptance_responses
  FOR EACH ROW EXECUTE FUNCTION public._service_obligation_lock_row();
DROP TRIGGER IF EXISTS zzzzz_service_obligation_lock ON public.service_acceptance_condition_resolutions;
CREATE TRIGGER zzzzz_service_obligation_lock BEFORE INSERT OR UPDATE OR DELETE ON public.service_acceptance_condition_resolutions
  FOR EACH ROW EXECUTE FUNCTION public._service_obligation_lock_row();
DROP TRIGGER IF EXISTS zzzzz_service_obligation_lock ON public.project_external_fulfilments;
CREATE TRIGGER zzzzz_service_obligation_lock BEFORE INSERT OR UPDATE OR DELETE ON public.project_external_fulfilments
  FOR EACH ROW EXECUTE FUNCTION public._service_obligation_lock_row();
DROP TRIGGER IF EXISTS zzzzz_service_obligation_lock ON public.project_external_fulfilment_events;
CREATE TRIGGER zzzzz_service_obligation_lock BEFORE INSERT OR UPDATE OR DELETE ON public.project_external_fulfilment_events
  FOR EACH ROW EXECUTE FUNCTION public._service_obligation_lock_row();
DROP TRIGGER IF EXISTS zzzzz_service_obligation_lock ON public.trade_scope_terms;
CREATE TRIGGER zzzzz_service_obligation_lock BEFORE INSERT OR UPDATE OR DELETE ON public.trade_scope_terms
  FOR EACH ROW EXECUTE FUNCTION public._service_obligation_lock_row();
DROP TRIGGER IF EXISTS zzzzz_service_obligation_lock ON public.install_punch_items;
CREATE TRIGGER zzzzz_service_obligation_lock BEFORE INSERT OR UPDATE OR DELETE ON public.install_punch_items
  FOR EACH ROW EXECUTE FUNCTION public._service_obligation_lock_row();

-- ---------------------------------------------------------------------------
-- §2.3 obligation derivation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._service_obligation_label(p_code text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE p_code
    WHEN 'scope_editions_inactive' THEN 'Scope editions are not switched on'
    WHEN 'scope_edition_not_active' THEN 'No active agreed scope'
    WHEN 'agreed_phase_unbound' THEN 'Agreed phase has no project phase'
    WHEN 'agreed_phase_open' THEN 'Agreed phase not completed'
    WHEN 'studio_line_open' THEN 'Studio item not installed'
    WHEN 'studio_installation_open' THEN 'Studio installation not complete'
    WHEN 'studio_design_unbound' THEN 'Studio design has no agreed phase'
    WHEN 'studio_installation_unbound' THEN 'Studio installation has nothing bound to it'
    WHEN 'ffe_unassigned_to_package' THEN 'Studio item not assigned to a package'
    WHEN 'package_key_not_in_edition' THEN 'Item or fulfilment outside the agreed scope'
    WHEN 'client_decision_unresolved' THEN 'Decision unresolved'
    WHEN 'scope_change_unresolved' THEN 'Scope change unresolved'
    WHEN 'acceptance_not_accepted' THEN 'Client acceptance not recorded'
    WHEN 'package_excluded' THEN 'Package outside the studio service'
    WHEN 'external_fulfilment_open' THEN 'External work in progress'
    WHEN 'trade_scope_open' THEN 'Trade scope not accepted'
    WHEN 'punch_item_open' THEN 'Open install punch item'
    ELSE p_code END;
$$;

-- Live line: 00835:1408-1413 (not removed, not not_selected/superseded), and
-- never a trade-scope line (trade acceptance is its own act, §2.1). A studio
-- line additionally has no external_fulfilment_id.
CREATE OR REPLACE FUNCTION public._service_obligation_items(p_project_id uuid, p_edition_id uuid)
RETURNS TABLE(kind text, code text, package_key text, n bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH pk AS (
    SELECT p.package_key, p.inclusion, p.responsibilities->>'design' AS design,
      p.responsibilities->>'purchasing' AS purchasing, p.responsibilities->>'installation' AS installation,
      p.design_owed_since, p.installation_owed_since
    FROM public.project_scope_edition_packages p WHERE p.edition_id = p_edition_id
  ), live AS (
    SELECT i.id, i.scope_package_key, i.status, i.external_fulfilment_id IS NULL AS studio
    FROM public.project_ffe_items i
    WHERE i.project_id = p_project_id AND i.removed_at IS NULL AND i.trade_scope_document_id IS NULL
      AND i.design_disposition IS DISTINCT FROM 'not_selected' AND i.design_disposition IS DISTINCT FROM 'superseded'
  ), ful AS (
    SELECT f.id, f.package_key, f.status,
      EXISTS (SELECT 1 FROM public.project_external_fulfilment_events e WHERE e.fulfilment_id = f.id
        AND e.event_kind = 'installed' AND e.evidence_level = 'verified') AS install_verified
    FROM public.project_external_fulfilments f WHERE f.project_id = p_project_id AND f.status <> 'cancelled'
  ), ph AS (
    SELECT ep.package_key, ep.service_slot, ep.bound_in_edition, pp.id IS NOT NULL AS bound, pp.status AS phase_status
    FROM public.project_scope_edition_phases ep
    LEFT JOIN public.project_phases pp ON pp.id = ep.project_phase_id AND pp.project_id = p_project_id
    WHERE ep.edition_id = p_edition_id
  ), items(kind, code, package_key, n) AS (
    SELECT 'blocker', 'agreed_phase_unbound', ph.package_key, count(*) FROM ph WHERE NOT ph.bound GROUP BY ph.package_key
    UNION ALL
    SELECT 'blocker', 'agreed_phase_open', ph.package_key, count(*) FROM ph
    WHERE ph.bound AND ph.phase_status IS DISTINCT FROM 'completed' GROUP BY ph.package_key
    UNION ALL
    SELECT 'blocker', 'studio_line_open', l.scope_package_key, count(*) FROM live l JOIN pk ON pk.package_key = l.scope_package_key
    WHERE l.studio AND pk.inclusion = 'included' AND pk.purchasing = 'studio' AND l.status IS DISTINCT FROM 'installed'
    GROUP BY l.scope_package_key
    UNION ALL
    SELECT 'blocker', 'studio_installation_open', x.package_key, sum(x.n)::bigint FROM (
      SELECT l.scope_package_key AS package_key, count(*) AS n FROM live l JOIN pk ON pk.package_key = l.scope_package_key
      WHERE pk.inclusion = 'included' AND pk.installation = 'studio' AND l.status IS DISTINCT FROM 'installed'
      GROUP BY l.scope_package_key
      UNION ALL
      SELECT f.package_key, count(*) FROM ful f JOIN pk ON pk.package_key = f.package_key
      WHERE pk.inclusion = 'included' AND pk.installation = 'studio' AND NOT f.install_verified
      GROUP BY f.package_key) x GROUP BY x.package_key
    UNION ALL
    SELECT 'blocker', 'studio_design_unbound', pk.package_key, 1 FROM pk
    WHERE pk.inclusion = 'included' AND pk.design = 'studio'
      AND NOT EXISTS (SELECT 1 FROM ph WHERE ph.package_key = pk.package_key AND ph.service_slot = 'design'
        AND ph.bound_in_edition >= pk.design_owed_since)
    UNION ALL
    SELECT 'blocker', 'studio_installation_unbound', pk.package_key, 1 FROM pk
    WHERE pk.inclusion = 'included' AND pk.installation = 'studio'
      AND NOT EXISTS (SELECT 1 FROM live l WHERE l.scope_package_key = pk.package_key)
      AND NOT EXISTS (SELECT 1 FROM ful f WHERE f.package_key = pk.package_key)
      AND NOT EXISTS (SELECT 1 FROM ph WHERE ph.package_key = pk.package_key AND ph.service_slot = 'installation'
        AND ph.bound_in_edition >= pk.installation_owed_since)
    UNION ALL
    SELECT 'blocker', 'ffe_unassigned_to_package', NULL, count(*) FROM live l
    WHERE l.studio AND l.scope_package_key IS NULL HAVING count(*) > 0
    UNION ALL
    SELECT 'blocker', 'package_key_not_in_edition', x.package_key, sum(x.n)::bigint FROM (
      SELECT l.scope_package_key AS package_key, count(*) AS n FROM live l
      WHERE l.scope_package_key IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pk WHERE pk.package_key = l.scope_package_key)
      GROUP BY l.scope_package_key
      UNION ALL
      SELECT f.package_key, count(*) FROM ful f WHERE NOT EXISTS (SELECT 1 FROM pk WHERE pk.package_key = f.package_key)
      GROUP BY f.package_key) x
    WHERE p_edition_id IS NOT NULL GROUP BY x.package_key
    UNION ALL
    SELECT 'blocker', 'client_decision_unresolved', NULL, count(*) FROM public.client_decisions d
    WHERE d.project_id = p_project_id AND d.status IS DISTINCT FROM 'responded' AND d.status IS DISTINCT FROM 'expired'
    HAVING count(*) > 0
    UNION ALL
    SELECT 'blocker', 'scope_change_unresolved', NULL, count(*) FROM public.scope_change_requests s
    WHERE s.project_id = p_project_id AND s.applied_at IS NULL AND s.status IS DISTINCT FROM 'declined'
      AND s.status IS DISTINCT FROM 'cancelled'
    HAVING count(*) > 0
    UNION ALL
    SELECT 'info', 'package_excluded', pk.package_key,
      (SELECT count(*) FROM live l WHERE l.scope_package_key = pk.package_key)
      + (SELECT count(*) FROM ful f WHERE f.package_key = pk.package_key)
    FROM pk WHERE pk.inclusion <> 'included'
    UNION ALL
    SELECT 'info', 'external_fulfilment_open', f.package_key, count(*) FROM ful f JOIN pk ON pk.package_key = f.package_key
    WHERE f.status <> 'installed' AND NOT (pk.inclusion = 'included' AND pk.installation = 'studio')
    GROUP BY f.package_key
    UNION ALL
    SELECT 'info', 'trade_scope_open', NULL, count(*) FROM public.trade_scope_terms t
    JOIN public.proposals pr ON pr.id = t.proposal_id
    WHERE pr.project_id = p_project_id AND t.progress_state <> 'accepted' HAVING count(*) > 0
    UNION ALL
    SELECT 'info', 'punch_item_open', NULL, count(*) FROM public.install_punch_items u
    WHERE u.project_id = p_project_id AND u.resolved_at IS NULL HAVING count(*) > 0
  )
  SELECT kind, code, package_key, n FROM items;
$$;

-- Open conditions of a request: the conditionIds on counted responses (active
-- required signers, accept_with_conditions) with no resolution row.
CREATE OR REPLACE FUNCTION public._service_acceptance_open_conditions(p_request_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('conditionId', c->>'conditionId', 'text', c->>'text',
      'responseId', x.id, 'signerId', s.id) ORDER BY c->>'conditionId'), '[]'::jsonb)
  FROM public.service_acceptance_responses x
  JOIN public.service_acceptance_signers s ON s.id = x.signer_id AND s.status = 'active' AND s.required
  CROSS JOIN LATERAL jsonb_array_elements(x.conditions) c
  WHERE x.request_id = p_request_id AND x.response = 'accept_with_conditions'
    AND NOT EXISTS (SELECT 1 FROM public.service_acceptance_condition_resolutions r
      WHERE r.request_id = p_request_id AND r.condition_id = (c->>'conditionId')::uuid);
$$;

-- Same invoice-truth arithmetic as close_project (00399:7534-7591). Display only.
CREATE OR REPLACE FUNCTION public._service_completion_financial_hold(p_project_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH invoice_truth AS (
    SELECT invoice.id, invoice.status, invoice.amount_paid_cents::bigint AS amount_paid_cents,
      CASE WHEN count(line.id) > 0 THEN
          COALESCE(sum(line.amount_cents), 0) + round(COALESCE(sum(line.amount_cents), 0) * invoice.tax_rate)::bigint
        ELSE invoice.total_cents::bigint END AS canonical_total_cents
    FROM public.invoices AS invoice
    LEFT JOIN public.invoice_line_items AS line ON line.invoice_id = invoice.id
    WHERE invoice.project_id = p_project_id
    GROUP BY invoice.id
  ), live AS (SELECT * FROM invoice_truth WHERE status <> 'void')
  SELECT jsonb_build_object(
    'openInvoiceCount', (SELECT count(*) FROM live WHERE canonical_total_cents > amount_paid_cents),
    'balanceCents', (SELECT COALESCE(sum(canonical_total_cents - amount_paid_cents), 0) FROM live
      WHERE canonical_total_cents > amount_paid_cents),
    'uncollectedContractCents', GREATEST(0, COALESCE((SELECT total_amount_cents FROM public.projects WHERE id = p_project_id), 0)
      - (SELECT COALESCE(sum(LEAST(canonical_total_cents, amount_paid_cents)), 0) FROM live)));
$$;

-- Deterministic for the same rows: the hashed snapshot holds the edition, the
-- sorted blockers and informational items, the open conditions and the
-- acceptance; financialHold is beside it, never inside it (R20).
CREATE OR REPLACE FUNCTION public._derive_studio_service_obligations(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_enabled boolean := COALESCE((SELECT enabled FROM public.server_capabilities WHERE key = 'scope_editions'), false);
  v_edition uuid; v_request public.service_acceptance_requests%ROWTYPE; v_blockers jsonb; v_info jsonb;
  v_conditions jsonb := '[]'::jsonb; v_acceptance jsonb; v_snapshot jsonb;
BEGIN
  SELECT id INTO v_edition FROM public.project_scope_editions WHERE project_id = p_project_id AND status = 'active';
  IF v_edition IS NOT NULL THEN
    SELECT * INTO v_request FROM public.service_acceptance_requests
    WHERE project_id = p_project_id AND scope_edition_id = v_edition AND lifecycle IN ('draft','sent','closed')
    ORDER BY request_number DESC LIMIT 1;
  END IF;
  IF v_request.id IS NOT NULL THEN
    v_conditions := public._service_acceptance_open_conditions(v_request.id);
  END IF;
  v_acceptance := jsonb_build_object('requestId', v_request.id, 'outcome', v_request.aggregate_outcome,
    'pendingRequiredSigners', CASE WHEN v_request.id IS NULL THEN '[]'::jsonb
      ELSE public._service_acceptance_pending_required(v_request.id) END);
  WITH rows AS (
    SELECT i.kind, i.code, i.package_key, i.n FROM public._service_obligation_items(p_project_id, v_edition) i
    UNION ALL SELECT 'blocker', 'scope_editions_inactive', NULL, 1 WHERE NOT v_enabled
    UNION ALL SELECT 'blocker', 'scope_edition_not_active', NULL, 1 WHERE v_edition IS NULL
    UNION ALL SELECT 'blocker', 'acceptance_not_accepted', NULL, 1
      WHERE v_request.aggregate_outcome IS NULL OR v_request.lifecycle <> 'closed'
        OR v_request.aggregate_outcome NOT IN ('accepted','accepted_with_conditions')
  )
  SELECT COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('code', code, 'count', n, 'packageKey', package_key,
      'label', public._service_obligation_label(code))) ORDER BY code, package_key NULLS FIRST)
      FILTER (WHERE kind = 'blocker'), '[]'::jsonb),
    COALESCE(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('code', code, 'count', n, 'packageKey', package_key,
      'label', public._service_obligation_label(code))) ORDER BY code, package_key NULLS FIRST)
      FILTER (WHERE kind = 'info'), '[]'::jsonb)
    INTO v_blockers, v_info
  FROM rows;
  v_snapshot := jsonb_build_object('scopeEditionId', v_edition, 'blockers', v_blockers, 'informational', v_info,
    'conditions', v_conditions, 'acceptance', v_acceptance);
  RETURN jsonb_build_object('projectId', p_project_id, 'capability', CASE WHEN v_enabled THEN 'active' ELSE 'inactive' END,
      'snapshot', v_snapshot, 'obligationHash', public._service_acceptance_hash(v_snapshot),
      'financialHold', public._service_completion_financial_hold(p_project_id))
    || (v_snapshot - 'acceptance' - 'conditions')
    || jsonb_build_object('conditions', v_conditions, 'acceptance', v_acceptance);
END;
$$;

-- Designer of record (close_project's identity rule, 00399:7353) or a studio
-- owner/admin of the recorded studio.
CREATE OR REPLACE FUNCTION public._can_complete_studio_service(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.projects p WHERE p.id = p_project_id AND p.designer_id = auth.uid())
    OR public._is_service_acceptance_studio_admin(p_project_id));
$$;

CREATE OR REPLACE FUNCTION public._service_completion_receipt(p_completion_id uuid, p_replayed boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT jsonb_build_object('completionId', c.id, 'state', c.state,
    'conditionsOpen', (SELECT count(*) FROM unnest(c.open_condition_ids) o
      WHERE NOT EXISTS (SELECT 1 FROM public.service_acceptance_condition_resolutions r
        WHERE r.request_id = c.acceptance_request_id AND r.condition_id = o)),
    'replayed', p_replayed)
  FROM public.studio_service_completions c WHERE c.id = p_completion_id;
$$;

-- Steps 1-4 of the §2.5 order for an existing request (the edition is the
-- request's own, which completion and resolution then require to be active).
-- Resolvers and revokers take the request FOR NO KEY UPDATE, so they queue
-- behind a completion that holds it FOR SHARE and then lock its committed row.
CREATE OR REPLACE FUNCTION public._lock_service_completion_scope(p_request_id uuid)
RETURNS public.service_acceptance_requests LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_project uuid; v_edition uuid; v_request public.service_acceptance_requests%ROWTYPE;
BEGIN
  SELECT project_id, scope_edition_id INTO v_project, v_edition
  FROM public.service_acceptance_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM 1 FROM public.projects WHERE id = v_project FOR KEY SHARE;
  PERFORM 1 FROM public.project_scope_editions WHERE id = v_edition FOR SHARE;
  SELECT * INTO STRICT v_request FROM public.service_acceptance_requests WHERE id = p_request_id FOR NO KEY UPDATE;
  PERFORM 1 FROM public.studio_service_completions
  WHERE project_id = v_project AND scope_edition_id = v_edition AND revoked_at IS NULL ORDER BY id FOR UPDATE;
  RETURN v_request;
END;
$$;

CREATE OR REPLACE FUNCTION public._assert_service_completion_read_committed()
RETURNS void LANGUAGE plpgsql STABLE SET search_path = public, pg_temp AS $$
BEGIN
  -- Step 6 must read a snapshot taken after the exclusive key was granted.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION 'service_completion_requires_read_committed' USING ERRCODE = 'serialization_failure';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- RPCs (§2.4)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.derive_studio_service_obligations(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id)
     OR NOT public.can_compose_project_plan(p_project_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public._derive_studio_service_obligations(p_project_id) - 'snapshot';
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_studio_service(
  p_project_id uuid, p_acceptance_request_id uuid, p_obligation_hash text, p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid(); v_key text; v_hash text; v_existing public.studio_service_completions%ROWTYPE;
  v_edition uuid; v_request public.service_acceptance_requests%ROWTYPE; v_derived jsonb; v_open uuid[];
  v_id uuid := extensions.gen_random_uuid();
  previous_marker text := current_setting('app.service_completion_id', true);
BEGIN
  PERFORM public._assert_scope_composition_enabled();
  PERFORM public._assert_service_completion_read_committed();
  v_key := public._service_acceptance_key(p_client_request_id);
  -- 1. projects FOR KEY SHARE: excludes close_project and the C2/C4/C5 FOR UPDATE paths.
  PERFORM 1 FROM public.projects WHERE id = p_project_id FOR KEY SHARE;
  IF NOT FOUND OR NOT public._can_complete_studio_service(p_project_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_hash := public._service_acceptance_hash(jsonb_build_object('projectId', p_project_id,
    'acceptanceRequestId', p_acceptance_request_id, 'obligationHash', p_obligation_hash));
  SELECT * INTO v_existing FROM public.studio_service_completions
  WHERE project_id = p_project_id AND client_request_id = v_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.completed_by <> v_uid OR v_existing.request_hash <> v_hash THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = 'unique_violation';
    END IF;
    RETURN public._service_completion_receipt(v_existing.id, true);
  END IF;
  -- 2. The active edition FOR SHARE.
  SELECT id INTO v_edition FROM public.project_scope_editions
  WHERE project_id = p_project_id AND status = 'active' FOR SHARE;
  -- 3. The acceptance request FOR SHARE.
  SELECT * INTO v_request FROM public.service_acceptance_requests
  WHERE id = p_acceptance_request_id AND project_id = p_project_id FOR SHARE;
  IF v_request.id IS NULL THEN
    RAISE EXCEPTION 'acceptance_request_unknown' USING ERRCODE = 'check_violation';
  END IF;
  IF v_edition IS NULL OR v_request.scope_edition_id <> v_edition THEN
    RAISE EXCEPTION 'scope_edition_not_active' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  -- 4. Live completions of this edition FOR UPDATE.
  PERFORM 1 FROM public.studio_service_completions
  WHERE project_id = p_project_id AND scope_edition_id = v_edition AND revoked_at IS NULL ORDER BY id FOR UPDATE;
  -- 5. The service-obligation key, exclusive, last.
  PERFORM pg_advisory_xact_lock(public._service_obligation_key(p_project_id));
  -- 6. Later statements: a READ COMMITTED snapshot taken after step 5. A racing
  -- call with this key may have committed while this one waited: replay it.
  SELECT * INTO v_existing FROM public.studio_service_completions
  WHERE project_id = p_project_id AND client_request_id = v_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.completed_by <> v_uid OR v_existing.request_hash <> v_hash THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = 'unique_violation';
    END IF;
    RETURN public._service_completion_receipt(v_existing.id, true);
  END IF;
  IF EXISTS (SELECT 1 FROM public.studio_service_completions
      WHERE project_id = p_project_id AND scope_edition_id = v_edition AND revoked_at IS NULL) THEN
    RAISE EXCEPTION 'service_already_completed' USING ERRCODE = 'unique_violation';
  END IF;
  v_derived := public._derive_studio_service_obligations(p_project_id);
  IF jsonb_array_length(v_derived->'blockers') > 0 THEN
    RAISE EXCEPTION 'service_obligations_open: %',
      (SELECT string_agg(b->>'code' || COALESCE(':' || (b->>'packageKey'), ''), ',')
       FROM jsonb_array_elements(v_derived->'blockers') b)
      USING ERRCODE = 'check_violation';
  END IF;
  IF (v_derived->'acceptance'->>'requestId') IS DISTINCT FROM p_acceptance_request_id::text THEN
    RAISE EXCEPTION 'acceptance_request_not_current' USING ERRCODE = 'check_violation';
  END IF;
  IF p_obligation_hash IS DISTINCT FROM v_derived->>'obligationHash' THEN
    RAISE EXCEPTION 'stale_obligations' USING ERRCODE = 'serialization_failure';
  END IF;
  SELECT COALESCE(array_agg((c->>'conditionId')::uuid ORDER BY c->>'conditionId'), '{}')
    INTO v_open FROM jsonb_array_elements(v_derived->'conditions') c;
  PERFORM set_config('app.service_completion_id', v_id::text, true);
  INSERT INTO public.studio_service_completions(id, project_id, scope_edition_id, acceptance_request_id, state,
    obligation_snapshot, obligation_hash, open_condition_ids, financial_hold, completed_by, client_request_id, request_hash)
  VALUES (v_id, p_project_id, v_edition, v_request.id,
    CASE WHEN cardinality(v_open) > 0 THEN 'completed_with_conditions' ELSE 'completed' END,
    v_derived->'snapshot', v_derived->>'obligationHash', v_open, v_derived->'financialHold', v_uid, v_key, v_hash);
  PERFORM set_config('app.service_completion_id', COALESCE(previous_marker, ''), true);
  RETURN public._service_completion_receipt(v_id, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_service_acceptance_condition(
  p_request_id uuid, p_condition_id uuid, p_resolution text, p_evidence jsonb, p_client_request_id text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid(); v_key text; v_hash text; v_request public.service_acceptance_requests%ROWTYPE;
  v_existing public.service_acceptance_condition_resolutions%ROWTYPE; v_condition jsonb;
  v_completion public.studio_service_completions%ROWTYPE; v_id uuid := extensions.gen_random_uuid();
  previous_resolution text := current_setting('app.service_condition_resolution_id', true);
  previous_completion text := current_setting('app.service_completion_id', true);
BEGIN
  PERFORM public._assert_scope_composition_enabled();
  PERFORM public._assert_service_completion_read_committed();
  v_key := public._service_acceptance_key(p_client_request_id);
  v_request := public._lock_service_completion_scope(p_request_id);
  IF NOT public._can_complete_studio_service(v_request.project_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM pg_advisory_xact_lock(public._service_obligation_key(v_request.project_id));
  v_hash := public._service_acceptance_hash(jsonb_build_object('requestId', p_request_id,
    'conditionId', p_condition_id, 'resolution', p_resolution, 'evidence', p_evidence));
  SELECT * INTO v_existing FROM public.service_acceptance_condition_resolutions
  WHERE request_id = p_request_id AND client_request_id = v_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.resolved_by <> v_uid OR v_existing.request_hash <> v_hash THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = 'unique_violation';
    END IF;
    RETURN jsonb_build_object('resolutionId', v_existing.id, 'requestId', p_request_id,
      'conditionId', v_existing.condition_id, 'replayed', true);
  END IF;
  IF (SELECT status FROM public.project_scope_editions WHERE id = v_request.scope_edition_id) IS DISTINCT FROM 'active' THEN
    RAISE EXCEPTION 'scope_edition_not_active' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF EXISTS (SELECT 1 FROM public.service_acceptance_condition_resolutions
      WHERE request_id = p_request_id AND condition_id = p_condition_id) THEN
    RAISE EXCEPTION 'service_acceptance_condition_resolved' USING ERRCODE = 'unique_violation';
  END IF;
  SELECT c INTO v_condition FROM jsonb_array_elements(public._service_acceptance_open_conditions(p_request_id)) c
  WHERE c->>'conditionId' = p_condition_id::text;
  IF v_condition IS NULL THEN
    RAISE EXCEPTION 'service_acceptance_condition_unknown' USING ERRCODE = 'check_violation';
  END IF;
  -- Evidence names an issue, a storage object or a site request (§2.2).
  IF btrim(COALESCE(p_resolution, '')) = '' OR length(p_resolution) > 2000
     OR jsonb_typeof(p_evidence) IS DISTINCT FROM 'object' OR p_evidence = '{}'::jsonb
     OR (p_evidence - ARRAY['issueId','storageObjectId','siteRequestId']) <> '{}'::jsonb
     OR EXISTS (SELECT 1 FROM jsonb_each(p_evidence) e WHERE jsonb_typeof(e.value) <> 'string'
       OR e.value #>> '{}' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') THEN
    RAISE EXCEPTION 'service_acceptance_resolution_invalid' USING ERRCODE = 'check_violation';
  END IF;
  -- Each reference must exist on this project: a plan issue, a site request, or a
  -- storage object whose path names the project (directly or by a site request).
  -- This function reads as its definer, so each kind also restates the SELECT
  -- policy that lets the actor read that row or object; a reference the actor
  -- cannot read refuses the same way as one that does not exist.
  IF EXISTS (SELECT 1 FROM jsonb_each_text(p_evidence) e WHERE NOT CASE e.key
      -- plan_issues_studio_rw (00429_plan_room_foundation.sql).
      WHEN 'issueId' THEN EXISTS (SELECT 1 FROM public.plan_issues i JOIN public.projects p ON p.id = i.project_id
        WHERE i.id = e.value::uuid AND i.project_id = v_request.project_id
          AND public.is_design_studio_comember(p.designer_id))
      -- site_requests_designer_read (00471_site_request_authority_action_detail.sql).
      WHEN 'siteRequestId' THEN EXISTS (SELECT 1 FROM public.site_requests s JOIN public.projects p ON p.id = s.project_id
        WHERE s.id = e.value::uuid AND s.project_id = v_request.project_id
          AND public.is_design_studio_comember(p.designer_id))
      ELSE EXISTS (SELECT 1 FROM storage.objects o JOIN public.projects p ON p.id = v_request.project_id
        WHERE o.id = e.value::uuid AND CASE o.bucket_id
        -- service_acceptance_paper_read and its restrictive read boundary (00886).
        WHEN 'service-acceptance-paper' THEN (storage.foldername(o.name))[1] = p.id::text
          AND public._can_access_service_acceptance_paper_object(o.name)
        -- "Project members can read documents" (00584_studio_comember_rls_sweep.sql).
        WHEN 'project-documents' THEN (storage.foldername(o.name))[1] = p.id::text
          AND (p.designer_id = auth.uid() OR public.is_studio_comember(p.designer_id)
            OR public.is_project_team_member(p.id)
            OR (p.client_id = auth.uid() AND EXISTS (SELECT 1 FROM public.project_documents pd
              WHERE pd.project_id = p.id AND pd.storage_path = o.name AND pd.client_visible = true)))
        -- project_ffe_working_studio_select (00433_ffe_safe_reader_media_compatibility.sql).
        WHEN 'project-ffe-working' THEN (storage.foldername(o.name))[1] = p.id::text
          AND public.is_studio_comember(p.designer_id)
        -- "Field team can read field media" (00584_studio_comember_rls_sweep.sql).
        WHEN 'field-media' THEN (storage.foldername(o.name))[1:2] = ARRAY['project', p.id::text]
          AND (public.is_project_team_member(p.id) OR public.is_studio_comember(p.designer_id))
        -- "Site request designers read immutable media" (00374_field_site_request_loop.sql).
        -- Its site_requests join reads through site_requests_designer_read (00471).
        WHEN 'site-requests' THEN EXISTS (SELECT 1 FROM public.site_requests s
          WHERE s.project_id = p.id AND s.id::text = (storage.foldername(o.name))[1])
          AND public.is_studio_comember(p.designer_id) AND public.is_design_studio_comember(p.designer_id)
        ELSE false END)
      END) THEN
    RAISE EXCEPTION 'service_acceptance_evidence_unbound' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('app.service_condition_resolution_id', v_id::text, true);
  INSERT INTO public.service_acceptance_condition_resolutions(id, request_id, condition_id, response_id, resolution,
    evidence, resolved_by, client_request_id, request_hash)
  VALUES (v_id, p_request_id, p_condition_id, (v_condition->>'responseId')::uuid, btrim(p_resolution), p_evidence,
    v_uid, v_key, v_hash);
  PERFORM set_config('app.service_condition_resolution_id', COALESCE(previous_resolution, ''), true);
  -- K3 Option A: the last open condition moves its completion to 'completed'.
  SELECT * INTO v_completion FROM public.studio_service_completions c
  WHERE c.acceptance_request_id = p_request_id AND c.revoked_at IS NULL AND c.state = 'completed_with_conditions'
    AND NOT EXISTS (SELECT 1 FROM unnest(c.open_condition_ids) o WHERE NOT EXISTS (
      SELECT 1 FROM public.service_acceptance_condition_resolutions r WHERE r.request_id = p_request_id AND r.condition_id = o));
  IF v_completion.id IS NOT NULL THEN
    PERFORM set_config('app.service_completion_id', v_completion.id::text, true);
    UPDATE public.studio_service_completions SET state = 'completed', conditions_closed_at = clock_timestamp()
    WHERE id = v_completion.id RETURNING * INTO v_completion;
    PERFORM set_config('app.service_completion_id', COALESCE(previous_completion, ''), true);
  ELSE
    SELECT * INTO v_completion FROM public.studio_service_completions
    WHERE acceptance_request_id = p_request_id AND revoked_at IS NULL;
  END IF;
  RETURN jsonb_build_object('resolutionId', v_id, 'requestId', p_request_id, 'conditionId', p_condition_id,
    'completionId', v_completion.id, 'completionState', v_completion.state, 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_studio_service_completion(p_completion_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_uid uuid := auth.uid(); v_request_id uuid; v_completion public.studio_service_completions%ROWTYPE;
  previous_marker text := current_setting('app.service_completion_id', true);
BEGIN
  PERFORM public._assert_scope_composition_enabled();
  SELECT acceptance_request_id INTO v_request_id FROM public.studio_service_completions WHERE id = p_completion_id;
  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  PERFORM public._lock_service_completion_scope(v_request_id);
  SELECT * INTO STRICT v_completion FROM public.studio_service_completions WHERE id = p_completion_id FOR UPDATE;
  IF NOT public._is_service_acceptance_studio_admin(v_completion.project_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_completion.revoked_at IS NOT NULL THEN
    IF v_completion.revoked_by = v_uid AND v_completion.revoke_reason = btrim(COALESCE(p_reason, '')) THEN
      RETURN jsonb_build_object('completionId', v_completion.id, 'revokedAt', v_completion.revoked_at, 'replayed', true);
    END IF;
    RAISE EXCEPTION 'service_completion_revoked' USING ERRCODE = 'object_not_in_prerequisite_state';
  END IF;
  IF btrim(COALESCE(p_reason, '')) = '' OR length(p_reason) > 2000 THEN
    RAISE EXCEPTION 'service_completion_revoke_invalid' USING ERRCODE = 'check_violation';
  END IF;
  PERFORM set_config('app.service_completion_id', v_completion.id::text, true);
  UPDATE public.studio_service_completions SET revoked_at = clock_timestamp(), revoked_by = v_uid,
    revoke_reason = btrim(p_reason)
  WHERE id = v_completion.id RETURNING * INTO v_completion;
  PERFORM set_config('app.service_completion_id', COALESCE(previous_marker, ''), true);
  RETURN jsonb_build_object('completionId', v_completion.id, 'revokedAt', v_completion.revoked_at, 'replayed', false);
END;
$$;

-- Studio (can_compose_project_plan, as C4) sees every completion with its
-- snapshot, hold and resolutions. The project's client, or an active signer of
-- the accepted request, sees live completions only: state, dates and the
-- accepted scope reference, never the hold or the obligation detail.
CREATE OR REPLACE FUNCTION public.get_studio_service_completion(p_project_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_uid uuid := auth.uid(); v_studio boolean;
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_studio := public.can_compose_project_plan(p_project_id);
  IF v_studio THEN
    RETURN jsonb_build_object('projectId', p_project_id, 'audience', 'studio',
      'capability', CASE WHEN COALESCE((SELECT enabled FROM public.server_capabilities WHERE key = 'scope_editions'), false)
        THEN 'active' ELSE 'inactive' END,
      'completions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
          'completionId', c.id, 'scopeEditionId', c.scope_edition_id, 'acceptanceRequestId', c.acceptance_request_id,
          'state', c.state, 'openConditionIds', to_jsonb(c.open_condition_ids), 'obligationSnapshot', c.obligation_snapshot,
          'obligationHash', c.obligation_hash, 'financialHold', c.financial_hold, 'completedBy', c.completed_by,
          'completedAt', c.completed_at, 'conditionsClosedAt', c.conditions_closed_at, 'revokedAt', c.revoked_at,
          'revokedBy', c.revoked_by, 'revokeReason', c.revoke_reason) ORDER BY c.completed_at DESC, c.id)
        FROM public.studio_service_completions c WHERE c.project_id = p_project_id), '[]'::jsonb),
      'resolutions', COALESCE((SELECT jsonb_agg(jsonb_build_object('resolutionId', r.id, 'requestId', r.request_id,
          'conditionId', r.condition_id, 'responseId', r.response_id, 'resolution', r.resolution, 'evidence', r.evidence,
          'resolvedBy', r.resolved_by, 'resolvedAt', r.resolved_at) ORDER BY r.resolved_at, r.id)
        FROM public.service_acceptance_condition_resolutions r
        JOIN public.service_acceptance_requests q ON q.id = r.request_id WHERE q.project_id = p_project_id), '[]'::jsonb));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.projects WHERE id = p_project_id AND client_id = v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.service_acceptance_signers s
       JOIN public.service_acceptance_requests q ON q.id = s.request_id
       WHERE q.project_id = p_project_id AND q.sent_at IS NOT NULL AND s.status = 'active' AND s.profile_id = v_uid) THEN
    RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN jsonb_build_object('projectId', p_project_id, 'audience', 'client',
    'completions', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'completionId', c.id, 'state', c.state, 'completedAt', c.completed_at,
        'conditionsClosedAt', c.conditions_closed_at, 'scopeEditionId', c.scope_edition_id,
        'scopeContentHash', q.scope_content_hash, 'acceptanceRequestId', c.acceptance_request_id,
        'requestNumber', q.request_number) ORDER BY c.completed_at DESC, c.id)
      FROM public.studio_service_completions c JOIN public.service_acceptance_requests q ON q.id = c.acceptance_request_id
      WHERE c.project_id = p_project_id AND c.revoked_at IS NULL), '[]'::jsonb));
END;
$$;

-- ---------------------------------------------------------------------------
-- ACLs (§2.7). Inactive: no mutation or helper is executable by PUBLIC, anon,
-- authenticated or service_role. Only the two reads reach authenticated.
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public._guard_studio_service_completion() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._guard_service_acceptance_condition_resolution() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_obligation_key(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_obligation_write_lock(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_obligation_lock_row() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_obligation_label(text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_obligation_items(uuid,uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_acceptance_open_conditions(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_completion_financial_hold(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._derive_studio_service_obligations(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._can_complete_studio_service(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._service_completion_receipt(uuid,boolean) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._lock_service_completion_scope(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._assert_service_completion_read_committed() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_studio_service(uuid,uuid,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.resolve_service_acceptance_condition(uuid,uuid,text,jsonb,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.revoke_studio_service_completion(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.derive_studio_service_obligations(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_studio_service_completion(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.derive_studio_service_obligations(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_studio_service_completion(uuid) TO authenticated;
