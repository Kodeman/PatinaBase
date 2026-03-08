import { NextRequest } from 'next/server';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';

const PROJECTS_URL = process.env.PROJECTS_SERVICE_URL || 'http://localhost:3016';

// GET /api/projects/:projectId/timeline/segment/:segmentId/media - Get segment media gallery
export const GET = createRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ projectId: string; segmentId: string }> }) => {
    try {
      const { projectId, segmentId } = await context.params;
      return await proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${projectId}/timeline/segment/${segmentId}/media`,
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
