/**
 * Projects Refactored Service (Facade Pattern)
 *
 * Maintains 100% backward compatibility with the original ProjectsService.
 * Delegates to specialized services in clean architecture layers.
 *
 * This facade allows gradual migration with zero breaking changes.
 */
import { ProjectManagementService } from '../application/services/project-management.service';
import { ProjectProgressService } from '../application/services/project-progress.service';
import { ProjectActivityService } from '../application/services/project-activity.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
export declare class ProjectsRefactoredService {
    private readonly managementService;
    private readonly progressService;
    private readonly activityService;
    constructor(managementService: ProjectManagementService, progressService: ProjectProgressService, activityService: ProjectActivityService);
    /**
     * Create a new project
     * Delegates to: ProjectManagementService
     */
    create(createDto: CreateProjectDto, userId: string): Promise<import("../domain/repositories/project.repository.interface").ProjectWithRelations>;
    /**
     * Find all projects with optional filtering and pagination
     * Delegates to: ProjectManagementService
     */
    findAll(query: QueryProjectsDto, userId: string, userRole: string): Promise<import("../domain/repositories/project.repository.interface").PaginatedProjectResult>;
    /**
     * Find a single project by ID
     * Delegates to: ProjectManagementService
     */
    findOne(id: string): Promise<import("../domain/repositories/project.repository.interface").ProjectWithRelations>;
    /**
     * Update a project
     * Delegates to: ProjectManagementService
     */
    update(id: string, updateDto: UpdateProjectDto, userId: string): Promise<import("../domain/repositories/project.repository.interface").ProjectWithRelations>;
    /**
     * Get aggregated statistics for a project
     * Delegates to: ProjectProgressService
     */
    getStats(id: string): Promise<any>;
    /**
     * Get projects by multiple IDs (bulk fetch)
     * Delegates to: ProjectManagementService
     */
    findByIds(ids: string[]): Promise<import("../domain/repositories/project.repository.interface").ProjectWithRelations[]>;
    /**
     * Get client-safe project data (filtered for client portal)
     * Delegates to: ProjectProgressService
     */
    getClientSafeData(projectId: string, clientId: string): Promise<any>;
    /**
     * Calculate comprehensive project progress
     * Delegates to: ProjectProgressService
     */
    calculateProgress(projectId: string): Promise<import("../domain/services/progress-calculator.service").ProjectProgressResult>;
    /**
     * Generate activity feed for a project
     * Delegates to: ProjectActivityService
     */
    getActivityFeed(projectId: string, limit?: number, offset?: number): Promise<{
        activities: any[];
        total: number;
        hasMore: boolean;
    }>;
    /**
     * Get upcoming events and deadlines for a project
     * Delegates to: ProjectActivityService
     */
    getUpcomingEvents(projectId: string, daysAhead?: number): Promise<{
        milestones: any[];
        tasks: any[];
        approvals: any[];
        segments: any[];
        totalEvents: number;
    }>;
    /**
     * Additional methods for extended functionality
     */
    /**
     * Get project progress summary
     */
    getProgressSummary(id: string): Promise<{
        overallProgress: number;
        taskCompletionRate: number;
        milestoneCompletionRate: number;
        health: string;
    }>;
    /**
     * Get estimated completion date
     */
    getEstimatedCompletion(id: string): Promise<Date | null>;
    /**
     * Get schedule variance
     */
    getScheduleVariance(id: string): Promise<number>;
    /**
     * Get project phase
     */
    getProjectPhase(id: string): Promise<"closing" | "planning" | "execution">;
    /**
     * Get recent activity summary
     */
    getRecentActivitySummary(id: string, days?: number): Promise<{
        tasksCompleted: number;
        approvalsGranted: number;
        milestonesReached: number;
        issuesResolved: number;
    }>;
    /**
     * Get activity heatmap
     */
    getActivityHeatmap(id: string, days?: number): Promise<{
        date: string;
        count: number;
    }[]>;
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
    findByClient(clientId: string): Promise<any[]>;
    /**
     * Get projects by designer
     */
    findByDesigner(designerId: string): Promise<any[]>;
    /**
     * Delete/close project
     */
    delete(id: string, userId: string): Promise<void>;
}
//# sourceMappingURL=projects-refactored.service.d.ts.map