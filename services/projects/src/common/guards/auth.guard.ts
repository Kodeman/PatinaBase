/**
 * DEPRECATED: This file is kept for backward compatibility only.
 *
 * The insecure token decoding implementation has been replaced with
 * HybridAuthGuard from @patina/auth package.
 *
 * HybridAuthGuard provides:
 * - PRODUCTION MODE: API Gateway header validation (fast, pre-authenticated)
 * - DEVELOPMENT MODE: JWT signature verification (secure local development)
 * - Automatic environment detection
 * - Proper error handling and logging
 *
 * Migration:
 * All authentication is now handled globally via APP_GUARD in app.module.ts.
 * Individual controllers no longer need to apply AuthGuard manually.
 *
 * Use @Public() decorator for endpoints that don't require authentication:
 * ```typescript
 * import { Public } from '@patina/auth';
 *
 * @Get('health')
 * @Public()
 * async healthCheck() {
 *   return { status: 'ok' };
 * }
 * ```
 *
 * Security Note:
 * The previous implementation had a CRITICAL vulnerability - it decoded JWT
 * tokens without verifying signatures, allowing anyone to forge tokens.
 * This has been fixed by using proper JWT validation with passport-jwt.
 */

import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthGuard {
  constructor() {
    throw new Error(
      'AuthGuard is deprecated. Authentication is now handled globally via ' +
      'HybridAuthGuard in app.module.ts. Remove explicit AuthGuard usage from controllers.',
    );
  }
}
