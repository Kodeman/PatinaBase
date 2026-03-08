-- ═══════════════════════════════════════════════════════════════════════════
-- MIGRATION: Update Vector Dimensions for Ollama (nomic-embed-text)
-- ═══════════════════════════════════════════════════════════════════════════
-- Ollama's nomic-embed-text model produces 768-dimensional embeddings.
-- This migration updates the vector columns from 1536 → 768 dimensions.
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing indexes first
DROP INDEX IF EXISTS idx_products_embedding;
DROP INDEX IF EXISTS idx_styles_embedding;

-- Alter vector columns to 768 dimensions
-- Note: This will clear any existing embeddings since the dimension is changing
ALTER TABLE products ALTER COLUMN embedding TYPE vector(768);
ALTER TABLE styles ALTER COLUMN embedding TYPE vector(768);

-- Recreate ivfflat indexes for cosine similarity search
-- Using ivfflat for approximate nearest neighbor with good performance
-- lists = 100 for products (expecting thousands of products)
-- lists = 20 for styles (only ~20 styles)
CREATE INDEX idx_products_embedding ON products
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_styles_embedding ON styles
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 20);

-- Add a column to track when embedding was last generated
ALTER TABLE products ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ;
ALTER TABLE styles ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ;

-- Create an index for finding products without embeddings (for batch processing)
CREATE INDEX idx_products_no_embedding ON products ((embedding IS NULL))
  WHERE embedding IS NULL;
