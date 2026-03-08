/**
 * Tests for metrics utilities
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  InMemoryMetricsCollector,
  getMetricsCollector,
  setMetricsCollector,
  resetMetricsCollector,
  type MetricsCollector,
} from '../metrics';

describe('InMemoryMetricsCollector', () => {
  let collector: InMemoryMetricsCollector;

  beforeEach(() => {
    collector = new InMemoryMetricsCollector();
  });

  describe('recordRequest', () => {
    it('should record request with method, path, and status code', () => {
      collector.recordRequest('GET', '/api/products', 200, 45);

      const metrics = collector.getMetrics();
      expect(metrics).toContain('api_routes_requests_total');
      expect(metrics).toContain('method="GET"');
      expect(metrics).toContain('path="/api/products"');
      expect(metrics).toContain('status_code="200"');
      expect(metrics).toContain('} 1');
    });

    it('should increment counter for multiple requests', () => {
      collector.recordRequest('GET', '/api/products', 200, 45);
      collector.recordRequest('GET', '/api/products', 200, 50);
      collector.recordRequest('GET', '/api/products', 200, 38);

      const metrics = collector.getMetrics();
      const match = metrics.match(/api_routes_requests_total\{.*\} (\d+)/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('3');
    });

    it('should track different endpoints separately', () => {
      collector.recordRequest('GET', '/api/products', 200, 45);
      collector.recordRequest('GET', '/api/orders', 200, 50);

      const metrics = collector.getMetrics();
      expect(metrics).toContain('path="/api/products"');
      expect(metrics).toContain('path="/api/orders"');
    });

    it('should track different HTTP methods separately', () => {
      collector.recordRequest('GET', '/api/products', 200, 45);
      collector.recordRequest('POST', '/api/products', 201, 120);
      collector.recordRequest('PUT', '/api/products/123', 200, 85);

      const metrics = collector.getMetrics();
      expect(metrics).toContain('method="GET"');
      expect(metrics).toContain('method="POST"');
      expect(metrics).toContain('method="PUT"');
    });

    it('should track different status codes separately', () => {
      collector.recordRequest('GET', '/api/products', 200, 45);
      collector.recordRequest('GET', '/api/products', 404, 12);
      collector.recordRequest('GET', '/api/products', 500, 8);

      const metrics = collector.getMetrics();
      expect(metrics).toContain('status_code="200"');
      expect(metrics).toContain('status_code="404"');
      expect(metrics).toContain('status_code="500"');
    });

    it('should record request duration', () => {
      collector.recordRequest('GET', '/api/products', 200, 45);

      const metrics = collector.getMetrics();
      expect(metrics).toContain('api_routes_request_duration_ms');
      expect(metrics).toContain('method="GET"');
      expect(metrics).toContain('path="/api/products"');
    });

    it('should sum durations for same endpoint', () => {
      collector.recordRequest('GET', '/api/products', 200, 45);
      collector.recordRequest('GET', '/api/products', 200, 55);

      const metrics = collector.getMetrics();
      const durationMatch = metrics.match(
        /api_routes_request_duration_ms\{method="GET",path="\/api\/products"\} (\d+)/
      );
      expect(durationMatch).not.toBeNull();
      expect(durationMatch![1]).toBe('100'); // 45 + 55
    });
  });

  describe('recordRetry', () => {
    it('should record retry attempt', () => {
      collector.recordRetry('catalog', 1);

      const metrics = collector.getMetrics();
      expect(metrics).toContain('api_routes_retries_total');
      expect(metrics).toContain('service="catalog"');
      expect(metrics).toContain('attempt="1"');
    });

    it('should track multiple retry attempts', () => {
      collector.recordRetry('catalog', 1);
      collector.recordRetry('catalog', 2);
      collector.recordRetry('catalog', 3);

      const metrics = collector.getMetrics();
      expect(metrics).toContain('attempt="1"');
      expect(metrics).toContain('attempt="2"');
      expect(metrics).toContain('attempt="3"');
    });

    it('should track retries per service', () => {
      collector.recordRetry('catalog', 1);
      collector.recordRetry('orders', 1);
      collector.recordRetry('search', 1);

      const metrics = collector.getMetrics();
      expect(metrics).toContain('service="catalog"');
      expect(metrics).toContain('service="orders"');
      expect(metrics).toContain('service="search"');
    });

    it('should increment counter for same attempt', () => {
      collector.recordRetry('catalog', 1);
      collector.recordRetry('catalog', 1);
      collector.recordRetry('catalog', 1);

      const metrics = collector.getMetrics();
      const match = metrics.match(/attempt="1".*\} (\d+)/);
      expect(match).not.toBeNull();
      expect(match![1]).toBe('3');
    });
  });

  describe('recordCircuitBreakerState', () => {
    it('should record CLOSED state as 0', () => {
      collector.recordCircuitBreakerState('catalog', 'CLOSED');

      const metrics = collector.getMetrics();
      expect(metrics).toContain('api_routes_circuit_breaker_state');
      expect(metrics).toContain('service="catalog"');
      expect(metrics).toContain('} 0');
    });

    it('should record OPEN state as 1', () => {
      collector.recordCircuitBreakerState('catalog', 'OPEN');

      const metrics = collector.getMetrics();
      expect(metrics).toContain('} 1');
    });

    it('should record HALF_OPEN state as 2', () => {
      collector.recordCircuitBreakerState('catalog', 'HALF_OPEN');

      const metrics = collector.getMetrics();
      expect(metrics).toContain('} 2');
    });

    it('should update state for same service', () => {
      collector.recordCircuitBreakerState('catalog', 'CLOSED');
      collector.recordCircuitBreakerState('catalog', 'OPEN');

      const metrics = collector.getMetrics();
      // Should only have one entry with latest state
      const matches = metrics.match(/api_routes_circuit_breaker_state\{service="catalog"\} (\d+)/g);
      expect(matches).toHaveLength(1);
      expect(matches![0]).toContain('} 1'); // OPEN
    });

    it('should track multiple services', () => {
      collector.recordCircuitBreakerState('catalog', 'OPEN');
      collector.recordCircuitBreakerState('orders', 'CLOSED');
      collector.recordCircuitBreakerState('search', 'HALF_OPEN');

      const metrics = collector.getMetrics();
      expect(metrics).toContain('service="catalog"} 1');
      expect(metrics).toContain('service="orders"} 0');
      expect(metrics).toContain('service="search"} 2');
    });
  });

  describe('recordCacheHit', () => {
    it('should record cache hit', () => {
      collector.recordCacheHit(true);

      const metrics = collector.getMetrics();
      expect(metrics).toContain('api_routes_cache_hits_total');
      expect(metrics).toContain('hit="true"');
    });

    it('should record cache miss', () => {
      collector.recordCacheHit(false);

      const metrics = collector.getMetrics();
      expect(metrics).toContain('hit="false"');
    });

    it('should count hits and misses separately', () => {
      collector.recordCacheHit(true);
      collector.recordCacheHit(true);
      collector.recordCacheHit(false);

      const metrics = collector.getMetrics();
      const hitMatch = metrics.match(/hit="true"\} (\d+)/);
      const missMatch = metrics.match(/hit="false"\} (\d+)/);

      expect(hitMatch![1]).toBe('2');
      expect(missMatch![1]).toBe('1');
    });
  });

  describe('recordProxyRequest', () => {
    it('should record proxy request', () => {
      collector.recordProxyRequest('catalog', 200, 45);

      const metrics = collector.getMetrics();
      expect(metrics).toContain('api_routes_proxy_requests_total');
      expect(metrics).toContain('service="catalog"');
      expect(metrics).toContain('status_code="200"');
    });

    it('should record proxy duration', () => {
      collector.recordProxyRequest('catalog', 200, 45);

      const metrics = collector.getMetrics();
      expect(metrics).toContain('api_routes_proxy_duration_ms');
      expect(metrics).toContain('service="catalog"');
    });

    it('should track multiple proxy requests', () => {
      collector.recordProxyRequest('catalog', 200, 45);
      collector.recordProxyRequest('catalog', 200, 55);
      collector.recordProxyRequest('orders', 201, 120);

      const metrics = collector.getMetrics();
      expect(metrics).toContain('service="catalog"');
      expect(metrics).toContain('service="orders"');
    });

    it('should track different status codes', () => {
      collector.recordProxyRequest('catalog', 200, 45);
      collector.recordProxyRequest('catalog', 404, 12);
      collector.recordProxyRequest('catalog', 500, 8);

      const metrics = collector.getMetrics();
      expect(metrics).toContain('status_code="200"');
      expect(metrics).toContain('status_code="404"');
      expect(metrics).toContain('status_code="500"');
    });

    it('should sum durations for same service', () => {
      collector.recordProxyRequest('catalog', 200, 45);
      collector.recordProxyRequest('catalog', 200, 55);

      const metrics = collector.getMetrics();
      const durationMatch = metrics.match(
        /api_routes_proxy_duration_ms\{service="catalog"\} (\d+)/
      );
      expect(durationMatch![1]).toBe('100'); // 45 + 55
    });
  });

  describe('getMetrics', () => {
    it('should return Prometheus text format', () => {
      collector.recordRequest('GET', '/api/products', 200, 45);

      const metrics = collector.getMetrics();

      // Check format
      expect(metrics).toContain('# HELP');
      expect(metrics).toContain('# TYPE');
      expect(metrics).toMatch(/\{.*\} \d+/);
    });

    it('should include HELP and TYPE for each metric', () => {
      collector.recordRequest('GET', '/api/products', 200, 45);

      const metrics = collector.getMetrics();

      expect(metrics).toContain('# HELP api_routes_requests_total');
      expect(metrics).toContain('# TYPE api_routes_requests_total counter');
      expect(metrics).toContain('# HELP api_routes_request_duration_ms');
      expect(metrics).toContain('# TYPE api_routes_request_duration_ms histogram');
    });

    it('should return empty string when no metrics recorded', () => {
      const metrics = collector.getMetrics();
      expect(metrics).toBe('');
    });

    it('should only include metrics with data', () => {
      collector.recordRequest('GET', '/api/products', 200, 45);

      const metrics = collector.getMetrics();

      // Should include request metrics
      expect(metrics).toContain('api_routes_requests_total');
      expect(metrics).toContain('api_routes_request_duration_ms');

      // Should not include metrics without data
      expect(metrics).not.toContain('api_routes_retries_total');
      expect(metrics).not.toContain('api_routes_circuit_breaker_state');
    });

    it('should sort labels alphabetically', () => {
      collector.recordRequest('GET', '/api/products', 200, 45);

      const metrics = collector.getMetrics();
      const labelMatch = metrics.match(/api_routes_requests_total\{([^}]+)\}/);

      expect(labelMatch).not.toBeNull();
      const labels = labelMatch![1];

      // Labels should be in alphabetical order
      const labelOrder = labels.split(',').map((l) => l.split('=')[0]);
      const expectedOrder = ['method', 'path', 'status_code'];
      expect(labelOrder).toEqual(expectedOrder);
    });

    it('should handle special characters in labels', () => {
      collector.recordRequest('GET', '/api/products?sort=name', 200, 45);

      const metrics = collector.getMetrics();
      expect(metrics).toContain('path="/api/products?sort=name"');
    });
  });

  describe('reset', () => {
    it('should clear all metrics', () => {
      collector.recordRequest('GET', '/api/products', 200, 45);
      collector.recordRetry('catalog', 1);
      collector.recordCacheHit(true);

      let metrics = collector.getMetrics();
      expect(metrics).not.toBe('');

      collector.reset();

      metrics = collector.getMetrics();
      expect(metrics).toBe('');
    });

    it('should allow recording after reset', () => {
      collector.recordRequest('GET', '/api/products', 200, 45);
      collector.reset();
      collector.recordRequest('POST', '/api/orders', 201, 120);

      const metrics = collector.getMetrics();
      expect(metrics).toContain('method="POST"');
      expect(metrics).toContain('path="/api/orders"');
      expect(metrics).not.toContain('method="GET"');
    });
  });

  describe('integration scenarios', () => {
    it('should track complete request lifecycle', () => {
      // Initial request
      collector.recordRequest('GET', '/api/products', 200, 45);

      // Proxy to backend
      collector.recordProxyRequest('catalog', 200, 40);

      // Cache hit on next request
      collector.recordCacheHit(true);
      collector.recordRequest('GET', '/api/products', 200, 5);

      const metrics = collector.getMetrics();

      // Should have 2 requests total
      const requestMatch = metrics.match(
        /api_routes_requests_total\{method="GET",path="\/api\/products",status_code="200"\} (\d+)/
      );
      expect(requestMatch![1]).toBe('2');

      // Should have 1 proxy request
      expect(metrics).toContain('api_routes_proxy_requests_total');

      // Should have 1 cache hit
      expect(metrics).toContain('api_routes_cache_hits_total{hit="true"} 1');
    });

    it('should track failed requests with retries', () => {
      // Retry attempts
      collector.recordRetry('catalog', 1);
      collector.recordRetry('catalog', 2);
      collector.recordRetry('catalog', 3);

      // Circuit breaker opens
      collector.recordCircuitBreakerState('catalog', 'OPEN');

      // Failed request
      collector.recordRequest('GET', '/api/products', 503, 120);

      const metrics = collector.getMetrics();

      // Should have 3 retry attempts
      expect(metrics).toContain('api_routes_retries_total');

      // Should have circuit breaker state
      expect(metrics).toContain('api_routes_circuit_breaker_state{service="catalog"} 1');

      // Should have failed request
      expect(metrics).toContain('status_code="503"');
    });

    it('should track multiple services', () => {
      collector.recordProxyRequest('catalog', 200, 45);
      collector.recordProxyRequest('orders', 201, 120);
      collector.recordProxyRequest('search', 200, 30);

      collector.recordCircuitBreakerState('catalog', 'CLOSED');
      collector.recordCircuitBreakerState('orders', 'CLOSED');
      collector.recordCircuitBreakerState('search', 'OPEN');

      const metrics = collector.getMetrics();

      expect(metrics).toContain('service="catalog"');
      expect(metrics).toContain('service="orders"');
      expect(metrics).toContain('service="search"');
    });
  });
});

describe('global metrics collector', () => {
  afterEach(() => {
    resetMetricsCollector();
  });

  describe('getMetricsCollector', () => {
    it('should return singleton instance', () => {
      const collector1 = getMetricsCollector();
      const collector2 = getMetricsCollector();

      expect(collector1).toBe(collector2);
    });

    it('should create instance on first call', () => {
      const collector = getMetricsCollector();
      expect(collector).toBeInstanceOf(InMemoryMetricsCollector);
    });

    it('should persist metrics across calls', () => {
      const collector1 = getMetricsCollector();
      collector1.recordRequest('GET', '/api/products', 200, 45);

      const collector2 = getMetricsCollector();
      const metrics = collector2.getMetrics();

      expect(metrics).toContain('api_routes_requests_total');
    });
  });

  describe('setMetricsCollector', () => {
    it('should allow custom collector', () => {
      const customCollector: MetricsCollector = {
        recordRequest: () => {},
        recordRetry: () => {},
        recordCircuitBreakerState: () => {},
        recordCacheHit: () => {},
        recordProxyRequest: () => {},
        getMetrics: () => 'custom metrics',
        reset: () => {},
      };

      setMetricsCollector(customCollector);
      const collector = getMetricsCollector();

      expect(collector.getMetrics()).toBe('custom metrics');
    });

    it('should replace existing collector', () => {
      const collector1 = getMetricsCollector();
      collector1.recordRequest('GET', '/api/products', 200, 45);

      const customCollector: MetricsCollector = {
        recordRequest: () => {},
        recordRetry: () => {},
        recordCircuitBreakerState: () => {},
        recordCacheHit: () => {},
        recordProxyRequest: () => {},
        getMetrics: () => 'custom',
        reset: () => {},
      };

      setMetricsCollector(customCollector);
      const collector2 = getMetricsCollector();

      expect(collector2.getMetrics()).toBe('custom');
    });
  });

  describe('resetMetricsCollector', () => {
    it('should clear global instance', () => {
      const collector1 = getMetricsCollector();
      collector1.recordRequest('GET', '/api/products', 200, 45);

      resetMetricsCollector();

      const collector2 = getMetricsCollector();
      const metrics = collector2.getMetrics();

      expect(metrics).toBe('');
    });

    it('should create new instance after reset', () => {
      const collector1 = getMetricsCollector();
      resetMetricsCollector();
      const collector2 = getMetricsCollector();

      expect(collector1).not.toBe(collector2);
    });
  });
});
