import { z } from 'zod';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';

/**
 * Login API route handler for credential-based authentication
 * This handles direct credential login, which will be used by NextAuth credentials provider
 */

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const USER_MANAGEMENT_URL = process.env.NEXT_PUBLIC_USER_MANAGEMENT_API_URL || 'http://localhost:3010/v1';

export const POST = createRouteHandler(
  async (request: Request) => {
    try {
      // Validate request body
      const body = await request.json();
      const validatedData = loginSchema.parse(body);

      // Create a new request with validated body
      const proxiedRequest = new Request(request.url, {
        method: request.method,
        headers: request.headers,
        body: JSON.stringify(validatedData),
      });

      return await proxyToBackend(proxiedRequest, { requestId: crypto.randomUUID() } as any, {
          service: {
            name: 'user-management',
            baseUrl: USER_MANAGEMENT_URL,
            path: '/auth/login',
          },
          requireAuth: false,
          retry: { maxRetries: 2 },
          timeout: { write: 10000 },
        });
    } catch (error: any) {
      // Handle validation errors
      if (error.name === 'ZodError') {
        return new Response(
          JSON.stringify({
            error: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return apiError(error);
    }
  },
  { method: 'POST' }
);
