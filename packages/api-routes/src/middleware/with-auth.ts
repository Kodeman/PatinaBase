import type { UserDetail } from '@patina/types';
import type { RouteContext } from '../utils/request-context';
import { setUser, setAuthToken } from '../utils/request-context';
import { apiUnauthorized } from '../utils/response-wrapper';
import { logAuthFailure } from '../utils/logger';
import type { RouteHandler } from './with-validation';

/**
 * Authentication options
 */
export interface AuthOptions {
  /** Whether authentication is required (default: true) */
  required?: boolean;
  /** Custom unauthorized message */
  message?: string;
}

/**
 * Auth function type — returns session with user data and optional access token.
 * This is the `auth()` function exported from each portal's auth module.
 */
export type NextAuthFn = () => Promise<{
  user: {
    id: string;
    email: string;
    name?: string | null;
    image?: string | null;
    role?: string;
    roles?: string[];
    permissions?: string[];
  };
  accessToken?: string;
  error?: string;
} | null>;

/**
 * Authentication middleware
 * Validates user session using Supabase Auth and adds user to context.
 *
 * @example
 * ```ts
 * import { auth } from '@/lib/auth';
 *
 * const handler = withAuth(auth)(async (request, context) => {
 *   // context.user is now available
 *   return apiSuccess({ userId: context.user!.id });
 * });
 * ```
 */
export function withAuth(authFn: NextAuthFn, options: AuthOptions = {}) {
  const { required = true, message } = options;

  return function authMiddleware(next: RouteHandler): RouteHandler {
    return async (request: Request, context: RouteContext): Promise<Response> => {
      try {
        const session = await authFn();

        if (!session || !session.user) {
          if (required) {
            logAuthFailure(context, 'No session found');
            return apiUnauthorized(message || 'Authentication required');
          }
          return next(request, context);
        }

        if (session.error) {
          if (required) {
            logAuthFailure(context, `Session error: ${session.error}`);
            return apiUnauthorized('Session is invalid or expired');
          }
          return next(request, context);
        }

        const user = convertSessionUser(session.user);

        let updatedContext = setUser(context, user);

        // Forward Supabase access token for backend proxy
        if (session.accessToken) {
          updatedContext = setAuthToken(updatedContext, session.accessToken);
        }

        return next(request, updatedContext);
      } catch (error) {
        console.error('[withAuth] Authentication error:', error);

        if (required) {
          logAuthFailure(context, 'Authentication failed');
          return apiUnauthorized('Authentication failed');
        }

        return next(request, context);
      }
    };
  };
}

/**
 * Convert session user to UserDetail format
 */
function convertSessionUser(sessionUser: any): UserDetail {
  const roles = Array.isArray(sessionUser.roles)
    ? sessionUser.roles.map((r: any) => ({
        name: typeof r === 'string' ? r : r.name,
        description: typeof r === 'object' ? r.description : undefined,
      }))
    : [];

  return {
    id: sessionUser.id,
    email: sessionUser.email,
    emailVerified: sessionUser.emailVerified ?? true,
    status: sessionUser.status || 'ACTIVE',
    createdAt: sessionUser.createdAt ? new Date(sessionUser.createdAt) : new Date(),
    updatedAt: sessionUser.updatedAt ? new Date(sessionUser.updatedAt) : new Date(),
    profile: {
      id: sessionUser.id,
      userId: sessionUser.id,
      displayName: sessionUser.name,
      avatarUrl: sessionUser.image,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    roles,
  };
}

/**
 * Helper to create optional auth middleware
 */
export function withOptionalAuth(authFn: NextAuthFn) {
  return withAuth(authFn, { required: false });
}
