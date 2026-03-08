-- Migration: Add retailer_id to products table
-- Purpose: Distinguish between manufacturer (vendor_id) and retailer (where product was captured)

-- Add retailer_id column
ALTER TABLE products
ADD COLUMN retailer_id UUID REFERENCES vendors(id) ON DELETE SET NULL;

-- Add index for retailer lookups
CREATE INDEX idx_products_retailer ON products(retailer_id);

-- Add comments to clarify the distinction
COMMENT ON COLUMN products.vendor_id IS 'Manufacturer - who makes the product';
COMMENT ON COLUMN products.retailer_id IS 'Retailer - where the product was captured/purchased';

-- Enable RLS for the new column (inherits from products table policies)
-- No additional policies needed since retailer_id follows the same access pattern as vendor_id
