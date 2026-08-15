import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CacheService } from '@patina/cache';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import { Decimal } from 'decimal.js';
import { ProjectsAuthorizationResolver } from '../common/authorization/projects-authorization.resolver';

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private readonly cacheService: CacheService,
    private readonly authorization: ProjectsAuthorizationResolver,
  ) {}

  async create(createDto: CreateProjectDto, userId: string) {
    const { publicProjectId, proposalId, budget, clientId, designerId, ...data } = createDto;
    if (!publicProjectId) {
      throw new BadRequestException('A canonical public project link is required');
    }
    const project = await this.authorization.withPublicProjectLink(
      userId,
      publicProjectId,
      async (assignment, tx) => {
        const created = await tx.project.create({
          data: {
            ...data,
            publicProjectId,
            proposalId,
            clientId: assignment.clientId,
            designerId: assignment.designerId,
            budget: budget ? new Decimal(budget) : null,
            status: 'draft',
          },
          include: {
            tasks: true,
            rfis: true,
            changeOrders: true,
            issues: true,
            milestones: true,
          },
        });

        await tx.auditLog.create({
          data: {
            entityType: 'project',
            entityId: created.id,
            action: 'created',
            actor: userId,
            metadata: { proposalId },
          },
        });
        return created;
      },
    );

    this.eventEmitter.emit('project.created', {
      projectId: project.id,
      clientId: project.clientId,
      designerId: project.designerId,
      userId,
      timestamp: new Date(),
    });

    await this.cacheService.invalidateProject(project.id);

    return project;
  }

  async findAll(query: QueryProjectsDto, userId: string) {
    const { clientId, designerId, status, page = 1, limit = 20 } = query;
    return this.authorization.withAccessibleProjectIds(
      userId,
      'read',
      async (authorizedIds, tx) => {
        const skip = (page - 1) * limit;
        const where: any = { id: { in: authorizedIds } };

        if (clientId) where.clientId = clientId;
        if (designerId) where.designerId = designerId;
        if (status) where.status = status;

        const [projects, total] = await Promise.all([
          tx.project.findMany({
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
          tx.project.count({ where }),
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
      },
    );
  }

  async findOne(id: string, userId: string) {
    return this.authorization.withProjectAccess(userId, id, 'read', async (tx) => {
      const project = await tx.project.findUnique({
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
    });
  }

  async update(id: string, updateDto: UpdateProjectDto, userId: string) {
    if ('publicProjectId' in updateDto) {
      throw new BadRequestException('Canonical project links cannot be changed');
    }

    const updated = await this.authorization.withProjectAccess(userId, id, 'manage', async (tx) => {
      const existing = await tx.project.findUnique({
        where: { id },
        select: { id: true, status: true },
      });

      if (!existing) {
        throw new NotFoundException('Project not found');
      }

      const { budget, ...data } = updateDto;

      const result = await tx.project.update({
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

      await tx.auditLog.create({
        data: {
          entityType: 'project',
          entityId: id,
          action: 'updated',
          actor: userId,
          changes: updateDto as any,
        },
      });
      return { existing, result };
    });

    // Emit event if status changed
    if (updateDto.status && updateDto.status !== updated.existing.status) {
      this.eventEmitter.emit('project.status_changed', {
        projectId: id,
        oldStatus: updated.existing.status,
        newStatus: updateDto.status,
        userId,
        timestamp: new Date(),
      });
    }

    await this.cacheService.invalidateProject(id);

    return updated.result;
  }

  async getStats(id: string, userId: string) {
    return this.authorization.withProjectAccess(userId, id, 'read', async (tx) => {
      const project = await tx.project.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const [taskStats, rfiStats, issueStats, changeOrderStats] = await Promise.all([
        tx.task.groupBy({
          by: ['status'],
          where: { projectId: id },
          _count: true,
        }),
        tx.rFI.groupBy({
          by: ['status'],
          where: { projectId: id },
          _count: true,
        }),
        tx.issue.groupBy({
          by: ['status'],
          where: { projectId: id },
          _count: true,
        }),
        tx.changeOrder.groupBy({
          by: ['status'],
          where: { projectId: id },
          _count: true,
        }),
      ]);

      return {
        tasks: taskStats.reduce(
          (acc, stat) => {
            acc[stat.status] = stat._count;
            return acc;
          },
          {} as Record<string, number>,
        ),
        rfis: rfiStats.reduce(
          (acc, stat) => {
            acc[stat.status] = stat._count;
            return acc;
          },
          {} as Record<string, number>,
        ),
        issues: issueStats.reduce(
          (acc, stat) => {
            acc[stat.status] = stat._count;
            return acc;
          },
          {} as Record<string, number>,
        ),
        changeOrders: changeOrderStats.reduce(
          (acc, stat) => {
            acc[stat.status] = stat._count;
            return acc;
          },
          {} as Record<string, number>,
        ),
      };
    });
  }

  /**
   * Get projects by multiple IDs (bulk fetch)
   */
  async findByIds(ids: string[], userId: string) {
    return this.authorization.withAccessibleProjectIds(userId, 'read', (authorizedIds, tx) => {
      return tx.project.findMany({
        where: { id: { in: ids.filter((id) => authorizedIds.includes(id)) } },
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
    });
  }

  /**
   * Get client-safe project data (filtered for client portal)
   */
  async getClientSafeData(projectId: string, clientId: string) {
    return this.authorization.withProjectAccess(clientId, projectId, 'read', async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
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
              OR: [{ category: 'drawing' }, { category: 'photo' }, { category: 'invoice' }],
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
      const overallProgress =
        segments.length > 0
          ? Math.round(segments.reduce((sum, seg) => sum + seg.progress, 0) / segments.length)
          : 0;

      const pendingApprovalsCount = project.approvalRecords.filter(
        (a) => a.status === 'pending' || a.status === 'needs_discussion',
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
    });
  }

  /**
   * Calculate comprehensive project progress
   */
  async calculateProgress(projectId: string, userId: string) {
    return this.authorization.withProjectAccess(userId, projectId, 'read', async (tx) => {
      const project = await tx.project.findUnique({
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

      const segments = await tx.timelineSegment.findMany({
        where: { projectId },
        select: { progress: true, phase: true, status: true },
      });

      const totalProgress =
        segments.length > 0
          ? Math.round(segments.reduce((sum, seg) => sum + seg.progress, 0) / segments.length)
          : 0;

      const progressByPhase = segments.reduce(
        (acc, seg) => {
          if (!acc[seg.phase]) {
            acc[seg.phase] = { total: 0, count: 0 };
          }
          acc[seg.phase].total += seg.progress;
          acc[seg.phase].count += 1;
          return acc;
        },
        {} as Record<string, { total: number; count: number }>,
      );

      const phaseProgress = Object.entries(progressByPhase).reduce(
        (acc, [phase, data]) => {
          acc[phase] = Math.round(data.total / data.count);
          return acc;
        },
        {} as Record<string, number>,
      );

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
        tx.task.count({ where: { projectId } }),
        tx.task.count({ where: { projectId, status: 'done' } }),
      ]);

      const taskCompletionRate =
        totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

      const [totalMilestones, completedMilestones] = await Promise.all([
        tx.milestone.count({ where: { projectId } }),
        tx.milestone.count({ where: { projectId, status: 'completed' } }),
      ]);

      const milestoneCompletionRate =
        totalMilestones > 0 ? Math.round((completedMilestones / totalMilestones) * 100) : 0;

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
    });
  }

  /**
   * Generate activity feed for a project
   */
  async getActivityFeed(projectId: string, userId: string, limit = 50, offset = 0) {
    return this.authorization.withProjectAccess(userId, projectId, 'read', async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const activities = await tx.auditLog.findMany({
        where: {
          OR: [
            { entityType: 'project', entityId: projectId },
            {
              entityType: {
                in: [
                  'timeline_segment',
                  'approval_record',
                  'task',
                  'milestone',
                  'change_order',
                  'rfi',
                  'issue',
                  'daily_log',
                ],
              },
              metadata: { path: ['projectId'], equals: projectId },
            },
          ],
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      });

      const clientActivities = await tx.clientActivity.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: Math.floor(limit / 2),
      });

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
    });
  }

  /**
   * Get upcoming events and deadlines for a project
   */
  async getUpcomingEvents(projectId: string, userId: string, daysAhead = 30) {
    return this.authorization.withProjectAccess(userId, projectId, 'read', async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: projectId },
        select: { id: true },
      });

      if (!project) {
        throw new NotFoundException('Project not found');
      }

      const now = new Date();
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);

      const [upcomingMilestones, upcomingTasks, upcomingApprovals, upcomingSegments] =
        await Promise.all([
          tx.milestone.findMany({
            where: {
              projectId,
              targetDate: { gte: now, lte: futureDate },
              status: { in: ['pending', 'delayed'] },
            },
            orderBy: { targetDate: 'asc' },
          }),
          tx.task.findMany({
            where: {
              projectId,
              dueDate: { gte: now, lte: futureDate },
              status: { notIn: ['done', 'cancelled'] },
            },
            orderBy: { dueDate: 'asc' },
          }),
          tx.approvalRecord.findMany({
            where: {
              projectId,
              dueDate: { gte: now, lte: futureDate },
              status: { in: ['pending', 'needs_discussion'] },
            },
            orderBy: { dueDate: 'asc' },
          }),
          tx.timelineSegment.findMany({
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
    });
  }
}
