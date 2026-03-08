/**
 * Project Progress Service (Application Layer)
 *
 * Orchestrates project progress calculations by coordinating:
 * - ProgressCalculatorService (pure domain logic)
 * - Repository (data access for metrics)
 * - Prisma (for querying progress data)
 *
 * Single Responsibility: Calculating and providing project progress metrics
 */
import { PrismaService } from '../../prisma/prisma.service';
import { ProgressCalculatorService, ProjectProgressResult } from '../../domain/services/progress-calculator.service';
import { IProjectRepository } from '../../domain/repositories/project.repository.interface';
export declare class ProjectProgressService {
    private readonly repository;
    private readonly progressCalculator;
    private readonly prisma;
    constructor(repository: IProjectRepository, progressCalculator: ProgressCalculatorService, prisma: PrismaService);
    /**
     * Calculate comprehensive project progress
     */
    calculateProgress(projectId: string): Promise<ProjectProgressResult>;
    /**
     * Get simple progress summary
     */
    getProgressSummary(projectId: string): Promise<{
        overallProgress: number;
        taskCompletionRate: number;
        milestoneCompletionRate: number;
        health: string;
    }>;
    /**
     * Get estimated completion date
     */
    getEstimatedCompletion(projectId: string): Promise<Date | null>;
    /**
     * Get schedule variance (SV)
     */
    getScheduleVariance(projectId: string): Promise<number>;
    /**
     * Get project phase
     */
    getProjectPhase(projectId: string): Promise<'planning' | 'execution' | 'closing'>;
    /**
     * Get weighted progress (custom weights)
     */
    getWeightedProgress(projectId: string, weights?: {
        tasks?: number;
        milestones?: number;
        timeline?: number;
    }): Promise<number>;
    /**
     * Get project statistics
     */
    getStats(projectId: string): Promise<any>;
    /**
     * Get client-safe project data with progress
     */
    getClientSafeData(projectId: string, clientId: string): Promise<any>;
}
//# sourceMappingURL=project-progress.service.d.ts.map