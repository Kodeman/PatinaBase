# Circuit Breaker Pattern

Enterprise-grade circuit breaker implementation for protecting backend microservices from cascading failures in the Patina platform.

## Table of Contents

- [Overview](#overview)
- [How It Works](#how-it-works)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [State Transitions](#state-transitions)
- [API Reference](#api-reference)
- [Usage Examples](#usage-examples)
- [Best Practices](#best-practices)
- [Monitoring](#monitoring)
- [Testing](#testing)

## Overview

The circuit breaker pattern prevents cascading failures by monitoring service health and temporarily blocking requests to failing services. When a service fails repeatedly, the circuit "opens" and immediately rejects requests without attempting to call the failing service. After a timeout period, it enters a "half-open" state to test if the service has recovered.

### Key Features

- **Three-state pattern**: CLOSED → OPEN → HALF_OPEN → CLOSED
- **Per-service isolation**: Each backend service gets its own circuit breaker instance
- **Automatic recovery**: Tests service health and auto-recovers when ready
- **Thread-safe**: Handles concurrent requests correctly
- **Comprehensive metrics**: Tracks failures, successes, and state transitions
- **Event callbacks**: Monitor state changes and failures in real-time
- **Zero dependencies**: Lightweight implementation

### Benefits

- Prevents cascading failures across microservices
- Improves system resilience and fault tolerance
- Provides clear service health visibility
- Reduces load on failing services
- Enables graceful degradation

## How It Works

### State Machine

```
┌─────────┐
│ CLOSED  │ ◄─────────────────┐
│ (Normal)│                   │
└────┬────┘                   │
     │                        │
     │ Failures ≥ threshold   │ Successes ≥ threshold
     │                        │ (in HALF_OPEN)
     ▼                        │
┌─────────┐                   │
│  OPEN   │                   │
│ (Block) │                   │
└────┬────┘                   │
     │                        │
     │ After reset timeout    │
     │                        │
     ▼                        │
┌───────────┐                 │
│ HALF_OPEN │─────────────────┘
│  (Test)   │
└───────────┘
     │
     │ Failure
     │
     ▼
   (Back to OPEN)
```

### States

1. **CLOSED** (Normal Operation)
   - All requests pass through
   - Tracks consecutive failures
   - Opens circuit when failure threshold reached

2. **OPEN** (Circuit Open)
   - All requests rejected immediately with `CircuitBreakerOpenError`
   - No load on failing service
   - Schedules automatic transition to HALF_OPEN after reset timeout

3. **HALF_OPEN** (Testing Recovery)
   - Allows limited concurrent test requests
   - If tests succeed → transition to CLOSED
   - If any test fails → immediately back to OPEN

## Installation

The circuit breaker is part of the `@patina/api-routes` package:

```bash
pnpm add @patina/api-routes
```

## Quick Start

```typescript
import { getCircuitBreaker } from '@patina/api-routes/utils';

// Get circuit breaker for a service
const breaker = getCircuitBreaker('catalog-service');

// Execute a request through the circuit breaker
try {
  const result = await breaker.execute(
    async () => {
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
    // Service unavailable - return cached data or fallback
    console.error('Circuit open, service unavailable');
  } else {
    // Other error - handle normally
    throw error;
  }
}
```

## Configuration

### Default Configuration

```typescript
{
  failureThreshold: 5,      // Open after 5 consecutive failures
  successThreshold: 2,      // Close after 2 consecutive successes
  resetTimeout: 60000,      // 1 minute (in milliseconds)
  halfOpenRequests: 1,      // 1 concurrent test request
  monitoringWindow: 10000   // 10 seconds (in milliseconds)
}
```

### Custom Configuration

```typescript
const breaker = getCircuitBreaker('my-service', {
  failureThreshold: 3,      // More sensitive - open after 3 failures
  successThreshold: 3,      // More conservative - need 3 successes
  resetTimeout: 30000,      // Faster recovery - 30 seconds
  halfOpenRequests: 2,      // Allow 2 test requests
  monitoringWindow: 5000    // 5 second window
});
```

### Configuration Guidelines

- **failureThreshold**: Lower = more sensitive to failures
- **successThreshold**: Higher = more conservative recovery
- **resetTimeout**: Balance between fast recovery and avoiding overload
- **halfOpenRequests**: Usually 1-3, more for high-traffic services
- **monitoringWindow**: Window for calculating rates

## State Transitions

### CLOSED → OPEN

Triggered when consecutive failures reach `failureThreshold`:

```typescript
// Simulate 5 consecutive failures
for (let i = 0; i < 5; i++) {
  try {
    await breaker.execute(failingFunction, context);
  } catch (error) {
    // Failure counted
  }
}

// Circuit is now OPEN
console.log(breaker.getState()); // CircuitState.OPEN
```

### OPEN → HALF_OPEN

Automatic after `resetTimeout` milliseconds:

```typescript
// Circuit opens
console.log(breaker.getState()); // CircuitState.OPEN

// Wait for reset timeout
await new Promise(resolve => setTimeout(resolve, 60000));

// Next request triggers transition
await breaker.execute(testFunction, context);
console.log(breaker.getState()); // CircuitState.HALF_OPEN
```

### HALF_OPEN → CLOSED

After `successThreshold` consecutive successes:

```typescript
// In HALF_OPEN state
for (let i = 0; i < 2; i++) {
  await breaker.execute(successFunction, context);
}

// Circuit is now CLOSED
console.log(breaker.getState()); // CircuitState.CLOSED
```

### HALF_OPEN → OPEN

Immediately on any failure:

```typescript
// In HALF_OPEN state
try {
  await breaker.execute(failingFunction, context);
} catch (error) {
  // Circuit immediately reopens
  console.log(breaker.getState()); // CircuitState.OPEN
}
```

## API Reference

### `CircuitBreaker`

Main circuit breaker class.

#### Constructor

```typescript
constructor(serviceName: string, config?: Partial<CircuitBreakerConfig>)
```

#### Methods

##### `execute<T>(fn, context)`

Execute a function through the circuit breaker.

```typescript
async execute<T>(
  fn: () => Promise<T>,
  context: CircuitBreakerContext
): Promise<T>
```

**Parameters:**
- `fn`: Async function to execute
- `context`: Execution context with method, url, requestId

**Returns:** Promise that resolves with function result

**Throws:**
- `CircuitBreakerOpenError` if circuit is OPEN
- Original error if function fails

##### `getState()`

Get current circuit state.

```typescript
getState(): CircuitState
```

##### `getMetrics()`

Get current metrics.

```typescript
getMetrics(): CircuitBreakerMetrics
```

**Returns:**
```typescript
{
  state: CircuitState;
  failureCount: number;
  successCount: number;
  lastFailureTime?: Date;
  lastSuccessTime?: Date;
  totalRequests: number;
  totalFailures: number;
  totalSuccesses: number;
  nextResetAttempt?: Date;
}
```

##### `reset()`

Reset circuit breaker to initial CLOSED state.

```typescript
reset(): void
```

##### `onStateChange(callback)`

Register callback for state changes.

```typescript
onStateChange(callback: (
  oldState: CircuitState,
  newState: CircuitState,
  metrics: CircuitBreakerMetrics
) => void): void
```

##### `onFailureCallback(callback)`

Register callback for failures.

```typescript
onFailureCallback(callback: (
  error: Error,
  context: CircuitBreakerContext
) => void): void
```

### `CircuitBreakerRegistry`

Singleton registry managing circuit breakers per service.

#### Methods

##### `getInstance()`

Get singleton instance.

```typescript
static getInstance(): CircuitBreakerRegistry
```

##### `getCircuitBreaker(serviceName, config?)`

Get or create circuit breaker for a service.

```typescript
getCircuitBreaker(
  serviceName: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker
```

##### `getAllMetrics()`

Get metrics for all services.

```typescript
getAllMetrics(): Map<string, CircuitBreakerMetrics>
```

##### `resetAll()`

Reset all circuit breakers.

```typescript
resetAll(): void
```

##### `remove(serviceName)`

Remove a circuit breaker.

```typescript
remove(serviceName: string): boolean
```

##### `clear()`

Clear all circuit breakers.

```typescript
clear(): void
```

### `getCircuitBreaker()`

Convenience function to get circuit breaker from global registry.

```typescript
function getCircuitBreaker(
  serviceName: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker
```

### Types

```typescript
enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  resetTimeout: number;
  halfOpenRequests: number;
  monitoringWindow: number;
}

interface CircuitBreakerContext {
  method: string;
  url: string;
  requestId: string;
}

class CircuitBreakerOpenError extends Error {
  serviceName: string;
  resetTime: Date;
  currentState: CircuitState;
}
```

## Usage Examples

See [circuit-breaker.example.ts](./src/utils/circuit-breaker.example.ts) for comprehensive examples including:

1. Basic usage with default configuration
2. Custom configuration
3. Monitoring with callbacks
4. Next.js API route integration
5. Registry management
6. Graceful degradation pattern
7. Health check endpoint

## Best Practices

### 1. Service-Specific Configuration

Different services have different characteristics:

```typescript
// Fast, reliable service - more sensitive
const authBreaker = getCircuitBreaker('auth-service', {
  failureThreshold: 3,
  resetTimeout: 30000
});

// Slow, external service - more tolerant
const externalBreaker = getCircuitBreaker('external-api', {
  failureThreshold: 10,
  resetTimeout: 120000
});
```

### 2. Graceful Degradation

Always have a fallback:

```typescript
try {
  return await breaker.execute(fetchFromService, context);
} catch (error) {
  if (error instanceof CircuitBreakerOpenError) {
    // Try cache first
    const cached = await getFromCache();
    if (cached) return cached;

    // Return degraded response
    return { data: [], _degraded: true };
  }
  throw error;
}
```

### 3. Monitor State Changes

Log and alert on state changes:

```typescript
breaker.onStateChange((oldState, newState, metrics) => {
  if (newState === CircuitState.OPEN) {
    logger.error('Circuit breaker opened', { metrics });
    alerting.sendAlert('Service degraded');
  }

  if (newState === CircuitState.CLOSED && oldState === CircuitState.HALF_OPEN) {
    logger.info('Service recovered', { metrics });
  }
});
```

### 4. Include Request Context

Always provide meaningful context:

```typescript
await breaker.execute(fn, {
  method: request.method,
  url: request.url,
  requestId: request.headers.get('x-request-id') || crypto.randomUUID()
});
```

### 5. Use Registry for Health Checks

```typescript
export async function GET() {
  const registry = CircuitBreakerRegistry.getInstance();
  const metrics = registry.getAllMetrics();

  const services = Array.from(metrics.entries()).map(([name, m]) => ({
    name,
    healthy: m.state === CircuitState.CLOSED,
    metrics: m
  }));

  return Response.json({
    healthy: services.every(s => s.healthy),
    services
  });
}
```

## Monitoring

### Metrics to Track

1. **Circuit State**: Current state per service
2. **Success Rate**: `totalSuccesses / totalRequests`
3. **Failure Rate**: `totalFailures / totalRequests`
4. **State Change Frequency**: How often circuits open/close
5. **Time in OPEN**: How long services are unavailable

### Example Monitoring Dashboard

```typescript
function getServiceHealth() {
  const registry = CircuitBreakerRegistry.getInstance();
  const allMetrics = registry.getAllMetrics();

  return Array.from(allMetrics.entries()).map(([name, metrics]) => {
    const successRate = metrics.totalRequests > 0
      ? (metrics.totalSuccesses / metrics.totalRequests * 100)
      : 100;

    return {
      service: name,
      state: metrics.state,
      healthy: metrics.state === CircuitState.CLOSED,
      successRate: successRate.toFixed(2) + '%',
      totalRequests: metrics.totalRequests,
      lastFailure: metrics.lastFailureTime,
      nextReset: metrics.nextResetAttempt
    };
  });
}
```

### Alerting Rules

```typescript
breaker.onStateChange((oldState, newState, metrics) => {
  // Alert on circuit opening
  if (newState === CircuitState.OPEN) {
    sendAlert('CRITICAL', `Circuit breaker opened for ${serviceName}`);
  }

  // Alert if circuit flaps (opens/closes repeatedly)
  if (isFlapping(serviceName)) {
    sendAlert('WARNING', `Circuit breaker flapping for ${serviceName}`);
  }

  // Log recovery
  if (newState === CircuitState.CLOSED && oldState === CircuitState.HALF_OPEN) {
    logRecovery(serviceName, metrics);
  }
});
```

## Testing

### Unit Tests

The circuit breaker has 98.86% test coverage. See [circuit-breaker.test.ts](./src/utils/__tests__/circuit-breaker.test.ts).

### Testing Your Integration

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getCircuitBreaker, CircuitBreakerRegistry } from '@patina/api-routes/utils';

describe('My Service Integration', () => {
  beforeEach(() => {
    // Start with clean slate
    CircuitBreakerRegistry.getInstance().clear();
  });

  it('should use circuit breaker for service calls', async () => {
    const breaker = getCircuitBreaker('test-service', {
      failureThreshold: 2,
      resetTimeout: 1000
    });

    // Simulate failures
    const mockFn = vi.fn().mockRejectedValue(new Error('fail'));

    await expect(breaker.execute(mockFn, context)).rejects.toThrow();
    await expect(breaker.execute(mockFn, context)).rejects.toThrow();

    // Circuit should be open
    expect(breaker.getState()).toBe(CircuitState.OPEN);
  });
});
```

## Performance Characteristics

- **Memory**: ~1KB per circuit breaker instance
- **CPU**: Negligible overhead (simple state machine)
- **Thread-safe**: Safe for concurrent requests
- **Latency**: <1ms overhead per request

## Troubleshooting

### Circuit Opens Too Frequently

- Increase `failureThreshold`
- Increase `resetTimeout`
- Check if service is actually unhealthy

### Circuit Doesn't Open When Expected

- Check that errors are actually being thrown
- Verify `failureThreshold` configuration
- Ensure not resetting failure count with intermittent successes

### Circuit Stays Open Too Long

- Decrease `resetTimeout`
- Decrease `successThreshold` in HALF_OPEN

### Too Many Test Requests in HALF_OPEN

- Increase `halfOpenRequests` for high-traffic services
- Add queuing/backpressure before circuit breaker

## License

MIT

## Contributing

See main [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.
