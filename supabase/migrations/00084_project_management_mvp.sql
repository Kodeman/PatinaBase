-- ============================================================================
-- Migration 00084: Project Management MVP additions
--
-- Sits on top of 00066 (proposal/project flow v2) to fill the small gaps
-- between what exists and what the Designer Portal MVP spec calls for.
-- All changes are additive and idempotent (IF NOT EXISTS / IF NOT FOUND).
--
-- Adds:
--   • projects.studio_id, lead_designer_id (alias of designer_id),
--     client_visibility_tier, kickoff_date / expected_completion_date aliases
--   • 'draft' and 'on_hold' values on the project_status enum
--   • Wider decision_type CHECK + phase_id + recommended_option_id
--     on client_decisions
--   • blocked_by_decision_id + last_status_change_at on project_ffe_items
--   • CO workflow fields on scope_change_requests
--     (co_number, signed_pdf_url, signature_metadata, original_spec,
--     requested_change, affected_tasks) + auto-numbering
--   • project_team_members + project_change_order_templates
--   • RPCs: next_co_number, apply_scope_change
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend project_status enum
-- ---------------------------------------------------------------------------

ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'on_hold';
ALTER TYPE project_status ADD VALUE IF NOT EXISTS 'draft';

-- ---------------------------------------------------------------------------
-- 2. Extend projects table
-- ---------------------------------------------------------------------------

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS studio_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_visibility_tier TEXT NOT NULL DEFAULT 'milestone'
    CHECK (client_visibility_tier IN ('full', 'milestone', 'curated'));

-- lead_designer_id as a generated alias for designer_id (spec parity).
-- DROP first if a prior partial run created it as a regular column.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'projects'
      AND column_name = 'lead_designer_id'
  ) THEN
    ALTER TABLE projects
      ADD COLUMN lead_designer_id UUID GENERATED ALWAYS AS (designer_id) STORED;
  END IF;
END$$;

-- kickoff_date / expected_completion_date as aliases for start_date / target_end_date
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'projects'
      AND column_name = 'kickoff_date'
  ) THEN
    ALTER TABLE projects
      ADD COLUMN kickoff_date DATE GENERATED ALWAYS AS (start_date) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'projects'
      AND column_name = 'expected_completion_date'
  ) THEN
    ALTER TABLE projects
      ADD COLUMN expected_completion_date DATE GENERATED ALWAYS AS (target_end_date) STORED;
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_projects_studio ON projects(studio_id) WHERE studio_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_lead_designer ON projects(lead_designer_id) WHERE lead_designer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_visibility ON projects(client_visibility_tier);

-- ---------------------------------------------------------------------------
-- 3. Extend client_decisions for full decision spec
-- ---------------------------------------------------------------------------

-- Widen decision_type to allow spec values ('color', 'substitution') alongside existing ('product', 'budget')
-- Drop any pre-existing CHECK constraint on decision_type (name may be auto-generated)
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  SELECT conname INTO v_constraint_name
  FROM pg_constraint
  WHERE conrelid = 'public.client_decisions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%decision_type%';
  IF v_constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE client_decisions DROP CONSTRAINT %I', v_constraint_name);
  END IF;
END$$;

ALTER TABLE client_decisions
  ADD CONSTRAINT client_decisions_decision_type_check
  CHECK (decision_type IN ('material', 'color', 'product', 'layout', 'substitution', 'budget', 'approval'));

ALTER TABLE client_decisions
  ADD COLUMN IF NOT EXISTS phase_id UUID REFERENCES project_phases(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recommended_option_id UUID REFERENCES client_decision_options(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_decisions_phase
  ON client_decisions(phase_id) WHERE phase_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. Extend project_ffe_items for blocked-by-decision and activity tracking
-- ---------------------------------------------------------------------------

ALTER TABLE project_ffe_items
  ADD COLUMN IF NOT EXISTS blocked_by_decision_id UUID REFERENCES client_decisions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_status_change_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_project_ffe_items_blocked_by
  ON project_ffe_items(blocked_by_decision_id) WHERE blocked_by_decision_id IS NOT NULL;

-- Trigger: stamp last_status_change_at whenever status changes
CREATE OR REPLACE FUNCTION stamp_ffe_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.last_status_change_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS stamp_ffe_status_change_trigger ON project_ffe_items;
CREATE TRIGGER stamp_ffe_status_change_trigger
  BEFORE UPDATE ON project_ffe_items
  FOR EACH ROW EXECUTE FUNCTION stamp_ffe_status_change();

-- ---------------------------------------------------------------------------
-- 5. Extend scope_change_requests into full Change Order workflow
-- ---------------------------------------------------------------------------

ALTER TABLE scope_change_requests
  ADD COLUMN IF NOT EXISTS co_number TEXT,
  ADD COLUMN IF NOT EXISTS signed_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS signature_metadata JSONB,
  ADD COLUMN IF NOT EXISTS original_spec JSONB,
  ADD COLUMN IF NOT EXISTS requested_change JSONB,
  ADD COLUMN IF NOT EXISTS affected_tasks JSONB DEFAULT '[]'::jsonb;

-- Per-project sequential CO number (SCA-YYYY-NNN). Unique per project.
CREATE UNIQUE INDEX IF NOT EXISTS idx_scope_change_requests_co_number
  ON scope_change_requests(project_id, co_number)
  WHERE co_number IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. project_team_members
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS project_team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL
    CHECK (role IN ('lead_designer', 'support_designer', 'vendor', 'client', 'bookkeeper')),
  permissions JSONB DEFAULT '{}'::jsonb,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  removed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_project_team_members_project ON project_team_members(project_id);
CREATE INDEX IF NOT EXISTS idx_project_team_members_user ON project_team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_project_team_members_role ON project_team_members(role);

ALTER TABLE project_team_members ENABLE ROW LEVEL SECURITY;

-- Lead designer (owner) has full access
CREATE POLICY "Lead designers manage team members"
  ON project_team_members FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id AND p.designer_id = auth.uid()
    )
  );

