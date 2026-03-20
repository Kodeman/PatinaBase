-- Migration: Add catalog columns to products table
-- These columns are expected by the designer portal product creation wizard
-- but were missing from the Supabase schema (previously proxied to a non-existent catalog service).

-- Add catalog columns to products
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS slug TEXT,
  ADD COLUMN IF NOT EXISTS brand TEXT,
  ADD COLUMN IF NOT EXISTS short_description TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'decor',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'published', 'deprecated')),
  ADD COLUMN IF NOT EXISTS sku TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS style_tags TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS seo_title TEXT,
  ADD COLUMN IF NOT EXISTS seo_description TEXT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- Make source_url and captured_by nullable so portal-created products work
-- (originally required for extension-captured products only)
ALTER TABLE products
  ALTER COLUMN source_url DROP NOT NULL,
  ALTER COLUMN captured_by DROP NOT NULL;

-- Set defaults for existing rows
UPDATE products SET
  slug = lower(regexp_replace(name, '[^a-z0-9]+', '-', 'gi')),
  status = 'published'
WHERE slug IS NULL;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand);

-- Categories table (flat with optional hierarchy)
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  description TEXT,
  image_url TEXT,
  product_count INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default categories matching ProductCategory enum
INSERT INTO categories (name, slug, sort_order) VALUES
  ('Sofa', 'sofa', 1),
  ('Chair', 'chair', 2),
  ('Table', 'table', 3),
  ('Bed', 'bed', 4),
  ('Storage', 'storage', 5),
  ('Lighting', 'lighting', 6),
  ('Decor', 'decor', 7),
  ('Outdoor', 'outdoor', 8)
ON CONFLICT (slug) DO NOTHING;

-- RLS for categories
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Categories are publicly readable"
  ON categories FOR SELECT USING (true);
CREATE POLICY "Authenticated users can manage categories"
  ON categories FOR ALL USING (auth.role() = 'authenticated');

-- Recreate search_vector to include new columns
DROP INDEX IF EXISTS idx_products_search_vector;
ALTER TABLE products DROP COLUMN IF EXISTS search_vector;
ALTER TABLE products ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(brand, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(short_description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(immutable_array_to_string(materials, ' '), '')), 'D')
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_products_search_vector ON products USING gin(search_vector);
