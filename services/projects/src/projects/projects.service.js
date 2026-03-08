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
exports.ProjectsService = void 0;
const common_1 = require("@nestjs/common");
const cache_1 = require("@patina/cache");
const decimal_js_1 = require("decimal.js");
const PROJECT_DETAIL_TTL = 300;
const PROJECT_LIST_TTL = 60;
const PROJECT_STATS_TTL = 120;
const PROJECT_PROGRESS_TTL = 120;
const PROJECT_CLIENT_VIEW_TTL = 300;
const PROJECT_ACTIVITY_TTL = 45;
const PROJECT_UPCOMING_TTL = 60;
let ProjectsService = (() => {
    let _classDecorators = [(0, common_1.Injectable)()];
    let _classDescriptor;
    let _classExtraInitializers = [];
    let _classThis;
    var ProjectsService = class {
        static { _classThis = this; }
        static {
            const _metadata = typeof Symbol === "function" && Symbol.metadata ? Object.create(null) : void 0;
            __esDecorate(null, _classDescriptor = { value: _classThis }, _classDecorators, { kind: "class", name: _classThis.name, metadata: _metadata }, null, _classExtraInitializers);
            ProjectsService = _classThis = _classDescriptor.value;
            if (_metadata) Object.defineProperty(_classThis, Symbol.metadata, { enumerable: true, configurable: true, writable: true, value: _metadata });
            __runInitializers(_classThis, _classExtraInitializers);
        }
        prisma;
        eventEmitter;
        cacheService;
        logger = new common_1.Logger(ProjectsService.name);
        constructor(prisma, eventEmitter, cacheService) {
            this.prisma = prisma;
            this.eventEmitter = eventEmitter;
            this.cacheService = cacheService;
        }
        async create(createDto, userId) {
            const { proposalId, budget, ...data } = createDto;
            let proposalData = null;
            // If creating from proposal, fetch proposal data
            if (proposalId) {
                try {
                    // In production, call proposals service
                    // proposalData = await this.fetchProposalData(proposalId);
                    this.logger.log(`Creating project from proposal: ${proposalId}`);
                }
                catch (error) {
                    throw new common_1.BadRequestException('Failed to fetch proposal data');
                }
            }
            // Create project
            const project = await this.prisma.project.create({
                data: {
                    ...data,
                    proposalId,
                    budget: budget ? new decimal_js_1.Decimal(budget) : null,
                    status: 'draft',
                },
                include: {
                    tasks: true,
                    rfis: true,
                    changeOrders: true,
                    issues: true,
                    milestones: true,
                },
            });
            // Emit event
            this.eventEmitter.emit('project.created', {
                projectId: project.id,
                clientId: project.clientId,
                designerId: project.designerId,
                userId,
                timestamp: new Date(),
            });
            // Log audit
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'project',
                    entityId: project.id,
                    action: 'created',
                    actor: userId,
                    metadata: { proposalId },
                },
            });
            await this.cacheService.invalidateProject(project.id);
            return project;
        }
        async findAll(query, userId, userRole) {
            const { clientId, designerId, status, page = 1, limit = 20 } = query;
            const cacheKey = (0, cache_1.buildProjectCacheKey)('list', {
                userId,
                role: userRole,
                filters: { clientId, designerId, status },
                page,
                limit,
            });
            return this.cacheService.wrap(cacheKey, async () => {
                const skip = (page - 1) * limit;
                const where = {};
                if (userRole === 'client') {
                    where.clientId = userId;
                }
                else if (userRole === 'designer') {
                    where.designerId = userId;
                }
                if (clientId)
                    where.clientId = clientId;
                if (designerId)
                    where.designerId = designerId;
                if (status)
                    where.status = status;
                const [projects, total] = await Promise.all([
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
                    data: projects,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages: Math.ceil(total / limit),
                    },
                };
            }, PROJECT_LIST_TTL);
        }
        async findOne(id) {
            const cacheKey = (0, cache_1.buildProjectCacheKey)('detail', { projectId: id });
            return this.cacheService.wrap(cacheKey, async () => {
                const project = await this.prisma.project.findUnique({
                    where: { id },
                    include: {
                        tasks: {
                            orderBy: { order: 'asc' },
                            take: 10, // Limit for overview
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
                if (!project) {
                    throw new common_1.NotFoundException('Project not found');
                }
                return project;
            }, PROJECT_DETAIL_TTL);
        }
        async update(id, updateDto, userId) {
            const existing = await this.prisma.project.findUnique({
                where: { id },
                select: { id: true, status: true },
            });
            if (!existing) {
                throw new common_1.NotFoundException('Project not found');
            }
            const { budget, ...data } = updateDto;
            const updated = await this.prisma.project.update({
                where: { id },
                data: {
                    ...data,
                    budget: budget ? new decimal_js_1.Decimal(budget) : undefined,
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
            // Emit event if status changed
            if (updateDto.status && updateDto.status !== existing.status) {
                this.eventEmitter.emit('project.status_changed', {
                    projectId: id,
                    oldStatus: existing.status,
                    newStatus: updateDto.status,
                    userId,
                    timestamp: new Date(),
                });
            }
            // Log audit
            await this.prisma.auditLog.create({
                data: {
                    entityType: 'project',
                    entityId: id,
                    action: 'updated',
                    actor: userId,
                    changes: updateDto,
                },
            });
            await this.cacheService.invalidateProject(id);
            return updated;
        }
        async getStats(id) {
            const cacheKey = (0, cache_1.buildProjectCacheKey)('stats', { projectId: id });
            return this.cacheService.wrap(cacheKey, async () => {
                const project = await this.prisma.project.findUnique({
                    where: { id },
                    select: { id: true },
                });
                if (!project) {
                    throw new common_1.NotFoundException('Project not found');
                }
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
            }, PROJECT_STATS_TTL);
        }
        /**
         * Get projects by multiple IDs (bulk fetch)
         */
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
        /**
         * Get client-safe project data (filtered for client portal)
         */
        async getClientSafeData(projectId, clientId) {
            const cacheKey = (0, cache_1.buildProjectCacheKey)('client-view', { projectId, clientId });
            return this.cacheService.wrap(cacheKey, async () => {
                const project = await this.prisma.project.findFirst({
                    where: {
                        id: projectId,
                        clientId, // Ensure client owns this project
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
                                // Only show documents marked for client viewing
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
                if (!project) {
                    throw new common_1.NotFoundException('Project not found or access denied');
                }
                const segments = project.timelineSegments;
                const overallProgress = segments.length > 0
                    ? Math.round(segments.reduce((sum, seg) => sum + seg.progress, 0) / segments.length)
                    : 0;
                const pendingApprovalsCount = project.approvalRecords.filter(a => a.status === 'pending' || a.status === 'needs_discussion').length;
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
            }, PROJECT_CLIENT_VIEW_TTL);
        }
        /**
         * Calculate comprehensive project progress
         */
        async calculateProgress(projectId) {
            const cacheKey = (0, cache_1.buildProjectCacheKey)('progress', { projectId });
            return this.cacheService.wrap(cacheKey, async () => {
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
                const segments = await this.prisma.timelineSegment.findMany({
                    where: { projectId },
                    select: { progress: true, phase: true, status: true },
                });
                const totalProgress = segments.length > 0
                    ? Math.round(segments.reduce((sum, seg) => sum + seg.progress, 0) / segments.length)
                    : 0;
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
                let timeProgress = 0;
                let daysElapsed = 0;
                let daysRemaining = 0;
                let totalDuration = 0;
                if (project.startDate && project.endDate) {
                    const now = Date.now();
                    const start = project.startDate.getTime();
                    const end = project.endDate.getTime();
                    totalDuration = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
                    daysElapsed = Math.ceil((now - start) / (1000 * 60 * 60 * 24));
                    daysRemaining = Math.ceil((end - now) / (1000 * 60 * 60 * 24));
                    timeProgress = Math.min(100, Math.max(0, Math.round((daysElapsed / totalDuration) * 100)));
                }
                const [totalTasks, completedTasks] = await Promise.all([
                    this.prisma.task.count({ where: { projectId } }),
                    this.prisma.task.count({ where: { projectId, status: 'done' } }),
                ]);
                const taskCompletionRate = totalTasks > 0
                    ? Math.round((completedTasks / totalTasks) * 100)
                    : 0;
                const [totalMilestones, completedMilestones] = await Promise.all([
                    this.prisma.milestone.count({ where: { projectId } }),
                    this.prisma.milestone.count({ where: { projectId, status: 'completed' } }),
                ]);
                const milestoneCompletionRate = totalMilestones > 0
                    ? Math.round((completedMilestones / totalMilestones) * 100)
                    : 0;
                const isOnSchedule = timeProgress <= totalProgress + 10; // Within 10% tolerance
                const isBehindSchedule = totalProgress < timeProgress - 10;
                const isAheadOfSchedule = totalProgress > timeProgress + 10;
                return {
                    projectId,
                    status: project.status,
                    overallProgress: totalProgress,
                    phaseProgress,
                    timeProgress,
                    taskCompletionRate,
                    milestoneCompletionRate,
                    timeline: {
                        totalDuration,
                        daysElapsed,
                        daysRemaining,
                        startDate: project.startDate,
                        endDate: project.endDate,
                    },
                    health: {
                        isOnSchedule,
                        isBehindSchedule,
                        isAheadOfSchedule,
                    },
                    metrics: {
                        totalSegments: segments.length,
                        totalTasks,
                        completedTasks,
                        totalMilestones,
                        completedMilestones,
                    },
                };
            }, PROJECT_PROGRESS_TTL);
        }
        /**
         * Generate activity feed for a project
         */
        async getActivityFeed(projectId, limit = 50, offset = 0) {
            const cacheKey = (0, cache_1.buildProjectCacheKey)('activity', {
                projectId,
                limit,
                offset,
            });
            return this.cacheService.wrap(cacheKey, async () => {
                const project = await this.prisma.project.findUnique({
                    where: { id: projectId },
                    select: { id: true },
                });
                if (!project) {
                    throw new common_1.NotFoundException('Project not found');
                }
                const activities = await this.prisma.auditLog.findMany({
                    where: {
                        OR: [
                            { entityType: 'project', entityId: projectId },
                            { entityType: 'timeline_segment', metadata: { path: ['projectId'], equals: projectId } },
                            { entityType: 'approval_record', metadata: { path: ['projectId'], equals: projectId } },
                            { entityType: 'task' },
                            { entityType: 'milestone' },
                            { entityType: 'change_order' },
                            { entityType: 'rfi' },
                            { entityType: 'issue' },
                            { entityType: 'daily_log' },
                        ],
                    },
                    orderBy: { createdAt: 'desc' },
                    take: limit,
                    skip: offset,
                });
                const clientActivities = await this.prisma.clientActivity.findMany({
                    where: { projectId },
                    orderBy: { createdAt: 'desc' },
                    take: Math.floor(limit / 2),
                });
                const allActivities = [
                    ...activities.map(a => ({
                        id: a.id,
                        type: 'audit',
                        entityType: a.entityType,
                        action: a.action,
                        actor: a.actor,
                        timestamp: a.createdAt,
                        metadata: a.metadata,
                    })),
                    ...clientActivities.map(a => ({
                        id: a.id,
                        type: 'client_activity',
                        activityType: a.activityType,
                        userId: a.userId,
                        entityType: a.entityType,
                        entityId: a.entityId,
                        timestamp: a.createdAt,
                        duration: a.duration,
                    })),
                ].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
                return {
                    activities: allActivities.slice(0, limit),
                    total: allActivities.length,
                    hasMore: allActivities.length > limit,
                };
            }, PROJECT_ACTIVITY_TTL);
        }
        /**
         * Get upcoming events and deadlines for a project
         */
        async getUpcomingEvents(projectId, daysAhead = 30) {
            const cacheKey = (0, cache_1.buildProjectCacheKey)('upcoming', { projectId, daysAhead });
            return this.cacheService.wrap(cacheKey, async () => {
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
                const [upcomingMilestones, upcomingTasks, upcomingApprovals, upcomingSegments] = await Promise.all([
                    this.prisma.milestone.findMany({
                        where: {
                            projectId,
                            targetDate: { gte: now, lte: futureDate },
                            status: { in: ['pending', 'delayed'] },
                        },
                        orderBy: { targetDate: 'asc' },
                    }),
                    this.prisma.task.findMany({
                        where: {
                            projectId,
                            dueDate: { gte: now, lte: futureDate },
                            status: { notIn: ['done', 'cancelled'] },
                        },
                        orderBy: { dueDate: 'asc' },
                    }),
                    this.prisma.approvalRecord.findMany({
                        where: {
                            projectId,
                            dueDate: { gte: now, lte: futureDate },
                            status: { in: ['pending', 'needs_discussion'] },
                        },
                        orderBy: { dueDate: 'asc' },
                    }),
                    this.prisma.timelineSegment.findMany({
                        where: {
                            projectId,
                            OR: [
                                { startDate: { gte: now, lte: futureDate } },
                                { endDate: { gte: now, lte: futureDate } },
                            ],
                        },
                        orderBy: { startDate: 'asc' },
                    }),
                ]);
                return {
                    milestones: upcomingMilestones,
                    tasks: upcomingTasks,
                    approvals: upcomingApprovals,
                    segments: upcomingSegments,
                    totalEvents: upcomingMilestones.length + upcomingTasks.length + upcomingApprovals.length,
                };
            }, PROJECT_UPCOMING_TTL);
        }
    };
    return ProjectsService = _classThis;
})();
exports.ProjectsService = ProjectsService;
//# sourceMappingURL=projects.service.js.map