/**
 * Sentry Error Tracking Integration
 *
 * Provides centralized error tracking with context enrichment
 */

import * as Sentry from '@sentry/node';
import type { User, Breadcrumb, SeverityLevel } from '@sentry/types';

export interface ErrorTrackingConfig {
  dsn: string;
  environment: string;
  release?: string;
  serviceName: string;
  sampleRate?: number;
  tracesSampleRate?: number;
  enableTracing?: boolean;
}

/**
 * Initialize Sentry for backend services
 */
export function initializeSentry(config: ErrorTrackingConfig): void {
  const {
    dsn,
    environment,
    release,
    serviceName,
    sampleRate = 1.0,
    tracesSampleRate = 0.1,
    enableTracing = true,
  } = config;

  Sentry.init({
    dsn,
    environment,
    release: release || process.env.npm_package_version,
    serverName: serviceName,

    // Performance monitoring
    tracesSampleRate: enableTracing ? tracesSampleRate : 0,

    // Error sampling
    sampleRate,

    // Enable auto-instrumentation (Sentry v10.22+ API)
    integrations: [
      // HTTP integration for request tracking
      Sentry.httpIntegration(),

      // Express integration (will auto-detect Express)
      Sentry.expressIntegration(),

      // Console integration for capturing console.error
      Sentry.consoleIntegration(),

      // OnUncaughtException integration
      Sentry.onUncaughtExceptionIntegration({
        onFatalError: async (error: Error) => {
          console.error('Fatal error caught by Sentry:', error);
          // Give Sentry time to send the error before exiting
          await Sentry.flush(2000);
          process.exit(1);
        },
      }),

      // OnUnhandledRejection integration
      Sentry.onUnhandledRejectionIntegration({
        mode: 'warn',
      }),
    ],

    // Filter out health check requests
    beforeSend(event, hint) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      hint;
      const url = event.request?.url || '';

      // Don't send health check errors
      if (url.includes('/health') || url.includes('/metrics')) {
        return null;
      }

      // Don't send 404 errors for static assets
      if (event.exception?.values?.[0]?.type === 'NotFoundError' && url.match(/\.(css|js|png|jpg|svg)$/)) {
        return null;
      }

      return event;
    },

    // Add custom tags
    initialScope: {
      tags: {
        service: serviceName,
      },
    },
  });
}

/**
 * Error Tracking Service
 */
export class ErrorTrackingService {
  /**
   * Capture an exception
   */
  captureException(error: Error, context?: Record<string, any>): string {
    return Sentry.captureException(error, {
      extra: context,
    });
  }

  /**
   * Capture a message
   */
  captureMessage(message: string, level: SeverityLevel = 'info', context?: Record<string, any>): string {
    return Sentry.captureMessage(message, {
      level,
      extra: context,
    });
  }

  /**
   * Set user context
   */
  setUser(user: { id: string; email?: string; username?: string; [key: string]: any }): void {
    Sentry.setUser(user as User);
  }

  /**
   * Clear user context
   */
  clearUser(): void {
    Sentry.setUser(null);
  }

  /**
   * Set custom context
   */
  setContext(name: string, context: Record<string, any>): void {
    Sentry.setContext(name, context);
  }

  /**
   * Add breadcrumb for debugging
   */
  addBreadcrumb(breadcrumb: {
    message: string;
    level?: SeverityLevel;
    category?: string;
    data?: Record<string, any>;
  }): void {
    Sentry.addBreadcrumb(breadcrumb as Breadcrumb);
  }

  /**
   * Set custom tag
   */
  setTag(key: string, value: string): void {
    Sentry.setTag(key, value);
  }

  /**
   * Set multiple tags
   */
  setTags(tags: Record<string, string>): void {
    Sentry.setTags(tags);
  }

  /**
   * Track database query error
   */
  trackDatabaseError(error: Error, query: string, table: string): string {
    this.addBreadcrumb({
      category: 'database',
      message: `Query failed on table ${table}`,
      level: 'error',
      data: {
        query: query.slice(0, 200),
        table,
      },
    });

    return this.captureException(error, {
      database: {
        query: query.slice(0, 500),
        table,
      },
    });
  }

  /**
   * Track API error
   */
  trackApiError(
    error: Error,
    method: string,
    url: string,
    statusCode: number,
    requestBody?: any
  ): string {
    this.addBreadcrumb({
      category: 'http',
      message: `${method} ${url} failed with ${statusCode}`,
      level: 'error',
      data: {
        method,
        url,
        statusCode,
      },
    });

    return this.captureException(error, {
      http: {
        method,
        url,
        statusCode,
        requestBody: requestBody ? JSON.stringify(requestBody).slice(0, 500) : undefined,
      },
    });
  }

  /**
   * Track business logic error
   */
  trackBusinessError(
    error: Error,
    operation: string,
    entityType: string,
    entityId: string,
    details?: Record<string, any>
  ): string {
    this.addBreadcrumb({
      category: 'business',
      message: `${operation} failed for ${entityType}:${entityId}`,
      level: 'error',
      data: {
        operation,
        entityType,
        entityId,
      },
    });

    return this.captureException(error, {
      business: {
        operation,
        entityType,
        entityId,
        ...details,
      },
    });
  }

  /**
   * Flush pending events (useful before shutdown)
   */
  async flush(timeout: number = 2000): Promise<boolean> {
    return Sentry.flush(timeout);
  }

  /**
   * Close the Sentry client
   */
  async close(timeout: number = 2000): Promise<boolean> {
    return Sentry.close(timeout);
  }
}

/**
 * Create a singleton instance
 */
let errorTrackingInstance: ErrorTrackingService | null = null;

export function getErrorTrackingService(): ErrorTrackingService {
  if (!errorTrackingInstance) {
    errorTrackingInstance = new ErrorTrackingService();
  }
  return errorTrackingInstance;
}
