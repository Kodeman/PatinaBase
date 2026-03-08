/**
 * Approval Repository Interface (Domain Layer)
 *
 * Defines the contract for approval data access following the Repository Pattern.
 */

import {
  type ApprovalStatus,
  type ApprovalType,
  type ApprovalPriority,
  type ApprovalSignature,
} from '@patina/types';

// Re-export types for backwards compatibility
export { type ApprovalStatus, type ApprovalType, type ApprovalPriority } from '@patina/types';

export interface CreateApprovalCommand {
  projectId: string;
  segmentId?: string;
  title: string;
  description?: string;
  approvalType: ApprovalType;
  priority?: ApprovalPriority;
  requestedBy: string;
  assignedTo: string;
  dueDate?: Date;
  documents?: string[];
  metadata?: Record<string, unknown>;
}

export interface UpdateApprovalCommand {
  title?: string;
  description?: string;
  priority?: ApprovalPriority;
  assignedTo?: string;
  dueDate?: Date;
  documents?: string[];
  metadata?: Record<string, unknown>;
}

export interface ApprovalQuery {
  projectId: string;
  status?: ApprovalStatus;
  assignedTo?: string;
  priority?: ApprovalPriority;
  approvalType?: ApprovalType;
  page?: number;
  limit?: number;
}

export interface ApprovalRecord {
  id: string;
  projectId: string;
  segmentId: string | null;
  title: string;
  description: string | null;
  approvalType: ApprovalType;
  status: ApprovalStatus;
  priority: ApprovalPriority;
  requestedBy: string;
  assignedTo: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectedBy: string | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
  dueDate: Date | null;
  documents: string[];
  comments: Record<string, unknown>[];
  signature: ApprovalSignature | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ApprovalMetrics {
  total: number;
  approved: number;
  rejected: number;
  pending: number;
  overdue: number;
  approvalRate: number;
  avgApprovalTimeDays: number;
}

// Re-export ApprovalSignature from @patina/types for backwards compatibility
export { type ApprovalSignature } from '@patina/types';

/**
 * Repository interface for Approval aggregate
 */
export interface IApprovalRepository {
  /**
   * Create a new approval request
   */
  create(command: CreateApprovalCommand): Promise<ApprovalRecord>;

  /**
   * Find all approvals for a project
   */
  findByProject(query: ApprovalQuery): Promise<ApprovalRecord[]>;

  /**
   * Find pending approvals for a project
   */
  findPending(projectId: string): Promise<ApprovalRecord[]>;

  /**
   * Find a single approval by ID
   */
  findById(projectId: string, approvalId: string): Promise<ApprovalRecord | null>;

  /**
   * Update approval status to approved
   */
  approve(
    approvalId: string,
    approvedBy: string,
    comments?: string,
    signature?: ApprovalSignature
  ): Promise<ApprovalRecord>;

  /**
   * Update approval status to rejected
   */
  reject(
    approvalId: string,
    rejectedBy: string,
    reason: string,
    comments?: string
  ): Promise<ApprovalRecord>;

  /**
   * Update approval status to needs_discussion
   */
  markForDiscussion(approvalId: string, userId: string, comment: string): Promise<ApprovalRecord>;

  /**
   * Add or update digital signature
   */
  addSignature(
    approvalId: string,
    signature: ApprovalSignature
  ): Promise<ApprovalRecord>;

  /**
   * Update approval record
   */
  update(approvalId: string, command: UpdateApprovalCommand): Promise<ApprovalRecord>;

  /**
   * Delete/cancel approval
   */
  cancel(approvalId: string): Promise<void>;

  /**
   * Get approval metrics for a project
   */
  getMetrics(projectId: string): Promise<ApprovalMetrics>;

  /**
   * Find overdue approvals
   */
  findOverdue(projectId: string): Promise<ApprovalRecord[]>;

  /**
   * Find approvals assigned to user
   */
  findByAssignee(userId: string): Promise<ApprovalRecord[]>;
}

/**
 * Dependency Injection token for ApprovalRepository
 */
export const APPROVAL_REPOSITORY = Symbol('APPROVAL_REPOSITORY');
