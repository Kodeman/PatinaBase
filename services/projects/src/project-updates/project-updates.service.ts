import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectUpdateDto } from './dto/create-project-update.dto';
import { ProjectUpdateResponseDto } from './dto/project-update-response.dto';

/**
 * Service for managing project updates/timeline events
 */
@Injectable()
export class ProjectUpdatesService {
  private readonly logger = new Logger(ProjectUpdatesService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Convert database record to ProjectUpdateResponseDto
   * Handles JSON media conversion
   */
  private toProjectUpdateResponseDto(record: any): ProjectUpdateResponseDto {
    return {
      ...record,
      media: Array.isArray(record.media) ? record.media : undefined,
    } as ProjectUpdateResponseDto;
  }

  /**
   * Create a new project update
   * @param projectId - The project ID
   * @param createDto - Update data
   * @param authorId - User ID of the author
   * @returns Created project update
   */
  async create(
    projectId: string,
    createDto: CreateProjectUpdateDto,
    authorId: string,
  ): Promise<ProjectUpdateResponseDto> {
    // Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, clientId: true, designerId: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Create update and outbox event in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      // Create the project update
      const update = await tx.projectUpdate.create({
        data: {
          projectId,
          title: createDto.title,
          content: createDto.content,
          authorId,
          media: createDto.media ? JSON.parse(JSON.stringify(createDto.media)) : null,
          metadata: createDto.metadata,
        },
      });

      // Create outbox event for reliable event publishing
      await tx.outboxEvent.create({
        data: {
          type: 'project.update.created',
          payload: {
            updateId: update.id,
            projectId,
            title: update.title,
            authorId,
            clientId: project.clientId,
            designerId: project.designerId,
          },
          headers: {
            timestamp: new Date().toISOString(),
            source: 'projects-service',
          },
        },
      });

      return update;
    });

    // Emit in-process event for immediate handling
    this.eventEmitter.emit('project.update.created', {
      updateId: result.id,
      projectId,
      authorId,
      timestamp: new Date(),
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        entityType: 'project_update',
        entityId: result.id,
        action: 'created',
        actor: authorId,
        metadata: { projectId },
      },
    });

    this.logger.log(`Project update created: ${result.id} for project ${projectId}`);

    return this.toProjectUpdateResponseDto(result);
  }

  /**
   * Get all updates for a project
   * @param projectId - The project ID
   * @returns Array of project updates sorted by creation date (newest first)
   */
  async findByProject(projectId: string): Promise<ProjectUpdateResponseDto[]> {
    // Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    const updates = await this.prisma.projectUpdate.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    return updates.map((u) => this.toProjectUpdateResponseDto(u));
  }

  /**
   * Get a specific update by ID
   * @param updateId - The update ID
   * @returns Project update
   */
  async findOne(updateId: string): Promise<ProjectUpdateResponseDto> {
    const update = await this.prisma.projectUpdate.findUnique({
      where: { id: updateId },
    });

    if (!update) {
      throw new NotFoundException('Project update not found');
    }

    return this.toProjectUpdateResponseDto(update);
  }

  /**
   * Delete a project update
   * @param updateId - The update ID
   * @param userId - User performing the deletion
   */
  async remove(updateId: string, userId: string): Promise<void> {
    const existing = await this.prisma.projectUpdate.findUnique({
      where: { id: updateId },
      select: { id: true, projectId: true, authorId: true },
    });

    if (!existing) {
      throw new NotFoundException('Project update not found');
    }

    // Delete the update
    await this.prisma.projectUpdate.delete({
      where: { id: updateId },
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        entityType: 'project_update',
        entityId: updateId,
        action: 'deleted',
        actor: userId,
        metadata: { projectId: existing.projectId },
      },
    });

    this.logger.log(`Project update deleted: ${updateId}`);
  }
}
