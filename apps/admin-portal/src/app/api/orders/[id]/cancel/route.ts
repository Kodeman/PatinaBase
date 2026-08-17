import { NextRequest } from "next/server";
import {
  createRouteHandler,
  proxyToBackend,
  apiError,
  type RouteContext,
} from "@patina/api-routes";

const ORDERS_URL = process.env.ORDERS_SERVICE_URL || "http://localhost:3015";

// POST /api/orders/[id]/cancel - Cancel order
export const POST = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    const id = context.custom?.params?.id as string;
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: "orders",
          baseUrl: ORDERS_URL,
          path: `/v1/orders/${encodeURIComponent(id)}/cancel`,
        },
        requireAuth: true,
        retry: { maxRetries: 1 }, // No retry for cancellations
        timeout: { write: 10000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: "POST" },
);
