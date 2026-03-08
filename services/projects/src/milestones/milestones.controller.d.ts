import { MilestonesService } from './milestones.service';
import { CreateMilestoneDto } from './dto/create-milestone.dto';
import { UpdateMilestoneDto } from './dto/update-milestone.dto';
export declare class MilestonesController {
    private readonly milestonesService;
    constructor(milestonesService: MilestonesService);
    create(projectId: string, createDto: CreateMilestoneDto, userId: string): Promise<{
        order: number;
        status: string;
        title: string;
        id: string;
        metadata: import("../generated/prisma-client/runtime/library").JsonValue | null;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        projectId: string;
        targetDate: Date;
        completedAt: Date | null;
    }>;
    findAll(projectId: string): Promise<{
        order: number;
        status: string;
        title: string;
        id: string;
        metadata: import("../generated/prisma-client/runtime/library").JsonValue | null;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        projectId: string;
        targetDate: Date;
        completedAt: Date | null;
    }[]>;
    findOne(id: string): Promise<{
        project: {
            title: string;
            id: string;
        };
    } & {
        order: number;
        status: string;
        title: string;
        id: string;
        metadata: import("../generated/prisma-client/runtime/library").JsonValue | null;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        projectId: string;
        targetDate: Date;
        completedAt: Date | null;
    }>;
    update(id: string, updateDto: UpdateMilestoneDto, userId: string): Promise<{
        order: number;
        status: string;
        title: string;
        id: string;
        metadata: import("../generated/prisma-client/runtime/library").JsonValue | null;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        projectId: string;
        targetDate: Date;
        completedAt: Date | null;
    }>;
    remove(id: string, userId: string): Promise<{
        message: string;
    }>;
}
//# sourceMappingURL=milestones.controller.d.ts.map