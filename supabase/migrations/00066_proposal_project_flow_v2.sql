-- ============================================================================
-- Migration 00066: Proposal ↔ Project Flow v2
--
-- Core insight: The proposal IS the project definition.
-- Adds structured scope data to proposals (rooms, phases, exclusions,
-- payment milestones, change order terms) and project tables that activate
-- from signed proposals with zero re-entry.
-- ============================================================================

-- ============================================================================
-- PART 1: PROPOSAL SCOPE TABLES (Scope Builder data)
-- ============================================================================

-- 1A. Rooms defined during scope building
CREATE TABLE proposal_scope_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  room_type TEXT,
  dimensions TEXT,
  floor_area_sqft NUMERIC(10,2),
  budget_cents INTEGER NOT NULL DEFAULT 0,
  ffe_categories TEXT[] DEFAULT '{}',
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proposal_scope_rooms_proposal ON proposal_scope_rooms(proposal_id);
CREATE INDEX idx_proposal_scope_rooms_room ON proposal_scope_rooms(room_id) WHERE room_id IS NOT NULL;

ALTER TABLE proposal_scope_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers manage their proposal scope rooms"
  ON proposal_scope_rooms FOR ALL
  USING (
    EXISTS (SELECT 1 FROM proposals p WHERE p.id = proposal_id AND p.designer_id = auth.uid())
  );

CREATE POLICY "Clients can view non-draft proposal scope rooms"
  ON proposal_scope_rooms FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = proposal_id AND p.client_id = auth.uid() AND p.status != 'draft'
    )
  );

-- 1B. Phase structure with fees and gates
CREATE TABLE proposal_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phase_key TEXT,
  duration_weeks INTEGER,
  fee_cents INTEGER NOT NULL DEFAULT 0,
  revision_limit INTEGER DEFAULT 2,
  gate_condition TEXT,
  deliverables JSONB DEFAULT '[]'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proposal_phases_proposal ON proposal_phases(proposal_id);

ALTER TABLE proposal_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers manage their proposal phases"
  ON proposal_phases FOR ALL
  USING (
    EXISTS (SELECT 1 FROM proposals p WHERE p.id = proposal_id AND p.designer_id = auth.uid())
  );

CREATE POLICY "Clients can view non-draft proposal phases"
  ON proposal_phases FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = proposal_id AND p.client_id = auth.uid() AND p.status != 'draft'
    )
  );

-- 1C. Exclusions — what's NOT included
CREATE TABLE proposal_exclusions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  category TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proposal_exclusions_proposal ON proposal_exclusions(proposal_id);

ALTER TABLE proposal_exclusions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers manage their proposal exclusions"
  ON proposal_exclusions FOR ALL
  USING (
    EXISTS (SELECT 1 FROM proposals p WHERE p.id = proposal_id AND p.designer_id = auth.uid())
  );

CREATE POLICY "Clients can view non-draft proposal exclusions"
  ON proposal_exclusions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = proposal_id AND p.client_id = auth.uid() AND p.status != 'draft'
    )
  );

-- 1D. Payment milestones tied to phase gates
CREATE TABLE proposal_payment_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES proposal_phases(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  percentage NUMERIC(5,2) NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  trigger_condition TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proposal_payment_milestones_proposal ON proposal_payment_milestones(proposal_id);

ALTER TABLE proposal_payment_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers manage their proposal payment milestones"
  ON proposal_payment_milestones FOR ALL
  USING (
    EXISTS (SELECT 1 FROM proposals p WHERE p.id = proposal_id AND p.designer_id = auth.uid())
  );

CREATE POLICY "Clients can view non-draft proposal payment milestones"
  ON proposal_payment_milestones FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = proposal_id AND p.client_id = auth.uid() AND p.status != 'draft'
    )
  );

-- 1E. Change order terms (defined upfront in scope builder)
CREATE TABLE proposal_change_order_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proposal_id UUID NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  process_description TEXT NOT NULL,
  hourly_rate_cents INTEGER DEFAULT 0,
  minimum_fee_cents INTEGER DEFAULT 0,
  approval_required BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(proposal_id)
);

