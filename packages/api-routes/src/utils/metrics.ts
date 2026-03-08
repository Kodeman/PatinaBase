/**
 * Prometheus-compatible Metrics Collection
 *
 * Provides in-memory metrics collection with Prometheus text format export.
 * Tracks request counts, durations, retries, circuit breaker state, cache hits, and proxy requests.
 *
 * @module metrics
 */

import type { RouteContext } from './request-context';

/**
 * Metrics collector interface
 * Allows custom implementations (e.g., push to external service)
 */
export interface MetricsCollector {
  /** Record an API route request */
  recordRequest(method: string, path: string, statusCode: number, duration: number): void;
  /** Record a retry attempt */
  recordRetry(serviceName: string, attempt: number): void;
  /** Record circuit breaker state change */
  recordCircuitBreakerState(serviceName: string, state: string): void;
  /** Record cache hit or miss */
  recordCacheHit(hit: boolean): void;
  /** Record proxy request to backend service */
  recordProxyRequest(serviceName: string, statusCode: number, duration: number): void;
  /** Get metrics in Prometheus format */
  getMetrics(): string;
  /** Reset all metrics (useful for testing) */
  reset(): void;
}

/**
 * Metric type definitions
 */
type MetricType = 'counter' | 'histogram' | 'gauge';

/**
 * Internal metric representation
 */
interface Metric {
  name: string;
  type: MetricType;
  help: string;
  labels: string[];
  values: Map<string, number>;
}

/**
 * In-memory metrics collector with Prometheus format export
 *
 * @example
 * ```typescript
 * const collector = new InMemoryMetricsCollector();
 * collector.recordRequest('GET', '/api/products', 200, 45);
 * collector.recordRequest('POST', '/api/products', 201, 120);
 * console.log(collector.getMetrics());
 * ```
 */
export class InMemoryMetricsCollector implements MetricsCollector {
  private metrics: Map<string, Metric> = new Map();

  constructor() {
    this.initializeMetrics();
  }

  /**
   * Initialize all metric definitions
   */
  private initializeMetrics(): void {
    // Request counter
    this.metrics.set('api_routes_requests_total', {
      name: 'api_routes_requests_total',
      type: 'counter',
      help: 'Total number of API route requests',
      labels: ['method', 'path', 'status_code'],
      values: new Map(),
    });

    // Request duration histogram
    this.metrics.set('api_routes_request_duration_ms', {
      name: 'api_routes_request_duration_ms',
      type: 'histogram',
      help: 'API route request duration in milliseconds',
      labels: ['method', 'path'],
      values: new Map(),
    });

    // Retry counter
    this.metrics.set('api_routes_retries_total', {
      name: 'api_routes_retries_total',
      type: 'counter',
      help: 'Total number of retry attempts',
      labels: ['service', 'attempt'],
      values: new Map(),
    });

    // Circuit breaker state gauge
    this.metrics.set('api_routes_circuit_breaker_state', {
      name: 'api_routes_circuit_breaker_state',
      type: 'gauge',
      help: 'Circuit breaker state (0=CLOSED, 1=OPEN, 2=HALF_OPEN)',
      labels: ['service'],
      values: new Map(),
    });

    // Cache hit counter
    this.metrics.set('api_routes_cache_hits_total', {
      name: 'api_routes_cache_hits_total',
      type: 'counter',
      help: 'Total cache hits',
      labels: ['hit'],
      values: new Map(),
    });

    // Proxy request counter
    this.metrics.set('api_routes_proxy_requests_total', {
      name: 'api_routes_proxy_requests_total',
      type: 'counter',
      help: 'Total proxy requests to backend services',
      labels: ['service', 'status_code'],
      values: new Map(),
    });

    // Proxy request duration
    this.metrics.set('api_routes_proxy_duration_ms', {
      name: 'api_routes_proxy_duration_ms',
      type: 'histogram',
      help: 'Proxy request duration in milliseconds',
      labels: ['service'],
      values: new Map(),
    });
  }

  /**
   * Record an API route request
   *
   * @param method - HTTP method
   * @param path - Route path
   * @param statusCode - HTTP status code
   * @param duration - Request duration in milliseconds
   *
   * @example
   * ```typescript
   * const start = Date.now();
   * const response = await handleRequest();
   * collector.recordRequest('GET', '/api/products', 200, Date.now() - start);
   * ```
   */
  recordRequest(method: string, path: string, statusCode: number, duration: number): void {
    this.incrementCounter('api_routes_requests_total', {
      method,
      path,
      status_code: String(statusCode),
    });
    this.recordHistogram('api_routes_request_duration_ms', { method, path }, duration);
  }

  /**
   * Record a retry attempt
   *
   * @param serviceName - Backend service name
   * @param attempt - Retry attempt number
   *
   * @example
   * ```typescript
   * for (let attempt = 1; attempt <= maxRetries; attempt++) {
   *   collector.recordRetry('catalog', attempt);
   *   try {
   *     return await makeRequest();
   *   } catch (error) {
   *     // ... handle error
   *   }
   * }
   * ```
   */
  recordRetry(serviceName: string, attempt: number): void {
    this.incrementCounter('api_routes_retries_total', {
      service: serviceName,
      attempt: String(attempt),
    });
  }

