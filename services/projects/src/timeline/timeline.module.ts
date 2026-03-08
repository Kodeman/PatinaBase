import { Module } from '@nestjs/common';
import { TimelineService } from './timeline.service';
import { TimelineController } from './timeline.controller';
import { ProgressAnalyticsService } from './progress-analytics.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [TimelineController],
  providers: [TimelineService, ProgressAnalyticsService],
  exports: [TimelineService, ProgressAnalyticsService],
})
export class TimelineModule {}
