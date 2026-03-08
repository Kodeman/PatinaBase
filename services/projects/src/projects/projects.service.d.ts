import { EventEmitter2 } from '@nestjs/event-emitter';
import { CacheService } from '@patina/cache';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { QueryProjectsDto } from './dto/query-projects.dto';
export declare class ProjectsService {
    private prisma;
    private eventEmitter;
    private readonly cacheService;
    private readonly logger;
    constructor(prisma: PrismaService, eventEmitter: EventEmitter2, cacheService: CacheService);
    create(createDto: CreateProjectDto, userId: string): Promise<{
        status: string;
        title: string;
        id: string;
        clientId: string;
        createdAt: Date;
        updatedAt: Date;
        currency: string;
        startDate: Date | null;
        endDate: Date | null;
        budget: import("@prisma/client/runtime/library").Decimal | null;
        proposalId: string | null;
        designerId: string;
    }>;
    findAll(query: QueryProjectsDto, userId: string, userRole: string): Promise<{
        data: ({
            _count: {
                tasks: number;
                rfis: number;
                changeOrders: number;
                issues: number;
            };
        } & {
            status: string;
            title: string;
            id: string;
            clientId: string;
            createdAt: Date;
            updatedAt: Date;
            currency: string;
            startDate: Date | null;
            endDate: Date | null;
            budget: import("@prisma/client/runtime/library").Decimal | null;
            proposalId: string | null;
            designerId: string;
        })[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    findOne(id: string): Promise<{
        status: string;
        title: string;
        id: string;
        clientId: string;
        createdAt: Date;
        updatedAt: Date;
        currency: string;
        startDate: Date | null;
        endDate: Date | null;
        budget: import("@prisma/client/runtime/library").Decimal | null;
        proposalId: string | null;
        designerId: string;
    }>;
    update(id: string, updateDto: UpdateProjectDto, userId: string): Promise<{
        _count: {
            tasks: number;
            rfis: number;
            changeOrders: number;
            issues: number;
        };
    } & {
        status: string;
        title: string;
        id: string;
        clientId: string;
        createdAt: Date;
        updatedAt: Date;
        currency: string;
        startDate: Date | null;
        endDate: Date | null;
        budget: import("@prisma/client/runtime/library").Decimal | null;
        proposalId: string | null;
        designerId: string;
    }>;
    getStats(id: string): Promise<{
        tasks: Record<string, number>;
        rfis: Record<string, number>;
        issues: Record<string, number>;
        changeOrders: Record<string, number>;
    }>;
    /**
     * Get projects by multiple IDs (bulk fetch)
     */
    findByIds(ids: string[]): Promise<{
        status: string;
        title: string;
        id: string;
        clientId: string;
        createdAt: Date;
        updatedAt: Date;
        currency: string;
        startDate: Date | null;
        endDate: Date | null;
        budget: import("@prisma/client/runtime/library").Decimal | null;
        proposalId: string | null;
        designerId: string;
    }[]>;
    /**
     * Get client-safe project data (filtered for client portal)
     */
    getClientSafeData(projectId: string, clientId: string): Promise<{
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
    /**
     * Calculate comprehensive project progress
     */
    calculateProgress(projectId: string): Promise<{
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
    /**
     * Generate activity feed for a project
     */
    getActivityFeed(projectId: string, limit?: number, offset?: number): Promise<{
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
    /**
     * Get upcoming events and deadlines for a project
     */
    getUpcomingEvents(projectId: string, daysAhead?: number): Promise<{
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
//# sourceMappingURL=projects.service.d.ts.map