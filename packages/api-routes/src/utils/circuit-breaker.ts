/**
 * Circuit Breaker Pattern Implementation
 *
 * Prevents cascading failures by monitoring service health and temporarily
 * blocking requests to failing services. Implements the three-state pattern:
 * CLOSED → OPEN → HALF_OPEN → CLOSED
 *
 * @module circuit-breaker
 */

/**
 * Circuit breaker configuration options
 */
export interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening circuit (default: 5) */
  failureThreshold: number;
  /** Number of consecutive successes in half-open to close circuit (default: 2) */
  successThreshold: number;
  /** Time in ms to wait before transitioning from OPEN to HALF_OPEN (default: 60000) */
  resetTimeout: number;
  /** Number of concurrent test requests allowed in HALF_OPEN state (default: 1) */
  halfOpenRequests: number;
  /** Time window in ms for monitoring metrics (default: 10000) */
  monitoringWindow: number;
}

/**
 * Circuit breaker states
 */
export enum CircuitState {
  /** Normal operation - all requests pass through */
  CLOSED = 'CLOSED',
  /** Circuit open - all requests rejected immediately */
  OPEN = 'OPEN',
  /** Testing if service recovered - limited requests allowed */
  HALF_OPEN = 'HALF_OPEN'
}

/**
 * Circuit breaker metrics for monitoring
 */
export interface CircuitBreakerMetrics {
  /** Current circuit state */
  state: CircuitState;
  /** Current consecutive failure count */
  failureCount: number;
  /** Current consecutive success count (in HALF_OPEN state) */
  successCount: number;
  /** Timestamp of last failure */
  lastFailureTime?: Date;
  /** Timestamp of last success */
  lastSuccessTime?: Date;
  /** Total requests processed since creation */
  totalRequests: number;
  /** Total failures since creation */
  totalFailures: number;
  /** Total successes since creation */
  totalSuccesses: number;
  /** When circuit will attempt reset (only set in OPEN state) */
  nextResetAttempt?: Date;
}

/**
 * Error thrown when circuit breaker is in OPEN state
 */
export class CircuitBreakerOpenError extends Error {
  public readonly serviceName: string;
  public readonly resetTime: Date;
  public readonly currentState: CircuitState;

  constructor(serviceName: string, resetTime: Date) {
    super(
      `Circuit breaker for service "${serviceName}" is OPEN. ` +
      `Service unavailable. Will retry after ${resetTime.toISOString()}`
    );
    this.name = 'CircuitBreakerOpenError';
    this.serviceName = serviceName;
    this.resetTime = resetTime;
    this.currentState = CircuitState.OPEN;

    // Maintains proper stack trace for where error was thrown (V8 only)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, CircuitBreakerOpenError);
    }
  }
}

/**
 * Context for circuit breaker execution
 */
export interface CircuitBreakerContext {
  /** HTTP method being executed */
  method: string;
  /** Target URL */
  url: string;
  /** Request ID for tracing */
  requestId: string;
}

/**
 * State change callback type
 */
type StateChangeCallback = (oldState: CircuitState, newState: CircuitState, metrics: CircuitBreakerMetrics) => void;

/**
 * Failure callback type
 */
type FailureCallback = (error: Error, context: CircuitBreakerContext) => void;

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failureThreshold: 5,
  successThreshold: 2,
  resetTimeout: 60000, // 1 minute
  halfOpenRequests: 1,
  monitoringWindow: 10000 // 10 seconds
};

/**
 * Circuit Breaker implementation
 *
 * Monitors service health and prevents cascading failures by implementing
 * three-state pattern (CLOSED → OPEN → HALF_OPEN → CLOSED).
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker('catalog-service');
 *
 * // Execute a request through the circuit breaker
 * const result = await breaker.execute(
 *   () => fetch('http://catalog:3011/api/products'),
 *   { method: 'GET', url: '/api/products', requestId: 'req-123' }
 * );
 * ```
 */
export class CircuitBreaker {
  private readonly serviceName: string;
  private readonly config: CircuitBreakerConfig;

  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime?: Date;
  private lastSuccessTime?: Date;
  private totalRequests = 0;
  private totalFailures = 0;
  private totalSuccesses = 0;
  private nextResetAttempt?: Date;
  private resetTimer?: NodeJS.Timeout;
  private halfOpenRequestsInFlight = 0;

