import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { BullModule } from '@nestjs/bull';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { CacheModule } from '@patina/cache';
import { APP_GUARD } from '@nestjs/core';
import { HybridAuthGuard, PermissionsGuard } from '@patina/auth';
import { join } from 'path';

import configuration from './config/configuration';
// Modules
import { CartsModule } from './modules/carts/carts.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { OrdersModule } from './modules/orders/orders.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { RefundsModule } from './modules/refunds/refunds.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module';
import { FulfillmentModule } from './modules/fulfillment/fulfillment.module';
import { HealthModule } from './modules/health/health.module';
import { PrismaModule } from './config/prisma.module';
import { StripeModule } from './config/stripe.module';
import { EventsModule } from './config/events.module';

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [join(__dirname, '../.env.local'), join(__dirname, '../.env')],
    }),

    // Prometheus metrics
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: true,
      },
    }),

    // Rate limiting
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 60, // 60 requests per minute
      },
    ]),

    // Scheduling
    ScheduleModule.forRoot(),

    // Events
    EventEmitterModule.forRoot(),

    // Bull Queue
    BullModule.forRootAsync({
      useFactory: () => ({
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
          db: parseInt(process.env.REDIS_DB || '2'),
        },
      }),
    }),

    // Infrastructure
    PrismaModule,
    StripeModule,
    EventsModule,
    CacheModule,

    // Feature modules
    HealthModule,
    CartsModule,
    CheckoutModule,
    OrdersModule,
    PaymentsModule,
    RefundsModule,
    WebhooksModule,
    ReconciliationModule,
    FulfillmentModule,
  ],
  providers: [
    // Global Authentication Guard — Supabase JWT validation
    {
      provide: APP_GUARD,
      useClass: HybridAuthGuard,
    },
    // Global Permissions Guard (RBAC enforcement)
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
