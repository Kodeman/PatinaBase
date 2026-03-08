import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  ProjectProgressSummaryDto,
  SegmentProgressDto,
  MilestoneMetricsDto,
  ApprovalMetricsDto,
  EngagementMetricsDto,
  ProjectHealthIndicatorDto,
} from './dto/progress-analytics.dto';

@Injectable()
export class ProgressAnalyticsService {
  private readonly logger = new Logger(ProgressAnalyticsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get comprehensive project progress summary
   */
  async getProjectProgress(projectId: string): Promise<ProjectProgressSummaryDto> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        timelineSegments: {
          orderBy: { order: 'asc' },
        },
        milestones: true,
        approvalRecords: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const now = new Date();
    const startDate = project.startDate || project.createdAt;
    const estimatedEndDate = project.endDate || this.calculateEstimatedEndDate(project.timelineSegments);

    const daysElapsed = Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, Math.floor((estimatedEndDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

    // Calculate segment progress
    const segmentProgress = await this.calculateSegmentProgress(project.timelineSegments);

    // Calculate overall progress
    const overallProgress = this.calculateOverallProgress(segmentProgress);

    // Get milestone metrics
    const milestoneMetrics = await this.getMilestoneMetrics(projectId, project.milestones);

    // Get approval metrics
    const approvalMetrics = await this.getApprovalMetrics(projectId, project.approvalRecords);

    // Get engagement metrics
    const engagement = await this.getEngagementMetrics(projectId);

    // Calculate health score and status
    const { healthScore, status } = this.calculateProjectHealth(
      overallProgress,
      daysElapsed,
      daysRemaining,
      milestoneMetrics,
      approvalMetrics,
    );

    // Determine current phase
    const currentPhase = this.determineCurrentPhase(segmentProgress);

    return {
      projectId,
      projectName: project.title,
      overallProgress,
      healthScore,
      status,
      currentPhase,
      startDate,
      estimatedEndDate,
      daysElapsed,
      daysRemaining,
      segmentProgress,
      milestoneMetrics,
      approvalMetrics,
      engagement,
      lastUpdated: now,
    };
  }

  /**
   * Get project health indicators
   */
  async getHealthIndicators(projectId: string): Promise<ProjectHealthIndicatorDto[]> {
    const progress = await this.getProjectProgress(projectId);
    const indicators: ProjectHealthIndicatorDto[] = [];

    // Schedule health
    const scheduleDaysLeft = progress.daysRemaining;
    const progressExpected = (progress.daysElapsed / (progress.daysElapsed + scheduleDaysLeft)) * 100;
    const scheduleVariance = progress.overallProgress - progressExpected;

    indicators.push({
      category: 'schedule',
      score: Math.min(100, Math.max(0, 50 + scheduleVariance)),
      status: scheduleVariance >= -5 ? 'good' : scheduleVariance >= -15 ? 'warning' : 'critical',
      message: scheduleVariance >= 0
        ? `Project is ${Math.abs(Math.round(scheduleVariance))}% ahead of schedule`
        : `Project is ${Math.abs(Math.round(scheduleVariance))}% behind schedule`,
      recommendation: scheduleVariance < -10
        ? 'Consider adjusting timeline or adding resources to catch up'
        : undefined,
    });

    // Approval health
    const approvalScore = progress.approvalMetrics.approvalRate;
    const pendingDays = progress.approvalMetrics.pendingList.length > 0
      ? Math.max(...progress.approvalMetrics.pendingList.map(p => p.daysPending))
      : 0;

    indicators.push({
      category: 'approvals',
      score: approvalScore,
      status: pendingDays <= 3 ? 'good' : pendingDays <= 7 ? 'warning' : 'critical',
      message: progress.approvalMetrics.pendingApprovals === 0
        ? 'All approvals are up to date'
        : `${progress.approvalMetrics.pendingApprovals} approval(s) pending`,
      recommendation: pendingDays > 5
        ? 'Follow up on pending approvals to avoid delays'
        : undefined,
    });

    // Engagement health
    const engagementScore = Math.min(100, (progress.engagement.uniqueSessions / 10) * 100);
    const daysSinceVisit = progress.engagement.daysSinceLastVisit;

    indicators.push({
      category: 'engagement',
      score: engagementScore,
      status: daysSinceVisit <= 7 ? 'good' : daysSinceVisit <= 14 ? 'warning' : 'critical',
      message: daysSinceVisit === 0
        ? 'Client viewed timeline today'
        : `Last client visit was ${daysSinceVisit} day(s) ago`,
      recommendation: daysSinceVisit > 14
        ? 'Reach out to client to maintain engagement'
        : undefined,
    });

    // Milestone health
    const milestoneScore = progress.milestoneMetrics.onTimeCompletionRate;
    const overdueMilestones = progress.milestoneMetrics.overdueMilestones;

    indicators.push({
      category: 'milestones',
      score: milestoneScore,
      status: overdueMilestones === 0 ? 'good' : overdueMilestones === 1 ? 'warning' : 'critical',
      message: overdueMilestones === 0
        ? 'All milestones on track'
        : `${overdueMilestones} milestone(s) are overdue`,
      recommendation: overdueMilestones > 0
        ? 'Address overdue milestones to maintain project momentum'
        : undefined,
    });

    return indicators;
  }

  /**
   * Record timeline view event for engagement tracking
   */
  async recordTimelineView(projectId: string, userId: string, sessionId: string, durationSeconds?: number) {
    try {
      // Log to audit table for analytics
      await this.prisma.auditLog.create({
        data: {
          entityType: 'timeline_view',
          entityId: projectId,
          action: 'viewed',
          actor: userId,
          metadata: {
            sessionId,
            durationSeconds,
            viewedAt: new Date(),
          },
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to record timeline view: ${(error as Error).message}`);
    }
  }

  /**
   * Record media gallery open event
   */
  async recordMediaGalleryOpen(projectId: string, segmentId: string, userId: string) {
    try {
      await this.prisma.auditLog.create({
        data: {
          entityType: 'media_gallery',
          entityId: segmentId,
          action: 'opened',
          actor: userId,
          metadata: { projectId },
        },
      });
    } catch (error) {
      this.logger.warn(`Failed to record gallery open: ${(error as Error).message}`);
    }
  }

  // Private helper methods

  private calculateEstimatedEndDate(segments: any[]): Date {
    if (segments.length === 0) {
      return new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // Default 90 days
    }
    const latestEnd = segments.reduce((latest, seg) => {
      const endDate = new Date(seg.endDate);
      return endDate > latest ? endDate : latest;
    }, new Date(0));
    return latestEnd;
  }

  private async calculateSegmentProgress(segments: any[]): Promise<SegmentProgressDto[]> {
    const now = new Date();

    return segments.map(seg => {
      const startDate = new Date(seg.startDate);
      const endDate = new Date(seg.endDate);
      const totalDays = Math.max(1, Math.floor((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      const daysElapsed = Math.max(0, Math.floor((now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)));
      const daysRemaining = Math.max(0, Math.floor((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

      const expectedProgress = Math.min(100, (daysElapsed / totalDays) * 100);
      const onTrack = seg.progress >= expectedProgress - 10; // 10% tolerance

      // Estimate completion based on current velocity
      let estimatedCompletionDate: Date | undefined;
      if (seg.progress > 0 && seg.progress < 100) {
        const velocity = seg.progress / Math.max(1, daysElapsed);
        const daysToComplete = (100 - seg.progress) / velocity;
        estimatedCompletionDate = new Date(now.getTime() + daysToComplete * 24 * 60 * 60 * 1000);
      }

      return {
        segmentId: seg.id,
        title: seg.title,
        phase: seg.phase,
        progress: seg.progress,
        status: seg.status,
        daysElapsed,
        daysRemaining,
        onTrack,
        estimatedCompletionDate,
      };
    });
  }

  private calculateOverallProgress(segments: SegmentProgressDto[]): number {
    if (segments.length === 0) return 0;
    const totalProgress = segments.reduce((sum, seg) => sum + seg.progress, 0);
    return Math.round(totalProgress / segments.length);
  }

  private async getMilestoneMetrics(projectId: string, milestones: any[]): Promise<MilestoneMetricsDto> {
    const now = new Date();
    const completed = milestones.filter(m => m.status === 'completed');
    const upcoming = milestones.filter(m => m.status !== 'completed' && new Date(m.targetDate) >= now);
    const overdue = milestones.filter(m => m.status !== 'completed' && new Date(m.targetDate) < now);

    // Calculate on-time completion rate
    const onTimeCompleted = completed.filter(m => {
      const completedAt = m.completedAt ? new Date(m.completedAt) : null;
      const targetDate = new Date(m.targetDate);
      return completedAt && completedAt <= targetDate;
    });
    const onTimeCompletionRate = completed.length > 0
      ? Math.round((onTimeCompleted.length / completed.length) * 100)
      : 100;

    // Calculate average completion days
    const completionDays = completed
      .filter(m => m.completedAt)
      .map(m => {
        const start = m.createdAt ? new Date(m.createdAt) : now;
        const end = new Date(m.completedAt);
        return Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      });
    const avgCompletionDays = completionDays.length > 0
      ? Math.round(completionDays.reduce((a, b) => a + b, 0) / completionDays.length)
      : 0;

    // Get next upcoming milestone
    const sortedUpcoming = upcoming.sort((a, b) =>
      new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime()
    );
    const nextMilestone = sortedUpcoming[0]
      ? {
          id: sortedUpcoming[0].id,
          title: sortedUpcoming[0].title,
          targetDate: new Date(sortedUpcoming[0].targetDate),
          daysUntil: Math.floor(
            (new Date(sortedUpcoming[0].targetDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          ),
        }
      : undefined;

    return {
      totalMilestones: milestones.length,
      completedMilestones: completed.length,
      upcomingMilestones: upcoming.length,
      overdueMilestones: overdue.length,
      onTimeCompletionRate,
      avgCompletionDays,
      nextMilestone,
    };
  }

  private async getApprovalMetrics(projectId: string, approvals: any[]): Promise<ApprovalMetricsDto> {
    const now = new Date();
    const pending = approvals.filter(a => a.status === 'pending');
    const approved = approvals.filter(a => a.status === 'approved');
    const rejected = approvals.filter(a => a.status === 'rejected');
    const needsDiscussion = approvals.filter(a => a.status === 'needs_discussion');

    // Calculate average response time for completed approvals
    const completedApprovals = approvals.filter(a => a.status !== 'pending' && (a.approvedAt || a.rejectedAt));
    const responseTimes = completedApprovals.map(a => {
      const created = new Date(a.createdAt);
      const responded = new Date(a.approvedAt || a.rejectedAt);
      return (responded.getTime() - created.getTime()) / (1000 * 60 * 60); // hours
    });
    const avgResponseTimeHours = responseTimes.length > 0
      ? Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      : 0;

    // Calculate approval rate
    const totalDecided = approved.length + rejected.length;
    const approvalRate = totalDecided > 0
      ? Math.round((approved.length / totalDecided) * 100)
      : 100;

    // Build pending list with priority
    const pendingList = pending.map(a => {
      const createdAt = new Date(a.createdAt);
      const daysPending = Math.floor((now.getTime() - createdAt.getTime()) / (1000 * 60 * 60 * 24));

      let priority: 'low' | 'normal' | 'high' | 'urgent' = 'normal';
      if (a.dueDate) {
        const dueDate = new Date(a.dueDate);
        const daysUntilDue = Math.floor((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (daysUntilDue < 0) priority = 'urgent';
        else if (daysUntilDue <= 2) priority = 'high';
        else if (daysUntilDue <= 7) priority = 'normal';
        else priority = 'low';
      } else if (daysPending > 7) {
        priority = 'high';
      }

      return {
        id: a.id,
        title: a.title,
        type: a.approvalType,
        dueDate: a.dueDate ? new Date(a.dueDate) : undefined,
        daysPending,
        priority,
      };
    }).sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return {
      totalApprovals: approvals.length,
      pendingApprovals: pending.length,
      approvedCount: approved.length,
      rejectedCount: rejected.length,
      needsDiscussionCount: needsDiscussion.length,
      avgResponseTimeHours,
      approvalRate,
      pendingList,
    };
  }

  private async getEngagementMetrics(projectId: string): Promise<EngagementMetricsDto> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    // Query audit logs for engagement metrics
    const viewLogs = await this.prisma.auditLog.findMany({
      where: {
        entityType: 'timeline_view',
        entityId: projectId,
        createdAt: { gte: thirtyDaysAgo },
      },
      orderBy: { createdAt: 'desc' },
    });

    const uniqueSessions = new Set(viewLogs.map(l => (l.metadata as any)?.sessionId)).size;
    const totalViews = viewLogs.length;

    // Calculate average view duration
    const durations = viewLogs
      .map(l => (l.metadata as any)?.durationSeconds)
      .filter(d => typeof d === 'number');
    const avgViewDurationSeconds = durations.length > 0
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : 0;

    // Get celebration views
    const celebrationLogs = await this.prisma.auditLog.count({
      where: {
        entityType: 'celebration',
        action: 'viewed',
        createdAt: { gte: thirtyDaysAgo },
        metadata: { path: ['projectId'], equals: projectId },
      },
    });

    // Get media gallery opens
    const galleryLogs = await this.prisma.auditLog.count({
      where: {
        entityType: 'media_gallery',
        action: 'opened',
        createdAt: { gte: thirtyDaysAgo },
        metadata: { path: ['projectId'], equals: projectId },
      },
    });

    // Calculate days since last visit
    const lastView = viewLogs[0];
    const daysSinceLastVisit = lastView
      ? Math.floor((Date.now() - new Date(lastView.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      : 30;

    // Get popular segments (would need segment-level tracking)
    const popularSegments: { segmentId: string; title: string; viewCount: number }[] = [];

    return {
      totalViews,
      uniqueSessions,
      avgViewDurationSeconds,
      popularSegments,
      celebrationViews: celebrationLogs,
      mediaGalleryOpens: galleryLogs,
      daysSinceLastVisit,
    };
  }

  private calculateProjectHealth(
    overallProgress: number,
    daysElapsed: number,
    daysRemaining: number,
    milestoneMetrics: MilestoneMetricsDto,
    approvalMetrics: ApprovalMetricsDto,
  ): { healthScore: number; status: 'on_track' | 'at_risk' | 'behind' | 'ahead' } {
    // Calculate expected progress based on time
    const totalDays = daysElapsed + daysRemaining;
    const expectedProgress = totalDays > 0 ? (daysElapsed / totalDays) * 100 : 0;
    const progressVariance = overallProgress - expectedProgress;

    // Component scores
    const scheduleScore = Math.min(100, Math.max(0, 50 + progressVariance));
    const milestoneScore = milestoneMetrics.onTimeCompletionRate;
    const approvalScore = approvalMetrics.approvalRate;
    const pendingPenalty = Math.min(20, approvalMetrics.pendingApprovals * 5);

    // Weighted health score
    const healthScore = Math.round(
      scheduleScore * 0.4 +
      milestoneScore * 0.3 +
      (approvalScore - pendingPenalty) * 0.3
    );

    // Determine status
    let status: 'on_track' | 'at_risk' | 'behind' | 'ahead';
    if (progressVariance > 10) {
      status = 'ahead';
    } else if (progressVariance >= -5) {
      status = 'on_track';
    } else if (progressVariance >= -15) {
      status = 'at_risk';
    } else {
      status = 'behind';
    }

    return { healthScore: Math.max(0, Math.min(100, healthScore)), status };
  }

  private determineCurrentPhase(segments: SegmentProgressDto[]): string {
    // Find the segment that's currently in progress (not 100% but has started)
    const inProgress = segments.find(s => s.progress > 0 && s.progress < 100);
    if (inProgress) return inProgress.phase;

    // Find the last completed segment
    const completed = segments.filter(s => s.progress === 100);
    if (completed.length > 0) return completed[completed.length - 1].phase;

    // Return first segment's phase if nothing started
    return segments[0]?.phase || 'planning';
  }
}
