import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApprovalDto } from './dto/create-approval.dto';
import { ApproveDto, RejectDto, DiscussDto, SignatureDto } from './dto/approval-action.dto';
export declare class ApprovalsService {
    private prisma;
    private eventEmitter;
    private readonly logger;
    constructor(prisma: PrismaService, eventEmitter: EventEmitter2);
    /**
     * Create a new approval request
     */
    create(projectId: string, createDto: CreateApprovalDto, requestedBy: string): Promise<{
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
    }>;
    /**
     * Get all approvals for a project
     */
    findByProject(projectId: string, status?: string): Promise<{
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
    }[]>;
    /**
     * Get pending approvals for a project
     */
    getPending(projectId: string): Promise<{
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
    }[]>;
    /**
     * Get specific approval
     */
    findOne(projectId: string, approvalId: string): Promise<{
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
    }>;
    /**
     * Approve an approval request
     */
    approve(projectId: string, approvalId: string, approveDto: ApproveDto, userId: string, ipAddress?: string): Promise<{
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
    }>;
    /**
     * Reject an approval request
     */
    reject(projectId: string, approvalId: string, rejectDto: RejectDto, userId: string): Promise<{
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
    }>;
    /**
     * Add a discussion comment to an approval
     */
    discuss(projectId: string, approvalId: string, discussDto: DiscussDto, userId: string): Promise<{
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
    }>;
    /**
     * Add/update digital signature for an approval
     */
    addSignature(projectId: string, approvalId: string, signatureDto: SignatureDto, userId: string, ipAddress?: string): Promise<{
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
    }>;
    /**
     * Calculate approval velocity metrics for a project
     */
    getApprovalMetrics(projectId: string): Promise<{
        total: number;
        approved: number;
        rejected: number;
        pending: number;
        overdue: number;
        approvalRate: number;
        avgApprovalTimeDays: number;
    }>;
}
//# sourceMappingURL=approvals.service.d.ts.map