import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';
import { auth } from '@/lib/auth';

/**
 * Get current user profile
 */
const USER_MANAGEMENT_URL = process.env.USER_MANAGEMENT_SERVICE_URL || 'http://localhost:3010';

export const GET = createRouteHandler(
  async (request: NextRequest) => {
    try {
      const session = await auth();

      if (!session?.user?.id) {
        return NextResponse.json(
          { error: 'UNAUTHORIZED', message: 'Authentication required' },
          { status: 401 }
        );
      }

      return await proxyToBackend(request, { requestId: crypto.randomUUID() } as any, {
        service: {
          name: 'user-management',
          baseUrl: USER_MANAGEMENT_URL,
          path: '/v1/me',
        },
        requireAuth: true,
        retry: { maxRetries: 3 },
        timeout: { read: 10000 },
        cache: { maxAge: 60 }, // Short cache for user data
      });
    } catch (error: any) {
      return apiError(error);
    }
  },
  { method: 'GET' }
);
