/**
 * API Routes Middleware
 * Composable middleware functions for Next.js API routes
 */

// Validation middleware
export {
  withValidation,
  createQuerySchema,
  queryTransforms,
  type ValidationSchemas,
  type RouteHandler,
} from './with-validation';

// Validation schemas
export * from './validation-schemas';

// Authentication middleware
export {
  withAuth,
  withOptionalAuth,
  type AuthOptions,
  type NextAuthFn,
} from './with-auth';

// Role-based access control
export {
  withRole,
  requireRole,
  requireAnyRole,
  requireAllRoles,
  roleMiddleware,
  type RoleOptions,
  type RoleStrategy,
} from './with-role';

// Backend proxy middleware
export {
  proxyToBackend,
  createProxyHandler,
  type ProxyConfig,
  type ServiceConfig,
  type ErrorMapping,
  type ResponseTransformer,
} from './proxy-to-backend';

// Metrics endpoint
export { createMetricsEndpoint } from './with-metrics';
