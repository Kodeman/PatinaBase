-- Add color and finish fields to products table
-- This migration adds support for extracting and storing product color/finish information

-- Add color columns to products
ALTER TABLE products
ADD COLUMN IF NOT EXISTS colors TEXT[] DEFAULT NULL,
ADD COLUMN IF NOT EXISTS finish TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS available_colors TEXT[] DEFAULT NULL;

-- Add comment for documentation
COMMENT ON COLUMN products.colors IS 'Primary color(s) of the product extracted from source';
COMMENT ON COLUMN products.finish IS 'Surface finish (e.g., matte, gloss, lacquered)';
COMMENT ON COLUMN products.available_colors IS 'All available color variants if detected from product page';

-- Create index for color filtering
CREATE INDEX IF NOT EXISTS idx_products_colors ON products USING GIN (colors);
CREATE INDEX IF NOT EXISTS idx_products_finish ON products (finish) WHERE finish IS NOT NULL;
