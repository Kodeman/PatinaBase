/**
 * Emit a thin `.d.ts` stub for @patina/api-routes consumers.
 *
 * This package's `tsup` config currently has `dts: false` (tsconfig conflict
 * notes from an earlier author) so types are hand-rolled. The stub types
 * exports as `any` — consumers get import resolution but no real type safety.
 *
 * Fixing this properly is a follow-up (enable tsup's dts emit and resolve the
 * tsconfig conflict). For now: keep the stub honest about WHAT is exported
 * so type-check doesn't fail with "no exported member X" — which would block
 * monorepo CI gates.
 *
 * Every symbol below must correspond to an actual runtime export from one of
 * src/index.ts, src/middleware/index.ts, src/utils/index.ts. Adding a new
 * runtime export? Add it here too.
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

fs.mkdirSync(path.join(root, 'dist', 'utils'), { recursive: true });
fs.mkdirSync(path.join(root, 'dist', 'middleware'), { recursive: true });

const mainStub = `// Auto-generated stub. See scripts/emit-types.js. Do not edit by hand.
export interface RouteContext {
  requestId: string;
  ip: string;
  userAgent?: string;
  user?: any;
  validatedData: { body?: any; query?: any; params?: any };
  startTime: number;
  custom?: Record<string, any>;
}

// Route handler factory (src/create-route-handler.ts)
export declare function createRouteHandler(handler: any, config?: any): any;
export declare function compose(...args: any[]): any;
export declare function createHandlers(handlers: any, config?: any): any;
export declare function createMultiMethodHandler(handlers: any, config?: any): any;
export type RouteConfig = any;

// Middleware (src/middleware/*)
export declare function withValidation(schema: any): any;
export declare function createQuerySchema(transforms?: any): any;
export declare const queryTransforms: any;
export type ValidationSchemas = any;
export type RouteHandler = any;
export interface ServiceConfig {
  name: string;
  baseUrl: string;
  path?: string;
  fetcher?: typeof fetch;
}
export interface ErrorMapping {
  [statusCode: number]: { code: string; message: string };
}
export interface ResponseTransformer {
  transform: (data: unknown, response: Response) => unknown;
}
export interface BaseProxyConfig {
  service: ServiceConfig;
  retry?: any;
  timeout?: any;
  forwardHeaders?: string[];
  errorMapping?: ErrorMapping;
  responseTransformer?: ResponseTransformer;
}
export type ProxyConfig =
  | (BaseProxyConfig & { requireAuth?: true; cache?: never })
  | (BaseProxyConfig & { requireAuth: false; cache?: CacheConfig });
export type ProxyHandlerOptions = Omit<BaseProxyConfig, 'service'> &
  { service?: Partial<ServiceConfig> } &
  ({ requireAuth?: true; cache?: never } | { requireAuth: false; cache?: CacheConfig });
export declare function proxyToBackend(request: any, context: any, config: ProxyConfig): Promise<Response>;
export declare function createProxyHandler(name: string, baseUrl: string, options?: ProxyHandlerOptions): any;

// Response wrappers (src/utils/response-wrapper.ts)
export interface CacheConfig {
  visibility: 'public';
  reviewedPublic: true;
  ttl: number;
  swr?: number;
}
export interface ApiResponseOptions {
  status?: number;
  headers?: Record<string, string>;
  cache?: CacheConfig;
}
export declare function apiSuccess<T>(data: T, meta?: Record<string, unknown>, options?: ApiResponseOptions): Response;
export declare function apiError(error: any, status?: number): Response;
export declare function apiValidationError(errors: any, message?: string): Response;
export declare function apiUnauthorized(message?: string): Response;
export declare function apiForbidden(message?: string): Response;
export declare function apiNotFound(message?: string): Response;
export declare function apiRateLimitExceeded(message?: string, retryAfter?: number): Response;

// Error handling (src/utils/error-transformer.ts)
export declare function transformError(error: unknown): any;
export declare function getErrorStatus(error: unknown): number;
export declare function createApiError(code: any, message: string, details?: any): Error;
export declare const ApiErrorCode: any;
export declare const ERROR_STATUS_MAP: any;

// Request context (src/utils/request-context.ts)
export declare function createContext(request: any, requestId?: string): RouteContext;
export declare function setUser(context: RouteContext, user: any): RouteContext;
export declare function setAuthToken(context: RouteContext, token: string): RouteContext;
export declare function getAuthToken(context: RouteContext): string | undefined;
export declare function setValidatedBody<T>(context: RouteContext, body: T): RouteContext;
export declare function setValidatedQuery<T>(context: RouteContext, query: T): RouteContext;
export declare function setValidatedParams<T>(context: RouteContext, params: T): RouteContext;
export declare function setCustom(context: RouteContext, key: string, value: any): RouteContext;
export declare function hasRole(context: RouteContext, role: string): boolean;
export declare function hasAnyRole(context: RouteContext, roles: string[]): boolean;
export declare function hasAllRoles(context: RouteContext, roles: string[]): boolean;
export declare function getRequestDuration(context: RouteContext): number;
export type RouteUser = any;

// Retry + timeout (src/utils/retry.ts)
export declare function retryRequest<T>(fn: () => Promise<T>, config?: any, context?: any): Promise<T>;
export declare function getTimeoutForMethod(method: string, config?: any): number;
export declare function createTimeoutSignal(timeoutMs: number): AbortSignal;
export declare function fetchWithTimeout(url: string, options: any, timeoutMs: number): Promise<Response>;
export declare class RetryExhaustedError extends Error {
  readonly attempts: number;
  readonly lastError: unknown;
}
export declare class TimeoutError extends Error {
  readonly timeoutMs: number;
}
export type RetryConfig = any;
export type RetryContext = any;
export type TimeoutConfig = any;

// Logger (src/utils/logger.ts)
export declare function createLogger(config?: any): any;
export declare const logger: any;
export declare function loggerFromContext(context: any): any;
export declare function logRequestStart(context: any, method: string, url: string): void;
export declare function logRequestComplete(context: any, method: string, url: string, status: number): void;
export declare function logRequestError(context: any, method: string, url: string, error: unknown): void;
export declare function logValidationError(context: any, errors: any): void;
export declare function logRateLimitExceeded(context: any, limit: number, current: number): void;
export declare function logAuthFailure(context: any, reason: string): void;
export declare function logAuthzFailure(context: any, reason: string): void;
export type Logger = any;
export type LogLevel = any;
export type LogEntry = any;
export type LoggerConfig = any;

// Tracing (src/utils/tracing.ts)
export declare function createTracer(config?: any): any;
export declare function startRouteSpan(context: any, method: string, path: string): any;
export declare function startProxySpan(span: any, service: string, url: string): any;
export declare function recordRetryAttempt(span: any, attempt: number, error?: unknown): void;
export declare function recordCircuitBreakerEvent(span: any, event: string): void;
export declare function recordCacheEvent(span: any, hit: boolean): void;
export declare function endSpanSuccess(span: any, status?: number): void;
export declare function endSpanError(span: any, error: unknown): void;
export type TracingConfig = any;
export type SpanAttributes = any;
export type Span = any;

// Metrics (src/utils/metrics.ts)
export declare class InMemoryMetricsCollector {
  constructor(config?: any);
}
export declare function getMetricsCollector(): InMemoryMetricsCollector;
export declare function setMetricsCollector(collector: any): void;
export declare function resetMetricsCollector(): void;
export type MetricsCollector = any;
`;

fs.writeFileSync(path.join(root, 'dist', 'index.d.ts'), mainStub);
fs.writeFileSync(
  path.join(root, 'dist', 'middleware', 'index.d.ts'),
  `export * from '../index';\n`,
);
fs.writeFileSync(
  path.join(root, 'dist', 'utils', 'index.d.ts'),
  `export * from '../index';\n`,
);

console.log('Emitted hand-rolled .d.ts stubs to dist/');
