/**
 * Project Activity Service (Application Layer)
 *
 * Orchestrates project activity tracking and event retrieval.
 *
 * Single Responsibility: Managing project activity feeds and upcoming events
 */
import { PrismaService } from '../../prisma/prisma.service';
import { IProjectRepository } from '../../domain/repositories/project.repository.interface';
export declare class ProjectActivityService {
    private readonly repository;
    private readonly prisma;
    constructor(repository: IProjectRepository, prisma: PrismaService);
    /**
     * Generate activity feed for a project
     */
    getActivityFeed(projectId: string, limit?: number, offset?: number): Promise<{
        activities: any[];
        total: number;
        hasMore: boolean;
    }>;
    /**
     * Get upcoming events and deadlines for a project
     */
    getUpcomingEvents(projectId: string, daysAhead?: number): Promise<{
        milestones: any[];
        tasks: any[];
        approvals: any[];
        segments: any[];
        totalEvents: number;
    }>;
    /**
     * Get recent activity summary (last N days)
     */
    getRecentActivitySummary(projectId: string, days?: number): Promise<{
        tasksCompleted: number;
        approvalsGranted: number;
        milestonesReached: number;
        issuesResolved: number;
    }>;
    /**
     * Get activity heatmap (activity by day)
     */
    getActivityHeatmap(projectId: string, days?: number): Promise<Array<{
        date: string;
        count: number;
    }>>;
}
//# sourceMappingURL=project-activity.service.d.ts.map