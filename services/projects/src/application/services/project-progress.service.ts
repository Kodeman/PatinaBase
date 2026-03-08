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

import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ProgressCalculatorService,
  ProjectProgressResult,
  TimelineSegment,
} from '../../domain/services/progress-calculator.service';
import {
  IProjectRepository,
  PROJECT_REPOSITORY,
} from '../../domain/repositories/project.repository.interface';

@Injectable()
export class ProjectProgressService {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly repository: IProjectRepository,
    private readonly progressCalculator: ProgressCalculatorService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Calculate comprehensive project progress
   */
  async calculateProgress(projectId: string): Promise<ProjectProgressResult> {
    // Verify project exists
    const project = await this.repository.findById(projectId);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Get timeline segments
    const segments = await this.prisma.timelineSegment.findMany({
      where: { projectId },
      select: { progress: true, phase: true, status: true },
    });

    // Get task metrics
    const [totalTasks, completedTasks] = await Promise.all([
      this.prisma.task.count({ where: { projectId } }),
      this.prisma.task.count({ where: { projectId, status: 'done' } }),
    ]);

    // Get milestone metrics
    const [totalMilestones, completedMilestones] = await Promise.all([
      this.prisma.milestone.count({ where: { projectId } }),
      this.prisma.milestone.count({ where: { projectId, status: 'completed' } }),
    ]);

    // Use domain service to calculate progress
    return this.progressCalculator.calculateProgress(
      segments as TimelineSegment[],
      {
        startDate: project.startDate,
        endDate: project.endDate,
      },
      {
        total: totalTasks,
        completed: completedTasks,
      },
      {
        total: totalMilestones,
        completed: completedMilestones,
      }
    );
  }

  /**
   * Get simple progress summary
   */
  async getProgressSummary(projectId: string): Promise<{
    overallProgress: number;
    taskCompletionRate: number;
    milestoneCompletionRate: number;
    health: string;
  }> {
    const progress = await this.calculateProgress(projectId);

    let health = 'good';
    if (progress.health.isBehindSchedule) health = 'at_risk';
    if (progress.health.isAheadOfSchedule) health = 'excellent';

    return {
      overallProgress: progress.overallProgress,
      taskCompletionRate: progress.taskCompletionRate,
      milestoneCompletionRate: progress.milestoneCompletionRate,
      health,
    };
  }

  /**
   * Get estimated completion date
   */
  async getEstimatedCompletion(projectId: string): Promise<Date | null> {
    const project = await this.repository.findById(projectId);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const progress = await this.calculateProgress(projectId);

    return this.progressCalculator.calculateEstimatedCompletion(
      progress.overallProgress,
      {
        startDate: project.startDate,
        endDate: project.endDate,
      }
    );
  }

  /**
   * Get schedule variance (SV)
   */
  async getScheduleVariance(projectId: string): Promise<number> {
    const progress = await this.calculateProgress(projectId);

    return this.progressCalculator.calculateScheduleVariance(
      progress.overallProgress,
      progress.timeProgress
    );
  }

  /**
   * Get project phase
   */
  async getProjectPhase(projectId: string): Promise<'planning' | 'execution' | 'closing'> {
    const progress = await this.calculateProgress(projectId);

    return this.progressCalculator.determineProjectPhase(progress.overallProgress);
  }

  /**
   * Get weighted progress (custom weights)
   */
  async getWeightedProgress(
    projectId: string,
    weights: {
      tasks?: number;
      milestones?: number;
      timeline?: number;
    } = {}
  ): Promise<number> {
    const progress = await this.calculateProgress(projectId);

    // Default weights
    const defaultWeights = {
      tasks: 0.4,
      milestones: 0.3,
      timeline: 0.3,
    };

    const finalWeights = { ...defaultWeights, ...weights };

    return this.progressCalculator.calculateWeightedProgress({
      tasks: {
        progress: progress.taskCompletionRate,
        weight: finalWeights.tasks,
      },
      milestones: {
        progress: progress.milestoneCompletionRate,
        weight: finalWeights.milestones,
      },
      timeline: {
        progress: progress.timeProgress,
        weight: finalWeights.timeline,
      },
    });
  }

  /**
   * Get project statistics
   */
  async getStats(projectId: string): Promise<any> {
    return this.repository.getStats(projectId);
  }

  /**
   * Get client-safe project data with progress
   */
  async getClientSafeData(projectId: string, clientId: string): Promise<any> {
    return this.repository.getClientSafeData(projectId, clientId);
  }
}
