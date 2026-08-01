-- ═══════════════════════════════════════════════════════════════════════════
-- 00399 — End-to-end journey authority and terminal integrity
--
-- The client-journey adversarial pass found eight places where row visibility
-- (RLS) was being mistaken for authority over irreversible business truth.
-- This migration makes those writes capability-owned and row-locked:
--   • activated project identity cannot diverge from its proposal relationship;
--   • completed/archived projects cannot be reopened by direct UPDATE;
--   • Brief → Discovery accepts only an exact active design-studio peer;
--   • decision identity, business payload, options, and lifecycle move through
--     checked RPCs rather than broad authenticated UPDATE/DELETE grants;
--   • proposal feedback/nudge metadata require their exact canonical acts;
--   • signatures bind the exact proposal.designer_client_id relationship;
--   • closeout sums paid split invoice lines for each FF&E item.
--
-- Whole-body lineage for redefined functions:
--   begin_discovery:          00386 → 00399
--   apply_decision:           00085 → 00175 → 00185 → 00399
--   resolve_coordination_item:00218 → 00399
--   submit_coordination_revision: 00218 → 00399
--   sign_proposal:            00210 → 00387 → 00390 → 00399
--   record_offline_signature: 00254 → 00387 → 00399
--   close_project:            00238 → 00383 → 00387 → 00394 → 00399
--   nudge_proposal:           00231 → 00399
--   request_proposal_change:  00210 → 00399
--
-- app.client_decision_write_id / app.client_decision_insert_id and the
-- proposal metadata GUCs are transaction-local and row-scoped. An API caller
-- may set an arbitrary custom GUC, but cannot also become postgres, which is
-- the independent fact required by the SECURITY INVOKER table guards.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Project terminal + activated-identity boundary ─────────────────────────

CREATE OR REPLACE FUNCTION public.guard_project_terminal_identity_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.status IN ('completed', 'archived')
     AND NEW.status IS DISTINCT FROM OLD.status
  THEN
    RAISE EXCEPTION 'terminal project status is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.client_id IS DISTINCT FROM OLD.client_id
     AND NEW.proposal_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.proposals AS proposal
       JOIN public.designer_clients AS relationship
         ON relationship.id = proposal.designer_client_id
       WHERE proposal.id = NEW.proposal_id
         AND proposal.designer_id IS NOT DISTINCT FROM NEW.designer_id
         AND proposal.client_id IS NOT DISTINCT FROM NEW.client_id
         AND relationship.designer_id IS NOT DISTINCT FROM proposal.designer_id
         AND relationship.client_id IS NOT DISTINCT FROM proposal.client_id
     )
  THEN
    RAISE EXCEPTION
      'activated project client must match its proposal relationship'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_project_terminal_identity_integrity()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_project_terminal_identity_integrity_trg
  ON public.projects;
CREATE TRIGGER guard_project_terminal_identity_integrity_trg
BEFORE UPDATE OF status, client_id, proposal_id ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.guard_project_terminal_identity_integrity();

COMMENT ON FUNCTION public.guard_project_terminal_identity_integrity() IS
  'Independent project table boundary: completed/archived states cannot exit, '
  'and an activated project client change must retain the exact linked '
  'proposal client_id/designer_client_id relationship.';

-- ── Brief → Discovery exact design-studio authority ────────────────────────

