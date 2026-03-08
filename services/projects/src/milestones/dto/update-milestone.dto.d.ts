export declare enum MilestoneStatus {
    PENDING = "pending",
    COMPLETED = "completed",
    DELAYED = "delayed",
    CANCELLED = "cancelled"
}
export declare class UpdateMilestoneDto {
    title?: string;
    description?: string;
    targetDate?: string;
    status?: MilestoneStatus;
    order?: number;
    metadata?: Record<string, any>;
}
//# sourceMappingURL=update-milestone.dto.d.ts.map