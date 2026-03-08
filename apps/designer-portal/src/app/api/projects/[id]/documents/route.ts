import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import {
  createRouteHandler,
  proxyToBackend
} from '@patina/api-routes';
import { apiError } from '@patina/api-routes';

const PROJECTS_URL = process.env.PROJECTS_SERVICE_URL || 'http://localhost:3016';

// GET /api/projects/:id/documents - List documents for project
export const GET = createRouteHandler(
  async (request: NextRequest, context) => {
    try {
      const projectId = context.custom?.params?.id;
      return await proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${projectId}/documents`,
        },
        requireAuth: true,
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
        cache: { maxAge: 60, staleWhileRevalidate: 30 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);

// POST /api/projects/:id/documents - Upload document
// Note: File uploads may require special handling in the backend
export const POST = createRouteHandler(
  async (request: NextRequest, context) => {
    try {
      const projectId = context.custom?.params?.id;
      return await proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${projectId}/documents`,
        },
        requireAuth: true,
        retry: { maxRetries: 2 },
        timeout: { write: 60000 }, // Longer timeout for file uploads
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'POST' }
);
