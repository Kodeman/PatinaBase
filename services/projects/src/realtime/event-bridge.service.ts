import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { RealtimeBroadcasterService } from './realtime-broadcaster.service';

/**
 * Bridges in-process domain events (NestJS EventEmitter2) to Supabase Realtime
 * broadcasts. This is the single sink for all realtime traffic — it replaces
 * both the former Socket.io gateway's `@OnEvent` broadcasters and the old
 * EventBridge, so each client event fires exactly once with the richest payload.
 *
 * Project-scoped events go to the `project:<id>` channel (every viewer);
 * direct notifications go to the recipient's `user:<id>` channel.
 *
 * Offline replay (the former Postgres `queued_messages` table) is intentionally
 * dropped: portals load current state over REST on page open, so only live
 * delivery remains.
 */
@Injectable()
export class EventBridgeService {
  private readonly logger = new Logger(EventBridgeService.name);

  constructor(private readonly realtime: RealtimeBroadcasterService) {}

  private ts(payload: any): string {
    return payload?.timestamp ?? new Date().toISOString();
  }

  // ---------------------------------------------------------------------------
  // Approvals
  // ---------------------------------------------------------------------------

  @OnEvent('approval.requested')
  onApprovalRequested(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'approval:requested', {
      approvalId: e.approvalId,
      projectId: e.projectId,
      assignedTo: e.assignedTo,
      approvalType: e.approvalType,
      priority: e.priority,
      timestamp: this.ts(e),
    });
  }

  @OnEvent('approval.created')
  onApprovalCreated(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'approval:created', {
      approvalId: e.approvalId,
      projectId: e.projectId,
      title: e.title,
      assignedTo: e.assignedTo,
      approvalType: e.approvalType,
      priority: e.priority,
      dueDate: e.dueDate,
      timestamp: this.ts(e),
    });
  }

  @OnEvent('approval.approved')
  onApprovalApproved(e: any) {
    const payload = {
      approvalId: e.approvalId,
      projectId: e.projectId,
      approvedBy: e.approvedBy,
      comments: e.comments,
      timestamp: this.ts(e),
    };
    this.realtime.broadcastToProject(e.projectId, 'approval:approved', payload);
    if (e.ownerId && e.ownerId !== e.approvedBy) {
      this.realtime.broadcastToUser(e.ownerId, 'approval:approved:notification', payload);
    }
  }

  @OnEvent('approval.rejected')
  onApprovalRejected(e: any) {
    const payload = {
      approvalId: e.approvalId,
      projectId: e.projectId,
      rejectedBy: e.rejectedBy,
      reason: e.reason,
      requestedChanges: e.requestedChanges,
      timestamp: this.ts(e),
    };
    this.realtime.broadcastToProject(e.projectId, 'approval:rejected', payload);
    if (e.ownerId && e.ownerId !== e.rejectedBy) {
      this.realtime.broadcastToUser(e.ownerId, 'approval:rejected:notification', payload);
    }
  }

  @OnEvent('approval.discussed')
  onApprovalDiscussed(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'approval:discussed', {
      approvalId: e.approvalId,
      projectId: e.projectId,
      userId: e.userId,
      userName: e.userName,
      timestamp: this.ts(e),
    });
  }

  // ---------------------------------------------------------------------------
  // Projects
  // ---------------------------------------------------------------------------

  @OnEvent('project.status_changed')
  onProjectStatusChanged(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'project:status:changed', {
      projectId: e.projectId,
      oldStatus: e.oldStatus,
      newStatus: e.newStatus,
      timestamp: this.ts(e),
    });
  }

  @OnEvent('project.member_added')
  onProjectMemberAdded(e: any) {
    const payload = {
      projectId: e.projectId,
      userId: e.userId,
      role: e.role,
      addedBy: e.addedBy,
      timestamp: this.ts(e),
    };
    this.realtime.broadcastToProject(e.projectId, 'project:member:added', payload);
    if (e.userId) {
      this.realtime.broadcastToUser(e.userId, 'project:invitation', payload);
    }
  }

  @OnEvent('activity.logged')
  onActivityLogged(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'activity:logged', {
      projectId: e.projectId,
      userId: e.userId,
      activityType: e.activityType,
      timestamp: this.ts(e),
    });
  }

  @OnEvent('timeline.segment.updated')
  onTimelineSegmentUpdated(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'timeline:segment:updated', {
      segmentId: e.segmentId,
      projectId: e.projectId,
      oldStatus: e.oldStatus,
      newStatus: e.newStatus,
      oldProgress: e.oldProgress,
      newProgress: e.newProgress,
      timestamp: this.ts(e),
    });
  }

  // ---------------------------------------------------------------------------
  // Tasks
  // ---------------------------------------------------------------------------

  @OnEvent('task.created')
  onTaskCreated(e: any) {
    const payload = {
      taskId: e.taskId,
      projectId: e.projectId,
      title: e.title,
      assigneeId: e.assigneeId,
      priority: e.priority,
      dueDate: e.dueDate,
      timestamp: this.ts(e),
    };
    this.realtime.broadcastToProject(e.projectId, 'task:created', payload);
    if (e.assigneeId) {
      this.realtime.broadcastToUser(e.assigneeId, 'task:assigned', payload);
    }
  }

  @OnEvent('task.status_changed')
  onTaskStatusChanged(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'task:status:changed', {
      taskId: e.taskId,
      projectId: e.projectId,
      oldStatus: e.oldStatus,
      newStatus: e.newStatus,
      timestamp: this.ts(e),
    });
  }

  @OnEvent('task.completed')
  onTaskCompleted(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'task:completed', {
      taskId: e.taskId,
      projectId: e.projectId,
      timestamp: this.ts(e),
    });
  }

  @OnEvent('task.comment_added')
  onTaskCommentAdded(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'task:comment:added', {
      taskId: e.taskId,
      projectId: e.projectId,
      commentId: e.commentId,
      userId: e.userId,
      mentions: e.mentions,
      timestamp: this.ts(e),
    });
    if (Array.isArray(e.mentions)) {
      for (const userId of e.mentions) {
        this.realtime.broadcastToUser(userId, 'task:mention', {
          taskId: e.taskId,
          projectId: e.projectId,
          commentId: e.commentId,
          mentionedBy: e.userId,
          timestamp: this.ts(e),
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // RFIs
  // ---------------------------------------------------------------------------

  @OnEvent('rfi.created')
  onRfiCreated(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'rfi:created', {
      rfiId: e.rfiId,
      projectId: e.projectId,
      submittedBy: e.submittedBy,
      priority: e.priority,
      timestamp: this.ts(e),
    });
  }

  @OnEvent('rfi.answered')
  onRfiAnswered(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'rfi:answered', {
      rfiId: e.rfiId,
      projectId: e.projectId,
      answeredBy: e.answeredBy,
      timestamp: this.ts(e),
    });
    if (e.submittedBy) {
      this.realtime.broadcastToUser(e.submittedBy, 'rfi:answered:notification', {
        rfiId: e.rfiId,
        projectId: e.projectId,
        timestamp: this.ts(e),
      });
    }
  }

  @OnEvent('rfi.status_changed')
  onRfiStatusChanged(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'rfi:status:changed', {
      rfiId: e.rfiId,
      projectId: e.projectId,
      oldStatus: e.oldStatus,
      newStatus: e.newStatus,
      timestamp: this.ts(e),
    });
  }

  // ---------------------------------------------------------------------------
  // Change orders
  // ---------------------------------------------------------------------------

  @OnEvent('change_order.submitted')
  onChangeOrderSubmitted(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'change_order:submitted', {
      changeOrderId: e.changeOrderId,
      projectId: e.projectId,
      submittedBy: e.submittedBy,
      estimatedCost: e.estimatedCost,
      timestamp: this.ts(e),
    });
  }

  @OnEvent('change_order.approved')
  onChangeOrderApproved(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'change_order:approved', {
      changeOrderId: e.changeOrderId,
      projectId: e.projectId,
      approvedBy: e.approvedBy,
      finalCost: e.finalCost,
      timestamp: this.ts(e),
    });
  }

  @OnEvent('change_order.rejected')
  onChangeOrderRejected(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'change_order:rejected', {
      changeOrderId: e.changeOrderId,
      projectId: e.projectId,
      rejectedBy: e.rejectedBy,
      reason: e.reason,
      timestamp: this.ts(e),
    });
  }

  // ---------------------------------------------------------------------------
  // Issues
  // ---------------------------------------------------------------------------

  @OnEvent('issue.created')
  onIssueCreated(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'issue:created', {
      issueId: e.issueId,
      projectId: e.projectId,
      severity: e.severity,
      reportedBy: e.reportedBy,
      timestamp: this.ts(e),
    });
  }

  @OnEvent('issue.resolved')
  onIssueResolved(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'issue:resolved', {
      issueId: e.issueId,
      projectId: e.projectId,
      resolvedBy: e.resolvedBy,
      timestamp: this.ts(e),
    });
  }

  @OnEvent('issue.status_changed')
  onIssueStatusChanged(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'issue:status:changed', {
      issueId: e.issueId,
      projectId: e.projectId,
      oldStatus: e.oldStatus,
      newStatus: e.newStatus,
      timestamp: this.ts(e),
    });
  }

  // ---------------------------------------------------------------------------
  // Documents
  // ---------------------------------------------------------------------------

  @OnEvent('document.uploaded')
  onDocumentUploaded(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'document:uploaded', {
      documentId: e.documentId,
      projectId: e.projectId,
      name: e.name,
      category: e.category,
      version: e.version,
      fileSize: e.fileSize,
      uploadedBy: e.uploadedBy,
      uploaderName: e.uploaderName,
      timestamp: this.ts(e),
    });
  }

  @OnEvent('document.version_created')
  onDocumentVersionCreated(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'document:version:created', {
      documentId: e.documentId,
      projectId: e.projectId,
      version: e.version,
      createdBy: e.createdBy,
      changeDescription: e.changeDescription,
      timestamp: this.ts(e),
    });
  }

  @OnEvent('document.upload_progress')
  onDocumentUploadProgress(e: any) {
    // Progress ticks are sent only to the uploader.
    if (!e.uploaderId) return;
    this.realtime.broadcastToUser(e.uploaderId, 'document:upload:progress', {
      documentId: e.documentId,
      projectId: e.projectId,
      percent: e.percent,
      bytesUploaded: e.bytesUploaded,
      totalBytes: e.totalBytes,
      timestamp: this.ts(e),
    });
  }

  // ---------------------------------------------------------------------------
  // Milestones
  // ---------------------------------------------------------------------------

  @OnEvent('milestone.completed')
  onMilestoneCompleted(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'milestone:completed', {
      milestoneId: e.milestoneId,
      projectId: e.projectId,
      title: e.title,
      completedBy: e.completedBy,
      completionPercentage: e.completionPercentage,
      timestamp: this.ts(e),
    });
  }

  @OnEvent('milestone.status_changed')
  onMilestoneStatusChanged(e: any) {
    this.realtime.broadcastToProject(e.projectId, 'milestone:status:changed', {
      milestoneId: e.milestoneId,
      projectId: e.projectId,
      oldStatus: e.oldStatus,
      newStatus: e.newStatus,
      timestamp: this.ts(e),
    });
  }
}
