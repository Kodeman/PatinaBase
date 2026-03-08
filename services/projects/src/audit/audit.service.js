"use strict";
var __esDecorate = (this && this.__esDecorate) || function (ctor, descriptorIn, decorators, contextIn, initializers, extraInitializers) {
    function accept(f) { if (f !== void 0 && typeof f !== "function") throw new TypeError("Function expected"); return f; }
    var kind = contextIn.kind, key = kind === "getter" ? "get" : kind === "setter" ? "set" : "value";
    var target = !descriptorIn && ctor ? contextIn["static"] ? ctor : ctor.prototype : null;
    var descriptor = descriptorIn || (target ? Object.getOwnPropertyDescriptor(target, contextIn.name) : {});
    var _, done = false;
    for (var i = decorators.length - 1; i >= 0; i--) {
        var context = {};
        for (var p in contextIn) context[p] = p === "access" ? {} : contextIn[p];
        for (var p in contextIn.access) context.access[p] = contextIn.access[p];
        context.addInitializer = function (f) { if (done) throw new TypeError("Cannot add initializers after decoration has completed"); extraInitializers.push(accept(f || null)); };
        var result = (0, decorators[i])(kind === "accessor" ? { get: descriptor.get, set: descriptor.set } : descriptor[key], context);
        if (kind === "accessor") {
            if (result === void 0) continue;
            if (result === null || typeof result !== "object") throw new TypeError("Object expected");
            if (_ = accept(result.get)) descriptor.get = _;
            if (_ = accept(result.set)) descriptor.set = _;
            if (_ = accept(result.init)) initializers.unshift(_);
        }
        else if (_ = accept(result)) {
            if (kind === "field") initializers.unshift(_);
            else descriptor[key] = _;
        }
    }
    if (target) Object.defineProperty(target, contextIn.name, descriptor);
    done = true;
};
var __runInitializers = (this && this.__runInitializers) || function (thisArg, initializers, value) {
    var useValue = arguments.length > 2;
    for (var i = 0; i < initializers.length; i++) {
        value = useValue ? initializers[i].call(thisArg, value) : initializers[i].call(thisArg);
    }
    return useValue ? value : void 0;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuditService = void 0;
const common_1 = require("@nestjs/common");
let AuditService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var AuditService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            AuditService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        prisma;
        logger = new common_1.Logger(AuditService.name);
        constructor(prisma) {
            this.prisma = prisma;
        }
        async queryLogs(query) {
            const { entityType, entityId, action, actor, startDate, endDate, page = 1, limit = 50 } = query;
            const skip = (page - 1) * limit;
            const where = {};
            if (entityType)
                where.entityType = entityType;
            if (entityId)
                where.entityId = entityId;
            if (action)
                where.action = action;
            if (actor)
                where.actor = actor;
            if (startDate || endDate) {
                where.createdAt = {};
                if (startDate)
                    where.createdAt.gte = startDate;
                if (endDate)
                    where.createdAt.lte = endDate;
            }
            const [logs, total] = await Promise.all([
                this.prisma.auditLog.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: { createdAt: 'desc' },
                }),
                this.prisma.auditLog.count({ where }),
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
        }
        async getEntityHistory(entityType, entityId) {
            return this.prisma.auditLog.findMany({
                where: {
                    entityType,
                    entityId,
                },
                orderBy: { createdAt: 'asc' },
            });
        }
        async getProjectAuditTrail(projectId) {
            // Get all audit logs related to a project
            const projectLog = await this.prisma.auditLog.findMany({
                where: {
                    OR: [
                        { entityType: 'project', entityId: projectId },
                        { metadata: { path: ['projectId'], equals: projectId } },
                    ],
                },
                orderBy: { createdAt: 'desc' },
            });
            return projectLog;
        }
        async exportAuditTrail(query) {
            // Export all matching logs (no pagination)
            const where = {};
            if (query.entityType)
                where.entityType = query.entityType;
            if (query.entityId)
                where.entityId = query.entityId;
            if (query.action)
                where.action = query.action;
            if (query.actor)
                where.actor = query.actor;
            if (query.startDate || query.endDate) {
                where.createdAt = {};
                if (query.startDate)
                    where.createdAt.gte = query.startDate;
                if (query.endDate)
                    where.createdAt.lte = query.endDate;
            }
            return this.prisma.auditLog.findMany({
                where,
                orderBy: { createdAt: 'desc' },
            });
        }
    };
    return AuditService = _classThis;
})();
exports.AuditService = AuditService;
//# sourceMappingURL=audit.service.js.map