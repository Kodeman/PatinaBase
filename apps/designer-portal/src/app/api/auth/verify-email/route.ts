import { z } from 'zod';
import { createRouteHandler, compose, proxyToBackend, withValidation, type RouteContext } from '@patina/api-routes';
import { apiError, apiValidationError } from '@patina/api-routes';

/**
 * Email verification API route handler
 * Handles email verification token validation
 */

const verifySchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

const USER_MANAGEMENT_URL = process.env.NEXT_PUBLIC_USER_MANAGEMENT_API_URL || 'http://localhost:3010/v1';

/**
 * Verify email with token
 */
export const POST = createRouteHandler(
  compose(
    withValidation({ body: verifySchema }),
    async (request: Request, context: RouteContext) => {
      try {
        return await proxyToBackend(request, context, {
          service: {
            name: 'user-management',
            baseUrl: USER_MANAGEMENT_URL,
            path: '/auth/verify-email',
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
  { method: 'POST' }
);

/**
 * Resend verification email
 */
export const GET = createRouteHandler(
  async (request: Request, context: RouteContext) => {
    try {
      const { searchParams } = new URL(request.url);
      const email = searchParams.get('email');

      if (!email) {
        return apiValidationError('Email is required', {
          query: { email: ['Email is required'] },
        });
      }

      // Create a POST request to the backend with the email in the body
      const modifiedRequest = new Request(request, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });

      return await proxyToBackend(modifiedRequest, context, {
        service: {
          name: 'user-management',
          baseUrl: USER_MANAGEMENT_URL,
          path: '/auth/resend-verification',
        },
        requireAuth: false,
        retry: { maxRetries: 1 },
        timeout: { write: 10000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);
