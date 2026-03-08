/**
 * OpenTelemetry Tracing Utilities
 *
 * Provides distributed tracing capabilities for API routes using OpenTelemetry API.
 * Supports request tracing, proxy spans, retry tracking, circuit breaker events, and cache metrics.
 *
 * @module tracing
 */

import { trace, context, SpanStatusCode, type Span } from '@opentelemetry/api';
import type { RouteContext } from './request-context';

/**
 * Configuration for tracing
 */
export interface TracingConfig {
  /** Service name for tracer identification */
  serviceName: string;
  /** Whether tracing is enabled (default: true) */
  enabled?: boolean;
  /** Sample rate for trace collection (0.0 to 1.0, default: 1.0) */
  sampleRate?: number;
}

/**
 * Custom attributes for spans
 */
export interface SpanAttributes {
  [key: string]: string | number | boolean;
}

/**
 * Get or create a tracer for the current service
 *
 * @param config - Tracing configuration
 * @returns OpenTelemetry tracer instance or no-op tracer if disabled
 *
 * @example
 * ```typescript
 * const tracer = createTracer({
 *   serviceName: 'designer-portal',
 *   enabled: true,
 *   sampleRate: 1.0
 * });
 * ```
 */
export function createTracer(config: TracingConfig) {
  if (!config.enabled) {
    return createNoOpTracer();
  }
  return trace.getTracer(config.serviceName, '1.0.0');
}

/**
 * Start a span for an API route request
 * Records HTTP method, route path, request metadata, and user information
 *
 * @param tracerName - Name of the tracer (service name)
 * @param method - HTTP method (GET, POST, etc.)
 * @param path - Route path
 * @param context - Route context with request metadata
 * @returns Active span for the request
 *
 * @example
 * ```typescript
 * const span = startRouteSpan('designer-portal', 'GET', '/api/products', context);
 * try {
 *   // ... handle request
 *   endSpanSuccess(span, 200);
 * } catch (error) {
 *   endSpanError(span, error);
 * }
 * ```
 */
export function startRouteSpan(
  tracerName: string,
  method: string,
  path: string,
  routeContext: RouteContext
): Span {
  const tracer = trace.getTracer(tracerName);
  const span = tracer.startSpan(`${method} ${path}`, {
    attributes: {
      'http.method': method,
      'http.route': path,
      'http.request_id': routeContext.requestId,
      'http.client_ip': routeContext.ip,
      'http.user_agent': routeContext.userAgent || 'unknown',
    },
  });

  // Add user information if authenticated
  if (routeContext.user) {
    span.setAttribute('user.id', routeContext.user.id);
    span.setAttribute('user.role', routeContext.user.roles.join(','));
    span.setAttribute('user.email_verified', routeContext.user.emailVerified);
  }

  return span;
}

/**
 * Start a span for a proxy request to backend service
 * Creates a child span of the current active span
 *
 * @param parentSpan - Parent span (route span)
 * @param serviceName - Backend service name
 * @param method - HTTP method
 * @param url - Full backend URL
 * @returns Active span for the proxy request
 *
 * @example
 * ```typescript
 * const routeSpan = startRouteSpan('designer-portal', 'GET', '/api/products', context);
 * const proxySpan = startProxySpan(routeSpan, 'catalog', 'GET', 'http://catalog:3011/products');
 * ```
 */
export function startProxySpan(
  parentSpan: Span,
  serviceName: string,
  method: string,
  url: string
): Span {
  const tracer = trace.getTracer('api-routes-proxy');
  const span = tracer.startSpan(`proxy to ${serviceName}`, {
    attributes: {
      'service.name': serviceName,
      'http.method': method,
      'http.url': url,
      'span.kind': 'client',
    },
  });

  return span;
}

