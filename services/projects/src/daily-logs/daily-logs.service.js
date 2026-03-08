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
exports.DailyLogsService = void 0;
const common_1 = require("@nestjs/common");
let DailyLogsService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var DailyLogsService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            DailyLogsService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        prisma;
        eventEmitter;
        logger = new common_1.Logger(DailyLogsService.name);
        constructor(prisma, eventEmitter) {
            this.prisma = prisma;
            this.eventEmitter = eventEmitter;
        }
        async create(projectId, createDto, authorId) {
            const project = await this.prisma.project.findUnique({
                where: { id: projectId },
                select: { id: true },
            });
            if (!project) {
                throw new common_1.NotFoundException('Project not found');
            }
            // Check if log already exists for this date
            const existing = await this.prisma.dailyLog.findUnique({
                where: {
                    projectId_date: {
                        projectId,
                        date: new Date(createDto.date),
                    },
                },
            });
            if (existing) {
                throw new common_1.ConflictException('Daily log already exists for this date');
            }
            const log = await this.prisma.dailyLog.create({
                data: {
                    projectId,
                    authorId,
                    date: new Date(createDto.date),
                    notes: createDto.notes,
                    weather: createDto.weather,
                    photos: createDto.photos || [],
                    attendees: createDto.attendees || [],
                    activities: createDto.activities || [],
                },
            });
            this.eventEmitter.emit('log.created', {
                logId: log.id,
                projectId,
                authorId,
                timestamp: new Date(),
            });
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'daily_log',
                    entityId: log.id,
                    action: 'created',
                    actor: authorId,
                    metadata: { projectId, date: createDto.date },
                },
            });
            return log;
        }
        async findAll(projectId, startDate, endDate) {
            const where = { projectId };
            if (startDate || endDate) {
                where.date = {};
                if (startDate)
                    where.date.gte = new Date(startDate);
                if (endDate)
                    where.date.lte = new Date(endDate);
            }
            return this.prisma.dailyLog.findMany({
                where,
                orderBy: { date: 'desc' },
            });
        }
        async findOne(id) {
            const log = await this.prisma.dailyLog.findUnique({
                where: { id },
                include: {
                    project: {
                        select: { id: true, title: true },
                    },
                },
            });
            if (!log) {
                throw new common_1.NotFoundException('Daily log not found');
            }
            return log;
        }
        async update(id, updateDto, userId) {
            const existing = await this.prisma.dailyLog.findUnique({
                where: { id },
                select: { id: true, authorId: true, projectId: true },
            });
            if (!existing) {
                throw new common_1.NotFoundException('Daily log not found');
            }
            const log = await this.prisma.dailyLog.update({
                where: { id },
                data: {
                    notes: updateDto.notes,
                    weather: updateDto.weather,
                    photos: updateDto.photos,
                    attendees: updateDto.attendees,
                    activities: updateDto.activities,
                },
            });
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'daily_log',
                    entityId: id,
                    action: 'updated',
                    actor: userId,
                    changes: updateDto,
                },
            });
            return log;
        }
    };
    return DailyLogsService = _classThis;
})();
exports.DailyLogsService = DailyLogsService;
//# sourceMappingURL=daily-logs.service.js.map