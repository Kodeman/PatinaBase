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
exports.IssuesService = void 0;
const common_1 = require("@nestjs/common");
const create_issue_dto_1 = require("./dto/create-issue.dto");
let IssuesService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var IssuesService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            IssuesService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        prisma;
        eventEmitter;
        logger = new common_1.Logger(IssuesService.name);
        constructor(prisma, eventEmitter) {
            this.prisma = prisma;
            this.eventEmitter = eventEmitter;
        }
        async create(projectId, createDto, reportedBy) {
            const project = await this.prisma.project.findUnique({
                where: { id: projectId },
                select: { id: true },
            });
            if (!project) {
                throw new common_1.NotFoundException('Project not found');
            }
            const issue = await this.prisma.issue.create({
                data: {
                    ...createDto,
                    projectId,
                    reportedBy,
                },
            });
            this.eventEmitter.emit('issue.created', {
                issueId: issue.id,
                projectId,
                severity: issue.severity,
                reportedBy,
                timestamp: new Date(),
            });
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'issue',
                    entityId: issue.id,
                    action: 'created',
                    actor: reportedBy,
                    metadata: { projectId },
                },
            });
            return issue;
        }
        async findAll(projectId, status) {
            const where = { projectId };
            if (status) {
                where.status = status;
            }
            return this.prisma.issue.findMany({
                where,
                orderBy: [
                    { severity: 'desc' },
                    { createdAt: 'desc' },
                ],
            });
        }
        async findOne(id) {
            const issue = await this.prisma.issue.findUnique({
                where: { id },
                include: {
                    project: {
                        select: { id: true, title: true },
                    },
                },
            });
            if (!issue) {
                throw new common_1.NotFoundException('Issue not found');
            }
            return issue;
        }
        async update(id, updateDto, userId) {
            const existing = await this.prisma.issue.findUnique({
                where: { id },
                select: { id: true, status: true, projectId: true },
            });
            if (!existing) {
                throw new common_1.NotFoundException('Issue not found');
            }
            const issue = await this.prisma.issue.update({
                where: { id },
                data: {
                    ...updateDto,
                    resolvedAt: updateDto.status === create_issue_dto_1.IssueStatus.RESOLVED ? new Date() : undefined,
                },
            });
            if (updateDto.status && updateDto.status !== existing.status) {
                this.eventEmitter.emit('issue.status_changed', {
                    issueId: id,
                    projectId: existing.projectId,
                    oldStatus: existing.status,
                    newStatus: updateDto.status,
                    userId,
                    timestamp: new Date(),
                });
                if (updateDto.status === create_issue_dto_1.IssueStatus.RESOLVED) {
                    this.eventEmitter.emit('issue.resolved', {
                        issueId: id,
                        projectId: existing.projectId,
                        userId,
                        timestamp: new Date(),
                    });
                }
            }
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'issue',
                    entityId: id,
                    action: 'updated',
                    actor: userId,
                    changes: updateDto,
                },
            });
            return issue;
        }
    };
    return IssuesService = _classThis;
})();
exports.IssuesService = IssuesService;
//# sourceMappingURL=issues.service.js.map