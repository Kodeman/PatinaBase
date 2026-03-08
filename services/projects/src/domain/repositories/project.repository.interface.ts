/**
 * Project Repository Interface (Domain Layer)
 *
 * Defines the contract for project data access following the Repository Pattern.
 * This abstraction allows the domain and application layers to be independent
 * of the specific data access technology (Prisma, TypeORM, etc.).
 *
 * Benefits:
 * - Testability: Can mock repository in unit tests
 * - Flexibility: Can swap implementations without changing business logic
 * - Clean Architecture: Domain layer depends on abstractions, not implementations
 */

import { Decimal } from 'decimal.js';

export interface CreateProjectCommand {
  title: string;
  description?: string;
  clientId: string;
  designerId: string;
  proposalId?: string;
  startDate?: Date;
  endDate?: Date;
  budget?: Decimal | number;
  currency?: string;
  metadata?: any;
}

export interface UpdateProjectCommand {
  title?: string;
  description?: string;
  status?: ProjectStatus;
  startDate?: Date;
  endDate?: Date;
  budget?: Decimal | number;
  currency?: string;
  metadata?: any;
}

export interface ProjectQuery {
  clientId?: string;
  designerId?: string;
  status?: ProjectStatus;
  page?: number;
  limit?: number;
}

export type ProjectStatus =
  | 'draft'
  | 'pending_approval'
  | 'active'
  | 'on_hold'
  | 'completed'
  | 'closed'
  | 'cancelled'
  | 'substantial_completion';

export interface Project {
  id: string;
  title: string;
  description: string | null;
  clientId: string;
  designerId: string;
  proposalId: string | null;
  status: ProjectStatus;
  startDate: Date | null;
  endDate: Date | null;
  budget: Decimal | null;
  currency: string;
  metadata: any;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectWithRelations extends Project {
  tasks?: any[];
  rfis?: any[];
  changeOrders?: any[];
  issues?: any[];
  milestones?: any[];
  _count?: {
    tasks?: number;
    rfis?: number;
    changeOrders?: number;
    issues?: number;
    dailyLogs?: number;
    documents?: number;
  };
}

export interface PaginatedProjectResult {
  data: ProjectWithRelations[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ProjectStats {
  tasks: Record<string, number>;
  rfis: Record<string, number>;
  issues: Record<string, number>;
  changeOrders: Record<string, number>;
}

/**
 * Repository interface for Project aggregate
 */
export interface IProjectRepository {
  /**
   * Create a new project
   */
  create(command: CreateProjectCommand): Promise<ProjectWithRelations>;

  /**
   * Find all projects with optional filtering and pagination
   */
  findAll(query: ProjectQuery): Promise<PaginatedProjectResult>;

  /**
   * Find a single project by ID
   */
  findById(id: string): Promise<ProjectWithRelations | null>;

  /**
   * Find multiple projects by IDs (for DataLoader)
   */
  findByIds(ids: string[]): Promise<ProjectWithRelations[]>;

  /**
   * Update a project
   */
  update(id: string, command: UpdateProjectCommand): Promise<ProjectWithRelations>;

  /**
   * Delete a project (soft delete - set status to 'closed')
   */
  delete(id: string): Promise<void>;

  /**
   * Get aggregated statistics for a project
   */
  getStats(id: string): Promise<ProjectStats>;

  /**
   * Get client-safe project data with filtered relations
   */
  getClientSafeData(projectId: string, clientId: string): Promise<any>;

  /**
   * Check if project exists
   */
  exists(id: string): Promise<boolean>;

  /**
   * Check if user has access to project
   */
  hasAccess(projectId: string, userId: string, role: string): Promise<boolean>;

  /**
   * Get projects by client
   */
  findByClient(clientId: string): Promise<Project[]>;

  /**
   * Get projects by designer
   */
  findByDesigner(designerId: string): Promise<Project[]>;

  /**
   * Count projects by status
   */
  countByStatus(status: ProjectStatus): Promise<number>;
}

/**
 * Dependency Injection token for ProjectRepository
 * Used in NestJS providers to inject the correct implementation
 */
export const PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY');
