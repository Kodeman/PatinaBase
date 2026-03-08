export declare enum ApprovalType {
    DESIGN = "design",
    BUDGET = "budget",
    MATERIAL = "material",
    MILESTONE = "milestone",
    CHANGE_ORDER = "change_order",
    FINAL = "final"
}
export declare enum ApprovalPriority {
    LOW = "low",
    NORMAL = "normal",
    HIGH = "high",
    URGENT = "urgent"
}
export declare class CreateApprovalDto {
    segmentId?: string;
    title: string;
    description?: string;
    approvalType: ApprovalType;
    priority?: ApprovalPriority;
    assignedTo: string;
    dueDate?: string;
    documents?: string[];
    metadata?: Record<string, any>;
}
//# sourceMappingURL=create-approval.dto.d.ts.map