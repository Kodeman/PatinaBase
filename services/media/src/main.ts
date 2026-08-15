import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { createCorsOptions } from '@patina/auth';
import { AppModule } from './app.module';
import { registerPublicHealth } from './public-health';

/**
 * Alias R2_BUCKET_* env vars to legacy OCI_BUCKET_* names so callers that still
 * read OCI_BUCKET_RAW/PROCESSED/PUBLIC work against Cloudflare R2 without
 * touching ~15 call sites. Object storage itself talks to R2 via OCIStorageService
 * (which is now backed by the S3 SDK against R2). See oci-storage.service.ts.
 */
function aliasStorageEnv() {
  const map: Array<[string, string]> = [
    ['R2_BUCKET_RAW', 'OCI_BUCKET_RAW'],
    ['R2_BUCKET_PROCESSED', 'OCI_BUCKET_PROCESSED'],
    ['R2_BUCKET_PROCESSED', 'OCI_BUCKET_PUBLIC'],
    ['R2_BUCKET_PROCESSED', 'OCI_BUCKET_MEDIA'],
  ];
  for (const [src, dst] of map) {
    if (process.env[src] && !process.env[dst]) {
      process.env[dst] = process.env[src];
    }
  }
}

export async function bootstrap() {
  aliasStorageEnv();
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const env = process.env.NODE_ENV || 'development';
  const port = process.env.PORT || 3014;

  // Security middleware
  app.use(helmet());
  app.use(cookieParser());

  /**
   * CSRF Protection Note:
   * =====================
   * This service does NOT use CSRF middleware because:
   * 1. All API endpoints use JWT Bearer tokens (Authorization header)
   * 2. JWT-based authentication is immune to CSRF attacks
   * 3. Media uploads use Pre-Authenticated Requests (PARs) which are time-limited
   * 4. CSRF protection is only needed for cookie-based authentication
   *
   * Reference: OWASP CSRF Prevention Cheat Sheet
   */

  // CORS Configuration - Handled by NGINX API Gateway
  // CORS is centrally managed at the API Gateway level for consistency
  // across all services and to prevent duplicate headers.
  // See: /infra/nginx/snippets/cors.conf for CORS configuration
  logger.log(`CORS Configuration:`);
  logger.log(`  Environment: ${env}`);
  logger.log(`  Handled by: NGINX API Gateway`);

  // app.enableCors() - DISABLED: CORS handled by NGINX to prevent duplicate headers

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  registerPublicHealth(app);

  await app.listen(port);

  console.log(`
╔═══════════════════════════════════════════════════╗
║  Patina Media & 3D Pipeline Service               ║
║  Running on: http://localhost:${port}              ║
║  Health: http://localhost:${port}/health           ║
╚═══════════════════════════════════════════════════╝
  `);
}

if (require.main === module) {
  void bootstrap();
}
