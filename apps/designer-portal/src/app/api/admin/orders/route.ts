import { NextRequest } from 'next/server';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';

const ORDERS_URL = process.env.ORDERS_SERVICE_URL || 'http://localhost:3015';

// GET /api/admin/orders - List orders
export const GET = createRouteHandler(
  async (request: NextRequest, context: any) => {
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: '/v1/orders',
        },
        requireAuth: true,
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
        cache: { maxAge: 30 }, // Short cache for orders
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);
