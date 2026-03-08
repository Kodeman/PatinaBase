/**
 * Usage examples for proxyToBackend middleware
 *
 * These examples demonstrate how to use the backend proxy middleware
 * in various scenarios within Next.js API routes.
 */

import {
  createRouteHandler,
  compose,
  withAuth,
  proxyToBackend,
  createProxyHandler,
  type ProxyConfig,
} from '@patina/api-routes';

/**
 * Example 1: Simple GET proxy with authentication
 *
 * Routes: GET /api/catalog/products
 * Proxies to: http://catalog:3011/api/catalog/products
 */
export const simpleGetProxy = (auth: any) =>
  createRouteHandler(
    compose(
      withAuth(auth),
      async (request, context) => {
        return proxyToBackend(request, context, {
          service: {
            name: 'catalog',
            baseUrl: process.env.CATALOG_SERVICE_URL!,
          },
        });
      }
    ),
    { method: 'GET', path: '/api/catalog/products' }
  );

/**
 * Example 2: POST proxy with retries enabled
 *
 * Routes: POST /api/catalog/products
 * Features:
 * - Retries on transient failures
 * - Circuit breaker protection
 * - Longer timeout for write operations
 */
export const postWithRetries = (auth: any) =>
  createRouteHandler(
    compose(
      withAuth(auth),
      async (request, context) => {
        return proxyToBackend(request, context, {
          service: {
            name: 'catalog',
            baseUrl: process.env.CATALOG_SERVICE_URL!,
          },
          retry: {
            maxRetries: 3,
            shouldRetryMutation: true, // Enable retries for POST
            initialDelay: 1000,
          },
          timeout: {
            write: 30000, // 30 seconds for write operations
          },
        });
      }
    ),
    { method: 'POST', path: '/api/catalog/products' }
  );

/**
 * Example 3: Public endpoint (no auth required)
 *
 * Routes: GET /api/public/products
 * Features:
 * - No authentication required
 * - Response caching enabled
 */
export const publicEndpoint = () =>
  createRouteHandler(
    async (request, context) => {
      return proxyToBackend(request, context, {
        service: {
          name: 'catalog',
          baseUrl: process.env.CATALOG_SERVICE_URL!,
          path: '/api/products', // Custom path override
        },
        requireAuth: false, // Allow unauthenticated access
        cache: {
          ttl: 300, // Cache for 5 minutes
          visibility: 'public',
          swr: 600, // Stale-while-revalidate for 10 minutes
        },
      });
    },
    { method: 'GET', path: '/api/public/products' }
  );

/**
 * Example 4: Custom error mapping
 *
 * Routes: GET /api/catalog/products/:id
 * Features:
 * - Maps 404 to custom error code
 * - Maps 409 to custom conflict message
 */
export const customErrorMapping = (auth: any) =>
  createRouteHandler(
    compose(
      withAuth(auth),
      async (request, context) => {
        return proxyToBackend(request, context, {
          service: {
            name: 'catalog',
            baseUrl: process.env.CATALOG_SERVICE_URL!,
          },
          errorMapping: {
            404: {
              code: 'PRODUCT_NOT_FOUND',
              message: 'The requested product does not exist in our catalog',
            },
            409: {
              code: 'PRODUCT_CONFLICT',
              message: 'A product with this SKU already exists',
            },
          },
        });
      }
    ),
    { method: 'GET', path: '/api/catalog/products/:id' }
  );

/**
 * Example 5: Response transformation
 *
 * Routes: GET /api/search/products
 * Features:
 * - Transforms backend response format
 * - Adds computed fields
 * - Filters sensitive data
 */
export const responseTransformation = (auth: any) =>
  createRouteHandler(
    compose(
      withAuth(auth),
      async (request, context) => {
        return proxyToBackend(request, context, {
          service: {
            name: 'search',
            baseUrl: process.env.SEARCH_SERVICE_URL!,
          },
          responseTransformer: {
            transform: (data: any, response) => {
              // Transform backend format to frontend format
              return {
                results: data.hits?.map((hit: any) => ({
                  id: hit._id,
                  score: hit._score,
                  ...hit._source,
                })),
                total: data.total?.value || 0,
                took: data.took,
                // Add computed field
                hasMore: data.total?.value > (data.hits?.length || 0),
              };
            },
          },
        });
      }
    ),
    { method: 'GET', path: '/api/search/products' }
  );

/**
 * Example 6: Circuit breaker configuration
 *
 * Routes: GET /api/media/upload
 * Features:
 * - Aggressive circuit breaker settings
 * - Fast failure detection
 * - Longer reset timeout
 */
export const circuitBreakerConfig = (auth: any) =>
  createRouteHandler(
    compose(
      withAuth(auth),
      async (request, context) => {
        return proxyToBackend(request, context, {
          service: {
            name: 'media',
            baseUrl: process.env.MEDIA_SERVICE_URL!,
          },
          circuitBreaker: {
            failureThreshold: 3, // Open after 3 failures
            successThreshold: 2, // Close after 2 successes
            resetTimeout: 30000, // Try again after 30 seconds
            halfOpenRequests: 1, // Only 1 test request at a time
          },
          retry: {
            maxRetries: 2, // Fewer retries for faster failure
          },
        });
      }
    ),
    { method: 'POST', path: '/api/media/upload' }
  );