ALTER TABLE proposal_change_order_terms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers manage their proposal CO terms"
  ON proposal_change_order_terms FOR ALL
  USING (
    EXISTS (SELECT 1 FROM proposals p WHERE p.id = proposal_id AND p.designer_id = auth.uid())
  );

CREATE POLICY "Clients can view non-draft proposal CO terms"
  ON proposal_change_order_terms FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM proposals p
      WHERE p.id = proposal_id AND p.client_id = auth.uid() AND p.status != 'draft'
    )
  );

-- ============================================================================
-- PART 2: ALTER proposal_items FOR Fixed/Allowance/TBD SUPPORT
-- ============================================================================

ALTER TABLE proposal_items
  ADD COLUMN IF NOT EXISTS item_type TEXT NOT NULL DEFAULT 'fixed'
    CHECK (item_type IN ('fixed', 'allowance', 'tbd')),
  ADD COLUMN IF NOT EXISTS scope_room_id UUID REFERENCES proposal_scope_rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS budget_min_cents INTEGER,
  ADD COLUMN IF NOT EXISTS budget_max_cents INTEGER,
  ADD COLUMN IF NOT EXISTS ffe_category TEXT;

CREATE INDEX idx_proposal_items_scope_room ON proposal_items(scope_room_id) WHERE scope_room_id IS NOT NULL;
CREATE INDEX idx_proposal_items_item_type ON proposal_items(item_type);

-- ============================================================================
-- PART 3: ENHANCE projects TABLE
-- ============================================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS designer_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS budget_cents INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS committed_cents INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS actual_cents INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS design_fee_cents INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS target_end_date DATE,
  ADD COLUMN IF NOT EXISTS current_phase TEXT,
  ADD COLUMN IF NOT EXISTS scope_boundaries JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS change_order_terms JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS brief_document_url TEXT;

CREATE INDEX idx_projects_proposal ON projects(proposal_id) WHERE proposal_id IS NOT NULL;
CREATE INDEX idx_projects_designer ON projects(designer_id) WHERE designer_id IS NOT NULL;
CREATE INDEX idx_projects_client ON projects(client_id) WHERE client_id IS NOT NULL;

-- ============================================================================
-- PART 4: PROJECT TABLES (activated from proposals)
-- ============================================================================

-- 4A. Project rooms (from proposal_scope_rooms)
CREATE TABLE project_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_scope_room_id UUID REFERENCES proposal_scope_rooms(id) ON DELETE SET NULL,
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  room_type TEXT,
  dimensions TEXT,
  floor_area_sqft NUMERIC(10,2),
  budget_cents INTEGER NOT NULL DEFAULT 0,
  committed_cents INTEGER DEFAULT 0,
  actual_cents INTEGER DEFAULT 0,
  ffe_categories TEXT[] DEFAULT '{}',
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_rooms_project ON project_rooms(project_id);

ALTER TABLE project_rooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers manage their project rooms"
  ON project_rooms FOR ALL
  USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.designer_id = auth.uid())
  );

CREATE POLICY "Clients can view their project rooms"
  ON project_rooms FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.client_id = auth.uid())
  );

-- 4B. Project FF&E items (from proposal_items)
CREATE TABLE project_ffe_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  project_room_id UUID REFERENCES project_rooms(id) ON DELETE SET NULL,
  source_proposal_item_id UUID REFERENCES proposal_items(id) ON DELETE SET NULL,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  ffe_category TEXT,
  item_type TEXT NOT NULL DEFAULT 'fixed' CHECK (item_type IN ('fixed', 'allowance', 'tbd')),
  status TEXT NOT NULL DEFAULT 'specified'
    CHECK (status IN ('specified','quoted','approved','ordered','production','shipped','delivered','installed')),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price_cents INTEGER DEFAULT 0,
  line_total_cents INTEGER DEFAULT 0,
  budget_min_cents INTEGER,
  budget_max_cents INTEGER,
  vendor_name TEXT,
  vendor_id UUID,
  po_number TEXT,
  eta DATE,
  blocked BOOLEAN DEFAULT false,
  blocked_reason TEXT,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_ffe_items_project ON project_ffe_items(project_id);
