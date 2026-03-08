/**
 * Approval Validator (Domain Layer)
 *
 * Centralizes all business rule validation for approvals.
 * Pure validation logic with no dependencies on infrastructure.
 */
import { ApprovalStatus } from '../repositories/approval.repository.interface';
export declare class ApprovalValidator {
    /**
     * Validate approval title
     */
    validateTitle(title: string): void;
    /**
     * Validate approval description
     */
    validateDescription(description: string): void;
    /**
     * Validate due date
     */
    validateDueDate(dueDate: Date): void;
    /**
     * Validate approval type
     */
    validateApprovalType(type: string): void;
    /**
     * Validate priority
     */
    validatePriority(priority: string): void;
    /**
     * Validate documents
     */
    validateDocuments(documents: string[]): void;
    /**
     * Validate status transition
     */
    validateStatusTransition(currentStatus: ApprovalStatus, newStatus: ApprovalStatus): void;
    /**
     * Validate approval can be processed
     */
    validateCanProcess(status: ApprovalStatus): void;
    /**
     * Validate user is assigned to approval
     */
    validateUserAssignment(assignedTo: string, userId: string): void;
    /**
     * Validate signature data
     */
    validateSignature(signature: any): void;
    /**
     * Validate rejection reason
     */
    validateRejectionReason(reason: string): void;
    /**
     * Validate comment
     */
    validateComment(comment: string): void;
    /**
     * Validate edit window (can only edit recent approvals)
     */
    validateEditWindow(createdAt: Date, windowMinutes?: number): void;
    /**
     * Validate approval is not overdue
     */
    validateNotOverdue(dueDate: Date | null): void;
    /**
     * Validate complete approval data for creation
     */
    validateCreateData(data: any): void;
    /**
     * Validate partial approval data for updates
     */
    validateUpdateData(data: any): void;
    /**
     * Validate approval action (approve/reject/discuss)
     */
    validateApprovalAction(approval: any, userId: string, action: 'approve' | 'reject' | 'discuss'): void;
}
//# sourceMappingURL=approval.validator.d.ts.map