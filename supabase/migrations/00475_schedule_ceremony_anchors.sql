-- ═══════════════════════════════════════════════════════════════════════════
-- 00475 — Ceremonies harden; facts propose (R109 / R110, I130)
--
-- Wave 2 of the Direction A schedule-fidelity program. Nothing here changes
-- what a surface says; it changes what writes an anchor.
--
-- Parts
--   1. schedule_proposals — the one home for every proposal class (I130).
--   2. Target-selection helpers (zero-grant, DEFINER-chain only).
--   3. _commit_schedule_edit_authorized — the private commit door.
--   4. commit_schedule_edit — thin public wrapper, external contract intact.
--   5. Ceremony re-cuts: each body verbatim from its verified head, one graft.
--   6. Public ceremony wrappers thread the optional disclosed impact.
--
-- Lineage of every redefined body (grep|sort|tail verified at authoring):
--   commit_schedule_edit ......................... 00325 → 00326 → 00475
--   _countersign_design_services_agreement_impl .. 00412:931 → 00414:704
--                                                  (renamed by 00462:1623) → 00475
--   countersign_design_services_agreement ........ 00462:1627 (capability
--                                                  wrapper) → 00475
--   _execute_furnishings_authorization_authorized  00412:2019 → 00414:478
--                                                  → 00422:1120 → 00475
--   _execute_furnishings_authorization_on_paper_authorized ... 00425:559 → 00475
--   execute_furnishings_authorization_on_paper ... 00425:811 → 00462:1831 → 00475
--   engage_trade_scope ........................... 00423:2113 (sole) → 00475
--   _accept_trade_scope_authorized ............... 00423:2349 (sole) → 00475
--   record_paper_trade_acceptance ................ 00425:1094 (sole) → 00475
--
-- Reconciles / deliberately NOT re-cut:
--   _execute_trade_scope_authorized (head 00424:930, which added
--   _close_trade_rfqs_for_scope) carries NO schedule graft — execution is not
--   engagement or acceptance in the R109 map. Re-cutting it from 00423 would
--   have reverted 00424's RFQ closeout; it is left alone entirely.
--
--   delivered_date carries no graft either. A delivery is an arrival, not a
--   thread START, and proposing the same phase-start po-send already proposes
--   put two competing dates on one anchor. Deferred pending a target ruling.
--
-- Security shape:
--   _commit_schedule_edit_authorized carries the sibling zero-grant posture
--   (REVOKE ALL FROM PUBLIC, anon, authenticated, service_role; no GRANT).
--   Reachability is the owner's implicit privilege inside a SECURITY DEFINER
--   call chain only — which is why po-send (service_role) can never call it
--   and can only ever write a schedule_proposals row. That is R109's fact
--   class enforced by the ACL, not by code discipline.
--   commit_schedule_edit therefore becomes SECURITY DEFINER (an INVOKER
--   caller running as `authenticated` could not reach a zero-grant callee);
--   its ownership guard is preserved verbatim, so the effective authorization
--   is unchanged — is_studio_comember(designer_id) is exactly what 00316's
--   project_phases and 00323's schedule_milestones comember RLS legs allow.
--
--   cut_schedule_revision keeps its 2-arg signature. Actor is derived from
--   auth.uid() internally by ratified anti-forgery design (00326 banner §1);
--   nothing here passes an actor.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — schedule_proposals
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.schedule_proposals (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id           uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  source_event         text NOT NULL
                         CHECK (source_event IN (
                           'design-services-executed',
                           'furnishings-authorization-executed',
                           'trade-scope-engaged',
                           'trade-scope-accepted',
                           'po-sent',
                           -- R112's install window (Wave 3) routes through the
                           -- same internal; enumerated here so its undisclosed
                           -- confirm/release can propose rather than 23514.
                           'install-window-confirmed',
                           'install-window-released'
                         )),
  source_ref           uuid,
  target_phase_id      uuid REFERENCES public.project_phases(id) ON DELETE CASCADE,
  target_milestone_id  uuid REFERENCES public.schedule_milestones(id) ON DELETE CASCADE,
  -- Nullable: a proposed UNPIN has no date. It is dismissible and, like a
  -- target-less row, never committable as an anchor.
  proposed_anchor_date date,
  -- R109's third class, recorded at write time: this date contradicts an
  -- anchor already committed on the target. A contradiction reports; it never
  -- proposes a slide the designer can commit blind.
  conflicts_with_committed boolean NOT NULL DEFAULT false,
  disclosed_context    jsonb,
  state                text NOT NULL DEFAULT 'proposed'
                         CHECK (state IN ('proposed', 'committed', 'dismissed')),
  created_at           timestamptz NOT NULL DEFAULT now(),
  resolved_at          timestamptz,
  resolved_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- A proposal never names both a phase and a milestone. It may name NEITHER:
-- an operational fact whose target phase is not identifiable still has to be
-- recorded rather than swallowed (po-send's project-level fallback, §B), and
-- such a row is dismissible but not committable.
DO $$ BEGIN
  ALTER TABLE public.schedule_proposals
    ADD CONSTRAINT schedule_proposals_single_target
      CHECK (num_nonnulls(target_phase_id, target_milestone_id) <= 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Nag-stacking guard: one LIVE proposal per (project, target, event).
CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_proposals_live_phase
  ON public.schedule_proposals (project_id, target_phase_id, source_event)
  WHERE state = 'proposed' AND target_phase_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_proposals_live_milestone
  ON public.schedule_proposals (project_id, target_milestone_id, source_event)
  WHERE state = 'proposed' AND target_milestone_id IS NOT NULL;

-- The target-less fallback escapes both indexes above (NULL is never equal to
-- NULL), so it gets its own: one live project-level proposal per event.
CREATE UNIQUE INDEX IF NOT EXISTS idx_schedule_proposals_live_projectwide
  ON public.schedule_proposals (project_id, source_event)
  WHERE state = 'proposed'
    AND target_phase_id IS NULL AND target_milestone_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_schedule_proposals_project_state
  ON public.schedule_proposals (project_id, state, created_at DESC);

-- ─── The ratchet, enforced (I130) ─────────────────────────────────────────
-- The CHECK constrains the vocabulary; this constrains the direction. A
-- resolved proposal is history: it never returns to 'proposed', and what it
-- proposed can never be rewritten. resolved_by is derived here, never taken
-- from the caller — the same anti-forgery posture cut_schedule_revision holds
-- for the revision ledger (00326 banner §1).
CREATE OR REPLACE FUNCTION public.guard_schedule_proposal_ratchet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.state <> 'proposed' THEN
    RAISE EXCEPTION 'a % schedule proposal is history and cannot be rewritten', OLD.state
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.project_id IS DISTINCT FROM OLD.project_id
     OR NEW.source_event IS DISTINCT FROM OLD.source_event
     OR NEW.source_ref IS DISTINCT FROM OLD.source_ref
     OR NEW.target_phase_id IS DISTINCT FROM OLD.target_phase_id
     OR NEW.target_milestone_id IS DISTINCT FROM OLD.target_milestone_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'what a schedule proposal names is fixed at the act'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'proposed' THEN
    -- Still live: only the fact itself may be refreshed (a later send or
    -- delivery carries a better date). Resolution stamps stay empty.
    NEW.resolved_at := NULL;
    NEW.resolved_by := NULL;
    RETURN NEW;
  END IF;
  NEW.resolved_at := now();
  NEW.resolved_by := auth.uid();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_schedule_proposal_ratchet()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS guard_schedule_proposal_ratchet_trg ON public.schedule_proposals;
CREATE TRIGGER guard_schedule_proposal_ratchet_trg
  BEFORE UPDATE ON public.schedule_proposals
  FOR EACH ROW EXECUTE FUNCTION public.guard_schedule_proposal_ratchet();

ALTER TABLE public.schedule_proposals ENABLE ROW LEVEL SECURITY;

-- Working scaffolding (R101): studio only. No client policy — O10 is open and
-- a proposal is not a promise.
DROP POLICY IF EXISTS schedule_proposals_studio_rw ON public.schedule_proposals;
CREATE POLICY schedule_proposals_studio_rw
  ON public.schedule_proposals FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = schedule_proposals.project_id
        AND public.is_studio_comember(p.designer_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = schedule_proposals.project_id
        AND public.is_studio_comember(p.designer_id)
    )
  );

-- All four roles, not two: Supabase's default privileges still grant ALL on a
-- new table in schema public, so a partial REVOKE narrows nothing. authenticated
-- must never hold INSERT (a studio member could fabricate an operational fact),
-- DELETE or TRUNCATE (a dismissal is a ratchet, not an erasure).
REVOKE ALL ON TABLE public.schedule_proposals
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, UPDATE ON TABLE public.schedule_proposals TO authenticated;
GRANT SELECT, INSERT ON TABLE public.schedule_proposals TO service_role;

COMMENT ON TABLE public.schedule_proposals IS
  'R109/R110 (I130): the uniform home for every proposed schedule anchor — '
  'operational facts (po-send, delivery), client-executed ceremony downgrades, '
  'and uncomputable-impact downgrades. A proposal is never an anchor: the '
  'designer commits it in one act through commit_schedule_edit. Studio-only '
  'under RLS (R101 working scaffolding).';
COMMENT ON COLUMN public.schedule_proposals.source_event IS
  'The act that proposed the anchor — e.g. furnishings-authorization-executed, '
  'trade-scope-accepted, po-sent.';
COMMENT ON COLUMN public.schedule_proposals.conflicts_with_committed IS
  'R109''s third class, decided at write time: the proposed date contradicts an '
  'anchor already committed on the target. A contradiction reports through the '
  'existing schedule_conflict register (R4) — it is never a slide to commit blind.';
COMMENT ON COLUMN public.schedule_proposals.source_ref IS
  'The originating row (proposal id, purchase order id, …). Soft pointer: the '
  'proposal outlives nothing, so no FK.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — target selection
--
-- No wave→phase link exists in the schema, so each target is selected
-- deterministically from the project's own chain. NULL means "no identifiable
-- target" — every caller treats that as a no-op rather than failing the
-- ceremony it rides in.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._schedule_engagement_start_phase(p_project_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ph.id
  FROM public.project_phases ph
  WHERE ph.project_id = p_project_id AND ph.lane = 'main'
  ORDER BY ph.sort_order, ph.id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public._schedule_engagement_start_phase(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._schedule_thread_phase(p_project_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ph.id
  FROM public.project_phases ph
  WHERE ph.project_id = p_project_id AND ph.lane = 'thread'
  ORDER BY ph.sort_order, ph.id
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public._schedule_thread_phase(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public._schedule_thread_completion_milestone(p_project_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT sm.id
  FROM public.schedule_milestones sm
  JOIN public.project_phases ph ON ph.id = sm.phase_id
  WHERE ph.project_id = p_project_id AND ph.lane = 'thread'
  ORDER BY sm.sort_order DESC, sm.id DESC
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public._schedule_thread_completion_milestone(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._schedule_thread_phase(uuid) IS
  'The project''s procurement/trade thread phase: first lane=''thread'' phase '
  'by sort_order. NULL when the chain has no thread lane — the ceremony still '
  'runs, it simply proposes nothing.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3 — _commit_schedule_edit_authorized
--
-- Body factored from commit_schedule_edit's live head (00326:681) VERBATIM
-- minus the ownership guard, plus:
--   · the milestone-anchor edit kind (I130), the exact mirror of
--     milestone-offset-clears-anchor;
--   · the R110 branch — a ceremony-sourced call with no disclosed impact
--     writes a proposal and returns WITHOUT touching an anchor.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._commit_schedule_edit_authorized(
  p_project_id       uuid,
  p_edits            jsonb,
  p_reason           text,
  p_disclosed_impact jsonb,
  p_source           text DEFAULT 'manual'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_edit           JSONB;
  v_kind           TEXT;
  v_phase_id       UUID;
  v_milestone_id   UUID;
  v_duration_days  INTEGER;
  v_anchor_date    DATE;
  v_offset_days    INTEGER;
  v_rows_affected  INTEGER;
  v_new_v          INTEGER;
  v_clear          BOOLEAN;
  v_committed      DATE;
  v_contradicts    BOOLEAN;
  v_context        JSONB;
  v_ceremony       BOOLEAN := COALESCE(p_source, 'manual') LIKE 'ceremony:%';
  v_disclosed      BOOLEAN;
  v_propose        BOOLEAN;
  v_source_event   TEXT;
BEGIN
  IF p_edits IS NULL OR jsonb_typeof(p_edits) <> 'array' THEN
    RAISE EXCEPTION 'p_edits must be a JSON array of edit objects';
  END IF;

  -- R110's gate is a DISCLOSURE check, not a null check. An object that says
  -- nothing has disclosed nothing; only a real sentence is a statement a
  -- surface made before consent.
  v_disclosed := p_disclosed_impact IS NOT NULL
    AND jsonb_typeof(p_disclosed_impact) = 'object'
    AND COALESCE(btrim(p_disclosed_impact->>'sentence'), '') <> '';

  -- A ceremony proposes when it disclosed nothing (R110's downgrade) — and,
  -- per R109's third class, when its date contradicts an anchor already
  -- committed on the target, however well it was disclosed.
  v_propose := v_ceremony AND NOT v_disclosed;

  IF v_ceremony THEN
    v_source_event := substr(p_source, 10);
    -- Scan first: one contradicting edit makes the whole ceremony propose,
    -- so a batch never half-hardens.
    FOR v_edit IN SELECT * FROM jsonb_array_elements(p_edits)
    LOOP
      v_kind := v_edit->>'kind';
      IF v_kind = 'phase-anchor' THEN
        SELECT ph.anchor_date INTO v_committed
          FROM public.project_phases ph
         WHERE ph.id = NULLIF(v_edit->>'phase_id', '')::uuid
           AND ph.project_id = p_project_id;
      ELSIF v_kind = 'milestone-anchor' THEN
        SELECT sm.anchor_date INTO v_committed
          FROM public.schedule_milestones sm
          JOIN public.project_phases ph ON ph.id = sm.phase_id
         WHERE sm.id = NULLIF(v_edit->>'milestone_id', '')::uuid
           AND ph.project_id = p_project_id;
      ELSE
        RAISE EXCEPTION '_commit_schedule_edit_authorized: a ceremony may only anchor, not %', v_kind;
      END IF;
      -- An explicit clear IS the act of replacing the committed anchor (R112's
      -- release), so it is never read as a contradiction — only a different
      -- DATE arriving over a committed one is.
      IF v_committed IS NOT NULL
         AND NOT COALESCE((v_edit->>'clear')::boolean, false)
         AND v_committed IS DISTINCT FROM (v_edit->>'anchor_date')::date THEN
        v_propose := true;
        v_contradicts := true;
      END IF;
    END LOOP;
  END IF;

  IF v_propose THEN
    FOR v_edit IN SELECT * FROM jsonb_array_elements(p_edits)
    LOOP
      v_kind := v_edit->>'kind';
      v_anchor_date := (v_edit->>'anchor_date')::date;
      v_clear       := COALESCE((v_edit->>'clear')::boolean, false);
      -- A dateless proposal is only honest as a proposed UNPIN.
      IF v_anchor_date IS NULL AND NOT v_clear THEN
        RAISE EXCEPTION 'a ceremony proposal requires an anchor_date, or "clear": true (%)', v_kind;
      END IF;
      IF v_clear THEN
        v_anchor_date := NULL;
      END IF;
      -- What the act knew, recorded with the proposal: the desk reads this
      -- rather than re-deriving the ceremony's own facts.
      v_context := COALESCE(v_edit->'context', '{}'::jsonb)
        || jsonb_build_object(
             'sourceEvent', v_source_event,
             'proposedOn', to_char(current_date, 'YYYY-MM-DD'),
             'disclosed', v_disclosed)
        || CASE WHEN v_disclosed
                THEN jsonb_build_object('statedImpact', p_disclosed_impact->>'sentence')
                ELSE '{}'::jsonb END;

      IF v_kind = 'phase-anchor' THEN
        v_phase_id := NULLIF(v_edit->>'phase_id', '')::uuid;
        IF NOT EXISTS (
          SELECT 1 FROM public.project_phases
          WHERE id = v_phase_id AND project_id = p_project_id
        ) THEN
          RAISE EXCEPTION 'phase % not found in project % (phase-anchor proposal)', v_phase_id, p_project_id;
        END IF;
        SELECT ph.anchor_date INTO v_committed FROM public.project_phases ph WHERE ph.id = v_phase_id;
        INSERT INTO public.schedule_proposals AS sp (
          project_id, source_event, source_ref, target_phase_id,
          proposed_anchor_date, conflicts_with_committed, disclosed_context
        ) VALUES (
          p_project_id, v_source_event,
          NULLIF(v_edit->>'source_ref', '')::uuid,
          v_phase_id, v_anchor_date,
          NOT v_clear AND v_committed IS NOT NULL AND v_committed IS DISTINCT FROM v_anchor_date,
          v_context
        )
        ON CONFLICT (project_id, target_phase_id, source_event)
          WHERE state = 'proposed' AND target_phase_id IS NOT NULL
        DO UPDATE SET
          proposed_anchor_date     = EXCLUDED.proposed_anchor_date,
          source_ref               = EXCLUDED.source_ref,
          conflicts_with_committed = EXCLUDED.conflicts_with_committed,
          disclosed_context        = EXCLUDED.disclosed_context
        WHERE sp.state = 'proposed';

      ELSE
        v_milestone_id := NULLIF(v_edit->>'milestone_id', '')::uuid;
        IF NOT EXISTS (
          SELECT 1 FROM public.schedule_milestones sm
          JOIN public.project_phases ph ON ph.id = sm.phase_id
          WHERE sm.id = v_milestone_id AND ph.project_id = p_project_id
        ) THEN
          RAISE EXCEPTION 'milestone % not found in project % (milestone-anchor proposal)', v_milestone_id, p_project_id;
        END IF;
        SELECT sm.anchor_date INTO v_committed FROM public.schedule_milestones sm WHERE sm.id = v_milestone_id;
        INSERT INTO public.schedule_proposals AS sp (
          project_id, source_event, source_ref, target_milestone_id,
          proposed_anchor_date, conflicts_with_committed, disclosed_context
        ) VALUES (
          p_project_id, v_source_event,
          NULLIF(v_edit->>'source_ref', '')::uuid,
          v_milestone_id, v_anchor_date,
          NOT v_clear AND v_committed IS NOT NULL AND v_committed IS DISTINCT FROM v_anchor_date,
          v_context
        )
        ON CONFLICT (project_id, target_milestone_id, source_event)
          WHERE state = 'proposed' AND target_milestone_id IS NOT NULL
        DO UPDATE SET
          proposed_anchor_date     = EXCLUDED.proposed_anchor_date,
          source_ref               = EXCLUDED.source_ref,
          conflicts_with_committed = EXCLUDED.conflicts_with_committed,
          disclosed_context        = EXCLUDED.disclosed_context
        WHERE sp.state = 'proposed';
      END IF;
    END LOOP;
    RETURN NULL;
  END IF;

  FOR v_edit IN SELECT * FROM jsonb_array_elements(p_edits)
  LOOP
    v_kind := v_edit->>'kind';

    IF v_kind = 'phase-duration' THEN
      v_phase_id      := NULLIF(v_edit->>'phase_id', '')::uuid;
      v_duration_days := (v_edit->>'duration_days')::integer;

      -- Project-scoped WHERE: a phase_id belonging to a different project
      -- (or no project at all) matches zero rows here, never mutates
      -- anything, and falls straight into the not-found raise below.
      UPDATE public.project_phases
         SET duration_days = v_duration_days
       WHERE id = v_phase_id
         AND project_id = p_project_id;

      GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
      IF v_rows_affected = 0 THEN
        RAISE EXCEPTION 'phase % not found in project % (phase-duration edit)', v_phase_id, p_project_id;
      END IF;

    ELSIF v_kind = 'phase-anchor' THEN
      v_phase_id   := NULLIF(v_edit->>'phase_id', '')::uuid;
      v_anchor_date := (v_edit->>'anchor_date')::date;
      v_clear       := COALESCE((v_edit->>'clear')::boolean, false);

      -- An unpin is an act, not an omission. A missing date raises unless the
      -- edit says `"clear": true` — the same rule milestone-anchor carries, so
      -- neither door can silently drop an anchor.
      IF v_anchor_date IS NULL AND NOT v_clear THEN
        RAISE EXCEPTION 'phase-anchor edit requires an anchor_date, or "clear": true to unpin (phase %)', v_phase_id;
      END IF;
      IF v_clear THEN
        v_anchor_date := NULL;
      END IF;

      UPDATE public.project_phases
         SET anchor_date = v_anchor_date
       WHERE id = v_phase_id
         AND project_id = p_project_id;

      GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
      IF v_rows_affected = 0 THEN
        RAISE EXCEPTION 'phase % not found in project % (phase-anchor edit)', v_phase_id, p_project_id;
      END IF;

    ELSIF v_kind = 'milestone-offset' THEN
      v_milestone_id := NULLIF(v_edit->>'milestone_id', '')::uuid;
      v_phase_id      := NULLIF(v_edit->>'phase_id', '')::uuid;
      v_offset_days   := (v_edit->>'offset_days')::integer;

      -- Two project-scoped guards up front: the milestone's CURRENT host
      -- phase must belong to p_project_id (else it — or its whole project —
      -- is foreign and unreachable), and so must the edit's TARGET host
      -- phase (else this door could re-home a milestone onto another
      -- project's chain). Checked before the UPDATE so the single UPDATE by
      -- id below is provably safe.
      IF NOT EXISTS (
        SELECT 1 FROM public.schedule_milestones sm
        JOIN public.project_phases ph ON ph.id = sm.phase_id
        WHERE sm.id = v_milestone_id AND ph.project_id = p_project_id
      ) THEN
        RAISE EXCEPTION 'milestone % not found in project % (milestone-offset edit)', v_milestone_id, p_project_id;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.project_phases
        WHERE id = v_phase_id AND project_id = p_project_id
      ) THEN
        RAISE EXCEPTION 'host phase % not found in project % (milestone-offset edit)', v_phase_id, p_project_id;
      END IF;

      -- anchor_date := NULL unconditionally — see the banner's milestone-
      -- offset note (mirrors useUpdateScheduleMilestone's chip-unpin).
      UPDATE public.schedule_milestones
         SET phase_id    = v_phase_id,
             offset_days = v_offset_days,
             anchor_date = NULL
       WHERE id = v_milestone_id;

    ELSIF v_kind = 'milestone-anchor' THEN
      v_milestone_id := NULLIF(v_edit->>'milestone_id', '')::uuid;
      v_anchor_date  := (v_edit->>'anchor_date')::date;
      v_clear        := COALESCE((v_edit->>'clear')::boolean, false);

      IF v_anchor_date IS NULL AND NOT v_clear THEN
        RAISE EXCEPTION 'milestone-anchor edit requires an anchor_date, or "clear": true to unpin (milestone %)', v_milestone_id;
      END IF;
      IF v_clear THEN
        v_anchor_date := NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM public.schedule_milestones sm
        JOIN public.project_phases ph ON ph.id = sm.phase_id
        WHERE sm.id = v_milestone_id AND ph.project_id = p_project_id
      ) THEN
        RAISE EXCEPTION 'milestone % not found in project % (milestone-anchor edit)', v_milestone_id, p_project_id;
      END IF;

      -- offset_days := NULL unconditionally — the exact mirror of
      -- milestone-offset clearing anchor_date (I130).
      UPDATE public.schedule_milestones
         SET anchor_date = v_anchor_date,
             offset_days = NULL
       WHERE id = v_milestone_id;

    ELSE
      RAISE EXCEPTION 'commit_schedule_edit: unknown edit kind %', v_kind;
    END IF;
  END LOOP;

  IF NOT v_disclosed THEN
    v_new_v := cut_schedule_revision(p_project_id, left(p_reason, 500));
  ELSE
    -- The revision carries what the ceremony said before it was confirmed.
    -- Bounded: the ledger holds one human sentence, and the text arrives from
    -- an authenticated caller.
    v_new_v := cut_schedule_revision(
      p_project_id,
      left(COALESCE(p_reason, 'Schedule revised'), 500) || ' · impact stated: ' ||
      left(btrim(p_disclosed_impact->>'sentence'), 500)
    );
  END IF;
  RETURN v_new_v;
END;
$$;

REVOKE ALL ON FUNCTION public._commit_schedule_edit_authorized(uuid, jsonb, text, jsonb, text)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._commit_schedule_edit_authorized(uuid, jsonb, text, jsonb, text) IS
  'The private commit door (R109/R110). commit_schedule_edit''s 00326 body '
  'minus the ownership guard — the caller has already authorized — plus the '
  'milestone-anchor edit kind and the R110 downgrade: p_source ''ceremony:*'' '
  'with a NULL p_disclosed_impact writes schedule_proposals rows and returns '
  'NULL without touching an anchor. Zero grants by design: service_role '
  'included, so an operational fact can only ever propose.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4 — commit_schedule_edit, the thin public wrapper
--
-- External contract byte-identical: same arguments, same INTEGER return, same
-- guard, same grants. SECURITY INVOKER → DEFINER is forced by the zero-grant
-- callee (see banner); the guard is the authorization either way.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.commit_schedule_edit(
  p_project_id UUID,
  p_edits      JSONB,
  p_reason     TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Ownership guard, verbatim from 00326:712-717. R105 widening: the
  -- project's designer or a studio comember of the designer.
  IF NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND public.is_studio_comember(designer_id)
  ) THEN
    RAISE EXCEPTION 'project % not found or not owned by caller', p_project_id;
  END IF;

  RETURN public._commit_schedule_edit_authorized(
    p_project_id, p_edits, p_reason,
    p_disclosed_impact := NULL,
    p_source           := 'manual'
  );
END;
$$;

COMMENT ON FUNCTION public.commit_schedule_edit(UUID, JSONB, TEXT) IS
  'The ripple''s commit door (R100). Applies a batch of previewed '
  'RipplePendingEdit objects (phase-duration/phase-anchor/milestone-offset/'
  'milestone-anchor) under an ownership + project-scoped guard, then cuts a '
  'numbered schedule_revisions row and RETURNS that revision''s v. '
  '00475 re-cuts it as a thin wrapper over _commit_schedule_edit_authorized '
  '(p_disclosed_impact NULL, p_source ''manual''): same arguments, same '
  'return, same guard. The ripple UI disclosed the impact, so the manual path '
  'needs no disclosure argument.';

-- service_role is revoked too: the manual door is the designer's, and po-send
-- has no business at it. Supabase's default privileges granted it at creation,
-- so the documented posture only becomes the real one by saying so.
REVOKE EXECUTE ON FUNCTION public.commit_schedule_edit(UUID, JSONB, TEXT)
  FROM PUBLIC, anon, service_role;
GRANT  EXECUTE ON FUNCTION public.commit_schedule_edit(UUID, JSONB, TEXT) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 5 — Ceremony re-cuts
-- ═══════════════════════════════════════════════════════════════════════════

-- ── (a) Design services executed → engagement start ───────────────────────
-- 00414:704 body VERBATIM (the body 00462 renamed, never re-authored since)
-- with two deltas: the optional p_disclosed_impact parameter, and one graft
-- inside the newly-executed branch. Arity changes, so the 2-arg name is
-- dropped rather than left behind as a live overload that never hardens.
DROP FUNCTION IF EXISTS public._countersign_design_services_agreement_impl(uuid, text);

CREATE OR REPLACE FUNCTION public._countersign_design_services_agreement_impl(
  p_proposal_id uuid,
  p_signer_name text,
  p_disclosed_impact jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_client_signature public.commercial_document_signatures%ROWTYPE;
  v_studio_signature public.commercial_document_signatures%ROWTYPE;
  v_terms public.proposal_service_terms%ROWTYPE;
  v_fingerprint text;
  v_project_id uuid;
  v_document_id uuid;
  v_authority_id uuid;
  v_retainer_invoice_id uuid;
  v_authorized_cents bigint := 0;
  v_pending_entry record;
  v_newly_executed boolean := false;
  v_name text := btrim(COALESCE(p_signer_name, ''));
  v_previous_accept text := current_setting('app.proposal_accept_id', true);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_anchor_phase_id uuid;   -- 00475
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'studio countersign requires an authenticated signer and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals
  WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.document_kind NOT IN ('design_services', 'service_addendum')
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'design services agreement % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_client_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client' FOR SHARE;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  IF v_client_signature.id IS NULL
     OR v_client_signature.signer_user_id IS DISTINCT FROM v_proposal.client_id
     OR v_client_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
  THEN
    RAISE EXCEPTION 'studio countersign requires the exact current client consent fingerprint'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_proposal.commercial_state = 'executed' THEN
    SELECT d.id, d.project_id, a.id, a.retainer_invoice_id
    INTO v_document_id, v_project_id, v_authority_id, v_retainer_invoice_id
    FROM public.project_commercial_documents d
    JOIN public.project_billing_authorities a ON a.commercial_document_id = d.id
    WHERE d.proposal_id = p_proposal_id;
    SELECT * INTO v_studio_signature FROM public.commercial_document_signatures
    WHERE proposal_id = p_proposal_id AND party_role = 'studio';
    IF v_document_id IS NULL OR v_studio_signature.id IS NULL
       OR v_studio_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'executed agreement has incomplete authority topology'
        USING ERRCODE = 'check_violation';
    END IF;
  ELSIF v_proposal.commercial_state = 'client_signed' THEN
    IF EXISTS (SELECT 1 FROM public.proposal_items i WHERE i.proposal_id = p_proposal_id) THEN
      RAISE EXCEPTION 'design services agreement must not carry furnishing items'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT * INTO STRICT v_terms FROM public.proposal_service_terms
    WHERE proposal_id = p_proposal_id;

    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'studio', v_actor, v_name, v_fingerprint,
      jsonb_build_object('via', 'countersign_design_services_agreement')
    ) RETURNING * INTO v_studio_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    UPDATE public.proposals SET
      status = 'accepted', commercial_state = 'executed',
      signed_at = v_client_signature.signed_at,
      signed_by_name = v_client_signature.signed_name,
      -- 00414: signed_ip is NOT mirrored onto proposals (see the execution
      -- rail above and the column grant at the foot of this file). The
      -- client signature row keeps the IP; public.proposals does not.
      accepted_at = v_studio_signature.signed_at,
      updated_at = now()
    WHERE id = p_proposal_id;

    IF v_proposal.document_kind = 'design_services' THEN
      -- Current private bridge is the 00398 wrapper around the long-lived
      -- 00331 implementation. It preserves every project/proposal guard.
      v_project_id := public._activate_proposal_as_project_authorized(
        p_proposal_id, current_date
      );
      INSERT INTO public.project_commercial_documents (
        project_id, proposal_id, document_kind, is_origin, executed_at, created_by
      ) VALUES (
        v_project_id, p_proposal_id, 'design_services', true,
        v_studio_signature.signed_at, v_actor
      ) RETURNING id INTO v_document_id;

      -- 00475 (R109 ceremony class): execution IS the engagement start.
      -- Anchors the first main-lane phase to the day authority took effect.
      -- Only the origin agreement anchors — an addendum re-executes billing
      -- authority, not the engagement.
      v_anchor_phase_id := public._schedule_engagement_start_phase(v_project_id);
      IF v_anchor_phase_id IS NOT NULL THEN
        PERFORM public._commit_schedule_edit_authorized(
          v_project_id,
          jsonb_build_array(jsonb_build_object(
            'kind', 'phase-anchor',
            'phase_id', v_anchor_phase_id,
            'anchor_date', to_char(current_date, 'YYYY-MM-DD'),
            'source_ref', p_proposal_id
          )),
          'Design services agreement executed',
          p_disclosed_impact,
          'ceremony:design-services-executed'
        );
      END IF;
    ELSE
      SELECT id, project_id INTO v_document_id, v_project_id
      FROM public.project_commercial_documents
      WHERE proposal_id = p_proposal_id AND document_kind = 'service_addendum'
      FOR UPDATE;
      IF v_document_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.project_commercial_documents origin
        JOIN public.proposals origin_proposal ON origin_proposal.id = origin.proposal_id
        WHERE origin.project_id = v_project_id AND origin.is_origin
          AND origin_proposal.commercial_state = 'executed'
      ) THEN
        RAISE EXCEPTION 'service addendum has no executed project origin'
          USING ERRCODE = 'check_violation';
      END IF;
      -- Different addenda lock different proposal rows. Serialize their
      -- authority replacement on the shared project before ending/inserting
      -- the one active authority enforced by the partial unique index.
      PERFORM 1 FROM public.projects
      WHERE id = v_project_id
      FOR UPDATE;
      UPDATE public.project_commercial_documents
      SET executed_at = v_studio_signature.signed_at
      WHERE id = v_document_id;
      UPDATE public.project_billing_authorities
      SET status = 'superseded', ended_at = v_studio_signature.signed_at
      WHERE project_id = v_project_id AND status = 'active';
    END IF;

    IF v_terms.retainer_amount_cents > 0 THEN
      INSERT INTO public.invoices (
        project_id, designer_id, client_id, status, currency,
        subtotal_cents, tax_rate, tax_cents, total_cents, memo
      ) VALUES (
        v_project_id, v_proposal.designer_id, v_proposal.client_id, 'draft', 'USD',
        v_terms.retainer_amount_cents, 0, 0, v_terms.retainer_amount_cents,
        'Design services retainer · ' || v_proposal.title
      ) RETURNING id INTO v_retainer_invoice_id;
      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents,
        amount_cents, metadata
      ) VALUES (
        v_retainer_invoice_id, 'adhoc', 'Design services retainer', 1,
        v_terms.retainer_amount_cents, v_terms.retainer_amount_cents,
        jsonb_build_object('commercialDocumentId', v_document_id, 'kind', 'design_services_retainer')
      );
      PERFORM public.issue_invoice(v_retainer_invoice_id, current_date);
    END IF;

    INSERT INTO public.project_billing_authorities (
      project_id, commercial_document_id, source_proposal_id,
      billing_ceiling_cents, retainer_amount_cents, retainer_activation_policy,
      billing_cadence, retainer_invoice_id, effective_at
    ) VALUES (
      v_project_id, v_document_id, p_proposal_id,
      v_terms.billing_ceiling_cents, v_terms.retainer_amount_cents,
      v_terms.retainer_activation_policy, v_terms.billing_cadence, v_retainer_invoice_id,
      v_studio_signature.signed_at
    ) RETURNING id INTO v_authority_id;

    INSERT INTO public.project_billing_authority_rates (
      billing_authority_id, source_rate_id, version, role_name, hourly_rate_cents
    ) SELECT v_authority_id, r.id, r.version, r.role_name, r.hourly_rate_cents
      FROM public.proposal_service_rates r
      WHERE r.proposal_id = p_proposal_id
      ORDER BY r.version, r.sort_order, r.role_name;

    IF v_proposal.document_kind = 'service_addendum' THEN
      SELECT COALESCE(sum(entry.rated_amount_cents), 0)
      INTO v_authorized_cents
      FROM public.project_time_entries entry
      WHERE entry.project_id = v_project_id
        AND entry.billing_state = 'authorized'
        AND entry.billable AND entry.duration_minutes IS NOT NULL;

      -- A replacement ceiling is cumulative across the project. Promote only
      -- the oldest already-rated pending work that now fits; its historical
      -- authority/rate/amount snapshots never change.
      FOR v_pending_entry IN
        SELECT entry.id, entry.rated_amount_cents
        FROM public.project_time_entries entry
        JOIN public.project_billing_authorities prior_authority
          ON prior_authority.id = entry.billing_authority_id
        WHERE entry.project_id = v_project_id
          AND entry.billing_state = 'pending_authorization'
          AND entry.billable AND entry.duration_minutes IS NOT NULL
          AND entry.rated_amount_cents IS NOT NULL
          AND entry.authority_rate_id IS NOT NULL
          AND entry.billing_authority_id <> v_authority_id
          AND (
            prior_authority.retainer_activation_policy = 'immediate'
            OR prior_authority.retainer_amount_cents = 0
            OR EXISTS (
              SELECT 1 FROM public.invoices paid_retainer
              WHERE paid_retainer.id = prior_authority.retainer_invoice_id
                AND paid_retainer.status = 'paid'
                AND paid_retainer.amount_paid_cents >= paid_retainer.total_cents
            )
          )
        ORDER BY entry.started_at, entry.id
        FOR UPDATE OF entry
      LOOP
        IF v_authorized_cents + v_pending_entry.rated_amount_cents
           <= v_terms.billing_ceiling_cents THEN
          UPDATE public.project_time_entries
          SET billing_state = 'authorized', updated_at = now()
          WHERE id = v_pending_entry.id;
          v_authorized_cents := v_authorized_cents + v_pending_entry.rated_amount_cents;
        END IF;
      END LOOP;
    END IF;

    PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly_executed := true;
  ELSE
    RAISE EXCEPTION 'design services agreement % is not ready to countersign (%)',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'agreementId', p_proposal_id,
    'proposalId', p_proposal_id,
    'commercialState', 'executed',
    'projectId', v_project_id,
    'billingAuthorityId', v_authority_id,
    'retainerInvoiceId', v_retainer_invoice_id,
    'newlyExecuted', v_newly_executed
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public._countersign_design_services_agreement_impl(uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- 00462:1627 capability wrapper VERBATIM — the capability logic is untouched;
-- the optional disclosed impact is threaded straight through.
DROP FUNCTION IF EXISTS public.countersign_design_services_agreement(uuid, text);

CREATE OR REPLACE FUNCTION public.countersign_design_services_agreement(
  p_proposal_id uuid,
  p_signer_name text,
  p_disclosed_impact jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous text := current_setting('app.commercial_signature_capability', true);
  v_result jsonb;
BEGIN
  PERFORM set_config(
    'app.commercial_signature_capability',
    format('commercial_signature:%s:%s:%s', p_proposal_id,
      'countersign_design_services_agreement', pg_catalog.txid_current()), true
  );
  v_result := public._countersign_design_services_agreement_impl(
    p_proposal_id, p_signer_name, p_disclosed_impact
  );
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.countersign_design_services_agreement(uuid, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.countersign_design_services_agreement(uuid, text, jsonb)
  TO authenticated;

-- ── (b) Furnishings authorization executed → procurement thread ───────────
-- 00422:1120 body VERBATIM plus one graft. Signature UNCHANGED: this is the
-- client-executed digital rail, so by I130's doctrine it never carries a
-- disclosed impact and always downgrades to a proposal. That is the R110
-- downgrade by construction, not a branch a caller can choose.
CREATE OR REPLACE FUNCTION public._execute_furnishings_authorization_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid,
  p_trusted_signed_ip text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := p_client_id;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_fingerprint text;
  v_deposit_cents integer;
  v_deposit_invoice_id uuid;
  v_applied_ids uuid[] := '{}'::uuid[];
  v_linked_ids uuid[] := '{}'::uuid[];
  v_newly boolean := false;
  v_previous_accept text := current_setting('app.proposal_accept_id', true);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_previous_claims text := current_setting('request.jwt.claims', true);
  v_anchor_phase_id uuid;   -- 00475
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'furnishings execution requires an authenticated client and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.client_id IS DISTINCT FROM v_actor
     OR v_proposal.document_kind <> 'furnishings_authorization'
  THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  IF v_document.id IS NULL THEN
    RAISE EXCEPTION 'furnishings authorization has no project binding'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_proposal.commercial_state <> 'executed'
     AND v_proposal.valid_until IS NOT NULL
     AND v_proposal.valid_until < now()
  THEN
    RAISE EXCEPTION 'furnishings authorization % has expired', p_proposal_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.project_budget_checkpoints c
    WHERE c.id = v_document.budget_checkpoint_id
      AND c.project_id = v_document.project_id
      AND c.status IN ('acknowledged', 'overridden')
      AND c.snapshot_fingerprint = public._budget_version_fingerprint(c.budget_version_id)
  ) THEN
    RAISE EXCEPTION 'furnishings authorization checkpoint is missing or invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00414: defense in depth. create_furnishings_authorization proved the
  -- executed design-services origin when the wave was minted; re-assert it at
  -- the moment authority is actually exercised, so a wave in flight cannot
  -- outlive the origin that authorized it. Applies to the executed retry too:
  -- the retry path re-derives applied item ids and must not answer for a
  -- project whose origin has been unbound.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = v_document.project_id AND d.is_origin
      AND d.document_kind = 'design_services' AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  v_deposit_cents := round(
    COALESCE(v_proposal.total_amount, 0)::numeric
    * COALESCE(v_proposal.deposit_percent, 0)::numeric / 100
  )::integer;
  SELECT * INTO v_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client' FOR UPDATE;

  IF v_proposal.commercial_state = 'executed' THEN
    IF v_signature.id IS NULL OR v_signature.signer_user_id IS DISTINCT FROM v_actor
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'furnishings signature retry conflicts with immutable evidence'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(array_agg(i.id ORDER BY i.id), '{}'::uuid[]) INTO v_applied_ids
    FROM public.project_ffe_items i
    WHERE i.source_commercial_document_id = v_document.id;
  ELSIF v_proposal.commercial_state = 'sent' THEN
    IF v_signature.id IS NOT NULL THEN
      RAISE EXCEPTION 'furnishings signature topology conflicts with document state'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', v_actor, v_name,
      NULLIF(btrim(COALESCE(p_trusted_signed_ip, '')), ''), v_fingerprint,
      jsonb_build_object('via', 'execute_furnishings_authorization')
    ) RETURNING * INTO v_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    -- 00414: signed_ip is NOT mirrored onto proposals. The column grant on
    -- commercial_document_signatures takes the signing IP away from studio
    -- readers; mirroring it onto public.proposals — which stays fully
    -- SELECT-granted to authenticated and row-visible to every design-studio
    -- co-member (00401 proposals_design_studio_select) — would hand the same
    -- value back one table over. The signature row is the evidence of record.
    UPDATE public.proposals SET
      status = 'accepted', commercial_state = 'executed',
      signed_at = v_signature.signed_at, signed_by_name = v_name,
      accepted_at = v_signature.signed_at, updated_at = now()
    WHERE id = p_proposal_id;

    -- (a) Legacy provenance: a proposal-sourced snapshot still MINTS its line.
    WITH inserted AS (
      INSERT INTO public.project_ffe_items (
        project_id, source_proposal_item_id, product_id, name, ffe_category,
        item_type, status, quantity, unit_price_cents, trade_price_cents,
        markup_percent, line_total_cents, vendor_id, vendor_name, sort_order,
        source_commercial_document_id, source_authorization_item_id, custom_fields
      ) SELECT
        v_document.project_id, a.source_proposal_item_id, a.product_id, a.name,
        a.category, a.item_type, 'approved', a.quantity,
        a.client_unit_price_cents, a.trade_unit_cost_cents, a.markup_percent,
        a.client_line_total_cents, a.vendor_id, a.vendor_name, a.sort_order,
        v_document.id, a.id, COALESCE(a.snapshot->'customFields', '{}'::jsonb)
      FROM public.furnishing_authorization_items a
      WHERE a.commercial_document_id = v_document.id
        AND a.source_proposal_item_id IS NOT NULL
      ORDER BY a.sort_order, a.id
      RETURNING id
    ) SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO v_applied_ids
      FROM inserted;

    -- (b) 00422 provenance: a schedule-sourced snapshot LINKS the line it froze.
    -- The status ratchet uses the 00184 rank helper so a line already further
    -- along (ordered, shipped…) is never dragged back to 'approved'.
    WITH linked AS (
      UPDATE public.project_ffe_items i SET
        source_commercial_document_id = v_document.id,
        source_authorization_item_id = a.id,
        status = CASE
          WHEN public.ffe_status_rank(i.status) < public.ffe_status_rank('approved')
            THEN 'approved' ELSE i.status END,
        updated_at = now()
      FROM public.furnishing_authorization_items a
      WHERE a.commercial_document_id = v_document.id
        AND a.source_ffe_item_id IS NOT NULL
        AND i.id = a.source_ffe_item_id
      RETURNING i.id
    ) SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO v_linked_ids
      FROM linked;
    -- Sorted, not concatenated: the executed-retry branch above re-derives this
    -- list with array_agg(... ORDER BY i.id), so a caller comparing a first
    -- execution against its own retry must see the same order, not two
    -- provenance groups in insertion order.
    SELECT COALESCE(array_agg(applied ORDER BY applied), '{}'::uuid[])
    INTO v_applied_ids
    FROM unnest(v_applied_ids || v_linked_ids) AS applied;

    IF v_deposit_cents > 0 THEN
      INSERT INTO public.invoices (
        project_id, designer_id, client_id, status, currency,
        subtotal_cents, tax_rate, tax_cents, total_cents, memo
      ) VALUES (
        v_document.project_id, v_proposal.designer_id, v_proposal.client_id,
        'draft', 'USD', v_deposit_cents, 0, 0, v_deposit_cents,
        'Furnishings deposit · ' || v_document.wave_name
      ) RETURNING id INTO v_deposit_invoice_id;
      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents,
        amount_cents, metadata
      ) VALUES (
        v_deposit_invoice_id, 'adhoc', 'Furnishings authorization deposit', 1,
        v_deposit_cents, v_deposit_cents,
        jsonb_build_object('commercialDocumentId', v_document.id, 'kind', 'furnishings_deposit')
      );
      -- The client executes the authorization, but invoice issuance remains a
      -- studio act. Adopt the owning designer only for the existing issuance
      -- RPC, then restore the caller's claims before returning.
      PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_proposal.designer_id, 'role', 'authenticated'
      )::text, true);
      PERFORM public.issue_invoice(v_deposit_invoice_id, current_date);
      PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
    END IF;
    UPDATE public.project_commercial_documents SET
      executed_at = v_signature.signed_at,
      deposit_invoice_id = v_deposit_invoice_id
    WHERE id = v_document.id;

    -- 00475 (R109 ceremony class, R110 downgrade by construction): the client
    -- executes this rail on their own screen, so nothing here can have stated
    -- the schedule impact. A NULL disclosed impact proposes the procurement
    -- thread anchor; it never writes one.
    v_anchor_phase_id := public._schedule_thread_phase(v_document.project_id);
    IF v_anchor_phase_id IS NOT NULL THEN
      PERFORM public._commit_schedule_edit_authorized(
        v_document.project_id,
        jsonb_build_array(jsonb_build_object(
          'kind', 'phase-anchor',
          'phase_id', v_anchor_phase_id,
          'anchor_date', to_char(v_signature.signed_at::date, 'YYYY-MM-DD'),
          'source_ref', p_proposal_id
        )),
        'Furnishings authorization executed',
        NULL,
        'ceremony:furnishings-authorization-executed'
      );
    END IF;

    PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly := true;
  ELSE
    RAISE EXCEPTION 'furnishings authorization % is not executable from %',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'projectId', v_document.project_id,
    'documentId', v_document.id,
    'checkpointId', v_document.budget_checkpoint_id,
    'appliedItemIds', to_jsonb(v_applied_ids),
    'depositInvoiceId', COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id),
    'depositRequiredCents', COALESCE((SELECT i.total_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), v_deposit_cents),
    'deposit_required_cents', COALESCE((SELECT i.total_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), v_deposit_cents),
    'depositPaidCents', COALESCE((SELECT i.amount_paid_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), 0),
    'deposit_paid_cents', COALESCE((SELECT i.amount_paid_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), 0),
    'newlyExecuted', v_newly
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public._execute_furnishings_authorization_authorized(uuid, text, uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- ── (c) Furnishings authorization on paper → procurement thread ───────────
-- 00425:559 body VERBATIM (an independently hand-copied body, never re-cut)
-- plus the optional p_disclosed_impact parameter and one graft. This rail IS
-- studio-executed, so its sheet computes and states the impact and the anchor
-- hardens directly.
DROP FUNCTION IF EXISTS public._execute_furnishings_authorization_on_paper_authorized(uuid, text, date, uuid, uuid);

CREATE OR REPLACE FUNCTION public._execute_furnishings_authorization_on_paper_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_paper_signed_on date,
  p_recorded_by uuid,
  p_scan_document_id uuid DEFAULT NULL,
  p_disclosed_impact jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- 00425 DELTA 1 (actor). v_actor is the SIGNER everywhere below, and the
  -- signer is still the client — they are the one who signed, on paper. It is
  -- resolved from the row rather than passed in, because the caller is the
  -- studio. v_recorder is who is doing the recording.
  v_actor uuid;
  v_recorder uuid := p_recorded_by;
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_signature public.commercial_document_signatures%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_fingerprint text;
  v_deposit_cents integer;
  v_deposit_invoice_id uuid;
  v_applied_ids uuid[] := '{}'::uuid[];
  v_linked_ids uuid[] := '{}'::uuid[];
  v_newly boolean := false;
  v_previous_accept text := current_setting('app.proposal_accept_id', true);
  v_previous_commercial text := current_setting('app.commercial_document_id', true);
  v_previous_claims text := current_setting('request.jwt.claims', true);
  v_anchor_phase_id uuid;   -- 00475
BEGIN
  IF v_recorder IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'recording a paper furnishings execution requires an authenticated studio author and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR NOT public._can_author_proposal(v_proposal.designer_id)
     OR v_proposal.client_id IS NULL
     OR v_proposal.document_kind <> 'furnishings_authorization'
  THEN
    RAISE EXCEPTION 'furnishings authorization % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_actor := v_proposal.client_id;
  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  IF v_document.id IS NULL THEN
    RAISE EXCEPTION 'furnishings authorization has no project binding'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00425 DELTA 4 (expiry). The client rail refuses an expired authorization
  -- here, because in the portal the link IS the offer. The paper rail does not:
  -- the client already signed, on the date the record carries, and a lapsed
  -- link is not a reason to throw that away. record_paper_client_signature and
  -- record_offline_signature (00399) have never had this guard either.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_budget_checkpoints c
    WHERE c.id = v_document.budget_checkpoint_id
      AND c.project_id = v_document.project_id
      AND c.status IN ('acknowledged', 'overridden')
      AND c.snapshot_fingerprint = public._budget_version_fingerprint(c.budget_version_id)
  ) THEN
    RAISE EXCEPTION 'furnishings authorization checkpoint is missing or invalid'
      USING ERRCODE = 'check_violation';
  END IF;
  -- 00414: defense in depth. create_furnishings_authorization proved the
  -- executed design-services origin when the wave was minted; re-assert it at
  -- the moment authority is actually exercised, so a wave in flight cannot
  -- outlive the origin that authorized it. Applies to the executed retry too:
  -- the retry path re-derives applied item ids and must not answer for a
  -- project whose origin has been unbound.
  IF NOT EXISTS (
    SELECT 1 FROM public.project_commercial_documents d
    JOIN public.proposals p ON p.id = d.proposal_id
    WHERE d.project_id = v_document.project_id AND d.is_origin
      AND d.document_kind = 'design_services' AND p.commercial_state = 'executed'
  ) THEN
    RAISE EXCEPTION 'project % has no executed design-services origin', v_document.project_id
      USING ERRCODE = 'check_violation';
  END IF;
  v_fingerprint := public._commercial_document_fingerprint(p_proposal_id);
  v_deposit_cents := round(
    COALESCE(v_proposal.total_amount, 0)::numeric
    * COALESCE(v_proposal.deposit_percent, 0)::numeric / 100
  )::integer;
  SELECT * INTO v_signature FROM public.commercial_document_signatures
  WHERE proposal_id = p_proposal_id AND party_role = 'client' FOR UPDATE;

  IF v_proposal.commercial_state = 'executed' THEN
    IF v_signature.id IS NULL OR v_signature.signer_user_id IS DISTINCT FROM v_actor
       OR v_signature.signed_name IS DISTINCT FROM v_name
       OR v_signature.evidence_fingerprint IS DISTINCT FROM v_fingerprint
    THEN
      RAISE EXCEPTION 'furnishings signature retry conflicts with immutable evidence'
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT COALESCE(array_agg(i.id ORDER BY i.id), '{}'::uuid[]) INTO v_applied_ids
    FROM public.project_ffe_items i
    WHERE i.source_commercial_document_id = v_document.id;
  ELSIF v_proposal.commercial_state = 'sent' THEN
    IF v_signature.id IS NOT NULL THEN
      RAISE EXCEPTION 'furnishings signature topology conflicts with document state'
        USING ERRCODE = 'check_violation';
    END IF;
    INSERT INTO public.commercial_document_signatures (
      proposal_id, party_role, signer_user_id, signed_name, signed_ip,
      evidence_fingerprint, metadata
    ) VALUES (
      p_proposal_id, 'client', v_actor, v_name,
      -- 00425 DELTA 2 (signed_ip) and DELTA 3 (metadata). No IP, because no
      -- browser: the paper tell. The metadata builder validates the paper date
      -- and the scan pointer before it returns.
      NULL, v_fingerprint,
      public._paper_signature_metadata(
        p_proposal_id, 'execute_furnishings_authorization_on_paper',
        p_paper_signed_on, v_recorder, p_scan_document_id
      )
    ) RETURNING * INTO v_signature;

    PERFORM set_config('app.proposal_accept_id', p_proposal_id::text, true);
    PERFORM set_config('app.commercial_document_id', p_proposal_id::text, true);
    -- 00414: signed_ip is NOT mirrored onto proposals. The column grant on
    -- commercial_document_signatures takes the signing IP away from studio
    -- readers; mirroring it onto public.proposals — which stays fully
    -- SELECT-granted to authenticated and row-visible to every design-studio
    -- co-member (00401 proposals_design_studio_select) — would hand the same
    -- value back one table over. The signature row is the evidence of record.
    UPDATE public.proposals SET
      status = 'accepted', commercial_state = 'executed',
      signed_at = v_signature.signed_at, signed_by_name = v_name,
      accepted_at = v_signature.signed_at, updated_at = now()
    WHERE id = p_proposal_id;

    -- (a) Legacy provenance: a proposal-sourced snapshot still MINTS its line.
    WITH inserted AS (
      INSERT INTO public.project_ffe_items (
        project_id, source_proposal_item_id, product_id, name, ffe_category,
        item_type, status, quantity, unit_price_cents, trade_price_cents,
        markup_percent, line_total_cents, vendor_id, vendor_name, sort_order,
        source_commercial_document_id, source_authorization_item_id, custom_fields
      ) SELECT
        v_document.project_id, a.source_proposal_item_id, a.product_id, a.name,
        a.category, a.item_type, 'approved', a.quantity,
        a.client_unit_price_cents, a.trade_unit_cost_cents, a.markup_percent,
        a.client_line_total_cents, a.vendor_id, a.vendor_name, a.sort_order,
        v_document.id, a.id, COALESCE(a.snapshot->'customFields', '{}'::jsonb)
      FROM public.furnishing_authorization_items a
      WHERE a.commercial_document_id = v_document.id
        AND a.source_proposal_item_id IS NOT NULL
      ORDER BY a.sort_order, a.id
      RETURNING id
    ) SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO v_applied_ids
      FROM inserted;

    -- (b) 00422 provenance: a schedule-sourced snapshot LINKS the line it froze.
    -- The status ratchet uses the 00184 rank helper so a line already further
    -- along (ordered, shipped…) is never dragged back to 'approved'.
    WITH linked AS (
      UPDATE public.project_ffe_items i SET
        source_commercial_document_id = v_document.id,
        source_authorization_item_id = a.id,
        status = CASE
          WHEN public.ffe_status_rank(i.status) < public.ffe_status_rank('approved')
            THEN 'approved' ELSE i.status END,
        updated_at = now()
      FROM public.furnishing_authorization_items a
      WHERE a.commercial_document_id = v_document.id
        AND a.source_ffe_item_id IS NOT NULL
        AND i.id = a.source_ffe_item_id
      RETURNING i.id
    ) SELECT COALESCE(array_agg(id ORDER BY id), '{}'::uuid[]) INTO v_linked_ids
      FROM linked;
    -- Sorted, not concatenated: the executed-retry branch above re-derives this
    -- list with array_agg(... ORDER BY i.id), so a caller comparing a first
    -- execution against its own retry must see the same order, not two
    -- provenance groups in insertion order.
    SELECT COALESCE(array_agg(applied ORDER BY applied), '{}'::uuid[])
    INTO v_applied_ids
    FROM unnest(v_applied_ids || v_linked_ids) AS applied;

    IF v_deposit_cents > 0 THEN
      INSERT INTO public.invoices (
        project_id, designer_id, client_id, status, currency,
        subtotal_cents, tax_rate, tax_cents, total_cents, memo
      ) VALUES (
        v_document.project_id, v_proposal.designer_id, v_proposal.client_id,
        'draft', 'USD', v_deposit_cents, 0, 0, v_deposit_cents,
        'Furnishings deposit · ' || v_document.wave_name
      ) RETURNING id INTO v_deposit_invoice_id;
      INSERT INTO public.invoice_line_items (
        invoice_id, kind, description, quantity, unit_amount_cents,
        amount_cents, metadata
      ) VALUES (
        v_deposit_invoice_id, 'adhoc', 'Furnishings authorization deposit', 1,
        v_deposit_cents, v_deposit_cents,
        jsonb_build_object('commercialDocumentId', v_document.id, 'kind', 'furnishings_deposit')
      );
      -- The client executes the authorization, but invoice issuance remains a
      -- studio act. Adopt the owning designer only for the existing issuance
      -- RPC, then restore the caller's claims before returning.
      PERFORM set_config('request.jwt.claims', jsonb_build_object(
        'sub', v_proposal.designer_id, 'role', 'authenticated'
      )::text, true);
      PERFORM public.issue_invoice(v_deposit_invoice_id, current_date);
      PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
    END IF;
    UPDATE public.project_commercial_documents SET
      executed_at = v_signature.signed_at,
      deposit_invoice_id = v_deposit_invoice_id
    WHERE id = v_document.id;

    -- 00475 (R109 ceremony class): the studio records this act, so the sheet
    -- states the impact and the anchor hardens. The date is the day the client
    -- signed the paper original, not the day it was recorded. A NULL impact
    -- still downgrades to a proposal (R110).
    v_anchor_phase_id := public._schedule_thread_phase(v_document.project_id);
    IF v_anchor_phase_id IS NOT NULL THEN
      PERFORM public._commit_schedule_edit_authorized(
        v_document.project_id,
        jsonb_build_array(jsonb_build_object(
          'kind', 'phase-anchor',
          'phase_id', v_anchor_phase_id,
          'anchor_date', to_char(
            COALESCE(p_paper_signed_on, v_signature.signed_at::date), 'YYYY-MM-DD'),
          'source_ref', p_proposal_id
        )),
        'Furnishings authorization executed',
        p_disclosed_impact,
        'ceremony:furnishings-authorization-executed'
      );
    END IF;

    PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
    PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
    v_newly := true;
  ELSE
    RAISE EXCEPTION 'furnishings authorization % is not executable from %',
      p_proposal_id, COALESCE(v_proposal.commercial_state, 'NULL')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN jsonb_build_object(
    'projectId', v_document.project_id,
    'documentId', v_document.id,
    'checkpointId', v_document.budget_checkpoint_id,
    'appliedItemIds', to_jsonb(v_applied_ids),
    'depositInvoiceId', COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id),
    'depositRequiredCents', COALESCE((SELECT i.total_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), v_deposit_cents),
    'deposit_required_cents', COALESCE((SELECT i.total_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), v_deposit_cents),
    'depositPaidCents', COALESCE((SELECT i.amount_paid_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), 0),
    'deposit_paid_cents', COALESCE((SELECT i.amount_paid_cents
      FROM public.invoices i
      WHERE i.id = COALESCE(v_deposit_invoice_id, v_document.deposit_invoice_id)), 0),
    'newlyExecuted', v_newly
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.proposal_accept_id', COALESCE(v_previous_accept, ''), true);
  PERFORM set_config('app.commercial_document_id', COALESCE(v_previous_commercial, ''), true);
  PERFORM set_config('request.jwt.claims', COALESCE(v_previous_claims, ''), true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public._execute_furnishings_authorization_on_paper_authorized(uuid, text, date, uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

-- 00462:1831 capability wrapper VERBATIM — capability logic untouched, the
-- optional disclosed impact threaded through.
DROP FUNCTION IF EXISTS public.execute_furnishings_authorization_on_paper(uuid, text, date, uuid);

CREATE OR REPLACE FUNCTION public.execute_furnishings_authorization_on_paper(
  p_proposal_id uuid,
  p_signed_name text,
  p_paper_signed_on date,
  p_scan_document_id uuid DEFAULT NULL,
  p_disclosed_impact jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_previous text := current_setting('app.commercial_signature_capability', true);
  v_result jsonb;
BEGIN
  PERFORM set_config(
    'app.commercial_signature_capability',
    format('commercial_signature:%s:%s:%s', p_proposal_id,
      'execute_furnishings_authorization_on_paper', pg_catalog.txid_current()), true
  );
  v_result := public._execute_furnishings_authorization_on_paper_authorized(
    p_proposal_id, p_signed_name, p_paper_signed_on, auth.uid(), p_scan_document_id,
    p_disclosed_impact
  );
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous, ''), true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.commercial_signature_capability', COALESCE(v_previous, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.execute_furnishings_authorization_on_paper(uuid, text, date, uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_furnishings_authorization_on_paper(uuid, text, date, uuid, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.execute_furnishings_authorization_on_paper(uuid, text, date, uuid, jsonb) IS
  '00425: the studio records that the client signed and executed a PRINTED furnishings authorization, in one act — every effect of the online rail (schedule lines apply, deposit invoice follows), with the paper metadata and no expiry guard. '
  '00475 adds the optional p_disclosed_impact: the sheet states the procurement-thread anchor''s effect before confirmation and the anchor hardens; a NULL or empty disclosure downgrades to a schedule_proposals row (R110), and a date contradicting a committed anchor always does.';

-- ── (d) Trade scope engaged → trade thread start ──────────────────────────
-- 00423:2113 body VERBATIM (sole definition) plus the optional
-- p_disclosed_impact parameter and one graft. engage_trade_scope is itself the
-- public entry and is a studio act, so the sheet states the impact.
DROP FUNCTION IF EXISTS public.engage_trade_scope(uuid);

CREATE OR REPLACE FUNCTION public.engage_trade_scope(
  p_proposal_id uuid,
  p_disclosed_impact jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_proposal public.proposals%ROWTYPE;
  v_document public.project_commercial_documents%ROWTYPE;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_section record;
  v_room_label text;
  v_first boolean := true;
  v_created integer := 0;
  v_previous_progress text := current_setting('app.trade_scope_progress_id', true);
  v_anchor_phase_id uuid;   -- 00475
BEGIN
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.document_kind <> 'trade_scope'
     OR auth.uid() IS NULL
     OR NOT public._can_author_proposal(v_proposal.designer_id)
  THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_document FROM public.project_commercial_documents
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  IF v_proposal.commercial_state IS DISTINCT FROM 'executed'
     OR v_document.executed_at IS NULL THEN
    RAISE EXCEPTION 'a trade scope must be executed before it can be engaged'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = v_document.deposit_invoice_id
      AND i.status = 'paid' AND i.amount_paid_cents >= i.total_cents
  ) THEN
    RAISE EXCEPTION 'the trade scope deposit invoice must be paid before engagement'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_terms FROM public.trade_scope_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;

  -- Idempotent: a scope already engaged (or further along) answers with where it
  -- is and mints nothing. Re-calling must never double the presence lines.
  IF v_terms.progress_state <> 'none' THEN
    RETURN jsonb_build_object(
      'proposalId', p_proposal_id,
      'documentId', v_document.id,
      'progressState', v_terms.progress_state,
      'engagedAt', v_terms.engaged_at,
      'presenceLineIds', COALESCE((
        SELECT jsonb_agg(i.id ORDER BY i.sort_order, i.id)
        FROM public.project_ffe_items i
        WHERE i.trade_scope_document_id = v_document.id), '[]'::jsonb),
      'newlyEngaged', false
    );
  END IF;

  PERFORM set_config('app.trade_scope_progress_id', p_proposal_id::text, true);
  UPDATE public.trade_scope_terms SET
    progress_state = 'engaged', engaged_at = now()
  WHERE proposal_id = p_proposal_id RETURNING * INTO v_terms;
  PERFORM set_config('app.trade_scope_progress_id', COALESCE(v_previous_progress, ''), true);

  FOR v_section IN
    SELECT s.*, r.name AS live_room_name
    FROM public.trade_scope_sections s
    LEFT JOIN public.project_rooms r ON r.id = s.project_room_id
    WHERE s.proposal_id = p_proposal_id
    ORDER BY s.sort_order, s.id
  LOOP
    v_room_label := NULLIF(btrim(COALESCE(v_section.room_name, v_section.live_room_name, '')), '');
    INSERT INTO public.project_ffe_items (
      project_id, project_room_id, name, ffe_category, item_type, status,
      quantity, unit_price_cents, line_total_cents,
      trade_price_cents, markup_percent, added_via, sort_order,
      trade_scope_document_id
    ) VALUES (
      v_document.project_id, v_section.project_room_id,
      v_proposal.title || COALESCE(' — ' || v_room_label, ''),
      'trade work', 'fixed', 'approved', 1,
      -- Allocation where the studio apportioned the price; otherwise the whole
      -- price rides on the FIRST section and the rest carry zero. A trade scope
      -- is ONE price — summing the presence lines must return that price, never
      -- a multiple of it.
      COALESCE(v_section.allocation_cents,
               CASE WHEN v_first THEN v_terms.client_price_cents ELSE 0 END),
      COALESCE(v_section.allocation_cents,
               CASE WHEN v_first THEN v_terms.client_price_cents ELSE 0 END),
      NULL, NULL, 'trade-scope', v_section.sort_order,
      v_document.id
    );
    v_first := false;
    v_created := v_created + 1;
  END LOOP;

  -- 00475 (R109 ceremony class): engagement is where the trade thread starts.
  v_anchor_phase_id := public._schedule_thread_phase(v_document.project_id);
  IF v_anchor_phase_id IS NOT NULL THEN
    PERFORM public._commit_schedule_edit_authorized(
      v_document.project_id,
      jsonb_build_array(jsonb_build_object(
        'kind', 'phase-anchor',
        'phase_id', v_anchor_phase_id,
        'anchor_date', to_char(v_terms.engaged_at::date, 'YYYY-MM-DD'),
        'source_ref', p_proposal_id
      )),
      'Trade scope engaged',
      p_disclosed_impact,
      'ceremony:trade-scope-engaged'
    );
  END IF;

  RETURN jsonb_build_object(
    'proposalId', p_proposal_id,
    'documentId', v_document.id,
    'progressState', v_terms.progress_state,
    'engagedAt', v_terms.engaged_at,
    'presenceLineCount', v_created,
    'presenceLineIds', COALESCE((
      SELECT jsonb_agg(i.id ORDER BY i.sort_order, i.id)
      FROM public.project_ffe_items i
      WHERE i.trade_scope_document_id = v_document.id), '[]'::jsonb),
    'newlyEngaged', true
  );
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.trade_scope_progress_id', COALESCE(v_previous_progress, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public.engage_trade_scope(uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.engage_trade_scope(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.engage_trade_scope(uuid, jsonb) IS
  'Marks an executed, deposit-paid trade scope as engaged and mints its presence lines — one per section, filed in the section room, carrying trade_scope_document_id and no trade cost. Idempotent. 00475: engagement also anchors the trade thread, stating its schedule impact (R109/R110).';

-- ── (e) Trade scope accepted → thread-completion milestone ────────────────
-- 00423:2349 body VERBATIM (sole definition) plus one graft. Signature
-- UNCHANGED: acceptance is a client act on the client's own screen, so it can
-- never carry a disclosed impact and always downgrades to a proposal.
CREATE OR REPLACE FUNCTION public._accept_trade_scope_authorized(
  p_proposal_id uuid,
  p_signed_name text,
  p_client_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := p_client_id;
  v_proposal public.proposals%ROWTYPE;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_previous_progress text := current_setting('app.trade_scope_progress_id', true);
  v_project_id uuid;        -- 00475
  v_milestone_id uuid;      -- 00475
BEGIN
  IF v_actor IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'trade scope acceptance requires an authenticated client and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.document_kind <> 'trade_scope'
     OR v_proposal.client_id IS DISTINCT FROM v_actor
  THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_terms FROM public.trade_scope_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  IF v_terms.progress_state = 'accepted' THEN
    RETURN jsonb_build_object('proposalId', p_proposal_id,
      'progressState', v_terms.progress_state,
      'acceptedAt', v_terms.accepted_at,
      'acceptedSignedName', v_terms.accepted_signed_name,
      'acceptanceFingerprint', v_terms.acceptance_fingerprint,
      'changed', false);
  END IF;
  IF v_terms.progress_state <> 'substantially_complete' THEN
    RAISE EXCEPTION 'a trade scope must be substantially complete before the client accepts it'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.trade_scope_progress_id', p_proposal_id::text, true);
  UPDATE public.trade_scope_terms SET
    progress_state = 'accepted',
    accepted_at = now(),
    accepted_by = v_actor,
    accepted_signed_name = v_name,
    acceptance_fingerprint = public._commercial_document_fingerprint(p_proposal_id)
  WHERE proposal_id = p_proposal_id RETURNING * INTO v_terms;
  PERFORM set_config('app.trade_scope_progress_id', COALESCE(v_previous_progress, ''), true);

  -- 00475 (R109 ceremony class, R110 downgrade by construction): acceptance
  -- proposes the thread-completion milestone's date. Client-side act — nothing
  -- here stated a schedule impact, so it proposes and never pins.
  SELECT d.project_id INTO v_project_id
  FROM public.project_commercial_documents d
  WHERE d.proposal_id = p_proposal_id;
  IF v_project_id IS NOT NULL THEN
    v_milestone_id := public._schedule_thread_completion_milestone(v_project_id);
    IF v_milestone_id IS NOT NULL THEN
      PERFORM public._commit_schedule_edit_authorized(
        v_project_id,
        jsonb_build_array(jsonb_build_object(
          'kind', 'milestone-anchor',
          'milestone_id', v_milestone_id,
          'anchor_date', to_char(v_terms.accepted_at::date, 'YYYY-MM-DD'),
          'source_ref', p_proposal_id
        )),
        'Trade scope accepted',
        NULL,
        'ceremony:trade-scope-accepted'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('proposalId', p_proposal_id,
    'progressState', v_terms.progress_state,
    'acceptedAt', v_terms.accepted_at,
    'acceptedBy', v_terms.accepted_by,
    'acceptedSignedName', v_terms.accepted_signed_name,
    'acceptanceFingerprint', v_terms.acceptance_fingerprint,
    'changed', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.trade_scope_progress_id', COALESCE(v_previous_progress, ''), true);
  RAISE;
END;
$$;
REVOKE ALL ON FUNCTION public._accept_trade_scope_authorized(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 6 — Trade acceptance recorded on paper
--
-- record_paper_trade_acceptance (head 00425:1094, sole definition) body
-- VERBATIM plus the same graft the digital acceptance body got. It is an
-- independent copy of _accept_trade_scope_authorized, not a wrapper, so
-- grafting one and not the other would make the same client act propose or
-- not depending on where it was signed.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.record_paper_trade_acceptance(
  p_proposal_id uuid,
  p_signed_name text,
  p_paper_signed_on date,
  p_scan_document_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- 00425 DELTA 1 (actor). accepted_by stays the CLIENT — they accepted the
  -- work, on paper. v_recorder is the studio author writing it down.
  v_actor uuid;
  v_recorder uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_terms public.trade_scope_terms%ROWTYPE;
  v_name text := btrim(COALESCE(p_signed_name, ''));
  v_previous_progress text := current_setting('app.trade_scope_progress_id', true);
  v_project_id uuid;        -- 00475
  v_milestone_id uuid;      -- 00475
BEGIN
  IF v_recorder IS NULL OR char_length(v_name) < 2 THEN
    RAISE EXCEPTION 'recording a paper trade scope acceptance requires an authenticated studio author and legal name'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO v_proposal FROM public.proposals WHERE id = p_proposal_id FOR UPDATE;
  IF NOT FOUND OR v_proposal.document_kind <> 'trade_scope'
     OR NOT public._can_author_proposal(v_proposal.designer_id)
     OR v_proposal.client_id IS NULL
  THEN
    RAISE EXCEPTION 'trade scope % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  v_actor := v_proposal.client_id;
  -- 00425 DELTA 2 (terminal). A retired or declined instrument is not a thing
  -- a paper acceptance can be recorded against.
  IF COALESCE(v_proposal.commercial_state, 'draft') IN ('superseded', 'declined') THEN
    RAISE EXCEPTION 'trade scope % is % and can no longer be recorded on paper',
      p_proposal_id, v_proposal.commercial_state
      USING ERRCODE = 'check_violation';
  END IF;
  -- The same helper the signature rails use, given the same three facts: the
  -- date must be there and not invented, and a scan pointer must belong to THIS
  -- document. One validation, four acts.
  PERFORM public._assert_paper_provenance(
    p_proposal_id, p_paper_signed_on, p_scan_document_id
  );
  SELECT * INTO v_terms FROM public.trade_scope_terms
  WHERE proposal_id = p_proposal_id FOR UPDATE;
  IF v_terms.progress_state = 'accepted' THEN
    RETURN jsonb_build_object('proposalId', p_proposal_id,
      'progressState', v_terms.progress_state,
      'acceptedAt', v_terms.accepted_at,
      'acceptedSignedName', v_terms.accepted_signed_name,
      'acceptanceFingerprint', v_terms.acceptance_fingerprint,
      'acceptedOnPaper', v_terms.accepted_on_paper,
      'acceptanceScanDocumentId', v_terms.acceptance_scan_document_id,
      'changed', false);
  END IF;
  IF v_terms.progress_state <> 'substantially_complete' THEN
    RAISE EXCEPTION 'a trade scope must be substantially complete before the client accepts it'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM set_config('app.trade_scope_progress_id', p_proposal_id::text, true);
  UPDATE public.trade_scope_terms SET
    progress_state = 'accepted',
    -- 00425 DELTA 3 (paper stamps). accepted_at becomes the date on the paper,
    -- not the moment of typing; accepted_on_paper and acceptance_recorded_by
    -- say who wrote it down; acceptance_scan_document_id is the page itself.
    -- All three new columns move only under the progress GUC.
    accepted_at = p_paper_signed_on::timestamptz,
    accepted_by = v_actor,
    accepted_signed_name = v_name,
    acceptance_fingerprint = public._commercial_document_fingerprint(p_proposal_id),
    accepted_on_paper = true,
    acceptance_recorded_by = v_recorder,
    acceptance_scan_document_id = p_scan_document_id
  WHERE proposal_id = p_proposal_id RETURNING * INTO v_terms;
  PERFORM set_config('app.trade_scope_progress_id', COALESCE(v_previous_progress, ''), true);

  -- 00475 (R109 ceremony class): the client's acceptance, recorded. It is the
  -- client's act either way, so it proposes the thread-completion date and
  -- never pins it — the same downgrade the digital rail takes.
  SELECT d.project_id INTO v_project_id
  FROM public.project_commercial_documents d
  WHERE d.proposal_id = p_proposal_id;
  IF v_project_id IS NOT NULL THEN
    v_milestone_id := public._schedule_thread_completion_milestone(v_project_id);
    IF v_milestone_id IS NOT NULL THEN
      PERFORM public._commit_schedule_edit_authorized(
        v_project_id,
        jsonb_build_array(jsonb_build_object(
          'kind', 'milestone-anchor',
          'milestone_id', v_milestone_id,
          'anchor_date', to_char(p_paper_signed_on, 'YYYY-MM-DD'),
          'source_ref', p_proposal_id
        )),
        'Trade scope accepted',
        NULL,
        'ceremony:trade-scope-accepted'
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('proposalId', p_proposal_id,
    'progressState', v_terms.progress_state,
    'acceptedAt', v_terms.accepted_at,
    'acceptedBy', v_terms.accepted_by,
    'acceptedSignedName', v_terms.accepted_signed_name,
    'acceptanceFingerprint', v_terms.acceptance_fingerprint,
    'acceptedOnPaper', v_terms.accepted_on_paper,
    'acceptanceRecordedBy', v_terms.acceptance_recorded_by,
    'acceptanceScanDocumentId', v_terms.acceptance_scan_document_id,
    'changed', true);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.trade_scope_progress_id', COALESCE(v_previous_progress, ''), true);
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.record_paper_trade_acceptance(uuid, text, date, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_paper_trade_acceptance(uuid, text, date, uuid)
  TO authenticated;
