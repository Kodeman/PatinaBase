import { NextRequest } from 'next/server';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';

const CATALOG_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:3011';

// GET /api/admin/catalog/categories - List categories
export const GET = createRouteHandler(
  async (request: NextRequest, context: any) => {
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'catalog',
          baseUrl: CATALOG_URL,
          path: '/v1/categories',
        },
        requireAuth: true,
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
        cache: { maxAge: 300 }, // 5 min cache for categories
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);

// POST /api/admin/catalog/categories - Create category
export const POST = createRouteHandler(
  async (request: NextRequest, context: any) => {
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'catalog',
          baseUrl: CATALOG_URL,
          path: '/v1/categories',
        },
        requireAuth: true,
        retry: { maxRetries: 2 },
        timeout: { write: 10000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'POST' }
);
