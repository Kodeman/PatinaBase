import { AuditService } from './audit.service';
export declare class AuditController {
    private readonly auditService;
    constructor(auditService: AuditService);
    queryLogs(entityType?: string, entityId?: string, action?: string, actor?: string, startDate?: string, endDate?: string, page?: number, limit?: number): Promise<{
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
    exportAuditTrail(entityType?: string, entityId?: string, action?: string, actor?: string, startDate?: string, endDate?: string): Promise<any[]>;
}
//# sourceMappingURL=audit.controller.d.ts.map