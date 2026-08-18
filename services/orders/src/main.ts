import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import compression from 'compression';
import helmet from 'helmet';
import { createCorsOptions } from '@patina/auth';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const configService = app.get(ConfigService);
  const env = configService.get('NODE_ENV', 'development');

  // Security
  app.use(helmet());

  // CORS Configuration - Handled by NGINX API Gateway
  // CORS is centrally managed at the API Gateway level for consistency
  // across all services and to prevent duplicate headers.
  // See: /infra/nginx/snippets/cors.conf for CORS configuration
  const corsOrigins = configService.get('CORS_ORIGINS');

  logger.log(`CORS Configuration:`);
  logger.log(`  Environment: ${env}`);
  logger.log(`  Handled by: NGINX API Gateway`);
  logger.log(`  Configured Origins: ${corsOrigins || 'see NGINX cors-map.conf'}`);

  // app.enableCors() - DISABLED: CORS handled by NGINX to prevent duplicate headers

  // Compression
  app.use(compression());

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // API prefix
  app.setGlobalPrefix('v1');

  const port = configService.get('PORT', 3015);
  await app.listen(port);

  logger.log(`Orders service listening on port ${port}`);
}

bootstrap();
