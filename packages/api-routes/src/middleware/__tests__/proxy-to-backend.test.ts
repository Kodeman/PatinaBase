/**
 * Tests for proxy-to-backend middleware
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { proxyToBackend, createProxyHandler } from '../proxy-to-backend';
import type { RouteContext } from '../../utils/request-context';
import { CircuitBreakerRegistry } from '../../utils/circuit-breaker';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('proxyToBackend', () => {
  let mockContext: RouteContext;
  let mockRequest: Request;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    mockFetch.mockClear();

    // Reset circuit breakers
    CircuitBreakerRegistry.getInstance().clear();

    // Create mock context with authenticated user
    mockContext = {
      requestId: 'test-request-id',
      ip: '127.0.0.1',
      userAgent: 'test-agent',
      user: {
        id: 'user-123',
        email: 'test@example.com',
        displayName: 'Test User',
        roles: ['designer'],
        status: 'active',
        emailVerified: true,
        accessToken: 'test-token-123',
      } as any,
      validatedData: {},
      startTime: Date.now(),
    };

    // Create mock request
    mockRequest = new Request('https://example.com/api/catalog/products', {
      method: 'GET',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json',
        'user-agent': 'test-agent',
      },
    });
  });

  afterEach(() => {
    CircuitBreakerRegistry.getInstance().clear();
  });

  describe('successful proxy', () => {
    it('should proxy GET request successfully', async () => {
      // Mock successful response
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { products: [] } }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      const response = await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
      });

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify request details
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[0]).toBe('http://localhost:3011/api/catalog/products');
      expect(fetchCall[1].method).toBe('GET');
      expect(fetchCall[1].headers['Authorization']).toBe('Bearer test-token-123');
      expect(fetchCall[1].headers['X-Request-Id']).toBe('test-request-id');
      expect(fetchCall[1].headers['X-User-Id']).toBe('user-123');

      // Verify response
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.data).toEqual({ data: { products: [] } });
    });

    it('should proxy POST request with JSON body', async () => {
      const requestBody = { name: 'New Product', price: 99.99 };

      mockRequest = new Request('https://example.com/api/catalog/products', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { id: 'product-123', ...requestBody } }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      );

      const response = await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
      });

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify body was forwarded
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].body).toBe(JSON.stringify(requestBody));
    });

    it('should use custom path override', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'success' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
          path: '/custom/path',
        },
      });

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[0]).toBe('http://localhost:3011/custom/path');
    });

    it('should preserve query parameters', async () => {
      mockRequest = new Request('https://example.com/api/catalog/products?page=2&limit=20', {
        method: 'GET',
      });

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
      });

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[0]).toBe('http://localhost:3011/api/catalog/products?page=2&limit=20');
    });
  });

  describe('authentication', () => {
    it('should return 401 if requireAuth=true and no user', async () => {
      mockContext.user = undefined;

      const response = await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
        requireAuth: true,
      });

      expect(response.status).toBe(401);
      expect(mockFetch).not.toHaveBeenCalled();

      const body = await response.json();
      expect(body.success).toBe(false);
      expect(body.error.code).toBe('AUTHENTICATION_FAILED');
    });

    it('should allow request if requireAuth=false and no user', async () => {
      mockContext.user = undefined;

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'public' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      const response = await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
        requireAuth: false,
      });

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Verify no auth header
      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].headers['Authorization']).toBeUndefined();
    });

    it('should forward auth token when present', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'success' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
      });

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].headers['Authorization']).toBe('Bearer test-token-123');
    });
  });

  describe('header forwarding', () => {
    it('should forward default headers', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'success' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
      });

      const fetchCall = mockFetch.mock.calls[0];
      const headers = fetchCall[1].headers;

      expect(headers['content-type']).toBe('application/json');
      expect(headers['accept']).toBe('application/json');
      expect(headers['user-agent']).toBe('test-agent');
    });

    it('should forward custom headers', async () => {
      mockRequest = new Request('https://example.com/api/catalog/products', {
        method: 'GET',
        headers: {
          'x-custom-header': 'custom-value',
        },
      });

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'success' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
        forwardHeaders: ['x-custom-header'],
      });

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].headers['x-custom-header']).toBe('custom-value');
    });

    it('should add forwarding headers', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'success' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
      });

      const fetchCall = mockFetch.mock.calls[0];
      const headers = fetchCall[1].headers;

      expect(headers['X-Request-Id']).toBe('test-request-id');
      expect(headers['X-Forwarded-For']).toBe('127.0.0.1');
      expect(headers['X-Forwarded-Host']).toBe('example.com');
      expect(headers['X-Forwarded-Proto']).toBe('https');
      expect(headers['X-User-Id']).toBe('user-123');
    });

    it('should not forward blocked headers', async () => {
      mockRequest = new Request('https://example.com/api/catalog/products', {
        method: 'GET',
        headers: {
          'cookie': 'session=abc123',
          'host': 'example.com',
        },
      });

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'success' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
      });

      const fetchCall = mockFetch.mock.calls[0];
      const headers = fetchCall[1].headers;

      expect(headers['cookie']).toBeUndefined();
      expect(headers['host']).toBeUndefined();
    });
  });

  describe('retry logic', () => {
    it('should retry on transient failure (503)', async () => {
      // First call fails, second succeeds
      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: 'Service unavailable' }), {
            status: 503,
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: 'success' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        );

      const response = await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
        retry: {
          maxRetries: 3,
          initialDelay: 10,
        },
      });

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable status (400)', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Bad request' }), {
          status: 400,
        })
      );

      const response = await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
        retry: {
          maxRetries: 3,
        },
      });

      expect(response.status).toBe(400);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should not retry POST by default', async () => {
      mockRequest = new Request('https://example.com/api/catalog/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Test' }),
      });

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Service unavailable' }), {
          status: 503,
        })
      );

      const response = await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
        retry: {
          maxRetries: 3,
        },
      });

      expect(response.status).toBe(503);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should retry POST if shouldRetryMutation=true', async () => {
      mockRequest = new Request('https://example.com/api/catalog/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Test' }),
      });

      mockFetch
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ error: 'Service unavailable' }), {
            status: 503,
          })
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ data: { id: 'product-123' } }), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          })
        );

      const response = await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
        retry: {
          maxRetries: 3,
          shouldRetryMutation: true,
          initialDelay: 10,
        },
      });

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('circuit breaker integration', () => {
    it('should open circuit after threshold failures', async () => {
      // Simulate 5 consecutive failures (default threshold)
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Internal error' }), {
          status: 500,
        })
      );

      const config = {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
        circuitBreaker: {
          failureThreshold: 3,
          resetTimeout: 60000,
        },
        retry: {
          maxRetries: 0, // Disable retries for this test
        },
      };

      // Make 3 failing requests
      await proxyToBackend(mockRequest, mockContext, config);
      await proxyToBackend(mockRequest, mockContext, config);
      await proxyToBackend(mockRequest, mockContext, config);

      // Circuit should now be OPEN
      const response = await proxyToBackend(mockRequest, mockContext, config);

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(body.error.message).toContain('temporarily unavailable');
    });

    it('should share circuit breaker across requests', async () => {
      const config = {
        service: {
          name: 'shared-service',
          baseUrl: 'http://localhost:3011',
        },
        circuitBreaker: {
          failureThreshold: 2,
        },
        retry: {
          maxRetries: 0,
        },
      };

      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Error' }), {
          status: 500,
        })
      );

      // First request fails
      await proxyToBackend(mockRequest, mockContext, config);

      // Second request fails - circuit opens
      await proxyToBackend(mockRequest, mockContext, config);

      // Third request should be rejected by circuit breaker
      const response = await proxyToBackend(mockRequest, mockContext, config);

      expect(response.status).toBe(503);
      const body = await response.json();
      expect(body.error.code).toBe('SERVICE_UNAVAILABLE');
    });
  });

  describe('timeout handling', () => {
    it.skip('should timeout slow requests', async () => {
      // TODO: This test needs real timers or better AbortController mocking
      // Mock a request that never resolves within timeout
      mockFetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            // Never resolve - let timeout kick in
            setTimeout(
              () =>
                resolve(
                  new Response(JSON.stringify({ data: 'success' }), {
                    status: 200,
                  })
                ),
              10000 // 10 seconds - much longer than timeout
            );
          })
      );

      const response = await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
        timeout: {
          read: 100, // 100ms timeout
        },
        retry: {
          maxRetries: 0,
        },
      });

      expect(response.status).toBe(504);
      const body = await response.json();
      expect(body.error.code).toBe('TIMEOUT');
    }, 5000);

    it('should use different timeouts for different methods', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: 'success' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      // GET request
      await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
        timeout: {
          read: 5000,
          write: 10000,
        },
      });

      // POST request
      const postRequest = new Request('https://example.com/api/catalog/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'Test' }),
      });

      await proxyToBackend(postRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
        timeout: {
          read: 5000,
          write: 10000,
        },
      });

      // Both should succeed (just testing configuration works)
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('error mapping', () => {
    it('should map custom error codes', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Product not found' }), {
          status: 404,
          headers: { 'content-type': 'application/json' },
        })
      );

      const response = await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
        retry: {
          maxRetries: 0, // Don't retry 404s
        },
        errorMapping: {
          404: {
            code: 'PRODUCT_NOT_FOUND',
            message: 'The requested product does not exist',
          },
        },
      });

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error.code).toBe('PRODUCT_NOT_FOUND');
      expect(body.error.message).toBe('The requested product does not exist');
    });
  });

  describe('response transformation', () => {
    it('should transform response data', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            items: [{ id: 1 }, { id: 2 }],
            total: 2,
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      );

      const response = await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
        responseTransformer: {
          transform: (data: any) => {
            return {
              products: data.items,
              count: data.total,
            };
          },
        },
      });

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.data).toEqual({
        products: [{ id: 1 }, { id: 2 }],
        count: 2,
      });
    });
  });

  describe('body handling', () => {
    it('should handle FormData', async () => {
      const formData = new FormData();
      formData.append('name', 'Test Product');
      formData.append('price', '99.99');

      mockRequest = new Request('https://example.com/api/catalog/products', {
        method: 'POST',
        body: formData,
      });

      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { id: 'product-123' } }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        })
      );

      const response = await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
      });

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should handle invalid JSON body', async () => {
      mockRequest = new Request('https://example.com/api/catalog/products', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: 'invalid json{',
      });

      const response = await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
      });

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error.code).toBe('BAD_REQUEST');
      expect(body.error.message).toContain('Invalid JSON');
    });

    it('should not send body for GET requests', async () => {
      mockFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ data: 'success' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      await proxyToBackend(mockRequest, mockContext, {
        service: {
          name: 'catalog',
          baseUrl: 'http://localhost:3011',
        },
      });

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[1].body).toBeNull();
    });
  });

  describe('createProxyHandler', () => {
    it('should create reusable proxy handler', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: 'success' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      const catalogProxy = createProxyHandler('catalog', 'http://localhost:3011', {
        retry: { maxRetries: 3 },
      });

      const response = await catalogProxy(mockRequest, mockContext);

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledTimes(1);

      const fetchCall = mockFetch.mock.calls[0];
      expect(fetchCall[0]).toBe('http://localhost:3011/api/catalog/products');
    });

    it('should merge options with service config', async () => {
      mockFetch.mockResolvedValue(
        new Response(JSON.stringify({ data: 'success' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

      const proxy = createProxyHandler('catalog', 'http://localhost:3011', {
        requireAuth: false,
        forwardHeaders: ['x-custom'],
      });

      mockContext.user = undefined;
      const response = await proxy(mockRequest, mockContext);

      expect(response.status).toBe(200);
    });
  });
});
