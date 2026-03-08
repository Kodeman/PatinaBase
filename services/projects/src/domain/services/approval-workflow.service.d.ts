/**
 * Approval Workflow Domain Service
 *
 * Pure domain service for approval workflow logic and state transitions.
 * Contains ZERO dependencies on infrastructure or external services.
 *
 * This service can be tested with simple objects without database access.
 *
 * Benefits:
 * - Pure business logic: No side effects
 * - Highly testable: No mocking required
 * - Reusable: Can be used across different contexts
 */
import { ApprovalStatus, ApprovalPriority, ApprovalType } from '../repositories/approval.repository.interface';
export interface ApprovalComment {
    userId: string;
    action: 'approved' | 'rejected' | 'discussed' | 'created';
    comment?: string;
    timestamp: string;
}
export interface ApprovalWorkflowState {
    status: ApprovalStatus;
    comments: ApprovalComment[];
    approvedBy?: string;
    approvedAt?: Date;
    rejectedBy?: string;
    rejectedAt?: Date;
    rejectionReason?: string;
}
export declare class ApprovalWorkflowService {
    /**
     * Get allowed next states for current status
     */
    getAllowedTransitions(currentStatus: ApprovalStatus): ApprovalStatus[];
    /**
     * Check if transition is allowed
     */
    canTransition(currentStatus: ApprovalStatus, newStatus: ApprovalStatus): boolean;
    /**
     * Build approval workflow state
     */
    buildApprovalState(currentStatus: ApprovalStatus, action: 'approve' | 'reject' | 'discuss', userId: string, comment?: string, reason?: string): ApprovalWorkflowState;
    /**
     * Add comment to existing comments array
     */
    addComment(existingComments: ApprovalComment[], userId: string, action: ApprovalComment['action'], comment?: string): ApprovalComment[];
    /**
     * Calculate approval turnaround time in hours
     */
    calculateTurnaroundTime(createdAt: Date, completedAt: Date): number;
    /**
     * Calculate approval velocity (approvals per day)
     */
    calculateApprovalVelocity(approvals: Array<{
        createdAt: Date;
        approvedAt?: Date;
    }>): number;
    /**
     * Determine if approval is at risk (close to due date or overdue)
     */
    isApprovalAtRisk(status: ApprovalStatus, dueDate: Date | null, riskThresholdHours?: number): boolean;
    /**
     * Check if approval is overdue
     */
    isOverdue(status: ApprovalStatus, dueDate: Date | null): boolean;
    /**
     * Calculate SLA compliance
     */
    calculateSLACompliance(approvals: Array<{
        dueDate: Date | null;
        approvedAt: Date | null;
        status: ApprovalStatus;
    }>): {
        total: number;
        compliant: number;
        complianceRate: number;
    };
    /**
     * Prioritize approvals based on urgency
     */
    prioritizeApprovals(approvals: Array<{
        id: string;
        priority: ApprovalPriority;
        dueDate: Date | null;
        createdAt: Date;
    }>): string[];
    /**
     * Group approvals by type
     */
    groupByType(approvals: Array<{
        approvalType: ApprovalType;
    }>): Record<ApprovalType, number>;
    /**
     * Calculate discussion time (time spent in needs_discussion status)
     */
    calculateDiscussionTime(comments: ApprovalComment[]): number;
    /**
     * Determine approval bottlenecks
     */
    findBottlenecks(approvals: Array<{
        assignedTo: string;
        status: ApprovalStatus;
        createdAt: Date;
    }>): Array<{
        userId: string;
        pendingCount: number;
        avgAge: number;
    }>;
    /**
     * Calculate approval health score (0-100)
     */
    calculateHealthScore(metrics: {
        approvalRate: number;
        avgApprovalTimeDays: number;
        overdueCount: number;
        totalPending: number;
    }): number;
}
//# sourceMappingURL=approval-workflow.service.d.ts.map