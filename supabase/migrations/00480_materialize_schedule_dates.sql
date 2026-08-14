-- ═══════════════════════════════════════════════════════════════════════════
-- 00480 — materialize_schedule_dates (Date Instruments program, Lane C — data)
--
-- The Spine's resolver (packages/utils/src/schedule.ts) computes every
-- phase's effective start/end from the chain (duration/follows/anchor) —
-- that resolved date is what the UI draws. project_phases.start_date /
-- target_end_date are the LEGACY columns other surfaces (the Calendar Folio,
-- exports, anything that still SELECTs the row directly instead of running
-- the resolver) still read. Nothing kept those two in sync with the chain's
-- resolved output until now.
--
-- materialize_schedule_dates is a mirror, not a source of truth: it snapshots
-- the browser's freshly-resolved phase dates back onto the legacy columns
-- after every schedule-shaping write, so a legacy reader sees what the
-- resolver already shows. It never touches anchor_date, duration_days,
-- follows_phase_id or lane — those stay commit_schedule_edit's (00475)
-- domain exclusively; this RPC only ever writes start_date/target_end_date.
--
-- Same shape as 00475/00476: a zero-grant `_impl` SECURITY DEFINER function
-- reachable only through a thin public DEFINER wrapper carrying the exact
-- ownership guard commit_schedule_edit (00475) and hold_install_window
-- (00476) both use — the project's designer or a studio comember of the
-- designer, via public.is_studio_comember(designer_id).
--
-- The IS DISTINCT FROM guard in the _impl is load-bearing, not cosmetic:
-- update_project_phase's optimistic-concurrency contract treats
-- project_phases.updated_at as a CAS token (the ripple/chain hooks pass
-- p_expected_updated_at back to it), and project_phases is realtime-
-- published to every open Spine. A snapshot write that reproduces dates the
-- row already holds must not touch updated_at or emit a realtime change —
-- it would invalidate every other caller's CAS token and re-render every
-- open Spine for a no-op. Only a row whose start_date or target_end_date
-- actually differs is written, and the RETURNed integer is the count of rows
-- that actually changed — never jsonb_array_length(p_phases).
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 1 — _materialize_schedule_dates_impl (zero grants)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._materialize_schedule_dates_impl(
  p_project_id uuid,
  p_phases     jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_phase         jsonb;
  v_phase_id      uuid;
  v_start_date    date;
  v_target_end    date;
  v_rows_affected integer;
  v_total_changed integer := 0;
BEGIN
  IF p_phases IS NULL OR jsonb_typeof(p_phases) <> 'array' THEN
    RAISE EXCEPTION '_materialize_schedule_dates_impl: p_phases must be a JSON array of phase snapshots';
  END IF;

  FOR v_phase IN SELECT * FROM jsonb_array_elements(p_phases)
  LOOP
    IF jsonb_typeof(v_phase) <> 'object' THEN
      RAISE EXCEPTION '_materialize_schedule_dates_impl: each phase snapshot must be a JSON object';
    END IF;

    v_phase_id   := NULLIF(v_phase->>'phase_id', '')::uuid;
    v_start_date := NULLIF(v_phase->>'start_date', '')::date;
    v_target_end := NULLIF(v_phase->>'target_end_date', '')::date;

    IF v_phase_id IS NULL THEN
      RAISE EXCEPTION '_materialize_schedule_dates_impl: phase snapshot missing phase_id';
    END IF;

    -- IS DISTINCT FROM guard: see the banner. A snapshot that reproduces what
    -- the row already holds must not churn updated_at or fire realtime.
    UPDATE public.project_phases
       SET start_date      = v_start_date,
           target_end_date = v_target_end
     WHERE id = v_phase_id
       AND project_id = p_project_id
       AND (start_date IS DISTINCT FROM v_start_date
            OR target_end_date IS DISTINCT FROM v_target_end);

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;
    v_total_changed := v_total_changed + v_rows_affected;
  END LOOP;

  RETURN v_total_changed;
END;
$$;

REVOKE ALL ON FUNCTION public._materialize_schedule_dates_impl(uuid, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public._materialize_schedule_dates_impl(uuid, jsonb) IS
  'The private snapshot door. Zero grants by design — reachable only inside a '
  'SECURITY DEFINER call chain (materialize_schedule_dates). For each '
  '{"phase_id","start_date","target_end_date"} element, writes start_date/ '
  'target_end_date on the named project_phases row IFF project-scoped AND at '
  'least one value actually differs (the IS DISTINCT FROM guard — see 00480''s '
  'banner). Returns the count of rows actually changed, never the input length.';

-- ═══════════════════════════════════════════════════════════════════════════
-- PART 2 — materialize_schedule_dates, the thin public wrapper
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.materialize_schedule_dates(
  p_project_id uuid,
  p_phases     jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Same ownership guard as commit_schedule_edit (00475) and every
  -- install-window RPC (00476): the project's designer or a studio comember
  -- of the designer.
  IF NOT EXISTS (
    SELECT 1 FROM public.projects
    WHERE id = p_project_id AND public.is_studio_comember(designer_id)
  ) THEN
    RAISE EXCEPTION 'project % not found or not owned by caller', p_project_id;
  END IF;

  RETURN public._materialize_schedule_dates_impl(p_project_id, p_phases);
END;
$$;

COMMENT ON FUNCTION public.materialize_schedule_dates(uuid, jsonb) IS
  'Snapshots the resolver''s freshly-resolved phase start/end dates onto the '
  'legacy project_phases.start_date/target_end_date columns, under the same '
  'ownership guard commit_schedule_edit carries. Called by settleScheduleWrite '
  '(packages/supabase) after every schedule-shaping mutation; never touches '
  'anchor_date/duration_days/follows_phase_id/lane. Never the source of truth '
  '— the chain (00323) and the resolver (@patina/utils) remain that.';

-- service_role is revoked too, the same posture commit_schedule_edit (00475)
-- documents: this is the designer/portal client's derived-write door, and no
-- server-side actor has business calling it directly.
REVOKE ALL ON FUNCTION public.materialize_schedule_dates(uuid, jsonb)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.materialize_schedule_dates(uuid, jsonb) TO authenticated;