CREATE INDEX idx_project_ffe_items_room ON project_ffe_items(project_room_id) WHERE project_room_id IS NOT NULL;
CREATE INDEX idx_project_ffe_items_status ON project_ffe_items(status);
CREATE INDEX idx_project_ffe_items_product ON project_ffe_items(product_id) WHERE product_id IS NOT NULL;

ALTER TABLE project_ffe_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers manage their project FFE items"
  ON project_ffe_items FOR ALL
  USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.designer_id = auth.uid())
  );

CREATE POLICY "Clients can view their project FFE items"
  ON project_ffe_items FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.client_id = auth.uid())
  );

-- 4C. Project phases (from proposal_phases)
CREATE TABLE project_phases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_proposal_phase_id UUID REFERENCES proposal_phases(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phase_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','delayed')),
  start_date DATE,
  target_end_date DATE,
  completed_at TIMESTAMPTZ,
  duration_weeks INTEGER,
  fee_cents INTEGER DEFAULT 0,
  revision_limit INTEGER DEFAULT 2,
  revisions_used INTEGER DEFAULT 0,
  gate_condition TEXT,
  deliverables JSONB DEFAULT '[]'::jsonb,
  progress INTEGER DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_phases_project ON project_phases(project_id);
CREATE INDEX idx_project_phases_status ON project_phases(status);

ALTER TABLE project_phases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers manage their project phases"
  ON project_phases FOR ALL
  USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.designer_id = auth.uid())
  );

CREATE POLICY "Clients can view their project phases"
  ON project_phases FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.client_id = auth.uid())
  );

-- 4D. Project payment milestones (from proposal milestones)
CREATE TABLE project_payment_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  phase_id UUID REFERENCES project_phases(id) ON DELETE SET NULL,
  label TEXT NOT NULL,
  percentage NUMERIC(5,2) NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  trigger_condition TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','outstanding','paid')),
  due_date DATE,
  paid_at TIMESTAMPTZ,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_project_payment_milestones_project ON project_payment_milestones(project_id);
CREATE INDEX idx_project_payment_milestones_status ON project_payment_milestones(status);

ALTER TABLE project_payment_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers manage their project payment milestones"
  ON project_payment_milestones FOR ALL
  USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.designer_id = auth.uid())
  );

CREATE POLICY "Clients can view their project payment milestones"
  ON project_payment_milestones FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.client_id = auth.uid())
  );

-- ============================================================================
-- PART 5: SCOPE CHANGE REQUESTS
-- ============================================================================

CREATE TABLE scope_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  proposal_id UUID REFERENCES proposals(id) ON DELETE SET NULL,
  requested_by UUID NOT NULL REFERENCES profiles(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  additional_ffe_budget_cents INTEGER DEFAULT 0,
  additional_design_fee_cents INTEGER DEFAULT 0,
  timeline_impact_weeks INTEGER DEFAULT 0,
  new_total_budget_cents INTEGER DEFAULT 0,
  new_rooms JSONB DEFAULT '[]'::jsonb,
  new_ffe_items JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','sent','viewed','approved','declined','cancelled')),
  sent_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id),
  approved_by_name TEXT,
  approved_ip TEXT,
  declined_at TIMESTAMPTZ,
  decline_reason TEXT,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_scope_change_requests_project ON scope_change_requests(project_id);
CREATE INDEX idx_scope_change_requests_status ON scope_change_requests(status);

ALTER TABLE scope_change_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Designers manage their scope change requests"
  ON scope_change_requests FOR ALL
  USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.designer_id = auth.uid())
  );

CREATE POLICY "Clients can view scope changes for their projects"
  ON scope_change_requests FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = project_id AND p.client_id = auth.uid())
  );

