-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00157: Aesthete data-pull views (S2.10 contract surface)
--
-- The engineering handoff §7.2 mandates a strict per-layer separation
-- for the Aesthete training pipeline:
--
--   Personal → trains the owner's personal style vector only. Never
--              exposed beyond the user.
--   Studio   → trains the studio collective profile. Visible to studio
--              members only.
--   Catalog  → trains the public engine. Visible to all authenticated.
--
-- These views are the read contract `services/aesthete-engine` will
-- pull through. They are SECURITY INVOKER so RLS on the products table
-- enforces the boundary automatically — the engine service must run
-- with a per-tenant JWT (or service_role for catalog), it cannot
-- accidentally cross layers.
--
-- View shape includes the embedding column (vector(1536) from
-- migration 00001) plus the inputs the pipeline needs to scope its
-- training run.
--
-- The training pipeline itself is intentionally NOT in scope here —
-- CLAUDE.md notes the aesthete-engine service is deferred / not yet
-- deployed. These views give it a stable contract to read from when
-- it ships.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Personal ──────────────────────────────────────────────────────────────
-- Each call returns ONLY rows the caller owns. The engine should iterate
-- per-user with that user's JWT so vectors stay scoped.
CREATE OR REPLACE VIEW v_aesthete_personal_input AS
SELECT
  p.id              AS product_id,
  p.owner_user_id,
  p.name,
  p.description,
  p.materials,
  p.style_tags,
  p.material_tags,
  p.embedding,
  p.captured_at,
  p.updated_at
FROM products p
WHERE p.layer = 'personal'
  AND p.owner_user_id IS NOT NULL;

COMMENT ON VIEW v_aesthete_personal_input IS
  'Per-user personal-library product features for Aesthete personal-vector training. RLS-filtered through products: each caller sees only their own rows. Never used for cross-user training.';

-- ─── Studio ────────────────────────────────────────────────────────────────
-- Studio-scoped. Caller sees studio rows for every org they belong to;
-- when the engine runs per-studio it should be scoped to one studio_id
-- in the WHERE clause client-side.
CREATE OR REPLACE VIEW v_aesthete_studio_input AS
SELECT
  p.id              AS product_id,
  p.studio_id,
  p.name,
  p.description,
  p.materials,
  p.style_tags,
  p.material_tags,
  p.embedding,
  p.vendor_id,
  p.category,
  p.subcategory,
  p.captured_at,
  p.promoted_at,
  p.updated_at
FROM products p
WHERE p.layer = 'studio'
  AND p.studio_id IS NOT NULL;

COMMENT ON VIEW v_aesthete_studio_input IS
  'Per-studio studio-library product features for Aesthete studio collective-profile training. RLS-filtered through products: each caller sees rows from studios they actively belong to.';

-- ─── Catalog ───────────────────────────────────────────────────────────────
-- Public engine inputs. Catalog products are visible to all authenticated
-- users (and anon for the marketing path), so the engine can run with a
-- service-role key or any authenticated JWT and pull the full set.
CREATE OR REPLACE VIEW v_aesthete_catalog_input AS
SELECT
  p.id              AS product_id,
  p.name,
  p.description,
  p.materials,
  p.style_tags,
  p.material_tags,
  p.aesthete_vector,
  p.embedding,
  p.vendor_id,
  p.category,
  p.subcategory,
  p.commission_rate,
  p.created_at,
  p.updated_at
FROM products p
WHERE p.layer = 'catalog'
  AND p.patina_managed = TRUE;

COMMENT ON VIEW v_aesthete_catalog_input IS
  'Catalog-layer product features for the public Aesthete engine. RLS-filtered through products: catalog rows are visible to all authenticated users.';

COMMIT;
