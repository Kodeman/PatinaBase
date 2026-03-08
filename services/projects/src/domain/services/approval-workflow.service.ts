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

import { Injectable } from '@nestjs/common';
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

@Injectable()
export class ApprovalWorkflowService {
  /**
   * Get allowed next states for current status
   */
  getAllowedTransitions(currentStatus: ApprovalStatus): ApprovalStatus[] {
    const transitions: Record<ApprovalStatus, ApprovalStatus[]> = {
      pending: ['needs_discussion', 'approved', 'rejected', 'cancelled'],
      needs_discussion: ['pending', 'approved', 'rejected', 'cancelled'],
      approved: [],
      rejected: [],
      cancelled: [],
    };

    return transitions[currentStatus] || [];
  }

  /**
   * Check if transition is allowed
   */
  canTransition(currentStatus: ApprovalStatus, newStatus: ApprovalStatus): boolean {
    const allowed = this.getAllowedTransitions(currentStatus);
    return allowed.includes(newStatus);
  }

  /**
   * Build approval workflow state
   */
  buildApprovalState(
    currentStatus: ApprovalStatus,
    action: 'approve' | 'reject' | 'discuss',
    userId: string,
    comment?: string,
    reason?: string
  ): ApprovalWorkflowState {
    const now = new Date();
    const timestamp = now.toISOString();

    const newComment: ApprovalComment = {
      userId,
      action: action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'discussed',
      comment: action === 'reject' ? reason : comment,
      timestamp,
    };

    const state: ApprovalWorkflowState = {
      status: currentStatus,
      comments: [newComment],
    };

    if (action === 'approve') {
      state.status = 'approved';
      state.approvedBy = userId;
      state.approvedAt = now;
    } else if (action === 'reject') {
      state.status = 'rejected';
      state.rejectedBy = userId;
      state.rejectedAt = now;
      state.rejectionReason = reason;
    } else if (action === 'discuss') {
      state.status = 'needs_discussion';
    }

    return state;
  }

  /**
   * Add comment to existing comments array
   */
  addComment(
    existingComments: ApprovalComment[],
    userId: string,
    action: ApprovalComment['action'],
    comment?: string
  ): ApprovalComment[] {
    const newComment: ApprovalComment = {
      userId,
      action,
      comment,
      timestamp: new Date().toISOString(),
    };

    return [...existingComments, newComment];
  }

  /**
   * Calculate approval turnaround time in hours
   */
  calculateTurnaroundTime(createdAt: Date, completedAt: Date): number {
    const diff = completedAt.getTime() - createdAt.getTime();
    return Math.round((diff / (1000 * 60 * 60)) * 10) / 10; // Hours, 1 decimal
  }

  /**
   * Calculate approval velocity (approvals per day)
   */
  calculateApprovalVelocity(
    approvals: Array<{ createdAt: Date; approvedAt?: Date }>
  ): number {
    const completed = approvals.filter(a => a.approvedAt);

    if (completed.length === 0) return 0;

    const oldest = completed[0].createdAt;
    const newest = completed[completed.length - 1].approvedAt!;
    const days = (newest.getTime() - oldest.getTime()) / (1000 * 60 * 60 * 24);

    if (days === 0) return completed.length;

    return Math.round((completed.length / days) * 10) / 10;
  }

  /**
   * Determine if approval is at risk (close to due date or overdue)
   */
  isApprovalAtRisk(
    status: ApprovalStatus,
    dueDate: Date | null,
    riskThresholdHours: number = 24
  ): boolean {
    if (status !== 'pending' && status !== 'needs_discussion') {
      return false;
    }

    if (!dueDate) return false;

    const now = new Date();
    const hoursUntilDue = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);

