import { NextRequest } from 'next/server';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';

const MEDIA_URL = process.env.MEDIA_SERVICE_URL || 'http://localhost:3014';

// GET /api/admin/media-assets — proxies to media service /v1/media/search.
// Auth header forwards through; the media service enforces media.asset.read
// via @RequirePermissions on AssetsController.searchAssets.
export const GET = createRouteHandler(
  async (request: NextRequest, context: any) => {
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'media',
          baseUrl: MEDIA_URL,
          path: '/v1/media/search',
        },
        requireAuth: true,
        retry: { maxRetries: 2 },
        timeout: { read: 10000 },
        cache: { maxAge: 30 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' },
);
