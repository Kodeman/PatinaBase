import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDailyLogDto } from './dto/create-daily-log.dto';
export declare class DailyLogsService {
    private prisma;
    private eventEmitter;
    private readonly logger;
    constructor(prisma: PrismaService, eventEmitter: EventEmitter2);
    create(projectId: string, createDto: CreateDailyLogDto, authorId: string): Promise<{
        id: string;
        photos: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        notes: string | null;
        authorId: string;
        projectId: string;
        weather: string | null;
    }>;
    findAll(projectId: string, startDate?: string, endDate?: string): Promise<{
        id: string;
        photos: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        notes: string | null;
        authorId: string;
        projectId: string;
        weather: string | null;
    }[]>;
    findOne(id: string): Promise<{
        project: {
            title: string;
            id: string;
        };
    } & {
        id: string;
        photos: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        notes: string | null;
        authorId: string;
        projectId: string;
        weather: string | null;
    }>;
    update(id: string, updateDto: Partial<CreateDailyLogDto>, userId: string): Promise<{
        id: string;
        photos: import("@prisma/client/runtime/library").JsonValue | null;
        createdAt: Date;
        notes: string | null;
        authorId: string;
        projectId: string;
        weather: string | null;
    }>;
}
//# sourceMappingURL=daily-logs.service.d.ts.map