export declare enum TaskStatus {
    TODO = "todo",
    IN_PROGRESS = "in_progress",
    BLOCKED = "blocked",
    DONE = "done",
    CANCELLED = "cancelled"
}
export declare enum TaskPriority {
    LOW = "low",
    MEDIUM = "medium",
    HIGH = "high",
    URGENT = "urgent"
}
export declare class CreateTaskDto {
    title: string;
    description?: string;
    assigneeId?: string;
    dueDate?: string;
    priority?: TaskPriority;
    order?: number;
    metadata?: Record<string, any>;
}
//# sourceMappingURL=create-task.dto.d.ts.map