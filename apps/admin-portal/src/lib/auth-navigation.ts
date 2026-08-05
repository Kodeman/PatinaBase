import {
  buildAuthCallbackUrl,
  safeAuthReturnPath,
} from '@patina/supabase/auth';

export const ADMIN_AUTH_FALLBACK = '/dashboard';

export function adminAuthDestination(raw: string | null | undefined): string {
  return safeAuthReturnPath(raw, ADMIN_AUTH_FALLBACK);
}

export function requestDestination(pathname: string, search: string): string {
  return adminAuthDestination(`${pathname}${search}`);
}

export function hardNavigate(destination: string): void {
  window.location.replace(adminAuthDestination(destination));
}

export function recoveryDestination(raw: string | null | undefined): string {
  const destination = safeAuthReturnPath(raw, '/auth/reset-password');
  return destination === '/auth/reset-password' ||
    destination.startsWith('/auth/reset-password?')
    ? destination
    : '/auth/reset-password';
}

export function buildRecoveryCallbackUrl(
  origin: string,
  destination: string | null | undefined,
): string {
  const returnAfterReset = adminAuthDestination(destination);
  const resetParams = new URLSearchParams({ callbackUrl: returnAfterReset });
  const callback = new URL(
    buildAuthCallbackUrl(
      origin,
      `/auth/reset-password?${resetParams.toString()}`,
    ),
  );
  callback.searchParams.set('type', 'recovery');
  return callback.toString();
}
