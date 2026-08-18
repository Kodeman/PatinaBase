import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIssueDto, IssueStatus } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
import { ProjectsAuthorizationResolver } from '../common/authorization/projects-authorization.resolver';

@Injectable()
export class IssuesService {
  private readonly logger = new Logger(IssuesService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private readonly authorization: ProjectsAuthorizationResolver,
  ) {}

  async create(projectId: string, createDto: CreateIssueDto, reportedBy: string) {
    const issue = await this.authorization.withProjectAccess(
      reportedBy,
      projectId,
      'read',
      async (tx) => {
        const project = await tx.project.findUnique({
          where: { id: projectId },
          select: { id: true },
        });
        if (!project) throw new NotFoundException('Project not found');
        const created = await tx.issue.create({ data: { ...createDto, projectId, reportedBy } });
        await tx.auditLog.create({
          data: {
            entityType: 'issue',
            entityId: created.id,
            action: 'created',
            actor: reportedBy,
            metadata: { projectId },
          },
        });
        return created;
      },
    );

    this.eventEmitter.emit('issue.created', {
      issueId: issue.id,
      projectId,
      severity: issue.severity,
      reportedBy,
      timestamp: new Date(),
    });

    return issue;
  }

  async findAll(projectId: string, userId: string, status?: IssueStatus) {
    const where: any = { projectId };
    if (status) {
      where.status = status;
    }

    return this.authorization.withProjectAccess(userId, projectId, 'read', (tx) =>
      tx.issue.findMany({
        where,
        orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      }),
    );
  }

  async findOne(projectId: string, id: string, userId: string) {
    return this.authorization.withProjectAccess(userId, projectId, 'read', async (tx) => {
      const issue = await tx.issue.findFirst({
        where: { id, projectId },
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
    });
  }

  async update(projectId: string, id: string, updateDto: UpdateIssueDto, userId: string) {
    const { existing, issue } = await this.authorization.withProjectAccess(
      userId,
      projectId,
      'manage',
      async (tx) => {
        const existing = await tx.issue.findFirst({
          where: { id, projectId },
          select: { id: true, status: true, projectId: true },
        });
        if (!existing) throw new NotFoundException('Issue not found');
        await tx.issue.updateMany({
          where: { id, projectId },
          data: {
            ...updateDto,
            resolvedAt: updateDto.status === IssueStatus.RESOLVED ? new Date() : undefined,
          },
        });
        const issue = await tx.issue.findFirstOrThrow({ where: { id, projectId } });
        await tx.auditLog.create({
          data: {
            entityType: 'issue',
            entityId: id,
            action: 'updated',
            actor: userId,
            changes: updateDto as any,
            metadata: { projectId },
          },
        });
        return { existing, issue };
      },
    );

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

    return issue;
  }
}
