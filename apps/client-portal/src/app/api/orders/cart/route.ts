import { NextRequest } from 'next/server';
import {
  createRouteHandler,
  proxyToBackend
} from '@patina/api-routes';

import { apiError, type RouteContext } from '@patina/api-routes';

const ORDERS_URL = process.env.ORDERS_SERVICE_URL || 'http://localhost:3015';

// GET /api/orders/cart - Get current user's cart
export const GET = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: '/api/v1/cart',
        },
        requireAuth: true,
        retry: { maxRetries: 3 },
        timeout: { read: 5000 },
        cache: { maxAge: 15 }, // Very short cache for cart (15s)
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);

// DELETE /api/orders/cart - Clear cart
export const DELETE = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: '/api/v1/cart',
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
