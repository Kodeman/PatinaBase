import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdatePreferenceDto } from './dto/update-preference.dto';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
    @InjectQueue('notifications') private notificationQueue: Queue,
  ) {}

  /**
   * Create and send a notification
   */
  async create(createDto: CreateNotificationDto) {
    // Get user preferences
    const preferences = await this.getOrCreatePreferences(createDto.userId);

    // Determine which channels to use
    const channels = this.resolveChannels(createDto, preferences);

    // Create notification record
    const notification = await this.prisma.notification.create({
      data: {
        userId: createDto.userId,
        projectId: createDto.projectId,
        type: createDto.type,
        priority: createDto.priority || 'normal',
        title: createDto.title,
        message: createDto.message,
        actionUrl: createDto.actionUrl,
        channels,
        metadata: createDto.metadata,
      },
    });

    // Queue for delivery based on user preferences
    if (preferences.frequency === 'immediate') {
      await this.queueForDelivery(notification, channels, preferences);
    } else {
      // Will be picked up by batch digest job
      this.logger.log(`Notification ${notification.id} queued for ${preferences.frequency}`);
    }

    return notification;
  }

  /**
   * Batch create notifications
   */
  async createBatch(notifications: CreateNotificationDto[]) {
    const created = await Promise.all(
      notifications.map(dto => this.create(dto)),
    );

    this.logger.log(`Created ${created.length} notifications in batch`);
    return created;
  }

  /**
   * Get notifications for a user
   */
  async findForUser(
    userId: string,
    options: {
      status?: string;
      projectId?: string;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const { status, projectId, limit = 50, offset = 0 } = options;

    const where: any = { userId };
    if (status) where.status = status;
    if (projectId) where.projectId = projectId;

    const [notifications, total] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.notification.count({ where }),
    ]);

    return {
      data: notifications,
      total,
      unread: await this.prisma.notification.count({
        where: { userId, readAt: null },
      }),
    };
  }

  /**
   * Mark notification as read
   */
  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    return this.prisma.notification.update({
      where: { id },
      data: { readAt: new Date(), status: 'read' },
    });
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string, projectId?: string) {
    const where: any = { userId, readAt: null };
    if (projectId) where.projectId = projectId;

    const result = await this.prisma.notification.updateMany({
      where,
      data: { readAt: new Date(), status: 'read' },
    });

    return { updated: result.count };
  }

  /**
   * Get or create user notification preferences
   */
  async getOrCreatePreferences(userId: string) {
    let preferences = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });

    if (!preferences) {
      preferences = await this.prisma.notificationPreference.create({
        data: { userId },
      });
    }

    return preferences;
  }

  /**
   * Update user notification preferences
   */
  async updatePreferences(userId: string, updateDto: UpdatePreferenceDto) {
    const existing = await this.getOrCreatePreferences(userId);

    return this.prisma.notificationPreference.update({
      where: { userId },
      data: {
        email: updateDto.email ?? existing.email,
        emailAddress: updateDto.emailAddress ?? existing.emailAddress,
        sms: updateDto.sms ?? existing.sms,
        phoneNumber: updateDto.phoneNumber ?? existing.phoneNumber,
        push: updateDto.push ?? existing.push,
        pushTokens: (updateDto.pushTokens ?? existing.pushTokens) as any,
        channels: (updateDto.channels ?? existing.channels) as any,
        frequency: updateDto.frequency ?? existing.frequency,
        quietHours: (updateDto.quietHours ?? existing.quietHours) as any,
      },
    });
  }

  /**
   * Register a push notification token for a user
   */
  async registerPushToken(userId: string, token: string) {
    const preferences = await this.getOrCreatePreferences(userId);

    const currentTokens = (preferences.pushTokens as string[]) || [];
    if (!currentTokens.includes(token)) {
      currentTokens.push(token);

      return this.prisma.notificationPreference.update({
        where: { userId },
        data: { pushTokens: currentTokens },
      });
    }

    return preferences;
  }

  /**
   * Send digest notifications (called by scheduled job)
   */
  async sendDigests(frequency: 'daily_digest' | 'weekly_digest') {
    this.logger.log(`Processing ${frequency} notifications`);

    // Get users with this frequency preference
    const users = await this.prisma.notificationPreference.findMany({
      where: { frequency },
    });

    for (const user of users) {
      await this.sendDigestForUser(user.userId, frequency);
    }

    this.logger.log(`Completed ${frequency} for ${users.length} users`);
  }

  /**
   * Private: Resolve which channels to use for a notification
   */
  private resolveChannels(
    createDto: CreateNotificationDto,
    preferences: any,
  ): Record<string, boolean> {
    // Start with user's global preferences
    const channels = {
      email: preferences.email,
      sms: preferences.sms,
      push: preferences.push,
    };

    // Override with notification-specific preferences if available
    if (preferences.channels && preferences.channels[createDto.type]) {
      const typePrefs = preferences.channels[createDto.type];
      if (typePrefs.email !== undefined) channels.email = typePrefs.email;
      if (typePrefs.sms !== undefined) channels.sms = typePrefs.sms;
      if (typePrefs.push !== undefined) channels.push = typePrefs.push;
    }

    // Override with explicit channels from request if provided
    if (createDto.channels) {
      if (createDto.channels.email !== undefined) channels.email = createDto.channels.email;
      if (createDto.channels.sms !== undefined) channels.sms = createDto.channels.sms;
      if (createDto.channels.push !== undefined) channels.push = createDto.channels.push;
    }

    // Check quiet hours
    if (this.isInQuietHours(preferences.quietHours)) {
      // Only urgent notifications during quiet hours
      if (createDto.priority !== 'urgent') {
        channels.sms = false;
        channels.push = false;
      }
    }

    return channels;
  }

  /**
   * Private: Queue notification for delivery
   */
  private async queueForDelivery(
    notification: any,
    channels: Record<string, boolean>,
    preferences: any,
  ) {
    const jobs = [];

    if (channels.email && preferences.emailAddress) {
      jobs.push(
        this.notificationQueue.add('send-email', {
          notificationId: notification.id,
          to: preferences.emailAddress,
          subject: notification.title,
          message: notification.message,
          actionUrl: notification.actionUrl,
        }),
      );
    }

    if (channels.sms && preferences.phoneNumber) {
      jobs.push(
        this.notificationQueue.add('send-sms', {
          notificationId: notification.id,
          to: preferences.phoneNumber,
          message: `${notification.title}: ${notification.message}`,
        }),
      );
    }

    if (channels.push && preferences.pushTokens && Array.isArray(preferences.pushTokens)) {
      jobs.push(
        this.notificationQueue.add('send-push', {
          notificationId: notification.id,
          tokens: preferences.pushTokens,
          title: notification.title,
          body: notification.message,
          data: {
            actionUrl: notification.actionUrl,
            type: notification.type,
          },
        }),
      );
    }

    await Promise.all(jobs);

    // Update notification status
    await this.prisma.notification.update({
      where: { id: notification.id },
      data: { status: 'sent', sentAt: new Date() },
    });

    this.logger.log(`Queued ${jobs.length} delivery jobs for notification ${notification.id}`);
  }

  /**
   * Private: Check if current time is in quiet hours
   */
  private isInQuietHours(quietHours: any): boolean {
    if (!quietHours || !quietHours.start || !quietHours.end) {
      return false;
    }

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    return currentTime >= quietHours.start && currentTime <= quietHours.end;
  }

  /**
   * Private: Send digest for a single user
   */
  private async sendDigestForUser(userId: string, frequency: string) {
    const cutoffDate = new Date();
    if (frequency === 'daily_digest') {
      cutoffDate.setDate(cutoffDate.getDate() - 1);
    } else {
      cutoffDate.setDate(cutoffDate.getDate() - 7);
    }

    // Get pending notifications since cutoff
    const notifications = await this.prisma.notification.findMany({
      where: {
        userId,
        status: 'pending',
        createdAt: { gte: cutoffDate },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (notifications.length === 0) {
      return;
    }

    // Group by project
    const byProject = notifications.reduce((acc, notif) => {
      const key = notif.projectId || 'general';
      if (!acc[key]) acc[key] = [];
      acc[key].push(notif);
      return acc;
    }, {} as Record<string, any[]>);

    // Send digest email
    const preferences = await this.getOrCreatePreferences(userId);
    if (preferences.email && preferences.emailAddress) {
      await this.notificationQueue.add('send-digest', {
        to: preferences.emailAddress,
        frequency,
        notifications: byProject,
        totalCount: notifications.length,
      });
    }

    // Mark as sent
    await this.prisma.notification.updateMany({
      where: {
        id: { in: notifications.map(n => n.id) },
      },
      data: { status: 'sent', sentAt: new Date() },
    });
  }
}
