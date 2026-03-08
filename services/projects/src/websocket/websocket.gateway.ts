import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Server, Socket } from 'socket.io';
import { OnEvent } from '@nestjs/event-emitter';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ConnectionMonitorService } from './connection-monitor.service';
import { MessageQueueService } from './message-queue.service';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  userRole?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
  namespace: '/projects',
})
export class WebSocketProjectsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebSocketProjectsGateway.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private connectionMonitor: ConnectionMonitorService,
    private messageQueue: MessageQueueService,
  ) {}

  /**
   * Handle client connection
   */
  async handleConnection(client: AuthenticatedSocket) {
    try {
      // Extract auth token from handshake
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.split(' ')[1];

      if (!token) {
        this.logger.warn(`Client ${client.id} connection rejected: No auth token`);
        client.disconnect();
        return;
      }

      // Verify JWT token and extract user info
      // This prevents token forgery and ensures secure authentication
      const userId = this.extractUserIdFromToken(token);
      const userRole = this.extractUserRoleFromToken(token);

      if (!userId) {
        this.logger.warn(`Client ${client.id} connection rejected: Invalid token`);
        client.disconnect();
        return;
      }

      client.userId = userId;
      client.userRole = userRole ?? undefined;

      // Store connection in database
      await this.prisma.activeConnection.create({
        data: {
          userId,
          socketId: client.id,
          userAgent: client.handshake.headers['user-agent'],
          ipAddress: client.handshake.address,
        },
      });

      this.logger.log(`Client connected: ${client.id} (User: ${userId})`);

      // Deliver queued messages for offline user
      const queuedMessages = await this.messageQueue.dequeueMessages(userId);
      if (queuedMessages.length > 0) {
        this.logger.log(`Delivering ${queuedMessages.length} queued messages to ${userId}`);
        client.emit('queued:messages', {
          messages: queuedMessages,
          count: queuedMessages.length,
        });
      }

      // Send connection confirmation
      client.emit('connected', {
        socketId: client.id,
        userId,
        timestamp: new Date(),
        queuedMessageCount: queuedMessages.length,
      });
    } catch (error) {
      this.logger.error(`Connection error for client ${client.id}:`, error);
      client.disconnect();
    }
  }

  /**
   * Handle client disconnection
   */
  async handleDisconnect(client: AuthenticatedSocket) {
    try {
      // Clear connection monitor data
      this.connectionMonitor.clearConnectionData(client.id);

      // Remove connection from database
      await this.prisma.activeConnection.delete({
        where: { socketId: client.id },
      }).catch(() => {
        // Connection might not exist in DB
      });

      this.logger.log(`Client disconnected: ${client.id} (User: ${client.userId})`);
    } catch (error) {
      this.logger.error(`Disconnect error for client ${client.id}:`, error);
    }
  }

  /**
   * Subscribe to project updates
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 requests per minute
  @SubscribeMessage('subscribe:project')
  async handleProjectSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { projectId: string },
  ) {
    try {
      const { projectId } = data;

      // Verify user has access to project (includes role-based check)
      const hasAccess = await this.verifyProjectAccess(
        client.userId!,
        projectId,
        client.userRole,
      );
      if (!hasAccess) {
        client.emit('error', {
          event: 'subscribe:project',
          message: 'Access denied to project',
        });
        return;
      }

      // Join project room
      client.join(`project:${projectId}`);

      // Update connection record
      await this.prisma.activeConnection.update({
        where: { socketId: client.id },
        data: { projectId },
      });

      this.logger.log(`Client ${client.id} subscribed to project ${projectId}`);

      client.emit('subscribed:project', {
        projectId,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Project subscribe error:', error);
      client.emit('error', {
        event: 'subscribe:project',
        message: 'Failed to subscribe to project',
      });
    }
  }

  /**
   * Unsubscribe from project updates
   */
  @SubscribeMessage('unsubscribe:project')
  async handleProjectUnsubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { projectId: string },
  ) {
    const { projectId } = data;
    client.leave(`project:${projectId}`);

    // Update connection record
    await this.prisma.activeConnection.update({
      where: { socketId: client.id },
      data: { projectId: null },
    }).catch(() => {
      // Connection might not exist
    });

    this.logger.log(`Client ${client.id} unsubscribed from project ${projectId}`);

    client.emit('unsubscribed:project', {
      projectId,
      timestamp: new Date(),
    });
  }

  /**
   * Handle ping to keep connection alive and measure latency
   */
  @SubscribeMessage('ping')
  async handlePing(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data?: { clientTimestamp?: number },
  ) {
    const serverTimestamp = Date.now();

    // Calculate latency if client sent timestamp
    if (data?.clientTimestamp) {
      const latency = serverTimestamp - data.clientTimestamp;
      this.connectionMonitor.recordLatency(client.id, latency);
    }

    // Update last ping time
    await this.prisma.activeConnection.update({
      where: { socketId: client.id },
      data: { lastPingAt: new Date() },
    }).catch(() => {
      // Connection might not exist
    });

    // Get connection stats
    const stats = this.connectionMonitor.getConnectionStats(client.id);

    client.emit('pong', {
      timestamp: new Date(),
      serverTimestamp,
      quality: stats?.quality || 'unknown',
      avgLatency: stats?.avgLatency || 0,
    });
  }

  /**
   * Get presence information for a project
   */
  @SubscribeMessage('presence:get')
  async handleGetPresence(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { projectId: string },
  ) {
    try {
      const { projectId } = data;

      // Get active connections for project
      const activeUsers = await this.prisma.activeConnection.findMany({
        where: {
          projectId,
          lastPingAt: {
            gte: new Date(Date.now() - 5 * 60 * 1000), // Active in last 5 minutes
          },
        },
        select: {
          userId: true,
          connectedAt: true,
          lastPingAt: true,
        },
      });

      // Get unique users
      const uniqueUsers = Array.from(
        new Map(activeUsers.map(u => [u.userId, u])).values()
      );

      client.emit('presence:update', {
        projectId,
        activeUsers: uniqueUsers,
        count: uniqueUsers.length,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Get presence error:', error);
    }
  }

  // Event Listeners

  /**
   * Handle timeline segment updates
   */
  @OnEvent('timeline.segment.updated')
  handleTimelineSegmentUpdate(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('timeline:segment:updated', {
      segmentId: payload.segmentId,
      projectId: payload.projectId,
      oldStatus: payload.oldStatus,
      newStatus: payload.newStatus,
      oldProgress: payload.oldProgress,
      newProgress: payload.newProgress,
      timestamp: payload.timestamp,
    });
  }

  /**
   * Handle approval requests
   */
  @OnEvent('approval.requested')
  handleApprovalRequested(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('approval:requested', {
      approvalId: payload.approvalId,
      projectId: payload.projectId,
      assignedTo: payload.assignedTo,
      approvalType: payload.approvalType,
      priority: payload.priority,
      timestamp: payload.timestamp,
    });
  }

  /**
   * Handle approval approved
   */
  @OnEvent('approval.approved')
  handleApprovalApproved(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('approval:approved', {
      approvalId: payload.approvalId,
      projectId: payload.projectId,
      approvedBy: payload.approvedBy,
      timestamp: payload.timestamp,
    });
  }

  /**
   * Handle approval rejected
   */
  @OnEvent('approval.rejected')
  handleApprovalRejected(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('approval:rejected', {
      approvalId: payload.approvalId,
      projectId: payload.projectId,
      rejectedBy: payload.rejectedBy,
      reason: payload.reason,
      timestamp: payload.timestamp,
    });
  }

  /**
   * Handle approval discussion
   */
  @OnEvent('approval.discussed')
  handleApprovalDiscussed(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('approval:discussed', {
      approvalId: payload.approvalId,
      projectId: payload.projectId,
      userId: payload.userId,
      timestamp: payload.timestamp,
    });
  }

  /**
   * Handle project status changes
   */
  @OnEvent('project.status_changed')
  handleProjectStatusChange(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('project:status:changed', {
      projectId: payload.projectId,
      oldStatus: payload.oldStatus,
      newStatus: payload.newStatus,
      timestamp: payload.timestamp,
    });
  }

  /**
   * Handle activity logged
   */
  @OnEvent('activity.logged')
  handleActivityLogged(payload: any) {
    // Broadcast presence update
    this.server.to(`project:${payload.projectId}`).emit('activity:logged', {
      projectId: payload.projectId,
      userId: payload.userId,
      activityType: payload.activityType,
      timestamp: payload.timestamp,
    });
  }

  // Task Events

  /**
   * Handle task created
   */
  @OnEvent('task.created')
  handleTaskCreated(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('task:created', {
      taskId: payload.taskId,
      projectId: payload.projectId,
      assigneeId: payload.assigneeId,
      timestamp: payload.timestamp,
    });
  }

  /**
   * Handle task status changed
   */
  @OnEvent('task.status_changed')
  handleTaskStatusChanged(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('task:status:changed', {
      taskId: payload.taskId,
      projectId: payload.projectId,
      oldStatus: payload.oldStatus,
      newStatus: payload.newStatus,
      timestamp: payload.timestamp,
    });
  }

  /**
   * Handle task completed
   */
  @OnEvent('task.completed')
  handleTaskCompleted(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('task:completed', {
      taskId: payload.taskId,
      projectId: payload.projectId,
      timestamp: payload.timestamp,
    });
  }

  /**
   * Handle task comment added
   */
  @OnEvent('task.comment_added')
  handleTaskCommentAdded(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('task:comment:added', {
      taskId: payload.taskId,
      projectId: payload.projectId,
      commentId: payload.commentId,
      userId: payload.userId,
      mentions: payload.mentions,
      timestamp: payload.timestamp,
    });

    // Notify mentioned users directly
    if (payload.mentions && payload.mentions.length > 0) {
      payload.mentions.forEach((userId: string) => {
        this.sendToUser(userId, 'task:mention', {
          taskId: payload.taskId,
          projectId: payload.projectId,
          commentId: payload.commentId,
          mentionedBy: payload.userId,
          timestamp: payload.timestamp,
        });
      });
    }
  }

  // RFI Events

  /**
   * Handle RFI created
   */
  @OnEvent('rfi.created')
  handleRfiCreated(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('rfi:created', {
      rfiId: payload.rfiId,
      projectId: payload.projectId,
      submittedBy: payload.submittedBy,
      priority: payload.priority,
      timestamp: payload.timestamp,
    });
  }

  /**
   * Handle RFI answered
   */
  @OnEvent('rfi.answered')
  handleRfiAnswered(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('rfi:answered', {
      rfiId: payload.rfiId,
      projectId: payload.projectId,
      answeredBy: payload.answeredBy,
      timestamp: payload.timestamp,
    });

    // Notify submitter
    if (payload.submittedBy) {
      this.sendToUser(payload.submittedBy, 'rfi:answered:notification', {
        rfiId: payload.rfiId,
        projectId: payload.projectId,
        timestamp: payload.timestamp,
      });
    }
  }

  /**
   * Handle RFI status changed
   */
  @OnEvent('rfi.status_changed')
  handleRfiStatusChanged(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('rfi:status:changed', {
      rfiId: payload.rfiId,
      projectId: payload.projectId,
      oldStatus: payload.oldStatus,
      newStatus: payload.newStatus,
      timestamp: payload.timestamp,
    });
  }

  // Change Order Events

  /**
   * Handle change order created
   */
  @OnEvent('change_order.submitted')
  handleChangeOrderSubmitted(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('change_order:submitted', {
      changeOrderId: payload.changeOrderId,
      projectId: payload.projectId,
      submittedBy: payload.submittedBy,
      estimatedCost: payload.estimatedCost,
      timestamp: payload.timestamp,
    });
  }

  /**
   * Handle change order approved
   */
  @OnEvent('change_order.approved')
  handleChangeOrderApproved(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('change_order:approved', {
      changeOrderId: payload.changeOrderId,
      projectId: payload.projectId,
      approvedBy: payload.approvedBy,
      finalCost: payload.finalCost,
      timestamp: payload.timestamp,
    });
  }

  /**
   * Handle change order rejected
   */
  @OnEvent('change_order.rejected')
  handleChangeOrderRejected(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('change_order:rejected', {
      changeOrderId: payload.changeOrderId,
      projectId: payload.projectId,
      rejectedBy: payload.rejectedBy,
      reason: payload.reason,
      timestamp: payload.timestamp,
    });
  }

  // Issue Events

  /**
   * Handle issue created
   */
  @OnEvent('issue.created')
  handleIssueCreated(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('issue:created', {
      issueId: payload.issueId,
      projectId: payload.projectId,
      severity: payload.severity,
      reportedBy: payload.reportedBy,
      timestamp: payload.timestamp,
    });
  }

  /**
   * Handle issue resolved
   */
  @OnEvent('issue.resolved')
  handleIssueResolved(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('issue:resolved', {
      issueId: payload.issueId,
      projectId: payload.projectId,
      resolvedBy: payload.resolvedBy,
      timestamp: payload.timestamp,
    });
  }

  /**
   * Handle issue status changed
   */
  @OnEvent('issue.status_changed')
  handleIssueStatusChanged(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('issue:status:changed', {
      issueId: payload.issueId,
      projectId: payload.projectId,
      oldStatus: payload.oldStatus,
      newStatus: payload.newStatus,
      timestamp: payload.timestamp,
    });
  }

  // Document Events

  /**
   * Handle document uploaded
   */
  @OnEvent('document.uploaded')
  handleDocumentUploaded(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('document:uploaded', {
      documentId: payload.documentId,
      projectId: payload.projectId,
      category: payload.category,
      version: payload.version,
      uploadedBy: payload.uploadedBy,
      timestamp: payload.timestamp,
    });
  }

  /**
   * Handle milestone completed
   */
  @OnEvent('milestone.completed')
  handleMilestoneCompleted(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('milestone:completed', {
      milestoneId: payload.milestoneId,
      projectId: payload.projectId,
      completedBy: payload.completedBy,
      timestamp: payload.timestamp,
    });
  }

  /**
   * Handle milestone status changed
   */
  @OnEvent('milestone.status_changed')
  handleMilestoneStatusChanged(payload: any) {
    this.server.to(`project:${payload.projectId}`).emit('milestone:status:changed', {
      milestoneId: payload.milestoneId,
      projectId: payload.projectId,
      oldStatus: payload.oldStatus,
      newStatus: payload.newStatus,
      timestamp: payload.timestamp,
    });
  }

  // Helper Methods

  /**
   * Extract user ID from JWT token with proper verification
   * Prevents token forgery by verifying JWT signature
   */
  private extractUserIdFromToken(token: string): string | null {
    try {
      // Verify token signature and extract payload
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
        issuer: process.env.JWT_ISSUER || 'patina',
        audience: process.env.JWT_AUDIENCE || 'patina-api',
      });

      // Extract user ID from standard JWT claims or custom fields
      const userId = payload.sub || payload.userId || null;

      if (!userId) {
        this.logger.warn('JWT token verified but no user ID found in payload');
      }

      return userId;
    } catch (error) {
      // Log specific JWT verification errors for debugging
      if (error.name === 'TokenExpiredError') {
        this.logger.warn('JWT token expired');
      } else if (error.name === 'JsonWebTokenError') {
        this.logger.warn(`Invalid JWT token: ${error.message}`);
      } else {
        this.logger.error('JWT verification failed:', error);
      }
      return null;
    }
  }

  /**
   * Extract user role from JWT token with proper verification
   */
  private extractUserRoleFromToken(token: string): string | null {
    try {
      // Verify token signature and extract payload
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET,
        issuer: process.env.JWT_ISSUER || 'patina',
        audience: process.env.JWT_AUDIENCE || 'patina-api',
      });

      // Extract role from token - supports both single role and roles array
      let role = payload.role || null;

      // If roles is an array, take the first one or check for specific roles
      if (!role && payload.roles && Array.isArray(payload.roles)) {
        // Prioritize admin > designer > client role hierarchy
        if (payload.roles.includes('admin')) {
          role = 'admin';
        } else if (payload.roles.includes('designer')) {
          role = 'designer';
        } else if (payload.roles.includes('client')) {
          role = 'client';
        } else {
          role = payload.roles[0];
        }
      }

      return role;
    } catch (error) {
      // Silent fail for role extraction as it's not critical
      // User ID verification is the critical security check
      return null;
    }
  }

  /**
   * Verify user has access to project
   * Checks role-based access control:
   * - Admin: Access to all projects
   * - Designer: Access to assigned projects
   * - Client: Access to their projects
   */
  private async verifyProjectAccess(
    userId: string,
    projectId: string,
    userRole?: string,
  ): Promise<boolean> {
    try {
      // Admins have access to all projects
      if (userRole === 'admin') {
        return true;
      }

      const project = await this.prisma.project.findUnique({
        where: { id: projectId },
        select: { clientId: true, designerId: true },
      });

      if (!project) return false;

      // User has access if they are the client or designer
      return project.clientId === userId || project.designerId === userId;
    } catch (error) {
      this.logger.error(`Error verifying project access: ${error}`);
      return false;
    }
  }

  /**
   * Broadcast message to all users in a project
   */
  broadcastToProject(projectId: string, event: string, data: any) {
    this.server.to(`project:${projectId}`).emit(event, data);
  }

  /**
   * Send message to specific user
   */
  async sendToUser(userId: string, event: string, data: any) {
    const connections = await this.prisma.activeConnection.findMany({
      where: { userId },
      select: { socketId: true },
    });

    connections.forEach(conn => {
      this.server.to(conn.socketId).emit(event, data);
    });
  }
}
