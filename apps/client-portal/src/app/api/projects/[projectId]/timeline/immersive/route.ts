import { NextRequest } from 'next/server';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';

const PROJECTS_URL = process.env.PROJECTS_SERVICE_URL || 'http://localhost:3016';

// GET /api/projects/:projectId/timeline/immersive - Get immersive timeline view
export const GET = createRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ projectId: string }> }) => {
    try {
      const { projectId } = await context.params;
      return await proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${projectId}/timeline/immersive`,
        },
        requireAuth: true,
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
        cache: { maxAge: 30, staleWhileRevalidate: 60 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);
