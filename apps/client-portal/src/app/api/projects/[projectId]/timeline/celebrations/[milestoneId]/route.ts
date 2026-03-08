import { NextRequest } from 'next/server';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';

const PROJECTS_URL = process.env.PROJECTS_SERVICE_URL || 'http://localhost:3016';

// GET /api/projects/:projectId/timeline/celebrations/:milestoneId - Get specific celebration
export const GET = createRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ projectId: string; milestoneId: string }> }) => {
    try {
      const { projectId, milestoneId } = await context.params;
      return await proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${projectId}/timeline/celebrations/${milestoneId}`,
        },
        requireAuth: true,
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
        cache: { maxAge: 300, staleWhileRevalidate: 600 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);

// POST /api/projects/:projectId/timeline/celebrations/:milestoneId/viewed - Record view
export const POST = createRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ projectId: string; milestoneId: string }> }) => {
    try {
      const { projectId, milestoneId } = await context.params;
      return await proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${projectId}/timeline/celebrations/${milestoneId}/viewed`,
        },
        requireAuth: true,
        retry: { maxRetries: 2 },
        timeout: { write: 5000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'POST' }
);
