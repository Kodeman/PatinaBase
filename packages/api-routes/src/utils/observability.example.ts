/**
 * Observability Integration Example
 *
 * This file demonstrates how to integrate OpenTelemetry tracing and Prometheus metrics
 * into your Next.js API routes using the @patina/api-routes package.
 *
 * @module observability.example
 */

import { NextRequest } from 'next/server';
import { createRouteHandler } from '../create-route-handler';
import { proxyToBackend } from '../middleware/proxy-to-backend';
import { createMetricsEndpoint } from '../middleware/with-metrics';
import { withAuth } from '../middleware/with-auth';
import {
  startRouteSpan,
  startProxySpan,
  recordRetryAttempt,
  recordCircuitBreakerEvent,
  recordCacheEvent,
  endSpanSuccess,
  endSpanError,
  createTracer,
} from './tracing';
import {
  getMetricsCollector,
  InMemoryMetricsCollector,
  setMetricsCollector,
} from './metrics';
import type { RouteContext } from './request-context';

// ============================================================================
// SETUP: Initialize OpenTelemetry (in your app initialization)
// ============================================================================

/**
 * Initialize OpenTelemetry with your preferred exporter
 * This should be done once at app startup
 */
export function initializeOpenTelemetry() {
  // Option 1: Use the default in-memory tracer (for development)
  const tracer = createTracer({
    serviceName: 'designer-portal',
    enabled: true,
    sampleRate: 1.0, // Sample 100% of traces
  });

  // Option 2: Set up with OpenTelemetry SDK (for production)
  // This requires installing @opentelemetry/sdk-trace-node
  /*
  import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
  import { registerInstrumentations } from '@opentelemetry/instrumentation';
  import { ConsoleSpanExporter, BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';

  const provider = new NodeTracerProvider({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'designer-portal',
    }),
  });

  // Use Console exporter for development
  provider.addSpanProcessor(new BatchSpanProcessor(new ConsoleSpanExporter()));

  // Or use OTLP exporter for production (sends to Jaeger, Zipkin, etc.)
  provider.addSpanProcessor(
    new BatchSpanProcessor(
      new OTLPTraceExporter({
        url: 'http://localhost:4318/v1/traces', // Your OTLP endpoint
      })
    )
  );

  provider.register();
  */
}

/**
 * Initialize metrics collector
 * This should be done once at app startup
 */
export function initializeMetrics() {
  // Use the default in-memory collector
  const collector = getMetricsCollector();

  // Or provide a custom collector that pushes to external service
  /*
  class PrometheusMetricsCollector implements MetricsCollector {
    // Custom implementation that pushes to Prometheus Pushgateway
    async flush() {
      const metrics = this.getMetrics();
      await fetch('http://pushgateway:9091/metrics/job/designer-portal', {
        method: 'POST',
        body: metrics,
      });
    }
  }

  setMetricsCollector(new PrometheusMetricsCollector());
  */
}

// ============================================================================
// EXAMPLE 1: Create /metrics endpoint
// ============================================================================

/**
 * Expose Prometheus metrics at /api/metrics
 * This endpoint should be scraped by your monitoring system
 */
export const GET = createMetricsEndpoint();

// Access at: http://localhost:3000/api/metrics
// Expected output:
// # HELP api_routes_requests_total Total number of API route requests
// # TYPE api_routes_requests_total counter
// api_routes_requests_total{method="GET",path="/api/products",status_code="200"} 42

// ============================================================================
// EXAMPLE 2: Add tracing to a simple API route
// ============================================================================

/**
 * Simple API route with tracing
 */
export const getProducts = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    // Start span for this request
    const span = startRouteSpan(
      'designer-portal',
      'GET',
      '/api/products',
      context
    );

    try {
      // Simulate cache check
      const cached = await checkCache('products');
      recordCacheEvent(span, cached !== null, 'products');

      if (cached) {
        endSpanSuccess(span, 200);
        return Response.json({ data: cached });
      }

      // Fetch data
      const products = await fetchProducts();

      // End span with success
      endSpanSuccess(span, 200);

      return Response.json({ data: products });
    } catch (error) {
      // End span with error
      endSpanError(span, error as Error, 500);
      throw error;
    }
  },
  { method: 'GET', path: '/api/products' }
);

