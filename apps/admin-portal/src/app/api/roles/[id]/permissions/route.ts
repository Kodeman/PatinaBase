import { NextRequest } from 'next/server';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';

const USER_MANAGEMENT_URL = process.env.USER_MANAGEMENT_SERVICE_URL || 'http://localhost:3010';

// GET /api/roles/[id]/permissions - Get role permissions
export const GET = createRouteHandler(
  async (request: NextRequest, context: any) => {
    const { id } = await context.params;
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'user-management',
          baseUrl: USER_MANAGEMENT_URL,
          path: `/api/v1/roles/${id}/permissions`,
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

// PUT /api/roles/[id]/permissions - Set role permissions
export const PUT = createRouteHandler(
  async (request: NextRequest, context: any) => {
    const { id } = await context.params;
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'user-management',
          baseUrl: USER_MANAGEMENT_URL,
          path: `/api/v1/roles/${id}/permissions`,
        },
        requireAuth: true,
        retry: { maxRetries: 2 },
        timeout: { write: 10000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'PUT' }
);

// POST /api/roles/[id]/permissions - Add permissions to role
export const POST = createRouteHandler(
  async (request: NextRequest, context: any) => {
    const { id } = await context.params;
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'user-management',
          baseUrl: USER_MANAGEMENT_URL,
          path: `/api/v1/roles/${id}/permissions`,
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

// DELETE /api/roles/[id]/permissions - Remove permissions from role
export const DELETE = createRouteHandler(
  async (request: NextRequest, context: any) => {
    const { id } = await context.params;
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'user-management',
          baseUrl: USER_MANAGEMENT_URL,
          path: `/api/v1/roles/${id}/permissions`,
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
