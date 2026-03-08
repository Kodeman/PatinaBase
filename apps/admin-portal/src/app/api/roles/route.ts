import { NextRequest } from 'next/server';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';

const USER_MANAGEMENT_URL = process.env.USER_MANAGEMENT_SERVICE_URL || 'http://localhost:3010';

// GET /api/roles - List roles
export const GET = createRouteHandler(
  async (request: NextRequest, context: any) => {
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'user-management',
          baseUrl: USER_MANAGEMENT_URL,
          path: '/api/v1/roles',
        },
        requireAuth: true,
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
        cache: { maxAge: 300 }, // 5 min cache for roles
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);

// POST /api/roles - Create role
export const POST = createRouteHandler(
  async (request: NextRequest, context: any) => {
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'user-management',
          baseUrl: USER_MANAGEMENT_URL,
          path: '/api/v1/roles',
        },
        requireAuth: true,
        retry: { maxRetries: 2 },
        timeout: { write: 10000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'POST' }
);
