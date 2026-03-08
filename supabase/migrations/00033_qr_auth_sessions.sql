-- QR Code Authentication Sessions
-- Short-lived sessions for cross-device QR code sign-in
-- Web browser generates a session, iOS app approves it

CREATE TABLE IF NOT EXISTS qr_auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'expired', 'denied')),
  browser TEXT,
  os TEXT,
  ip_address INET,
  user_id UUID REFERENCES auth.users(id),
  token_hash TEXT,
  user_email TEXT,
  approved_at TIMESTAMPTZ,
  device_info JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_qr_sessions_token ON qr_auth_sessions(session_token);
CREATE INDEX idx_qr_sessions_expires ON qr_auth_sessions(expires_at);

ALTER TABLE qr_auth_sessions ENABLE ROW LEVEL SECURITY;
-- No RLS policies = service-role only access
