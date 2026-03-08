export declare enum ChangeOrderStatus {
    DRAFT = "draft",
    SUBMITTED = "submitted",
    APPROVED = "approved",
    REJECTED = "rejected",
    IMPLEMENTED = "implemented"
}
export declare class CreateChangeOrderDto {
    title: string;
    description: string;
    costImpact?: number;
    scheduleImpact?: number;
    metadata?: Record<string, any>;
}
//# sourceMappingURL=create-change-order.dto.d.ts.map