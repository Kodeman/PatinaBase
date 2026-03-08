-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Engagement Notification Triggers
-- Description: Tables and triggers for consumer engagement notifications:
--   - user_wishlist table for tracking product interest
--   - product_inventory table for stock tracking
--   - Price drop trigger on products price_retail UPDATE
--   - Back in stock trigger on inventory quantity UPDATE (0 → >0)
-- ═══════════════════════════════════════════════════════════════════════════

-- Ensure pg_net is available for HTTP calls from triggers
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ═══════════════════════════════════════════════════════════════════════════
-- USER WISHLIST TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS user_wishlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

ALTER TABLE user_wishlist ENABLE ROW LEVEL SECURITY;

-- Users can manage their own wishlist
CREATE POLICY "Users can read own wishlist"
  ON user_wishlist FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add to own wishlist"
  ON user_wishlist FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove from own wishlist"
  ON user_wishlist FOR DELETE
  USING (auth.uid() = user_id);

-- Service role full access
CREATE POLICY "Service role full access to wishlist"
  ON user_wishlist
  USING (auth.role() = 'service_role');

-- Indexes
CREATE INDEX idx_user_wishlist_user_id ON user_wishlist(user_id);
CREATE INDEX idx_user_wishlist_product_id ON user_wishlist(product_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- PRODUCT INVENTORY TABLE
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS product_inventory (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE UNIQUE,
  quantity_available INTEGER NOT NULL DEFAULT 0,
  restock_date TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE product_inventory ENABLE ROW LEVEL SECURITY;

-- Anyone can read inventory
CREATE POLICY "Public read access to inventory"
  ON product_inventory FOR SELECT
  USING (true);

-- Service role can update inventory
CREATE POLICY "Service role manages inventory"
  ON product_inventory
  USING (auth.role() = 'service_role');

CREATE INDEX idx_product_inventory_product_id ON product_inventory(product_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- PRICE DROP TRIGGER
-- Fires when price_retail is updated and the new price is lower.
-- Invokes price-drop-check Edge Function to notify wishlisting users.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION notify_price_drop()
RETURNS TRIGGER AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key TEXT;
  v_request_id BIGINT;
BEGIN
  -- Only fire if price decreased
  IF NEW.price_retail IS NULL OR OLD.price_retail IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.price_retail >= OLD.price_retail THEN
    RETURN NEW;
  END IF;

  v_supabase_url := COALESCE(
    current_setting('app.settings.supabase_url', true),
    current_setting('supabase.url', true),
    'https://api.patina.cloud'
  );
  v_service_key := current_setting('app.settings.service_role_key', true);

  IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
    SELECT net.http_post(
      url := v_supabase_url || '/functions/v1/price-drop-check',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'product_id', NEW.id,
        'product_name', NEW.name,
        'old_price_cents', OLD.price_retail,
        'new_price_cents', NEW.price_retail
      )
    ) INTO v_request_id;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to dispatch price drop notification for product %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_product_price_drop
  AFTER UPDATE OF price_retail ON products
  FOR EACH ROW
  WHEN (OLD.price_retail IS DISTINCT FROM NEW.price_retail)
  EXECUTE FUNCTION notify_price_drop();

-- ═══════════════════════════════════════════════════════════════════════════
-- BACK IN STOCK TRIGGER
-- Fires when inventory goes from 0 to >0.
-- Invokes back-in-stock-check Edge Function to notify wishlisting users.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION notify_back_in_stock()
RETURNS TRIGGER AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key TEXT;
  v_product_name TEXT;
  v_request_id BIGINT;
BEGIN
  -- Only fire if quantity went from 0 to >0
  IF OLD.quantity_available != 0 OR NEW.quantity_available <= 0 THEN
    RETURN NEW;
  END IF;

  -- Get product name
  SELECT name INTO v_product_name
  FROM products
  WHERE id = NEW.product_id;

  v_supabase_url := COALESCE(
    current_setting('app.settings.supabase_url', true),
    current_setting('supabase.url', true),
    'https://api.patina.cloud'
  );
  v_service_key := current_setting('app.settings.service_role_key', true);

  IF v_supabase_url IS NOT NULL AND v_service_key IS NOT NULL THEN
    SELECT net.http_post(
      url := v_supabase_url || '/functions/v1/back-in-stock-check',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body := jsonb_build_object(
        'product_id', NEW.product_id,
        'product_name', COALESCE(v_product_name, 'A product'),
        'quantity_available', NEW.quantity_available
      )
    ) INTO v_request_id;
  END IF;

  -- Update timestamp
  NEW.updated_at := NOW();

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to dispatch back-in-stock notification for product %: %', NEW.product_id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_inventory_restock
  AFTER UPDATE OF quantity_available ON product_inventory
  FOR EACH ROW
  WHEN (OLD.quantity_available = 0 AND NEW.quantity_available > 0)
  EXECUTE FUNCTION notify_back_in_stock();
