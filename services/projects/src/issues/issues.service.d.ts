import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateIssueDto, IssueStatus } from './dto/create-issue.dto';
import { UpdateIssueDto } from './dto/update-issue.dto';
export declare class IssuesService {
    private prisma;
    private eventEmitter;
    private readonly logger;
    constructor(prisma: PrismaService, eventEmitter: EventEmitter2);
    create(projectId: string, createDto: CreateIssueDto, reportedBy: string): Promise<{
        status: string;
        id: string;
        createdAt: Date;
        description: string;
        updatedAt: Date;
        projectId: string;
        severity: string;
    }>;
    findAll(projectId: string, status?: IssueStatus): Promise<{
        status: string;
        id: string;
        createdAt: Date;
        description: string;
        updatedAt: Date;
        projectId: string;
        severity: string;
    }[]>;
    findOne(id: string): Promise<{
        project: {
            title: string;
            id: string;
        };
    } & {
        status: string;
        id: string;
        createdAt: Date;
        description: string;
        updatedAt: Date;
        projectId: string;
        severity: string;
    }>;
    update(id: string, updateDto: UpdateIssueDto, userId: string): Promise<{
        status: string;
        id: string;
        createdAt: Date;
        description: string;
        updatedAt: Date;
        projectId: string;
        severity: string;
    }>;
}
//# sourceMappingURL=issues.service.d.ts.map