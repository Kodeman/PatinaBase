/**
 * Prisma Approval Repository Implementation (Infrastructure Layer)
 *
 * Concrete implementation of IApprovalRepository using Prisma ORM.
 * Isolates all database access logic from business logic.
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma-client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  IApprovalRepository,
  CreateApprovalCommand,
  UpdateApprovalCommand,
  ApprovalQuery,
  ApprovalRecord,
  ApprovalMetrics,
  ApprovalSignature,
  ApprovalType,
} from '../../domain/repositories/approval.repository.interface';

@Injectable()
export class PrismaApprovalRepository implements IApprovalRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Type guard to convert string approvalType from database to ApprovalType
   */
  private toApprovalType(type: string): ApprovalType {
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
    return (
      validTypes.includes(type as ApprovalType) ? (type as ApprovalType) : 'general'
    );
  }

  /**
   * Type mapper to cast Prisma result to ApprovalRecord
   */
  private mapToApprovalRecord(data: any): ApprovalRecord {
    return {
      ...data,
      approvalType: this.toApprovalType(data.approvalType),
      signature: data.signature ? this.toApprovalSignature(data.signature) : null,
    };
  }

  /**
   * Convert signature JSON to ApprovalSignature type
   */
  private toApprovalSignature(data: any): ApprovalSignature | null {
    if (!data) return null;
    return {
      data: data.data || '',
      signerName: data.signerName || '',
      signerId: data.signerId || '',
      timestamp: data.timestamp || new Date().toISOString(),
      ipAddress: data.ipAddress,
      metadata: data.metadata,
    };
  }

  async create(command: CreateApprovalCommand): Promise<ApprovalRecord> {
    const result = await this.prisma.approvalRecord.create({
      data: {
        projectId: command.projectId,
        segmentId: command.segmentId,
        title: command.title,
        description: command.description,
        approvalType: command.approvalType,
        priority: command.priority || 'normal',
        requestedBy: command.requestedBy,
        assignedTo: command.assignedTo,
        dueDate: command.dueDate ? new Date(command.dueDate) : null,
        documents: command.documents || [],
        comments: [],
        metadata: command.metadata as Prisma.InputJsonValue | undefined,
      },
    });
    return this.mapToApprovalRecord(result);
  }

  async findByProject(query: ApprovalQuery): Promise<ApprovalRecord[]> {
    const where: any = { projectId: query.projectId };

    if (query.status) where.status = query.status;
    if (query.assignedTo) where.assignedTo = query.assignedTo;
    if (query.priority) where.priority = query.priority;
    if (query.approvalType) where.approvalType = query.approvalType;

    const results = await this.prisma.approvalRecord.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });
    return results.map((r) => this.mapToApprovalRecord(r));
  }

  async findPending(projectId: string): Promise<ApprovalRecord[]> {
    const results = await this.prisma.approvalRecord.findMany({
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
    return results.map((r) => this.mapToApprovalRecord(r));
  }

  async findById(projectId: string, approvalId: string): Promise<ApprovalRecord | null> {
    const result = await this.prisma.approvalRecord.findFirst({
      where: {
        id: approvalId,
        projectId,
      },
    });
    return result ? this.mapToApprovalRecord(result) : null;
  }

  async approve(
    approvalId: string,
    approvedBy: string,
    comments?: string,
    signature?: ApprovalSignature
  ): Promise<ApprovalRecord> {
    const approval = await this.prisma.approvalRecord.findUnique({
      where: { id: approvalId },
    });

    if (!approval) {
      throw new Error('Approval not found');
    }

    // Add approval comment
    const updatedComments = (approval.comments as any[]) || [];
    if (comments) {
      updatedComments.push({
        userId: approvedBy,
        action: 'approved',
        comment: comments,
        timestamp: new Date().toISOString(),
      });
    }

    // Prepare signature data
    let signatureData = signature;
    if (signatureData) {
      signatureData = {
        ...signatureData,
        timestamp: new Date().toISOString(),
      };
    }

    const result = await this.prisma.approvalRecord.update({
      where: { id: approvalId },
      data: {
        status: 'approved',
        approvedBy,
        approvedAt: new Date(),
        signature: signatureData ? JSON.parse(JSON.stringify(signatureData)) : null,
        comments: updatedComments,
      },
    });
    return this.mapToApprovalRecord(result);
  }

  async reject(
    approvalId: string,
    rejectedBy: string,
    reason: string,
    comments?: string
  ): Promise<ApprovalRecord> {
    const approval = await this.prisma.approvalRecord.findUnique({
      where: { id: approvalId },
    });

    if (!approval) {
      throw new Error('Approval not found');
    }

    // Add rejection comment
    const updatedComments = (approval.comments as any[]) || [];
    updatedComments.push({
      userId: rejectedBy,
      action: 'rejected',
      comment: comments || reason,
      timestamp: new Date().toISOString(),
    });

    const result = await this.prisma.approvalRecord.update({
      where: { id: approvalId },
      data: {
        status: 'rejected',
        rejectedBy,
        rejectedAt: new Date(),
        rejectionReason: reason,
        comments: updatedComments,
      },
    });
    return this.mapToApprovalRecord(result);
  }

  async markForDiscussion(
    approvalId: string,
    userId: string,
    comment: string
  ): Promise<ApprovalRecord> {
    const approval = await this.prisma.approvalRecord.findUnique({
      where: { id: approvalId },
    });

    if (!approval) {
      throw new Error('Approval not found');
    }

    const updatedComments = (approval.comments as any[]) || [];
    updatedComments.push({
      userId,
      action: 'discussed',
      comment,
      timestamp: new Date().toISOString(),
    });

    const result = await this.prisma.approvalRecord.update({
      where: { id: approvalId },
      data: {
        status: 'needs_discussion',
        comments: updatedComments,
      },
    });
    return this.mapToApprovalRecord(result);
  }

  async addSignature(
    approvalId: string,
    signature: ApprovalSignature
  ): Promise<ApprovalRecord> {
    const signatureData = {
      ...signature,
      timestamp: new Date().toISOString(),
    };

    const result = await this.prisma.approvalRecord.update({
      where: { id: approvalId },
      data: {
        signature: JSON.parse(JSON.stringify(signatureData)),
      },
    });
    return this.mapToApprovalRecord(result);
  }

  async update(approvalId: string, command: UpdateApprovalCommand): Promise<ApprovalRecord> {
    const result = await this.prisma.approvalRecord.update({
      where: { id: approvalId },
      data: {
        title: command.title,
        description: command.description,
        priority: command.priority,
        assignedTo: command.assignedTo,
        dueDate: command.dueDate ? new Date(command.dueDate) : undefined,
        documents: command.documents,
        metadata: command.metadata as Prisma.InputJsonValue | undefined,
      },
    });
    return this.mapToApprovalRecord(result);
  }

  async cancel(approvalId: string): Promise<void> {
    await this.prisma.approvalRecord.update({
      where: { id: approvalId },
      data: { status: 'cancelled' },
    });
  }

  async getMetrics(projectId: string): Promise<ApprovalMetrics> {
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
    const approved = approvals.filter((a) => a.status === 'approved').length;
    const rejected = approvals.filter((a) => a.status === 'rejected').length;
    const pending = approvals.filter(
      (a) => a.status === 'pending' || a.status === 'needs_discussion'
    ).length;

    // Calculate average approval time (in days)
    const approvedItems = approvals.filter((a) => a.approvedAt);
    const avgApprovalTime =
      approvedItems.length > 0
        ? approvedItems.reduce((sum, a) => {
            const diff = a.approvedAt!.getTime() - a.createdAt.getTime();
            return sum + diff / (1000 * 60 * 60 * 24);
          }, 0) / approvedItems.length
        : 0;

    // Calculate overdue approvals
    const now = new Date();
    const overdue = approvals.filter(
      (a) =>
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

  async findOverdue(projectId: string): Promise<ApprovalRecord[]> {
    const now = new Date();

    const results = await this.prisma.approvalRecord.findMany({
      where: {
        projectId,
        status: { in: ['pending', 'needs_discussion'] },
        dueDate: {
          lt: now,
        },
      },
      orderBy: { dueDate: 'asc' },
    });
    return results.map((r) => this.mapToApprovalRecord(r));
  }

  async findByAssignee(userId: string): Promise<ApprovalRecord[]> {
    const results = await this.prisma.approvalRecord.findMany({
      where: {
        assignedTo: userId,
        status: { in: ['pending', 'needs_discussion'] },
      },
      orderBy: [
        { priority: 'desc' },
        { dueDate: 'asc' },
        { createdAt: 'asc' },
      ],
    });
    return results.map((r) => this.mapToApprovalRecord(r));
  }
}
