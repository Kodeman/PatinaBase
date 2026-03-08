import { NextRequest } from 'next/server';
import {
  createRouteHandler,
  proxyToBackend,
} from '@patina/api-routes';
import { apiError } from '@patina/api-routes';

const CATALOG_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:3011';

// GET /api/catalog/categories/:id
export const GET = createRouteHandler(
  async (request: NextRequest, context: any) => {
    try {
      const id = context.custom?.params?.id;
      return await proxyToBackend(request, context, {
        service: {
          name: 'catalog',
          baseUrl: CATALOG_URL,
          path: `/v1/categories/${id}`,
        },
        requireAuth: false,
        retry: { maxRetries: 3 },
        timeout: { read: 5000 },
        cache: { maxAge: 300, staleWhileRevalidate: 60 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);
