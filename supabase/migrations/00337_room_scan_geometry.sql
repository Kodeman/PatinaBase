-- ═══════════════════════════════════════════════════════════════════════════
-- 00337 — Room scan geometry spine (Room View · Phase 1.1)
--
-- The serial anchor of the Room View data spine. Parses one CapturedRoom scan
-- into normalized geometry rows that the Plan (SVG) and Orbit (three.js)
-- projections both read from ONE geometry object (per the room-view-package
-- architecture ruling — one geometry, two projections).
--
-- Additive schema only. Two tables + two write RPCs, both service-role only:
--   • public.room_scan_geometry           — one header row per parsed scan
--   • public.room_scan_geometry_elements  — walls / openings / objects
--   • replace_room_scan_geometry(...)      — atomic parse landing (upsert+swap)
--   • mark_room_scan_geometry_error(...)   — record a parse failure
--
-- RLS delegates read visibility to the scan's own row security on
-- public.room_scans (owner / designer-association / studio-co-member all
-- compose automatically — 00014, 00020, 00316). Writes are service-role only;
-- no INSERT/UPDATE/DELETE policies exist.
--
-- Frame convention (documented for the parser + projections):
--   plan frame, origin NW, feet; x → east, z → south. Yaw/offset carried on the
--   header so the raw ARKit world frame can be reconstructed if ever needed.
--
-- Wall thickness is NULL by default: RoomPlan walls are planes, so thickness is
-- a drawing convention, never fabricated as a captured fact.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Header: one row per parsed scan ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.room_scan_geometry (
  scan_id               uuid PRIMARY KEY REFERENCES public.room_scans(id) ON DELETE CASCADE,

  -- parse lifecycle
  parse_status          text NOT NULL DEFAULT 'pending'
                          CHECK (parse_status IN ('pending','parsed','error')),
  parse_error           text,
  parse_attempts        integer NOT NULL DEFAULT 0,
  parsed_at             timestamptz,

  -- provenance / idempotency
  parser_version        integer NOT NULL DEFAULT 0,   -- bump forces fleet re-parse
  source_schema_version text,
  source_etag           text,                         -- source object idempotency key

  -- frame
  units                 text NOT NULL DEFAULT 'ft',
  origin_yaw_deg        numeric,
  origin_offset_m       jsonb,

  -- overall dimensions (feet)
  width_ft              numeric,
  depth_ft              numeric,
  wall_height_ft        numeric,
  wall_thickness_ft     numeric,   -- NULL: planes have no captured thickness

  -- floor
  floor_polygon         jsonb,     -- [[x,z],…] feet, plan frame origin NW, x→east z→south
  floor_area_sqft       numeric,

  -- confidence rollup: {high:int, medium:int, low:int}
  confidence_summary    jsonb,

  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  public.room_scan_geometry IS
  'Room View geometry header — one row per parsed room_scans scan. Written by service-role RPCs only; read via delegated room_scans RLS.';
COMMENT ON COLUMN public.room_scan_geometry.wall_thickness_ft IS
  'NULL by default — RoomPlan walls are planes; thickness is a drawing convention, never a captured fact.';
COMMENT ON COLUMN public.room_scan_geometry.parser_version IS
  'Bumping this value forces the fleet to re-parse (compare against the running parser version at ingest).';

-- ─── Elements: walls / openings / objects ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.room_scan_geometry_elements (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id         uuid NOT NULL REFERENCES public.room_scans(id) ON DELETE CASCADE,

  kind            text NOT NULL CHECK (kind IN ('wall','window','door','opening','object')),
  apple_id        uuid,                    -- RoomPlan element identifier (stable per scan)
  confidence      text CHECK (confidence IN ('high','medium','low')),
  label           text,
  position        integer,                 -- render / list order within the scan

  -- Wall geometry (plan frame feet): endpoints + height; thickness NULL
  x1_ft           numeric,
  z1_ft           numeric,
  x2_ft           numeric,
  z2_ft           numeric,
  height_ft       numeric,                 -- shared: wall / opening head-height / object height
  thickness_ft    numeric,                 -- walls only, NULL (drawing convention)

  -- Opening geometry (window / door / opening): position along the parent wall
  wall_element_id uuid REFERENCES public.room_scan_geometry_elements(id) ON DELETE SET NULL,
  from_ft         numeric,                 -- start offset along the wall run
  to_ft           numeric,                 -- end offset along the wall run
  sill_ft         numeric,                 -- window sill height
  head_ft         numeric,                 -- window/door head height
  width_ft        numeric,                 -- shared: opening width / object width (x-extent)
  swing           text CHECK (swing IN ('left','right')),   -- doors, NULL otherwise
  swing_inward    boolean,                                   -- doors, NULL otherwise

  -- Object geometry (detected furniture, oriented box in the plan frame)
  cat             text,                    -- category, e.g. 'sofa', 'table'
  center_x_ft     numeric,
  center_z_ft     numeric,
  depth_ft        numeric,                 -- object z-extent
  rotation_deg    numeric,

  extras          jsonb NOT NULL DEFAULT '{}',

  created_at      timestamptz NOT NULL DEFAULT now(),

  -- a RoomPlan element identifier is unique within a scan
  CONSTRAINT rsge_scan_apple_uniq UNIQUE (scan_id, apple_id),

  -- an element also FKs the header, so elements cannot exist without a header row
  CONSTRAINT rsge_header_fk
    FOREIGN KEY (scan_id) REFERENCES public.room_scan_geometry(scan_id) ON DELETE CASCADE,

  -- per-kind required-field shape
  CONSTRAINT rsge_wall_shape CHECK (
    kind <> 'wall' OR (
      x1_ft IS NOT NULL AND z1_ft IS NOT NULL AND
      x2_ft IS NOT NULL AND z2_ft IS NOT NULL AND
      height_ft IS NOT NULL
    )
  ),
  CONSTRAINT rsge_opening_shape CHECK (
    kind NOT IN ('window','door','opening') OR (
      from_ft IS NOT NULL AND to_ft IS NOT NULL
    )
  ),
  CONSTRAINT rsge_object_shape CHECK (
    kind <> 'object' OR (
      center_x_ft IS NOT NULL AND center_z_ft IS NOT NULL AND
      width_ft   IS NOT NULL AND depth_ft    IS NOT NULL AND
      height_ft  IS NOT NULL AND cat         IS NOT NULL
    )
  )
);

COMMENT ON TABLE public.room_scan_geometry_elements IS
  'Room View geometry elements — walls, openings (window/door/opening), and detected objects for one scan. Service-role write only; delegated room_scans RLS on read.';

CREATE INDEX IF NOT EXISTS idx_rsge_scan_kind
  ON public.room_scan_geometry_elements (scan_id, kind);
-- self-FK lookup (ON DELETE SET NULL) + opening→wall joins
CREATE INDEX IF NOT EXISTS idx_rsge_wall_element
  ON public.room_scan_geometry_elements (wall_element_id)
  WHERE wall_element_id IS NOT NULL;

-- ─── RLS: read delegates to the scan's own visibility ──────────────────────
ALTER TABLE public.room_scan_geometry          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_scan_geometry_elements ENABLE ROW LEVEL SECURITY;

-- The EXISTS subquery runs under the caller's row security on public.room_scans,
-- so owner / designer-association / studio-co-member access all compose here.
-- No INSERT/UPDATE/DELETE policies — writes are service-role only.
DROP POLICY IF EXISTS room_scan_geometry_select ON public.room_scan_geometry;
CREATE POLICY room_scan_geometry_select ON public.room_scan_geometry
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.room_scans rs WHERE rs.id = scan_id));

