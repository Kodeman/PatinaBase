import { NextRequest } from 'next/server';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';

const PROJECTS_URL = process.env.PROJECTS_SERVICE_URL || 'http://localhost:3016';

// GET /api/projects/:projectId/timeline/celebrations - Get recent celebrations
export const GET = createRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ projectId: string }> }) => {
    try {
      const { projectId } = await context.params;
      const url = new URL(request.url);
      const limit = url.searchParams.get('limit') || '5';

      return await proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${projectId}/timeline/celebrations?limit=${limit}`,
        },
        requireAuth: true,
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
        cache: { maxAge: 60, staleWhileRevalidate: 120 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);
