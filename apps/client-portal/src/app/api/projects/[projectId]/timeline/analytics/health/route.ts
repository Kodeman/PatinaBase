import { NextRequest } from 'next/server';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';

const PROJECTS_URL = process.env.PROJECTS_SERVICE_URL || 'http://localhost:3016';

// GET /api/projects/:projectId/timeline/analytics/health - Get project health indicators
export const GET = createRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ projectId: string }> }) => {
    try {
      const { projectId } = await context.params;
      return await proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${projectId}/timeline/analytics/health`,
        },
        requireAuth: true,
        retry: { maxRetries: 3 },
        timeout: { read: 15000 },
        cache: { maxAge: 60, staleWhileRevalidate: 120 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);
