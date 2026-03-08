import { NextRequest } from 'next/server';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';

const PROJECTS_URL = process.env.PROJECTS_SERVICE_URL || 'http://localhost:3016';

// POST /api/projects/:projectId/timeline/segment/:segmentId/media/opened - Record media gallery open
export const POST = createRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ projectId: string; segmentId: string }> }) => {
    try {
      const { projectId, segmentId } = await context.params;
      return await proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${projectId}/timeline/segment/${segmentId}/media/opened`,
        },
        requireAuth: true,
        retry: { maxRetries: 1 }, // Single attempt for analytics events
        timeout: { write: 5000 },
        cache: { noCache: true },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'POST' }
);
