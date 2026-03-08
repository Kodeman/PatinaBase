/**
 * Metrics Endpoint Middleware
 *
 * Provides a /metrics endpoint that exposes Prometheus-compatible metrics.
 * Should be deployed on a separate route for monitoring systems to scrape.
 *
 * @module with-metrics
 */

import { NextRequest } from 'next/server';
import { getMetricsCollector } from '../utils/metrics';

/**
 * Create a /metrics endpoint that exposes Prometheus metrics
 * Returns metrics in Prometheus text format for scraping by monitoring systems
 *
 * @returns Next.js route handler function
 *
 * @example
 * ```typescript
 * // In app/api/metrics/route.ts
 * import { createMetricsEndpoint } from '@patina/api-routes/middleware';
 *
 * export const GET = createMetricsEndpoint();
 * ```
 *
 * @example
 * ```bash
 * # Scrape metrics
 * curl http://localhost:3000/api/metrics
 *
 * # HELP api_routes_requests_total Total number of API route requests
 * # TYPE api_routes_requests_total counter
 * # api_routes_requests_total{method="GET",path="/api/products",status_code="200"} 42
 * ```
 */
export function createMetricsEndpoint() {
  return async (request: NextRequest) => {
    const collector = getMetricsCollector();
    const metrics = collector.getMetrics();

    return new Response(metrics, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  };
}
