import { NextRequest } from 'next/server';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';

const USER_MANAGEMENT_URL = process.env.USER_MANAGEMENT_SERVICE_URL || 'http://localhost:3010';

// GET /api/admin/users/me - Get current admin user
export const GET = createRouteHandler(
  async (request: NextRequest, context: any) => {
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'user-management',
          baseUrl: USER_MANAGEMENT_URL,
          path: '/api/v1/me',
        },
        requireAuth: true,
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
        cache: { maxAge: 60 }, // Short cache for current user
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);
