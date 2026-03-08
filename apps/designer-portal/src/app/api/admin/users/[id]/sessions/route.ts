import { NextRequest } from 'next/server';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';

const USER_MANAGEMENT_URL = process.env.USER_MANAGEMENT_SERVICE_URL || 'http://localhost:3010';

// GET /api/admin/users/[id]/sessions - Get user sessions
export const GET = createRouteHandler(
  async (request: NextRequest, context: any) => {
    const { id } = await context.params;
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'user-management',
          baseUrl: USER_MANAGEMENT_URL,
          path: `/api/v1/users/${id}/sessions`,
        },
        requireAuth: true,
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);

// DELETE /api/admin/users/[id]/sessions - Revoke user sessions
export const DELETE = createRouteHandler(
  async (request: NextRequest, context: any) => {
    const { id } = await context.params;
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'user-management',
          baseUrl: USER_MANAGEMENT_URL,
          path: `/api/v1/users/${id}/sessions/revoke-all`,
        },
        requireAuth: true,
        retry: { maxRetries: 1 },
        timeout: { write: 10000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'DELETE' }
);
