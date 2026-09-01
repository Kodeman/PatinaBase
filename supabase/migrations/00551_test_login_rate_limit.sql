-- ═══════════════════════════════════════════════════════════════════════════
-- 00551 — Rate-limit log for the allowlisted test-account login path
--
-- Backs the test-account-login edge function: a designated shared TEST
-- ACCOUNT (tester@patina.cloud) signs into the designer portal with a static
-- OTP code, gated by a server-side allowlist read from Vault-backed app
-- settings (public.app_setting, 00258 — 'test_login_accounts',
-- 'test_login_code'). This table is a plain per-attempt log, not an atomic
-- bucket (contrast qr_auth_rate_limits, 00427): the edge function inserts one
-- row per POST it receives, then counts that IP's rows in the trailing
-- 15-minute window and returns 429 above 20. service_role only — no policies,
-- no anon/authenticated access, matching a pre-auth security log.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.test_login_attempts (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  ip           text NOT NULL,
  email        text,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_test_login_attempts_ip_attempted_at
  ON public.test_login_attempts (ip, attempted_at);

ALTER TABLE public.test_login_attempts ENABLE ROW LEVEL SECURITY;
-- No policies: RLS enabled with none defined denies all access to
-- anon/authenticated regardless of grants; the REVOKE below is defense in
-- depth so only service_role (which bypasses RLS) can read or write.

REVOKE ALL ON TABLE public.test_login_attempts FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.test_login_attempts TO service_role;

COMMENT ON TABLE public.test_login_attempts IS
  'Per-attempt log for the allowlisted test-account login edge function (test-account-login). service_role only.';
