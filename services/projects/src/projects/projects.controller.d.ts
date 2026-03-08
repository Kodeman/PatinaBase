import { ProjectsService } from './projects.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
import { ProjectResponseDto } from './dto/project-response.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
export declare class ProjectsController {
    private readonly projectsService;
    constructor(projectsService: ProjectsService);
    create(createDto: CreateProjectDto, userId: string): Promise<ProjectResponseDto>;
    findAll(query: QueryProjectsDto, user: CurrentUser): Promise<ProjectResponseDto[]>;
    findOne(id: string): Promise<ProjectResponseDto>;
    update(id: string, updateDto: UpdateProjectDto, userId: string): Promise<ProjectResponseDto>;
    getStats(id: string): Promise<{
        tasks: Record<string, number>;
        rfis: Record<string, number>;
        issues: Record<string, number>;
        changeOrders: Record<string, number>;
    }>;
    findByIds(body: {
        ids: string[];
    }): Promise<(ProjectResponseDto | null)[]>;
    getClientView(id: string, clientId: string): Promise<{
        id: string;
        title: string;
        status: string;
        startDate: Date | null;
        endDate: Date | null;
        description: any;
        currency: string;
        budget: import("@prisma/client/runtime/library").Decimal | null;
        overallProgress: number;
        pendingApprovalsCount: any;
        timeline: any;
        milestones: any;
        approvals: any;
        documents: any;
        engagement: any;
    }>;
    getProgress(id: string): Promise<{
        projectId: string;
        status: string;
        overallProgress: number;
        phaseProgress: Record<string, number>;
        timeProgress: number;
        taskCompletionRate: number;
        milestoneCompletionRate: number;
        timeline: {
            totalDuration: number;
            daysElapsed: number;
            daysRemaining: number;
            startDate: Date | null;
            endDate: Date | null;
        };
        health: {
            isOnSchedule: boolean;
            isBehindSchedule: boolean;
            isAheadOfSchedule: boolean;
        };
        metrics: {
            totalSegments: number;
            totalTasks: number;
            completedTasks: number;
            totalMilestones: number;
            completedMilestones: number;
        };
    }>;
    getActivityFeed(id: string, limit?: string, offset?: string): Promise<{
        activities: ({
            id: string;
            type: string;
            entityType: string;
            action: string;
            actor: string | null;
            timestamp: any;
            metadata: import("@prisma/client/runtime/library").JsonValue;
        } | {
            id: string;
            type: string;
            activityType: string;
            userId: string;
            entityType: string | null;
            entityId: string | null;
            timestamp: Date;
            duration: number | null;
        })[];
        total: number;
        hasMore: boolean;
    }>;
    getUpcoming(id: string, days?: string): Promise<{
        milestones: {
            order: number;
            status: string;
            title: string;
            id: string;
            metadata: import("../generated/prisma-client/runtime/library").JsonValue | null;
            createdAt: Date;
            description: string | null;
            updatedAt: Date;
            projectId: string;
            targetDate: Date;
            completedAt: Date | null;
        }[];
        tasks: {
            status: string;
            title: string;
            id: string;
            priority: string | null;
            createdAt: Date;
            description: string | null;
            updatedAt: Date;
            projectId: string;
            dueDate: Date | null;
            assigneeId: string | null;
        }[];
        approvals: {
            status: string;
            title: string;
            id: string;
            metadata: import("../generated/prisma-client/runtime/library").JsonValue | null;
            priority: string;
            comments: import("../generated/prisma-client/runtime/library").JsonValue | null;
            createdAt: Date;
            signature: import("../generated/prisma-client/runtime/library").JsonValue | null;
            description: string | null;
            updatedAt: Date;
            documents: import("../generated/prisma-client/runtime/library").JsonValue | null;
            projectId: string;
            dueDate: Date | null;
            rejectionReason: string | null;
            segmentId: string | null;
            approvalType: string;
            requestedBy: string;
            assignedTo: string;
            approvedAt: Date | null;
            approvedBy: string | null;
            rejectedAt: Date | null;
            rejectedBy: string | null;
        }[];
        segments: {
            order: number;
            status: string;
            title: string;
            id: string;
            progress: number;
            metadata: import("../generated/prisma-client/runtime/library").JsonValue | null;
            createdAt: Date;
            description: string | null;
            updatedAt: Date;
            startDate: Date;
            endDate: Date;
            projectId: string;
            deliverables: import("../generated/prisma-client/runtime/library").JsonValue | null;
            phase: string;
            dependencies: import("../generated/prisma-client/runtime/library").JsonValue | null;
        }[];
        totalEvents: number;
    }>;
}
//# sourceMappingURL=projects.controller.d.ts.map