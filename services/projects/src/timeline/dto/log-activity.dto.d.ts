export declare enum ActivityType {
    VIEW = "view",
    COMMENT = "comment",
    APPROVE = "approve",
    REJECT = "reject",
    UPLOAD = "upload",
    DOWNLOAD = "download",
    DISCUSS = "discuss"
}
export declare enum EntityType {
    SEGMENT = "segment",
    APPROVAL = "approval",
    DOCUMENT = "document",
    TASK = "task",
    MILESTONE = "milestone"
}
export declare class LogActivityDto {
    segmentId?: string;
    activityType: ActivityType;
    entityType?: EntityType;
    entityId?: string;
    duration?: number;
    metadata?: Record<string, any>;
}
//# sourceMappingURL=log-activity.dto.d.ts.map