import { NextRequest } from 'next/server';
import {
  createRouteHandler,
  proxyToBackend,
  apiError,
  type RouteContext,
} from '@patina/api-routes';

const ORDERS_URL = process.env.ORDERS_SERVICE_URL || 'http://localhost:3015';

// GET /api/orders/:id - Get order details (proxy to orders service)
export const GET = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    try {
      const orderId = context.custom?.params?.id;
      return await proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: `/v1/orders/${orderId}`,
        },
        requireAuth: true,
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
        cache: { ttl: 30 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);
