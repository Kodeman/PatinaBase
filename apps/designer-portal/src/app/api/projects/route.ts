import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import {
  createRouteHandler,
  proxyToBackend
} from '@patina/api-routes';
import { apiError } from '@patina/api-routes';

const PROJECTS_URL = process.env.PROJECTS_SERVICE_URL || 'http://localhost:3016';

// GET /api/projects - List projects
export const GET = createRouteHandler(
  async (request: NextRequest, context) => {
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: '/api/v1/projects',
        },
        requireAuth: true,
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
        cache: { maxAge: 60, staleWhileRevalidate: 30 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);

// POST /api/projects - Create project
export const POST = createRouteHandler(
  async (request: NextRequest, context) => {
    try {
      return await proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: '/api/v1/projects',
        },
        requireAuth: true,
        retry: { maxRetries: 2 },
        timeout: { write: 30000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'POST' }
);
