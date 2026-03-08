/**
 * Projects Refactored Service (Facade Pattern)
 *
 * Maintains 100% backward compatibility with the original ProjectsService.
 * Delegates to specialized services in clean architecture layers.
 *
 * This facade allows gradual migration with zero breaking changes.
 */

import { Injectable } from '@nestjs/common';
import { ProjectManagementService } from '../application/services/project-management.service';
import { ProjectProgressService } from '../application/services/project-progress.service';
import { ProjectActivityService } from '../application/services/project-activity.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import {
  CreateProjectCommand,
  UpdateProjectCommand,
  ProjectQuery,
} from '../domain/repositories/project.repository.interface';

@Injectable()
export class ProjectsRefactoredService {
  constructor(
    private readonly managementService: ProjectManagementService,
    private readonly progressService: ProjectProgressService,
    private readonly activityService: ProjectActivityService,
  ) {}

  /**
   * Convert CreateProjectDto to CreateProjectCommand
   */
  private dtoToCreateCommand(dto: CreateProjectDto): CreateProjectCommand {
    // Both ProjectStatus enums have the same values, just different module imports
    // Use identity map for safe conversion
    const statusMap: Record<string, any> = {
      'draft': 'draft',
      'pending_approval': 'pending_approval',
      'active': 'active',
      'on_hold': 'on_hold',
      'completed': 'completed',
      'closed': 'closed',
      'cancelled': 'cancelled',
      'substantial_completion': 'substantial_completion',
    };

    return {
      title: dto.title,
      description: dto.description,
      clientId: dto.clientId,
      designerId: dto.designerId,
      proposalId: dto.proposalId,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      budget: dto.budget,
      currency: dto.currency,
      metadata: dto.metadata,
    };
  }

  /**
   * Convert UpdateProjectDto to UpdateProjectCommand
   */
  private dtoToUpdateCommand(dto: UpdateProjectDto): UpdateProjectCommand {
    // Convert DTO ProjectStatus to domain ProjectStatus
    // Both enums have identical values, just need type conversion
    const statusMap: Record<string, any> = {
      'draft': 'draft',
      'pending_approval': 'pending_approval',
      'active': 'active',
      'on_hold': 'on_hold',
      'completed': 'completed',
      'closed': 'closed',
      'cancelled': 'cancelled',
      'substantial_completion': 'substantial_completion',
    };

    return {
      title: dto.title,
      description: dto.description,
      status: dto.status ? (statusMap[dto.status as any] as any) : undefined,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      budget: dto.budget,
      currency: dto.currency,
      metadata: dto.metadata,
    };
  }

  /**
   * Convert QueryProjectsDto to ProjectQuery
   */
  private dtoToProjectQuery(dto: QueryProjectsDto): ProjectQuery {
    return {
      clientId: dto.clientId,
      designerId: dto.designerId,
      status: dto.status,
      page: dto.page,
      limit: dto.limit,
    };
  }

  /**
   * Create a new project
   * Delegates to: ProjectManagementService
   */
  async create(createDto: CreateProjectDto, userId: string) {
    const command = this.dtoToCreateCommand(createDto);
    return this.managementService.create(command, userId);
  }

  /**
   * Find all projects with optional filtering and pagination
   * Delegates to: ProjectManagementService
   */
  async findAll(query: QueryProjectsDto, userId: string, userRole: string) {
    const projectQuery = this.dtoToProjectQuery(query);
    return this.managementService.findAll(projectQuery, userId, userRole);
  }

  /**
   * Find a single project by ID
   * Delegates to: ProjectManagementService
   */
  async findOne(id: string) {
    return this.managementService.findOne(id);
  }

  /**
   * Update a project
   * Delegates to: ProjectManagementService
   */
  async update(id: string, updateDto: UpdateProjectDto, userId: string) {
    const command = this.dtoToUpdateCommand(updateDto);
    return this.managementService.update(id, command, userId);
  }

  /**
   * Get aggregated statistics for a project
   * Delegates to: ProjectProgressService
   */
  async getStats(id: string) {
    return this.progressService.getStats(id);
  }

  /**
   * Get projects by multiple IDs (bulk fetch)
   * Delegates to: ProjectManagementService
   */
  async findByIds(ids: string[]) {
    return this.managementService.findByIds(ids);
  }

  /**
   * Get client-safe project data (filtered for client portal)
   * Delegates to: ProjectProgressService
   */
  async getClientSafeData(projectId: string, clientId: string) {
    return this.progressService.getClientSafeData(projectId, clientId);
  }

  /**
   * Calculate comprehensive project progress
   * Delegates to: ProjectProgressService
   */
  async calculateProgress(projectId: string) {
    return this.progressService.calculateProgress(projectId);
  }

  /**
   * Generate activity feed for a project
   * Delegates to: ProjectActivityService
   */
  async getActivityFeed(projectId: string, limit = 50, offset = 0) {
    return this.activityService.getActivityFeed(projectId, limit, offset);
  }

  /**
   * Get upcoming events and deadlines for a project
   * Delegates to: ProjectActivityService
   */
  async getUpcomingEvents(projectId: string, daysAhead = 30) {
    return this.activityService.getUpcomingEvents(projectId, daysAhead);
  }

  /**
   * Additional methods for extended functionality
   */

  /**
   * Get project progress summary
   */
  async getProgressSummary(id: string) {
    return this.progressService.getProgressSummary(id);
  }

  /**
   * Get estimated completion date
   */
  async getEstimatedCompletion(id: string) {
    return this.progressService.getEstimatedCompletion(id);
  }

  /**
   * Get schedule variance
   */
  async getScheduleVariance(id: string) {
    return this.progressService.getScheduleVariance(id);
  }

  /**
   * Get project phase
   */
  async getProjectPhase(id: string) {
    return this.progressService.getProjectPhase(id);
  }

  /**
   * Get recent activity summary
   */
  async getRecentActivitySummary(id: string, days = 7) {
    return this.activityService.getRecentActivitySummary(id, days);
  }

  /**
   * Get activity heatmap
   */
  async getActivityHeatmap(id: string, days = 30) {
    return this.activityService.getActivityHeatmap(id, days);
  }

  /**
   * Check if project exists
   */
  async exists(id: string) {
    return this.managementService.exists(id);
  }

  /**
   * Check if user has access to project
   */
  async hasAccess(projectId: string, userId: string, role: string) {
    return this.managementService.hasAccess(projectId, userId, role);
  }

  /**
   * Get projects by client
   */
  async findByClient(clientId: string) {
    return this.managementService.findByClient(clientId);
  }

  /**
   * Get projects by designer
   */
  async findByDesigner(designerId: string) {
    return this.managementService.findByDesigner(designerId);
  }

  /**
   * Delete/close project
   */
  async delete(id: string, userId: string) {
    return this.managementService.delete(id, userId);
  }
}
