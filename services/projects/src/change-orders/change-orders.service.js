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
exports.ChangeOrdersService = void 0;
const common_1 = require("@nestjs/common");
const create_change_order_dto_1 = require("./dto/create-change-order.dto");
const approve_change_order_dto_1 = require("./dto/approve-change-order.dto");
const decimal_js_1 = require("decimal.js");
let ChangeOrdersService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ChangeOrdersService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ChangeOrdersService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        prisma;
        eventEmitter;
        logger = new common_1.Logger(ChangeOrdersService.name);
        constructor(prisma, eventEmitter) {
            this.prisma = prisma;
            this.eventEmitter = eventEmitter;
        }
        async create(projectId, createDto, requestedBy) {
            // Verify project exists
            const project = await this.prisma.project.findUnique({
                where: { id: projectId },
                select: { id: true, status: true, clientId: true },
            });
            if (!project) {
                throw new common_1.NotFoundException('Project not found');
            }
            if (project.status === 'closed') {
                throw new common_1.BadRequestException('Cannot create change orders for a closed project');
            }
            const { costImpact, ...data } = createDto;
            const changeOrder = await this.prisma.changeOrder.create({
                data: {
                    ...data,
                    projectId,
                    requestedBy,
                    costImpact: costImpact ? new decimal_js_1.Decimal(costImpact) : null,
                },
            });
            // Emit event
            this.eventEmitter.emit('change_order.created', {
                changeOrderId: changeOrder.id,
                projectId,
                clientId: project.clientId,
                requestedBy,
                timestamp: new Date(),
            });
            // Log audit
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'change_order',
                    entityId: changeOrder.id,
                    action: 'created',
                    actor: requestedBy,
                    metadata: { projectId },
                },
            });
            return changeOrder;
        }
        async findAll(projectId, status) {
            const where = { projectId };
            if (status) {
                where.status = status;
            }
            return this.prisma.changeOrder.findMany({
                where,
                orderBy: { createdAt: 'desc' },
            });
        }
        async findOne(id) {
            const changeOrder = await this.prisma.changeOrder.findUnique({
                where: { id },
                include: {
                    project: {
                        select: {
                            id: true,
                            title: true,
                            status: true,
                            clientId: true,
                            designerId: true,
                        },
                    },
                },
            });
            if (!changeOrder) {
                throw new common_1.NotFoundException('Change order not found');
            }
            return changeOrder;
        }
        async submit(id, userId) {
            const changeOrder = await this.prisma.changeOrder.findUnique({
                where: { id },
                select: { id: true, status: true, projectId: true },
            });
            if (!changeOrder) {
                throw new common_1.NotFoundException('Change order not found');
            }
            if (changeOrder.status !== create_change_order_dto_1.ChangeOrderStatus.DRAFT) {
                throw new common_1.BadRequestException('Only draft change orders can be submitted');
            }
            const updated = await this.prisma.changeOrder.update({
                where: { id },
                data: { status: create_change_order_dto_1.ChangeOrderStatus.SUBMITTED },
            });
            // Get client ID for notification
            const project = await this.prisma.project.findUnique({
                where: { id: changeOrder.projectId },
                select: { clientId: true },
            });
            // Emit event
            this.eventEmitter.emit('change_order.submitted', {
                changeOrderId: id,
                projectId: changeOrder.projectId,
                clientId: project?.clientId,
                userId,
                timestamp: new Date(),
            });
            // Log audit
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'change_order',
                    entityId: id,
                    action: 'submitted',
                    actor: userId,
                },
            });
            return updated;
        }
        async approve(id, approvalDto, userId, userRole) {
            const changeOrder = await this.prisma.changeOrder.findUnique({
                where: { id },
                include: {
                    project: {
                        select: {
                            id: true,
                            clientId: true,
                            status: true,
                        },
                    },
                },
            });
            if (!changeOrder) {
                throw new common_1.NotFoundException('Change order not found');
            }
            if (changeOrder.status !== create_change_order_dto_1.ChangeOrderStatus.SUBMITTED) {
                throw new common_1.BadRequestException('Only submitted change orders can be approved/rejected');
            }
            // Only client or admin can approve
            if (userRole !== 'admin' && userRole !== 'client') {
                throw new common_1.ForbiddenException('Only clients can approve change orders');
            }
            // If client, must be the project client
            if (userRole === 'client' && changeOrder.project.clientId !== userId) {
                throw new common_1.ForbiddenException('You can only approve change orders for your own projects');
            }
            const newStatus = approvalDto.action === approve_change_order_dto_1.ApprovalAction.APPROVE
                ? create_change_order_dto_1.ChangeOrderStatus.APPROVED
                : create_change_order_dto_1.ChangeOrderStatus.REJECTED;
            const updated = await this.prisma.changeOrder.update({
                where: { id },
                data: {
                    status: newStatus,
                    approvedBy: userId,
                    approvedAt: new Date(),
                    reason: approvalDto.reason,
                },
            });
            // Emit event
            const eventName = approvalDto.action === approve_change_order_dto_1.ApprovalAction.APPROVE
                ? 'change_order.approved'
                : 'change_order.rejected';
            this.eventEmitter.emit(eventName, {
                changeOrderId: id,
                projectId: changeOrder.project.id,
                approvedBy: userId,
                reason: approvalDto.reason,
                timestamp: new Date(),
            });
            // Log audit
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'change_order',
                    entityId: id,
                    action: approvalDto.action === approve_change_order_dto_1.ApprovalAction.APPROVE ? 'approved' : 'rejected',
                    actor: userId,
                    metadata: { reason: approvalDto.reason },
                },
            });
            return updated;
        }
        async markImplemented(id, userId) {
            const changeOrder = await this.prisma.changeOrder.findUnique({
                where: { id },
                select: { id: true, status: true, projectId: true },
            });
            if (!changeOrder) {
                throw new common_1.NotFoundException('Change order not found');
            }
            if (changeOrder.status !== create_change_order_dto_1.ChangeOrderStatus.APPROVED) {
                throw new common_1.BadRequestException('Only approved change orders can be marked as implemented');
            }
            const updated = await this.prisma.changeOrder.update({
                where: { id },
                data: { status: create_change_order_dto_1.ChangeOrderStatus.IMPLEMENTED },
            });
            // Emit event
            this.eventEmitter.emit('change_order.implemented', {
                changeOrderId: id,
                projectId: changeOrder.projectId,
                userId,
                timestamp: new Date(),
            });
            // Log audit
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'change_order',
                    entityId: id,
                    action: 'implemented',
                    actor: userId,
                },
            });
            return updated;
        }
        async getPendingApprovals(clientId) {
            return this.prisma.changeOrder.findMany({
                where: {
                    status: create_change_order_dto_1.ChangeOrderStatus.SUBMITTED,
                    project: {
                        clientId,
                    },
                },
                include: {
                    project: {
                        select: {
                            id: true,
                            title: true,
                        },
                    },
                },
                orderBy: { createdAt: 'desc' },
            });
        }
    };
    return ChangeOrdersService = _classThis;
})();
exports.ChangeOrdersService = ChangeOrdersService;
//# sourceMappingURL=change-orders.service.js.map