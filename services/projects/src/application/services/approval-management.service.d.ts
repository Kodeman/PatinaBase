/**
 * Approval Management Service (Application Layer)
 *
 * Orchestrates approval workflow operations by coordinating:
 * - ApprovalValidator (business rules)
 * - ApprovalWorkflowService (workflow logic)
 * - Repository (data access)
 * - Event emitter (notifications)
 * - Audit logger (tracking)
 *
 * Single Responsibility: Managing approval lifecycle and workflow
 */
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalValidator } from '../../domain/validators/approval.validator';
import { ApprovalWorkflowService } from '../../domain/services/approval-workflow.service';
import { IApprovalRepository, CreateApprovalCommand, UpdateApprovalCommand, ApprovalQuery, ApprovalRecord, ApprovalMetrics, ApprovalSignature } from '../../domain/repositories/approval.repository.interface';
export declare class ApprovalManagementService {
    private readonly repository;
    private readonly validator;
    private readonly workflowService;
    private readonly eventEmitter;
    private readonly prisma;
    constructor(repository: IApprovalRepository, validator: ApprovalValidator, workflowService: ApprovalWorkflowService, eventEmitter: EventEmitter2, prisma: PrismaService);
    /**
     * Create a new approval request
     */
    create(projectId: string, command: CreateApprovalCommand, requestedBy: string): Promise<ApprovalRecord>;
    /**
     * Get all approvals for a project
     */
    findByProject(query: ApprovalQuery): Promise<ApprovalRecord[]>;
    /**
     * Get pending approvals for a project
     */
    findPending(projectId: string): Promise<ApprovalRecord[]>;
    /**
     * Get specific approval
     */
    findOne(projectId: string, approvalId: string): Promise<ApprovalRecord>;
    /**
     * Approve an approval request
     */
    approve(projectId: string, approvalId: string, userId: string, comments?: string, signature?: ApprovalSignature, ipAddress?: string): Promise<ApprovalRecord>;
    /**
     * Reject an approval request
     */
    reject(projectId: string, approvalId: string, userId: string, reason: string, comments?: string): Promise<ApprovalRecord>;
    /**
     * Add a discussion comment to an approval
     */
    discuss(projectId: string, approvalId: string, userId: string, comment: string): Promise<ApprovalRecord>;
    /**
     * Add/update digital signature for an approval
     */
    addSignature(projectId: string, approvalId: string, userId: string, signature: ApprovalSignature, ipAddress?: string): Promise<ApprovalRecord>;
    /**
     * Update approval
     */
    update(projectId: string, approvalId: string, command: UpdateApprovalCommand, userId: string): Promise<ApprovalRecord>;
    /**
     * Cancel approval
     */
    cancel(projectId: string, approvalId: string, userId: string): Promise<void>;
    /**
     * Get approval metrics for a project
     */
    getMetrics(projectId: string): Promise<ApprovalMetrics>;
    /**
     * Get approval health score
     */
    getHealthScore(projectId: string): Promise<number>;
    /**
     * Get overdue approvals
     */
    findOverdue(projectId: string): Promise<ApprovalRecord[]>;
    /**
     * Get approvals assigned to user
     */
    findByAssignee(userId: string): Promise<ApprovalRecord[]>;
    /**
     * Prioritize approvals for a project
     */
    prioritizeApprovals(projectId: string): Promise<string[]>;
}
//# sourceMappingURL=approval-management.service.d.ts.map