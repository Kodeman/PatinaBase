-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Saved Items
-- Description: Creates the saved_items table for persisting user's saved
--              furniture pieces across devices (iOS "Table" feature)
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- SAVED_ITEMS TABLE
-- Stores pieces saved from emergence, search, or companion recommendations
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS saved_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Owner
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Product reference (nullable — product may be deleted or external)
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,

  -- Room association (nullable — item may not be linked to a room)
  room_id UUID REFERENCES rooms(id) ON DELETE SET NULL,

  -- Item details (denormalized for offline/fast access)
  name TEXT NOT NULL,
  image_url TEXT,
  brand_name TEXT,
  price_in_cents INTEGER,
  notes TEXT,

  -- Where the item was discovered
  source TEXT DEFAULT 'emergence' CHECK (source IN ('emergence', 'search', 'companion', 'extension')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_saved_items_user ON saved_items(user_id);
CREATE INDEX idx_saved_items_room ON saved_items(room_id);
CREATE INDEX idx_saved_items_product ON saved_items(product_id);
CREATE INDEX idx_saved_items_created ON saved_items(created_at DESC);

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE saved_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own saved items" ON saved_items
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own saved items" ON saved_items
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own saved items" ON saved_items
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own saved items" ON saved_items
  FOR DELETE USING (auth.uid() = user_id);

-- Designers can view their clients' saved items
CREATE POLICY "Designers can view client saved items" ON saved_items
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM designer_clients
      WHERE designer_clients.designer_id = auth.uid()
      AND designer_clients.client_id = saved_items.user_id
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER: Auto-update rooms.saved_item_count
-- Uses existing increment/decrement helper functions from migration 00027
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_room_saved_item_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.room_id IS NOT NULL THEN
    PERFORM increment_room_saved_items(NEW.room_id, 1);
  ELSIF TG_OP = 'DELETE' AND OLD.room_id IS NOT NULL THEN
    PERFORM decrement_room_saved_items(OLD.room_id, 1);
  ELSIF TG_OP = 'UPDATE' THEN
    -- Handle room_id changes
    IF OLD.room_id IS DISTINCT FROM NEW.room_id THEN
      IF OLD.room_id IS NOT NULL THEN
        PERFORM decrement_room_saved_items(OLD.room_id, 1);
      END IF;
      IF NEW.room_id IS NOT NULL THEN
        PERFORM increment_room_saved_items(NEW.room_id, 1);
      END IF;
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER saved_items_room_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON saved_items
  FOR EACH ROW EXECUTE FUNCTION update_room_saved_item_count();

-- Trigger for updated_at
CREATE TRIGGER update_saved_items_updated_at
  BEFORE UPDATE ON saved_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE saved_items IS 'User-saved furniture pieces from emergence, search, or companion recommendations';
COMMENT ON COLUMN saved_items.source IS 'Where the item was discovered: emergence, search, companion, or extension';
COMMENT ON COLUMN saved_items.price_in_cents IS 'Denormalized price snapshot at time of save (in cents)';
