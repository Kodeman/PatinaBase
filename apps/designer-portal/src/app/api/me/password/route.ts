import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';
import { auth } from '@/lib/auth';

const USER_MANAGEMENT_URL = process.env.USER_MANAGEMENT_SERVICE_URL || 'http://localhost:3010';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character'),
});

/**
 * Change current user password
 */
export const PATCH = createRouteHandler(
  async (request: NextRequest) => {
    try {
      const session = await auth();

      if (!session?.user?.id) {
        return NextResponse.json(
          { error: 'UNAUTHORIZED', message: 'Authentication required' },
          { status: 401 }
        );
      }

      // Validate request body
      const body = await request.json();
      const validatedData = changePasswordSchema.parse(body);

      // Create new request with validated body
      const proxiedRequest = new Request(request.url, {
        method: 'PATCH',
        headers: request.headers,
        body: JSON.stringify(validatedData),
      });

      return await proxyToBackend(proxiedRequest, { requestId: crypto.randomUUID() } as any, {
        service: {
          name: 'user-management',
          baseUrl: USER_MANAGEMENT_URL,
          path: '/v1/me/password',
        },
        requireAuth: true,
        retry: { maxRetries: 1 }, // No retry for password change
        timeout: { write: 10000 },
      });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: 'Invalid password',
            details: error.errors,
          },
          { status: 400 }
        );
      }
      return apiError(error);
    }
  },
  { method: 'PATCH' }
);
