import { createBrowserClient } from '@patina/supabase';

/**
 * Test-account OTP fallback (`test-account-login` edge function,
 * verify_jwt=false). Tried ONLY after the normal `supabase.auth.verifyOtp`
 * call has already failed, so it never intercepts a real user's code and
 * never changes the happy path. Resolves the caller's session directly via
 * `token_hash` on success; returns false for any other outcome (403 not
 * allowlisted / wrong code, 429 rate-limited, network error, missing
 * token_hash) so the caller falls through to the ordinary invalid-code
 * error — never logs `code`.
 *
 * Shared between `signin/page.tsx` (its own inline code-entry step) and
 * `verify-otp/page.tsx` — both handle a typed six-digit code and both must
 * try this fallback identically before showing the invalid-code error.
 *
 * Redeems with `type: 'magiclink'`, matching the token minted by the edge
 * function's `admin.auth.admin.generateLink({ type: 'magiclink' })` — the
 * same type this repo's other `generateLink({type:'magiclink'})` redemption
 * (`use-qr-auth.ts`) uses. `type: 'email'` is for a real OTP code, not a
 * magiclink token_hash.
 */
export async function tryTestAccountFallback(
  email: string,
  code: string,
): Promise<boolean> {
  try {
    const supabase = createBrowserClient();
    const { data, error } = await supabase.functions.invoke('test-account-login', {
      body: { email, code },
    });
    if (error) return false;
    const tokenHash = (data as { token_hash?: string } | null)?.token_hash;
    if (!tokenHash) return false;
    const { data: verified, error: verifyError } = await supabase.auth.verifyOtp({
      type: 'magiclink',
      token_hash: tokenHash,
    });
    if (verifyError) return false;
    return !!verified.session;
  } catch {
    return false;
  }
}
