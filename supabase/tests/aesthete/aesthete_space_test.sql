-- ═══════════════════════════════════════════════════════════════════════════
-- Aesthete space tests (migration 00237)
--
-- Exercises design §5.1:
--   1. products.aesthete_vector is vector(768); the three bookkeeping
--      columns (style_caption / aesthete_vector_at / aesthete_model_version)
--      exist with the right types.
--   2. Vector helpers compute correctly and are IMMUTABLE:
--      vec_scale exact multiply, vec_lerp endpoints + midpoint,
--      vec_normalize of a known vector (3-4-5 triangle) and the zero-vector
--      passthrough branch.
--   3. The three 00157 read-contract views exist with EXACTLY the original
--      column lists, in the original order (view-contract preservation).
--   4. Exactly one ANN index (hnsw or ivfflat) exists on aesthete_vector.
--
-- How to run:
--   docker exec -i supabase_db_supabase psql -U postgres -d postgres \
--     -v ON_ERROR_STOP=1 < supabase/tests/aesthete/aesthete_space_test.sql
--
-- The script wraps everything in a single transaction and ROLLBACKs at the
-- end so it can be re-run without side effects.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── assertions ────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_type text;
  v_cols text[];
  v_count int;
  v_vec real[];
  v_norm double precision;
  v_volatility char;
