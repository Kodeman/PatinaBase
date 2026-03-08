import { NextRequest } from 'next/server';
import {
  createRouteHandler,
  proxyToBackend,
} from '@patina/api-routes';
import { apiError } from '@patina/api-routes';

const CATALOG_URL = process.env.CATALOG_SERVICE_URL || 'http://localhost:3011';

// GET /api/catalog/products/:id
export const GET = createRouteHandler(
  async (request: NextRequest, context: any) => {
    try {
      const id = context.custom?.params?.id;
      return await proxyToBackend(request, context, {
        service: {
          name: 'catalog',
          baseUrl: CATALOG_URL,
          path: `/v1/products/${id}`,
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

// PATCH /api/catalog/products/:id
export const PATCH = createRouteHandler(
  async (request: NextRequest, context: any) => {
    try {
      const id = context.custom?.params?.id;
      return await proxyToBackend(request, context, {
        service: {
          name: 'catalog',
          baseUrl: CATALOG_URL,
          path: `/v1/products/${id}`,
        },
        requireAuth: true,
        retry: { maxRetries: 2 },
        timeout: { write: 20000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'PATCH' }
);

// DELETE /api/catalog/products/:id
export const DELETE = createRouteHandler(
  async (request: NextRequest, context: any) => {
    try {
      const id = context.custom?.params?.id;
      return await proxyToBackend(request, context, {
        service: {
          name: 'catalog',
          baseUrl: CATALOG_URL,
          path: `/v1/products/${id}`,
        },
        requireAuth: true,
        retry: { maxRetries: 1 },
        timeout: { delete: 10000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'DELETE' }
);
