import { Module } from '@nestjs/common';
import { ProjectUpdatesController } from './project-updates.controller';
import { ProjectUpdatesService } from './project-updates.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * Module for managing project updates/timeline events
 */
@Module({
  imports: [PrismaModule],
  controllers: [ProjectUpdatesController],
  providers: [ProjectUpdatesService],
  exports: [ProjectUpdatesService],
})
export class ProjectUpdatesModule {}
