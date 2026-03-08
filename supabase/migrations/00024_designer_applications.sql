-- ═══════════════════════════════════════════════════════════════════════════
-- Designer Applications Table (Phase 3: Professional Auth)
-- Supports designer onboarding with approval workflow
-- ═══════════════════════════════════════════════════════════════════════════

-- Create application status enum
CREATE TYPE designer_application_status AS ENUM (
  'pending',
  'under_review',
  'approved',
  'rejected'
);

-- Designer applications table
CREATE TABLE IF NOT EXISTS designer_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status designer_application_status NOT NULL DEFAULT 'pending',

  -- Application details
  business_name TEXT,
  portfolio_url TEXT,
  years_experience INTEGER,
  specialties TEXT[] DEFAULT '{}',
  certifications TEXT[] DEFAULT '{}',
  referral_source TEXT,
  additional_info TEXT,

  -- Review details
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_designer_applications_user_id ON designer_applications(user_id);
CREATE INDEX idx_designer_applications_status ON designer_applications(status);
CREATE INDEX idx_designer_applications_created_at ON designer_applications(created_at DESC);

-- Enable RLS
ALTER TABLE designer_applications ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS POLICIES
-- ═══════════════════════════════════════════════════════════════════════════

-- Users can view their own applications
CREATE POLICY "Users can view own applications"
  ON designer_applications
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Users can insert their own applications
CREATE POLICY "Users can submit applications"
  ON designer_applications
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own pending applications
CREATE POLICY "Users can update own pending applications"
  ON designer_applications
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND status = 'pending')
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- Admins can view all applications
CREATE POLICY "Admins can view all applications"
  ON designer_applications
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.domain = 'admin'
    )
  );

-- Admins can update any application (for approval/rejection)
CREATE POLICY "Admins can update applications"
  ON designer_applications
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.domain = 'admin'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

-- Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_designer_application_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_designer_application_updated_at
  BEFORE UPDATE ON designer_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_designer_application_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE designer_applications IS 'Designer role applications with approval workflow';
COMMENT ON COLUMN designer_applications.status IS 'Application status: pending -> under_review -> approved/rejected';
COMMENT ON COLUMN designer_applications.specialties IS 'Array of design specialties (e.g., residential, commercial, hospitality)';
COMMENT ON COLUMN designer_applications.certifications IS 'Professional certifications (e.g., ASID, NCIDQ)';
