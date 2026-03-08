/**
 * Prisma Project Repository Implementation (Infrastructure Layer)
 *
 * Concrete implementation of IProjectRepository using Prisma ORM.
 * Isolates all database access logic from business logic.
 */
import { PrismaService } from '../../prisma/prisma.service';
import { IProjectRepository, CreateProjectCommand, UpdateProjectCommand, ProjectQuery, Project, ProjectWithRelations, PaginatedProjectResult, ProjectStats, ProjectStatus } from '../../domain/repositories/project.repository.interface';
export declare class PrismaProjectRepository implements IProjectRepository {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(command: CreateProjectCommand): Promise<ProjectWithRelations>;
    findAll(query: ProjectQuery): Promise<PaginatedProjectResult>;
    findById(id: string): Promise<ProjectWithRelations | null>;
    findByIds(ids: string[]): Promise<ProjectWithRelations[]>;
    update(id: string, command: UpdateProjectCommand): Promise<ProjectWithRelations>;
    delete(id: string): Promise<void>;
    getStats(id: string): Promise<ProjectStats>;
    getClientSafeData(projectId: string, clientId: string): Promise<any>;
    exists(id: string): Promise<boolean>;
    hasAccess(projectId: string, userId: string, role: string): Promise<boolean>;
    findByClient(clientId: string): Promise<Project[]>;
    findByDesigner(designerId: string): Promise<Project[]>;
    countByStatus(status: ProjectStatus): Promise<number>;
}
//# sourceMappingURL=prisma-project.repository.d.ts.map