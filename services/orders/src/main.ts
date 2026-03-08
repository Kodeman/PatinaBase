import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import compression from 'compression';
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

  // OpenAPI/Swagger
  const config = new DocumentBuilder()
    .setTitle('Patina Orders & Payments API')
    .setDescription('Orders, Payments, Cart, and Checkout service for Patina OCI platform')
    .setVersion('1.0')
    .addTag('carts', 'Shopping cart management')
    .addTag('checkout', 'Checkout and payment initiation')
    .addTag('orders', 'Order management')
    .addTag('payments', 'Payment processing')
    .addTag('refunds', 'Refund management')
    .addTag('shipments', 'Fulfillment and shipping')
    .addTag('webhooks', 'Stripe webhooks')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = configService.get('PORT', 3015);
  await app.listen(port);

  console.log(`Orders service listening on port ${port}`);
  console.log(`API documentation available at http://localhost:${port}/api/docs`);
}

bootstrap();
