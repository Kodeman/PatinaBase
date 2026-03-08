import { NextRequest } from 'next/server';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';

const ORDERS_URL = process.env.ORDERS_SERVICE_URL || 'http://localhost:3015';

// POST /api/admin/orders/[id]/shipments - Create shipment
export const POST = createRouteHandler(
  async (request: NextRequest, context: any) => {
    const { id } = await context.params;
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: `/v1/orders/${id}/shipments`,
        },
        requireAuth: true,
        retry: { maxRetries: 2 },
        timeout: { write: 10000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'POST' }
);

// PATCH /api/admin/orders/[id]/shipments - Update shipment
export const PATCH = createRouteHandler(
  async (request: NextRequest, context: any) => {
    const { id } = await context.params;
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'orders',
          baseUrl: ORDERS_URL,
          path: `/v1/orders/${id}/shipments`,
        },
        requireAuth: true,
        retry: { maxRetries: 2 },
        timeout: { write: 10000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'PATCH' }
);