CREATE OR REPLACE FUNCTION public.begin_discovery(p_lead_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_lead public.leads%ROWTYPE;
  v_relationship public.designer_clients%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'begin_discovery requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_lead
  FROM public.leads
  WHERE id = p_lead_id
  FOR UPDATE;

  -- _can_author_proposal is the canonical exact-author helper: owner, or two
  -- active non-guest memberships in the same active design_studio. The older
  -- is_studio_comember helper intentionally includes other organization types.
  IF NOT FOUND OR NOT public._can_author_proposal(v_lead.designer_id) THEN
    RAISE EXCEPTION 'lead % not found or access denied', p_lead_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_lead.status NOT IN ('new', 'viewed', 'contacted', 'accepted') THEN
    RAISE EXCEPTION 'lead % cannot begin discovery from status %',
      p_lead_id, v_lead.status
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.leads
  SET status = 'accepted',
      accepted_at = COALESCE(accepted_at, now()),
      updated_at = now()
  WHERE id = p_lead_id
  RETURNING * INTO v_lead;

  IF v_lead.homeowner_id IS NOT NULL THEN
    SELECT * INTO v_relationship
    FROM public.designer_clients
    WHERE designer_id = v_lead.designer_id
      AND lead_id = p_lead_id
      AND status = 'lead'
    ORDER BY created_at, id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND THEN
      SELECT * INTO v_relationship
      FROM public.designer_clients
      WHERE designer_id = v_lead.designer_id
        AND client_id = v_lead.homeowner_id
        AND status = 'lead'
        AND lead_id IS NULL
      ORDER BY created_at, id
      LIMIT 1
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.designer_clients
        SET source = 'lead',
            lead_id = p_lead_id,
            updated_at = now()
        WHERE id = v_relationship.id
        RETURNING * INTO v_relationship;
      ELSE
        INSERT INTO public.designer_clients (
          designer_id, client_id, source, lead_id, status
        ) VALUES (
          v_lead.designer_id, v_lead.homeowner_id, 'lead', p_lead_id, 'lead'
        )
        RETURNING * INTO v_relationship;
      END IF;
    END IF;
  ELSE
    SELECT * INTO v_relationship
    FROM public.designer_clients
    WHERE designer_id = v_lead.designer_id
      AND lead_id = p_lead_id
    ORDER BY created_at, id
    LIMIT 1
    FOR UPDATE;

    IF NOT FOUND AND v_lead.contact_email IS NOT NULL THEN
      SELECT * INTO v_relationship
      FROM public.designer_clients
      WHERE designer_id = v_lead.designer_id
        AND client_email = v_lead.contact_email
        AND client_id IS NULL
      ORDER BY created_at, id
      LIMIT 1
      FOR UPDATE;
    END IF;

    IF FOUND THEN
      UPDATE public.designer_clients
      SET client_id = NULL,
          client_name = v_lead.contact_name,
          client_email = v_lead.contact_email,
          source = 'lead',
          lead_id = p_lead_id,
          status = 'lead',
          updated_at = now()
      WHERE id = v_relationship.id
      RETURNING * INTO v_relationship;
    ELSIF v_lead.contact_email IS NOT NULL THEN
      INSERT INTO public.designer_clients (
        designer_id, client_id, client_name, client_email, source, lead_id, status
      ) VALUES (
        v_lead.designer_id, NULL, v_lead.contact_name, v_lead.contact_email,
        'lead', p_lead_id, 'lead'
      )
      ON CONFLICT (designer_id, client_email)
        WHERE client_email IS NOT NULL AND client_id IS NULL
      DO UPDATE SET
        client_name = EXCLUDED.client_name,
        source = 'lead',
        lead_id = EXCLUDED.lead_id,
        status = 'lead',
        updated_at = now()
      RETURNING * INTO v_relationship;
    ELSE
      INSERT INTO public.designer_clients (
        designer_id, client_id, client_name, client_email, source, lead_id, status
      ) VALUES (
        v_lead.designer_id, NULL, v_lead.contact_name, NULL,
        'lead', p_lead_id, 'lead'
      )
      RETURNING * INTO v_relationship;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'lead', to_jsonb(v_lead),
    'designerClientId', v_relationship.id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.begin_discovery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.begin_discovery(uuid) TO authenticated;

COMMENT ON FUNCTION public.begin_discovery(uuid) IS
  'Atomic Brief→Discovery transition. The exact designer or an active '
  'non-guest peer in the same active design_studio may act; contractor, '
  'manufacturer, inactive, and guest co-memberships confer no authority.';

-- ── Proposal feedback + nudge metadata table authority ─────────────────────

CREATE OR REPLACE FUNCTION public.guard_proposal_feedback_nudge_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_user IS DISTINCT FROM 'postgres'
       AND (
         NEW.client_feedback IS NOT NULL
         OR NEW.last_nudged_at IS NOT NULL
         OR NEW.nudge_count <> 0
       )
    THEN
      RAISE EXCEPTION
        'proposal feedback and nudge state cannot be preloaded'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.client_feedback IS DISTINCT FROM OLD.client_feedback
     AND (
       current_user IS DISTINCT FROM 'postgres'
       OR current_setting('app.proposal_feedback_id', true)
          IS DISTINCT FROM NEW.id::text
     )
  THEN
    RAISE EXCEPTION
      'proposal client feedback may only change through request_proposal_change'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.last_nudged_at IS DISTINCT FROM OLD.last_nudged_at
     OR NEW.nudge_count IS DISTINCT FROM OLD.nudge_count
  THEN
    IF current_user IS DISTINCT FROM 'postgres'
       OR current_setting('app.proposal_nudge_id', true)
          IS DISTINCT FROM NEW.id::text
    THEN
      RAISE EXCEPTION
        'proposal nudge state may only change through nudge_proposal'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_proposal_feedback_nudge_authority()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_proposal_feedback_nudge_authority_insert_trg
  ON public.proposals;
DROP TRIGGER IF EXISTS guard_proposal_feedback_nudge_authority_trg
  ON public.proposals;
CREATE TRIGGER guard_proposal_feedback_nudge_authority_insert_trg
BEFORE INSERT ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_feedback_nudge_authority();
CREATE TRIGGER guard_proposal_feedback_nudge_authority_trg
BEFORE UPDATE OF client_feedback, last_nudged_at, nudge_count ON public.proposals
FOR EACH ROW EXECUTE FUNCTION public.guard_proposal_feedback_nudge_authority();

CREATE OR REPLACE FUNCTION public.nudge_proposal(p_proposal_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stamp timestamptz := clock_timestamp();
  v_proposal public.proposals%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'nudge_proposal requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_proposal.designer_id) THEN
    RAISE EXCEPTION 'proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_proposal.status NOT IN ('sent', 'viewed') THEN
    RAISE EXCEPTION
      'nudge_proposal: proposal % is "%" — only sent/viewed proposals can be nudged',
      p_proposal_id, v_proposal.status
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_proposal.last_nudged_at IS NOT NULL
     AND v_proposal.last_nudged_at > v_stamp - interval '3 days'
  THEN
    RAISE EXCEPTION
      'nudge_proposal: proposal % was nudged on % — wait before nudging again',
      p_proposal_id, v_proposal.last_nudged_at
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.proposal_nudge_id', p_proposal_id::text, true);
  UPDATE public.proposals
  SET last_nudged_at = v_stamp,
      nudge_count = nudge_count + 1,
      updated_at = now()
  WHERE id = p_proposal_id;
  PERFORM set_config('app.proposal_nudge_id', '', true);

  RETURN v_stamp;
END;
$$;

REVOKE ALL ON FUNCTION public.nudge_proposal(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.nudge_proposal(uuid) TO authenticated;

COMMENT ON FUNCTION public.nudge_proposal(uuid) IS
  'Row-locked proposal reminder. Exact designer or active non-guest '
  'design_studio peer only; stamps nudge state under app.proposal_nudge_id.';

CREATE OR REPLACE FUNCTION public.request_proposal_change(
  p_proposal_id uuid,
  p_feedback text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_feedback text := btrim(COALESCE(p_feedback, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'request_proposal_change requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_feedback = '' THEN
    RAISE EXCEPTION 'change-request feedback is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal % not found', p_proposal_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_proposal.client_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'only the proposal''s client may request changes'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.status NOT IN ('sent', 'viewed') THEN
    RAISE EXCEPTION 'proposal % is not open for change requests (%)',
      p_proposal_id, v_proposal.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.proposal_feedback_id', p_proposal_id::text, true);
  UPDATE public.proposals
  SET client_feedback = v_feedback,
      updated_at = now()
  WHERE id = p_proposal_id;
  PERFORM set_config('app.proposal_feedback_id', '', true);

  INSERT INTO public.proposal_engagement (
    proposal_id, viewer_id, event_type, metadata
  ) VALUES (
    p_proposal_id, auth.uid(), 'change_requested',
    jsonb_build_object('via', 'request_proposal_change')
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_proposal_change(uuid, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.request_proposal_change(uuid, text)
  TO authenticated;

-- ── Decision + option table authority ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_client_decision_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_maintenance boolean := current_user IS NOT DISTINCT FROM 'postgres'
    AND auth.uid() IS NULL
    AND COALESCE(auth.role(), '') NOT IN ('authenticated', 'service_role');
  v_protected_change boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF NOT v_maintenance
       AND (
         current_user IS DISTINCT FROM 'postgres'
         OR current_setting('app.client_decision_write_id', true)
            IS DISTINCT FROM OLD.id::text
       )
    THEN
      RAISE EXCEPTION
        'client decisions may only be deleted through delete_client_decision_draft'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- Every row, including a trusted workflow insert, must bind to the exact
    -- designer↔client relationship named by its denormalized designer_id.
    IF NOT EXISTS (
      SELECT 1
      FROM public.designer_clients AS relationship
      WHERE relationship.id = NEW.designer_client_id
        AND relationship.designer_id IS NOT DISTINCT FROM NEW.designer_id
    ) THEN
      RAISE EXCEPTION
        'client decision designer identity does not match its relationship'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_maintenance THEN
      RETURN NEW;
    END IF;

    IF NEW.status IN ('responded', 'expired')
       OR NEW.responded_at IS NOT NULL
       OR NEW.selected_by IS NOT NULL
       OR NEW.answer IS NOT NULL
       OR NEW.answered_at IS NOT NULL
       OR NEW.answered_by IS NOT NULL
       OR NEW.client_consent_method IS NOT NULL
       OR NEW.client_consented_at IS NOT NULL
       OR NEW.client_signature IS NOT NULL
    THEN
      IF current_user IS DISTINCT FROM 'postgres'
         OR current_setting('app.client_decision_insert_id', true)
            IS DISTINCT FROM NEW.id::text
      THEN
        RAISE EXCEPTION
          'resolved decision truth may only be inserted by a canonical workflow'
          USING ERRCODE = 'check_violation';
      END IF;
      RETURN NEW;
    END IF;

    IF current_user IS DISTINCT FROM 'postgres' THEN
      IF NOT public._can_author_proposal(NEW.designer_id) THEN
        RAISE EXCEPTION 'not authorized to create a client decision'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
      IF NEW.status NOT IN ('draft', 'pending') THEN
        RAISE EXCEPTION 'client decision inserts must start draft or pending'
          USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.status = 'draft' AND NEW.sent_at IS NOT NULL THEN
        RAISE EXCEPTION 'draft client decisions cannot be pre-published'
          USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.decision_type = 'approval' AND NEW.linked_proposal_id IS NOT NULL THEN
        RAISE EXCEPTION
          'proposal approval decisions may only be inserted by signature authority'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  v_protected_change :=
       NEW.id IS DISTINCT FROM OLD.id
    OR NEW.designer_client_id IS DISTINCT FROM OLD.designer_client_id
    OR NEW.designer_id IS DISTINCT FROM OLD.designer_id
    OR NEW.project_id IS DISTINCT FROM OLD.project_id
    OR NEW.linked_proposal_id IS DISTINCT FROM OLD.linked_proposal_id
    OR NEW.title IS DISTINCT FROM OLD.title
    OR NEW.context IS DISTINCT FROM OLD.context
    OR NEW.due_date IS DISTINCT FROM OLD.due_date
    OR NEW.linked_phase IS DISTINCT FROM OLD.linked_phase
    OR NEW.phase_id IS DISTINCT FROM OLD.phase_id
    OR NEW.room_id IS DISTINCT FROM OLD.room_id
    OR NEW.section_key IS DISTINCT FROM OLD.section_key
    OR NEW.decision_type IS DISTINCT FROM OLD.decision_type
    OR NEW.decision_kind IS DISTINCT FROM OLD.decision_kind
    OR NEW.coordination_kind IS DISTINCT FROM OLD.coordination_kind
    OR NEW.blocking_status IS DISTINCT FROM OLD.blocking_status
    OR NEW.blocks_kind IS DISTINCT FROM OLD.blocks_kind
    OR NEW.blocks_milestone_id IS DISTINCT FROM OLD.blocks_milestone_id
    OR NEW.court IS DISTINCT FROM OLD.court
    OR NEW.court_party_id IS DISTINCT FROM OLD.court_party_id
    OR NEW.recommended_option_id IS DISTINCT FROM OLD.recommended_option_id
    OR NEW.status IS DISTINCT FROM OLD.status
    OR NEW.sent_at IS DISTINCT FROM OLD.sent_at
    OR NEW.responded_at IS DISTINCT FROM OLD.responded_at
    OR NEW.selected_by IS DISTINCT FROM OLD.selected_by
    OR NEW.answer IS DISTINCT FROM OLD.answer
    OR NEW.answered_at IS DISTINCT FROM OLD.answered_at
    OR NEW.answered_by IS DISTINCT FROM OLD.answered_by
    OR NEW.client_consent_method IS DISTINCT FROM OLD.client_consent_method
    OR NEW.client_consented_at IS DISTINCT FROM OLD.client_consented_at
    OR NEW.client_signature IS DISTINCT FROM OLD.client_signature;

  IF v_protected_change
     AND NOT v_maintenance
     AND (
       current_user IS DISTINCT FROM 'postgres'
       OR current_setting('app.client_decision_write_id', true)
          IS DISTINCT FROM NEW.id::text
     )
  THEN
    RAISE EXCEPTION
      'client decision business truth may only change through a canonical workflow'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_client_decision_authority()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS zz_guard_client_decision_authority_trg
  ON public.client_decisions;
CREATE TRIGGER zz_guard_client_decision_authority_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.client_decisions
FOR EACH ROW EXECUTE FUNCTION public.guard_client_decision_authority();

CREATE OR REPLACE FUNCTION public.guard_client_decision_option_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.decision_id
                             ELSE NEW.decision_id END;
  v_decision public.client_decisions%ROWTYPE;
  v_maintenance boolean := current_user IS NOT DISTINCT FROM 'postgres'
    AND auth.uid() IS NULL
    AND COALESCE(auth.role(), '') NOT IN ('authenticated', 'service_role');
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = v_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found for option write', v_decision_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_maintenance THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' AND current_user IS DISTINCT FROM 'postgres' THEN
    IF NOT public._can_author_proposal(v_decision.designer_id)
       OR v_decision.status NOT IN ('draft', 'pending')
    THEN
      RAISE EXCEPTION 'not authorized to add an option to decision %', v_decision_id
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF COALESCE(NEW.selected, false) OR NEW.client_note IS NOT NULL THEN
      RAISE EXCEPTION 'new decision options cannot preload client selection truth'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF current_user IS DISTINCT FROM 'postgres'
     OR current_setting('app.client_decision_write_id', true)
        IS DISTINCT FROM v_decision_id::text
  THEN
    RAISE EXCEPTION
      'decision options may only change through a canonical decision workflow'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.decision_id IS DISTINCT FROM OLD.decision_id THEN
    RAISE EXCEPTION 'decision option ownership is immutable'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_client_decision_option_authority()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS zz_guard_client_decision_option_authority_trg
  ON public.client_decision_options;
CREATE TRIGGER zz_guard_client_decision_option_authority_trg
BEFORE INSERT OR UPDATE OR DELETE ON public.client_decision_options
FOR EACH ROW EXECUTE FUNCTION public.guard_client_decision_option_authority();

-- The recommendation mirror is itself a canonical parent/option workflow.
-- Make both directions DEFINER-owned and set the exact parent capability.
CREATE OR REPLACE FUNCTION public.sync_decision_recommended_option()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_capability text := current_setting(
    'app.client_decision_write_id', true
  );
BEGIN
  PERFORM set_config('app.client_decision_write_id', NEW.decision_id::text, true);

  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.is_recommended = true THEN
    UPDATE public.client_decision_options
    SET is_recommended = false
    WHERE decision_id = NEW.decision_id
      AND id <> NEW.id
      AND is_recommended = true;

    UPDATE public.client_decisions
    SET recommended_option_id = NEW.id
    WHERE id = NEW.decision_id
      AND recommended_option_id IS DISTINCT FROM NEW.id;
  END IF;

  IF TG_OP = 'UPDATE'
     AND OLD.is_recommended = true
     AND NEW.is_recommended = false
     AND NOT EXISTS (
       SELECT 1 FROM public.client_decision_options
       WHERE decision_id = NEW.decision_id
         AND is_recommended = true
         AND id <> NEW.id
     )
  THEN
    UPDATE public.client_decisions
    SET recommended_option_id = NULL
    WHERE id = NEW.decision_id;
  END IF;

  PERFORM set_config(
    'app.client_decision_write_id', COALESCE(v_previous_capability, ''), true
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_decision_recommended_from_parent()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous_capability text := current_setting(
    'app.client_decision_write_id', true
  );
BEGIN
  IF NEW.recommended_option_id IS DISTINCT FROM OLD.recommended_option_id THEN
    PERFORM set_config('app.client_decision_write_id', NEW.id::text, true);
    IF NEW.recommended_option_id IS NOT NULL THEN
      UPDATE public.client_decision_options
      SET is_recommended = (id = NEW.recommended_option_id)
      WHERE decision_id = NEW.id;
    ELSE
      UPDATE public.client_decision_options
      SET is_recommended = false
      WHERE decision_id = NEW.id
        AND is_recommended = true;
    END IF;
    PERFORM set_config(
      'app.client_decision_write_id', COALESCE(v_previous_capability, ''), true
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_decision_recommended_option()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.sync_decision_recommended_from_parent()
  FROM PUBLIC, anon, authenticated, service_role;

-- RLS remains the read/insert visibility layer. UPDATE/DELETE authority is
-- removed at the ACL and policy layers, then reintroduced only through the
-- checked SECURITY DEFINER functions below.
DROP POLICY IF EXISTS "Designers can manage their decisions"
  ON public.client_decisions;
DROP POLICY IF EXISTS "Clients can respond to their decisions"
  ON public.client_decisions;
DROP POLICY IF EXISTS "client_decisions_studio_rw"
  ON public.client_decisions;

DROP POLICY IF EXISTS client_decisions_studio_select
  ON public.client_decisions;
CREATE POLICY client_decisions_studio_select
ON public.client_decisions FOR SELECT TO authenticated
USING (public.is_studio_comember(designer_id));

DROP POLICY IF EXISTS client_decisions_studio_insert
  ON public.client_decisions;
CREATE POLICY client_decisions_studio_insert
ON public.client_decisions FOR INSERT TO authenticated
WITH CHECK (public.is_studio_comember(designer_id));

REVOKE INSERT, UPDATE, DELETE ON TABLE public.client_decisions FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.client_decisions FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.client_decisions TO authenticated;
GRANT ALL ON TABLE public.client_decisions TO service_role;

DROP POLICY IF EXISTS "Designers can manage decision options"
  ON public.client_decision_options;
DROP POLICY IF EXISTS "Clients can select decision options"
  ON public.client_decision_options;
DROP POLICY IF EXISTS "client_decision_options_studio_rw"
  ON public.client_decision_options;

DROP POLICY IF EXISTS client_decision_options_studio_select
  ON public.client_decision_options;
CREATE POLICY client_decision_options_studio_select
ON public.client_decision_options FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.client_decisions AS decision
    WHERE decision.id = client_decision_options.decision_id
      AND public.is_studio_comember(decision.designer_id)
  )
);

DROP POLICY IF EXISTS client_decision_options_studio_insert
  ON public.client_decision_options;
CREATE POLICY client_decision_options_studio_insert
ON public.client_decision_options FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.client_decisions AS decision
    WHERE decision.id = client_decision_options.decision_id
      AND public.is_studio_comember(decision.designer_id)
  )
);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.client_decision_options FROM anon;
REVOKE UPDATE, DELETE ON TABLE public.client_decision_options FROM authenticated;
GRANT SELECT, INSERT ON TABLE public.client_decision_options TO authenticated;
GRANT ALL ON TABLE public.client_decision_options TO service_role;

REVOKE INSERT, UPDATE, DELETE ON TABLE public.decision_overrides
  FROM anon, authenticated;
GRANT SELECT ON TABLE public.decision_overrides TO authenticated;
GRANT ALL ON TABLE public.decision_overrides TO service_role;

-- ── Checked decision edit / publish / reopen / expire / delete paths ────────

CREATE OR REPLACE FUNCTION public.update_client_decision(
  p_decision_id uuid,
  p_patch jsonb DEFAULT '{}'::jsonb,
  p_options jsonb DEFAULT NULL,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_result public.client_decisions%ROWTYPE;
  v_target_project_id uuid;
  v_target_party_id uuid;
  v_relationship_client_id uuid;
  v_unknown jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'update_client_decision requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'p_patch must be a JSON object'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_unknown := p_patch - ARRAY[
    'title', 'context', 'due_date', 'linked_phase', 'phase_id', 'room_id',
    'section_key', 'project_id', 'decision_type', 'decision_kind',
    'coordination_kind', 'blocking_status', 'blocks_kind',
    'blocks_milestone_id', 'court', 'court_party_id'
  ];
  IF v_unknown <> '{}'::jsonb THEN
    RAISE EXCEPTION 'unsupported decision patch keys: %', v_unknown
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_decision.status NOT IN ('draft', 'pending') THEN
    RAISE EXCEPTION 'decision % cannot be edited from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_expected_updated_at IS NOT NULL
     AND v_decision.updated_at IS DISTINCT FROM p_expected_updated_at
  THEN
    RAISE EXCEPTION 'decision % changed since it was loaded', p_decision_id
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF p_patch ? 'title'
     AND btrim(COALESCE(p_patch->>'title', '')) = ''
  THEN
    RAISE EXCEPTION 'decision title is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT client_id INTO v_relationship_client_id
  FROM public.designer_clients
  WHERE id = v_decision.designer_client_id;

  v_target_project_id := CASE
    WHEN p_patch ? 'project_id' THEN NULLIF(p_patch->>'project_id', '')::uuid
    ELSE v_decision.project_id
  END;

  IF p_patch ? 'project_id'
     AND v_target_project_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM public.projects AS project
       WHERE project.id = v_target_project_id
         AND project.designer_id IS NOT DISTINCT FROM v_decision.designer_id
         AND project.client_id IS NOT DISTINCT FROM v_relationship_client_id
     )
  THEN
    RAISE EXCEPTION
      'decision project must match its exact designer/client relationship'
      USING ERRCODE = 'check_violation';
  END IF;

  v_target_party_id := CASE
    WHEN p_patch ? 'court_party_id'
      THEN NULLIF(p_patch->>'court_party_id', '')::uuid
    ELSE v_decision.court_party_id
  END;
  IF v_target_party_id IS NOT NULL
     AND (
       v_target_project_id IS NULL
       OR NOT EXISTS (
         SELECT 1 FROM public.project_parties AS party
         WHERE party.id = v_target_party_id
           AND party.project_id = v_target_project_id
       )
     )
  THEN
    RAISE EXCEPTION 'court party must belong to the decision project'
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_options IS NOT NULL THEN
    IF jsonb_typeof(p_options) <> 'array' THEN
      RAISE EXCEPTION 'p_options must be a JSON array'
        USING ERRCODE = 'invalid_parameter_value';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_options) AS option(value)
      WHERE jsonb_typeof(option.value) <> 'object'
         OR btrim(COALESCE(option.value->>'name', '')) = ''
    ) THEN
      RAISE EXCEPTION 'every decision option requires a name'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);

  UPDATE public.client_decisions
  SET title = CASE WHEN p_patch ? 'title' THEN btrim(p_patch->>'title') ELSE title END,
      context = CASE WHEN p_patch ? 'context' THEN p_patch->>'context' ELSE context END,
      due_date = CASE WHEN p_patch ? 'due_date'
        THEN NULLIF(p_patch->>'due_date', '')::timestamptz ELSE due_date END,
      linked_phase = CASE WHEN p_patch ? 'linked_phase'
        THEN p_patch->>'linked_phase' ELSE linked_phase END,
      phase_id = CASE WHEN p_patch ? 'phase_id'
        THEN NULLIF(p_patch->>'phase_id', '')::uuid ELSE phase_id END,
      room_id = CASE WHEN p_patch ? 'room_id'
        THEN NULLIF(p_patch->>'room_id', '')::uuid ELSE room_id END,
      section_key = CASE WHEN p_patch ? 'section_key'
        THEN p_patch->>'section_key' ELSE section_key END,
      project_id = v_target_project_id,
      decision_type = CASE WHEN p_patch ? 'decision_type'
        THEN p_patch->>'decision_type' ELSE decision_type END,
      decision_kind = CASE WHEN p_patch ? 'decision_kind'
        THEN p_patch->>'decision_kind' ELSE decision_kind END,
      coordination_kind = CASE WHEN p_patch ? 'coordination_kind'
        THEN p_patch->>'coordination_kind' ELSE coordination_kind END,
      blocking_status = CASE WHEN p_patch ? 'blocking_status'
        THEN p_patch->>'blocking_status' ELSE blocking_status END,
      blocks_kind = CASE WHEN p_patch ? 'blocks_kind'
        THEN p_patch->>'blocks_kind' ELSE blocks_kind END,
      blocks_milestone_id = CASE WHEN p_patch ? 'blocks_milestone_id'
        THEN NULLIF(p_patch->>'blocks_milestone_id', '')::uuid
        ELSE blocks_milestone_id END,
      court = CASE WHEN p_patch ? 'court' THEN p_patch->>'court' ELSE court END,
      court_party_id = v_target_party_id,
      updated_at = now()
  WHERE id = p_decision_id;

  IF p_options IS NOT NULL THEN
    DELETE FROM public.client_decision_options
    WHERE decision_id = p_decision_id;

    INSERT INTO public.client_decision_options (
      decision_id, name, image_url, designer_note, is_recommended,
      price, quantity, cost_delta_cents, lead_time_days_delta,
      product_id, approves, selected, client_note, sort_order
    )
    SELECT
      p_decision_id,
      btrim(option.value->>'name'),
      option.value->>'image_url',
      option.value->>'designer_note',
      COALESCE((option.value->>'is_recommended')::boolean, false),
      NULLIF(option.value->>'price', '')::integer,
      COALESCE(NULLIF(option.value->>'quantity', '')::integer, 1),
      NULLIF(option.value->>'cost_delta_cents', '')::integer,
      NULLIF(option.value->>'lead_time_days_delta', '')::integer,
      NULLIF(option.value->>'product_id', '')::uuid,
      COALESCE((option.value->>'approves')::boolean, false),
      false,
      NULL,
      COALESCE(NULLIF(option.value->>'sort_order', '')::integer,
               option.ordinality::integer - 1)
    FROM jsonb_array_elements(p_options) WITH ORDINALITY AS option(value, ordinality);
  END IF;

  PERFORM set_config('app.client_decision_write_id', '', true);
  SELECT * INTO v_result FROM public.client_decisions WHERE id = p_decision_id;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_client_decision(uuid, jsonb, jsonb, timestamptz)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_client_decision(uuid, jsonb, jsonb, timestamptz)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.publish_client_decision(p_decision_id uuid)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_decision.status = 'pending' THEN
    RETURN v_decision;
  END IF;
  IF v_decision.status <> 'draft' THEN
    RAISE EXCEPTION 'decision % cannot publish from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);
  UPDATE public.client_decisions
  SET status = 'pending', sent_at = COALESCE(sent_at, now()), updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;
  PERFORM set_config('app.client_decision_write_id', '', true);
  RETURN v_decision;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_client_decision(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.publish_client_decision(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reopen_client_decision(p_decision_id uuid)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_decision.status = 'pending' THEN
    RETURN v_decision;
  END IF;
  IF v_decision.status NOT IN ('responded', 'expired') THEN
    RAISE EXCEPTION 'decision % cannot reopen from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_decision.decision_type = 'approval'
     OR v_decision.linked_proposal_id IS NOT NULL
  THEN
    RAISE EXCEPTION 'proposal approval decisions are terminal'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);
  UPDATE public.client_decision_options
  SET selected = false, client_note = NULL
  WHERE decision_id = p_decision_id;

  UPDATE public.client_decisions
  SET status = 'pending',
      responded_at = NULL,
      selected_by = NULL,
      answer = NULL,
      answered_at = NULL,
      answered_by = NULL,
      client_consent_method = NULL,
      client_consented_at = NULL,
      client_signature = NULL,
      updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;
  PERFORM set_config('app.client_decision_write_id', '', true);
  RETURN v_decision;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_client_decision(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reopen_client_decision(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_client_decision(p_decision_id uuid)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_decision.status = 'expired' THEN
    RETURN v_decision;
  END IF;
  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'decision % cannot expire from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);
  UPDATE public.client_decisions
  SET status = 'expired', updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;
  PERFORM set_config('app.client_decision_write_id', '', true);
  RETURN v_decision;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_client_decision(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.expire_client_decision(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_due_client_decisions(
  p_cutoff timestamptz
)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'expire_due_client_decisions is service-role only'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_cutoff IS NULL THEN
    RAISE EXCEPTION 'p_cutoff is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  FOR v_id IN
    SELECT decision.id
    FROM public.client_decisions AS decision
    WHERE decision.status = 'pending'
      AND decision.due_date IS NOT NULL
      AND decision.due_date < p_cutoff
    ORDER BY decision.id
    FOR UPDATE SKIP LOCKED
  LOOP
    PERFORM set_config('app.client_decision_write_id', v_id::text, true);
    UPDATE public.client_decisions AS decision
    SET status = 'expired', updated_at = now()
    WHERE decision.id = v_id
      AND decision.status = 'pending';
    PERFORM set_config('app.client_decision_write_id', '', true);
    id := v_id;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_due_client_decisions(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_due_client_decisions(timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.mark_client_decision_viewed(p_decision_id uuid)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
BEGIN
  SELECT decision.* INTO v_decision
  FROM public.client_decisions AS decision
  JOIN public.designer_clients AS relationship
    ON relationship.id = decision.designer_client_id
  WHERE decision.id = p_decision_id
    AND relationship.client_id = auth.uid()
  FOR UPDATE OF decision;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found or not addressed to you', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_decision.viewed_at IS NULL THEN
    PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);
    UPDATE public.client_decisions
    SET viewed_at = now(), updated_at = now()
    WHERE id = p_decision_id
    RETURNING * INTO v_decision;
    PERFORM set_config('app.client_decision_write_id', '', true);
  END IF;
  RETURN v_decision;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_client_decision_viewed(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.mark_client_decision_viewed(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.stamp_client_decision_reminder(p_decision_id uuid)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'only pending decisions may be reminded'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);
  UPDATE public.client_decisions
  SET reminder_sent_at = now(), updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;
  PERFORM set_config('app.client_decision_write_id', '', true);
  RETURN v_decision;
END;
$$;

REVOKE ALL ON FUNCTION public.stamp_client_decision_reminder(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.stamp_client_decision_reminder(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_client_decision_draft(p_decision_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_cleared_ffe integer;
  v_cleared_tasks integer;
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_decision.status <> 'draft' THEN
    RAISE EXCEPTION 'only draft decisions may be deleted'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.project_ffe_items
  SET blocked = false,
      blocked_reason = NULL,
      blocked_by_decision_id = NULL,
      updated_at = now()
  WHERE blocked_by_decision_id = p_decision_id;
  GET DIAGNOSTICS v_cleared_ffe = ROW_COUNT;

  UPDATE public.project_tasks
  SET status = 'todo', blocked_by_item_id = NULL, updated_at = now()
  WHERE blocked_by_item_id = p_decision_id;
  GET DIAGNOSTICS v_cleared_tasks = ROW_COUNT;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);
  DELETE FROM public.client_decisions WHERE id = p_decision_id;
  PERFORM set_config('app.client_decision_write_id', '', true);

  RETURN jsonb_build_object(
    'deleted_decision_id', p_decision_id,
    'project_id', v_decision.project_id,
    'designer_client_id', v_decision.designer_client_id,
    'cleared_ffe_items', v_cleared_ffe,
    'cleared_tasks', v_cleared_tasks
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_client_decision_draft(uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.delete_client_decision_draft(uuid)
  TO authenticated;

-- ── Canonical decision apply paths (client, override, coordination) ─────────

CREATE OR REPLACE FUNCTION public._apply_client_decision_authorized(
  p_decision_id uuid,
  p_selected_option_id uuid,
  p_actor uuid,
  p_client_consent_method text DEFAULT NULL,
  p_client_signature text DEFAULT NULL,
  p_client_note text DEFAULT NULL,
  p_quantity integer DEFAULT NULL
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_decision public.client_decisions%ROWTYPE;
  v_option public.client_decision_options%ROWTYPE;
  v_selected_option_id uuid;
  v_room_id uuid;
  v_trade_price integer;
  v_markup numeric(5,2);
BEGIN
  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'decision % not found', p_decision_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Deterministic replay: repeating the same winning option returns the same
  -- terminal row; trying to overwrite a different winner is a stale conflict.
  IF v_decision.status = 'responded' THEN
    SELECT id INTO v_selected_option_id
    FROM public.client_decision_options
    WHERE decision_id = p_decision_id AND selected = true
    ORDER BY id
    LIMIT 1;
    IF v_selected_option_id IS NOT DISTINCT FROM p_selected_option_id THEN
      RETURN v_decision;
    END IF;
    RAISE EXCEPTION 'decision % was already resolved with another option', p_decision_id
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'decision % cannot be applied from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM 1
  FROM public.client_decision_options
  WHERE decision_id = p_decision_id
  ORDER BY id
  FOR UPDATE;

  SELECT * INTO v_option
  FROM public.client_decision_options
  WHERE id = p_selected_option_id
    AND decision_id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'option % does not belong to decision %',
      p_selected_option_id, p_decision_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF p_quantity IS NOT NULL AND p_quantity < 1 THEN
    RAISE EXCEPTION 'decision option quantity must be at least 1'
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_consent_method IS NOT NULL
     AND p_client_consent_method NOT IN ('electronic_signature', 'click_through')
  THEN
    RAISE EXCEPTION 'invalid client consent method %', p_client_consent_method
      USING ERRCODE = 'check_violation';
  END IF;
  IF p_client_consent_method = 'electronic_signature'
     AND char_length(btrim(COALESCE(p_client_signature, ''))) < 2
  THEN
    RAISE EXCEPTION 'an electronic signature of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.client_decision_write_id', p_decision_id::text, true);

  UPDATE public.client_decision_options
  SET selected = (id = p_selected_option_id),
      client_note = CASE WHEN id = p_selected_option_id
        THEN COALESCE(p_client_note, client_note) ELSE client_note END,
      quantity = CASE WHEN id = p_selected_option_id
        THEN COALESCE(p_quantity, quantity) ELSE quantity END
  WHERE decision_id = p_decision_id;

  SELECT * INTO v_option
  FROM public.client_decision_options
  WHERE id = p_selected_option_id;

  UPDATE public.client_decisions
  SET status = 'responded',
      responded_at = now(),
      selected_by = p_actor,
      client_consent_method = p_client_consent_method,
      client_signature = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE NULLIF(btrim(COALESCE(p_client_signature, '')), '') END,
      client_consented_at = CASE WHEN p_client_consent_method IS NULL
        THEN NULL ELSE now() END,
      updated_at = now()
  WHERE id = p_decision_id
  RETURNING * INTO v_decision;

  UPDATE public.project_ffe_items
  SET blocked = false,
      blocked_reason = NULL,
      blocked_by_decision_id = NULL,
      last_status_change_at = now(),
      updated_at = now()
  WHERE blocked_by_decision_id = p_decision_id
    AND project_id = v_decision.project_id;

  -- Preserve 00175/00185's one-line-per-decision dual-pricing feed-through.
  IF v_decision.project_id IS NOT NULL
     AND v_option.product_id IS NOT NULL
     AND v_decision.blocking_status = 'non_blocking'
  THEN
    v_room_id := (
      SELECT room.id
      FROM public.project_rooms AS room
      WHERE room.id = v_decision.room_id
        AND room.project_id = v_decision.project_id
    );

    SELECT product.price_trade INTO v_trade_price
    FROM public.products AS product
    WHERE product.id = v_option.product_id;

    IF v_trade_price IS NULL OR v_trade_price < 0 THEN
      v_trade_price := GREATEST(COALESCE(v_option.price, 0), 0);
      v_markup := 0;
    ELSIF v_trade_price > 0
          AND COALESCE(v_option.price, 0) > v_trade_price
    THEN
      v_markup := LEAST(
        round(((COALESCE(v_option.price, 0)::numeric / v_trade_price) - 1) * 100, 2),
        999.99
      );
    ELSE
      v_markup := 0;
    END IF;

    UPDATE public.project_ffe_items
    SET product_id = v_option.product_id,
        name = v_option.name,
        project_room_id = v_room_id,
        quantity = COALESCE(v_option.quantity, 1),
        unit_price_cents = COALESCE(v_option.price, 0),
        trade_price_cents = v_trade_price,
        markup_percent = v_markup,
        line_total_cents = COALESCE(v_option.price, 0)
          * COALESCE(v_option.quantity, 1),
        updated_at = now()
    WHERE source_decision_id = p_decision_id;

    IF NOT FOUND THEN
      INSERT INTO public.project_ffe_items (
        project_id, project_room_id, product_id, source_decision_id,
        name, item_type, status, quantity, unit_price_cents,
        trade_price_cents, markup_percent, line_total_cents
      ) VALUES (
        v_decision.project_id, v_room_id, v_option.product_id, p_decision_id,
        v_option.name, 'fixed', 'specified', COALESCE(v_option.quantity, 1),
        COALESCE(v_option.price, 0), v_trade_price, v_markup,
        COALESCE(v_option.price, 0) * COALESCE(v_option.quantity, 1)
      );
    END IF;
  END IF;

  PERFORM set_config('app.client_decision_write_id', '', true);
  RETURN v_decision;
END;
$$;

REVOKE ALL ON FUNCTION public._apply_client_decision_authorized(
  uuid, uuid, uuid, text, text, text, integer
) FROM PUBLIC, anon, authenticated, service_role;

-- Compatibility entry point retained for SQL callers. Unlike the legacy body,
-- p_selected_by can no longer be used to impersonate another user.
CREATE OR REPLACE FUNCTION public.apply_decision(
  p_decision_id uuid,
  p_selected_option_id uuid,
  p_selected_by uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_client_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'apply_decision requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_selected_by IS NOT NULL AND p_selected_by IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'p_selected_by must match the authenticated caller'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT relationship.client_id INTO v_client_id
  FROM public.client_decisions AS decision
  JOIN public.designer_clients AS relationship
    ON relationship.id = decision.designer_client_id
  WHERE decision.id = p_decision_id
  FOR UPDATE OF decision
  FOR SHARE OF relationship;

  IF v_client_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'only the addressed client may apply this decision'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM public._apply_client_decision_authorized(
    p_decision_id, p_selected_option_id, v_actor, NULL, NULL, NULL, NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_decision(uuid, uuid, uuid)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.apply_decision(uuid, uuid, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_client_decision(
  p_decision_id uuid,
  p_selected_option_id uuid,
  p_client_consent_method text DEFAULT NULL,
  p_client_signature text DEFAULT NULL,
  p_client_note text DEFAULT NULL,
  p_quantity integer DEFAULT NULL
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_client_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'apply_client_decision requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT relationship.client_id INTO v_client_id
  FROM public.client_decisions AS decision
  JOIN public.designer_clients AS relationship
    ON relationship.id = decision.designer_client_id
  WHERE decision.id = p_decision_id
  FOR UPDATE OF decision
  FOR SHARE OF relationship;

  IF v_client_id IS DISTINCT FROM v_actor THEN
    RAISE EXCEPTION 'only the addressed client may apply this decision'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN public._apply_client_decision_authorized(
    p_decision_id, p_selected_option_id, v_actor,
    p_client_consent_method, p_client_signature, p_client_note, p_quantity
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_client_decision(
  uuid, uuid, text, text, text, integer
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.apply_client_decision(
  uuid, uuid, text, text, text, integer
) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_decision_override(
  p_decision_id uuid,
  p_selected_option_id uuid,
  p_consent_method text,
  p_consent_evidence text
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_decision public.client_decisions%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'apply_decision_override requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_consent_method NOT IN ('verbal', 'written', 'text_excerpt', 'email_excerpt')
     OR btrim(COALESCE(p_consent_evidence, '')) = ''
  THEN
    RAISE EXCEPTION 'valid override consent evidence is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_decision
  FROM public.client_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_decision.designer_id) THEN
    RAISE EXCEPTION 'decision % not found or access denied', p_decision_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- A retry of the already-winning override is a read-only receipt. Do not add
  -- duplicate evidence rows; a different winner is rejected by the locked core.
  IF v_decision.status = 'responded' THEN
    RETURN public._apply_client_decision_authorized(
      p_decision_id, p_selected_option_id, v_actor, NULL, NULL, NULL, NULL
    );
  END IF;
  IF v_decision.status <> 'pending' THEN
    RAISE EXCEPTION 'decision % cannot be overridden from status %',
      p_decision_id, v_decision.status
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.decision_overrides (
    decision_id, option_id, acted_by, consent_method, consent_evidence
  ) VALUES (
    p_decision_id, p_selected_option_id, v_actor,
    p_consent_method, btrim(p_consent_evidence)
  );

  RETURN public._apply_client_decision_authorized(
    p_decision_id, p_selected_option_id, v_actor, NULL, NULL, NULL, NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_decision_override(uuid, uuid, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.apply_decision_override(uuid, uuid, text, text)
  TO authenticated;

-- ── Coordination resolution: actual caller, exact row, same-tx cascade ─────

CREATE OR REPLACE FUNCTION public.may_resolve_coordination_item(
  item public.client_decisions,
  actor uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner uuid;
  v_client uuid;
BEGIN
  IF actor IS NULL THEN
    RETURN false;
  END IF;

  SELECT COALESCE(item.designer_id, relationship.designer_id),
         relationship.client_id
  INTO v_owner, v_client
  FROM public.designer_clients AS relationship
  WHERE relationship.id = item.designer_client_id;

  IF item.project_id IS NOT NULL THEN
    SELECT COALESCE(v_owner, project.designer_id)
    INTO v_owner
    FROM public.projects AS project
    WHERE project.id = item.project_id;
  END IF;

  -- Browser acts are attributed to the real JWT actor. The canonical studio
  -- author helper admits only the exact owner or an active non-guest peer in
  -- the same active design_studio. A service-only field act may explicitly
  -- attribute the owning designer recorded by apply_field_effect.
  IF actor = auth.uid() AND public._can_author_proposal(v_owner) THEN
    RETURN true;
  END IF;
  IF COALESCE(auth.role(), '') = 'service_role' AND actor = v_owner THEN
    RETURN true;
  END IF;

  RETURN actor = auth.uid()
    AND actor = v_client
    AND item.court = 'client'
    AND item.coordination_kind IN ('selection', 'signoff');
END;
$$;

REVOKE ALL ON FUNCTION public.may_resolve_coordination_item(
  public.client_decisions, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.submit_coordination_revision(
  p_item_id uuid,
  p_attachments jsonb DEFAULT '[]'::jsonb,
  p_note text DEFAULT NULL,
  p_status text DEFAULT 'submitted',
  p_submitted_by uuid DEFAULT NULL
)
RETURNS public.coordination_item_revisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item public.client_decisions%ROWTYPE;
  v_actor uuid;
  v_next_rev integer;
  v_revision public.coordination_item_revisions%ROWTYPE;
BEGIN
  SELECT * INTO v_item
  FROM public.client_decisions
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coordination item % not found', p_item_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    v_actor := auth.uid();
  ELSIF COALESCE(auth.role(), '') = 'service_role' THEN
    v_actor := p_submitted_by;
  ELSE
    RAISE EXCEPTION 'submit_coordination_revision requires an authenticated actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_item.coordination_kind <> 'submittal' THEN
    RAISE EXCEPTION 'item % is not a submittal (coordination_kind = %)',
      p_item_id, v_item.coordination_kind
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.may_resolve_coordination_item(v_item, v_actor) THEN
    RAISE EXCEPTION 'not authorized to record a revision on item %', p_item_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(max(revision.rev_number), 0) + 1
  INTO v_next_rev
  FROM public.coordination_item_revisions AS revision
  WHERE revision.decision_id = p_item_id;

  INSERT INTO public.coordination_item_revisions (
    decision_id, rev_number, status, attachments, note, submitted_by
  ) VALUES (
    p_item_id, v_next_rev, COALESCE(p_status, 'submitted'),
    COALESCE(p_attachments, '[]'::jsonb), p_note, v_actor
  )
  RETURNING * INTO v_revision;

  UPDATE public.client_decisions
  SET updated_at = now()
  WHERE id = p_item_id;

  RETURN v_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_coordination_revision(
  uuid, jsonb, text, text, uuid
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.submit_coordination_revision(
  uuid, jsonb, text, text, uuid
) TO authenticated;

CREATE OR REPLACE FUNCTION public.resolve_coordination_item(
  p_item_id uuid,
  p_selected_option_id uuid DEFAULT NULL,
  p_answer text DEFAULT NULL,
  p_revision_id uuid DEFAULT NULL,
  p_next_court text DEFAULT NULL,
  p_resolved_by uuid DEFAULT NULL
)
RETURNS public.client_decisions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_item public.client_decisions%ROWTYPE;
  v_actor uuid;
  v_next text;
  v_owner uuid;
  v_client uuid;
  v_retry_authorized boolean := false;
BEGIN
  SELECT * INTO v_item
  FROM public.client_decisions
  WHERE id = p_item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coordination item % not found', p_item_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    -- Compatibility: old callers pass p_resolved_by. It is never trusted for a
    -- browser act; the real JWT actor is authoritative and is what gets stored.
    v_actor := auth.uid();
  ELSIF COALESCE(auth.role(), '') = 'service_role' THEN
    v_actor := p_resolved_by;
  ELSE
    RAISE EXCEPTION 'resolve_coordination_item requires an authenticated actor'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT COALESCE(v_item.designer_id, relationship.designer_id),
         relationship.client_id
  INTO v_owner, v_client
  FROM public.designer_clients AS relationship
  WHERE relationship.id = v_item.designer_client_id;

  -- Authorization precedes the idempotent receipt. Otherwise anyone who knew
  -- the UUID of an already-resolved row could use this DEFINER function as a
  -- read bypass after the court had moved.
  IF auth.uid() IS NOT NULL THEN
    v_retry_authorized := v_actor = auth.uid()
      AND (
        public._can_author_proposal(v_owner)
        OR v_actor = v_client
      );
  ELSIF COALESCE(auth.role(), '') = 'service_role' THEN
    v_retry_authorized := v_actor = v_owner;
  END IF;

  IF NOT v_retry_authorized THEN
    RAISE EXCEPTION 'not authorized to access coordination item %', p_item_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_item.status = 'responded' THEN
    RETURN v_item;
  END IF;
  IF v_item.status <> 'pending' THEN
    RAISE EXCEPTION 'coordination item % cannot resolve from status %',
      p_item_id, v_item.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.may_resolve_coordination_item(v_item, v_actor) THEN
    RAISE EXCEPTION 'not authorized to resolve coordination item %', p_item_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_item.coordination_kind = 'selection' THEN
    IF p_selected_option_id IS NULL THEN
      RAISE EXCEPTION 'a selection item requires p_selected_option_id'
        USING ERRCODE = 'check_violation';
    END IF;
    v_item := public._apply_client_decision_authorized(
      p_item_id, p_selected_option_id, v_actor, NULL, NULL, NULL, NULL
    );
  ELSE
    PERFORM set_config('app.client_decision_write_id', p_item_id::text, true);

    IF v_item.coordination_kind = 'rfi' THEN
      UPDATE public.client_decisions
      SET answer = COALESCE(p_answer, answer),
          answered_at = now(),
          answered_by = v_actor,
          status = 'responded',
          responded_at = now(),
          selected_by = v_actor,
          updated_at = now()
      WHERE id = p_item_id;
    ELSIF v_item.coordination_kind = 'submittal' THEN
      IF p_revision_id IS NOT NULL THEN
        UPDATE public.coordination_item_revisions
        SET status = 'approved', reviewed_by = v_actor, reviewed_at = now()
        WHERE id = p_revision_id AND decision_id = p_item_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'revision % does not belong to submittal %',
            p_revision_id, p_item_id
            USING ERRCODE = 'check_violation';
        END IF;
      END IF;

      UPDATE public.client_decisions
      SET answer = COALESCE(p_answer, answer),
          answered_at = now(),
          answered_by = v_actor,
          status = 'responded',
          responded_at = now(),
          selected_by = v_actor,
          updated_at = now()
      WHERE id = p_item_id;
    ELSE
      UPDATE public.client_decisions
      SET answer = COALESCE(p_answer, answer),
          answered_at = CASE WHEN p_answer IS NOT NULL THEN now() ELSE answered_at END,
          answered_by = CASE WHEN p_answer IS NOT NULL THEN v_actor ELSE answered_by END,
          status = 'responded',
          responded_at = now(),
          selected_by = v_actor,
          updated_at = now()
      WHERE id = p_item_id;
    END IF;

    PERFORM set_config('app.client_decision_write_id', '', true);
  END IF;

  UPDATE public.project_ffe_items
  SET blocked = false,
      blocked_reason = NULL,
      blocked_by_decision_id = NULL,
      last_status_change_at = now(),
      updated_at = now()
  WHERE blocked_by_decision_id = p_item_id
    AND project_id = v_item.project_id;

  UPDATE public.project_tasks AS task
  SET status = 'todo', blocked_by_item_id = NULL, updated_at = now()
  WHERE task.blocked_by_item_id = p_item_id
    AND task.status = 'blocked'
    AND (
      task.seq_after_task_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.project_tasks AS predecessor
        WHERE predecessor.id = task.seq_after_task_id
          AND predecessor.status = 'done'
      )
    );

  v_next := COALESCE(p_next_court, public.next_court_for(v_item));
  PERFORM set_config('app.client_decision_write_id', p_item_id::text, true);
  UPDATE public.client_decisions
  SET court = v_next, updated_at = now()
  WHERE id = p_item_id
  RETURNING * INTO v_item;
  PERFORM set_config('app.client_decision_write_id', '', true);

  RETURN v_item;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_coordination_item(
  uuid, uuid, text, uuid, text, uuid
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_coordination_item(
  uuid, uuid, text, uuid, text, uuid
) TO authenticated;

-- apply_field_effect is a service/DEFINER-only legacy core. Wrap it so its one
-- direct coordination payload edit (report_delay) carries the exact decision
-- capability; inserts remain clean pending workflow rows and resolution uses
-- resolve_coordination_item above.
DO $rename_apply_field_effect$
BEGIN
  IF to_regprocedure(
       'public._apply_field_effect_legacy_00399(uuid,jsonb,text,uuid)'
     ) IS NULL
  THEN
    ALTER FUNCTION public.apply_field_effect(uuid, jsonb, text, uuid)
      RENAME TO _apply_field_effect_legacy_00399;
  END IF;
END;
$rename_apply_field_effect$;

REVOKE ALL ON FUNCTION public._apply_field_effect_legacy_00399(
  uuid, jsonb, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_field_effect(
  p_party_id uuid,
  p_effect jsonb,
  p_source text DEFAULT 'sms',
  p_sms_message_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_target_id uuid := NULLIF(p_effect#>>'{target,id}', '')::uuid;
  v_result jsonb;
BEGIN
  IF p_effect#>>'{target,kind}' = 'coordination' AND v_target_id IS NOT NULL THEN
    PERFORM set_config('app.client_decision_write_id', v_target_id::text, true);
  END IF;

  v_result := public._apply_field_effect_legacy_00399(
    p_party_id, p_effect, p_source, p_sms_message_id
  );
  PERFORM set_config('app.client_decision_write_id', '', true);
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_field_effect(uuid, jsonb, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_field_effect(uuid, jsonb, text, uuid)
  TO service_role;

-- ── Signature paths bind the proposal's exact relationship ─────────────────

CREATE OR REPLACE FUNCTION public.sign_proposal(
  p_proposal_id uuid,
  p_signed_name text,
  p_signed_ip text DEFAULT NULL,
  p_auto_activate boolean DEFAULT true,
  p_start_date date DEFAULT current_date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_project_id uuid;
  v_decision_id uuid := gen_random_uuid();
  v_signed_name text := btrim(COALESCE(p_signed_name, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'sign_proposal requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(v_signed_name) < 2 THEN
    RAISE EXCEPTION 'a signature name of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal % not found', p_proposal_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF v_proposal.client_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'proposal % may only be signed by its client', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF v_proposal.status = 'accepted' THEN
    RETURN jsonb_build_object(
      'id', v_proposal.id,
      'status', v_proposal.status,
      'signed_at', v_proposal.signed_at,
      'accepted_at', v_proposal.accepted_at,
      'project_id', v_proposal.project_id
    );
  END IF;
  IF v_proposal.status NOT IN ('sent', 'viewed') THEN
    RAISE EXCEPTION 'proposal % is not in a signable status (%)',
      p_proposal_id, v_proposal.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.valid_until IS NOT NULL AND v_proposal.valid_until < now() THEN
    RAISE EXCEPTION 'proposal % has expired', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_proposal.designer_client_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.designer_clients AS relationship
       WHERE relationship.id = v_proposal.designer_client_id
         AND relationship.designer_id IS NOT DISTINCT FROM v_proposal.designer_id
         AND relationship.client_id IS NOT DISTINCT FROM v_proposal.client_id
     )
  THEN
    RAISE EXCEPTION 'proposal % has no exact designer↔client relationship',
      p_proposal_id
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM set_config('app.client_decision_insert_id', v_decision_id::text, true);
  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, project_id, linked_proposal_id,
    title, decision_type, blocking_status, status,
    client_consent_method, client_signature, client_consented_at,
    sent_at, responded_at, selected_by
  ) VALUES (
    v_decision_id, v_proposal.designer_client_id, v_proposal.designer_id,
    v_proposal.project_id, p_proposal_id, 'Proposal approval', 'approval',
    'non_blocking', 'responded', 'electronic_signature', v_signed_name,
    now(), now(), now(), auth.uid()
  )
  ON CONFLICT (linked_proposal_id)
    WHERE decision_type = 'approval' AND linked_proposal_id IS NOT NULL
  DO NOTHING;
  PERFORM set_config('app.client_decision_insert_id', '', true);

  IF NOT EXISTS (
    SELECT 1
    FROM public.client_decisions AS approval
    WHERE approval.linked_proposal_id = p_proposal_id
      AND approval.decision_type = 'approval'
      AND approval.designer_client_id = v_proposal.designer_client_id
      AND approval.designer_id = v_proposal.designer_id
  ) THEN
    RAISE EXCEPTION 'proposal approval relationship conflicts with proposal identity'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
  UPDATE public.proposals
  SET status = 'accepted',
      signed_at = now(),
      signed_by_name = v_signed_name,
      signed_ip = p_signed_ip,
      accepted_at = now(),
      updated_at = now()
  WHERE id = p_proposal_id
  RETURNING * INTO v_proposal;
  PERFORM set_config('app.proposal_accept_id', '', true);

  INSERT INTO public.proposal_engagement (
    proposal_id, viewer_id, event_type, metadata
  ) VALUES (
    p_proposal_id, auth.uid(), 'signed',
    jsonb_build_object(
      'via', 'sign_proposal',
      'signed_by_name', v_signed_name,
      'signed_ip', p_signed_ip
    )
  );

  IF p_auto_activate AND v_proposal.project_id IS NULL THEN
    v_project_id := public._activate_proposal_as_project_authorized(
      p_proposal_id, p_start_date
    );
    v_proposal.project_id := v_project_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_proposal.id,
    'status', v_proposal.status,
    'signed_at', v_proposal.signed_at,
    'accepted_at', v_proposal.accepted_at,
    'project_id', v_proposal.project_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sign_proposal(uuid, text, text, boolean, date)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.sign_proposal(uuid, text, text, boolean, date)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.record_offline_signature(
  p_proposal_id uuid,
  p_signed_name text,
  p_auto_activate boolean DEFAULT true,
  p_start_date date DEFAULT current_date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_decision_id uuid := gen_random_uuid();
  v_signed_name text := btrim(COALESCE(p_signed_name, ''));
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'record_offline_signature requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF char_length(v_signed_name) < 2 THEN
    RAISE EXCEPTION 'a signature name of at least 2 characters is required'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposal % not found', p_proposal_id
      USING ERRCODE = 'no_data_found';
  END IF;
  IF NOT public._can_author_proposal(v_proposal.designer_id) THEN
    RAISE EXCEPTION 'proposal % may only be recorded by its design studio',
      p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF v_proposal.status = 'accepted' THEN
    RETURN v_proposal.project_id;
  END IF;
  IF v_proposal.status NOT IN ('sent', 'viewed', 'expired') THEN
    RAISE EXCEPTION 'proposal % is not in a recordable status (%)',
      p_proposal_id, v_proposal.status
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.client_id IS NULL
     OR v_proposal.designer_client_id IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM public.designer_clients AS relationship
       WHERE relationship.id = v_proposal.designer_client_id
         AND relationship.designer_id IS NOT DISTINCT FROM v_proposal.designer_id
         AND relationship.client_id IS NOT DISTINCT FROM v_proposal.client_id
     )
  THEN
    RAISE EXCEPTION 'proposal % has no exact designer↔client relationship',
      p_proposal_id
      USING ERRCODE = 'no_data_found';
  END IF;

  PERFORM set_config('app.client_decision_insert_id', v_decision_id::text, true);
  INSERT INTO public.client_decisions (
    id, designer_client_id, designer_id, project_id, linked_proposal_id,
    title, decision_type, blocking_status, status,
    client_consent_method, client_signature, client_consented_at,
    sent_at, responded_at, selected_by
  ) VALUES (
    v_decision_id, v_proposal.designer_client_id, v_proposal.designer_id,
    v_proposal.project_id, p_proposal_id, 'Proposal approval', 'approval',
    'non_blocking', 'responded', 'paper', v_signed_name,
    now(), now(), now(), auth.uid()
  )
  ON CONFLICT (linked_proposal_id)
    WHERE decision_type = 'approval' AND linked_proposal_id IS NOT NULL
  DO NOTHING;
  PERFORM set_config('app.client_decision_insert_id', '', true);

  IF NOT EXISTS (
    SELECT 1
    FROM public.client_decisions AS approval
    WHERE approval.linked_proposal_id = p_proposal_id
      AND approval.decision_type = 'approval'
      AND approval.designer_client_id = v_proposal.designer_client_id
      AND approval.designer_id = v_proposal.designer_id
  ) THEN
    RAISE EXCEPTION 'proposal approval relationship conflicts with proposal identity'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
  UPDATE public.proposals
  SET status = 'accepted',
      signed_at = now(),
      signed_by_name = v_signed_name,
      signed_ip = NULL,
      accepted_at = now(),
      updated_at = now()
  WHERE id = p_proposal_id
  RETURNING * INTO v_proposal;
  PERFORM set_config('app.proposal_accept_id', '', true);

  INSERT INTO public.proposal_engagement (
    proposal_id, viewer_id, event_type, metadata
  ) VALUES (
    p_proposal_id, auth.uid(), 'signed_offline',
    jsonb_build_object(
      'via', 'record_offline_signature',
      'signed_by_name', v_signed_name,
      'recorded_by', auth.uid()
    )
  );

  IF v_proposal.project_id IS NOT NULL THEN
    RETURN v_proposal.project_id;
  ELSIF p_auto_activate THEN
    RETURN public._activate_proposal_as_project_authorized(
      p_proposal_id, p_start_date
    );
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.record_offline_signature(uuid, text, boolean, date)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_offline_signature(uuid, text, boolean, date)
  TO authenticated;


-- ── Closeout: paid FF&E coverage may be split across invoice lines ─────────

CREATE OR REPLACE FUNCTION public.close_project(
  p_project_id uuid,
  p_closure    jsonb DEFAULT NULL,
  p_snapshot   jsonb DEFAULT NULL
)
RETURNS public.projects
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_designer           uuid := auth.uid();
  v_project            public.projects;
  v_effective_closure  jsonb;
  v_blocker_count      integer;
  v_collected_cents    bigint;
BEGIN
  IF v_designer IS NULL THEN
    RAISE EXCEPTION 'close_project requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Parent first. Besides serializing lifecycle acts, FOR UPDATE conflicts
  -- with the FK key-share lock needed by a newly inserted child, so no phase,
  -- decision, amendment, invoice, milestone, or FF&E row can appear after the
  -- locked census begins.
  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'project % not found', p_project_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF v_project.designer_id IS DISTINCT FROM v_designer THEN
    RAISE EXCEPTION 'project % may only be closed by its designer', p_project_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  v_effective_closure := COALESCE(p_closure, v_project.closure_checklist);
  IF v_effective_closure IS NULL
     OR jsonb_typeof(v_effective_closure) <> 'array'
     OR EXISTS (
       SELECT 1
       FROM unnest(ARRAY[
         'walkthrough', 'punch_list', 'payment', 'photography', 'photos',
         'case_study'
       ]) AS required(key)
       WHERE NOT EXISTS (
         SELECT 1
         FROM jsonb_array_elements(v_effective_closure) AS item(value)
         WHERE item.value->>'key' = required.key
           AND item.value->'completed' = 'true'::jsonb
       )
     )
  THEN
    RAISE EXCEPTION
      'project closeout checklist must include every required item as completed'
      USING ERRCODE = 'check_violation';
  END IF;

  -- 00395's client scope-change creator follows project → scope-change order.
  -- Lock every existing row the same way, then reject any request that still
  -- needs a response or an apply_scope_change act.
  PERFORM scope_change.id
  FROM public.scope_change_requests AS scope_change
  WHERE scope_change.project_id = p_project_id
  ORDER BY scope_change.id
  FOR UPDATE;

  SELECT count(*) INTO v_blocker_count
  FROM public.scope_change_requests AS scope_change
  WHERE scope_change.project_id = p_project_id
    AND scope_change.applied_at IS NULL
    AND scope_change.status IS DISTINCT FROM 'declined'
    AND scope_change.status IS DISTINCT FROM 'cancelled';

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % scope change request(s) are unresolved',
      v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- Responded and expired are the guarded terminal decision states. Draft and
  -- pending rows remain live runtime coordination even when non-blocking. Lock
  -- decisions before phases to match both advance_project_phase and the
  -- completed-phase decision trigger's decision → phase order.
  PERFORM decision.id
  FROM public.client_decisions AS decision
  WHERE decision.project_id = p_project_id
  ORDER BY decision.id
  FOR UPDATE;

  SELECT count(*) INTO v_blocker_count
  FROM public.client_decisions AS decision
  WHERE decision.project_id = p_project_id
    AND decision.status IS DISTINCT FROM 'responded'
    AND decision.status IS DISTINCT FROM 'expired';

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % coordination/decision item(s) are unresolved',
      v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- One project-phase state is terminal. Pending, in-progress, and delayed all
  -- represent promised work and must be completed through phase authority.
  PERFORM phase.id
  FROM public.project_phases AS phase
  WHERE phase.project_id = p_project_id
  ORDER BY phase.id
  FOR UPDATE;

  SELECT count(*) INTO v_blocker_count
  FROM public.project_phases AS phase
  WHERE phase.project_id = p_project_id
    AND phase.status IS DISTINCT FROM 'completed';

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % project phase(s) are not completed',
      v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- Preserve 00383/00387's dependency order after the workflow census:
  -- invoice → line → milestone → FF&E.
  PERFORM 1
  FROM public.invoices
  WHERE project_id = p_project_id
  ORDER BY id
  FOR UPDATE;

  PERFORM 1
  FROM public.invoice_line_items AS line
  JOIN public.invoices AS invoice ON invoice.id = line.invoice_id
  WHERE invoice.project_id = p_project_id
  ORDER BY line.id
  FOR UPDATE OF line;

  PERFORM 1
  FROM public.project_payment_milestones
  WHERE project_id = p_project_id
  ORDER BY id
  FOR UPDATE;

  PERFORM 1
  FROM public.project_ffe_items
  WHERE project_id = p_project_id
  ORDER BY id
  FOR UPDATE;

  SELECT count(*) INTO v_blocker_count
  FROM public.project_ffe_items
  WHERE project_id = p_project_id
    AND status <> 'installed';

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % FF&E item(s) are not installed', v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_blocker_count
  FROM public.project_ffe_items AS ffe
  WHERE ffe.project_id = p_project_id
    AND GREATEST(
      0::bigint,
      COALESCE(
        ffe.line_total_cents::bigint,
        COALESCE(ffe.quantity, 0)::bigint
          * COALESCE(ffe.unit_price_cents, 0)::bigint,
        0::bigint
      )
    ) > 0
    AND GREATEST(
      0::bigint,
      COALESCE(
        ffe.line_total_cents::bigint,
        COALESCE(ffe.quantity, 0)::bigint
          * COALESCE(ffe.unit_price_cents, 0)::bigint,
        0::bigint
      )
    ) > COALESCE((
      SELECT sum(GREATEST(line.amount_cents::bigint, 0::bigint))
      FROM public.invoice_line_items AS line
      JOIN public.invoices AS invoice ON invoice.id = line.invoice_id
      WHERE line.ffe_item_id = ffe.id
        AND invoice.project_id = p_project_id
        AND invoice.status = 'paid'
        AND invoice.amount_paid_cents >= invoice.total_cents
    ), 0::bigint);

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % FF&E item(s) are not fully invoiced and paid',
      v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO v_blocker_count
  FROM public.project_payment_milestones
  WHERE project_id = p_project_id
    AND amount_cents > 0
    AND status <> 'paid';

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % positive payment milestone(s) are not paid',
      v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  -- Invoice headers are advisory until issue_invoice recomputes them. A draft
  -- can therefore carry real positive lines while total_cents is still zero.
  -- Canonical balance truth comes from lines (+ stored tax rate) whenever any
  -- line exists; only genuinely line-less legacy invoices fall back to header.
  SELECT count(*) INTO v_blocker_count
  FROM (
    SELECT
      invoice.id,
      invoice.status,
      invoice.amount_paid_cents,
      CASE
        WHEN count(line.id) > 0 THEN
          COALESCE(sum(line.amount_cents), 0)
          + round(COALESCE(sum(line.amount_cents), 0) * invoice.tax_rate)::bigint
        ELSE invoice.total_cents::bigint
      END AS canonical_total_cents
    FROM public.invoices AS invoice
    LEFT JOIN public.invoice_line_items AS line ON line.invoice_id = invoice.id
    WHERE invoice.project_id = p_project_id
    GROUP BY invoice.id
  ) AS invoice_truth
  WHERE invoice_truth.status <> 'void'
    AND invoice_truth.canonical_total_cents > invoice_truth.amount_paid_cents;

  IF v_blocker_count > 0 THEN
    RAISE EXCEPTION
      'project cannot close: % invoice(s) still carry a balance', v_blocker_count
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT COALESCE(sum(LEAST(
    invoice_truth.canonical_total_cents,
    invoice_truth.amount_paid_cents::bigint
  )), 0)
  INTO v_collected_cents
  FROM (
    SELECT
      invoice.id,
      invoice.status,
      invoice.amount_paid_cents,
      CASE
        WHEN count(line.id) > 0 THEN
          COALESCE(sum(line.amount_cents), 0)
          + round(COALESCE(sum(line.amount_cents), 0) * invoice.tax_rate)::bigint
        ELSE invoice.total_cents::bigint
      END AS canonical_total_cents
    FROM public.invoices AS invoice
    LEFT JOIN public.invoice_line_items AS line ON line.invoice_id = invoice.id
    WHERE invoice.project_id = p_project_id
    GROUP BY invoice.id
  ) AS invoice_truth
  WHERE invoice_truth.status <> 'void';

  IF COALESCE(v_project.total_amount_cents, 0) > v_collected_cents THEN
    RAISE EXCEPTION
      'project cannot close: contract total is not fully collected'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The trigger accepts this update only while both the definer identity and
  -- this exact row id are present. Clear immediately after the protected act.
  PERFORM set_config('app.project_completion_id', p_project_id::text, true);
  UPDATE public.projects
  SET status             = 'completed',
      closure_checklist  = v_effective_closure,
      portfolio_snapshot = COALESCE(p_snapshot, portfolio_snapshot),
      updated_at         = now()
  WHERE id = p_project_id
  RETURNING * INTO v_project;
  PERFORM set_config('app.project_completion_id', '', true);

  RETURN v_project;
END;
$$;

REVOKE ALL ON FUNCTION public.close_project(uuid, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_project(uuid, jsonb, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.close_project(uuid, jsonb, jsonb) IS
  'Sole project-completion authority. Exact owner only; locks project, scope '
  'changes, decisions, phases, invoices, lines, milestones, and FF&E; rejects '
  'unfinished workflow or operational balances before the guarded transition. '
  'Paid FF&E coverage is summed across split invoice lines. Review outreach is '
  'truthful post-close work, not checklist evidence.';
