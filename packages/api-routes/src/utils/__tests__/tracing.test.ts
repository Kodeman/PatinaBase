/**
 * Tests for tracing utilities
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createTracer,
  startRouteSpan,
  startProxySpan,
  recordRetryAttempt,
  recordCircuitBreakerEvent,
  recordCacheEvent,
  endSpanSuccess,
  endSpanError,
  type TracingConfig,
  type Span,
} from '../tracing';
import type { RouteContext } from '../request-context';
import { SpanStatusCode } from '@opentelemetry/api';

// Mock OpenTelemetry trace
vi.mock('@opentelemetry/api', async () => {
  const actual = await vi.importActual('@opentelemetry/api');
  return {
    ...actual,
    trace: {
      getTracer: vi.fn(() => ({
        startSpan: vi.fn((name: string, options?: any) => createMockSpan(name, options)),
      })),
    },
  };
});

function createMockSpan(name: string, options?: any): Span {
  const attributes: Record<string, any> = {};
  const events: Array<{ name: string; attributes: Record<string, any> }> = [];
  let status: any = null;
  let exception: any = null;
  let ended = false;

  // Initialize attributes from options
  if (options?.attributes) {
    Object.assign(attributes, options.attributes);
  }

  const mockSpan: any = {
    spanContext: () => ({
      traceId: 'mock-trace-id',
      spanId: 'mock-span-id',
      traceFlags: 1,
    }),
    setAttribute: (key: string, value: any) => {
      attributes[key] = value;
      return mockSpan;
    },
    setAttributes: (attrs: Record<string, any>) => {
      Object.assign(attributes, attrs);
      return mockSpan;
    },
    addEvent: (eventName: string, eventAttributes?: Record<string, any>) => {
      events.push({ name: eventName, attributes: eventAttributes || {} });
      return mockSpan;
    },
    setStatus: (s: any) => {
      status = s;
      return mockSpan;
    },
    updateName: (newName: string) => {
      return mockSpan;
    },
    end: () => {
      ended = true;
    },
    isRecording: () => !ended,
    recordException: (e: Error) => {
      exception = e;
    },
    // Add test helpers
    _getAttributes: () => attributes,
    _getEvents: () => events,
    _getStatus: () => status,
    _getException: () => exception,
    _isEnded: () => ended,
  };

  return mockSpan as Span;
}

function createMockContext(): RouteContext {
  return {
    requestId: 'req-123',
    ip: '192.168.1.1',
    userAgent: 'Mozilla/5.0',
    validatedData: {},
    startTime: Date.now(),
  };
}

describe('tracing utilities', () => {
  describe('createTracer', () => {
    it('should create tracer when enabled', () => {
      const config: TracingConfig = {
        serviceName: 'test-service',
        enabled: true,
        sampleRate: 1.0,
      };

      const tracer = createTracer(config);
      expect(tracer).toBeDefined();
      expect(tracer.startSpan).toBeDefined();
    });

    it('should create no-op tracer when disabled', () => {
      const config: TracingConfig = {
        serviceName: 'test-service',
        enabled: false,
      };

      const tracer = createTracer(config);
      expect(tracer).toBeDefined();

      const span = tracer.startSpan('test');
      expect(span.setAttribute).toBeDefined();
      expect(span.end).toBeDefined();

      // No-op span should not throw
      span.setAttribute('key', 'value');
      span.addEvent('event');
      span.end();
    });

    it('should default to enabled when not specified', () => {
      const config: TracingConfig = {
        serviceName: 'test-service',
      };

      const tracer = createTracer(config);
      expect(tracer).toBeDefined();
    });
  });

  describe('startRouteSpan', () => {
    it('should create span with HTTP attributes', () => {
      const context = createMockContext();
      const span = startRouteSpan('test-service', 'GET', '/api/products', context);

      const attrs = (span as any)._getAttributes();
      expect(attrs['http.method']).toBe('GET');
      expect(attrs['http.route']).toBe('/api/products');
      expect(attrs['http.request_id']).toBe('req-123');
      expect(attrs['http.client_ip']).toBe('192.168.1.1');
      expect(attrs['http.user_agent']).toBe('Mozilla/5.0');
    });

    it('should include user attributes when authenticated', () => {
      const context: RouteContext = {
        ...createMockContext(),
        user: {
          id: 'user-123',
          email: 'test@example.com',
          displayName: 'Test User',
          roles: ['designer', 'admin'],
          status: 'active',
          emailVerified: true,
        },
      };

      const span = startRouteSpan('test-service', 'POST', '/api/orders', context);

      const attrs = (span as any)._getAttributes();
      expect(attrs['user.id']).toBe('user-123');
      expect(attrs['user.role']).toBe('designer,admin');
      expect(attrs['user.email_verified']).toBe(true);
    });

    it('should handle missing user agent', () => {
      const context: RouteContext = {
        ...createMockContext(),
        userAgent: undefined,
      };

      const span = startRouteSpan('test-service', 'GET', '/api/products', context);

      const attrs = (span as any)._getAttributes();
      expect(attrs['http.user_agent']).toBe('unknown');
    });

    it('should handle unauthenticated requests', () => {
      const context = createMockContext();
      const span = startRouteSpan('test-service', 'GET', '/api/public', context);

      const attrs = (span as any)._getAttributes();
      expect(attrs['user.id']).toBeUndefined();
      expect(attrs['user.role']).toBeUndefined();
    });
  });

  describe('startProxySpan', () => {
    it('should create proxy span with service attributes', () => {
      const parentSpan = createMockSpan('parent');
      const span = startProxySpan(
        parentSpan,
        'catalog',
        'GET',
        'http://catalog:3011/products'
      );

      const attrs = (span as any)._getAttributes();
      expect(attrs['service.name']).toBe('catalog');
      expect(attrs['http.method']).toBe('GET');
      expect(attrs['http.url']).toBe('http://catalog:3011/products');
      expect(attrs['span.kind']).toBe('client');
    });

    it('should work with different HTTP methods', () => {
      const parentSpan = createMockSpan('parent');

      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
      for (const method of methods) {
        const span = startProxySpan(
          parentSpan,
          'catalog',
          method,
          'http://catalog:3011/products'
        );

        const attrs = (span as any)._getAttributes();
        expect(attrs['http.method']).toBe(method);
      }
    });
  });

  describe('recordRetryAttempt', () => {
    it('should add retry event with attempt number', () => {
      const span = createMockSpan('test');
      recordRetryAttempt(span, 1);

      const events = (span as any)._getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].name).toBe('retry_attempt');
      expect(events[0].attributes['retry.attempt']).toBe(1);
    });

    it('should include error message when provided', () => {
      const span = createMockSpan('test');
      const error = new Error('Connection timeout');
      recordRetryAttempt(span, 2, error);

      const events = (span as any)._getEvents();
      expect(events[0].attributes['retry.error']).toBe('Connection timeout');
      expect(events[0].attributes['retry.error_name']).toBe('Error');
    });

    it('should handle missing error', () => {
      const span = createMockSpan('test');
      recordRetryAttempt(span, 1);

      const events = (span as any)._getEvents();
      expect(events[0].attributes['retry.error']).toBe('unknown');
      expect(events[0].attributes['retry.error_name']).toBe('unknown');
    });

    it('should record multiple retry attempts', () => {
      const span = createMockSpan('test');
      recordRetryAttempt(span, 1);
      recordRetryAttempt(span, 2);
      recordRetryAttempt(span, 3);

      const events = (span as any)._getEvents();
      expect(events).toHaveLength(3);
      expect(events[0].attributes['retry.attempt']).toBe(1);
      expect(events[1].attributes['retry.attempt']).toBe(2);
      expect(events[2].attributes['retry.attempt']).toBe(3);
    });
  });

  describe('recordCircuitBreakerEvent', () => {
    it('should record circuit breaker state change', () => {
      const span = createMockSpan('test');
      recordCircuitBreakerEvent(span, 'catalog', 'OPEN');

      const events = (span as any)._getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].name).toBe('circuit_breaker_state_change');
      expect(events[0].attributes['circuit_breaker.service']).toBe('catalog');
      expect(events[0].attributes['circuit_breaker.state']).toBe('OPEN');
    });

    it('should handle all circuit breaker states', () => {
      const span = createMockSpan('test');
      const states: Array<'OPEN' | 'CLOSED' | 'HALF_OPEN'> = [
        'CLOSED',
        'OPEN',
        'HALF_OPEN',
      ];

      for (const state of states) {
        recordCircuitBreakerEvent(span, 'catalog', state);
      }

      const events = (span as any)._getEvents();
      expect(events).toHaveLength(3);
      expect(events[0].attributes['circuit_breaker.state']).toBe('CLOSED');
      expect(events[1].attributes['circuit_breaker.state']).toBe('OPEN');
      expect(events[2].attributes['circuit_breaker.state']).toBe('HALF_OPEN');
    });
  });

  describe('recordCacheEvent', () => {
    it('should record cache hit', () => {
      const span = createMockSpan('test');
      recordCacheEvent(span, true);

      const events = (span as any)._getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].name).toBe('cache_hit');
      expect(events[0].attributes['cache.hit']).toBe(true);
    });

    it('should record cache miss', () => {
      const span = createMockSpan('test');
      recordCacheEvent(span, false);

      const events = (span as any)._getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].name).toBe('cache_miss');
      expect(events[0].attributes['cache.hit']).toBe(false);
    });

    it('should include cache key when provided', () => {
      const span = createMockSpan('test');
      recordCacheEvent(span, true, 'product:123');

      const events = (span as any)._getEvents();
      expect(events[0].attributes['cache.key']).toBe('product:123');
    });

    it('should handle missing cache key', () => {
      const span = createMockSpan('test');
      recordCacheEvent(span, true);

      const events = (span as any)._getEvents();
      expect(events[0].attributes['cache.key']).toBeUndefined();
    });
  });

  describe('endSpanSuccess', () => {
    it('should set success status and status code', () => {
      const span = createMockSpan('test');
      endSpanSuccess(span, 200);

      const attrs = (span as any)._getAttributes();
      expect(attrs['http.status_code']).toBe(200);

      const status = (span as any)._getStatus();
      expect(status.code).toBe(SpanStatusCode.OK);

      expect((span as any)._isEnded()).toBe(true);
    });

    it('should handle different success status codes', () => {
      const codes = [200, 201, 202, 204];
      for (const code of codes) {
        const span = createMockSpan('test');
        endSpanSuccess(span, code);

        const attrs = (span as any)._getAttributes();
        expect(attrs['http.status_code']).toBe(code);

        const status = (span as any)._getStatus();
        expect(status.code).toBe(SpanStatusCode.OK);
      }
    });
  });

  describe('endSpanError', () => {
    it('should set error status and record exception', () => {
      const span = createMockSpan('test');
      const error = new Error('Test error');
      endSpanError(span, error, 500);

      const attrs = (span as any)._getAttributes();
      expect(attrs['http.status_code']).toBe(500);

      const status = (span as any)._getStatus();
      expect(status.code).toBe(SpanStatusCode.ERROR);
      expect(status.message).toBe('Test error');

      const exception = (span as any)._getException();
      expect(exception).toBe(error);

      expect((span as any)._isEnded()).toBe(true);
    });

    it('should handle error without status code', () => {
      const span = createMockSpan('test');
      const error = new Error('Test error');
      endSpanError(span, error);

      const attrs = (span as any)._getAttributes();
      expect(attrs['http.status_code']).toBeUndefined();

      const status = (span as any)._getStatus();
      expect(status.code).toBe(SpanStatusCode.ERROR);
    });

    it('should preserve error message in status', () => {
      const span = createMockSpan('test');
      const error = new Error('Connection refused');
      endSpanError(span, error, 503);

      const status = (span as any)._getStatus();
      expect(status.message).toBe('Connection refused');
    });
  });

  describe('no-op tracer', () => {
    it('should provide no-op implementations', () => {
      const config: TracingConfig = {
        serviceName: 'test-service',
        enabled: false,
      };

      const tracer = createTracer(config);
      const span = tracer.startSpan('test');

      // All operations should be no-op and not throw
      expect(() => {
        span.setAttribute('key', 'value');
        span.setAttributes({ key1: 'value1', key2: 'value2' });
        span.addEvent('event', { attr: 'value' });
        span.setStatus({ code: SpanStatusCode.OK });
        span.updateName('new-name');
        span.recordException(new Error('test'));
        span.end();
      }).not.toThrow();

      expect(span.isRecording()).toBe(false);
    });

    it('should return valid span context', () => {
      const config: TracingConfig = {
        serviceName: 'test-service',
        enabled: false,
      };

      const tracer = createTracer(config);
      const span = tracer.startSpan('test');
      const context = span.spanContext();

      expect(context).toBeDefined();
      expect(context.traceId).toBe('');
      expect(context.spanId).toBe('');
      expect(context.traceFlags).toBe(0);
    });
  });

  describe('integration scenarios', () => {
    it('should trace complete request lifecycle', () => {
      const context = createMockContext();
      const routeSpan = startRouteSpan('designer-portal', 'GET', '/api/products', context);

      // Simulate proxy request
      const proxySpan = startProxySpan(
        routeSpan,
        'catalog',
        'GET',
        'http://catalog:3011/products'
      );

      // Simulate retry
      recordRetryAttempt(proxySpan, 1, new Error('Timeout'));

      // Simulate successful retry
      endSpanSuccess(proxySpan, 200);

      // Complete route span
      endSpanSuccess(routeSpan, 200);

      // Verify route span
      const routeAttrs = (routeSpan as any)._getAttributes();
      expect(routeAttrs['http.method']).toBe('GET');
      expect(routeAttrs['http.status_code']).toBe(200);
      expect((routeSpan as any)._isEnded()).toBe(true);

      // Verify proxy span
      const proxyAttrs = (proxySpan as any)._getAttributes();
      expect(proxyAttrs['service.name']).toBe('catalog');
      expect(proxyAttrs['http.status_code']).toBe(200);

      const proxyEvents = (proxySpan as any)._getEvents();
      expect(proxyEvents).toHaveLength(1);
      expect(proxyEvents[0].name).toBe('retry_attempt');
    });

    it('should trace failed request with circuit breaker', () => {
      const context = createMockContext();
      const routeSpan = startRouteSpan('designer-portal', 'POST', '/api/orders', context);

      const proxySpan = startProxySpan(
        routeSpan,
        'orders',
        'POST',
        'http://orders:3015/orders'
      );

      // Record circuit breaker opening
      recordCircuitBreakerEvent(proxySpan, 'orders', 'OPEN');

      // End with error
      endSpanError(proxySpan, new Error('Service unavailable'), 503);
      endSpanError(routeSpan, new Error('Service unavailable'), 503);

      // Verify error handling
      const proxyStatus = (proxySpan as any)._getStatus();
      expect(proxyStatus.code).toBe(SpanStatusCode.ERROR);

      const events = (proxySpan as any)._getEvents();
      expect(events.some((e: any) => e.name === 'circuit_breaker_state_change')).toBe(true);
    });

    it('should trace cached request', () => {
      const context = createMockContext();
      const routeSpan = startRouteSpan('designer-portal', 'GET', '/api/products/123', context);

      // Record cache hit
      recordCacheEvent(routeSpan, true, 'product:123');

      endSpanSuccess(routeSpan, 200);

      const events = (routeSpan as any)._getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].name).toBe('cache_hit');
      expect(events[0].attributes['cache.key']).toBe('product:123');
    });
  });
});
