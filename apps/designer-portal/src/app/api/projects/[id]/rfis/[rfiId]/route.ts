import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import {
  createRouteHandler,
  proxyToBackend
} from '@patina/api-routes';
import { apiError } from '@patina/api-routes';

const PROJECTS_URL = process.env.PROJECTS_SERVICE_URL || 'http://localhost:3016';

// GET /api/projects/:id/rfis/:rfiId - Get RFI details
export const GET = createRouteHandler(
  async (request: NextRequest, context) => {
    try {
      const params = context.custom?.params;
      const projectId = params?.id;
      const rfiId = params?.rfiId;
      return await proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${projectId}/rfis/${rfiId}`,
        },
        requireAuth: true,
        retry: { maxRetries: 3 },
        timeout: { read: 5000 },
        cache: { maxAge: 60, staleWhileRevalidate: 30 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);

// PATCH /api/projects/:id/rfis/:rfiId - Update RFI
export const PATCH = createRouteHandler(
  async (request: NextRequest, context) => {
    try {
      const params = context.custom?.params;
      const projectId = params?.id;
      const rfiId = params?.rfiId;
      return await proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${projectId}/rfis/${rfiId}`,
        },
        requireAuth: true,
        retry: { maxRetries: 2 },
        timeout: { write: 20000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'PATCH' }
);
