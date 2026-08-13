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
--   3. _commit_schedule_edit_authorized re-cut — phase-anchor learns an
--      explicit null-as-clear, and a proposal learns to propose an unpin.
--   4. hold / confirm / release — the three faces of the ceremony.
--
-- Lineage of every redefined body (grep|sort|tail verified at authoring):
--   _commit_schedule_edit_authorized ... 00326:681 (as commit_schedule_edit)
--                                        → 00475:208 → 00476
--
-- Contract extension (I126, "releasing a confirmed window unpins WITH
-- disclosed impact"):
--   · phase-anchor already cleared an anchor when `anchor_date` resolved to
--     NULL, but it could not tell an explicit clear from a malformed edit that
--     simply omitted the key. It now REQUIRES the key to be present and reads
--     an explicit JSON null as the clear — the same rigor milestone-anchor
--     carries, which raises on a null date because a milestone pin has no
--     unpin ceremony behind it.
--   · schedule_proposals.proposed_anchor_date drops NOT NULL. A release that
--     could not state its impact has to propose the REMOVAL of an anchor, and
--     a removal has no date. NULL there means exactly that; such a row is
--     dismissible but not committable, the posture 00475 already established
--     for a proposal with no identifiable target.
--
-- Security shape: the three RPCs are SECURITY DEFINER over a comember guard,
-- exactly like the ceremonies 00475 re-cut. The anchor itself is never written
-- here — it travels _commit_schedule_edit_authorized, so R110's downgrade and
-- the revision cut are the same code for an install window as for a signature.
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
SET search_path TO 'public'
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
-- PART 3 — the commit door learns to unpin
--
-- Body VERBATIM from 00475:208, with two grafts, both named in the banner:
--   · phase-anchor requires its `anchor_date` key and reads an explicit null
--     as a clear;
--   · the proposal branch carries a null proposed date (the proposed unpin).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.schedule_proposals
  ALTER COLUMN proposed_anchor_date DROP NOT NULL;

COMMENT ON COLUMN public.schedule_proposals.proposed_anchor_date IS
  'The date proposed for the target. NULL proposes the REMOVAL of the '
  'target''s anchor (00476, I126 release semantics) — a proposal with no date '
  'is dismissible but not committable, the same posture as a proposal with no '
  'identifiable target.';

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
SET search_path TO 'public'
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
  v_ceremony       BOOLEAN := COALESCE(p_source, 'manual') LIKE 'ceremony:%';
  v_source_event   TEXT;
BEGIN
  IF p_edits IS NULL OR jsonb_typeof(p_edits) <> 'array' THEN
    RAISE EXCEPTION 'p_edits must be a JSON array of edit objects';
  END IF;

  -- R110, enforced server-side so a UI bug cannot become a quiet hardening:
  -- a ceremony that could not state its schedule impact PROPOSES. It does not
  -- write an anchor and it does not cut a revision.
  IF v_ceremony AND p_disclosed_impact IS NULL THEN
    v_source_event := substr(p_source, 10);
    FOR v_edit IN SELECT * FROM jsonb_array_elements(p_edits)
    LOOP
      v_kind := v_edit->>'kind';
      IF v_kind = 'phase-anchor' THEN
        -- An absent key is a malformed edit, never a proposed unpin (00476).
        IF NOT (v_edit ? 'anchor_date') THEN
          RAISE EXCEPTION 'phase-anchor edit requires an anchor_date key (null clears the anchor)';
        END IF;
        INSERT INTO public.schedule_proposals (
          project_id, source_event, source_ref, target_phase_id,
          proposed_anchor_date, disclosed_context
        ) VALUES (
          p_project_id, v_source_event,
          NULLIF(v_edit->>'source_ref', '')::uuid,
          NULLIF(v_edit->>'phase_id', '')::uuid,
          (v_edit->>'anchor_date')::date,
          v_edit->'context'
        ) ON CONFLICT DO NOTHING;

      ELSIF v_kind = 'milestone-anchor' THEN
        INSERT INTO public.schedule_proposals (
          project_id, source_event, source_ref, target_milestone_id,
          proposed_anchor_date, disclosed_context
        ) VALUES (
          p_project_id, v_source_event,
          NULLIF(v_edit->>'source_ref', '')::uuid,
          NULLIF(v_edit->>'milestone_id', '')::uuid,
          (v_edit->>'anchor_date')::date,
          v_edit->'context'
        ) ON CONFLICT DO NOTHING;

      ELSE
        RAISE EXCEPTION '_commit_schedule_edit_authorized: a ceremony may only propose an anchor, not %', v_kind;
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

      -- 00476: the key must be PRESENT. An explicit null clears the anchor —
      -- the unpin half of I126's release semantics — while an omitted key is
      -- a malformed edit that must never silently unpin a committed date.
      IF NOT (v_edit ? 'anchor_date') THEN
        RAISE EXCEPTION 'phase-anchor edit requires an anchor_date key (null clears the anchor)';
      END IF;
      v_anchor_date := (v_edit->>'anchor_date')::date;

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

      IF v_anchor_date IS NULL THEN
        RAISE EXCEPTION 'milestone-anchor edit requires an anchor_date (milestone %)', v_milestone_id;
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

  IF p_disclosed_impact IS NULL THEN
    v_new_v := cut_schedule_revision(p_project_id, p_reason);
  ELSE
    -- The revision carries what the ceremony said before it was confirmed.
    v_new_v := cut_schedule_revision(
      p_project_id,
      COALESCE(p_reason, 'Schedule revised') || ' · impact stated: ' ||
      COALESCE(NULLIF(p_disclosed_impact->>'sentence', ''), p_disclosed_impact::text)
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
  'NULL without touching an anchor. 00476: phase-anchor requires its '
  'anchor_date key and reads an explicit null as a CLEAR, so a release can '
  'unpin through this same door (I126). Zero grants by design: service_role '
  'included, so an operational fact can only ever propose.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 4 — the ceremony: hold, confirm, release
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.hold_install_window(
  p_project_id uuid,
  p_starts_on  date,
  p_ends_on    date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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
SET search_path TO 'public'
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
      'context',     p_disclosed_impact
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
SET search_path TO 'public'
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
        'kind',        'phase-anchor',
        'phase_id',    v_window.phase_id,
        'anchor_date', NULL,
        'source_ref',  v_window.id,
        'context',     p_disclosed_impact
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
  'states the effect of removing the date and cuts a revision. A NULL '
  'p_disclosed_impact downgrades that unpin to a proposal (a proposal with no '
  'date proposes the removal). Releasing a held window is a state flip only.';
