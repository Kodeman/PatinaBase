import type { UserDetail, UserRoleName } from '@patina/types';
import { randomUUID } from 'crypto';

// Symbol for storing auth token in context (prevents accidental access)
const AUTH_TOKEN_KEY = Symbol('authToken');

/**
 * Request context passed through middleware chain
 * Contains request metadata, authenticated user info, and validated data
 */
export interface RouteContext {
  /** Unique request identifier for tracing */
  requestId: string;

  /** Client IP address */
  ip: string;

  /** User agent string */
  userAgent?: string;

  /** Authenticated user information (if authenticated) */
  user?: RouteUser;

  /** Validated request data from middleware */
  validatedData: {
    /** Validated request body */
    body?: unknown;
    /** Validated query parameters */
    query?: unknown;
    /** Validated URL parameters */
    params?: unknown;
  };

  /** Request start timestamp for duration tracking */
  startTime: number;

  /** Additional custom context data */
  custom?: Record<string, unknown>;
}

/**
 * Simplified user information available in route context
 * Subset of UserDetail for security and performance
 */
export interface RouteUser {
  /** User ID */
  id: string;

  /** User email */
  email?: string;

  /** Display name */
  displayName?: string;

  /** User roles */
  roles: UserRoleName[];

  /** Account status */
  status: string;

  /** Whether email is verified */
  emailVerified: boolean;
}

/**
 * Create initial route context from request
 */
export function createContext(request: Request): RouteContext {
  const requestId = generateRequestId();
  const ip = extractIpAddress(request);
  const userAgent = request.headers.get('user-agent') || undefined;

  return {
    requestId,
    ip,
    userAgent,
    validatedData: {},
    startTime: Date.now(),
  };
}

/**
 * Add user to context
 */
export function setUser(context: RouteContext, user: UserDetail): RouteContext {
  return {
    ...context,
    user: {
      id: user.id,
      email: user.email,
      displayName: user.profile?.displayName,
      roles: user.roles?.map((r) => r.name as UserRoleName) || [],
      status: user.status,
      emailVerified: user.emailVerified,
    },
  };
}

/**
 * Store auth token in context for backend proxy
 * Token is stored separately from user info for security
 */
export function setAuthToken(context: RouteContext, token: string): RouteContext {
  return { ...context, [AUTH_TOKEN_KEY]: token };
}

/**
 * Retrieve auth token from context
 * Used by proxyToBackend to forward Authorization header to backend services
 */
export function getAuthToken(context: RouteContext): string | undefined {
  return (context as any)[AUTH_TOKEN_KEY];
}

/**
 * Add validated body to context
 */
export function setValidatedBody<T>(context: RouteContext, body: T): RouteContext {
  return {
    ...context,
    validatedData: {
      ...context.validatedData,
      body,
    },
  };
}

/**
 * Add validated query to context
 */
export function setValidatedQuery<T>(context: RouteContext, query: T): RouteContext {
  return {
    ...context,
    validatedData: {
      ...context.validatedData,
      query,
    },
  };
}

/**
 * Add validated params to context
 */
export function setValidatedParams<T>(context: RouteContext, params: T): RouteContext {
  return {
    ...context,
    validatedData: {
      ...context.validatedData,
      params,
    },
  };
}

/**
 * Set custom context data
 */
export function setCustom(
  context: RouteContext,
  key: string,
  value: unknown
): RouteContext {
  return {
    ...context,
    custom: {
      ...context.custom,
      [key]: value,
    },
  };
}

/**
 * Check if user has a specific role
 */
export function hasRole(context: RouteContext, role: UserRoleName): boolean {
  return context.user?.roles.includes(role) ?? false;
}

/**
 * Check if user has any of the specified roles
 */
export function hasAnyRole(context: RouteContext, roles: UserRoleName[]): boolean {
  return roles.some((role) => hasRole(context, role));
}

/**
 * Check if user has all of the specified roles
 */
export function hasAllRoles(context: RouteContext, roles: UserRoleName[]): boolean {
  return roles.every((role) => hasRole(context, role));
}

/**
 * Get request duration in milliseconds
 */
export function getRequestDuration(context: RouteContext): number {
  return Date.now() - context.startTime;
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return randomUUID();
}

/**
 * Extract IP address from request
 * Handles various proxy headers
 */
function extractIpAddress(request: Request): string {
  // Check X-Forwarded-For header (load balancers, proxies)
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map((ip) => ip.trim());
    return ips[0]; // Return first IP (client)
  }

  // Check X-Real-IP header
  const realIp = request.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Check CF-Connecting-IP (Cloudflare)
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) {
    return cfIp;
  }

  // Fallback to '0.0.0.0' (unknown)
  return '0.0.0.0';
}
