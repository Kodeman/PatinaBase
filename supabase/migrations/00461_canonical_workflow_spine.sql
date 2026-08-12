-- ============================================================================
-- 00461 — canonical residential workflow spine
--
-- Extends the existing proposal/template -> project phase path. This is not a
-- second lifecycle engine: project_phases remains the sole project schedule
-- authority and advance_project_phase remains the sole lifecycle transition.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Optional canonical classification + template provenance on phase rows
-- --------------------------------------------------------------------------

ALTER TABLE public.proposal_phases
  ADD COLUMN IF NOT EXISTS canonical_stage_key text,
  ADD COLUMN IF NOT EXISTS workflow_track text,
  ADD COLUMN IF NOT EXISTS source_template_slug text,
  ADD COLUMN IF NOT EXISTS source_template_version integer;

ALTER TABLE public.project_phases
  ADD COLUMN IF NOT EXISTS canonical_stage_key text,
  ADD COLUMN IF NOT EXISTS workflow_track text,
  ADD COLUMN IF NOT EXISTS source_template_slug text,
  ADD COLUMN IF NOT EXISTS source_template_version integer;

DO $$
BEGIN
  ALTER TABLE public.proposal_phases
    ADD CONSTRAINT proposal_phases_canonical_stage_key_check CHECK (
      canonical_stage_key IS NULL OR canonical_stage_key IN (
        'inquiry_qualification',
        'discovery_programming',
        'scope_engagement',
        'kickoff_existing_conditions',
        'concept_schematic',
        'design_development',
        'documentation_authorization',
        'bidding_permitting_procurement',
        'contract_administration',
        'delivery_installation',
        'closeout_post_occupancy'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE public.proposal_phases
    ADD CONSTRAINT proposal_phases_workflow_classification_pair_check CHECK (
      (canonical_stage_key IS NULL AND workflow_track IS NULL)
      OR (canonical_stage_key IS NOT NULL AND workflow_track IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE public.proposal_phases
    ADD CONSTRAINT proposal_phases_workflow_capability_check CHECK (
      canonical_stage_key IS NULL
      OR (
        workflow_track = 'core'
        AND canonical_stage_key IN (
          'inquiry_qualification',
          'discovery_programming',
          'scope_engagement',
          'kickoff_existing_conditions',
          'concept_schematic',
          'design_development',
          'documentation_authorization',
          'closeout_post_occupancy'
        )
      )
      OR (
        workflow_track IN ('ffe', 'construction')
        AND canonical_stage_key IN (
          'bidding_permitting_procurement',
          'contract_administration'
        )
      )
      OR (
        workflow_track = 'ffe'
        AND canonical_stage_key = 'delivery_installation'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE public.proposal_phases
    ADD CONSTRAINT proposal_phases_workflow_track_check CHECK (
      workflow_track IS NULL OR workflow_track IN ('core', 'ffe', 'construction')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE public.proposal_phases
    ADD CONSTRAINT proposal_phases_template_provenance_check CHECK (
      (source_template_slug IS NULL AND source_template_version IS NULL)
      OR (
        source_template_slug IS NOT NULL
        AND source_template_version IS NOT NULL
        AND btrim(source_template_slug) <> ''
        AND source_template_version > 0
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE public.project_phases
    ADD CONSTRAINT project_phases_canonical_stage_key_check CHECK (
      canonical_stage_key IS NULL OR canonical_stage_key IN (
        'inquiry_qualification',
        'discovery_programming',
        'scope_engagement',
        'kickoff_existing_conditions',
        'concept_schematic',
        'design_development',
        'documentation_authorization',
        'bidding_permitting_procurement',
        'contract_administration',
        'delivery_installation',
        'closeout_post_occupancy'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE public.project_phases
    ADD CONSTRAINT project_phases_workflow_classification_pair_check CHECK (
      (canonical_stage_key IS NULL AND workflow_track IS NULL)
      OR (canonical_stage_key IS NOT NULL AND workflow_track IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE public.project_phases
    ADD CONSTRAINT project_phases_workflow_capability_check CHECK (
      canonical_stage_key IS NULL
      OR (
        workflow_track = 'core'
        AND canonical_stage_key IN (
          'inquiry_qualification',
          'discovery_programming',
          'scope_engagement',
          'kickoff_existing_conditions',
          'concept_schematic',
          'design_development',
          'documentation_authorization',
          'closeout_post_occupancy'
        )
      )
      OR (
        workflow_track IN ('ffe', 'construction')
        AND canonical_stage_key IN (
          'bidding_permitting_procurement',
          'contract_administration'
        )
      )
      OR (
        workflow_track = 'ffe'
        AND canonical_stage_key = 'delivery_installation'
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE public.project_phases
    ADD CONSTRAINT project_phases_workflow_track_check CHECK (
      workflow_track IS NULL OR workflow_track IN ('core', 'ffe', 'construction')
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

DO $$
BEGIN
  ALTER TABLE public.project_phases
    ADD CONSTRAINT project_phases_template_provenance_check CHECK (
      (source_template_slug IS NULL AND source_template_version IS NULL)
      OR (
        source_template_slug IS NOT NULL
        AND source_template_version IS NOT NULL
        AND btrim(source_template_slug) <> ''
        AND source_template_version > 0
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

CREATE INDEX IF NOT EXISTS idx_proposal_phases_workflow_stage
  ON public.proposal_phases(
    proposal_id, canonical_stage_key, workflow_track, sort_order
  )
  WHERE canonical_stage_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_project_phases_workflow_stage
  ON public.project_phases(
    project_id, canonical_stage_key, workflow_track, sort_order
  )
  WHERE canonical_stage_key IS NOT NULL;

COMMENT ON COLUMN public.proposal_phases.canonical_stage_key IS
  'Optional canonical residential workflow stage. NULL means the authored '
  'phase cannot be mapped deterministically; phase_key remains its local label.';
COMMENT ON COLUMN public.proposal_phases.workflow_track IS
  'Optional workflow branch: core, ffe, or construction. NULL is intentionally '
  'allowed for ambiguous legacy or custom phases.';
COMMENT ON COLUMN public.proposal_phases.source_template_slug IS
  'Template slug snapshotted when this phase is materialized. Pairs with '
  'source_template_version; both values are NULL for unprovenanced phases.';
COMMENT ON COLUMN public.proposal_phases.source_template_version IS
  'Positive template content version snapshotted at phase materialization.';

COMMENT ON COLUMN public.project_phases.canonical_stage_key IS
  'Optional canonical residential workflow stage carried from its proposal '
  'phase or snapshotted by direct project template seeding.';
COMMENT ON COLUMN public.project_phases.workflow_track IS
  'Optional workflow branch: core, ffe, or construction.';
COMMENT ON COLUMN public.project_phases.source_template_slug IS
  'Template slug provenance carried into the project schedule.';
COMMENT ON COLUMN public.project_phases.source_template_version IS
  'Positive template content version carried into the project schedule.';

-- Canonical classification and provenance are derived snapshots, never browser
-- input. Checked paths use a transaction-local, parent-scoped capability;
-- proposal activation reuses the exact project batch authority introduced in
-- 00398. Direct authenticated/service-role writes may still create honest NULL
-- rows and may update every pre-00461 field, but cannot forge these snapshots.
CREATE OR REPLACE FUNCTION public.guard_phase_workflow_metadata()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rpc_owner text;
  v_parent_id uuid;
  v_expected_token text;
  v_owner_maint boolean := false;
  v_trusted_update boolean := false;
  v_activation_insert boolean := false;
  v_source public.proposal_phases%ROWTYPE;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(proc.proowner)
  INTO v_rpc_owner
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid =
    'public.guard_phase_workflow_metadata()'::pg_catalog.regprocedure;

  IF TG_TABLE_NAME = 'proposal_phases' THEN
    v_parent_id := NEW.proposal_id;
  ELSE
    v_parent_id := NEW.project_id;
  END IF;
  v_expected_token := format(
    'phase_workflow_metadata:%s:%s:%s',
    TG_TABLE_NAME,
    v_parent_id,
    pg_catalog.txid_current()
  );
  v_owner_maint := current_user = v_rpc_owner
    AND session_user = v_rpc_owner
    AND COALESCE(current_setting('role', true), 'none') = 'none';
  v_trusted_update := current_user = v_rpc_owner
    AND current_setting('app.phase_workflow_metadata_token', true)
          IS NOT DISTINCT FROM v_expected_token;

  IF TG_OP = 'INSERT' THEN
    IF NEW.canonical_stage_key IS NULL
       AND NEW.workflow_track IS NULL
       AND NEW.source_template_slug IS NULL
       AND NEW.source_template_version IS NULL
    THEN
      RETURN NEW;
    END IF;

    IF TG_TABLE_NAME = 'project_phases' THEN
      IF current_user = v_rpc_owner
         AND NEW.source_proposal_phase_id IS NOT NULL
         AND current_setting('app.project_phase_batch_token', true)
               IS NOT DISTINCT FROM format(
                 'project_phase_batch:%s:%s',
                 NEW.project_id,
                 pg_catalog.txid_current()
               )
      THEN
        SELECT source.* INTO v_source
        FROM public.proposal_phases AS source
        JOIN public.projects AS project
          ON project.id = NEW.project_id
         AND project.proposal_id = source.proposal_id
        WHERE source.id = NEW.source_proposal_phase_id;

        v_activation_insert := FOUND
          AND NEW.canonical_stage_key IS NOT DISTINCT FROM
                v_source.canonical_stage_key
          AND NEW.workflow_track IS NOT DISTINCT FROM v_source.workflow_track
          AND NEW.source_template_slug IS NOT DISTINCT FROM
                v_source.source_template_slug
          AND NEW.source_template_version IS NOT DISTINCT FROM
                v_source.source_template_version;
      END IF;
    END IF;

    IF NOT (v_activation_insert OR v_owner_maint) THEN
      RAISE EXCEPTION
        '% workflow metadata is server-owned', TG_TABLE_NAME
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.canonical_stage_key IS NOT DISTINCT FROM OLD.canonical_stage_key
     AND NEW.workflow_track IS NOT DISTINCT FROM OLD.workflow_track
     AND NEW.source_template_slug IS NOT DISTINCT FROM
           OLD.source_template_slug
     AND NEW.source_template_version IS NOT DISTINCT FROM
           OLD.source_template_version
  THEN
    RETURN NEW;
  END IF;

  IF NOT (v_trusted_update OR v_owner_maint) THEN
    RAISE EXCEPTION
      '% workflow metadata is server-owned', TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_phase_workflow_metadata()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS y_guard_phase_workflow_metadata_trg
  ON public.proposal_phases;
CREATE TRIGGER y_guard_phase_workflow_metadata_trg
  BEFORE INSERT OR UPDATE ON public.proposal_phases
  FOR EACH ROW EXECUTE FUNCTION public.guard_phase_workflow_metadata();

DROP TRIGGER IF EXISTS y_guard_phase_workflow_metadata_trg
  ON public.project_phases;
CREATE TRIGGER y_guard_phase_workflow_metadata_trg
  BEFORE INSERT OR UPDATE ON public.project_phases
  FOR EACH ROW EXECUTE FUNCTION public.guard_phase_workflow_metadata();

-- Replace broad pre-00461 table grants with equivalent column grants that omit
-- the four new server-owned columns. The trigger remains the enforcement
-- backstop for definer paths and any future broad grant drift.
REVOKE INSERT, UPDATE ON TABLE public.proposal_phases
  FROM authenticated, service_role;
-- 00399 deliberately preserves table-level INSERT for installed rollback
-- builders. The server-owned trigger is therefore the INSERT authority for an
-- authenticated session; service_role receives only the pre-00461 columns.
GRANT INSERT ON TABLE public.proposal_phases TO authenticated;
GRANT INSERT (
  id, proposal_id, name, phase_key, duration_weeks, fee_cents,
  revision_limit, gate_condition, deliverables, sort_order, created_at,
  updated_at, duration_days, anchor_date, lane, follows_phase_id
) ON TABLE public.proposal_phases TO service_role;
GRANT UPDATE (
  name, phase_key, duration_weeks, fee_cents, revision_limit,
  gate_condition, deliverables, duration_days, anchor_date
) ON TABLE public.proposal_phases TO authenticated;
GRANT UPDATE (
  id, proposal_id, name, phase_key, duration_weeks, fee_cents,
  revision_limit, gate_condition, deliverables, sort_order, created_at,
  updated_at, duration_days, anchor_date, lane, follows_phase_id
) ON TABLE public.proposal_phases TO service_role;

REVOKE INSERT, UPDATE ON TABLE public.project_phases
  FROM authenticated, service_role;
GRANT INSERT (
  id, project_id, source_proposal_phase_id, name, phase_key, status,
  start_date, target_end_date, completed_at, duration_weeks, fee_cents,
  revision_limit, revisions_used, gate_condition, deliverables, progress,
  sort_order, created_at, updated_at, duration_days, anchor_date,
  estimated_hours, lane, follows_phase_id
) ON TABLE public.project_phases TO authenticated, service_role;
GRANT UPDATE (
  id, project_id, source_proposal_phase_id, name, phase_key, status,
  start_date, target_end_date, completed_at, duration_weeks, fee_cents,
  revision_limit, revisions_used, gate_condition, deliverables, progress,
  sort_order, created_at, updated_at, duration_days, anchor_date,
  estimated_hours, lane, follows_phase_id
) ON TABLE public.project_phases TO authenticated, service_role;

-- --------------------------------------------------------------------------
-- 2. Version the existing template catalog; annotate bundled blueprints
-- --------------------------------------------------------------------------

ALTER TABLE public.phase_templates
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

DO $$
BEGIN
  ALTER TABLE public.phase_templates
    ADD CONSTRAINT phase_templates_version_positive CHECK (version > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

COMMENT ON COLUMN public.phase_templates.version IS
  'Server-maintained content version. Starts at 1 and increments whenever the '
  'phases blueprint changes; presentation-only edits do not increment it.';

-- Attach canonical metadata only where the bundled phase itself identifies a
-- single stage. Combined phases deliberately remain unclassified rather than
-- forcing an arbitrary stage.
WITH classified(template_slug, phase_key, phase_name, stage_key, track) AS (
  VALUES
    ('classic_5_phase', 'consultation', 'Programming & Discovery',
      'discovery_programming', 'core'),
    ('classic_5_phase', 'concept_development', 'Schematic Design',
      'concept_schematic', 'core'),
    ('classic_5_phase', 'design_refinement', 'Design Development',
      'design_development', 'core'),
    ('classic_5_phase', 'procurement', 'Construction Documentation',
      'documentation_authorization', 'core'),
    ('classic_5_phase', 'installation', 'Construction Administration',
      'contract_administration', 'construction'),

    ('design_only', 'concept_development', 'Concept',
      'concept_schematic', 'core'),
    ('design_only', 'design_refinement', 'Development',
      'design_development', 'core'),
    ('design_only', 'procurement', 'Final Documentation',
      'documentation_authorization', 'core'),

    ('whole_home', 'consultation', 'Programming & Discovery',
      'discovery_programming', 'core'),
    ('whole_home', 'concept_development', 'Schematic Design',
      'concept_schematic', 'core'),
    ('whole_home', 'design_refinement', 'Design Development',
      'design_development', 'core'),
    ('whole_home', 'procurement', 'Construction Documentation',
      'documentation_authorization', 'core'),
    ('whole_home', 'installation', 'Construction Administration',
      'contract_administration', 'construction'),

    ('kitchen_focused', 'consultation', 'Programming',
      'discovery_programming', 'core'),
    ('kitchen_focused', 'concept_development', 'Cabinet + Appliance Selection',
      'concept_schematic', 'core'),
    ('kitchen_focused', 'procurement', 'CD + Permitting',
      'bidding_permitting_procurement', 'construction'),
    ('kitchen_focused', 'installation', 'Construction',
      'contract_administration', 'construction'),

    ('patina_six', 'consultation', 'Consultation',
      'discovery_programming', 'core'),
    ('patina_six', 'concept_development', 'Schematic Design',
      'concept_schematic', 'core'),
    ('patina_six', 'design_refinement', 'Design Development',
      'design_development', 'core'),
    ('patina_six', 'procurement', 'Procurement & Orders',
      'bidding_permitting_procurement', 'ffe'),
    ('patina_six', 'installation', 'Installation & Styling',
      'delivery_installation', 'ffe'),
    ('patina_six', 'final_walkthrough', 'Completion',
      'closeout_post_occupancy', 'core')
), rewritten AS (
  SELECT template.id,
         jsonb_agg(
           CASE
             WHEN classified.stage_key IS NULL THEN blueprint.value
             ELSE blueprint.value || jsonb_build_object(
               'canonical_stage_key', classified.stage_key,
               'workflow_track', classified.track
             )
           END
           ORDER BY blueprint.ordinal
         ) AS phases
  FROM public.phase_templates AS template
  CROSS JOIN LATERAL jsonb_array_elements(template.phases)
    WITH ORDINALITY AS blueprint(value, ordinal)
  LEFT JOIN classified
    ON classified.template_slug = template.slug
   AND classified.phase_key = blueprint.value->>'phase_key'
   AND classified.phase_name = blueprint.value->>'name'
  WHERE template.is_system
  GROUP BY template.id
)
UPDATE public.phase_templates AS template
SET phases = rewritten.phases
FROM rewritten
WHERE template.id = rewritten.id
  AND template.phases IS DISTINCT FROM rewritten.phases;

CREATE OR REPLACE FUNCTION public.maintain_phase_template_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_blueprint jsonb;
  v_stage text;
  v_track text;
BEGIN
  IF jsonb_typeof(NEW.phases) <> 'array' THEN
    RAISE EXCEPTION 'phase template phases must be a JSON array'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR v_blueprint IN
    SELECT blueprint.value
    FROM jsonb_array_elements(NEW.phases) AS blueprint(value)
  LOOP
    IF (v_blueprint ? 'canonical_stage_key')
       IS DISTINCT FROM (v_blueprint ? 'workflow_track')
    THEN
      RAISE EXCEPTION
        'template workflow classification requires both canonical_stage_key and workflow_track'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_blueprint ? 'canonical_stage_key' THEN
      v_stage := NULLIF(v_blueprint->>'canonical_stage_key', '');
      v_track := NULLIF(v_blueprint->>'workflow_track', '');

      IF v_stage IS NULL OR v_track IS NULL OR NOT (
        (
          v_track = 'core'
          AND v_stage IN (
            'inquiry_qualification',
            'discovery_programming',
            'scope_engagement',
            'kickoff_existing_conditions',
            'concept_schematic',
            'design_development',
            'documentation_authorization',
            'closeout_post_occupancy'
          )
        )
        OR (
          v_track IN ('ffe', 'construction')
          AND v_stage IN (
            'bidding_permitting_procurement',
            'contract_administration'
          )
        )
        OR (v_track = 'ffe' AND v_stage = 'delivery_installation')
      ) THEN
        RAISE EXCEPTION
          'invalid template workflow classification: stage %, track %',
          COALESCE(v_stage, '<null>'), COALESCE(v_track, '<null>')
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END LOOP;

  IF TG_OP = 'INSERT' THEN
    NEW.version := 1;
  ELSIF NEW.phases IS DISTINCT FROM OLD.phases THEN
    NEW.version := OLD.version + 1;
  ELSE
    NEW.version := OLD.version;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.maintain_phase_template_version()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS maintain_phase_template_version
  ON public.phase_templates;
CREATE TRIGGER maintain_phase_template_version
  BEFORE INSERT OR UPDATE ON public.phase_templates
  FOR EACH ROW EXECUTE FUNCTION public.maintain_phase_template_version();

-- --------------------------------------------------------------------------
-- 3. Preserve application provenance without changing apply_phase_template
-- --------------------------------------------------------------------------

ALTER TABLE public.proposal_phase_template_applications
  ADD COLUMN IF NOT EXISTS template_version integer;

DO $$
BEGIN
  ALTER TABLE public.proposal_phase_template_applications
    ADD CONSTRAINT proposal_phase_template_app_version_check
      CHECK (template_version IS NULL OR template_version > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END
$$;

COMMENT ON COLUMN public.proposal_phase_template_applications.template_version IS
  'Template version used by applications created after 00461. NULL preserves '
  'honest provenance for receipts created before template versioning existed.';

-- Keep every pre-00461 receipt fingerprint byte-for-byte compatible. Metadata
-- is provenance, not authored proposal copy, and therefore stays outside the
-- immutable effect receipt.
CREATE OR REPLACE FUNCTION public._proposal_phase_effect_snapshot(
  p_proposal_id uuid,
  p_phase_ids uuid[]
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'phase', to_jsonb(phase) - ARRAY[
          'created_at', 'updated_at',
          'canonical_stage_key', 'workflow_track',
          'source_template_slug', 'source_template_version'
        ],
        'deliverables', COALESCE((
          SELECT jsonb_agg(
            to_jsonb(deliverable) - ARRAY['created_at', 'updated_at']
            ORDER BY deliverable.sort_order, deliverable.id
          )
          FROM public.proposal_phase_deliverables AS deliverable
          WHERE deliverable.phase_id = phase.id
        ), '[]'::jsonb),
        'gates', COALESCE((
          SELECT jsonb_agg(
            to_jsonb(gate) - ARRAY['created_at', 'updated_at']
            ORDER BY gate.sort_order, gate.id
          )
          FROM public.proposal_phase_gates AS gate
          WHERE gate.phase_id = phase.id
        ), '[]'::jsonb)
      )
      ORDER BY requested.ordinal
    ),
    '[]'::jsonb
  )
  FROM unnest(COALESCE(p_phase_ids, '{}'::uuid[]))
       WITH ORDINALITY AS requested(phase_id, ordinal)
  JOIN public.proposal_phases AS phase
    ON phase.id = requested.phase_id
   AND phase.proposal_id = p_proposal_id
$$;

REVOKE ALL ON FUNCTION public._proposal_phase_effect_snapshot(uuid, uuid[])
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.prepare_phase_template_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_prior_version integer;
  v_prior_found boolean := false;
  v_template public.phase_templates%ROWTYPE;
  v_previous_metadata_token text := current_setting(
    'app.phase_workflow_metadata_token', true
  );
  v_metadata_token_set boolean := false;
BEGIN
  SELECT application.template_version
    INTO v_prior_version
  FROM public.proposal_phase_template_applications AS application
  WHERE application.proposal_id = NEW.proposal_id
    AND application.template_slug = NEW.template_slug
  ORDER BY application.created_at, application.request_id
  LIMIT 1;
  v_prior_found := FOUND;

  IF v_prior_found THEN
    NEW.template_version := v_prior_version;
  ELSE
    SELECT * INTO v_template
    FROM public.phase_templates
    WHERE slug = NEW.template_slug
    FOR SHARE;

    IF FOUND THEN
      NEW.template_version := v_template.version;
    END IF;
  END IF;

  -- Only a first, versioned application can classify phases from the live
  -- blueprint. Alias receipts never rewrite prior snapshots. Match by a unique
  -- phase_key inside the template so the historical Patina-five recovery (whose
  -- ordinality differs from Patina Six) remains correct.
  IF NOT v_prior_found AND NEW.template_version IS NOT NULL THEN
    PERFORM set_config(
      'app.phase_workflow_metadata_token',
      format(
        'phase_workflow_metadata:proposal_phases:%s:%s',
        NEW.proposal_id,
        pg_catalog.txid_current()
      ),
      true
    );
    v_metadata_token_set := true;

    WITH blueprint_match AS (
      SELECT phase.id AS phase_id,
             min(blueprint.value->>'canonical_stage_key') AS stage_key,
             min(blueprint.value->>'workflow_track') AS track,
             count(*) FILTER (
               WHERE blueprint.value ? 'canonical_stage_key'
                 AND blueprint.value ? 'workflow_track'
             ) AS classified_count,
             count(*) AS match_count
      FROM unnest(NEW.phase_ids) AS requested(phase_id)
      JOIN public.proposal_phases AS phase
        ON phase.id = requested.phase_id
       AND phase.proposal_id = NEW.proposal_id
      JOIN public.phase_templates AS template
        ON template.slug = NEW.template_slug
       AND template.version = NEW.template_version
      JOIN LATERAL jsonb_array_elements(template.phases) AS blueprint(value)
        ON blueprint.value->>'phase_key' = phase.phase_key
      GROUP BY phase.id
    )
    UPDATE public.proposal_phases AS phase
    SET canonical_stage_key = match.stage_key,
        workflow_track = match.track,
        source_template_slug = NEW.template_slug,
        source_template_version = NEW.template_version
    FROM blueprint_match AS match
    WHERE phase.id = match.phase_id
      AND match.match_count = 1
      AND match.classified_count = 1
      AND phase.canonical_stage_key IS NULL
      AND phase.workflow_track IS NULL
      AND phase.source_template_slug IS NULL
      AND phase.source_template_version IS NULL;

    -- Provenance is deterministic even when a combined blueprint intentionally
    -- has no canonical stage classification.
    UPDATE public.proposal_phases AS phase
    SET source_template_slug = NEW.template_slug,
        source_template_version = NEW.template_version
    WHERE phase.proposal_id = NEW.proposal_id
      AND phase.id = ANY(NEW.phase_ids)
      AND phase.source_template_slug IS NULL
      AND phase.source_template_version IS NULL;
  END IF;

  IF v_metadata_token_set THEN
    PERFORM set_config(
      'app.phase_workflow_metadata_token',
      COALESCE(v_previous_metadata_token, ''),
      true
    );
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  IF v_metadata_token_set THEN
    PERFORM set_config(
      'app.phase_workflow_metadata_token',
      COALESCE(v_previous_metadata_token, ''),
      true
    );
  END IF;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_phase_template_application()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS prepare_phase_template_application
  ON public.proposal_phase_template_applications;
CREATE TRIGGER prepare_phase_template_application
  BEFORE INSERT ON public.proposal_phase_template_applications
  FOR EACH ROW EXECUTE FUNCTION public.prepare_phase_template_application();

-- 00399 authoritative body, restated so the template content/version read is
-- protected by a share lock until its durable application receipt is inserted.
-- The proposal lock, recovery, idempotent receipt, and effect semantics remain
-- byte-for-byte equivalent outside this concurrency fix.
-- 00324 lineage, now with one locked parent protocol, canonical studio
-- authority, and a durable request receipt. Existing phases are preserved and
-- every template append begins at the topology-derived main tail. The sole
-- legacy repair recognizes the exact historical Add Defaults prefix (1..5
-- rows, including fee/revision values, all null-follow), links those rows, and
-- inserts only that historical list's missing suffix. Arbitrary disconnected
-- user branches fail closed instead of being silently rewritten.
CREATE OR REPLACE FUNCTION public.apply_phase_template(
  p_proposal_id uuid,
  p_template_slug text,
  p_request_id uuid
)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_proposal public.proposals%ROWTYPE;
  v_template public.phase_templates%ROWTYPE;
  v_receipt public.proposal_phase_template_applications%ROWTYPE;
  v_phase_data jsonb;
  v_phase_id uuid;
  v_prev_phase_id uuid;
  v_deliverable jsonb;
  v_gate jsonb;
  v_max_sort integer;
  v_existing_count integer;
  v_prefix_mismatch_count integer;
  v_recovered_prefix_count integer := 0;
  v_existing record;
  v_inserted_phase_ids uuid[] := '{}'::uuid[];
  v_effect_phase_ids uuid[] := '{}'::uuid[];
  v_effective_phases jsonb;
  v_legacy_default_phases jsonb := '[
    {
      "name":"Schematic Design",
      "phase_key":"concept_development",
      "duration_weeks":3,
      "fee_cents":250000,
      "revision_limit":2
    },
    {
      "name":"Design Development",
      "phase_key":"design_refinement",
      "duration_weeks":4,
      "fee_cents":350000,
      "revision_limit":2
    },
    {
      "name":"Procurement Management",
      "phase_key":"procurement",
      "duration_weeks":8,
      "fee_cents":200000,
      "revision_limit":1
    },
    {
      "name":"Installation & Styling",
      "phase_key":"installation",
      "duration_weeks":3,
      "fee_cents":150000,
      "revision_limit":1
    },
    {
      "name":"Completion & Handover",
      "phase_key":"final_walkthrough",
      "duration_weeks":1,
      "fee_cents":50000,
      "revision_limit":0
    }
  ]'::jsonb;
  v_return_id uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'apply_phase_template requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF p_request_id IS NULL THEN
    RAISE EXCEPTION 'p_request_id is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_proposal
  FROM public.proposals
  WHERE id = p_proposal_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_proposal.designer_id) THEN
    RAISE EXCEPTION 'proposal % not found or access denied', p_proposal_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_receipt
  FROM public.proposal_phase_template_applications
  WHERE proposal_id = p_proposal_id
    AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.template_slug IS DISTINCT FROM p_template_slug
       OR EXISTS (
         SELECT 1
         FROM unnest(v_receipt.phase_ids) AS receipt_phase(id)
         WHERE NOT EXISTS (
           SELECT 1
           FROM public.proposal_phases AS phase
           WHERE phase.id = receipt_phase.id
             AND phase.proposal_id = p_proposal_id
         )
       )
       OR v_receipt.effect_snapshot IS DISTINCT FROM
            public._proposal_phase_effect_snapshot(
              p_proposal_id, v_receipt.phase_ids
            )
    THEN
      RAISE EXCEPTION 'template request % conflicts with its recorded effect',
        p_request_id
        USING ERRCODE = 'serialization_failure';
    END IF;
    FOREACH v_return_id IN ARRAY v_receipt.phase_ids LOOP
      RETURN NEXT v_return_id;
    END LOOP;
    RETURN;
  END IF;

  -- A named template is one compositional act per proposal, even when two
  -- browser tabs initiate that act with different request UUIDs. The proposal
  -- row lock above serializes both callers. Preserve the later request as an
  -- alias to the first durable effect so its retries remain exact as well.
  SELECT * INTO v_receipt
  FROM public.proposal_phase_template_applications
  WHERE proposal_id = p_proposal_id
    AND template_slug = p_template_slug
  ORDER BY created_at, request_id
  LIMIT 1
  FOR UPDATE;
  IF FOUND THEN
    IF EXISTS (
      SELECT 1
      FROM unnest(v_receipt.phase_ids) AS receipt_phase(id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.proposal_phases AS phase
        WHERE phase.id = receipt_phase.id
          AND phase.proposal_id = p_proposal_id
      )
    ) OR v_receipt.effect_snapshot IS DISTINCT FROM
           public._proposal_phase_effect_snapshot(
             p_proposal_id, v_receipt.phase_ids
           )
    THEN
      RAISE EXCEPTION
        'template % was already applied but its recorded effect changed',
        p_template_slug
        USING ERRCODE = 'serialization_failure';
    END IF;

    INSERT INTO public.proposal_phase_template_applications (
      request_id, proposal_id, template_slug, phase_ids,
      effect_snapshot, created_by
    ) VALUES (
      p_request_id, p_proposal_id, p_template_slug,
      v_receipt.phase_ids, v_receipt.effect_snapshot, v_actor
    );

    FOREACH v_return_id IN ARRAY v_receipt.phase_ids LOOP
      RETURN NEXT v_return_id;
    END LOOP;
    RETURN;
  END IF;

  IF v_proposal.status <> 'draft' THEN
    RAISE EXCEPTION 'proposal % is %, so its authored copy is immutable',
      p_proposal_id, v_proposal.status
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_template
  FROM public.phase_templates
  WHERE slug = p_template_slug
    AND (is_system OR designer_id = v_actor)
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'template not found or access denied: %', p_template_slug
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF jsonb_typeof(v_template.phases) <> 'array'
     OR jsonb_array_length(v_template.phases) = 0
  THEN
    RAISE EXCEPTION 'template % has no valid phases', p_template_slug
      USING ERRCODE = 'check_violation';
  END IF;
  v_effective_phases := v_template.phases;

  PERFORM phase.id
  FROM public.proposal_phases AS phase
  WHERE phase.proposal_id = p_proposal_id
  ORDER BY phase.id
  FOR UPDATE;

  SELECT count(*) INTO v_existing_count
  FROM public.proposal_phases
  WHERE proposal_id = p_proposal_id;

  IF p_template_slug = 'patina_six'
     AND v_existing_count BETWEEN 1 AND 5
  THEN
    WITH ordered_existing AS (
      SELECT phase.*,
             row_number() OVER (ORDER BY phase.sort_order, phase.id) AS ordinal,
             lag(phase.id) OVER (
               ORDER BY phase.sort_order, phase.id
             ) AS expected_predecessor_id,
             bool_and(phase.follows_phase_id IS NULL) OVER () AS all_null_legacy
      FROM public.proposal_phases AS phase
      WHERE phase.proposal_id = p_proposal_id
    )
    SELECT count(*) INTO v_prefix_mismatch_count
    FROM ordered_existing AS existing
    JOIN LATERAL (
      SELECT blueprint.value
      FROM jsonb_array_elements(v_legacy_default_phases)
           WITH ORDINALITY AS blueprint(value, ordinal)
      WHERE blueprint.ordinal = existing.ordinal
    ) AS expected ON true
    WHERE existing.lane <> 'main'
       OR (
         NOT existing.all_null_legacy
         AND existing.follows_phase_id
               IS DISTINCT FROM existing.expected_predecessor_id
       )
       OR existing.sort_order <> existing.ordinal - 1
       OR existing.name IS DISTINCT FROM expected.value->>'name'
       OR existing.phase_key IS DISTINCT FROM expected.value->>'phase_key'
       OR existing.duration_weeks IS DISTINCT FROM
            (expected.value->>'duration_weeks')::integer
       OR existing.duration_days IS NOT NULL
       OR existing.fee_cents IS DISTINCT FROM
            (expected.value->>'fee_cents')::integer
       OR existing.revision_limit IS DISTINCT FROM
            (expected.value->>'revision_limit')::integer;

    IF v_prefix_mismatch_count = 0 THEN
      v_prev_phase_id := NULL;
      FOR v_existing IN
        SELECT phase.id
        FROM public.proposal_phases AS phase
        WHERE phase.proposal_id = p_proposal_id
        ORDER BY phase.sort_order, phase.id
      LOOP
        UPDATE public.proposal_phases
        SET follows_phase_id = v_prev_phase_id
        WHERE id = v_existing.id;
        v_prev_phase_id := v_existing.id;
      END LOOP;
      v_recovered_prefix_count := v_existing_count;
      v_effective_phases := v_legacy_default_phases;
    END IF;
  END IF;

  IF v_recovered_prefix_count = 0 THEN
    v_prev_phase_id := public._proposal_phase_main_tail(
      p_proposal_id, 'apply_phase_template precondition'
    );
  ELSE
    PERFORM public._assert_proposal_phase_topology(
      p_proposal_id, 'apply_phase_template recovered prefix'
    );
  END IF;

  SELECT COALESCE(max(sort_order), -1) INTO v_max_sort
  FROM public.proposal_phases
  WHERE proposal_id = p_proposal_id;

  FOR v_phase_data IN
    SELECT blueprint.value
    FROM jsonb_array_elements(v_effective_phases)
         WITH ORDINALITY AS blueprint(value, ordinal)
    WHERE blueprint.ordinal > v_recovered_prefix_count
    ORDER BY blueprint.ordinal
  LOOP
    IF btrim(COALESCE(v_phase_data->>'name', '')) = '' THEN
      RAISE EXCEPTION 'every template phase requires a name'
        USING ERRCODE = 'check_violation';
    END IF;
    v_max_sort := v_max_sort + 1;

    INSERT INTO public.proposal_phases (
      proposal_id, name, phase_key, duration_weeks, duration_days, lane,
      follows_phase_id, fee_cents, revision_limit, sort_order
    ) VALUES (
      p_proposal_id,
      btrim(v_phase_data->>'name'),
      NULLIF(v_phase_data->>'phase_key', ''),
      NULLIF(v_phase_data->>'duration_weeks', '')::integer,
      NULLIF(v_phase_data->>'duration_days', '')::integer,
      COALESCE(NULLIF(v_phase_data->>'lane', ''), 'main'),
      v_prev_phase_id,
      COALESCE(NULLIF(v_phase_data->>'fee_cents', '')::integer, 0),
      COALESCE(NULLIF(v_phase_data->>'revision_limit', '')::integer, 0),
      v_max_sort
    )
    RETURNING id INTO v_phase_id;

    v_inserted_phase_ids := array_append(v_inserted_phase_ids, v_phase_id);
    v_prev_phase_id := v_phase_id;

    IF v_phase_data ? 'deliverables' THEN
      FOR v_deliverable IN
        SELECT value FROM jsonb_array_elements(v_phase_data->'deliverables')
      LOOP
        INSERT INTO public.proposal_phase_deliverables (
          phase_id, label, description, is_required, sort_order
        ) VALUES (
          v_phase_id,
          v_deliverable->>'label',
          v_deliverable->>'description',
          COALESCE((v_deliverable->>'is_required')::boolean, true),
          COALESCE((v_deliverable->>'sort_order')::integer, 0)
        );
      END LOOP;
    END IF;

    IF v_phase_data ? 'default_gates' THEN
      FOR v_gate IN
        SELECT value FROM jsonb_array_elements(v_phase_data->'default_gates')
      LOOP
        INSERT INTO public.proposal_phase_gates (
          phase_id, gate_kind, payload, sort_order
        ) VALUES (
          v_phase_id,
          v_gate->>'gate_kind',
          COALESCE(v_gate->'payload', '{}'::jsonb),
          COALESCE((v_gate->>'sort_order')::integer, 0)
        );
      END LOOP;
    END IF;
  END LOOP;

  PERFORM public._assert_proposal_phase_topology(
    p_proposal_id, 'apply_phase_template result'
  );

  IF v_recovered_prefix_count > 0 THEN
    SELECT COALESCE(
             array_agg(phase.id ORDER BY phase.sort_order, phase.id),
             '{}'::uuid[]
           )
    INTO v_effect_phase_ids
    FROM public.proposal_phases AS phase
    WHERE phase.proposal_id = p_proposal_id;
  ELSE
    v_effect_phase_ids := v_inserted_phase_ids;
  END IF;

  PERFORM public._recompute_proposal_total_locked(p_proposal_id);

  INSERT INTO public.proposal_phase_template_applications (
    request_id, proposal_id, template_slug, phase_ids,
    effect_snapshot, created_by
  ) VALUES (
    p_request_id, p_proposal_id, p_template_slug,
    v_effect_phase_ids,
    public._proposal_phase_effect_snapshot(
      p_proposal_id, v_effect_phase_ids
    ),
    v_actor
  );

  FOREACH v_return_id IN ARRAY v_effect_phase_ids LOOP
    RETURN NEXT v_return_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_phase_template(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_phase_template(uuid, text, uuid)
  TO authenticated;


-- --------------------------------------------------------------------------
-- 4. Proposal -> project lineage carry without replacing activation
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.carry_project_phase_workflow_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source public.proposal_phases%ROWTYPE;
  v_project_proposal_id uuid;
BEGIN
  IF NEW.source_proposal_phase_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT project.proposal_id
    INTO v_project_proposal_id
  FROM public.projects AS project
  WHERE project.id = NEW.project_id;

  SELECT * INTO v_source
  FROM public.proposal_phases
  WHERE id = NEW.source_proposal_phase_id;

  IF NOT FOUND
     OR v_project_proposal_id IS NULL
     OR v_source.proposal_id IS DISTINCT FROM v_project_proposal_id
  THEN
    RAISE EXCEPTION
      'project phase source must belong to the project proposal'
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  NEW.canonical_stage_key := v_source.canonical_stage_key;
  NEW.workflow_track := v_source.workflow_track;
  NEW.source_template_slug := v_source.source_template_slug;
  NEW.source_template_version := v_source.source_template_version;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.carry_project_phase_workflow_metadata()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS carry_project_phase_workflow_metadata
  ON public.project_phases;
CREATE TRIGGER carry_project_phase_workflow_metadata
  BEFORE INSERT ON public.project_phases
  FOR EACH ROW EXECUTE FUNCTION public.carry_project_phase_workflow_metadata();

-- Receipt-backed legacy proposal applications are the only safe provenance
-- backfill. Rows without a receipt remain NULL. A unique blueprint match is
-- required; combined unclassified phases receive provenance but no guessed key.
WITH receipt AS (
  SELECT DISTINCT ON (application.proposal_id, phase_id)
         application.proposal_id,
         application.template_slug,
         phase_id
  FROM public.proposal_phase_template_applications AS application
  CROSS JOIN LATERAL unnest(application.phase_ids) AS requested(phase_id)
  ORDER BY application.proposal_id, phase_id,
           application.created_at, application.request_id
), blueprint_match AS (
  SELECT receipt.proposal_id,
         receipt.phase_id,
         receipt.template_slug,
         min(blueprint.value->>'canonical_stage_key') AS stage_key,
         min(blueprint.value->>'workflow_track') AS track,
         count(*) FILTER (
           WHERE blueprint.value ? 'canonical_stage_key'
             AND blueprint.value ? 'workflow_track'
         ) AS classified_count,
         count(*) AS match_count
  FROM receipt
  JOIN public.proposal_phases AS phase
    ON phase.id = receipt.phase_id
   AND phase.proposal_id = receipt.proposal_id
  JOIN public.phase_templates AS template
    ON template.slug = receipt.template_slug
   AND template.is_system
   AND template.version = 1
  JOIN LATERAL jsonb_array_elements(template.phases) AS blueprint(value)
    ON blueprint.value->>'phase_key' = phase.phase_key
   AND blueprint.value->>'name' = phase.name
  GROUP BY receipt.proposal_id, receipt.phase_id, receipt.template_slug
)
UPDATE public.proposal_phases AS phase
SET canonical_stage_key = CASE
      WHEN match.match_count = 1 AND match.classified_count = 1
        THEN match.stage_key
      ELSE phase.canonical_stage_key
    END,
    workflow_track = CASE
      WHEN match.match_count = 1 AND match.classified_count = 1
        THEN match.track
      ELSE phase.workflow_track
    END,
    source_template_slug = match.template_slug,
    source_template_version = 1
FROM blueprint_match AS match
WHERE phase.id = match.phase_id
  AND phase.proposal_id = match.proposal_id
  AND phase.canonical_stage_key IS NULL
  AND phase.workflow_track IS NULL
  AND phase.source_template_slug IS NULL
  AND phase.source_template_version IS NULL;

-- Existing activated phases can inherit only from their exact proposal source.
UPDATE public.project_phases AS project_phase
SET canonical_stage_key = source.canonical_stage_key,
    workflow_track = source.workflow_track,
    source_template_slug = source.source_template_slug,
    source_template_version = source.source_template_version
FROM public.proposal_phases AS source,
     public.projects AS project
WHERE project_phase.source_proposal_phase_id = source.id
  AND project.id = project_phase.project_id
  AND project.proposal_id = source.proposal_id
  AND project_phase.canonical_stage_key IS NULL
  AND project_phase.workflow_track IS NULL
  AND project_phase.source_template_slug IS NULL
  AND project_phase.source_template_version IS NULL;

-- Direct project seeding is the other existing template birth path. Preserve
-- the 00398 locked/create boundary and stamp the blueprint snapshot after each
-- checked create.
CREATE OR REPLACE FUNCTION public.seed_project_schedule_from_template(
  p_project_id uuid,
  p_template_slug text
)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_template public.phase_templates%ROWTYPE;
  v_phase_data jsonb;
  v_phase_id uuid;
  v_prev_phase_id uuid := NULL;
  v_sort integer := -1;
  v_previous_metadata_token text := current_setting(
    'app.phase_workflow_metadata_token', true
  );
  v_metadata_token_set boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'seed_project_schedule_from_template requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION
      'seed_project_schedule_from_template: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_phases
    WHERE project_id = p_project_id
  ) THEN
    RAISE EXCEPTION
      'project % already has phases; the schedule is never rebuilt (R100)',
      p_project_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT * INTO v_template
  FROM public.phase_templates
  WHERE slug = p_template_slug
    AND (is_system OR designer_id = v_actor)
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'template not found or access denied: %', p_template_slug
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM set_config(
    'app.phase_workflow_metadata_token',
    format(
      'phase_workflow_metadata:project_phases:%s:%s',
      p_project_id,
      pg_catalog.txid_current()
    ),
    true
  );
  v_metadata_token_set := true;

  FOR v_phase_data IN
    SELECT value
    FROM jsonb_array_elements(v_template.phases)
  LOOP
    v_sort := v_sort + 1;

    SELECT created.id
    INTO v_phase_id
    FROM public.create_project_phase(
      p_project_id => p_project_id,
      p_phase_key => v_phase_data->>'phase_key',
      p_name => v_phase_data->>'name',
      p_sort_order => v_sort,
      p_duration_days => (v_phase_data->>'duration_days')::integer,
      p_follows_phase_id => v_prev_phase_id,
      p_lane => COALESCE(v_phase_data->>'lane', 'main'),
      p_duration_weeks => (v_phase_data->>'duration_weeks')::integer,
      p_fee_cents => COALESCE((v_phase_data->>'fee_cents')::integer, 0),
      p_revision_limit => COALESCE(
        (v_phase_data->>'revision_limit')::integer,
        2
      ),
      p_deliverables => COALESCE(
        v_phase_data->'deliverables',
        '[]'::jsonb
      )
    ) AS created;

    UPDATE public.project_phases
    SET canonical_stage_key = NULLIF(
          v_phase_data->>'canonical_stage_key', ''
        ),
        workflow_track = NULLIF(v_phase_data->>'workflow_track', ''),
        source_template_slug = v_template.slug,
        source_template_version = v_template.version
    WHERE id = v_phase_id;

    RETURN NEXT v_phase_id;
    v_prev_phase_id := v_phase_id;
  END LOOP;

  PERFORM set_config(
    'app.phase_workflow_metadata_token',
    COALESCE(v_previous_metadata_token, ''),
    true
  );
  v_metadata_token_set := false;
EXCEPTION WHEN OTHERS THEN
  IF v_metadata_token_set THEN
    PERFORM set_config(
      'app.phase_workflow_metadata_token',
      COALESCE(v_previous_metadata_token, ''),
      true
    );
  END IF;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_project_schedule_from_template(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seed_project_schedule_from_template(uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.seed_project_schedule_from_template(uuid, text) IS
  'Checked 00398 project template birth path with canonical stage/track and '
  'template-version provenance snapshotted on each project phase.';

-- --------------------------------------------------------------------------
-- 5. Checked designer workflow read model over existing coordination truth
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_project_workflow(p_project_id uuid)
RETURNS TABLE (
  phase_id uuid,
  source_proposal_phase_id uuid,
  sort_order integer,
  phase_key text,
  canonical_stage_key text,
  workflow_track text,
  phase_name text,
  phase_status text,
  progress integer,
  lane text,
  follows_phase_id uuid,
  start_date date,
  target_end_date date,
  completed_at timestamptz,
  gate_note text,
  deliverables jsonb,
  template_provenance jsonb,
  advance_blocker_count integer,
  blocks_advance boolean,
  current_blockers jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION
      'get_project_workflow requires an authenticated designer'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id;

  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION
      'get_project_workflow: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT phase.id,
         phase.source_proposal_phase_id,
         phase.sort_order,
         phase.phase_key,
         phase.canonical_stage_key,
         phase.workflow_track,
         phase.name,
         phase.status,
         COALESCE(phase.progress, 0),
         phase.lane,
         phase.follows_phase_id,
         phase.start_date,
         phase.target_end_date,
         phase.completed_at,
         phase.gate_condition,
         COALESCE(deliverable_rollup.items, phase.deliverables, '[]'::jsonb),
         CASE
           WHEN phase.source_template_slug IS NULL THEN '{}'::jsonb
           ELSE jsonb_build_object(
             'slug', phase.source_template_slug,
             'version', phase.source_template_version
           )
         END,
         jsonb_array_length(blocker_rollup.phase_items),
         jsonb_array_length(blocker_rollup.phase_items) > 0,
         jsonb_build_object(
           'count',
             jsonb_array_length(blocker_rollup.phase_items)
             + jsonb_array_length(blocker_rollup.task_items)
             + jsonb_array_length(blocker_rollup.ffe_items),
           'phase', blocker_rollup.phase_items,
           'tasks', blocker_rollup.task_items,
           'ffe', blocker_rollup.ffe_items
         )
  FROM public.project_phases AS phase
  LEFT JOIN LATERAL (
    SELECT jsonb_agg(
             jsonb_build_object(
               'sourceDeliverableId', deliverable.id,
               'label', deliverable.label,
               'description', deliverable.description,
               'isRequired', deliverable.is_required,
               'sortOrder', deliverable.sort_order,
               'completedAt', deliverable.completed_at
             )
             ORDER BY deliverable.sort_order, deliverable.id
           ) AS items
    FROM public.proposal_phase_deliverables AS deliverable
    WHERE deliverable.phase_id = phase.source_proposal_phase_id
  ) AS deliverable_rollup ON true
  CROSS JOIN LATERAL (
    SELECT
      COALESCE((
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'id', decision.id,
                   'kind', 'coordination',
                   'title', decision.title,
                   'status', decision.status,
                   'coordinationKind', decision.coordination_kind,
                   'court', decision.court,
                   'dueDate', decision.due_date,
                   'isOverdue',
                     decision.due_date IS NOT NULL
                     AND decision.due_date < CURRENT_DATE
                 )
                 ORDER BY decision.due_date NULLS LAST,
                          decision.created_at, decision.id
               )
        FROM public.client_decisions AS decision
        WHERE decision.project_id = phase.project_id
          AND decision.phase_id = phase.id
          AND decision.status = 'pending'
          AND (
            decision.blocks_kind = 'phase'
            OR decision.blocking_status = 'blocks_phase'
          )
      ), '[]'::jsonb) AS phase_items,
      COALESCE((
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'id', task.id,
                   'kind', 'task',
                   'title', task.title,
                   'status', task.status,
                   'owner', task.owner,
                   'dueDate', task.due_date,
                   'isOverdue',
                     task.due_date IS NOT NULL
                     AND task.due_date < CURRENT_DATE,
                   'blockedByCoordinationId', task.blocked_by_item_id
                 )
                 ORDER BY task.due_date NULLS LAST,
                          task.sort_order, task.id
               )
        FROM public.project_tasks AS task
        WHERE task.project_id = phase.project_id
          AND task.status = 'blocked'
          AND (
            (
              phase.phase_key IS NOT NULL
              AND task.phase_key = phase.phase_key
              AND (
                SELECT count(*)
                FROM public.project_phases AS same_key
                WHERE same_key.project_id = phase.project_id
                  AND same_key.phase_key = phase.phase_key
              ) = 1
            )
            OR EXISTS (
              SELECT 1
              FROM public.client_decisions AS blocker
              WHERE blocker.id = task.blocked_by_item_id
                AND blocker.project_id = phase.project_id
                AND blocker.phase_id = phase.id
            )
          )
      ), '[]'::jsonb) AS task_items,
      COALESCE((
        SELECT jsonb_agg(
                 jsonb_build_object(
                   'id', item.id,
                   'kind', 'ffe',
                   'title', item.name,
                   'status', item.status,
                   'eta', item.eta,
                   'isOverdue',
                     item.eta IS NOT NULL AND item.eta < CURRENT_DATE,
                   'reason', item.blocked_reason,
                   'blockedByCoordinationId', item.blocked_by_decision_id
                 )
                 ORDER BY item.eta NULLS LAST, item.sort_order, item.id
               )
        FROM public.project_ffe_items AS item
        JOIN public.client_decisions AS blocker
          ON blocker.id = item.blocked_by_decision_id
         AND blocker.project_id = phase.project_id
         AND blocker.phase_id = phase.id
        WHERE item.project_id = phase.project_id
          AND item.blocked
      ), '[]'::jsonb) AS ffe_items
  ) AS blocker_rollup
  WHERE phase.project_id = v_project.id
  ORDER BY phase.sort_order, phase.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_project_workflow(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_project_workflow(uuid)
  TO authenticated;

COMMENT ON FUNCTION public.get_project_workflow(uuid) IS
  'Designer-authorized ordered project workflow read model. Returns the '
  'existing project_phases lifecycle, configured gate note, deliverables, '
  'template provenance, exact pending phase-decision advancement blockers, '
  'and informational task/FF&E work buckets. Duplicate or NULL phase keys '
  'never attribute a task without an exact linked decision. Overdue is '
  'metadata only and never changes phase state.';

-- Explicitly preserve the receipt table boundary after adding its column.
REVOKE ALL ON TABLE public.proposal_phase_template_applications
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.proposal_phase_template_applications
  TO service_role;
