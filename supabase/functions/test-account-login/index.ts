// Supabase Edge Function: test-account-login
//
// Owner-authorized, pre-auth login path for ONE designated shared TEST
// ACCOUNT (tester@patina.cloud) used by external testers who have no access
// to that mailbox. A caller posts { email, code }; if email + code match a
// Vault-backed allowlist, the function mints a normal single-use GoTrue
// magiclink token and returns its hashed_token, exactly as a real OTP flow
// would. The portal-side consumer of this contract is built separately.
//
// verify_jwt = false (config.toml): this endpoint runs pre-auth — there is no
// caller session yet. Authenticity/authorization comes entirely from the
// email+code pair matching Vault-backed settings, checked in-code below.
//
// Config (public.app_setting, 00258 — Vault-backed, never in git):
//   test_login_accounts — comma-separated allowlisted emails
//   test_login_code     — the static OTP code
// If EITHER is missing/empty, every request is denied (fail closed) — see
// lib.ts. These settings are provisioned separately (Vault secrets named
// 'app.settings.test_login_accounts' / 'app.settings.test_login_code'); this
// change does not create them.
//
// Rate limiting: every POST writes one row to public.test_login_attempts
// (migration 00551) with the caller's IP (LAST hop of X-Forwarded-For — the
// first hop is caller-controlled) BEFORE the credential decision; the
// submitted email is stored only when it is allowlisted. More than 20
// attempts from the same IP, or more than 300 across all IPs, in the trailing
// 15 minutes -> 429. Rows are swept at 24h by a pg_cron job (00554).
//
// SECURITY: every failure path (bad email, bad code, missing config,
// generateLink failure) returns the SAME generic 403 body — a caller can
// never learn whether a given email is allowlisted. The submitted code and
// the minted token_hash are NEVER logged. See lib.ts for the full contract
// and constant-time code comparison.
//
// Required env (auto-injected by the platform):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { type TestAccountLoginDeps, handleTestAccountLogin } from './lib.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const RATE_LIMIT_WINDOW_MINUTES = 15;
const RATE_LIMIT_MAX_ATTEMPTS = 20;
const RATE_LIMIT_MAX_ATTEMPTS_GLOBAL = 300;

function rateLimitWindowStart(): string {
  return new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60_000).toISOString();
}

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const deps: TestAccountLoginDeps = {
  getConfig: async () => {
    const [{ data: accounts, error: accountsErr }, { data: code, error: codeErr }] =
      await Promise.all([
        admin.rpc('app_setting', { p_name: 'test_login_accounts' }),
        admin.rpc('app_setting', { p_name: 'test_login_code' }),
      ]);
    if (accountsErr) {
      console.error('test-account-login: app_setting(test_login_accounts) failed', accountsErr.message);
    }
    if (codeErr) {
      console.error('test-account-login: app_setting(test_login_code) failed', codeErr.message);
    }
    return {
      accounts: typeof accounts === 'string' && accounts.length > 0 ? accounts : null,
      code: typeof code === 'string' && code.length > 0 ? code : null,
    };
  },

  recordAttempt: async (ip, email) => {
    const { error } = await admin
      .from('test_login_attempts')
      .insert({ ip, email });
    if (error) {
      // Never fail the request just because the audit log write failed —
      // but never silently drop the failure either.
      console.error('test-account-login: failed to record attempt', error.message);
    }
  },

  isRateLimited: async (ip) => {
    const { count, error } = await admin
      .from('test_login_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('ip', ip)
      .gte('attempted_at', rateLimitWindowStart());
    if (error) {
      // Fail closed on a rate-limit read error: treat as rate-limited rather
      // than risk an unbounded brute-force window.
      console.error('test-account-login: rate-limit check failed', error.message);
      return true;
    }
    return (count ?? 0) > RATE_LIMIT_MAX_ATTEMPTS;
  },

  isGloballyRateLimited: async () => {
    const { count, error } = await admin
      .from('test_login_attempts')
      .select('id', { count: 'exact', head: true })
      .gte('attempted_at', rateLimitWindowStart());
    if (error) {
      console.error('test-account-login: global rate-limit check failed', error.message);
      return true;
    }
    return (count ?? 0) > RATE_LIMIT_MAX_ATTEMPTS_GLOBAL;
  },

  generateMagiclinkHash: async (email) => {
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (error) {
      // Log the error identity ONLY — never the token / properties.
      const status = (error as { status?: number }).status ?? '';
      console.error('test-account-login: generateLink failed', error.name ?? 'error', status);
      return { error: error.name ?? 'generate_link_error' };
    }
    const tokenHash = data?.properties?.hashed_token;
    if (!tokenHash) {
      console.error('test-account-login: generateLink returned no hashed_token');
      return { error: 'no_hashed_token' };
    }
    return { tokenHash };
  },
};

Deno.serve((req) => handleTestAccountLogin(req, deps));
