/**
 * @patina/api-routes
 *
 * Reusable Next.js 15 API route patterns and middleware for Patina.
 *
 * Primary surface:
 *   - createRouteHandler — route handler factory with logging/error/context
 *   - proxyToBackend     — forward request to a NestJS service with retry + auth
 *   - compose            — chain middleware
 *   - withValidation     — Zod-based body/query/params validation
 *   - apiSuccess / apiError / apiValidationError / apiUnauthorized — responses
 *
 * @example
 * ```ts
 * import { createRouteHandler, compose, withValidation, apiSuccess } from '@patina/api-routes';
 * import { z } from 'zod';
 *
 * const bodySchema = z.object({ name: z.string(), email: z.string().email() });
 *
 * export const POST = createRouteHandler(
 *   compose(
 *     withValidation({ body: bodySchema }),
 *     async (request, context) => {
 *       const { name, email } = context.validatedData.body;
 *       return apiSuccess({ created: true, name, email });
 *     }
 *   ),
 *   { method: 'POST', path: '/api/users' }
 * );
 * ```
 */

// Route handler factory
export {
  createRouteHandler,
  compose,
  createHandlers,
  createMultiMethodHandler,
  type RouteConfig,
} from './create-route-handler';

// Re-export all middleware
export * from './middleware';

// Re-export all utilities
export * from './utils';
