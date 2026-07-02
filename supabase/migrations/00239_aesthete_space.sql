-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 00239: Aesthete space — vector columns, helpers, ANN index
--
-- Design contract: docs/prds/AE/aesthete-engine-system-design.md §5.1
-- (§15.4 row "00236 aesthete_space" — shifted +1 because 00236 was taken by
-- 00236_document_state_relationship_title.sql after the design doc was
-- written; final numbering: aesthete block is 00239–00241 (00236–00238 taken by The Document tracks); later waves continue from 00242.
--
-- What this does:
--   1. Asserts pgvector ≥ 0.5.0 (needed for sum(vector) aggregate and
--      vector↔real[] casts used by the engine's SQL).
--   2. Re-types the EMPTY products.aesthete_vector column from vector(1536)
--      (00152) to vector(768) — the canonical fused style space (nomic v1.5,
--      Matryoshka-cut 768). The three 00157 read-contract views are dropped
--      first and recreated VERBATIM below (same names, same columns) since
--      v_aesthete_catalog_input depends on the column.
--   3. Adds style_caption / aesthete_vector_at / aesthete_model_version.
--   4. Creates the vec_scale / vec_lerp / vec_normalize helpers (IMMUTABLE;
--      pgvector has no scalar-multiply operator).
--   5. Creates the ANN index: HNSW preferred, ivfflat fallback, partial on
--      the published catalog layer.
--
-- Header-comment correction (per §16 "stale docs"): 00157's header said the
-- views expose "the embedding column (vector(1536) from migration 00001)" —
-- stale since 00007 re-typed products.embedding to vector(768). Both vector
-- columns are 768-dim after this migration:
--   products.embedding       vector(768) — text embedding (00007/00008 RPCs)
--   products.aesthete_vector vector(768) — fused style vector (this program)
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Prerequisite: pgvector ≥ 0.5.0 ──────────────────────────────────────
-- Best-effort update first (no-op NOTICE when already at the default version;
-- guarded because on some self-hosted stacks the extension is owned by
-- supabase_admin and a postgres-run migration lacks privilege), then a hard
-- version assert. The assert compares numerically (int arrays), not as text —
-- a text compare would wrongly reject e.g. '0.10.0' < '0.5.0'.
DO $$ BEGIN
  BEGIN
    EXECUTE 'ALTER EXTENSION vector UPDATE';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE WARNING 'aesthete_space: cannot ALTER EXTENSION vector (not owner); relying on version assert';
  END;
END $$;

DO $$
DECLARE
  v_version text;
BEGIN
  SELECT extversion INTO v_version FROM pg_extension WHERE extname = 'vector';
  IF v_version IS NULL THEN
    RAISE EXCEPTION 'aesthete engine requires the pgvector extension; it is not installed';
  END IF;
  IF string_to_array(split_part(v_version, '-', 1), '.')::int[] < ARRAY[0, 5, 0] THEN
    RAISE EXCEPTION 'aesthete engine requires pgvector >= 0.5.0 (found %)', v_version;
  END IF;
END $$;

-- ─── 2. Re-type the empty 1536 column into the canonical 768 space ──────────
-- The column has never carried data (00152 added it for a service that never
-- deployed), so USING NULL is a free change. The 00157 views are the read
-- contract other systems hold — dropped here, recreated verbatim below.
DROP VIEW IF EXISTS v_aesthete_personal_input;
DROP VIEW IF EXISTS v_aesthete_studio_input;
DROP VIEW IF EXISTS v_aesthete_catalog_input;

ALTER TABLE products
  ALTER COLUMN aesthete_vector TYPE vector(768) USING NULL;

-- ─── 3. Recreate the three 00157 views VERBATIM ─────────────────────────────
-- Byte-identical definitions from 00157_aesthete_input_views.sql: same names,
-- same columns, same WHERE clauses, same SECURITY INVOKER semantics (RLS on
-- products enforces the three-layer boundary transitively).

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

-- ─── 4. Vector bookkeeping columns ──────────────────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS style_caption text,
  ADD COLUMN IF NOT EXISTS aesthete_vector_at timestamptz,
  ADD COLUMN IF NOT EXISTS aesthete_model_version text;

COMMENT ON COLUMN products.style_caption IS
  'Deterministic caption the fused aesthete_vector was embedded from (DNA + spectrum render). Written by the embed worker alongside the vector.';
COMMENT ON COLUMN products.aesthete_vector_at IS
  'Staleness watermark: when aesthete_vector was last computed.';
COMMENT ON COLUMN products.aesthete_model_version IS
  'Embedding model/version that produced aesthete_vector (e.g. nomic-v1.5-onnx-int8-r1). Scoring compares same-version vectors only.';

-- ─── 5. Vector helpers (IMMUTABLE; pgvector has no scalar-multiply op) ──────
-- Two corrections to the §5.1 sketch bodies, required to compile (verified
-- against pgvector 0.8.0; flagged back to the design doc):
--   • vec_lerp: `1 - w` promotes int4−float4 to double precision, which does
--     not implicitly narrow for function resolution → cast back to real.
--   • vec_normalize: the vector-typed L2 norm is vector_norm(vector);
--     l2_norm exists only for halfvec/sparsevec (both implicit-castable from
--     vector, so bare l2_norm(v) is AMBIGUOUS, not merely wrong).
CREATE OR REPLACE FUNCTION vec_scale(v vector, k real) RETURNS vector AS $$
  SELECT (SELECT array_agg(x * k) FROM unnest(v::real[]) AS x)::vector
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION vec_lerp(a vector, b vector, w real) RETURNS vector AS $$
  SELECT vec_scale(a, w) + vec_scale(b, (1 - w)::real)
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION vec_normalize(v vector) RETURNS vector AS $$
  SELECT CASE WHEN vector_norm(v) = 0 THEN v
              ELSE vec_scale(v, (1.0 / vector_norm(v))::real) END
$$ LANGUAGE sql IMMUTABLE;

COMMENT ON FUNCTION vec_scale(vector, real) IS 'Element-wise scalar multiply. Aesthete engine helper (§5.1).';
COMMENT ON FUNCTION vec_lerp(vector, vector, real) IS 'Linear interpolation: w·a + (1−w)·b. Aesthete engine helper (§5.1).';
COMMENT ON FUNCTION vec_normalize(vector) IS 'L2-normalize; zero vector passes through unchanged. Aesthete engine helper (§5.1).';

-- ─── 6. ANN index: HNSW preferred, ivfflat fallback, partial on catalog ─────
-- Partial on catalog only — personal/studio layers are small per-owner sets
-- where a sequential scan wins, and filtered ANN on older pgvector loses
-- recall. The match RPC sets SET LOCAL hnsw.ef_search = 100 /
-- ivfflat.probes = 10. At ≤ 50k products, exact scan is an acceptable
-- degraded mode — index type never blocks launch.
DO $$ BEGIN
  BEGIN
    EXECUTE 'CREATE INDEX idx_products_aesthete_hnsw ON products
             USING hnsw (aesthete_vector vector_cosine_ops) WITH (m=16, ef_construction=64)
             WHERE layer = ''catalog'' AND status = ''published''';
  EXCEPTION WHEN OTHERS THEN
    EXECUTE 'CREATE INDEX idx_products_aesthete_ivf ON products
             USING ivfflat (aesthete_vector vector_cosine_ops) WITH (lists=50)
             WHERE layer = ''catalog'' AND status = ''published''';
  END;
END $$;