// ============================================================================
// EXAMPLE 3: Add metrics to a route handler
// ============================================================================

/**
 * API route that records metrics
 */
export const createOrder = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    const startTime = Date.now();
    const collector = getMetricsCollector();

    try {
      const order = await processOrder(await request.json());

      // Record successful request
      const duration = Date.now() - startTime;
      collector.recordRequest('POST', '/api/orders', 201, duration);

      return Response.json({ data: order }, { status: 201 });
    } catch (error) {
      // Record failed request
      const duration = Date.now() - startTime;
      collector.recordRequest('POST', '/api/orders', 500, duration);

      throw error;
    }
  },
  { method: 'POST', path: '/api/orders' }
);

// ============================================================================
// EXAMPLE 4: Proxy with full observability
// ============================================================================

/**
 * Proxy route with tracing and metrics
 */
export const catalogProxy = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    const routeSpan = startRouteSpan(
      'designer-portal',
      request.method,
      '/api/catalog/products',
      context
    );

    const collector = getMetricsCollector();
    const startTime = Date.now();

    try {
      // Create proxy span
      const backendUrl = `${process.env.CATALOG_SERVICE_URL}/products`;
      const proxySpan = startProxySpan(
        routeSpan,
        'catalog',
        request.method,
        backendUrl
      );

      // Call backend with retry tracking
      let response;
      let retryCount = 0;

      while (retryCount < 3) {
        try {
          response = await fetch(backendUrl);
          if (response.ok) break;

          // Record retry
          retryCount++;
          recordRetryAttempt(proxySpan, retryCount);
          collector.recordRetry('catalog', retryCount);

          await new Promise((resolve) => setTimeout(resolve, 1000 * retryCount));
        } catch (error) {
          retryCount++;
          recordRetryAttempt(proxySpan, retryCount, error as Error);
          collector.recordRetry('catalog', retryCount);
        }
      }

      if (!response || !response.ok) {
        // Record circuit breaker opening
        recordCircuitBreakerEvent(proxySpan, 'catalog', 'OPEN');
        collector.recordCircuitBreakerState('catalog', 'OPEN');

        throw new Error('Catalog service unavailable');
      }

      // Record successful proxy request
      const duration = Date.now() - startTime;
      collector.recordProxyRequest('catalog', response.status, duration);
      collector.recordRequest(request.method, '/api/catalog/products', 200, duration);

      endSpanSuccess(proxySpan, response.status);
      endSpanSuccess(routeSpan, 200);

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      collector.recordRequest(request.method, '/api/catalog/products', 500, duration);

      endSpanError(routeSpan, error as Error, 500);
      throw error;
    }
  },
  { method: 'GET', path: '/api/catalog/products' }
);

// ============================================================================
// EXAMPLE 5: Using with existing proxy middleware
// ============================================================================

/**
 * The proxy middleware already includes observability hooks
 * You just need to configure tracing at startup
 */
export const catalogProxyWithMiddleware = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    return proxyToBackend(request, context, {
      service: {
        name: 'catalog',
        baseUrl: process.env.CATALOG_SERVICE_URL!,
      },
      retry: {
        maxRetries: 3,
        // Retry logic automatically records metrics and traces
      },
      circuitBreaker: {
        threshold: 5,
        timeout: 60000,
        // Circuit breaker state changes are automatically traced
      },
    });
  },
  { method: 'GET', path: '/api/catalog/products' }
);

// ============================================================================
// EXAMPLE 6: Custom metrics collector
// ============================================================================

/**
 * Example: Push metrics to external service
 */
class CustomMetricsCollector extends InMemoryMetricsCollector {
  private flushInterval: NodeJS.Timeout;

  constructor() {
    super();

    // Flush metrics every 60 seconds
    this.flushInterval = setInterval(() => {
      this.flush();
    }, 60000);
  }

