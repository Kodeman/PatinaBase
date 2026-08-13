-- ═══════════════════════════════════════════════════════════════════════════
-- 00476 — install_windows (R112, I126)
--
-- Wave 3 of the Direction A schedule-fidelity program, and the package's only
-- schema request. "The date itself remains anchor_date; only the evidence of
-- commitment is new."
--
-- Parts
--   1. install_windows — the evidence of commitment, with RLS in this file.
--   2. _install_window_phase — the phase an install window anchors.
--   3. hold / confirm / release — the three faces of the ceremony.
--   4. guard_schedule_proposal_ratchet — a one-line correction to 00475.
--
-- Redefines the commit door NOWHERE. 00476 adds a table, a selector and three
-- RPCs; every anchor it moves travels 00475's
-- _commit_schedule_edit_authorized untouched.
-- That door already carries both extensions I126 needs, so re-cutting it here
-- would only reintroduce the pre-fix body:
--   · `"clear": true` is the explicit unpin marker on BOTH phase-anchor and
--     milestone-anchor (00475 PART 3). A bare or null date without the marker
--     raises — an unpin is an act, not an omission — so release_install_window
--     sends the marker and never a null date.
--   · schedule_proposals.proposed_anchor_date is already nullable (00475
--     PART 1) precisely so an undisclosed release can propose the REMOVAL of
--     an anchor. Such a row is dismissible but not committable, the posture
--     00475 established for a proposal with no identifiable target.
--   · source_event's CHECK already enumerates install-window-confirmed and
--     install-window-released, so the downgrade lands instead of raising 23514.
--
-- The one thing 00476 does correct in 00475 is PART 4, and it is not about
-- install windows: 00475's live-proposal upsert refreshes source_ref while
-- 00475's ratchet froze it, so ANY second act re-proposing on the same
-- (project, target, event) raised instead of refreshing the standing nag —
-- two po-sends on one phase, as readily as two install windows.
--
-- Security shape: the three RPCs are SECURITY DEFINER over a comember guard,
-- exactly like the ceremonies 00475 re-cut, and carry the same
-- `search_path = public, pg_temp`. The anchor itself is never written here —
-- it travels _commit_schedule_edit_authorized, so R110's downgrade and the
-- revision cut are the same code for an install window as for a signature.
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — install_windows
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.install_windows (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  phase_id         uuid REFERENCES public.project_phases(id) ON DELETE SET NULL,
  starts_on        date NOT NULL,
  ends_on          date NOT NULL,
  state            text NOT NULL DEFAULT 'held'
                     CHECK (state IN ('held', 'confirmed', 'released')),
  held_until       timestamptz,
  held_by          uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirmed_at     timestamptz,
  confirmed_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  released_at      timestamptz,
  released_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  disclosed_impact jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.install_windows
    ADD CONSTRAINT install_windows_span CHECK (ends_on >= starts_on);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- One window stands at a time. A released window is history and never blocks.
CREATE UNIQUE INDEX IF NOT EXISTS idx_install_windows_live
  ON public.install_windows (project_id)
  WHERE state <> 'released';

CREATE INDEX IF NOT EXISTS idx_install_windows_project_state
  ON public.install_windows (project_id, state, starts_on);

ALTER TABLE public.install_windows ENABLE ROW LEVEL SECURITY;

-- Studio read/write, mirroring 00316's project_phases_studio_rw exactly.
-- TO authenticated is load-bearing: is_studio_comember is REVOKEd from anon
-- (00315), so an unscoped policy would 42501 for anon.
DROP POLICY IF EXISTS install_windows_studio_rw ON public.install_windows;
CREATE POLICY install_windows_studio_rw
  ON public.install_windows FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = install_windows.project_id
        AND public.is_studio_comember(p.designer_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = install_windows.project_id
        AND public.is_studio_comember(p.designer_id)
    )
  );

