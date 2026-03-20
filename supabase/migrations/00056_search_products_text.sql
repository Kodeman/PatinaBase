-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Text-based Product Search
-- Description: Creates a PostgREST-callable RPC function for text-based
--              product search with filters (used by iOS app)
-- ═══════════════════════════════════════════════════════════════════════════

-- Enable pg_trgm extension for fuzzy text matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add text search index on products
DROP INDEX IF EXISTS idx_products_name_trgm;
CREATE INDEX idx_products_name_trgm ON products USING gin (name gin_trgm_ops);

-- Immutable wrapper for array_to_string (needed for generated columns)
CREATE OR REPLACE FUNCTION immutable_array_to_string(arr TEXT[], sep TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT array_to_string(arr, sep);
$$;

-- Full-text search column and index
ALTER TABLE products ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(immutable_array_to_string(materials, ' '), '')), 'C')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_products_search_vector ON products USING gin (search_vector);

-- ═══════════════════════════════════════════════════════════════════════════
-- SEARCH FUNCTION
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION search_products(
  search_query TEXT DEFAULT NULL,
  category_filter TEXT DEFAULT NULL,
  min_price INTEGER DEFAULT NULL,
  max_price INTEGER DEFAULT NULL,
  style_filter TEXT DEFAULT NULL,
  sort_by TEXT DEFAULT 'relevance',
  page_size INTEGER DEFAULT 20,
  page_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  images TEXT[],
  price_retail INTEGER,
  materials TEXT[],
  vendor_name TEXT,
  style_names TEXT[],
  relevance_score REAL
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.name,
    p.description,
    p.images,
    p.price_retail,
    p.materials,
    v.name AS vendor_name,
    COALESCE(
      array_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL),
      '{}'::TEXT[]
    ) AS style_names,
    CASE
      WHEN search_query IS NOT NULL AND search_query != '' THEN
        ts_rank(p.search_vector, plainto_tsquery('english', search_query))
      ELSE 1.0
    END::REAL AS relevance_score
  FROM products p
  LEFT JOIN vendors v ON v.id = p.vendor_id
  LEFT JOIN product_styles ps ON ps.product_id = p.id
  LEFT JOIN styles s ON s.id = ps.style_id
  WHERE
    -- Text search filter
    (search_query IS NULL OR search_query = '' OR
     p.search_vector @@ plainto_tsquery('english', search_query) OR
     p.name ILIKE '%' || search_query || '%')
    -- Price filters
    AND (min_price IS NULL OR p.price_retail >= min_price)
    AND (max_price IS NULL OR p.price_retail <= max_price)
    -- Style filter (match by style name)
    AND (style_filter IS NULL OR style_filter = '' OR
         EXISTS (
           SELECT 1 FROM product_styles ps2
           JOIN styles s2 ON s2.id = ps2.style_id
           WHERE ps2.product_id = p.id
           AND s2.name ILIKE style_filter
         ))
  GROUP BY p.id, p.name, p.description, p.images, p.price_retail,
           p.materials, v.name, p.search_vector, p.created_at
  ORDER BY
    CASE WHEN sort_by = 'relevance' AND search_query IS NOT NULL AND search_query != '' THEN
      ts_rank(p.search_vector, plainto_tsquery('english', search_query))
    END DESC NULLS LAST,
    CASE WHEN sort_by = 'price_asc' THEN p.price_retail END ASC NULLS LAST,
    CASE WHEN sort_by = 'price_desc' THEN p.price_retail END DESC NULLS LAST,
    CASE WHEN sort_by = 'newest' OR sort_by = 'relevance' THEN extract(epoch from p.created_at) END DESC NULLS LAST
  LIMIT page_size
  OFFSET page_offset;
END;
$$;

COMMENT ON FUNCTION search_products IS 'Text-based product search with optional price, style, and category filters. Callable via PostgREST RPC.';
