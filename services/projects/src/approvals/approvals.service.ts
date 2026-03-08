import { Injectable, NotFoundException, ForbiddenException, Logger, BadRequestException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApprovalDto } from './dto/create-approval.dto';
import { ApproveDto, RejectDto, DiscussDto, SignatureDto } from './dto/approval-action.dto';

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Create a new approval request
   */
  async create(projectId: string, createDto: CreateApprovalDto, requestedBy: string) {
    // Verify project exists
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, clientId: true, designerId: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    // Verify segment exists if provided
    if (createDto.segmentId) {
      const segment = await this.prisma.timelineSegment.findFirst({
        where: {
          id: createDto.segmentId,
          projectId,
        },
        select: { id: true },
      });

      if (!segment) {
        throw new NotFoundException('Timeline segment not found');
      }
    }

    // Create approval and outbox event in transaction
    const approval = await this.prisma.$transaction(async (tx) => {
      const newApproval = await tx.approvalRecord.create({
        data: {
          projectId,
          segmentId: createDto.segmentId,
          title: createDto.title,
          description: createDto.description,
          approvalType: createDto.approvalType,
          priority: createDto.priority || 'normal',
          requestedBy,
          assignedTo: createDto.assignedTo,
          dueDate: createDto.dueDate ? new Date(createDto.dueDate) : null,
          documents: createDto.documents || [],
          comments: [],
          metadata: createDto.metadata,
        },
      });

      // Create outbox event
      await tx.outboxEvent.create({
        data: {
          type: 'approval.requested',
          payload: {
            approvalId: newApproval.id,
            projectId,
            assignedTo: newApproval.assignedTo,
            requestedBy,
            approvalType: newApproval.approvalType,
            priority: newApproval.priority,
            title: newApproval.title,
            dueDate: newApproval.dueDate,
            clientId: project.clientId,
            designerId: project.designerId,
          },
          headers: {
            timestamp: new Date().toISOString(),
            source: 'projects-service',
          },
        },
      });

      // Log audit
      await tx.auditLog.create({
        data: {
          entityType: 'approval_record',
          entityId: newApproval.id,
          action: 'created',
          actor: requestedBy,
          metadata: { projectId },
        },
      });

      return newApproval;
    });

    // Emit in-process event for notification
    this.eventEmitter.emit('approval.requested', {
      approvalId: approval.id,
      projectId,
      assignedTo: approval.assignedTo,
      requestedBy,
      approvalType: approval.approvalType,
      priority: approval.priority,
      timestamp: new Date(),
    });

    this.logger.log(`Approval requested: ${approval.id} for project ${projectId}`);

    return approval;
  }

  /**
   * Get all approvals for a project
   */
  async findByProject(projectId: string, status?: string) {
    const where: any = { projectId };
    if (status) where.status = status;

    return this.prisma.approvalRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get all approvals for a user across all projects
   * @param userId - User ID (client or designer)
   * @param type - Optional approval type filter
   * @param status - Optional status filter
   */
  async findByUser(userId: string, type?: string, status?: string) {
    const where: any = {
      OR: [
        { assignedTo: userId }, // Client approvals
        { requestedBy: userId }, // Designer's requests
      ],
    };

    if (type && type !== 'all') {
      where.approvalType = type;
    }

    if (status && status !== 'all') {
      where.status = status;
    }

    const approvals = await this.prisma.approvalRecord.findMany({
      where,
      include: {
        project: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
        { createdAt: 'desc' },
      ],
    });

    // Map to include project title for client portal
    return approvals.map(approval => ({
      ...approval,
      projectTitle: approval.project.title,
    }));
  }

  /**
   * Get pending approvals for a project
   */
  async getPending(projectId: string) {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException('Project not found');
    }

    return this.prisma.approvalRecord.findMany({
      where: {
        projectId,
        status: { in: ['pending', 'needs_discussion'] },
      },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  }

  /**
   * Get specific approval
   */
  async findOne(projectId: string, approvalId: string) {
    const approval = await this.prisma.approvalRecord.findFirst({
      where: {
        id: approvalId,
        projectId,
      },
    });

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
    approveDto: ApproveDto,
    userId: string,
    ipAddress?: string,
  ) {
    const approval = await this.findOne(projectId, approvalId);

    if (approval.status !== 'pending' && approval.status !== 'needs_discussion') {
      throw new BadRequestException('Approval has already been processed');
    }

    if (approval.assignedTo !== userId) {
      throw new ForbiddenException('You are not authorized to approve this request');
    }

    // Get project info for event
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { clientId: true, designerId: true },
    });

    // Prepare signature data
    let signatureData = approveDto.signature;
    if (signatureData) {
      signatureData = {
        ...signatureData,
        timestamp: new Date().toISOString(),
        ipAddress: ipAddress || signatureData.ipAddress,
      };
    }

    // Add approval comment
    const comments = (approval.comments as any[]) || [];
    if (approveDto.comments) {
      comments.push({
        userId,
        action: 'approved',
        comment: approveDto.comments,
        timestamp: new Date().toISOString(),
      });
    }

    // Update approval and create outbox event in transaction
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedApproval = await tx.approvalRecord.update({
        where: { id: approvalId },
        data: {
          status: 'approved',
          approvedBy: userId,
          approvedAt: new Date(),
          signature: signatureData,
          comments,
          metadata: (approveDto.metadata || approval.metadata) as any,
        },
      });

      // Create outbox event
      await tx.outboxEvent.create({
        data: {
          type: 'approval.approved',
          payload: {
            approvalId,
            projectId,
            approvedBy: userId,
            requestedBy: approval.requestedBy,
            approvalType: approval.approvalType,
            title: approval.title,
            clientId: project?.clientId,
            designerId: project?.designerId,
          },
          headers: {
            timestamp: new Date().toISOString(),
            source: 'projects-service',
          },
        },
      });

      // Log audit
      await tx.auditLog.create({
        data: {
          entityType: 'approval_record',
          entityId: approvalId,
          action: 'approved',
          actor: userId,
          metadata: { projectId, comments: approveDto.comments },
        },
      });

      return updatedApproval;
    });

    // Emit in-process event
    this.eventEmitter.emit('approval.approved', {
      approvalId,
      projectId,
      approvedBy: userId,
      requestedBy: approval.requestedBy,
      approvalType: approval.approvalType,
      timestamp: new Date(),
    });

    this.logger.log(`Approval approved: ${approvalId} by ${userId}`);

    return updated;
  }

  /**
   * Reject an approval request
   */
  async reject(
    projectId: string,
    approvalId: string,
    rejectDto: RejectDto,
    userId: string,
  ) {
    const approval = await this.findOne(projectId, approvalId);

    if (approval.status !== 'pending' && approval.status !== 'needs_discussion') {
      throw new BadRequestException('Approval has already been processed');
    }

    if (approval.assignedTo !== userId) {
      throw new ForbiddenException('You are not authorized to reject this request');
    }

    // Get project info for event
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { clientId: true, designerId: true },
    });

    // Add rejection comment
    const comments = (approval.comments as any[]) || [];
    comments.push({
      userId,
      action: 'rejected',
      comment: rejectDto.comments || rejectDto.reason,
      timestamp: new Date().toISOString(),
    });

    // Update approval and create outbox event in transaction
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedApproval = await tx.approvalRecord.update({
        where: { id: approvalId },
        data: {
          status: 'rejected',
          rejectedBy: userId,
          rejectedAt: new Date(),
          rejectionReason: rejectDto.reason,
          comments,
        },
      });

      // Create outbox event
      await tx.outboxEvent.create({
        data: {
          type: 'approval.rejected',
          payload: {
            approvalId,
            projectId,
            rejectedBy: userId,
            requestedBy: approval.requestedBy,
            approvalType: approval.approvalType,
            title: approval.title,
            reason: rejectDto.reason,
            clientId: project?.clientId,
            designerId: project?.designerId,
          },
          headers: {
            timestamp: new Date().toISOString(),
            source: 'projects-service',
          },
        },
      });

      // Log audit
      await tx.auditLog.create({
        data: {
          entityType: 'approval_record',
          entityId: approvalId,
          action: 'rejected',
          actor: userId,
          metadata: { projectId, reason: rejectDto.reason },
        },
      });

      return updatedApproval;
    });

    // Emit in-process event
    this.eventEmitter.emit('approval.rejected', {
      approvalId,
      projectId,
      rejectedBy: userId,
      requestedBy: approval.requestedBy,
      approvalType: approval.approvalType,
      reason: rejectDto.reason,
      timestamp: new Date(),
    });

    this.logger.log(`Approval rejected: ${approvalId} by ${userId}`);

    return updated;
  }

  /**
   * Add a discussion comment to an approval
   */
  async discuss(
    projectId: string,
    approvalId: string,
    discussDto: DiscussDto,
    userId: string,
  ) {
    const approval = await this.findOne(projectId, approvalId);

    // Get project info for event
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { clientId: true, designerId: true },
    });

    const comments = (approval.comments as any[]) || [];
    comments.push({
      userId,
      action: 'discussed',
      comment: discussDto.comment,
      timestamp: new Date().toISOString(),
    });

    // Update approval and create outbox event in transaction
    const updated = await this.prisma.$transaction(async (tx) => {
      const updatedApproval = await tx.approvalRecord.update({
        where: { id: approvalId },
        data: {
          status: 'needs_discussion',
          comments,
        },
      });

      // Create outbox event
      await tx.outboxEvent.create({
        data: {
          type: 'approval.discussion_started',
          payload: {
            approvalId,
            projectId,
            userId,
            requestedBy: approval.requestedBy,
            assignedTo: approval.assignedTo,
            approvalType: approval.approvalType,
            title: approval.title,
            comment: discussDto.comment,
            clientId: project?.clientId,
            designerId: project?.designerId,
          },
          headers: {
            timestamp: new Date().toISOString(),
            source: 'projects-service',
          },
        },
      });

      return updatedApproval;
    });

    // Emit in-process event
    this.eventEmitter.emit('approval.discussed', {
      approvalId,
      projectId,
      userId,
      requestedBy: approval.requestedBy,
      assignedTo: approval.assignedTo,
      timestamp: new Date(),
    });

    this.logger.log(`Discussion started on approval: ${approvalId}`);

    return updated;
  }

  /**
   * Add/update digital signature for an approval
   */
  async addSignature(
    projectId: string,
    approvalId: string,
    signatureDto: SignatureDto,
    userId: string,
    ipAddress?: string,
  ) {
    const approval = await this.findOne(projectId, approvalId);

    if (approval.assignedTo !== userId) {
      throw new ForbiddenException('You are not authorized to sign this approval');
    }

    const signatureData = {
      data: signatureDto.data,
      signerName: signatureDto.signerName,
      signerId: userId,
      timestamp: new Date().toISOString(),
      ipAddress,
      metadata: signatureDto.metadata,
    };

    const updated = await this.prisma.approvalRecord.update({
      where: { id: approvalId },
      data: {
        signature: signatureData,
      },
    });

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
   * Calculate approval velocity metrics for a project
   */
  async getApprovalMetrics(projectId: string) {
    const approvals = await this.prisma.approvalRecord.findMany({
      where: { projectId },
      select: {
        status: true,
        createdAt: true,
        approvedAt: true,
        rejectedAt: true,
        dueDate: true,
      },
    });

    const total = approvals.length;
    const approved = approvals.filter(a => a.status === 'approved').length;
    const rejected = approvals.filter(a => a.status === 'rejected').length;
    const pending = approvals.filter(a => a.status === 'pending' || a.status === 'needs_discussion').length;

    // Calculate average approval time (in days)
    const approvedItems = approvals.filter(a => a.approvedAt);
    const avgApprovalTime = approvedItems.length > 0
      ? approvedItems.reduce((sum, a) => {
          const diff = a.approvedAt!.getTime() - a.createdAt.getTime();
          return sum + (diff / (1000 * 60 * 60 * 24));
        }, 0) / approvedItems.length
      : 0;

    // Calculate overdue approvals
    const now = new Date();
    const overdue = approvals.filter(a =>
      (a.status === 'pending' || a.status === 'needs_discussion') &&
      a.dueDate &&
      a.dueDate < now
    ).length;

    return {
      total,
      approved,
      rejected,
      pending,
      overdue,
      approvalRate: total > 0 ? (approved / total) * 100 : 0,
      avgApprovalTimeDays: Math.round(avgApprovalTime * 10) / 10,
    };
  }
}
