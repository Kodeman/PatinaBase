-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: phase_templates — reusable phase blueprints for proposals
-- Description: Wave 5 of the Proposal Builder upgrade. Adds:
--                - phase_templates: a small catalog of system + per-designer
--                  templates that pre-populate phases (with deliverables and
--                  default gates) for a brand-new proposal.
--                - apply_phase_template(): an RPC that materializes a chosen
--                  template into proposal_phases / proposal_phase_deliverables
--                  / proposal_phase_gates rows for a target proposal.
--
--              The `phases` jsonb column carries an array of phase blueprints
--              with the following per-element shape:
--                {
--                  "name": string,
--                  "phase_key": string,
--                  "duration_weeks": number,
--                  "fee_cents": number,
--                  "revision_limit": number,
--                  "sort_order": number,
--                  "deliverables": [
--                    { "label": string,
--                      "description"?: string,
--                      "is_required"?: boolean,
--                      "sort_order"?: number }
--                  ],
--                  "default_gates": [
--                    { "gate_kind": string,
--                      "payload"?: jsonb,
--                      "sort_order"?: number }
--                  ]
--                }
--
--              `is_system` distinguishes the bundled templates (read-only,
--              `designer_id` IS NULL) from designer-authored templates
--              (`is_system` = false, `designer_id` = auth.uid()). RLS lets
--              everyone read system rows, but only the owning designer can
--              read/write their own rows.
--
--              fee_cents intentionally seeded at 0 across all five system
--              templates — designers fill in real numbers per engagement.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE phase_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  description TEXT NULL,
  is_system BOOLEAN NOT NULL DEFAULT true,
  designer_id UUID NULL REFERENCES profiles(id) ON DELETE CASCADE,
  phases JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_phase_templates_designer
  ON phase_templates(designer_id)
  WHERE designer_id IS NOT NULL;

-- updated_at trigger (helper from earlier migrations)
CREATE TRIGGER trg_phase_templates_updated_at
  BEFORE UPDATE ON phase_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE phase_templates ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can SELECT system rows; designers can also SELECT
-- their own custom rows.
CREATE POLICY phase_templates_select_all
  ON phase_templates FOR SELECT
  USING (
    is_system OR designer_id = auth.uid()
  );

-- A designer can only insert custom (is_system=false) rows owned by them.
CREATE POLICY phase_templates_designer_writes
  ON phase_templates FOR INSERT
  WITH CHECK (
    designer_id = auth.uid() AND NOT is_system
  );

-- A designer can only update their own custom rows.
CREATE POLICY phase_templates_designer_update
  ON phase_templates FOR UPDATE
  USING (
    designer_id = auth.uid() AND NOT is_system
  )
  WITH CHECK (
    designer_id = auth.uid() AND NOT is_system
  );

