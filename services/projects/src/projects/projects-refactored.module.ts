/**
 * Projects Module (Refactored)
 * Clean architecture implementation with proper dependency injection
 *
 * Architecture Layers:
 * - Domain: Interfaces, validators, domain services
 * - Application: Use cases/services
 * - Infrastructure: Repositories, events, caching
 * - Presentation: Controllers, DTOs, Facade
 */

import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CacheModule } from '@patina/cache';

// Presentation Layer
import { ProjectsController } from './projects.controller';

// Application Layer
import { ProjectManagementService } from '../application/services/project-management.service';
import { ProjectProgressService } from '../application/services/project-progress.service';
import { ProjectActivityService } from '../application/services/project-activity.service';
import { ApprovalManagementService } from '../application/services/approval-management.service';

// Domain Layer
import { ProjectValidator } from '../domain/validators/project.validator';
import { ApprovalValidator } from '../domain/validators/approval.validator';
import { ProgressCalculatorService } from '../domain/services/progress-calculator.service';
import { ApprovalWorkflowService } from '../domain/services/approval-workflow.service';
import { PROJECT_REPOSITORY } from '../domain/repositories/project.repository.interface';
import { APPROVAL_REPOSITORY } from '../domain/repositories/approval.repository.interface';

// Infrastructure Layer
import { PrismaProjectRepository } from '../infrastructure/repositories/prisma-project.repository';
import { PrismaApprovalRepository } from '../infrastructure/repositories/prisma-approval.repository';

// Common/Shared
import { PrismaModule } from '../prisma/prisma.module';

// Facade for backward compatibility
import { ProjectsRefactoredService } from './projects-refactored.service';

@Module({
  imports: [PrismaModule, EventEmitterModule, CacheModule],
  controllers: [ProjectsController],
  providers: [
    // ==========================================
    // FACADE (maintains compatibility with existing code)
    // ==========================================
    ProjectsRefactoredService,

    // ==========================================
    // APPLICATION SERVICES
    // ==========================================
    ProjectManagementService,
    ProjectProgressService,
    ProjectActivityService,
    ApprovalManagementService,

    // ==========================================
    // DOMAIN SERVICES (Pure Business Logic)
    // ==========================================
    ProjectValidator,
    ApprovalValidator,
    ProgressCalculatorService,
    ApprovalWorkflowService,

    // ==========================================
    // INFRASTRUCTURE - REPOSITORY IMPLEMENTATIONS
    // ==========================================
    {
      provide: PROJECT_REPOSITORY,
      useClass: PrismaProjectRepository,
    },
    {
      provide: APPROVAL_REPOSITORY,
      useClass: PrismaApprovalRepository,
    },
  ],
  exports: [
    // Export facade for other modules
    ProjectsRefactoredService,

    // Export application services for direct usage if needed
    ProjectManagementService,
    ProjectProgressService,
    ProjectActivityService,
    ApprovalManagementService,

    // Export domain services for reuse
    ProgressCalculatorService,
    ApprovalWorkflowService,
  ],
})
export class ProjectsRefactoredModule {}
