import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(private prisma: PrismaService) {}

  // Project events
  @OnEvent('project.created')
  async handleProjectCreated(payload: any) {
    await this.createOutboxEvent('project.created', payload);
  }

  @OnEvent('project.status_changed')
  async handleProjectStatusChanged(payload: any) {
    await this.createOutboxEvent('project.status_changed', payload);
  }

  // Task events
  @OnEvent('task.created')
  async handleTaskCreated(payload: any) {
    await this.createOutboxEvent('task.created', payload);
  }

  @OnEvent('task.status_changed')
  async handleTaskStatusChanged(payload: any) {
    await this.createOutboxEvent('task.status_changed', payload);
  }

  @OnEvent('task.completed')
  async handleTaskCompleted(payload: any) {
    await this.createOutboxEvent('task.completed', payload);
  }

  @OnEvent('task.deleted')
  async handleTaskDeleted(payload: any) {
    await this.createOutboxEvent('task.deleted', payload);
  }

  @OnEvent('task.bulk_updated')
  async handleTaskBulkUpdated(payload: any) {
    await this.createOutboxEvent('task.bulk_updated', payload);
  }

  // RFI events
  @OnEvent('rfi.created')
  async handleRFICreated(payload: any) {
    await this.createOutboxEvent('rfi.created', payload);
  }

  @OnEvent('rfi.status_changed')
  async handleRFIStatusChanged(payload: any) {
    await this.createOutboxEvent('rfi.status_changed', payload);
  }

  @OnEvent('rfi.answered')
  async handleRFIAnswered(payload: any) {
    await this.createOutboxEvent('rfi.answered', payload);
  }

  // Change Order events
  @OnEvent('change_order.created')
  async handleChangeOrderCreated(payload: any) {
    await this.createOutboxEvent('change_order.created', payload);
  }

  @OnEvent('change_order.submitted')
  async handleChangeOrderSubmitted(payload: any) {
    await this.createOutboxEvent('change_order.submitted', payload);
  }

  @OnEvent('change_order.approved')
  async handleChangeOrderApproved(payload: any) {
    await this.createOutboxEvent('change_order.approved', payload);
  }

  @OnEvent('change_order.rejected')
  async handleChangeOrderRejected(payload: any) {
    await this.createOutboxEvent('change_order.rejected', payload);
  }

  @OnEvent('change_order.implemented')
  async handleChangeOrderImplemented(payload: any) {
    await this.createOutboxEvent('change_order.implemented', payload);
  }

  // Issue events
  @OnEvent('issue.created')
  async handleIssueCreated(payload: any) {
    await this.createOutboxEvent('issue.created', payload);
  }

  @OnEvent('issue.status_changed')
  async handleIssueStatusChanged(payload: any) {
    await this.createOutboxEvent('issue.status_changed', payload);
  }

  @OnEvent('issue.resolved')
  async handleIssueResolved(payload: any) {
    await this.createOutboxEvent('issue.resolved', payload);
  }

  // Daily Log events
  @OnEvent('log.created')
  async handleLogCreated(payload: any) {
    await this.createOutboxEvent('log.created', payload);
  }

  // Document events
  @OnEvent('document.uploaded')
  async handleDocumentUploaded(payload: any) {
    await this.createOutboxEvent('document.uploaded', payload);
  }

  // Milestone events
  @OnEvent('milestone.created')
  async handleMilestoneCreated(payload: any) {
    await this.createOutboxEvent('milestone.created', payload);
  }

  @OnEvent('milestone.status_changed')
  async handleMilestoneStatusChanged(payload: any) {
    await this.createOutboxEvent('milestone.status_changed', payload);
  }

  @OnEvent('milestone.completed')
  async handleMilestoneCompleted(payload: any) {
    await this.createOutboxEvent('milestone.completed', payload);
  }

  /**
   * Create an outbox event for transactional publishing
   */
  private async createOutboxEvent(type: string, payload: any) {
    try {
      await this.prisma.outboxEvent.create({
        data: {
          type,
          payload,
          headers: {
            traceId: payload.traceId || 'none',
            source: 'project-tracking-service',
          },
        },
      });
      this.logger.debug(`Outbox event created: ${type}`);
    } catch (error) {
      this.logger.error(`Failed to create outbox event: ${type}`, error);
    }
  }

  /**
   * Process outbox events - runs every 10 seconds
   */
  @Cron(CronExpression.EVERY_10_SECONDS)
  async processOutboxEvents() {
    const events = await this.prisma.outboxEvent.findMany({
      where: {
        published: false,
        retryCount: { lt: 5 }, // Max 5 retries
      },
      take: 100,
      orderBy: { createdAt: 'asc' },
    });

    if (events.length === 0) {
      return;
    }

    this.logger.log(`Processing ${events.length} outbox events`);

    for (const event of events) {
      try {
        // In production, publish to OCI Streaming
        await this.publishToStream(event);

        // Mark as published
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            published: true,
            publishedAt: new Date(),
          },
        });

        this.logger.debug(`Event published: ${event.type} (${event.id})`);
      } catch (error) {
        this.logger.error(`Failed to publish event ${event.id}:`, error);

        // Increment retry count
        await this.prisma.outboxEvent.update({
          where: { id: event.id },
          data: {
            retryCount: event.retryCount + 1,
            lastError: error instanceof Error ? error.message : 'Unknown error',
          },
        });
      }
    }
  }

  /**
   * Publish event to OCI Streaming
   */
  private async publishToStream(event: any) {
    // In production, use OCI SDK to publish to streaming
    // For MVP, we'll just log
    this.logger.debug(`Publishing to stream: ${event.type}`, {
      eventId: event.id,
      payload: event.payload,
    });

    // Simulate async operation
    await new Promise((resolve) => setTimeout(resolve, 10));

    // Example OCI Streaming publish:
    // const client = new StreamClient({ authProvider });
    // await client.putMessages({
    //   streamId: process.env.OCI_STREAM_OCID,
    //   putMessagesDetails: {
    //     messages: [{
    //       key: event.id,
    //       value: Buffer.from(JSON.stringify(event.payload)).toString('base64'),
    //     }],
    //   },
    // });
  }

  /**
   * Clean up old published events - runs daily
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async cleanupPublishedEvents() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7); // Keep 7 days

    const result = await this.prisma.outboxEvent.deleteMany({
      where: {
        published: true,
        publishedAt: { lt: cutoffDate },
      },
    });

    this.logger.log(`Cleaned up ${result.count} old outbox events`);
  }
}
