-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Vector Similarity Search Functions
-- ═══════════════════════════════════════════════════════════════════════════
-- PostgreSQL functions for finding similar products using pgvector.
-- Uses cosine similarity (1 - cosine_distance) for better results.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── FIND SIMILAR PRODUCTS BY EMBEDDING ─────────────────────────────────────
-- Takes a query embedding and finds the most similar products
CREATE OR REPLACE FUNCTION find_similar_products(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 10,
  exclude_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  name text,
  images text[],
  price_retail int,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.images,
    p.price_retail,
    1 - (p.embedding <=> query_embedding) as similarity
  FROM products p
  WHERE
    p.embedding IS NOT NULL
    AND (exclude_id IS NULL OR p.id != exclude_id)
    AND 1 - (p.embedding <=> query_embedding) > match_threshold
  ORDER BY p.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ─── FIND PRODUCTS SIMILAR TO A GIVEN PRODUCT ───────────────────────────────
-- Convenience function that looks up the product's embedding first
CREATE OR REPLACE FUNCTION find_products_similar_to(
  product_id uuid,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  name text,
  images text[],
  price_retail int,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  product_embedding vector(768);
BEGIN
  -- Get the product's embedding
  SELECT embedding INTO product_embedding
  FROM products
  WHERE products.id = product_id;

  -- If product has no embedding, return empty
  IF product_embedding IS NULL THEN
    RETURN;
  END IF;

  -- Find similar products (excluding the source product)
  RETURN QUERY
  SELECT * FROM find_similar_products(
    product_embedding,
    0.5, -- Lower threshold for product-to-product similarity
    match_count,
    product_id
  );
END;
$$;

-- ─── SEMANTIC SEARCH ACROSS PRODUCTS ────────────────────────────────────────
-- Hybrid search combining text and semantic similarity
CREATE OR REPLACE FUNCTION search_products_semantic(
  search_query text,
  query_embedding vector(768),
  match_count int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  images text[],
  price_retail int,
  semantic_score float,
  text_score float,
  combined_score float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH semantic_results AS (
    SELECT
      p.id,
      p.name,
      p.description,
      p.images,
      p.price_retail,
      CASE
        WHEN p.embedding IS NOT NULL THEN 1 - (p.embedding <=> query_embedding)
        ELSE 0
      END as semantic_score
    FROM products p
    WHERE p.embedding IS NOT NULL
  ),
  text_results AS (
    SELECT
      p.id,
      ts_rank(
        to_tsvector('english', COALESCE(p.name, '') || ' ' || COALESCE(p.description, '')),
        plainto_tsquery('english', search_query)
      ) as text_score
    FROM products p
    WHERE
      search_query IS NOT NULL
      AND search_query != ''
      AND to_tsvector('english', COALESCE(p.name, '') || ' ' || COALESCE(p.description, ''))
          @@ plainto_tsquery('english', search_query)
  )
  SELECT
    sr.id,
    sr.name,
    sr.description,
    sr.images,
    sr.price_retail,
    sr.semantic_score,
    COALESCE(tr.text_score, 0) as text_score,
    -- Combine scores: 70% semantic, 30% text match
    (sr.semantic_score * 0.7) + (COALESCE(tr.text_score, 0) * 0.3) as combined_score
  FROM semantic_results sr
  LEFT JOIN text_results tr ON sr.id = tr.id
  WHERE
    sr.semantic_score > 0.5
    OR tr.text_score IS NOT NULL
  ORDER BY
    (sr.semantic_score * 0.7) + (COALESCE(tr.text_score, 0) * 0.3) DESC
  LIMIT match_count;
END;
$$;

-- ─── FIND PRODUCTS MATCHING A STYLE ─────────────────────────────────────────
-- Find products that are semantically similar to a style's embedding
CREATE OR REPLACE FUNCTION find_products_for_style(
  style_id uuid,
  match_count int DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  name text,
  images text[],
  price_retail int,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  style_embedding vector(768);
BEGIN
  -- Get the style's embedding
  SELECT embedding INTO style_embedding
  FROM styles
  WHERE styles.id = style_id;

  -- If style has no embedding, return empty
  IF style_embedding IS NULL THEN
    RETURN;
  END IF;

  -- Find products similar to this style
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.images,
    p.price_retail,
    1 - (p.embedding <=> style_embedding) as similarity
  FROM products p
  WHERE p.embedding IS NOT NULL
  ORDER BY p.embedding <=> style_embedding
  LIMIT match_count;
END;
$$;

-- ─── GET EMBEDDING STATS ────────────────────────────────────────────────────
-- Returns statistics about embedding coverage
CREATE OR REPLACE FUNCTION get_embedding_stats()
RETURNS TABLE (
  total_products bigint,
  products_with_embedding bigint,
  products_without_embedding bigint,
  embedding_coverage_percent numeric,
  total_styles bigint,
  styles_with_embedding bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM products)::bigint as total_products,
    (SELECT COUNT(*) FROM products WHERE embedding IS NOT NULL)::bigint as products_with_embedding,
    (SELECT COUNT(*) FROM products WHERE embedding IS NULL)::bigint as products_without_embedding,
    ROUND(
      (SELECT COUNT(*) FROM products WHERE embedding IS NOT NULL)::numeric /
      NULLIF((SELECT COUNT(*) FROM products), 0)::numeric * 100,
      2
    ) as embedding_coverage_percent,
    (SELECT COUNT(*) FROM styles)::bigint as total_styles,
    (SELECT COUNT(*) FROM styles WHERE embedding IS NOT NULL)::bigint as styles_with_embedding;
END;
$$;

-- ─── GRANT PERMISSIONS ──────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION find_similar_products TO authenticated;
GRANT EXECUTE ON FUNCTION find_products_similar_to TO authenticated;
GRANT EXECUTE ON FUNCTION search_products_semantic TO authenticated;
GRANT EXECUTE ON FUNCTION find_products_for_style TO authenticated;
GRANT EXECUTE ON FUNCTION get_embedding_stats TO authenticated;
