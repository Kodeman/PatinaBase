-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: Device pairing sessions
-- Description: Short-lived nonces that let an authenticated portal user
--              hand off their identity to a fresh iOS device via QR scan.
--              The portal generates a nonce; the iOS app exchanges it for
--              a magic-link token_hash and signs in with verifyOtp.
--
--              Distinct from qr_auth_sessions (00033), which goes the OTHER
--              direction — an already-signed-in iOS user approves a portal
--              session.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS device_pair_sessions (
  nonce TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'consumed', 'expired', 'denied')),
  -- Audit trail for the originating browser session
  origin_browser TEXT,
  origin_os TEXT,
  origin_ip INET,
  -- Audit trail for the iOS device that consumed the nonce
  device_info JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ
);

CREATE INDEX idx_device_pair_user ON device_pair_sessions(user_id);
CREATE INDEX idx_device_pair_status ON device_pair_sessions(status);
CREATE INDEX idx_device_pair_expires ON device_pair_sessions(expires_at);

ALTER TABLE device_pair_sessions ENABLE ROW LEVEL SECURITY;
-- Service-role only. Endpoints (/api/auth/device/{pair,exchange,status})
-- are the sole interface; users never read this table directly.
