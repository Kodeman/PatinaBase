-- ═══════════════════════════════════════════════════════════════════════════
-- 00760 · Pieces: room finishes on project_palettes (US-21 T-56, SQ-662)
--
-- Purpose: D16 / Q10, a minimal paint and finish schedule per room. It lives on
-- the existing project_palettes table (00140:16-66); nothing is re-keyed and no
-- RPC is added. Studio writes go through the table under RLS.
--
--   1. Clients read and never write. The 00140 policy "Inherit project access
--      for palettes" was FOR ALL and named client_id, so a client could write
--      palettes. It is recreated FOR SELECT with the same predicate. Studio
--      writes stay with "project_palettes_studio_rw" (00316:178).
--   2. One finishes row per room: a unique index on (project_id, scope_room_id).
--      It is a plain index, not a partial one. NULLs stay distinct, so any
--      number of project-wide (scope_room_id IS NULL) palettes is still
--      allowed, the same constraint as WHERE scope_room_id IS NOT NULL. A
--      partial index cannot be inferred by ON CONFLICT (project_id,
--      scope_room_id) without its predicate, which is what a PostgREST /
--      supabase-js upsert({ onConflict: 'project_id,scope_room_id' }) emits,
--      so the studio could not upsert by room against it.
--   3. swatches must be a JSON array (CHECK, added NOT VALID then VALIDATE).
--
-- A finish row is a swatch element
--   {surface, product, brand, brand_code, sheen, hex, sort_order}.
-- The older {hex, name, role, brand, brand_code, sort_order} rows stay
-- readable; `role` is kept as-is.
--
-- Lineage: table and policy 00140:16-61; studio policy 00316:178-181.
-- Adds no GRANT/REVOKE and no function. The W6 reset owner still regenerates
-- 00-legacy-grants and database.types.ts (CONTRACT §4).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Clients read only ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Inherit project access for palettes" ON public.project_palettes;

CREATE POLICY "Inherit project access for palettes"
  ON public.project_palettes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      WHERE p.id = project_palettes.project_id
        AND (
          p.designer_id = auth.uid()
          OR p.client_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.project_team_members ptm
            WHERE ptm.project_id = p.id
              AND ptm.user_id = auth.uid()
              AND ptm.removed_at IS NULL
          )
        )
    )
  );

-- ── 2. One finishes row per room ────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS project_palettes_one_per_room
  ON public.project_palettes (project_id, scope_room_id);

-- ── 3. swatches is an array ─────────────────────────────────────────────────
ALTER TABLE public.project_palettes
  DROP CONSTRAINT IF EXISTS project_palettes_swatches_is_array;
ALTER TABLE public.project_palettes
  ADD CONSTRAINT project_palettes_swatches_is_array
  CHECK (jsonb_typeof(swatches) = 'array') NOT VALID;
ALTER TABLE public.project_palettes
  VALIDATE CONSTRAINT project_palettes_swatches_is_array;

COMMENT ON COLUMN public.project_palettes.swatches IS
  'JSON array. A room finish is {surface, product, brand, brand_code, sheen, hex, sort_order}; '
  'older palette swatches are {hex, name, role, brand, brand_code, sort_order}. '
  'One row per (project_id, scope_room_id) when scope_room_id is set (00760).';
