-- ═══════════════════════════════════════════════════════════════════════════
-- 00398 — atomic project-phase topology mutations
-- Lineage: 00393_advance_project_phase_atomic_rpc.sql
--
-- Delete, create, and update schedule topology only through checked,
-- server-derived RPC boundaries. Before the boundary closes, repair the one
-- legacy shape whose intended topology is provable: multiple main-lane rows,
-- all still roots, with unique sort positions, monotone lifecycle order, at
-- most one live row, and no corrupt edge/cycle elsewhere in the project.
-- Everything else is preserved and surfaced through an author-scoped RLS
-- diagnostic instead of being guessed into a chain.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Legacy repair diagnostics ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.project_phase_topology_diagnostics (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  diagnostic_code text NOT NULL,
  phase_ids       uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  detected_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT project_phase_topology_diagnostics_project_code_key
    UNIQUE (project_id, diagnostic_code)
);

ALTER TABLE public.project_phase_topology_diagnostics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_phase_topology_diagnostics_author_select
  ON public.project_phase_topology_diagnostics;
CREATE POLICY project_phase_topology_diagnostics_author_select
  ON public.project_phase_topology_diagnostics
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.projects AS project
      WHERE project.id = project_phase_topology_diagnostics.project_id
        AND (
          project.designer_id = (SELECT auth.uid())
          OR EXISTS (
            SELECT 1
            FROM public.organization_members AS actor_membership
            JOIN public.organization_members AS owner_membership
              ON owner_membership.organization_id = actor_membership.organization_id
            JOIN public.organizations AS organization
              ON organization.id = actor_membership.organization_id
            WHERE actor_membership.user_id = (SELECT auth.uid())
              AND actor_membership.status = 'active'
              AND actor_membership.role <> 'guest'
              AND owner_membership.user_id = project.designer_id
              AND owner_membership.status = 'active'
              AND owner_membership.role <> 'guest'
              AND organization.type = 'design_studio'
              AND organization.status = 'active'
          )
        )
    )
  );

REVOKE ALL ON TABLE public.project_phase_topology_diagnostics
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.project_phase_topology_diagnostics
  TO authenticated;

COMMENT ON TABLE public.project_phase_topology_diagnostics IS
  'Author-visible, RLS-scoped records for legacy project-phase topology that '
  '00398 deliberately refused to infer or rewrite.';

