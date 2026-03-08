export declare enum NotificationType {
    APPROVAL_REQUESTED = "approval_requested",
    STATUS_UPDATE = "status_update",
    COMMENT = "comment",
    MILESTONE = "milestone",
    DEADLINE = "deadline",
    DOCUMENT_UPLOADED = "document_uploaded",
    CHANGE_ORDER = "change_order",
    RFI = "rfi",
    ISSUE = "issue",
    DAILY_LOG = "daily_log"
}
export declare enum NotificationPriority {
    LOW = "low",
    NORMAL = "normal",
    HIGH = "high",
    URGENT = "urgent"
}
export declare class NotificationChannels {
    email?: boolean;
    sms?: boolean;
    push?: boolean;
}
export declare class CreateNotificationDto {
    userId: string;
    projectId?: string;
    type: NotificationType;
    priority?: NotificationPriority;
    title: string;
    message: string;
    actionUrl?: string;
    channels?: NotificationChannels;
    metadata?: Record<string, any>;
}
//# sourceMappingURL=create-notification.dto.d.ts.map