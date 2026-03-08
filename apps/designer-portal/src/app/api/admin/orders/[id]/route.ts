import { NextRequest } from 'next/server';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';

const ORDERS_URL = process.env.ORDERS_SERVICE_URL || 'http://localhost:3015';

// GET /api/admin/orders/[id] - Get single order
export const GET = createRouteHandler(
  async (request: NextRequest, context: any) => {
    const { id } = await context.params;
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: `/v1/orders/${id}`,
        },
        requireAuth: true,
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);

// PATCH /api/admin/orders/[id] - Update order
export const PATCH = createRouteHandler(
  async (request: NextRequest, context: any) => {
    const { id } = await context.params;
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: `/v1/orders/${id}`,
        },
        requireAuth: true,
        retry: { maxRetries: 1 }, // No retry for order updates
        timeout: { write: 10000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'PATCH' }
);
