import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { join } from 'path';

import configuration from './config/configuration';
import { CacheModule } from '@patina/cache';
import { HybridAuthGuard, PermissionsGuard, RedactedHttpExceptionFilter } from '@patina/auth';
import { PrismaModule } from './prisma/prisma.module';
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
import { RealtimeModule } from './realtime/realtime.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { MetricsController } from './common/metrics.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: [join(__dirname, '../.env.local'), join(__dirname, '../.env')],
    }),
    PrometheusModule.register({
      path: '/metrics',
      controller: MetricsController,
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
    RealtimeModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: RedactedHttpExceptionFilter,
    },
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
