import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { createCorsOptions } from '@patina/auth';
import { AppModule } from './app.module';

async function bootstrap() {
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
  const corsOrigins = process.env.CORS_ORIGINS;

  logger.log(`CORS Configuration:`);
  logger.log(`  Environment: ${env}`);
  logger.log(`  Handled by: NGINX API Gateway`);
  logger.log(`  Configured Origins: ${corsOrigins || 'see NGINX cors-map.conf'}`);

  // app.enableCors() - DISABLED: CORS handled by NGINX to prevent duplicate headers

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // OpenAPI/Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Patina Media & 3D Pipeline API')
    .setDescription(
      'API for media asset upload, transformation, and 3D model processing on Oracle Cloud Infrastructure',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Media Upload', 'Upload intent and PAR generation')
    .addTag('Media Assets', 'Asset metadata and management')
    .addTag('Jobs & Processing', 'Background job processing and monitoring')
    .addServer(process.env.API_URL || 'http://localhost:3004', 'Development')
    .addServer('https://api.patina.app', 'Production')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'Patina Media API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
    swaggerOptions: {
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  // Health check endpoint
  app.getHttpAdapter().get('/health', (req, res) => {
    res.json({
      status: 'ok',
      service: 'media',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  await app.listen(port);

  console.log(`
╔═══════════════════════════════════════════════════╗
║  Patina Media & 3D Pipeline Service               ║
║  Running on: http://localhost:${port}              ║
║  API Docs: http://localhost:${port}/api/docs       ║
║  Health: http://localhost:${port}/health           ║
╚═══════════════════════════════════════════════════╝
  `);
}

bootstrap();
