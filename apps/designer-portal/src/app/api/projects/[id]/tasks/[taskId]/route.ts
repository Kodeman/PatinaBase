import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import {
  createRouteHandler,
  proxyToBackend
} from '@patina/api-routes';
import { apiError } from '@patina/api-routes';

const PROJECTS_URL = process.env.PROJECTS_SERVICE_URL || 'http://localhost:3016';

// GET /api/projects/:id/tasks/:taskId - Get task details
export const GET = createRouteHandler(
  async (request: NextRequest, context) => {
    try {
      const params = context.custom?.params;
      const projectId = params?.id;
      const taskId = params?.taskId;
      return await proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${projectId}/tasks/${taskId}`,
        },
        requireAuth: true,
        retry: { maxRetries: 3 },
        timeout: { read: 5000 },
        cache: { maxAge: 60, staleWhileRevalidate: 30 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);

// PATCH /api/projects/:id/tasks/:taskId - Update task
export const PATCH = createRouteHandler(
  async (request: NextRequest, context) => {
    try {
      const params = context.custom?.params;
      const projectId = params?.id;
      const taskId = params?.taskId;
      return await proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${projectId}/tasks/${taskId}`,
        },
        requireAuth: true,
        retry: { maxRetries: 2 },
        timeout: { write: 20000 },
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'PATCH' }
);

// DELETE /api/projects/:id/tasks/:taskId - Delete task
export const DELETE = createRouteHandler(
  async (request: NextRequest, context) => {
    try {
      const params = context.custom?.params;
      const projectId = params?.id;
      const taskId = params?.taskId;
      return await proxyToBackend(request, context, {
        service: {
          name: 'projects',
          baseUrl: PROJECTS_URL,
          path: `/api/v1/projects/${projectId}/tasks/${taskId}`,
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
