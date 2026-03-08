import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChangeOrderDto, ChangeOrderStatus } from './dto/create-change-order.dto';
import { ApproveChangeOrderDto } from './dto/approve-change-order.dto';
export declare class ChangeOrdersService {
    private prisma;
    private eventEmitter;
    private readonly logger;
    constructor(prisma: PrismaService, eventEmitter: EventEmitter2);
    create(projectId: string, createDto: CreateChangeOrderDto, requestedBy: string): Promise<{
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
    approve(id: string, approvalDto: ApproveChangeOrderDto, userId: string, userRole: string): Promise<{
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
    getPendingApprovals(clientId: string): Promise<({
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
}
//# sourceMappingURL=change-orders.service.d.ts.map