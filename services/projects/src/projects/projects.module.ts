import { Module } from '@nestjs/common';
import { ProjectsService } from './projects.service';
import { ProjectsController } from './projects.controller';
import { ProjectCacheInvalidationListener } from './listeners/project-cache.listener';
import { IntegrationsModule } from '../integrations/integrations.module';

@Module({
  imports: [IntegrationsModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, ProjectCacheInvalidationListener],
  exports: [ProjectsService],
})
export class ProjectsModule {}
