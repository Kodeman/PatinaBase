import type { RouteContext } from './request-context';
import { getRequestDuration } from './request-context';

/**
 * Log levels
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured log entry
 */
export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  requestId?: string;
  userId?: string;
  duration?: number;
  [key: string]: unknown;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  /** Minimum log level */
  level: LogLevel;
  /** Whether to pretty-print logs in development */
  pretty: boolean;
  /** Additional fields to include in every log */
  defaultFields?: Record<string, unknown>;
}

/**
 * Default logger configuration
 */
const defaultConfig: LoggerConfig = {
  level: (process.env.LOG_LEVEL as LogLevel) || 'info',
  pretty: process.env.NODE_ENV === 'development',
};

/**
 * Log level priorities
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Check if a log level should be logged
 */
function shouldLog(level: LogLevel, config: LoggerConfig): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[config.level];
}

/**
 * Format log entry for output
 */
function formatLog(entry: LogEntry, config: LoggerConfig): string {
  if (config.pretty) {
    const { level, message, timestamp, ...rest } = entry;
    const colorMap: Record<LogLevel, string> = {
      debug: '\x1b[36m', // Cyan
      info: '\x1b[32m',  // Green
      warn: '\x1b[33m',  // Yellow
      error: '\x1b[31m', // Red
    };
    const reset = '\x1b[0m';
    const color = colorMap[level];

    let output = `${color}[${level.toUpperCase()}]${reset} ${message}`;
    if (Object.keys(rest).length > 0) {
      output += ` ${JSON.stringify(rest, null, 2)}`;
    }
    return output;
  }

  return JSON.stringify(entry);
}

/**
 * Core logging function
 */
function log(
  level: LogLevel,
  message: string,
  meta: Record<string, unknown> = {},
  config: LoggerConfig = defaultConfig
): void {
  if (!shouldLog(level, config)) {
    return;
  }

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...config.defaultFields,
    ...meta,
  };

  const output = formatLog(entry, config);

  // Output to appropriate console method
  switch (level) {
    case 'debug':
      console.debug(output);
      break;
    case 'info':
      console.info(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    case 'error':
      console.error(output);
      break;
  }
}

/**
 * Create a logger instance with default fields
 */
export function createLogger(
  defaultFields?: Record<string, unknown>,
  config: Partial<LoggerConfig> = {}
): Logger {
  const mergedConfig: LoggerConfig = {
    ...defaultConfig,
    ...config,
    defaultFields: {
      ...defaultConfig.defaultFields,
      ...defaultFields,
    },
  };

  return {
    debug: (message, meta?) => log('debug', message, meta, mergedConfig),
    info: (message, meta?) => log('info', message, meta, mergedConfig),
    warn: (message, meta?) => log('warn', message, meta, mergedConfig),
    error: (message, meta?) => log('error', message, meta, mergedConfig),
    child: (childFields) => createLogger(
      { ...mergedConfig.defaultFields, ...childFields },
      config
    ),
  };
}

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

/**
 * Default logger instance
 */
export const logger = createLogger();

/**
 * Create a logger from route context
 */
export function loggerFromContext(context: RouteContext): Logger {
  return createLogger({
    requestId: context.requestId,
    userId: context.user?.id,
    ip: context.ip,
  });
}

/**
 * Log API request start
 */
export function logRequestStart(
  context: RouteContext,
  method: string,
  path: string
): void {
  const log = loggerFromContext(context);
  log.info('API request started', {
    method,
    path,
    userAgent: context.userAgent,
  });
}

/**
 * Log API request completion
 */
export function logRequestComplete(
  context: RouteContext,
  method: string,
  path: string,
  status: number
): void {
  const log = loggerFromContext(context);
  const duration = getRequestDuration(context);

  const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

  log[level]('API request completed', {
    method,
    path,
    status,
    duration,
  });
}

/**
 * Log API request error
 */
export function logRequestError(
  context: RouteContext,
  method: string,
  path: string,
  error: unknown
): void {
  const log = loggerFromContext(context);
  const duration = getRequestDuration(context);

  log.error('API request failed', {
    method,
    path,
    duration,
    error: error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    } : String(error),
  });
}

/**
 * Log validation error
 */
export function logValidationError(
  context: RouteContext,
  field: 'body' | 'query' | 'params',
  error: unknown
): void {
  const log = loggerFromContext(context);
  log.warn('Validation failed', {
    field,
    error: error instanceof Error ? error.message : String(error),
  });
}

/**
 * Log rate limit exceeded
 */
export function logRateLimitExceeded(
  context: RouteContext,
  limit: number,
  window: number
): void {
  const log = loggerFromContext(context);
  log.warn('Rate limit exceeded', {
    limit,
    window,
  });
}

/**
 * Log authentication failure
 */
export function logAuthFailure(
  context: RouteContext,
  reason: string
): void {
  const log = loggerFromContext(context);
  log.warn('Authentication failed', {
    reason,
  });
}

/**
 * Log authorization failure
 */
export function logAuthzFailure(
  context: RouteContext,
  requiredRoles: string[],
  userRoles: string[]
): void {
  const log = loggerFromContext(context);
  log.warn('Authorization failed', {
    requiredRoles,
    userRoles,
  });
}
