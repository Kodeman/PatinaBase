/**
 * Approval Validator (Domain Layer)
 *
 * Centralizes all business rule validation for approvals.
 * Pure validation logic with no dependencies on infrastructure.
 */

import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApprovalStatus, ApprovalPriority, ApprovalType } from '../repositories/approval.repository.interface';

@Injectable()
export class ApprovalValidator {
  /**
   * Validate approval title
   */
  validateTitle(title: string): void {
    if (!title || title.trim().length === 0) {
      throw new BadRequestException('Approval title is required');
    }

    if (title.length < 5) {
      throw new BadRequestException('Approval title must be at least 5 characters');
    }

    if (title.length > 200) {
      throw new BadRequestException('Approval title must be less than 200 characters');
    }
  }

  /**
   * Validate approval description
   */
  validateDescription(description: string): void {
    if (description && description.length > 2000) {
      throw new BadRequestException('Approval description must be less than 2000 characters');
    }
  }

  /**
   * Validate due date
   */
  validateDueDate(dueDate: Date): void {
    const now = new Date();

    if (dueDate < now) {
      throw new BadRequestException('Due date cannot be in the past');
    }

    const maxDate = new Date();
    maxDate.setFullYear(maxDate.getFullYear() + 2);

    if (dueDate > maxDate) {
      throw new BadRequestException('Due date cannot be more than 2 years in the future');
    }
  }

  /**
   * Validate approval type
   */
  validateApprovalType(type: string): void {
    const validTypes: ApprovalType[] = [
      'design_concept',
      'material_selection',
      'budget_change',
      'timeline_change',
      'final_delivery',
      'milestone',
      'change_order',
      'general',
    ];

    if (!validTypes.includes(type as ApprovalType)) {
      throw new BadRequestException(
        `Invalid approval type. Valid types: ${validTypes.join(', ')}`
      );
    }
  }

  /**
   * Validate priority
   */
  validatePriority(priority: string): void {
    const validPriorities: ApprovalPriority[] = ['low', 'normal', 'high', 'urgent'];

    if (!validPriorities.includes(priority as ApprovalPriority)) {
      throw new BadRequestException(
        `Invalid priority. Valid priorities: ${validPriorities.join(', ')}`
      );
    }
  }

  /**
   * Validate documents
   */
  validateDocuments(documents: string[]): void {
    if (documents.length > 50) {
      throw new BadRequestException('Cannot attach more than 50 documents to an approval');
    }

    documents.forEach((doc, index) => {
      if (!doc || doc.trim().length === 0) {
        throw new BadRequestException(`Document at index ${index} is invalid`);
      }

      if (doc.length > 500) {
        throw new BadRequestException(`Document path at index ${index} is too long (max 500 chars)`);
      }
    });
  }

