import { z } from 'zod';
import { createRouteHandler, compose, proxyToBackend, withValidation, type RouteContext } from '@patina/api-routes';
import { apiError } from '@patina/api-routes';

/**
 * Token refresh API route handler
 * Handles access token refresh using refresh token
 */

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const USER_MANAGEMENT_URL = process.env.NEXT_PUBLIC_USER_MANAGEMENT_API_URL || 'http://localhost:3010/v1';

export const POST = createRouteHandler(
  compose(
    withValidation({ body: refreshSchema }),
    async (request: Request, context: RouteContext) => {
      try {
        return await proxyToBackend(request, context, {
          service: {
            name: 'user-management',
            baseUrl: USER_MANAGEMENT_URL,
            path: '/auth/refresh',
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
