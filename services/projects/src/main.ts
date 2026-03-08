import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import * as compression from 'compression';
import helmet from 'helmet';
import { createCorsOptions } from '@patina/auth';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const env = configService.get('NODE_ENV', 'development');

  // Security
  app.use(helmet());
  app.use(compression());

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

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('Patina Project Tracking API')
    .setDescription('Project execution and tracking service for design projects')
    .setVersion('1.0')
    .addTag('projects', 'Project management')
    .addTag('tasks', 'Task tracking')
    .addTag('rfis', 'Requests for Information')
    .addTag('change-orders', 'Change Order management')
    .addTag('issues', 'Issue and punch list tracking')
    .addTag('daily-logs', 'Daily field logs')
    .addTag('documents', 'Document management')
    .addTag('milestones', 'Milestone tracking')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get('PORT', 3016);
  await app.listen(port);

  console.log(`🚀 Project Tracking Service running on port ${port}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api/docs`);
}

bootstrap();
