"use strict";
/**
 * Prisma Project Repository Implementation (Infrastructure Layer)
 *
 * Concrete implementation of IProjectRepository using Prisma ORM.
 * Isolates all database access logic from business logic.
 */
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
exports.PrismaProjectRepository = void 0;
const common_1 = require("@nestjs/common");
const decimal_js_1 = require("decimal.js");
let PrismaProjectRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var PrismaProjectRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            PrismaProjectRepository = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        prisma;
        constructor(prisma) {
            this.prisma = prisma;
        }
        async create(command) {
            const { budget, ...rest } = command;
            return this.prisma.project.create({
                data: {
                    ...rest,
                    budget: budget ? new decimal_js_1.Decimal(budget) : null,
                    status: 'draft',
                },
                include: {
                    tasks: true,
                    rfis: true,
                    changeOrders: true,
                    issues: true,
                    milestones: true,
                    _count: {
                        select: {
                            tasks: true,
                            rfis: true,
                            changeOrders: true,
                            issues: true,
                            dailyLogs: true,
                            documents: true,
                        },
                    },
                },
            });
        }
        async findAll(query) {
            const { clientId, designerId, status, page = 1, limit = 20 } = query;
            const skip = (page - 1) * limit;
            const where = {};
            if (clientId)
                where.clientId = clientId;
            if (designerId)
                where.designerId = designerId;
            if (status)
                where.status = status;
            const [data, total] = await Promise.all([
                this.prisma.project.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: { createdAt: 'desc' },
                    include: {
                        _count: {
                            select: {
                                tasks: true,
                                rfis: true,
                                changeOrders: true,
                                issues: true,
                            },
                        },
                    },
                }),
                this.prisma.project.count({ where }),
            ]);
            return {
                data,
                pagination: {
                    page,
                    limit,
                    total,
                    totalPages: Math.ceil(total / limit),
                },
            };
        }
        async findById(id) {
            return this.prisma.project.findUnique({
                where: { id },
                include: {
                    tasks: {
                        orderBy: { order: 'asc' },
                        take: 10,
                    },
                    rfis: {
                        where: { status: 'open' },
                        orderBy: { createdAt: 'desc' },
                        take: 5,
                    },
                    changeOrders: {
                        orderBy: { createdAt: 'desc' },
                        take: 5,
                    },
                    issues: {
                        where: { status: { in: ['open', 'investigating'] } },
                        orderBy: { severity: 'desc' },
                        take: 5,
                    },
                    milestones: {
                        orderBy: { order: 'asc' },
                    },
                    _count: {
                        select: {
                            tasks: true,
                            rfis: true,
                            changeOrders: true,
                            issues: true,
                            dailyLogs: true,
                            documents: true,
                        },
                    },
                },
            });
        }
        async findByIds(ids) {
            return this.prisma.project.findMany({
                where: { id: { in: ids } },
                include: {
                    _count: {
                        select: {
                            tasks: true,
                            rfis: true,
                            issues: true,
                            changeOrders: true,
                            documents: true,
                            milestones: true,
                        },
                    },
                },
            });
        }
        async update(id, command) {
            const { budget, ...rest } = command;
            return this.prisma.project.update({
                where: { id },
                data: {
                    ...rest,
                    budget: budget !== undefined ? (budget ? new decimal_js_1.Decimal(budget) : null) : undefined,
                },
                include: {
                    _count: {
                        select: {
                            tasks: true,
                            rfis: true,
                            changeOrders: true,
                            issues: true,
                        },
                    },
                },
            });
        }
        async delete(id) {
            await this.prisma.project.update({
                where: { id },
                data: { status: 'closed' },
            });
        }
        async getStats(id) {
            const [taskStats, rfiStats, issueStats, changeOrderStats] = await Promise.all([
                this.prisma.task.groupBy({
                    by: ['status'],
                    where: { projectId: id },
                    _count: true,
                }),
                this.prisma.rFI.groupBy({
                    by: ['status'],
                    where: { projectId: id },
                    _count: true,
                }),
                this.prisma.issue.groupBy({
                    by: ['status'],
                    where: { projectId: id },
                    _count: true,
                }),
                this.prisma.changeOrder.groupBy({
                    by: ['status'],
                    where: { projectId: id },
                    _count: true,
                }),
            ]);
            return {
                tasks: taskStats.reduce((acc, stat) => {
                    acc[stat.status] = stat._count;
                    return acc;
                }, {}),
                rfis: rfiStats.reduce((acc, stat) => {
                    acc[stat.status] = stat._count;
                    return acc;
                }, {}),
                issues: issueStats.reduce((acc, stat) => {
                    acc[stat.status] = stat._count;
                    return acc;
                }, {}),
                changeOrders: changeOrderStats.reduce((acc, stat) => {
                    acc[stat.status] = stat._count;
                    return acc;
                }, {}),
            };
        }
        async getClientSafeData(projectId, clientId) {
            const project = await this.prisma.project.findFirst({
                where: {
                    id: projectId,
                    clientId,
                },
                include: {
                    timelineSegments: {
                        orderBy: { order: 'asc' },
                        include: {
                            approvals: {
                                where: {
                                    assignedTo: clientId,
                                    status: { in: ['pending', 'needs_discussion'] },
                                },
                            },
                        },
                    },
                    milestones: {
                        orderBy: { order: 'asc' },
                    },
                    approvalRecords: {
                        where: { assignedTo: clientId },
                        orderBy: { createdAt: 'desc' },
                    },
                    documents: {
                        where: {
                            OR: [
                                { category: 'drawing' },
                                { category: 'photo' },
                                { category: 'invoice' },
                            ],
                        },
                        orderBy: { createdAt: 'desc' },
                    },
                    engagementMetrics: true,
                },
            });
            if (!project)
                return null;
            const segments = project.timelineSegments;
            const overallProgress = segments.length > 0
                ? Math.round(segments.reduce((sum, seg) => sum + seg.progress, 0) / segments.length)
                : 0;
            const pendingApprovalsCount = project.approvalRecords.filter((a) => a.status === 'pending' || a.status === 'needs_discussion').length;
            return {
                id: project.id,
                title: project.title,
                status: project.status,
                startDate: project.startDate,
                endDate: project.endDate,
                description: project.description,
                currency: project.currency,
                budget: project.budget,
                overallProgress,
                pendingApprovalsCount,
                timeline: project.timelineSegments,
                milestones: project.milestones,
                approvals: project.approvalRecords,
                documents: project.documents,
                engagement: project.engagementMetrics,
            };
        }
        async exists(id) {
            const count = await this.prisma.project.count({
                where: { id },
            });
            return count > 0;
        }
        async hasAccess(projectId, userId, role) {
            if (role === 'admin')
                return true;
            const where = { id: projectId };
            if (role === 'client') {
                where.clientId = userId;
            }
            else if (role === 'designer') {
                where.designerId = userId;
            }
            else {
                return false;
            }
            const count = await this.prisma.project.count({ where });
            return count > 0;
        }
        async findByClient(clientId) {
            return this.prisma.project.findMany({
                where: { clientId },
                orderBy: { createdAt: 'desc' },
            });
        }
        async findByDesigner(designerId) {
            return this.prisma.project.findMany({
                where: { designerId },
                orderBy: { createdAt: 'desc' },
            });
        }
        async countByStatus(status) {
            return this.prisma.project.count({
                where: { status },
            });
        }
    };
    return PrismaProjectRepository = _classThis;
})();
exports.PrismaProjectRepository = PrismaProjectRepository;
//# sourceMappingURL=prisma-project.repository.js.map