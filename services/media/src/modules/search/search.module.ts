import { Module } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';
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

@Module({
  imports: [ConfigModule, EventEmitterModule],
  controllers: [SearchController],
  providers: [
    {
      provide: PrismaClient,
      useFactory: () => {
        const prisma = new PrismaClient({
          log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
        });
        return prisma;
      },
    },
    MediaSearchService,
    AIFeaturesService,
    AnalyticsService,
    IntelligenceService,
    ReportingService,
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
