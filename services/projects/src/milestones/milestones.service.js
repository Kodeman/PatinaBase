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
exports.MilestonesService = void 0;
const common_1 = require("@nestjs/common");
const update_milestone_dto_1 = require("./dto/update-milestone.dto");
let MilestonesService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var MilestonesService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            MilestonesService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        prisma;
        eventEmitter;
        logger = new common_1.Logger(MilestonesService.name);
        constructor(prisma, eventEmitter) {
            this.prisma = prisma;
            this.eventEmitter = eventEmitter;
        }
        async create(projectId, createDto, userId) {
            const project = await this.prisma.project.findUnique({
                where: { id: projectId },
                select: { id: true },
            });
            if (!project) {
                throw new common_1.NotFoundException('Project not found');
            }
            const milestone = await this.prisma.milestone.create({
                data: {
                    ...createDto,
                    projectId,
                    targetDate: new Date(createDto.targetDate),
                },
            });
            this.eventEmitter.emit('milestone.created', {
                milestoneId: milestone.id,
                projectId,
                userId,
                timestamp: new Date(),
            });
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'milestone',
                    entityId: milestone.id,
                    action: 'created',
                    actor: userId,
                    metadata: { projectId },
                },
            });
            return milestone;
        }
        async findAll(projectId) {
            return this.prisma.milestone.findMany({
                where: { projectId },
                orderBy: { order: 'asc' },
            });
        }
        async findOne(id) {
            const milestone = await this.prisma.milestone.findUnique({
                where: { id },
                include: {
                    project: {
                        select: { id: true, title: true },
                    },
                },
            });
            if (!milestone) {
                throw new common_1.NotFoundException('Milestone not found');
            }
            return milestone;
        }
        async update(id, updateDto, userId) {
            const existing = await this.prisma.milestone.findUnique({
                where: { id },
                select: { id: true, status: true, projectId: true },
            });
            if (!existing) {
                throw new common_1.NotFoundException('Milestone not found');
            }
            const milestone = await this.prisma.milestone.update({
                where: { id },
                data: {
                    ...updateDto,
                    targetDate: updateDto.targetDate ? new Date(updateDto.targetDate) : undefined,
                    completedAt: updateDto.status === update_milestone_dto_1.MilestoneStatus.COMPLETED ? new Date() : undefined,
                },
            });
            if (updateDto.status && updateDto.status !== existing.status) {
                this.eventEmitter.emit('milestone.status_changed', {
                    milestoneId: id,
                    projectId: existing.projectId,
                    oldStatus: existing.status,
                    newStatus: updateDto.status,
                    userId,
                    timestamp: new Date(),
                });
                if (updateDto.status === update_milestone_dto_1.MilestoneStatus.COMPLETED) {
                    this.eventEmitter.emit('milestone.completed', {
                        milestoneId: id,
                        projectId: existing.projectId,
                        userId,
                        timestamp: new Date(),
                    });
                }
            }
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'milestone',
                    entityId: id,
                    action: 'updated',
                    actor: userId,
                    changes: updateDto,
                },
            });
            return milestone;
        }
        async remove(id, userId) {
            const existing = await this.prisma.milestone.findUnique({
                where: { id },
                select: { id: true, projectId: true },
            });
            if (!existing) {
                throw new common_1.NotFoundException('Milestone not found');
            }
            await this.prisma.milestone.delete({
                where: { id },
            });
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'milestone',
                    entityId: id,
                    action: 'deleted',
                    actor: userId,
                    metadata: { projectId: existing.projectId },
                },
            });
            return { message: 'Milestone deleted successfully' };
        }
    };
    return MilestonesService = _classThis;
})();
exports.MilestonesService = MilestonesService;
//# sourceMappingURL=milestones.service.js.map