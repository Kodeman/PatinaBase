import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIssueDto, IssueStatus } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';

@Injectable()
export class IssuesService {
  private readonly logger = new Logger(IssuesService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(projectId: string, createDto: CreateIssueDto, reportedBy: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const issue = await this.prisma.issue.create({
      data: {
        ...createDto,
        projectId,
        reportedBy,
      },
    });

    this.eventEmitter.emit('issue.created', {
      issueId: issue.id,
      projectId,
      severity: issue.severity,
      reportedBy,
      timestamp: new Date(),
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'issue',
        entityId: issue.id,
        action: 'created',
        actor: reportedBy,
        metadata: { projectId },
      },
    });

    return issue;
  }

  async findAll(projectId: string, status?: IssueStatus) {
    const where: any = { projectId };
    if (status) {
      where.status = status;
    }

    return this.prisma.issue.findMany({
      where,
      orderBy: [
        { severity: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  async findOne(id: string) {
    const issue = await this.prisma.issue.findUnique({
      where: { id },
      include: {
        project: {
          select: { id: true, title: true },
        },
      },
    });

    if (!issue) {
      throw new NotFoundException('Issue not found');
    }

    return issue;
  }

  async update(id: string, updateDto: UpdateIssueDto, userId: string) {
    const existing = await this.prisma.issue.findUnique({
      where: { id },
      select: { id: true, status: true, projectId: true },
    });

    if (!existing) {
      throw new NotFoundException('Issue not found');
    }

    const issue = await this.prisma.issue.update({
      where: { id },
      data: {
        ...updateDto,
        resolvedAt: updateDto.status === IssueStatus.RESOLVED ? new Date() : undefined,
      },
    });

    if (updateDto.status && updateDto.status !== existing.status) {
      this.eventEmitter.emit('issue.status_changed', {
        issueId: id,
        projectId: existing.projectId,
        oldStatus: existing.status,
        newStatus: updateDto.status,
        userId,
        timestamp: new Date(),
      });

      if (updateDto.status === IssueStatus.RESOLVED) {
        this.eventEmitter.emit('issue.resolved', {
          issueId: id,
          projectId: existing.projectId,
          userId,
          timestamp: new Date(),
        });
      }
    }

    await this.prisma.auditLog.create({
      data: {
        entityType: 'issue',
        entityId: id,
        action: 'updated',
        actor: userId,
        changes: updateDto as any,
      },
    });

    return issue;
  }
}
