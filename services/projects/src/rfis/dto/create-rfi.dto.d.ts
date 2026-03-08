export declare enum RFIStatus {
    OPEN = "open",
    ANSWERED = "answered",
    CLOSED = "closed",
    CANCELLED = "cancelled"
}
export declare enum RFIPriority {
    NORMAL = "normal",
    URGENT = "urgent"
}
export declare class CreateRFIDto {
    title: string;
    question: string;
    assignedTo?: string;
    dueDate?: string;
    priority?: RFIPriority;
    metadata?: Record<string, any>;
}
//# sourceMappingURL=create-rfi.dto.d.ts.map