-- R101 / O10: a HELD window is a studio thought, not a promise. Only the
-- confirmed one crosses.
DROP POLICY IF EXISTS install_windows_client_select ON public.install_windows;
CREATE POLICY install_windows_client_select
  ON public.install_windows FOR SELECT TO authenticated
  USING (
    state = 'confirmed'
    AND EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = install_windows.project_id
        AND p.client_id = auth.uid()
    )
  );

REVOKE ALL ON TABLE public.install_windows FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.install_windows TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.install_windows TO service_role;

COMMENT ON TABLE public.install_windows IS
  'R112: the install week''s commitment act. The date itself remains '
  'project_phases.anchor_date — this table is the EVIDENCE of commitment: '
  'which window was held, when it was confirmed, what impact was stated at '
  'that moment, and when it was released. Studio read/write; a client sees '
  'only the confirmed window (R101, O10 open).';
COMMENT ON COLUMN public.install_windows.disclosed_impact IS
  'R110 evidence — what the ceremony stated before it was confirmed. NULL '
  'means the effect could not be computed, and the confirmation downgraded to '
  'a schedule_proposals row rather than writing the anchor.';
COMMENT ON COLUMN public.install_windows.phase_id IS
  'The phase the anchor lands on. Resolved and stamped at confirmation when '
  'the hold did not name one, so a later release unpins exactly what the '
  'confirmation pinned.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — target selection
--
-- Same shape as 00475's three selectors: zero-grant, reachable only inside a
-- SECURITY DEFINER call chain. NULL means "no identifiable target" and the
-- ceremony still runs.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._install_window_phase(p_project_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    (SELECT ph.id
       FROM public.project_phases ph
      WHERE ph.project_id = p_project_id AND ph.phase_key = 'installation'
      ORDER BY ph.sort_order, ph.id
      LIMIT 1),
    (SELECT ph.id
       FROM public.project_phases ph
      WHERE ph.project_id = p_project_id AND ph.lane = 'main'
      ORDER BY ph.sort_order DESC, ph.id DESC
      LIMIT 1)
  );
