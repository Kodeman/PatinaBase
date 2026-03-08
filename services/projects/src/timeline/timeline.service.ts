import { Injectable, NotFoundException, Logger, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTimelineSegmentDto } from './dto/create-timeline-segment.dto';
import { UpdateTimelineSegmentDto } from './dto/update-timeline-segment.dto';
import { LogActivityDto } from './dto/log-activity.dto';
import {
  ImmersiveTimelineDto,
  ImmersiveSegmentDto,
  MilestoneCelebrationDto,
  TimelineMediaDto,
} from './dto/immersive-timeline.dto';

@Injectable()
export class TimelineService {
  private readonly logger = new Logger(TimelineService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Create a new timeline segment for a project
   */
  async createSegment(projectId: string, createDto: CreateTimelineSegmentDto, userId: string) {
    // Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, clientId: true, designerId: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Validate dependencies if provided
    if (createDto.dependencies && createDto.dependencies.length > 0) {
      const existingSegments = await this.prisma.timelineSegment.findMany({
        where: {
          projectId,
          id: { in: createDto.dependencies },
        },
        select: { id: true },
      });

      if (existingSegments.length !== createDto.dependencies.length) {
        throw new BadRequestException('One or more dependency segments not found');
      }
    }

    const segment = await this.prisma.timelineSegment.create({
      data: {
        projectId,
        title: createDto.title,
        description: createDto.description,
        phase: createDto.phase,
        startDate: new Date(createDto.startDate),
        endDate: new Date(createDto.endDate),
        progress: createDto.progress || 0,
        dependencies: createDto.dependencies || [],
        deliverables: createDto.deliverables || [],
        order: createDto.order ?? 0,
        metadata: createDto.metadata,
      },
      include: {
        approvals: {
          where: { status: 'pending' },
          orderBy: { dueDate: 'asc' },
        },
      },
    });

    // Emit event
    this.eventEmitter.emit('timeline.segment.created', {
      projectId,
      segmentId: segment.id,
      clientId: project.clientId,
      userId,
      timestamp: new Date(),
    });

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'timeline_segment',
        entityId: segment.id,
        action: 'created',
        actor: userId,
        metadata: { projectId },
      },
    });

    return segment;
  }

  /**
   * Get full timeline for a project
   */
  async getProjectTimeline(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, startDate: true, endDate: true, status: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const segments = await this.prisma.timelineSegment.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
      include: {
        approvals: {
          where: { status: { in: ['pending', 'needs_discussion'] } },
          orderBy: { dueDate: 'asc' },
        },
        _count: {
          select: {
            activities: true,
            approvals: true,
          },
        },
      },
    });

    // Calculate overall timeline progress
    const totalProgress = segments.length > 0
      ? Math.round(segments.reduce((sum, seg) => sum + seg.progress, 0) / segments.length)
      : 0;

    return {
      projectId,
      projectStatus: project.status,
      startDate: project.startDate,
      endDate: project.endDate,
      overallProgress: totalProgress,
      segmentCount: segments.length,
      segments,
    };
  }

  /**
   * Get specific timeline segment with details
   */
  async getSegment(projectId: string, segmentId: string) {
    const segment = await this.prisma.timelineSegment.findFirst({
      where: {
        id: segmentId,
        projectId,
      },
      include: {
        approvals: {
          orderBy: { createdAt: 'desc' },
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 50, // Recent activities
        },
        _count: {
          select: {
            activities: true,
            approvals: true,
          },
        },
      },
    });

    if (!segment) {
      throw new NotFoundException('Timeline segment not found');
    }

    // Get dependent segments
    let dependentSegments: Array<{
      id: string;
      title: string;
      status: string;
      progress: number;
      endDate: Date;
    }> = [];
    if (segment.dependencies && Array.isArray(segment.dependencies) && segment.dependencies.length > 0) {
      dependentSegments = await this.prisma.timelineSegment.findMany({
        where: {
          id: { in: segment.dependencies as string[] },
        },
        select: {
          id: true,
          title: true,
          status: true,
          progress: true,
          endDate: true,
        },
      });
    }

    return {
      ...segment,
      dependentSegments,
    };
  }

  /**
   * Update timeline segment
   */
  async updateSegment(
    projectId: string,
    segmentId: string,
    updateDto: UpdateTimelineSegmentDto,
    userId: string,
  ) {
    const existing = await this.prisma.timelineSegment.findFirst({
      where: {
        id: segmentId,
        projectId,
      },
      select: { id: true, status: true, progress: true },
    });

    if (!existing) {
      throw new NotFoundException('Timeline segment not found');
    }

    const updated = await this.prisma.timelineSegment.update({
      where: { id: segmentId },
      data: {
        title: updateDto.title,
        description: updateDto.description,
        phase: updateDto.phase,
        startDate: updateDto.startDate ? new Date(updateDto.startDate) : undefined,
        endDate: updateDto.endDate ? new Date(updateDto.endDate) : undefined,
        status: updateDto.status,
        progress: updateDto.progress,
        dependencies: updateDto.dependencies,
        deliverables: updateDto.deliverables,
        order: updateDto.order,
        metadata: updateDto.metadata,
      },
    });

    // Emit event if status or progress changed significantly
    if (
      (updateDto.status && updateDto.status !== existing.status) ||
      (updateDto.progress !== undefined && Math.abs(updateDto.progress - existing.progress) >= 10)
    ) {
      this.eventEmitter.emit('timeline.segment.updated', {
        projectId,
        segmentId,
        oldStatus: existing.status,
        newStatus: updateDto.status,
        oldProgress: existing.progress,
        newProgress: updateDto.progress,
        userId,
        timestamp: new Date(),
      });
    }

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'timeline_segment',
        entityId: segmentId,
        action: 'updated',
        actor: userId,
        changes: updateDto as any,
      },
    });

    return updated;
  }

  /**
   * Log client activity
   */
  async logActivity(
    projectId: string,
    logDto: LogActivityDto,
    userId: string,
    ipAddress?: string,
    userAgent?: string,
  ) {
    // Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, clientId: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const activity = await this.prisma.clientActivity.create({
      data: {
        projectId,
        segmentId: logDto.segmentId,
        userId,
        activityType: logDto.activityType,
        entityType: logDto.entityType,
        entityId: logDto.entityId,
        duration: logDto.duration,
        metadata: logDto.metadata,
        ipAddress,
        userAgent,
      },
    });

    // Update engagement metrics asynchronously
    this.updateEngagementMetrics(projectId, userId, logDto.activityType, logDto.duration).catch(err => {
      this.logger.error(`Failed to update engagement metrics: ${err.message}`);
    });

    // Emit real-time event
    this.eventEmitter.emit('activity.logged', {
      projectId,
      userId,
      activityType: logDto.activityType,
      timestamp: new Date(),
    });

    return activity;
  }

  /**
   * Get upcoming events/milestones for a project
   */
  async getUpcomingEvents(projectId: string, daysAhead = 30) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const now = new Date();
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + daysAhead);

    // Get upcoming segment start/end dates
    const upcomingSegments = await this.prisma.timelineSegment.findMany({
      where: {
        projectId,
        OR: [
          {
            startDate: {
              gte: now,
              lte: futureDate,
            },
          },
          {
            endDate: {
              gte: now,
              lte: futureDate,
            },
          },
        ],
      },
      orderBy: { startDate: 'asc' },
      select: {
        id: true,
        title: true,
        phase: true,
        startDate: true,
        endDate: true,
        status: true,
      },
    });

    // Get upcoming milestones
    const upcomingMilestones = await this.prisma.milestone.findMany({
      where: {
        projectId,
        targetDate: {
          gte: now,
          lte: futureDate,
        },
        status: { in: ['pending', 'delayed'] },
      },
      orderBy: { targetDate: 'asc' },
    });

    // Get pending approvals with due dates
    const pendingApprovals = await this.prisma.approvalRecord.findMany({
      where: {
        projectId,
        status: 'pending',
        dueDate: {
          gte: now,
          lte: futureDate,
        },
      },
      orderBy: { dueDate: 'asc' },
    });

    return {
      segments: upcomingSegments,
      milestones: upcomingMilestones,
      approvals: pendingApprovals,
    };
  }

  /**
   * Calculate and return progress metrics for a project
   */
  async getProgressMetrics(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        status: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Get all segments with their progress
    const segments = await this.prisma.timelineSegment.findMany({
      where: { projectId },
      select: {
        phase: true,
        progress: true,
        status: true,
      },
    });

    // Calculate overall progress
    const overallProgress = segments.length > 0
      ? Math.round(segments.reduce((sum, seg) => sum + seg.progress, 0) / segments.length)
      : 0;

    // Progress by phase
    const progressByPhase = segments.reduce((acc, seg) => {
      if (!acc[seg.phase]) {
        acc[seg.phase] = { total: 0, count: 0 };
      }
      acc[seg.phase].total += seg.progress;
      acc[seg.phase].count += 1;
      return acc;
    }, {} as Record<string, { total: number; count: number }>);

    const phaseProgress = Object.entries(progressByPhase).reduce((acc, [phase, data]) => {
      acc[phase] = Math.round(data.total / data.count);
      return acc;
    }, {} as Record<string, number>);

    // Status distribution
    const statusDistribution = segments.reduce((acc, seg) => {
      acc[seg.status] = (acc[seg.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Calculate time progress
    let timeProgress = 0;
    if (project.startDate && project.endDate) {
      const totalDuration = project.endDate.getTime() - project.startDate.getTime();
      const elapsed = Date.now() - project.startDate.getTime();
      timeProgress = Math.min(100, Math.max(0, Math.round((elapsed / totalDuration) * 100)));
    }

    // Get milestone completion rate
    const milestones = await this.prisma.milestone.findMany({
      where: { projectId },
      select: { status: true },
    });

    const completedMilestones = milestones.filter(m => m.status === 'completed').length;
    const milestoneCompletionRate = milestones.length > 0
      ? Math.round((completedMilestones / milestones.length) * 100)
      : 0;

    return {
      overallProgress,
      phaseProgress,
      statusDistribution,
      timeProgress,
      milestoneCompletionRate,
      totalSegments: segments.length,
      totalMilestones: milestones.length,
      completedMilestones,
    };
  }

  /**
   * Private helper to update engagement metrics
   */
  private async updateEngagementMetrics(
    projectId: string,
    userId: string,
    activityType: string,
    duration?: number,
  ) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { clientId: true },
    });

    if (!project) return;

    // Upsert engagement metrics
    await this.prisma.engagementMetrics.upsert({
      where: { projectId },
      create: {
        projectId,
        clientId: project.clientId,
        totalViews: activityType === 'view' ? 1 : 0,
        totalTimeSpent: duration || 0,
        lastActivity: new Date(),
        commentsCount: activityType === 'comment' ? 1 : 0,
        approvalsCount: activityType === 'approve' ? 1 : 0,
        rejectionsCount: activityType === 'reject' ? 1 : 0,
        documentsViewed: activityType === 'view' ? 1 : 0,
        documentsDownloaded: activityType === 'download' ? 1 : 0,
      },
      update: {
        totalViews: activityType === 'view' ? { increment: 1 } : undefined,
        totalTimeSpent: duration ? { increment: duration } : undefined,
        lastActivity: new Date(),
        commentsCount: activityType === 'comment' ? { increment: 1 } : undefined,
        approvalsCount: activityType === 'approve' ? { increment: 1 } : undefined,
        rejectionsCount: activityType === 'reject' ? { increment: 1 } : undefined,
        documentsViewed: activityType === 'view' ? { increment: 1 } : undefined,
        documentsDownloaded: activityType === 'download' ? { increment: 1 } : undefined,
      },
    });
  }

  // =============================================================================
  // IMMERSIVE TIMELINE FEATURES
  // =============================================================================

  /**
   * Get immersive timeline view for client portal
   * Provides rich data for progressive disclosure and scroll-driven animations
   */
  async getImmersiveTimeline(projectId: string): Promise<ImmersiveTimelineDto> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        title: true,
        status: true,
        startDate: true,
        endDate: true,
        clientId: true,
      },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Get all segments with rich data
    const segments = await this.prisma.timelineSegment.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
      include: {
        approvals: {
          where: { status: { in: ['pending', 'needs_discussion'] } },
          orderBy: { dueDate: 'asc' },
          take: 1,
        },
        _count: {
          select: {
            activities: true,
            approvals: true,
          },
        },
      },
    });

    // Get milestones for segment association
    const milestones = await this.prisma.milestone.findMany({
      where: { projectId },
      orderBy: { order: 'asc' },
    });

    // Get all approvals for progress calculation
    const allApprovals = await this.prisma.approvalRecord.findMany({
      where: { projectId },
      select: { status: true },
    });

    // Build immersive segments
    const immersiveSegments: ImmersiveSegmentDto[] = segments.map((seg, idx) => {
      const segmentMilestone = milestones.find(m =>
        m.metadata && (m.metadata as any).segmentId === seg.id
      ) || milestones[idx]; // Fallback to order-based matching

      const primaryApproval = seg.approvals[0];

      return {
        id: seg.id,
        title: seg.title,
        description: seg.description || undefined,
        phase: seg.phase,
        status: seg.status as any,
        progress: seg.progress,
        startDate: seg.startDate,
        endDate: seg.endDate,
        order: seg.order,
        pendingApprovalsCount: seg._count.approvals,
        activitiesCount: seg._count.activities,
        media: this.parseMediaFromMetadata(seg.metadata),
        narrative: this.buildNarrative(seg),
        milestone: segmentMilestone ? {
          id: segmentMilestone.id,
          title: segmentMilestone.title,
          status: segmentMilestone.status as any,
          targetDate: segmentMilestone.targetDate,
          completedAt: segmentMilestone.completedAt || undefined,
        } : undefined,
        primaryApproval: primaryApproval ? {
          id: primaryApproval.id,
          title: primaryApproval.title,
          status: primaryApproval.status as any,
          dueDate: primaryApproval.dueDate || undefined,
          approvalType: primaryApproval.approvalType,
        } : undefined,
      };
    });

    // Calculate progress
    const overallProgress = segments.length > 0
      ? Math.round(segments.reduce((sum, s) => sum + s.progress, 0) / segments.length)
      : 0;

    const completedMilestones = milestones.filter(m => m.status === 'completed').length;
    const approvedCount = allApprovals.filter(a => a.status === 'approved').length;
    const pendingApprovals = allApprovals.filter(a => a.status === 'pending' || a.status === 'needs_discussion').length;

    // Calculate time elapsed
    let timeElapsed = 0;
    if (project.startDate && project.endDate) {
      const total = project.endDate.getTime() - project.startDate.getTime();
      const elapsed = Date.now() - project.startDate.getTime();
      timeElapsed = Math.min(100, Math.max(0, Math.round((elapsed / total) * 100)));
    }

    // Find active segment
    const activeSegment = segments.find(s => s.status === 'in_progress');

    // Find next milestone
    const nextMilestone = milestones.find(m => m.status === 'pending' || m.status === 'in_progress');
    const now = new Date();

    // Get overdue items count
    const overdueApprovals = await this.prisma.approvalRecord.count({
      where: {
        projectId,
        status: 'pending',
        dueDate: { lt: now },
      },
    });

    return {
      projectId: project.id,
      projectTitle: project.title,
      projectStatus: project.status,
      progress: {
        overall: overallProgress,
        timeElapsed,
        milestones: {
          completed: completedMilestones,
          total: milestones.length,
          percentage: milestones.length > 0 ? Math.round((completedMilestones / milestones.length) * 100) : 0,
        },
        approvals: {
          approved: approvedCount,
          pending: pendingApprovals,
          total: allApprovals.length,
          percentage: allApprovals.length > 0 ? Math.round((approvedCount / allApprovals.length) * 100) : 0,
        },
      },
      segments: immersiveSegments,
      activeSegmentId: activeSegment?.id,
      nextMilestone: nextMilestone ? {
        id: nextMilestone.id,
        title: nextMilestone.title,
        targetDate: nextMilestone.targetDate,
        daysUntil: Math.ceil((nextMilestone.targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
      } : undefined,
      attentionRequired: {
        pendingApprovals,
        overdueItems: overdueApprovals,
        unreadMessages: 0, // Would integrate with comms service
      },
    };
  }

  /**
   * Get recently completed milestones for celebration display
   */
  async getRecentCelebrations(projectId: string, limit = 5): Promise<MilestoneCelebrationDto[]> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const milestones = await this.prisma.milestone.findMany({
      where: {
        projectId,
        status: 'completed',
        completedAt: { not: null },
      },
      orderBy: { completedAt: 'desc' },
      take: limit,
    });

    const totalMilestones = await this.prisma.milestone.count({
      where: { projectId },
    });

    const completedMilestones = await this.prisma.milestone.findMany({
      where: { projectId, status: 'completed' },
      orderBy: { completedAt: 'asc' },
      select: { id: true },
    });

    return milestones.map(m => {
      const milestoneNumber = completedMilestones.findIndex(cm => cm.id === m.id) + 1;

      // Determine achievement type
      let achievementType: MilestoneCelebrationDto['achievementType'];
      if (milestoneNumber === 1) {
        achievementType = 'first_milestone';
      } else if (milestoneNumber === Math.ceil(totalMilestones / 2)) {
        achievementType = 'halfway';
      } else if (milestoneNumber === totalMilestones) {
        achievementType = 'final_delivery';
      }

      return {
        id: m.id,
        title: m.title,
        description: m.description || '',
        completedAt: m.completedAt!,
        completedBy: (m.metadata as any)?.completedBy || 'team',
        celebrationMedia: this.parseMediaFromMetadata(m.media),
        designerMessage: (m.metadata as any)?.designerMessage,
        achievementType,
        milestoneNumber,
        totalMilestones,
      };
    });
  }

  /**
   * Get specific milestone celebration data
   */
  async getMilestoneCelebration(projectId: string, milestoneId: string): Promise<MilestoneCelebrationDto> {
    const milestone = await this.prisma.milestone.findFirst({
      where: {
        id: milestoneId,
        projectId,
        status: 'completed',
      },
    });

    if (!milestone) {
      throw new NotFoundException('Completed milestone not found');
    }

    const totalMilestones = await this.prisma.milestone.count({
      where: { projectId },
    });

    const completedMilestones = await this.prisma.milestone.findMany({
      where: { projectId, status: 'completed' },
      orderBy: { completedAt: 'asc' },
      select: { id: true },
    });

    const milestoneNumber = completedMilestones.findIndex(cm => cm.id === milestoneId) + 1;

    let achievementType: MilestoneCelebrationDto['achievementType'];
    if (milestoneNumber === 1) achievementType = 'first_milestone';
    else if (milestoneNumber === Math.ceil(totalMilestones / 2)) achievementType = 'halfway';
    else if (milestoneNumber === totalMilestones) achievementType = 'final_delivery';

    return {
      id: milestone.id,
      title: milestone.title,
      description: milestone.description || '',
      completedAt: milestone.completedAt!,
      completedBy: (milestone.metadata as any)?.completedBy || 'team',
      celebrationMedia: this.parseMediaFromMetadata(milestone.media),
      designerMessage: (milestone.metadata as any)?.designerMessage,
      achievementType,
      milestoneNumber,
      totalMilestones,
    };
  }

  /**
   * Get segment media gallery for expanded view
   */
  async getSegmentMediaGallery(projectId: string, segmentId: string) {
    const segment = await this.prisma.timelineSegment.findFirst({
      where: { id: segmentId, projectId },
      select: {
        id: true,
        title: true,
        metadata: true,
      },
    });

    if (!segment) {
      throw new NotFoundException('Segment not found');
    }

    // Get associated milestone media
    const milestone = await this.prisma.milestone.findFirst({
      where: {
        projectId,
        OR: [
          { metadata: { path: ['segmentId'], equals: segmentId } },
        ],
      },
      select: { media: true },
    });

    // Combine media from segment and milestone
    const segmentMedia = this.parseMediaFromMetadata(segment.metadata);
    const milestoneMedia = milestone ? this.parseMediaFromMetadata(milestone.media) : [];

    return {
      segmentId,
      segmentTitle: segment.title,
      media: [...segmentMedia, ...milestoneMedia].sort((a, b) => (a.order || 0) - (b.order || 0)),
    };
  }

  /**
   * Record celebration viewed event for analytics
   */
  async recordCelebrationViewed(projectId: string, milestoneId: string, userId: string) {
    this.eventEmitter.emit('celebration.viewed', {
      projectId,
      milestoneId,
      userId,
      timestamp: new Date(),
    });

    // Log activity
    await this.prisma.clientActivity.create({
      data: {
        projectId,
        userId,
        activityType: 'celebration_viewed',
        entityType: 'milestone',
        entityId: milestoneId,
      },
    });

    return { recorded: true };
  }

  // =============================================================================
  // HELPER METHODS
  // =============================================================================

  private parseMediaFromMetadata(metadata: any): TimelineMediaDto[] {
    if (!metadata) return [];

    // Handle array of media in metadata
    if (Array.isArray(metadata)) {
      return metadata.map((item, idx) => ({
        id: item.id || `media-${idx}`,
        url: item.url || '',
        type: item.type || 'image',
        caption: item.caption,
        thumbnailUrl: item.thumbnailUrl,
        order: item.order ?? idx,
      }));
    }

    // Handle media property in metadata object
    if (metadata.media && Array.isArray(metadata.media)) {
      return metadata.media.map((item: any, idx: number) => ({
        id: item.id || `media-${idx}`,
        url: item.url || '',
        type: item.type || 'image',
        caption: item.caption,
        thumbnailUrl: item.thumbnailUrl,
        order: item.order ?? idx,
      }));
    }

    return [];
  }

  private buildNarrative(segment: any): ImmersiveSegmentDto['narrative'] {
    const metadata = segment.metadata as any;
    if (!metadata?.narrative) {
      // Build default narrative from segment data
      const completed = segment.deliverables?.filter((d: string) =>
        metadata?.completedDeliverables?.includes(d)
      ) || [];

      const nextSteps = segment.deliverables?.filter((d: string) =>
        !metadata?.completedDeliverables?.includes(d)
      ) || [];

      return {
        happening: segment.description || `Working on ${segment.title}`,
        completed,
        nextSteps,
        designerNotes: metadata?.designerNotes,
      };
    }

    return metadata.narrative;
  }
}
