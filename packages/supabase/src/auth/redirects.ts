import type { AuthFailureKind } from './errors';

const MAX_DECODE_PASSES = 3;

function isSafePath(value: string): boolean {
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return false;

  let decoded = value;
  for (let pass = 0; pass < MAX_DECODE_PASSES; pass += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      return false;
    }

    if (!decoded.startsWith('/') || decoded.startsWith('//')) return false;
    if (/[\\\u0000-\u001f\u007f]/.test(decoded)) return false;
  }

  return true;
}
/**
 * Return a same-origin pathname (including query/hash), or the safe fallback.
 * Encoded protocol-relative and backslash variants are rejected as well.
 */
export function safeAuthReturnPath(
  raw: string | null | undefined,
  fallback = '/',
): string {
  const safeFallback = isSafePath(fallback) ? fallback : '/';
  if (!raw || !isSafePath(raw)) return safeFallback;
  return raw;
}

export function buildAuthCallbackUrl(
  origin: string,
  destination: string | null | undefined,
): string {
  const url = new URL('/auth/callback', origin);
  url.searchParams.set('callbackUrl', safeAuthReturnPath(destination));
  return url.toString();
}

export function buildVerifyOtpPath(
  email: string,
  destination: string | null | undefined,
): string {
  const params = new URLSearchParams({
    email,
    callbackUrl: safeAuthReturnPath(destination),
  });
  return `/auth/verify-otp?${params.toString()}`;
}

export function buildSignInPath(
  destination: string | null | undefined,
  failure?: AuthFailureKind | string,
): string {
  const params = new URLSearchParams({
    callbackUrl: safeAuthReturnPath(destination),
  });
  if (failure) params.set('error', failure);
  return `/auth/signin?${params.toString()}`;
}

/**
 * Recover the final portal destination nested inside a sanitized reset route.
 * Invalid outer or inner paths fall back to the portal's own landing page.
 */
export function recoveryFinalReturnPath(
  recoveryPath: string | null | undefined,
  fallback = '/',
): string {
  const safeFallback = safeAuthReturnPath(undefined, fallback);
  const safeRecoveryPath = safeAuthReturnPath(
    recoveryPath,
    '/auth/reset-password',
  );
  const recoveryUrl = new URL(safeRecoveryPath, 'https://auth.patina.local');
  if (recoveryUrl.pathname !== '/auth/reset-password') return safeFallback;
  return safeAuthReturnPath(
    recoveryUrl.searchParams.get('callbackUrl'),
    safeFallback,
  );
}