-- All mutation RPCs call this only after the project row and its complete
-- phase graph are locked. It rejects corrupt legacy input before a write and
-- validates the resulting graph before commit. Cross-lane edges are legal;
-- ambiguity is about main-phase succession, not visual lanes matching.
CREATE OR REPLACE FUNCTION public._assert_project_phase_topology(
  p_project_id uuid,
  p_context text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_anchor_main_id uuid;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.project_phases AS child
    JOIN public.project_phases AS parent
      ON parent.id = child.follows_phase_id
    WHERE (child.project_id = p_project_id OR parent.project_id = p_project_id)
      AND child.project_id IS DISTINCT FROM parent.project_id
  ) THEN
    RAISE EXCEPTION '%: cross-project phase topology is unsupported', p_context
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    WITH RECURSIVE predecessor_walk(phase_id, path, cyclic) AS (
      SELECT phase.id, ARRAY[phase.id]::uuid[], false
      FROM public.project_phases AS phase
      WHERE phase.project_id = p_project_id

      UNION ALL

      SELECT parent.id,
             walk.path || parent.id,
             parent.id = ANY(walk.path)
      FROM predecessor_walk AS walk
      JOIN public.project_phases AS child
        ON child.id = walk.phase_id
       AND child.project_id = p_project_id
      JOIN public.project_phases AS parent
        ON parent.id = child.follows_phase_id
       AND parent.project_id = p_project_id
      WHERE NOT walk.cyclic
    )
    SELECT 1
    FROM predecessor_walk
    WHERE cyclic
  ) THEN
    RAISE EXCEPTION '%: canonical phase topology is cyclic', p_context
      USING ERRCODE = 'check_violation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.project_phases AS phase
    WHERE phase.project_id = p_project_id
      AND phase.lane = 'main'
      AND phase.follows_phase_id IS NOT NULL
    GROUP BY phase.follows_phase_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION '%: canonical main successor is ambiguous', p_context
      USING ERRCODE = 'check_violation';
  END IF;

  IF (
    SELECT count(*)
    FROM public.project_phases AS phase
    WHERE phase.project_id = p_project_id
      AND phase.lane = 'main'
      AND phase.status IN ('in_progress', 'delayed')
  ) > 1 THEN
    RAISE EXCEPTION '%: multiple live main phases are unsupported', p_context
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT phase.id
  INTO v_anchor_main_id
  FROM public.project_phases AS phase
  WHERE phase.project_id = p_project_id
    AND phase.lane = 'main'
    AND phase.status IN ('pending', 'in_progress', 'delayed')
  ORDER BY phase.id
  LIMIT 1;

  IF v_anchor_main_id IS NOT NULL AND EXISTS (
    WITH RECURSIVE component(id) AS (
      SELECT v_anchor_main_id

      UNION

      SELECT neighbor.id
      FROM component AS component_row
      JOIN public.project_phases AS current_phase
        ON current_phase.id = component_row.id
       AND current_phase.project_id = p_project_id
      JOIN public.project_phases AS neighbor
        ON neighbor.project_id = p_project_id
       AND (
         neighbor.id = current_phase.follows_phase_id
         OR neighbor.follows_phase_id = current_phase.id
       )
    )
    SELECT 1
    FROM public.project_phases AS unfinished_main
    WHERE unfinished_main.project_id = p_project_id
      AND unfinished_main.lane = 'main'
      AND unfinished_main.status IN ('pending', 'in_progress', 'delayed')
      AND NOT EXISTS (
        SELECT 1 FROM component WHERE component.id = unfinished_main.id
      )
  ) THEN
    RAISE EXCEPTION '%: canonical main successor is missing', p_context
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._assert_project_phase_topology(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;

-- Diagnose every multiple-main candidate that is not safe to repair. A
-- duplicate sort_order is treated as semantically ambiguous even though UUID
-- could mechanically break the tie: migration code must not invent intent.
WITH RECURSIVE
predecessor_walk(project_id, phase_id, path, cyclic) AS (
  SELECT phase.project_id,
         phase.id,
         ARRAY[phase.id]::uuid[],
         false
  FROM public.project_phases AS phase

  UNION ALL

  SELECT walk.project_id,
         parent.id,
         walk.path || parent.id,
         parent.id = ANY(walk.path)
  FROM predecessor_walk AS walk
  JOIN public.project_phases AS child
    ON child.id = walk.phase_id
   AND child.project_id = walk.project_id
  JOIN public.project_phases AS parent
    ON parent.id = child.follows_phase_id
   AND parent.project_id = walk.project_id
  WHERE NOT walk.cyclic
),
cycle_projects AS (
  SELECT DISTINCT project_id
  FROM predecessor_walk
  WHERE cyclic
),
ordered_main AS (
  SELECT phase.project_id,
         phase.id,
         phase.sort_order,
         phase.status,
         phase.follows_phase_id,
         CASE phase.status
           WHEN 'completed' THEN 0
           WHEN 'in_progress' THEN 1
           WHEN 'delayed' THEN 1
           WHEN 'pending' THEN 2
           ELSE 99
         END AS lifecycle_rank,
         lag(
           CASE phase.status
             WHEN 'completed' THEN 0
             WHEN 'in_progress' THEN 1
             WHEN 'delayed' THEN 1
             WHEN 'pending' THEN 2
             ELSE 99
           END
         ) OVER (
           PARTITION BY phase.project_id
           ORDER BY phase.sort_order, phase.id
         ) AS prior_lifecycle_rank
  FROM public.project_phases AS phase
  WHERE phase.lane = 'main'
),
candidate_stats AS (
  SELECT ordered.project_id,
         array_agg(ordered.id ORDER BY ordered.sort_order, ordered.id) AS phase_ids,
         count(*) AS main_count,
         bool_and(ordered.follows_phase_id IS NULL) AS all_root,
         count(DISTINCT ordered.sort_order) = count(*) AS stable_order,
         count(*) FILTER (
           WHERE ordered.prior_lifecycle_rank > ordered.lifecycle_rank
         ) = 0 AS lifecycle_monotone,
         count(*) FILTER (
           WHERE ordered.status IN ('in_progress', 'delayed')
         ) <= 1 AS at_most_one_live,
         NOT EXISTS (
           SELECT 1
           FROM public.project_phases AS child
           JOIN public.project_phases AS parent
             ON parent.id = child.follows_phase_id
           WHERE (child.project_id = ordered.project_id
                  OR parent.project_id = ordered.project_id)
             AND child.project_id IS DISTINCT FROM parent.project_id
         ) AS no_cross_project_edge,
         NOT EXISTS (
           SELECT 1
           FROM cycle_projects AS cycle_project
           WHERE cycle_project.project_id = ordered.project_id
         ) AS acyclic
  FROM ordered_main AS ordered
  GROUP BY ordered.project_id
  HAVING count(*) > 1
),
ambiguous AS (
  SELECT *
  FROM candidate_stats
  WHERE NOT (
    all_root
    AND stable_order
    AND lifecycle_monotone
    AND at_most_one_live
    AND no_cross_project_edge
    AND acyclic
  )
)
INSERT INTO public.project_phase_topology_diagnostics (
  project_id,
  diagnostic_code,
  phase_ids,
  details
)
SELECT ambiguous.project_id,
       'ambiguous_legacy_main_chain',
       ambiguous.phase_ids,
       jsonb_build_object(
         'all_main_rows_are_roots', ambiguous.all_root,
         'sort_order_is_unique', ambiguous.stable_order,
         'lifecycle_is_monotone', ambiguous.lifecycle_monotone,
         'at_most_one_live_main', ambiguous.at_most_one_live,
         'no_cross_project_edge', ambiguous.no_cross_project_edge,
         'acyclic', ambiguous.acyclic
       )
FROM ambiguous
ON CONFLICT (project_id, diagnostic_code) DO UPDATE
SET phase_ids = EXCLUDED.phase_ids,
    details = EXCLUDED.details,
    detected_at = now();

-- Repair only the safe set, linking each main row to its stable predecessor.
-- Thread rows and every cross-lane edge remain byte-for-byte untouched.
WITH RECURSIVE
predecessor_walk(project_id, phase_id, path, cyclic) AS (
  SELECT phase.project_id,
         phase.id,
         ARRAY[phase.id]::uuid[],
         false
  FROM public.project_phases AS phase

  UNION ALL

  SELECT walk.project_id,
         parent.id,
         walk.path || parent.id,
         parent.id = ANY(walk.path)
  FROM predecessor_walk AS walk
  JOIN public.project_phases AS child
    ON child.id = walk.phase_id
   AND child.project_id = walk.project_id
  JOIN public.project_phases AS parent
    ON parent.id = child.follows_phase_id
   AND parent.project_id = walk.project_id
  WHERE NOT walk.cyclic
),
cycle_projects AS (
  SELECT DISTINCT project_id
  FROM predecessor_walk
  WHERE cyclic
),
ordered_main AS (
  SELECT phase.project_id,
         phase.id,
         phase.sort_order,
         phase.status,
         phase.follows_phase_id,
         lag(phase.id) OVER (
           PARTITION BY phase.project_id
           ORDER BY phase.sort_order, phase.id
         ) AS predecessor_id,
         CASE phase.status
           WHEN 'completed' THEN 0
           WHEN 'in_progress' THEN 1
           WHEN 'delayed' THEN 1
           WHEN 'pending' THEN 2
           ELSE 99
         END AS lifecycle_rank,
         lag(
           CASE phase.status
             WHEN 'completed' THEN 0
             WHEN 'in_progress' THEN 1
             WHEN 'delayed' THEN 1
             WHEN 'pending' THEN 2
             ELSE 99
           END
         ) OVER (
           PARTITION BY phase.project_id
           ORDER BY phase.sort_order, phase.id
         ) AS prior_lifecycle_rank
  FROM public.project_phases AS phase
  WHERE phase.lane = 'main'
),
safe_projects AS (
  SELECT ordered.project_id
  FROM ordered_main AS ordered
  GROUP BY ordered.project_id
  HAVING count(*) > 1
     AND bool_and(ordered.follows_phase_id IS NULL)
     AND count(DISTINCT ordered.sort_order) = count(*)
     AND count(*) FILTER (
       WHERE ordered.prior_lifecycle_rank > ordered.lifecycle_rank
     ) = 0
     AND count(*) FILTER (
       WHERE ordered.status IN ('in_progress', 'delayed')
     ) <= 1
     AND NOT EXISTS (
       SELECT 1
       FROM public.project_phases AS child
       JOIN public.project_phases AS parent
         ON parent.id = child.follows_phase_id
       WHERE (child.project_id = ordered.project_id
              OR parent.project_id = ordered.project_id)
         AND child.project_id IS DISTINCT FROM parent.project_id
     )
     AND NOT EXISTS (
       SELECT 1
       FROM cycle_projects AS cycle_project
       WHERE cycle_project.project_id = ordered.project_id
     )
)
UPDATE public.project_phases AS phase
SET follows_phase_id = ordered.predecessor_id,
    updated_at = now()
FROM ordered_main AS ordered
JOIN safe_projects AS safe_project
  ON safe_project.project_id = ordered.project_id
WHERE phase.id = ordered.id
  AND ordered.predecessor_id IS NOT NULL
  AND phase.follows_phase_id IS NULL;

-- ─── Checked phase creation ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.create_project_phase(
  p_project_id uuid,
  p_phase_key text,
  p_name text,
  p_sort_order integer DEFAULT 0,
  p_duration_days integer DEFAULT NULL,
  p_anchor_date date DEFAULT NULL,
  p_follows_phase_id uuid DEFAULT NULL,
  p_lane text DEFAULT 'main',
  p_duration_weeks integer DEFAULT NULL,
  p_fee_cents integer DEFAULT 0,
  p_revision_limit integer DEFAULT 2,
  p_deliverables jsonb DEFAULT '[]'::jsonb
)
RETURNS public.project_phases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_created public.project_phases%ROWTYPE;
  v_guard_prior text;
  v_guard_set boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'create_project_phase requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF btrim(COALESCE(p_name, '')) = '' THEN
    RAISE EXCEPTION 'create_project_phase: name is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_phase_key IS NOT NULL AND btrim(p_phase_key) = '' THEN
    RAISE EXCEPTION 'create_project_phase: phase_key cannot be blank'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_lane NOT IN ('main', 'thread') THEN
    RAISE EXCEPTION 'create_project_phase: lane must be main or thread'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_duration_days IS NOT NULL AND p_duration_days <= 0 THEN
    RAISE EXCEPTION 'create_project_phase: duration_days must be positive'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_duration_weeks IS NOT NULL AND p_duration_weeks <= 0 THEN
    RAISE EXCEPTION 'create_project_phase: duration_weeks must be positive'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_deliverables IS NULL OR jsonb_typeof(p_deliverables) <> 'array' THEN
    RAISE EXCEPTION 'create_project_phase: deliverables must be a JSON array'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  -- Parent first serializes topology writers and conflicts with concurrent
  -- phase FK inserts. The deterministic full-graph lock freezes predecessors,
  -- roots, and main-successor cardinality for both assertions.
  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'create_project_phase: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM phase.id
  FROM public.project_phases AS phase
  WHERE phase.project_id = p_project_id
  ORDER BY phase.id
  FOR UPDATE;

  PERFORM public._assert_project_phase_topology(
    p_project_id,
    'create_project_phase'
  );

  IF p_follows_phase_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.project_phases AS predecessor
    WHERE predecessor.id = p_follows_phase_id
      AND predecessor.project_id = p_project_id
  ) THEN
    RAISE EXCEPTION
      'create_project_phase: predecessor does not belong to project'
      USING ERRCODE = 'check_violation';
  END IF;

  v_guard_prior := current_setting('app.project_phase_topology_token', true);
  PERFORM set_config(
    'app.project_phase_topology_token',
    format('create_project_phase:%s:%s', p_project_id, pg_catalog.txid_current()),
    true
  );
  v_guard_set := true;

  INSERT INTO public.project_phases (
    project_id,
    phase_key,
    name,
    status,
    progress,
    sort_order,
    duration_days,
    anchor_date,
    follows_phase_id,
    lane,
    duration_weeks,
    fee_cents,
    revision_limit,
    deliverables
  ) VALUES (
    p_project_id,
    CASE WHEN p_phase_key IS NULL THEN NULL ELSE btrim(p_phase_key) END,
    btrim(p_name),
    'pending',
    0,
    p_sort_order,
    p_duration_days,
    p_anchor_date,
    p_follows_phase_id,
    p_lane,
    p_duration_weeks,
    p_fee_cents,
    p_revision_limit,
    p_deliverables
  )
  RETURNING * INTO v_created;

  PERFORM public._assert_project_phase_topology(
    p_project_id,
    'create_project_phase'
  );

  PERFORM set_config(
    'app.project_phase_topology_token', COALESCE(v_guard_prior, ''), true
  );
  v_guard_set := false;
  RETURN v_created;
