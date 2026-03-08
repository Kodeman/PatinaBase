import { NextRequest } from 'next/server';
import {
  createRouteHandler,
  proxyToBackend,
  apiError
} from '@patina/api-routes';

const COMMS_URL = process.env.COMMS_SERVICE_URL || 'http://localhost:3017';

// GET /api/comms/threads/:id/messages
export const GET = createRouteHandler(
  async (request: NextRequest, context) => {
    try {
      const threadId = context.custom?.params?.id;
      return await proxyToBackend(request, context, {
        service: {
          name: 'comms',
          baseUrl: COMMS_URL,
          path: `/api/v1/threads/${threadId}/messages`,
        },
        requireAuth: true,
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
        cache: { maxAge: 15 }, // Very short cache for real-time messages
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);

// POST /api/comms/threads/:id/messages - Send message
export const POST = createRouteHandler(
  async (request: NextRequest, context) => {
    try {
      const threadId = context.custom?.params?.id;
      return await proxyToBackend(request, context, {
        service: {
          name: 'comms',
          baseUrl: COMMS_URL,
          path: `/api/v1/threads/${threadId}/messages`,
        },
        requireAuth: true,
        retry: { maxRetries: 2 },
        timeout: { write: 20000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'POST' }
);
