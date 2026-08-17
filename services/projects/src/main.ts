import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as compression from 'compression';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Security
  app.use(helmet());
  app.use(compression());

  // CORS Configuration - Handled by NGINX API Gateway
  // CORS is centrally managed at the API Gateway level for consistency
  // across all services and to prevent duplicate headers.
  // See: /infra/nginx/snippets/cors.conf for CORS configuration
  logger.log('CORS is handled by the API gateway');

  // app.enableCors() - DISABLED: CORS handled by NGINX to prevent duplicate headers

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // Global prefix
  app.setGlobalPrefix('v1');

  const port = configService.get('PORT', 3016);
  await app.listen(port);

  logger.log(`Project Tracking Service running on port ${port}`);
}

bootstrap();
