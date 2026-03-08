import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTimelineSegmentDto } from './dto/create-timeline-segment.dto';
import { UpdateTimelineSegmentDto } from './dto/update-timeline-segment.dto';
import { LogActivityDto } from './dto/log-activity.dto';
export declare class TimelineService {
    private prisma;
    private eventEmitter;
    private readonly logger;
    constructor(prisma: PrismaService, eventEmitter: EventEmitter2);
    /**
     * Create a new timeline segment for a project
     */
    createSegment(projectId: string, createDto: CreateTimelineSegmentDto, userId: string): Promise<{
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
    } & {
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
    }>;
    /**
     * Get full timeline for a project
     */
    getProjectTimeline(projectId: string): Promise<{
        projectId: string;
        projectStatus: string;
        startDate: Date | null;
        endDate: Date | null;
        overallProgress: number;
        segmentCount: number;
        segments: ({
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
            _count: {
                approvals: number;
                activities: number;
            };
        } & {
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
        })[];
    }>;
    /**
     * Get specific timeline segment with details
     */
    getSegment(projectId: string, segmentId: string): Promise<{
        dependentSegments: {
            id: string;
            title: string;
            status: string;
            progress: number;
            endDate: Date;
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
        _count: {
            approvals: number;
            activities: number;
        };
        activities: {
            userAgent: string | null;
            id: string;
            metadata: import("../generated/prisma-client/runtime/library").JsonValue | null;
            duration: number | null;
            ipAddress: string | null;
            createdAt: Date;
            userId: string;
            projectId: string;
            segmentId: string | null;
            activityType: string;
            entityType: string | null;
            entityId: string | null;
        }[];
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
    }>;
    /**
     * Update timeline segment
     */
    updateSegment(projectId: string, segmentId: string, updateDto: UpdateTimelineSegmentDto, userId: string): Promise<{
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
    }>;
    /**
     * Log client activity
     */
    logActivity(projectId: string, logDto: LogActivityDto, userId: string, ipAddress?: string, userAgent?: string): Promise<{
        userAgent: string | null;
        id: string;
        metadata: import("../generated/prisma-client/runtime/library").JsonValue | null;
        duration: number | null;
        ipAddress: string | null;
        createdAt: Date;
        userId: string;
        projectId: string;
        segmentId: string | null;
        activityType: string;
        entityType: string | null;
        entityId: string | null;
    }>;
    /**
     * Get upcoming events/milestones for a project
     */
    getUpcomingEvents(projectId: string, daysAhead?: number): Promise<{
        segments: {
            status: string;
            title: string;
            id: string;
            startDate: Date;
            endDate: Date;
            phase: string;
        }[];
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
    }>;
    /**
     * Calculate and return progress metrics for a project
     */
    getProgressMetrics(projectId: string): Promise<{
        overallProgress: number;
        phaseProgress: Record<string, number>;
        statusDistribution: Record<string, number>;
        timeProgress: number;
        milestoneCompletionRate: number;
        totalSegments: number;
        totalMilestones: number;
        completedMilestones: number;
    }>;
    /**
     * Private helper to update engagement metrics
     */
    private updateEngagementMetrics;
}
//# sourceMappingURL=timeline.service.d.ts.map