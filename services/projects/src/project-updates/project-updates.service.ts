import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectUpdateDto } from './dto/create-project-update.dto';
import { ProjectUpdateResponseDto } from './dto/project-update-response.dto';
import { ProjectsAuthorizationResolver } from '../common/authorization/projects-authorization.resolver';

/**
 * Service for managing project updates/timeline events
 */
@Injectable()
export class ProjectUpdatesService {
  private readonly logger = new Logger(ProjectUpdatesService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    private readonly authorization: ProjectsAuthorizationResolver,
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
    const result = await this.authorization.withProjectAccess(
      authorId,
      projectId,
      'manage',
      async (tx) => {
        const project = await tx.project.findUnique({
          where: { id: projectId },
          select: { id: true, clientId: true, designerId: true },
        });
        if (!project) throw new NotFoundException('Project not found');
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

        await tx.auditLog.create({
          data: {
            entityType: 'project_update',
            entityId: update.id,
            action: 'created',
            actor: authorId,
            metadata: { projectId },
          },
        });

        return update;
      },
    );

    // Emit in-process event for immediate handling
    this.eventEmitter.emit('project.update.created', {
      updateId: result.id,
      projectId,
      authorId,
      timestamp: new Date(),
    });

    this.logger.log('Project update created');

    return this.toProjectUpdateResponseDto(result);
  }

  /**
   * Get all updates for a project
   * @param projectId - The project ID
   * @returns Array of project updates sorted by creation date (newest first)
   */
  async findByProject(projectId: string, userId: string): Promise<ProjectUpdateResponseDto[]> {
    return this.authorization.withProjectAccess(userId, projectId, 'read', async (tx) => {
      const updates = await tx.projectUpdate.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
      });
      return updates.map((update) => this.toProjectUpdateResponseDto(update));
    });
  }

  /**
   * Get a specific update by ID
   * @param updateId - The update ID
   * @returns Project update
   */
  async findOne(
    projectId: string,
    updateId: string,
    userId: string,
  ): Promise<ProjectUpdateResponseDto> {
    return this.authorization.withProjectAccess(userId, projectId, 'read', async (tx) => {
      const update = await tx.projectUpdate.findFirst({
        where: { id: updateId, projectId },
      });

      if (!update) {
        throw new NotFoundException('Project update not found');
      }

      return this.toProjectUpdateResponseDto(update);
    });
  }

  /**
   * Delete a project update
   * @param updateId - The update ID
   * @param userId - User performing the deletion
   */
  async remove(projectId: string, updateId: string, userId: string): Promise<void> {
    await this.authorization.withProjectAccess(userId, projectId, 'manage', async (tx) => {
      const existing = await tx.projectUpdate.findFirst({
        where: { id: updateId, projectId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Project update not found');
      await tx.projectUpdate.deleteMany({ where: { id: updateId, projectId } });
      await tx.auditLog.create({
        data: {
          entityType: 'project_update',
          entityId: updateId,
          action: 'deleted',
          actor: userId,
          metadata: { projectId },
        },
      });
    });

    this.logger.log('Project update deleted');
  }
}