EXCEPTION WHEN OTHERS THEN
  IF v_guard_set THEN
    PERFORM set_config(
      'app.project_phase_topology_token', COALESCE(v_guard_prior, ''), true
    );
  END IF;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.create_project_phase(
  uuid, text, text, integer, integer, date, uuid, text,
  integer, integer, integer, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_project_phase(
  uuid, text, text, integer, integer, date, uuid, text,
  integer, integer, integer, jsonb
) TO authenticated;

COMMENT ON FUNCTION public.create_project_phase(
  uuid, text, text, integer, integer, date, uuid, text,
  integer, integer, integer, jsonb
) IS
  'Authenticated exact project/studio author phase creation. Locks and checks '
  'the complete project topology, derives pending/zero lifecycle state on the '
  'server, inserts one exact row, and validates the resulting graph.';

-- ─── Checked phase patching ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.update_project_phase(
  p_project_id uuid,
  p_phase_id uuid,
  p_expected_updated_at timestamptz,
  p_patch jsonb
)
RETURNS public.project_phases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_target public.project_phases%ROWTYPE;
  v_updated public.project_phases%ROWTYPE;
  v_follows_phase_id uuid;
  v_guard_prior text;
  v_guard_set boolean := false;
  v_live_main_count integer;
  v_live_main_label text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'update_project_phase requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF p_expected_updated_at IS NULL THEN
    RAISE EXCEPTION 'update_project_phase: expected_updated_at is required'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_patch IS NULL
     OR jsonb_typeof(p_patch) <> 'object'
     OR p_patch = '{}'::jsonb THEN
    RAISE EXCEPTION 'update_project_phase: patch must be a non-empty JSON object'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_patch) AS patch_key(key)
    WHERE patch_key.key NOT IN (
      'name',
      'phase_key',
      'sort_order',
      'duration_days',
      'anchor_date',
      'follows_phase_id',
      'lane'
    )
  ) THEN
    RAISE EXCEPTION 'update_project_phase: patch contains an unsupported field'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_patch ? 'name'
     AND btrim(COALESCE(p_patch->>'name', '')) = '' THEN
    RAISE EXCEPTION 'update_project_phase: name cannot be blank'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_patch ? 'phase_key'
     AND jsonb_typeof(p_patch->'phase_key') <> 'null'
     AND btrim(COALESCE(p_patch->>'phase_key', '')) = '' THEN
    RAISE EXCEPTION 'update_project_phase: phase_key cannot be blank'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_patch ? 'lane'
     AND COALESCE(p_patch->>'lane', '') NOT IN ('main', 'thread') THEN
    RAISE EXCEPTION 'update_project_phase: lane must be main or thread'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_patch ? 'duration_days'
     AND jsonb_typeof(p_patch->'duration_days') <> 'null'
     AND (p_patch->>'duration_days')::integer <= 0 THEN
    RAISE EXCEPTION 'update_project_phase: duration_days must be positive'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'update_project_phase: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM phase.id
  FROM public.project_phases AS phase
  WHERE phase.project_id = p_project_id
  ORDER BY phase.id
  FOR UPDATE;

  SELECT * INTO v_target
  FROM public.project_phases AS phase
  WHERE phase.id = p_phase_id
    AND phase.project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_project_phase: phase does not belong to project'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The caller-observed row timestamp is the compare-and-swap token. Project
  -- locking serializes writers; the loser that wakes after a committed edit
  -- sees a new timestamp and fails instead of silently applying stale intent.
  IF v_target.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION
      'update_project_phase: phase changed since it was read'
      USING ERRCODE = 'serialization_failure';
  END IF;

  IF v_target.status <> 'pending'
     AND (
       p_patch ? 'phase_key'
       OR p_patch ? 'lane'
       OR p_patch ? 'follows_phase_id'
     ) THEN
    RAISE EXCEPTION
      'update_project_phase: phase_key, lane, and follows_phase_id are immutable after pending'
      USING ERRCODE = 'check_violation';
  END IF;

  PERFORM public._assert_project_phase_topology(
    p_project_id,
    'update_project_phase'
  );

  v_follows_phase_id := CASE
    WHEN NOT (p_patch ? 'follows_phase_id') THEN v_target.follows_phase_id
    WHEN jsonb_typeof(p_patch->'follows_phase_id') = 'null' THEN NULL
    ELSE (p_patch->>'follows_phase_id')::uuid
  END;

  IF v_follows_phase_id = p_phase_id THEN
    RAISE EXCEPTION 'update_project_phase: a phase cannot follow itself'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_follows_phase_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.project_phases AS predecessor
    WHERE predecessor.id = v_follows_phase_id
      AND predecessor.project_id = p_project_id
  ) THEN
    RAISE EXCEPTION
      'update_project_phase: predecessor does not belong to project'
      USING ERRCODE = 'check_violation';
  END IF;

  v_guard_prior := current_setting('app.project_phase_topology_token', true);
  PERFORM set_config(
    'app.project_phase_topology_token',
    format('update_project_phase:%s:%s', p_project_id, pg_catalog.txid_current()),
    true
  );
  v_guard_set := true;

  UPDATE public.project_phases AS phase
  SET name = CASE
        WHEN p_patch ? 'name' THEN btrim(p_patch->>'name')
        ELSE phase.name
      END,
      phase_key = CASE
        WHEN NOT (p_patch ? 'phase_key') THEN phase.phase_key
        WHEN jsonb_typeof(p_patch->'phase_key') = 'null' THEN NULL
        ELSE btrim(p_patch->>'phase_key')
      END,
      sort_order = CASE
        WHEN p_patch ? 'sort_order' THEN (p_patch->>'sort_order')::integer
        ELSE phase.sort_order
      END,
      duration_days = CASE
        WHEN NOT (p_patch ? 'duration_days') THEN phase.duration_days
        WHEN jsonb_typeof(p_patch->'duration_days') = 'null' THEN NULL
        ELSE (p_patch->>'duration_days')::integer
      END,
      anchor_date = CASE
        WHEN NOT (p_patch ? 'anchor_date') THEN phase.anchor_date
        WHEN jsonb_typeof(p_patch->'anchor_date') = 'null' THEN NULL
        ELSE (p_patch->>'anchor_date')::date
      END,
      follows_phase_id = v_follows_phase_id,
      lane = CASE
        WHEN p_patch ? 'lane' THEN p_patch->>'lane'
        ELSE phase.lane
      END,
      updated_at = clock_timestamp()
  WHERE phase.id = p_phase_id
    AND phase.project_id = p_project_id
  RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'update_project_phase: phase changed during update'
      USING ERRCODE = 'serialization_failure';
  END IF;

  PERFORM public._assert_project_phase_topology(
    p_project_id,
    'update_project_phase'
  );

  -- phase_key and lane participate in the live-main projection. Keep the
  -- project pointer transactionally consistent when either one changes.
  IF p_patch ? 'phase_key' OR p_patch ? 'lane' THEN
    SELECT count(*),
           (array_agg(
             COALESCE(NULLIF(phase.phase_key, ''), phase.name)
             ORDER BY phase.id
           ))[1]
    INTO v_live_main_count, v_live_main_label
    FROM public.project_phases AS phase
    WHERE phase.project_id = p_project_id
      AND phase.lane = 'main'
      AND phase.status IN ('in_progress', 'delayed');

    UPDATE public.projects
    SET current_phase = CASE
          WHEN v_live_main_count = 0 THEN NULL
          ELSE v_live_main_label
        END,
        updated_at = now()
    WHERE id = p_project_id;
  END IF;

  PERFORM set_config(
    'app.project_phase_topology_token', COALESCE(v_guard_prior, ''), true
  );
  v_guard_set := false;
  RETURN v_updated;
