import { EventEmitter2 } from '@nestjs/event-emitter';
import { Queue } from 'bull';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdatePreferenceDto } from './dto/update-preference.dto';
export declare class NotificationsService {
    private prisma;
    private eventEmitter;
    private notificationQueue;
    private readonly logger;
    constructor(prisma: PrismaService, eventEmitter: EventEmitter2, notificationQueue: Queue);
    /**
     * Create and send a notification
     */
    create(createDto: CreateNotificationDto): Promise<{
        type: string;
        status: string;
        error: string | null;
        title: string | null;
        id: string;
        createdAt: Date;
        userId: string;
        category: string;
        payload: import("@prisma/client/runtime/library").JsonValue;
        readAt: Date | null;
        sentAt: Date | null;
    }>;
    /**
     * Batch create notifications
     */
    createBatch(notifications: CreateNotificationDto[]): Promise<{
        type: string;
        status: string;
        error: string | null;
        title: string | null;
        id: string;
        createdAt: Date;
        userId: string;
        category: string;
        payload: import("@prisma/client/runtime/library").JsonValue;
        readAt: Date | null;
        sentAt: Date | null;
    }[]>;
    /**
     * Get notifications for a user
     */
    findForUser(userId: string, options?: {
        status?: string;
        projectId?: string;
        limit?: number;
        offset?: number;
    }): Promise<{
        data: {
            type: string;
            status: string;
            error: string | null;
            title: string | null;
            id: string;
            createdAt: Date;
            userId: string;
            category: string;
            payload: import("@prisma/client/runtime/library").JsonValue;
            readAt: Date | null;
            sentAt: Date | null;
        }[];
        total: number;
        unread: number;
    }>;
    /**
     * Mark notification as read
     */
    markAsRead(id: string, userId: string): Promise<{
        type: string;
        status: string;
        error: string | null;
        title: string | null;
        id: string;
        createdAt: Date;
        userId: string;
        category: string;
        payload: import("@prisma/client/runtime/library").JsonValue;
        readAt: Date | null;
        sentAt: Date | null;
    }>;
    /**
     * Mark all notifications as read for a user
     */
    markAllAsRead(userId: string, projectId?: string): Promise<{
        updated: number;
    }>;
    /**
     * Get or create user notification preferences
     */
    getOrCreatePreferences(userId: string): Promise<{
        push: boolean;
        id: string;
        metadata: import("../generated/prisma-client/runtime/library").JsonValue | null;
        email: boolean;
        createdAt: Date;
        userId: string;
        updatedAt: Date;
        channels: import("../generated/prisma-client/runtime/library").JsonValue | null;
        sms: boolean;
        quietHours: import("../generated/prisma-client/runtime/library").JsonValue | null;
        emailAddress: string | null;
        phoneNumber: string | null;
        pushTokens: import("../generated/prisma-client/runtime/library").JsonValue | null;
        frequency: string;
    }>;
    /**
     * Update user notification preferences
     */
    updatePreferences(userId: string, updateDto: UpdatePreferenceDto): Promise<{
        push: boolean;
        id: string;
        metadata: import("../generated/prisma-client/runtime/library").JsonValue | null;
        email: boolean;
        createdAt: Date;
        userId: string;
        updatedAt: Date;
        channels: import("../generated/prisma-client/runtime/library").JsonValue | null;
        sms: boolean;
        quietHours: import("../generated/prisma-client/runtime/library").JsonValue | null;
        emailAddress: string | null;
        phoneNumber: string | null;
        pushTokens: import("../generated/prisma-client/runtime/library").JsonValue | null;
        frequency: string;
    }>;
    /**
     * Register a push notification token for a user
     */
    registerPushToken(userId: string, token: string): Promise<{
        push: boolean;
        id: string;
        metadata: import("../generated/prisma-client/runtime/library").JsonValue | null;
        email: boolean;
        createdAt: Date;
        userId: string;
        updatedAt: Date;
        channels: import("../generated/prisma-client/runtime/library").JsonValue | null;
        sms: boolean;
        quietHours: import("../generated/prisma-client/runtime/library").JsonValue | null;
        emailAddress: string | null;
        phoneNumber: string | null;
        pushTokens: import("../generated/prisma-client/runtime/library").JsonValue | null;
        frequency: string;
    }>;
    /**
     * Send digest notifications (called by scheduled job)
     */
    sendDigests(frequency: 'daily_digest' | 'weekly_digest'): Promise<void>;
    /**
     * Private: Resolve which channels to use for a notification
     */
    private resolveChannels;
    /**
     * Private: Queue notification for delivery
     */
    private queueForDelivery;
    /**
     * Private: Check if current time is in quiet hours
     */
    private isInQuietHours;
    /**
     * Private: Send digest for a single user
     */
    private sendDigestForUser;
}
//# sourceMappingURL=notifications.service.d.ts.map