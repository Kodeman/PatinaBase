import { TasksService } from './tasks.service';
import { CreateTaskDto, TaskStatus } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskResponseDto } from './dto/task-response.dto';
export declare class TasksController {
    private readonly tasksService;
    constructor(tasksService: TasksService);
    create(projectId: string, createDto: CreateTaskDto, userId: string): Promise<TaskResponseDto>;
    findAll(projectId: string, status?: TaskStatus): Promise<TaskResponseDto[]>;
    findOne(id: string): Promise<TaskResponseDto>;
    update(id: string, updateDto: UpdateTaskDto, userId: string): Promise<TaskResponseDto>;
    remove(id: string, userId: string): Promise<{
        message: string;
    }>;
    bulkUpdate(projectId: string, body: {
        taskIds: string[];
        status: TaskStatus;
    }, userId: string): Promise<{
        updated: number;
        taskIds: string[];
    }>;
}
//# sourceMappingURL=tasks.controller.d.ts.map