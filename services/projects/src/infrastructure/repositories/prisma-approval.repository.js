"use strict";
/**
 * Prisma Approval Repository Implementation (Infrastructure Layer)
 *
 * Concrete implementation of IApprovalRepository using Prisma ORM.
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
exports.PrismaApprovalRepository = void 0;
const common_1 = require("@nestjs/common");
let PrismaApprovalRepository = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var PrismaApprovalRepository = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            PrismaApprovalRepository = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        prisma;
        constructor(prisma) {
            this.prisma = prisma;
        }
        async create(command) {
            return this.prisma.approvalRecord.create({
                data: {
                    projectId: command.projectId,
                    segmentId: command.segmentId,
                    title: command.title,
                    description: command.description,
                    approvalType: command.approvalType,
                    priority: command.priority || 'normal',
                    requestedBy: command.requestedBy,
                    assignedTo: command.assignedTo,
                    dueDate: command.dueDate ? new Date(command.dueDate) : null,
                    documents: command.documents || [],
                    comments: [],
                    metadata: command.metadata,
                },
            });
        }
        async findByProject(query) {
            const where = { projectId: query.projectId };
            if (query.status)
                where.status = query.status;
            if (query.assignedTo)
                where.assignedTo = query.assignedTo;
            if (query.priority)
                where.priority = query.priority;
            if (query.approvalType)
                where.approvalType = query.approvalType;
            return this.prisma.approvalRecord.findMany({
                where,
                orderBy: { createdAt: 'desc' },
            });
        }
        async findPending(projectId) {
            return this.prisma.approvalRecord.findMany({
                where: {
                    projectId,
                    status: { in: ['pending', 'needs_discussion'] },
                },
                orderBy: [
                    { priority: 'desc' },
                    { dueDate: 'asc' },
                    { createdAt: 'asc' },
                ],
            });
        }
        async findById(projectId, approvalId) {
            return this.prisma.approvalRecord.findFirst({
                where: {
                    id: approvalId,
                    projectId,
                },
            });
        }
        async approve(approvalId, approvedBy, comments, signature) {
            const approval = await this.prisma.approvalRecord.findUnique({
                where: { id: approvalId },
            });
            if (!approval) {
                throw new Error('Approval not found');
            }
            // Add approval comment
            const updatedComments = approval.comments || [];
            if (comments) {
                updatedComments.push({
                    userId: approvedBy,
                    action: 'approved',
                    comment: comments,
                    timestamp: new Date().toISOString(),
                });
            }
            // Prepare signature data
            let signatureData = signature;
            if (signatureData) {
                signatureData = {
                    ...signatureData,
                    timestamp: new Date().toISOString(),
                };
            }
            return this.prisma.approvalRecord.update({
                where: { id: approvalId },
                data: {
                    status: 'approved',
                    approvedBy,
                    approvedAt: new Date(),
                    signature: signatureData,
                    comments: updatedComments,
                },
            });
        }
        async reject(approvalId, rejectedBy, reason, comments) {
            const approval = await this.prisma.approvalRecord.findUnique({
                where: { id: approvalId },
            });
            if (!approval) {
                throw new Error('Approval not found');
            }
            // Add rejection comment
            const updatedComments = approval.comments || [];
            updatedComments.push({
                userId: rejectedBy,
                action: 'rejected',
                comment: comments || reason,
                timestamp: new Date().toISOString(),
            });
            return this.prisma.approvalRecord.update({
                where: { id: approvalId },
                data: {
                    status: 'rejected',
                    rejectedBy,
                    rejectedAt: new Date(),
                    rejectionReason: reason,
                    comments: updatedComments,
                },
            });
        }
        async markForDiscussion(approvalId, userId, comment) {
            const approval = await this.prisma.approvalRecord.findUnique({
                where: { id: approvalId },
            });
            if (!approval) {
                throw new Error('Approval not found');
            }
            const updatedComments = approval.comments || [];
            updatedComments.push({
                userId,
                action: 'discussed',
                comment,
                timestamp: new Date().toISOString(),
            });
            return this.prisma.approvalRecord.update({
                where: { id: approvalId },
                data: {
                    status: 'needs_discussion',
                    comments: updatedComments,
                },
            });
        }
        async addSignature(approvalId, signature) {
            const signatureData = {
                ...signature,
                timestamp: new Date().toISOString(),
            };
            return this.prisma.approvalRecord.update({
                where: { id: approvalId },
                data: {
                    signature: signatureData,
                },
            });
        }
        async update(approvalId, command) {
            return this.prisma.approvalRecord.update({
                where: { id: approvalId },
                data: {
                    title: command.title,
                    description: command.description,
                    priority: command.priority,
                    assignedTo: command.assignedTo,
                    dueDate: command.dueDate ? new Date(command.dueDate) : undefined,
                    documents: command.documents,
                    metadata: command.metadata,
                },
            });
        }
        async cancel(approvalId) {
            await this.prisma.approvalRecord.update({
                where: { id: approvalId },
                data: { status: 'cancelled' },
            });
        }
        async getMetrics(projectId) {
            const approvals = await this.prisma.approvalRecord.findMany({
                where: { projectId },
                select: {
                    status: true,
                    createdAt: true,
                    approvedAt: true,
                    rejectedAt: true,
                    dueDate: true,
                },
            });
            const total = approvals.length;
            const approved = approvals.filter((a) => a.status === 'approved').length;
            const rejected = approvals.filter((a) => a.status === 'rejected').length;
            const pending = approvals.filter((a) => a.status === 'pending' || a.status === 'needs_discussion').length;
            // Calculate average approval time (in days)
            const approvedItems = approvals.filter((a) => a.approvedAt);
            const avgApprovalTime = approvedItems.length > 0
                ? approvedItems.reduce((sum, a) => {
                    const diff = a.approvedAt.getTime() - a.createdAt.getTime();
                    return sum + diff / (1000 * 60 * 60 * 24);
                }, 0) / approvedItems.length
                : 0;
            // Calculate overdue approvals
            const now = new Date();
            const overdue = approvals.filter((a) => (a.status === 'pending' || a.status === 'needs_discussion') &&
                a.dueDate &&
                a.dueDate < now).length;
            return {
                total,
                approved,
                rejected,
                pending,
                overdue,
                approvalRate: total > 0 ? (approved / total) * 100 : 0,
                avgApprovalTimeDays: Math.round(avgApprovalTime * 10) / 10,
            };
        }
        async findOverdue(projectId) {
            const now = new Date();
            return this.prisma.approvalRecord.findMany({
                where: {
                    projectId,
                    status: { in: ['pending', 'needs_discussion'] },
                    dueDate: {
                        lt: now,
                    },
                },
                orderBy: { dueDate: 'asc' },
            });
        }
        async findByAssignee(userId) {
            return this.prisma.approvalRecord.findMany({
                where: {
                    assignedTo: userId,
                    status: { in: ['pending', 'needs_discussion'] },
                },
                orderBy: [
                    { priority: 'desc' },
                    { dueDate: 'asc' },
                    { createdAt: 'asc' },
                ],
            });
        }
    };
    return PrismaApprovalRepository = _classThis;
})();
exports.PrismaApprovalRepository = PrismaApprovalRepository;
//# sourceMappingURL=prisma-approval.repository.js.map