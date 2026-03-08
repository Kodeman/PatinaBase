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
exports.TimelineService = void 0;
const common_1 = require("@nestjs/common");
let TimelineService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var TimelineService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            TimelineService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        prisma;
        eventEmitter;
        logger = new common_1.Logger(TimelineService.name);
        constructor(prisma, eventEmitter) {
            this.prisma = prisma;
            this.eventEmitter = eventEmitter;
        }
        /**
         * Create a new timeline segment for a project
         */
        async createSegment(projectId, createDto, userId) {
            // Verify project exists
            const project = await this.prisma.project.findUnique({
                where: { id: projectId },
                select: { id: true, clientId: true, designerId: true },
            });
            if (!project) {
                throw new common_1.NotFoundException('Project not found');
            }
            // Validate dependencies if provided
            if (createDto.dependencies && createDto.dependencies.length > 0) {
                const existingSegments = await this.prisma.timelineSegment.findMany({
                    where: {
                        projectId,
                        id: { in: createDto.dependencies },
                    },
                    select: { id: true },
                });
                if (existingSegments.length !== createDto.dependencies.length) {
                    throw new common_1.BadRequestException('One or more dependency segments not found');
                }
            }
            const segment = await this.prisma.timelineSegment.create({
                data: {
                    projectId,
                    title: createDto.title,
                    description: createDto.description,
                    phase: createDto.phase,
                    startDate: new Date(createDto.startDate),
                    endDate: new Date(createDto.endDate),
                    progress: createDto.progress || 0,
                    dependencies: createDto.dependencies || [],
                    deliverables: createDto.deliverables || [],
                    order: createDto.order ?? 0,
                    metadata: createDto.metadata,
                },
                include: {
                    approvals: {
                        where: { status: 'pending' },
                        orderBy: { dueDate: 'asc' },
                    },
                },
            });
            // Emit event
            this.eventEmitter.emit('timeline.segment.created', {
                projectId,
                segmentId: segment.id,
                clientId: project.clientId,
                userId,
                timestamp: new Date(),
            });
            // Log audit
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'timeline_segment',
                    entityId: segment.id,
                    action: 'created',
                    actor: userId,
                    metadata: { projectId },
                },
            });
            return segment;
        }
        /**
         * Get full timeline for a project
         */
        async getProjectTimeline(projectId) {
            const project = await this.prisma.project.findUnique({
                where: { id: projectId },
                select: { id: true, startDate: true, endDate: true, status: true },
            });
            if (!project) {
                throw new common_1.NotFoundException('Project not found');
            }
            const segments = await this.prisma.timelineSegment.findMany({
                where: { projectId },
                orderBy: { order: 'asc' },
                include: {
                    approvals: {
                        where: { status: { in: ['pending', 'needs_discussion'] } },
                        orderBy: { dueDate: 'asc' },
                    },
                    _count: {
                        select: {
                            activities: true,
                            approvals: true,
                        },
                    },
                },
            });
            // Calculate overall timeline progress
            const totalProgress = segments.length > 0
                ? Math.round(segments.reduce((sum, seg) => sum + seg.progress, 0) / segments.length)
                : 0;
            return {
                projectId,
                projectStatus: project.status,
                startDate: project.startDate,
                endDate: project.endDate,
                overallProgress: totalProgress,
                segmentCount: segments.length,
                segments,
            };
        }
        /**
         * Get specific timeline segment with details
         */
        async getSegment(projectId, segmentId) {
            const segment = await this.prisma.timelineSegment.findFirst({
                where: {
                    id: segmentId,
                    projectId,
                },
                include: {
                    approvals: {
                        orderBy: { createdAt: 'desc' },
                    },
                    activities: {
                        orderBy: { createdAt: 'desc' },
                        take: 50, // Recent activities
                    },
                    _count: {
                        select: {
                            activities: true,
                            approvals: true,
                        },
                    },
                },
            });
            if (!segment) {
                throw new common_1.NotFoundException('Timeline segment not found');
            }
            // Get dependent segments
            let dependentSegments = [];
            if (segment.dependencies && Array.isArray(segment.dependencies) && segment.dependencies.length > 0) {
                dependentSegments = await this.prisma.timelineSegment.findMany({
                    where: {
                        id: { in: segment.dependencies },
                    },
                    select: {
                        id: true,
                        title: true,
                        status: true,
                        progress: true,
                        endDate: true,
                    },
                });
            }
            return {
                ...segment,
                dependentSegments,
            };
        }
        /**
         * Update timeline segment
         */
        async updateSegment(projectId, segmentId, updateDto, userId) {
            const existing = await this.prisma.timelineSegment.findFirst({
                where: {
                    id: segmentId,
                    projectId,
                },
                select: { id: true, status: true, progress: true },
            });
            if (!existing) {
                throw new common_1.NotFoundException('Timeline segment not found');
            }
            const updated = await this.prisma.timelineSegment.update({
                where: { id: segmentId },
                data: {
                    title: updateDto.title,
                    description: updateDto.description,
                    phase: updateDto.phase,
                    startDate: updateDto.startDate ? new Date(updateDto.startDate) : undefined,
                    endDate: updateDto.endDate ? new Date(updateDto.endDate) : undefined,
                    status: updateDto.status,
                    progress: updateDto.progress,
                    dependencies: updateDto.dependencies,
                    deliverables: updateDto.deliverables,
                    order: updateDto.order,
                    metadata: updateDto.metadata,
                },
            });
            // Emit event if status or progress changed significantly
            if ((updateDto.status && updateDto.status !== existing.status) ||
                (updateDto.progress !== undefined && Math.abs(updateDto.progress - existing.progress) >= 10)) {
                this.eventEmitter.emit('timeline.segment.updated', {
                    projectId,
                    segmentId,
                    oldStatus: existing.status,
                    newStatus: updateDto.status,
                    oldProgress: existing.progress,
                    newProgress: updateDto.progress,
                    userId,
                    timestamp: new Date(),
                });
            }
            // Log audit
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'timeline_segment',
                    entityId: segmentId,
                    action: 'updated',
                    actor: userId,
                    changes: updateDto,
                },
            });
            return updated;
        }
        /**
         * Log client activity
         */
        async logActivity(projectId, logDto, userId, ipAddress, userAgent) {
            // Verify project exists
            const project = await this.prisma.project.findUnique({
                where: { id: projectId },
                select: { id: true, clientId: true },
            });
            if (!project) {
                throw new common_1.NotFoundException('Project not found');
            }
            const activity = await this.prisma.clientActivity.create({
                data: {
                    projectId,
                    segmentId: logDto.segmentId,
                    userId,
                    activityType: logDto.activityType,
                    entityType: logDto.entityType,
                    entityId: logDto.entityId,
                    duration: logDto.duration,
                    metadata: logDto.metadata,
                    ipAddress,
                    userAgent,
                },
            });
            // Update engagement metrics asynchronously
            this.updateEngagementMetrics(projectId, userId, logDto.activityType, logDto.duration).catch(err => {
                this.logger.error(`Failed to update engagement metrics: ${err.message}`);
            });
            // Emit real-time event
            this.eventEmitter.emit('activity.logged', {
                projectId,
                userId,
                activityType: logDto.activityType,
                timestamp: new Date(),
            });
            return activity;
        }
        /**
         * Get upcoming events/milestones for a project
         */
        async getUpcomingEvents(projectId, daysAhead = 30) {
            const project = await this.prisma.project.findUnique({
                where: { id: projectId },
                select: { id: true },
            });
            if (!project) {
                throw new common_1.NotFoundException('Project not found');
            }
            const now = new Date();
            const futureDate = new Date();
            futureDate.setDate(futureDate.getDate() + daysAhead);
            // Get upcoming segment start/end dates
            const upcomingSegments = await this.prisma.timelineSegment.findMany({
                where: {
                    projectId,
                    OR: [
                        {
                            startDate: {
                                gte: now,
                                lte: futureDate,
                            },
                        },
                        {
                            endDate: {
                                gte: now,
                                lte: futureDate,
                            },
                        },
                    ],
                },
                orderBy: { startDate: 'asc' },
                select: {
                    id: true,
                    title: true,
                    phase: true,
                    startDate: true,
                    endDate: true,
                    status: true,
                },
            });
            // Get upcoming milestones
            const upcomingMilestones = await this.prisma.milestone.findMany({
                where: {
                    projectId,
                    targetDate: {
                        gte: now,
                        lte: futureDate,
                    },
                    status: { in: ['pending', 'delayed'] },
                },
                orderBy: { targetDate: 'asc' },
            });
            // Get pending approvals with due dates
            const pendingApprovals = await this.prisma.approvalRecord.findMany({
                where: {
                    projectId,
                    status: 'pending',
                    dueDate: {
                        gte: now,
                        lte: futureDate,
                    },
                },
                orderBy: { dueDate: 'asc' },
            });
            return {
                segments: upcomingSegments,
                milestones: upcomingMilestones,
                approvals: pendingApprovals,
            };
        }
        /**
         * Calculate and return progress metrics for a project
         */
        async getProgressMetrics(projectId) {
            const project = await this.prisma.project.findUnique({
                where: { id: projectId },
                select: {
                    id: true,
                    startDate: true,
                    endDate: true,
                    status: true,
                },
            });
            if (!project) {
                throw new common_1.NotFoundException('Project not found');
            }
            // Get all segments with their progress
            const segments = await this.prisma.timelineSegment.findMany({
                where: { projectId },
                select: {
                    phase: true,
                    progress: true,
                    status: true,
                },
            });
            // Calculate overall progress
            const overallProgress = segments.length > 0
                ? Math.round(segments.reduce((sum, seg) => sum + seg.progress, 0) / segments.length)
                : 0;
            // Progress by phase
            const progressByPhase = segments.reduce((acc, seg) => {
                if (!acc[seg.phase]) {
                    acc[seg.phase] = { total: 0, count: 0 };
                }
                acc[seg.phase].total += seg.progress;
                acc[seg.phase].count += 1;
                return acc;
            }, {});
            const phaseProgress = Object.entries(progressByPhase).reduce((acc, [phase, data]) => {
                acc[phase] = Math.round(data.total / data.count);
                return acc;
            }, {});
            // Status distribution
            const statusDistribution = segments.reduce((acc, seg) => {
                acc[seg.status] = (acc[seg.status] || 0) + 1;
                return acc;
            }, {});
            // Calculate time progress
            let timeProgress = 0;
            if (project.startDate && project.endDate) {
                const totalDuration = project.endDate.getTime() - project.startDate.getTime();
                const elapsed = Date.now() - project.startDate.getTime();
                timeProgress = Math.min(100, Math.max(0, Math.round((elapsed / totalDuration) * 100)));
            }
            // Get milestone completion rate
            const milestones = await this.prisma.milestone.findMany({
                where: { projectId },
                select: { status: true },
            });
            const completedMilestones = milestones.filter(m => m.status === 'completed').length;
            const milestoneCompletionRate = milestones.length > 0
                ? Math.round((completedMilestones / milestones.length) * 100)
                : 0;
            return {
                overallProgress,
                phaseProgress,
                statusDistribution,
                timeProgress,
                milestoneCompletionRate,
                totalSegments: segments.length,
                totalMilestones: milestones.length,
                completedMilestones,
            };
        }
        /**
         * Private helper to update engagement metrics
         */
        async updateEngagementMetrics(projectId, userId, activityType, duration) {
            const project = await this.prisma.project.findUnique({
                where: { id: projectId },
                select: { clientId: true },
            });
            if (!project)
                return;
            // Upsert engagement metrics
            await this.prisma.engagementMetrics.upsert({
                where: { projectId },
                create: {
                    projectId,
                    clientId: project.clientId,
                    totalViews: activityType === 'view' ? 1 : 0,
                    totalTimeSpent: duration || 0,
                    lastActivity: new Date(),
                    commentsCount: activityType === 'comment' ? 1 : 0,
                    approvalsCount: activityType === 'approve' ? 1 : 0,
                    rejectionsCount: activityType === 'reject' ? 1 : 0,
                    documentsViewed: activityType === 'view' ? 1 : 0,
                    documentsDownloaded: activityType === 'download' ? 1 : 0,
                },
                update: {
                    totalViews: activityType === 'view' ? { increment: 1 } : undefined,
                    totalTimeSpent: duration ? { increment: duration } : undefined,
                    lastActivity: new Date(),
                    commentsCount: activityType === 'comment' ? { increment: 1 } : undefined,
                    approvalsCount: activityType === 'approve' ? { increment: 1 } : undefined,
                    rejectionsCount: activityType === 'reject' ? { increment: 1 } : undefined,
                    documentsViewed: activityType === 'view' ? { increment: 1 } : undefined,
                    documentsDownloaded: activityType === 'download' ? { increment: 1 } : undefined,
                },
            });
        }
    };
    return TimelineService = _classThis;
})();
exports.TimelineService = TimelineService;
//# sourceMappingURL=timeline.service.js.map