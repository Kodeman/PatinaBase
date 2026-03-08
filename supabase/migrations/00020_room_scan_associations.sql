-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Room Scan Associations
-- Description: Adds room_scan_associations table for sharing scans between
--              consumers and designers, plus viewer-related columns
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- ROOM SCAN ASSOCIATIONS TABLE
-- Links room scans to designers with access control
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS room_scan_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core Relationships
  scan_id UUID NOT NULL REFERENCES room_scans(id) ON DELETE CASCADE,
  consumer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  designer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Association Type
  -- 'explicit': Consumer directly shared with designer
  -- 'project_bound': Auto-associated through a project
  -- 'suggested': System suggested based on lead/matching
  association_type TEXT NOT NULL DEFAULT 'explicit'
    CHECK (association_type IN ('explicit', 'project_bound', 'suggested')),

  -- Status Tracking
  -- 'pending': Awaiting consumer approval (for suggested/requests)
  -- 'active': Association is live and accessible
  -- 'revoked': Consumer revoked access
  -- 'expired': Past expiration date
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'revoked', 'expired')),

  -- Access Level
  -- 'full': Complete scan data including 3D model
  -- 'preview': Thumbnail and basic dimensions only
  -- 'measurements_only': Dimensions and features, no visual data
  access_level TEXT NOT NULL DEFAULT 'full'
    CHECK (access_level IN ('full', 'preview', 'measurements_only')),

  -- Expiration (null = no expiration)
  expires_at TIMESTAMPTZ,

  -- Sharing timestamps
  shared_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,

  -- Request context (for designer-initiated requests)
  request_message TEXT,
  requested_at TIMESTAMPTZ,

  -- Project linking (optional)
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- One association per scan-designer pair
  UNIQUE(scan_id, designer_id)
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_room_scan_associations_scan ON room_scan_associations(scan_id);
CREATE INDEX IF NOT EXISTS idx_room_scan_associations_consumer ON room_scan_associations(consumer_id);
CREATE INDEX IF NOT EXISTS idx_room_scan_associations_designer ON room_scan_associations(designer_id);
CREATE INDEX IF NOT EXISTS idx_room_scan_associations_status ON room_scan_associations(status);
CREATE INDEX IF NOT EXISTS idx_room_scan_associations_type ON room_scan_associations(association_type);
CREATE INDEX IF NOT EXISTS idx_room_scan_associations_expires ON room_scan_associations(expires_at)
  WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_room_scan_associations_lead ON room_scan_associations(lead_id)
  WHERE lead_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE room_scan_associations ENABLE ROW LEVEL SECURITY;

-- Consumers can view associations for their own scans
CREATE POLICY "Consumers can view their scan associations" ON room_scan_associations
  FOR SELECT USING (auth.uid() = consumer_id);

-- Consumers can create associations for their scans
CREATE POLICY "Consumers can create associations for their scans" ON room_scan_associations
  FOR INSERT WITH CHECK (
    auth.uid() = consumer_id
    AND EXISTS (
      SELECT 1 FROM room_scans
      WHERE room_scans.id = scan_id
      AND room_scans.user_id = auth.uid()
    )
  );

-- Consumers can update their scan associations (revoke, change access level)
CREATE POLICY "Consumers can update their scan associations" ON room_scan_associations
  FOR UPDATE USING (auth.uid() = consumer_id);

-- Consumers can delete their scan associations
CREATE POLICY "Consumers can delete their scan associations" ON room_scan_associations
  FOR DELETE USING (auth.uid() = consumer_id);

-- Designers can view associations where they have active access
CREATE POLICY "Designers can view their active associations" ON room_scan_associations
  FOR SELECT USING (
    auth.uid() = designer_id
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW())
  );

-- Designers can also view pending associations (access requests)
CREATE POLICY "Designers can view their pending associations" ON room_scan_associations
  FOR SELECT USING (
    auth.uid() = designer_id
    AND status = 'pending'
  );