-- A designer can only delete their own custom rows.
CREATE POLICY phase_templates_designer_delete
  ON phase_templates FOR DELETE
  USING (
    designer_id = auth.uid() AND NOT is_system
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- Seed: 5 system templates
--
-- These INSERTs are idempotent via slug uniqueness — re-running the
-- migration (or applying it on top of an existing seed) refreshes the
-- template content without duplicating rows.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO phase_templates (slug, label, description, is_system, designer_id, phases)
VALUES
  -- ── 1. Classic 5-phase residential ──────────────────────────────────────
  (
    'classic_5_phase',
    'Classic 5-Phase Residential',
    'The canonical residential interior design workflow: programming through construction administration, with a client signature gate at every major design milestone.',
    true,
    NULL,
    '[
      {
        "name": "Programming & Discovery",
        "phase_key": "consultation",
        "duration_weeks": 2,
        "fee_cents": 0,
        "revision_limit": 0,
        "sort_order": 0,
        "deliverables": [
          { "label": "Discovery questionnaire", "description": "Lifestyle, budget, and aesthetic preferences captured.", "is_required": true, "sort_order": 0 },
          { "label": "Initial walkthrough notes", "description": "Site visit observations + measured baseline.", "is_required": true, "sort_order": 1 }
        ],
        "default_gates": [
          { "gate_kind": "client_signature", "payload": { "artifact_label": "Discovery summary" }, "sort_order": 0 }
        ]
      },
      {
        "name": "Schematic Design",
        "phase_key": "concept_development",
        "duration_weeks": 4,
        "fee_cents": 0,
        "revision_limit": 2,
        "sort_order": 1,
        "deliverables": [
          { "label": "Mood board", "description": "Aesthetic direction and reference imagery.", "is_required": true, "sort_order": 0 },
          { "label": "Initial floor plan", "description": "Furniture layout option(s) at 1/4 scale.", "is_required": true, "sort_order": 1 },
          { "label": "Concept presentation", "description": "Narrative + boards delivered to client.", "is_required": true, "sort_order": 2 }
        ],
        "default_gates": [
          { "gate_kind": "client_signature", "payload": { "artifact_label": "Concept presentation" }, "sort_order": 0 }
        ]
      },
      {
        "name": "Design Development",
        "phase_key": "design_refinement",
        "duration_weeks": 4,
        "fee_cents": 0,
        "revision_limit": 2,
        "sort_order": 2,
        "deliverables": [
          { "label": "Refined floor plan", "description": "Locked layout incorporating client feedback.", "is_required": true, "sort_order": 0 },
          { "label": "FF&E spec list draft", "description": "Furniture, finish, and fixture selections.", "is_required": true, "sort_order": 1 },
          { "label": "Material samples", "description": "Physical or curated digital samples.", "is_required": true, "sort_order": 2 }
        ],
        "default_gates": [
          { "gate_kind": "client_signature", "payload": { "artifact_label": "DD package" }, "sort_order": 0 }
        ]
      },
      {
        "name": "Construction Documentation",
        "phase_key": "procurement",
        "duration_weeks": 3,
        "fee_cents": 0,
        "revision_limit": 1,
        "sort_order": 3,
        "deliverables": [
          { "label": "Issue-for-pricing package", "description": "Drawings + specs sent for trade pricing.", "is_required": true, "sort_order": 0 },
          { "label": "Final FF&E schedule", "description": "Locked schedule ready for procurement.", "is_required": true, "sort_order": 1 }
        ],
        "default_gates": [
          { "gate_kind": "payment_received", "payload": {}, "sort_order": 0 }
        ]
      },
      {
        "name": "Construction Administration",
        "phase_key": "installation",
        "duration_weeks": 8,
        "fee_cents": 0,
        "revision_limit": 0,
        "sort_order": 4,
        "deliverables": [
          { "label": "Site visits log", "description": "Periodic site visits during build.", "is_required": true, "sort_order": 0 },
          { "label": "Punchlist", "description": "Final punch items captured + tracked.", "is_required": true, "sort_order": 1 },
          { "label": "Install report", "description": "Final installation report + photos.", "is_required": true, "sort_order": 2 }
        ],
        "default_gates": [
          { "gate_kind": "deliverables_complete", "payload": {}, "sort_order": 0 }
        ]
      }
    ]'::jsonb
  ),
  -- ── 2. Design-only (no procurement) ─────────────────────────────────────
  (
    'design_only',
    'Design-Only (no procurement)',
    'Lightweight 3-phase workflow for clients who handle their own procurement and install. Concept, development, and final documentation only.',
    true,
    NULL,
    '[
      {
        "name": "Concept",
        "phase_key": "concept_development",
        "duration_weeks": 3,
        "fee_cents": 0,
        "revision_limit": 1,
        "sort_order": 0,
        "deliverables": [
          { "label": "Discovery + program brief", "description": "Combined intake + program in one document.", "is_required": true, "sort_order": 0 },
          { "label": "Mood board", "description": "Single-board aesthetic direction.", "is_required": true, "sort_order": 1 },
          { "label": "Concept floor plan", "description": "1/4-scale furniture layout option.", "is_required": true, "sort_order": 2 }
        ],
        "default_gates": [
          { "gate_kind": "client_signature", "payload": { "artifact_label": "Concept package" }, "sort_order": 0 }
        ]
      },
      {
        "name": "Development",
        "phase_key": "design_refinement",
        "duration_weeks": 4,
        "fee_cents": 0,
        "revision_limit": 2,
        "sort_order": 1,
        "deliverables": [
          { "label": "Refined floor plan", "description": "Layout incorporating client feedback.", "is_required": true, "sort_order": 0 },
          { "label": "FF&E spec list", "description": "Selections client can purchase independently.", "is_required": true, "sort_order": 1 }
        ],
        "default_gates": [
          { "gate_kind": "client_signature", "payload": { "artifact_label": "Spec list" }, "sort_order": 0 }
        ]
      },
      {
        "name": "Final Documentation",
        "phase_key": "procurement",
        "duration_weeks": 2,
        "fee_cents": 0,
        "revision_limit": 1,
        "sort_order": 2,
        "deliverables": [
          { "label": "Final spec book", "description": "Hand-off package with vendor links + notes.", "is_required": true, "sort_order": 0 }
        ],
        "default_gates": [
          { "gate_kind": "deliverables_complete", "payload": {}, "sort_order": 0 }
        ]
      }
    ]'::jsonb
  ),
  -- ── 3. Fast track refresh ───────────────────────────────────────────────
  (
    'fast_track',
    'Fast Track Refresh',
    'Compressed 2-phase workflow for room refreshes. Combines discovery + concept up front and procurement + install at the end.',
    true,
    NULL,
    '[
      {
        "name": "Discovery + Concept",
        "phase_key": "concept_development",
        "duration_weeks": 2,
        "fee_cents": 0,
        "revision_limit": 1,
        "sort_order": 0,
        "deliverables": [
          { "label": "Mood board", "description": "Aesthetic direction in one pass.", "is_required": true, "sort_order": 0 },
          { "label": "FF&E spec list", "description": "Selections delivered alongside the concept.", "is_required": true, "sort_order": 1 }
        ],
        "default_gates": [
          { "gate_kind": "client_signature", "payload": { "artifact_label": "Concept + spec list" }, "sort_order": 0 }
        ]
      },
      {
        "name": "Procurement + Install",
        "phase_key": "installation",
        "duration_weeks": 4,
        "fee_cents": 0,
        "revision_limit": 0,
        "sort_order": 1,
        "deliverables": [
          { "label": "Order tracking log", "description": "Live tracker shared with client.", "is_required": true, "sort_order": 0 },
          { "label": "Install + reveal", "description": "Final install with reveal photo set.", "is_required": true, "sort_order": 1 }
        ],
        "default_gates": [
          { "gate_kind": "payment_received", "payload": {}, "sort_order": 0 },
          { "gate_kind": "deliverables_complete", "payload": {}, "sort_order": 1 }
        ]
      }
    ]'::jsonb
  ),
  -- ── 4. Whole home renovation ────────────────────────────────────────────
  (
    'whole_home',
    'Whole Home Renovation',
    'Multi-room renovation engagement. Same five-phase backbone as the classic workflow but with longer durations and tighter procurement coordination.',
    true,
    NULL,
    '[
      {
        "name": "Programming & Discovery",
        "phase_key": "consultation",
        "duration_weeks": 3,
        "fee_cents": 0,
        "revision_limit": 0,
        "sort_order": 0,
        "deliverables": [
          { "label": "Whole-home program", "description": "Room-by-room scope and priority.", "is_required": true, "sort_order": 0 },
          { "label": "Existing conditions audit", "description": "Baseline measurements + condition photos.", "is_required": true, "sort_order": 1 }
        ],
        "default_gates": [
          { "gate_kind": "client_signature", "payload": { "artifact_label": "Program document" }, "sort_order": 0 }
        ]
      },
      {
        "name": "Schematic Design",
        "phase_key": "concept_development",
        "duration_weeks": 5,
        "fee_cents": 0,
        "revision_limit": 2,
        "sort_order": 1,
        "deliverables": [
          { "label": "Whole-home mood boards", "description": "Per-room aesthetic direction.", "is_required": true, "sort_order": 0 },
          { "label": "Schematic plan set", "description": "Layouts for every room in scope.", "is_required": true, "sort_order": 1 },
          { "label": "Concept presentation", "description": "Live walk-through with the client.", "is_required": true, "sort_order": 2 }
        ],
        "default_gates": [
          { "gate_kind": "client_signature", "payload": { "artifact_label": "Schematic package" }, "sort_order": 0 }
        ]
      },
      {
        "name": "Design Development",
        "phase_key": "design_refinement",
        "duration_weeks": 6,
        "fee_cents": 0,
        "revision_limit": 2,
        "sort_order": 2,
        "deliverables": [
          { "label": "DD plan set", "description": "Refined drawings across every room.", "is_required": true, "sort_order": 0 },
          { "label": "FF&E binder", "description": "Master FF&E selection binder.", "is_required": true, "sort_order": 1 },
          { "label": "Material library", "description": "Curated samples + finishes.", "is_required": true, "sort_order": 2 }
        ],
        "default_gates": [
          { "gate_kind": "client_signature", "payload": { "artifact_label": "DD binder" }, "sort_order": 0 }
        ]
      },
      {
        "name": "Construction Documentation",
        "phase_key": "procurement",
        "duration_weeks": 4,
        "fee_cents": 0,
        "revision_limit": 1,
        "sort_order": 3,
        "deliverables": [
          { "label": "Issue-for-construction set", "description": "Permit-ready CD package.", "is_required": true, "sort_order": 0 },
          { "label": "Final FF&E schedule", "description": "Procurement-ready schedule.", "is_required": true, "sort_order": 1 }
        ],
        "default_gates": [
          { "gate_kind": "payment_received", "payload": {}, "sort_order": 0 }
        ]
      },
      {
        "name": "Construction Administration",
        "phase_key": "installation",
        "duration_weeks": 12,
        "fee_cents": 0,
        "revision_limit": 0,
        "sort_order": 4,
        "deliverables": [
          { "label": "Site visit reports", "description": "Cadence of weekly site visits.", "is_required": true, "sort_order": 0 },
          { "label": "RFI tracker", "description": "Open-question tracker shared with GC.", "is_required": true, "sort_order": 1 },
          { "label": "Punchlist + closeout", "description": "Final punch + closeout deliverable.", "is_required": true, "sort_order": 2 }
        ],
        "default_gates": [
          { "gate_kind": "deliverables_complete", "payload": {}, "sort_order": 0 }
        ]
      }
    ]'::jsonb
  ),
  -- ── 5. Kitchen renovation ───────────────────────────────────────────────
  (
    'kitchen_focused',
    'Kitchen Renovation',
    'Single-room kitchen renovation focused on cabinetry, appliance selection, and construction administration.',
    true,
    NULL,
    '[
      {
        "name": "Programming",
        "phase_key": "consultation",
        "duration_weeks": 1,
        "fee_cents": 0,
        "revision_limit": 0,
        "sort_order": 0,
        "deliverables": [
          { "label": "Kitchen intake", "description": "Cooking habits, storage, appliance preferences.", "is_required": true, "sort_order": 0 },
          { "label": "Existing kitchen survey", "description": "Photos, measurements, plumbing/electrical notes.", "is_required": true, "sort_order": 1 }
        ],
        "default_gates": [
          { "gate_kind": "client_signature", "payload": { "artifact_label": "Program brief" }, "sort_order": 0 }
        ]
      },
      {
        "name": "Cabinet + Appliance Selection",
        "phase_key": "concept_development",
        "duration_weeks": 3,
        "fee_cents": 0,
        "revision_limit": 2,
        "sort_order": 1,
        "deliverables": [
          { "label": "Cabinet layout option(s)", "description": "Two or more layout passes for review.", "is_required": true, "sort_order": 0 },
          { "label": "Appliance package", "description": "Chosen appliance suite with specs.", "is_required": true, "sort_order": 1 },
          { "label": "Material + finish board", "description": "Cabinet finish + counter + backsplash board.", "is_required": true, "sort_order": 2 }
        ],
        "default_gates": [
          { "gate_kind": "client_signature", "payload": { "artifact_label": "Selection package" }, "sort_order": 0 }
        ]
      },
      {
        "name": "CD + Permitting",
        "phase_key": "procurement",
        "duration_weeks": 3,
        "fee_cents": 0,
        "revision_limit": 1,
        "sort_order": 2,
        "deliverables": [
          { "label": "Permit drawings", "description": "Sealed drawings for permit submission.", "is_required": true, "sort_order": 0 },
          { "label": "Cabinet shop drawings", "description": "Shop drawings reviewed + approved.", "is_required": true, "sort_order": 1 },
          { "label": "Final appliance order", "description": "Long-lead appliances ordered.", "is_required": true, "sort_order": 2 }
        ],
        "default_gates": [
          { "gate_kind": "payment_received", "payload": {}, "sort_order": 0 }
        ]
      },
      {
        "name": "Construction",
        "phase_key": "installation",
        "duration_weeks": 10,
        "fee_cents": 0,
        "revision_limit": 0,
        "sort_order": 3,
        "deliverables": [
          { "label": "Demo + rough-in oversight", "description": "Site visits during demo + rough-in.", "is_required": true, "sort_order": 0 },
          { "label": "Cabinet install QA", "description": "Cabinet install quality check.", "is_required": true, "sort_order": 1 },
          { "label": "Final reveal", "description": "Final reveal photos + closeout.", "is_required": true, "sort_order": 2 }
        ],
        "default_gates": [
          { "gate_kind": "deliverables_complete", "payload": {}, "sort_order": 0 }
        ]
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

-- ═══════════════════════════════════════════════════════════════════════════
-- RPC: apply_phase_template(p_proposal_id, p_template_slug)
--
-- Materializes the chosen template into proposal_phases /
-- proposal_phase_deliverables / proposal_phase_gates rows for the target
-- proposal. Existing phases on the proposal are preserved — new phases are
-- appended after the highest existing sort_order.
--
-- SECURITY INVOKER: relies on the caller's auth context. The function
-- explicitly checks designer ownership of the proposal so a client (who
-- can SELECT a sent proposal) cannot use this RPC to mutate it.
--
-- Returns the inserted phase IDs in insertion order so the caller can
-- focus the UI on the newly added phases.
-- ═══════════════════════════════════════════════════════════════════════════

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
      fee_cents,
      revision_limit,
      sort_order
    )
    VALUES (
      p_proposal_id,
      v_phase_data->>'name',
      v_phase_data->>'phase_key',
      (v_phase_data->>'duration_weeks')::int,
      COALESCE((v_phase_data->>'fee_cents')::int, 0),
      COALESCE((v_phase_data->>'revision_limit')::int, 0),
      v_max_sort
    )
    RETURNING id INTO v_phase_id;

    RETURN NEXT v_phase_id;

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
