import { Injectable, NotFoundException, ConflictException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDailyLogDto } from './dto/create-daily-log.dto';

@Injectable()
export class DailyLogsService {
  private readonly logger = new Logger(DailyLogsService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  async create(projectId: string, createDto: CreateDailyLogDto, authorId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Check if log already exists for this date
    const existing = await this.prisma.dailyLog.findUnique({
      where: {
        projectId_date: {
          projectId,
          date: new Date(createDto.date),
        },
      },
    });

    if (existing) {
      throw new ConflictException('Daily log already exists for this date');
    }

    const log = await this.prisma.dailyLog.create({
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

    this.eventEmitter.emit('log.created', {
      logId: log.id,
      projectId,
      authorId,
      timestamp: new Date(),
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'daily_log',
        entityId: log.id,
        action: 'created',
        actor: authorId,
        metadata: { projectId, date: createDto.date },
      },
    });

    return log;
  }

  async findAll(projectId: string, startDate?: string, endDate?: string) {
    const where: any = { projectId };

    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate);
    }

    return this.prisma.dailyLog.findMany({
      where,
      orderBy: { date: 'desc' },
    });
  }

  async findOne(id: string) {
    const log = await this.prisma.dailyLog.findUnique({
      where: { id },
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
  }

  async update(id: string, updateDto: Partial<CreateDailyLogDto>, userId: string) {
    const existing = await this.prisma.dailyLog.findUnique({
      where: { id },
      select: { id: true, authorId: true, projectId: true },
    });

    if (!existing) {
      throw new NotFoundException('Daily log not found');
    }

    const log = await this.prisma.dailyLog.update({
      where: { id },
      data: {
        notes: updateDto.notes,
        weather: updateDto.weather,
        photos: updateDto.photos,
        attendees: updateDto.attendees,
        activities: updateDto.activities,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        entityType: 'daily_log',
        entityId: id,
        action: 'updated',
        actor: userId,
        changes: updateDto,
      },
    });

    return log;
  }
}
