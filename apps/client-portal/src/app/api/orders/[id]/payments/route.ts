import { NextRequest } from 'next/server';
import {
  createRouteHandler,
  proxyToBackend
} from '@patina/api-routes';

import { apiError, type RouteContext } from '@patina/api-routes';

const ORDERS_URL = process.env.ORDERS_SERVICE_URL || 'http://localhost:3015';

// GET /api/orders/:id/payments - List payments for order
export const GET = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    try {
      const orderId = context.custom?.params?.id;
      return await proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: `/api/v1/orders/${orderId}/payments`,
        },
        requireAuth: true,
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
        cache: { maxAge: 60, staleWhileRevalidate: 30 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);

// POST /api/orders/:id/payments - Process payment
// CRITICAL: maxRetries: 1 to prevent double-charging
export const POST = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    try {
      const orderId = context.custom?.params?.id;
      return await proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: `/api/v1/orders/${orderId}/payments`,
        },
        requireAuth: true,
        retry: { maxRetries: 1 }, // NEVER retry payments (double-charge risk)
        timeout: { write: 60000 }, // 60s for payment processing
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'POST' }
);
