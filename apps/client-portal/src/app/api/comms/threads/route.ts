import { NextRequest } from 'next/server';
import {
  createRouteHandler,
  proxyToBackend,
  apiError
} from '@patina/api-routes';

const COMMS_URL = process.env.COMMS_SERVICE_URL || 'http://localhost:3017';

// GET /api/comms/threads - List threads for current user
export const GET = createRouteHandler(
  async (request: NextRequest, context) => {
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'comms',
          baseUrl: COMMS_URL,
          path: '/api/v1/threads',
        },
        requireAuth: true, // Always require auth for messaging
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
        cache: { maxAge: 30, staleWhileRevalidate: 15 }, // Very short cache (30s)
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);

// POST /api/comms/threads - Create new thread
export const POST = createRouteHandler(
  async (request: NextRequest, context) => {
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'comms',
          baseUrl: COMMS_URL,
          path: '/api/v1/threads',
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
