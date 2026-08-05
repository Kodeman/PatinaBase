/** Stable categories that portal UIs may branch on without inspecting SDK text. */
export type AuthFailureKind =
  | 'invalid_code'
  | 'invalid_recovery'
  | 'invalid_credentials'
  | 'oauth'
  | 'qr'
  | 'network'
  | 'rate_limit'
  | 'service'
  | 'weak_password'
  | 'same_password'
  | 'access_denied'
  | 'timeout'
  | 'session'
  | 'cancelled'
  | 'unknown';

export interface AuthFailure {
  kind: AuthFailureKind;
  message: string;
  retryable: boolean;
}
const FAILURE_MESSAGES: Record<AuthFailureKind, string> = {
  invalid_code:
    'That code has expired or isn\'t correct. Request a new code and try again.',
  invalid_recovery:
    'That password-reset link has expired or was already used. Request a new link and try again.',
  invalid_credentials:
    'That email and password don\'t match. Try again, or use a code by email.',
  oauth: 'That sign-in didn\'t finish. Try again, or use a code by email.',
  qr: 'We couldn\'t make a QR code. Refresh it, or use a code by email.',
  network:
    'We couldn\'t reach Patina just now. Check your connection and try again.',
  rate_limit:
    'Too many attempts were made just now. Wait a minute, then try again.',
  service:
    'Patina’s sign-in service is temporarily unavailable. Please try again shortly.',
  weak_password:
    'That password does not meet the security requirements. Try a longer, more varied password.',
  same_password:
    'Choose a password you have not used for this account before.',
  access_denied:
    'This account does not have access to this portal. Try another account or contact Patina.',
  timeout: 'Sign-in took longer than expected. Please try again.',
  session: 'We couldn\'t finish opening your Patina session. Please try again.',
  cancelled: 'Sign-in was cancelled. Please try again when you are ready.',
  unknown: 'We couldn\'t sign you in just now. Please try again.',
};

function errorText(error: unknown): string {
  if (!error) return '';
  if (typeof error === 'string') return error.toLowerCase();
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    return [record.code, record.name, record.message, record.error_description]
      .filter((value): value is string => typeof value === 'string')
      .join(' ')
      .toLowerCase();
  }
  return '';
}

function failure(kind: AuthFailureKind): AuthFailure {
  return {
    kind,
    message: FAILURE_MESSAGES[kind],
    retryable: !['access_denied', 'cancelled'].includes(kind),
  };
}

/**
 * Convert provider/GoTrue/network errors into copy that is safe to render.
 * The original message is intentionally never returned.
 */
export function normalizeAuthError(
  error: unknown,
  fallback: AuthFailureKind = 'unknown',
): AuthFailure {
  if (error instanceof AuthFlowError) return error.failure;

  const text = errorText(error);
  const status =
    error && typeof error === 'object'
      ? Number((error as Record<string, unknown>).status)
      : Number.NaN;

  if (
    text.includes('aborterror') ||
    text.includes('aborted') ||
    text.includes('cancelled') ||
    text.includes('canceled')
  ) {
    return failure('cancelled');
  }
  if (text.includes('timeout') || text.includes('timed out')) {
    return failure('timeout');
  }
  if (
    status === 429 ||
    text.includes('rate limit') ||
    text.includes('rate_limit') ||
    text.includes('too many requests')
  ) {
    return failure('rate_limit');
  }
  if (
    text.includes('same_password') ||
    text.includes('password should be different') ||
    text.includes('new password must be different')
  ) {
    return failure('same_password');
  }
  if (
    text.includes('weak_password') ||
    text.includes('password should be') ||
    text.includes('password must contain')
  ) {
    return failure('weak_password');
  }
  if (
    text.includes('invalid login credentials') ||
    text.includes('invalid_credentials') ||
    text.includes('invalid password')
  ) {
    return failure('invalid_credentials');
  }
  if (
    text.includes('otp_expired') ||
    text.includes('token has expired') ||
    text.includes('token expired') ||
    text.includes('invalid token') ||
    text.includes('invalid otp') ||
    text.includes('token is invalid')
  ) {
    return failure(
      fallback === 'invalid_recovery' ? 'invalid_recovery' : 'invalid_code',
    );
  }
  if (
    text.includes('access_denied') ||
    text.includes('not authorized') ||
    text.includes('not permitted') ||
    text.includes('forbidden')
  ) {
    return failure('access_denied');
  }
  if (
    text.includes('failed to fetch') ||
    text.includes('fetch failed') ||
    text.includes('networkerror') ||
    text.includes('network request') ||
    text.includes('econnrefused') ||
    text.includes('load failed')
  ) {
    return failure('network');
  }
  if (
    status >= 500 ||
    text.includes('provider is not enabled') ||
    text.includes('email provider') ||
    text.includes('configuration error')
  ) {
    return failure('service');
  }

  return failure(fallback);
}

/** Map stable OAuth callback query/fragment codes without rendering provider text. */
export function normalizeOAuthCallbackError(
  error: string | null | undefined,
): AuthFailure | null {
  if (!error) return null;
  const code = error.toLowerCase();
  if (
    code === 'access_denied' ||
    code === 'cancelled' ||
    code === 'canceled' ||
    code === 'user_cancelled_authorize'
  ) {
    return failure('cancelled');
  }
  return failure('oauth');
}

/** An Error safe for React Query to expose to presentation code. */
export class AuthFlowError extends Error {
  readonly failure: AuthFailure;

  constructor(error: unknown, fallback: AuthFailureKind = 'unknown') {
    const normalized = normalizeAuthError(error, fallback);
    super(normalized.message);
    this.name = 'AuthFlowError';
    this.failure = normalized;
  }
}
