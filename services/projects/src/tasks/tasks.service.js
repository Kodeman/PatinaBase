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
exports.TasksService = void 0;
const common_1 = require("@nestjs/common");
const create_task_dto_1 = require("./dto/create-task.dto");
let TasksService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var TasksService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            TasksService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        prisma;
        eventEmitter;
        logger = new common_1.Logger(TasksService.name);
        constructor(prisma, eventEmitter) {
            this.prisma = prisma;
            this.eventEmitter = eventEmitter;
        }
        async create(projectId, createDto, userId) {
            // Verify project exists
            const project = await this.prisma.project.findUnique({
                where: { id: projectId },
                select: { id: true, status: true },
            });
            if (!project) {
                throw new common_1.NotFoundException('Project not found');
            }
            if (project.status === 'closed') {
                throw new common_1.BadRequestException('Cannot add tasks to a closed project');
            }
            const task = await this.prisma.task.create({
                data: {
                    ...createDto,
                    projectId,
                },
            });
            // Emit event
            this.eventEmitter.emit('task.created', {
                taskId: task.id,
                projectId,
                assigneeId: task.assigneeId,
                userId,
                timestamp: new Date(),
            });
            // Log audit
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'task',
                    entityId: task.id,
                    action: 'created',
                    actor: userId,
                    metadata: { projectId },
                },
            });
            return task;
        }
        async findAll(projectId, status) {
            const where = { projectId };
            if (status) {
                where.status = status;
            }
            return this.prisma.task.findMany({
                where,
                orderBy: [{ order: 'asc' }, { createdAt: 'desc' }],
            });
        }
        async findOne(id) {
            const task = await this.prisma.task.findUnique({
                where: { id },
                include: {
                    project: {
                        select: {
                            id: true,
                            title: true,
                            status: true,
                        },
                    },
                },
            });
            if (!task) {
                throw new common_1.NotFoundException('Task not found');
            }
            return task;
        }
        async update(id, updateDto, userId) {
            const existing = await this.prisma.task.findUnique({
                where: { id },
                select: { id: true, status: true, projectId: true },
            });
            if (!existing) {
                throw new common_1.NotFoundException('Task not found');
            }
            // Validate status transition
            if (updateDto.status) {
                this.validateStatusTransition(existing.status, updateDto.status);
            }
            const task = await this.prisma.task.update({
                where: { id },
                data: {
                    ...updateDto,
                    completedAt: updateDto.status === create_task_dto_1.TaskStatus.DONE ? new Date() : undefined,
                },
            });
            // Emit event if status changed
            if (updateDto.status && updateDto.status !== existing.status) {
                this.eventEmitter.emit('task.status_changed', {
                    taskId: id,
                    projectId: existing.projectId,
                    oldStatus: existing.status,
                    newStatus: updateDto.status,
                    userId,
                    timestamp: new Date(),
                });
                // Special event for completion
                if (updateDto.status === create_task_dto_1.TaskStatus.DONE) {
                    this.eventEmitter.emit('task.completed', {
                        taskId: id,
                        projectId: existing.projectId,
                        userId,
                        timestamp: new Date(),
                    });
                }
            }
            // Log audit
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'task',
                    entityId: id,
                    action: 'updated',
                    actor: userId,
                    changes: updateDto,
                },
            });
            return task;
        }
        async remove(id, userId) {
            const existing = await this.prisma.task.findUnique({
                where: { id },
                select: { id: true, projectId: true },
            });
            if (!existing) {
                throw new common_1.NotFoundException('Task not found');
            }
            await this.prisma.task.delete({
                where: { id },
            });
            // Emit event
            this.eventEmitter.emit('task.deleted', {
                taskId: id,
                projectId: existing.projectId,
                userId,
                timestamp: new Date(),
            });
            // Log audit
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'task',
                    entityId: id,
                    action: 'deleted',
                    actor: userId,
                    metadata: { projectId: existing.projectId },
                },
            });
            return { message: 'Task deleted successfully' };
        }
        async bulkUpdateStatus(projectId, taskIds, status, userId) {
            // Verify all tasks belong to project
            const tasks = await this.prisma.task.findMany({
                where: {
                    id: { in: taskIds },
                    projectId,
                },
                select: { id: true },
            });
            if (tasks.length !== taskIds.length) {
                throw new common_1.BadRequestException('Some tasks not found or do not belong to this project');
            }
            const updated = await this.prisma.task.updateMany({
                where: {
                    id: { in: taskIds },
                },
                data: {
                    status,
                    completedAt: status === create_task_dto_1.TaskStatus.DONE ? new Date() : undefined,
                },
            });
            // Emit bulk event
            this.eventEmitter.emit('task.bulk_updated', {
                projectId,
                taskIds,
                status,
                userId,
                timestamp: new Date(),
            });
            return { updated: updated.count, taskIds };
        }
        validateStatusTransition(currentStatus, newStatus) {
            const validTransitions = {
                todo: ['in_progress', 'cancelled'],
                in_progress: ['blocked', 'done', 'todo', 'cancelled'],
                blocked: ['in_progress', 'cancelled'],
                done: ['in_progress'], // Allow reopening
                cancelled: ['todo'], // Allow uncancelling
            };
            const allowed = validTransitions[currentStatus];
            if (!allowed || !allowed.includes(newStatus)) {
                throw new common_1.BadRequestException(`Invalid status transition from '${currentStatus}' to '${newStatus}'`);
            }
        }
    };
    return TasksService = _classThis;
})();
exports.TasksService = TasksService;
//# sourceMappingURL=tasks.service.js.map