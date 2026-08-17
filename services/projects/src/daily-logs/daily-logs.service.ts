import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDailyLogDto } from './dto/create-daily-log.dto';
import { ProjectsAuthorizationResolver } from '../common/authorization/projects-authorization.resolver';

@Injectable()
export class DailyLogsService {
  private readonly logger = new Logger(DailyLogsService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private readonly authorization: ProjectsAuthorizationResolver,
  ) {}

  async create(projectId: string, createDto: CreateDailyLogDto, authorId: string) {
    const log = await this.authorization.withProjectAccess(
      authorId,
      projectId,
      'manage',
      async (tx) => {
        const project = await tx.project.findUnique({
          where: { id: projectId },
          select: { id: true },
        });
        if (!project) throw new NotFoundException('Project not found');
        const existing = await tx.dailyLog.findUnique({
          where: { projectId_date: { projectId, date: new Date(createDto.date) } },
        });
        if (existing) throw new ConflictException('Daily log already exists for this date');
        const created = await tx.dailyLog.create({
          data: {
            projectId,
            authorId,
            date: new Date(createDto.date),
            notes: createDto.notes,
            weather: createDto.weather,
            photos: createDto.photos || [],
            attendees: createDto.attendees || [],
            activities: createDto.activities || [],
          },
        });
        await tx.auditLog.create({
          data: {
            entityType: 'daily_log',
            entityId: created.id,
            action: 'created',
            actor: authorId,
            metadata: { projectId },
          },
        });
        return created;
      },
    );

    this.eventEmitter.emit('log.created', {
      logId: log.id,
      projectId,
      authorId,
      timestamp: new Date(),
    });

    return log;
  }

  async findAll(projectId: string, userId: string, startDate?: string, endDate?: string) {
    const where: any = { projectId };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    return this.authorization.withProjectAccess(userId, projectId, 'read', (tx) =>
      tx.dailyLog.findMany({ where, orderBy: { date: 'desc' } }),
    );
  }

  async findOne(projectId: string, id: string, userId: string) {
    return this.authorization.withProjectAccess(userId, projectId, 'read', async (tx) => {
      const log = await tx.dailyLog.findFirst({
        where: { id, projectId },
        include: {
          project: {
            select: { id: true, title: true },
          },
        },
      });

      if (!log) {
        throw new NotFoundException('Daily log not found');
      }

      return log;
    });
  }

  async update(
    projectId: string,
    id: string,
    updateDto: Partial<CreateDailyLogDto>,
    userId: string,
  ) {
    return this.authorization.withProjectAccess(userId, projectId, 'manage', async (tx) => {
      const existing = await tx.dailyLog.findFirst({
        where: { id, projectId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Daily log not found');
      await tx.dailyLog.updateMany({
        where: { id, projectId },
        data: {
          notes: updateDto.notes,
          weather: updateDto.weather,
          photos: updateDto.photos,
          attendees: updateDto.attendees,
          activities: updateDto.activities,
        },
      });
      const log = await tx.dailyLog.findFirstOrThrow({ where: { id, projectId } });
      await tx.auditLog.create({
        data: {
          entityType: 'daily_log',
          entityId: id,
          action: 'updated',
          actor: userId,
          changes: updateDto,
          metadata: { projectId },
        },
      });
      return log;
    });
  }
}