$$;
REVOKE ALL ON FUNCTION public._install_window_phase(uuid)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._install_window_phase(uuid) IS
  'The phase an install window anchors: the project''s installation phase, or '
  'failing that the last main-lane phase — install is where the main lane '
  'ends. NULL when the chain has no main lane at all, which downgrades the '
  'confirmation to a proposal with no target rather than failing it.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 3 — the ceremony: hold, confirm, release
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.hold_install_window(
  p_project_id uuid,
  p_starts_on  date,
  p_ends_on    date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid := auth.uid();
  v_live   public.install_windows%ROWTYPE;
  v_id     uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'hold_install_window: no authenticated actor';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND public.is_studio_comember(designer_id)
  ) THEN
    RAISE EXCEPTION 'project % not found or not owned by caller', p_project_id;
  END IF;

  IF p_starts_on IS NULL OR p_ends_on IS NULL THEN
    RAISE EXCEPTION 'hold_install_window: a window needs both a start and an end';
  END IF;
  IF p_ends_on < p_starts_on THEN
    RAISE EXCEPTION 'hold_install_window: the window ends (%) before it starts (%)', p_ends_on, p_starts_on;
  END IF;

  -- The partial unique index is the real guard; this reads it back as a
  -- sentence naming the window that already stands.
  SELECT * INTO v_live FROM public.install_windows
   WHERE project_id = p_project_id AND state <> 'released'
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION
      'an install window is already % on this project (% – %) — release it before holding another',
      v_live.state, v_live.starts_on, v_live.ends_on;
  END IF;

  -- No anchor write: a hold is not a commitment (R112).
  INSERT INTO public.install_windows (project_id, starts_on, ends_on, state, held_by)
  VALUES (p_project_id, p_starts_on, p_ends_on, 'held', v_actor)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.hold_install_window(uuid, date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.hold_install_window(uuid, date, date) TO authenticated;

COMMENT ON FUNCTION public.hold_install_window(uuid, date, date) IS
  'R112: hold a window. Writes no anchor and cuts no revision — a hold is not '
  'a commitment, and nothing outside the studio can see it. One window stands '
  'per project; a second is refused by name.';

CREATE OR REPLACE FUNCTION public.confirm_install_window(
  p_window_id        uuid,
  p_disclosed_impact jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor    uuid := auth.uid();
  v_window   public.install_windows%ROWTYPE;
  v_phase_id uuid;
  v_impact   jsonb := p_disclosed_impact;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'confirm_install_window: no authenticated actor';
  END IF;

  SELECT * INTO v_window FROM public.install_windows WHERE id = p_window_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'install window % not found', p_window_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = v_window.project_id AND public.is_studio_comember(designer_id)
  ) THEN
    RAISE EXCEPTION 'install window % not found', p_window_id;
  END IF;

  IF v_window.state <> 'held' THEN
    RAISE EXCEPTION 'install window % is % — only a held window can be confirmed', p_window_id, v_window.state;
  END IF;

  v_phase_id := COALESCE(v_window.phase_id, public._install_window_phase(v_window.project_id));

  -- No phase to land on: the confirmation still stands, but it can only
  -- propose. Forcing the NULL-impact branch records a targetless proposal
  -- (dismissible, never committable) instead of failing the ceremony.
  IF v_phase_id IS NULL THEN
    v_impact := NULL;
  END IF;

  PERFORM public._commit_schedule_edit_authorized(
    v_window.project_id,
    jsonb_build_array(jsonb_build_object(
      'kind',        'phase-anchor',
      'phase_id',    v_phase_id,
      'anchor_date', v_window.starts_on,
      'source_ref',  v_window.id,
      -- Never a bare NULL: the proposal branch merges `context` into the
      -- disclosed_context object, and a JSON null there concatenates into an
      -- array instead of an object.
      'context',     COALESCE(p_disclosed_impact, '{}'::jsonb)
    )),
    'Install window confirmed',
    v_impact,
    'ceremony:install-window-confirmed'
  );

  UPDATE public.install_windows
     SET state            = 'confirmed',
         phase_id         = v_phase_id,
         confirmed_at     = now(),
         confirmed_by     = v_actor,
         disclosed_impact = p_disclosed_impact
   WHERE id = p_window_id;

  RETURN p_window_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_install_window(uuid, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.confirm_install_window(uuid, jsonb) TO authenticated;

COMMENT ON FUNCTION public.confirm_install_window(uuid, jsonb) IS
  'R112/R110: confirm a held window. The window''s start becomes the install '
  'phase''s anchor through _commit_schedule_edit_authorized, so one revision '
  'is cut and the stated impact rides into its reason. A NULL '
  'p_disclosed_impact downgrades to a schedule_proposals row (R110) and the '
  'window still confirms — the evidence of commitment and the date memory are '
  'two records with two jobs.';

CREATE OR REPLACE FUNCTION public.release_install_window(
  p_window_id        uuid,
  p_reason           text,
  p_disclosed_impact jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor  uuid := auth.uid();
  v_window public.install_windows%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'release_install_window: no authenticated actor';
  END IF;

  SELECT * INTO v_window FROM public.install_windows WHERE id = p_window_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'install window % not found', p_window_id;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = v_window.project_id AND public.is_studio_comember(designer_id)
  ) THEN
    RAISE EXCEPTION 'install window % not found', p_window_id;
  END IF;

  IF v_window.state = 'released' THEN
    RAISE EXCEPTION 'install window % is already released', p_window_id;
  END IF;

  -- I126: releasing a CONFIRMED window unpins the anchor, and the unpinning
  -- discloses its impact like any other movement. Releasing a merely held
  -- window is bookkeeping — nothing was ever pinned.
  IF v_window.state = 'confirmed' AND v_window.phase_id IS NOT NULL THEN
    PERFORM public._commit_schedule_edit_authorized(
      v_window.project_id,
      jsonb_build_array(jsonb_build_object(
        'kind',       'phase-anchor',
        'phase_id',   v_window.phase_id,
        -- The unpin is stated, never implied: 00475's door raises on a bare or
        -- null date and takes `"clear": true` as the whole act. It is also why
        -- a release is never read as contradicting the anchor it removes.
        'clear',      true,
        'source_ref', v_window.id,
        'context',    COALESCE(p_disclosed_impact, '{}'::jsonb)
      )),
      COALESCE(NULLIF(btrim(p_reason), ''), 'Install window released'),
      p_disclosed_impact,
      'ceremony:install-window-released'
    );
  END IF;

  UPDATE public.install_windows
     SET state       = 'released',
         released_at = now(),
         released_by = v_actor
   WHERE id = p_window_id;

  RETURN p_window_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_install_window(uuid, text, jsonb) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.release_install_window(uuid, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.release_install_window(uuid, text, jsonb) IS
  'R112/I126: release a window. A confirmed window''s release unpins the '
  'anchor WITH a disclosed impact — release is itself a small ceremony that '
  'states the effect of removing the date and cuts a revision. The unpin '
  'travels 00475''s door as an explicit `"clear": true` edit, never a null '
  'date, so it is neither mistaken for a malformed edit nor read as '
  'contradicting the anchor it removes. A NULL p_disclosed_impact downgrades '
  'that unpin to a proposal (a dateless proposal proposes the removal). '
  'Releasing a held window is a state flip only.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4 — guard_schedule_proposal_ratchet, corrected
--
-- Lineage: 00475 (first cut) → 00476. Body VERBATIM from 00475 but for one
-- name dropped from the immutable set.
--
-- 00475 gave the live-proposal upsert `source_ref = EXCLUDED.source_ref` and
-- gave the ratchet `NEW.source_ref IS DISTINCT FROM OLD.source_ref` as a
-- forgery guard. The two disagree, and the ratchet wins: the moment a SECOND
-- act re-proposes on the same (project, target, source_event) the upsert
-- fires, the trigger raises, and the ceremony that should have refreshed a
-- standing nag fails outright. Two purchase orders released against one phase
-- reach it; so does a second install window's undisclosed release (I126).
--
-- What a proposal NAMES is its project, its target and its act — the exact
-- triple the live-unique indexes key on, and the triple that must never be
-- rewritten. source_ref points at WHICH occurrence of that act is currently
-- speaking, and a later occurrence carrying a better date is precisely what
-- the ratchet's own "only the fact itself may be refreshed" contemplates. It
-- belongs with proposed_anchor_date, not with the identity.
--
-- Still frozen: project_id, source_event, both targets, created_at — and the
-- resolution stamps are still derived here, never taken from the caller.
-- ═══════════════════════════════════════════════════════════════════════════

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
     OR NEW.target_phase_id IS DISTINCT FROM OLD.target_phase_id
     OR NEW.target_milestone_id IS DISTINCT FROM OLD.target_milestone_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'what a schedule proposal names is fixed at the act'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.state = 'proposed' THEN
    -- Still live: only the fact itself may be refreshed (a later send or
    -- delivery carries a better date, and names itself in source_ref).
    -- Resolution stamps stay empty.
    NEW.resolved_at := NULL;
    NEW.resolved_by := NULL;
    RETURN NEW;
  END IF;
  NEW.resolved_at := now();
  NEW.resolved_by := auth.uid();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_schedule_proposal_ratchet() IS
  'I130''s ratchet. A resolved proposal is history; a live one may be '
  'refreshed by a later occurrence of the same act, source_ref included — '
  '00475 froze source_ref, which deadlocked its own live-proposal upsert. '
  'What stays fixed is what the proposal NAMES: project, target, act. '
  'resolved_at/resolved_by are derived here, never taken from the caller.';
