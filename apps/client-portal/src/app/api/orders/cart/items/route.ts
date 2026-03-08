import { NextRequest } from 'next/server';
import {
  createRouteHandler,
  proxyToBackend
} from '@patina/api-routes';

import { apiError, type RouteContext } from '@patina/api-routes';

const ORDERS_URL = process.env.ORDERS_SERVICE_URL || 'http://localhost:3015';

// POST /api/orders/cart/items - Add item to cart
export const POST = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: '/api/v1/cart/items',
        },
        requireAuth: true,
        retry: { maxRetries: 2 },
        timeout: { write: 15000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'POST' }
);