DROP POLICY IF EXISTS room_scan_geometry_elements_select ON public.room_scan_geometry_elements;
CREATE POLICY room_scan_geometry_elements_select ON public.room_scan_geometry_elements
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.room_scans rs WHERE rs.id = scan_id));

-- ─── Table grants (post-flip: grant callers' access explicitly) ────────────
GRANT SELECT ON public.room_scan_geometry          TO authenticated;
GRANT SELECT ON public.room_scan_geometry_elements TO authenticated;
GRANT ALL    ON public.room_scan_geometry          TO service_role;
GRANT ALL    ON public.room_scan_geometry_elements TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- replace_room_scan_geometry — atomic parse landing
--
-- Upserts the header (marks parsed, parsed_at now, does NOT touch parse_attempts
-- or bump parser_version beyond what the caller sends), deletes the scan's
-- existing elements, and re-inserts from the p_elements jsonb array. Walls are
-- inserted first so each opening's `wall_ref` (its parent wall's apple_id) can
-- resolve to the freshly-minted wall_element_id.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.replace_room_scan_geometry(
  p_scan_id  uuid,
  p_header   jsonb,
  p_elements jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- 1. Upsert the header. parsed_at = now(); parse cleared; attempts untouched.
  INSERT INTO public.room_scan_geometry AS g (
    scan_id, parse_status, parse_error, parsed_at,
    parser_version, source_schema_version, source_etag,
    units, origin_yaw_deg, origin_offset_m,
    width_ft, depth_ft, wall_height_ft, wall_thickness_ft,
    floor_polygon, floor_area_sqft, confidence_summary,
    updated_at
  ) VALUES (
    p_scan_id, 'parsed', NULL, now(),
    COALESCE((p_header->>'parser_version')::integer, 0),
    p_header->>'source_schema_version',
    p_header->>'source_etag',
    COALESCE(NULLIF(p_header->>'units',''), 'ft'),
    (p_header->>'origin_yaw_deg')::numeric,
    p_header->'origin_offset_m',
    (p_header->>'width_ft')::numeric,
    (p_header->>'depth_ft')::numeric,
    (p_header->>'wall_height_ft')::numeric,
    (p_header->>'wall_thickness_ft')::numeric,
    p_header->'floor_polygon',
    (p_header->>'floor_area_sqft')::numeric,
    p_header->'confidence_summary',
    now()
  )
  ON CONFLICT (scan_id) DO UPDATE SET
    parse_status          = 'parsed',
    parse_error           = NULL,
    parsed_at             = now(),
    parser_version        = EXCLUDED.parser_version,
    source_schema_version = EXCLUDED.source_schema_version,
    source_etag           = EXCLUDED.source_etag,
    units                 = EXCLUDED.units,
    origin_yaw_deg        = EXCLUDED.origin_yaw_deg,
    origin_offset_m       = EXCLUDED.origin_offset_m,
    width_ft              = EXCLUDED.width_ft,
    depth_ft              = EXCLUDED.depth_ft,
    wall_height_ft        = EXCLUDED.wall_height_ft,
    wall_thickness_ft     = EXCLUDED.wall_thickness_ft,
    floor_polygon         = EXCLUDED.floor_polygon,
    floor_area_sqft       = EXCLUDED.floor_area_sqft,
    confidence_summary    = EXCLUDED.confidence_summary,
    updated_at            = now();

  -- 2. Clear the scan's existing elements (self-FK is ON DELETE SET NULL, but
  --    every referencing row is in the same delete set, so nothing dangles).
  DELETE FROM public.room_scan_geometry_elements WHERE scan_id = p_scan_id;

  -- 3a. Insert walls first (so their apple_id → id map exists for openings).
  INSERT INTO public.room_scan_geometry_elements (
    scan_id, kind, apple_id, confidence, label, position,
    x1_ft, z1_ft, x2_ft, z2_ft, height_ft, thickness_ft, extras
  )
  SELECT
    p_scan_id, 'wall',
    (e->>'apple_id')::uuid,
    e->>'confidence',
    e->>'label',
    (e->>'position')::integer,
    (e->>'x1_ft')::numeric, (e->>'z1_ft')::numeric,
    (e->>'x2_ft')::numeric, (e->>'z2_ft')::numeric,
    (e->>'height_ft')::numeric,
    (e->>'thickness_ft')::numeric,
    COALESCE(e->'extras', '{}'::jsonb)
  FROM jsonb_array_elements(COALESCE(p_elements, '[]'::jsonb)) AS e
  WHERE e->>'kind' = 'wall';

  -- 3b. Insert openings + objects, resolving wall_ref (parent apple_id) → wall id.
  INSERT INTO public.room_scan_geometry_elements (
    scan_id, kind, apple_id, confidence, label, position,
    wall_element_id, from_ft, to_ft, sill_ft, head_ft, width_ft, height_ft,
    swing, swing_inward,
    cat, center_x_ft, center_z_ft, depth_ft, rotation_deg, extras
  )
  SELECT
    p_scan_id,
    e->>'kind',
    (e->>'apple_id')::uuid,
    e->>'confidence',
    e->>'label',
    (e->>'position')::integer,
    w.id,
    (e->>'from_ft')::numeric, (e->>'to_ft')::numeric,
    (e->>'sill_ft')::numeric, (e->>'head_ft')::numeric,
    (e->>'width_ft')::numeric, (e->>'height_ft')::numeric,
    e->>'swing',
    (e->>'swing_inward')::boolean,
    e->>'cat',
    (e->>'center_x_ft')::numeric, (e->>'center_z_ft')::numeric,
    (e->>'depth_ft')::numeric, (e->>'rotation_deg')::numeric,
    COALESCE(e->'extras', '{}'::jsonb)
  FROM jsonb_array_elements(COALESCE(p_elements, '[]'::jsonb)) AS e
  LEFT JOIN public.room_scan_geometry_elements w
    ON  w.scan_id  = p_scan_id
    AND w.kind     = 'wall'
    AND w.apple_id = (e->>'wall_ref')::uuid
  WHERE e->>'kind' <> 'wall';
END;
$$;

REVOKE ALL   ON FUNCTION public.replace_room_scan_geometry(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.replace_room_scan_geometry(uuid, jsonb, jsonb) TO service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- mark_room_scan_geometry_error — record a parse failure (attempts += 1)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.mark_room_scan_geometry_error(
  p_scan_id uuid,
  p_error   text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.room_scan_geometry AS g (
    scan_id, parse_status, parse_error, parse_attempts, updated_at
  ) VALUES (
    p_scan_id, 'error', p_error, 1, now()
  )
  ON CONFLICT (scan_id) DO UPDATE SET
    parse_status   = 'error',
    parse_error    = EXCLUDED.parse_error,
    parse_attempts = g.parse_attempts + 1,
    updated_at     = now();
END;
$$;

REVOKE ALL   ON FUNCTION public.mark_room_scan_geometry_error(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.mark_room_scan_geometry_error(uuid, text) TO service_role;
