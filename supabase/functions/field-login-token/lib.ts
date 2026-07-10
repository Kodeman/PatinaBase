// field-login-token — pure request logic (no Deno.serve, no network).
//
// Split out from index.ts so the auth guard + response shape can be tested
// with dependency injection (po-send / aesthete-ask convention: importing
// index.ts would boot Deno.serve). index.ts wires the real Supabase deps.
//
// SECURITY: the returned `token_hash` is a single-use GoTrue magiclink token —
// treat it like a password. It is NEVER logged, and every JSON response carries
// `Cache-Control: no-store`. The function mints a token ONLY for the caller's
// own verified identity; it never reads an `email` (or any) parameter from the
// request body, so a caller can never mint a login for someone else.

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

/** JSON response with CORS + no-store (token-bearing responses must not cache). */
export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

export interface CallerUser {
  id: string;
  email: string | null;
}

/** Either the minted hashed token, or a non-secret error code for the 502. */
export type GenerateResult = { tokenHash: string } | { error: string };

export interface FieldLoginDeps {
  /** Resolve the caller from the request's Authorization header (getUser on the caller's token). */
  getCallerUser: (req: Request) => Promise<CallerUser | null>;
  /** Mint a magiclink for `email`; return its hashed_token, or a non-secret error code. */
  generateMagiclinkHash: (email: string) => Promise<GenerateResult>;
  /** Seconds the returned token is valid server-side (mirrors GoTrue otp_expiry). */
  expiresInSeconds: number;
}

/**
 * Core handler. Contract:
 *   OPTIONS            → 200 CORS preflight
 *   non-POST           → 405 { error: 'method_not_allowed' }
 *   no/invalid caller  → 401 { error: 'unauthorized' }        (defense-in-depth; verify_jwt already gates)
 *   caller has no email → 422 { error: 'no_caller_email' }
 *   generateLink fails → 502 { error: 'generate_link_failed', code }
 *   ok                 → 200 { token_hash, expires_in }
 */
export async function handleFieldLoginToken(
  req: Request,
  deps: FieldLoginDeps,
): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  // Auth is enforced twice: verify_jwt at the gateway, and this getUser call.
  // The caller's email comes ONLY from their verified identity — no request
  // body is read, so no `email` parameter can ever be honored.
  const caller = await deps.getCallerUser(req);
  if (!caller) {
    return json({ error: 'unauthorized' }, 401);
  }
  const email = caller.email?.trim().toLowerCase();
  if (!email) {
    return json({ error: 'no_caller_email' }, 422);
  }

  const result = await deps.generateMagiclinkHash(email);
  if ('error' in result) {
    // `result.error` is a non-secret error code (never the token).
    return json({ error: 'generate_link_failed', code: result.error }, 502);
  }

  return json({ token_hash: result.tokenHash, expires_in: deps.expiresInSeconds });
}
