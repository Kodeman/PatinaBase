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
exports.ApprovalsService = void 0;
const common_1 = require("@nestjs/common");
let ApprovalsService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ApprovalsService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ApprovalsService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        prisma;
        eventEmitter;
        logger = new common_1.Logger(ApprovalsService.name);
        constructor(prisma, eventEmitter) {
            this.prisma = prisma;
            this.eventEmitter = eventEmitter;
        }
        /**
         * Create a new approval request
         */
        async create(projectId, createDto, requestedBy) {
            // Verify project exists
            const project = await this.prisma.project.findUnique({
                where: { id: projectId },
                select: { id: true, clientId: true, designerId: true },
            });
            if (!project) {
                throw new common_1.NotFoundException('Project not found');
            }
            // Verify segment exists if provided
            if (createDto.segmentId) {
                const segment = await this.prisma.timelineSegment.findFirst({
                    where: {
                        id: createDto.segmentId,
                        projectId,
                    },
                    select: { id: true },
                });
                if (!segment) {
                    throw new common_1.NotFoundException('Timeline segment not found');
                }
            }
            const approval = await this.prisma.approvalRecord.create({
                data: {
                    projectId,
                    segmentId: createDto.segmentId,
                    title: createDto.title,
                    description: createDto.description,
                    approvalType: createDto.approvalType,
                    priority: createDto.priority || 'normal',
                    requestedBy,
                    assignedTo: createDto.assignedTo,
                    dueDate: createDto.dueDate ? new Date(createDto.dueDate) : null,
                    documents: createDto.documents || [],
                    comments: [],
                    metadata: createDto.metadata,
                },
            });
            // Emit event for notification
            this.eventEmitter.emit('approval.requested', {
                approvalId: approval.id,
                projectId,
                assignedTo: approval.assignedTo,
                requestedBy,
                approvalType: approval.approvalType,
                priority: approval.priority,
                timestamp: new Date(),
            });
            // Log audit
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'approval_record',
                    entityId: approval.id,
                    action: 'created',
                    actor: requestedBy,
                    metadata: { projectId },
                },
            });
            return approval;
        }
        /**
         * Get all approvals for a project
         */
        async findByProject(projectId, status) {
            const where = { projectId };
            if (status)
                where.status = status;
            return this.prisma.approvalRecord.findMany({
                where,
                orderBy: { createdAt: 'desc' },
            });
        }
        /**
         * Get pending approvals for a project
         */
        async getPending(projectId) {
            const project = await this.prisma.project.findUnique({
                where: { id: projectId },
                select: { id: true },
            });
            if (!project) {
                throw new common_1.NotFoundException('Project not found');
            }
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
        /**
         * Get specific approval
         */
        async findOne(projectId, approvalId) {
            const approval = await this.prisma.approvalRecord.findFirst({
                where: {
                    id: approvalId,
                    projectId,
                },
            });
            if (!approval) {
                throw new common_1.NotFoundException('Approval not found');
            }
            return approval;
        }
        /**
         * Approve an approval request
         */
        async approve(projectId, approvalId, approveDto, userId, ipAddress) {
            const approval = await this.findOne(projectId, approvalId);
            if (approval.status !== 'pending' && approval.status !== 'needs_discussion') {
                throw new common_1.BadRequestException('Approval has already been processed');
            }
            if (approval.assignedTo !== userId) {
                throw new common_1.ForbiddenException('You are not authorized to approve this request');
            }
            // Prepare signature data
            let signatureData = approveDto.signature;
            if (signatureData) {
                signatureData = {
                    ...signatureData,
                    timestamp: new Date().toISOString(),
                    ipAddress: ipAddress || signatureData.ipAddress,
                };
            }
            // Add approval comment
            const comments = approval.comments || [];
            if (approveDto.comments) {
                comments.push({
                    userId,
                    action: 'approved',
                    comment: approveDto.comments,
                    timestamp: new Date().toISOString(),
                });
            }
            const updated = await this.prisma.approvalRecord.update({
                where: { id: approvalId },
                data: {
                    status: 'approved',
                    approvedBy: userId,
                    approvedAt: new Date(),
                    signature: signatureData,
                    comments,
                    metadata: (approveDto.metadata || approval.metadata),
                },
            });
            // Emit event
            this.eventEmitter.emit('approval.approved', {
                approvalId,
                projectId,
                approvedBy: userId,
                requestedBy: approval.requestedBy,
                approvalType: approval.approvalType,
                timestamp: new Date(),
            });
            // Log audit
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'approval_record',
                    entityId: approvalId,
                    action: 'approved',
                    actor: userId,
                    metadata: { projectId, comments: approveDto.comments },
                },
            });
            return updated;
        }
        /**
         * Reject an approval request
         */
        async reject(projectId, approvalId, rejectDto, userId) {
            const approval = await this.findOne(projectId, approvalId);
            if (approval.status !== 'pending' && approval.status !== 'needs_discussion') {
                throw new common_1.BadRequestException('Approval has already been processed');
            }
            if (approval.assignedTo !== userId) {
                throw new common_1.ForbiddenException('You are not authorized to reject this request');
            }
            // Add rejection comment
            const comments = approval.comments || [];
            comments.push({
                userId,
                action: 'rejected',
                comment: rejectDto.comments || rejectDto.reason,
                timestamp: new Date().toISOString(),
            });
            const updated = await this.prisma.approvalRecord.update({
                where: { id: approvalId },
                data: {
                    status: 'rejected',
                    rejectedBy: userId,
                    rejectedAt: new Date(),
                    rejectionReason: rejectDto.reason,
                    comments,
                },
            });
            // Emit event
            this.eventEmitter.emit('approval.rejected', {
                approvalId,
                projectId,
                rejectedBy: userId,
                requestedBy: approval.requestedBy,
                approvalType: approval.approvalType,
                reason: rejectDto.reason,
                timestamp: new Date(),
            });
            // Log audit
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'approval_record',
                    entityId: approvalId,
                    action: 'rejected',
                    actor: userId,
                    metadata: { projectId, reason: rejectDto.reason },
                },
            });
            return updated;
        }
        /**
         * Add a discussion comment to an approval
         */
        async discuss(projectId, approvalId, discussDto, userId) {
            const approval = await this.findOne(projectId, approvalId);
            const comments = approval.comments || [];
            comments.push({
                userId,
                action: 'discussed',
                comment: discussDto.comment,
                timestamp: new Date().toISOString(),
            });
            const updated = await this.prisma.approvalRecord.update({
                where: { id: approvalId },
                data: {
                    status: 'needs_discussion',
                    comments,
                },
            });
            // Emit event
            this.eventEmitter.emit('approval.discussed', {
                approvalId,
                projectId,
                userId,
                requestedBy: approval.requestedBy,
                assignedTo: approval.assignedTo,
                timestamp: new Date(),
            });
            return updated;
        }
        /**
         * Add/update digital signature for an approval
         */
        async addSignature(projectId, approvalId, signatureDto, userId, ipAddress) {
            const approval = await this.findOne(projectId, approvalId);
            if (approval.assignedTo !== userId) {
                throw new common_1.ForbiddenException('You are not authorized to sign this approval');
            }
            const signatureData = {
                data: signatureDto.data,
                signerName: signatureDto.signerName,
                signerId: userId,
                timestamp: new Date().toISOString(),
                ipAddress,
                metadata: signatureDto.metadata,
            };
            const updated = await this.prisma.approvalRecord.update({
                where: { id: approvalId },
                data: {
                    signature: signatureData,
                },
            });
            // Log audit
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'approval_record',
                    entityId: approvalId,
                    action: 'signature_added',
                    actor: userId,
                    metadata: { projectId },
                },
            });
            return updated;
        }
        /**
         * Calculate approval velocity metrics for a project
         */
        async getApprovalMetrics(projectId) {
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
            const approved = approvals.filter(a => a.status === 'approved').length;
            const rejected = approvals.filter(a => a.status === 'rejected').length;
            const pending = approvals.filter(a => a.status === 'pending' || a.status === 'needs_discussion').length;
            // Calculate average approval time (in days)
            const approvedItems = approvals.filter(a => a.approvedAt);
            const avgApprovalTime = approvedItems.length > 0
                ? approvedItems.reduce((sum, a) => {
                    const diff = a.approvedAt.getTime() - a.createdAt.getTime();
                    return sum + (diff / (1000 * 60 * 60 * 24));
                }, 0) / approvedItems.length
                : 0;
            // Calculate overdue approvals
            const now = new Date();
            const overdue = approvals.filter(a => (a.status === 'pending' || a.status === 'needs_discussion') &&
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
    };
    return ApprovalsService = _classThis;
})();
exports.ApprovalsService = ApprovalsService;
//# sourceMappingURL=approvals.service.js.map