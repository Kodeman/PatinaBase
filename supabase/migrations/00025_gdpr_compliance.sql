-- ═══════════════════════════════════════════════════════════════════════════
-- GDPR COMPLIANCE TABLES
-- Phase 4: Enterprise - Data export, account deletion, consent management
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- ENUMS
-- ═══════════════════════════════════════════════════════════════════════════

-- Data export request status
CREATE TYPE data_export_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed',
  'expired'
);

-- Account deletion request status
CREATE TYPE account_deletion_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'cancelled'
);

-- ═══════════════════════════════════════════════════════════════════════════
-- DATA EXPORT REQUESTS TABLE
-- Tracks user requests to export their data (GDPR Right to Data Portability)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE data_export_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Request status
  status data_export_status NOT NULL DEFAULT 'pending',

  -- What data to include in the export
  included_data TEXT[] NOT NULL DEFAULT ARRAY[
    'profile',
    'projects',
    'products',
    'proposals',
    'room_scans',
    'clients',
    'leads',
    'earnings'
  ],

  -- Timestamps
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,

  -- Download info (set when completed)
  download_url TEXT,
  expires_at TIMESTAMPTZ,  -- When the download link expires
  file_size_bytes BIGINT,

  -- Error tracking
  error TEXT,
  retry_count INT NOT NULL DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_data_export_requests_user_id ON data_export_requests(user_id);
CREATE INDEX idx_data_export_requests_status ON data_export_requests(status);
CREATE INDEX idx_data_export_requests_requested_at ON data_export_requests(requested_at DESC);

-- RLS
ALTER TABLE data_export_requests ENABLE ROW LEVEL SECURITY;

-- Users can see their own export requests
CREATE POLICY "Users can view own export requests"
  ON data_export_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create export requests for themselves
CREATE POLICY "Users can create own export requests"
  ON data_export_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Only system can update export requests (via service role)
CREATE POLICY "Service role can update export requests"
  ON data_export_requests FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Admins can view all export requests
CREATE POLICY "Admins can view all export requests"
  ON data_export_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
      AND r.name = 'super_admin'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- ACCOUNT DELETION REQUESTS TABLE
-- Tracks user requests to delete their account (GDPR Right to Erasure)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE account_deletion_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Request status
  status account_deletion_status NOT NULL DEFAULT 'pending',

  -- Reason for deletion (optional, for analytics)
  reason TEXT,

  -- Timestamps
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scheduled_for TIMESTAMPTZ NOT NULL,  -- When deletion will occur (grace period)
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  -- Cancellation info
  cancelled_by UUID REFERENCES auth.users(id),
  cancellation_reason TEXT,

  -- What was deleted (audit trail)
  deleted_data JSONB,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_account_deletion_requests_user_id ON account_deletion_requests(user_id);
CREATE INDEX idx_account_deletion_requests_status ON account_deletion_requests(status);
CREATE INDEX idx_account_deletion_requests_scheduled_for ON account_deletion_requests(scheduled_for);

-- RLS
ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Users can see their own deletion requests
CREATE POLICY "Users can view own deletion requests"
  ON account_deletion_requests FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create deletion requests for themselves
CREATE POLICY "Users can create own deletion requests"
  ON account_deletion_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update (cancel) their own pending deletion requests
CREATE POLICY "Users can cancel own pending deletion requests"
  ON account_deletion_requests FOR UPDATE
  USING (
    auth.uid() = user_id
    AND status = 'pending'
  );

-- Service role can update any deletion request
CREATE POLICY "Service role can update deletion requests"
  ON account_deletion_requests FOR UPDATE
  USING (auth.jwt() ->> 'role' = 'service_role');

-- Admins can view all deletion requests
CREATE POLICY "Admins can view all deletion requests"
  ON account_deletion_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
      AND r.name = 'super_admin'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- CONSENT RECORDS TABLE
-- Tracks user consent for various data processing activities
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE consent_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What consent is for
  consent_type TEXT NOT NULL,

  -- Current consent status
  granted BOOLEAN NOT NULL DEFAULT false,

  -- Timestamps
  granted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,

  -- Audit info
  ip_address INET,
  user_agent TEXT,

  -- Version tracking (for when consent text changes)
  consent_version TEXT DEFAULT '1.0',

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ensure one record per user per consent type
  CONSTRAINT consent_records_user_type_unique UNIQUE (user_id, consent_type)
);

-- Indexes
CREATE INDEX idx_consent_records_user_id ON consent_records(user_id);
CREATE INDEX idx_consent_records_consent_type ON consent_records(consent_type);
CREATE INDEX idx_consent_records_granted ON consent_records(granted) WHERE granted = true;

