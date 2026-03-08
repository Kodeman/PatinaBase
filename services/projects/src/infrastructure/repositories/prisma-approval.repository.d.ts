/**
 * Prisma Approval Repository Implementation (Infrastructure Layer)
 *
 * Concrete implementation of IApprovalRepository using Prisma ORM.
 * Isolates all database access logic from business logic.
 */
import { PrismaService } from '../../prisma/prisma.service';
import { IApprovalRepository, CreateApprovalCommand, UpdateApprovalCommand, ApprovalQuery, ApprovalRecord, ApprovalMetrics, ApprovalSignature } from '../../domain/repositories/approval.repository.interface';
export declare class PrismaApprovalRepository implements IApprovalRepository {
    private readonly prisma;
    constructor(prisma: PrismaService);
    create(command: CreateApprovalCommand): Promise<ApprovalRecord>;
    findByProject(query: ApprovalQuery): Promise<ApprovalRecord[]>;
    findPending(projectId: string): Promise<ApprovalRecord[]>;
    findById(projectId: string, approvalId: string): Promise<ApprovalRecord | null>;
    approve(approvalId: string, approvedBy: string, comments?: string, signature?: ApprovalSignature): Promise<ApprovalRecord>;
    reject(approvalId: string, rejectedBy: string, reason: string, comments?: string): Promise<ApprovalRecord>;
    markForDiscussion(approvalId: string, userId: string, comment: string): Promise<ApprovalRecord>;
    addSignature(approvalId: string, signature: ApprovalSignature): Promise<ApprovalRecord>;
    update(approvalId: string, command: UpdateApprovalCommand): Promise<ApprovalRecord>;
    cancel(approvalId: string): Promise<void>;
    getMetrics(projectId: string): Promise<ApprovalMetrics>;
    findOverdue(projectId: string): Promise<ApprovalRecord[]>;
    findByAssignee(userId: string): Promise<ApprovalRecord[]>;
}
//# sourceMappingURL=prisma-approval.repository.d.ts.map