import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get comprehensive engagement metrics for a project
   */
  async getProjectEngagement(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, clientId: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Get or create engagement metrics
    let metrics = await this.prisma.engagementMetrics.findUnique({
      where: { projectId },
    });

    if (!metrics) {
      metrics = await this.prisma.engagementMetrics.create({
        data: {
          projectId,
          clientId: project.clientId,
        },
      });
    }

    // Get recent activity breakdown
    const activityBreakdown = await this.getActivityBreakdown(projectId);

    // Get time-based analytics
    const timeAnalytics = await this.getTimeBasedAnalytics(projectId);

    return {
      ...metrics,
      activityBreakdown,
      timeAnalytics,
    };
  }

  /**
   * Get activity breakdown by type
   */
  async getActivityBreakdown(projectId: string, days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const activities = await this.prisma.clientActivity.findMany({
      where: {
        projectId,
        createdAt: { gte: cutoffDate },
      },
      select: {
        activityType: true,
        duration: true,
        createdAt: true,
      },
    });

    // Group by activity type
    const breakdown = activities.reduce((acc, activity) => {
      if (!acc[activity.activityType]) {
        acc[activity.activityType] = {
          count: 0,
          totalDuration: 0,
        };
      }
      acc[activity.activityType].count += 1;
      acc[activity.activityType].totalDuration += activity.duration || 0;
      return acc;
    }, {} as Record<string, { count: number; totalDuration: number }>);

    return {
      periodDays: days,
      totalActivities: activities.length,
      breakdown,
    };
  }

  /**
   * Get time-based analytics (daily/weekly patterns)
   */
  async getTimeBasedAnalytics(projectId: string, days = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const activities = await this.prisma.clientActivity.findMany({
      where: {
        projectId,
        createdAt: { gte: cutoffDate },
      },
      select: {
        createdAt: true,
        activityType: true,
        duration: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group by date
    const byDate = activities.reduce((acc, activity) => {
      const date = activity.createdAt.toISOString().split('T')[0];
      if (!acc[date]) {
        acc[date] = {
          count: 0,
          duration: 0,
          activities: {},
        };
      }
      acc[date].count += 1;
      acc[date].duration += activity.duration || 0;
      acc[date].activities[activity.activityType] = (acc[date].activities[activity.activityType] || 0) + 1;
      return acc;
    }, {} as Record<string, any>);

    // Calculate peak engagement times
    const hourlyDistribution = activities.reduce((acc, activity) => {
      const hour = activity.createdAt.getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    const peakHour = Object.entries(hourlyDistribution).reduce((max, [hour, count]) => {
      return count > (max.count || 0) ? { hour: parseInt(hour), count } : max;
    }, { hour: 0, count: 0 });

    return {
      periodDays: days,
      dailyActivity: byDate,
      hourlyDistribution,
      peakEngagementHour: peakHour.hour,
      totalEngagementMinutes: Math.round(
        activities.reduce((sum, a) => sum + (a.duration || 0), 0) / 60
      ),
    };
  }

  /**
   * Get user-specific analytics
   */
  async getUserAnalytics(userId: string, projectId?: string) {
    const where: any = { userId };
    if (projectId) where.projectId = projectId;

    const activities = await this.prisma.clientActivity.findMany({
      where,
      select: {
        projectId: true,
        activityType: true,
        duration: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 1000, // Limit for performance
    });

    // Calculate metrics
    const totalActivities = activities.length;
    const totalTimeSpent = activities.reduce((sum, a) => sum + (a.duration || 0), 0);
    const lastActivity = activities.length > 0 ? activities[0].createdAt : null;

    // Group by project
    const byProject = activities.reduce((acc, activity) => {
      const pid = activity.projectId;
      if (!acc[pid]) {
        acc[pid] = {
          count: 0,
          duration: 0,
          lastActivity: activity.createdAt,
        };
      }
      acc[pid].count += 1;
      acc[pid].duration += activity.duration || 0;
      return acc;
    }, {} as Record<string, any>);

    // Activity type distribution
    const byType = activities.reduce((acc, activity) => {
      acc[activity.activityType] = (acc[activity.activityType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      userId,
      totalActivities,
      totalTimeSpentSeconds: totalTimeSpent,
      lastActivity,
      projectCount: Object.keys(byProject).length,
      byProject,
      byType,
    };
  }

  /**
   * Get interaction tracking for specific entities
   */
  async getEntityInteractions(
    projectId: string,
    entityType: string,
    entityId: string,
  ) {
    const interactions = await this.prisma.clientActivity.findMany({
      where: {
        projectId,
        entityType,
        entityId,
      },
      orderBy: { createdAt: 'desc' },
    });

    const uniqueUsers = new Set(interactions.map(i => i.userId)).size;
    const totalViews = interactions.filter(i => i.activityType === 'view').length;
    const totalTimeSpent = interactions.reduce((sum, i) => sum + (i.duration || 0), 0);

    // Group by user
    const byUser = interactions.reduce((acc, interaction) => {
      if (!acc[interaction.userId]) {
        acc[interaction.userId] = {
          count: 0,
          duration: 0,
          lastInteraction: interaction.createdAt,
        };
      }
      acc[interaction.userId].count += 1;
      acc[interaction.userId].duration += interaction.duration || 0;
      return acc;
    }, {} as Record<string, any>);

    return {
      entityType,
      entityId,
      totalInteractions: interactions.length,
      uniqueUsers,
      totalViews,
      totalTimeSpentSeconds: totalTimeSpent,
      byUser,
    };
  }

  /**
   * Calculate approval velocity metrics
   */
  async getApprovalVelocity(projectId: string) {
    const approvals = await this.prisma.approvalRecord.findMany({
      where: { projectId },
      select: {
        createdAt: true,
        approvedAt: true,
        rejectedAt: true,
        status: true,
        priority: true,
      },
    });

    if (approvals.length === 0) {
      return {
        avgApprovalTimeDays: 0,
        totalApprovals: 0,
        approvedCount: 0,
        rejectedCount: 0,
        pendingCount: 0,
        approvalRate: 0,
      };
    }

    // Calculate average approval time
    const processedApprovals = approvals.filter(a => a.approvedAt || a.rejectedAt);
    const totalDays = processedApprovals.reduce((sum, approval) => {
      const endDate = approval.approvedAt || approval.rejectedAt;
      if (!endDate) return sum;
      const diff = endDate.getTime() - approval.createdAt.getTime();
      return sum + (diff / (1000 * 60 * 60 * 24));
    }, 0);

    const avgApprovalTimeDays = processedApprovals.length > 0
      ? totalDays / processedApprovals.length
      : 0;

    // Count by status
    const approvedCount = approvals.filter(a => a.status === 'approved').length;
    const rejectedCount = approvals.filter(a => a.status === 'rejected').length;
    const pendingCount = approvals.filter(a => a.status === 'pending' || a.status === 'needs_discussion').length;

    // Approval rate
    const approvalRate = processedApprovals.length > 0
      ? (approvedCount / processedApprovals.length) * 100
      : 0;

    // Average by priority
    const byPriority = approvals.reduce((acc, approval) => {
      if (!acc[approval.priority]) {
        acc[approval.priority] = {
          count: 0,
          totalDays: 0,
        };
      }
      acc[approval.priority].count += 1;

      const endDate = approval.approvedAt || approval.rejectedAt;
      if (endDate) {
        const diff = endDate.getTime() - approval.createdAt.getTime();
        acc[approval.priority].totalDays += diff / (1000 * 60 * 60 * 24);
      }
      return acc;
    }, {} as Record<string, { count: number; totalDays: number }>);

    const avgByPriority = Object.entries(byPriority).reduce((acc, [priority, data]) => {
      acc[priority] = data.count > 0 ? data.totalDays / data.count : 0;
      return acc;
    }, {} as Record<string, number>);

    return {
      avgApprovalTimeDays: Math.round(avgApprovalTimeDays * 10) / 10,
      totalApprovals: approvals.length,
      approvedCount,
      rejectedCount,
      pendingCount,
      approvalRate: Math.round(approvalRate * 10) / 10,
      avgByPriority,
    };
  }

  /**
   * Calculate response rate and satisfaction metrics
   */
  async getClientSatisfactionMetrics(projectId: string) {
    const metrics = await this.prisma.engagementMetrics.findUnique({
      where: { projectId },
    });

    if (!metrics) {
      return {
        responseRate: 0,
        satisfactionScore: null,
        totalApprovals: 0,
        totalRejections: 0,
      };
    }

    // Calculate response rate
    const totalRequests = metrics.approvalsCount + metrics.rejectionsCount;
    const responseRate = totalRequests > 0
      ? ((metrics.approvalsCount + metrics.rejectionsCount) / totalRequests) * 100
      : 0;

    return {
      responseRate: Math.round(responseRate * 10) / 10,
      satisfactionScore: metrics.satisfactionScore,
      totalApprovals: metrics.approvalsCount,
      totalRejections: metrics.rejectionsCount,
      totalComments: metrics.commentsCount,
      totalViews: metrics.totalViews,
      totalTimeSpentHours: Math.round((metrics.totalTimeSpent / 3600) * 10) / 10,
      lastActivity: metrics.lastActivity,
    };
  }

  /**
   * Get comprehensive dashboard analytics
   */
  async getDashboardAnalytics(projectId: string) {
    const [
      engagement,
      approvalVelocity,
      satisfaction,
      activityBreakdown,
    ] = await Promise.all([
      this.getProjectEngagement(projectId),
      this.getApprovalVelocity(projectId),
      this.getClientSatisfactionMetrics(projectId),
      this.getActivityBreakdown(projectId, 7), // Last 7 days
    ]);

    return {
      projectId,
      engagement,
      approvalVelocity,
      satisfaction,
      recentActivity: activityBreakdown,
      generatedAt: new Date(),
    };
  }

  /**
   * Update satisfaction score for a project
   */
  async updateSatisfactionScore(projectId: string, score: number) {
    if (score < 1 || score > 5) {
      throw new Error('Satisfaction score must be between 1 and 5');
    }

    const metrics = await this.prisma.engagementMetrics.findUnique({
      where: { projectId },
    });

    if (!metrics) {
      throw new NotFoundException('Engagement metrics not found');
    }

    return this.prisma.engagementMetrics.update({
      where: { projectId },
      data: { satisfactionScore: score },
    });
  }
}
