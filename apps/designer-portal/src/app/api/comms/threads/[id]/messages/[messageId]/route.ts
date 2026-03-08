import { NextRequest } from 'next/server';
import {
  createRouteHandler,
  proxyToBackend,
  apiError
} from '@patina/api-routes';

const COMMS_URL = process.env.COMMS_SERVICE_URL || 'http://localhost:3017';

// GET /api/comms/threads/:id/messages/:messageId
export const GET = createRouteHandler(
  async (request: NextRequest, context) => {
    try {
      const params = context.custom?.params;
      const threadId = params?.id;
      const messageId = params?.messageId;
      return await proxyToBackend(request, context, {
        service: {
          name: 'comms',
          baseUrl: COMMS_URL,
          path: `/api/v1/threads/${threadId}/messages/${messageId}`,
        },
        requireAuth: true,
        retry: { maxRetries: 3 },
        timeout: { read: 5000 },
        cache: { maxAge: 15 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);

// PATCH /api/comms/threads/:id/messages/:messageId - Edit message
export const PATCH = createRouteHandler(
  async (request: NextRequest, context) => {
    try {
      const params = context.custom?.params;
      const threadId = params?.id;
      const messageId = params?.messageId;
      return await proxyToBackend(request, context, {
        service: {
          name: 'comms',
          baseUrl: COMMS_URL,
          path: `/api/v1/threads/${threadId}/messages/${messageId}`,
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

// DELETE /api/comms/threads/:id/messages/:messageId
export const DELETE = createRouteHandler(
  async (request: NextRequest, context) => {
    try {
      const params = context.custom?.params;
      const threadId = params?.id;
      const messageId = params?.messageId;
      return await proxyToBackend(request, context, {
        service: {
          name: 'comms',
          baseUrl: COMMS_URL,
          path: `/api/v1/threads/${threadId}/messages/${messageId}`,
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