-- RLS
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;

-- Users can see their own consent records
CREATE POLICY "Users can view own consent records"
  ON consent_records FOR SELECT
  USING (auth.uid() = user_id);

-- Users can create consent records for themselves
CREATE POLICY "Users can create own consent records"
  ON consent_records FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own consent records
CREATE POLICY "Users can update own consent records"
  ON consent_records FOR UPDATE
  USING (auth.uid() = user_id);

-- Admins can view all consent records
CREATE POLICY "Admins can view all consent records"
  ON consent_records FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
      AND r.name = 'super_admin'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- CONSENT AUDIT LOG TABLE
-- Historical record of all consent changes (never deleted)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE consent_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,

  -- What happened
  action TEXT NOT NULL CHECK (action IN ('granted', 'revoked', 'updated')),

  -- State at time of action
  granted BOOLEAN NOT NULL,
  consent_version TEXT,

  -- Audit info
  ip_address INET,
  user_agent TEXT,

  -- Timestamp
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_consent_audit_log_user_id ON consent_audit_log(user_id);
CREATE INDEX idx_consent_audit_log_consent_type ON consent_audit_log(consent_type);
CREATE INDEX idx_consent_audit_log_created_at ON consent_audit_log(created_at DESC);

-- RLS
ALTER TABLE consent_audit_log ENABLE ROW LEVEL SECURITY;

-- Users can see their own consent audit log
CREATE POLICY "Users can view own consent audit log"
  ON consent_audit_log FOR SELECT
  USING (auth.uid() = user_id);

-- Only system can insert audit logs (via trigger or service role)
CREATE POLICY "Service role can insert consent audit logs"
  ON consent_audit_log FOR INSERT
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Users can also insert their own audit logs (via consent record trigger)
CREATE POLICY "Users can insert own consent audit logs"
  ON consent_audit_log FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all consent audit logs
CREATE POLICY "Admins can view all consent audit logs"
  ON consent_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = auth.uid()
      AND r.name = 'super_admin'
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_gdpr_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_data_export_requests_updated_at
  BEFORE UPDATE ON data_export_requests
  FOR EACH ROW EXECUTE FUNCTION update_gdpr_updated_at();

CREATE TRIGGER update_account_deletion_requests_updated_at
  BEFORE UPDATE ON account_deletion_requests
  FOR EACH ROW EXECUTE FUNCTION update_gdpr_updated_at();

CREATE TRIGGER update_consent_records_updated_at
  BEFORE UPDATE ON consent_records
  FOR EACH ROW EXECUTE FUNCTION update_gdpr_updated_at();

-- Audit consent changes
CREATE OR REPLACE FUNCTION audit_consent_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO consent_audit_log (
    user_id,
    consent_type,
    action,
    granted,
    consent_version,
    ip_address,
    user_agent
  ) VALUES (
    NEW.user_id,
    NEW.consent_type,
    CASE
      WHEN TG_OP = 'INSERT' AND NEW.granted THEN 'granted'
      WHEN TG_OP = 'INSERT' AND NOT NEW.granted THEN 'revoked'
      WHEN TG_OP = 'UPDATE' AND NEW.granted AND NOT OLD.granted THEN 'granted'
      WHEN TG_OP = 'UPDATE' AND NOT NEW.granted AND OLD.granted THEN 'revoked'
      ELSE 'updated'
    END,
    NEW.granted,
    NEW.consent_version,
    NEW.ip_address,
    NEW.user_agent
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER audit_consent_changes
  AFTER INSERT OR UPDATE ON consent_records
  FOR EACH ROW EXECUTE FUNCTION audit_consent_change();

-- ═══════════════════════════════════════════════════════════════════════════
-- SEED CONSENT TYPES (as comments for reference)
-- ═══════════════════════════════════════════════════════════════════════════

-- Available consent types:
-- 'marketing_email'      - Email marketing communications
-- 'analytics'            - Analytics and usage tracking
-- 'third_party_sharing'  - Sharing data with third parties
-- 'personalization'      - Personalized recommendations
-- 'terms_of_service'     - Terms of service acceptance
-- 'privacy_policy'       - Privacy policy acceptance

-- ═══════════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE data_export_requests IS 'GDPR Right to Data Portability - tracks user data export requests';
COMMENT ON TABLE account_deletion_requests IS 'GDPR Right to Erasure - tracks account deletion requests with 30-day grace period';
COMMENT ON TABLE consent_records IS 'Current consent status for each user and consent type';
COMMENT ON TABLE consent_audit_log IS 'Immutable audit trail of all consent changes';