  /**
   * Validate status transition
   */
  validateStatusTransition(currentStatus: ApprovalStatus, newStatus: ApprovalStatus): void {
    const validTransitions: Record<ApprovalStatus, ApprovalStatus[]> = {
      pending: ['needs_discussion', 'approved', 'rejected', 'cancelled'],
      needs_discussion: ['pending', 'approved', 'rejected', 'cancelled'],
      approved: [], // Cannot change from approved
      rejected: [], // Cannot change from rejected
      cancelled: [], // Cannot change from cancelled
    };

    const allowedTransitions = validTransitions[currentStatus];

    if (!allowedTransitions.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from '${currentStatus}' to '${newStatus}'. ` +
        `Allowed transitions: ${allowedTransitions.join(', ') || 'none'}`
      );
    }
  }

  /**
   * Validate approval can be processed
   */
  validateCanProcess(status: ApprovalStatus): void {
    if (status === 'approved' || status === 'rejected' || status === 'cancelled') {
      throw new BadRequestException(
        `Cannot process approval with status '${status}'. Approval has already been processed.`
      );
    }
  }

  /**
   * Validate user is assigned to approval
   */
  validateUserAssignment(assignedTo: string, userId: string): void {
    if (assignedTo !== userId) {
      throw new ForbiddenException('You are not authorized to process this approval');
    }
  }

  /**
   * Validate signature data
   */
  validateSignature(signature: any): void {
    if (!signature.data || signature.data.trim().length === 0) {
      throw new BadRequestException('Signature data is required');
    }

    if (signature.data.length > 100000) {
      throw new BadRequestException('Signature data is too large (max 100KB)');
    }

    if (!signature.signerName || signature.signerName.trim().length === 0) {
      throw new BadRequestException('Signer name is required');
    }

    if (signature.signerName.length > 200) {
      throw new BadRequestException('Signer name must be less than 200 characters');
    }
  }

  /**
   * Validate rejection reason
   */
  validateRejectionReason(reason: string): void {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException('Rejection reason is required');
    }

    if (reason.length < 10) {
      throw new BadRequestException('Rejection reason must be at least 10 characters');
    }

    if (reason.length > 1000) {
      throw new BadRequestException('Rejection reason must be less than 1000 characters');
    }
  }

  /**
   * Validate comment
   */
  validateComment(comment: string): void {
    if (comment && comment.length > 2000) {
      throw new BadRequestException('Comment must be less than 2000 characters');
    }
  }

  /**
   * Validate edit window (can only edit recent approvals)
   */
  validateEditWindow(createdAt: Date, windowMinutes: number = 30): void {
    const now = new Date();
    const cutoff = new Date(now.getTime() - windowMinutes * 60 * 1000);

    if (createdAt < cutoff) {
      throw new BadRequestException(
        `Approvals can only be edited within ${windowMinutes} minutes of creation`
      );
    }
  }

  /**
   * Validate approval is not overdue
   */
  validateNotOverdue(dueDate: Date | null): void {
    if (dueDate && dueDate < new Date()) {
      throw new BadRequestException('This approval is overdue');
    }
  }

  /**
   * Validate complete approval data for creation
   */
  validateCreateData(data: any): void {
    // Required fields
    if (!data.title) {
      throw new BadRequestException('Title is required');
    }
    this.validateTitle(data.title);

    if (!data.approvalType) {
      throw new BadRequestException('Approval type is required');
    }
    this.validateApprovalType(data.approvalType);

    if (!data.requestedBy) {
      throw new BadRequestException('Requester is required');
    }

    if (!data.assignedTo) {
      throw new BadRequestException('Assignee is required');
    }

    // Optional fields
    if (data.description) {
      this.validateDescription(data.description);
    }

    if (data.priority) {
      this.validatePriority(data.priority);
    }

    if (data.dueDate) {
      this.validateDueDate(new Date(data.dueDate));
    }

    if (data.documents && data.documents.length > 0) {
      this.validateDocuments(data.documents);
    }
  }

  /**
   * Validate partial approval data for updates
   */
  validateUpdateData(data: any): void {
    if (data.title !== undefined) {
      this.validateTitle(data.title);
    }

    if (data.description !== undefined) {
      this.validateDescription(data.description);
    }

    if (data.priority !== undefined) {
      this.validatePriority(data.priority);
    }

    if (data.dueDate !== undefined) {
      this.validateDueDate(new Date(data.dueDate));
    }

    if (data.documents !== undefined) {
      this.validateDocuments(data.documents);
    }
  }

  /**
   * Validate approval action (approve/reject/discuss)
   */
  validateApprovalAction(
    approval: any,
    userId: string,
    action: 'approve' | 'reject' | 'discuss'
  ): void {
    // Check status
    this.validateCanProcess(approval.status);

    // Check user assignment
    this.validateUserAssignment(approval.assignedTo, userId);

    // Additional validation based on action
    if (action === 'reject' && !approval.rejectionReason) {
      throw new BadRequestException('Rejection reason is required when rejecting');
    }
  }
}
