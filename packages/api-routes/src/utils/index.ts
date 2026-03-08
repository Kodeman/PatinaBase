/**
 * API Routes Utilities
 * Core utilities for building Next.js API routes
 */

// Error handling
export {
  transformError,
  getErrorStatus,
  createApiError,
  ApiErrorCode,
  ERROR_STATUS_MAP,
} from './error-transformer';

// Response utilities
export {
  apiSuccess,
  apiError,
  apiValidationError,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiRateLimitExceeded,
  type CacheConfig,
  type ApiResponseOptions,
} from './response-wrapper';

// Request context
export {
  createContext,
  setUser,
  setAuthToken,
  getAuthToken,
  setValidatedBody,
  setValidatedQuery,
  setValidatedParams,
  setCustom,
  hasRole,
  hasAnyRole,
  hasAllRoles,
  getRequestDuration,
  type RouteContext,
  type RouteUser,
} from './request-context';

// Logging
export {
  createLogger,
  logger,
  loggerFromContext,
  logRequestStart,
  logRequestComplete,
  logRequestError,
  logValidationError,
  logRateLimitExceeded,
  logAuthFailure,
  logAuthzFailure,
  type Logger,
  type LogLevel,
  type LogEntry,
  type LoggerConfig,
} from './logger';

// Retry and timeout utilities
export {
  retryRequest,
  getTimeoutForMethod,
  createTimeoutSignal,
  fetchWithTimeout,
  RetryExhaustedError,
  TimeoutError,
  type RetryConfig,
  type RetryContext,
  type TimeoutConfig,
} from './retry';

// Circuit breaker
export {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitBreakerOpenError,
  getCircuitBreaker,
  CircuitState,
  type CircuitBreakerConfig,
  type CircuitBreakerMetrics,
  type CircuitBreakerContext,
} from './circuit-breaker';

// Tracing
export {
  createTracer,
  startRouteSpan,
  startProxySpan,
  recordRetryAttempt,
  recordCircuitBreakerEvent,
  recordCacheEvent,
  endSpanSuccess,
  endSpanError,
  type TracingConfig,
  type SpanAttributes,
  type Span,
} from './tracing';

// Metrics
export {
  InMemoryMetricsCollector,
  getMetricsCollector,
  setMetricsCollector,
  resetMetricsCollector,
  type MetricsCollector,
} from './metrics';
