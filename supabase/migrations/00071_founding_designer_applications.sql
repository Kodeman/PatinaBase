-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Founding Designer Applications
-- Description: Marketing-site designer application submissions + admin review
-- Source: patina.cloud /api/designers-apply
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TYPE application_review_status AS ENUM (
  'new',
  'in_review',
  'approved',
  'rejected',
  'archived'
);

CREATE TABLE IF NOT EXISTS founding_designer_applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Submitted fields (from marketing form)
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  company TEXT,
  website TEXT,
  motivation TEXT,
  referral_source TEXT,

  -- Review workflow
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

-- Idempotent column adds for databases where the table was created via Studio
ALTER TABLE founding_designer_applications
  ADD COLUMN IF NOT EXISTS status application_review_status NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_notes TEXT,
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_founding_designer_applications_status
  ON founding_designer_applications(status);
CREATE INDEX IF NOT EXISTS idx_founding_designer_applications_email
  ON founding_designer_applications(email);
CREATE INDEX IF NOT EXISTS idx_founding_designer_applications_created_at
  ON founding_designer_applications(created_at DESC);

ALTER TABLE founding_designer_applications ENABLE ROW LEVEL SECURITY;

-- Anonymous public submits (from marketing site via service role / anon)
DROP POLICY IF EXISTS "Service role can insert founding designer applications"
  ON founding_designer_applications;
CREATE POLICY "Service role can insert founding designer applications"
  ON founding_designer_applications
  FOR INSERT
  WITH CHECK (auth.uid() IS NULL);

-- Admins manage
DROP POLICY IF EXISTS "Admins can manage founding designer applications"
  ON founding_designer_applications;
CREATE POLICY "Admins can manage founding designer applications"
  ON founding_designer_applications
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.domain = 'admin'
    )
  );

CREATE OR REPLACE FUNCTION update_founding_designer_application_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_founding_designer_applications_updated_at
  ON founding_designer_applications;
CREATE TRIGGER trg_founding_designer_applications_updated_at
  BEFORE UPDATE ON founding_designer_applications
  FOR EACH ROW
  EXECUTE FUNCTION update_founding_designer_application_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- APPLICATION COMMUNICATIONS LOG
-- Tracks emails sent to applicants before they have a user account.
-- Used for both designer and maker applications; the `application_type` +
-- `application_id` columns identify the target row.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS application_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  application_type TEXT NOT NULL CHECK (application_type IN ('designer', 'maker')),
  application_id UUID NOT NULL,

  sent_by UUID REFERENCES auth.users(id),
  channel TEXT NOT NULL DEFAULT 'email',
  template_id UUID,
  subject TEXT NOT NULL,
  body_html TEXT,
  body_text TEXT,
  to_email TEXT NOT NULL,

  provider_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_application_communications_target
  ON application_communications(application_type, application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_application_communications_to_email
  ON application_communications(to_email);

ALTER TABLE application_communications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can manage application communications"
  ON application_communications;
CREATE POLICY "Admins can manage application communications"
  ON application_communications
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON ur.role_id = r.id
      WHERE ur.user_id = auth.uid()
      AND r.domain = 'admin'
    )
  );

COMMENT ON TABLE founding_designer_applications IS
  'Marketing-site designer applications (/api/designers-apply) with admin review workflow';
COMMENT ON TABLE application_communications IS
  'Email/communication log for applicants (pre-onboarding). See application_type + application_id.';