CREATE POLICY "Clients can approve/decline scope changes"
  ON scope_change_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects p
      WHERE p.id = project_id AND p.client_id = auth.uid()
    )
  )
  WITH CHECK (
    status IN ('approved', 'declined')
  );

-- ============================================================================
-- PART 6: updated_at TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'proposal_scope_rooms', 'proposal_phases', 'proposal_change_order_terms',
    'project_rooms', 'project_ffe_items', 'project_phases',
    'project_payment_milestones', 'scope_change_requests'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      tbl
    );
  END LOOP;
END;
$$;

-- ============================================================================
-- PART 7: ACTIVATE PROPOSAL AS PROJECT (RPC)
-- ============================================================================

CREATE OR REPLACE FUNCTION activate_proposal_as_project(
  p_proposal_id UUID,
  p_start_date DATE DEFAULT CURRENT_DATE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_proposal RECORD;
  v_project_id UUID;
  v_design_fee_total INTEGER := 0;
  v_room RECORD;
  v_new_room_id UUID;
  v_item RECORD;
  v_phase RECORD;
  v_new_phase_id UUID;
  v_milestone RECORD;
  v_co_terms RECORD;
  v_exclusions JSONB;
  v_running_date DATE;
  v_phase_map JSONB := '{}'::jsonb; -- maps old phase id -> new phase id
BEGIN
  -- 1. Validate proposal
  SELECT * INTO v_proposal
  FROM proposals
  WHERE id = p_proposal_id AND status = 'accepted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposal % not found or not in accepted status', p_proposal_id;
  END IF;

  -- Check not already activated
  IF v_proposal.project_id IS NOT NULL THEN
    RAISE EXCEPTION 'Proposal % already activated as project %', p_proposal_id, v_proposal.project_id;
  END IF;

  -- 2. Calculate total design fees
  SELECT COALESCE(SUM(fee_cents), 0) INTO v_design_fee_total
  FROM proposal_phases
  WHERE proposal_id = p_proposal_id;

  -- 3. Collect exclusions as JSONB array
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'description', pe.description,
    'category', pe.category
  ) ORDER BY pe.sort_order), '[]'::jsonb)
  INTO v_exclusions
  FROM proposal_exclusions pe
  WHERE pe.proposal_id = p_proposal_id;

  -- 4. Get change order terms
  SELECT * INTO v_co_terms
  FROM proposal_change_order_terms
  WHERE proposal_id = p_proposal_id;

  -- 5. Create project
  INSERT INTO projects (
    proposal_id, designer_id, client_id, name, status,
    budget_cents, design_fee_cents, start_date,
    scope_boundaries,
    change_order_terms
  ) VALUES (
    p_proposal_id,
    v_proposal.designer_id,
    v_proposal.client_id,
    v_proposal.title,
    'active',
    v_proposal.total_amount,
    v_design_fee_total,
    p_start_date,
    v_exclusions,
    CASE WHEN v_co_terms IS NOT NULL THEN jsonb_build_object(
      'process_description', v_co_terms.process_description,
      'hourly_rate_cents', v_co_terms.hourly_rate_cents,
      'minimum_fee_cents', v_co_terms.minimum_fee_cents,
      'approval_required', v_co_terms.approval_required
    ) ELSE '{}'::jsonb END
  )
  RETURNING id INTO v_project_id;

  -- 6. Copy rooms
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

    -- Copy FF&E items for this room
    FOR v_item IN
      SELECT * FROM proposal_items
      WHERE proposal_id = p_proposal_id AND scope_room_id = v_room.id
      ORDER BY position
    LOOP
      INSERT INTO project_ffe_items (
        project_id, project_room_id, source_proposal_item_id,
        product_id, name, ffe_category, item_type,
        status, quantity, unit_price_cents, line_total_cents,
        budget_min_cents, budget_max_cents,
        vendor_name, notes, sort_order
      ) VALUES (
        v_project_id, v_new_room_id, v_item.id,
        v_item.product_id, v_item.name, v_item.ffe_category, v_item.item_type,
        CASE v_item.item_type WHEN 'fixed' THEN 'specified' ELSE 'specified' END,
        v_item.quantity,
        v_item.unit_price,
        v_item.line_total,
        v_item.budget_min_cents, v_item.budget_max_cents,
        v_item.vendor_name, v_item.notes, v_item.position
      );
    END LOOP;
  END LOOP;

  -- Copy items not assigned to a room
  FOR v_item IN
    SELECT * FROM proposal_items
    WHERE proposal_id = p_proposal_id AND scope_room_id IS NULL
    ORDER BY position
  LOOP
    INSERT INTO project_ffe_items (
      project_id, project_room_id, source_proposal_item_id,
      product_id, name, ffe_category, item_type,
      status, quantity, unit_price_cents, line_total_cents,
      budget_min_cents, budget_max_cents,
      vendor_name, notes, sort_order
    ) VALUES (
      v_project_id, NULL, v_item.id,
      v_item.product_id, v_item.name, v_item.ffe_category, v_item.item_type,
      'specified',
      v_item.quantity,
      v_item.unit_price,
      v_item.line_total,
      v_item.budget_min_cents, v_item.budget_max_cents,
      v_item.vendor_name, v_item.notes, v_item.position
    );
  END LOOP;

  -- 7. Copy phases with calculated dates
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
      fee_cents, revision_limit, gate_condition,
      deliverables, sort_order
    ) VALUES (
      v_project_id, v_phase.id,
      v_phase.name, v_phase.phase_key,
      CASE v_phase.sort_order WHEN 0 THEN 'in_progress' ELSE 'pending' END,
      v_running_date,
      v_running_date + (COALESCE(v_phase.duration_weeks, 2) * 7),
      v_phase.duration_weeks,
      v_phase.fee_cents, v_phase.revision_limit, v_phase.gate_condition,
      v_phase.deliverables, v_phase.sort_order
    )
    RETURNING id INTO v_new_phase_id;

    -- Track phase mapping for milestone linkage
    v_phase_map := v_phase_map || jsonb_build_object(v_phase.id::text, v_new_phase_id::text);

    -- Advance running date
    v_running_date := v_running_date + (COALESCE(v_phase.duration_weeks, 2) * 7);
  END LOOP;

  -- Update project target end date
  UPDATE projects SET target_end_date = v_running_date WHERE id = v_project_id;

  -- Set current phase to first phase
  UPDATE projects SET current_phase = (
    SELECT phase_key FROM project_phases
    WHERE project_id = v_project_id
    ORDER BY sort_order LIMIT 1
  ) WHERE id = v_project_id;

  -- 8. Copy payment milestones
  FOR v_milestone IN
    SELECT * FROM proposal_payment_milestones
    WHERE proposal_id = p_proposal_id
    ORDER BY sort_order
  LOOP
    INSERT INTO project_payment_milestones (
      project_id, phase_id, label, percentage,
      amount_cents, trigger_condition,
      status, sort_order
    ) VALUES (
      v_project_id,
      CASE WHEN v_milestone.phase_id IS NOT NULL
        THEN (v_phase_map ->> v_milestone.phase_id::text)::UUID
        ELSE NULL
      END,
      v_milestone.label, v_milestone.percentage,
      v_milestone.amount_cents, v_milestone.trigger_condition,
      CASE v_milestone.sort_order WHEN 0 THEN 'outstanding' ELSE 'pending' END,
      v_milestone.sort_order
    );
  END LOOP;

  -- 9. Back-link proposal to project
  UPDATE proposals SET project_id = v_project_id WHERE id = p_proposal_id;

  -- 10. Update client lifecycle stage
  UPDATE designer_clients
  SET status = 'active', updated_at = NOW()
  WHERE designer_id = v_proposal.designer_id
    AND client_id = v_proposal.client_id
    AND status IN ('lead', 'proposal');

  RETURN v_project_id;
END;
$$;
