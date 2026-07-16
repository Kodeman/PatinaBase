-- ═══════════════════════════════════════════════════════════════════════════
-- 00325 — Schedule COMMIT door (R100 "Editing: the ripple" — Slice 04, §T5)
--
-- Slices 01–03 (00323/00324) gave the Rule/Spine a resolver, a chain schema,
-- and compose (birth + append) write paths. Slice 04 previews a SINGLE time
-- edit against the resolver twice (schedule-ripple-derivation.ts, S4-1) and
-- shows the user one honest sentence before anything moves. This migration
-- is the ONE write path that act commits through: `commit_schedule_edit`
-- persists exactly the edit the ripple previewed, nothing more.
--
-- NEW function — no prior body, nothing to graft.
--
-- Contract: p_edits is a JSONB ARRAY of edit objects (the RippleProvider's
-- serialized `RipplePendingEdit`, see packages/supabase's
-- serializeRippleEditForRpc). Each element carries a `kind` discriminant and
-- the fields that kind needs, snake_case (the RPC boundary is snake_case;
-- the TS side is camelCase — see the serializer for the mapping):
--   phase-duration   { kind, phase_id, duration_days }
--     → project_phases.duration_days := duration_days
--   phase-anchor     { kind, phase_id, anchor_date }
--     → project_phases.anchor_date := anchor_date
--   milestone-offset { kind, milestone_id, phase_id, offset_days }
--     → schedule_milestones.phase_id := phase_id,
--       schedule_milestones.offset_days := offset_days,
--       schedule_milestones.anchor_date := NULL   -- see note below
--
-- Milestone-offset ALSO clears anchor_date. This is not in the ripple's pure
-- core signature by accident — schedule-ripple-derivation.ts's rippleDiff
-- already does the same thing when it applies a pending milestone-offset
-- edit to its clone (`anchorDate: null`), because the resolver's precedence
-- is anchorDate ?? offset: an anchored milestone's offset_days is otherwise
-- DEAD (the resolver reads the anchor and never looks at the offset), so
-- writing offset_days alone on a still-anchored row would silently commit a
-- number the resolver ignores. The Rule/Spine UI today only ever SENDS a
-- milestone-offset edit for an unanchored diamond (a slid milestone that
-- already rides its phase) — anchored diamonds are dragged via a different
-- path (unpin, then re-anchor, or stay pinned) — but this door has to be
-- coherent on its own terms, independent of which UI paths currently reach
-- it: any milestone-offset edit unpins, full stop, exactly mirroring
-- useUpdateScheduleMilestone's existing unpin affordance (chip unpin sets
-- anchorDate: null the same way, use-schedule-compose.ts).
--
-- Ownership + project-scoping: every mutated row must belong to
-- p_project_id, not merely to a project the caller owns. A batch naming a
-- phase/milestone that lives in a DIFFERENT project (even one the same
-- designer owns) raises instead of silently no-op'ing OR silently reaching
-- across — "foreign phases/milestones are unreachable" per the Slice 04
-- pin. The whole call is one statement: a raise anywhere in the loop aborts
-- the entire batch (Postgres rolls back everything the function did before
-- the raise), so a caller never sees a partially-applied commit.
--
-- SECURITY INVOKER (not DEFINER): the caller's own RLS still applies to
-- every UPDATE (project_phases / schedule_milestones both carry a
-- designer_id = auth.uid() / is_studio_comember(designer_id) policy per
-- 00066/00316) — this function's own ownership guard + project-scoped
-- WHEREs are a second, independent gate that turns "0 rows RLS-filtered
-- away" into a readable exception instead of a silent no-op, matching
-- 00324's seed_project_schedule_from_template / copy_schedule_as_built.
--
-- Return value: RETURNS uuid so the door's shape is stable across Slice 05,
-- which hooks in HERE (see the marked block below) to cut a numbered
-- schedule_revisions row (R100 "Memory") and return ITS id. Slice 04 writes
-- no schedule_revisions row — there is nothing yet to return an id FOR — so
-- today this returns p_project_id itself (a real, non-null uuid a caller
-- can log/assert against, rather than a free-floating gen_random_uuid()
-- that would look like a revision id and reference nothing).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.commit_schedule_edit(
  p_project_id UUID,
  p_edits      JSONB,
  p_reason     TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
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
BEGIN
  -- Ownership guard (schema-qualified auth.uid() — search_path is pinned to
  -- 'public' above, so auth.uid() must be schema-qualified regardless).
  IF NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND designer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'project % not found or not owned by caller', p_project_id;
  END IF;

  IF p_edits IS NULL OR jsonb_typeof(p_edits) <> 'array' THEN
    RAISE EXCEPTION 'p_edits must be a JSON array of edit objects';
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

    ELSE
      RAISE EXCEPTION 'commit_schedule_edit: unknown edit kind %', v_kind;
    END IF;
  END LOOP;

  -- ═══════════════════════════════════════════════════════════════════════
  -- Slice 05 hooks HERE.
  --
  -- Once the mutations above land, Slice 05 (R100 "Memory") cuts the next
  -- numbered schedule_revisions row for p_project_id: snapshot every
  -- project_phases row for the project into phase_snapshots, set
  -- v = next sequence for this project, actor = auth.uid(), reason =
  -- p_reason (already accepted as a parameter today, unused until then),
  -- and RETURN the new revision's id instead of p_project_id below.
  -- schedule_revisions is append-only / RPC-only-write (00323) specifically
  -- so this is the only place that ever inserts into it.
  -- ═══════════════════════════════════════════════════════════════════════

  RETURN p_project_id;
END;
$$;

COMMENT ON FUNCTION public.commit_schedule_edit(UUID, JSONB, TEXT) IS
  'The ripple''s commit door (Slice 04, R100). Applies a batch of previewed '
  'RipplePendingEdit objects (phase-duration/phase-anchor/milestone-offset) '
  'to project_phases/schedule_milestones under an ownership + project-scoped '
  'guard; unknown kinds raise. milestone-offset always clears anchor_date '
  '(an anchored milestone''s offset is otherwise dead per the resolver''s '
  'anchorDate??offset precedence). Returns p_project_id until Slice 05 wires '
  'schedule_revisions and returns the cut revision''s id instead (see the '
  'in-body "Slice 05 hooks HERE" block). p_reason is accepted now, unused '
  'until then.';

REVOKE EXECUTE ON FUNCTION public.commit_schedule_edit(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.commit_schedule_edit(UUID, JSONB, TEXT) TO authenticated;
