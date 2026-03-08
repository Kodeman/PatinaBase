import { NextRequest } from 'next/server';
import {
  createRouteHandler,
  proxyToBackend
} from '@patina/api-routes';

import { apiError, type RouteContext } from '@patina/api-routes';

const ORDERS_URL = process.env.ORDERS_SERVICE_URL || 'http://localhost:3015';

// GET /api/orders - List orders for current user
export const GET = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: '/api/v1/orders',
        },
        requireAuth: true, // Always require auth for orders
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
        cache: { maxAge: 30, staleWhileRevalidate: 15 }, // Short cache (30s)
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);

// POST /api/orders - Create order from cart
export const POST = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: '/api/v1/orders',
        },
        requireAuth: true,
        retry: { maxRetries: 1 }, // Don't retry order creation (idempotency issues)
        timeout: { write: 30000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'POST' }
);
