/** Stable categories that portal UIs may branch on without inspecting SDK text. */
export type AuthFailureKind =
  | 'invalid_code'
  | 'invalid_credentials'
  | 'oauth'
  | 'qr'
  | 'network'
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
  invalid_credentials:
    'That email and password don\'t match. Try again, or use a code by email.',
  oauth: 'Apple sign-in didn\'t finish. Try again, or use a code by email.',
  qr: 'We couldn\'t make a QR code. Refresh it, or use a code by email.',
  network:
    'We couldn\'t reach Patina just now. Check your connection and try again.',
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
    return failure('invalid_code');
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

  return failure(fallback);
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