/**
 * Record a retry attempt in the span
 * Adds an event with attempt number and error message
 *
 * @param span - Active span
 * @param attempt - Retry attempt number (1-based)
 * @param error - Error that triggered the retry (optional)
 *
 * @example
 * ```typescript
 * for (let attempt = 1; attempt <= maxRetries; attempt++) {
 *   try {
 *     return await makeRequest();
 *   } catch (error) {
 *     recordRetryAttempt(span, attempt, error as Error);
 *   }
 * }
 * ```
 */
export function recordRetryAttempt(span: Span, attempt: number, error?: Error): void {
  span.addEvent('retry_attempt', {
    'retry.attempt': attempt,
    'retry.error': error?.message || 'unknown',
    'retry.error_name': error?.name || 'unknown',
  });
}

/**
 * Record circuit breaker state change in span
 * Adds an event when circuit breaker opens, closes, or enters half-open state
 *
 * @param span - Active span
 * @param serviceName - Backend service name
 * @param state - Circuit breaker state
 *
 * @example
 * ```typescript
 * if (failureRate > threshold) {
 *   recordCircuitBreakerEvent(span, 'catalog', 'OPEN');
 * }
 * ```
 */
export function recordCircuitBreakerEvent(
  span: Span,
  serviceName: string,
  state: 'OPEN' | 'CLOSED' | 'HALF_OPEN'
): void {
  span.addEvent('circuit_breaker_state_change', {
    'circuit_breaker.service': serviceName,
    'circuit_breaker.state': state,
  });
}

/**
 * Record cache hit or miss in span
 * Adds an event for cache operations
 *
 * @param span - Active span
 * @param hit - Whether cache hit occurred
 * @param key - Cache key (optional)
 *
 * @example
 * ```typescript
 * const cached = await cache.get(key);
 * recordCacheEvent(span, cached !== null, key);
 * ```
 */
export function recordCacheEvent(span: Span, hit: boolean, key?: string): void {
  span.addEvent(hit ? 'cache_hit' : 'cache_miss', {
    'cache.hit': hit,
    ...(key && { 'cache.key': key }),
  });
}

/**
 * End span with success status
 * Sets HTTP status code and marks span as successful
 *
 * @param span - Active span
 * @param statusCode - HTTP status code
 *
 * @example
 * ```typescript
 * const response = await handleRequest();
 * endSpanSuccess(span, 200);
 * return response;
 * ```
 */
export function endSpanSuccess(span: Span, statusCode: number): void {
  span.setAttribute('http.status_code', statusCode);
  span.setStatus({ code: SpanStatusCode.OK });
  span.end();
}

/**
 * End span with error status
 * Records exception and marks span as failed
 *
 * @param span - Active span
 * @param error - Error that occurred
 * @param statusCode - HTTP status code (optional)
 *
 * @example
 * ```typescript
 * try {
 *   await handleRequest();
 * } catch (error) {
 *   endSpanError(span, error as Error, 500);
 *   throw error;
 * }
 * ```
 */
export function endSpanError(span: Span, error: Error, statusCode?: number): void {
  span.recordException(error);
  span.setStatus({
    code: SpanStatusCode.ERROR,
    message: error.message,
  });
  if (statusCode) {
    span.setAttribute('http.status_code', statusCode);
  }
  span.end();
}

/**
 * Create no-op tracer for when tracing is disabled
 * Returns tracer with no-op implementations to avoid overhead
 *
 * @returns No-op tracer
 */
function createNoOpTracer() {
  return {
    startSpan: () => createNoOpSpan(),
  };
}

/**
 * Create no-op span
 * Returns span with no-op implementations to avoid overhead
 *
 * @returns No-op span
 */
function createNoOpSpan(): Span {
  return {
    spanContext: () => ({
      traceId: '',
      spanId: '',
      traceFlags: 0,
    }),
    setAttribute: () => ({} as Span),
    setAttributes: () => ({} as Span),
    addEvent: () => ({} as Span),
    setStatus: () => ({} as Span),
    updateName: () => ({} as Span),
    end: () => {},
    isRecording: () => false,
    recordException: () => {},
  };
}

/**
 * Export Span type for convenience
 */
export type { Span };
