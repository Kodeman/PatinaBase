import {
  AuthFlowError,
  buildAuthCallbackUrl,
  buildSignInPath,
  buildVerifyOtpPath,
  safeAuthReturnPath,
} from '@patina/supabase/auth';

export const CLIENT_AUTH_DESTINATION = '/projects';

/** Keep every client auth method on the shared, encoded-open-redirect-safe policy. */
export function resolveAuthReturnPath(raw: string | null | undefined): string {
  return safeAuthReturnPath(raw, CLIENT_AUTH_DESTINATION);
}

/** Recovery callbacks may only open the reset form, never a portal page. */
export function resolveRecoveryPath(raw: string | null | undefined): string {
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
  const resetQuery = new URLSearchParams({
    callbackUrl: resolveAuthReturnPath(destination),
  });
  const callback = new URL(
    buildAuthCallbackUrl(
      origin,
      `/auth/reset-password?${resetQuery.toString()}`,
    ),
  );
  callback.searchParams.set('type', 'recovery');
  return callback.toString();
}

export { buildAuthCallbackUrl, buildSignInPath, buildVerifyOtpPath };

interface SessionReader {
  auth: {
    getSession: () => Promise<{
      data: { session: unknown | null };
      error: unknown | null;
    }>;
  };
}

/** Confirm that Supabase has persisted a browser session before showing success. */
export async function confirmBrowserSession(
  client: SessionReader,
): Promise<void> {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) {
    throw new AuthFlowError(
      error ?? new Error('Session unavailable'),
      'session',
    );
  }
}

interface ReplaceLocation {
  replace(url: string): void;
}

/** Hard navigation avoids a stale App Router auth cache after session mutation. */
export function replaceAuthDestination(
  destination: string | null | undefined,
  location: ReplaceLocation = window.location,
): void {
  location.replace(resolveAuthReturnPath(destination));
}
