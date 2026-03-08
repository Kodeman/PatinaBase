"use strict";
/**
 * Approval Management Service (Application Layer)
 *
 * Orchestrates approval workflow operations by coordinating:
 * - ApprovalValidator (business rules)
 * - ApprovalWorkflowService (workflow logic)
 * - Repository (data access)
 * - Event emitter (notifications)
 * - Audit logger (tracking)
 *
 * Single Responsibility: Managing approval lifecycle and workflow
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
exports.ApprovalManagementService = void 0;
const common_1 = require("@nestjs/common");
let ApprovalManagementService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ApprovalManagementService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ApprovalManagementService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        repository;
        validator;
        workflowService;
        eventEmitter;
        prisma;
        constructor(repository, validator, workflowService, eventEmitter, prisma) {
            this.repository = repository;
            this.validator = validator;
            this.workflowService = workflowService;
            this.eventEmitter = eventEmitter;
            this.prisma = prisma;
        }
        /**
         * Create a new approval request
         */
        async create(projectId, command, requestedBy) {
            // Validate business rules
            this.validator.validateCreateData({ ...command, projectId, requestedBy });
            // Verify project exists
            const project = await this.prisma.project.findUnique({
                where: { id: projectId },
                select: { id: true, clientId: true, designerId: true },
            });
            if (!project) {
                throw new common_1.NotFoundException('Project not found');
            }
            // Verify segment exists if provided
            if (command.segmentId) {
                const segment = await this.prisma.timelineSegment.findFirst({
                    where: {
                        id: command.segmentId,
                        projectId,
                    },
                    select: { id: true },
                });
                if (!segment) {
                    throw new common_1.NotFoundException('Timeline segment not found');
                }
            }
            // Create approval
            const approval = await this.repository.create({
                ...command,
                projectId,
                requestedBy,
            });
            // Emit event
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
        async findByProject(query) {
            return this.repository.findByProject(query);
        }
        /**
         * Get pending approvals for a project
         */
        async findPending(projectId) {
            return this.repository.findPending(projectId);
        }
        /**
         * Get specific approval
         */
        async findOne(projectId, approvalId) {
            const approval = await this.repository.findById(projectId, approvalId);
            if (!approval) {
                throw new common_1.NotFoundException('Approval not found');
            }
            return approval;
        }
        /**
         * Approve an approval request
         */
        async approve(projectId, approvalId, userId, comments, signature, ipAddress) {
            const approval = await this.findOne(projectId, approvalId);
            // Validate action
            this.validator.validateApprovalAction(approval, userId, 'approve');
            // Validate signature if provided
            if (signature) {
                this.validator.validateSignature(signature);
                // Add IP address to signature
                signature.ipAddress = ipAddress;
            }
            // Validate comment if provided
            if (comments) {
                this.validator.validateComment(comments);
            }
            // Update approval
            const updated = await this.repository.approve(approvalId, userId, comments, signature);
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
                    metadata: { projectId, comments },
                },
            });
            return updated;
        }
        /**
         * Reject an approval request
         */
        async reject(projectId, approvalId, userId, reason, comments) {
            const approval = await this.findOne(projectId, approvalId);
            // Validate action
            this.validator.validateApprovalAction(approval, userId, 'reject');
            // Validate rejection reason
            this.validator.validateRejectionReason(reason);
            // Validate comment if provided
            if (comments) {
                this.validator.validateComment(comments);
            }
            // Update approval
            const updated = await this.repository.reject(approvalId, userId, reason, comments);
            // Emit event
            this.eventEmitter.emit('approval.rejected', {
                approvalId,
                projectId,
                rejectedBy: userId,
                requestedBy: approval.requestedBy,
                approvalType: approval.approvalType,
                reason,
                timestamp: new Date(),
            });
            // Log audit
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'approval_record',
                    entityId: approvalId,
                    action: 'rejected',
                    actor: userId,
                    metadata: { projectId, reason },
                },
            });
            return updated;
        }
        /**
         * Add a discussion comment to an approval
         */
        async discuss(projectId, approvalId, userId, comment) {
            const approval = await this.findOne(projectId, approvalId);
            // Validate comment
            this.validator.validateComment(comment);
            // Update approval
            const updated = await this.repository.markForDiscussion(approvalId, userId, comment);
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
        async addSignature(projectId, approvalId, userId, signature, ipAddress) {
            const approval = await this.findOne(projectId, approvalId);
            // Validate user is assigned
            this.validator.validateUserAssignment(approval.assignedTo, userId);
            // Validate signature
            this.validator.validateSignature(signature);
            // Add IP address
            signature.ipAddress = ipAddress;
            signature.signerId = userId;
            // Update approval
            const updated = await this.repository.addSignature(approvalId, signature);
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
         * Update approval
         */
        async update(projectId, approvalId, command, userId) {
            const approval = await this.findOne(projectId, approvalId);
            // Validate can modify
            this.validator.validateCanProcess(approval.status);
            // Validate update data
            this.validator.validateUpdateData(command);
            // Validate edit window (30 minutes)
            this.validator.validateEditWindow(approval.createdAt, 30);
            // Update approval
            const updated = await this.repository.update(approvalId, command);
            // Log audit
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'approval_record',
                    entityId: approvalId,
                    action: 'updated',
                    actor: userId,
                    changes: command,
                },
            });
            return updated;
        }
        /**
         * Cancel approval
         */
        async cancel(projectId, approvalId, userId) {
            const approval = await this.findOne(projectId, approvalId);
            // Validate can modify
            this.validator.validateCanProcess(approval.status);
            // Cancel
            await this.repository.cancel(approvalId);
            // Emit event
            this.eventEmitter.emit('approval.cancelled', {
                approvalId,
                projectId,
                userId,
                timestamp: new Date(),
            });
            // Log audit
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'approval_record',
                    entityId: approvalId,
                    action: 'cancelled',
                    actor: userId,
                    metadata: { projectId },
                },
            });
        }
        /**
         * Get approval metrics for a project
         */
        async getMetrics(projectId) {
            return this.repository.getMetrics(projectId);
        }
        /**
         * Get approval health score
         */
        async getHealthScore(projectId) {
            const metrics = await this.repository.getMetrics(projectId);
            return this.workflowService.calculateHealthScore({
                approvalRate: metrics.approvalRate,
                avgApprovalTimeDays: metrics.avgApprovalTimeDays,
                overdueCount: metrics.overdue,
                totalPending: metrics.pending,
            });
        }
        /**
         * Get overdue approvals
         */
        async findOverdue(projectId) {
            return this.repository.findOverdue(projectId);
        }
        /**
         * Get approvals assigned to user
         */
        async findByAssignee(userId) {
            return this.repository.findByAssignee(userId);
        }
        /**
         * Prioritize approvals for a project
         */
        async prioritizeApprovals(projectId) {
            const approvals = await this.repository.findPending(projectId);
            const approvalsForPrioritization = approvals.map((a) => ({
                id: a.id,
                priority: a.priority,
                dueDate: a.dueDate,
                createdAt: a.createdAt,
            }));
            return this.workflowService.prioritizeApprovals(approvalsForPrioritization);
        }
    };
    return ApprovalManagementService = _classThis;
})();
exports.ApprovalManagementService = ApprovalManagementService;
//# sourceMappingURL=approval-management.service.js.map