    return hoursUntilDue <= riskThresholdHours;
  }

  /**
   * Check if approval is overdue
   */
  isOverdue(
    status: ApprovalStatus,
    dueDate: Date | null
  ): boolean {
    if (status !== 'pending' && status !== 'needs_discussion') {
      return false;
    }

    if (!dueDate) return false;

    return dueDate < new Date();
  }

  /**
   * Calculate SLA compliance
   */
  calculateSLACompliance(
    approvals: Array<{
      dueDate: Date | null;
      approvedAt: Date | null;
      status: ApprovalStatus;
    }>
  ): {
    total: number;
    compliant: number;
    complianceRate: number;
  } {
    const withDueDate = approvals.filter(a => a.dueDate);
    const total = withDueDate.length;

    if (total === 0) {
      return { total: 0, compliant: 0, complianceRate: 100 };
    }

    const compliant = withDueDate.filter(a => {
      if (a.status === 'approved' && a.approvedAt) {
        return a.approvedAt <= a.dueDate!;
      }
      if (a.status === 'pending' || a.status === 'needs_discussion') {
        return a.dueDate! >= new Date();
      }
      return false;
    }).length;

    const complianceRate = Math.round((compliant / total) * 100);

    return { total, compliant, complianceRate };
  }

  /**
   * Prioritize approvals based on urgency
   */
  prioritizeApprovals(
    approvals: Array<{
      id: string;
      priority: ApprovalPriority;
      dueDate: Date | null;
      createdAt: Date;
    }>
  ): string[] {
    const priorityWeights = {
      urgent: 4,
      high: 3,
      normal: 2,
      low: 1,
    };

    const now = new Date();

    const scored = approvals.map(approval => {
      let score = priorityWeights[approval.priority];

      // Add urgency based on due date
      if (approval.dueDate) {
        const hoursUntilDue = (approval.dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);

        if (hoursUntilDue < 0) {
          score += 10; // Overdue
        } else if (hoursUntilDue < 24) {
          score += 5; // Due soon
        } else if (hoursUntilDue < 72) {
          score += 2; // Due in 3 days
        }
      }

      // Add age factor (older approvals get slight boost)
      const age = (now.getTime() - approval.createdAt.getTime()) / (1000 * 60 * 60 * 24);
      score += Math.min(age * 0.1, 2); // Max 2 points for age

      return { id: approval.id, score };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored.map(s => s.id);
  }

  /**
   * Group approvals by type
   */
  groupByType(
    approvals: Array<{ approvalType: ApprovalType }>
  ): Record<ApprovalType, number> {
    return approvals.reduce((acc, approval) => {
      acc[approval.approvalType] = (acc[approval.approvalType] || 0) + 1;
      return acc;
    }, {} as Record<ApprovalType, number>);
  }

  /**
   * Calculate discussion time (time spent in needs_discussion status)
   */
  calculateDiscussionTime(
    comments: ApprovalComment[]
  ): number {
    const discussionComments = comments.filter(c => c.action === 'discussed');

    if (discussionComments.length < 2) return 0;

    const first = new Date(discussionComments[0].timestamp);
    const last = new Date(discussionComments[discussionComments.length - 1].timestamp);

    return (last.getTime() - first.getTime()) / (1000 * 60 * 60); // Hours
  }

  /**
   * Determine approval bottlenecks
   */
  findBottlenecks(
    approvals: Array<{
      assignedTo: string;
      status: ApprovalStatus;
      createdAt: Date;
    }>
  ): Array<{ userId: string; pendingCount: number; avgAge: number }> {
    const userApprovals = approvals.reduce((acc, approval) => {
      if (approval.status === 'pending' || approval.status === 'needs_discussion') {
        if (!acc[approval.assignedTo]) {
          acc[approval.assignedTo] = [];
        }
        acc[approval.assignedTo].push(approval);
      }
      return acc;
    }, {} as Record<string, typeof approvals>);

    const now = new Date();

    return Object.entries(userApprovals)
      .map(([userId, userApprovals]) => {
        const pendingCount = userApprovals.length;
        const avgAge =
          userApprovals.reduce((sum, a) => {
            const age = (now.getTime() - a.createdAt.getTime()) / (1000 * 60 * 60 * 24);
            return sum + age;
          }, 0) / pendingCount;

        return { userId, pendingCount, avgAge: Math.round(avgAge * 10) / 10 };
      })
      .filter(b => b.pendingCount >= 3 || b.avgAge >= 7) // Bottleneck if 3+ pending or avg age 7+ days
      .sort((a, b) => b.pendingCount - a.pendingCount);
  }

  /**
   * Calculate approval health score (0-100)
   */
  calculateHealthScore(metrics: {
    approvalRate: number;
    avgApprovalTimeDays: number;
    overdueCount: number;
    totalPending: number;
  }): number {
    let score = 100;

    // Approval rate factor (0-40 points)
    score -= (100 - metrics.approvalRate) * 0.4;

    // Turnaround time factor (0-30 points)
    if (metrics.avgApprovalTimeDays > 7) score -= 30;
    else if (metrics.avgApprovalTimeDays > 5) score -= 20;
    else if (metrics.avgApprovalTimeDays > 3) score -= 10;

    // Overdue factor (0-20 points)
    if (metrics.overdueCount > 0) {
      score -= Math.min(metrics.overdueCount * 5, 20);
    }

    // Pending backlog factor (0-10 points)
    if (metrics.totalPending > 10) score -= 10;
    else if (metrics.totalPending > 5) score -= 5;

    return Math.max(0, Math.min(100, Math.round(score)));
  }
}
