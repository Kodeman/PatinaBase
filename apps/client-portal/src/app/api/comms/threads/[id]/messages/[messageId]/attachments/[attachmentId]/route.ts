import { NextRequest } from 'next/server';
import {
  createRouteHandler,
  proxyToBackend,
  apiError
} from '@patina/api-routes';

const COMMS_URL = process.env.COMMS_SERVICE_URL || 'http://localhost:3017';

// DELETE /api/comms/threads/:id/messages/:messageId/attachments/:attachmentId
export const DELETE = createRouteHandler(
  async (request: NextRequest, context) => {
    try {
      const params = context.custom?.params;
      const threadId = params?.id;
      const messageId = params?.messageId;
      const attachmentId = params?.attachmentId;
      return await proxyToBackend(request, context, {
        service: {
          name: 'comms',
          baseUrl: COMMS_URL,
          path: `/api/v1/threads/${threadId}/messages/${messageId}/attachments/${attachmentId}`,
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
