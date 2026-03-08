import { NextRequest } from 'next/server';
import {
  createRouteHandler,
  proxyToBackend,
} from '@patina/api-routes';
import { apiError } from '@patina/api-routes';

const CATALOG_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:3011';

// GET /api/catalog/categories - List categories
export const GET = createRouteHandler(
  async (request: NextRequest, context: any) => {
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'catalog',
          baseUrl: CATALOG_URL,
          path: '/v1/categories',
        },
        requireAuth: false, // Public listing
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
        cache: { maxAge: 300, staleWhileRevalidate: 60 }, // Cache for 5min
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);