  /**
   * Record circuit breaker state change
   *
   * @param serviceName - Backend service name
   * @param state - Circuit breaker state
   *
   * @example
   * ```typescript
   * if (failureRate > threshold) {
   *   collector.recordCircuitBreakerState('catalog', 'OPEN');
   * }
   * ```
   */
  recordCircuitBreakerState(serviceName: string, state: string): void {
    const stateValue = state === 'CLOSED' ? 0 : state === 'OPEN' ? 1 : 2;
    this.setGauge('api_routes_circuit_breaker_state', { service: serviceName }, stateValue);
  }

  /**
   * Record cache hit or miss
   *
   * @param hit - Whether cache hit occurred
   *
   * @example
   * ```typescript
   * const cached = await cache.get(key);
   * collector.recordCacheHit(cached !== null);
   * ```
   */
  recordCacheHit(hit: boolean): void {
    this.incrementCounter('api_routes_cache_hits_total', { hit: String(hit) });
  }

  /**
   * Record proxy request to backend service
   *
   * @param serviceName - Backend service name
   * @param statusCode - HTTP status code
   * @param duration - Request duration in milliseconds
   *
   * @example
   * ```typescript
   * const start = Date.now();
   * const response = await fetch(backendUrl);
   * collector.recordProxyRequest('catalog', response.status, Date.now() - start);
   * ```
   */
  recordProxyRequest(serviceName: string, statusCode: number, duration: number): void {
    this.incrementCounter('api_routes_proxy_requests_total', {
      service: serviceName,
      status_code: String(statusCode),
    });
    this.recordHistogram('api_routes_proxy_duration_ms', { service: serviceName }, duration);
  }

  /**
   * Increment a counter metric
   */
  private incrementCounter(metricName: string, labels: Record<string, string>): void {
    const metric = this.metrics.get(metricName);
    if (!metric) return;

    const key = this.serializeLabels(labels);
    const current = metric.values.get(key) || 0;
    metric.values.set(key, current + 1);
  }

  /**
   * Set a gauge metric value
   */
  private setGauge(
    metricName: string,
    labels: Record<string, string>,
    value: number
  ): void {
    const metric = this.metrics.get(metricName);
    if (!metric) return;

    const key = this.serializeLabels(labels);
    metric.values.set(key, value);
  }

  /**
   * Record a histogram value
   * Simplified implementation - sums values for each label combination
   * In production, use proper histogram buckets
   */
  private recordHistogram(
    metricName: string,
    labels: Record<string, string>,
    value: number
  ): void {
    const metric = this.metrics.get(metricName);
    if (!metric) return;

    const key = this.serializeLabels(labels);
    const current = metric.values.get(key) || 0;
    metric.values.set(key, current + value);
  }

  /**
   * Serialize labels to a consistent string format
   * Sorts labels alphabetically for consistent keys
   */
  private serializeLabels(labels: Record<string, string>): string {
    return Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
  }

  /**
   * Get all metrics in Prometheus text format
   *
   * @returns Metrics in Prometheus format
   *
   * @example
   * ```typescript
   * const metrics = collector.getMetrics();
   * console.log(metrics);
   * // # HELP api_routes_requests_total Total number of API route requests
   * // # TYPE api_routes_requests_total counter
   * // api_routes_requests_total{method="GET",path="/api/products",status_code="200"} 42
   * ```
   */
  getMetrics(): string {
    let output = '';

    for (const [, metric] of this.metrics) {
      // Skip metrics with no data
      if (metric.values.size === 0) {
        continue;
      }

      output += `# HELP ${metric.name} ${metric.help}\n`;
      output += `# TYPE ${metric.name} ${metric.type}\n`;

      for (const [labels, value] of metric.values) {
        output += `${metric.name}{${labels}} ${value}\n`;
      }

      output += '\n';
    }

    return output.trim();
  }

  /**
   * Reset all metrics
   * Useful for testing or periodic resets
   *
   * @example
   * ```typescript
   * collector.reset();
   * ```
   */
  reset(): void {
    for (const [, metric] of this.metrics) {
      metric.values.clear();
    }
  }
}

/**
 * Global singleton metrics collector
 */
let globalCollector: MetricsCollector | null = null;

/**
 * Get the global metrics collector instance
 * Creates a new instance if none exists
 *
 * @returns Metrics collector instance
 *
 * @example
 * ```typescript
 * const collector = getMetricsCollector();
 * collector.recordRequest('GET', '/api/products', 200, 45);
 * ```
 */
export function getMetricsCollector(): MetricsCollector {
  if (!globalCollector) {
    globalCollector = new InMemoryMetricsCollector();
  }
  return globalCollector;
}

/**
 * Set a custom metrics collector
 * Allows using a different implementation (e.g., push to external service)
 *
 * @param collector - Custom metrics collector
 *
 * @example
 * ```typescript
 * class PrometheusMetricsCollector implements MetricsCollector {
 *   // ... custom implementation
 * }
 * setMetricsCollector(new PrometheusMetricsCollector());
 * ```
 */
export function setMetricsCollector(collector: MetricsCollector): void {
  globalCollector = collector;
}

/**
 * Reset the global metrics collector
 * Useful for testing
 *
 * @example
 * ```typescript
 * resetMetricsCollector();
 * ```
 */
export function resetMetricsCollector(): void {
  globalCollector = null;
}
