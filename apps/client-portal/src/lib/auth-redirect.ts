import { safeCallbackPath } from './portal-access';

/** One sanitizer shared by password, OAuth, magic-link, and OTP flows. */
export function resolveAuthReturnPath(raw: string | null): string {
  return safeCallbackPath(raw) ?? '/';
}

export function buildAuthCallbackUrl(origin: string, callbackPath: string): string {
  const url = new URL('/auth/callback', origin);
  url.searchParams.set('callbackUrl', resolveAuthReturnPath(callbackPath));
  return url.toString();
}

export function buildVerifyOtpPath(email: string, callbackPath: string): string {
  const params = new URLSearchParams({
    email,
    callbackUrl: resolveAuthReturnPath(callbackPath),
  });
  return `/auth/verify-otp?${params.toString()}`;
}

export function buildSignInPath(callbackPath: string, error?: string): string {
  const params = new URLSearchParams();
  if (error) params.set('error', error);
  params.set('callbackUrl', resolveAuthReturnPath(callbackPath));
  return `/auth/signin?${params.toString()}`;
}
