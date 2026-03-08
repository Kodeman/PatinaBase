/**
 * Project Management Service (Application Layer)
 *
 * Orchestrates project CRUD operations by coordinating:
 * - Domain validators (business rules)
 * - Repository (data access)
 * - Event emitter (notifications)
 * - Audit logger (tracking)
 *
 * Single Responsibility: Managing project lifecycle (create, read, update, delete)
 */

import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectValidator } from '../../domain/validators/project.validator';
import {
  IProjectRepository,
  PROJECT_REPOSITORY,
  CreateProjectCommand,
  UpdateProjectCommand,
  ProjectQuery,
  ProjectWithRelations,
  PaginatedProjectResult,
} from '../../domain/repositories/project.repository.interface';

@Injectable()
export class ProjectManagementService {
  constructor(
    @Inject(PROJECT_REPOSITORY)
    private readonly repository: IProjectRepository,
    private readonly validator: ProjectValidator,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService, // For transactions and audit logs
  ) {}

  /**
   * Create a new project
   */
  async create(command: CreateProjectCommand, userId: string): Promise<ProjectWithRelations> {
    // Validate business rules
    this.validator.validateCreateData(command);

    // Create project
    const project = await this.repository.create(command);

    // Emit domain event
    this.eventEmitter.emit('project.created', {
      projectId: project.id,
      clientId: project.clientId,
      designerId: project.designerId,
      userId,
      timestamp: new Date(),
    });

    // Log audit (in transaction)
    await this.prisma.auditLog.create({
      data: {
        entityType: 'project',
        entityId: project.id,
        action: 'created',
        actor: userId,
        metadata: { proposalId: command.proposalId },
      },
    });

    return project;
  }

  /**
   * Find all projects with filtering and pagination
   */
  async findAll(
    query: ProjectQuery,
    userId: string,
    userRole: string
  ): Promise<PaginatedProjectResult> {
    // Apply role-based filtering
    const filteredQuery = { ...query };

    if (userRole === 'client') {
      filteredQuery.clientId = userId;
    } else if (userRole === 'designer') {
      filteredQuery.designerId = userId;
    }

    return this.repository.findAll(filteredQuery);
  }

  /**
   * Find a single project by ID
   */
  async findOne(id: string): Promise<ProjectWithRelations> {
    const project = await this.repository.findById(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return project;
  }

  /**
   * Find multiple projects by IDs (for DataLoader)
   */
  async findByIds(ids: string[]): Promise<ProjectWithRelations[]> {
    return this.repository.findByIds(ids);
  }

  /**
   * Update a project
   */
  async update(
    id: string,
    command: UpdateProjectCommand,
    userId: string
  ): Promise<ProjectWithRelations> {
    // Check if project exists
    const existing = await this.repository.findById(id);

    if (!existing) {
      throw new NotFoundException('Project not found');
    }

    // Validate business rules
    this.validator.validateUpdateData(command, existing.status);

    // Validate project can be modified
    if (command.status === undefined) {
      // Only check if not changing status
      this.validator.validateCanModify(existing.status);
    }

    // Update project
    const updated = await this.repository.update(id, command);

    // Emit event if status changed
    if (command.status && command.status !== existing.status) {
      this.eventEmitter.emit('project.status_changed', {
        projectId: id,
        oldStatus: existing.status,
        newStatus: command.status,
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
        changes: command as any,
      },
    });

    return updated;
  }

  /**
   * Soft delete a project (close it)
   */
  async delete(id: string, userId: string): Promise<void> {
    const project = await this.repository.findById(id);

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Get open tasks and issues count
    const stats = await this.repository.getStats(id);
    const openTasks = Object.values(stats.tasks).reduce((sum, count) => sum + count, 0);
    const openIssues = Object.values(stats.issues)
      .filter((_, index, arr) => {
        const keys = Object.keys(stats.issues);
        return keys[index] === 'open' || keys[index] === 'investigating';
      })
      .reduce((sum, count) => sum + count, 0);

    // Validate can close
    this.validator.validateCanClose(project.status, openTasks, openIssues);

    // Soft delete
    await this.repository.delete(id);

    // Emit event
    this.eventEmitter.emit('project.closed', {
      projectId: id,
      userId,
      timestamp: new Date(),
    });

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'project',
        entityId: id,
        action: 'closed',
        actor: userId,
      },
    });
  }

  /**
   * Get projects by client
   */
  async findByClient(clientId: string): Promise<any[]> {
    return this.repository.findByClient(clientId);
  }

  /**
   * Get projects by designer
   */
  async findByDesigner(designerId: string): Promise<any[]> {
    return this.repository.findByDesigner(designerId);
  }

  /**
   * Check if project exists
   */
  async exists(id: string): Promise<boolean> {
    return this.repository.exists(id);
  }

  /**
   * Check if user has access to project
   */
  async hasAccess(projectId: string, userId: string, role: string): Promise<boolean> {
    return this.repository.hasAccess(projectId, userId, role);
  }
}
