import { NextRequest } from 'next/server';
import {
  createRouteHandler,
  proxyToBackend
} from '@patina/api-routes';

import { apiError, type RouteContext } from '@patina/api-routes';

const ORDERS_URL = process.env.ORDERS_SERVICE_URL || 'http://localhost:3015';

// GET /api/orders/:id - Get order details
export const GET = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    try {
      const orderId = context.custom?.params?.id;
      return await proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: `/api/v1/orders/${orderId}`,
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

// PATCH /api/orders/:id - Update order status (admin only)
export const PATCH = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    try {
      const orderId = context.custom?.params?.id;
      return await proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: `/api/v1/orders/${orderId}`,
        },
        requireAuth: true,
        retry: { maxRetries: 2 },
        timeout: { write: 15000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'PATCH' }
);

// DELETE /api/orders/:id - Cancel order
export const DELETE = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    try {
      const orderId = context.custom?.params?.id;
      return await proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: `/api/v1/orders/${orderId}`,
        },
        requireAuth: true,
        retry: { maxRetries: 1 }, // Don't retry cancellations
        timeout: { delete: 10000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'DELETE' }
);
