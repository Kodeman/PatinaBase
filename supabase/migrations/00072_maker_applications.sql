-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Maker Applications
-- Description: Marketing-site maker application submissions + admin review
-- Source: patina.cloud /api/makers-apply
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS maker_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Submitted fields (from marketing form)
  brand_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  email TEXT NOT NULL,
  website TEXT,
  description TEXT,
  referral_source TEXT,

  -- Review workflow (reuses application_review_status from 00071)
  status application_review_status NOT NULL DEFAULT 'new',
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  -- Onboarding linkage
  auth_user_id UUID REFERENCES auth.users(id),
  converted_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent adds for databases where the table was created via Studio
ALTER TABLE maker_applications
  ADD COLUMN IF NOT EXISTS status application_review_status NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_maker_applications_status
  ON maker_applications(status);
CREATE INDEX IF NOT EXISTS idx_maker_applications_email
  ON maker_applications(email);
CREATE INDEX IF NOT EXISTS idx_maker_applications_created_at
  ON maker_applications(created_at DESC);

ALTER TABLE maker_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can insert maker applications"
  ON maker_applications;
CREATE POLICY "Service role can insert maker applications"
  ON maker_applications
  FOR INSERT
  WITH CHECK (auth.uid() IS NULL);

DROP POLICY IF EXISTS "Admins can manage maker applications"
  ON maker_applications;
CREATE POLICY "Admins can manage maker applications"
  ON maker_applications
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.domain = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION update_maker_application_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_maker_applications_updated_at
  ON maker_applications;
CREATE TRIGGER trg_maker_applications_updated_at
  BEFORE UPDATE ON maker_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_maker_application_updated_at();

COMMENT ON TABLE maker_applications IS
  'Marketing-site maker applications (/api/makers-apply) with admin review workflow';
