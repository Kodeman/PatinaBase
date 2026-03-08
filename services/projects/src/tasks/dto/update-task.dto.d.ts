import { TaskStatus, TaskPriority } from './create-task.dto';
export declare class UpdateTaskDto {
    title?: string;
    description?: string;
    assigneeId?: string;
    dueDate?: string;
    status?: TaskStatus;
    priority?: TaskPriority;
    order?: number;
    metadata?: Record<string, any>;
}
//# sourceMappingURL=update-task.dto.d.ts.map