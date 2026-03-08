import { z } from 'zod';
import { createRouteHandler, compose, proxyToBackend, withValidation, type RouteContext } from '@patina/api-routes';
import { apiError, apiSuccess } from '@patina/api-routes';

/**
 * Password reset API route handlers
 */

const requestResetSchema = z.object({
  email: z.string().email('Invalid email address'),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character'),
});

const USER_MANAGEMENT_URL = process.env.NEXT_PUBLIC_USER_MANAGEMENT_API_URL || 'http://localhost:3010/v1';

/**
 * Request password reset - sends reset email
 */
export const POST = createRouteHandler(
  compose(
    withValidation({ body: requestResetSchema }),
    async (request: Request, context: RouteContext) => {
      try {
        // Guard against build-time execution
        if (!context || !context.requestId) {
          console.warn('Skipping password reset during build-time');
          return apiSuccess({
            success: true,
            message: 'If the email exists, a password reset link has been sent.',
          });
        }

        // Call backend but always return success to prevent email enumeration
        await proxyToBackend(request, context, {
          service: {
            name: 'user-management',
            baseUrl: USER_MANAGEMENT_URL,
            path: '/auth/request-password-reset',
          },
          requireAuth: false,
          retry: { maxRetries: 1 },
          timeout: { write: 10000 },
        }).catch((error) => {
          console.error('Request password reset error:', error);
          // Don't throw - we want to return success regardless
        });

        // Always return success to prevent email enumeration
        return apiSuccess({
          success: true,
          message: 'If the email exists, a password reset link has been sent.',
        });
      } catch (error) {
        // Don't reveal error details to prevent email enumeration
        return apiSuccess({
          success: true,
          message: 'If the email exists, a password reset link has been sent.',
        });
      }
    }
  ),
  { method: 'POST' }
);

/**
 * Reset password with token
 */
export const PATCH = createRouteHandler(
  compose(
    withValidation({ body: resetPasswordSchema }),
    async (request: Request, context: RouteContext) => {
      try {
        return await proxyToBackend(request, context, {
          service: {
            name: 'user-management',
            baseUrl: USER_MANAGEMENT_URL,
            path: '/auth/reset-password',
          },
          requireAuth: false,
          retry: { maxRetries: 2 },
          timeout: { write: 10000 },
        });
      } catch (error) {
        return apiError(error);
      }
    }
  ),
  { method: 'PATCH' }
);
