import { NextRequest } from 'next/server';
import {
  createRouteHandler,
  proxyToBackend,
  apiError
} from '@patina/api-routes';

const COMMS_URL = process.env.COMMS_SERVICE_URL || 'http://localhost:3017';

// POST /api/comms/threads/:id/messages/:messageId/attachments - Upload attachment
export const POST = createRouteHandler(
  async (request: NextRequest, context) => {
    try {
      const params = context.custom?.params;
      const threadId = params?.id;
      const messageId = params?.messageId;
      return await proxyToBackend(request, context, {
        service: {
          name: 'comms',
          baseUrl: COMMS_URL,
          path: `/api/v1/threads/${threadId}/messages/${messageId}/attachments`,
        },
        requireAuth: true,
        retry: { maxRetries: 1 }, // Don't retry file uploads
        timeout: { write: 60000 }, // 60s for file upload
      });
    } catch (error) {
      return apiError(error);
    }
  },
  { method: 'POST' }
);
