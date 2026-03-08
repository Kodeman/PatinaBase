/**
 * Circuit Breaker Usage Examples
 *
 * This file demonstrates how to use the circuit breaker pattern
 * to protect backend services from cascading failures.
 */

import {
  getCircuitBreaker,
  CircuitBreakerRegistry,
  CircuitState,
  CircuitBreakerOpenError
} from './circuit-breaker';

import type { CircuitBreakerConfig } from './circuit-breaker';

// ============================================================================
// Example 1: Basic Usage with Default Configuration
// ============================================================================

async function basicExample() {
  // Get circuit breaker for a service (creates new or returns existing)
  const breaker = getCircuitBreaker('catalog-service');

  try {
    const result = await breaker.execute(
      async () => {
        // Your API call here
        const response = await fetch('http://catalog:3011/api/products');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      },
      {
        method: 'GET',
        url: '/api/products',
        requestId: 'req-123'
      }
    );

    console.log('Success:', result);
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      console.error('Service unavailable:', error.serviceName);
      console.error('Retry after:', error.resetTime);
      // Return cached data or fallback response
    } else {
      console.error('Request failed:', error);
    }
  }
}

// ============================================================================
// Example 2: Custom Configuration
// ============================================================================

async function customConfigExample() {
  const breaker = getCircuitBreaker('projects-service', {
    failureThreshold: 3,      // Open after 3 consecutive failures
    successThreshold: 2,      // Close after 2 consecutive successes in half-open
    resetTimeout: 30000,      // Try recovery after 30 seconds
    halfOpenRequests: 2,      // Allow 2 concurrent test requests in half-open
    monitoringWindow: 10000   // 10 second monitoring window
  });

  const result = await breaker.execute(
    async () => {
      const response = await fetch('http://projects:3016/api/projects/123');
      return response.json();
    },
    {
      method: 'GET',
      url: '/api/projects/123',
      requestId: 'req-456'
    }
  );

  return result;
}

// ============================================================================
// Example 3: Monitoring Circuit Breaker State
// ============================================================================

function monitoringExample() {
  const breaker = getCircuitBreaker('user-management-service');

  // Listen for state changes
  breaker.onStateChange((oldState, newState, metrics) => {
    console.log(`Circuit breaker transitioned: ${oldState} → ${newState}`);
    console.log('Metrics:', {
      failureCount: metrics.failureCount,
      successCount: metrics.successCount,
      totalRequests: metrics.totalRequests,
      totalFailures: metrics.totalFailures,
      totalSuccesses: metrics.totalSuccesses
    });

    // Alert if circuit opens
    if (newState === CircuitState.OPEN) {
      // Send alert to monitoring system
      console.error('⚠️ Circuit breaker OPEN - service degraded');
    }

    // Log recovery
    if (newState === CircuitState.CLOSED && oldState === CircuitState.HALF_OPEN) {
      console.log('✅ Circuit breaker CLOSED - service recovered');
    }
  });

  // Listen for failures
  breaker.onFailureCallback((error, context) => {
    console.error('Request failed:', {
      error: error.message,
      method: context.method,
      url: context.url,
      requestId: context.requestId
    });
  });

  // Get current metrics
  const metrics = breaker.getMetrics();
  console.log('Current state:', metrics.state);
  console.log('Failure rate:',
    metrics.totalRequests > 0
      ? (metrics.totalFailures / metrics.totalRequests * 100).toFixed(2) + '%'
      : '0%'
  );
}

// ============================================================================
// Example 4: Next.js API Route Integration
// ============================================================================

import { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const breaker = getCircuitBreaker('catalog-service');

  try {
    const products = await breaker.execute(
      async () => {
        const response = await fetch('http://catalog:3011/api/products', {
          headers: {
            'x-request-id': requestId,
            'authorization': request.headers.get('authorization') || ''
          }
        });

        if (!response.ok) {
          throw new Error(`Catalog service error: ${response.status}`);
        }

        return response.json();
      },
      {
        method: 'GET',
        url: '/api/products',
        requestId
      }
    );

    return Response.json({ data: products });
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      // Service is down, return cached or degraded response
      return Response.json(
        {
          error: 'Service temporarily unavailable',
          code: 'SERVICE_UNAVAILABLE',
          retryAfter: error.resetTime.toISOString()
        },
        { status: 503 }
      );
    }

    // Other errors
    return Response.json(
      {
        error: 'Internal server error',
        code: 'INTERNAL_ERROR'
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// Example 5: Registry Management
// ============================================================================

function registryExample() {
  const registry = CircuitBreakerRegistry.getInstance();

  // Get all service metrics
  const allMetrics = registry.getAllMetrics();

  console.log('=== Circuit Breaker Health Dashboard ===');
  allMetrics.forEach((metrics, serviceName) => {
    const status = metrics.state === CircuitState.CLOSED ? '✅' :
                   metrics.state === CircuitState.HALF_OPEN ? '⚠️' : '❌';

    console.log(`${status} ${serviceName}:`);
    console.log(`   State: ${metrics.state}`);
    console.log(`   Success Rate: ${
      metrics.totalRequests > 0
        ? ((metrics.totalSuccesses / metrics.totalRequests) * 100).toFixed(1)
        : '0'
    }%`);
    console.log(`   Total Requests: ${metrics.totalRequests}`);

    if (metrics.nextResetAttempt) {
      console.log(`   Reset Attempt: ${metrics.nextResetAttempt.toISOString()}`);
    }
  });

  // Reset all circuit breakers (useful for testing)
  // registry.resetAll();

  // Remove specific service
  // registry.remove('catalog-service');
}

// ============================================================================
// Example 6: Graceful Degradation Pattern
// ============================================================================

interface Product {
  id: string;
  name: string;
  price: number;
}

async function gracefulDegradationExample(productId: string): Promise<Product | null> {
  const breaker = getCircuitBreaker('catalog-service');

  try {
    // Try primary service
    return await breaker.execute(
      async () => {
        const response = await fetch(`http://catalog:3011/api/products/${productId}`);
        if (!response.ok) throw new Error('Not found');
        return response.json();
      },
      {
        method: 'GET',
        url: `/api/products/${productId}`,
        requestId: crypto.randomUUID()
      }
    );
  } catch (error) {
    if (error instanceof CircuitBreakerOpenError) {
      console.log('Primary service down, using cache...');

      // Try cache
      const cached = await getCachedProduct(productId);
      if (cached) {
        return cached;
      }

      // No cache, return degraded response
      console.log('No cache available, returning degraded response');
      return null;
    }

    throw error;
  }
}

async function getCachedProduct(_productId: string): Promise<Product | null> {
  // Implementation would fetch from Redis or similar
  return null;
}

// ============================================================================
// Example 7: Health Check Endpoint
// ============================================================================

export async function healthCheckHandler() {
  const registry = CircuitBreakerRegistry.getInstance();
  const allMetrics = registry.getAllMetrics();

  const services = Array.from(allMetrics.entries()).map(([name, metrics]) => ({
    name,
    status: metrics.state,
    healthy: metrics.state === CircuitState.CLOSED,
    metrics: {
      successRate: metrics.totalRequests > 0
        ? ((metrics.totalSuccesses / metrics.totalRequests) * 100).toFixed(2)
        : '100.00',
      totalRequests: metrics.totalRequests,
      totalFailures: metrics.totalFailures,
      lastFailure: metrics.lastFailureTime?.toISOString(),
      nextReset: metrics.nextResetAttempt?.toISOString()
    }
  }));

  const allHealthy = services.every(s => s.healthy);

  return Response.json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    services
  }, {
    status: allHealthy ? 200 : 503
  });
}

// Export examples for testing
export {
  basicExample,
  customConfigExample,
  monitoringExample,
  registryExample,
  gracefulDegradationExample
};
