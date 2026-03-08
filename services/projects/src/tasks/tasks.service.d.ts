import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTaskDto, TaskStatus } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
export declare class TasksService {
    private prisma;
    private eventEmitter;
    private readonly logger;
    constructor(prisma: PrismaService, eventEmitter: EventEmitter2);
    create(projectId: string, createDto: CreateTaskDto, userId: string): Promise<{
        status: string;
        title: string;
        id: string;
        priority: string | null;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        projectId: string;
        dueDate: Date | null;
        assigneeId: string | null;
    }>;
    findAll(projectId: string, status?: TaskStatus): Promise<{
        status: string;
        title: string;
        id: string;
        priority: string | null;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        projectId: string;
        dueDate: Date | null;
        assigneeId: string | null;
    }[]>;
    findOne(id: string): Promise<{
        project: {
            status: string;
            title: string;
            id: string;
        };
    } & {
        status: string;
        title: string;
        id: string;
        priority: string | null;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        projectId: string;
        dueDate: Date | null;
        assigneeId: string | null;
    }>;
    update(id: string, updateDto: UpdateTaskDto, userId: string): Promise<{
        status: string;
        title: string;
        id: string;
        priority: string | null;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        projectId: string;
        dueDate: Date | null;
        assigneeId: string | null;
    }>;
    remove(id: string, userId: string): Promise<{
        message: string;
    }>;
    bulkUpdateStatus(projectId: string, taskIds: string[], status: TaskStatus, userId: string): Promise<{
        updated: number;
        taskIds: string[];
    }>;
    private validateStatusTransition;
}
//# sourceMappingURL=tasks.service.d.ts.map