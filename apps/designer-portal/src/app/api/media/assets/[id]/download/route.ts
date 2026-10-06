import type { NextRequest } from 'next/server';
import {
  ApiErrorCode,
  apiError,
  createApiError,
  createRouteHandler,
  proxyToBackend,
  type RouteContext,
} from '@patina/api-routes';

const MEDIA_SERVICE_URL = process.env.MEDIA_SERVICE_URL || 'http://localhost:3014';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/media/assets/:id/download — a short-lived signed GET URL for one
 * media asset the caller may read (C-19 receiving photos). Responds
 * `{ success, data: { assetId, downloadUrl, expiresAt } }`.
 */
export const GET = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    const id = context.custom?.params?.id;
    if (typeof id !== 'string' || !UUID_PATTERN.test(id)) {
      return apiError(createApiError(ApiErrorCode.BAD_REQUEST, 'Unknown photo.'), 400);
    }
    return proxyToBackend(request, context, {
      service: { name: 'media', baseUrl: MEDIA_SERVICE_URL, path: `/v1/media/${id}/download` },
      requireAuth: true,
      retry: { maxRetries: 1 },
      timeout: { read: 10_000 },
    });
  },
  { method: 'GET' },
);
