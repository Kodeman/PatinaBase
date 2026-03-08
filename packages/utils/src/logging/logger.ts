/**
 * Structured Logger for Patina Services
 *
 * Provides structured JSON logging with correlation IDs and context
 */

import winston from 'winston';
import { trace } from '@opentelemetry/api';

export interface LogContext {
  requestId?: string;
  userId?: string;
  traceId?: string;
  spanId?: string;
  service?: string;
  environment?: string;
  [key: string]: any;
}

export type LogLevel = 'error' | 'warn' | 'info' | 'http' | 'debug';

/**
 * Custom format for correlation with OpenTelemetry traces
 */
const correlationFormat = winston.format((info) => {
  const span = trace.getActiveSpan();
  if (span) {
    const spanContext = span.spanContext();
    info.traceId = spanContext.traceId;
    info.spanId = spanContext.spanId;
    info.traceFlags = spanContext.traceFlags;
  }
  return info;
});

/**
 * Structured Logger Class
 */
export class StructuredLogger {
  private logger: winston.Logger;
  private defaultContext: LogContext;

  constructor(defaultContext: LogContext = {}) {
    this.defaultContext = defaultContext;

    const logLevel = process.env.LOG_LEVEL || 'info';
    const nodeEnv = process.env.NODE_ENV || 'development';

    // Console format for development
    const consoleFormat = winston.format.combine(
      winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
      correlationFormat(),
      winston.format.errors({ stack: true }),
      winston.format.colorize(),
      winston.format.printf(({ level, message, timestamp, traceId, spanId, service, ...rest }: any) => {
        const contextStr = Object.keys(rest).length > 0 ? JSON.stringify(rest) : '';
        const traceStr = traceId && typeof traceId === 'string' ? ` [trace:${traceId.slice(0, 8)}]` : '';
        return `${timestamp} [${service || 'unknown'}]${traceStr} ${level}: ${message} ${contextStr}`;
      })
    );

    // JSON format for production
    const jsonFormat = winston.format.combine(
      winston.format.timestamp(),
      correlationFormat(),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    this.logger = winston.createLogger({
      level: logLevel,
      format: nodeEnv === 'production' ? jsonFormat : consoleFormat,
      defaultMeta: this.defaultContext,
      transports: [
        new winston.transports.Console(),
        // In production, add file transports or external log aggregation
        ...(nodeEnv === 'production' ? [
          new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
          new winston.transports.File({ filename: 'logs/combined.log' }),
        ] : []),
      ],
      exitOnError: false,
    });
  }

  /**
   * Create a child logger with additional context
   */
  child(context: LogContext): StructuredLogger {
    return new StructuredLogger({ ...this.defaultContext, ...context });
  }

  /**
   * Log at error level
   */
  error(message: string, error?: Error, context?: LogContext): void {
    this.log('error', message, {
      ...context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    });
  }

  /**
   * Log at warn level
   */
  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  /**
   * Log at info level
   */
  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  /**
   * Log HTTP requests
   */
  http(message: string, context?: LogContext): void {
    this.log('http', message, context);
  }

  /**
   * Log at debug level
   */
  debug(message: string, context?: LogContext): void {
    this.log('debug', message, context);
  }

  /**
   * Core log method
   */
  private log(level: LogLevel, message: string, context?: LogContext): void {
    const logContext = { ...this.defaultContext, ...context };

    this.logger.log(level, message, logContext);
  }

  /**
   * Log with performance timing
   */
  logPerformance(
    operation: string,
    durationMs: number,
    context?: LogContext
  ): void {
    this.info(`Performance: ${operation}`, {
      ...context,
      operation,
      durationMs,
      performance: true,
    });
  }

  /**
   * Log database query performance
   */
  logDatabaseQuery(
    query: string,
    table: string,
    durationMs: number,
    rowCount?: number,
    context?: LogContext
  ): void {
    this.debug('Database query executed', {
      ...context,
      database: {
        query: query.slice(0, 200), // Truncate long queries
        table,
        durationMs,
        rowCount,
      },
    });
  }

  /**
   * Log API request
   */
  logApiRequest(
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
    context?: LogContext
  ): void {
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    this.log(level, `${method} ${path} ${statusCode}`, {
      ...context,
      http: {
        method,
        path,
        statusCode,
        durationMs,
      },
    });
  }

  /**
   * Log business event
   */
  logEvent(
    eventType: string,
    eventName: string,
    details?: Record<string, any>,
    context?: LogContext
  ): void {
    this.info(`Event: ${eventName}`, {
      ...context,
      event: {
        type: eventType,
        name: eventName,
        details,
      },
    });
  }

  /**
   * Log security event
   */
  logSecurityEvent(
    eventType: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    details: Record<string, any>,
    context?: LogContext
  ): void {
    const level = severity === 'critical' || severity === 'high' ? 'error' : 'warn';

    this.log(level, `Security Event: ${eventType}`, {
      ...context,
      security: {
        eventType,
        severity,
        details,
      },
    });
  }
}

/**
 * Create a logger instance for a service
 */
export function createLogger(serviceName: string, environment?: string): StructuredLogger {
  return new StructuredLogger({
    service: serviceName,
    environment: environment || process.env.NODE_ENV || 'development',
  });
}

/**
 * Default logger instance
 */
export const logger = createLogger('patina');
