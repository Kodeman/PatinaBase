/**
 * Redis-backed CSRF Protection
 *
 * Production-ready CSRF implementation using Redis for token storage
 * Replaces in-memory storage for horizontal scalability
 *
 * Security: OWASP CSRF Prevention Cheat Sheet
 * References: CWE-352
 */

import { Redis } from 'ioredis';

const CSRF_TOKEN_HEADER = 'x-csrf-token';
const CSRF_COOKIE_NAME = 'csrf-token';
const TOKEN_LENGTH = 32;
const TOKEN_TTL = 24 * 60 * 60; // 24 hours in seconds

/**
 * Redis client for CSRF token storage
 * Initialized lazily to avoid connection issues at import time
 */
let redisClient: Redis | null = null;

/**
 * Initialize Redis client for CSRF token storage
 */
function getRedisClient(): Redis {
  if (!redisClient) {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redisClient = new Redis(redisUrl, {
      keyPrefix: 'csrf:',
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    });

    redisClient.on('error', (error) => {
      console.error('[CSRF Redis] Connection error:', error);
    });

    redisClient.on('connect', () => {
      console.log('[CSRF Redis] Connected successfully');
    });
  }

  return redisClient;
}

/**
 * Close Redis connection (for graceful shutdown)
 */
export async function closeCsrfRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

/**
 * Generate a cryptographically secure CSRF token
 */
export async function generateCsrfToken(sessionId: string): Promise<string> {
  // Generate random token
  const array = new Uint8Array(TOKEN_LENGTH);
  crypto.getRandomValues(array);
  const token = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');

  // Store in Redis with TTL
  const redis = getRedisClient();
  await redis.setex(token, TOKEN_TTL, sessionId);

  return token;
}

/**
 * Validate CSRF token against Redis
 */
export async function validateCsrfToken(token: string | null, sessionId: string): Promise<boolean> {
  if (!token) {
    return false;
  }

  const redis = getRedisClient();

  try {
    // Get stored session ID for token
    const storedSessionId = await redis.get(token);

    if (!storedSessionId) {
      return false;
    }

    // Verify session matches
    if (storedSessionId !== sessionId) {
      return false;
    }

    return true;
  } catch (error) {
    console.error('[CSRF Redis] Validation error:', error);
    return false;
  }
}

/**
 * Invalidate a CSRF token (logout, session change)
 */
export async function invalidateCsrfToken(token: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(token);
}

/**
 * Clean up expired tokens for a session (optional - Redis TTL handles this)
 */
export async function invalidateSessionTokens(sessionId: string): Promise<void> {
  const redis = getRedisClient();

  // Find all tokens for this session (requires scanning)
  const stream = redis.scanStream({
    match: '*',
    count: 100,
  });

  const tokensToDelete: string[] = [];

  stream.on('data', async (keys: string[]) => {
    for (const key of keys) {
      const storedSessionId = await redis.get(key);
      if (storedSessionId === sessionId) {
        tokensToDelete.push(key);
      }
    }
  });

  stream.on('end', async () => {
    if (tokensToDelete.length > 0) {
      await redis.del(...tokensToDelete);
    }
  });
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
  return `${CSRF_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}; Max-Age=${TOKEN_TTL}`;
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
export async function validateCsrfFromRequest(
  headers: Headers,
  sessionId: string
): Promise<{ valid: boolean; error?: string }> {
  // Extract token from header
  const token = headers.get(CSRF_TOKEN_HEADER);

  if (!token) {
    return {
      valid: false,
      error: 'CSRF token missing from request headers'
    };
  }

  // Validate token
  const isValid = await validateCsrfToken(token, sessionId);

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

/**
 * Health check for Redis connection
 */
export async function csrfRedisHealthCheck(): Promise<boolean> {
  try {
    const redis = getRedisClient();
    await redis.ping();
    return true;
  } catch (error) {
    console.error('[CSRF Redis] Health check failed:', error);
    return false;
  }
}
