/**
 * Project Activity Service (Application Layer)
 *
 * Orchestrates project activity tracking and event retrieval.
 *
 * Single Responsibility: Managing project activity feeds and upcoming events
 */

import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IProjectRepository,
  PROJECT_REPOSITORY,
} from '../../domain/repositories/project.repository.interface';

@Injectable()
export class ProjectActivityService {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly repository: IProjectRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Generate activity feed for a project
   */
  async getActivityFeed(
    projectId: string,
    limit = 50,
    offset = 0
  ): Promise<{
    activities: any[];
    total: number;
    hasMore: boolean;
  }> {
    // Verify project exists
    const projectExists = await this.repository.exists(projectId);

    if (!projectExists) {
      throw new NotFoundException('Project not found');
    }

    // Get audit log activities
    const activities = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: 'project', entityId: projectId },
          {
            entityType: 'timeline_segment',
            metadata: { path: ['projectId'], equals: projectId },
          },
          {
            entityType: 'approval_record',
            metadata: { path: ['projectId'], equals: projectId },
          },
          { entityType: 'task' },
          { entityType: 'milestone' },
          { entityType: 'change_order' },
          { entityType: 'rfi' },
          { entityType: 'issue' },
          { entityType: 'daily_log' },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    // Get client activities
    const clientActivities = await this.prisma.clientActivity.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: Math.floor(limit / 2),
    });

    // Combine and sort
    const allActivities = [
      ...activities.map((a) => ({
        id: a.id,
        type: 'audit',
        entityType: a.entityType,
        action: a.action,
        actor: a.actor,
        timestamp: a.createdAt,
        metadata: a.metadata,
      })),
      ...clientActivities.map((a) => ({
        id: a.id,
        type: 'client_activity',
        activityType: a.activityType,
        userId: a.userId,
        entityType: a.entityType,
        entityId: a.entityId,
        timestamp: a.createdAt,
        duration: a.duration,
      })),
    ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return {
      activities: allActivities.slice(0, limit),
      total: allActivities.length,
      hasMore: allActivities.length > limit,
    };
  }

  /**
   * Get upcoming events and deadlines for a project
   */
  async getUpcomingEvents(
    projectId: string,
    daysAhead = 30
  ): Promise<{
    milestones: any[];
    tasks: any[];
    approvals: any[];
    segments: any[];
    totalEvents: number;
  }> {
    // Verify project exists
    const projectExists = await this.repository.exists(projectId);

    if (!projectExists) {
      throw new NotFoundException('Project not found');
    }

    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    const [upcomingMilestones, upcomingTasks, upcomingApprovals, upcomingSegments] =
      await Promise.all([
        this.prisma.milestone.findMany({
          where: {
            projectId,
            targetDate: { gte: now, lte: futureDate },
            status: { in: ['pending', 'delayed'] },
          },
          orderBy: { targetDate: 'asc' },
        }),
        this.prisma.task.findMany({
          where: {
            projectId,
            dueDate: { gte: now, lte: futureDate },
            status: { notIn: ['done', 'cancelled'] },
          },
          orderBy: { dueDate: 'asc' },
        }),
        this.prisma.approvalRecord.findMany({
          where: {
            projectId,
            dueDate: { gte: now, lte: futureDate },
            status: { in: ['pending', 'needs_discussion'] },
          },
          orderBy: { dueDate: 'asc' },
        }),
        this.prisma.timelineSegment.findMany({
          where: {
            projectId,
            OR: [
              { startDate: { gte: now, lte: futureDate } },
              { endDate: { gte: now, lte: futureDate } },
            ],
          },
          orderBy: { startDate: 'asc' },
        }),
      ]);

    return {
      milestones: upcomingMilestones,
      tasks: upcomingTasks,
      approvals: upcomingApprovals,
      segments: upcomingSegments,
      totalEvents:
        upcomingMilestones.length + upcomingTasks.length + upcomingApprovals.length,
    };
  }

  /**
   * Get recent activity summary (last N days)
   */
  async getRecentActivitySummary(
    projectId: string,
    days = 7
  ): Promise<{
    tasksCompleted: number;
    approvalsGranted: number;
    milestonesReached: number;
    issuesResolved: number;
  }> {
    const projectExists = await this.repository.exists(projectId);

    if (!projectExists) {
      throw new NotFoundException('Project not found');
    }

    const since = new Date();
    since.setDate(since.getDate() - days);

    const [tasksCompleted, approvalsGranted, milestonesReached, issuesResolved] =
      await Promise.all([
        this.prisma.task.count({
          where: {
            projectId,
            status: 'done',
            completedAt: { gte: since },
          },
        }),
        this.prisma.approvalRecord.count({
          where: {
            projectId,
            status: 'approved',
            approvedAt: { gte: since },
          },
        }),
        this.prisma.milestone.count({
          where: {
            projectId,
            status: 'completed',
            completedAt: { gte: since },
          },
        }),
        this.prisma.issue.count({
          where: {
            projectId,
            status: 'resolved',
            resolvedAt: { gte: since },
          },
        }),
      ]);

    return {
      tasksCompleted,
      approvalsGranted,
      milestonesReached,
      issuesResolved,
    };
  }

  /**
   * Get activity heatmap (activity by day)
   */
  async getActivityHeatmap(
    projectId: string,
    days = 30
  ): Promise<Array<{ date: string; count: number }>> {
    const projectExists = await this.repository.exists(projectId);

    if (!projectExists) {
      throw new NotFoundException('Project not found');
    }

    const since = new Date();
    since.setDate(since.getDate() - days);

    const activities = await this.prisma.auditLog.findMany({
      where: {
        OR: [
          { entityType: 'project', entityId: projectId },
          {
            entityType: 'timeline_segment',
            metadata: { path: ['projectId'], equals: projectId },
          },
        ],
        createdAt: { gte: since },
      },
      select: { createdAt: true },
    });

    // Group by date
    const heatmap: Record<string, number> = {};

    activities.forEach((activity) => {
      const date = activity.createdAt.toISOString().split('T')[0];
      heatmap[date] = (heatmap[date] || 0) + 1;
    });

    // Convert to array
    return Object.entries(heatmap)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }
}
