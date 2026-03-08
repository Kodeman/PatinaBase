/**
 * Circuit Breaker Tests
 *
 * Comprehensive test suite for circuit breaker pattern implementation.
 * Tests all state transitions, concurrent requests, metrics, and edge cases.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitState,
  CircuitBreakerOpenError,
  getCircuitBreaker,
  type CircuitBreakerContext
} from '../circuit-breaker';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;
  const mockContext: CircuitBreakerContext = {
    method: 'GET',
    url: '/api/test',
    requestId: 'test-req-123'
  };

  beforeEach(() => {
    breaker = new CircuitBreaker('test-service', {
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeout: 1000, // 1 second for faster tests
      halfOpenRequests: 1,
      monitoringWindow: 5000
    });
  });

  afterEach(() => {
    breaker.reset();
  });

  describe('CLOSED state (normal operation)', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should execute successful requests', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      const result = await breaker.execute(mockFn, mockContext);

      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledTimes(1);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should track successful requests in metrics', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');

      await breaker.execute(mockFn, mockContext);
      await breaker.execute(mockFn, mockContext);

      const metrics = breaker.getMetrics();
      expect(metrics.totalRequests).toBe(2);
      expect(metrics.totalSuccesses).toBe(2);
      expect(metrics.totalFailures).toBe(0);
      expect(metrics.lastSuccessTime).toBeInstanceOf(Date);
    });

    it('should reset failure count on success', async () => {
      const mockFn = vi.fn()
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue('success');

      await expect(breaker.execute(mockFn, mockContext)).rejects.toThrow('fail');
      expect(breaker.getMetrics().failureCount).toBe(1);

      await breaker.execute(mockFn, mockContext);
      expect(breaker.getMetrics().failureCount).toBe(0);
    });

    it('should handle errors and track failures', async () => {
      const error = new Error('Service unavailable');
      const mockFn = vi.fn().mockRejectedValue(error);

      await expect(breaker.execute(mockFn, mockContext)).rejects.toThrow('Service unavailable');

      const metrics = breaker.getMetrics();
      expect(metrics.totalFailures).toBe(1);
      expect(metrics.failureCount).toBe(1);
      expect(metrics.lastFailureTime).toBeInstanceOf(Date);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('CLOSED → OPEN transition', () => {
    it('should transition to OPEN after reaching failure threshold', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));
      const stateChangeCallback = vi.fn();
      breaker.onStateChange(stateChangeCallback);

      // Execute 3 failing requests (threshold is 3)
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn, mockContext)).rejects.toThrow('fail');
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
      expect(stateChangeCallback).toHaveBeenCalledWith(
        CircuitState.CLOSED,
        CircuitState.OPEN,
        expect.objectContaining({ state: CircuitState.OPEN })
      );
    });

    it('should set nextResetAttempt when opening circuit', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));
      const beforeOpen = Date.now();

      // Trigger circuit open
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn, mockContext)).rejects.toThrow('fail');
      }

      const metrics = breaker.getMetrics();
      expect(metrics.nextResetAttempt).toBeInstanceOf(Date);
      expect(metrics.nextResetAttempt!.getTime()).toBeGreaterThanOrEqual(beforeOpen + 1000);
    });

    it('should emit failure callbacks on each failure', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));
      const failureCallback = vi.fn();
      breaker.onFailureCallback(failureCallback);

      await expect(breaker.execute(mockFn, mockContext)).rejects.toThrow('fail');
      await expect(breaker.execute(mockFn, mockContext)).rejects.toThrow('fail');

      expect(failureCallback).toHaveBeenCalledTimes(2);
      expect(failureCallback).toHaveBeenCalledWith(
        expect.any(Error),
        mockContext
      );
    });
  });

  describe('OPEN state', () => {
    beforeEach(async () => {
      // Force circuit to OPEN state
      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn, mockContext)).rejects.toThrow();
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should reject all requests immediately', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');

      await expect(breaker.execute(mockFn, mockContext))
        .rejects.toThrow(CircuitBreakerOpenError);

      // Function should never be called
      expect(mockFn).not.toHaveBeenCalled();
    });

    it('should throw CircuitBreakerOpenError with service details', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');

      try {
        await breaker.execute(mockFn, mockContext);
        expect.fail('Should have thrown CircuitBreakerOpenError');
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitBreakerOpenError);
        const cbError = error as CircuitBreakerOpenError;
        expect(cbError.serviceName).toBe('test-service');
        expect(cbError.resetTime).toBeInstanceOf(Date);
        expect(cbError.currentState).toBe(CircuitState.OPEN);
        expect(cbError.message).toContain('test-service');
      }
    });

    it('should increment request count even when open', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      const metricsBefore = breaker.getMetrics();

      await expect(breaker.execute(mockFn, mockContext))
        .rejects.toThrow(CircuitBreakerOpenError);

      const metricsAfter = breaker.getMetrics();
      expect(metricsAfter.totalRequests).toBe(metricsBefore.totalRequests + 1);
    });
  });

  describe('OPEN → HALF_OPEN transition', () => {
    beforeEach(async () => {
      // Force circuit to OPEN state
      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn, mockContext)).rejects.toThrow();
      }
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      // Wait for reset timeout (1 second in test config)
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Attempt a request should trigger transition
      const mockFn = vi.fn().mockResolvedValue('success');
      await breaker.execute(mockFn, mockContext);

      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should emit state change event on transition', async () => {
      const stateChangeCallback = vi.fn();
      breaker.onStateChange(stateChangeCallback);

      await new Promise(resolve => setTimeout(resolve, 1100));

      const mockFn = vi.fn().mockResolvedValue('success');
      await breaker.execute(mockFn, mockContext);

      // Should have CLOSED→OPEN and OPEN→HALF_OPEN transitions
      expect(stateChangeCallback).toHaveBeenCalledWith(
        CircuitState.OPEN,
        CircuitState.HALF_OPEN,
        expect.any(Object)
      );
    });

    it('should clear nextResetAttempt in HALF_OPEN', async () => {
      await new Promise(resolve => setTimeout(resolve, 1100));

      const mockFn = vi.fn().mockResolvedValue('success');
      await breaker.execute(mockFn, mockContext);

      const metrics = breaker.getMetrics();
      expect(metrics.nextResetAttempt).toBeUndefined();
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(async () => {
      // Force circuit to HALF_OPEN state
      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn, mockContext)).rejects.toThrow();
      }
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Trigger transition to HALF_OPEN
      const successFn = vi.fn().mockResolvedValue('success');
      await breaker.execute(successFn, mockContext);
    });

    it('should be in HALF_OPEN state', () => {
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should allow limited concurrent requests', async () => {
      const mockFn = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'success';
      });

      // Start first request (should be allowed)
      const promise1 = breaker.execute(mockFn, mockContext);

      // Wait a bit to ensure first request is in flight
      await new Promise(resolve => setTimeout(resolve, 10));

      // Try second request (should be rejected - limit is 1)
      await expect(breaker.execute(mockFn, mockContext))
        .rejects.toThrow(CircuitBreakerOpenError);

      await promise1;
    });

    it('should track success count', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');

      const metricsBefore = breaker.getMetrics();
      expect(metricsBefore.successCount).toBe(1); // Already had one success

      await breaker.execute(mockFn, mockContext);

      // After second success, circuit transitions to CLOSED and resets counters
      const metricsAfter = breaker.getMetrics();
      expect(metricsAfter.state).toBe(CircuitState.CLOSED);
      expect(metricsAfter.successCount).toBe(0); // Reset on transition to CLOSED
    });
  });

  describe('HALF_OPEN → CLOSED transition', () => {
    beforeEach(async () => {
      // Force circuit to HALF_OPEN state
      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn, mockContext)).rejects.toThrow();
      }
      await new Promise(resolve => setTimeout(resolve, 1100));

      // One success to enter HALF_OPEN
      const successFn = vi.fn().mockResolvedValue('success');
      await breaker.execute(successFn, mockContext);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should transition to CLOSED after success threshold', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      const stateChangeCallback = vi.fn();
      breaker.onStateChange(stateChangeCallback);

      // Need 2 successes total (already have 1)
      await breaker.execute(mockFn, mockContext);

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      expect(stateChangeCallback).toHaveBeenCalledWith(
        CircuitState.HALF_OPEN,
        CircuitState.CLOSED,
        expect.objectContaining({ state: CircuitState.CLOSED })
      );
    });

    it('should reset failure and success counts', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');
      await breaker.execute(mockFn, mockContext);

      const metrics = breaker.getMetrics();
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successCount).toBe(0);
    });
  });

  describe('HALF_OPEN → OPEN transition', () => {
    beforeEach(async () => {
      // Force circuit to HALF_OPEN state
      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn, mockContext)).rejects.toThrow();
      }
      await new Promise(resolve => setTimeout(resolve, 1100));

      // One success to enter HALF_OPEN
      const successFn = vi.fn().mockResolvedValue('success');
      await breaker.execute(successFn, mockContext);
      expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);
    });

    it('should immediately reopen on test failure', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('still failing'));
      const stateChangeCallback = vi.fn();
      breaker.onStateChange(stateChangeCallback);

      await expect(breaker.execute(mockFn, mockContext)).rejects.toThrow('still failing');

      expect(breaker.getState()).toBe(CircuitState.OPEN);
      expect(stateChangeCallback).toHaveBeenCalledWith(
        CircuitState.HALF_OPEN,
        CircuitState.OPEN,
        expect.objectContaining({ state: CircuitState.OPEN })
      );
    });

    it('should schedule new reset timeout', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));
      await expect(breaker.execute(mockFn, mockContext)).rejects.toThrow();

      const metrics = breaker.getMetrics();
      expect(metrics.nextResetAttempt).toBeInstanceOf(Date);
    });
  });

  describe('metrics tracking', () => {
    it('should track all request metrics', async () => {
      const successFn = vi.fn().mockResolvedValue('success');
      const failFn = vi.fn().mockRejectedValue(new Error('fail'));

      await breaker.execute(successFn, mockContext);
      await breaker.execute(successFn, mockContext);
      await expect(breaker.execute(failFn, mockContext)).rejects.toThrow();

      const metrics = breaker.getMetrics();
      expect(metrics.totalRequests).toBe(3);
      expect(metrics.totalSuccesses).toBe(2);
      expect(metrics.totalFailures).toBe(1);
      expect(metrics.failureCount).toBe(1);
      expect(metrics.lastSuccessTime).toBeInstanceOf(Date);
      expect(metrics.lastFailureTime).toBeInstanceOf(Date);
    });

    it('should provide accurate state in metrics', async () => {
      let metrics = breaker.getMetrics();
      expect(metrics.state).toBe(CircuitState.CLOSED);

      // Open circuit
      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn, mockContext)).rejects.toThrow();
      }

      metrics = breaker.getMetrics();
      expect(metrics.state).toBe(CircuitState.OPEN);
    });
  });

  describe('reset functionality', () => {
    it('should reset to initial state', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));

      // Open circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn, mockContext)).rejects.toThrow();
      }
      expect(breaker.getState()).toBe(CircuitState.OPEN);

      breaker.reset();

      expect(breaker.getState()).toBe(CircuitState.CLOSED);
      const metrics = breaker.getMetrics();
      expect(metrics.failureCount).toBe(0);
      expect(metrics.successCount).toBe(0);
      expect(metrics.nextResetAttempt).toBeUndefined();
    });

    it('should emit state change on reset if not in CLOSED', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));
      const stateChangeCallback = vi.fn();

      // Open circuit
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn, mockContext)).rejects.toThrow();
      }

      breaker.onStateChange(stateChangeCallback);
      breaker.reset();

      expect(stateChangeCallback).toHaveBeenCalledWith(
        CircuitState.OPEN,
        CircuitState.CLOSED,
        expect.any(Object)
      );
    });

    it('should not emit state change if already CLOSED', () => {
      const stateChangeCallback = vi.fn();
      breaker.onStateChange(stateChangeCallback);

      breaker.reset();

      expect(stateChangeCallback).not.toHaveBeenCalled();
    });
  });

  describe('callback error handling', () => {
    it('should not crash on state change callback errors', async () => {
      const badCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      breaker.onStateChange(badCallback);

      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));

      // Should not throw despite callback error
      for (let i = 0; i < 3; i++) {
        await expect(breaker.execute(mockFn, mockContext)).rejects.toThrow('fail');
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should not crash on failure callback errors', async () => {
      const badCallback = vi.fn(() => {
        throw new Error('Callback error');
      });
      breaker.onFailureCallback(badCallback);

      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));

      // Should not throw despite callback error
      await expect(breaker.execute(mockFn, mockContext)).rejects.toThrow('fail');
    });
  });

  describe('concurrent requests', () => {
    it('should handle concurrent requests in CLOSED state', async () => {
      const mockFn = vi.fn().mockResolvedValue('success');

      const promises = Array.from({ length: 10 }, () =>
        breaker.execute(mockFn, mockContext)
      );

      const results = await Promise.all(promises);
      expect(results).toHaveLength(10);
      expect(results.every(r => r === 'success')).toBe(true);
      expect(breaker.getMetrics().totalSuccesses).toBe(10);
    });

    it('should handle mixed success/failure concurrent requests', async () => {
      const mockFn = vi.fn()
        .mockResolvedValueOnce('success')
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValueOnce('success');

      const promises = [
        breaker.execute(mockFn, mockContext).catch(e => e),
        breaker.execute(mockFn, mockContext).catch(e => e),
        breaker.execute(mockFn, mockContext).catch(e => e)
      ];

      await Promise.all(promises);

      const metrics = breaker.getMetrics();
      expect(metrics.totalRequests).toBe(3);
      expect(metrics.totalSuccesses).toBe(2);
      expect(metrics.totalFailures).toBe(1);
    });
  });
});

describe('CircuitBreakerRegistry', () => {
  let registry: CircuitBreakerRegistry;

  beforeEach(() => {
    registry = CircuitBreakerRegistry.getInstance();
    registry.clear();
  });

  afterEach(() => {
    registry.clear();
  });

  describe('singleton pattern', () => {
    it('should return same instance', () => {
      const instance1 = CircuitBreakerRegistry.getInstance();
      const instance2 = CircuitBreakerRegistry.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('circuit breaker management', () => {
    it('should create new circuit breaker for service', () => {
      const breaker = registry.getCircuitBreaker('test-service');
      expect(breaker).toBeInstanceOf(CircuitBreaker);
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should return same instance for same service', () => {
      const breaker1 = registry.getCircuitBreaker('test-service');
      const breaker2 = registry.getCircuitBreaker('test-service');
      expect(breaker1).toBe(breaker2);
    });

    it('should create different instances for different services', () => {
      const breaker1 = registry.getCircuitBreaker('service-1');
      const breaker2 = registry.getCircuitBreaker('service-2');
      expect(breaker1).not.toBe(breaker2);
    });

    it('should apply config only on first creation', () => {
      const breaker1 = registry.getCircuitBreaker('test-service', {
        failureThreshold: 10
      });

      // Config ignored on subsequent calls
      const breaker2 = registry.getCircuitBreaker('test-service', {
        failureThreshold: 5
      });

      expect(breaker1).toBe(breaker2);
    });
  });

  describe('metrics aggregation', () => {
    it('should return metrics for all services', async () => {
      const breaker1 = registry.getCircuitBreaker('service-1');
      const breaker2 = registry.getCircuitBreaker('service-2');

      const mockFn = vi.fn().mockResolvedValue('success');
      await breaker1.execute(mockFn, {
        method: 'GET',
        url: '/test',
        requestId: 'req-1'
      });

      const allMetrics = registry.getAllMetrics();
      expect(allMetrics.size).toBe(2);
      expect(allMetrics.has('service-1')).toBe(true);
      expect(allMetrics.has('service-2')).toBe(true);
      expect(allMetrics.get('service-1')?.totalSuccesses).toBe(1);
      expect(allMetrics.get('service-2')?.totalSuccesses).toBe(0);
    });
  });

  describe('reset operations', () => {
    it('should reset all circuit breakers', async () => {
      const breaker1 = registry.getCircuitBreaker('service-1', {
        failureThreshold: 2
      });
      const breaker2 = registry.getCircuitBreaker('service-2', {
        failureThreshold: 2
      });

      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));

      // Open both circuits
      for (let i = 0; i < 2; i++) {
        await expect(breaker1.execute(mockFn, {
          method: 'GET',
          url: '/test',
          requestId: 'req-1'
        })).rejects.toThrow();
        await expect(breaker2.execute(mockFn, {
          method: 'GET',
          url: '/test',
          requestId: 'req-2'
        })).rejects.toThrow();
      }

      expect(breaker1.getState()).toBe(CircuitState.OPEN);
      expect(breaker2.getState()).toBe(CircuitState.OPEN);

      registry.resetAll();

      expect(breaker1.getState()).toBe(CircuitState.CLOSED);
      expect(breaker2.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('removal operations', () => {
    it('should remove circuit breaker from registry', () => {
      registry.getCircuitBreaker('test-service');
      expect(registry.size()).toBe(1);

      const removed = registry.remove('test-service');
      expect(removed).toBe(true);
      expect(registry.size()).toBe(0);
    });

    it('should return false when removing non-existent service', () => {
      const removed = registry.remove('non-existent');
      expect(removed).toBe(false);
    });

    it('should reset circuit breaker before removal', async () => {
      const breaker = registry.getCircuitBreaker('test-service', {
        failureThreshold: 2
      });

      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 2; i++) {
        await expect(breaker.execute(mockFn, {
          method: 'GET',
          url: '/test',
          requestId: 'req-1'
        })).rejects.toThrow();
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      registry.remove('test-service');
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('clear operations', () => {
    it('should clear all circuit breakers', () => {
      registry.getCircuitBreaker('service-1');
      registry.getCircuitBreaker('service-2');
      registry.getCircuitBreaker('service-3');

      expect(registry.size()).toBe(3);

      registry.clear();
      expect(registry.size()).toBe(0);
    });

    it('should reset all circuit breakers before clearing', async () => {
      const breaker = registry.getCircuitBreaker('test-service', {
        failureThreshold: 2
      });

      const mockFn = vi.fn().mockRejectedValue(new Error('fail'));
      for (let i = 0; i < 2; i++) {
        await expect(breaker.execute(mockFn, {
          method: 'GET',
          url: '/test',
          requestId: 'req-1'
        })).rejects.toThrow();
      }

      expect(breaker.getState()).toBe(CircuitState.OPEN);

      registry.clear();
      expect(breaker.getState()).toBe(CircuitState.CLOSED);
    });
  });

  describe('size tracking', () => {
    it('should track number of registered breakers', () => {
      expect(registry.size()).toBe(0);

      registry.getCircuitBreaker('service-1');
      expect(registry.size()).toBe(1);

      registry.getCircuitBreaker('service-2');
      expect(registry.size()).toBe(2);

      registry.getCircuitBreaker('service-1'); // Same service
      expect(registry.size()).toBe(2);

      registry.remove('service-1');
      expect(registry.size()).toBe(1);
    });
  });
});

describe('getCircuitBreaker helper', () => {
  afterEach(() => {
    CircuitBreakerRegistry.getInstance().clear();
  });

  it('should get circuit breaker from global registry', () => {
    const breaker = getCircuitBreaker('test-service');
    expect(breaker).toBeInstanceOf(CircuitBreaker);
  });

  it('should apply custom configuration', () => {
    const breaker = getCircuitBreaker('test-service', {
      failureThreshold: 10,
      resetTimeout: 30000
    });
    expect(breaker).toBeInstanceOf(CircuitBreaker);
  });

  it('should return same instance as registry', () => {
    const registry = CircuitBreakerRegistry.getInstance();
    const breaker1 = getCircuitBreaker('test-service');
    const breaker2 = registry.getCircuitBreaker('test-service');
    expect(breaker1).toBe(breaker2);
  });
});

describe('CircuitBreakerOpenError', () => {
  it('should have correct properties', () => {
    const resetTime = new Date(Date.now() + 60000);
    const error = new CircuitBreakerOpenError('test-service', resetTime);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('CircuitBreakerOpenError');
    expect(error.serviceName).toBe('test-service');
    expect(error.resetTime).toBe(resetTime);
    expect(error.currentState).toBe(CircuitState.OPEN);
    expect(error.message).toContain('test-service');
    expect(error.message).toContain(resetTime.toISOString());
  });

  it('should maintain stack trace', () => {
    const error = new CircuitBreakerOpenError('test-service', new Date());
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('CircuitBreakerOpenError');
  });
});

describe('Integration scenarios', () => {
  let breaker: CircuitBreaker;
  const mockContext: CircuitBreakerContext = {
    method: 'GET',
    url: '/api/test',
    requestId: 'test-req-123'
  };

  beforeEach(() => {
    breaker = new CircuitBreaker('integration-test', {
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeout: 500,
      halfOpenRequests: 1,
      monitoringWindow: 5000
    });
  });

  afterEach(() => {
    breaker.reset();
  });

  it('should complete full circuit lifecycle: CLOSED → OPEN → HALF_OPEN → CLOSED', async () => {
    const states: CircuitState[] = [];
    breaker.onStateChange((oldState, newState) => {
      states.push(newState);
    });

    // Phase 1: Start in CLOSED
    expect(breaker.getState()).toBe(CircuitState.CLOSED);

    // Phase 2: Trigger failures to OPEN circuit
    const failFn = vi.fn().mockRejectedValue(new Error('service down'));
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failFn, mockContext)).rejects.toThrow();
    }
    expect(breaker.getState()).toBe(CircuitState.OPEN);

    // Phase 3: Wait for reset timeout and transition to HALF_OPEN
    await new Promise(resolve => setTimeout(resolve, 600));
    const successFn = vi.fn().mockResolvedValue('recovered');
    await breaker.execute(successFn, mockContext);
    expect(breaker.getState()).toBe(CircuitState.HALF_OPEN);

    // Phase 4: Success threshold met, transition to CLOSED
    await breaker.execute(successFn, mockContext);
    expect(breaker.getState()).toBe(CircuitState.CLOSED);

    expect(states).toEqual([
      CircuitState.OPEN,
      CircuitState.HALF_OPEN,
      CircuitState.CLOSED
    ]);
  });

  it('should handle service flapping between healthy and unhealthy', async () => {
    const flappingFn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success')
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success')
      .mockRejectedValue(new Error('fail'));

    // Mix of successes and failures
    await expect(breaker.execute(flappingFn, mockContext)).rejects.toThrow();
    await breaker.execute(flappingFn, mockContext); // Resets failure count
    await expect(breaker.execute(flappingFn, mockContext)).rejects.toThrow();
    await breaker.execute(flappingFn, mockContext); // Resets failure count again

    // Should still be CLOSED (failures never reached threshold)
    expect(breaker.getState()).toBe(CircuitState.CLOSED);
    expect(breaker.getMetrics().failureCount).toBe(0);
  });

  it('should track metrics accurately through full lifecycle', async () => {
    const failFn = vi.fn().mockRejectedValue(new Error('fail'));
    const successFn = vi.fn().mockResolvedValue('success');

    // Initial successes
    await breaker.execute(successFn, mockContext);
    await breaker.execute(successFn, mockContext);

    // Failures to open circuit
    for (let i = 0; i < 3; i++) {
      await expect(breaker.execute(failFn, mockContext)).rejects.toThrow();
    }

    // Attempt while open (rejected immediately)
    await expect(breaker.execute(successFn, mockContext))
      .rejects.toThrow(CircuitBreakerOpenError);

    // Wait and recover
    await new Promise(resolve => setTimeout(resolve, 600));
    await breaker.execute(successFn, mockContext);
    await breaker.execute(successFn, mockContext);

    const metrics = breaker.getMetrics();
    expect(metrics.totalRequests).toBe(8); // 2 initial + 3 failures + 1 rejected + 2 recovery
    expect(metrics.totalSuccesses).toBe(4); // 2 initial + 2 recovery
    expect(metrics.totalFailures).toBe(3); // 3 to open circuit
    expect(metrics.state).toBe(CircuitState.CLOSED);
  });
});
