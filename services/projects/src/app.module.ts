import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { APP_GUARD } from '@nestjs/core';
import { join } from 'path';

import configuration from './config/configuration';
import { CacheModule } from '@patina/cache';
import { HybridAuthGuard, PermissionsGuard } from '@patina/auth';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './common/auth/auth.module';
import { HealthModule } from './health/health.module';
import { ProjectsModule } from './projects/projects.module';
import { TasksModule } from './tasks/tasks.module';
import { RfisModule } from './rfis/rfis.module';
import { ChangeOrdersModule } from './change-orders/change-orders.module';
import { IssuesModule } from './issues/issues.module';
import { DailyLogsModule } from './daily-logs/daily-logs.module';
import { DocumentsModule } from './documents/documents.module';
import { MilestonesModule } from './milestones/milestones.module';
import { ProjectUpdatesModule } from './project-updates/project-updates.module';
import { EventsModule } from './events/events.module';
import { AuditModule } from './audit/audit.module';
import { TimelineModule } from './timeline/timeline.module';
import { NotificationsModule } from './notifications/notifications.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { WebSocketModule } from './websocket/websocket.module';
import { IntegrationsModule } from './integrations/integrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [join(__dirname, '../.env.local'), join(__dirname, '../.env')],
    }),
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: {
        enabled: true,
      },
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      useFactory: () => ({
        redis: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
          password: process.env.REDIS_PASSWORD,
        },
      }),
    }),
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      newListener: false,
      removeListener: false,
      maxListeners: 10,
      verboseMemoryLeak: false,
      ignoreErrors: false,
    }),
    CacheModule,
    PrismaModule,
    AuthModule,
    IntegrationsModule,
    HealthModule,
    ProjectsModule,
    TasksModule,
    RfisModule,
    ChangeOrdersModule,
    IssuesModule,
    DailyLogsModule,
    DocumentsModule,
    MilestonesModule,
    ProjectUpdatesModule,
    EventsModule,
    AuditModule,
    TimelineModule,
    NotificationsModule,
    ApprovalsModule,
    AnalyticsModule,
    WebSocketModule,
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