-- Designers can request access (create suggested associations)
CREATE POLICY "Designers can request access" ON room_scan_associations
  FOR INSERT WITH CHECK (
    auth.uid() = designer_id
    AND association_type = 'suggested'
    AND status = 'pending'
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- UPDATE ROOM_SCANS RLS POLICY
-- Allow designers to access scans via associations
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop the existing designer policy to recreate it with association support
DROP POLICY IF EXISTS "Designers can view client room scans" ON room_scans;

-- Recreate with both designer_clients and room_scan_associations access
CREATE POLICY "Designers can view authorized room scans" ON room_scans
  FOR SELECT USING (
    -- Owner can always view
    auth.uid() = user_id
    -- Designer-client relationship
    OR EXISTS (
      SELECT 1 FROM designer_clients
      WHERE designer_clients.designer_id = auth.uid()
      AND designer_clients.client_id = room_scans.user_id
    )
    -- Active association
    OR EXISTS (
      SELECT 1 FROM room_scan_associations
      WHERE room_scan_associations.scan_id = room_scans.id
      AND room_scan_associations.designer_id = auth.uid()
      AND room_scan_associations.status = 'active'
      AND (room_scan_associations.expires_at IS NULL OR room_scan_associations.expires_at > NOW())
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- ALTER ROOM_SCANS TABLE
-- Add viewer-related columns for annotations, measurements, and glTF model
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE room_scans
  ADD COLUMN IF NOT EXISTS annotations JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS measurements JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS model_url_gltf TEXT;

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

-- Updated at trigger
CREATE TRIGGER update_room_scan_associations_updated_at
  BEFORE UPDATE ON room_scan_associations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════

-- Function to auto-expire associations
CREATE OR REPLACE FUNCTION expire_room_scan_associations()
RETURNS INTEGER AS $$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE room_scan_associations
  SET status = 'expired', updated_at = NOW()
  WHERE status = 'active'
  AND expires_at IS NOT NULL
  AND expires_at < NOW();

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

-- Function to share a scan with a designer (consumer-initiated)
CREATE OR REPLACE FUNCTION share_room_scan(
  p_scan_id UUID,
  p_designer_id UUID,
  p_access_level TEXT DEFAULT 'full',
  p_expires_in_days INTEGER DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_lead_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_consumer_id UUID;
  v_association_id UUID;
  v_expires_at TIMESTAMPTZ;
BEGIN
  -- Get consumer ID from scan ownership
  SELECT user_id INTO v_consumer_id
  FROM room_scans
  WHERE id = p_scan_id;

  IF v_consumer_id IS NULL THEN
    RAISE EXCEPTION 'Scan not found';
  END IF;

  -- Verify caller owns the scan
  IF v_consumer_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to share this scan';
  END IF;

  -- Calculate expiration
  IF p_expires_in_days IS NOT NULL THEN
    v_expires_at := NOW() + (p_expires_in_days || ' days')::INTERVAL;
  END IF;

  -- Create or update association
  INSERT INTO room_scan_associations (
    scan_id,
    consumer_id,
    designer_id,
    association_type,
    status,
    access_level,
    expires_at,
    shared_at,
    project_id,
    lead_id
  ) VALUES (
    p_scan_id,
    v_consumer_id,
    p_designer_id,
    'explicit',
    'active',
    p_access_level,
    v_expires_at,
    NOW(),
    p_project_id,
    p_lead_id
  )
  ON CONFLICT (scan_id, designer_id) DO UPDATE SET
    status = 'active',
    access_level = p_access_level,
    expires_at = v_expires_at,
    shared_at = NOW(),
    revoked_at = NULL,
    revoked_reason = NULL,
    updated_at = NOW()
  RETURNING id INTO v_association_id;

  RETURN v_association_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to revoke access
CREATE OR REPLACE FUNCTION revoke_room_scan_access(
  p_association_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_consumer_id UUID;
BEGIN
  -- Get consumer ID and verify ownership
  SELECT consumer_id INTO v_consumer_id
  FROM room_scan_associations
  WHERE id = p_association_id;

  IF v_consumer_id IS NULL THEN
    RAISE EXCEPTION 'Association not found';
  END IF;

  IF v_consumer_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to revoke this association';
  END IF;

  UPDATE room_scan_associations
  SET
    status = 'revoked',
    revoked_at = NOW(),
    revoked_reason = p_reason,
    updated_at = NOW()
  WHERE id = p_association_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