  private stateChangeCallbacks: StateChangeCallback[] = [];
  private failureCallbacks: FailureCallback[] = [];

  constructor(serviceName: string, config?: Partial<CircuitBreakerConfig>) {
    this.serviceName = serviceName;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute a function through the circuit breaker
   *
   * @param fn - Async function to execute
   * @param context - Execution context for logging
   * @returns Promise that resolves with function result
   * @throws CircuitBreakerOpenError if circuit is OPEN
   * @throws Original error if function fails
   */
  async execute<T>(
    fn: () => Promise<T>,
    context: CircuitBreakerContext
  ): Promise<T> {
    this.totalRequests++;

    // OPEN state - reject immediately
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.transitionToHalfOpen();
      } else {
        const error = new CircuitBreakerOpenError(
          this.serviceName,
          this.nextResetAttempt!
        );
        throw error;
      }
    }

    // HALF_OPEN state - limit concurrent requests
    if (this.state === CircuitState.HALF_OPEN) {
      if (this.halfOpenRequestsInFlight >= this.config.halfOpenRequests) {
        // Too many test requests in flight, reject
        const error = new CircuitBreakerOpenError(
          this.serviceName,
          new Date(Date.now() + 1000) // Retry in 1 second
        );
        throw error;
      }
      this.halfOpenRequestsInFlight++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error, context);
      throw error;
    } finally {
      if (this.state === CircuitState.HALF_OPEN) {
        this.halfOpenRequestsInFlight--;
      }
    }
  }

  /**
   * Get current circuit breaker state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get current metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      totalRequests: this.totalRequests,
      totalFailures: this.totalFailures,
      totalSuccesses: this.totalSuccesses,
      nextResetAttempt: this.nextResetAttempt
    };
  }

  /**
   * Reset circuit breaker to initial state
   */
  reset(): void {
    const oldState = this.state;
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenRequestsInFlight = 0;
    this.nextResetAttempt = undefined;

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }

    if (oldState !== CircuitState.CLOSED) {
      this.emitStateChange(oldState, CircuitState.CLOSED);
    }
  }

  /**
   * Register callback for state changes
   */
  onStateChange(callback: StateChangeCallback): void {
    this.stateChangeCallbacks.push(callback);
  }

  /**
   * Register callback for failures
   */
  onFailureCallback(callback: FailureCallback): void {
    this.failureCallbacks.push(callback);
  }

  /**
   * Handle successful request
   */
  private onSuccess(): void {
    this.totalSuccesses++;
    this.lastSuccessTime = new Date();

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      // Check if we've met success threshold to close circuit
      if (this.successCount >= this.config.successThreshold) {
        this.transitionToClosed();
      }
    } else if (this.state === CircuitState.CLOSED) {
      // Reset failure count on success in CLOSED state
      this.failureCount = 0;
    }
  }

  /**
   * Handle failed request
   */
  private onFailure(error: Error, context: CircuitBreakerContext): void {
    this.totalFailures++;
    this.lastFailureTime = new Date();
    this.failureCount++;

    // Emit failure callbacks
    this.failureCallbacks.forEach(callback => {
      try {
        callback(error, context);
      } catch (err) {
        // Silently ignore callback errors to prevent infinite loops
        console.error('Circuit breaker failure callback error:', err);
      }
    });

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in HALF_OPEN immediately reopens circuit
      this.transitionToOpen();
    } else if (this.state === CircuitState.CLOSED) {
      // Check if we've met failure threshold to open circuit
      if (this.failureCount >= this.config.failureThreshold) {
        this.transitionToOpen();
      }
    }
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    const oldState = this.state;
    this.state = CircuitState.OPEN;
    this.successCount = 0;
    this.halfOpenRequestsInFlight = 0;
    this.nextResetAttempt = new Date(Date.now() + this.config.resetTimeout);

    // Schedule automatic transition to HALF_OPEN
    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
    }
    this.resetTimer = setTimeout(() => {
      if (this.state === CircuitState.OPEN) {
        this.transitionToHalfOpen();
      }
    }, this.config.resetTimeout);

    this.emitStateChange(oldState, CircuitState.OPEN);
  }

  /**
   * Transition to HALF_OPEN state
   */
  private transitionToHalfOpen(): void {
    const oldState = this.state;
    this.state = CircuitState.HALF_OPEN;
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenRequestsInFlight = 0;
    this.nextResetAttempt = undefined;

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }

    this.emitStateChange(oldState, CircuitState.HALF_OPEN);
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    const oldState = this.state;
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.halfOpenRequestsInFlight = 0;
    this.nextResetAttempt = undefined;

    if (this.resetTimer) {
      clearTimeout(this.resetTimer);
      this.resetTimer = undefined;
    }

    this.emitStateChange(oldState, CircuitState.CLOSED);
  }

  /**
   * Check if circuit should attempt reset to HALF_OPEN
   */
  private shouldAttemptReset(): boolean {
    if (!this.nextResetAttempt) return false;
    return Date.now() >= this.nextResetAttempt.getTime();
  }

  /**
   * Emit state change event to all listeners
   */
  private emitStateChange(oldState: CircuitState, newState: CircuitState): void {
    const metrics = this.getMetrics();
    this.stateChangeCallbacks.forEach(callback => {
      try {
        callback(oldState, newState, metrics);
      } catch (err) {
        // Silently ignore callback errors
        console.error('Circuit breaker state change callback error:', err);
      }
    });
  }
}

