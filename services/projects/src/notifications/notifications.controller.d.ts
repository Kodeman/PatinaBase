import { NotificationsService } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { UpdatePreferenceDto } from './dto/update-preference.dto';
export declare class NotificationsController {
    private readonly notificationsService;
    constructor(notificationsService: NotificationsService);
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
    findForUser(userId: string, status?: string, projectId?: string, limit?: string, offset?: string): Promise<{
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
    markAllAsRead(userId: string, projectId?: string): Promise<{
        updated: number;
    }>;
    getPreferences(userId: string): Promise<{
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
    registerPushToken(userId: string, body: {
        token: string;
    }): Promise<{
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
}
//# sourceMappingURL=notifications.controller.d.ts.map