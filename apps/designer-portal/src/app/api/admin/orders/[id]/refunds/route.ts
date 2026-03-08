import { NextRequest } from 'next/server';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';

const ORDERS_URL = process.env.ORDERS_SERVICE_URL || 'http://localhost:3015';

// POST /api/admin/orders/[id]/refunds - Create refund
export const POST = createRouteHandler(
  async (request: NextRequest, context: any) => {
    const { id } = await context.params;
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: `/v1/orders/${id}/refunds`,
        },
        requireAuth: true,
        retry: { maxRetries: 1 }, // No retry for refunds to prevent duplicates
        timeout: { write: 30000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'POST' }
);
