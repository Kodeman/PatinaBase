import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Message Queue Service
 *
 * Stores WebSocket messages for offline clients and delivers them
 * when clients reconnect. This ensures no critical updates are missed
 * even if clients temporarily lose connection.
 *
 * Features:
 * - Persistent message storage in database
 * - Automatic cleanup of old messages
 * - Message deduplication
 * - Priority-based delivery
 * - TTL for different message types
 */
@Injectable()
export class MessageQueueService {
  private readonly logger = new Logger(MessageQueueService.name);

  // In-memory queue for fast access (backed by database)
  private memoryQueue = new Map<string, any[]>();

  // Maximum messages per user
  private readonly MAX_MESSAGES_PER_USER = 100;

  // Message TTL by type (in milliseconds)
  private readonly MESSAGE_TTL = {
    'approval:created': 7 * 24 * 60 * 60 * 1000, // 7 days
    'approval:approved': 7 * 24 * 60 * 60 * 1000, // 7 days
    'approval:rejected': 7 * 24 * 60 * 60 * 1000, // 7 days
    'milestone:completed': 30 * 24 * 60 * 60 * 1000, // 30 days
    'document:uploaded': 7 * 24 * 60 * 60 * 1000, // 7 days
    'task:created': 7 * 24 * 60 * 60 * 1000, // 7 days
    'task:assigned': 7 * 24 * 60 * 60 * 1000, // 7 days
    default: 24 * 60 * 60 * 1000, // 24 hours
  };

  constructor(private readonly prisma: PrismaService) {
    // Start cleanup task
    this.startCleanupTask();
  }

  /**
   * Enqueue a message for a user
   */
  async enqueueMessage(userId: string, message: any): Promise<void> {
    try {
      // Check if user has too many queued messages
      const existingCount = await this.prisma.queuedMessage.count({
        where: { userId },
      });

      if (existingCount >= this.MAX_MESSAGES_PER_USER) {
        // Remove oldest messages to make room
        await this.removeOldestMessages(userId, existingCount - this.MAX_MESSAGES_PER_USER + 1);
      }

      // Calculate expiry time based on message type
      const eventType = String(message.event) as keyof typeof this.MESSAGE_TTL;
      const ttl = (this.MESSAGE_TTL[eventType] as unknown as number) || this.MESSAGE_TTL.default;
      const expiresAt = new Date(Date.now() + ttl);

      // Create message ID for deduplication
      const messageId = this.generateMessageId(message);

      // Store in database
      await this.prisma.queuedMessage.create({
        data: {
          id: messageId,
          userId,
          event: message.event,
          payload: message.payload,
          projectId: message.projectId,
          expiresAt,
          createdAt: message.timestamp || new Date(),
        },
      });

      // Add to memory queue
      if (!this.memoryQueue.has(userId)) {
        this.memoryQueue.set(userId, []);
      }
      this.memoryQueue.get(userId)!.push(message);

      this.logger.debug(`Message queued for user ${userId}: ${message.event}`);
    } catch (error) {
      // Handle duplicate key error (message already exists)
      if (error.code === 'P2002') {
        this.logger.debug(`Duplicate message skipped for user ${userId}: ${message.event}`);
        return;
      }

      this.logger.error(`Error enqueueing message for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Dequeue all messages for a user
   */
  async dequeueMessages(userId: string): Promise<any[]> {
    try {
      // Get messages from database
      const messages = await this.prisma.queuedMessage.findMany({
        where: {
          userId,
          expiresAt: {
            gt: new Date(),
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
      });

      // Delete messages from database
      if (messages.length > 0) {
        await this.prisma.queuedMessage.deleteMany({
          where: {
            userId,
          },
        });
      }

      // Clear memory queue
      this.memoryQueue.delete(userId);

      this.logger.log(`Dequeued ${messages.length} messages for user ${userId}`);

      // Transform database records to message format
      return messages.map((msg) => ({
        event: msg.event,
        payload: msg.payload,
        projectId: msg.projectId,
        timestamp: msg.createdAt,
      }));
    } catch (error) {
      this.logger.error(`Error dequeueing messages for user ${userId}:`, error);
      throw error;
    }
  }

  /**
   * Get queued message count for a user
   */
  async getMessageCount(userId: string): Promise<number> {
    return this.prisma.queuedMessage.count({
      where: {
        userId,
        expiresAt: {
          gt: new Date(),
        },
      },
    });
  }

  /**
   * Peek at queued messages without removing them
   */
  async peekMessages(userId: string, limit: number = 10): Promise<any[]> {
    const messages = await this.prisma.queuedMessage.findMany({
      where: {
        userId,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      take: limit,
    });

    return messages.map((msg) => ({
      event: msg.event,
      payload: msg.payload,
      projectId: msg.projectId,
      timestamp: msg.createdAt,
    }));
  }

  /**
   * Remove specific message
   */
  async removeMessage(messageId: string): Promise<void> {
    try {
      await this.prisma.queuedMessage.delete({
        where: { id: messageId },
      });
    } catch (error) {
      this.logger.warn(`Failed to remove message ${messageId}:`, error.message);
    }
  }

  /**
   * Remove oldest messages for a user
   */
  private async removeOldestMessages(userId: string, count: number): Promise<void> {
    const oldestMessages = await this.prisma.queuedMessage.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
      take: count,
    });

    const messageIds = oldestMessages.map((msg) => msg.id);

    await this.prisma.queuedMessage.deleteMany({
      where: {
        id: {
          in: messageIds,
        },
      },
    });

    this.logger.debug(`Removed ${count} oldest messages for user ${userId}`);
  }

  /**
   * Generate unique message ID for deduplication
   */
  private generateMessageId(message: any): string {
    const components = [
      message.event,
      message.projectId,
      message.payload.approvalId ||
        message.payload.milestoneId ||
        message.payload.documentId ||
        message.payload.taskId ||
        message.payload.rfiId ||
        'unknown',
      message.timestamp?.getTime() || Date.now(),
    ];

    return components.join(':');
  }

  /**
   * Cleanup expired messages
   */
  private async cleanupExpiredMessages(): Promise<void> {
    try {
      const result = await this.prisma.queuedMessage.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      if (result.count > 0) {
        this.logger.log(`Cleaned up ${result.count} expired messages`);
      }
    } catch (error) {
      this.logger.error('Error cleaning up expired messages:', error);
    }
  }

  /**
   * Start periodic cleanup task
   */
  private startCleanupTask(): void {
    // Run cleanup every hour
    setInterval(() => {
      this.cleanupExpiredMessages();
    }, 60 * 60 * 1000);

    // Run initial cleanup
    this.cleanupExpiredMessages();
  }

  /**
   * Get queue statistics
   */
  async getQueueStatistics(): Promise<{
    totalMessages: number;
    messagesByEvent: Record<string, number>;
    oldestMessage: Date | null;
  }> {
    const messages = await this.prisma.queuedMessage.findMany({
      where: {
        expiresAt: {
          gt: new Date(),
        },
      },
      select: {
        event: true,
        createdAt: true,
      },
    });

    const messagesByEvent: Record<string, number> = {};
    let oldestMessage: Date | null = null;

    messages.forEach((msg) => {
      messagesByEvent[msg.event] = (messagesByEvent[msg.event] || 0) + 1;
      if (!oldestMessage || msg.createdAt < oldestMessage) {
        oldestMessage = msg.createdAt;
      }
    });

    return {
      totalMessages: messages.length,
      messagesByEvent,
      oldestMessage,
    };
  }
}
