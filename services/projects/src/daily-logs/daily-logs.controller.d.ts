import { DailyLogsService } from './daily-logs.service';
import { CreateDailyLogDto } from './dto/create-daily-log.dto';
export declare class DailyLogsController {
    private readonly dailyLogsService;
    constructor(dailyLogsService: DailyLogsService);
    create(projectId: string, createDto: CreateDailyLogDto, userId: string): Promise<{
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
//# sourceMappingURL=daily-logs.controller.d.ts.map