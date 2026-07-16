-- ═══════════════════════════════════════════════════════════════════════════
-- 00324 — Schedule COMPOSE: proposal-side chain, anchored proposal milestones,
--          the Patina Six template, two birth RPCs, and the activation regraft
--          that carries the chain into the project (package Slice 03, §1a–1e)
--
-- Slice 02 (00323) gave the PROJECT side the chain model (duration_days /
-- follows_phase_id / anchor_date / lane on project_phases + schedule_milestones
-- + schedule_revisions). Slice 03 gives the PROPOSAL side an ENTRY grammar and
-- the WRITE paths that feed the one time engine (resolveSchedule stays the only
-- resolver — plpgsql never computes the chain, R100). Purely additive DDL plus
-- two whole-body RPC regrafts from their LIVE heads.
--
-- 1a. proposal_phases += chain columns. Mirrors 00323's project_phases block
--     EXACTLY (duration_days INT · follows_phase_id self-fk ON DELETE SET NULL
--     with a no-self-follow CHECK + partial index · anchor_date DATE · lane
--     NOT NULL DEFAULT 'main' CHECK IN ('main','thread')). Precedence, anchors-
--     hold-under-ripple, and lane semantics are identical to the project side.
--
-- 1b. NEW proposal_schedule_milestones. The R101.3 invariant lives in the
--     schema: anchor_date is NOT NULL and there is NO offset_days column and NO
--     status column — a proposal milestone is a COMMITMENT the client signs
--     against, so it is always a hard date, never a working "at phase end"
--     offset. (The project-side schedule_milestones from 00323 is the opposite:
--     nullable anchor_date + offset_days + a status the resolver stamps.)
--     Activation translates one into the other (§1e). RLS mirrors
--     proposal_phases' CURRENT posture: designer-ALL joined through
--     proposal_phases→proposals designer_id=auth.uid(); client SELECT joined
--     through proposals client_id=auth.uid() AND status != 'draft'. It
--     DELIBERATELY OMITS a studio-comember leg — consistent with
--     proposal_phases, which also has none; widening both together is escalated
--     (§10), not done piecemeal here.
--
-- 1c. The Patina Six — one is_system phase_templates row, slug='patina_six'.
--     Each phase carries BOTH duration_weeks (legacy readers) and a new
--     duration_days key (chain truth). apply_phase_template (live head 00135,
--     SECURITY INVOKER — copied VERBATIM below) is regrafted with two surgical
--     deltas: (i) it now reads optional duration_days + lane keys when present;
--     (ii) it tracks the previously-inserted phase id and links each new phase
--     to it via follows_phase_id (a linear chain). Existing templates keep
--     working byte-for-byte (missing keys → duration_days NULL, lane→'main',
--     follows chain from the first appended phase; the resolver falls back to
--     duration_weeks*7 when duration_days is NULL).
--
-- 1d. TWO birth RPCs (SECURITY INVOKER, ownership-guarded, atomic). Both refuse
--     when the target already has phases (R100 — a schedule is never rebuilt):
--       · seed_project_schedule_from_template(project, slug) — apply_phase_
--         template's loop against project_phases with chain columns + a linear
--         follows chain.
--       · copy_schedule_as_built(source_project, target_proposal?, target_
--         project?) — exactly one target; per source phase (ORDER BY sort_order)
--         the as-built duration is the ACTUAL elapsed days when the source phase
--         carries real dates (GREATEST(1, COALESCE(completed_at::date,
--         target_end_date) - start_date)), else the planned fallback
--         (COALESCE(duration_days, duration_weeks*7, 14)); NO anchors; linear
--         follows chain.
--
-- 1e. activate_proposal_as_project regraft. The body below is 00279's body
--     VERBATIM — NOT 00274. 00279 is the LIVE HEAD (grep-confirmed: the last
--     CREATE OR REPLACE of this function); it re-applied the 00185 FF&E dual-
--     pricing repair that 00199 silently reverted, and grafting from 00274
--     would lose that fix a SECOND time (this exact hazard is documented in the
--     00323 banner). Three surgical changes, nothing else touched:
--       (1) Phase copy becomes TWO-PASS. Pass 1 INSERTs every project_phase with
--           follows_phase_id NULL, adding duration_days / anchor_date / lane to
--           the column list (source v_phase.*), building v_phase_map. Pass 2 is
--           a single UPDATE that remaps follows via v_phase_map — a chain link
--           may point at a later-sorted phase, and single-pass insertion cannot
--           resolve a forward reference.
--       (2) The legacy start/target cascade is KEPT but advances by
--           COALESCE(v_phase.duration_days, v_phase.duration_weeks*7, 14) (was
--           duration_weeks*7 only). These stored dates are a naive compat
--           approximation the gated Spine UI never reads (the resolver is
--           TS-only) — deliberately NOT a re-implementation of resolveSchedule.
--       (3) A NEW milestone loop after v_phase_map is complete: each
--           proposal_schedule_milestone (joined through the proposal's phases)
--           becomes a schedule_milestone with phase_id remapped through
--           v_phase_map, anchor_date/kind/name/sort_order carried, offset_days
--           NULL, and status 'upcoming'.
--     NO schedule_revisions write anywhere — the baseline cut is Slice 05.
--
-- Lineage of activate_proposal_as_project (body carried forward whole):
--   00140 → 00167 → 00180 → 00185 → 00199 → 00262 → 00269 → 00274 → 00279 → 00324
-- Lineage of apply_phase_template: 00135 → 00324.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1a. proposal_phases — chain columns (mirror 00323's project_phases) ──────

ALTER TABLE public.proposal_phases
  ADD COLUMN IF NOT EXISTS duration_days    INTEGER,
  ADD COLUMN IF NOT EXISTS follows_phase_id UUID REFERENCES public.proposal_phases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS anchor_date      DATE,
  ADD COLUMN IF NOT EXISTS lane             TEXT NOT NULL DEFAULT 'main'
    CHECK (lane IN ('main', 'thread'));

-- ADD CONSTRAINT has no IF NOT EXISTS in Postgres; guard with duplicate_object
-- (pattern: 00323's project_phases_no_self_follow) so reruns are safe.
DO $$ BEGIN
  ALTER TABLE public.proposal_phases
    ADD CONSTRAINT proposal_phases_no_self_follow
      CHECK (follows_phase_id IS NULL OR follows_phase_id <> id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_proposal_phases_follows
  ON public.proposal_phases(follows_phase_id) WHERE follows_phase_id IS NOT NULL;

-- Positive-duration guards (S3-6 review fix). The entry grammar accepts
-- signed durations ('-3d') because milestone OFFSETS need them — but a
-- PHASE duration must be a positive day count: a negative duration_days
-- would run activate_proposal_as_project's legacy v_running_date cascade
-- BACKWARD, corrupting every downstream phase date. The UI rejects signed
-- input on phase-duration fields (ScheduleEntryField durationSign
-- 'unsigned'); these CHECKs are the backstop for direct PostgREST writes.
-- Covers project_phases too (its duration_days landed in 00323, but this
-- file is the compose slice's local-only migration — safe to extend).
-- Deliberately NOT on schedule_milestones.offset_days (signed by design).
DO $$ BEGIN
  ALTER TABLE public.proposal_phases
    ADD CONSTRAINT proposal_phases_duration_days_positive
      CHECK (duration_days IS NULL OR duration_days > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.project_phases
    ADD CONSTRAINT project_phases_duration_days_positive
      CHECK (duration_days IS NULL OR duration_days > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN public.proposal_phases.duration_days IS
  'Chain duration in days. Authoritative when non-null; else the resolver '
  'falls back to duration_weeks*7. Set by the compose path (Slice 03+).';
COMMENT ON COLUMN public.proposal_phases.anchor_date IS
  'Non-null pins this phase''s START to a hard date; anchors hold under the '
  'ripple (R100).';
COMMENT ON COLUMN public.proposal_phases.lane IS
  'main = the trunk sequence. thread = parallel work (procurement is the '
  'canonical thread — overlap is legal, R99/R100).';

-- ─── 1b. proposal_schedule_milestones — anchored client commitments (R101.3) ──
-- anchor_date is NOT NULL and there is NO offset_days / NO status column: a
-- proposal milestone is always a hard date the client signs against. Activation
-- (§1e) translates it into a project-side schedule_milestone (offset NULL,
-- status 'upcoming').
CREATE TABLE IF NOT EXISTS public.proposal_schedule_milestones (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id    UUID NOT NULL REFERENCES public.proposal_phases(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL DEFAULT 'event'
                CHECK (kind IN ('signoff', 'decision', 'delivery', 'event')),
  anchor_date DATE NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_proposal_schedule_milestones_phase
  ON public.proposal_schedule_milestones(phase_id, sort_order);

-- moddatetime already enabled by 00044/00323; IF NOT EXISTS makes this file
-- replayable standalone (pattern: 00323).
CREATE EXTENSION IF NOT EXISTS moddatetime WITH SCHEMA extensions;

DROP TRIGGER IF EXISTS trg_proposal_schedule_milestones_updated_at ON public.proposal_schedule_milestones;
CREATE TRIGGER trg_proposal_schedule_milestones_updated_at
  BEFORE UPDATE ON public.proposal_schedule_milestones
  FOR EACH ROW EXECUTE FUNCTION extensions.moddatetime(updated_at);

COMMENT ON COLUMN public.proposal_schedule_milestones.anchor_date IS
  'NOT NULL by design (R101.3): a proposal milestone is a hard-dated commitment '
  'the client signs against — never a working offset. On activation it becomes '
  'a project schedule_milestone with offset_days NULL and status ''upcoming''.';

ALTER TABLE public.proposal_schedule_milestones ENABLE ROW LEVEL SECURITY;

-- Designer manages their proposal's milestones (join through proposal_phases →
-- proposals). Mirrors proposal_phases' "Designers manage their proposal phases"
-- FOR ALL policy; USING + WITH CHECK both present.
DROP POLICY IF EXISTS proposal_schedule_milestones_designer_all ON public.proposal_schedule_milestones;
CREATE POLICY proposal_schedule_milestones_designer_all
  ON public.proposal_schedule_milestones FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.proposal_phases ph
      JOIN public.proposals p ON p.id = ph.proposal_id
      WHERE ph.id = proposal_schedule_milestones.phase_id AND p.designer_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.proposal_phases ph
      JOIN public.proposals p ON p.id = ph.proposal_id
      WHERE ph.id = proposal_schedule_milestones.phase_id AND p.designer_id = auth.uid()
    )
  );

-- Client can read non-draft proposal milestones (mirrors "Clients can view
-- non-draft proposal phases"). Required by R101.3 — the client signs against
-- the anchored dates.
DROP POLICY IF EXISTS proposal_schedule_milestones_client_select ON public.proposal_schedule_milestones;
CREATE POLICY proposal_schedule_milestones_client_select
  ON public.proposal_schedule_milestones FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.proposal_phases ph
      JOIN public.proposals p ON p.id = ph.proposal_id
      WHERE ph.id = proposal_schedule_milestones.phase_id
        AND p.client_id = auth.uid() AND p.status != 'draft'
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.proposal_schedule_milestones TO authenticated;
GRANT ALL ON public.proposal_schedule_milestones TO service_role;

-- ─── 1c. The Patina Six template + apply_phase_template regraft ───────────────
-- Idempotent via slug uniqueness (ON CONFLICT (slug) DO UPDATE — 00135 idiom).
-- Each phase carries BOTH duration_weeks (legacy) and duration_days (chain).
INSERT INTO public.phase_templates (slug, label, description, is_system, designer_id, phases)
VALUES (
  'patina_six',
  'The Patina Six',
  'Patina''s canonical six-phase residential arc — consultation through completion — carrying chain durations in days so the schedule composes as a linked spine, not a set of loose dates.',
  true,
  NULL,
  '[
    {
      "name": "Consultation",
      "phase_key": "consultation",
      "duration_weeks": 1,
      "duration_days": 7,
      "fee_cents": 0,
      "revision_limit": 0,
      "sort_order": 0,
      "deliverables": [],
      "default_gates": []
    },
    {
      "name": "Schematic Design",
      "phase_key": "concept_development",
      "duration_weeks": 3,
      "duration_days": 21,
      "fee_cents": 0,
      "revision_limit": 0,
      "sort_order": 1,
      "deliverables": [],
      "default_gates": []
    },
    {
      "name": "Design Development",
      "phase_key": "design_refinement",
      "duration_weeks": 4,
      "duration_days": 28,
      "fee_cents": 0,
      "revision_limit": 0,
      "sort_order": 2,
      "deliverables": [],
      "default_gates": []
    },
    {
      "name": "Procurement & Orders",
      "phase_key": "procurement",
      "duration_weeks": 8,
      "duration_days": 56,
      "fee_cents": 0,
      "revision_limit": 0,
      "sort_order": 3,
      "deliverables": [],
      "default_gates": []
    },
    {
      "name": "Installation & Styling",
      "phase_key": "installation",
      "duration_weeks": 3,
      "duration_days": 21,
      "fee_cents": 0,
      "revision_limit": 0,
      "sort_order": 4,
      "deliverables": [],
      "default_gates": []
    },
    {
      "name": "Completion",
      "phase_key": "final_walkthrough",
      "duration_weeks": 1,
      "duration_days": 7,
      "fee_cents": 0,
      "revision_limit": 0,
      "sort_order": 5,
      "deliverables": [],
      "default_gates": []
    }
  ]'::jsonb
)
ON CONFLICT (slug) DO UPDATE
  SET label = EXCLUDED.label,
      description = EXCLUDED.description,
      is_system = EXCLUDED.is_system,
      designer_id = EXCLUDED.designer_id,
      phases = EXCLUDED.phases,
      updated_at = NOW();

-- REGRAFT apply_phase_template — 00135 body VERBATIM with two surgical deltas
-- marked "-- 00324:". Reads optional duration_days + lane keys and links each
-- new phase to the previous inserted one (linear follows chain).
CREATE OR REPLACE FUNCTION apply_phase_template(
  p_proposal_id UUID,
  p_template_slug TEXT
)
RETURNS SETOF UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_template      RECORD;
  v_phase_data    JSONB;
  v_phase_id      UUID;
  v_prev_phase_id UUID := NULL;   -- 00324: linear follows chain
  v_deliverable   JSONB;
  v_gate          JSONB;
  v_max_sort      INTEGER;
BEGIN
  -- Verify the proposal belongs to the calling designer. RLS would
  -- already reject the inserts below, but we want a clear error message
  -- (and to short-circuit before doing any mutation).
  IF NOT EXISTS (
    SELECT 1 FROM proposals
     WHERE id = p_proposal_id
       AND designer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'proposal not found or not owned by caller';
  END IF;

  SELECT * INTO v_template FROM phase_templates WHERE slug = p_template_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'template not found: %', p_template_slug;
  END IF;

  -- Append after any existing phases on the proposal.
  SELECT COALESCE(MAX(sort_order), -1) INTO v_max_sort
    FROM proposal_phases
   WHERE proposal_id = p_proposal_id;

  FOR v_phase_data IN SELECT * FROM jsonb_array_elements(v_template.phases)
  LOOP
    v_max_sort := v_max_sort + 1;

    INSERT INTO proposal_phases (
      proposal_id,
      name,
      phase_key,
      duration_weeks,
      duration_days,           -- 00324: chain truth (nullable — legacy templates omit it)
      lane,                    -- 00324: 'main' unless the template names a thread
      follows_phase_id,        -- 00324: linear chain to the previous inserted phase
      fee_cents,
      revision_limit,
      sort_order
    )
    VALUES (
      p_proposal_id,
      v_phase_data->>'name',
      v_phase_data->>'phase_key',
      (v_phase_data->>'duration_weeks')::int,
      (v_phase_data->>'duration_days')::int,                 -- 00324
      COALESCE(v_phase_data->>'lane', 'main'),               -- 00324
      v_prev_phase_id,                                       -- 00324
      COALESCE((v_phase_data->>'fee_cents')::int, 0),
      COALESCE((v_phase_data->>'revision_limit')::int, 0),
      v_max_sort
    )
    RETURNING id INTO v_phase_id;

    RETURN NEXT v_phase_id;
    v_prev_phase_id := v_phase_id;   -- 00324: next phase follows this one

    -- Insert deliverables
    IF v_phase_data ? 'deliverables' THEN
      FOR v_deliverable IN SELECT * FROM jsonb_array_elements(v_phase_data->'deliverables')
      LOOP
        INSERT INTO proposal_phase_deliverables (
          phase_id,
          label,
          description,
          is_required,
          sort_order
        )
        VALUES (
          v_phase_id,
          v_deliverable->>'label',
          v_deliverable->>'description',
          COALESCE((v_deliverable->>'is_required')::bool, true),
          COALESCE((v_deliverable->>'sort_order')::int, 0)
        );
      END LOOP;
    END IF;

    -- Insert default gates
    IF v_phase_data ? 'default_gates' THEN
      FOR v_gate IN SELECT * FROM jsonb_array_elements(v_phase_data->'default_gates')
      LOOP
        INSERT INTO proposal_phase_gates (
          phase_id,
          gate_kind,
          payload,
          sort_order
        )
        VALUES (
          v_phase_id,
          v_gate->>'gate_kind',
          COALESCE(v_gate->'payload', '{}'::jsonb),
          COALESCE((v_gate->>'sort_order')::int, 0)
        );
      END LOOP;
    END IF;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION apply_phase_template(UUID, TEXT) TO authenticated;

-- ─── 1d. Birth RPCs ──────────────────────────────────────────────────────────

-- seed_project_schedule_from_template — the apply_phase_template loop against
-- project_phases with chain columns + a linear follows chain. Ownership-guarded
-- on projects.designer_id; refuses if the project already has phases (R100).
CREATE OR REPLACE FUNCTION public.seed_project_schedule_from_template(
  p_project_id UUID,
  p_template_slug TEXT
)
RETURNS SETOF UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_template      RECORD;
  v_phase_data    JSONB;
  v_phase_id      UUID;
  v_prev_phase_id UUID := NULL;
  v_sort          INTEGER := -1;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM projects
     WHERE id = p_project_id
       AND designer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'project not found or not owned by caller';
  END IF;

  -- R100: a schedule is never rebuilt.
  IF EXISTS (SELECT 1 FROM project_phases WHERE project_id = p_project_id) THEN
    RAISE EXCEPTION 'project % already has phases; the schedule is never rebuilt (R100)', p_project_id;
  END IF;

  SELECT * INTO v_template FROM phase_templates WHERE slug = p_template_slug;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'template not found: %', p_template_slug;
  END IF;

  FOR v_phase_data IN SELECT * FROM jsonb_array_elements(v_template.phases)
  LOOP
    v_sort := v_sort + 1;

    INSERT INTO project_phases (
      project_id,
      name,
      phase_key,
      duration_weeks,
      duration_days,
      lane,
      follows_phase_id,
      fee_cents,
      revision_limit,
      deliverables,
      sort_order
    )
    VALUES (
      p_project_id,
      v_phase_data->>'name',
      v_phase_data->>'phase_key',
      (v_phase_data->>'duration_weeks')::int,
      (v_phase_data->>'duration_days')::int,
      COALESCE(v_phase_data->>'lane', 'main'),
      v_prev_phase_id,
      COALESCE((v_phase_data->>'fee_cents')::int, 0),
      COALESCE((v_phase_data->>'revision_limit')::int, 2),
      COALESCE(v_phase_data->'deliverables', '[]'::jsonb),
      v_sort
    )
    RETURNING id INTO v_phase_id;

    RETURN NEXT v_phase_id;
    v_prev_phase_id := v_phase_id;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.seed_project_schedule_from_template(UUID, TEXT) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.seed_project_schedule_from_template(UUID, TEXT) TO authenticated;

-- copy_schedule_as_built — clone a source project's schedule as an as-built
-- chain onto exactly one target (proposal OR project). As-built duration = the
-- ACTUAL elapsed days when the source phase carries real dates, else the
-- planned fallback. Source ownership-guarded; target ownership-guarded; refuses
-- if the target already has phases (R100). No anchors; linear follows chain.
CREATE OR REPLACE FUNCTION public.copy_schedule_as_built(
  p_source_project_id  UUID,
  p_target_proposal_id UUID DEFAULT NULL,
  p_target_project_id  UUID DEFAULT NULL
)
RETURNS SETOF UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_src           RECORD;
  v_duration      INTEGER;
  v_new_phase_id  UUID;
  v_prev_phase_id UUID := NULL;
  v_sort          INTEGER := -1;
BEGIN
  -- Exactly one target.
  IF (p_target_proposal_id IS NULL) = (p_target_project_id IS NULL) THEN
    RAISE EXCEPTION 'exactly one of p_target_proposal_id / p_target_project_id must be provided';
  END IF;

  -- Source ownership.
  IF NOT EXISTS (
    SELECT 1 FROM projects WHERE id = p_source_project_id AND designer_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'source project not found or not owned by caller';
  END IF;

  -- Target ownership + R100 refuse-if-has-phases.
  IF p_target_proposal_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM proposals WHERE id = p_target_proposal_id AND designer_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'target proposal not found or not owned by caller';
    END IF;
    IF EXISTS (SELECT 1 FROM proposal_phases WHERE proposal_id = p_target_proposal_id) THEN
      RAISE EXCEPTION 'target proposal % already has phases; the schedule is never rebuilt (R100)', p_target_proposal_id;
    END IF;
  ELSE
    IF NOT EXISTS (
      SELECT 1 FROM projects WHERE id = p_target_project_id AND designer_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'target project not found or not owned by caller';
    END IF;
    IF EXISTS (SELECT 1 FROM project_phases WHERE project_id = p_target_project_id) THEN
      RAISE EXCEPTION 'target project % already has phases; the schedule is never rebuilt (R100)', p_target_project_id;
    END IF;
  END IF;

  FOR v_src IN
    SELECT * FROM project_phases
    WHERE project_id = p_source_project_id
    ORDER BY sort_order
  LOOP
    v_sort := v_sort + 1;

    -- As-built: actual elapsed when the source phase carries real dates; else
    -- planned fallback.
    IF v_src.start_date IS NOT NULL
       AND COALESCE(v_src.completed_at::date, v_src.target_end_date) IS NOT NULL THEN
      v_duration := GREATEST(1, COALESCE(v_src.completed_at::date, v_src.target_end_date) - v_src.start_date);
    ELSE
      v_duration := COALESCE(v_src.duration_days, v_src.duration_weeks * 7, 14);
    END IF;

    IF p_target_proposal_id IS NOT NULL THEN
      INSERT INTO proposal_phases (
        proposal_id, name, phase_key,
        duration_days, lane, follows_phase_id, sort_order
      )
      VALUES (
        p_target_proposal_id, v_src.name, v_src.phase_key,
        v_duration, COALESCE(v_src.lane, 'main'), v_prev_phase_id, v_sort
      )
      RETURNING id INTO v_new_phase_id;
    ELSE
      INSERT INTO project_phases (
        project_id, name, phase_key,
        duration_days, lane, follows_phase_id, sort_order
      )
      VALUES (
        p_target_project_id, v_src.name, v_src.phase_key,
        v_duration, COALESCE(v_src.lane, 'main'), v_prev_phase_id, v_sort
      )
      RETURNING id INTO v_new_phase_id;
    END IF;

    RETURN NEXT v_new_phase_id;
    v_prev_phase_id := v_new_phase_id;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.copy_schedule_as_built(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.copy_schedule_as_built(UUID, UUID, UUID) TO authenticated;

-- ─── 1e. activate_proposal_as_project regraft (00279 body VERBATIM + 3 deltas) ─
-- See banner. Deltas are marked "-- 00324:". Everything else is byte-identical
-- to 00279 (the FF&E dual-pricing mapping, the spec_field_defs copy, the
-- on_signing stamp, the guarded deposit auto-draft, palettes/boards, etc.).
CREATE OR REPLACE FUNCTION public.activate_proposal_as_project(p_proposal_id uuid, p_start_date date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_proposal RECORD;
  v_project_id UUID;
  v_design_fee_total INTEGER := 0;
  v_ffe_budget_total INTEGER := 0;
  v_room RECORD;
  v_new_room_id UUID;
  v_item RECORD;
  v_item_notes TEXT;
  v_item_eta DATE;
  v_phase RECORD;
  v_new_phase_id UUID;
  v_milestone RECORD;
  v_new_milestone_id UUID;       -- 00274 delta
  v_kickoff_milestone_id UUID;   -- 00274 delta
  v_kickoff_amount_cents INTEGER; -- 00274 delta
  v_co_terms RECORD;
  v_team RECORD;
  v_section RECORD;
  v_palette RECORD;
  v_swatches JSONB;
  v_board RECORD;
  v_board_items JSONB;
  v_scope_room_map JSONB := '{}'::jsonb;
  v_exclusions JSONB;
  v_running_date DATE;
  v_phase_map JSONB := '{}'::jsonb;
BEGIN
  SELECT * INTO v_proposal
  FROM proposals
  WHERE id = p_proposal_id AND status = 'accepted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal % not found or not in accepted status', p_proposal_id;
  END IF;

  IF v_proposal.project_id IS NOT NULL THEN
    RAISE EXCEPTION 'Proposal % already activated as project %', p_proposal_id, v_proposal.project_id;
  END IF;

  SELECT COALESCE(SUM(fee_cents), 0) INTO v_design_fee_total
  FROM proposal_phases
  WHERE proposal_id = p_proposal_id;

  SELECT COALESCE(SUM(line_total_cents), 0) INTO v_ffe_budget_total
  FROM proposal_items
  WHERE proposal_id = p_proposal_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'description', pe.description,
    'category', pe.category
  ) ORDER BY pe.sort_order), '[]'::jsonb)
  INTO v_exclusions
  FROM proposal_exclusions pe
  WHERE pe.proposal_id = p_proposal_id;

  SELECT * INTO v_co_terms
  FROM proposal_change_order_terms
  WHERE proposal_id = p_proposal_id;

  INSERT INTO projects (
    proposal_id, designer_id, client_id, name, status, notes,
    budget_cents, total_amount_cents, design_fee_cents, start_date,
    site_address, kickoff_message, client_visibility_tier,
    scope_boundaries,
    change_order_terms,
    created_by
  ) VALUES (
    p_proposal_id,
    v_proposal.designer_id,
    v_proposal.client_id,
    v_proposal.title,
    'active',
    v_proposal.description,
    v_ffe_budget_total,
    v_proposal.total_amount,
    v_design_fee_total,
    p_start_date,
    v_proposal.project_address,
    v_proposal.personal_message,
    COALESCE(v_proposal.client_visibility_tier, 'milestone'),
    v_exclusions,
    CASE WHEN v_co_terms IS NOT NULL THEN jsonb_build_object(
      'process_description', v_co_terms.process_description,
      'hourly_rate_cents', v_co_terms.hourly_rate_cents,
      'minimum_fee_cents', v_co_terms.minimum_fee_cents,
      'approval_required', v_co_terms.approval_required
    ) ELSE '{}'::jsonb END,
    v_proposal.designer_id
  )
  RETURNING id INTO v_project_id;

  FOR v_room IN
    SELECT * FROM proposal_scope_rooms
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    INSERT INTO project_rooms (
      project_id, source_scope_room_id, room_id,
      name, room_type, dimensions, floor_area_sqft,
      budget_cents, ffe_categories, notes, sort_order
    ) VALUES (
      v_project_id, v_room.id, v_room.room_id,
      v_room.name, v_room.room_type, v_room.dimensions, v_room.floor_area_sqft,
      v_room.budget_cents, v_room.ffe_categories, v_room.notes, v_room.sort_order
    )
    RETURNING id INTO v_new_room_id;

    v_scope_room_map := v_scope_room_map || jsonb_build_object(v_room.id::text, v_new_room_id::text);

    FOR v_item IN
      SELECT * FROM proposal_items
      WHERE proposal_id = p_proposal_id AND scope_room_id = v_room.id
      ORDER BY position
    LOOP
      v_item_notes := COALESCE(v_item.notes, '');
      IF v_item.internal_notes IS NOT NULL AND length(trim(v_item.internal_notes)) > 0 THEN
        v_item_notes := CASE WHEN length(v_item_notes) > 0 THEN v_item_notes || E'\n\n' ELSE '' END
                        || 'Internal: ' || v_item.internal_notes;
      END IF;
      v_item_eta := CASE WHEN v_item.lead_time_weeks IS NOT NULL AND v_item.lead_time_weeks > 0
                         THEN p_start_date + (v_item.lead_time_weeks * 7)
                         ELSE NULL END;

      -- 00279: unit_price_cents = CLIENT price (unit_sell_price); trade price +
      -- markup carry alongside (restores the 00185 dual-pricing repair that
      -- 00199 reverted). line_total_cents was already the client total.
      -- GREATEST/COALESCE clamps mirror the 00185 tier-a backfill: negative
      -- trade/markup (writable via direct PostgREST, propagated by
      -- clone_proposal) would violate the 00185 >= 0 CHECKs and block activation.
      INSERT INTO project_ffe_items (
        project_id, project_room_id, source_proposal_item_id,
        product_id, name, ffe_category, item_type, doc_code, custom_fields,
        status, quantity, unit_price_cents, trade_price_cents, markup_percent, line_total_cents,
        budget_min_cents, budget_max_cents,
        vendor_id, vendor_name, eta, notes, sort_order
      ) VALUES (
        v_project_id, v_new_room_id, v_item.id,
        v_item.product_id, v_item.name, v_item.ffe_category, v_item.item_type, v_item.doc_code, v_item.custom_fields,
        'specified',
        v_item.quantity,
        v_item.unit_sell_price,
        GREATEST(COALESCE(v_item.unit_price, 0), 0),
        GREATEST(COALESCE(v_item.markup_percent, 0), 0),
        v_item.line_total_cents,
        v_item.budget_min_cents, v_item.budget_max_cents,
        v_item.vendor_id, v_item.vendor_name, v_item_eta,
        NULLIF(v_item_notes, ''),
        v_item.position
      );
    END LOOP;
  END LOOP;

  FOR v_item IN
    SELECT * FROM proposal_items
    WHERE proposal_id = p_proposal_id AND scope_room_id IS NULL
    ORDER BY position
  LOOP
    v_item_notes := COALESCE(v_item.notes, '');
    IF v_item.internal_notes IS NOT NULL AND length(trim(v_item.internal_notes)) > 0 THEN
      v_item_notes := CASE WHEN length(v_item_notes) > 0 THEN v_item_notes || E'\n\n' ELSE '' END
                      || 'Internal: ' || v_item.internal_notes;
    END IF;
    v_item_eta := CASE WHEN v_item.lead_time_weeks IS NOT NULL AND v_item.lead_time_weeks > 0
                       THEN p_start_date + (v_item.lead_time_weeks * 7)
                       ELSE NULL END;

    -- 00279: same dual-pricing mapping as the room loop above (restores 00185).
    INSERT INTO project_ffe_items (
      project_id, project_room_id, source_proposal_item_id,
      product_id, name, ffe_category, item_type, doc_code, custom_fields,
      status, quantity, unit_price_cents, trade_price_cents, markup_percent, line_total_cents,
      budget_min_cents, budget_max_cents,
      vendor_id, vendor_name, eta, notes, sort_order
    ) VALUES (
      v_project_id, NULL, v_item.id,
      v_item.product_id, v_item.name, v_item.ffe_category, v_item.item_type, v_item.doc_code, v_item.custom_fields,
      'specified',
      v_item.quantity,
      v_item.unit_sell_price,
      GREATEST(COALESCE(v_item.unit_price, 0), 0),
      GREATEST(COALESCE(v_item.markup_percent, 0), 0),
      v_item.line_total_cents,
      v_item.budget_min_cents, v_item.budget_max_cents,
      v_item.vendor_id, v_item.vendor_name, v_item_eta,
      NULLIF(v_item_notes, ''),
      v_item.position
    );
  END LOOP;

  -- Custom field DEFS (S6, 00268): copy the proposal's schedule columns onto
  -- project-owned rows (same field_key/name/kind/sort). The per-line VALUES ride
  -- along in project_ffe_items.custom_fields above, keyed by field_key —
  -- verbatim, no id remap.
  INSERT INTO spec_field_defs (project_id, field_key, name, kind, sort_order)
  SELECT v_project_id, field_key, name, kind, sort_order
  FROM spec_field_defs
  WHERE proposal_id = p_proposal_id;

  -- 00324 delta (1): TWO-PASS phase copy. Pass 1 inserts every project_phase
  -- with follows_phase_id NULL (a forward chain reference cannot be resolved in
  -- a single pass), carrying the chain columns duration_days / anchor_date /
  -- lane, and builds v_phase_map. The legacy start/target cascade is KEPT but
  -- now advances by duration_days when present (delta 2) — a naive compat
  -- approximation the gated Spine UI never reads (the resolver is TS-only).
  v_running_date := p_start_date;
  FOR v_phase IN
    SELECT * FROM proposal_phases
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    INSERT INTO project_phases (
      project_id, source_proposal_phase_id,
      name, phase_key, status,
      start_date, target_end_date, duration_weeks,
      duration_days, anchor_date, lane, follows_phase_id,   -- 00324: chain columns
      fee_cents, revision_limit, gate_condition,
      deliverables, sort_order
    ) VALUES (
      v_project_id, v_phase.id,
      v_phase.name, v_phase.phase_key,
      CASE v_phase.sort_order WHEN 0 THEN 'in_progress' ELSE 'pending' END,
      v_running_date,
      v_running_date + COALESCE(v_phase.duration_days, v_phase.duration_weeks * 7, 14),  -- 00324 delta (2)
      v_phase.duration_weeks,
      v_phase.duration_days, v_phase.anchor_date, v_phase.lane, NULL,   -- 00324: follows remapped in pass 2
      v_phase.fee_cents, v_phase.revision_limit, v_phase.gate_condition,
      v_phase.deliverables, v_phase.sort_order
    )
    RETURNING id INTO v_new_phase_id;

    v_phase_map := v_phase_map || jsonb_build_object(v_phase.id::text, v_new_phase_id::text);
    v_running_date := v_running_date + COALESCE(v_phase.duration_days, v_phase.duration_weeks * 7, 14);  -- 00324 delta (2)
  END LOOP;

  -- 00324 delta (1), pass 2: remap the follows chain now that v_phase_map holds
  -- every source→new phase pairing. Resolves forward references a single-pass
  -- insertion cannot.
  UPDATE project_phases pp
  SET follows_phase_id = (v_phase_map ->> src.follows_phase_id::text)::uuid
  FROM proposal_phases src
  WHERE pp.source_proposal_phase_id = src.id
    AND pp.project_id = v_project_id
    AND src.follows_phase_id IS NOT NULL;

  -- 00324 delta (3): translate anchored proposal milestones into project-side
  -- schedule_milestones. phase_id remaps through v_phase_map; anchor_date / kind
  -- / name / sort_order carry; offset_days is NULL and status is 'upcoming'
  -- (activation stamps the working status — R101.3). No schedule_revisions
  -- write (Slice 05).
  INSERT INTO schedule_milestones (phase_id, name, kind, offset_days, anchor_date, status, sort_order)
  SELECT (v_phase_map ->> psm.phase_id::text)::uuid,
         psm.name, psm.kind, NULL, psm.anchor_date, 'upcoming', psm.sort_order
  FROM proposal_schedule_milestones psm
  JOIN proposal_phases pp ON pp.id = psm.phase_id
  WHERE pp.proposal_id = p_proposal_id;

  UPDATE projects SET target_end_date = v_running_date WHERE id = v_project_id;
  UPDATE projects SET current_phase = (
    SELECT phase_key FROM project_phases
    WHERE project_id = v_project_id
    ORDER BY sort_order LIMIT 1
  ) WHERE id = v_project_id;

  -- 00274: the kickoff milestone (sort_order = 0, seeded 'outstanding' at
  -- signing) is stamped trigger_kind = 'on_signing'. The NOT EXISTS guard is
  -- defensive-only — v_project_id is fresh from the INSERT above, so no
  -- project_payment_milestones row for it can already exist — but it keeps
  -- the invariant "at most one on_signing milestone per project" true even
  -- if this function is ever reached a second time for the same project.
  FOR v_milestone IN
    SELECT * FROM proposal_payment_milestones
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    INSERT INTO project_payment_milestones (
      project_id, phase_id, label, percentage,
      amount_cents, trigger_condition,
      status, due_date, sort_order,
      trigger_kind
    ) VALUES (
      v_project_id,
      CASE WHEN v_milestone.phase_id IS NOT NULL
        THEN (v_phase_map ->> v_milestone.phase_id::text)::UUID
        ELSE NULL
      END,
      v_milestone.label, v_milestone.percentage,
      v_milestone.amount_cents, v_milestone.trigger_condition,
      CASE v_milestone.sort_order WHEN 0 THEN 'outstanding' ELSE 'pending' END,
      CASE v_milestone.sort_order WHEN 0 THEN p_start_date ELSE NULL END,
      v_milestone.sort_order,
      CASE
        WHEN v_milestone.sort_order = 0
             AND NOT EXISTS (
               SELECT 1 FROM project_payment_milestones existing
               WHERE existing.project_id = v_project_id
                 AND existing.trigger_kind = 'on_signing'
             )
        THEN 'on_signing'
        ELSE NULL
      END
    )
    RETURNING id INTO v_new_milestone_id;

    IF v_milestone.sort_order = 0 THEN
      v_kickoff_milestone_id := v_new_milestone_id;
      v_kickoff_amount_cents := v_milestone.amount_cents;
    END IF;
  END LOOP;

  -- 00274: auto-draft the deposit invoice. Draft only (review-then-send per
  -- R26/R11 stands — the designer still uses Issue & Send). Guarded to
  -- amount_cents > 0 because draft_invoice_from_milestone (00204) has no
  -- zero-amount special case of its own. Wrapped so drafting can NEVER fail
  -- activation — a client signature must succeed even if this hits an edge
  -- case; the milestone simply stays undrafted for the designer to pick up
  -- manually via Generate-invoice (00204).
  IF v_kickoff_milestone_id IS NOT NULL AND v_kickoff_amount_cents > 0 THEN
    BEGIN
      PERFORM draft_invoice_from_milestone(v_kickoff_milestone_id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'activate_proposal_as_project: deposit auto-draft failed for milestone % (project %): %',
        v_kickoff_milestone_id, v_project_id, SQLERRM;
    END;
  END IF;

  FOR v_team IN
    SELECT * FROM proposal_team_members
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order, created_at
  LOOP
    INSERT INTO project_team_members (
      project_id, user_id, role, permissions,
      assigned_by, assigned_at
    ) VALUES (
      v_project_id, v_team.user_id, v_team.role, COALESCE(v_team.permissions, '{}'::jsonb),
      v_proposal.designer_id, NOW()
    )
    ON CONFLICT (project_id, user_id, role) DO NOTHING;
  END LOOP;

  FOR v_section IN
    SELECT * FROM proposal_sections
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    INSERT INTO project_narrative_sections (
      project_id, source_section_id,
      type, title, body, metadata, sort_order
    ) VALUES (
      v_project_id, v_section.id,
      v_section.type, v_section.title, v_section.body,
      COALESCE(v_section.metadata, '{}'::jsonb), v_section.sort_order
    );
  END LOOP;

  FOR v_palette IN
    SELECT * FROM proposal_palettes
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'hex', ps.hex,
      'name', ps.name,
      'role', ps.role,
      'paint_color_id', ps.paint_color_id,
      'brand', ps.brand,
      'brand_code', ps.brand_code,
      'sort_order', ps.sort_order
    ) ORDER BY ps.sort_order), '[]'::jsonb)
    INTO v_swatches
    FROM palette_swatches ps
    WHERE ps.palette_id = v_palette.id;

    INSERT INTO project_palettes (
      project_id, source_palette_id,
      name, is_primary, source_image_url, notes,
      scope_room_id, swatches, sort_order
    ) VALUES (
      v_project_id, v_palette.id,
      v_palette.name, COALESCE(v_palette.is_primary, FALSE),
      v_palette.source_image_url, v_palette.notes,
      CASE WHEN v_palette.scope_room_id IS NOT NULL
        THEN (v_scope_room_map ->> v_palette.scope_room_id::text)::UUID
        ELSE NULL END,
      v_swatches, v_palette.sort_order
    );
  END LOOP;

  -- Mood boards (00180): snapshot each proposal board into project_boards
  -- with its items embedded as an ordered JSONB array. The board's scope
  -- room is remapped to the new project_rooms row the same way palettes are.
  FOR v_board IN
    SELECT * FROM proposal_boards
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'type', bi.type,
      'x', bi.x,
      'y', bi.y,
      'width', bi.width,
      'height', bi.height,
      'z_index', bi.z_index,
      'rotation', bi.rotation,
      'product_id', bi.product_id,
      'image_url', bi.image_url,
      'content', bi.content,
      'data', bi.data
    ) ORDER BY bi.z_index, bi.created_at), '[]'::jsonb)
    INTO v_board_items
    FROM proposal_board_items bi
    WHERE bi.board_id = v_board.id;

    INSERT INTO project_boards (
      project_id, source_board_id, name, project_room_id,
      cover_image_url, canvas_width, canvas_height, background_color,
      items, sort_order
    ) VALUES (
      v_project_id, v_board.id, v_board.name,
      CASE WHEN v_board.scope_room_id IS NOT NULL
        THEN (v_scope_room_map ->> v_board.scope_room_id::text)::UUID
        ELSE NULL END,
      v_board.cover_image_url, v_board.canvas_width, v_board.canvas_height,
      v_board.background_color,
      v_board_items, v_board.sort_order
    );
  END LOOP;

  UPDATE proposals SET project_id = v_project_id WHERE id = p_proposal_id;

  UPDATE designer_clients
  SET status = 'active', updated_at = NOW()
  WHERE designer_id = v_proposal.designer_id
    AND client_id = v_proposal.client_id
    AND status IN ('lead', 'proposal');

  RETURN v_project_id;
END;
$function$;

COMMENT ON FUNCTION public.activate_proposal_as_project(uuid, date) IS
  'Bridges an accepted proposal into an active project (body lineage: 00140 → 00167 → 00180 → 00185 → 00199 → 00262 → 00269 → 00274 → 00279 → 00324). '
  '00269 carries doc_code + custom_fields (+ spec_field_defs copy) into project_ffe_items; 00274 stamps the kickoff '
  '(sort_order=0) payment milestone trigger_kind=''on_signing'' and, when its amount_cents > 0, drafts its invoice via '
  'draft_invoice_from_milestone (00204) — draft only, guarded so drafting can never fail activation. '
  '00279 reconciles the FF&E dual-pricing repair 00185 introduced and 00199 silently reverted: the two project_ffe_items '
  'inserts write unit_price_cents = proposal_items.unit_sell_price (CLIENT price), and carry trade_price_cents / markup_percent (clamped >= 0). '
  '00324 carries the schedule chain: project_phases gain duration_days/anchor_date/lane and a two-pass-remapped follows_phase_id, '
  'anchored proposal_schedule_milestones become schedule_milestones (offset NULL, status ''upcoming''), and the legacy start/target '
  'cascade advances by duration_days when present. No schedule_revisions write (Slice 05).';
