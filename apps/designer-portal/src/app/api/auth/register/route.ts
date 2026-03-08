import { z } from 'zod';
import { createRouteHandler, proxyToBackend, apiError } from '@patina/api-routes';

/**
 * Registration API route handler
 * Handles user registration for designers
 */

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  phone: z.string().optional(),
  company: z.string().optional(),
});

const USER_MANAGEMENT_URL = process.env.NEXT_PUBLIC_USER_MANAGEMENT_API_URL || 'http://localhost:3010/v1';

export const POST = createRouteHandler(
  async (request: Request) => {
    try {
      // Validate and parse request body
      const body = await request.json();
      const validatedData = registerSchema.parse(body);

      // Add designer role to the validated data
      const bodyWithRole = {
        ...validatedData,
        role: 'designer',
      };

      // Create a new request with the modified body
      const modifiedRequest = new Request(request, {
        body: JSON.stringify(bodyWithRole),
      });

      return await proxyToBackend(modifiedRequest, { requestId: crypto.randomUUID() } as any, {
          service: {
            name: 'user-management',
            baseUrl: USER_MANAGEMENT_URL,
            path: '/auth/register',
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
            message: 'Invalid registration data',
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