-- Members can read their own membership and other members of the same project
CREATE POLICY "Team members can view project membership"
  ON project_team_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM project_team_members ptm
      WHERE ptm.project_id = project_team_members.project_id
        AND ptm.user_id = auth.uid()
        AND ptm.removed_at IS NULL
    )
  );

DROP TRIGGER IF EXISTS set_updated_at ON project_team_members;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON project_team_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 7. project_change_order_templates (per-studio)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS project_change_order_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  studio_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  designer_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  default_fields JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_built_in BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (studio_id IS NOT NULL OR designer_id IS NOT NULL OR is_built_in = true)
);

CREATE INDEX IF NOT EXISTS idx_co_templates_studio ON project_change_order_templates(studio_id) WHERE studio_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_co_templates_designer ON project_change_order_templates(designer_id) WHERE designer_id IS NOT NULL;

ALTER TABLE project_change_order_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers manage their CO templates"
  ON project_change_order_templates FOR ALL
  USING (
    designer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM organization_members om
      WHERE om.organization_id = project_change_order_templates.studio_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

CREATE POLICY "Built-in CO templates are world-readable"
  ON project_change_order_templates FOR SELECT
  USING (is_built_in = true);

DROP TRIGGER IF EXISTS set_updated_at ON project_change_order_templates;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON project_change_order_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 8. RPC: next_co_number — generates SCA-YYYY-NNN per project
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION next_co_number(p_project_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year TEXT := to_char(CURRENT_DATE, 'YYYY');
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM scope_change_requests
  WHERE project_id = p_project_id
    AND co_number LIKE 'SCA-' || v_year || '-%';

  RETURN format('SCA-%s-%s', v_year, lpad((v_count + 1)::text, 3, '0'));
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. RPC: apply_scope_change — on CO approval, mutate project state
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION apply_scope_change(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request RECORD;
  v_new_room JSONB;
  v_new_item JSONB;
BEGIN
  SELECT * INTO v_request
  FROM scope_change_requests
  WHERE id = p_request_id AND status = 'approved';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Scope change request % not found or not approved', p_request_id;
  END IF;

  IF v_request.applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Scope change % already applied at %', p_request_id, v_request.applied_at;
  END IF;

  -- 1. Add new rooms
  FOR v_new_room IN SELECT * FROM jsonb_array_elements(COALESCE(v_request.new_rooms, '[]'::jsonb))
  LOOP
    INSERT INTO project_rooms (
      project_id, name, room_type, dimensions, floor_area_sqft,
      budget_cents, ffe_categories, notes
    ) VALUES (
      v_request.project_id,
      v_new_room->>'name',
      v_new_room->>'room_type',
      v_new_room->>'dimensions',
      NULLIF(v_new_room->>'floor_area_sqft', '')::NUMERIC(10,2),
      COALESCE((v_new_room->>'budget_cents')::INTEGER, 0),
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(v_new_room->'ffe_categories', '[]'::jsonb))),
      v_new_room->>'notes'
    );
  END LOOP;

  -- 2. Add new FF&E items
  FOR v_new_item IN SELECT * FROM jsonb_array_elements(COALESCE(v_request.new_ffe_items, '[]'::jsonb))
  LOOP
    INSERT INTO project_ffe_items (
      project_id, project_room_id, name, ffe_category, item_type,
      quantity, unit_price_cents, line_total_cents,
      vendor_name, notes
    ) VALUES (
      v_request.project_id,
      NULLIF(v_new_item->>'project_room_id', '')::UUID,
      v_new_item->>'name',
      v_new_item->>'ffe_category',
      COALESCE(v_new_item->>'item_type', 'fixed'),
      COALESCE((v_new_item->>'quantity')::INTEGER, 1),
      COALESCE((v_new_item->>'unit_price_cents')::INTEGER, 0),
      COALESCE((v_new_item->>'line_total_cents')::INTEGER, 0),
      v_new_item->>'vendor_name',
      v_new_item->>'notes'
    );
  END LOOP;

  -- 3. Update project totals
  UPDATE projects
  SET
    budget_cents = budget_cents + COALESCE(v_request.additional_ffe_budget_cents, 0),
    design_fee_cents = design_fee_cents + COALESCE(v_request.additional_design_fee_cents, 0),
    target_end_date = target_end_date + (COALESCE(v_request.timeline_impact_weeks, 0) * 7),
    updated_at = NOW()
  WHERE id = v_request.project_id;

  -- 4. Mark request applied
  UPDATE scope_change_requests
  SET applied_at = NOW(),
      updated_at = NOW()
  WHERE id = p_request_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 10. Helper view: studios — surfaces organizations as "studios" for the
--     designer mental model; client code can SELECT from v_studios while
--     RLS still enforces against organizations / organization_members.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW v_studios AS
SELECT
  o.id,
  o.name,
  o.slug,
  o.status,
  o.created_at,
  o.updated_at
FROM organizations o
WHERE o.status = 'active';

COMMENT ON VIEW v_studios IS 'Designer-facing alias for organizations table. RLS enforced through organizations.';
