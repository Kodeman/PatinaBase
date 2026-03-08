-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Add room_scan_id to leads
-- Description: Links leads to room scans so designers can see the homeowner's
-- scanned room when reviewing a design request
-- ═══════════════════════════════════════════════════════════════════════════

-- Add room_scan_id column to leads table
ALTER TABLE leads
ADD COLUMN IF NOT EXISTS room_scan_id UUID REFERENCES room_scans(id) ON DELETE SET NULL;

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_leads_room_scan ON leads(room_scan_id);

-- Add comment
COMMENT ON COLUMN leads.room_scan_id IS 'Optional reference to the room scan associated with this design request';
