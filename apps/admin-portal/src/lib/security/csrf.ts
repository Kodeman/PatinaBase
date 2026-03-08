/**
 * CSRF (Cross-Site Request Forgery) Protection
 *
 * Implements double-submit cookie pattern for CSRF protection
 * Used to protect state-changing operations from forged requests
 *
 * Security: OWASP CSRF Prevention Cheat Sheet
 * References: CWE-352
 */

const CSRF_TOKEN_HEADER = 'x-csrf-token';
const CSRF_COOKIE_NAME = 'csrf-token';
const TOKEN_LENGTH = 32;

// In-memory token store (for development - use Redis in production)
const tokenStore = new Map<string, { token: string; expires: number; sessionId: string }>();

/**
 * Generate a cryptographically secure CSRF token
 */
export function generateCsrfToken(sessionId: string): string {
  // Generate random token
  const array = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(array);
  const token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');

  // Store with expiration (24 hours)
  const expires = Date.now() + 24 * 60 * 60 * 1000;
  tokenStore.set(token, { token, expires, sessionId });

  // Clean up expired tokens
  cleanupExpiredTokens();

  return token;
}

/**
 * Validate CSRF token
 */
export function validateCsrfToken(token: string | null, sessionId: string): boolean {
  if (!token) {
    return false;
  }

  const stored = tokenStore.get(token);

  if (!stored) {
    return false;
  }

  // Check expiration
  if (stored.expires < Date.now()) {
    tokenStore.delete(token);
    return false;
  }

  // Verify session matches
  if (stored.sessionId !== sessionId) {
    return false;
  }

  return true;
}

/**
 * Clean up expired tokens (runs periodically)
 */
function cleanupExpiredTokens(): void {
  const now = Date.now();
  // Use Array.from to avoid downlevelIteration requirement
  const entries = Array.from(tokenStore.entries());
  for (const [token, data] of entries) {
    if (data.expires < now) {
      tokenStore.delete(token);
    }
  }
}

/**
 * Get CSRF token from cookie
 */
export function getCsrfTokenFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(';').map(c => c.trim());
  const csrfCookie = cookies.find(c => c.startsWith(`${CSRF_COOKIE_NAME}=`));

  if (!csrfCookie) return null;

  return csrfCookie.split('=')[1];
}

/**
 * Create CSRF token cookie
 */
export function createCsrfCookie(token: string): string {
  return `${CSRF_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=86400`;
}

/**
 * Get CSRF token header name
 */
export function getCsrfHeaderName(): string {
  return CSRF_TOKEN_HEADER;
}

/**
 * Middleware helper to validate CSRF token from request
 */
export function validateCsrfFromRequest(
  headers: Headers,
  sessionId: string
): { valid: boolean; error?: string } {
  // Extract token from header
  const token = headers.get(CSRF_TOKEN_HEADER);

  if (!token) {
    return {
      valid: false,
      error: 'CSRF token missing from request headers'
    };
  }

  // Validate token
  const isValid = validateCsrfToken(token, sessionId);

  if (!isValid) {
    return {
      valid: false,
      error: 'Invalid or expired CSRF token'
    };
  }

  return { valid: true };
}

/**
 * Client-side: Get CSRF token from meta tag or cookie
 */
export function getClientCsrfToken(): string | null {
  // First check meta tag
  if (typeof document !== 'undefined') {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta) {
      return meta.getAttribute('content');
    }

    // Fall back to cookie
    const cookies = document.cookie.split(';').map(c => c.trim());
    const csrfCookie = cookies.find(c => c.startsWith(`${CSRF_COOKIE_NAME}=`));
    if (csrfCookie) {
      return csrfCookie.split('=')[1];
    }
  }

  return null;
}

/**
 * Client-side: Add CSRF token to fetch request
 */
export function addCsrfToRequest(init?: RequestInit): RequestInit {
  const token = getClientCsrfToken();

  if (!token) {
    console.warn('CSRF token not found. State-changing request may fail.');
    return init || {};
  }

  return {
    ...init,
    headers: {
      ...init?.headers,
      [CSRF_TOKEN_HEADER]: token,
    },
  };
}

// Periodic cleanup (every hour)
if (typeof window === 'undefined') {
  setInterval(cleanupExpiredTokens, 60 * 60 * 1000);
}
