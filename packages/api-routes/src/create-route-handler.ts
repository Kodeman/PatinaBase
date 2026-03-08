import type { NextRequest } from 'next/server';
import type { RouteHandler } from './middleware/with-validation';
import { createContext } from './utils/request-context';
import { apiError, type ApiResponseOptions } from './utils/response-wrapper';
import {
  logRequestStart,
  logRequestComplete,
  logRequestError,
} from './utils/logger';

/**
 * Configuration for route handler
 */
export interface RouteConfig {
  /** Route method (GET, POST, etc.) */
  method: string;
  /** Route path (for logging) */
  path?: string;
  /** Default cache configuration for successful responses */
  cache?: ApiResponseOptions['cache'];
}

/**
 * Compose middleware functions into a single handler
 * Middleware is executed in the order provided
 *
 * @example
 * ```ts
 * const handler = compose(
 *   withAuth(auth),
 *   withRole({ roles: 'admin' }),
 *   withValidation({ body: createProductSchema }),
 *   async (request, context) => {
 *     // Your handler logic
 *     const body = context.validatedData.body;
 *     return apiSuccess({ created: true });
 *   }
 * );
 * ```
 */
export function compose(...middleware: Array<(next: RouteHandler) => RouteHandler>): RouteHandler {
  return middleware.reduceRight(
    (next, mw) => mw(next),
    (async () => {
      throw new Error('No handler provided to compose()');
    }) as RouteHandler
  );
}

/**
 * Create a Next.js route handler with automatic context creation,
 * error handling, and logging
 *
 * @example
 * ```ts
 * // Basic handler
 * export const GET = createRouteHandler(
 *   async (request, context) => {
 *     return apiSuccess({ message: 'Hello' });
 *   }
 * );
 *
 * // With middleware
 * export const POST = createRouteHandler(
 *   compose(
 *     withAuth(auth),
 *     withValidation({ body: schema }),
 *     async (request, context) => {
 *       return apiSuccess({ data: context.validatedData.body });
 *     }
 *   ),
 *   { method: 'POST', path: '/api/example' }
 * );
 * ```
 */
export function createRouteHandler(
  handler: RouteHandler,
  config: RouteConfig = { method: 'GET' }
): (request: NextRequest, routeContext?: { params: Promise<any> }) => Promise<Response> {
  return async (request: NextRequest, routeContext?: { params: Promise<any> }) => {
    // Create initial context
    const context = createContext(request);

    // Extract and add Next.js params to context if provided
    if (routeContext?.params) {
      const params = await routeContext.params;
      context.custom = { ...context.custom, params };
    }

    const method = config.method;
    const path = config.path || new URL(request.url).pathname;

    // Log request start
    logRequestStart(context, method, path);

    try {
      // Execute handler with middleware
      const response = await handler(request, context);

      // Log successful completion
      logRequestComplete(context, method, path, response.status);

      return response;
    } catch (error) {
      // Log error
      logRequestError(context, method, path, error);

      // Return error response
      return apiError(error);
    }
  };
}

/**
 * Helper to create method-specific route handlers
 */
export const createHandlers = {
  /**
   * Create GET handler
   */
  get: (handler: RouteHandler, config?: Omit<RouteConfig, 'method'>) =>
    createRouteHandler(handler, { ...config, method: 'GET' }),

  /**
   * Create POST handler
   */
  post: (handler: RouteHandler, config?: Omit<RouteConfig, 'method'>) =>
    createRouteHandler(handler, { ...config, method: 'POST' }),

  /**
   * Create PUT handler
   */
  put: (handler: RouteHandler, config?: Omit<RouteConfig, 'method'>) =>
    createRouteHandler(handler, { ...config, method: 'PUT' }),

  /**
   * Create PATCH handler
   */
  patch: (handler: RouteHandler, config?: Omit<RouteConfig, 'method'>) =>
    createRouteHandler(handler, { ...config, method: 'PATCH' }),

  /**
   * Create DELETE handler
   */
  delete: (handler: RouteHandler, config?: Omit<RouteConfig, 'method'>) =>
    createRouteHandler(handler, { ...config, method: 'DELETE' }),
};

/**
 * Helper to create a handler that supports multiple HTTP methods
 * with shared middleware but different handlers per method
 *
 * @example
 * ```ts
 * const { GET, POST } = createMultiMethodHandler({
 *   middleware: [withAuth(auth)],
 *   handlers: {
 *     GET: async (request, context) => apiSuccess({ method: 'GET' }),
 *     POST: async (request, context) => apiSuccess({ method: 'POST' }),
 *   },
 * });
 *
 * export { GET, POST };
 * ```
 */
export function createMultiMethodHandler(options: {
  middleware?: Array<(next: RouteHandler) => RouteHandler>;
  handlers: {
    GET?: RouteHandler;
    POST?: RouteHandler;
    PUT?: RouteHandler;
    PATCH?: RouteHandler;
    DELETE?: RouteHandler;
  };
  config?: Omit<RouteConfig, 'method'>;
}) {
  const { middleware = [], handlers, config } = options;

  const result: Record<string, ReturnType<typeof createRouteHandler>> = {};

  // Create handler for each method
  for (const [method, handler] of Object.entries(handlers)) {
    if (handler) {
      // Compose middleware with handler
      const composedHandler = middleware.length > 0
        ? compose(...middleware, handler)
        : handler;

      result[method] = createRouteHandler(composedHandler, {
        ...config,
        method,
      });
    }
  }

  return result as {
    GET?: ReturnType<typeof createRouteHandler>;
    POST?: ReturnType<typeof createRouteHandler>;
    PUT?: ReturnType<typeof createRouteHandler>;
    PATCH?: ReturnType<typeof createRouteHandler>;
    DELETE?: ReturnType<typeof createRouteHandler>;
  };
}
