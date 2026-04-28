-- ============================================================================
-- 00086: activate_project_v2 RPC
-- One-shot create for the 7-step Activation Wizard. Mirrors the cascading
-- insert pattern from 00066's activate_proposal_as_project, but driven from
-- a JSONB payload (no proposal required).
--
-- Input shape (all fields optional except `name`):
--   {
--     "name": "...",
--     "client_id": "<uuid>" | null,
--     "lead_designer_id": "<uuid>" | null,        // defaults to caller
--     "studio_id": "<uuid>" | null,
--     "client_visibility_tier": "full" | "milestone" | "curated",
--     "kickoff_date": "YYYY-MM-DD",                // defaults to today
--     "budget_total_cents": <int>,
--     "design_fee_cents": <int>,
--     "rooms": [{ "name", "room_type", "dimensions", "budget_cents",
--                 "ffe_categories": [text...], "notes", "sort_order" }],
--     "phases": [{ "name", "duration_weeks", "fee_cents", "gate_condition",
--                  "sort_order" }],
--     "milestones": [{ "label", "percentage", "amount_cents",
--                      "trigger_condition", "sort_order" }],
--     "team": [{ "user_id": "<uuid>", "role": "support_designer" | ... }]
--   }
--
-- Returns: the new project's UUID.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.activate_project_v2(input jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_project_id uuid;
  v_caller_id uuid := auth.uid();
  v_room jsonb;
  v_phase jsonb;
  v_milestone jsonb;
  v_team jsonb;
  v_kickoff date;
  v_expected_completion date;
  v_total_weeks int := 0;
  v_phase_running_date date;
  v_phase_idx int := 0;
  v_room_idx int := 0;
  v_milestone_idx int := 0;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'activate_project_v2: not authenticated';
  END IF;

  IF coalesce(trim(input->>'name'), '') = '' THEN
    RAISE EXCEPTION 'activate_project_v2: name is required';
  END IF;

  v_kickoff := COALESCE((input->>'kickoff_date')::date, CURRENT_DATE);
  SELECT COALESCE(SUM((p->>'duration_weeks')::int), 0)
    INTO v_total_weeks
    FROM jsonb_array_elements(COALESCE(input->'phases', '[]'::jsonb)) p;
  v_expected_completion := v_kickoff + (v_total_weeks * 7);

  -- 1. Project row
  -- Note: lead_designer_id, kickoff_date, expected_completion_date are
  -- generated columns mirroring designer_id, start_date, target_end_date.
  INSERT INTO public.projects (
    name, status, budget_cents, design_fee_cents,
    client_visibility_tier, client_id, designer_id, studio_id,
    start_date, target_end_date,
    created_by
  ) VALUES (
    input->>'name',
    'active',
    COALESCE((input->>'budget_total_cents')::int, 0),
    COALESCE((input->>'design_fee_cents')::int, 0),
    COALESCE(input->>'client_visibility_tier', 'milestone'),
    NULLIF(input->>'client_id', '')::uuid,
    v_caller_id,
    NULLIF(input->>'studio_id', '')::uuid,
    v_kickoff,
    v_expected_completion,
    v_caller_id
  )
  RETURNING id INTO v_project_id;

  -- 2. Rooms
  FOR v_room IN SELECT * FROM jsonb_array_elements(COALESCE(input->'rooms', '[]'::jsonb)) LOOP
    INSERT INTO public.project_rooms (
      project_id, name, room_type, dimensions, budget_cents, ffe_categories, notes, sort_order
    ) VALUES (
      v_project_id,
      v_room->>'name',
      NULLIF(v_room->>'room_type', ''),
      NULLIF(v_room->>'dimensions', ''),
      COALESCE((v_room->>'budget_cents')::int, 0),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_room->'ffe_categories', '[]'::jsonb))),
      NULLIF(v_room->>'notes', ''),
      COALESCE((v_room->>'sort_order')::int, v_room_idx)
    );
    v_room_idx := v_room_idx + 1;
  END LOOP;

  -- 3. Phases (with running start/end date calculation)
  v_phase_running_date := v_kickoff;
  FOR v_phase IN SELECT * FROM jsonb_array_elements(COALESCE(input->'phases', '[]'::jsonb)) LOOP
    INSERT INTO public.project_phases (
      project_id, name, duration_weeks, fee_cents, gate_condition,
      start_date, target_end_date, sort_order
    ) VALUES (
      v_project_id,
      v_phase->>'name',
      COALESCE((v_phase->>'duration_weeks')::int, 0),
      COALESCE((v_phase->>'fee_cents')::int, 0),
      NULLIF(v_phase->>'gate_condition', ''),
      v_phase_running_date,
      v_phase_running_date + (COALESCE((v_phase->>'duration_weeks')::int, 0) * 7),
      COALESCE((v_phase->>'sort_order')::int, v_phase_idx)
    );
    v_phase_running_date := v_phase_running_date + (COALESCE((v_phase->>'duration_weeks')::int, 0) * 7);
    v_phase_idx := v_phase_idx + 1;
  END LOOP;

  -- 4. Milestones
  FOR v_milestone IN SELECT * FROM jsonb_array_elements(COALESCE(input->'milestones', '[]'::jsonb)) LOOP
    INSERT INTO public.project_payment_milestones (
      project_id, label, percentage, amount_cents, trigger_condition, sort_order
    ) VALUES (
      v_project_id,
      NULLIF(v_milestone->>'label', ''),
      COALESCE((v_milestone->>'percentage')::numeric, 0),
      COALESCE((v_milestone->>'amount_cents')::int, 0),
      NULLIF(v_milestone->>'trigger_condition', ''),
      COALESCE((v_milestone->>'sort_order')::int, v_milestone_idx)
    );
    v_milestone_idx := v_milestone_idx + 1;
  END LOOP;

  -- 5. Team — caller is always lead_designer; additional team members as provided
  INSERT INTO public.project_team_members (project_id, user_id, role, assigned_by)
  VALUES (v_project_id, v_caller_id, 'lead_designer', v_caller_id)
  ON CONFLICT DO NOTHING;

  FOR v_team IN SELECT * FROM jsonb_array_elements(COALESCE(input->'team', '[]'::jsonb)) LOOP
    IF NULLIF(v_team->>'user_id', '') IS NOT NULL THEN
      INSERT INTO public.project_team_members (project_id, user_id, role, assigned_by)
      VALUES (
        v_project_id,
        (v_team->>'user_id')::uuid,
        COALESCE(v_team->>'role', 'support_designer'),
        v_caller_id
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  RETURN v_project_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.activate_project_v2(jsonb) TO authenticated;
