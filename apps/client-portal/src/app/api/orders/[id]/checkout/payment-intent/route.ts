import { NextRequest } from 'next/server';
import {
  apiError,
  createRouteHandler,
  proxyToBackend,
  type RouteContext,
} from '@patina/api-routes';

const ORDERS_URL = process.env.ORDERS_SERVICE_URL || 'http://localhost:3015';

// POST /api/orders/:id/checkout/payment-intent
// Creates (or retrieves) a Stripe payment intent for this order and returns
// the client_secret the frontend needs to confirm the payment.
export const POST = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: `/api/v1/checkout/payment-intent`,
        },
        requireAuth: true,
        retry: { maxRetries: 1 },
        timeout: { write: 30000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'POST' }
);
