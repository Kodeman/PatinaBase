-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Allow Direct Client Contacts
-- Description: Allow designers to add clients who haven't registered yet
-- ═══════════════════════════════════════════════════════════════════════════

-- Make client_id nullable (for clients who haven't signed up yet)
ALTER TABLE designer_clients ALTER COLUMN client_id DROP NOT NULL;

-- Add direct contact info columns for non-registered clients
ALTER TABLE designer_clients ADD COLUMN IF NOT EXISTS client_email TEXT;
ALTER TABLE designer_clients ADD COLUMN IF NOT EXISTS client_name TEXT;

-- Add index for email lookup
CREATE INDEX IF NOT EXISTS idx_designer_clients_email ON designer_clients(client_email);

-- Update unique constraint to handle both cases
-- Drop the old unique constraint
ALTER TABLE designer_clients DROP CONSTRAINT IF EXISTS designer_clients_designer_id_client_id_key;

-- Add new constraint that allows either client_id OR client_email to be unique per designer
-- Note: This uses a partial unique index approach
CREATE UNIQUE INDEX IF NOT EXISTS idx_designer_clients_unique_profile
  ON designer_clients(designer_id, client_id)
  WHERE client_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_designer_clients_unique_email
  ON designer_clients(designer_id, client_email)
  WHERE client_email IS NOT NULL AND client_id IS NULL;
