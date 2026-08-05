export interface AuthCallbackFragment {
  /** Present (including as an empty string) only for a recovery token fragment. */
  recoveryTokenHash?: string;
  isRecovery: boolean;
  /** Legacy implicit recovery tokens must remain until supabase-js parses them. */
  legacyRecovery: boolean;
  /** A stable provider code only. Provider descriptions are never returned. */
  oauthError: string | null;
}

interface CallbackLocation {
  hash: string;
  pathname: string;
  search: string;
}

interface CallbackHistory {
  readonly state: unknown;
  replaceState(data: unknown, unused: string, url?: string | URL | null): void;
}

/**
 * Read sensitive auth callback values from the URL fragment and remove them
 * from browser history before they can be copied, logged, or retained.
 *
 * Successful OAuth fragments are deliberately left alone: supabase-js still
 * needs to consume their access tokens. Recovery tokens and provider failures
 * are consumed here because the portal handles those flows explicitly.
 */
export function consumeAuthCallbackFragment(
  location: CallbackLocation = window.location,
  history: CallbackHistory = window.history,
): AuthCallbackFragment {
  const rawFragment = location.hash.startsWith('#')
    ? location.hash.slice(1)
    : location.hash;
  const params = new URLSearchParams(rawFragment);
  const hasTokenHash = params.has('token_hash');
  const legacyRecovery =
    !hasTokenHash &&
    params.get('type')?.toLowerCase() === 'recovery' &&
    params.has('access_token') &&
    params.has('refresh_token');
  // A token_hash is sensitive even when a malformed link omitted its type.
  // Treat it as recovery so it is scrubbed and can only fail closed in verifyOtp.
  const isRecovery =
    params.get('type')?.toLowerCase() === 'recovery' || hasTokenHash;
  const oauthError =
    params.get('error') ??
    params.get('error_code') ??
    (params.has('error_description') ? 'oauth_error' : null);

  if ((isRecovery && !legacyRecovery) || oauthError) {
    history.replaceState(
      history.state,
      '',
      `${location.pathname}${location.search}`,
    );
  }

  return {
    ...(isRecovery && !legacyRecovery
      ? { recoveryTokenHash: params.get('token_hash') ?? '' }
      : {}),
    isRecovery,
    legacyRecovery,
    oauthError,
  };
}
