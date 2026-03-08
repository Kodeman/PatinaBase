import { ChangeOrdersService } from './change-orders.service';
import { CreateChangeOrderDto, ChangeOrderStatus } from './dto/create-change-order.dto';
import { ApproveChangeOrderDto } from './dto/approve-change-order.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
export declare class ChangeOrdersController {
    private readonly changeOrdersService;
    constructor(changeOrdersService: ChangeOrdersService);
    create(projectId: string, createDto: CreateChangeOrderDto, userId: string): Promise<{
        status: string;
        title: string;
        id: string;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        projectId: string;
        costImpact: import("@prisma/client/runtime/library").Decimal | null;
        scheduleImpact: number | null;
    }>;
    findAll(projectId: string, status?: ChangeOrderStatus): Promise<{
        status: string;
        title: string;
        id: string;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        projectId: string;
        costImpact: import("@prisma/client/runtime/library").Decimal | null;
        scheduleImpact: number | null;
    }[]>;
    getPendingApprovals(userId: string): Promise<({
        project: {
            title: string;
            id: string;
        };
    } & {
        status: string;
        title: string;
        id: string;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        projectId: string;
        costImpact: import("@prisma/client/runtime/library").Decimal | null;
        scheduleImpact: number | null;
    })[]>;
    findOne(id: string): Promise<{
        project: {
            status: string;
            title: string;
            id: string;
            clientId: string;
            designerId: string;
        };
    } & {
        status: string;
        title: string;
        id: string;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        projectId: string;
        costImpact: import("@prisma/client/runtime/library").Decimal | null;
        scheduleImpact: number | null;
    }>;
    submit(id: string, userId: string): Promise<{
        status: string;
        title: string;
        id: string;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        projectId: string;
        costImpact: import("@prisma/client/runtime/library").Decimal | null;
        scheduleImpact: number | null;
    }>;
    approve(id: string, approvalDto: ApproveChangeOrderDto, user: CurrentUser): Promise<{
        status: string;
        title: string;
        id: string;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        projectId: string;
        costImpact: import("@prisma/client/runtime/library").Decimal | null;
        scheduleImpact: number | null;
    }>;
    markImplemented(id: string, userId: string): Promise<{
        status: string;
        title: string;
        id: string;
        createdAt: Date;
        description: string | null;
        updatedAt: Date;
        projectId: string;
        costImpact: import("@prisma/client/runtime/library").Decimal | null;
        scheduleImpact: number | null;
    }>;
}
//# sourceMappingURL=change-orders.controller.d.ts.map