import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createRouteHandler,
  proxyToBackend,
  apiError,
} from '@patina/api-routes';

/**
 * Login API route handler for credential-based authentication
 * Admin portal specific - validates admin role
 */

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

// Define the backend service config
const USER_MANAGEMENT_URL =
  process.env.USER_MANAGEMENT_SERVICE_URL ||
  process.env.NEXT_PUBLIC_USER_MANAGEMENT_API_URL ||
  'http://localhost:3010';

export const POST = createRouteHandler(
  async (request: NextRequest) => {
    try {
      // Validate request body
      const body = await request.json();
      const validatedData = loginSchema.parse(body);

      // Create a new request with validated body for proxying
      const proxiedRequest = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify(validatedData),
      });

      // Proxy request to user management service
      const response = await proxyToBackend(proxiedRequest, { requestId: crypto.randomUUID() } as any, {
        service: {
          name: 'user-management',
          baseUrl: USER_MANAGEMENT_URL,
          path: '/v1/auth/login',
        },
        requireAuth: false,
        retry: { maxRetries: 2 },
        timeout: { write: 10000 },
        responseTransformer: {
          transform: (data: any) => {
            // Verify user has admin role
            const roles = data.user?.roles || [];
            if (!roles.includes('admin') && !roles.includes('super_admin')) {
              throw new Error('ACCESS_DENIED');
            }
            return data;
          },
        },
        errorMapping: {
          403: {
            code: 'ACCESS_DENIED',
            message: 'You do not have permission to access the admin portal',
          },
        },
      });

      return response;
    } catch (error: any) {
      // Handle validation errors
      if (error.name === 'ZodError') {
        return NextResponse.json(
          {
            error: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
          },
          { status: 400 }
        );
      }

      // Handle custom ACCESS_DENIED error from transformer
      if (error.message === 'ACCESS_DENIED') {
        return NextResponse.json(
          {
            error: 'ACCESS_DENIED',
            message: 'You do not have permission to access the admin portal',
          },
          { status: 403 }
        );
      }
      return apiError(error);
    }
  },
  { method: 'POST' }
);
