import { NextRequest } from 'next/server';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';

const PROJECTS_URL = process.env.PROJECTS_SERVICE_URL || 'http://localhost:3016';

// POST /api/projects/:projectId/timeline/analytics/view - Record timeline view
export const POST = createRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ projectId: string }> }) => {
    try {
      const { projectId } = await context.params;
      return await proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${projectId}/timeline/analytics/view`,
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
