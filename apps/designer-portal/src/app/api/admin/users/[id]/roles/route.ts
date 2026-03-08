import { NextRequest } from 'next/server';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';

const USER_MANAGEMENT_URL = process.env.USER_MANAGEMENT_SERVICE_URL || 'http://localhost:3010';

// POST /api/admin/users/[id]/roles - Assign role to user
export const POST = createRouteHandler(
  async (request: NextRequest, context: any) => {
    const { id } = await context.params;
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'user-management',
          baseUrl: USER_MANAGEMENT_URL,
          path: `/api/v1/users/${id}/roles`,
        },
        requireAuth: true,
        retry: { maxRetries: 1 },
        timeout: { write: 10000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'POST' }
);

// DELETE /api/admin/users/[id]/roles - Remove role from user (via query param)
export const DELETE = createRouteHandler(
  async (request: NextRequest, context: any) => {
    const { id } = await context.params;
    const url = new URL(request.url);
    const roleId = url.searchParams.get('roleId');
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'user-management',
          baseUrl: USER_MANAGEMENT_URL,
          path: `/api/v1/users/${id}/roles/${roleId}`,
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
