import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';
import { auth } from '@/lib/auth';

const USER_MANAGEMENT_URL = process.env.USER_MANAGEMENT_SERVICE_URL || 'http://localhost:3010';

/**
 * Revoke a specific session
 */
export const DELETE = createRouteHandler(
  async (request: NextRequest, context: { params: Promise<{ id: string }> }) => {
    try {
      const session = await auth();

      if (!session?.user?.id) {
        return NextResponse.json(
          { error: 'UNAUTHORIZED', message: 'Authentication required' },
          { status: 401 }
        );
      }

      const params = await context.params;
      const sessionId = params.id;

      return await proxyToBackend(request, { requestId: crypto.randomUUID() } as any, {
        service: {
          name: 'user-management',
          baseUrl: USER_MANAGEMENT_URL,
          path: `/v1/sessions/${sessionId}`,
        },
        requireAuth: true,
        retry: { maxRetries: 1 },
        timeout: { write: 10000 },
      });
    } catch (error: any) {
      return apiError(error);
    }
  },
  { method: 'DELETE' }
);
