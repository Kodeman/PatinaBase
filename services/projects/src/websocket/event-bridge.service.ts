import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { WebSocketProjectsGateway } from './websocket.gateway';
import { MessageQueueService } from './message-queue.service';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Event Bridge Service
 *
 * Connects domain events from the EventEmitter to WebSocket broadcasts.
 * This ensures real-time updates are sent to connected clients when
 * business operations occur.
 *
 * Features:
 * - Automatic event-to-websocket routing
 * - Message queuing for offline clients
 * - Event transformation and enrichment
 * - Connection-aware broadcasting
 */
@Injectable()
export class EventBridgeService implements OnModuleInit {
  private readonly logger = new Logger(EventBridgeService.name);

  constructor(
    private readonly eventEmitter: EventEmitter2,
    private readonly gateway: WebSocketProjectsGateway,
    private readonly messageQueue: MessageQueueService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Setup event listeners on module initialization
   */
  onModuleInit() {
    this.logger.log('Setting up event bridge listeners...');
    this.setupApprovalEvents();
    this.setupMilestoneEvents();
    this.setupDocumentEvents();
    this.setupTaskEvents();
    this.setupProjectEvents();
    this.setupRfiEvents();
    this.setupChangeOrderEvents();
    this.setupIssueEvents();
    this.logger.log('Event bridge initialized successfully');
  }

  /**
   * Setup approval event listeners
   */
  private setupApprovalEvents() {
    // Approval created event
    this.eventEmitter.on('approval.created', async (event) => {
      const payload = {
        approvalId: event.approvalId,
        projectId: event.projectId,
        title: event.title,
        assignedTo: event.assignedTo,
        approvalType: event.approvalType,
        priority: event.priority,
        dueDate: event.dueDate,
        timestamp: event.timestamp || new Date(),
      };

      await this.broadcastToProjectWithQueue(
        event.projectId,
        'approval:created',
        payload,
      );

      this.logger.debug(`Approval created broadcasted: ${event.approvalId}`);
    });

    // Approval approved event
    this.eventEmitter.on('approval.approved', async (event) => {
      const payload = {
        approvalId: event.approvalId,
        projectId: event.projectId,
        approvedBy: event.approvedBy,
        comments: event.comments,
        timestamp: event.timestamp || new Date(),
      };

      await this.broadcastToProjectWithQueue(
        event.projectId,
        'approval:approved',
        payload,
      );

      // Notify approval owner
      if (event.ownerId && event.ownerId !== event.approvedBy) {
        await this.gateway.sendToUser(event.ownerId, 'approval:approved:notification', payload);
      }

      this.logger.debug(`Approval approved broadcasted: ${event.approvalId}`);
    });

    // Approval rejected event
    this.eventEmitter.on('approval.rejected', async (event) => {
      const payload = {
        approvalId: event.approvalId,
        projectId: event.projectId,
        rejectedBy: event.rejectedBy,
        reason: event.reason,
        requestedChanges: event.requestedChanges,
        timestamp: event.timestamp || new Date(),
      };

      await this.broadcastToProjectWithQueue(
        event.projectId,
        'approval:rejected',
        payload,
      );

      // Notify approval owner
      if (event.ownerId && event.ownerId !== event.rejectedBy) {
        await this.gateway.sendToUser(event.ownerId, 'approval:rejected:notification', payload);
      }

      this.logger.debug(`Approval rejected broadcasted: ${event.approvalId}`);
    });

    // Approval discussion event
    this.eventEmitter.on('approval.discussed', async (event) => {
      const payload = {
        approvalId: event.approvalId,
        projectId: event.projectId,
        userId: event.userId,
        userName: event.userName,
        timestamp: event.timestamp || new Date(),
      };

      await this.broadcastToProjectWithQueue(
        event.projectId,
        'approval:discussed',
        payload,
      );
    });
  }

  /**
   * Setup milestone event listeners
   */
  private setupMilestoneEvents() {
    this.eventEmitter.on('milestone.completed', async (event) => {
      const payload = {
        milestoneId: event.milestoneId,
        projectId: event.projectId,
        title: event.title,
        completedBy: event.completedBy,
        completionPercentage: event.completionPercentage,
        timestamp: event.timestamp || new Date(),
      };

      await this.broadcastToProjectWithQueue(
        event.projectId,
        'milestone:completed',
        payload,
      );

      this.logger.debug(`Milestone completed broadcasted: ${event.milestoneId}`);
    });

    this.eventEmitter.on('milestone.status_changed', async (event) => {
      const payload = {
        milestoneId: event.milestoneId,
        projectId: event.projectId,
        oldStatus: event.oldStatus,
        newStatus: event.newStatus,
        timestamp: event.timestamp || new Date(),
      };

      await this.broadcastToProjectWithQueue(
        event.projectId,
        'milestone:status:changed',
        payload,
      );
    });
  }

  /**
   * Setup document event listeners
   */
  private setupDocumentEvents() {
    this.eventEmitter.on('document.uploaded', async (event) => {
      const payload = {
        documentId: event.documentId,
        projectId: event.projectId,
        name: event.name,
        category: event.category,
        version: event.version,
        fileSize: event.fileSize,
        uploadedBy: event.uploadedBy,
        uploaderName: event.uploaderName,
        timestamp: event.timestamp || new Date(),
      };

      await this.broadcastToProjectWithQueue(
        event.projectId,
        'document:uploaded',
        payload,
      );

      this.logger.debug(`Document uploaded broadcasted: ${event.documentId}`);
    });

    // Document upload progress (for large files)
    this.eventEmitter.on('document.upload_progress', async (event) => {
      const payload = {
        documentId: event.documentId,
        projectId: event.projectId,
        percent: event.percent,
        bytesUploaded: event.bytesUploaded,
        totalBytes: event.totalBytes,
        timestamp: event.timestamp || new Date(),
      };

      // Progress events are sent only to the uploader
      if (event.uploaderId) {
        await this.gateway.sendToUser(event.uploaderId, 'document:upload:progress', payload);
      }
    });

    this.eventEmitter.on('document.version_created', async (event) => {
      const payload = {
        documentId: event.documentId,
        projectId: event.projectId,
        version: event.version,
        createdBy: event.createdBy,
        changeDescription: event.changeDescription,
        timestamp: event.timestamp || new Date(),
      };

      await this.broadcastToProjectWithQueue(
        event.projectId,
        'document:version:created',
        payload,
      );
    });
  }

  /**
   * Setup task event listeners
   */
  private setupTaskEvents() {
    this.eventEmitter.on('task.created', async (event) => {
      const payload = {
        taskId: event.taskId,
        projectId: event.projectId,
        title: event.title,
        assigneeId: event.assigneeId,
        priority: event.priority,
        dueDate: event.dueDate,
        timestamp: event.timestamp || new Date(),
      };

      await this.broadcastToProjectWithQueue(
        event.projectId,
        'task:created',
        payload,
      );

      // Notify assignee
      if (event.assigneeId) {
        await this.gateway.sendToUser(event.assigneeId, 'task:assigned', payload);
      }
    });

    this.eventEmitter.on('task.status_changed', async (event) => {
      const payload = {
        taskId: event.taskId,
        projectId: event.projectId,
        oldStatus: event.oldStatus,
        newStatus: event.newStatus,
        timestamp: event.timestamp || new Date(),
      };

      await this.broadcastToProjectWithQueue(
        event.projectId,
        'task:status:changed',
        payload,
      );
    });
  }

  /**
   * Setup project event listeners
   */
  private setupProjectEvents() {
    this.eventEmitter.on('project.status_changed', async (event) => {
      const payload = {
        projectId: event.projectId,
        oldStatus: event.oldStatus,
        newStatus: event.newStatus,
        timestamp: event.timestamp || new Date(),
      };

      await this.broadcastToProjectWithQueue(
        event.projectId,
        'project:status:changed',
        payload,
      );
    });

    this.eventEmitter.on('project.member_added', async (event) => {
      const payload = {
        projectId: event.projectId,
        userId: event.userId,
        role: event.role,
        addedBy: event.addedBy,
        timestamp: event.timestamp || new Date(),
      };

      await this.broadcastToProjectWithQueue(
        event.projectId,
        'project:member:added',
        payload,
      );

      // Notify new member
      if (event.userId) {
        await this.gateway.sendToUser(event.userId, 'project:invitation', payload);
      }
    });
  }

  /**
   * Setup RFI event listeners
   */
  private setupRfiEvents() {
    this.eventEmitter.on('rfi.created', async (event) => {
      const payload = {
        rfiId: event.rfiId,
        projectId: event.projectId,
        submittedBy: event.submittedBy,
        priority: event.priority,
        timestamp: event.timestamp || new Date(),
      };

      await this.broadcastToProjectWithQueue(
        event.projectId,
        'rfi:created',
        payload,
      );
    });
  }

  /**
   * Setup change order event listeners
   */
  private setupChangeOrderEvents() {
    this.eventEmitter.on('change_order.submitted', async (event) => {
      const payload = {
        changeOrderId: event.changeOrderId,
        projectId: event.projectId,
        submittedBy: event.submittedBy,
        estimatedCost: event.estimatedCost,
        timestamp: event.timestamp || new Date(),
      };

      await this.broadcastToProjectWithQueue(
        event.projectId,
        'change_order:submitted',
        payload,
      );
    });
  }

  /**
   * Setup issue event listeners
   */
  private setupIssueEvents() {
    this.eventEmitter.on('issue.created', async (event) => {
      const payload = {
        issueId: event.issueId,
        projectId: event.projectId,
        severity: event.severity,
        reportedBy: event.reportedBy,
        timestamp: event.timestamp || new Date(),
      };

      await this.broadcastToProjectWithQueue(
        event.projectId,
        'issue:created',
        payload,
      );
    });
  }

  /**
   * Broadcast to project room and queue for offline users
   */
  private async broadcastToProjectWithQueue(
    projectId: string,
    event: string,
    payload: any,
  ) {
    try {
      // Broadcast to online users
      this.gateway.broadcastToProject(projectId, event, payload);

      // Get project members
      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: {
          clientId: true,
          designerId: true,
        },
      });

      if (!project) {
        this.logger.warn(`Project not found for broadcasting: ${projectId}`);
        return;
      }

      const memberIds = [project.clientId, project.designerId].filter(Boolean);

      // Check which users are offline and queue message
      for (const userId of memberIds) {
        const isOnline = await this.isUserOnline(userId);
        if (!isOnline) {
          await this.messageQueue.enqueueMessage(userId, {
            event,
            payload,
            projectId,
            timestamp: new Date(),
          });
        }
      }
    } catch (error) {
      this.logger.error(`Error broadcasting to project ${projectId}:`, error);
    }
  }

  /**
   * Check if user has active WebSocket connections
   */
  private async isUserOnline(userId: string): Promise<boolean> {
    const activeConnections = await this.prisma.activeConnection.count({
      where: {
        userId,
        lastPingAt: {
          gte: new Date(Date.now() - 60000), // Active in last minute
        },
      },
    });

    return activeConnections > 0;
  }
}