/**
 * Example 7: Reusable proxy handler
 *
 * Create a reusable proxy handler for a service with common configuration.
 * Use this pattern when you have multiple routes for the same service.
 */
const catalogProxy = createProxyHandler('catalog', process.env.CATALOG_SERVICE_URL!, {
  retry: {
    maxRetries: 3,
    initialDelay: 1000,
  },
  timeout: {
    read: 10000,
    write: 30000,
  },
  circuitBreaker: {
    failureThreshold: 5,
    resetTimeout: 60000,
  },
});

export const reusableHandler1 = (auth: any) =>
  createRouteHandler(compose(withAuth(auth), catalogProxy), {
    method: 'GET',
    path: '/api/catalog/products',
  });

export const reusableHandler2 = (auth: any) =>
  createRouteHandler(compose(withAuth(auth), catalogProxy), {
    method: 'GET',
    path: '/api/catalog/categories',
  });

export const reusableHandler3 = (auth: any) =>
  createRouteHandler(compose(withAuth(auth), catalogProxy), {
    method: 'GET',
    path: '/api/catalog/collections',
  });

/**
 * Example 8: Custom headers forwarding
 *
 * Routes: POST /api/projects/tasks
 * Features:
 * - Forwards custom correlation headers
 * - Forwards accept-language for i18n
 */
export const customHeaderForwarding = (auth: any) =>
  createRouteHandler(
    compose(
      withAuth(auth),
      async (request, context) => {
        return proxyToBackend(request, context, {
          service: {
            name: 'projects',
            baseUrl: process.env.PROJECTS_SERVICE_URL!,
          },
          forwardHeaders: [
            'x-correlation-id',
            'x-trace-id',
            'accept-language',
            'x-timezone',
          ],
        });
      }
    ),
    { method: 'POST', path: '/api/projects/tasks' }
  );

/**
 * Example 9: Multiple methods for same endpoint
 *
 * Demonstrates handling GET and POST with different configurations
 */
export const GET_products = (auth: any) =>
  createRouteHandler(
    compose(
      withAuth(auth),
      async (request, context) => {
        return proxyToBackend(request, context, {
          service: {
            name: 'catalog',
            baseUrl: process.env.CATALOG_SERVICE_URL!,
          },
          cache: {
            ttl: 300, // Cache GET requests
          },
        });
      }
    ),
    { method: 'GET', path: '/api/catalog/products' }
  );

export const POST_products = (auth: any) =>
  createRouteHandler(
    compose(
      withAuth(auth),
      async (request, context) => {
        return proxyToBackend(request, context, {
          service: {
            name: 'catalog',
            baseUrl: process.env.CATALOG_SERVICE_URL!,
          },
          retry: {
            shouldRetryMutation: true, // Enable retries for POST
          },
          cache: {
            noCache: true, // Never cache mutations
          },
        });
      }
    ),
    { method: 'POST', path: '/api/catalog/products' }
  );

/**
 * Example 10: Complete production configuration
 *
 * Routes: All methods on /api/orders/*
 * Features:
 * - Full retry configuration
 * - Circuit breaker protection
 * - Custom timeouts per method
 * - Error mapping for domain errors
 * - Response transformation
 * - Custom header forwarding
 */
const productionConfig: Omit<ProxyConfig, 'service'> = {
  retry: {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    shouldRetryMutation: false, // Conservative for mutations
    retryableStatuses: [408, 429, 500, 502, 503, 504],
  },
  circuitBreaker: {
    failureThreshold: 5,
    successThreshold: 2,
    resetTimeout: 60000,
    halfOpenRequests: 1,
  },
  timeout: {
    read: 10000,
    write: 30000,
    delete: 15000,
  },
  errorMapping: {
    404: {
      code: 'ORDER_NOT_FOUND',
      message: 'The requested order could not be found',
    },
    409: {
      code: 'ORDER_ALREADY_PROCESSED',
      message: 'This order has already been processed',
    },
    422: {
      code: 'INVALID_ORDER_STATE',
      message: 'The order is in an invalid state for this operation',
    },
  },
  forwardHeaders: [
    'x-correlation-id',
    'x-idempotency-key',
    'accept-language',
  ],
  responseTransformer: {
    transform: (data: any) => {
      // Add computed fields, filter sensitive data, etc.
      if (data.items) {
        data.items = data.items.map((item: any) => ({
          ...item,
          // Remove internal fields
          _internal: undefined,
          _version: undefined,
        }));
      }
      return data;
    },
  },
};

export const productionOrdersProxy = (auth: any) =>
  createRouteHandler(
    compose(
      withAuth(auth),
      async (request, context) => {
        return proxyToBackend(request, context, {
          ...productionConfig,
          service: {
            name: 'orders',
            baseUrl: process.env.ORDERS_SERVICE_URL!,
          },
        });
      }
    ),
    { method: 'GET', path: '/api/orders' }
  );
