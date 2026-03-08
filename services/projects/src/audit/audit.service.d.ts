import { PrismaService } from '../prisma/prisma.service';
export interface QueryAuditLogsDto {
    entityType?: string;
    entityId?: string;
    action?: string;
    actor?: string;
    startDate?: Date;
    endDate?: Date;
    page?: number;
    limit?: number;
}
export declare class AuditService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
    queryLogs(query: QueryAuditLogsDto): Promise<{
        data: {
            id: string;
            result: string;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            action: string;
            actor: string | null;
            ts: Date;
            changes: import("@prisma/client/runtime/library").JsonValue | null;
            entityType: string;
            entityId: string | null;
            ip: string | null;
            ua: string | null;
            actorId: string | null;
        }[];
        pagination: {
            page: number;
            limit: number;
            total: number;
            totalPages: number;
        };
    }>;
    getEntityHistory(entityType: string, entityId: string): Promise<{
        id: string;
        result: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        action: string;
        actor: string | null;
        ts: Date;
        changes: import("@prisma/client/runtime/library").JsonValue | null;
        entityType: string;
        entityId: string | null;
        ip: string | null;
        ua: string | null;
        actorId: string | null;
    }[]>;
    getProjectAuditTrail(projectId: string): Promise<{
        id: string;
        result: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        action: string;
        actor: string | null;
        ts: Date;
        changes: import("@prisma/client/runtime/library").JsonValue | null;
        entityType: string;
        entityId: string | null;
        ip: string | null;
        ua: string | null;
        actorId: string | null;
    }[]>;
    exportAuditTrail(query: QueryAuditLogsDto): Promise<any[]>;
}
//# sourceMappingURL=audit.service.d.ts.map