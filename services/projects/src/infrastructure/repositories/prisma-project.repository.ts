/**
 * Prisma Project Repository Implementation (Infrastructure Layer)
 *
 * Concrete implementation of IProjectRepository using Prisma ORM.
 * Isolates all database access logic from business logic.
 */

import { Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IProjectRepository,
  CreateProjectCommand,
  UpdateProjectCommand,
  ProjectQuery,
  Project,
  ProjectWithRelations,
  PaginatedProjectResult,
  ProjectStats,
  ProjectStatus,
} from '../../domain/repositories/project.repository.interface';

@Injectable()
export class PrismaProjectRepository implements IProjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Type guard to convert string status from database to ProjectStatus type
   */
  private toProjectStatus(status: string): ProjectStatus {
    const validStatuses: ProjectStatus[] = [
      'draft',
      'pending_approval',
      'active',
      'on_hold',
      'completed',
      'closed',
      'cancelled',
    ];
    return (
      validStatuses.includes(status as ProjectStatus) ? (status as ProjectStatus) : 'draft'
    );
  }

  /**
   * Type mapper to cast Prisma result to ProjectWithRelations
   */
  private mapToProjectWithRelations(data: any): ProjectWithRelations {
    return {
      ...data,
      status: this.toProjectStatus(data.status),
    };
  }

  /**
   * Type mapper to cast Prisma result to Project
   */
  private mapToProject(data: any): Project {
    return {
      ...data,
      status: this.toProjectStatus(data.status),
    };
  }

  async create(command: CreateProjectCommand): Promise<ProjectWithRelations> {
    const { budget, ...rest } = command;

    const result = await this.prisma.project.create({
      data: {
        ...rest,
        budget: budget ? new Decimal(budget) : null,
        status: 'draft',
      },
      include: {
        tasks: true,
        rfis: true,
        changeOrders: true,
        issues: true,
        milestones: true,
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
    return this.mapToProjectWithRelations(result);
  }

  async findAll(query: ProjectQuery): Promise<PaginatedProjectResult> {
    const { clientId, designerId, status, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (clientId) where.clientId = clientId;
    if (designerId) where.designerId = designerId;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
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
      data: data.map((project) => this.mapToProjectWithRelations(project)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(id: string): Promise<ProjectWithRelations | null> {
    const result = await this.prisma.project.findUnique({
      where: { id },
      include: {
        tasks: {
          orderBy: { order: 'asc' },
          take: 10,
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
    return result ? this.mapToProjectWithRelations(result) : null;
  }

  async findByIds(ids: string[]): Promise<ProjectWithRelations[]> {
    const results = await this.prisma.project.findMany({
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
    return results.map((project) => this.mapToProjectWithRelations(project));
  }

  async update(id: string, command: UpdateProjectCommand): Promise<ProjectWithRelations> {
    const { budget, ...rest } = command;

    const result = await this.prisma.project.update({
      where: { id },
      data: {
        ...rest,
        budget: budget !== undefined ? (budget ? new Decimal(budget) : null) : undefined,
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
    return this.mapToProjectWithRelations(result);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.project.update({
      where: { id },
      data: { status: 'closed' },
    });
  }

  async getStats(id: string): Promise<ProjectStats> {
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
  }

  async getClientSafeData(projectId: string, clientId: string): Promise<any> {
    const project = await this.prisma.project.findFirst({
      where: {
        id: projectId,
        clientId,
      },
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

    if (!project) return null;

    const segments = project.timelineSegments;
    const overallProgress =
      segments.length > 0
        ? Math.round(segments.reduce((sum, seg) => sum + seg.progress, 0) / segments.length)
        : 0;

    const pendingApprovalsCount = project.approvalRecords.filter(
      (a) => a.status === 'pending' || a.status === 'needs_discussion'
    ).length;

    return {
      id: project.id,
      title: project.title,
      status: project.status,
      startDate: project.startDate,
      endDate: project.endDate,
      description: project.description,
      currency: project.currency,
      budget: project.budget,
      overallProgress,
      pendingApprovalsCount,
      timeline: project.timelineSegments,
      milestones: project.milestones,
      approvals: project.approvalRecords,
      documents: project.documents,
      engagement: project.engagementMetrics,
    };
  }

  async exists(id: string): Promise<boolean> {
    const count = await this.prisma.project.count({
      where: { id },
    });
    return count > 0;
  }

  async hasAccess(projectId: string, userId: string, role: string): Promise<boolean> {
    if (role === 'admin') return true;

    const where: any = { id: projectId };

    if (role === 'client') {
      where.clientId = userId;
    } else if (role === 'designer') {
      where.designerId = userId;
    } else {
      return false;
    }

    const count = await this.prisma.project.count({ where });
    return count > 0;
  }

  async findByClient(clientId: string): Promise<Project[]> {
    const results = await this.prisma.project.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
    });
    return results.map((project) => this.mapToProject(project));
  }

  async findByDesigner(designerId: string): Promise<Project[]> {
    const results = await this.prisma.project.findMany({
      where: { designerId },
      orderBy: { createdAt: 'desc' },
    });
    return results.map((project) => this.mapToProject(project));
  }

  async countByStatus(status: ProjectStatus): Promise<number> {
    return this.prisma.project.count({
      where: { status },
    });
  }
}
