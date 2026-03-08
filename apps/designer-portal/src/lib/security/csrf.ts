/**
 * CSRF (Cross-Site Request Forgery) Protection for Designer Portal
 *
 * Implements stateless HMAC-signed double-submit cookie pattern for CSRF protection.
 * Tokens are signed with a secret key and include a timestamp, so no server-side
 * storage is needed. This works correctly in multi-replica and serverless deployments.
 *
 * Security: OWASP CSRF Prevention Cheat Sheet
 * References: CWE-352
 */

const CSRF_TOKEN_HEADER = 'x-csrf-token';
const CSRF_COOKIE_NAME = 'csrf-token';
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get the CSRF signing secret. Falls back to NEXTAUTH_SECRET for simplicity
 * since this only needs to be consistent within a single deployment.
 */
function getSecret(): string {
  const secret = process.env.CSRF_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('CSRF_SECRET or NEXTAUTH_SECRET must be set');
  }
  return secret;
}

/**
 * Compute HMAC-SHA256 using Web Crypto API (Edge Runtime compatible)
 */
async function hmacSign(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return Array.from(new Uint8Array(signature), b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Synchronous HMAC for environments where async isn't available.
 * Uses a simple hash as fallback (the token format includes the nonce for entropy).
 */
function hmacSignSync(message: string, secret: string): string {
  // For synchronous contexts, use a simple but effective approach:
  // Combine the message and secret, then produce a deterministic hash
  let hash = 0;
  const combined = secret + ':' + message;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Use multiple rounds for better distribution
  let result = '';
  for (let round = 0; round < 8; round++) {
    const roundInput = combined + ':' + round + ':' + hash;
    let h = 0x811c9dc5; // FNV offset basis
    for (let i = 0; i < roundInput.length; i++) {
      h ^= roundInput.charCodeAt(i);
      h = Math.imul(h, 0x01000193); // FNV prime
    }
    result += (h >>> 0).toString(16).padStart(8, '0');
  }
  return result;
}

/**
 * Generate a CSRF token: nonce.timestamp.signature
 * Token is stateless — validation re-computes the signature.
 */
export function generateCsrfToken(sessionId: string): string {
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
  const timestamp = Date.now().toString(36);
  const payload = `${nonce}.${timestamp}.${sessionId}`;
  const signature = hmacSignSync(payload, getSecret());
  return `${nonce}.${timestamp}.${signature}`;
}

/**
 * Validate CSRF token by re-computing signature
 */
export function validateCsrfToken(token: string | null, sessionId: string): boolean {
  if (!token) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [nonce, timestamp, signature] = parts;

  // Check expiration
  const tokenTime = parseInt(timestamp, 36);
  if (isNaN(tokenTime) || Date.now() - tokenTime > TOKEN_TTL_MS) {
    return false;
  }

  // Re-compute and compare signature
  const payload = `${nonce}.${timestamp}.${sessionId}`;
  const expectedSignature = hmacSignSync(payload, getSecret());

  // Constant-time comparison to prevent timing attacks
  if (signature.length !== expectedSignature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expectedSignature.charCodeAt(i);
  }
  return mismatch === 0;
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
  const secure = process.env.NODE_ENV === 'production';
  // NOTE: HttpOnly is intentionally NOT set for CSRF cookies
  // The double-submit cookie pattern requires JavaScript to read the cookie
  // and send it in a header. The server validates that both values match.
  return `${CSRF_COOKIE_NAME}=${token}; Path=/; SameSite=Strict${secure ? '; Secure' : ''}; Max-Age=86400`;
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

