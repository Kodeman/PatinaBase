// Supabase Edge Function: field-login-token
//
// Web→App QR session handoff (designer portal → Patina Field iOS).
//
// A signed-in designer opens "Connect Patina Field" in the designer portal.
// The portal calls this function, which mints a single-use GoTrue magiclink
// token for the CALLER'S OWN email and returns its hashed token. The portal
// encodes it as `field://login?v=1&th=<token_hash>` in a QR; Patina Field
// scans it and verifies the token (`/auth/v1/verify` type=magiclink) to obtain
// a session as that designer.
//
// verify_jwt = true (config.toml, also the platform default): the gateway
// demands a valid JWT, and getCallerUser re-derives the caller from that JWT.
// The function accepts NO request body — it mints ONLY for the caller's own
// verified identity, so a caller can never mint a login for another email.
//
// The portal re-invokes every 60s to rotate the QR; each generateLink mints a
// fresh single-use token that supersedes the previous one.
//
// Required env (auto-injected by the platform):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional:
//   FIELD_LOGIN_TOKEN_TTL_SECONDS — reported `expires_in` (default 3600,
//     mirrors GoTrue otp_expiry). Informational for the iOS side; the real
//     lifetime is GoTrue's OTP expiry.
//
// SECURITY: the token_hash is a secret. It is never logged (client or edge),
// and every response is Cache-Control: no-store. See lib.ts.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { type FieldLoginDeps, handleFieldLoginToken } from './lib.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const rawTtl = Number(Deno.env.get('FIELD_LOGIN_TOKEN_TTL_SECONDS') ?? '3600');
const EXPIRES_IN_SECONDS = Number.isFinite(rawTtl) && rawTtl > 0 ? rawTtl : 3600;

const deps: FieldLoginDeps = {
  expiresInSeconds: EXPIRES_IN_SECONDS,

  // Canonical Supabase Edge Function pattern: a client carrying the caller's
  // Authorization header resolves the caller via getUser().
  getCallerUser: async (req) => {
    const auth = req.headers.get('Authorization');
    if (!auth) return null;
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      global: { headers: { Authorization: auth } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  },

  // Service-role admin client mints the magiclink for the caller's own email.
  generateMagiclinkHash: async (email) => {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email,
    });
    if (error) {
      // Log the error identity ONLY — never the token / properties.
      const status = (error as { status?: number }).status ?? '';
      console.error('field-login-token: generateLink failed', error.name ?? 'error', status);
      return { error: error.name ?? 'generate_link_error' };
    }
    const tokenHash = data?.properties?.hashed_token;
    if (!tokenHash) {
      console.error('field-login-token: generateLink returned no hashed_token');
      return { error: 'no_hashed_token' };
    }
    return { tokenHash };
  },
};

Deno.serve((req) => handleFieldLoginToken(req, deps));