  private async flush() {
    const metrics = this.getMetrics();

    // Push to Prometheus Pushgateway
    try {
      await fetch('http://pushgateway:9091/metrics/job/designer-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: metrics,
      });

      console.log('Metrics pushed to Pushgateway');
    } catch (error) {
      console.error('Failed to push metrics:', error);
    }
  }

  cleanup() {
    clearInterval(this.flushInterval);
  }
}

// Use custom collector
// setMetricsCollector(new CustomMetricsCollector());

// ============================================================================
// EXAMPLE 7: Distributed tracing across services
// ============================================================================

/**
 * Example: Propagate trace context to backend services
 */
export const distributedTracingExample = createRouteHandler(
  async (request: NextRequest, context: RouteContext) => {
    const routeSpan = startRouteSpan(
      'designer-portal',
      'GET',
      '/api/products',
      context
    );

    try {
      // Create span for catalog service call
      const catalogSpan = startProxySpan(
        routeSpan,
        'catalog',
        'GET',
        'http://catalog:3011/products'
      );

      // Extract trace context (requires OpenTelemetry SDK)
      // const traceContext = trace.getSpanContext(catalogSpan);

      // Forward trace context to backend
      const response = await fetch('http://catalog:3011/products', {
        headers: {
          // 'traceparent': `00-${traceContext.traceId}-${traceContext.spanId}-01`,
        },
      });

      endSpanSuccess(catalogSpan, response.status);

      // Create span for style-profile service call
      const styleSpan = startProxySpan(
        routeSpan,
        'style-profile',
        'GET',
        'http://style-profile:3012/preferences'
      );

      const styleResponse = await fetch('http://style-profile:3012/preferences');

      endSpanSuccess(styleSpan, styleResponse.status);
      endSpanSuccess(routeSpan, 200);

      // The full trace shows: Route -> Catalog + Style Profile
      return Response.json({ success: true });
    } catch (error) {
      endSpanError(routeSpan, error as Error, 500);
      throw error;
    }
  },
  { method: 'GET', path: '/api/products' }
);

// ============================================================================
// Helper functions (not exported, just for examples)
// ============================================================================

async function checkCache(key: string): Promise<any> {
  // Simulate cache lookup
  return null;
}

async function fetchProducts(): Promise<any[]> {
  // Simulate data fetching
  return [{ id: 1, name: 'Product 1' }];
}

async function processOrder(data: any): Promise<any> {
  // Simulate order processing
  return { id: 1, ...data };
}

// ============================================================================
// MONITORING & ALERTING
// ============================================================================

/**
 * Example Prometheus queries for alerting:
 *
 * 1. High error rate:
 *    rate(api_routes_requests_total{status_code=~"5.."}[5m]) > 0.05
 *
 * 2. High latency (P95):
 *    histogram_quantile(0.95, rate(api_routes_request_duration_ms[5m])) > 1000
 *
 * 3. Circuit breaker open:
 *    api_routes_circuit_breaker_state{state="OPEN"} == 1
 *
 * 4. High retry rate:
 *    rate(api_routes_retries_total[5m]) > 10
 *
 * 5. Low cache hit rate:
 *    rate(api_routes_cache_hits_total{hit="false"}[5m]) /
 *    rate(api_routes_cache_hits_total[5m]) > 0.5
 */

/**
 * Example Grafana dashboard panels:
 *
 * 1. Request Rate by Status Code:
 *    sum(rate(api_routes_requests_total[5m])) by (status_code)
 *
 * 2. Request Duration (P50, P95, P99):
 *    histogram_quantile(0.50, rate(api_routes_request_duration_ms[5m]))
 *    histogram_quantile(0.95, rate(api_routes_request_duration_ms[5m]))
 *    histogram_quantile(0.99, rate(api_routes_request_duration_ms[5m]))
 *
 * 3. Circuit Breaker State by Service:
 *    api_routes_circuit_breaker_state
 *
 * 4. Cache Hit Rate:
 *    sum(rate(api_routes_cache_hits_total{hit="true"}[5m])) /
 *    sum(rate(api_routes_cache_hits_total[5m]))
 *
 * 5. Proxy Requests by Service:
 *    sum(rate(api_routes_proxy_requests_total[5m])) by (service)
 */