/**
 * Circuit Breaker Registry
 *
 * Singleton registry that manages circuit breakers per service.
 * Ensures one circuit breaker instance per service name.
 *
 * @example
 * ```typescript
 * const registry = CircuitBreakerRegistry.getInstance();
 * const breaker = registry.getCircuitBreaker('catalog-service');
 * const allMetrics = registry.getAllMetrics();
 * ```
 */
export class CircuitBreakerRegistry {
  private static instance: CircuitBreakerRegistry;
  private circuitBreakers = new Map<string, CircuitBreaker>();

  private constructor() {
    // Private constructor for singleton
  }

  /**
   * Get singleton instance of registry
   */
  static getInstance(): CircuitBreakerRegistry {
    if (!CircuitBreakerRegistry.instance) {
      CircuitBreakerRegistry.instance = new CircuitBreakerRegistry();
    }
    return CircuitBreakerRegistry.instance;
  }

  /**
   * Get or create circuit breaker for a service
   *
   * @param serviceName - Unique service identifier
   * @param config - Optional configuration (only used on first call)
   * @returns Circuit breaker instance for the service
   */
  getCircuitBreaker(
    serviceName: string,
    config?: Partial<CircuitBreakerConfig>
  ): CircuitBreaker {
    if (!this.circuitBreakers.has(serviceName)) {
      const breaker = new CircuitBreaker(serviceName, config);
      this.circuitBreakers.set(serviceName, breaker);
    }
    return this.circuitBreakers.get(serviceName)!;
  }

  /**
   * Get metrics for all registered circuit breakers
   *
   * @returns Map of service names to their metrics
   */
  getAllMetrics(): Map<string, CircuitBreakerMetrics> {
    const metrics = new Map<string, CircuitBreakerMetrics>();
    this.circuitBreakers.forEach((breaker, serviceName) => {
      metrics.set(serviceName, breaker.getMetrics());
    });
    return metrics;
  }

  /**
   * Reset all circuit breakers
   */
  resetAll(): void {
    this.circuitBreakers.forEach(breaker => breaker.reset());
  }

  /**
   * Remove a circuit breaker from registry
   *
   * @param serviceName - Service to remove
   * @returns true if removed, false if not found
   */
  remove(serviceName: string): boolean {
    const breaker = this.circuitBreakers.get(serviceName);
    if (breaker) {
      breaker.reset();
      return this.circuitBreakers.delete(serviceName);
    }
    return false;
  }

  /**
   * Clear all circuit breakers from registry
   */
  clear(): void {
    this.circuitBreakers.forEach(breaker => breaker.reset());
    this.circuitBreakers.clear();
  }

  /**
   * Get number of registered circuit breakers
   */
  size(): number {
    return this.circuitBreakers.size;
  }
}

/**
 * Convenience function to get circuit breaker from global registry
 *
 * @param serviceName - Service identifier
 * @param config - Optional configuration
 * @returns Circuit breaker instance
 *
 * @example
 * ```typescript
 * const breaker = getCircuitBreaker('catalog-service', {
 *   failureThreshold: 3,
 *   resetTimeout: 30000
 * });
 * ```
 */
export function getCircuitBreaker(
  serviceName: string,
  config?: Partial<CircuitBreakerConfig>
): CircuitBreaker {
  return CircuitBreakerRegistry.getInstance().getCircuitBreaker(serviceName, config);
}
