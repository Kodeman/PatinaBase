import { Injectable } from '@nestjs/common';
import { ProjectsAuthorizationResolver } from '../common/authorization/projects-authorization.resolver';

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

@Injectable()
export class AuditService {
  constructor(private readonly authorization: ProjectsAuthorizationResolver) {}

  async queryLogs(userId: string, query: QueryAuditLogsDto) {
    const { entityType, entityId, action, actor, startDate, endDate, page = 1, limit = 50 } = query;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (action) where.action = action;
    if (actor) where.actor = actor;

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = startDate;
      if (endDate) where.createdAt.lte = endDate;
    }

    return this.authorization.withAnyPermission(userId, ['project.admin.all'], async (tx) => {
      const [logs, total] = await Promise.all([
        tx.auditLog.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: 'desc' },
        }),
        tx.auditLog.count({ where }),
      ]);

      return {
        data: logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    });
  }

  async getEntityHistory(userId: string, entityType: string, entityId: string) {
    return this.authorization.withAnyPermission(userId, ['project.admin.all'], (tx) =>
      tx.auditLog.findMany({
        where: {
          entityType,
          entityId,
        },
        orderBy: { createdAt: 'asc' },
      }),
    );
  }

  async getProjectAuditTrail(userId: string, projectId: string) {
    // Get all audit logs related to a project
    return this.authorization.withAnyPermission(userId, ['project.admin.all'], (tx) =>
      tx.auditLog.findMany({
        where: {
          OR: [
            { entityType: 'project', entityId: projectId },
            { metadata: { path: ['projectId'], equals: projectId } },
          ],
        },
        orderBy: { createdAt: 'desc' },
      }),
    );
  }

  async exportAuditTrail(userId: string, query: QueryAuditLogsDto): Promise<any[]> {
    // Export all matching logs (no pagination)
    const where: any = {};

    if (query.entityType) where.entityType = query.entityType;
    if (query.entityId) where.entityId = query.entityId;
    if (query.action) where.action = query.action;
    if (query.actor) where.actor = query.actor;

    if (query.startDate || query.endDate) {
      where.createdAt = {};
      if (query.startDate) where.createdAt.gte = query.startDate;
      if (query.endDate) where.createdAt.lte = query.endDate;
    }

    return this.authorization.withAnyPermission(userId, ['project.admin.all'], (tx) =>
      tx.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      }),
    );
  }
}
