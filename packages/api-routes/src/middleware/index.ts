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

// Backend proxy middleware
export {
  proxyToBackend,
  createProxyHandler,
  type ProxyConfig,
  type ServiceConfig,
  type ErrorMapping,
  type ResponseTransformer,
} from './proxy-to-backend';
