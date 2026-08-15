import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';

// Controllers
import { SearchController } from './search.controller';

// Services
import { MediaSearchService } from './media-search.service';
import { AIFeaturesService } from './ai-features.service';
import { AnalyticsService } from './analytics.service';
import { IntelligenceService } from './intelligence.service';
import { ReportingService } from './reporting.service';
import { MediaAdminAuthorizationInterceptor } from '../authorization/media-admin-authorization.interceptor';

@Module({
  imports: [ConfigModule, EventEmitterModule],
  controllers: [SearchController],
  providers: [
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