EXCEPTION WHEN OTHERS THEN
  IF v_guard_set THEN
    PERFORM set_config(
      'app.project_phase_topology_token', COALESCE(v_guard_prior, ''), true
    );
  END IF;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.update_project_phase(uuid, uuid, timestamptz, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_project_phase(uuid, uuid, timestamptz, jsonb)
  TO authenticated;

COMMENT ON FUNCTION public.update_project_phase(uuid, uuid, timestamptz, jsonb) IS
  'Authenticated exact project/studio author patch over the allowlisted phase '
  'fields name, phase_key, sort_order, duration_days, anchor_date, '
  'follows_phase_id, and lane. Requires the caller-observed updated_at CAS '
  'token; locks and validates topology before and after the exact-ID update; '
  'phase_key/lane/follows become immutable after pending, and project_id plus '
  'lifecycle fields are never patchable.';

-- ─── Server-derived pending phase deletion ────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_project_phase(
  p_project_id uuid,
  p_phase_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_project public.projects%ROWTYPE;
  v_target public.project_phases%ROWTYPE;
  v_predecessor_phase_id uuid;
  v_follower_ids uuid[] := ARRAY[]::uuid[];
  v_follower_count integer := 0;
  v_rows integer := 0;
  v_guard_prior text;
  v_guard_set boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'delete_project_phase requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Project → complete project phase graph → every direct follower is the
  -- global lock order shared by all 00398 mutation boundaries. The target row
  -- lock conflicts with new FK children, so no follower can appear after the
  -- server derives the complete relink set.
  SELECT * INTO v_project
  FROM public.projects
  WHERE id = p_project_id
  FOR UPDATE;

  IF NOT FOUND OR NOT public._can_author_proposal(v_project.designer_id) THEN
    RAISE EXCEPTION 'delete_project_phase: project not found or access denied'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  PERFORM phase.id
  FROM public.project_phases AS phase
  WHERE phase.project_id = p_project_id
  ORDER BY phase.id
  FOR UPDATE;

  SELECT * INTO v_target
  FROM public.project_phases AS phase
  WHERE phase.id = p_phase_id
    AND phase.project_id = p_project_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'delete_project_phase: phase does not belong to project'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Lock direct followers explicitly, including corrupt foreign followers.
  -- The topology assertion below then fails closed before any mutation.
  PERFORM follower.id
  FROM public.project_phases AS follower
  WHERE follower.follows_phase_id = p_phase_id
  ORDER BY follower.id
  FOR UPDATE;

  PERFORM public._assert_project_phase_topology(
    p_project_id,
    'delete_project_phase'
  );

  IF v_target.status <> 'pending' THEN
    RAISE EXCEPTION 'delete_project_phase: only pending phases may be deleted'
      USING ERRCODE = 'check_violation';
  END IF;

  v_predecessor_phase_id := v_target.follows_phase_id;

  SELECT COALESCE(array_agg(follower.id ORDER BY follower.id), ARRAY[]::uuid[]),
         count(*)
  INTO v_follower_ids, v_follower_count
  FROM public.project_phases AS follower
  WHERE follower.project_id = p_project_id
    AND follower.follows_phase_id = p_phase_id;

  v_guard_prior := current_setting('app.project_phase_topology_token', true);
  PERFORM set_config(
    'app.project_phase_topology_token',
    format('delete_project_phase:%s:%s', p_project_id, pg_catalog.txid_current()),
    true
  );
  v_guard_set := true;

  UPDATE public.project_phases AS follower
  SET follows_phase_id = v_predecessor_phase_id,
      updated_at = clock_timestamp()
  WHERE follower.project_id = p_project_id
    AND follower.follows_phase_id = p_phase_id;
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> v_follower_count THEN
    RAISE EXCEPTION 'delete_project_phase: follower set changed during relink'
      USING ERRCODE = 'serialization_failure';
  END IF;

  DELETE FROM public.project_phases AS phase
  WHERE phase.id = p_phase_id
    AND phase.project_id = p_project_id
    AND phase.status = 'pending';
  GET DIAGNOSTICS v_rows = ROW_COUNT;

  IF v_rows <> 1 THEN
    RAISE EXCEPTION 'delete_project_phase: phase changed during delete'
      USING ERRCODE = 'serialization_failure';
  END IF;

  PERFORM public._assert_project_phase_topology(
    p_project_id,
    'delete_project_phase'
  );

  PERFORM set_config(
    'app.project_phase_topology_token', COALESCE(v_guard_prior, ''), true
  );
  v_guard_set := false;

  RETURN jsonb_build_object(
    'deleted_phase_id', p_phase_id,
    'predecessor_phase_id', v_predecessor_phase_id,
    'relinked_phase_ids', v_follower_ids
  );
EXCEPTION WHEN OTHERS THEN
  IF v_guard_set THEN
    PERFORM set_config(
      'app.project_phase_topology_token', COALESCE(v_guard_prior, ''), true
    );
  END IF;
  RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_project_phase(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_project_phase(uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.delete_project_phase(uuid, uuid) IS
  'Authenticated exact project/studio author pending-only delete. Locks the '
  'project, complete phase graph, target, and every direct follower; derives '
  'the deleted predecessor on the server; relinks every direct follower to it '
  'without changing lanes; validates the final graph; and returns exactly '
  '{deleted_phase_id,predecessor_phase_id,relinked_phase_ids}.';

-- ─── Direct topology-write closure ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.guard_project_phase_topology_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rpc_owner text;
  v_project_id uuid;
  v_operation text;
  v_expected_token text;
  v_delete_token text;
  v_rpc_authorized boolean := false;
  v_owner_maint boolean := false;
BEGIN
  SELECT pg_catalog.pg_get_userbyid(proc.proowner)
  INTO v_rpc_owner
  FROM pg_catalog.pg_proc AS proc
  WHERE proc.oid =
    'public.delete_project_phase(uuid,uuid)'::pg_catalog.regprocedure;

  v_project_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.project_id
    ELSE NEW.project_id
  END;
  v_operation := CASE
    WHEN TG_OP = 'INSERT' THEN 'create_project_phase'
    WHEN TG_OP = 'DELETE' THEN 'delete_project_phase'
    ELSE 'update_project_phase'
  END;
  v_expected_token := format(
    '%s:%s:%s',
    v_operation,
    v_project_id,
    pg_catalog.txid_current()
  );
  v_delete_token := format(
    'delete_project_phase:%s:%s',
    v_project_id,
    pg_catalog.txid_current()
  );
  v_rpc_authorized := current_user = v_rpc_owner
    AND (
      current_setting('app.project_phase_topology_token', true) = v_expected_token
      OR (
        TG_OP = 'UPDATE'
        AND current_setting('app.project_phase_topology_token', true) = v_delete_token
      )
    );
  v_owner_maint := current_user = v_rpc_owner
    AND session_user = v_rpc_owner
    AND COALESCE(current_setting('role', true), 'none') = 'none';

  IF TG_OP = 'INSERT' THEN
    IF NOT (v_rpc_authorized OR v_owner_maint) THEN
      RAISE EXCEPTION
        'project_phases topology inserts are writable only through create_project_phase'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (
      NEW.project_id IS DISTINCT FROM OLD.project_id
      OR NEW.phase_key IS DISTINCT FROM OLD.phase_key
      OR NEW.lane IS DISTINCT FROM OLD.lane
      OR NEW.follows_phase_id IS DISTINCT FROM OLD.follows_phase_id
    ) AND NOT (v_rpc_authorized OR v_owner_maint) THEN
      RAISE EXCEPTION
        'project_phases project_id, phase_key, lane, and follows_phase_id are writable only through checked phase RPCs'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;

  IF NOT (v_rpc_authorized OR v_owner_maint) THEN
    RAISE EXCEPTION
      'project_phases rows are deletable only through delete_project_phase'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN OLD;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_project_phase_topology_write()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS c_guard_project_phase_topology_write_trg
  ON public.project_phases;
CREATE TRIGGER c_guard_project_phase_topology_write_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.project_phases
  FOR EACH ROW EXECUTE FUNCTION public.guard_project_phase_topology_write();

-- 00066 created updated_at but never installed a touch trigger. A CAS token is
-- authoritative only if every update path advances it, including legacy
-- date/estimate writes and commit_schedule_edit's duration/anchor branches.
CREATE OR REPLACE FUNCTION public.touch_project_phase_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_project_phase_updated_at()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS z_touch_project_phase_updated_at_trg
  ON public.project_phases;
CREATE TRIGGER z_touch_project_phase_updated_at_trg
  BEFORE UPDATE ON public.project_phases
  FOR EACH ROW EXECUTE FUNCTION public.touch_project_phase_updated_at();

COMMENT ON FUNCTION public.guard_project_phase_topology_write() IS
  'Closes direct authenticated INSERT/DELETE and mutations of project_id, '
  'phase_key, lane, or follows_phase_id. Requires the exact checked-RPC owner '
  'plus its transaction-local operation token; unassumed owner maintenance '
  'remains available for migrations and deterministic SQL fixtures.';

-- ─── 00324 project birth-path regrafts ────────────────────────────────────

-- Lineage: 00324_schedule_compose.sql. The template semantics are unchanged;
-- project phase creation now crosses the checked 00398 boundary one row at a
-- time under one already-held project lock.
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
  v_template record;
  v_phase_data jsonb;
  v_phase_id uuid;
  v_prev_phase_id uuid := NULL;
  v_sort integer := -1;
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

  -- R100: a schedule is created once and never rebuilt. The project lock makes
  -- the empty check authoritative against every 00398 writer.
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
  WHERE slug = p_template_slug;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'template not found: %', p_template_slug
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

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

    RETURN NEXT v_phase_id;
    v_prev_phase_id := v_phase_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.seed_project_schedule_from_template(uuid, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.seed_project_schedule_from_template(uuid, text)
  TO authenticated;

COMMENT ON FUNCTION public.seed_project_schedule_from_template(uuid, text) IS
  '00324 template birth semantics through create_project_phase: one locked, '
  'never-rebuilt project; exact designer/design-studio author; server-derived '
  'pending lifecycle and checked linear topology.';

-- Lineage: 00324_schedule_compose.sql. Proposal-target copying remains the
-- original direct proposal_phases insert. Project-target copying now uses the
-- checked project-phase create boundary and stable source ordering.
CREATE OR REPLACE FUNCTION public.copy_schedule_as_built(
  p_source_project_id uuid,
  p_target_proposal_id uuid DEFAULT NULL,
  p_target_project_id uuid DEFAULT NULL
)
RETURNS SETOF uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_source_project public.projects%ROWTYPE;
  v_target_project public.projects%ROWTYPE;
  v_target_proposal public.proposals%ROWTYPE;
  v_src record;
  v_duration integer;
  v_new_phase_id uuid;
  v_prev_phase_id uuid := NULL;
  v_sort integer := -1;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'copy_schedule_as_built requires an authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF (p_target_proposal_id IS NULL) = (p_target_project_id IS NULL) THEN
    RAISE EXCEPTION
      'exactly one of p_target_proposal_id / p_target_project_id must be provided'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_target_project_id IS NOT NULL THEN
    -- Stable UUID order prevents inverse source/target copies from deadlocking.
    PERFORM project.id
    FROM public.projects AS project
    WHERE project.id IN (p_source_project_id, p_target_project_id)
    ORDER BY project.id
    FOR UPDATE;

    SELECT * INTO v_source_project
    FROM public.projects
    WHERE id = p_source_project_id;

    SELECT * INTO v_target_project
    FROM public.projects
    WHERE id = p_target_project_id;

    IF v_source_project.id IS NULL
       OR NOT public._can_author_proposal(v_source_project.designer_id) THEN
      RAISE EXCEPTION
        'copy_schedule_as_built: source project not found or access denied'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF v_target_project.id IS NULL
       OR NOT public._can_author_proposal(v_target_project.designer_id) THEN
      RAISE EXCEPTION
        'copy_schedule_as_built: target project not found or access denied'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.project_phases
      WHERE project_id = p_target_project_id
    ) THEN
      RAISE EXCEPTION
        'target project % already has phases; the schedule is never rebuilt (R100)',
        p_target_project_id
        USING ERRCODE = 'check_violation';
    END IF;
  ELSE
    SELECT * INTO v_source_project
    FROM public.projects
    WHERE id = p_source_project_id
    FOR UPDATE;

    IF NOT FOUND
       OR NOT public._can_author_proposal(v_source_project.designer_id) THEN
      RAISE EXCEPTION
        'copy_schedule_as_built: source project not found or access denied'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    SELECT * INTO v_target_proposal
    FROM public.proposals
    WHERE id = p_target_proposal_id
    FOR UPDATE;

    -- Preserve 00324's proposal-side exact-owner authority.
    IF NOT FOUND OR v_target_proposal.designer_id IS DISTINCT FROM v_actor THEN
      RAISE EXCEPTION
        'copy_schedule_as_built: target proposal not found or access denied'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.proposal_phases
      WHERE proposal_id = p_target_proposal_id
    ) THEN
      RAISE EXCEPTION
        'target proposal % already has phases; the schedule is never rebuilt (R100)',
        p_target_proposal_id
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  PERFORM phase.id
  FROM public.project_phases AS phase
  WHERE phase.project_id = p_source_project_id
  ORDER BY phase.id
  FOR UPDATE;

  PERFORM public._assert_project_phase_topology(
    p_source_project_id,
    'copy_schedule_as_built source'
  );

  FOR v_src IN
    SELECT *
    FROM public.project_phases
    WHERE project_id = p_source_project_id
    ORDER BY sort_order, id
  LOOP
    v_sort := v_sort + 1;

    IF v_src.start_date IS NOT NULL
       AND COALESCE(v_src.completed_at::date, v_src.target_end_date) IS NOT NULL THEN
      v_duration := GREATEST(
        1,
        COALESCE(v_src.completed_at::date, v_src.target_end_date)
          - v_src.start_date
      );
    ELSE
      v_duration := COALESCE(
        v_src.duration_days,
        v_src.duration_weeks * 7,
        14
      );
    END IF;

    IF p_target_proposal_id IS NOT NULL THEN
      INSERT INTO public.proposal_phases (
        proposal_id,
        name,
        phase_key,
        duration_days,
        lane,
        follows_phase_id,
        sort_order
      ) VALUES (
        p_target_proposal_id,
        v_src.name,
        v_src.phase_key,
        v_duration,
        COALESCE(v_src.lane, 'main'),
        v_prev_phase_id,
        v_sort
      )
      RETURNING id INTO v_new_phase_id;
    ELSE
      SELECT created.id
      INTO v_new_phase_id
      FROM public.create_project_phase(
        p_project_id => p_target_project_id,
        p_phase_key => v_src.phase_key,
        p_name => v_src.name,
        p_sort_order => v_sort,
        p_duration_days => v_duration,
        p_follows_phase_id => v_prev_phase_id,
        p_lane => COALESCE(v_src.lane, 'main')
      ) AS created;
    END IF;

    RETURN NEXT v_new_phase_id;
    v_prev_phase_id := v_new_phase_id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.copy_schedule_as_built(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.copy_schedule_as_built(uuid, uuid, uuid)
  TO authenticated;

COMMENT ON FUNCTION public.copy_schedule_as_built(uuid, uuid, uuid) IS
  '00324 as-built duration semantics with stable source locks/order. Project '
  'targets cross create_project_phase for exact author authority and checked '
  'topology; proposal targets preserve the original exact-owner path.';
