import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CacheService, buildProjectCacheKey } from '@patina/cache';
import { PrismaService } from '../prisma/prisma.service';
import { ProposalsClientService } from '../integrations/proposals-client.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import { Decimal } from 'decimal.js';

const PROJECT_DETAIL_TTL = 300;
const PROJECT_LIST_TTL = 60;
const PROJECT_STATS_TTL = 120;
const PROJECT_PROGRESS_TTL = 120;
const PROJECT_CLIENT_VIEW_TTL = 300;
const PROJECT_ACTIVITY_TTL = 45;
const PROJECT_UPCOMING_TTL = 60;

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private readonly cacheService: CacheService,
    private proposalsClient: ProposalsClientService,
  ) {}

  async create(createDto: CreateProjectDto, userId: string) {
    const { proposalId, budget, ...data } = createDto;

    let proposalData: any = null;
    let milestonesToCreate: any[] = [];

    // If creating from proposal, fetch proposal data
    if (proposalId) {
      try {
        proposalData = await this.proposalsClient.getProposal(proposalId);

        if (!proposalData) {
          this.logger.warn(`Proposal ${proposalId} not found, continuing without proposal data`);
        } else {
          this.logger.log(`Creating project from proposal: ${proposalId}`);

          // Pre-populate project fields from proposal if not provided
          if (!data.title && proposalData.title) {
            data.title = proposalData.title;
          }
          if (!data.description && proposalData.notes) {
            data.description = proposalData.notes;
          }
          if (!budget && proposalData.totalCost) {
            createDto.budget = proposalData.totalCost;
          }

          // Create milestones from proposal phases
          if (proposalData.phases && proposalData.phases.length > 0) {
            milestonesToCreate = proposalData.phases.map((phase: any, index: number) => ({
              title: phase.name,
              description: phase.description,
              dueDate: phase.endDate ? new Date(phase.endDate) : null,
              status: 'pending',
              order: index,
              metadata: {
                proposalPhaseId: phase.id,
                cost: phase.cost,
                deliverables: phase.deliverables || [],
              },
            }));
          }
        }
      } catch (error) {
        this.logger.error(`Failed to fetch proposal ${proposalId}:`, error);
        // Don't fail project creation, just log the error
      }
    }

    // Create project with milestones
    const project = await this.prisma.project.create({
      data: {
        ...data,
        proposalId,
        budget: createDto.budget ? new Decimal(createDto.budget) : null,
        status: 'draft',
        metadata: {
          proposalData: proposalData ? {
            rooms: proposalData.rooms?.length || 0,
            items: proposalData.items?.length || 0,
            totalCost: proposalData.totalCost,
          } : null,
        },
        milestones: milestonesToCreate.length > 0 ? {
          create: milestonesToCreate,
        } : undefined,
      },
      include: {
        tasks: true,
        rfis: true,
        changeOrders: true,
        issues: true,
        milestones: true,
      },
    });

    // Emit event
    this.eventEmitter.emit('project.created', {
      projectId: project.id,
      clientId: project.clientId,
      designerId: project.designerId,
      userId,
      timestamp: new Date(),
    });

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'project',
        entityId: project.id,
        action: 'created',
        actor: userId,
        metadata: { proposalId },
      },
    });

    // Mark proposal as converted (fire and forget)
    if (proposalId && proposalData) {
      this.proposalsClient.markProposalConverted(proposalId, project.id).catch((error) => {
        this.logger.error(`Failed to mark proposal ${proposalId} as converted:`, error);
      });
    }

    await this.cacheService.invalidateProject(project.id);

    return project;
  }

  async findAll(query: QueryProjectsDto, userId: string, userRole: string) {
    const { clientId, designerId, status, page = 1, limit = 20 } = query;

    const cacheKey = buildProjectCacheKey('list', {
      userId,
      role: userRole,
      filters: { clientId, designerId, status },
      page,
      limit,
    });

    return this.cacheService.wrap(cacheKey, async () => {
      const skip = (page - 1) * limit;
      const where: any = {};

      if (userRole === 'client') {
        where.clientId = userId;
      } else if (userRole === 'designer') {
        where.designerId = userId;
      }

      if (clientId) where.clientId = clientId;
      if (designerId) where.designerId = designerId;
      if (status) where.status = status;

      const [projects, total] = await Promise.all([
        this.prisma.project.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
          include: {
            _count: {
              select: {
                tasks: true,
                rfis: true,
                changeOrders: true,
                issues: true,
              },
            },
          },
        }),
        this.prisma.project.count({ where }),
      ]);

      return {
        data: projects,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }, PROJECT_LIST_TTL);
  }

  async findOne(id: string) {
    const cacheKey = buildProjectCacheKey('detail', { projectId: id });

    return this.cacheService.wrap(cacheKey, async () => {
      const project = await this.prisma.project.findUnique({
        where: { id },
        include: {
          tasks: {
            orderBy: { order: 'asc' },
            take: 10, // Limit for overview
          },
          rfis: {
            where: { status: 'open' },
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          changeOrders: {
            orderBy: { createdAt: 'desc' },
            take: 5,
          },
          issues: {
            where: { status: { in: ['open', 'investigating'] } },
            orderBy: { severity: 'desc' },
            take: 5,
          },
          milestones: {
            orderBy: { order: 'asc' },
          },
          _count: {
            select: {
              tasks: true,
              rfis: true,
              changeOrders: true,
              issues: true,
              dailyLogs: true,
              documents: true,
            },
          },
        },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      return project;
    }, PROJECT_DETAIL_TTL);
  }

  async update(id: string, updateDto: UpdateProjectDto, userId: string) {
    const existing = await this.prisma.project.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!existing) {
      throw new NotFoundException('Project not found');
    }

    const { budget, ...data } = updateDto;

    const updated = await this.prisma.project.update({
      where: { id },
      data: {
        ...data,
        budget: budget ? new Decimal(budget) : undefined,
      },
      include: {
        _count: {
          select: {
            tasks: true,
            rfis: true,
            changeOrders: true,
            issues: true,
          },
        },
      },
    });

    // Emit event if status changed
    if (updateDto.status && updateDto.status !== existing.status) {
      this.eventEmitter.emit('project.status_changed', {
        projectId: id,
        oldStatus: existing.status,
        newStatus: updateDto.status,
        userId,
        timestamp: new Date(),
      });
    }

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'project',
        entityId: id,
        action: 'updated',
        actor: userId,
        changes: updateDto as any,
      },
    });

    await this.cacheService.invalidateProject(id);

    return updated;
  }

  async getStats(id: string) {
    const cacheKey = buildProjectCacheKey('stats', { projectId: id });

    return this.cacheService.wrap(cacheKey, async () => {
      const project = await this.prisma.project.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const [taskStats, rfiStats, issueStats, changeOrderStats] = await Promise.all([
        this.prisma.task.groupBy({
          by: ['status'],
          where: { projectId: id },
          _count: true,
        }),
        this.prisma.rFI.groupBy({
          by: ['status'],
          where: { projectId: id },
          _count: true,
        }),
        this.prisma.issue.groupBy({
          by: ['status'],
          where: { projectId: id },
          _count: true,
        }),
        this.prisma.changeOrder.groupBy({
          by: ['status'],
          where: { projectId: id },
          _count: true,
        }),
      ]);

      return {
        tasks: taskStats.reduce((acc, stat) => {
          acc[stat.status] = stat._count;
          return acc;
        }, {} as Record<string, number>),
        rfis: rfiStats.reduce((acc, stat) => {
          acc[stat.status] = stat._count;
          return acc;
        }, {} as Record<string, number>),
        issues: issueStats.reduce((acc, stat) => {
          acc[stat.status] = stat._count;
          return acc;
        }, {} as Record<string, number>),
        changeOrders: changeOrderStats.reduce((acc, stat) => {
          acc[stat.status] = stat._count;
          return acc;
        }, {} as Record<string, number>),
      };
    }, PROJECT_STATS_TTL);
  }

  /**
   * Get projects by multiple IDs (bulk fetch)
   */
  async findByIds(ids: string[]) {
    return this.prisma.project.findMany({
      where: { id: { in: ids } },
      include: {
        _count: {
          select: {
            tasks: true,
            rfis: true,
            issues: true,
            changeOrders: true,
            documents: true,
            milestones: true,
          },
        },
      },
    });
  }

  /**
   * Get client-safe project data (filtered for client portal)
   */
  async getClientSafeData(projectId: string, clientId: string) {
    const cacheKey = buildProjectCacheKey('client-view', { projectId, clientId });

    return this.cacheService.wrap(cacheKey, async () => {
      // For local dev with @Public(), clientId might be 'dev-client', so we skip the clientId filter
      const whereClause: any = { id: projectId };
      if (clientId && clientId !== 'dev-client') {
        whereClause.clientId = clientId; // Ensure client owns this project
      }

      const project = await this.prisma.project.findFirst({
        where: whereClause,
        include: {
          timelineSegments: {
            orderBy: { order: 'asc' },
            include: {
              approvals: {
                where: {
                  assignedTo: clientId,
                  status: { in: ['pending', 'needs_discussion'] },
                },
              },
            },
          },
          milestones: {
            orderBy: { order: 'asc' },
          },
          approvalRecords: {
            where: { assignedTo: clientId },
            orderBy: { createdAt: 'desc' },
          },
          documents: {
            where: {
              // Only show documents marked for client viewing
              OR: [
                { category: 'drawing' },
                { category: 'photo' },
                { category: 'invoice' },
              ],
            },
            orderBy: { createdAt: 'desc' },
          },
          engagementMetrics: true,
        },
      });

      if (!project) {
        throw new NotFoundException('Project not found or access denied');
      }

      const segments = project.timelineSegments;
      const overallProgress = segments.length > 0
        ? Math.round(segments.reduce((sum, seg) => sum + seg.progress, 0) / segments.length)
        : 0;

      const pendingApprovalsCount = project.approvalRecords.filter(
        a => a.status === 'pending' || a.status === 'needs_discussion'
      ).length;

      return {
        id: project.id,
        title: project.title,
        status: project.status,
        startDate: project.startDate,
        endDate: project.endDate,
        description: project.description,
        currency: project.currency,
        budget: project.budget?.toString() ?? null,
        overallProgress,
        pendingApprovalsCount,
        timeline: project.timelineSegments,
        milestones: project.milestones,
        approvals: project.approvalRecords,
        documents: project.documents,
        engagement: project.engagementMetrics,
      };
    }, PROJECT_CLIENT_VIEW_TTL);
  }

  /**
   * Calculate comprehensive project progress
   */
  async calculateProgress(projectId: string) {
    const cacheKey = buildProjectCacheKey('progress', { projectId });

    return this.cacheService.wrap(cacheKey, async () => {
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

      const segments = await this.prisma.timelineSegment.findMany({
        where: { projectId },
        select: { progress: true, phase: true, status: true },
      });

      const totalProgress = segments.length > 0
        ? Math.round(segments.reduce((sum, seg) => sum + seg.progress, 0) / segments.length)
        : 0;

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

      let timeProgress = 0;
      let daysElapsed = 0;
      let daysRemaining = 0;
      let totalDuration = 0;

      if (project.startDate && project.endDate) {
        const now = Date.now();
        const start = project.startDate.getTime();
        const end = project.endDate.getTime();
        totalDuration = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        daysElapsed = Math.ceil((now - start) / (1000 * 60 * 60 * 24));
        daysRemaining = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
        timeProgress = Math.min(100, Math.max(0, Math.round((daysElapsed / totalDuration) * 100)));
      }

      const [totalTasks, completedTasks] = await Promise.all([
        this.prisma.task.count({ where: { projectId } }),
        this.prisma.task.count({ where: { projectId, status: 'done' } }),
      ]);

      const taskCompletionRate = totalTasks > 0
        ? Math.round((completedTasks / totalTasks) * 100)
        : 0;

      const [totalMilestones, completedMilestones] = await Promise.all([
        this.prisma.milestone.count({ where: { projectId } }),
        this.prisma.milestone.count({ where: { projectId, status: 'completed' } }),
      ]);

      const milestoneCompletionRate = totalMilestones > 0
        ? Math.round((completedMilestones / totalMilestones) * 100)
        : 0;

      const isOnSchedule = timeProgress <= totalProgress + 10; // Within 10% tolerance
      const isBehindSchedule = totalProgress < timeProgress - 10;
      const isAheadOfSchedule = totalProgress > timeProgress + 10;

      return {
        projectId,
        status: project.status,
        overallProgress: totalProgress,
        phaseProgress,
        timeProgress,
        taskCompletionRate,
        milestoneCompletionRate,
        timeline: {
          totalDuration,
          daysElapsed,
          daysRemaining,
          startDate: project.startDate,
          endDate: project.endDate,
        },
        health: {
          isOnSchedule,
          isBehindSchedule,
          isAheadOfSchedule,
        },
        metrics: {
          totalSegments: segments.length,
          totalTasks,
          completedTasks,
          totalMilestones,
          completedMilestones,
        },
      };
    }, PROJECT_PROGRESS_TTL);
  }

  /**
   * Generate activity feed for a project
   */
  async getActivityFeed(projectId: string, limit = 50, offset = 0) {
    const cacheKey = buildProjectCacheKey('activity', {
      projectId,
      limit,
      offset,
    });

    return this.cacheService.wrap(cacheKey, async () => {
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const activities = await this.prisma.auditLog.findMany({
        where: {
          OR: [
            { entityType: 'project', entityId: projectId },
            { entityType: 'timeline_segment', metadata: { path: ['projectId'], equals: projectId } },
            { entityType: 'approval_record', metadata: { path: ['projectId'], equals: projectId } },
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

      const clientActivities = await this.prisma.clientActivity.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: Math.floor(limit / 2),
      });

      const allActivities = [
        ...activities.map(a => ({
          id: a.id,
          type: 'audit',
          entityType: a.entityType,
          action: a.action,
          actor: a.actor,
          timestamp: a.createdAt,
          metadata: a.metadata,
        })),
        ...clientActivities.map(a => ({
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
    }, PROJECT_ACTIVITY_TTL);
  }

  /**
   * Get upcoming events and deadlines for a project
   */
  async getUpcomingEvents(projectId: string, daysAhead = 30) {
    const cacheKey = buildProjectCacheKey('upcoming', { projectId, daysAhead });

    return this.cacheService.wrap(cacheKey, async () => {
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

      const [upcomingMilestones, upcomingTasks, upcomingApprovals, upcomingSegments] = await Promise.all([
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
        totalEvents: upcomingMilestones.length + upcomingTasks.length + upcomingApprovals.length,
      };
    }, PROJECT_UPCOMING_TTL);
  }
}
