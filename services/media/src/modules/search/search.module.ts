import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { PrismaClient } from '../../generated/prisma-client';

// Controllers
import { SearchController } from './search.controller';

// Services
import { MediaSearchService } from './media-search.service';
import { AIFeaturesService } from './ai-features.service';
import { AnalyticsService } from './analytics.service';
import { IntelligenceService } from './intelligence.service';
import { ReportingService } from './reporting.service';
import { MediaAdminAuthorizationInterceptor } from '../authorization/media-admin-authorization.interceptor';
import {
  createTransactionBoundPrisma,
  MediaAdminTransactionContext,
} from '../authorization/media-admin-transaction.context';

@Module({
  imports: [ConfigModule, EventEmitterModule],
  controllers: [SearchController],
  providers: [
    MediaAdminTransactionContext,
    {
      provide: PrismaClient,
      inject: [MediaAdminTransactionContext],
      useFactory: createTransactionBoundPrisma,
    },
    MediaSearchService,
    AIFeaturesService,
    AnalyticsService,
    IntelligenceService,
    ReportingService,
    MediaAdminAuthorizationInterceptor,
  ],
  exports: [
    MediaSearchService,
    AIFeaturesService,
    AnalyticsService,
    IntelligenceService,
    ReportingService,
  ],
})
export class SearchModule {}