BEGIN
  -- Case 1a: aesthete_vector is vector(768).
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_type
    FROM pg_attribute a
   WHERE a.attrelid = 'public.products'::regclass
     AND a.attname = 'aesthete_vector';
  ASSERT v_type = 'vector(768)',
    'FAIL 1a: products.aesthete_vector should be vector(768), got ' || COALESCE(v_type, '<missing>');

  -- Case 1b: bookkeeping columns exist with the right types.
  SELECT format_type(a.atttypid, a.atttypmod) INTO v_type
    FROM pg_attribute a
   WHERE a.attrelid = 'public.products'::regclass AND a.attname = 'style_caption';
  ASSERT v_type = 'text',
    'FAIL 1b: products.style_caption should be text, got ' || COALESCE(v_type, '<missing>');

  SELECT format_type(a.atttypid, a.atttypmod) INTO v_type
    FROM pg_attribute a
   WHERE a.attrelid = 'public.products'::regclass AND a.attname = 'aesthete_vector_at';
  ASSERT v_type = 'timestamp with time zone',
    'FAIL 1c: products.aesthete_vector_at should be timestamptz, got ' || COALESCE(v_type, '<missing>');

  SELECT format_type(a.atttypid, a.atttypmod) INTO v_type
    FROM pg_attribute a
   WHERE a.attrelid = 'public.products'::regclass AND a.attname = 'aesthete_model_version';
  ASSERT v_type = 'text',
    'FAIL 1d: products.aesthete_model_version should be text, got ' || COALESCE(v_type, '<missing>');

  -- Case 2a: vec_scale exact multiply (values chosen to be float-exact).
  ASSERT vec_scale('[1,-2,3]'::vector, 2) = '[2,-4,6]'::vector,
    'FAIL 2a: vec_scale([1,-2,3], 2) should be [2,-4,6], got ' || vec_scale('[1,-2,3]'::vector, 2)::text;

  -- Case 2b: vec_lerp endpoints — w=1 returns a, w=0 returns b.
  ASSERT vec_lerp('[1,0]'::vector, '[0,1]'::vector, 1) = '[1,0]'::vector,
    'FAIL 2b: vec_lerp(a, b, 1) should equal a, got ' || vec_lerp('[1,0]'::vector, '[0,1]'::vector, 1)::text;
  ASSERT vec_lerp('[1,0]'::vector, '[0,1]'::vector, 0) = '[0,1]'::vector,
    'FAIL 2c: vec_lerp(a, b, 0) should equal b, got ' || vec_lerp('[1,0]'::vector, '[0,1]'::vector, 0)::text;

  -- Case 2d: vec_lerp midpoint (0.5 is float-exact).
  ASSERT vec_lerp('[1,0]'::vector, '[0,1]'::vector, 0.5) = '[0.5,0.5]'::vector,
    'FAIL 2d: vec_lerp(a, b, 0.5) should be the elementwise mean, got ' || vec_lerp('[1,0]'::vector, '[0,1]'::vector, 0.5)::text;

  -- Case 2e: vec_normalize of the 3-4-5 triangle → [0.6, 0.8] (tolerance for
  -- float32 rounding).
  v_vec := vec_normalize('[3,4]'::vector)::real[];
  ASSERT abs(v_vec[1] - 0.6) < 1e-6 AND abs(v_vec[2] - 0.8) < 1e-6,
    'FAIL 2e: vec_normalize([3,4]) should be ~[0.6,0.8], got ' || v_vec::text;

  -- Case 2f: normalized vector has unit L2 norm (vector_norm is pgvector's
  -- vector-typed norm; l2_norm only exists for halfvec/sparsevec).
  v_norm := vector_norm(vec_normalize('[3,4,12]'::vector));
  ASSERT abs(v_norm - 1.0) < 1e-6,
    'FAIL 2f: l2_norm(vec_normalize(v)) should be ~1, got ' || v_norm::text;

  -- Case 2g: zero vector passes through unchanged (no division by zero).
  ASSERT vec_normalize('[0,0,0]'::vector) = '[0,0,0]'::vector,
    'FAIL 2g: vec_normalize of the zero vector should return it unchanged, got ' || vec_normalize('[0,0,0]'::vector)::text;

  -- Case 2h: all three helpers are IMMUTABLE (§5.1 requirement — they must be
  -- usable in indexes/generated contexts).
  FOR v_volatility IN
    SELECT p.provolatile FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('vec_scale', 'vec_lerp', 'vec_normalize')
  LOOP
    ASSERT v_volatility = 'i',
      'FAIL 2h: vec_* helpers must be IMMUTABLE, found volatility ' || v_volatility;
  END LOOP;
  SELECT count(*) INTO v_count FROM pg_proc p
   WHERE p.pronamespace = 'public'::regnamespace
     AND p.proname IN ('vec_scale', 'vec_lerp', 'vec_normalize');
  ASSERT v_count = 3,
    'FAIL 2i: expected the 3 vec_* helpers, found ' || v_count;

  -- Case 3a: v_aesthete_personal_input — exact 00157 column contract.
  SELECT array_agg(column_name::text ORDER BY ordinal_position) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'v_aesthete_personal_input';
  ASSERT v_cols = ARRAY['product_id','owner_user_id','name','description','materials',
                        'style_tags','material_tags','embedding','captured_at','updated_at'],
    'FAIL 3a: v_aesthete_personal_input columns drifted from the 00157 contract, got ' || COALESCE(v_cols::text, '<missing view>');

  -- Case 3b: v_aesthete_studio_input — exact 00157 column contract.
  SELECT array_agg(column_name::text ORDER BY ordinal_position) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'v_aesthete_studio_input';
  ASSERT v_cols = ARRAY['product_id','studio_id','name','description','materials',
                        'style_tags','material_tags','embedding','vendor_id','category',
                        'subcategory','captured_at','promoted_at','updated_at'],
    'FAIL 3b: v_aesthete_studio_input columns drifted from the 00157 contract, got ' || COALESCE(v_cols::text, '<missing view>');

  -- Case 3c: v_aesthete_catalog_input — exact 00157 column contract
  -- (including aesthete_vector, now 768-dim).
  SELECT array_agg(column_name::text ORDER BY ordinal_position) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'v_aesthete_catalog_input';
  ASSERT v_cols = ARRAY['product_id','name','description','materials','style_tags',
                        'material_tags','aesthete_vector','embedding','vendor_id','category',
                        'subcategory','commission_rate','created_at','updated_at'],
    'FAIL 3c: v_aesthete_catalog_input columns drifted from the 00157 contract, got ' || COALESCE(v_cols::text, '<missing view>');

  -- Case 4: exactly one ANN index on aesthete_vector (hnsw preferred, ivfflat
  -- fallback — never both, never zero). The pre-existing ivfflat on
  -- products.embedding (00008) must not be counted.
  SELECT count(*) INTO v_count
    FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'products'
     AND indexdef LIKE '%aesthete_vector%'
     AND (indexdef LIKE '%hnsw%' OR indexdef LIKE '%ivfflat%');
  ASSERT v_count = 1,
    'FAIL 4: expected exactly one ANN index on products.aesthete_vector, got ' || v_count;

  RAISE NOTICE 'All aesthete space assertions passed.';
END
$$;

-- ROLLBACK so the test is idempotent.
ROLLBACK;
