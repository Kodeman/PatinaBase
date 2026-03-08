import { NextRequest } from 'next/server';
import {
  createRouteHandler,
  proxyToBackend
} from '@patina/api-routes';

import { apiError, type RouteContext } from '@patina/api-routes';

const ORDERS_URL = process.env.ORDERS_SERVICE_URL || 'http://localhost:3015';

// PATCH /api/orders/cart/items/:itemId - Update quantity
export const PATCH = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    try {
      const itemId = context.custom?.params?.itemId;
      return await proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: `/api/v1/cart/items/${itemId}`,
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

// DELETE /api/orders/cart/items/:itemId - Remove from cart
export const DELETE = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    try {
      const itemId = context.custom?.params?.itemId;
      return await proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: `/api/v1/cart/items/${itemId}`,
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
