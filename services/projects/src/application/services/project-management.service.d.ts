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
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ProjectValidator } from '../../domain/validators/project.validator';
import { IProjectRepository, CreateProjectCommand, UpdateProjectCommand, ProjectQuery, ProjectWithRelations, PaginatedProjectResult } from '../../domain/repositories/project.repository.interface';
export declare class ProjectManagementService {
    private readonly repository;
    private readonly validator;
    private readonly eventEmitter;
    private readonly prisma;
    constructor(repository: IProjectRepository, validator: ProjectValidator, eventEmitter: EventEmitter2, prisma: PrismaService);
    /**
     * Create a new project
     */
    create(command: CreateProjectCommand, userId: string): Promise<ProjectWithRelations>;
    /**
     * Find all projects with filtering and pagination
     */
    findAll(query: ProjectQuery, userId: string, userRole: string): Promise<PaginatedProjectResult>;
    /**
     * Find a single project by ID
     */
    findOne(id: string): Promise<ProjectWithRelations>;
    /**
     * Find multiple projects by IDs (for DataLoader)
     */
    findByIds(ids: string[]): Promise<ProjectWithRelations[]>;
    /**
     * Update a project
     */
    update(id: string, command: UpdateProjectCommand, userId: string): Promise<ProjectWithRelations>;
    /**
     * Soft delete a project (close it)
     */
    delete(id: string, userId: string): Promise<void>;
    /**
     * Get projects by client
     */
    findByClient(clientId: string): Promise<any[]>;
    /**
     * Get projects by designer
     */
    findByDesigner(designerId: string): Promise<any[]>;
    /**
     * Check if project exists
     */
    exists(id: string): Promise<boolean>;
    /**
     * Check if user has access to project
     */
    hasAccess(projectId: string, userId: string, role: string): Promise<boolean>;
}
//# sourceMappingURL=project-management.service.d.ts.map