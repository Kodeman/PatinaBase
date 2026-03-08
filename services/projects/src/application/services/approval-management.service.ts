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

import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../prisma/prisma.service';
import { ApprovalValidator } from '../../domain/validators/approval.validator';
import { ApprovalWorkflowService } from '../../domain/services/approval-workflow.service';
import {
  IApprovalRepository,
  APPROVAL_REPOSITORY,
  CreateApprovalCommand,
  UpdateApprovalCommand,
  ApprovalQuery,
  ApprovalRecord,
  ApprovalMetrics,
  ApprovalSignature,
} from '../../domain/repositories/approval.repository.interface';

@Injectable()
export class ApprovalManagementService {
  constructor(
    @Inject(APPROVAL_REPOSITORY)
    private readonly repository: IApprovalRepository,
    private readonly validator: ApprovalValidator,
    private readonly workflowService: ApprovalWorkflowService,
    private readonly eventEmitter: EventEmitter2,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Create a new approval request
   */
  async create(
    projectId: string,
    command: CreateApprovalCommand,
    requestedBy: string
  ): Promise<ApprovalRecord> {
    // Validate business rules
    this.validator.validateCreateData({ ...command, projectId, requestedBy });

    // Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, clientId: true, designerId: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Verify segment exists if provided
    if (command.segmentId) {
      const segment = await this.prisma.timelineSegment.findFirst({
        where: {
          id: command.segmentId,
          projectId,
        },
        select: { id: true },
      });

      if (!segment) {
        throw new NotFoundException('Timeline segment not found');
      }
    }

    // Create approval
    const approval = await this.repository.create({
      ...command,
      projectId,
      requestedBy,
    });

    // Emit event
    this.eventEmitter.emit('approval.requested', {
      approvalId: approval.id,
      projectId,
      assignedTo: approval.assignedTo,
      requestedBy,
      approvalType: approval.approvalType,
      priority: approval.priority,
      timestamp: new Date(),
    });

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'approval_record',
        entityId: approval.id,
        action: 'created',
        actor: requestedBy,
        metadata: { projectId },
      },
    });

    return approval;
  }

  /**
   * Get all approvals for a project
   */
  async findByProject(query: ApprovalQuery): Promise<ApprovalRecord[]> {
    return this.repository.findByProject(query);
  }

  /**
   * Get pending approvals for a project
   */
  async findPending(projectId: string): Promise<ApprovalRecord[]> {
    return this.repository.findPending(projectId);
  }

  /**
   * Get specific approval
   */
  async findOne(projectId: string, approvalId: string): Promise<ApprovalRecord> {
    const approval = await this.repository.findById(projectId, approvalId);

    if (!approval) {
      throw new NotFoundException('Approval not found');
    }

    return approval;
  }

  /**
   * Approve an approval request
   */
  async approve(
    projectId: string,
    approvalId: string,
    userId: string,
    comments?: string,
    signature?: ApprovalSignature,
    ipAddress?: string
  ): Promise<ApprovalRecord> {
    const approval = await this.findOne(projectId, approvalId);

    // Validate action
    this.validator.validateApprovalAction(approval, userId, 'approve');

    // Validate signature if provided
    if (signature) {
      this.validator.validateSignature(signature);

      // Add IP address to signature
      signature.ipAddress = ipAddress;
    }

    // Validate comment if provided
    if (comments) {
      this.validator.validateComment(comments);
    }

    // Update approval
    const updated = await this.repository.approve(approvalId, userId, comments, signature);

    // Emit event
    this.eventEmitter.emit('approval.approved', {
      approvalId,
      projectId,
      approvedBy: userId,
      requestedBy: approval.requestedBy,
      approvalType: approval.approvalType,
      timestamp: new Date(),
    });

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'approval_record',
        entityId: approvalId,
        action: 'approved',
        actor: userId,
        metadata: { projectId, comments },
      },
    });

    return updated;
  }

  /**
   * Reject an approval request
   */
  async reject(
    projectId: string,
    approvalId: string,
    userId: string,
    reason: string,
    comments?: string
  ): Promise<ApprovalRecord> {
    const approval = await this.findOne(projectId, approvalId);

    // Validate action
    this.validator.validateApprovalAction(approval, userId, 'reject');

    // Validate rejection reason
    this.validator.validateRejectionReason(reason);

    // Validate comment if provided
    if (comments) {
      this.validator.validateComment(comments);
    }

    // Update approval
    const updated = await this.repository.reject(approvalId, userId, reason, comments);

    // Emit event
    this.eventEmitter.emit('approval.rejected', {
      approvalId,
      projectId,
      rejectedBy: userId,
      requestedBy: approval.requestedBy,
      approvalType: approval.approvalType,
      reason,
      timestamp: new Date(),
    });

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'approval_record',
        entityId: approvalId,
        action: 'rejected',
        actor: userId,
        metadata: { projectId, reason },
      },
    });

    return updated;
  }

  /**
   * Add a discussion comment to an approval
   */
  async discuss(
    projectId: string,
    approvalId: string,
    userId: string,
    comment: string
  ): Promise<ApprovalRecord> {
    const approval = await this.findOne(projectId, approvalId);

    // Validate comment
    this.validator.validateComment(comment);

    // Update approval
    const updated = await this.repository.markForDiscussion(approvalId, userId, comment);

    // Emit event
    this.eventEmitter.emit('approval.discussed', {
      approvalId,
      projectId,
      userId,
      requestedBy: approval.requestedBy,
      assignedTo: approval.assignedTo,
      timestamp: new Date(),
    });

    return updated;
  }

  /**
   * Add/update digital signature for an approval
   */
  async addSignature(
    projectId: string,
    approvalId: string,
    userId: string,
    signature: ApprovalSignature,
    ipAddress?: string
  ): Promise<ApprovalRecord> {
    const approval = await this.findOne(projectId, approvalId);

    // Validate user is assigned
    this.validator.validateUserAssignment(approval.assignedTo, userId);

    // Validate signature
    this.validator.validateSignature(signature);

    // Add IP address
    signature.ipAddress = ipAddress;
    signature.signerId = userId;

    // Update approval
    const updated = await this.repository.addSignature(approvalId, signature);

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'approval_record',
        entityId: approvalId,
        action: 'signature_added',
        actor: userId,
        metadata: { projectId },
      },
    });

    return updated;
  }

  /**
   * Update approval
   */
  async update(
    projectId: string,
    approvalId: string,
    command: UpdateApprovalCommand,
    userId: string
  ): Promise<ApprovalRecord> {
    const approval = await this.findOne(projectId, approvalId);

    // Validate can modify
    this.validator.validateCanProcess(approval.status);

    // Validate update data
    this.validator.validateUpdateData(command);

    // Validate edit window (30 minutes)
    this.validator.validateEditWindow(approval.createdAt, 30);

    // Update approval
    const updated = await this.repository.update(approvalId, command);

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'approval_record',
        entityId: approvalId,
        action: 'updated',
        actor: userId,
        changes: command as any,
      },
    });

    return updated;
  }

  /**
   * Cancel approval
   */
  async cancel(projectId: string, approvalId: string, userId: string): Promise<void> {
    const approval = await this.findOne(projectId, approvalId);

    // Validate can modify
    this.validator.validateCanProcess(approval.status);

    // Cancel
    await this.repository.cancel(approvalId);

    // Emit event
    this.eventEmitter.emit('approval.cancelled', {
      approvalId,
      projectId,
      userId,
      timestamp: new Date(),
    });

    // Log audit
    await this.prisma.auditLog.create({
      data: {
        entityType: 'approval_record',
        entityId: approvalId,
        action: 'cancelled',
        actor: userId,
        metadata: { projectId },
      },
    });
  }

  /**
   * Get approval metrics for a project
   */
  async getMetrics(projectId: string): Promise<ApprovalMetrics> {
    return this.repository.getMetrics(projectId);
  }

  /**
   * Get approval health score
   */
  async getHealthScore(projectId: string): Promise<number> {
    const metrics = await this.repository.getMetrics(projectId);

    return this.workflowService.calculateHealthScore({
      approvalRate: metrics.approvalRate,
      avgApprovalTimeDays: metrics.avgApprovalTimeDays,
      overdueCount: metrics.overdue,
      totalPending: metrics.pending,
    });
  }

  /**
   * Get overdue approvals
   */
  async findOverdue(projectId: string): Promise<ApprovalRecord[]> {
    return this.repository.findOverdue(projectId);
  }

  /**
   * Get approvals assigned to user
   */
  async findByAssignee(userId: string): Promise<ApprovalRecord[]> {
    return this.repository.findByAssignee(userId);
  }

  /**
   * Prioritize approvals for a project
   */
  async prioritizeApprovals(projectId: string): Promise<string[]> {
    const approvals = await this.repository.findPending(projectId);

    const approvalsForPrioritization = approvals.map((a) => ({
      id: a.id,
      priority: a.priority,
      dueDate: a.dueDate,
      createdAt: a.createdAt,
    }));

    return this.workflowService.prioritizeApprovals(approvalsForPrioritization);
  }
}
