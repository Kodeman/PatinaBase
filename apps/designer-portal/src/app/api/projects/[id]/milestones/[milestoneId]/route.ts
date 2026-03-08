import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import {
  createRouteHandler,
  proxyToBackend
} from '@patina/api-routes';
import { apiError } from '@patina/api-routes';

const PROJECTS_URL = process.env.PROJECTS_SERVICE_URL || 'http://localhost:3016';

// GET /api/projects/:id/milestones/:milestoneId - Get milestone details
export const GET = createRouteHandler(
  async (request: NextRequest, context) => {
    try {
      const params = context.custom?.params;
      const projectId = params?.id;
      const milestoneId = params?.milestoneId;
      return await proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${projectId}/milestones/${milestoneId}`,
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

// PATCH /api/projects/:id/milestones/:milestoneId - Update milestone
export const PATCH = createRouteHandler(
  async (request: NextRequest, context) => {
    try {
      const params = context.custom?.params;
      const projectId = params?.id;
      const milestoneId = params?.milestoneId;
      return await proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${projectId}/milestones/${milestoneId}`,
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
